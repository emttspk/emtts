import type { AggregatorBooking } from "../../lib/aggregatorBookings";
import Card from "../Card";

type Props = {
  booking: AggregatorBooking;
};

function money(value: number) {
  return new Intl.NumberFormat("en-PK", { maximumFractionDigits: 0 }).format(value ?? 0);
}

export default function AggregatorBookingSummaryCard({ booking }: Props) {
  return (
    <Card className="border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-base font-semibold text-slate-900">Official Postal Charge Summary</h3>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">Articles: <span className="font-semibold">{booking.totalArticles}</span></div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">Base: <span className="font-semibold">PKR {money(booking.totalBasePostage)}</span></div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">Registration: <span className="font-semibold">PKR {money(booking.totalRegistrationFee)}</span></div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">Value Payable: <span className="font-semibold">PKR {money(booking.totalValuePayableFee)}</span></div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">Insurance: <span className="font-semibold">PKR {money(booking.totalInsuranceFee)}</span></div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">Official Total: <span className="font-semibold">PKR {money(booking.totalOfficialPostalCharge)}</span></div>
      </div>
    </Card>
  );
}
