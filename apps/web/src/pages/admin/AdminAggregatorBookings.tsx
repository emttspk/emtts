import { useEffect, useState } from "react";
import { BodyText, PageShell, PageTitle } from "../../components/ui/PageSystem";
import Card from "../../components/Card";
import AggregatorBookingStatusBadge from "../../components/booking/AggregatorBookingStatusBadge";
import AggregatorBookingTimeline from "../../components/booking/AggregatorBookingTimeline";
import AggregatorBookingSummaryCard from "../../components/booking/AggregatorBookingSummaryCard";
import {
  adminApproveAggregatorBooking,
  adminMarkPendingAggregatorBooking,
  adminRejectAggregatorBooking,
  adminRequestCorrectionAggregatorBooking,
  getAdminAggregatorBooking,
  listAdminAggregatorBookings,
  type AggregatorBooking,
} from "../../lib/aggregatorBookings";

export default function AdminAggregatorBookings() {
  const [items, setItems] = useState<AggregatorBooking[]>([]);
  const [selected, setSelected] = useState<AggregatorBooking | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");

  async function load() {
    const list = await listAdminAggregatorBookings({ page: 1, pageSize: 50, status: statusFilter || undefined });
    setItems(list.items);
    if (selected) {
      const detail = await getAdminAggregatorBooking(selected.id);
      setSelected(detail.booking);
    }
  }

  useEffect(() => {
    let alive = true;
    setLoading(true);
    load()
      .catch((e) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Failed to load admin aggregator queue");
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [statusFilter]);

  async function openDetail(id: string) {
    setError(null);
    try {
      const detail = await getAdminAggregatorBooking(id);
      setSelected(detail.booking);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load booking detail");
    }
  }

  async function runAction(action: "approve" | "reject" | "correction" | "pending") {
    if (!selected) return;
    const reasonCode = window.prompt("Reason code", action.toUpperCase());
    if (!reasonCode) return;

    setBusy(true);
    setError(null);
    try {
      if (action === "approve") {
        await adminApproveAggregatorBooking(selected.id, { reasonCode, note: "Approved from admin queue", paymentStatus: "PENDING_PLACEHOLDER" });
      } else if (action === "reject") {
        await adminRejectAggregatorBooking(selected.id, { reasonCode, note: "Rejected from admin queue" });
      } else if (action === "correction") {
        await adminRequestCorrectionAggregatorBooking(selected.id, { reasonCode, note: "Correction requested from admin queue" });
      } else {
        await adminMarkPendingAggregatorBooking(selected.id, { reasonCode, note: "Marked pending from admin queue" });
      }
      await load();
      const detail = await getAdminAggregatorBooking(selected.id);
      setSelected(detail.booking);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Admin action failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell>
      <div className="space-y-4">
        <div>
          <PageTitle>Admin Aggregator Booking Queue</PageTitle>
          <BodyText className="mt-1">Separate queue for money-based Aggregator Booking draft review lifecycle.</BodyText>
        </div>

        {error ? <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div> : null}

        <Card className="border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <label className="text-xs text-slate-600">Status</label>
            <select className="rounded-md border border-slate-300 px-2 py-1 text-xs" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All</option>
              <option value="BOOKING_DRAFT">BOOKING_DRAFT</option>
              <option value="ADMIN_REVIEW_PENDING">ADMIN_REVIEW_PENDING</option>
              <option value="CORRECTION_REQUIRED">CORRECTION_REQUIRED</option>
              <option value="PAYMENT_PENDING_PLACEHOLDER">PAYMENT_PENDING_PLACEHOLDER</option>
            </select>
          </div>

          <div className="ui-table-scroll rounded-xl border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Booking</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Status</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Customer</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Intake</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Official Total</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {!loading && items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-sm text-slate-500">No aggregator bookings found.</td>
                  </tr>
                ) : null}
                {items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-3 py-2 text-xs font-semibold text-slate-800">{item.bookingNo}</td>
                    <td className="px-3 py-2"><AggregatorBookingStatusBadge status={item.status} /></td>
                    <td className="px-3 py-2 text-slate-700">{item.user?.email ?? item.senderName}</td>
                    <td className="px-3 py-2 text-slate-700">{item.intakeMethod}</td>
                    <td className="px-3 py-2 text-slate-700">PKR {new Intl.NumberFormat("en-PK", { maximumFractionDigits: 0 }).format(item.totalOfficialPostalCharge)}</td>
                    <td className="px-3 py-2">
                      <button type="button" className="rounded bg-slate-900 px-2 py-1 text-xs font-semibold text-white" onClick={() => openDetail(item.id)}>Open</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {selected ? (
          <>
            <AggregatorBookingSummaryCard booking={selected} />
            <Card className="border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-base font-semibold text-slate-900">Admin Review Actions</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" disabled={busy} onClick={() => runAction("approve")} className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-60">Approve</button>
                <button type="button" disabled={busy} onClick={() => runAction("reject")} className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-500 disabled:opacity-60">Reject</button>
                <button type="button" disabled={busy} onClick={() => runAction("correction")} className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-500 disabled:opacity-60">Request Correction</button>
                <button type="button" disabled={busy} onClick={() => runAction("pending")} className="rounded-md bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-600 disabled:opacity-60">Mark Pending</button>
              </div>
            </Card>

            <Card className="border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-base font-semibold text-slate-900">Status Timeline</h3>
              <div className="mt-3">
                <AggregatorBookingTimeline events={selected.statusEvents ?? []} />
              </div>
            </Card>
          </>
        ) : null}
      </div>
    </PageShell>
  );
}
