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
  unitsIncluded: number;
  labelsIncluded: number;
  trackingIncluded: number;
  moneyOrdersIncluded: number;
  complaintsIncluded: number;
  dailyComplaintLimit: number;
  monthlyComplaintLimit: number;
};

let planColumnsReady = false;

export async function ensurePlanManagementColumns() {
  if (planColumnsReady) return;
  await prisma.$executeRawUnsafe('ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS full_price_cents INTEGER');
  await prisma.$executeRawUnsafe('ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS discount_price_cents INTEGER');
  await prisma.$executeRawUnsafe('ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN NOT NULL DEFAULT FALSE');
  await prisma.$executeRawUnsafe('ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS units_included INTEGER');
  await prisma.$executeRawUnsafe('ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS labels_included INTEGER');
  await prisma.$executeRawUnsafe('ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS tracking_included INTEGER');
  await prisma.$executeRawUnsafe('ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS money_orders_included INTEGER');
  await prisma.$executeRawUnsafe('ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS complaints_included INTEGER');
  await prisma.$executeRawUnsafe('ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS daily_complaint_limit INTEGER');
  await prisma.$executeRawUnsafe('ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS monthly_complaint_limit INTEGER');
  planColumnsReady = true;
}

export async function getPlanExtrasByIds(planIds: string[]) {
  if (planIds.length === 0) return new Map<string, PlanExtras>();
  await ensurePlanManagementColumns();
  const rows = await prisma.$queryRaw<Array<{
    id: string;
    name: string;
    pricecents: number;
    monthlylabellimit: number;
    monthlytrackinglimit: number;
    full_price_cents: number | null;
    discount_price_cents: number | null;
    is_suspended: boolean | null;
    units_included: number | null;
    labels_included: number | null;
    tracking_included: number | null;
    money_orders_included: number | null;
    complaints_included: number | null;
    daily_complaint_limit: number | null;
    monthly_complaint_limit: number | null;
  }>>`
    SELECT id,
           name,
          "priceCents" AS pricecents,
           "monthlyLabelLimit" AS monthlylabellimit,
           "monthlyTrackingLimit" AS monthlytrackinglimit,
           full_price_cents,
           discount_price_cents,
           is_suspended,
           units_included,
           labels_included,
           tracking_included,
           money_orders_included,
           complaints_included,
           daily_complaint_limit,
           monthly_complaint_limit
    FROM "Plan"
    WHERE id IN (${Prisma.join(planIds)})
  `;
  const map = new Map<string, PlanExtras>();
  for (const row of rows) {
    const normalizedName = String(row.name ?? "").toLowerCase();
    const defaultDailyLimit = normalizedName.includes("free") ? 1 : normalizedName.includes("business") ? 10 : 5;
    const defaultMonthlyLimit = normalizedName.includes("free") ? 5 : normalizedName.includes("business") ? 300 : 150;
    const basePriceCents = Math.max(0, Number(row.pricecents ?? 0));
    const labelsIncluded = Math.max(0, Number(row.labels_included ?? row.monthlylabellimit ?? 0));
    const trackingIncluded = Math.max(0, Number(row.tracking_included ?? row.monthlytrackinglimit ?? row.monthlylabellimit ?? 0));
    const unitsIncluded = Math.max(labelsIncluded, Number(row.units_included ?? labelsIncluded));
    const moneyOrdersIncluded = Math.max(0, Number(row.money_orders_included ?? labelsIncluded));
    const dailyComplaintLimit = Math.max(0, Number(row.daily_complaint_limit ?? defaultDailyLimit));
    const monthlyComplaintLimit = Math.max(dailyComplaintLimit, Number(row.monthly_complaint_limit ?? defaultMonthlyLimit));
    const complaintsIncluded = Math.max(0, Number(row.complaints_included ?? monthlyComplaintLimit));
    const discountPriceCents = Math.max(0, Number(row.discount_price_cents ?? basePriceCents));
    const fullPriceCentsRaw = Number(row.full_price_cents ?? basePriceCents);
    const fullPriceCents = Math.max(discountPriceCents, fullPriceCentsRaw || discountPriceCents || basePriceCents);
    const discountPct = fullPriceCents > 0 ? Math.max(0, Math.min(100, Math.round(((fullPriceCents - discountPriceCents) / fullPriceCents) * 100))) : 0;
    map.set(row.id, {
      fullPriceCents,
      discountPriceCents,
      discountPct,
      isSuspended: Boolean(row.is_suspended),
      unitsIncluded,
      labelsIncluded,
      trackingIncluded,
      moneyOrdersIncluded,
      complaintsIncluded,
      dailyComplaintLimit,
      monthlyComplaintLimit,
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
        unitsIncluded: extras?.unitsIncluded ?? plan.monthlyLabelLimit,
        labelsIncluded: extras?.labelsIncluded ?? plan.monthlyLabelLimit,
        trackingIncluded: extras?.trackingIncluded ?? plan.monthlyTrackingLimit,
        moneyOrdersIncluded: extras?.moneyOrdersIncluded ?? plan.monthlyLabelLimit,
        complaintsIncluded: extras?.complaintsIncluded ?? 0,
        dailyComplaintLimit: extras?.dailyComplaintLimit ?? 0,
        monthlyComplaintLimit: extras?.monthlyComplaintLimit ?? 0,
      };
    });

    res.json({ success: true, plans: configuredPlans, message: "Plans retrieved successfully" });
  } catch (err) {
    console.log("Database unavailable for plans, returning defaults:", err instanceof Error ? err.message : err);
    res.json({
      success: true,
      plans: [
        { id: "free", name: "Free Plan", priceCents: 0, fullPriceCents: 0, discountPriceCents: 0, discountPct: 0, isSuspended: false, unitsIncluded: 250, labelsIncluded: 250, trackingIncluded: 250, moneyOrdersIncluded: 250, complaintsIncluded: 5, dailyComplaintLimit: 1, monthlyComplaintLimit: 5, monthlyLabelLimit: 250, monthlyTrackingLimit: 250, createdAt: new Date() },
        { id: "standard", name: "Standard Plan", priceCents: 99900, fullPriceCents: 99900, discountPriceCents: 99900, discountPct: 0, isSuspended: false, unitsIncluded: 1000, labelsIncluded: 1000, trackingIncluded: 1000, moneyOrdersIncluded: 1000, complaintsIncluded: 150, dailyComplaintLimit: 5, monthlyComplaintLimit: 150, monthlyLabelLimit: 1000, monthlyTrackingLimit: 1000, createdAt: new Date() },
        { id: "business", name: "Business Plan", priceCents: 250000, fullPriceCents: 250000, discountPriceCents: 250000, discountPct: 0, isSuspended: false, unitsIncluded: 3000, labelsIncluded: 3000, trackingIncluded: 3000, moneyOrdersIncluded: 3000, complaintsIncluded: 300, dailyComplaintLimit: 10, monthlyComplaintLimit: 300, monthlyLabelLimit: 3000, monthlyTrackingLimit: 3000, createdAt: new Date() }
      ],
      message: "Using default plans (database unavailable)"
    });
  }
});
