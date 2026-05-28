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
const PENDING_RESPONSE_CODES = new Set(["124", "157", "210"]);
const CANCELED_RESPONSE_CODES = new Set(["112", "129"]);

function stripTrailingSlashes(value: string) {
  return String(value ?? "").trim().replace(/\/+$/, "");
}

function getJazzcashMode(): JazzcashMode {
  return String(env.JAZZCASH_ENV ?? "production").trim().toLowerCase() === "sandbox" ? "sandbox" : "production";
}

export function getJazzcashEndpoint() {
  const mode = getJazzcashMode();
  const sandbox = String(env.JAZZCASH_SANDBOX_ENDPOINT ?? "https://sandbox.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/").trim();
  const live = String(env.JAZZCASH_LIVE_ENDPOINT ?? "https://payments.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/").trim();
  return mode === "sandbox" ? sandbox : live;
}

function deriveApiOriginFromHostedEndpoint(value: string) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return "";
  }
}

export function getJazzcashMobileWalletEndpoint() {
  const mode = getJazzcashMode();
  const configured = String(
    mode === "sandbox"
      ? env.JAZZCASH_MOBILE_WALLET_ENDPOINT_SANDBOX
      : env.JAZZCASH_MOBILE_WALLET_ENDPOINT_LIVE,
  ).trim();
  if (configured) return configured;
  const hostedEndpoint = getJazzcashEndpoint();
  const origin = deriveApiOriginFromHostedEndpoint(hostedEndpoint);
  const fallbackOrigin = mode === "sandbox" ? "https://sandbox.jazzcash.com.pk" : "https://payments.jazzcash.com.pk";
  return `${origin || fallbackOrigin}/ApplicationAPI/API/Payment/DoTransaction`;
}

export function getJazzcashReturnUrl() {
  const configured = String(env.JAZZCASH_RETURN_URL ?? "").trim();
  if (configured) return configured;
  const apiOrigin = stripTrailingSlashes(String(env.API_ORIGIN ?? ""));
  if (!apiOrigin) return "/api/payments/jazzcash/callback";
  return `${apiOrigin}/api/payments/jazzcash/callback`;
}

export function normalizeJazzcashMobileNumber(value: string | null | undefined) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return /^03\d{9}$/.test(digits) ? digits : "";
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

function getJazzcashTxnType() {
  return String(env.JAZZCASH_TXN_TYPE ?? "MWALLET").trim() || "MWALLET";
}

function getJazzcashSubMerchantId() {
  return String(env.JAZZCASH_SUBMERCHANT_ID ?? "").trim();
}

function getJazzcashBankId() {
  const configured = String(env.JAZZCASH_BANK_ID ?? "").trim();
  if (configured) return configured;
  return getJazzcashMode() === "sandbox" ? "TBANK" : "";
}

function getJazzcashProductId() {
  const configured = String(env.JAZZCASH_PRODUCT_ID ?? "").trim();
  if (configured) return configured;
  return getJazzcashMode() === "sandbox" ? "RETL" : "";
}

function getJazzcashMobileWalletCnic() {
  const configured = String(env.JAZZCASH_MOBILE_WALLET_CNIC ?? "").trim();
  if (configured) return configured;
  return getJazzcashMode() === "sandbox" ? "345678" : "";
}

export function isJazzcashMobileWalletEnabled() {
  return String(env.JAZZCASH_MOBILE_WALLET_ENABLED ?? "true").trim().toLowerCase() !== "false";
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

function buildJazzcashHashInput(fields: Record<string, unknown>, options?: { includeEmptyFields?: boolean }) {
  const includeEmptyFields = options?.includeEmptyFields ?? true;
  const entries = Object.entries(fields)
    .filter(([key, value]) => isHashField(key) && (includeEmptyFields || normalizeFieldValue(value) !== ""))
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey, "en", { sensitivity: "variant" }));
  const concatenated = entries.map(([, value]) => normalizeFieldValue(value)).join("&");
  return `${getJazzcashIntegritySalt()}&${concatenated}`;
}

export function generateJazzcashSecureHash(fields: Record<string, unknown>, options?: { includeEmptyFields?: boolean }) {
  const input = buildJazzcashHashInput(fields, options);
  return createHmac("sha256", getJazzcashIntegritySalt()).update(input, "utf8").digest("hex").toUpperCase();
}

function secureHashEquals(expected: string, actual: string) {
  const left = Buffer.from(String(expected).trim().toUpperCase(), "utf8");
  const right = Buffer.from(String(actual).trim().toUpperCase(), "utf8");
  if (left.length !== right.length) return false;
  return left.equals(right);
}

export function verifyJazzcashSecureHash(fields: Record<string, unknown>, secureHash?: string | null) {
  if (!secureHash) return false;
  const incoming = String(secureHash).trim().toUpperCase();
  const strictExpected = generateJazzcashSecureHash(fields, { includeEmptyFields: true });
  if (secureHashEquals(strictExpected, incoming)) return true;

  // Backward compatibility path for older integrations that excluded empty PP fields.
  const legacyExpected = generateJazzcashSecureHash(fields, { includeEmptyFields: false });
  return secureHashEquals(legacyExpected, incoming);
}

function buildJazzcashStatus(status: string, responseCode: string | null, message: string | null) {
  const normalizedStatus = String(status ?? "").trim().toUpperCase();
  const normalizedCode = String(responseCode ?? "").trim().toUpperCase();
  const normalizedMessage = String(message ?? "").trim().toUpperCase();

  if (normalizedStatus.includes("PEND")) return "PENDING";
  if (PENDING_RESPONSE_CODES.has(normalizedCode)) return "PENDING";
  if (SUCCESS_RESPONSE_CODES.has(normalizedCode)) return "SUCCEEDED";
  if (CANCELED_RESPONSE_CODES.has(normalizedCode) || normalizedMessage.includes("CANCEL")) return "CANCELED";
  return "FAILED";
}

function buildFrontendBillingUrl(status: "success" | "failed" | "pending", reference: string, message?: string) {
  const base = getJazzcashFrontendUrl();
  // Redirect to the public (no-auth) result page so unauthenticated JazzCash
  // return tabs are never bounced to /login.
  const targetBase = base ? `${base}/payment/jazzcash/result` : "/payment/jazzcash/result";
  const url = new URL(targetBase, base || "http://localhost");
  url.searchParams.set("status", status);
  if (reference) url.searchParams.set("ref", reference);
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
    pp_BankID: getJazzcashBankId(),
    pp_BillReference: input.billReference,
    pp_Description: input.description,
    pp_Language: "EN",
    pp_MerchantID: getJazzcashMerchantId(),
    pp_Password: getJazzcashPassword(),
    pp_ProductID: getJazzcashProductId(),
    pp_ReturnURL: getJazzcashReturnUrl(),
    pp_SubMerchantID: getJazzcashSubMerchantId(),
    pp_TxnCurrency: "PKR",
    pp_TxnDateTime: input.txnDateTime,
    pp_TxnExpiryDateTime: input.txnExpiryDateTime,
    pp_TxnRefNo: input.txnRefNo,
    pp_TxnType: getJazzcashTxnType(),
    pp_Version: "1.1",
    ppmpf_1: input.mobileNumber,
    ppmpf_2: "",
    ppmpf_3: "",
    ppmpf_4: "",
    ppmpf_5: "",
  };
  // JazzCash sample integration excludes empty PP fields when computing outbound request hash.
  fields.pp_SecureHash = generateJazzcashSecureHash(fields, { includeEmptyFields: false });
  return fields;
}

function buildJazzcashMobileWalletFields(input: {
  amountCents: number;
  billReference: string;
  description: string;
  txnDateTime: string;
  txnExpiryDateTime: string;
  txnRefNo: string;
  mobileNumber: string;
  cnic?: string;
}) {
  const fields: Record<string, string> = {
    pp_Language: "EN",
    pp_Version: "1.1",
    pp_MerchantID: getJazzcashMerchantId(),
    pp_SubMerchantID: getJazzcashSubMerchantId(),
    pp_Password: getJazzcashPassword(),
    pp_TxnType: getJazzcashTxnType(),
    pp_TxnRefNo: input.txnRefNo,
    pp_MobileNumber: input.mobileNumber,
    pp_ReturnURL: getJazzcashReturnUrl(),
    pp_Amount: String(input.amountCents),
    pp_DiscountedAmount: "",
    pp_TxnCurrency: "PKR",
    pp_TxnDateTime: input.txnDateTime,
    pp_BillReference: input.billReference,
    pp_Description: input.description,
    pp_TxnExpiryDateTime: input.txnExpiryDateTime,
    ppmpf_1: input.mobileNumber,
    ppmpf_2: "",
    ppmpf_3: "",
    ppmpf_4: "",
    ppmpf_5: "",
  };
  if (input.cnic) {
    fields.pp_CNIC = input.cnic;
  }
  // JazzCash sample integration excludes empty PP fields when computing outbound request hash.
  fields.pp_SecureHash = generateJazzcashSecureHash(fields, { includeEmptyFields: false });
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
  const mobileNumber = normalizeJazzcashMobileNumber(input.userContactNumber);
  if (!mobileNumber) {
    throw new Error("Enter a valid JazzCash mobile number to continue.");
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

type JazzcashMobileWalletCreateInput = {
  userId: string;
  userContactNumber: string | null;
  plan: JazzcashPlan;
  amountCents: number;
};

type JazzcashMobileWalletCreateResult = {
  paymentId: string;
  reference: string;
  status: "success" | "failed" | "pending" | "awaiting_customer_approval" | "error";
  paymentStatus: "SUCCEEDED" | "FAILED" | "CANCELED" | "PENDING";
  message: string;
  providerResponseCode: string | null;
};

function mapPaymentStatusToMobileWalletResult(status: string) {
  if (status === "SUCCEEDED") return "success" as const;
  if (status === "PENDING") return "awaiting_customer_approval" as const;
  return "failed" as const;
}

export async function createJazzcashMobileWalletPayment(input: JazzcashMobileWalletCreateInput): Promise<JazzcashMobileWalletCreateResult> {
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

  const mobileNumber = normalizeJazzcashMobileNumber(input.userContactNumber);
  if (!mobileNumber) {
    throw new Error("Enter a valid JazzCash mobile number to continue.");
  }

  const endpoint = getJazzcashMobileWalletEndpoint();
  const txnRefNo = pendingPayment?.txnRefNo ?? pendingPayment?.reference ?? buildJazzcashTxnRefNo();
  const kind = activeSubscription ? (activeSubscription.planId === plan.id ? "RENEWAL" : "UPGRADE") : "PURCHASE";
  const txnDateTime = formatPkDateTime(new Date());
  const txnExpiryDateTime = formatPkDateTime(addPkDays(new Date(), 1));

  const requestFields = buildJazzcashMobileWalletFields({
    amountCents: input.amountCents,
    billReference: txnRefNo,
    description: `${plan.name} subscription`,
    txnDateTime,
    txnExpiryDateTime,
    txnRefNo,
    mobileNumber,
    cnic: getJazzcashMobileWalletCnic() || undefined,
  });

  let paymentId = pendingPayment?.id;
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
          endpoint,
          mode: "MOBILE_WALLET_API",
          fields: requestFields,
        } as Prisma.InputJsonValue,
      },
    });
  } else {
    const created = await prisma.payment.create({
      data: {
        id: randomUUID(),
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
          endpoint,
          mode: "MOBILE_WALLET_API",
          fields: requestFields,
        } as Prisma.InputJsonValue,
      },
    });
    paymentId = created.id;
    await prisma.invoice.create({
      data: {
        id: randomUUID(),
        userId: input.userId,
        planId: plan.id,
        paymentId: created.id,
        invoiceNumber: `INV-${txnRefNo}`.slice(0, 20),
        amountCents: input.amountCents,
        currency: "PKR",
        status: "OPEN",
      },
    });
  }

  let rawBody = "";
  let responsePayload: Record<string, unknown> = {};
  let responseStatus = 0;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestFields),
    });
    responseStatus = response.status;
    rawBody = await response.text();
    try {
      responsePayload = rawBody ? JSON.parse(rawBody) as Record<string, unknown> : {};
    } catch {
      responsePayload = { responseBody: rawBody };
    }
  } catch (error) {
    await prisma.payment.update({
      where: { id: paymentId! },
      data: {
        status: "FAILED",
        failureReason: "MOBILE_WALLET_API_REQUEST_FAILED",
        responseMessage: error instanceof Error ? error.message : "Failed to contact JazzCash mobile wallet API",
        verifiedAt: new Date(),
      },
    });
    await prisma.invoice.updateMany({ where: { paymentId: paymentId! }, data: { status: "FAILED" } });
    throw new Error("Failed to contact JazzCash mobile wallet API");
  }

  const callbackPayload: Record<string, unknown> = {
    ...responsePayload,
    pp_TxnRefNo: normalizeFieldValue(responsePayload.pp_TxnRefNo) || txnRefNo,
    pp_Amount: normalizeFieldValue(responsePayload.pp_Amount) || String(input.amountCents),
    pp_TxnCurrency: normalizeFieldValue(responsePayload.pp_TxnCurrency) || "PKR",
  };

  logSafe("mobile wallet api response", {
    reference: txnRefNo,
    httpStatus: responseStatus,
    responseCode: normalizeFieldValue(callbackPayload.pp_ResponseCode || callbackPayload.pp_PaymentResponseCode || null) || null,
    responseMessage: normalizeFieldValue(callbackPayload.pp_ResponseMessage || callbackPayload.pp_PaymentResponseMessage || null) || null,
    hasSecureHash: Boolean(normalizeFieldValue(callbackPayload.pp_SecureHash)),
  });

  const processed = await processJazzcashCallback(callbackPayload, "CALLBACK");
  const paymentStatus = String(processed.status ?? "FAILED") as "SUCCEEDED" | "FAILED" | "CANCELED" | "PENDING";
  const status = mapPaymentStatusToMobileWalletResult(paymentStatus);
  const message = normalizeFieldValue(responsePayload.pp_ResponseMessage || responsePayload.pp_PaymentResponseMessage || "")
    || (paymentStatus === "PENDING"
      ? "Payment request sent to your JazzCash mobile number. Please approve with MPIN on your phone."
      : paymentStatus === "SUCCEEDED"
        ? "Payment verified and subscription activated."
        : "JazzCash payment failed.");

  return {
    paymentId: paymentId!,
    reference: txnRefNo,
    status,
    paymentStatus,
    message,
    providerResponseCode: normalizeFieldValue(responsePayload.pp_ResponseCode || responsePayload.pp_PaymentResponseCode || null) || null,
  };
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

export async function processJazzcashCallback(payload: JazzcashCallbackInput, source: "CALLBACK" | "IPN" = "CALLBACK") {
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
    const currentStatus = payment.status === "SUCCEEDED" ? "success" : payment.status === "PENDING" ? "pending" : "failed";
    return { redirect: buildFrontendBillingUrl(currentStatus, reference, "Duplicate callback ignored"), status: payment.status as "SUCCEEDED" | "FAILED" | "CANCELED" | "PENDING" };
  }

  const eventId = `JAZZCASH:${reference}:${normalized.responseCode ?? "NO_CODE"}:${normalized.providerTxnId ?? "NO_TXN"}`;
  try {
    await prisma.paymentEvent.create({
      data: {
        paymentId: payment.id,
        eventId,
        source,
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
        redirect: buildFrontendBillingUrl(current?.status === "SUCCEEDED" ? "success" : current?.status === "PENDING" ? "pending" : "failed", reference, "Duplicate callback ignored"),
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
        status: finalStatus === "SUCCEEDED" ? "PAID" : finalStatus === "PENDING" ? "OPEN" : "FAILED",
        paidAt: finalStatus === "SUCCEEDED" ? new Date() : null,
        subscriptionId: finalStatus === "SUCCEEDED" ? subscriptionId : payment.subscriptionId,
      },
    });

    return { payment: updatedPayment, invoice: updatedInvoice, subscriptionId };
  });

  const redirectStatus = finalStatus === "SUCCEEDED" ? "success" : finalStatus === "PENDING" ? "pending" : "failed";
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
