import { Link, useSearchParams } from "react-router-dom";
import { getToken } from "../lib/auth";

function mapStatusHeadline(status: string) {
  if (status === "AGGREGATOR_GATEWAY_SUCCESS") return "Aggregator Payment Successful";
  if (status === "AGGREGATOR_GATEWAY_PENDING") return "Aggregator Payment Pending";
  if (status === "AGGREGATOR_GATEWAY_REDIRECTED") return "Redirect Completed";
  if (status === "AGGREGATOR_GATEWAY_INITIATED") return "Payment Initiated";
  if (status === "AGGREGATOR_GATEWAY_CANCELLED") return "Payment Cancelled";
  if (status === "AGGREGATOR_GATEWAY_EXPIRED") return "Payment Expired";
  if (status === "AGGREGATOR_GATEWAY_MANUAL_RECONCILIATION_REQUIRED") return "Reconciliation Required";
  return "Aggregator Payment Failed";
}

function mapStatusTone(status: string) {
  if (status === "AGGREGATOR_GATEWAY_SUCCESS") return "success";
  if (status === "AGGREGATOR_GATEWAY_PENDING" || status === "AGGREGATOR_GATEWAY_REDIRECTED" || status === "AGGREGATOR_GATEWAY_INITIATED") {
    return "pending";
  }
  return "failed";
}

export default function AggregatorJazzCashResult() {
  const [params] = useSearchParams();
  const orderRef = params.get("orderRef") ?? "";
  const status = params.get("status") ?? "AGGREGATOR_GATEWAY_FAILED";
  const message = params.get("message") ?? "";
  const tone = mapStatusTone(status);
  const isLoggedIn = Boolean(getToken());

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f6faf8] px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-[#d3e7de] bg-white p-8 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <div className="mb-6 flex justify-center">
          {tone === "success" ? (
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-3xl">✓</span>
          ) : tone === "pending" ? (
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-3xl">⏳</span>
          ) : (
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-rose-100 text-3xl">✕</span>
          )}
        </div>

        <h1 className="mb-2 text-center text-2xl font-bold text-slate-900">{mapStatusHeadline(status)}</h1>
        <p className="mb-1 text-center text-xs font-semibold uppercase tracking-wide text-slate-400">Status Code</p>
        <p className="mb-4 text-center font-mono text-xs text-slate-600 break-all">{status}</p>

        {message ? <p className="mb-4 text-center text-sm text-slate-500">{message}</p> : null}

        <p className="mb-6 text-center text-sm text-slate-700">
          This result applies to the isolated aggregator JazzCash gateway lane only. It does not confirm final Pakistan Post booking completion.
        </p>

        {orderRef ? (
          <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-center">
            <span className="block text-xs font-medium uppercase tracking-wider text-slate-400">Order Reference</span>
            <span className="mt-0.5 block font-mono text-sm font-semibold text-slate-700 break-all">{orderRef}</span>
          </div>
        ) : null}

        <div className="flex flex-col gap-3">
          {isLoggedIn ? (
            <Link
              to="/aggregator-bookings"
              className="inline-flex w-full items-center justify-center rounded-xl bg-[#0f766e] px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#115e59] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0f766e]"
            >
              Go to Aggregator Bookings
            </Link>
          ) : (
            <Link
              to="/login"
              className="inline-flex w-full items-center justify-center rounded-xl bg-[#0f766e] px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#115e59] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0f766e]"
            >
              Login to Continue
            </Link>
          )}

          <Link
            to="/"
            className="inline-flex w-full items-center justify-center rounded-xl border border-[#dce8f5] bg-white px-6 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
          >
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
