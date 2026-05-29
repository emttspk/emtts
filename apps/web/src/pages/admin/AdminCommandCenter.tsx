import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { BodyText, PageShell, PageTitle, TableWrap } from "../../components/ui/PageSystem";
import { MetricCard, StatusPill } from "../../components/admin/AdminWidgets";
import AdminLegacy from "../Admin";
import { TEMPLATE_DESIGNER_ENABLED } from "../../lib/featureFlags";

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
  | "settings"
  | "allow-files";

type AnyObject = Record<string, any>;

type SortOrder = "asc" | "desc";

type FilterState = {
  search: string;
  status: string;
  from: string;
  to: string;
  page: number;
  pageSize: number;
  sortBy: string;
  sortOrder: SortOrder;
  quickDate: "today" | "week" | "month" | "all" | "custom";
};

const DEFAULT_FILTER: FilterState = {
  search: "",
  status: "",
  from: "",
  to: "",
  page: 1,
  pageSize: 20,
  sortBy: "createdAt",
  sortOrder: "desc",
  quickDate: "all",
};

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
  { key: "allow-files", label: "Allow/Test File Names" },
];

const money = new Intl.NumberFormat("en-PK", {
  style: "currency",
  currency: "PKR",
  maximumFractionDigits: 0,
});

function centsToPkr(value?: number) {
  return money.format((value ?? 0) / 100);
}

function DataTable(props: { headers: Array<string | React.ReactNode>; rows: Array<Array<string | number | null | React.ReactNode>>; compact?: boolean }) {
  const bodyCellClass = props.compact
    ? "max-w-[320px] truncate px-3 py-2 text-xs text-slate-700"
    : "max-w-[320px] truncate px-4 py-3 text-sm text-slate-700";

  return (
    <TableWrap>
      <table>
        <thead>
          <tr>
            {props.headers.map((header, index) => (
              <th key={index}>{header}</th>
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
                  <td key={`${index}-${cellIdx}`} className={bodyCellClass}>
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

function dateForInput(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isWithinDate(value: string | null | undefined, from: string, to: string) {
  if (!value) return false;
  const millis = new Date(value).getTime();
  if (Number.isNaN(millis)) return false;
  const fromMillis = from ? new Date(`${from}T00:00:00.000Z`).getTime() : null;
  const toMillis = to ? new Date(`${to}T23:59:59.999Z`).getTime() : null;
  if (fromMillis !== null && millis < fromMillis) return false;
  if (toMillis !== null && millis > toMillis) return false;
  return true;
}

function includesSearch(value: unknown, search: string) {
  if (!search.trim()) return true;
  return String(value ?? "").toLowerCase().includes(search.trim().toLowerCase());
}

function quickRange(key: "today" | "week" | "month" | "all") {
  const now = new Date();
  const to = dateForInput(now.toISOString());
  if (key === "all") return { from: "", to: "" };
  if (key === "today") return { from: to, to };
  if (key === "week") {
    const fromDate = new Date(now);
    fromDate.setUTCDate(fromDate.getUTCDate() - 6);
    return { from: dateForInput(fromDate.toISOString()), to };
  }
  const fromDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return { from: dateForInput(fromDate.toISOString()), to };
}

function sectionUsesRowFilters(section: NavKey) {
  return !["dashboard", "health", "settings", "allow-files", "revenue"].includes(section);
}

function sectionUsesDateFilters(section: NavKey) {
  return ["users", "usage", "jobs", "shipments", "complaints", "payments", "invoices", "storage", "audit"].includes(section);
}

function legacyEmbeddedSectionForNav(section: NavKey): "plans" | "customers" | "usage" | "shipments" | "payments" | "invoices" | "billing" | null {
  if (section === "plans") return "plans";
  if (section === "usage") return "usage";
  if (section === "shipments") return "shipments";
  if (section === "payments") return "payments";
  if (section === "invoices") return "invoices";
  return null;
}

function sortOptionsForSection(section: NavKey): Array<{ value: string; label: string }> {
  if (section === "users") {
    return [
      { value: "createdAt", label: "Joined" },
      { value: "email", label: "Email" },
      { value: "companyName", label: "Company" },
      { value: "role", label: "Role" },
      { value: "suspended", label: "Suspended" },
    ];
  }
  if (section === "jobs") {
    return [
      { value: "updatedAt", label: "Updated" },
      { value: "createdAt", label: "Created" },
      { value: "status", label: "Status" },
      { value: "recordCount", label: "Records" },
    ];
  }
  if (section === "usage") {
    return [
      { value: "labelsGenerated", label: "Labels" },
      { value: "trackingGenerated", label: "Tracking" },
      { value: "labelsQueued", label: "Labels Queued" },
      { value: "trackingQueued", label: "Tracking Queued" },
      { value: "createdAt", label: "Created" },
      { value: "email", label: "User" },
    ];
  }
  if (section === "shipments") {
    return [
      { value: "updatedAt", label: "Updated" },
      { value: "createdAt", label: "Created" },
      { value: "status", label: "Status" },
      { value: "trackingNumber", label: "Tracking" },
    ];
  }
  if (section === "audit") {
    return [
      { value: "createdAt", label: "Created" },
      { value: "source", label: "Source" },
      { value: "action", label: "Action" },
    ];
  }
  if (section === "payments") {
    return [
      { value: "createdAt", label: "Created" },
      { value: "updatedAt", label: "Updated" },
      { value: "amountCents", label: "Amount" },
      { value: "status", label: "Status" },
      { value: "transactionId", label: "Transaction" },
    ];
  }
  if (section === "invoices") {
    return [
      { value: "createdAt", label: "Created" },
      { value: "issuedAt", label: "Issued" },
      { value: "amountCents", label: "Amount" },
      { value: "status", label: "Status" },
    ];
  }
  return [
    { value: "createdAt", label: "Created" },
    { value: "updatedAt", label: "Updated" },
  ];
}

function buildQuery(filters: FilterState) {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.status) params.set("status", filters.status);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  params.set("page", String(filters.page));
  params.set("pageSize", String(filters.pageSize));
  if (filters.sortBy) params.set("sortBy", filters.sortBy);
  params.set("sortOrder", filters.sortOrder);
  return params.toString();
}

function quickDateHelpText(key: FilterState["quickDate"]) {
  if (key === "today") return "Today = records created today";
  if (key === "week") return "Last 7 Days = records created in last 7 days";
  if (key === "month") return "This Month = records created in this calendar month";
  if (key === "all") return "All = no date filter";
  return "Custom = date range selected manually";
}

function SortHeader(props: {
  label: string;
  sortKey: string;
  activeSortBy: string;
  activeSortOrder: SortOrder;
  onToggle: (nextSortBy: string, nextSortOrder: SortOrder) => void;
}) {
  const isActive = props.activeSortBy === props.sortKey;
  const arrow = isActive ? (props.activeSortOrder === "asc" ? "↑" : "↓") : "↕";
  return (
    <button
      type="button"
      className={`inline-flex items-center gap-1 text-left ${isActive ? "text-slate-900" : "text-slate-500"}`}
      onClick={() => {
        const nextOrder: SortOrder = isActive && props.activeSortOrder === "asc" ? "desc" : "asc";
        props.onToggle(props.sortKey, nextOrder);
      }}
    >
      <span>{props.label}</span>
      <span className="text-[11px]">{arrow}</span>
    </button>
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
  const [saving, setSaving] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [currentAdminId, setCurrentAdminId] = useState<string>("");
  const [complaintDetail, setComplaintDetail] = useState<AnyObject | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<AnyObject | null>(null);
  const [editingPaymentOption, setEditingPaymentOption] = useState<"jazzcash" | "easypaisa" | "bank" | null>(null);

  const [filters, setFilters] = useState<Record<NavKey, FilterState>>(() => {
    const map = {} as Record<NavKey, FilterState>;
    for (const item of NAV_ITEMS) {
      map[item.key] = { ...DEFAULT_FILTER };
    }
    return map;
  });

  const activeFilters = filters[active];

  function updateActiveFilters(patch: Partial<FilterState>) {
    setFilters((prev) => ({
      ...prev,
      [active]: {
        ...prev[active],
        ...patch,
      },
    }));
  }

  function resetFilters(target: NavKey = active) {
    setFilters((prev) => ({
      ...prev,
      [target]: { ...DEFAULT_FILTER },
    }));
  }

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
    Promise.all([
      loadDashboard(),
      api<AnyObject>("/api/me").then((me) => setCurrentAdminId(String(me?.id ?? ""))).catch(() => setCurrentAdminId("")),
    ])
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load dashboard"))
      .finally(() => setLoading(false));
  }, []);

  async function loadSection(target: NavKey = active, force = false) {
    const targetFilters = filters[target] ?? DEFAULT_FILTER;
    const query = buildQuery(targetFilters);
    const q = query ? `?${query}` : "";
    setLoading(true);
    setError(null);
    try {
      if (target === "dashboard") {
        await loadDashboard();
      }
      if (target === "users" && (force || !users)) {
        const [dashboardUsers, listUsers] = await Promise.all([
          api<AnyObject>("/api/admin/dashboard/users"),
          api<AnyObject>(`/api/admin/users${q}`),
        ]);
        setUsers({
          ...dashboardUsers,
          list: listUsers.users ?? [],
          listPage: listUsers.page ?? 1,
          listPageSize: listUsers.pageSize ?? targetFilters.pageSize,
          listTotal: listUsers.total ?? (listUsers.users ?? []).length,
        });
      }
      if (target === "plans" && (force || !users?.plans)) {
        const data = await api<AnyObject>("/api/admin/plans");
        setUsers((prev) => ({ ...(prev ?? {}), plans: data.plans ?? [] }));
      }
      if (target === "revenue" && (force || !revenue)) {
        const data = await api<AnyObject>("/api/admin/dashboard/revenue");
        setRevenue(data);
      }
      if (target === "usage" && (force || !usage)) {
        const data = await api<AnyObject>(`/api/admin/usage${q}`);
        setUsage(data);
      }
      if (target === "jobs" && (force || !jobs)) {
        const [data, queueData] = await Promise.all([
          api<AnyObject>(`/api/admin/jobs${q}`),
          api<AnyObject>("/api/admin/dashboard/jobs?status=FAILED&limit=20"),
        ]);
        setJobs({ ...data, queueOverview: queueData.queue ?? null, queueFailedReasons: queueData.failedReasons ?? [] });
      }
      if (target === "shipments" && (force || !jobs?.shipments)) {
        const data = await api<AnyObject>(`/api/admin/shipments${q}`);
        setJobs((prev) => ({ ...(prev ?? {}), shipments: data.shipments ?? [], shipmentTotal: data.total ?? 0 }));
      }
      if (target === "complaints" && (force || !jobs?.complaints)) {
        const [complaintsData, queueData] = await Promise.all([
          api<AnyObject>("/api/admin/complaints"),
          api<AnyObject>("/api/admin/complaints/queue"),
        ]);
        setJobs((prev) => ({ ...(prev ?? {}), complaints: complaintsData.complaints ?? [], complaintAlerts: complaintsData.alerts ?? [], complaintQueue: queueData.queue ?? [] }));
      }
      if (target === "payments" && (force || !revenue?.payments)) {
        const data = await api<AnyObject>(`/api/admin/manual-payments${q}`);
        setRevenue((prev) => ({ ...(prev ?? {}), payments: data.requests ?? [], paymentsTotal: data.total ?? (data.requests ?? []).length }));
      }
      if (target === "invoices" && (force || !revenue?.invoices)) {
        const data = await api<AnyObject>(`/api/admin/invoices${q}`);
        setRevenue((prev) => ({ ...(prev ?? {}), invoices: data.invoices ?? [], invoicesTotal: data.total ?? (data.invoices ?? []).length }));
      }
      if (target === "storage" && (force || !storage)) {
        const data = await api<AnyObject>(`/api/admin/storage${q}`);
        setStorage(data);
      }
      if (target === "audit" && (force || !audit)) {
        const data = await api<AnyObject>(`/api/admin/audit${q}`);
        setAudit(data);
      }
      if (target === "health") {
        const data = await api<AnyObject>("/api/admin/dashboard/health");
        setHealth(data);
      }
      if ((target === "settings" || target === "allow-files") && (force || !health?.settings)) {
        const data = await api<AnyObject>("/api/admin/billing-settings");
        setHealth((prev) => ({ ...(prev ?? {}), settings: data.settings ?? null }));
        setSettingsDraft(data.settings ?? null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load admin section");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSection(active);
    if (active !== "users") {
      setSelectedUserIds([]);
    }
  }, [active]);

  useEffect(() => {
    if (!sectionUsesRowFilters(active)) return;
    const timer = window.setTimeout(() => {
      void loadSection(active, true);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [active, activeFilters.search, activeFilters.status, activeFilters.from, activeFilters.to, activeFilters.page, activeFilters.pageSize, activeFilters.sortBy, activeFilters.sortOrder]);

  async function runSafeAction(action: () => Promise<unknown>) {
    setSaving(true);
    setError(null);
    try {
      await action();
      await loadSection(active, true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed action");
    } finally {
      setSaving(false);
    }
  }

  function applyQuickDate(range: "today" | "week" | "month" | "all") {
    updateActiveFilters({ ...quickRange(range), page: 1, quickDate: range });
  }

  function applySort(sortBy: string, sortOrder: SortOrder) {
    updateActiveFilters({ sortBy, sortOrder, page: 1 });
  }

  async function openComplaintDetail(row: AnyObject) {
    const trackingId = String(row?.trackingId ?? "").trim();
    if (!trackingId) return;

    const queueRows: AnyObject[] = jobs?.complaintQueue ?? [];
    const queueEntry = queueRows.find((entry) => String(entry?.trackingId ?? "").trim() === trackingId) ?? null;
    let latestTrackingState: string | null = null;

    try {
      const shipment = await api<AnyObject>(`/api/admin/shipments?search=${encodeURIComponent(trackingId)}&page=1&pageSize=1`);
      latestTrackingState = shipment?.shipments?.[0]?.status ?? null;
    } catch {
      latestTrackingState = null;
    }

    const historyLines = String(row?.complaintText ?? "")
      .split(/\r?\n/)
      .filter((line) => /COMPLAINT|DUE_DATE|COMPLAINT_STATE|Response|User complaint/i.test(line))
      .slice(0, 12);

    setComplaintDetail({
      trackingId,
      complaintId: row?.complaintId ?? "-",
      dueDate: row?.dueDate ?? "-",
      complaintStatus: row?.state ?? row?.complaintStatus ?? "-",
      addressee: row?.userEmail ?? "-",
      cityOrOffice: queueEntry?.postOffice ?? queueEntry?.office ?? "-",
      latestTrackingState: latestTrackingState ?? "-",
      queueStatus: queueEntry?.complaintStatus ?? "-",
      queueUpdatedAt: queueEntry?.updatedAt ?? null,
      historyLines,
    });
  }

  async function saveBillingDraft(nextDraft: AnyObject) {
    await api("/api/admin/billing-settings", {
      method: "PUT",
      body: JSON.stringify({
        jazzcashNumber: String(nextDraft?.jazzcashNumber ?? "").trim(),
        jazzcashTitle: String(nextDraft?.jazzcashTitle ?? "").trim(),
        easypaisaNumber: String(nextDraft?.easypaisaNumber ?? "").trim(),
        easypaisaTitle: String(nextDraft?.easypaisaTitle ?? "").trim(),
        bankName: String(nextDraft?.bankName ?? "").trim(),
        bankTitle: String(nextDraft?.bankTitle ?? "").trim(),
        bankAccountNumber: String(nextDraft?.bankAccountNumber ?? "").trim(),
        bankIban: String(nextDraft?.bankIban ?? "").trim(),
        standardPrice: Number(nextDraft?.standardPrice ?? 1),
        businessPrice: Number(nextDraft?.businessPrice ?? 1),
        exemptFileNames: JSON.stringify(Array.isArray(nextDraft?.exemptFileNames) ? nextDraft.exemptFileNames : []),
      }),
    });
  }

  const summaryCards = useMemo(() => {
    if (!summary) return [];
    const queueFailed = summary.jobs?.jobsFailed ?? 0;
    const queueReason = String(health?.queue?.lastFailedReason ?? "").trim();
    const queueFailedAt = String(health?.queue?.lastFailedAt ?? "").trim();
    const queueHint = queueFailed > 0
      ? `${queueReason ? queueReason.slice(0, 42) : "failure detected"}${queueFailedAt ? ` @ ${queueFailedAt.slice(0, 16).replace("T", " ")}` : ""}`
      : `${summary.jobs?.jobsWaiting ?? 0} waiting`;

    return [
      { label: "Users", value: summary.users?.totalUsers ?? 0, hint: `${summary.users?.activeUsers ?? 0} active` },
      { label: "Labels Today", value: summary.labels?.labelsGeneratedToday ?? 0, hint: `${summary.labels?.labelsGeneratedThisMonth ?? 0} this month` },
      { label: "Revenue (Month)", value: centsToPkr(summary.revenue?.monthCents), hint: `${centsToPkr(summary.revenue?.todayCents)} today` },
      { label: "Units (Month)", value: summary.usage?.unitsConsumedThisMonth ?? 0, hint: `${summary.usage?.unitsConsumedToday ?? 0} today` },
      { label: "Queue Failed", value: queueFailed, hint: queueHint, tone: queueFailed > 0 ? "warn" : "good" },
      { label: "Complaints", value: summary.complaints?.complaintFiledCount ?? 0, hint: `${summary.complaints?.complaintPendingCount ?? 0} pending` },
    ];
  }, [summary, health?.queue?.lastFailedReason, health?.queue?.lastFailedAt]);

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
              <MetricCard label="Heap Used (MB)" value={Math.round(((health?.runtime?.heapUsed ?? 0) / (1024 * 1024)) * 10) / 10} />
              <MetricCard label="RSS (MB)" value={Math.round(((health?.runtime?.rss ?? 0) / (1024 * 1024)) * 10) / 10} hint={`uptime ${Math.round((health?.runtime?.uptimeSec ?? 0) / 60)}m`} />
            </div>
            {(health?.queue?.lastFailedJobId ?? "") ? (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <p className="font-semibold">Latest queue failure</p>
                <p className="mt-1">{String(health?.queue?.lastFailedReason ?? "Unknown").slice(0, 180)}</p>
                <button
                  type="button"
                  className="mt-2 rounded-lg border border-amber-300 px-2 py-1 font-semibold text-amber-900"
                  onClick={() => {
                    const failedJobId = String(health?.queue?.lastFailedJobId ?? "").trim();
                    if (!failedJobId) return;
                    void runSafeAction(async () => {
                      await api(`/api/admin/jobs/${encodeURIComponent(failedJobId)}/retry`, { method: "POST" });
                      await loadDashboard();
                    });
                  }}
                >
                  Retry latest failed job
                </button>
              </div>
            ) : null}
          </article>
        </section>
        {TEMPLATE_DESIGNER_ENABLED ? (
          <section className="rounded-2xl border border-[color:var(--line)] bg-white p-4">
            <h3 className="text-base font-bold">Money Order Designer</h3>
            <p className="mt-1 text-sm text-slate-600">Legacy admin MO template access is restored for admin operators.</p>
            <a href="/admin/template-designer" className="mt-3 inline-flex rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              Open Money Order Designer
            </a>
          </section>
        ) : null}
      </div>
    );
  }

  function renderSectionBody() {
    const embeddedLegacySection = legacyEmbeddedSectionForNav(active);
    if (embeddedLegacySection) {
      return (
        <div className="space-y-3">
          <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Legacy stable admin operations restored for this tab (full working controls preserved inside command center).
          </p>
          <AdminLegacy embeddedSection={embeddedLegacySection} />
        </div>
      );
    }

    if (active === "dashboard") return renderDashboard();
    if (active === "users") {
      const list: AnyObject[] = users?.list ?? [];
      const pageRows = list;
      const total = Number(users?.listTotal ?? pageRows.length);
      const pageSize = Number(users?.listPageSize ?? activeFilters.pageSize);
      const currentPage = Number(users?.listPage ?? activeFilters.page);
      const totalPages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
      const allSelectableIds = pageRows
        .filter((row) => String(row.id ?? "") !== currentAdminId)
        .map((row) => String(row.id ?? ""))
        .filter(Boolean);
      const selectedCount = selectedUserIds.length;
      const selectedSet = new Set(selectedUserIds);

      return (
        <div className="space-y-4">
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Total" value={users?.summary?.totalUsers ?? 0} />
            <MetricCard label="Paid" value={users?.summary?.paidUsers ?? 0} />
            <MetricCard label="Free" value={users?.summary?.freeUsers ?? 0} />
            <MetricCard label="Suspended" value={users?.summary?.suspendedUsers ?? 0} tone={(users?.summary?.suspendedUsers ?? 0) > 0 ? "warn" : "good"} />
          </section>

          <section className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
            <button
              type="button"
              className="rounded-lg border border-slate-300 bg-white px-2 py-1 font-semibold"
              onClick={() => {
                setSelectedUserIds((prev) => (prev.length === allSelectableIds.length ? [] : allSelectableIds));
              }}
            >
              {selectedCount === allSelectableIds.length && allSelectableIds.length > 0 ? "Clear selection" : "Select page"}
            </button>
            <span className="text-slate-600">Selected: {selectedCount}</span>
            <button
              type="button"
              className="rounded-lg border border-amber-300 bg-amber-100 px-2 py-1 font-semibold text-amber-900 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={selectedCount === 0}
              onClick={() => {
                if (selectedCount === 0) return;
                if (!window.confirm(`Suspend ${selectedCount} selected users?`)) return;
                void runSafeAction(async () => {
                  await api("/api/admin/users/bulk", {
                    method: "POST",
                    body: JSON.stringify({ action: "suspend", userIds: selectedUserIds }),
                  });
                  setSelectedUserIds([]);
                });
              }}
            >
              Bulk Suspend
            </button>
            <button
              type="button"
              className="rounded-lg border border-rose-300 bg-rose-100 px-2 py-1 font-semibold text-rose-900 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={selectedCount === 0}
              onClick={() => {
                if (selectedCount === 0) return;
                if (!window.confirm(`Hard delete ${selectedCount} selected users? This is irreversible and may fail for linked accounts.`)) return;
                void runSafeAction(async () => {
                  await api("/api/admin/users/bulk", {
                    method: "POST",
                    body: JSON.stringify({ action: "delete", userIds: selectedUserIds }),
                  });
                  setSelectedUserIds([]);
                });
              }}
            >
              Hard Delete (Guarded)
            </button>
          </section>

          <DataTable
            compact
            headers={[
              "Select",
              <SortHeader key="company" label="Company" sortKey="companyName" activeSortBy={activeFilters.sortBy} activeSortOrder={activeFilters.sortOrder} onToggle={applySort} />,
              <SortHeader key="email" label="Email" sortKey="email" activeSortBy={activeFilters.sortBy} activeSortOrder={activeFilters.sortOrder} onToggle={applySort} />,
              <SortHeader key="status" label="Status" sortKey="suspended" activeSortBy={activeFilters.sortBy} activeSortOrder={activeFilters.sortOrder} onToggle={applySort} />,
              <SortHeader key="joined" label="Joined" sortKey="createdAt" activeSortBy={activeFilters.sortBy} activeSortOrder={activeFilters.sortOrder} onToggle={applySort} />,
              "Edit",
              "Safe Action",
            ]}
            rows={pageRows.map((row: AnyObject) => [
              String(row.id ?? "") === currentAdminId ? (
                <span className="text-[11px] font-semibold text-slate-500">self</span>
              ) : (
                <input
                  type="checkbox"
                  checked={selectedSet.has(String(row.id ?? ""))}
                  onChange={(event) => {
                    const userId = String(row.id ?? "");
                    if (!userId) return;
                    setSelectedUserIds((prev) => {
                      if (event.target.checked) return [...new Set([...prev, userId])];
                      return prev.filter((id) => id !== userId);
                    });
                  }}
                />
              ),
              row.companyName ?? "-",
              row.email,
              row.suspended ? "SUSPENDED" : "ACTIVE",
              String(row.createdAt ?? "-").slice(0, 10),
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold"
                onClick={() => {
                  const next = window.prompt("Update company name", String(row.companyName ?? ""));
                  if (next === null) return;
                  void runSafeAction(async () => {
                    await api(`/api/admin/users/${encodeURIComponent(row.id)}`, {
                      method: "PATCH",
                      body: JSON.stringify({ companyName: next.trim() || null }),
                    });
                  });
                }}
              >
                Edit
              </button>,
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold"
                onClick={() => {
                  if (String(row.id ?? "") === currentAdminId && !row.suspended) return;
                  void runSafeAction(async () => {
                    await api(`/api/admin/users/${encodeURIComponent(row.id)}/${row.suspended ? "unsuspend" : "suspend"}`, { method: "POST" });
                  });
                }}
              >
                {row.suspended ? "Reactivate" : "Suspend"}
              </button>,
            ])}
          />
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600">
            <span>Page {currentPage} of {totalPages} | Total records: {total} | Page size: {pageSize}</span>
            <span>Showing {pageRows.length} record(s)</span>
          </div>
        </div>
      );
    }
    if (active === "plans") {
      const plans: AnyObject[] = users?.plans ?? [];
      const filtered = plans.filter((row) => {
        const text = `${row.name ?? ""} ${row.id ?? ""}`;
        const statusOk = !activeFilters.status || (activeFilters.status === "SUSPENDED" ? Boolean(row.isSuspended) : !Boolean(row.isSuspended));
        return includesSearch(text, activeFilters.search) && statusOk;
      });
      const start = (activeFilters.page - 1) * activeFilters.pageSize;
      const pageRows = filtered.slice(start, start + activeFilters.pageSize);
      return (
        <div className="space-y-4">
          <DataTable
            headers={["Plan", "Price", "Units", "Status", "Edit", "Safe Action"]}
            rows={pageRows.map((row: AnyObject) => [
              row.name,
              centsToPkr(row.discountPriceCents ?? row.priceCents),
              row.unitsIncluded ?? row.monthlyLabelLimit ?? 0,
              row.isSuspended ? "SUSPENDED" : "ACTIVE",
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold"
                onClick={() => {
                  const next = window.prompt("Update discount price cents", String(row.discountPriceCents ?? row.priceCents ?? 0));
                  if (next === null) return;
                  const value = Number(next);
                  if (!Number.isFinite(value) || value < 0) return;
                  void runSafeAction(async () => {
                    await api(`/api/admin/plans/${encodeURIComponent(row.id)}`, {
                      method: "PUT",
                      body: JSON.stringify({ discountPriceCents: Math.trunc(value) }),
                    });
                  });
                }}
              >
                Edit
              </button>,
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold"
                onClick={() => {
                  void runSafeAction(async () => {
                    await api(`/api/admin/plans/${encodeURIComponent(row.id)}/suspend`, {
                      method: "POST",
                      body: JSON.stringify({ isSuspended: !Boolean(row.isSuspended) }),
                    });
                  });
                }}
              >
                {row.isSuspended ? "Activate" : "Deactivate"}
              </button>,
            ])}
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
      const rows: AnyObject[] = usage?.usage ?? [];
      const pageRows = rows;
      const total = Number(usage?.total ?? pageRows.length);
      const pageSize = Number(usage?.pageSize ?? activeFilters.pageSize);
      const currentPage = Number(usage?.page ?? activeFilters.page);
      const totalPages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
      return (
        <div className="space-y-4">
          <section className="grid gap-3 sm:grid-cols-3">
            <MetricCard label="Total Units" value={usage?.units?.totalUnits ?? 0} />
            <MetricCard label="Today Units" value={usage?.units?.todayUnits ?? 0} />
            <MetricCard label="Month Units" value={usage?.units?.monthUnits ?? 0} />
          </section>
          <DataTable
            compact
            headers={[
              "Month",
              <SortHeader key="user" label="User" sortKey="email" activeSortBy={activeFilters.sortBy} activeSortOrder={activeFilters.sortOrder} onToggle={applySort} />,
              "Labels",
              "Tracking",
              "Safe Action",
            ]}
            rows={pageRows.map((row: AnyObject) => [
              row.month,
              row.user?.email ?? "-",
              (row.labelsGenerated ?? 0) + (row.labelsQueued ?? 0),
              (row.trackingGenerated ?? 0) + (row.trackingQueued ?? 0),
              "View/Export",
            ])}
          />
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600">
            <span>Page {currentPage} of {totalPages} | Total records: {total} | Page size: {pageSize}</span>
            <span>Showing {pageRows.length} record(s)</span>
          </div>
        </div>
      );
    }
    if (active === "jobs") {
      const rows: AnyObject[] = jobs?.jobs ?? [];
      const pageRows = rows;
      const total = Number(jobs?.total ?? pageRows.length);
      const pageSize = Number(jobs?.pageSize ?? activeFilters.pageSize);
      const currentPage = Number(jobs?.page ?? activeFilters.page);
      const totalPages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
      return (
        <div className="space-y-4">
          {(jobs?.queueOverview?.failed ?? 0) > 0 ? (
            <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <p className="font-semibold">Queue has failed jobs: {jobs?.queueOverview?.failed ?? 0}</p>
              <p className="mt-1">Latest: {String(jobs?.queueOverview?.latestFailedReason ?? "Unknown failure").slice(0, 180)}</p>
              <p className="mt-1">At: {String(jobs?.queueOverview?.latestFailedAt ?? "-").slice(0, 19).replace("T", " ")}</p>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-500"
              disabled
              title="Use label generation page to create jobs."
            >
              Create Job (disabled)
            </button>
            <span className="text-xs text-slate-500">Use label generation page to create jobs.</span>
          </div>
          <DataTable
            compact
            headers={[
              <SortHeader key="job" label="Job" sortKey="createdAt" activeSortBy={activeFilters.sortBy} activeSortOrder={activeFilters.sortOrder} onToggle={applySort} />,
              <SortHeader key="status" label="Status" sortKey="status" activeSortBy={activeFilters.sortBy} activeSortOrder={activeFilters.sortOrder} onToggle={applySort} />,
              "User",
              <SortHeader key="updated" label="Updated" sortKey="updatedAt" activeSortBy={activeFilters.sortBy} activeSortOrder={activeFilters.sortOrder} onToggle={applySort} />,
              "Edit",
              "Safe Actions",
            ]}
            rows={pageRows.map((row: AnyObject) => [
              row.id,
              row.status,
              row.user?.email ?? row.userId,
              String(row.updatedAt ?? "-").slice(0, 19).replace("T", " "),
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold"
                onClick={() => {
                  const next = window.prompt("Tracking override", "");
                  if (!next) return;
                  void runSafeAction(async () => {
                    await api(`/api/admin/jobs/${encodeURIComponent(row.id)}/tracking`, {
                      method: "PATCH",
                      body: JSON.stringify({ trackingNumber: next.trim() }),
                    });
                  });
                }}
              >
                Edit
              </button>,
              <div className="flex items-center gap-1">
                {String(row.status ?? "").toUpperCase() === "FAILED" ? (
                  <button
                    type="button"
                    className="rounded-lg border border-emerald-200 px-2 py-1 text-xs font-semibold text-emerald-700"
                    onClick={() => {
                      void runSafeAction(async () => {
                        await api(`/api/admin/jobs/${encodeURIComponent(row.id)}/retry`, { method: "POST" });
                      });
                    }}
                  >
                    Retry
                  </button>
                ) : null}
                <button
                  type="button"
                  className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold"
                  onClick={() => {
                    void runSafeAction(async () => {
                      await api(`/api/admin/jobs/${encodeURIComponent(row.id)}/cancel`, { method: "POST" });
                    });
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!(["COMPLETED", "FAILED", "CANCELED", "CANCELLED"].includes(String(row.status ?? "").toUpperCase()))}
                  onClick={() => {
                    if (!(["COMPLETED", "FAILED", "CANCELED", "CANCELLED"].includes(String(row.status ?? "").toUpperCase()))) return;
                    if (!window.confirm(`Delete job ${row.id}?`)) return;
                    void runSafeAction(async () => {
                      await api(`/api/admin/jobs/${encodeURIComponent(row.id)}`, { method: "DELETE" });
                    });
                  }}
                >
                  Delete
                </button>
              </div>,
            ])}
          />
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600">
            <span>Page {currentPage} of {totalPages} | Total records: {total} | Page size: {pageSize}</span>
            <span>Showing {pageRows.length} record(s)</span>
          </div>
        </div>
      );
    }
    if (active === "shipments") {
      const rows: AnyObject[] = jobs?.shipments ?? [];
      const filtered = rows.filter((row) => {
        const text = `${row.trackingNumber ?? ""} ${row.user?.email ?? ""} ${row.status ?? ""}`;
        const statusOk = !activeFilters.status || String(row.status ?? "").toUpperCase().includes(activeFilters.status.toUpperCase());
        const dateOk = !activeFilters.from && !activeFilters.to ? true : isWithinDate(row.updatedAt ?? row.createdAt, activeFilters.from, activeFilters.to);
        return includesSearch(text, activeFilters.search) && statusOk && dateOk;
      });
      const start = (activeFilters.page - 1) * activeFilters.pageSize;
      const pageRows = filtered.slice(start, start + activeFilters.pageSize);
      return (
        <DataTable
          headers={["Tracking", "Status", "City", "Updated", "Edit", "Safe Action"]}
          rows={pageRows.map((row: AnyObject) => [
            row.trackingNumber,
            row.status ?? "-",
            row.city ?? "-",
            String(row.updatedAt ?? "-").slice(0, 19).replace("T", " "),
            <button
              type="button"
              className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold"
              onClick={() => {
                const next = window.prompt("Update shipment status", String(row.status ?? ""));
                if (next === null) return;
                void runSafeAction(async () => {
                  await api(`/api/admin/shipments/${encodeURIComponent(row.id)}`, {
                    method: "PATCH",
                    body: JSON.stringify({ status: next.trim() || null }),
                  });
                });
              }}
            >
              Edit
            </button>,
            <button
              type="button"
              className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold"
              onClick={() => {
                void runSafeAction(async () => {
                  await api(`/api/admin/shipments/${encodeURIComponent(row.id)}`, {
                    method: "PATCH",
                    body: JSON.stringify({ status: "ARCHIVED" }),
                  });
                });
              }}
            >
              Archive
            </button>,
          ])}
        />
      );
    }
    if (active === "complaints") {
      const rows: AnyObject[] = jobs?.complaints ?? [];
      const filtered = rows.filter((row) => {
        const text = `${row.trackingId ?? ""} ${row.complaintId ?? ""} ${row.state ?? ""}`;
        const statusOk = !activeFilters.status || String(row.state ?? "").toUpperCase().includes(activeFilters.status.toUpperCase());
        const dateOk = !activeFilters.from && !activeFilters.to ? true : isWithinDate(row.updatedAt ?? row.createdAt ?? row.dueDate, activeFilters.from, activeFilters.to);
        return includesSearch(text, activeFilters.search) && statusOk && dateOk;
      });
      const start = (activeFilters.page - 1) * activeFilters.pageSize;
      const pageRows = filtered.slice(start, start + activeFilters.pageSize);
      return (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold"
              onClick={() => {
                void runSafeAction(async () => {
                  await api("/api/admin/complaints/sync", { method: "POST", body: JSON.stringify({}) });
                });
              }}
            >
              Sync Complaints
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold"
              onClick={() => {
                window.open("/api/admin/complaints/export", "_blank", "noopener,noreferrer");
              }}
            >
              Export CSV
            </button>
          </div>
          <DataTable
            compact
            headers={["Tracking", "Complaint", "State", "Due", "View", "Edit", "Safe Action"]}
            rows={pageRows.map((row: AnyObject) => [
              row.trackingId ?? "-",
              row.complaintId ?? "-",
              row.state ?? "-",
              row.dueDate ?? "-",
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold"
                onClick={() => {
                  void openComplaintDetail(row);
                }}
              >
                View
              </button>,
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold"
                onClick={() => {
                  const next = window.prompt("Set complaint state (OPEN/IN_PROCESS/RESOLVED/CLOSED/ACTIVE)", String(row.state ?? "ACTIVE"));
                  if (!next) return;
                  void runSafeAction(async () => {
                    await api("/api/admin/complaints/manual-override", {
                      method: "POST",
                      body: JSON.stringify({
                        trackingId: row.trackingId,
                        complaintId: row.complaintId ?? "MANUAL",
                        dueDate: row.dueDate ?? dateForInput(new Date().toISOString()),
                        state: next,
                      }),
                    });
                  });
                }}
              >
                Edit
              </button>,
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold"
                onClick={() => {
                  void runSafeAction(async () => {
                    await api("/api/admin/complaints/sync", {
                      method: "POST",
                      body: JSON.stringify({ trackingIds: [row.trackingId] }),
                    });
                  });
                }}
              >
                Sync
              </button>,
            ])}
          />
        </div>
      );
    }
    if (active === "payments") {
      const rows: AnyObject[] = revenue?.payments ?? [];
      const pageRows = rows;
      const total = Number(revenue?.paymentsTotal ?? pageRows.length);
      const totalPages = Math.max(1, Math.ceil(total / Math.max(1, activeFilters.pageSize)));
      return (
        <div className="space-y-2">
        <DataTable
          compact
          headers={[
            <SortHeader key="txn" label="Txn" sortKey="transactionId" activeSortBy={activeFilters.sortBy} activeSortOrder={activeFilters.sortOrder} onToggle={applySort} />,
            "User",
            "Plan",
            <SortHeader key="status" label="Status" sortKey="status" activeSortBy={activeFilters.sortBy} activeSortOrder={activeFilters.sortOrder} onToggle={applySort} />,
            "Edit",
            "Safe Action",
          ]}
          rows={pageRows.map((row: AnyObject) => [
            row.transactionId,
            row.user?.email ?? "-",
            row.plan?.name ?? "-",
            row.status,
            "Review Notes",
            row.status === "PENDING" ? (
              <div className="flex gap-1">
                <button
                  type="button"
                  className="rounded-lg border border-emerald-200 px-2 py-1 text-xs font-semibold text-emerald-700"
                  onClick={() => {
                    void runSafeAction(async () => {
                      await api(`/api/admin/manual-payments/${encodeURIComponent(row.id)}/approve`, { method: "POST" });
                    });
                  }}
                >
                  Approve
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-700"
                  onClick={() => {
                    const notes = window.prompt("Reject notes", "");
                    void runSafeAction(async () => {
                      await api(`/api/admin/manual-payments/${encodeURIComponent(row.id)}/reject`, {
                        method: "POST",
                        body: JSON.stringify({ notes: notes ?? "" }),
                      });
                    });
                  }}
                >
                  Reject
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-700"
                  onClick={() => {
                    if (!window.confirm(`Delete payment request ${row.transactionId}?`)) return;
                    void runSafeAction(async () => {
                      await api(`/api/admin/manual-payments/${encodeURIComponent(row.id)}`, { method: "DELETE" });
                    });
                  }}
                >
                  Delete
                </button>
              </div>
            ) : (String(row.status ?? "").toUpperCase() === "REJECTED" ? (
              <button
                type="button"
                className="rounded-lg border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-700"
                onClick={() => {
                  if (!window.confirm(`Delete rejected payment request ${row.transactionId}?`)) return;
                  void runSafeAction(async () => {
                    await api(`/api/admin/manual-payments/${encodeURIComponent(row.id)}`, { method: "DELETE" });
                  });
                }}
              >
                Delete
              </button>
            ) : "-"),
          ])}
        />
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600">
          <span>Page {activeFilters.page} of {totalPages} | Total records: {total} | Page size: {activeFilters.pageSize}</span>
          <span>Showing {pageRows.length} record(s)</span>
        </div>
        </div>
      );
    }
    if (active === "invoices") {
      const rows: AnyObject[] = revenue?.invoices ?? [];
      const pageRows = rows;
      const total = Number(revenue?.invoicesTotal ?? pageRows.length);
      const totalPages = Math.max(1, Math.ceil(total / Math.max(1, activeFilters.pageSize)));
      return (
        <div className="space-y-2">
        <DataTable
          compact
          headers={[
            <SortHeader key="invoice" label="Invoice" sortKey="createdAt" activeSortBy={activeFilters.sortBy} activeSortOrder={activeFilters.sortOrder} onToggle={applySort} />,
            "User",
            <SortHeader key="amount" label="Amount" sortKey="amountCents" activeSortBy={activeFilters.sortBy} activeSortOrder={activeFilters.sortOrder} onToggle={applySort} />,
            <SortHeader key="status" label="Status" sortKey="status" activeSortBy={activeFilters.sortBy} activeSortOrder={activeFilters.sortOrder} onToggle={applySort} />,
            "Edit",
            "Safe Action",
          ]}
          rows={pageRows.map((row: AnyObject) => [
            row.invoiceNumber,
            row.user?.email ?? "-",
            centsToPkr(row.amountCents),
            row.status,
            "View",
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold"
                onClick={() => {
                  window.open(`/api/admin/invoices/${encodeURIComponent(row.id)}/download`, "_blank", "noopener,noreferrer");
                }}
              >
                Download
              </button>
              <button
                type="button"
                className="rounded-lg border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!(["OPEN", "VOID", "CANCELED", "CANCELLED", "DRAFT", "UNPAID"].includes(String(row.status ?? "").toUpperCase()))}
                onClick={() => {
                  if (!(["OPEN", "VOID", "CANCELED", "CANCELLED", "DRAFT", "UNPAID"].includes(String(row.status ?? "").toUpperCase()))) return;
                  if (!window.confirm(`Delete invoice ${row.invoiceNumber}?`)) return;
                  void runSafeAction(async () => {
                    await api(`/api/admin/invoices/${encodeURIComponent(row.id)}`, { method: "DELETE" });
                  });
                }}
              >
                Delete
              </button>
            </div>,
          ])}
        />
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600">
          <span>Page {activeFilters.page} of {totalPages} | Total records: {total} | Page size: {activeFilters.pageSize}</span>
          <span>Showing {pageRows.length} record(s)</span>
        </div>
        </div>
      );
    }
    if (active === "storage") {
      const rows: AnyObject[] = storage?.recentGeneratedFiles?.labelJobs ?? [];
      const filtered = rows.filter((row) => {
        const text = `${row.id ?? ""} ${row.artifacts?.labelsPdf?.path ?? ""} ${row.artifacts?.moneyOrderPdf?.path ?? ""}`;
        const dateOk = !activeFilters.from && !activeFilters.to ? true : isWithinDate(row.updatedAt, activeFilters.from, activeFilters.to);
        return includesSearch(text, activeFilters.search) && dateOk;
      });
      const start = (activeFilters.page - 1) * activeFilters.pageSize;
      const pageRows = filtered.slice(start, start + activeFilters.pageSize);
      const trackingRows: AnyObject[] = storage?.recentGeneratedFiles?.trackingJobs ?? [];
      return (
        <div className="space-y-4">
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Labels" value={storage?.totals?.labels ?? 0} />
            <MetricCard label="Money Orders" value={storage?.totals?.moneyOrders ?? 0} />
            <MetricCard label="Tracking Master" value={storage?.totals?.trackingMaster ?? 0} />
            <MetricCard label="Tracking Result" value={storage?.totals?.trackingResult ?? 0} />
          </section>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Provider" value={String(storage?.provider ?? "-").toUpperCase()} />
            <MetricCard label="Dual Write" value={storage?.dualWriteEnabled ? "ON" : "OFF"} />
            <MetricCard label="R2 Configured" value={storage?.r2Configured ? "YES" : "NO"} tone={storage?.r2Configured ? "good" : "warn"} />
            <MetricCard label="Local Storage" value={storage?.localStorageConfigured ? "YES" : "NO"} tone={storage?.localStorageConfigured ? "good" : "warn"} />
          </section>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Unsynced Labels" value={storage?.unsynced?.labels ?? 0} tone={(storage?.unsynced?.labels ?? 0) > 0 ? "warn" : "good"} />
            <MetricCard label="Unsynced MOs" value={storage?.unsynced?.moneyOrders ?? 0} tone={(storage?.unsynced?.moneyOrders ?? 0) > 0 ? "warn" : "good"} />
            <MetricCard label="Unsynced Masters" value={storage?.unsynced?.trackingMaster ?? 0} tone={(storage?.unsynced?.trackingMaster ?? 0) > 0 ? "warn" : "good"} />
            <MetricCard label="Unsynced Results" value={storage?.unsynced?.trackingResult ?? 0} tone={(storage?.unsynced?.trackingResult ?? 0) > 0 ? "warn" : "good"} />
          </section>
          <DataTable
            headers={["Job", "Label PDF", "Money Order PDF", "Tracking Master", "Updated"]}
            rows={pageRows.map((row: AnyObject) => [
              row.id,
              `${row.artifacts?.labelsPdf?.provider ?? "-"}${row.artifacts?.labelsPdf?.localExists ? " (local)" : ""}`,
              `${row.artifacts?.moneyOrderPdf?.provider ?? "-"}${row.artifacts?.moneyOrderPdf?.localExists ? " (local)" : ""}`,
              `${row.artifacts?.trackingMaster?.provider ?? "-"}${row.artifacts?.trackingMaster?.localExists ? " (local)" : ""}`,
              String(row.updatedAt ?? "-").slice(0, 19).replace("T", " "),
            ])}
          />
          <DataTable
            headers={["Tracking Job", "Result Path", "Provider", "Updated"]}
            rows={trackingRows.map((row: AnyObject) => [
              row.id,
              row.artifacts?.trackingResult?.path ?? "-",
              `${row.artifacts?.trackingResult?.provider ?? "-"}${row.artifacts?.trackingResult?.localExists ? " (local)" : ""}`,
              String(row.updatedAt ?? "-").slice(0, 19).replace("T", " "),
            ])}
          />
        </div>
      );
    }
    if (active === "audit") {
      const rows: AnyObject[] = audit?.events ?? [];
      const filtered = rows.filter((row) => {
        const text = `${row.source ?? ""} ${row.action ?? ""} ${row.actor ?? ""} ${row.userId ?? ""}`;
        const statusOk = !activeFilters.status || String(row.source ?? "").toUpperCase().includes(activeFilters.status.toUpperCase());
        const dateOk = !activeFilters.from && !activeFilters.to ? true : isWithinDate(row.createdAt, activeFilters.from, activeFilters.to);
        return includesSearch(text, activeFilters.search) && statusOk && dateOk;
      });
      const start = (activeFilters.page - 1) * activeFilters.pageSize;
      const pageRows = filtered.slice(start, start + activeFilters.pageSize);
      return (
        <DataTable
          headers={["Source", "Action", "Actor", "User", "Created"]}
          rows={pageRows.map((row: AnyObject) => [row.source, row.action, row.actor, row.userId ?? "-", String(row.createdAt ?? "-").slice(0, 19).replace("T", " ")])}
        />
      );
    }
    if (active === "health") {
      return (
        <div className="space-y-3">
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
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="Heap Used (MB)" value={Math.round(((health?.runtime?.heapUsed ?? 0) / (1024 * 1024)) * 10) / 10} />
            <MetricCard label="Heap Total (MB)" value={Math.round(((health?.runtime?.heapTotal ?? 0) / (1024 * 1024)) * 10) / 10} />
            <MetricCard label="RSS (MB)" value={Math.round(((health?.runtime?.rss ?? 0) / (1024 * 1024)) * 10) / 10} />
            <MetricCard label="External (MB)" value={Math.round(((health?.runtime?.external ?? 0) / (1024 * 1024)) * 10) / 10} hint={`uptime ${Math.round((health?.runtime?.uptimeSec ?? 0) / 60)}m`} />
          </div>
        </div>
      );
    }

    if (active === "settings") {
      const persisted = health?.settings as AnyObject | null;
      const settings = (settingsDraft ?? persisted) as AnyObject | null;
      if (!settings) return <p className="text-sm text-slate-500">Settings are unavailable.</p>;

      const optionLabelMap: Record<string, string> = {
        jazzcash: "JazzCash",
        easypaisa: "EasyPaisa",
        bank: "Bank",
      };

      const optionEnabled = {
        jazzcash: Boolean(String(settings.jazzcashNumber ?? "").trim() || String(settings.jazzcashTitle ?? "").trim()),
        easypaisa: Boolean(String(settings.easypaisaNumber ?? "").trim() || String(settings.easypaisaTitle ?? "").trim()),
        bank: Boolean(String(settings.bankName ?? "").trim() || String(settings.bankAccountNumber ?? "").trim() || String(settings.bankIban ?? "").trim()),
      };

      const missingOptions = (Object.keys(optionEnabled) as Array<"jazzcash" | "easypaisa" | "bank">).filter((key) => !optionEnabled[key]);

      return (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-60"
              disabled={missingOptions.length === 0}
              onClick={() => {
                if (!missingOptions.length) return;
                const picked = window.prompt(`Add Payment Option (${missingOptions.map((key) => optionLabelMap[key]).join(", ")})`, optionLabelMap[missingOptions[0]]);
                if (!picked) return;
                const normalized = picked.trim().toLowerCase();
                const selected = (Object.keys(optionLabelMap) as Array<"jazzcash" | "easypaisa" | "bank">)
                  .find((key) => optionLabelMap[key].toLowerCase() === normalized || key === normalized);
                if (!selected || !missingOptions.includes(selected)) return;
                setEditingPaymentOption(selected);
              }}
            >
              Add Payment Option
            </button>
            <span className="text-xs text-slate-500">Configure JazzCash, EasyPaisa, and Bank with Save/Cancel controls.</span>
          </div>

          <DataTable
            compact
            headers={["Payment Option", "Configuration", "Actions"]}
            rows={[
              [
                "JazzCash",
                editingPaymentOption === "jazzcash" ? (
                  <div className="grid gap-1">
                    <input className="rounded border border-slate-200 px-2 py-1" value={String(settings.jazzcashTitle ?? "")} onChange={(event) => setSettingsDraft((prev) => ({ ...(prev ?? settings), jazzcashTitle: event.target.value }))} placeholder="Account title" />
                    <input className="rounded border border-slate-200 px-2 py-1" value={String(settings.jazzcashNumber ?? "")} onChange={(event) => setSettingsDraft((prev) => ({ ...(prev ?? settings), jazzcashNumber: event.target.value }))} placeholder="Account/mobile number" />
                  </div>
                ) : `${String(settings.jazzcashTitle ?? "-")} | ${String(settings.jazzcashNumber ?? "-")}`,
                editingPaymentOption === "jazzcash" ? (
                  <div className="flex gap-1">
                    <button type="button" className="rounded border border-emerald-300 px-2 py-1 font-semibold text-emerald-800" onClick={() => {
                      void runSafeAction(async () => {
                        await saveBillingDraft(settings);
                        setEditingPaymentOption(null);
                      });
                    }}>Save</button>
                    <button type="button" className="rounded border border-slate-300 px-2 py-1 font-semibold text-slate-700" onClick={() => {
                      setSettingsDraft(persisted);
                      setEditingPaymentOption(null);
                    }}>Cancel</button>
                  </div>
                ) : (
                  <div className="flex gap-1">
                    <button type="button" className="rounded border border-slate-300 px-2 py-1 font-semibold text-slate-700" onClick={() => setEditingPaymentOption("jazzcash")}>Edit</button>
                    <button type="button" className="rounded border border-rose-300 px-2 py-1 font-semibold text-rose-800" onClick={() => {
                      if (!window.confirm("Delete JazzCash payment option?")) return;
                      const next = { ...(settings ?? {}), jazzcashTitle: "", jazzcashNumber: "" };
                      void runSafeAction(async () => {
                        await saveBillingDraft(next);
                        setSettingsDraft(next);
                      });
                    }}>Delete</button>
                  </div>
                ),
              ],
              [
                "EasyPaisa",
                editingPaymentOption === "easypaisa" ? (
                  <div className="grid gap-1">
                    <input className="rounded border border-slate-200 px-2 py-1" value={String(settings.easypaisaTitle ?? "")} onChange={(event) => setSettingsDraft((prev) => ({ ...(prev ?? settings), easypaisaTitle: event.target.value }))} placeholder="Account title" />
                    <input className="rounded border border-slate-200 px-2 py-1" value={String(settings.easypaisaNumber ?? "")} onChange={(event) => setSettingsDraft((prev) => ({ ...(prev ?? settings), easypaisaNumber: event.target.value }))} placeholder="Account/mobile number" />
                  </div>
                ) : `${String(settings.easypaisaTitle ?? "-")} | ${String(settings.easypaisaNumber ?? "-")}`,
                editingPaymentOption === "easypaisa" ? (
                  <div className="flex gap-1">
                    <button type="button" className="rounded border border-emerald-300 px-2 py-1 font-semibold text-emerald-800" onClick={() => {
                      void runSafeAction(async () => {
                        await saveBillingDraft(settings);
                        setEditingPaymentOption(null);
                      });
                    }}>Save</button>
                    <button type="button" className="rounded border border-slate-300 px-2 py-1 font-semibold text-slate-700" onClick={() => {
                      setSettingsDraft(persisted);
                      setEditingPaymentOption(null);
                    }}>Cancel</button>
                  </div>
                ) : (
                  <div className="flex gap-1">
                    <button type="button" className="rounded border border-slate-300 px-2 py-1 font-semibold text-slate-700" onClick={() => setEditingPaymentOption("easypaisa")}>Edit</button>
                    <button type="button" className="rounded border border-rose-300 px-2 py-1 font-semibold text-rose-800" onClick={() => {
                      if (!window.confirm("Delete EasyPaisa payment option?")) return;
                      const next = { ...(settings ?? {}), easypaisaTitle: "", easypaisaNumber: "" };
                      void runSafeAction(async () => {
                        await saveBillingDraft(next);
                        setSettingsDraft(next);
                      });
                    }}>Delete</button>
                  </div>
                ),
              ],
              [
                "Bank",
                editingPaymentOption === "bank" ? (
                  <div className="grid gap-1">
                    <input className="rounded border border-slate-200 px-2 py-1" value={String(settings.bankName ?? "")} onChange={(event) => setSettingsDraft((prev) => ({ ...(prev ?? settings), bankName: event.target.value }))} placeholder="Bank name" />
                    <input className="rounded border border-slate-200 px-2 py-1" value={String(settings.bankTitle ?? "")} onChange={(event) => setSettingsDraft((prev) => ({ ...(prev ?? settings), bankTitle: event.target.value }))} placeholder="Account title" />
                    <input className="rounded border border-slate-200 px-2 py-1" value={String(settings.bankAccountNumber ?? "")} onChange={(event) => setSettingsDraft((prev) => ({ ...(prev ?? settings), bankAccountNumber: event.target.value }))} placeholder="Account number" />
                    <input className="rounded border border-slate-200 px-2 py-1" value={String(settings.bankIban ?? "")} onChange={(event) => setSettingsDraft((prev) => ({ ...(prev ?? settings), bankIban: event.target.value }))} placeholder="IBAN" />
                  </div>
                ) : `${String(settings.bankName ?? "-")} | ${String(settings.bankTitle ?? "-")} | ${String(settings.bankAccountNumber ?? settings.bankIban ?? "-")}`,
                editingPaymentOption === "bank" ? (
                  <div className="flex gap-1">
                    <button type="button" className="rounded border border-emerald-300 px-2 py-1 font-semibold text-emerald-800" onClick={() => {
                      void runSafeAction(async () => {
                        await saveBillingDraft(settings);
                        setEditingPaymentOption(null);
                      });
                    }}>Save</button>
                    <button type="button" className="rounded border border-slate-300 px-2 py-1 font-semibold text-slate-700" onClick={() => {
                      setSettingsDraft(persisted);
                      setEditingPaymentOption(null);
                    }}>Cancel</button>
                  </div>
                ) : (
                  <div className="flex gap-1">
                    <button type="button" className="rounded border border-slate-300 px-2 py-1 font-semibold text-slate-700" onClick={() => setEditingPaymentOption("bank")}>Edit</button>
                    <button type="button" className="rounded border border-rose-300 px-2 py-1 font-semibold text-rose-800" onClick={() => {
                      if (!window.confirm("Delete Bank payment option?")) return;
                      const next = { ...(settings ?? {}), bankName: "", bankTitle: "", bankAccountNumber: "", bankIban: "" };
                      void runSafeAction(async () => {
                        await saveBillingDraft(next);
                        setSettingsDraft(next);
                      });
                    }}>Delete</button>
                  </div>
                ),
              ],
            ]}
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold text-slate-600">
              Standard Price
              <input className="mt-1 w-full rounded border border-slate-200 px-2 py-1 text-xs" type="number" min={1} value={Number(settings.standardPrice ?? 1)} onChange={(event) => setSettingsDraft((prev) => ({ ...(prev ?? settings), standardPrice: Number(event.target.value || 1) }))} />
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Business Price
              <input className="mt-1 w-full rounded border border-slate-200 px-2 py-1 text-xs" type="number" min={1} value={Number(settings.businessPrice ?? 1)} onChange={(event) => setSettingsDraft((prev) => ({ ...(prev ?? settings), businessPrice: Number(event.target.value || 1) }))} />
            </label>
          </div>
        </div>
      );
    }

    if (active === "allow-files") {
      const settings = health?.settings as AnyObject | null;
      const exempt = Array.isArray(settings?.exemptFileNames) ? settings.exemptFileNames : [];
      return (
        <div className="space-y-4">
          <DataTable
            headers={["Allowed/Test File Name"]}
            rows={(exempt.length ? exempt : ["No entries configured"]).map((name: string) => [name])}
          />
          <button
            type="button"
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold"
            onClick={() => {
              if (!settings) return;
              const next = window.prompt("Comma-separated file names", exempt.join(", "));
              if (next === null) return;
              const nextList = next
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean);
              void runSafeAction(async () => {
                await api("/api/admin/billing-settings", {
                  method: "PUT",
                  body: JSON.stringify({
                    jazzcashNumber: settings.jazzcashNumber,
                    jazzcashTitle: settings.jazzcashTitle,
                    easypaisaNumber: settings.easypaisaNumber,
                    easypaisaTitle: settings.easypaisaTitle,
                    bankName: settings.bankName ?? "",
                    bankTitle: settings.bankTitle ?? "",
                    bankAccountNumber: settings.bankAccountNumber ?? "",
                    bankIban: settings.bankIban ?? "",
                    standardPrice: settings.standardPrice,
                    businessPrice: settings.businessPrice,
                    exemptFileNames: JSON.stringify(nextList),
                  }),
                });
              });
            }}
          >
            Update Allow/Test File Names
          </button>
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
                aria-current={active === item.key ? "page" : undefined}
                className={`rounded-xl px-3 py-2 text-left text-sm font-semibold transition ${
                  active === item.key
                    ? "border border-emerald-300 border-l-4 bg-emerald-200 text-emerald-950 shadow-sm"
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
            <div className="flex items-center gap-2">
              {saving ? <span className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-600">Saving</span> : null}
              {loading ? <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Loading</span> : null}
            </div>
          </div>
          {legacyEmbeddedSectionForNav(active) ? null : (
          <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <input
              value={activeFilters.search}
              onChange={(event) => updateActiveFilters({ search: event.target.value, page: 1 })}
              placeholder="Search"
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
            <input
              value={activeFilters.status}
              onChange={(event) => updateActiveFilters({ status: event.target.value, page: 1 })}
              placeholder="Status"
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
            <input
              type="date"
              value={activeFilters.from}
              onChange={(event) => updateActiveFilters({ from: event.target.value, page: 1, quickDate: "custom" })}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
            <input
              type="date"
              value={activeFilters.to}
              onChange={(event) => updateActiveFilters({ to: event.target.value, page: 1, quickDate: "custom" })}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
            <select
              value={activeFilters.sortBy}
              onChange={(event) => updateActiveFilters({ sortBy: event.target.value, page: 1 })}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            >
              {sortOptionsForSection(active).map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <select
              value={activeFilters.sortOrder}
              onChange={(event) => updateActiveFilters({ sortOrder: event.target.value as SortOrder, page: 1 })}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="desc">Desc</option>
              <option value="asc">Asc</option>
            </select>
          </div>
          )}
          {legacyEmbeddedSectionForNav(active) ? null : (
          <div className="mb-4 space-y-2">
            {sectionUsesDateFilters(active) ? (
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Date Filter</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={`rounded-lg border px-3 py-2 text-xs font-semibold ${activeFilters.quickDate === "today" ? "border-emerald-300 bg-emerald-100 text-emerald-900" : "border-slate-200"}`} onClick={() => applyQuickDate("today")}>Today</button>
                  <button type="button" className={`rounded-lg border px-3 py-2 text-xs font-semibold ${activeFilters.quickDate === "week" ? "border-emerald-300 bg-emerald-100 text-emerald-900" : "border-slate-200"}`} onClick={() => applyQuickDate("week")}>Last 7 Days</button>
                  <button type="button" className={`rounded-lg border px-3 py-2 text-xs font-semibold ${activeFilters.quickDate === "month" ? "border-emerald-300 bg-emerald-100 text-emerald-900" : "border-slate-200"}`} onClick={() => applyQuickDate("month")}>This Month</button>
                  <button type="button" className={`rounded-lg border px-3 py-2 text-xs font-semibold ${activeFilters.quickDate === "all" ? "border-emerald-300 bg-emerald-100 text-emerald-900" : "border-slate-200"}`} onClick={() => applyQuickDate("all")}>All</button>
                </div>
                <p className="mt-1 text-[11px] text-slate-500">{quickDateHelpText(activeFilters.quickDate)}</p>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
            <button type="button" className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold" onClick={() => void loadSection(active, true)}>Refresh</button>
            <button type="button" className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold" onClick={() => resetFilters(active)}>Clear Filters</button>
            <select
              value={String(activeFilters.pageSize)}
              onChange={(event) => updateActiveFilters({ pageSize: Number(event.target.value), page: 1 })}
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold"
            >
              {[10, 20, 50, 100].map((size) => (
                <option key={size} value={size}>{size} / page</option>
              ))}
            </select>
            <button type="button" className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold" onClick={() => updateActiveFilters({ page: Math.max(1, activeFilters.page - 1) })}>Prev</button>
            <button type="button" className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold" onClick={() => updateActiveFilters({ page: activeFilters.page + 1 })}>Next</button>
            </div>
          </div>
          )}
          {error ? <p className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
          {renderSectionBody()}
        </main>
      </div>

      {complaintDetail ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Complaint Detail View</h3>
              <button type="button" className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold" onClick={() => setComplaintDetail(null)}>Close</button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 text-xs text-slate-700">
              <div><span className="font-semibold">Tracking ID:</span> {String(complaintDetail.trackingId ?? "-")}</div>
              <div><span className="font-semibold">Complaint ID:</span> {String(complaintDetail.complaintId ?? "-")}</div>
              <div><span className="font-semibold">Due Date:</span> {String(complaintDetail.dueDate ?? "-")}</div>
              <div><span className="font-semibold">Complaint Status:</span> {String(complaintDetail.complaintStatus ?? "-")}</div>
              <div><span className="font-semibold">Addressee:</span> {String(complaintDetail.addressee ?? "-")}</div>
              <div><span className="font-semibold">City/Office:</span> {String(complaintDetail.cityOrOffice ?? "-")}</div>
              <div><span className="font-semibold">Latest Tracking State:</span> {String(complaintDetail.latestTrackingState ?? "-")}</div>
              <div><span className="font-semibold">Queue Status:</span> {String(complaintDetail.queueStatus ?? "-")}</div>
            </div>
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-2">
              <p className="text-xs font-semibold text-slate-700">Audit / Sync History (available lines)</p>
              {(complaintDetail.historyLines ?? []).length ? (
                <ul className="mt-1 space-y-1 text-xs text-slate-600">
                  {(complaintDetail.historyLines ?? []).map((line: string, idx: number) => (
                    <li key={idx}>{line}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-xs text-slate-500">No complaint history lines found for this record.</p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}
