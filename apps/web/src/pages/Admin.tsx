import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Card from "../components/Card";
import { api, apiUrl, buildAuthenticatedApiUrl } from "../lib/api";
import { TEMPLATE_DESIGNER_ENABLED } from "../lib/featureFlags";
import { BodyText, CardTitle, PageShell, PageTitle, TableWrap } from "../components/ui/PageSystem";

type Plan = {
  id: string;
  name: string;
  priceCents: number;
  fullPriceCents?: number;
  discountPriceCents?: number;
  discountPct?: number;
  isSuspended?: boolean;
  unitsIncluded?: number;
  labelsIncluded?: number;
  trackingIncluded?: number;
  moneyOrdersIncluded?: number;
  complaintsIncluded?: number;
  dailyComplaintLimit?: number;
  monthlyComplaintLimit?: number;
  monthlyLabelLimit: number;
  monthlyTrackingLimit: number;
  createdAt: string;
};
type AdminUser = {
  id: string;
  email: string;
  role: "USER" | "ADMIN";
  suspended: boolean;
  createdAt: string;
  companyName?: string | null;
  address?: string | null;
  contactNumber?: string | null;
  originCity?: string | null;
  extraLabelCredits: number;
  extraTrackingCredits: number;
  subscription?: {
    id: string;
    status: string;
    currentPeriodStart: string;
    currentPeriodEnd: string;
    plan: Plan;
  } | null;
  usage: { month: string; labelsGenerated: number; labelsQueued: number; trackingGenerated: number; trackingQueued: number };
  balances: { labelLimit: number; trackingLimit: number; labelsRemaining: number; trackingRemaining: number };
};
type UsageRow = { id: string; month: string; labelsGenerated: number; labelsQueued?: number; trackingGenerated?: number; trackingQueued?: number; user: { email: string } };
type ShipmentRow = {
  id: string;
  trackingNumber: string;
  shipmentType?: string | null;
  status?: string | null;
  city?: string | null;
  adminCode?: string | null;
  updatedAt: string;
  user: { id: string; email: string };
};

type ManualPaymentRow = {
  id: string;
  status: string;
  paymentMethod: string;
  transactionId: string;
  amountCents: number;
  currency: string;
  notes?: string | null;
  verifiedBy?: string | null;
  verifiedAt?: string | null;
  createdAt: string;
  plan: { id: string; name: string; priceCents: number };
  user: { id: string; email: string; companyName?: string | null };
  invoice?: { id: string; invoiceNumber: string; status: string; amountCents: number } | null;
  screenshotUrl?: string | null;
  proofFileName?: string | null;
  proofMimeType?: string | null;
};

type PlanForm = {
  name: string;
  fullPriceCents: number;
  discountPriceCents: number;
  totalSharedUnits: number;
  dailyComplaintLimit: number;
  monthlyComplaintLimit: number;
  isSuspended: boolean;
};

type InvoiceRow = {
  id: string;
  invoiceNumber: string;
  status: string; // OPEN | PAID
  amountCents: number;
  currency: string;
  issuedAt: string;
  paidAt?: string | null;
  createdAt: string;
  plan: { id: string; name: string };
  user: { id: string; email: string; companyName?: string | null };
  manualPayments: { id: string; status: string; transactionId: string; paymentMethod: string; createdAt: string }[];
};

type BillingSettings = {
  jazzcashNumber: string;
  jazzcashTitle: string;
  jazzcashQrUrl: string | null;
  easypaisaNumber: string;
  easypaisaTitle: string;
  easypaisaQrUrl: string | null;
  standardPrice: number;
  businessPrice: number;
  exemptFileNames: string[];
};

type SectionKey = "overview" | "plans" | "customers" | "usage" | "shipments" | "payments" | "invoices" | "billing";

const formatPKR = new Intl.NumberFormat("en-PK", {
  style: "currency",
  currency: "PKR",
  currencyDisplay: "code",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export default function Admin() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usage, setUsage] = useState<UsageRow[]>([]);
  const [shipments, setShipments] = useState<ShipmentRow[]>([]);
  const [manualPayments, setManualPayments] = useState<ManualPaymentRow[]>([]);
  const [manualPaymentFilter, setManualPaymentFilter] = useState<"PENDING" | "APPROVED" | "REJECTED" | "ALL">("PENDING");
  const [manualPaymentsPage, setManualPaymentsPage] = useState(1);
  const [manualPaymentAction, setManualPaymentAction] = useState<Record<string, boolean>>({});
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [invoiceFilter, setInvoiceFilter] = useState<"" | "OPEN" | "PAID">("OPEN");
  const [invoicesPage, setInvoicesPage] = useState(1);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [billingSettings, setBillingSettings] = useState<BillingSettings | null>(null);
  const [billingDraft, setBillingDraft] = useState({
    jazzcashNumber: "",
    jazzcashTitle: "",
    easypaisaNumber: "",
    easypaisaTitle: "",
    standardPrice: "",
    businessPrice: "",
    exemptFileNamesText: "",
  });
  const [jazzcashQrFile, setJazzcashQrFile] = useState<File | null>(null);
  const [easypaisaQrFile, setEasypaisaQrFile] = useState<File | null>(null);
  const [clearJazzcashQr, setClearJazzcashQr] = useState(false);
  const [clearEasypaisaQr, setClearEasypaisaQr] = useState(false);
  const [savingBillingSettings, setSavingBillingSettings] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  });
  const [planDraft, setPlanDraft] = useState<PlanForm>({
    name: "Business Plan",
    fullPriceCents: 250000,
    discountPriceCents: 250000,
    totalSharedUnits: 3000,
    dailyComplaintLimit: 10,
    monthlyComplaintLimit: 300,
    isSuspended: false,
  });
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [editingPlanDraft, setEditingPlanDraft] = useState<PlanForm | null>(null);
  const [savingPlanEdit, setSavingPlanEdit] = useState(false);
  const [proofModal, setProofModal] = useState<{ open: boolean; url: string | null; mimeType: string | null; fileName: string | null }>({
    open: false,
    url: null,
    mimeType: null,
    fileName: null,
  });
  const [creditDrafts, setCreditDrafts] = useState<Record<string, { labelCredits: string; trackingCredits: string; planId: string }>>({});
  const [section, setSection] = useState<SectionKey>("overview");
  const [previewUserId, setPreviewUserId] = useState<string | null>(null);
  const adminTablePageSize = 20;

  function draftFor(userId: string, currentPlanId?: string | null) {
    return creditDrafts[userId] ?? { labelCredits: "", trackingCredits: "", planId: currentPlanId ?? "" };
  }

  function toPlanPayload(draft: PlanForm) {
    const fullPriceCents = Math.max(0, Number(draft.fullPriceCents || 0));
    const discountPriceCents = Math.max(0, Number(draft.discountPriceCents || fullPriceCents));
    const totalSharedUnits = Math.max(1, Number(draft.totalSharedUnits || 1));
    const dailyComplaintLimit = Math.max(0, Number(draft.dailyComplaintLimit || 0));
    const monthlyComplaintLimit = Math.max(dailyComplaintLimit, Number(draft.monthlyComplaintLimit || 0));

    return {
      name: draft.name,
      fullPriceCents,
      discountPriceCents,
      unitsIncluded: totalSharedUnits,
      labelsIncluded: totalSharedUnits,
      trackingIncluded: totalSharedUnits,
      moneyOrdersIncluded: totalSharedUnits,
      complaintsIncluded: monthlyComplaintLimit,
      dailyComplaintLimit,
      monthlyComplaintLimit,
      monthlyLabelLimit: totalSharedUnits,
      monthlyTrackingLimit: totalSharedUnits,
      isSuspended: Boolean(draft.isSuspended),
    };
  }

  function updateDraft(userId: string, patch: Partial<{ labelCredits: string; trackingCredits: string; planId: string }>, currentPlanId?: string | null) {
    setCreditDrafts((prev) => ({
      ...prev,
      [userId]: { ...draftFor(userId, currentPlanId), ...patch },
    }));
  }

  async function refresh() {
    const [p, u, us, sh, bs] = await Promise.all([
      api<{ plans: Plan[] }>("/api/admin/plans"),
      api<{ users: AdminUser[] }>("/api/admin/users"),
      api<{ usage: UsageRow[] }>(`/api/admin/usage?month=${encodeURIComponent(month)}`),
      api<{ shipments: ShipmentRow[] }>("/api/admin/shipments?limit=50"),
      api<{ settings: BillingSettings }>("/api/admin/billing-settings"),
    ]);
    setPlans(p.plans.filter((plan) => !["Starter Plan", "Pro Plan"].includes(plan.name)));
    setUsers(u.users);
    setUsage(us.usage);
    setShipments(sh.shipments);
    setBillingSettings(bs.settings);
    setBillingDraft({
      jazzcashNumber: bs.settings.jazzcashNumber,
      jazzcashTitle: bs.settings.jazzcashTitle,
      easypaisaNumber: bs.settings.easypaisaNumber,
      easypaisaTitle: bs.settings.easypaisaTitle,
      standardPrice: String(bs.settings.standardPrice),
      businessPrice: String(bs.settings.businessPrice),
      exemptFileNamesText: (bs.settings.exemptFileNames ?? []).join("\n"),
    });
    setClearJazzcashQr(false);
    setClearEasypaisaQr(false);
    setJazzcashQrFile(null);
    setEasypaisaQrFile(null);
  }

  async function updatePlan(plan: Plan) {
    setEditingPlanId(plan.id);
    setEditingPlanDraft({
      name: plan.name,
      fullPriceCents: plan.fullPriceCents ?? plan.priceCents,
      discountPriceCents: plan.discountPriceCents ?? plan.priceCents,
      totalSharedUnits: plan.unitsIncluded ?? plan.monthlyLabelLimit,
      dailyComplaintLimit: plan.dailyComplaintLimit ?? 0,
      monthlyComplaintLimit: plan.monthlyComplaintLimit ?? 0,
      isSuspended: Boolean(plan.isSuspended),
    });
  }

  async function savePlanEdits() {
    if (!editingPlanId || !editingPlanDraft) return;
    setSavingPlanEdit(true);
    try {
      await api(`/api/admin/plans/${editingPlanId}`, {
        method: "PUT",
        body: JSON.stringify(toPlanPayload(editingPlanDraft)),
      });
      setEditingPlanId(null);
      setEditingPlanDraft(null);
      await refresh();
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Failed to update plan");
    } finally {
      setSavingPlanEdit(false);
    }
  }

  async function toggleSuspendPlan(plan: Plan) {
    try {
      await api(`/api/admin/plans/${plan.id}/suspend`, {
        method: "POST",
        body: JSON.stringify({ isSuspended: !plan.isSuspended }),
      });
      await refresh();
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Failed to suspend plan");
    }
  }

  async function deletePlan(plan: Plan) {
    if (!confirm(`Delete ${plan.name}?`)) return;
    try {
      await api(`/api/admin/plans/${plan.id}`, { method: "DELETE" });
      await refresh();
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Failed to delete plan");
    }
  }

  function openProofModal(payment: ManualPaymentRow) {
    if (!payment.screenshotUrl) return;
    setProofModal({
      open: true,
      url: buildAuthenticatedApiUrl(payment.screenshotUrl),
      mimeType: payment.proofMimeType ?? null,
      fileName: payment.proofFileName ?? null,
    });
  }

  async function saveBillingSettings() {
    if (!billingDraft.jazzcashNumber.trim() || !billingDraft.jazzcashTitle.trim() || !billingDraft.easypaisaNumber.trim() || !billingDraft.easypaisaTitle.trim()) {
      setErr("Wallet numbers and titles are required.");
      return;
    }
    if (!billingDraft.standardPrice.trim() || !billingDraft.businessPrice.trim()) {
      setErr("Standard and Business prices are required.");
      return;
    }

    setSavingBillingSettings(true);
    setErr(null);
    try {
      const formData = new FormData();
      formData.append("jazzcashNumber", billingDraft.jazzcashNumber.trim());
      formData.append("jazzcashTitle", billingDraft.jazzcashTitle.trim());
      formData.append("easypaisaNumber", billingDraft.easypaisaNumber.trim());
      formData.append("easypaisaTitle", billingDraft.easypaisaTitle.trim());
      formData.append("standardPrice", billingDraft.standardPrice.trim());
      formData.append("businessPrice", billingDraft.businessPrice.trim());
      formData.append(
        "exemptFileNames",
        JSON.stringify(
          billingDraft.exemptFileNamesText
            .split(/\r?\n/)
            .map((entry) => entry.trim())
            .filter((entry) => entry.length > 0),
        ),
      );
      if (jazzcashQrFile) formData.append("jazzcashQr", jazzcashQrFile);
      if (easypaisaQrFile) formData.append("easypaisaQr", easypaisaQrFile);
      if (clearJazzcashQr) formData.append("clearJazzcashQr", "true");
      if (clearEasypaisaQr) formData.append("clearEasypaisaQr", "true");

      const json = await api<{ settings?: BillingSettings }>("/api/admin/billing-settings", {
        method: "PUT",
        body: formData,
      });

      if (json.settings) {
        setBillingSettings(json.settings);
        setBillingDraft({
          jazzcashNumber: json.settings.jazzcashNumber,
          jazzcashTitle: json.settings.jazzcashTitle,
          easypaisaNumber: json.settings.easypaisaNumber,
          easypaisaTitle: json.settings.easypaisaTitle,
          standardPrice: String(json.settings.standardPrice),
          businessPrice: String(json.settings.businessPrice),
          exemptFileNamesText: (json.settings.exemptFileNames ?? []).join("\n"),
        });
      }
      setJazzcashQrFile(null);
      setEasypaisaQrFile(null);
      setClearJazzcashQr(false);
      setClearEasypaisaQr(false);
      await refresh();
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Failed to save billing settings");
    } finally {
      setSavingBillingSettings(false);
    }
  }

  async function refreshManualPayments(filter: "PENDING" | "APPROVED" | "REJECTED" | "ALL" = manualPaymentFilter) {
    const cacheKey = `admin.manualPayments.${filter}.v1`;
    const cachedRaw = window.localStorage.getItem(cacheKey);
    if (cachedRaw) {
      try {
        const cached = JSON.parse(cachedRaw) as { requests: ManualPaymentRow[] };
        if (Array.isArray(cached?.requests)) setManualPayments(cached.requests);
      } catch {
        // Ignore malformed local cache.
      }
    }
    const statusParam = filter === "ALL" ? "" : `?status=${filter}`;
    const data = await api<{ requests: ManualPaymentRow[] }>(`/api/admin/manual-payments${statusParam}`);
    setManualPayments(data.requests);
    window.localStorage.setItem(cacheKey, JSON.stringify({ requests: data.requests, ts: Date.now() }));
  }

  async function refreshInvoices(filter: "" | "OPEN" | "PAID" = invoiceFilter) {
    const cacheKey = `admin.invoices.${filter || "ALL"}.v1`;
    setLoadingInvoices(true);
    const cachedRaw = window.localStorage.getItem(cacheKey);
    if (cachedRaw) {
      try {
        const cached = JSON.parse(cachedRaw) as { invoices: InvoiceRow[] };
        if (Array.isArray(cached?.invoices)) setInvoices(cached.invoices);
      } catch {
        // Ignore malformed local cache.
      }
    }
    try {
      const statusParam = filter ? `?status=${filter}` : "";
      const data = await api<{ invoices: InvoiceRow[] }>(`/api/admin/invoices${statusParam}`);
      setInvoices(data.invoices);
      window.localStorage.setItem(cacheKey, JSON.stringify({ invoices: data.invoices, ts: Date.now() }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load invoices");
    } finally {
      setLoadingInvoices(false);
    }
  }

  async function handleApprovePayment(id: string) {
    setManualPaymentAction((prev) => ({ ...prev, [id]: true }));
    try {
      await api(`/api/admin/manual-payments/${id}/approve`, { method: "POST" });
      await refreshManualPayments();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to approve");
    } finally {
      setManualPaymentAction((prev) => ({ ...prev, [id]: false }));
    }
  }

  async function handleRejectPayment(id: string) {
    setManualPaymentAction((prev) => ({ ...prev, [id]: true }));
    try {
      await api(`/api/admin/manual-payments/${id}/reject`, { method: "POST", body: JSON.stringify({}) });
      await refreshManualPayments();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to reject");
    } finally {
      setManualPaymentAction((prev) => ({ ...prev, [id]: false }));
    }
  }

  useEffect(() => {
    refresh().catch((e) => setErr(e instanceof Error ? e.message : "Failed"));
  }, [month]);

  useEffect(() => {
    if (section === "payments") {
      refreshManualPayments(manualPaymentFilter).catch((e) => setErr(e instanceof Error ? e.message : "Failed"));
      setManualPaymentsPage(1);
    }
    if (section === "invoices") {
      refreshInvoices(invoiceFilter).catch((e) => setErr(e instanceof Error ? e.message : "Failed"));
      setInvoicesPage(1);
    }
  }, [section, manualPaymentFilter, invoiceFilter]);

  const totals = useMemo(
    () => ({
      customers: users.length,
      unitsRemaining: users.reduce((sum, user) => sum + user.balances.labelsRemaining, 0),
    }),
    [users],
  );

  const previewUser = users.find((u) => u.id === previewUserId) ?? null;
  const totalManualPages = Math.max(1, Math.ceil(manualPayments.length / adminTablePageSize));
  const totalInvoicePages = Math.max(1, Math.ceil(invoices.length / adminTablePageSize));
  const paginatedManualPayments = useMemo(() => {
    const start = (manualPaymentsPage - 1) * adminTablePageSize;
    return manualPayments.slice(start, start + adminTablePageSize);
  }, [manualPayments, manualPaymentsPage]);
  const paginatedInvoices = useMemo(() => {
    const start = (invoicesPage - 1) * adminTablePageSize;
    return invoices.slice(start, start + adminTablePageSize);
  }, [invoices, invoicesPage]);

  useEffect(() => {
    if (manualPaymentsPage > totalManualPages) setManualPaymentsPage(totalManualPages);
  }, [manualPaymentsPage, totalManualPages]);

  useEffect(() => {
    if (invoicesPage > totalInvoicePages) setInvoicesPage(totalInvoicePages);
  }, [invoicesPage, totalInvoicePages]);

  return (
    <PageShell className="space-y-3">
      <Card className="min-w-0 w-full overflow-hidden border-slate-200 bg-white p-5 shadow-sm md:p-6">
        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
          <div>
            <CardTitle>Admin Control Room</CardTitle>
            <BodyText className="mt-2 max-w-2xl">Manage approvals, balances, plan assignment, and shipment overrides from one structured admin workspace.</BodyText>
            {err ? <div className="mt-4 rounded-3xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800">{err}</div> : null}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Card className="p-5"><div className="text-sm text-slate-500">Customers</div><div className="mt-2 text-3xl font-semibold text-slate-950">{totals.customers}</div></Card>
            <Card className="p-5"><div className="text-sm text-slate-500">Total Units Remaining</div><div className="mt-2 text-3xl font-semibold text-slate-950">{totals.unitsRemaining.toLocaleString()}</div></Card>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          {[
            ["overview", "Overview"],
            ["plans", "Plans"],
            ["customers", "Customers"],
            ["usage", "Usage"],
            ["shipments", "Shipments"],
            ["payments", "Wallet Payments"],
            ["invoices", "Invoices"],
            ["billing", "Billing Settings"],
          ].map(([key, label]) => (
            <button
              key={key}
              className={`rounded-full px-4 py-2.5 text-sm font-medium transition-all ${section === key ? "bg-brand text-white shadow-glow" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
              onClick={() => setSection(key as SectionKey)}
            >
              {label}
            </button>
          ))}
        </div>
      </Card>

      {section === "overview" ? (
        <div className="grid min-w-0 w-full gap-5 overflow-hidden md:grid-cols-3">
          <Card className="min-w-0 w-full overflow-hidden p-6"><div className="text-sm text-slate-500">Active Customers</div><div className="mt-2 text-3xl font-semibold text-slate-950">{users.filter((u) => !u.suspended).length}</div></Card>
          <Card className="min-w-0 w-full overflow-hidden p-6"><div className="text-sm text-slate-500">Suspended</div><div className="mt-2 text-3xl font-semibold text-slate-950">{users.filter((u) => u.suspended).length}</div></Card>
          <Card className="min-w-0 w-full overflow-hidden p-6"><div className="text-sm text-slate-500">Business Plan Users</div><div className="mt-2 text-3xl font-semibold text-slate-950">{users.filter((u) => (u.subscription?.plan?.name ?? "") === "Business Plan").length}</div></Card>
          <Card className="min-w-0 w-full overflow-hidden p-6 md:col-span-3">
            <div className="text-sm text-slate-500">Admin Generation</div>
            <div className="mt-2 text-lg font-semibold text-slate-950">Generate labels and money orders from admin portal</div>
            <div className="mt-1 text-sm text-slate-600">Use upload or manual entry mode from dedicated admin pages.</div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button className="rounded-2xl bg-brand px-4 py-2 text-sm font-medium text-white" onClick={() => navigate("/admin/generate-labels")}>Generate Labels</button>
              <button className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700" onClick={() => navigate("/admin/generate-money-orders")}>Generate Money Order</button>
              <button className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700" onClick={() => navigate("/admin/complaint-monitor")}>Complaint Monitor</button>
            </div>
          </Card>
          {TEMPLATE_DESIGNER_ENABLED ? (
            <Card className="min-w-0 w-full overflow-hidden p-6 md:col-span-3">
              <div className="text-sm text-slate-500">Admin Tools</div>
              <div className="mt-2 text-lg font-semibold text-slate-950">Money Order Designer</div>
              <div className="mt-1 text-sm text-slate-600">Create and manage isolated money order template layouts for internal preview mode.</div>
              <button className="mt-4 rounded-2xl bg-brand px-4 py-2 text-sm font-medium text-white" onClick={() => navigate("/admin/template-designer")}>Open Money Order Designer</button>
            </Card>
          ) : null}
        </div>
      ) : null}

      {section === "plans" ? (
        <Card className="min-w-0 w-full overflow-hidden">
          <div className="flex items-center justify-between px-6 py-5">
            <div>
              <div className="text-xl font-medium text-gray-900">Plans</div>
              <div className="mt-1 text-sm text-gray-600">Single-unit model: one action (label, tracking, MO generation) consumes one unit.</div>
            </div>
            <button className="rounded-2xl border bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-lg hover:bg-gray-50" onClick={() => refresh()}>Refresh</button>
          </div>
          <form
            className="border-t bg-slate-50 px-6 py-5"
            onSubmit={async (e) => {
              e.preventDefault();
              setErr(null);
              try {
                await api("/api/admin/plans", {
                  method: "POST",
                  body: JSON.stringify(toPlanPayload(planDraft)),
                });
                await refresh();
              } catch (error) {
                setErr(error instanceof Error ? error.message : "Failed to create plan");
              }
            }}
          >
            <div className="mx-auto w-full max-w-3xl space-y-3">
              <label className="block text-sm font-medium text-slate-700">
                Plan name
                <input className="field-input mt-1 w-full" value={planDraft.name} onChange={(e) => setPlanDraft((prev) => ({ ...prev, name: e.target.value }))} placeholder="Business Plan" />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Price (paisa)
                <input className="field-input mt-1 w-full" value={planDraft.fullPriceCents} onChange={(e) => setPlanDraft((prev) => ({ ...prev, fullPriceCents: Number(e.target.value || 0) }))} placeholder="250000" type="number" />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Discount price (optional, paisa)
                <input className="field-input mt-1 w-full" value={planDraft.discountPriceCents} onChange={(e) => setPlanDraft((prev) => ({ ...prev, discountPriceCents: Number(e.target.value || 0) }))} placeholder="250000" type="number" />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Total shared units
                <input className="field-input mt-1 w-full" value={planDraft.totalSharedUnits} onChange={(e) => setPlanDraft((prev) => ({ ...prev, totalSharedUnits: Number(e.target.value || 0) }))} placeholder="3000" type="number" min={1} />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Daily complaint limit
                <input className="field-input mt-1 w-full" value={planDraft.dailyComplaintLimit} onChange={(e) => setPlanDraft((prev) => ({ ...prev, dailyComplaintLimit: Number(e.target.value || 0) }))} placeholder="10" type="number" />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Monthly complaint limit
                <input className="field-input mt-1 w-full" value={planDraft.monthlyComplaintLimit} onChange={(e) => setPlanDraft((prev) => ({ ...prev, monthlyComplaintLimit: Number(e.target.value || 0) }))} placeholder="300" type="number" />
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={planDraft.isSuspended} onChange={(e) => setPlanDraft((prev) => ({ ...prev, isSuspended: e.target.checked }))} />
                Suspended
              </label>
              <div className="pt-2">
                <button className="rounded-2xl bg-brand px-4 py-2 text-sm font-medium text-white shadow-lg hover:bg-brand-dark">Create</button>
              </div>
            </div>
          </form>
          <div className="grid gap-4 border-t bg-white p-6 md:grid-cols-2">
            {plans.map((plan) => (
              <Card key={plan.id} className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="text-lg font-semibold text-slate-950">{plan.name}</div>
                  <span className={`rounded-full px-2 py-1 text-xs font-semibold ${plan.isSuspended ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>
                    {plan.isSuspended ? "Suspended" : "Active"}
                  </span>
                </div>
                <div className="mt-2 text-sm text-slate-600">
                  {formatPKR.format(Math.round((plan.discountPriceCents ?? plan.priceCents) / 100)).replace(/\u00A0/g, " ")} / cycle
                </div>
                {(plan.discountPct ?? 0) > 0 ? (
                  <div className="mt-1 text-xs text-slate-500">Full: {formatPKR.format(Math.round((plan.fullPriceCents ?? plan.priceCents) / 100)).replace(/\u00A0/g, " ")} ({plan.discountPct}% off)</div>
                ) : null}
                <div className="mt-4 text-sm text-slate-700">Total Shared Units: {(plan.unitsIncluded ?? plan.monthlyLabelLimit).toLocaleString()}</div>
                <div className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Services Included</div>
                <div className="mt-1 text-sm text-slate-700">✔ Labels</div>
                <div className="mt-1 text-sm text-slate-700">✔ Tracking</div>
                <div className="mt-1 text-sm text-slate-700">✔ Money Orders</div>
                <div className="mt-1 text-sm text-slate-700">✔ Complaints</div>
                <div className="mt-2 text-sm text-slate-700">Complaint Cost: 10 Units Each</div>
                <div className="mt-1 text-sm text-slate-700">Complaint Limits: {(plan.dailyComplaintLimit ?? 0).toLocaleString()}/day, {(plan.monthlyComplaintLimit ?? 0).toLocaleString()}/month</div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700" onClick={() => updatePlan(plan)}>Edit</button>
                  <button className={`rounded-xl px-3 py-1.5 text-xs font-medium ${plan.isSuspended ? "border border-emerald-200 bg-emerald-50 text-emerald-700" : "border border-amber-200 bg-amber-50 text-amber-700"}`} onClick={() => toggleSuspendPlan(plan)}>{plan.isSuspended ? "Unsuspend" : "Suspend"}</button>
                  <button className="rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700" onClick={() => deletePlan(plan)}>Delete</button>
                </div>
              </Card>
            ))}
          </div>
        </Card>
      ) : null}

      {section === "customers" ? (
        <div className="min-w-0 w-full space-y-4 overflow-hidden">
          <div>
            <div className="text-xl font-semibold text-slate-950">Customers</div>
            <div className="mt-1 text-sm text-slate-600">Open a customer preview to manage status, balances, credits, suspension, and manual payment confirmation.</div>
          </div>
          <div className="grid min-w-0 w-full gap-5 overflow-hidden xl:grid-cols-2">
            {users.map((user) => (
              <Card key={user.id} className="min-w-0 w-full overflow-hidden p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold text-slate-950">{user.email}</div>
                    <div className="mt-1 text-sm text-slate-600">{user.subscription?.plan?.name ?? "No plan"}</div>
                  </div>
                  <button className="rounded-2xl border border-[#E5E7EB] bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-[#F8FAF9]" onClick={() => setPreviewUserId(user.id)}>Preview</button>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Card className="p-4"><div className="text-xs text-slate-500">Status</div><div className="mt-1 text-lg font-semibold text-slate-900">{user.suspended ? "Suspended" : "Active"}</div></Card>
                  <Card className="p-4"><div className="text-xs text-slate-500">Remaining Units</div><div className="mt-1 text-lg font-semibold text-slate-900">{user.balances.labelsRemaining.toLocaleString()}</div></Card>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button className="rounded-2xl border border-[#E5E7EB] bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-[#F8FAF9]" onClick={() => setPreviewUserId(user.id)}>View</button>
                  <button className={`rounded-2xl px-3 py-2 text-xs font-medium ${user.suspended ? "border border-emerald-200 bg-emerald-50 text-emerald-700" : "border border-red-200 bg-red-50 text-red-700"}`} onClick={async () => { try { await api(`/api/admin/users/${user.id}/${user.suspended ? "unsuspend" : "suspend"}`, { method: "POST" }); await refresh(); } catch (error) { setErr(error instanceof Error ? error.message : "Failed"); } }}>{user.suspended ? "Activate" : "Suspend"}</button>
                  <button className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-100" onClick={async () => { if (!confirm(`Delete user ${user.email}?`)) return; try { await api(`/api/admin/users/${user.id}`, { method: "DELETE" }); if (previewUserId === user.id) setPreviewUserId(null); await refresh(); } catch (error) { setErr(error instanceof Error ? error.message : "Failed to delete user"); } }}>Delete</button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      ) : null}

      {section === "usage" ? (
        <Card className="min-w-0 w-full overflow-hidden p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-xl font-medium text-gray-900">Usage</div>
              <p className="mt-1 text-sm text-gray-600">Monthly shared unit usage per customer.</p>
            </div>
            <div className="flex items-end gap-2">
              <label className="text-sm">
                <div className="mb-1 font-medium text-gray-900">Month (UTC)</div>
                <input className="field-input" value={month} onChange={(e) => setMonth(e.target.value)} />
              </label>
              <button className="h-10 rounded-2xl border bg-white px-3 text-sm font-medium text-gray-700 shadow-lg hover:bg-gray-50" onClick={() => refresh()}>Refresh</button>
            </div>
          </div>
          <TableWrap className="mt-4">
            <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
              <thead className="bg-gray-50">
                <tr className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-2">User</th>
                  <th className="px-4 py-2 text-right">Units Used</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {usage.map((row) => (
                  <tr key={row.id} className="transition-colors hover:bg-gray-50/60">
                    <td className="px-4 py-2 text-gray-900">{row.user.email}</td>
                    <td className="px-4 py-2 text-right text-gray-700">{(row.labelsGenerated + (row.labelsQueued ?? 0)).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Card>
      ) : null}

      {section === "shipments" ? (
        <Card className="min-w-0 w-full overflow-hidden">
          <div className="border-b px-6 py-4">
            <div className="text-xl font-medium text-gray-900">Shipments</div>
            <div className="mt-1 text-sm text-gray-600">Override shipment metadata and admin code.</div>
          </div>
          <TableWrap>
            <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
              <thead className="bg-gray-50">
                <tr className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Tracking</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">City</th>
                  <th className="px-4 py-3">Admin Code</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {shipments.map((shipment) => (
                  <tr key={shipment.id} className="transition-colors hover:bg-gray-50/60">
                    <td className="px-4 py-3 text-gray-900">{shipment.user.email}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-900">{shipment.trackingNumber}</td>
                    <td className="px-4 py-3">
                      <select className="rounded-2xl border border-slate-200 bg-white px-2 py-1.5 text-xs" value={shipment.shipmentType ?? ""} onChange={(e) => setShipments((prev) => prev.map((item) => (item.id === shipment.id ? { ...item, shipmentType: e.target.value || null } : item)))}>
                        <option value="">-</option>
                        {["RL", "UMS", "VPL", "VPP", "PAR", "COD", "COURIER"].map((type) => <option key={type} value={type}>{type}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3"><input className="w-40 rounded-2xl border border-slate-200 bg-white px-2 py-1.5 text-xs" value={shipment.status ?? ""} onChange={(e) => setShipments((prev) => prev.map((item) => (item.id === shipment.id ? { ...item, status: e.target.value } : item)))} placeholder="Status" /></td>
                    <td className="px-4 py-3"><input className="w-32 rounded-2xl border border-slate-200 bg-white px-2 py-1.5 text-xs" value={shipment.city ?? ""} onChange={(e) => setShipments((prev) => prev.map((item) => (item.id === shipment.id ? { ...item, city: e.target.value } : item)))} placeholder="City" /></td>
                    <td className="px-4 py-3"><input className="w-40 rounded-2xl border border-slate-200 bg-white px-2 py-1.5 text-xs" value={shipment.adminCode ?? ""} onChange={(e) => setShipments((prev) => prev.map((item) => (item.id === shipment.id ? { ...item, adminCode: e.target.value } : item)))} placeholder="Code" /></td>
                    <td className="px-4 py-3 text-right">
                      <button className="rounded-2xl border bg-white px-2.5 py-1 text-xs font-medium text-gray-700 shadow-lg hover:bg-gray-50" onClick={async () => { setErr(null); try { await api(`/api/admin/shipments/${shipment.id}`, { method: "PATCH", body: JSON.stringify({ shipmentType: shipment.shipmentType ?? null, status: shipment.status ?? null, city: shipment.city ?? null, adminCode: shipment.adminCode ?? null }) }); await refresh(); } catch (error) { setErr(error instanceof Error ? error.message : "Failed to update shipment"); } }}>Save</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Card>
      ) : null}

      {section === "invoices" ? (
        <Card className="min-w-0 w-full overflow-hidden">
          <div className="border-b px-6 py-4">
            <div className="text-xl font-medium text-gray-900">Invoices</div>
            <div className="mt-1 text-sm text-gray-600">All invoices created during plan selection. Linked to manual wallet payments.</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {([["", "All"], ["OPEN", "Open / Pending"], ["PAID", "Paid"]] as const).map(([f, label]) => (
                <button
                  key={f}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${invoiceFilter === f ? "bg-brand text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
                  onClick={() => setInvoiceFilter(f)}
                >
                  {label}
                </button>
              ))}
              <button
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                onClick={() => refreshInvoices(invoiceFilter)}
              >
                Refresh
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-2 text-xs text-slate-600">
            <div>
              Page <span className="font-semibold text-slate-800">{invoicesPage}</span> of <span className="font-semibold text-slate-800">{totalInvoicePages}</span> · <span className="font-semibold text-slate-800">{paginatedInvoices.length}</span> shown · <span className="font-semibold text-slate-800">{invoices.length}</span> total
            </div>
            <div className="flex items-center gap-1.5">
              <button className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 disabled:opacity-40" disabled={invoicesPage <= 1} onClick={() => setInvoicesPage(1)}>First</button>
              <button className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 disabled:opacity-40" disabled={invoicesPage <= 1} onClick={() => setInvoicesPage((p) => Math.max(1, p - 1))}>Previous</button>
              <button className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 disabled:opacity-40" disabled={invoicesPage >= totalInvoicePages} onClick={() => setInvoicesPage((p) => Math.min(totalInvoicePages, p + 1))}>Next</button>
              <button className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 disabled:opacity-40" disabled={invoicesPage >= totalInvoicePages} onClick={() => setInvoicesPage(totalInvoicePages)}>Last</button>
            </div>
          </div>
          <TableWrap>
            <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
              <thead className="bg-gray-50">
                <tr className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Invoice #</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Issued</th>
                  <th className="px-4 py-3">Paid</th>
                  <th className="px-4 py-3">Payments</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {loadingInvoices && (
                  <tr><td className="px-4 py-6 text-center text-sm text-slate-400" colSpan={8}>Loading...</td></tr>
                )}
                {!loadingInvoices && invoices.length === 0 && (
                  <tr><td className="px-4 py-6 text-center text-sm text-slate-400" colSpan={8}>No invoices found.</td></tr>
                )}
                {paginatedInvoices.map((inv) => (
                  <tr key={inv.id} className="transition-colors hover:bg-gray-50/60">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{inv.user.companyName ?? inv.user.email}</div>
                      <div className="text-xs text-slate-400">{inv.user.email}</div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-800">{inv.invoiceNumber}</td>
                    <td className="px-4 py-3 text-slate-700">{inv.plan.name}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {formatPKR.format(Math.round(inv.amountCents / 100)).replace(/\u00A0/g, " ").replace("PKR", "Rs.")}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${inv.status === "PAID" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                        {inv.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{new Date(inv.issuedAt).toLocaleDateString("en-PK")}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{inv.paidAt ? new Date(inv.paidAt).toLocaleDateString("en-PK") : "—"}</td>
                    <td className="px-4 py-3">
                      {inv.manualPayments.length === 0 ? (
                        <span className="text-xs text-slate-400">No payments</span>
                      ) : (
                        <div className="space-y-1">
                          {inv.manualPayments.map((mp) => (
                            <div key={mp.id} className="flex items-center gap-1.5">
                              <span className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${mp.status === "APPROVED" ? "bg-emerald-100 text-emerald-700" : mp.status === "REJECTED" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                                {mp.status}
                              </span>
                              <span className={`rounded-full px-1.5 py-0.5 text-xs ${mp.paymentMethod === "JAZZCASH" ? "bg-red-50 text-red-600" : "bg-green-50 text-green-600"}`}>
                                {mp.paymentMethod}
                              </span>
                              <span className="font-mono text-xs text-slate-500">{mp.transactionId}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          <div className="flex items-center justify-end gap-1.5 border-t border-slate-200 px-6 py-2 text-xs text-slate-600">
            <button className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 disabled:opacity-40" disabled={invoicesPage <= 1} onClick={() => setInvoicesPage(1)}>First</button>
            <button className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 disabled:opacity-40" disabled={invoicesPage <= 1} onClick={() => setInvoicesPage((p) => Math.max(1, p - 1))}>Previous</button>
            <button className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 disabled:opacity-40" disabled={invoicesPage >= totalInvoicePages} onClick={() => setInvoicesPage((p) => Math.min(totalInvoicePages, p + 1))}>Next</button>
            <button className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 disabled:opacity-40" disabled={invoicesPage >= totalInvoicePages} onClick={() => setInvoicesPage(totalInvoicePages)}>Last</button>
          </div>
        </Card>
      ) : null}

      {section === "billing" ? (
        <Card className="min-w-0 w-full overflow-hidden p-6">
          <div className="text-xl font-medium text-gray-900">Billing Settings</div>
          <div className="mt-1 text-sm text-gray-600">Configure wallet accounts, optional QR images, and plan prices for Standard/Business.</div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Card className="p-4">
              <div className="text-sm font-semibold text-slate-900">JazzCash</div>
              <div className="mt-3 space-y-2">
                <input
                  className="w-full rounded-2xl border bg-white px-3 py-2 text-sm shadow-lg"
                  value={billingDraft.jazzcashNumber}
                  onChange={(e) => setBillingDraft((prev) => ({ ...prev, jazzcashNumber: e.target.value }))}
                  placeholder="JazzCash account number"
                />
                <input
                  className="w-full rounded-2xl border bg-white px-3 py-2 text-sm shadow-lg"
                  value={billingDraft.jazzcashTitle}
                  onChange={(e) => setBillingDraft((prev) => ({ ...prev, jazzcashTitle: e.target.value }))}
                  placeholder="JazzCash account title"
                />
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setJazzcashQrFile(e.target.files?.[0] ?? null)}
                  className="w-full rounded-2xl border bg-white px-3 py-2 text-sm shadow-lg"
                />
                {billingSettings?.jazzcashQrUrl && !clearJazzcashQr ? (
                  <img src={apiUrl(billingSettings.jazzcashQrUrl)} alt="JazzCash QR" className="h-28 w-28 rounded-xl border object-contain" />
                ) : null}
                <label className="flex items-center gap-2 text-xs text-slate-600">
                  <input type="checkbox" checked={clearJazzcashQr} onChange={(e) => setClearJazzcashQr(e.target.checked)} />
                  Remove JazzCash QR
                </label>
              </div>
            </Card>

            <Card className="p-4">
              <div className="text-sm font-semibold text-slate-900">Easypaisa</div>
              <div className="mt-3 space-y-2">
                <input
                  className="w-full rounded-2xl border bg-white px-3 py-2 text-sm shadow-lg"
                  value={billingDraft.easypaisaNumber}
                  onChange={(e) => setBillingDraft((prev) => ({ ...prev, easypaisaNumber: e.target.value }))}
                  placeholder="Easypaisa account number"
                />
                <input
                  className="w-full rounded-2xl border bg-white px-3 py-2 text-sm shadow-lg"
                  value={billingDraft.easypaisaTitle}
                  onChange={(e) => setBillingDraft((prev) => ({ ...prev, easypaisaTitle: e.target.value }))}
                  placeholder="Easypaisa account title"
                />
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setEasypaisaQrFile(e.target.files?.[0] ?? null)}
                  className="w-full rounded-2xl border bg-white px-3 py-2 text-sm shadow-lg"
                />
                {billingSettings?.easypaisaQrUrl && !clearEasypaisaQr ? (
                  <img src={apiUrl(billingSettings.easypaisaQrUrl)} alt="Easypaisa QR" className="h-28 w-28 rounded-xl border object-contain" />
                ) : null}
                <label className="flex items-center gap-2 text-xs text-slate-600">
                  <input type="checkbox" checked={clearEasypaisaQr} onChange={(e) => setClearEasypaisaQr(e.target.checked)} />
                  Remove Easypaisa QR
                </label>
              </div>
            </Card>
          </div>

          <Card className="mt-4 p-4">
            <div className="text-sm font-semibold text-slate-900">Package Pricing</div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <input
                className="w-full rounded-2xl border bg-white px-3 py-2 text-sm shadow-lg"
                type="number"
                min={1}
                value={billingDraft.standardPrice}
                onChange={(e) => setBillingDraft((prev) => ({ ...prev, standardPrice: e.target.value }))}
                placeholder="Standard price (paisa)"
              />
              <input
                className="w-full rounded-2xl border bg-white px-3 py-2 text-sm shadow-lg"
                type="number"
                min={1}
                value={billingDraft.businessPrice}
                onChange={(e) => setBillingDraft((prev) => ({ ...prev, businessPrice: e.target.value }))}
                placeholder="Business price (paisa)"
              />
            </div>
          </Card>

          <Card className="mt-4 p-4">
            <div className="text-sm font-semibold text-slate-900">Allow Test File Names</div>
            <div className="mt-1 text-xs text-slate-500">One file name per line. Duplicate-upload block will be skipped for these names.</div>
            <textarea
              className="mt-3 min-h-[120px] w-full rounded-2xl border bg-white px-3 py-2 text-sm shadow-lg"
              value={billingDraft.exemptFileNamesText}
              onChange={(e) => setBillingDraft((prev) => ({ ...prev, exemptFileNamesText: e.target.value }))}
              placeholder="LCS 15-13-11-2024.xls"
            />
          </Card>

          <div className="mt-4 flex justify-end">
            <button
              className="rounded-2xl bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
              onClick={() => saveBillingSettings()}
              disabled={savingBillingSettings}
            >
              {savingBillingSettings ? "Saving..." : "Save Billing Settings"}
            </button>
          </div>
        </Card>
      ) : null}

      {section === "payments" ? (
        <Card className="min-w-0 w-full overflow-hidden">
          <div className="border-b px-6 py-4">
            <div className="text-xl font-medium text-gray-900">Wallet Payment Queue</div>
            <div className="mt-1 text-sm text-gray-600">Review and approve/reject manual JazzCash &amp; Easypaisa payment submissions.</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {(["PENDING", "APPROVED", "REJECTED", "ALL"] as const).map((f) => (
                <button
                  key={f}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${manualPaymentFilter === f ? "bg-brand text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
                  onClick={() => setManualPaymentFilter(f)}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-2 text-xs text-slate-600">
            <div>
              Page <span className="font-semibold text-slate-800">{manualPaymentsPage}</span> of <span className="font-semibold text-slate-800">{totalManualPages}</span> · <span className="font-semibold text-slate-800">{paginatedManualPayments.length}</span> shown · <span className="font-semibold text-slate-800">{manualPayments.length}</span> total
            </div>
            <div className="flex items-center gap-1.5">
              <button className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 disabled:opacity-40" disabled={manualPaymentsPage <= 1} onClick={() => setManualPaymentsPage(1)}>First</button>
              <button className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 disabled:opacity-40" disabled={manualPaymentsPage <= 1} onClick={() => setManualPaymentsPage((p) => Math.max(1, p - 1))}>Previous</button>
              <button className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 disabled:opacity-40" disabled={manualPaymentsPage >= totalManualPages} onClick={() => setManualPaymentsPage((p) => Math.min(totalManualPages, p + 1))}>Next</button>
              <button className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 disabled:opacity-40" disabled={manualPaymentsPage >= totalManualPages} onClick={() => setManualPaymentsPage(totalManualPages)}>Last</button>
            </div>
          </div>
          <TableWrap>
            <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
              <thead className="bg-gray-50">
                <tr className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Method</th>
                  <th className="px-4 py-3">Transaction ID</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Proof</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {manualPayments.length === 0 && (
                  <tr>
                    <td className="px-4 py-6 text-center text-sm text-slate-400" colSpan={9}>No payment requests found.</td>
                  </tr>
                )}
                {paginatedManualPayments.map((payment) => (
                  <tr key={payment.id} className="transition-colors hover:bg-gray-50/60">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{payment.user.companyName ?? payment.user.email}</div>
                      <div className="text-xs text-slate-400">{payment.user.email}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{payment.plan.name}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${payment.paymentMethod === "JAZZCASH" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
                        {payment.paymentMethod}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-700">{payment.transactionId}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {formatPKR.format(Math.round(payment.amountCents / 100)).replace(/\u00A0/g, " ").replace("PKR", "Rs.")}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${payment.status === "APPROVED" ? "bg-emerald-100 text-emerald-700" : payment.status === "REJECTED" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                        {payment.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{new Date(payment.createdAt).toLocaleDateString("en-PK")}</td>
                    <td className="px-4 py-3">
                      {payment.screenshotUrl ? (
                        <button
                          type="button"
                          onClick={() => openProofModal(payment)}
                          className="rounded-xl border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-lg hover:bg-slate-50"
                        >
                          View Proof
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">No attachment</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {payment.status === "PENDING" && (
                        <div className="flex justify-end gap-2">
                          <button
                            className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                            disabled={!!manualPaymentAction[payment.id]}
                            onClick={() => handleApprovePayment(payment.id)}
                          >
                            {manualPaymentAction[payment.id] ? "…" : "Approve"}
                          </button>
                          <button
                            className="rounded-xl border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                            disabled={!!manualPaymentAction[payment.id]}
                            onClick={() => handleRejectPayment(payment.id)}
                          >
                            {manualPaymentAction[payment.id] ? "…" : "Reject"}
                          </button>
                        </div>
                      )}
                      {payment.status !== "PENDING" && (
                        <span className="text-xs text-slate-400">
                          {payment.verifiedBy ? `by ${payment.verifiedBy}` : "—"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          <div className="flex items-center justify-end gap-1.5 border-t border-slate-200 px-6 py-2 text-xs text-slate-600">
            <button className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 disabled:opacity-40" disabled={manualPaymentsPage <= 1} onClick={() => setManualPaymentsPage(1)}>First</button>
            <button className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 disabled:opacity-40" disabled={manualPaymentsPage <= 1} onClick={() => setManualPaymentsPage((p) => Math.max(1, p - 1))}>Previous</button>
            <button className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 disabled:opacity-40" disabled={manualPaymentsPage >= totalManualPages} onClick={() => setManualPaymentsPage((p) => Math.min(totalManualPages, p + 1))}>Next</button>
            <button className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 disabled:opacity-40" disabled={manualPaymentsPage >= totalManualPages} onClick={() => setManualPaymentsPage(totalManualPages)}>Last</button>
          </div>
        </Card>
      ) : null}

      {previewUser ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-[32px] border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-2xl font-semibold text-slate-950">Customer Preview</div>
                <div className="mt-1 text-sm text-slate-600">{previewUser.email}</div>
              </div>
              <button className="rounded-2xl border border-[#E5E7EB] bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-[#F8FAF9]" onClick={() => setPreviewUserId(null)}>Close</button>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              <Card className="p-4"><div className="text-xs text-slate-500">Account Status</div><div className="mt-1 text-lg font-semibold text-slate-900">{previewUser.suspended ? "Suspended" : "Active"}</div></Card>
              <Card className="p-4"><div className="text-xs text-slate-500">Remaining Units</div><div className="mt-1 text-lg font-semibold text-slate-900">{previewUser.balances.labelsRemaining.toLocaleString()}</div></Card>
              <Card className="p-4"><div className="text-xs text-slate-500">Current Plan</div><div className="mt-1 text-lg font-semibold text-slate-900">{previewUser.subscription?.plan?.name ?? "No plan"}</div></Card>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <Card className="p-4">
                <div className="text-sm font-semibold text-slate-900">Give Extra Credit</div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <input className="rounded-2xl border bg-white px-3 py-2 text-sm shadow-lg" value={draftFor(previewUser.id, previewUser.subscription?.plan.id).labelCredits} onChange={(e) => updateDraft(previewUser.id, { labelCredits: e.target.value }, previewUser.subscription?.plan.id)} placeholder="Units" type="number" />
                  <input className="rounded-2xl border bg-slate-100 px-3 py-2 text-sm shadow-lg" value={draftFor(previewUser.id, previewUser.subscription?.plan.id).trackingCredits} onChange={(e) => updateDraft(previewUser.id, { trackingCredits: e.target.value }, previewUser.subscription?.plan.id)} placeholder="Units (mirror)" type="number" />
                </div>
                <button className="mt-3 rounded-2xl border border-brand/30 bg-brand/10 px-4 py-2 text-sm font-medium text-brand hover:bg-brand/20" onClick={async () => { try { const units = Number(draftFor(previewUser.id, previewUser.subscription?.plan.id).labelCredits || 0); await api(`/api/admin/users/${previewUser.id}/credits`, { method: "POST", body: JSON.stringify({ labelCredits: units, trackingCredits: units }) }); updateDraft(previewUser.id, { labelCredits: "", trackingCredits: "" }, previewUser.subscription?.plan.id); await refresh(); } catch (error) { setErr(error instanceof Error ? error.message : "Failed to grant credits"); } }}>Apply Credit</button>
              </Card>

              <Card className="p-4">
                <div className="text-sm font-semibold text-slate-900">Manual Controls</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button className="rounded-2xl border bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-[#F8FAF9]" onClick={async () => { try { await api(`/api/admin/users/${previewUser.id}/role`, { method: "POST", body: JSON.stringify({ role: previewUser.role === "ADMIN" ? "USER" : "ADMIN" }) }); await refresh(); } catch (error) { setErr(error instanceof Error ? error.message : "Failed"); } }}>{previewUser.role === "ADMIN" ? "Demote" : "Promote"}</button>
                  <button className={`rounded-2xl px-3 py-2 text-xs font-medium ${previewUser.suspended ? "border border-emerald-200 bg-emerald-50 text-emerald-700" : "border border-red-200 bg-red-50 text-red-700"}`} onClick={async () => { try { await api(`/api/admin/users/${previewUser.id}/${previewUser.suspended ? "unsuspend" : "suspend"}`, { method: "POST" }); await refresh(); } catch (error) { setErr(error instanceof Error ? error.message : "Failed"); } }}>{previewUser.suspended ? "Manual Approval (Activate)" : "Suspend Account"}</button>
                  <button className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-100" onClick={async () => { if (!confirm(`Delete user ${previewUser.email}?`)) return; try { await api(`/api/admin/users/${previewUser.id}`, { method: "DELETE" }); setPreviewUserId(null); await refresh(); } catch (error) { setErr(error instanceof Error ? error.message : "Failed to delete user"); } }}>Delete User</button>
                  <button className="rounded-2xl border border-brand/30 bg-brand/10 px-3 py-2 text-xs font-medium text-brand" onClick={async () => { try { const planId = draftFor(previewUser.id, previewUser.subscription?.plan.id).planId || previewUser.subscription?.plan.id; if (!planId) return; await api(`/api/admin/users/${previewUser.id}/subscription`, { method: "POST", body: JSON.stringify({ planId }) }); await refresh(); } catch (error) { setErr(error instanceof Error ? error.message : "Payment confirmation failed"); } }}>Manual Payment Confirmation</button>
                </div>
              </Card>
            </div>

            <Card className="mt-4 p-4">
              <div className="text-sm font-semibold text-slate-900">Package Assignment</div>
              <div className="mt-3 flex gap-2">
                <select className="w-full rounded-2xl border bg-white px-3 py-2 text-sm shadow-lg" value={draftFor(previewUser.id, previewUser.subscription?.plan.id).planId} onChange={(e) => updateDraft(previewUser.id, { planId: e.target.value }, previewUser.subscription?.plan.id)}>
                  <option value="">Select plan</option>
                  {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
                </select>
                <button className="rounded-2xl bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark" onClick={async () => { try { const planId = draftFor(previewUser.id, previewUser.subscription?.plan.id).planId; if (!planId) return; await api(`/api/admin/users/${previewUser.id}/subscription`, { method: "POST", body: JSON.stringify({ planId }) }); await refresh(); } catch (error) { setErr(error instanceof Error ? error.message : "Failed"); } }}>Assign</button>
              </div>
            </Card>
          </div>
        </div>
      ) : null}

      {editingPlanId && editingPlanDraft ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-[28px] border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xl font-semibold text-slate-950">Edit Plan</div>
                <div className="mt-1 text-sm text-slate-600">Update all plan fields and persist complete plan state.</div>
              </div>
              <button className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700" onClick={() => { setEditingPlanId(null); setEditingPlanDraft(null); }}>Close</button>
            </div>
            <div className="mt-4 space-y-3">
              <label className="block text-sm font-medium text-slate-700">
                Plan name
                <input className="field-input mt-1 w-full" value={editingPlanDraft.name} onChange={(e) => setEditingPlanDraft((prev) => prev ? { ...prev, name: e.target.value } : prev)} placeholder="Plan name" />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Price (paisa)
                <input className="field-input mt-1 w-full" value={editingPlanDraft.fullPriceCents} onChange={(e) => setEditingPlanDraft((prev) => prev ? { ...prev, fullPriceCents: Number(e.target.value || 0) } : prev)} type="number" placeholder="Full price (paisa)" />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Discounted price (optional, paisa)
                <input className="field-input mt-1 w-full" value={editingPlanDraft.discountPriceCents} onChange={(e) => setEditingPlanDraft((prev) => prev ? { ...prev, discountPriceCents: Number(e.target.value || 0) } : prev)} type="number" placeholder="Discounted price (paisa)" />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Total shared units
                <input className="field-input mt-1 w-full" value={editingPlanDraft.totalSharedUnits} onChange={(e) => setEditingPlanDraft((prev) => prev ? { ...prev, totalSharedUnits: Number(e.target.value || 0) } : prev)} type="number" min={1} placeholder="Total Shared Units" />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Daily complaint limit
                <input className="field-input mt-1 w-full" value={editingPlanDraft.dailyComplaintLimit} onChange={(e) => setEditingPlanDraft((prev) => prev ? { ...prev, dailyComplaintLimit: Number(e.target.value || 0) } : prev)} type="number" placeholder="Daily Complaint Limit" />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Monthly complaint limit
                <input className="field-input mt-1 w-full" value={editingPlanDraft.monthlyComplaintLimit} onChange={(e) => setEditingPlanDraft((prev) => prev ? { ...prev, monthlyComplaintLimit: Number(e.target.value || 0) } : prev)} type="number" placeholder="Monthly Complaint Limit" />
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={editingPlanDraft.isSuspended} onChange={(e) => setEditingPlanDraft((prev) => prev ? { ...prev, isSuspended: e.target.checked } : prev)} />
                Suspended
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700" onClick={() => { setEditingPlanId(null); setEditingPlanDraft(null); }}>Cancel</button>
              <button className="rounded-xl bg-brand px-4 py-2 text-xs font-semibold text-white disabled:opacity-60" disabled={savingPlanEdit} onClick={() => savePlanEdits()}>{savingPlanEdit ? "Saving..." : "Save Plan"}</button>
            </div>
          </div>
        </div>
      ) : null}

      {proofModal.open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
              <div className="text-sm font-semibold text-slate-900">Payment Proof Preview</div>
              <button className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700" onClick={() => setProofModal({ open: false, url: null, mimeType: null, fileName: null })}>Close</button>
            </div>
            <div className="max-h-[78vh] overflow-auto p-4">
              {proofModal.url && String(proofModal.mimeType ?? "").startsWith("image/") ? (
                <img src={proofModal.url} alt={proofModal.fileName ?? "Payment proof"} className="mx-auto max-h-[70vh] w-auto rounded-xl border border-slate-200 object-contain" />
              ) : null}
              {proofModal.url && String(proofModal.mimeType ?? "") === "application/pdf" ? (
                <iframe src={proofModal.url} title="PDF payment proof" className="h-[70vh] w-full rounded-xl border border-slate-200" />
              ) : null}
              {proofModal.url && !String(proofModal.mimeType ?? "").startsWith("image/") && String(proofModal.mimeType ?? "") !== "application/pdf" ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                  Unsupported preview format.
                  <a href={proofModal.url} target="_blank" rel="noreferrer" className="ml-2 font-semibold text-brand">Open in new tab</a>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}




