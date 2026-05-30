import { cn } from "../../lib/cn";

type Props = {
  status: string;
};

const STATUS_CLASS: Record<string, string> = {
  BOOKING_DRAFT: "bg-slate-100 text-slate-700 border-slate-200",
  BOOKING_SUBMITTED: "bg-cyan-50 text-cyan-700 border-cyan-200",
  ADMIN_REVIEW_PENDING: "bg-amber-50 text-amber-700 border-amber-200",
  CORRECTION_REQUIRED: "bg-orange-50 text-orange-700 border-orange-200",
  ADMIN_APPROVED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  ADMIN_REJECTED: "bg-rose-50 text-rose-700 border-rose-200",
  PAYMENT_PENDING_PLACEHOLDER: "bg-indigo-50 text-indigo-700 border-indigo-200",
  DROP_PENDING: "bg-lime-50 text-lime-700 border-lime-200",
  PICKUP_PENDING_FUTURE: "bg-violet-50 text-violet-700 border-violet-200",
  CANCELLED: "bg-zinc-100 text-zinc-700 border-zinc-200",
};

export default function AggregatorBookingStatusBadge({ status }: Props) {
  const normalized = String(status ?? "").trim().toUpperCase();
  const classes = STATUS_CLASS[normalized] ?? "bg-slate-100 text-slate-700 border-slate-200";

  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-wide", classes)}>
      {normalized || "UNKNOWN"}
    </span>
  );
}
