import { createHmac, randomBytes, randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { env } from "../config.js";

type JazzcashMode = "sandbox" | "production";

type JazzcashPlan = {
  id: string;
  name: string;
  priceCents: number;
  monthlyLabelLimit: number;
  monthlyTrackingLimit: number;
};

type JazzcashPaymentRecord = {
  id: string;
  reference: string;
  txnRefNo: string | null;
  amountCents: number;
  currency: string;
  status: string;
  provider: string;
  kind: string;
  providerTxnId: string | null;
  responseCode: string | null;
  responseMessage: string | null;
  hashVerified: boolean;
  rawRequest: Prisma.JsonValue | null;
  rawResponse: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
  userId: string;
  planId: string;
  subscriptionId: string | null;
  invoiceId: string | null;
};

type JazzcashCheckoutCreateInput = {
  userId: string;
  userContactNumber: string | null;
  plan: JazzcashPlan;
  amountCents: number;
  kind: string;
};

type JazzcashCallbackInput = Record<string, unknown>;

const SUCCESS_RESPONSE_CODES = new Set(["000", "121"]);
const CANCELED_RESPONSE_CODES = new Set(["124", "125", "126", "127", "128", "129"]);

function stripTrailingSlashes(value: string) {
  return String(value ?? "").trim().replace(/\/+$/, "");
}

function getJazzcashMode(): JazzcashMode {
  return String(env.JAZZCASH_ENV ?? "production").trim().toLowerCase() === "sandbox" ? "sandbox" : "production";
}

export function getJazzcashEndpoint() {
  const mode = getJazzcashMode();
  const sandbox = String(env.JAZZCASH_SANDBOX_ENDPOINT ?? "https://sandbox.jazzcash.com.pk/ApplicationAPI/API/Payment/DoTransaction").trim();
  const live = String(env.JAZZCASH_LIVE_ENDPOINT ?? "https://payments.jazzcash.com.pk/ApplicationAPI/API/Payment/DoTransaction").trim();
  return mode === "sandbox" ? sandbox : live;
}

export function getJazzcashReturnUrl() {
  const configured = String(env.JAZZCASH_RETURN_URL ?? "").trim();
  if (configured) return configured;
  const apiOrigin = stripTrailingSlashes(String(env.API_ORIGIN ?? ""));
  if (!apiOrigin) return "/api/payments/jazzcash/callback";
  return `${apiOrigin}/api/payments/jazzcash/callback`;
}

export function getJazzcashFrontendUrl() {
  const configured = String(env.FRONTEND_URL ?? env.WEB_ORIGIN ?? "").trim();
  return stripTrailingSlashes(configured);
}

function getJazzcashMerchantId() {
  return String(env.JAZZCASH_MERCHANT_ID ?? "").trim();
}

function getJazzcashPassword() {
  return String(env.JAZZCASH_PASSWORD ?? "").trim();
}

function getJazzcashIntegritySalt() {
  return String(env.JAZZCASH_INTEGRITY_SALT ?? "").trim();
}

export function getMissingJazzcashCredentials() {
  const missing: string[] = [];
  if (!getJazzcashMerchantId()) missing.push("JAZZCASH_MERCHANT_ID");
  if (!getJazzcashPassword()) missing.push("JAZZCASH_PASSWORD");
  if (!getJazzcashIntegritySalt()) missing.push("JAZZCASH_INTEGRITY_SALT");
  return missing;
}

export function hasJazzcashCredentials() {
  return getMissingJazzcashCredentials().length === 0;
}

function formatPkDateTime(date: Date) {
  const shifted = new Date(date.getTime() + 5 * 60 * 60 * 1000);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  const hours = String(shifted.getUTCHours()).padStart(2, "0");
  const minutes = String(shifted.getUTCMinutes()).padStart(2, "0");
  const seconds = String(shifted.getUTCSeconds()).padStart(2, "0");
  return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

function addPkDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export function buildJazzcashTxnRefNo(date = new Date()) {
  return `JZ${formatPkDateTime(date)}${randomBytes(2).toString("hex").toUpperCase()}`;
}

function normalizeFieldValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map((item) => normalizeFieldValue(item)).join(",");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function isHashField(key: string) {
  return /^pp/i.test(key) && key.toLowerCase() !== "pp_securehash";
}

export function buildJazzcashHashInput(fields: Record<string, unknown>) {
  const entries = Object.entries(fields)
    .filter(([key, value]) => isHashField(key) && normalizeFieldValue(value) !== "")
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey, "en", { sensitivity: "variant" }));
  const concatenated = entries.map(([, value]) => normalizeFieldValue(value)).join("&");
  return `${getJazzcashIntegritySalt()}&${concatenated}`;
}

export function generateJazzcashSecureHash(fields: Record<string, unknown>) {
  const input = buildJazzcashHashInput(fields);
  return createHmac("sha256", getJazzcashIntegritySalt()).update(input, "utf8").digest("hex").toUpperCase();
}

export function verifyJazzcashSecureHash(fields: Record<string, unknown>, secureHash?: string | null) {
  if (!secureHash) return false;
  const expected = generateJazzcashSecureHash(fields);
  const left = Buffer.from(expected, "utf8");
  const right = Buffer.from(String(secureHash).trim().toUpperCase(), "utf8");
  if (left.length !== right.length) return false;
  return left.equals(right);
}

function buildJazzcashStatus(status: string, responseCode: string | null, message: string | null) {
  const normalizedStatus = String(status ?? "").trim().toUpperCase();
  const normalizedCode = String(responseCode ?? "").trim().toUpperCase();
  const normalizedMessage = String(message ?? "").trim().toUpperCase();

  if (normalizedStatus.includes("PEND")) return "PENDING";
  if (SUCCESS_RESPONSE_CODES.has(normalizedCode)) return "SUCCEEDED";
  if (CANCELED_RESPONSE_CODES.has(normalizedCode) || normalizedMessage.includes("CANCEL")) return "CANCELED";
  return "FAILED";
}

function buildFrontendBillingUrl(status: "success" | "failed" | "pending", reference: string, message?: string) {
  const base = getJazzcashFrontendUrl();
  const targetBase = base ? `${base}/billing` : "/billing";
  const url = new URL(targetBase, base || "http://localhost");
  url.searchParams.set("payment", status);
  if (reference) url.searchParams.set("reference", reference);
  if (message) url.searchParams.set("message", message.slice(0, 160));
  return base ? url.toString() : `${url.pathname}${url.search}`;
}

function logSafe(message: string, details: Record<string, unknown>) {
  const redacted = JSON.stringify(details, (key, value) => {
    if (/password|salt|secret|hash/i.test(key)) return "[redacted]";
    return value;
  });
  console.info(`[JazzCash] ${message} ${redacted}`);
}

function buildJazzcashSignedFields(input: {
  amountCents: number;
  billReference: string;
  description: string;
  txnDateTime: string;
  txnExpiryDateTime: string;
  txnRefNo: string;
  mobileNumber: string;
}) {
  const fields: Record<string, string> = {
    pp_Amount: String(input.amountCents),
    pp_BankID: "",
    pp_BillReference: input.billReference,
    pp_Description: input.description,
    pp_Language: "EN",
    pp_MerchantID: getJazzcashMerchantId(),
    pp_Password: getJazzcashPassword(),
    pp_ProductID: "",
    pp_ReturnURL: getJazzcashReturnUrl(),
    pp_SubMerchantID: "",
    pp_TxnCurrency: "PKR",
    pp_TxnDateTime: input.txnDateTime,
    pp_TxnExpiryDateTime: input.txnExpiryDateTime,
    pp_TxnRefNo: input.txnRefNo,
    pp_TxnType: "MWALLET",
    pp_Version: "1.1",
    ppmpf_1: input.mobileNumber,
    ppmpf_2: "",
    ppmpf_3: "",
    ppmpf_4: "",
    ppmpf_5: "",
  };
  fields.pp_SecureHash = generateJazzcashSecureHash(fields);
  return fields;
}

function buildJazzcashPublicFields(fields: Record<string, string>) {
  const publicFields = { ...fields };
  delete publicFields.pp_Password;
  delete publicFields.pp_SecureHash;
  return publicFields;
}

async function getActiveSubscription(userId: string) {
  return prisma.subscription.findFirst({
    where: { userId, status: "ACTIVE" },
    include: { plan: true },
    orderBy: { createdAt: "desc" },
  });
}

function buildSubscriptionWindow(planName: string, kind: string, currentPeriodEnd?: Date | null) {
  const now = new Date();
  const start = kind === "RENEWAL" && currentPeriodEnd && currentPeriodEnd > now ? new Date(currentPeriodEnd) : new Date(now);
  const end = addPkDays(new Date(start), planName.toLowerCase().includes("free") ? 15 : 30);
  return { start, end };
}

export async function createJazzcashCheckout(input: JazzcashCheckoutCreateInput) {
  const [plan, activeSubscription, pendingPayment] = await Promise.all([
    prisma.plan.findUnique({ where: { id: input.plan.id } }),
    getActiveSubscription(input.userId),
    prisma.payment.findFirst({
      where: { userId: input.userId, planId: input.plan.id, provider: "JAZZCASH", status: "PENDING" },
      include: { invoice: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  if (!plan) {
    throw new Error("Plan not found");
  }

  const txnRefNo = pendingPayment?.txnRefNo ?? pendingPayment?.reference ?? buildJazzcashTxnRefNo();
  const kind = activeSubscription ? (activeSubscription.planId === plan.id ? "RENEWAL" : "UPGRADE") : "PURCHASE";
  const txnDateTime = formatPkDateTime(new Date());
  const txnExpiryDateTime = formatPkDateTime(addPkDays(new Date(), 1));
  const mobileNumber = input.userContactNumber?.trim() ?? "";
  if (!mobileNumber) {
    throw new Error("Contact number is required for JazzCash checkout");
  }

  const signedFields = buildJazzcashSignedFields({
    amountCents: input.amountCents,
    billReference: txnRefNo,
    description: `${plan.name} subscription`,
    txnDateTime,
    txnExpiryDateTime,
    txnRefNo,
    mobileNumber,
  });
  const publicFields = buildJazzcashPublicFields(signedFields);

  if (pendingPayment) {
    await prisma.payment.update({
      where: { id: pendingPayment.id },
      data: {
        txnRefNo,
        gatewayOrderId: txnRefNo,
        idempotencyKey: `${input.userId}:${plan.id}:${txnRefNo}`,
        kind,
        amountCents: input.amountCents,
        currency: "PKR",
        provider: "JAZZCASH",
        rawRequest: {
          actionUrl: getJazzcashEndpoint(),
          fields: signedFields,
        } as Prisma.InputJsonValue,
      },
    });
    return {
      actionUrl: "/api/payments/jazzcash/relay",
      fields: {
        ...publicFields,
        paymentId: pendingPayment.id,
        checkoutToken: pendingPayment.checkoutToken,
      },
      paymentId: pendingPayment.id,
      reference: txnRefNo,
      plan,
      invoice: pendingPayment.invoice,
    };
  }

  const paymentId = randomUUID();
  const invoiceId = randomUUID();

  const result = await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: {
        id: paymentId,
        userId: input.userId,
        planId: plan.id,
        provider: "JAZZCASH",
        reference: txnRefNo,
        txnRefNo,
        gatewayOrderId: txnRefNo,
        gatewayTransactionId: null,
        idempotencyKey: `${input.userId}:${plan.id}:${txnRefNo}`,
        checkoutToken: randomUUID(),
        kind,
        status: "PENDING",
        amountCents: input.amountCents,
        currency: "PKR",
        hashVerified: false,
        rawRequest: {
          actionUrl: getJazzcashEndpoint(),
          fields: signedFields,
        } as Prisma.InputJsonValue,
      },
    });

    const invoice = await tx.invoice.create({
      data: {
        id: invoiceId,
        userId: input.userId,
        planId: plan.id,
        paymentId: payment.id,
        invoiceNumber: `INV-${txnRefNo}`.slice(0, 20),
        amountCents: input.amountCents,
        currency: "PKR",
        status: "OPEN",
      },
    });

    return { payment, invoice };
  });

  logSafe("checkout created", { reference: txnRefNo, planId: plan.id, amountCents: input.amountCents, actionUrl: getJazzcashEndpoint() });

  return {
    actionUrl: "/api/payments/jazzcash/relay",
    fields: {
      ...publicFields,
      paymentId: result.payment.id,
      checkoutToken: result.payment.checkoutToken,
    },
    paymentId: result.payment.id,
    reference: txnRefNo,
    plan,
    invoice: result.invoice,
  };
}

export function renderJazzcashRelayPage(actionUrl: string, fields: Record<string, string>) {
  const escapeHtml = (value: string) =>
    value.replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[character] ?? character));

  const inputs = Object.entries(fields)
    .map(([key, value]) => `<input type="hidden" name="${escapeHtml(key)}" value="${escapeHtml(String(value))}" />`)
    .join("\n        ");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Redirecting to JazzCash</title>
    <style>
      body { font-family: system-ui, sans-serif; margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f8fafc; color: #0f172a; }
      main { max-width: 560px; padding: 32px; border-radius: 24px; background: white; border: 1px solid #e2e8f0; box-shadow: 0 20px 60px rgba(15, 23, 42, 0.08); }
      p { color: #475569; line-height: 1.6; }
    </style>
  </head>
  <body>
    <main>
      <h1>Redirecting to JazzCash</h1>
      <p>Your payment form is being submitted securely.</p>
      <form id="jazzcash-form" method="post" action="${actionUrl}">
        ${inputs}
      </form>
      <script>document.getElementById('jazzcash-form').submit();</script>
    </main>
  </body>
</html>`;
}

function pickProviderTxnId(payload: Record<string, unknown>) {
  return normalizeFieldValue(payload.pp_RetreivalReferenceNo || payload.pp_RetrievalReferenceNo || payload.pp_AuthCode || payload.pp_TransactionId || payload.pp_TransactionID || "") || null;
}

function pickResponseMessage(payload: Record<string, unknown>) {
  return normalizeFieldValue(payload.pp_ResponseMessage || payload.pp_PaymentResponseMessage || "") || null;
}

function pickResponseCode(payload: Record<string, unknown>) {
  return normalizeFieldValue(payload.pp_ResponseCode || payload.pp_PaymentResponseCode || "") || null;
}

function pickReference(payload: Record<string, unknown>) {
  return normalizeFieldValue(payload.pp_TxnRefNo || payload.reference || payload.txnRefNo || "") || null;
}

function pickStatus(payload: Record<string, unknown>) {
  return buildJazzcashStatus(
    normalizeFieldValue(payload.pp_Status || payload.status || ""),
    pickResponseCode(payload),
    pickResponseMessage(payload),
  );
}

function buildCallbackPayload(payload: Record<string, unknown>) {
  return {
    ...payload,
    providerTxnId: pickProviderTxnId(payload),
    responseCode: pickResponseCode(payload),
    responseMessage: pickResponseMessage(payload),
    reference: pickReference(payload),
    status: pickStatus(payload),
  };
}

export async function processJazzcashCallback(payload: JazzcashCallbackInput) {
  const normalized = buildCallbackPayload(payload);
  const reference = String(normalized.reference ?? "").trim();
  if (!reference) {
    return { redirect: buildFrontendBillingUrl("failed", "unknown", "Missing transaction reference"), status: "FAILED" as const };
  }

  const payment = await prisma.payment.findFirst({
    where: { OR: [{ reference }, { txnRefNo: reference }] },
    include: { plan: true, invoice: true, subscription: { include: { plan: true } } },
  });

  if (!payment) {
    return { redirect: buildFrontendBillingUrl("failed", reference, "Unknown transaction reference"), status: "FAILED" as const };
  }

  const hashVerified = verifyJazzcashSecureHash(payload, normalizeFieldValue(payload.pp_SecureHash) || null);
  const amount = Number(normalizeFieldValue(payload.pp_Amount) || 0);
  const currency = String(normalizeFieldValue(payload.pp_TxnCurrency) || payment.currency || "PKR").trim().toUpperCase();
  const amountMatches = amount === Number(payment.amountCents);
  const currencyMatches = currency === String(payment.currency ?? "PKR").toUpperCase();
  const finalStatus = hashVerified && amountMatches && currencyMatches
    ? normalized.status
    : "FAILED";

  if (!hashVerified || !amountMatches || !currencyMatches) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        provider: "JAZZCASH",
        txnRefNo: payment.txnRefNo ?? reference,
        providerTxnId: normalized.providerTxnId,
        responseCode: normalized.responseCode,
        responseMessage: normalized.responseMessage,
        rawResponse: payload as Prisma.InputJsonValue,
        hashVerified,
        status: "FAILED",
        verifiedAt: new Date(),
        failureReason: !hashVerified ? "INVALID_HASH" : !amountMatches ? "AMOUNT_MISMATCH" : "CURRENCY_MISMATCH",
      },
    });
    return { redirect: buildFrontendBillingUrl("failed", reference, !hashVerified ? "Invalid hash" : !amountMatches ? "Amount mismatch" : "Currency mismatch"), status: "FAILED" as const };
  }

  if (payment.status !== "PENDING") {
    const currentStatus = payment.status === "SUCCEEDED" ? "success" : payment.status === "CANCELED" ? "failed" : "pending";
    return { redirect: buildFrontendBillingUrl(currentStatus, reference, "Duplicate callback ignored"), status: payment.status as "SUCCEEDED" | "FAILED" | "CANCELED" | "PENDING" };
  }

  const eventId = `JAZZCASH:${reference}:${normalized.responseCode ?? "NO_CODE"}:${normalized.providerTxnId ?? "NO_TXN"}`;
  try {
    await prisma.paymentEvent.create({
      data: {
        paymentId: payment.id,
        eventId,
        source: "CALLBACK",
        status: finalStatus,
        payloadHash: createHmac("sha256", getJazzcashIntegritySalt()).update(JSON.stringify(payload)).digest("hex"),
        signature: normalizeFieldValue(payload.pp_SecureHash) || null,
        payloadJson: payload as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    if (error instanceof Error && /unique|constraint/i.test(error.message)) {
      const current = await prisma.payment.findUnique({ where: { id: payment.id }, include: { invoice: true, plan: true } });
      return {
        redirect: buildFrontendBillingUrl(current?.status === "SUCCEEDED" ? "success" : current?.status === "CANCELED" ? "failed" : "pending", reference, "Duplicate callback ignored"),
        status: current?.status ?? "PENDING",
      };
    }
    throw error;
  }

  const existingActive = await prisma.subscription.findFirst({
    where: { userId: payment.userId, status: "ACTIVE" },
    include: { plan: true },
    orderBy: { createdAt: "desc" },
  });
  const subscriptionKind = existingActive ? (existingActive.planId === payment.planId ? "RENEWAL" : "UPGRADE") : "PURCHASE";
  const window = buildSubscriptionWindow(payment.plan.name, subscriptionKind, existingActive?.currentPeriodEnd ?? null);

  const result = await prisma.$transaction(async (tx) => {
    let subscriptionId = payment.subscriptionId;
    if (finalStatus === "SUCCEEDED") {
      await tx.subscription.updateMany({ where: { userId: payment.userId, status: "ACTIVE" }, data: { status: "CANCELED" } });
      const subscription = await tx.subscription.create({
        data: {
          userId: payment.userId,
          planId: payment.planId,
          status: "ACTIVE",
          currentPeriodStart: window.start,
          currentPeriodEnd: window.end,
        },
      });
      subscriptionId = subscription.id;
    }

    const updatedPayment = await tx.payment.update({
      where: { id: payment.id },
      data: {
        provider: "JAZZCASH",
        txnRefNo: payment.txnRefNo ?? reference,
        providerTxnId: normalized.providerTxnId,
        responseCode: normalized.responseCode,
        responseMessage: normalized.responseMessage,
        rawResponse: payload as Prisma.InputJsonValue,
        hashVerified: true,
        status: finalStatus,
        verifiedAt: new Date(),
        paidAt: finalStatus === "SUCCEEDED" ? new Date() : null,
        failureReason: finalStatus === "SUCCEEDED" ? null : normalized.responseCode ?? "FAILED",
        subscriptionId: finalStatus === "SUCCEEDED" ? subscriptionId : payment.subscriptionId,
      },
    });

    const updatedInvoice = await tx.invoice.update({
      where: { paymentId: payment.id },
      data: {
        status: finalStatus === "SUCCEEDED" ? "PAID" : finalStatus === "CANCELED" ? "CANCELED" : "FAILED",
        paidAt: finalStatus === "SUCCEEDED" ? new Date() : null,
        subscriptionId: finalStatus === "SUCCEEDED" ? subscriptionId : payment.subscriptionId,
      },
    });

    return { payment: updatedPayment, invoice: updatedInvoice, subscriptionId };
  });

  const redirectStatus = finalStatus === "SUCCEEDED" ? "success" : finalStatus === "CANCELED" ? "failed" : "failed";
  logSafe("callback processed", { reference, status: finalStatus, amountCents: amount, hashVerified, providerTxnId: normalized.providerTxnId });

  return {
    redirect: buildFrontendBillingUrl(redirectStatus, reference, normalized.responseMessage ?? undefined),
    status: result.payment.status,
    payment: result.payment,
    invoice: result.invoice,
  };
}

export async function getJazzcashPaymentStatus(paymentIdOrReference: string, userId: string) {
  const lookup = String(paymentIdOrReference ?? "").trim();
  return prisma.payment.findFirst({
    where: { userId, OR: [{ id: lookup }, { reference: lookup }, { txnRefNo: lookup }] },
    include: { plan: true, invoice: true, subscription: { include: { plan: true } } },
  });
}
