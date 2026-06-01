import { useState } from "react";
import { PageShell, PageTitle } from "../components/ui/PageSystem";
import PostageCalculatorForm from "../components/postage/PostageCalculatorForm";
import PostageComparisonPanel from "../components/postage/PostageComparisonPanel";
import PostageRecommendationBanner from "../components/postage/PostageRecommendationBanner";
import { calculatePostageFromRows } from "../lib/postageCalculator";

export default function PostageComparison() {
  const [data, setData] = useState<any>(null);
  return (
    <PageShell>
      <PageTitle>Postage Comparison</PageTitle>
      <PostageCalculatorForm onSubmit={async (rows) => setData(await calculatePostageFromRows(rows))} />
      {data ? <PostageComparisonPanel {...data.comparison} /> : null}
      {data ? <PostageRecommendationBanner recommendation={data.comparison.recommendation} rationale={data.comparison.rationale} /> : null}
    </PageShell>
  );
}
