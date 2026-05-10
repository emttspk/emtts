import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { z } from "zod";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { monthKeyUTC } from "../usage/month.js";
import { env } from "../config.js";
import { labelQueue } from "../queue/queue.js";
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
  const usage = await prisma.usageMonthly.findMany({
    where: { month: m },
    include: { user: { select: { id: true, email: true } } },
    orderBy: { labelsGenerated: "desc" },
  });
  res.json({ month: m, usage });
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
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 50)));
  const [total, jobs] = await Promise.all([
    prisma.labelJob.count(),
    prisma.labelJob.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: { user: { select: { id: true, email: true } } },
    }),
  ]);
  res.json({ total, page, limit, jobs });
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
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 50)));
  const [total, shipments] = await Promise.all([
    prisma.shipment.count(),
    prisma.shipment.findMany({
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: { user: { select: { id: true, email: true } } },
    }),
  ]);
  res.json({ total, page, limit, shipments });
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

/* ── Admin: Invoice list ── */

adminRouter.get("/invoices", async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const where = status ? { status } : {};
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
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return res.json({ invoices });
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
