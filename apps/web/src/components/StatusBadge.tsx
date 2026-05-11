import { cn } from "../lib/cn";
import type { JobStatus } from "../lib/types";

const styles: Record<JobStatus, { label: string; cls: string }> = {
  QUEUED: { label: "Queued", cls: "bg-slate-100 text-slate-700 ring-slate-200" },
  PROCESSING: { label: "Processing", cls: "bg-amber-50 text-amber-700 ring-amber-200" },
  COMPLETED: { label: "Completed", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  FAILED: { label: "Failed", cls: "bg-red-50 text-red-700 ring-red-200" },
};

export default function StatusBadge(props: { status: JobStatus }) {
  const s = styles[props.status];
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold tracking-[-0.01em] ring-1 ring-inset", s.cls)}>
      {s.label}
    </span>
  );
}
