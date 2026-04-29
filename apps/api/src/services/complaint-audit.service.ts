import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma.js";

export type ComplaintAuditAction =
  | "complaint_created"
  | "complaint_synced"
  | "complaint_exported"
  | "complaint_updated"
  | "complaint_closed";

export async function ensureComplaintAuditTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS complaint_audit_logs (
      id TEXT PRIMARY KEY,
      actor_email TEXT NOT NULL,
      action TEXT NOT NULL,
      tracking_id TEXT,
      complaint_id TEXT,
      details TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

export async function logComplaintAudit(input: {
  actorEmail: string;
  action: ComplaintAuditAction;
  trackingId?: string;
  complaintId?: string;
  details?: string;
}) {
  await ensureComplaintAuditTable();
  await prisma.$executeRawUnsafe(
    `INSERT INTO complaint_audit_logs (id, actor_email, action, tracking_id, complaint_id, details)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    randomUUID(),
    String(input.actorEmail ?? "system").trim() || "system",
    input.action,
    input.trackingId ?? null,
    input.complaintId ?? null,
    input.details ?? null,
  );
}

export async function listComplaintAuditLogs(limit = 200) {
  await ensureComplaintAuditTable();
  return prisma.$queryRawUnsafe<Array<{
    id: string;
    actorEmail: string;
    action: string;
    trackingId: string | null;
    complaintId: string | null;
    details: string | null;
    createdAt: string;
  }>>(
    `SELECT id, actor_email as "actorEmail", action, tracking_id as "trackingId", complaint_id as "complaintId", details, created_at as "createdAt"
     FROM complaint_audit_logs
     ORDER BY created_at DESC
     LIMIT ${Number(limit)}`,
  );
}