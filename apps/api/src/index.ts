import express from "express";
import cors from "cors";
import helmet from "helmet";
import fs from "fs";
import { createConnection } from "node:net";
import { env } from "./config.js";
import { ensureDatabaseConnection } from "./db.js";
import { prisma } from "./lib/prisma.js";
import { authRouter } from "./routes/auth.js";
import { meRouter } from "./routes/me.js";
import { handleLabelUpload, jobsRouter, labelUploadMiddleware } from "./routes/jobs.js";
import { trackingRouter } from "./routes/tracking.js";
import { shipmentsRouter } from "./routes/shipments.js";
import { adminRouter } from "./routes/admin.js";
import { subscriptionsRouter } from "./routes/subscriptions.js";
import { plansRouter, ensureDefaultPlans } from "./routes/plans.js";
import { ensureStorageDirs } from "./storage/paths.js";
import { startCleanupCron } from "./cron/cleanup.js";
import { requireAuth } from "./middleware/auth.js";
import { releaseQueuedLabels } from "./usage/limits.js";
import { UPLOAD_DIR } from "./utils/paths.js";
const BUILD_VERSION = process.env.RAILWAY_GIT_COMMIT_SHA ?? "local";
const isProduction = process.env.NODE_ENV === "production";

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
  console.warn(`Received: ${process.env.DATABASE_URL.substring(0, 50)}...`);
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
      warnings.push(`DATABASE_URL is invalid: ${dbUrl.substring(0, 50)}... Must start with postgresql:// or postgres://`);
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
// runMigrations() is now handled in package.json start script
// NOTE: Ensure database connection BUT DO NOT BLOCK startup
// This will initialize in the background while the server starts
async function initializeDatabaseSafely(): Promise<boolean> {
  if (!hasUsableDatabaseUrl()) {
    console.warn("[DB] Skipping initial database connection because DATABASE_URL is missing or invalid.");
    return false;
  }

  try {
    const dbUrl = new URL(String(process.env.DATABASE_URL));
    const dbHost = dbUrl.hostname;
    const dbPort = Number(dbUrl.port || 5432);

    if (!isProduction && isLocalHost(dbHost)) {
      const isReachable = await isTcpEndpointReachable(dbHost, dbPort);
      if (!isReachable) {
        console.warn(`[DB] Skipping initial database connection because ${dbHost}:${dbPort} is not reachable in local development.`);
        return false;
      }
    }
  } catch {
    console.warn("[DB] Skipping initial database connection because DATABASE_URL could not be parsed.");
    return false;
  }

  try {
    return await ensureDatabaseConnection();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[DB] Connection error: ${message}`);
    return false;
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
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type"],
    exposedHeaders: ["Content-Disposition"],
  }),
);
app.use(express.json({ limit: "2mb" }));

app.use((req, _res, next) => {
  console.log(`[REQ] ${req.method} ${req.originalUrl}`);
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
    const message = err instanceof Error ? err.message : String(err);
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
    const message = err instanceof Error ? err.message : String(err);
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
    const message = err instanceof Error ? err.message : String(err);
    return res.status(503).json({ status: "error", service: "worker", message });
  }
});

const router = express.Router();

const ensureApiDatabaseConnection: express.RequestHandler = async (_req, res, next) => {
  try {
    await prisma.$connect();
    return next();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Database connection failed";
    return res.status(503).json({ success: false, message });
  }
};

// API routes (these come first)
router.get("/", (_req, res) => res.json({ success: true, message: "LabelGen API is running" }));
router.get("/version", (_req, res) => res.json({ success: true, version: BUILD_VERSION }));
router.get("/health", (_req, res) => {
  res.json({ status: "ok" });
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

  const rows = [
    [
      "Acme Store",
      "03001234567",
      "1 Mall Road",
      "ops@acme.example",
      "Lahore",
      "Ali Raza",
      "ali@example.com",
      "03111222333",
      "House 10 Street 5",
      "Lahore",
      "20000",
      "2026-03-25",
      "Books",
      "1.0",
      "VPL",
      "1",
      "VPL260300001",
    ],
    [
      "Acme Store",
      "03001234567",
      "1 Mall Road",
      "ops@acme.example",
      "Lahore",
      "Sara Khan",
      "sara@example.com",
      "03223334444",
      "Flat 4 Model Town",
      "Lahore",
      "9500",
      "2026-03-25",
      "Clothes",
      "0.5",
      "UMS",
      "1",
      "VPL260300002",
    ],
    [
      "Acme Store",
      "03001234567",
      "1 Mall Road",
      "ops@acme.example",
      "Lahore",
      "Usman",
      "usman@example.com",
      "03335556666",
      "Block B Street 9",
      "Islamabad",
      "12000",
      "2026-03-25",
      "Shoes",
      "0.8",
      "COD",
      "1",
      "VPL260300003",
    ],
    [
      "Acme Store",
      "03001234567",
      "1 Mall Road",
      "ops@acme.example",
      "Lahore",
      "Ayesha",
      "ayesha@example.com",
      "03009998888",
      "House 5 Gulshan",
      "Multan",
      "5000",
      "2026-03-25",
      "Documents",
      "0.2",
      "RL",
      "1",
      "VPL260300004",
    ],
    [
      "Acme Store",
      "03001234567",
      "1 Mall Road",
      "ops@acme.example",
      "Lahore",
      "Hamza",
      "hamza@example.com",
      "03007776666",
      "Shop 12 Saddar",
      "Peshawar",
      "18000",
      "2026-03-25",
      "Electronics",
      "2.0",
      "PAR",
      "2",
      "VPL260300005",
    ],
    [
      "Acme Store",
      "03009998888",
      "1 Mall Road",
      "ops@acme.example",
      "Islamabad",
      "Bilal",
      "bilal@example.com",
      "03115554444",
      "Street 12 Sector F",
      "Islamabad",
      "7500",
      "2026-03-25",
      "Gift Pack",
      "1.2",
      "VPP",
      "1",
      "VPL260300006",
    ],
  ];

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
router.use("/admin", ensureApiDatabaseConnection, adminRouter);
router.use("/subscriptions", ensureApiDatabaseConnection, subscriptionsRouter);
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
  console.error("GLOBAL ERROR:", err);
  const message = err instanceof Error ? err.message : "An unknown server error occurred.";
  if (!res.headersSent) {
    res.status(500).json({ success: false, message });
  }
});

// CRITICAL: Start server IMMEDIATELY without any blocking awaits
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
(async () => {
  try {
    console.log("[INIT] Starting async initialization tasks...");
    
    // Ensure storage directories exist
    await ensureStorageDirs();
    console.log("[INIT] Storage directories ready");

    const databaseReady = await initialDatabaseReady;

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
      } else {
      const redisUrl = String(process.env.REDIS_URL ?? "").trim();
      const hasUsableRedis = !!redisUrl && !/(^|[:@/])HOST([:@/]|$)|(^|[:@/])PASSWORD([:@/]|$)/i.test(redisUrl);
      if (!hasUsableRedis) {
        console.log("[RECOVERY] Skipping queue recovery because REDIS_URL is missing or placeholder.");
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
                // Job not in queue, re-add it
                await queue.add(
                  "generate-pdf",
                  {
                    jobId: dbJob.id,
                    generateLabels: true,
                    generateMoneyOrder: dbJob.includeMoneyOrders,
                    autoGenerateTracking: false,
                    barcodeMode: "manual",
                    printMode: "labels",
                  },
                  { jobId: dbJob.id },
                );
                console.log(`[RECOVERY] Re-queued job ${dbJob.id}`);
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
      }
    } catch (err) {
      console.warn("[RECOVERY] Failed to recover stuck jobs:", err instanceof Error ? err.message : String(err));
    }
    
    console.log("[INIT] Async initialization complete");
  } catch (err) {
    console.error("[INIT] Fatal error during initialization:", err instanceof Error ? err.message : String(err));
  }
})();

