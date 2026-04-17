import express from "express";
import cors from "cors";
import helmet from "helmet";
import fs from "fs";
import path from "path";
import { dirname } from "path";
import { fileURLToPath } from "url";
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BUILD_VERSION = process.env.RAILWAY_GIT_COMMIT_SHA ?? "local";

const uploadDir = path.join(process.cwd(), "storage/uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log("Uploads directory created:", uploadDir);
}

// CRITICAL: Validate DATABASE_URL before any Prisma operations
console.log("DATABASE_URL exists:", !!process.env.DATABASE_URL);

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is missing");
  console.error("For Railway: Link a PostgreSQL database service. It will auto-inject DATABASE_URL.");
  console.error("For local dev: Ensure .env file exists with DATABASE_URL set.");
  process.exit(1);
}

if (!process.env.DATABASE_URL.startsWith("postgresql://") && !process.env.DATABASE_URL.startsWith("postgres://")) {
  console.error("Invalid DATABASE_URL format");
  console.error(`Received: ${process.env.DATABASE_URL.substring(0, 50)}...`);
  console.error("Must start with postgresql:// or postgres://");
  process.exit(1);
}

console.log("🚀 Starting LabelGen API server FIXED...");
console.log(`[STARTUP] NODE_ENV=${process.env.NODE_ENV}`);
console.log(`[STARTUP] DATABASE_URL is set: ${process.env.DATABASE_URL ? "yes" : "no"}`);
if (process.env.DATABASE_URL) {
  const sanitized = process.env.DATABASE_URL.replace(/([^:])([a-zA-Z0-9]+)@/, "$1***@");
  console.log(`[STARTUP] DATABASE_URL (sanitized): ${sanitized}`);
  
  // Extract database name from URL
  try {
    const url = new URL(process.env.DATABASE_URL);
    const pathname = url.pathname;
    const dbName = pathname.split('?')[0].replace(/^\//, '') || 'unknown';
    console.log(`[STARTUP] Database name: ${dbName}`);
    console.log(`[STARTUP] Database host: ${url.hostname}`);
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

function validateEnvironment() {
  const errors: string[] = [];

  if (!process.env.DATABASE_URL) {
    errors.push("DATABASE_URL environment variable is not set. For Railway: link a PostgreSQL service. For local dev: ensure .env file has DATABASE_URL.");
  } else {
    const dbUrl = process.env.DATABASE_URL;
    const isValidPostgres = dbUrl.startsWith("postgresql://") || dbUrl.startsWith("postgres://");
    if (!isValidPostgres) {
      errors.push(`DATABASE_URL is invalid: ${dbUrl.substring(0, 50)}... Must start with postgresql:// or postgres://`);
    }
  }

  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
    console.warn("⚠️  JWT_SECRET not set or too short, using default for development");
    process.env.JWT_SECRET = "development-jwt-secret-at-least-32-chars-long";
  }

  const redisUrl = String(process.env.REDIS_URL ?? "").trim();
  const pythonServiceUrl = String(process.env.PYTHON_SERVICE_URL ?? "").trim();
  const queueEnabled = process.env.START_WORKER_IN_API !== "false";
  const isProduction = process.env.NODE_ENV === "production";
  if (queueEnabled) {
    if (!redisUrl) {
      errors.push("REDIS_URL environment variable is not set. Queue processing requires a Redis service.");
    } else if (isProduction && /(localhost|127\.0\.0\.1)/i.test(redisUrl)) {
      errors.push("REDIS_URL points to localhost in production. Configure Railway Redis and set REDIS_URL.");
    }
  }
  if (isProduction) {
    if (!pythonServiceUrl) {
      errors.push("PYTHON_SERVICE_URL is not set. Tracking/complaint processing requires a reachable Python service.");
    } else if (/(localhost|127\.0\.0\.1)/i.test(pythonServiceUrl)) {
      errors.push("PYTHON_SERVICE_URL points to localhost in production. Configure Railway internal Python service URL.");
    }
  }

  if (errors.length > 0) {
    console.error("❌ STARTUP VALIDATION FAILED:");
    errors.forEach((err) => console.error(`   - ${err}`));
    console.error("\nFIX FOR RAILWAY:");
    console.error("   1. Go to your Railway project");
    console.error("   2. Link a PostgreSQL database");
    console.error("   3. The DATABASE_URL will be automatically injected");
    console.error("   4. Deploy or restart the service");
    console.error("\nFIX FOR LOCAL DEVELOPMENT:");
    console.error("   1. Ensure .env file exists with DATABASE_URL set");
    console.error("   2. Run: npm run dev (loads .env automatically)");
    process.exit(1);
  }
}

normalizeDatabaseUrl();
validateEnvironment();
// runMigrations() is now handled in package.json start script
await ensureDatabaseConnection();

async function startWorker() {
  try {
    await import("./worker.js");
    console.log("[STARTUP] Embedded BullMQ worker started in API process");
  } catch (error) {
    console.error("[STARTUP] Failed to start embedded worker:", error);
    process.exit(1);
  }
}

await startWorker();

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
    allowedHeaders: ["Content-Type", "Authorization"],
    exposedHeaders: ["Content-Disposition"],
  }),
);
app.use(express.json({ limit: "2mb" }));

app.use("/api", async (_req, res, next) => {
  try {
    await prisma.$connect();
    return next();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Database connection failed";
    return res.status(503).json({ success: false, message });
  }
});

// API routes (these come first)
app.get("/api", (_req, res) => res.json({ success: true, message: "LabelGen API is running" }));
app.get("/api/version", (_req, res) => res.json({ success: true, version: BUILD_VERSION }));
app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.get("/api/template.csv", (_req, res) => {
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

  const esc = (v: string) => (/[\",\n]/.test(v) ? `"${v.replaceAll("\"", "\"\"")}"` : v);
  const csv = [header, ...rows.map((r) => r.map((c) => esc(String(c))).join(","))].join("\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=template.csv");
  return res.status(200).send(csv);
});

app.use("/api/auth", authRouter);
app.use("/api/me", meRouter);
app.use("/api/jobs", jobsRouter);
// Compatibility alias for older clients
app.post("/api/upload", requireAuth, labelUploadMiddleware, handleLabelUpload);
app.use("/api/tracking", trackingRouter);
app.get("/api/track", (_req, res) => {
  res.status(400).json({
    success: false,
    message: "Tracking number is required",
    usage: "/api/track/:trackingNumber",
  });
});
app.get("/api/track/:trackingNumber", requireAuth, (req, res, next) => {
  req.url = `/track/${req.params.trackingNumber}`;
  return (trackingRouter as any)(req, res, next);
});
app.get("/api/print", (_req, res) => {
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
app.get("/api/label", (_req, res) => {
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
app.use("/api/shipments", shipmentsRouter);
app.use("/api/admin", adminRouter);
app.use("/api/subscriptions", subscriptionsRouter);
app.use("/api/plans", plansRouter);

app.use("/api/*", (_req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

// Serve static files from web build directory
const webDistPath = path.resolve(__dirname, "../../web/dist");
app.use(express.static(webDistPath));

// Fallback to index.html for client-side routing
app.get(/^\/(?!api(?:\/|$)).*/, (req, res) => {
  const indexPath = path.resolve(webDistPath, "index.html");
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).json({ error: "Frontend not found" });
  }
});

// Global Error Handler
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("GLOBAL ERROR:", err);
  const message = err instanceof Error ? err.message : "An unknown server error occurred.";
  if (!res.headersSent) {
    res.status(500).json({ success: false, message });
  }
});

await ensureStorageDirs();
await ensureDefaultPlans().catch(err => console.error("Failed to seed default plans:", err));

// Recovery: Try to re-enqueue jobs stuck in QUEUED status on startup
(async () => {
  try {
    console.log("[RECOVERY] Checking for jobs stuck in QUEUED status...");
    const queuedJobs = await prisma.labelJob.findMany({
      where: { status: "QUEUED" },
      take: 50,
    });
    
    if (queuedJobs.length > 0) {
      console.log(`[RECOVERY] Found ${queuedJobs.length} jobs in QUEUED status, attempting to re-enqueue...`);
      // Dynamic import to avoid circular dependency
      const { labelQueue } = await import("./queue/queue.js");
      const { ensureRedisConnection } = await import("./queue/redis.js");
      
      for (const dbJob of queuedJobs) {
        try {
          await ensureRedisConnection();
          const existingBullJob = await labelQueue.getJob(dbJob.id);
          if (!existingBullJob) {
            // Job not in queue, re-add it
            await labelQueue.add(
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
          });
          await releaseQueuedLabels(dbJob.userId, dbJob.unitCount || dbJob.recordCount).catch(() => {});
        }
      }
    }
  } catch (err) {
    console.warn("[RECOVERY] Failed to recover stuck jobs:", err instanceof Error ? err.message : String(err));
  }
})();

startCleanupCron();
const PORT = Number(process.env.PORT || 3000);
console.log(`PORT: ${PORT}`);
const server = app.listen(PORT, '0.0.0.0', () => {
  // eslint-disable-next-line no-console
  console.log(`API listening on http://0.0.0.0:${PORT}`);
});

server.on("error", (err: any) => {
  if (err?.code === "EADDRINUSE") {
    console.error(`API port ${PORT} is already in use. Stop the other running API process and try again.`);
    process.exit(1);
  }
  console.error("API server error:", err);
  process.exit(1);
});
