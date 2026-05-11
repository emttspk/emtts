import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useOutletContext } from "react-router-dom";
import { ArrowRight, Boxes, Clock3, Package2, ShieldCheck } from "lucide-react";
import Card from "../components/Card";
import type { MeResponse } from "../lib/types";
import ActionButton from "../components/ui/ActionButton";
import { BodyText, CardTitle, PageHeader, PageShell } from "../components/ui/PageSystem";
import StatsCard from "../components/ui/StatsCard";
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
  const billingStatus = me?.subscription?.status ?? me?.activePackage?.status ?? "-";
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
    <PageShell className="space-y-5">
      <PageHeader
        eyebrow="Dashboard"
        title="Logistics overview"
        subtitle="Monitor units, shipment flow, and complaint workload from one place."
        actions={
          <>
            <Link to="/generate-labels">
              <ActionButton leadingIcon={<Package2 className="h-4 w-4" />}>Generate labels</ActionButton>
            </Link>
            <Link to="/tracking-workspace">
              <ActionButton variant="secondary" trailingIcon={<ArrowRight className="h-4 w-4" />}>Open tracking</ActionButton>
            </Link>
          </>
        }
      />

      <div className="grid gap-3 xl:grid-cols-4">
        <StatsCard title="Active package" value={activePlanName} detail={`Status: ${billingStatus}`} icon={Boxes} tone="blue" />
        <StatsCard title="Remaining units" value={remainingUnits.toLocaleString()} detail={`${usedUnits.toLocaleString()} used of ${packageLimit.toLocaleString()}`} icon={Package2} tone="green" />
        <StatsCard title="Complaint limits" value={`${complaintDaily}/${complaintMonthly}`} detail="Daily / monthly" icon={ShieldCheck} tone="amber" />
        <StatsCard title="Tracking used" value={stats.trackingUsed.toLocaleString()} detail="Tracking actions" icon={Clock3} tone="purple" />
      </div>

      <div className="grid min-w-0 w-full gap-3 overflow-hidden xl:grid-cols-12">
        <Card className="min-w-0 w-full overflow-hidden xl:col-span-7 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <CardTitle>Package summary</CardTitle>
              <BodyText className="mt-1">Plan, usage, and limits.</BodyText>
            </div>
            <Link to="/update-package">
              <ActionButton variant="secondary" trailingIcon={<ArrowRight className="h-4 w-4" />}>Update package</ActionButton>
            </Link>
          </div>
          <div className="mt-4 grid gap-2.5 md:grid-cols-3">
            <div className="rounded-2xl border border-[color:var(--line)] bg-[#F8FAFC] p-3.5">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Plan</div>
              <div className="mt-2 text-lg font-semibold text-[color:var(--text-strong)]">{activePlanName}</div>
            </div>
            <div className="rounded-2xl border border-[color:var(--line)] bg-[#F8FAFC] p-3.5">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Shared units</div>
              <div className="mt-2 text-lg font-semibold text-[color:var(--text-strong)]">{packageLimit.toLocaleString()}</div>
            </div>
            <div className="rounded-2xl border border-[color:var(--line)] bg-[#F8FAFC] p-3.5">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Used</div>
              <div className="mt-2 text-lg font-semibold text-[color:var(--text-strong)]">{usedUnits.toLocaleString()}</div>
            </div>
          </div>
          <div className="mt-4 h-2 rounded-full bg-emerald-100">
            <div className="h-2 rounded-full bg-[linear-gradient(90deg,#10B981,#2563EB)]" style={{ width: `${Math.max(0, Math.min(100, packageLimit ? Math.round((remainingUnits / packageLimit) * 100) : 0))}%` }} />
          </div>
        </Card>

        <Card className="min-w-0 w-full overflow-hidden xl:col-span-5 p-5">
          <CardTitle>Quick actions</CardTitle>
          <BodyText className="mt-1">Common tasks.</BodyText>
          <div className="mt-4 grid gap-2.5 sm:grid-cols-3 xl:grid-cols-1">
            <Link to="/generate-labels"><ActionButton variant="secondary" className="w-full justify-between" trailingIcon={<ArrowRight className="h-4 w-4" />}>Generate labels</ActionButton></Link>
            <Link to="/generate-money-orders"><ActionButton variant="secondary" className="w-full justify-between" trailingIcon={<ArrowRight className="h-4 w-4" />}>Generate money order</ActionButton></Link>
            <Link to="/tracking-workspace"><ActionButton variant="secondary" className="w-full justify-between" trailingIcon={<ArrowRight className="h-4 w-4" />}>Tracking workspace</ActionButton></Link>
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
          <div className="mt-3.5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
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
                className="rounded-2xl border border-[color:var(--line)] bg-[#F8FAFC] p-3.5 text-left transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white"
              >
                <div className="text-xs text-slate-500">{item.label}</div>
                <div className={`mt-1 text-[1.6rem] font-bold ${item.tone}`}>{item.count.toLocaleString()}</div>
                <div className="mt-1 text-xs font-semibold text-slate-600">{formatPKR.format(item.amount ?? 0)}</div>
              </button>
            ))}
          </div>
        </Card>

        <Card className="min-w-0 w-full overflow-hidden xl:col-span-4 p-5">
          <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">6 Day Activity</div>
          <div className="mt-3.5 flex items-end gap-1.5">
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
