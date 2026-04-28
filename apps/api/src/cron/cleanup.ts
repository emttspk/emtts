import cron from "node-cron";
import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "../lib/prisma.js";
import { outputsDir, uploadsDir } from "../storage/paths.js";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

function isDatabaseUnavailable(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const maybeCode = (error as { code?: string }).code;
  return maybeCode === "P1001";
}

async function deleteOldFiles(dir: string) {
  let entries: string[] = [];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return; // dir may not exist yet
  }
  const now = Date.now();
  for (const entry of entries) {
    const full = path.join(dir, entry);
    try {
      const stat = await fs.stat(full);
      if (now - stat.mtimeMs > SEVEN_DAYS_MS) {
        await fs.unlink(full);
        console.log(`[Cleanup] Deleted old file: ${full}`);
      }
    } catch {
      // ignore errors for individual files
    }
  }
}

async function ensureJobDeletionSchedulesTable() {
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS job_deletion_schedules (
      job_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      delete_after_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `;
}

async function removeStoredFile(relPath: string | null | undefined) {
  if (!relPath) return;
  try {
    await fs.unlink(path.resolve(process.cwd(), relPath));
  } catch {
    // ignore missing files
  }
}

async function cleanupScheduledJobDeletions() {
  await ensureJobDeletionSchedulesTable();
  const rows = await prisma.$queryRaw<Array<{ job_id: string; user_id: string; delete_after_at: string }>>`
    SELECT job_id, user_id, delete_after_at FROM job_deletion_schedules
  `;

  for (const row of rows) {
    if (new Date(row.delete_after_at).getTime() > Date.now()) continue;

    const job = await prisma.labelJob.findFirst({
      where: { id: row.job_id, userId: row.user_id },
      select: {
        uploadPath: true,
        labelsPdfPath: true,
        moneyOrderPdfPath: true,
      },
    });
    const trackingJob = await prisma.trackingJob.findFirst({
      where: { id: row.job_id, userId: row.user_id },
      select: { resultPath: true },
    });

    await Promise.all([
      removeStoredFile(job?.uploadPath ?? null),
      removeStoredFile(job?.labelsPdfPath ?? null),
      removeStoredFile(job?.moneyOrderPdfPath ?? null),
      removeStoredFile(trackingJob?.resultPath ?? null),
    ]);

    await prisma.$transaction([
      prisma.trackingJob.deleteMany({ where: { id: row.job_id, userId: row.user_id } }),
      prisma.labelJob.deleteMany({ where: { id: row.job_id, userId: row.user_id } }),
    ]);
    await prisma.$executeRaw`DELETE FROM job_deletion_schedules WHERE job_id = ${row.job_id}`;
  }
}

async function runCleanup() {
  console.log("[Cleanup] Starting storage cleanup...");
  await Promise.all([deleteOldFiles(outputsDir()), deleteOldFiles(uploadsDir())]);
  await cleanupScheduledJobDeletions();

  // Null out paths for jobs whose files are now gone
  const oldJobs = await prisma.labelJob.findMany({
    where: {
      status: "COMPLETED",
      createdAt: { lt: new Date(Date.now() - SEVEN_DAYS_MS) },
    },
    select: { id: true, labelsPdfPath: true, moneyOrderPdfPath: true },
  });

  for (const job of oldJobs) {
    let needsUpdate = false;
    const data: { labelsPdfPath?: null; moneyOrderPdfPath?: null } = {};
    if (job.labelsPdfPath) {
      try {
        await fs.access(path.resolve(process.cwd(), job.labelsPdfPath));
      } catch {
        data.labelsPdfPath = null;
        needsUpdate = true;
      }
    }
    if (job.moneyOrderPdfPath) {
      try {
        await fs.access(path.resolve(process.cwd(), job.moneyOrderPdfPath));
      } catch {
        data.moneyOrderPdfPath = null;
        needsUpdate = true;
      }
    }
    if (needsUpdate) {
      await prisma.labelJob.update({ where: { id: job.id }, data });
    }
  }

  const now = Date.now();
  // Delete tracking jobs older than 30 days
  await prisma.trackingJob.deleteMany({
    where: { createdAt: { lt: new Date(now - THIRTY_DAYS_MS) } },
  });

  // Delete shipments older than 30 days (non-pending); keep pending for 90 days
  await prisma.shipment.deleteMany({
    where: {
      updatedAt: { lt: new Date(now - THIRTY_DAYS_MS) },
      status: { notIn: ["PENDING"] },
    },
  });
  await prisma.shipment.deleteMany({
    where: {
      updatedAt: { lt: new Date(now - NINETY_DAYS_MS) },
      status: { in: ["PENDING"] },
    },
  });

  console.log("[Cleanup] Storage cleanup complete.");
}

// Run daily at 02:00
export function startCleanupCron() {
  cron.schedule("0 2 * * *", () => {
    runCleanup().catch((err) => {
      if (isDatabaseUnavailable(err)) {
        console.warn("[Cleanup] Skipping run because database is temporarily unreachable.");
        return;
      }
      console.error("[Cleanup] Error:", err);
    });
  });
  console.log("[Cleanup] Cron job scheduled: daily at 02:00");
}
