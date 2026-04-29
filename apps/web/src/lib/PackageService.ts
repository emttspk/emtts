import { api } from "./api";

export type Plan = {
  id: string;
  name: string;
  priceCents: number;
  monthlyLabelLimit: number;
  monthlyTrackingLimit: number;
};

export async function fetchPlans() {
  const data = await api<{ plans: Plan[] }>("/api/plans");
  return data.plans ?? [];
}

export async function changePackage(planId: string) {
  return api("/api/subscriptions/start", {
    method: "POST",
    body: JSON.stringify({ planId }),
  });
}
