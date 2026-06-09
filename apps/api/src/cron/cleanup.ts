import cron from "node-cron";
import fs from "node:fs/promises";
import { getDualProviders, getStorageProvider, storageFeatureFlags } from "../storage/provider.js";
import path from "node:path";
import { prisma } from "../lib/prisma.js";
import { outputsDir, resolveSafeUploadCleanupTarget, uploadsDir } from "../storage/paths.js";
import { logCleanupStagingMode, logTelemetry } from "../telemetry.js";
import { stagingConfig } from "../config.js";
import { getNormalizedObjectKey, resolveObjectKeyCandidates } from "../storage/key-normalization.js";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const THREE_DAYS_MS = 72 * 60 * 60 * 1000;
const R2_SYNC_LOCAL_DELETE_GRACE_MS = Math.max(60_000, Number(process.env.R2_SYNC_LOCAL_DELETE_GRACE_MS ?? 24 * 60 * 60 * 1000));
const FAILED_JOB_LEFTOVER_GRACE_MS = Math.max(60_000, Number(process.env.FAILED_JOB_LEFTOVER_GRACE_MS ?? THREE_DAYS_MS));
const UPLOAD_TEMP_CLEANUP_GRACE_MS = Math.max(60_000, Number(process.env.UPLOAD_TEMP_CLEANUP_GRACE_MS ?? ONE_DAY_MS));
const ENABLE_UPLOAD_LOCAL_CLEANUP_AFTER_R2 = process.env.ENABLE_UPLOAD_LOCAL_CLEANUP_AFTER_R2 === "true";
const UPLOAD_LOCAL_CLEANUP_GRACE_MS = Math.max(60_000, Number(process.env.UPLOAD_LOCAL_CLEANUP_GRACE_MS ?? 3_600_000));
const UPLOAD_LOCAL_CLEANUP_MAX_ATTEMPTS = Math.max(1, Number(process.env.UPLOAD_LOCAL_CLEANUP_MAX_ATTEMPTS ?? 5));

const uploadCleanupStatuses = {
  PENDING: "PENDING",
  COMPLETED: "COMPLETED",
  RETRY_PENDING: "RETRY_PENDING",
  FAILED_TERMINAL: "FAILED_TERMINAL",
  SKIPPED_UNSAFE_PATH: "SKIPPED_UNSAFE_PATH",
  SKIPPED_MISSING_FILE: "SKIPPED_MISSING_FILE",
} as const;

type CleanupEventName =
  | "cleanup_delete"
  | "cleanup_skip_unsynced"
  | "cleanup_skip_recent"
  | "cleanup_delete_failed_leftover"
  | "cleanup_delete_r2_synced_local_copy";

function logCleanupDecision(event: CleanupEventName, action: "deleted" | "skipped", filePath: string, ageMs: number, reason: string) {
  console.log(`[Cleanup] event=${event} action=${action.toUpperCase()} path=${filePath} ageMs=${Math.max(0, Math.floor(ageMs))} reason=${reason}`);
}

function nextUploadCleanupRetryDate(nextAttemptNumber: number): Date {
  const baseDelayMs = 15 * 60 * 1000;
  const maxDelayMs = 24 * 60 * 60 * 1000;
  const delayMs = Math.min(maxDelayMs, baseDelayMs * Math.max(1, 2 ** (nextAttemptNumber - 1)));
  return new Date(Date.now() + delayMs);
}

function isDatabaseUnavailable(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const maybeCode = (error as { code?: string }).code;
  return maybeCode === "P1001";
}

import { getQueue } from "../lib/queue.js";

function parseTrackedArtifact(fileName: string): {
  jobId: string;
  artifactType: "labels" | "moneyOrders" | "tracking" | "trackingMaster";
} | null {
  const fileNameWithoutExt = fileName.replace(/\.(pdf|json|xlsx)$/i, "");
  if (fileNameWithoutExt.endsWith("-labels")) {
    return {
      jobId: fileNameWithoutExt.substring(0, fileNameWithoutExt.length - "-labels".length),
      artifactType: "labels",
    };
  }
  if (fileNameWithoutExt.endsWith("-money-orders")) {
    return {
      jobId: fileNameWithoutExt.substring(0, fileNameWithoutExt.length - "-money-orders".length),
      artifactType: "moneyOrders",
    };
  }
  if (fileNameWithoutExt.endsWith("-tracking")) {
    return {
      jobId: fileNameWithoutExt.substring(0, fileNameWithoutExt.length - "-tracking".length),
      artifactType: "tracking",
    };
  }
  if (fileNameWithoutExt.endsWith("-tracking-master")) {
    return {
      jobId: fileNameWithoutExt.substring(0, fileNameWithoutExt.length - "-tracking-master".length),
      artifactType: "trackingMaster",
    };
  }
  return null;
}

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
  // Try to find the job this file belongs to.
  // File naming: {jobId}-labels.pdf, {jobId}-money-orders.pdf, {jobId}-tracking.json, {jobId}-tracking-master.xlsx
  const tracked = parseTrackedArtifact(fileName);
  if (!tracked) {
    // Not a tracked file, safe to delete
    return true;
  }

  // Check if job exists and has sync status
  try {
    // For labels and money orders, check LabelJob; for tracking, check TrackingJob
    if (tracked.artifactType === "tracking") {
      const trackingJob = await prisma.trackingJob.findUnique({
        where: { id: tracked.jobId },
        select: { resultSyncedAt: true },
      });
      if (!trackingJob) return true; // Job doesn't exist, safe to delete
      return trackingJob.resultSyncedAt !== null; // Safe only if synced
    } else {
      const labelJob = await prisma.labelJob.findUnique({
        where: { id: tracked.jobId },
        select: {
          labelsPdfSyncedAt: true,
          moneyOrderPdfSyncedAt: true,
          trackingMasterSyncedAt: true,
        },
      });
      if (!labelJob) return true; // Job doesn't exist, safe to delete

      if (tracked.artifactType === "labels") {
        return labelJob.labelsPdfSyncedAt !== null; // Safe only if synced
      } else if (tracked.artifactType === "moneyOrders") {
        return labelJob.moneyOrderPdfSyncedAt !== null; // Safe only if synced
      } else if (tracked.artifactType === "trackingMaster") {
        return labelJob.trackingMasterSyncedAt !== null; // Safe only if synced
      }
    }
    
    return true; // Shouldn't reach here, default to safe
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
  const normalizedUploadsDir = path.resolve(uploadsDir());
  const normalizedOutputsDir = path.resolve(outputsDir());
  const dirResolved = path.resolve(dir);
  const isUploadsDirectory = dirResolved === normalizedUploadsDir;
  const isOutputsDirectory = dirResolved === normalizedOutputsDir;
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
      const ageMs = now - stat.mtimeMs;
      if (referencedFiles.has(full)) {
        logCleanupDecision("cleanup_skip_recent", "skipped", full, ageMs, "referenced_by_active_or_queued_job");
        continue;
      }

      const trackedArtifact = parseTrackedArtifact(entry);
      const canUseR2SyncedGrace = storageFeatureFlags.ENABLE_DUAL_WRITE && trackedArtifact !== null;

      if (canUseR2SyncedGrace && trackedArtifact) {
        const safeToDelete = await isSafeToDeletePdfFile(entry);
        if (!safeToDelete) {
          if (ageMs < FAILED_JOB_LEFTOVER_GRACE_MS) {
            logCleanupDecision("cleanup_skip_unsynced", "skipped", full, ageMs, "r2_sync_pending_or_unknown");
            continue;
          }
          await getStorageProvider().deleteArtifact("artifact", full);
          logCleanupDecision("cleanup_delete_failed_leftover", "deleted", full, ageMs, "unsynced_beyond_failed_leftover_grace");
          continue;
        }

        if (ageMs < R2_SYNC_LOCAL_DELETE_GRACE_MS) {
          logCleanupDecision("cleanup_skip_recent", "skipped", full, ageMs, "within_r2_synced_grace_period");
          continue;
        }

        await getStorageProvider().deleteArtifact("artifact", full);
        logCleanupDecision("cleanup_delete_r2_synced_local_copy", "deleted", full, ageMs, "r2_synced_or_legacy_safe_orphan");
        continue;
      }

      if (isUploadsDirectory) {
        if (ENABLE_UPLOAD_LOCAL_CLEANUP_AFTER_R2) {
          logCleanupDecision("cleanup_skip_recent", "skipped", full, ageMs, "phase_c_upload_cleanup_pass_enabled");
          continue;
        }

        if (ageMs < UPLOAD_TEMP_CLEANUP_GRACE_MS) {
          logCleanupDecision("cleanup_skip_recent", "skipped", full, ageMs, "upload_temp_within_grace_period");
          continue;
        }

        await getStorageProvider().deleteArtifact("artifact", full);
        logCleanupDecision("cleanup_delete", "deleted", full, ageMs, "upload_temp_older_than_grace");
        continue;
      }

      if (isOutputsDirectory && entry.endsWith("-complaint.json")) {
        if (ageMs < ONE_DAY_MS) {
          logCleanupDecision("cleanup_skip_recent", "skipped", full, ageMs, "complaint_result_within_grace_period");
          continue;
        }

        await getStorageProvider().deleteArtifact("artifact", full);
        logCleanupDecision("cleanup_delete", "deleted", full, ageMs, "complaint_result_older_than_grace");
        continue;
      }

      if (ageMs < FAILED_JOB_LEFTOVER_GRACE_MS) {
        logCleanupDecision("cleanup_skip_recent", "skipped", full, ageMs, "age_below_failed_leftover_threshold");
        continue;
      }

      await getStorageProvider().deleteArtifact("artifact", full);
      logCleanupDecision("cleanup_delete_failed_leftover", "deleted", full, ageMs, "orphan_older_than_failed_leftover_threshold");
    } catch {
      // ignore errors for individual files
    }
  }
}

async function cleanupUploadSourcesAfterR2Sync() {
  if (!ENABLE_UPLOAD_LOCAL_CLEANUP_AFTER_R2) {
    return;
  }

  const now = new Date();
  const syncCutoff = new Date(now.getTime() - UPLOAD_LOCAL_CLEANUP_GRACE_MS);

  const candidates = await prisma.labelJob.findMany({
    where: {
      uploadSyncStatus: "R2_SYNCED",
      uploadObjectKey: { not: null },
      uploadSyncedAt: { not: null, lte: syncCutoff },
      uploadLocalDeletedAt: null,
      OR: [
        { uploadLocalCleanupStatus: null },
        { uploadLocalCleanupStatus: { in: [uploadCleanupStatuses.PENDING, uploadCleanupStatuses.RETRY_PENDING] } },
      ],
      AND: [
        {
          OR: [
            { uploadLocalCleanupNextRetryAt: null },
            { uploadLocalCleanupNextRetryAt: { lte: now } },
          ],
        },
        {
          uploadLocalCleanupAttempts: { lt: UPLOAD_LOCAL_CLEANUP_MAX_ATTEMPTS },
        },
      ],
    },
    select: {
      id: true,
      uploadPath: true,
      uploadObjectKey: true,
      uploadSyncedAt: true,
      uploadLocalCleanupAttempts: true,
      uploadLocalCleanupStatus: true,
    },
    orderBy: { uploadSyncedAt: "asc" },
    take: 250,
  });

  let deletedCount = 0;
  let missingCount = 0;
  let unsafeCount = 0;
  let retryCount = 0;
  let terminalCount = 0;

  for (const job of candidates) {
    const attempts = job.uploadLocalCleanupAttempts ?? 0;
    const safeTarget = await resolveSafeUploadCleanupTarget(job.uploadPath);

    if (!safeTarget.ok) {
      if (safeTarget.reason === "missing_file") {
        await prisma.labelJob.update({
          where: { id: job.id },
          data: {
            uploadLocalCleanupStatus: uploadCleanupStatuses.SKIPPED_MISSING_FILE,
            uploadLocalDeletedAt: now,
            uploadLocalCleanupLastError: null,
            uploadLocalCleanupNextRetryAt: null,
          },
        });
        missingCount += 1;
        continue;
      }

      await prisma.labelJob.update({
        where: { id: job.id },
        data: {
          uploadLocalCleanupStatus: uploadCleanupStatuses.SKIPPED_UNSAFE_PATH,
          uploadLocalCleanupLastError: safeTarget.error ?? safeTarget.reason,
          uploadLocalCleanupNextRetryAt: null,
        },
      });
      console.warn(`[Cleanup] Skipping unsafe upload path for job ${job.id}: ${safeTarget.reason} (${safeTarget.resolvedPath})`);
      unsafeCount += 1;
      continue;
    }

    try {
      await getStorageProvider().deleteArtifact("artifact", safeTarget.resolvedPath);
      await prisma.labelJob.update({
        where: { id: job.id },
        data: {
          uploadLocalDeletedAt: now,
          uploadLocalCleanupStatus: uploadCleanupStatuses.COMPLETED,
          uploadLocalCleanupLastError: null,
          uploadLocalCleanupNextRetryAt: null,
        },
      });
      deletedCount += 1;
    } catch (error) {
      const nextAttempts = attempts + 1;
      const isTerminal = nextAttempts >= UPLOAD_LOCAL_CLEANUP_MAX_ATTEMPTS;
      const status = isTerminal ? uploadCleanupStatuses.FAILED_TERMINAL : uploadCleanupStatuses.RETRY_PENDING;
      const retryAt = isTerminal ? null : nextUploadCleanupRetryDate(nextAttempts);
      const errorMessage = error instanceof Error ? error.message : String(error);

      await prisma.labelJob.update({
        where: { id: job.id },
        data: {
          uploadLocalCleanupAttempts: nextAttempts,
          uploadLocalCleanupStatus: status,
          uploadLocalCleanupLastError: errorMessage,
          uploadLocalCleanupNextRetryAt: retryAt,
        },
      });

      if (isTerminal) {
        terminalCount += 1;
      } else {
        retryCount += 1;
      }
      console.warn(`[Cleanup] Upload local cleanup failed for job ${job.id} (attempt ${nextAttempts}/${UPLOAD_LOCAL_CLEANUP_MAX_ATTEMPTS}): ${errorMessage}`);
    }
  }

  logTelemetry({
    event: "upload_local_cleanup_summary",
    enabled: true,
    graceMs: UPLOAD_LOCAL_CLEANUP_GRACE_MS,
    maxAttempts: UPLOAD_LOCAL_CLEANUP_MAX_ATTEMPTS,
    scanned: candidates.length,
    deleted: deletedCount,
    missing: missingCount,
    unsafe: unsafeCount,
    retryPending: retryCount,
    failedTerminal: terminalCount,
  });
}

async function cleanupFailedJobLeftovers() {
  const cutoff = new Date(Date.now() - FAILED_JOB_LEFTOVER_GRACE_MS);
  const failedJobs = await prisma.labelJob.findMany({
    where: {
      status: "FAILED",
      updatedAt: { lt: cutoff },
    },
    select: {
      id: true,
      uploadPath: true,
      labelsPdfPath: true,
      moneyOrderPdfPath: true,
      trackingMasterPath: true,
      updatedAt: true,
    },
  });

  for (const job of failedJobs) {
    const trackingJob = await prisma.trackingJob.findUnique({
      where: { id: job.id },
      select: { resultPath: true },
    });

    const paths = [
      job.uploadPath,
      job.labelsPdfPath,
      job.moneyOrderPdfPath,
      job.trackingMasterPath,
      trackingJob?.resultPath,
    ].filter(Boolean) as string[];

    for (const relPath of paths) {
      const full = path.resolve(process.cwd(), relPath);
      try {
        const stat = await fs.stat(full);
        const ageMs = Date.now() - stat.mtimeMs;
        await getStorageProvider().deleteArtifact("artifact", full);
        logCleanupDecision("cleanup_delete_failed_leftover", "deleted", full, ageMs, "failed_job_leftover");
      } catch {
        // ignore if file does not exist
      }
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

async function removeArtifactFromDualProviders(
  type: "pdf" | "json" | "xlsx",
  relPath: string | null | undefined,
  options: {
    jobId?: string;
    artifactType?: "labelsPdf" | "moneyOrderPdf" | "trackingResult" | "trackingMasterXlsx";
    fallbackLegacyPaths?: string[];
  },
) {
  if (!relPath) return;
  const { local, r2 } = getDualProviders();
  const localPathCandidates = new Set<string>([
    path.resolve(process.cwd(), relPath),
    ...(options.fallbackLegacyPaths ?? []).map((p) => path.resolve(process.cwd(), p)),
  ]);

  for (const localPath of localPathCandidates) {
    try {
      await local.deleteArtifact("artifact", localPath);
    } catch {
      // ignore missing local files
    }
  }

  const r2KeyCandidates = new Set<string>();

  if (options.jobId && options.artifactType) {
    const normalized = getNormalizedObjectKey(options.jobId, options.artifactType);
    r2KeyCandidates.add(normalized.replace(/^(pdf|json|xlsx)\//, ""));
  }

  const candidateBases = [relPath, ...localPathCandidates, ...(options.fallbackLegacyPaths ?? [])];
  for (const base of candidateBases) {
    const candidates = resolveObjectKeyCandidates({
      type,
      key: base,
      compatibilityEnabled: true,
      jobId: options.jobId,
      artifactType: options.artifactType,
    });
    for (const candidate of candidates) {
      r2KeyCandidates.add(candidate.objectKey.replace(/^(pdf|json|xlsx)\//, ""));
    }
  }

  for (const r2Key of r2KeyCandidates) {
    try {
      await r2.deleteArtifact(type, r2Key);
    } catch {
      // ignore missing/legacy mismatch keys
    }
  }
}

async function cleanupExpiredLabelJobsByDeleteAfterAt() {
  const now = new Date();
  const expiredJobs = await prisma.labelJob.findMany({
    where: {
      deleteAfterAt: { not: null, lte: now },
      status: { notIn: ["QUEUED", "PROCESSING", "DELAYED", "RETRY"] },
    },
    select: {
      id: true,
      userId: true,
      labelsPdfPath: true,
      moneyOrderPdfPath: true,
      uploadPath: true,
      trackingMasterPath: true,
      deleteAfterAt: true,
      retentionTierSnapshot: true,
    },
  });

  for (const job of expiredJobs) {
    const trackingJob = await prisma.trackingJob.findFirst({
      where: { id: job.id, userId: job.userId },
      select: { resultPath: true },
    });

    const legacyTrackingMasterPath = path.join(outputsDir(), `${job.id}-tracking-master.xlsx`);

    await Promise.all([
      removeStoredFile(job.uploadPath ?? null),
      removeArtifactFromDualProviders("pdf", job.labelsPdfPath ?? null, {
        jobId: job.id,
        artifactType: "labelsPdf",
      }),
      removeArtifactFromDualProviders("pdf", job.moneyOrderPdfPath ?? null, {
        jobId: job.id,
        artifactType: "moneyOrderPdf",
      }),
      removeArtifactFromDualProviders("json", trackingJob?.resultPath ?? null, {
        jobId: job.id,
        artifactType: "trackingResult",
      }),
      removeArtifactFromDualProviders("xlsx", job.trackingMasterPath ?? legacyTrackingMasterPath, {
        jobId: job.id,
        artifactType: "trackingMasterXlsx",
        fallbackLegacyPaths: [legacyTrackingMasterPath],
      }),
    ]);

    await prisma.$transaction([
      prisma.trackingJob.deleteMany({ where: { id: job.id, userId: job.userId } }),
      prisma.labelJob.deleteMany({ where: { id: job.id, userId: job.userId } }),
    ]);

    await prisma.$executeRaw`DELETE FROM job_deletion_schedules WHERE job_id = ${job.id}`;

    logTelemetry({
      event: "retention_deleteafter_cleanup",
      jobId: job.id,
      userId: job.userId,
      deleteAfterAt: job.deleteAfterAt?.toISOString() ?? null,
      retentionTierSnapshot: job.retentionTierSnapshot ?? null,
      status: "deleted",
    });
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
        id: true,
        uploadPath: true,
        labelsPdfPath: true,
        moneyOrderPdfPath: true,
        trackingMasterPath: true,
      },
    });
    const trackingJob = await prisma.trackingJob.findFirst({
      where: { id: row.job_id, userId: row.user_id },
      select: { resultPath: true },
    });

    const legacyTrackingMasterPath = path.join(outputsDir(), `${row.job_id}-tracking-master.xlsx`);

    await Promise.all([
      removeStoredFile(job?.uploadPath ?? null),
      removeArtifactFromDualProviders("pdf", job?.labelsPdfPath ?? null, {
        jobId: row.job_id,
        artifactType: "labelsPdf",
      }),
      removeArtifactFromDualProviders("pdf", job?.moneyOrderPdfPath ?? null, {
        jobId: row.job_id,
        artifactType: "moneyOrderPdf",
      }),
      removeArtifactFromDualProviders("json", trackingJob?.resultPath ?? null, {
        jobId: row.job_id,
        artifactType: "trackingResult",
      }),
      removeArtifactFromDualProviders("xlsx", job?.trackingMasterPath ?? legacyTrackingMasterPath, {
        jobId: row.job_id,
        artifactType: "trackingMasterXlsx",
        fallbackLegacyPaths: [legacyTrackingMasterPath],
      }),
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
  await cleanupUploadSourcesAfterR2Sync();
  await cleanupFailedJobLeftovers();
  await cleanupExpiredLabelJobsByDeleteAfterAt();
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

  // Non-complaint shipments (complaintStatus IS NULL or "NOT_REQUIRED"):
  //   non-pending → 30-day retention
  //   pending     → 90-day retention (kept longer for tracking visibility)
  // Complaint records (any other complaintStatus value):
  //   90-day retention regardless of shipment.status
  //   This ensures Phase B (updating shipment.status from live tracking
  //   data) does not shorten retention from 90 to 30 days for delivered
  //   complaint records whose status column changes from PENDING to DELIVERED.
  const noComplaint = [
    { complaintStatus: null },
    { complaintStatus: "NOT_REQUIRED" },
  ];
  await prisma.shipment.deleteMany({
    where: {
      updatedAt: { lt: new Date(now - THIRTY_DAYS_MS) },
      status: { notIn: ["PENDING"] },
      OR: noComplaint,
    },
  });
  await prisma.shipment.deleteMany({
    where: {
      updatedAt: { lt: new Date(now - NINETY_DAYS_MS) },
      status: { in: ["PENDING"] },
      OR: noComplaint,
    },
  });
  await prisma.shipment.deleteMany({
    where: {
      updatedAt: { lt: new Date(now - NINETY_DAYS_MS) },
      NOT: { OR: noComplaint },
    },
  });

  console.log("[Cleanup] Storage cleanup complete.");
}

export async function runCleanupNow() {
  await runCleanup();
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
