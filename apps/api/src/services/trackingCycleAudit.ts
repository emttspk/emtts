import { interpretTrackingCycles, type TrackingCycleInterpretation } from "./trackingInterpreter.js";
import type { TrackingCycleCorrection } from "./trackingCycleCorrections.js";
import { processTracking } from "./trackingStatus.js";

export type ShipmentAuditInput = {
  trackingNumber: string;
  currentStatus?: string | null;
  rawJson?: string | null;
};

export type TrackingCycleAuditRecord = {
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
  mos_detected_system?: boolean;
  mos_detected_actual?: boolean;
  mos_number?: string;
  mos_delivery_status?: string;
  match_with_source?: boolean;
  error?: string;
  mos_detected?: boolean;
  mos_linked?: boolean;
  mos_delivered?: boolean;
  final_status_correct?: boolean;
};

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function lower(value: unknown): string {
  return text(value).toLowerCase();
}

function normalizeStatus(value: unknown): "DELIVERED" | "RETURNED" | "PENDING" {
  const raw = text(value).toUpperCase();
  if (raw.includes("DELIVER")) return "DELIVERED";
  if (raw.includes("RETURN")) return "RETURNED";
  return "PENDING";
}

function normalizeExpected(value: string): "DELIVERED" | "RETURNED" | "PENDING" {
  const raw = text(value).toUpperCase();
  if (raw === "DELIVERED" || raw === "DELIVERED WITH PAYMENT") return "DELIVERED";
  if (raw === "RETURNED") return "RETURNED";
  return "PENDING";
}

type EventRow = { date: string; time: string; location: string; description: string };

function parseRaw(rawJson?: string | null): Record<string, unknown> {
  if (!rawJson) return {};
  try {
    const parsed = JSON.parse(rawJson);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function extractMosSourceSignals(raw: Record<string, unknown>): {
  mosDetectedActual: boolean;
  mosNumber: string;
  mosDeliveredActual: boolean;
} {
  const tracking = (raw.tracking && typeof raw.tracking === "object" ? raw.tracking : raw) as Record<string, unknown>;

  const candidates = [
    text(raw.mo_issued_number),
    text(raw.moIssuedNumber),
    text(raw.latest_mos_id),
    text(raw.MOS_Number),
    text(raw.mos_number),
    text(tracking.mo_issued_number),
    text(tracking.latest_mos_id),
    text(tracking.mos_id),
  ].map((v) => v.toUpperCase()).filter(Boolean);

  const allMos = Array.isArray(raw.all_mos_ids)
    ? raw.all_mos_ids
    : Array.isArray(tracking.all_mos_ids)
    ? tracking.all_mos_ids
    : [];
  for (const id of allMos) {
    const m = text(id).toUpperCase();
    if (m) candidates.push(m);
  }

  const fromCandidates = candidates.find((v) => v.startsWith("MOS")) ?? "";

  const blob = JSON.stringify(raw);
  const regexHit = blob.match(/\b(MOS[A-Z0-9]{4,})\b/i);
  const fromRegex = regexHit?.[1]?.toUpperCase() ?? "";

  const mosNumber = fromCandidates || fromRegex || "";
  let mosDetectedActual = Boolean(mosNumber);

  const latestStatus = lower(tracking.latest_status ?? raw.latest_status);
  let mosDeliveredActual = latestStatus.includes("delivered") && !latestStatus.includes("undelivered");

  const events = extractEvents(raw);
  if (!mosDeliveredActual) {
    mosDeliveredActual = events.some((ev) => {
      const d = lower(ev.description);
      return (
        (d.includes("delivered to sender") || (d.includes("mos") && d.includes("delivered")))
        && !d.includes("undelivered")
      );
    });
  }

  if (mosDeliveredActual) {
    mosDetectedActual = true;
  }

  return {
    mosDetectedActual,
    mosNumber,
    mosDeliveredActual,
  };
}

function extractEvents(raw: Record<string, unknown>): EventRow[] {
  const fromPatch = raw.tracking_display_events;
  if (Array.isArray(fromPatch)) {
    return fromPatch.map((ev) => {
      const row = ev as Record<string, unknown>;
      return {
        date: text(row.date),
        time: text(row.time),
        location: text(row.location),
        description: text(row.description),
      };
    }).filter((ev) => ev.date || ev.time || ev.location || ev.description);
  }

  const tracking = (raw.tracking && typeof raw.tracking === "object" ? raw.tracking : raw) as Record<string, unknown>;
  const history = tracking.history;
  if (!Array.isArray(history)) return [];

  return history
    .map((item) => {
      if (Array.isArray(item)) {
        return {
          date: text(item[0]),
          time: text(item[1]),
          description: text(item[2]),
          location: text(item[3]),
        };
      }
      if (item && typeof item === "object") {
        const row = item as Record<string, unknown>;
        return {
          date: text(row.date ?? row.latest_date),
          time: text(row.time ?? row.latest_time),
          location: text(row.location ?? row.city),
          description: text(row.description ?? row.status ?? row.detail),
        };
      }
      return { date: "", time: "", location: "", description: text(item) };
    })
    .filter((ev) => ev.date || ev.time || ev.location || ev.description);
}

function issueCodeFrom(interpretation: TrackingCycleInterpretation, mismatch: boolean): string {
  if (interpretation.final_status === "DELIVERED WITH PAYMENT" || interpretation.mos_status === "COMPLETED") return "MOS_VERIFIED_COMPLETED";
  if (interpretation.mos_status === "MISSING" && (interpretation.flags.includes("MOS_DETECTED_FROM_RAW") || interpretation.flags.includes("MOS_REDIRECT"))) {
    return "MOS_DETECTED_NOT_LINKED";
  }
  if (interpretation.mos_status === "MISSING") return "COD_MOS_MISSING";
  if (interpretation.mos_status === "IN_PROGRESS") return "MOS_IN_PROCESS";
  if (interpretation.cycle_detected === "Cycle 2" && interpretation.cycle_status !== "COMPLETED") return "RETURN_CYCLE_INCOMPLETE";
  if (interpretation.cycle_detected === "Cycle 1" && interpretation.cycle_status !== "COMPLETED") return "DELIVERY_STUCK";
  if (mismatch) return "STATUS_MISMATCH";
  return "NO_ISSUE";
}

function buildReason(interpretation: TrackingCycleInterpretation, mismatch: boolean): string {
  if (interpretation.final_status === "DELIVERED WITH PAYMENT" || interpretation.mos_status === "COMPLETED") {
    return "MOS detected, linked, and payment cycle completed.";
  }
  if (interpretation.flags.includes("MOS_REDIRECT")) return "MOS detected and verified from linked secondary tracking block.";
  if (interpretation.flags.includes("MOS_DETECTED_FROM_RAW") && interpretation.mos_status === "MISSING") return "MOS detected in source data but not linked into cycle interpretation.";
  if (interpretation.flags.includes("MOS_MISSING")) return "COD/VPL/VPP delivery is incomplete because MOS leg is missing.";
  if (interpretation.flags.includes("MOS_IN_PROGRESS")) return "Article delivered. MOS (Money Order) issued and in transit back to sender — awaiting final delivery.";
  if (interpretation.flags.includes("MOS_DETECTED_FROM_RAW")) return "MOS number detected in stored metadata. MOS tracking cycle is active.";
  if (interpretation.flags.includes("OUT_OF_ORDER_INPUT")) return "Input contained out-of-order scans; chronology was normalized before interpretation.";
  if (interpretation.flags.includes("DUPLICATE_EVENTS_REMOVED")) return "Duplicate scans were detected and removed during interpretation.";
  if (interpretation.flags.includes("LATEST_CYCLE_ONLY")) return "Multiple loops detected; latest cycle was used by policy.";
  if (mismatch) return "Current saved status does not match interpreted cycle status.";
  return "Current status is aligned with interpreted tracking cycle.";
}

function allowedReason(currentNorm: string, interpretation: TrackingCycleInterpretation): string {
  if (currentNorm === "PENDING" && interpretation.cycle_status !== "COMPLETED") {
    return "Pending status is acceptable for partial or in-progress cycle states.";
  }
  if (currentNorm === "DELIVERED" && interpretation.final_status === "DELIVERED WITH PAYMENT") {
    return "Delivered is acceptable as a normalized equivalent of delivered-with-payment.";
  }
  if (currentNorm === normalizeExpected(interpretation.final_status)) {
    return "Current status follows normalized interpreter output.";
  }
  return "Status was previously accepted by existing flow without cycle-level override checks.";
}

function suggestedFix(issueCode: string): string {
  if (issueCode === "MOS_VERIFIED_COMPLETED") return "No correction required. MOS verified and completed.";
  if (issueCode === "COD_MOS_MISSING") return "Keep status Pending and wait for MOS issued/booked/dispatch/delivered events.";
  if (issueCode === "MOS_DETECTED_NOT_LINKED") return "Link detected MOS record to article flow and reprocess combined cycle.";
  if (issueCode === "MOS_IN_PROCESS") return "Article delivered. MOS payment in transit — keep Pending until MOS delivered event appears.";
  if (issueCode === "RETURN_CYCLE_INCOMPLETE") return "Verify return dispatch and booking-office completion scans before marking Returned.";
  if (issueCode === "DELIVERY_STUCK") return "Keep Pending/Hold until delivered or return-start scans appear.";
  if (issueCode === "STATUS_MISMATCH") return "Align final status with detected cycle and reprocess interpretation.";
  return "No correction required.";
}

function missingSignals(interpretation: TrackingCycleInterpretation): string[] {
  const out: string[] = [];
  if (interpretation.flags.includes("MOS_MISSING")) out.push("MOS issuance or MOS transit scans missing.");
  if (interpretation.flags.includes("MOS_IN_PROGRESS")) out.push("MOS issued — awaiting delivery to sender.");
  if (interpretation.flags.includes("MOS_REDIRECT")) out.push("MOS tracking confirmed via secondary article block.");
  if (interpretation.flags.includes("MOS_DETECTED_FROM_RAW")) out.push("MOS number detected in stored metadata fields.");
  if (interpretation.flags.includes("OUT_OF_ORDER_INPUT")) out.push("Chronology conflict detected in source events.");
  if (interpretation.flags.includes("DUPLICATE_EVENTS_REMOVED")) out.push("Duplicate scans were present in source history.");
  return out;
}

function applyCorrection(record: TrackingCycleAuditRecord, correction?: Omit<TrackingCycleCorrection, "tracking_number"> | null) {
  return record;
}

export function buildTrackingCycleAuditRecord(
  shipment: ShipmentAuditInput,
  correctionLookup: {
    trackingOverrides: Record<string, Omit<TrackingCycleCorrection, "tracking_number">>;
    issueOverrides: Record<string, Omit<TrackingCycleCorrection, "tracking_number" | "apply_to_issue_code">>;
  },
): TrackingCycleAuditRecord {
  const raw = parseRaw(shipment.rawJson);
  const events = extractEvents(raw);
  const sourceSignals = extractMosSourceSignals(raw);
  const interpretation = interpretTrackingCycles({
    trackingNumber: shipment.trackingNumber,
    events,
    raw,
  });

  const computed = processTracking(raw, {
    explicitMo: text(raw.moIssuedNumber ?? raw.mo_issued_number) || null,
    trackingNumber: shipment.trackingNumber,
  });
  const effectiveFinalStatus = normalizeStatus(computed.systemStatus || shipment.currentStatus);
  const effectiveInterpretation: TrackingCycleInterpretation = {
    ...interpretation,
    final_status: effectiveFinalStatus,
    mos_status: interpretation.mos_status,
  };
  // current = what's stored in DB; expected = what engine computes fresh from rawJson
  // Only flag a real mismatch when the saved DB status differs from fresh engine output
  const currentNorm = normalizeStatus(shipment.currentStatus ?? "");
  const expectedNorm = normalizeStatus(computed.systemStatus ?? shipment.currentStatus ?? "");
  const mismatch = Boolean(currentNorm && expectedNorm && currentNorm !== expectedNorm);
  const issueCode = issueCodeFrom(effectiveInterpretation, mismatch);
  const mosDetectedSystem = interpretation.mos_status !== "MISSING" || interpretation.flags.includes("MOS_DETECTED_FROM_RAW") || interpretation.flags.includes("MOS_REDIRECT");
  const mosLinked = interpretation.flags.includes("MOS_REDIRECT") || (mosDetectedSystem && interpretation.mos_status !== "MISSING");
  const mosDelivered = interpretation.mos_status === "COMPLETED" || sourceSignals.mosDeliveredActual;

  let finalStatusCorrect = true;
  if (sourceSignals.mosDetectedActual && sourceSignals.mosDeliveredActual) {
    finalStatusCorrect = normalizeExpected(effectiveInterpretation.final_status) === "DELIVERED" && effectiveInterpretation.final_status === "DELIVERED WITH PAYMENT";
  } else if (sourceSignals.mosDetectedActual && !sourceSignals.mosDeliveredActual) {
    finalStatusCorrect = effectiveInterpretation.final_status === "PENDING";
  } else if (!sourceSignals.mosDetectedActual) {
    finalStatusCorrect = effectiveInterpretation.final_status !== "DELIVERED WITH PAYMENT";
  }

  const matchWithSource = mosDetectedSystem === sourceSignals.mosDetectedActual;
  const sourceError = matchWithSource
    ? ""
    : sourceSignals.mosDetectedActual
    ? "System missed MOS that exists in source payload."
    : "System detected MOS but source payload does not confirm it.";

  // MOS_IN_PROCESS and MOS_REDIRECT are informational — not real corrections needed.
  const informationalOnly =
    issueCode === "MOS_VERIFIED_COMPLETED" ||
    issueCode === "MOS_IN_PROCESS" ||
    (issueCode === "NO_ISSUE" && interpretation.flags.includes("MOS_REDIRECT"));

  const partialOnlyReturnNoise = false;

  let record: TrackingCycleAuditRecord = {
    tracking_number: shipment.trackingNumber,
    current_status: currentNorm,
    expected_status: effectiveFinalStatus,
    cycle_detected: effectiveInterpretation.cycle_detected,
    issue: issueCode === "MOS_VERIFIED_COMPLETED" ? "RESOLVED" : issueCode === "NO_ISSUE" ? "No issue" : issueCode.replace(/_/g, " "),
    reason: buildReason(effectiveInterpretation, mismatch),
    correction_required: !informationalOnly && !partialOnlyReturnNoise && mismatch,
    suggested_fix: suggestedFix(issueCode),
    issue_code: issueCode,
    missing_detection: missingSignals(effectiveInterpretation),
    current_status_allowed_reason: allowedReason(currentNorm, effectiveInterpretation),
    cycle_status: effectiveInterpretation.cycle_status,
    mos_status: effectiveInterpretation.mos_status,
    flags: effectiveInterpretation.flags,
    mos_detected_system: mosDetectedSystem,
    mos_detected_actual: sourceSignals.mosDetectedActual,
    mos_number: sourceSignals.mosNumber || undefined,
    mos_delivery_status: sourceSignals.mosDeliveredActual ? "DELIVERED_TO_SENDER" : (sourceSignals.mosDetectedActual ? "NOT_DELIVERED" : "NOT_FOUND"),
    match_with_source: matchWithSource,
    error: sourceError || undefined,
    mos_detected: mosDetectedSystem,
    mos_linked: mosLinked,
    mos_delivered: mosDelivered,
    final_status_correct: finalStatusCorrect,
  };

  const byTracking = correctionLookup.trackingOverrides[shipment.trackingNumber.toUpperCase()];
  const byIssue = issueCode !== "NO_ISSUE" ? correctionLookup.issueOverrides[issueCode] : undefined;
  record = applyCorrection(record, byTracking ?? byIssue ?? null);

  return record;
}
