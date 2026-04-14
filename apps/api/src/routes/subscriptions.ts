import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";

export const subscriptionsRouter = Router();

subscriptionsRouter.post("/start", requireAuth, async (req: AuthedRequest, res) => {
  const userId = req.user!.id;
  const body = z.object({ planId: z.string().uuid() }).parse(req.body);

  const plan = await prisma.plan.findUnique({ where: { id: body.planId } });
  if (!plan) return res.status(404).json({ error: "Plan not found" });

  // Minimal subscription structure (no payment integration).
  const now = new Date();
  const end = new Date(now);
  if (plan.name.toLowerCase().includes("free")) {
    end.setUTCDate(end.getUTCDate() + 15);
  } else {
    end.setUTCMonth(end.getUTCMonth() + 1);
  }

  await prisma.subscription.updateMany({ where: { userId, status: "ACTIVE" }, data: { status: "CANCELED" } });
  const sub = await prisma.subscription.create({
    data: { userId, planId: plan.id, status: "ACTIVE", currentPeriodStart: now, currentPeriodEnd: end },
    include: { plan: true },
  });
  res.json({ subscription: sub });
});
