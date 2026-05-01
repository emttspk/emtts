import { Router } from "express";
import { z } from "zod";
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

export const adminRouter = Router();

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
  return res.json({ success: true, circuit, queue });
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
  const plans = await prisma.plan.findMany({ orderBy: { createdAt: "desc" } });
  res.json({ plans });
});

adminRouter.post("/plans", async (req, res) => {
  const body = z
    .object({
      name: z.string().min(1),
      priceCents: z.number().int().nonnegative(),
      monthlyLabelLimit: z.number().int().positive(),
      monthlyTrackingLimit: z.number().int().positive(),
    })
    .parse(req.body);

  const plan = await prisma.plan.create({ data: body as any });
  res.json({ plan });
});

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
  const defaults = [
    { name: "Free Plan", priceCents: 0, monthlyLabelLimit: 250, monthlyTrackingLimit: 250 },
    { name: "Business Plan", priceCents: 250000, monthlyLabelLimit: 2000, monthlyTrackingLimit: 2000 },
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
      plans.push(updated);
      continue;
    }
    const created = await prisma.plan.create({ data: plan });
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
      shipmentType: z.enum(["RL", "UMS", "VPL", "VPP", "PAR", "COD", "COURIER"]).nullable().optional(),
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
