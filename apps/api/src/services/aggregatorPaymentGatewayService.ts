import { createHash, randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { env } from "../config.js";
import {
  generateJazzcashSecureHash,
  getJazzcashEndpoint,
  getJazzcashStatusInquiryEndpoint,
  verifyJazzcashSecureHash,
} from "./jazzcash.js";

export const AGGREGATOR_GATEWAY_STATUSES = [
  "AGGREGATOR_GATEWAY_INITIATED",
  "AGGREGATOR_GATEWAY_REDIRECTED",
  "AGGREGATOR_GATEWAY_PENDING",
  "AGGREGATOR_GATEWAY_SUCCESS",
  "AGGREGATOR_GATEWAY_FAILED",
  "AGGREGATOR_GATEWAY_CANCELLED",
  "AGGREGATOR_GATEWAY_EXPIRED",
  "AGGREGATOR_GATEWAY_DUPLICATE_CALLBACK_BLOCKED",
  "AGGREGATOR_GATEWAY_MANUAL_RECONCILIATION_REQUIRED",
] as const;

export type AggregatorGatewayStatus = (typeof AGGREGATOR_GATEWAY_STATUSES)[number];

const SUCCESS_RESPONSE_CODES = new Set(["000", "121"]);
const PENDING_RESPONSE_CODES = new Set(["124", "157", "210"]);
const CANCELED_RESPONSE_CODES = new Set(["112", "129"]);

const PAYMENT_ELIGIBLE_BOOKING_STATUSES = new Set([
  "PAYMENT_PENDING_PLACEHOLDER",
  "DROP_PENDING",
  "PICKUP_PENDING_FUTURE",
]);

const MANUAL_PAYMENT_METHODS = [
  "BANK_TRANSFER",
  "JAZZCASH_WALLET_TRANSFER",
  "EASYPAISA_WALLET_TRANSFER",
  "OFFICE_CASH",
] as const;

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeDigits(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

function normalizeMobileNumber(value: unknown) {
  const digits = normalizeDigits(value);
  return /^03\d{9}$/.test(digits) ? digits : "";
}

function buildPkDateTime(date: Date) {
  const shifted = new Date(date.getTime() + 5 * 60 * 60 * 1000);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  const hours = String(shifted.getUTCHours()).padStart(2, "0");
  const minutes = String(shifted.getUTCMinutes()).padStart(2, "0");
  const seconds = String(shifted.getUTCSeconds()).padStart(2, "0");
  return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function buildOrderRef() {
  return `AGJ${buildPkDateTime(new Date())}${Math.floor(Math.random() * 900 + 100)}`;
}

function stripTrailingSlashes(value: string) {
  return String(value ?? "").trim().replace(/\/+$/, "");
}

function getApiOrigin() {
  const value = stripTrailingSlashes(String(env.API_ORIGIN ?? ""));
  return value || "";
}

function getFrontendOrigin() {
  const explicit = stripTrailingSlashes(String(env.FRONTEND_URL ?? ""));
  if (explicit) return explicit;
  return stripTrailingSlashes(String(env.WEB_ORIGIN ?? ""));
}

function getAggregatorCallbackUrl() {
  const apiOrigin = getApiOrigin();
  if (!apiOrigin) return "/api/aggregator-payments/jazzcash/callback";
  return `${apiOrigin}/api/aggregator-payments/jazzcash/callback`;
}

function buildAggregatorResultUrl(orderRef: string, status: AggregatorGatewayStatus, message?: string) {
  const frontendOrigin = getFrontendOrigin();
  const base = frontendOrigin
    ? `${frontendOrigin}/aggregator-bookings/payment/jazzcash/result`
    : "/aggregator-bookings/payment/jazzcash/result";
  const url = new URL(base, frontendOrigin || "http://localhost");
  url.searchParams.set("orderRef", orderRef);
  url.searchParams.set("status", status);
  if (message) {
    url.searchParams.set("message", message.slice(0, 180));
  }
  return frontendOrigin ? url.toString() : `${url.pathname}${url.search}`;
}

function getMissingGatewayCredentials() {
  const missing: string[] = [];
  if (!normalizeText(env.JAZZCASH_MERCHANT_ID)) missing.push("JAZZCASH_MERCHANT_ID");
  if (!normalizeText(env.JAZZCASH_PASSWORD)) missing.push("JAZZCASH_PASSWORD");
  if (!normalizeText(env.JAZZCASH_INTEGRITY_SALT)) missing.push("JAZZCASH_INTEGRITY_SALT");
  return missing;
}

function hasGatewayCredentials() {
  return getMissingGatewayCredentials().length === 0;
}

function toCanonicalPayloadHash(payload: Record<string, unknown>) {
  const keys = Object.keys(payload).sort((a, b) => a.localeCompare(b));
  const canonical = keys.map((key) => `${key}:${normalizeText(payload[key])}`).join("|");
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

function deriveStatusFromCallback(payload: Record<string, unknown>): AggregatorGatewayStatus {
  const responseCode = normalizeText(payload.pp_ResponseCode || payload.pp_PaymentResponseCode).toUpperCase();
  const statusText = normalizeText(payload.pp_Status || payload.status).toUpperCase();
  const message = normalizeText(payload.pp_ResponseMessage || payload.pp_PaymentResponseMessage).toUpperCase();

  if (statusText.includes("PEND") || PENDING_RESPONSE_CODES.has(responseCode)) {
    return "AGGREGATOR_GATEWAY_PENDING";
  }
  if (SUCCESS_RESPONSE_CODES.has(responseCode)) {
    return "AGGREGATOR_GATEWAY_SUCCESS";
  }
  if (statusText.includes("EXPIRE")) {
    return "AGGREGATOR_GATEWAY_EXPIRED";
  }
  if (CANCELED_RESPONSE_CODES.has(responseCode) || message.includes("CANCEL")) {
    return "AGGREGATOR_GATEWAY_CANCELLED";
  }
  return "AGGREGATOR_GATEWAY_FAILED";
}

function toPublicRequestPayload(fields: Record<string, string>, relayToken: string) {
  const { pp_Password: _ignoredPassword, pp_SecureHash: _ignoredSecureHash, ...safeFields } = fields;
  return { ...safeFields, relayToken };
}

function buildSignedHostedFields(input: {
  amount: number;
  orderRef: string;
  mobileNumber: string;
}) {
  const txnDateTime = buildPkDateTime(new Date());
  const txnExpiryDateTime = buildPkDateTime(addDays(new Date(), 1));

  const fields: Record<string, string> = {
    pp_Amount: String(input.amount),
    pp_BillReference: input.orderRef,
    pp_Description: "Aggregator booking payment",
    pp_Language: "EN",
    pp_MerchantID: normalizeText(env.JAZZCASH_MERCHANT_ID),
    pp_Password: normalizeText(env.JAZZCASH_PASSWORD),
    pp_ReturnURL: getAggregatorCallbackUrl(),
    pp_SubMerchantID: normalizeText(env.JAZZCASH_SUBMERCHANT_ID),
    pp_TxnCurrency: "PKR",
    pp_TxnDateTime: txnDateTime,
    pp_TxnExpiryDateTime: txnExpiryDateTime,
    pp_TxnRefNo: input.orderRef,
    pp_TxnType: normalizeText(env.JAZZCASH_TXN_TYPE) || "MWALLET",
    pp_Version: "1.1",
    pp_BankID: normalizeText(env.JAZZCASH_BANK_ID),
    pp_ProductID: normalizeText(env.JAZZCASH_PRODUCT_ID),
    ppmpf_1: input.mobileNumber,
    ppmpf_2: "",
    ppmpf_3: "",
    ppmpf_4: "",
    ppmpf_5: "",
  };

  fields.pp_SecureHash = generateJazzcashSecureHash(fields, { includeEmptyFields: false });
  return fields;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char] ?? char));
}

function renderRelayPage(actionUrl: string, fields: Record<string, string>) {
  const inputs = Object.entries(fields)
    .map(([key, value]) => `<input type="hidden" name="${escapeHtml(key)}" value="${escapeHtml(value)}" />`)
    .join("\n        ");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Redirecting to JazzCash</title>
  </head>
  <body>
    <form id="aggregator-jazzcash-relay" method="post" action="${escapeHtml(actionUrl)}">
      ${inputs}
    </form>
    <script>document.getElementById('aggregator-jazzcash-relay').submit();</script>
  </body>
</html>`;
}

async function getOwnedEligibleBooking(bookingId: string, userId: string) {
  const booking = await prisma.aggregatorBooking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      userId: true,
      status: true,
      bookingNo: true,
      totalOfficialPostalCharge: true,
      paymentStatus: true,
    },
  });

  if (!booking) {
    throw new Error("Booking not found");
  }
  if (booking.userId !== userId) {
    throw new Error("Forbidden");
  }
  if (!PAYMENT_ELIGIBLE_BOOKING_STATUSES.has(normalizeText(booking.status).toUpperCase())) {
    throw new Error("Booking is not eligible for gateway payment");
  }

  return booking;
}

async function getAdminBooking(bookingId: string) {
  const booking = await prisma.aggregatorBooking.findUnique({
    where: { id: bookingId },
    select: { id: true, userId: true, status: true, bookingNo: true },
  });
  if (!booking) {
    throw new Error("Booking not found");
  }
  return booking;
}

async function writeAuditLog(input: {
  bookingId: string;
  action: string;
  actorType: "CUSTOMER" | "ADMIN" | "SYSTEM";
  actorUserId: string;
  payload: Prisma.InputJsonValue;
}) {
  await prisma.aggregatorBookingAuditLog.create({
    data: {
      bookingId: input.bookingId,
      action: input.action,
      actorType: input.actorType,
      actorUserId: input.actorUserId,
      targetField: "aggregator_gateway_payment",
      oldValueJson: undefined,
      newValueJson: input.payload,
    },
  });
}

export function mapInquiryToAggregatorStatus(payload: Record<string, unknown>, hashVerified: boolean): AggregatorGatewayStatus {
  if (!hashVerified) {
    return "AGGREGATOR_GATEWAY_MANUAL_RECONCILIATION_REQUIRED";
  }
  return deriveStatusFromCallback(payload);
}

export async function getAggregatorGatewayOptions(input: { bookingId: string; userId: string }) {
  const booking = await getOwnedEligibleBooking(input.bookingId, input.userId);
  return {
    bookingId: booking.id,
    bookingNo: booking.bookingNo,
    methods: [
      ...MANUAL_PAYMENT_METHODS,
      "JAZZCASH_GATEWAY",
    ],
    gateway: {
      provider: "JAZZCASH",
      available: hasGatewayCredentials(),
      missingCredentials: getMissingGatewayCredentials(),
    },
    notice: "Payment success means payment received only. It is not final Pakistan Post booking confirmation.",
  };
}

export async function startAggregatorJazzcashPayment(input: {
  bookingId: string;
  userId: string;
  amount: number;
  currency?: string;
  mobileNumber: string;
}) {
  const booking = await getOwnedEligibleBooking(input.bookingId, input.userId);
  if (!hasGatewayCredentials()) {
    throw new Error("JazzCash credentials are not configured");
  }

  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("amount must be a positive number");
  }

  const currency = normalizeText(input.currency || "PKR").toUpperCase();
  if (currency !== "PKR") {
    throw new Error("Only PKR currency is supported");
  }

  const mobileNumber = normalizeMobileNumber(input.mobileNumber);
  if (!mobileNumber) {
    throw new Error("Enter a valid JazzCash mobile number in 03XXXXXXXXX format");
  }

  const orderRef = buildOrderRef();
  const relayToken = randomUUID();
  const idempotencyKey = `${booking.id}:${orderRef}:${mobileNumber}`;
  const fields = buildSignedHostedFields({ amount: Math.round(amount), orderRef, mobileNumber });

  const created = await prisma.aggregatorPaymentTransaction.create({
    data: {
      bookingId: booking.id,
      userId: input.userId,
      provider: "JAZZCASH",
      method: "JAZZCASH_GATEWAY",
      amount: Math.round(amount),
      currency,
      orderRef,
      status: "AGGREGATOR_GATEWAY_INITIATED",
      requestPayloadJson: toPublicRequestPayload(fields, relayToken) as Prisma.InputJsonValue,
      secureHashVerified: false,
      idempotencyKey,
      callbackHash: null,
      failureReason: null,
    },
  });

  await writeAuditLog({
    bookingId: booking.id,
    action: "AGGREGATOR_GATEWAY_INITIATED",
    actorType: "CUSTOMER",
    actorUserId: input.userId,
    payload: {
      orderRef,
      status: created.status,
      amount: created.amount,
      currency: created.currency,
      method: created.method,
      initiatedAt: created.createdAt.toISOString(),
      noPickupExecution: true,
      noDispatchExecution: true,
      noPakistanPostBookingApi: true,
      noFinalBookingConfirmation: true,
    } as Prisma.InputJsonValue,
  });

  return {
    bookingId: booking.id,
    orderRef,
    status: created.status,
    relayPath: `/api/aggregator-payments/jazzcash/relay?orderRef=${encodeURIComponent(orderRef)}&token=${encodeURIComponent(relayToken)}`,
    notice: "Payment success means payment received only. It is not final Pakistan Post booking confirmation.",
  };
}

export async function renderAggregatorJazzcashRelay(input: { orderRef: string; token: string }) {
  const orderRef = normalizeText(input.orderRef);
  const token = normalizeText(input.token);
  if (!orderRef || !token) {
    throw new Error("Missing payment session");
  }

  const transaction = await prisma.aggregatorPaymentTransaction.findUnique({
    where: { orderRef },
    select: {
      id: true,
      amount: true,
      currency: true,
      status: true,
      requestPayloadJson: true,
      callbackHash: true,
    },
  });

  if (!transaction) {
    throw new Error("Payment session not found");
  }
  if (transaction.status !== "AGGREGATOR_GATEWAY_INITIATED" && transaction.status !== "AGGREGATOR_GATEWAY_PENDING") {
    throw new Error("Payment session is not active");
  }

  const payload = (transaction.requestPayloadJson ?? {}) as Record<string, unknown>;
  const relayToken = normalizeText(payload.relayToken);
  if (!relayToken || relayToken !== token) {
    throw new Error("Invalid payment session token");
  }

  const mobileNumber = normalizeMobileNumber(payload.ppmpf_1 ?? "");
  const fields = buildSignedHostedFields({
    amount: transaction.amount,
    orderRef,
    mobileNumber: mobileNumber || "03000000000",
  });

  await prisma.aggregatorPaymentTransaction.update({
    where: { orderRef },
    data: {
      status: "AGGREGATOR_GATEWAY_REDIRECTED",
      failureReason: null,
    },
  });

  return renderRelayPage(getJazzcashEndpoint(), fields);
}

export async function processAggregatorJazzcashCallback(payload: Record<string, unknown>) {
  const callbackPayload = { ...payload };
  const orderRef = normalizeText(callbackPayload.pp_TxnRefNo || callbackPayload.orderRef || callbackPayload.reference);
  if (!orderRef) {
    throw new Error("Missing transaction reference");
  }

  const transaction = await prisma.aggregatorPaymentTransaction.findUnique({
    where: { orderRef },
    select: {
      id: true,
      bookingId: true,
      userId: true,
      amount: true,
      currency: true,
      status: true,
      callbackHash: true,
    },
  });

  if (!transaction) {
    throw new Error("Unknown transaction reference");
  }

  const callbackHash = toCanonicalPayloadHash(callbackPayload);
  if (transaction.callbackHash && transaction.callbackHash === callbackHash) {
    await prisma.aggregatorPaymentTransaction.update({
      where: { id: transaction.id },
      data: {
        status: "AGGREGATOR_GATEWAY_DUPLICATE_CALLBACK_BLOCKED",
      },
    });

    await writeAuditLog({
      bookingId: transaction.bookingId,
      action: "AGGREGATOR_GATEWAY_DUPLICATE_CALLBACK_BLOCKED",
      actorType: "SYSTEM",
      actorUserId: "system",
      payload: {
        orderRef,
        callbackHash,
        duplicateBlockedAt: new Date().toISOString(),
      } as Prisma.InputJsonValue,
    });

    return {
      orderRef,
      status: "AGGREGATOR_GATEWAY_DUPLICATE_CALLBACK_BLOCKED" as AggregatorGatewayStatus,
      duplicate: true,
      redirectUrl: buildAggregatorResultUrl(orderRef, "AGGREGATOR_GATEWAY_DUPLICATE_CALLBACK_BLOCKED", "Duplicate callback blocked"),
    };
  }

  const secureHash = normalizeText(callbackPayload.pp_SecureHash);
  const hashVerified = verifyJazzcashSecureHash(callbackPayload, secureHash || null);
  const amountFromCallback = Number(normalizeText(callbackPayload.pp_Amount || "0"));
  const currencyFromCallback = normalizeText(callbackPayload.pp_TxnCurrency || "PKR").toUpperCase();

  const amountMatches = amountFromCallback === Number(transaction.amount);
  const currencyMatches = currencyFromCallback === normalizeText(transaction.currency).toUpperCase();

  let mappedStatus: AggregatorGatewayStatus;
  let failureReason: string | null = null;
  if (!hashVerified) {
    mappedStatus = "AGGREGATOR_GATEWAY_MANUAL_RECONCILIATION_REQUIRED";
    failureReason = "INVALID_SECURE_HASH";
  } else if (!amountMatches) {
    mappedStatus = "AGGREGATOR_GATEWAY_MANUAL_RECONCILIATION_REQUIRED";
    failureReason = "AMOUNT_MISMATCH";
  } else if (!currencyMatches) {
    mappedStatus = "AGGREGATOR_GATEWAY_MANUAL_RECONCILIATION_REQUIRED";
    failureReason = "CURRENCY_MISMATCH";
  } else {
    mappedStatus = deriveStatusFromCallback(callbackPayload);
    failureReason = mappedStatus === "AGGREGATOR_GATEWAY_SUCCESS" ? null : normalizeText(callbackPayload.pp_ResponseCode || "FAILED") || "FAILED";
  }

  const gatewayTxnRef = normalizeText(
    callbackPayload.pp_RetreivalReferenceNo
      || callbackPayload.pp_RetrievalReferenceNo
      || callbackPayload.pp_TransactionId
      || callbackPayload.pp_TransactionID,
  ) || null;

  await prisma.aggregatorPaymentTransaction.update({
    where: { id: transaction.id },
    data: {
      status: mappedStatus,
      gatewayTxnRef,
      callbackPayloadJson: callbackPayload as Prisma.InputJsonValue,
      secureHashVerified: hashVerified,
      callbackHash,
      failureReason,
    },
  });

  await writeAuditLog({
    bookingId: transaction.bookingId,
    action: mappedStatus,
    actorType: "SYSTEM",
    actorUserId: "system",
    payload: {
      orderRef,
      status: mappedStatus,
      hashVerified,
      amountMatches,
      currencyMatches,
      callbackHash,
      failureReason,
      processedAt: new Date().toISOString(),
      noPickupExecution: true,
      noDispatchExecution: true,
      noPakistanPostBookingApi: true,
      noFinalBookingConfirmation: true,
    } as Prisma.InputJsonValue,
  });

  return {
    orderRef,
    status: mappedStatus,
    duplicate: false,
    redirectUrl: buildAggregatorResultUrl(orderRef, mappedStatus, failureReason ?? undefined),
  };
}

export async function getAggregatorJazzcashStatus(input: { bookingId: string; userId: string; withInquiry?: boolean }) {
  await getOwnedEligibleBooking(input.bookingId, input.userId);

  const transaction = await prisma.aggregatorPaymentTransaction.findFirst({
    where: {
      bookingId: input.bookingId,
      userId: input.userId,
      provider: "JAZZCASH",
      method: "JAZZCASH_GATEWAY",
    },
    orderBy: { createdAt: "desc" },
  });

  if (!transaction) {
    return null;
  }

  if (!input.withInquiry || transaction.status !== "AGGREGATOR_GATEWAY_PENDING") {
    return transaction;
  }

  const inquiryFields: Record<string, string> = {
    pp_TxnRefNo: transaction.orderRef,
    pp_MerchantID: normalizeText(env.JAZZCASH_MERCHANT_ID),
    pp_Password: normalizeText(env.JAZZCASH_PASSWORD),
  };
  inquiryFields.pp_SecureHash = generateJazzcashSecureHash(inquiryFields, { includeEmptyFields: false });

  const endpoint = getJazzcashStatusInquiryEndpoint();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(inquiryFields),
  });

  const bodyText = await response.text();
  let inquiryPayload: Record<string, unknown> = {};
  try {
    inquiryPayload = bodyText ? (JSON.parse(bodyText) as Record<string, unknown>) : {};
  } catch {
    inquiryPayload = { raw: bodyText };
  }

  const hashVerified = verifyJazzcashSecureHash(inquiryPayload, normalizeText(inquiryPayload.pp_SecureHash) || null);
  const mappedStatus = mapInquiryToAggregatorStatus(inquiryPayload, hashVerified);

  const updated = await prisma.aggregatorPaymentTransaction.update({
    where: { id: transaction.id },
    data: {
      status: mappedStatus,
      statusInquiryJson: inquiryPayload as Prisma.InputJsonValue,
      secureHashVerified: hashVerified,
      failureReason: mappedStatus === "AGGREGATOR_GATEWAY_SUCCESS" ? null : normalizeText(inquiryPayload.pp_ResponseCode || mappedStatus),
    },
  });

  await writeAuditLog({
    bookingId: updated.bookingId,
    action: "AGGREGATOR_GATEWAY_STATUS_INQUIRY",
    actorType: "SYSTEM",
    actorUserId: "system",
    payload: {
      orderRef: updated.orderRef,
      status: updated.status,
      hashVerified,
      inquiredAt: new Date().toISOString(),
    } as Prisma.InputJsonValue,
  });

  return updated;
}

export async function listAggregatorPaymentTransactionsForAdmin(bookingId: string) {
  await getAdminBooking(bookingId);
  return prisma.aggregatorPaymentTransaction.findMany({
    where: { bookingId },
    orderBy: { createdAt: "desc" },
  });
}

export async function adminReconcileAggregatorPayment(input: {
  bookingId: string;
  orderRef: string;
  adminUserId: string;
  reconciliationNote: string;
  status: AggregatorGatewayStatus;
}) {
  await getAdminBooking(input.bookingId);
  const updated = await prisma.aggregatorPaymentTransaction.update({
    where: { orderRef: normalizeText(input.orderRef) },
    data: {
      status: input.status,
      reconciliationNote: normalizeText(input.reconciliationNote),
    },
  });

  await writeAuditLog({
    bookingId: input.bookingId,
    action: "AGGREGATOR_GATEWAY_ADMIN_RECONCILE",
    actorType: "ADMIN",
    actorUserId: input.adminUserId,
    payload: {
      orderRef: updated.orderRef,
      status: updated.status,
      reconciliationNote: updated.reconciliationNote,
      reconciledAt: new Date().toISOString(),
    } as Prisma.InputJsonValue,
  });

  return updated;
}

export async function adminMarkAggregatorPaymentFailed(input: {
  bookingId: string;
  orderRef: string;
  adminUserId: string;
  reason: string;
}) {
  await getAdminBooking(input.bookingId);
  const updated = await prisma.aggregatorPaymentTransaction.update({
    where: { orderRef: normalizeText(input.orderRef) },
    data: {
      status: "AGGREGATOR_GATEWAY_FAILED",
      failureReason: normalizeText(input.reason),
    },
  });

  await writeAuditLog({
    bookingId: input.bookingId,
    action: "AGGREGATOR_GATEWAY_ADMIN_MARK_FAILED",
    actorType: "ADMIN",
    actorUserId: input.adminUserId,
    payload: {
      orderRef: updated.orderRef,
      status: updated.status,
      reason: updated.failureReason,
      markedFailedAt: new Date().toISOString(),
    } as Prisma.InputJsonValue,
  });

  return updated;
}

export async function adminAddAggregatorRefundNote(input: {
  bookingId: string;
  orderRef: string;
  adminUserId: string;
  note: string;
}) {
  await getAdminBooking(input.bookingId);
  const updated = await prisma.aggregatorPaymentTransaction.update({
    where: { orderRef: normalizeText(input.orderRef) },
    data: {
      reconciliationNote: normalizeText(input.note),
    },
  });

  await writeAuditLog({
    bookingId: input.bookingId,
    action: "AGGREGATOR_GATEWAY_ADMIN_REFUND_NOTE",
    actorType: "ADMIN",
    actorUserId: input.adminUserId,
    payload: {
      orderRef: updated.orderRef,
      note: updated.reconciliationNote,
      notedAt: new Date().toISOString(),
    } as Prisma.InputJsonValue,
  });

  return updated;
}

export function getAggregatorResultRoutePath() {
  return "/aggregator-bookings/payment/jazzcash/result";
}
