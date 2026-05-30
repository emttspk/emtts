import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import {
  cancelBooking,
  convertQuoteToDraft,
  createDraftFromQuote,
  getBookingForUser,
  getBookingTimelineForUser,
  listBookingsForUser,
  submitBooking,
  updateBookingDraft,
} from "../services/aggregatorBookingService.js";
import {
  cancelBookingSchema,
  convertQuoteToDraftSchema,
  createBookingDraftSchema,
  listBookingQuerySchema,
  submitBookingSchema,
  updateBookingDraftSchema,
} from "../utils/aggregatorBookingValidation.js";

export const aggregatorBookingsRouter = Router();

aggregatorBookingsRouter.use(requireAuth);

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
      context: { req },
    });

    return res.status(201).json({ success: true, quote: result.quote, booking: result.booking });
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
    return res.json({ success: true, booking });
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
