import { api } from "./api";

export type Plan = {
  id: string;
  name: string;
  priceCents: number;
  fullPriceCents?: number;
  discountPriceCents?: number;
  discountPct?: number;
  isSuspended?: boolean;
  unitsIncluded?: number;
  labelsIncluded?: number;
  trackingIncluded?: number;
  moneyOrdersIncluded?: number;
  complaintsIncluded?: number;
  dailyComplaintLimit?: number;
  monthlyComplaintLimit?: number;
  monthlyLabelLimit: number;
  monthlyTrackingLimit: number;
};

export type ChangePackageResponse = {
  requiresRedirect?: boolean;
  requiresManualPayment?: boolean;
  checkoutUrl?: string;
  payment?: {
    id: string;
    reference: string;
    kind?: string;
    status?: string;
    amountCents: number;
    currency: string;
  };
  invoice?: {
    id: string;
    invoiceNumber: string;
    status: string;
    amountCents: number;
    currency: string;
  };
  plan?: {
    id: string;
    name: string;
  };
  subscription?: unknown;
};

export async function fetchPlans() {
  const cacheKey = "plans.public.cache.v1";
  const cachedRaw = window.localStorage.getItem(cacheKey);
  if (cachedRaw) {
    try {
      const cached = JSON.parse(cachedRaw) as { plans: Plan[] };
      if (Array.isArray(cached?.plans) && cached.plans.length > 0) {
        void api<{ plans: Plan[] }>(`/api/plans?t=${Date.now()}`)
          .then((latest) => {
            window.localStorage.setItem(cacheKey, JSON.stringify({ plans: latest.plans ?? [], ts: Date.now() }));
            window.dispatchEvent(new CustomEvent("plans-cache-refresh", { detail: latest.plans ?? [] }));
          })
          .catch(() => {
            // Ignore background refresh errors.
          });
        return cached.plans;
      }
    } catch {
      // Ignore malformed cache.
    }
  }

  const data = await api<{ plans: Plan[] }>(`/api/plans?t=${Date.now()}`);
  window.localStorage.setItem(cacheKey, JSON.stringify({ plans: data.plans ?? [], ts: Date.now() }));
  return data.plans ?? [];
}

export async function changePackage(planId: string) {
  return api<ChangePackageResponse>("/api/subscriptions/start", {
    method: "POST",
    body: JSON.stringify({ planId }),
  });
}
