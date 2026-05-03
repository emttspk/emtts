import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { env } from "../config.js";

const FINAL_PAYMENT_STATUSES = new Set(["SUCCEEDED", "FAILED", "CANCELED", "EXPIRED"]);
const SUCCESS_STATUSES = new Set(["SUCCEEDED"]);
let billingTablesReady = false;

export type PaymentKind = "PURCHASE" | "UPGRADE" | "RENEWAL";
export type GatewaySource = "CHECKOUT" | "CALLBACK" | "WEBHOOK" | "VERIFY";
export type GatewayOutcome = "success" | "failed" | "canceled";

type SignaturePayload = {
  reference: string;
  status: string;
  transactionId: string;
  amountCents: number;
  timestamp: string;
};

type ProcessNotificationInput = SignaturePayload & {
  source: GatewaySource;
  signature?: string | null;
  eventId?: string | null;
  rawPayload?: Record<string, unknown>;
  failureReason?: string | null;
};

function gatewaySigningSecret() {
  return String(process.env.EP_GATEWAY_SECRET ?? env.JWT_SECRET);
}

function quote(value: string) {
  return value.replace(/"/g, "&quot;");
}

export function buildEpGatewaySignatureInput(payload: SignaturePayload) {
  return [
    payload.reference,
    payload.status,
    payload.transactionId,
    String(payload.amountCents),
    payload.timestamp,
  ].join("|");
}

export function signEpGatewayPayload(payload: SignaturePayload) {
  return createHmac("sha256", gatewaySigningSecret())
    .update(buildEpGatewaySignatureInput(payload))
    .digest("hex");
}

export function verifyEpGatewaySignature(payload: SignaturePayload, signature?: string | null) {
  if (!signature) return false;
  const expected = signEpGatewayPayload(payload);
  const left = Buffer.from(expected, "utf8");
  const right = Buffer.from(String(signature).trim(), "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function buildHostedCheckoutUrl(reference: string, checkoutToken: string) {
  return `/api/subscriptions/checkout/${encodeURIComponent(reference)}?token=${encodeURIComponent(checkoutToken)}`;
}

export function buildBillingRedirectUrl(status: string, reference: string) {
  const normalized = String(status ?? "").trim().toUpperCase();
  const payment = normalized === "SUCCEEDED" ? "success" : normalized === "CANCELED" ? "canceled" : "failed";
  return `${env.WEB_ORIGIN.replace(/\/$/, "")}/billing?payment=${encodeURIComponent(payment)}&reference=${encodeURIComponent(reference)}`;
}

function buildPaymentReference() {
  return `EP${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}${randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`;
}

function buildInvoiceNumber() {
  return `INV-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}-${randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

function resolvePaymentKind(planId: string, activeSubscription: { planId: string; currentPeriodEnd: Date } | null): PaymentKind {
  if (!activeSubscription) return "PURCHASE";
  if (activeSubscription.planId === planId) return "RENEWAL";
  return "UPGRADE";
}

function addPlanDuration(end: Date, planName: string) {
  if (planName.toLowerCase().includes("free")) {
    end.setUTCDate(end.getUTCDate() + 15);
    return;
  }
  end.setUTCMonth(end.getUTCMonth() + 1);
}

function buildSubscriptionWindow(planName: string, kind: PaymentKind, existingSubscription: { currentPeriodEnd: Date } | null) {
  const now = new Date();
  const start = kind === "RENEWAL" && existingSubscription && existingSubscription.currentPeriodEnd > now
    ? new Date(existingSubscription.currentPeriodEnd)
    : new Date(now);
  const end = new Date(start);
  addPlanDuration(end, planName);
  return { start, end };
}

export function mapOutcomeToStatus(outcome: GatewayOutcome) {
  if (outcome === "success") return "SUCCEEDED";
  if (outcome === "canceled") return "CANCELED";
  return "FAILED";
}

function buildPayloadHash(payload: Record<string, unknown>) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export async function ensureBillingTables() {
  if (billingTablesReady) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Payment" (
      "id" TEXT PRIMARY KEY,
      "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
      "planId" TEXT NOT NULL REFERENCES "Plan"("id") ON DELETE RESTRICT,
      "subscriptionId" TEXT REFERENCES "Subscription"("id") ON DELETE SET NULL,
      "provider" TEXT NOT NULL DEFAULT 'EP_GATEWAY',
      "reference" TEXT NOT NULL UNIQUE,
      "gatewayOrderId" TEXT NOT NULL UNIQUE,
      "gatewayTransactionId" TEXT,
      "idempotencyKey" TEXT NOT NULL UNIQUE,
      "checkoutToken" TEXT NOT NULL UNIQUE,
      "kind" TEXT NOT NULL DEFAULT 'PURCHASE',
      "status" TEXT NOT NULL DEFAULT 'PENDING',
      "amountCents" INTEGER NOT NULL,
      "currency" TEXT NOT NULL DEFAULT 'PKR',
      "verifiedAt" TIMESTAMP,
      "paidAt" TIMESTAMP,
      "failureReason" TEXT,
      "metadata" JSONB,
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Payment_userId_status_idx" ON "Payment"("userId", "status")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Payment_planId_idx" ON "Payment"("planId")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Payment_subscriptionId_idx" ON "Payment"("subscriptionId")`);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Invoice" (
      "id" TEXT PRIMARY KEY,
      "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
      "planId" TEXT NOT NULL REFERENCES "Plan"("id") ON DELETE RESTRICT,
      "paymentId" TEXT NOT NULL UNIQUE REFERENCES "Payment"("id") ON DELETE CASCADE,
      "subscriptionId" TEXT REFERENCES "Subscription"("id") ON DELETE SET NULL,
      "invoiceNumber" TEXT NOT NULL UNIQUE,
      "amountCents" INTEGER NOT NULL,
      "currency" TEXT NOT NULL DEFAULT 'PKR',
      "status" TEXT NOT NULL DEFAULT 'OPEN',
      "issuedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "paidAt" TIMESTAMP,
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Invoice_userId_status_idx" ON "Invoice"("userId", "status")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Invoice_planId_idx" ON "Invoice"("planId")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Invoice_subscriptionId_idx" ON "Invoice"("subscriptionId")`);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "PaymentEvent" (
      "id" TEXT PRIMARY KEY,
      "paymentId" TEXT NOT NULL REFERENCES "Payment"("id") ON DELETE CASCADE,
      "eventId" TEXT NOT NULL UNIQUE,
      "source" TEXT NOT NULL,
      "status" TEXT NOT NULL,
      "payloadHash" TEXT NOT NULL,
      "signature" TEXT,
      "payloadJson" JSONB NOT NULL,
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE("paymentId", "source", "payloadHash")
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PaymentEvent_paymentId_source_idx" ON "PaymentEvent"("paymentId", "source")`);
  billingTablesReady = true;
}

export async function createSubscriptionPaymentIntent(userId: string, planId: string) {
  await ensureBillingTables();

  const [plan, activeSubscription, pendingPayment] = await Promise.all([
    prisma.plan.findUnique({ where: { id: planId } }),
    prisma.subscription.findFirst({
      where: { userId, status: "ACTIVE" },
      include: { plan: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.payment.findFirst({
      where: { userId, planId, status: "PENDING" },
      include: { invoice: true, plan: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  if (!plan) {
    throw new Error("Plan not found");
  }

  if (plan.priceCents <= 0) {
    return { plan, activeSubscription, pendingPayment: null };
  }

  if (pendingPayment && pendingPayment.createdAt.getTime() > Date.now() - 30 * 60 * 1000) {
    return {
      plan,
      activeSubscription,
      pendingPayment,
      invoice: pendingPayment.invoice,
      checkoutUrl: buildHostedCheckoutUrl(pendingPayment.reference, pendingPayment.checkoutToken),
      requiresRedirect: true,
    };
  }

  const kind = resolvePaymentKind(planId, activeSubscription ? { planId: activeSubscription.planId, currentPeriodEnd: activeSubscription.currentPeriodEnd } : null);
  const reference = buildPaymentReference();
  const checkoutToken = randomUUID();
  const paymentId = randomUUID();
  const invoiceId = randomUUID();

  const result = await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: {
        id: paymentId,
        userId,
        planId,
        provider: "EP_GATEWAY",
        reference,
        gatewayOrderId: reference,
        idempotencyKey: `${userId}:${planId}:${reference}`,
        checkoutToken,
        kind,
        status: "PENDING",
        amountCents: plan.priceCents,
        currency: "PKR",
        metadata: {
          activeSubscriptionId: activeSubscription?.id ?? null,
          activePlanId: activeSubscription?.planId ?? null,
          activePlanName: activeSubscription?.plan?.name ?? null,
        },
      },
      include: { plan: true },
    });

    const invoice = await tx.invoice.create({
      data: {
        id: invoiceId,
        userId,
        planId,
        paymentId,
        invoiceNumber: buildInvoiceNumber(),
        amountCents: plan.priceCents,
        currency: "PKR",
        status: "OPEN",
      },
    });

    return { payment, invoice };
  });

  return {
    plan,
    activeSubscription,
    pendingPayment: result.payment,
    invoice: result.invoice,
    checkoutUrl: buildHostedCheckoutUrl(result.payment.reference, checkoutToken),
    requiresRedirect: true,
  };
}

async function activatePaidSubscription(payment: {
  id: string;
  userId: string;
  planId: string;
  kind: string;
  metadata: unknown;
  plan: { name: string };
}) {
  const existingActive = await prisma.subscription.findFirst({
    where: { userId: payment.userId, status: "ACTIVE" },
    include: { plan: true },
    orderBy: { createdAt: "desc" },
  });

  const kind = String(payment.kind) as PaymentKind;
  const window = buildSubscriptionWindow(payment.plan.name, kind, existingActive ? { currentPeriodEnd: existingActive.currentPeriodEnd } : null);

  return prisma.$transaction(async (tx) => {
    await tx.subscription.updateMany({
      where: { userId: payment.userId, status: "ACTIVE" },
      data: { status: "CANCELED" },
    });

    return tx.subscription.create({
      data: {
        userId: payment.userId,
        planId: payment.planId,
        status: "ACTIVE",
        currentPeriodStart: window.start,
        currentPeriodEnd: window.end,
      },
      include: { plan: true },
    });
  });
}

export async function processEpGatewayNotification(input: ProcessNotificationInput) {
  await ensureBillingTables();

  const payment = await prisma.payment.findUnique({
    where: { reference: input.reference },
    include: { plan: true, invoice: true },
  });

  if (!payment) {
    throw new Error("Payment not found");
  }

  const payload = {
    reference: input.reference,
    status: input.status,
    transactionId: input.transactionId,
    amountCents: input.amountCents,
    timestamp: input.timestamp,
    source: input.source,
    failureReason: input.failureReason ?? null,
    ...(input.rawPayload ?? {}),
  } as Record<string, unknown>;

  if ((input.source === "CALLBACK" || input.source === "WEBHOOK") && !verifyEpGatewaySignature(input, input.signature)) {
    throw new Error("Invalid EP Gateway signature");
  }

  const eventId = String(input.eventId ?? `${input.source}:${input.reference}:${input.status}:${input.transactionId}`);
  const payloadHash = buildPayloadHash(payload);
  const nextStatus = String(input.status).trim().toUpperCase();

  try {
    await prisma.paymentEvent.create({
      data: {
        paymentId: payment.id,
        eventId,
        source: input.source,
        status: nextStatus,
        payloadHash,
        signature: input.signature ?? null,
        payloadJson: payload as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    if (error instanceof Error && /unique|constraint/i.test(error.message)) {
      return { payment, invoice: payment.invoice, duplicate: true, replayPrevented: false, subscription: null };
    }
    throw error;
  }

  if (FINAL_PAYMENT_STATUSES.has(payment.status) && payment.status !== nextStatus) {
    return { payment, invoice: payment.invoice, duplicate: false, replayPrevented: true, subscription: null };
  }

  if (payment.status === nextStatus) {
    return { payment, invoice: payment.invoice, duplicate: false, replayPrevented: false, subscription: null };
  }

  let subscriptionId: string | null = payment.subscriptionId ?? null;
  let activatedSubscription: Awaited<ReturnType<typeof activatePaidSubscription>> | null = null;

  if (SUCCESS_STATUSES.has(nextStatus)) {
    activatedSubscription = await activatePaidSubscription(payment);
    subscriptionId = activatedSubscription.id;
  }

  const updated = await prisma.$transaction(async (tx) => {
    const updatedPayment = await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: nextStatus,
        gatewayTransactionId: input.transactionId,
        verifiedAt: new Date(),
        paidAt: SUCCESS_STATUSES.has(nextStatus) ? new Date() : null,
        failureReason: SUCCESS_STATUSES.has(nextStatus) ? null : input.failureReason ?? nextStatus,
        subscriptionId,
      },
      include: { plan: true, invoice: true },
    });

    const updatedInvoice = await tx.invoice.update({
      where: { paymentId: payment.id },
      data: {
        status: SUCCESS_STATUSES.has(nextStatus) ? "PAID" : "VOID",
        paidAt: SUCCESS_STATUSES.has(nextStatus) ? new Date() : null,
        subscriptionId,
      },
    });

    return { payment: updatedPayment, invoice: updatedInvoice };
  });

  return {
    payment: updated.payment,
    invoice: updated.invoice,
    duplicate: false,
    replayPrevented: false,
    subscription: activatedSubscription,
  };
}

export async function getPaymentForUser(userId: string, reference: string) {
  await ensureBillingTables();
  return prisma.payment.findFirst({
    where: { userId, reference },
    include: { plan: true, invoice: true, subscription: { include: { plan: true } }, events: { orderBy: { createdAt: "asc" } } },
  });
}

export async function getLatestPendingPayment(userId: string) {
  await ensureBillingTables();
  return prisma.payment.findFirst({
    where: { userId, status: "PENDING" },
    include: { plan: true, invoice: true },
    orderBy: { createdAt: "desc" },
  });
}

export function renderHostedCheckoutPage(payment: {
  amountCents: number;
  checkoutToken: string;
  plan: { name: string };
  reference: string;
}) {
  const actionBase = `/api/subscriptions/checkout/${encodeURIComponent(payment.reference)}/complete`;
  const price = Math.round(payment.amountCents / 100).toLocaleString("en-PK");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>EP Gateway Checkout</title>
    <style>
      :root { color-scheme: light; }
      body { margin: 0; font-family: Georgia, "Times New Roman", serif; background: linear-gradient(135deg, #f7f0e6, #e4ecf5); color: #1f2937; }
      main { max-width: 720px; margin: 48px auto; padding: 32px; background: rgba(255,255,255,0.9); border: 1px solid rgba(31,41,55,0.12); border-radius: 24px; box-shadow: 0 24px 80px rgba(15, 23, 42, 0.12); }
      h1 { margin: 0 0 12px; font-size: 2rem; }
      p { line-height: 1.6; }
      .meta { display: grid; gap: 12px; margin: 24px 0; padding: 20px; border-radius: 18px; background: #f9fafb; }
      .meta strong { display: inline-block; width: 170px; }
      .actions { display: grid; gap: 12px; margin-top: 28px; }
      button { border: 0; border-radius: 999px; padding: 14px 18px; font-size: 1rem; cursor: pointer; }
      .success { background: #0f766e; color: white; }
      .failed { background: #b91c1c; color: white; }
      .cancel { background: #cbd5e1; color: #0f172a; }
      .note { margin-top: 20px; font-size: 0.95rem; color: #475569; }
    </style>
  </head>
  <body>
    <main>
      <h1>EP Gateway Hosted Checkout</h1>
      <p>This mock checkout exercises the same payment state machine your SaaS billing flow uses for callback, verification, invoice settlement, and subscription activation.</p>
      <div class="meta">
        <div><strong>Reference</strong> ${quote(payment.reference)}</div>
        <div><strong>Plan</strong> ${quote(payment.plan.name)}</div>
        <div><strong>Amount</strong> Rs. ${quote(price)} / month</div>
      </div>
      <div class="actions">
        <form method="post" action="${actionBase}?outcome=success&token=${encodeURIComponent(payment.checkoutToken)}">
          <button class="success" type="submit">Pay Successfully</button>
        </form>
        <form method="post" action="${actionBase}?outcome=failed&token=${encodeURIComponent(payment.checkoutToken)}">
          <button class="failed" type="submit">Mark Payment Failed</button>
        </form>
        <form method="post" action="${actionBase}?outcome=canceled&token=${encodeURIComponent(payment.checkoutToken)}">
          <button class="cancel" type="submit">Cancel Payment</button>
        </form>
      </div>
      <p class="note">In production, this URL is where the EP Gateway redirect should land after initiation. The mock page is only a hosted checkout substitute until live EP credentials and endpoints are wired.</p>
    </main>
  </body>
</html>`;
}