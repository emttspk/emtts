import cron from "node-cron";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { listComplaintRecords } from "../services/complaint.service.js";

let started = false;

async function ensureTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS complaint_notification_logs (
      id TEXT PRIMARY KEY,
      tracking_id TEXT NOT NULL,
      complaint_id TEXT NOT NULL,
      alert_type TEXT NOT NULL,
      due_date TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function createUniqueAlert(input: { trackingId: string; complaintId: string; dueDate: string; alertType: string }) {
  await ensureTable();
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

export async function runComplaintSlaJob() {
  const records = await listComplaintRecords();
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const dayMs = 24 * 60 * 60 * 1000;

  const created: Array<{ trackingId: string; alertType: string }> = [];
  for (const record of records) {
    if (!record.complaintId || record.dueDateTs == null) continue;
    const diffDays = Math.floor((record.dueDateTs - now.getTime()) / dayMs);

    if (diffDays === 2) {
      if (await createUniqueAlert({ trackingId: record.trackingId, complaintId: record.complaintId, dueDate: record.dueDate, alertType: "SLA_DUE_IN_2_DAYS" })) {
        created.push({ trackingId: record.trackingId, alertType: "SLA_DUE_IN_2_DAYS" });
      }
    }
    if (diffDays === 1) {
      if (await createUniqueAlert({ trackingId: record.trackingId, complaintId: record.complaintId, dueDate: record.dueDate, alertType: "SLA_DUE_IN_1_DAY" })) {
        created.push({ trackingId: record.trackingId, alertType: "SLA_DUE_IN_1_DAY" });
      }
    }
    if (diffDays <= 0) {
      if (await createUniqueAlert({ trackingId: record.trackingId, complaintId: record.complaintId, dueDate: record.dueDate, alertType: "SLA_DUE_TODAY" })) {
        created.push({ trackingId: record.trackingId, alertType: "SLA_DUE_TODAY" });
      }
    }
  }

  return { createdCount: created.length, created };
}

export function startComplaintSlaJob() {
  if (started) return;
  started = true;
  cron.schedule("0 1 * * *", () => {
    runComplaintSlaJob().catch((error) => {
      console.error("[ComplaintSlaJob] Scheduled run failed:", error instanceof Error ? error.message : error);
    });
  });
  console.log("[ComplaintSlaJob] Cron scheduled: daily at 01:00");
}
