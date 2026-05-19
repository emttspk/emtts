#!/usr/bin/env node

import fs from "node:fs";
import { loadStagingEnv, getEnvSource, logEnvDiagnostics } from "./env-loader.mjs";

/**
 * Stage S1 Staging: Rollback Path Validator
 * 
 * Validates that rollback from S1 staging to local-only is safe
 * Usage: npm run r2:rollback-check
 * 
 * Env loading: Automatically loads .env.staging.local if it exists
 * Precedence: shell env > .env.staging.local > defaults
 * 
 * Exit codes:
 *   0: Rollback path is safe
 *   1: Rollback issues detected
 */

function log(msg) {
  console.log(msg);
}

function warn(msg) {
  console.warn(`⚠️  ${msg}`);
}

function info(msg) {
  console.log(`ℹ️  ${msg}`);
}

function success(msg) {
  console.log(`✓ ${msg}`);
}

function error(msg) {
  console.error(`❌ ${msg}`);
}

const TELEMETRY_LOG_FILE = process.env.TELEMETRY_LOG_FILE;

function emitTelemetry(event, data = {}) {
  try {
    const payload = {
      ts: new Date().toISOString(),
      event,
      ...data,
    };
    const line = JSON.stringify(payload);
    if (TELEMETRY_LOG_FILE) {
      fs.appendFileSync(TELEMETRY_LOG_FILE, line + "\n");
    }
    console.log(line);
  } catch {
    // Never break rollback diagnostics on telemetry failure
  }
}

async function main() {
  log("\n╔════════════════════════════════════════════════════╗");
  log("║  STAGE S1: ROLLBACK PATH VALIDATOR                 ║");
  log("╚════════════════════════════════════════════════════╝\n");

  // Load staging env (shell > .env.staging.local > defaults)
  const verbose = process.argv.includes("--verbose") || process.argv.includes("-v");
  loadStagingEnv({ verbose, silent: false });
  
  const skipDiagnostics = process.argv.includes("--no-diagnostics");
  if (!skipDiagnostics) {
    logEnvDiagnostics();
  }

  const stagingEnabled = process.env.STAGING_R2_ENABLED === "true";
  const dualWriteEnabled = process.env.ENABLE_DUAL_WRITE === "true";
  const r2UploadsEnabled = process.env.ENABLE_R2_UPLOADS === "true";
  const dualReadEnabled = process.env.ENABLE_DUAL_READ === "true";
  const storageProvider = process.env.STORAGE_PROVIDER || "local";

  emitTelemetry("rollback_execution_start", {
    stagingEnabled,
    dualWriteEnabled,
    r2UploadsEnabled,
    dualReadEnabled,
    storageProvider,
  });

  // Check current state
  log("[1/5] Current Staging State:");
  success(`Staging enabled: ${stagingEnabled}`);
  success(`Dual-write enabled: ${dualWriteEnabled}`);
  success(`R2 uploads enabled: ${r2UploadsEnabled}`);
  success(`Dual-read enabled: ${dualReadEnabled}`);
  success(`Storage provider: ${storageProvider}`);

  // Validate prerequisites for safe rollback
  log("\n[2/5] Rollback Prerequisites:");

  if (storageProvider !== "local") {
    emitTelemetry("rollback_execution_failed", {
      reason: "storage_provider_not_local",
      storageProvider,
      recommendation: "Set STORAGE_PROVIDER=local before rollback",
    });
    error(`Storage provider is '${storageProvider}', must be 'local' for safe rollback`);
    error("Rollback is NOT SAFE when STORAGE_PROVIDER != 'local'");
    process.exit(1);
  }
  success("Storage provider is 'local' (authoritative)");

  if (dualReadEnabled) {
    warn("Dual-read is enabled - must be disabled before rollback");
    info("Recommended rollback sequence:");
    info("  1. ENABLE_DUAL_READ=false npm run dev:api (disable reads first)");
    info("  2. Wait 60 seconds for any in-flight requests");
    info("  3. STAGING_R2_ENABLED=false npm run dev:api (disable staging)");
  } else {
    success("Dual-read is not enabled (ready for rollback)");
  }

  // Validate flags can be disabled
  log("\n[3/5] Rollback Flag Disablement:");
  if (stagingEnabled || dualWriteEnabled || r2UploadsEnabled) {
    success("Flags are currently enabled - can be disabled for rollback");
    info("To rollback, set:");
    if (stagingEnabled) info("  STAGING_R2_ENABLED=false");
    if (dualWriteEnabled) info("  ENABLE_DUAL_WRITE=false");
    if (r2UploadsEnabled) info("  ENABLE_R2_UPLOADS=false");
  } else {
    success("All flags already disabled (local-only mode active)");
  }

  // Rollback safety checks
  log("\n[4/5] Rollback Safety Checks:");

  // Local storage must be configured
  const storageDir = process.env.STORAGE_DIR || "storage";
  success(`Local storage directory: ${storageDir}`);

  // Database must be configured (for cleanup safety)
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    warn("DATABASE_URL not configured - cleanup validation requires database");
  } else {
    success("Database configured for cleanup safety");
  }

  // Redis must be configured
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    warn("REDIS_URL not configured - queue recovery requires Redis");
  } else {
    success("Redis configured for queue recovery");
  }

  // Rollback procedure
  log("\n[5/5] Recommended Rollback Procedure:");
  log("\n  Step 1: Disable dual-read (if enabled)");
  log("    ENABLE_DUAL_READ=false npm run dev:api");
  log("    (wait 60 seconds for in-flight requests)");
  log("\n  Step 2: Disable staging and dual-write");
  log("    STAGING_R2_ENABLED=false ENABLE_DUAL_WRITE=false npm run dev:api");
  log("\n  Step 3: Verify local-only mode");
  log("    npm run r2:rollback-check");
  log("    (should show all flags disabled)");
  log("\n  Step 4: Resume normal operations");
  log("    npm run dev:api");
  log("    (API will run in local-only mode with no R2 access)");

  log("\n✓ Rollback path validation complete");
  log("\nKey Safety Properties:");
  log("  • Rollback is INSTANT (no schema changes, no data cleanup)");
  log("  • Rollback is REVERSIBLE (can re-enable staging later)");
  log("  • Local storage remains AUTHORITATIVE (R2 is mirror only)");
  log("  • Jobs complete IMMEDIATELY (not blocked by R2 state)");

  const localOnlyRecovered = !stagingEnabled && !dualWriteEnabled && !r2UploadsEnabled && !dualReadEnabled && storageProvider === "local";
  if (localOnlyRecovered) {
    emitTelemetry("rollback_recovery_confirmed", {
      localOnlyMode: true,
      stagingEnabled,
      dualWriteEnabled,
      r2UploadsEnabled,
      dualReadEnabled,
      storageProvider,
    });
  } else {
    emitTelemetry("rollback_recovery_pending", {
      localOnlyMode: false,
      stagingEnabled,
      dualWriteEnabled,
      r2UploadsEnabled,
      dualReadEnabled,
      storageProvider,
      nextAction: "Disable S1 and dual-write flags, restart API/worker, then re-run rollback check",
    });
  }

  log();
}

main().catch((err) => {
  console.error(`❌ Validation failed: ${err.message}`);
  process.exit(1);
});
