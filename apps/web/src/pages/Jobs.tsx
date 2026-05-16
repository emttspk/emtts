import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Card from "../components/Card";
import JobsTable from "../components/JobsTable";
import EmptyState from "../components/EmptyState";
import { api, triggerBrowserDownload } from "../lib/api";
import type { LabelJob } from "../lib/types";
import { BodyText, CardTitle, PageShell, PageTitle } from "../components/ui/PageSystem";

export default function Jobs() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [jobs, setJobs] = useState<LabelJob[]>([]);
  const [loading, setLoading] = useState(true);
  const timer = useRef<number | null>(null);
  const seenStatuses = useRef<Map<string, LabelJob["status"]>>(new Map());
  const initializedStatuses = useRef(false);
  const filter = params.get("filter") === "completed" ? "completed" : "all";

  function autoDownload(job: LabelJob) {
    console.log("[AUTO_DOWNLOAD_TRIGGERED]", job.id);
    triggerBrowserDownload(`/api/jobs/${job.id}/download/labels`, `labels-${job.id}.pdf`);
    if (job.includeMoneyOrders) {
      window.setTimeout(() => {
        triggerBrowserDownload(`/api/jobs/${job.id}/download/money-orders`, `money-orders-${job.id}.pdf`);
      }, 600);
    }
  }

  async function load() {
    const data = await api<{ jobs: LabelJob[] }>("/api/jobs");
    if (initializedStatuses.current) {
      for (const job of data.jobs) {
        const previousStatus = seenStatuses.current.get(job.id);
        if (previousStatus && previousStatus !== "COMPLETED" && job.status === "COMPLETED") {
          autoDownload(job);
        }
      }
    }
    seenStatuses.current = new Map(data.jobs.map((job) => [job.id, job.status]));
    initializedStatuses.current = true;
    setJobs(data.jobs);
    setLoading(false);
    // Keep polling while any job is still in-progress
    const hasPending = data.jobs.some((j) => j.status === "QUEUED" || j.status === "PROCESSING");
    if (!hasPending && timer.current) {
      window.clearInterval(timer.current);
      timer.current = null;
    } else if (hasPending && !timer.current) {
      timer.current = window.setInterval(() => load().catch(() => {}), 3000);
    }
  }

  useEffect(() => {
    load().catch(() => {});
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, []);

  const visibleJobs = useMemo(() => (filter === "completed" ? jobs.filter((job) => job.status === "COMPLETED") : jobs), [filter, jobs]);
  const completedCount = useMemo(() => jobs.filter((job) => job.status === "COMPLETED").length, [jobs]);

  if (!loading && visibleJobs.length === 0) return <EmptyState onUploadClick={() => nav("/upload")} />;

  return (
    <PageShell className="space-y-3">
      <Card className="border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <CardTitle>Jobs</CardTitle>
            <div className="mt-1 text-sm font-normal text-slate-500">Downloads are now part of the same jobs workflow. Switch between all activity and ready files here.</div>
          </div>
          <div className="inline-flex rounded-2xl border border-[#E5E7EB] bg-[#F8FAF9] p-1 shadow-lg">
            <button
              type="button"
              className={`rounded-2xl px-4 py-2 text-sm font-medium transition ${filter === "all" ? "bg-white text-slate-950 shadow-lg" : "text-slate-600"}`}
              onClick={() => setParams({ filter: "all" })}
            >
              All Jobs ({jobs.length})
            </button>
            <button
              type="button"
              className={`rounded-2xl px-4 py-2 text-sm font-medium transition ${filter === "completed" ? "bg-white text-slate-950 shadow-lg" : "text-slate-600"}`}
              onClick={() => setParams({ filter: "completed" })}
            >
              Ready Downloads ({completedCount})
            </button>
          </div>
        </div>
      </Card>

      <JobsTable jobs={visibleJobs} title={filter === "completed" ? "Ready Downloads" : "All Jobs"} onJobsChanged={load} />
    </PageShell>
  );
}


