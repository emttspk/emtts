import { api } from "./api";

export type Plan = {
  id: string;
  name: string;
  priceCents: number;
  fullPriceCents?: number;
  discountPriceCents?: number;
  discountPct?: number;
  isSuspended?: boolean;
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
  const data = await api<{ plans: Plan[] }>("/api/plans");
  return data.plans ?? [];
}

export async function changePackage(planId: string) {
  return api<ChangePackageResponse>("/api/subscriptions/start", {
    method: "POST",
    body: JSON.stringify({ planId }),
  });
}
