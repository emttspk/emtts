import { prisma } from "../src/lib/prisma.js";

type CanonicalPlan = {
  name: string;
  priceCents: number;
  monthlyLabelLimit: number;
  monthlyTrackingLimit: number;
  fullPriceCents: number;
  discountPriceCents: number;
  unitsIncluded: number;
  labelsIncluded: number;
  trackingIncluded: number;
  moneyOrdersIncluded: number;
  complaintsIncluded: number;
  dailyComplaintLimit: number;
  monthlyComplaintLimit: number;
  isSuspended: boolean;
};

const canonicalPlans: CanonicalPlan[] = [
  {
    name: "Free Plan",
    priceCents: 0,
    monthlyLabelLimit: 250,
    monthlyTrackingLimit: 250,
    fullPriceCents: 0,
    discountPriceCents: 0,
    unitsIncluded: 250,
    labelsIncluded: 250,
    trackingIncluded: 250,
    moneyOrdersIncluded: 250,
    complaintsIncluded: 5,
    dailyComplaintLimit: 1,
    monthlyComplaintLimit: 5,
    isSuspended: false,
  },
  {
    name: "Standard Plan",
    priceCents: 99900,
    monthlyLabelLimit: 1000,
    monthlyTrackingLimit: 1000,
    fullPriceCents: 99900,
    discountPriceCents: 99900,
    unitsIncluded: 1000,
    labelsIncluded: 1000,
    trackingIncluded: 1000,
    moneyOrdersIncluded: 1000,
    complaintsIncluded: 150,
    dailyComplaintLimit: 5,
    monthlyComplaintLimit: 150,
    isSuspended: false,
  },
  {
    name: "Business Plan",
    priceCents: 250000,
    monthlyLabelLimit: 3000,
    monthlyTrackingLimit: 3000,
    fullPriceCents: 250000,
    discountPriceCents: 250000,
    unitsIncluded: 3000,
    labelsIncluded: 3000,
    trackingIncluded: 3000,
    moneyOrdersIncluded: 3000,
    complaintsIncluded: 300,
    dailyComplaintLimit: 10,
    monthlyComplaintLimit: 300,
    isSuspended: false,
  },
];

const shouldApply = process.argv.includes("--apply");

async function ensureColumns() {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Plan"
      ADD COLUMN IF NOT EXISTS full_price_cents INTEGER,
      ADD COLUMN IF NOT EXISTS discount_price_cents INTEGER,
      ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS units_included INTEGER,
      ADD COLUMN IF NOT EXISTS labels_included INTEGER,
      ADD COLUMN IF NOT EXISTS tracking_included INTEGER,
      ADD COLUMN IF NOT EXISTS money_orders_included INTEGER,
      ADD COLUMN IF NOT EXISTS complaints_included INTEGER,
      ADD COLUMN IF NOT EXISTS daily_complaint_limit INTEGER,
      ADD COLUMN IF NOT EXISTS monthly_complaint_limit INTEGER;
  `);
}

async function readPlans() {
  return prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`
    SELECT
      id,
      name,
      "priceCents",
      "monthlyLabelLimit",
      "monthlyTrackingLimit",
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
    ORDER BY name ASC
  `);
}

async function normalize() {
  for (const plan of canonicalPlans) {
    await prisma.$executeRawUnsafe(
      `
      UPDATE "Plan"
      SET
        "priceCents" = $1,
        "monthlyLabelLimit" = $2,
        "monthlyTrackingLimit" = $3,
        full_price_cents = $4,
        discount_price_cents = $5,
        is_suspended = $6,
        units_included = $7,
        labels_included = $8,
        tracking_included = $9,
        money_orders_included = $10,
        complaints_included = $11,
        daily_complaint_limit = $12,
        monthly_complaint_limit = $13
      WHERE LOWER(name) = LOWER($14)
      `,
      plan.priceCents,
      plan.monthlyLabelLimit,
      plan.monthlyTrackingLimit,
      plan.fullPriceCents,
      plan.discountPriceCents,
      plan.isSuspended,
      plan.unitsIncluded,
      plan.labelsIncluded,
      plan.trackingIncluded,
      plan.moneyOrdersIncluded,
      plan.complaintsIncluded,
      plan.dailyComplaintLimit,
      plan.monthlyComplaintLimit,
      plan.name,
    );
  }

  await prisma.$executeRawUnsafe(
    `
    UPDATE "BillingSettings"
    SET "standardPrice" = $1,
        "businessPrice" = $2
    WHERE id = 1
    `,
    99900,
    250000,
  );
}

async function main() {
  await ensureColumns();

  if (shouldApply) {
    await normalize();
  }

  const plans = await readPlans();
  console.log(JSON.stringify({ mode: shouldApply ? "applied" : "audit", plans }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
