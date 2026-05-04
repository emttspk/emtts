import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { COMPLAINT_UNIT_COST, getComplaintAllowance, getLatestUnitSnapshot } from "../usage/unitConsumption.js";
import { buildHostedCheckoutUrl, getLatestPendingPayment } from "../services/epGatewayBilling.service.js";

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

  return res.json({
    user,
    onboardingRequired: !user.onboardingComplete,
    subscription: subscription
      ? {
          id: subscription.id,
          status: subscription.status,
          plan: subscription.plan,
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
      complaintMonthlyUsed: complaintAllowance.monthlyUsed,
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
    pendingPayment: pendingPayment
      ? {
          reference: pendingPayment.reference,
          status: pendingPayment.status,
          kind: pendingPayment.kind,
          amountCents: pendingPayment.amountCents,
          currency: pendingPayment.currency,
          planName: pendingPayment.plan.name,
          invoiceNumber: pendingPayment.invoice?.invoiceNumber ?? null,
          checkoutUrl: buildHostedCheckoutUrl(pendingPayment.reference, pendingPayment.checkoutToken),
          createdAt: pendingPayment.createdAt,
        }
      : null,
  });
});

const profileUpdateSchema = z.object({
  companyName: z.string().trim().max(120).nullable().optional(),
  address: z.string().trim().max(300).nullable().optional(),
  contactNumber: z.string().trim().max(30).nullable().optional(),
  cnic: z.string().trim().max(15).nullable().optional(),
  originCity: z.string().trim().max(80).nullable().optional(),
});

meRouter.patch("/", requireAuth, async (req: AuthedRequest, res) => {
  const userId = req.user!.id;
  const body = profileUpdateSchema.parse(req.body);
  const normalizedBody = {
    companyName: body.companyName && body.companyName.length > 0 ? body.companyName : null,
    address: body.address && body.address.length > 0 ? body.address : null,
    contactNumber: body.contactNumber && body.contactNumber.length > 0 ? body.contactNumber : null,
    cnic: body.cnic && body.cnic.length > 0 ? body.cnic : null,
    originCity: body.originCity && body.originCity.length > 0 ? body.originCity : null,
  };
  const user = await prisma.user.update({
    where: { id: userId },
    data: normalizedBody,
    select: { id: true, email: true, role: true, createdAt: true, companyName: true, address: true, contactNumber: true, cnic: true, originCity: true },
  });
  return res.json({ user });
});
