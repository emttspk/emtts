import cron from "node-cron";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { pythonTrackOne } from "./trackingService.js";
import { ensureComplaintNotificationTable, listComplaintRecords, parseComplaintRecord, upsertComplaintMetadata } from "./complaint.service.js";
import { logComplaintAudit } from "./complaint-audit.service.js";

let complaintSyncScheduleStarted = false;

function normalizeTrackingState(value: string) {
  const upper = String(value ?? "").trim().toUpperCase();
  if (upper.includes("DELIVER")) return "DELIVERED";
  if (upper.includes("RETURN")) return "RETURNED";
  if (upper.includes("PENDING")) return "PENDING";
  return upper || "UNKNOWN";
}

function deriveComplaintState(input: { priorState: string; trackingState: string; dueDateTs: number | null; now: number }) {
  const trackingState = normalizeTrackingState(input.trackingState);
  if (trackingState === "DELIVERED" || trackingState === "RETURNED") {
    return input.priorState === "RESOLVED" || input.priorState === "CLOSED" ? "CLOSED" : "RESOLVED";
  }
  if (input.dueDateTs != null && input.dueDateTs <= input.now) {
    return "PROCESSING";
  }
  return "ACTIVE";
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
  const results: Array<{ trackingId: string; complaintId: string; previousState: string; nextState: string; alerts: string[] }> = [];

  for (const complaint of complaints) {
    if (!complaint.complaintId) continue;
    try {
      const live = await pythonTrackOne(complaint.trackingId, { includeRaw: true });
      const nextState = deriveComplaintState({
        priorState: complaint.state,
        trackingState: String(live.status ?? ""),
        dueDateTs: complaint.dueDateTs,
        now: Date.now(),
      });
      const alerts = await updateComplaintAlerts(complaint);
      if (nextState !== complaint.state || alerts.length > 0) {
        const nextText = upsertComplaintMetadata(complaint.complaintText, {
          COMPLAINT_STATE: nextState,
          LAST_SYNC_AT: new Date().toISOString(),
          LAST_TRACKING_STATUS: String(live.status ?? "").trim().toUpperCase(),
        });
        await prisma.shipment.update({
          where: { userId_trackingNumber: { userId: complaint.userId, trackingNumber: complaint.trackingId } },
          data: {
            complaintText: nextText,
            complaintStatus: nextState === "CLOSED" ? "FILED" : complaint.complaintStatus,
          },
        });
        await logComplaintAudit({
          actorEmail,
          action: nextState === "CLOSED" ? "complaint_closed" : "complaint_synced",
          trackingId: complaint.trackingId,
          complaintId: complaint.complaintId,
          details: `state:${complaint.state}->${nextState};alerts:${alerts.join("|") || "none"}`,
        });
      }
      results.push({
        trackingId: complaint.trackingId,
        complaintId: complaint.complaintId,
        previousState: complaint.state,
        nextState,
        alerts,
      });
    } catch (error) {
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