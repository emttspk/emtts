#!/usr/bin/env node

/**
 * Stage S1 Staging: Canary Mode Checker
 * 
 * Validates canary mode configuration and status
 * Usage: npm run r2:canary-check
 * 
 * Env loading: Automatically loads .env.staging.local if it exists
 * Precedence: shell env > .env.staging.local > defaults
 * 
 * Exit codes:
 *   0: Canary mode OK
 *   1: Canary misconfigured
 */

import fs from "node:fs";
import path from "node:path";
import { loadStagingEnv, getEnvSource, logEnvDiagnostics } from "./env-loader.mjs";

const args = process.argv.slice(2);
const verbose = args.includes("--verbose") || args.includes("-v");
const skipDiagnostics = args.includes("--no-diagnostics");

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

async function main() {
  log("\n╔════════════════════════════════════════════════════╗");
  log("║  STAGE S1: CANARY MODE CHECKER                     ║");
  log("╚════════════════════════════════════════════════════╝\n");

  // Load staging env (shell > .env.staging.local > defaults)
  loadStagingEnv({ verbose, silent: false });
  
  if (!skipDiagnostics) {
    logEnvDiagnostics();
  }

  const stagingEnabled = process.env.STAGING_R2_ENABLED === "true";
  const dualWriteEnabled = process.env.ENABLE_DUAL_WRITE === "true";
  const r2UploadsEnabled = process.env.ENABLE_R2_UPLOADS === "true";
  const canaryMode = process.env.R2_CANARY_MODE || "disabled";
  const canaryPercentage = parseInt(process.env.R2_CANARY_PERCENTAGE || "5", 10);
  const canaryMaxJobs = parseInt(process.env.R2_CANARY_MAX_JOBS || "100", 10);

  // Check staging enabled
  log("[1/4] Staging Configuration:");
  if (!stagingEnabled) {
    warn("Staging disabled: STAGING_R2_ENABLED is not true");
  } else {
    success("Staging enabled: STAGING_R2_ENABLED=true");
  }

  if (!dualWriteEnabled) {
    warn("Dual-write disabled: ENABLE_DUAL_WRITE is not true");
  } else {
    success("Dual-write enabled: ENABLE_DUAL_WRITE=true");
  }

  if (!r2UploadsEnabled) {
    warn("R2 uploads disabled: ENABLE_R2_UPLOADS is not true");
  } else {
    success("R2 uploads enabled: ENABLE_R2_UPLOADS=true");
  }

  // Check canary mode
  log("\n[2/4] Canary Mode Configuration:");
  if (stagingEnabled && (dualWriteEnabled && r2UploadsEnabled)) {
    if (canaryMode === "disabled") {
      warn("Canary mode is DISABLED: all jobs will dual-write if staging enabled");
      info("Set R2_CANARY_MODE to 'job-percentage' or 'job-count' to limit blast radius");
    } else if (canaryMode === "job-percentage") {
      success(`Canary mode: job-percentage (${canaryPercentage}% of jobs)`);
      if (canaryPercentage < 1 || canaryPercentage > 100) {
        warn(`Canary percentage out of range: ${canaryPercentage} (must be 1-100)`);
      }
    } else if (canaryMode === "job-count") {
      success(`Canary mode: job-count (first ${canaryMaxJobs} jobs only)`);
      if (canaryMaxJobs < 1) {
        warn(`Canary max jobs invalid: ${canaryMaxJobs} (must be >= 1)`);
      }
    } else {
      warn(`Unknown canary mode: ${canaryMode}`);
    }
  } else {
    info("Canary mode not active (staging or dual-write disabled)");
  }

  // Check for telemetry file
  log("\n[3/4] Telemetry Configuration:");
  const telemetryFile = process.env.TELEMETRY_LOG_FILE;
  if (!telemetryFile) {
    info("Telemetry is logged to stdout (TELEMETRY_LOG_FILE not set)");
    info("To collect telemetry to file, set: TELEMETRY_LOG_FILE=/path/to/telemetry.log");
  } else {
    if (fs.existsSync(telemetryFile)) {
      const stats = fs.statSync(telemetryFile);
      const lines = fs.readFileSync(telemetryFile, "utf-8").split("\n").filter(Boolean).length;
      success(`Telemetry file exists: ${telemetryFile} (${lines} lines, ${stats.size} bytes)`);
    } else {
      info(`Telemetry file configured but doesn't exist yet: ${telemetryFile}`);
    }
  }

  // Recommendations
  log("\n[4/4] Recommendations:");
  if (stagingEnabled && (dualWriteEnabled && r2UploadsEnabled)) {
    if (canaryMode === "disabled") {
      warn("For controlled S1 staging, enable canary mode to limit blast radius:");
      info("  R2_CANARY_MODE=job-percentage R2_CANARY_PERCENTAGE=5 npm run dev:api");
      info("  (or: R2_CANARY_MODE=job-count R2_CANARY_MAX_JOBS=100 npm run dev:api)");
    } else {
      success("Canary mode is configured correctly");
    }
  } else {
    info("Enable all flags for S1 staging:");
    info("  STAGING_R2_ENABLED=true ENABLE_DUAL_WRITE=true ENABLE_R2_UPLOADS=true npm run dev:api");
  }

  log("\n✓ Canary mode check complete");
  log();
}

main().catch((err) => {
  console.error(`❌ Check failed: ${err.message}`);
  process.exit(1);
});
