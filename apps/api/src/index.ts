import express from "express";
import cors from "cors";
import helmet from "helmet";
import { env } from "./config.js";
import { ensureDatabaseConnection } from "./db.js";
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

console.log("🚀 Starting LabelGen API server FIXED...");
console.log(`[STARTUP] NODE_ENV=${process.env.NODE_ENV}`);
console.log(`[STARTUP] DATABASE_URL is set: ${process.env.DATABASE_URL ? "yes" : "no"}`);
if (process.env.DATABASE_URL) {
  const sanitized = process.env.DATABASE_URL.replace(/([^:])([a-zA-Z0-9]+)@/, "$1***@");
  console.log(`[STARTUP] DATABASE_URL (sanitized): ${sanitized}`);
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
    if (process.env.NODE_ENV === "development") {
      console.warn("⚠️  DATABASE_URL not set, using local PostgreSQL default for development.");
      process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/labelgen?schema=public";
    } else {
      errors.push("DATABASE_URL environment variable is not set.");
    }
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

  if (errors.length > 0) {
    console.error("❌ STARTUP VALIDATION FAILED:");
    errors.forEach((err) => console.error(`   - ${err}`));
    console.error("\nFIX FOR RAILWAY:");
    console.error("   1. Go to your Railway project");
    console.error("   2. Link a PostgreSQL database (or set DATABASE_URL manually)");
    console.error("   3. Set environment variables:");
    console.error("      DATABASE_URL=<postgresql connection string>");
    console.error("      JWT_SECRET=<at least 16 random characters>");
    process.exit(1);
  }
}

normalizeDatabaseUrl();
validateEnvironment();
// runMigrations() is now handled in package.json start script
await ensureDatabaseConnection();

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
app.use(express.urlencoded({ extended: true }));

app.get("/", (_req, res) => {
  res.type("html").status(200).send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>LabelGen API</title>
    <style>
      :root {
        color-scheme: light;
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
        background: linear-gradient(135deg, #f8fbff 0%, #e9f2ff 100%);
        color: #0f172a;
      }
      .card {
        width: min(680px, 92vw);
        padding: 2rem;
        border-radius: 14px;
        background: #ffffff;
        box-shadow: 0 16px 36px rgba(15, 23, 42, 0.12);
        text-align: center;
      }
      h1 {
        margin: 0 0 0.75rem;
        font-size: clamp(1.6rem, 2.2vw, 2rem);
      }
      p {
        margin: 0;
        font-size: 1.05rem;
        color: #334155;
      }
    </style>
  </head>
  <body>
    <main class="card">
      <h1>LabelGen API</h1>
      <p>API is running successfully</p>
    </main>
  </body>
</html>`);
});
app.get("/api", (_req, res) => res.json({ success: true, message: "LabelGen API is running" }));
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
app.get("/api/track/:trackingNumber", requireAuth, (req, res, next) => {
  req.url = `/track/${req.params.trackingNumber}`;
  return (trackingRouter as any)(req, res, next);
});
app.use("/api/shipments", shipmentsRouter);
app.use("/api/admin", adminRouter);
app.use("/api/subscriptions", subscriptionsRouter);
app.use("/api/plans", plansRouter);

app.use("*", (_req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
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
startCleanupCron();
const PORT = Number(process.env.PORT ?? env.PORT ?? 3000);
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
