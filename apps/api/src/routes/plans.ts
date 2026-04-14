import { Router } from "express";
import { prisma } from "../prisma.js";

export const plansRouter = Router();

async function ensureDefaultPlans() {
  const defaults = [
    { name: "Free Plan", priceCents: 0, monthlyLabelLimit: 250, monthlyTrackingLimit: 250 },
    { name: "Business Plan", priceCents: 250000, monthlyLabelLimit: 2000, monthlyTrackingLimit: 2000 },
  ] as const;

  for (const plan of defaults) {
    const existing = await prisma.plan.findFirst({ where: { name: plan.name } });
    if (existing) {
      await prisma.plan.update({
        where: { id: existing.id },
        data: {
          priceCents: plan.priceCents,
          monthlyLabelLimit: plan.monthlyLabelLimit,
          monthlyTrackingLimit: plan.monthlyTrackingLimit,
        },
      });
      continue;
    }
    await prisma.plan.create({ data: plan });
  }
}

plansRouter.get("/", async (_req, res) => {
  await ensureDefaultPlans();
  const plans = await prisma.plan.findMany({ orderBy: { priceCents: "asc" } });
  res.json({ plans });
});
