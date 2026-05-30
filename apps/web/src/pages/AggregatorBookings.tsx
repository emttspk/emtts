import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Card from "../components/Card";
import { PageShell, PageTitle, BodyText } from "../components/ui/PageSystem";
import AggregatorBookingStatusBadge from "../components/booking/AggregatorBookingStatusBadge";
import { listMyAggregatorBookings, type AggregatorBooking } from "../lib/aggregatorBookings";

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
            Separate money-based booking lane with draft submission and admin review timeline.
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
                    <td className="px-3 py-2"><AggregatorBookingStatusBadge status={booking.status} /></td>
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
