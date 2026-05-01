import cron from "node-cron";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { env } from "../config.js";

let started = false;

async function ensureWatcherTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS complaint_watch_snapshots (
      id TEXT PRIMARY KEY,
      payload_json TEXT NOT NULL,
      alert_required BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

function buildSnapshot() {
  return {
    expectedFieldIds: ["ArticleNo", "txtSenderName", "txtReceiverName", "DDDistrict", "DDTehsil", "DDLocations", "txtRemarks"],
    hiddenFields: ["__VIEWSTATE", "__EVENTVALIDATION", "__VIEWSTATEGENERATOR"],
    formAction: String(env.PYTHON_SERVICE_URL ?? "").trim() || "python-service",
    dropdownIds: ["DDDistrict", "DDTehsil", "DDLocations"],
    capturedAt: new Date().toISOString(),
  };
}

function requiresAlert(snapshot: ReturnType<typeof buildSnapshot>) {
  return snapshot.expectedFieldIds.length === 0
    || snapshot.hiddenFields.length === 0
    || snapshot.dropdownIds.length < 3;
}

export async function runComplaintWatcherJob() {
  await ensureWatcherTable();
  const snapshot = buildSnapshot();
  const alertRequired = requiresAlert(snapshot);

  await prisma.$executeRawUnsafe(
    `INSERT INTO complaint_watch_snapshots (id, payload_json, alert_required) VALUES ($1, $2, $3)`,
    randomUUID(),
    JSON.stringify(snapshot),
    alertRequired,
  );

  if (alertRequired) {
    console.error("[ComplaintWatch] Alert required: complaint form structure drift detected");
  }

  return { alertRequired, snapshot };
}

export function startComplaintWatcherJob() {
  if (started) return;
  started = true;
  cron.schedule("0 */6 * * *", () => {
    runComplaintWatcherJob().catch((error) => {
      console.error("[ComplaintWatch] Scheduled run failed:", error instanceof Error ? error.message : error);
    });
  });
  console.log("[ComplaintWatch] Cron scheduled: every 6 hours");
}
