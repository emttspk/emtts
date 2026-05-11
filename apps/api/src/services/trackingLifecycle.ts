import type { PatchedTrackingMeta } from "./trackingPatch.js";
import type { TrackingCycleInterpretation } from "./trackingInterpreter.js";

export type TrackingLifecycleStatus =
  | "PENDING"
  | "BOOKED"
  | "IN_TRANSIT"
  | "IN_TRANSIT_TO_DELIVERY_OFFICE"
  | "AT_HUB"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "FAILED_DELIVERY"
  | "FAILED_DELIVERY_PENDING"
  | "RE_ROUTED_IN_TRANSIT"
  | "RTS"
  | "RETURN_IN_TRANSIT"
  | "RETURN_PENDING_AT_BOOKING_CITY"
  | "RETURNED"
  | "STUCK";

export type TrackingLifecycleEvent = {
  date: string;
  time: string;
  location: string;
  description: string;
};

export type TrackingLifecycleResolution = {
  normalized_status: TrackingLifecycleStatus;
  underlying_status: Exclude<TrackingLifecycleStatus, "STUCK">;
  canonical_status: "DELIVERED" | "RETURNED" | "PENDING";
  display_status: string;
  progress: number;
  active_stage: number;
  current_stage: string;
  latest_event: TrackingLifecycleEvent | null;
  is_terminal: boolean;
  stuck_bucket: "NONE" | "3_DAYS" | "7_DAYS" | "15_DAYS";
  inactivity_days: number;
  complaint_enabled: boolean;
  money_order_status: "NOT_REQUIRED" | "PENDING" | "IN_PROGRESS" | "COMPLETED";
  cycle_type: string;
  cycle_status: string;
  decision_reason: string;
  source_status: string;
};

type EventInput = {
  date?: string | null;
  time?: string | null;
  location?: string | null;
  description?: string | null;
};

type NonStuckLifecycleStatus = Exclude<TrackingLifecycleStatus, "STUCK">;

type EventSemantic =
  | "BOOKING"
  | "DMO_DISPATCH"
  | "DISTRICT_TRANSIT"
  | "HUB_PROCESSING"
  | "DELIVERY_OFFICE_RECEIVED"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "FAILED_DELIVERY"
  | "RE_ROUTED"
  | "RTS_INITIATED"
  | "RETURN_IN_TRANSIT"
  | "RETURN_ARRIVED"
  | "RETURN_COMPLETED"
  | "UNKNOWN";

type OfficeRole =
  | "DMO"
  | "DELIVERY_OFFICE"
  | "DISTRICT_MAIL_OFFICE"
  | "HUB"
  | "MSO"
  | "BOOKING_OFFICE"
  | "POST_OFFICE"
  | "UNKNOWN";

type NormalizedEvent = TrackingLifecycleEvent & {
  timestamp: number | null;
  semantic: EventSemantic;
  office_role: OfficeRole;
  from_office: string;
  to_office: string;
  from_role: OfficeRole;
  to_role: OfficeRole;
  city: string;
  from_city: string;
  to_city: string;
  mentions_return: boolean;
  index: number;
};

type SequenceResolution = {
  status: NonStuckLifecycleStatus;
  reason: string;
};

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function lower(value: unknown): string {
  return text(value).toLowerCase();
}

function toTimestampMs(dateRaw: string, timeRaw: string): number | null {
  const date = text(dateRaw);
  if (!date) return null;
  const time = text(timeRaw) || "00:00";
  const native = new Date(`${date} ${time}`).getTime();
  if (Number.isFinite(native)) return native;
  const iso = new Date(`${date}T${time}`).getTime();
  return Number.isFinite(iso) ? iso : null;
}

function isStrictDelivered(description: string): boolean {
  const t = lower(description);
  if (t.includes("undelivered") || t.includes("return") || t.includes("refused") || t.includes("to rts")) return false;
  if (
    t.includes("dispatch to delivery office") ||
    t.includes("received at delivery office") ||
    t.includes("arrived at delivery office") ||
    t.includes("arrival at delivery office")
  ) {
    return false;
  }
  if (t === "delivered") return true;
  if (t.includes("delivered to addressee")) return true;
  if (t.includes("delivered") && (t.includes("to addressee") || t.includes("to addresse"))) return true;
  return /\bdelivered\b[\s\S]*\bto addres{1,2}e?\b/i.test(t);
}

function isReturnCompleted(description: string): boolean {
  const t = lower(description);
  return (
    t.includes("delivered to sender") ||
    t.includes("to rts") ||
    t.includes("returned to booking office") ||
    t.includes("received at booking dmo after return")
  );
}

function cleanOfficeText(value: string): string {
  return text(value).replace(/\(.*?\)/g, " ").replace(/[,:]/g, " ").replace(/\s+/g, " ").trim();
}

function deriveOfficeRole(value: string): OfficeRole {
  const t = lower(value);
  if (!t) return "UNKNOWN";
  if (t.includes("delivery office")) return "DELIVERY_OFFICE";
  if (t.includes("district mail office")) return "DISTRICT_MAIL_OFFICE";
  if (/\bdmo\b/i.test(t)) return "DMO";
  if (/\bmso\b/i.test(t)) return "MSO";
  if (t.includes("booking office")) return "BOOKING_OFFICE";
  if (t.includes("hub") || t.includes("transit office") || t.includes("mail office")) return "HUB";
  if (t.includes("gpo") || t.includes("post office")) return "POST_OFFICE";
  return "UNKNOWN";
}

function extractCity(value: string): string {
  const cleaned = cleanOfficeText(value).toUpperCase();
  if (!cleaned) return "";

  const stripped = cleaned
    .replace(/\bDISTRICT MAIL OFFICE\b/g, " ")
    .replace(/\bDELIVERY OFFICE\b/g, " ")
    .replace(/\bBOOKING OFFICE\b/g, " ")
    .replace(/\bGENERAL POST OFFICE\b/g, " ")
    .replace(/\bPOST OFFICE\b/g, " ")
    .replace(/\bMAIL OFFICE\b/g, " ")
    .replace(/\bDMO\b/g, " ")
    .replace(/\bDPO\b/g, " ")
    .replace(/\bGPO\b/g, " ")
    .replace(/\bMSO(?:-?\d+)?\b/g, " ")
    .replace(/\bHUB\b/g, " ")
    .replace(/\bOFFICE\b/g, " ")
    .replace(/\bCITY\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!stripped) return "";
  return stripped;
}

function isSameCity(left: string, right: string): boolean {
  const a = extractCity(left);
  const b = extractCity(right);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

function parseDispatchEndpoints(description: string, location: string): { fromOffice: string; toOffice: string } {
  const cleaned = cleanOfficeText(description);
  const fullMatch = cleaned.match(/(?:dispatch(?:ed)?|sent)\s+from\s+(.+?)\s+to\s+(.+)/i);
  if (fullMatch) {
    return {
      fromOffice: cleanOfficeText(fullMatch[1]),
      toOffice: cleanOfficeText(fullMatch[2]),
    };
  }

  const toOnlyMatch = cleaned.match(/(?:dispatch(?:ed)?|sent)\s+to\s+(.+)/i);
  if (toOnlyMatch) {
    return {
      fromOffice: cleanOfficeText(location),
      toOffice: cleanOfficeText(toOnlyMatch[1]),
    };
  }

  return {
    fromOffice: cleanOfficeText(location),
    toOffice: "",
  };
}

function hasDispatchSignal(description: string): boolean {
  const t = lower(description);
  return t.includes("dispatch") || t.includes("dispatched") || t.startsWith("sent ") || t.includes(" sent ");
}

function hasReceiptSignal(description: string): boolean {
  const t = lower(description);
  return t.includes("arrival") || t.includes("arrived") || t.includes("received at");
}

function isFailedDelivery(description: string): boolean {
  const t = lower(description);
  return t.includes("undelivered") || t.includes("refused") || t.includes("not found") || t.includes("deposit") || t.includes("failed delivery");
}

function mentionsReturn(description: string): boolean {
  const t = lower(description);
  return (
    t.includes("return to sender") ||
    t.includes("returned to sender") ||
    t.includes("return dispatch") ||
    t.includes("after return") ||
    t.includes("delivered to sender") ||
    (t.includes("dispatch") && t.includes("return"))
  );
}

function classifyEventSemantic(description: string, location: string, fromRole: OfficeRole, toRole: OfficeRole, returnMentioned: boolean): EventSemantic {
  const t = lower(description);

  if (isReturnCompleted(t)) return "RETURN_COMPLETED";
  if (isStrictDelivered(t)) return "DELIVERED";
  if (isFailedDelivery(t)) {
    return "FAILED_DELIVERY";
  }
  if (t.includes("sent out for delivery") || t.includes("out for delivery")) return "OUT_FOR_DELIVERY";

  if (hasDispatchSignal(t)) {
    if (returnMentioned) return "RTS_INITIATED";
    if (toRole === "DELIVERY_OFFICE") return "DMO_DISPATCH";
    if (fromRole !== "UNKNOWN" || toRole !== "UNKNOWN") return "DISTRICT_TRANSIT";
    return "DMO_DISPATCH";
  }

  if (hasReceiptSignal(t)) {
    if (returnMentioned) return "RETURN_ARRIVED";
    if (
      t.includes("delivery office") ||
      toRole === "DELIVERY_OFFICE" ||
      deriveOfficeRole(location) === "DELIVERY_OFFICE"
    ) {
      return "DELIVERY_OFFICE_RECEIVED";
    }
    return "HUB_PROCESSING";
  }

  if (t.includes("booked") || t.includes("booking") || t.includes("acceptance")) return "BOOKING";
  if (returnMentioned) return "RETURN_IN_TRANSIT";
  return "UNKNOWN";
}

function normalizeEvents(events: EventInput[] | undefined | null): NormalizedEvent[] {
  const input = Array.isArray(events) ? events : [];
  const seen = new Set<string>();

  return input
    .map((event, index) => {
      const date = text(event?.date);
      const time = text(event?.time) || "00:00";
      const location = text(event?.location);
      const description = text(event?.description);
      const endpoints = parseDispatchEndpoints(description, location);
      const officeRole = deriveOfficeRole(location);
      const fromRole = deriveOfficeRole(endpoints.fromOffice || location);
      const toRole = deriveOfficeRole(endpoints.toOffice);
      const returnMentioned = mentionsReturn(description);

      return {
        date,
        time,
        location,
        description,
        timestamp: toTimestampMs(date, time),
        semantic: classifyEventSemantic(description, location, fromRole, toRole, returnMentioned),
        office_role: officeRole,
        from_office: endpoints.fromOffice,
        to_office: endpoints.toOffice,
        from_role: fromRole,
        to_role: toRole,
        city: extractCity(location),
        from_city: extractCity(endpoints.fromOffice || location),
        to_city: extractCity(endpoints.toOffice),
        mentions_return: returnMentioned,
        index,
      } satisfies NormalizedEvent;
    })
    .filter((event) => event.date || event.time || event.location || event.description)
    .sort((a, b) => {
      if (a.timestamp != null && b.timestamp != null) return a.timestamp - b.timestamp;
      if (a.timestamp != null) return -1;
      if (b.timestamp != null) return 1;
      return a.index - b.index;
    })
    .filter((event) => {
      const key = [
        event.timestamp ?? `na-${event.index}`,
        lower(event.location),
        lower(event.description),
        event.semantic,
      ].join("|");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function hasMovement(events: NormalizedEvent[]): boolean {
  return events.some((event) => (
    event.semantic !== "BOOKING" && event.semantic !== "UNKNOWN"
  ));
}

function normalizeSourceStatus(status: unknown): string {
  return text(status).toUpperCase().replace(/\s+/g, "_");
}

function inferOriginCity(events: NormalizedEvent[]): string {
  const bookingEvent = events.find((event) => event.semantic === "BOOKING");
  if (bookingEvent) {
    return bookingEvent.city || bookingEvent.from_city || bookingEvent.to_city;
  }

  const firstWithCity = events.find((event) => event.city || event.from_city || event.to_city);
  return firstWithCity?.city || firstWithCity?.from_city || firstWithCity?.to_city || "";
}

function eventTouchesCity(event: NormalizedEvent, city: string): boolean {
  if (!city) return false;
  return [event.city, event.from_city, event.to_city, event.location, event.from_office, event.to_office].some((value) => isSameCity(value, city));
}

function eventMovesTowardOrigin(event: NormalizedEvent, originCity: string): boolean {
  if (!originCity) return false;
  if (event.to_city && isSameCity(event.to_city, originCity)) return true;
  if (["RETURN_ARRIVED", "RETURN_COMPLETED"].includes(event.semantic)) return eventTouchesCity(event, originCity);
  return false;
}

function isOriginReturnPending(event: NormalizedEvent | null, originCity: string): boolean {
  if (!event || !originCity || !eventTouchesCity(event, originCity)) return false;
  if (event.semantic === "RETURN_COMPLETED") return false;
  if (event.semantic === "OUT_FOR_DELIVERY") return true;
  if (event.to_role === "DELIVERY_OFFICE" || event.office_role === "DELIVERY_OFFICE") return true;
  if (event.semantic === "DMO_DISPATCH" && event.to_city && isSameCity(event.to_city, originCity)) return true;
  if (event.semantic === "DELIVERY_OFFICE_RECEIVED") return true;
  return false;
}

function resolveBaseStatus(
  sourceStatus: string,
  meta: PatchedTrackingMeta | null | undefined,
  events: NormalizedEvent[],
  cycleInterpretation: TrackingCycleInterpretation | null | undefined,
): SequenceResolution {
  const source = normalizeSourceStatus(sourceStatus);
  const latestEvent = events[events.length - 1] ?? null;
  const latestMeaningfulEvent = [...events].reverse().find((event) => event.semantic !== "UNKNOWN") ?? latestEvent;
  const originCity = inferOriginCity(events);

  if (events.length === 0) {
    if (source === "RETURNED" || source === "RETURN") return { status: "RETURNED", reason: "No events supplied; preserved returned source status." };
    if (source === "DELIVERED" || source === "DELIVERED_WITH_PAYMENT") return { status: "DELIVERED", reason: "No events supplied; preserved delivered source status." };
    return { status: "PENDING", reason: "No tracking events available." };
  }

  let deliveredIndex = -1;
  let deliveryInvalidatedIndex = -1;
  let failedDeliveryIndex = -1;
  let rtsIndex = -1;
  let reverseMovementIndex = -1;
  let returnCompletedIndex = -1;
  let rerouteCount = 0;
  let forwardDeliveryOfficeAfterFailure = false;
  const deliveryOfficesSeen = new Set<string>();

  for (const event of events) {
    const deliveryOfficeKey = cleanOfficeText(event.to_role === "DELIVERY_OFFICE" ? event.to_office : event.office_role === "DELIVERY_OFFICE" ? event.location : "");

    if (event.semantic === "DELIVERED") {
      deliveredIndex = event.index;
      continue;
    }

    if (event.semantic === "FAILED_DELIVERY") {
      failedDeliveryIndex = event.index;
      if (deliveredIndex >= 0 && event.index > deliveredIndex) deliveryInvalidatedIndex = event.index;
      continue;
    }

    if (event.semantic === "RTS_INITIATED") {
      rtsIndex = event.index;
      reverseMovementIndex = event.index;
      if (deliveredIndex >= 0 && event.index > deliveredIndex) deliveryInvalidatedIndex = event.index;
    }

    if (event.semantic === "RETURN_IN_TRANSIT" || event.semantic === "RETURN_ARRIVED") {
      rtsIndex = Math.max(rtsIndex, event.index);
      reverseMovementIndex = Math.max(reverseMovementIndex, event.index);
      if (deliveredIndex >= 0 && event.index > deliveredIndex) deliveryInvalidatedIndex = event.index;
    }

    if (event.semantic === "RETURN_COMPLETED") {
      returnCompletedIndex = event.index;
      if (deliveredIndex >= 0 && event.index > deliveredIndex) deliveryInvalidatedIndex = event.index;
      continue;
    }

    if (["DMO_DISPATCH", "DISTRICT_TRANSIT", "HUB_PROCESSING", "DELIVERY_OFFICE_RECEIVED", "OUT_FOR_DELIVERY", "RETURN_ARRIVED", "RETURN_IN_TRANSIT"].includes(event.semantic)) {
      if (deliveredIndex >= 0 && event.index > deliveredIndex) deliveryInvalidatedIndex = event.index;
    }

    if (deliveryOfficeKey) {
      if (deliveryOfficesSeen.size > 0 && !deliveryOfficesSeen.has(deliveryOfficeKey) && failedDeliveryIndex >= 0) {
        rerouteCount += 1;
      }
      deliveryOfficesSeen.add(deliveryOfficeKey);
    }

    if ((event.semantic === "DMO_DISPATCH" || event.semantic === "DISTRICT_TRANSIT") && event.to_role === "DELIVERY_OFFICE" && failedDeliveryIndex >= 0) {
      forwardDeliveryOfficeAfterFailure = true;
      rerouteCount += 1;
    }

    if (failedDeliveryIndex >= 0 && event.index > failedDeliveryIndex && eventMovesTowardOrigin(event, originCity)) {
      reverseMovementIndex = Math.max(reverseMovementIndex, event.index);
    }
  }

  const deliveredWithMoneyOrderComplete =
    cycleInterpretation?.final_status === "DELIVERED WITH PAYMENT" &&
    cycleInterpretation?.mos_status === "COMPLETED" &&
    deliveredIndex >= 0;
  const deliveredIsStillValid = deliveredWithMoneyOrderComplete || (deliveredIndex >= 0 && deliveredIndex > Math.max(deliveryInvalidatedIndex, failedDeliveryIndex, rtsIndex, reverseMovementIndex, returnCompletedIndex));
  const latestSemantic = latestMeaningfulEvent?.semantic ?? "UNKNOWN";
  const returnFlowDetected = returnCompletedIndex >= 0 || rtsIndex >= 0 || reverseMovementIndex >= 0 || latestSemantic === "RETURN_IN_TRANSIT" || latestSemantic === "RETURN_ARRIVED";
  const latestTargetsDeliveryOffice = latestMeaningfulEvent?.to_role === "DELIVERY_OFFICE" || latestMeaningfulEvent?.office_role === "DELIVERY_OFFICE";
  const originReturnPending = isOriginReturnPending(latestMeaningfulEvent ?? null, originCity);

  if (returnCompletedIndex >= 0) {
    return {
      status: "RETURNED",
      reason: "Return completion scan exists after operational movement back to origin.",
    };
  }

  if (deliveredIsStillValid) {
    return {
      status: "DELIVERED",
      reason: "Explicit delivery completion remains the latest non-contradicted terminal event.",
    };
  }

  if (returnFlowDetected) {
    if (originReturnPending) {
      return {
        status: "RETURN_PENDING_AT_BOOKING_CITY",
        reason: "Article re-entered the booking city and is still moving through origin-side offices after RTS.",
      };
    }

    if (latestSemantic === "RTS_INITIATED" && reverseMovementIndex === rtsIndex) {
      return {
        status: "RTS",
        reason: "Return to sender has been initiated and the sequence has not yet shown completion at origin.",
      };
    }

    return {
      status: "RETURN_IN_TRANSIT",
      reason: "Failed delivery was followed by movement back toward the booking city, indicating RTS in progress.",
    };
  }

  if (failedDeliveryIndex >= 0 && failedDeliveryIndex >= deliveredIndex) {
    if (forwardDeliveryOfficeAfterFailure || rerouteCount > 0 || latestSemantic === "RE_ROUTED") {
      return {
        status: "RE_ROUTED_IN_TRANSIT",
        reason: "A failed delivery was followed by re-dispatch toward another delivery office, so the article is re-routed rather than delivered.",
      };
    }

    return {
      status: "FAILED_DELIVERY_PENDING",
      reason: "Undelivered or failed-delivery scan revoked any earlier delivery attempt and no later completion exists.",
    };
  }

  if (latestSemantic === "OUT_FOR_DELIVERY") {
    return {
      status: "OUT_FOR_DELIVERY",
      reason: "Latest operational scan is an active delivery attempt, not a delivery completion.",
    };
  }

  if ((latestSemantic === "DMO_DISPATCH" || latestSemantic === "DISTRICT_TRANSIT") && latestTargetsDeliveryOffice) {
    return {
      status: rerouteCount > 0 ? "RE_ROUTED_IN_TRANSIT" : "IN_TRANSIT_TO_DELIVERY_OFFICE",
      reason: rerouteCount > 0
        ? "Dispatch chain is moving between delivery offices after prior movement, indicating re-routing in transit."
        : "Dispatch to a delivery office is operational forward movement and not a delivery completion.",
    };
  }

  if (latestSemantic === "DELIVERY_OFFICE_RECEIVED") {
    return {
      status: rerouteCount > 0 ? "RE_ROUTED_IN_TRANSIT" : "AT_HUB",
      reason: rerouteCount > 0
        ? "Latest scan shows receipt after re-routing, so the article remains in transit between handling offices."
        : "Latest scan is a receipt at an operational office, not a handoff to the addressee.",
    };
  }

  if (latestSemantic === "HUB_PROCESSING") {
    return {
      status: "AT_HUB",
      reason: "Latest scan shows operational processing at a hub or mail office.",
    };
  }

  if (latestSemantic === "DMO_DISPATCH" || latestSemantic === "DISTRICT_TRANSIT") {
    return {
      status: "IN_TRANSIT",
      reason: "Latest scan is inter-office movement without delivery completion.",
    };
  }

  if (latestSemantic === "BOOKING") {
    return {
      status: "BOOKED",
      reason: "Only booking-stage events are present in the current sequence.",
    };
  }

  if (!hasMovement(events)) {
    return {
      status: "BOOKED",
      reason: "Sequence has no operational movement beyond booking metadata.",
    };
  }

  if (meta?.final_status === "Return") {
    return {
      status: "RTS",
      reason: "Patched tracking metadata marks the article as return flow and sequence evidence is incomplete.",
    };
  }
  if (meta?.final_status === "Delivered" || meta?.final_status === "DELIVERED WITH PAYMENT") {
    return {
      status: "OUT_FOR_DELIVERY",
      reason: "Source metadata indicates delivery flow, but no valid terminal delivery scan survived the sequence audit.",
    };
  }

  if (source === "OUT_FOR_DELIVERY") {
    return {
      status: "OUT_FOR_DELIVERY",
      reason: "Source status still indicates a live delivery attempt.",
    };
  }
  if (source === "FAILED" || source === "FAILED_DELIVERY") {
    return {
      status: "FAILED_DELIVERY_PENDING",
      reason: "Source status indicates failed delivery and the sequence does not contain a later completion.",
    };
  }
  if (source === "RETURNED" || source === "RETURN") {
    return {
      status: "RETURN_IN_TRANSIT",
      reason: "Source status indicates return flow without a final return completion scan.",
    };
  }
  if (source === "IN_TRANSIT") {
    return {
      status: "IN_TRANSIT",
      reason: "Source status indicates transit and the sequence does not show a more specific later stage.",
    };
  }

  return {
    status: "AT_HUB",
    reason: "Sequence ended on an operational handling event without proof of delivery completion.",
  };
}

function resolveInactivityDays(events: NormalizedEvent[], meta: PatchedTrackingMeta | null | undefined): number {
  const latest = events[events.length - 1]?.timestamp ?? null;
  if (latest != null) {
    return Math.max(0, Math.floor((Date.now() - latest) / (1000 * 60 * 60 * 24)));
  }
  const metaDays = Number(meta?.days_passed ?? 0);
  return Number.isFinite(metaDays) ? Math.max(0, Math.floor(metaDays)) : 0;
}

function resolveStuckBucket(days: number): "NONE" | "3_DAYS" | "7_DAYS" | "15_DAYS" {
  if (days >= 15) return "15_DAYS";
  if (days >= 7) return "7_DAYS";
  if (days >= 3) return "3_DAYS";
  return "NONE";
}

function resolveStage(baseStatus: NonStuckLifecycleStatus): { activeStage: number; currentStage: string; progress: number } {
  switch (baseStatus) {
    case "PENDING":
      return { activeStage: 0, currentStage: "Pending", progress: 0 };
    case "BOOKED":
      return { activeStage: 0, currentStage: "Booked", progress: 10 };
    case "IN_TRANSIT":
      return { activeStage: 1, currentStage: "In Transit", progress: 45 };
    case "IN_TRANSIT_TO_DELIVERY_OFFICE":
      return { activeStage: 2, currentStage: "In Transit to Delivery Office", progress: 78 };
    case "AT_HUB":
      return { activeStage: 2, currentStage: "At Hub", progress: 72 };
    case "OUT_FOR_DELIVERY":
      return { activeStage: 3, currentStage: "Out for Delivery", progress: 90 };
    case "FAILED_DELIVERY":
      return { activeStage: 3, currentStage: "Delivery Attempt Failed", progress: 90 };
    case "FAILED_DELIVERY_PENDING":
      return { activeStage: 3, currentStage: "Failed Delivery Pending Resolution", progress: 90 };
    case "RE_ROUTED_IN_TRANSIT":
      return { activeStage: 2, currentStage: "Re-routed in Transit", progress: 76 };
    case "RTS":
      return { activeStage: 3, currentStage: "Return to Sender Initiated", progress: 95 };
    case "RETURN_IN_TRANSIT":
      return { activeStage: 3, currentStage: "Return in Transit", progress: 96 };
    case "RETURN_PENDING_AT_BOOKING_CITY":
      return { activeStage: 4, currentStage: "Return Pending at Booking City", progress: 98 };
    case "RETURNED":
      return { activeStage: 4, currentStage: "Returned to Sender", progress: 100 };
    case "DELIVERED":
      return { activeStage: 4, currentStage: "Delivered", progress: 100 };
  }
}

function displayStatusFor(status: TrackingLifecycleStatus, underlyingStatus: NonStuckLifecycleStatus): string {
  if (status === "STUCK") {
    if (underlyingStatus === "AT_HUB") return "Stuck at Hub";
    if (underlyingStatus === "IN_TRANSIT_TO_DELIVERY_OFFICE") return "Stuck in Transit to Delivery Office";
    if (underlyingStatus === "OUT_FOR_DELIVERY") return "Stuck Out for Delivery";
    if (underlyingStatus === "BOOKED") return "Stuck after Booking";
    if (underlyingStatus === "RE_ROUTED_IN_TRANSIT") return "Stuck in Re-route Transit";
    if (underlyingStatus === "RETURN_IN_TRANSIT") return "Stuck in Return Transit";
    if (underlyingStatus === "RETURN_PENDING_AT_BOOKING_CITY") return "Stuck at Booking City During Return";
    return "Stuck in Transit";
  }
  if (status === "IN_TRANSIT_TO_DELIVERY_OFFICE") return "In Transit to Delivery Office";
  if (status === "FAILED_DELIVERY") return "Failed Delivery";
  if (status === "FAILED_DELIVERY_PENDING") return "Failed Delivery Pending";
  if (status === "RE_ROUTED_IN_TRANSIT") return "Re-routed in Transit";
  if (status === "OUT_FOR_DELIVERY") return "Out for Delivery";
  if (status === "IN_TRANSIT") return "In Transit";
  if (status === "AT_HUB") return "At Hub";
  if (status === "RTS") return "RTS in Progress";
  if (status === "RETURN_IN_TRANSIT") return "Return in Transit";
  if (status === "RETURN_PENDING_AT_BOOKING_CITY") return "Return Pending at Booking City";
  if (status === "RETURNED") return "Returned";
  if (status === "BOOKED") return "Booked";
  if (status === "PENDING") return "Pending";
  return status.replace(/_/g, " ");
}

function resolveCanonicalStatus(status: TrackingLifecycleStatus): "DELIVERED" | "RETURNED" | "PENDING" {
  if (status === "DELIVERED") return "DELIVERED";
  if (["RETURNED", "RTS", "RETURN_IN_TRANSIT", "RETURN_PENDING_AT_BOOKING_CITY"].includes(status)) return "RETURNED";
  return "PENDING";
}

function resolveMoneyOrderRequired(trackingNumber: string, raw: unknown): boolean {
  const trackingId = text(trackingNumber).toUpperCase();
  if (trackingId.startsWith("VPL") || trackingId.startsWith("VPP") || trackingId.startsWith("COD")) return true;
  if (!raw || typeof raw !== "object") return false;
  const record = raw as Record<string, unknown>;
  const tracking = (record.tracking && typeof record.tracking === "object" ? record.tracking : record) as Record<string, unknown>;
  const moValue = [
    tracking.money_order_number,
    tracking.moneyOrderNumber,
    tracking.mos_number,
    tracking.MOS_Number,
    tracking.mo_issued_number,
    record.money_order_number,
    record.moneyOrderNumber,
    record.mos_number,
    record.MOS_Number,
    record.mo_issued_number,
  ].some((value) => text(value).toUpperCase().startsWith("MOS"));
  return moValue;
}

function resolveMoneyOrderStatus(
  trackingNumber: string,
  raw: unknown,
  cycleInterpretation: TrackingCycleInterpretation | null | undefined,
  events: NormalizedEvent[],
): "NOT_REQUIRED" | "PENDING" | "IN_PROGRESS" | "COMPLETED" {
  if (cycleInterpretation?.final_status === "DELIVERED WITH PAYMENT" || cycleInterpretation?.mos_status === "COMPLETED") {
    return "COMPLETED";
  }

  const moSignals = events.some((event) => {
    const description = lower(event.description);
    return description.includes("mos") || description.includes("money order") || description.includes("delivered to sender");
  });
  if (moSignals || cycleInterpretation?.mos_status === "IN_PROGRESS") return "IN_PROGRESS";
  if (resolveMoneyOrderRequired(trackingNumber, raw)) return "PENDING";
  return "NOT_REQUIRED";
}

export function extractTrackingEventsFromRaw(raw: unknown): TrackingLifecycleEvent[] {
  if (!raw || typeof raw !== "object") return [];
  const record = raw as Record<string, unknown>;
  const tracking = (record.tracking && typeof record.tracking === "object" ? record.tracking : record) as Record<string, unknown>;
  const eventsNode = Array.isArray(tracking.events)
    ? tracking.events
    : Array.isArray(record.events)
      ? record.events
      : Array.isArray(tracking.history)
        ? tracking.history
        : Array.isArray(record.history)
          ? record.history
          : [];

  return eventsNode
    .map((item): TrackingLifecycleEvent => {
      if (Array.isArray(item)) {
        return {
          date: text(item[0]),
          time: text(item[1]) || "00:00",
          description: text(item[2]),
          location: text(item[3]),
        };
      }
      if (item && typeof item === "object") {
        const event = item as Record<string, unknown>;
        return {
          date: text(event.date ?? event.latest_date),
          time: text(event.time ?? event.latest_time) || "00:00",
          location: text(event.location ?? event.city),
          description: text(event.description ?? event.detail ?? event.status),
        };
      }
      return {
        date: "",
        time: "00:00",
        location: "",
        description: text(item),
      };
    })
    .filter((event) => event.date || event.time || event.location || event.description);
}

export function buildTrackingLifecycleResolution(input: {
  trackingNumber: string;
  sourceStatus?: string | null;
  events?: EventInput[] | null;
  raw?: unknown;
  meta?: PatchedTrackingMeta | null;
  cycleInterpretation?: TrackingCycleInterpretation | null;
}): TrackingLifecycleResolution {
  const normalizedEvents = normalizeEvents(input.events);
  const baseResolution = resolveBaseStatus(input.sourceStatus ?? "", input.meta, normalizedEvents, input.cycleInterpretation);
  const underlyingStatus = baseResolution.status;
  const inactivityDays = resolveInactivityDays(normalizedEvents, input.meta);
  const stuckBucket = resolveStuckBucket(inactivityDays);
  const shouldMarkStuck = [
    "BOOKED",
    "IN_TRANSIT",
    "IN_TRANSIT_TO_DELIVERY_OFFICE",
    "AT_HUB",
    "OUT_FOR_DELIVERY",
    "RE_ROUTED_IN_TRANSIT",
    "RETURN_IN_TRANSIT",
    "RETURN_PENDING_AT_BOOKING_CITY",
  ].includes(underlyingStatus) && stuckBucket !== "NONE";
  const normalizedStatus: TrackingLifecycleStatus = shouldMarkStuck ? "STUCK" : underlyingStatus;
  const stage = resolveStage(underlyingStatus);
  const latestEvent = normalizedEvents[normalizedEvents.length - 1] ?? null;
  const isTerminal = underlyingStatus === "DELIVERED" || underlyingStatus === "RETURNED";

  return {
    normalized_status: normalizedStatus,
    underlying_status: underlyingStatus,
    canonical_status: resolveCanonicalStatus(normalizedStatus),
    display_status: displayStatusFor(normalizedStatus, underlyingStatus),
    progress: stage.progress,
    active_stage: stage.activeStage,
    current_stage: stage.currentStage,
    latest_event: latestEvent
      ? {
          date: latestEvent.date,
          time: latestEvent.time,
          location: latestEvent.location,
          description: latestEvent.description,
        }
      : null,
    is_terminal: isTerminal,
    stuck_bucket: shouldMarkStuck ? stuckBucket : "NONE",
    inactivity_days: inactivityDays,
    complaint_enabled: Boolean(input.meta?.complaint_enabled),
    money_order_status: resolveMoneyOrderStatus(input.trackingNumber, input.raw, input.cycleInterpretation, normalizedEvents),
    cycle_type: text(input.cycleInterpretation?.cycle_type) || "UNKNOWN",
    cycle_status: text(input.cycleInterpretation?.cycle_status) || "IN_PROGRESS",
    decision_reason: baseResolution.reason || text(input.meta?.decision_reason) || `Resolved from ${underlyingStatus} event sequence.`,
    source_status: normalizeSourceStatus(input.sourceStatus ?? input.meta?.final_status ?? "PENDING"),
  };
}