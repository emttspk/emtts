import { useEffect, useRef, useState } from "react";
import { Check, Sparkles } from "lucide-react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import Card from "../components/Card";
import ManualPaymentModal from "../components/ManualPaymentModal";
import { changePackage, fetchPlans, type Plan } from "../lib/PackageService";
import type { MeResponse } from "../lib/types";
import { apiUrl } from "../lib/api";
import { BodyText, CardTitle, PageShell, PageTitle } from "../components/ui/PageSystem";

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
  const [searchParams] = useSearchParams();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [submittingPlanId, setSubmittingPlanId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [manualPaymentPlan, setManualPaymentPlan] = useState<Plan | null>(null);
  const [manualPaymentInvoice, setManualPaymentInvoice] = useState<{ id: string; invoiceNumber: string; amountCents: number; currency: string } | null>(null);
  const [initiatingWalletPlanId, setInitiatingWalletPlanId] = useState<string | null>(null);
  const planParam = searchParams.get("plan")?.toLowerCase() ?? null;
  const autoInitDone = useRef(false);
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

  // Auto-initiate checkout when ?plan= param is present (from /billing/checkout?plan=standard)
  useEffect(() => {
    if (!planParam || autoInitDone.current || loadingPlans || plans.length === 0) return;
    const target = plans.find((p) => p.name.toLowerCase().replace(/\s+plan$/i, "").trim() === planParam);
    if (!target) return;
    const isCurrent = target.id === currentPlanId;
    if (isCurrent) return;
    autoInitDone.current = true;
    void choosePlan(target);
  }, [planParam, loadingPlans, plans]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const payment = params.get("payment");
    const reference = params.get("reference");
    if (!payment) return;

    if (payment === "success") {
      setSuccess(reference ? `Payment verified and subscription activated. Ref: ${reference}` : "Payment verified and subscription activated.");
      void refreshMe();
    } else if (payment === "canceled") {
      setError(reference ? `Payment canceled. Ref: ${reference}` : "Payment canceled.");
    } else {
      setError(reference ? `Payment failed. Ref: ${reference}` : "Payment failed.");
    }
  }, [refreshMe]);

  async function choosePlan(plan: Plan) {
    if (plan.isSuspended) {
      setError(`${plan.name} is temporarily suspended and cannot be purchased right now.`);
      return;
    }
    const renewingCurrentPlan = plan.id === currentPlanId && (expired || nearExpiry);
    if (plan.id === currentPlanId && !renewingCurrentPlan) return;
    setSubmittingPlanId(plan.id);
    setError(null);
    setSuccess(null);
    try {
      const response = await changePackage(plan.id);
      if (response.requiresManualPayment && response.invoice) {
        // Invoice-first manual wallet payment flow
        setManualPaymentPlan(plan);
        setManualPaymentInvoice(response.invoice);
        return;
      }
      if (response.requiresRedirect && response.checkoutUrl) {
        window.location.assign(apiUrl(response.checkoutUrl));
        return;
      }
      await refreshMe();
      setSuccess(`Package changed to ${plan.name}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update package");
    } finally {
      setSubmittingPlanId(null);
    }
  }

  async function initiateWalletPayment(plan: Plan) {
    if (plan.isSuspended) {
      setError(`${plan.name} is temporarily suspended and cannot be purchased right now.`);
      return;
    }
    setInitiatingWalletPlanId(plan.id);
    setError(null);
    try {
      const response = await changePackage(plan.id);
      if (response.invoice) {
        setManualPaymentPlan(plan);
        setManualPaymentInvoice(response.invoice);
      } else {
        setError("Failed to create invoice. Please try again.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to initiate payment");
    } finally {
      setInitiatingWalletPlanId(null);
    }
  }

  return (
    <>
      <PageShell className="space-y-6">
        <div>
          <PageTitle>{modeTitle}</PageTitle>
          <BodyText className="mt-1">{modeSubtitle}</BodyText>
        </div>

      <Card className="overflow-hidden border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand/10 px-4 py-2 text-sm font-semibold text-brand">
              <Sparkles className="h-4 w-4" />
              {modeTitle}
            </div>
            <div className="mt-5 text-xl font-semibold text-slate-900">Package Summary</div>
            <div className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">Your current package, usage limits, billing status, and upgrade path are shown here in one surface.</div>

            {error ? <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
            {success ? <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div> : null}
            {me?.pendingPayment ? (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Pending payment for {me.pendingPayment.planName} is waiting for completion. Invoice {me.pendingPayment.invoiceNumber ?? "pending"}.
                <button
                  className="ml-3 rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white"
                  type="button"
                  onClick={() => window.location.assign(apiUrl(me.pendingPayment!.checkoutUrl))}
                >
                  Resume payment
                </button>
              </div>
            ) : null}
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Active package</div>
            <div className="mt-3 text-3xl font-semibold text-slate-900">{activePlanName}</div>
            <div className="mt-4 grid gap-3 text-sm text-slate-600">
              <div className="flex items-center justify-between gap-4"><span>Used Units</span><span>{usedUnits.toLocaleString()}</span></div>
              <div className="flex items-center justify-between gap-4"><span>Remaining Units</span><span>{remainingUnits.toLocaleString()}</span></div>
              <div className="flex items-center justify-between gap-4"><span>Total Shared Units</span><span>{totalUnits.toLocaleString()}</span></div>
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
          const isCurrent = currentPlanId === plan.id && !expired && !nearExpiry;
          const canRenewCurrentPlan = currentPlanId === plan.id && (expired || nearExpiry);
          const isTargeted = Boolean(planParam && plan.name.toLowerCase().replace(/\s+plan$/i, "").trim() === planParam);
          const highlight = isCurrent || isTargeted || index === 1;
          const upgrading = !isCurrent && (me?.subscription?.plan?.monthlyLabelLimit ?? 0) < plan.monthlyLabelLimit;
          const discountedPrice = plan.discountPriceCents ?? plan.priceCents;
          const fullPrice = Math.max(discountedPrice, plan.fullPriceCents ?? discountedPrice);
          const discountPct = fullPrice > 0 ? Math.max(0, Math.round(((fullPrice - discountedPrice) / fullPrice) * 100)) : 0;
          return (
            <Card key={plan.id} className={highlight ? "border-brand/30 bg-white shadow-sm" : "border-slate-200 bg-white shadow-sm"}>
              <div className="p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-slate-900">{plan.name}</CardTitle>
                    <div className="mt-2 text-3xl font-semibold text-gray-900">
                      {formatPKR.format(Math.round(discountedPrice / 100)).replace(/\u00A0/g, " ").replace("PKR", "Rs.")}
                      <span className="ml-2 text-sm font-medium text-gray-600">/ month</span>
                    </div>
                    {discountPct > 0 ? (
                      <div className="mt-1 text-xs text-slate-600">
                        <span className="line-through">{formatPKR.format(Math.round(fullPrice / 100)).replace(/\u00A0/g, " ").replace("PKR", "Rs.")}</span>
                        <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700">{discountPct}% OFF</span>
                      </div>
                    ) : null}
                    <div className="mt-2 text-sm text-gray-600">Total Shared Units: {(plan.unitsIncluded ?? plan.monthlyLabelLimit).toLocaleString()}</div>
                  </div>
                  {isCurrent ? (
                    <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-medium text-white">Current Plan</span>
                  ) : isTargeted ? (
                    <span className="rounded-full bg-brand px-3 py-1 text-xs font-medium text-white">Selected</span>
                  ) : highlight ? (
                    <span className="rounded-full bg-brand px-3 py-1 text-xs font-medium text-white">Recommended</span>
                  ) : null}
                </div>

                <div className="mt-5 space-y-2 text-sm text-gray-600">
                  <div className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-emerald-500" />
                    Services Included: ✔ Labels ✔ Tracking ✔ Money Orders ✔ Complaints
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-emerald-500" />
                    Complaint Limits: {plan.dailyComplaintLimit ?? 0}/day, {plan.monthlyComplaintLimit ?? 0}/month
                  </div>
                </div>
                {plan.isSuspended ? <div className="mt-3 text-xs font-medium text-red-600">Temporarily suspended by admin.</div> : null}

                <button
                  className="mt-6 w-full rounded-2xl bg-brand px-4 py-3 text-sm font-medium text-white shadow-lg transition-all duration-300 ease-in-out hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
                  type="button"
                  onClick={() => choosePlan(plan)}
                  disabled={(isCurrent && !canRenewCurrentPlan) || submittingPlanId === plan.id || Boolean(plan.isSuspended)}
                >
                  {isCurrent
                    ? `Current Plan`
                    : submittingPlanId === plan.id
                      ? "Updating..."
                      : canRenewCurrentPlan
                        ? `Renew ${plan.name}`
                        : upgrading
                          ? `Upgrade to ${plan.name}`
                          : currentPlanId
                            ? `Downgrade to ${plan.name}`
                            : plan.isSuspended
                              ? "Temporarily Unavailable"
                              : `Buy Now`}
                </button>
                {discountedPrice > 0 && !isCurrent && !plan.isSuspended && (
                  <button
                    type="button"
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                    disabled={initiatingWalletPlanId === plan.id}
                    onClick={() => initiateWalletPayment(plan)}
                  >
                    {initiatingWalletPlanId === plan.id ? "Creating invoice…" : "Pay via JazzCash / Easypaisa / Bank Transfer"}
                  </button>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </PageShell>
    {manualPaymentPlan && manualPaymentInvoice && (
      <ManualPaymentModal
        plan={manualPaymentPlan}
        invoice={manualPaymentInvoice}
        onClose={() => { setManualPaymentPlan(null); setManualPaymentInvoice(null); }}
        onSuccess={() => {
          setManualPaymentPlan(null);
          setManualPaymentInvoice(null);
          setSuccess("Payment request submitted. Awaiting admin approval.");
        }}
      />
    )}
  </>
  );
}




