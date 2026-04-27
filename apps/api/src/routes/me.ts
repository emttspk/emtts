import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { COMPLAINT_UNIT_COST, getComplaintAllowance, getLatestUnitSnapshot } from "../usage/unitConsumption.js";

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
      complaintDailyRemaining: complaintAllowance.dailyRemaining,
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
  });
});

const profileUpdateSchema = z.object({
  companyName: z.string().max(120).optional(),
  address: z.string().max(300).optional(),
  contactNumber: z.string().max(30).optional(),
  cnic: z.string().max(15).nullable().optional(),
  originCity: z.string().max(80).optional(),
});

meRouter.patch("/", requireAuth, async (req: AuthedRequest, res) => {
  const userId = req.user!.id;
  const body = profileUpdateSchema.parse(req.body);
  const user = await prisma.user.update({
    where: { id: userId },
    data: body,
    select: { id: true, email: true, role: true, createdAt: true, companyName: true, address: true, contactNumber: true, cnic: true, originCity: true },
  });
  return res.json({ user });
});
