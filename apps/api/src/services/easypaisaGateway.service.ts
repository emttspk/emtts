import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../config.js";

const SUCCESS_CODES = new Set(splitCsv(env.EP_GATEWAY_STATUS_SUCCESS_VALUES ?? "SUCCESS,SUCCEEDED,PAID,00,000"));
const FAILED_CODES = new Set(splitCsv(env.EP_GATEWAY_STATUS_FAILED_VALUES ?? "FAILED,FAIL,ERROR,01,999"));
const CANCELED_CODES = new Set(splitCsv(env.EP_GATEWAY_STATUS_CANCELED_VALUES ?? "CANCELED,CANCELLED,CANCEL"));

type AnyPayload = Record<string, unknown>;

export type EasypaisaNotification = {
  reference: string;
  status: string;
  transactionId: string;
  amountCents: number;
  timestamp: string;
  signature: string | null;
  eventId: string | null;
  failureReason: string | null;
  rawPayload: AnyPayload;
  signatureVerified: boolean;
};

type InitiatePaymentInput = {
  reference: string;
  amountCents: number;
  callbackUrl: string;
  returnUrl: string;
  successUrl?: string;
  failureUrl?: string;
  webhookUrl?: string;
  customerEmail?: string | null;
  customerMobile?: string | null;
  description: string;
};

function splitCsv(value: string) {
  return value
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
}

function nowIso() {
  return new Date().toISOString();
}

function toRupees(amountCents: number) {
  return (amountCents / 100).toFixed(2);
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function getFirst(payload: AnyPayload, keys: string[]) {
  for (const key of keys) {
    const value = payload[key];
    if (value === null || value === undefined) continue;
    const text = normalizeText(value);
    if (text) return text;
  }
  return "";
}

function normalizeAmountCents(value: unknown) {
  const asText = normalizeText(value).replace(/[,\s]/g, "");
  if (!asText) return 0;
  const number = Number(asText);
  if (!Number.isFinite(number)) return 0;
  if (asText.includes(".")) return Math.round(number * 100);
  if (number >= 1000) return Math.round(number);
  return Math.round(number * 100);
}

function signatureSecret() {
  return String(env.EP_GATEWAY_SECRET ?? env.JWT_SECRET).trim();
}

function buildSignaturePayload(payload: AnyPayload) {
  const fieldList = splitCsv(env.EP_GATEWAY_SIGNATURE_FIELDS ?? "reference,status,transactionId,amountCents,timestamp").map((entry) =>
    entry.toLowerCase(),
  );
  const format = String(env.EP_GATEWAY_SIGNATURE_FORMAT ?? "values").trim().toLowerCase();

  const fieldValues = fieldList.map((field) => {
    const value = payload[field] ?? payload[field.toUpperCase()];
    return normalizeText(value);
  });

  if (format === "kv") {
    return fieldList.map((field, index) => `${field}=${fieldValues[index]}`).join("&");
  }

  return fieldValues.join("|");
}

export function signGatewayPayload(payload: AnyPayload) {
  const method = String(env.EP_GATEWAY_SIGNATURE_METHOD ?? "hmac").trim().toLowerCase();
  const algo = String(env.EP_GATEWAY_SIGNATURE_ALGO ?? "sha256").trim().toLowerCase();
  const base = buildSignaturePayload(payload);
  const secret = signatureSecret();

  if (method === "hash-append-secret") {
    return createHash(algo).update(`${base}${secret}`).digest("hex");
  }

  return createHmac(algo, secret).update(base).digest("hex");
}

export function verifyGatewayPayloadSignature(payload: AnyPayload, signature?: string | null) {
  if (!signature) return false;
  const expected = signGatewayPayload(payload);
  const left = Buffer.from(expected, "utf8");
  const right = Buffer.from(String(signature).trim(), "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function mapGatewayStatus(rawStatus: string) {
  const status = rawStatus.trim().toUpperCase();
  if (SUCCESS_CODES.has(status)) return "SUCCEEDED";
  if (CANCELED_CODES.has(status)) return "CANCELED";
  if (FAILED_CODES.has(status)) return "FAILED";
  if (status === "EXPIRED") return "EXPIRED";
  return status || "FAILED";
}

function ensureGatewayConfigured() {
  if (!env.EP_GATEWAY_INITIATE_URL) {
    throw new Error("EP_GATEWAY_INITIATE_URL is not configured");
  }
  if (!env.EP_GATEWAY_INQUIRY_URL) {
    throw new Error("EP_GATEWAY_INQUIRY_URL is not configured");
  }
}

export async function initiateEasypaisaPayment(input: InitiatePaymentInput) {
  ensureGatewayConfigured();
  const initiateUrl = env.EP_GATEWAY_INITIATE_URL;
  if (!initiateUrl) {
    throw new Error("EP_GATEWAY_INITIATE_URL is not configured");
  }

  const initiatedAt = nowIso();
  const amount = toRupees(input.amountCents);
  const paymentMode = String(env.EP_GATEWAY_PAYMENT_MODE ?? "CC").trim().toUpperCase() || "CC";
  const payload: AnyPayload = {
    merchantId: env.EP_GATEWAY_MERCHANT_ID ?? "",
    storeId: env.EP_GATEWAY_STORE_ID ?? "",
    username: env.EP_GATEWAY_USERNAME ?? "",
    password: env.EP_GATEWAY_PASSWORD ?? "",
    reference: input.reference,
    transactionId: input.reference,
    amount,
    amountCents: input.amountCents,
    currency: "PKR",
    callbackUrl: input.callbackUrl,
    returnUrl: input.returnUrl,
    successUrl: input.successUrl ?? input.returnUrl,
    failureUrl: input.failureUrl ?? input.returnUrl,
    webhookUrl: input.webhookUrl ?? input.callbackUrl,
    description: input.description,
    timestamp: initiatedAt,
    paymentMode,
    channel: paymentMode,
    customerEmail: input.customerEmail ?? "",
  };

  const signature = signGatewayPayload({
    reference: payload.reference,
    status: "PENDING",
    transactionId: payload.transactionId,
    amountCents: payload.amountCents,
    timestamp: payload.timestamp,
  });

  payload.signature = signature;
  payload.secureHash = signature;

  const contentType = String(env.EP_GATEWAY_INITIATE_CONTENT_TYPE ?? "application/json").trim().toLowerCase();
  const timeoutMs = Number(env.EP_GATEWAY_REQUEST_TIMEOUT_MS ?? 15000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(initiateUrl, {
      method: "POST",
      headers:
        contentType === "application/x-www-form-urlencoded"
          ? { "content-type": "application/x-www-form-urlencoded" }
          : { "content-type": "application/json" },
      body:
        contentType === "application/x-www-form-urlencoded"
          ? new URLSearchParams(
              Object.entries(payload).map(([key, value]) => [key, normalizeText(value)]),
            ).toString()
          : JSON.stringify(payload),
      signal: controller.signal,
    });

    const responseText = await response.text();
    let responseBody: AnyPayload = {};

    try {
      responseBody = JSON.parse(responseText) as AnyPayload;
    } catch {
      responseBody = { raw: responseText };
    }

    if (!response.ok) {
      throw new Error(`Gateway initiation failed (${response.status})`);
    }

    const redirectUrl = getFirst(responseBody, [
      "redirectUrl",
      "checkoutUrl",
      "paymentUrl",
      "redirect_url",
      "checkout_url",
      "pp_RedirectURL",
      "pp_PaymentURL",
    ]);

    if (!redirectUrl) {
      throw new Error("Gateway initiation did not return redirectUrl");
    }

    const gatewayTransactionId = getFirst(responseBody, [
      "transactionId",
      "transaction_id",
      "gatewayTransactionId",
      "pp_TransactionId",
      "pp_RetreivalReferenceNo",
    ]);

    return {
      redirectUrl,
      gatewayTransactionId: gatewayTransactionId || input.reference,
      requestPayload: payload,
      responsePayload: responseBody,
      signature,
    };
  } finally {
    clearTimeout(timer);
  }
}

export function normalizeGatewayNotification(rawPayload: AnyPayload, fallbackReference = ""): EasypaisaNotification {
  const reference = getFirst(rawPayload, [
    "reference",
    "merchantPaymentReference",
    "orderId",
    "order_id",
    "transactionRef",
    "txnRefNumber",
    "pp_TxnRefNo",
  ]) || fallbackReference;

  const statusRaw = getFirst(rawPayload, [
    "status",
    "paymentStatus",
    "transactionStatus",
    "responseCode",
    "pp_ResponseCode",
    "result",
  ]);

  const transactionId = getFirst(rawPayload, [
    "transactionId",
    "txnId",
    "transaction_id",
    "providerTransactionId",
    "pp_TransactionId",
    "pp_RetreivalReferenceNo",
  ]) || reference;

  const amountCents = normalizeAmountCents(
    rawPayload.amountCents ?? rawPayload.amount ?? rawPayload.pp_Amount ?? rawPayload.totalAmount,
  );

  const timestamp =
    getFirst(rawPayload, ["timestamp", "transactionDateTime", "createdAt", "dateTime", "pp_TxnDateTime"]) || nowIso();

  const signature = getFirst(rawPayload, [
    "signature",
    "hash",
    "secureHash",
    "xSignature",
    "pp_SecureHash",
  ]) || null;

  const eventId =
    getFirst(rawPayload, ["eventId", "event_id", "notificationId", "pp_BillReference", "providerEventId"]) ||
    `EP:${reference}:${transactionId}:${statusRaw || "UNKNOWN"}`;

  const normalizedStatus = mapGatewayStatus(statusRaw);
  const failureReason = normalizedStatus === "SUCCEEDED" ? null : normalizedStatus;

  const signaturePayload = {
    reference,
    status: normalizedStatus,
    transactionId,
    amountCents,
    timestamp,
  };

  return {
    reference,
    status: normalizedStatus,
    transactionId,
    amountCents,
    timestamp,
    signature,
    eventId,
    failureReason,
    rawPayload,
    signatureVerified: verifyGatewayPayloadSignature(signaturePayload, signature),
  };
}

export async function inquireEasypaisaPayment(reference: string) {
  ensureGatewayConfigured();
  const inquiryUrl = env.EP_GATEWAY_INQUIRY_URL;
  if (!inquiryUrl) {
    throw new Error("EP_GATEWAY_INQUIRY_URL is not configured");
  }

  const requestPayload: AnyPayload = {
    merchantId: env.EP_GATEWAY_MERCHANT_ID ?? "",
    storeId: env.EP_GATEWAY_STORE_ID ?? "",
    username: env.EP_GATEWAY_USERNAME ?? "",
    password: env.EP_GATEWAY_PASSWORD ?? "",
    reference,
    timestamp: nowIso(),
  };

  requestPayload.signature = signGatewayPayload({
    reference,
    status: "VERIFY",
    transactionId: reference,
    amountCents: 0,
    timestamp: requestPayload.timestamp,
  });

  const timeoutMs = Number(env.EP_GATEWAY_REQUEST_TIMEOUT_MS ?? 15000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(inquiryUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requestPayload),
      signal: controller.signal,
    });

    const responseText = await response.text();
    if (!response.ok) {
      throw new Error(`Gateway inquiry failed (${response.status})`);
    }

    let responseBody: AnyPayload = {};
    try {
      responseBody = JSON.parse(responseText) as AnyPayload;
    } catch {
      responseBody = { raw: responseText };
    }

    return normalizeGatewayNotification(responseBody, reference);
  } finally {
    clearTimeout(timer);
  }
}
