export default function PostageBundleSummaryCard({
  totalArticles,
  totalWeightGrams,
  averageWeightGrams,
}: { totalArticles: number; totalWeightGrams: number; averageWeightGrams: number }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm">Articles: {totalArticles} | Bundle Weight: {totalWeightGrams}g | Avg: {Math.round(averageWeightGrams)}g</div>;
}
