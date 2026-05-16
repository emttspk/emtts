import { useEffect, useMemo, useRef, useState } from "react";
import { Download } from "lucide-react";
import { useNavigate, useOutletContext } from "react-router-dom";
import Card from "../components/Card";
import SampleDownloadLink from "../components/SampleDownloadLink";
import UploadDropzone from "../components/UploadDropzone";
import { api, apiHealthCheck, buildJobDownloadFallbackName, triggerBrowserDownload, uploadFile } from "../lib/api";
import type { LabelJob, MeResponse } from "../lib/types";
import { useJobPolling } from "../lib/useJobPolling";
import { getMissingOrderColumns, normalizeOrderColumnKey } from "../shared/orderColumns";
import * as XLSX from "xlsx";
import { BodyText, CardTitle, PageShell, PageTitle } from "../components/ui/PageSystem";

type ShellCtx = { me: MeResponse | null; refreshMe: () => Promise<void> };

type PreviewMode = "labels" | "envelope" | "flyer";

function normalizeTrackingId(input: unknown) {
  return String(input ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

function isValidTrackingId(input: unknown) {
  const trackingId = normalizeTrackingId(input);
  return /^[A-Z]{2,6}[0-9]{4,20}$/.test(trackingId);
}

export default function Upload() {
  const { me, refreshMe } = useOutletContext<ShellCtx>();
  const navigate = useNavigate();

  const [file, setFile] = useState<File | null>(null);
  const [jobs, setJobs] = useState<LabelJob[]>([]);

  // Tracking & Barcode Configuration (structured)
  const [carrierType, setCarrierType] = useState<"pakistan_post" | "courier" | null>(null);
  const [ppCategory, setPpCategory] = useState<"general_post" | "value_payable" | "cod_articles" | null>(null);
  const [shipmentType, setShipmentType] = useState<"RGL" | "IRL" | "UMS" | "PAR" | "VPL" | "VPP" | "COD" | "COURIER" | null>(null);
  const [barcodeMode, setBarcodeMode] = useState<"manual" | "auto" | null>(null);
  const [outputMode, setOutputMode] = useState<"envelope" | "envelope-9x4" | "box" | "a4-multi" | "flyer" | null>(null);
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewDocSize, setPreviewDocSize] = useState({ width: 794, height: 1123 });
  const [previewViewportWidth, setPreviewViewportWidth] = useState(0);

  // Money order (shipment-type gated)
  const [includeMoneyOrders, setIncludeMoneyOrders] = useState(false);
  const [trackAfterGenerate, setTrackAfterGenerate] = useState(false);
  const [showMoUnitNotice, setShowMoUnitNotice] = useState(false);
  const [showTrackUnitNotice, setShowTrackUnitNotice] = useState(false);
  const [showCnicRequiredModal, setShowCnicRequiredModal] = useState(false);
  const [prefixMismatchInfo, setPrefixMismatchInfo] = useState<{
    detected: string;
    expected: string;
    shipmentType: string;
    affected: Array<{ row: number; id: string }>;
    total: number;
  } | null>(null);

  const lastAutoDownloadId = useRef<string | null>(null);
  const previewViewportRef = useRef<HTMLDivElement | null>(null);
  const previewFrameRef = useRef<HTMLIFrameElement | null>(null);

  const eligibleForMoneyOrder =
    carrierType === "pakistan_post" && (shipmentType === "VPL" || shipmentType === "VPP" || shipmentType === "COD");
  const previewMode: PreviewMode = outputMode === "flyer" ? "flyer" : outputMode === "envelope" || outputMode === "envelope-9x4" ? "envelope" : "labels";

  const defaultPreviewSize = useMemo(
    () => (previewMode === "envelope" ? { width: 864, height: 384 } : { width: 794, height: 1123 }),
    [previewMode],
  );

  const previewScale = useMemo(() => {
    if (!previewViewportWidth || !previewDocSize.width) return 1;
    return Math.min(0.32, Math.max(0.12, (previewViewportWidth - 2) / previewDocSize.width));
  }, [previewDocSize.width, previewViewportWidth]);

  const scaledPreviewHeight = useMemo(
    () => Math.min(260, Math.max(150, Math.ceil(previewDocSize.height * previewScale))),
    [previewDocSize.height, previewScale],
  );

  const scaledPreviewWidth = useMemo(
    () => Math.max(220, Math.ceil(previewDocSize.width * previewScale)),
    [previewDocSize.width, previewScale],
  );

  const previewSummary = useMemo(() => {
    if (!previewHtml) return null;
    const a4PageCount = (previewHtml.match(/class="page"/g) ?? []).length;
    const flyerPageCount = (previewHtml.match(/class="fl-page"/g) ?? []).length;
    const envelopeCount = (previewHtml.match(/class="label-container"/g) ?? []).length;
    const pageCount = previewMode === "flyer" ? flyerPageCount : previewMode === "envelope" ? envelopeCount : a4PageCount;
    return pageCount > 0 ? pageCount : null;
  }, [previewHtml, previewMode]);

  useEffect(() => {
    // Courier: shipment type not applicable, but still must be present for readiness formula.
    if (carrierType === "courier") {
      if (!ppCategory) setPpCategory("general_post");
      setShipmentType("COURIER");
      setIncludeMoneyOrders(false);
    } else if (carrierType === "pakistan_post") {
      if (!ppCategory) setPpCategory("general_post");
      if (shipmentType === "COURIER") setShipmentType(null);
    } else if (carrierType === null) {
      setPpCategory(null);
      setShipmentType(null);
    }
  }, [carrierType]);

  useEffect(() => {
    if (carrierType !== "pakistan_post") return;
    if (!ppCategory) return;
    // Default shipment type per category
    if (ppCategory === "general_post" && (shipmentType === null || shipmentType === "VPL" || shipmentType === "VPP" || shipmentType === "COD")) {
      setShipmentType("RGL");
    }
    if (ppCategory === "value_payable" && shipmentType !== "VPL" && shipmentType !== "VPP") {
      setShipmentType("VPL");
    }
    if (ppCategory === "cod_articles" && shipmentType !== "COD") {
      setShipmentType("COD");
    }
  }, [carrierType, ppCategory]);

  useEffect(() => {
    if (!eligibleForMoneyOrder && includeMoneyOrders) setIncludeMoneyOrders(false);
  }, [eligibleForMoneyOrder, includeMoneyOrders]);

  useEffect(() => {
    let cancelled = false;

    if (!outputMode) {
      setPreviewHtml("");
      setPreviewError(null);
      setPreviewLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setPreviewDocSize(defaultPreviewSize);

    setPreviewLoading(true);
    setPreviewError(null);

    const loadPreview = file
      ? uploadFile("/api/jobs/preview/labels", file, {
          outputMode,
          carrierType: carrierType ?? "pakistan_post",
          shipmentType: shipmentType ?? "PAR",
          includeMoneyOrders: String(Boolean(includeMoneyOrders && eligibleForMoneyOrder)),
          barcodeMode: barcodeMode ?? "manual",
        })
      : api<{ html: string }>(
          `/api/jobs/preview/labels?${new URLSearchParams({
            outputMode,
            carrierType: carrierType ?? "pakistan_post",
            shipmentType: shipmentType ?? "PAR",
            includeMoneyOrders: String(Boolean(includeMoneyOrders && eligibleForMoneyOrder)),
          }).toString()}`,
        );

    Promise.resolve(loadPreview)
      .then((data) => {
        if (cancelled) return;
        setPreviewHtml(data.html);
      })
      .catch((error) => {
        if (cancelled) return;
        setPreviewHtml("");
        setPreviewError(error instanceof Error ? error.message : "Failed to load preview");
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [barcodeMode, carrierType, defaultPreviewSize, eligibleForMoneyOrder, file, includeMoneyOrders, outputMode, shipmentType]);

  useEffect(() => {
    const node = previewViewportRef.current;
    if (!node) return;

    const updateSize = () => {
      setPreviewViewportWidth(node.clientWidth);
    };

    updateSize();
    const observer = new ResizeObserver(() => updateSize());
    observer.observe(node);
    return () => observer.disconnect();
  }, [outputMode, previewHtml]);

  async function refreshJobs() {
    const data = await api<{ jobs: LabelJob[] }>("/api/jobs");
    setJobs(data.jobs);
  }

  const polling = useJobPolling({
    refreshJobs: async () => {
      await refreshJobs();
      await refreshMe();
    },
  });

  useEffect(() => {
    refreshJobs().catch(() => {});
  }, []);

  function downloadPdf(jobId: string, kind: "labels" | "money-orders") {
    const fallbackName = buildJobDownloadFallbackName(kind);
    triggerBrowserDownload(`/api/jobs/${jobId}/download/${kind}`, fallbackName);
  }

  const latest = useMemo(() => jobs[0] ?? null, [jobs]);
  const activeJob = useMemo(() => (polling.jobId ? jobs.find((j) => j.id === polling.jobId) ?? null : null), [jobs, polling.jobId]);

  useEffect(() => {
    // Auto-trigger download ONLY for the job started in this session (prevents surprise downloads + stale errors on page load)
    if (!polling.jobId) return;
    if (polling.jobStatus !== "COMPLETED") return;
    if (polling.jobId === lastAutoDownloadId.current) return;

    lastAutoDownloadId.current = polling.jobId;
    console.log("[AUTO_DOWNLOAD_TRIGGERED]", polling.jobId);
    downloadPdf(polling.jobId, "labels");
    if (activeJob?.includeMoneyOrders) {
      window.setTimeout(() => downloadPdf(polling.jobId!, "money-orders"), 600);
    }
  }, [activeJob?.includeMoneyOrders, polling.jobId, polling.jobStatus]);

  const isReadyToGenerate = Boolean(file && carrierType && shipmentType && barcodeMode && outputMode);

  const missing = useMemo(() => {
    const m: string[] = [];
    if (!file) m.push("File uploaded");
    if (!carrierType) m.push("Carrier selected");
    if (!barcodeMode) m.push("Barcode mode selected");
    if (!shipmentType) m.push("Shipment type selected");
    if (!outputMode) m.push("Output mode selected");
    return m;
  }, [barcodeMode, carrierType, file, outputMode, shipmentType]);

  // Generation state for countdown + silent downloads
  const [uiState, setUiState] = useState<"idle" | "uploading" | "processing" | "completed" | "failed">("idle");
  const [uiError, setUiError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [estimatedTotalSec, setEstimatedTotalSec] = useState<number | null>(null);
  const progressTimer = useRef<number | null>(null);
  const stateRef = useRef(uiState);

  useEffect(() => {
    stateRef.current = uiState;
  }, [uiState]);

  useEffect(() => {
    return () => {
      if (progressTimer.current) window.clearInterval(progressTimer.current);
    };
  }, []);

  useEffect(() => {
    let timer: number | null = null;
    if (uiState === "uploading" || uiState === "processing") {
      timer = window.setInterval(() => setElapsed((e) => e + 1), 1000);
    }
    return () => {
      if (timer) window.clearInterval(timer);
    };
  }, [uiState]);

  const remaining = useMemo(() => {
    if (estimatedTotalSec == null) return null;
    return Math.max(0, Math.ceil(estimatedTotalSec - elapsed));
  }, [elapsed, estimatedTotalSec]);

  useEffect(() => {
    if (estimatedTotalSec != null) return;
    if (!activeJob?.recordCount) return;
    if (uiState !== "processing" && uiState !== "uploading") return;
    setEstimatedTotalSec(Math.max(5, Math.ceil(activeJob.recordCount * 0.4)));
  }, [activeJob?.recordCount, estimatedTotalSec, uiState]);

  const statusLabel = useMemo(() => {
    if (uiState === "uploading") return "Uploading";
    if (uiState === "processing") return remaining == null ? "Processing" : `Estimated time remaining: ${remaining} sec`;
    if (uiState === "completed") return "Completed";
    if (uiState === "failed") return "Failed";
    return "Ready";
  }, [remaining, uiState]);

  async function startGenerate() {
    if (!file) return;
    if (!isReadyToGenerate) return;
    if (uiState === "uploading" || uiState === "processing") return;
    setUiError(null);
    setUiState("uploading");
    setProgress(10);
    setElapsed(0);
    setEstimatedTotalSec(null);

    if (progressTimer.current) window.clearInterval(progressTimer.current);
    progressTimer.current = window.setInterval(() => {
      setProgress((p) => {
        if (stateRef.current === "processing") return Math.min(98, p + 1);
        return Math.min(85, p + 6);
      });
    }, 120);

    try {
      await apiHealthCheck();

      // Frontend pre-check only: header names are case-insensitive but must map to strict fields.
      const uploadedFile = file;
      console.log("Tracking file received:", uploadedFile?.name);
      const ab = await uploadedFile.arrayBuffer();
      const wb = XLSX.read(ab);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { raw: false, defval: "" });
      const headers = Object.keys(rows[0] ?? {});
      const normalizedHeaders = new Set(headers.map(normalizeOrderColumnKey));
      if (normalizedHeaders.has("bookingcity")) {
        normalizedHeaders.add("sendercity");
      }
      if (normalizedHeaders.has("consigneecity")) {
        normalizedHeaders.add("receivercity");
      }
      if (normalizedHeaders.has("orderid")) {
        normalizedHeaders.add("ordered");
      }
      if (normalizedHeaders.has("shipment_type")) {
        normalizedHeaders.add("shipmenttype");
      }
      const missingHeaders = getMissingOrderColumns(headers);
      if (missingHeaders.length > 0) {
        throw new Error(`Missing required columns: ${missingHeaders.join(", ")}`);
      }

      for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i] ?? {};
        const find = (name: string) => {
          const n = normalizeOrderColumnKey(name);
          const key = Object.keys(row).find((k) => normalizeOrderColumnKey(k) === n);
          return key ? row[key] : "";
        };
        const consigneeName = String(find("consigneeName") ?? "").trim();
        const consigneePhone = String(find("consigneePhone") ?? "").trim();
        const consigneeAddress = String(find("consigneeAddress") ?? "").trim();
        if (!consigneeName || !consigneePhone || !consigneeAddress) {
          throw new Error(`Row ${i + 2}: consigneeName, consigneePhone, and consigneeAddress are required.`);
        }
      }

      // Prefix mismatch validation: only when barcodeMode=manual and shipmentType is known
      if (barcodeMode === "manual" && shipmentType && shipmentType !== "COURIER") {
        const prefixForType: Record<string, string> = {
          COD: "COD", VPL: "VPL", VPP: "VPP", IRL: "IRL", RGL: "RGL", UMS: "UMS", PAR: "PAR",
        };
        const expectedPrefix = prefixForType[String(shipmentType)];
        if (expectedPrefix) {
          const mismatchedRows: Array<{ row: number; trackingId: string; prefix: string }> = [];
          for (let i = 0; i < rows.length; i += 1) {
            const row = rows[i] ?? {};
            const findCol = (name: string) => {
              const n = normalizeOrderColumnKey(name);
              const key = Object.keys(row).find((k) => normalizeOrderColumnKey(k) === n);
              return key ? String(row[key] ?? "") : "";
            };
            const rawTracking = (findCol("TrackingID") || findCol("tracking_id") || findCol("barcode")).trim().toUpperCase().replace(/\s+/g, "");
            if (!rawTracking) continue;
            const detectedPrefix = rawTracking.match(/^([A-Z]+)/)?.[1] ?? "";
            if (detectedPrefix && !rawTracking.startsWith(expectedPrefix)) {
              mismatchedRows.push({ row: i + 2, trackingId: rawTracking, prefix: detectedPrefix });
            }
          }
          if (mismatchedRows.length > 0) {
            const detectedPrefixes = [...new Set(mismatchedRows.map((r) => r.prefix))].join(", ");
            setPrefixMismatchInfo({
              detected: detectedPrefixes,
              expected: expectedPrefix,
              shipmentType: String(shipmentType),
              affected: mismatchedRows.slice(0, 5).map((r) => ({ row: r.row, id: r.trackingId })),
              total: mismatchedRows.length,
            });
            setUiState("idle");
            setProgress(0);
            if (progressTimer.current) window.clearInterval(progressTimer.current);
            return;
          }
        }
      }

      const isAuto = barcodeMode === "auto";
      const requiresMoneyOrderCnic = Boolean(includeMoneyOrders && eligibleForMoneyOrder);
      if (requiresMoneyOrderCnic) {
        const hasCnic = /^\d{5}-\d{7}-\d$|^\d{13}$/.test(String(me?.user?.cnic ?? ""));
        if (!hasCnic) {
          setShowCnicRequiredModal(true);
          setUiState("idle");
          setProgress(0);
          if (progressTimer.current) window.clearInterval(progressTimer.current);
          return;
        }
      }

      const data = (await uploadFile("/api/upload", uploadedFile, {
          barcodeMode: isAuto ? "auto" : "manual",
          autoGenerateTracking: String(isAuto),
          carrierType: carrierType ?? "",
          shipmentType: String(shipmentType ?? ""),
          printMode: outputMode ?? "box",
          generateMoneyOrder: String(Boolean(includeMoneyOrders && eligibleForMoneyOrder)),
          trackAfterGenerate: String(trackAfterGenerate),
        })) as { jobId: string; recordCount: number };
      const count = Number(data.recordCount ?? 0);
      if (Number.isFinite(count) && count > 0) {
        setEstimatedTotalSec(Math.max(5, Math.ceil(count * 0.4)));
      }
      await refreshJobs();
      polling.start(data.jobId);
      setUiState("processing");
      setProgress(90);
    } catch (e) {
      setUiState("failed");
      setUiError(e instanceof Error ? e.message : "Upload failed");
      setProgress(100);
      if (progressTimer.current) window.clearInterval(progressTimer.current);
    }
  }

  useEffect(() => {
    if (!polling.jobStatus) return;
    if (uiState !== "processing" && (polling.jobStatus === "QUEUED" || polling.jobStatus === "PROCESSING")) {
      setUiState("processing");
    }
    if (polling.jobStatus === "COMPLETED") {
      setUiState("completed");
      setProgress(100);
      if (progressTimer.current) window.clearInterval(progressTimer.current);
    }
    if (polling.jobStatus === "FAILED") {
      setUiState("failed");
      setUiError(polling.jobError ?? "Generation failed");
      setProgress(100);
      if (progressTimer.current) window.clearInterval(progressTimer.current);
    }
  }, [polling.jobError, polling.jobStatus]);

  function syncPreviewFrameSize() {
    const iframe = previewFrameRef.current;
    const doc = iframe?.contentDocument;
    if (!doc) return;

    window.requestAnimationFrame(() => {
      const root = doc.documentElement;
      const body = doc.body;
      const width = Math.max(root?.scrollWidth ?? 0, body?.scrollWidth ?? 0, defaultPreviewSize.width);
      const height = Math.max(root?.scrollHeight ?? 0, body?.scrollHeight ?? 0, defaultPreviewSize.height);
      setPreviewDocSize({ width, height });
    });
  }

  return (
    <PageShell className="space-y-3">
    <div className="grid grid-cols-1 gap-3">
      <div className="min-w-0 w-full space-y-3">
        <div className="grid grid-cols-1 gap-3">
          <div className="space-y-3 min-w-0 w-full">
        <UploadDropzone
          title="Upload Orders File"
          subtitle="CSV/XLS/XLSX supported with strict shared columns. Configure options below, then generate labels."
          headerAction={<SampleDownloadLink className="inline-flex items-center justify-center rounded-2xl bg-brand px-3 py-2 text-xs font-medium text-white shadow-lg hover:bg-brand-dark" />}
          file={file}
          onFileChange={(next) => {
            setFile(next);
            setUiError(null);
            if (!next) {
              setUiState("idle");
              setProgress(0);
              setElapsed(0);
              setEstimatedTotalSec(null);
              polling.reset();
            }
          }}
          statusLabel={statusLabel}
          progress={progress}
          error={uiError}
          busy={uiState === "uploading" || uiState === "processing"}
        />

        <Card className="border-slate-200 bg-white p-5 shadow-sm">
          <CardTitle>Generate Label</CardTitle>
          <div className="mt-0.5 text-sm font-normal text-slate-500">All actions consume units based on usage.</div>
          <div className="mt-3 space-y-4 text-sm text-gray-700">
            <div>
              <div className="font-medium text-gray-900">1) Carrier Type</div>
              <div className="mt-2 flex flex-wrap gap-3">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="carrierType"
                    checked={carrierType === "pakistan_post"}
                    onChange={() => setCarrierType("pakistan_post")}
                    className="h-4 w-4 border-gray-300 text-brand focus:ring-brand"
                  />
                  Epost.pk
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="carrierType"
                    checked={carrierType === "courier"}
                    onChange={() => setCarrierType("courier")}
                    className="h-4 w-4 border-gray-300 text-brand focus:ring-brand"
                  />
                  Courier
                </label>
              </div>
            </div>

            <div>
              <div className="font-medium text-gray-900">2) Category</div>
              <div className="mt-2 text-sm text-gray-600">Available across carriers. Epost.pk uses this selection to preset shipment options.</div>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                {[
                  { id: "general_post", label: "General" },
                  { id: "value_payable", label: "Value Payable" },
                  { id: "cod_articles", label: "COD" },
                ].map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setPpCategory(c.id as any)}
                    className={`rounded-2xl border px-3 py-2 text-sm font-medium ${
                      ppCategory === c.id ? "border-brand bg-brand/10 text-brand" : "bg-white text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
                </div>
              </div>

            <div>
              <div className="font-medium text-gray-900">3) Shipment Type</div>
              {carrierType === "courier" ? (
                <div className="mt-2 text-sm text-gray-600">Courier selected (shipment type not required).</div>
              ) : carrierType !== "pakistan_post" ? (
                <div className="mt-2 text-sm text-gray-600">Select a carrier first.</div>
              ) : ppCategory === "general_post" ? (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {(["RGL", "IRL", "UMS", "PAR"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setShipmentType(t)}
                      className={`rounded-2xl border px-3 py-2 text-sm font-medium ${
                        shipmentType === t ? "border-brand bg-brand/10 text-brand" : "bg-white text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              ) : ppCategory === "value_payable" ? (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {(["VPL", "VPP"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setShipmentType(t)}
                      className={`rounded-2xl border px-3 py-2 text-sm font-medium ${
                        shipmentType === t ? "border-brand bg-brand/10 text-brand" : "bg-white text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              ) : ppCategory === "cod_articles" ? (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => setShipmentType("COD")}
                    className={`rounded-2xl border px-3 py-2 text-sm font-medium ${
                      shipmentType === "COD" ? "border-brand bg-brand/10 text-brand" : "bg-white text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    COD
                  </button>
                </div>
              ) : (
                <div className="mt-2 text-sm text-gray-600">Select a category.</div>
              )}
            </div>

            <div>
              <div className="font-medium text-gray-900">4) Barcode Mode</div>
              <div className="mt-2 flex flex-wrap gap-3">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="barcodeMode"
                    checked={barcodeMode === "manual"}
                    onChange={() => setBarcodeMode("manual")}
                    className="h-4 w-4 border-gray-300 text-brand focus:ring-brand"
                  />
                  Manual (from file)
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="barcodeMode"
                    checked={barcodeMode === "auto"}
                    onChange={() => setBarcodeMode("auto")}
                    className="h-4 w-4 border-gray-300 text-brand focus:ring-brand"
                  />
                  Auto Generate
                </label>
              </div>
              {barcodeMode === "auto" && (
                <div className="mt-2 rounded-2xl border border-brand/20 bg-brand/10 px-3 py-2 text-xs text-brand">
                  <span className="font-semibold">Auto Generate Tracking ID / Barcode:</span> When enabled, the system preserves any valid uploaded TrackingID and only fills missing TrackingID values using the selected shipment type prefix.
                </div>
              )}
            </div>

            <div>
              <div className="font-medium text-gray-900">5) Output Mode</div>
              <div className="mt-3 grid min-w-0 grid-cols-2 gap-0 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="grid min-w-0 grid-cols-1 gap-2 border-r border-slate-200 p-3 sm:grid-cols-2">
                  {([
                    { id: "envelope-9x4" as const, label: "Envelope 9x4", desc: "Dedicated 9 x 4 layout with right-side compact amount/barcode" },
                    { id: "box" as const, label: "Box Shipment (4 per A4)", desc: "4.1 x 5.8 inch, 2 x 2 grid on A4" },
                    { id: "flyer" as const, label: "Flyer Label (8 per A4)", desc: "105 x 74 mm, 2 x 4 grid, compact layout" },
                  ]).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setOutputMode(opt.id)}
                      className={`flex flex-col items-start rounded-2xl border px-4 py-3 text-left transition-colors ${
                        outputMode === opt.id
                          ? "border-brand bg-brand/10 ring-1 ring-brand/30"
                          : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
                      }`}
                    >
                      <span className={`text-sm font-semibold ${
                        outputMode === opt.id ? "text-brand" : "text-gray-800"
                      }`}>
                        {opt.label}
                      </span>
                      <span className="mt-0.5 text-xs text-gray-500">{opt.desc}</span>
                    </button>
                  ))}
                </div>
                <div className="flex min-w-0 flex-col p-3">
                  <div className="text-sm font-semibold text-slate-900">Preview</div>
                  <div className="mt-1 text-xs text-slate-600">
                    {previewMode === "labels"
                      ? "A4 thumbnail preview with a 2 x 2 label grid."
                      : previewMode === "flyer"
                        ? "A4 thumbnail preview with flyer labels."
                        : "Envelope preview shown inline in this section."}
                  </div>
                  {previewSummary ? (
                    <div className="mt-2 text-xs font-medium text-slate-500">
                      {previewMode === "envelope" ? `${previewSummary} record${previewSummary === 1 ? "" : "s"} in preview` : `${previewSummary} page${previewSummary === 1 ? "" : "s"} in preview`}
                    </div>
                  ) : null}
                  <div className="mt-3 flex-1 rounded-2xl border border-slate-300 bg-white p-2">
                    {!outputMode ? (
                      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-center text-sm text-slate-600">
                        Select an output mode to enable preview.
                      </div>
                    ) : previewLoading ? (
                      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-center text-sm text-slate-600">
                        Loading preview...
                      </div>
                    ) : previewError ? (
                      <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{previewError}</div>
                    ) : previewHtml ? (
                      <div ref={previewViewportRef} className="w-full overflow-x-hidden overflow-y-auto" style={{ maxHeight: 360, minHeight: 160 }}>
                        <div className="flex justify-center py-1">
                          <div
                            className="overflow-hidden rounded-md bg-white shadow-[0_10px_28px_rgba(15,23,42,0.12)]"
                            style={{ width: scaledPreviewWidth, height: scaledPreviewHeight }}
                          >
                            <iframe
                              ref={previewFrameRef}
                              title="Label preview"
                              srcDoc={previewHtml}
                              className="block border-0 bg-white"
                              sandbox="allow-same-origin"
                              onLoad={syncPreviewFrameSize}
                              style={{
                                width: previewDocSize.width,
                                height: previewDocSize.height,
                                transform: `scale(${previewScale})`,
                                transformOrigin: "top left",
                                display: "block",
                                pointerEvents: "none",
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-center text-sm text-slate-600">
                        Preview unavailable.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {eligibleForMoneyOrder ? (
          <Card className="border-slate-200 bg-white p-5 shadow-sm">
            <CardTitle>Generate Money Order</CardTitle>
            <div className="mt-0.5 text-sm font-normal text-slate-500">All actions consume units based on usage.</div>
            <div className="mt-2 text-sm text-gray-600">
              VPL/VPP include commission. COD has no commission.
            </div>
            <label className="mt-4 flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={includeMoneyOrders}
                onChange={(e) => {
                  setIncludeMoneyOrders(e.target.checked);
                  if (e.target.checked) {
                    setShowMoUnitNotice(true);
                  }
                }}
                className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand"
              />
              Generate Money Order PDF
            </label>
            {showMoUnitNotice && includeMoneyOrders ? (
              <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Standard unit consumption will be applied for this action.
              </div>
            ) : null}
          </Card>
        ) : null}

        <Card className="border-slate-200 bg-white p-5 shadow-sm">
          <CardTitle>Track Parcel</CardTitle>
          <div className="mt-0.5 text-sm font-normal text-slate-500">All actions consume units based on usage.</div>
          <div className="mt-2 text-sm text-gray-600">Tracking enabled from uploaded file.</div>
          <label className="mt-4 flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={trackAfterGenerate}
              onChange={(e) => {
                setTrackAfterGenerate(e.target.checked);
                if (e.target.checked) {
                  setShowTrackUnitNotice(true);
                }
              }}
              className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand"
            />
            Track shipments after generating labels
          </label>
          {showTrackUnitNotice && trackAfterGenerate ? (
            <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Standard unit consumption will be applied for this action.
            </div>
          ) : null}
        </Card>

          </div>
        </div>

        <div>
        <Card className="border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-xl">Generate Labels</CardTitle>
              <div className="mt-1 text-sm text-gray-600">
                Button is visible only when all required inputs are selected.
              </div>
              {!isReadyToGenerate ? (
                <div className="mt-3 text-sm text-gray-700">
                  <div className="font-medium">Missing:</div>
                  <ul className="mt-1 list-disc pl-5 text-gray-600">
                    {missing.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>

            <div className="flex flex-col items-end gap-2">
              <button
                type="button"
                onClick={startGenerate}
                disabled={!isReadyToGenerate || uiState === "uploading" || uiState === "processing"}
                className="rounded-2xl bg-brand px-6 py-3 text-sm font-semibold text-white shadow-md hover:bg-brand-dark disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Generate Labels
              </button>
              <div className="text-xs text-gray-600">{statusLabel}</div>
              {uiError ? <div className="text-xs font-medium text-red-600">{uiError}</div> : null}
            </div>
          </div>
        </Card>
        </div>
      </div>
      {prefixMismatchInfo ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-[0_30px_80px_rgba(15,23,42,0.28)]">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100">
                <svg className="h-5 w-5 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-base font-bold text-slate-900">Tracking ID Type Mismatch</div>
                <div className="mt-1 text-sm text-slate-600">Uploaded tracking IDs do not match the selected shipment type.</div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Selected Type</div>
                <div className="mt-1 text-lg font-extrabold text-slate-900">{prefixMismatchInfo.shipmentType}</div>
              </div>
              <div className="rounded-xl border border-red-100 bg-red-50 p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-red-500">Found in File</div>
                <div className="mt-1 text-lg font-extrabold text-red-700">{prefixMismatchInfo.detected}</div>
              </div>
            </div>
            <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Please either upload <span className="font-bold">{prefixMismatchInfo.shipmentType}</span> tracking IDs,
              or change the shipment type to <span className="font-bold">{prefixMismatchInfo.detected}</span>.
            </div>
            <div className="mt-2 text-xs text-slate-400">{prefixMismatchInfo.total} row{prefixMismatchInfo.total !== 1 ? "s" : ""} affected</div>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setPrefixMismatchInfo(null)}
                className="rounded-2xl bg-slate-900 px-5 py-2 text-sm font-semibold text-white shadow-md hover:bg-slate-800"
              >
                OK, Got It
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {showCnicRequiredModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-[0_30px_80px_rgba(15,23,42,0.28)]">
            <div className="text-lg font-semibold text-slate-900">CNIC required</div>
            <div className="mt-2 text-sm text-slate-600">CNIC is required before generating money order.</div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowCnicRequiredModal(false)}
                className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCnicRequiredModal(false);
                  navigate("/profile");
                }}
                className="rounded-2xl bg-brand px-4 py-2 text-sm font-semibold text-white shadow-md hover:bg-brand-dark"
              >
                Add CNIC
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
    </PageShell>
  );
}



