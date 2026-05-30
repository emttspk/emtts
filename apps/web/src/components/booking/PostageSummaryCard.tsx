import Card from "../Card";

type Summary = {
  totalArticles: number;
  totalActualWeightGrams: number;
  totalChargeableWeightGrams: number;
  totalPostageAmount: number;
  warningRows: Array<{ rowNumber: number; warnings: string[] }>;
  errorRows: Array<{ rowNumber: number; errors: string[] }>;
};

export default function PostageSummaryCard({ summary }: { summary: Summary }) {
  return (
    <Card className="border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-base font-semibold text-slate-900">Pakistan Post Postage Estimate</h3>
      <p className="mt-1 text-xs text-slate-500">Phase 1 quote-only output. No booking creation, payment, or generation flow changes.</p>
      <div className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800">Total Articles</div>
          <div className="mt-0.5 text-base font-bold text-emerald-900">{summary.totalArticles}</div>
        </div>
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-sky-800">Actual Weight</div>
          <div className="mt-0.5 text-base font-bold text-sky-900">{summary.totalActualWeightGrams} g</div>
        </div>
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-indigo-800">Chargeable Weight</div>
          <div className="mt-0.5 text-base font-bold text-indigo-900">{summary.totalChargeableWeightGrams} g</div>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800">Total Postage</div>
          <div className="mt-0.5 text-base font-bold text-emerald-900">Rs. {summary.totalPostageAmount}</div>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-800">Warning Rows</div>
          <div className="mt-0.5 text-base font-bold text-amber-900">{summary.warningRows.length}</div>
        </div>
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-rose-800">Error Rows</div>
          <div className="mt-0.5 text-base font-bold text-rose-900">{summary.errorRows.length}</div>
        </div>
      </div>
    </Card>
  );
}
