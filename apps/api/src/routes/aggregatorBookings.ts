import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import {
  cancelBooking,
  convertQuoteToDraft,
  createDraftFromQuote,
  getAggregatorPaymentOptions,
  getBookingForUser,
  loadAggregatorPaymentContext,
  getBookingTimelineForUser,
  listBookingsForUser,
  submitAggregatorManualPayment,
  submitBooking,
  updateBookingDraft,
} from "../services/aggregatorBookingService.js";
import {
  getAggregatorGatewayOptions as getAggregatorGatewayOptionsV3C5B,
  getAggregatorJazzcashStatus as getAggregatorJazzcashStatusV3C5B,
  startAggregatorJazzcashPayment as startAggregatorJazzcashPaymentV3C5B,
} from "../services/aggregatorPaymentGatewayService.js";
import {
  createAggregatorBookingDocumentMetadata,
  listAggregatorBookingDocumentsForUser,
} from "../services/aggregatorDocumentService.js";
import {
  aggregatorManualPaymentSubmitSchema,
  aggregatorGatewayJazzcashStartSchema,
  aggregatorGatewayStatusQuerySchema,
  cancelBookingSchema,
  createBookingDocumentMetadataSchema,
  convertQuoteToDraftSchema,
  createBookingDraftSchema,
  listBookingQuerySchema,
  submitBookingSchema,
  updateBookingDraftSchema,
} from "../utils/aggregatorBookingValidation.js";

export const aggregatorBookingsRouter = Router();

aggregatorBookingsRouter.use(requireAuth);
aggregatorBookingsRouter.use((req, res, next) => {
  const path = String(req.path ?? "");
  const blockedPrefixes = ["/payment", "/final-processing", "/documents"];
  if (blockedPrefixes.some((prefix) => path.includes(prefix))) {
    return res.status(403).json({
      success: false,
      error:
        "Phase 2B scope guard: payment, document, and final-processing endpoints are disabled for draft-request flow.",
    });
  }
  return next();
});

aggregatorBookingsRouter.post("/quotes/convert-to-draft", async (req: AuthedRequest, res) => {
  try {
    const userId = String(req.user?.id ?? "").trim();
    const payload = convertQuoteToDraftSchema.parse(req.body);
    const result = await convertQuoteToDraft({
      userId,
      quoteVersion: payload.quoteVersion,
      rows: payload.rows,
      quoteSummary: payload.quoteSummary,
      rateCardVersionSet: payload.rateCardVersionSet,
      expiresAt: payload.expiresAt,
      sender: payload.sender,
      selectedOption: payload.selectedOption,
      recommendationSnapshot: payload.recommendationSnapshot,
      requestFlags: payload.requestFlags,
      sourceFile: payload.sourceFile,
      context: { req },
    });

    return res.status(201).json({
      success: true,
      message: "Draft request created. This is not booking confirmation and requires admin review before operational action.",
      quote: result.quote,
      booking: result.booking,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: "Invalid conversion payload", details: error.errors });
    }
    const message = error instanceof Error ? error.message : "Failed to convert quote to booking draft";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return res.status(status).json({ success: false, error: message });
  }
});

aggregatorBookingsRouter.post("/", async (req: AuthedRequest, res) => {
  try {
    const userId = String(req.user?.id ?? "").trim();
    const payload = createBookingDraftSchema.parse(req.body);
    const booking = await createDraftFromQuote({
      userId,
      aggregatorQuoteId: payload.aggregatorQuoteId,
      sender: payload.sender,
      context: { req },
    });
    return res.status(201).json({ success: true, booking });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: "Invalid booking payload", details: error.errors });
    }
    const message = error instanceof Error ? error.message : "Failed to create booking draft";
    const status = message === "Unauthorized" ? 401 : message === "Quote not found" ? 404 : 500;
    return res.status(status).json({ success: false, error: message });
  }
});

aggregatorBookingsRouter.get("/", async (req: AuthedRequest, res) => {
  try {
    const userId = String(req.user?.id ?? "").trim();
    const query = listBookingQuerySchema.parse(req.query);
    const response = await listBookingsForUser({
      userId,
      page: query.page,
      pageSize: query.pageSize,
      status: query.status,
    });
    return res.json({ success: true, ...response });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: "Invalid query parameters", details: error.errors });
    }
    const message = error instanceof Error ? error.message : "Failed to list bookings";
    return res.status(500).json({ success: false, error: message });
  }
});

aggregatorBookingsRouter.get("/:id", async (req: AuthedRequest, res) => {
  try {
    const userId = String(req.user?.id ?? "").trim();
    const bookingId = String(req.params.id ?? "").trim();
    const booking = await getBookingForUser({ bookingId, userId });
    return res.json({ success: true, booking });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load booking";
    const status = message === "Booking not found" ? 404 : message === "Forbidden" ? 403 : 500;
    return res.status(status).json({ success: false, error: message });
  }
});

aggregatorBookingsRouter.get("/:id/documents", async (req: AuthedRequest, res) => {
  try {
    const userId = String(req.user?.id ?? "").trim();
    const bookingId = String(req.params.id ?? "").trim();
    const documents = await listAggregatorBookingDocumentsForUser({ bookingId, userId });
    return res.json({ success: true, documents });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list booking documents";
    const status = message === "Booking not found" ? 404 : message === "Forbidden" ? 403 : 500;
    return res.status(status).json({ success: false, error: message });
  }
});

aggregatorBookingsRouter.post("/:id/documents", async (req: AuthedRequest, res) => {
  try {
    const userId = String(req.user?.id ?? "").trim();
    const bookingId = String(req.params.id ?? "").trim();
    const payload = createBookingDocumentMetadataSchema.parse(req.body);
    const document = await createAggregatorBookingDocumentMetadata({
      bookingId,
      userId,
      actorUserId: userId,
      docType: payload.docType,
      bucket: payload.bucket,
      objectKey: payload.objectKey,
      sizeBytes: payload.sizeBytes,
      contentType: payload.contentType,
      checksum: payload.checksum,
      originalFileName: payload.originalFileName,
      uploadStatus: payload.uploadStatus,
      localTempPath: payload.localTempPath,
      localCleanupStatus: payload.localCleanupStatus,
      req,
    });
    return res.status(201).json({ success: true, document });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: "Invalid document metadata payload", details: error.errors });
    }
    const message = error instanceof Error ? error.message : "Failed to attach booking document metadata";
    const status = message === "Booking not found" ? 404 : message === "Forbidden" ? 403 : 500;
    return res.status(status).json({ success: false, error: message });
  }
});

aggregatorBookingsRouter.patch("/:id/draft", async (req: AuthedRequest, res) => {
  try {
    const userId = String(req.user?.id ?? "").trim();
    const bookingId = String(req.params.id ?? "").trim();
    const payload = updateBookingDraftSchema.parse(req.body);
    const booking = await updateBookingDraft({
      bookingId,
      userId,
      patch: payload,
      context: { req },
    });
    return res.json({ success: true, booking });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: "Invalid draft payload", details: error.errors });
    }
    const message = error instanceof Error ? error.message : "Failed to update booking draft";
    const status = message === "Booking not found" ? 404 : message === "Forbidden" ? 403 : 400;
    return res.status(status).json({ success: false, error: message });
  }
});

aggregatorBookingsRouter.post("/:id/submit", async (req: AuthedRequest, res) => {
  try {
    const userId = String(req.user?.id ?? "").trim();
    const bookingId = String(req.params.id ?? "").trim();
    const payload = submitBookingSchema.parse(req.body ?? {});
    const booking = await submitBooking({
      bookingId,
      userId,
      note: payload.note,
      context: { req },
    });
    return res.json({
      success: true,
      message: "Submitted for admin review. This is not final booking confirmation and remains manual-action only.",
      booking,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: "Invalid submit payload", details: error.errors });
    }
    const message = error instanceof Error ? error.message : "Failed to submit booking";
    const status = message === "Booking not found" ? 404 : message === "Forbidden" ? 403 : 400;
    return res.status(status).json({ success: false, error: message });
  }
});

aggregatorBookingsRouter.post("/:id/cancel", async (req: AuthedRequest, res) => {
  try {
    const userId = String(req.user?.id ?? "").trim();
    const bookingId = String(req.params.id ?? "").trim();
    const payload = cancelBookingSchema.parse(req.body);
    const booking = await cancelBooking({
      bookingId,
      userId,
      reasonCode: payload.reasonCode,
      note: payload.note,
      context: { req },
    });
    return res.json({ success: true, booking });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: "Invalid cancel payload", details: error.errors });
    }
    const message = error instanceof Error ? error.message : "Failed to cancel booking";
    const status = message === "Booking not found" ? 404 : message === "Forbidden" ? 403 : 400;
    return res.status(status).json({ success: false, error: message });
  }
});

aggregatorBookingsRouter.get("/:id/timeline", async (req: AuthedRequest, res) => {
  try {
    const userId = String(req.user?.id ?? "").trim();
    const bookingId = String(req.params.id ?? "").trim();
    const timeline = await getBookingTimelineForUser({ bookingId, userId });
    return res.json({ success: true, timeline });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load booking timeline";
    const status = message === "Booking not found" ? 404 : message === "Forbidden" ? 403 : 500;
    return res.status(status).json({ success: false, error: message });
  }
});

aggregatorBookingsRouter.get("/:id/final-processing/status", async (req: AuthedRequest, res) => {
  try {
    const userId = String(req.user?.id ?? "").trim();
    const bookingId = String(req.params.id ?? "").trim();
    const booking = await getBookingForUser({ bookingId, userId });
    return res.json({ success: true, status: booking.phase3c4FinalProcessing ?? null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load final processing status";
    const status = message === "Booking not found" ? 404 : message === "Forbidden" ? 403 : 500;
    return res.status(status).json({ success: false, error: message });
  }
});

aggregatorBookingsRouter.get("/:id/payment/options", async (req: AuthedRequest, res) => {
  try {
    const userId = String(req.user?.id ?? "").trim();
    const bookingId = String(req.params.id ?? "").trim();
    const result = await getAggregatorPaymentOptions({ bookingId, userId, context: { req } });
    return res.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load manual payment options";
    const status = message === "Booking not found" ? 404 : message === "Forbidden" ? 403 : 400;
    return res.status(status).json({ success: false, error: message });
  }
});

aggregatorBookingsRouter.get("/:id/payment/gateway-options", async (req: AuthedRequest, res) => {
  try {
    const userId = String(req.user?.id ?? "").trim();
    const bookingId = String(req.params.id ?? "").trim();
    const result = await getAggregatorGatewayOptionsV3C5B({ bookingId, userId });
    return res.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load gateway payment options";
    const status = message === "Booking not found" ? 404 : message === "Forbidden" ? 403 : 400;
    return res.status(status).json({ success: false, error: message });
  }
});

aggregatorBookingsRouter.post("/:id/payment/jazzcash/start", async (req: AuthedRequest, res) => {
  try {
    const userId = String(req.user?.id ?? "").trim();
    const bookingId = String(req.params.id ?? "").trim();
    const payload = aggregatorGatewayJazzcashStartSchema.parse(req.body ?? {});
    const result = await startAggregatorJazzcashPaymentV3C5B({
      bookingId,
      userId,
      amount: payload.amount,
      currency: payload.currency,
      mobileNumber: payload.mobileNumber,
    });
    return res.status(201).json({ success: true, ...result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: "Invalid JazzCash start payload", details: error.errors });
    }
    const message = error instanceof Error ? error.message : "Failed to start JazzCash gateway payment";
    const status = message === "Booking not found" ? 404 : message === "Forbidden" ? 403 : 400;
    return res.status(status).json({ success: false, error: message });
  }
});

aggregatorBookingsRouter.get("/:id/payment/jazzcash/status", async (req: AuthedRequest, res) => {
  try {
    const userId = String(req.user?.id ?? "").trim();
    const bookingId = String(req.params.id ?? "").trim();
    const query = aggregatorGatewayStatusQuerySchema.parse(req.query ?? {});
    const transaction = await getAggregatorJazzcashStatusV3C5B({
      bookingId,
      userId,
      withInquiry: query.withInquiry,
    });
    return res.json({ success: true, transaction });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: "Invalid JazzCash status query", details: error.errors });
    }
    const message = error instanceof Error ? error.message : "Failed to load JazzCash gateway status";
    const status = message === "Booking not found" ? 404 : message === "Forbidden" ? 403 : 400;
    return res.status(status).json({ success: false, error: message });
  }
});

aggregatorBookingsRouter.post("/:id/payment/manual-submit", async (req: AuthedRequest, res) => {
  try {
    const userId = String(req.user?.id ?? "").trim();
    const bookingId = String(req.params.id ?? "").trim();
    const payload = aggregatorManualPaymentSubmitSchema.parse(req.body ?? {});
    const result = await submitAggregatorManualPayment({
      bookingId,
      userId,
      method: payload.method,
      amount: payload.amount,
      currency: payload.currency,
      reference: payload.reference,
      payerName: payload.payerName,
      proofNote: payload.proofNote,
      manualFlags: payload.manualFlags,
      context: { req },
    });
    return res.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: "Invalid manual payment payload", details: error.errors });
    }
    const message = error instanceof Error ? error.message : "Failed to submit manual payment";
    const status = message === "Booking not found" ? 404 : message === "Forbidden" ? 403 : 400;
    return res.status(status).json({ success: false, error: message });
  }
});

aggregatorBookingsRouter.get("/:id/payment/status", async (req: AuthedRequest, res) => {
  try {
    const userId = String(req.user?.id ?? "").trim();
    const bookingId = String(req.params.id ?? "").trim();
    const { phase3c5Payment } = await loadAggregatorPaymentContext({
      bookingId,
      actorUserId: userId,
      actorType: "CUSTOMER",
    });
    return res.json({ success: true, status: phase3c5Payment });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load manual payment status";
    const status = message === "Booking not found" ? 404 : message === "Forbidden" ? 403 : 400;
    return res.status(status).json({ success: false, error: message });
  }
});
