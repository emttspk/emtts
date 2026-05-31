import { Router } from "express";
import { z } from "zod";
import { requireAdmin, requireAuth, type AuthedRequest } from "../middleware/auth.js";
import {
  adminAddHubExceptionNote,
  adminPreviewBulkPackLabel,
  adminPreviewManifest,
  adminApproveBooking,
  adminMarkHubReceived,
  adminSaveBulkPackPlanningSelection,
  adminMarkPending,
  adminRecordHubMismatch,
  adminRejectBooking,
  adminResolveHubException,
  adminRequestCorrection,
  adminVerifyHubManifest,
  getBookingForAdmin,
  listBookingsForAdmin,
} from "../services/aggregatorBookingService.js";
import {
  adminMarkReadyForFinalPostal,
  adminRecordDriverHandoff,
  adminRecordHubSortingDispatch,
  adminRecordInterFacilityTransfer,
} from "../services/aggregatorBookingService.js";
import {
  adminApproveActionSchema,
  adminBulkPackLabelPreviewSchema,
  adminBulkPackPlanningSelectionSchema,
  adminManifestPreviewSchema,
  adminCorrectionActionSchema,
  adminListBookingQuerySchema,
  adminMarkPendingActionSchema,
  adminRejectActionSchema,
  adminHubExceptionNoteSchema,
  adminHubMarkReceivedSchema,
  adminHubRecordMismatchSchema,
  adminHubResolveExceptionSchema,
  adminHubVerifyManifestSchema,
} from "../utils/aggregatorBookingValidation.js";
import {
  adminDriverHandoffSchema,
  adminHubSortingDispatchSchema,
  adminInterFacilityTransferSchema,
  adminReadyForPostalSchema,
} from "../utils/aggregatorBookingValidation.js";

export const adminAggregatorBookingsRouter = Router();

adminAggregatorBookingsRouter.use(requireAuth, requireAdmin);

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

    adminAggregatorBookingsRouter.post("/:id/handoff/record-driver-handoff", async (req: AuthedRequest, res) => {
      try {
        const bookingId = req.params.id;
        const body = adminDriverHandoffSchema.parse(req.body);
        const adminUserId = req.user?.id ?? "unknown";
        const result = await adminRecordDriverHandoff({
          bookingId,
          adminUserId,
          handoffType: body.handoffType,
          fromParty: body.fromParty,
          toParty: body.toParty,
          receivedBy: body.receivedBy,
          bundleCondition: body.bundleCondition,
          articleCount: body.articleCount,
          note: body.note,
          manualFlags: body.manualFlags,
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
        const bookingId = req.params.id;
        const body = adminHubSortingDispatchSchema.parse(req.body);
        const adminUserId = req.user?.id ?? "unknown";
        const result = await adminRecordHubSortingDispatch({
          bookingId,
          adminUserId,
          fromWarehouse: body.fromWarehouse,
          toSortingFacility: body.toSortingFacility,
          dispatchedBy: body.dispatchedBy,
          expectedArticleCount: body.expectedArticleCount,
          bundleWeightGrams: body.bundleWeightGrams ?? null,
          transportMode: body.transportMode,
          note: body.note,
          manualFlags: body.manualFlags,
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
        const bookingId = req.params.id;
        const body = adminInterFacilityTransferSchema.parse(req.body);
        const adminUserId = req.user?.id ?? "unknown";
        const result = await adminRecordInterFacilityTransfer({
          bookingId,
          adminUserId,
          fromFacility: body.fromFacility,
          toFacility: body.toFacility,
          transferBy: body.transferBy,
          transferReference: body.transferReference ?? null,
          articleCount: body.articleCount,
          note: body.note,
          manualFlags: body.manualFlags,
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
        const bookingId = req.params.id;
        const body = adminReadyForPostalSchema.parse(req.body);
        const adminUserId = req.user?.id ?? "unknown";
        const result = await adminMarkReadyForFinalPostal({
          bookingId,
          adminUserId,
          expectedArticleCount: body.expectedArticleCount,
          note: body.note,
          manualFlags: body.manualFlags,
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
    const status = message === "Booking not found" ? 404 : 400;
    return res.status(status).json({ success: false, error: message });
  }
});
