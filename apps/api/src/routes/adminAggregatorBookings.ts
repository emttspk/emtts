import { Router } from "express";
import { z } from "zod";
import { requireAdmin, requireAuth, type AuthedRequest } from "../middleware/auth.js";
import {
  adminApproveBooking,
  adminMarkPending,
  adminRejectBooking,
  adminRequestCorrection,
  getBookingForAdmin,
  listBookingsForAdmin,
} from "../services/aggregatorBookingService.js";
import {
  adminApproveActionSchema,
  adminCorrectionActionSchema,
  adminListBookingQuerySchema,
  adminMarkPendingActionSchema,
  adminRejectActionSchema,
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
