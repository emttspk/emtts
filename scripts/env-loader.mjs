#!/usr/bin/env node

/**
 * Unified Environment Loader for Local Staging
 * 
 * Provides consistent env loading across:
 * - Root R2 tooling scripts
 * - API startup (dev/prod)
 * - Worker startup (dev/prod)
 * - Bootstrap verification scripts
 * 
 * Precedence (highest to lowest):
 * 1. Shell/process environment (explicit VAR=value)
 * 2. .env.staging.local (if exists in cwd or parent)
 * 3. Railway/service runtime env (on Railway)
 * 4. Code defaults
 * 
 * Usage:
 *   import { loadStagingEnv, getEnvSource, logEnvDiagnostics } from './scripts/env-loader.mjs';
 *   
 *   loadStagingEnv(); // Load .env.staging.local if exists
 *   const source = getEnvSource(); // Get diagnostic info
 *   logEnvDiagnostics(); // Print env source (no secrets)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Track which env source was used (for diagnostics)
let envSourceUsed = "default";
let stagingFileLoaded = false;

/**
 * Find .env.staging.local by walking up from cwd or specified dir
 * Returns full path if found, or null if not found
 */
export function findStagingEnvFile(startDir = process.cwd()) {
  let current = startDir;
  const visited = new Set();

  while (current !== "/" && current !== "C:\\" && !visited.has(current)) {
    visited.add(current);
    const candidate = path.join(current, ".env.staging.local");
    
    if (fs.existsSync(candidate)) {
      return candidate;
    }

    const parent = path.dirname(current);
    if (parent === current) break; // Root directory reached
    current = parent;
  }

  return null;
}

/**
 * Parse .env file format (simple key=value parser)
 * Handles comments (#), empty lines, quoted values
 */
function parseDotEnvFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const env = {};

    for (const line of content.split("\n")) {
      const trimmed = line.trim();

      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith("#")) continue;

      // Parse KEY=value
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) continue;

      const key = trimmed.substring(0, eqIndex).trim();
      let value = trimmed.substring(eqIndex + 1).trim();

      // Remove surrounding quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      env[key] = value;
    }

    return env;
  } catch (err) {
    console.warn(`[env-loader] Failed to parse ${filePath}: ${err.message}`);
    return {};
  }
}

/**
 * Load .env.staging.local into process.env
 * Respects shell precedence: only sets values not already in process.env
 */
export function loadStagingEnv(options = {}) {
  const { 
    verbose = false, 
    searchDir = process.cwd(),
    silent = false 
  } = options;

  const stagingFile = findStagingEnvFile(searchDir);

  if (!stagingFile) {
    if (verbose && !silent) {
      console.log("[env-loader] .env.staging.local not found (shell env only)");
    }
    envSourceUsed = "shell";
    return false;
  }

  try {
    const fileEnv = parseDotEnvFile(stagingFile);
    let loadedCount = 0;
    let skippedCount = 0;

    for (const [key, value] of Object.entries(fileEnv)) {
      if (process.env[key] === undefined) {
        process.env[key] = value;
        loadedCount++;
      } else {
        // Shell var already set; skip file value (shell precedence)
        skippedCount++;
      }
    }

    stagingFileLoaded = true;
    envSourceUsed = "staging-file";

    if (!silent) {
      console.log(
        `[env-loader] Loaded .env.staging.local (${loadedCount} vars set, ${skippedCount} shell overrides)`
      );
      if (verbose) {
        console.log(`[env-loader] File: ${stagingFile}`);
      }
    }

    return true;
  } catch (err) {
    if (!silent) {
      console.warn(`[env-loader] Failed to load ${stagingFile}: ${err.message}`);
    }
    envSourceUsed = "shell";
    return false;
  }
}

/**
 * Get which environment source was used
 */
export function getEnvSource() {
  return {
    source: envSourceUsed,
    stagingFileLoaded,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Log environment diagnostics (NO SECRET PRINTING)
 * Shows which vars are set without revealing values
 */
export function logEnvDiagnostics(requiredVars = []) {
  console.log("\n╔═══════════════════════════════════════════════════════════╗");
  console.log("║  ENVIRONMENT SOURCE DIAGNOSTICS                          ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");

  console.log(`[Diagnostics] Environment Source: ${envSourceUsed}`);
  console.log(`[Diagnostics] Staging File Loaded: ${stagingFileLoaded ? "Yes" : "No"}`);

  const r2VarsNeeded = [
    "R2_ENDPOINT",
    "R2_BUCKET",
    "R2_ACCESS_KEY_ID",
    "R2_ACCESS_KEY",
    "R2_SECRET_ACCESS_KEY",
    "R2_SECRET_KEY",
  ];

  const flagVarsNeeded = [
    "STAGING_R2_ENABLED",
    "ENABLE_DUAL_WRITE",
    "ENABLE_R2_UPLOADS",
    "ENABLE_DUAL_READ",
    "R2_CANARY_MODE",
    "R2_CANARY_PERCENTAGE",
    "R2_CANARY_MAX_JOBS",
  ];

  const allVarsToCheck = [...requiredVars, ...r2VarsNeeded, ...flagVarsNeeded];
  const uniqueVars = [...new Set(allVarsToCheck)];

  console.log("\n[Diagnostics] Required Variables Status:");
  let allPresent = true;

  for (const varName of uniqueVars) {
    const isPresent = process.env[varName] !== undefined && process.env[varName] !== "";
    const status = isPresent ? "✓" : "✗";
    console.log(`  ${status} ${varName.padEnd(30)} ${isPresent ? "(SET)" : "(MISSING)"}`);
    if (!isPresent) allPresent = false;
  }

  console.log();
  return allPresent;
}

/**
 * Validate that all required R2 env vars are present
 * Returns { valid: boolean, missing: string[] }
 */
export function validateR2Env() {
  const required = ["R2_ENDPOINT", "R2_BUCKET"];
  const credentialAlternatives = [
    ["R2_ACCESS_KEY_ID", "R2_ACCESS_KEY"],
    ["R2_SECRET_ACCESS_KEY", "R2_SECRET_KEY"],
  ];

  const missing = [];

  for (const req of required) {
    if (!process.env[req]) {
      missing.push(req);
    }
  }

  for (const alternatives of credentialAlternatives) {
    const hasAny = alternatives.some(alt => process.env[alt]);
    if (!hasAny) {
      missing.push(`(${alternatives.join(" or ")})`);
    }
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Validate that all required staging flags are set correctly
 */
export function validateStagingFlags() {
  const staging = process.env.STAGING_R2_ENABLED === "true";
  const dualWrite = process.env.ENABLE_DUAL_WRITE === "true";
  const r2Uploads = process.env.ENABLE_R2_UPLOADS === "true";
  const dualRead = process.env.ENABLE_DUAL_READ === "true";

  const warnings = [];

  if (staging && !dualWrite) {
    warnings.push("STAGING_R2_ENABLED=true but ENABLE_DUAL_WRITE=false (staging incomplete)");
  }

  if (dualWrite && !r2Uploads) {
    warnings.push("ENABLE_DUAL_WRITE=true but ENABLE_R2_UPLOADS=false (uploads disabled)");
  }

  if (dualRead && !dualWrite) {
    warnings.push("ENABLE_DUAL_READ=true but ENABLE_DUAL_WRITE=false (read without write)");
  }

  if (!staging) {
    warnings.push("STAGING_R2_ENABLED=false (S1 staging disabled)");
  }

  return {
    staging,
    dualWrite,
    r2Uploads,
    dualRead,
    warnings,
    valid: warnings.length === 0,
  };
}

// Export for CommonJS usage (if needed via createRequire)
export default {
  loadStagingEnv,
  getEnvSource,
  logEnvDiagnostics,
  validateR2Env,
  validateStagingFlags,
  findStagingEnvFile,
};
