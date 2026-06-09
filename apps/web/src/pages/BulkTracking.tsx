import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { UploadCloud, AlertCircle, MapPin, PackageSearch, BadgeDollarSign, RefreshCw, Printer, Package, CheckCircle2, Clock, TrendingUp, X, MessageSquare, Activity, ChevronRight, Truck, ArrowUpRight, ArrowUpDown, Search } from "lucide-react";
import * as XLSX from "xlsx";
import Card from "../components/Card";
import ActionButton from "../components/ui/ActionButton";
import UnifiedShipmentCards from "../components/UnifiedShipmentCards";
import SampleDownloadLink from "../components/SampleDownloadLink";
import ProcessStepper from "../components/ProcessStepper";
import { cn } from "../lib/cn";
import { buildScopedCacheKey } from "../lib/cache";
import { api, apiHealthCheck, triggerBrowserDownload, uploadFile } from "../lib/api";
import { useTrackingJobPolling } from "../lib/useTrackingJobPolling";
import { collectComplaintBrowserBootstrap } from "../components/ComplaintModal";
import { getRole } from "../lib/auth";
import type { MeResponse, Shipment as BaseShipment, TrackResult } from "../lib/types";
import {
  buildTrackingWhatsAppShareUrl,
  computeStats,
  filterFinalTrackingData,
  getFinalTrackingData,
  getStatusDisplayColor,
  resolveTrackingPresentation,
  type FinalTrackingRecord,
  type TrackingPresentationModel,
  type StatusCardFilter,
} from "../lib/trackingData";
import { BodyText, CardTitle, PageHeader, PageShell } from "../components/ui/PageSystem";
import { useShipmentStats } from "../hooks/useShipmentStats";
import { PRINT_MARKETING_LINE } from "../lib/printBranding";
import {
  readTrackingWorkspaceRenderCacheForScope,
  readTrackingWorkspaceSnapshotForScope,
  readTrackingWorkspaceViewStateForScope,
  writeTrackingWorkspaceRenderCacheForScope,
  writeTrackingWorkspaceSnapshotForScope,
  writeTrackingWorkspaceViewStateForScope,
  type TrackingWorkspaceRenderCache,
  type TrackingWorkspaceViewState,
} from "../lib/trackingWorkspaceCache";
import { normalizeQueueStatusLabel, resolveComplaintCardState } from "./complaintCardState";

type Shipment = BaseShipment & {
  shipmentType?: string | null;
  daysPassed?: number | null;
  createdAt: string;
  rawJson?: string | null;
};

type ShellCtx = { me: MeResponse | null; refreshMe: () => Promise<void> };

type CycleAuditRecord = {
  tracking_number: string;
  current_status: string;
  expected_status: string;
  cycle_detected: string;
  issue: string;
  reason: string;
  correction_required: boolean;
  suggested_fix: string;
  issue_code: string;
  missing_detection: string[];
  current_status_allowed_reason: string;
  cycle_status: string;
  mos_status: string;
  flags: string[];
};

type CycleAuditDraft = {
  expected_status: "DELIVERED" | "RETURNED" | "PENDING" | "DELIVERED WITH PAYMENT";
  cycle_detected: "Cycle 1" | "Cycle 2" | "Cycle 3" | "Cycle Unknown";
  missing_steps: string;
  reason: string;
  apply_to_issue_code: boolean;
};

type ComplaintPrefill = {
  deliveryOffice: string;
  addresseeName?: string;
  addresseeAddress?: string;
  addresseeCity?: string;
  matched?: {
    district: string;
    tehsil: string;
    location: string;
  } | null;
  districts: string[];
  tehsils: string[];
  locations: string[];
  districtData: Array<{ district: string; tehsil: string; location: string }>;
};

type ComplaintTemplateKey = "VALUE_PAYABLE" | "NORMAL" | "RETURN";
type ExtendedStatusFilter =
  | StatusCardFilter
  | "COMPLAINT_WATCH"
  | "COMPLAINT_TOTAL"
  | "COMPLAINT_ACTIVE"
  | "COMPLAINT_CLOSED"
  | "COMPLAINT_REOPENED"
  | "COMPLAINT_IN_PROCESS"
  | "COMPLAINT_OVERDUE";

type TrackingUploadFileKind = "tracking master file" | "shipment upload file" | "tracking-only file" | "unknown file";

type TrackingUploadFileAnalysis = {
  kind: TrackingUploadFileKind;
  trackingCount: number;
};

type TrackingBatchHistoryItem = {
  id: string;
  uploadDate: string;
  totalTrackingIds: number;
  currentStatus: string;
  lastTrackingRun: string | null;
  unitsConsumed: number;
  originalFilename: string | null;
  hasMasterFile: boolean;
};

const TRACKING_CACHE_TTL_MS = 30 * 60 * 1000;
const COMPLAINT_QUEUE_CACHE_TTL_MS = 30 * 60 * 1000;
/** After this elapsed time a "processing" complaint card is considered stale and shows a retry warning. */
const COMPLAINT_PROCESSING_STALE_UI_MS = 10 * 60 * 1000; // 10 minutes
const WORKSPACE_RENDER_CACHE_PERSIST_MS = 150;
const WORKSPACE_FULL_SNAPSHOT_PERSIST_MS = 300;
const BACKGROUND_BATCH_SIZE = 100;
const COMPLAINT_PHONE_STORAGE_KEY = "complaint.manual.phone";
const COMPLAINT_EMAIL_STORAGE_KEY = "complaint.manual.email";
const TRACKING_SERVICE_TYPE_MAP: Record<string, string> = {
  UMS: "UMS",
  UMO: "MOS",
  FMO: "FMO",
  EMS: "EMS",
  MOS: "MOS",
  VPP: "VPP",
  VPX: "VPX",
  VPL: "VPL",
  COD: "COD",
  RL: "RGL",
  RGL: "RGL",
  IRL: "IRL",
  PAR: "VPX",
  PR: "VPX",
};

function normalizeUploadHeader(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function extractTrackingIdsFromUploadRows(rows: Array<Record<string, unknown>>) {
  const trackingHeaderCandidates = new Set([
    "trackingid",
    "trackingnumber",
    "trackingno",
    "tracking",
    "tracking_id",
    "barcode",
    "articleno",
    "articlenumber",
  ]);

  const values = new Set<string>();
  for (const row of rows) {
    for (const [key, value] of Object.entries(row)) {
      const normalizedKey = normalizeUploadHeader(key);
      if (!trackingHeaderCandidates.has(normalizedKey)) continue;
      const trackingId = String(value ?? "").trim().toUpperCase().replace(/\s+/g, "");
      if (trackingId) values.add(trackingId);
    }
  }
  return Array.from(values);
}

function detectTrackingUploadKind(headers: string[]): TrackingUploadFileKind {
  const normalized = new Set(headers.map((header) => normalizeUploadHeader(header)));
  const hasTracking = ["trackingid", "trackingnumber", "trackingno", "tracking", "tracking_id", "barcode", "articleno", "articlenumber"]
    .some((key) => normalized.has(key));
  const hasReceiverFields = ["consigneename", "consigneeaddress", "receivercity", "collectamount", "shipmenttype"]
    .some((key) => normalized.has(key));
  const hasTrackingMasterSignals = ["batchid", "generateddate", "currentstatus", "complaintstatus", "settlementstatus"]
    .every((key) => normalized.has(key));

  if (hasTrackingMasterSignals && hasTracking) return "tracking master file";
  if (hasTracking && hasReceiverFields) return "shipment upload file";
  if (hasTracking) return "tracking-only file";
  return "unknown file";
}

async function analyzeTrackingUploadFile(file: File | null): Promise<TrackingUploadFileAnalysis> {
  if (!file) {
    return { kind: "unknown file", trackingCount: 0 };
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: "array" });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!firstSheet) {
      return { kind: "unknown file", trackingCount: 0 };
    }
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { raw: false, defval: "" });
    const headers = Object.keys(rows[0] ?? {});
    const trackingIds = extractTrackingIdsFromUploadRows(rows);
    return {
      kind: detectTrackingUploadKind(headers),
      trackingCount: trackingIds.length,
    };
  } catch {
    return { kind: "unknown file", trackingCount: 0 };
  }
}

function formatLastDate(shipment: Shipment): string {
  return String(shipment.latestDate ?? "").trim() || new Date(shipment.updatedAt).toLocaleDateString("en-GB");
}

function detectTemplateType(record: FinalTrackingRecord): ComplaintTemplateKey {
  const tn = String(record.shipment.trackingNumber ?? "").toUpperCase();
  if (normalizeStatus(getAuthoritativeRecordStatus(record)).includes("RETURN")) return "RETURN";
  if (record.amount > 0 || tn.startsWith("VPL") || tn.startsWith("VPP") || tn.startsWith("COD")) return "VALUE_PAYABLE";
  return "NORMAL";
}

function buildComplaintTemplate(record: FinalTrackingRecord, key: ComplaintTemplateKey): string {
  const trackingNo = record.shipment.trackingNumber;
  const lastDate = formatLastDate(record.shipment);
  const amount = Math.max(0, Math.round(record.amount));
  const raw = parseRaw(record.shipment.rawJson);
  const senderName = String(raw?.shipperName ?? raw?.sender_name ?? "Sender").trim() || "Sender";
  const senderPhone = String(raw?.shipperPhone ?? raw?.sender_phone ?? raw?.contactNumber ?? "").trim() || "N/A";
  const closing = `\n\nSincerely,\n${senderName}\nContact Number: ${senderPhone}`;

  if (key === "VALUE_PAYABLE") {
    return `Dear Complaint Team,\n\nI respectfully request your assistance regarding value payable article ${trackingNo}. As per tracking, action occurred on ${lastDate}; however, the money order amount of Rs ${amount.toLocaleString()} is still not received. Kindly verify delivery and payment processing and update the current complaint status.${closing}`;
  }
  if (key === "RETURN") {
    return `Dear Complaint Team,\n\nI respectfully request review of return article ${trackingNo}. The item has been marked undelivered, but the return has not yet reached the sender. Kindly confirm the return movement and expected completion timeline.${closing}`;
  }
  return `Dear Complaint Team,\n\nI respectfully request an update for pending article ${trackingNo}. This article has remained pending since ${lastDate}. Kindly arrange urgent delivery or provide the latest processing status.${closing}`;
}

type ComplaintLifecycle = {
  exists: boolean;
  active: boolean;
  complaintId: string;
  dueDateText: string;
  dueDateTs: number | null;
  state: string;
  stateLabel: string;
  message: string;
  complaintCount: number;
  latestAttempt: number;
  previousComplaintReference: string;
};

type ComplaintQueueSnapshot = {
  id: string;
  trackingId: string;
  complaintStatus: string;
  complaintId: string | null;
  dueDate: string | null;
  nextRetryAt: string | null;
  retryCount: number;
  updatedAt: string;
};

function complaintQueueRowsToMap(rows: ComplaintQueueSnapshot[]): Map<string, ComplaintQueueSnapshot> {
  const next = new Map<string, ComplaintQueueSnapshot>();
  for (const row of rows) {
    const trackingId = String(row.trackingId ?? "").trim();
    if (!trackingId || next.has(trackingId)) continue;
    next.set(trackingId, row);
  }
  return next;
}

function complaintQueueMapToRows(map: Map<string, ComplaintQueueSnapshot>) {
  return Array.from(map.values());
}

let initialWorkspaceRenderCacheScope: string | null | undefined;
let initialWorkspaceRenderCache: TrackingWorkspaceRenderCache<Shipment, ComplaintQueueSnapshot> | null | undefined;

function readInitialWorkspaceRenderCache(scopeKey?: string | null) {
  if (initialWorkspaceRenderCacheScope === scopeKey && initialWorkspaceRenderCache !== undefined) return initialWorkspaceRenderCache;
  initialWorkspaceRenderCacheScope = scopeKey ?? null;
  initialWorkspaceRenderCache = readTrackingWorkspaceRenderCacheForScope<Shipment, ComplaintQueueSnapshot>(scopeKey);
  return initialWorkspaceRenderCache;
}

let initialWorkspaceViewStateScope: string | null | undefined;
let initialWorkspaceViewState: TrackingWorkspaceViewState<ExtendedStatusFilter> | null | undefined;

function readInitialWorkspaceViewState(scopeKey?: string | null) {
  if (initialWorkspaceViewStateScope === scopeKey && initialWorkspaceViewState !== undefined) return initialWorkspaceViewState;
  initialWorkspaceViewStateScope = scopeKey ?? null;
  initialWorkspaceViewState = readTrackingWorkspaceViewStateForScope<ExtendedStatusFilter>(scopeKey);
  return initialWorkspaceViewState;
}

function parseDueDateToTs(input: string): number | null {
  const value = String(input ?? "").trim();
  if (!value) return null;
  const slash = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const day = Number(slash[1]);
    const month = Number(slash[2]);
    const year = Number(slash[3]);
    const dt = new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
    return Number.isFinite(dt) ? dt : null;
  }
  const dash = value.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dash) {
    const dt = new Date(Number(dash[3]), Number(dash[2]) - 1, Number(dash[1]), 0, 0, 0, 0).getTime();
    return Number.isFinite(dt) ? dt : null;
  }
  const iso = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    const dt = new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
    return Number.isFinite(dt) ? dt : null;
  }
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeComplaintId(raw: string | null | undefined): string {
  const value = String(raw ?? "").trim().toUpperCase();
  if (!value) return "";
  return value.startsWith("CMP-") ? value : `CMP-${value}`;
}

function normalizeComplaintHistoryEntries(entries: Array<{
  complaintId?: string;
  trackingId?: string;
  createdAt?: string;
  dueDate?: string;
  status?: string;
  attemptNumber?: number;
  previousComplaintReference?: string;
}>) {
  const seen = new Set<string>();
  const sorted = [...entries]
    .map((entry) => ({
      complaintId: normalizeComplaintId(entry.complaintId),
      trackingId: String(entry.trackingId ?? "").trim(),
      createdAt: String(entry.createdAt ?? "").trim(),
      dueDate: String(entry.dueDate ?? "").trim(),
      status: String(entry.status ?? "").trim().toUpperCase() || "ACTIVE",
      attemptNumber: Math.max(1, Number(entry.attemptNumber ?? 1) || 1),
      previousComplaintReference: normalizeComplaintId(entry.previousComplaintReference),
    }))
    .filter((entry) => Boolean(entry.complaintId))
    .sort((a, b) => Number(a.attemptNumber ?? 1) - Number(b.attemptNumber ?? 1));

  const unique = sorted.filter((entry) => {
    if (seen.has(entry.complaintId)) return false;
    seen.add(entry.complaintId);
    return true;
  });

  return unique.map((entry, index) => ({
    ...entry,
    attemptNumber: index + 1,
    previousComplaintReference: index === 0
      ? ""
      : (entry.previousComplaintReference || unique[index - 1]?.complaintId || ""),
  }));
}

function parseComplaintLifecycle(shipment: Shipment): ComplaintLifecycle {
  const textBlob = String(shipment.complaintText ?? "").trim();
  const historyMarker = "COMPLAINT_HISTORY_JSON:";
  const historyIndex = textBlob.lastIndexOf(historyMarker);
  const historyRaw = historyIndex >= 0 ? textBlob.slice(historyIndex + historyMarker.length).trim() : "";
  const parsedHistory = (() => {
    if (!historyRaw) return [] as Array<{ complaintId: string; dueDate?: string; attemptNumber?: number; previousComplaintReference?: string }>;
    try {
      const parsed = JSON.parse(historyRaw) as { entries?: Array<{ complaintId: string; dueDate?: string; attemptNumber?: number; previousComplaintReference?: string }> };
      return Array.isArray(parsed?.entries) ? parsed.entries : [];
    } catch {
      return [];
    }
  })();
  const normalizedHistory = normalizeComplaintHistoryEntries(parsedHistory);
  const latestHistory = normalizedHistory.length > 0 ? normalizedHistory[normalizedHistory.length - 1] : null;
  const idFromStructured = textBlob.match(/COMPLAINT_ID\s*:\s*([A-Z0-9\-]+)/i)?.[1] ?? "";
  const idFromMessage = textBlob.match(/Complaint\s*ID\s*([A-Z0-9\-]+)/i)?.[1] ?? "";
  const rawId = (latestHistory?.complaintId || idFromStructured || idFromMessage || "").trim();
  const complaintId = rawId
    ? (rawId.toUpperCase().startsWith("CMP-") ? rawId.toUpperCase() : `CMP-${rawId}`)
    : "";

  const dueStructured = textBlob.match(/DUE_DATE\s*:\s*([^\n|]+)/i)?.[1] ?? "";
  const dueFromMessage = textBlob.match(/Due\s*Date\s*(?:on)?\s*([0-3]?\d\/[0-1]?\d\/\d{4})/i)?.[1] ?? "";
  const dueDateText = String(latestHistory?.dueDate || dueStructured || dueFromMessage || "").trim();
  const dueDateTs = parseDueDateToTs(dueDateText);
  const stateFromStructured = textBlob.match(/COMPLAINT_STATE\s*:\s*([^\n|]+)/i)?.[1] ?? "";
  const stateFromStatus = String(shipment.complaintStatus ?? "").trim();

  const normalizeState = (raw: string) => {
    const token = String(raw ?? "").trim().toUpperCase().replace(/[\-_]+/g, " ");
    if (!token) return "ACTIVE";
    if (["ACTIVE", "OPEN", "FILED"].includes(token)) return "ACTIVE";
    if (["OVERDUE", "PROCESSING"].includes(token)) return "OVERDUE";
    if (["IN PROCESS", "INPROGRESS", "IN_PROGRESS", "PENDING", "DUPLICATE"].includes(token)) return "IN PROCESS";
    if (["RESOLVED", "RESOLVE"].includes(token)) return "RESOLVED";
    if (["CLOSED", "CLOSE"].includes(token)) return "CLOSED";
    if (["REJECTED", "REJECT", "ERROR", "FAILED"].includes(token)) return "REJECTED";
    return token;
  };

  const normalizedState = normalizeState(stateFromStructured || stateFromStatus);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const hasComplaint = Boolean(complaintId) || ["FILED", "DUPLICATE", "ACTIVE", "IN PROCESS", "RESOLVED", "CLOSED", "REJECTED"].includes(normalizeState(stateFromStatus));
  const active = Boolean(
    hasComplaint
    && normalizedState === "ACTIVE"
    && dueDateTs != null
    && dueDateTs >= todayStart.getTime(),
  );

  return {
    exists: hasComplaint,
    active,
    complaintId,
    dueDateText,
    dueDateTs,
    state: normalizedState,
    stateLabel: normalizedState,
    message: textBlob,
    complaintCount: normalizedHistory.length > 0 ? normalizedHistory.length : (hasComplaint ? 1 : 0),
    latestAttempt: Number(latestHistory?.attemptNumber ?? (hasComplaint ? 1 : 0)) || 0,
    previousComplaintReference: String(latestHistory?.previousComplaintReference ?? "").trim(),
  };
}

function isConfirmResolvedVisible(
  lifecycle: ComplaintLifecycle,
  shipmentStatus: string | null | undefined,
): boolean {
  const lifecycleStateUp = String(lifecycle.state ?? "").toUpperCase();
  const statusUp = String(shipmentStatus ?? "").toUpperCase();
  const hasComplaint = lifecycle.exists || Boolean(String(lifecycle.complaintId ?? "").trim());
  const allowedLifecycle = lifecycleStateUp === "ACTIVE" || lifecycleStateUp === "OVERDUE";
  const deliveryEvidence = statusUp.includes("DELIVER") || statusUp.includes("RETURN");
  return hasComplaint && allowedLifecycle && deliveryEvidence;
}

function isComplaintInProcess(lifecycle: ComplaintLifecycle): boolean {
  const state = String(lifecycle.state ?? "").trim().toUpperCase();
  return lifecycle.exists && (state === "ACTIVE" || state === "IN PROCESS" || lifecycle.active);
}

function isComplaintActionAllowed(
  shipmentStatus: string | null | undefined,
  lifecycle: ComplaintLifecycle,
  queueSnapshot: ComplaintQueueSnapshot | undefined,
) {
  const statusUpper = normalizeStatus(shipmentStatus).toUpperCase();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const lifecycleStateUp = String(lifecycle.state ?? "").toUpperCase();
  const reopenEligible = statusUpper === "PENDING"
    && (["RESOLVED", "CLOSED", "REJECTED"].includes(lifecycleStateUp)
      || (lifecycle.dueDateTs != null && lifecycle.dueDateTs < todayStart.getTime()));
  const complaintCardState = resolveComplaintCardState(lifecycle, shipmentStatus, queueSnapshot).toUpperCase();
  const hasKnownComplaint = lifecycle.exists || Boolean(queueSnapshot)
    || Boolean(String(lifecycle.complaintId ?? "").trim() || String(queueSnapshot?.complaintId ?? "").trim())
    || ["ACTIVE", "QUEUED", "OVERDUE", "RETRY PENDING", "MANUAL REVIEW", "SUBMITTED", "DUPLICATE", "RESOLVED"].includes(complaintCardState);
  if (reopenEligible) return true;
  return statusUpper === "PENDING" && !hasKnownComplaint;
}

function summarizeError(raw: string | null | undefined): string | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  if (/500\s*Server\s*Error/i.test(text)) return "Pakistan Post temporarily unavailable";
  if (/tracking\s*(response|data).*(mis|unavail)/i.test(text)) return "Tracking information unavailable";
  if (/unable\s*to\s*map/i.test(text)) return "Delivery office verification failed";
  if (/timeout/i.test(text)) return "Request timed out — retrying";
  return text.length > 60 ? text.substring(0, 57) + "..." : text;
}

function resolveComplaintActionLabel(
  shipmentStatus: string | null | undefined,
  lifecycle: ComplaintLifecycle,
  queueSnapshot: ComplaintQueueSnapshot | undefined,
) {
  const statusUpper = normalizeStatus(shipmentStatus).toUpperCase();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const lifecycleStateUp = String(lifecycle.state ?? "").toUpperCase();
  const hasComplaint = lifecycle.exists
    || Boolean(queueSnapshot)
    || Boolean(String(lifecycle.complaintId ?? "").trim() || String(queueSnapshot?.complaintId ?? "").trim());

  if (!hasComplaint) return "Complaint";

  const queueState = normalizeQueueStatusLabel(queueSnapshot?.complaintStatus);
  if (queueState === "QUEUED") return "Queued for Submission";
  if (queueState === "PROCESSING") return "Submitting to Pakistan Post...";
  if (queueState === "RETRY PENDING") return "Retry Pending";
  if (queueState === "MANUAL REVIEW") return "Complaint requires manual review";

  const dueExpired = lifecycle.dueDateTs != null && lifecycle.dueDateTs < todayStart.getTime();
  const terminal = ["RESOLVED", "CLOSED", "REJECTED"].includes(lifecycleStateUp) || dueExpired;
  if (statusUpper === "PENDING" && terminal) return "Reopen Complaint";

  const reopenedInProgress = lifecycle.latestAttempt > 1 && !terminal;
  if (reopenedInProgress || isComplaintInProcess(lifecycle)) return "In Process";

  return "In Process";
}

function complaintStateBadgeClass(stateLabel: string) {
  const token = String(stateLabel ?? "").trim().toUpperCase();
  if (token === "QUEUED") return "border-slate-200 bg-slate-50 text-slate-700";
  if (token === "OVERDUE") return "border-orange-200 bg-orange-50 text-orange-800";
  if (token === "IN PROCESS") return "border-blue-200 bg-blue-50 text-blue-800";
  if (token === "RETRY PENDING") return "border-amber-200 bg-amber-50 text-amber-800";
  if (token === "RESOLVED" || token === "CLOSED") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (token === "MANUAL REVIEW") return "border-red-200 bg-red-50 text-red-800";
  return "border-violet-200 bg-violet-50 text-violet-800";
}

function isComplaintActionLocked(label: string) {
  const lbl = String(label ?? "").trim();
  return ["In Process", "Queued", "Queued for Submission", "Submitting to Pakistan Post...", "Retry Pending", "Processing failed", "Complaint requires manual review"].includes(lbl);
}

function formatRetryCountdown(nextRetryAt: string | null | undefined, nowMs: number): string {
  const target = nextRetryAt ? new Date(nextRetryAt).getTime() : 0;
  if (!Number.isFinite(target) || target <= 0) return "Retry window pending";
  const delta = Math.max(0, target - nowMs);
  if (delta <= 0) return "Retry due now";
  const minutes = Math.floor(delta / 60_000);
  const seconds = Math.floor((delta % 60_000) / 1000);
  if (minutes <= 0) return `Next retry in ${seconds}s`;
  return `Next retry in ${minutes}m ${seconds}s`;
}

function formatProcessingElapsed(startAt: string | null | undefined, nowMs: number): string {
  const startedMs = startAt ? new Date(startAt).getTime() : 0;
  if (!Number.isFinite(startedMs) || startedMs <= 0) return "00:00:00";
  const elapsed = Math.max(0, nowMs - startedMs);
  const hours = Math.floor(elapsed / 3_600_000);
  const minutes = Math.floor((elapsed % 3_600_000) / 60_000);
  const seconds = Math.floor((elapsed % 60_000) / 1_000);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function friendlyComplaintMessage(raw: string | null | undefined): string {
  const message = String(raw ?? "").trim();
  if (!message) return "Complaint submission failed. Please try again.";
  if (/^[\[{]/.test(message)) return "Complaint submission failed. Please try again.";
  return message;
}

function normalizeOfficeSearch(val: string): string {
  return val
    .toUpperCase()
    .replace(/POST OFFICE/g, "")
    .replace(/DELIVERY OFFICE/g, "")
    .replace(/\bSO\b/g, "")
    .replace(/\bGPO\b/g, "")
    .replace(/\bDPO\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeComplaintCity(val: string): string {
  return String(val ?? "")
    .toUpperCase()
    .replace(/POST OFFICE/g, "")
    .replace(/DELIVERY OFFICE/g, "")
    .replace(/OFFICE/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function editDistance(a: string, b: string): number {
  const s = String(a ?? "");
  const t = String(b ?? "");
  if (!s.length) return t.length;
  if (!t.length) return s.length;
  const dp = Array.from({ length: s.length + 1 }, () => Array(t.length + 1).fill(0));
  for (let i = 0; i <= s.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= t.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= s.length; i += 1) {
    for (let j = 1; j <= t.length; j += 1) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }
  return dp[s.length][t.length];
}

function extractDeliveryOfficeFromLastEvent(raw: any): string {
  const clean = (v: unknown) => {
    const t = String(v ?? "").trim();
    return t === "-" ? "" : t;
  };
  const events = (raw?.tracking as any)?.events ?? raw?.events ?? [];
  if (!Array.isArray(events) || events.length === 0) return "";
  const lastEvent = events[events.length - 1] ?? null;
  const direct = clean(lastEvent?.location ?? lastEvent?.city ?? "");
  const description = clean(lastEvent?.description ?? lastEvent?.detail ?? lastEvent?.status ?? "");
  const fromDescription = description.match(/delivery\s+office\s+(.+?)(?:\.|,|;|$)/i)?.[1] ?? "";
  return clean(fromDescription) || direct;
}

function matchComplaintCityOption(options: string[], preferred: string[]): string {
  const cleaned = preferred.map((item) => normalizeComplaintCity(item)).filter(Boolean);
  for (const want of cleaned) {
    const exact = options.find((opt) => normalizeComplaintCity(opt) === want);
    if (exact) return exact;
  }
  for (const want of cleaned) {
    const soft = options.find((opt) => {
      const norm = normalizeComplaintCity(opt);
      if (!norm) return false;
      if (norm.startsWith(want) || want.startsWith(norm)) {
        return Math.min(norm.length, want.length) >= 5;
      }
      return false;
    });
    if (soft) return soft;
  }
  for (const want of cleaned) {
    const fuzzy = options.find((opt) => {
      const norm = normalizeComplaintCity(opt);
      if (!norm) return false;
      return Math.min(norm.length, want.length) >= 5 && editDistance(norm, want) <= 2;
    });
    if (fuzzy) return fuzzy;
  }
  return "";
}

function searchOfficeRows(
  query: string,
  rows: Array<{ district: string; tehsil: string; location: string }>,
): Array<{ district: string; tehsil: string; location: string }> {
  if (query.length < 3) return [];
  const q = normalizeOfficeSearch(query);
  const scored = rows
    .map((row) => {
      const loc = normalizeOfficeSearch(row.location);
      const teh = normalizeOfficeSearch(row.tehsil);
      const dist = normalizeOfficeSearch(row.district);
      let score = 0;
      let matchLevel: "location" | "tehsil" | "district" | "none" = "none";

      if (loc === q) score = 10;
      else if (loc.startsWith(q)) score = 9;
      else if (loc.includes(q) || q.includes(loc)) score = 8;
      else if (Math.min(loc.length, q.length) >= 5 && editDistance(loc, q) <= 2) score = 7;
      if (score > 0) matchLevel = "location";

      if (score === 0) {
        if (teh.startsWith(q)) score = 6;
        else if (teh.includes(q) || q.includes(teh)) score = 5;
        if (score > 0) matchLevel = "tehsil";
      }

      if (score === 0) {
        if (dist.startsWith(q)) score = 4;
        else if (dist.includes(q) || q.includes(dist)) score = 3;
        if (score > 0) matchLevel = "district";
      }

      return { ...row, score, matchLevel };
    })
    .filter((r) => r.score > 0);
  scored.sort((a, b) => b.score - a.score || a.location.localeCompare(b.location));
  return scored.slice(0, 10);
}

function resolveComplaintHierarchyRow(
  rows: Array<{ district: string; tehsil: string; location: string }>,
  candidates: string[],
): { district: string; tehsil: string; location: string } | null {
  if (!rows || rows.length === 0) return null;
  const cleanCandidates = candidates.map((v) => String(v ?? "").trim()).filter(Boolean);

  // Pass 1: use searchOfficeRows which prioritises location > tehsil > district
  for (const candidate of cleanCandidates) {
    const matches = searchOfficeRows(candidate, rows);
    if (matches.length > 0) return matches[0];
  }

  // Pass 2: exact normalised match against location first, then tehsil, then district
  for (const candidate of cleanCandidates) {
    const want = normalizeComplaintCity(candidate);
    const byLocation = rows.find((row) => normalizeComplaintCity(row.location) === want);
    if (byLocation) return byLocation;
    const byTehsil = rows.find((row) => normalizeComplaintCity(row.tehsil) === want);
    if (byTehsil) return byTehsil;
    const byDistrict = rows.find((row) => normalizeComplaintCity(row.district) === want);
    if (byDistrict) return byDistrict;
  }

  // No match found — return null so UI unlocks for manual selection
  return null;
}

function getUnifiedFields(rawJson?: string | null) {
  try {
    const parsed = rawJson ? JSON.parse(rawJson) : {};
    const tracking = parsed?.tracking && typeof parsed.tracking === "object" ? parsed.tracking : {};
    return {
      TrackingID: String(parsed?.TrackingID ?? "").trim(),
      shipperName: String(parsed?.shipperName ?? "").trim(),
      shipperAddress: String(parsed?.shipperAddress ?? "").trim(),
      senderCity: String(parsed?.senderCity ?? parsed?.BookingCity ?? "").trim(),
      shipperPhone: String(parsed?.shipperPhone ?? "").trim(),
      consigneeName: String(parsed?.consignee_name ?? parsed?.consigneeName ?? "").trim(),
      consigneeAddress: String(parsed?.consignee_address ?? parsed?.consigneeAddress ?? "").trim(),
      consigneeCity: String(parsed?.consigneeCity ?? parsed?.ConsigneeCity ?? parsed?.receiverCity ?? "").trim(),
      consigneePhone: String(parsed?.consignee_phone ?? parsed?.consigneePhone ?? tracking?.consignee_phone ?? "").trim(),
      CollectAmount: String(parsed?.CollectAmount ?? "0").trim() || "0",
      ProductDescription: String(parsed?.ProductDescription ?? "").trim(),
      Weight: String(parsed?.Weight ?? "").trim(),
    };
  } catch {
    return {
      TrackingID: "",
      shipperName: "",
      shipperAddress: "",
      senderCity: "",
      shipperPhone: "",
      consigneeName: "",
      consigneeAddress: "",
      consigneeCity: "",
      consigneePhone: "",
      CollectAmount: "0",
      ProductDescription: "",
      Weight: "",
    };
  }
}

function parseRaw(rawJson?: string | null): Record<string, any> {
  if (!rawJson) return {};
  try {
    const parsed = JSON.parse(rawJson);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function preferredCity(shipment: Shipment): string {
  const raw = parseRaw(shipment.rawJson);
  const computed = String(
    raw?.resolved_delivery_office
    ?? raw?.delivery_office
    ?? raw?.Delivery_Office
    ?? raw?.deliveryOffice
    ?? shipment.city
    ?? "",
  ).trim();
  return computed || "-";
}

function extractMoReference(rawJson?: string | null, linkedMo?: string | null, moneyOrderIssued?: boolean | null) {
  const issuedFromParam = moneyOrderIssued === true;
  const normalized = String(linkedMo ?? "").trim().toUpperCase();
  if (issuedFromParam && normalized) return normalized;
  try {
    const parsed = rawJson ? JSON.parse(rawJson) : {};
    const issuedFromRaw = Boolean((parsed as any)?.moneyOrderIssued);
    if (!issuedFromParam && !issuedFromRaw) return null;
    const rawMo = String((parsed as any)?.moIssuedNumber ?? "").trim().toUpperCase();
    return rawMo || null;
  } catch {
    return null;
  }
}

function extractMoValue(rawJson?: string | null, shipmentMoValue?: number | null) {
  if (typeof shipmentMoValue === "number" && Number.isFinite(shipmentMoValue)) {
    return shipmentMoValue;
  }
  if (!rawJson) return null;
  try {
    const parsed = JSON.parse(rawJson);
    const value = Number(
      parsed?.moIssuedValue ??
      parsed?.collected_amount ??
      parsed?.collect_amount ??
      parsed?.CollectAmount ??
      parsed?.collectAmount ??
      null,
    );
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function normalizeStatus(status?: string | null) {
  const s = String(status ?? "").toUpperCase();
  if (!s || s === "-") return "PENDING";
  if (s === "DELIVERED WITH PAYMENT") return "DELIVERED WITH PAYMENT";
  if (s.includes("DELIVER")) return "DELIVERED";
  if (s.includes("RETURN") || s.includes("RTO")) return "RETURNED";
  return "PENDING";
}

function statusBadgeClass(status?: string | null) {
  const raw = String(status ?? "").trim().toUpperCase();
  const normalized = normalizeStatus(status);
  if (raw.includes("INVESTIGATION") || raw.includes("PROCESS") || raw.includes("ACTIVE")) return "bg-blue-100 text-blue-700 ring-blue-200";
  if (raw.includes("PAYMENT") || raw.includes("MOS") || raw.includes("UMO") || raw.includes("FMO")) return "bg-fuchsia-100 text-fuchsia-700 ring-fuchsia-200";
  if (raw.includes("OUT FOR DELIVERY")) return "bg-violet-100 text-violet-700 ring-violet-200";
  if (raw.includes("FAILED")) return "bg-rose-100 text-rose-700 ring-rose-200";
  if (raw.includes("RETURN")) return "bg-red-100 text-red-700 ring-red-200";
  if (raw.includes("DELIVER")) return "bg-emerald-100 text-emerald-700 ring-emerald-200";
  if (normalized === "PENDING") return "bg-orange-100 text-orange-700 ring-orange-200";
  if (normalized === "RETURNED") return "bg-red-100 text-red-700 ring-red-200";
  return "bg-slate-100 text-slate-700 ring-slate-200";
}

type TimelineEvent = {
  date: string;
  time: string;
  location: string;
  description: string;
};

type TrackingDetailData = {
  fields: ReturnType<typeof getUnifiedFields>;
  timeline: TimelineEvent[];
  presentation: TrackingPresentationModel;
  bookingDate: string;
  lastUpdate: string;
  moIssued: string | null;
  moValue: number | null;
  bookingOffice: string;
  deliveryOffice: string;
  consigneeName: string;
  consigneeAddress: string;
  consigneePhone: string;
};

type TrackingSortKey = "updatedAt" | "bookingDate" | "updatedBy" | "trackingNumber" | "status" | "city" | "moNumber" | "moAmount";

function parseTimelineTimestamp(dateRaw: string, timeRaw: string) {
  const date = String(dateRaw ?? "").trim();
  const time = String(timeRaw ?? "").trim() || "00:00";
  const parsed = new Date(`${date} ${time}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatTrackingTableDateOnly(value: string | number | null | undefined, fallbackMs?: number) {
  const raw = typeof value === "string" ? value.trim() : "";
  const asNumber = typeof value === "number" ? value : Number.NaN;
  let ms: number | null = null;

  if (Number.isFinite(asNumber) && asNumber > 0) {
    ms = asNumber;
  }

  if (ms == null && raw) {
    const normalized = raw.replace(/\./g, "/").replace(/-/g, "/");
    const parts = normalized.split("/").map((p) => p.trim());
    if (parts.length === 3 && parts.every((p) => /^\d+$/.test(p))) {
      let day = parts[0];
      let month = parts[1];
      let year = parts[2];
      if (parts[0].length === 4) {
        year = parts[0];
        month = parts[1];
        day = parts[2];
      }
      const dayNum = Number(day);
      const monthNum = Number(month);
      const yearNum = Number(year);
      if (yearNum >= 1900 && monthNum >= 1 && monthNum <= 12 && dayNum >= 1 && dayNum <= 31) {
        const dt = new Date(yearNum, monthNum - 1, dayNum);
        if (!Number.isNaN(dt.getTime())) {
          ms = dt.getTime();
        }
      }
    }
    if (ms == null) {
      const parsed = new Date(raw);
      if (!Number.isNaN(parsed.getTime())) {
        ms = parsed.getTime();
      }
    }
  }

  if (ms == null && Number.isFinite(fallbackMs) && (fallbackMs as number) > 0) {
    ms = fallbackMs as number;
  }

  if (ms == null) return "-";
  const date = new Date(ms);
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-");
}

function formatBatchDateTime(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return "-";
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return "-";
  return dt.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function dedupeShipmentRows(rows: Shipment[]) {
  const deduped = new Map<string, Shipment>();
  for (const row of rows) {
    const trackingNumber = String(row.trackingNumber ?? "").trim();
    const rowId = String(row.id ?? "").trim();
    const key = trackingNumber || rowId;
    if (!key) continue;
    deduped.set(key, row);
  }
  return Array.from(deduped.values());
}

function resolveShipmentBookingMeta(shipment: Shipment) {
  const timeline = extractTimeline(shipment.rawJson);
  const firstEvent = timeline[0] ?? null;
  const firstEventMs = firstEvent ? parseTimelineTimestamp(firstEvent.date, firstEvent.time)?.getTime() ?? null : null;
  const createdAtMs = new Date(shipment.createdAt).getTime();
  const fallbackMs = Number.isFinite(createdAtMs) ? createdAtMs : 0;
  const effectiveMs = firstEventMs ?? fallbackMs;

  return {
    date: formatTrackingTableDateOnly(firstEvent?.date, effectiveMs),
    ms: effectiveMs,
  };
}

function resolveShipmentUpdatedBy(shipment: Shipment) {
  const raw = parseRaw(shipment.rawJson);
  const trackingRaw = raw?.tracking ?? {};
  const candidates = [
    raw?.updated_by,
    raw?.updatedBy,
    raw?.last_updated_by,
    raw?.lastUpdatedBy,
    raw?.manual_updated_by,
    raw?.manualUpdatedBy,
    raw?.override_by,
    raw?.overrideBy,
    trackingRaw?.updated_by,
    trackingRaw?.updatedBy,
    trackingRaw?.last_updated_by,
    trackingRaw?.lastUpdatedBy,
  ];
  for (const candidate of candidates) {
    const value = String(candidate ?? "").trim();
    if (value) return value;
  }
  if (Boolean(raw?.manual_override)) return "Admin Override";
  return "System";
}

function logTimelineValidation(stage: string, trackingNumber: string, events: TimelineEvent[]) {
  const first = events[0] ? `${events[0].date} ${events[0].time}`.trim() : "-";
  const last = events[events.length - 1] ? `${events[events.length - 1].date} ${events[events.length - 1].time}`.trim() : "-";
  let orderAsc = true;
  let prev: Date | null = null;
  for (const ev of events) {
    const ts = parseTimelineTimestamp(ev.date, ev.time);
    if (prev && ts && ts.getTime() < prev.getTime()) {
      orderAsc = false;
      break;
    }
    if (ts) prev = ts;
  }
  console.log(
    `[TRACE] stage=${stage} tn=${trackingNumber} event_count=${events.length} first_event=${first} last_event=${last} order_asc=${orderAsc}`,
  );
}

function extractTimeline(rawJson?: string | null) {
  const raw = parseRaw(rawJson);
  const events = (raw?.tracking as any)?.events ?? raw?.events ?? [];
  if (Array.isArray(events) && events.length > 0) {
    const parsed = events
      .map((item: any) => ({
        date: String(item?.date ?? "").trim(),
        time: String(item?.time ?? "").trim(),
        location: String(item?.location ?? item?.city ?? "").trim(),
        description: String(item?.description ?? item?.detail ?? item?.status ?? "").trim(),
      }))
      .filter((row) => row.date || row.time || row.location || row.description)
      .sort((a, b) => {
        const ad = parseTimelineTimestamp(a.date, a.time);
        const bd = parseTimelineTimestamp(b.date, b.time);
        const at = ad ? ad.getTime() : 0;
        const bt = bd ? bd.getTime() : 0;
        return at - bt;
      });
    return parsed as TimelineEvent[];
  }

  const history = (raw?.tracking as any)?.history ?? raw?.history ?? [];
  if (!Array.isArray(history)) return [] as TimelineEvent[];
  return history
    .map((item: any): TimelineEvent => {
      if (Array.isArray(item)) {
        return {
          date: String(item[0] ?? "").trim(),
          time: String(item[1] ?? "").trim(),
          location: String(item[3] ?? "").trim(),
          description: String(item[2] ?? "").trim(),
        };
      }
      if (item && typeof item === "object") {
        return {
          date: String(item.date ?? item.latest_date ?? "").trim(),
          time: String(item.time ?? item.latest_time ?? "").trim(),
          location: String(item.location ?? item.city ?? "").trim(),
          description: String(item.description ?? item.status ?? item.detail ?? "").trim(),
        };
      }
      return { date: "", time: "", location: "", description: String(item ?? "").trim() };
    })
    .filter((row) => row.date || row.time || row.description || row.location)
    .sort((a, b) => {
      const ad = parseTimelineTimestamp(a.date, a.time);
      const bd = parseTimelineTimestamp(b.date, b.time);
      const at = ad ? ad.getTime() : 0;
      const bt = bd ? bd.getTime() : 0;
      return at - bt;
    });
}

function escapePrintHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// TRACKING_PRINT_MARKETING_LINE moved to backend printBranding.ts as source of truth

function buildTrackingPrintFileName(now = new Date()) {
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yyyy = String(now.getFullYear());
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  return `Tracking-${dd}-${mm}-${yyyy}-${hh}-${min}.pdf`;
}

function buildPrintMarkup(record: FinalTrackingRecord, detail: TrackingDetailData): string {
  const authoritativeStatus = getAuthoritativeRecordStatus(record);
  const clippedTimeline = detail.timeline.length > 10 ? detail.timeline.slice(0, 10) : detail.timeline;
  const timelineRows = clippedTimeline.length > 0
    ? clippedTimeline.map((item, index) => `
        <tr class="status-item">
          <td>${index + 1}</td>
          <td>${escapePrintHtml(item.date || "-")}</td>
          <td>${escapePrintHtml(item.time || "-")}</td>
          <td>${escapePrintHtml(item.location || "-")}</td>
          <td>${escapePrintHtml(item.description || "-")}</td>
        </tr>`).join("")
    : `
        <tr>
          <td>1</td>
          <td>-</td>
          <td>-</td>
          <td>${escapePrintHtml(preferredCity(record.shipment) || "-")}</td>
          <td>${escapePrintHtml(authoritativeStatus)}</td>
        </tr>`;

  return `
    <section class="print-doc print-container">
      <div class="print-branding print-branding-top"><strong>${escapePrintHtml(PRINT_MARKETING_LINE)}</strong></div>
      <div class="print-panel no-break">
        <div class="print-title">ePost.pk Tracking Print</div>
        <div class="print-subtitle">${escapePrintHtml(record.shipment.trackingNumber)}</div>
        <div class="print-meta-grid">
          <div class="print-meta-card"><div class="print-meta-label">Tracking</div><div class="print-meta-value">${escapePrintHtml(record.shipment.trackingNumber)}</div></div>
          <div class="print-meta-card"><div class="print-meta-label">Status</div><div class="print-meta-value">${escapePrintHtml(authoritativeStatus)}</div></div>
          <div class="print-meta-card"><div class="print-meta-label">Booking Date</div><div class="print-meta-value">${escapePrintHtml(detail.bookingDate)}</div></div>
          <div class="print-meta-card"><div class="print-meta-label">Last Update</div><div class="print-meta-value">${escapePrintHtml(detail.lastUpdate)}</div></div>
          <div class="print-meta-card"><div class="print-meta-label">Sender</div><div class="print-meta-value">${escapePrintHtml(detail.fields.shipperName || "-")}</div></div>
          <div class="print-meta-card"><div class="print-meta-label">Sender City</div><div class="print-meta-value">${escapePrintHtml(detail.fields.senderCity || detail.bookingOffice || "-")}</div></div>
          <div class="print-meta-card print-meta-card-wide"><div class="print-meta-label">Sender Address</div><div class="print-meta-value">${escapePrintHtml(detail.fields.shipperAddress || "-")}</div></div>
          <div class="print-meta-card"><div class="print-meta-label">Consignee</div><div class="print-meta-value">${escapePrintHtml(detail.consigneeName)}</div></div>
          <div class="print-meta-card"><div class="print-meta-label">Receiver City</div><div class="print-meta-value">${escapePrintHtml(detail.deliveryOffice || detail.fields.consigneeCity || "-")}</div></div>
          <div class="print-meta-card print-meta-card-wide"><div class="print-meta-label">Receiver Address</div><div class="print-meta-value">${escapePrintHtml(detail.consigneeAddress)}</div></div>
        </div>
      </div>
      <div class="print-panel status-history">
        <div class="print-section-title">Status History</div>
        <table class="print-history-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Date</th>
              <th>Time</th>
              <th>City</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>${timelineRows}</tbody>
        </table>
        ${detail.timeline.length > 10 ? `<div class="status-item">continued... showing first 10 events</div>` : ""}
      </div>
    </section>`;
}

function normalizePkMobile(input: string): string {
  const digits = String(input ?? "").trim().replace(/\D+/g, "");
  if (/^923[0-9]{9}$/.test(digits)) return `0${digits.slice(2)}`;
  if (/^03[0-9]{9}$/.test(digits)) return digits;
  if (/^3[0-9]{9}$/.test(digits)) return `0${digits}`;
  return "";
}

function detectServiceType(trackingId: string): string {
  const upper = String(trackingId ?? "").trim().toUpperCase();
  const prefix3 = upper.slice(0, 3);
  const prefix2 = upper.slice(0, 2);
  return TRACKING_SERVICE_TYPE_MAP[prefix3] ?? TRACKING_SERVICE_TYPE_MAP[prefix2] ?? "UNKNOWN";
}

function getSheetConsigneeFallback(rawJson?: string | null) {
  try {
    const parsed = rawJson ? JSON.parse(rawJson) : {};
    return {
      consigneeName: String(parsed?.receiver_name ?? parsed?.receiverName ?? parsed?.consigneeName ?? parsed?.ConsigneeName ?? "").trim(),
      consigneeAddress: String(parsed?.receiver_address ?? parsed?.receiverAddress ?? parsed?.consigneeAddress ?? parsed?.ConsigneeAddress ?? "").trim(),
      consigneePhone: String(parsed?.receiver_phone ?? parsed?.receiverPhone ?? parsed?.consigneePhone ?? parsed?.ConsigneePhone ?? "").trim(),
    };
  } catch {
    return { consigneeName: "", consigneeAddress: "", consigneePhone: "" };
  }
}

function getRecordConsignee(shipment: Shipment) {
  const sheet = getSheetConsigneeFallback(shipment.rawJson);
  return {
    consigneeName: String(shipment.consignee_name ?? sheet.consigneeName ?? "").trim(),
    consigneeAddress: String(shipment.consignee_address ?? sheet.consigneeAddress ?? "").trim(),
    consigneePhone: String(shipment.consignee_phone ?? sheet.consigneePhone ?? "").trim(),
  };
}

function applyLocalStatusOverride(rawJson: string | null | undefined, status: string): string {
  const raw = parseRaw(rawJson);
  const manualPendingOverride = status === "PENDING";
  return JSON.stringify({
    ...raw,
    final_status: status,
    system_status: status,
    System_Status: status,
    manual_override: true,
    manual_status: status,
    manual_pending_override: manualPendingOverride,
    complaint_eligible: manualPendingOverride ? true : raw.complaint_eligible,
  });
}

function isManualOverrideShipment(shipment: Shipment): boolean {
  const raw = parseRaw(shipment.rawJson);
  return Boolean(raw?.manual_override) && Boolean(String(raw?.manual_status ?? "").trim());
}

function getAuthoritativeRecordStatus(record: FinalTrackingRecord): string {
  const shipment = record.shipment;
  if (!isManualOverrideShipment(shipment)) {
    return String(record.final_status ?? "").trim() || "PENDING";
  }
  const manualStatus = String(parseRaw(shipment.rawJson)?.manual_status ?? "").trim();
  return manualStatus ? normalizeStatus(manualStatus) : normalizeStatus(record.final_status);
}

export default function BulkTracking() {
  const { me } = useOutletContext<ShellCtx>();
  const [searchParams] = useSearchParams();
  const userCacheScope = me?.user?.id ?? null;
  const hasAuthenticatedUser = Boolean(userCacheScope);
  const isAdmin = getRole() === "ADMIN";
  const complaintPhoneStorageKey = buildScopedCacheKey(COMPLAINT_PHONE_STORAGE_KEY, userCacheScope);
  const complaintEmailStorageKey = buildScopedCacheKey(COMPLAINT_EMAIL_STORAGE_KEY, userCacheScope);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<TrackResult[] | null>(null);
  const [shipments, setShipments] = useState<Shipment[]>(() => readInitialWorkspaceRenderCache(userCacheScope)?.shipments ?? []);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [uiState, setUiState] = useState<"idle" | "uploading" | "processing" | "completed" | "failed">("idle");
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [estimatedTotalSec, setEstimatedTotalSec] = useState<number | null>(null);
  const [showRechargeAlert, setShowRechargeAlert] = useState(false);
  const [serviceFailureCount, setServiceFailureCount] = useState(0);
  const [jobStartTime, setJobStartTime] = useState<number | null>(null);
  const [recordCount, setRecordCount] = useState(0);
  const [detectedUploadKind, setDetectedUploadKind] = useState<TrackingUploadFileKind>("unknown file");
  const [detectedTrackingCount, setDetectedTrackingCount] = useState(0);
  const [showNoTrackingModal, setShowNoTrackingModal] = useState(false);
  const [batchHistory, setBatchHistory] = useState<TrackingBatchHistoryItem[]>([]);
  const [batchHistoryLoading, setBatchHistoryLoading] = useState(false);
  const [batchActionLoadingId, setBatchActionLoadingId] = useState<string | null>(null);
  const [showBatchHistory, setShowBatchHistory] = useState(false);
  const [refreshSummary, setRefreshSummary] = useState<string | null>(() => {
    const cached = readInitialWorkspaceRenderCache(userCacheScope);
    if (!Array.isArray(cached?.shipments) || cached.shipments.length === 0) return null;
    return `Restored ${cached.shipments.length} cached tracking rows. Syncing latest updates in the background.`;
  });
  const [refreshingPending, setRefreshingPending] = useState(false);
  const [resolvingTrackingNumber, setResolvingTrackingNumber] = useState<string | null>(null);
  const [selectedTracking, setSelectedTracking] = useState<FinalTrackingRecord | null>(null);
  const { refreshShipmentStats, shipmentStatsFetchedAt } = useShipmentStats(userCacheScope);
  const [pageSize, setPageSize] = useState<20 | 50 | 100>(() => readInitialWorkspaceViewState(userCacheScope)?.pageSize ?? 20);
  const [statusFilter, setStatusFilter] = useState<ExtendedStatusFilter>(() => readInitialWorkspaceViewState(userCacheScope)?.statusFilter ?? "ALL");
  const [searchInput, setSearchInput] = useState(() => readInitialWorkspaceViewState(userCacheScope)?.searchInput ?? "");
  const [searchTerm, setSearchTerm] = useState(() => readInitialWorkspaceViewState(userCacheScope)?.searchTerm ?? "");
  const [sortKey, setSortKey] = useState<TrackingSortKey>(() => {
    const value = String(readInitialWorkspaceViewState(userCacheScope)?.sortKey ?? "updatedAt").trim();
    const allowed: TrackingSortKey[] = ["updatedAt", "bookingDate", "updatedBy", "trackingNumber", "status", "city", "moNumber", "moAmount"];
    return allowed.includes(value as TrackingSortKey) ? (value as TrackingSortKey) : "updatedAt";
  });
  const [sortDir, setSortDir] = useState<"asc" | "desc">(() => readInitialWorkspaceViewState(userCacheScope)?.sortDir ?? "desc");
  const [page, setPage] = useState(() => Math.max(1, readInitialWorkspaceViewState(userCacheScope)?.page ?? 1));
  const [totalShipments, setTotalShipments] = useState(() => readInitialWorkspaceRenderCache(userCacheScope)?.total ?? 0);
  const [auditRows, setAuditRows] = useState<CycleAuditRecord[]>([]);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditSummary, setAuditSummary] = useState<string | null>(null);
  const [auditDrafts, setAuditDrafts] = useState<Record<string, CycleAuditDraft>>({});
  const [savingCorrections, setSavingCorrections] = useState(false);
  const [importingCSV, setImportingCSV] = useState(false);
  const [complaintRecord, setComplaintRecord] = useState<FinalTrackingRecord | null>(null);
  const [complaintPhone, setComplaintPhone] = useState("");
  const [complaintEmail, setComplaintEmail] = useState("");
  const [replyMode, setReplyMode] = useState<"POST" | "EMAIL" | "SMS">("POST");
  const [complaintReason, setComplaintReason] = useState("Pending Delivery");
  const [complainantNameInput, setComplainantNameInput] = useState("");
  const [senderNameInput, setSenderNameInput] = useState("");
  const [senderAddressInput, setSenderAddressInput] = useState("");
  const [receiverNameInput, setReceiverNameInput] = useState("");
  const [receiverAddressInput, setReceiverAddressInput] = useState("");
  const [senderCityValue, setSenderCityValue] = useState("");
  const [senderCitySearch, setSenderCitySearch] = useState("");
  const [receiverCityValue, setReceiverCityValue] = useState("");
  const [receiverCitySearch, setReceiverCitySearch] = useState("");
  const [complaintText, setComplaintText] = useState("");
  const [complaintTemplate, setComplaintTemplate] = useState<ComplaintTemplateKey>("NORMAL");
  const [complaintPrefill, setComplaintPrefill] = useState<ComplaintPrefill | null>(null);
  const [complaintPrefillLoading, setComplaintPrefillLoading] = useState(false);
  const [complaintSubmitResult, setComplaintSubmitResult] = useState<{
    complaintNumber: string;
    dueDate: string;
    trackingId: string;
    status: string;
  } | null>(null);
  const [complaintSubmitNotice, setComplaintSubmitNotice] = useState<{ kind: "info" | "warning" | "error"; message: string } | null>(null);
  const [complaintToast, setComplaintToast] = useState<{ kind: "info" | "warning" | "error"; message: string } | null>(null);
  const [complaintQueueByTracking, setComplaintQueueByTracking] = useState<Map<string, ComplaintQueueSnapshot>>(() => complaintQueueRowsToMap(readInitialWorkspaceRenderCache(userCacheScope)?.complaintQueue ?? []));
  const [retryCountdownNow, setRetryCountdownNow] = useState(Date.now());
  const [complaintSelectionMode, setComplaintSelectionMode] = useState<"district" | "tehsil" | "location">("location");
  const [complaintSelectionLocked, setComplaintSelectionLocked] = useState(false);
  const [officeSearchQuery, setOfficeSearchQuery] = useState("");
  const [officeSearchResults, setOfficeSearchResults] = useState<Array<{ district: string; tehsil: string; location: string }>>([]);
  const [officeSearchLoading, setOfficeSearchLoading] = useState(false);
  const [hoveredPieLabel, setHoveredPieLabel] = useState<string | null>(null);
  const [selectedDistrict, setSelectedDistrict] = useState("");
  const [selectedTehsil, setSelectedTehsil] = useState("");
  const [selectedLocation, setSelectedLocation] = useState("");
  const [submittingComplaint, setSubmittingComplaint] = useState(false);
  const [complaintPreviewVisible, setComplaintPreviewVisible] = useState(false);
  const [complaintValidationState, setComplaintValidationState] = useState<Record<string, boolean>>({});
  const [showServiceAlert, setShowServiceAlert] = useState(false);
  const [historyModalRecord, setHistoryModalRecord] = useState<FinalTrackingRecord | null>(null);
  const importFileInputRef = useRef<HTMLInputElement>(null);
  const backgroundQueueRef = useRef<string[]>([]);
  const backgroundSeenRef = useRef(new Set<string>());
  const backgroundRunningRef = useRef(false);
  const trackingCacheRef = useRef<{ shipments: Shipment[]; total: number; fetchedAt: number } | null>(null);
  const complaintQueueCacheRef = useRef<{ rows: ComplaintQueueSnapshot[]; fetchedAt: number; inFlight: Promise<Map<string, ComplaintQueueSnapshot>> | null }>({
    rows: readInitialWorkspaceRenderCache(userCacheScope)?.complaintQueue ?? [],
    fetchedAt: readInitialWorkspaceRenderCache(userCacheScope)?.latestSyncAt ?? 0,
    inFlight: null,
  });
  const shipmentsRefreshInFlightRef = useRef(false);
  const shipmentsRefreshPendingRef = useRef(false);
  const scrollRestorePendingRef = useRef(Boolean(readInitialWorkspaceViewState(userCacheScope)?.scrollY));
  const previousUserCacheScopeRef = useRef<string | null | undefined>(userCacheScope);
  const submitTrackingRef = useRef(false);
  const complaintPrefillRequestRef = useRef(0);
  const complaintModalRef = useRef<HTMLDivElement | null>(null);
  const complaintFirstInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    console.info("[tracking] mount", {
      userId: userCacheScope,
      hasAuthenticatedUser,
      isAdmin,
    });
  }, [hasAuthenticatedUser, isAdmin, userCacheScope]);

  const polling = useTrackingJobPolling({
    onDone: (res) => {
      submitTrackingRef.current = false;
      if (Array.isArray(res)) {
        const results = res as TrackResult[];
        setResults(results);
        // Count service failures
        const failures = results.filter(r => r.status === "SERVICE_UNAVAILABLE").length;
        setServiceFailureCount(failures);
      }
    },
  });

  useEffect(() => {
    if (polling.jobStatus === "FAILED" || polling.jobStatus === "COMPLETED") {
      submitTrackingRef.current = false;
      void refreshBatchHistory();
      if (polling.jobStatus === "COMPLETED") {
        // Force-refresh shipments so the table and cards reflect the completed batch result.
        // Without this, the 60-second cache populated before the job ran prevents the UI
        // from showing the actual rows written by the worker on job completion.
        void refreshShipments({ force: true });
      }
    }
  }, [polling.jobStatus]);

  useEffect(() => {
    if (!userCacheScope) {
      console.info("[tracking] skipped batch history refresh without authenticated user");
      return;
    }
    void refreshBatchHistory();
  }, [userCacheScope]);

  useEffect(() => {
    if (!userCacheScope) {
      console.info("[tracking] skipped complaint cache restore without authenticated user");
      return;
    }
    const saved = window.localStorage.getItem(complaintPhoneStorageKey);
    if (saved && !complaintPhone) {
      setComplaintPhone(saved);
    }
    const savedEmail = window.localStorage.getItem(complaintEmailStorageKey);
    if (savedEmail && !complaintEmail) {
      setComplaintEmail(savedEmail);
    }
  }, [complaintEmail, complaintEmailStorageKey, complaintPhone, complaintPhoneStorageKey, userCacheScope]);

  useEffect(() => {
    if (previousUserCacheScopeRef.current === userCacheScope) return;
    console.info("[tracking] user scope changed", {
      previousUserId: previousUserCacheScopeRef.current ?? null,
      nextUserId: userCacheScope,
    });
    previousUserCacheScopeRef.current = userCacheScope;
    initialWorkspaceRenderCacheScope = undefined;
    initialWorkspaceRenderCache = undefined;
    initialWorkspaceViewStateScope = undefined;
    initialWorkspaceViewState = undefined;
    trackingCacheRef.current = null;
    complaintQueueCacheRef.current = { rows: [], fetchedAt: 0, inFlight: null };
    setShipments([]);
    setSelectedIds([]);
    setUiState("idle");
    setProgress(0);
    setElapsed(0);
    setEstimatedTotalSec(null);
    setShowRechargeAlert(false);
    setServiceFailureCount(0);
    setJobStartTime(null);
    setRecordCount(0);
    setDetectedUploadKind("unknown file");
    setDetectedTrackingCount(0);
    setShowNoTrackingModal(false);
    setBatchHistory([]);
    setBatchHistoryLoading(false);
    setBatchActionLoadingId(null);
    setShowBatchHistory(false);
    setRefreshSummary(null);
    setRefreshingPending(false);
    setSelectedTracking(null);
    setAuditRows([]);
    setAuditError(null);
    setAuditLoading(false);
    setAuditSummary(null);
    setAuditDrafts({});
    setSavingCorrections(false);
    setImportingCSV(false);
    setComplaintRecord(null);
    setComplaintPhone("");
    setComplaintEmail("");
    setReplyMode("POST");
    setComplaintReason("Pending Delivery");
    setComplainantNameInput("");
    setSenderNameInput("");
    setSenderAddressInput("");
    setReceiverNameInput("");
    setReceiverAddressInput("");
    setSenderCityValue("");
    setSenderCitySearch("");
    setReceiverCityValue("");
    setReceiverCitySearch("");
    setComplaintText("");
    setComplaintTemplate("NORMAL");
    setComplaintPrefill(null);
    setComplaintPrefillLoading(false);
    setComplaintSubmitResult(null);
    setComplaintSubmitNotice(null);
    setComplaintToast(null);
    setComplaintQueueByTracking(new Map());
    setRetryCountdownNow(Date.now());
    setComplaintSelectionMode("location");
    setComplaintSelectionLocked(false);
    setOfficeSearchQuery("");
    setOfficeSearchResults([]);
    setOfficeSearchLoading(false);
    setHoveredPieLabel(null);
    setSelectedDistrict("");
    setSelectedTehsil("");
    setSelectedLocation("");
    setSubmittingComplaint(false);
    setComplaintPreviewVisible(false);
    setComplaintValidationState({});
    setShowServiceAlert(false);
    setHistoryModalRecord(null);
    setHydrated(false);
  }, [userCacheScope]);

  useEffect(() => {
    if (!userCacheScope) {
      console.info("[tracking] skipped scoped cache restore without authenticated user");
      return;
    }
    let active = true;
    const cached = readInitialWorkspaceRenderCache(userCacheScope);
    console.info("[tracking] restoring workspace render cache", {
      userId: userCacheScope,
      hasCachedRows: Array.isArray(cached?.shipments) && cached.shipments.length > 0,
    });
    if (Array.isArray(cached?.shipments) && cached.shipments.length > 0) {
      trackingCacheRef.current = {
        shipments: cached.shipments,
        total: cached.total ?? cached.shipments.length,
        fetchedAt: cached.fetchedAt,
      };
      complaintQueueCacheRef.current = {
        rows: cached.complaintQueue ?? [],
        fetchedAt: cached.latestSyncAt || cached.fetchedAt,
        inFlight: null,
      };
      applyShipmentsSnapshot(cached.shipments, cached.total ?? cached.shipments.length);
      if (isAdmin && cached.complaintQueue?.length) {
        setComplaintQueueByTracking(complaintQueueRowsToMap(cached.complaintQueue));
      }
    }

    async function hydrateFullWorkspaceSnapshot() {
      const snapshot = await readTrackingWorkspaceSnapshotForScope<Shipment, ComplaintQueueSnapshot>(userCacheScope);
      console.info("[tracking] restoring workspace snapshot", {
        userId: userCacheScope,
        hasSnapshotRows: Array.isArray(snapshot?.shipments) && snapshot.shipments.length > 0,
      });
      if (!active || !Array.isArray(snapshot?.shipments) || snapshot.shipments.length === 0) return;
      trackingCacheRef.current = {
        shipments: snapshot.shipments,
        total: snapshot.total ?? snapshot.shipments.length,
        fetchedAt: snapshot.fetchedAt,
      };
      complaintQueueCacheRef.current = {
        rows: snapshot.complaintQueue ?? [],
        fetchedAt: snapshot.latestSyncAt || snapshot.fetchedAt,
        inFlight: null,
      };
      applyShipmentsSnapshot(snapshot.shipments, snapshot.total ?? snapshot.shipments.length);
      if (isAdmin && snapshot.complaintQueue?.length) {
        setComplaintQueueByTracking(complaintQueueRowsToMap(snapshot.complaintQueue));
      }
      setRefreshSummary(`Loaded ${snapshot.shipments.length.toLocaleString()} cached tracking rows. Syncing latest updates in the background.`);
    }

    void hydrateFullWorkspaceSnapshot().finally(() => {
      if (active) {
        void refreshShipments();
      }
    });

    return () => {
      active = false;
    };
  }, [isAdmin, userCacheScope]);

  useEffect(() => {
    if (!userCacheScope) return;
    const state = readInitialWorkspaceViewState(userCacheScope);
    if (!state?.scrollY || !scrollRestorePendingRef.current || shipments.length === 0) return;
    const raf = window.requestAnimationFrame(() => {
      window.scrollTo({ top: state.scrollY, behavior: "auto" });
      scrollRestorePendingRef.current = false;
    });
    return () => window.cancelAnimationFrame(raf);
  }, [shipments.length, userCacheScope]);

  useEffect(() => {
    if (!userCacheScope) return;
    writeTrackingWorkspaceViewStateForScope<ExtendedStatusFilter>({
      page,
      pageSize,
      statusFilter,
      searchInput,
      searchTerm,
      sortKey,
      sortDir,
      scrollY: typeof window !== "undefined" ? window.scrollY : 0,
      savedAt: Date.now(),
    }, userCacheScope);
  }, [page, pageSize, searchInput, searchTerm, sortDir, sortKey, statusFilter, userCacheScope]);

  useEffect(() => {
    if (!userCacheScope) return;
    const handleScroll = () => {
      writeTrackingWorkspaceViewStateForScope<ExtendedStatusFilter>({
        page,
        pageSize,
        statusFilter,
        searchInput,
        searchTerm,
        sortKey,
        sortDir,
        scrollY: window.scrollY,
        savedAt: Date.now(),
      }, userCacheScope);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [page, pageSize, searchInput, searchTerm, sortDir, sortKey, statusFilter, userCacheScope]);

  useEffect(() => {
    const timer = window.setInterval(() => setRetryCountdownNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const rawStatus = String(searchParams.get("status") ?? "").trim().toUpperCase();
    if (!rawStatus) return;
    const validFilters: ExtendedStatusFilter[] = [
      "ALL",
      "DELIVERED",
      "PENDING",
      "RETURNED",
      "COMPLAINT_TOTAL",
      "COMPLAINT_ACTIVE",
      "COMPLAINT_CLOSED",
      "COMPLAINT_REOPENED",
      "COMPLAINT_IN_PROCESS",
      "COMPLAINT_WATCH",
    ];
    const resolved = validFilters.includes(rawStatus as ExtendedStatusFilter)
      ? (rawStatus as ExtendedStatusFilter)
      : "ALL";
    setStatusFilter((current) => (current === resolved ? current : resolved));
    setPage(1);
  }, [searchParams]);

  useEffect(() => {
    if (!complaintToast) return;
    const timer = window.setTimeout(() => setComplaintToast(null), 5000);
    return () => window.clearTimeout(timer);
  }, [complaintToast]);

  const unresolvedComplaintCount = useMemo(() => {
    if (!isAdmin) return 0;
    let unresolved = 0;
    for (const shipment of shipments) {
      const lifecycle = parseComplaintLifecycle(shipment);
      const queueSnapshot = complaintQueueByTracking.get(shipment.trackingNumber);
      if (!queueSnapshot) continue;
      const raw = parseRaw(shipment.rawJson);
      const effectiveShipmentStatus = Boolean(raw?.manual_pending_override)
        ? "PENDING"
        : normalizeStatus(shipment.status);
      const cardState = resolveComplaintCardState(lifecycle, effectiveShipmentStatus, queueSnapshot).toUpperCase();
      const hasComplaintId = Boolean(String(lifecycle.complaintId ?? "").trim() || String(queueSnapshot.complaintId ?? "").trim());
      const resolved = hasComplaintId || ["ACTIVE", "RESOLVED", "CLOSED", "REJECTED"].includes(cardState);
      if (!resolved && ["QUEUED", "OVERDUE", "RETRY PENDING"].includes(cardState)) {
        unresolved += 1;
      }
    }
    return unresolved;
  }, [isAdmin, shipments, complaintQueueByTracking]);

  useEffect(() => {
    if (!isAdmin || unresolvedComplaintCount <= 0) return;
    const timer = window.setInterval(() => {
      void refreshComplaintQueueSnapshot();
      void refreshShipments();
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [isAdmin, unresolvedComplaintCount]);

  // Extra rapid refresh when any complaint card has been in PROCESSING beyond the
  // stale threshold — the backend rescue will have fired but the UI needs to pick up
  // the new retry_pending/manual_review state without a page reload.
  useEffect(() => {
    if (!isAdmin) return;
    const hasStaleProcessing = Array.from(complaintQueueByTracking.values()).some((snapshot) => {
      if (String(snapshot?.complaintStatus ?? "").toLowerCase() !== "processing") return false;
      const updatedMs = snapshot?.updatedAt ? new Date(snapshot.updatedAt).getTime() : 0;
      return updatedMs > 0 && Date.now() - updatedMs > COMPLAINT_PROCESSING_STALE_UI_MS;
    });
    if (!hasStaleProcessing) return;
    const timer = window.setInterval(() => {
      void refreshComplaintQueueSnapshot({ force: true });
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [isAdmin, complaintQueueByTracking]);

  useEffect(() => {
    let interval: number;
    if (uiState === "processing") {
      // Refresh shipments every 1s to show live progress one by one
      interval = window.setInterval(refreshShipments, 1000);
    }
    return () => {
      if (interval) window.clearInterval(interval);
    };
  }, [uiState]);

  useEffect(() => {
    const prevBodyOverflowX = document.body.style.overflowX;
    const prevHtmlOverflowX = document.documentElement.style.overflowX;
    document.body.style.overflowX = "hidden";
    document.documentElement.style.overflowX = "hidden";
    return () => {
      document.body.style.overflowX = prevBodyOverflowX;
      document.documentElement.style.overflowX = prevHtmlOverflowX;
    };
  }, []);

  useEffect(() => {
    // Show live results during processing by filtering shipments updated after job start
    if (uiState === "processing" && jobStartTime) {
      const live = shipments.filter((s) => new Date(s.updatedAt).getTime() >= jobStartTime);
      if (live.length > 0) {
        const mapped: TrackResult[] = live.map((s) => ({
          tracking_number: s.trackingNumber,
          status: s.status ?? "-",
          city: preferredCity(s),
          latest_date: new Date(s.updatedAt).toLocaleDateString(),
          latest_time: new Date(s.updatedAt).toLocaleTimeString(),
          days_passed: 0,
        }));
        setResults(mapped);
      }
    }
  }, [shipments, uiState, jobStartTime]);

  async function refreshComplaintQueueSnapshot(options?: { force?: boolean }) {
    if (!isAdmin) {
      return complaintQueueByTracking;
    }
    const cachedRows = complaintQueueCacheRef.current.rows;
    const cacheFresh = Boolean(
      cachedRows.length > 0
      && complaintQueueCacheRef.current.fetchedAt > 0
      && Date.now() - complaintQueueCacheRef.current.fetchedAt < COMPLAINT_QUEUE_CACHE_TTL_MS,
    );
    if (!options?.force && cacheFresh) {
      const cachedMap = complaintQueueRowsToMap(cachedRows);
      if (complaintQueueByTracking.size === 0) {
        setComplaintQueueByTracking(cachedMap);
      }
      return cachedMap;
    }
    if (complaintQueueCacheRef.current.inFlight) {
      return complaintQueueCacheRef.current.inFlight;
    }

    const request = (async () => {
      try {
        const data = await api<{ queue: ComplaintQueueSnapshot[] }>("/api/admin/complaints/monitor");
        const rows = Array.isArray(data.queue) ? data.queue : [];
        const map = complaintQueueRowsToMap(rows);
        complaintQueueCacheRef.current = { rows, fetchedAt: Date.now(), inFlight: null };
        setComplaintQueueByTracking(map);
        return map;
      } catch {
        return complaintQueueRowsToMap(complaintQueueCacheRef.current.rows);
      } finally {
        complaintQueueCacheRef.current.inFlight = null;
      }
    })();

    complaintQueueCacheRef.current.inFlight = request;
    return request;
  }

  function schedulePostSubmitRefresh() {
    void refreshShipments({ force: true });
    if (isAdmin) {
      void refreshComplaintQueueSnapshot({ force: true });
    }
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      void refreshShipments({ force: true });
      if (isAdmin) {
        void refreshComplaintQueueSnapshot({ force: true });
      }
      if (attempts >= 2) {
        window.clearInterval(timer);
      }
    }, 1500);
  }

  // PROTECTED RENDER PATH: DO NOT MODIFY WITHOUT EXPLICIT APPROVAL.
  // Batch history contracts are tied to production API workflow and unit accounting.
  async function refreshBatchHistory() {
    setBatchHistoryLoading(true);
    try {
      const data = await api<{ success: boolean; batches: TrackingBatchHistoryItem[] }>("/api/tracking/batches?limit=100");
      setBatchHistory(Array.isArray(data.batches) ? data.batches : []);
    } catch {
      setBatchHistory([]);
    } finally {
      setBatchHistoryLoading(false);
    }
  }

  async function runSavedBatch(batchId: string) {
    if (!batchId) return;
    setBatchActionLoadingId(batchId);
    setError(null);
    setShowRechargeAlert(false);
    setShowServiceAlert(false);
    try {
      const res = await api<{ success: boolean; jobId: string; recordCount: number }>(`/api/tracking/batches/${encodeURIComponent(batchId)}/run`, {
        method: "POST",
      });
      submitTrackingRef.current = true;
      setStatusFilter("ALL");
      setPage(1);
      setJobStartTime(Date.now());
      setRecordCount(Number(res.recordCount ?? 0));
      setEstimatedTotalSec(Math.ceil((Math.max(1, Number(res.recordCount ?? 0))) * 0.4));
      setUiState("processing");
      setProgress(5);
      setElapsed(0);
      polling.start(res.jobId);
      await refreshShipments({ force: true });
      await refreshBatchHistory();
    } catch (e) {
      submitTrackingRef.current = false;
      const msg = e instanceof Error ? e.message : "Failed to run saved batch";
      setError(msg);
      setUiState("failed");
      setProgress(100);
      if (msg.match(/(credit|balance|recharge|quota|limit)/i)) {
        setShowRechargeAlert(true);
      }
    } finally {
      setBatchActionLoadingId(null);
    }
  }

  async function deleteSavedBatch(batchId: string) {
    if (!batchId) return;
    if (!window.confirm("Delete this tracking batch from workspace history?")) return;
    setBatchActionLoadingId(batchId);
    try {
      await api(`/api/tracking/batches/${encodeURIComponent(batchId)}`, { method: "DELETE" });
      await refreshBatchHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete batch");
    } finally {
      setBatchActionLoadingId(null);
    }
  }

  function downloadSavedBatchMaster(batchId: string) {
    triggerBrowserDownload(`/api/tracking/batches/${encodeURIComponent(batchId)}/master-file`, `${batchId}-tracking-master.xlsx`);
  }

  function applyShipmentsSnapshot(allRows: Shipment[], total: number) {
    const dedupedRows = dedupeShipmentRows(Array.isArray(allRows) ? allRows : []);
    const normalizedTotal = Number.isFinite(total) && total > 0
      ? Math.max(total, dedupedRows.length)
      : dedupedRows.length;
    setShipments(dedupedRows);
    setTotalShipments(normalizedTotal);
  }

  function queueOptimisticComplaintState(input: { trackingId: string; status: ComplaintQueueSnapshot["complaintStatus"]; complaintId?: string; dueDate?: string }) {
    const trackingId = String(input.trackingId ?? "").trim();
    if (!trackingId) return;
    setComplaintQueueByTracking((prev) => {
      const next = new Map(prev);
      next.set(trackingId, {
        id: `local-${trackingId}`,
        trackingId,
        complaintStatus: input.status,
        complaintId: input.complaintId ? String(input.complaintId).trim() : null,
        dueDate: input.dueDate ? String(input.dueDate).trim() : null,
        nextRetryAt: null,
        retryCount: 0,
        updatedAt: new Date().toISOString(),
      });
      return next;
    });
  }

  async function fetchShipmentsFromServer() {
    const hardLimit = 200;
    const firstPage = await api<{ shipments: Shipment[]; total: number; page: number; limit: number }>(`/api/shipments?page=1&limit=${hardLimit}`);
    const total = Math.max(0, Number(firstPage.total ?? 0));
    const firstRows = Array.isArray(firstPage.shipments) ? firstPage.shipments : [];
    if (firstRows.length < hardLimit || total <= firstRows.length) {
      const deduped = dedupeShipmentRows(firstRows);
      return { allRows: deduped, total: Math.max(total, deduped.length) };
    }

    const totalPages = Math.min(50, Math.ceil(total / hardLimit));
    const remainingPages = Array.from({ length: Math.max(0, totalPages - 1) }, (_, index) => index + 2);
    const remainingResults = await Promise.all(
      remainingPages.map((pageNumber) => api<{ shipments: Shipment[]; total: number; page: number; limit: number }>(`/api/shipments?page=${pageNumber}&limit=${hardLimit}`)),
    );
    const allRows = [
      ...firstRows,
      ...remainingResults.flatMap((pageResult) => Array.isArray(pageResult.shipments) ? pageResult.shipments : []),
    ];

    const deduped = dedupeShipmentRows(allRows);
    return { allRows: deduped, total: Math.max(total, deduped.length) };
  }

  async function fetchShipmentsDiff(rows: Shipment[]) {
    const payload = rows
      .map((row) => ({
        trackingNumber: String(row.trackingNumber ?? "").trim(),
        updatedAt: String(row.updatedAt ?? "").trim(),
      }))
      .filter((row) => row.trackingNumber && row.updatedAt);

    if (payload.length === 0) {
      return { changedRows: [] as Shipment[], unchangedCount: 0 };
    }

    return api<{ changedRows: Shipment[]; unchangedCount: number }>("/api/shipments/diff", {
      method: "POST",
      body: JSON.stringify({ rows: payload }),
    });
  }

  function applyChangedRows(baseRows: Shipment[], changedRows: Shipment[]) {
    if (!Array.isArray(changedRows) || changedRows.length === 0) return baseRows;

    const patchMap = new Map<string, Shipment>();
    for (const row of changedRows) {
      const key = String(row.trackingNumber ?? "").trim();
      if (key) patchMap.set(key, row);
    }

    if (patchMap.size === 0) return baseRows;

    const next = baseRows.map((row) => {
      const key = String(row.trackingNumber ?? "").trim();
      const patched = patchMap.get(key);
      if (!patched) return row;
      patchMap.delete(key);
      return patched;
    });

    for (const extra of patchMap.values()) {
      next.push(extra);
    }

    return dedupeShipmentRows(next);
  }

  async function refreshSupportingWorkspaceData(options?: { force?: boolean }) {
    await Promise.all([
      refreshShipmentStats({ force: options?.force }),
      refreshComplaintQueueSnapshot({ force: options?.force }),
    ]);
  }

  async function revalidateShipmentsInBackground(options?: { forceFull?: boolean }) {
    if (shipmentsRefreshInFlightRef.current) {
      shipmentsRefreshPendingRef.current = true;
      return;
    }

    shipmentsRefreshInFlightRef.current = true;
    try {
      const cachedRows = trackingCacheRef.current?.shipments ?? [];
      const hasCachedRows = cachedRows.length > 0;
      const cachedTotal = trackingCacheRef.current?.total ?? cachedRows.length;
      const cappedCache = hasCachedRows && cachedRows.length < cachedTotal;
      let nextRows: Shipment[];
      let nextTotal: number;

      if (hasCachedRows && !options?.forceFull && !cappedCache) {
        try {
          const diff = await fetchShipmentsDiff(cachedRows);
          nextRows = applyChangedRows(cachedRows, Array.isArray(diff.changedRows) ? diff.changedRows : []);
          nextTotal = trackingCacheRef.current?.total ?? nextRows.length;
        } catch {
          const full = await fetchShipmentsFromServer();
          nextRows = full.allRows;
          nextTotal = full.total ?? full.allRows.length;
        }
      } else {
        const full = await fetchShipmentsFromServer();
        nextRows = full.allRows;
        nextTotal = full.total ?? full.allRows.length;
      }

      const fetchedAt = Date.now();
      trackingCacheRef.current = { shipments: nextRows, total: nextTotal, fetchedAt };

      console.log(`[TRACE] stage=FRONTEND_RECEIVED_DATA shipments=${nextRows.length}`);
      for (const row of getFinalTrackingData(nextRows)) {
        console.log(`FRONTEND_DISPLAY_STATUS = "${row.final_status}" tn=${row.shipment.trackingNumber}`);
      }

      applyShipmentsSnapshot(nextRows, nextTotal);
      setRefreshSummary(`Synced ${nextRows.length.toLocaleString()} tracking rows at ${new Date(fetchedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}.`);
      void refreshSupportingWorkspaceData({ force: options?.forceFull });
    } finally {
      shipmentsRefreshInFlightRef.current = false;
      if (shipmentsRefreshPendingRef.current) {
        shipmentsRefreshPendingRef.current = false;
        void revalidateShipmentsInBackground();
      }
    }
  }

  async function refreshShipments(options?: { force?: boolean }) {
    const cached = trackingCacheRef.current;
    const cacheFresh = Boolean(cached && Date.now() - cached.fetchedAt < TRACKING_CACHE_TTL_MS);
    const cappedCache = Boolean(cached && cached.shipments.length > 0 && cached.shipments.length < (cached.total ?? cached.shipments.length));

    if (cached && !options?.force) {
      applyShipmentsSnapshot(cached.shipments, cached.total);
      void refreshSupportingWorkspaceData({ force: options?.force });
      if (cacheFresh && !cappedCache) {
        return;
      }
    }

    await revalidateShipmentsInBackground({ forceFull: options?.force });
  }

  async function refreshAllPending() {
    if (shipments.length === 0) return;
    setRefreshingPending(true);
    try {
      // Get the final tracking data to identify pending shipments
      const finalData = getFinalTrackingData(shipments);
      const pendingShipments = finalData
        .filter(record => normalizeStatus(getAuthoritativeRecordStatus(record)) === "PENDING")
        .map(record => record.shipment);
      if (pendingShipments.length === 0) return;
      enqueueBackgroundRefresh(pendingShipments);
      await runBackgroundRefreshQueue();
    } finally {
      setRefreshingPending(false);
    }
  }

  function draftFor(row: CycleAuditRecord): CycleAuditDraft {
    const missingDetection = Array.isArray(row.missing_detection) ? row.missing_detection : [];
    return auditDrafts[row.tracking_number] ?? {
      expected_status: (row.expected_status === "DELIVERED WITH PAYMENT" ? "DELIVERED WITH PAYMENT" : row.expected_status === "RETURNED" ? "RETURNED" : row.expected_status === "DELIVERED" ? "DELIVERED" : "PENDING"),
      cycle_detected: (row.cycle_detected === "Cycle 1" || row.cycle_detected === "Cycle 2" || row.cycle_detected === "Cycle 3" ? row.cycle_detected : "Cycle Unknown"),
      missing_steps: missingDetection.join("; "),
      reason: "",
      apply_to_issue_code: false,
    };
  }

  function updateAuditDraft(trackingNumber: string, patch: Partial<CycleAuditDraft>, seed?: CycleAuditRecord) {
    setAuditDrafts((prev) => {
      const current = seed ? draftFor(seed) : (prev[trackingNumber] ?? {
        expected_status: "PENDING",
        cycle_detected: "Cycle Unknown",
        missing_steps: "",
        reason: "",
        apply_to_issue_code: false,
      });
      return {
        ...prev,
        [trackingNumber]: {
          ...current,
          ...patch,
        },
      };
    });
  }

  async function runCycleAudit() {
    setAuditLoading(true);
    setAuditError(null);
    setAuditSummary(null);
    try {
      const data = await api<{ success: boolean; sample: number; mismatchCount: number; audit: CycleAuditRecord[] }>("/api/shipments/cycle-audit?sample=100&mode=latest");
      setAuditRows(data.audit ?? []);
      setAuditSummary(`Audited ${(data.audit ?? []).length} records, mismatches: ${data.mismatchCount ?? 0}.`);
      setAuditDrafts({});
    } catch (e) {
      setAuditError(e instanceof Error ? e.message : "Audit failed");
    } finally {
      setAuditLoading(false);
    }
  }

  async function saveCycleCorrections() {
    const corrections = auditRows
      .map((row) => {
        const draft = draftFor(row);
        const missingSteps = draft.missing_steps
          .split(/[\n;,]+/)
          .map((item) => item.trim())
          .filter(Boolean);
        return {
          tracking_number: row.tracking_number,
          expected_status: draft.expected_status,
          cycle_detected: draft.cycle_detected,
          missing_steps: missingSteps,
          reason: draft.reason || row.reason,
          issue_code: row.issue_code,
          apply_to_issue_code: draft.apply_to_issue_code,
        };
      })
      .filter((row) => row.expected_status || row.cycle_detected || row.missing_steps.length > 0 || row.reason);

    if (corrections.length === 0) {
      setAuditSummary("No correction changes to save.");
      return;
    }

    setSavingCorrections(true);
    setAuditError(null);
    try {
      const result = await api<{ success: boolean; reprocessed: CycleAuditRecord[] }>("/api/shipments/cycle-audit/corrections", {
        method: "POST",
        body: JSON.stringify({ corrections }),
      });
      setAuditRows(result.reprocessed ?? []);
      setAuditSummary(`Saved ${corrections.length} correction(s) and reprocessed ${(result.reprocessed ?? []).length} record(s).`);
      await refreshShipments();
    } catch (e) {
      setAuditError(e instanceof Error ? e.message : "Failed to save corrections");
    } finally {
      setSavingCorrections(false);
    }
  }

  function exportAuditToCSV() {
    if (auditRows.length === 0) {
      setAuditError("No audit records to export");
      return;
    }

    const headers = [
      "tracking_number",
      "current_status",
      "expected_status",
      "cycle_detected",
      "issue",
      "reason",
      "missing_detection",
      "apply_to_issue_code",
    ];

    const csvContent = [
      headers.join(","),
      ...auditRows.map((row) => {
        const draft = draftFor(row);
        const escaped = (val: string) => `"${String(val ?? "").replace(/"/g, '""')}"`;
        return [
          escaped(row.tracking_number),
          escaped(row.current_status),
          escaped(draft.expected_status),
          escaped(draft.cycle_detected),
          escaped(row.issue),
          escaped(draft.reason || row.reason),
          escaped(row.missing_detection.join("; ")),
          draft.apply_to_issue_code ? "yes" : "no",
        ].join(",");
      }),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `audit-export-${new Date().toISOString().split("T")[0]}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setAuditSummary("Audit exported to CSV. Edit and re-import to apply corrections.");
  }

  async function importAuditFromCSV(file: File) {
    try {
      const csvText = await file.text();
      setAuditLoading(true);
      setAuditError(null);

      type ImportResult = {
        success: boolean;
        totalRows: number;
        validRows: number;
        skippedRows: number;
        appliedCorrections: number;
        errors: Array<{
          rowIndex: number;
          trackingNumber?: string;
          message: string;
          suggestedFix?: string;
        }>;
        warnings: Array<{
          rowIndex: number;
          trackingNumber?: string;
          message: string;
          autoCorrection?: string;
        }>;
        reprocessedRecords: CycleAuditRecord[];
        summary: {
          statusChanges: Record<string, number>;
          cycleChanges: Record<string, number>;
          issueCodePatterns: Record<string, number>;
        };
      };

      const result = await api<ImportResult>("/api/shipments/cycle-audit/import", {
        method: "POST",
        body: JSON.stringify({ csv_text: csvText }),
      });

      // Build detailed summary
      const errorMsg = result.errors.length > 0 
        ? `\nErrors (${result.errors.length}): ${result.errors.slice(0, 3).map((e) => `Row ${e.rowIndex}: ${e.message}`).join("; ")}`
        : "";
      
      const warningMsg = result.warnings.length > 0
        ? `\nWarnings (${result.warnings.length}): ${result.warnings.slice(0, 3).map((w) => `Row ${w.rowIndex}: ${w.message}`).join("; ")}`
        : "";
      
      const statusChanges = Object.entries(result.summary?.statusChanges ?? {})
        .map(([key, count]) => `${key} (${count}x)`)
        .join(", ");
      
      const cycleChanges = Object.entries(result.summary?.cycleChanges ?? {})
        .map(([key, count]) => `${key} (${count}x)`)
        .join(", ");

      const summaryMsg = [
        `Import complete: ${result.validRows}/${result.totalRows} rows valid`,
        `Applied ${result.appliedCorrections} correction(s)`,
        `Reprocessed ${result.reprocessedRecords.length} record(s)`,
        statusChanges ? `Status changes: ${statusChanges}` : "",
        cycleChanges ? `Cycle patterns: ${cycleChanges}` : "",
        errorMsg,
        warningMsg,
      ]
        .filter(Boolean)
        .join("\n");

      setAuditSummary(summaryMsg);
      if (result.reprocessedRecords.length > 0) {
        setAuditRows(result.reprocessedRecords);
      }
      if (result.errors.length > 0) {
        setAuditError(`Import had ${result.errors.length} error(s). Check details above.`);
      }
      await refreshShipments();
    } catch (e) {
      setAuditError(e instanceof Error ? e.message : "CSV import failed");
    } finally {
      setAuditLoading(false);
    }
  }

  function hasFreshTrackingCache(shipment: Shipment) {
    const raw = parseRaw(shipment.rawJson);
    const cacheAt = Number(raw?.trackingCacheAt ?? 0);
    return Number.isFinite(cacheAt) && Date.now() - cacheAt < TRACKING_CACHE_TTL_MS;
  }

  function enqueueBackgroundRefresh(items: Shipment[]) {
    if (uiState === "uploading" || uiState === "processing") {
      return;
    }
    const queue = backgroundQueueRef.current;
    const seen = backgroundSeenRef.current;
    for (const shipment of items) {
      const trackingNumber = String(shipment.trackingNumber ?? "").trim();
      if (!trackingNumber || seen.has(trackingNumber) || hasFreshTrackingCache(shipment) || isManualOverrideShipment(shipment)) continue;
      seen.add(trackingNumber);
      queue.push(trackingNumber);
    }
    if (!backgroundRunningRef.current) {
      void runBackgroundRefreshQueue();
    }
  }

  async function runBackgroundRefreshQueue() {
    if (backgroundRunningRef.current) return;
    if (uiState === "uploading" || uiState === "processing") return;
    backgroundRunningRef.current = true;
    let updated = false;
    try {
      while (backgroundQueueRef.current.length > 0) {
        const batch = backgroundQueueRef.current.splice(0, BACKGROUND_BATCH_SIZE);
        await api("/api/shipments/refresh-pending", {
          method: "POST",
          body: JSON.stringify({ trackingNumbers: batch }),
        });
        updated = true;
      }
    } catch {
      // Background refresh must not block page usage.
    } finally {
      backgroundRunningRef.current = false;
      if (updated) {
        try {
          const { allRows, total } = await fetchShipmentsFromServer();
          const fetchedAt = Date.now();
          trackingCacheRef.current = {
            shipments: allRows,
            total: total || allRows.length,
            fetchedAt,
          };
          applyShipmentsSnapshot(allRows, total);
          setRefreshSummary(`Background sync refreshed ${allRows.length.toLocaleString()} tracking rows.`);
          await refreshSupportingWorkspaceData({ force: true });
        } catch {
          // Ignore background sync failures.
        }
      }
      if (backgroundQueueRef.current.length > 0) {
        void runBackgroundRefreshQueue();
      }
    }
  }

  function validateComplaintFields(): { valid: boolean; missing: string[] } {
    const missing: string[] = [];
    const clean = (v: string) => {
      const t = String(v ?? "").trim();
      return t === "-" ? "" : t;
    };
    if (!complaintRecord?.shipment.trackingNumber.trim()) missing.push("ArticleNo");
    const sName = clean(senderNameInput);
    const sAddress = clean(senderAddressInput);
    if (!sName) missing.push("Sender Name");
    if (!sAddress) missing.push("Sender Address");
    const rName = clean(receiverNameInput);
    const rAddress = clean(receiverAddressInput);
    if (!rName) missing.push("Receiver Name");
    if (!rAddress) missing.push("Receiver Address");
    if (!senderCityValue.trim()) missing.push("Sender City");
    if (!receiverCityValue.trim()) missing.push("Receiver City");
    const normalized = normalizePkMobile(complaintPhone.trim());
    if (!normalized) missing.push("Mobile");
    if (!complaintText.trim()) missing.push("Remarks");
    if (!selectedDistrict.trim()) missing.push("District");
    if (!selectedTehsil.trim()) missing.push("Tehsil");
    if (!selectedLocation.trim()) missing.push("Location");

    setComplaintValidationState({
      ArticleNo: !!complaintRecord?.shipment.trackingNumber.trim(),
      SenderName: !!sName,
      SenderAddress: !!sAddress,
      ReceiverName: !!rName,
      ReceiverAddress: !!rAddress,
      SenderCity: !!senderCityValue.trim(),
      ReceiverCity: !!receiverCityValue.trim(),
      Mobile: !!normalized,
      Remarks: !!complaintText.trim(),
      District: !!selectedDistrict.trim(),
      Tehsil: !!selectedTehsil.trim(),
      Location: !!selectedLocation.trim(),
    });

    return { valid: missing.length === 0, missing };
  }

  function handleComplaintPreview() {
    const validation = validateComplaintFields();
    if (!validation.valid) {
      alert(`Please complete the following required fields:\n${validation.missing.join(", ")}`);
      return;
    }
    setComplaintPreviewVisible(true);
  }

  async function handleComplaintSubmitFromPreview() {
    const validation = validateComplaintFields();
    if (!validation.valid) {
      alert(`Missing required fields: ${validation.missing.join(", ")}`);
      setComplaintPreviewVisible(false);
      return;
    }
    await submitComplaintInstant();
    setComplaintPreviewVisible(false);
    setRefreshingPending(true);
    setRefreshSummary(null);
    try {
      await refreshShipments();
      setRefreshSummary("Complaint submitted. Shipment state refreshed without charging units.");
    } catch (e) {
      setRefreshSummary(e instanceof Error ? e.message : "Refresh failed");
    } finally {
      setRefreshingPending(false);
    }
  }

  async function updateStatus(trackingNumber: string, status: string) {
    const target = shipments.find((x) => x.trackingNumber === trackingNumber);
    const optimisticRows = shipments.map((item) => (
      item.trackingNumber === trackingNumber
        ? { ...item, status, rawJson: applyLocalStatusOverride(item.rawJson, status) }
        : item
    ));
    // Optimistic update
    setShipments(optimisticRows);
    trackingCacheRef.current = {
      shipments: optimisticRows,
      total: trackingCacheRef.current?.total ?? optimisticRows.length,
      fetchedAt: Date.now(),
    };
    try {
      if (target) {
        await api(`/api/shipments/${target.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      }
      await refreshShipments({ force: true });
    } catch (e) {
      console.error(e);
      await refreshShipments({ force: true });
    }
  }

  async function deleteSelected() {
    if (!selectedIds.length) return;
    if (!confirm(`Delete ${selectedIds.length} shipments?`)) return;
    const toDelete = [...selectedIds];

    // Optimistic UI update: remove rows immediately
    setShipments((prev) => prev.filter((s) => !toDelete.includes(s.id)));
    setSelectedIds([]);

    try {
      // Reverting to individual DELETE calls, which is the most standard RESTful approach
      // and aligns with the existing PATCH /api/shipments/:id endpoint.
      await Promise.all(
        toDelete.map((id) => api(`/api/shipments/${id}`, { method: "DELETE" }))
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete");
      await refreshShipments();
    }
  }

  useEffect(() => {
    let timer: number | null = null;
    if (uiState === "uploading" || uiState === "processing") {
      timer = window.setInterval(() => setElapsed((e) => e + 1), 1000);
    }
    return () => {
      if (timer) window.clearInterval(timer);
    };
  }, [uiState]);

  useEffect(() => {
    if (uiState !== "uploading" && uiState !== "processing") return;
    backgroundQueueRef.current = [];
  }, [uiState]);

  useEffect(() => {
    if (!polling.jobStatus) return;
    if (uiState !== "processing" && uiState !== "completed" && (polling.jobStatus === "QUEUED" || polling.jobStatus === "PROCESSING")) {
      setUiState("processing");
    }
    if (polling.jobStatus === "COMPLETED") {
      setUiState("completed");
      setProgress(100);
    }
    if (polling.jobStatus === "FAILED") {
      setUiState("failed");
      setError(polling.jobError ?? "Tracking failed");
      setProgress(100);
    }
  }, [polling.jobError, polling.jobStatus]);

  useEffect(() => {
    if (!Array.isArray(polling.result)) return;
    const liveResults = polling.result as TrackResult[];
    setResults((prev) => {
      if (!Array.isArray(prev)) return liveResults;
      if (prev.length !== liveResults.length) return liveResults;
      const unchanged = prev.every((item, index) => {
        const next = liveResults[index];
        return String(item.tracking_number ?? "") === String(next?.tracking_number ?? "")
          && String(item.status ?? "") === String(next?.status ?? "")
          && String(item.latest_date ?? "") === String(next?.latest_date ?? "")
          && String(item.latest_time ?? "") === String(next?.latest_time ?? "")
          && Number(item.days_passed ?? 0) === Number(next?.days_passed ?? 0);
      });
      return unchanged ? prev : liveResults;
    });
    if (uiState !== "processing") return;

    const total = Math.max(recordCount, liveResults.length, 1);
    const processed = liveResults.filter((item) => String(item.status ?? "").toUpperCase() !== "QUEUED").length;
    const pct = Math.max(0, Math.min(99, Math.round((processed / total) * 100)));
    setProgress((prev) => (prev === pct ? prev : pct));
  }, [polling.result, uiState, recordCount]);

  useEffect(() => {
    if (!selectedTracking) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow || "auto";
    };
  }, [selectedTracking]);

  function closeComplaintModal() {
    setComplaintPreviewVisible(false);
    setComplaintRecord(null);
    setComplaintPrefill(null);
    setComplaintPrefillLoading(false);
    setComplaintSubmitResult(null);
    setComplaintSubmitNotice(null);
    setComplaintSelectionLocked(false);
    setSelectedDistrict("");
    setSelectedTehsil("");
    setSelectedLocation("");
    setOfficeSearchQuery("");
    setOfficeSearchResults([]);
    setComplaintValidationState({});
  }

  useEffect(() => {
    if (!complaintRecord) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusTimer = window.setTimeout(() => {
      complaintFirstInputRef.current?.focus();
    }, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeComplaintModal();
        return;
      }

      if (event.key !== "Tab") return;
      const root = complaintModalRef.current;
      if (!root) return;

      const focusable = Array.from(
        root.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute("disabled") && el.tabIndex !== -1 && el.offsetParent !== null);

      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = prevOverflow || "auto";
    };
  }, [complaintRecord]);

  const onDrop = useCallback((accepted: File[]) => {
    const nextFile = accepted[0] ?? null;
    setFile(nextFile);
    setError(null);
    setShowRechargeAlert(false);
    setShowServiceAlert(false);
    setShowNoTrackingModal(false);
    setResults(null);
    setUiState("idle");
    setProgress(0);
    setElapsed(0);
    setEstimatedTotalSec(null);
    setJobStartTime(null);
    setRecordCount(0);
    setDetectedUploadKind("unknown file");
    setDetectedTrackingCount(0);
    polling.reset();
    void analyzeTrackingUploadFile(nextFile).then((analysis) => {
      setDetectedUploadKind(analysis.kind);
      setDetectedTrackingCount(analysis.trackingCount);
    });
  }, []);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    noClick: true,
    accept: {
      "text/csv": [".csv"],
      "application/vnd.ms-excel": [".xls"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
    },
    maxFiles: 1,
  });

  const stats = useMemo(() => {
    const list = results ?? [];
    const by: Record<string, number> = {};
    for (const r of list) by[r.status] = (by[r.status] ?? 0) + 1;
    return { total: list.length, by };
  }, [results]);

  // PROTECTED_SCOPE_START
  // Stable enterprise tracking workspace.
  // Restored from commit 996eaac.
  // Includes performance hydration + compact rendering.
  // Do not remove cache hydration or row precomputation.
  // Regression-sensitive rendering path.

  // --- PERFORMANCE CACHE LAYER ---
  // Hydrate from render cache on first load for instant UI.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (!hydrated && userCacheScope) {
      const cached = readTrackingWorkspaceRenderCacheForScope<Shipment, ComplaintQueueSnapshot>(userCacheScope);
      console.info("[tracking] performance hydration restore", {
        userId: userCacheScope,
        hasCachedRows: Array.isArray(cached?.shipments) && cached.shipments.length > 0,
      });
      if (Array.isArray(cached?.shipments) && cached.shipments.length > 0) {
        const cachedCount = cached.shipments.length;
        const cachedTotal = cached.total ?? cachedCount;
        const currentCount = shipments.length;
        const currentTotal = totalShipments ?? currentCount;
        if (currentCount === 0 || cachedCount >= currentCount || cachedTotal >= currentTotal) {
          setShipments(cached.shipments);
          setTotalShipments(cachedTotal);
        }
        setHydrated(true);
      }
    }
  }, [hydrated, shipments.length, totalShipments, userCacheScope]);

  // --- PRECOMPUTED ROW MODEL ---
  type TrackingTableRowModel = {
    record: FinalTrackingRecord;
    lifecycle: ReturnType<typeof parseComplaintLifecycle>;
    complaintState: string;
    statusBadge: string;
    days: number;
    displayCity: string;
    actionStatus: string;
    manualOverride: boolean;
    bookingDateLabel: string;
    bookingDateMs: number;
    updatedDateLabel: string;
    updatedDateMs: number;
    updatedBy: string;
  };

  function buildTrackingTableRowModel(records: FinalTrackingRecord[]): TrackingTableRowModel[] {
    return records.map((record) => {
      const s = record.shipment;
      const authoritativeStatus = getAuthoritativeRecordStatus(record);
      const lifecycle = parseComplaintLifecycle(s);
      const complaintState = resolveComplaintCardState(lifecycle, authoritativeStatus, complaintQueueByTracking.get(s.trackingNumber));
      const manualOverride = isManualOverrideShipment(s);
      const statusBadge = statusBadgeClass(authoritativeStatus);
      const days = s.daysPassed ?? Math.floor((Date.now() - new Date(s.createdAt).getTime()) / (1000 * 60 * 60 * 24));
      const displayCity = preferredCity(s);
      const actionStatus = authoritativeStatus;
      const bookingMeta = resolveShipmentBookingMeta(s);
      const updatedAtMs = new Date(s.updatedAt).getTime();
      return {
        record,
        lifecycle,
        complaintState,
        statusBadge,
        days,
        displayCity,
        actionStatus,
        manualOverride,
        bookingDateLabel: bookingMeta.date,
        bookingDateMs: bookingMeta.ms,
        updatedDateLabel: formatTrackingTableDateOnly(updatedAtMs),
        updatedDateMs: Number.isFinite(updatedAtMs) ? updatedAtMs : 0,
        updatedBy: resolveShipmentUpdatedBy(s),
      };
    });
  }

  const finalTrackingData = useMemo(() => getFinalTrackingData(shipments), [shipments]);
  const trackingTableRows = useMemo(() => buildTrackingTableRowModel(finalTrackingData), [finalTrackingData]);
  const summaryStats = useMemo(() => computeStats(finalTrackingData), [finalTrackingData]);
  const complaintTotals = useMemo(() => {
    let total = 0;
    let active = 0;
    let overdue = 0;
    let closed = 0;
    for (const row of trackingTableRows) {
      if (!row.lifecycle.exists) continue;
      total += 1;
      if (row.lifecycle.state === "ACTIVE") {
        active += 1;
      } else if (row.lifecycle.state === "OVERDUE") {
        overdue += 1;
      } else if (["RESOLVED", "CLOSED", "REJECTED"].includes(row.lifecycle.state)) {
        closed += 1;
      }
    }
    return { total, active, overdue, closed };
  }, [trackingTableRows]);

  const workspaceShipmentStats = useMemo(() => {
    let totalAmount = 0;
    let deliveredAmount = 0;
    let pendingAmount = 0;
    let returnedAmount = 0;
    let complaintAmount = 0;

    for (const row of trackingTableRows) {
      const shipment = row.record.shipment;
      const status = normalizeStatus(row.actionStatus);
      const rawAmount = extractMoValue(shipment.rawJson, shipment.moValue ?? null);
      const parsedAmount = Number(rawAmount ?? 0);
      const amount = Number.isFinite(parsedAmount) ? Math.max(0, parsedAmount) : 0;

      totalAmount += amount;

      if (status === "DELIVERED" || status === "DELIVERED WITH PAYMENT") {
        deliveredAmount += amount;
      } else if (status === "RETURNED") {
        returnedAmount += amount;
      } else {
        pendingAmount += amount;
      }

      if (row.lifecycle.exists) {
        complaintAmount += amount;
      }
    }

    return {
      total: trackingTableRows.length,
      delivered: summaryStats.delivered,
      pending: summaryStats.pending,
      returned: summaryStats.returned,
      complaints: complaintTotals.total,
      totalAmount,
      deliveredAmount,
      pendingAmount,
      returnedAmount,
      complaintAmount,
    };
  }, [trackingTableRows, summaryStats.delivered, summaryStats.pending, summaryStats.returned, complaintTotals.total]);
  // PROTECTED_SCOPE_END

  const complaintRows = complaintPrefill?.districtData ?? [];
  const complaintDistrictOptions = useMemo(
    () => Array.from(new Set(complaintRows.map((r) => r.district))).sort((a, b) => a.localeCompare(b)),
    [complaintRows],
  );
  const complaintTehsilOptions = useMemo(
    () => Array.from(new Set(complaintRows.filter((r) => r.district === selectedDistrict).map((r) => r.tehsil))).sort((a, b) => a.localeCompare(b)),
    [complaintRows, selectedDistrict],
  );
  const complaintLocationOptions = useMemo(
    () => Array.from(new Set(complaintRows.filter((r) => r.district === selectedDistrict && r.tehsil === selectedTehsil).map((r) => r.location))).sort((a, b) => a.localeCompare(b)),
    [complaintRows, selectedDistrict, selectedTehsil],
  );
  const complaintCityOptions = useMemo(
    () => Array.from(new Set(
      complaintRows.flatMap((r) => [r.location, r.tehsil, r.district].map((value) => String(value ?? "").trim()).filter(Boolean)),
    )).sort((a, b) => a.localeCompare(b)),
    [complaintRows],
  );
  const senderCitySearchResults = useMemo(() => {
    const q = senderCitySearch.trim();
    if (q.length < 3) return [] as string[];
    const nq = normalizeComplaintCity(q);
    return complaintCityOptions.filter((opt) => normalizeComplaintCity(opt).includes(nq)).slice(0, 12);
  }, [senderCitySearch, complaintCityOptions]);
  const receiverCitySearchResults = useMemo(() => {
    const q = receiverCitySearch.trim();
    if (q.length < 3) return [] as string[];
    const nq = normalizeComplaintCity(q);
    return complaintCityOptions.filter((opt) => normalizeComplaintCity(opt).includes(nq)).slice(0, 12);
  }, [receiverCitySearch, complaintCityOptions]);

  const shipmentByTracking = useMemo(() => {
    const map = new Map<string, FinalTrackingRecord>();
    for (const s of finalTrackingData) {
      map.set(s.shipment.trackingNumber, s);
    }
    return map;
  }, [finalTrackingData]);

  useEffect(() => {
    if (!selectedTracking) return;
    const trackingNumber = String(selectedTracking.shipment.trackingNumber ?? "").trim();
    if (!trackingNumber) return;
    const latest = shipmentByTracking.get(trackingNumber);
    if (!latest) return;

    setSelectedTracking((prev) => {
      if (!prev) return prev;
      if (String(prev.shipment.trackingNumber ?? "").trim() !== trackingNumber) {
        return prev;
      }
      const nextComplaintStatus = String((latest.shipment as any).complaintStatus ?? (latest.shipment as any).complaint_status ?? "");
      const prevComplaintStatus = String((prev.shipment as any).complaintStatus ?? (prev.shipment as any).complaint_status ?? "");
      const sameSnapshot =
        String(latest.shipment.id ?? "") === String(prev.shipment.id ?? "")
        && String(latest.shipment.updatedAt ?? "") === String(prev.shipment.updatedAt ?? "")
        && String(latest.shipment.status ?? "") === String(prev.shipment.status ?? "")
        && nextComplaintStatus === prevComplaintStatus;
      return sameSnapshot ? prev : latest;
    });
  }, [selectedTracking?.shipment.trackingNumber, shipmentByTracking]);

  const pieSlices = useMemo(() => {
    const delivered = summaryStats.delivered;
    const returned = summaryStats.returned;
    const delayed = summaryStats.delayed;
    const pendingNonDelayed = Math.max(0, summaryStats.pending - delayed);
    const items = [
      { label: "Delivered", value: delivered, color: "#16a34a" },
      { label: "Pending", value: pendingNonDelayed, color: "#f97316" },
      { label: "Returned", value: returned, color: "#dc2626" },
      { label: "Delayed", value: delayed, color: "#7c3aed" },
    ];
    const total = items.reduce((sum, item) => sum + item.value, 0);
    let acc = 0;
    const arcs = items.map((item) => {
      const pct = total > 0 ? item.value / total : 0;
      const start = acc;
      acc += pct;
      return { ...item, start, end: acc };
    });
    return { total, arcs };
  }, [summaryStats]);

  const hoveredPie = useMemo(() => {
    if (!hoveredPieLabel) return null;
    return pieSlices.arcs.find((arc) => arc.label === hoveredPieLabel) ?? null;
  }, [hoveredPieLabel, pieSlices.arcs]);

  const monthlyBars = useMemo(() => {
    const buckets = new Map<string, number>();
    for (let i = 5; i >= 0; i -= 1) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      buckets.set(key, 0);
    }
    for (const r of finalTrackingData) {
      const month = String(r.shipment.createdAt ?? "").slice(0, 7);
      if (buckets.has(month)) buckets.set(month, (buckets.get(month) ?? 0) + 1);
    }
    const values = Array.from(buckets.entries()).map(([month, value]) => ({
      key: month,
      label: month.slice(5),
      value,
    }));
    const max = Math.max(1, ...values.map((v) => v.value));
    return { values, max };
  }, [finalTrackingData]);

  // PROTECTED_SCOPE_START
  // Stable enterprise tracking workspace.
  // Restored from commit 996eaac.
  // Includes performance hydration + compact rendering.
  // Do not remove cache hydration or row precomputation.
  // Regression-sensitive rendering path.

  const filteredTrackingTableRows = useMemo(() => {
    const baseFilter: StatusCardFilter =
      statusFilter === "COMPLAINT_WATCH"
      || statusFilter === "COMPLAINT_TOTAL"
      || statusFilter === "COMPLAINT_ACTIVE"
      || statusFilter === "COMPLAINT_OVERDUE"
      || statusFilter === "COMPLAINT_CLOSED"
      || statusFilter === "COMPLAINT_REOPENED"
      || statusFilter === "COMPLAINT_IN_PROCESS"
      ? "ALL"
      : statusFilter;
    const filtered = trackingTableRows.filter((row) => {
      const authoritativeStatus = normalizeStatus(row.actionStatus);
      if (baseFilter === "ALL") return true;
      if (baseFilter === "DELAYED") return row.record.delayed;
      if (baseFilter === "DELIVERED") return authoritativeStatus === "DELIVERED" || authoritativeStatus === "DELIVERED WITH PAYMENT";
      if (baseFilter === "RETURNED") return authoritativeStatus === "RETURNED";
      return authoritativeStatus === "PENDING";
    });

    if (statusFilter === "COMPLAINT_TOTAL") {
      return filtered.filter((row) => row.lifecycle.exists);
    }

    if (statusFilter === "COMPLAINT_ACTIVE") {
      return filtered.filter((row) => row.lifecycle.exists && row.lifecycle.state === "ACTIVE");
    }

    if (statusFilter === "COMPLAINT_OVERDUE") {
      return filtered.filter((row) => row.lifecycle.exists && row.lifecycle.state === "OVERDUE");
    }

    if (statusFilter === "COMPLAINT_CLOSED") {
      const complaintClosedRows = filtered.filter((row) => row.lifecycle.exists && ["RESOLVED", "CLOSED", "REJECTED"].includes(row.lifecycle.state));
      if (!searchTerm.trim()) return complaintClosedRows;
      const q = searchTerm.trim().toUpperCase();
      return complaintClosedRows.filter((row) => {
        const shipment = row.record.shipment;
        const lifecycle = row.lifecycle;
        const city = row.displayCity;
        // Use manual override status for search
        const status = normalizeStatus(row.actionStatus);
        const haystack = [
          shipment.trackingNumber,
          city,
          status,
          lifecycle.complaintId,
          lifecycle.stateLabel,
          lifecycle.dueDateText,
        ].join(" ").toUpperCase();
        return haystack.includes(q);
      });
    }

    if (statusFilter === "COMPLAINT_WATCH") {
      return filtered.filter((row) => normalizeStatus(row.actionStatus) === "PENDING" && isComplaintInProcess(row.lifecycle));
    }

    if (statusFilter === "COMPLAINT_REOPENED") {
      return filtered.filter((row) => row.lifecycle.latestAttempt > 1);
    }

    if (statusFilter === "COMPLAINT_IN_PROCESS") {
      return filtered.filter((row) => row.lifecycle.exists && ["IN PROCESS", "OVERDUE"].includes(row.lifecycle.state));
    }

    if (!searchTerm.trim()) return filtered;
    const q = searchTerm.trim().toUpperCase();
    return filtered.filter((row) => {
      const shipment = row.record.shipment;
      const lifecycle = row.lifecycle;
      const city = row.displayCity;
      // Use manual override status for search
      const status = normalizeStatus(row.actionStatus);
      const moNumber = extractMoReference(shipment.rawJson, shipment.moIssued ?? null, shipment.moneyOrderIssued);
      const haystack = [
        shipment.trackingNumber,
        city,
        status,
        moNumber,
        lifecycle.complaintId,
      ].join(" ").toUpperCase();
      return haystack.includes(q);
    });
  }, [trackingTableRows, statusFilter, searchTerm]);
  // PROTECTED_SCOPE_END

  const applyTrackingSearch = useCallback(() => {
    setSearchTerm(searchInput.trim());
    setPage(1);
  }, [searchInput]);

  // PROTECTED_SCOPE_START
  // Stable enterprise sorting/pagination layer restored from 996eaac.
  // Regression-sensitive render pipeline.
  // Do not remove sorting memoization or persisted view-state logic.
  const sortedTrackingTableRows = useMemo(() => {
    const rows = [...filteredTrackingTableRows];
    const multiplier = sortDir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "updatedAt") {
        cmp = a.updatedDateMs - b.updatedDateMs;
      } else if (sortKey === "bookingDate") {
        cmp = a.bookingDateMs - b.bookingDateMs;
      } else if (sortKey === "updatedBy") {
        cmp = String(a.updatedBy ?? "").localeCompare(String(b.updatedBy ?? ""));
      } else if (sortKey === "trackingNumber") {
        cmp = String(a.record.shipment.trackingNumber ?? "").localeCompare(String(b.record.shipment.trackingNumber ?? ""));
      } else if (sortKey === "status") {
        cmp = normalizeStatus(a.actionStatus).localeCompare(normalizeStatus(b.actionStatus));
      } else if (sortKey === "city") {
        cmp = String(a.displayCity ?? "").localeCompare(String(b.displayCity ?? ""));
      } else if (sortKey === "moNumber") {
        const aMo = String(extractMoReference(a.record.shipment.rawJson, a.record.shipment.moIssued ?? null, a.record.shipment.moneyOrderIssued) ?? "");
        const bMo = String(extractMoReference(b.record.shipment.rawJson, b.record.shipment.moIssued ?? null, b.record.shipment.moneyOrderIssued) ?? "");
        cmp = aMo.localeCompare(bMo);
      } else {
        const aAmount = Number(extractMoValue(a.record.shipment.rawJson, a.record.shipment.moValue ?? null) ?? -1);
        const bAmount = Number(extractMoValue(b.record.shipment.rawJson, b.record.shipment.moValue ?? null) ?? -1);
        cmp = aAmount - bAmount;
      }

      if (cmp === 0) {
        cmp = String(a.record.shipment.trackingNumber ?? "").localeCompare(String(b.record.shipment.trackingNumber ?? ""));
      }
      return cmp * multiplier;
    });
    return rows;
  }, [filteredTrackingTableRows, sortDir, sortKey]);

  const toggleTrackingSort = useCallback((nextKey: TrackingSortKey) => {
    setPage(1);
    if (sortKey === nextKey) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(nextKey);
    setSortDir("desc");
  }, [sortKey]);
  // PROTECTED_SCOPE_END

  const exportFilteredTrackingCsv = useCallback(() => {
    const escapeCsv = (val: unknown) => {
      const s = String(val ?? "");
      return `"${s.replace(/"/g, '""')}"`;
    };

    const headers = [
      "Tracking Number",
      "Updated At",
      "Status",
      "City",
      "Money Order No",
      "Money Order Amount",
      "Complaint ID",
      "Complaint State",
      "Complaint Due Date",
    ];

    const rows = filteredTrackingTableRows.map((row) => {
      const record = row.record;
      const shipment = record.shipment;
      const lifecycle = parseComplaintLifecycle(shipment);
      const moNumber = extractMoReference(shipment.rawJson, shipment.moIssued ?? null, shipment.moneyOrderIssued);
      const moAmount = extractMoValue(shipment.rawJson, shipment.moValue ?? null);
      return [
        shipment.trackingNumber,
        new Date(shipment.updatedAt).toISOString(),
        normalizeStatus(row.actionStatus),
        preferredCity(shipment),
        moNumber,
        moAmount != null ? moAmount : "",
        lifecycle.complaintId,
        lifecycle.stateLabel,
        lifecycle.dueDateText,
      ];
    });

    const csv = [headers, ...rows]
      .map((line) => line.map((cell) => escapeCsv(cell)).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `tracking-filtered-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [filteredTrackingTableRows]);

  // PROTECTED_SCOPE_START
  // Stable pagination/cache restoration from 996eaac.
  // Pagination must always operate on full filtered dataset.
  // Do not persist paginated slices into render cache.
  // PROTECTED_SCOPE_END

  const totalFilteredShipments = sortedTrackingTableRows.length;
  const totalPages = Math.max(1, Math.ceil(totalFilteredShipments / pageSize));

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const paginatedTrackingTableRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    const end = page * pageSize;
    return sortedTrackingTableRows.slice(start, end);
  }, [page, pageSize, sortedTrackingTableRows, statusFilter]);

  const paginationWindow = useMemo(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1) as Array<number | string>;
    }

    let start = Math.max(1, page - 2);
    let end = Math.min(totalPages, page + 2);

    if (start <= 2) {
      start = 1;
      end = 5;
    } else if (end >= totalPages - 1) {
      end = totalPages;
      start = totalPages - 4;
    }

    const items: Array<number | string> = [];
    if (start > 1) {
      items.push(1);
      if (start > 2) items.push("ellipsis-left");
    }

    for (let p = start; p <= end; p += 1) {
      items.push(p);
    }

    if (end < totalPages) {
      if (end < totalPages - 1) items.push("ellipsis-right");
      items.push(totalPages);
    }

    return items;
  }, [page, totalPages]);

  // PROTECTED_SCOPE_START
  // Stable pagination/cache restoration from 996eaac.
  // Pagination must always operate on full filtered dataset.
  // Do not persist paginated slices into render cache.
  // PROTECTED_SCOPE_END

  useEffect(() => {
    if (shipments.length === 0) return;
    const timer = window.setTimeout(() => {
      writeTrackingWorkspaceRenderCacheForScope<Shipment, ComplaintQueueSnapshot>({
        shipments,
        total: totalShipments ?? shipments.length,
        complaintQueue: complaintQueueMapToRows(complaintQueueByTracking),
        fetchedAt: trackingCacheRef.current?.fetchedAt ?? Date.now(),
        latestSyncAt: Math.max(trackingCacheRef.current?.fetchedAt ?? 0, shipmentStatsFetchedAt ?? 0, complaintQueueCacheRef.current.fetchedAt ?? 0),
      }, userCacheScope);
    }, WORKSPACE_RENDER_CACHE_PERSIST_MS);
    return () => window.clearTimeout(timer);
  }, [complaintQueueByTracking, shipmentStatsFetchedAt, shipments, totalShipments]);

  useEffect(() => {
    if (shipments.length === 0) return;
    const timer = window.setTimeout(() => {
      void writeTrackingWorkspaceSnapshotForScope<Shipment, ComplaintQueueSnapshot>({
        shipments,
        total: totalShipments ?? shipments.length,
        complaintQueue: complaintQueueMapToRows(complaintQueueByTracking),
        fetchedAt: trackingCacheRef.current?.fetchedAt ?? Date.now(),
        latestSyncAt: Math.max(trackingCacheRef.current?.fetchedAt ?? 0, shipmentStatsFetchedAt ?? 0, complaintQueueCacheRef.current.fetchedAt ?? 0),
      }, userCacheScope);
    }, WORKSPACE_FULL_SNAPSHOT_PERSIST_MS);
    return () => window.clearTimeout(timer);
  }, [complaintQueueByTracking, shipmentStatsFetchedAt, shipments, totalShipments]);
  // PROTECTED_SCOPE_END

  const remaining = useMemo(() => {
    if (estimatedTotalSec == null) return null;
    return Math.max(0, Math.ceil(estimatedTotalSec - elapsed));
  }, [elapsed, estimatedTotalSec]);

  const statusLabel = useMemo(() => {
    if (uiState === "uploading") return "Uploading";
    if (uiState === "processing") return "Processing...";
    if (uiState === "completed") return "Completed";
    if (uiState === "failed") return "Failed";
    return "Ready";
  }, [uiState]);

  useEffect(() => {
    const sameOfficeResults = (
      a: Array<{ district: string; tehsil: string; location: string }>,
      b: Array<{ district: string; tehsil: string; location: string }>,
    ) => {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i += 1) {
        if (a[i].district !== b[i].district || a[i].tehsil !== b[i].tehsil || a[i].location !== b[i].location) {
          return false;
        }
      }
      return true;
    };

    if (complaintSelectionLocked) {
      setOfficeSearchLoading((prev) => (prev ? false : prev));
      setOfficeSearchResults((prev) => (prev.length === 0 ? prev : []));
      return;
    }
    if (officeSearchQuery.trim().length < 3) {
      setOfficeSearchLoading((prev) => (prev ? false : prev));
      setOfficeSearchResults((prev) => (prev.length === 0 ? prev : []));
      return;
    }
    setOfficeSearchLoading(true);
    const timer = window.setTimeout(() => {
      const nextResults = searchOfficeRows(officeSearchQuery, complaintRows);
      setOfficeSearchResults((prev) => (sameOfficeResults(prev, nextResults) ? prev : nextResults));
      setOfficeSearchLoading(false);
    }, 140);
    return () => window.clearTimeout(timer);
  }, [officeSearchQuery, complaintRows, complaintSelectionLocked]);

  const trackingDetailData = useMemo(() => {
    if (!selectedTracking) return null;
    const detailShipment = selectedTracking.shipment;
    const selectedTrackingStatus = getAuthoritativeRecordStatus(selectedTracking);
    const raw = parseRaw(detailShipment.rawJson);
    const fields = getUnifiedFields(detailShipment.rawJson);
    const consignee = getRecordConsignee(detailShipment);
    const timeline = extractTimeline(detailShipment.rawJson);
    const trackingLifecycle = detailShipment.trackingLifecycle ?? ((raw?.tracking_lifecycle as any) ?? null);
    const rawDeliveryProgress = Number((raw?.tracking as any)?.delivery_progress ?? raw?.delivery_progress ?? trackingLifecycle?.progress);
    const deliveryProgress = Number.isFinite(rawDeliveryProgress) ? rawDeliveryProgress : undefined;
    const complaintLifecycle = parseComplaintLifecycle(detailShipment);
    const queueSnapshot = complaintQueueByTracking.get(detailShipment.trackingNumber);
    const complaintCardState = resolveComplaintCardState(complaintLifecycle, selectedTrackingStatus, queueSnapshot);
    const presentation = resolveTrackingPresentation(selectedTrackingStatus, timeline, deliveryProgress, trackingLifecycle, {
      operationalStatus: selectedTrackingStatus,
      complaintActive: isComplaintInProcess(complaintLifecycle) || ["ACTIVE", "OVERDUE", "RETRY PENDING", "MANUAL REVIEW", "QUEUED"].includes(complaintCardState.toUpperCase()),
      complaintStateLabel: complaintCardState === "ACTIVE" ? "Under Investigation" : complaintCardState,
    });
    const bookingDate = timeline[0]?.date || "-";
    const lastEvent = timeline[timeline.length - 1] ?? null;
    const lastUpdate = lastEvent ? `${lastEvent.date} ${lastEvent.time}`.trim() : `${detailShipment.latestDate ?? ""} ${detailShipment.latestTime ?? ""}`.trim() || "-";
    const moIssued = extractMoReference(detailShipment.rawJson, detailShipment.moIssued ?? null, detailShipment.moneyOrderIssued);
    const moValue = extractMoValue(detailShipment.rawJson, detailShipment.moValue ?? null);
    const bookingOffice = String((raw?.tracking as any)?.booking_office ?? raw?.Booking_Office ?? raw?.booking_office ?? raw?.bookingOffice ?? fields.senderCity ?? "").trim() || "-";
    const deliveryOffice = String(raw?.resolved_delivery_office ?? (raw?.tracking as any)?.delivery_office ?? raw?.Delivery_Office ?? raw?.delivery_office ?? raw?.deliveryOffice ?? fields.consigneeCity ?? "").trim() || "-";
    return {
      fields,
      timeline: presentation.timeline,
      presentation,
      bookingDate,
      lastUpdate,
      moIssued,
      moValue,
      bookingOffice,
      deliveryOffice,
      consigneeName: consignee.consigneeName,
      consigneeAddress: consignee.consigneeAddress,
      consigneePhone: consignee.consigneePhone,
    };
  }, [selectedTracking, complaintQueueByTracking]);

  const selectedTrackingStatus = useMemo(
    () => (selectedTracking ? getAuthoritativeRecordStatus(selectedTracking) : "PENDING"),
    [selectedTracking],
  );
  const selectedComplaintLifecycle = selectedTracking ? parseComplaintLifecycle(selectedTracking.shipment) : null;
  const selectedComplaintQueueSnapshot = selectedTracking ? complaintQueueByTracking.get(selectedTracking.shipment.trackingNumber) : undefined;
  const selectedComplaintEnabled = selectedTracking && selectedComplaintLifecycle
    ? isComplaintActionAllowed(selectedTrackingStatus, selectedComplaintLifecycle, selectedComplaintQueueSnapshot)
    : false;

  function printShipmentPdf() {
    const printArea = document.getElementById("print-area");
    const modalRoot = document.getElementById("tracking-popup-print-root");
    if (!printArea || !selectedTracking || !trackingDetailData || !modalRoot) return;

    printArea.innerHTML = "";
    const cloned = modalRoot.cloneNode(true) as HTMLElement;
    cloned.querySelectorAll(".no-print").forEach((node) => node.remove());
    const hasContent = String(cloned.textContent ?? "").trim().length > 0;
    if (hasContent) {
      cloned.classList.add("print-page");
      printArea.appendChild(cloned);
    } else {
      const page = document.createElement("section");
      page.className = "print-page";
      page.innerHTML = buildPrintMarkup(selectedTracking, trackingDetailData);
      printArea.appendChild(page);
    }

    const cleanup = () => {
      document.title = previousTitle;
      printArea.classList.remove("active-print-area");
      printArea.innerHTML = "";
      window.removeEventListener("afterprint", cleanup);
    };

    const previousTitle = document.title;
    document.title = buildTrackingPrintFileName();

    printArea.classList.add("active-print-area");
    window.addEventListener("afterprint", cleanup);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        window.print();
      });
    });
  }

  function toWhatsAppNumber(input?: string | null) {
    const raw = String(input ?? "").trim();
    const digits = raw.replace(/\D+/g, "");
    if (!digits) return null;

    let normalized = digits;
    if (normalized.startsWith("0")) normalized = `92${normalized.slice(1)}`;
    else if (!normalized.startsWith("92")) normalized = `92${normalized}`;

    if (!/^92\d{10,12}$/.test(normalized)) return null;
    return `+${normalized}`;
  }

  function sendToCustomerWhatsapp() {
    if (!selectedTracking || !trackingDetailData) return;
    const detailShipment = selectedTracking.shipment;
    const formatted = toWhatsAppNumber(trackingDetailData.consigneePhone);
    if (!formatted) {
      alert("Customer mobile number not available");
      return;
    }

    const url = buildTrackingWhatsAppShareUrl({
      trackingNumber: detailShipment.trackingNumber,
      displayStatus: trackingDetailData.presentation.displayStatus,
      origin: trackingDetailData.bookingOffice,
      destination: trackingDetailData.deliveryOffice,
      currentLocation: trackingDetailData.presentation.latestEvent?.location || preferredCity(detailShipment),
      latestEvent: trackingDetailData.presentation.latestEvent,
      phone: formatted,
    });
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function handleConfirmResolved(trackingNumber: string) {
    if (resolvingTrackingNumber) return;
    setResolvingTrackingNumber(trackingNumber);
    try {
      const json = await api<{ success: boolean; state: string }>(`/tracking/${encodeURIComponent(trackingNumber)}/resolve`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      if (json.success) {
        refreshTracking(undefined, { skipCache: true });
        refreshAllPending();
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Network error resolving complaint";
      alert(message);
    } finally {
      setResolvingTrackingNumber(null);
    }
  }

  function openComplaintModal(record: FinalTrackingRecord) {
    const shipment = record.shipment;
    const trackingId = String(shipment.trackingNumber ?? "").trim();
    if (!trackingId) return;
    const prefillRequestId = complaintPrefillRequestRef.current + 1;
    complaintPrefillRequestRef.current = prefillRequestId;
    const raw = parseRaw(shipment.rawJson);
    const senderPhone = String(
      (raw as any)?.shipperPhone ??
      (raw as any)?.sender_phone ??
      (raw as any)?.senderPhone ??
      (raw?.tracking as any)?.shipper_phone ??
      (raw?.tracking as any)?.sender_phone ??
      "",
    ).trim();
    const manualSaved = window.localStorage.getItem(complaintPhoneStorageKey) ?? "";
    const senderEmail = String(
      (raw as any)?.sender_email ??
      (raw as any)?.shipperEmail ??
      (raw as any)?.email ??
      "",
    ).trim();
    const savedEmail = window.localStorage.getItem(complaintEmailStorageKey) ?? "";
    const phone = senderPhone || manualSaved;
    const email = senderEmail || savedEmail;
    const fields = getUnifiedFields(shipment.rawJson);
    const _cleanDash = (v: string) => { const t = v.trim(); return t === "-" || t === "" ? "" : t; };
    const rawSenderName = String(raw?.sender_name ?? raw?.senderName ?? raw?.shipperName ?? fields.shipperName ?? "").trim();
    const senderName = _cleanDash(rawSenderName);
    const senderAddress = _cleanDash(String(raw?.sender_address ?? raw?.senderAddress ?? raw?.shipperAddress ?? "").trim());
    // Delivery office = primary city source for receiver; DMO only as fallback
    const deliveryOffice = _cleanDash(String(raw?.resolved_delivery_office ?? raw?.delivery_office ?? raw?.deliveryOffice ?? "").trim());
    const deliveryDmo = _cleanDash(String(raw?.delivery_dmo ?? raw?.deliveryDMO ?? "").trim());
    // Extract delivery office from last tracking event description/location
    const eventBasedDeliveryOffice = _cleanDash(extractDeliveryOfficeFromLastEvent(raw));
    const bookingCity = _cleanDash(String(raw?.booking_city ?? raw?.booking_office ?? raw?.BookingCity ?? fields.senderCity ?? "").trim());
    const resolvedSenderName = senderName || _cleanDash(String(fields.shipperName ?? "").trim()) || "Sender";
    const resolvedSenderAddress = senderAddress || bookingCity || deliveryOffice || eventBasedDeliveryOffice || "Pakistan";
    const uploadConsigneeName = _cleanDash(String(fields.consigneeName ?? "").trim());
    const uploadConsigneeAddress = _cleanDash(String(fields.consigneeAddress ?? "").trim());
    const uploadConsigneeCity = _cleanDash(String(fields.consigneeCity ?? "").trim());
    const trackingConsigneeName = _cleanDash(String(raw?.consignee_name ?? raw?.consigneeName ?? raw?.receiver_name ?? raw?.receiverName ?? "").trim());
    const trackingConsigneeAddress = _cleanDash(String(raw?.consignee_address ?? raw?.consigneeAddress ?? raw?.receiver_address ?? raw?.receiverAddress ?? "").trim());
    const receiverName = uploadConsigneeName || trackingConsigneeName || "Addressee";
    const receiverAddress = uploadConsigneeAddress || trackingConsigneeAddress || deliveryOffice || eventBasedDeliveryOffice || deliveryDmo || "";
    const receiverCity = uploadConsigneeCity || _cleanDash(String(raw?.consigneeCity ?? raw?.ConsigneeCity ?? raw?.receiver_city ?? raw?.receiverCity ?? deliveryOffice ?? eventBasedDeliveryOffice ?? deliveryDmo ?? bookingCity ?? "").trim());
    const templateKey = detectTemplateType(record);
    const normalizedFormState = {
      sender_name: resolvedSenderName,
      sender_address: resolvedSenderAddress,
      receiver_name: receiverName,
      receiver_address: receiverAddress,
      receiver_contact: phone,
      booking_date: formatLastDate(shipment),
      sender_city: bookingCity,
      receiver_city: receiverCity,
      district: "",
      tehsil: "",
      location: "",
      remarks: buildComplaintTemplate(record, templateKey),
    };

    // For reopen: append canonical previous complaint history and warning
    const lifecycle = parseComplaintLifecycle(shipment);
    const _reopenTodayStart = new Date(); _reopenTodayStart.setHours(0, 0, 0, 0);
    const isReopeningComplaint = ["RESOLVED", "CLOSED", "REJECTED"].includes(String(lifecycle.state ?? "").toUpperCase())
      || (lifecycle.dueDateTs != null && lifecycle.dueDateTs < _reopenTodayStart.getTime());
    let finalRemarks = normalizedFormState.remarks;
    if (isReopeningComplaint) {
      const textBlob = String(shipment.complaintText ?? "").trim();
      const histMarker = "COMPLAINT_HISTORY_JSON:";
      const histIdx = textBlob.lastIndexOf(histMarker);
      const histRaw = histIdx >= 0 ? textBlob.slice(histIdx + histMarker.length).trim() : "";
      const histEntries = (() => {
        if (!histRaw) return [] as Array<{ complaintId?: string; dueDate?: string; attemptNumber?: number; userComplaint?: string }>;
        try {
          const p = JSON.parse(histRaw) as { entries?: Array<{ complaintId?: string; dueDate?: string; attemptNumber?: number; userComplaint?: string }> };
          return Array.isArray(p?.entries) ? p.entries : [];
        } catch { return []; }
      })();
      const previousIds = histEntries.length > 0
        ? histEntries.map((entry) => entry.complaintId ?? "-").join("\n")
        : (lifecycle.complaintId || "-");
      const previousDueDates = histEntries.length > 0
        ? histEntries.map((entry) => entry.dueDate ?? "-").join("\n")
        : (lifecycle.dueDateText || "-");
      const previousRemarks = histEntries.length > 0
        ? histEntries.map((entry, index) => `${index + 1}. ${String(entry.userComplaint ?? "").trim() || "-"}`).join("\n")
        : "1. -";
      finalRemarks = finalRemarks
        + `\n\nPrevious Complaint IDs:\n${previousIds}`
        + `\n\nPrevious Due Dates:\n${previousDueDates}`
        + `\n\nPrevious Remarks:\n${previousRemarks}`
        + "\n\nThis complaint remains unresolved despite previous closure.\nClosing unresolved complaint without written lawful response may result in escalation before Consumer Court, PMG office, or Federal Ombudsman.";
    }

    setComplaintRecord(record);
    setComplaintSubmitResult(null);
    setComplaintSubmitNotice(null);
    setComplaintPhone(phone);
    setComplaintEmail(email);
    setReplyMode("POST");
    setComplaintTemplate(templateKey);
    setComplaintText(finalRemarks);
    setComplaintReason("Pending Delivery");
    setComplainantNameInput(normalizedFormState.sender_name);
    setSenderNameInput(normalizedFormState.sender_name);
    setSenderAddressInput(normalizedFormState.sender_address);
    setReceiverNameInput(normalizedFormState.receiver_name);
    setReceiverAddressInput(normalizedFormState.receiver_address);
    setSenderCityValue(normalizedFormState.sender_city);
    setSenderCitySearch(normalizedFormState.sender_city);
    // City: delivery office is the post office name, use it first; event-based, DMO, upload city as fallback
    const receiverCandidate = normalizedFormState.receiver_city;
    setReceiverCityValue(receiverCandidate);
    setReceiverCitySearch(receiverCandidate);
    setComplaintSelectionMode("location");
    setComplaintSelectionLocked(false);
    setOfficeSearchQuery("");
    setOfficeSearchResults([]);
    setComplaintValidationState({});
    setComplaintPrefill(null);
    setComplaintPrefillLoading(true);

    void api<ComplaintPrefill>(`/api/tracking/complaint/prefill/${encodeURIComponent(shipment.trackingNumber)}`)
      .then((prefill) => {
        if (complaintPrefillRequestRef.current !== prefillRequestId) return;
        setComplaintPrefill(prefill);
        const apiAddresseeName = _cleanDash(String(prefill.addresseeName ?? "").trim());
        const apiAddresseeAddress = _cleanDash(String(prefill.addresseeAddress ?? "").trim());
        const apiAddresseeCity = _cleanDash(String(prefill.addresseeCity ?? "").trim());
        const finalAddresseeName = apiAddresseeName || trackingConsigneeName || uploadConsigneeName;
        const finalAddresseeAddress = apiAddresseeAddress || trackingConsigneeAddress || uploadConsigneeAddress || deliveryOffice || eventBasedDeliveryOffice || deliveryDmo;
        const finalAddresseeCity = apiAddresseeCity || uploadConsigneeCity || receiverCandidate || deliveryOffice || eventBasedDeliveryOffice || deliveryDmo || bookingCity;

        setReceiverNameInput(finalAddresseeName);
        setReceiverAddressInput(finalAddresseeAddress);
        setReceiverCityValue(finalAddresseeCity);
        setReceiverCitySearch(finalAddresseeCity);
        // Hierarchy selection: deterministic resolver with strict fallback.
        const hierarchyCandidates = [
          finalAddresseeCity,
          finalAddresseeAddress,
          receiverCandidate,
          receiverAddress,
          deliveryOffice,
          eventBasedDeliveryOffice,
          prefill.deliveryOffice,
          deliveryDmo,
          receiverCityValue,
        ];
        let hierarchyRow: { district: string; tehsil: string; location: string } | null =
          prefill.matched ?? resolveComplaintHierarchyRow(prefill.districtData ?? [], hierarchyCandidates);

        if (hierarchyRow) {
          setSelectedDistrict(hierarchyRow.district);
          setSelectedTehsil(hierarchyRow.tehsil);
          setSelectedLocation(hierarchyRow.location);
          setComplaintSelectionLocked(true);
          setOfficeSearchQuery(hierarchyRow.location);
          // Keep receiver address aligned with the fully-matched location name from hierarchy
          setReceiverAddressInput((prev) =>
            !prev || prev === deliveryOffice || prev === eventBasedDeliveryOffice || prev === deliveryDmo || prev === uploadConsigneeCity || prev === "Pakistan"
              ? hierarchyRow!.location
              : prev,
          );
        } else {
          // Fallback to first valid hierarchy to ensure never empty
          const firstDistrict = prefill.districts?.[0] || "";
          const firstTehsil = prefill.tehsils?.[0] || "";
          const firstLocation = prefill.locations?.[0] || "";
          setSelectedDistrict(firstDistrict);
          setSelectedTehsil(firstTehsil);
          setSelectedLocation(firstLocation);
          setComplaintSelectionLocked(true);
          setOfficeSearchQuery(firstLocation);
          setReceiverAddressInput((prev) =>
            !prev || prev === deliveryOffice || prev === eventBasedDeliveryOffice || prev === deliveryDmo || prev === uploadConsigneeCity || prev === "Pakistan"
              ? firstLocation
              : prev,
          );
        }
        const senderCityMatched = matchComplaintCityOption(prefill.locations ?? [], [bookingCity]);
        if (senderCityMatched) {
          setSenderCityValue(senderCityMatched);
          setSenderCitySearch(senderCityMatched);
        }
        // Match receiver city: prioritise delivery office (post office name) over DMO
        const receiverCityMatched = matchComplaintCityOption(
          prefill.locations ?? [],
          [uploadConsigneeCity, deliveryOffice, eventBasedDeliveryOffice, prefill.deliveryOffice, deliveryDmo],
        );
        if (receiverCityMatched) {
          setReceiverCityValue(receiverCityMatched);
          setReceiverCitySearch(receiverCityMatched);
          // If receiver address is still the raw delivery-office string, upgrade it to the fully-matched city name
          setReceiverAddressInput((prev) => (prev === deliveryOffice || prev === eventBasedDeliveryOffice || prev === deliveryDmo || prev === uploadConsigneeCity) ? receiverCityMatched : prev);
        }
        setComplaintPrefillLoading(false);
      })
      .catch(() => {
        if (complaintPrefillRequestRef.current !== prefillRequestId) return;
        setComplaintPrefill({
          deliveryOffice: preferredCity(shipment),
          addresseeName: trackingConsigneeName || uploadConsigneeName,
          addresseeAddress: trackingConsigneeAddress || uploadConsigneeAddress || deliveryOffice || eventBasedDeliveryOffice || deliveryDmo,
          addresseeCity: receiverCandidate,
          matched: null,
          districts: [],
          tehsils: [],
          locations: [],
          districtData: [],
        });
        setSelectedDistrict("");
        setSelectedTehsil("");
        setSelectedLocation("");
        setComplaintSelectionLocked(false);
        setComplaintPrefillLoading(false);
      });
  }

  function officeNorm(value: string) {
    return String(value ?? "")
      .toUpperCase()
      .replace(/POST OFFICE/g, "")
      .replace(/DELIVERY OFFICE/g, "")
      .replace(/OFFICE/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  const complaintLocationMatches = useMemo(() => {
    if (!complaintPrefill) return false;
    if (complaintSelectionLocked && complaintPrefill.matched?.location) return true;
    return officeNorm(selectedLocation) !== "" && officeNorm(selectedLocation) === officeNorm(complaintPrefill.deliveryOffice);
  }, [complaintPrefill, selectedLocation, complaintSelectionLocked]);

  const complaintLocationSelected = selectedLocation.trim().length > 0;
  const activeComplaintLifecycle = complaintRecord ? parseComplaintLifecycle(complaintRecord.shipment) : null;

  const complaintTextRequired = complaintText.trim().length === 0;
  const senderCitySelected = (senderCityValue.trim().length > 0) || (senderCitySearch.trim().length > 0);
  const receiverCitySelected = (receiverCityValue.trim().length > 0) || (receiverCitySearch.trim().length > 0);
  const complaintSubmitMissingFields = (() => {
    const clean = (v: string) => {
      const t = String(v ?? "").trim();
      return t === "-" ? "" : t;
    };
    const missing: string[] = [];
    const lockedPrefillDistrict = complaintSelectionLocked ? clean(complaintPrefill?.matched?.district ?? "") : "";
    const lockedPrefillTehsil = complaintSelectionLocked ? clean(complaintPrefill?.matched?.tehsil ?? "") : "";
    const lockedPrefillLocation = complaintSelectionLocked ? clean(complaintPrefill?.matched?.location ?? "") : "";
    const effectiveDistrict = clean(selectedDistrict) || lockedPrefillDistrict;
    const effectiveTehsil = clean(selectedTehsil) || lockedPrefillTehsil;
    const effectiveLocation = clean(selectedLocation) || lockedPrefillLocation;
    if (!clean(senderNameInput)) missing.push("sender_name");
    if (!clean(senderAddressInput)) missing.push("sender_address");
    if (!clean(receiverNameInput)) missing.push("receiver_name");
    if (!clean(receiverAddressInput)) missing.push("receiver_address");
    if (!clean(receiverCityValue) && !clean(receiverCitySearch)) missing.push("receiver_city");
    if (!effectiveDistrict) missing.push("district");
    if (!effectiveTehsil) missing.push("tehsil");
    if (!effectiveLocation) missing.push("location");
    if (!clean(complaintText)) missing.push("remarks");
    return missing;
  })();
  const complaintSubmitReady = !(complaintPrefillLoading && !complaintPrefill) && complaintSubmitMissingFields.length === 0;
  const senderNameIsLocked = false;
  const receiverNameIsLocked = false;
  const senderCityIsLocked = false;
  const receiverCityIsLocked = false;

  async function submitComplaintInstant() {
    if (!complaintRecord) return;
    const trackingNumber = complaintRecord.shipment.trackingNumber;
    if (!String(trackingNumber ?? "").trim()) {
      alert("Tracking ID is required.");
      return;
    }
    const serviceType = detectServiceType(trackingNumber);
    const finalStatus = normalizeStatus(getAuthoritativeRecordStatus(complaintRecord)).toUpperCase();
    if (finalStatus !== "PENDING") {
      alert("Complaint is available only for pending shipments.");
      return;
    }
    const lifecycle = parseComplaintLifecycle(complaintRecord.shipment);
    if (isComplaintInProcess(lifecycle)) {
      setComplaintSubmitNotice({
        kind: "warning",
        message: `Complaint already exists for this shipment. Complaint ID: ${lifecycle.complaintId || "-"} | Due Date: ${lifecycle.dueDateText || "-"}`,
      });
      return;
    }
    if (!complaintPhone.trim()) {
      alert("Phone is required for complaint submission.");
      return;
    }
    const normalizedPhone = normalizePkMobile(complaintPhone.trim());
    if (!normalizedPhone) {
      alert("Enter a valid mobile number in 03XXXXXXXXX format.");
      return;
    }
    if (replyMode === "EMAIL" && !String(complaintEmail ?? "").trim()) {
      alert("Email is required when reply mode is Email.");
      return;
    }
    const clean = (v: string) => {
      const t = String(v ?? "").trim();
      return t === "-" ? "" : t;
    };
    const senderNameClean = clean(senderNameInput);
    const senderAddressClean = clean(senderAddressInput);
    const receiverNameClean = clean(receiverNameInput);
    const receiverAddressClean = clean(receiverAddressInput);
    const remarksClean = clean(complaintText);

    if (!senderNameClean) {
      alert("Sender name is required.");
      return;
    }
    if (!senderAddressClean) {
      alert("Sender address is required.");
      return;
    }
    if (!receiverNameClean) {
      alert("Addressee name is required.");
      return;
    }
    if (!receiverAddressClean) {
      alert("Receiver address is required.");
      return;
    }
    if (!senderCitySelected) {
      alert("Sender city is required.");
      return;
    }
    if (!receiverCitySelected) {
      alert("Receiver city is required.");
      return;
    }
    if (!complaintLocationSelected) {
      alert("Location selection is required before submit.");
      return;
    }
    const cityValue = String(selectedDistrict || selectedLocation || "").trim().toUpperCase();
    if (!cityValue) {
      alert("Please select recipient city from dropdown.");
      return;
    }
    if (!remarksClean || complaintTextRequired) {
      alert("Complaint text is required");
      return;
    }
    const bookingOfficeValue = senderCityValue.trim() || senderCitySearch.trim();
    const senderCityExact = matchComplaintCityOption(complaintCityOptions, [senderCityValue, senderCitySearch, bookingOfficeValue]) || senderCityValue.trim();
    const receiverCityExact = matchComplaintCityOption(complaintCityOptions, [receiverCityValue, receiverCitySearch]) || receiverCityValue.trim();
    if (!senderCityExact || !receiverCityExact) {
      alert("Please select sender/receiver city from dropdown results.");
      return;
    }
    setSubmittingComplaint(true);
    setComplaintSubmitNotice(null);
    try {
      window.localStorage.setItem(complaintPhoneStorageKey, normalizedPhone);
      if (complaintEmail.trim()) {
        window.localStorage.setItem(complaintEmailStorageKey, complaintEmail.trim());
      }
      const formSnapshot = {
        sender_name: senderNameClean,
        sender_address: senderAddressClean,
        receiver_name: receiverNameClean,
        receiver_address: receiverAddressClean,
        receiver_contact: normalizedPhone,
        booking_date: formatLastDate(complaintRecord.shipment),
        sender_city: senderCityExact,
        receiver_city: receiverCityExact,
        district: selectedDistrict || "",
        tehsil: selectedTehsil || "",
        location: selectedLocation || "",
        remarks: remarksClean,
      };
      const incompleteField = Object.entries(formSnapshot).find(([, value]) => !String(value ?? "").trim());
      if (incompleteField) {
        console.error("FORM INCOMPLETE - BLOCK SUBMISSION", { missing: incompleteField[0], formSnapshot });
        throw new Error(`FORM INCOMPLETE - BLOCK SUBMISSION (${incompleteField[0]})`);
      }
      console.log("Complaint Form Snapshot:", formSnapshot);

      const requestPayload = {
        tracking_number: trackingNumber,
        phone: normalizedPhone,
        complaint_text: remarksClean,
        sender_name: senderNameClean,
        sender_address: senderAddressClean,
        sender_city_value: senderCityExact,
        receiver_name: receiverNameClean,
        receiver_address: receiverAddressClean,
        receiver_contact: normalizedPhone,
        receiver_city_value: receiverCityExact,
        booking_date: formatLastDate(complaintRecord.shipment),
        booking_office: bookingOfficeValue,
        complaint_reason: complaintReason,
        prefer_reply_mode: replyMode,
        reply_email: complaintEmail.trim() || undefined,
        service_type: serviceType,
        recipient_city_value: receiverCityExact,
        recipient_district: selectedDistrict || "",
        recipient_tehsil: selectedTehsil || "",
        recipient_location: selectedLocation || "",
        browser_session: collectComplaintBrowserBootstrap(),
      };
      console.log("Payload:", requestPayload);

      const res = await api<{
        success: boolean;
        complaint_id?: string;
        due_date?: string;
        tracking_id?: string;
        status?: string;
        message?: string;
      }>("/api/tracking/complaint", {
        method: "POST",
        body: JSON.stringify(requestPayload),
      });
      const responseMessage = String(res.message ?? "").trim();
      const fallbackComplaintNumber = responseMessage.match(/(?:complaint\s*(?:id|#)|id)\s*[:#-]?\s*([A-Z0-9\-]+)/i)?.[1] ?? "";
      const complaintNumber = String(res.complaint_id ?? fallbackComplaintNumber).trim();
      const dueDate = String(res.due_date ?? "").trim();
      const trackingId = String(res.tracking_id ?? trackingNumber).trim();
      const isDuplicate = /already under process|duplicate/i.test(responseMessage) || String(res.status ?? "").toUpperCase() === "DUPLICATE";
      const hasRefund = res.status === "FAILED" && responseMessage.includes("refund");
      const status = isDuplicate ? "DUPLICATE" : (res.success ? "SUCCESS" : "FAILED");

      if (/submitted successfully/i.test(responseMessage)) {
        console.log("Complaint submitted successfully", { complaint_id: complaintNumber, due_date: dueDate, tracking_id: trackingId });
      } else if (/already under process/i.test(responseMessage)) {
        console.log("Complaint already under process", { complaint_id: complaintNumber, due_date: dueDate, tracking_id: trackingId });
      } else {
        console.log("Complaint submit response:", res);
      }

      const queueStatus = String(res.status ?? "").trim().toUpperCase() === "QUEUED";
      const finalUiStatus = queueStatus ? "QUEUED" : status;
      setComplaintSubmitResult({ complaintNumber, dueDate, trackingId, status: finalUiStatus });
      if (finalUiStatus === "DUPLICATE") {
        queueOptimisticComplaintState({
          trackingId,
          status: "duplicate",
          complaintId: complaintNumber,
          dueDate,
        });
        setComplaintToast({
          kind: "warning",
          message: complaintNumber
            ? `Complaint already exists for ${trackingId}. Complaint ID ${complaintNumber}.`
            : "Complaint already queued. Waiting for complaint number.",
        });
        closeComplaintModal();
        schedulePostSubmitRefresh();
      } else if (finalUiStatus === "QUEUED") {
        queueOptimisticComplaintState({ trackingId, status: "queued" });
        setComplaintToast({
          kind: "info",
          message: "Complaint queued. Complaint ID will appear after processing.",
        });
        closeComplaintModal();
        schedulePostSubmitRefresh();
      } else if (finalUiStatus === "SUCCESS") {
        queueOptimisticComplaintState({
          trackingId,
          status: complaintNumber ? "submitted" : "processing",
          complaintId: complaintNumber,
          dueDate,
        });
        setComplaintToast({
          kind: "info",
          message: complaintNumber
            ? `Complaint submitted for ${trackingId}. Complaint ID ${complaintNumber}.`
            : "Complaint queued. Complaint ID will appear after processing.",
        });
        closeComplaintModal();
        schedulePostSubmitRefresh();
      } else {
        setComplaintSubmitNotice({
          kind: "error",
          message: hasRefund
            ? "Request failed. Units will be refunded after admin approval."
            : friendlyComplaintMessage(res.message),
        });
      }
    } catch (e) {
      const message = friendlyComplaintMessage(e instanceof Error ? e.message : "Complaint submission failed");
      if (/already\s+(active|registered)|duplicate/i.test(message)) {
        const duplicateComplaintId = message.match(/(?:complaint\s*(?:id|#)|id)\s*[:#-]?\s*([A-Z0-9\-]+)/i)?.[1] ?? "";
        const duplicateDueDate = message.match(/due\s*date\s*[:#-]?\s*([0-3]?\d[\/-][0-1]?\d[\/-]\d{2,4})/i)?.[1] ?? "";
        queueOptimisticComplaintState({
          trackingId: trackingNumber,
          status: duplicateComplaintId ? "duplicate" : "queued",
          complaintId: duplicateComplaintId,
          dueDate: duplicateDueDate,
        });
        setComplaintToast({
          kind: "warning",
          message: duplicateComplaintId
            ? `Complaint already exists. Complaint ID ${duplicateComplaintId}.`
            : "Complaint already queued. Waiting for complaint number.",
        });
        closeComplaintModal();
        schedulePostSubmitRefresh();
        return;
      }
      setComplaintSubmitNotice({
        kind: "error",
        message,
      });
    } finally {
      setSubmittingComplaint(false);
    }
  }

  if (!hasAuthenticatedUser) {
    return (
      <PageShell className="space-y-0">
        <div className="mx-auto flex w-full max-w-3xl px-4 py-10">
          <div className="w-full rounded-[28px] border border-emerald-200 bg-white p-6 shadow-sm">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">Tracking Workspace</div>
            <div className="mt-2 text-2xl font-bold text-slate-900">Loading your workspace</div>
            <div className="mt-2 text-sm text-slate-600">
              Verifying your account before restoring tracking rows and cached workspace state.
            </div>
          </div>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell className="space-y-0">
    <div className="w-full min-w-0 flex-1 max-w-none overflow-x-hidden px-0 mx-0">
      {complaintToast ? (
        <div className="sticky top-3 z-30 mb-3 px-2 sm:px-0">
          <div
            className={cn(
              "flex w-full max-w-none items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm shadow-lg backdrop-blur",
              complaintToast.kind === "error"
                ? "border-red-200 bg-red-50 text-red-700"
                : complaintToast.kind === "warning"
                  ? "border-amber-200 bg-amber-50 text-amber-700"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700",
            )}
          >
            <span>{complaintToast.message}</span>
            <button
              type="button"
              onClick={() => setComplaintToast(null)}
              className="rounded border border-current/20 px-2 py-1 text-[11px] font-semibold text-inherit hover:bg-black/5"
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => {
          const target = document.getElementById("tracking-workspace-section");
          target?.scrollIntoView({ behavior: "smooth", block: "start" });
        }}
        className="fixed right-2 top-2 z-30 rounded-full border border-brand/40 bg-white/95 px-3 py-1 text-[11px] font-semibold text-brand shadow md:hidden"
      >
        Workspace
      </button>
      <div className="grid gap-3">
        <div className="min-w-0 w-full flex-1 space-y-3">
      <PageHeader
        eyebrow="Tracking"
        title="Tracking workspace"
        subtitle="Upload a file and review shipment status, complaints, and delivery progress."
        actions={<SampleDownloadLink />}
      />

      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => {
            setShowBatchHistory((prev) => {
              const next = !prev;
              if (next) {
                void refreshBatchHistory();
              }
              return next;
            });
          }}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", showBatchHistory && "rotate-90")} />
          {showBatchHistory ? "Hide batch history" : "Show batch history"}
        </button>
      </div>

      {showBatchHistory ? (
        <Card className="w-full min-w-0 overflow-hidden border border-[#E5E7EB] bg-white p-0 shadow-sm">
          <div className="border-b border-[#E5E7EB] px-4 py-3 md:px-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-lg">Tracking Batch History</CardTitle>
                <div className="mt-1 text-xs text-slate-500">Saved batches can be re-run without re-uploading file.</div>
              </div>
              <button
                type="button"
                onClick={() => void refreshBatchHistory()}
                className="inline-flex items-center gap-1 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", batchHistoryLoading && "animate-spin")} />
                Refresh Batches
              </button>
            </div>
          </div>
          <div className="w-full overflow-x-auto">
            <table className="min-w-[1080px] w-full text-xs">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Batch ID</th>
                  <th className="px-3 py-2 text-left font-semibold">Upload Date</th>
                  <th className="px-3 py-2 text-left font-semibold">Total Tracking IDs</th>
                  <th className="px-3 py-2 text-left font-semibold">Current Status</th>
                  <th className="px-3 py-2 text-left font-semibold">Last Tracking Run</th>
                  <th className="px-3 py-2 text-left font-semibold">Units Consumed</th>
                  <th className="px-3 py-2 text-left font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {batchHistory.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-4 text-center text-slate-500">
                      {batchHistoryLoading ? "Loading tracking batches..." : "No saved tracking batches yet."}
                    </td>
                  </tr>
                ) : batchHistory.map((batch) => {
                  const actionBusy = batchActionLoadingId === batch.id;
                  return (
                    <tr key={batch.id}>
                      <td className="px-3 py-2 font-mono text-[11px] text-slate-800">{batch.id}</td>
                      <td className="px-3 py-2 text-slate-700">{formatBatchDateTime(batch.uploadDate)}</td>
                      <td className="px-3 py-2 text-slate-700">{batch.totalTrackingIds}</td>
                      <td className="px-3 py-2">
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                          {batch.currentStatus}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-700">{formatBatchDateTime(batch.lastTrackingRun)}</td>
                      <td className="px-3 py-2 text-slate-700">{batch.unitsConsumed}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            disabled={actionBusy}
                            onClick={() => void runSavedBatch(batch.id)}
                            className="rounded-lg border border-brand/30 bg-brand/10 px-2.5 py-1 text-[11px] font-semibold text-brand hover:bg-brand/20 disabled:opacity-50"
                          >
                            Run Tracking
                          </button>
                          <button
                            type="button"
                            disabled={actionBusy || !batch.hasMasterFile}
                            onClick={() => downloadSavedBatchMaster(batch.id)}
                            className="rounded-lg border border-sky-300 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700 hover:bg-sky-100 disabled:opacity-50"
                          >
                            Download Master File
                          </button>
                          <button
                            type="button"
                            disabled={actionBusy}
                            onClick={() => {
                              setStatusFilter("COMPLAINT_TOTAL");
                              setPage(1);
                              document.getElementById("tracking-workspace-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
                            }}
                            className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                          >
                            Complaints
                          </button>
                          <button
                            type="button"
                            disabled={actionBusy}
                            onClick={() => {
                              setStatusFilter("DELIVERED");
                              setPage(1);
                              document.getElementById("tracking-workspace-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
                            }}
                            className="rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                          >
                            Settlement
                          </button>
                          <button
                            type="button"
                            disabled={actionBusy}
                            onClick={() => void deleteSavedBatch(batch.id)}
                            className="rounded-lg border border-red-300 bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                          >
                            Delete Batch
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      <UnifiedShipmentCards
        items={[
          {
            key: "ALL",
            label: "Total",
            parcels: workspaceShipmentStats.total,
            amount: workspaceShipmentStats.totalAmount,
            active: statusFilter === "ALL",
          },
          {
            key: "DELIVERED",
            label: "Delivered",
            parcels: workspaceShipmentStats.delivered,
            amount: workspaceShipmentStats.deliveredAmount,
            active: statusFilter === "DELIVERED",
          },
          {
            key: "PENDING",
            label: "Pending",
            parcels: workspaceShipmentStats.pending,
            amount: workspaceShipmentStats.pendingAmount,
            active: statusFilter === "PENDING",
          },
          {
            key: "RETURNED",
            label: "Returned",
            parcels: workspaceShipmentStats.returned,
            amount: workspaceShipmentStats.returnedAmount,
            active: statusFilter === "RETURNED",
          },
          {
            key: "COMPLAINTS",
            label: "Complaints",
            parcels: workspaceShipmentStats.complaints,
            amount: workspaceShipmentStats.complaintAmount,
            active: statusFilter === "COMPLAINT_TOTAL",
          },
        ]}
        onSelect={(key) => {
          if (key === "COMPLAINTS") {
            setStatusFilter("COMPLAINT_TOTAL");
            setPage(1);
            return;
          }
          setStatusFilter(key as StatusCardFilter);
          setPage(1);
        }}
      />
      <div className="mt-1 text-[11px] font-medium text-slate-500">Cards and table now use the same synced tracking dataset.</div>

      {uiState === "processing" && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-brand px-6 py-3 text-white shadow-lg transition-all duration-300">
          <div className="flex w-full max-w-none flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="h-2 w-2 animate-pulse rounded-full bg-white" />
                <span className="font-medium">Tracking in progress...</span>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-sm font-medium">{Math.round(progress)}%</div>
                <div className="h-2 w-32 overflow-hidden rounded-full bg-brand/70">
                  <div className="h-full bg-white transition-all duration-300 ease-out" style={{ width: `${progress}%` }} />
                </div>
              </div>
            </div>
            <ProcessStepper
              title="Tracking workflow"
              subtitle="Upload, validate, process, sync, and finish."
              steps={[
                { label: "Upload", detail: "Send the Tracking File.xls to the server." },
                { label: "Validate", detail: "Confirm the tracking rows and columns." },
                { label: "Process", detail: "Queue the tracking job and fetch updates." },
                { label: "Sync", detail: "Merge shipment, complaint, and batch data." },
                { label: "Complete", detail: "Render the finished workspace." },
              ]}
              activeIndex={Math.max(0, Math.min(4, progress >= 100 ? 4 : progress >= 75 ? 3 : progress >= 40 ? 2 : 1))}
              progress={progress}
            />
          </div>
        </div>
      )}

      <Card className="w-full min-w-0">
        <div id="tracking-workspace-section" />
        <div className="border-b px-4 py-3 md:px-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-xl">ePost.pk Bulk Tracking</CardTitle>
              <div className="mt-1 text-sm font-normal text-slate-500">Follow this 4-step flow to keep tracking, complaint, and settlement data aligned.</div>
            </div>
          </div>
        </div>

        <div className="grid gap-2 p-3">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
            {[
              { step: "STEP 1", title: "Generate Labels", text: "Generate labels and tracking IDs from validated rows." },
              { step: "STEP 2", title: "Download Tracking File.xls", text: "Export Tracking File.xls after generation completes." },
              { step: "STEP 3", title: "Upload Same File Here", text: "Upload the same exported file into this Track Parcel workspace." },
              { step: "STEP 4", title: "Track / Complaint / Settlement", text: "Use one source for statuses, complaint handling, and settlement checks." },
            ].map((card) => (
              <div key={card.step} className="rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 px-3 py-2.5 shadow-sm">
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{card.step}</div>
                <div className="mt-1 text-sm font-semibold text-slate-900">{card.title}</div>
                <div className="mt-1 text-xs leading-relaxed text-slate-600">{card.text}</div>
              </div>
            ))}
          </div>

          <div
            {...getRootProps()}
            className={cn(
              "relative w-full rounded-[24px] border border-dashed bg-white p-4 transition-all duration-300 ease-in-out",
              isDragActive ? "border-brand bg-brand/10" : "border-gray-200 hover:border-gray-300",
            )}
          >
            <input {...getInputProps()} />
            <div className="flex flex-col items-center text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-50">
                <UploadCloud className="h-6 w-6 text-gray-600" />
              </div>
              <div className="mt-4 text-base font-medium text-[#0F172A]">Drop your Excel or CSV file</div>
              <div className="mt-1 text-sm text-gray-600">
                or{" "}
                <button type="button" className="font-medium text-brand hover:text-brand" onClick={open}>
                  browse files
                </button>
              </div>

              <div className="mt-4 w-full text-xs text-gray-600">
                <div className="flex items-center justify-between">
                  <span className="truncate pr-2">{file ? file.name : "No file selected"}</span>
                  <span className="font-medium text-[#0F172A]">{statusLabel}</span>
                </div>
                {file ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className={cn(
                      "rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                      detectedUploadKind === "tracking master file"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : detectedUploadKind === "shipment upload file"
                          ? "border-sky-200 bg-sky-50 text-sky-700"
                          : detectedUploadKind === "tracking-only file"
                            ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                            : "border-amber-200 bg-amber-50 text-amber-700",
                    )}>
                      Detected: {detectedUploadKind === "tracking master file" ? "Tracking File.xls" : detectedUploadKind}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                      Tracking IDs: {detectedTrackingCount}
                    </span>
                  </div>
                ) : null}
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ease-in-out ${
                      error ? "bg-red-500" : uiState === "uploading" ? "bg-amber-500" : "bg-brand"
                    }`}
                    style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
                  />
                </div>
                {showRechargeAlert ? (
                  <div className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700">
                    <div className="flex items-center gap-2 font-medium">
                      <AlertCircle className="h-4 w-4" />
                      Account Recharge Required
                    </div>
                    <div className="mt-1">Insufficient units to process this file. Please recharge your account to continue tracking.</div>
                  </div>
                ) : showServiceAlert ? (
                  <div className="mt-3 rounded-md bg-amber-50 p-3 text-left text-sm text-amber-800">
                    <div className="flex items-center gap-2 font-medium">
                      <AlertCircle className="h-4 w-4" />
                      Tracking Service Offline
                    </div>
                    <div className="mt-1">The Python service is not running. Start it in a new terminal:</div>
                    <div className="mt-2 select-all rounded bg-amber-100 p-2 font-mono text-xs">
                      cd python-service && uvicorn app:app --host 0.0.0.0 --port 8000
                    </div>
                  </div>
                ) : polling.jobError || error ? (
                  <div className="mt-2 text-sm text-red-600">{polling.jobError ?? error}</div>
                ) : null}
              </div>
            </div>
            {isDragActive ? <div className="pointer-events-none absolute inset-2 rounded-2xl ring-1 ring-brand/40" /> : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ActionButton
              variant="secondary"
              onClick={() => {
                submitTrackingRef.current = false;
                setFile(null);
                setResults(null);
                setError(null);
                setShowRechargeAlert(false);
                setShowServiceAlert(false);
                setUiState("idle");
                setProgress(0);
                setElapsed(0);
                setEstimatedTotalSec(null);
                setRecordCount(0);
                polling.reset();
              }}
            >
              Reset
            </ActionButton>
            <ActionButton
              disabled={!file || polling.jobStatus === "PROCESSING" || polling.jobStatus === "QUEUED" || uiState === "uploading"}
              onClick={async () => {
                if (!file) return;
                if (submitTrackingRef.current) return;
                submitTrackingRef.current = true;
                setError(null);
                setShowRechargeAlert(false);
                setShowServiceAlert(false);
                setShowNoTrackingModal(false);
                setResults(null);
                try {
                  const analysis = await analyzeTrackingUploadFile(file);
                  setDetectedUploadKind(analysis.kind);
                  setDetectedTrackingCount(analysis.trackingCount);
                  if (analysis.trackingCount <= 0) {
                    setShowNoTrackingModal(true);
                    setUiState("idle");
                    setProgress(0);
                    submitTrackingRef.current = false;
                    return;
                  }

                  setUiState("uploading");
                  setStatusFilter("ALL");
                  setPage(1);
                  setJobStartTime(Date.now());
                  setProgress(0);
                  setElapsed(0);
                  setEstimatedTotalSec(null);
                  await apiHealthCheck();

                  const res = (await uploadFile("/api/tracking/upload", file)) as { jobId: string; recordCount?: number };
                  setRecordCount(res.recordCount ?? 0);
                  setEstimatedTotalSec(Math.ceil(((res.recordCount ?? 0) || 1) * 0.4));
                  polling.start(res.jobId);
                  await refreshShipments();
                  setUiState("processing");
                } catch (e) {
                  submitTrackingRef.current = false;
                  setUiState("failed");
                  const msg = e instanceof Error ? e.message : "Upload failed";
                  setError(msg);
                  setProgress(100);
                  if (msg.match(/(credit|balance|recharge|quota|limit)/i)) {
                    setShowRechargeAlert(true);
                  }
                  if (msg.includes("Tracking service is offline")) {
                    setShowServiceAlert(true);
                  }
                }
              }}
            >
              Start tracking
            </ActionButton>
          </div>
        </div>
      </Card>

      {showNoTrackingModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-[0_30px_80px_rgba(15,23,42,0.28)]">
            <div className="text-lg font-semibold text-slate-900">No tracking IDs found</div>
            <div className="mt-2 text-sm text-slate-600">No tracking IDs found. Please upload exported Tracking File.xls.</div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowNoTrackingModal(false)}
                className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {false && results ? (
        <Card className="p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-lg font-medium text-[#0F172A]">Results</div>
              <div className="mt-1 text-sm text-gray-600">{stats.total.toLocaleString()} shipments</div>
            </div>
            <div className="text-xs text-gray-600">
              {Object.entries(stats.by)
                .map(([k, v]) => `${k}: ${v}`)
                .join(" | ")}
            </div>
          </div>

          <div className="mt-4 overflow-x-auto rounded-2xl border bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500 whitespace-nowrap">#</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500 whitespace-nowrap">TrackingID</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500 whitespace-nowrap">shipperName</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500 whitespace-nowrap">shipperAddress</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500 whitespace-nowrap">senderCity</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500 whitespace-nowrap">shipperPhone</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500 whitespace-nowrap">consigneeName</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500 whitespace-nowrap">consigneeAddress</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500 whitespace-nowrap">receiverCity</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500 whitespace-nowrap">consigneePhone</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500 whitespace-nowrap">CollectAmount</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500 whitespace-nowrap">ProductDescription</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500 whitespace-nowrap">Weight</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500 whitespace-nowrap">status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(results ?? []).map((r, index) => {
                  const shipment = shipmentByTracking.get(r.tracking_number)?.shipment;
                  const fields = getUnifiedFields(shipment?.rawJson);
                  return (
                    <tr key={r.tracking_number}>
                      <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{index + 1}</td>
                      <td className="px-3 py-2 font-mono text-xs text-gray-800 whitespace-nowrap">{fields.TrackingID || r.tracking_number}</td>
                      <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{fields.shipperName || ""}</td>
                      <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{fields.shipperAddress || ""}</td>
                      <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{fields.senderCity || ""}</td>
                      <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{fields.shipperPhone || ""}</td>
                      <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{fields.consigneeName || ""}</td>
                      <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{fields.consigneeAddress || ""}</td>
                      <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{fields.consigneeCity || ""}</td>
                      <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{fields.consigneePhone || ""}</td>
                      <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{fields.CollectAmount || "0"}</td>
                      <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{fields.ProductDescription || ""}</td>
                      <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{fields.Weight || ""}</td>
                      <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{r.status || "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }}>
      <Card className="w-full min-w-0 overflow-hidden rounded-[24px] border border-[#E5E7EB] bg-white p-0 shadow-sm">
        <div className="border-b border-[#E5E7EB] bg-[linear-gradient(180deg,rgba(248,250,252,0.96),rgba(255,255,255,0.92))] px-4 py-3 backdrop-blur-md md:px-4 md:py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand/10">
                <Truck className="h-4 w-4 text-brand" />
              </div>
              <div>
                <div className="text-base font-bold tracking-tight text-[#111827]">All Tracked Shipments</div>
                <div className="text-xs text-[#6B7280]">Search, status, history, and money-order details.</div>
              </div>
            </div>
            <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:flex-wrap md:items-center">
            <div className="flex w-full flex-col gap-2 sm:flex-row md:w-auto">
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") applyTrackingSearch();
                }}
                placeholder="Search tracking, city, status, complaint..."
                className="w-full rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-xs font-medium text-[#111827] outline-none focus:border-brand sm:min-w-[240px]"
              />
              <button
                type="button"
                onClick={applyTrackingSearch}
                className="inline-flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-xl bg-brand px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-brand-dark sm:w-auto"
              >
                <Search className="h-3.5 w-3.5" />
                Search
              </button>
            </div>
            <label className="inline-flex w-full items-center justify-between gap-1.5 rounded-xl border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm sm:w-auto sm:justify-start">
              <span>Records:</span>
              <select
                className="border-0 bg-transparent text-xs font-semibold text-slate-700 outline-none"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value) as 20 | 50 | 100);
                  setPage(1);
                }}
              >
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </label>
            <label className="inline-flex w-full items-center justify-between gap-1.5 rounded-xl border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-medium text-[#6B7280] shadow-sm sm:w-auto sm:justify-start">
              <span>Status:</span>
              <select
                className="border-0 bg-transparent text-xs font-semibold text-[#111827] outline-none"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as ExtendedStatusFilter);
                  setPage(1);
                }}
              >
                <option value="ALL">All</option>
                <option value="PENDING">Pending</option>
                <option value="DELIVERED">Delivered</option>
                <option value="RETURNED">Returned</option>
                <option value="COMPLAINT_WATCH">Complaint Watch</option>
                <option value="COMPLAINT_TOTAL">Complaint Total</option>
                <option value="COMPLAINT_ACTIVE">Complaint Active</option>
                <option value="COMPLAINT_OVERDUE">Complaint Overdue</option>
                <option value="COMPLAINT_CLOSED">Complaint Closed</option>
                <option value="COMPLAINT_REOPENED">Complaint Reopened</option>
                <option value="COMPLAINT_IN_PROCESS">Complaint In Process</option>
              </select>
            </label>
            {selectedIds.length > 0 && (
              <button
                onClick={deleteSelected}
                className="inline-flex w-full items-center justify-center gap-1 rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 shadow-sm transition-colors hover:bg-red-100 sm:w-auto"
              >
                <X className="h-3 w-3" />
                Delete {selectedIds.length}
              </button>
            )}
            <button
              onClick={refreshAllPending}
              disabled={refreshingPending}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-brand/30 bg-brand/10 px-3 py-1.5 text-xs font-semibold text-brand shadow-sm transition-colors hover:bg-brand/20 disabled:opacity-60 sm:w-auto"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", refreshingPending && "animate-spin")} />
              Refresh Pending
            </button>
            <button
              onClick={() => void refreshShipments({ force: true })}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm transition-colors hover:border-brand/40 hover:bg-slate-50 sm:w-auto"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
            <button
              type="button"
              onClick={exportFilteredTrackingCsv}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-semibold text-[#111827] shadow-sm transition-colors hover:bg-[#F8FAF9] sm:w-auto"
            >
              Export
            </button>
          </div>
        </div>
        {refreshSummary ? <div className="border-t border-[#E5E7EB] bg-[#F8FAF9] px-4 py-2 text-xs text-[#6B7280]">{refreshSummary}</div> : null}
        </div>
        <div className="p-0">
          <div className="hidden items-center justify-between border-y border-[#E5E7EB] bg-[linear-gradient(180deg,#f8fafc,#f1f5f9)] px-4 py-2 text-xs text-slate-600 md:flex">
            <div className="text-slate-500">
              Page <span className="font-semibold text-slate-700">{page}</span> of <span className="font-semibold text-slate-700">{totalPages}</span> &nbsp;·&nbsp; <span className="font-semibold text-slate-700">{paginatedTrackingTableRows.length}</span> of <span className="font-semibold text-slate-700">{totalFilteredShipments}</span> filtered
            </div>
            <div className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/80 px-1.5 py-1 shadow-sm backdrop-blur-sm">
              <button
                className="rounded-lg border border-[#E5E7EB] bg-white px-2.5 py-1 text-xs font-medium shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-40"
                disabled={page <= 1}
                onClick={() => setPage(1)}
              >
                First
              </button>
              <button
                className="rounded-lg border border-[#E5E7EB] bg-white px-2.5 py-1 text-xs font-medium shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-40"
                disabled={page <= 1}
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              >
                Previous
              </button>
              {paginationWindow.map((item, index) => (
                typeof item === "number" ? (
                  <button
                    key={`top-page-${item}`}
                    className={cn(
                      "rounded-lg border px-2.5 py-1 text-xs font-medium shadow-sm transition-colors",
                      page === item
                        ? "border-brand bg-brand/10 text-brand"
                        : "border-[#E5E7EB] bg-white hover:bg-slate-50",
                    )}
                    onClick={() => setPage(item)}
                  >
                    {item}
                  </button>
                ) : (
                  <span key={`top-ellipsis-${index}`} className="px-1 text-xs text-slate-500">...</span>
                )
              ))}
              <button
                className="rounded-lg border border-[#E5E7EB] bg-white px-2.5 py-1 text-xs font-medium shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-40"
                disabled={page >= totalPages}
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              >
                Next
              </button>
              <button
                className="rounded-lg border border-[#E5E7EB] bg-white px-2.5 py-1 text-xs font-medium shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-40"
                disabled={page >= totalPages}
                onClick={() => setPage(totalPages)}
              >
                Last
              </button>
            </div>
          </div>
          <div className="space-y-2 border-y border-[#E5E7EB] bg-[linear-gradient(180deg,#f8fafc,#ffffff)] p-3 md:hidden">
            <div className="text-xs text-slate-600">
              Page <span className="font-semibold text-slate-700">{page}</span> of <span className="font-semibold text-slate-700">{totalPages}</span> · <span className="font-semibold text-slate-700">{paginatedTrackingTableRows.length}</span> of <span className="font-semibold text-slate-700">{totalFilteredShipments}</span> filtered
            </div>
            <div className="grid gap-2.5">
              {paginatedTrackingTableRows.map((row, index) => {
                const s = row.record.shipment;
                const lifecycle = row.lifecycle;
                const queueSnapshot = complaintQueueByTracking.get(s.trackingNumber);
                const isComplaintEnabled = isComplaintActionAllowed(row.actionStatus, lifecycle, queueSnapshot);
                const complaintActionLabel = resolveComplaintActionLabel(row.actionStatus, lifecycle, queueSnapshot);
                const complaintActionLocked = isComplaintActionLocked(complaintActionLabel);
                const statusUpper = normalizeStatus(row.actionStatus).toUpperCase();
                const isWarning = row.record.delayed;
                const fetchedMO = extractMoReference(s.rawJson, s.moIssued ?? null, s.moneyOrderIssued);
                const issuedValue = extractMoValue(s.rawJson, s.moValue ?? null);
                const actionOptions = [
                  { label: "Pending", val: "PENDING" },
                  { label: "Delivered", val: "DELIVERED" },
                  { label: "Return", val: "RETURNED" },
                ];
                const validActionValues = new Set(actionOptions.map((opt) => opt.val));
                const normalizedDisplayStatus = String(row.actionStatus ?? "").trim().toUpperCase().includes("RETURN")
                  ? "RETURNED"
                  : String(row.actionStatus ?? "").trim().toUpperCase();
                const actionValue = !normalizedDisplayStatus || !validActionValues.has(normalizedDisplayStatus)
                  ? "PENDING"
                  : normalizedDisplayStatus;

                return (
                  <div key={s.id} className="rounded-2xl border border-[#E5E7EB] bg-white p-3 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-[11px] font-semibold text-slate-500">#{(page - 1) * pageSize + index + 1}</div>
                      <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset", isWarning ? "bg-red-100 text-red-700 ring-red-200" : row.statusBadge)}>
                        {statusUpper}
                      </span>
                    </div>
                    <div className="mt-1 font-mono text-xs font-bold text-slate-800 break-all">{s.trackingNumber}</div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                      <div className="rounded-lg bg-slate-50 px-2 py-1.5">
                        <div className="text-slate-500">City</div>
                        <div className="mt-0.5 font-semibold text-slate-800">{row.displayCity || "-"}</div>
                      </div>
                      <div className="rounded-lg bg-slate-50 px-2 py-1.5">
                        <div className="text-slate-500">Money Order</div>
                        <div className="mt-0.5 font-semibold text-slate-800">{fetchedMO || "-"}</div>
                      </div>
                      <div className="rounded-lg bg-slate-50 px-2 py-1.5">
                        <div className="text-slate-500">Amount</div>
                        <div className="mt-0.5 font-semibold text-emerald-700">{issuedValue != null ? `Rs ${issuedValue.toLocaleString()}` : "-"}</div>
                      </div>
                      <div className="rounded-lg bg-slate-50 px-2 py-1.5">
                        <div className="text-slate-500">Updated</div>
                        <div className="mt-0.5 font-semibold text-slate-800">{row.updatedDateLabel}</div>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-col gap-2">
                      <select
                        className="w-full rounded-lg border-[#E5E7EB] bg-white px-2.5 py-2 text-xs font-medium text-slate-700 shadow-sm focus:border-brand focus:ring-brand"
                        value={actionValue}
                        onChange={(e) => updateStatus(s.trackingNumber, e.target.value.includes("RETURN") ? "RETURNED" : e.target.value)}
                      >
                        {actionOptions.map((opt) => (
                          <option key={opt.val} value={opt.val}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedTracking(row.record)}
                          className="inline-flex items-center justify-center rounded-lg bg-brand px-3 py-2 text-[11px] font-semibold text-white"
                        >
                          Track
                        </button>
                        <button
                          type="button"
                          disabled={!isComplaintEnabled || complaintActionLocked}
                          onClick={() => openComplaintModal(row.record)}
                          className={cn(
                            "inline-flex items-center justify-center rounded-lg px-3 py-2 text-[11px] font-semibold ring-1 ring-inset",
                            isComplaintEnabled && !complaintActionLocked
                              ? "bg-red-50 text-red-700 ring-red-200"
                              : "cursor-not-allowed bg-gray-50 text-gray-400 ring-gray-200",
                          )}
                        >
                          {complaintActionLabel}
                        </button>
                        {isConfirmResolvedVisible(lifecycle, row.actionStatus) ? (
                          <button
                            type="button"
                            onClick={() => handleConfirmResolved(s.trackingNumber)}
                            disabled={resolvingTrackingNumber === s.trackingNumber}
                            className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-3 py-2 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                          >
                            {resolvingTrackingNumber === s.trackingNumber ? "Resolving..." : "Confirm Resolved"}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
              {paginatedTrackingTableRows.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">No shipments found.</div>
              ) : null}
            </div>
            <div className="flex items-center justify-between gap-2 pt-1">
              <button
                className="rounded-lg border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-medium shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-40"
                disabled={page <= 1}
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              >
                Previous
              </button>
              <button
                className="rounded-lg border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-medium shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-40"
                disabled={page >= totalPages}
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              >
                Next
              </button>
            </div>
          </div>
          <div className="hidden w-full max-h-[72vh] overflow-y-auto overflow-x-auto rounded-[20px] border border-[#E5E7EB] bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] md:block">
            <table className="min-w-[980px] w-full table-fixed text-[11px] leading-4">
              <thead className="sticky top-0 z-10 border-b border-[#E5E7EB] bg-[linear-gradient(180deg,rgba(248,250,252,0.98),rgba(241,245,249,0.98))] backdrop-blur-md">
              <tr>
                <th className="w-9 border-r border-[#E5E7EB] px-3 py-3.5">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand"
                    checked={paginatedTrackingTableRows.length > 0 && paginatedTrackingTableRows.every((s) => selectedIds.includes(s.record.shipment.id))}
                    onChange={(e) =>
                      setSelectedIds((prev) => {
                        const pageIds = paginatedTrackingTableRows.map((s) => s.record.shipment.id);
                        if (!e.target.checked) {
                          return prev.filter((id) => !pageIds.includes(id));
                        }
                        return Array.from(new Set([...prev, ...pageIds]));
                      })
                    }
                  />
                </th>
                <th className="w-14 border-r border-[#E5E7EB] px-3 py-3.5 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-[#6B7280]">
                  S.No
                </th>
                <th className="w-24 border-r border-[#E5E7EB] px-3 py-3.5 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-[#6B7280]">
                  <button type="button" onClick={() => toggleTrackingSort("bookingDate")} className="inline-flex items-center gap-1 hover:text-slate-900">
                    Booking / Updated
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="w-32 border-r border-[#E5E7EB] px-3 py-3.5 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-[#6B7280]">
                  <button type="button" onClick={() => toggleTrackingSort("trackingNumber")} className="inline-flex items-center gap-1 hover:text-slate-900">
                    <PackageSearch className="h-3 w-3" /> Tracking
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="w-20 border-r border-[#E5E7EB] px-3 py-3.5 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-[#6B7280]">
                  <button type="button" onClick={() => toggleTrackingSort("status")} className="inline-flex items-center gap-1 hover:text-slate-900">
                    Status
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="w-28 border-r border-[#E5E7EB] px-3 py-3.5 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-[#6B7280]">
                  <button type="button" onClick={() => toggleTrackingSort("city")} className="inline-flex items-center gap-1 hover:text-slate-900">
                    <MapPin className="h-3 w-3" /> City
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="w-28 border-r border-[#E5E7EB] px-3 py-3.5 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-[#6B7280]">
                  <button type="button" onClick={() => toggleTrackingSort("moNumber")} className="inline-flex items-center gap-1 hover:text-slate-900">
                    <BadgeDollarSign className="h-3 w-3" /> Money Order No
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="w-24 border-r border-[#E5E7EB] px-3 py-3.5 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-[#6B7280]">
                  <button type="button" onClick={() => toggleTrackingSort("moAmount")} className="inline-flex items-center gap-1 hover:text-slate-900">
                    Money Order Amount
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="w-28 border-r border-[#E5E7EB] px-2 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-[#6B7280]">
                  Action
                </th>
                <th className="w-[132px] px-3 py-3.5 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-[#6B7280]">
                  Complaint
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E7EB]">
              {/* PROTECTED_SCOPE_START
                  Stable enterprise tracking workspace.
                  Restored from commit 996eaac.
                  Includes performance hydration + compact rendering.
                  Do not remove cache hydration or row precomputation.
                  Regression-sensitive rendering path.
              PROTECTED_SCOPE_END */}
              {paginatedTrackingTableRows.map((row, index) => {
                const s = row.record.shipment;
                const actionStatus = row.actionStatus;
                const days = row.days;
                const lifecycle = row.lifecycle;
                const queueSnapshot = complaintQueueByTracking.get(s.trackingNumber);
                const complaintCardState = row.complaintState;
                const displayStatus = row.actionStatus;
                const statusUpper = normalizeStatus(displayStatus).toUpperCase();
                const isComplaintEnabled = isComplaintActionAllowed(actionStatus, lifecycle, queueSnapshot);
                const complaintActionLabel = resolveComplaintActionLabel(actionStatus, lifecycle, queueSnapshot);
                const complaintActionLocked = isComplaintActionLocked(complaintActionLabel);

                const actionOptions = [
                  { label: "Pending", val: "PENDING" },
                  { label: "Delivered", val: "DELIVERED" },
                  { label: "Return", val: "RETURNED" },
                ];
                const validActionValues = new Set(actionOptions.map((opt) => opt.val));
                const normalizedDisplayStatus = String(actionStatus ?? "").trim().toUpperCase().includes("RETURN")
                  ? "RETURNED"
                  : String(actionStatus ?? "").trim().toUpperCase();
                const effectiveActionOptions = actionOptions;
                const actionValue =
                  !normalizedDisplayStatus || !validActionValues.has(normalizedDisplayStatus)
                    ? "PENDING"
                    : normalizedDisplayStatus;

                const isWarning = row.record.delayed;
                const fetchedMO = extractMoReference(s.rawJson, s.moIssued ?? null, s.moneyOrderIssued);
                const moValue = fetchedMO ? fetchedMO : "-";
                const issuedValue = extractMoValue(s.rawJson, s.moValue ?? null);
                const complaintStateUpper = complaintCardState.toUpperCase();
                const rowVisual = complaintStateUpper === "PROCESSING"
                  ? { left: "border-l-purple-500" }
                  : complaintStateUpper === "RETRY PENDING"
                    ? { left: "border-l-yellow-500" }
                    : complaintStateUpper === "ACTIVE"
                      ? { left: "border-l-blue-500" }
                      : statusUpper.includes("DELIVERED")
                        ? { left: "border-l-emerald-500" }
                        : statusUpper.includes("RETURN")
                          ? { left: "border-l-red-500" }
                          : isWarning
                            ? { left: "border-l-purple-400" }
                            : { left: "border-l-amber-500" };
                const rowBaseTone = index % 2 === 0 ? "bg-white" : "bg-[#FAFAFA]";

                return (
                  <tr key={s.id} className={cn("group border-b border-[#E5E7EB] transition-colors duration-150 hover:bg-[#F8FAFC]", rowBaseTone)}>
                    <td className={cn("border-r border-[#E5E7EB] border-l-4 px-2 py-2.5 align-middle", rowVisual.left)}>
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand"
                        checked={selectedIds.includes(s.id)}
                        onChange={() =>
                          setSelectedIds((prev) =>
                            prev.includes(s.id) ? prev.filter((id) => id !== s.id) : [...prev, s.id]
                          )
                        }
                      />
                    </td>
                    <td className="border-r border-[#E5E7EB] px-2 py-2.5 align-middle text-xs font-semibold text-slate-700">{(page - 1) * pageSize + index + 1}</td>
                    <td className="border-r border-[#E5E7EB] px-2 py-2.5 align-middle whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                          Booking
                        </span>
                        <span className="text-xs font-semibold text-slate-900">
                          {row.bookingDateLabel}
                        </span>
                        <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">Updated</span>
                        <span className="text-xs font-semibold text-slate-900">{row.updatedDateLabel}</span>
                      </div>
                    </td>
                    <td className="border-r border-[#E5E7EB] px-2 py-2.5 align-middle font-mono text-xs font-bold text-slate-800 group-hover:text-brand" title={s.trackingNumber}>
                      <div className="flex flex-col items-start gap-1.5">
                        <span className="break-all">{s.trackingNumber}</span>
                        <button
                          type="button"
                          onClick={() => setSelectedTracking(row.record)}
                          className="inline-flex items-center justify-center rounded-md bg-brand px-2.5 py-1 text-[10px] font-semibold text-white shadow-sm hover:bg-brand-dark"
                          title="Track"
                        >
                          Track
                        </button>
                      </div>
                    </td>
                    <td className="border-r border-[#E5E7EB] px-2 py-2.5 align-middle whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset", isWarning ? "bg-red-100 text-red-700 ring-red-200" : row.statusBadge)}>
                          {displayStatus}
                        </span>
                        <span className="mt-0.5 text-[10px] text-slate-500">{days}d</span>
                      </div>
                    </td>
                    <td className="border-r border-[#E5E7EB] px-2 py-2.5 align-middle text-xs leading-4 text-slate-600 whitespace-normal break-words" title={row.displayCity}>{row.displayCity}</td>
                    <td className="border-r border-[#E5E7EB] px-2 py-2.5 align-middle text-xs font-semibold text-slate-700" title={moValue || undefined}><span className="break-all">{moValue}</span></td>
                    <td className="border-r border-[#E5E7EB] px-2 py-2.5 align-middle text-xs font-medium text-slate-700 whitespace-nowrap">
                      {issuedValue != null ? `Rs ${issuedValue.toLocaleString()}` : "-"}
                    </td>
                    <td className="border-r border-[#E5E7EB] px-2 py-2.5 align-middle min-w-[120px] whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <select
                          className="w-24 rounded border-[#E5E7EB] bg-white px-2 py-1.5 text-[11px] font-medium text-slate-700 shadow-sm focus:border-brand focus:ring-brand"
                          value={actionValue}
                          onChange={(e) => updateStatus(s.trackingNumber, e.target.value.includes("RETURN") ? "RETURNED" : e.target.value)}
                        >
                          {effectiveActionOptions.map((opt) => (
                            <option key={opt.val} value={opt.val}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td className="px-2 py-2.5 pl-3 align-middle min-w-[160px]">
                      {lifecycle.exists || queueSnapshot ? (() => {
                        const stateStyle = complaintStateBadgeClass(complaintCardState);
                        const waitingComplaintId = complaintCardState.toUpperCase() === "QUEUED"
                          && !String(lifecycle.complaintId ?? "").trim()
                          && !String(queueSnapshot?.complaintId ?? "").trim();
                        const displayCmp = (lifecycle.complaintId || queueSnapshot?.complaintId || "").trim();
                        const complaintId = displayCmp || (waitingComplaintId ? "Queued" : "CMP Not Available");
                        const attemptCount = Math.max(1, lifecycle.complaintCount || queueSnapshot ? 1 : 0);
                        const dueDate = lifecycle.dueDateText
                          || (queueSnapshot?.dueDate ? new Date(queueSnapshot.dueDate).toLocaleDateString("en-GB") : "-");
                        const retryHint = complaintCardState === "RETRY PENDING"
                          ? formatRetryCountdown(queueSnapshot?.nextRetryAt, retryCountdownNow)
                          : "";
                        const showProcessingTimer = complaintCardState === "PROCESSING"
                          && !String(lifecycle.complaintId ?? "").trim()
                          && !String(queueSnapshot?.complaintId ?? "").trim();
                        const processingElapsed = showProcessingTimer
                          ? formatProcessingElapsed(queueSnapshot?.updatedAt, retryCountdownNow)
                          : "";
                        const processingUpdatedMs = showProcessingTimer && queueSnapshot?.updatedAt ? new Date(queueSnapshot.updatedAt).getTime() : 0;
                        const processingIsStale = showProcessingTimer
                          && processingUpdatedMs > 0
                          && retryCountdownNow - processingUpdatedMs > COMPLAINT_PROCESSING_STALE_UI_MS;
                        const lastErr = summarizeError(queueSnapshot?.lastError ?? null);
                        const stateMessage = waitingComplaintId
                          ? "Complaint already queued. Waiting for complaint number."
                          : complaintCardState.toUpperCase() === "MANUAL REVIEW"
                            ? "Complaint requires manual review." + (lastErr ? ` ${lastErr}` : " Contact support if this persists.")
                            : complaintCardState.toUpperCase() === "QUEUED"
                              ? "Queued for submission to Pakistan Post."
                              : lastErr && complaintCardState.toUpperCase() === "RETRY PENDING"
                                ? lastErr
                                : "";
                        return (
                          <div className="w-full rounded-xl border border-slate-200 bg-[linear-gradient(180deg,#ffffff,#f8fafc)] px-2.5 py-2 text-left text-[10px] shadow-sm">
                            <div className="font-semibold text-[#111827] break-all" title={complaintId}>{complaintId}</div>
                            <div className="mt-0.5 text-[#6B7280]">Due: {dueDate}</div>
                            <div className="mt-0.5 text-[#6B7280]">Attempt {attemptCount} of {attemptCount}</div>
                            <div className="mt-0.5">
                              <span className={cn("inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ring-1 ring-inset", stateStyle)}>
                                {complaintCardState}
                              </span>
                            </div>
                            {complaintCardState === "RETRY PENDING" ? (
                              <div className="mt-1 text-[9px] font-semibold text-amber-700">{retryHint}</div>
                            ) : null}
                            {showProcessingTimer ? (
                              <div className="mt-1 text-[9px] font-semibold text-purple-700">
                                {processingIsStale
                                  ? `Stale — Pending Retry (${processingElapsed})`
                                  : `Processing... ${processingElapsed}`}
                              </div>
                            ) : null}
                            {stateMessage ? (
                              <div className="mt-1 text-[9px] font-medium text-slate-600">{stateMessage}</div>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => openComplaintModal(row.record)}
                              disabled={!isComplaintEnabled || complaintActionLocked}
                              className={cn(
                                "mt-1.5 inline-flex w-full items-center justify-center rounded px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset transition-all",
                                isComplaintEnabled && !complaintActionLocked
                                  ? "bg-white text-emerald-800 ring-emerald-300 hover:bg-emerald-100"
                                  : "cursor-not-allowed bg-gray-50 text-gray-400 ring-gray-200"
                              )}
                            >
                            {complaintActionLabel}
                          </button>
                          {lifecycle.complaintCount > 0 ? (
                            <button
                              type="button"
                              onClick={() => setHistoryModalRecord(row.record)}
                              className="mt-1 inline-flex w-full items-center justify-center rounded px-2 py-0.5 text-[9px] font-medium ring-1 ring-inset transition-all bg-slate-50 text-slate-600 ring-slate-200 hover:bg-slate-100"
                            >
                              View History ({lifecycle.complaintCount})
                            </button>
                          ) : null}
                          {isConfirmResolvedVisible(lifecycle, actionStatus) ? (
                            <button
                              type="button"
                              onClick={() => handleConfirmResolved(s.trackingNumber)}
                              disabled={resolvingTrackingNumber === s.trackingNumber}
                              className="mt-1 inline-flex w-full items-center justify-center rounded px-2 py-0.5 text-[10px] font-semibold bg-emerald-600 text-white ring-1 ring-inset ring-emerald-700 hover:bg-emerald-700 disabled:opacity-50"
                            >
                              {resolvingTrackingNumber === s.trackingNumber ? "Resolving..." : "Confirm Resolved"}
                            </button>
                          ) : null}
                        </div>
                      );
                    })() : (
                      <button
                        disabled={!isComplaintEnabled}
                        onClick={() => openComplaintModal(row.record)}
                        className={cn(
                          "inline-flex w-full items-center justify-center gap-1 rounded-xl px-2 py-1 text-[11px] font-semibold shadow-sm ring-1 ring-inset transition-all",
                          isComplaintEnabled
                            ? "bg-red-50 text-red-700 ring-red-200 hover:bg-red-100"
                            : "cursor-not-allowed bg-gray-50 text-gray-400 ring-gray-200"
                        )}
                      >
                        <MessageSquare className="h-3 w-3" />
                        {resolveComplaintActionLabel(actionStatus, lifecycle, queueSnapshot)}
                      </button>
                    )}
                    </td>
                  </tr>
                );
              })}
              {paginatedTrackingTableRows.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-sm text-slate-500" colSpan={10}>
                    No shipments found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
          <div className="hidden items-center justify-between border-t border-[#E5E7EB] bg-[linear-gradient(180deg,#ffffff,#f8fafc)] px-4 py-3 text-xs text-slate-600 md:flex">
            <div className="text-slate-500">
              Page <span className="font-semibold text-slate-700">{page}</span> of <span className="font-semibold text-slate-700">{totalPages}</span> &nbsp;·&nbsp; <span className="font-semibold text-slate-700">{paginatedTrackingTableRows.length}</span> of <span className="font-semibold text-slate-700">{totalFilteredShipments}</span> filtered &nbsp;·&nbsp; <span className="font-semibold text-slate-700">{totalShipments}</span> total
            </div>
            <div className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/80 px-1.5 py-1 shadow-sm backdrop-blur-sm">
              <button
                className="rounded-lg border border-[#E5E7EB] bg-white px-2.5 py-1 text-xs font-medium shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-40"
                disabled={page <= 1}
                onClick={() => setPage(1)}
              >
                First
              </button>
              <button
                className="rounded-lg border border-[#E5E7EB] bg-white px-2.5 py-1 text-xs font-medium shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-40"
                disabled={page <= 1}
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              >
                Previous
              </button>
              {paginationWindow.map((item, index) => (
                typeof item === "number" ? (
                  <button
                    key={`bottom-page-${item}`}
                    className={cn(
                      "rounded-lg border px-2.5 py-1 text-xs font-medium shadow-sm transition-colors",
                      page === item
                        ? "border-brand bg-brand/10 text-brand"
                        : "border-[#E5E7EB] bg-white hover:bg-slate-50",
                    )}
                    onClick={() => setPage(item)}
                  >
                    {item}
                  </button>
                ) : (
                  <span key={`bottom-ellipsis-${index}`} className="px-1 text-xs text-slate-500">...</span>
                )
              ))}
              <button
                className="rounded-lg border border-[#E5E7EB] bg-white px-2.5 py-1 text-xs font-medium shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-40"
                disabled={page >= totalPages}
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              >
                Next
              </button>
              <button
                className="rounded-lg border border-[#E5E7EB] bg-white px-2.5 py-1 text-xs font-medium shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-40"
                disabled={page >= totalPages}
                onClick={() => setPage(totalPages)}
              >
                Last
              </button>
            </div>
          </div>
        </div>
      </Card>
      </motion.div>

      {isAdmin ? <Card className="border-[#E5E7EB] p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-slate-900">Tracking Cycle Audit (100 Sample)</div>
            <div className="mt-1 text-sm text-slate-600">Read-only mismatch audit with editable correction and reprocessing workflow.</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="rounded-2xl border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-[#F8FAF9] disabled:opacity-60"
              onClick={runCycleAudit}
              disabled={auditLoading}
            >
              {auditLoading ? "Auditing..." : "Run Audit"}
            </button>
            <button
              className="rounded-2xl bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-dark disabled:opacity-60"
              onClick={saveCycleCorrections}
              disabled={savingCorrections || auditRows.length === 0}
            >
              {savingCorrections ? "Saving..." : "Save Corrections & Reprocess"}
            </button>
            <button
              className="rounded-2xl border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-[#F8FAF9] disabled:opacity-60"
              onClick={exportAuditToCSV}
              disabled={auditRows.length === 0}
            >
              Export CSV
            </button>
            <button
              className="rounded-2xl border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-[#F8FAF9] disabled:opacity-60"
              onClick={() => importFileInputRef.current?.click()}
              disabled={importingCSV}
            >
              {importingCSV ? "Importing..." : "Import CSV"}
            </button>
            <input
              ref={importFileInputRef}
              type="file"
              accept=".csv"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  setImportingCSV(true);
                  void importAuditFromCSV(file).finally(() => setImportingCSV(false));
                  if (importFileInputRef.current) importFileInputRef.current.value = "";
                }
              }}
            />
          </div>
        </div>
        {auditSummary ? <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{auditSummary}</div> : null}
        {auditError ? <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{auditError}</div> : null}
        {auditRows.length > 0 ? (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-[#E5E7EB] bg-white">
            <table className="min-w-[1200px] text-xs">
              <thead className="bg-[#F8FAF9]">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Tracking</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Current</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Expected</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Cycle</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Issue</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Reason</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Missing/Incorrect Detection</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Editable Correction</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB]">
                {auditRows.map((row) => {
                  const draft = draftFor(row);
                  return (
                    <tr key={row.tracking_number}>
                      <td className="px-3 py-2 font-mono text-[11px] text-slate-800">{row.tracking_number}</td>
                      <td className="px-3 py-2 text-slate-700">{row.current_status}</td>
                      <td className="px-3 py-2 text-slate-700">{row.expected_status}</td>
                      <td className="px-3 py-2 text-slate-700">{row.cycle_detected}</td>
                      <td className="px-3 py-2 text-slate-700">{row.issue}</td>
                      <td className="px-3 py-2 text-slate-700">{row.reason}</td>
                      <td className="px-3 py-2 text-slate-700">{row.missing_detection.length > 0 ? row.missing_detection.join("; ") : "-"}</td>
                      <td className="px-3 py-2">
                        <div className="grid gap-1">
                          <select
                            className="rounded border border-[#E5E7EB] bg-white px-2 py-1"
                            value={draft.expected_status}
                            onChange={(e) => updateAuditDraft(row.tracking_number, { expected_status: e.target.value as CycleAuditDraft["expected_status"] }, row)}
                          >
                            <option value="PENDING">PENDING</option>
                            <option value="DELIVERED">DELIVERED</option>
                            <option value="RETURNED">RETURNED</option>
                            <option value="DELIVERED WITH PAYMENT">DELIVERED WITH PAYMENT</option>
                          </select>
                          <select
                            className="rounded border border-[#E5E7EB] bg-white px-2 py-1"
                            value={draft.cycle_detected}
                            onChange={(e) => updateAuditDraft(row.tracking_number, { cycle_detected: e.target.value as CycleAuditDraft["cycle_detected"] }, row)}
                          >
                            <option value="Cycle 1">Cycle 1</option>
                            <option value="Cycle 2">Cycle 2</option>
                            <option value="Cycle 3">Cycle 3</option>
                            <option value="Cycle Unknown">Cycle Unknown</option>
                          </select>
                          <input
                            className="rounded border border-[#E5E7EB] bg-white px-2 py-1"
                            value={draft.missing_steps}
                            onChange={(e) => updateAuditDraft(row.tracking_number, { missing_steps: e.target.value }, row)}
                            placeholder="Missing steps (semicolon separated)"
                          />
                          <input
                            className="rounded border border-[#E5E7EB] bg-white px-2 py-1"
                            value={draft.reason}
                            onChange={(e) => updateAuditDraft(row.tracking_number, { reason: e.target.value }, row)}
                            placeholder="Correction reason"
                          />
                          <label className="inline-flex items-center gap-1 text-[11px] text-slate-600">
                            <input
                              type="checkbox"
                              checked={draft.apply_to_issue_code}
                              onChange={(e) => updateAuditDraft(row.tracking_number, { apply_to_issue_code: e.target.checked }, row)}
                            />
                            Apply to same issue code
                          </label>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card> : null}
        </div>
      </div>
    </div>

      {complaintRecord ? (
        <div className="modal-wrapper z-40 bg-slate-950/60 p-4">
          <div ref={complaintModalRef} className="modal-content flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" role="dialog" aria-modal="true" aria-label="File Complaint">
            <div className="modal-header flex items-start justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
              <div>
                <div className="text-xl font-semibold text-slate-900">File Complaint</div>
                <div className="text-sm font-medium text-slate-600">Tracking: <span className="font-semibold text-slate-800">{complaintRecord.shipment.trackingNumber}</span></div>
                {(me?.balances?.complaintDailyLimit != null) && (
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-slate-500">
                    <span>Today: <span className="font-semibold text-slate-800">{me.balances.complaintDailyUsed ?? 0}</span> used / <span className="font-semibold text-emerald-700">{me.balances.complaintDailyRemaining ?? 0}</span> remaining (limit {me.balances.complaintDailyLimit})</span>
                    {me.balances.complaintMonthlyUsed != null && (
                      <span>This month: <span className="font-semibold text-slate-800">{me.balances.complaintMonthlyUsed}</span> total</span>
                    )}
                  </div>
                )}
              </div>
              <button
                type="button"
                className="rounded border border-[#E5E7EB] px-2 py-1 text-xs text-slate-600 hover:bg-[#F8FAF9]"
                onClick={closeComplaintModal}
              >
                Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-5">
              <div className="grid gap-2">
                {complaintSubmitNotice ? (
                  <div className={cn(
                    "rounded-2xl border px-3 py-2 text-xs",
                    complaintSubmitNotice.kind === "error"
                      ? "border-red-200 bg-red-50 text-red-800"
                      : complaintSubmitNotice.kind === "warning"
                        ? "border-amber-200 bg-amber-50 text-amber-800"
                        : "border-blue-200 bg-blue-50 text-blue-800",
                  )}>
                    {complaintSubmitNotice.message}
                  </div>
                ) : null}
                {activeComplaintLifecycle?.exists ? (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-xs text-emerald-900">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-semibold">Complaint ID: {activeComplaintLifecycle.complaintId}</div>
                        <div className="mt-1 text-emerald-800">Due Date: {activeComplaintLifecycle.dueDateText || "-"}</div>
                        <div className="mt-1 text-emerald-800">Status: {activeComplaintLifecycle.stateLabel}</div>
                        <div className="mt-1 text-emerald-800">Complaint Count: {activeComplaintLifecycle.complaintCount.toLocaleString()}</div>
                      </div>
                      <span className="rounded-full border border-emerald-300 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
                        {activeComplaintLifecycle.stateLabel || "ACTIVE"}
                      </span>
                    </div>
                  </div>
                ) : null}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <label>
                    <div className="text-[10px] font-semibold text-slate-700 mb-0.5 uppercase tracking-wide">Article No</div>
                    <input value={complaintRecord.shipment.trackingNumber} readOnly className="w-full rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-mono text-slate-800" />
                  </label>
                  <label>
                    <div className="text-[10px] font-semibold text-slate-700 mb-0.5 uppercase tracking-wide">Service Type</div>
                    <input value={detectServiceType(complaintRecord.shipment.trackingNumber)} readOnly className="w-full rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-800" />
                  </label>
                  <label>
                    <div className="text-[10px] font-semibold text-slate-700 mb-0.5 uppercase tracking-wide">Complaint Reason</div>
                    <select value={complaintReason} onChange={(e) => setComplaintReason(e.target.value)} className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 font-medium">
                      <option value="Pending Delivery">Pending Delivery</option>
                      <option value="Return Not Received">Return Not Received</option>
                      <option value="Money Order Not Received">Money Order Not Received</option>
                      <option value="Other">Other</option>
                    </select>
                  </label>
                  <label>
                    <div className="text-[10px] font-semibold text-slate-700 mb-0.5 uppercase tracking-wide">Booking Date</div>
                    <input value={formatLastDate(complaintRecord.shipment)} readOnly className="w-full rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-800" />
                  </label>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <label>
                    <div className="text-[10px] font-semibold text-slate-700 mb-0.5 uppercase tracking-wide">Complainant Name</div>
                    <input ref={complaintFirstInputRef} value={complainantNameInput} onChange={(e) => setComplainantNameInput(e.target.value)} className={`w-full rounded border px-2 py-1 text-xs text-slate-800 ${complaintValidationState.SenderName ? "border-slate-300 bg-white" : "border-red-400 bg-red-50"}`} />
                  </label>
                  <label>
                    <div className="text-[10px] font-semibold text-slate-700 mb-0.5 uppercase tracking-wide">Mobile <span className="text-red-600">*</span></div>
                    <input value={complaintPhone} onChange={(e) => setComplaintPhone(e.target.value)} className={`w-full rounded border px-2 py-1 text-xs text-slate-800 ${complaintValidationState.Mobile ? "border-slate-300 bg-white" : "border-red-400 bg-red-50"}`} placeholder="03XXXXXXXXX" />
                  </label>
                  <label>
                    <div className="text-[10px] font-semibold text-slate-700 mb-0.5 uppercase tracking-wide">Reply Mode</div>
                    <select value={replyMode} onChange={(e) => setReplyMode((e.target.value as "POST" | "EMAIL" | "SMS"))} className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 font-medium">
                      <option value="POST">Post</option>
                      <option value="EMAIL">Email</option>
                      <option value="SMS">SMS</option>
                    </select>
                  </label>
                  <label>
                    <div className="text-[10px] font-semibold text-slate-700 mb-0.5 uppercase tracking-wide">Booking Office</div>
                    <input value={senderCitySearch || getUnifiedFields(complaintRecord.shipment.rawJson).senderCity || "-"} readOnly className="w-full rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700" />
                  </label>
                </div>

                <div className="border-t border-slate-200 pt-2 mt-2">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs font-bold text-slate-800 uppercase tracking-wide">Sender Detail</div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <label>
                      <div className="text-[10px] font-semibold text-slate-700 mb-0.5">Name {!senderNameIsLocked && <span className="text-red-600">*</span>}</div>
                      <input
                        value={senderNameInput}
                        readOnly={senderNameIsLocked}
                        onChange={senderNameIsLocked ? undefined : (e) => setSenderNameInput(e.target.value)}
                        className={`w-full rounded border px-2 py-1 text-xs text-slate-800 ${senderNameIsLocked ? "bg-slate-100 border-slate-200 cursor-not-allowed" : complaintValidationState.SenderName === false ? "border-red-400 bg-red-50" : "border-slate-300 bg-white"}`}
                      />
                    </label>
                    <label>
                      <div className="text-[10px] font-semibold text-slate-700 mb-0.5">Address <span className="text-red-600">*</span></div>
                      <input value={senderAddressInput} onChange={(e) => setSenderAddressInput(e.target.value)} className={`w-full rounded border px-2 py-1 text-xs text-slate-800 ${complaintValidationState.SenderAddress === false ? "border-red-400 bg-red-50" : "border-slate-300 bg-white"}`} placeholder="Required" />
                    </label>
                    <label>
                      <div className="text-[10px] font-semibold text-slate-700 mb-0.5">City <span className="text-red-600">*</span></div>
                      {senderCityIsLocked ? (
                        <input value={senderCityValue} readOnly className="w-full rounded border border-slate-200 bg-slate-100 px-2 py-1 text-xs cursor-not-allowed text-slate-700" />
                      ) : (
                        <>
                          <input value={senderCitySearch} onChange={(e) => setSenderCitySearch(e.target.value)} className={`w-full rounded border px-2 py-1 text-xs text-slate-800 ${complaintValidationState.SenderCity === false ? "border-red-400 bg-red-50" : "border-slate-300 bg-white"}`} placeholder="Search (>=3)" />
                          {senderCitySearch.trim().length >= 3 && senderCitySearchResults.length > 0 ? (
                            <select value={senderCityValue} onChange={(e) => { setSenderCityValue(e.target.value); setSenderCitySearch(e.target.value); }} className="mt-0.5 w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800">
                              <option value="">Select</option>
                              {senderCitySearchResults.map((city) => <option key={`sender-${city}`} value={city}>{city}</option>)}
                            </select>
                          ) : null}
                        </>
                      )}
                    </label>
                  </div>
                </div>

                <div className="border-t border-slate-200 pt-2 mt-2">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs font-bold text-slate-800 uppercase tracking-wide">Addressee Detail</div>
                    {complaintPrefillLoading ? <div className="text-[10px] font-medium text-blue-600 bg-blue-50 rounded px-2 py-0.5">Autofilling from article data...</div> : null}
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    <label>
                      <div className="text-[10px] font-semibold text-slate-700 mb-0.5">Name {!receiverNameIsLocked && <span className="text-red-600">*</span>}</div>
                      <input
                        value={receiverNameInput}
                        readOnly={receiverNameIsLocked}
                        onChange={receiverNameIsLocked ? undefined : (e) => setReceiverNameInput(e.target.value)}
                        className={`w-full rounded border px-2 py-1 text-xs text-slate-800 ${receiverNameIsLocked ? "bg-slate-100 border-slate-200 cursor-not-allowed" : complaintValidationState.ReceiverName === false ? "border-red-400 bg-red-50" : "border-slate-300 bg-white"}`}
                      />
                    </label>
                    <label>
                      <div className="text-[10px] font-semibold text-slate-700 mb-0.5">Address <span className="text-red-600">*</span></div>
                      <input value={receiverAddressInput} onChange={(e) => setReceiverAddressInput(e.target.value)} className={`w-full rounded border px-2 py-1 text-xs text-slate-800 ${complaintValidationState.ReceiverAddress === false ? "border-red-400 bg-red-50" : "border-slate-300 bg-white"}`} placeholder="Required" />
                    </label>
                    <label>
                      <div className="text-[10px] font-semibold text-slate-700 mb-0.5">City <span className="text-red-600">*</span></div>
                      {receiverCityIsLocked ? (
                        <input value={receiverCityValue} readOnly className="w-full rounded border border-slate-200 bg-slate-100 px-2 py-1 text-xs cursor-not-allowed text-slate-700" />
                      ) : (
                        <>
                          <input value={receiverCitySearch} onChange={(e) => setReceiverCitySearch(e.target.value)} className={`w-full rounded border px-2 py-1 text-xs text-slate-800 ${complaintValidationState.ReceiverCity === false ? "border-red-400 bg-red-50" : "border-slate-300 bg-white"}`} placeholder="Search (>=3)" />
                          {receiverCitySearch.trim().length >= 3 && receiverCitySearchResults.length > 0 ? (
                            <select value={receiverCityValue} onChange={(e) => { setReceiverCityValue(e.target.value); setReceiverCitySearch(e.target.value); }} className="mt-0.5 w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800">
                              <option value="">Select</option>
                              {receiverCitySearchResults.map((city) => <option key={`receiver-${city}`} value={city}>{city}</option>)}
                            </select>
                          ) : null}
                        </>
                      )}
                    </label>
                  </div>
                </div>

                <div className="border-t border-slate-200 pt-2 mt-2">
                  <div className="text-xs font-bold text-slate-800 uppercase tracking-wide mb-2">Remarks <span className="text-red-600">*</span></div>
                  <div className="flex gap-1 mb-1">
                    <button type="button" onClick={() => { setComplaintTemplate("VALUE_PAYABLE"); setComplaintText(buildComplaintTemplate(complaintRecord, "VALUE_PAYABLE")); }} className={`rounded px-2 py-0.5 text-[10px] font-medium ${complaintTemplate === "VALUE_PAYABLE" ? "border border-brand/40 bg-brand/15 text-brand" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}>Value Payable</button>
                    <button type="button" onClick={() => { setComplaintTemplate("NORMAL"); setComplaintText(buildComplaintTemplate(complaintRecord, "NORMAL")); }} className={`rounded px-2 py-0.5 text-[10px] font-medium ${complaintTemplate === "NORMAL" ? "border border-brand/40 bg-brand/15 text-brand" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}>Normal</button>
                    <button type="button" onClick={() => { setComplaintTemplate("RETURN"); setComplaintText(buildComplaintTemplate(complaintRecord, "RETURN")); }} className={`rounded px-2 py-0.5 text-[10px] font-medium ${complaintTemplate === "RETURN" ? "border border-brand/40 bg-brand/15 text-brand" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}>Return</button>
                  </div>
                  <textarea rows={5} value={complaintText} onChange={(e) => setComplaintText(e.target.value)} className={`w-full rounded border px-2 py-1 text-xs font-mono text-slate-800 resize-y min-h-[120px] ${complaintValidationState.Remarks ? "border-slate-300 bg-white" : "border-red-400 bg-red-50"}`} placeholder="Required" />
                </div>

                <div className="border-t border-[#E5E7EB] pt-2 mt-2">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs font-semibold text-slate-800">District / Tehsil / Location</div>
                    {complaintSelectionLocked && (
                      <div className="text-[10px] text-slate-400 bg-slate-100 rounded px-2 py-0.5">Delivery office auto-selected from tracking</div>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-2 mb-2 sm:grid-cols-2 lg:grid-cols-3">
                    <select
                      value={selectedDistrict}
                      onChange={(e) => { setSelectedDistrict(e.target.value); setSelectedTehsil(""); setSelectedLocation(""); }}
                      className={`rounded border px-2 py-1 text-xs ${
                        complaintSelectionLocked ? "bg-slate-100 border-[#E5E7EB] text-slate-600 cursor-not-allowed" :
                        complaintValidationState.District === false ? "border-red-300 bg-red-50" : "border-[#E5E7EB] bg-white"
                      }`}
                      disabled={complaintSelectionLocked}
                    >
                      <option value="">District</option>
                      {complaintDistrictOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                    <select
                      value={selectedTehsil}
                      onChange={(e) => { setSelectedTehsil(e.target.value); setSelectedLocation(""); }}
                      className={`rounded border px-2 py-1 text-xs ${
                        complaintSelectionLocked ? "bg-slate-100 border-[#E5E7EB] text-slate-600 cursor-not-allowed" :
                        complaintValidationState.Tehsil === false ? "border-red-300 bg-red-50" : "border-[#E5E7EB] bg-white"
                      }`}
                      disabled={complaintSelectionLocked || !selectedDistrict}
                    >
                      <option value="">Tehsil</option>
                      {complaintTehsilOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                    <select
                      value={selectedLocation}
                      onChange={(e) => setSelectedLocation(e.target.value)}
                      className={`rounded border px-2 py-1 text-xs ${
                        complaintSelectionLocked ? "bg-slate-100 border-[#E5E7EB] text-slate-600 cursor-not-allowed" :
                        complaintValidationState.Location === false ? "border-red-300 bg-red-50" : "border-[#E5E7EB] bg-white"
                      }`}
                      disabled={complaintSelectionLocked || !selectedDistrict || !selectedTehsil}
                    >
                      <option value="">Location</option>
                      {complaintLocationOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                  </div>
                  {complaintSelectionLocked ? (
                    <div className="text-[11px] text-emerald-700 bg-emerald-50 rounded px-2 py-1 mb-2">
                      OK {selectedDistrict} / {selectedTehsil} / {selectedLocation}
                      <button type="button" className="ml-2 text-slate-400 hover:text-slate-700 underline" onClick={() => setComplaintSelectionLocked(false)}>Change</button>
                    </div>
                  ) : (
                    <div className="text-[11px] text-amber-700 bg-amber-50 rounded px-2 py-1 mb-2">Select district -&gt; tehsil -&gt; location to complete the complaint</div>
                  )}
                  <input type="text" value={officeSearchQuery} onChange={(e) => setOfficeSearchQuery(e.target.value)} placeholder="Or search location (>=3 chars)" className="w-full rounded border border-[#E5E7EB] bg-white px-2 py-1 text-xs mb-1" autoComplete="off" />
                  {officeSearchResults.length > 0 && !complaintSelectionLocked ? (
                    <div className="max-h-28 overflow-y-auto rounded border border-[#E5E7EB] bg-white shadow-lg">
                      {officeSearchResults.slice(0, 8).map((res, i) => (
                        <button key={`${res.location}-${i}`} type="button" onMouseDown={(e) => { e.preventDefault(); setSelectedDistrict(res.district); setSelectedTehsil(res.tehsil); setSelectedLocation(res.location); setOfficeSearchQuery(res.location); setOfficeSearchResults([]); setComplaintSelectionLocked(true); }} className="block w-full text-left px-2 py-1.5 text-xs hover:bg-slate-50 border-b border-slate-100 last:border-b-0">
                          <span className="font-semibold text-slate-900">{res.location}</span>
                          <span className="ml-1.5 text-slate-500 text-[10px]">({res.tehsil} · {res.district})</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>

                {replyMode === "EMAIL" ? (
                  <div className="border-t border-[#E5E7EB] pt-2 mt-2">
                    <label className="text-xs font-medium text-slate-700">
                      <div className="text-[10px] font-medium text-slate-600 mb-0.5">Email</div>
                      <input value={complaintEmail} onChange={(e) => setComplaintEmail(e.target.value)} className="w-full rounded border border-[#E5E7EB] bg-white px-2 py-1 text-xs" placeholder="For email reply" />
                    </label>
                  </div>
                ) : null}

                {complaintSubmitResult ? (
                  <div className={cn(
                    "border-t border-slate-200 pt-2 mt-2 rounded-xl border px-3 py-2.5 text-xs",
                    complaintSubmitResult.status === "DUPLICATE"
                      ? "border-amber-300 bg-amber-50 text-amber-900"
                      : complaintSubmitResult.status === "QUEUED"
                        ? "border-blue-300 bg-blue-50 text-blue-900"
                        : "border-emerald-300 bg-emerald-50 text-emerald-900",
                  )}>
                    <div className="font-bold text-sm">
                      {complaintSubmitResult.status === "DUPLICATE"
                        ? "Complaint Already Exists"
                        : complaintSubmitResult.status === "QUEUED"
                          ? "Queued"
                          : "Success"}
                    </div>
                    <div className="mt-1">Complaint ID: <span className="font-semibold">{complaintSubmitResult.complaintNumber || "Pending assignment"}</span></div>
                    <div>Due Date: <span className="font-semibold">{complaintSubmitResult.dueDate || "Pending"}</span></div>
                    <div>Status: <span className="font-semibold">{complaintSubmitResult.status === "DUPLICATE" ? (activeComplaintLifecycle?.stateLabel || "ACTIVE") : complaintSubmitResult.status}</span></div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="sticky bottom-0 border-t border-slate-200 bg-white px-4 py-2 flex flex-col items-stretch justify-between gap-2 sm:flex-row sm:items-center">
              <button
                type="button"
                className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                onClick={closeComplaintModal}
                disabled={submittingComplaint}
              >
                Close
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleComplaintPreview}
                  disabled={submittingComplaint}
                  className="rounded border border-brand/40 bg-brand/10 px-3 py-1.5 text-xs font-medium text-brand hover:bg-brand/20 disabled:opacity-60"
                >
                  Preview
                </button>
                <button
                  type="button"
                  onClick={submitComplaintInstant}
                  disabled={submittingComplaint || !complaintSubmitReady || Boolean(activeComplaintLifecycle && isComplaintInProcess(activeComplaintLifecycle))}
                  title={activeComplaintLifecycle && isComplaintInProcess(activeComplaintLifecycle) ? "Complaint already active or in process" : (complaintPrefillLoading ? "Waiting for addressee autofill" : (complaintSubmitReady ? "Ready to submit" : `Missing: ${complaintSubmitMissingFields.join(", ")}`))}
                  className="rounded border border-emerald-400 bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submittingComplaint ? "Submitting..." : (activeComplaintLifecycle && isComplaintInProcess(activeComplaintLifecycle) ? "Complaint In Process" : (complaintPrefillLoading ? "Autofilling..." : "Submit"))}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {complaintPreviewVisible && complaintRecord ? (
        <div className="modal-wrapper bg-slate-950/50 p-2 z-50">
          <div className="modal-content w-full max-w-3xl max-w-[calc(100vw-1rem)] rounded-2xl bg-white shadow-2xl max-h-[95vh] flex flex-col overflow-hidden">
            <div className="modal-header border-b border-[#E5E7EB] px-4 py-2 flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-900">Preview & Confirm Submission</div>
              <button
                type="button"
                className="rounded border border-[#E5E7EB] px-2 py-1 text-xs text-slate-600 hover:bg-[#F8FAF9]"
                onClick={() => setComplaintPreviewVisible(false)}
              >
                Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              <div className="grid gap-2">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <div className={`rounded border p-2 text-xs ${complaintValidationState.ArticleNo ? "border-[#E5E7EB]" : "border-red-300 bg-red-50"}`}>
                    <div className="text-[10px] font-medium text-slate-500">Article No</div>
                    <div className={`mt-0.5 font-semibold text-sm ${complaintValidationState.ArticleNo ? "text-slate-900" : "text-red-900"}`}>
                      {complaintRecord.shipment.trackingNumber || "MISSING"}
                    </div>
                  </div>
                  <div className={`rounded border p-2 text-xs ${complaintValidationState.SenderName ? "border-[#E5E7EB]" : "border-red-300 bg-red-50"}`}>
                    <div className="text-[10px] font-medium text-slate-500">Service Type</div>
                    <div className={`mt-0.5 font-semibold text-sm ${complaintValidationState.SenderName ? "text-slate-900" : "text-red-900"}`}>
                      {detectServiceType(complaintRecord.shipment.trackingNumber)}
                    </div>
                  </div>
                  <div className={`rounded border p-2 text-xs ${complaintValidationState.Mobile ? "border-[#E5E7EB]" : "border-red-300 bg-red-50"}`}>
                    <div className="text-[10px] font-medium text-slate-500">Mobile</div>
                    <div className={`mt-0.5 font-semibold text-sm ${complaintValidationState.Mobile ? "text-slate-900" : "text-red-900"}`}>
                      {complaintPhone.trim() || "MISSING"}
                    </div>
                  </div>
                  <div className="rounded border border-[#E5E7EB] p-2 text-xs">
                    <div className="text-[10px] font-medium text-slate-500">Reply Mode</div>
                    <div className="mt-0.5 font-semibold text-sm text-slate-900">{replyMode}</div>
                  </div>
                </div>

                <div className={`rounded border p-2 text-xs ${complaintValidationState.SenderName ? "border-[#E5E7EB]" : "border-red-300 bg-red-50"}`}>
                  <div className="text-[10px] font-medium text-slate-500 mb-0.5">Complainant Name</div>
                  <div className={`font-semibold text-sm ${complaintValidationState.SenderName ? "text-slate-900" : "text-red-900"}`}>
                    {senderNameInput.trim() || "MISSING"}
                  </div>
                </div>

                <div className="border-t border-[#E5E7EB] pt-2 mt-2">
                  <div className="text-xs font-semibold text-slate-800 mb-1">Sender Detail</div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    <div className={`rounded border p-2 text-xs ${complaintValidationState.SenderName ? "border-[#E5E7EB]" : "border-red-300 bg-red-50"}`}>
                      <div className="text-[10px] font-medium text-slate-500">Name</div>
                      <div className={`mt-0.5 font-semibold text-sm ${complaintValidationState.SenderName ? "text-slate-900" : "text-red-900"}`}>
                        {senderNameInput.trim() || "MISSING"}
                      </div>
                    </div>
                    <div className={`rounded border p-2 text-xs ${complaintValidationState.SenderCity ? "border-[#E5E7EB]" : "border-red-300 bg-red-50"}`}>
                      <div className="text-[10px] font-medium text-slate-500">Address</div>
                      <div className={`mt-0.5 font-semibold text-sm ${complaintValidationState.SenderAddress ? "text-slate-900" : "text-red-900"}`}>
                        {senderAddressInput.trim() || "MISSING"}
                      </div>
                    </div>
                    <div className="rounded border border-[#E5E7EB] p-2 text-xs">
                      <div className="text-[10px] font-medium text-slate-500">City</div>
                      <div className={`mt-0.5 font-semibold text-sm ${complaintValidationState.SenderCity ? "text-slate-900" : "text-red-900"}`}>
                        {senderCityValue.trim() || "MISSING"}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border-t border-[#E5E7EB] pt-2 mt-2">
                  <div className="text-xs font-semibold text-slate-800 mb-1">Addressee Detail</div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    <div className={`rounded border p-2 text-xs ${complaintValidationState.ReceiverName ? "border-[#E5E7EB]" : "border-red-300 bg-red-50"}`}>
                      <div className="text-[10px] font-medium text-slate-500">Name</div>
                      <div className={`mt-0.5 font-semibold text-sm ${complaintValidationState.ReceiverName ? "text-slate-900" : "text-red-900"}`}>
                        {receiverNameInput.trim() || "MISSING"}
                      </div>
                    </div>
                    <div className={`rounded border p-2 text-xs ${complaintValidationState.ReceiverCity ? "border-[#E5E7EB]" : "border-red-300 bg-red-50"}`}>
                      <div className="text-[10px] font-medium text-slate-500">Address</div>
                      <div className={`mt-0.5 font-semibold text-sm ${complaintValidationState.ReceiverAddress ? "text-slate-900" : "text-red-900"}`}>
                        {receiverAddressInput.trim() || "MISSING"}
                      </div>
                    </div>
                    <div className="rounded border border-[#E5E7EB] p-2 text-xs">
                      <div className="text-[10px] font-medium text-slate-500">City</div>
                      <div className={`mt-0.5 font-semibold text-sm ${complaintValidationState.ReceiverCity ? "text-slate-900" : "text-red-900"}`}>
                        {receiverCityValue.trim() || "MISSING"}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border-t border-[#E5E7EB] pt-2 mt-2">
                  <div className="text-xs font-semibold text-slate-800 mb-1">Remarks <span className="text-red-600">*</span></div>
                  <div className={`rounded border p-2 text-xs ${complaintValidationState.Remarks ? "border-[#E5E7EB] bg-[#F8FAF9]" : "border-red-300 bg-red-50"}`}>
                    <div className="font-mono text-xs whitespace-pre-wrap max-h-12 overflow-hidden">
                      <span className={complaintValidationState.Remarks ? "text-slate-700" : "text-red-900"}>
                        {complaintText.trim() || "MISSING - MANDATORY FOR SUBMISSION"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="border-t border-[#E5E7EB] pt-2 mt-2">
                  <div className="text-xs font-semibold text-slate-800 mb-1">Location (District/Tehsil)</div>
                  <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
                    <div className="rounded border border-[#E5E7EB] p-2">
                      <div className="text-[10px] font-medium text-slate-500 mb-0.5">District</div>
                      <div className="font-semibold text-sm text-slate-900">{selectedDistrict || "Not selected"}</div>
                    </div>
                    <div className="rounded border border-[#E5E7EB] p-2">
                      <div className="text-[10px] font-medium text-slate-500 mb-0.5">Tehsil</div>
                      <div className="font-semibold text-sm text-slate-900">{selectedTehsil || "Not selected"}</div>
                    </div>
                    <div className="rounded border border-[#E5E7EB] p-2">
                      <div className="text-[10px] font-medium text-slate-500 mb-0.5">Location</div>
                      <div className="font-semibold text-sm text-slate-900">{selectedLocation || "Not selected"}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

              <div className="sticky bottom-0 border-t border-slate-200 bg-white px-4 py-2 flex flex-col items-stretch justify-between gap-2 sm:flex-row sm:items-center">
                <button
                  type="button"
                  className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  onClick={() => setComplaintPreviewVisible(false)}
                  disabled={submittingComplaint}
                >
                  Back to Edit
                </button>
                <button
                  type="button"
                  onClick={handleComplaintSubmitFromPreview}
                  disabled={submittingComplaint || Object.values(complaintValidationState).some(v => !v)}
                  className="rounded border border-emerald-400 bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submittingComplaint ? "Submitting..." : "Confirm & Submit"}
                </button>
              </div>
          </div>
        </div>
      ) : null}

      <AnimatePresence>
      {selectedTracking && trackingDetailData ? (
        <>
          {/* Backdrop */}
          <motion.div
            key="detail-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm"
            onClick={() => setSelectedTracking(null)}
          />
          {/* Centered detail modal */}
          <motion.div
            key="detail-panel"
            initial={{ opacity: 0, scale: 0.98, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 12 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4"
          >
          <div id="tracking-popup-print-root" className="flex h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            {/* Panel Header */}
            <div className="modal-header flex items-center justify-between border-b border-[#E5E7EB] bg-white px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand/10">
                  <PackageSearch className="h-4 w-4 text-brand" />
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-900">Shipment Detail</div>
                  <div className="font-mono text-xs text-slate-500">{selectedTracking.shipment.trackingNumber}</div>
                </div>
              </div>
              <div className="no-print flex items-center gap-2">
                <button
                  type="button"
                  onClick={printShipmentPdf}
                  className="inline-flex items-center gap-1 rounded-xl border border-[#E5E7EB] bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-[#F8FAF9] transition-colors"
                >
                  <Printer className="h-3.5 w-3.5" /> Print
                </button>
                <button
                  type="button"
                  onClick={sendToCustomerWhatsapp}
                  className="inline-flex items-center gap-1 rounded-xl border border-[#E5E7EB] bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-[#F8FAF9] transition-colors"
                >
                  WhatsApp
                </button>
                {selectedTracking ? (
                  (() => {
                    const selectedQueue = complaintQueueByTracking.get(selectedTracking.shipment.trackingNumber);
                    const actionLabel = resolveComplaintActionLabel(selectedTrackingStatus, selectedComplaintLifecycle ?? {
                      exists: false,
                      active: false,
                      complaintId: "",
                      dueDateText: "",
                      dueDateTs: null,
                      state: "",
                      stateLabel: "",
                      message: "",
                      complaintCount: 0,
                      latestAttempt: 0,
                      previousComplaintReference: "",
                    }, selectedQueue);
                    const disabled = isComplaintActionLocked(actionLabel);
                    return (
                  <button
                    type="button"
                    onClick={() => openComplaintModal(selectedTracking)}
                    disabled={disabled || !selectedComplaintEnabled}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition-colors",
                      disabled || !selectedComplaintEnabled
                        ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-500"
                        : "border-red-200 bg-red-50 text-red-700 hover:bg-red-100",
                    )}
                  >
                    <MessageSquare className="h-3.5 w-3.5" /> {actionLabel}
                  </button>
                    );
                  })()
                ) : null}
                <button
                  type="button"
                  onClick={() => setSelectedTracking(null)}
                  className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-600 hover:bg-red-50 hover:text-red-600 transition-colors"
                  title="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {/* Status banner */}
              <div className={cn("mb-4 flex items-center justify-between rounded-2xl border px-4 py-3", getStatusDisplayColor(trackingDetailData.presentation.displayStatus))}>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider opacity-70">Current Status</div>
                  <div className="mt-0.5 text-base font-bold text-current">{trackingDetailData.presentation.displayStatus}</div>
                </div>
                <div className={cn("inline-flex rounded-full border px-3 py-1 text-xs font-bold", getStatusDisplayColor(trackingDetailData.presentation.displayStatus))}>
                  {trackingDetailData.presentation.displayStatus}
                </div>
              </div>

              {/* Quick info grid */}
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-[#E5E7EB] bg-slate-50 p-3"><div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Tracking ID</div><div className="mt-1 font-mono text-xs font-bold text-slate-900">{selectedTracking.shipment.trackingNumber}</div></div>
                <div className="rounded-xl border border-[#E5E7EB] bg-slate-50 p-3"><div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Booking Date</div><div className="mt-1 text-xs font-semibold text-slate-900">{trackingDetailData.bookingDate}</div></div>
                <div className="rounded-xl border border-[#E5E7EB] bg-slate-50 p-3"><div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Last Update</div><div className="mt-1 text-xs font-semibold text-slate-900">{trackingDetailData.lastUpdate}</div></div>
                <div className="rounded-xl border border-[#E5E7EB] bg-slate-50 p-3"><div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Latest Event</div><div className="mt-1 text-xs font-semibold text-slate-900">{trackingDetailData.presentation.latestEvent?.description || "-"}</div></div>
                <div className="rounded-xl border border-[#E5E7EB] bg-slate-50 p-3"><div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">MO Value</div><div className="mt-1 text-xs font-semibold text-emerald-700">{trackingDetailData.moValue != null ? `Rs ${trackingDetailData.moValue.toLocaleString()}` : "-"}</div></div>
                {trackingDetailData.presentation.showMoneyOrderPanel ? <div className="rounded-xl border border-[#E5E7EB] bg-slate-50 p-3"><div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Value Payable State</div><div className="mt-1 text-xs font-semibold text-slate-900">{trackingDetailData.presentation.moneyOrderStatusLabel}</div></div> : null}
                <div className="rounded-xl border border-[#E5E7EB] bg-slate-50 p-3"><div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Origin City</div><div className="mt-1 text-xs font-semibold text-slate-900">{trackingDetailData.bookingOffice}</div></div>
                <div className="rounded-xl border border-[#E5E7EB] bg-slate-50 p-3"><div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Delivery City</div><div className="mt-1 text-xs font-semibold text-slate-900">{trackingDetailData.deliveryOffice}</div></div>
                <div className="rounded-xl border border-[#E5E7EB] bg-slate-50 p-3"><div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Complaint Count</div><div className="mt-1 text-xs font-semibold text-slate-900">{selectedComplaintLifecycle?.complaintCount ?? 0}</div></div>
              </div>

              <div className="mt-4 rounded-2xl border border-[#E5E7EB] bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Delivery Progress</div>
                  <div className="text-sm font-semibold text-slate-700">{trackingDetailData.presentation.progress}%</div>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                  <div className="h-full rounded-full bg-[linear-gradient(135deg,#0f172a,#0b6b3a)]" style={{ width: `${trackingDetailData.presentation.progress}%` }} />
                </div>
              </div>

              {/* Consignee */}
              <div className="mt-4 rounded-xl border border-[#E5E7EB] p-3">
                <div className="text-xs font-bold text-slate-700">Consignee</div>
                <div className="mt-2 space-y-1 text-xs text-slate-600">
                  <div><span className="font-semibold text-slate-800">{trackingDetailData.consigneeName || "-"}</span></div>
                  <div>{trackingDetailData.consigneeAddress || "-"}</div>
                  {trackingDetailData.consigneePhone ? <div className="font-mono">{trackingDetailData.consigneePhone}</div> : null}
                </div>
              </div>

              {/* MO Number */}
              {trackingDetailData.moIssued ? (
                <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">Money Order Number</div>
                  <div className="mt-1 font-mono text-xs font-bold text-emerald-900">{trackingDetailData.moIssued}</div>
                </div>
              ) : null}

              {/* Status Timeline */}
              <div className="mt-5">
                <div className="mb-3 flex items-center gap-2">
                  <Activity className="h-4 w-4 text-brand" />
                  <div className="text-sm font-bold text-slate-900">Status Timeline</div>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">{trackingDetailData.timeline.length}</span>
                </div>
                <div className="grid gap-4 lg:grid-cols-[180px_1fr]">
                  <aside className="rounded-2xl border border-[#E5E7EB] bg-slate-50 p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Shipment Stages</div>
                    <ol className="relative mt-3 space-y-2.5">
                      {trackingDetailData.presentation.stageLabels.map((stage, idx) => {
                        const isDone = idx <= trackingDetailData.presentation.activeStage;
                        return (
                          <li key={`${selectedTracking.shipment.trackingNumber}-${stage}`} className="relative pl-6 text-xs font-semibold text-slate-600">
                            {idx < trackingDetailData.presentation.stageLabels.length - 1 ? (
                              <span className={cn("absolute left-[8px] top-4 h-7 w-[2px]", idx < trackingDetailData.presentation.activeStage ? "bg-emerald-400" : "bg-slate-300")} />
                            ) : null}
                            <span className={cn("absolute left-0 top-1.5 h-4 w-4 rounded-full border", isDone ? "border-emerald-500 bg-emerald-500" : "border-slate-300 bg-white")} />
                            <span className={isDone ? "text-slate-800" : "text-slate-500"}>{stage}</span>
                          </li>
                        );
                      })}
                    </ol>
                  </aside>

                  <div className="relative space-y-0">
                    <div className="pointer-events-none absolute bottom-2 left-[7px] top-2 w-[2px] bg-gradient-to-b from-brand/60 to-brand/10" />
                    {trackingDetailData.timeline.length > 0 ? (
                      trackingDetailData.timeline.map((item, idx) => (
                        <div key={`${item.date}-${item.time}-${idx}`} className="relative pl-6 pb-3 last:pb-0">
                          <span className={cn("absolute left-0 top-1.5 h-3.5 w-3.5 rounded-full border-2 border-white shadow", idx === trackingDetailData.timeline.length - 1 ? "bg-brand" : "bg-slate-300")} />
                          <div className="rounded-xl border border-[#E5E7EB] bg-white p-2.5 shadow-sm">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="text-xs font-semibold text-slate-800">{item.description || "Update"}</div>
                              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">{item.stageLabel}</span>
                            </div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                              {item.date ? <span>{item.date}</span> : null}
                              {item.time ? <span>{item.time}</span> : null}
                              {item.location ? <span className="flex items-center gap-0.5"><MapPin className="h-2.5 w-2.5" />{item.location}</span> : null}
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-xl border border-[#E5E7EB] p-3 text-xs text-slate-500">No status history available.</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
          </motion.div>
        </>
      ) : null}
      </AnimatePresence>

      <div id="print-area" aria-hidden="true" />

      {historyModalRecord ? (() => {
        const historyShipment = historyModalRecord.shipment;
        const textBlob = String(historyShipment.complaintText ?? "").trim();
        const historyMarker = "COMPLAINT_HISTORY_JSON:";
        const historyIndex = textBlob.lastIndexOf(historyMarker);
        const historyRaw = historyIndex >= 0 ? textBlob.slice(historyIndex + historyMarker.length).trim() : "";
        const historyEntries: Array<{
          complaintId?: string;
          trackingId?: string;
          createdAt?: string;
          dueDate?: string;
          status?: string;
          attemptNumber?: number;
          previousComplaintReference?: string;
        }> = (() => {
          if (!historyRaw) return [];
          try {
            const parsed = JSON.parse(historyRaw) as { entries?: unknown[] };
            return Array.isArray(parsed?.entries) ? (parsed.entries as typeof historyEntries) : [];
          } catch { return []; }
        })();
        const sortedEntries = normalizeComplaintHistoryEntries(historyEntries);
        return (
          <div className="modal-wrapper z-50 bg-slate-950/60 p-4">
            <div className="modal-content flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" role="dialog" aria-modal="true" aria-label="Complaint History">
              <div className="modal-header flex items-start justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
                <div>
                  <div className="text-lg font-semibold text-slate-900">Complaint History</div>
                  <div className="text-sm text-slate-600">Tracking: <span className="font-semibold text-slate-800">{historyShipment.trackingNumber}</span></div>
                </div>
                <button
                  type="button"
                  className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                  onClick={() => setHistoryModalRecord(null)}
                >
                  Close
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                {sortedEntries.length === 0 ? (
                  <div className="rounded border border-slate-200 p-4 text-center text-sm text-slate-500">
                    No complaint history found for this tracking number.
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {sortedEntries.map((entry, idx) => (
                      <div key={idx} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span className="text-xs font-bold text-slate-700">Attempt #{entry.attemptNumber ?? idx + 1}</span>
                          <span className={cn(
                            "rounded px-2 py-0.5 text-[10px] font-semibold uppercase",
                            entry.status === "ACTIVE" ? "bg-green-100 text-green-800" :
                            entry.status === "ERROR" ? "bg-red-100 text-red-800" :
                            "bg-slate-200 text-slate-700"
                          )}>{entry.status ?? "ACTIVE"}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-slate-500">Complaint ID:</span>
                            <span className="ml-1 font-semibold text-slate-800">{entry.complaintId ? entry.complaintId : "CMP Not Available"}</span>
                          </div>
                          <div>
                            <span className="text-slate-500">Filed Date:</span>
                            <span className="ml-1 font-semibold text-slate-800">
                              {entry.createdAt ? new Date(entry.createdAt).toLocaleDateString("en-GB") : "-"}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-500">Due Date:</span>
                            <span className="ml-1 font-semibold text-slate-800">{entry.dueDate || "-"}</span>
                          </div>
                          <div>
                            <span className="text-slate-500">Previous Ref:</span>
                            <span className="ml-1 font-semibold text-slate-800">{entry.previousComplaintReference || (idx > 0 ? (sortedEntries[idx - 1]?.complaintId || "N/A") : "None")}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="border-t border-slate-200 px-4 py-3 flex justify-end">
                <button
                  type="button"
                  className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  onClick={() => setHistoryModalRecord(null)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })() : null}
    </PageShell>
  );
}







