import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Card from "../components/Card";
import { PageShell, PageTitle, BodyText } from "../components/ui/PageSystem";
import AggregatorBookingStatusBadge from "../components/booking/AggregatorBookingStatusBadge";
import { listMyAggregatorBookings, type AggregatorBooking } from "../lib/aggregatorBookings";

function getCustomerStatusLabel(status: string) {
  switch (status) {
    case "BOOKING_DRAFT":
      return "Draft";
    case "BOOKING_SUBMITTED":
      return "Submitted for review";
    case "ADMIN_REVIEW_PENDING":
      return "Under admin review";
    case "ADMIN_APPROVED":
    case "PAYMENT_PENDING_PLACEHOLDER":
      return "Approved for manual action";
    case "CORRECTION_REQUIRED":
      return "Correction required";
    case "ADMIN_REJECTED":
      return "Rejected";
    case "CANCELLED":
      return "Cancelled";
    default:
      return status;
  }
}

function getPhase3C2Label(currentState?: string | null) {
  if (!currentState || currentState === "NOT_STARTED") return "Warehouse receiving pending";
  if (currentState === "HUB_RECEIVED") return "Warehouse received";
  if (currentState === "MANIFEST_VERIFIED") return "Manifest verified";
  if (currentState === "MISMATCH_RECORDED") return "Mismatch under manual resolution";
  if (currentState === "EXCEPTION_RESOLVED") return "Mismatch resolved manually";
  return currentState;
}

function getPhase3C3Label(currentState?: string | null) {
  if (!currentState || currentState === "NOT_STARTED") return null;
  if (currentState === "DRIVER_HANDOFF_RECORDED") return "Driver handoff recorded";
  if (currentState === "HUB_SORTING_DISPATCHED") return "Dispatched to sorting facility";
  if (currentState === "INTER_FACILITY_TRANSFER_RECORDED") return "Inter-facility transfer recorded";
  if (currentState === "READY_FOR_FINAL_POSTAL_PROCESSING") return "Ready for final postal processing";
  return currentState;
}

function getPhase3C4Label(currentState?: string | null) {
  if (!currentState || currentState === "NOT_STARTED") return null;
  if (currentState === "READINESS_CHECKED") return "Final processing readiness checked";
  if (currentState === "PACKET_PREPARED") return "Manual processing packet prepared";
  if (currentState === "PACKET_EXPORTED") return "Manual processing packet exported";
  if (currentState === "REVIEW_COMPLETED") return "Final processing review completed";
  return currentState;
}

export default function AggregatorBookings() {
  const [bookings, setBookings] = useState<AggregatorBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    listMyAggregatorBookings({ page: 1, pageSize: 50 })
      .then((res) => {
        if (!alive) return;
        setBookings(res.items);
      })
      .catch((e) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Failed to load aggregator bookings");
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  return (
    <PageShell>
      <div className="space-y-4">
        <div>
          <PageTitle>Aggregator Bookings</PageTitle>
          <BodyText className="mt-1">
            Separate money-based booking lane with manual-review workflow. This is not final booking confirmation.
          </BodyText>
        </div>

        <Card className="border-slate-200 bg-white p-5 shadow-sm">
          {error ? <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div> : null}

          <div className="ui-table-scroll mt-2 rounded-xl border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Booking No</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Status</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Sender</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Intake</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Official Total</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {!loading && bookings.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-sm text-slate-500">No aggregator bookings found. Create one from Booking Quote.</td>
                  </tr>
                ) : null}

                {bookings.map((booking) => (
                  <tr key={booking.id}>
                    <td className="px-3 py-2 text-xs font-semibold text-slate-800">
                      <Link className="text-emerald-700 hover:underline" to={`/aggregator-bookings/${booking.id}`}>{booking.bookingNo}</Link>
                    </td>
                    <td className="px-3 py-2">
                      <AggregatorBookingStatusBadge status={booking.status} />
                      <div className="mt-1 text-[11px] text-slate-500">{getCustomerStatusLabel(booking.status)}</div>
                      <div className="mt-1 text-[11px] text-sky-700">{getPhase3C2Label(booking.phase3c2Operational?.currentState)}</div>
                      <div className="text-[11px] text-slate-500">This is warehouse receiving status only. Final article processing is separate.</div>
                      {getPhase3C3Label(booking.phase3c3Operational?.currentState) ? (
                        <div className="mt-1 text-[11px] text-sky-600">{getPhase3C3Label(booking.phase3c3Operational?.currentState)}</div>
                      ) : null}
                      {getPhase3C4Label(booking.phase3c4FinalProcessing?.currentState) ? (
                        <div className="mt-1 text-[11px] text-emerald-700">{getPhase3C4Label(booking.phase3c4FinalProcessing?.currentState)}</div>
                      ) : null}
                      <div className="text-[11px] text-emerald-700">Your articles are ready for final postal processing review. This is not final Pakistan Post booking confirmation.</div>
                    </td>
                    <td className="px-3 py-2 text-slate-700">{booking.senderName}</td>
                    <td className="px-3 py-2 text-slate-700">{booking.intakeMethod}</td>
                    <td className="px-3 py-2 text-slate-700">PKR {new Intl.NumberFormat("en-PK", { maximumFractionDigits: 0 }).format(booking.totalOfficialPostalCharge)}</td>
                    <td className="px-3 py-2 text-slate-500">{new Date(booking.updatedAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </PageShell>
  );
}
