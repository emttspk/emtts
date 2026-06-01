import { useState } from "react";
import { PageShell, PageTitle } from "../components/ui/PageSystem";
import PostageCalculatorForm from "../components/postage/PostageCalculatorForm";
import PostageArticleTable from "../components/postage/PostageArticleTable";
import PostageBundleSummaryCard from "../components/postage/PostageBundleSummaryCard";
import { calculatePostageFromRows } from "../lib/postageCalculator";

export default function PostageCalculator() {
  const [data, setData] = useState<any>(null);
  return (
    <PageShell>
      <PageTitle>Postage Calculator</PageTitle>
      <div className="space-y-3">
        <PostageCalculatorForm onSubmit={async (rows) => setData(await calculatePostageFromRows(rows))} />
        {data ? <PostageBundleSummaryCard {...data.calculator} /> : null}
        {data ? <PostageArticleTable rows={data.calculator.perArticle} /> : null}
      </div>
    </PageShell>
  );
}
