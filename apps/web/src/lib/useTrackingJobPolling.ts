import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { JobStatus, TrackingJob } from "./types";

export function useTrackingJobPolling(opts: { onDone?: (result: unknown | null) => void }) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [jobError, setJobError] = useState<string | null>(null);
  const [result, setResult] = useState<unknown | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, []);

  async function tick(id: string) {
    const res = await api<{ job: TrackingJob; result: unknown | null }>(`/api/tracking/${id}`);
    setJobStatus(res.job.status);
    setJobError(res.job.error ?? null);
    setResult(res.result ?? null);
    console.info("[tracking-polling] tick", { jobId: id, status: res.job.status, error: res.job.error ?? null });
    if (res.job.status === "COMPLETED" || res.job.status === "FAILED") {
      if (timer.current) window.clearInterval(timer.current);
      timer.current = null;
      console.info("[tracking-polling] terminal", { jobId: id, status: res.job.status });
      opts.onDone?.(res.result ?? null);
    }
  }

  function start(id: string) {
    console.info("[tracking-polling] start", { jobId: id });
    setJobId(id);
    setJobStatus("QUEUED");
    setJobError(null);
    setResult(null);
    if (timer.current) window.clearInterval(timer.current);
    void tick(id);
    timer.current = window.setInterval(() => void tick(id), 2000);
  }

  function reset() {
    console.info("[tracking-polling] reset", { jobId });
    setJobId(null);
    setJobStatus(null);
    setJobError(null);
    setResult(null);
    if (timer.current) window.clearInterval(timer.current);
    timer.current = null;
  }

  return { jobId, jobStatus, jobError, result, start, reset };
}
