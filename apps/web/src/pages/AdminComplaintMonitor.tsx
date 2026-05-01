import { useEffect, useMemo, useState } from "react";
import Card from "../components/Card";
import { api } from "../lib/api";

type ComplaintMonitorSummary = {
  queued: number;
  processing: number;
  retry_pending: number;
  manual_review: number;
  submitted: number;
  duplicate: number;
  open: number;
  resolved: number;
};

type ComplaintQueueRow = {
  id: string;
  trackingId: string;
  complaintStatus: string;
  complaintId: string | null;
  dueDate: string | null;
  retryCount: number;
  nextRetryAt: string | null;
  updatedAt: string;
  lastError: string | null;
};

type ComplaintCircuit = {
  open: boolean;
  openedAt: string | null;
  nextRetryAt: string | null;
  failureCount: number;
};

type MonitorResponse = {
  success: boolean;
  summary: ComplaintMonitorSummary;
  circuit: ComplaintCircuit;
  queue: ComplaintQueueRow[];
};

function normalizeStatusLabel(raw: string | null | undefined) {
  const token = String(raw ?? "").trim().toUpperCase().replace(/[\-_]+/g, " ");
  if (!token) return "QUEUED";
  if (token === "RETRYING") return "RETRY PENDING";
  return token;
}

function statusClass(raw: string | null | undefined) {
  const token = normalizeStatusLabel(raw);
  if (token === "QUEUED") return "border-slate-200 bg-slate-50 text-slate-700";
  if (token === "PROCESSING") return "border-blue-200 bg-blue-50 text-blue-700";
  if (token === "RETRY PENDING") return "border-amber-200 bg-amber-50 text-amber-700";
  if (token === "MANUAL REVIEW") return "border-red-200 bg-red-50 text-red-700";
  if (token === "RESOLVED" || token === "CLOSED") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (token === "DUPLICATE") return "border-violet-200 bg-violet-50 text-violet-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function formatRetryCountdown(nextRetryAt: string | null | undefined, nowMs: number) {
  const target = nextRetryAt ? new Date(nextRetryAt).getTime() : 0;
  if (!Number.isFinite(target) || target <= 0) return "-";
  const delta = Math.max(0, target - nowMs);
  if (delta === 0) return "Due now";
  const minutes = Math.floor(delta / 60_000);
  const seconds = Math.floor((delta % 60_000) / 1000);
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

export default function AdminComplaintMonitor() {
  const [monitor, setMonitor] = useState<MonitorResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());

  async function refresh() {
    setLoading(true);
    try {
      const data = await api<MonitorResponse>("/api/admin/complaints/monitor");
      setMonitor(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load complaint monitor");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    const poll = window.setInterval(() => {
      void refresh();
    }, 15_000);
    return () => window.clearInterval(poll);
  }, []);

  useEffect(() => {
    const tick = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, []);

  const summary = monitor?.summary;
  const queue = monitor?.queue ?? [];
  const retryRows = useMemo(
    () => queue.filter((row) => normalizeStatusLabel(row.complaintStatus) === "RETRY PENDING"),
    [queue],
  );

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-2xl font-semibold text-slate-900">Complaint Monitor</div>
            <div className="mt-1 text-sm text-slate-600">Live queue and circuit status for complaint processing.</div>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
        {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="p-4"><div className="text-xs text-slate-500">Queued</div><div className="mt-1 text-2xl font-semibold text-slate-900">{summary?.queued ?? 0}</div></Card>
          <Card className="p-4"><div className="text-xs text-slate-500">Retry Pending</div><div className="mt-1 text-2xl font-semibold text-amber-700">{summary?.retry_pending ?? 0}</div></Card>
          <Card className="p-4"><div className="text-xs text-slate-500">Manual Review</div><div className="mt-1 text-2xl font-semibold text-red-700">{summary?.manual_review ?? 0}</div></Card>
          <Card className="p-4"><div className="text-xs text-slate-500">Open Complaints</div><div className="mt-1 text-2xl font-semibold text-blue-700">{summary?.open ?? 0}</div></Card>
          <Card className="p-4"><div className="text-xs text-slate-500">Processing</div><div className="mt-1 text-2xl font-semibold text-blue-700">{summary?.processing ?? 0}</div></Card>
          <Card className="p-4"><div className="text-xs text-slate-500">Submitted</div><div className="mt-1 text-2xl font-semibold text-emerald-700">{summary?.submitted ?? 0}</div></Card>
          <Card className="p-4"><div className="text-xs text-slate-500">Duplicate</div><div className="mt-1 text-2xl font-semibold text-violet-700">{summary?.duplicate ?? 0}</div></Card>
          <Card className="p-4"><div className="text-xs text-slate-500">Resolved</div><div className="mt-1 text-2xl font-semibold text-emerald-700">{summary?.resolved ?? 0}</div></Card>
        </div>
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
          Circuit: <span className={monitor?.circuit?.open ? "font-semibold text-red-700" : "font-semibold text-emerald-700"}>{monitor?.circuit?.open ? "OPEN" : "CLOSED"}</span>
          {monitor?.circuit?.nextRetryAt ? (
            <span> · Next retry at {new Date(monitor.circuit.nextRetryAt).toLocaleString("en-GB")}</span>
          ) : null}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b px-6 py-4">
          <div className="text-lg font-semibold text-slate-900">Retry Pending Queue</div>
          <div className="mt-1 text-sm text-slate-600">Countdown visibility for rows waiting for next complaint retry.</div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2 text-left">Tracking</th>
                <th className="px-4 py-2 text-left">Complaint ID</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-left">Retry Count</th>
                <th className="px-4 py-2 text-left">Next Retry</th>
                <th className="px-4 py-2 text-left">Countdown</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {retryRows.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-2 font-mono text-xs text-slate-800">{row.trackingId}</td>
                  <td className="px-4 py-2 text-xs text-slate-700">{row.complaintId || "-"}</td>
                  <td className="px-4 py-2">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${statusClass(row.complaintStatus)}`}>
                      {normalizeStatusLabel(row.complaintStatus)}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-700">{row.retryCount}</td>
                  <td className="px-4 py-2 text-xs text-slate-700">{row.nextRetryAt ? new Date(row.nextRetryAt).toLocaleString("en-GB") : "-"}</td>
                  <td className="px-4 py-2 text-xs font-semibold text-amber-700">{formatRetryCountdown(row.nextRetryAt, nowMs)}</td>
                </tr>
              ))}
              {retryRows.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-center text-sm text-slate-500" colSpan={6}>No retry_pending rows right now.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
