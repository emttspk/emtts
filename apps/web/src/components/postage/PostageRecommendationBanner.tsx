import { recommendationLabel } from "../../lib/postageComparison";

export default function PostageRecommendationBanner({ recommendation, rationale }: { recommendation: string; rationale: string[] }) {
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm">
      <div className="font-semibold">{recommendationLabel(recommendation)}</div>
      <div className="mt-1 text-xs">{rationale.join(" ")}</div>
    </div>
  );
}
