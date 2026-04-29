import { Router } from "express";
import { prisma } from "../lib/prisma.js";

export const plansRouter = Router();

export async function ensureDefaultPlans() {
  try {
    const defaults = [
      { name: "Free Plan", priceCents: 0, monthlyLabelLimit: 250, monthlyTrackingLimit: 250 },
      { name: "Standard Plan", priceCents: 99900, monthlyLabelLimit: 1000, monthlyTrackingLimit: 1000 },
      { name: "Business Plan", priceCents: 250000, monthlyLabelLimit: 3000, monthlyTrackingLimit: 3000 },
    ] as const;

    for (const plan of defaults) {
      try {
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
      } catch (err) {
        console.log(`Skipping plan "${plan.name}" - table may not exist yet:`, err instanceof Error ? err.message : err);
      }
    }
    console.log("Default plans ensured.");
  } catch (err) {
    console.log("Failed to ensure default plans (table may not exist yet):", err instanceof Error ? err.message : err);
  }
}

plansRouter.get("/", async (_req, res, next) => {
  try {
    const plans = await prisma.plan.findMany({ orderBy: { priceCents: "asc" } });
    res.json({ success: true, plans, message: "Plans retrieved successfully" });
  } catch (err) {
    console.log("Database unavailable for plans, returning defaults:", err instanceof Error ? err.message : err);
    res.json({
      success: true,
      plans: [
        { id: "free", name: "Free Plan", priceCents: 0, monthlyLabelLimit: 250, monthlyTrackingLimit: 250, createdAt: new Date() },
        { id: "standard", name: "Standard Plan", priceCents: 99900, monthlyLabelLimit: 1000, monthlyTrackingLimit: 1000, createdAt: new Date() },
        { id: "business", name: "Business Plan", priceCents: 250000, monthlyLabelLimit: 3000, monthlyTrackingLimit: 3000, createdAt: new Date() }
      ],
      message: "Using default plans (database unavailable)"
    });
  }
});
