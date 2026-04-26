import { useEffect, useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { ArrowRight, BarChart2, Clock3, CreditCard, LineChart, Package2, RadioTower, Search, Sparkles, Wallet } from "lucide-react";
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
    <Card className="overflow-hidden p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-lg font-medium text-gray-900">Analytics Overview</div>
          <div className="mt-1 text-sm text-slate-600">Real-time shipment status overview with visually optimized indicators to support faster and more informed operational decisions.</div>
        </div>
        <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">{distribution.reduce((sum, d) => sum + d.value, 0)} shipments</div>
      </div>
      {distribution.some((d) => d.value > 0) ? (
        <div className="mt-6 space-y-4 rounded-2xl border border-[#E5E7EB] bg-gradient-to-b from-white to-[#F8FAF9] p-5">
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
        <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-[#F8FAF9] p-8 text-sm text-slate-600">No shipment history is available yet. Status distribution will render after your first tracked batch.</div>
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
    { label: "Total", value: stats.total, amount: stats.totalAmount ?? 0, tone: "text-slate-700", bg: "bg-[#F8FAF9]" },
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
  const recentActivity = useMemo(
    () => [...stats.graphData].slice(-4).reverse(),
    [stats.graphData],
  );
  const quickActions = [
    { title: "Upload Excel", to: "/upload", description: "Queue fresh label batches" },
    { title: "Generate Labels", to: "/jobs", description: "Open recent outputs and downloads" },
    { title: "Track Shipment", to: "/tracking", description: "Review live movement and status" },
  ];
  const metricCards = [
    { label: "Labels", value: usedUnits.toLocaleString(), detail: "Queued and generated units", icon: Wallet },
    { label: "Tracking", value: stats.trackingUsed.toLocaleString(), detail: "This month", icon: RadioTower },
    { label: "Money Orders", value: formatPKR.format(stats.totalAmount).replace("PKR", "Rs."), detail: "Visible shipment amount", icon: CreditCard },
    { label: "Complaints", value: stats.pending.toLocaleString(), detail: "Pending shipments to watch", icon: Clock3 },
  ];

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden p-8 md:p-10">
        <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <div className="ui-kicker">
              <Sparkles className="h-4 w-4" /> Live Operations View
            </div>
            <div className="mt-5 max-w-3xl font-display text-4xl font-extrabold tracking-[-0.05em] text-slate-950 md:text-5xl">Premium command center for labels, tracking, money orders and complaint follow-up.</div>
            <div className="mt-4 max-w-2xl text-base leading-8 text-slate-600">Monitor shipment momentum, remaining balance, and billing context from one polished operational workspace. Quick actions, recent activity, and status analytics stay visible without leaving the page.</div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/upload" className="btn-primary">Upload Excel</Link>
              <Link to="/tracking" className="btn-secondary">Track Shipment</Link>
            </div>
            <label className="mt-6 flex max-w-xl items-center gap-3 rounded-full border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
              <Search className="h-4 w-4 text-slate-400" />
              <input className="w-full bg-transparent outline-none placeholder:text-slate-400" placeholder="Search activity, tracking IDs, or workspace context" />
            </label>
            <div className="mt-6 rounded-[28px] border border-slate-200 bg-slate-50/80 px-5 py-4 text-sm leading-7 text-slate-600">
              Active package <span className="font-semibold text-slate-900">{me?.subscription?.plan?.name ?? "No active plan"}</span> with <span className="font-semibold text-slate-900">{remainingUnits.toLocaleString()}</span> units remaining.
            </div>
          </div>
          <div className="rounded-[32px] bg-[linear-gradient(160deg,#0F172A,#162033)] p-6 text-white shadow-[0_30px_90px_rgba(15,23,42,0.24)]">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-slate-300">Package status</div>
                <div className="mt-3 text-3xl font-semibold">{me?.subscription?.plan?.name ?? "No active plan"}</div>
              </div>
              <Package2 className="h-5 w-5 text-emerald-300" />
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {metricCards.map((card) => {
                const Icon = card.icon;
                return (
                  <div key={card.label} className="rounded-[24px] border border-white/10 bg-white/5 p-4">
                    <div className="flex items-center justify-between text-slate-300">
                      <span className="text-sm">{card.label}</span>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="mt-3 text-2xl font-semibold text-white">{card.value}</div>
                    <div className="mt-1 text-xs text-slate-300">{card.detail}</div>
                  </div>
                );
              })}
            </div>
            <div className="mt-6 flex items-center justify-between rounded-[24px] bg-white/10 px-4 py-4 text-sm text-slate-200">
              <div>
                <div>Expiry date</div>
                <div className={`mt-1 font-semibold ${nearExpiry ? "text-amber-300" : expired ? "text-red-300" : "text-white"}`}>{expiryDateObj ? expiryDateObj.toLocaleDateString("en-PK") : "-"}</div>
              </div>
              <Link to="/billing" className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-brand">
                Update package <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </Card>

      {error ? (
        <Card className="border-red-200 bg-red-50 p-4">
          <div className="text-sm font-medium text-red-800">{error}</div>
        </Card>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <AnalyticsGraph stats={stats} />
        <div className="grid gap-6">
          <Card className="p-6">
            <div className="text-lg font-medium text-slate-950">Quick Actions</div>
            <div className="mt-1 text-sm text-slate-600">Jump directly into the highest-frequency workflow tasks.</div>
            <div className="mt-5 grid gap-3">
              {quickActions.map((item) => (
                <Link key={item.title} to={item.to} className="flex items-center justify-between rounded-[24px] border border-slate-200 bg-slate-50/70 px-4 py-4 transition-all hover:-translate-y-1 hover:bg-white hover:shadow-card">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{item.title}</div>
                    <div className="mt-1 text-sm text-slate-600">{item.description}</div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-brand" />
                </Link>
              ))}
            </div>
          </Card>

          <Card className="p-6">
            <div className="text-lg font-medium text-slate-950">Recent Activity</div>
            <div className="mt-1 text-sm text-slate-600">Latest tracked volume snapshots from your shipment history.</div>
            <div className="mt-5 space-y-4">
              {recentActivity.length > 0 ? recentActivity.map((item) => (
                <div key={item.date} className="flex items-start gap-3">
                  <div className="mt-1 h-10 w-10 rounded-full bg-brand/10 text-brand flex items-center justify-center"><LineChart className="h-4 w-4" /></div>
                  <div className="flex-1 rounded-[24px] border border-slate-200 bg-slate-50/70 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-semibold text-slate-900">{item.date}</div>
                      <div className="text-sm font-semibold text-brand">{item.total.toLocaleString()} shipments</div>
                    </div>
                    <div className="mt-2 text-sm text-slate-600">Delivered {item.byStatus.DELIVERED ?? 0}, pending {item.byStatus.PENDING ?? 0}, returned {item.byStatus.RETURNED ?? 0}.</div>
                  </div>
                </div>
              )) : <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50/70 px-4 py-6 text-sm text-slate-500">Recent activity appears after tracked shipments are available.</div>}
            </div>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        {statusCards.map((card) => (
          <Card key={card.label} className={`p-6 ${card.bg}`}>
            <div className="text-sm font-medium text-gray-900">{card.label}</div>
            <div className="mt-2 text-4xl font-semibold">{card.value.toLocaleString()}</div>
            <div className={`mt-1 text-xs font-medium ${card.tone}`}>{formatPKR.format(card.amount).replace("PKR", "Rs.")}</div>
          </Card>
        ))}
      </div>

      <Card className="p-6">
        <div className="text-lg font-medium text-gray-900">History & Volume</div>
        <div className="mt-1 text-sm text-gray-600">Six-month shipment volume trend for quick context.</div>
        <div className="mt-5 flex items-end gap-2">
          {monthlyBars.values.map((item) => {
            const h = Math.max(12, Math.round((item.value / monthlyBars.max) * 120));
            return (
              <div key={item.key} className="flex flex-1 flex-col items-center gap-1">
                <div className="text-[11px] font-medium text-slate-700">{item.value}</div>
                <div className="w-full rounded-t-md bg-gradient-to-t from-brand to-emerald-400" style={{ height: `${h}px` }} />
                <div className="text-[10px] text-slate-500">{item.label}</div>
              </div>
            );
          })}
        </div>
        <div className="mt-6 rounded-2xl border border-[#E5E7EB] bg-[#F8FAF9] p-4 text-sm text-slate-600">Tracked this month: <span className="font-semibold text-slate-950">{(stats.trackingUsed ?? 0).toLocaleString()}</span></div>
      </Card>
    </div>
  );
}




