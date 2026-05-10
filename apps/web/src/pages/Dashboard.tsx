import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useOutletContext } from "react-router-dom";
import { ArrowRight, CreditCard, Package2, RadioTower, Wallet, AlertCircle } from "lucide-react";
import Card from "../components/Card";
import type { MeResponse } from "../lib/types";
import { BodyText, CardTitle, PageShell, PageTitle } from "../components/ui/PageSystem";
import UnifiedShipmentCards from "../components/UnifiedShipmentCards";
import { useShipmentStats } from "../hooks/useShipmentStats";

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
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const { shipmentStats, refreshShipmentStats } = useShipmentStats();

  useEffect(() => {
    let ok = true;
    setError(null);
    Promise.all([refreshShipmentStats()]).catch((e) => {
      if (!ok) return;
      setError(e instanceof Error ? e.message : "Failed to load shipments");
    });
    return () => {
      ok = false;
    };
  }, [refreshShipmentStats]);

  const stats = useMemo(
    () => ({
      total: shipmentStats?.total ?? 0,
      delivered: shipmentStats?.delivered ?? 0,
      pending: shipmentStats?.pending ?? 0,
      returned: shipmentStats?.returned ?? 0,
      complaints: shipmentStats?.complaints ?? 0,
      complaintWatch: shipmentStats?.complaintWatch ?? 0,
      totalAmount: shipmentStats?.totalAmount ?? 0,
      deliveredAmount: shipmentStats?.deliveredAmount ?? 0,
      pendingAmount: shipmentStats?.pendingAmount ?? 0,
      returnedAmount: shipmentStats?.returnedAmount ?? 0,
      complaintAmount: shipmentStats?.complaintAmount ?? 0,
      complaintActive: shipmentStats?.complaintActive ?? 0,
      complaintInProcess: shipmentStats?.complaintInProcess ?? 0,
      complaintClosed: shipmentStats?.complaintClosed ?? 0,
      complaintReopened: shipmentStats?.complaintReopened ?? 0,
      complaintWatchAmount: shipmentStats?.complaintWatchAmount ?? 0,
      complaintActiveAmount: shipmentStats?.complaintActiveAmount ?? 0,
      complaintInProcessAmount: shipmentStats?.complaintInProcessAmount ?? 0,
      complaintClosedAmount: shipmentStats?.complaintClosedAmount ?? 0,
      complaintReopenedAmount: shipmentStats?.complaintReopenedAmount ?? 0,
      trackingUsed: shipmentStats?.trackingUsed ?? 0,
      graphData: shipmentStats?.graphData ?? [],
    }),
    [shipmentStats],
  );

  const remainingUnits = me?.balances?.unitsRemaining ?? me?.activePackage?.unitsRemaining ?? 0;
  const packageLimit = me?.balances?.labelLimit ?? me?.subscription?.plan?.monthlyLabelLimit ?? 0;
  const usedUnits = Math.max(0, packageLimit - remainingUnits);
  const activePlanName = me?.subscription?.plan?.name ?? me?.activePackage?.planName ?? "No active plan";
  const complaintDaily = me?.balances?.complaintDailyLimit ?? me?.subscription?.plan?.dailyComplaintLimit ?? 0;
  const complaintMonthly = me?.balances?.complaintMonthlyLimit ?? me?.subscription?.plan?.monthlyComplaintLimit ?? 0;

  const activity = useMemo(() => [...stats.graphData].slice(-6), [stats.graphData]);
  const maxActivity = useMemo(() => Math.max(1, ...activity.map((item) => item.total)), [activity]);

  const summaryCards = [
    { key: "ALL" as const, label: "Total", parcels: stats.total, amount: stats.totalAmount },
    { key: "DELIVERED" as const, label: "Delivered", parcels: stats.delivered, amount: stats.deliveredAmount },
    { key: "PENDING" as const, label: "Pending", parcels: stats.pending, amount: stats.pendingAmount },
    { key: "RETURNED" as const, label: "Returned", parcels: stats.returned, amount: stats.returnedAmount },
    { key: "COMPLAINTS" as const, label: "Complaints", parcels: stats.complaints, amount: stats.complaintAmount },
  ];

  const navigateToTrackingFilter = (filter: string) => {
    navigate(`/tracking-workspace?status=${encodeURIComponent(filter)}`);
  };

  return (
    <PageShell className="space-y-3">
      <div className="grid min-w-0 w-full gap-3 overflow-hidden xl:grid-cols-12">
        <Card className="min-w-0 w-full overflow-hidden xl:col-span-4 border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Current Package</div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">{activePlanName}</div>
            </div>
            <Package2 className="h-5 w-5 text-brand" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="text-slate-500">Total Shared Units</div>
              <div className="mt-1 font-semibold text-slate-900">{packageLimit.toLocaleString()}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="text-slate-500">Used</div>
              <div className="mt-1 font-semibold text-slate-900">{usedUnits.toLocaleString()}</div>
            </div>
          </div>
          <div className="mt-3 space-y-1 text-sm text-slate-700">
            <div>Services Included: ✔ Labels ✔ Tracking ✔ Money Orders ✔ Complaints</div>
            <div>Complaint Limits: {complaintDaily}/day, {complaintMonthly}/month</div>
          </div>
          <Link to="/update-package" className="mt-4 inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white">
            Update Package <ArrowRight className="h-4 w-4" />
          </Link>
        </Card>

        <Card className="min-w-0 w-full overflow-hidden xl:col-span-4 border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Remaining Units</div>
          <div className="mt-3 text-5xl font-extrabold tracking-[-0.03em] text-emerald-900">{remainingUnits.toLocaleString()}</div>
          <div className="mt-4 h-2 rounded-full bg-emerald-100">
            <div
              className="h-2 rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400"
              style={{ width: `${Math.max(0, Math.min(100, packageLimit ? Math.round((remainingUnits / packageLimit) * 100) : 0))}%` }}
            />
          </div>
        </Card>

        <Card className="min-w-0 w-full overflow-hidden xl:col-span-4 border-slate-200 bg-white p-5 shadow-sm">
          <CardTitle className="uppercase tracking-[0.1em] text-slate-600">Quick Actions</CardTitle>
          <div className="mt-3 grid gap-2">
            <Link to="/generate-labels" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800 hover:border-brand/30">Generate Labels</Link>
            <Link to="/generate-money-orders" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800 hover:border-brand/30">Generate Money Order</Link>
            <Link to="/tracking-workspace" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800 hover:border-brand/30">Tracking Workspace</Link>
          </div>
        </Card>
      </div>

      <UnifiedShipmentCards
        items={summaryCards}
        onSelect={(key) => {
          if (key === "COMPLAINTS") {
            navigateToTrackingFilter("COMPLAINT_TOTAL");
            return;
          }
          navigateToTrackingFilter(key);
        }}
      />

      <div className="grid min-w-0 w-full gap-3 overflow-hidden xl:grid-cols-12">
        <Card className="min-w-0 w-full overflow-hidden xl:col-span-8 p-5">
          <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Shipment Status</div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { label: "Delivered", count: stats.delivered, amount: stats.deliveredAmount, filter: "DELIVERED", tone: "text-emerald-700" },
              { label: "Pending", count: stats.pending, amount: stats.pendingAmount, filter: "PENDING", tone: "text-amber-700" },
              { label: "Returned", count: stats.returned, amount: stats.returnedAmount, filter: "RETURNED", tone: "text-red-700" },
              { label: "Complaint Watch", count: stats.complaintWatch, amount: stats.complaintWatchAmount, filter: "COMPLAINT_WATCH", tone: "text-slate-900" },
              { label: "Total Complaints", count: stats.complaints, amount: stats.complaintAmount, filter: "COMPLAINT_TOTAL", tone: "text-violet-700" },
              { label: "Active Complaints", count: stats.complaintActive, amount: stats.complaintActiveAmount, filter: "COMPLAINT_ACTIVE", tone: "text-amber-800" },
              { label: "Closed Complaints", count: stats.complaintClosed, amount: stats.complaintClosedAmount, filter: "COMPLAINT_CLOSED", tone: "text-emerald-800" },
              { label: "Reopened Complaints", count: stats.complaintReopened, amount: stats.complaintReopenedAmount, filter: "COMPLAINT_REOPENED", tone: "text-violet-700" },
              { label: "In Process Complaints", count: stats.complaintInProcess, amount: stats.complaintInProcessAmount, filter: "COMPLAINT_IN_PROCESS", tone: "text-sky-700" },
            ].map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => navigateToTrackingFilter(item.filter)}
                className="rounded-xl bg-slate-50 p-3 text-left hover:bg-slate-100"
              >
                <div className="text-xs text-slate-500">{item.label}</div>
                <div className={`mt-1 text-2xl font-bold ${item.tone}`}>{item.count.toLocaleString()}</div>
                <div className="mt-1 text-xs font-semibold text-slate-600">{formatPKR.format(item.amount ?? 0)}</div>
              </button>
            ))}
          </div>
        </Card>

        <Card className="min-w-0 w-full overflow-hidden xl:col-span-4 p-5">
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
    </PageShell>
  );
}
