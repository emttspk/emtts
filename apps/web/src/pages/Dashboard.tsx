import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useOutletContext } from "react-router-dom";
import { AlertTriangle, ArrowRight, Boxes, Clock3, Loader2, Package2, ShieldCheck } from "lucide-react";
import Card from "../components/Card";
import type { MeResponse } from "../lib/types";
import ActionButton from "../components/ui/ActionButton";
import { BodyText, CardTitle, PageHeader, PageShell } from "../components/ui/PageSystem";
import StatsCard from "../components/ui/StatsCard";
import UnifiedShipmentCards from "../components/UnifiedShipmentCards";
import { useShipmentStats } from "../hooks/useShipmentStats";
import { formatComplaintLimitValue } from "../lib/complaintLimits";
import { api } from "../lib/api";

type ShellCtx = { me: MeResponse | null; refreshMe: () => Promise<void> };

const formatPKR = new Intl.NumberFormat("en-PK", {
  style: "currency",
  currency: "PKR",
  currencyDisplay: "code",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function DashboardSkeletonLine({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-full bg-slate-200 ${className}`} />;
}

function DashboardMetricCardSkeleton() {
  return (
    <Card className="min-h-[104px] rounded-2xl border border-[color:var(--line)] bg-[#F8FAFC] p-3">
      <DashboardSkeletonLine className="h-3 w-24" />
      <DashboardSkeletonLine className="mt-3 h-8 w-16" />
      <DashboardSkeletonLine className="mt-2 h-3 w-20" />
    </Card>
  );
}

export default function Dashboard() {
  const { me } = useOutletContext<ShellCtx>();
  const navigate = useNavigate();
  const { shipmentStats, shipmentStatsLoading } = useShipmentStats(me?.user?.id);
  const showStatsSkeleton = shipmentStatsLoading && !shipmentStats;

  const [queueHealth, setQueueHealth] = useState<{ queued: number; processing: number; retryPending: number; manualReview: number; failed: number; avgSecs: number } | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const isAdmin = me?.user?.role === "ADMIN";

  useEffect(() => {
    if (!isAdmin) return;
    setHealthLoading(true);
    api<{ queue: Array<{ complaintStatus: string; updatedAt: string }> }>("/api/admin/complaints/monitor")
      .then((data) => {
        const rows = data.queue ?? [];
        const q: Record<string, number> = { queued: 0, processing: 0, retry_pending: 0, manual_review: 0 };
        let totalSecs = 0;
        let doneCount = 0;
        for (const r of rows) {
          const s = r.complaintStatus;
          if (s in q) q[s]++;
          const created = new Date(r.updatedAt).getTime();
          if (["submitted", "duplicate"].includes(s) && created > Date.now() - 86400000) {
            doneCount++;
          }
        }
        setQueueHealth({
          queued: q.queued,
          processing: q.processing,
          retryPending: q.retry_pending,
          manualReview: q.manual_review,
          failed: 0,
          avgSecs: doneCount > 0 ? Math.round(totalSecs / doneCount) : 0,
        });
        setHealthLoading(false);
      })
      .catch(() => setHealthLoading(false));
  }, [isAdmin]);

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
      complaintOverdue: shipmentStats?.complaintOverdue ?? 0,
      complaintClosed: shipmentStats?.complaintClosed ?? 0,
      complaintReopened: shipmentStats?.complaintReopened ?? 0,
      complaintWatchAmount: shipmentStats?.complaintWatchAmount ?? 0,
      complaintActiveAmount: shipmentStats?.complaintActiveAmount ?? 0,
      complaintInProcessAmount: shipmentStats?.complaintInProcessAmount ?? 0,
      complaintOverdueAmount: shipmentStats?.complaintOverdueAmount ?? 0,
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
  const activePlanName = me?.subscription?.plan?.name ?? me?.activePackage?.planName ?? "Free Plan Available";
  const billingStatus = me?.subscription?.status ?? me?.activePackage?.status ?? "-";
  const complaintDaily = me?.balances?.complaintDailyLimit ?? me?.subscription?.plan?.dailyComplaintLimit ?? 0;
  const complaintMonthly = me?.balances?.complaintMonthlyLimit ?? me?.subscription?.plan?.monthlyComplaintLimit ?? 0;
  const complaintDailyLabel = formatComplaintLimitValue(complaintDaily);
  const complaintMonthlyLabel = formatComplaintLimitValue(complaintMonthly);
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
        title="ePost.pk Command Center"
        subtitle="Units, shipment status, and complaint workload in one view."
        actions={
          <>
            <Link to="/generate-labels">
              <ActionButton className="w-full sm:w-auto" leadingIcon={<Package2 className="h-4 w-4" />}>Generate labels</ActionButton>
            </Link>
            <Link to="/tracking-workspace">
              <ActionButton className="w-full sm:w-auto" variant="secondary" trailingIcon={<ArrowRight className="h-4 w-4" />}>Open tracking</ActionButton>
            </Link>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatsCard title="Active package" value={activePlanName} detail={`Status: ${billingStatus}`} icon={Boxes} tone="blue" />
        <StatsCard title="Remaining units" value={remainingUnits.toLocaleString()} detail={`${usedUnits.toLocaleString()} used of ${packageLimit.toLocaleString()}`} icon={Package2} tone="green" />
        <StatsCard title="Complaint limits" value={`Daily: ${complaintDailyLabel}`} detail={`Monthly: ${complaintMonthlyLabel}`} icon={ShieldCheck} tone="amber" />
        {showStatsSkeleton
          ? <DashboardMetricCardSkeleton />
          : <StatsCard title="Tracking used" value={stats.trackingUsed.toLocaleString()} detail="Tracking actions" icon={Clock3} tone="purple" />}
      </div>

      <div className="grid min-w-0 w-full gap-3 overflow-hidden xl:grid-cols-12">
        <Card className="min-w-0 w-full overflow-hidden xl:col-span-7 p-4 md:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Package summary</CardTitle>
              <BodyText className="mt-1">Plan, usage, limits.</BodyText>
            </div>
            <Link to="/update-package">
              <ActionButton variant="secondary" trailingIcon={<ArrowRight className="h-4 w-4" />}>Update package</ActionButton>
            </Link>
          </div>
          <div className="mt-3.5 grid gap-2 md:grid-cols-3">
            <div className="rounded-2xl border border-[color:var(--line)] bg-[#F8FAFC] p-3 min-h-[96px]">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Plan</div>
              <div className="mt-1.5 ui-cell-wrap text-base font-semibold text-[color:var(--text-strong)]">{activePlanName}</div>
            </div>
            <div className="rounded-2xl border border-[color:var(--line)] bg-[#F8FAFC] p-3 min-h-[96px]">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Shared units</div>
              <div className="mt-1.5 text-base font-semibold text-[color:var(--text-strong)]">{packageLimit.toLocaleString()}</div>
            </div>
            <div className="rounded-2xl border border-[color:var(--line)] bg-[#F8FAFC] p-3 min-h-[96px]">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Used</div>
              <div className="mt-1.5 text-base font-semibold text-[color:var(--text-strong)]">{usedUnits.toLocaleString()}</div>
            </div>
          </div>
          <div className="mt-3.5 h-2 rounded-full bg-emerald-100">
            <div className="h-2 rounded-full bg-[linear-gradient(90deg,#10B981,#2563EB)]" style={{ width: `${Math.max(0, Math.min(100, packageLimit ? Math.round((remainingUnits / packageLimit) * 100) : 0))}%` }} />
          </div>
        </Card>

        <Card className="min-w-0 w-full overflow-hidden xl:col-span-5 p-4 md:p-5">
          <CardTitle>Quick actions</CardTitle>
          <BodyText className="mt-1">Most-used actions.</BodyText>
          <div className="mt-3.5 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
            <Link to="/generate-labels"><ActionButton variant="secondary" className="w-full justify-between" trailingIcon={<ArrowRight className="h-4 w-4" />}>Generate labels</ActionButton></Link>
            <Link to="/generate-money-orders"><ActionButton variant="secondary" className="w-full justify-between" trailingIcon={<ArrowRight className="h-4 w-4" />}>Generate money order</ActionButton></Link>
            <Link to="/tracking-workspace"><ActionButton variant="secondary" className="w-full justify-between" trailingIcon={<ArrowRight className="h-4 w-4" />}>Tracking workspace</ActionButton></Link>
          </div>
        </Card>
      </div>

      {showStatsSkeleton ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <DashboardMetricCardSkeleton key={index} />
          ))}
        </div>
      ) : (
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
      )}

      <div className="grid min-w-0 w-full gap-3 overflow-hidden xl:grid-cols-12">
        {!showStatsSkeleton && stats.total === 0 ? (
          <Card className="min-w-0 w-full overflow-hidden xl:col-span-12 border border-emerald-200 bg-emerald-50 p-5 md:p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-lg font-bold text-emerald-900">Welcome to ePost.pk</div>
                <p className="mt-1 max-w-lg text-sm leading-6 text-emerald-800">Upload your first file to generate labels and start tracking shipments.</p>
              </div>
              <Link to="/generate-labels">
                <ActionButton className="shrink-0" leadingIcon={<Package2 className="h-4 w-4" />}>Generate First Label</ActionButton>
              </Link>
            </div>
          </Card>
        ) : null}
        <Card className="min-w-0 w-full overflow-hidden xl:col-span-8 p-4 md:p-5">
          <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Shipment Status</div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {showStatsSkeleton ? Array.from({ length: 9 }).map((_, index) => (
              <div
                key={index}
                className="rounded-2xl border border-[color:var(--line)] bg-[#F8FAFC] p-3 min-h-[104px]"
              >
                <DashboardSkeletonLine className="h-3 w-24" />
                <DashboardSkeletonLine className="mt-3 h-8 w-16" />
                <DashboardSkeletonLine className="mt-2 h-3 w-20" />
              </div>
            )) : [
              { label: "Delivered", count: stats.delivered, amount: stats.deliveredAmount, filter: "DELIVERED", tone: "text-emerald-700" },
              { label: "Pending", count: stats.pending, amount: stats.pendingAmount, filter: "PENDING", tone: "text-amber-700" },
              { label: "Returned", count: stats.returned, amount: stats.returnedAmount, filter: "RETURNED", tone: "text-red-700" },
              { label: "Complaint Watch", count: stats.complaintWatch, amount: stats.complaintWatchAmount, filter: "COMPLAINT_WATCH", tone: "text-slate-900" },
              { label: "Total Complaints", count: stats.complaints, amount: stats.complaintAmount, filter: "COMPLAINT_TOTAL", tone: "text-violet-700" },
              { label: "Active Complaints", count: stats.complaintActive, amount: stats.complaintActiveAmount, filter: "COMPLAINT_ACTIVE", tone: "text-amber-800" },
              { label: "Closed Complaints", count: stats.complaintClosed, amount: stats.complaintClosedAmount, filter: "COMPLAINT_CLOSED", tone: "text-emerald-800" },
              { label: "Reopened Complaints", count: stats.complaintReopened, amount: stats.complaintReopenedAmount, filter: "COMPLAINT_REOPENED", tone: "text-violet-700" },
              { label: "Overdue Complaints", count: stats.complaintOverdue, amount: stats.complaintOverdueAmount, filter: "COMPLAINT_OVERDUE", tone: "text-orange-700" },
            ].map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => navigateToTrackingFilter(item.filter)}
                className="rounded-2xl border border-[color:var(--line)] bg-[#F8FAFC] p-3 text-left transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white min-h-[104px]"
              >
                <div className="text-xs text-slate-500">{item.label}</div>
                <div className={`mt-1 text-[1.4rem] font-bold ${item.tone}`}>{item.count.toLocaleString()}</div>
                <div className="mt-0.5 text-xs font-semibold text-slate-600">{formatPKR.format(item.amount ?? 0)}</div>
              </button>
            ))}
          </div>
        </Card>

        <Card className="min-w-0 w-full overflow-hidden xl:col-span-4 p-4 md:p-5">
          <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">6 Day Activity</div>
          <div className="mt-3 flex items-end gap-1.5">
            {showStatsSkeleton ? Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="flex flex-1 flex-col items-center gap-1">
                <DashboardSkeletonLine className="h-3 w-6" />
                <div
                  className="w-full animate-pulse rounded-md bg-slate-200"
                  style={{ height: 32 + (index % 4) * 18 }}
                />
                <DashboardSkeletonLine className="h-3 w-8" />
              </div>
            )) : activity.length > 0 ? activity.map((item) => {
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

      {isAdmin || queueHealth ? (
        <div className="grid min-w-0 w-full gap-3 overflow-hidden xl:grid-cols-12">
          <Card className="min-w-0 w-full overflow-hidden xl:col-span-5 p-4 md:p-5">
            <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Complaint Queue Health</div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {healthLoading ? (
                <div className="col-span-3 flex items-center justify-center py-6 text-sm text-slate-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading queue health...</div>
              ) : queueHealth ? (
                <>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="text-xs text-slate-500">Queued</div>
                    <div className="text-lg font-bold text-slate-800">{queueHealth.queued}</div>
                  </div>
                  <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
                    <div className="text-xs text-slate-500">Processing</div>
                    <div className="text-lg font-bold text-blue-800">{queueHealth.processing}</div>
                  </div>
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                    <div className="text-xs text-slate-500">Retry Pending</div>
                    <div className="text-lg font-bold text-amber-800">{queueHealth.retryPending}</div>
                  </div>
                  <div className="rounded-xl border border-red-200 bg-red-50 p-3">
                    <div className="text-xs text-slate-500">Manual Review</div>
                    <div className="text-lg font-bold text-red-800">{queueHealth.manualReview}</div>
                  </div>
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                    <div className="text-xs text-slate-500">24h Avg Duration</div>
                    <div className="text-lg font-bold text-emerald-800">{queueHealth.avgSecs > 0 ? `${queueHealth.avgSecs}s` : "-"}</div>
                  </div>
                  <div className="rounded-xl border border-violet-200 bg-violet-50 p-3">
                    <div className="text-xs text-slate-500">Circuit Breaker</div>
                    <div className="text-lg font-bold text-violet-800">-</div>
                  </div>
                </>
              ) : (
                <div className="col-span-3 rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">Queue health available for admin accounts.</div>
              )}
            </div>
          </Card>

          <Card className="min-w-0 w-full overflow-hidden xl:col-span-7 p-4 md:p-5">
            <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Complaint Health</div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <button type="button" onClick={() => navigateToTrackingFilter("COMPLAINT_ACTIVE")} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-left transition hover:-translate-y-0.5 hover:border-amber-300">
                <div className="text-xs text-amber-600">Active</div>
                <div className="mt-1 text-lg font-bold text-amber-800">{stats.complaintActive}</div>
              </button>
              <button type="button" onClick={() => navigateToTrackingFilter("COMPLAINT_OVERDUE")} className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-left transition hover:-translate-y-0.5 hover:border-orange-300">
                <div className="text-xs text-orange-600">Overdue</div>
                <div className="mt-1 text-lg font-bold text-orange-800">{stats.complaintOverdue}</div>
              </button>
              <button type="button" onClick={() => navigateToTrackingFilter("COMPLAINT_REOPENED")} className="rounded-xl border border-violet-200 bg-violet-50 p-3 text-left transition hover:-translate-y-0.5 hover:border-violet-300">
                <div className="text-xs text-violet-600">Reopened</div>
                <div className="mt-1 text-lg font-bold text-violet-800">{stats.complaintReopened}</div>
              </button>
              <button type="button" onClick={() => navigateToTrackingFilter("COMPLAINT_TOTAL")} className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-left transition hover:-translate-y-0.5 hover:border-sky-300">
                <div className="text-xs text-sky-600">Total Complaints</div>
                <div className="mt-1 text-lg font-bold text-sky-800">{stats.complaints}</div>
              </button>
              <button type="button" onClick={() => navigateToTrackingFilter("COMPLAINT_WATCH")} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-left transition hover:-translate-y-0.5 hover:border-slate-300">
                <div className="text-xs text-slate-600">Complaint Watch</div>
                <div className="mt-1 text-lg font-bold text-slate-800">{stats.complaintWatch}</div>
              </button>
              <button type="button" onClick={() => navigateToTrackingFilter("COMPLAINT_CLOSED")} className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-left transition hover:-translate-y-0.5 hover:border-emerald-300">
                <div className="text-xs text-emerald-600">Resolved/Closed</div>
                <div className="mt-1 text-lg font-bold text-emerald-800">{stats.complaintClosed}</div>
              </button>
            </div>
          </Card>
        </div>
      ) : null}
    </PageShell>
  );
}
