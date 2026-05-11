import { useMemo, useState } from "react";
import { ArrowUpDown, Download, Trash2 } from "lucide-react";
import Card from "./Card";
import StatusBadge from "./StatusBadge";
import { cn } from "../lib/cn";
import { api, buildJobDownloadFallbackName, triggerBrowserDownload } from "../lib/api";
import type { LabelJob } from "../lib/types";
import ActionButton from "./ui/ActionButton";

type SortKey = "id" | "file" | "rows" | "status" | "createdAt";
type SortDir = "asc" | "desc";

function sortJobs(jobs: LabelJob[], key: SortKey, dir: SortDir) {
  const next = [...jobs];
  next.sort((a, b) => {
    const mult = dir === "asc" ? 1 : -1;
    if (key === "id") return mult * a.id.localeCompare(b.id);
    if (key === "file") return mult * a.originalFilename.localeCompare(b.originalFilename);
    if (key === "rows") return mult * (a.recordCount - b.recordCount);
    if (key === "status") return mult * a.status.localeCompare(b.status);
    return mult * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  });
  return next;
}

function DownloadButton(props: { jobId: string; kind: "labels" | "money-orders" }) {
  const [busy, setBusy] = useState(false);
  const label = props.kind === "labels" ? "Labels" : "Money Orders";

  async function handleDownload() {
    if (busy) return;
    setBusy(true);
    try {
      const fallbackName = buildJobDownloadFallbackName(props.kind);
      triggerBrowserDownload(`/api/jobs/${props.jobId}/download/${props.kind}`, fallbackName);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Download failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={busy}
      className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--line)] bg-white px-3 py-2 text-xs font-semibold text-[color:var(--text-strong)] shadow-sm transition-all duration-200 hover:border-slate-300 hover:bg-slate-50"
    >
      <Download className="h-4 w-4" />
      {busy ? "Preparing..." : label}
    </button>
  );
}

export default function JobsTable(props: { jobs: LabelJob[]; title?: string; onJobsChanged?: () => Promise<void> | void }) {
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const sorted = useMemo(() => sortJobs(props.jobs, sortKey, sortDir), [props.jobs, sortKey, sortDir]);
  const deletableJobs = useMemo(() => sorted.filter((job) => job.status !== "QUEUED" && job.status !== "PROCESSING"), [sorted]);
  const allSelected = deletableJobs.length > 0 && deletableJobs.every((job) => selectedIds.includes(job.id));

  function toggle(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function toggleJob(jobId: string, checked: boolean) {
    setSelectedIds((prev) => (checked ? Array.from(new Set([...prev, jobId])) : prev.filter((id) => id !== jobId)));
  }

  function toggleAll(checked: boolean) {
    setSelectedIds(checked ? deletableJobs.map((job) => job.id) : []);
  }

  async function submitDeletion(deleteAfterDays: number) {
    if (selectedIds.length === 0 || submitting) return;
    const confirmed = window.confirm(
      deleteAfterDays === 7
        ? `Schedule ${selectedIds.length} job(s) for automatic deletion after 7 days?`
        : `Delete ${selectedIds.length} job(s) permanently?`,
    );
    if (!confirmed) return;

    setSubmitting(true);
    try {
      await api("/api/jobs/delete", {
        method: "POST",
        body: JSON.stringify({ jobIds: selectedIds, deleteAfterDays }),
      });
      setSelectedIds([]);
      await props.onJobsChanged?.();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Failed to update jobs.");
    } finally {
      setSubmitting(false);
    }
  }

  const Th = (p: { label: string; k: SortKey; align?: "left" | "right" }) => (
    <th className={cn("px-5 py-3 text-xs font-medium uppercase tracking-wide text-gray-500", p.align === "right" && "text-right")}>
      <button
        className="inline-flex items-center gap-2 transition-colors hover:text-gray-800"
        onClick={() => toggle(p.k)}
        type="button"
      >
        {p.label}
        <ArrowUpDown className="h-3.5 w-3.5" />
      </button>
    </th>
  );

  return (
    <Card className="overflow-hidden border-[color:var(--line)]">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[color:var(--line)] bg-white px-6 py-5">
        <div>
          <div className="text-xl font-semibold tracking-[-0.03em] text-[color:var(--text-strong)]">{props.title ?? "Jobs"}</div>
          <div className="mt-1 text-sm text-[color:var(--text-muted)]">Track status and download ready files.</div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 text-sm text-[color:var(--text-muted)]">
          <div className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            {sortKey} {sortDir}
          </div>
          <ActionButton
            variant="danger"
            className="min-h-[40px] px-3 py-2 text-xs"
            leadingIcon={<Trash2 className="h-3.5 w-3.5" />}
            onClick={() => submitDeletion(0)}
            disabled={selectedIds.length === 0 || submitting}
          >
            Delete
          </ActionButton>
          <ActionButton
            variant="secondary"
            className="min-h-[40px] px-3 py-2 text-xs"
            onClick={() => submitDeletion(7)}
            disabled={selectedIds.length === 0 || submitting}
          >
            Auto-delete in 7 days
          </ActionButton>
        </div>
      </div>

      <div className="flex items-center justify-between border-b border-[color:var(--line)] bg-[#F8FAFC] px-6 py-3 text-xs text-slate-600">
        <label className="inline-flex items-center gap-2 font-medium text-slate-700">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={(event) => toggleAll(event.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand"
          />
          Select All
        </label>
        <div>{selectedIds.length} selected</div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-[color:var(--line)]">
          <thead className="sticky top-0 z-10 bg-[#F8FAFC]">
            <tr>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Select</th>
              <Th label="Job ID" k="id" />
              <Th label="File" k="file" />
              <Th label="Rows" k="rows" align="right" />
              <Th label="Status" k="status" />
              <Th label="Created" k="createdAt" />
              <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">Download</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--line)] bg-white">
            {sorted.map((job) => {
              const created = new Date(job.createdAt).toLocaleString();
              const canDelete = job.status !== "QUEUED" && job.status !== "PROCESSING";
              return (
                <tr key={job.id} className="transition-colors hover:bg-[#F8FAFC]">
                  <td className="px-5 py-3 text-sm text-gray-600">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(job.id)}
                      onChange={(event) => toggleJob(job.id, event.target.checked)}
                      disabled={!canDelete}
                      className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand disabled:opacity-40"
                    />
                  </td>
                  <td className="px-5 py-3 text-sm font-mono text-slate-600">{job.id}</td>
                  <td className="px-5 py-3 text-sm font-semibold text-[color:var(--text-strong)]">{job.originalFilename}</td>
                  <td className="px-5 py-3 text-right text-sm text-gray-700">{job.recordCount.toLocaleString()}</td>
                  <td className="px-5 py-3 text-sm">
                    <StatusBadge status={job.status} />
                    {job.status === "FAILED" && job.error ? (
                      <div className="mt-1 max-w-[32ch] truncate text-xs text-red-700" title={job.error}>
                        {job.error}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-5 py-3 text-sm text-gray-600">{created}</td>
                  <td className="px-5 py-3 text-right text-sm">
                    {job.status === "COMPLETED" ? (
                      <div className="inline-flex flex-wrap items-center justify-end gap-2">
                        <DownloadButton jobId={job.id} kind="labels" />
                        {job.includeMoneyOrders ? <DownloadButton jobId={job.id} kind="money-orders" /> : null}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">-</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

