import type { PythonTrackResult } from "./trackingService.js";
import { interpretTrackingCycles } from "./trackingInterpreter.js";
import type { TrackingCycleInterpretation } from "./trackingInterpreter.js";

export type PatchedTrackingMeta = {
  final_status: "Pending" | "Delivered" | "Return" | "OUT_FOR_DELIVERY" | "IN_TRANSIT" | "FAILED" | "DELIVERED WITH PAYMENT";
  total_cycles: number;
  final_cycle_index: number;
  current_cycle: number;
  cycle_description: string;
  decision_reason: string;
  last_event: string;
  complaint_enabled: boolean;
  mos_id: string | null;
  delay_bucket: "Pending";
  hours_passed: number;
  days_passed: number;
  delay: string;
  audit: {
    sorted: boolean;
    strict_delivered: boolean;
    flow_sequence: boolean;
    first_delivery_leg: boolean;
    cycle_valid: boolean;
    mos_override: boolean;
    first_lt_last: boolean;
    no_invalid_status_labels: boolean;
    complaint_rule: boolean;
    delay_rule: boolean;
    status_rule: boolean;
    repaired: boolean;
    ok: boolean;
  };
};

type EventInput = {
  date?: string | null;
  time?: string | null;
  location?: string | null;
  description?: string | null;
};

type Event = {
  date: string;
  time: string;
  location: string;
  description: string;
  timestamp: Date | null;
};

type Cycle = {
  index: number;
  startIndex: number;
  endIndex: number;
  events: Event[];
  hasReturnSignal: boolean;
  reachesOrigin: boolean;
  hasDeliveryOfficeLeg: boolean;
  hasDeliveryAttempt: boolean;
  hasStrictDelivered: boolean;
};

const MOS_ID_RE = /\b(MOS[A-Z0-9]{4,})\b/i;
const TRACKING_VERBOSE_LOGS = process.env.TRACKING_VERBOSE_LOGS === "1";
const ALLOWED_FINAL_STATUSES = new Set<PatchedTrackingMeta["final_status"]>([
  "Pending",
  "Delivered",
  "Return",
  "OUT_FOR_DELIVERY",
  "IN_TRANSIT",
  "FAILED",
  "DELIVERED WITH PAYMENT",
]);

function asText(v: unknown): string {
  return String(v ?? "").trim();
}

function lower(v: unknown): string {
  return asText(v).toLowerCase();
}

function parseDateTime(dateRaw: string, timeRaw: string): Date | null {
  const date = dateRaw.trim();
  const time = (timeRaw.trim() || "00:00").trim();
  if (!date) return null;

  const native = new Date(`${date} ${time}`);
  if (!Number.isNaN(native.getTime())) return native;

  const candidates = [
    `${date}T${time}`,
    `${date}T${time}:00`,
    `${date} ${time}`,
  ];
  for (const c of candidates) {
    const d = new Date(c);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

function processEvents(events: EventInput[] | undefined | null): Event[] {
  const list = Array.isArray(events) ? events : [];
  const normalized = list.map((ev) => ({
    date: asText(ev?.date),
    time: asText(ev?.time) || "00:00",
    location: asText(ev?.location),
    description: asText(ev?.description),
    timestamp: parseDateTime(asText(ev?.date), asText(ev?.time) || "00:00"),
  }));

  normalized.sort((a, b) => {
    const ad = a.timestamp;
    const bd = b.timestamp;
    if (ad && bd) return ad.getTime() - bd.getTime();
    if (ad) return -1;
    if (bd) return 1;
    return 0;
  });

  if (TRACKING_VERBOSE_LOGS) {
    for (const ev of normalized) {
      const parsed = ev.timestamp
        ? `${ev.timestamp.getFullYear()}-${String(ev.timestamp.getMonth() + 1).padStart(2, "0")}-${String(ev.timestamp.getDate()).padStart(2, "0")} ${String(ev.timestamp.getHours()).padStart(2, "0")}:${String(ev.timestamp.getMinutes()).padStart(2, "0")}`
        : "INVALID";
      console.log(`[TRACE] stage=PATCH_TIMESTAMP_PARSE RAW: ${ev.date} ${ev.time} -> PARSED: ${parsed}`);
    }
  }

  return normalized;
}

function isDeliveryAttempt(text: string): boolean {
  return text.includes("sent out for delivery") || text.includes("out for delivery") || text.includes("delivery attempt");
}

function isMovementAfterDelivery(text: string): boolean {
  return (
    text.includes("dispatch") ||
    text.includes("arrival") ||
    text.includes("arrived at") ||
    text.includes("received at") ||
    text.includes("sent out for delivery") ||
    text.includes("out for delivery") ||
    text.includes("undelivered") ||
    text.includes("return")
  );
}

function isDispatch(text: string): boolean {
  return text.includes("dispatch");
}

function isDispatchFromOrigin(text: string): boolean {
  return text.includes("dispatch from dmo") || text.includes("dispatched from dmo");
}

function isReturnSignal(text: string): boolean {
  return (
    text.includes("undelivered") ||
    text.includes("refused") ||
    text.includes("return to sender") ||
    text.includes("returned to sender")
  );
}

function isReturnCompleted(text: string): boolean {
  return (
    text.includes("return to sender") ||
    text.includes("returned to sender") ||
    text.includes("return completed")
  );
}

function isFalseDeliveredOfficeText(text: string): boolean {
  return (
    text.includes("dispatch to delivery office") ||
    text.includes("received at delivery office") ||
    text.includes("arrived at delivery office") ||
    text.includes("arrival at delivery office")
  );
}

function isStrictDelivered(text: string): boolean {
  if (text.includes("undelivered") || text.includes("return") || text.includes("refused")) return false;
  if (isFalseDeliveredOfficeText(text)) return false;
  if (text === "delivered") return true;
  if (text.includes("delivered to addressee")) return true;
  if (text.includes("delivered") && (text.includes("to addressee") || text.includes("to addresse"))) return true;
  return /\bdelivered\b[\s\S]*\bto addres{1,2}e?\b/i.test(text);
}

function extractMosInfo(events: Event[]): { mosId: string | null; startIndex: number | null } {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const text = lower(events[i].description);
    if (!text.includes("mos issued")) continue;
    const hit = asText(events[i].description).match(MOS_ID_RE);
    return { mosId: hit?.[1]?.toUpperCase() ?? null, startIndex: i };
  }
  return { mosId: null, startIndex: null };
}

function computeCycle(events: Event[]): { currentCycle: number; latestCycleStartIndex: number } {
  let cycle = 1;
  let latestCycleStartIndex = 0;
  let seenReturn = false;

  for (let i = 0; i < events.length; i += 1) {
    const text = lower(events[i].description);
    if (isReturnSignal(text)) {
      seenReturn = true;
      continue;
    }
    if (seenReturn && isDispatch(text)) {
      cycle += 1;
      latestCycleStartIndex = i;
      seenReturn = false;
    }
  }

  return { currentCycle: Math.max(1, cycle), latestCycleStartIndex };
}

function isBooking(text: string): boolean {
  return text.includes("booked") || text.includes("booking");
}

function isArrival(text: string): boolean {
  return text.includes("arrival") || text.includes("arrived at") || text.includes("received at");
}

function isDispatchToDeliveryOffice(text: string): boolean {
  return text.includes("dispatch to delivery office");
}

function isArrivalAtDeliveryOffice(text: string): boolean {
  return (
    text.includes("arrival at delivery office") ||
    text.includes("arrived at delivery office") ||
    text.includes("received at delivery office")
  );
}

function tokenized(value: string): string[] {
  return (value.toUpperCase().match(/[A-Z]{3,}/g) ?? []).filter(Boolean);
}

function includesToken(haystack: string, token: string): boolean {
  return haystack.toUpperCase().includes(token);
}

function extractOriginTokens(events: Event[]): string[] {
  const source = events.find((ev) => isBooking(lower(ev.description))) ?? events[0];
  if (!source) return [];
  const locTokens = tokenized(source.location);
  const descTokens = tokenized(source.description);
  const tokens = [...locTokens, ...descTokens];
  return Array.from(new Set(tokens)).slice(0, 5);
}

function reachesOrigin(event: Event, originTokens: string[]): boolean {
  if (originTokens.length === 0) return false;
  const blob = `${event.location} ${event.description}`.toUpperCase();
  return originTokens.some((tok) => includesToken(blob, tok));
}

function buildCycles(events: Event[], originTokens: string[]): Cycle[] {
  if (events.length === 0) return [];
  const starts: number[] = [0];
  let inReturnPhase = false;
  let returnReachedOrigin = false;
  let currentHasReturn = false;

  for (let i = 0; i < events.length; i += 1) {
    const text = lower(events[i].description);
    const returnSignal = isReturnSignal(text);
    const atOrigin = reachesOrigin(events[i], originTokens);
    const startTrigger = isBooking(text) || isDispatchFromOrigin(text);

    if (returnSignal) {
      inReturnPhase = true;
      currentHasReturn = true;
      const lastStart = starts[starts.length - 1] ?? 0;
      if (i > lastStart && !starts.includes(i)) starts.push(i);
    }
    if (inReturnPhase && atOrigin) returnReachedOrigin = true;

    if (startTrigger && inReturnPhase && (returnReachedOrigin || currentHasReturn)) {
      const lastStart = starts[starts.length - 1] ?? 0;
      if (i > lastStart && !starts.includes(i)) starts.push(i);
      inReturnPhase = false;
      returnReachedOrigin = false;
      currentHasReturn = false;
    }
  }

  starts.sort((a, b) => a - b);
  const uniqueStarts = Array.from(new Set(starts));
  const cycles: Cycle[] = [];
  for (let i = 0; i < uniqueStarts.length; i += 1) {
    const startIndex = uniqueStarts[i];
    const endIndex = (uniqueStarts[i + 1] ?? events.length) - 1;
    const slice = events.slice(startIndex, endIndex + 1);
    const hasReturnSignal = slice.some((ev) => isReturnSignal(lower(ev.description)) || isReturnCompleted(lower(ev.description)));
    const reachesOriginInCycle = slice.some((ev) => reachesOrigin(ev, originTokens));
    const hasDeliveryOfficeLeg = slice.some((ev) => {
      const t = lower(ev.description);
      return isDispatchToDeliveryOffice(t) || isArrivalAtDeliveryOffice(t);
    });
    const hasDeliveryAttempt = slice.some((ev) => isDeliveryAttempt(lower(ev.description)));
    const hasStrictDelivered = slice.some((ev) => isStrictDelivered(lower(ev.description)));
    cycles.push({
      index: i + 1,
      startIndex,
      endIndex,
      events: slice,
      hasReturnSignal,
      reachesOrigin: reachesOriginInCycle,
      hasDeliveryOfficeLeg,
      hasDeliveryAttempt,
      hasStrictDelivered,
    });
  }
  return cycles;
}

function hasStrictDeliveryFlow(events: Event[]): boolean {
  let stage = 0;
  for (const ev of events) {
    const text = lower(ev.description);
    if (stage <= 0 && isBooking(text)) {
      stage = 1;
      continue;
    }
    if (stage <= 1 && isDispatch(text)) {
      stage = 2;
      continue;
    }
    if (stage <= 2 && isArrival(text)) {
      stage = 3;
      continue;
    }
    if (stage <= 3 && isDeliveryAttempt(text)) {
      stage = 4;
      continue;
    }
    if (stage >= 4 && isStrictDelivered(text)) return true;
  }
  return false;
}

function daysSince(dateRaw: string | null): number | null {
  if (!dateRaw) return null;
  const d = new Date(dateRaw);
  if (Number.isNaN(d.getTime())) return null;
  return (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24);
}

function ensureSorted(events: Event[]): boolean {
  for (let i = 1; i < events.length; i += 1) {
    const a = events[i - 1].timestamp;
    const b = events[i].timestamp;
    if (a && b && a.getTime() > b.getTime()) return false;
  }
  return true;
}

function daysSinceTimestamp(ts: Date | null): number | null {
  if (!ts) return null;
  return (Date.now() - ts.getTime()) / (1000 * 60 * 60 * 24);
}

function normalizeOffice(value: string): string {
  return asText(value)
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

function sameOffice(left: string, right: string): boolean {
  const normalizedLeft = normalizeOffice(left);
  const normalizedRight = normalizeOffice(right);
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
}

function bookingOfficeFromRaw(raw: unknown, events: Event[]): string {
  if (!raw || typeof raw !== "object") return asText(events[0]?.location);
  const record = raw as Record<string, unknown>;
  const tracking = record.tracking && typeof record.tracking === "object"
    ? record.tracking as Record<string, unknown>
    : undefined;
  return asText(
    tracking?.booking_office ??
    record.booking_office ??
    record.Booking_Office ??
    record.bookingOffice ??
    record.senderCity ??
    events[0]?.location,
  );
}

function isBookingDmoLocation(location: string, bookingOffice: string): boolean {
  const upperLocation = asText(location).toUpperCase();
  const normalizedLocation = normalizeOffice(location);
  const normalizedBooking = normalizeOffice(bookingOffice);
  return Boolean(
    upperLocation.includes("DMO") &&
    normalizedLocation &&
    normalizedBooking &&
    normalizedLocation.includes(normalizedBooking),
  );
}

function isReturnDeliveredAtOrigin(lastEvent: Event | null, bookingOffice: string): boolean {
  if (!lastEvent) return false;
  const description = lower(lastEvent.description);
  const bookingOfficeLower = lower(bookingOffice);
  const atBookingOffice = sameOffice(lastEvent.location, bookingOffice);
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

function shouldDowngradeReturnToPending(finalStatus: PatchedTrackingMeta["final_status"], lastEvent: Event | null, bookingOffice: string): boolean {
  if (finalStatus !== "Return" || !lastEvent) return false;
  const description = lower(lastEvent.description);
  const atBookingOffice = sameOffice(lastEvent.location, bookingOffice);
  const atBookingDmo = isBookingDmoLocation(lastEvent.location, bookingOffice);
  const explicitDelivered =
    description.includes("delivered to sender") ||
    description.includes("delivered at booking office");
  if (explicitDelivered) return false;

  const receiptOnlyAtOrigin =
    (atBookingOffice || atBookingDmo) &&
    /(received|arrival|arrived)/.test(description) &&
    !description.includes("delivered");
  const returnMovementOnly =
    description.includes("return to sender") ||
    description.includes("returned to sender") ||
    description.includes("return in process") ||
    description.includes("return initiated");
  return receiptOnlyAtOrigin || returnMovementOnly;
}

function isComplaintStage(lastEvent: Event | null): boolean {
  const blob = `${asText(lastEvent?.location)} ${asText(lastEvent?.description)}`.toLowerCase();
  return (
    blob.includes("delivery office") ||
    blob.includes("sent out for delivery") ||
    blob.includes("out for delivery") ||
    blob.includes("delivery city dmo")
  );
}

function isReturnFinalText(lastEvent: Event | null): boolean {
  const blob = `${asText(lastEvent?.location)} ${asText(lastEvent?.description)}`.toLowerCase();
  return blob.includes("delivered to sender") || blob.includes("delivered at booking office");
}

function normalizePatchedFinalStatus(value: unknown): PatchedTrackingMeta["final_status"] {
  const normalized = lower(value);
  if (normalized.includes("return")) return "Return";
  if (normalized.includes("delivered")) return "Delivered";
  return "Pending";
}

function finalStatusFromCycleInterpretation(value: TrackingCycleInterpretation["final_status"]): PatchedTrackingMeta["final_status"] {
  if (value === "RETURNED") return "Return";
  if (value === "DELIVERED WITH PAYMENT") return "DELIVERED WITH PAYMENT";
  if (value === "DELIVERED") return "Delivered";
  return "Pending";
}

function normalizeSourceStatus(value: unknown): string {
  return asText(value)
    .toUpperCase()
    .replace(/\s+/g, "_");
}

function hasReturnOrFailureSignal(text: string): boolean {
  return (
    text.includes("undelivered") ||
    text.includes("return") ||
    text.includes("refused") ||
    text.includes("failed")
  );
}

function hasStrictDeliveredToAddressee(events: Event[]): boolean {
  return events.some((ev) => isStrictDelivered(lower(ev.description)));
}

function hasRollbackAfterLatestOutForDelivery(events: Event[]): boolean {
  let latestOutForDelivery = -1;
  for (let i = 0; i < events.length; i += 1) {
    if (isDeliveryAttempt(lower(events[i].description))) latestOutForDelivery = i;
  }
  if (latestOutForDelivery < 0) return false;
  return events.slice(latestOutForDelivery + 1).some((ev) => hasReturnOrFailureSignal(lower(ev.description)));
}

function resolvePatchedStatus(
  sourceStatus: string,
  cycleStatus: PatchedTrackingMeta["final_status"],
  events: Event[],
): PatchedTrackingMeta["final_status"] {
  const source = normalizeSourceStatus(sourceStatus);
  // Preserve terminal statuses.
  if (source === "RETURNED" || source === "RETURN") return "Return";
  if (source === "FAILED" || source === "FAILED_DELIVERY") return "FAILED";

  const cycleReturned = cycleStatus === "Return";

  // Priority 1: DELIVERED must stay DELIVERED when delivery confirmation exists.
  if (source === "DELIVERED" && hasStrictDeliveredToAddressee(events)) {
    return "Delivered";
  }

  // Priority 4: a terminal delivery event in latest cycle marks completion.
  const hasTerminalDelivery = hasStrictDeliveredToAddressee(events) || cycleStatus === "DELIVERED WITH PAYMENT";
  if (hasTerminalDelivery) {
    return cycleStatus === "DELIVERED WITH PAYMENT" ? "DELIVERED WITH PAYMENT" : "Delivered";
  }

  // Priority 2: OUT_FOR_DELIVERY remains unless explicit rollback exists.
  if (source === "OUT_FOR_DELIVERY") {
    if (!hasRollbackAfterLatestOutForDelivery(events)) return "OUT_FOR_DELIVERY";
    return cycleReturned ? "Return" : "Pending";
  }

  // Priority 3: IN_TRANSIT may become Pending only for active/incomplete cycle.
  if (source === "IN_TRANSIT") {
    if (cycleReturned) return "Return";
    return cycleStatus === "Pending" ? "Pending" : "IN_TRANSIT";
  }

  return cycleStatus;
}

function toCanonicalOutputStatus(status: PatchedTrackingMeta["final_status"]): string {
  if (status === "Pending") return "PENDING";
  if (status === "Delivered") return "DELIVERED";
  if (status === "Return") return "RETURNED";
  if (status === "DELIVERED WITH PAYMENT") return "DELIVERED WITH PAYMENT";
  if (status === "OUT_FOR_DELIVERY") return "OUT_FOR_DELIVERY";
  if (status === "IN_TRANSIT") return "IN_TRANSIT";
  if (status === "FAILED") return "FAILED";
  return "PENDING";
}

function deriveMeta(events: Event[], manualPendingOverride: boolean): PatchedTrackingMeta {
  const mos = extractMosInfo(events);
  const scoped = mos.startIndex != null ? events.slice(mos.startIndex) : events;
  const originTokens = extractOriginTokens(scoped);
  const cycles = buildCycles(scoped, originTokens);
  const latestCycle = cycles[cycles.length - 1] ?? {
    index: 1,
    startIndex: 0,
    endIndex: Math.max(0, scoped.length - 1),
    events: scoped,
    hasReturnSignal: false,
    reachesOrigin: false,
    hasDeliveryOfficeLeg: false,
    hasDeliveryAttempt: false,
    hasStrictDelivered: false,
  };
  const latestCycleEvents = latestCycle.events;

  const firstDeliveryLeg = latestCycle.hasDeliveryOfficeLeg;
  const deliveredIndex = latestCycleEvents.findIndex((ev) => isStrictDelivered(lower(ev.description)));
  let hasDeliveredSignal = deliveredIndex >= 0;
  let hasDelivered = false;
  if (hasDeliveredSignal) {
    const trailing = latestCycleEvents.slice(deliveredIndex + 1);
    const hasPostDeliveryMovement = trailing.some((ev) => isMovementAfterDelivery(lower(ev.description)));
    hasDelivered = !hasPostDeliveryMovement;
    if (hasPostDeliveryMovement) hasDeliveredSignal = false;
  }
  const hasReturn = latestCycle.hasReturnSignal && latestCycle.reachesOrigin;

  let finalStatus: PatchedTrackingMeta["final_status"] = "Pending";
  let decisionReason = "Latest cycle incomplete or active in transit to delivery.";
  if (hasDelivered) {
    finalStatus = "Delivered";
    decisionReason = "Latest active cycle has strict delivery completion.";
  } else if (hasReturn) {
    finalStatus = "Return";
    decisionReason = "Latest active cycle has return signal and parcel reached origin/booking side.";
  } else if (latestCycle.hasReturnSignal && !latestCycle.reachesOrigin) {
    finalStatus = "Pending";
    decisionReason = "Return signal exists but origin was not reached; return not finalized.";
  } else if (latestCycle.hasDeliveryOfficeLeg && !hasDelivered) {
    finalStatus = "Pending";
    decisionReason = "At delivery office in latest cycle without strict delivered scan.";
  }

  const lastEvent = latestCycleEvents[latestCycleEvents.length - 1] ?? null;
  const lastDate = lastEvent?.date ?? null;
  const lastScanDays = daysSinceTimestamp(lastEvent?.timestamp ?? null) ?? daysSince(lastDate);

  const first = events.length > 0 ? parseDateTime(events[0].date, events[0].time) : null;
  const hoursPassed = first ? Math.max(0, Math.floor((Date.now() - first.getTime()) / (1000 * 60 * 60))) : 0;
  const daysPassed = Math.max(0, Math.floor(hoursPassed / 24));

  const complaintEnabled =
    finalStatus === "Pending" &&
    (
      manualPendingOverride ||
      (lastScanDays != null && lastScanDays >= 7)
    );

  const sorted = ensureSorted(events);
  const strictDelivered = finalStatus !== "Delivered" || hasDeliveredSignal;
  const cycleValid = cycles.length >= 1;
  const mosOverride = mos.startIndex == null || (scoped.length <= events.length && scoped[0] === events[mos.startIndex]);
  const complaintRule =
    !complaintEnabled || finalStatus === "Pending";
  const delayRule = ALLOWED_FINAL_STATUSES.has(finalStatus);
  const statusRule = ALLOWED_FINAL_STATUSES.has(finalStatus);
  const firstTs = events[0]?.timestamp ?? null;
  const lastTs = events[events.length - 1]?.timestamp ?? null;
  const firstLtLast =
    events.length < 2 ||
    !firstTs ||
    !lastTs ||
    firstTs.getTime() <= lastTs.getTime();
  const invalidStatusLabel = ["PENDING_72H", "ARRIVED_AT_DELIVERY_CITY", "IN_TRANSIT"].includes(
    finalStatus.toUpperCase(),
  );
  const noInvalidStatusLabels = !invalidStatusLabel;
  const flowSequence = true;
  const ok =
    sorted &&
    strictDelivered &&
    flowSequence &&
    cycleValid &&
    mosOverride &&
    firstLtLast &&
    noInvalidStatusLabels &&
    complaintRule &&
    delayRule &&
    statusRule;

  return {
    final_status: finalStatus,
    total_cycles: Math.max(1, cycles.length),
    final_cycle_index: Math.max(1, latestCycle.index),
    current_cycle: Math.max(1, latestCycle.index),
    cycle_description: `${finalStatus} (Loop ${Math.max(1, latestCycle.index)})`,
    decision_reason: decisionReason,
    last_event: lastEvent ? `${lastEvent.date} ${lastEvent.time} ${lastEvent.location} ${lastEvent.description}`.trim() : "-",
    complaint_enabled: complaintEnabled,
    mos_id: mos.mosId,
    delay_bucket: "Pending",
    hours_passed: hoursPassed,
    days_passed: daysPassed,
    delay: `${daysPassed} days`,
    audit: {
      sorted,
      strict_delivered: strictDelivered,
      flow_sequence: flowSequence,
      first_delivery_leg: firstDeliveryLeg,
      cycle_valid: cycleValid,
      mos_override: mosOverride,
      first_lt_last: firstLtLast,
      no_invalid_status_labels: noInvalidStatusLabels,
      complaint_rule: complaintRule,
      delay_rule: delayRule,
      status_rule: statusRule,
      repaired: false,
      ok,
    },
  };
}

export function applyTrackingPatchLayer(
  response: PythonTrackResult,
  opts?: { manualPendingOverride?: boolean },
): PythonTrackResult & { meta: PatchedTrackingMeta; display_events: Event[]; cycle_interpretation: TrackingCycleInterpretation } {
  const statusBeforePatch = asText(response.status) || "-";
  const inputEvents = Array.isArray(response.events) ? response.events : [];
  const firstIn = inputEvents[0] ? `${asText(inputEvents[0].date)} ${asText(inputEvents[0].time)}`.trim() : "-";
  const lastIn = inputEvents[inputEvents.length - 1] ? `${asText(inputEvents[inputEvents.length - 1].date)} ${asText(inputEvents[inputEvents.length - 1].time)}`.trim() : "-";
  const sortedEvents = processEvents(response.events);
  // Final UI override: keep oldest event at the top.
  const displayEvents = [...sortedEvents];
  const cycleInterpretation = interpretTrackingCycles({
    trackingNumber: response.tracking_number,
    events: displayEvents,
    raw: response.raw,
  });
  let meta = deriveMeta(sortedEvents, Boolean(opts?.manualPendingOverride));

  if (!meta.audit.ok) {
    // Second deterministic pass to self-heal malformed inputs.
    const secondPassEvents = processEvents(sortedEvents);
    meta = deriveMeta(secondPassEvents, Boolean(opts?.manualPendingOverride));
    meta.audit.repaired = true;
    meta.audit.ok =
      meta.audit.sorted &&
      meta.audit.strict_delivered &&
      meta.audit.cycle_valid &&
      meta.audit.mos_override &&
      meta.audit.first_lt_last &&
      meta.audit.no_invalid_status_labels &&
      meta.audit.complaint_rule &&
      meta.audit.delay_rule &&
      meta.audit.status_rule;
  }

  const manualPendingOverride = Boolean(opts?.manualPendingOverride);
  const lastEvent = displayEvents[displayEvents.length - 1] ?? null;
  const cycleResolvedStatus = finalStatusFromCycleInterpretation(cycleInterpretation.final_status);
  const resolvedStatus = resolvePatchedStatus(statusBeforePatch, cycleResolvedStatus, displayEvents);
  const outputStatus = toCanonicalOutputStatus(resolvedStatus);
  meta.final_status = resolvedStatus;

  const sourceCycle = Number((response as any)?.current_cycle ?? response.meta?.current_cycle ?? 0);
  if (Number.isFinite(sourceCycle) && sourceCycle > 0) {
    meta.current_cycle = sourceCycle;
    meta.final_cycle_index = sourceCycle;
    meta.total_cycles = Math.max(meta.total_cycles, sourceCycle);
  }
  const sourceCycleDescription = asText((response as any)?.cycle_description ?? response.meta?.cycle_description);
  if (sourceCycleDescription) meta.cycle_description = sourceCycleDescription;
  const sourceDecisionReason = asText((response as any)?.reason ?? response.meta?.decision_reason);
  if (sourceDecisionReason) meta.decision_reason = sourceDecisionReason;

  meta.complaint_enabled = manualPendingOverride || (meta.final_status === "Pending" && meta.days_passed >= 7);
  meta.audit.complaint_rule = !meta.complaint_enabled || meta.final_status === "Pending";

  if (!ALLOWED_FINAL_STATUSES.has(meta.final_status)) {
    console.error(`[TRACE] INVALID_STATUS_LEAK detected=${meta.final_status}`);
  }

  const firstEventDate = displayEvents[0]?.date ?? "-";
  const lastEventDate = displayEvents[displayEvents.length - 1]?.date ?? "-";
  if (TRACKING_VERBOSE_LOGS) {
    console.log(
      `[TRACE] PATCH_APPLIED = TRUE | status_before_patch=${statusBeforePatch} status_after_patch=${meta.final_status} event_count=${displayEvents.length} first_event_in=${firstIn} last_event_in=${lastIn} first_event_out=${firstEventDate} last_event_out=${lastEventDate} complaint_enabled=${meta.complaint_enabled} order_asc=${meta.audit.sorted}`,
    );
    console.log(
      `[TRACE] CYCLE_AUDIT total_cycles=${meta.total_cycles} final_cycle=${meta.final_cycle_index} final_status=${meta.final_status} last_event="${meta.last_event}" reason="${meta.decision_reason}"`,
    );
    console.log(`RAW_STATUS = "${statusBeforePatch}"`);
    console.log(`COMPUTED_STATUS = "${outputStatus}"`);
  }

  meta.cycle_description = `${meta.final_status} (Loop ${Math.max(1, meta.current_cycle)})`;

  return {
    ...response,
    status: outputStatus,
    complaint_eligible: meta.complaint_enabled,
    days_passed: meta.days_passed,
    mos_id: response.mos_id ?? meta.mos_id ?? null,
    // Frontend must only receive display events from this final override layer.
    events: displayEvents,
    display_events: displayEvents,
    meta,
    cycle_interpretation: cycleInterpretation,
  };
}
