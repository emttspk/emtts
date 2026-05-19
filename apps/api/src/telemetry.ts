// Lightweight structured telemetry/logging for dual-provider observability
// Defensive: never throws, always JSON-safe, bounded log volume

import fs from "node:fs";

export interface TelemetryEvent {
  ts?: string; // ISO timestamp, injected centrally when omitted
  event: string;
  jobId?: string;
  artifactType?: string;
  provider?: string;
  objectKey?: string;
  objectKeyVersion?: "legacy" | "normalized";
  lookupAttempt?: number;
  compatibilityMode?: "legacy-only" | "dual-key";
  metadataValidationResult?: "valid" | "invalid";
  metadataBypassReason?:
    | "missing_job_id"
    | "missing_artifact_type"
    | "unsupported_type"
    | "forced_legacy_override"
    | "activation_flag_disabled";
  latencyMs?: number;
  outcome?: string;
  error?: string;
  [key: string]: any;
}

// ===== Phase 9A: Storage-Key Normalization Telemetry Events (Day 1) =====

/**
 * Emitted when a storage operation determines the object key version (legacy/normalized).
 * Purely for observability; does not affect runtime behavior.
 */
export function logObjectKeyVersion(params: {
  jobId?: string;
  artifactType?: string;
  keyVersion: "legacy" | "normalized";
  rawKey: string;
  normalizedKey?: string;
  objectKeyNormalizationLatencyMs?: number;
}) {
  try {
    logTelemetry({
      event: "object_key_version_logged",
      ...params,
    });
  } catch (err) {
    // Defensive: never throw
    if (process.env.NODE_ENV !== "production") {
      console.warn("[telemetry] logObjectKeyVersion error", err);
    }
  }
}

/**
 * Periodic heartbeat: emits compatibility layer status for monitoring.
 * Should be called by a timer (see docs for details).
 */
export function logCompatibilityLayerStatus(params: {
  dualKeyLookupEnabled: boolean;
  normalizedKeysGenerated: number;
  legacyKeysFalledBack: number;
  keyNormalizationErrors: number;
}) {
  try {
    logTelemetry({
      event: "compatibility_layer_status",
      ...params,
    });
  } catch (err) {
    // Defensive: never throw
    if (process.env.NODE_ENV !== "production") {
      console.warn("[telemetry] logCompatibilityLayerStatus error", err);
    }
  }
}

/**
 * Emitted before each compatibility candidate lookup.
 */
export function logCompatibilityLookupAttempt(params: {
  objectKey: string;
  objectKeyVersion: "legacy" | "normalized";
  lookupAttempt: number;
  compatibilityMode: "legacy-only" | "dual-key";
  artifactType?: string;
  jobId?: string;
}) {
  try {
    logTelemetry({
      event: "compatibility_lookup_attempt",
      ...params,
    });
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[telemetry] logCompatibilityLookupAttempt error", err);
    }
  }
}

/**
 * Emitted when a compatibility candidate lookup succeeds.
 */
export function logCompatibilityLookupHit(params: {
  objectKey: string;
  objectKeyVersion: "legacy" | "normalized";
  lookupAttempt: number;
  compatibilityMode: "legacy-only" | "dual-key";
  artifactType?: string;
  jobId?: string;
}) {
  try {
    logTelemetry({
      event: "compatibility_lookup_hit",
      ...params,
    });
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[telemetry] logCompatibilityLookupHit error", err);
    }
  }
}

/**
 * Emitted when a compatibility candidate lookup misses.
 */
export function logCompatibilityLookupMiss(params: {
  objectKey: string;
  objectKeyVersion: "legacy" | "normalized";
  lookupAttempt: number;
  compatibilityMode: "legacy-only" | "dual-key";
  artifactType?: string;
  jobId?: string;
  error?: string;
}) {
  try {
    logTelemetry({
      event: "compatibility_lookup_miss",
      ...params,
    });
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[telemetry] logCompatibilityLookupMiss error", err);
    }
  }
}

/**
 * Emitted when normalized compatibility lookup is bypassed due to gating/metadata.
 */
export function logCompatibilityLookupMetadataBypass(params: {
  objectKey: string;
  objectKeyVersion: "legacy" | "normalized";
  lookupAttempt: number;
  compatibilityMode: "legacy-only" | "dual-key";
  metadataValidationResult: "valid" | "invalid";
  metadataBypassReason:
    | "missing_job_id"
    | "missing_artifact_type"
    | "unsupported_type"
    | "forced_legacy_override"
    | "activation_flag_disabled";
  artifactType?: string;
  jobId?: string;
}) {
  try {
    logTelemetry({
      event: "compatibility_lookup_metadata_bypass",
      ...params,
    });
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[telemetry] logCompatibilityLookupMetadataBypass error", err);
    }
  }
}

export interface R2ValidationResult {
  connectivity: boolean;
  uploadable: boolean;
  downloadable: boolean;
  presignedUrl: boolean;
  allValid: boolean;
  errors: string[];
}

const LOG_FILE = process.env.TELEMETRY_LOG_FILE || undefined; // Optionally log to file
const TELEMETRY_STDOUT_DUPLICATE = process.env.TELEMETRY_STDOUT_DUPLICATE !== "false";
const MAX_LOG_LINES = 10000; // Bounded log volume (per process)
let logLines = 0;

type TelemetrySinkMode = "stdout" | "file" | "both";

function resolveTelemetrySinkMode(): TelemetrySinkMode {
  if (LOG_FILE && TELEMETRY_STDOUT_DUPLICATE) return "both";
  if (LOG_FILE) return "file";
  return "stdout";
}

function writeTelemetryLine(line: string) {
  const sinkMode = resolveTelemetrySinkMode();
  if (sinkMode === "stdout" || sinkMode === "both") {
    console.log(line);
  }
  if (sinkMode === "file" || sinkMode === "both") {
    fs.appendFile(LOG_FILE as string, line + "\n", () => {});
  }
}

export function getTelemetrySinkDiagnostics() {
  return {
    sink: resolveTelemetrySinkMode(),
    telemetryLogFile: LOG_FILE ?? null,
    stdoutDuplicateEnabled: TELEMETRY_STDOUT_DUPLICATE,
    maxLogLines: MAX_LOG_LINES,
    currentLogLines: logLines,
  };
}

export function logTelemetrySinkInitialized() {
  try {
    if (logLines >= MAX_LOG_LINES) return;
    const payload = {
      event: "telemetry_sink_initialized",
      sink: resolveTelemetrySinkMode(),
      telemetryLogFile: LOG_FILE ?? null,
      stdoutDuplicateEnabled: TELEMETRY_STDOUT_DUPLICATE,
      environment: process.env.NODE_ENV ?? "development",
      pid: process.pid,
      ts: new Date().toISOString(),
    };
    writeTelemetryLine(JSON.stringify(payload));
    logLines++;
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[telemetry] logTelemetrySinkInitialized error", err);
    }
  }
}

export function logTelemetry(event: TelemetryEvent) {
  try {
    if (logLines >= MAX_LOG_LINES) return; // Bounded
    const payload = { ...event, ts: event.ts ?? new Date().toISOString() };
    const line = JSON.stringify(payload);
    writeTelemetryLine(line);
    logLines++;
  } catch (err) {
    // Defensive: never throw
    // Optionally log to stderr
    if (process.env.NODE_ENV !== "production") {
      console.warn("[telemetry] log error", err);
    }
  }
}

// ========== Stage S1 Staging Telemetry Events ==========
// These events are emitted during S1 controlled staging rollout

/**
 * Staging startup configuration check
 * Emitted when API/worker starts with STAGING_R2_ENABLED
 */
export function logStagingStartupConfig(config: {
  stagingEnabled: boolean;
  canaryMode: string;
  dualWriteEnabled: boolean;
  r2UploadsEnabled: boolean;
  credentialsConfigured: boolean;
  bucketConfigured: boolean;
}) {
  logTelemetry({
    event: "staging_startup_config",
    ...config,
  });
}

/**
 * R2 connectivity validation result
 * Emitted after startup validation of R2 bucket access
 */
export function logStagingConnectivityCheck(result: {
  connectivity: boolean;
  uploadable: boolean;
  downloadable: boolean;
  presignedUrl: boolean;
  allValid: boolean;
  errors?: string[];
}) {
  logTelemetry({
    event: "staging_r2_connectivity_check",
    ...result,
  });
}

/**
 * Canary mode initialization
 * Emitted when canary mode is configured
 */
export function logStagingCanaryInitialized(config: {
  canaryMode: string;
  percentage?: number;
  maxJobs?: number;
}) {
  logTelemetry({
    event: "staging_canary_initialized",
    ...config,
  });
}

/**
 * Dual-write skip due to canary gate
 * Emitted when job is not selected for dual-write due to canary mode
 */
export function logCanarySkipped(reason: "percentage_gate" | "job_count_limit") {
  logTelemetry({
    event: "dual_write_canary_skip",
    reason,
  });
}

/**
 * Dual-write allowed by canary gate
 * Emitted when job is selected for dual-write by canary mode
 */
export function logCanaryAllowed(reason: "percentage_allowed" | "job_count_available") {
  logTelemetry({
    event: "dual_write_canary_allowed",
    reason,
  });
}

/**
 * Cleanup staging sync protection
 * Emitted during cleanup cron when dual-write is enabled
 */
export function logCleanupStagingMode(protected_: boolean) {
  logTelemetry({
    event: "cleanup_staging_mode",
    syncProtectionActive: protected_,
  });
}

// ========== Environment Configuration Telemetry ==========
// Track env source, loading, and drift detection

/**
 * Environment source detected
 * Emitted at startup to show where env vars came from
 */
export function logEnvSourceDetected(source: "shell" | "staging-file" | "railway" | "default") {
  logTelemetry({
    event: "env_source_detected",
    source,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Staging environment file loaded
 * Emitted when .env.staging.local is successfully loaded
 */
export function logStagingEnvLoaded(stats: {
  varsLoaded: number;
  varsSkipped: number; // Shell overrides
  filePath?: string;
}) {
  logTelemetry({
    event: "staging_env_loaded",
    ...stats,
  });
}

/**
 * Environment drift warning
 * Emitted when API/Worker have different staging configurations
 */
export function logEnvDriftWarning(type: string, details: Record<string, any>) {
  logTelemetry({
    event: "env_drift_warning",
    driftType: type,
    ...details,
  });
}

/**
 * Missing required environment variable
 * Emitted during startup validation if required vars are missing
 */
export function logMissingRequiredEnv(missing: string[]) {
  logTelemetry({
    event: "missing_required_env",
    variables: missing,
    count: missing.length,
  });
}

export function logStartupPathClassified(path: "local-only" | "staging", stagingR2Enabled: boolean, r2UploadsEnabled: boolean) {
  logTelemetry({
    event: "startup_path_classified",
    path,
    stagingR2Enabled,
    r2UploadsEnabled,
    timestamp: new Date().toISOString(),
  });
}

export function logR2ConnectivityValidation(validation: R2ValidationResult) {
  logTelemetry({
    event: "r2_connectivity_validation",
    ...validation,
    timestamp: new Date().toISOString(),
  });
}

export function logStartupValidationFailure(errors: string[]) {
  logTelemetry({
    event: "startup_validation_failure",
    errors,
    timestamp: new Date().toISOString(),
  });
}
