import { config } from "dotenv";
import { z } from "zod";

// Load .env with fallback to .env.staging.local (unified env loading)
config(); // Load from .env in current working directory first

// In development, also attempt to load .env.staging.local for unified staging env
// This allows root tooling and API to share the same staging env file
if (process.env.NODE_ENV === "development") {
  try {
    // @ts-expect-error - env-loader.mjs has no declaration file (development-only utility)
    const { loadStagingEnv } = await import("../../../scripts/env-loader.mjs");
    loadStagingEnv({ verbose: false, silent: true });
  } catch (err) {
    // Gracefully ignore if env-loader not available (e.g., in dist build)
  }
}

export const featureFlags = {
  ENABLE_DUAL_WRITE: process.env.ENABLE_DUAL_WRITE === "true",
  ENABLE_DUAL_READ: process.env.ENABLE_DUAL_READ === "true",
  ENABLE_R2_UPLOADS: process.env.ENABLE_R2_UPLOADS === "true",
  ENABLE_R2_PREFERRED_READS: process.env.ENABLE_R2_PREFERRED_READS === "true",
  FORCE_LOCAL_READS: process.env.FORCE_LOCAL_READS === "true",
};

export function getReadPreferenceFlags() {
  return {
    ENABLE_R2_PREFERRED_READS: process.env.ENABLE_R2_PREFERRED_READS === "true",
    FORCE_LOCAL_READS: process.env.FORCE_LOCAL_READS === "true",
  };
}

// Stage S1 Staging Configuration: Master control flag and canary controls
export const stagingConfig = {
  // Master kill-switch for all S1 staging behavior
  STAGING_R2_ENABLED: process.env.STAGING_R2_ENABLED === "true",
  
  // Canary mode: limits blast radius during S1 validation
  // DISABLED (default): all jobs dual-write if flags enabled
  // job-percentage: only X% of jobs dual-write
  // job-count: only first X jobs dual-write
  CANARY_MODE: (process.env.R2_CANARY_MODE || "disabled") as "disabled" | "job-percentage" | "job-count",
  CANARY_PERCENTAGE: Math.max(1, Math.min(100, parseInt(process.env.R2_CANARY_PERCENTAGE || "5", 10))),
  CANARY_MAX_JOBS: Math.max(1, parseInt(process.env.R2_CANARY_MAX_JOBS || "100", 10)),
};

export const r2Config = {
  MAX_CONCURRENT_STREAMS: parseInt(process.env.R2_MAX_CONCURRENT_STREAMS || "5", 10),
  TIMEOUT_MS: parseInt(process.env.R2_TIMEOUT_MS || "30000", 10),
  RETRY_LIMIT: parseInt(process.env.R2_RETRY_LIMIT || "3", 10),
};

// ===== Phase 9A: Storage-Key Normalization Feature Flags (Day 1) =====
/**
 * Master switch for all normalized-key migration code (Phase 9A+)
 * Should remain false until migration is ready for production
 *
 * PRODUCTION PROTECTION: DO NOT set to true in production until Phase 9B is complete
 * and all normalized upload writes are validated end-to-end in staging.
 */
export const ENABLE_NORMALIZED_OBJECT_KEYS = process.env.ENABLE_NORMALIZED_OBJECT_KEYS === "true";

/**
 * When true: All new R2 uploads use normalized keys (pdf/{env}/{jobId}/{type}.pdf)
 * When false: All R2 uploads use legacy keys (pdf/{absolutePath})
 * Used for safe rollout: start with false, enable in Phase 9B
 *
 * PRODUCTION PROTECTION: DO NOT enable this flag under any Phase 9A canary.
 * This is a Phase 9B flag ONLY. Enabling it now will break all legacy-key lookups
 * until backward-compatible read logic is fully validated.
 */
export const NORMALIZED_KEYS_FOR_NEW_UPLOADS = process.env.NORMALIZED_KEYS_FOR_NEW_UPLOADS === "true";

/**
 * Phase 9A Day 4 Staging Canary — Activation Gate #1 of 2
 *
 * When true: Enables bypass-telemetry emission for compatibility lookup paths
 *            and partially activates the dual-key resolver (only when
 *            ENABLE_NORMALIZED_LOOKUP_CANDIDATES is ALSO true).
 * When false: All compatibility code is completely inert. Legacy path only.
 *
 * STAGING CANARY ACTIVATION:
 *   Set DUAL_KEY_LOOKUP_ENABLED=true in staging environment ONLY.
 *   This flag alone does not activate normalized candidate probing —
 *   ENABLE_NORMALIZED_LOOKUP_CANDIDATES must also be true.
 *   With only this flag, metadata-bypass telemetry will begin emitting.
 *
 * PRODUCTION PROTECTION: Must remain false in production during Phase 9A.
 * DO NOT set to true in production until Day 4 staging canary is fully validated.
 *
 * ROLLBACK: Set to false and redeploy. Takes effect within one rolling restart.
 */
export const DUAL_KEY_LOOKUP_ENABLED = process.env.DUAL_KEY_LOOKUP_ENABLED === "true";

/**
 * Phase 9A Day 4 Staging Canary — Activation Gate #2 of 2
 *
 * When true: Enables normalized-key candidates as first probe in the compatibility
 *            resolver for all metadata-valid lookup paths.
 *            Requires DUAL_KEY_LOOKUP_ENABLED=true to have any effect.
 * When false: Resolver short-circuits to legacy candidate only (no normalized probes).
 *
 * STAGING CANARY ACTIVATION:
 *   Set ENABLE_NORMALIZED_LOOKUP_CANDIDATES=true ONLY after:
 *     1. DUAL_KEY_LOOKUP_ENABLED=true is deployed and bypass-telemetry is confirmed
 *     2. At least one staging job with a known R2-synced legacy key exists
 *     3. Operator is actively monitoring telemetry
 *   Affected paths: GET /:jobId/download/labels (R2 fallback branch ONLY)
 *   Expected behavior: normalized probe misses, legacy probe hits, download succeeds
 *
 * PRODUCTION PROTECTION: Must remain false in production for all of Phase 9A.
 * DO NOT enable in production until staging canary window passes all thresholds.
 *
 * ROLLBACK: Set to false and redeploy. Resolver reverts to legacy-only immediately.
 *           Full containment within one rolling restart (~3–7 minutes).
 *
 * NO-GO TRIGGERS (roll back immediately if any are observed):
 *   - stream_failure rate > 1%
 *   - P95 download latency increase > 250ms above staging baseline
 *   - Any 404/502 on downloads where legacy R2 key was previously reachable
 *   - compatibility_lookup_hit for legacy < 95% in canary window
 *   - Any unexpected metadataBypassReason: "missing_job_id" on labels download path
 *   - R2 HeadObject error rate increase > 2× baseline
 */
export const ENABLE_NORMALIZED_LOOKUP_CANDIDATES = process.env.ENABLE_NORMALIZED_LOOKUP_CANDIDATES === "true";

/**
 * When true: Telemetry logs which key version was used (always true in staging)
 * Set to false only to suppress key-version telemetry in high-throughput production scenarios.
 * Leave as default (true) throughout entire Phase 9A canary window.
 */
export const LOG_KEY_VERSIONS_IN_TELEMETRY = process.env.LOG_KEY_VERSIONS_IN_TELEMETRY !== "false";

export function resolveR2CredentialEnv() {
  const accessKeyId = String(process.env.R2_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY || "").trim();
  const secretAccessKey = String(process.env.R2_SECRET_ACCESS_KEY || process.env.R2_SECRET_KEY || "").trim();
  return {
    accessKeyId,
    secretAccessKey,
  };
}

export function validateStartupConfig() {
  if (featureFlags.ENABLE_DUAL_READ && !featureFlags.ENABLE_DUAL_WRITE) {
    console.warn("[Startup Warning] Dual-read enabled without dual-write. This may cause consistency issues.");
  }

  if (featureFlags.ENABLE_R2_UPLOADS) {
    const r2Creds = resolveR2CredentialEnv();
    if (!process.env.R2_BUCKET || !r2Creds.accessKeyId || !r2Creds.secretAccessKey) {
      console.error("[Startup Error] R2 feature flags enabled but required environment variables are missing.");
      process.exit(1);
    }
  }

  // Phase 9B Day 1: Startup validation for normalized upload writes
  // NORMALIZED_KEYS_FOR_NEW_UPLOADS requires Phase 9A gates to be in place
  if (NORMALIZED_KEYS_FOR_NEW_UPLOADS) {
    if (!DUAL_KEY_LOOKUP_ENABLED) {
      console.error("[Startup Error] NORMALIZED_KEYS_FOR_NEW_UPLOADS=true requires DUAL_KEY_LOOKUP_ENABLED=true (Phase 9A Day 4 gate missing)");
      process.exit(1);
    }
    // Warn if lookup candidates gate is missing (but don't fail, as it's not required for upload writes)
    if (!ENABLE_NORMALIZED_LOOKUP_CANDIDATES) {
      console.warn("[Startup Warning] NORMALIZED_KEYS_FOR_NEW_UPLOADS=true but ENABLE_NORMALIZED_LOOKUP_CANDIDATES=false. Downloads may not find normalized keys until this flag is enabled.");
    }
  }

  console.log("[Startup Config] Feature Flags:", featureFlags);
  console.log("[Startup Config] R2 Config:", r2Config);
}

const DEFAULT_JWT_SECRET = "development-jwt-secret-at-least-32-chars-long";
const rawJwtSecret = String(process.env.JWT_SECRET ?? "").trim();
const isProduction = process.env.NODE_ENV === "production";

if (!rawJwtSecret || rawJwtSecret.length < 32 || rawJwtSecret === DEFAULT_JWT_SECRET) {
  if (isProduction) {
    console.error("[STARTUP] [SECURITY] JWT_SECRET is missing, too weak (< 32 characters), or equals the development default. A strong, unique JWT_SECRET (>= 32 characters) is required in production. Aborting startup.");
    process.exit(1);
  }
  console.warn("[STARTUP] JWT_SECRET is missing/weak. Using development fallback secret. This is NOT safe for production.");
  process.env.JWT_SECRET = DEFAULT_JWT_SECRET;
}

const jwtSecretForDiag = process.env.JWT_SECRET ?? "";
console.log(`[CONFIG] JWT_SECRET_PRESENT=${jwtSecretForDiag.length > 0}`);
console.log(`[CONFIG] JWT_SECRET_LENGTH=${jwtSecretForDiag.length}`);

const envSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().optional(),
  REDIS_URL: z.string().optional(),
  JWT_SECRET: z.string().default(DEFAULT_JWT_SECRET),
  WEB_ORIGIN: z.string().default("http://localhost:3000"),
  API_ORIGIN: z.string().optional(),
  STORAGE_DIR: z.string().default("storage"),
  PYTHON_SERVICE_URL: z.string().optional(),
  ADMIN_BOOTSTRAP_SECRET: z.string().min(16).optional(),
  MONEY_ORDER_FRONT_IMAGE_PATH: z.string().optional(),
  MONEY_ORDER_BACK_IMAGE_PATH: z.string().optional(),
  ENABLE_TEMPLATE_DESIGNER: z.string().default("false"),
  FRONTEND_URL: z.string().optional(),
  EP_GATEWAY_SECRET: z.string().optional(),
  EP_GATEWAY_INITIATE_URL: z.string().url().optional(),
  EP_GATEWAY_INQUIRY_URL: z.string().url().optional(),
  EP_GATEWAY_MERCHANT_ID: z.string().optional(),
  EP_GATEWAY_STORE_ID: z.string().optional(),
  EP_GATEWAY_USERNAME: z.string().optional(),
  EP_GATEWAY_PASSWORD: z.string().optional(),
  EP_GATEWAY_REQUEST_TIMEOUT_MS: z.coerce.number().default(15000),
  EP_GATEWAY_INITIATE_CONTENT_TYPE: z.string().default("application/json"),
  EP_GATEWAY_SIGNATURE_METHOD: z.string().default("hmac"),
  EP_GATEWAY_SIGNATURE_ALGO: z.string().default("sha256"),
  EP_GATEWAY_SIGNATURE_FORMAT: z.string().default("values"),
  EP_GATEWAY_SIGNATURE_FIELDS: z.string().default("reference,status,transactionId,amountCents,timestamp"),
  EP_GATEWAY_STATUS_SUCCESS_VALUES: z.string().default("SUCCESS,SUCCEEDED,PAID,00,000"),
  EP_GATEWAY_STATUS_FAILED_VALUES: z.string().default("FAILED,FAIL,ERROR,01,999"),
  EP_GATEWAY_STATUS_CANCELED_VALUES: z.string().default("CANCELED,CANCELLED,CANCEL"),
  EP_GATEWAY_PAYMENT_MODE: z.string().default("CC"),
  JAZZCASH_ENV: z.enum(["sandbox", "production"]).default("production"),
  JAZZCASH_MERCHANT_ID: z.string().optional(),
  JAZZCASH_PASSWORD: z.string().optional(),
  JAZZCASH_INTEGRITY_SALT: z.string().optional(),
  JAZZCASH_RETURN_URL: z.string().url().optional(),
  JAZZCASH_SANDBOX_ENDPOINT: z.string().url().optional(),
  JAZZCASH_LIVE_ENDPOINT: z.string().url().optional(),
  JAZZCASH_MOBILE_WALLET_ENDPOINT_SANDBOX: z.string().url().optional(),
  JAZZCASH_MOBILE_WALLET_ENDPOINT_LIVE: z.string().url().optional(),
  JAZZCASH_STATUS_INQUIRY_ENDPOINT_SANDBOX: z.string().url().optional(),
  JAZZCASH_STATUS_INQUIRY_ENDPOINT_LIVE: z.string().url().optional(),
  JAZZCASH_MOBILE_WALLET_ENABLED: z.string().default("true"),
  JAZZCASH_MOBILE_WALLET_CNIC: z.string().optional(),
  JAZZCASH_ALLOWED_ORIGINS: z.string().optional(),
  JAZZCASH_TXN_TYPE: z.string().optional(),
  JAZZCASH_BANK_ID: z.string().optional(),
  JAZZCASH_PRODUCT_ID: z.string().optional(),
  JAZZCASH_SUBMERCHANT_ID: z.string().optional(),
  JAZZCASH_MERCHANT_ACCOUNT: z.string().default("03xxxxxxxxx"),
  JAZZCASH_MERCHANT_NAME: z.string().default("ePost Pakistan"),
  JAZZCASH_QR_URL: z.string().optional(),
  EASYPAISA_MERCHANT_ACCOUNT: z.string().default("03xxxxxxxxx"),
  EASYPAISA_MERCHANT_NAME: z.string().default("ePost Pakistan"),
  EASYPAISA_QR_URL: z.string().optional(),
  CORS_ALLOWED_ORIGINS: z.string().optional(),
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),
  FIREBASE_WEB_API_KEY: z.string().optional(),
});

export const env = envSchema.parse(process.env);
