import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { buildBookingQuoteSummary } from "../services/bookingQuoteService.js";

export const bookingQuotesRouter = Router();

const quoteRequestSchema = z.object({
  rows: z.array(z.record(z.unknown())).min(1, "At least one row is required"),
});

bookingQuotesRouter.post("/quote", requireAuth, async (req, res) => {
  try {
    const payload = quoteRequestSchema.parse(req.body);
    const quoteSummary = buildBookingQuoteSummary(payload.rows);

    return res.json({
      success: true,
      mode: "quote_only",
      message: "Aggregator booking quote calculated. This is not a confirmed booking.",
      quoteSummary,
      notices: [
        "Phase 1.5 quote only: versioned official rate cards are used; no payment, pickup charges, service charges, or booking confirmation included.",
        "Existing SaaS unit-based upload/generation flow is unchanged.",
      ],
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: "Invalid quote request",
        details: error.errors,
      });
    }

    const message = error instanceof Error ? error.message : "Failed to calculate quote";
    return res.status(500).json({ success: false, error: message });
  }
});
