import { useEffect, useMemo, useRef, useState } from "react";
import { api, apiUrl } from "../../lib/api";
import {
  downloadSupportAttachment,
  getAdminSupportTicket,
  listAdminSupportSummary,
  listAdminSupportTickets,
  replyAdminSupportTicket,
  updateAdminSupportPreserve,
  updateAdminSupportPriority,
  updateAdminSupportStatus,
  viewSupportAttachmentInNewTab,
  type SupportTicket,
} from "../../lib/support";
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
  | "support"
  | "payments"
  | "invoices"
  | "storage"
  | "audit"
  | "health"
  | "payment"
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
  { key: "support", label: "Support" },
  { key: "payments", label: "Payments" },
  { key: "invoices", label: "Invoices" },
  { key: "storage", label: "Storage" },
  { key: "audit", label: "Audit" },
  { key: "health", label: "Health" },
  { key: "payment", label: "Payment" },
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
  return !["dashboard", "health", "payment", "allow-files", "revenue"].includes(section);
}

function sectionUsesDateFilters(section: NavKey) {
  return ["users", "usage", "jobs", "shipments", "complaints", "support", "payments", "invoices", "storage", "audit"].includes(section);
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
  if (section === "support") {
    return [
      { value: "updatedAt", label: "Updated" },
      { value: "createdAt", label: "Created" },
      { value: "status", label: "Status" },
      { value: "priority", label: "Priority" },
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
  const [active, setActive] = useState<NavKey>(() => {
    if (typeof window === "undefined") return "dashboard";
    const tab = new URLSearchParams(window.location.search).get("tab");
    return NAV_ITEMS.some((item) => item.key === tab) ? (tab as NavKey) : "dashboard";
  });
  const pendingSupportTicketIdRef = useRef<string | null>(typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("ticketId") : null);
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
  const [viewUserId, setViewUserId] = useState<string | null>(null);
  const [viewUserDetail, setViewUserDetail] = useState<AnyObject | null>(null);
  const [editUserModal, setEditUserModal] = useState<AnyObject | null>(null);
  const [creditModal, setCreditModal] = useState<AnyObject | null>(null);
  const [complaintDetail, setComplaintDetail] = useState<AnyObject | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<AnyObject | null>(null);
  const [editingPaymentOption, setEditingPaymentOption] = useState<"jazzcash" | "easypaisa" | "bank" | null>(null);
  const [supportData, setSupportData] = useState<{
    tickets: SupportTicket[];
    total: number;
    page: number;
    pageSize: number;
    summary: {
      openTickets: number;
      pendingTickets: number;
      resolvedTickets: number;
      overdueTickets: number;
      totalSupportTickets: number;
      closedTickets: number;
      totalSupportAttachments: number;
      totalSupportStorageMb: number;
    } | null;
    selectedTicket: SupportTicket | null;
    replyText: string;
  }>({
    tickets: [],
    total: 0,
    page: 1,
    pageSize: 20,
    summary: null,
    selectedTicket: null,
    replyText: "",
  });
  const [jazzcashQrFile, setJazzcashQrFile] = useState<File | null>(null);
  const [easypaisaQrFile, setEasypaisaQrFile] = useState<File | null>(null);
  const [bankQrFile, setBankQrFile] = useState<File | null>(null);
  const jazzcashQrInputRef = useRef<HTMLInputElement>(null);
  const easypaisaQrInputRef = useRef<HTMLInputElement>(null);
  const bankQrInputRef = useRef<HTMLInputElement>(null);

  const [filters, setFilters] = useState<Record<NavKey, FilterState>>(() => {
    const map = {} as Record<NavKey, FilterState>;
    for (const item of NAV_ITEMS) {
      map[item.key] = { ...DEFAULT_FILTER };
    }
    return map;
  });

  const activeFilters = filters[active];

  function riskTone(levelRaw: unknown) {
    const level = String(levelRaw ?? "none").toLowerCase();
    if (level === "high") return "border-rose-200 bg-rose-50 text-rose-700";
    if (level === "medium") return "border-amber-200 bg-amber-50 text-amber-700";
    if (level === "low") return "border-sky-200 bg-sky-50 text-sky-700";
    if (level === "review") return "border-violet-200 bg-violet-50 text-violet-700";
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  function riskLabel(levelRaw: unknown) {
    const level = String(levelRaw ?? "none").toLowerCase();
    if (level === "none") return "NONE";
    return level.toUpperCase();
  }

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
        const [dashboardUsers, listUsers, plansData] = await Promise.all([
          api<AnyObject>("/api/admin/dashboard/users"),
          api<AnyObject>(`/api/admin/users${q}`),
          api<AnyObject>("/api/admin/plans").catch(() => ({ plans: users?.plans ?? [] })),
        ]);
        setUsers({
          ...dashboardUsers,
          plans: plansData?.plans ?? users?.plans ?? [],
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
      if (target === "support" && (force || supportData.tickets.length === 0)) {
        const [ticketsData, summaryData] = await Promise.all([
          listAdminSupportTickets({
            page: targetFilters.page,
            pageSize: targetFilters.pageSize,
            status: targetFilters.status || undefined,
            search: targetFilters.search || undefined,
            from: targetFilters.from || undefined,
            to: targetFilters.to || undefined,
          }),
          listAdminSupportSummary(),
        ]);
        setSupportData((prev) => ({
          ...prev,
          tickets: ticketsData.tickets,
          total: ticketsData.total,
          page: ticketsData.page,
          pageSize: ticketsData.pageSize,
          summary: summaryData,
          selectedTicket: prev.selectedTicket && ticketsData.tickets.some((ticket) => ticket.id === prev.selectedTicket?.id)
            ? prev.selectedTicket
            : null,
        }));
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
      if ((target === "payment" || target === "allow-files") && (force || !health?.settings)) {
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
    if (active !== "support") return;
    const ticketId = pendingSupportTicketIdRef.current;
    if (!ticketId) return;
    void getAdminSupportTicket(ticketId)
      .then((detail) => {
        setSupportData((prev) => ({ ...prev, selectedTicket: detail.ticket }));
      })
      .finally(() => {
        pendingSupportTicketIdRef.current = null;
        if (typeof window !== "undefined") {
          const params = new URLSearchParams(window.location.search);
          params.delete("ticketId");
          const next = params.toString();
          window.history.replaceState({}, "", next ? `${window.location.pathname}?${next}` : window.location.pathname);
        }
      });
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

  async function saveBillingDraft(nextDraft: AnyObject, qrFiles?: { jazzcash?: File | null; easypaisa?: File | null; bank?: File | null }) {
    const form = new FormData();
    form.append("jazzcashNumber", String(nextDraft?.jazzcashNumber ?? "").trim());
    form.append("jazzcashTitle", String(nextDraft?.jazzcashTitle ?? "").trim());
    form.append("easypaisaNumber", String(nextDraft?.easypaisaNumber ?? "").trim());
    form.append("easypaisaTitle", String(nextDraft?.easypaisaTitle ?? "").trim());
    form.append("bankName", String(nextDraft?.bankName ?? "").trim());
    form.append("bankTitle", String(nextDraft?.bankTitle ?? "").trim());
    form.append("bankAccountNumber", String(nextDraft?.bankAccountNumber ?? "").trim());
    form.append("bankIban", String(nextDraft?.bankIban ?? "").trim());
    form.append("businessPrice", String(Number(nextDraft?.businessPrice ?? 1)));
    form.append("exemptFileNames", JSON.stringify(Array.isArray(nextDraft?.exemptFileNames) ? nextDraft.exemptFileNames : []));
    if (qrFiles?.jazzcash) form.append("jazzcashQr", qrFiles.jazzcash);
    if (qrFiles?.easypaisa) form.append("easypaisaQr", qrFiles.easypaisa);
    if (qrFiles?.bank) form.append("bankQr", qrFiles.bank);
    await api("/api/admin/billing-settings", { method: "PUT", body: form });
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
      const plans: AnyObject[] = users?.plans ?? [];
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
              "Contact",
              "CNIC",
              <SortHeader key="status" label="Status" sortKey="suspended" activeSortBy={activeFilters.sortBy} activeSortOrder={activeFilters.sortOrder} onToggle={applySort} />,
              "Plan",
              "Credits/Units",
              "Risk",
              <SortHeader key="joined" label="Joined" sortKey="createdAt" activeSortBy={activeFilters.sortBy} activeSortOrder={activeFilters.sortOrder} onToggle={applySort} />,
              "Actions",
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
              row.contactNumber ?? "-",
              row.cnic ?? "-",
              row.suspended ? "SUSPENDED" : "ACTIVE",
              row.subscription?.plan?.name ?? "No plan",
              <div className="space-y-0.5 text-[11px]">
                <div>Extra: L{Number(row.extraLabelCredits ?? 0)} / T{Number(row.extraTrackingCredits ?? 0)}</div>
                <div>Remaining: {Number(row.balances?.labelsRemaining ?? 0)}</div>
              </div>,
              (() => {
                const risk = row.duplicateRisk as AnyObject | undefined;
                const level = String(risk?.level ?? "none").toLowerCase();
                const reasons = Array.isArray(risk?.reasons) ? risk.reasons : [];
                return (
                  <div className="space-y-1">
                    <span className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase ${riskTone(level)}`}>{riskLabel(level)}</span>
                    {reasons.length ? <p className="max-w-[240px] truncate text-[11px] text-slate-600" title={String(reasons.join(" | "))}>{String(reasons.join(" | "))}</p> : null}
                    {risk?.reviewHint ? <p className="max-w-[240px] truncate text-[11px] text-slate-500" title={String(risk.reviewHint)}>{String(risk.reviewHint)}</p> : null}
                  </div>
                );
              })(),
              String(row.createdAt ?? "-").slice(0, 10),
              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold"
                  onClick={() => {
                    const userId = String(row.id ?? "").trim();
                    if (!userId) return;
                    setViewUserId(userId);
                    setViewUserDetail(null);
                    setLoading(true);
                    setError(null);
                    void api<AnyObject>(`/api/admin/users/${encodeURIComponent(userId)}`)
                      .then((payload) => setViewUserDetail(payload.user ?? null))
                      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load user detail"))
                      .finally(() => setLoading(false));
                  }}
                >
                  View
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold"
                  onClick={() => {
                    setEditUserModal({
                      userId: row.id,
                      email: row.email,
                      companyName: row.companyName ?? "",
                      contactNumber: row.contactNumber ?? "",
                      cnic: row.cnic ?? "",
                      status: row.suspended ? "SUSPENDED" : "ACTIVE",
                      role: row.role ?? "USER",
                      planId: row.subscription?.plan?.id ?? "",
                      correctionNote: "",
                      confirmCorrection: false,
                    });
                  }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold"
                  onClick={() => {
                    setCreditModal({ userId: row.id, email: row.email, companyName: row.companyName ?? "", amount: "", reason: "", confirm: false });
                  }}
                >
                  Add Credit
                </button>
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
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-700"
                  onClick={() => {
                    if (!window.confirm(`Delete ${row.email}? This is irreversible and may fail for linked records.`)) return;
                    void runSafeAction(async () => {
                      await api(`/api/admin/users/${encodeURIComponent(row.id)}`, { method: "DELETE" });
                    });
                  }}
                >
                  Delete
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-violet-200 px-2 py-1 text-xs font-semibold text-violet-700"
                  onClick={() => {
                    const action = window.confirm("Select OK for Allow, Cancel for Mark Reviewed.") ? "ALLOW" : "REVIEW";
                    const note = window.prompt("Admin note (required)", "")?.trim() ?? "";
                    if (!note) return;
                    void runSafeAction(async () => {
                      await api(`/api/admin/users/${encodeURIComponent(row.id)}/duplicate-risk/review`, {
                        method: "POST",
                        body: JSON.stringify({ action, note }),
                      });
                    });
                  }}
                >
                  Allow/Review
                </button>
              </div>,
            ])}
          />

          {viewUserId ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
              <div className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-base font-bold text-slate-900">View Customer</h3>
                  <button type="button" className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold" onClick={() => { setViewUserId(null); setViewUserDetail(null); }}>Close</button>
                </div>
                {!viewUserDetail ? (
                  <p className="text-sm text-slate-500">Loading details...</p>
                ) : (
                  <div className="space-y-3 text-xs text-slate-700">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div><span className="font-semibold">User ID:</span> {String(viewUserDetail.id ?? "-")}</div>
                      <div><span className="font-semibold">Email:</span> {String(viewUserDetail.email ?? "-")}</div>
                      <div><span className="font-semibold">Company:</span> {String(viewUserDetail.companyName ?? "-")}</div>
                      <div><span className="font-semibold">Contact:</span> {String(viewUserDetail.contactNumber ?? "-")}</div>
                      <div><span className="font-semibold">CNIC:</span> {String(viewUserDetail.cnic ?? "-")}</div>
                      <div><span className="font-semibold">Plan:</span> {String(viewUserDetail.subscription?.plan?.name ?? "No plan")}</div>
                      <div><span className="font-semibold">Subscription Status:</span> {String(viewUserDetail.subscription?.status ?? "-")}</div>
                      <div><span className="font-semibold">Credits:</span> L{Number(viewUserDetail.extraLabelCredits ?? 0)} / T{Number(viewUserDetail.extraTrackingCredits ?? 0)}</div>
                      <div><span className="font-semibold">Account Status:</span> {String(viewUserDetail.status ?? "-")}</div>
                      <div><span className="font-semibold">Role:</span> {String(viewUserDetail.role ?? "-")}</div>
                      <div><span className="font-semibold">Created:</span> {String(viewUserDetail.createdAt ?? "-").slice(0, 19).replace("T", " ")}</div>
                      <div><span className="font-semibold">Updated:</span> {String(viewUserDetail.updatedAt ?? "-")}</div>
                      <div><span className="font-semibold">Onboarding Complete:</span> {String(Boolean(viewUserDetail.onboardingComplete))}</div>
                      <div><span className="font-semibold">Remaining Units:</span> {Number(viewUserDetail.balances?.labelsRemaining ?? 0)}</div>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p className="font-semibold text-slate-800">Duplicate Risk</p>
                      <p className="mt-1">
                        <span className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-semibold ${riskTone(viewUserDetail.duplicateRisk?.level)}`}>{riskLabel(viewUserDetail.duplicateRisk?.level)}</span>
                      </p>
                      {(viewUserDetail.duplicateRisk?.reasons ?? []).length ? (
                        <ul className="mt-2 space-y-1">
                          {(viewUserDetail.duplicateRisk?.reasons ?? []).map((reason: string, idx: number) => (
                            <li key={idx}>- {reason}</li>
                          ))}
                        </ul>
                      ) : <p className="mt-2">No risk reasons.</p>}
                      <p className="mt-2"><span className="font-semibold">Review hint:</span> {String(viewUserDetail.duplicateRisk?.reviewHint ?? "-")}</p>
                      <p><span className="font-semibold">Last seen:</span> {String(viewUserDetail.duplicateRisk?.lastSeenAt ?? "-")}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p className="font-semibold text-slate-800">Recent Risk Signals</p>
                      {(viewUserDetail.recentRiskSignals ?? []).length ? (
                        <ul className="mt-1 space-y-1">
                          {(viewUserDetail.recentRiskSignals ?? []).map((signal: AnyObject, idx: number) => (
                            <li key={idx}>{String(signal.signalType)} | {String(signal.source)} | {String(signal.createdAt).slice(0, 19).replace("T", " ")}</li>
                          ))}
                        </ul>
                      ) : <p className="mt-1">No recent signals.</p>}
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p className="font-semibold text-slate-800">Notes / Audit (available)</p>
                      {(viewUserDetail.adminNotes ?? []).length ? (
                        <ul className="mt-1 space-y-1">
                          {(viewUserDetail.adminNotes ?? []).map((note: AnyObject, idx: number) => (
                            <li key={idx}>{String(note.source)} | {String(note.actorEmail ?? "-")} | {String(note.note ?? "-")} | {String(note.createdAt).slice(0, 19).replace("T", " ")}</li>
                          ))}
                        </ul>
                      ) : <p className="mt-1">No admin notes available.</p>}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {editUserModal ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
              <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-base font-bold text-slate-900">Edit / Unlock Customer</h3>
                  <button type="button" className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold" onClick={() => setEditUserModal(null)}>Cancel</button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="text-xs font-semibold text-slate-600">Company Name
                    <input className="mt-1 w-full rounded border border-slate-200 px-2 py-1.5 text-xs" value={String(editUserModal.companyName ?? "")} onChange={(e) => setEditUserModal((prev: AnyObject) => ({ ...prev, companyName: e.target.value }))} />
                  </label>
                  <label className="text-xs font-semibold text-slate-600">Contact Number
                    <input className="mt-1 w-full rounded border border-slate-200 px-2 py-1.5 text-xs" value={String(editUserModal.contactNumber ?? "")} onChange={(e) => setEditUserModal((prev: AnyObject) => ({ ...prev, contactNumber: e.target.value }))} />
                  </label>
                  <label className="text-xs font-semibold text-slate-600">CNIC
                    <input className="mt-1 w-full rounded border border-slate-200 px-2 py-1.5 text-xs" value={String(editUserModal.cnic ?? "")} onChange={(e) => setEditUserModal((prev: AnyObject) => ({ ...prev, cnic: e.target.value }))} />
                  </label>
                  <label className="text-xs font-semibold text-slate-600">Status
                    <select className="mt-1 w-full rounded border border-slate-200 px-2 py-1.5 text-xs" value={String(editUserModal.status ?? "ACTIVE")} onChange={(e) => setEditUserModal((prev: AnyObject) => ({ ...prev, status: e.target.value }))}>
                      <option value="ACTIVE">ACTIVE</option>
                      <option value="SUSPENDED">SUSPENDED</option>
                    </select>
                  </label>
                  <label className="text-xs font-semibold text-slate-600">Role
                    <select className="mt-1 w-full rounded border border-slate-200 px-2 py-1.5 text-xs" value={String(editUserModal.role ?? "USER")} onChange={(e) => setEditUserModal((prev: AnyObject) => ({ ...prev, role: e.target.value }))}>
                      <option value="USER">USER</option>
                      <option value="ADMIN">ADMIN</option>
                    </select>
                  </label>
                  <label className="text-xs font-semibold text-slate-600">Plan/Package
                    <select className="mt-1 w-full rounded border border-slate-200 px-2 py-1.5 text-xs" value={String(editUserModal.planId ?? "")} onChange={(e) => setEditUserModal((prev: AnyObject) => ({ ...prev, planId: e.target.value }))}>
                      <option value="">No change</option>
                      {plans.map((plan: AnyObject) => <option key={String(plan.id)} value={String(plan.id)}>{String(plan.name)}</option>)}
                    </select>
                  </label>
                </div>
                <label className="mt-3 block text-xs font-semibold text-slate-600">Correction Note
                  <textarea className="mt-1 w-full rounded border border-slate-200 px-2 py-1.5 text-xs" rows={3} value={String(editUserModal.correctionNote ?? "")} onChange={(e) => setEditUserModal((prev: AnyObject) => ({ ...prev, correctionNote: e.target.value }))} placeholder="Reason for CNIC/contact correction" />
                </label>
                <label className="mt-2 flex items-center gap-2 text-xs text-slate-700">
                  <input type="checkbox" checked={Boolean(editUserModal.confirmCorrection)} onChange={(e) => setEditUserModal((prev: AnyObject) => ({ ...prev, confirmCorrection: e.target.checked }))} />
                  I confirm this correction is verified and approved.
                </label>
                <div className="mt-3 flex justify-end gap-2">
                  <button type="button" className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold" onClick={() => setEditUserModal(null)}>Cancel</button>
                  <button
                    type="button"
                    className="rounded-lg border border-emerald-300 bg-emerald-100 px-3 py-1.5 text-xs font-semibold text-emerald-900"
                    onClick={() => {
                      void runSafeAction(async () => {
                        await api(`/api/admin/users/${encodeURIComponent(String(editUserModal.userId))}`, {
                          method: "PATCH",
                          body: JSON.stringify({
                            companyName: String(editUserModal.companyName ?? "").trim() || null,
                            contactNumber: String(editUserModal.contactNumber ?? "").trim() || null,
                            cnic: String(editUserModal.cnic ?? "").trim() || null,
                            status: editUserModal.status,
                            role: editUserModal.role,
                            planId: String(editUserModal.planId ?? "").trim() || undefined,
                            correctionNote: String(editUserModal.correctionNote ?? "").trim(),
                            confirmCorrection: Boolean(editUserModal.confirmCorrection),
                          }),
                        });
                        setEditUserModal(null);
                      });
                    }}
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {creditModal ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
              <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-base font-bold text-slate-900">Add Credit / Units</h3>
                  <button type="button" className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold" onClick={() => setCreditModal(null)}>Cancel</button>
                </div>
                <p className="text-xs text-slate-600">{String(creditModal.companyName || creditModal.email)}</p>
                <p className="mb-2 text-xs text-slate-500">{String(creditModal.email)}</p>
                <label className="block text-xs font-semibold text-slate-600">Units amount
                  <input className="mt-1 w-full rounded border border-slate-200 px-2 py-1.5 text-xs" type="number" min={0} value={String(creditModal.amount ?? "")} onChange={(e) => setCreditModal((prev: AnyObject) => ({ ...prev, amount: e.target.value }))} />
                </label>
                <label className="mt-2 block text-xs font-semibold text-slate-600">Reason / Note
                  <textarea className="mt-1 w-full rounded border border-slate-200 px-2 py-1.5 text-xs" rows={3} value={String(creditModal.reason ?? "")} onChange={(e) => setCreditModal((prev: AnyObject) => ({ ...prev, reason: e.target.value }))} />
                </label>
                <label className="mt-2 flex items-center gap-2 text-xs text-slate-700">
                  <input type="checkbox" checked={Boolean(creditModal.confirm)} onChange={(e) => setCreditModal((prev: AnyObject) => ({ ...prev, confirm: e.target.checked }))} />
                  I confirm this credit adjustment is authorized.
                </label>
                <div className="mt-3 flex justify-end gap-2">
                  <button type="button" className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold" onClick={() => setCreditModal(null)}>Cancel</button>
                  <button
                    type="button"
                    className="rounded-lg border border-emerald-300 bg-emerald-100 px-3 py-1.5 text-xs font-semibold text-emerald-900"
                    onClick={() => {
                      void runSafeAction(async () => {
                        const amount = Math.max(0, Math.trunc(Number(creditModal.amount ?? 0)));
                        await api(`/api/admin/users/${encodeURIComponent(String(creditModal.userId))}/credits`, {
                          method: "POST",
                          body: JSON.stringify({
                            labelCredits: amount,
                            trackingCredits: amount,
                            reason: String(creditModal.reason ?? "").trim(),
                            confirm: Boolean(creditModal.confirm),
                          }),
                        });
                        setCreditModal(null);
                      });
                    }}
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          ) : null}

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
            <span>Page {currentPage} of {totalPages} | Total: {total} | Page size: {pageSize} | Showing {pageRows.length}</span>
            <div className="flex gap-2">
              <button type="button" className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold disabled:opacity-50" disabled={currentPage <= 1} onClick={() => updateActiveFilters({ page: Math.max(1, activeFilters.page - 1) })}>Prev</button>
              <button type="button" className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold disabled:opacity-50" disabled={currentPage >= totalPages} onClick={() => updateActiveFilters({ page: activeFilters.page + 1 })}>Next</button>
            </div>
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

    if (active === "support") {
      const rows: SupportTicket[] = supportData.tickets ?? [];
      const selected = supportData.selectedTicket;
      const totalPages = Math.max(1, Math.ceil((supportData.total ?? rows.length) / Math.max(1, supportData.pageSize || activeFilters.pageSize)));

      return (
        <div className="space-y-4 min-w-0">
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
            <MetricCard label="Open Tickets" value={supportData.summary?.openTickets ?? 0} />
            <MetricCard label="Pending Tickets" value={supportData.summary?.pendingTickets ?? 0} tone={(supportData.summary?.pendingTickets ?? 0) > 0 ? "warn" : "good"} />
            <MetricCard label="Resolved Tickets" value={supportData.summary?.resolvedTickets ?? 0} tone="good" />
            <MetricCard label="Overdue Tickets" value={supportData.summary?.overdueTickets ?? 0} tone={(supportData.summary?.overdueTickets ?? 0) > 0 ? "warn" : "good"} />
            <MetricCard label="Total Tickets" value={supportData.summary?.totalSupportTickets ?? 0} />
            <MetricCard label="Closed Tickets" value={supportData.summary?.closedTickets ?? 0} />
            <MetricCard label="Attachments" value={supportData.summary?.totalSupportAttachments ?? 0} />
            <MetricCard label="R2 Storage (MB)" value={supportData.summary?.totalSupportStorageMb ?? 0} />
          </section>

          <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="overflow-x-auto">
              <table className="min-w-full table-fixed">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2">Ticket</th>
                    <th className="px-3 py-2">Subject</th>
                    <th className="px-3 py-2">User</th>
                    <th className="px-3 py-2">Category</th>
                    <th className="px-3 py-2">Priority</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Updated</th>
                    <th className="px-3 py-2">Open</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-3 py-4 text-sm text-slate-500">No support tickets found.</td>
                    </tr>
                  ) : (
                    rows.map((row) => (
                      <tr key={row.id} className="border-b border-slate-100 text-sm text-slate-700">
                        <td className="px-3 py-2 align-top">
                          <div className="max-w-[170px] truncate" title={row.ticketNumber}>{row.ticketNumber}</div>
                        </td>
                        <td className="px-3 py-2 align-top">
                          <div className="max-w-[260px] truncate" title={row.subject}>{row.subject}</div>
                        </td>
                        <td className="px-3 py-2 align-top">
                          <div className="max-w-[220px] truncate" title={String((row as AnyObject).user?.email ?? row.userId)}>{(row as AnyObject).user?.email ?? row.userId}</div>
                        </td>
                        <td className="px-3 py-2 align-top">{row.category}</td>
                        <td className="px-3 py-2 align-top">{row.priority}</td>
                        <td className="px-3 py-2 align-top">{row.status}</td>
                        <td className="px-3 py-2 align-top whitespace-nowrap">{String(row.updatedAt ?? "-").slice(0, 19).replace("T", " ")}</td>
                        <td className="px-3 py-2 align-top">
                          <button
                            type="button"
                            className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold"
                            onClick={() => {
                              void runSafeAction(async () => {
                                const detail = await getAdminSupportTicket(String(row.id));
                                setSupportData((prev) => ({ ...prev, selectedTicket: detail.ticket }));
                              });
                            }}
                          >
                            Detail
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600">
            <span>Page {supportData.page} of {totalPages} | Total records: {supportData.total} | Page size: {supportData.pageSize}</span>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold disabled:opacity-50"
                disabled={activeFilters.page <= 1}
                onClick={() => updateActiveFilters({ page: Math.max(1, activeFilters.page - 1) })}
              >
                Prev
              </button>
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold disabled:opacity-50"
                disabled={activeFilters.page >= totalPages}
                onClick={() => updateActiveFilters({ page: activeFilters.page + 1 })}
              >
                Next
              </button>
            </div>
          </div>

          {selected ? (
            <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 min-w-0 overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
                <div className="min-w-0">
                  <h3 className="truncate text-base font-bold text-slate-900" title={`${selected.ticketNumber} · ${selected.subject}`}>{selected.ticketNumber} · {selected.subject}</h3>
                  <p className="mt-1 truncate text-xs text-slate-600" title={`User: ${(selected as AnyObject).user?.email ?? selected.userId} · Category: ${selected.category}`}>
                    User: {(selected as AnyObject).user?.email ?? selected.userId} · Category: {selected.category}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                  <select
                    className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
                    value={selected.status}
                    onChange={(event) => {
                      const nextStatus = event.target.value;
                      void runSafeAction(async () => {
                        await updateAdminSupportStatus(selected.id, nextStatus as any);
                        const detail = await getAdminSupportTicket(selected.id);
                        const summary = await listAdminSupportSummary();
                        setSupportData((prev) => ({ ...prev, selectedTicket: detail.ticket, summary }));
                      });
                    }}
                  >
                    {["OPEN", "PENDING", "IN_PROGRESS", "WAITING_CUSTOMER", "RESOLVED", "CLOSED"].map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                  <select
                    className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
                    value={selected.priority}
                    onChange={(event) => {
                      const nextPriority = event.target.value;
                      void runSafeAction(async () => {
                        await updateAdminSupportPriority(selected.id, nextPriority as any);
                        const detail = await getAdminSupportTicket(selected.id);
                        setSupportData((prev) => ({ ...prev, selectedTicket: detail.ticket }));
                      });
                    }}
                  >
                    {["LOW", "MEDIUM", "HIGH", "URGENT"].map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                  <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={Boolean(selected.isPreserved)}
                      onChange={(event) => {
                        const nextPreserve = event.target.checked;
                        void runSafeAction(async () => {
                          await updateAdminSupportPreserve(selected.id, nextPreserve);
                          const detail = await getAdminSupportTicket(selected.id);
                          const summary = await listAdminSupportSummary();
                          setSupportData((prev) => ({ ...prev, selectedTicket: detail.ticket, summary }));
                        });
                      }}
                    />
                    Preserve ticket
                  </label>
                </div>
              </div>

              <p className="text-xs text-slate-500">
                {selected.isPreserved
                  ? "This ticket is preserved and excluded from automatic cleanup."
                  : (selected.status === "CLOSED"
                    ? `This closed ticket is eligible for cleanup after ${selected.deleteAfter ? new Date(selected.deleteAfter).toLocaleString() : "retention window"}.`
                    : "This ticket will become eligible for cleanup only when it is closed and not preserved.")}
              </p>

              <div className="space-y-2 min-w-0">
                {selected.messages?.map((message) => (
                  <article key={message.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm min-w-0">
                    <div className="flex items-center justify-between gap-2 min-w-0">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{message.authorRole}</span>
                      <span className="text-xs text-slate-500">{new Date(message.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-slate-800">{message.message}</p>
                    {message.attachments && message.attachments.length > 0 ? (
                      <div className="mt-2 space-y-1 min-w-0">
                        {message.attachments.map((attachment) => (
                          <div key={attachment.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs min-w-0">
                            <div className="min-w-0">
                              <p className="truncate" title={attachment.originalName}>{attachment.originalName}</p>
                              <p className="text-slate-500">{Math.round((attachment.sizeBytes ?? 0) / 1024)} KB</p>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <button
                                type="button"
                                className="text-brand hover:underline"
                                onClick={() => void viewSupportAttachmentInNewTab(selected.id, attachment.id)}
                              >
                                View
                              </button>
                              <button
                                type="button"
                                className="text-brand hover:underline"
                                onClick={() => void downloadSupportAttachment(selected.id, attachment.id, attachment.originalName)}
                              >
                                Download
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>

              <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
                <label className="text-xs font-semibold text-slate-600">Reply as admin</label>
                <textarea
                  className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm"
                  rows={4}
                  value={supportData.replyText}
                  onChange={(event) => setSupportData((prev) => ({ ...prev, replyText: event.target.value }))}
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    className="rounded-lg border border-emerald-300 bg-emerald-100 px-3 py-1.5 text-xs font-semibold text-emerald-900 disabled:opacity-50"
                    disabled={!supportData.replyText.trim()}
                    onClick={() => {
                      void runSafeAction(async () => {
                        await replyAdminSupportTicket(selected.id, supportData.replyText.trim());
                        const detail = await getAdminSupportTicket(selected.id);
                        setSupportData((prev) => ({ ...prev, selectedTicket: detail.ticket, replyText: "" }));
                      });
                    }}
                  >
                    Send Reply
                  </button>
                </div>
              </div>
            </section>
          ) : null}
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

    if (active === "payment") {
      const persisted = health?.settings as AnyObject | null;
      const settings = (settingsDraft ?? persisted) as AnyObject | null;
      if (!settings) return <p className="text-sm text-slate-500">Payment settings are unavailable.</p>;

      function PaymentCard({ optKey, title, fields, qrUrl, qrFile, qrInputRef, setQrFile }: {
        optKey: "jazzcash" | "easypaisa" | "bank";
        title: string;
        fields: Array<{ label: string; field: string; placeholder: string }>;
        qrUrl?: string | null;
        qrFile: File | null;
        qrInputRef: React.RefObject<HTMLInputElement>;
        setQrFile: (f: File | null) => void;
      }) {
        const isEditing = editingPaymentOption === optKey;
        const previewSrc = qrFile ? URL.createObjectURL(qrFile) : qrUrl ? apiUrl(qrUrl) : null;
        return (
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-slate-800">{title}</h4>
              {!isEditing ? (
                <div className="flex gap-2">
                  <button type="button" className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold" onClick={() => { setEditingPaymentOption(optKey); }}>Edit</button>
                  <button type="button" className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700" onClick={() => {
                    if (!window.confirm(`Delete ${title} payment option?`)) return;
                    const patch: AnyObject = {};
                    if (optKey === "jazzcash") { patch.jazzcashTitle = ""; patch.jazzcashNumber = ""; }
                    if (optKey === "easypaisa") { patch.easypaisaTitle = ""; patch.easypaisaNumber = ""; }
                    if (optKey === "bank") { patch.bankName = ""; patch.bankTitle = ""; patch.bankAccountNumber = ""; patch.bankIban = ""; }
                    const next = { ...(settings ?? {}), ...patch };
                    void runSafeAction(async () => { await saveBillingDraft(next); setSettingsDraft(next); });
                  }}>Delete</button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button type="button" className="rounded-lg border border-emerald-300 px-3 py-1.5 text-xs font-semibold text-emerald-800" onClick={() => {
                    void runSafeAction(async () => {
                      const qrFiles = optKey === "jazzcash" ? { jazzcash: qrFile } : optKey === "easypaisa" ? { easypaisa: qrFile } : { bank: qrFile };
                      await saveBillingDraft(settings ?? {}, qrFiles);
                      setQrFile(null);
                      setEditingPaymentOption(null);
                    });
                  }}>Save</button>
                  <button type="button" className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold" onClick={() => { setSettingsDraft(persisted); setQrFile(null); setEditingPaymentOption(null); }}>Cancel</button>
                </div>
              )}
            </div>
            {isEditing ? (
              <div className="grid gap-2">
                {fields.map(({ label, field, placeholder }) => (
                  <label key={field} className="text-xs font-semibold text-slate-600">
                    {label}
                    <input
                      className="mt-1 w-full rounded border border-slate-200 px-2 py-1.5 text-xs"
                      value={String((settings as AnyObject)[field] ?? "")}
                      onChange={(e) => setSettingsDraft((prev) => ({ ...(prev ?? settings), [field]: e.target.value }))}
                      placeholder={placeholder}
                    />
                  </label>
                ))}
                <label className="text-xs font-semibold text-slate-600">
                  QR Image (optional)
                  <input
                    ref={qrInputRef}
                    type="file"
                    accept="image/*"
                    className="mt-1 block w-full text-xs"
                    onChange={(e) => setQrFile(e.target.files?.[0] ?? null)}
                  />
                </label>
                {previewSrc ? (
                  <img src={previewSrc} alt="QR preview" className="mt-1 h-24 w-24 rounded border border-slate-200 object-contain" />
                ) : null}
              </div>
            ) : (
              <div className="space-y-1 text-xs text-slate-600">
                {fields.map(({ label, field }) => (
                  <div key={field}><span className="font-semibold">{label}:</span> {String((settings as AnyObject)[field] ?? "-") || "-"}</div>
                ))}
                {previewSrc ? (
                  <div className="mt-2">
                    <p className="mb-1 text-xs font-semibold text-slate-500">QR Image</p>
                    <img src={previewSrc} alt="QR code" className="h-24 w-24 rounded border border-slate-200 object-contain" />
                  </div>
                ) : <p className="mt-1 text-slate-400">No QR image uploaded.</p>}
              </div>
            )}
          </div>
        );
      }

      return (
        <div className="space-y-4">
          <p className="text-xs text-slate-500">Manage payment options shown to users during checkout. Edit, upload QR, or delete each option below.</p>
          <PaymentCard
            optKey="jazzcash"
            title="JazzCash"
            fields={[
              { label: "Account Title", field: "jazzcashTitle", placeholder: "e.g. Muhammad Ali" },
              { label: "Mobile / Account Number", field: "jazzcashNumber", placeholder: "e.g. 03001234567" },
            ]}
            qrUrl={settings.jazzcashQrUrl}
            qrFile={jazzcashQrFile}
            qrInputRef={jazzcashQrInputRef}
            setQrFile={setJazzcashQrFile}
          />
          <PaymentCard
            optKey="easypaisa"
            title="EasyPaisa"
            fields={[
              { label: "Account Title", field: "easypaisaTitle", placeholder: "e.g. Muhammad Ali" },
              { label: "Mobile / Account Number", field: "easypaisaNumber", placeholder: "e.g. 03001234567" },
            ]}
            qrUrl={settings.easypaisaQrUrl}
            qrFile={easypaisaQrFile}
            qrInputRef={easypaisaQrInputRef}
            setQrFile={setEasypaisaQrFile}
          />
          <PaymentCard
            optKey="bank"
            title="Bank Transfer"
            fields={[
              { label: "Bank Name", field: "bankName", placeholder: "e.g. HBL" },
              { label: "Account Title", field: "bankTitle", placeholder: "e.g. Muhammad Ali" },
              { label: "Account Number", field: "bankAccountNumber", placeholder: "e.g. 01234567890123" },
              { label: "IBAN", field: "bankIban", placeholder: "e.g. PK36SCBL0000001123456702" },
            ]}
            qrUrl={settings.bankQrUrl}
            qrFile={bankQrFile}
            qrInputRef={bankQrInputRef}
            setQrFile={setBankQrFile}
          />
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
                await saveBillingDraft({ ...settings, exemptFileNames: nextList });
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
