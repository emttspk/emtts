import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { parsePostageUploadSummary } from "../parse/postageUploadSummary.js";
import { buildPostageCalculatorSummary } from "../services/postageCalculatorService.js";
import { buildPostageComparisonSummary } from "../services/postageComparisonService.js";
import { normalizeUploadRows } from "../utils/postageUploadValidation.js";

export const postageCalculatorRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const bodySchema = z.object({
  rows: z.array(z.record(z.unknown())).min(1),
  courierRatePerKg: z.number().positive().optional(),
});

postageCalculatorRouter.post("/calculate", requireAuth, upload.single("file"), (req, res) => {
  try {
    const courierRatePerKg = Number(req.body?.courierRatePerKg ?? 350);
    const rows = req.file?.buffer
      ? parsePostageUploadSummary(req.file.buffer)
      : normalizeUploadRows(bodySchema.parse(req.body).rows);
    const calculator = buildPostageCalculatorSummary(rows);
    const comparison = buildPostageComparisonSummary(calculator, courierRatePerKg);
    return res.json({ success: true, calculator, comparison });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to calculate postage";
    return res.status(400).json({ success: false, error: message });
  }
});
