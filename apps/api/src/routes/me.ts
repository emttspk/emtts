import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { COMPLAINT_UNIT_COST, getComplaintAllowance, getLatestUnitSnapshot } from "../usage/unitConsumption.js";
import { buildHostedCheckoutUrl, getLatestPendingPayment } from "../services/epGatewayBilling.service.js";
import { getPlanExtrasByIds } from "./plans.js";
import { getRequestSignalHashes, hashAccountSignal } from "../auth/security.js";

export const meRouter = Router();

meRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const userId = req.user!.id;
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      role: true,
      createdAt: true,
      username: true,
      onboardingComplete: true,
      companyName: true,
      address: true,
      contactNumber: true,
      cnic: true,
      originCity: true,
      extraLabelCredits: true,
      extraTrackingCredits: true,
    },
  });
  if (!user) return res.status(404).json({ error: "Not found" });

  const subscription = await prisma.subscription.findFirst({
    where: { userId, status: "ACTIVE" },
    include: { plan: true },
    orderBy: { createdAt: "desc" },
  });
  const pendingPayment = await getLatestPendingPayment(userId);
  const planExtrasMap = subscription?.planId ? await getPlanExtrasByIds([subscription.planId]) : new Map();
  const subscriptionPlanExtras = subscription?.planId ? planExtrasMap.get(subscription.planId) : null;

  const snapshot = await getLatestUnitSnapshot(userId);
  const month = snapshot.month;
  const usage = {
    labelsGenerated: snapshot.labelsGenerated,
    labelsQueued: snapshot.labelsQueued,
    trackingGenerated: snapshot.trackingGenerated,
    trackingQueued: snapshot.trackingQueued,
  };

  const labelLimit = snapshot.labelLimit;
  const trackingLimit = snapshot.trackingLimit;
  const labelsQueued = snapshot.labelsQueued;
  const trackingGenerated = snapshot.trackingGenerated;
  const trackingQueued = snapshot.trackingQueued;
  const complaintAllowance = await getComplaintAllowance(userId);
  const usedUnits = (usage.labelsGenerated ?? 0) + labelsQueued;
  const remainingUnits = snapshot.remainingUnits;
  const periodEnd = subscription?.currentPeriodEnd ? new Date(subscription.currentPeriodEnd) : null;
  const isExpired = !periodEnd || periodEnd.getTime() < Date.now();
  const isNearExpiry = Boolean(periodEnd && periodEnd.getTime() - Date.now() <= 3 * 24 * 60 * 60 * 1000 && !isExpired);
  const isLegacyMockAvailable = process.env.NODE_ENV !== "production";

  const pendingPaymentPayload = pendingPayment
    ? {
        provider: pendingPayment.provider,
        reference: pendingPayment.reference,
        status: pendingPayment.status,
        kind: pendingPayment.kind,
        planId: pendingPayment.planId,
        amountCents: pendingPayment.amountCents,
        currency: pendingPayment.currency,
        planName: pendingPayment.plan.name,
        invoice: pendingPayment.invoice
          ? {
              id: pendingPayment.invoice.id,
              invoiceNumber: pendingPayment.invoice.invoiceNumber,
              amountCents: pendingPayment.invoice.amountCents,
              currency: pendingPayment.invoice.currency,
              status: pendingPayment.invoice.status,
            }
          : null,
        resumeMode: pendingPayment.provider === "JAZZCASH" ? "JAZZCASH" : "MANUAL",
        legacyMockCheckout: pendingPayment.provider === "EP_GATEWAY" && isLegacyMockAvailable
          ? {
              enabled: true,
              checkoutUrl: buildHostedCheckoutUrl(pendingPayment.reference, pendingPayment.checkoutToken),
            }
          : null,
        createdAt: pendingPayment.createdAt,
      }
    : null;

  return res.json({
    user,
    onboardingRequired: !user.onboardingComplete,
    subscription: subscription
      ? {
          id: subscription.id,
          status: subscription.status,
          plan: {
            ...subscription.plan,
            fullPriceCents: subscriptionPlanExtras?.fullPriceCents ?? subscription.plan.priceCents,
            discountPriceCents: subscriptionPlanExtras?.discountPriceCents ?? subscription.plan.priceCents,
            discountPct: subscriptionPlanExtras?.discountPct ?? 0,
            isSuspended: subscriptionPlanExtras?.isSuspended ?? false,
            unitsIncluded: subscriptionPlanExtras?.unitsIncluded ?? subscription.plan.monthlyLabelLimit,
            labelsIncluded: subscriptionPlanExtras?.labelsIncluded ?? subscription.plan.monthlyLabelLimit,
            trackingIncluded: subscriptionPlanExtras?.trackingIncluded ?? subscription.plan.monthlyTrackingLimit,
            moneyOrdersIncluded: subscriptionPlanExtras?.moneyOrdersIncluded ?? subscription.plan.monthlyLabelLimit,
            complaintsIncluded: subscriptionPlanExtras?.complaintsIncluded ?? complaintAllowance.monthlyLimit,
            dailyComplaintLimit: subscriptionPlanExtras?.dailyComplaintLimit ?? complaintAllowance.dailyLimit,
            monthlyComplaintLimit: subscriptionPlanExtras?.monthlyComplaintLimit ?? complaintAllowance.monthlyLimit,
          },
          currentPeriodStart: subscription.currentPeriodStart,
          currentPeriodEnd: subscription.currentPeriodEnd,
        }
      : null,
    usage: {
      month,
      labelsGenerated: usage.labelsGenerated ?? 0,
      labelsQueued,
      trackingGenerated,
      trackingQueued,
    },
    balances: {
      labelLimit,
      trackingLimit,
      labelsRemaining: remainingUnits,
      trackingRemaining: Math.max(0, trackingLimit - (trackingGenerated + trackingQueued)),
      unitsRemaining: remainingUnits,
      total_units: labelLimit,
      used_units: usedUnits,
      complaintUnitCost: COMPLAINT_UNIT_COST,
      complaintDailyLimit: complaintAllowance.dailyLimit,
      complaintDailyUsed: complaintAllowance.dailyUsed,
      complaintDailyRemaining: complaintAllowance.dailyRemaining,
      complaintMonthlyLimit: complaintAllowance.monthlyLimit,
      complaintMonthlyUsed: complaintAllowance.monthlyUsed,
      complaintMonthlyRemaining: complaintAllowance.monthlyRemaining,
      extraLabelCredits: user.extraLabelCredits ?? 0,
      extraTrackingCredits: user.extraTrackingCredits ?? 0,
    },
    activePackage: {
      planName: subscription?.plan?.name ?? null,
      expiresAt: subscription?.currentPeriodEnd ?? null,
      status: isExpired ? "EXPIRED" : "ACTIVE",
      nearExpiry: isNearExpiry,
      unitsRemaining: remainingUnits,
    },
    pendingPayment: pendingPaymentPayload,
  });
});

const profileUpdateSchema = z.object({
  companyName: z.string().trim().max(120).nullable().optional(),
  address: z.string().trim().max(300).nullable().optional(),
  contactNumber: z.string().trim().max(30).nullable().optional(),
  cnic: z.string().trim().max(15).nullable().optional(),
  originCity: z.string().trim().max(80).nullable().optional(),
});

function normalizeNullable(value: string | null | undefined) {
  const trimmed = String(value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

function immutableProfileMessage() {
  return "Contact number/CNIC cannot be changed after verification. Contact support/admin for correction.";
}

function nameContactPattern(companyName: string | null | undefined, contactNumber: string | null | undefined) {
  const company = String(companyName ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  const contact = String(contactNumber ?? "").replace(/\D/g, "");
  if (!company || !contact) return null;
  return `${company}|${contact}`;
}

async function persistAccountRiskSignals(input: {
  userId: string;
  source: string;
  planTier: "FREE" | "PAID" | "UNKNOWN";
  reqIpHash?: string | null;
  reqDeviceHash?: string | null;
  contactNumber?: string | null;
  cnic?: string | null;
  companyName?: string | null;
}) {
  const rows: Array<{ userId: string; signalType: string; signalHash: string; source: string; planTier: string }> = [];
  if (input.reqIpHash) rows.push({ userId: input.userId, signalType: "IP_HASH", signalHash: input.reqIpHash, source: input.source, planTier: input.planTier });
  if (input.reqDeviceHash) rows.push({ userId: input.userId, signalType: "DEVICE_HASH", signalHash: input.reqDeviceHash, source: input.source, planTier: input.planTier });

  const normalizedContact = normalizeNullable(input.contactNumber);
  const normalizedCnic = normalizeNullable(input.cnic);
  const pattern = nameContactPattern(input.companyName, normalizedContact);

  if (normalizedContact) rows.push({ userId: input.userId, signalType: "CONTACT_HASH", signalHash: hashAccountSignal(normalizedContact), source: input.source, planTier: input.planTier });
  if (normalizedCnic) rows.push({ userId: input.userId, signalType: "CNIC_HASH", signalHash: hashAccountSignal(normalizedCnic), source: input.source, planTier: input.planTier });
  if (pattern) rows.push({ userId: input.userId, signalType: "NAME_CONTACT_HASH", signalHash: hashAccountSignal(pattern), source: input.source, planTier: input.planTier });

  if (!rows.length) return;
  try {
    await prisma.accountRiskSignal.createMany({ data: rows });
  } catch (error) {
    console.warn("Failed to persist profile risk signals", error instanceof Error ? error.message : error);
  }
}

meRouter.patch("/", requireAuth, async (req: AuthedRequest, res) => {
  const userId = req.user!.id;
  const body = profileUpdateSchema.parse(req.body);
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, contactNumber: true, cnic: true, companyName: true },
  });
  if (!existing) return res.status(404).json({ error: "User not found" });

  const nextContact = normalizeNullable(body.contactNumber);
  const nextCnic = normalizeNullable(body.cnic);
  const currentContact = normalizeNullable(existing.contactNumber);
  const currentCnic = normalizeNullable(existing.cnic);

  if ((currentContact && currentContact !== nextContact) || (currentCnic && currentCnic !== nextCnic)) {
    return res.status(409).json({ error: immutableProfileMessage() });
  }

  const activeSubscription = await prisma.subscription.findFirst({
    where: { userId, status: "ACTIVE" },
    include: { plan: true },
    orderBy: { createdAt: "desc" },
  });
  const planTier: "FREE" | "PAID" | "UNKNOWN" = activeSubscription
    ? Number(activeSubscription.plan.priceCents ?? 0) > 0
      ? "PAID"
      : "FREE"
    : "UNKNOWN";

  const { ipHash, deviceHash } = getRequestSignalHashes(req);
  const normalizedBody = {
    companyName: normalizeNullable(body.companyName),
    address: normalizeNullable(body.address),
    contactNumber: nextContact,
    cnic: nextCnic,
    originCity: normalizeNullable(body.originCity),
  };
  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data: normalizedBody,
      select: { id: true, email: true, role: true, createdAt: true, companyName: true, address: true, contactNumber: true, cnic: true, originCity: true },
    });

    await persistAccountRiskSignals({
      userId,
      source: "PROFILE_UPDATE",
      planTier,
      reqIpHash: ipHash,
      reqDeviceHash: deviceHash,
      companyName: normalizedBody.companyName,
      contactNumber: normalizedBody.contactNumber,
      cnic: normalizedBody.cnic,
    });

    return res.json({ user });
  } catch (err) {
    const message = err instanceof Error ? err.message.toLowerCase() : "";
    if (message.includes("unique constraint") && (message.includes("contactnumber") || message.includes("cnic"))) {
      await persistAccountRiskSignals({
        userId,
        source: "PROFILE_DUPLICATE_ATTEMPT",
        planTier,
        reqIpHash: ipHash,
        reqDeviceHash: deviceHash,
        companyName: normalizedBody.companyName,
        contactNumber: normalizedBody.contactNumber,
        cnic: normalizedBody.cnic,
      });
      return res.status(409).json({ error: message.includes("cnic") ? "CNIC already registered" : "Mobile number already registered" });
    }
    return res.status(500).json({ error: "Failed to update profile" });
  }
});
