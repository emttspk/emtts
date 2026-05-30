import Card from "../Card";
import type { BookingRecommendationOption } from "./BookingOptionSelector";

type QuoteSnapshot = {
  totalArticles: number;
  totalActualWeightGrams: number;
  totalChargeableWeightGrams: number;
  totalPostageAmount: number;
};

type RequestPreview = {
  requestOnly: true;
  noPayment: true;
  noLiveBooking: true;
  noPickupExecution: true;
  selectedOption: BookingRecommendationOption;
  quoteSnapshot: QuoteSnapshot;
  customerNotice: string;
};

export default function BookingDraftReview(props: {
  requestPreview: RequestPreview;
  previewAllowed: boolean;
}) {
  const { requestPreview, previewAllowed } = props;

  return (
    <Card className="border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-base font-semibold text-slate-900">Quote-To-Request Preview (Phase 2A)</h3>
      <p className="mt-1 text-xs text-slate-600">Preview only. No database write is performed in this phase.</p>

      <div className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">Selected Option</div>
          <div className="mt-1 font-semibold text-slate-900">{requestPreview.selectedOption}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">Request Mode</div>
          <div className="mt-1 font-semibold text-slate-900">Request Preview Only</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">Total Articles</div>
          <div className="mt-1 font-semibold text-slate-900">{requestPreview.quoteSnapshot.totalArticles}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">Total Postage</div>
          <div className="mt-1 font-semibold text-slate-900">Rs. {requestPreview.quoteSnapshot.totalPostageAmount}</div>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800">
        {requestPreview.customerNotice}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled
          title="Phase 2B feature: persisted draft/admin submission"
          className="cursor-not-allowed rounded-md border border-slate-300 bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-500"
        >
          Submit To Admin (Phase 2B - Disabled)
        </button>
        {!previewAllowed ? (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700">
            Request preview is blocked by current phase limits.
          </div>
        ) : null}
      </div>
    </Card>
  );
}
