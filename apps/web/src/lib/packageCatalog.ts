export type PackageMeta = {
  code: "FREE" | "STANDARD" | "BUSINESS";
  displayName: string;
  priceText: string;
  units: number;
  tracking: number;
  complaints: string;
  moneyOrders: string;
  tagline: string;
  badge?: string;
  featured?: boolean;
};

export const PACKAGE_CATALOG: PackageMeta[] = [
  {
    code: "FREE",
    displayName: "Free",
    priceText: "Rs 0",
    units: 250,
    tracking: 250,
    complaints: "Basic",
    moneyOrders: "Included",
    tagline: "For new teams validating workflow and label generation.",
  },
  {
    code: "STANDARD",
    displayName: "Standard",
    priceText: "Rs 999",
    units: 1000,
    tracking: 1000,
    complaints: "5/day, 50/month",
    moneyOrders: "Included",
    tagline: "For growing dispatch operations that need daily shipment control.",
    badge: "Most Popular",
    featured: true,
  },
  {
    code: "BUSINESS",
    displayName: "Business",
    priceText: "Rs 2500",
    units: 3000,
    tracking: 3000,
    complaints: "10/day, 300/month",
    moneyOrders: "Included",
    tagline: "For high-volume teams managing labels, money orders, tracking and escalations.",
    badge: "Best Value",
  },
];

const ALIASES: Record<string, PackageMeta["code"]> = {
  FREE: "FREE",
  "FREE PLAN": "FREE",
  STANDARD: "STANDARD",
  "STANDARD PLAN": "STANDARD",
  BUSINESS: "BUSINESS",
  "BUSINESS PLAN": "BUSINESS",
};

export function normalizePackageCode(planName: string | null | undefined): PackageMeta["code"] {
  const key = String(planName ?? "").trim().toUpperCase();
  return ALIASES[key] ?? "BUSINESS";
}

export function resolvePackageMeta(planName: string | null | undefined): PackageMeta {
  const code = normalizePackageCode(planName);
  return PACKAGE_CATALOG.find((plan) => plan.code === code) ?? PACKAGE_CATALOG[2];
}

export function usagePercent(remainingUnits: number, unitLimit: number): number {
  const limit = Math.max(1, Number(unitLimit) || 1);
  const remaining = Math.max(0, Number(remainingUnits) || 0);
  const used = Math.max(0, limit - remaining);
  return Math.min(100, Math.round((used / limit) * 100));
}
