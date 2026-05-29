import express, { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { getOrCreateBillingSettings, resolveConfiguredPlanPrice } from "../services/billing-settings.service.js";
import { ensurePlanManagementColumns } from "./plans.js";
import {
  createJazzcashMobileWalletPayment,
  createJazzcashCheckout,
  getJazzcashFrontendUrl,
  getJazzcashPaymentStatus,
  getJazzcashReturnUrl,
  hasJazzcashCredentials,
  isJazzcashMobileWalletEnabled,
  processJazzcashCallback,
  queryJazzcashTransactionStatus,
  renderJazzcashRelayPage,
} from "../services/jazzcash.js";

export const paymentsRouter = Router();
paymentsRouter.use(express.urlencoded({ extended: false }));

const createSchema = z.object({
  planId: z.string().uuid(),
  customerMobile: z.string().trim().optional(),
  contactNumber: z.string().trim().optional(),
});

const mobileWalletCreateSchema = z.object({
  planId: z.string().uuid(),
  mobileNumber: z.string().trim(),
});

const statusInquirySchema = z.object({
  txnRefNo: z.string().trim().min(1),
});

const JAZZCASH_INQUIRY_RECOMMENDED_AFTER_MS = 10 * 60 * 1000;

function isAdminUser(user: { role?: string | null } | undefined) {
  return String(user?.role ?? "").toUpperCase() === "ADMIN";
}

function normalizeJazzcashInquiryStatus(status: string) {
  if (status === "SUCCEEDED") return "completed" as const;
  if (status === "PENDING") return "pending" as const;
  if (status === "FAILED") return "failed" as const;
  return "error" as const;
}

function shapeJazzcashInquiryResponse(result: Awaited<ReturnType<typeof queryJazzcashTransactionStatus>>) {
  return {
    reference: result.reference,
    status: normalizeJazzcashInquiryStatus(result.status),
    providerStatus: result.status,
    responseCode: result.responseCode,
    paymentResponseCode: result.paymentResponseCode,
    responseMessage: result.responseMessage,
    paymentResponseMessage: result.paymentResponseMessage,
    providerTxnId: result.providerTxnId,
    hashVerified: result.hashVerified,
  };
}

async function getJazzcashInquiryPayment(txnRefNo: string, userId: string) {
  return prisma.payment.findFirst({
    where: { userId, provider: "JAZZCASH", OR: [{ reference: txnRefNo }, { txnRefNo }] },
    select: { id: true, createdAt: true, reference: true, txnRefNo: true, status: true },
  });
}

paymentsRouter.post("/jazzcash/mobile-wallet/create", requireAuth, async (req: AuthedRequest, res) => {
  try {
    await ensurePlanManagementColumns();
    if (!isJazzcashMobileWalletEnabled()) {
      return res.status(409).json({ error: "JazzCash mobile wallet API is currently disabled" });
    }

    const body = mobileWalletCreateSchema.parse(req.body);
    const mobileNumber = String(body.mobileNumber ?? "").replace(/\D/g, "");
    if (!/^03\d{9}$/.test(mobileNumber)) {
      return res.status(400).json({ error: "Enter a valid JazzCash mobile number in 03XXXXXXXXX format" });
    }

    const plan = await prisma.plan.findUnique({ where: { id: body.planId } });
    if (!plan) return res.status(404).json({ error: "Plan not found" });

    const suspendedRows = await prisma.$queryRaw<Array<{ is_suspended: boolean }>>`
      SELECT is_suspended FROM "Plan" WHERE id = ${plan.id}
    `;
    if (Boolean(suspendedRows[0]?.is_suspended)) {
      return res.status(409).json({ error: "This plan is currently suspended" });
    }

    const settings = await getOrCreateBillingSettings();
    const amountCents = resolveConfiguredPlanPrice(plan.name, plan.priceCents, settings);
    if (amountCents <= 0) {
      return res.status(400).json({ error: "JazzCash is only available for paid plans" });
    }

    if (!hasJazzcashCredentials()) {
      return res.status(400).json({ error: "JazzCash credentials are not configured" });
    }

    const result = await createJazzcashMobileWalletPayment({
      userId: req.user!.id,
      userContactNumber: mobileNumber,
      plan: {
        id: plan.id,
        name: plan.name,
        priceCents: amountCents,
        monthlyLabelLimit: plan.monthlyLabelLimit,
        monthlyTrackingLimit: plan.monthlyTrackingLimit,
      },
      amountCents,
    });

    return res.status(201).json({
      payment: {
        id: result.paymentId,
        reference: result.reference,
      },
      status: result.status,
      paymentStatus: result.paymentStatus,
      providerResponseCode: result.providerResponseCode,
      message: result.message,
      pollAfterSeconds: result.status === "awaiting_customer_approval" || result.status === "pending" ? 4 : 0,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation failed", details: error.errors });
    }

    const message = error instanceof Error ? error.message : "Failed to create JazzCash mobile wallet payment";
    const normalized = message.toLowerCase();

    if (normalized.includes("failed to contact jazzcash mobile wallet api")) {
      return res.status(502).json({ error: "JazzCash wallet service did not respond. Please try again." });
    }
    if (normalized.includes("mobile wallet api is currently disabled") || normalized.includes("endpoint")) {
      return res.status(503).json({ error: "JazzCash service is updating. Please try again in a minute." });
    }

    return res.status(400).json({ error: message });
  }
});

paymentsRouter.post("/jazzcash/create", requireAuth, async (req: AuthedRequest, res) => {
  try {
    await ensurePlanManagementColumns();
    const body = createSchema.parse(req.body);
    const plan = await prisma.plan.findUnique({ where: { id: body.planId } });
    if (!plan) return res.status(404).json({ error: "Plan not found" });

    const suspendedRows = await prisma.$queryRaw<Array<{ is_suspended: boolean }>>`
      SELECT is_suspended FROM "Plan" WHERE id = ${plan.id}
    `;
    if (Boolean(suspendedRows[0]?.is_suspended)) {
      return res.status(409).json({ error: "This plan is currently suspended" });
    }

    const settings = await getOrCreateBillingSettings();
    const amountCents = resolveConfiguredPlanPrice(plan.name, plan.priceCents, settings);
    if (amountCents <= 0) {
      return res.status(400).json({ error: "JazzCash is only available for paid plans" });
    }

    if (!hasJazzcashCredentials()) {
      return res.status(400).json({ error: "JazzCash credentials are not configured" });
    }

    const authUser = req.user as { id: string; contactNumber?: string | null } | undefined;
    const contactNumber = String(body.customerMobile ?? body.contactNumber ?? authUser?.contactNumber ?? "").trim();
    const result = await createJazzcashCheckout({
      userId: req.user!.id,
      userContactNumber: contactNumber,
      plan: {
        id: plan.id,
        name: plan.name,
        priceCents: amountCents,
        monthlyLabelLimit: plan.monthlyLabelLimit,
        monthlyTrackingLimit: plan.monthlyTrackingLimit,
      },
      amountCents,
      kind: "PURCHASE",
    });

    return res.status(201).json({
      actionUrl: result.actionUrl,
      fields: result.fields,
      payment: {
        id: result.paymentId,
        reference: result.reference,
      },
      invoice: result.invoice,
      plan: {
        id: plan.id,
        name: plan.name,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation failed", details: error.errors });
    }
    return res.status(400).json({ error: error instanceof Error ? error.message : "Failed to create JazzCash checkout" });
  }
});

paymentsRouter.post("/jazzcash/relay", async (req, res) => {
  try {
    const paymentId = String(req.body?.paymentId ?? "").trim();
    const checkoutToken = String(req.body?.checkoutToken ?? "").trim();
    if (!paymentId || !checkoutToken) {
      return res.status(400).send("Missing payment session");
    }

    const payment = await prisma.payment.findFirst({
      where: { id: paymentId, checkoutToken, provider: "JAZZCASH", status: "PENDING" },
    });
    if (!payment) {
      return res.status(404).send("Payment session not found");
    }

    const rawRequest = payment.rawRequest as Record<string, unknown> | null;
    const fields = rawRequest && typeof rawRequest === "object" && !Array.isArray(rawRequest)
      ? (rawRequest.fields as Record<string, string> | undefined)
      : undefined;
    const actionUrl = rawRequest && typeof rawRequest === "object" && !Array.isArray(rawRequest)
      ? String(rawRequest.actionUrl ?? "").trim()
      : "";

    if (!fields || !actionUrl) {
      return res.status(500).send("Payment request is missing");
    }

    return res.type("html").send(renderJazzcashRelayPage(actionUrl, fields));
  } catch (error) {
    console.error("[JazzCash] relay error", error);
    return res.status(500).send("Failed to prepare JazzCash payment");
  }
});

async function handleJazzcashCallback(req: any, res: any) {
  try {
    const payload = (req.method === "POST" ? req.body : req.query) as Record<string, unknown>;
    const result = await processJazzcashCallback(payload, "CALLBACK");
    return res.redirect(302, result.redirect);
  } catch (error) {
    console.error("[JazzCash] callback error", error);
    const reference = String((req.body?.pp_TxnRefNo ?? req.query?.pp_TxnRefNo ?? req.query?.reference ?? "unknown") as string);
    const frontendBase = getJazzcashFrontendUrl();
    const fallback = frontendBase
      ? `${frontendBase}/payment/jazzcash/result?status=failed&ref=${encodeURIComponent(reference)}`
      : `/payment/jazzcash/result?status=failed&ref=${encodeURIComponent(reference)}`;
    return res.redirect(302, fallback);
  }
}

async function handleJazzcashIpn(req: any, res: any) {
  try {
    const payload = (req.body ?? {}) as Record<string, unknown>;
    const result = await processJazzcashCallback(payload, "IPN");
    return res.status(200).json({
      success: true,
      status: "processed",
      paymentStatus: result.status,
    });
  } catch (error) {
    console.error("[JazzCash] ipn error", error);
    return res.status(400).json({
      success: false,
      status: "failed",
      error: error instanceof Error ? error.message : "IPN processing failed",
    });
  }
}

paymentsRouter.get("/jazzcash/ipn", (_req, res) => {
  return res.status(200).json({
    success: true,
    message: "JazzCash IPN endpoint is ready. Use POST for payment notifications.",
    method: "POST",
    returnUrl: getJazzcashReturnUrl(),
  });
});

paymentsRouter.get("/jazzcash/callback", handleJazzcashCallback);
paymentsRouter.post("/jazzcash/callback", handleJazzcashCallback);
paymentsRouter.post("/jazzcash/ipn", handleJazzcashIpn);

paymentsRouter.get("/jazzcash/status/:txnRefNo", requireAuth, async (req: AuthedRequest, res) => {
  const status = await getJazzcashPaymentStatus(String(req.params.txnRefNo ?? ""), req.user!.id);
  if (!status) return res.status(404).json({ error: "Payment not found" });

  return res.json({
    reference: status.txnRefNo ?? status.reference,
    status: status.status,
    planName: status.plan?.name ?? null,
    amountCents: status.amountCents,
    currency: status.currency,
    responseMessage: status.responseMessage,
    updatedAt: status.updatedAt,
  });
});

paymentsRouter.post("/jazzcash/status-inquiry", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const body = statusInquirySchema.parse(req.body);
    const payment = await getJazzcashInquiryPayment(body.txnRefNo, req.user!.id);
    if (!payment) {
      return res.status(404).json({ error: "Payment not found", status: "not_found" });
    }

    const ageMs = Date.now() - payment.createdAt.getTime();
    if (payment && payment.status === "PENDING" && !isAdminUser(req.user) && ageMs < JAZZCASH_INQUIRY_RECOMMENDED_AFTER_MS) {
      return res.status(200).json({
        reference: payment.txnRefNo ?? payment.reference,
        status: "pending",
        message: "Status inquiry is recommended after 10 minutes of transaction initiation.",
        recommendedAfterMinutes: 10,
        inquirySkipped: true,
      });
    }

    const result = await queryJazzcashTransactionStatus({ txnRefNo: body.txnRefNo, userId: req.user!.id });
    return res.status(200).json(shapeJazzcashInquiryResponse(result));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation failed", details: error.errors });
    }
    const message = error instanceof Error ? error.message : "Status inquiry failed";
    if (message.toLowerCase().includes("not found")) {
      return res.status(404).json({ error: message });
    }
    return res.status(400).json({ error: message });
  }
});

paymentsRouter.post("/jazzcash/status-inquiry/:txnRefNo", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const txnRefNo = String(req.params.txnRefNo ?? "").trim();
    if (!txnRefNo) {
      return res.status(400).json({ error: "Transaction reference is required" });
    }
    const payment = await getJazzcashInquiryPayment(txnRefNo, req.user!.id);
    if (!payment) {
      return res.status(404).json({ error: "Payment not found", status: "not_found" });
    }

    const ageMs = Date.now() - payment.createdAt.getTime();
    if (payment && payment.status === "PENDING" && !isAdminUser(req.user) && ageMs < JAZZCASH_INQUIRY_RECOMMENDED_AFTER_MS) {
      return res.status(200).json({
        reference: payment.txnRefNo ?? payment.reference,
        status: "pending",
        message: "Status inquiry is recommended after 10 minutes of transaction initiation.",
        recommendedAfterMinutes: 10,
        inquirySkipped: true,
      });
    }

    const result = await queryJazzcashTransactionStatus({ txnRefNo, userId: req.user!.id });
    return res.status(200).json(shapeJazzcashInquiryResponse(result));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Status inquiry failed";
    if (message.toLowerCase().includes("not found")) {
      return res.status(404).json({ error: message, status: "not_found" });
    }
    return res.status(400).json({ error: message, status: "error" });
  }
});

paymentsRouter.get("/:id/status", requireAuth, async (req: AuthedRequest, res) => {
  const status = await getJazzcashPaymentStatus(String(req.params.id ?? ""), req.user!.id);
  if (!status) return res.status(404).json({ error: "Payment not found" });

  return res.json({
    payment: {
      id: status.id,
      reference: status.reference,
      txnRefNo: status.txnRefNo,
      provider: status.provider,
      status: status.status,
      amountCents: status.amountCents,
      currency: status.currency,
      providerTxnId: status.providerTxnId,
      responseCode: status.responseCode,
      responseMessage: status.responseMessage,
      hashVerified: status.hashVerified,
      paidAt: status.paidAt,
      verifiedAt: status.verifiedAt,
      createdAt: status.createdAt,
      updatedAt: status.updatedAt,
    },
    invoice: status.invoice,
    subscription: status.subscription,
  });
});
