import { Router } from "express";
import { z } from "zod";
import { requireAdmin, requireAuth, type AuthedRequest } from "../middleware/auth.js";
import {
  adminAddHubExceptionNote,
  adminApproveBooking,
  adminCancelAggregatorManualPayment,
  adminCheckFinalProcessingReadiness,
  adminRejectAggregatorManualPayment,
  adminGetFinalProcessingPacket,
  adminMarkFinalProcessingPacketExported,
  adminMarkFinalProcessingReviewed,
  adminMarkHubReceived,
  adminMarkPending,
  adminMarkReadyForFinalPostal,
  adminPrepareFinalProcessingPacket,
  adminPreviewBulkPackLabel,
  adminPreviewManifest,
  adminRecordDriverHandoff,
  adminRecordHubMismatch,
  adminRecordHubSortingDispatch,
  adminRecordInterFacilityTransfer,
  adminRejectBooking,
  adminRequestCorrection,
  adminResolveHubException,
  adminSaveBulkPackPlanningSelection,
  adminVerifyAggregatorManualPayment,
  adminVerifyHubManifest,
  getBookingForAdmin,
  listBookingsForAdmin,
} from "../services/aggregatorBookingService.js";
import {
  adminAddAggregatorRefundNote as adminAddAggregatorRefundNoteV3C5B,
  adminMarkAggregatorPaymentFailed as adminMarkAggregatorPaymentFailedV3C5B,
  adminReconcileAggregatorPayment as adminReconcileAggregatorPaymentV3C5B,
  listAggregatorPaymentTransactionsForAdmin as listAggregatorPaymentTransactionsForAdminV3C5B,
} from "../services/aggregatorPaymentGatewayService.js";
import {
  adminAggregatorManualPaymentCancelSchema,
  adminAggregatorGatewayMarkFailedSchema,
  adminAggregatorGatewayReconcileSchema,
  adminAggregatorGatewayRefundNoteSchema,
  adminAggregatorManualPaymentRejectSchema,
  adminAggregatorManualPaymentVerifySchema,
  adminApproveActionSchema,
  adminBulkPackLabelPreviewSchema,
  adminBulkPackPlanningSelectionSchema,
  adminCorrectionActionSchema,
  adminDriverHandoffSchema,
  adminFinalProcessingPacketExportSchema,
  adminFinalProcessingPacketSchema,
  adminFinalProcessingReadinessSchema,
  adminFinalProcessingReviewSchema,
  adminHubExceptionNoteSchema,
  adminHubMarkReceivedSchema,
  adminHubRecordMismatchSchema,
  adminHubResolveExceptionSchema,
  adminHubSortingDispatchSchema,
  adminHubVerifyManifestSchema,
  adminInterFacilityTransferSchema,
  adminListBookingQuerySchema,
  adminManifestPreviewSchema,
  adminMarkPendingActionSchema,
  adminReadyForPostalSchema,
  adminRejectActionSchema,
} from "../utils/aggregatorBookingValidation.js";

export const adminAggregatorBookingsRouter = Router();

adminAggregatorBookingsRouter.use(requireAuth, requireAdmin);
adminAggregatorBookingsRouter.use((req, res, next) => {
  const path = String(req.path ?? "");
  const blockedPrefixes = ["/payment", "/hub-receiving", "/handoff", "/final-processing", "/bulk-pack-plan"];
  if (blockedPrefixes.some((prefix) => path.includes(prefix))) {
    return res.status(403).json({
      success: false,
      error:
        "Phase 2B scope guard: only admin review actions (approve/reject/request-correction) are enabled.",
    });
  }
  return next();
});

adminAggregatorBookingsRouter.get("/", async (req, res) => {
  try {
    const query = adminListBookingQuerySchema.parse(req.query);
    const result = await listBookingsForAdmin({
      page: query.page,
      pageSize: query.pageSize,
      status: query.status,
      intakeMethod: query.intakeMethod,
      hubCity: query.hubCity,
      search: query.search,
    });
    return res.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: "Invalid query parameters", details: error.errors });
    }
    const message = error instanceof Error ? error.message : "Failed to list admin bookings";
    return res.status(500).json({ success: false, error: message });
  }
});

adminAggregatorBookingsRouter.get("/:id/payment-transactions", async (req, res) => {
  try {
    const bookingId = String(req.params.id ?? "").trim();
    const transactions = await listAggregatorPaymentTransactionsForAdminV3C5B(bookingId);
    return res.json({ success: true, transactions });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load payment transactions";
    const status = message === "Booking not found" ? 404 : 400;
    return res.status(status).json({ success: false, error: message });
  }
});

adminAggregatorBookingsRouter.post("/:id/payment/reconcile", async (req: AuthedRequest, res) => {
  try {
    const bookingId = String(req.params.id ?? "").trim();
    const payload = adminAggregatorGatewayReconcileSchema.parse(req.body ?? {});
    const adminUserId = String(req.user?.id ?? "").trim();
    const transaction = await adminReconcileAggregatorPaymentV3C5B({
      bookingId,
      orderRef: payload.orderRef,
      adminUserId,
      reconciliationNote: payload.reconciliationNote,
      status: payload.status,
    });
    return res.json({ success: true, transaction });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: "Invalid reconcile payload", details: error.errors });
    }
    const message = error instanceof Error ? error.message : "Failed to reconcile payment transaction";
    const status = message === "Booking not found" ? 404 : 400;
    return res.status(status).json({ success: false, error: message });
  }
});

adminAggregatorBookingsRouter.post("/:id/payment/mark-failed", async (req: AuthedRequest, res) => {
  try {
    const bookingId = String(req.params.id ?? "").trim();
    const payload = adminAggregatorGatewayMarkFailedSchema.parse(req.body ?? {});
    const adminUserId = String(req.user?.id ?? "").trim();
    const transaction = await adminMarkAggregatorPaymentFailedV3C5B({
      bookingId,
      orderRef: payload.orderRef,
      adminUserId,
      reason: payload.reason,
    });
    return res.json({ success: true, transaction });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: "Invalid mark-failed payload", details: error.errors });
    }
    const message = error instanceof Error ? error.message : "Failed to mark payment transaction failed";
    const status = message === "Booking not found" ? 404 : 400;
    return res.status(status).json({ success: false, error: message });
  }
});

adminAggregatorBookingsRouter.post("/:id/payment/refund-note", async (req: AuthedRequest, res) => {
  try {
    const bookingId = String(req.params.id ?? "").trim();
    const payload = adminAggregatorGatewayRefundNoteSchema.parse(req.body ?? {});
    const adminUserId = String(req.user?.id ?? "").trim();
    const transaction = await adminAddAggregatorRefundNoteV3C5B({
      bookingId,
      orderRef: payload.orderRef,
      adminUserId,
      note: payload.note,
    });
    return res.json({ success: true, transaction });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: "Invalid refund-note payload", details: error.errors });
    }
    const message = error instanceof Error ? error.message : "Failed to add refund note";
    const status = message === "Booking not found" ? 404 : 400;
    return res.status(status).json({ success: false, error: message });
  }
});

adminAggregatorBookingsRouter.get("/:id", async (req, res) => {
  try {
    const bookingId = String(req.params.id ?? "").trim();
    const booking = await getBookingForAdmin(bookingId);
    return res.json({ success: true, booking });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load admin booking";
    const status = message === "Booking not found" ? 404 : 500;
    return res.status(status).json({ success: false, error: message });
  }
});

adminAggregatorBookingsRouter.post("/:id/approve", async (req: AuthedRequest, res) => {
  try {
    const bookingId = String(req.params.id ?? "").trim();
    const payload = adminApproveActionSchema.parse(req.body ?? {});
    const adminUserId = String(req.user?.id ?? "").trim();
    const booking = await adminApproveBooking({
      bookingId,
      adminUserId,
      reasonCode: payload.reasonCode,
      note: payload.note,
      paymentStatus: payload.paymentStatus,
      context: { req },
    });
    return res.json({ success: true, booking });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: "Invalid approve payload", details: error.errors });
    }
    const message = error instanceof Error ? error.message : "Failed to approve booking";
    const status = message === "Booking not found" ? 404 : 400;
    return res.status(status).json({ success: false, error: message });
  }
});

adminAggregatorBookingsRouter.post("/:id/reject", async (req: AuthedRequest, res) => {
  try {
    const bookingId = String(req.params.id ?? "").trim();
    const payload = adminRejectActionSchema.parse(req.body ?? {});
    const adminUserId = String(req.user?.id ?? "").trim();
    const booking = await adminRejectBooking({
      bookingId,
      adminUserId,
      reasonCode: payload.reasonCode,
      note: payload.note,
      context: { req },
    });
    return res.json({ success: true, booking });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: "Invalid reject payload", details: error.errors });
    }
    const message = error instanceof Error ? error.message : "Failed to reject booking";
    const status = message === "Booking not found" ? 404 : 400;
    return res.status(status).json({ success: false, error: message });
  }
});

adminAggregatorBookingsRouter.post("/:id/request-correction", async (req: AuthedRequest, res) => {
  try {
    const bookingId = String(req.params.id ?? "").trim();
    const payload = adminCorrectionActionSchema.parse(req.body ?? {});
    const adminUserId = String(req.user?.id ?? "").trim();
    const booking = await adminRequestCorrection({
      bookingId,
      adminUserId,
      reasonCode: payload.reasonCode,
      note: payload.note,
      context: { req },
    });
    return res.json({ success: true, booking });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: "Invalid correction payload", details: error.errors });
    }
    const message = error instanceof Error ? error.message : "Failed to request correction";
    const status = message === "Booking not found" ? 404 : 400;
    return res.status(status).json({ success: false, error: message });
  }
});

adminAggregatorBookingsRouter.post("/:id/mark-pending", async (req: AuthedRequest, res) => {
  try {
    const bookingId = String(req.params.id ?? "").trim();
    const payload = adminMarkPendingActionSchema.parse(req.body ?? {});
    const adminUserId = String(req.user?.id ?? "").trim();
    const booking = await adminMarkPending({
      bookingId,
      adminUserId,
      reasonCode: payload.reasonCode,
      note: payload.note,
      context: { req },
    });
    return res.json({ success: true, booking });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: "Invalid pending payload", details: error.errors });
    }
    const message = error instanceof Error ? error.message : "Failed to mark booking pending";
    const status = message === "Booking not found" ? 404 : 400;
    return res.status(status).json({ success: false, error: message });
  }
});

adminAggregatorBookingsRouter.post("/:id/bulk-pack-plan/select", async (req: AuthedRequest, res) => {
  try {
    const bookingId = String(req.params.id ?? "").trim();
    const payload = adminBulkPackPlanningSelectionSchema.parse(req.body ?? {});
    const adminUserId = String(req.user?.id ?? "").trim();
    const result = await adminSaveBulkPackPlanningSelection({
      bookingId,
      adminUserId,
      selectedWarehouse: payload.selectedWarehouse,
      intakeCarrier: payload.intakeCarrier,
      paymentVerifiedReference: payload.paymentVerifiedReference,
      instructions: payload.instructions,
      planningFlags: payload.planningFlags,
      context: { req },
    });
    return res.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: "Invalid bulk-pack planning payload", details: error.errors });
    }
    const message = error instanceof Error ? error.message : "Failed to save bulk-pack planning selection";
    const status = message === "Booking not found" ? 404 : 400;
    return res.status(status).json({ success: false, error: message });
  }
});

adminAggregatorBookingsRouter.post("/:id/bulk-pack-plan/label-preview", async (req: AuthedRequest, res) => {
  try {
    const bookingId = String(req.params.id ?? "").trim();
    const payload = adminBulkPackLabelPreviewSchema.parse(req.body ?? {});
    const adminUserId = String(req.user?.id ?? "").trim();
    const result = await adminPreviewBulkPackLabel({
      bookingId,
      adminUserId,
      planningFlags: payload.planningFlags,
      context: { req },
    });
    return res.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: "Invalid bulk-pack label preview payload", details: error.errors });
    }
    const message = error instanceof Error ? error.message : "Failed to build bulk-pack label preview";
    const status = message === "Booking not found" ? 404 : 400;
    return res.status(status).json({ success: false, error: message });
  }
});

adminAggregatorBookingsRouter.post("/:id/bulk-pack-plan/manifest-preview", async (req: AuthedRequest, res) => {
  try {
    const bookingId = String(req.params.id ?? "").trim();
    const payload = adminManifestPreviewSchema.parse(req.body ?? {});
    const adminUserId = String(req.user?.id ?? "").trim();
    const result = await adminPreviewManifest({
      bookingId,
      adminUserId,
      planningFlags: payload.planningFlags,
      context: { req },
    });
    return res.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: "Invalid manifest preview payload", details: error.errors });
    }
    const message = error instanceof Error ? error.message : "Failed to build manifest preview";
    const status = message === "Booking not found" ? 404 : 400;
    return res.status(status).json({ success: false, error: message });
  }
});

adminAggregatorBookingsRouter.post("/:id/hub-receiving/mark-received", async (req: AuthedRequest, res) => {
  try {
    const bookingId = String(req.params.id ?? "").trim();
    const payload = adminHubMarkReceivedSchema.parse(req.body ?? {});
    const adminUserId = String(req.user?.id ?? "").trim();
    const result = await adminMarkHubReceived({
      bookingId,
      adminUserId,
      receivedArticleCount: payload.receivedArticleCount,
      receivedBundleWeightGrams: payload.receivedBundleWeightGrams,
      conditionNote: payload.conditionNote,
      manualFlags: payload.manualFlags,
      context: { req },
    });
    return res.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: "Invalid hub receiving payload", details: error.errors });
    }
    const message = error instanceof Error ? error.message : "Failed to mark hub receiving";
    const status = message === "Booking not found" ? 404 : 400;
    return res.status(status).json({ success: false, error: message });
  }
});

adminAggregatorBookingsRouter.post("/:id/hub-receiving/verify-manifest", async (req: AuthedRequest, res) => {
  try {
    const bookingId = String(req.params.id ?? "").trim();
    const payload = adminHubVerifyManifestSchema.parse(req.body ?? {});
    const adminUserId = String(req.user?.id ?? "").trim();
    const result = await adminVerifyHubManifest({
      bookingId,
      adminUserId,
      receivedArticleCount: payload.receivedArticleCount,
      manualFlags: payload.manualFlags,
      context: { req },
    });
    return res.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: "Invalid manifest verification payload", details: error.errors });
    }
    const message = error instanceof Error ? error.message : "Failed to verify manifest";
    const status = message === "Booking not found" ? 404 : 400;
    return res.status(status).json({ success: false, error: message });
  }
});

adminAggregatorBookingsRouter.post("/:id/hub-receiving/record-mismatch", async (req: AuthedRequest, res) => {
  try {
    const bookingId = String(req.params.id ?? "").trim();
    const payload = adminHubRecordMismatchSchema.parse(req.body ?? {});
    const adminUserId = String(req.user?.id ?? "").trim();
    const result = await adminRecordHubMismatch({
      bookingId,
      adminUserId,
      receivedArticleCount: payload.receivedArticleCount,
      mismatchReason: payload.mismatchReason,
      adminNote: payload.adminNote,
      manualFlags: payload.manualFlags,
      context: { req },
    });
    return res.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: "Invalid mismatch payload", details: error.errors });
    }
    const message = error instanceof Error ? error.message : "Failed to record manifest mismatch";
    const status = message === "Booking not found" ? 404 : 400;
    return res.status(status).json({ success: false, error: message });
  }
});

adminAggregatorBookingsRouter.post("/:id/hub-receiving/add-exception-note", async (req: AuthedRequest, res) => {
  try {
    const bookingId = String(req.params.id ?? "").trim();
    const payload = adminHubExceptionNoteSchema.parse(req.body ?? {});
    const adminUserId = String(req.user?.id ?? "").trim();
    const result = await adminAddHubExceptionNote({
      bookingId,
      adminUserId,
      exceptionNote: payload.exceptionNote,
      manualFlags: payload.manualFlags,
      context: { req },
    });
    return res.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: "Invalid exception-note payload", details: error.errors });
    }
    const message = error instanceof Error ? error.message : "Failed to add exception note";
    const status = message === "Booking not found" ? 404 : 400;
    return res.status(status).json({ success: false, error: message });
  }
});

adminAggregatorBookingsRouter.post("/:id/hub-receiving/resolve-exception", async (req: AuthedRequest, res) => {
  try {
    const bookingId = String(req.params.id ?? "").trim();
    const payload = adminHubResolveExceptionSchema.parse(req.body ?? {});
    const adminUserId = String(req.user?.id ?? "").trim();
    const result = await adminResolveHubException({
      bookingId,
      adminUserId,
      resolutionType: payload.resolutionType,
      resolutionNote: payload.resolutionNote,
      manualFlags: payload.manualFlags,
      context: { req },
    });
    return res.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: "Invalid resolution payload", details: error.errors });
    }
    const message = error instanceof Error ? error.message : "Failed to resolve exception";
    const status = message === "Booking not found" ? 404 : 400;
    return res.status(status).json({ success: false, error: message });
  }
});

adminAggregatorBookingsRouter.post("/:id/handoff/record-driver-handoff", async (req: AuthedRequest, res) => {
  try {
    const bookingId = String(req.params.id ?? "").trim();
    const payload = adminDriverHandoffSchema.parse(req.body ?? {});
    const adminUserId = String(req.user?.id ?? "").trim();
    const result = await adminRecordDriverHandoff({
      bookingId,
      adminUserId,
      handoffType: payload.handoffType,
      fromParty: payload.fromParty,
      toParty: payload.toParty,
      receivedBy: payload.receivedBy,
      bundleCondition: payload.bundleCondition,
      articleCount: payload.articleCount,
      note: payload.note,
      manualFlags: payload.manualFlags,
      context: { req },
    });
    return res.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: "Invalid driver handoff payload", details: error.errors });
    }
    const message = error instanceof Error ? error.message : "Failed to record driver handoff";
    const status = message === "Booking not found" ? 404 : 400;
    return res.status(status).json({ success: false, error: message });
  }
});

adminAggregatorBookingsRouter.post("/:id/handoff/record-sorting-dispatch", async (req: AuthedRequest, res) => {
  try {
    const bookingId = String(req.params.id ?? "").trim();
    const payload = adminHubSortingDispatchSchema.parse(req.body ?? {});
    const adminUserId = String(req.user?.id ?? "").trim();
    const result = await adminRecordHubSortingDispatch({
      bookingId,
      adminUserId,
      fromWarehouse: payload.fromWarehouse,
      toSortingFacility: payload.toSortingFacility,
      dispatchedBy: payload.dispatchedBy,
      expectedArticleCount: payload.expectedArticleCount,
      bundleWeightGrams: payload.bundleWeightGrams ?? null,
      transportMode: payload.transportMode,
      note: payload.note,
      manualFlags: payload.manualFlags,
      context: { req },
    });
    return res.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: "Invalid sorting dispatch payload", details: error.errors });
    }
    const message = error instanceof Error ? error.message : "Failed to record sorting dispatch";
    const status = message === "Booking not found" ? 404 : 400;
    return res.status(status).json({ success: false, error: message });
  }
});

adminAggregatorBookingsRouter.post("/:id/handoff/record-transfer", async (req: AuthedRequest, res) => {
  try {
    const bookingId = String(req.params.id ?? "").trim();
    const payload = adminInterFacilityTransferSchema.parse(req.body ?? {});
    const adminUserId = String(req.user?.id ?? "").trim();
    const result = await adminRecordInterFacilityTransfer({
      bookingId,
      adminUserId,
      fromFacility: payload.fromFacility,
      toFacility: payload.toFacility,
      transferBy: payload.transferBy,
      transferReference: payload.transferReference ?? null,
      articleCount: payload.articleCount,
      note: payload.note,
      manualFlags: payload.manualFlags,
      context: { req },
    });
    return res.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: "Invalid transfer payload", details: error.errors });
    }
    const message = error instanceof Error ? error.message : "Failed to record inter-facility transfer";
    const status = message === "Booking not found" ? 404 : 400;
    return res.status(status).json({ success: false, error: message });
  }
});

adminAggregatorBookingsRouter.post("/:id/handoff/mark-ready-for-postal", async (req: AuthedRequest, res) => {
  try {
    const bookingId = String(req.params.id ?? "").trim();
    const payload = adminReadyForPostalSchema.parse(req.body ?? {});
    const adminUserId = String(req.user?.id ?? "").trim();
    const result = await adminMarkReadyForFinalPostal({
      bookingId,
      adminUserId,
      expectedArticleCount: payload.expectedArticleCount,
      note: payload.note,
      manualFlags: payload.manualFlags,
      context: { req },
    });
    return res.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: "Invalid ready-for-postal payload", details: error.errors });
    }
    const message = error instanceof Error ? error.message : "Failed to mark ready for final postal processing";
    const status = message === "Booking not found" ? 404 : 400;
    return res.status(status).json({ success: false, error: message });
  }
});

adminAggregatorBookingsRouter.post("/:id/final-processing/check-readiness", async (req: AuthedRequest, res) => {
  try {
    const bookingId = String(req.params.id ?? "").trim();
    const payload = adminFinalProcessingReadinessSchema.parse(req.body ?? {});
    const adminUserId = String(req.user?.id ?? "").trim();
    const result = await adminCheckFinalProcessingReadiness({
      bookingId,
      adminUserId,
      expectedArticleCount: payload.expectedArticleCount,
      verifiedArticleCount: payload.verifiedArticleCount,
      servicesIncluded: payload.servicesIncluded,
      exceptions: payload.exceptions,
      note: payload.note,
      manualFlags: payload.manualFlags,
      context: { req },
    });
    return res.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: "Invalid final-processing readiness payload", details: error.errors });
    }
    const message = error instanceof Error ? error.message : "Failed to check final processing readiness";
    const status = message === "Booking not found" ? 404 : 400;
    return res.status(status).json({ success: false, error: message });
  }
});

adminAggregatorBookingsRouter.post("/:id/final-processing/prepare-packet", async (req: AuthedRequest, res) => {
  try {
    const bookingId = String(req.params.id ?? "").trim();
    const payload = adminFinalProcessingPacketSchema.parse(req.body ?? {});
    const adminUserId = String(req.user?.id ?? "").trim();
    const result = await adminPrepareFinalProcessingPacket({
      bookingId,
      adminUserId,
      packetNo: payload.packetNo,
      articleRows: payload.articleRows,
      readinessWarnings: payload.readinessWarnings,
      note: payload.note,
      manualFlags: payload.manualFlags,
      context: { req },
    });
    return res.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: "Invalid final-processing packet payload", details: error.errors });
    }
    const message = error instanceof Error ? error.message : "Failed to prepare final processing packet";
    const status = message === "Booking not found" ? 404 : 400;
    return res.status(status).json({ success: false, error: message });
  }
});

adminAggregatorBookingsRouter.post("/:id/final-processing/mark-exported", async (req: AuthedRequest, res) => {
  try {
    const bookingId = String(req.params.id ?? "").trim();
    const payload = adminFinalProcessingPacketExportSchema.parse(req.body ?? {});
    const adminUserId = String(req.user?.id ?? "").trim();
    const result = await adminMarkFinalProcessingPacketExported({
      bookingId,
      adminUserId,
      packetNo: payload.packetNo,
      exportFormat: payload.exportFormat,
      note: payload.note,
      manualFlags: payload.manualFlags,
      context: { req },
    });
    return res.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: "Invalid packet export payload", details: error.errors });
    }
    const message = error instanceof Error ? error.message : "Failed to mark final processing packet exported";
    const status = message === "Booking not found" ? 404 : 400;
    return res.status(status).json({ success: false, error: message });
  }
});

adminAggregatorBookingsRouter.post("/:id/final-processing/mark-reviewed", async (req: AuthedRequest, res) => {
  try {
    const bookingId = String(req.params.id ?? "").trim();
    const payload = adminFinalProcessingReviewSchema.parse(req.body ?? {});
    const adminUserId = String(req.user?.id ?? "").trim();
    const result = await adminMarkFinalProcessingReviewed({
      bookingId,
      adminUserId,
      packetNo: payload.packetNo,
      reviewNote: payload.reviewNote,
      manualFlags: payload.manualFlags,
      context: { req },
    });
    return res.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: "Invalid final-processing review payload", details: error.errors });
    }
    const message = error instanceof Error ? error.message : "Failed to mark final processing review complete";
    const status = message === "Booking not found" ? 404 : 400;
    return res.status(status).json({ success: false, error: message });
  }
});

adminAggregatorBookingsRouter.get("/:id/final-processing/packet", async (req, res) => {
  try {
    const bookingId = String(req.params.id ?? "").trim();
    const packet = await adminGetFinalProcessingPacket({ bookingId });
    return res.json({ success: true, packet });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch final processing packet";
    const status = message === "Booking not found" ? 404 : 400;
    return res.status(status).json({ success: false, error: message });
  }
});

adminAggregatorBookingsRouter.post("/:id/payment/manual-verify", async (req: AuthedRequest, res) => {
  try {
    const bookingId = String(req.params.id ?? "").trim();
    const payload = adminAggregatorManualPaymentVerifySchema.parse(req.body ?? {});
    const adminUserId = String(req.user?.id ?? "").trim();
    const result = await adminVerifyAggregatorManualPayment({
      bookingId,
      adminUserId,
      verificationNote: payload.verificationNote,
      verifiedReference: payload.verifiedReference,
      manualFlags: payload.manualFlags,
      context: { req },
    });
    return res.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: "Invalid manual verify payload", details: error.errors });
    }
    const message = error instanceof Error ? error.message : "Failed to verify manual payment";
    const status = message === "Booking not found" ? 404 : 400;
    return res.status(status).json({ success: false, error: message });
  }
});

adminAggregatorBookingsRouter.post("/:id/payment/manual-reject", async (req: AuthedRequest, res) => {
  try {
    const bookingId = String(req.params.id ?? "").trim();
    const payload = adminAggregatorManualPaymentRejectSchema.parse(req.body ?? {});
    const adminUserId = String(req.user?.id ?? "").trim();
    const result = await adminRejectAggregatorManualPayment({
      bookingId,
      adminUserId,
      rejectionReason: payload.rejectionReason,
      rejectionNote: payload.rejectionNote,
      manualFlags: payload.manualFlags,
      context: { req },
    });
    return res.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: "Invalid manual reject payload", details: error.errors });
    }
    const message = error instanceof Error ? error.message : "Failed to reject manual payment";
    const status = message === "Booking not found" ? 404 : 400;
    return res.status(status).json({ success: false, error: message });
  }
});

adminAggregatorBookingsRouter.post("/:id/payment/manual-cancel", async (req: AuthedRequest, res) => {
  try {
    const bookingId = String(req.params.id ?? "").trim();
    const payload = adminAggregatorManualPaymentCancelSchema.parse(req.body ?? {});
    const adminUserId = String(req.user?.id ?? "").trim();
    const result = await adminCancelAggregatorManualPayment({
      bookingId,
      adminUserId,
      cancellationReason: payload.cancellationReason,
      cancellationNote: payload.cancellationNote,
      manualFlags: payload.manualFlags,
      context: { req },
    });
    return res.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: "Invalid manual cancel payload", details: error.errors });
    }
    const message = error instanceof Error ? error.message : "Failed to cancel manual payment";
    const status = message === "Booking not found" ? 404 : 400;
    return res.status(status).json({ success: false, error: message });
  }
});
