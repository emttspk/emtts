import cron from "node-cron";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { pythonTrackOne } from "./trackingService.js";
import { ensureComplaintNotificationTable, listComplaintRecords, upsertComplaintMetadata } from "./complaint.service.js";
import { logComplaintAudit } from "./complaint-audit.service.js";

let complaintSyncScheduleStarted = false;

function normalizeTrackingState(value: string) {
  const upper = String(value ?? "").trim().toUpperCase();
  if (!upper) return "UNAVAILABLE";
  if (upper.includes("DELIVER")) return "DELIVERED";
  if (upper.includes("RETURN")) return "RETURNED";
  if (upper.includes("PENDING")) return "PENDING";
  return "UNKNOWN";
}

function normalizeShipmentState(value: string) {
  const upper = String(value ?? "").trim().toUpperCase();
  if (!upper) return "UNKNOWN";
  if (upper.includes("PENDING")) return "PENDING";
  if (upper.includes("DELIVER")) return "DELIVERED";
  if (upper.includes("RETURN")) return "RETURNED";
  return upper;
}

export function deriveComplaintState(input: {
  priorState: string;
  trackingState: string;
  trackingAvailable: boolean;
  shipmentStatus: string;
  manualPendingOverride: boolean;
  dueDateTs: number | null;
  now: number;
}) {
  const trackingStateAtSync = input.trackingAvailable ? normalizeTrackingState(input.trackingState) : "UNAVAILABLE";
  const shipmentState = normalizeShipmentState(input.shipmentStatus);
  const duePassed = input.dueDateTs != null && input.dueDateTs <= input.now;

  if (input.manualPendingOverride) {
    return {
      state: duePassed ? "OVERDUE" : "ACTIVE",
      reason: "shipment_pending_manual_override",
      trackingStateAtSync,
    };
  }

  if (trackingStateAtSync === "DELIVERED" || trackingStateAtSync === "RETURNED") {
    return {
      state: input.priorState === "RESOLVED" || input.priorState === "CLOSED" ? "CLOSED" : "RESOLVED",
      reason: `verified_tracking_${trackingStateAtSync.toLowerCase()}`,
      trackingStateAtSync,
    };
  }

  if (shipmentState === "PENDING") {
    return {
      state: duePassed ? "OVERDUE" : "ACTIVE",
      reason: "shipment_pending_system",
      trackingStateAtSync,
    };
  }

  if (!input.trackingAvailable || trackingStateAtSync === "UNAVAILABLE" || trackingStateAtSync === "UNKNOWN") {
    return {
      state: duePassed ? "OVERDUE" : "ACTIVE",
      reason: "tracking_unavailable_or_uncertain",
      trackingStateAtSync,
    };
  }

  if (duePassed) {
    return {
      state: "OVERDUE",
      reason: "due_date_reached_pending_verification",
      trackingStateAtSync,
    };
  }

  return {
    state: "ACTIVE",
    reason: "tracking_non_terminal",
    trackingStateAtSync,
  };
}

function buildSyncMetadata(input: {
  nextState: string;
  trackingStateAtSync: string;
  reason: string;
}) {
  return {
    COMPLAINT_STATE: input.nextState,
    LAST_SYNC_AT: new Date().toISOString(),
    LAST_TRACKING_STATUS: input.trackingStateAtSync,
    trackingStateAtSync: input.trackingStateAtSync,
    complaintStateReason: input.reason,
  };
}

function shouldPersistSyncUpdate(input: {
  priorState: string;
  nextState: string;
  complaintText: string;
  trackingStateAtSync: string;
  reason: string;
  alerts: string[];
}) {
  if (input.priorState !== input.nextState) return true;
  if (input.alerts.length > 0) return true;
  const text = String(input.complaintText ?? "");
  if (!text.includes(`trackingStateAtSync: ${input.trackingStateAtSync}`)) return true;
  if (!text.includes(`complaintStateReason: ${input.reason}`)) return true;
  return false;
}

async function recordComplaintAlert(input: { trackingId: string; complaintId: string; dueDate: string; alertType: string }) {
  await ensureComplaintNotificationTable();
  const existing = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT id FROM complaint_notification_logs WHERE tracking_id = $1 AND complaint_id = $2 AND alert_type = $3 AND due_date = $4 LIMIT 1`,
    input.trackingId,
    input.complaintId,
    input.alertType,
    input.dueDate,
  );
  if (existing.length > 0) return false;

  await prisma.$executeRawUnsafe(
    `INSERT INTO complaint_notification_logs (id, tracking_id, complaint_id, alert_type, due_date)
     VALUES ($1, $2, $3, $4, $5)`,
    randomUUID(),
    input.trackingId,
    input.complaintId,
    input.alertType,
    input.dueDate,
  );
  return true;
}

async function updateComplaintAlerts(record: { trackingId: string; complaintId: string; dueDate: string; dueDateTs: number | null }) {
  if (!record.complaintId || record.dueDateTs == null) return [] as string[];
  const msInDay = 24 * 60 * 60 * 1000;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((record.dueDateTs - now.getTime()) / msInDay);
  const created: string[] = [];

  if (diffDays <= 2 && diffDays > 1 && await recordComplaintAlert({ ...record, alertType: "DUE_IN_2_DAYS" })) created.push("DUE_IN_2_DAYS");
  if (diffDays <= 1 && diffDays > 0 && await recordComplaintAlert({ ...record, alertType: "DUE_IN_1_DAY" })) created.push("DUE_IN_1_DAY");
  if (diffDays <= 0 && await recordComplaintAlert({ ...record, alertType: "DUE_DATE_REACHED" })) created.push("DUE_DATE_REACHED");
  return created;
}

export async function runComplaintSync(options?: { trackingIds?: string[]; actorEmail?: string }) {
  const actorEmail = String(options?.actorEmail ?? "system").trim() || "system";
  const complaints = await listComplaintRecords({ trackingIds: options?.trackingIds });
  const results: Array<{ trackingId: string; complaintId: string; previousState: string; nextState: string; alerts: string[]; reason: string; trackingStateAtSync: string }> = [];

  for (const complaint of complaints) {
    if (!complaint.complaintId) continue;
    let liveStatus = "";
    let trackingAvailable = false;
    try {
      const live = await pythonTrackOne(complaint.trackingId, { includeRaw: true });
      liveStatus = String(live.status ?? "").trim();
      trackingAvailable = liveStatus.length > 0;
      const decision = deriveComplaintState({
        priorState: complaint.state,
        trackingState: liveStatus,
        trackingAvailable,
        shipmentStatus: complaint.shipmentStatus,
        manualPendingOverride: complaint.manualPendingOverride,
        dueDateTs: complaint.dueDateTs,
        now: Date.now(),
      });
      const alerts = await updateComplaintAlerts(complaint);
      if (shouldPersistSyncUpdate({
        priorState: complaint.state,
        nextState: decision.state,
        complaintText: complaint.complaintText,
        trackingStateAtSync: decision.trackingStateAtSync,
        reason: decision.reason,
        alerts,
      })) {
        const nextText = upsertComplaintMetadata(
          complaint.complaintText,
          buildSyncMetadata({
            nextState: decision.state,
            trackingStateAtSync: decision.trackingStateAtSync,
            reason: decision.reason,
          }),
        );
        await prisma.shipment.update({
          where: { userId_trackingNumber: { userId: complaint.userId, trackingNumber: complaint.trackingId } },
          data: {
            complaintText: nextText,
            complaintStatus: decision.state === "CLOSED" ? "FILED" : complaint.complaintStatus,
            status: decision.trackingStateAtSync,
          },
        });
        await logComplaintAudit({
          actorEmail,
          action: decision.state === "CLOSED" ? "complaint_closed" : "complaint_synced",
          trackingId: complaint.trackingId,
          complaintId: complaint.complaintId,
          details: `state:${complaint.state}->${decision.state};shipment:${complaint.shipmentStatus || "UNKNOWN"};tracking:${decision.trackingStateAtSync};reason:${decision.reason};alerts:${alerts.join("|") || "none"}`,
        });
      }
      results.push({
        trackingId: complaint.trackingId,
        complaintId: complaint.complaintId,
        previousState: complaint.state,
        nextState: decision.state,
        alerts,
        reason: decision.reason,
        trackingStateAtSync: decision.trackingStateAtSync,
      });
    } catch (error) {
      const fallbackDecision = deriveComplaintState({
        priorState: complaint.state,
        trackingState: liveStatus,
        trackingAvailable: false,
        shipmentStatus: complaint.shipmentStatus,
        manualPendingOverride: complaint.manualPendingOverride,
        dueDateTs: complaint.dueDateTs,
        now: Date.now(),
      });
      const nextText = upsertComplaintMetadata(
        complaint.complaintText,
        buildSyncMetadata({
          nextState: fallbackDecision.state,
          trackingStateAtSync: fallbackDecision.trackingStateAtSync,
          reason: fallbackDecision.reason,
        }),
      );
      await prisma.shipment.update({
        where: { userId_trackingNumber: { userId: complaint.userId, trackingNumber: complaint.trackingId } },
        data: {
          complaintText: nextText,
          complaintStatus: complaint.complaintStatus,
        },
      });
      await logComplaintAudit({
        actorEmail,
        action: "complaint_synced",
        trackingId: complaint.trackingId,
        complaintId: complaint.complaintId,
        details: `sync_uncertain:true;state:${complaint.state}->${fallbackDecision.state};shipment:${complaint.shipmentStatus || "UNKNOWN"};tracking:${fallbackDecision.trackingStateAtSync};reason:${fallbackDecision.reason};error:${error instanceof Error ? error.message : "unknown"}`,
      });
      results.push({
        trackingId: complaint.trackingId,
        complaintId: complaint.complaintId,
        previousState: complaint.state,
        nextState: fallbackDecision.state,
        alerts: [],
        reason: fallbackDecision.reason,
        trackingStateAtSync: fallbackDecision.trackingStateAtSync,
      });
      console.error(`[ComplaintSync] ${complaint.trackingId} failed:`, error instanceof Error ? error.message : error);
    }
  }

  return results;
}

export function startComplaintSyncSchedule() {
  if (complaintSyncScheduleStarted) return;
  complaintSyncScheduleStarted = true;
  cron.schedule("0 */6 * * *", () => {
    runComplaintSync().catch((error) => {
      console.error("[ComplaintSync] Scheduled sync failed:", error instanceof Error ? error.message : error);
    });
  });
  console.log("[ComplaintSync] Cron job scheduled: every 6 hours");
}