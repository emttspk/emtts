import type { Shipment, TrackingLifecycle } from "./types";

export type StatusCardFilter = "ALL" | "DELIVERED" | "PENDING" | "RETURNED" | "DELAYED";

type TrackingEvent = {
  date: string;
  time: string;
  location: string;
  description: string;
  timestamp: number | null;
};

export type FinalTrackingRecord = {
  shipment: Shipment;
  final_status: string;
  delayed: boolean;
  last_event_at: number;
  amount: number;
  complaint_enabled: boolean;
};

export type TrackingStats = {
  total: number;
  delivered: number;
  pending: number;
  returned: number;
  delayed: number;
  totalAmount: number;
  deliveredAmount: number;
  pendingAmount: number;
  returnedAmount: number;
  delayedAmount: number;
};

const DELAY_THRESHOLD_MS = 72 * 60 * 60 * 1000;
const DELAY_MAX_WINDOW_MS = 120 * 60 * 60 * 1000;

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function parseRaw(rawJson?: string | null): Record<string, unknown> {
  if (!rawJson) return {};
  try {
    const parsed = JSON.parse(rawJson);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function parseMoney(value: unknown): number {
  const raw = text(value);
  if (!raw) return 0;
  const match = raw.match(/[\d,]+(?:\.\d+)?/);
  const num = Number((match ? match[0] : raw).replace(/,/g, ""));
  return Number.isFinite(num) ? num : 0;
}

function statusFromRaw(raw: Record<string, unknown>, shipmentStatus?: string | null): string {
  const manualOverride = Boolean(raw.manual_override);
  const manualStatus = text(raw.manual_status || shipmentStatus).toUpperCase();
  if (manualOverride && manualStatus) {
    return manualStatus;
  }

  const manualPendingOverride = Boolean(raw.manual_pending_override);
  if (manualPendingOverride && text(shipmentStatus).toUpperCase() === "PENDING") {
    return "PENDING";
  }
  return (
    text(raw.final_status) ||
    text(raw.system_status) ||
    text(raw.System_Status) ||
    text(shipmentStatus) ||
    "PENDING"
  );
}

function normalizeFinalStatus(status: string): string {
  const upper = text(status).toUpperCase();
  if (upper === "DELIVERED WITH PAYMENT") return "DELIVERED WITH PAYMENT";
  if (upper.includes("DELIVER")) return "DELIVERED";
  if (upper.includes("RETURN")) return "RETURNED";
  if (upper.includes("PENDING")) return "PENDING";
  return "PENDING";
}

function toTimestampMs(dateRaw: string, timeRaw: string): number | null {
  const date = text(dateRaw);
  if (!date) return null;
  const time = text(timeRaw) || "00:00";
  const d = new Date(`${date} ${time}`);
  if (!Number.isFinite(d.getTime())) return null;
  return d.getTime();
}

function extractTrackingEvents(raw: Record<string, unknown>): TrackingEvent[] {
  const tracking = raw.tracking as Record<string, unknown> | undefined;
  const events = (tracking?.events as Array<Record<string, unknown>> | undefined) ?? (raw.events as Array<Record<string, unknown>> | undefined);
  if (Array.isArray(events) && events.length > 0) {
    return events
      .map((event) => {
        const date = text(event?.date);
        const time = text(event?.time) || "00:00";
        const location = text(event?.location ?? event?.city);
        const description = text(event?.description ?? event?.detail ?? event?.status);
        return {
          date,
          time,
          location,
          description,
          timestamp: toTimestampMs(date, time),
        };
      })
      .filter((event) => event.date || event.time || event.location || event.description)
      .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
  }

  const history = (tracking?.history as Array<unknown> | undefined) ?? (raw.history as Array<unknown> | undefined) ?? [];
  if (!Array.isArray(history)) return [];
  return history
    .map((item): TrackingEvent => {
      if (Array.isArray(item)) {
        const date = text(item[0]);
        const time = text(item[1]) || "00:00";
        const description = text(item[2]);
        const location = text(item[3]);
        return { date, time, location, description, timestamp: toTimestampMs(date, time) };
      }

      if (item && typeof item === "object") {
        const event = item as Record<string, unknown>;
        const date = text(event.date ?? event.latest_date);
        const time = text(event.time ?? event.latest_time) || "00:00";
        const location = text(event.location ?? event.city);
        const description = text(event.description ?? event.detail ?? event.status);
        return { date, time, location, description, timestamp: toTimestampMs(date, time) };
      }

      return { date: "", time: "00:00", location: "", description: text(item), timestamp: null };
    })
    .filter((event) => event.date || event.time || event.location || event.description)
    .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
}

function normalizeOffice(value: string): string {
  return text(value)
    .toUpperCase()
    .replace(/POST OFFICE/g, "")
    .replace(/DELIVERY OFFICE/g, "")
    .replace(/\bGPO\b/g, "")
    .replace(/\bDMO\b/g, "")
    .replace(/\bDPO\b/g, "")
    .replace(/\bOFFICE\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function bookingOfficeFromRaw(raw: Record<string, unknown>, shipment: Shipment, events: TrackingEvent[]): string {
  const tracking = raw.tracking as Record<string, unknown> | undefined;
  const explicit = text(
    tracking?.booking_office ??
    raw.booking_office ??
    raw.Booking_Office ??
    raw.bookingOffice ??
    raw.senderCity ??
    shipment.city,
  );
  if (explicit) return explicit;
  return text(events[0]?.location);
}

function isSameOffice(left: string, right: string): boolean {
  const normalizedLeft = normalizeOffice(left);
  const normalizedRight = normalizeOffice(right);
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
}

function isBookingDmoLocation(location: string, bookingOffice: string): boolean {
  const upperLocation = text(location).toUpperCase();
  const normalizedLocation = normalizeOffice(location);
  const normalizedBooking = normalizeOffice(bookingOffice);
  return Boolean(
    upperLocation.includes("DMO") &&
    normalizedLocation &&
    normalizedBooking &&
    normalizedLocation.includes(normalizedBooking),
  );
}

function isReturnedToOrigin(lastEvent: TrackingEvent | null, bookingOffice: string): boolean {
  if (!lastEvent) return false;
  const description = text(lastEvent.description).toLowerCase();
  const bookingOfficeLower = text(bookingOffice).toLowerCase();
  const atBookingOffice = isSameOffice(lastEvent.location, bookingOffice);
  const atBookingDmo = isBookingDmoLocation(lastEvent.location, bookingOffice);
  const explicitDelivered =
    description.includes("delivered to sender") ||
    description.includes("delivered at booking office") ||
    (bookingOfficeLower.length > 0 && description.includes(`delivered at ${bookingOfficeLower}`));
  if (explicitDelivered) return true;

  const receiptOnlyAtOrigin =
    (atBookingOffice || atBookingDmo) &&
    /(received|arrival|arrived)/.test(description) &&
    !description.includes("delivered");
  if (receiptOnlyAtOrigin) return false;

  const movementOnly = /(dispatch|dispatched|sent|received|arrival|arrived|in transit|return to sender|returned to sender)/.test(description);
  return (atBookingOffice || atBookingDmo) && !movementOnly;
}

function isReturnFinalizedEvent(description: string): boolean {
  const d = text(description).toLowerCase();
  return (
    d.includes("delivered to sender") ||
    d.includes("returned to booking office") ||
    d.includes("received at booking dmo after return")
  );
}

function hasForwardAndReverseFlow(events: TrackingEvent[]): boolean {
  if (events.length === 0) return false;
  let forwardStage = 0;
  let reverseStage = 0;

  for (const ev of events) {
    const blob = `${text(ev.location)} ${text(ev.description)}`.toLowerCase();
    const isBooking = blob.includes("booking") || blob.includes("booked");
    const isDmo = blob.includes("dmo") || blob.includes("dispatch") || blob.includes("received at") || blob.includes("arrived at");
    const isDelivery = blob.includes("delivery") || blob.includes("out for delivery") || blob.includes("delivery office");

    if (forwardStage === 0 && isBooking) {
      forwardStage = 1;
      continue;
    }
    if (forwardStage === 1 && isDmo) {
      forwardStage = 2;
      continue;
    }
    if (forwardStage === 2 && isDelivery) {
      forwardStage = 3;
      continue;
    }

    if (forwardStage >= 3) {
      if (reverseStage === 0 && isDelivery) {
        reverseStage = 1;
        continue;
      }
      if (reverseStage === 1 && isDmo) {
        reverseStage = 2;
        continue;
      }
      if (reverseStage === 2 && isBooking) {
        reverseStage = 3;
        break;
      }
    }
  }

  return forwardStage >= 3 && reverseStage >= 3;
}

function bookingAgeDays(shipment: Shipment, events: TrackingEvent[]): number {
  if (typeof shipment.daysPassed === "number" && Number.isFinite(shipment.daysPassed)) {
    return shipment.daysPassed;
  }
  const firstTimestamp = events.find((event) => event.timestamp != null)?.timestamp;
  if (firstTimestamp != null) {
    return Math.max(0, Math.floor((Date.now() - firstTimestamp) / (1000 * 60 * 60 * 24)));
  }
  const createdAt = new Date(shipment.createdAt).getTime();
  if (Number.isFinite(createdAt)) {
    return Math.max(0, Math.floor((Date.now() - createdAt) / (1000 * 60 * 60 * 24)));
  }
  return 0;
}

function parseDueDateToTs(input: string): number | null {
  const value = text(input);
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

function hasActiveComplaint(shipment: Shipment): boolean {
  const status = text(shipment.complaintStatus).toUpperCase();
  if (status !== "FILED") return false;
  const blob = text(shipment.complaintText);
  const id = blob.match(/COMPLAINT_ID\s*:\s*([A-Z0-9\-]+)/i)?.[1]
    ?? blob.match(/Complaint\s*ID\s*([A-Z0-9\-]+)/i)?.[1]
    ?? "";
  if (!id) return false;

  const due = blob.match(/DUE_DATE\s*:\s*([^\n|]+)/i)?.[1]
    ?? blob.match(/Due\s*Date\s*(?:on)?\s*([0-3]?\d\/[0-1]?\d\/\d{4}|\d{4}-\d{1,2}-\d{1,2})/i)?.[1]
    ?? "";
  const dueTs = parseDueDateToTs(String(due).trim());
  if (dueTs == null) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return dueTs >= today.getTime();
}

function deriveFinalStatus(baseStatus: string, raw: Record<string, unknown>, _shipment: Shipment): string {
  if (Boolean(raw.manual_override)) {
    return normalizeFinalStatus(text(raw.manual_status || baseStatus));
  }

  const events = extractTrackingEvents(raw);
  const sortedDesc = [...events].sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
  const latestEvent = sortedDesc[0] ?? null;
  const sortedAsc = [...events].sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
  const hasReturnFlow = hasForwardAndReverseFlow(sortedAsc);

  // Latest valid return event + reverse flow confirmation is required for RETURNED.
  if (latestEvent && isReturnFinalizedEvent(text(latestEvent.description)) && hasReturnFlow) {
    return "RETURNED";
  }

  if (baseStatus === "RETURNED" && (!latestEvent || !isReturnFinalizedEvent(text(latestEvent.description)) || !hasReturnFlow)) {
    return "PENDING";
  }

  return baseStatus;
}

function deriveComplaintEnabled(finalStatus: string, raw: Record<string, unknown>, shipment: Shipment): boolean {
  const manualPendingOverride =
    Boolean(raw.manual_override) &&
    text(raw.manual_status).toUpperCase() === "PENDING";
  if (manualPendingOverride) return true;
  if (finalStatus !== "PENDING") return false;
  return !hasActiveComplaint(shipment);
}

function getLastEventAt(raw: Record<string, unknown>, shipment: Shipment): number {
  const tracking = raw.tracking as Record<string, unknown> | undefined;
  const events = (tracking?.events as Array<Record<string, unknown>> | undefined) ?? (raw.events as Array<Record<string, unknown>> | undefined) ?? [];
  let latest = 0;

  if (Array.isArray(events)) {
    for (const ev of events) {
      const ts = toTimestampMs(text(ev?.date), text(ev?.time));
      if (ts && ts > latest) latest = ts;
    }
  }

  if (latest > 0) return latest;

  const fromLatest = toTimestampMs(text(shipment.latestDate), text(shipment.latestTime));
  if (fromLatest) return fromLatest;

  const fromUpdated = new Date(shipment.updatedAt).getTime();
  return Number.isFinite(fromUpdated) ? fromUpdated : Date.now();
}

export function getFinalTrackingData(records: Shipment[], nowMs = Date.now()): FinalTrackingRecord[] {
  return records.map((shipment) => {
    const raw = parseRaw(shipment.rawJson);
    const baseStatus = normalizeFinalStatus(statusFromRaw(raw, shipment.status));
    const finalStatus = deriveFinalStatus(baseStatus, raw, shipment);
    const lastEventAt = getLastEventAt(raw, shipment);
    const ageMs = nowMs - lastEventAt;
    const delayed = ageMs > DELAY_THRESHOLD_MS && ageMs <= DELAY_MAX_WINDOW_MS && finalStatus.includes("PENDING");
    const complaintEnabled = deriveComplaintEnabled(finalStatus, raw, shipment);

    const amount = parseMoney(
      raw.CollectAmount ??
      raw.collectAmount ??
      raw.collect_amount ??
      raw.collected_amount,
    );

    return {
      shipment,
      final_status: finalStatus,
      delayed,
      last_event_at: lastEventAt,
      amount,
      complaint_enabled: complaintEnabled,
    };
  });
}

export function sortFinalTrackingData(records: FinalTrackingRecord[]): FinalTrackingRecord[] {
  return [...records]
    .map((record, index) => {
      const raw = parseRaw(record.shipment.rawJson);
      const uploadSequence = Number(raw.upload_sequence ?? raw.uploadSequence ?? 0);
      const createdAt = new Date(record.shipment.createdAt).getTime();
      return {
        record,
        index,
        uploadSequence: Number.isFinite(uploadSequence) && uploadSequence > 0 ? uploadSequence : Number.POSITIVE_INFINITY,
        createdAt: Number.isFinite(createdAt) ? createdAt : Number.POSITIVE_INFINITY,
      };
    })
    .sort((a, b) => {
      if (a.uploadSequence !== b.uploadSequence) return a.uploadSequence - b.uploadSequence;
      if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
      return a.index - b.index;
    })
    .map((item) => item.record);
}

export function filterFinalTrackingData(records: FinalTrackingRecord[], filter: StatusCardFilter): FinalTrackingRecord[] {
  if (filter === "ALL") return records;
  if (filter === "DELAYED") return records.filter((r) => r.delayed);
  if (filter === "DELIVERED") return records.filter((r) => r.final_status === "DELIVERED" || r.final_status === "DELIVERED WITH PAYMENT");
  if (filter === "RETURNED") return records.filter((r) => r.final_status === "RETURNED");
  return records.filter((r) => r.final_status.includes("PENDING"));
}

export function computeStats(records: FinalTrackingRecord[]): TrackingStats {
  let delivered = 0;
  let pending = 0;
  let returned = 0;
  let delayed = 0;

  let totalAmount = 0;
  let deliveredAmount = 0;
  let pendingAmount = 0;
  let returnedAmount = 0;
  let delayedAmount = 0;

  for (const row of records) {
    const status = row.final_status;
    const amount = row.amount;
    totalAmount += amount;

    if (status === "DELIVERED" || status === "DELIVERED WITH PAYMENT") {
      delivered += 1;
      deliveredAmount += amount;
    } else if (status === "RETURNED") {
      returned += 1;
      returnedAmount += amount;
    } else if (status.includes("PENDING")) {
      pending += 1;
      pendingAmount += amount;
    }

    if (row.delayed) {
      delayed += 1;
      delayedAmount += amount;
    }
  }

  return {
    total: records.length,
    delivered,
    pending,
    returned,
    delayed,
    totalAmount,
    deliveredAmount,
    pendingAmount,
    returnedAmount,
    delayedAmount,
  };
}

// ─── Shared display helpers ───────────────────────────────────────────────────
// Used by both PublicTracking (live Python API) and BulkTracking (dashboard DB).
// Handles both raw Python API status strings (IN_TRANSIT, AT_HUB, etc.) and
// normalized dashboard statuses (DELIVERED, RETURNED, PENDING).

const TRACKING_STAGE_LABELS = [
  "Booked",
  "In Transit",
  "At Hub",
  "Out for Delivery",
  "Delivered",
] as const;

export type TrackingStageLabel = (typeof TRACKING_STAGE_LABELS)[number];

export type TrackingDisplayEventInput = {
  date?: string | null;
  time?: string | null;
  location?: string | null;
  description?: string | null;
};

export type TrackingPresentationEvent = {
  date: string;
  time: string;
  location: string;
  description: string;
  timestamp: number | null;
  stageLabel: string;
};

export type TrackingPresentationModel = {
  displayStatus: string;
  progress: number;
  activeStage: number;
  stageLabels: string[];
  latestEvent: TrackingPresentationEvent | null;
  timeline: TrackingPresentationEvent[];
  showMoneyOrderPanel: boolean;
  moneyOrderNumber: string;
  moneyOrderStatusLabel: string | null;
};

export const SHARED_STAGE_LABELS = TRACKING_STAGE_LABELS;

const RETURN_STAGE_LABELS = [
  "Booked",
  "In Transit",
  "Out for Delivery",
  "Failed Delivery",
  "Return In Transit",
  "Return Pending at Booking City",
  "Returned to Sender",
] as const;

const FAILURE_STAGE_LABELS = [
  "Booked",
  "In Transit",
  "Out for Delivery",
  "Failed Delivery",
] as const;

const RE_ROUTED_STAGE_LABELS = [
  "Booked",
  "In Transit",
  "Out for Delivery",
  "Failed Delivery",
  "Re-routed in Transit",
] as const;

function lifecycleState(status: string, lifecycle?: TrackingLifecycle | null): string {
  return text(lifecycle?.underlying_status || lifecycle?.normalized_status || status).toUpperCase();
}

function isReturnLifecycleState(state: string): boolean {
  return ["RTS", "RETURN_IN_TRANSIT", "RETURN_PENDING_AT_BOOKING_CITY", "RETURNED"].includes(state);
}

function resolveMoneyOrderTypeLabel(lifecycle?: TrackingLifecycle | null): string {
  const moneyOrderNumber = text(lifecycle?.money_order_number).toUpperCase();
  if (/^(MOS|UMO|FMO)/.test(moneyOrderNumber)) return moneyOrderNumber.slice(0, 3);
  return "Payment";
}

function resolveMoneyOrderDisplay(lifecycle?: TrackingLifecycle | null): {
  showMoneyOrderPanel: boolean;
  moneyOrderNumber: string;
  moneyOrderStatusLabel: string | null;
} {
  const moneyOrderStatus = text(lifecycle?.money_order_status).toUpperCase();
  const state = lifecycleState("", lifecycle);
  if (!lifecycle || !moneyOrderStatus || moneyOrderStatus === "NOT_REQUIRED" || isReturnLifecycleState(state)) {
    return {
      showMoneyOrderPanel: false,
      moneyOrderNumber: text(lifecycle?.money_order_number),
      moneyOrderStatusLabel: null,
    };
  }

  const typeLabel = resolveMoneyOrderTypeLabel(lifecycle);
  const pendingLabel = typeLabel === "Payment" ? "Payment Pending" : `${typeLabel} Pending`;
  const settledLabel = typeLabel === "Payment" ? "Payment Settled" : `${typeLabel} Settled`;

  return {
    showMoneyOrderPanel: true,
    moneyOrderNumber: text(lifecycle?.money_order_number),
    moneyOrderStatusLabel: moneyOrderStatus === "COMPLETED" ? settledLabel : pendingLabel,
  };
}

function resolveStageModel(status: string, lifecycle?: TrackingLifecycle | null): { activeStage: number; stageLabels: string[] } {
  const state = lifecycleState(status, lifecycle);
  const moneyOrderStatus = text(lifecycle?.money_order_status).toUpperCase();
  const latestDescription = text(lifecycle?.latest_event?.description).toLowerCase();
  const hasDeliveredToAddressee = latestDescription.includes("delivered") && latestDescription.includes("addresse");

  if (isReturnLifecycleState(state)) {
    if (state === "RETURNED") return { activeStage: 6, stageLabels: [...RETURN_STAGE_LABELS] };
    if (state === "RETURN_PENDING_AT_BOOKING_CITY") return { activeStage: 5, stageLabels: [...RETURN_STAGE_LABELS] };
    return { activeStage: 4, stageLabels: [...RETURN_STAGE_LABELS] };
  }

  if (state === "RE_ROUTED_IN_TRANSIT") {
    return { activeStage: 4, stageLabels: [...RE_ROUTED_STAGE_LABELS] };
  }

  if (state === "FAILED_DELIVERY" || state === "FAILED_DELIVERY_PENDING") {
    return { activeStage: 3, stageLabels: [...FAILURE_STAGE_LABELS] };
  }

  if (moneyOrderStatus && moneyOrderStatus !== "NOT_REQUIRED") {
    const typeLabel = resolveMoneyOrderTypeLabel(lifecycle);
    const pendingLabel = typeLabel === "Payment" ? "Payment Pending" : `${typeLabel} Pending`;
    const settledLabel = typeLabel === "Payment" ? "Payment Settled" : `${typeLabel} Settled`;
    const stageLabels = ["Booked", "In Transit", "Out for Delivery", "Delivered", pendingLabel, settledLabel];

    if (moneyOrderStatus === "COMPLETED") {
      return { activeStage: 5, stageLabels };
    }
    if (state === "DELIVERED" || hasDeliveredToAddressee) {
      return { activeStage: 4, stageLabels };
    }
    if (state === "OUT_FOR_DELIVERY") {
      return { activeStage: 2, stageLabels };
    }
    if (state === "BOOKED") {
      return { activeStage: 0, stageLabels };
    }
    return { activeStage: 1, stageLabels };
  }

  if (state === "BOOKED") return { activeStage: 0, stageLabels: [...TRACKING_STAGE_LABELS] };
  if (["IN_TRANSIT", "PENDING"].includes(state)) return { activeStage: 1, stageLabels: [...TRACKING_STAGE_LABELS] };
  if (["IN_TRANSIT_TO_DELIVERY_OFFICE", "AT_HUB"].includes(state)) return { activeStage: 2, stageLabels: [...TRACKING_STAGE_LABELS] };
  if (state === "OUT_FOR_DELIVERY") return { activeStage: 3, stageLabels: [...TRACKING_STAGE_LABELS] };
  return { activeStage: 4, stageLabels: [...TRACKING_STAGE_LABELS] };
}

export function getStatusDisplayColor(status: string): string {
  const s = String(status ?? "").toLowerCase();
  if (s.includes("deliver")) return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (s.includes("return")) return "bg-red-50 text-red-700 border-red-200";
  if (s === "rts") return "bg-red-50 text-red-700 border-red-200";
  if (s.includes("failed")) return "bg-rose-50 text-rose-700 border-rose-200";
  if (s.includes("stuck")) return "bg-orange-50 text-orange-700 border-orange-200";
  if (s.includes("transit") || s.includes("in_transit") || s.includes("pending")) {
    return "bg-amber-50 text-amber-700 border-amber-200";
  }
  if (s.includes("hub") || s.includes("at_hub")) return "bg-sky-50 text-sky-700 border-sky-200";
  if (s.includes("out_for_delivery") || s.includes("out for delivery")) {
    return "bg-purple-50 text-purple-700 border-purple-200";
  }
  return "bg-sky-50 text-sky-700 border-sky-200";
}

/**
 * Returns a string key identifying which icon to render.
 * Callers map this to their icon library (Lucide, etc.).
 * Values: "check_circle" | "alert_circle" | "clock" | "map_pin" | "truck"
 */
export function getStatusIconName(status: string): "check_circle" | "alert_circle" | "clock" | "map_pin" | "truck" {
  const s = String(status ?? "").toLowerCase();
  if (s.includes("deliver")) return "check_circle";
  if (s.includes("return")) return "alert_circle";
  if (s === "rts" || s.includes("failed")) return "alert_circle";
  if (s.includes("out_for_delivery") || s.includes("out for delivery")) return "truck";
  if (s.includes("hub") || s.includes("at_hub")) return "map_pin";
  return "clock";
}

export function getStatusStageIndex(status: string): number {
  const s = String(status ?? "").toLowerCase();
  if (s.includes("deliver")) return 4;
  if (s.includes("return") || s === "rts") return 4;
  if (s.includes("failed")) return 3;
  if (s.includes("stuck")) {
    if (s.includes("hub")) return 2;
    if (s.includes("delivery")) return 3;
    return 1;
  }
  if (s.includes("out_for_delivery") || s.includes("out for delivery")) return 3;
  if (s.includes("hub") || s.includes("at_hub") || s.includes("dispatch")) return 2;
  if (s.includes("transit") || s.includes("in_transit") || s.includes("pending")) return 1;
  return 0;
}

export function getEventBadgeLabel(description: string): string {
  const t = String(description ?? "").toLowerCase();
  if (!t) return "Booked";

  // Return completion (check before delivery to avoid false-positive match)
  if (
    t.includes("delivered to sender") ||
    t.includes("returned to booking office") ||
    t.includes("received at booking dmo after return") ||
    t.includes("to rts")
  ) return "Returned to Sender";

  const hasMoneyOrderSignal = /\b(?:mos|umo|fmo|money order)\b/i.test(t);

  if (
    hasMoneyOrderSignal && (
      t.includes("payment settled") ||
      (t.includes("delivered") && t.includes("to addresse"))
    )
  ) return "Payment Settled";

  if (hasMoneyOrderSignal && (t.includes("sent out for delivery") || t.includes("out for delivery"))) {
    return "Out for Delivery";
  }

  if (hasMoneyOrderSignal && (t.includes("dispatch") || t.includes("movement") || t.includes("in transit"))) {
    return "In Transit";
  }

  if (hasMoneyOrderSignal && (t.includes("booked") || t.includes("booking"))) {
    return "Booked";
  }

  if (
    (t.includes("arrival") || t.includes("arrived") || t.includes("received at")) &&
    t.includes("delivery office") &&
    (t.includes("return") || t.includes("rts") || t.includes("booking"))
  ) return "Return Pending at Booking City";

  // Explicit delivery to addressee only (not to delivery office)
  if (
    t === "delivered" ||
    t.includes("delivered to addressee") ||
    (t.includes("delivered") && t.includes("to addresse"))
  ) return "Delivered";

  // Failed / undelivered
  if (
    t.includes("undelivered") ||
    t.includes("refused") ||
    (t.includes("not found") && t.includes("address")) ||
    t.includes("failed delivery")
  ) return "Failed Delivery";

  // Out for delivery
  if (t.includes("sent out for delivery") || t.includes("out for delivery")) return "Out for Delivery";

  // Return in transit (return dispatch movements)
  if (
    (t.includes("return") && t.includes("dispatch")) ||
    (t.includes("return") && t.includes("transit")) ||
    (t.includes("dispatch") && t.includes("rts")) ||
    t.includes("return to sender") ||
    t.includes("returned to sender")
  ) return "Return In Transit";

  if (
    (t.includes("arrival") || t.includes("arrived") || t.includes("received at")) &&
    t.includes("delivery office")
  ) return "In Transit";

  // Standard dispatch to delivery office
  if (t.includes("dispatch") && (t.includes("delivery office") || t.includes("dmo"))) return "In Transit";

  // Booking
  if (t.includes("booked") || t.includes("booking") || t.includes("acceptance")) return "Booked";

  // Hub / mail office processing
  if (
    t.includes("arrival") ||
    t.includes("arrived") ||
    t.includes("received at") ||
    t.includes("hub")
  ) return "At Hub";

  // General dispatch / in-transit
  if (t.includes("dispatch") || t.includes("in transit") || t.includes("movement")) return "In Transit";

  return "Booked";
}

export function getEventStageLabel(description: string): TrackingStageLabel {
  const t = String(description ?? "").toLowerCase();
  if (!t) return TRACKING_STAGE_LABELS[0];
  if (t.includes("deliver")) return TRACKING_STAGE_LABELS[4];
  if (t.includes("out for delivery") || t.includes("out_for_delivery")) return TRACKING_STAGE_LABELS[3];
  if (t.includes("hub") || t.includes("dispatch") || t.includes("arrival") || t.includes("arrived")) {
    return TRACKING_STAGE_LABELS[2];
  }
  if (t.includes("transit") || t.includes("in route") || t.includes("moving") || t.includes("in_transit")) {
    return TRACKING_STAGE_LABELS[1];
  }
  return TRACKING_STAGE_LABELS[0];
}

const TRACKING_STAGE_PROGRESS = [10, 35, 65, 90, 100] as const;

function clampProgress(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function getDisplayStatusLabel(activeStage: number, status: string): string {
  const s = String(status ?? "").toLowerCase();
  if (s === "rts") return "RTS";
  if (s.includes("failed")) return "Failed Delivery";
  if (s.includes("stuck")) return "Stuck";
  if (s.includes("return")) return "Returned";
  if (s.includes("deliver")) return "Delivered";
  if (activeStage <= 0) return "Booked";
  if (activeStage === 1) return "In Transit";
  if (activeStage === 2) return "At Hub";
  if (activeStage === 3) return "Out for Delivery";
  return "Delivered";
}

export function resolveTrackingPresentation(
  status: string,
  events: TrackingDisplayEventInput[] | undefined,
  deliveryProgress?: number | null,
  lifecycle?: TrackingLifecycle | null,
): TrackingPresentationModel {
  const timeline = Array.isArray(events)
    ? events
        .map((event) => {
          const date = text(event?.date);
          const time = text(event?.time) || "00:00";
          const location = text(event?.location);
          const description = text(event?.description);
          return {
            date,
            time,
            location,
            description,
            timestamp: toTimestampMs(date, time),
            stageLabel: getEventBadgeLabel(description),
          };
        })
        .filter((event) => event.date || event.time || event.location || event.description)
        .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))
    : [];

  const lifecycleLatestEvent = lifecycle?.latest_event
    ? {
        date: text(lifecycle.latest_event.date),
        time: text(lifecycle.latest_event.time) || "00:00",
        location: text(lifecycle.latest_event.location),
        description: text(lifecycle.latest_event.description),
        timestamp: toTimestampMs(text(lifecycle.latest_event.date), text(lifecycle.latest_event.time) || "00:00"),
        stageLabel: getEventBadgeLabel(text(lifecycle.latest_event.description) || text(lifecycle.current_stage)),
      }
    : null;

  const latestEvent = lifecycleLatestEvent ?? timeline[timeline.length - 1] ?? null;
  const stageModel = resolveStageModel(status, lifecycle);
  const activeStage = stageModel.activeStage;
  const moneyOrderDisplay = resolveMoneyOrderDisplay(lifecycle);

  const lifecycleDisplayStatus = text(lifecycle?.display_status);
  const displayStatus = lifecycleDisplayStatus || getDisplayStatusLabel(activeStage, status);
  const terminalState = lifecycleState(status, lifecycle);
  const terminal = terminalState === "DELIVERED" || terminalState === "RETURNED";
  const derivedProgress = stageModel.stageLabels.length > 1
    ? clampProgress((activeStage / (stageModel.stageLabels.length - 1)) * 100)
    : (TRACKING_STAGE_PROGRESS[Math.max(0, Math.min(activeStage, TRACKING_STAGE_PROGRESS.length - 1))] ?? 10);
  const numericProgress = Number.isFinite(Number(lifecycle?.progress))
    ? clampProgress(Number(lifecycle?.progress))
    : typeof deliveryProgress === "number" && Number.isFinite(deliveryProgress)
    ? clampProgress(deliveryProgress)
    : null;
  const progress = terminal ? 100 : clampProgress(Math.max(derivedProgress, numericProgress ?? 0));

  return {
    displayStatus,
    progress,
    activeStage,
    stageLabels: stageModel.stageLabels,
    latestEvent,
    timeline,
    showMoneyOrderPanel: moneyOrderDisplay.showMoneyOrderPanel,
    moneyOrderNumber: moneyOrderDisplay.moneyOrderNumber,
    moneyOrderStatusLabel: moneyOrderDisplay.moneyOrderStatusLabel,
  };
}

export function buildTrackingWhatsAppShareUrl(options: {
  trackingNumber: string;
  displayStatus: string;
  origin?: string | null;
  destination?: string | null;
  currentLocation?: string | null;
  latestEvent?: Pick<TrackingPresentationEvent, "description" | "location"> | null;
  phone?: string | null;
  trackUrl?: string | null;
}): string {
  const origin = text(options.origin) || "-";
  const destination = text(options.destination) || "-";
  const currentLocation = text(options.currentLocation || options.latestEvent?.location) || "-";
  const latestDescription = text(options.latestEvent?.description);
  const latestLocation = text(options.latestEvent?.location);
  const latestUpdate = latestDescription
    ? `${latestDescription}${latestLocation ? ` (${latestLocation})` : ""}`
    : "-";
  const trackUrl = text(options.trackUrl) || `https://www.epost.pk/track/${encodeURIComponent(text(options.trackingNumber))}`;
  const message = [
    "ePost.pk Tracking Update",
    "",
    `Tracking ID:\n${text(options.trackingNumber) || "-"}`,
    "",
    `Status:\n${text(options.displayStatus) || "-"}`,
    "",
    `Origin:\n${origin}`,
    "",
    `Destination:\n${destination}`,
    "",
    `Current Location:\n${currentLocation}`,
    "",
    `Latest Update:\n${latestUpdate}`,
    "",
    `Track Online:\n${trackUrl}`,
    "",
    "www.ePost.pk",
  ].join("\n");

  const encoded = encodeURIComponent(message);
  const digits = text(options.phone).replace(/\D/g, "");
  if (digits.length >= 7) return `https://wa.me/${digits}?text=${encoded}`;
  return `https://wa.me/?text=${encoded}`;
}

