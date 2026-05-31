import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import Card from "../components/Card";
import { PageShell, PageTitle, BodyText } from "../components/ui/PageSystem";
import AggregatorBookingDraftForm from "../components/booking/AggregatorBookingDraftForm";
import AggregatorBookingStatusBadge from "../components/booking/AggregatorBookingStatusBadge";
import AggregatorBookingSummaryCard from "../components/booking/AggregatorBookingSummaryCard";
import AggregatorBookingTimeline from "../components/booking/AggregatorBookingTimeline";
import {
  cancelMyAggregatorBooking,
  getMyAggregatorBooking,
  getMyAggregatorBookingTimeline,
  submitMyAggregatorBooking,
  updateMyAggregatorBookingDraft,
  type AggregatorBooking,
  type AggregatorBookingTimelineEvent,
  type BookingSenderPayload,
} from "../lib/aggregatorBookings";

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

export default function AggregatorBookingDetail() {
  const params = useParams<{ bookingId: string }>();
  const bookingId = String(params.bookingId ?? "").trim();
  const [booking, setBooking] = useState<AggregatorBooking | null>(null);
  const [timeline, setTimeline] = useState<AggregatorBookingTimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!bookingId) return;
    const [bookingRes, timelineRes] = await Promise.all([
      getMyAggregatorBooking(bookingId),
      getMyAggregatorBookingTimeline(bookingId),
    ]);
    setBooking(bookingRes.booking);
    setTimeline(timelineRes.timeline);
  }

  useEffect(() => {
    let alive = true;
    setLoading(true);
    load()
      .catch((e) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Failed to load booking details");
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [bookingId]);

  const draftAllowed = useMemo(() => {
    const status = booking?.status;
    return status === "BOOKING_DRAFT" || status === "CORRECTION_REQUIRED";
  }, [booking?.status]);

  const senderInitial = useMemo<BookingSenderPayload>(() => ({
    senderName: booking?.senderName ?? "",
    senderPhone: booking?.senderPhone ?? "",
    senderAddress: booking?.senderAddress ?? "",
    senderCity: booking?.senderCity ?? "",
    specialInstructions: booking?.specialInstructions ?? "",
    intakeMethod: booking?.intakeMethod ?? "DROP_LAHORE",
    hubCity: booking?.hubCity ?? "",
  }), [booking]);

  async function saveDraft(value: BookingSenderPayload) {
    if (!booking) return;
    setBusy(true);
    try {
      await updateMyAggregatorBookingDraft(booking.id, value);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!booking) return;
    setBusy(true);
    setError(null);
    try {
      await submitMyAggregatorBooking(booking.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit booking");
    } finally {
      setBusy(false);
    }
  }

  async function cancelBooking() {
    if (!booking) return;
    const reasonCode = window.prompt("Cancel reason code", "CUSTOMER_CANCELLED");
    if (!reasonCode) return;
    setBusy(true);
    setError(null);
    try {
      await cancelMyAggregatorBooking(booking.id, reasonCode, "Cancelled from customer dashboard");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to cancel booking");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <PageShell><Card className="p-5">Loading booking details...</Card></PageShell>;
  }

  if (!booking) {
    return <PageShell><Card className="p-5 text-rose-700">Booking not found.</Card></PageShell>;
  }

  return (
    <PageShell>
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <PageTitle>{booking.bookingNo}</PageTitle>
            <BodyText className="mt-1">Manual-review lifecycle detail and timeline. This is not final booking confirmation.</BodyText>
          </div>
          <div className="flex items-center gap-2">
            <AggregatorBookingStatusBadge status={booking.status} />
            <span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-700">
              {getCustomerStatusLabel(booking.status)}
            </span>
          </div>
        </div>

        {error ? <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div> : null}

        <AggregatorBookingSummaryCard booking={booking} />

        <Card className="border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-semibold text-slate-900">Sender and Intake Details</h3>
          <p className="mt-1 text-xs text-slate-500">Draft is editable only in BOOKING_DRAFT or CORRECTION_REQUIRED status.</p>
          <div className="mt-3">
            <AggregatorBookingDraftForm
              initial={senderInitial}
              disabled={!draftAllowed || busy}
              submitLabel="Save Draft Details"
              onSubmit={saveDraft}
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={submit}
              disabled={!draftAllowed || busy}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
            >
              Submit for Admin Review
            </button>
            <button
              type="button"
              onClick={cancelBooking}
              disabled={!draftAllowed || busy}
              className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-500 disabled:opacity-60"
            >
              Cancel Booking
            </button>
          </div>
        </Card>

        <Card className="border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-semibold text-slate-900">Status Timeline</h3>
          <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
            <div>Status wording:</div>
            <div>Draft</div>
            <div>Submitted for review</div>
            <div>Under admin review</div>
            <div>Approved for manual action</div>
            <div>Correction required</div>
            <div>Rejected</div>
            <div>Cancelled</div>
          </div>
          <div className="mt-3">
            <AggregatorBookingTimeline events={timeline} />
          </div>
        </Card>
      </div>
    </PageShell>
  );
}
