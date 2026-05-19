#!/usr/bin/env node

/**
 * Staging Environment Validation Script
 * 
 * Validates that all required env variables are present and correctly configured
 * for S1 staging operations.
 * 
 * Usage: npm run staging:env:check
 * 
 * Exit codes:
 *   0: All required vars present and valid
 *   1: Missing required configuration
 */

import { loadStagingEnv, logEnvDiagnostics, validateR2Env, validateStagingFlags } from "./env-loader.mjs";

async function main() {
  console.log("\n╔═══════════════════════════════════════════════════════════╗");
  console.log("║  STAGING ENVIRONMENT VALIDATION                          ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");

  // Load staging env
  loadStagingEnv({ verbose: false, silent: true });

  // Show diagnostics
  const allPresent = logEnvDiagnostics();

  // Validate R2 configuration if staging is enabled
  const r2Valid = validateR2Env();
  console.log("\n[Validation] R2 Configuration:");
  if (r2Valid.valid) {
    console.log("  ✓ All R2 credentials present");
  } else {
    console.log("  ✗ R2 Configuration Missing:");
    for (const missing of r2Valid.missing) {
      console.log(`    - ${missing}`);
    }
  }

  // Validate staging flags
  const flagsValid = validateStagingFlags();
  console.log("\n[Validation] Staging Flags:");
  console.log(`  - STAGING_R2_ENABLED: ${flagsValid.staging ? "true" : "false"}`);
  console.log(`  - ENABLE_DUAL_WRITE: ${flagsValid.dualWrite ? "true" : "false"}`);
  console.log(`  - ENABLE_R2_UPLOADS: ${flagsValid.r2Uploads ? "true" : "false"}`);
  console.log(`  - ENABLE_DUAL_READ: ${flagsValid.dualRead ? "true" : "false"}`);

  if (flagsValid.warnings.length > 0) {
    console.log("\n[Warnings]:");
    for (const warning of flagsValid.warnings) {
      console.log(`  ⚠️  ${warning}`);
    }
  }

  // Final result
  console.log("\n╔═══════════════════════════════════════════════════════════╗");

  if (!flagsValid.staging) {
    console.log("║  ⚠️  STAGING DISABLED - S1 will not be active              ║");
    console.log("╚═══════════════════════════════════════════════════════════╝\n");
    console.log("To enable staging, set: STAGING_R2_ENABLED=true");
    process.exit(0); // Not an error, just informational
  }

  if (flagsValid.valid && r2Valid.valid) {
    console.log("║  ✓ READY: All env vars present and valid                 ║");
    console.log("╚═══════════════════════════════════════════════════════════╝\n");
    process.exit(0);
  } else {
    console.log("║  ✗ ERROR: Missing or invalid configuration               ║");
    console.log("╚═══════════════════════════════════════════════════════════╝\n");
    console.log("Required actions:");
    if (!r2Valid.valid) {
      console.log("  1. Add missing R2 credentials to .env.staging.local");
      console.log("     File: cp .env.staging.local.example .env.staging.local");
      console.log("     Then edit with real R2 credentials");
    }
    if (!flagsValid.valid) {
      console.log("  2. Ensure staging flags are configured:");
      console.log("     - STAGING_R2_ENABLED=true");
      console.log("     - ENABLE_DUAL_WRITE=true");
      console.log("     - ENABLE_R2_UPLOADS=true");
    }
    console.log("\n  3. Load env into shell:");
    console.log("     PowerShell: . .env.staging.local");
    console.log("     Bash/Zsh:   source .env.staging.local");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Validation error:", err.message);
  process.exit(1);
});
