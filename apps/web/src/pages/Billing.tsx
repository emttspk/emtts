import { useEffect, useState } from "react";
import { Check, Sparkles } from "lucide-react";
import { useOutletContext } from "react-router-dom";
import Card from "../components/Card";
import { changePackage, fetchPlans, type Plan } from "../lib/PackageService";
import type { MeResponse } from "../lib/types";

type ShellCtx = { me: MeResponse | null; refreshMe: () => Promise<void> };

const formatPKR = new Intl.NumberFormat("en-PK", {
  style: "currency",
  currency: "PKR",
  currencyDisplay: "code",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

type BillingProps = {
  entryMode?: "billing" | "select" | "update";
};

export default function Billing({ entryMode = "billing" }: BillingProps = {}) {
  const { me, refreshMe } = useOutletContext<ShellCtx>();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [submittingPlanId, setSubmittingPlanId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const remainingUnits = me?.balances?.unitsRemaining ?? me?.activePackage?.unitsRemaining ?? me?.balances?.labelsRemaining ?? 0;
  const totalUnits = me?.balances?.labelLimit ?? me?.subscription?.plan?.monthlyLabelLimit ?? 0;
  const usedUnits = Math.max(0, totalUnits - remainingUnits);
  const expiryDate = me?.activePackage?.expiresAt ?? me?.subscription?.currentPeriodEnd;
  const expiryDateObj = expiryDate ? new Date(expiryDate) : null;
  const daysToExpiry = expiryDateObj ? Math.ceil((expiryDateObj.getTime() - Date.now()) / (24 * 60 * 60 * 1000)) : null;
  const nearExpiry = Boolean(daysToExpiry != null && daysToExpiry >= 0 && daysToExpiry <= 3);
  const expired = Boolean(daysToExpiry != null && daysToExpiry < 0);
  const currentPlanId = me?.subscription?.plan?.id ?? null;
  const activePlanName = me?.subscription?.plan?.name ?? me?.activePackage?.planName ?? "No active plan";
  const billingStatus = me?.subscription?.status ?? me?.activePackage?.status ?? "-";
  const modeTitle = entryMode === "select" ? "Select Package" : entryMode === "update" ? "Update Package" : "Pricing & Billing";
  const modeSubtitle =
    entryMode === "select"
      ? "Select a package to start dispatch operations."
      : entryMode === "update"
        ? "Upgrade or switch your package based on current usage."
        : "Choose a package built for dispatch teams.";

  useEffect(() => {
    setLoadingPlans(true);
    fetchPlans()
      .then((data) => setPlans(data))
      .catch(() => setPlans([]))
      .finally(() => setLoadingPlans(false));
  }, []);

  async function choosePlan(plan: Plan) {
    if (plan.id === currentPlanId) return;
    setSubmittingPlanId(plan.id);
    setError(null);
    setSuccess(null);
    try {
      await changePackage(plan.id);
      await refreshMe();
      setSuccess(`Package changed to ${plan.name}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update package");
    } finally {
      setSubmittingPlanId(null);
    }
  }

  return (
    <div className="space-y-8">
      <Card className="overflow-hidden p-8">
        <div className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand/10 px-4 py-2 text-sm font-semibold text-brand">
              <Sparkles className="h-4 w-4" />
              {modeTitle}
            </div>
            <div className="mt-5 text-4xl font-semibold text-slate-950">{modeSubtitle}</div>
            <div className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">Your current package, usage limits, billing status, and upgrade path are shown here in one surface.</div>

            {error ? <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
            {success ? <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div> : null}
          </div>
          <div className="rounded-2xl border border-[#E5E7EB] bg-[linear-gradient(180deg,#0f172a,#1e293b)] p-6 text-white shadow-card">
            <div className="text-xs uppercase tracking-[0.3em] text-slate-300">Active package</div>
            <div className="mt-3 text-3xl font-semibold">{activePlanName}</div>
            <div className="mt-4 grid gap-3 text-sm text-slate-200">
              <div className="flex items-center justify-between gap-4"><span>Used Units</span><span>{usedUnits.toLocaleString()}</span></div>
              <div className="flex items-center justify-between gap-4"><span>Remaining Units</span><span>{remainingUnits.toLocaleString()}</span></div>
              <div className="flex items-center justify-between gap-4"><span>Total Units</span><span>{totalUnits.toLocaleString()}</span></div>
              <div className="flex items-center justify-between gap-4"><span>Tracking Actions</span><span>{(me?.usage?.trackingGenerated ?? 0).toLocaleString()}</span></div>
              <div className={`flex items-center justify-between gap-4 ${nearExpiry ? "text-amber-300" : expired ? "text-red-300" : ""}`}><span>Expiry Date</span><span>{expiryDateObj ? expiryDateObj.toLocaleDateString("en-PK") : "-"}</span></div>
              <div className="flex items-center justify-between gap-4"><span>Billing Status</span><span>{billingStatus}</span></div>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        {loadingPlans ? <Card className="p-6 text-sm text-slate-600">Loading packages...</Card> : null}
        {plans.map((plan, index) => {
          const isCurrent = currentPlanId === plan.id;
          const highlight = isCurrent || index === 1;
          const upgrading = !isCurrent && (me?.subscription?.plan?.monthlyLabelLimit ?? 0) < plan.monthlyLabelLimit;
          return (
            <Card key={plan.id} className={highlight ? "border-brand/30 shadow-card" : undefined}>
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
                  {isCurrent ? <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-medium text-white">Current</span> : highlight ? <span className="rounded-full bg-brand px-3 py-1 text-xs font-medium text-white">Recommended</span> : null}
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
                  <div className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-emerald-500" />
                    {upgrading ? "Upgrade package" : "Package available"}
                  </div>
                </div>

                <button
                  className="mt-6 w-full rounded-2xl bg-brand px-4 py-3 text-sm font-medium text-white shadow-lg transition-all duration-300 ease-in-out hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
                  type="button"
                  onClick={() => choosePlan(plan)}
                  disabled={isCurrent || submittingPlanId === plan.id}
                >
                  {isCurrent
                    ? `Current: ${plan.name}`
                    : submittingPlanId === plan.id
                      ? "Updating..."
                      : upgrading
                        ? `Upgrade to ${plan.name}`
                        : `Choose ${plan.name}`}
                </button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}




