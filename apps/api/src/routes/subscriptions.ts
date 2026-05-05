import { randomUUID } from "node:crypto";
import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { env } from "../config.js";
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
import {
  getMissingEasypaisaLiveCredentials,
  hasEasypaisaLiveCredentials,
  initiateEasypaisaPayment,
  inquireEasypaisaPayment,
  normalizeGatewayNotification,
} from "../services/easypaisaGateway.service.js";

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

  // PHASE 1: Gateway initiation disabled — invoice-linked manual wallet payment flow.
  // createSubscriptionPaymentIntent creates Invoice + Payment records in DB.
  // Gateway checkout URL is intentionally NOT used; kept dormant for future reactivation.
  const intent = await createSubscriptionPaymentIntent(userId, plan.id);
  if (!intent.pendingPayment || !intent.invoice) {
    return res.status(500).json({ error: "Failed to create invoice" });
  }

  return res.json({
    requiresManualPayment: true,
    requiresRedirect: false,
    invoice: {
      id: intent.invoice.id,
      invoiceNumber: intent.invoice.invoiceNumber,
      status: intent.invoice.status,
      amountCents: intent.invoice.amountCents,
      currency: intent.invoice.currency,
    },
    payment: {
      id: intent.pendingPayment.id,
      reference: intent.pendingPayment.reference,
      amountCents: intent.pendingPayment.amountCents,
      currency: intent.pendingPayment.currency,
    },
    plan: {
      id: plan.id,
      name: plan.name,
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

  if (!hasEasypaisaLiveCredentials()) {
    const missing = getMissingEasypaisaLiveCredentials();
    console.warn("[Easypaisa] Live credentials missing. Using hosted fallback checkout.", { missing });
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(renderHostedCheckoutPage(payment));
  }

  const apiOrigin = String(env.API_ORIGIN ?? "https://api.epost.pk").replace(/\/$/, "");
  const callbackUrl = `${apiOrigin}/api/subscriptions/callback`;
  const webhookUrl = `${apiOrigin}/api/subscriptions/webhook`;

  try {
    const initiated = await initiateEasypaisaPayment({
      reference: payment.reference,
      amountCents: payment.amountCents,
      callbackUrl,
      returnUrl: callbackUrl,
      successUrl: callbackUrl,
      failureUrl: callbackUrl,
      webhookUrl,
      description: `${payment.plan.name} subscription`,
    });

    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        gatewayTransactionId: initiated.gatewayTransactionId,
        metadata: {
          ...(payment.metadata as Record<string, unknown> | null ?? {}),
          gatewayInitiatedAt: new Date().toISOString(),
          gatewayRedirectUrl: initiated.redirectUrl,
          gatewayRequest: initiated.requestPayload,
          gatewayResponse: initiated.responsePayload,
        } as Prisma.InputJsonValue,
      },
    });

    return res.redirect(302, initiated.redirectUrl);
  } catch (error) {
    console.warn("[Easypaisa] Live initiation failed. Using hosted fallback checkout.", error);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(renderHostedCheckoutPage(payment));
  }
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
    rawPayload: { provider: "EP_GATEWAY", trigger: "hosted-fallback-checkout" },
    failureReason: outcome === "success" ? null : outcome,
  });

  const callbackUrl = `/api/subscriptions/callback?reference=${encodeURIComponent(reference)}&status=${encodeURIComponent(status)}&transactionId=${encodeURIComponent(payload.transactionId)}&amountCents=${encodeURIComponent(String(payment.amountCents))}&timestamp=${encodeURIComponent(timestamp)}&signature=${encodeURIComponent(signature)}`;
  return res.redirect(302, callbackUrl);
});

async function handleGatewayCallback(req: AuthedRequest | any, res: any) {
  try {
    const rawPayload = (req.method === "POST" ? req.body : req.query) as Record<string, unknown>;
    const normalized = normalizeGatewayNotification(rawPayload, String(rawPayload.reference ?? ""));

    if (!normalized.reference) {
      return res.redirect(302, buildBillingRedirectUrl("FAILED", "unknown"));
    }
    if (!normalized.signatureVerified) {
      return res.redirect(302, buildBillingRedirectUrl("FAILED", normalized.reference));
    }

    let finalPayload = normalized;
    try {
      const inquiry = await inquireEasypaisaPayment(normalized.reference);
      if (inquiry.signatureVerified) {
        finalPayload = inquiry;
      }
    } catch (error) {
      console.warn("[Billing] inquiry fallback failed", error);
    }

    const result = await processEpGatewayNotification({
      reference: finalPayload.reference,
      status: finalPayload.status,
      transactionId: finalPayload.transactionId,
      amountCents: finalPayload.amountCents,
      timestamp: finalPayload.timestamp,
      source: "CALLBACK",
      signature: finalPayload.signature,
      signatureValidated: finalPayload.signatureVerified,
      eventId: finalPayload.eventId,
      rawPayload: finalPayload.rawPayload,
      failureReason: finalPayload.failureReason,
    });

    return res.redirect(302, buildBillingRedirectUrl(result.payment.status, result.payment.reference));
  } catch {
    return res.redirect(302, buildBillingRedirectUrl("FAILED", String(req.query.reference ?? "unknown")));
  }
}

subscriptionsRouter.get("/callback", handleGatewayCallback);
subscriptionsRouter.post("/callback", handleGatewayCallback);

subscriptionsRouter.post("/webhook", async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const normalized = normalizeGatewayNotification(body, String(body.reference ?? ""));
  const headerSignature = String(req.header("x-ep-signature") ?? req.header("x-signature") ?? "").trim();
  if (headerSignature && !normalized.rawPayload.signature) {
    normalized.rawPayload.signature = headerSignature;
    normalized.signature = headerSignature;
  }

  if (!normalized.reference) {
    return res.status(400).json({ error: "Missing reference" });
  }
  if (!normalized.signatureVerified) {
    return res.status(401).json({ error: "Invalid gateway signature" });
  }

  const result = await processEpGatewayNotification({
    reference: normalized.reference,
    status: normalized.status,
    transactionId: normalized.transactionId,
    amountCents: normalized.amountCents,
    timestamp: normalized.timestamp,
    source: "WEBHOOK",
    signature: normalized.signature,
    signatureValidated: normalized.signatureVerified,
    eventId: normalized.eventId,
    rawPayload: normalized.rawPayload,
    failureReason: normalized.failureReason,
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
  const reference = String(req.params.reference ?? "").trim();
  const payment = await getPaymentForUser(req.user!.id, reference);
  if (!payment) return res.status(404).json({ error: "Payment not found" });

  if (payment.status === "PENDING") {
    try {
      const inquiry = await inquireEasypaisaPayment(reference);
      if (inquiry.signatureVerified && inquiry.status !== "PENDING") {
        await processEpGatewayNotification({
          reference: inquiry.reference,
          status: inquiry.status,
          transactionId: inquiry.transactionId,
          amountCents: inquiry.amountCents,
          timestamp: inquiry.timestamp,
          source: "VERIFY",
          signature: inquiry.signature,
          signatureValidated: inquiry.signatureVerified,
          eventId: inquiry.eventId,
          rawPayload: inquiry.rawPayload,
          failureReason: inquiry.failureReason,
        });
      }
    } catch (error) {
      console.warn(`[Billing] inquiry verification failed reference=${reference}`, error);
    }
  }

  const verifiedPayment = await getPaymentForUser(req.user!.id, reference);
  if (!verifiedPayment) return res.status(404).json({ error: "Payment not found" });

  return res.json({
    payment: {
      id: verifiedPayment.id,
      reference: verifiedPayment.reference,
      provider: verifiedPayment.provider,
      kind: verifiedPayment.kind,
      status: verifiedPayment.status,
      amountCents: verifiedPayment.amountCents,
      currency: verifiedPayment.currency,
      verifiedAt: verifiedPayment.verifiedAt,
      paidAt: verifiedPayment.paidAt,
      gatewayTransactionId: verifiedPayment.gatewayTransactionId,
      checkoutUrl: verifiedPayment.status === "PENDING" ? buildHostedCheckoutUrl(verifiedPayment.reference, verifiedPayment.checkoutToken) : null,
    },
    invoice: verifiedPayment.invoice,
    subscription: verifiedPayment.subscription,
    events: verifiedPayment.events.map((event) => ({
      eventId: event.eventId,
      source: event.source,
      status: event.status,
      createdAt: event.createdAt,
    })),
  });
});
