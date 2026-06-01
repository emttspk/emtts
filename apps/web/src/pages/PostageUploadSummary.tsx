import { useState } from "react";
import { PageShell, PageTitle } from "../components/ui/PageSystem";
import { calculatePostageFromFile } from "../lib/postageCalculator";
import PostageBundleSummaryCard from "../components/postage/PostageBundleSummaryCard";

export default function PostageUploadSummary() {
  const [data, setData] = useState<any>(null);
  return (
    <PageShell>
      <PageTitle>Postage Upload Summary</PageTitle>
      <input type="file" accept=".csv,.xlsx,.xls" onChange={async (e) => {
        const file = e.target.files?.[0];
        if (file) setData(await calculatePostageFromFile(file));
      }} />
      {data ? <PostageBundleSummaryCard {...data.calculator} /> : null}
    </PageShell>
  );
}
