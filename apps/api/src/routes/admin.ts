import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { z } from "zod";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { hashPassword } from "../auth/password.js";
import { monthKeyUTC } from "../usage/month.js";
import { env } from "../config.js";
import { labelQueue, trackingQueue } from "../queue/queue.js";
import { refundUnitsByAmount } from "../usage/unitConsumption.js";
import { buildComplaintExportCsv, listComplaintAlerts, listComplaintRecords } from "../services/complaint.service.js";
import { listComplaintAuditLogs, logComplaintAudit } from "../services/complaint-audit.service.js";
import { runComplaintSyncJob, startComplaintSyncJob } from "../jobs/complaint-sync.job.js";
import { runComplaintBackupJob, startComplaintBackupJob } from "../jobs/complaint-backup.job.js";
import { startComplaintWatcherJob } from "../jobs/complaint-watch.job.js";
import { startComplaintSlaJob } from "../jobs/complaint-sla.job.js";
import { runComplaintRetryJob, startComplaintRetryJob } from "../jobs/complaint-retry.job.js";
import { getComplaintCircuitState } from "../services/complaint-circuit.service.js";
import { processComplaintQueueById } from "../processors/complaint.processor.js";
import { normalizeComplaintQueueStatus } from "../services/complaint-queue.service.js";
import {
  adminListManualPayments,
  adminApproveManualPayment,
  adminRejectManualPayment,
} from "./manualPayments.js";
import { resolveStoredPath, storageRoot, toStoredPath } from "../storage/paths.js";
import { getOrCreateBillingSettings, syncConfiguredPlanPrices } from "../services/billing-settings.service.js";
import { getUploadExemptFileNames, saveUploadExemptFileNames } from "../services/upload-file-exemptions.service.js";
import { ensurePlanManagementColumns, getPlanExtrasByIds } from "./plans.js";
import { buildPdfAttachmentHeader, PRINT_MARKETING_LINE } from "../lib/printBranding.js";
import { redis as redisClient, redisEnabled } from "../lib/redis.js";

export const adminRouter = Router();

function buildAbsoluteApiUrl(req: any, relativePath: string) {
  const xfProto = String(req.header("x-forwarded-proto") ?? "").split(",")[0].trim();
  const proto = xfProto || req.protocol || "https";
  const host = String(req.header("x-forwarded-host") ?? req.get("host") ?? "").trim();
  if (!host) return relativePath;
  return `${proto}://${host}${relativePath}`;
}

const billingQrDir = path.join(storageRoot(), "billing-wallet-qr");
if (!fs.existsSync(billingQrDir)) {
  fs.mkdirSync(billingQrDir, { recursive: true });
}

const billingQrUpload = multer({
  dest: billingQrDir,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});

startComplaintSyncJob();
startComplaintBackupJob();
startComplaintWatcherJob();
startComplaintSlaJob();
startComplaintRetryJob();

adminRouter.post("/bootstrap", async (req, res) => {
  const secret = req.header("x-bootstrap-secret");
  if (!env.ADMIN_BOOTSTRAP_SECRET) return res.status(500).json({ error: "Bootstrap not configured" });
  if (!secret || secret !== env.ADMIN_BOOTSTRAP_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const body = z.object({ email: z.string().email() }).parse(req.body);
  const admins = await prisma.user.count({ where: { role: "ADMIN" } });
  if (admins > 0) return res.status(409).json({ error: "Admin already exists" });

  const user = await prisma.user.update({
    where: { email: body.email.toLowerCase() },
    data: { role: "ADMIN" },
    select: { id: true, email: true, role: true },
  });
  res.json({ user });
});

adminRouter.use(requireAuth, requireAdmin);

function startOfUtcDay(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function startOfUtcMonth(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function toPositiveInt(value: unknown, fallback: number, max = 200) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(1, Math.trunc(parsed)));
}

function toDateOrNull(value: unknown, endOfDay = false) {
  if (typeof value !== "string" || !value.trim()) return null;
  const normalized = value.trim();
  const date = new Date(endOfDay ? `${normalized}T23:59:59.999Z` : `${normalized}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeSortOrder(value: unknown): "asc" | "desc" {
  return String(value ?? "").toLowerCase() === "asc" ? "asc" : "desc";
}

function isResolvedComplaintState(state: string) {
  return ["RESOLVED", "CLOSED"].includes(state);
}

function isPendingComplaintState(state: string) {
  return ["FILED", "ACTIVE", "OPEN", "IN_PROCESS", "IN PROCESS", "PROCESSING", "PENDING"].includes(state);
}

async function getRevenueTotals() {
  const todayStart = startOfUtcDay();
  const monthStart = startOfUtcMonth();
  const successStatuses = ["PAID", "SUCCESS", "APPROVED", "COMPLETED", "VERIFIED"];
  const pendingStatuses = ["PENDING", "OPEN"];

  const [gatewayAll, gatewayToday, gatewayMonth, manualApprovedAll, manualApprovedToday, manualApprovedMonth, gatewayPending, manualPending] = await Promise.all([
    prisma.payment.aggregate({
      where: { status: { in: successStatuses } },
      _sum: { amountCents: true },
    }),
    prisma.payment.aggregate({
      where: { status: { in: successStatuses }, createdAt: { gte: todayStart } },
      _sum: { amountCents: true },
    }),
    prisma.payment.aggregate({
      where: { status: { in: successStatuses }, createdAt: { gte: monthStart } },
      _sum: { amountCents: true },
    }),
    prisma.manualPaymentRequest.aggregate({
      where: { status: "APPROVED" },
      _sum: { amountCents: true },
    }),
    prisma.manualPaymentRequest.aggregate({
      where: { status: "APPROVED", createdAt: { gte: todayStart } },
      _sum: { amountCents: true },
    }),
    prisma.manualPaymentRequest.aggregate({
      where: { status: "APPROVED", createdAt: { gte: monthStart } },
      _sum: { amountCents: true },
    }),
    prisma.payment.aggregate({
      where: { status: { in: pendingStatuses } },
      _sum: { amountCents: true },
    }),
    prisma.manualPaymentRequest.aggregate({
      where: { status: "PENDING" },
      _sum: { amountCents: true },
    }),
  ]);

  const totalCents = (gatewayAll._sum.amountCents ?? 0) + (manualApprovedAll._sum.amountCents ?? 0);
  const todayCents = (gatewayToday._sum.amountCents ?? 0) + (manualApprovedToday._sum.amountCents ?? 0);
  const monthCents = (gatewayMonth._sum.amountCents ?? 0) + (manualApprovedMonth._sum.amountCents ?? 0);
  const pendingCents = (gatewayPending._sum.amountCents ?? 0) + (manualPending._sum.amountCents ?? 0);

  return {
    totalCents,
    todayCents,
    monthCents,
    pendingCents,
  };
}

async function getUnitsTotals() {
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS usage_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      action_type TEXT NOT NULL,
      units_used INTEGER NOT NULL DEFAULT 1,
      request_key TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'CONSUMED',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      refunded_at TEXT
    )
  `;

  const [totalRows, todayRows, monthRows] = await Promise.all([
    prisma.$queryRaw<Array<{ units: number }>>`
      SELECT COALESCE(SUM(units_used), 0)::int AS units
      FROM usage_logs
      WHERE status = 'CONSUMED'
    `,
    prisma.$queryRaw<Array<{ units: number }>>`
      SELECT COALESCE(SUM(units_used), 0)::int AS units
      FROM usage_logs
      WHERE status = 'CONSUMED'
        AND DATE(created_at::timestamp) = DATE(NOW() AT TIME ZONE 'UTC')
    `,
    prisma.$queryRaw<Array<{ units: number }>>`
      SELECT COALESCE(SUM(units_used), 0)::int AS units
      FROM usage_logs
      WHERE status = 'CONSUMED'
        AND TO_CHAR(created_at::timestamp AT TIME ZONE 'UTC', 'YYYY-MM') = TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM')
    `,
  ]);

  return {
    totalUnits: totalRows[0]?.units ?? 0,
    todayUnits: todayRows[0]?.units ?? 0,
    monthUnits: monthRows[0]?.units ?? 0,
  };
}

async function getHealthSnapshot() {
  type HealthStatus = "ok" | "warning" | "error" | "unknown" | "disabled" | "offline";
  type ServiceHealth = { status: HealthStatus; message: string };
  type QueueHealth = ServiceHealth & { counts: { waiting: number; active: number; completed: number; failed: number; delayed: number } };

  const health: {
    api: ServiceHealth;
    db: ServiceHealth;
    redis: ServiceHealth;
    worker: ServiceHealth;
    queue: QueueHealth;
  } = {
    api: { status: "ok", message: "API router healthy" },
    db: { status: "ok", message: "Database reachable" },
    redis: { status: "unknown", message: "Redis status unavailable" },
    worker: { status: "unknown", message: "Worker status unavailable" },
    queue: { status: "unknown", message: "Queue status unavailable", counts: { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 } },
  };

  let dbStatus: ServiceHealth = { ...health.db };
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    dbStatus = { status: "error", message: error instanceof Error ? error.message : String(error ?? "DB check failed") };
  }

  let redisStatus: ServiceHealth = { ...health.redis };
  let workerStatus: ServiceHealth = { ...health.worker };
  let queueStatus: QueueHealth = { ...health.queue };
  if (!redisEnabled) {
    redisStatus = { status: "disabled", message: "REDIS_URL not configured" };
    workerStatus = { status: "unknown", message: "Redis required for worker heartbeat" };
    queueStatus = { ...queueStatus, status: "unknown", message: "Redis required for queue counts" };
  } else {
    try {
      const pong = await redisClient.ping();
      redisStatus = { status: pong === "PONG" ? "ok" : "error", message: `Ping: ${pong}` };
      const workerLock = await redisClient.get("worker:singleton:label-generator");
      workerStatus = workerLock
        ? { status: "ok", message: "Worker singleton lock held" }
        : { status: "offline", message: "Worker singleton lock not held" };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? "Redis check failed");
      redisStatus = { status: "error", message };
      workerStatus = { status: "unknown", message: "Unable to validate worker heartbeat" };
    }

    try {
      const counts = await labelQueue.getJobCounts("waiting", "active", "completed", "failed", "delayed");
      const waiting = Number(counts.waiting ?? 0);
      const active = Number(counts.active ?? 0);
      const failed = Number(counts.failed ?? 0);
      queueStatus = {
        status: failed > 0 ? "warning" : "ok",
        message: failed > 0 ? "Queue has failed jobs" : "Queue healthy",
        counts: {
          waiting,
          active,
          completed: Number(counts.completed ?? 0),
          failed,
          delayed: Number(counts.delayed ?? 0),
        },
      };
    } catch (error) {
      queueStatus = {
        ...queueStatus,
        status: "error",
        message: error instanceof Error ? error.message : String(error ?? "Queue check failed"),
      };
    }
  }

  return {
    api: health.api,
    db: dbStatus,
    redis: redisStatus,
    worker: workerStatus,
    queue: queueStatus,
    checkedAt: new Date().toISOString(),
  };
}

adminRouter.get("/dashboard/summary", async (_req, res) => {
  const todayStart = startOfUtcDay();
  const monthStart = startOfUtcMonth();

  const [
    totalUsers,
    activeUsers,
    newUsersToday,
    paidUsers,
    freeUsers,
    labelsTotalAgg,
    labelsTodayAgg,
    labelsMonthAgg,
    jobsCompleted,
    jobsProcessing,
    jobsWaiting,
    jobsFailed,
    complaintsRows,
    moneyOrderGenerated,
    bulkTrackingCompleted,
    bulkTrackingProcessing,
    health,
    revenue,
    units,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { suspended: false } }),
    prisma.user.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.user.count({
      where: {
        subscriptions: {
          some: {
            status: "ACTIVE",
            plan: { priceCents: { gt: 0 } },
          },
        },
      },
    }),
    prisma.user.count({
      where: {
        OR: [
          { subscriptions: { none: {} } },
          {
            subscriptions: {
              some: {
                status: "ACTIVE",
                plan: { priceCents: 0 },
              },
            },
          },
        ],
      },
    }),
    prisma.labelJob.aggregate({ where: { status: "COMPLETED" }, _sum: { recordCount: true } }),
    prisma.labelJob.aggregate({ where: { status: "COMPLETED", createdAt: { gte: todayStart } }, _sum: { recordCount: true } }),
    prisma.labelJob.aggregate({ where: { status: "COMPLETED", createdAt: { gte: monthStart } }, _sum: { recordCount: true } }),
    prisma.labelJob.count({ where: { status: "COMPLETED" } }),
    prisma.labelJob.count({ where: { status: "PROCESSING" } }),
    prisma.labelJob.count({ where: { status: "QUEUED" } }),
    prisma.labelJob.count({ where: { status: "FAILED" } }),
    prisma.shipment.findMany({ select: { complaintStatus: true } }),
    prisma.labelJob.count({ where: { status: "COMPLETED", includeMoneyOrders: true, moneyOrderPdfPath: { not: null } } }),
    prisma.trackingJob.count({ where: { kind: "BULK_TRACK", status: "COMPLETED" } }),
    prisma.trackingJob.count({ where: { kind: "BULK_TRACK", status: { in: ["QUEUED", "PROCESSING"] } } }),
    getHealthSnapshot(),
    getRevenueTotals(),
    getUnitsTotals(),
  ]);

  const complaintFiledCount = complaintsRows.filter((row) => String(row.complaintStatus ?? "").trim().length > 0 && String(row.complaintStatus ?? "").toUpperCase() !== "NOT_REQUIRED").length;
  const complaintPendingCount = complaintsRows.filter((row) => isPendingComplaintState(String(row.complaintStatus ?? "").trim().toUpperCase())).length;
  const complaintResolvedCount = complaintsRows.filter((row) => isResolvedComplaintState(String(row.complaintStatus ?? "").trim().toUpperCase())).length;

  return res.json({
    users: {
      totalUsers,
      activeUsers,
      newUsersToday,
      paidUsers,
      freeUsers,
    },
    labels: {
      totalLabelsGenerated: labelsTotalAgg._sum.recordCount ?? 0,
      labelsGeneratedToday: labelsTodayAgg._sum.recordCount ?? 0,
      labelsGeneratedThisMonth: labelsMonthAgg._sum.recordCount ?? 0,
    },
    jobs: {
      jobsCompleted,
      jobsProcessing,
      jobsWaiting,
      jobsFailed,
    },
    revenue,
    usage: {
      unitsConsumedToday: units.todayUnits,
      unitsConsumedThisMonth: units.monthUnits,
      totalUnitsConsumed: units.totalUnits,
    },
    complaints: {
      complaintFiledCount,
      complaintPendingCount,
      complaintResolvedCount,
    },
    moneyOrders: {
      moneyOrderGeneratedCount: moneyOrderGenerated,
    },
    bulkTracking: {
      jobsCompleted: bulkTrackingCompleted,
      jobsProcessing: bulkTrackingProcessing,
    },
    health,
    updatedAt: new Date().toISOString(),
  });
});

adminRouter.get("/dashboard/jobs", async (req, res) => {
  const page = toPositiveInt(req.query.page, 1, 5000);
  const limit = toPositiveInt(req.query.limit, 20, 100);
  const status = typeof req.query.status === "string" ? req.query.status.trim().toUpperCase() : "FAILED";

  const [counts, failedReasons, total, jobs] = await Promise.all([
    labelQueue.getJobCounts("waiting", "active", "completed", "failed", "delayed"),
    prisma.labelJob.groupBy({
      by: ["error"],
      where: { status: "FAILED", error: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { error: "desc" } },
      take: 10,
    }),
    prisma.labelJob.count({ where: { status } }),
    prisma.labelJob.findMany({
      where: { status },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        userId: true,
        status: true,
        error: true,
        recordCount: true,
        unitCount: true,
        includeMoneyOrders: true,
        labelsPdfPath: true,
        moneyOrderPdfPath: true,
        trackingMasterPath: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  ]);

  return res.json({
    queue: {
      waiting: Number(counts.waiting ?? 0),
      active: Number(counts.active ?? 0),
      completed: Number(counts.completed ?? 0),
      failed: Number(counts.failed ?? 0),
      delayed: Number(counts.delayed ?? 0),
    },
    failedReasons: failedReasons.map((row) => ({
      reason: row.error ?? "Unknown failure",
      count: row._count._all,
    })),
    list: {
      status,
      page,
      limit,
      total,
      jobs,
    },
    updatedAt: new Date().toISOString(),
  });
});

adminRouter.get("/dashboard/revenue", async (_req, res) => {
  const [revenue, topPaidUsers, pendingManualPayments] = await Promise.all([
    getRevenueTotals(),
    prisma.payment.groupBy({
      by: ["userId"],
      where: { status: { in: ["PAID", "SUCCESS", "APPROVED", "COMPLETED", "VERIFIED"] } },
      _sum: { amountCents: true },
      orderBy: { _sum: { amountCents: "desc" } },
      take: 10,
    }),
    prisma.manualPaymentRequest.count({ where: { status: "PENDING" } }),
  ]);

  const users = await prisma.user.findMany({
    where: { id: { in: topPaidUsers.map((row) => row.userId) } },
    select: { id: true, email: true, companyName: true },
  });
  const userMap = new Map(users.map((user) => [user.id, user]));

  return res.json({
    ...revenue,
    pendingManualPayments,
    topUsers: topPaidUsers.map((row) => ({
      userId: row.userId,
      email: userMap.get(row.userId)?.email ?? "unknown",
      companyName: userMap.get(row.userId)?.companyName ?? null,
      amountCents: row._sum.amountCents ?? 0,
    })),
    updatedAt: new Date().toISOString(),
  });
});

adminRouter.get("/dashboard/usage", async (_req, res) => {
  const month = monthKeyUTC();
  const [units, monthlyUsageTop, complaintTopRows] = await Promise.all([
    getUnitsTotals(),
    prisma.usageMonthly.findMany({
      where: { month },
      orderBy: [{ labelsGenerated: "desc" }, { trackingGenerated: "desc" }],
      take: 10,
      include: { user: { select: { id: true, email: true, companyName: true } } },
    }),
    prisma.$queryRaw<Array<{ userId: string; complaintCount: number }>>`
      SELECT user_id as "userId", COUNT(*)::int as "complaintCount"
      FROM usage_logs
      WHERE action_type = 'complaint' AND status = 'CONSUMED'
      GROUP BY user_id
      ORDER BY COUNT(*) DESC
      LIMIT 10
    `,
  ]);

  const complaintUsers = await prisma.user.findMany({
    where: { id: { in: complaintTopRows.map((row) => row.userId) } },
    select: { id: true, email: true, companyName: true },
  });
  const complaintUserMap = new Map(complaintUsers.map((user) => [user.id, user]));

  return res.json({
    month,
    units,
    topUsersByUnits: monthlyUsageTop.map((row) => ({
      userId: row.user.id,
      email: row.user.email,
      companyName: row.user.companyName,
      labelsGenerated: row.labelsGenerated,
      labelsQueued: row.labelsQueued,
      trackingGenerated: row.trackingGenerated,
      trackingQueued: row.trackingQueued,
      totalUnits: (row.labelsGenerated ?? 0) + (row.labelsQueued ?? 0) + (row.trackingGenerated ?? 0) + (row.trackingQueued ?? 0),
    })),
    topUsersByComplaints: complaintTopRows.map((row) => ({
      userId: row.userId,
      email: complaintUserMap.get(row.userId)?.email ?? "unknown",
      companyName: complaintUserMap.get(row.userId)?.companyName ?? null,
      complaintsFiled: row.complaintCount,
    })),
    updatedAt: new Date().toISOString(),
  });
});

adminRouter.get("/dashboard/users", async (_req, res) => {
  const month = monthKeyUTC();
  const [
    totalUsers,
    activeUsers,
    newUsersToday,
    newUsersThisMonth,
    suspendedUsers,
    paidUsers,
    freeUsers,
    topUsage,
    topLabels,
    topComplaints,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { suspended: false } }),
    prisma.user.count({ where: { createdAt: { gte: startOfUtcDay() } } }),
    prisma.user.count({ where: { createdAt: { gte: startOfUtcMonth() } } }),
    prisma.user.count({ where: { suspended: true } }),
    prisma.user.count({ where: { subscriptions: { some: { status: "ACTIVE", plan: { priceCents: { gt: 0 } } } } } }),
    prisma.user.count({ where: { OR: [{ subscriptions: { none: {} } }, { subscriptions: { some: { status: "ACTIVE", plan: { priceCents: 0 } } } }] } }),
    prisma.usageMonthly.findMany({
      where: { month },
      orderBy: [{ labelsGenerated: "desc" }, { trackingGenerated: "desc" }],
      take: 10,
      include: { user: { select: { id: true, email: true, companyName: true } } },
    }),
    prisma.labelJob.groupBy({
      by: ["userId"],
      where: { status: "COMPLETED" },
      _sum: { recordCount: true },
      orderBy: { _sum: { recordCount: "desc" } },
      take: 10,
    }),
    prisma.$queryRaw<Array<{ userId: string; complaintCount: number }>>`
      SELECT user_id as "userId", COUNT(*)::int as "complaintCount"
      FROM usage_logs
      WHERE action_type = 'complaint' AND status = 'CONSUMED'
      GROUP BY user_id
      ORDER BY COUNT(*) DESC
      LIMIT 10
    `,
  ]);

  const topLabelUsers = await prisma.user.findMany({
    where: { id: { in: topLabels.map((row) => row.userId) } },
    select: { id: true, email: true, companyName: true },
  });
  const topLabelUserMap = new Map(topLabelUsers.map((user) => [user.id, user]));

  const topComplaintUsers = await prisma.user.findMany({
    where: { id: { in: topComplaints.map((row) => row.userId) } },
    select: { id: true, email: true, companyName: true },
  });
  const topComplaintUserMap = new Map(topComplaintUsers.map((user) => [user.id, user]));

  return res.json({
    summary: {
      totalUsers,
      activeUsers,
      newUsersToday,
      newUsersThisMonth,
      paidUsers,
      freeUsers,
      suspendedUsers,
    },
    topUsersByUnits: topUsage.map((row) => ({
      userId: row.user.id,
      email: row.user.email,
      companyName: row.user.companyName,
      totalUnits: (row.labelsGenerated ?? 0) + (row.labelsQueued ?? 0) + (row.trackingGenerated ?? 0) + (row.trackingQueued ?? 0),
    })),
    topUsersByLabels: topLabels.map((row) => ({
      userId: row.userId,
      email: topLabelUserMap.get(row.userId)?.email ?? "unknown",
      companyName: topLabelUserMap.get(row.userId)?.companyName ?? null,
      labelsGenerated: row._sum.recordCount ?? 0,
    })),
    topUsersByComplaints: topComplaints.map((row) => ({
      userId: row.userId,
      email: topComplaintUserMap.get(row.userId)?.email ?? "unknown",
      companyName: topComplaintUserMap.get(row.userId)?.companyName ?? null,
      complaintsFiled: row.complaintCount,
    })),
    updatedAt: new Date().toISOString(),
  });
});

adminRouter.get("/dashboard/health", async (_req, res) => {
  const [health, trackingQueueCounts] = await Promise.all([
    getHealthSnapshot(),
    trackingQueue.getJobCounts("waiting", "active", "completed", "failed", "delayed").catch(() => ({ waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 })),
  ]);

  const warnings: string[] = [];
  if (health.db.status !== "ok") warnings.push(`DB: ${health.db.message}`);
  if (health.redis.status !== "ok") warnings.push(`Redis: ${health.redis.message}`);
  if (health.worker.status !== "ok") warnings.push(`Worker: ${health.worker.message}`);
  if (health.queue.status !== "ok") warnings.push(`Queue: ${health.queue.message}`);

  return res.json({
    ...health,
    trackingQueue: {
      waiting: Number(trackingQueueCounts.waiting ?? 0),
      active: Number(trackingQueueCounts.active ?? 0),
      completed: Number(trackingQueueCounts.completed ?? 0),
      failed: Number(trackingQueueCounts.failed ?? 0),
      delayed: Number(trackingQueueCounts.delayed ?? 0),
    },
    warnings,
    updatedAt: new Date().toISOString(),
  });
});

adminRouter.get("/storage", async (req, res) => {
  const page = toPositiveInt(req.query.page, 1, 5000);
  const limit = toPositiveInt(req.query.limit, 20, 100);

  const [
    labelTotals,
    moneyOrderTotals,
    trackingMasterTotals,
    trackingResultTotals,
    recentLabelFiles,
    recentTrackingFiles,
    failedJobs,
    failedTracking,
    health,
  ] = await Promise.all([
    prisma.labelJob.count({ where: { labelsPdfPath: { not: null } } }),
    prisma.labelJob.count({ where: { moneyOrderPdfPath: { not: null } } }),
    prisma.labelJob.count({ where: { trackingMasterPath: { not: null } } }),
    prisma.trackingJob.count({ where: { resultPath: { not: null } } }),
    prisma.labelJob.findMany({
      where: { status: "COMPLETED" },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        labelsPdfPath: true,
        moneyOrderPdfPath: true,
        trackingMasterPath: true,
        labelsPdfSyncedAt: true,
        moneyOrderPdfSyncedAt: true,
        trackingMasterSyncedAt: true,
        updatedAt: true,
      },
    }),
    prisma.trackingJob.findMany({
      where: { status: "COMPLETED", resultPath: { not: null } },
      orderBy: { updatedAt: "desc" },
      take: limit,
      select: { id: true, resultPath: true, resultSyncedAt: true, updatedAt: true },
    }),
    prisma.labelJob.findMany({
      where: { status: "FAILED" },
      orderBy: { updatedAt: "desc" },
      take: 20,
      select: { id: true, error: true, updatedAt: true },
    }),
    prisma.trackingJob.findMany({
      where: { status: "FAILED" },
      orderBy: { updatedAt: "desc" },
      take: 20,
      select: { id: true, error: true, updatedAt: true },
    }),
    getHealthSnapshot(),
  ]);

  const unsynced = {
    labels: await prisma.labelJob.count({ where: { labelsPdfPath: { not: null }, labelsPdfSyncedAt: null } }),
    moneyOrders: await prisma.labelJob.count({ where: { moneyOrderPdfPath: { not: null }, moneyOrderPdfSyncedAt: null } }),
    trackingMaster: await prisma.labelJob.count({ where: { trackingMasterPath: { not: null }, trackingMasterSyncedAt: null } }),
    trackingResult: await prisma.trackingJob.count({ where: { resultPath: { not: null }, resultSyncedAt: null } }),
  };

  return res.json({
    provider: process.env.STORAGE_PROVIDER ?? "local",
    dualWriteEnabled: String(process.env.ENABLE_DUAL_WRITE ?? "false").toLowerCase() === "true",
    dualReadEnabled: String(process.env.ENABLE_DUAL_READ ?? "false").toLowerCase() === "true",
    r2UploadsEnabled: String(process.env.ENABLE_R2_UPLOADS ?? "false").toLowerCase() === "true",
    totals: {
      labels: labelTotals,
      moneyOrders: moneyOrderTotals,
      trackingMaster: trackingMasterTotals,
      trackingResult: trackingResultTotals,
    },
    unsynced,
    recentGeneratedFiles: {
      labelJobs: recentLabelFiles,
      trackingJobs: recentTrackingFiles,
      page,
      limit,
    },
    recentFailures: {
      labelJobs: failedJobs,
      trackingJobs: failedTracking,
      failedDownloads: [],
    },
    health,
    updatedAt: new Date().toISOString(),
  });
});

adminRouter.get("/audit", async (req, res) => {
  const page = toPositiveInt(req.query.page, 1, 5000);
  const limit = toPositiveInt(req.query.limit, 50, 200);

  const [complaintAudit, manualPaymentAudit, refundAudit, failedJobs] = await Promise.all([
    listComplaintAuditLogs(limit),
    prisma.manualPaymentRequest.findMany({
      orderBy: { updatedAt: "desc" },
      take: limit,
      select: {
        id: true,
        status: true,
        verifiedBy: true,
        userId: true,
        updatedAt: true,
        transactionId: true,
      },
    }),
    prisma.refundRequest.findMany({
      orderBy: { updatedAt: "desc" },
      take: limit,
      select: { id: true, status: true, userId: true, updatedAt: true, trackingId: true, units: true },
    }),
    prisma.labelJob.findMany({
      where: { status: "FAILED" },
      orderBy: { updatedAt: "desc" },
      take: limit,
      select: { id: true, userId: true, error: true, updatedAt: true },
    }),
  ]);

  const merged = [
    ...complaintAudit.map((row) => ({
      id: `complaint:${row.id}`,
      source: "complaint_audit",
      action: row.action,
      actor: row.actorEmail,
      userId: null,
      trackingId: row.trackingId,
      details: row.details,
      createdAt: row.createdAt,
    })),
    ...manualPaymentAudit.map((row) => ({
      id: `manual_payment:${row.id}`,
      source: "manual_payment",
      action: `manual_payment_${String(row.status ?? "").toLowerCase()}`,
      actor: row.verifiedBy ?? "system",
      userId: row.userId,
      trackingId: null,
      details: `transaction:${row.transactionId}`,
      createdAt: row.updatedAt.toISOString(),
    })),
    ...refundAudit.map((row) => ({
      id: `refund:${row.id}`,
      source: "refund_request",
      action: `refund_${String(row.status ?? "").toLowerCase()}`,
      actor: "admin",
      userId: row.userId,
      trackingId: row.trackingId ?? null,
      details: `units:${row.units}`,
      createdAt: row.updatedAt.toISOString(),
    })),
    ...failedJobs.map((row) => ({
      id: `failed_job:${row.id}`,
      source: "label_job",
      action: "job_failed",
      actor: "system",
      userId: row.userId,
      trackingId: null,
      details: row.error ?? "Unknown failure",
      createdAt: row.updatedAt.toISOString(),
    })),
  ]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const total = merged.length;
  const start = (page - 1) * limit;
  const events = merged.slice(start, start + limit);

  return res.json({
    page,
    limit,
    total,
    events,
    sources: ["complaint_audit", "manual_payment", "refund_request", "label_job"],
    notes: [
      "Auth audit events are currently log-based and not persisted in a queryable table.",
      "Complaint audit logs are the primary persisted admin audit source.",
    ],
    updatedAt: new Date().toISOString(),
  });
});

adminRouter.get("/complaints", async (_req, res) => {
  const complaints = await listComplaintRecords();
  const alerts = await listComplaintAlerts(50);
  res.json({ complaints, alerts });
});

adminRouter.get("/complaints/export", async (req, res) => {
  const complaints = await listComplaintRecords();
  const csv = buildComplaintExportCsv(complaints);
  await logComplaintAudit({
    actorEmail: String((req as any).user?.email ?? "system").trim() || "system",
    action: "complaint_exported",
    details: `rows:${complaints.length}`,
  });
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="complaints-${new Date().toISOString().slice(0, 10)}.csv"`);
  return res.send(csv);
});

adminRouter.post("/complaints/sync", async (req, res) => {
  const body = z.object({ trackingIds: z.array(z.string().min(1).max(80)).optional() }).parse(req.body ?? {});
  const actorEmail = String((req as any).user?.email ?? "system").trim() || "system";
  const result = await runComplaintSyncJob({ trackingIds: body.trackingIds, actorEmail });
  return res.json({ success: true, count: result.length, result });
});

adminRouter.get("/complaints/queue", async (_req, res) => {
  const queue = await prisma.complaintQueue.findMany({
    orderBy: { updatedAt: "desc" },
    take: 300,
  });
  const circuit = await getComplaintCircuitState();
  const normalizedQueue = queue.map((row) => ({
    ...row,
    complaintStatus: normalizeComplaintQueueStatus(row.complaintStatus),
  }));
  return res.json({ success: true, circuit, queue: normalizedQueue });
});

adminRouter.get("/complaints/monitor", async (_req, res) => {
  const [queueRows, circuit, complaints] = await Promise.all([
    prisma.complaintQueue.findMany({
      orderBy: { updatedAt: "desc" },
      take: 500,
    }),
    getComplaintCircuitState(),
    listComplaintRecords(),
  ]);

  const queue = queueRows.map((row) => ({
    ...row,
    complaintStatus: normalizeComplaintQueueStatus(row.complaintStatus),
  }));

  const now = Date.now();
  const summary = {
    queued: 0,
    processing: 0,
    retry_pending: 0,
    manual_review: 0,
    submitted: 0,
    duplicate: 0,
    open: 0,
    resolved: 0,
  };

  for (const row of queue) {
    const status = String(row.complaintStatus ?? "").trim().toLowerCase();
    if (status === "queued") summary.queued += 1;
    if (status === "processing") summary.processing += 1;
    if (status === "retry_pending") summary.retry_pending += 1;
    if (status === "manual_review") summary.manual_review += 1;
    if (status === "submitted") summary.submitted += 1;
    if (status === "duplicate") summary.duplicate += 1;
  }

  for (const complaint of complaints) {
    const state = String(complaint.state ?? "").trim().toUpperCase().replace(/[\-_]+/g, " ");
    if (["ACTIVE", "IN PROCESS", "OPEN", "PROCESSING"].includes(state)) {
      summary.open += 1;
    }
    if (["RESOLVED", "CLOSED"].includes(state)) {
      summary.resolved += 1;
    }
  }

  const nextRetry = queue
    .filter((row) => String(row.complaintStatus).toLowerCase() === "retry_pending" && row.nextRetryAt)
    .map((row) => ({
      id: row.id,
      trackingId: row.trackingId,
      nextRetryAt: row.nextRetryAt,
      waitMs: Math.max(0, (row.nextRetryAt ? row.nextRetryAt.getTime() : now) - now),
    }))
    .sort((a, b) => a.waitMs - b.waitMs)[0] ?? null;

  return res.json({
    success: true,
    circuit,
    summary,
    nextRetry,
    queue,
  });
});

adminRouter.post("/complaints/retry", async (_req, res) => {
  const result = await runComplaintRetryJob();
  return res.json({ success: true, result });
});

adminRouter.post("/complaints/queue/:queueId/retry", async (req, res) => {
  const queueId = String(req.params.queueId ?? "").trim();
  if (!queueId) return res.status(400).json({ success: false, message: "Queue id is required" });

  const result = await processComplaintQueueById(queueId);
  return res.json({ success: Boolean((result as any)?.success), result });
});

adminRouter.post("/complaints/manual-override", async (req, res) => {
  const body = z.object({
    trackingId: z.string().min(1).max(80),
    complaintId: z.string().min(1).max(80),
    dueDate: z.string().min(1).max(40),
    state: z.enum(["OPEN", "IN_PROCESS", "RESOLVED", "CLOSED", "ACTIVE"]).default("ACTIVE"),
  }).parse(req.body ?? {});

  const actorEmail = String((req as any).user?.email ?? "system").trim() || "system";
  const text = `COMPLAINT_ID: ${body.complaintId} | DUE_DATE: ${body.dueDate} | COMPLAINT_STATE: ${body.state}\nResponse:\nManual override by admin`;

  await prisma.shipment.updateMany({
    where: { trackingNumber: body.trackingId },
    data: {
      complaintStatus: "FILED",
      complaintText: text,
    },
  });

  await logComplaintAudit({
    actorEmail,
    action: "complaint_updated",
    trackingId: body.trackingId,
    complaintId: body.complaintId,
    details: `manual_override:true;state:${body.state};due:${body.dueDate}`,
  });

  return res.json({ success: true });
});

adminRouter.get("/complaints/alerts", async (_req, res) => {
  const alerts = await listComplaintAlerts(300);
  res.json({ success: true, alerts });
});

adminRouter.post("/complaints/backup", async (req, res) => {
  const actorEmail = String((req as any).user?.email ?? "system").trim() || "system";
  const result = await runComplaintBackupJob();
  await logComplaintAudit({
    actorEmail,
    action: "complaint_updated",
    details: `backup_stamp:${result.stamp};complaints:${result.complaintCount}`,
  });
  res.json({ success: true, result });
});

adminRouter.get("/complaint-audit", async (_req, res) => {
  const logs = await listComplaintAuditLogs(300);
  res.json({ success: true, logs });
});

adminRouter.get("/users", async (_req, res) => {
  const month = monthKeyUTC();
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      subscriptions: {
        where: { status: "ACTIVE" },
        include: { plan: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      usage: {
        where: { month },
        take: 1,
      },
    },
  });
  res.json({
    month,
    users: users.map((user) => {
      const subscription = user.subscriptions[0] ?? null;
      const usage = user.usage[0] ?? {
        month,
        labelsGenerated: 0,
        labelsQueued: 0,
        trackingGenerated: 0,
        trackingQueued: 0,
      };
      const labelLimit = (subscription?.plan.monthlyLabelLimit ?? 0) + (user.extraLabelCredits ?? 0);
      const trackingLimit = (subscription?.plan.monthlyTrackingLimit ?? subscription?.plan.monthlyLabelLimit ?? 0) + (user.extraTrackingCredits ?? 0);
      const consumedUnits = (usage.labelsGenerated ?? 0) + (usage.labelsQueued ?? 0);
      const consumedTracking = (usage.trackingGenerated ?? 0) + (usage.trackingQueued ?? 0);
      const remainingUnits = Math.max(0, labelLimit - consumedUnits);

      return {
        id: user.id,
        email: user.email,
        role: user.role,
        suspended: user.suspended,
        createdAt: user.createdAt,
        companyName: user.companyName,
        address: user.address,
        contactNumber: user.contactNumber,
        originCity: user.originCity,
        extraLabelCredits: user.extraLabelCredits,
        extraTrackingCredits: user.extraTrackingCredits,
        subscription: subscription
          ? {
              id: subscription.id,
              status: subscription.status,
              currentPeriodStart: subscription.currentPeriodStart,
              currentPeriodEnd: subscription.currentPeriodEnd,
              plan: subscription.plan,
            }
          : null,
        usage: {
          month,
          labelsGenerated: usage.labelsGenerated ?? 0,
          labelsQueued: usage.labelsQueued ?? 0,
          trackingGenerated: usage.trackingGenerated ?? 0,
          trackingQueued: usage.trackingQueued ?? 0,
        },
        balances: {
          labelLimit,
          trackingLimit,
          labelsRemaining: remainingUnits,
          trackingRemaining: Math.max(0, trackingLimit - consumedTracking),
          total_units: labelLimit,
          used_units: consumedUnits,
          remaining_units: remainingUnits,
        },
      };
    }),
  });
});

adminRouter.post("/users", async (req, res) => {
  const body = z.object({
    email: z.string().email(),
    password: z.string().min(8).max(128),
    companyName: z.string().max(120).nullable().optional(),
    address: z.string().max(300).nullable().optional(),
    contactNumber: z.string().max(30).nullable().optional(),
    originCity: z.string().max(80).nullable().optional(),
    role: z.enum(["USER", "ADMIN"]).optional(),
    suspended: z.boolean().optional(),
    planId: z.string().uuid().optional(),
  }).parse(req.body ?? {});

  const email = body.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return res.status(409).json({ error: "Email already registered" });

  const passwordHash = await hashPassword(body.password);
  const created = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        passwordHash,
        role: body.role ?? "USER",
        suspended: Boolean(body.suspended),
        companyName: body.companyName ?? null,
        address: body.address ?? null,
        contactNumber: body.contactNumber ?? null,
        originCity: body.originCity ?? null,
      },
      select: {
        id: true,
        email: true,
        role: true,
        suspended: true,
        companyName: true,
        contactNumber: true,
        createdAt: true,
      },
    });

    if (body.planId) {
      const plan = await tx.plan.findUnique({ where: { id: body.planId } });
      if (plan) {
        const now = new Date();
        const end = new Date(now);
        if (plan.name.toLowerCase().includes("free")) {
          end.setUTCDate(end.getUTCDate() + 15);
        } else {
          end.setUTCMonth(end.getUTCMonth() + 1);
        }
        await tx.subscription.create({
          data: {
            userId: user.id,
            planId: plan.id,
            status: "ACTIVE",
            currentPeriodStart: now,
            currentPeriodEnd: end,
          },
        });
      }
    }

    return user;
  });

  await logComplaintAudit({
    actorEmail: String((req as any).user?.email ?? "system").trim() || "system",
    action: "complaint_updated",
    trackingId: created.id,
    details: `admin_user_created:${created.email}`,
  });

  res.status(201).json({ user: created });
});

adminRouter.post("/users/:userId/role", async (req, res) => {
  const body = z.object({ role: z.enum(["USER", "ADMIN"]) }).parse(req.body);
  const user = await prisma.user.update({
    where: { id: req.params.userId },
    data: { role: body.role },
    select: { id: true, email: true, role: true, suspended: true },
  });
  res.json({ user });
});

adminRouter.post("/users/:userId/suspend", async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.userId } });
  if (!user) return res.status(404).json({ error: "User not found" });
  const updated = await prisma.user.update({
    where: { id: req.params.userId },
    data: { suspended: true },
    select: { id: true, email: true, role: true, suspended: true },
  });
  res.json({ user: updated });
});

adminRouter.post("/users/:userId/unsuspend", async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.userId } });
  if (!user) return res.status(404).json({ error: "User not found" });
  const updated = await prisma.user.update({
    where: { id: req.params.userId },
    data: { suspended: false },
    select: { id: true, email: true, role: true, suspended: true },
  });
  res.json({ user: updated });
});

adminRouter.post("/users/:userId/reactivate", async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.userId } });
  if (!user) return res.status(404).json({ error: "User not found" });
  const updated = await prisma.user.update({
    where: { id: req.params.userId },
    data: { suspended: false },
    select: { id: true, email: true, role: true, suspended: true },
  });
  res.json({ user: updated });
});

adminRouter.patch("/users/:userId", async (req, res) => {
  const body = z.object({
    email: z.string().email().optional(),
    companyName: z.string().max(120).nullable().optional(),
    address: z.string().max(300).nullable().optional(),
    contactNumber: z.string().max(30).nullable().optional(),
    originCity: z.string().max(80).nullable().optional(),
    extraLabelCredits: z.number().int().min(0).optional(),
    extraTrackingCredits: z.number().int().min(0).optional(),
  }).parse(req.body);
  const user = await prisma.user.update({
    where: { id: req.params.userId },
    data: body,
    select: { id: true, email: true, role: true, suspended: true, companyName: true, address: true, contactNumber: true, originCity: true, extraLabelCredits: true, extraTrackingCredits: true },
  });
  res.json({ user });
});

adminRouter.post("/users/:userId/subscription", async (req, res) => {
  const body = z.object({ planId: z.string().uuid() }).parse(req.body);
  const plan = await prisma.plan.findUnique({ where: { id: body.planId } });
  if (!plan) return res.status(404).json({ error: "Plan not found" });

  const now = new Date();
  const end = new Date(now);
  if (plan.name.toLowerCase().includes("free")) {
    end.setUTCDate(end.getUTCDate() + 15);
  } else {
    end.setUTCMonth(end.getUTCMonth() + 1);
  }

  await prisma.subscription.updateMany({ where: { userId: req.params.userId, status: "ACTIVE" }, data: { status: "CANCELED" } });
  const subscription = await prisma.subscription.create({
    data: { userId: req.params.userId, planId: plan.id, status: "ACTIVE", currentPeriodStart: now, currentPeriodEnd: end },
    include: { plan: true },
  });

  res.json({ subscription });
});

adminRouter.post("/users/:userId/credits", async (req, res) => {
  const body = z.object({
    labelCredits: z.number().int().min(0).default(0),
    trackingCredits: z.number().int().min(0).default(0),
  }).parse(req.body);

  const user = await prisma.user.update({
    where: { id: req.params.userId },
    data: {
      extraLabelCredits: { increment: body.labelCredits },
      extraTrackingCredits: { increment: body.trackingCredits },
    },
    select: { id: true, email: true, extraLabelCredits: true, extraTrackingCredits: true },
  });

  res.json({ user });
});

adminRouter.post("/users/:userId/units", async (req, res) => {
  const body = z.object({
    units: z.number().int(),
  }).parse(req.body ?? {});

  const delta = body.units;
  const existing = await prisma.user.findUnique({
    where: { id: req.params.userId },
    select: { id: true, extraLabelCredits: true, extraTrackingCredits: true },
  });
  if (!existing) return res.status(404).json({ error: "User not found" });

  const nextLabel = Math.max(0, (existing.extraLabelCredits ?? 0) + delta);
  const nextTracking = Math.max(0, (existing.extraTrackingCredits ?? 0) + delta);
  const user = await prisma.user.update({
    where: { id: req.params.userId },
    data: {
      extraLabelCredits: nextLabel,
      extraTrackingCredits: nextTracking,
    },
    select: { id: true, email: true, extraLabelCredits: true, extraTrackingCredits: true },
  });

  res.json({ user });
});

adminRouter.delete("/users/:userId", async (req, res) => {
  const authed = req as any;
  if (authed.user?.id === req.params.userId) {
    return res.status(400).json({ error: "Cannot delete your own account" });
  }
  await prisma.user.delete({ where: { id: req.params.userId } });
  res.json({ success: true });
});

adminRouter.get("/refunds", async (_req, res) => {
  const refunds = await prisma.refundRequest.findMany({
    where: { status: "PENDING" },
    include: { user: { select: { id: true, email: true, companyName: true } } },
    orderBy: { createdAt: "desc" },
  });

  res.json({
    refunds: refunds.map((refund) => ({
      id: refund.id,
      userId: refund.userId,
      user: refund.user,
      trackingId: refund.trackingId,
      units: refund.units,
      reason: refund.reason,
      status: refund.status,
      createdAt: refund.createdAt,
    })),
  });
});

adminRouter.post("/refunds/:refundId/approve", async (req, res) => {
  const refund = await prisma.refundRequest.findUnique({
    where: { id: req.params.refundId },
  });

  if (!refund) {
    return res.status(404).json({ error: "Refund request not found" });
  }

  if (refund.status !== "PENDING") {
    return res.status(400).json({ error: `Refund is already ${refund.status.toLowerCase()}` });
  }

  // Refund units
  await refundUnitsByAmount(refund.userId, refund.units);

  // Update refund status
  const updated = await prisma.refundRequest.update({
    where: { id: req.params.refundId },
    data: { status: "APPROVED" },
    include: { user: { select: { id: true, email: true } } },
  });

  res.json({
    refund: {
      id: updated.id,
      userId: updated.userId,
      user: updated.user,
      trackingId: updated.trackingId,
      units: updated.units,
      reason: updated.reason,
      status: updated.status,
      updatedAt: updated.updatedAt,
    },
  });
});

adminRouter.post("/refunds/:refundId/reject", async (req, res) => {
  const refund = await prisma.refundRequest.findUnique({
    where: { id: req.params.refundId },
  });

  if (!refund) {
    return res.status(404).json({ error: "Refund request not found" });
  }

  if (refund.status !== "PENDING") {
    return res.status(400).json({ error: `Refund is already ${refund.status.toLowerCase()}` });
  }

  // Update refund status
  const updated = await prisma.refundRequest.update({
    where: { id: req.params.refundId },
    data: { status: "REJECTED" },
    include: { user: { select: { id: true, email: true } } },
  });

  res.json({
    refund: {
      id: updated.id,
      userId: updated.userId,
      user: updated.user,
      trackingId: updated.trackingId,
      units: updated.units,
      reason: updated.reason,
      status: updated.status,
      updatedAt: updated.updatedAt,
    },
  });
});

adminRouter.get("/plans", async (_req, res) => {
  await ensurePlanManagementColumns();
  const plans = await prisma.plan.findMany({ orderBy: { createdAt: "desc" } });
  const extrasMap = await getPlanExtrasByIds(plans.map((plan) => plan.id));
  res.json({
    plans: plans.map((plan) => {
      const extras = extrasMap.get(plan.id);
      return {
        ...plan,
        fullPriceCents: extras?.fullPriceCents ?? plan.priceCents,
        discountPriceCents: extras?.discountPriceCents ?? plan.priceCents,
        discountPct: extras?.discountPct ?? 0,
        isSuspended: extras?.isSuspended ?? false,
        unitsIncluded: extras?.unitsIncluded ?? plan.monthlyLabelLimit,
        labelsIncluded: extras?.labelsIncluded ?? plan.monthlyLabelLimit,
        trackingIncluded: extras?.trackingIncluded ?? plan.monthlyTrackingLimit,
        moneyOrdersIncluded: extras?.moneyOrdersIncluded ?? plan.monthlyLabelLimit,
        complaintsIncluded: extras?.complaintsIncluded ?? 0,
        dailyComplaintLimit: extras?.dailyComplaintLimit ?? 0,
        monthlyComplaintLimit: extras?.monthlyComplaintLimit ?? 0,
      };
    }),
  });
});

adminRouter.post("/plans", async (req, res) => {
  await ensurePlanManagementColumns();
  const body = z
    .object({
      name: z.string().min(1),
      fullPriceCents: z.number().int().nonnegative(),
      discountPriceCents: z.number().int().nonnegative(),
      unitsIncluded: z.number().int().nonnegative().optional(),
      labelsIncluded: z.number().int().nonnegative().optional(),
      trackingIncluded: z.number().int().nonnegative().optional(),
      moneyOrdersIncluded: z.number().int().nonnegative().optional(),
      complaintsIncluded: z.number().int().nonnegative().optional(),
      dailyComplaintLimit: z.number().int().nonnegative().optional(),
      monthlyComplaintLimit: z.number().int().nonnegative().optional(),
      isSuspended: z.boolean().optional(),
      monthlyLabelLimit: z.number().int().positive(),
      monthlyTrackingLimit: z.number().int().positive(),
    })
    .parse(req.body);

  const discountPriceCents = Math.max(0, body.discountPriceCents);
  const fullPriceCents = Math.max(discountPriceCents, body.fullPriceCents);

  const plan = await prisma.plan.create({
    data: {
      name: body.name,
      priceCents: discountPriceCents,
      monthlyLabelLimit: body.monthlyLabelLimit,
      monthlyTrackingLimit: body.monthlyTrackingLimit,
    } as any,
  });

  const labelsIncluded = Math.max(0, body.labelsIncluded ?? body.monthlyLabelLimit);
  const trackingIncluded = Math.max(0, body.trackingIncluded ?? body.monthlyTrackingLimit);
  const unitsIncluded = Math.max(labelsIncluded, body.unitsIncluded ?? labelsIncluded);
  const moneyOrdersIncluded = Math.max(0, body.moneyOrdersIncluded ?? labelsIncluded);
  const dailyComplaintLimit = Math.max(0, body.dailyComplaintLimit ?? 0);
  const monthlyComplaintLimit = Math.max(dailyComplaintLimit, body.monthlyComplaintLimit ?? 0);
  const complaintsIncluded = Math.max(0, body.complaintsIncluded ?? monthlyComplaintLimit);

  await prisma.$executeRaw`
    UPDATE "Plan"
    SET full_price_cents = ${fullPriceCents},
        discount_price_cents = ${discountPriceCents},
        is_suspended = ${Boolean(body.isSuspended)},
        units_included = ${unitsIncluded},
        labels_included = ${labelsIncluded},
        tracking_included = ${trackingIncluded},
        money_orders_included = ${moneyOrdersIncluded},
        complaints_included = ${complaintsIncluded},
        daily_complaint_limit = ${dailyComplaintLimit},
        monthly_complaint_limit = ${monthlyComplaintLimit}
    WHERE id = ${plan.id}
  `;

  res.json({
    plan: {
      ...plan,
      fullPriceCents,
      discountPriceCents,
      discountPct: fullPriceCents > 0 ? Math.round(((fullPriceCents - discountPriceCents) / fullPriceCents) * 100) : 0,
      isSuspended: Boolean(body.isSuspended),
      unitsIncluded,
      labelsIncluded,
      trackingIncluded,
      moneyOrdersIncluded,
      complaintsIncluded,
      dailyComplaintLimit,
      monthlyComplaintLimit,
    },
  });
});

adminRouter.put("/plans/:planId", async (req, res) => {
  await ensurePlanManagementColumns();
  const body = z
    .object({
      name: z.string().min(1).optional(),
      fullPriceCents: z.number().int().nonnegative().optional(),
      discountPriceCents: z.number().int().nonnegative().optional(),
      unitsIncluded: z.number().int().nonnegative().optional(),
      labelsIncluded: z.number().int().nonnegative().optional(),
      trackingIncluded: z.number().int().nonnegative().optional(),
      moneyOrdersIncluded: z.number().int().nonnegative().optional(),
      complaintsIncluded: z.number().int().nonnegative().optional(),
      dailyComplaintLimit: z.number().int().nonnegative().optional(),
      monthlyComplaintLimit: z.number().int().nonnegative().optional(),
      isSuspended: z.boolean().optional(),
      monthlyLabelLimit: z.number().int().positive().optional(),
      monthlyTrackingLimit: z.number().int().positive().optional(),
    })
    .parse(req.body);

  const existing = await prisma.plan.findUnique({ where: { id: req.params.planId } });
  if (!existing) return res.status(404).json({ error: "Plan not found" });

  const extrasMap = await getPlanExtrasByIds([existing.id]);
  const existingExtras = extrasMap.get(existing.id);
  const nextDiscount = Math.max(0, body.discountPriceCents ?? existingExtras?.discountPriceCents ?? existing.priceCents);
  const nextFull = Math.max(nextDiscount, body.fullPriceCents ?? existingExtras?.fullPriceCents ?? existing.priceCents);
  const nextLabelsIncluded = Math.max(0, body.labelsIncluded ?? existingExtras?.labelsIncluded ?? existing.monthlyLabelLimit);
  const nextTrackingIncluded = Math.max(0, body.trackingIncluded ?? existingExtras?.trackingIncluded ?? existing.monthlyTrackingLimit);
  const nextUnitsIncluded = Math.max(nextLabelsIncluded, body.unitsIncluded ?? existingExtras?.unitsIncluded ?? nextLabelsIncluded);
  const nextMoneyOrdersIncluded = Math.max(0, body.moneyOrdersIncluded ?? existingExtras?.moneyOrdersIncluded ?? nextLabelsIncluded);
  const nextDailyComplaintLimit = Math.max(0, body.dailyComplaintLimit ?? existingExtras?.dailyComplaintLimit ?? 0);
  const nextMonthlyComplaintLimit = Math.max(nextDailyComplaintLimit, body.monthlyComplaintLimit ?? existingExtras?.monthlyComplaintLimit ?? 0);
  const nextComplaintsIncluded = Math.max(0, body.complaintsIncluded ?? existingExtras?.complaintsIncluded ?? nextMonthlyComplaintLimit);

  const plan = await prisma.plan.update({
    where: { id: existing.id },
    data: {
      name: body.name ?? existing.name,
      priceCents: nextDiscount,
      monthlyLabelLimit: body.monthlyLabelLimit ?? existing.monthlyLabelLimit,
      monthlyTrackingLimit: body.monthlyTrackingLimit ?? existing.monthlyTrackingLimit,
    },
  });

  await prisma.$executeRaw`
    UPDATE "Plan"
    SET full_price_cents = ${nextFull},
        discount_price_cents = ${nextDiscount},
        is_suspended = ${body.isSuspended ?? existingExtras?.isSuspended ?? false},
        units_included = ${nextUnitsIncluded},
        labels_included = ${nextLabelsIncluded},
        tracking_included = ${nextTrackingIncluded},
        money_orders_included = ${nextMoneyOrdersIncluded},
        complaints_included = ${nextComplaintsIncluded},
        daily_complaint_limit = ${nextDailyComplaintLimit},
        monthly_complaint_limit = ${nextMonthlyComplaintLimit}
    WHERE id = ${plan.id}
  `;

  res.json({
    plan: {
      ...plan,
      fullPriceCents: nextFull,
      discountPriceCents: nextDiscount,
      discountPct: nextFull > 0 ? Math.round(((nextFull - nextDiscount) / nextFull) * 100) : 0,
      isSuspended: body.isSuspended ?? existingExtras?.isSuspended ?? false,
      unitsIncluded: nextUnitsIncluded,
      labelsIncluded: nextLabelsIncluded,
      trackingIncluded: nextTrackingIncluded,
      moneyOrdersIncluded: nextMoneyOrdersIncluded,
      complaintsIncluded: nextComplaintsIncluded,
      dailyComplaintLimit: nextDailyComplaintLimit,
      monthlyComplaintLimit: nextMonthlyComplaintLimit,
    },
  });
});

adminRouter.patch("/plans/:planId", async (req, res) => {
  const body = z
    .object({
      name: z.string().min(1).optional(),
      fullPriceCents: z.number().int().nonnegative().optional(),
      discountPriceCents: z.number().int().nonnegative().optional(),
      unitsIncluded: z.number().int().nonnegative().optional(),
      labelsIncluded: z.number().int().nonnegative().optional(),
      trackingIncluded: z.number().int().nonnegative().optional(),
      moneyOrdersIncluded: z.number().int().nonnegative().optional(),
      complaintsIncluded: z.number().int().nonnegative().optional(),
      dailyComplaintLimit: z.number().int().nonnegative().optional(),
      monthlyComplaintLimit: z.number().int().nonnegative().optional(),
      isSuspended: z.boolean().optional(),
      monthlyLabelLimit: z.number().int().positive().optional(),
      monthlyTrackingLimit: z.number().int().positive().optional(),
    })
    .parse(req.body ?? {});

  const existing = await prisma.plan.findUnique({ where: { id: req.params.planId } });
  if (!existing) return res.status(404).json({ error: "Plan not found" });

  const updated = await prisma.plan.update({
    where: { id: existing.id },
    data: {
      name: body.name ?? existing.name,
      priceCents: body.discountPriceCents ?? existing.priceCents,
      monthlyLabelLimit: body.monthlyLabelLimit ?? existing.monthlyLabelLimit,
      monthlyTrackingLimit: body.monthlyTrackingLimit ?? existing.monthlyTrackingLimit,
    },
  });

  if (typeof body.isSuspended === "boolean") {
    await prisma.$executeRaw`
      UPDATE "Plan"
      SET is_suspended = ${body.isSuspended}
      WHERE id = ${existing.id}
    `;
  }

  res.json({ plan: updated });
});

adminRouter.post("/plans/:planId/suspend", async (req, res) => {
  await ensurePlanManagementColumns();
  const body = z.object({ isSuspended: z.boolean().default(true) }).parse(req.body ?? {});
  const existing = await prisma.plan.findUnique({ where: { id: req.params.planId } });
  if (!existing) return res.status(404).json({ error: "Plan not found" });

  await prisma.$executeRaw`
    UPDATE "Plan"
    SET is_suspended = ${body.isSuspended}
    WHERE id = ${existing.id}
  `;
  res.json({ success: true, planId: existing.id, isSuspended: body.isSuspended });
});

adminRouter.delete("/plans/:planId", async (req, res) => {
  const existing = await prisma.plan.findUnique({ where: { id: req.params.planId } });
  if (!existing) return res.status(404).json({ error: "Plan not found" });

  const [activeSubscriptions, totalSubscriptions, payments, invoices, manualPayments] = await Promise.all([
    prisma.subscription.count({ where: { planId: existing.id, status: "ACTIVE" } }),
    prisma.subscription.count({ where: { planId: existing.id } }),
    prisma.payment.count({ where: { planId: existing.id } }),
    prisma.invoice.count({ where: { planId: existing.id } }),
    prisma.manualPaymentRequest.count({ where: { planId: existing.id } }),
  ]);

  if (activeSubscriptions > 0) {
    return res.status(409).json({
      error: `Cannot delete plan: ${activeSubscriptions} active subscription(s) linked.`,
      blockers: {
        activeSubscriptions,
        subscriptions: totalSubscriptions,
        payments,
        invoices,
        manualPayments,
      },
    });
  }

  if (totalSubscriptions > 0 || payments > 0 || invoices > 0 || manualPayments > 0) {
    const reasons: string[] = [];
    if (totalSubscriptions > 0) reasons.push(`${totalSubscriptions} subscription record(s)`);
    if (invoices > 0) reasons.push(`${invoices} invoice record(s)`);
    if (payments > 0) reasons.push(`${payments} payment record(s)`);
    if (manualPayments > 0) reasons.push(`${manualPayments} manual payment request(s)`);
    return res.status(409).json({
      error: `Cannot delete plan: linked billing history exists (${reasons.join(", ")}).`,
      blockers: {
        activeSubscriptions,
        subscriptions: totalSubscriptions,
        payments,
        invoices,
        manualPayments,
      },
    });
  }

  await prisma.plan.delete({ where: { id: existing.id } });
  res.json({ success: true });
});

adminRouter.get("/billing-settings", async (req, res) => {
  const [settings, exemptFileNames] = await Promise.all([
    getOrCreateBillingSettings(),
    getUploadExemptFileNames(),
  ]);
  console.info("ADMIN_BYPASS_FETCH", JSON.stringify({
    actor: (req as any).user?.id ?? "unknown",
    exemptFileNames,
    count: exemptFileNames.length,
  }));
  const jazzcashQrExists = Boolean(settings.jazzcashQrPath && fs.existsSync(resolveStoredPath(settings.jazzcashQrPath)));
  const easypaisaQrExists = Boolean(settings.easypaisaQrPath && fs.existsSync(resolveStoredPath(settings.easypaisaQrPath)));
  const bankQrExists = Boolean(settings.bankQrPath && fs.existsSync(resolveStoredPath(settings.bankQrPath)));
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.json({
    settings: {
      ...settings,
      exemptFileNames,
      jazzcashQrUrl: jazzcashQrExists ? buildAbsoluteApiUrl(req, "/api/manual-payments/wallet-qr/jazzcash") : null,
      easypaisaQrUrl: easypaisaQrExists ? buildAbsoluteApiUrl(req, "/api/manual-payments/wallet-qr/easypaisa") : null,
      bankQrUrl: bankQrExists ? buildAbsoluteApiUrl(req, "/api/manual-payments/wallet-qr/bank-transfer") : null,
    },
  });
});

adminRouter.put(
  "/billing-settings",
  billingQrUpload.fields([
    { name: "jazzcashQr", maxCount: 1 },
    { name: "easypaisaQr", maxCount: 1 },
    { name: "bankQr", maxCount: 1 },
  ]),
  async (req, res) => {
    const body = z
      .object({
        jazzcashNumber: z.string().trim().min(1),
        jazzcashTitle: z.string().trim().min(1),
        easypaisaNumber: z.string().trim().min(1),
        easypaisaTitle: z.string().trim().min(1),
        bankName: z.string().trim().optional(),
        bankTitle: z.string().trim().optional(),
        bankAccountNumber: z.string().trim().optional(),
        bankIban: z.string().trim().optional(),
        standardPrice: z.coerce.number().int().positive(),
        businessPrice: z.coerce.number().int().positive(),
        clearJazzcashQr: z
          .string()
          .optional()
          .transform((v) => v === "true"),
        clearEasypaisaQr: z
          .string()
          .optional()
          .transform((v) => v === "true"),
        clearBankQr: z
          .string()
          .optional()
          .transform((v) => v === "true"),
        exemptFileNames: z.string().optional(),
      })
      .parse(req.body ?? {});

    let parsedExemptFileNames: string[] | undefined;
    if (typeof body.exemptFileNames === "string") {
      try {
        const parsed = JSON.parse(body.exemptFileNames);
        if (!Array.isArray(parsed)) {
          return res.status(400).json({ success: false, error: "Invalid exemptFileNames payload" });
        }
        parsedExemptFileNames = parsed
          .map((entry) => String(entry ?? ""))
          .filter((entry) => entry.trim().length > 0);
      } catch {
        return res.status(400).json({ success: false, error: "Invalid exemptFileNames payload" });
      }
    }

    console.info("ADMIN_BYPASS_SAVE", JSON.stringify({
      actor: (req as any).user?.id ?? "unknown",
      rawPayload: typeof body.exemptFileNames === "string" ? body.exemptFileNames : null,
      parsedExemptFileNames: parsedExemptFileNames ?? null,
    }));

    const files = (req.files ?? {}) as Record<string, Express.Multer.File[]>;
    const jazzcashQr = files.jazzcashQr?.[0];
    const easypaisaQr = files.easypaisaQr?.[0];
    const bankQr = files.bankQr?.[0];

    console.info("[BillingSettings] save request", {
      actor: (req as any).user?.id ?? "unknown",
      jazzcashNumber: body.jazzcashNumber,
      jazzcashTitle: body.jazzcashTitle,
      easypaisaNumber: body.easypaisaNumber,
      easypaisaTitle: body.easypaisaTitle,
      bankName: body.bankName ?? null,
      bankTitle: body.bankTitle ?? null,
      bankAccountNumber: body.bankAccountNumber ?? null,
      bankIban: body.bankIban ?? null,
      standardPrice: body.standardPrice,
      businessPrice: body.businessPrice,
      hasJazzcashQrUpload: Boolean(jazzcashQr),
      hasEasypaisaQrUpload: Boolean(easypaisaQr),
      hasBankQrUpload: Boolean(bankQr),
      clearJazzcashQr: body.clearJazzcashQr,
      clearEasypaisaQr: body.clearEasypaisaQr,
      clearBankQr: body.clearBankQr,
    });

    const current = await getOrCreateBillingSettings();
    const jazzcashQrPath = jazzcashQr
      ? toStoredPath(jazzcashQr.path)
      : body.clearJazzcashQr
        ? null
        : current.jazzcashQrPath;
    const easypaisaQrPath = easypaisaQr
      ? toStoredPath(easypaisaQr.path)
      : body.clearEasypaisaQr
        ? null
        : current.easypaisaQrPath;
    const bankQrPath = bankQr
      ? toStoredPath(bankQr.path)
      : body.clearBankQr
        ? null
        : current.bankQrPath;

    const updated = await prisma.billingSettings.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        jazzcashNumber: body.jazzcashNumber,
        jazzcashTitle: body.jazzcashTitle,
        jazzcashQrPath,
        easypaisaNumber: body.easypaisaNumber,
        easypaisaTitle: body.easypaisaTitle,
        easypaisaQrPath,
        bankName: body.bankName ?? null,
        bankTitle: body.bankTitle ?? null,
        bankAccountNumber: body.bankAccountNumber ?? null,
        bankIban: body.bankIban ?? null,
        bankQrPath,
        standardPrice: body.standardPrice,
        businessPrice: body.businessPrice,
      },
      update: {
        jazzcashNumber: body.jazzcashNumber,
        jazzcashTitle: body.jazzcashTitle,
        jazzcashQrPath,
        easypaisaNumber: body.easypaisaNumber,
        easypaisaTitle: body.easypaisaTitle,
        easypaisaQrPath,
        bankName: body.bankName ?? null,
        bankTitle: body.bankTitle ?? null,
        bankAccountNumber: body.bankAccountNumber ?? null,
        bankIban: body.bankIban ?? null,
        bankQrPath,
        standardPrice: body.standardPrice,
        businessPrice: body.businessPrice,
      },
    });

    const exemptFileNames = parsedExemptFileNames
      ? await saveUploadExemptFileNames(parsedExemptFileNames)
      : await getUploadExemptFileNames();

    console.info("ADMIN_BYPASS_SAVE", JSON.stringify({
      actor: (req as any).user?.id ?? "unknown",
      persistedExemptFileNames: exemptFileNames,
      count: exemptFileNames.length,
    }));

    await syncConfiguredPlanPrices(updated);

    const saved = await prisma.billingSettings.findUnique({ where: { id: updated.id } });

    console.info("[BillingSettings] save committed", {
      id: saved?.id ?? updated.id,
      updatedAt: (saved?.updatedAt ?? updated.updatedAt).toISOString(),
      jazzcashNumber: saved?.jazzcashNumber ?? updated.jazzcashNumber,
      jazzcashTitle: saved?.jazzcashTitle ?? updated.jazzcashTitle,
      easypaisaNumber: saved?.easypaisaNumber ?? updated.easypaisaNumber,
      easypaisaTitle: saved?.easypaisaTitle ?? updated.easypaisaTitle,
      bankName: saved?.bankName ?? updated.bankName,
      bankTitle: saved?.bankTitle ?? updated.bankTitle,
      bankAccountNumber: saved?.bankAccountNumber ?? updated.bankAccountNumber,
      bankIban: saved?.bankIban ?? updated.bankIban,
      jazzcashQrPath: saved?.jazzcashQrPath ?? updated.jazzcashQrPath,
      easypaisaQrPath: saved?.easypaisaQrPath ?? updated.easypaisaQrPath,
      bankQrPath: saved?.bankQrPath ?? updated.bankQrPath,
      standardPrice: saved?.standardPrice ?? updated.standardPrice,
      businessPrice: saved?.businessPrice ?? updated.businessPrice,
    });

    const jazzcashQrExists = Boolean(updated.jazzcashQrPath && fs.existsSync(resolveStoredPath(updated.jazzcashQrPath)));
    const easypaisaQrExists = Boolean(updated.easypaisaQrPath && fs.existsSync(resolveStoredPath(updated.easypaisaQrPath)));
    const bankQrExists = Boolean(updated.bankQrPath && fs.existsSync(resolveStoredPath(updated.bankQrPath)));

    res.json({
      settings: {
        ...updated,
        exemptFileNames,
        jazzcashQrUrl: jazzcashQrExists ? buildAbsoluteApiUrl(req, "/api/manual-payments/wallet-qr/jazzcash") : null,
        easypaisaQrUrl: easypaisaQrExists ? buildAbsoluteApiUrl(req, "/api/manual-payments/wallet-qr/easypaisa") : null,
        bankQrUrl: bankQrExists ? buildAbsoluteApiUrl(req, "/api/manual-payments/wallet-qr/bank-transfer") : null,
      },
    });
  },
);

adminRouter.get("/usage", async (req, res) => {
  const month = z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional()
    .parse(req.query.month);
  const m = month ?? monthKeyUTC();
  const search = String(req.query.search ?? "").trim();
  const from = toDateOrNull(req.query.from, false);
  const to = toDateOrNull(req.query.to, true);
  const page = toPositiveInt(req.query.page, 1, 5000);
  const pageSize = toPositiveInt(req.query.pageSize, 50, 200);
  const usage = await prisma.usageMonthly.findMany({
    where: {
      month: m,
      ...(search
        ? {
            OR: [
              { user: { email: { contains: search, mode: "insensitive" } } },
              { user: { companyName: { contains: search, mode: "insensitive" } } },
            ],
          }
        : {}),
      ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    },
    include: { user: { select: { id: true, email: true } } },
    orderBy: { labelsGenerated: "desc" },
    skip: (page - 1) * pageSize,
    take: pageSize,
  });
  res.json({ month: m, page, pageSize, usage });
});

adminRouter.post("/plans/seed", async (_req, res) => {
  await ensurePlanManagementColumns();
  const settings = await getOrCreateBillingSettings();
  const defaults = [
    { name: "Free Plan", priceCents: 0, monthlyLabelLimit: 250, monthlyTrackingLimit: 250 },
    { name: "Standard Plan", priceCents: settings.standardPrice, monthlyLabelLimit: 1000, monthlyTrackingLimit: 1000 },
    { name: "Business Plan", priceCents: settings.businessPrice, monthlyLabelLimit: 3000, monthlyTrackingLimit: 3000 },
  ] as const;
  const plans = [];
  for (const plan of defaults) {
    const existing = await prisma.plan.findFirst({ where: { name: plan.name } });
    if (existing) {
      const updated = await prisma.plan.update({
        where: { id: existing.id },
        data: {
          priceCents: plan.priceCents,
          monthlyLabelLimit: plan.monthlyLabelLimit,
          monthlyTrackingLimit: plan.monthlyTrackingLimit,
        },
      });
      await prisma.$executeRaw`
        UPDATE "Plan"
        SET full_price_cents = ${plan.priceCents},
            discount_price_cents = ${plan.priceCents},
            is_suspended = FALSE,
            units_included = ${plan.monthlyLabelLimit},
            labels_included = ${plan.monthlyLabelLimit},
            tracking_included = ${plan.monthlyTrackingLimit},
            money_orders_included = ${plan.monthlyLabelLimit},
            complaints_included = ${plan.name === "Free Plan" ? 5 : plan.name === "Business Plan" ? 300 : 150},
            daily_complaint_limit = ${plan.name === "Free Plan" ? 1 : plan.name === "Business Plan" ? 10 : 5},
            monthly_complaint_limit = ${plan.name === "Free Plan" ? 5 : plan.name === "Business Plan" ? 300 : 150}
        WHERE id = ${updated.id}
      `;
      plans.push(updated);
      continue;
    }
    const created = await prisma.plan.create({ data: plan });
    await prisma.$executeRaw`
      UPDATE "Plan"
      SET full_price_cents = ${plan.priceCents},
          discount_price_cents = ${plan.priceCents},
          is_suspended = FALSE,
          units_included = ${plan.monthlyLabelLimit},
          labels_included = ${plan.monthlyLabelLimit},
          tracking_included = ${plan.monthlyTrackingLimit},
          money_orders_included = ${plan.monthlyLabelLimit},
          complaints_included = ${plan.name === "Free Plan" ? 5 : plan.name === "Business Plan" ? 300 : 150},
          daily_complaint_limit = ${plan.name === "Free Plan" ? 1 : plan.name === "Business Plan" ? 10 : 5},
          monthly_complaint_limit = ${plan.name === "Free Plan" ? 5 : plan.name === "Business Plan" ? 300 : 150}
      WHERE id = ${created.id}
    `;
    plans.push(created);
  }
  res.json({ plans });
});

/* ── Admin: Jobs management ── */

adminRouter.get("/jobs", async (req, res) => {
  const page = toPositiveInt(req.query.page, 1, 5000);
  const pageSize = toPositiveInt(req.query.pageSize ?? req.query.limit, 50, 100);
  const search = String(req.query.search ?? "").trim();
  const status = String(req.query.status ?? "").trim().toUpperCase();
  const from = toDateOrNull(req.query.from, false);
  const to = toDateOrNull(req.query.to, true);
  const sortBy = String(req.query.sortBy ?? "createdAt").trim();
  const sortOrder = normalizeSortOrder(req.query.sortOrder);
  const sortKey = ["createdAt", "updatedAt", "status"].includes(sortBy) ? sortBy : "createdAt";
  const where: any = {
    ...(status ? { status } : {}),
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    ...(search
      ? {
          OR: [
            { id: { contains: search, mode: "insensitive" } },
            { error: { contains: search, mode: "insensitive" } },
            { user: { email: { contains: search, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const [total, jobs] = await Promise.all([
    prisma.labelJob.count({ where }),
    prisma.labelJob.findMany({
      where,
      orderBy: { [sortKey]: sortOrder } as any,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { user: { select: { id: true, email: true } } },
    }),
  ]);
  res.json({ total, page, pageSize, jobs });
});

adminRouter.patch("/jobs/:jobId/status", async (req, res) => {
  const body = z.object({ status: z.enum(["QUEUED", "PROCESSING", "FAILED", "COMPLETED", "ARCHIVED", "CANCELED"]) }).parse(req.body ?? {});
  const job = await prisma.labelJob.findUnique({ where: { id: req.params.jobId } });
  if (!job) return res.status(404).json({ error: "Job not found" });

  const nextStatus = body.status === "CANCELED" ? "FAILED" : body.status === "ARCHIVED" ? "COMPLETED" : body.status;
  const updated = await prisma.labelJob.update({
    where: { id: job.id },
    data: {
      status: nextStatus as any,
      error: body.status === "CANCELED" ? "Cancelled by admin" : job.error,
    },
  });
  res.json({ job: updated });
});

adminRouter.post("/jobs/:jobId/retry", async (req, res) => {
  const job = await prisma.labelJob.findUnique({ where: { id: req.params.jobId } });
  if (!job) return res.status(404).json({ error: "Job not found" });
  if (job.status !== "FAILED") return res.status(409).json({ error: "Only failed jobs can be retried" });

  const updated = await prisma.labelJob.update({
    where: { id: job.id },
    data: { status: "QUEUED", error: null },
  });

  await logComplaintAudit({
    actorEmail: String((req as any).user?.email ?? "system").trim() || "system",
    action: "complaint_updated",
    trackingId: job.id,
    details: "admin_retry_label_job",
  });

  res.json({ success: true, job: updated });
});

adminRouter.post("/jobs/:jobId/cancel", async (req, res) => {
  const job = await prisma.labelJob.findUnique({ where: { id: req.params.jobId } });
  if (!job) return res.status(404).json({ error: "Job not found" });
  if (job.status === "COMPLETED" || job.status === "FAILED") {
    return res.status(409).json({ error: "Cannot cancel a finished job" });
  }
  // Remove from BullMQ if still enqueued
  try {
    const bullJob = await labelQueue.getJob(job.id);
    if (bullJob) await bullJob.remove();
  } catch {
    // ignore if already gone
  }
  const updated = await prisma.labelJob.update({
    where: { id: job.id },
    data: { status: "FAILED", error: "Cancelled by admin" },
  });
  res.json({ job: updated });
});

adminRouter.patch("/jobs/:jobId/tracking", async (req, res) => {
  const body = z.object({ trackingNumber: z.string().min(1).max(80) }).parse(req.body);
  const job = await prisma.labelJob.findUnique({ where: { id: req.params.jobId } });
  if (!job) return res.status(404).json({ error: "Job not found" });
  // Store the override tracking number on the job record for reference
  const updated = await prisma.labelJob.update({
    where: { id: job.id },
    data: { error: `tracking_override:${body.trackingNumber}` },
  });
  res.json({ job: updated, trackingNumber: body.trackingNumber });
});

/* ── Admin: Shipments management ── */

adminRouter.get("/shipments", async (req, res) => {
  const page = toPositiveInt(req.query.page, 1, 5000);
  const pageSize = toPositiveInt(req.query.pageSize ?? req.query.limit, 50, 100);
  const search = String(req.query.search ?? "").trim();
  const status = String(req.query.status ?? "").trim();
  const from = toDateOrNull(req.query.from, false);
  const to = toDateOrNull(req.query.to, true);
  const sortBy = String(req.query.sortBy ?? "updatedAt").trim();
  const sortOrder = normalizeSortOrder(req.query.sortOrder);
  const sortKey = ["updatedAt", "createdAt", "status", "trackingNumber"].includes(sortBy) ? sortBy : "updatedAt";
  const where: any = {
    ...(status ? { status: { contains: status, mode: "insensitive" } } : {}),
    ...(from || to ? { updatedAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    ...(search
      ? {
          OR: [
            { trackingNumber: { contains: search, mode: "insensitive" } },
            { city: { contains: search, mode: "insensitive" } },
            { status: { contains: search, mode: "insensitive" } },
            { user: { email: { contains: search, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const [total, shipments] = await Promise.all([
    prisma.shipment.count({ where }),
    prisma.shipment.findMany({
      where,
      orderBy: { [sortKey]: sortOrder } as any,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { user: { select: { id: true, email: true } } },
    }),
  ]);
  res.json({ total, page, pageSize, shipments });
});

adminRouter.patch("/payments/:paymentId/status", async (req, res) => {
  const body = z.object({ status: z.enum(["PENDING", "APPROVED", "REJECTED", "PAID", "FAILED"]) }).parse(req.body ?? {});
  const manual = await prisma.manualPaymentRequest.findUnique({ where: { id: req.params.paymentId } });
  if (manual) {
    const updated = await prisma.manualPaymentRequest.update({
      where: { id: manual.id },
      data: {
        status: body.status as any,
        verifiedBy: String((req as any).user?.email ?? "admin"),
        verifiedAt: new Date(),
      },
    });
    return res.json({ payment: updated, source: "manual" });
  }

  const payment = await prisma.payment.findUnique({ where: { id: req.params.paymentId } });
  if (!payment) return res.status(404).json({ error: "Payment not found" });

  const updated = await prisma.payment.update({
    where: { id: payment.id },
    data: { status: body.status as any },
  });
  return res.json({ payment: updated, source: "gateway" });
});

adminRouter.post("/complaints/:trackingId/sync", async (req, res) => {
  const trackingId = String(req.params.trackingId ?? "").trim();
  if (!trackingId) return res.status(400).json({ error: "Tracking id is required" });

  const actorEmail = String((req as any).user?.email ?? "system").trim() || "system";
  const result = await runComplaintSyncJob({ trackingIds: [trackingId], actorEmail });
  return res.json({ success: true, count: result.length, result });
});

adminRouter.patch("/shipments/:shipmentId", async (req, res) => {
  const body = z
    .object({
      shipmentType: z.enum(["RGL", "IRL", "UMS", "VPL", "VPP", "PAR", "COD", "COURIER", "RL"]).nullable().optional(),
      status: z.string().min(1).max(60).nullable().optional(),
      city: z.string().min(1).max(80).nullable().optional(),
      latestDate: z.string().min(1).max(40).nullable().optional(),
      latestTime: z.string().min(1).max(40).nullable().optional(),
      daysPassed: z.number().int().nonnegative().nullable().optional(),
      complaintStatus: z.string().min(1).max(40).nullable().optional(),
      complaintText: z.string().max(5000).nullable().optional(),
      adminCode: z.string().max(120).nullable().optional(),
    })
    .parse(req.body);

  const shipment = await prisma.shipment.update({
    where: { id: req.params.shipmentId },
    data: body,
  });
  res.json({ shipment });
});

/* ── Admin: Refund requests management ── */

adminRouter.get("/refund-requests", async (_req, res) => {
  const refundRequests = await prisma.refundRequest.findMany({
    orderBy: { createdAt: "desc" },
    include: { user: { select: { email: true } } },
  });
  res.json({ refundRequests });
});

adminRouter.post("/refund-requests/:id/approve", async (req, res) => {
  const refundRequest = await prisma.refundRequest.findUnique({
    where: { id: req.params.id },
  });
  if (!refundRequest) return res.status(404).json({ error: "Refund request not found" });
  if (refundRequest.status !== "PENDING") {
    return res.status(409).json({ error: "Refund request already processed" });
  }

  // Update the refund request status
  const updated = await prisma.refundRequest.update({
    where: { id: req.params.id },
    data: { status: "APPROVED" },
  });

  // Refund the units by updating usage
  const month = monthKeyUTC();
  await prisma.usageMonthly.upsert({
    where: { userId_month: { userId: refundRequest.userId, month } },
    create: {
      userId: refundRequest.userId,
      month,
      labelsGenerated: 0,
      labelsQueued: -refundRequest.units, // Negative to refund
      trackingGenerated: 0,
      trackingQueued: 0,
    },
    update: {
      labelsQueued: { decrement: refundRequest.units },
      trackingQueued: { decrement: refundRequest.units },
    },
  });

  res.json({ refundRequest: updated });
});

adminRouter.post("/refund-requests/:id/reject", async (req, res) => {
  const refundRequest = await prisma.refundRequest.findUnique({
    where: { id: req.params.id },
  });
  if (!refundRequest) return res.status(404).json({ error: "Refund request not found" });
  if (refundRequest.status !== "PENDING") {
    return res.status(409).json({ error: "Refund request already processed" });
  }

  const updated = await prisma.refundRequest.update({
    where: { id: req.params.id },
    data: { status: "REJECTED" },
  });

  res.json({ refundRequest: updated });
});

/* ── Admin: Manual wallet payment queue ── */

adminRouter.get("/manual-payments", adminListManualPayments);
adminRouter.post("/manual-payments/:id/approve", adminApproveManualPayment);
adminRouter.post("/manual-payments/:id/reject", adminRejectManualPayment);
adminRouter.post("/payments/:id/approve", adminApproveManualPayment);
adminRouter.post("/payments/:id/reject", adminRejectManualPayment);

/* ── Admin: Invoice list ── */

adminRouter.get("/invoices", async (req, res) => {
  const page = toPositiveInt(req.query.page, 1, 5000);
  const pageSize = toPositiveInt(req.query.pageSize, 50, 200);
  const status = typeof req.query.status === "string" ? req.query.status.trim() : "";
  const search = String(req.query.search ?? "").trim();
  const from = toDateOrNull(req.query.from, false);
  const to = toDateOrNull(req.query.to, true);
  const sortBy = String(req.query.sortBy ?? "createdAt").trim();
  const sortOrder = normalizeSortOrder(req.query.sortOrder);
  const sortKey = ["createdAt", "issuedAt", "amountCents", "status"].includes(sortBy) ? sortBy : "createdAt";
  const where: any = {
    ...(status ? { status } : {}),
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    ...(search
      ? {
          OR: [
            { invoiceNumber: { contains: search, mode: "insensitive" } },
            { user: { email: { contains: search, mode: "insensitive" } } },
            { user: { companyName: { contains: search, mode: "insensitive" } } },
            { plan: { name: { contains: search, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const invoices = await prisma.invoice.findMany({
    where,
    include: {
      user: { select: { id: true, email: true, companyName: true } },
      plan: { select: { id: true, name: true } },
      manualPayments: {
        select: { id: true, status: true, transactionId: true, paymentMethod: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 5,
      },
    },
    orderBy: { [sortKey]: sortOrder } as any,
    skip: (page - 1) * pageSize,
    take: pageSize,
  });
  return res.json({ page, pageSize, invoices });
});

adminRouter.patch("/invoices/:invoiceId", async (req, res) => {
  const body = z.object({ status: z.enum(["OPEN", "PAID", "VOID", "CANCELED"]) }).parse(req.body ?? {});
  const invoiceId = String(req.params.invoiceId ?? "").trim();
  if (!invoiceId) return res.status(400).json({ error: "Missing invoice id" });

  const existing = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!existing) return res.status(404).json({ error: "Invoice not found" });

  const updated = await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      status: body.status,
      paidAt: body.status === "PAID" ? new Date() : null,
    },
  });

  await logComplaintAudit({
    actorEmail: String((req as any).user?.email ?? "system").trim() || "system",
    action: "complaint_updated",
    trackingId: invoiceId,
    details: `admin_invoice_status:${body.status}`,
  });

  return res.json({ invoice: updated });
});

adminRouter.delete("/invoices/:invoiceId", async (req, res) => {
  const invoiceId = String(req.params.invoiceId ?? "").trim();
  if (!invoiceId) return res.status(400).json({ error: "Missing invoice id" });

  const existing = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { manualPayments: { select: { id: true, status: true } } },
  });
  if (!existing) return res.status(404).json({ error: "Invoice not found" });

  const hasApprovedPayments = existing.manualPayments.some((payment) => payment.status === "APPROVED");
  if (hasApprovedPayments || existing.status === "PAID") {
    return res.status(409).json({ error: "Paid invoices cannot be deleted. Use VOID/CANCELED status instead." });
  }

  await prisma.invoice.delete({ where: { id: invoiceId } });

  await logComplaintAudit({
    actorEmail: String((req as any).user?.email ?? "system").trim() || "system",
    action: "complaint_updated",
    trackingId: invoiceId,
    details: "admin_invoice_deleted",
  });

  return res.json({ success: true });
});

adminRouter.get("/invoices/:invoiceId/download", async (req, res) => {
  const invoiceId = String(req.params.invoiceId ?? "").trim();
  if (!invoiceId) return res.status(400).json({ error: "Missing invoice id" });

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      user: { select: { email: true, companyName: true } },
      plan: { select: { name: true } },
      manualPayments: {
        select: { transactionId: true, paymentMethod: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  if (!invoice) return res.status(404).json({ error: "Invoice not found" });

  const latestPayment = invoice.manualPayments[0] ?? null;
  const customerName = String(invoice.user.companyName ?? invoice.user.email ?? "-").trim() || "-";
  const paymentMethod = String(latestPayment?.paymentMethod ?? "-").trim() || "-";
  const transactionId = String(latestPayment?.transactionId ?? "-").trim() || "-";
  const amount = (invoice.amountCents / 100).toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const status = String(invoice.status ?? "-").trim() || "-";
  const dateText = new Date(invoice.issuedAt ?? invoice.createdAt).toLocaleDateString("en-PK");

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const left = 50;
  let y = 790;

  page.drawText("Invoice", { x: left, y, size: 24, font: bold, color: rgb(0.12, 0.12, 0.12) });
  y -= 40;

  const rows: Array<[string, string]> = [
    ["Invoice ID", invoice.invoiceNumber],
    ["Customer Name", customerName],
    ["Plan Name", String(invoice.plan.name ?? "-")],
    ["Amount", `Rs. ${amount}`],
    ["Payment Method", paymentMethod],
    ["Transaction ID", transactionId],
    ["Status", status],
    ["Date", dateText],
  ];

  for (const [label, value] of rows) {
    page.drawText(`${label}:`, { x: left, y, size: 12, font: bold, color: rgb(0.2, 0.2, 0.2) });
    page.drawText(String(value || "-"), { x: left + 140, y, size: 12, font, color: rgb(0.25, 0.25, 0.25) });
    y -= 28;
  }

  page.drawText(PRINT_MARKETING_LINE, {
    x: left,
    y: 26,
    size: 9,
    font,
    color: rgb(0.35, 0.35, 0.35),
  });

  const pdfBytes = await pdf.save();
  const invoiceNo = String(invoice.invoiceNumber ?? invoice.id).trim() || invoice.id;
  const fileName = `Invoice-${invoiceNo}.pdf`;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", buildPdfAttachmentHeader(fileName));
  return res.send(Buffer.from(pdfBytes));
});
