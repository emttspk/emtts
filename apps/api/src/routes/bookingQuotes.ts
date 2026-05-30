import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { buildBookingQuoteSummary, parseQuoteRowsFromBuffer } from "../services/bookingQuoteService.js";

export const bookingQuotesRouter = Router();

const quoteRequestSchema = z.object({
  rows: z.array(z.record(z.unknown())).min(1, "At least one row is required"),
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

bookingQuotesRouter.post("/quote", requireAuth, upload.single("file"), async (req, res) => {
  try {
    let rows: Array<Record<string, unknown>> = [];

    if (req.file?.buffer) {
      rows = parseQuoteRowsFromBuffer(req.file.buffer);
    } else {
      const payload = quoteRequestSchema.parse(req.body);
      rows = payload.rows;
    }

    if (rows.length < 1) {
      return res.status(400).json({
        success: false,
        error: "No quote rows found. Upload a CSV/XLSX file or provide rows in JSON.",
      });
    }

    const quoteSummary = buildBookingQuoteSummary(rows);

    return res.json({
      success: true,
      mode: "quote_only",
      message: "Aggregator booking quote calculated. This is quote-only and not a booking confirmation.",
      quoteSummary,
      notices: [
        "Phase 1 quote only: no booking creation, no payment initiation, and no upload-generation flow changes.",
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
