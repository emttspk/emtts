import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { UploadCloud, AlertCircle, Eye, MapPin, PackageSearch, BadgeDollarSign, RefreshCw, Printer } from "lucide-react";
import Card from "../components/Card";
import SampleDownloadLink from "../components/SampleDownloadLink";
import { cn } from "../lib/cn";
import { api, apiHealthCheck, uploadFile } from "../lib/api";
import { useTrackingJobPolling } from "../lib/useTrackingJobPolling";
import type { Shipment as BaseShipment, TrackResult } from "../lib/types";
import {
  computeStats,
  filterFinalTrackingData,
  getFinalTrackingData,
  sortFinalTrackingData,
  type FinalTrackingRecord,
  type StatusCardFilter,
} from "../lib/trackingData";

type Shipment = BaseShipment & {
  shipmentType?: string | null;
  daysPassed?: number | null;
  createdAt: string;
  rawJson?: string | null;
};

type ShipmentStats = {
  total: number;
  delivered: number;
  pending: number;
  returned: number;
  delayed: number;
  trackingUsed?: number;
  totalAmount?: number;
  deliveredAmount?: number;
  pendingAmount?: number;
  returnedAmount?: number;
  delayedAmount?: number;
};

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

const TRACKING_CACHE_TTL_MS = 10 * 60 * 1000;
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
  active: boolean;
  complaintId: string;
  dueDateText: string;
  dueDateTs: number | null;
  message: string;
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
  const idFromStructured = textBlob.match(/COMPLAINT_ID\s*:\s*([A-Z0-9\-]+)/i)?.[1] ?? "";
  const idFromMessage = textBlob.match(/Complaint\s*ID\s*([A-Z0-9\-]+)/i)?.[1] ?? "";
  const rawId = (idFromStructured || idFromMessage || "").trim();
  const complaintId = rawId
    ? (rawId.toUpperCase().startsWith("CMP-") ? rawId.toUpperCase() : `CMP-${rawId}`)
    : "";

  const dueStructured = textBlob.match(/DUE_DATE\s*:\s*([^\n|]+)/i)?.[1] ?? "";
  const dueFromMessage = textBlob.match(/Due\s*Date\s*(?:on)?\s*([0-3]?\d\/[0-1]?\d\/\d{4})/i)?.[1] ?? "";
  const dueDateText = String(dueStructured || dueFromMessage || "").trim();
  const dueDateTs = parseDueDateToTs(dueDateText);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const activeStatus = String(shipment.complaintStatus ?? "").toUpperCase() === "FILED";
  const active = Boolean(activeStatus && complaintId && dueDateTs != null && dueDateTs >= todayStart.getTime());

  return {
    active,
    complaintId,
    dueDateText,
    dueDateTs,
    message: textBlob,
  };
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

  for (const candidate of cleanCandidates) {
    const matches = searchOfficeRows(candidate, rows);
    if (matches.length > 0) return matches[0];
  }

  const byCity = cleanCandidates
    .map((candidate) => {
      const want = normalizeComplaintCity(candidate);
      return rows.find((row) => normalizeComplaintCity(row.location) === want || normalizeComplaintCity(row.tehsil) === want || normalizeComplaintCity(row.district) === want) ?? null;
    })
    .find(Boolean);
  if (byCity) return byCity;

  // Final deterministic fallback: first valid hierarchy row from dataset.
  return rows[0] ?? null;
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

function extractMoReference(rawJson?: string | null, linkedMo?: string | null) {
  const normalized = String(linkedMo ?? "").trim().toUpperCase();
  if (normalized) return normalized;
  try {
    const parsed = rawJson ? JSON.parse(rawJson) : {};
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
      <div class="print-branding print-branding-top"><strong>FREE BULK DISPATCH AND TRACKING</strong></div>
      <div class="print-panel no-break">
        <div class="print-title">Bulk Dispatch Tracking Print</div>
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
  const [shipmentStats, setShipmentStats] = useState<ShipmentStats | null>(null);
  const [pageSize, setPageSize] = useState<20 | 50 | 100>(20);
  const [statusFilter, setStatusFilter] = useState<StatusCardFilter>("ALL");
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
  const [complaintSubmitResult, setComplaintSubmitResult] = useState<{
    complaintNumber: string;
    dueDate: string;
    trackingId: string;
    status: string;
  } | null>(null);
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
  const importFileInputRef = useRef<HTMLInputElement>(null);
  const backgroundQueueRef = useRef<string[]>([]);
  const backgroundSeenRef = useRef(new Set<string>());
  const backgroundRunningRef = useRef(false);
  const submitTrackingRef = useRef(false);
  const fetchedComplaintRef = useRef<{ trackingId: string; isFetched: boolean }>({ trackingId: "", isFetched: false });

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
    if (!complaintRecord) return;
    const trackingId = String(complaintRecord.shipment.trackingNumber ?? "").trim();
    if (!trackingId) return;
    if (fetchedComplaintRef.current.trackingId !== trackingId) {
      fetchedComplaintRef.current = { trackingId, isFetched: false };
    }
  }, [complaintRecord?.shipment.trackingNumber]);

  useEffect(() => {
    void refreshShipments();
  }, []);

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

  async function refreshShipmentStats() {
    const data = await api<ShipmentStats>("/api/shipments/stats");
    setShipmentStats(data);
  }

  async function refreshShipments() {
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

    console.log(`[TRACE] stage=FRONTEND_RECEIVED_DATA shipments=${allRows.length}`);
    for (const row of getFinalTrackingData(allRows)) {
      console.log(`FRONTEND_DISPLAY_STATUS = "${row.final_status}" tn=${row.shipment.trackingNumber}`);
    }
    setShipments(allRows);
    setTotalShipments(total || allRows.length);
    void refreshShipmentStats();
    enqueueBackgroundRefresh(allRows);
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
        ? `\n❌ Errors (${result.errors.length}): ${result.errors.slice(0, 3).map((e) => `Row ${e.rowIndex}: ${e.message}`).join("; ")}`
        : "";
      
      const warningMsg = result.warnings.length > 0
        ? `\n⚠️  Warnings (${result.warnings.length}): ${result.warnings.slice(0, 3).map((w) => `Row ${w.rowIndex}: ${w.message}`).join("; ")}`
        : "";
      
      const statusChanges = Object.entries(result.summary?.statusChanges ?? {})
        .map(([key, count]) => `${key} (${count}x)`)
        .join(", ");
      
      const cycleChanges = Object.entries(result.summary?.cycleChanges ?? {})
        .map(([key, count]) => `${key} (${count}x)`)
        .join(", ");

      const summaryMsg = [
        `✅ Import complete: ${result.validRows}/${result.totalRows} rows valid`,
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
          const data = await api<{ shipments: Shipment[] }>("/api/shipments?limit=100");
          setShipments(data.shipments);
          const stats = await api<ShipmentStats>("/api/shipments/stats");
          setShipmentStats(stats);
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
      const pendingTrackingNumbers = getFinalTrackingData(shipments)
        .filter((s) => s.final_status.includes("PENDING"))
        .map((s) => s.shipment.trackingNumber);
      const response = await api<{ refreshed: number; cached: number; chargedUnits: number }>("/api/shipments/refresh-pending", {
        method: "POST",
        body: JSON.stringify({ trackingNumbers: pendingTrackingNumbers }),
      });
      setRefreshSummary(`Refreshed ${response.refreshed}, cached ${response.cached}, charged ${response.chargedUnits} unit(s).`);
      await refreshShipments();
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
    const filtered = filterFinalTrackingData(finalTrackingData, statusFilter);
    return sortFinalTrackingData(filtered);
  }, [finalTrackingData, statusFilter]);

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
    const bookingDate = timeline[0]?.date || "-";
    const lastEvent = timeline[timeline.length - 1] ?? null;
    const lastUpdate = lastEvent ? `${lastEvent.date} ${lastEvent.time}`.trim() : `${detailShipment.latestDate ?? ""} ${detailShipment.latestTime ?? ""}`.trim() || "-";
    const moIssued = extractMoReference(detailShipment.rawJson, detailShipment.moIssued ?? null);
    const moValue = extractMoValue(detailShipment.rawJson, detailShipment.moValue ?? null);
    const bookingOffice = String((raw?.tracking as any)?.booking_office ?? raw?.Booking_Office ?? raw?.booking_office ?? raw?.bookingOffice ?? fields.senderCity ?? "").trim() || "-";
    const deliveryOffice = String(raw?.resolved_delivery_office ?? (raw?.tracking as any)?.delivery_office ?? raw?.Delivery_Office ?? raw?.delivery_office ?? raw?.deliveryOffice ?? fields.consigneeCity ?? "").trim() || "-";
    return {
      fields,
      timeline,
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
      printArea.classList.remove("active-print-area");
      printArea.innerHTML = "";
      window.removeEventListener("afterprint", cleanup);
    };

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

    const waNumber = formatted.replace(/^\+/, "");
    const text = [
      "Shipment Update",
      "",
      `Tracking ID: ${detailShipment.trackingNumber}`,
      `Status: ${selectedTracking.final_status}`,
      `City: ${preferredCity(detailShipment)}`,
      `MO Value: ${trackingDetailData.moValue != null ? `Rs ${trackingDetailData.moValue.toLocaleString()}` : "-"}`,
      "",
      "Thank you.",
    ].join("\n");

    const url = `https://wa.me/${waNumber}?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function openComplaintModal(record: FinalTrackingRecord) {
    const shipment = record.shipment;
    const trackingId = String(shipment.trackingNumber ?? "").trim();
    if (!trackingId) return;
    if (fetchedComplaintRef.current.trackingId !== trackingId) {
      fetchedComplaintRef.current = { trackingId, isFetched: false };
    }
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
    setComplaintRecord(record);
    setComplaintSubmitResult(null);
    setComplaintPhone(phone);
    setComplaintEmail(email);
    setReplyMode("POST");
    setComplaintTemplate(templateKey);
    setComplaintText(normalizedFormState.remarks);
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

    if (fetchedComplaintRef.current.isFetched && fetchedComplaintRef.current.trackingId === trackingId) {
      return;
    }

    void api<ComplaintPrefill>(`/api/tracking/complaint/prefill/${encodeURIComponent(shipment.trackingNumber)}`)
      .then((prefill) => {
        if (fetchedComplaintRef.current.trackingId !== trackingId) return;
        if (fetchedComplaintRef.current.isFetched) return;
        setComplaintPrefill(prefill);
        // Hierarchy selection: deterministic resolver with strict fallback.
        const hierarchyCandidates = [
          uploadConsigneeCity,
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
        fetchedComplaintRef.current = { trackingId, isFetched: true };
      })
      .catch(() => {
        if (fetchedComplaintRef.current.trackingId !== trackingId) return;
        setComplaintPrefill({
          deliveryOffice: preferredCity(shipment),
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
        fetchedComplaintRef.current = { trackingId, isFetched: true };
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
  const complaintSubmitReady = complaintSubmitMissingFields.length === 0;
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
    if (lifecycle.active) {
      alert(`Complaint already active. Complaint ID: ${lifecycle.complaintId} | Due Date: ${lifecycle.dueDateText || "-"}`);
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
      alert("Receiver name is required.");
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
        console.error("FORM INCOMPLETE — BLOCK SUBMISSION", { missing: incompleteField[0], formSnapshot });
        throw new Error(`FORM INCOMPLETE — BLOCK SUBMISSION (${incompleteField[0]})`);
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

      setComplaintSubmitResult({ complaintNumber, dueDate, trackingId, status });
      const alertMessage = complaintNumber
        ? `Complaint Registered\nTracking: ${trackingId}\nComplaint ID: ${complaintNumber}\nDue Date: ${dueDate}`
        : (hasRefund 
          ? "Request failed. Units will be refunded after admin approval."
          : (res.message || "Complaint submission failed"));
      alert(alertMessage);
      await refreshShipments();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Complaint submission failed");
    } finally {
      setSubmittingComplaint(false);
    }
  }

  return (
    <>
    <div className="app-container space-y-5 px-3">
      <Card className="overflow-hidden p-8">
        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand/10 px-4 py-2 text-sm font-semibold text-brand">
              Track Parcel
            </div>
            <div className="mt-5 text-4xl font-semibold text-slate-950">Monitor parcel movement with a premium live tracking workspace.</div>
            <div className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">Upload your file once, process records in bulk, and manage shipment actions, complaints, and MO visibility from one screen.</div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Card className="p-5">
              <div className="text-sm text-slate-500">Current Upload</div>
              <div className="mt-2 truncate text-lg font-semibold text-slate-900">{file?.name ?? "No file selected"}</div>
            </Card>
            <Card className="p-5">
              <div className="text-sm text-slate-500">Job State</div>
              <div className="mt-2 text-lg font-semibold text-slate-900">{statusLabel}</div>
            </Card>
          </div>
        </div>
      </Card>

      <Card className="border-slate-200 p-3">
        <div className="grid gap-3 sm:grid-cols-5">
          <button
            type="button"
            onClick={() => {
              setStatusFilter("ALL");
              setPage(1);
            }}
            className="rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:shadow-sm"
          >
            <div className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">Total</div>
            <div className="mt-2 text-2xl font-semibold text-slate-900">{summaryStats.total.toLocaleString()}</div>
          </button>
          <button
            type="button"
            onClick={() => {
              setStatusFilter("DELIVERED");
              setPage(1);
            }}
            className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-left transition hover:shadow-sm"
          >
            <div className="text-xs font-medium uppercase tracking-[0.12em] text-emerald-700">Delivered</div>
            <div className="mt-2 text-2xl font-semibold text-emerald-800">{summaryStats.delivered.toLocaleString()}</div>
          </button>
          <button
            type="button"
            onClick={() => {
              setStatusFilter("PENDING");
              setPage(1);
            }}
            className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-left transition hover:shadow-sm"
          >
            <div className="text-xs font-medium uppercase tracking-[0.12em] text-orange-700">Pending</div>
            <div className="mt-2 text-2xl font-semibold text-orange-800">{summaryStats.pending.toLocaleString()}</div>
          </button>
          <button
            type="button"
            onClick={() => {
              setStatusFilter("RETURNED");
              setPage(1);
            }}
            className="rounded-xl border border-red-200 bg-red-50 p-3 text-left transition hover:shadow-sm"
          >
            <div className="text-xs font-medium uppercase tracking-[0.12em] text-red-700">Returned</div>
            <div className="mt-2 text-2xl font-semibold text-red-800">{summaryStats.returned.toLocaleString()}</div>
          </button>
          <button
            type="button"
            onClick={() => {
              setStatusFilter("DELAYED");
              setPage(1);
            }}
            className="rounded-xl border border-violet-200 bg-violet-50 p-3 text-left transition hover:shadow-sm"
          >
            <div className="text-xs font-medium uppercase tracking-[0.12em] text-violet-700">Delayed</div>
            <div className="mt-2 text-2xl font-semibold text-violet-800">{summaryStats.delayed.toLocaleString()}</div>
          </button>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="border-slate-200 p-3">
          <div className="text-sm font-semibold text-slate-900">Status Distribution</div>
          <div className="mt-1 text-xs text-slate-500">Delivered · Pending · Returned · Delayed</div>
          <div className="mt-3 flex items-center gap-5">
            <svg viewBox="0 0 36 36" className="h-32 w-32 shrink-0">
              {pieSlices.arcs.map((arc) => {
                if (arc.value <= 0) return null;
                const start = arc.start * 360;
                const end = arc.end * 360;
                const largeArc = end - start > 180 ? 1 : 0;
                const r = 15.915;
                const startX = 18 + r * Math.cos((Math.PI / 180) * (start - 90));
                const startY = 18 + r * Math.sin((Math.PI / 180) * (start - 90));
                const endX = 18 + r * Math.cos((Math.PI / 180) * (end - 90));
                const endY = 18 + r * Math.sin((Math.PI / 180) * (end - 90));
                return (
                  <path
                    key={arc.label}
                    d={`M 18 18 L ${startX} ${startY} A ${r} ${r} 0 ${largeArc} 1 ${endX} ${endY} Z`}
                    fill={arc.color}
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredPieLabel(arc.label)}
                    onMouseLeave={() => setHoveredPieLabel(null)}
                  />
                );
              })}
              <circle cx="18" cy="18" r="8" fill="white" />
            </svg>
            <div className="space-y-2 text-xs text-slate-700">
              {pieSlices.arcs.map((arc) => (
                <div
                  key={arc.label}
                  className="flex items-center gap-2"
                  onMouseEnter={() => setHoveredPieLabel(arc.label)}
                  onMouseLeave={() => setHoveredPieLabel(null)}
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: arc.color }} />
                  <span className="font-medium">{arc.label}:</span>
                  <span className="font-semibold text-slate-900">{arc.value}</span>
                </div>
              ))}
              <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-700">
                {hoveredPie ? `${hoveredPie.label}: ${hoveredPie.value}` : "Hover a slice: Delivered / Pending / Returned / Delayed"}
              </div>
            </div>
          </div>
        </Card>
        <Card className="border-slate-200 p-3">
          <div className="text-sm font-semibold text-slate-900">Monthly Tracking Volume</div>
          <div className="mt-1 text-xs text-slate-500">Last 6 months (oldest → newest)</div>
          <div className="mt-4 flex h-32 items-end gap-2">
            {monthlyBars.values.map((item) => {
              const h = Math.max(6, Math.round((item.value / monthlyBars.max) * 112));
              return (
                <div key={item.key} className="flex flex-1 flex-col items-center gap-1">
                  <div className="text-[10px] font-medium text-slate-700">{item.value > 0 ? item.value : ""}</div>
                  <div
                    className="w-full rounded-t-md bg-gradient-to-t from-indigo-600 to-sky-400"
                    style={{ height: `${h}px` }}
                  />
                  <div className="text-[10px] font-medium text-slate-500">{item.label}</div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {uiState === "processing" && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-brand px-6 py-3 text-white shadow-lg transition-all duration-300">
          <div className="mx-auto flex max-w-6xl items-center justify-between">
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

      <Card>
        <div className="border-b px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xl font-medium text-gray-900">Bulk Tracking</div>
              <div className="mt-1 text-sm text-gray-600">Upload CSV/XLS/XLSX using the strict shared sample structure.</div>
              <div className="mt-2 text-sm font-bold text-gray-900">FREE BULK DISPATCH AND TRACKING</div>
            </div>
            <SampleDownloadLink />
          </div>
        </div>

        <div className="grid gap-4 p-6">
          <div
            {...getRootProps()}
            className={cn(
              "relative rounded-xl border border-dashed bg-white p-8 transition-all duration-200 ease-in-out",
              isDragActive ? "border-brand bg-brand/10" : "border-gray-200 hover:border-gray-300",
            )}
          >
            <input {...getInputProps()} />
            <div className="flex flex-col items-center text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-50">
                <UploadCloud className="h-6 w-6 text-gray-600" />
              </div>
              <div className="mt-4 text-base font-medium text-gray-900">Drag & drop Excel/CSV</div>
              <div className="mt-1 text-sm text-gray-600">
                or{" "}
                <button type="button" className="font-medium text-brand hover:text-brand" onClick={open}>
                  click to upload
                </button>
              </div>

              <div className="mt-4 w-full max-w-xl text-xs text-gray-600">
                <div className="flex items-center justify-between">
                  <span>{file ? file.name : "No file selected"}</span>
                  <span className="font-medium text-gray-900">{statusLabel}</span>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                  <div
                    className={`h-full rounded-full transition-all duration-200 ease-in-out ${
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
            {isDragActive ? <div className="pointer-events-none absolute inset-2 rounded-lg ring-1 ring-indigo-600/40" /> : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              className="rounded-lg border bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
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
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white shadow-md hover:bg-brand-dark disabled:opacity-50"
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
              <div className="text-lg font-medium text-gray-900">Results</div>
              <div className="mt-1 text-sm text-gray-600">{stats.total.toLocaleString()} shipments</div>
            </div>
            <div className="text-xs text-gray-600">
              {Object.entries(stats.by)
                .map(([k, v]) => `${k}: ${v}`)
                .join(" • ")}
            </div>
          </div>

          <div className="mt-4 overflow-x-auto rounded-xl border bg-white">
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

      <Card className="overflow-hidden border-slate-200 bg-[linear-gradient(180deg,#ffffff,#f8fbff)] p-0">
        <div className="border-b border-slate-200 bg-white/80 px-6 py-5 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xl font-semibold tracking-tight text-slate-900">All Tracked Shipments</div>
              <div className="mt-1 text-sm text-slate-600">Professional shipment workspace with status control, aging, and money-order details.</div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs font-medium text-slate-600">
              Records:
              <select
                className="ml-2 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
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
            <label className="text-xs font-medium text-slate-600">
              Filter:
              <select
                className="ml-2 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as StatusCardFilter);
                  setPage(1);
                }}
              >
                <option value="ALL">All</option>
                <option value="PENDING">Pending</option>
                <option value="DELIVERED">Delivered</option>
                <option value="RETURNED">Returned</option>
                <option value="DELAYED">Delayed</option>
              </select>
            </label>
            {selectedIds.length > 0 && (
              <button
                onClick={deleteSelected}
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 shadow-sm hover:bg-red-100"
              >
                Delete {selectedIds.length}
              </button>
            )}
            <button
              onClick={refreshAllPending}
              disabled={refreshingPending}
              className="inline-flex items-center gap-1 rounded-lg border border-brand/30 bg-brand/10 px-3 py-1.5 text-xs font-medium text-brand shadow-sm hover:bg-brand/20 disabled:opacity-60"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", refreshingPending && "animate-spin")} />
              Refresh All Pending
            </button>
            <button
              onClick={refreshShipments}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Refresh
            </button>
          </div>
        </div>
        {refreshSummary ? <div className="border-t border-slate-200 bg-slate-50 px-6 py-2 text-xs text-slate-700">{refreshSummary}</div> : null}
        </div>
        <div className="p-1.5 md:p-2">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <table className="w-full table-auto text-[13px]">
              <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 backdrop-blur">
              <tr>
                <th className="w-8 border-r border-slate-100 px-2 py-2">
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
                <th className="border-r border-slate-100 px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                  S.No
                </th>
                <th className="border-r border-slate-100 px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Updated
                </th>
                <th className="border-r border-slate-100 px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                  <span className="inline-flex items-center gap-1"><PackageSearch className="h-3 w-3" /> Tracking</span>
                </th>
                <th className="border-r border-slate-100 px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Status
                </th>
                <th className="border-r border-slate-100 px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                  <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> City</span>
                </th>
                <th className="border-r border-slate-100 px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                  <span className="inline-flex items-center gap-1"><BadgeDollarSign className="h-3 w-3" /> Money Order No</span>
                </th>
                <th className="border-r border-slate-100 px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Money Order Amount
                </th>
                <th className="border-r border-slate-100 px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Action
                </th>
                <th className="px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Complaint
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedShipments.map((row, index) => {
                const s = row.shipment;
                const displayStatus = row.final_status;
                const days = s.daysPassed ?? Math.floor((Date.now() - new Date(s.createdAt).getTime()) / (1000 * 60 * 60 * 24));

                const statusUpper = normalizeStatus(displayStatus).toUpperCase();
                const lifecycle = parseComplaintLifecycle(s);
                const isComplaintEnabled = statusUpper === "PENDING" && !lifecycle.active;

                const actionOptions = [
                  { label: "Pending", val: "PENDING" },
                  { label: "Delivered", val: "DELIVERED" },
                  { label: "Return", val: "RETURNED" },
                ];
                const validActionValues = new Set(actionOptions.map((opt) => opt.val));
                const normalizedDisplayStatus = String(displayStatus ?? "").trim().toUpperCase().includes("RETURN")
                  ? "RETURNED"
                  : String(displayStatus ?? "").trim().toUpperCase();
                const effectiveActionOptions = actionOptions;
                const actionValue =
                  !normalizedDisplayStatus || !validActionValues.has(normalizedDisplayStatus)
                    ? "PENDING"
                    : normalizedDisplayStatus;

                const isWarning = row.delayed;
                const fetchedMO = extractMoReference(s.rawJson, s.moIssued ?? null);
                const moValue = fetchedMO ? fetchedMO : "-";
                const issuedValue = extractMoValue(s.rawJson, s.moValue ?? null);
                const rowTone = isWarning
                  ? "bg-violet-50/40"
                  : statusUpper.includes("DELIVERED")
                    ? "bg-emerald-50/35"
                    : statusUpper.includes("RETURN")
                      ? "bg-red-50/35"
                      : "bg-orange-50/30";

                return (
                  <tr key={s.id} className={cn("group h-[36px] border-b border-[#eee] transition-colors hover:bg-brand/10", rowTone)}>
                    <td className="border-r border-slate-100 px-2 py-1.5 align-middle">
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
                    <td className="border-r border-slate-100 px-2 py-1.5 align-middle text-xs font-semibold text-slate-700">{(page - 1) * pageSize + index + 1}</td>
                    <td className="border-r border-slate-100 px-2 py-1.5 align-middle">
                      <div className="flex flex-col">
                        <span className="text-xs font-semibold text-slate-900">
                          {new Date(s.updatedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" })}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          {new Date(s.updatedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    </td>
                    <td className="border-r border-slate-100 px-2 py-1.5 align-middle font-mono text-xs font-bold text-slate-800 group-hover:text-brand overflow-hidden text-ellipsis whitespace-nowrap" title={s.trackingNumber}>
                      {s.trackingNumber}
                    </td>
                    <td className="border-r border-slate-100 px-2 py-1.5 align-middle">
                      <div className="flex flex-col">
                        <span className={cn("inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset", isWarning ? "bg-red-100 text-red-700 ring-red-200" : statusBadgeClass(displayStatus))}>
                          {normalizeStatus(displayStatus)}
                        </span>
                          <span className="mt-0.5 text-[10px] text-slate-500">{days}d</span>
                      </div>
                    </td>
                      <td className="border-r border-slate-100 px-2 py-1.5 align-middle text-xs text-slate-600 overflow-hidden text-ellipsis whitespace-nowrap" title={preferredCity(s)}>{preferredCity(s)}</td>
                      <td className="border-r border-slate-100 px-2 py-1.5 align-middle text-xs font-semibold text-slate-700 overflow-hidden text-ellipsis whitespace-nowrap" title={moValue || undefined}>{moValue}</td>
                      <td className="border-r border-slate-100 px-2 py-1.5 align-middle text-xs font-medium text-slate-700 whitespace-nowrap">
                      {issuedValue != null ? `Rs ${issuedValue.toLocaleString()}` : "–"}
                    </td>
                    <td className="border-r border-slate-100 px-2 py-1.5 align-middle">
                      <div className="flex items-center gap-1">
                        <select
                            className="w-20 rounded border-slate-200 bg-white py-1 text-[10px] font-medium text-slate-700 shadow-sm focus:border-brand focus:ring-brand"
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
                    <td className="px-2 py-1.5 align-middle whitespace-nowrap">
                      {lifecycle.active ? (
                        <div className="rounded border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] text-blue-800">
                          <div className="font-semibold">Complaint ID: {lifecycle.complaintId}</div>
                          <div>Due Date: {lifecycle.dueDateText || "-"}</div>
                        </div>
                      ) : (
                        <button
                          disabled={!isComplaintEnabled}
                          onClick={() => openComplaintModal(row)}
                          className={cn(
                            "rounded px-2.5 py-1 text-xs font-medium shadow-sm ring-1 ring-inset transition-all",
                            isComplaintEnabled
                              ? "bg-red-50 text-red-700 ring-red-600/10 hover:bg-red-100 hover:text-red-800"
                              : "cursor-not-allowed bg-gray-50 text-gray-400 ring-gray-200"
                          )}
                        >
                          Complaint
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
          <div className="mt-4 flex items-center justify-between text-xs text-slate-600">
            <div>
              Page {page} of {totalPages} • Showing {paginatedShipments.length} of {totalFilteredShipments} filtered • Total {totalShipments}
            </div>
            <div className="flex items-center gap-2">
              <button
                className="rounded border border-slate-200 bg-white px-2 py-1 disabled:opacity-50"
                disabled={page <= 1}
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              >
                Previous
              </button>
              <button
                className="rounded border border-slate-200 bg-white px-2 py-1 disabled:opacity-50"
                disabled={page >= totalPages}
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </Card>

      <Card className="border-slate-200 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-slate-900">Tracking Cycle Audit (100 Sample)</div>
            <div className="mt-1 text-sm text-slate-600">Read-only mismatch audit with editable correction and reprocessing workflow.</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              onClick={runCycleAudit}
              disabled={auditLoading}
            >
              {auditLoading ? "Auditing..." : "Run Audit"}
            </button>
            <button
              className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-dark disabled:opacity-60"
              onClick={saveCycleCorrections}
              disabled={savingCorrections || auditRows.length === 0}
            >
              {savingCorrections ? "Saving..." : "Save Corrections & Reprocess"}
            </button>
            <button
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              onClick={exportAuditToCSV}
              disabled={auditRows.length === 0}
            >
              Export CSV
            </button>
            <button
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
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
        {auditSummary ? <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{auditSummary}</div> : null}
        {auditError ? <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{auditError}</div> : null}
        {auditRows.length > 0 ? (
          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="min-w-[1200px] text-xs">
              <thead className="bg-slate-50">
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
              <tbody className="divide-y divide-slate-100">
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
                            className="rounded border border-slate-200 bg-white px-2 py-1"
                            value={draft.expected_status}
                            onChange={(e) => updateAuditDraft(row.tracking_number, { expected_status: e.target.value as CycleAuditDraft["expected_status"] }, row)}
                          >
                            <option value="PENDING">PENDING</option>
                            <option value="DELIVERED">DELIVERED</option>
                            <option value="RETURNED">RETURNED</option>
                            <option value="DELIVERED WITH PAYMENT">DELIVERED WITH PAYMENT</option>
                          </select>
                          <select
                            className="rounded border border-slate-200 bg-white px-2 py-1"
                            value={draft.cycle_detected}
                            onChange={(e) => updateAuditDraft(row.tracking_number, { cycle_detected: e.target.value as CycleAuditDraft["cycle_detected"] }, row)}
                          >
                            <option value="Cycle 1">Cycle 1</option>
                            <option value="Cycle 2">Cycle 2</option>
                            <option value="Cycle 3">Cycle 3</option>
                            <option value="Cycle Unknown">Cycle Unknown</option>
                          </select>
                          <input
                            className="rounded border border-slate-200 bg-white px-2 py-1"
                            value={draft.missing_steps}
                            onChange={(e) => updateAuditDraft(row.tracking_number, { missing_steps: e.target.value }, row)}
                            placeholder="Missing steps (semicolon separated)"
                          />
                          <input
                            className="rounded border border-slate-200 bg-white px-2 py-1"
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
      </Card>

      {complaintRecord ? (
        <div className="modal-wrapper bg-slate-950/50 p-2 z-40">
          <div className="modal-content w-full max-w-4xl rounded-lg bg-white shadow-2xl max-h-[95vh] flex flex-col overflow-hidden">
            <div className="modal-header flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div>
                <div className="text-base font-semibold text-slate-900">File Complaint</div>
                <div className="text-xs text-slate-500">Tracking: {complaintRecord.shipment.trackingNumber}</div>
              </div>
              <button
                type="button"
                className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                onClick={() => setComplaintRecord(null)}
              >
                Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              <div className="grid gap-2">
                <div className="grid grid-cols-4 gap-2">
                  <label>
                    <div className="text-[10px] font-medium text-slate-600 mb-0.5">Article No</div>
                    <input value={complaintRecord.shipment.trackingNumber} readOnly className="w-full rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs" />
                  </label>
                  <label>
                    <div className="text-[10px] font-medium text-slate-600 mb-0.5">Service Type</div>
                    <input value={detectServiceType(complaintRecord.shipment.trackingNumber)} readOnly className="w-full rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs" />
                  </label>
                  <label>
                    <div className="text-[10px] font-medium text-slate-600 mb-0.5">Complaint Reason</div>
                    <select value={complaintReason} onChange={(e) => setComplaintReason(e.target.value)} className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs">
                      <option value="Pending Delivery">Pending Delivery</option>
                      <option value="Return Not Received">Return Not Received</option>
                      <option value="Money Order Not Received">Money Order Not Received</option>
                      <option value="Other">Other</option>
                    </select>
                  </label>
                  <label>
                    <div className="text-[10px] font-medium text-slate-600 mb-0.5">Booking Date</div>
                    <input value={formatLastDate(complaintRecord.shipment)} readOnly className="w-full rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs" />
                  </label>
                </div>

                <div className="grid grid-cols-4 gap-2">
                  <label>
                    <div className="text-[10px] font-medium text-slate-600 mb-0.5">Complainant Name</div>
                    <input value={complainantNameInput} onChange={(e) => setComplainantNameInput(e.target.value)} className={`w-full rounded border px-2 py-1 text-xs ${complaintValidationState.SenderName ? "border-slate-200" : "border-red-300 bg-red-50"}`} />
                  </label>
                  <label>
                    <div className="text-[10px] font-medium text-slate-600 mb-0.5">Mobile</div>
                    <input value={complaintPhone} onChange={(e) => setComplaintPhone(e.target.value)} className={`w-full rounded border px-2 py-1 text-xs ${complaintValidationState.Mobile ? "border-slate-200" : "border-red-300 bg-red-50"}`} placeholder="03XXXXXXXXX" />
                  </label>
                  <label>
                    <div className="text-[10px] font-medium text-slate-600 mb-0.5">Reply Mode</div>
                    <select value={replyMode} onChange={(e) => setReplyMode((e.target.value as "POST" | "EMAIL" | "SMS"))} className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs">
                      <option value="POST">Post</option>
                      <option value="EMAIL">Email</option>
                      <option value="SMS">SMS</option>
                    </select>
                  </label>
                  <label>
                    <div className="text-[10px] font-medium text-slate-600 mb-0.5">Booking Office</div>
                    <input value={senderCitySearch || getUnifiedFields(complaintRecord.shipment.rawJson).senderCity || "-"} readOnly className="w-full rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs" />
                  </label>
                </div>

                <div className="border-t border-slate-200 pt-2 mt-2">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs font-semibold text-slate-800">Sender Detail</div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <label>
                      <div className="text-[10px] font-medium text-slate-600 mb-0.5">Name {!senderNameIsLocked && <span className="text-red-500">*</span>}</div>
                      <input
                        value={senderNameInput}
                        readOnly={senderNameIsLocked}
                        onChange={senderNameIsLocked ? undefined : (e) => setSenderNameInput(e.target.value)}
                        className={`w-full rounded border px-2 py-1 text-xs ${senderNameIsLocked ? "bg-slate-100 border-slate-200 text-slate-600 cursor-not-allowed" : complaintValidationState.SenderName === false ? "border-red-300 bg-red-50" : "border-slate-200 bg-white"}`}
                      />
                    </label>
                    <label>
                      <div className="text-[10px] font-medium text-slate-600 mb-0.5">Address</div>
                      <input value={senderAddressInput} onChange={(e) => setSenderAddressInput(e.target.value)} className={`w-full rounded border px-2 py-1 text-xs ${complaintValidationState.SenderAddress === false ? "border-red-300 bg-red-50" : "border-slate-200 bg-white"}`} placeholder="Required" />
                    </label>
                    <label>
                      <div className="text-[10px] font-medium text-slate-600 mb-0.5">City</div>
                      {senderCityIsLocked ? (
                        <input value={senderCityValue} readOnly className="w-full rounded border border-slate-200 bg-slate-100 px-2 py-1 text-xs cursor-not-allowed text-slate-600" />
                      ) : (
                        <>
                          <input value={senderCitySearch} onChange={(e) => setSenderCitySearch(e.target.value)} className={`w-full rounded border px-2 py-1 text-xs ${complaintValidationState.SenderCity === false ? "border-red-300 bg-red-50" : "border-slate-200 bg-white"}`} placeholder="Search (≥3)" />
                          {senderCitySearch.trim().length >= 3 && senderCitySearchResults.length > 0 ? (
                            <select value={senderCityValue} onChange={(e) => { setSenderCityValue(e.target.value); setSenderCitySearch(e.target.value); }} className="mt-0.5 w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs">
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
                    <div className="text-xs font-semibold text-slate-800">Addressee Detail</div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <label>
                      <div className="text-[10px] font-medium text-slate-600 mb-0.5">Name {!receiverNameIsLocked && <span className="text-red-500">*</span>}</div>
                      <input
                        value={receiverNameInput}
                        readOnly={receiverNameIsLocked}
                        onChange={receiverNameIsLocked ? undefined : (e) => setReceiverNameInput(e.target.value)}
                        className={`w-full rounded border px-2 py-1 text-xs ${receiverNameIsLocked ? "bg-slate-100 border-slate-200 text-slate-600 cursor-not-allowed" : complaintValidationState.ReceiverName === false ? "border-red-300 bg-red-50" : "border-slate-200 bg-white"}`}
                      />
                    </label>
                    <label>
                      <div className="text-[10px] font-medium text-slate-600 mb-0.5">Address</div>
                      <input value={receiverAddressInput} onChange={(e) => setReceiverAddressInput(e.target.value)} className={`w-full rounded border px-2 py-1 text-xs ${complaintValidationState.ReceiverAddress === false ? "border-red-300 bg-red-50" : "border-slate-200 bg-white"}`} placeholder="Required" />
                    </label>
                    <label>
                      <div className="text-[10px] font-medium text-slate-600 mb-0.5">City</div>
                      {receiverCityIsLocked ? (
                        <input value={receiverCityValue} readOnly className="w-full rounded border border-slate-200 bg-slate-100 px-2 py-1 text-xs cursor-not-allowed text-slate-600" />
                      ) : (
                        <>
                          <input value={receiverCitySearch} onChange={(e) => setReceiverCitySearch(e.target.value)} className={`w-full rounded border px-2 py-1 text-xs ${complaintValidationState.ReceiverCity === false ? "border-red-300 bg-red-50" : "border-slate-200 bg-white"}`} placeholder="Search (≥3)" />
                          {receiverCitySearch.trim().length >= 3 && receiverCitySearchResults.length > 0 ? (
                            <select value={receiverCityValue} onChange={(e) => { setReceiverCityValue(e.target.value); setReceiverCitySearch(e.target.value); }} className="mt-0.5 w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs">
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
                  <div className="text-xs font-semibold text-slate-800 mb-2">Remarks <span className="text-red-600">*</span></div>
                  <div className="flex gap-1 mb-1">
                    <button type="button" onClick={() => { setComplaintTemplate("VALUE_PAYABLE"); setComplaintText(buildComplaintTemplate(complaintRecord, "VALUE_PAYABLE")); }} className={`rounded px-2 py-0.5 text-[10px] ${complaintTemplate === "VALUE_PAYABLE" ? "border border-brand/30 bg-brand/10 text-brand" : "border border-slate-200 bg-white text-slate-600"}`}>Value Payable</button>
                    <button type="button" onClick={() => { setComplaintTemplate("NORMAL"); setComplaintText(buildComplaintTemplate(complaintRecord, "NORMAL")); }} className={`rounded px-2 py-0.5 text-[10px] ${complaintTemplate === "NORMAL" ? "border border-brand/30 bg-brand/10 text-brand" : "border border-slate-200 bg-white text-slate-600"}`}>Normal</button>
                    <button type="button" onClick={() => { setComplaintTemplate("RETURN"); setComplaintText(buildComplaintTemplate(complaintRecord, "RETURN")); }} className={`rounded px-2 py-0.5 text-[10px] ${complaintTemplate === "RETURN" ? "border border-brand/30 bg-brand/10 text-brand" : "border border-slate-200 bg-white text-slate-600"}`}>Return</button>
                  </div>
                  <textarea value={complaintText} onChange={(e) => setComplaintText(e.target.value)} className={`w-full rounded border px-2 py-1 text-xs font-mono resize-none h-16 ${complaintValidationState.Remarks ? "border-slate-200" : "border-red-300 bg-red-50"}`} placeholder="Required" />
                </div>

                <div className="border-t border-slate-200 pt-2 mt-2">
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
                        complaintSelectionLocked ? "bg-slate-100 border-slate-200 text-slate-600 cursor-not-allowed" :
                        complaintValidationState.District === false ? "border-red-300 bg-red-50" : "border-slate-200 bg-white"
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
                        complaintSelectionLocked ? "bg-slate-100 border-slate-200 text-slate-600 cursor-not-allowed" :
                        complaintValidationState.Tehsil === false ? "border-red-300 bg-red-50" : "border-slate-200 bg-white"
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
                        complaintSelectionLocked ? "bg-slate-100 border-slate-200 text-slate-600 cursor-not-allowed" :
                        complaintValidationState.Location === false ? "border-red-300 bg-red-50" : "border-slate-200 bg-white"
                      }`}
                      disabled={complaintSelectionLocked || !selectedDistrict || !selectedTehsil}
                    >
                      <option value="">Location</option>
                      {complaintLocationOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                  </div>
                  {complaintSelectionLocked ? (
                    <div className="text-[11px] text-emerald-700 bg-emerald-50 rounded px-2 py-1 mb-2">
                      ✓ {selectedDistrict} / {selectedTehsil} / {selectedLocation}
                      <button type="button" className="ml-2 text-slate-400 hover:text-slate-700 underline" onClick={() => setComplaintSelectionLocked(false)}>Change</button>
                    </div>
                  ) : (
                    <div className="text-[11px] text-amber-700 bg-amber-50 rounded px-2 py-1 mb-2">Select district → tehsil → location to complete the complaint</div>
                  )}
                  <input type="text" value={officeSearchQuery} onChange={(e) => setOfficeSearchQuery(e.target.value)} placeholder="Or search location (≥3 chars)" className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs mb-1" autoComplete="off" />
                  {officeSearchResults.length > 0 && !complaintSelectionLocked ? (
                    <div className="max-h-24 overflow-y-auto rounded border border-slate-200 bg-white shadow-sm">
                      {officeSearchResults.slice(0, 8).map((res, i) => (
                        <button key={`${res.location}-${i}`} type="button" onMouseDown={(e) => { e.preventDefault(); setSelectedDistrict(res.district); setSelectedTehsil(res.tehsil); setSelectedLocation(res.location); setOfficeSearchQuery(res.location); setOfficeSearchResults([]); setComplaintSelectionLocked(true); }} className="block w-full text-left px-2 py-1 text-xs hover:bg-slate-100 border-b border-slate-100 last:border-b-0">
                          <span className="font-medium text-slate-800">{res.location}</span> <span className="text-slate-500">({res.tehsil})</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>

                {replyMode === "EMAIL" ? (
                  <div className="border-t border-slate-200 pt-2 mt-2">
                    <label className="text-xs font-medium text-slate-700">
                      <div className="text-[10px] font-medium text-slate-600 mb-0.5">Email</div>
                      <input value={complaintEmail} onChange={(e) => setComplaintEmail(e.target.value)} className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs" placeholder="For email reply" />
                    </label>
                  </div>
                ) : null}

                {complaintSubmitResult?.complaintNumber ? (
                  <div className="border-t border-slate-200 pt-2 mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-2 text-xs text-emerald-800">
                    <div className="font-semibold">✓ Complaint Registered</div>
                    <div>ID: {complaintSubmitResult.complaintNumber}</div>
                    <div>Due: {complaintSubmitResult.dueDate || "-"}</div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="sticky bottom-0 border-t border-slate-200 bg-white px-4 py-2 flex items-center justify-between gap-2">
              <button
                type="button"
                className="rounded border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
                onClick={() => setComplaintRecord(null)}
                disabled={submittingComplaint}
              >
                Close
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleComplaintPreview}
                  disabled={submittingComplaint}
                  className="rounded border border-brand/30 bg-brand/10 px-3 py-1 text-xs text-brand hover:bg-brand/20 disabled:opacity-60"
                >
                  Preview
                </button>
                <button
                  type="button"
                  onClick={submitComplaintInstant}
                  disabled={submittingComplaint || !complaintSubmitReady}
                  title={complaintSubmitReady ? "Ready to submit" : `Missing: ${complaintSubmitMissingFields.join(", ")}`}
                  className="rounded border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                >
                  {submittingComplaint ? "Submitting..." : "Submit"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {complaintPreviewVisible && complaintRecord ? (
        <div className="modal-wrapper bg-slate-950/50 p-2 z-50">
          <div className="modal-content w-full max-w-3xl rounded-lg bg-white shadow-2xl max-h-[95vh] flex flex-col overflow-hidden">
            <div className="modal-header border-b border-slate-200 px-4 py-2 flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-900">Preview & Confirm Submission</div>
              <button
                type="button"
                className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                onClick={() => setComplaintPreviewVisible(false)}
              >
                Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              <div className="grid gap-2">
                <div className="grid grid-cols-4 gap-2">
                  <div className={`rounded border p-2 text-xs ${complaintValidationState.ArticleNo ? "border-slate-200" : "border-red-300 bg-red-50"}`}>
                    <div className="text-[10px] font-medium text-slate-500">Article No</div>
                    <div className={`mt-0.5 font-semibold text-sm ${complaintValidationState.ArticleNo ? "text-slate-900" : "text-red-900"}`}>
                      {complaintRecord.shipment.trackingNumber || "MISSING"}
                    </div>
                  </div>
                  <div className={`rounded border p-2 text-xs ${complaintValidationState.SenderName ? "border-slate-200" : "border-red-300 bg-red-50"}`}>
                    <div className="text-[10px] font-medium text-slate-500">Service Type</div>
                    <div className={`mt-0.5 font-semibold text-sm ${complaintValidationState.SenderName ? "text-slate-900" : "text-red-900"}`}>
                      {detectServiceType(complaintRecord.shipment.trackingNumber)}
                    </div>
                  </div>
                  <div className={`rounded border p-2 text-xs ${complaintValidationState.Mobile ? "border-slate-200" : "border-red-300 bg-red-50"}`}>
                    <div className="text-[10px] font-medium text-slate-500">Mobile</div>
                    <div className={`mt-0.5 font-semibold text-sm ${complaintValidationState.Mobile ? "text-slate-900" : "text-red-900"}`}>
                      {complaintPhone.trim() || "MISSING"}
                    </div>
                  </div>
                  <div className="rounded border border-slate-200 p-2 text-xs">
                    <div className="text-[10px] font-medium text-slate-500">Reply Mode</div>
                    <div className="mt-0.5 font-semibold text-sm text-slate-900">{replyMode}</div>
                  </div>
                </div>

                <div className={`rounded border p-2 text-xs ${complaintValidationState.SenderName ? "border-slate-200" : "border-red-300 bg-red-50"}`}>
                  <div className="text-[10px] font-medium text-slate-500 mb-0.5">Complainant Name</div>
                  <div className={`font-semibold text-sm ${complaintValidationState.SenderName ? "text-slate-900" : "text-red-900"}`}>
                    {senderNameInput.trim() || "MISSING"}
                  </div>
                </div>

                <div className="border-t border-slate-200 pt-2 mt-2">
                  <div className="text-xs font-semibold text-slate-800 mb-1">Sender Detail</div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className={`rounded border p-2 text-xs ${complaintValidationState.SenderName ? "border-slate-200" : "border-red-300 bg-red-50"}`}>
                      <div className="text-[10px] font-medium text-slate-500">Name</div>
                      <div className={`mt-0.5 font-semibold text-sm ${complaintValidationState.SenderName ? "text-slate-900" : "text-red-900"}`}>
                        {senderNameInput.trim() || "MISSING"}
                      </div>
                    </div>
                    <div className={`rounded border p-2 text-xs ${complaintValidationState.SenderCity ? "border-slate-200" : "border-red-300 bg-red-50"}`}>
                      <div className="text-[10px] font-medium text-slate-500">Address</div>
                      <div className={`mt-0.5 font-semibold text-sm ${complaintValidationState.SenderAddress ? "text-slate-900" : "text-red-900"}`}>
                        {senderAddressInput.trim() || "MISSING"}
                      </div>
                    </div>
                    <div className="rounded border border-slate-200 p-2 text-xs">
                      <div className="text-[10px] font-medium text-slate-500">City</div>
                      <div className={`mt-0.5 font-semibold text-sm ${complaintValidationState.SenderCity ? "text-slate-900" : "text-red-900"}`}>
                        {senderCityValue.trim() || "MISSING"}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-200 pt-2 mt-2">
                  <div className="text-xs font-semibold text-slate-800 mb-1">Addressee Detail</div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className={`rounded border p-2 text-xs ${complaintValidationState.ReceiverName ? "border-slate-200" : "border-red-300 bg-red-50"}`}>
                      <div className="text-[10px] font-medium text-slate-500">Name</div>
                      <div className={`mt-0.5 font-semibold text-sm ${complaintValidationState.ReceiverName ? "text-slate-900" : "text-red-900"}`}>
                        {receiverNameInput.trim() || "MISSING"}
                      </div>
                    </div>
                    <div className={`rounded border p-2 text-xs ${complaintValidationState.ReceiverCity ? "border-slate-200" : "border-red-300 bg-red-50"}`}>
                      <div className="text-[10px] font-medium text-slate-500">Address</div>
                      <div className={`mt-0.5 font-semibold text-sm ${complaintValidationState.ReceiverAddress ? "text-slate-900" : "text-red-900"}`}>
                        {receiverAddressInput.trim() || "MISSING"}
                      </div>
                    </div>
                    <div className="rounded border border-slate-200 p-2 text-xs">
                      <div className="text-[10px] font-medium text-slate-500">City</div>
                      <div className={`mt-0.5 font-semibold text-sm ${complaintValidationState.ReceiverCity ? "text-slate-900" : "text-red-900"}`}>
                        {receiverCityValue.trim() || "MISSING"}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-200 pt-2 mt-2">
                  <div className="text-xs font-semibold text-slate-800 mb-1">Remarks <span className="text-red-600">*</span></div>
                  <div className={`rounded border p-2 text-xs ${complaintValidationState.Remarks ? "border-slate-200 bg-slate-50" : "border-red-300 bg-red-50"}`}>
                    <div className="font-mono text-xs whitespace-pre-wrap max-h-12 overflow-hidden">
                      <span className={complaintValidationState.Remarks ? "text-slate-700" : "text-red-900"}>
                        {complaintText.trim() || "MISSING - MANDATORY FOR SUBMISSION"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-200 pt-2 mt-2">
                  <div className="text-xs font-semibold text-slate-800 mb-1">Location (District/Tehsil)</div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="rounded border border-slate-200 p-2">
                      <div className="text-[10px] font-medium text-slate-500 mb-0.5">District</div>
                      <div className="font-semibold text-sm text-slate-900">{selectedDistrict || "Not selected"}</div>
                    </div>
                    <div className="rounded border border-slate-200 p-2">
                      <div className="text-[10px] font-medium text-slate-500 mb-0.5">Tehsil</div>
                      <div className="font-semibold text-sm text-slate-900">{selectedTehsil || "Not selected"}</div>
                    </div>
                    <div className="rounded border border-slate-200 p-2">
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
                className="rounded border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
                onClick={() => setComplaintPreviewVisible(false)}
                disabled={submittingComplaint}
              >
                Back to Edit
              </button>
              <button
                type="button"
                onClick={handleComplaintSubmitFromPreview}
                disabled={submittingComplaint || Object.values(complaintValidationState).some(v => !v)}
                className="rounded border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
              >
                {submittingComplaint ? "Submitting..." : "Confirm & Submit"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {selectedTracking && trackingDetailData ? (
        <div className="modal-wrapper bg-slate-950/55 p-4">
          <div id="tracking-popup-print-root" className="modal-content w-full max-w-4xl rounded-2xl bg-white shadow-2xl">
            <div className="modal-header flex items-center justify-between border-b px-6 py-4">
              <div>
                <div className="text-lg font-semibold text-slate-900">Tracking Detail</div>
                <div className="text-xs text-slate-500">{selectedTracking.shipment.trackingNumber}</div>
              </div>
              <div className="no-print flex items-center gap-2">
                <button
                  type="button"
                  onClick={printShipmentPdf}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Printer className="h-3.5 w-3.5" /> Print PDF
                </button>
                <button
                  type="button"
                  onClick={sendToCustomerWhatsapp}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Send to Customer
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedTracking(null)}
                  className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-dark"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="p-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="rounded-xl border border-slate-200 p-3"><div className="text-[11px] text-slate-500">Tracking ID</div><div className="mt-1 font-mono text-sm font-semibold text-slate-900">{selectedTracking.shipment.trackingNumber}</div></div>
                <div className="rounded-xl border border-slate-200 p-3"><div className="text-[11px] text-slate-500">Booking Date</div><div className="mt-1 text-sm font-semibold text-slate-900">{trackingDetailData.bookingDate}</div></div>
                <div className="rounded-xl border border-slate-200 p-3"><div className="text-[11px] text-slate-500">Last Update</div><div className="mt-1 text-sm font-semibold text-slate-900">{trackingDetailData.lastUpdate}</div></div>
                <div className="rounded-xl border border-slate-200 p-3"><div className="text-[11px] text-slate-500">Status</div><div className={cn("mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1", statusBadgeClass(selectedTracking.final_status))}>{normalizeStatus(selectedTracking.final_status)}</div></div>
                <div className="rounded-xl border border-slate-200 p-3"><div className="text-[11px] text-slate-500">City / Destination</div><div className="mt-1 text-sm font-semibold text-slate-900">{preferredCity(selectedTracking.shipment) || trackingDetailData.fields.consigneeCity || "-"}</div></div>
                <div className="rounded-xl border border-slate-200 p-3"><div className="text-[11px] text-slate-500">MO Value</div><div className="mt-1 text-sm font-semibold text-slate-900">{trackingDetailData.moValue != null ? `Rs ${trackingDetailData.moValue.toLocaleString()}` : "–"}</div></div>
                <div className="rounded-xl border border-slate-200 p-3"><div className="text-[11px] text-slate-500">Booking City</div><div className="mt-1 text-sm font-semibold text-slate-900">{trackingDetailData.bookingOffice}</div></div>
                <div className="rounded-xl border border-slate-200 p-3"><div className="text-[11px] text-slate-500">Delivery City</div><div className="mt-1 text-sm font-semibold text-slate-900">{trackingDetailData.deliveryOffice}</div></div>
                <div className="rounded-xl border border-slate-200 p-3"><div className="text-[11px] text-slate-500">Consignee Name</div><div className="mt-1 text-sm font-semibold text-slate-900">{trackingDetailData.consigneeName}</div></div>
                <div className="rounded-xl border border-slate-200 p-3"><div className="text-[11px] text-slate-500">Consignee Address</div><div className="mt-1 text-sm font-semibold text-slate-900">{trackingDetailData.consigneeAddress}</div></div>
                <div className="rounded-xl border border-slate-200 p-3"><div className="text-[11px] text-slate-500">Consignee Phone</div><div className="mt-1 text-sm font-semibold text-slate-900">{trackingDetailData.consigneePhone}</div></div>
                <div className="rounded-xl border border-slate-200 p-3 sm:col-span-2"><div className="text-[11px] text-slate-500">MO Issued Number</div><div className="mt-1 text-sm font-semibold text-slate-900">{trackingDetailData.moIssued ?? "–"}</div></div>
              </div>

              <div className="mt-6">
                <div className="text-sm font-semibold text-slate-900">Status History</div>
                <div className="mt-3 space-y-3">
                  {trackingDetailData.timeline.length > 0 ? (
                    trackingDetailData.timeline.map((item, idx) => (
                      <div key={`${item.date}-${item.time}-${idx}`} className="flex gap-3 rounded-xl border border-slate-200 p-3">
                        <div className="mt-1 h-2.5 w-2.5 rounded-full bg-brand" />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold text-slate-800">{item.description || "Update"}</div>
                          <div className="mt-0.5 text-[11px] text-slate-500">{[item.date, item.time, item.location].filter(Boolean).join(" | ") || "No timestamp"}</div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-xl border border-slate-200 p-3 text-xs text-slate-500">No status history available.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

    </div>
      <div id="print-area" aria-hidden="true" />
    </>
  );
}



