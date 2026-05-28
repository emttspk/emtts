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

export type JazzcashCreateResponse = {
  actionUrl: string;
  fields: Record<string, string>;
  payment: {
    id: string;
    reference: string;
    checkoutToken?: string;
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
};

export type JazzcashMobileWalletCreateResponse = {
  payment: {
    id: string;
    reference: string;
  };
  status: "success" | "failed" | "pending" | "awaiting_customer_approval" | "error";
  paymentStatus: "SUCCEEDED" | "FAILED" | "CANCELED" | "PENDING";
  providerResponseCode: string | null;
  message: string;
  pollAfterSeconds?: number;
  fallback?: {
    hostedCheckoutPath: string;
  };
};

export type JazzcashPaymentStatusResponse = {
  reference: string;
  status: "SUCCEEDED" | "FAILED" | "CANCELED" | "PENDING";
  planName: string | null;
  amountCents: number;
  currency: string;
  responseMessage: string | null;
  updatedAt: string;
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

export async function createJazzcashHostedCheckoutPayment(planId: string, customerMobile?: string) {
  return api<JazzcashCreateResponse>("/api/payments/jazzcash/create", {
    method: "POST",
    body: JSON.stringify({ planId, customerMobile }),
  });
}

export async function createJazzcashMobileWalletPayment(planId: string, mobileNumber: string) {
  return api<JazzcashMobileWalletCreateResponse>("/api/payments/jazzcash/mobile-wallet/create", {
    method: "POST",
    body: JSON.stringify({ planId, mobileNumber }),
  });
}

export async function fetchJazzcashPaymentStatus(reference: string) {
  return api<JazzcashPaymentStatusResponse>(`/api/payments/jazzcash/status/${encodeURIComponent(reference)}`);
}
