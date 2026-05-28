import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { BodyText, PageShell, PageTitle, TableWrap } from "../../components/ui/PageSystem";
import { MetricCard, StatusPill } from "../../components/admin/AdminWidgets";

type NavKey =
  | "dashboard"
  | "users"
  | "plans"
  | "revenue"
  | "usage"
  | "jobs"
  | "shipments"
  | "complaints"
  | "payments"
  | "invoices"
  | "storage"
  | "audit"
  | "health"
  | "settings";

type AnyObject = Record<string, any>;

const NAV_ITEMS: Array<{ key: NavKey; label: string }> = [
  { key: "dashboard", label: "Dashboard" },
  { key: "users", label: "Users" },
  { key: "plans", label: "Plans & Pricing" },
  { key: "revenue", label: "Revenue" },
  { key: "usage", label: "Usage" },
  { key: "jobs", label: "Jobs" },
  { key: "shipments", label: "Shipments" },
  { key: "complaints", label: "Complaints" },
  { key: "payments", label: "Payments" },
  { key: "invoices", label: "Invoices" },
  { key: "storage", label: "Storage" },
  { key: "audit", label: "Audit" },
  { key: "health", label: "Health" },
  { key: "settings", label: "Settings" },
];

const money = new Intl.NumberFormat("en-PK", {
  style: "currency",
  currency: "PKR",
  maximumFractionDigits: 0,
});

function centsToPkr(value?: number) {
  return money.format((value ?? 0) / 100);
}

function DataTable(props: { headers: string[]; rows: Array<Array<string | number | null>> }) {
  return (
    <TableWrap>
      <table>
        <thead>
          <tr>
            {props.headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {props.rows.length === 0 ? (
            <tr>
              <td colSpan={props.headers.length} className="px-4 py-5 text-center text-sm text-slate-500">
                No data available.
              </td>
            </tr>
          ) : (
            props.rows.map((row, index) => (
              <tr key={index} className="border-t border-slate-100">
                {row.map((cell, cellIdx) => (
                  <td key={`${index}-${cellIdx}`} className="px-4 py-3 text-sm text-slate-700">
                    {cell ?? "-"}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </TableWrap>
  );
}

export default function AdminCommandCenter() {
  const [active, setActive] = useState<NavKey>("dashboard");
  const [summary, setSummary] = useState<AnyObject | null>(null);
  const [health, setHealth] = useState<AnyObject | null>(null);
  const [users, setUsers] = useState<AnyObject | null>(null);
  const [revenue, setRevenue] = useState<AnyObject | null>(null);
  const [usage, setUsage] = useState<AnyObject | null>(null);
  const [jobs, setJobs] = useState<AnyObject | null>(null);
  const [storage, setStorage] = useState<AnyObject | null>(null);
  const [audit, setAudit] = useState<AnyObject | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadDashboard() {
    const [summaryRes, healthRes] = await Promise.all([
      api<AnyObject>("/api/admin/dashboard/summary"),
      api<AnyObject>("/api/admin/dashboard/health"),
    ]);
    setSummary(summaryRes);
    setHealth(healthRes);
  }

  useEffect(() => {
    setLoading(true);
    setError(null);
    loadDashboard()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load dashboard"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadSection() {
      if (active === "dashboard" || active === "plans" || active === "shipments" || active === "complaints" || active === "payments" || active === "invoices" || active === "settings") {
        return;
      }
      setLoading(true);
      setError(null);
      try {
        if (active === "users" && !users) {
          const data = await api<AnyObject>("/api/admin/dashboard/users");
          if (!cancelled) setUsers(data);
        }
        if (active === "revenue" && !revenue) {
          const data = await api<AnyObject>("/api/admin/dashboard/revenue");
          if (!cancelled) setRevenue(data);
        }
        if (active === "usage" && !usage) {
          const data = await api<AnyObject>("/api/admin/dashboard/usage");
          if (!cancelled) setUsage(data);
        }
        if (active === "jobs" && !jobs) {
          const data = await api<AnyObject>("/api/admin/dashboard/jobs?status=FAILED&limit=20");
          if (!cancelled) setJobs(data);
        }
        if (active === "storage" && !storage) {
          const data = await api<AnyObject>("/api/admin/storage?limit=20");
          if (!cancelled) setStorage(data);
        }
        if (active === "audit" && !audit) {
          const data = await api<AnyObject>("/api/admin/audit?limit=50");
          if (!cancelled) setAudit(data);
        }
        if (active === "health") {
          const data = await api<AnyObject>("/api/admin/dashboard/health");
          if (!cancelled) setHealth(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load admin section");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadSection();
    return () => {
      cancelled = true;
    };
  }, [active, users, revenue, usage, jobs, storage, audit]);

  const summaryCards = useMemo(() => {
    if (!summary) return [];
    return [
      { label: "Users", value: summary.users?.totalUsers ?? 0, hint: `${summary.users?.activeUsers ?? 0} active` },
      { label: "Labels Today", value: summary.labels?.labelsGeneratedToday ?? 0, hint: `${summary.labels?.labelsGeneratedThisMonth ?? 0} this month` },
      { label: "Revenue (Month)", value: centsToPkr(summary.revenue?.monthCents), hint: `${centsToPkr(summary.revenue?.todayCents)} today` },
      { label: "Units (Month)", value: summary.usage?.unitsConsumedThisMonth ?? 0, hint: `${summary.usage?.unitsConsumedToday ?? 0} today` },
      { label: "Queue Failed", value: summary.jobs?.jobsFailed ?? 0, hint: `${summary.jobs?.jobsWaiting ?? 0} waiting`, tone: (summary.jobs?.jobsFailed ?? 0) > 0 ? "warn" : "good" },
      { label: "Complaints", value: summary.complaints?.complaintFiledCount ?? 0, hint: `${summary.complaints?.complaintPendingCount ?? 0} pending` },
    ];
  }, [summary]);

  function renderDashboard() {
    return (
      <div className="space-y-4">
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {summaryCards.map((card) => (
            <MetricCard key={card.label} label={card.label} value={card.value} hint={card.hint} tone={card.tone as any} />
          ))}
        </section>
        <section className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-2xl border border-[color:var(--line)] bg-white p-4">
            <h3 className="text-base font-bold">Platform Health</h3>
            <div className="mt-3 space-y-2 text-sm">
              {[
                ["API", health?.api?.status],
                ["Database", health?.db?.status],
                ["Redis", health?.redis?.status],
                ["Worker", health?.worker?.status],
                ["Queue", health?.queue?.status],
              ].map(([label, status]) => (
                <div key={String(label)} className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2">
                  <span>{label}</span>
                  <StatusPill status={String(status ?? "unknown")} />
                </div>
              ))}
            </div>
          </article>
          <article className="rounded-2xl border border-[color:var(--line)] bg-white p-4">
            <h3 className="text-base font-bold">Execution Snapshot</h3>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <MetricCard label="Jobs Completed" value={summary?.jobs?.jobsCompleted ?? 0} />
              <MetricCard label="Jobs Processing" value={summary?.jobs?.jobsProcessing ?? 0} />
              <MetricCard label="Money Orders" value={summary?.moneyOrders?.moneyOrderGeneratedCount ?? 0} />
              <MetricCard label="Bulk Tracking" value={summary?.bulkTracking?.jobsCompleted ?? 0} hint={`${summary?.bulkTracking?.jobsProcessing ?? 0} in progress`} />
            </div>
          </article>
        </section>
      </div>
    );
  }

  function renderSectionBody() {
    if (active === "dashboard") return renderDashboard();
    if (active === "users") {
      return (
        <div className="space-y-4">
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Total" value={users?.summary?.totalUsers ?? 0} />
            <MetricCard label="Paid" value={users?.summary?.paidUsers ?? 0} />
            <MetricCard label="Free" value={users?.summary?.freeUsers ?? 0} />
            <MetricCard label="Suspended" value={users?.summary?.suspendedUsers ?? 0} tone={(users?.summary?.suspendedUsers ?? 0) > 0 ? "warn" : "good"} />
          </section>
          <DataTable
            headers={["Top Users by Labels", "Email", "Labels"]}
            rows={(users?.topUsersByLabels ?? []).map((row: AnyObject) => [row.companyName ?? "-", row.email, row.labelsGenerated])}
          />
        </div>
      );
    }
    if (active === "revenue") {
      return (
        <div className="space-y-4">
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Total Revenue" value={centsToPkr(revenue?.totalCents)} />
            <MetricCard label="Today" value={centsToPkr(revenue?.todayCents)} />
            <MetricCard label="This Month" value={centsToPkr(revenue?.monthCents)} />
            <MetricCard label="Pending" value={centsToPkr(revenue?.pendingCents)} tone={(revenue?.pendingCents ?? 0) > 0 ? "warn" : "good"} />
          </section>
          <DataTable
            headers={["Company", "Email", "Amount"]}
            rows={(revenue?.topUsers ?? []).map((row: AnyObject) => [row.companyName ?? "-", row.email, centsToPkr(row.amountCents)])}
          />
        </div>
      );
    }
    if (active === "usage") {
      return (
        <div className="space-y-4">
          <section className="grid gap-3 sm:grid-cols-3">
            <MetricCard label="Total Units" value={usage?.units?.totalUnits ?? 0} />
            <MetricCard label="Today Units" value={usage?.units?.todayUnits ?? 0} />
            <MetricCard label="Month Units" value={usage?.units?.monthUnits ?? 0} />
          </section>
          <DataTable
            headers={["Company", "Email", "Units"]}
            rows={(usage?.topUsersByUnits ?? []).map((row: AnyObject) => [row.companyName ?? "-", row.email, row.totalUnits])}
          />
        </div>
      );
    }
    if (active === "jobs") {
      return (
        <div className="space-y-4">
          <section className="grid gap-3 sm:grid-cols-5">
            <MetricCard label="Waiting" value={jobs?.queue?.waiting ?? 0} />
            <MetricCard label="Active" value={jobs?.queue?.active ?? 0} />
            <MetricCard label="Completed" value={jobs?.queue?.completed ?? 0} />
            <MetricCard label="Failed" value={jobs?.queue?.failed ?? 0} tone={(jobs?.queue?.failed ?? 0) > 0 ? "warn" : "good"} />
            <MetricCard label="Delayed" value={jobs?.queue?.delayed ?? 0} />
          </section>
          <DataTable
            headers={["Job ID", "User", "Records", "Error"]}
            rows={(jobs?.list?.jobs ?? []).map((row: AnyObject) => [row.id, row.userId, row.recordCount ?? 0, row.error ?? "-"])}
          />
        </div>
      );
    }
    if (active === "storage") {
      return (
        <div className="space-y-4">
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Labels" value={storage?.totals?.labels ?? 0} />
            <MetricCard label="Money Orders" value={storage?.totals?.moneyOrders ?? 0} />
            <MetricCard label="Tracking Master" value={storage?.totals?.trackingMaster ?? 0} />
            <MetricCard label="Tracking Result" value={storage?.totals?.trackingResult ?? 0} />
          </section>
          <DataTable
            headers={["Provider", "Dual Write", "Dual Read", "R2 Uploads"]}
            rows={[[storage?.provider ?? "local", String(storage?.dualWriteEnabled ?? false), String(storage?.dualReadEnabled ?? false), String(storage?.r2UploadsEnabled ?? false)]]}
          />
        </div>
      );
    }
    if (active === "audit") {
      return (
        <DataTable
          headers={["Source", "Action", "Actor", "User", "Created"]}
          rows={(audit?.events ?? []).map((row: AnyObject) => [row.source, row.action, row.actor, row.userId ?? "-", row.createdAt])}
        />
      );
    }
    if (active === "health") {
      return (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["API", health?.api?.status, health?.api?.message],
            ["Database", health?.db?.status, health?.db?.message],
            ["Redis", health?.redis?.status, health?.redis?.message],
            ["Worker", health?.worker?.status, health?.worker?.message],
            ["Queue", health?.queue?.status, health?.queue?.message],
          ].map((entry) => (
            <article key={String(entry[0])} className="rounded-2xl border border-[color:var(--line)] bg-white p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">{entry[0]}</h3>
                <StatusPill status={String(entry[1] ?? "unknown")} />
              </div>
              <p className="mt-2 text-xs text-slate-600">{entry[2] ?? "-"}</p>
            </article>
          ))}
        </div>
      );
    }

    return (
      <article className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
        <h3 className="text-lg font-bold">{NAV_ITEMS.find((item) => item.key === active)?.label}</h3>
        <p className="mt-2 text-sm text-slate-600">
          This section is scaffolded as part of the new command center and can now be implemented iteratively without disturbing protected operational logic.
        </p>
      </article>
    );
  }

  return (
    <PageShell className="space-y-4">
      <div className="rounded-[24px] border border-[color:var(--line)] bg-white p-4 shadow-card sm:p-5">
        <PageTitle>Admin Command Center</PageTitle>
        <BodyText className="mt-1">Single-pane operational control for revenue, jobs, storage, audits, and service health.</BodyText>
      </div>

      <div className="grid gap-4 lg:grid-cols-[230px_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-[color:var(--line)] bg-white p-3">
          <div className="grid gap-1">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setActive(item.key)}
                className={`rounded-xl px-3 py-2 text-left text-sm font-semibold transition ${
                  active === item.key
                    ? "bg-[color:var(--mint-soft)] text-[color:var(--text-strong)]"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </aside>

        <main className="rounded-2xl border border-[color:var(--line)] bg-white p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold tracking-[-0.02em]">{NAV_ITEMS.find((item) => item.key === active)?.label}</h2>
            {loading ? <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Loading</span> : null}
          </div>
          {error ? <p className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
          {renderSectionBody()}
        </main>
      </div>
    </PageShell>
  );
}
