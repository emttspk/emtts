#!/usr/bin/env node

/**
 * Wrangler R2 Integration Utility
 * 
 * Provides Wrangler CLI integration for R2 bucket validation.
 * Safely detects Wrangler installation and authentication state.
 * Non-fatal if Wrangler unavailable (AWS SDK continues).
 * 
 * Usage:
 *   import { detectWrangler, listBucketsViaWrangler, getWranglerR2Config } from './scripts/wrangler-r2.mjs';
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * Detect if Wrangler CLI is installed and available
 * Returns: { available: boolean, version?: string, error?: string }
 */
export function detectWrangler() {
  try {
    const version = execSync("wrangler --version", { stdio: "pipe", timeout: 5000 }).toString().trim();
    return {
      available: true,
      version,
    };
  } catch (err) {
    return {
      available: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Check if Wrangler is authenticated (has valid credentials)
 * Returns: { authenticated: boolean, error?: string }
 */
export function isWranglerAuthenticated() {
  try {
    // Try to list buckets - this will fail if not authenticated
    execSync("wrangler r2 bucket list --json", {
      stdio: "pipe",
      timeout: 10000,
    });
    return {
      authenticated: true,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    if (errorMsg.includes("Unauthorized") || errorMsg.includes("auth")) {
      return {
        authenticated: false,
        error: "Wrangler is not authenticated. Run: wrangler login",
      };
    }
    return {
      authenticated: false,
      error: errorMsg,
    };
  }
}

/**
 * List R2 buckets via Wrangler CLI
 * Returns: { buckets: string[], account?: string, error?: string }
 */
export function listBucketsViaWrangler() {
  try {
    const output = execSync("wrangler r2 bucket list --json", {
      stdio: "pipe",
      timeout: 10000,
    }).toString();

    let parsed;
    try {
      parsed = JSON.parse(output);
    } catch {
      // Fallback: try parsing as plain text output
      const lines = output.split("\n").filter(Boolean);
      const buckets = lines.map((line) => line.trim()).filter((line) => line && !line.startsWith("["));
      return {
        buckets,
      };
    }

    if (Array.isArray(parsed)) {
      // Wrangler returns array of bucket names or objects
      const buckets = parsed.map((item) => (typeof item === "string" ? item : item.name || item.bucket)).filter(Boolean);
      return { buckets };
    }

    if (parsed.buckets && Array.isArray(parsed.buckets)) {
      return {
        buckets: parsed.buckets.map((b) => b.name || b),
        account: parsed.account,
      };
    }

    return { buckets: [] };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      buckets: [],
      error: errorMsg,
    };
  }
}

/**
 * Get Wrangler R2 configuration (bucket, endpoint, account info)
 * Reads from .wrangler config if available
 * Returns: { endpoint?: string, bucket?: string, account?: string, error?: string }
 */
export function getWranglerR2Config() {
  try {
    // Try to read wrangler.json
    const wranglerJsonPath = path.join(process.cwd(), "wrangler.json");
    if (fs.existsSync(wranglerJsonPath)) {
      const content = fs.readFileSync(wranglerJsonPath, "utf-8");
      const config = JSON.parse(content);

      if (config.env && config.env.staging && config.env.staging.r2_buckets) {
        return {
          bucket: config.env.staging.r2_buckets[0]?.bucket_name,
          endpoint: config.env.staging.r2_buckets[0]?.jurisdiction === "eu" ? "eu" : "us",
        };
      }
    }

    // Try to get from wrangler whoami
    try {
      const whoami = execSync("wrangler whoami --json", { stdio: "pipe", timeout: 5000 }).toString();
      const parsed = JSON.parse(whoami);
      return {
        account: parsed.account_id,
      };
    } catch {
      // Ignore whoami errors
    }

    return {};
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Validate bucket exists in Wrangler's configured buckets
 * Returns: { exists: boolean, allBuckets?: string[], error?: string }
 */
export function validateBucketInWrangler(bucketName) {
  const result = listBucketsViaWrangler();

  if (result.error) {
    return {
      exists: false,
      error: result.error,
    };
  }

  const exists = result.buckets.includes(bucketName);
  return {
    exists,
    allBuckets: result.buckets,
  };
}

/**
 * Full Wrangler diagnostics (non-fatal validation)
 * Returns comprehensive diagnostics for operator
 */
export function getWranglerDiagnostics() {
  const diagnostics = {
    wranglerAvailable: false,
    wranglerVersion: undefined,
    wranglerAuthenticated: false,
    configuredBuckets: [],
    configuredAccount: undefined,
    errors: [],
  };

  // Check Wrangler installation
  const installCheck = detectWrangler();
  diagnostics.wranglerAvailable = installCheck.available;
  if (installCheck.version) {
    diagnostics.wranglerVersion = installCheck.version;
  } else if (installCheck.error) {
    diagnostics.errors.push(`Wrangler detection: ${installCheck.error}`);
  }

  if (!installCheck.available) {
    return diagnostics; // Stop here, Wrangler not available
  }

  // Check authentication
  const authCheck = isWranglerAuthenticated();
  diagnostics.wranglerAuthenticated = authCheck.authenticated;
  if (!authCheck.authenticated && authCheck.error) {
    diagnostics.errors.push(`Wrangler auth: ${authCheck.error}`);
  }

  if (!authCheck.authenticated) {
    return diagnostics; // Stop here, not authenticated
  }

  // List buckets
  const bucketsResult = listBucketsViaWrangler();
  if (bucketsResult.buckets) {
    diagnostics.configuredBuckets = bucketsResult.buckets;
  }
  if (bucketsResult.error) {
    diagnostics.errors.push(`List buckets: ${bucketsResult.error}`);
  }
  if (bucketsResult.account) {
    diagnostics.configuredAccount = bucketsResult.account;
  }

  return diagnostics;
}

// Export for CommonJS (if needed)
export default {
  detectWrangler,
  isWranglerAuthenticated,
  listBucketsViaWrangler,
  getWranglerR2Config,
  validateBucketInWrangler,
  getWranglerDiagnostics,
};
