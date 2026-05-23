import { useEffect, useMemo, useRef, useState } from "react";
import { Download } from "lucide-react";
import { useNavigate, useOutletContext } from "react-router-dom";
import Card from "../components/Card";
import SampleDownloadLink from "../components/SampleDownloadLink";
import UploadDropzone from "../components/UploadDropzone";
import { api, apiHealthCheck, buildJobDownloadFallbackName, triggerBrowserDownload, uploadFile } from "../lib/api";
import { FALLBACK_SERVICE_CATALOG, fetchServiceCatalog, servicesByCategory, type ServiceCatalogEntry } from "../lib/serviceCatalog";
import type { LabelJob, MeResponse } from "../lib/types";
import { useJobPolling } from "../lib/useJobPolling";
import { getMissingOrderColumns, normalizeOrderColumnKey } from "../shared/orderColumns";
import * as XLSX from "xlsx";
import { BodyText, CardTitle, PageShell, PageTitle } from "../components/ui/PageSystem";

type ShellCtx = { me: MeResponse | null; refreshMe: () => Promise<void> };

type PreviewMode = "labels" | "envelope" | "flyer";
type ShipmentMode = "single_service" | "mix_articles";
type MismatchAction = "generate" | "use_uploaded";

type MismatchIssue = {
  row: number;
  uploadedTracking: string;
  detectedPrefix: string;
  detectedService: string | null;
  rowShipmentType: string;
  expectedPrefix: string;
};

type ValidationIssue = {
  row: number;
  severity: "error" | "warning";
  category: "Prefix mismatches" | "Invalid services" | "Duplicate tracking IDs" | "Overweight shipments" | "MO-ineligible services";
  message: string;
  tracking?: string;
  shipmentType?: string;
  recommendation?: string;
};

type UploadInsights = {
  rowCount: number;
  serviceCounts: Record<string, number>;
  moneyOrderEligibleRows: number;
  moneyOrderIneligibleRows: number;
  recommendedOutputMode: "envelope-9x4" | "universal-9x4" | "box" | "a4-multi" | "flyer";
  recommendationReason: string;
};

const SERVICE_WEIGHT_LIMITS: Record<string, number> = {
  VPL: 2_000,
  VPP: 30_000,
  COD: 30_000,
  RGL: 2_000,
  IRL: 2_000,
  UMS: 5_000,
};

function parseWeightToGrams(value: unknown) {
  const raw = String(value ?? "").trim().toLowerCase();
  const numeric = Number.parseFloat(raw.replace(/[^\d.]+/g, ""));
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  if (raw.includes("kg")) return Math.round(numeric * 1000);
  return Math.round(numeric);
}

function parseAmountValue(value: unknown) {
  const parsed = Number.parseFloat(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function suggestBestFitServices(weightGrams: number) {
  return Object.entries(SERVICE_WEIGHT_LIMITS)
    .filter(([, limit]) => limit >= weightGrams)
    .sort((a, b) => a[1] - b[1])
    .map(([service]) => service)
    .slice(0, 3);
}

function normalizeTrackingId(input: unknown) {
  return String(input ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

function escapeCsvValue(value: unknown) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function rowsToCsv(headers: string[], rows: Array<Record<string, unknown>>) {
  const normalizedHeaders = headers.length > 0 ? headers : Object.keys(rows[0] ?? {});
  const lines = [normalizedHeaders.map((header) => escapeCsvValue(header)).join(",")];
  for (const row of rows) {
    lines.push(normalizedHeaders.map((header) => escapeCsvValue(row[header])).join(","));
  }
  return lines.join("\n");
}

function isValidTrackingId(input: unknown) {
  const trackingId = normalizeTrackingId(input);
  return /^[A-Z]{2,6}[0-9]{4,20}$/.test(trackingId);
}

function getDetectedPrefix(trackingId: string) {
  const match = normalizeTrackingId(trackingId).match(/^([A-Z]{2,6})/);
  return match ? match[1] : "";
}

function isMoneyOrderEligible(service: unknown) {
  const normalized = String(service ?? "").trim().toUpperCase();
  return normalized === "VPL" || normalized === "VPP" || normalized === "COD";
}

function summarizeIssuesByCategory(issues: ValidationIssue[]) {
  return {
    prefixMismatches: issues.filter((item) => item.category === "Prefix mismatches"),
    invalidServices: issues.filter((item) => item.category === "Invalid services"),
    duplicateTracking: issues.filter((item) => item.category === "Duplicate tracking IDs"),
    overweightShipments: issues.filter((item) => item.category === "Overweight shipments"),
    moIneligibleServices: issues.filter((item) => item.category === "MO-ineligible services"),
  };
}

export default function Upload() {
  const { me, refreshMe } = useOutletContext<ShellCtx>();
  const navigate = useNavigate();

  const [file, setFile] = useState<File | null>(null);
  const [jobs, setJobs] = useState<LabelJob[]>([]);

  // Tracking & Barcode Configuration (structured)
  const [carrierType, setCarrierType] = useState<"pakistan_post" | "courier" | null>(null);
  const [shipmentMode, setShipmentMode] = useState<ShipmentMode>("single_service");
  const [ppCategory, setPpCategory] = useState<"general_post" | "value_payable" | "cod_articles" | null>(null);
  const [shipmentType, setShipmentType] = useState<string | null>(null);
  const [serviceCatalog, setServiceCatalog] = useState<ServiceCatalogEntry[]>(FALLBACK_SERVICE_CATALOG);
  const [barcodeMode, setBarcodeMode] = useState<"manual" | "auto" | null>(null);
  const [outputMode, setOutputMode] = useState<"envelope" | "envelope-9x4" | "universal-9x4" | "box" | "a4-multi" | "flyer" | null>(null);
  const [hasManualOutputChoice, setHasManualOutputChoice] = useState(false);
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
  const [showManualTrackingRequiredModal, setShowManualTrackingRequiredModal] = useState(false);
  const [uploadInsights, setUploadInsights] = useState<UploadInsights | null>(null);
  const [mismatchDecisionModal, setMismatchDecisionModal] = useState<MismatchIssue | null>(null);
  const [mismatchApplyScope, setMismatchApplyScope] = useState<"row" | "all">("row");
  const [validationSummary, setValidationSummary] = useState<{
    accepted: number;
    rejected: number;
    ignoredTracking: number;
    overweightWarnings: number;
    moIneligibleWarnings: number;
    duplicateFilenameBypassUsed: boolean;
    moEligibleRows: number;
    moSkippedRows: number;
    batchWarnings: string[];
    rejectedSummaryUrl: string | null;
    rejectedSummaryName: string | null;
    totalIssues: number;
    prefixMismatches: ValidationIssue[];
    invalidServices: ValidationIssue[];
    duplicateTracking: ValidationIssue[];
    overweightShipments: ValidationIssue[];
    moIneligibleServices: ValidationIssue[];
    recommendations: string[];
    rowErrors: string[];
    rowWarnings: string[];
  } | null>(null);

  const lastAutoDownloadId = useRef<string | null>(null);
  const previewViewportRef = useRef<HTMLDivElement | null>(null);
  const previewFrameRef = useRef<HTMLIFrameElement | null>(null);
  const mismatchResolverRef = useRef<((decision: { action: MismatchAction; scope: "row" | "all" } | null) => void) | null>(null);
  const canonicalServices = useMemo(
    () => new Set(serviceCatalog.map((entry) => String(entry.service).trim().toUpperCase())),
    [serviceCatalog],
  );

  const eligibleForMoneyOrder =
    carrierType === "pakistan_post" && (
      shipmentMode === "mix_articles"
        ? (uploadInsights?.moneyOrderEligibleRows ?? 0) > 0
        : isMoneyOrderEligible(shipmentType)
    );
  const generalServices = useMemo(() => servicesByCategory(serviceCatalog, "general_post"), [serviceCatalog]);
  const valuePayableServices = useMemo(() => servicesByCategory(serviceCatalog, "value_payable"), [serviceCatalog]);
  const codServices = useMemo(() => servicesByCategory(serviceCatalog, "cod_articles"), [serviceCatalog]);
  const previewMode: PreviewMode =
    outputMode === "flyer"
      ? "flyer"
      : outputMode === "envelope" || outputMode === "envelope-9x4" || outputMode === "universal-9x4"
        ? "envelope"
        : "labels";

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
    const universalCount = (previewHtml.match(/class="universal-page"/g) ?? []).length;
    const envelopeLikeCount = envelopeCount + universalCount;
    const pageCount = previewMode === "flyer" ? flyerPageCount : previewMode === "envelope" ? envelopeLikeCount : a4PageCount;
    return pageCount > 0 ? pageCount : null;
  }, [previewHtml, previewMode]);

  useEffect(() => {
    fetchServiceCatalog().then((services) => setServiceCatalog(services)).catch(() => undefined);
  }, []);

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
    const firstGeneral = generalServices[0] ?? "RGL";
    const firstValuePayable = valuePayableServices[0] ?? "VPL";
    const firstCod = codServices[0] ?? "COD";
    // Default shipment type per category
    if (ppCategory === "general_post" && (shipmentType === null || valuePayableServices.includes(shipmentType) || codServices.includes(shipmentType))) {
      setShipmentType(firstGeneral);
    }
    if (ppCategory === "value_payable" && !valuePayableServices.includes(shipmentType ?? "")) {
      setShipmentType(firstValuePayable);
    }
    if (ppCategory === "cod_articles" && !codServices.includes(shipmentType ?? "")) {
      setShipmentType(firstCod);
    }
  }, [carrierType, ppCategory, shipmentType, generalServices, valuePayableServices, codServices]);

  useEffect(() => {
    if (!eligibleForMoneyOrder && includeMoneyOrders) setIncludeMoneyOrders(false);
  }, [eligibleForMoneyOrder, includeMoneyOrders]);

  useEffect(() => {
    let cancelled = false;
    if (!file || carrierType !== "pakistan_post") {
      setUploadInsights(null);
      return () => {
        cancelled = true;
      };
    }

    const analyzeUpload = async () => {
      try {
        const ab = await file.arrayBuffer();
        const wb = XLSX.read(ab);
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { raw: false, defval: "" });
        const serviceCounts: Record<string, number> = {};
        let moEligibleRows = 0;
        let moIneligibleRows = 0;
        let overweightCount = 0;
        let smallEnvelopeLike = 0;
        let knownWeightRows = 0;
        const detectedServices = new Set<string>();

        for (const row of rows) {
          const shipment = String((row.shipment_type ?? row.shipmenttype ?? "")).trim().toUpperCase();
          if (shipment) {
            serviceCounts[shipment] = (serviceCounts[shipment] ?? 0) + 1;
            detectedServices.add(shipment);
          }
          if (isMoneyOrderEligible(shipment)) {
            moEligibleRows += 1;
          } else if (shipment) {
            moIneligibleRows += 1;
          }

          const grams = parseWeightToGrams(row.Weight);
          if (grams > 0) {
            knownWeightRows += 1;
            if (grams > 2_000) {
              overweightCount += 1;
            } else if (grams <= 500) {
              smallEnvelopeLike += 1;
            }
          }
        }

        const uniqueServices = Array.from(detectedServices);
        const onlyMoneyOrderServices = uniqueServices.length > 0
          && uniqueServices.every((svc) => isMoneyOrderEligible(svc));
        const detectedShipmentMode: ShipmentMode = uniqueServices.length > 1 ? "mix_articles" : "single_service";
        const detectedShipmentType = uniqueServices.length === 1 ? uniqueServices[0] : null;
        const detectedCategory: "general_post" | "value_payable" | "cod_articles" | null = detectedShipmentMode === "mix_articles"
          ? null
          : detectedShipmentType === "VPL" || detectedShipmentType === "VPP"
            ? "value_payable"
            : detectedShipmentType === "COD"
              ? "cod_articles"
              : "general_post";
        const mostlySmall = knownWeightRows > 0 && smallEnvelopeLike / knownWeightRows >= 0.75;
        const recommendedOutputMode: UploadInsights["recommendedOutputMode"] = overweightCount > 0
          ? "box"
          : mostlySmall
            ? "universal-9x4"
            : onlyMoneyOrderServices
              ? "envelope-9x4"
              : "box";

        const recommendationReason = overweightCount > 0
          ? "Detected overweight shipments, box mode is safer."
          : mostlySmall
            ? "Most rows are light-weight; universal 9x4 is recommended."
            : onlyMoneyOrderServices
              ? "Rows are VPL/VPP/COD; envelope 9x4 works best for labels + money orders."
              : "Mixed service profile detected; box mode is recommended.";

        console.info("UPLOAD_SMART_DETECTION", JSON.stringify({
          uniqueServices,
          detectedShipmentMode,
          detectedShipmentType,
          detectedCategory,
          moEligibleRows,
          moIneligibleRows,
          barcodeMode,
          recommendedOutputMode,
        }));

        setShipmentMode(detectedShipmentMode);
        if (detectedShipmentMode === "mix_articles") {
          setPpCategory(null);
          setShipmentType(null);
        } else {
          setPpCategory(detectedCategory);
          setShipmentType(detectedShipmentType);
        }

        if (cancelled) return;
        setUploadInsights({
          rowCount: rows.length,
          serviceCounts,
          moneyOrderEligibleRows: moEligibleRows,
          moneyOrderIneligibleRows: moIneligibleRows,
          recommendedOutputMode,
          recommendationReason,
        });

        if (!hasManualOutputChoice || !outputMode) {
          setOutputMode(recommendedOutputMode);
        }
        setIncludeMoneyOrders(moEligibleRows > 0);
      } catch {
        if (!cancelled) {
          setUploadInsights(null);
        }
      }
    };

    analyzeUpload();

    return () => {
      cancelled = true;
    };
  }, [carrierType, file, hasManualOutputChoice, outputMode]);

  function openMismatchDecision(issue: MismatchIssue) {
    setMismatchApplyScope("row");
    setMismatchDecisionModal(issue);
    return new Promise<{ action: MismatchAction; scope: "row" | "all" } | null>((resolve) => {
      mismatchResolverRef.current = resolve;
    });
  }

  function closeMismatchDecision(decision: { action: MismatchAction; scope: "row" | "all" } | null) {
    setMismatchDecisionModal(null);
    const resolver = mismatchResolverRef.current;
    mismatchResolverRef.current = null;
    if (resolver) resolver(decision);
  }

  useEffect(() => {
    let cancelled = false;
    const previewBarcodeMode = shipmentMode === "mix_articles" ? "auto" : (barcodeMode ?? "auto");

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
          shipmentType: shipmentMode === "mix_articles" ? "" : (shipmentType ?? "RGL"),
          shipmentMode,
          includeMoneyOrders: String(Boolean(includeMoneyOrders && eligibleForMoneyOrder)),
          barcodeMode: previewBarcodeMode,
        })
      : api<{ html: string }>(
          `/api/jobs/preview/labels?${new URLSearchParams({
            outputMode,
            carrierType: carrierType ?? "pakistan_post",
            shipmentType: shipmentMode === "mix_articles" ? "" : (shipmentType ?? "RGL"),
            shipmentMode,
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
  }, [barcodeMode, carrierType, defaultPreviewSize, eligibleForMoneyOrder, file, includeMoneyOrders, outputMode, shipmentMode, shipmentType]);

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

  const isReadyToGenerate = Boolean(
    file
      && carrierType
      && outputMode
      && (shipmentMode === "mix_articles" || barcodeMode)
      && (shipmentMode === "mix_articles" || shipmentType),
  );

  const missing = useMemo(() => {
    const m: string[] = [];
    if (!file) m.push("File uploaded");
    if (!carrierType) m.push("Carrier selected");
    if (!shipmentMode) m.push("Shipment mode selected");
    if (shipmentMode === "single_service" && !barcodeMode) m.push("Barcode mode selected");
    if (shipmentMode === "single_service" && !shipmentType) m.push("Shipment type selected");
    if (!outputMode) m.push("Output mode selected");
    return m;
  }, [barcodeMode, carrierType, file, outputMode, shipmentMode, shipmentType]);

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
    setValidationSummary(null);
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
      const effectiveBarcodeMode = shipmentMode === "mix_articles" ? "auto" : barcodeMode;

      if (shipmentMode === "single_service" && effectiveBarcodeMode === "manual") {
        const missingTrackingRows = rows.filter((row) => {
          const tracking = String(row.TrackingID ?? row.tracking_id ?? row.barcode ?? "").trim();
          return !tracking;
        });
        if (missingTrackingRows.length > 0) {
          setShowManualTrackingRequiredModal(true);
          setUiState("idle");
          setProgress(0);
          if (progressTimer.current) window.clearInterval(progressTimer.current);
          return;
        }
      }

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

      const rowErrors: string[] = [];
      const rowWarnings: string[] = [];
      const validationIssues: ValidationIssue[] = [];
      let ignoredTracking = 0;
      let overweightWarnings = 0;
      let moIneligibleWarnings = 0;
      const acceptedRows: Array<Record<string, unknown>> = [];
      const batchWarnings = new Set<string>();
      const duplicateTrackingMap = new Map<string, number>();
      const serviceByPrefix = new Map<string, string>();
      for (const entry of serviceCatalog) {
        if (entry.prefix && entry.service) {
          serviceByPrefix.set(String(entry.prefix).toUpperCase(), String(entry.service).toUpperCase());
        }
      }
      let applyAllMismatchAction: MismatchAction | null = null;

      for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i] ?? {};
        const workingRow: Record<string, unknown> = { ...row };
        const rowIndex = i + 2;
        const find = (name: string) => {
          const n = normalizeOrderColumnKey(name);
          const key = Object.keys(workingRow).find((k) => normalizeOrderColumnKey(k) === n);
          return key ? workingRow[key] : "";
        };
        const writeShipmentType = (value: string) => {
          const shipmentTypeKey = Object.keys(workingRow).find((k) => normalizeOrderColumnKey(k) === "shipmenttype");
          if (shipmentTypeKey) {
            workingRow[shipmentTypeKey] = value;
          } else {
            workingRow.shipment_type = value;
          }
        };

        const rowSpecificErrors: string[] = [];

        const consigneeName = String(find("consigneeName") ?? "").trim();
        const consigneePhone = String(find("consigneePhone") ?? "").trim();
        const consigneeAddress = String(find("consigneeAddress") ?? "").trim();
        if (!consigneeName || !consigneePhone || !consigneeAddress) {
          rowSpecificErrors.push(`Row ${rowIndex}: consigneeName, consigneePhone, and consigneeAddress are required.`);
        }

        const rowShipmentTypeRaw = String(find("shipmenttype") ?? find("shipment_type") ?? "").trim().toUpperCase();
        const rowShipmentType = rowShipmentTypeRaw;
        let effectiveService = shipmentMode === "mix_articles"
          ? rowShipmentType
          : String(shipmentType ?? "").trim().toUpperCase();

        if (shipmentMode === "mix_articles") {
          if (!rowShipmentType || !canonicalServices.has(rowShipmentType)) {
            const message = `Row ${rowIndex}: shipment_type must be one of VPL, VPP, COD, RGL, IRL, UMS, PAR in Mix Services mode.`;
            rowSpecificErrors.push(message);
            validationIssues.push({
              row: rowIndex,
              severity: "error",
              category: "Invalid services",
              message,
              shipmentType: rowShipmentType || "(missing)",
              recommendation: "Use a canonical service value per row before generating.",
            });
          }
        } else if (effectiveService && effectiveService !== "COURIER") {
          if (rowShipmentType && rowShipmentType !== effectiveService) {
            const message = `Row ${rowIndex}: shipment_type '${rowShipmentType}' does not match selected Single Service '${effectiveService}'.`;
            rowSpecificErrors.push(message);
            validationIssues.push({
              row: rowIndex,
              severity: "error",
              category: "Invalid services",
              message,
              shipmentType: rowShipmentType,
              recommendation: "Align shipment_type with Single Service mode selection.",
            });
          }
        }

        const rawTracking = String(find("TrackingID") ?? find("tracking_id") ?? find("barcode") ?? "")
          .trim()
          .toUpperCase()
          .replace(/\s+/g, "");
        if (rawTracking) {
          const seenAt = duplicateTrackingMap.get(rawTracking);
          if (seenAt) {
            const message = `Row ${rowIndex}: duplicate tracking '${rawTracking}' already used at row ${seenAt}.`;
            rowSpecificErrors.push(message);
            validationIssues.push({
              row: rowIndex,
              severity: "error",
              category: "Duplicate tracking IDs",
              message,
              tracking: rawTracking,
              shipmentType: effectiveService || undefined,
              recommendation: "Ensure each row has a unique tracking ID.",
            });
          } else {
            duplicateTrackingMap.set(rawTracking, rowIndex);
          }
        }

        if (rawTracking && effectiveService && effectiveService !== "COURIER") {
          const expectedPrefix = serviceCatalog.find((entry) => entry.service === effectiveService)?.prefix ?? effectiveService;
          const prefixMatches = rawTracking.startsWith(expectedPrefix);

          if (shipmentMode === "single_service" && effectiveBarcodeMode === "manual" && !prefixMatches) {
            rowSpecificErrors.push(`Row ${rowIndex}: tracking '${rawTracking}' must start with '${expectedPrefix}' for service '${effectiveService}'.`);
            validationIssues.push({
              row: rowIndex,
              severity: "error",
              category: "Prefix mismatches",
              message: `Tracking '${rawTracking}' does not match expected prefix '${expectedPrefix}' for service '${effectiveService}'.`,
              tracking: rawTracking,
              shipmentType: effectiveService,
              recommendation: `Update tracking to '${expectedPrefix}...' or change service for this row.`,
            });
          }

          if (shipmentMode === "single_service" && effectiveBarcodeMode === "auto" && !prefixMatches) {
            ignoredTracking += 1;
            rowWarnings.push(`Row ${rowIndex}: uploaded tracking '${rawTracking}' ignored in auto mode; system will generate '${expectedPrefix}' tracking.`);
            batchWarnings.add("Uploaded tracking IDs were ignored for rows using Auto Generate mode.");
            validationIssues.push({
              row: rowIndex,
              severity: "warning",
              category: "Prefix mismatches",
              message: `Uploaded tracking '${rawTracking}' ignored in auto mode.`,
              tracking: rawTracking,
              shipmentType: effectiveService,
              recommendation: "Use Manual mode to preserve uploaded IDs.",
            });
          }

          if (shipmentMode === "mix_articles") {
            let mismatchAction: MismatchAction = "generate";
            if (!prefixMatches) {
              const detectedPrefix = getDetectedPrefix(rawTracking);
              const detectedService = serviceByPrefix.get(detectedPrefix) ?? null;
              const issue: MismatchIssue = {
                row: rowIndex,
                uploadedTracking: rawTracking,
                detectedPrefix,
                detectedService,
                rowShipmentType: rowShipmentTypeRaw,
                expectedPrefix,
              };

              if (!applyAllMismatchAction) {
                const decision = await openMismatchDecision(issue);
                if (!decision) {
                  throw new Error("Generation cancelled by operator.");
                }
                mismatchAction = decision.action;
                if (decision.scope === "all") {
                  applyAllMismatchAction = decision.action;
                }
              } else {
                mismatchAction = applyAllMismatchAction;
              }

              if (mismatchAction === "use_uploaded" && detectedService && canonicalServices.has(detectedService)) {
                writeShipmentType(detectedService);
                effectiveService = detectedService;
                rowWarnings.push(`Row ${rowIndex}: preserving uploaded tracking '${rawTracking}' and overriding row shipment_type to '${detectedService}'.`);
                validationIssues.push({
                  row: rowIndex,
                  severity: "warning",
                  category: "Prefix mismatches",
                  message: `Uploaded tracking preserved; shipment_type changed from '${rowShipmentType || "(missing)"}' to '${detectedService}'.`,
                  tracking: rawTracking,
                  shipmentType: detectedService,
                  recommendation: "Verify shipment_type values in the upload source to avoid overrides.",
                });
              } else {
                mismatchAction = "generate";
                ignoredTracking += 1;
                rowWarnings.push(`Row ${rowIndex}: uploaded tracking '${rawTracking}' ignored; system will generate '${expectedPrefix}' tracking for '${effectiveService}'.`);
                validationIssues.push({
                  row: rowIndex,
                  severity: "warning",
                  category: "Prefix mismatches",
                  message: `Uploaded tracking '${rawTracking}' ignored and replaced with generated '${expectedPrefix}' tracking.`,
                  tracking: rawTracking,
                  shipmentType: effectiveService,
                  recommendation: "Select 'Use uploaded barcode' when you want to preserve uploaded tracking prefixes.",
                });
              }
            } else {
              // In Mix Services auto mode, matching uploaded tracking is preserved.
              (workingRow as any).TrackingID = rawTracking;
              (workingRow as any).trackingId = rawTracking;
            }
          }
        } else if (shipmentMode === "single_service" && effectiveBarcodeMode === "manual" && effectiveService && effectiveService !== "COURIER") {
          rowSpecificErrors.push(`Row ${rowIndex}: tracking ID is required in Manual mode.`);
          validationIssues.push({
            row: rowIndex,
            severity: "error",
            category: "Prefix mismatches",
            message: "Tracking ID is required in Manual mode.",
            shipmentType: effectiveService,
            recommendation: "Provide a valid tracking ID or switch to Auto Generate mode.",
          });
        }

        if (effectiveService && canonicalServices.has(effectiveService)) {
          const weightGrams = parseWeightToGrams(find("Weight"));
          const limit = SERVICE_WEIGHT_LIMITS[effectiveService];
          if (weightGrams > 0 && Number.isFinite(limit) && weightGrams > limit) {
            overweightWarnings += 1;
            const suggestions = suggestBestFitServices(weightGrams);
            const message = `Row ${rowIndex}: weight ${weightGrams}g exceeds ${effectiveService} limit ${limit}g. Suggested services: ${suggestions.join(", ") || "none"}.`;
            rowWarnings.push(message);
            validationIssues.push({
              row: rowIndex,
              severity: "warning",
              category: "Overweight shipments",
              message,
              shipmentType: effectiveService,
              recommendation: "Use a service with a higher allowed weight or split the shipment.",
            });
          }
        }

        const collectAmount = parseAmountValue(find("CollectAmount") || find("amount") || find("collect_amount"));
        if (effectiveService && canonicalServices.has(effectiveService) && !isMoneyOrderEligible(effectiveService) && collectAmount > 0) {
          const message = "Selected shipment type is not value-payable. Remove collect amount or select VPL/VPP/COD.";
          rowSpecificErrors.push(`Row ${rowIndex}: ${message}`);
          validationIssues.push({
            row: rowIndex,
            severity: "error",
            category: "MO-ineligible services",
            message,
            shipmentType: effectiveService,
            recommendation: "Clear collect amount for IRL/UMS/RGL/PAR shipments.",
          });
        }
        if (effectiveService && canonicalServices.has(effectiveService) && isMoneyOrderEligible(effectiveService) && collectAmount <= 0) {
          const message = "Value-payable shipment selected with zero collect amount.";
          rowWarnings.push(`Row ${rowIndex}: ${message}`);
          validationIssues.push({
            row: rowIndex,
            severity: "warning",
            category: "MO-ineligible services",
            message,
            shipmentType: effectiveService,
            recommendation: "Provide collect amount for VPL/VPP/COD shipments.",
          });
        }

        if (includeMoneyOrders && effectiveService && !isMoneyOrderEligible(effectiveService)) {
          moIneligibleWarnings += 1;
          const message = `Row ${rowIndex}: service '${effectiveService}' is not money-order eligible (VPL/VPP/COD only).`;
          rowWarnings.push(message);
          validationIssues.push({
            row: rowIndex,
            severity: "warning",
            category: "MO-ineligible services",
            message,
            shipmentType: effectiveService,
            recommendation: "Money orders will be generated only for VPL, VPP, and COD rows.",
          });
        }

        if (rowSpecificErrors.length > 0) {
          rowErrors.push(...rowSpecificErrors);
        } else {
          acceptedRows.push(workingRow);
        }
      }

      const accepted = acceptedRows.length;
      const rejected = rows.length - acceptedRows.length;
      const moEligibleRows = acceptedRows.filter((row) => {
        const rowService = String(row.shipment_type ?? row.shipmenttype ?? row.shipmentType ?? shipmentType ?? "").trim().toUpperCase();
        return isMoneyOrderEligible(rowService);
      }).length;
      const moSkippedRows = Math.max(0, acceptedRows.length - moEligibleRows);
      let rejectedSummaryUrl: string | null = null;
      let rejectedSummaryName: string | null = null;

      if (validationIssues.length > 0) {
        const summaryRows = validationIssues.map((entry) => ({
          section: entry.category,
          severity: entry.severity,
          row: entry.row,
          tracking: entry.tracking ?? "",
          shipment_type: entry.shipmentType ?? "",
          issue: entry.message,
          recommendation: entry.recommendation ?? "",
        }));
        const summaryCsv = rowsToCsv([
          "section",
          "severity",
          "row",
          "tracking",
          "shipment_type",
          "issue",
          "recommendation",
        ], summaryRows as Array<Record<string, unknown>>);
        const blob = new Blob([summaryCsv], { type: "text/csv;charset=utf-8" });
        rejectedSummaryUrl = URL.createObjectURL(blob);
        rejectedSummaryName = `${uploadedFile.name.replace(/\.[^.]+$/, "")}-validation-summary.csv`;
      }

      const groupedIssues = summarizeIssuesByCategory(validationIssues);
      const recommendations = [
        groupedIssues.prefixMismatches.length > 0 ? "Review prefix mismatches and use the mismatch decision options for consistency." : null,
        groupedIssues.invalidServices.length > 0 ? "Fix non-canonical shipment_type values before re-uploading." : null,
        groupedIssues.duplicateTracking.length > 0 ? "Remove duplicate tracking IDs to avoid shipment collision." : null,
        groupedIssues.overweightShipments.length > 0 ? "Switch overweight rows to higher-capacity services or box output mode." : null,
        groupedIssues.moIneligibleServices.length > 0 ? "Money order output is restricted to VPL, VPP, and COD rows." : null,
      ].filter((item): item is string => Boolean(item));

      setValidationSummary({
        accepted,
        rejected,
        ignoredTracking,
        overweightWarnings,
        moIneligibleWarnings,
        duplicateFilenameBypassUsed: false,
        moEligibleRows,
        moSkippedRows,
        batchWarnings: Array.from(batchWarnings),
        rejectedSummaryUrl,
        rejectedSummaryName,
        totalIssues: validationIssues.length,
        prefixMismatches: groupedIssues.prefixMismatches,
        invalidServices: groupedIssues.invalidServices,
        duplicateTracking: groupedIssues.duplicateTracking,
        overweightShipments: groupedIssues.overweightShipments,
        moIneligibleServices: groupedIssues.moIneligibleServices,
        recommendations,
        rowErrors: rowErrors.slice(0, 20),
        rowWarnings: rowWarnings.slice(0, 20),
      });

      if (acceptedRows.length === 0) {
        throw new Error(`Upload validation failed. ${rowErrors.slice(0, 8).join(" ")}`);
      }

      if (rowErrors.length > 0) {
        rowWarnings.push(`Proceeding with ${acceptedRows.length} accepted row(s); ${rejected} row(s) were rejected.`);
      }

      const uploadHeaders = Object.keys(rows[0] ?? {});
      const acceptedCsv = rowsToCsv(uploadHeaders, acceptedRows);
      const uploadFileForApi = new File(
        [acceptedCsv],
        `${uploadedFile.name.replace(/\.[^.]+$/, "")}-accepted.csv`,
        { type: "text/csv" },
      );

      const isAuto = effectiveBarcodeMode === "auto";
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

      console.info("UPLOAD_REPLAY_REQUEST", {
        fileName: uploadFileForApi.name,
        shipmentMode,
        carrierType: carrierType ?? "",
        shipmentType: String(shipmentType ?? ""),
        barcodeMode: isAuto ? "auto" : "manual",
        generateMoneyOrder: Boolean(includeMoneyOrders && eligibleForMoneyOrder),
        trackAfterGenerate: Boolean(trackAfterGenerate),
      });

      const data = (await uploadFile("/api/upload", uploadFileForApi, {
          barcodeMode: isAuto ? "auto" : "manual",
          autoGenerateTracking: String(isAuto),
          sourceOriginalFilename: uploadedFile.name,
          shipmentMode,
          carrierType: carrierType ?? "",
          shipmentType: String(shipmentType ?? ""),
          printMode: outputMode ?? "box",
          generateMoneyOrder: String(Boolean(includeMoneyOrders && eligibleForMoneyOrder)),
          trackAfterGenerate: String(trackAfterGenerate),
        })) as { jobId: string; recordCount: number; duplicateFilenameBypassUsed?: boolean };
      console.info("UPLOAD_REPLAY_RESPONSE", data);
      if (data.duplicateFilenameBypassUsed) {
        setValidationSummary((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            duplicateFilenameBypassUsed: true,
          };
        });
      }
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
            setValidationSummary(null);
            setHasManualOutputChoice(false);
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

        {uploadInsights ? (
          <Card className="border-sky-200 bg-sky-50/60 p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-sky-900">Smart Upload Recommendation</div>
                <div className="mt-1 text-xs text-sky-800">{uploadInsights.recommendationReason}</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setHasManualOutputChoice(false);
                  setOutputMode(uploadInsights.recommendedOutputMode);
                  setIncludeMoneyOrders(uploadInsights.moneyOrderEligibleRows > 0);
                }}
                className="rounded-xl border border-sky-300 bg-white px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-100"
              >
                Apply Recommendation
              </button>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
              <div className="rounded-xl border border-sky-200 bg-white px-3 py-2 text-sky-800">Rows: {uploadInsights.rowCount}</div>
              <div className="rounded-xl border border-sky-200 bg-white px-3 py-2 text-sky-800">Recommended Output: {uploadInsights.recommendedOutputMode}</div>
              <div className="rounded-xl border border-sky-200 bg-white px-3 py-2 text-sky-800">MO Eligible Rows: {uploadInsights.moneyOrderEligibleRows}</div>
            </div>
          </Card>
        ) : null}

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
              <div className="font-medium text-gray-900">2) Shipment Mode</div>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setShipmentMode("single_service")}
                  className={`rounded-2xl border px-3 py-2 text-sm font-medium ${
                    shipmentMode === "single_service" ? "border-brand bg-brand/10 text-brand" : "bg-white text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  Single Service
                </button>
                <button
                  type="button"
                  onClick={() => setShipmentMode("mix_articles")}
                  className={`rounded-2xl border px-3 py-2 text-sm font-medium ${
                    shipmentMode === "mix_articles" ? "border-brand bg-brand/10 text-brand" : "bg-white text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  Mix Services
                </button>
              </div>
              <div className="mt-2 text-xs text-gray-600">
                Single Service enforces the selected shipment type. Mix Services uses row shipment_type as authoritative.
              </div>
            </div>

            {shipmentMode === "single_service" ? (
            <div>
              <div className="font-medium text-gray-900">3) Category</div>
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
            ) : null}

            {shipmentMode === "single_service" ? (
            <div>
              <div className="font-medium text-gray-900">4) Shipment Type</div>
              {carrierType === "courier" ? (
                <div className="mt-2 text-sm text-gray-600">Courier selected (shipment type not required).</div>
              ) : carrierType !== "pakistan_post" ? (
                <div className="mt-2 text-sm text-gray-600">Select a carrier first.</div>
              ) : ppCategory === "general_post" ? (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {(generalServices as string[]).map((t) => (
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
                  {(valuePayableServices as string[]).map((t) => (
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
                  {(codServices as string[]).map((t) => (
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
              ) : (
                <div className="mt-2 text-sm text-gray-600">Select a category.</div>
              )}
            </div>
            ) : null}

            <div>
              <div className="font-medium text-gray-900">5) Barcode Mode</div>
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
              {shipmentMode === "mix_articles" ? (
                <div className="mt-2 rounded-2xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-800">
                  <div className="font-semibold">Mix Services always runs in hybrid workflow.</div>
                  <div className="mt-1">Rows with valid uploaded tracking IDs are preserved.</div>
                  <div>Rows missing tracking IDs are auto-generated by shipment type.</div>
                </div>
              ) : barcodeMode === "auto" ? (
                <div className="mt-2 rounded-2xl border border-brand/20 bg-brand/10 px-3 py-2 text-xs text-brand">
                  <span className="font-semibold">Auto Generate Tracking ID / Barcode:</span> Uploaded tracking IDs are preserved when valid; missing tracking IDs are generated.
                </div>
              ) : null}
            </div>

            <div>
              <div className="font-medium text-gray-900">6) Output Mode</div>
              <div className="mt-3 grid min-w-0 grid-cols-2 gap-0 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="grid min-w-0 grid-cols-1 gap-2 border-r border-slate-200 p-3 sm:grid-cols-2">
                  {([
                    { id: "envelope-9x4" as const, label: "Envelope 9x4", desc: "Dedicated 9 x 4 layout with right-side compact amount/barcode" },
                    { id: "universal-9x4" as const, label: "Universal 9x4", desc: "Template-driven 9 x 4 layout for all shipment types" },
                    { id: "box" as const, label: "Box Shipment (4 per A4)", desc: "4.1 x 5.8 inch, 2 x 2 grid on A4" },
                    { id: "flyer" as const, label: "Flyer Label (8 per A4)", desc: "105 x 74 mm, 2 x 4 grid, compact layout" },
                  ]).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setHasManualOutputChoice(true);
                        setOutputMode(opt.id);
                      }}
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

        {validationSummary ? (
          <Card className="border-slate-200 bg-white p-5 shadow-sm">
            <CardTitle>Upload Summary</CardTitle>
            <div className="mt-1 text-xs text-slate-500">Quick status for this file upload.</div>
            <div className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-emerald-200 bg-gradient-to-b from-emerald-50 to-emerald-100/70 px-3 py-2 text-emerald-900 shadow-sm">
                <div className="text-[11px] font-semibold uppercase tracking-wide">Accepted</div>
                <div className="mt-0.5 text-base font-bold">{validationSummary.accepted}</div>
              </div>
              <div className="rounded-xl border border-amber-200 bg-gradient-to-b from-amber-50 to-amber-100/70 px-3 py-2 text-amber-900 shadow-sm">
                <div className="text-[11px] font-semibold uppercase tracking-wide">Warnings</div>
                <div className="mt-0.5 text-base font-bold">{validationSummary.rowWarnings.length + validationSummary.batchWarnings.length}</div>
              </div>
              <div className="rounded-xl border border-red-200 bg-gradient-to-b from-red-50 to-red-100/70 px-3 py-2 text-red-900 shadow-sm">
                <div className="text-[11px] font-semibold uppercase tracking-wide">Validation Errors</div>
                <div className="mt-0.5 text-base font-bold">{validationSummary.rejected}</div>
              </div>
              <div className="rounded-xl border border-sky-200 bg-gradient-to-b from-sky-50 to-sky-100/70 px-3 py-2 text-sky-900 shadow-sm">
                <div className="text-[11px] font-semibold uppercase tracking-wide">MO Eligible</div>
                <div className="mt-0.5 text-base font-bold">{validationSummary.moEligibleRows}</div>
              </div>
            </div>
            <details className="mt-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs text-slate-700">
              <summary className="cursor-pointer font-semibold text-slate-800">Detailed diagnostics</summary>
              <div className="mt-3 space-y-3">
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-600">
                  Showing grouped issues with up to a few sample rows per category for faster review.
                </div>
                {validationSummary.batchWarnings.length > 0 ? (
                  <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-blue-900 shadow-sm">
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide">Batch notices</div>
                    {validationSummary.batchWarnings.slice(0, 6).map((item, idx) => (
                      <div key={`batch-${idx}`}>{item}</div>
                    ))}
                  </div>
                ) : null}
                {[
                  { title: "Prefix mismatches", data: validationSummary.prefixMismatches, badge: "bg-amber-100 text-amber-800" },
                  { title: "Invalid services", data: validationSummary.invalidServices, badge: "bg-red-100 text-red-800" },
                  { title: "Duplicate tracking IDs", data: validationSummary.duplicateTracking, badge: "bg-rose-100 text-rose-800" },
                  { title: "Overweight shipments", data: validationSummary.overweightShipments, badge: "bg-orange-100 text-orange-800" },
                  { title: "MO-ineligible services", data: validationSummary.moIneligibleServices, badge: "bg-fuchsia-100 text-fuchsia-800" },
                ].filter((group) => group.data.length > 0).map((group) => (
                  <div key={group.title} className="rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold text-slate-800">{group.title}</div>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${group.badge}`}>{group.data.length}</span>
                    </div>
                    <div className="mt-2 space-y-1 text-slate-700">
                      {group.data.slice(0, 6).map((item, idx) => (
                        <div key={`${group.title}-${idx}`} className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-1.5">
                          <span className="font-medium text-slate-800">Row {item.row}:</span> {item.message}
                          {item.recommendation ? <span className="text-slate-500"> Suggested fix: {item.recommendation}</span> : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {validationSummary.rowErrors.length > 0 ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-red-800 shadow-sm">
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide">Blocking issues</div>
                    {validationSummary.rowErrors.slice(0, 8).map((item, idx) => (
                      <div key={`err-${idx}`}>{item}</div>
                    ))}
                  </div>
                ) : null}
                {validationSummary.rowWarnings.length > 0 ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900 shadow-sm">
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide">Warnings</div>
                    {validationSummary.rowWarnings.slice(0, 8).map((item, idx) => (
                      <div key={`warn-${idx}`}>{item}</div>
                    ))}
                  </div>
                ) : null}
                {validationSummary.rejectedSummaryUrl && validationSummary.rejectedSummaryName ? (
                  <div>
                    <a
                      href={validationSummary.rejectedSummaryUrl}
                      download={validationSummary.rejectedSummaryName}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <Download className="h-4 w-4" />
                      Download Validation Summary CSV
                    </a>
                  </div>
                ) : null}
                {validationSummary.recommendations.length > 0 ? (
                  <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sky-900 shadow-sm">
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide">Recommended actions</div>
                    {validationSummary.recommendations.slice(0, 6).map((item, idx) => (
                      <div key={`rec-${idx}`}>{item}</div>
                    ))}
                  </div>
                ) : null}
              </div>
            </details>
          </Card>
        ) : null}

        {eligibleForMoneyOrder ? (
          <Card className="border-slate-200 bg-white p-5 shadow-sm">
            <CardTitle>Generate Money Orders</CardTitle>
            <div className="mt-0.5 text-sm font-normal text-slate-500">All actions consume units based on usage.</div>
            <div className="mt-2 text-sm text-gray-600">
                VPL/VPP include commission. COD has no commission.
            </div>
            {shipmentMode === "mix_articles" ? (
              <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                    Mix Services mode: money orders are generated only for VPL, VPP, and COD rows.
                {uploadInsights ? ` Eligible rows: ${uploadInsights.moneyOrderEligibleRows}. Ineligible rows: ${uploadInsights.moneyOrderIneligibleRows}.` : ""}
              </div>
            ) : null}
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
          <div className="mt-2 text-sm text-gray-600">Tracking enabled from uploaded file for post-generation operations.</div>
          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
            <div className="font-semibold text-slate-800">Recommended workflow:</div>
            <div className="mt-1">1. Generate labels and tracking IDs from validated upload rows.</div>
            <div>2. Export and retain the generated tracking master file.</div>
            <div>3. Use Track Parcel for delivery status updates and complaint submissions.</div>
            <div>4. Use the same export for settlement and reconciliation checks.</div>
          </div>
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
      {mismatchDecisionModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-[0_30px_80px_rgba(15,23,42,0.28)]">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100">
                <svg className="h-5 w-5 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-base font-bold text-slate-900">Tracking Prefix Mismatch Detected</div>
                <div className="mt-1 text-sm text-slate-600">Row {mismatchDecisionModal.row} contains uploaded tracking <span className="font-semibold">{mismatchDecisionModal.uploadedTracking}</span> but shipment_type is <span className="font-semibold">{mismatchDecisionModal.rowShipmentType || "(missing)"}</span>. Choose how to continue.</div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Uploaded Prefix</div>
                <div className="mt-1 text-lg font-extrabold text-slate-900">{mismatchDecisionModal.detectedPrefix || "UNKNOWN"}</div>
              </div>
              <div className="rounded-xl border border-red-100 bg-red-50 p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-red-500">Expected Prefix</div>
                <div className="mt-1 text-lg font-extrabold text-red-700">{mismatchDecisionModal.expectedPrefix}</div>
              </div>
            </div>
            <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Generate barcode keeps row shipment_type as-is and ignores uploaded tracking. Use uploaded barcode preserves tracking and overrides row shipment_type using uploaded prefix.
            </div>
            <div className="mt-3 flex items-center gap-4 text-xs text-slate-600">
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  name="mismatchApplyScope"
                  checked={mismatchApplyScope === "row"}
                  onChange={() => setMismatchApplyScope("row")}
                />
                Apply to this row only
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  name="mismatchApplyScope"
                  checked={mismatchApplyScope === "all"}
                  onChange={() => setMismatchApplyScope("all")}
                />
                Apply to all mismatches
              </label>
            </div>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => closeMismatchDecision({ action: "generate", scope: mismatchApplyScope })}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Generate {mismatchDecisionModal.rowShipmentType || "Row"} barcode
              </button>
              <button
                type="button"
                onClick={() => closeMismatchDecision({ action: "use_uploaded", scope: mismatchApplyScope })}
                className="rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-md hover:bg-emerald-700"
              >
                Use uploaded {mismatchDecisionModal.detectedPrefix || "tracking"} barcode
              </button>
              <button
                type="button"
                onClick={() => closeMismatchDecision(null)}
                className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-md hover:bg-slate-800"
              >
                Cancel generation
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
      {showManualTrackingRequiredModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-[0_30px_80px_rgba(15,23,42,0.28)]">
            <div className="text-lg font-semibold text-slate-900">Tracking IDs are missing in uploaded file.</div>
            <div className="mt-2 text-sm text-slate-600">Manual barcode mode requires tracking IDs for all rows.</div>
            <div className="mt-1 text-sm text-slate-600">Please switch to: Auto Generate</div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setBarcodeMode("auto");
                  setShowManualTrackingRequiredModal(false);
                }}
                className="rounded-2xl bg-brand px-4 py-2 text-sm font-semibold text-white shadow-md hover:bg-brand-dark"
              >
                Switch to Auto Generate
              </button>
              <button
                type="button"
                onClick={() => setShowManualTrackingRequiredModal(false)}
                className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
    </PageShell>
  );
}



