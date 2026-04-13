import { useEffect, useMemo, useRef, useState } from "react";
import { Download } from "lucide-react";
import { useOutletContext } from "react-router-dom";
import Card from "../components/Card";
import SampleDownloadLink from "../components/SampleDownloadLink";
import UploadDropzone from "../components/UploadDropzone";
import { api, apiHealthCheck, downloadApiFileWithRetry, uploadFile } from "../lib/api";
import type { LabelJob, MeResponse } from "../lib/types";
import { useJobPolling } from "../lib/useJobPolling";
import * as XLSX from "xlsx";

type ShellCtx = { me: MeResponse | null; refreshMe: () => Promise<void> };

type PreviewMode = "labels" | "envelope" | "flyer";

const STRICT_UPLOAD_COLUMNS = [
  "shipperName",
  "shipperPhone",
  "shipperAddress",
  "shipperEmail",
  "senderCity",
  "consigneeName",
  "consigneeEmail",
  "consigneePhone",
  "consigneeAddress",
  "receiverCity",
  "CollectAmount",
  "ordered",
  "ProductDescription",
  "Weight",
  "shipmenttype",
  "numberOfPieces",
  "TrackingID",
] as const;

function normalizeTrackingId(input: unknown) {
  return String(input ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

function isValidTrackingId(input: unknown) {
  const trackingId = normalizeTrackingId(input);
  return /^VPL\d{8,9}$/.test(trackingId);
}

export default function Upload() {
  const { refreshMe } = useOutletContext<ShellCtx>();

  const [file, setFile] = useState<File | null>(null);
  const [jobs, setJobs] = useState<LabelJob[]>([]);

  // Tracking & Barcode Configuration (structured)
  const [carrierType, setCarrierType] = useState<"pakistan_post" | "courier" | null>(null);
  const [ppCategory, setPpCategory] = useState<"general_post" | "value_payable" | "cod_articles" | null>(null);
  const [shipmentType, setShipmentType] = useState<"RL" | "UMS" | "PAR" | "VPL" | "VPP" | "COD" | "COURIER" | null>(null);
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
      setShipmentType("RL");
    }
    if (ppCategory === "value_payable" && (shipmentType === null || shipmentType === "RL" || shipmentType === "UMS" || shipmentType === "PAR" || shipmentType === "COD")) {
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
          shipmentType: shipmentType ?? "VPL",
          includeMoneyOrders: String(Boolean(includeMoneyOrders && eligibleForMoneyOrder)),
          barcodeMode: barcodeMode ?? "manual",
        })
      : api<{ html: string }>(
          `/api/jobs/preview/labels?${new URLSearchParams({
            outputMode,
            carrierType: carrierType ?? "pakistan_post",
            shipmentType: shipmentType ?? "VPL",
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

  async function downloadPdf(jobId: string, kind: "labels" | "money-orders") {
    try {
      const blob = await downloadApiFileWithRetry(`/api/jobs/${jobId}/download/${kind}`, kind === "money-orders" ? 6 : 1, 350);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${kind}-${jobId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
      setUiError(err instanceof Error ? err.message : "Failed to download file");
    }
  }

  const latest = useMemo(() => jobs[0] ?? null, [jobs]);
  const activeJob = useMemo(() => (polling.jobId ? jobs.find((j) => j.id === polling.jobId) ?? null : null), [jobs, polling.jobId]);

  useEffect(() => {
    // Auto-trigger download ONLY for the job started in this session (prevents surprise downloads + stale errors on page load)
    if (!polling.jobId) return;
    if (polling.jobStatus !== "COMPLETED") return;
    if (polling.jobId === lastAutoDownloadId.current) return;

    lastAutoDownloadId.current = polling.jobId;
    downloadPdf(polling.jobId, "labels");
    if (activeJob?.includeMoneyOrders) setTimeout(() => downloadPdf(polling.jobId!, "money-orders"), 1000);
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
      const normalize = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, "");
      const headers = Object.keys(rows[0] ?? {});
      const normalizedHeaders = new Set(headers.map(normalize));
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
      const missingHeaders = STRICT_UPLOAD_COLUMNS.filter((c) => !normalizedHeaders.has(normalize(c)));
      if (missingHeaders.length > 0) {
        throw new Error(`Missing required columns: ${missingHeaders.join(", ")}`);
      }

      for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i] ?? {};
        const find = (name: string) => {
          const n = normalize(name);
          const key = Object.keys(row).find((k) => normalize(k) === n);
          return key ? row[key] : "";
        };
        const consigneeName = String(find("consigneeName") ?? "").trim();
        const consigneePhone = String(find("consigneePhone") ?? "").trim();
        const consigneeAddress = String(find("consigneeAddress") ?? "").trim();
        if (!consigneeName || !consigneePhone || !consigneeAddress) {
          throw new Error(`Row ${i + 2}: consigneeName, consigneePhone, and consigneeAddress are required.`);
        }
      }

      const isAuto = barcodeMode === "auto";
      const autoModeChecked = isAuto && Boolean(includeMoneyOrders && eligibleForMoneyOrder);
      if (autoModeChecked) {
        console.log("Auto Mode: Tracking + MO generated");
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
    <div className="grid gap-6">
      <div className="min-w-0 space-y-6">
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
        <UploadDropzone
          title="Upload Orders File"
          subtitle="CSV/XLS/XLSX supported with strict shared columns. Configure options below, then generate labels."
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

        <Card className="p-5">
          <div className="text-base font-medium text-gray-900">Generate Label</div>
          <div className="mt-0.5 text-xs text-gray-500">All actions consume units based on usage.</div>
          <div className="mt-4 space-y-5 text-sm text-gray-700">
            <div>
              <div className="font-medium text-gray-900">1) Carrier Type</div>
              <div className="mt-2 flex flex-wrap gap-3">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="carrierType"
                    checked={carrierType === "pakistan_post"}
                    onChange={() => setCarrierType("pakistan_post")}
                    className="h-4 w-4 border-gray-300 text-indigo-600 focus:ring-indigo-600"
                  />
                  Pakistan Post
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="carrierType"
                    checked={carrierType === "courier"}
                    onChange={() => setCarrierType("courier")}
                    className="h-4 w-4 border-gray-300 text-indigo-600 focus:ring-indigo-600"
                  />
                  Courier
                </label>
              </div>
            </div>

            <div>
              <div className="font-medium text-gray-900">2) Category</div>
              <div className="mt-2 text-sm text-gray-600">Available across carriers. Pakistan Post uses this selection to preset shipment options.</div>
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
                    className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                      ppCategory === c.id ? "border-indigo-600 bg-indigo-50 text-indigo-700" : "bg-white text-gray-700 hover:bg-gray-50"
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
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {(["RL", "UMS", "PAR"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setShipmentType(t)}
                      className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                        shipmentType === t ? "border-indigo-600 bg-indigo-50 text-indigo-700" : "bg-white text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      {t === "RL" ? "RGL" : t}
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
                      className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                        shipmentType === t ? "border-indigo-600 bg-indigo-50 text-indigo-700" : "bg-white text-gray-700 hover:bg-gray-50"
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
                    className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                      shipmentType === "COD" ? "border-indigo-600 bg-indigo-50 text-indigo-700" : "bg-white text-gray-700 hover:bg-gray-50"
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
                    className="h-4 w-4 border-gray-300 text-indigo-600 focus:ring-indigo-600"
                  />
                  Manual (from file)
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="barcodeMode"
                    checked={barcodeMode === "auto"}
                    onChange={() => setBarcodeMode("auto")}
                    className="h-4 w-4 border-gray-300 text-indigo-600 focus:ring-indigo-600"
                  />
                  Auto Generate
                </label>
              </div>
              {barcodeMode === "auto" && (
                <div className="mt-2 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs text-indigo-700">
                  <span className="font-semibold">Auto Generate Tracking ID / Barcode:</span> When enabled, the system preserves any valid uploaded TrackingID and only fills missing TrackingID values with a strict VPLYYMM0001 barcode.
                </div>
              )}
            </div>

            <div>
              <div className="font-medium text-gray-900">5) Output Mode</div>
              <div className="mt-3 grid grid-cols-1 items-start gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.85fr)]">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {([
                    { id: "envelope-9x4" as const, label: "Envelope 9x4", desc: "Dedicated 9 x 4 layout with right-side compact amount/barcode" },
                    { id: "box" as const, label: "Box Shipment (4 per A4)", desc: "4.1 x 5.8 inch, 2 x 2 grid on A4" },
                    { id: "flyer" as const, label: "Flyer Label (8 per A4)", desc: "105 x 74 mm, 2 x 4 grid, compact layout" },
                  ]).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setOutputMode(opt.id)}
                      className={`flex flex-col items-start rounded-xl border px-4 py-3 text-left transition-colors ${
                        outputMode === opt.id
                          ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-300"
                          : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
                      }`}
                    >
                      <span className={`text-sm font-semibold ${
                        outputMode === opt.id ? "text-indigo-700" : "text-gray-800"
                      }`}>
                        {opt.label}
                      </span>
                      <span className="mt-0.5 text-xs text-gray-500">{opt.desc}</span>
                    </button>
                  ))}
                </div>
                <div className="self-start rounded-xl border border-slate-200 bg-slate-50 p-4">
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
                  <div className="mt-3 rounded-lg border border-slate-300 bg-white p-2">
                    {!outputMode ? (
                      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-center text-sm text-slate-600">
                        Select an output mode to enable preview.
                      </div>
                    ) : previewLoading ? (
                      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-center text-sm text-slate-600">
                        Loading preview...
                      </div>
                    ) : previewError ? (
                      <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{previewError}</div>
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
                      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-center text-sm text-slate-600">
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
          <Card className="p-5">
            <div className="text-base font-medium text-gray-900">Generate Money Order</div>
            <div className="mt-0.5 text-xs text-gray-500">All actions consume units based on usage.</div>
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
                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600"
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

        <Card className="p-5">
          <div className="text-base font-medium text-gray-900">Track Parcel</div>
          <div className="mt-0.5 text-xs text-gray-500">All actions consume units based on usage.</div>
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
              className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600"
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

          <div className="space-y-4">
            <Card className="p-6">
              <div className="text-xl font-medium text-gray-900">CSV Format</div>
              <div className="mt-2 text-sm text-gray-600">Use the shared strict sample structure for Labels, Tracking, and Money Orders.</div>
              <SampleDownloadLink className="mt-4 inline-flex items-center justify-center rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white shadow-sm hover:bg-indigo-700" />
            </Card>
          </div>
        </div>

        <div>
        <Card className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xl font-medium text-gray-900">Generate Labels</div>
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
                className="rounded-lg bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
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
    </div>
  );
}
