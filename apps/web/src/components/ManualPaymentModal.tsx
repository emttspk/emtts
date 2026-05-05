import { useEffect, useRef, useState } from "react";
import { X, Smartphone, QrCode, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { api, apiUrl } from "../lib/api";

type Plan = {
  id: string;
  name: string;
  priceCents: number;
};

type WalletInfo = {
  jazzcash: { accountNumber: string; accountTitle: string; qrUrl: string | null };
  easypaisa: { accountNumber: string; accountTitle: string; qrUrl: string | null };
};

type MyPaymentRequest = {
  id: string;
  status: string;
  paymentMethod: string;
  transactionId: string;
  amountCents: number;
  currency: string;
  plan: { id: string; name: string; priceCents: number };
  notes?: string | null;
  createdAt: string;
};

type Props = {
  plan: Plan;
  onClose: () => void;
  onSuccess: () => void;
};

const formatPKR = new Intl.NumberFormat("en-PK", {
  style: "currency",
  currency: "PKR",
  currencyDisplay: "code",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

type PaymentMethod = "JAZZCASH" | "EASYPAISA";

export default function ManualPaymentModal({ plan, onClose, onSuccess }: Props) {
  const [step, setStep] = useState<"method" | "details" | "submitted">("method");
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [walletInfo, setWalletInfo] = useState<WalletInfo | null>(null);
  const [transactionId, setTransactionId] = useState("");
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedRequest, setSubmittedRequest] = useState<MyPaymentRequest | null>(null);
  const [pendingRequests, setPendingRequests] = useState<MyPaymentRequest[]>([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api<WalletInfo>("/api/manual-payments/wallet-info")
      .then((data) => setWalletInfo(data))
      .catch(() => {});
  }, []);

  // Load pending requests for this plan
  useEffect(() => {
    setLoadingPending(true);
    api<{ requests: MyPaymentRequest[] }>("/api/manual-payments/my")
      .then(({ requests }) => {
        setPendingRequests(requests.filter((r) => r.plan.id === plan.id && r.status === "PENDING"));
      })
      .catch(() => {})
      .finally(() => setLoadingPending(false));
  }, [plan.id]);

  const selectedInfo = method ? walletInfo?.[method.toLowerCase() as "jazzcash" | "easypaisa"] : null;

  function handleMethodSelect(m: PaymentMethod) {
    setMethod(m);
    setStep("details");
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!method) return;
    if (!transactionId.trim()) {
      setError("Transaction ID is required.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("planId", plan.id);
      formData.append("paymentMethod", method);
      formData.append("transactionId", transactionId.trim());
      if (screenshot) {
        formData.append("screenshot", screenshot);
      }

      const res = await fetch(apiUrl("/api/manual-payments"), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token") ?? ""}`,
        },
        body: formData,
      });

      const json = (await res.json()) as { request?: MyPaymentRequest; error?: string };

      if (!res.ok) {
        setError(json.error ?? "Failed to submit payment request.");
        return;
      }

      setSubmittedRequest(json.request ?? null);
      setStep("submitted");
      onSuccess();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const amountFormatted = formatPKR.format(Math.round(plan.priceCents / 100)).replace(/\u00A0/g, " ").replace("PKR", "Rs.");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Manual Wallet Payment</h2>
            <p className="mt-0.5 text-xs text-slate-500">{plan.name} — {amountFormatted}/month</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-6 py-5">
          {/* Existing pending request banner */}
          {!loadingPending && pendingRequests.length > 0 && step !== "submitted" && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <strong>Pending review:</strong> You already submitted a payment for this plan. Please wait for admin approval.
            </div>
          )}

          {/* STEP 1: Method selection */}
          {step === "method" && (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                Transfer {amountFormatted} to the merchant wallet of your choice, then submit the transaction ID below.
              </p>
              <div className="grid grid-cols-2 gap-3 pt-1">
                {(["JAZZCASH", "EASYPAISA"] as PaymentMethod[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => handleMethodSelect(m)}
                    className="flex flex-col items-center gap-2 rounded-2xl border-2 border-slate-200 bg-white p-5 text-sm font-semibold text-slate-800 transition hover:border-brand hover:bg-brand/5 hover:text-brand"
                  >
                    <Smartphone className="h-7 w-7" />
                    {m === "JAZZCASH" ? "JazzCash" : "Easypaisa"}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* STEP 2: Transfer details + form */}
          {step === "details" && method && (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Merchant info */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <Smartphone className="h-4 w-4 text-brand" />
                  {method === "JAZZCASH" ? "JazzCash" : "Easypaisa"} Details
                </div>
                <div className="space-y-1 text-sm text-slate-700">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Account Title</span>
                    <span className="font-medium">{selectedInfo?.accountTitle ?? "ePost Pakistan"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Account Number</span>
                    <span className="font-medium font-mono">{selectedInfo?.accountNumber ?? "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Amount</span>
                    <span className="font-semibold text-brand">{amountFormatted}</span>
                  </div>
                </div>
                {selectedInfo?.qrUrl && (
                  <div className="mt-3 flex flex-col items-center gap-2">
                    <div className="flex items-center gap-1 text-xs text-slate-500">
                      <QrCode className="h-3 w-3" />
                      Scan QR to pay
                    </div>
                    <img
                      src={selectedInfo.qrUrl}
                      alt={`${method} QR code`}
                      className="h-36 w-36 rounded-xl border border-slate-200 object-contain"
                    />
                  </div>
                )}
              </div>

              {/* Transaction ID */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Transaction ID <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={transactionId}
                  onChange={(e) => setTransactionId(e.target.value)}
                  placeholder="Enter transaction reference number"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-brand focus:border-brand focus:ring-2"
                  required
                  maxLength={100}
                />
              </div>

              {/* Screenshot upload (optional) */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Screenshot <span className="text-slate-400">(optional)</span>
                </label>
                <div
                  className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-slate-200 px-4 py-3 text-sm text-slate-500 hover:border-brand hover:text-brand"
                  onClick={() => fileRef.current?.click()}
                >
                  <QrCode className="h-4 w-4 shrink-0" />
                  {screenshot ? (
                    <span className="truncate text-slate-700">{screenshot.name}</span>
                  ) : (
                    "Click to attach payment screenshot"
                  )}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    setScreenshot(file);
                  }}
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => { setStep("method"); setError(null); }}
                  className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {submitting ? "Submitting…" : "Submit Payment"}
                </button>
              </div>
            </form>
          )}

          {/* STEP 3: Submitted confirmation */}
          {step === "submitted" && (
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <CheckCircle className="h-12 w-12 text-emerald-500" />
              <div>
                <p className="text-base font-semibold text-slate-900">Payment Submitted</p>
                <p className="mt-1 text-sm text-slate-500">
                  Your payment request has been submitted and is awaiting admin approval. You will be notified once it's reviewed.
                </p>
              </div>
              {submittedRequest && (
                <div className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-xs text-slate-600 space-y-1">
                  <div className="flex justify-between"><span>Method</span><span className="font-medium">{submittedRequest.paymentMethod}</span></div>
                  <div className="flex justify-between"><span>Transaction ID</span><span className="font-mono font-medium">{submittedRequest.transactionId}</span></div>
                  <div className="flex justify-between"><span>Amount</span><span className="font-medium">{formatPKR.format(Math.round(submittedRequest.amountCents / 100)).replace(/\u00A0/g, " ").replace("PKR", "Rs.")}</span></div>
                  <div className="flex justify-between"><span>Status</span><span className="font-medium text-amber-700">Pending Review</span></div>
                </div>
              )}
              <button
                type="button"
                onClick={onClose}
                className="mt-2 w-full rounded-xl bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-700"
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
