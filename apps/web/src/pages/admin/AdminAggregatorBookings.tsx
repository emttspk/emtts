import { useEffect, useState } from "react";
import { BodyText, PageShell, PageTitle } from "../../components/ui/PageSystem";
import Card from "../../components/Card";
import AggregatorBookingStatusBadge from "../../components/booking/AggregatorBookingStatusBadge";
import AggregatorBookingTimeline from "../../components/booking/AggregatorBookingTimeline";
import AggregatorBookingSummaryCard from "../../components/booking/AggregatorBookingSummaryCard";
import {
  adminAddAggregatorHubExceptionNote,
  adminMarkAggregatorHubReceived,
  adminPreviewAggregatorBulkPackLabel,
  adminPreviewAggregatorManifest,
  adminApproveAggregatorBooking,
  adminMarkPendingAggregatorBooking,
  adminRecordAggregatorHubMismatch,
  adminRejectAggregatorBooking,
  adminResolveAggregatorHubException,
  adminRequestCorrectionAggregatorBooking,
  adminSelectAggregatorBulkPackPlan,
  adminVerifyAggregatorHubManifest,
  type AggregatorBulkPackLabelPreview,
  type AggregatorManifestPreview,
  type AggregatorIntakeCarrierOption,
  type AggregatorWarehouseOption,
  getAdminAggregatorBooking,
  listAdminAggregatorBookings,
  type AggregatorBooking,
} from "../../lib/aggregatorBookings";
import {
  adminMarkAggregatorReadyForPostal,
  adminMarkAggregatorFinalProcessingPacketExported,
  adminMarkAggregatorFinalProcessingReviewed,
  adminCheckAggregatorFinalProcessingReadiness,
  adminPrepareAggregatorFinalProcessingPacket,
  adminRecordAggregatorDriverHandoff,
  adminRecordAggregatorInterFacilityTransfer,
  adminRecordAggregatorSortingDispatch,
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
  const [hubReceivedArticleCount, setHubReceivedArticleCount] = useState("0");
  const [hubBundleWeightGrams, setHubBundleWeightGrams] = useState("");
  const [hubConditionNote, setHubConditionNote] = useState("Bulk pack received at warehouse for manual verification.");
  const [mismatchReason, setMismatchReason] = useState("");
  const [mismatchAdminNote, setMismatchAdminNote] = useState("");
  const [exceptionNote, setExceptionNote] = useState("");
  const [resolutionType, setResolutionType] = useState("");
  const [resolutionNote, setResolutionNote] = useState("");
  const [handoffType, setHandoffType] = useState("DRIVER_TO_HUB");
  const [handoffFromParty, setHandoffFromParty] = useState("");
  const [handoffToParty, setHandoffToParty] = useState("");
  const [handoffReceivedBy, setHandoffReceivedBy] = useState("");
  const [handoffBundleCondition, setHandoffBundleCondition] = useState("Good condition, bundle intact.");
  const [handoffArticleCount, setHandoffArticleCount] = useState("0");
  const [handoffNote, setHandoffNote] = useState("");
  const [sortingFromWarehouse, setSortingFromWarehouse] = useState("");
  const [sortingToFacility, setSortingToFacility] = useState("");
  const [sortingDispatchedBy, setSortingDispatchedBy] = useState("");
  const [sortingTransportMode, setSortingTransportMode] = useState("Road");
  const [sortingNote, setSortingNote] = useState("");
  const [sortingBundleWeightGrams, setSortingBundleWeightGrams] = useState("");
  const [sortingExpectedArticleCount, setSortingExpectedArticleCount] = useState("0");
  const [transferFromFacility, setTransferFromFacility] = useState("");
  const [transferToFacility, setTransferToFacility] = useState("");
  const [transferBy, setTransferBy] = useState("");
  const [transferReference, setTransferReference] = useState("");
  const [transferArticleCount, setTransferArticleCount] = useState("0");
  const [transferNote, setTransferNote] = useState("");
  const [readyArticleCount, setReadyArticleCount] = useState("0");
  const [readyNote, setReadyNote] = useState("");
  const [fpExpectedArticleCount, setFpExpectedArticleCount] = useState("0");
  const [fpVerifiedArticleCount, setFpVerifiedArticleCount] = useState("0");
  const [fpExceptions, setFpExceptions] = useState("");
  const [fpReadinessNote, setFpReadinessNote] = useState("Manual final processing readiness checked.");
  const [fpPacketNo, setFpPacketNo] = useState("");
  const [fpWarnings, setFpWarnings] = useState("");
  const [fpExportNote, setFpExportNote] = useState("Manual packet export completed for operations handoff.");
  const [fpReviewNote, setFpReviewNote] = useState("Manual final postal processing review completed.");

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
      if (detail.booking.phase3c2Operational?.hubReceiving) {
        setHubReceivedArticleCount(String(detail.booking.phase3c2Operational.hubReceiving.receivedArticleCount));
        setHubBundleWeightGrams(detail.booking.phase3c2Operational.hubReceiving.receivedBundleWeightGrams != null ? String(detail.booking.phase3c2Operational.hubReceiving.receivedBundleWeightGrams) : "");
        setHubConditionNote(detail.booking.phase3c2Operational.hubReceiving.conditionNote || "Bulk pack received at warehouse for manual verification.");
      } else {
        setHubReceivedArticleCount(String(detail.booking.totalArticles ?? 0));
        setHubBundleWeightGrams("");
      }
      const totalArticles = Number(detail.booking.totalArticles ?? 0);
      setFpExpectedArticleCount(String(totalArticles));
      setFpVerifiedArticleCount(String(totalArticles));
      if (detail.booking.phase3c4FinalProcessing?.packet?.packetNo) {
        setFpPacketNo(detail.booking.phase3c4FinalProcessing.packet.packetNo);
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

  const phase3c2 = selected?.phase3c2Operational;
  const phase3c3 = selected?.phase3c3Operational;
  const phase3c4 = selected?.phase3c4FinalProcessing;

  async function recordDriverHandoff() {
      if (!selected) return;
      if (!handoffFromParty.trim() || !handoffToParty.trim() || !handoffNote.trim()) {
        setError("From party, to party, and note are required for driver handoff.");
        return;
      }
      setBusy(true);
      setError(null);
      try {
        await adminRecordAggregatorDriverHandoff(selected.id, {
          handoffType: handoffType.trim(),
          fromParty: handoffFromParty.trim(),
          toParty: handoffToParty.trim(),
          receivedBy: handoffReceivedBy.trim() || "Admin",
          bundleCondition: handoffBundleCondition.trim(),
          articleCount: Number(handoffArticleCount || 0),
          note: handoffNote.trim(),
        });
        const detail = await getAdminAggregatorBooking(selected.id);
        setSelected(detail.booking);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to record driver handoff");
      } finally {
        setBusy(false);
      }
  }

  async function recordSortingDispatch() {
      if (!selected) return;
      if (!sortingFromWarehouse.trim() || !sortingToFacility.trim() || !sortingNote.trim()) {
        setError("From warehouse, to facility, and note are required for sorting dispatch.");
        return;
      }
      setBusy(true);
      setError(null);
      try {
        await adminRecordAggregatorSortingDispatch(selected.id, {
          fromWarehouse: sortingFromWarehouse.trim(),
          toSortingFacility: sortingToFacility.trim(),
          dispatchedBy: sortingDispatchedBy.trim() || "Admin",
          expectedArticleCount: Number(sortingExpectedArticleCount || 0),
          bundleWeightGrams: sortingBundleWeightGrams.trim() ? Number(sortingBundleWeightGrams) : null,
          transportMode: sortingTransportMode.trim(),
          note: sortingNote.trim(),
        });
        const detail = await getAdminAggregatorBooking(selected.id);
        setSelected(detail.booking);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to record sorting dispatch");
      } finally {
        setBusy(false);
      }
  }

  async function recordInterFacilityTransfer() {
      if (!selected) return;
      if (!transferFromFacility.trim() || !transferToFacility.trim() || !transferNote.trim()) {
        setError("From facility, to facility, and note are required for inter-facility transfer.");
        return;
      }
      setBusy(true);
      setError(null);
      try {
        await adminRecordAggregatorInterFacilityTransfer(selected.id, {
          fromFacility: transferFromFacility.trim(),
          toFacility: transferToFacility.trim(),
          transferBy: transferBy.trim() || "Admin",
          transferReference: transferReference.trim() || null,
          articleCount: Number(transferArticleCount || 0),
          note: transferNote.trim(),
        });
        const detail = await getAdminAggregatorBooking(selected.id);
        setSelected(detail.booking);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to record inter-facility transfer");
      } finally {
        setBusy(false);
      }
  }

  async function markReadyForPostal() {
      if (!selected) return;
      if (!readyNote.trim() || readyNote.trim().length < 10) {
        setError("Ready-for-postal note must be at least 10 characters.");
        return;
      }
      setBusy(true);
      setError(null);
      try {
        await adminMarkAggregatorReadyForPostal(selected.id, {
          expectedArticleCount: Number(readyArticleCount || 0),
          note: readyNote.trim(),
        });
        const detail = await getAdminAggregatorBooking(selected.id);
        setSelected(detail.booking);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to mark ready for final postal processing");
      } finally {
        setBusy(false);
      }
  }

  async function checkFinalProcessingReadiness() {
    if (!selected) return;
    if (phase3c3?.currentState !== "READY_FOR_FINAL_POSTAL_PROCESSING") {
      setError("Phase 3C-3 must be READY_FOR_FINAL_POSTAL_PROCESSING before readiness check.");
      return;
    }

    const servicesIncluded = [...new Set((selected.items ?? []).map((item) => String(item.serviceCode ?? "").trim().toUpperCase()))]
      .filter(Boolean) as Array<"RGL" | "VPL" | "VPP" | "IRL" | "PAR" | "UMS" | "COD">;

    setBusy(true);
    setError(null);
    try {
      await adminCheckAggregatorFinalProcessingReadiness(selected.id, {
        expectedArticleCount: Number(fpExpectedArticleCount || 0),
        verifiedArticleCount: Number(fpVerifiedArticleCount || 0),
        servicesIncluded,
        exceptions: fpExceptions
          .split(/\r?\n|,/)
          .map((item) => item.trim())
          .filter(Boolean),
        note: fpReadinessNote.trim() || undefined,
      });
      const detail = await getAdminAggregatorBooking(selected.id);
      setSelected(detail.booking);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to check final processing readiness");
    } finally {
      setBusy(false);
    }
  }

  async function prepareFinalProcessingPacket() {
    if (!selected) return;
    const rows = (selected.items ?? []).map((item) => ({
      rowNo: Number(item.rowNo || 0),
      serviceCode: String(item.serviceCode ?? "").trim().toUpperCase() as "RGL" | "VPL" | "VPP" | "IRL" | "PAR" | "UMS" | "COD",
      articleCategory: String(item.articleCategory ?? "").trim() || "UNSPECIFIED",
      receiverCity: item.receiverCity ?? null,
      chargeableWeightGrams: item.chargeableWeightGrams ?? null,
      totalOfficialPostalCharge: Number(item.totalOfficialPostalCharge ?? 0),
    }));

    if (rows.length === 0) {
      setError("No article rows available to prepare final processing packet.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await adminPrepareAggregatorFinalProcessingPacket(selected.id, {
        packetNo: fpPacketNo.trim() || undefined,
        articleRows: rows,
        readinessWarnings: fpWarnings
          .split(/\r?\n|,/)
          .map((item) => item.trim())
          .filter(Boolean),
        note: fpReadinessNote.trim() || undefined,
      });
      const detail = await getAdminAggregatorBooking(selected.id);
      setSelected(detail.booking);
      if (detail.booking.phase3c4FinalProcessing?.packet?.packetNo) {
        setFpPacketNo(detail.booking.phase3c4FinalProcessing.packet.packetNo);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to prepare final processing packet");
    } finally {
      setBusy(false);
    }
  }

  async function markFinalPacketExported() {
    if (!selected) return;
    const packetNo = fpPacketNo.trim() || selected.phase3c4FinalProcessing?.packet?.packetNo;
    if (!packetNo) {
      setError("Packet number is required before marking export.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await adminMarkAggregatorFinalProcessingPacketExported(selected.id, {
        packetNo,
        exportFormat: "json",
        note: fpExportNote.trim() || undefined,
      });
      const detail = await getAdminAggregatorBooking(selected.id);
      setSelected(detail.booking);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to mark packet export");
    } finally {
      setBusy(false);
    }
  }

  async function markFinalReviewCompleted() {
    if (!selected) return;
    const packetNo = fpPacketNo.trim() || selected.phase3c4FinalProcessing?.packet?.packetNo;
    if (!packetNo) {
      setError("Packet number is required before marking review.");
      return;
    }
    if (fpReviewNote.trim().length < 10) {
      setError("Review note must be at least 10 characters.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await adminMarkAggregatorFinalProcessingReviewed(selected.id, {
        packetNo,
        reviewNote: fpReviewNote.trim(),
      });
      const detail = await getAdminAggregatorBooking(selected.id);
      setSelected(detail.booking);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to mark final processing review complete");
    } finally {
      setBusy(false);
    }
  }

  async function markHubReceived() {
    if (!selected) return;
    if (!hubConditionNote.trim()) {
      setError("Condition note is required for mark received action.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await adminMarkAggregatorHubReceived(selected.id, {
        receivedArticleCount: Number(hubReceivedArticleCount || 0),
        receivedBundleWeightGrams: hubBundleWeightGrams.trim() ? Number(hubBundleWeightGrams) : undefined,
        conditionNote: hubConditionNote.trim(),
      });
      const detail = await getAdminAggregatorBooking(selected.id);
      setSelected(detail.booking);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to mark hub receiving");
    } finally {
      setBusy(false);
    }
  }

  async function verifyHubManifest() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await adminVerifyAggregatorHubManifest(selected.id, {
        receivedArticleCount: Number(hubReceivedArticleCount || 0),
      });
      const detail = await getAdminAggregatorBooking(selected.id);
      setSelected(detail.booking);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to verify manifest");
    } finally {
      setBusy(false);
    }
  }

  async function recordHubMismatch() {
    if (!selected) return;
    if (!mismatchReason.trim() || !mismatchAdminNote.trim()) {
      setError("Mismatch reason and admin note are required.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await adminRecordAggregatorHubMismatch(selected.id, {
        receivedArticleCount: Number(hubReceivedArticleCount || 0),
        mismatchReason: mismatchReason.trim(),
        adminNote: mismatchAdminNote.trim(),
      });
      const detail = await getAdminAggregatorBooking(selected.id);
      setSelected(detail.booking);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to record mismatch");
    } finally {
      setBusy(false);
    }
  }

  async function addHubExceptionNote() {
    if (!selected) return;
    if (!exceptionNote.trim()) {
      setError("Exception note is required.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await adminAddAggregatorHubExceptionNote(selected.id, {
        exceptionNote: exceptionNote.trim(),
      });
      setExceptionNote("");
      const detail = await getAdminAggregatorBooking(selected.id);
      setSelected(detail.booking);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add exception note");
    } finally {
      setBusy(false);
    }
  }

  async function resolveHubException() {
    if (!selected) return;
    if (!resolutionType.trim() || !resolutionNote.trim()) {
      setError("Resolution type and resolution note are required.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await adminResolveAggregatorHubException(selected.id, {
        resolutionType: resolutionType.trim(),
        resolutionNote: resolutionNote.trim(),
      });
      const detail = await getAdminAggregatorBooking(selected.id);
      setSelected(detail.booking);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to resolve exception");
    } finally {
      setBusy(false);
    }
  }

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
              <h3 className="text-base font-semibold text-slate-900">Hub Receiving Verification (Phase 3C-2)</h3>
              <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Hub receiving is manual verification only. It is not final dispatch or Pakistan Post booking.
              </div>

              <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                <div>Current State: {phase3c2?.currentState ?? "NOT_STARTED"}</div>
                <div>Expected Articles: {selected.totalArticles}</div>
                <div>Hold For Manual Resolution: {phase3c2?.holdForManualResolution ? "Yes" : "No"}</div>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="text-xs text-slate-700">
                  Received Article Count
                  <input
                    value={hubReceivedArticleCount}
                    onChange={(event) => setHubReceivedArticleCount(event.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                    placeholder="0"
                    inputMode="numeric"
                  />
                </label>

                <label className="text-xs text-slate-700">
                  Received Bundle Weight (grams)
                  <input
                    value={hubBundleWeightGrams}
                    onChange={(event) => setHubBundleWeightGrams(event.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                    placeholder="Optional"
                    inputMode="numeric"
                  />
                </label>
              </div>

              <label className="mt-2 block text-xs text-slate-700">
                Condition Note
                <textarea
                  value={hubConditionNote}
                  onChange={(event) => setHubConditionNote(event.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                />
              </label>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy || !planningEligible}
                  onClick={markHubReceived}
                  className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  Mark Received
                </button>
                <button
                  type="button"
                  disabled={busy || !planningEligible}
                  onClick={verifyHubManifest}
                  className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600 disabled:opacity-60"
                >
                  Verify Manifest
                </button>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="text-xs text-slate-700">
                  Mismatch Reason
                  <input
                    value={mismatchReason}
                    onChange={(event) => setMismatchReason(event.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                    placeholder="e.g. Missing articles"
                  />
                </label>
                <label className="text-xs text-slate-700">
                  Exception Note
                  <input
                    value={exceptionNote}
                    onChange={(event) => setExceptionNote(event.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                    placeholder="Add exception note"
                  />
                </label>
              </div>

              <label className="mt-2 block text-xs text-slate-700">
                Mismatch Admin Note
                <textarea
                  value={mismatchAdminNote}
                  onChange={(event) => setMismatchAdminNote(event.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                />
              </label>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy || !planningEligible}
                  onClick={recordHubMismatch}
                  className="rounded-md bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-600 disabled:opacity-60"
                >
                  Record Mismatch
                </button>
                <button
                  type="button"
                  disabled={busy || !planningEligible}
                  onClick={addHubExceptionNote}
                  className="rounded-md bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-60"
                >
                  Add Exception Note
                </button>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="text-xs text-slate-700">
                  Resolution Type
                  <input
                    value={resolutionType}
                    onChange={(event) => setResolutionType(event.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                    placeholder="e.g. Continue with received count"
                  />
                </label>
                <label className="text-xs text-slate-700 sm:col-span-1">
                  Resolution Note
                  <textarea
                    value={resolutionNote}
                    onChange={(event) => setResolutionNote(event.target.value)}
                    rows={2}
                    className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                  />
                </label>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy || !planningEligible}
                  onClick={resolveHubException}
                  className="rounded-md bg-cyan-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-cyan-600 disabled:opacity-60"
                >
                  Resolve Exception
                </button>
              </div>

              {phase3c2?.hubReceiving ? (
                <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900">
                  <div className="font-semibold">Hub Receiving</div>
                  <div>Warehouse: {phase3c2.hubReceiving.warehouse}</div>
                  <div>Received Articles: {phase3c2.hubReceiving.receivedArticleCount}</div>
                  <div>Expected Articles: {phase3c2.hubReceiving.expectedArticleCount}</div>
                  <div>Condition: {phase3c2.hubReceiving.conditionNote}</div>
                </div>
              ) : null}

              {phase3c2?.mismatch ? (
                <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
                  <div className="font-semibold">Mismatch Recorded</div>
                  <div>Reason: {phase3c2.mismatch.mismatchReason}</div>
                  <div>Admin Note: {phase3c2.mismatch.adminNote}</div>
                </div>
              ) : null}

              {phase3c2?.latestExceptionNote ? (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  <div className="font-semibold">Latest Exception Note</div>
                  <div>{phase3c2.latestExceptionNote.note}</div>
                </div>
              ) : null}

              {phase3c2?.resolution ? (
                <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
                  <div className="font-semibold">Exception Resolved</div>
                  <div>Type: {phase3c2.resolution.resolutionType}</div>
                  <div>Note: {phase3c2.resolution.resolutionNote}</div>
                </div>
              ) : null}
            </Card>

              <Card className="border-amber-200 bg-white p-5 shadow-sm">
                <h3 className="text-base font-semibold text-slate-900">Operational Handoff &amp; Dispatch (Phase 3C-3)</h3>
                <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Handoff recording is manual operational logging only. It is not final dispatch or Pakistan Post booking confirmation.
                </div>
                {(phase3c2?.currentState !== "MANIFEST_VERIFIED" && phase3c2?.currentState !== "EXCEPTION_RESOLVED") ? (
                  <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    Phase 3C-2 manifest verification or exception resolution must be complete before recording handoff events.
                  </div>
                ) : (
                  <>
                    <div className="mt-3 text-xs text-slate-700">
                      <span className="font-semibold">Current Handoff State:</span> {phase3c3?.currentState ?? "NOT_STARTED"}
                    </div>

                    {/* Driver Handoff */}
                    <div className="mt-4 border-t border-slate-100 pt-3">
                      <div className="text-xs font-semibold text-slate-700">Step 1: Record Driver Handoff (Optional)</div>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[11px] text-slate-500">Handoff Type</label>
                          <input className="block w-full rounded border border-slate-200 px-2 py-1 text-xs" value={handoffType} onChange={(e) => setHandoffType(e.target.value)} placeholder="DRIVER_TO_HUB" />
                        </div>
                        <div>
                          <label className="text-[11px] text-slate-500">From Party</label>
                          <input className="block w-full rounded border border-slate-200 px-2 py-1 text-xs" value={handoffFromParty} onChange={(e) => setHandoffFromParty(e.target.value)} placeholder="Driver name or ID" />
                        </div>
                        <div>
                          <label className="text-[11px] text-slate-500">To Party</label>
                          <input className="block w-full rounded border border-slate-200 px-2 py-1 text-xs" value={handoffToParty} onChange={(e) => setHandoffToParty(e.target.value)} placeholder="Hub or warehouse name" />
                        </div>
                        <div>
                          <label className="text-[11px] text-slate-500">Received By</label>
                          <input className="block w-full rounded border border-slate-200 px-2 py-1 text-xs" value={handoffReceivedBy} onChange={(e) => setHandoffReceivedBy(e.target.value)} placeholder="Receiving staff name" />
                        </div>
                        <div>
                          <label className="text-[11px] text-slate-500">Article Count</label>
                          <input type="number" className="block w-full rounded border border-slate-200 px-2 py-1 text-xs" value={handoffArticleCount} onChange={(e) => setHandoffArticleCount(e.target.value)} />
                        </div>
                        <div>
                          <label className="text-[11px] text-slate-500">Bundle Condition</label>
                          <input className="block w-full rounded border border-slate-200 px-2 py-1 text-xs" value={handoffBundleCondition} onChange={(e) => setHandoffBundleCondition(e.target.value)} />
                        </div>
                      </div>
                      <div className="mt-2">
                        <label className="text-[11px] text-slate-500">Note</label>
                        <textarea className="block w-full rounded border border-slate-200 px-2 py-1 text-xs" rows={2} value={handoffNote} onChange={(e) => setHandoffNote(e.target.value)} placeholder="Handoff operational note..." />
                      </div>
                      <button type="button" disabled={busy} onClick={recordDriverHandoff} className="mt-2 rounded-md bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-60">
                        Record Driver Handoff
                      </button>
                      {phase3c3?.driverHandoff ? (
                        <div className="mt-2 rounded-xl border border-sky-200 bg-sky-50 p-2 text-xs text-sky-900">
                          <div className="font-semibold">Handoff Recorded</div>
                          <div>From: {phase3c3.driverHandoff.fromParty} → To: {phase3c3.driverHandoff.toParty}</div>
                          <div>Articles: {phase3c3.driverHandoff.articleCount}</div>
                        </div>
                      ) : null}
                    </div>

                    {/* Hub Sorting Dispatch */}
                    <div className="mt-4 border-t border-slate-100 pt-3">
                      <div className="text-xs font-semibold text-slate-700">Step 2: Record Hub-to-Sorting Dispatch (Required)</div>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[11px] text-slate-500">From Warehouse</label>
                          <input className="block w-full rounded border border-slate-200 px-2 py-1 text-xs" value={sortingFromWarehouse} onChange={(e) => setSortingFromWarehouse(e.target.value)} placeholder="EPOST_LAHORE_WAREHOUSE" />
                        </div>
                        <div>
                          <label className="text-[11px] text-slate-500">To Sorting Facility</label>
                          <input className="block w-full rounded border border-slate-200 px-2 py-1 text-xs" value={sortingToFacility} onChange={(e) => setSortingToFacility(e.target.value)} placeholder="Facility name" />
                        </div>
                        <div>
                          <label className="text-[11px] text-slate-500">Dispatched By</label>
                          <input className="block w-full rounded border border-slate-200 px-2 py-1 text-xs" value={sortingDispatchedBy} onChange={(e) => setSortingDispatchedBy(e.target.value)} placeholder="Staff name" />
                        </div>
                        <div>
                          <label className="text-[11px] text-slate-500">Transport Mode</label>
                          <input className="block w-full rounded border border-slate-200 px-2 py-1 text-xs" value={sortingTransportMode} onChange={(e) => setSortingTransportMode(e.target.value)} placeholder="Road" />
                        </div>
                        <div>
                          <label className="text-[11px] text-slate-500">Expected Articles</label>
                          <input type="number" className="block w-full rounded border border-slate-200 px-2 py-1 text-xs" value={sortingExpectedArticleCount} onChange={(e) => setSortingExpectedArticleCount(e.target.value)} />
                        </div>
                        <div>
                          <label className="text-[11px] text-slate-500">Bundle Weight (grams, optional)</label>
                          <input type="number" className="block w-full rounded border border-slate-200 px-2 py-1 text-xs" value={sortingBundleWeightGrams} onChange={(e) => setSortingBundleWeightGrams(e.target.value)} placeholder="Optional" />
                        </div>
                      </div>
                      <div className="mt-2">
                        <label className="text-[11px] text-slate-500">Note</label>
                        <textarea className="block w-full rounded border border-slate-200 px-2 py-1 text-xs" rows={2} value={sortingNote} onChange={(e) => setSortingNote(e.target.value)} placeholder="Sorting dispatch note..." />
                      </div>
                      <button type="button" disabled={busy} onClick={recordSortingDispatch} className="mt-2 rounded-md bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-60">
                        Record Sorting Dispatch
                      </button>
                      {phase3c3?.sortingDispatch ? (
                        <div className="mt-2 rounded-xl border border-sky-200 bg-sky-50 p-2 text-xs text-sky-900">
                          <div className="font-semibold">Sorting Dispatch Recorded</div>
                          <div>{phase3c3.sortingDispatch.fromWarehouse} → {phase3c3.sortingDispatch.toSortingFacility}</div>
                          <div>Articles: {phase3c3.sortingDispatch.expectedArticleCount}</div>
                        </div>
                      ) : null}
                    </div>

                    {/* Inter-Facility Transfer */}
                    <div className="mt-4 border-t border-slate-100 pt-3">
                      <div className="text-xs font-semibold text-slate-700">Step 3: Record Inter-Facility Transfer (Optional)</div>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[11px] text-slate-500">From Facility</label>
                          <input className="block w-full rounded border border-slate-200 px-2 py-1 text-xs" value={transferFromFacility} onChange={(e) => setTransferFromFacility(e.target.value)} placeholder="Facility name" />
                        </div>
                        <div>
                          <label className="text-[11px] text-slate-500">To Facility</label>
                          <input className="block w-full rounded border border-slate-200 px-2 py-1 text-xs" value={transferToFacility} onChange={(e) => setTransferToFacility(e.target.value)} placeholder="Facility name" />
                        </div>
                        <div>
                          <label className="text-[11px] text-slate-500">Transfer By</label>
                          <input className="block w-full rounded border border-slate-200 px-2 py-1 text-xs" value={transferBy} onChange={(e) => setTransferBy(e.target.value)} placeholder="Staff name" />
                        </div>
                        <div>
                          <label className="text-[11px] text-slate-500">Transfer Reference (optional)</label>
                          <input className="block w-full rounded border border-slate-200 px-2 py-1 text-xs" value={transferReference} onChange={(e) => setTransferReference(e.target.value)} placeholder="Optional reference" />
                        </div>
                        <div>
                          <label className="text-[11px] text-slate-500">Article Count</label>
                          <input type="number" className="block w-full rounded border border-slate-200 px-2 py-1 text-xs" value={transferArticleCount} onChange={(e) => setTransferArticleCount(e.target.value)} />
                        </div>
                      </div>
                      <div className="mt-2">
                        <label className="text-[11px] text-slate-500">Note</label>
                        <textarea className="block w-full rounded border border-slate-200 px-2 py-1 text-xs" rows={2} value={transferNote} onChange={(e) => setTransferNote(e.target.value)} placeholder="Transfer note..." />
                      </div>
                      <button type="button" disabled={busy} onClick={recordInterFacilityTransfer} className="mt-2 rounded-md bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-60">
                        Record Inter-Facility Transfer
                      </button>
                      {phase3c3?.latestTransfer ? (
                        <div className="mt-2 rounded-xl border border-sky-200 bg-sky-50 p-2 text-xs text-sky-900">
                          <div className="font-semibold">Latest Transfer Recorded</div>
                          <div>{phase3c3.latestTransfer.fromFacility} → {phase3c3.latestTransfer.toFacility}</div>
                          <div>Articles: {phase3c3.latestTransfer.articleCount}</div>
                        </div>
                      ) : null}
                    </div>

                    {/* Ready for Final Postal Processing */}
                    <div className="mt-4 border-t border-slate-100 pt-3">
                      <div className="text-xs font-semibold text-slate-700">Step 4: Mark Ready for Final Postal Processing</div>
                      <div className="mt-1 text-[11px] text-amber-700">This is operational movement status only. Final Pakistan Post article processing is a separate future step.</div>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[11px] text-slate-500">Expected Article Count</label>
                          <input type="number" className="block w-full rounded border border-slate-200 px-2 py-1 text-xs" value={readyArticleCount} onChange={(e) => setReadyArticleCount(e.target.value)} />
                        </div>
                      </div>
                      <div className="mt-2">
                        <label className="text-[11px] text-slate-500">Note</label>
                        <textarea className="block w-full rounded border border-slate-200 px-2 py-1 text-xs" rows={2} value={readyNote} onChange={(e) => setReadyNote(e.target.value)} placeholder="Ready-for-postal processing note (min 10 chars)..." />
                      </div>
                      <button type="button" disabled={busy} onClick={markReadyForPostal} className="mt-2 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-60">
                        Mark Ready for Final Postal Processing
                      </button>
                      {phase3c3?.readyForPostal ? (
                        <div className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-900">
                          <div className="font-semibold">Ready for Postal Processing Marked</div>
                          <div>Expected Articles: {phase3c3.readyForPostal.expectedArticleCount}</div>
                          <div>Note: {phase3c3.readyForPostal.note}</div>
                        </div>
                      ) : null}
                    </div>
                  </>
                )}
              </Card>

              <Card className="border-emerald-200 bg-white p-5 shadow-sm">
                <h3 className="text-base font-semibold text-slate-900">Final Postal Processing Handoff Readiness (Phase 3C-4)</h3>
                <div className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                  This is manual final postal processing preparation only. It does not create Pakistan Post booking or final dispatch.
                </div>
                <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                  <div>Current State: {phase3c4?.currentState ?? "NOT_STARTED"}</div>
                  <div>{phase3c4?.customerNotice ?? "Your articles are ready for final postal processing review. This is not final Pakistan Post booking confirmation."}</div>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <label className="text-xs text-slate-700">
                    Expected Article Count
                    <input type="number" className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs" value={fpExpectedArticleCount} onChange={(e) => setFpExpectedArticleCount(e.target.value)} />
                  </label>
                  <label className="text-xs text-slate-700">
                    Verified Article Count
                    <input type="number" className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs" value={fpVerifiedArticleCount} onChange={(e) => setFpVerifiedArticleCount(e.target.value)} />
                  </label>
                </div>

                <label className="mt-2 block text-xs text-slate-700">
                  Exceptions (comma or new line)
                  <textarea className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs" rows={2} value={fpExceptions} onChange={(e) => setFpExceptions(e.target.value)} />
                </label>

                <label className="mt-2 block text-xs text-slate-700">
                  Readiness Note
                  <textarea className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs" rows={2} value={fpReadinessNote} onChange={(e) => setFpReadinessNote(e.target.value)} />
                </label>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" disabled={busy} onClick={checkFinalProcessingReadiness} className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60">
                    Check Readiness
                  </button>
                  <button type="button" disabled={busy} onClick={prepareFinalProcessingPacket} className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600 disabled:opacity-60">
                    Prepare Manual Processing Packet
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <label className="text-xs text-slate-700">
                    Packet No
                    <input className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs" value={fpPacketNo} onChange={(e) => setFpPacketNo(e.target.value)} placeholder="Optional packet override" />
                  </label>
                  <label className="text-xs text-slate-700">
                    Readiness Warnings (comma or new line)
                    <textarea className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs" rows={2} value={fpWarnings} onChange={(e) => setFpWarnings(e.target.value)} />
                  </label>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <label className="text-xs text-slate-700">
                    Export Note
                    <textarea className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs" rows={2} value={fpExportNote} onChange={(e) => setFpExportNote(e.target.value)} />
                  </label>
                  <label className="text-xs text-slate-700">
                    Review Note
                    <textarea className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs" rows={2} value={fpReviewNote} onChange={(e) => setFpReviewNote(e.target.value)} />
                  </label>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" disabled={busy} onClick={markFinalPacketExported} className="rounded-md bg-cyan-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-cyan-600 disabled:opacity-60">
                    Mark Packet Exported
                  </button>
                  <button type="button" disabled={busy} onClick={markFinalReviewCompleted} className="rounded-md bg-indigo-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-600 disabled:opacity-60">
                    Mark Review Completed
                  </button>
                </div>

                {phase3c4?.packet ? (
                  <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
                    <div className="font-semibold">Prepared Packet</div>
                    <div>Packet No: {phase3c4.packet.packetNo}</div>
                    <div>Rows: {phase3c4.packet.articleRows.length}</div>
                    <div>Service Summary: {Object.entries(phase3c4.packet.serviceSummary).map(([key, value]) => `${key}:${value}`).join(", ")}</div>
                    <div>Value Payable Included: {phase3c4.packet.valuePayableSummary.included ? "Yes" : "No"}</div>
                    <div>COD Included: {phase3c4.packet.codSummary.included ? "Yes" : "No"}</div>
                    {phase3c4.packet.readinessWarnings.length > 0 ? (
                      <div className="mt-1">Warnings: {phase3c4.packet.readinessWarnings.join(" | ")}</div>
                    ) : null}
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
