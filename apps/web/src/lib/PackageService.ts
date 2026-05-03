import { api } from "./api";

export type Plan = {
  id: string;
  name: string;
  priceCents: number;
  monthlyLabelLimit: number;
  monthlyTrackingLimit: number;
};

export type ChangePackageResponse = {
  requiresRedirect?: boolean;
  checkoutUrl?: string;
  payment?: {
    id: string;
    reference: string;
    kind: string;
    status: string;
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
