import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { JobStatus, LabelJob } from "./types";

export function useJobPolling(opts: { onDone?: () => void; refreshJobs: () => Promise<void> }) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [jobError, setJobError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, []);

  async function tick(id: string) {
    const res = await api<{ job: LabelJob }>(`/api/jobs/${id}`);
    setJobStatus(res.job.status);
    setJobError(res.job.error ?? null);
    await opts.refreshJobs();
    if (res.job.status === "COMPLETED" || res.job.status === "FAILED") {
      if (timer.current) window.clearInterval(timer.current);
      timer.current = null;
      opts.onDone?.();
    }
  }

  function start(id: string) {
    setJobId(id);
    setJobStatus("QUEUED");
    setJobError(null);
    if (timer.current) window.clearInterval(timer.current);
    void tick(id);
    timer.current = window.setInterval(() => void tick(id), 2000);
  }

  function reset() {
    setJobId(null);
    setJobStatus(null);
    setJobError(null);
    if (timer.current) window.clearInterval(timer.current);
    timer.current = null;
  }

  return { jobId, jobStatus, jobError, start, reset };
}

