import dotenv from "dotenv";
dotenv.config();

import { LocalStorageProvider } from "./LocalStorageProvider.js";
import { R2StorageProvider, R2Config } from "./R2StorageProvider.js";
import type { StorageProvider } from "./StorageProvider.js";
import { prisma } from "../lib/prisma.js";
import {
  activeDualWritesGauge,
  activeR2StreamsGauge,
  canaryAllowedJobsCounter,
  canarySkippedJobsCounter,
  dualWriteSuccessRatioGauge,
  metrics,
  r2ConcurrencyLimitHits,
  r2FailureCounter,
  r2TimeoutCounter,
  unsyncedArtifactsGauge,
} from "../metrics.js";
import { logTelemetry, logCanarySkipped, logCanaryAllowed } from "../telemetry.js";
import { r2Config, resolveR2CredentialEnv, stagingConfig } from "../config.js";
import { Semaphore } from "async-mutex";

const localProvider = new LocalStorageProvider();
let r2Provider: R2StorageProvider | null = null;

// Feature flags/env
const STORAGE_PROVIDER = process.env.STORAGE_PROVIDER || "local";
const ENABLE_DUAL_WRITE = process.env.ENABLE_DUAL_WRITE === "true";
const ENABLE_DUAL_READ = process.env.ENABLE_DUAL_READ === "true";
const ENABLE_R2_UPLOADS = process.env.ENABLE_R2_UPLOADS === "true";
const ENABLE_R2_DOWNLOADS = process.env.ENABLE_R2_DOWNLOADS === "true";
const DELETE_LOCAL_AFTER_R2_SYNC = process.env.DELETE_LOCAL_AFTER_R2_SYNC === "true";

// Stage S1 Staging: Canary mode tracking
let dualWriteJobsThisSession = 0;
let dualWriteAttemptsThisSession = 0;
let dualWriteSuccessesThisSession = 0;
let unsyncedArtifactsCount = 0;

const dualWriteUploadSemaphore = new Semaphore(r2Config.MAX_CONCURRENT_STREAMS);

function clampNonNegative(value: number): number {
  return value < 0 ? 0 : value;
}

function updateDualWriteSuccessRatioGauge() {
  if (dualWriteAttemptsThisSession <= 0) {
    dualWriteSuccessRatioGauge.set(0);
    return;
  }
  const ratio = Math.max(
    0,
    Math.min(100, (dualWriteSuccessesThisSession / dualWriteAttemptsThisSession) * 100),
  );
  dualWriteSuccessRatioGauge.set(ratio);
}

function incrementUnsyncedArtifacts() {
  unsyncedArtifactsCount += 1;
  unsyncedArtifactsGauge.set(clampNonNegative(unsyncedArtifactsCount));
}

function decrementUnsyncedArtifacts() {
  unsyncedArtifactsCount = clampNonNegative(unsyncedArtifactsCount - 1);
  unsyncedArtifactsGauge.set(unsyncedArtifactsCount);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`dual_write_upload_timeout_${timeoutMs}ms`)), timeoutMs);
  });
  return Promise.race([promise, timeout]);
}

// Helper: Check if job should proceed with dual-write based on canary mode
function shouldDualWriteThisJob(): boolean {
  // If staging disabled, never dual-write
  if (!stagingConfig.STAGING_R2_ENABLED) {
    return false;
  }

  // If canary is disabled, always dual-write when flags enabled
  if (stagingConfig.CANARY_MODE === "disabled") {
    return true;
  }

  // Canary mode: job-percentage
  if (stagingConfig.CANARY_MODE === "job-percentage") {
    const random = Math.random() * 100;
    if (random <= stagingConfig.CANARY_PERCENTAGE) {
      canaryAllowedJobsCounter.inc();
      logCanaryAllowed("percentage_allowed");
      return true;
    }
    canarySkippedJobsCounter.inc();
    logCanarySkipped("percentage_gate");
    return false;
  }

  // Canary mode: job-count
  if (stagingConfig.CANARY_MODE === "job-count") {
    if (dualWriteJobsThisSession < stagingConfig.CANARY_MAX_JOBS) {
      dualWriteJobsThisSession++;
      canaryAllowedJobsCounter.inc();
      logCanaryAllowed("job_count_available");
      return true;
    }
    canarySkippedJobsCounter.inc();
    logCanarySkipped("job_count_limit");
    return false;
  }

  return true;
}

function getR2ConfigFromEnv(): R2Config {
  const creds = resolveR2CredentialEnv();
  return {
    accessKeyId: creds.accessKeyId,
    secretAccessKey: creds.secretAccessKey,
    endpoint: process.env.R2_ENDPOINT || "",
    region: process.env.R2_REGION || "auto",
    bucket: process.env.R2_BUCKET || "",
  };
}

function getR2Provider(): R2StorageProvider {
  if (!r2Provider) {
    r2Provider = new R2StorageProvider(getR2ConfigFromEnv());
  }
  return r2Provider;
}

export function getStorageProvider(): StorageProvider {
  // Local is always primary/default
  if (STORAGE_PROVIDER === "r2") {
    return getR2Provider();
  }
  return localProvider;
}

// Dual-provider hooks (for future dual-write/read)
export function getDualProviders(): { local: StorageProvider; r2: R2StorageProvider } {
  return { local: localProvider, r2: getR2Provider() };
}

// Async dual-write for Worker-generated artifacts
// Local write is synchronous and authoritative; R2 upload is async/non-blocking
// Stage S1: Canary mode gates dual-write if STAGING_R2_ENABLED and canary mode active
// Optional: syncTrackingContext allows tracking R2 sync status in DB after upload succeeds
export async function writeArtifactWithDualUpload(
  type: string,
  key: string,
  data: Buffer | string,
  syncTrackingContext?: {jobId: string, artifactType: "labelsPdf" | "moneyOrderPdf" | "trackingResult" | "trackingMasterXlsx"}
): Promise<string> {
  // Always write to local first (synchronous, authoritative)
  const localPath = await localProvider.writeArtifact(type, key, data);

  // Phase 9B Day 1: Compute the upload key (may be normalized or legacy depending on flag)
  const r2ProviderInstance = getR2Provider() as any; // Cast to access computeUploadObjectKey
  let uploadObjectKey = key;
  let uploadKeyVersion: "legacy" | "normalized" = "legacy";
  try {
    if (typeof r2ProviderInstance.computeUploadObjectKey === "function") {
      const computed = r2ProviderInstance.computeUploadObjectKey(type, key, {
        jobId: syncTrackingContext?.jobId,
        artifactType: syncTrackingContext?.artifactType,
      });
      uploadObjectKey = computed.objectKey;
      uploadKeyVersion = computed.objectKeyVersion;
    }
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[storage] computeUploadObjectKey error (Phase 9B)", err);
    }
  }

  // Telemetry: dual-write start
  logTelemetry({
    event: "dual_write_start",
    artifactType: syncTrackingContext?.artifactType || type,
    jobId: syncTrackingContext?.jobId,
    provider: "local",
    objectKey: uploadObjectKey,
  });
  
  // Phase 9B: Log actual key version (legacy or normalized)
  try {
    // Defensive: never throw, always logs
    const { logObjectKeyVersion } = await import("../telemetry.js");
    logObjectKeyVersion({
      jobId: syncTrackingContext?.jobId,
      artifactType: syncTrackingContext?.artifactType,
      keyVersion: uploadKeyVersion,
      rawKey: key,
      normalizedKey: uploadKeyVersion === "normalized" ? uploadObjectKey : undefined,
    });
  } catch (err) {
    // Defensive: never throw
    if (process.env.NODE_ENV !== "production") {
      console.warn("[telemetry] logObjectKeyVersion error (Phase 9B)", err);
    }
  }

  // Stage S1: Check staging enabled + feature flags + canary gates
  const stagingEnabled = stagingConfig.STAGING_R2_ENABLED;
  const dualWriteEnabled = stagingEnabled && ENABLE_DUAL_WRITE && ENABLE_R2_UPLOADS;
  const canaryGatesJob = dualWriteEnabled ? !shouldDualWriteThisJob() : false;

  if (!stagingEnabled && (ENABLE_DUAL_WRITE || ENABLE_R2_UPLOADS)) {
    logTelemetry({
      event: "dual_write_master_gate_blocked",
      stagingEnabled,
      dualWriteFlag: ENABLE_DUAL_WRITE,
      r2UploadsFlag: ENABLE_R2_UPLOADS,
      artifactType: syncTrackingContext?.artifactType || type,
      jobId: syncTrackingContext?.jobId,
      objectKey: uploadObjectKey,
      reason: "STAGING_R2_ENABLED=false",
    });
  }

  // If staging enabled and canary gates job, skip R2 async upload
  if (stagingEnabled && canaryGatesJob) {
    if (syncTrackingContext?.artifactType === "trackingMasterXlsx") {
      logTelemetry({
        event: "TRACKING_MASTER_SYNC_PENDING",
        jobId: syncTrackingContext.jobId,
        reason: "canary_gate_skip",
      });
    }
    return localPath;
  }

  // If dual-write is enabled, trigger async R2 upload (non-blocking)
  if (dualWriteEnabled) {
    dualWriteAttemptsThisSession += 1;
    updateDualWriteSuccessRatioGauge();
    incrementUnsyncedArtifacts();

    (async () => {
      const start = Date.now();
      let dualWriteGaugeIncremented = false;
      let streamGaugeIncremented = false;
      try {
        const availableSlots = dualWriteUploadSemaphore.getValue();
        if (availableSlots <= 0) {
          r2ConcurrencyLimitHits.inc();
          logTelemetry({
            event: "dual_write_upload_contention",
            artifactType: syncTrackingContext?.artifactType || type,
            jobId: syncTrackingContext?.jobId,
            objectKey: uploadObjectKey,
            availableSlots,
            maxConcurrentUploads: r2Config.MAX_CONCURRENT_STREAMS,
          });
        }

        activeDualWritesGauge.inc();
        dualWriteGaugeIncremented = true;
        logTelemetry({
          event: "dual_write_stream_start",
          artifactType: syncTrackingContext?.artifactType || type,
          jobId: syncTrackingContext?.jobId,
          provider: "r2",
          objectKey: uploadObjectKey,
          activeDualWrites: activeDualWritesGauge.get(),
        });

        await dualWriteUploadSemaphore.runExclusive(async () => {
          activeR2StreamsGauge.inc();
          streamGaugeIncremented = true;
          // Phase 9B Day 2.5: Use writeArtifactWithKey for normalized uploads (pre-built key,
          // avoids double-prefix). Legacy uploads (uploadKeyVersion === "legacy") also route
          // through writeArtifactWithKey because computeUploadObjectKey already calls buildKey().
          const r2 = getR2Provider() as any;
          if (typeof r2.writeArtifactWithKey === "function") {
            await withTimeout(r2.writeArtifactWithKey(uploadObjectKey, data), r2Config.TIMEOUT_MS);
          } else {
            // Defensive fallback — should never be reached in normal deployments
            await withTimeout(getR2Provider().writeArtifact(type, uploadObjectKey, data), r2Config.TIMEOUT_MS);
          }

          const existsCheckType = type === "pdf" || type === "json" || type === "xlsx" ? type : "pdf";
          const uploadVerified = await withTimeout(
            typeof r2.artifactExistsWithKey === "function"
              ? r2.artifactExistsWithKey(uploadObjectKey)
              : r2.artifactExists(existsCheckType, uploadObjectKey, {
                  keyVersion: uploadKeyVersion,
                  jobId: syncTrackingContext?.jobId,
                  artifactType: syncTrackingContext?.artifactType,
                }),
            r2Config.TIMEOUT_MS,
          );
          if (!uploadVerified) {
            throw new Error(`dual_write_upload_verify_failed:${uploadObjectKey}`);
          }
        });

        const latency = Date.now() - start;
        dualWriteSuccessesThisSession += 1;
        updateDualWriteSuccessRatioGauge();
        metrics.incCounter("dual_write_success_total", { artifactType: syncTrackingContext?.artifactType || type });
        metrics.observeHistogram("r2_upload_latency_ms", latency, { artifactType: syncTrackingContext?.artifactType || type });
        logTelemetry({
          event: "dual_write_success",
          artifactType: syncTrackingContext?.artifactType || type,
          jobId: syncTrackingContext?.jobId,
          provider: "r2",
          objectKey: uploadObjectKey,
          latencyMs: latency,
        });
        // Mark as synced in DB ONLY after successful upload
        if (syncTrackingContext) {
          const syncPersisted = await markArtifactSyncedToR2(syncTrackingContext.jobId, syncTrackingContext.artifactType);
          if (syncPersisted) {
            decrementUnsyncedArtifacts();
            if (DELETE_LOCAL_AFTER_R2_SYNC) {
              try {
                await localProvider.deleteArtifact("artifact", localPath);
                logTelemetry({
                  event: "local_artifact_deleted_after_r2_sync",
                  artifactType: syncTrackingContext.artifactType,
                  jobId: syncTrackingContext.jobId,
                  localPath,
                  objectKey: uploadObjectKey,
                });
              } catch (deleteErr) {
                logTelemetry({
                  event: "local_artifact_delete_after_r2_sync_failed",
                  artifactType: syncTrackingContext.artifactType,
                  jobId: syncTrackingContext.jobId,
                  localPath,
                  objectKey: uploadObjectKey,
                  error: deleteErr instanceof Error ? deleteErr.message : String(deleteErr),
                });
              }
            }
            if (syncTrackingContext.artifactType === "trackingMasterXlsx") {
              logTelemetry({
                event: "TRACKING_MASTER_SYNC_SUCCESS",
                jobId: syncTrackingContext.jobId,
              });
            }
          } else if (syncTrackingContext.artifactType === "trackingMasterXlsx") {
            logTelemetry({
              event: "TRACKING_MASTER_SYNC_PENDING",
              jobId: syncTrackingContext.jobId,
              reason: "sync_persist_not_confirmed",
            });
          }
        } else {
          decrementUnsyncedArtifacts();
          if (DELETE_LOCAL_AFTER_R2_SYNC) {
            try {
              await localProvider.deleteArtifact("artifact", localPath);
              logTelemetry({
                event: "local_artifact_deleted_after_r2_sync",
                artifactType: type,
                localPath,
                objectKey: uploadObjectKey,
              });
            } catch (deleteErr) {
              logTelemetry({
                event: "local_artifact_delete_after_r2_sync_failed",
                artifactType: type,
                localPath,
                objectKey: uploadObjectKey,
                error: deleteErr instanceof Error ? deleteErr.message : String(deleteErr),
              });
            }
          }
        }
      } catch (err) {
        if (err instanceof Error && err.message.includes("dual_write_upload_timeout")) {
          r2TimeoutCounter.inc();
        } else {
          r2FailureCounter.inc();
        }
        updateDualWriteSuccessRatioGauge();
        metrics.incCounter("dual_write_failure_total", { artifactType: syncTrackingContext?.artifactType || type });
        logTelemetry({
          event: "dual_write_failure",
          artifactType: syncTrackingContext?.artifactType || type,
          jobId: syncTrackingContext?.jobId,
          provider: "r2",
          objectKey: uploadObjectKey,
          error: err instanceof Error ? err.message : String(err),
        });
        if (syncTrackingContext?.artifactType === "trackingMasterXlsx") {
          logTelemetry({
            event: "TRACKING_MASTER_SYNC_PENDING",
            jobId: syncTrackingContext.jobId,
            reason: "r2_upload_failure",
            error: err instanceof Error ? err.message : String(err),
          });
        }
      } finally {
        if (streamGaugeIncremented) {
          const activeBeforeStreamCleanup = activeR2StreamsGauge.get();
          if (activeBeforeStreamCleanup > 0) {
            activeR2StreamsGauge.dec();
          } else {
            activeR2StreamsGauge.set(0);
          }
        }

        if (dualWriteGaugeIncremented) {
          const activeBeforeCleanup = activeDualWritesGauge.get();
          if (activeBeforeCleanup > 0) {
            activeDualWritesGauge.dec();
          } else {
            activeDualWritesGauge.set(0);
          }
          logTelemetry({
            event: "dual_write_stream_cleanup",
            artifactType: syncTrackingContext?.artifactType || type,
            jobId: syncTrackingContext?.jobId,
            provider: "r2",
            objectKey: key,
            durationMs: Date.now() - start,
            activeDualWritesBeforeCleanup: activeBeforeCleanup,
            activeDualWrites: activeDualWritesGauge.get(),
          });
        }
      }
    })().catch((err) => {
      logTelemetry({
        event: "dual_write_failure",
        artifactType: syncTrackingContext?.artifactType || type,
        jobId: syncTrackingContext?.jobId,
        provider: "r2",
        objectKey: key,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }

  return localPath;
}

export const storageFeatureFlags = {
  STORAGE_PROVIDER,
  ENABLE_DUAL_WRITE,
  ENABLE_DUAL_READ,
  ENABLE_R2_UPLOADS,
  ENABLE_R2_DOWNLOADS,
};

// Mark artifact as successfully synced to R2 in the database
// This is called after successful R2 writes to track sync status
export async function markArtifactSyncedToR2(
  jobId: string,
  artifactType: "labelsPdf" | "moneyOrderPdf" | "trackingResult" | "trackingMasterXlsx"
): Promise<boolean> {
  try {
    const now = new Date();
    let updated = false;
    if (artifactType === "labelsPdf") {
      await prisma.labelJob.update({
        where: { id: jobId },
        data: { labelsPdfSyncedAt: now },
      });
      updated = true;
    } else if (artifactType === "moneyOrderPdf") {
      await prisma.labelJob.update({
        where: { id: jobId },
        data: { moneyOrderPdfSyncedAt: now },
      });
      updated = true;
    } else if (artifactType === "trackingResult") {
      await prisma.trackingJob.update({
        where: { id: jobId },
        data: { resultSyncedAt: now },
      });
      updated = true;
    } else if (artifactType === "trackingMasterXlsx") {
      await prisma.labelJob.update({
        where: { id: jobId },
        data: { trackingMasterSyncedAt: now },
      });
      updated = true;
    }
    if (updated) {
      logTelemetry({
        event: "sync_tracking_update",
        jobId,
        artifactType,
        outcome: "synced",
        ts: now.toISOString(),
      });
      return true;
    }
    return false;
  } catch (err) {
    logTelemetry({
      event: "sync_tracking_update",
      jobId,
      artifactType,
      outcome: "failed",
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

