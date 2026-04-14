import express from "express";
import cors from "cors";
import helmet from "helmet";
import { env } from "./config";
import { prisma } from "./prisma";
import { authRouter } from "./routes/auth";
import { meRouter } from "./routes/me";
import { handleLabelUpload, jobsRouter, labelUploadMiddleware } from "./routes/jobs";
import { trackingRouter } from "./routes/tracking";
import { shipmentsRouter } from "./routes/shipments";
import { adminRouter } from "./routes/admin";
import { subscriptionsRouter } from "./routes/subscriptions";
import { plansRouter, ensureDefaultPlans } from "./routes/plans";
import { ensureStorageDirs } from "./storage/paths"
import { startCleanupCron } from "./cron/cleanup";
import { requireAuth } from "./middleware/auth";

console.log("🚀 Starting LabelGen API server...");

// Validate critical environment variables at startup
function validateEnvironment() {
  const errors: string[] = [];
  
  // DATABASE_URL validation
  if (!process.env.DATABASE_URL) {
    errors.push("DATABASE_URL environment variable is not set");
  } else {
    const dbUrl = process.env.DATABASE_URL;
    const isValidPostgres = dbUrl.startsWith("postgresql://") || dbUrl.startsWith("postgres://");
    const isValidSqlite = dbUrl.startsWith("file:");
    if (!isValidPostgres && !isValidSqlite) {
      errors.push(`DATABASE_URL is invalid: ${dbUrl.substring(0, 50)}... Must start with postgresql://, postgres://, or file:`);
    }
  }

  // JWT_SECRET validation
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

async function verifyDatabaseConnection() {
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`; 
    console.log("Database connection verified.");
  } catch (err) {
    console.error("❌ DATABASE CONNECTION FAILED:", err instanceof Error ? err.message : err);
    console.error("Continuing without database connection for debugging.");
    // process.exit(1);
  }
}

validateEnvironment();
await verifyDatabaseConnection();

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
const server = app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`API listening on http://localhost:${env.PORT}`);
});

server.on("error", (err: any) => {
  if (err?.code === "EADDRINUSE") {
    console.error(`API port ${env.PORT} is already in use. Stop the other running API process and try again.`);
    process.exit(1);
  }
  console.error("API server error:", err);
  process.exit(1);
});
