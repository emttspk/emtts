import { useEffect, useState } from "react";
import { Check, Sparkles } from "lucide-react";
import { useOutletContext } from "react-router-dom";
import Card from "../components/Card";
import { api } from "../lib/api";
import type { MeResponse } from "../lib/types";

type ShellCtx = { me: MeResponse | null };
type Plan = { id: string; name: string; priceCents: number; monthlyLabelLimit: number; monthlyTrackingLimit: number };

const formatPKR = new Intl.NumberFormat("en-PK", {
  style: "currency",
  currency: "PKR",
  currencyDisplay: "code",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export default function Billing() {
  const { me } = useOutletContext<ShellCtx>();
  const [plans, setPlans] = useState<Plan[]>([]);
  const remainingUnits = me?.balances?.unitsRemaining ?? me?.activePackage?.unitsRemaining ?? me?.balances?.labelsRemaining ?? 0;
  const expiryDate = me?.activePackage?.expiresAt ?? me?.subscription?.currentPeriodEnd;
  const expiryDateObj = expiryDate ? new Date(expiryDate) : null;
  const daysToExpiry = expiryDateObj ? Math.ceil((expiryDateObj.getTime() - Date.now()) / (24 * 60 * 60 * 1000)) : null;
  const nearExpiry = Boolean(daysToExpiry != null && daysToExpiry >= 0 && daysToExpiry <= 3);
  const expired = Boolean(daysToExpiry != null && daysToExpiry < 0);

  useEffect(() => {
    api<{ plans: Plan[] }>("/api/plans")
      .then((data) =>
        setPlans(
          data.plans.filter(
            (plan) => !["Starter Plan", "Pro Plan"].includes(plan.name),
          ),
        ),
      )
      .catch(() => setPlans([]));
  }, []);

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden p-8">
        <div className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700">
              <Sparkles className="h-4 w-4" />
              Pricing & Billing
            </div>
            <div className="mt-5 text-4xl font-semibold text-slate-950">Choose a package built for dispatch teams.</div>
            <div className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">Your current package, monthly capacity, and upgrade path are shown here in a cleaner billing surface.</div>
          </div>
          <div className="rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,#0f172a,#1e293b)] p-6 text-white shadow-[0_24px_60px_rgba(15,23,42,0.22)]">
            <div className="text-xs uppercase tracking-[0.3em] text-slate-300">Active package</div>
            <div className="mt-3 text-3xl font-semibold">{me?.subscription?.plan?.name ?? "No active plan"}</div>
            <div className="mt-4 grid gap-3 text-sm text-slate-200">
              <div className="flex items-center justify-between gap-4"><span>Remaining Units</span><span>{remainingUnits.toLocaleString()}</span></div>
              <div className="flex items-center justify-between gap-4"><span>Tracking Actions</span><span>{(me?.usage?.trackingGenerated ?? 0).toLocaleString()}</span></div>
              <div className={`flex items-center justify-between gap-4 ${nearExpiry ? "text-amber-300" : expired ? "text-red-300" : ""}`}><span>Expiry Date</span><span>{expiryDateObj ? expiryDateObj.toLocaleDateString("en-PK") : "-"}</span></div>
              <div className="flex items-center justify-between gap-4"><span>Status</span><span>{expired ? "Expired" : "Active"}</span></div>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        {plans.map((plan, index) => {
          const highlight = me?.subscription?.plan?.id === plan.id || index === 1;
          return (
            <Card key={plan.id} className={highlight ? "border-sky-200 shadow-[0_18px_50px_rgba(14,165,233,0.16)]" : undefined}>
              <div className="p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-xl font-medium text-gray-900">{plan.name}</div>
                    <div className="mt-2 text-3xl font-semibold text-gray-900">
                      {formatPKR.format(Math.round(plan.priceCents / 100)).replace(/\u00A0/g, " ").replace("PKR", "Rs.")}
                      <span className="ml-2 text-sm font-medium text-gray-600">/ month</span>
                    </div>
                    <div className="mt-2 text-sm text-gray-600">{plan.monthlyLabelLimit.toLocaleString()} total units for labels, tracking, and money-order generation.</div>
                  </div>
                  {highlight ? <span className="rounded-full bg-sky-600 px-3 py-1 text-xs font-medium text-white">Recommended</span> : null}
                </div>

                <div className="mt-5 space-y-2 text-sm text-gray-600">
                  <div className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-emerald-500" />
                    A4 print-ready labels
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-emerald-500" />
                    Bulk tracking workspace
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-emerald-500" />
                    Admin balance support
                  </div>
                </div>

                <button className="mt-6 w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-medium text-white shadow-md transition-all duration-200 ease-in-out hover:bg-slate-800" type="button">
                  {me?.subscription?.plan?.id === plan.id ? `Current: ${plan.name}` : `Choose ${plan.name}`}
                </button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

