import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { getOrCreateBillingSettings, resolveConfiguredPlanPrice } from "../services/billing-settings.service.js";

export const plansRouter = Router();

type PlanExtras = {
  fullPriceCents: number;
  discountPriceCents: number;
  discountPct: number;
  isSuspended: boolean;
};

let planColumnsReady = false;

export async function ensurePlanManagementColumns() {
  if (planColumnsReady) return;
  await prisma.$executeRawUnsafe('ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS full_price_cents INTEGER');
  await prisma.$executeRawUnsafe('ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS discount_price_cents INTEGER');
  await prisma.$executeRawUnsafe('ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN NOT NULL DEFAULT FALSE');
  planColumnsReady = true;
}

export async function getPlanExtrasByIds(planIds: string[]) {
  if (planIds.length === 0) return new Map<string, PlanExtras>();
  await ensurePlanManagementColumns();
  const rows = await prisma.$queryRaw<Array<{ id: string; full_price_cents: number | null; discount_price_cents: number | null; is_suspended: boolean | null }>>`
    SELECT id, full_price_cents, discount_price_cents, is_suspended
    FROM "Plan"
    WHERE id IN (${Prisma.join(planIds)})
  `;
  const map = new Map<string, PlanExtras>();
  for (const row of rows) {
    const discountPriceCents = Math.max(0, Number(row.discount_price_cents ?? 0));
    const fullPriceCentsRaw = Number(row.full_price_cents ?? 0);
    const fullPriceCents = Math.max(discountPriceCents, fullPriceCentsRaw || discountPriceCents);
    const discountPct = fullPriceCents > 0 ? Math.max(0, Math.min(100, Math.round(((fullPriceCents - discountPriceCents) / fullPriceCents) * 100))) : 0;
    map.set(row.id, {
      fullPriceCents,
      discountPriceCents,
      discountPct,
      isSuspended: Boolean(row.is_suspended),
    });
  }
  return map;
}

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
    await ensurePlanManagementColumns();
    const plans = await prisma.plan.findMany({ orderBy: { priceCents: "asc" } });
    const settings = await getOrCreateBillingSettings();
    const extrasMap = await getPlanExtrasByIds(plans.map((plan) => plan.id));
    const configuredPlans = plans.map((plan) => {
      const configuredPrice = resolveConfiguredPlanPrice(plan.name, plan.priceCents, settings);
      const extras = extrasMap.get(plan.id);
      const discountPriceCents = extras?.discountPriceCents ?? configuredPrice;
      const fullPriceCents = extras?.fullPriceCents ?? Math.max(discountPriceCents, configuredPrice);
      const discountPct = fullPriceCents > 0 ? Math.max(0, Math.min(100, Math.round(((fullPriceCents - discountPriceCents) / fullPriceCents) * 100))) : 0;
      return {
        ...plan,
        priceCents: discountPriceCents,
        fullPriceCents,
        discountPriceCents,
        discountPct,
        isSuspended: extras?.isSuspended ?? false,
      };
    });

    res.json({ success: true, plans: configuredPlans, message: "Plans retrieved successfully" });
  } catch (err) {
    console.log("Database unavailable for plans, returning defaults:", err instanceof Error ? err.message : err);
    res.json({
      success: true,
      plans: [
        { id: "free", name: "Free Plan", priceCents: 0, fullPriceCents: 0, discountPriceCents: 0, discountPct: 0, isSuspended: false, monthlyLabelLimit: 250, monthlyTrackingLimit: 250, createdAt: new Date() },
        { id: "standard", name: "Standard Plan", priceCents: 99900, fullPriceCents: 99900, discountPriceCents: 99900, discountPct: 0, isSuspended: false, monthlyLabelLimit: 1000, monthlyTrackingLimit: 1000, createdAt: new Date() },
        { id: "business", name: "Business Plan", priceCents: 250000, fullPriceCents: 250000, discountPriceCents: 250000, discountPct: 0, isSuspended: false, monthlyLabelLimit: 3000, monthlyTrackingLimit: 3000, createdAt: new Date() }
      ],
      message: "Using default plans (database unavailable)"
    });
  }
});
