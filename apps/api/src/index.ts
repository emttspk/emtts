import express from "express";
import cors from "cors";
import helmet from "helmet";
import fs from "fs";
import { createConnection } from "node:net";
import { env, featureFlags, NORMALIZED_KEYS_FOR_NEW_UPLOADS, r2Config, resolveR2CredentialEnv, stagingConfig, validateStartupConfig } from "./config.js";
import { ensureDatabaseConnection } from "./db.js";
import { prisma } from "./lib/prisma.js";
import { authRouter } from "./routes/auth.js";
import { meRouter } from "./routes/me.js";
import { handleLabelUpload, jobsRouter, labelUploadMiddleware } from "./routes/jobs.js";
import { trackingRouter } from "./routes/tracking.js";
import { shipmentsRouter } from "./routes/shipments.js";
import { adminRouter } from "./routes/admin.js";
import { adminTemplatesRouter } from "./routes/adminTemplates.js";
import { subscriptionsRouter } from "./routes/subscriptions.js";
import { paymentsRouter } from "./routes/payments.js";
import { plansRouter, ensureDefaultPlans } from "./routes/plans.js";
import { manualPaymentsRouter } from "./routes/manualPayments.js";
import { billingSettingsRouter } from "./routes/billingSettings.js";
import { supportRouter } from "./routes/support.js";
import { adminSupportRouter } from "./routes/adminSupport.js";
import { bookingQuotesRouter } from "./routes/bookingQuotes.js";
import { ensureStorageDirs } from "./storage/paths.js";
import { startCleanupCron } from "./cron/cleanup.js";
import { requireAuth } from "./middleware/auth.js";
import { createStartupReadinessReport, getInfrastructureEnvStatus, logStartupReadinessReport, getStagingConfigReport, logStagingConfigReport } from "./startup/readiness.js";
import { releaseQueuedLabels } from "./usage/limits.js";
import { UPLOAD_DIR } from "./utils/paths.js";
import { R2StorageProvider } from "./storage/R2StorageProvider.js";
import { getTelemetrySinkDiagnostics, logStagingCanaryInitialized, logStagingConnectivityCheck, logStagingStartupConfig, logTelemetry, logTelemetrySinkInitialized, logEnvSourceDetected, logMissingRequiredEnv } from "./telemetry.js";
import { stagingModeActiveGauge, unsyncedArtifactsGauge } from "./metrics.js";
import { getCatalogDiagnostics, listCatalogServices } from "./catalog/serviceCatalog.js";
import { assertRenderPrerequisites, collectRenderPrerequisiteDiagnostics } from "./templates/labels.js";
const BUILD_VERSION = process.env.RAILWAY_GIT_COMMIT_SHA ?? "local";
const isProduction = process.env.NODE_ENV === "production";
const startupStartedAt = Date.now();

function logStartupTiming(metric: string, startedAt: number) {
  console.log(`[STARTUP_TIMING] ${metric}=${Math.max(0, Date.now() - startedAt)}ms`);
}

function parseRedisMajorVersion(info: string) {
  const match = /(?:^|\n)redis_version:(\d+)\.(\d+)\.(\d+)/.exec(String(info ?? ""));
  if (!match) {
    return null;
  }
  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3], 10),
    raw: `${match[1]}.${match[2]}.${match[3]}`,
  };
}

async function assertRedisRuntimeCompatibility() {
  const redisEnv = getInfrastructureEnvStatus().redis;
  if (!redisEnv.usable) {
    throw new Error(redisEnv.issue ?? "REDIS_URL is missing or placeholder");
  }

  const { ensureRedisConnection, getRedisConnection } = await import("./queue/redis.js");
  await ensureRedisConnection();
  const redis = getRedisConnection();
  const serverInfo = await redis.info("server");
  const version = parseRedisMajorVersion(serverInfo);
  if (!version) {
    throw new Error("Redis server version could not be determined from INFO server");
  }
  if (version.major < 5) {
    throw new Error(`Redis ${version.raw} is unsupported. Use Redis 5+ (BullMQ requirement).`);
  }
  console.log(`[STARTUP] Redis version check passed: ${version.raw}`);
}

async function enforceRenderAndRedisPreflightOrExit() {
  const renderScanStartedAt = Date.now();
  const renderDiagnostics = collectRenderPrerequisiteDiagnostics();
  logStartupTiming("render_scan_ms", renderScanStartedAt);
  if (!renderDiagnostics.ready) {
    console.error("[STARTUP] Render prerequisite diagnostics:", JSON.stringify(renderDiagnostics, null, 2));
  } else {
    console.log("[STARTUP] Render prerequisite diagnostics:", JSON.stringify(renderDiagnostics.resolved));
  }
  assertRenderPrerequisites();
  try {
    await assertRedisRuntimeCompatibility();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isProduction) {
      throw err;
    }
    console.warn(`[STARTUP] Redis preflight degraded in development: ${message}`);
  }
}

async function logAllocatorSequenceDiagnostics(tag: string) {
  type SequenceRow = {
    prefix: string;
    date_code: string;
    next_sequence: number;
  };
  type PersistedRow = {
    prefix: string;
    date_code: string;
    persisted_count: number;
  };

  const [sequenceRows, persistedRows] = await Promise.all([
    prisma.$queryRaw<SequenceRow[]>`
      SELECT prefix, date_code, next_sequence
      FROM tracking_id_sequences
      ORDER BY updated_at DESC
      LIMIT 25
    `,
    prisma.$queryRaw<PersistedRow[]>`
      SELECT
        SUBSTRING("trackingNumber" FROM 1 FOR 3) AS prefix,
        SUBSTRING("trackingNumber" FROM 4 FOR 4) AS date_code,
        COUNT(*)::int AS persisted_count
      FROM "Shipment"
      WHERE "trackingNumber" ~ '^[A-Z]{3}[0-9]{4}[0-9]{4,7}$'
      GROUP BY 1, 2
    `,
  ]);

  const persistedMap = new Map<string, number>();
  for (const row of persistedRows) {
    persistedMap.set(`${String(row.prefix)}:${String(row.date_code)}`, Number(row.persisted_count) || 0);
  }

  const rows = sequenceRows.map((row) => {
    const key = `${row.prefix}:${row.date_code}`;
    const reservedCount = Math.max(0, Number(row.next_sequence) - 1);
    const persistedCount = persistedMap.get(key) ?? 0;
    return {
      key,
      prefix: row.prefix,
      dateCode: row.date_code,
      reservedCount,
      persistedCount,
      drift: reservedCount - persistedCount,
    };
  });

  const payload = {
    event: "allocator_sequence_snapshot",
    tag,
    rowCount: rows.length,
    totalReserved: rows.reduce((sum, row) => sum + row.reservedCount, 0),
    totalPersisted: rows.reduce((sum, row) => sum + row.persistedCount, 0),
    totalDrift: rows.reduce((sum, row) => sum + row.drift, 0),
    rows,
    timestamp: new Date().toISOString(),
  };
  console.log("[AllocatorDiag]", JSON.stringify(payload));
}

function getUrlHost(url: string | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function isLocalHost(host: string): boolean {
  const normalized = host.toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "0.0.0.0";
}

function normalizeOrigin(value: string | undefined): string {
  return String(value ?? "").trim().replace(/\/+$/, "").toLowerCase();
}

function isLocalOrigin(origin: string | undefined): boolean {
  const normalized = normalizeOrigin(origin);
  if (!normalized) return false;
  try {
    const url = new URL(normalized);
    return isLocalHost(url.hostname);
  } catch {
    return false;
  }
}

const SENSITIVE_QUERY_KEYS = new Set([
  "token",
  "access_token",
  "refresh_token",
  "password",
  "secret",
  "key",
  "api_key",
  "code",
  "auth",
  "authorization",
  "jwt",
  "session",
  "cookie",
  "payment_token",
  "transaction_secret",
]);

function formatRequestUrlForLog(originalUrl: string): string {
  const [pathname, search = ""] = String(originalUrl ?? "").split("?", 2);
  if (!search) return pathname || "/";

  const params = new URLSearchParams(search);
  for (const key of params.keys()) {
    if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) {
      params.set(key, "[redacted]");
    }
  }

  const redactedSearch = params.toString();
  return redactedSearch ? `${pathname}?${redactedSearch}` : pathname;
}

function parseOriginList(value: string | undefined): string[] {
  return String(value ?? "")
    .split(",")
    .map((entry) => normalizeOrigin(entry))
    .filter(Boolean);
}

const allowedCorsOrigins = new Set(
  [
    env.WEB_ORIGIN,
    "https://www.epost.pk",
    "https://epost.pk",
    ...(!isProduction
      ? [
          "http://localhost:5173",
          "http://127.0.0.1:5173",
          "http://localhost:3000",
          "http://127.0.0.1:3000",
        ]
      : []),
  ]
    .map(normalizeOrigin)
    .filter((origin) => !isProduction || !isLocalOrigin(origin))
    .filter(Boolean),
);

const jazzcashAllowedCorsOrigins = new Set(
  [
    ...parseOriginList(env.JAZZCASH_ALLOWED_ORIGINS),
    "https://sandbox.jazzcash.com.pk",
    "https://payments.jazzcash.com.pk",
  ].map(normalizeOrigin).filter(Boolean),
);

function isJazzcashCorsPath(path: string | undefined): boolean {
  const normalized = String(path ?? "").toLowerCase();
  return normalized === "/api/payments/jazzcash/callback"
    || normalized === "/api/payments/jazzcash/ipn"
    || normalized === "/api/payments/jazzcash/relay";
}

function isAllowedCorsOrigin(origin: string | undefined): boolean {
  return allowedCorsOrigins.has(normalizeOrigin(origin));
}

function isAllowedJazzcashCorsOrigin(origin: string | undefined): boolean {
  return jazzcashAllowedCorsOrigins.has(normalizeOrigin(origin));
}

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  console.log("[STARTUP] Uploads directory created:", UPLOAD_DIR);
}

// Log DATABASE_URL status without failing before the HTTP server binds.
console.log("DATABASE_URL exists:", !!process.env.DATABASE_URL);

if (!process.env.DATABASE_URL) {
  console.warn("DATABASE_URL is missing");
  console.warn("For Railway: Link a PostgreSQL database service. It will auto-inject DATABASE_URL.");
  console.warn("For local dev: Ensure .env file exists with DATABASE_URL set.");
} else if (!process.env.DATABASE_URL.startsWith("postgresql://") && !process.env.DATABASE_URL.startsWith("postgres://")) {
  console.warn("Invalid DATABASE_URL format");
  console.warn("Received: [redacted]");
  console.warn("Must start with postgresql:// or postgres://");
}

console.log("🚀 Starting LabelGen API server FIXED...");
console.log(`[STARTUP] NODE_ENV=${process.env.NODE_ENV}`);
console.log(`[STARTUP] DATABASE_URL is set: ${process.env.DATABASE_URL ? "yes" : "no"}`);
if (process.env.DATABASE_URL) {
  // Extract database metadata without printing credentials.
  try {
    const url = new URL(process.env.DATABASE_URL);
    if (isProduction && isLocalHost(url.hostname)) {
      console.error("[STARTUP] DATABASE_URL points to localhost in production. Set an external PostgreSQL URL.");
    }
    const pathname = url.pathname;
    const dbName = pathname.split('?')[0].replace(/^\//, '') || 'unknown';
    console.log(`[STARTUP] Database name: ${dbName}`);
    if (!isProduction || !isLocalHost(url.hostname)) {
      console.log(`[STARTUP] Database host: ${url.hostname}`);
    }
  } catch (e) {
    console.warn(`[STARTUP] Could not parse DATABASE_URL`);
  }
}

function normalizeDatabaseUrl() {
  if (!process.env.DATABASE_URL) return;
  const trimmedUrl = process.env.DATABASE_URL.trim();
  if (trimmedUrl.startsWith("postgres://")) {
    process.env.DATABASE_URL = trimmedUrl.replace(/^postgres:\/\//, "postgresql://");
    console.log("[DB-NORM] Normalized postgres:// to postgresql://");
  } else {
    process.env.DATABASE_URL = trimmedUrl;
  }
}

function hasUsableDatabaseUrl() {
  const dbUrl = String(process.env.DATABASE_URL ?? "").trim();
  const validProtocol = dbUrl.startsWith("postgresql://") || dbUrl.startsWith("postgres://");
  if (!validProtocol) return false;

  if (isProduction) {
    const host = getUrlHost(dbUrl);
    if (isLocalHost(host)) {
      return false;
    }
  }

  return true;
}

async function isTcpEndpointReachable(host: string, port: number, timeoutMs = 800): Promise<boolean> {
  return await new Promise((resolve) => {
    const socket = createConnection({ host, port });

    const finish = (reachable: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(reachable);
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

function validateEnvironment() {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!process.env.DATABASE_URL) {
    warnings.push("DATABASE_URL environment variable is not set. API health routes will stay online, but database-backed routes will be unavailable until a PostgreSQL service is configured.");
  } else {
    const dbUrl = process.env.DATABASE_URL;
    const isValidPostgres = dbUrl.startsWith("postgresql://") || dbUrl.startsWith("postgres://");
    if (!isValidPostgres) {
      warnings.push("DATABASE_URL is invalid. Must start with postgresql:// or postgres://");
    }
  }

  const redisUrl = String(process.env.REDIS_URL ?? "").trim();
  const pythonServiceUrl = String(process.env.PYTHON_SERVICE_URL ?? "").trim();
  const dbHost = getUrlHost(process.env.DATABASE_URL);
  if (!redisUrl) {
    warnings.push("REDIS_URL environment variable is not set. Queue processing will be unavailable until Redis is configured.");
  } else if (isProduction && /(localhost|127\.0\.0\.1)/i.test(redisUrl)) {
    warnings.push("REDIS_URL points to localhost in production. Configure Railway Redis and set REDIS_URL.");
  } else if (/(^|[:@/])HOST([:@/]|$)|(^|[:@/])PASSWORD([:@/]|$)/i.test(redisUrl)) {
    warnings.push("REDIS_URL appears to be a placeholder value. Replace it with a real Redis URL.");
  } else if (isProduction && !redisUrl.startsWith("rediss://")) {
    // Warn but do not block startup — some Railway plans expose redis:// internally
    console.warn("⚠️  [Redis] REDIS_URL does not use TLS (rediss://). This is fine for internal Railway networking but ensure the URL is correct.");
  }
  if (isProduction) {
    if (dbHost && isLocalHost(dbHost)) {
      warnings.push("DATABASE_URL points to localhost in production. Configure external PostgreSQL and set DATABASE_URL.");
    }
    if (!pythonServiceUrl) {
      warnings.push("PYTHON_SERVICE_URL is not set. Tracking/complaint processing will stay unavailable until a Python service URL is configured.");
    } else if (/(localhost|127\.0\.0\.1)/i.test(pythonServiceUrl)) {
      warnings.push("PYTHON_SERVICE_URL points to localhost in production. Configure Railway internal Python service URL for tracking/complaint processing.");
    }
  }

  if (warnings.length > 0) {
    console.warn("⚠️  STARTUP WARNINGS:");
    warnings.forEach((warning) => console.warn(`   - ${warning}`));
  }

  if (errors.length > 0) {
    console.error("❌ STARTUP VALIDATION FAILED:");
    errors.forEach((err) => console.error(`   - ${err}`));
  }
}

normalizeDatabaseUrl();
validateEnvironment();

// Stage S1 Staging Validation
const stagingReport = getStagingConfigReport();
logStagingConfigReport(stagingReport);
stagingModeActiveGauge.set(stagingConfig.STAGING_R2_ENABLED ? 1 : 0);
logTelemetrySinkInitialized();
logTelemetry({
  event: "canary_runtime_configuration",
  enabled: stagingConfig.STAGING_R2_ENABLED,
  mode: stagingConfig.CANARY_MODE,
  percentage: stagingConfig.CANARY_MODE === "job-percentage" ? stagingConfig.CANARY_PERCENTAGE : undefined,
  maxJobs: stagingConfig.CANARY_MODE === "job-count" ? stagingConfig.CANARY_MAX_JOBS : undefined,
  dualWriteEnabled: featureFlags.ENABLE_DUAL_WRITE,
  dualReadEnabled: featureFlags.ENABLE_DUAL_READ,
  r2UploadsEnabled: featureFlags.ENABLE_R2_UPLOADS,
  normalizedKeysEnabled: NORMALIZED_KEYS_FOR_NEW_UPLOADS,
  telemetrySink: getTelemetrySinkDiagnostics(),
});
logStagingStartupConfig({
  stagingEnabled: stagingConfig.STAGING_R2_ENABLED,
  canaryMode: stagingConfig.CANARY_MODE,
  dualWriteEnabled: featureFlags.ENABLE_DUAL_WRITE,
  r2UploadsEnabled: featureFlags.ENABLE_R2_UPLOADS,
  credentialsConfigured: stagingReport.credentialsConfigured,
  bucketConfigured: stagingReport.r2BucketConfigured,
});
if (stagingConfig.STAGING_R2_ENABLED && stagingConfig.CANARY_MODE !== "disabled") {
  logStagingCanaryInitialized({
    canaryMode: stagingConfig.CANARY_MODE,
    percentage: stagingConfig.CANARY_MODE === "job-percentage" ? stagingConfig.CANARY_PERCENTAGE : undefined,
    maxJobs: stagingConfig.CANARY_MODE === "job-count" ? stagingConfig.CANARY_MAX_JOBS : undefined,
  });
}

function failStagingStartup(reason: string, diagnostics: Record<string, unknown>) {
  logStagingConnectivityCheck({
    connectivity: false,
    uploadable: false,
    downloadable: false,
    presignedUrl: false,
    allValid: false,
    errors: [reason],
  });
  logTelemetry({
    event: "staging_startup_validation_failed",
    reason,
    diagnostics,
    stagingEnabled: stagingConfig.STAGING_R2_ENABLED,
    r2UploadsEnabled: featureFlags.ENABLE_R2_UPLOADS,
  });
  console.error("[S1 STAGING] Startup validation failed:", reason);
  console.error("[S1 STAGING] Diagnostics:", diagnostics);
  process.exit(1);
}

async function enforceS1StartupValidationOrExit() {
  const requiresStrictValidation = stagingConfig.STAGING_R2_ENABLED && featureFlags.ENABLE_R2_UPLOADS;
  if (!requiresStrictValidation) {
    // Emit env source even when staging is not active (for diagnostics)
    logEnvSourceDetected(process.env.STORAGE_PROVIDER === "r2" ? "railway" : "shell");
    return;
  }

  // Emit env source detected at startup (for diagnostics and drift detection)
  logEnvSourceDetected(process.env.RAILWAY_GIT_COMMIT_SHA ? "railway" : "shell");

  validateStartupConfig();

  const timeoutMs = Number(r2Config.TIMEOUT_MS || 0);
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120000) {
    failStagingStartup("R2_TIMEOUT_MS must be between 1000 and 120000 milliseconds", {
      configuredTimeoutMs: timeoutMs,
      recommendation: "Set R2_TIMEOUT_MS to a safe value, e.g. 30000",
    });
    return;
  }

  const creds = resolveR2CredentialEnv();
  const endpoint = String(process.env.R2_ENDPOINT || "").trim();
  const bucket = String(process.env.R2_BUCKET || "").trim();

  const missing: string[] = [];
  if (!endpoint) missing.push("R2_ENDPOINT");
  if (!bucket) missing.push("R2_BUCKET");
  if (!creds.accessKeyId) missing.push("R2_ACCESS_KEY_ID or R2_ACCESS_KEY");
  if (!creds.secretAccessKey) missing.push("R2_SECRET_ACCESS_KEY or R2_SECRET_KEY");
  if (missing.length > 0) {
    failStagingStartup("Missing required R2 startup configuration", {
      missing,
      recommendation: "Provide all missing R2 environment variables before enabling S1 staging",
    });
    return;
  }

  const provider = new R2StorageProvider({
    accessKeyId: creds.accessKeyId,
    secretAccessKey: creds.secretAccessKey,
    endpoint,
    region: process.env.R2_REGION || "auto",
    bucket,
  });

  const validation = await provider.validateBucketAccess();
  logStagingConnectivityCheck(validation);

  if (!validation.allValid) {
    failStagingStartup("R2 startup validation failed", {
      endpoint,
      bucket,
      timeoutMs,
      errors: validation.errors,
      checks: {
        connectivity: validation.connectivity,
        uploadable: validation.uploadable,
        downloadable: validation.downloadable,
        presignedUrl: validation.presignedUrl,
      },
      recommendation: "Run npm run r2:verify and fix the failing checks before startup",
    });
  }

  logTelemetry({
    event: "staging_startup_validation_passed",
    endpoint,
    bucket,
    timeoutMs,
    checks: {
      connectivity: validation.connectivity,
      uploadable: validation.uploadable,
      downloadable: validation.downloadable,
      presignedUrl: validation.presignedUrl,
    },
  });
}

// runMigrations() is now handled in package.json start script
// NOTE: Ensure database connection BUT DO NOT BLOCK startup
// This will initialize in the background while the server starts
async function initializeDatabaseSafely(): Promise<{ ready: boolean; issue?: string }> {
  if (!hasUsableDatabaseUrl()) {
    console.warn("[DB] Skipping initial database connection because DATABASE_URL is missing or invalid.");
    return { ready: false, issue: "DATABASE_URL is missing or invalid" };
  }

  try {
    const dbUrl = new URL(String(process.env.DATABASE_URL));
    const dbHost = dbUrl.hostname;
    const dbPort = Number(dbUrl.port || 5432);

    if (!isProduction && isLocalHost(dbHost)) {
      const isReachable = await isTcpEndpointReachable(dbHost, dbPort);
      if (!isReachable) {
        console.warn(`[DB] Skipping initial database connection because ${dbHost}:${dbPort} is not reachable in local development.`);
        return { ready: false, issue: `${dbHost}:${dbPort} is not reachable` };
      }
    }
  } catch {
    console.warn("[DB] Skipping initial database connection because DATABASE_URL could not be parsed.");
    return { ready: false, issue: "DATABASE_URL could not be parsed" };
  }

  try {
    const ready = await ensureDatabaseConnection();
    return { ready, issue: ready ? undefined : "Database connection did not become ready" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[DB] Connection error: ${message}`);
    return { ready: false, issue: message };
  }
}

async function initializeRedisSafely(): Promise<{ ready: boolean; issue?: string }> {
  const redisReadyStartedAt = Date.now();
  const redisEnv = getInfrastructureEnvStatus().redis;
  if (!redisEnv.usable) {
    logStartupTiming("redis_ready_ms", redisReadyStartedAt);
    return { ready: false, issue: redisEnv.issue ?? "REDIS_URL is missing or placeholder" };
  }

  try {
    const { ensureRedisConnection, getRedisConnection } = await import("./queue/redis.js");
    await ensureRedisConnection();
    const redis = getRedisConnection();
    const info = await redis.info("server");
    const version = parseRedisMajorVersion(info);
    if (!version) {
      logStartupTiming("redis_ready_ms", redisReadyStartedAt);
      return { ready: false, issue: "Redis version could not be determined from INFO server" };
    }
    if (version.major < 5) {
      logStartupTiming("redis_ready_ms", redisReadyStartedAt);
      return { ready: false, issue: `Redis ${version.raw} is unsupported. Use Redis 5+.` };
    }
    logStartupTiming("redis_ready_ms", redisReadyStartedAt);
    return { ready: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[REDIS] Startup readiness check failed: ${message}`);
    logStartupTiming("redis_ready_ms", redisReadyStartedAt);
    return { ready: false, issue: message };
  }
}

const initialDatabaseReady = initializeDatabaseSafely();

// Global crash protection
process.on("uncaughtException", (err) => {
  console.error("🔴 UNCAUGHT EXCEPTION:", err);
  // Log but don't exit - let the process recover
});

process.on("unhandledRejection", (err) => {
  console.error("🔴 UNHANDLED REJECTION:", err);
  // Log but don't exit - let the process recover
});

const app = express();

app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false,
    crossOriginResourcePolicy: false,
    contentSecurityPolicy: false,
  }),
);
app.use(
  cors((req, callback) => {
    const origin = req.header("Origin");
    const requestPath = req.originalUrl || req.path;
    const allowOrigin = !origin
      || isAllowedCorsOrigin(origin)
      || (isJazzcashCorsPath(requestPath) && isAllowedJazzcashCorsOrigin(origin));

    if (!allowOrigin) {
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    }

    return callback(null, {
      origin: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Authorization", "Content-Type"],
      exposedHeaders: ["Content-Disposition"],
      credentials: true,
    });
  }),
);
app.use(express.json({ limit: "2mb" }));

app.use((req, _res, next) => {
  console.log(`[REQ] ${req.method} ${formatRequestUrlForLog(req.originalUrl || req.url || "/")}`);
  return next();
});

app.get("/", (_req, res) => {
  res.status(200).send("OK");
});

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.get("/health/db", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return res.json({ status: "ok", service: "db" });
  } catch (err) {
    const message = isProduction ? "Database health check failed" : (err instanceof Error ? err.message : String(err));
    return res.status(503).json({ status: "error", service: "db", message });
  }
});

app.get("/health/redis", async (_req, res) => {
  try {
    const { redis: redisClient, redisEnabled: enabled } = await import("./lib/redis.js");
    if (!enabled) {
      return res.status(503).json({ status: "disabled", service: "redis", message: "REDIS_URL not configured" });
    }
    const pong = await redisClient.ping();
    return res.json({ status: pong === "PONG" ? "ok" : "error", service: "redis" });
  } catch (err) {
    const message = isProduction ? "Redis health check failed" : (err instanceof Error ? err.message : String(err));
    return res.status(503).json({ status: "error", service: "redis", message });
  }
});

app.get("/health/worker", async (_req, res) => {
  try {
    const { redis: redisClient, redisEnabled: enabled } = await import("./lib/redis.js");
    if (!enabled) {
      return res.status(503).json({ status: "unknown", service: "worker", message: "Redis required to check worker status" });
    }
    // Worker writes a heartbeat key when it acquires its singleton lock
    const lockValue = await redisClient.get("worker:singleton:label-generator");
    if (lockValue) {
      return res.json({ status: "ok", service: "worker" });
    }
    return res.status(503).json({ status: "offline", service: "worker", message: "Worker singleton lock not held" });
  } catch (err) {
    const message = isProduction ? "Worker health check failed" : (err instanceof Error ? err.message : String(err));
    return res.status(503).json({ status: "error", service: "worker", message });
  }
});

const router = express.Router();

const ensureApiDatabaseConnection: express.RequestHandler = async (_req, res, next) => {
  try {
    await prisma.$connect();
    return next();
  } catch (error) {
    const message = isProduction ? "Database connection failed" : (error instanceof Error ? error.message : "Database connection failed");
    return res.status(503).json({ success: false, message });
  }
};

// API routes (these come first)
router.get("/", (_req, res) => res.json({ success: true, message: "LabelGen API is running" }));
router.get("/version", (_req, res) => res.json({ success: true, version: BUILD_VERSION }));
router.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});
router.get("/catalog/services", (_req, res) => {
  res.json({
    success: true,
    services: listCatalogServices({ includeDeprecated: false }),
  });
});
router.get("/catalog/diagnostics", (_req, res) => {
  res.json({
    success: true,
    diagnostics: getCatalogDiagnostics(),
  });
});
router.get("/template.csv", (_req, res) => {
  const header = [
    "shipperName",
    "shipperPhone",
    "shipperAddress",
    "shipperEmail",
    "senderCity",
    "consigneeName",
    "consigneeEmail",
    "consigneePhone",
    "consigneeAddress",
    "ConsigneeCity",
    "CollectAmount",
    "orderid",
    "ProductDescription",
    "Weight",
    "shipment_type",
    "numberOfPieces",
    "TrackingID",
  ].join(",");

  const today = new Date();
  const yy = String(today.getFullYear()).slice(-2);
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const activeServices = listCatalogServices({ includeDeprecated: false }).filter((entry) => entry.trackingNamespace);
  const rows = activeServices.map((entry, index) => {
    const serial = String(index + 1).padStart(4, "0");
    const collectAmount = entry.category === "general_post" ? "0" : String(10_000 + index * 500);
    return [
      "Acme Store",
      "03001234567",
      "1 Mall Road",
      "ops@acme.example",
      "Lahore",
      `Receiver ${index + 1}`,
      `receiver${index + 1}@example.com`,
      `03${String(index + 11).padStart(2, "0")}1234567`,
      `${index + 10} Sample Street`,
      "Lahore",
      collectAmount,
      `ORD-${index + 1}`,
      `Sample Product ${index + 1}`,
      "1.0",
      entry.service,
      "1",
      `${entry.prefix}${yy}${mm}${serial}`,
    ];
  });

  const esc = (v: string) => (/[\",\n]/.test(v) ? `"${v.replace(/\"/g, "\"\"")}"` : v);
  const csv = [header, ...rows.map((r) => r.map((c) => esc(String(c))).join(","))].join("\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=template.csv");
  return res.status(200).send(csv);
});

router.use("/auth", ensureApiDatabaseConnection, authRouter);
router.use("/me", ensureApiDatabaseConnection, meRouter);
router.use("/jobs", ensureApiDatabaseConnection, jobsRouter);
// Compatibility alias for older clients
router.post("/upload", ensureApiDatabaseConnection, requireAuth, labelUploadMiddleware, handleLabelUpload);
router.use("/tracking", ensureApiDatabaseConnection, trackingRouter);
router.get("/track", ensureApiDatabaseConnection, (_req, res) => {
  res.status(400).json({
    success: false,
    message: "Tracking number is required",
    usage: "/api/track/:trackingNumber",
  });
});
router.get("/track/:trackingNumber", ensureApiDatabaseConnection, requireAuth, (req, res, next) => {
  req.url = `/track/${req.params.trackingNumber}`;
  return (trackingRouter as any)(req, res, next);
});
router.get("/print", (_req, res) => {
  res.json({
    success: true,
    message: "Print API is available",
    endpoints: [
      "/api/jobs/preview/labels",
      "/api/jobs/:jobId/download/labels",
      "/api/jobs/:jobId/download/money-order",
    ],
  });
});
router.get("/label", (_req, res) => {
  res.json({
    success: true,
    message: "Label API is available",
    endpoints: [
      "/api/upload",
      "/api/jobs/preview/labels",
      "/api/jobs/:jobId/download/labels",
    ],
  });
});
router.use("/shipments", ensureApiDatabaseConnection, shipmentsRouter);
router.use("/admin/templates", ensureApiDatabaseConnection, adminTemplatesRouter);
router.use("/admin/support", ensureApiDatabaseConnection, adminSupportRouter);
router.use("/admin", ensureApiDatabaseConnection, adminRouter);
router.use("/support", ensureApiDatabaseConnection, supportRouter);
router.use("/booking-quotes", ensureApiDatabaseConnection, bookingQuotesRouter);
router.use("/subscriptions", ensureApiDatabaseConnection, subscriptionsRouter);
router.use("/payments", ensureApiDatabaseConnection, paymentsRouter);
router.use("/manual-payments", ensureApiDatabaseConnection, manualPaymentsRouter);
router.use("/billing-settings", ensureApiDatabaseConnection, billingSettingsRouter);
router.use("/plans", plansRouter);

router.use("/*", (_req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

app.use("/api", router);
app.use((_req, res) => {
  res.status(404).send("Not Found");
});

// Global Error Handler
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const detail = err instanceof Error ? err.message : String(err);
  if (isProduction) {
    console.error("GLOBAL ERROR:", detail);
  } else {
    console.error("GLOBAL ERROR:", err);
  }
  const message = isProduction ? "Internal server error" : (err instanceof Error ? err.message : "An unknown server error occurred.");
  if (!res.headersSent) {
    res.status(500).json({ success: false, message });
  }
});

async function initializeUnsyncedArtifactsGauge(databaseReady: boolean) {
  if (!databaseReady) {
    unsyncedArtifactsGauge.set(0);
    return;
  }

  const [unsyncedLabels, unsyncedMoneyOrders, unsyncedTracking] = await Promise.all([
    prisma.labelJob.count({
      where: {
        labelsPdfPath: { not: null },
        labelsPdfSyncedAt: null,
      },
    }),
    prisma.labelJob.count({
      where: {
        moneyOrderPdfPath: { not: null },
        moneyOrderPdfSyncedAt: null,
      },
    }),
    prisma.trackingJob.count({
      where: {
        resultPath: { not: null },
        resultSyncedAt: null,
      },
    }),
  ]);

  unsyncedArtifactsGauge.set(Math.max(0, unsyncedLabels + unsyncedMoneyOrders + unsyncedTracking));
}

async function startServer() {
  await enforceS1StartupValidationOrExit();

  const port = Number(process.env.PORT || 3000);
  const server = app.listen(port, "0.0.0.0", () => {
    console.log("Server running");
  });

  server.on("error", (err: any) => {
    if (err?.code === "EADDRINUSE") {
      console.error(`API port ${port} is already in use. Stop the other running API process and try again.`);
      return;
    }
    console.error("API server error:", err);
    return;
  });

  // Run all initialization tasks asynchronously AFTER server starts
  try {
    console.log("[INIT] Starting async initialization tasks...");
    
    // Ensure storage directories exist
    await ensureStorageDirs();
    console.log("[INIT] Storage directories ready");

    const databaseReadiness = await initialDatabaseReady;
    const redisReadiness = await initializeRedisSafely();
    const databaseReady = databaseReadiness.ready;
    const redisReady = redisReadiness.ready;
    logStartupReadinessReport(
      createStartupReadinessReport("API", {
        databaseReady,
        redisReady,
        databaseIssue: databaseReadiness.issue,
        redisIssue: redisReadiness.issue,
      }),
    );

    await initializeUnsyncedArtifactsGauge(databaseReady).catch((err) => {
      console.warn("[INIT] Failed to initialize unsynced artifacts gauge:", err instanceof Error ? err.message : String(err));
      unsyncedArtifactsGauge.set(0);
    });

    if (databaseReady) {
      // Seed default plans
      await ensureDefaultPlans().catch(err => console.error("[INIT] Failed to seed default plans:", err));
      console.log("[INIT] Default plans ready");
    } else {
      console.log("[INIT] Skipping default plan seed because the database is unavailable.");
    }
    
    // Start cleanup cron
    startCleanupCron();
    console.log("[INIT] Cleanup cron started");
    
    // Recovery: Try to re-enqueue jobs stuck in QUEUED status
    try {
      if (!databaseReady) {
        console.log("[RECOVERY] Skipping queue recovery because the database is unavailable.");
      } else if (!redisReady) {
        console.log("[RECOVERY] Skipping queue recovery because Redis is not ready.");
      } else {
        console.log("[RECOVERY] Checking for jobs stuck in QUEUED status...");
        const queuedJobs = await prisma.labelJob.findMany({
          where: { status: "QUEUED" },
          take: 50,
        });

        if (queuedJobs.length > 0) {
          console.log(`[RECOVERY] Found ${queuedJobs.length} jobs in QUEUED status, attempting to re-enqueue...`);
          // Dynamic import to avoid circular dependency
          const { getQueue } = await import("./lib/queue.js");
          const { ensureRedisConnection } = await import("./queue/redis.js");

          for (const dbJob of queuedJobs) {
            try {
              await ensureRedisConnection();
              const queue = getQueue();
              const existingBullJob = await queue.getJob(dbJob.id);
              if (!existingBullJob) {
                // Safe fallback: without persisted render settings (e.g., printMode),
                // automatic re-enqueue can silently generate a wrong template.
                await prisma.labelJob.update({
                  where: { id: dbJob.id },
                  data: {
                    status: "FAILED",
                    error: "Recovery aborted: original queue payload expired and render mode metadata is unavailable",
                  },
                }).catch(() => {});
                await releaseQueuedLabels(dbJob.userId, dbJob.unitCount || dbJob.recordCount).catch(() => {});
                console.warn(`[RECOVERY] Marked ${dbJob.id} as FAILED because queue payload was missing`);
              }
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              console.warn(`[RECOVERY] Failed to re-queue job ${dbJob.id}:`, message);
              await prisma.labelJob.update({
                where: { id: dbJob.id },
                data: { status: "FAILED", error: `Recovery enqueue failed: ${message}` },
              }).catch(() => {});
              await releaseQueuedLabels(dbJob.userId, dbJob.unitCount || dbJob.recordCount).catch(() => {});
            }
          }
        }
      }
    } catch (err) {
      console.warn("[RECOVERY] Failed to recover stuck jobs:", err instanceof Error ? err.message : String(err));
    }
    
    console.log("[INIT] Async initialization complete");
    logStartupTiming("fully_ready_ms", startupStartedAt);
  } catch (err) {
    console.error("[INIT] Fatal error during initialization:", err instanceof Error ? err.message : String(err));
  }
}

async function validateStartupPhase3() {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!process.env.DATABASE_URL) {
    warnings.push("DATABASE_URL environment variable is not set. API health routes will stay online, but database-backed routes will be unavailable until a PostgreSQL service is configured.");
  } else {
    const dbUrl = process.env.DATABASE_URL;
    const isValidPostgres = dbUrl.startsWith("postgresql://") || dbUrl.startsWith("postgres://");
    if (!isValidPostgres) {
      warnings.push("DATABASE_URL is invalid. Must start with postgresql:// or postgres://");
    }
  }

  const redisUrl = String(process.env.REDIS_URL ?? "").trim();
  const pythonServiceUrl = String(process.env.PYTHON_SERVICE_URL ?? "").trim();
  const dbHost = getUrlHost(process.env.DATABASE_URL);
  if (!redisUrl) {
    warnings.push("REDIS_URL environment variable is not set. Queue processing will be unavailable until Redis is configured.");
  } else if (isProduction && /(localhost|127\.0\.0\.1)/i.test(redisUrl)) {
    warnings.push("REDIS_URL points to localhost in production. Configure Railway Redis and set REDIS_URL.");
  } else if (/(^|[:@/])HOST([:@/]|$)|(^|[:@/])PASSWORD([:@/]|$)/i.test(redisUrl)) {
    warnings.push("REDIS_URL appears to be a placeholder value. Replace it with a real Redis URL.");
  } else if (isProduction && !redisUrl.startsWith("rediss://")) {
    // Warn but do not block startup — some Railway plans expose redis:// internally
    console.warn("⚠️  [Redis] REDIS_URL does not use TLS (rediss://). This is fine for internal Railway networking but ensure the URL is correct.");
  }
  if (isProduction) {
    if (dbHost && isLocalHost(dbHost)) {
      warnings.push("DATABASE_URL points to localhost in production. Configure external PostgreSQL and set DATABASE_URL.");
    }
    if (!pythonServiceUrl) {
      warnings.push("PYTHON_SERVICE_URL is not set. Tracking/complaint processing will stay unavailable until a Python service URL is configured.");
    } else if (/(localhost|127\.0\.0\.1)/i.test(pythonServiceUrl)) {
      warnings.push("PYTHON_SERVICE_URL points to localhost in production. Configure Railway internal Python service URL for tracking/complaint processing.");
    }
  }

  if (warnings.length > 0) {
    console.warn("⚠️  STARTUP WARNINGS:");
    warnings.forEach((warning) => console.warn(`   - ${warning}`));
  }

  if (errors.length > 0) {
    console.error("❌ STARTUP VALIDATION FAILED:");
    errors.forEach((err) => console.error(`   - ${err}`));
  }

  return { success: errors.length === 0, errors };
}

async function main() {
  await enforceS1StartupValidationOrExit();

  const validationResult = await validateStartupPhase3();
  if (!validationResult.success) {
    console.error("Startup validation failed:", validationResult.errors);
    process.exit(1);
  }

  await enforceRenderAndRedisPreflightOrExit();

  const port = Number(process.env.PORT || 3000);
  const server = app.listen(port, "0.0.0.0", () => {
    console.log("Server running");
  });

  server.on("error", (err: any) => {
    if (err?.code === "EADDRINUSE") {
      console.error(`API port ${port} is already in use. Stop the other running API process and try again.`);
      return;
    }
    console.error("API server error:", err);
    return;
  });

  // Run all initialization tasks asynchronously AFTER server starts
  try {
    console.log("[INIT] Starting async initialization tasks...");
    
    // Ensure storage directories exist
    await ensureStorageDirs();
    console.log("[INIT] Storage directories ready");

    const databaseReadiness = await initialDatabaseReady;
    const redisReadiness = await initializeRedisSafely();
    const databaseReady = databaseReadiness.ready;
    const redisReady = redisReadiness.ready;
    logStartupReadinessReport(
      createStartupReadinessReport("API", {
        databaseReady,
        redisReady,
        databaseIssue: databaseReadiness.issue,
        redisIssue: redisReadiness.issue,
      }),
    );

    await initializeUnsyncedArtifactsGauge(databaseReady).catch((err) => {
      console.warn("[INIT] Failed to initialize unsynced artifacts gauge:", err instanceof Error ? err.message : String(err));
      unsyncedArtifactsGauge.set(0);
    });

    if (databaseReady) {
      await logAllocatorSequenceDiagnostics("startup").catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        console.warn("[AllocatorDiag] Snapshot failed:", message);
      });

      // Seed default plans
      await ensureDefaultPlans().catch(err => console.error("[INIT] Failed to seed default plans:", err));
      console.log("[INIT] Default plans ready");
    } else {
      console.log("[INIT] Skipping default plan seed because the database is unavailable.");
    }
    
    // Start cleanup cron
    startCleanupCron();
    console.log("[INIT] Cleanup cron started");
    
    // Recovery: Try to re-enqueue jobs stuck in QUEUED status
    try {
      if (!databaseReady) {
        console.log("[RECOVERY] Skipping queue recovery because the database is unavailable.");
      } else if (!redisReady) {
        console.log("[RECOVERY] Skipping queue recovery because Redis is not ready.");
      } else {
        console.log("[RECOVERY] Checking for jobs stuck in QUEUED status...");
        const queuedJobs = await prisma.labelJob.findMany({
          where: { status: "QUEUED" },
          take: 50,
        });

        if (queuedJobs.length > 0) {
          console.log(`[RECOVERY] Found ${queuedJobs.length} jobs in QUEUED status, attempting to re-enqueue...`);
          // Dynamic import to avoid circular dependency
          const { getQueue } = await import("./lib/queue.js");
          const { ensureRedisConnection } = await import("./queue/redis.js");

          for (const dbJob of queuedJobs) {
            try {
              await ensureRedisConnection();
              const queue = getQueue();
              const existingBullJob = await queue.getJob(dbJob.id);
              if (!existingBullJob) {
                // Safe fallback: without persisted render settings (e.g., printMode),
                // automatic re-enqueue can silently generate a wrong template.
                await prisma.labelJob.update({
                  where: { id: dbJob.id },
                  data: {
                    status: "FAILED",
                    error: "Recovery aborted: original queue payload expired and render mode metadata is unavailable",
                  },
                }).catch(() => {});
                await releaseQueuedLabels(dbJob.userId, dbJob.unitCount || dbJob.recordCount).catch(() => {});
                console.warn(`[RECOVERY] Marked ${dbJob.id} as FAILED because queue payload was missing`);
              }
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              console.warn(`[RECOVERY] Failed to re-queue job ${dbJob.id}:`, message);
              await prisma.labelJob.update({
                where: { id: dbJob.id },
                data: { status: "FAILED", error: `Recovery enqueue failed: ${message}` },
              }).catch(() => {});
              await releaseQueuedLabels(dbJob.userId, dbJob.unitCount || dbJob.recordCount).catch(() => {});
            }
          }
        }
      }
    } catch (err) {
      console.warn("[RECOVERY] Failed to recover stuck jobs:", err instanceof Error ? err.message : String(err));
    }

    // Embedded BullMQ worker (when START_WORKER_IN_API=true — Api service embeds the queue processor)
    if (process.env.START_WORKER_IN_API === "true" && redisReady) {
      try {
        const { startWorker } = await import("./worker.js");
        startWorker();
        console.log("[INIT] Embedded BullMQ worker started (START_WORKER_IN_API=true)");
      } catch (err) {
        console.error("[INIT] Failed to start embedded worker:", err instanceof Error ? err.message : String(err));
      }
    } else if (process.env.START_WORKER_IN_API === "true" && !redisReady) {
      console.warn("[INIT] START_WORKER_IN_API=true but Redis is not ready — embedded worker not started");
    }

    console.log("[INIT] Async initialization complete");
  } catch (err) {
    console.error("[INIT] Fatal error during initialization:", err instanceof Error ? err.message : String(err));
  }
}

main().catch((err) => {
  console.error("Fatal error during startup:", err);
  process.exit(1);
});

