import { Router } from "express";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { monthKeyUTC } from "../usage/month.js";

export const meRouter = Router();

meRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const userId = req.user!.id;
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

  const month = monthKeyUTC();
  const usage =
    (await prisma.usageMonthly.findUnique({
      where: { userId_month: { userId, month } },
    })) ?? { month, labelsGenerated: 0, labelsQueued: 0, trackingGenerated: 0, trackingQueued: 0 };

  const labelLimit = (subscription?.plan.monthlyLabelLimit ?? 0) + (user.extraLabelCredits ?? 0);
  const trackingLimit = (subscription?.plan.monthlyTrackingLimit ?? subscription?.plan.monthlyLabelLimit ?? 0) + (user.extraTrackingCredits ?? 0);
  const labelsQueued = usage.labelsQueued ?? 0;
  const trackingGenerated = usage.trackingGenerated ?? 0;
  const trackingQueued = usage.trackingQueued ?? 0;

  const remainingUnits = Math.max(0, labelLimit - ((usage.labelsGenerated ?? 0) + labelsQueued));
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
  originCity: z.string().max(80).optional(),
});

meRouter.patch("/", requireAuth, async (req: AuthedRequest, res) => {
  const userId = req.user!.id;
  const body = profileUpdateSchema.parse(req.body);
  const user = await prisma.user.update({
    where: { id: userId },
    data: body,
    select: { id: true, email: true, role: true, createdAt: true, companyName: true, address: true, contactNumber: true, originCity: true },
  });
  return res.json({ user });
});
