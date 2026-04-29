import { useEffect, useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { ArrowRight, Clock3, CreditCard, Package2, RadioTower, Wallet } from "lucide-react";
import Card from "../components/Card";
import { api } from "../lib/api";
import type { MeResponse } from "../lib/types";
import { computeStats, getFinalTrackingData } from "../lib/trackingData";
import { resolvePackageMeta } from "../lib/packageCatalog";

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

const formatPKR = new Intl.NumberFormat("en-PK", {
  style: "currency",
  currency: "PKR",
  currencyDisplay: "code",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

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
      totalAmount: shipmentStats?.totalAmount ?? 0,
      trackingUsed: shipmentStats?.trackingUsed ?? 0,
      graphData: shipmentStats?.graphData ?? [],
    }),
    [shipmentStats],
  );

  const remainingUnits = me?.balances?.unitsRemaining ?? me?.activePackage?.unitsRemaining ?? 0;
  const packageLimit = me?.balances?.labelLimit ?? me?.subscription?.plan?.monthlyLabelLimit ?? 0;
  const usedUnits = Math.max(0, packageLimit - remainingUnits);
  const activePlanName = me?.subscription?.plan?.name ?? me?.activePackage?.planName ?? "BUSINESS";
  const packageMeta = resolvePackageMeta(activePlanName);

  const activity = useMemo(() => [...stats.graphData].slice(-6), [stats.graphData]);
  const maxActivity = Math.max(1, ...activity.map((item) => item.total));

  const summaryCards = [
    { label: "Money Order Total", value: formatPKR.format(stats.totalAmount).replace("PKR", "Rs."), icon: CreditCard },
    { label: "Label Total", value: stats.total.toLocaleString(), icon: Wallet },
    { label: "Tracking Total", value: stats.trackingUsed.toLocaleString(), icon: RadioTower },
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-4 border-slate-200 bg-[linear-gradient(155deg,#0f172a,#122136)] p-5 text-white shadow-[0_20px_60px_rgba(15,23,42,0.25)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200">Current Package</div>
              <div className="mt-2 text-2xl font-semibold">{packageMeta.displayName}</div>
            </div>
            <Package2 className="h-5 w-5 text-emerald-300" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
              <div className="text-slate-300">Limit</div>
              <div className="mt-1 font-semibold text-white">{packageLimit.toLocaleString()}</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
              <div className="text-slate-300">Used</div>
              <div className="mt-1 font-semibold text-white">{usedUnits.toLocaleString()}</div>
            </div>
          </div>
          <Link to="/update-package" className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-brand">
            Update Package <ArrowRight className="h-4 w-4" />
          </Link>
        </Card>

        <Card className="xl:col-span-4 border-emerald-200 bg-[linear-gradient(150deg,#ecfdf5,#d1fae5)] p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Remaining Units</div>
          <div className="mt-3 text-5xl font-extrabold tracking-[-0.03em] text-emerald-900">{remainingUnits.toLocaleString()}</div>
          <div className="mt-2 text-sm font-medium text-emerald-800">Formula: limit - used = remaining</div>
          <div className="mt-4 h-2 rounded-full bg-emerald-100">
            <div
              className="h-2 rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400"
              style={{ width: `${Math.max(0, Math.min(100, packageLimit ? Math.round((remainingUnits / packageLimit) * 100) : 0))}%` }}
            />
          </div>
        </Card>

        <Card className="xl:col-span-4 p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Quick Actions</div>
          <div className="mt-3 grid gap-2">
            <Link to="/generate-labels" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800 hover:border-brand/30">Generate Labels</Link>
            <Link to="/generate-money-orders" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800 hover:border-brand/30">Generate Money Order</Link>
            <Link to="/tracking-workspace" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800 hover:border-brand/30">Tracking Workspace</Link>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {summaryCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.label} className="p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-600">{card.label}</div>
                <Icon className="h-4 w-4 text-brand" />
              </div>
              <div className="mt-3 text-2xl font-bold text-slate-950">{card.value}</div>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-8 p-5">
          <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Shipment Status</div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="text-xs text-slate-500">Delivered</div>
              <div className="mt-1 text-2xl font-bold text-emerald-700">{stats.delivered.toLocaleString()}</div>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="text-xs text-slate-500">Pending</div>
              <div className="mt-1 text-2xl font-bold text-amber-700">{stats.pending.toLocaleString()}</div>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="text-xs text-slate-500">Returned</div>
              <div className="mt-1 text-2xl font-bold text-red-700">{stats.returned.toLocaleString()}</div>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="text-xs text-slate-500">Complaints Watch</div>
              <div className="mt-1 flex items-center gap-2 text-2xl font-bold text-slate-900">
                <Clock3 className="h-5 w-5 text-brand" />
                {stats.pending.toLocaleString()}
              </div>
            </div>
          </div>
        </Card>

        <Card className="xl:col-span-4 p-5">
          <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">6 Day Activity</div>
          <div className="mt-4 flex items-end gap-2">
            {activity.length > 0 ? activity.map((item) => {
              const height = Math.max(16, Math.round((item.total / maxActivity) * 120));
              return (
                <div key={item.date} className="flex flex-1 flex-col items-center gap-1">
                  <div className="text-[11px] font-semibold text-slate-700">{item.total}</div>
                  <div className="w-full rounded-md bg-gradient-to-t from-[#0f172a] to-emerald-500" style={{ height }} />
                  <div className="text-[10px] text-slate-500">{item.date.slice(5)}</div>
                </div>
              );
            }) : <div className="w-full rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">No activity yet.</div>}
          </div>
        </Card>
      </div>

      {error ? (
        <Card className="border-red-200 bg-red-50 p-4">
          <div className="text-sm font-medium text-red-800">{error}</div>
        </Card>
      ) : null}
    </div>
  );
}
