import { PrismaClient } from "@prisma/client";
import { applyTrackingPatchLayer } from "../src/services/trackingPatch.js";
import { buildTrackingLifecycleResolution, extractTrackingEventsFromRaw } from "../src/services/trackingLifecycle.js";

const prisma = new PrismaClient();
const SUPPORTED_PREFIXES = ["VPL", "VPP", "COD", "IRL", "RGL", "PAR", "UMS"] as const;

type SupportedPrefix = (typeof SUPPORTED_PREFIXES)[number];

type ShipmentRow = {
  trackingNumber: string;
  status: string | null;
  rawJson: string | null;
  updatedAt: Date;
  createdAt: Date;
};

type CounterMap = Record<string, number>;

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function lower(value: unknown): string {
  return text(value).toLowerCase();
}

function inc(map: CounterMap, key: string, amount = 1) {
  map[key] = (map[key] ?? 0) + amount;
}

function pushSample(map: Record<string, string[]>, key: string, value: string, limit = 10) {
  if (!map[key]) map[key] = [];
  if (map[key].length >= limit || map[key].includes(value)) return;
  map[key].push(value);
}

function parseRaw(rawJson: string | null): Record<string, unknown> {
  if (!rawJson) return {};
  try {
    const parsed = JSON.parse(rawJson);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function prefixOf(trackingNumber: string): SupportedPrefix | null {
  const upper = text(trackingNumber).toUpperCase();
  return SUPPORTED_PREFIXES.find((prefix) => upper.startsWith(prefix)) ?? null;
}

function normalizeStoredStatus(status: unknown): "DELIVERED" | "RETURNED" | "PENDING" {
  const upper = text(status).toUpperCase();
  if (upper.includes("DELIVER")) return "DELIVERED";
  if (upper.includes("RETURN") || upper.includes("RTO")) return "RETURNED";
  return "PENDING";
}

function isMoneyOrderRequired(trackingNumber: string): boolean {
  const upper = text(trackingNumber).toUpperCase();
  return upper.startsWith("VPL") || upper.startsWith("VPP") || upper.startsWith("COD");
}

function countDuplicates(events: Array<{ date: string; time: string; location: string; description: string }>) {
  const seen = new Set<string>();
  let duplicates = 0;
  for (const event of events) {
    const key = [event.date, event.time, lower(event.location), lower(event.description)].join("|");
    if (seen.has(key)) {
      duplicates += 1;
      continue;
    }
    seen.add(key);
  }
  return duplicates;
}

function normalizeEventDictionaryKey(description: string): string {
  const d = lower(description);
  if (!d) return "EMPTY";
  if (d.includes("booked") || d.includes("booking") || d.includes("acceptance")) return "BOOKING";
  if (d.includes("delivered to sender") || d.includes("returned to booking office") || d.includes("received at booking dmo after return")) return "RETURN_COMPLETED";
  if (d.includes("undelivered") || d.includes("refused") || d.includes("deposit") || d.includes("not found")) return "FAILED_DELIVERY";
  if (d.includes("out for delivery") || d.includes("sent out for delivery")) return "OUT_FOR_DELIVERY";
  if (d.includes("dispatch") || d.includes("dispatched")) {
    if (d.includes("return")) return "RTS_INITIATED";
    if (d.includes("delivery office")) return "DMO_DISPATCH";
    if (d.includes("district mail office") || d.includes("dmo") || d.includes("mso")) return "DISTRICT_TRANSIT";
    return "DMO_DISPATCH";
  }
  if (d.includes("arrival") || d.includes("arrived") || d.includes("received at")) {
    if (d.includes("delivery office")) return "DELIVERY_OFFICE_RECEIVED";
    if (d.includes("return")) return "RETURN_ARRIVED";
    return "HUB_PROCESSING";
  }
  if (d.includes("out for delivery") || d.includes("sent out for delivery")) return "OUT_FOR_DELIVERY";
  if (d.includes("delivered") && !d.includes("undelivered")) return "DELIVERED";
  if (d.includes("mos") || d.includes("money order")) return "MONEY_ORDER";
  return "UNKNOWN";
}

function isReturnLikeStatus(status: string): boolean {
  return ["RTS", "RETURN_IN_TRANSIT", "RETURN_PENDING_AT_BOOKING_CITY", "RETURNED"].includes(text(status).toUpperCase());
}

function isIncompleteDeliveryStatus(status: string): boolean {
  return [
    "BOOKED",
    "IN_TRANSIT",
    "IN_TRANSIT_TO_DELIVERY_OFFICE",
    "AT_HUB",
    "OUT_FOR_DELIVERY",
    "FAILED_DELIVERY",
    "FAILED_DELIVERY_PENDING",
    "RE_ROUTED_IN_TRANSIT",
    "RTS",
    "RETURN_IN_TRANSIT",
    "RETURN_PENDING_AT_BOOKING_CITY",
    "STUCK",
  ].includes(text(status).toUpperCase());
}

function summarizeEvents(events: Array<{ date: string; time: string; location: string; description: string }>) {
  const summary = {
    deliveryEvents: 0,
    returnEvents: 0,
    moEvents: 0,
    rtsEvents: 0,
    failedDeliveryEvents: 0,
    hubScans: 0,
    dispatchScans: 0,
    finalDeliveryScans: 0,
    duplicateScans: countDuplicates(events),
    uniqueOffices: new Set<string>(),
    multiHub: false,
    invalidDeliveryFlow: false,
    returnLoop: false,
    duplicateReturnScans: 0,
  };

  let deliveredIndex = -1;
  let returnIndex = -1;
  let returnEventCount = 0;
  const returnKeys = new Set<string>();
  const seenReturnKeys = new Set<string>();

  events.forEach((event, index) => {
    const description = lower(event.description);
    const location = text(event.location);
    if (location) summary.uniqueOffices.add(location);
    if (description.includes("dispatch") || description.includes("dispatched")) summary.dispatchScans += 1;
    if (description.includes("arrival") || description.includes("arrived") || description.includes("received at")) summary.hubScans += 1;
    if (description.includes("out for delivery") || description.includes("sent out for delivery")) summary.deliveryEvents += 1;
    if (description.includes("undelivered") || description.includes("refused") || description.includes("deposit") || description.includes("not found")) {
      summary.failedDeliveryEvents += 1;
    }
    if (description.includes("return to sender") || description.includes("returned to sender") || description.includes("delivered to sender")) {
      summary.returnEvents += 1;
      returnEventCount += 1;
      const returnKey = [event.date, event.time, lower(event.location), description].join("|");
      returnKeys.add(returnKey);
      if (seenReturnKeys.has(returnKey)) summary.duplicateReturnScans += 1;
      seenReturnKeys.add(returnKey);
    }
    if (description.includes("return to sender") || description.includes("returned to sender") || (description.includes("dispatch") && description.includes("return"))) {
      summary.rtsEvents += 1;
      returnIndex = index;
    }
    if (description.includes("mos") || description.includes("money order")) summary.moEvents += 1;
    if (/\bdelivered\b/i.test(description) && !description.includes("undelivered")) {
      deliveredIndex = index;
      summary.finalDeliveryScans += 1;
    }
  });

  summary.multiHub = summary.hubScans > 1;
  summary.invalidDeliveryFlow = deliveredIndex >= 0 && returnIndex > deliveredIndex;
  summary.returnLoop = returnEventCount > 1 || (returnIndex >= 0 && deliveredIndex > returnIndex);
  return summary;
}

function createPrefixAggregate() {
  return {
    count: 0,
    statuses: {} as CounterMap,
    canonicalStatuses: {} as CounterMap,
    falseDelivered: 0,
    falsePending: 0,
    incorrectRts: 0,
    incorrectMo: 0,
    stuck3: 0,
    stuck7: 0,
    stuck15: 0,
  };
}

async function main() {
  const rows = await prisma.shipment.findMany({
    where: {
      rawJson: { not: null },
      OR: SUPPORTED_PREFIXES.map((prefix) => ({ trackingNumber: { startsWith: prefix } })),
    },
    select: {
      trackingNumber: true,
      status: true,
      rawJson: true,
      updatedAt: true,
      createdAt: true,
    },
    orderBy: [{ trackingNumber: "asc" }, { updatedAt: "desc" }],
  });

  const uniqueRows: ShipmentRow[] = [];
  const seenTracking = new Set<string>();
  for (const row of rows) {
    const trackingNumber = text(row.trackingNumber).toUpperCase();
    if (!trackingNumber || seenTracking.has(trackingNumber)) continue;
    seenTracking.add(trackingNumber);
    uniqueRows.push({ ...row, trackingNumber });
  }

  const byPrefix: Record<SupportedPrefix, ReturnType<typeof createPrefixAggregate>> = {
    VPL: createPrefixAggregate(),
    VPP: createPrefixAggregate(),
    COD: createPrefixAggregate(),
    IRL: createPrefixAggregate(),
    RGL: createPrefixAggregate(),
    PAR: createPrefixAggregate(),
    UMS: createPrefixAggregate(),
  };
  const statusMatrix: Record<string, CounterMap> = {};
  const confusionMatrix: Record<string, CounterMap> = {};
  const issues = {
    falseDelivered: 0,
    falsePending: 0,
    falseAtHub: 0,
    incorrectRts: 0,
    incorrectReturnState: 0,
    incorrectMoState: 0,
    incompleteDeliveryCycles: 0,
    duplicateConflict: 0,
  };
  const issueSamples: Record<string, string[]> = {};
  const lifecycleSummary: CounterMap = {};
  const deliverySummary: CounterMap = {};
  const moneyOrderSummary: CounterMap = {};
  const returnSummary: CounterMap = {};
  const stuckSummary: CounterMap = {};
  const eventDictionary: CounterMap = {};
  const eventExamples: Record<string, string[]> = {};
  const officeCounts: CounterMap = {};

  for (const row of uniqueRows) {
    const prefix = prefixOf(row.trackingNumber);
    if (!prefix) continue;
    const raw = parseRaw(row.rawJson);
    const preferredStatus = text((raw as Record<string, unknown>).final_status ?? (raw as Record<string, unknown>).system_status ?? row.status ?? "PENDING");
    const manualPendingOverride = Boolean((raw as Record<string, unknown>).manual_override) && text((raw as Record<string, unknown>).manual_status).toUpperCase() === "PENDING";
    const baseEvents = extractTrackingEventsFromRaw(raw);
    const patched = applyTrackingPatchLayer(
      {
        tracking_number: row.trackingNumber,
        status: preferredStatus,
        events: baseEvents,
        raw,
      },
      { manualPendingOverride },
    );
    const lifecycle = buildTrackingLifecycleResolution({
      trackingNumber: row.trackingNumber,
      sourceStatus: patched.status,
      events: patched.events,
      raw,
      meta: patched.meta,
      cycleInterpretation: patched.cycle_interpretation,
    });
    const storedStatus = normalizeStoredStatus(row.status);
    const prefixAggregate = byPrefix[prefix];
    prefixAggregate.count += 1;
    inc(prefixAggregate.statuses, lifecycle.normalized_status);
    inc(prefixAggregate.canonicalStatuses, lifecycle.canonical_status);
    inc(lifecycleSummary, lifecycle.normalized_status);

    if (!statusMatrix[storedStatus]) statusMatrix[storedStatus] = {};
    inc(statusMatrix[storedStatus], lifecycle.normalized_status);
    if (!confusionMatrix[storedStatus]) confusionMatrix[storedStatus] = {};
    inc(confusionMatrix[storedStatus], lifecycle.underlying_status);

    const eventSummary = summarizeEvents(patched.events ?? []);
    if (eventSummary.invalidDeliveryFlow || eventSummary.duplicateScans > 0) issues.duplicateConflict += 1;
    if (eventSummary.invalidDeliveryFlow) pushSample(issueSamples, "duplicateConflict", row.trackingNumber);

    if (lifecycle.canonical_status === "DELIVERED" && eventSummary.finalDeliveryScans > 0) {
      inc(deliverySummary, "complete_successful_delivery_cycle");
    } else if (isIncompleteDeliveryStatus(lifecycle.underlying_status)) {
      inc(deliverySummary, "partial_or_incomplete_delivery_cycle");
      issues.incompleteDeliveryCycles += 1;
    }
    if (eventSummary.multiHub) inc(deliverySummary, "multi_hub_routing");
    if (eventSummary.invalidDeliveryFlow) inc(deliverySummary, "invalid_delivery_flow");

    const latestDescription = lower(lifecycle.latest_event?.description ?? "");
    if (
      lifecycle.underlying_status === "AT_HUB" &&
      (latestDescription.includes("delivery office") || latestDescription.includes("return") || latestDescription.includes("undelivered"))
    ) {
      issues.falseAtHub += 1;
      pushSample(issueSamples, "falseAtHub", row.trackingNumber);
    }

    if (lifecycle.normalized_status === "STUCK") {
      inc(deliverySummary, "stuck_delivery_flow");
      inc(stuckSummary, "total_stuck");
      inc(
        stuckSummary,
        lifecycle.underlying_status === "AT_HUB"
          ? "stuck_at_hub"
          : lifecycle.underlying_status === "BOOKED"
            ? "stuck_after_booking"
            : isReturnLikeStatus(lifecycle.underlying_status)
              ? "stuck_in_return_flow"
              : "inactive_transit",
      );
      if (lifecycle.stuck_bucket === "3_DAYS") {
        prefixAggregate.stuck3 += 1;
        inc(stuckSummary, "threshold_3_days");
      }
      if (lifecycle.stuck_bucket === "7_DAYS") {
        prefixAggregate.stuck7 += 1;
        inc(stuckSummary, "threshold_7_days");
      }
      if (lifecycle.stuck_bucket === "15_DAYS") {
        prefixAggregate.stuck15 += 1;
        inc(stuckSummary, "threshold_15_days");
        inc(stuckSummary, "possible_lost_article");
      }
    }

    if (storedStatus === "DELIVERED" && lifecycle.canonical_status !== "DELIVERED") {
      issues.falseDelivered += 1;
      prefixAggregate.falseDelivered += 1;
      pushSample(issueSamples, "falseDelivered", row.trackingNumber);
    }
    if (storedStatus === "PENDING" && lifecycle.canonical_status !== "PENDING") {
      issues.falsePending += 1;
      prefixAggregate.falsePending += 1;
      pushSample(issueSamples, "falsePending", row.trackingNumber);
    }
    if ((storedStatus === "RETURNED" && !isReturnLikeStatus(lifecycle.underlying_status)) || (storedStatus !== "RETURNED" && isReturnLikeStatus(lifecycle.underlying_status))) {
      issues.incorrectRts += 1;
      issues.incorrectReturnState += 1;
      prefixAggregate.incorrectRts += 1;
      pushSample(issueSamples, "incorrectRts", row.trackingNumber);
    }

    if (lifecycle.underlying_status === "RTS") inc(returnSummary, "rts_initiated");
    if (lifecycle.underlying_status === "RETURN_IN_TRANSIT") inc(returnSummary, "return_in_transit");
    if (lifecycle.underlying_status === "RETURN_PENDING_AT_BOOKING_CITY") inc(returnSummary, "return_pending_at_booking_city");
    if (lifecycle.underlying_status === "RETURNED") inc(returnSummary, "return_completed");
    if (eventSummary.returnLoop) inc(returnSummary, "return_loops");
    if (eventSummary.duplicateReturnScans > 0) inc(returnSummary, "duplicate_return_scans", eventSummary.duplicateReturnScans);
    if (isReturnLikeStatus(lifecycle.underlying_status) && lifecycle.inactivity_days >= 7) inc(returnSummary, "failed_or_stalled_return");

    const moRequired = isMoneyOrderRequired(row.trackingNumber);
    if (moRequired) {
      inc(moneyOrderSummary, "required");
      if (lifecycle.money_order_status === "COMPLETED") inc(moneyOrderSummary, "completed");
      else if (lifecycle.money_order_status === "IN_PROGRESS") inc(moneyOrderSummary, "in_progress");
      else inc(moneyOrderSummary, "pending_or_missing");

      if (lifecycle.canonical_status === "DELIVERED" && lifecycle.money_order_status !== "COMPLETED") {
        issues.incorrectMoState += 1;
        prefixAggregate.incorrectMo += 1;
        inc(moneyOrderSummary, "delivered_without_mo_completion");
        pushSample(issueSamples, "incorrectMoState", row.trackingNumber);
      }
    } else {
      inc(moneyOrderSummary, "not_required");
    }

    for (const event of patched.events ?? []) {
      const dictKey = normalizeEventDictionaryKey(event.description);
      inc(eventDictionary, dictKey);
      pushSample(eventExamples, dictKey, text(event.description), 6);
      const office = text(event.location);
      if (office) inc(officeCounts, office);
    }
  }

  const topOffices = Object.entries(officeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([office, count]) => ({ office, count }));

  const output = {
    audited_at: new Date().toISOString(),
    supported_prefixes: SUPPORTED_PREFIXES,
    source_rows_total: rows.length,
    duplicate_tracking_rows_removed: rows.length - uniqueRows.length,
    audited_unique_articles: uniqueRows.length,
    minimum_target_met: uniqueRows.length >= 1300,
    lifecycle_summary: lifecycleSummary,
    status_matrix: statusMatrix,
    confusion_matrix: confusionMatrix,
    by_prefix: byPrefix,
    delivery_cycle_summary: deliverySummary,
    money_order_summary: moneyOrderSummary,
    return_rts_summary: returnSummary,
    stuck_summary: stuckSummary,
    issues,
    issue_samples: issueSamples,
    event_dictionary: eventDictionary,
    event_examples: eventExamples,
    top_offices: topOffices,
  };

  console.log(JSON.stringify(output, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });