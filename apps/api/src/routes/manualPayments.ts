import path from "node:path";
import fs from "node:fs";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { resolveStoredPath, storageRoot } from "../storage/paths.js";
import { getOrCreateBillingSettings, resolveConfiguredPlanPrice } from "../services/billing-settings.service.js";

export const manualPaymentsRouter = Router();

// ── screenshot upload storage ────────────────────────────────────────────────
const screenshotsDir = path.join(storageRoot(), "manual-payment-screenshots");
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

const upload = multer({
  dest: screenshotsDir,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter(_req, file, cb) {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed for screenshots"));
    }
  },
});

// ── schema validation ─────────────────────────────────────────────────────────
const submitSchema = z.object({
  planId: z.string().uuid(),
  paymentMethod: z.enum(["JAZZCASH", "EASYPAISA"]),
  transactionId: z.string().min(4).max(100),
});

// ── POST /api/manual-payments ─ Submit a manual payment request ───────────────
manualPaymentsRouter.post(
  "/",
  requireAuth,
  upload.single("screenshot"),
  async (req: AuthedRequest, res) => {
    try {
      const userId = req.user!.id;

      const body = submitSchema.parse(req.body);
      const screenshotPath = req.file ? req.file.path : null;

      const plan = await prisma.plan.findUnique({ where: { id: body.planId } });
      if (!plan) {
        return res.status(404).json({ error: "Plan not found" });
      }
      const settings = await getOrCreateBillingSettings();
      const effectiveAmountCents = resolveConfiguredPlanPrice(plan.name, plan.priceCents, settings);
      if (effectiveAmountCents <= 0) {
        return res.status(400).json({ error: "Manual payment is only for paid plans" });
      }

      // Reject if user already has a pending request for the same plan
      const existing = await prisma.manualPaymentRequest.findFirst({
        where: { userId, planId: body.planId, status: "PENDING" },
      });
      if (existing) {
        return res.status(409).json({
          error: "You already have a pending payment request for this plan. Please wait for admin review.",
        });
      }

      const request = await prisma.manualPaymentRequest.create({
        data: {
          userId,
          planId: body.planId,
          paymentMethod: body.paymentMethod,
          transactionId: body.transactionId,
          screenshotPath,
          amountCents: effectiveAmountCents,
          status: "PENDING",
        },
        include: { plan: { select: { id: true, name: true, priceCents: true } } },
      });

      return res.status(201).json({
        request: {
          id: request.id,
          status: request.status,
          paymentMethod: request.paymentMethod,
          transactionId: request.transactionId,
          amountCents: request.amountCents,
          currency: request.currency,
          plan: request.plan,
          createdAt: request.createdAt,
        },
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: err.errors });
      }
      console.error("[ManualPayment] submit error", err);
      return res.status(500).json({ error: "Failed to submit payment request" });
    }
  },
);

// ── GET /api/manual-payments/my ─ My payment requests ────────────────────────
manualPaymentsRouter.get("/my", requireAuth, async (req: AuthedRequest, res) => {
  const userId = req.user!.id;
  const requests = await prisma.manualPaymentRequest.findMany({
    where: { userId },
    include: { plan: { select: { id: true, name: true, priceCents: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return res.json({ requests });
});

// ── GET /api/manual-payments/wallet-info ─ Merchant display info ──────────────
manualPaymentsRouter.get("/wallet-info", async (_req, res) => {
  const settings = await getOrCreateBillingSettings();
  return res.json({
    jazzcash: {
      accountNumber: settings.jazzcashNumber,
      accountTitle: settings.jazzcashTitle,
      qrUrl: settings.jazzcashQrPath ? "/api/manual-payments/wallet-qr/jazzcash" : null,
    },
    easypaisa: {
      accountNumber: settings.easypaisaNumber,
      accountTitle: settings.easypaisaTitle,
      qrUrl: settings.easypaisaQrPath ? "/api/manual-payments/wallet-qr/easypaisa" : null,
    },
  });
});

manualPaymentsRouter.get("/wallet-qr/:method", async (req, res) => {
  const method = String(req.params.method ?? "").trim().toLowerCase();
  if (method !== "jazzcash" && method !== "easypaisa") {
    return res.status(404).json({ error: "Wallet method not found" });
  }

  const settings = await getOrCreateBillingSettings();
  const storedPath = method === "jazzcash" ? settings.jazzcashQrPath : settings.easypaisaQrPath;
  if (!storedPath) {
    return res.status(404).json({ error: "QR not configured" });
  }

  const absPath = resolveStoredPath(storedPath);
  if (!fs.existsSync(absPath)) {
    return res.status(404).json({ error: "QR file missing" });
  }

  return res.sendFile(absPath);
});

// ── ADMIN routes (mounted separately in admin.ts) ────────────────────────────
// These are exported for composing inside the admin router.

export async function adminListManualPayments(req: any, res: any) {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const where = status ? { status } : {};
  const requests = await prisma.manualPaymentRequest.findMany({
    where,
    include: {
      plan: { select: { id: true, name: true, priceCents: true } },
      user: { select: { id: true, email: true, companyName: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return res.json({ requests });
}

export async function adminApproveManualPayment(req: AuthedRequest, res: any) {
  const id = String(req.params.id ?? "").trim();
  if (!id) return res.status(400).json({ error: "Missing id" });

  const payment = await prisma.manualPaymentRequest.findUnique({
    where: { id },
    include: { plan: true },
  });
  if (!payment) return res.status(404).json({ error: "Payment request not found" });
  if (payment.status !== "PENDING") {
    return res.status(409).json({ error: `Payment is already ${payment.status}` });
  }

  const adminEmail = req.user?.id ?? "admin";

  // Activate subscription (does not touch existing billing lifecycle)
  const now = new Date();
  const periodEnd = new Date(now);
  if (payment.plan.name.toLowerCase().includes("free")) {
    periodEnd.setUTCDate(periodEnd.getUTCDate() + 15);
  } else {
    periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);
  }

  await prisma.$transaction(async (tx) => {
    // Cancel existing active subscriptions
    await tx.subscription.updateMany({
      where: { userId: payment.userId, status: "ACTIVE" },
      data: { status: "CANCELED" },
    });

    // Create new subscription
    await tx.subscription.create({
      data: {
        userId: payment.userId,
        planId: payment.planId,
        status: "ACTIVE",
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
      },
    });

    // Mark payment approved
    await tx.manualPaymentRequest.update({
      where: { id },
      data: {
        status: "APPROVED",
        verifiedBy: adminEmail,
        verifiedAt: now,
      },
    });
  });

  return res.json({ success: true, message: "Payment approved and subscription activated" });
}

export async function adminRejectManualPayment(req: AuthedRequest, res: any) {
  const id = String(req.params.id ?? "").trim();
  if (!id) return res.status(400).json({ error: "Missing id" });

  const body = z.object({ notes: z.string().max(500).optional() }).parse(req.body ?? {});

  const payment = await prisma.manualPaymentRequest.findUnique({ where: { id } });
  if (!payment) return res.status(404).json({ error: "Payment request not found" });
  if (payment.status !== "PENDING") {
    return res.status(409).json({ error: `Payment is already ${payment.status}` });
  }

  const adminEmail = req.user?.id ?? "admin";
  const now = new Date();

  await prisma.manualPaymentRequest.update({
    where: { id },
    data: {
      status: "REJECTED",
      verifiedBy: adminEmail,
      verifiedAt: now,
      notes: body.notes ?? null,
    },
  });

  return res.json({ success: true, message: "Payment request rejected" });
}
