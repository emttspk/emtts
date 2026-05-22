import { Router } from "express";
import type { Request as ExpressRequest, Response as ExpressResponse, NextFunction as ExpressNextFunction } from "express";
import { existsSync } from "node:fs";
import fsSync from "node:fs";
import multer from "multer";
import path from "node:path";
import fs from "node:fs/promises";
import { getStorageProvider, getDualProviders } from "../storage/provider.js";
import type { StorageProvider } from "../storage/StorageProvider.js";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import type { AuthedRequest } from "../middleware/auth.js";
import { ensureStorageDirs, moneyOrdersOutputPath, outputsDir, resolveStoredPath, toStoredPath, uploadsDir, waitForStoredFile, waitForStoredFileWithFallback } from "../storage/paths.js";
import { parseOrdersFromFile } from "../parse/orders.js";
import { ensureRedisConnection } from "../queue/redis.js";
import { consumeUnits, getLatestUnitSnapshot, refundUnits } from "../usage/unitConsumption.js";
import { getQueue } from "../lib/queue.js";
import { buildLabelPdfFileName, buildMoneyOrderPdfFileName, buildPdfAttachmentHeader } from "../lib/printBranding.js";
import { previewLabelHtml, renderLabelDocumentHtml, type LabelPrintMode } from "../templates/labels.js";
import { prepareLabelOrders } from "../services/labelDocument.js";
import { getUploadExemptFileNames } from "../services/upload-file-exemptions.service.js";
import { shadowCheckServicePrefix } from "../services/shipmentValidation.js";
import { getTrackingPrefix, resolveShipmentType, shouldShowValuePayableAmount } from "../validation/trackingId.js";
import { listCatalogServices } from "../catalog/serviceCatalog.js";
import { logCatalogShadowWarning } from "../catalog/legacyShipmentAliases.js";
import { activeR2StreamsGauge, refreshRuntimeMetrics, r2StreamDuration, r2StreamFailures } from "../metrics.js";
import { logTelemetry } from "../telemetry.js";
import { r2Config as rolloutR2Config } from "../config.js";
import { getUploadFilenameDebug, normalizeUploadFilename } from "../utils/uploadFilename.js";

export const jobsRouter = Router();

const CANONICAL_SHIPMENT_TYPES = new Set(
  listCatalogServices({ includeDeprecated: false })
    .map((entry) => String(entry.service).trim().toUpperCase()),
);

function resolveCanonicalShipmentTypeStrict(value: unknown) {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (!normalized) return null;
  return CANONICAL_SHIPMENT_TYPES.has(normalized) ? normalized : null;
}

function isClosedConnectionError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /connection is closed|can't reach database server|p1001|timed out|timeout|econnreset|connection terminated/i.test(message);
}

async function withReconnectRetry<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (!isClosedConnectionError(error)) {
      throw error;
    }
    await prisma.$connect();
    return operation();
  }
}

function toNum(value: unknown) {
  const parsed = Number(String(value ?? "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function hasCnic(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length === 13;
}

function moneyOrderUnitsForAmount(total: number) {
  const normalized = Math.max(0, Math.floor(total));
  return Math.max(1, Math.ceil(normalized / 20000));
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function ensureJobDeletionSchedulesTable() {
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS job_deletion_schedules (
      job_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      delete_after_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `;
  await prisma.$executeRaw`
    CREATE INDEX IF NOT EXISTS idx_job_deletion_schedules_delete_after ON job_deletion_schedules(delete_after_at)
  `;
}

async function removeStoredFile(relPath: string | null | undefined) {
  if (!relPath) return;
  try {
    const storage = getStorageProvider();
    await storage.deleteArtifact("artifact", resolveStoredPath(relPath));
  } catch {
    // ignore missing files
  }
}

async function deleteJobArtifacts(job: {
  uploadPath?: string | null;
  labelsPdfPath?: string | null;
  moneyOrderPdfPath?: string | null;
}) {
  await Promise.all([
    removeStoredFile(job.uploadPath ?? null),
    removeStoredFile(job.labelsPdfPath ?? null),
    removeStoredFile(job.moneyOrderPdfPath ?? null),
  ]);
}

async function deleteJobById(userId: string, jobId: string) {
  await ensureJobDeletionSchedulesTable();

  const job = await prisma.labelJob.findFirst({
    where: { id: jobId, userId },
    select: {
      id: true,
      status: true,
      uploadPath: true,
      labelsPdfPath: true,
      moneyOrderPdfPath: true,
    },
  });

  if (!job) return false;
  if (job.status === "QUEUED" || job.status === "PROCESSING") {
    throw new Error(`Job ${jobId} is still active and cannot be deleted.`);
  }

  const trackingJob = await prisma.trackingJob.findFirst({
    where: { id: jobId, userId },
    select: { resultPath: true },
  });

  await deleteJobArtifacts(job);
  await removeStoredFile(trackingJob?.resultPath ?? null);

  await prisma.$transaction([
    prisma.trackingJob.deleteMany({ where: { id: jobId, userId } }),
    prisma.labelJob.deleteMany({ where: { id: jobId, userId } }),
  ]);

  await prisma.$executeRaw`DELETE FROM job_deletion_schedules WHERE job_id = ${jobId}`;

  try {
    const queuedJob = await getQueue().getJob(jobId);
    await queuedJob?.remove();
  } catch {
    // ignore queue cleanup failures
  }

  return true;
}

function resolveLabelsRelPath(jobId: string, relPath: string | null | undefined) {
  if (relPath) {
    const preferredAbsPath = resolveStoredPath(relPath);
    if (existsSync(preferredAbsPath)) {
      return toStoredPath(preferredAbsPath);
    }
  }

  const generatedAbsPath = path.join(outputsDir(), `${jobId}-labels.pdf`);
  if (existsSync(generatedAbsPath)) {
    return toStoredPath(generatedAbsPath);
  }

  return relPath;
}

async function waitForResolvedLabelsRelPath(jobId: string, relPath: string | null | undefined, attempts = 20, delayMs = 500) {
  let resolved = resolveLabelsRelPath(jobId, relPath);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (resolved) {
      const absPath = await waitForStoredFile(resolved, 1, delayMs);
      if (absPath) return resolved;
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    resolved = resolveLabelsRelPath(jobId, resolved);
  }
  return resolved;
}

function resolveMoneyOrderRelPath(jobId: string, relPath: string | null | undefined) {
  if (relPath) {
    const preferredAbsPath = resolveStoredPath(relPath);
    if (existsSync(preferredAbsPath)) {
      return toStoredPath(preferredAbsPath);
    }
  }

  const generatedAbsPath = moneyOrdersOutputPath(jobId);
  if (existsSync(generatedAbsPath)) {
    return toStoredPath(generatedAbsPath);
  }

  return relPath;
}

async function waitForResolvedMoneyOrderRelPath(jobId: string, relPath: string | null | undefined, attempts = 20, delayMs = 500) {
  let resolved = resolveMoneyOrderRelPath(jobId, relPath);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (resolved) {
      const absPath = await waitForStoredFile(resolved, 1, delayMs);
      if (absPath) return resolved;
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    resolved = resolveMoneyOrderRelPath(jobId, resolved);
  }
  return resolved;
}

function createSpreadsheetUpload() {
  return multer({
    storage: multer.diskStorage({
      destination: async (_req, _file, cb) => {
        const uploadBaseDir = uploadsDir();
        try {
          await fs.mkdir(uploadBaseDir, { recursive: true });
          cb(null, uploadBaseDir);
        } catch (error) {
          cb(error as Error, uploadBaseDir);
        }
      },
      filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `${randomUUID()}${ext}`);
      },
    }),
    limits: { fileSize: 100 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      if (ext === ".csv" || ext === ".xlsx" || ext === ".xls") return cb(null, true);
      cb(new Error("Only .csv or .xlsx files are supported"));
    },
  });
}

const upload = createSpreadsheetUpload();
const previewUpload = createSpreadsheetUpload();

function parsePrintMode(value: unknown): LabelPrintMode {
  const normalized = String(value ?? "labels").trim().toLowerCase();
  if (normalized === "universal-9x4" || normalized === "universal_9x4" || normalized === "universal9x4") return "universal-9x4";
  if (normalized === "envelope" || normalized === "envelope-9x4") return "envelope";
  if (normalized === "flyer") return "flyer";
  if (normalized === "box" || normalized === "a4-multi" || normalized === "labels") return "labels";
  return "labels";
}

function expectedPrefixesForService(service: string) {
  const normalized = String(service ?? "").trim().toUpperCase();
  const serviceEntry = listCatalogServices({ includeDeprecated: false }).find((entry) => entry.service === normalized);
  if (serviceEntry?.prefix) {
    return [serviceEntry.prefix];
  }
  return [] as string[];
}

export const labelUploadMiddleware = (req: ExpressRequest, res: ExpressResponse, next: ExpressNextFunction) => {
  upload.single("file")(req, res, (err) => {
    if (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      return res.status(400).json({ success: false, error: msg, message: msg });
    }
    return next();
  });
};

export const labelPreviewUploadMiddleware = (req: ExpressRequest, res: ExpressResponse, next: ExpressNextFunction) => {
  previewUpload.single("file")(req, res, (err) => {
    if (err) {
      const msg = err instanceof Error ? err.message : "Preview upload failed";
      return res.status(400).json({ success: false, error: msg, message: msg });
    }
    return next();
  });
};

jobsRouter.get("/preview/labels", requireAuth, (req, res) => {
  const carrierType = String(req.query?.carrierType ?? "pakistan_post").toLowerCase() === "courier" ? "courier" : "pakistan_post";
  const shipmentTypeRaw = String(req.query?.shipmentType ?? "RGL").trim();
  const resolvedShipmentType = resolveShipmentType(shipmentTypeRaw);
  if (shipmentTypeRaw && !resolvedShipmentType) {
    logCatalogShadowWarning("service_mismatch", `Preview requested unsupported shipment type '${shipmentTypeRaw}'.`);
  }
  const shipmentType = carrierType === "courier" ? "COURIER" : (resolvedShipmentType ?? "RGL");
  const includeMoneyOrders = String(req.query?.includeMoneyOrders ?? "false").toLowerCase() === "true";
  const printMode = parsePrintMode(req.query?.outputMode);

  return res.json({
    success: true,
    html: previewLabelHtml({
      carrierType,
      shipmentType,
      includeMoneyOrders,
      outputMode: printMode,
    }),
  });
});

jobsRouter.post("/preview/labels", requireAuth, labelPreviewUploadMiddleware, async (req, res) => {
  const tempPath = req.file?.path;
  const carrierType = String(req.body?.carrierType ?? "pakistan_post").toLowerCase() === "courier" ? "courier" : "pakistan_post";
  const shipmentModeRaw = String(req.body?.shipmentMode ?? "single_service").toLowerCase();
  const shipmentMode = (shipmentModeRaw === "mix_articles" || shipmentModeRaw === "mix_services")
    ? "mix_articles"
    : "single_service";
  const shipmentTypeRaw = String(req.body?.shipmentType ?? "").trim();
  const resolvedShipmentType = resolveShipmentType(shipmentTypeRaw);
  if (shipmentTypeRaw && !resolvedShipmentType) {
    logCatalogShadowWarning("service_mismatch", `Preview upload requested unsupported shipment type '${shipmentTypeRaw}'.`);
  }
  const shipmentType = carrierType === "courier"
    ? "COURIER"
    : shipmentMode === "mix_articles"
      ? null
      : resolvedShipmentType;
  const includeMoneyOrders = String(req.body?.includeMoneyOrders ?? "false").toLowerCase() === "true";
  const barcodeMode = String(req.body?.barcodeMode ?? "auto").toLowerCase() === "manual" ? "manual" : "auto";
  const autoGenerateTracking = barcodeMode === "auto";
  const printMode = parsePrintMode(req.body?.outputMode);

  if (!tempPath) {
    return res.json({
      success: true,
      html: previewLabelHtml({ carrierType, shipmentType: shipmentType ?? "RGL", includeMoneyOrders, outputMode: printMode }),
    });
  }

  try {
    const previewShipmentType: "RGL" | "IRL" | "UMS" | "VPL" | "VPP" | "COD" | "COURIER" =
      shipmentType === "COURIER"
        ? "COURIER"
        : shipmentType === "IRL"
          ? "IRL"
          : shipmentType === "UMS"
            ? "UMS"
            : shipmentType === "VPL"
              ? "VPL"
              : shipmentType === "VPP"
                ? "VPP"
                : shipmentType === "COD"
                  ? "COD"
                  : "RGL";
    const orders = await parseOrdersFromFile(tempPath, { allowMissingTrackingId: true });
    const previewOrders = orders.map((order, index) => {
      const rowShipmentType = resolveShipmentType((order as any).shipmentType ?? (order as any).shipmenttype);
      const effectiveShipmentType = shipmentMode === "mix_articles"
        ? rowShipmentType
        : (shipmentType as string | null);
      const expectedPrefix = effectiveShipmentType && effectiveShipmentType !== "COURIER"
        ? getTrackingPrefix(effectiveShipmentType)
        : "RGL";
      const existingTracking = String((order as any).TrackingID ?? (order as any).trackingId ?? "").trim().toUpperCase();
      const previewTracking = existingTracking || `${expectedPrefix}2605${String(index + 1).padStart(4, "0")}`;
      return {
        ...order,
        TrackingID: previewTracking,
        trackingId: previewTracking,
        __allocatedTrackingId: previewTracking,
      };
    });

    const labelOrders = prepareLabelOrders(previewOrders, {
      autoGenerateTracking,
      barcodeMode,
      shipmentMode,
      trackingScheme: "standard",
      carrierType,
      shipmentType: previewShipmentType,
      outputMode: printMode,
    });

    return res.json({
      success: true,
      html: renderLabelDocumentHtml(labelOrders, {
        autoGenerateTracking,
        includeMoneyOrders,
        outputMode: printMode,
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load preview";
    return res.status(400).json({ success: false, error: message, message });
  } finally {
    if (tempPath) {
      const storage = getStorageProvider();
      await storage.deleteArtifact("artifact", tempPath).catch(() => {});
    }
  }
});

jobsRouter.get("/", requireAuth, async (req, res) => {
  const userId = (req as AuthedRequest).user!.id;
  if (!userId) {
    return res.json({ success: true, jobs: [] });
  }
  try {
    const jobs = await prisma.labelJob.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    return res.json({ success: true, jobs });
  } catch (err) {
    console.log("Database unavailable for jobs, returning empty list:", err instanceof Error ? err.message : err);
    return res.json({ success: true, jobs: [] });
  }
});

jobsRouter.post("/delete", requireAuth, async (req, res) => {
  const userId = (req as AuthedRequest).user!.id;
  if (!userId) {
    return res.status(400).json({ success: false, message: "Missing user context." });
  }
  const jobIds = Array.isArray(req.body?.jobIds)
    ? req.body.jobIds.map((value: unknown) => String(value ?? "").trim()).filter(Boolean)
    : [];
  const deleteAfterDays = Number(req.body?.deleteAfterDays ?? 0);

  if (jobIds.length === 0) {
    return res.status(400).json({ success: false, message: "Select at least one job." });
  }

  const jobs = await prisma.labelJob.findMany({
    where: { userId, id: { in: jobIds } },
    select: { id: true, status: true },
  });
  const activeJobs = jobs.filter((job) => job.status === "QUEUED" || job.status === "PROCESSING");
  if (activeJobs.length > 0) {
    return res.status(409).json({ success: false, message: "Active jobs cannot be deleted." });
  }

  if (deleteAfterDays === 7) {
    await ensureJobDeletionSchedulesTable();
    const deleteAfterAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    for (const jobId of jobIds) {
      await prisma.$executeRaw`
        INSERT INTO job_deletion_schedules (job_id, user_id, delete_after_at)
        VALUES (${jobId}, ${userId}, ${deleteAfterAt})
        ON CONFLICT (job_id) DO UPDATE SET
          user_id = EXCLUDED.user_id,
          delete_after_at = EXCLUDED.delete_after_at
      `;
    }
    return res.json({ success: true, scheduled: jobIds.length, deleteAfterDays: 7 });
  }

  let deleted = 0;
  for (const jobId of jobIds) {
    if (await deleteJobById(userId, jobId)) {
      deleted += 1;
    }
  }

  return res.json({ success: true, deleted });
});

export async function handleLabelUpload(req: ExpressRequest, res: ExpressResponse) {
  await prisma.$connect();
  const userId = (req as AuthedRequest).user!.id;
  if (!userId) {
    return res.status(400).json({ success: false, error: "Missing user context", message: "Missing user context" });
  }
  await ensureStorageDirs();

  const uploadedFile = req.file;
  if (!uploadedFile) return res.status(400).json({ success: false, error: "Missing file", message: "Missing file" });

  // Phase 2: Check for duplicate filename — only block if a COMPLETED job exists with same filename.
  // Failed/Queued/Processing jobs do NOT reserve the filename so re-uploads are always allowed.
  const filenameDebug = getUploadFilenameDebug(uploadedFile.originalname);
  const normalizedFileName = filenameDebug.normalized;
  const exemptFileNames = await getUploadExemptFileNames().catch(() => [] as string[]);
  const isExemptFileName = exemptFileNames.some((entry) => normalizeUploadFilename(entry) === normalizedFileName);
  const existingUserJobs = await prisma.labelJob.findMany({
    where: { userId },
    select: { id: true, status: true, originalFilename: true },
  }).catch(() => []);

  const matchingJobs = existingUserJobs.filter(
    (job) => normalizeUploadFilename(job.originalFilename) === normalizedFileName,
  );

  const duplicateStatusCounts = matchingJobs.reduce<Record<string, number>>((acc, job) => {
    const key = String(job.status ?? "UNKNOWN").toUpperCase();
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const completedDuplicateCount = duplicateStatusCounts.COMPLETED ?? 0;
  const totalDuplicateCount = matchingJobs.length;
  const isDuplicate = completedDuplicateCount > 0;
  const duplicateFilenameBypassUsed = isExemptFileName && totalDuplicateCount > 0;

  console.info("UPLOAD_FILENAME_RAW", JSON.stringify({ value: filenameDebug.raw }));
  console.info("UPLOAD_FILENAME_BASENAME", JSON.stringify({ value: filenameDebug.basename }));
  console.info("UPLOAD_FILENAME_NORMALIZED", JSON.stringify({
    original: filenameDebug.raw,
    basename: filenameDebug.basename,
    normalized: normalizedFileName,
    exempt: isExemptFileName,
  }));
  console.info("UPLOAD_BYPASS_LIST", JSON.stringify({
    count: exemptFileNames.length,
    normalizedExemptFileNames: exemptFileNames.map((entry) => normalizeUploadFilename(entry)),
  }));
  console.info("UPLOAD_DUPLICATE_QUERY_RESULT", JSON.stringify({
    normalized: normalizedFileName,
    totalMatches: totalDuplicateCount,
    completedMatches: completedDuplicateCount,
    statusCounts: duplicateStatusCounts,
    matchedJobIds: matchingJobs.map((job) => job.id),
    matchedOriginalFilenames: matchingJobs.map((job) => job.originalFilename),
  }));

  if (isExemptFileName) {
    console.log(`[Upload] Exempt filename detected — bypassing duplicate block: "${normalizedFileName}"`);
    if (duplicateFilenameBypassUsed) {
      console.info(`[AUDIT] TEST_FILENAME_BYPASS_APPLIED user=${userId} filename=\"${normalizedFileName}\"`);
    }
  }

  if (!isExemptFileName && isDuplicate) {
    console.warn(`[SECONDARY_DUPLICATE_BLOCK] filename="${normalizedFileName}" exempt=${isExemptFileName} bypass=${duplicateFilenameBypassUsed}`);
    console.warn(`[Upload] Filename reserved — blocked re-upload: "${normalizedFileName}"`);
    return res.status(409).json({
      success: false,
      error: "This file name already exists.",
      message: "This file name already exists.",
    });
  }

  console.log(`[Upload] Filename not reserved — proceeding with upload: "${normalizedFileName}"`);

  const ext = path.extname(uploadedFile.originalname).toLowerCase();
  const generateMoneyOrderRequested = String(req.body?.generateMoneyOrder ?? "false").toLowerCase() === "true";
  const autoGenerateTracking = String(req.body?.autoGenerateTracking ?? "false").toLowerCase() === "true";
  const barcodeMode = String(req.body?.barcodeMode ?? "auto").toLowerCase() === "manual" ? "manual" : "auto";
  const printMode = parsePrintMode(req.body?.printMode ?? req.body?.outputMode);
  const trackAfterGenerate = String(req.body?.trackAfterGenerate ?? "false").toLowerCase() === "true";
  const carrierType = String(req.body?.carrierType ?? "pakistan_post").toLowerCase() === "courier" ? "courier" : "pakistan_post";
  const shipmentTypeRaw = String(req.body?.shipmentType ?? "").trim();
  const resolvedShipmentType = resolveCanonicalShipmentTypeStrict(shipmentTypeRaw);
  if (shipmentTypeRaw && !resolvedShipmentType) {
    logCatalogShadowWarning("service_mismatch", `Upload requested unsupported shipment type '${shipmentTypeRaw}'.`);
  }
  const shipmentType = carrierType === "courier" ? "COURIER" : resolvedShipmentType;
  const shipmentModeRaw = String(req.body?.shipmentMode ?? "single_service").toLowerCase();
  const shipmentMode = (shipmentModeRaw === "mix_articles" || shipmentModeRaw === "mix_services")
    ? "mix_articles"
    : "single_service";
  const eligibleForMoneyOrder = carrierType !== "courier" && (shipmentMode === "mix_articles" || shouldShowValuePayableAmount(shipmentType));
  const generateMoneyOrder = generateMoneyOrderRequested && eligibleForMoneyOrder;
  const trackingScheme = (() => {
    const v = String(req.body?.trackingScheme ?? "standard").toLowerCase();
    if (v === "rl") return "rl";
    if (v === "ums") return "ums";
    return "standard";
  })();
  if (autoGenerateTracking && shipmentMode === "single_service") {
    if (!shipmentType || shipmentType === "COURIER") {
      return res.status(400).json({
        success: false,
        error: "Auto tracking generation requires a valid Pakistan Post shipment type.",
        message: "Auto tracking generation requires a valid Pakistan Post shipment type.",
      });
    }
    try {
      getTrackingPrefix(shipmentType);
    } catch {
      return res.status(400).json({
        success: false,
        error: `Unsupported shipment type for auto tracking: ${shipmentType}`,
        message: `Unsupported shipment type for auto tracking: ${shipmentType}`,
      });
    }
  }

  const job = await withReconnectRetry(async () => prisma.labelJob.create({
    data: {
      userId,
      originalFilename: uploadedFile.originalname,
      recordCount: 0,
      unitCount: 0,
      includeMoneyOrders: generateMoneyOrder,
      status: "QUEUED",
      uploadPath: "pending",
    },
  }));

  const uploadBaseDir = uploadsDir();
  await fs.mkdir(uploadBaseDir, { recursive: true });

  const fileName = `${job.id}${ext}`;
  console.log("UPLOAD RECEIVED:", fileName);

  const uploadPath = path.join(uploadBaseDir, fileName);
  await fs.rename(uploadedFile.path, uploadPath);
  console.log("[UPLOAD] Saved file:", uploadPath);

  let ordersCount = 0;
  let unitCount = 0;
  let effectiveGenerateMoneyOrder = generateMoneyOrder;
  const idempotencyKey = String(req.header("x-idempotency-key") ?? job.id).trim();
  let actionRequests: Array<{ actionType: "label" | "tracking" | "money_order"; requestKey: string }> = [];

  try {
    const orders = await parseOrdersFromFile(uploadPath, { allowMissingTrackingId: autoGenerateTracking });
    for (const row of orders) {
      shadowCheckServicePrefix(
        (row as any).shipmentType ?? (row as any).shipmenttype ?? shipmentType,
        (row as any).TrackingID ?? (row as any).trackingId,
      );
    }
    ordersCount = orders.length;
    if (ordersCount === 0) throw new Error("No rows found");
    if (ordersCount > 5000) throw new Error("Max upload size is 5000 records");

    if (shipmentMode === "single_service" && shipmentType && shipmentType !== "COURIER") {
      const rowTypeMismatch = orders.filter((order) => {
        const rawRowType = String((order as any).shipmentType ?? (order as any).shipmenttype ?? "").trim();
        if (!rawRowType) return false;
        const resolvedRowType = resolveCanonicalShipmentTypeStrict(rawRowType);
        return resolvedRowType !== shipmentType;
      });
      if (rowTypeMismatch.length > 0) {
        throw new Error(`Single Service mode requires shipment_type '${shipmentType}' on every row. Found ${rowTypeMismatch.length} row(s) with different shipment_type.`);
      }
    }

    if (shipmentMode === "mix_articles" && shipmentType !== "COURIER") {
      const invalidRows = orders.filter((order) => {
        const rawRowType = String((order as any).shipmentType ?? (order as any).shipmenttype ?? "").trim();
        return !resolveCanonicalShipmentTypeStrict(rawRowType);
      });
      if (invalidRows.length > 0) {
        throw new Error(`Mix Services mode requires canonical shipment_type per row. Found ${invalidRows.length} row(s) with missing or invalid shipment_type.`);
      }
    }

    // Namespace validation for uploaded tracking IDs.
    // Single Service: enforce against selected shipment in manual mode only.
    // Mix Articles: row shipment_type is authoritative whenever tracking is present.
    if (shipmentType !== "COURIER") {
      const mismatchedOrders = orders.filter((order) => {
        const id = String((order as any).TrackingID ?? (order as any).trackingId ?? (order as any).barcode ?? "").trim().toUpperCase();
        if (!id) return false;

        if (shipmentMode === "single_service") {
          if (barcodeMode !== "manual" || !shipmentType) return false;
          const expectedPrefixes = expectedPrefixesForService(shipmentType);
          return expectedPrefixes.length > 0 && !expectedPrefixes.some((prefix) => id.startsWith(prefix));
        }

        const rawRowType = String((order as any).shipmentType ?? (order as any).shipmenttype ?? "").trim();
        const resolvedRowType = resolveCanonicalShipmentTypeStrict(rawRowType);
        if (!resolvedRowType) return true;
        const rowExpectedPrefixes = expectedPrefixesForService(resolvedRowType);
        return rowExpectedPrefixes.length > 0 && !rowExpectedPrefixes.some((prefix) => id.startsWith(prefix));
      });

      if (mismatchedOrders.length > 0) {
        logCatalogShadowWarning("invalid_prefix", `Detected ${mismatchedOrders.length} row(s) with prefix mismatch in ${shipmentMode}.`);
        if (shipmentMode === "single_service") {
          const detectedPrefixes = [
            ...new Set(
              mismatchedOrders.map((o) => {
                const id = String((o as any).TrackingID ?? (o as any).trackingId ?? (o as any).barcode ?? "").trim().toUpperCase();
                return id.match(/^([A-Z]+)/)?.[1] ?? "UNKNOWN";
              }),
            ),
          ].join(", ");
          throw new Error(`Tracking ID prefix mismatch detected for ${shipmentMode}. Detected prefixes: ${detectedPrefixes}.`);
        }
        console.warn(`[Upload] Mix services prefix mismatches detected; continuing with row-level validation in worker. Count=${mismatchedOrders.length}`);
      }
    }

    const month = new Date().toISOString().slice(0, 7);
    const usageBefore = await withReconnectRetry(async () => prisma.usageMonthly.findUnique({ where: { userId_month: { userId, month } } }));
    const unitsBefore = (usageBefore?.labelsGenerated ?? 0) + (usageBefore?.labelsQueued ?? 0);

    actionRequests = [];
    let labelUnits = 0;
    let moneyOrderUnits = 0;
    let trackingUnits = 0;
    for (let i = 0; i < ordersCount; i += 1) {
      actionRequests.push({ actionType: "label", requestKey: `${idempotencyKey}:label:${i}` });
      labelUnits += 1;
    }

    const moneyOrderEligibleRows = orders.filter((order) => {
      const rawRowType = String((order as any)?.shipmentType ?? (order as any)?.shipmenttype ?? shipmentType ?? "").trim();
      const rowType = resolveCanonicalShipmentTypeStrict(rawRowType) ?? rawRowType.toUpperCase();
      return rowType === "VPL" || rowType === "VPP" || rowType === "COD";
    });

    if (effectiveGenerateMoneyOrder) {
      const hasMoneyOrderAmount = moneyOrderEligibleRows.some((order) => toNum((order as any)?.CollectAmount ?? (order as any)?.amount ?? 0) > 0);
      if (!hasMoneyOrderAmount) {
        effectiveGenerateMoneyOrder = false;
      }
    }

    if (effectiveGenerateMoneyOrder) {
      const hasVplShipment = moneyOrderEligibleRows.length > 0;

      if (hasVplShipment) {
        const userProfile = await withReconnectRetry(async () => prisma.user.findUnique({ where: { id: userId }, select: { cnic: true } }));
        const userCnic = userProfile?.cnic;
        if (!hasCnic(userCnic)) {
          throw new Error("CNIC is required before generating money order.");
        }
      }
    }

    if (effectiveGenerateMoneyOrder) {
      let moUnits = 0;
      for (let i = 0; i < moneyOrderEligibleRows.length; i += 1) {
        const amount = toNum((moneyOrderEligibleRows[i] as any)?.CollectAmount ?? (moneyOrderEligibleRows[i] as any)?.amount ?? 0);
        moUnits += moneyOrderUnitsForAmount(amount);
      }
      for (let i = 0; i < moUnits; i += 1) {
        actionRequests.push({ actionType: "money_order", requestKey: `${idempotencyKey}:money_order:${i}` });
        moneyOrderUnits += 1;
      }
    }

    if (trackAfterGenerate) {
      for (let i = 0; i < ordersCount; i += 1) {
        actionRequests.push({ actionType: "tracking", requestKey: `${idempotencyKey}:tracking:${i}` });
        trackingUnits += 1;
      }
    }

    unitCount = actionRequests.length;
    const latestUnits = await getLatestUnitSnapshot(userId);
    if (latestUnits.remainingUnits < unitCount) {
      throw new Error(`Insufficient Units. Latest database balance is ${latestUnits.remainingUnits}, required ${unitCount}.`);
    }

    const consumeResult = await consumeUnits(userId, actionRequests);
    if (!consumeResult.ok) throw new Error((consumeResult as any).reason ?? "Unit consumption failed");

    const usageAfter = await withReconnectRetry(async () => prisma.usageMonthly.findUnique({ where: { userId_month: { userId, month } } }));
    const unitsAfter = (usageAfter?.labelsGenerated ?? 0) + (usageAfter?.labelsQueued ?? 0);
    console.log("Units before:", unitsBefore);
    console.log("Records processed:", orders.length);
    console.log("Units after:", unitsAfter);
    console.log(`Records: ${ordersCount}`);
    console.log(`Labels Generated: ${ordersCount} -> Units Deducted: ${labelUnits}`);
    console.log(`Money Orders: ${moneyOrderUnits} -> Units Deducted: ${moneyOrderUnits}`);
    console.log(`Tracking Uploaded: ${trackAfterGenerate ? ordersCount : 0} -> Units Deducted: ${trackingUnits}`);
  } catch (e) {
    await withReconnectRetry(async () => prisma.labelJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        error: e instanceof Error ? e.message : "Invalid upload",
        uploadPath,
        includeMoneyOrders: effectiveGenerateMoneyOrder,
      },
    }));
    const msg = e instanceof Error ? e.message : "Invalid upload";
    return res.status(400).json({ success: false, error: msg, message: msg });
  }

  try {
    await withReconnectRetry(async () => prisma.labelJob.update({
      where: { id: job.id },
      data: { uploadPath, recordCount: ordersCount, unitCount, includeMoneyOrders: effectiveGenerateMoneyOrder, status: "QUEUED" },
    }));

    // Try to enqueue job with timeout. If this fails, mark FAILED immediately so
    // jobs do not remain stuck in QUEUED forever.

    try {
      const queue = getQueue();
      if (!queue) {
        throw new Error("Queue unavailable");
      }
      // Dual-mode: Send both filePath (fast path, used when worker shares filesystem with API)
      // and fileBuffer (fallback, used when worker runs in an isolated container/runtime).
      // Worker prefers filePath; falls back to fileBuffer on ENOENT (cross-container isolation).
      const fileBuffer = await fs.readFile(uploadPath);
      await withTimeout(ensureRedisConnection(), 3000, "Redis connection timed out");
      await withTimeout(queue.add(
        "job",
        {
          jobId: job.id,
          filePath: uploadPath,
          fileBuffer,
          fileName: uploadedFile.originalname,
          generateLabels: true,
          generateMoneyOrder: effectiveGenerateMoneyOrder,
          autoGenerateTracking,
          barcodeMode,
          printMode,
          trackingScheme,
          shipmentMode,
          trackAfterGenerate,
          carrierType,
          shipmentType,
        },
        { jobId: job.id },
      ), 3000, "Queue enqueue timed out");
      console.log("Job added (filePath+fileBuffer dual-mode):", job.id);
    } catch (queueErr) {
      const queueMessage = queueErr instanceof Error ? queueErr.message : "Queue enqueue failed";
      console.error(`[Upload] Queue enqueue failed for job ${job.id}: ${queueMessage}`);
      await withReconnectRetry(async () =>
        prisma.labelJob.update({
          where: { id: job.id },
          data: { status: "FAILED", error: `Queue unavailable: ${queueMessage}` },
        }),
      );
      await refundUnits(userId, actionRequests);
      return res.status(503).json({
        success: false,
        error: "Queue unavailable",
        message: "Queue unavailable. Please retry after Redis/worker is healthy.",
        jobId: job.id,
      });
    }

    // Return success only when enqueue succeeded.
    return res.json({
      success: true,
      message: "File uploaded successfully",
      jobId: job.id,
      recordCount: ordersCount,
      duplicateFilenameBypassUsed,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to upload file";
    await withReconnectRetry(async () => prisma.labelJob.update({
      where: { id: job.id },
      data: { status: "FAILED", error: msg },
    }));
    await refundUnits(userId, actionRequests);
    return res.status(500).json({ success: false, error: msg, message: msg });
  }
}

jobsRouter.post("/upload", requireAuth, labelUploadMiddleware, handleLabelUpload);

// Phase 3: Check for duplicate tracking IDs
jobsRouter.post("/check-tracking-duplicate", requireAuth, async (req, res) => {
  const userId = (req as AuthedRequest).user!.id;
  const trackingId = String(req.body?.trackingId ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");

  if (!trackingId) {
    return res.status(400).json({ success: false, error: "Missing trackingId" });
  }

  try {
    const existing = await prisma.shipment.findFirst({
      where: { userId, trackingNumber: trackingId },
      select: { trackingNumber: true, createdAt: true }
    });

    if (existing) {
      return res.json({ success: true, isDuplicate: true, existingTrackingId: trackingId });
    }
    return res.json({ success: true, isDuplicate: false });
  } catch (error) {
    return res.status(500).json({ success: false, error: "Failed to check tracking ID" });
  }
});

jobsRouter.get("/:jobId", requireAuth, async (req, res) => {
  const userId = (req as AuthedRequest).user!.id;
  const job = await prisma.labelJob.findFirst({ where: { id: req.params.jobId, userId } });
  if (!job) return res.status(404).json({ success: false, message: "Not found" });
  return res.json({ success: true, job });
});

jobsRouter.get("/:jobId/download/labels", requireAuth, async (req, res) => {
  const userId = (req as AuthedRequest).user!.id;
  const jobId = req.params.jobId;
  const owned = await prisma.labelJob.findFirst({ where: { id: jobId, userId } });
  if (!owned) return res.status(404).json({ success: false, message: "Not found" });
  if (owned.status !== "COMPLETED") return res.status(409).json({ success: false, message: "Not ready" });

  // Prefer BullMQ return value, fall back to DB path
  let relPath: string | null | undefined = owned.labelsPdfPath;
  try {
    const bullJob = await getQueue().getJob(jobId);
    if (bullJob?.finishedOn) {
      const result = (await bullJob.returnvalue) as { labelsPath?: string } | null;
      if (result?.labelsPath) relPath = result.labelsPath;
    }
  } catch {
    // Redis unavailable — use DB path
  }

  relPath = await waitForResolvedLabelsRelPath(jobId, relPath);
  if (!relPath) {
    return res.status(404).json({ success: false, message: "Labels file not found" });
  }

  // Dual-read aware: Try local first, fallback to R2 if enabled
  const fileResult = await waitForStoredFileWithFallback(relPath, 8, 500, {
    jobId,
    artifactType: "labelsPdf",
  });
  if (!fileResult) {
    const fallbackPath = resolveStoredPath(relPath);
    if (existsSync(fallbackPath)) {
      const stats = fsSync.statSync(fallbackPath);
      if (stats.isFile() && stats.size <= 0) {
        return res.status(422).json({ success: false, message: "Labels file is empty" });
      }
    }
    return res.status(404).json({ success: false, message: "File not found on disk" });
  }

  // Update DB path if it changed
  if (owned.labelsPdfPath !== relPath) {
    await prisma.labelJob.update({ where: { id: jobId }, data: { labelsPdfPath: relPath } }).catch(() => {});
  }

  const fileName = buildLabelPdfFileName();
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", buildPdfAttachmentHeader(fileName));

  // Serve based on provider
  if (fileResult.provider === 'local') {
    // LOCAL: Use fast path with fs validation
    const resolvedAbsPath = path.resolve(fileResult.path);
    console.log("[Download] Serving from local:", resolvedAbsPath);
    const labelsStats = fsSync.statSync(resolvedAbsPath);
    if (!labelsStats.isFile() || labelsStats.size <= 0) {
      return res.status(422).json({ success: false, message: "Labels file is empty" });
    }
    const allowedRoot = outputsDir();
    const relToRoot = path.relative(allowedRoot, resolvedAbsPath);
    if (relToRoot.startsWith("..") || path.isAbsolute(relToRoot)) {
      return res.status(400).json({ success: false, message: "Invalid file path" });
    }
    return res.download(resolvedAbsPath, fileName);
  } else if (fileResult.provider === 'r2') {
    // R2 FALLBACK: Stream from R2 with timeout protection, telemetry, and concurrency bounds
    // Note: readArtifactStream internally uses semaphore and timeout, this wrapper adds telemetry
    let streamStartTime = Date.now();
    let streamAborted = false;
    
    try {
      console.log("[Download] Serving from R2 fallback (streaming):", fileResult.path);
      
      // Set response headers for download
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      
      // Track stream lifecycle for abort detection
      const onStreamClose = () => { streamAborted = true; };
      res.on('close', onStreamClose);
      let streamGaugeIncremented = false;
      
      try {
        // readArtifactStream internally uses semaphore and timeout; it handles pipeline to res
        const r2Provider = getDualProviders().r2 as StorageProvider & {
          readArtifactStream: (
            type: string,
            key: string,
            outputStream: NodeJS.WritableStream,
            options?: { keyVersion?: "legacy" | "normalized"; jobId?: string; artifactType?: "labelsPdf" | "moneyOrderPdf" | "trackingResult" }
          ) => Promise<void>;
        };
        if (typeof r2Provider.readArtifactStream !== "function") {
          throw new Error("R2StreamProvider.readArtifactStream not available");
        }

        activeR2StreamsGauge.inc();
        streamGaugeIncremented = true;
        refreshRuntimeMetrics();
        logTelemetry({
          event: "stream_start",
          artifactType: "labelsPdf",
          provider: "r2",
          jobId,
          activeStreams: activeR2StreamsGauge.get(),
          maxConcurrentStreams: rolloutR2Config.MAX_CONCURRENT_STREAMS,
        });

        await r2Provider.readArtifactStream("pdf", fileResult.path, res, {
          jobId,
          artifactType: "labelsPdf",
        });
        
        // Stream completed successfully
        const streamDuration = Date.now() - streamStartTime;
        r2StreamDuration.observe(streamDuration);
        
        logTelemetry({
          event: "stream_success",
          artifactType: "labelsPdf",
          provider: "r2",
          durationMs: streamDuration,
          jobId: jobId,
        });
      } catch (streamErr) {
        const streamDuration = Date.now() - streamStartTime;
        const errorMsg = streamErr instanceof Error ? streamErr.message : String(streamErr);
        
        // Distinguish timeout vs other errors
        if (errorMsg.includes("Operation timed out") || errorMsg.includes("timeout")) {
          logTelemetry({
            event: "stream_timeout",
            artifactType: "labelsPdf",
            provider: "r2",
            durationMs: streamDuration,
            jobId: jobId,
          });
        } else if (streamAborted) {
          logTelemetry({
            event: "stream_abort",
            artifactType: "labelsPdf",
            provider: "r2",
            durationMs: streamDuration,
            jobId: jobId,
            reason: "client closed or connection error",
          });
        } else {
          r2StreamFailures.inc();
          logTelemetry({
            event: "stream_failure",
            artifactType: "labelsPdf",
            provider: "r2",
            durationMs: streamDuration,
            error: errorMsg,
            jobId: jobId,
          });
        }
        
        // Only send error response if headers not yet sent
        if (!res.headersSent) {
          return res.status(502).json({ success: false, message: "Download stream failed" });
        }
      } finally {
        res.removeListener('close', onStreamClose);
        if (streamGaugeIncremented) {
          const activeBeforeCleanup = activeR2StreamsGauge.get();
          if (activeBeforeCleanup > 0) {
            activeR2StreamsGauge.dec();
          } else {
            activeR2StreamsGauge.set(0);
          }
          refreshRuntimeMetrics();
          logTelemetry({
            event: "stream_cleanup",
            artifactType: "labelsPdf",
            provider: "r2",
            jobId,
            activeStreamsBeforeCleanup: activeBeforeCleanup,
            activeStreams: activeR2StreamsGauge.get(),
            maxConcurrentStreams: rolloutR2Config.MAX_CONCURRENT_STREAMS,
            aborted: streamAborted,
          });
        }
      }
    } catch (err) {
      console.error("[Download] R2 fallback outer error:", err);
      
      const streamDuration = Date.now() - streamStartTime;
      const errorMsg = err instanceof Error ? err.message : String(err);
      
      if (errorMsg.includes("timeout")) {
        logTelemetry({
          event: "stream_timeout",
          artifactType: "labelsPdf",
          provider: "r2",
          durationMs: streamDuration,
          jobId: jobId,
        });
      } else {
        r2StreamFailures.inc();
        logTelemetry({
          event: "stream_failure",
          artifactType: "labelsPdf",
          provider: "r2",
          durationMs: streamDuration,
          error: errorMsg,
          jobId: jobId,
        });
      }
      
      if (!res.headersSent) {
        return res.status(502).json({ success: false, message: "Download unavailable" });
      }
    }
  } else {
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

async function handleMoneyOrdersDownload(req: ExpressRequest, res: ExpressResponse) {
  const userId = (req as AuthedRequest).user!.id;
  const jobId = req.params.jobId;
  const owned = await prisma.labelJob.findFirst({ where: { id: jobId, userId } });
  if (!owned) return res.status(404).json({ success: false, message: "Not found" });
  if (owned.status !== "COMPLETED") return res.status(409).json({ success: false, message: "Not ready" });

  let relPath: string | null | undefined = owned.moneyOrderPdfPath;
  try {
    const bullJob = await getQueue().getJob(jobId);
    if (bullJob?.finishedOn) {
      const result = (await bullJob.returnvalue) as { moneyOrderPath?: string } | null;
      if (result?.moneyOrderPath) relPath = result.moneyOrderPath;
    }
  } catch {
    // Redis unavailable — use DB path
  }

  relPath = await waitForResolvedMoneyOrderRelPath(jobId, relPath);
  if (!relPath) {
    return res.status(404).json({ success: false, message: "Money order file was not generated" });
  }

  const fileResult = await waitForStoredFileWithFallback(relPath, 8, 500, {
    jobId,
    artifactType: "moneyOrderPdf",
  });
  if (!fileResult) {
    const fallbackPath = resolveStoredPath(relPath);
    if (existsSync(fallbackPath)) {
      const stats = fsSync.statSync(fallbackPath);
      if (stats.isFile() && stats.size <= 0) {
        return res.status(422).json({ success: false, message: "Money order file is empty" });
      }
    }
    return res.status(404).json({ success: false, message: "Money order file was not generated" });
  }

  if (owned.moneyOrderPdfPath !== relPath) {
    await prisma.labelJob.update({ where: { id: jobId }, data: { moneyOrderPdfPath: relPath } }).catch(() => {});
  }

  const fileName = buildMoneyOrderPdfFileName();
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", buildPdfAttachmentHeader(fileName));

  if (fileResult.provider === "local") {
    const resolvedAbsPath = path.resolve(fileResult.path);
    console.log("DOWNLOAD PATH:", resolvedAbsPath);
    const moneyOrderStats = fsSync.statSync(resolvedAbsPath);
    if (!moneyOrderStats.isFile() || moneyOrderStats.size <= 0) {
      return res.status(422).json({ success: false, message: "Money order file is empty" });
    }

    const allowedRoot = outputsDir();
    const relToRoot = path.relative(allowedRoot, resolvedAbsPath);
    if (relToRoot.startsWith("..") || path.isAbsolute(relToRoot)) {
      return res.status(400).json({ success: false, message: "Invalid file path" });
    }

    return res.download(resolvedAbsPath, fileName);
  }

  const r2Provider = getDualProviders().r2 as StorageProvider & {
    readArtifactStream?: (
      type: string,
      key: string,
      outputStream: NodeJS.WritableStream,
      options?: { keyVersion?: "legacy" | "normalized"; jobId?: string; artifactType?: "labelsPdf" | "moneyOrderPdf" | "trackingResult" }
    ) => Promise<void>;
  };

  if (typeof r2Provider.readArtifactStream !== "function") {
    return res.status(502).json({ success: false, message: "Download unavailable" });
  }

  let streamStartTime = Date.now();
  let streamAborted = false;
  
  try {
    console.log("[Download] Serving money order from R2 fallback (streaming):", fileResult.path);
    
    // Track stream lifecycle for abort detection
    const onStreamClose = () => { streamAborted = true; };
    res.on('close', onStreamClose);
    let streamGaugeIncremented = false;
    
    try {
      // readArtifactStream internally uses semaphore and timeout; it handles pipeline to res
      activeR2StreamsGauge.inc();
      streamGaugeIncremented = true;
      refreshRuntimeMetrics();
      logTelemetry({
        event: "stream_start",
        artifactType: "moneyOrderPdf",
        provider: "r2",
        jobId,
        activeStreams: activeR2StreamsGauge.get(),
        maxConcurrentStreams: rolloutR2Config.MAX_CONCURRENT_STREAMS,
      });

      await r2Provider.readArtifactStream("pdf", fileResult.path, res, {
        jobId,
        artifactType: "moneyOrderPdf",
      });
      
      // Stream completed successfully
      const streamDuration = Date.now() - streamStartTime;
      r2StreamDuration.observe(streamDuration);
      
      logTelemetry({
        event: "stream_success",
        artifactType: "moneyOrderPdf",
        provider: "r2",
        durationMs: streamDuration,
        jobId: jobId,
      });
    } catch (streamErr) {
      const streamDuration = Date.now() - streamStartTime;
      const errorMsg = streamErr instanceof Error ? streamErr.message : String(streamErr);
      
      // Distinguish timeout vs other errors
      if (errorMsg.includes("Operation timed out") || errorMsg.includes("timeout")) {
        logTelemetry({
          event: "stream_timeout",
          artifactType: "moneyOrderPdf",
          provider: "r2",
          durationMs: streamDuration,
          jobId: jobId,
        });
      } else if (streamAborted) {
        logTelemetry({
          event: "stream_abort",
          artifactType: "moneyOrderPdf",
          provider: "r2",
          durationMs: streamDuration,
          jobId: jobId,
          reason: "client closed or connection error",
        });
      } else {
        r2StreamFailures.inc();
        logTelemetry({
          event: "stream_failure",
          artifactType: "moneyOrderPdf",
          provider: "r2",
          durationMs: streamDuration,
          error: errorMsg,
          jobId: jobId,
        });
      }
      
      // Only send error response if headers not yet sent
      if (!res.headersSent) {
        return res.status(502).json({ success: false, message: "Download stream failed" });
      }
    } finally {
      res.removeListener('close', onStreamClose);
      if (streamGaugeIncremented) {
        const activeBeforeCleanup = activeR2StreamsGauge.get();
        if (activeBeforeCleanup > 0) {
          activeR2StreamsGauge.dec();
        } else {
          activeR2StreamsGauge.set(0);
        }
        refreshRuntimeMetrics();
        logTelemetry({
          event: "stream_cleanup",
          artifactType: "moneyOrderPdf",
          provider: "r2",
          jobId,
          activeStreamsBeforeCleanup: activeBeforeCleanup,
          activeStreams: activeR2StreamsGauge.get(),
          maxConcurrentStreams: rolloutR2Config.MAX_CONCURRENT_STREAMS,
          aborted: streamAborted,
        });
      }
    }
  } catch (err) {
    console.error("[Download] Money order R2 fallback outer error:", err);
    
    const streamDuration = Date.now() - streamStartTime;
    const errorMsg = err instanceof Error ? err.message : String(err);
    
    if (errorMsg.includes("timeout")) {
      logTelemetry({
        event: "stream_timeout",
        artifactType: "moneyOrderPdf",
        provider: "r2",
        durationMs: streamDuration,
        jobId: jobId,
      });
    } else {
      r2StreamFailures.inc();
      logTelemetry({
        event: "stream_failure",
        artifactType: "moneyOrderPdf",
        provider: "r2",
        durationMs: streamDuration,
        error: errorMsg,
        jobId: jobId,
      });
    }
    
    if (!res.headersSent) {
      return res.status(502).json({ success: false, message: "Download unavailable" });
    }
  }
}

jobsRouter.get("/:jobId/download/money-orders", requireAuth, handleMoneyOrdersDownload);
jobsRouter.get("/:jobId/download/money-order", requireAuth, handleMoneyOrdersDownload);
