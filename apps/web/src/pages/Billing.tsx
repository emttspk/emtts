import { useEffect, useRef, useState } from "react";
import { Check, Sparkles, X } from "lucide-react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import Card from "../components/Card";
import ManualPaymentModal from "../components/ManualPaymentModal";
import {
  changePackage,
  createJazzcashHostedCheckoutPayment,
  createJazzcashMobileWalletPayment,
  fetchJazzcashPaymentStatus,
  fetchPlans,
  type Plan,
} from "../lib/PackageService";
import type { MeResponse } from "../lib/types";
import { apiUrl } from "../lib/api";
import ActionButton from "../components/ui/ActionButton";
import { BodyText, CardTitle, PageHeader, PageShell } from "../components/ui/PageSystem";

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
  const [initiatingJazzcashPlanId, setInitiatingJazzcashPlanId] = useState<string | null>(null);
  const [jazzcashModalPlan, setJazzcashModalPlan] = useState<Plan | null>(null);
  const [jazzcashModalMobile, setJazzcashModalMobile] = useState("");
  const [jazzcashModalError, setJazzcashModalError] = useState<string | null>(null);
  const [jazzcashPendingReference, setJazzcashPendingReference] = useState<string | null>(null);
  const [jazzcashPendingMessage, setJazzcashPendingMessage] = useState<string | null>(null);
  const jazzcashPollingTimerRef = useRef<number | null>(null);
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
      ? "Choose a package to start dispatching."
      : entryMode === "update"
        ? "Upgrade or switch based on usage."
        : "Choose a package for your team.";

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
    const payment = searchParams.get("payment");
    const reference = searchParams.get("reference");
    const message = searchParams.get("message");
    if (!payment) return;

    if (payment === "success") {
      setSuccess(message ?? (reference ? `Payment verified and subscription activated. Ref: ${reference}` : "Payment verified and subscription activated."));
      void refreshMe();
    } else if (payment === "pending") {
      setError(message ?? (reference ? `Payment is still pending. Ref: ${reference}` : "Payment is still pending."));
    } else {
      setError(message ?? (reference ? `Payment failed. Ref: ${reference}` : "Payment failed."));
    }
  }, [refreshMe, searchParams]);

  useEffect(() => {
    return () => {
      if (jazzcashPollingTimerRef.current) {
        window.clearInterval(jazzcashPollingTimerRef.current);
      }
    };
  }, []);

  function normalizeJazzcashMobile(value: string) {
    const digits = value.replace(/\D/g, "");
    return /^03\d{9}$/.test(digits) ? digits : "";
  }

  function openJazzcashModal(plan: Plan) {
    if (plan.isSuspended) {
      setError(`${plan.name} is temporarily suspended and cannot be purchased right now.`);
      return;
    }
    setJazzcashModalPlan(plan);
    setJazzcashModalMobile(normalizeJazzcashMobile(String(me?.user?.contactNumber ?? "")));
    setJazzcashModalError(null);
    setError(null);
    setSuccess(null);
  }

  function closeJazzcashModal() {
    setJazzcashModalPlan(null);
    setJazzcashModalMobile("");
    setJazzcashModalError(null);
  }

  function clearJazzcashPolling() {
    if (jazzcashPollingTimerRef.current) {
      window.clearInterval(jazzcashPollingTimerRef.current);
      jazzcashPollingTimerRef.current = null;
    }
  }

  function startJazzcashPolling(reference: string) {
    clearJazzcashPolling();
    let attempts = 0;
    const maxAttempts = 30;
    let inFlight = false;

    jazzcashPollingTimerRef.current = window.setInterval(async () => {
      if (inFlight) return;
      inFlight = true;
      attempts += 1;
      try {
        const status = await fetchJazzcashPaymentStatus(reference);
        const paymentStatus = status.status;
        if (paymentStatus === "SUCCEEDED") {
          clearJazzcashPolling();
          setJazzcashPendingReference(null);
          setJazzcashPendingMessage(null);
          await refreshMe();
          setSuccess(status.responseMessage ?? `Payment verified and subscription activated. Ref: ${reference}`);
          return;
        }
        if (paymentStatus === "FAILED" || paymentStatus === "CANCELED") {
          clearJazzcashPolling();
          setJazzcashPendingReference(null);
          setJazzcashPendingMessage(null);
          setError(status.responseMessage ?? `Payment failed. Ref: ${reference}`);
          return;
        }

        setJazzcashPendingMessage(status.responseMessage ?? "Payment request sent to your JazzCash mobile number. Please approve with MPIN on your phone.");
      } catch {
        // Keep polling despite transient errors.
      } finally {
        inFlight = false;
      }

      if (attempts >= maxAttempts) {
        clearJazzcashPolling();
        setJazzcashPendingMessage("Still waiting for JazzCash confirmation. You can keep this page open and click Resume payment later.");
      }
    }, 4000);
  }

  function findPendingPlan() {
    const pendingPlanId = me?.pendingPayment?.planId;
    if (!pendingPlanId) return null;
    return plans.find((plan) => plan.id === pendingPlanId) ?? null;
  }

  function resumePendingPayment() {
    const pendingPayment = me?.pendingPayment;
    if (!pendingPayment) return;

    setError(null);
    setSuccess(null);

    if (pendingPayment.resumeMode === "JAZZCASH") {
      const pendingPlan = findPendingPlan();
      if (!pendingPlan) {
        setError("Pending JazzCash plan was not found. Select the package and start JazzCash checkout again.");
        return;
      }
      openJazzcashModal(pendingPlan);
      return;
    }

    if (pendingPayment.invoice) {
      const pendingPlan = findPendingPlan();
      if (!pendingPlan) {
        setError("Pending invoice plan was not found. Select the package and re-open manual payment.");
        return;
      }
      setManualPaymentPlan(pendingPlan);
      setManualPaymentInvoice({
        id: pendingPayment.invoice.id,
        invoiceNumber: pendingPayment.invoice.invoiceNumber,
        amountCents: pendingPayment.invoice.amountCents,
        currency: pendingPayment.invoice.currency,
      });
      return;
    }

    setError("This pending payment cannot be resumed from hosted checkout in production. Start a fresh payment from this page.");
  }

  function submitJazzcashForm(actionUrl: string, fields: Record<string, string>) {
    const resolvedActionUrl = actionUrl.startsWith("http") ? actionUrl : apiUrl(actionUrl);
    const form = document.createElement("form");
    form.method = "post";
    form.action = resolvedActionUrl;
    form.acceptCharset = "utf-8";
    form.style.display = "none";
    for (const [key, value] of Object.entries(fields)) {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = key;
      input.value = value;
      form.appendChild(input);
    }
    document.body.appendChild(form);
    form.submit();
  }

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

  async function confirmJazzcashPayment() {
    const plan = jazzcashModalPlan;
    if (!plan) return;
    const normalizedMobile = normalizeJazzcashMobile(jazzcashModalMobile);
    if (!normalizedMobile) {
      setJazzcashModalError("Enter a valid JazzCash mobile number in 03XXXXXXXXX format.");
      return;
    }
    setJazzcashModalError(null);
    setInitiatingJazzcashPlanId(plan.id);
    try {
      const response = await createJazzcashMobileWalletPayment(plan.id, normalizedMobile);
      closeJazzcashModal();
      if (response.status === "success") {
        await refreshMe();
        setSuccess(response.message || "Payment verified and subscription activated.");
        return;
      }

      if (response.status === "pending" || response.status === "awaiting_customer_approval") {
        setJazzcashPendingReference(response.payment.reference);
        setJazzcashPendingMessage(response.message || "Payment request sent to your JazzCash mobile number. Please approve with MPIN on your phone.");
        startJazzcashPolling(response.payment.reference);
        return;
      }

      setError(response.message || "JazzCash payment failed.");
    } catch (err) {
      setJazzcashModalError(err instanceof Error ? err.message : "Failed to initiate JazzCash payment");
    } finally {
      setInitiatingJazzcashPlanId(null);
    }
  }

  async function confirmJazzcashHostedFallbackPayment() {
    const plan = jazzcashModalPlan;
    if (!plan) return;
    const normalizedMobile = normalizeJazzcashMobile(jazzcashModalMobile);
    if (!normalizedMobile) {
      setJazzcashModalError("Enter a valid JazzCash mobile number in 03XXXXXXXXX format.");
      return;
    }
    setJazzcashModalError(null);
    setInitiatingJazzcashPlanId(plan.id);
    try {
      const response = await createJazzcashHostedCheckoutPayment(plan.id, normalizedMobile);
      closeJazzcashModal();
      submitJazzcashForm(response.actionUrl, response.fields);
    } catch (err) {
      setJazzcashModalError(err instanceof Error ? err.message : "Failed to initiate hosted JazzCash checkout");
    } finally {
      setInitiatingJazzcashPlanId(null);
    }
  }

  return (
    <>
      <PageShell className="space-y-5">
        <PageHeader eyebrow="Billing" title={modeTitle} subtitle={modeSubtitle} />

      <Card className="overflow-hidden border-slate-200 bg-white p-5 shadow-sm md:p-6">
        <div className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand/10 px-4 py-2 text-sm font-semibold text-brand">
              <Sparkles className="h-4 w-4" />
              {modeTitle}
            </div>
            <div className="mt-5 text-xl font-semibold text-slate-900">Package summary</div>
            <div className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">Plan, usage, and billing in one view.</div>

            {error ? <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
            {success ? <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div> : null}
            {me?.pendingPayment ? (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Pending payment for {me.pendingPayment.planName}. Invoice {me.pendingPayment.invoice?.invoiceNumber ?? "pending"}.
                {me.pendingPayment.legacyMockCheckout?.enabled ? (
                  <div className="mt-2 rounded-lg border border-slate-300 bg-white/80 px-3 py-2 text-xs text-slate-700">
                    Legacy mock payment. Not available in production.
                  </div>
                ) : null}
                <button
                  className="ml-3 rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white"
                  type="button"
                  onClick={resumePendingPayment}
                >
                  Resume payment
                </button>
              </div>
            ) : null}
            {jazzcashPendingReference ? (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <div className="font-semibold">JazzCash request sent</div>
                <div className="mt-1">{jazzcashPendingMessage ?? "Payment request sent to your JazzCash mobile number. Please approve with MPIN on your phone."}</div>
                <div className="mt-1 text-xs">Reference: {jazzcashPendingReference}</div>
              </div>
            ) : null}
          </div>
          <div className="rounded-[20px] border border-[color:var(--line)] bg-[#F8FAFC] p-5 shadow-sm">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Active package</div>
            <div className="mt-3 ui-cell-wrap text-3xl font-semibold text-slate-900">{activePlanName}</div>
            <div className="mt-4 grid gap-3 text-sm text-slate-600">
              <div className="flex items-center justify-between gap-4"><span>Used Units</span><span className="font-semibold">{usedUnits.toLocaleString()}</span></div>
              <div className="flex items-center justify-between gap-4"><span>Remaining Units</span><span className="font-semibold">{remainingUnits.toLocaleString()}</span></div>
              <div className="flex items-center justify-between gap-4"><span>Total Shared Units</span><span className="font-semibold">{totalUnits.toLocaleString()}</span></div>
              <div className="flex items-center justify-between gap-4"><span>Tracking Actions</span><span className="font-semibold">{(me?.usage?.trackingGenerated ?? 0).toLocaleString()}</span></div>
              <div className={`flex items-center justify-between gap-4 ${nearExpiry ? "text-amber-700" : expired ? "text-red-700" : ""}`}><span>Expiry Date</span><span className="font-semibold">{expiryDateObj ? expiryDateObj.toLocaleDateString("en-PK") : "-"}</span></div>
              <div className="flex items-center justify-between gap-4"><span>Billing Status</span><span className="font-semibold">{billingStatus}</span></div>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
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
              <div className="flex h-full flex-col p-5 md:p-6">
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
                    <div className="mt-2 text-sm text-gray-600">Shared units: {(plan.unitsIncluded ?? plan.monthlyLabelLimit).toLocaleString()}</div>
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
                    Labels, tracking, money orders, complaints
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-emerald-500" />
                    Complaint limits: {plan.dailyComplaintLimit ?? 0}/day, {plan.monthlyComplaintLimit ?? 0}/month
                  </div>
                </div>
                {plan.isSuspended ? <div className="mt-3 text-xs font-medium text-red-600">Temporarily suspended by admin.</div> : null}

                <div className="mt-auto pt-5">
                <ActionButton
                  className="mt-6 w-full"
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
                </ActionButton>
                {discountedPrice > 0 && !isCurrent && !plan.isSuspended && (
                  <div className="mt-2 space-y-2">
                    <ActionButton
                      type="button"
                      variant="secondary"
                      className="w-full text-xs"
                      onClick={() => openJazzcashModal(plan)}
                    >
                      Pay with JazzCash
                    </ActionButton>
                    <ActionButton
                      type="button"
                      variant="secondary"
                      className="w-full text-xs"
                      disabled={initiatingWalletPlanId === plan.id}
                      onClick={() => initiateWalletPayment(plan)}
                    >
                      {initiatingWalletPlanId === plan.id ? "Creating invoice…" : "Pay via Easypaisa / Bank Transfer"}
                    </ActionButton>
                  </div>
                )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </PageShell>
    {jazzcashModalPlan ? (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
        <div className="w-full max-w-md rounded-[24px] border border-white/70 bg-white shadow-2xl" role="dialog" aria-modal="true" aria-label="Enter JazzCash Mobile Number">
          <div className="flex items-start justify-between border-b border-slate-200 px-6 py-4">
            <div>
              <div className="text-base font-semibold text-slate-900">Enter JazzCash Mobile Number</div>
              <div className="mt-1 text-xs text-slate-500">{jazzcashModalPlan.name}</div>
            </div>
            <button
              type="button"
              onClick={closeJazzcashModal}
              className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              aria-label="Close JazzCash modal"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-4 px-6 py-5">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Enter your JazzCash mobile number, then send a payment request. Approve on your phone with MPIN when prompted.
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500" htmlFor="jazzcash-modal-mobile">
                JazzCash mobile number
              </label>
              <input
                id="jazzcash-modal-mobile"
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand"
                name="jazzcashMobile"
                autoComplete="tel"
                inputMode="numeric"
                pattern="03[0-9]{9}"
                maxLength={11}
                placeholder="03123456789"
                value={jazzcashModalMobile}
                onChange={(event) => {
                  setJazzcashModalMobile(event.target.value.replace(/\D/g, "").slice(0, 11));
                  if (jazzcashModalError) setJazzcashModalError(null);
                }}
              />
            </div>
            {jazzcashModalError ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{jazzcashModalError}</div> : null}
            <div className="flex gap-3">
              <ActionButton type="button" variant="secondary" className="flex-1" onClick={closeJazzcashModal} disabled={initiatingJazzcashPlanId === jazzcashModalPlan.id}>
                Cancel
              </ActionButton>
              <ActionButton type="button" className="flex-1" onClick={() => void confirmJazzcashPayment()} disabled={initiatingJazzcashPlanId === jazzcashModalPlan.id}>
                {initiatingJazzcashPlanId === jazzcashModalPlan.id ? "Sending request…" : "Pay Now"}
              </ActionButton>
            </div>
            <ActionButton
              type="button"
              variant="secondary"
              className="w-full text-xs"
              onClick={() => void confirmJazzcashHostedFallbackPayment()}
              disabled={initiatingJazzcashPlanId === jazzcashModalPlan.id}
            >
              Try hosted checkout instead (fallback)
            </ActionButton>
          </div>
        </div>
      </div>
    ) : null}
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




