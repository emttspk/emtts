type EventInput = {
  date?: string | null;
  time?: string | null;
  location?: string | null;
  description?: string | null;
};

type NormalizedEventType =
  | "BOOKED"
  | "RECEIVED_AT_DMO"
  | "DISPATCH_CITY_TO_CITY"
  | "RECEIVED_AT_DELIVERY_OFFICE"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "UNDELIVERED"
  | "RETURN_DISPATCH"
  | "MONEY_ORDER_ISSUED"
  | "MOS_BOOKED"
  | "MOS_DISPATCH"
  | "MOS_DELIVERED"
  | "OTHER";

type CycleLabel = "Cycle 1" | "Cycle 2" | "Cycle 3" | "Cycle Unknown";
type CycleType = "DELIVERY" | "RETURN" | "MONEY_ORDER" | "UNKNOWN";
type CycleStatus = "COMPLETED" | "IN_PROGRESS" | "PARTIAL";

export type TrackingCycleInterpretation = {
  tracking_number: string;
  final_status: "DELIVERED" | "RETURNED" | "PENDING" | "DELIVERED WITH PAYMENT";
  cycle_detected: CycleLabel;
  mos_status: "COMPLETED" | "IN_PROGRESS" | "MISSING" | "NOT_REQUIRED";
  current_stage: string;
  cycle_type: CycleType;
  cycle_status: CycleStatus;
  flags: string[];
};

type NormalizedEvent = {
  date: string;
  time: string;
  location: string;
  description: string;
  normalized_type: NormalizedEventType;
  timestamp: Date | null;
  index: number;
};

type DetectionState = {
  hasBooked: boolean;
  hasReceivedAtDmo: boolean;
  hasDispatchCityToCity: boolean;
  hasReceivedAtDeliveryOffice: boolean;
  hasOutForDelivery: boolean;
  hasDelivered: boolean;
  hasUndelivered: boolean;
  hasReturnDispatch: boolean;
  hasReturnReceivedAtBookingDmo: boolean;
  hasDeliveredAtBookingOfficeAfterReturn: boolean;
  hasMosIssued: boolean;
  hasMosBooked: boolean;
  hasMosDispatch: boolean;
  hasMosDelivered: boolean;
  latestKnownStage: string;
};

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function lower(value: unknown): string {
  return text(value).toLowerCase();
}

function isCodScope(trackingNumber: string, raw: unknown): boolean {
  const tn = trackingNumber.toUpperCase();
  if (tn.startsWith("COD") || tn.startsWith("VPL") || tn.startsWith("VPP")) return true;

  if (!raw || typeof raw !== "object") return false;
  const top = raw as Record<string, unknown>;
  const nested = (top.tracking && typeof top.tracking === "object" ? top.tracking : top) as Record<string, unknown>;
  const serviceType = text(nested.service_type ?? nested.shipmentType ?? nested.shipmenttype ?? top.service_type).toUpperCase();
  if (serviceType.includes("COD") || serviceType.includes("VPL") || serviceType.includes("VPP")) return true;

  const amountCandidates = [
    nested.collected_amount,
    nested.collect_amount,
    nested.CollectAmount,
    nested.collectAmount,
    top.collected_amount,
    top.collect_amount,
    top.CollectAmount,
    top.collectAmount,
  ];
  for (const candidate of amountCandidates) {
    const rawAmount = text(candidate);
    if (!rawAmount) continue;
    const m = rawAmount.match(/[\d,]+(?:\.\d+)?/);
    const n = Number((m ? m[0] : rawAmount).replace(/,/g, ""));
    if (Number.isFinite(n) && n > 0) return true;
  }

  const moCandidates = [
    nested.money_order_number,
    nested.money_order_no,
    nested.moneyOrderNumber,
    nested.mo_issued_number,
    nested.mos_number,
    nested.mos_id,
    nested.latest_mos_id,
    top.money_order_number,
    top.money_order_no,
    top.moneyOrderNumber,
    top.mo_issued_number,
    top.mos_number,
    top.mos_id,
    top.latest_mos_id,
  ].map((value) => text(value).toUpperCase());

  if (moCandidates.some((value) => value.startsWith("MOS"))) return true;

  const latestStatus = lower(nested.latest_status ?? top.latest_status);
  if (latestStatus.includes("money order") || latestStatus.includes("mos")) return true;

  return false;
}

function parseDateTime(dateRaw: string, timeRaw: string): Date | null {
  const date = dateRaw.trim();
  const time = (timeRaw.trim() || "00:00").trim();
  if (!date) return null;

  const direct = new Date(`${date} ${time}`);
  if (!Number.isNaN(direct.getTime())) return direct;

  const iso = new Date(`${date}T${time}`);
  if (!Number.isNaN(iso.getTime())) return iso;

  return null;
}

function normalizeEventType(description: string): NormalizedEventType {
  const t = lower(description).replace(/\(bagid:.*?\)/gi, "").trim();

  if (/\bmos\b/.test(t) && /issued/.test(t)) return "MONEY_ORDER_ISSUED";
  if (/\bmos\b/.test(t) && /booked/.test(t)) return "MOS_BOOKED";
  if (/\bmos\b/.test(t) && /dispatch|dispatched/.test(t)) return "MOS_DISPATCH";
  if (/\bmos\b/.test(t) && /delivered/.test(t) && !/undelivered/.test(t)) return "MOS_DELIVERED";

  if (
    (t.includes("return dispatch") || t.includes("returned to sender") || t.includes("return to sender"))
    || (t.includes("dispatch") && t.includes("return"))
  ) {
    return "RETURN_DISPATCH";
  }

  if (t.includes("undelivered") || t.includes("refused") || t.includes("not found") || t.includes("deposit")) {
    return "UNDELIVERED";
  }

  // "Delivered to sender" appears on MOS tracking pages = money order delivered to the article sender.
  // MUST be classified BEFORE the generic "delivered" catch-all to prevent false DELIVERED state.
  if (t.includes("delivered to sender") && !t.includes("undelivered")) return "MOS_DELIVERED";

  if (t.includes("delivered") && !t.includes("undelivered")) return "DELIVERED";

  if (t.includes("booked at") || t === "booked" || t.includes("booking")) return "BOOKED";
  if (t.includes("received at dmo")) return "RECEIVED_AT_DMO";

  if (t.includes("money order") && t.includes("issued")) return "MONEY_ORDER_ISSUED";

  if (t.includes("mos issued") || t.includes("mo issued")) return "MONEY_ORDER_ISSUED";

  if (t.includes("dispatch") && (t.includes(" to dmo") || t.includes("city") || t.includes("district mail office"))) {
    return "DISPATCH_CITY_TO_CITY";
  }

  if (
    t.includes("received at delivery office")
    || t.includes("arrival at delivery office")
    || t.includes("arrived at delivery office")
    || t.includes("dispatch to delivery office")
  ) {
    return "RECEIVED_AT_DELIVERY_OFFICE";
  }

  if (t.includes("sent out for delivery") || t.includes("out for delivery")) return "OUT_FOR_DELIVERY";

  return "OTHER";
}

function normalizeEvents(events: EventInput[] | undefined | null): NormalizedEvent[] {
  const input = Array.isArray(events) ? events : [];
  const mapped = input.map((event, index) => {
    const date = text(event?.date);
    const time = text(event?.time);
    const location = text(event?.location);
    const description = text(event?.description);
    return {
      date,
      time,
      location,
      description,
      normalized_type: normalizeEventType(description),
      timestamp: parseDateTime(date, time),
      index,
    } satisfies NormalizedEvent;
  });

  mapped.sort((a, b) => {
    if (a.timestamp && b.timestamp) return a.timestamp.getTime() - b.timestamp.getTime();
    if (a.timestamp) return -1;
    if (b.timestamp) return 1;
    return a.index - b.index;
  });

  const deduped: NormalizedEvent[] = [];
  const seen = new Set<string>();
  for (const event of mapped) {
    const key = [
      event.timestamp?.toISOString() ?? `na-${event.index}`,
      event.normalized_type,
      lower(event.location),
      lower(event.description),
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(event);
  }
  return deduped;
}

function computeLatestCycleStart(events: NormalizedEvent[]): number {
  if (events.length <= 1) return 0;
  let cycleStart = 0;

  for (let i = 0; i < events.length; i += 1) {
    const type = events[i].normalized_type;
    const restartSignal = type === "BOOKED" || type === "DISPATCH_CITY_TO_CITY";
    if (!restartSignal) continue;
    if (i === 0) continue;

    const tail = events.slice(i + 1);
    const tailHasProgress = tail.some((event) => (
      event.normalized_type === "RECEIVED_AT_DELIVERY_OFFICE"
      || event.normalized_type === "OUT_FOR_DELIVERY"
      || event.normalized_type === "UNDELIVERED"
      || event.normalized_type === "RETURN_DISPATCH"
      || event.normalized_type === "MONEY_ORDER_ISSUED"
      || event.normalized_type === "MOS_BOOKED"
      || event.normalized_type === "MOS_DISPATCH"
      || event.normalized_type === "MOS_DELIVERED"
    ));

    const priorHasTerminalOrReturn = events.slice(0, i).some((event) => (
      event.normalized_type === "DELIVERED"
      || event.normalized_type === "MOS_DELIVERED"
      || event.normalized_type === "UNDELIVERED"
      || event.normalized_type === "RETURN_DISPATCH"
    ));

    const tailHasAttemptOrDelivered = tail.some((event) => (
      event.normalized_type === "OUT_FOR_DELIVERY"
      || event.normalized_type === "DELIVERED"
      || event.normalized_type === "UNDELIVERED"
      || event.normalized_type === "MOS_DELIVERED"
    ));

    if (tailHasProgress) {
      if (priorHasTerminalOrReturn && tailHasAttemptOrDelivered) {
        cycleStart = i;
      }
    }
  }

  return cycleStart;
}

function detectState(cycleEvents: NormalizedEvent[]): DetectionState {
  let latestKnownStage = "No tracking events";
  const state: DetectionState = {
    hasBooked: false,
    hasReceivedAtDmo: false,
    hasDispatchCityToCity: false,
    hasReceivedAtDeliveryOffice: false,
    hasOutForDelivery: false,
    hasDelivered: false,
    hasUndelivered: false,
    hasReturnDispatch: false,
    hasReturnReceivedAtBookingDmo: false,
    hasDeliveredAtBookingOfficeAfterReturn: false,
    hasMosIssued: false,
    hasMosBooked: false,
    hasMosDispatch: false,
    hasMosDelivered: false,
    latestKnownStage,
  };

  let returnSignalAt = -1;
  for (let i = 0; i < cycleEvents.length; i += 1) {
    const event = cycleEvents[i];
    const t = lower(event.description);
    latestKnownStage = event.description || event.normalized_type;

    if (event.normalized_type === "BOOKED") state.hasBooked = true;
    if (event.normalized_type === "RECEIVED_AT_DMO") state.hasReceivedAtDmo = true;
    if (event.normalized_type === "DISPATCH_CITY_TO_CITY") state.hasDispatchCityToCity = true;
    if (event.normalized_type === "RECEIVED_AT_DELIVERY_OFFICE") state.hasReceivedAtDeliveryOffice = true;
    if (event.normalized_type === "OUT_FOR_DELIVERY") state.hasOutForDelivery = true;
    if (event.normalized_type === "DELIVERED") state.hasDelivered = true;
    if (event.normalized_type === "UNDELIVERED") {
      state.hasUndelivered = true;
      returnSignalAt = i;
    }
    if (event.normalized_type === "RETURN_DISPATCH") {
      state.hasReturnDispatch = true;
      returnSignalAt = i;
    }

    if (event.normalized_type === "MONEY_ORDER_ISSUED") state.hasMosIssued = true;
    if (event.normalized_type === "MOS_BOOKED") state.hasMosBooked = true;
    if (event.normalized_type === "MOS_DISPATCH") state.hasMosDispatch = true;
    if (event.normalized_type === "MOS_DELIVERED") state.hasMosDelivered = true;

    const isReturnCompletionHint = returnSignalAt >= 0 && i > returnSignalAt;
    if (isReturnCompletionHint && event.normalized_type === "RECEIVED_AT_DMO") {
      state.hasReturnReceivedAtBookingDmo = true;
    }
    if (isReturnCompletionHint && event.normalized_type === "DELIVERED") {
      const strictReturnComplete =
        t.includes("delivered to sender") ||
        t.includes("delivered at booking office");
      if (strictReturnComplete) {
        state.hasDeliveredAtBookingOfficeAfterReturn = true;
      }
    }

    if (/\bmos[a-z0-9]{4,}\b/i.test(t)) {
      state.hasMosIssued = true;
    }

    // "money order issued" phrase without explicit "mos" prefix
    if (t.includes("money order") && t.includes("issued")) {
      state.hasMosIssued = true;
    }
  }

  state.latestKnownStage = latestKnownStage;
  return state;
}

function determineCycleInterpretation(input: {
  trackingNumber: string;
  codScope: boolean;
  state: DetectionState;
}): Omit<TrackingCycleInterpretation, "tracking_number" | "current_stage" | "flags"> {
  const { codScope, state } = input;

  // Hard override: once MOS is completed for COD/VPL/VPP, final outcome is payment-complete.
  // Return-cycle signals must not override this state.
  if (codScope && state.hasMosIssued && state.hasMosDelivered) {
    return {
      final_status: "DELIVERED WITH PAYMENT",
      cycle_detected: "Cycle 3",
      mos_status: "COMPLETED",
      cycle_type: "MONEY_ORDER",
      cycle_status: "COMPLETED",
    };
  }

  // Cycle 3: delivery completed and money-order leg completed.
  if (
    state.hasDelivered
    && state.hasMosIssued
    && (state.hasMosBooked || state.hasMosDispatch)
    && state.hasMosDelivered
  ) {
    return {
      final_status: "DELIVERED WITH PAYMENT",
      cycle_detected: "Cycle 3",
      mos_status: "COMPLETED",
      cycle_type: "MONEY_ORDER",
      cycle_status: "COMPLETED",
    };
  }

  // COD/VPL/VPP without MOS after delivered stays pending by policy.
  if (codScope && state.hasDelivered && !state.hasMosIssued) {
    return {
      final_status: "PENDING",
      cycle_detected: "Cycle 3",
      mos_status: "MISSING",
      cycle_type: "MONEY_ORDER",
      cycle_status: "IN_PROGRESS",
    };
  }

  // Cycle 3 IN_PROGRESS: article delivered + MOS issued but MOS payment not yet delivered to sender.
  // This replaces the false-positive "MOS MISSING" when MOS is detected but incomplete.
  if (state.hasDelivered && state.hasMosIssued && !state.hasMosDelivered) {
    return {
      final_status: "PENDING",
      cycle_detected: "Cycle 3",
      mos_status: "IN_PROGRESS",
      cycle_type: "MONEY_ORDER",
      cycle_status: "IN_PROGRESS",
    };
  }

  // Cycle 2: undelivered -> return dispatch -> back to booking side -> delivered at booking side.
  if (
    (state.hasUndelivered || state.hasReturnDispatch)
    && state.hasReturnDispatch
    && state.hasDeliveredAtBookingOfficeAfterReturn
  ) {
    return {
      final_status: "RETURNED",
      cycle_detected: "Cycle 2",
      mos_status: codScope ? "MISSING" : "NOT_REQUIRED",
      cycle_type: "RETURN",
      cycle_status: "COMPLETED",
    };
  }

  // Cycle 1: full delivery path complete.
  if (
    (state.hasBooked || state.hasReceivedAtDmo || state.hasDispatchCityToCity)
    && state.hasDispatchCityToCity
    && state.hasReceivedAtDeliveryOffice
    && state.hasOutForDelivery
    && state.hasDelivered
  ) {
    return {
      final_status: "DELIVERED",
      cycle_detected: "Cycle 1",
      mos_status: codScope ? (state.hasMosIssued ? "COMPLETED" : "MISSING") : "NOT_REQUIRED",
      cycle_type: "DELIVERY",
      cycle_status: "COMPLETED",
    };
  }

  // Reached delivery side but no delivery and no return started -> pending/hold.
  if (
    (state.hasReceivedAtDeliveryOffice || state.hasOutForDelivery)
    && !state.hasDelivered
    && !state.hasReturnDispatch
  ) {
    return {
      final_status: "PENDING",
      cycle_detected: "Cycle 1",
      mos_status: codScope ? "MISSING" : "NOT_REQUIRED",
      cycle_type: "DELIVERY",
      cycle_status: "IN_PROGRESS",
    };
  }

  if (state.hasUndelivered || state.hasReturnDispatch) {
    return {
      final_status: "PENDING",
      cycle_detected: "Cycle 2",
      mos_status: codScope ? "MISSING" : "NOT_REQUIRED",
      cycle_type: "RETURN",
      cycle_status: "PARTIAL",
    };
  }

  // Fallback cycle classification: avoid "Cycle Unknown" for any movement.
  if (state.hasMosIssued || state.hasMosBooked || state.hasMosDispatch || state.hasMosDelivered) {
    return {
      final_status: state.hasMosDelivered ? "DELIVERED WITH PAYMENT" : "PENDING",
      cycle_detected: "Cycle 3",
      mos_status: state.hasMosDelivered ? "COMPLETED" : (state.hasMosIssued ? "IN_PROGRESS" : "MISSING"),
      cycle_type: "MONEY_ORDER",
      cycle_status: state.hasMosDelivered ? "COMPLETED" : "PARTIAL",
    };
  }

  if (
    state.hasBooked
    || state.hasReceivedAtDmo
    || state.hasDispatchCityToCity
    || state.hasReceivedAtDeliveryOffice
    || state.hasOutForDelivery
    || state.hasDelivered
  ) {
    return {
      final_status: state.hasDelivered ? "DELIVERED" : "PENDING",
      cycle_detected: "Cycle 1",
      mos_status: codScope ? (state.hasMosIssued ? "IN_PROGRESS" : "MISSING") : "NOT_REQUIRED",
      cycle_type: "DELIVERY",
      cycle_status: state.hasDelivered ? "COMPLETED" : "PARTIAL",
    };
  }

  return {
    final_status: "PENDING",
    cycle_detected: "Cycle Unknown",
    mos_status: codScope ? "MISSING" : "NOT_REQUIRED",
    cycle_type: "UNKNOWN",
    cycle_status: "PARTIAL",
  };
}

type MosHint = {
  mosNumber: string | null;
  mosDetected: boolean;
  /** Python replaced article events with MOS tracking events (redirect occurred). */
  isMosRedirect: boolean;
  /** MOS events already show delivery to sender at the time of storage. */
  mosDeliveredFromRaw: boolean;
};

/**
 * Scan all available raw metadata for MOS signals.
 * Handles:
 *   1. Direct mo_issued_number / moIssuedNumber / MOS_Number fields.
 *   2. all_mos_ids array from Python page scan.
 *   3. source_tracking_number = Python redirected article → MOS tracking.
 *   4. selected_tracking_number starts with "MOS" while db record is VPL/COD/VPP.
 *   5. Any MOS[A-Z0-9]+ pattern found in page_text payload.
 */
function extractMosHintFromRaw(raw: unknown, trackingNumber: string): MosHint {
  const empty: MosHint = { mosNumber: null, mosDetected: false, isMosRedirect: false, mosDeliveredFromRaw: false };
  if (!raw || typeof raw !== "object") return empty;

  const r = raw as Record<string, unknown>;
  const tn = trackingNumber.toUpperCase();

  // Helper to get nested tracking object (stored under 'tracking' key in rawJson)
  const nested = (r.tracking && typeof r.tracking === "object" ? r.tracking : r) as Record<string, unknown>;

  // 1. Direct MOS number fields — check both snake_case and camelCase variants
  const directCandidates = [
    text(r.mo_issued_number),
    text(r.latest_mos_id),
    text(r.moIssuedNumber),
    text(r.MOS_Number),
    text(r.mos_number),
    text(r.mos_id),
    text(nested.mo_issued_number),
    text(nested.latest_mos_id),
    text(nested.mos_id),
  ].map((v) => v.toUpperCase());
  const fromDirect = directCandidates.find((v) => v.startsWith("MOS") && v !== tn) ?? null;

  // 2. all_mos_ids array
  const rawAllMos = Array.isArray(r.all_mos_ids)
    ? r.all_mos_ids
    : Array.isArray(nested.all_mos_ids)
    ? nested.all_mos_ids
    : [];
  const allMosIds = rawAllMos
    .map((id) => text(id).toUpperCase())
    .filter((id) => id.startsWith("MOS") && id !== tn);
  const fromAllMos = allMosIds[0] ?? null;

  // 3. source_tracking_number = Python already redirected to MOS tracking page
  const srcTn = (text(r.source_tracking_number) || text(nested.source_tracking_number)).toUpperCase();
  const isMosRedirect = Boolean(srcTn) && (
    srcTn.startsWith("VPL") || srcTn.startsWith("COD") || srcTn.startsWith("VPP")
  );

  // 4. selected_tracking_number starts with MOS while current record is article TN
  const selTn = (text(r.selected_tracking_number) || text(nested.selected_tracking_number)).toUpperCase();
  const isMosSelected = selTn.startsWith("MOS") && !tn.startsWith("MOS");

  // 5. page_text scan (limited to first scan for performance)
  let fromPageText: string | null = null;
  const pageText = text(r.page_text || (nested as Record<string, unknown>).page_text);
  if (pageText) {
    const m = pageText.match(/\b(MOS[A-Z0-9]{4,})\b/i);
    if (m) {
      const candidate = m[1].toUpperCase();
      if (candidate !== tn) fromPageText = candidate;
    }
  }

  const mosNumber = fromDirect ?? fromAllMos ?? fromPageText ?? (isMosRedirect || isMosSelected ? selTn || null : null);
  const latestStatusBlob = lower(nested.latest_status ?? r.latest_status);
  const hasMosDeliveryPhrase = latestStatusBlob.includes("delivered to sender") || latestStatusBlob.includes("money order delivered");
  const hasMoneyOrderPhrase = latestStatusBlob.includes("money order") || pageText.toLowerCase().includes("money order issued");
  const mosDetected = Boolean(mosNumber) || isMosRedirect || isMosSelected || hasMosDeliveryPhrase || hasMoneyOrderPhrase;

  // Determine if MOS delivery is confirmed from stored events when redirect happened
  let mosDeliveredFromRaw = false;
  if (isMosRedirect || isMosSelected || hasMosDeliveryPhrase) {
    const displayEvents = Array.isArray(r.tracking_display_events) ? r.tracking_display_events : [];
    const latestEvent = displayEvents[displayEvents.length - 1];
    if (latestEvent) {
      const lastDesc = lower((latestEvent as Record<string, unknown>).description);
      if ((lastDesc.includes("delivered to sender") || (lastDesc.includes("mos") && lastDesc.includes("delivered")) || hasMosDeliveryPhrase) && !lastDesc.includes("undelivered")) {
        mosDeliveredFromRaw = true;
      }
    }
    // Also check latest_status field
    const latestStatus = lower(nested.latest_status ?? r.latest_status);
    if ((latestStatus.includes("delivered to sender") || latestStatus.includes("money order delivered")) && !latestStatus.includes("undelivered")) {
      mosDeliveredFromRaw = true;
    }
  }

  return { mosNumber, mosDetected, isMosRedirect: isMosRedirect || isMosSelected, mosDeliveredFromRaw };
}

export function interpretTrackingCycles(input: {
  trackingNumber: string;
  events?: EventInput[] | null;
  raw?: unknown;
}): TrackingCycleInterpretation {
  const trackingNumber = text(input.trackingNumber).toUpperCase();
  const normalizedEvents = normalizeEvents(input.events);
  const flags: string[] = [];

  if (normalizedEvents.length === 0) {
    const codScope = isCodScope(trackingNumber, input.raw);
    const mosHint = extractMosHintFromRaw(input.raw, trackingNumber);
    flags.push("NO_EVENTS");
    if (mosHint.mosDetected) flags.push("MOS_DETECTED_FROM_RAW");
    return {
      tracking_number: trackingNumber,
      final_status: "PENDING",
      cycle_detected: "Cycle Unknown",
      mos_status: codScope ? (mosHint.mosDetected ? "IN_PROGRESS" : "MISSING") : "NOT_REQUIRED",
      current_stage: "No tracking events",
      cycle_type: mosHint.mosDetected ? "MONEY_ORDER" : "UNKNOWN",
      cycle_status: mosHint.mosDetected ? "IN_PROGRESS" : "PARTIAL",
      flags,
    };
  }

  const cycleStart = computeLatestCycleStart(normalizedEvents);
  const cycleEvents = normalizedEvents.slice(cycleStart);
  if (cycleStart > 0) flags.push("LATEST_CYCLE_ONLY");

  const codScope = isCodScope(trackingNumber, input.raw);
  const state = detectState(cycleEvents);

  // ---------------------------------------------------------------
  // MOS DEEP-SCAN: enrich detection state from raw metadata fields.
  // This corrects false "MOS MISSING" when Python redirected to MOS
  // tracking page or when mo_issued_number is stored in rawJson.
  // ---------------------------------------------------------------
  if (codScope) {
    const mosHint = extractMosHintFromRaw(input.raw, trackingNumber);

    if (mosHint.mosDetected && !state.hasMosIssued) {
      // MOS number found in metadata but not yet surfaced in event descriptions.
      state.hasMosIssued = true;
      flags.push("MOS_DETECTED_FROM_RAW");
    }

    if (mosHint.isMosRedirect) {
      // Python replaced article events with MOS tracking events.
      // Reclassify: any "DELIVERED" in these events = MOS delivered to sender.
      // Article delivery is IMPLICIT (redirect only happens after article delivery + MOS issuance).
      flags.push("MOS_REDIRECT");

      if (state.hasDelivered && !state.hasMosDelivered) {
        // The "delivered" came from MOS events — reclassify it as MOS delivery.
        state.hasMosDelivered = true;
        state.hasMosBooked = state.hasMosBooked || state.hasBooked;
        state.hasMosDispatch = state.hasMosDispatch || state.hasDispatchCityToCity;
        state.hasDelivered = false; // will be re-set below as implicit article delivery
      }

      if (!state.hasMosBooked && (state.hasBooked || state.hasMosBooked)) {
        state.hasMosBooked = true;
      }
      if (!state.hasMosDispatch && (state.hasDispatchCityToCity || state.hasMosDispatch)) {
        state.hasMosDispatch = true;
      }

      // Implicit: article was delivered — that is the reason Python performed the redirect.
      state.hasDelivered = true;
      state.hasMosIssued = true;
    } else if (mosHint.mosDeliveredFromRaw && !state.hasMosDelivered) {
      // External evidence (latest_status field) confirms MOS was delivered.
      state.hasMosDelivered = true;
      state.hasMosBooked = true;
      state.hasMosDispatch = true;
      // MOS delivery implies article delivery already happened.
      state.hasDelivered = true;
      state.hasMosIssued = true;
      if (!flags.includes("MOS_DETECTED_FROM_RAW")) flags.push("MOS_DETECTED_FROM_RAW");
    }
  }

  const derived = determineCycleInterpretation({
    trackingNumber,
    codScope,
    state,
  });

  const outOfOrderSource = (Array.isArray(input.events) ? input.events : []).map((event, index) => ({
    ts: parseDateTime(text(event?.date), text(event?.time)),
    index,
  }));
  for (let i = 1; i < outOfOrderSource.length; i += 1) {
    const a = outOfOrderSource[i - 1]?.ts;
    const b = outOfOrderSource[i]?.ts;
    if (a && b && a.getTime() > b.getTime()) {
      flags.push("OUT_OF_ORDER_INPUT");
      break;
    }
  }

  const uniqueCount = new Set(normalizedEvents.map((event) => `${event.date}|${event.time}|${lower(event.location)}|${lower(event.description)}`)).size;
  if (uniqueCount < (Array.isArray(input.events) ? input.events.length : 0)) {
    flags.push("DUPLICATE_EVENTS_REMOVED");
  }

  if (derived.cycle_status !== "COMPLETED") {
    const essentialForCycle1 = [
      state.hasBooked,
      state.hasReceivedAtDmo,
      state.hasDispatchCityToCity,
      state.hasReceivedAtDeliveryOffice,
      state.hasOutForDelivery,
    ];
    // Skip MISSING_SCANS when Cycle 3 is in progress — MOS redirect data does not
    // contain the full article delivery chain scans, which is expected behaviour.
    const isMosInProgress = derived.cycle_detected === "Cycle 3" && (
      derived.mos_status === "IN_PROGRESS" || derived.mos_status === "COMPLETED"
    );
    if (!isMosInProgress && essentialForCycle1.some((ok) => !ok)) flags.push("PARTIAL_SEQUENCE_ACCEPTED");
  }

  if (derived.cycle_detected === "Cycle 3" && derived.mos_status === "MISSING") {
    flags.push("MOS_MISSING");
  }

  if (derived.cycle_detected === "Cycle 3" && derived.mos_status === "IN_PROGRESS") {
    flags.push("MOS_IN_PROGRESS");
  }

  return {
    tracking_number: trackingNumber,
    final_status: derived.final_status,
    cycle_detected: derived.cycle_detected,
    mos_status: derived.mos_status,
    current_stage: state.latestKnownStage,
    cycle_type: derived.cycle_type,
    cycle_status: derived.cycle_status,
    flags,
  };
}