import { useEffect, useMemo, useState } from "react";
import Card from "../components/Card";
import { api, triggerBrowserDownload } from "../lib/api";

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

type ComplaintAlertRow = {
  trackingId: string;
  complaintId?: string;
  state?: string;
  dueDate?: string;
  message?: string;
};

type ComplaintAuditRow = {
  id: string;
  action: string;
  trackingId: string | null;
  complaintId: string | null;
  details: string | null;
  createdAt: string;
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
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<{ kind: "ok" | "error"; message: string } | null>(null);
  const [alerts, setAlerts] = useState<ComplaintAlertRow[]>([]);
  const [auditLogs, setAuditLogs] = useState<ComplaintAuditRow[]>([]);
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

  async function syncAllComplaints() {
    setActionLoading("sync");
    try {
      const data = await api<{ success: boolean; count: number }>("/api/admin/complaints/sync", { method: "POST", body: JSON.stringify({}) });
      setActionNotice({ kind: "ok", message: `Sync completed (${Number(data.count ?? 0)} records).` });
      await refresh();
    } catch (e) {
      setActionNotice({ kind: "error", message: e instanceof Error ? e.message : "Sync failed" });
    } finally {
      setActionLoading(null);
    }
  }

  async function exportComplaintsCsv() {
    setActionLoading("export");
    try {
      await triggerBrowserDownload("/api/admin/complaints/export", `complaints-${new Date().toISOString().slice(0, 10)}.csv`);
      setActionNotice({ kind: "ok", message: "CSV export started." });
    } catch (e) {
      setActionNotice({ kind: "error", message: e instanceof Error ? e.message : "Export failed" });
    } finally {
      setActionLoading(null);
    }
  }

  async function loadAlerts() {
    setActionLoading("alerts");
    try {
      const data = await api<{ success: boolean; alerts: ComplaintAlertRow[] }>("/api/admin/complaints/alerts");
      setAlerts(Array.isArray(data.alerts) ? data.alerts : []);
      setActionNotice({ kind: "ok", message: `Loaded ${Array.isArray(data.alerts) ? data.alerts.length : 0} alert rows.` });
    } catch (e) {
      setActionNotice({ kind: "error", message: e instanceof Error ? e.message : "Failed to load alerts" });
    } finally {
      setActionLoading(null);
    }
  }

  async function loadAuditLog() {
    setActionLoading("audit");
    try {
      const data = await api<{ success: boolean; logs: ComplaintAuditRow[] }>("/api/admin/complaint-audit");
      setAuditLogs(Array.isArray(data.logs) ? data.logs : []);
      setActionNotice({ kind: "ok", message: `Loaded ${Array.isArray(data.logs) ? data.logs.length : 0} audit rows.` });
    } catch (e) {
      setActionNotice({ kind: "error", message: e instanceof Error ? e.message : "Failed to load audit log" });
    } finally {
      setActionLoading(null);
    }
  }

  async function backupComplaints() {
    setActionLoading("backup");
    try {
      await api<{ success: boolean }>("/api/admin/complaints/backup", { method: "POST", body: JSON.stringify({}) });
      setActionNotice({ kind: "ok", message: "Backup completed." });
    } catch (e) {
      setActionNotice({ kind: "error", message: e instanceof Error ? e.message : "Backup failed" });
    } finally {
      setActionLoading(null);
    }
  }

  const [resolveTracking, setResolveTracking] = useState("");
  const [resolveNote, setResolveNote] = useState("");
  const [resolving, setResolving] = useState(false);

  const [closeTracking, setCloseTracking] = useState("");
  const [closeReason, setCloseReason] = useState("DUPLICATE");
  const [closeNote, setCloseNote] = useState("");
  const [closing, setClosing] = useState(false);

  async function handleAdminClose() {
    const tn = closeTracking.trim().toUpperCase();
    if (!tn || !closeNote.trim()) return;
    setClosing(true);
    try {
      const resp = await fetch(`/api/admin/complaints/${encodeURIComponent(tn)}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: closeReason, note: closeNote.trim() }),
      });
      const json = await resp.json() as { success?: boolean; message?: string };
      if (!resp.ok || !json.success) {
        setActionNotice({ kind: "error", message: json.message || "Failed to close complaint" });
      } else {
        setActionNotice({ kind: "ok", message: `Complaint ${tn} closed (${closeReason}).` });
        setCloseTracking("");
        setCloseNote("");
        setCloseReason("DUPLICATE");
        await refresh();
      }
    } catch {
      setActionNotice({ kind: "error", message: "Network error closing complaint" });
    } finally {
      setClosing(false);
    }
  }

  async function handleAdminResolve() {
    const tn = resolveTracking.trim().toUpperCase();
    if (!tn || !resolveNote.trim()) return;
    setResolving(true);
    try {
      const resp = await fetch(`/api/admin/complaints/${encodeURIComponent(tn)}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: resolveNote.trim() }),
      });
      const json = await resp.json() as { success?: boolean; message?: string };
      if (!resp.ok || !json.success) {
        setActionNotice({ kind: "error", message: json.message || "Failed to resolve complaint" });
      } else {
        setActionNotice({ kind: "ok", message: `Complaint ${tn} resolved successfully.` });
        setResolveTracking("");
        setResolveNote("");
        await refresh();
      }
    } catch {
      setActionNotice({ kind: "error", message: "Network error resolving complaint" });
    } finally {
      setResolving(false);
    }
  }

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
            <div className="mt-1 text-sm text-slate-600">Live queue and circuit status.</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void refresh()} className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">{loading ? "Refreshing..." : "Refresh"}</button>
            <button type="button" onClick={() => void syncAllComplaints()} disabled={actionLoading === "sync"} className="rounded-2xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-60">{actionLoading === "sync" ? "Syncing..." : "Sync All"}</button>
            <button type="button" onClick={() => void exportComplaintsCsv()} disabled={actionLoading === "export"} className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60">{actionLoading === "export" ? "Exporting..." : "Export CSV"}</button>
            <button type="button" onClick={() => void loadAlerts()} disabled={actionLoading === "alerts"} className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-60">{actionLoading === "alerts" ? "Loading..." : "Alerts"}</button>
            <button type="button" onClick={() => void loadAuditLog()} disabled={actionLoading === "audit"} className="rounded-2xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-medium text-violet-700 hover:bg-violet-100 disabled:opacity-60">{actionLoading === "audit" ? "Loading..." : "Audit Log"}</button>
            <button type="button" onClick={() => void backupComplaints()} disabled={actionLoading === "backup"} className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-60">{actionLoading === "backup" ? "Backing up..." : "Backup"}</button>
          </div>
        </div>
        {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
        {actionNotice ? (
          <div className={`mt-4 rounded-xl px-3 py-2 text-sm ${actionNotice.kind === "ok" ? "border border-emerald-200 bg-emerald-50 text-emerald-700" : "border border-red-200 bg-red-50 text-red-700"}`}>
            {actionNotice.message}
          </div>
        ) : null}
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
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Mark Complaint Resolved</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              type="text"
              placeholder="Tracking number"
              value={resolveTracking}
              onChange={(e) => setResolveTracking(e.target.value.toUpperCase())}
              className="min-w-0 flex-1 rounded-lg border border-emerald-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 placeholder-slate-400 focus:border-emerald-500 focus:ring-emerald-500"
            />
            <input
              type="text"
              placeholder="Resolution note (required)"
              value={resolveNote}
              onChange={(e) => setResolveNote(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-emerald-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 placeholder-slate-400 focus:border-emerald-500 focus:ring-emerald-500"
            />
            <button
              type="button"
              onClick={() => void handleAdminResolve()}
              disabled={resolving || !resolveTracking.trim() || !resolveNote.trim()}
              className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {resolving ? "Resolving..." : "Mark Resolved"}
            </button>
          </div>
        </div>
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-red-700">Close Complaint Without Resolution</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              type="text"
              placeholder="Tracking number"
              value={closeTracking}
              onChange={(e) => setCloseTracking(e.target.value.toUpperCase())}
              className="min-w-0 flex-1 rounded-lg border border-red-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 placeholder-slate-400 focus:border-red-500 focus:ring-red-500"
            />
            <select
              value={closeReason}
              onChange={(e) => setCloseReason(e.target.value)}
              className="rounded-lg border border-red-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:border-red-500 focus:ring-red-500"
            >
              <option value="DUPLICATE">Duplicate</option>
              <option value="INVALID">Invalid</option>
              <option value="USER_REQUESTED">User Requested</option>
              <option value="STALE">Stale</option>
              <option value="OTHER">Other</option>
            </select>
            <input
              type="text"
              placeholder="Close note (required)"
              value={closeNote}
              onChange={(e) => setCloseNote(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-red-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 placeholder-slate-400 focus:border-red-500 focus:ring-red-500"
            />
            <button
              type="button"
              onClick={() => void handleAdminClose()}
              disabled={closing || !closeTracking.trim() || !closeNote.trim()}
              className="rounded-lg bg-red-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {closing ? "Closing..." : "Close Complaint"}
            </button>
          </div>
        </div>
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
          Circuit: <span className={monitor?.circuit?.open ? "font-semibold text-red-700" : "font-semibold text-emerald-700"}>{monitor?.circuit?.open ? "OPEN" : "CLOSED"}</span>
          {monitor?.circuit?.nextRetryAt ? (
            <span> · Next retry at {new Date(monitor.circuit.nextRetryAt).toLocaleString("en-GB")}</span>
          ) : null}
        </div>

        {alerts.length > 0 ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">Alerts</div>
            <div className="mt-2 max-h-40 overflow-auto text-xs text-amber-900">
              {alerts.slice(0, 50).map((row, idx) => (
                <div key={`${row.trackingId}-${idx}`} className="py-1">
                  {row.trackingId} · {String(row.state ?? "-")} · {String(row.dueDate ?? "-")} · {String(row.message ?? "-")}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {auditLogs.length > 0 ? (
          <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-violet-700">Audit Log</div>
            <div className="mt-2 max-h-40 overflow-auto text-xs text-violet-900">
              {auditLogs.slice(0, 50).map((row) => (
                <div key={row.id} className="py-1">
                  {new Date(row.createdAt).toLocaleString("en-GB")} · {row.action} · {row.trackingId ?? "-"} · {row.complaintId ?? "-"}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b px-6 py-4">
          <div className="text-lg font-semibold text-slate-900">Retry Pending Queue</div>
          <div className="mt-1 text-sm text-slate-600">Rows waiting for next complaint retry.</div>
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
