import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Card from "../components/Card";
import { api } from "../lib/api";
import { TEMPLATE_DESIGNER_ENABLED } from "../lib/featureFlags";

type Plan = { id: string; name: string; priceCents: number; monthlyLabelLimit: number; monthlyTrackingLimit: number; createdAt: string };
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

type SectionKey = "overview" | "plans" | "customers" | "usage" | "shipments";

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
  const [err, setErr] = useState<string | null>(null);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  });
  const [name, setName] = useState("Business Plan");
  const [priceCents, setPriceCents] = useState(250000);
  const [monthlyLabelLimit, setMonthlyLabelLimit] = useState(2000);
  const [monthlyTrackingLimit, setMonthlyTrackingLimit] = useState(2000);
  const [creditDrafts, setCreditDrafts] = useState<Record<string, { labelCredits: string; trackingCredits: string; planId: string }>>({});
  const [section, setSection] = useState<SectionKey>("overview");
  const [previewUserId, setPreviewUserId] = useState<string | null>(null);

  function draftFor(userId: string, currentPlanId?: string | null) {
    return creditDrafts[userId] ?? { labelCredits: "", trackingCredits: "", planId: currentPlanId ?? "" };
  }

  function updateDraft(userId: string, patch: Partial<{ labelCredits: string; trackingCredits: string; planId: string }>, currentPlanId?: string | null) {
    setCreditDrafts((prev) => ({
      ...prev,
      [userId]: { ...draftFor(userId, currentPlanId), ...patch },
    }));
  }

  async function refresh() {
    const [p, u, us, sh] = await Promise.all([
      api<{ plans: Plan[] }>("/api/admin/plans"),
      api<{ users: AdminUser[] }>("/api/admin/users"),
      api<{ usage: UsageRow[] }>(`/api/admin/usage?month=${encodeURIComponent(month)}`),
      api<{ shipments: ShipmentRow[] }>("/api/admin/shipments?limit=50"),
    ]);
    setPlans(p.plans.filter((plan) => !["Starter Plan", "Pro Plan"].includes(plan.name)));
    setUsers(u.users);
    setUsage(us.usage);
    setShipments(sh.shipments);
  }

  useEffect(() => {
    refresh().catch((e) => setErr(e instanceof Error ? e.message : "Failed"));
  }, [month]);

  const totals = useMemo(
    () => ({
      customers: users.length,
      unitsRemaining: users.reduce((sum, user) => sum + user.balances.labelsRemaining, 0),
    }),
    [users],
  );

  const previewUser = users.find((u) => u.id === previewUserId) ?? null;

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden p-8 md:p-10">
        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
          <div>
            <div className="ui-kicker">Admin control room</div>
            <div className="mt-5 font-display text-4xl font-extrabold tracking-[-0.05em] text-slate-950 md:text-5xl">Premium oversight for plans, customers, usage, and shipment corrections.</div>
            <div className="mt-4 max-w-2xl text-base leading-8 text-slate-600">Manage approvals, balances, plan assignment, and shipment overrides from one structured admin workspace.</div>
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
          ].map(([key, label]) => (
            <button
              key={key}
              className={`rounded-full px-4 py-2.5 text-sm font-medium transition-all ${section === key ? "bg-brand text-white shadow-glow" : "border border-slate-200 bg-white text-slate-700 hover:-translate-y-0.5 hover:bg-slate-50"}`}
              onClick={() => setSection(key as SectionKey)}
            >
              {label}
            </button>
          ))}
        </div>
      </Card>

      {section === "overview" ? (
        <div className="grid gap-5 md:grid-cols-3">
          <Card className="p-6"><div className="text-sm text-slate-500">Active Customers</div><div className="mt-2 text-3xl font-semibold text-slate-950">{users.filter((u) => !u.suspended).length}</div></Card>
          <Card className="p-6"><div className="text-sm text-slate-500">Suspended</div><div className="mt-2 text-3xl font-semibold text-slate-950">{users.filter((u) => u.suspended).length}</div></Card>
          <Card className="p-6"><div className="text-sm text-slate-500">Business Plan Users</div><div className="mt-2 text-3xl font-semibold text-slate-950">{users.filter((u) => (u.subscription?.plan?.name ?? "") === "Business Plan").length}</div></Card>
          <Card className="p-6 md:col-span-3">
            <div className="text-sm text-slate-500">Admin Generation</div>
            <div className="mt-2 text-lg font-semibold text-slate-950">Generate labels and money orders from admin portal</div>
            <div className="mt-1 text-sm text-slate-600">Use upload or manual entry mode from dedicated admin pages.</div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button className="rounded-2xl bg-brand px-4 py-2 text-sm font-medium text-white" onClick={() => navigate("/admin/generate-labels")}>Generate Labels</button>
              <button className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700" onClick={() => navigate("/admin/generate-money-orders")}>Generate Money Order</button>
            </div>
          </Card>
          {TEMPLATE_DESIGNER_ENABLED ? (
            <Card className="p-6 md:col-span-3">
              <div className="text-sm text-slate-500">Admin Tools</div>
              <div className="mt-2 text-lg font-semibold text-slate-950">Money Order Designer</div>
              <div className="mt-1 text-sm text-slate-600">Create and manage isolated money order template layouts for internal preview mode.</div>
              <button className="mt-4 rounded-2xl bg-brand px-4 py-2 text-sm font-medium text-white" onClick={() => navigate("/admin/template-designer")}>Open Money Order Designer</button>
            </Card>
          ) : null}
        </div>
      ) : null}

      {section === "plans" ? (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between px-6 py-5">
            <div>
              <div className="text-xl font-medium text-gray-900">Plans</div>
              <div className="mt-1 text-sm text-gray-600">Single-unit model: one action (label, tracking, MO generation) consumes one unit.</div>
            </div>
            <button className="rounded-2xl border bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-lg hover:bg-gray-50" onClick={() => refresh()}>Refresh</button>
          </div>
          <form
            className="grid gap-3 border-t bg-slate-50 px-6 py-4 sm:grid-cols-5"
            onSubmit={async (e) => {
              e.preventDefault();
              setErr(null);
              try {
                await api("/api/admin/plans", {
                  method: "POST",
                  body: JSON.stringify({ name, priceCents, monthlyLabelLimit, monthlyTrackingLimit: monthlyLabelLimit }),
                });
                await refresh();
              } catch (error) {
                setErr(error instanceof Error ? error.message : "Failed to create plan");
              }
            }}
          >
            <input className="field-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Plan name" />
            <input className="field-input" value={priceCents} onChange={(e) => setPriceCents(Number(e.target.value))} placeholder="Price (paisa)" type="number" />
            <input className="field-input" value={monthlyLabelLimit} onChange={(e) => { const v = Number(e.target.value); setMonthlyLabelLimit(v); setMonthlyTrackingLimit(v); }} placeholder="Units" type="number" />
            <input className="field-input bg-slate-100" value={monthlyTrackingLimit} readOnly placeholder="Units (mirrored)" type="number" />
            <button className="rounded-2xl bg-brand px-3 py-2 text-sm font-medium text-white shadow-lg hover:bg-brand-dark">Create</button>
          </form>
          <div className="grid gap-4 border-t bg-white p-6 md:grid-cols-2">
            {plans.map((plan) => (
              <Card key={plan.id} className="p-5">
                <div className="text-lg font-semibold text-slate-950">{plan.name}</div>
                <div className="mt-2 text-sm text-slate-600">{formatPKR.format(Math.round(plan.priceCents / 100)).replace(/\u00A0/g, " ")} / cycle</div>
                <div className="mt-4 text-sm text-slate-700">{plan.monthlyLabelLimit.toLocaleString()} shared units</div>
              </Card>
            ))}
          </div>
        </Card>
      ) : null}

      {section === "customers" ? (
        <div className="space-y-4">
          <div>
            <div className="text-xl font-semibold text-slate-950">Customers</div>
            <div className="mt-1 text-sm text-slate-600">Open a customer preview to manage status, balances, credits, suspension, and manual payment confirmation.</div>
          </div>
          <div className="grid gap-5 xl:grid-cols-2">
            {users.map((user) => (
              <Card key={user.id} className="p-6">
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
        <Card className="p-6">
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
          <div className="ui-table mt-4 overflow-x-auto">
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
          </div>
        </Card>
      ) : null}

      {section === "shipments" ? (
        <Card className="overflow-hidden">
          <div className="border-b px-6 py-4">
            <div className="text-xl font-medium text-gray-900">Shipments</div>
            <div className="mt-1 text-sm text-gray-600">Override shipment metadata and admin code.</div>
          </div>
          <div className="ui-table overflow-x-auto">
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
    </div>
  );
}




