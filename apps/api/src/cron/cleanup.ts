import cron from "node-cron";
import fs from "node:fs/promises";
import { getStorageProvider, storageFeatureFlags } from "../storage/provider.js";
import path from "node:path";
import { prisma } from "../lib/prisma.js";
import { outputsDir, uploadsDir } from "../storage/paths.js";
import { logCleanupStagingMode, logTelemetry } from "../telemetry.js";
import { stagingConfig } from "../config.js";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

function isDatabaseUnavailable(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const maybeCode = (error as { code?: string }).code;
  return maybeCode === "P1001";
}

import { getQueue } from "../lib/queue.js";

// Check if a PDF file is safe to delete based on R2 sync status
// Safe to delete if:
// - Dual-write is disabled (R2 sync not tracked)
// - OR file is confirmed synced to R2
// Not safe to delete if:
// - Dual-write is enabled AND sync status is null (pending/failed)
async function isSafeToDeletePdfFile(fileName: string): Promise<boolean> {
  // If dual-write is disabled, always safe to delete (no R2 tracking)
  if (!storageFeatureFlags.ENABLE_DUAL_WRITE) {
    return true;
  }

  // Dual-write enabled: check if file is synced to R2
  const fileNameWithoutExt = fileName.replace(/\.pdf$/, "");
  
  // Try to find the job this file belongs to
  // File naming: {jobId}-labels.pdf, {jobId}-money-orders.pdf
  let jobId: string | null = null;
  if (fileNameWithoutExt.endsWith("-labels")) {
    jobId = fileNameWithoutExt.substring(0, fileNameWithoutExt.length - "-labels".length);
  } else if (fileNameWithoutExt.endsWith("-money-orders")) {
    jobId = fileNameWithoutExt.substring(0, fileNameWithoutExt.length - "-money-orders".length);
  }

  if (!jobId) {
    // Not a tracked PDF file (e.g., temp file), safe to delete
    return true;
  }

  // Check if job exists and has sync status
  try {
    const job = await prisma.labelJob.findUnique({
      where: { id: jobId },
      select: {
        labelsPdfSyncedAt: true,
        moneyOrderPdfSyncedAt: true,
      },
    });

    if (!job) {
      // Job doesn't exist, safe to delete
      return true;
    }

    if (fileNameWithoutExt.endsWith("-labels")) {
      // Check labels PDF sync status
      return job.labelsPdfSyncedAt !== null;
    } else if (fileNameWithoutExt.endsWith("-money-orders")) {
      // Check money order PDF sync status
      return job.moneyOrderPdfSyncedAt !== null;
    }

    // Shouldn't reach here, but default to safe
    return true;
  } catch (err) {
    // Error checking DB, default to not deleting (safer)
    console.warn(`[Cleanup] Error checking sync status for ${fileName}:`, err);
    return false;
  }
}

// Only delete files not referenced by any active/retryable/delayed job in DB or queue
async function deleteOrphanedFiles(dir: string) {
  let entries: string[] = [];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return; // dir may not exist yet
  }
  const now = Date.now();
  const queue = getQueue();

  // Gather all job file references from DB (labelJob, trackingJob)
  const [activeLabelJobs, activeTrackingJobs] = await Promise.all([
    prisma.labelJob.findMany({
      where: { status: { in: ["QUEUED", "PROCESSING", "DELAYED", "RETRY"] } },
      select: { uploadPath: true, labelsPdfPath: true, moneyOrderPdfPath: true },
    }),
    prisma.trackingJob.findMany({
      where: { status: { in: ["QUEUED", "PROCESSING", "DELAYED", "RETRY"] } },
      select: { resultPath: true },
    }),
  ]);
  const referencedFiles = new Set<string>();
  for (const job of activeLabelJobs) {
    if (job.uploadPath) referencedFiles.add(path.resolve(process.cwd(), job.uploadPath));
    if (job.labelsPdfPath) referencedFiles.add(path.resolve(process.cwd(), job.labelsPdfPath));
    if (job.moneyOrderPdfPath) referencedFiles.add(path.resolve(process.cwd(), job.moneyOrderPdfPath));
  }
  for (const job of activeTrackingJobs) {
    if (job.resultPath) referencedFiles.add(path.resolve(process.cwd(), job.resultPath));
  }

  // Gather all filePaths from jobs in BullMQ queue (waiting, active, delayed, retry)
  const queueStates = ["waiting", "active", "delayed", "paused", "waiting-children"] as const; // covers all non-terminal
  const queueJobs = (
    await Promise.all(queueStates.map((state) => queue.getJobs([state as any], 0, -1)))
  ).flat();
  for (const job of queueJobs) {
    const data = job.data || {};
    if (data.filePath) referencedFiles.add(path.resolve(process.cwd(), data.filePath));
    if (data.labelsPdfPath) referencedFiles.add(path.resolve(process.cwd(), data.labelsPdfPath));
    if (data.moneyOrderPdfPath) referencedFiles.add(path.resolve(process.cwd(), data.moneyOrderPdfPath));
    if (data.uploadPath) referencedFiles.add(path.resolve(process.cwd(), data.uploadPath));
    if (data.resultPath) referencedFiles.add(path.resolve(process.cwd(), data.resultPath));
  }

  for (const entry of entries) {
    const full = path.join(dir, entry);
    try {
      const stat = await fs.stat(full); // stat is used for validation, keep as-is
      if (now - stat.mtimeMs > SEVEN_DAYS_MS) {
        // Only delete if not referenced by any active/retryable/delayed job
        if (!referencedFiles.has(full)) {
          // Additional check for PDF files: verify R2 sync status if dual-write enabled
          const isPdfFile = entry.endsWith(".pdf");
          if (isPdfFile && storageFeatureFlags.ENABLE_DUAL_WRITE) {
            const safeToDelete = await isSafeToDeletePdfFile(entry);
            if (!safeToDelete) {
              console.log(`[Cleanup] Skipped file (R2 sync pending): ${full}`);
              continue;
            }
          }

          await getStorageProvider().deleteArtifact("artifact", full);
          console.log(`[Cleanup] Deleted orphaned file: ${full}`);
        }
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
    await getStorageProvider().deleteArtifact("artifact", path.resolve(process.cwd(), relPath));
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
  const stagingCleanupProtection = stagingConfig.STAGING_R2_ENABLED && storageFeatureFlags.ENABLE_DUAL_WRITE;
  logCleanupStagingMode(stagingCleanupProtection);
  logTelemetry({
    event: "cleanup_staging_classification",
    stagingEnabled: stagingConfig.STAGING_R2_ENABLED,
    dualWriteEnabled: storageFeatureFlags.ENABLE_DUAL_WRITE,
    r2UploadsEnabled: storageFeatureFlags.ENABLE_R2_UPLOADS,
    syncProtectionActive: stagingCleanupProtection,
  });

  await Promise.all([deleteOrphanedFiles(outputsDir()), deleteOrphanedFiles(uploadsDir())]);
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
        const storage = getStorageProvider();
        const exists = await storage.artifactExists("pdf", path.resolve(process.cwd(), job.labelsPdfPath));
        if (!exists) {
          data.labelsPdfPath = null;
          needsUpdate = true;
        }
      } catch {
        data.labelsPdfPath = null;
        needsUpdate = true;
      }
    }
    if (job.moneyOrderPdfPath) {
      try {
        const storage = getStorageProvider();
        const exists = await storage.artifactExists("pdf", path.resolve(process.cwd(), job.moneyOrderPdfPath));
        if (!exists) {
          data.moneyOrderPdfPath = null;
          needsUpdate = true;
        }
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
