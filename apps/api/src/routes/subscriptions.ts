import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import {
  buildBillingRedirectUrl,
  buildHostedCheckoutUrl,
  createSubscriptionPaymentIntent,
  ensureBillingTables,
  getPaymentForUser,
  mapOutcomeToStatus,
  processEpGatewayNotification,
  renderHostedCheckoutPage,
  signEpGatewayPayload,
} from "../services/epGatewayBilling.service.js";

export const subscriptionsRouter = Router();

const startSchema = z.object({ planId: z.string().uuid() });

function buildFreePlanWindow(planName: string) {
  const now = new Date();
  const end = new Date(now);
  if (planName.toLowerCase().includes("free")) {
    end.setUTCDate(end.getUTCDate() + 15);
  } else {
    end.setUTCMonth(end.getUTCMonth() + 1);
  }
  return { now, end };
}

subscriptionsRouter.post("/start", requireAuth, async (req: AuthedRequest, res) => {
  const userId = req.user!.id;
  const body = startSchema.parse(req.body);

  await ensureBillingTables();

  const plan = await prisma.plan.findUnique({ where: { id: body.planId } });
  if (!plan) return res.status(404).json({ error: "Plan not found" });

  if (plan.priceCents <= 0) {
    const { now, end } = buildFreePlanWindow(plan.name);
    await prisma.subscription.updateMany({ where: { userId, status: "ACTIVE" }, data: { status: "CANCELED" } });
    const sub = await prisma.subscription.create({
      data: { userId, planId: plan.id, status: "ACTIVE", currentPeriodStart: now, currentPeriodEnd: end },
      include: { plan: true },
    });
    return res.json({ subscription: sub, requiresRedirect: false });
  }

  const intent = await createSubscriptionPaymentIntent(userId, plan.id);
  if (!intent.pendingPayment || !intent.invoice || !intent.checkoutUrl) {
    return res.status(500).json({ error: "Failed to create payment intent" });
  }

  return res.json({
    requiresRedirect: true,
    checkoutUrl: intent.checkoutUrl,
    payment: {
      id: intent.pendingPayment.id,
      reference: intent.pendingPayment.reference,
      kind: intent.pendingPayment.kind,
      status: intent.pendingPayment.status,
      amountCents: intent.pendingPayment.amountCents,
      currency: intent.pendingPayment.currency,
    },
    invoice: {
      id: intent.invoice.id,
      invoiceNumber: intent.invoice.invoiceNumber,
      status: intent.invoice.status,
      amountCents: intent.invoice.amountCents,
      currency: intent.invoice.currency,
    },
  });
});

subscriptionsRouter.get("/checkout/:reference", async (req, res) => {
  await ensureBillingTables();
  const reference = String(req.params.reference ?? "").trim();
  const token = String(req.query.token ?? "").trim();
  const payment = await prisma.payment.findUnique({ where: { reference }, include: { plan: true } });
  if (!payment || payment.status !== "PENDING") {
    return res.status(404).send("Payment session not found");
  }
  if (payment.checkoutToken !== token) {
    return res.status(401).send("Invalid payment token");
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.send(renderHostedCheckoutPage(payment));
});

subscriptionsRouter.post("/checkout/:reference/complete", async (req, res) => {
  await ensureBillingTables();
  const reference = String(req.params.reference ?? "").trim();
  const outcome = z.enum(["success", "failed", "canceled"]).parse(req.query.outcome);
  const token = String(req.query.token ?? "").trim();
  const payment = await prisma.payment.findUnique({ where: { reference } });
  if (!payment) return res.status(404).send("Payment not found");
  if (payment.checkoutToken !== token) return res.status(401).send("Invalid payment token");

  const status = mapOutcomeToStatus(outcome);
  const timestamp = new Date().toISOString();
  const payload = {
    reference,
    status,
    transactionId: payment.gatewayTransactionId ?? `TX-${randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase()}`,
    amountCents: payment.amountCents,
    timestamp,
  };
  const signature = signEpGatewayPayload(payload);

  await processEpGatewayNotification({
    ...payload,
    source: "WEBHOOK",
    signature,
    rawPayload: { provider: "EP_GATEWAY", trigger: "mock-checkout" },
    failureReason: outcome === "success" ? null : outcome,
  });

  const callbackUrl = `/api/subscriptions/callback?reference=${encodeURIComponent(reference)}&status=${encodeURIComponent(status)}&transactionId=${encodeURIComponent(payload.transactionId)}&amountCents=${encodeURIComponent(String(payment.amountCents))}&timestamp=${encodeURIComponent(timestamp)}&signature=${encodeURIComponent(signature)}`;
  return res.redirect(302, callbackUrl);
});

subscriptionsRouter.get("/callback", async (req, res) => {
  try {
    const payload = z.object({
      reference: z.string().min(1),
      status: z.string().min(1),
      transactionId: z.string().min(1),
      amountCents: z.coerce.number().int().nonnegative(),
      timestamp: z.string().min(1),
      signature: z.string().min(1),
    }).parse(req.query);

    const result = await processEpGatewayNotification({
      ...payload,
      source: "CALLBACK",
      signature: payload.signature,
      rawPayload: { provider: "EP_GATEWAY", channel: "callback" },
      failureReason: payload.status === "SUCCEEDED" ? null : payload.status,
    });

    return res.redirect(302, buildBillingRedirectUrl(result.payment.status, result.payment.reference));
  } catch {
    return res.redirect(302, buildBillingRedirectUrl("FAILED", String(req.query.reference ?? "unknown")));
  }
});

subscriptionsRouter.post("/webhook", async (req, res) => {
  const body = z.object({
    reference: z.string().min(1),
    status: z.string().min(1),
    transactionId: z.string().min(1),
    amountCents: z.coerce.number().int().nonnegative(),
    timestamp: z.string().min(1),
    eventId: z.string().optional(),
  }).parse(req.body ?? {});

  const signature = String(req.header("x-ep-signature") ?? req.body?.signature ?? "").trim();
  const result = await processEpGatewayNotification({
    ...body,
    source: "WEBHOOK",
    signature,
    eventId: body.eventId,
    rawPayload: req.body ?? {},
    failureReason: body.status === "SUCCEEDED" ? null : body.status,
  });

  return res.json({
    success: true,
    duplicate: result.duplicate,
    replayPrevented: result.replayPrevented,
    payment: {
      reference: result.payment.reference,
      status: result.payment.status,
      verifiedAt: result.payment.verifiedAt,
    },
  });
});

subscriptionsRouter.get("/payments/:reference/verify", requireAuth, async (req: AuthedRequest, res) => {
  const payment = await getPaymentForUser(req.user!.id, String(req.params.reference ?? "").trim());
  if (!payment) return res.status(404).json({ error: "Payment not found" });

  return res.json({
    payment: {
      id: payment.id,
      reference: payment.reference,
      provider: payment.provider,
      kind: payment.kind,
      status: payment.status,
      amountCents: payment.amountCents,
      currency: payment.currency,
      verifiedAt: payment.verifiedAt,
      paidAt: payment.paidAt,
      gatewayTransactionId: payment.gatewayTransactionId,
      checkoutUrl: payment.status === "PENDING" ? buildHostedCheckoutUrl(payment.reference, payment.checkoutToken) : null,
    },
    invoice: payment.invoice,
    subscription: payment.subscription,
    events: payment.events.map((event) => ({
      eventId: event.eventId,
      source: event.source,
      status: event.status,
      createdAt: event.createdAt,
    })),
  });
});
