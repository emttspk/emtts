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
  getAggregatorGatewayPaymentOptions,
  getAggregatorJazzcashGatewayStatus,
  getAggregatorPaymentOptions,
  getMyAggregatorBooking,
  getMyAggregatorBookingTimeline,
  startAggregatorJazzcashGatewayPayment,
  submitAggregatorManualPayment,
  submitMyAggregatorBooking,
  updateMyAggregatorBookingDraft,
  type AggregatorManualPaymentMethod,
  type AggregatorBooking,
  type AggregatorGatewayTransaction,
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

function getPhase3C2Label(currentState?: string | null) {
  if (!currentState || currentState === "NOT_STARTED") return "Warehouse receiving not started";
  if (currentState === "HUB_RECEIVED") return "Bulk pack received at warehouse";
  if (currentState === "MANIFEST_VERIFIED") return "Manifest count verified";
  if (currentState === "MISMATCH_RECORDED") return "Mismatch recorded for manual resolution";
  if (currentState === "EXCEPTION_RESOLVED") return "Mismatch resolved manually";
  return currentState;
}

function getPhase3C3Label(currentState?: string | null) {
  if (!currentState || currentState === "NOT_STARTED") return "Operational movement not yet started";
  if (currentState === "DRIVER_HANDOFF_RECORDED") return "Driver handoff recorded";
  if (currentState === "HUB_SORTING_DISPATCHED") return "Dispatched to sorting facility";
  if (currentState === "INTER_FACILITY_TRANSFER_RECORDED") return "Inter-facility transfer recorded";
  if (currentState === "READY_FOR_FINAL_POSTAL_PROCESSING") return "Ready for final postal processing";
  return currentState;
}

function getPhase3C4Label(currentState?: string | null) {
  if (!currentState || currentState === "NOT_STARTED") return "Final processing readiness not started";
  if (currentState === "READINESS_CHECKED") return "Readiness checked for final processing";
  if (currentState === "PACKET_PREPARED") return "Manual processing packet prepared";
  if (currentState === "PACKET_EXPORTED") return "Manual processing packet exported";
  if (currentState === "REVIEW_COMPLETED") return "Final processing review completed";
  return currentState;
}

function getPhase3C5Label(currentState?: string | null) {
  if (!currentState) return "Manual payment options available";
  if (currentState === "PAYMENT_OPTIONS_VISIBLE") return "Manual payment options available";
  if (currentState === "MANUAL_PAYMENT_SUBMITTED") return "Manual payment submitted";
  if (currentState === "UNDER_ADMIN_VERIFICATION") return "Manual payment under admin verification";
  if (currentState === "MANUAL_PAYMENT_VERIFIED") return "Manual payment verified by admin";
  if (currentState === "MANUAL_PAYMENT_REJECTED") return "Manual payment rejected by admin";
  if (currentState === "MANUAL_PAYMENT_CANCELLED") return "Manual payment cancelled";
  return currentState;
}

function getPaymentMethodLabel(method: AggregatorManualPaymentMethod) {
  switch (method) {
    case "BANK_TRANSFER":
      return "Bank Transfer";
    case "JAZZCASH_WALLET_TRANSFER":
      return "JazzCash Wallet Transfer";
    case "EASYPAISA_WALLET_TRANSFER":
      return "Easypaisa Wallet Transfer";
    case "OFFICE_CASH":
      return "Office Cash";
    default:
      return method;
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
  const [methods, setMethods] = useState<AggregatorManualPaymentMethod[]>([
    "BANK_TRANSFER",
    "JAZZCASH_WALLET_TRANSFER",
    "EASYPAISA_WALLET_TRANSFER",
    "OFFICE_CASH",
  ]);
  const [method, setMethod] = useState<AggregatorManualPaymentMethod>("BANK_TRANSFER");
  const [amount, setAmount] = useState<string>("");
  const [reference, setReference] = useState<string>("");
  const [payerName, setPayerName] = useState<string>("");
  const [proofNote, setProofNote] = useState<string>("");
  const [gatewayAvailable, setGatewayAvailable] = useState(false);
  const [gatewayMissing, setGatewayMissing] = useState<string[]>([]);
  const [gatewayMobile, setGatewayMobile] = useState<string>("");
  const [gatewayStatus, setGatewayStatus] = useState<AggregatorGatewayTransaction | null>(null);
  const [gatewayOrderRef, setGatewayOrderRef] = useState<string>("");

  async function load() {
    if (!bookingId) return;
    const [bookingRes, timelineRes] = await Promise.all([
      getMyAggregatorBooking(bookingId),
      getMyAggregatorBookingTimeline(bookingId),
    ]);
    setBooking(bookingRes.booking);
    setTimeline(timelineRes.timeline);

    if (bookingRes.booking.phase3c5Payment?.eligibleForManualPayment) {
      try {
        const optionsRes = await getAggregatorPaymentOptions(bookingId);
        setMethods(optionsRes.methods);
        if (!optionsRes.methods.includes(method)) {
          setMethod(optionsRes.methods[0] ?? "BANK_TRANSFER");
        }
      } catch {
        setMethods(["BANK_TRANSFER", "JAZZCASH_WALLET_TRANSFER", "EASYPAISA_WALLET_TRANSFER", "OFFICE_CASH"]);
      }

      try {
        const gatewayOptions = await getAggregatorGatewayPaymentOptions(bookingId);
        setGatewayAvailable(Boolean(gatewayOptions.gateway?.available));
        setGatewayMissing(gatewayOptions.gateway?.missingCredentials ?? []);
        const manualOnly = (gatewayOptions.methods ?? []).filter(
          (item): item is AggregatorManualPaymentMethod => item !== "JAZZCASH_GATEWAY",
        );
        if (manualOnly.length) {
          setMethods(manualOnly);
          if (!manualOnly.includes(method)) {
            setMethod(manualOnly[0]);
          }
        }
      } catch {
        setGatewayAvailable(false);
        setGatewayMissing([]);
      }

      try {
        const gatewayStatusRes = await getAggregatorJazzcashGatewayStatus(bookingId);
        setGatewayStatus(gatewayStatusRes.transaction);
      } catch {
        setGatewayStatus(null);
      }
    } else {
      setGatewayAvailable(false);
      setGatewayStatus(null);
      setGatewayMissing([]);
    }
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

  async function submitManualPayment() {
    if (!booking) return;
    setBusy(true);
    setError(null);
    try {
      await submitAggregatorManualPayment(booking.id, {
        method,
        amount: Number(amount),
        reference: reference.trim() || undefined,
        payerName,
        proofNote,
      });
      await load();
      setProofNote("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit manual payment");
    } finally {
      setBusy(false);
    }
  }

  async function startGatewayPayment() {
    if (!booking) return;
    setBusy(true);
    setError(null);
    try {
      const response = await startAggregatorJazzcashGatewayPayment(booking.id, {
        amount: Number(amount),
        mobileNumber: gatewayMobile,
      });
      setGatewayOrderRef(response.orderRef);
      window.location.assign(response.relayPath);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start JazzCash gateway payment");
    } finally {
      setBusy(false);
    }
  }

  async function refreshGatewayStatus() {
    if (!booking) return;
    setBusy(true);
    setError(null);
    try {
      const response = await getAggregatorJazzcashGatewayStatus(booking.id, true);
      setGatewayStatus(response.transaction);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to check JazzCash gateway status");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <PageShell>
        <Card className="p-5">Loading booking details...</Card>
      </PageShell>
    );
  }

  if (!booking) {
    return (
      <PageShell>
        <Card className="p-5 text-rose-700">Booking not found.</Card>
      </PageShell>
    );
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

        {booking.bulkPackPlanning ? (
          <Card className="border-sky-200 bg-sky-50 p-5 shadow-sm">
            <h3 className="text-base font-semibold text-sky-900">Bundle Movement Instructions</h3>
            <p className="mt-1 text-xs text-sky-800">
              Send the complete bundle to the selected ePost warehouse. Final article processing will be done after hub verification.
            </p>
            <div className="mt-2 text-xs text-sky-900">
              <div>Selected Warehouse: {booking.bulkPackPlanning.selectedWarehouse}</div>
              <div>Warehouse Address: {booking.bulkPackPlanning.warehouseAddress}</div>
              <div>Intake Carrier: {booking.bulkPackPlanning.intakeCarrier}</div>
              <div>Planning Instructions: {booking.bulkPackPlanning.instructions}</div>
            </div>
          </Card>
        ) : null}

        <Card className="border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-semibold text-slate-900">Warehouse Receiving Status</h3>
          <p className="mt-1 text-xs text-slate-600">This is warehouse receiving status only. Final article processing is separate.</p>

          <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
            <div>Current: {getPhase3C2Label(booking.phase3c2Operational?.currentState)}</div>
            {booking.phase3c2Operational?.hubReceiving ? (
              <>
                <div>Received Articles: {booking.phase3c2Operational.hubReceiving.receivedArticleCount}</div>
                <div>Expected Articles: {booking.phase3c2Operational.hubReceiving.expectedArticleCount}</div>
              </>
            ) : null}
            {booking.phase3c2Operational?.manifestVerification ? <div>Manifest: Matched</div> : null}
            {booking.phase3c2Operational?.mismatch ? <div>Manifest: Mismatched</div> : null}
          </div>
        </Card>

        <Card className="border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-semibold text-slate-900">Operational Movement Status</h3>
          <p className="mt-1 text-xs text-slate-600">
            {booking.phase3c3Operational?.customerNotice ?? "This is operational movement status only. Final Pakistan Post article processing is a separate future step."}
          </p>
          <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
            <div>Current: {getPhase3C3Label(booking.phase3c3Operational?.currentState)}</div>
            {booking.phase3c3Operational?.sortingDispatch ? (
              <div>Dispatched to: {booking.phase3c3Operational.sortingDispatch.toSortingFacility}</div>
            ) : null}
            {booking.phase3c3Operational?.latestTransfer ? (
              <>
                <div>Latest Transfer: {booking.phase3c3Operational.latestTransfer.fromFacility} to {booking.phase3c3Operational.latestTransfer.toFacility}</div>
                <div>Transfer Articles: {booking.phase3c3Operational.latestTransfer.articleCount}</div>
              </>
            ) : null}
          </div>
        </Card>

        <Card className="border-emerald-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-semibold text-slate-900">Final Postal Processing Readiness</h3>
          <p className="mt-1 text-xs text-emerald-800">
            Your articles are ready for final postal processing review. This is not final Pakistan Post booking confirmation.
          </p>
          <div className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
            <div>Current: {getPhase3C4Label(booking.phase3c4FinalProcessing?.currentState)}</div>
            {booking.phase3c4FinalProcessing?.packet ? (
              <>
                <div>Packet No: {booking.phase3c4FinalProcessing.packet.packetNo}</div>
                <div>Packet Rows: {booking.phase3c4FinalProcessing.packet.articleRows.length}</div>
              </>
            ) : null}
            {booking.phase3c4FinalProcessing?.reviewEvent ? (
              <div>Review Note: {booking.phase3c4FinalProcessing.reviewEvent.reviewNote}</div>
            ) : null}
          </div>
        </Card>

        <Card className="border-amber-200 bg-amber-50 p-5 shadow-sm">
          <h3 className="text-base font-semibold text-amber-950">Manual Payment Verification</h3>
          <p className="mt-1 text-xs text-amber-900">
            Payment verification only. This is not final Pakistan Post booking confirmation.
          </p>

          <div className="mt-2 rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs text-amber-950">
            <div>Current: {getPhase3C5Label(booking.phase3c5Payment?.currentState)}</div>
            {booking.phase3c5Payment?.latestSubmission ? (
              <>
                <div>Submitted Method: {getPaymentMethodLabel(booking.phase3c5Payment.latestSubmission.method)}</div>
                <div>
                  Submitted Amount: {booking.phase3c5Payment.latestSubmission.amount} {booking.phase3c5Payment.latestSubmission.currency}
                </div>
                <div>Submitted By: {booking.phase3c5Payment.latestSubmission.payerName}</div>
              </>
            ) : null}
            {booking.phase3c5Payment?.verification ? <div>Verification: Completed by admin</div> : null}
            {booking.phase3c5Payment?.rejection ? <div>Verification: Rejected ({booking.phase3c5Payment.rejection.rejectionReason})</div> : null}
          </div>

          <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-3 text-xs text-sky-950">
            <div className="font-semibold text-sky-900">JazzCash Gateway (Isolated 3C-5B)</div>
            <div className="mt-1 text-sky-800">Direct callback-driven payment lane for aggregator bookings, isolated from SaaS package billing.</div>
            <div className="mt-2">Gateway Available: {gatewayAvailable ? "Yes" : "No"}</div>
            {gatewayMissing.length ? <div>Missing credentials: {gatewayMissing.join(", ")}</div> : null}
            {gatewayStatus ? (
              <>
                <div>Gateway Status: {gatewayStatus.status}</div>
                <div>Gateway Order Ref: {gatewayStatus.orderRef}</div>
              </>
            ) : gatewayOrderRef ? (
              <div>Gateway Order Ref: {gatewayOrderRef}</div>
            ) : null}
          </div>

          {booking.phase3c5Payment?.eligibleForManualPayment && gatewayAvailable ? (
            <form
              className="mt-3 grid gap-2 text-xs"
              onSubmit={(event) => {
                event.preventDefault();
                void startGatewayPayment();
              }}
            >
              <label className="grid gap-1">
                <span className="font-medium text-slate-800">Gateway Amount (PKR)</span>
                <input
                  type="number"
                  min={1}
                  step="1"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  className="rounded border border-slate-300 bg-white px-2 py-1.5"
                  disabled={busy}
                  required
                />
              </label>
              <label className="grid gap-1">
                <span className="font-medium text-slate-800">JazzCash Mobile Number</span>
                <input
                  type="text"
                  value={gatewayMobile}
                  onChange={(event) => setGatewayMobile(event.target.value)}
                  className="rounded border border-slate-300 bg-white px-2 py-1.5"
                  disabled={busy}
                  required
                />
              </label>
              <div className="mt-1 flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-md bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-600 disabled:opacity-60"
                >
                  Pay via JazzCash Gateway
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void refreshGatewayStatus();
                  }}
                  disabled={busy}
                  className="rounded-md bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-600 disabled:opacity-60"
                >
                  Check Gateway Status
                </button>
              </div>
            </form>
          ) : null}

          {booking.phase3c5Payment?.eligibleForManualPayment ? (
            <form
              className="mt-3 grid gap-2 text-xs"
              onSubmit={(event) => {
                event.preventDefault();
                void submitManualPayment();
              }}
            >
              <label className="grid gap-1">
                <span className="font-medium text-slate-800">Manual Payment Method</span>
                <select
                  value={method}
                  onChange={(event) => setMethod(event.target.value as AggregatorManualPaymentMethod)}
                  className="rounded border border-slate-300 bg-white px-2 py-1.5"
                  disabled={busy}
                >
                  {methods.map((item) => (
                    <option key={item} value={item}>
                      {getPaymentMethodLabel(item)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1">
                <span className="font-medium text-slate-800">Amount (PKR)</span>
                <input
                  type="number"
                  min={1}
                  step="1"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  className="rounded border border-slate-300 bg-white px-2 py-1.5"
                  disabled={busy}
                  required
                />
              </label>

              <label className="grid gap-1">
                <span className="font-medium text-slate-800">Reference (required for transfer methods)</span>
                <input
                  type="text"
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                  className="rounded border border-slate-300 bg-white px-2 py-1.5"
                  disabled={busy}
                />
              </label>

              <label className="grid gap-1">
                <span className="font-medium text-slate-800">Payer Name</span>
                <input
                  type="text"
                  value={payerName}
                  onChange={(event) => setPayerName(event.target.value)}
                  className="rounded border border-slate-300 bg-white px-2 py-1.5"
                  disabled={busy}
                  required
                />
              </label>

              <label className="grid gap-1">
                <span className="font-medium text-slate-800">Proof Note</span>
                <textarea
                  value={proofNote}
                  onChange={(event) => setProofNote(event.target.value)}
                  className="min-h-20 rounded border border-slate-300 bg-white px-2 py-1.5"
                  disabled={busy}
                  required
                />
              </label>

              <button
                type="submit"
                disabled={busy}
                className="mt-1 w-fit rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-500 disabled:opacity-60"
              >
                Submit Manual Payment For Verification
              </button>
            </form>
          ) : null}
        </Card>

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
          <div className="mt-3">
            <AggregatorBookingTimeline events={timeline} />
          </div>
        </Card>
      </div>
    </PageShell>
  );
}
