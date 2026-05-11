import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { UploadCloud, AlertCircle, Eye, MapPin, PackageSearch, BadgeDollarSign, RefreshCw, Printer, Package, CheckCircle2, Clock, TrendingUp, X, MessageSquare, Activity, ChevronRight, Truck, ArrowUpRight, Search } from "lucide-react";
import Card from "../components/Card";
import UnifiedShipmentCards from "../components/UnifiedShipmentCards";
import SampleDownloadLink from "../components/SampleDownloadLink";
import { cn } from "../lib/cn";
import { api, apiHealthCheck, uploadFile } from "../lib/api";
import { useTrackingJobPolling } from "../lib/useTrackingJobPolling";
import { collectComplaintBrowserBootstrap } from "../components/ComplaintModal";
import { getRole } from "../lib/auth";
import type { MeResponse, Shipment as BaseShipment, TrackResult } from "../lib/types";
import {
  buildTrackingWhatsAppShareUrl,
  computeStats,
  filterFinalTrackingData,
  getFinalTrackingData,
  getEventStageLabel,
  getStatusDisplayColor,
  resolveTrackingPresentation,
  SHARED_STAGE_LABELS,
  type FinalTrackingRecord,
  type TrackingPresentationModel,
  type StatusCardFilter,
} from "../lib/trackingData";
import { BodyText, CardTitle, PageShell, PageTitle } from "../components/ui/PageSystem";
import { useShipmentStats } from "../hooks/useShipmentStats";
import { PRINT_MARKETING_LINE } from "../lib/printBranding";

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
  | "COMPLAINT_IN_PROCESS";

const TRACKING_CACHE_TTL_MS = 60_000;
const TRACKING_CACHE_STORAGE_KEY = "tracking.workspace.cache.v2";
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
  VPL: "VPL",
  COD: "COD",
  RL: "RGL",
  PR: "PAR",
};

function formatLastDate(shipment: Shipment): string {
  return String(shipment.latestDate ?? "").trim() || new Date(shipment.updatedAt).toLocaleDateString("en-GB");
}

function detectTemplateType(record: FinalTrackingRecord): ComplaintTemplateKey {
  const tn = String(record.shipment.trackingNumber ?? "").toUpperCase();
  if (record.final_status.includes("RETURN")) return "RETURN";
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
  const latestHistory = parsedHistory.length > 0 ? parsedHistory[parsedHistory.length - 1] : null;
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
    if (["IN PROCESS", "INPROGRESS", "IN_PROGRESS", "PROCESSING", "PENDING", "DUPLICATE"].includes(token)) return "IN PROCESS";
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
    && ["ACTIVE", "IN PROCESS"].includes(normalizedState)
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
    complaintCount: parsedHistory.length > 0 ? parsedHistory.length : (hasComplaint ? 1 : 0),
    latestAttempt: Number(latestHistory?.attemptNumber ?? (hasComplaint ? 1 : 0)) || 0,
    previousComplaintReference: String(latestHistory?.previousComplaintReference ?? "").trim(),
  };
}

function isComplaintInProcess(lifecycle: ComplaintLifecycle): boolean {
  const state = String(lifecycle.state ?? "").trim().toUpperCase();
  return lifecycle.exists && (state === "ACTIVE" || state === "IN PROCESS" || lifecycle.active);
}

function normalizeQueueStatusLabel(raw: string | null | undefined): "QUEUED" | "PROCESSING" | "ACTIVE" | "RETRY PENDING" | "RESOLVED" | "MANUAL REVIEW" | "DUPLICATE" | "SUBMITTED" {
  const token = String(raw ?? "").trim().toUpperCase().replace(/[\-_]+/g, " ");
  if (!token) return "ACTIVE";
  if (token === "RETRYING" || token === "RETRY PENDING") return "RETRY PENDING";
  if (token === "QUEUED") return "QUEUED";
  if (token === "PROCESSING") return "PROCESSING";
  if (token === "MANUAL REVIEW") return "MANUAL REVIEW";
  if (token === "DUPLICATE") return "DUPLICATE";
  if (token === "SUBMITTED") return "SUBMITTED";
  if (token === "RESOLVED" || token === "CLOSED") return "RESOLVED";
  return "ACTIVE";
}

function resolveComplaintCardState(
  lifecycle: ComplaintLifecycle,
  queueSnapshot: ComplaintQueueSnapshot | undefined,
) {
  const queueState = normalizeQueueStatusLabel(queueSnapshot?.complaintStatus);
  const lifecycleResolved = ["RESOLVED", "CLOSED", "REJECTED"].includes(String(lifecycle.state ?? "").toUpperCase());
  const hasComplaintId = Boolean(String(lifecycle.complaintId ?? "").trim() || String(queueSnapshot?.complaintId ?? "").trim());

  if (lifecycleResolved) return "RESOLVED";
  if (hasComplaintId || queueState === "SUBMITTED" || queueState === "DUPLICATE") return "ACTIVE";
  if (queueState === "PROCESSING") return "PROCESSING";
  if (queueState === "QUEUED") return "QUEUED";
  if (queueState === "RETRY PENDING") return "RETRY PENDING";
  if (queueState === "MANUAL REVIEW") return "MANUAL REVIEW";
  if (lifecycle.exists) return lifecycle.stateLabel || "ACTIVE";
  return "";
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
  const complaintCardState = resolveComplaintCardState(lifecycle, queueSnapshot).toUpperCase();
  const hasKnownComplaint = lifecycle.exists || Boolean(queueSnapshot)
    || Boolean(String(lifecycle.complaintId ?? "").trim() || String(queueSnapshot?.complaintId ?? "").trim())
    || ["ACTIVE", "QUEUED", "PROCESSING", "RETRY PENDING", "MANUAL REVIEW", "SUBMITTED", "DUPLICATE", "RESOLVED"].includes(complaintCardState);
  if (reopenEligible) return true;
  return statusUpper === "PENDING" && !hasKnownComplaint;
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

  const dueExpired = lifecycle.dueDateTs != null && lifecycle.dueDateTs < todayStart.getTime();
  const terminal = ["RESOLVED", "CLOSED", "REJECTED"].includes(lifecycleStateUp) || dueExpired;
  if (statusUpper === "PENDING" && terminal) return "Reopen Complaint";

  // Reopened (attempt > 1) should still appear as in process until terminal.
  const reopenedInProgress = lifecycle.latestAttempt > 1 && !terminal;
  if (reopenedInProgress || isComplaintInProcess(lifecycle)) return "In Process";

  return "In Process";
}

function complaintStateBadgeClass(stateLabel: string) {
  const token = String(stateLabel ?? "").trim().toUpperCase();
  if (token === "QUEUED") return "border-slate-200 bg-slate-50 text-slate-700";
  if (token === "PROCESSING" || token === "IN PROCESS") return "border-blue-200 bg-blue-50 text-blue-800";
  if (token === "RETRY PENDING") return "border-amber-200 bg-amber-50 text-amber-800";
  if (token === "RESOLVED" || token === "CLOSED") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (token === "MANUAL REVIEW") return "border-red-200 bg-red-50 text-red-800";
  return "border-violet-200 bg-violet-50 text-violet-800";
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
  const normalized = normalizeStatus(status);
  if (normalized.includes("MOS")) return "bg-fuchsia-100 text-fuchsia-700 ring-fuchsia-200";
  if (normalized === "DELIVERED") return "bg-emerald-100 text-emerald-700 ring-emerald-200";
  if (normalized === "DELIVERED WITH PAYMENT") return "bg-emerald-100 text-emerald-700 ring-emerald-200";
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

function parseTimelineTimestamp(dateRaw: string, timeRaw: string) {
  const date = String(dateRaw ?? "").trim();
  const time = String(timeRaw ?? "").trim() || "00:00";
  const parsed = new Date(`${date} ${time}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
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
          <td>${escapePrintHtml(record.final_status)}</td>
        </tr>`;

  return `
    <section class="print-doc print-container">
      <div class="print-branding print-branding-top"><strong>${escapePrintHtml(PRINT_MARKETING_LINE)}</strong></div>
      <div class="print-panel no-break">
        <div class="print-title">Epost.pk Tracking Print</div>
        <div class="print-subtitle">${escapePrintHtml(record.shipment.trackingNumber)}</div>
        <div class="print-meta-grid">
          <div class="print-meta-card"><div class="print-meta-label">Tracking</div><div class="print-meta-value">${escapePrintHtml(record.shipment.trackingNumber)}</div></div>
          <div class="print-meta-card"><div class="print-meta-label">Status</div><div class="print-meta-value">${escapePrintHtml(record.final_status)}</div></div>
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
  return TRACKING_SERVICE_TYPE_MAP[prefix3] ?? TRACKING_SERVICE_TYPE_MAP[prefix2] ?? "VPL";
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

export default function BulkTracking() {
  const { me } = useOutletContext<ShellCtx>();
  const [searchParams] = useSearchParams();
  const isAdmin = getRole() === "ADMIN";
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<TrackResult[] | null>(null);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [uiState, setUiState] = useState<"idle" | "uploading" | "processing" | "completed" | "failed">("idle");
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [estimatedTotalSec, setEstimatedTotalSec] = useState<number | null>(null);
  const [showRechargeAlert, setShowRechargeAlert] = useState(false);
  const [serviceFailureCount, setServiceFailureCount] = useState(0);
  const [jobStartTime, setJobStartTime] = useState<number | null>(null);
  const [recordCount, setRecordCount] = useState(0);
  const [refreshSummary, setRefreshSummary] = useState<string | null>(null);
  const [refreshingPending, setRefreshingPending] = useState(false);
  const [selectedTracking, setSelectedTracking] = useState<FinalTrackingRecord | null>(null);
  const { shipmentStats, refreshShipmentStats } = useShipmentStats();
  const [pageSize, setPageSize] = useState<20 | 50 | 100>(20);
  const [statusFilter, setStatusFilter] = useState<ExtendedStatusFilter>("ALL");
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [totalShipments, setTotalShipments] = useState(0);
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
  const [complaintQueueByTracking, setComplaintQueueByTracking] = useState<Map<string, ComplaintQueueSnapshot>>(new Map());
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
  const shipmentsRefreshInFlightRef = useRef(false);
  const shipmentsRefreshPendingRef = useRef(false);
  const submitTrackingRef = useRef(false);
  const complaintPrefillRequestRef = useRef(0);
  const complaintModalRef = useRef<HTMLDivElement | null>(null);
  const complaintFirstInputRef = useRef<HTMLInputElement | null>(null);

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
    }
  }, [polling.jobStatus]);

  useEffect(() => {
    const saved = window.localStorage.getItem(COMPLAINT_PHONE_STORAGE_KEY);
    if (saved && !complaintPhone) {
      setComplaintPhone(saved);
    }
    const savedEmail = window.localStorage.getItem(COMPLAINT_EMAIL_STORAGE_KEY);
    if (savedEmail && !complaintEmail) {
      setComplaintEmail(savedEmail);
    }
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(TRACKING_CACHE_STORAGE_KEY);
      if (!raw) {
        void refreshShipments();
        return;
      }
      const parsed = JSON.parse(raw) as { shipments?: Shipment[]; total?: number; fetchedAt?: number };
      const cachedShipments = Array.isArray(parsed?.shipments) ? parsed.shipments : [];
      const cachedTotal = Number(parsed?.total ?? cachedShipments.length);
      const fetchedAt = Number(parsed?.fetchedAt ?? 0);
      if (cachedShipments.length > 0 && Number.isFinite(fetchedAt) && fetchedAt > 0) {
        trackingCacheRef.current = {
          shipments: cachedShipments,
          total: Number.isFinite(cachedTotal) ? cachedTotal : cachedShipments.length,
          fetchedAt,
        };
        applyShipmentsSnapshot(cachedShipments, cachedTotal);
      }
    } catch {
      // Ignore malformed cache and continue with live refresh.
    }
    void refreshShipments();
  }, []);

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
      const cardState = resolveComplaintCardState(lifecycle, queueSnapshot).toUpperCase();
      const hasComplaintId = Boolean(String(lifecycle.complaintId ?? "").trim() || String(queueSnapshot.complaintId ?? "").trim());
      const resolved = hasComplaintId || ["ACTIVE", "RESOLVED", "CLOSED", "REJECTED"].includes(cardState);
      if (!resolved && ["QUEUED", "PROCESSING", "RETRY PENDING"].includes(cardState)) {
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

  async function refreshComplaintQueueSnapshot() {
    if (!isAdmin) {
      setComplaintQueueByTracking(new Map());
      return;
    }
    try {
      const data = await api<{ queue: ComplaintQueueSnapshot[] }>("/api/admin/complaints/monitor");
      const map = new Map<string, ComplaintQueueSnapshot>();
      for (const row of data.queue ?? []) {
        const trackingId = String(row.trackingId ?? "").trim();
        if (!trackingId || map.has(trackingId)) continue;
        map.set(trackingId, row);
      }
      setComplaintQueueByTracking(map);
    } catch {
      // Monitor snapshots should not block tracking workspace operations.
    }
  }

  function applyShipmentsSnapshot(allRows: Shipment[], total: number) {
    setShipments(allRows);
    setTotalShipments(total || allRows.length);
    enqueueBackgroundRefresh(allRows);
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

  function persistShipmentsCache(allRows: Shipment[], total: number, fetchedAt: number) {
    try {
      window.localStorage.setItem(
        TRACKING_CACHE_STORAGE_KEY,
        JSON.stringify({ shipments: allRows, total: total || allRows.length, fetchedAt }),
      );
    } catch {
      // Storage quota issues should never break rendering.
    }
  }

  async function fetchShipmentsFromServer() {
    const hardLimit = 200;
    let currentPage = 1;
    let total = 0;
    const allRows: Shipment[] = [];

    while (currentPage <= 50) {
      const data = await api<{ shipments: Shipment[]; total: number; page: number; limit: number }>(`/api/shipments?page=${currentPage}&limit=${hardLimit}`);
      if (currentPage === 1) {
        total = Math.max(0, Number(data.total ?? 0));
      }
      const rows = Array.isArray(data.shipments) ? data.shipments : [];
      allRows.push(...rows);
      if (rows.length < hardLimit) break;
      if (total > 0 && allRows.length >= total) break;
      currentPage += 1;
    }

    return { allRows, total };
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

    return next;
  }

  async function revalidateShipmentsInBackground() {
    if (shipmentsRefreshInFlightRef.current) {
      shipmentsRefreshPendingRef.current = true;
      return;
    }

    shipmentsRefreshInFlightRef.current = true;
    try {
      const cachedRows = trackingCacheRef.current?.shipments ?? [];
      const hasCachedRows = cachedRows.length > 0;
      let nextRows: Shipment[];
      let nextTotal: number;

      if (hasCachedRows) {
        try {
          const diff = await fetchShipmentsDiff(cachedRows);
          nextRows = applyChangedRows(cachedRows, Array.isArray(diff.changedRows) ? diff.changedRows : []);
          nextTotal = trackingCacheRef.current?.total || nextRows.length;
        } catch {
          const full = await fetchShipmentsFromServer();
          nextRows = full.allRows;
          nextTotal = full.total || full.allRows.length;
        }
      } else {
        const full = await fetchShipmentsFromServer();
        nextRows = full.allRows;
        nextTotal = full.total || full.allRows.length;
      }

      const fetchedAt = Date.now();
      trackingCacheRef.current = { shipments: nextRows, total: nextTotal, fetchedAt };
      persistShipmentsCache(nextRows, nextTotal, fetchedAt);

      console.log(`[TRACE] stage=FRONTEND_RECEIVED_DATA shipments=${nextRows.length}`);
      for (const row of getFinalTrackingData(nextRows)) {
        console.log(`FRONTEND_DISPLAY_STATUS = "${row.final_status}" tn=${row.shipment.trackingNumber}`);
      }

      applyShipmentsSnapshot(nextRows, nextTotal);
      void refreshShipmentStats();
      void refreshComplaintQueueSnapshot();
    } finally {
      shipmentsRefreshInFlightRef.current = false;
      if (shipmentsRefreshPendingRef.current) {
        shipmentsRefreshPendingRef.current = false;
        void revalidateShipmentsInBackground();
      }
    }
  }

  async function refreshShipments() {
    const cached = trackingCacheRef.current;
    const cacheFresh = Boolean(cached && Date.now() - cached.fetchedAt < TRACKING_CACHE_TTL_MS);

    if (cacheFresh && cached) {
      applyShipmentsSnapshot(cached.shipments, cached.total);
      void refreshShipmentStats();
      void refreshComplaintQueueSnapshot();
      void revalidateShipmentsInBackground();
      return;
    }

    await revalidateShipmentsInBackground();
  }

  async function refreshAllPending() {
    if (shipments.length === 0) return;
    setRefreshingPending(true);
    try {
      // Get the final tracking data to identify pending shipments
      const finalData = getFinalTrackingData(shipments);
      const pendingShipments = finalData
        .filter(record => record.final_status.includes("PENDING"))
        .map(record => record.shipment);
      if (pendingShipments.length === 0) return;
      enqueueBackgroundRefresh(pendingShipments);
      await runBackgroundRefreshQueue();
    } finally {
      setRefreshingPending(false);
    }
  }

  function draftFor(row: CycleAuditRecord): CycleAuditDraft {
    return auditDrafts[row.tracking_number] ?? {
      expected_status: (row.expected_status === "DELIVERED WITH PAYMENT" ? "DELIVERED WITH PAYMENT" : row.expected_status === "RETURNED" ? "RETURNED" : row.expected_status === "DELIVERED" ? "DELIVERED" : "PENDING"),
      cycle_detected: (row.cycle_detected === "Cycle 1" || row.cycle_detected === "Cycle 2" || row.cycle_detected === "Cycle 3" ? row.cycle_detected : "Cycle Unknown"),
      missing_steps: row.missing_detection.join("; "),
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
          persistShipmentsCache(allRows, total, fetchedAt);
          applyShipmentsSnapshot(allRows, total);
          await refreshShipmentStats();
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
    // Optimistic update
    setShipments((prev) => prev.map((item) => (
      item.trackingNumber === trackingNumber
        ? { ...item, status, rawJson: applyLocalStatusOverride(item.rawJson, status) }
        : item
    )));
    try {
      if (target) {
        await api(`/api/shipments/${target.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      }
      await refreshShipments();
    } catch (e) {
      console.error(e);
      await refreshShipments();
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
    setResults(liveResults);
    if (uiState !== "processing") return;

    const total = Math.max(recordCount, liveResults.length, 1);
    const processed = liveResults.filter((item) => String(item.status ?? "").toUpperCase() !== "QUEUED").length;
    const pct = Math.max(0, Math.min(99, Math.round((processed / total) * 100)));
    setProgress(pct);
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
    setFile(accepted[0] ?? null);
    setError(null);
    setShowRechargeAlert(false);
    setShowServiceAlert(false);
    setResults(null);
    setUiState("idle");
    setProgress(0);
    setElapsed(0);
    setEstimatedTotalSec(null);
    setJobStartTime(null);
    setRecordCount(0);
    polling.reset();
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

  const finalTrackingData = useMemo(() => getFinalTrackingData(shipments), [shipments]);
  const summaryStats = useMemo(() => computeStats(finalTrackingData), [finalTrackingData]);
  const complaintTotals = useMemo(() => {
    let total = 0;
    let active = 0;
    let closed = 0;
    for (const record of finalTrackingData) {
      const lifecycle = parseComplaintLifecycle(record.shipment);
      if (!lifecycle.exists) continue;
      total += 1;
      if (["ACTIVE", "IN PROCESS"].includes(lifecycle.state)) {
        active += 1;
      } else if (["RESOLVED", "CLOSED", "REJECTED"].includes(lifecycle.state)) {
        closed += 1;
      }
    }
    return { total, active, closed };
  }, [finalTrackingData]);

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

  const filteredShipments = useMemo(() => {
    const baseFilter: StatusCardFilter =
      statusFilter === "COMPLAINT_WATCH"
      || statusFilter === "COMPLAINT_TOTAL"
      || statusFilter === "COMPLAINT_ACTIVE"
      || statusFilter === "COMPLAINT_CLOSED"
      || statusFilter === "COMPLAINT_REOPENED"
      || statusFilter === "COMPLAINT_IN_PROCESS"
      ? "ALL"
      : statusFilter;
    const filtered = filterFinalTrackingData(finalTrackingData, baseFilter);

    if (statusFilter === "COMPLAINT_TOTAL") {
      return filtered.filter((record) => parseComplaintLifecycle(record.shipment).exists);
    }

    if (statusFilter === "COMPLAINT_ACTIVE") {
      return filtered.filter((record) => {
        const lifecycle = parseComplaintLifecycle(record.shipment);
        return lifecycle.exists && ["ACTIVE", "IN PROCESS"].includes(lifecycle.state);
      });
    }

    if (statusFilter === "COMPLAINT_CLOSED") {
      const complaintClosedRows = filtered.filter((record) => {
        const lifecycle = parseComplaintLifecycle(record.shipment);
        return lifecycle.exists && ["RESOLVED", "CLOSED", "REJECTED"].includes(lifecycle.state);
      });
      if (!searchTerm.trim()) return complaintClosedRows;
      const q = searchTerm.trim().toUpperCase();
      return complaintClosedRows.filter((record) => {
        const shipment = record.shipment;
        const lifecycle = parseComplaintLifecycle(shipment);
        const city = preferredCity(shipment);
        const status = normalizeStatus(record.final_status);
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
      return filtered.filter((record) => {
        const lifecycle = parseComplaintLifecycle(record.shipment);
        return record.final_status.includes("PENDING") && isComplaintInProcess(lifecycle);
      });
    }

    if (statusFilter === "COMPLAINT_REOPENED") {
      return filtered.filter((record) => parseComplaintLifecycle(record.shipment).latestAttempt > 1);
    }

    if (statusFilter === "COMPLAINT_IN_PROCESS") {
      return filtered.filter((record) => {
        const lifecycle = parseComplaintLifecycle(record.shipment);
        return lifecycle.exists && lifecycle.state === "IN PROCESS";
      });
    }

    if (!searchTerm.trim()) return filtered;
    const q = searchTerm.trim().toUpperCase();
    return filtered.filter((record) => {
      const shipment = record.shipment;
      const lifecycle = parseComplaintLifecycle(shipment);
      const city = preferredCity(shipment);
      const status = normalizeStatus(record.final_status);
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
  }, [finalTrackingData, statusFilter, searchTerm]);

  const applyTrackingSearch = useCallback(() => {
    setSearchTerm(searchInput.trim());
    setPage(1);
  }, [searchInput]);

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

    const rows = filteredShipments.map((record) => {
      const shipment = record.shipment;
      const lifecycle = parseComplaintLifecycle(shipment);
      const moNumber = extractMoReference(shipment.rawJson, shipment.moIssued ?? null, shipment.moneyOrderIssued);
      const moAmount = extractMoValue(shipment.rawJson, shipment.moValue ?? null);
      return [
        shipment.trackingNumber,
        new Date(shipment.updatedAt).toISOString(),
        normalizeStatus(record.final_status),
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
  }, [filteredShipments]);

  const totalFilteredShipments = filteredShipments.length;
  const totalPages = Math.max(1, Math.ceil(totalFilteredShipments / pageSize));

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const paginatedShipments = useMemo(() => {
    const start = (page - 1) * pageSize;
    const end = page * pageSize;
    const pageRows = filteredShipments.slice(start, end);
    return pageRows;
  }, [filteredShipments, page, pageSize, statusFilter]);

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
    if (complaintSelectionLocked) {
      setOfficeSearchLoading(false);
      setOfficeSearchResults([]);
      return;
    }
    if (officeSearchQuery.trim().length < 3) {
      setOfficeSearchLoading(false);
      setOfficeSearchResults([]);
      return;
    }
    setOfficeSearchLoading(true);
    const timer = window.setTimeout(() => {
      setOfficeSearchResults(searchOfficeRows(officeSearchQuery, complaintRows));
      setOfficeSearchLoading(false);
    }, 140);
    return () => window.clearTimeout(timer);
  }, [officeSearchQuery, complaintRows, complaintSelectionLocked]);

  const trackingDetailData = useMemo(() => {
    if (!selectedTracking) return null;
    const detailShipment = selectedTracking.shipment;
    const raw = parseRaw(detailShipment.rawJson);
    const fields = getUnifiedFields(detailShipment.rawJson);
    const consignee = getRecordConsignee(detailShipment);
    const timeline = extractTimeline(detailShipment.rawJson);
    const trackingLifecycle = detailShipment.trackingLifecycle ?? ((raw?.tracking_lifecycle as any) ?? null);
    const rawDeliveryProgress = Number((raw?.tracking as any)?.delivery_progress ?? raw?.delivery_progress ?? trackingLifecycle?.progress);
    const deliveryProgress = Number.isFinite(rawDeliveryProgress) ? rawDeliveryProgress : undefined;
    const presentation = resolveTrackingPresentation(selectedTracking.final_status, timeline, deliveryProgress, trackingLifecycle);
    const bookingDate = timeline[0]?.date || "-";
    const lastEvent = timeline[timeline.length - 1] ?? null;
    const lastUpdate = lastEvent ? `${lastEvent.date} ${lastEvent.time}`.trim() : `${detailShipment.latestDate ?? ""} ${detailShipment.latestTime ?? ""}`.trim() || "-";
    const moIssued = extractMoReference(detailShipment.rawJson, detailShipment.moIssued ?? null, detailShipment.moneyOrderIssued);
    const moValue = extractMoValue(detailShipment.rawJson, detailShipment.moValue ?? null);
    const bookingOffice = String((raw?.tracking as any)?.booking_office ?? raw?.Booking_Office ?? raw?.booking_office ?? raw?.bookingOffice ?? fields.senderCity ?? "").trim() || "-";
    const deliveryOffice = String(raw?.resolved_delivery_office ?? (raw?.tracking as any)?.delivery_office ?? raw?.Delivery_Office ?? raw?.delivery_office ?? raw?.deliveryOffice ?? fields.consigneeCity ?? "").trim() || "-";
    return {
      fields,
      timeline,
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
  }, [selectedTracking]);

  const selectedComplaintLifecycle = selectedTracking ? parseComplaintLifecycle(selectedTracking.shipment) : null;
  const selectedComplaintQueueSnapshot = selectedTracking ? complaintQueueByTracking.get(selectedTracking.shipment.trackingNumber) : undefined;
  const selectedComplaintEnabled = selectedTracking && selectedComplaintLifecycle
    ? isComplaintActionAllowed(selectedTracking.final_status, selectedComplaintLifecycle, selectedComplaintQueueSnapshot)
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
    const manualSaved = window.localStorage.getItem(COMPLAINT_PHONE_STORAGE_KEY) ?? "";
    const senderEmail = String(
      (raw as any)?.sender_email ??
      (raw as any)?.shipperEmail ??
      (raw as any)?.email ??
      "",
    ).trim();
    const savedEmail = window.localStorage.getItem(COMPLAINT_EMAIL_STORAGE_KEY) ?? "";
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
    if (!clean(senderNameInput)) missing.push("sender_name");
    if (!clean(senderAddressInput)) missing.push("sender_address");
    if (!clean(receiverNameInput)) missing.push("receiver_name");
    if (!clean(receiverAddressInput)) missing.push("receiver_address");
    if (!clean(receiverCityValue) && !clean(receiverCitySearch)) missing.push("receiver_city");
    if (!clean(selectedDistrict)) missing.push("district");
    if (!clean(selectedTehsil)) missing.push("tehsil");
    if (!clean(selectedLocation)) missing.push("location");
    if (!clean(complaintText)) missing.push("remarks");
    return missing;
  })();
  const complaintSubmitReady = !complaintPrefillLoading && complaintSubmitMissingFields.length === 0;
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
    const finalStatus = normalizeStatus(complaintRecord.final_status).toUpperCase();
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
      window.localStorage.setItem(COMPLAINT_PHONE_STORAGE_KEY, normalizedPhone);
      if (complaintEmail.trim()) {
        window.localStorage.setItem(COMPLAINT_EMAIL_STORAGE_KEY, complaintEmail.trim());
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
            : `Complaint already exists for ${trackingId}.`,
        });
        closeComplaintModal();
      } else if (finalUiStatus === "QUEUED") {
        queueOptimisticComplaintState({ trackingId, status: "queued" });
        setComplaintToast({
          kind: "info",
          message: `Complaint queued successfully for ${trackingId}.`,
        });
        closeComplaintModal();
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
            : `Complaint queued successfully for ${trackingId}.`,
        });
        closeComplaintModal();
      } else {
        setComplaintSubmitNotice({
          kind: "error",
          message: hasRefund
            ? "Request failed. Units will be refunded after admin approval."
            : friendlyComplaintMessage(res.message),
        });
      }
      void refreshComplaintQueueSnapshot();
      void refreshShipments();
    } catch (e) {
      setComplaintSubmitNotice({
        kind: "error",
        message: friendlyComplaintMessage(e instanceof Error ? e.message : "Complaint submission failed"),
      });
    } finally {
      setSubmittingComplaint(false);
    }
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
      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      <Card className="w-full min-w-0 overflow-hidden border border-[#E5E7EB] bg-[linear-gradient(135deg,#ffffff_0%,#f8fbff_56%,#eefbf3_100%)] p-4 shadow-[0_12px_30px_rgba(15,23,42,0.08)] md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
              <Activity className="h-3 w-3" />
              Tracking Workspace
            </div>
              <div className="mt-2 text-[28px] font-bold uppercase text-slate-900">SHIPMENT STATUS</div>
            <div className="mt-1 text-sm leading-relaxed text-slate-600">Real-time visibility into every shipment.</div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <div className="min-w-[130px] rounded-2xl border border-[#E5E7EB] bg-white p-3">
              <div className="text-xs font-medium text-slate-500">Current File</div>
              <div className="mt-1 truncate text-sm font-semibold text-slate-900">{file?.name ?? "No file selected"}</div>
            </div>
            <div className="min-w-[110px] rounded-2xl border border-[#E5E7EB] bg-white p-3">
              <div className="text-xs font-medium text-slate-500">Job State</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">{statusLabel}</div>
            </div>
            <div className="hidden h-14 w-24 rounded-2xl border border-[#E5E7EB] bg-[radial-gradient(circle_at_20%_30%,rgba(16,185,129,0.25),transparent_55%),radial-gradient(circle_at_80%_65%,rgba(59,130,246,0.2),transparent_60%)] sm:block" />
          </div>
        </div>
      </Card>
      </motion.div>

      <UnifiedShipmentCards
        items={[
          {
            key: "ALL",
            label: "Total",
            parcels: shipmentStats?.total ?? 0,
            amount: shipmentStats?.totalAmount ?? 0,
            active: statusFilter === "ALL",
          },
          {
            key: "DELIVERED",
            label: "Delivered",
            parcels: shipmentStats?.delivered ?? 0,
            amount: shipmentStats?.deliveredAmount ?? 0,
            active: statusFilter === "DELIVERED",
          },
          {
            key: "PENDING",
            label: "Pending",
            parcels: shipmentStats?.pending ?? 0,
            amount: shipmentStats?.pendingAmount ?? 0,
            active: statusFilter === "PENDING",
          },
          {
            key: "RETURNED",
            label: "Returned",
            parcels: shipmentStats?.returned ?? 0,
            amount: shipmentStats?.returnedAmount ?? 0,
            active: statusFilter === "RETURNED",
          },
          {
            key: "COMPLAINTS",
            label: "Complaints",
            parcels: shipmentStats?.complaints ?? 0,
            amount: shipmentStats?.complaintAmount ?? 0,
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

      {uiState === "processing" && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-brand px-6 py-3 text-white shadow-lg transition-all duration-300">
          <div className="flex w-full max-w-none items-center justify-between">
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
        </div>
      )}

      <Card className="w-full min-w-0">
        <div id="tracking-workspace-section" />
        <div className="border-b px-4 py-3 md:px-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-xl">Bulk Tracking</CardTitle>
              <div className="mt-1 text-sm font-normal text-slate-500">Upload CSV/XLS/XLSX using the strict shared sample structure.</div>
            </div>
            <SampleDownloadLink />
          </div>
        </div>

        <div className="grid gap-2 p-3">
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
              <div className="mt-4 text-base font-medium text-[#0F172A]">Drag & drop Excel/CSV</div>
              <div className="mt-1 text-sm text-gray-600">
                or{" "}
                <button type="button" className="font-medium text-brand hover:text-brand" onClick={open}>
                  click to upload
                </button>
              </div>

              <div className="mt-4 w-full text-xs text-gray-600">
                <div className="flex items-center justify-between">
                  <span>{file ? file.name : "No file selected"}</span>
                  <span className="font-medium text-[#0F172A]">{statusLabel}</span>
                </div>
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
            <button
              className="btn-secondary text-sm"
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
            </button>
            <button
              className="btn-primary text-sm disabled:opacity-50"
              disabled={!file || polling.jobStatus === "PROCESSING" || polling.jobStatus === "QUEUED" || uiState === "uploading"}
              onClick={async () => {
                if (!file) return;
                if (submitTrackingRef.current) return;
                submitTrackingRef.current = true;
                setError(null);
                setShowRechargeAlert(false);
                setShowServiceAlert(false);
                setResults(null);
                try {
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
              Start Tracking
            </button>
          </div>
        </div>
      </Card>

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
        <div className="border-b border-[#E5E7EB] bg-white/90 px-4 py-3 backdrop-blur-md md:px-4 md:py-4">
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
                className="w-full rounded-xl border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-medium text-[#111827] outline-none focus:border-brand sm:min-w-[280px]"
              />
              <button
                type="button"
                onClick={applyTrackingSearch}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-brand-dark transition-colors"
              >
                <Search className="h-3.5 w-3.5" />
                Search
              </button>
            </div>
            <label className="inline-flex items-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm">
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
            <label className="inline-flex items-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-medium text-[#6B7280] shadow-sm">
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
                <option value="COMPLAINT_CLOSED">Complaint Closed</option>
                <option value="COMPLAINT_REOPENED">Complaint Reopened</option>
                <option value="COMPLAINT_IN_PROCESS">Complaint In Process</option>
              </select>
            </label>
            {selectedIds.length > 0 && (
              <button
                onClick={deleteSelected}
                className="inline-flex items-center gap-1 rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 shadow-sm hover:bg-red-100 transition-colors"
              >
                <X className="h-3 w-3" />
                Delete {selectedIds.length}
              </button>
            )}
            <button
              onClick={refreshAllPending}
              disabled={refreshingPending}
              className="inline-flex items-center gap-1.5 rounded-xl border border-brand/30 bg-brand/10 px-3 py-1.5 text-xs font-semibold text-brand shadow-sm hover:bg-brand/20 transition-colors disabled:opacity-60"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", refreshingPending && "animate-spin")} />
              Refresh Pending
            </button>
            <button
              onClick={refreshShipments}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-semibold text-[#111827] shadow-sm hover:bg-[#F8FAF9] transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
            <button
              type="button"
              onClick={exportFilteredTrackingCsv}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-semibold text-[#111827] shadow-sm hover:bg-[#F8FAF9] transition-colors"
            >
              Export
            </button>
          </div>
        </div>
        {refreshSummary ? <div className="border-t border-[#E5E7EB] bg-[#F8FAF9] px-4 py-2 text-xs text-[#6B7280]">{refreshSummary}</div> : null}
        </div>
        <div className="p-0">
          <div className="flex items-center justify-between border-y border-[#E5E7EB] bg-[#F8FAFC] px-4 py-2 text-xs text-slate-600">
            <div className="text-slate-500">
              Page <span className="font-semibold text-slate-700">{page}</span> of <span className="font-semibold text-slate-700">{totalPages}</span> &nbsp;·&nbsp; <span className="font-semibold text-slate-700">{paginatedShipments.length}</span> of <span className="font-semibold text-slate-700">{totalFilteredShipments}</span> filtered
            </div>
            <div className="flex items-center gap-1.5">
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
          <div className="w-full max-h-[72vh] overflow-y-auto overflow-x-auto md:overflow-x-hidden rounded-[20px] border border-[#E5E7EB] bg-white">
            <table className="w-full table-fixed text-[12px] leading-4">
              <thead className="sticky top-0 z-10 border-b border-[#E5E7EB] bg-[#F8FAFC]">
              <tr>
                <th className="w-9 border-r border-[#E5E7EB] px-3 py-3.5">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand"
                    checked={paginatedShipments.length > 0 && paginatedShipments.every((s) => selectedIds.includes(s.shipment.id))}
                    onChange={(e) =>
                      setSelectedIds((prev) => {
                        const pageIds = paginatedShipments.map((s) => s.shipment.id);
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
                <th className="w-20 border-r border-[#E5E7EB] px-3 py-3.5 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-[#6B7280]">
                  Updated
                </th>
                <th className="w-32 border-r border-[#E5E7EB] px-3 py-3.5 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-[#6B7280]">
                  <span className="inline-flex items-center gap-1"><PackageSearch className="h-3 w-3" /> Tracking</span>
                </th>
                <th className="w-20 border-r border-[#E5E7EB] px-3 py-3.5 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-[#6B7280]">
                  Status
                </th>
                <th className="w-28 border-r border-[#E5E7EB] px-3 py-3.5 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-[#6B7280]">
                  <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> City</span>
                </th>
                <th className="w-28 border-r border-[#E5E7EB] px-3 py-3.5 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-[#6B7280]">
                  <span className="inline-flex items-center gap-1"><BadgeDollarSign className="h-3 w-3" /> Money Order No</span>
                </th>
                <th className="w-24 border-r border-[#E5E7EB] px-3 py-3.5 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-[#6B7280]">
                  Money Order Amount
                </th>
                <th className="w-24 border-r border-[#E5E7EB] px-3 py-3.5 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-[#6B7280]">
                  Action
                </th>
                <th className="w-[132px] px-3 py-3.5 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-[#6B7280]">
                  Complaint
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E7EB]">
              {paginatedShipments.map((row, index) => {
                const s = row.shipment;
                const displayStatus = s.trackingLifecycle?.display_status ?? row.final_status;
                const actionStatus = row.final_status;
                const days = s.daysPassed ?? Math.floor((Date.now() - new Date(s.createdAt).getTime()) / (1000 * 60 * 60 * 24));

                const statusUpper = normalizeStatus(displayStatus).toUpperCase();
                const lifecycle = parseComplaintLifecycle(s);
                const queueSnapshot = complaintQueueByTracking.get(s.trackingNumber);
                const complaintCardState = resolveComplaintCardState(lifecycle, queueSnapshot);
                const isComplaintEnabled = isComplaintActionAllowed(actionStatus, lifecycle, queueSnapshot);
                const complaintActionLabel = resolveComplaintActionLabel(actionStatus, lifecycle, queueSnapshot);

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

                const isWarning = row.delayed;
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
                  <tr key={s.id} className={cn("group border-b border-[#E5E7EB] transition-colors hover:bg-slate-50", rowBaseTone)}>
                    <td className={cn("border-r border-[#E5E7EB] border-l-4 px-3 py-3.5 align-middle", rowVisual.left)}>
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
                    <td className="border-r border-[#E5E7EB] px-3 py-3.5 align-middle text-[11px] font-semibold text-slate-700">{(page - 1) * pageSize + index + 1}</td>
                    <td className="border-r border-[#E5E7EB] px-3 py-3.5 align-middle whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="text-xs font-semibold text-slate-900">
                          {new Date(s.updatedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" })}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          {new Date(s.updatedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    </td>
                    <td className="border-r border-[#E5E7EB] px-3 py-3.5 align-middle font-mono text-[11px] font-bold text-slate-800 group-hover:text-brand truncate whitespace-nowrap" title={s.trackingNumber}>
                      {s.trackingNumber}
                    </td>
                    <td className="border-r border-[#E5E7EB] px-3 py-3.5 align-middle whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset", isWarning ? "bg-red-100 text-red-700 ring-red-200" : statusBadgeClass(displayStatus))}>
                          {normalizeStatus(displayStatus)}
                        </span>
                          <span className="mt-0.5 text-[10px] text-slate-500">{days}d</span>
                      </div>
                    </td>
                      <td className="border-r border-[#E5E7EB] px-3 py-3.5 align-middle text-[11px] text-slate-600 truncate whitespace-nowrap" title={preferredCity(s)}>{preferredCity(s)}</td>
                      <td className="border-r border-[#E5E7EB] px-3 py-3.5 align-middle text-[11px] font-semibold text-slate-700 truncate whitespace-nowrap" title={moValue || undefined}>{moValue}</td>
                      <td className="border-r border-[#E5E7EB] px-3 py-3.5 align-middle text-[11px] font-medium text-slate-700 whitespace-nowrap">
                      {issuedValue != null ? `Rs ${issuedValue.toLocaleString()}` : "-"}
                    </td>
                    <td className="border-r border-[#E5E7EB] px-3 py-3.5 pr-4 align-middle min-w-[104px]">
                      <div className="flex items-center gap-2">
                        <select
                            className="w-20 rounded border-[#E5E7EB] bg-white px-2 py-1.5 text-[10px] font-medium text-slate-700 shadow-sm focus:border-brand focus:ring-brand"
                          value={actionValue}
                          onChange={(e) => updateStatus(s.trackingNumber, e.target.value.includes("RETURN") ? "RETURNED" : e.target.value)}
                        >
                          {effectiveActionOptions.map((opt) => (
                            <option key={opt.val} value={opt.val}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => setSelectedTracking(row)}
                          className="rounded border border-brand/30 bg-brand/10 p-1 text-brand hover:bg-brand/20"
                          title="View details"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                    <td className="px-3 py-3.5 pl-4 align-middle min-w-[160px]">
                      {lifecycle.exists || queueSnapshot ? (() => {
                        const stateStyle = complaintStateBadgeClass(complaintCardState);
                        const complaintId = lifecycle.complaintId || queueSnapshot?.complaintId || "Complaint";
                        const dueDate = lifecycle.dueDateText
                          || (queueSnapshot?.dueDate ? new Date(queueSnapshot.dueDate).toLocaleDateString("en-GB") : "-");
                        const retryHint = complaintCardState === "RETRY PENDING"
                          ? formatRetryCountdown(queueSnapshot?.nextRetryAt, retryCountdownNow)
                          : "";
                        const processingElapsed = complaintCardState === "PROCESSING"
                          ? formatProcessingElapsed(queueSnapshot?.updatedAt, retryCountdownNow)
                          : "";
                        return (
                          <div className="w-full rounded-lg border border-[#E5E7EB] bg-white px-2.5 py-2 text-left text-[10px] shadow-sm">
                            <div className="truncate font-semibold text-[#111827]" title={complaintId}>{complaintId}</div>
                            <div className="mt-0.5 text-[#6B7280]">Due: {dueDate}</div>
                            <div className="mt-0.5 text-[#6B7280]">Complaint Count: {lifecycle.complaintCount.toLocaleString()}</div>
                            <div className="mt-0.5">
                              <span className={cn("inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ring-1 ring-inset", stateStyle)}>
                                {complaintCardState}
                              </span>
                            </div>
                            {complaintCardState === "RETRY PENDING" ? (
                              <div className="mt-1 text-[9px] font-semibold text-amber-700">{retryHint}</div>
                            ) : null}
                            {complaintCardState === "PROCESSING" ? (
                              <div className="mt-1 text-[9px] font-semibold text-purple-700">Processing... {processingElapsed}</div>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => openComplaintModal(row)}
                              disabled={!isComplaintEnabled || complaintActionLabel === "In Process"}
                              className={cn(
                                "mt-1.5 inline-flex w-full items-center justify-center rounded px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset transition-all",
                                isComplaintEnabled && complaintActionLabel !== "In Process"
                                  ? "bg-white text-emerald-800 ring-emerald-300 hover:bg-emerald-100"
                                  : "cursor-not-allowed bg-gray-50 text-gray-400 ring-gray-200"
                              )}
                            >
                              {complaintActionLabel}
                            </button>
                            {lifecycle.complaintCount > 0 ? (
                              <button
                                type="button"
                                onClick={() => setHistoryModalRecord(row)}
                                className="mt-1 inline-flex w-full items-center justify-center rounded px-2 py-0.5 text-[9px] font-medium ring-1 ring-inset transition-all bg-slate-50 text-slate-600 ring-slate-200 hover:bg-slate-100"
                              >
                                View History ({lifecycle.complaintCount})
                              </button>
                            ) : null}
                          </div>
                        );
                      })() : (
                        <button
                          disabled={!isComplaintEnabled}
                          onClick={() => openComplaintModal(row)}
                          className={cn(
                            "inline-flex w-full items-center justify-center gap-1 rounded-xl px-2 py-1 text-[11px] font-semibold shadow-sm ring-1 ring-inset transition-all",
                            isComplaintEnabled
                              ? "bg-red-50 text-red-700 ring-red-200 hover:bg-red-100"
                              : "cursor-not-allowed bg-gray-50 text-gray-400 ring-gray-200"
                          )}
                        >
                          <MessageSquare className="h-3 w-3" />
                          {resolveComplaintActionLabel(displayStatus, lifecycle, queueSnapshot)}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {paginatedShipments.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-sm text-slate-500" colSpan={10}>
                    No shipments found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
          <div className="flex items-center justify-between border-t border-[#E5E7EB] px-4 py-3 text-xs text-slate-600">
            <div className="text-slate-500">
              Page <span className="font-semibold text-slate-700">{page}</span> of <span className="font-semibold text-slate-700">{totalPages}</span> &nbsp;·&nbsp; <span className="font-semibold text-slate-700">{paginatedShipments.length}</span> of <span className="font-semibold text-slate-700">{totalFilteredShipments}</span> filtered &nbsp;·&nbsp; <span className="font-semibold text-slate-700">{totalShipments}</span> total
            </div>
            <div className="flex items-center gap-1.5">
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

            <div className="flex-1 overflow-y-auto p-5">
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
                <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
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

                <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
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
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
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
                  <div className="grid grid-cols-3 gap-2">
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
                  <div className="grid grid-cols-3 gap-2 mb-2">
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

            <div className="sticky bottom-0 border-t border-slate-200 bg-white px-4 py-2 flex items-center justify-between gap-2">
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
                <div className="grid grid-cols-4 gap-2">
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
                  <div className="grid grid-cols-3 gap-2">
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
                  <div className="grid grid-cols-3 gap-2">
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
                  <div className="grid grid-cols-3 gap-2 text-xs">
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

              <div className="sticky bottom-0 border-t border-slate-200 bg-white px-4 py-2 flex items-center justify-between gap-2">
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
                    const actionLabel = resolveComplaintActionLabel(selectedTracking.final_status, selectedComplaintLifecycle ?? {
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
                    const disabled = actionLabel === "In Process";
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
                      {SHARED_STAGE_LABELS.map((stage, idx) => {
                        const isDone = idx <= trackingDetailData.presentation.activeStage;
                        return (
                          <li key={`${selectedTracking.shipment.trackingNumber}-${stage}`} className="relative pl-6 text-xs font-semibold text-slate-600">
                            {idx < SHARED_STAGE_LABELS.length - 1 ? (
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
                              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">{getEventStageLabel(item.description)}</span>
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
        const sortedEntries = [...historyEntries].sort((a, b) => Number(a.attemptNumber ?? 1) - Number(b.attemptNumber ?? 1));
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
                            <span className="ml-1 font-semibold text-slate-800">{entry.complaintId || "-"}</span>
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
                          {entry.previousComplaintReference ? (
                            <div>
                              <span className="text-slate-500">Previous Ref:</span>
                              <span className="ml-1 font-semibold text-slate-800">{entry.previousComplaintReference}</span>
                            </div>
                          ) : null}
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







