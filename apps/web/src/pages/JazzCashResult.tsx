import { Link, useSearchParams } from "react-router-dom";
import { getToken } from "../lib/auth";

export default function JazzCashResult() {
  const [params] = useSearchParams();
  const status = params.get("status") ?? "";
  const ref = params.get("ref") ?? "";
  const message = params.get("message") ?? "";
  const isLoggedIn = Boolean(getToken());

  const isSuccess = status === "success";
  const isPending = status === "pending";
  const isFailed = !isSuccess && !isPending;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f8fafc] px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-[#dce8f5] bg-white p-8 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        {/* Icon */}
        <div className="mb-6 flex justify-center">
          {isSuccess ? (
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-3xl">
              ✓
            </span>
          ) : isPending ? (
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-3xl">
              ⏳
            </span>
          ) : (
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-3xl">
              ✕
            </span>
          )}
        </div>

        {/* Heading */}
        <h1 className="mb-2 text-center text-2xl font-bold text-slate-900">
          {isSuccess ? "Payment Received" : isPending ? "Payment Pending" : "Payment Failed"}
        </h1>

        {/* Provider message */}
        {message ? (
          <p className="mb-2 text-center text-sm text-slate-500">{message}</p>
        ) : null}

        {/* Status guidance */}
        <p className="mb-6 text-center text-sm text-slate-600">
          {isSuccess
            ? "Your JazzCash payment was verified successfully. Your subscription will be activated shortly. Please log in to confirm your package status."
            : isPending
              ? "Your payment is still being processed. Please log in after a few minutes to check your subscription status."
              : "Your JazzCash payment could not be processed. Please try again or contact support."}
        </p>

        {/* Reference */}
        {ref && ref !== "unknown" ? (
          <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-center">
            <span className="block text-xs font-medium uppercase tracking-wider text-slate-400">
              Transaction Reference
            </span>
            <span className="mt-0.5 block font-mono text-sm font-semibold text-slate-700 break-all">
              {ref}
            </span>
          </div>
        ) : null}

        {/* Actions */}
        <div className="flex flex-col gap-3">
          {isLoggedIn ? (
            <Link
              to="/billing"
              className="inline-flex w-full items-center justify-center rounded-xl bg-[#0b7f6d] px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#096658] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0b7f6d]"
            >
              Go to Billing
            </Link>
          ) : (
            <Link
              to="/login"
              className="inline-flex w-full items-center justify-center rounded-xl bg-[#0b7f6d] px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#096658] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0b7f6d]"
            >
              Login to View Subscription
            </Link>
          )}

          <Link
            to="/"
            className="inline-flex w-full items-center justify-center rounded-xl border border-[#dce8f5] bg-white px-6 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
          >
            Back to Home
          </Link>
        </div>

        {/* Brand footer */}
        <p className="mt-8 text-center text-xs text-slate-400">
          ePost.pk · Secure Payment Gateway
        </p>
      </div>
    </div>
  );
}
