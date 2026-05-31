import { useEffect, useState } from "react";
import { BodyText, PageShell, PageTitle } from "../../components/ui/PageSystem";
import Card from "../../components/Card";
import AggregatorBookingStatusBadge from "../../components/booking/AggregatorBookingStatusBadge";
import AggregatorBookingTimeline from "../../components/booking/AggregatorBookingTimeline";
import AggregatorBookingSummaryCard from "../../components/booking/AggregatorBookingSummaryCard";
import {
  adminPreviewAggregatorBulkPackLabel,
  adminPreviewAggregatorManifest,
  adminApproveAggregatorBooking,
  adminMarkPendingAggregatorBooking,
  adminRejectAggregatorBooking,
  adminRequestCorrectionAggregatorBooking,
  adminSelectAggregatorBulkPackPlan,
  type AggregatorBulkPackLabelPreview,
  type AggregatorManifestPreview,
  type AggregatorIntakeCarrierOption,
  type AggregatorWarehouseOption,
  getAdminAggregatorBooking,
  listAdminAggregatorBookings,
  type AggregatorBooking,
} from "../../lib/aggregatorBookings";

const MANUAL_GUARDRAILS = [
  "No payment is collected in this phase.",
  "No pickup is created in this phase.",
  "No dispatch is created in this phase.",
  "No external courier or Pakistan Post API is called.",
  "Approval means manual-action planning only.",
];

export default function AdminAggregatorBookings() {
  const [items, setItems] = useState<AggregatorBooking[]>([]);
  const [selected, setSelected] = useState<AggregatorBooking | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [decisionReasonCode, setDecisionReasonCode] = useState("");
  const [decisionNote, setDecisionNote] = useState("");
  const [manualActionConfirmed, setManualActionConfirmed] = useState(false);
  const [selectedWarehouse, setSelectedWarehouse] = useState<AggregatorWarehouseOption>("EPOST_LAHORE_WAREHOUSE");
  const [intakeCarrier, setIntakeCarrier] = useState<AggregatorIntakeCarrierOption>("CUSTOMER_SELF_DROP");
  const [paymentVerifiedReference, setPaymentVerifiedReference] = useState("");
  const [planningInstructions, setPlanningInstructions] = useState("Manual planning only. No pickup, dispatch, courier booking, or Pakistan Post booking is created.");
  const [labelPreview, setLabelPreview] = useState<AggregatorBulkPackLabelPreview | null>(null);
  const [manifestPreview, setManifestPreview] = useState<AggregatorManifestPreview | null>(null);

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
      if (detail.booking.bulkPackPlanning) {
        setSelectedWarehouse(detail.booking.bulkPackPlanning.selectedWarehouse);
        setIntakeCarrier(detail.booking.bulkPackPlanning.intakeCarrier);
        setPaymentVerifiedReference(detail.booking.bulkPackPlanning.paymentVerifiedReference || "");
        setPlanningInstructions(detail.booking.bulkPackPlanning.instructions || planningInstructions);
      }
      setLabelPreview(null);
      setManifestPreview(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load booking detail");
    }
  }

  function clearDecisionForm() {
    setDecisionReasonCode("");
    setDecisionNote("");
    setManualActionConfirmed(false);
  }

  function normalizeNote(raw: string) {
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  function validateAction(action: "approve" | "reject" | "correction" | "pending") {
    const reasonCode = decisionReasonCode.trim();
    const note = decisionNote.trim();

    if ((action === "reject" || action === "correction") && reasonCode.length < 2) {
      return "Reason code is required for reject/correction actions.";
    }
    if (action === "approve") {
      if (!manualActionConfirmed) {
        return "Confirm manual-action guardrails before approving.";
      }
      if (note.length < 10 || !/manual/i.test(note)) {
        return "Approval note must confirm manual-action handling (min 10 chars).";
      }
    }

    return null;
  }

  async function runAction(action: "approve" | "reject" | "correction" | "pending") {
    if (!selected) return;

    const validationError = validateAction(action);
    if (validationError) {
      setError(validationError);
      return;
    }

    const reasonCode = decisionReasonCode.trim() || undefined;
    const note = normalizeNote(decisionNote);

    setBusy(true);
    setError(null);
    try {
      if (action === "approve") {
        const approveNote = `${note ?? "Approved for manual action."} [MANUAL_ONLY_CONFIRMED]`;
        await adminApproveAggregatorBooking(selected.id, {
          reasonCode,
          note: approveNote,
          paymentStatus: "PENDING_PLACEHOLDER",
        });
      } else if (action === "reject") {
        await adminRejectAggregatorBooking(selected.id, {
          reasonCode,
          note: note ?? "Rejected during admin review.",
        });
      } else if (action === "correction") {
        await adminRequestCorrectionAggregatorBooking(selected.id, {
          reasonCode,
          note: note ?? "Correction requested during admin review.",
        });
      } else {
        await adminMarkPendingAggregatorBooking(selected.id, {
          reasonCode,
          note: note ?? "Marked pending for manual admin review.",
        });
      }
      await load();
      const detail = await getAdminAggregatorBooking(selected.id);
      setSelected(detail.booking);
      clearDecisionForm();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Admin action failed");
    } finally {
      setBusy(false);
    }
  }

  const planningEligible =
    selected?.status === "PAYMENT_PENDING_PLACEHOLDER" ||
    selected?.status === "DROP_PENDING" ||
    selected?.status === "PICKUP_PENDING_FUTURE";

  async function saveBulkPackPlanSelection() {
    if (!selected) return;
    if (!planningEligible) {
      setError("Bulk-pack planning is only allowed in manual-approved/payment-ready state.");
      return;
    }

    if (!paymentVerifiedReference.trim()) {
      setError("Payment verified reference is required.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await adminSelectAggregatorBulkPackPlan(selected.id, {
        selectedWarehouse,
        intakeCarrier,
        paymentVerifiedReference: paymentVerifiedReference.trim(),
        instructions: planningInstructions.trim(),
      });
      const detail = await getAdminAggregatorBooking(selected.id);
      setSelected(detail.booking);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save bulk-pack planning selection");
    } finally {
      setBusy(false);
    }
  }

  async function previewBulkPackLabel() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const res = await adminPreviewAggregatorBulkPackLabel(selected.id);
      setLabelPreview(res.labelPreview);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to preview bulk-pack label");
    } finally {
      setBusy(false);
    }
  }

  async function previewManifest() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const res = await adminPreviewAggregatorManifest(selected.id);
      setManifestPreview(res.manifestPreview);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to preview manifest");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell>
      <div className="space-y-4">
        <div>
          <PageTitle>Admin Aggregator Booking Queue</PageTitle>
          <BodyText className="mt-1">Manual-only queue for draft review. Approval is not final booking confirmation.</BodyText>
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
              <h3 className="text-base font-semibold text-slate-900">Admin Review Actions (Manual Only)</h3>

              <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
                {MANUAL_GUARDRAILS.map((line) => (
                  <div key={line}>{line}</div>
                ))}
              </div>

              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input
                  value={decisionReasonCode}
                  onChange={(event) => setDecisionReasonCode(event.target.value)}
                  placeholder="Reason code (required for reject/correction)"
                  className="rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                />
                <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={manualActionConfirmed}
                    onChange={(event) => setManualActionConfirmed(event.target.checked)}
                  />
                  I confirm manual-only processing guardrails
                </label>
              </div>

              <textarea
                value={decisionNote}
                onChange={(event) => setDecisionNote(event.target.value)}
                rows={3}
                placeholder="Decision note (approve requires manual-action wording)"
                className="mt-2 w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs"
              />

              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" disabled={busy} onClick={() => runAction("approve")} className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-60">Approve for Manual Action</button>
                <button type="button" disabled={busy} onClick={() => runAction("reject")} className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-500 disabled:opacity-60">Reject</button>
                <button type="button" disabled={busy} onClick={() => runAction("correction")} className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-500 disabled:opacity-60">Request Correction</button>
                <button type="button" disabled={busy} onClick={() => runAction("pending")} className="rounded-md bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-600 disabled:opacity-60">Mark Pending</button>
              </div>
            </Card>

            <Card className="border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-base font-semibold text-slate-900">Post-Payment Manual Planning (Phase 3C-1)</h3>
              <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Manual planning only. No pickup, dispatch, courier booking, or Pakistan Post booking is created.
              </div>
              <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                Bulk-pack label is only for moving the complete bundle to selected ePost warehouse, not final individual article delivery labels.
              </div>

              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="text-xs text-slate-700">
                  Selected Warehouse
                  <select
                    className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                    value={selectedWarehouse}
                    onChange={(event) => setSelectedWarehouse(event.target.value as AggregatorWarehouseOption)}
                  >
                    <option value="EPOST_LAHORE_WAREHOUSE">EPOST_LAHORE_WAREHOUSE</option>
                    <option value="EPOST_SAHIWAL_WAREHOUSE">EPOST_SAHIWAL_WAREHOUSE</option>
                  </select>
                </label>

                <label className="text-xs text-slate-700">
                  Intake Carrier
                  <select
                    className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                    value={intakeCarrier}
                    onChange={(event) => setIntakeCarrier(event.target.value as AggregatorIntakeCarrierOption)}
                  >
                    <option value="CUSTOMER_SELF_DROP">CUSTOMER_SELF_DROP</option>
                    <option value="PAKISTAN_POST_BULK_PACK">PAKISTAN_POST_BULK_PACK</option>
                    <option value="LEOPARDS_BULK_PACK">LEOPARDS_BULK_PACK</option>
                  </select>
                </label>

                <label className="text-xs text-slate-700 sm:col-span-2">
                  Payment Verified Reference
                  <input
                    value={paymentVerifiedReference}
                    onChange={(event) => setPaymentVerifiedReference(event.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                    placeholder="Manual verification reference"
                  />
                </label>
              </div>

              <label className="mt-2 block text-xs text-slate-700">
                Planning Instructions
                <textarea
                  value={planningInstructions}
                  onChange={(event) => setPlanningInstructions(event.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                />
              </label>

              {selected?.bulkPackPlanning ? (
                <div className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                  Saved plan: {selected.bulkPackPlanning.selectedWarehouse} via {selected.bulkPackPlanning.intakeCarrier}
                </div>
              ) : null}

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy || !planningEligible}
                  onClick={saveBulkPackPlanSelection}
                  className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  Save Warehouse/Carrier Plan
                </button>
                <button
                  type="button"
                  disabled={busy || !planningEligible}
                  onClick={previewBulkPackLabel}
                  className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
                >
                  Preview Bulk-Pack Label
                </button>
                <button
                  type="button"
                  disabled={busy || !planningEligible}
                  onClick={previewManifest}
                  className="rounded-md bg-cyan-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-cyan-600 disabled:opacity-60"
                >
                  Preview Manifest
                </button>
              </div>

              {!planningEligible ? (
                <div className="mt-2 text-xs text-rose-700">
                  Planning actions are enabled only in PAYMENT_PENDING_PLACEHOLDER, DROP_PENDING, or PICKUP_PENDING_FUTURE state.
                </div>
              ) : null}

              {labelPreview ? (
                <div className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-xs text-indigo-900">
                  <div className="font-semibold">Bulk-Pack Label Preview</div>
                  <div>Booking: {labelPreview.bookingNo}</div>
                  <div>Bulk Pack No: {labelPreview.bulkPackNo}</div>
                  <div>Warehouse: {labelPreview.selectedWarehouse}</div>
                  <div>Warehouse Address: {labelPreview.warehouseAddress}</div>
                  <div>Carrier: {labelPreview.intakeCarrier}</div>
                  <div>Service: {labelPreview.carrierService}</div>
                  <div>Total Articles: {labelPreview.totalArticles}</div>
                  <div>Total Bundle Weight (g): {labelPreview.totalBundleWeightGrams}</div>
                  <div>Payment Ref: {labelPreview.paymentVerifiedReference}</div>
                  <div>Barcode/QR: {labelPreview.barcodeOrQr}</div>
                  <div className="mt-1 font-semibold">{labelPreview.manualProcessingNotice}</div>
                </div>
              ) : null}

              {manifestPreview ? (
                <div className="mt-3 rounded-xl border border-cyan-200 bg-cyan-50 p-3 text-xs text-cyan-900">
                  <div className="font-semibold">Manifest Preview</div>
                  <div>Booking: {manifestPreview.bookingNo}</div>
                  <div>Expected Articles: {manifestPreview.expectedArticles}</div>
                  <div>Total Bundle Weight (g): {manifestPreview.totalBundleWeightGrams}</div>
                  <div>Warehouse: {manifestPreview.selectedWarehouse}</div>
                  <div>Carrier: {manifestPreview.intakeCarrier}</div>
                  <div>Rows: {manifestPreview.articleRows.length}</div>
                  <div className="mt-1 font-semibold">{manifestPreview.manualVerificationNotice}</div>
                </div>
              ) : null}
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
