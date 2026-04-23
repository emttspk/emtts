import { useEffect, useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { ArrowRight, BarChart2, CreditCard, LineChart, Package2, RadioTower, Wallet } from "lucide-react";
import Card from "../components/Card";
import { api } from "../lib/api";
import type { MeResponse } from "../lib/types";
import { computeStats, getFinalTrackingData } from "../lib/trackingData";

const formatPKR = new Intl.NumberFormat("en-PK", {
  style: "currency",
  currency: "PKR",
  currencyDisplay: "code",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

type DashboardStats = ReturnType<typeof computeStats> & {
  trackingUsed: number;
  graphData: Array<{ date: string; total: number; byStatus: Record<string, number> }>;
};

type DashboardShipment = {
  id: string;
  trackingNumber: string;
  status?: string | null;
  rawJson?: string | null;
  createdAt: string;
  updatedAt: string;
  latestDate?: string | null;
  latestTime?: string | null;
};

type ShellCtx = { me: MeResponse | null; refreshMe: () => Promise<void> };

function AnalyticsGraph({ stats }: { stats: DashboardStats }) {
  const distribution = [
    { label: "Delivered", value: stats.delivered ?? 0, color: "#16a34a" },
    { label: "Pending", value: stats.pending ?? 0, color: "#f97316" },
    { label: "Returned", value: stats.returned ?? 0, color: "#dc2626" },
    { label: "Delayed", value: stats.delayed ?? 0, color: "#7c3aed" },
  ];
  const max = Math.max(...distribution.map((s) => s.value), 1);

  return (
    <Card className="overflow-hidden border-slate-200/80 p-6 shadow-[0_24px_60px_rgba(15,23,42,0.10)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-lg font-medium text-gray-900">Analytics Overview</div>
          <div className="mt-1 text-sm text-slate-600">Real-time shipment status overview with visually optimized indicators to support faster and more informed operational decisions.</div>
        </div>
        <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">{distribution.reduce((sum, d) => sum + d.value, 0)} shipments</div>
      </div>
      {distribution.some((d) => d.value > 0) ? (
        <div className="mt-6 space-y-4 rounded-[22px] border border-slate-200 bg-[linear-gradient(180deg,#f8fbff,#eef4ff)] p-5">
          {distribution.map((d) => {
            const width = Math.max(6, Math.round((d.value / max) * 100));
            return (
              <div key={d.label} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="font-medium text-slate-900">{d.label}</div>
                  <div className="font-semibold text-slate-700">{d.value.toLocaleString()}</div>
                </div>
                <div className="h-3 rounded-full bg-slate-100">
                  <div className="h-3 rounded-full" style={{ width: `${width}%`, backgroundColor: d.color }} />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-6 rounded-[22px] border border-dashed border-slate-300 bg-slate-50 p-8 text-sm text-slate-600">No shipment history is available yet. Status distribution will render after your first tracked batch.</div>
      )}
    </Card>
  );
}

export default function Dashboard() {
  const { me } = useOutletContext<ShellCtx>();
  const [shipmentStats, setShipmentStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refreshShipments() {
    const hardLimit = 200;
    let page = 1;
    const rows: DashboardShipment[] = [];

    while (page <= 50) {
      const data = await api<{ shipments: DashboardShipment[]; total: number }>(`/api/shipments?page=${page}&limit=${hardLimit}`);
      const chunk = Array.isArray(data.shipments) ? data.shipments : [];
      rows.push(...chunk);
      if (chunk.length < hardLimit) break;
      if (rows.length >= (data.total ?? 0)) break;
      page += 1;
    }

    const finalData = getFinalTrackingData(rows);
    const base = computeStats(finalData);

    const byDate: Record<string, { total: number; byStatus: Record<string, number> }> = {};
    let trackingUsed = 0;
    const month = new Date().toISOString().slice(0, 7);

    for (const row of finalData) {
      const created = String(row.shipment.createdAt ?? "");
      const date = created.split("T")[0] || "-";
      const key = row.final_status.includes("RETURN") ? "RETURNED" : row.final_status.includes("DELIVER") ? "DELIVERED" : "PENDING";
      if (!byDate[date]) byDate[date] = { total: 0, byStatus: {} };
      byDate[date].total += 1;
      byDate[date].byStatus[key] = (byDate[date].byStatus[key] ?? 0) + 1;
      if (created.slice(0, 7) === month) trackingUsed += 1;
    }

    const graphData = Object.keys(byDate)
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
      .map((date) => ({
        date,
        total: byDate[date].total,
        byStatus: byDate[date].byStatus,
      }));

    setShipmentStats({ ...base, trackingUsed, graphData });
  }

  useEffect(() => {
    let ok = true;
    setError(null);
    refreshShipments().catch((e) => {
      if (!ok) return;
      setError(e instanceof Error ? e.message : "Failed to load shipments");
    });
    return () => {
      ok = false;
    };
  }, []);

  const stats = useMemo(
    () => ({
      total: shipmentStats?.total ?? 0,
      delivered: shipmentStats?.delivered ?? 0,
      pending: shipmentStats?.pending ?? 0,
      returned: shipmentStats?.returned ?? 0,
      delayed: shipmentStats?.delayed ?? 0,
      totalAmount: shipmentStats?.totalAmount ?? 0,
      deliveredAmount: shipmentStats?.deliveredAmount ?? 0,
      pendingAmount: shipmentStats?.pendingAmount ?? 0,
      returnedAmount: shipmentStats?.returnedAmount ?? 0,
      delayedAmount: shipmentStats?.delayedAmount ?? 0,
      trackingUsed: shipmentStats?.trackingUsed ?? 0,
      graphData: shipmentStats?.graphData ?? [],
    }),
    [shipmentStats],
  );

  const statusCards = [
    { label: "Total", value: stats.total, amount: stats.totalAmount ?? 0, tone: "text-slate-700", bg: "bg-slate-50" },
    { label: "Delivered", value: stats.delivered, amount: stats.deliveredAmount ?? 0, tone: "text-emerald-700", bg: "bg-emerald-50" },
    { label: "Pending", value: stats.pending, amount: stats.pendingAmount ?? 0, tone: "text-orange-700", bg: "bg-orange-50" },
    { label: "Returned", value: stats.returned, amount: stats.returnedAmount ?? 0, tone: "text-red-700", bg: "bg-red-50" },
    { label: "Delayed", value: stats.delayed, amount: stats.delayedAmount ?? 0, tone: "text-violet-700", bg: "bg-violet-50" },
  ];

  const monthlyBars = useMemo(() => {
    const buckets = new Map<string, number>();
    for (let i = 5; i >= 0; i -= 1) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      buckets.set(key, 0);
    }

    for (const point of stats.graphData) {
      const month = String(point.date ?? "").slice(0, 7);
      if (!buckets.has(month)) continue;
      buckets.set(month, (buckets.get(month) ?? 0) + Number(point.total ?? 0));
    }

    const values = Array.from(buckets.entries()).map(([month, value]) => ({
      key: month,
      label: month.slice(5),
      value,
    }));
    const max = Math.max(1, ...values.map((v) => v.value));
    return { values, max };
  }, [stats.graphData]);

  const usedUnits = (me?.usage?.labelsGenerated ?? 0) + (me?.usage?.labelsQueued ?? 0);
  const remainingUnits = me?.balances?.unitsRemaining ?? me?.activePackage?.unitsRemaining ?? 0;
  const expiryDate = me?.activePackage?.expiresAt ?? me?.subscription?.currentPeriodEnd;
  const expiryDateObj = expiryDate ? new Date(expiryDate) : null;
  const daysToExpiry = expiryDateObj ? Math.ceil((expiryDateObj.getTime() - Date.now()) / (24 * 60 * 60 * 1000)) : null;
  const nearExpiry = Boolean(daysToExpiry != null && daysToExpiry >= 0 && daysToExpiry <= 3);
  const expired = Boolean(daysToExpiry != null && daysToExpiry < 0);

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-slate-200/80 p-8 shadow-[0_28px_80px_rgba(15,23,42,0.10)]">
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700">
              <LineChart className="h-4 w-4" />
              Live Operations View
            </div>
            <div className="mt-5 text-4xl font-semibold text-slate-950">Track delivery momentum, remaining balance, and billing from one workspace.</div>
            <div className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">Monitor shipment performance, available balance, and billing activity from a unified control panel. The dashboard now delivers structured insights, financial visibility, and quick actions, creating a centralized operational workspace. Use the navigation panel to access tracking, label generation, and job management efficiently.</div>
            <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Monitor shipment performance, available balance, and billing activity from a unified control panel.
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Card className="border-slate-200/80 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
              <div className="flex items-center justify-between"><div className="text-sm font-medium text-slate-600">Remaining Units</div><Wallet className="h-4 w-4 text-slate-500" /></div>
              <div className="mt-3 text-3xl font-semibold text-slate-950">{remainingUnits.toLocaleString()}</div>
              <div className="mt-2 text-xs text-slate-600">Combined unit balance across label, money-order, and tracking actions.</div>
            </Card>
            <Card className="border-slate-200/80 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
              <div className="flex items-center justify-between"><div className="text-sm font-medium text-slate-600">Used Units</div><BarChart2 className="h-4 w-4 text-slate-500" /></div>
              <div className="mt-3 text-3xl font-semibold text-slate-950">{usedUnits.toLocaleString()}</div>
              <div className="mt-2 text-xs text-slate-600">Tracked shipments this month (computed from final tracking data).</div>
            </Card>
            <Card className="border-slate-200/80 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
              <div className="flex items-center justify-between"><div className="text-sm font-medium text-slate-600">Tracking Actions</div><RadioTower className="h-4 w-4 text-slate-500" /></div>
              <div className="mt-3 text-3xl font-semibold text-slate-950">{usedUnits.toLocaleString()}</div>
              <div className="mt-1 text-xs text-slate-500">Used this month {usedUnits.toLocaleString()}.</div>
            </Card>
            <Card className="border-slate-200/80 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
              <div className="flex items-center justify-between"><div className="text-sm font-medium text-slate-600">Active Package Details</div><Package2 className="h-4 w-4 text-slate-500" /></div>
              <div className="mt-3 text-2xl font-semibold text-slate-950">{me?.subscription?.plan?.name ?? "No active plan"}</div>
              <div className="mt-2 text-xs text-slate-600">Units Remaining: <span className="font-semibold text-slate-800">{remainingUnits.toLocaleString()}</span></div>
              <div className={`mt-1 text-xs font-medium ${nearExpiry ? "text-amber-700" : expired ? "text-red-700" : "text-slate-500"}`}>
                Expiry Date: {expiryDateObj ? expiryDateObj.toLocaleDateString("en-PK") : "-"}
              </div>
              <div className={`mt-1 inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${expired ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>
                Status: {expired ? "Expired" : "Active"}
              </div>
              <Link to="/billing" className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700">
                Update Package
              </Link>
            </Card>
            <Card className="border-slate-200/80 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
              <div className="flex items-center justify-between"><div className="text-sm font-medium text-slate-600">Billing</div><CreditCard className="h-4 w-4 text-slate-500" /></div>
              <div className="mt-3 text-2xl font-semibold text-slate-950">{formatPKR.format(Math.round((me?.subscription?.plan?.priceCents ?? 0) / 100)).replace("PKR", "Rs.")}</div>
              <div className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-sky-700">Open pricing <ArrowRight className="h-4 w-4" /></div>
            </Card>
          </div>
        </div>
      </Card>

      {error ? (
        <Card className="border-red-200 bg-red-50 p-4">
          <div className="text-sm font-medium text-red-800">{error}</div>
        </Card>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.55fr_0.85fr]">
        <AnalyticsGraph stats={stats} />
        <Card className="border-slate-200/80 p-6 shadow-[0_24px_60px_rgba(15,23,42,0.10)]">
          <div className="text-lg font-medium text-slate-950">Monthly Tracking Volume</div>
          <div className="mt-1 text-sm text-slate-600">Last 6 months (old to new).</div>
          <div className="mt-5 flex items-end gap-2">
            {monthlyBars.values.map((item) => {
              const h = Math.max(12, Math.round((item.value / monthlyBars.max) * 120));
              return (
                <div key={item.key} className="flex flex-1 flex-col items-center gap-1">
                  <div className="text-[11px] font-medium text-slate-700">{item.value}</div>
                  <div className="w-full rounded-t-md bg-gradient-to-t from-indigo-600 to-sky-400" style={{ height: `${h}px` }} />
                  <div className="text-[10px] text-slate-500">{item.label}</div>
                </div>
              );
            })}
          </div>
          <div className="mt-6 rounded-[20px] border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">Tracked this month: <span className="font-semibold text-slate-950">{(stats.trackingUsed ?? 0).toLocaleString()}</span></div>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        {statusCards.map((card) => (
          <Card key={card.label} className={`border-slate-200/80 p-6 shadow-[0_18px_44px_rgba(15,23,42,0.09)] ${card.bg}`}>
            <div className="text-sm font-medium text-gray-900">{card.label}</div>
            <div className="mt-2 text-4xl font-semibold">{card.value.toLocaleString()}</div>
            <div className={`mt-1 text-xs font-medium ${card.tone}`}>{formatPKR.format(card.amount).replace("PKR", "Rs.")}</div>
          </Card>
        ))}
      </div>

      <Card className="border-slate-200/80 p-6 shadow-[0_18px_44px_rgba(15,23,42,0.09)]">
        <div className="text-lg font-medium text-gray-900">Generate Labels &amp; Money Orders</div>
        <div className="mt-1 text-sm text-gray-600">Open Track Parcel, Generate Labels, and View Jobs from the left navigation tabs for a focused dashboard workspace.</div>
      </Card>
    </div>
  );
}
