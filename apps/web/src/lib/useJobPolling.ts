import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { JobStatus, LabelJob } from "./types";

export function useJobPolling(opts: {
  onDone?: () => void;
  onStatusChange?: (job: LabelJob) => void | Promise<void>;
  onTerminal?: (job: LabelJob) => void | Promise<void>;
}) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [jobError, setJobError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  const lastStatusRef = useRef<JobStatus | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, []);

  async function tick(id: string) {
    const res = await api<{ job: LabelJob }>(`/api/jobs/${id}`);
    setJobStatus(res.job.status);
    setJobError(res.job.error ?? null);
    console.info("[job-polling] tick", { jobId: id, status: res.job.status, error: res.job.error ?? null });
    if (lastStatusRef.current !== res.job.status) {
      lastStatusRef.current = res.job.status;
      await opts.onStatusChange?.(res.job);
    }
    if (res.job.status === "COMPLETED" || res.job.status === "FAILED") {
      if (timer.current) window.clearInterval(timer.current);
      timer.current = null;
      console.info("[job-polling] terminal", { jobId: id, status: res.job.status });
      await opts.onTerminal?.(res.job);
      opts.onDone?.();
    }
  }

  function start(id: string) {
    console.info("[job-polling] start", { jobId: id });
    setJobId(id);
    setJobStatus("QUEUED");
    setJobError(null);
    lastStatusRef.current = "QUEUED";
    if (timer.current) window.clearInterval(timer.current);
    void tick(id);
    timer.current = window.setInterval(() => void tick(id), 2000);
  }

  function reset() {
    console.info("[job-polling] reset", { jobId });
    setJobId(null);
    setJobStatus(null);
    setJobError(null);
    lastStatusRef.current = null;
    if (timer.current) window.clearInterval(timer.current);
    timer.current = null;
  }

  return { jobId, jobStatus, jobError, start, reset };
}
