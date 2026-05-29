import Card from "../Card";

type Summary = {
  warningRows: Array<{ rowNumber: number; warnings: string[] }>;
  errorRows: Array<{ rowNumber: number; errors: string[] }>;
  byCategory: Record<string, { articles: number }>;
  byProduct: Record<string, { articles: number }>;
};

export default function BookingRecommendationCard({ summary }: { summary: Summary }) {
  const categoryLines = Object.entries(summary.byCategory)
    .sort((a, b) => b[1].articles - a[1].articles)
    .slice(0, 5)
    .map(([name, bucket]) => `${name}: ${bucket.articles}`);

  const productLines = Object.entries(summary.byProduct)
    .sort((a, b) => b[1].articles - a[1].articles)
    .slice(0, 5)
    .map(([name, bucket]) => `${name}: ${bucket.articles}`);

  return (
    <Card className="border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-base font-semibold text-slate-900">Quote Notes</h3>
      <div className="mt-2 space-y-2 text-xs text-slate-700">
        <p>This result is an estimate only and does not create a booking request.</p>
        <p>No service charges or pickup charges are included in Phase 1.</p>
        <p>Existing label generation and unit-based SaaS flow are unaffected.</p>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <div className="font-semibold text-slate-800">Top Categories</div>
          <div className="mt-1 space-y-1 text-slate-700">
            {categoryLines.length > 0 ? categoryLines.map((line) => <div key={line}>{line}</div>) : <div>No categorized rows</div>}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <div className="font-semibold text-slate-800">Top Products</div>
          <div className="mt-1 space-y-1 text-slate-700">
            {productLines.length > 0 ? productLines.map((line) => <div key={line}>{line}</div>) : <div>No mapped services</div>}
          </div>
        </div>
      </div>
      {(summary.warningRows.length > 0 || summary.errorRows.length > 0) ? (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Review per-row warnings/errors before moving to future booking phases.
        </div>
      ) : null}
    </Card>
  );
}
