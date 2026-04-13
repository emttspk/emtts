import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { existsSync } from "node:fs";
import multer from "multer";
import path from "node:path";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { prisma } from "../prisma.js";
import { requireAuth } from "../middleware/auth.js";
import type { AuthedRequest } from "../middleware/auth.js";
import { ensureStorageDirs, moneyOrdersOutputPath, outputsDir, resolveStoredPath, toStoredPath, uploadsDir, waitForStoredFile } from "../storage/paths.js";
import { parseOrdersFromFile } from "../parse/orders.js";
import { labelQueue } from "../queue/queue.js";
import { consumeUnits, refundUnits } from "../usage/unitConsumption.js";
import { previewLabelHtml, renderLabelDocumentHtml, type LabelPrintMode } from "../templates/labels.js";
import { prepareLabelOrders } from "../services/labelDocument.js";
import { shouldShowValuePayableAmount } from "../validation/trackingId.js";

export const jobsRouter = Router();

function toNum(value: unknown) {
  const parsed = Number(String(value ?? "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function moneyOrderUnitsForAmount(total: number) {
  const normalized = Math.max(0, Math.floor(total));
  return Math.max(1, Math.ceil(normalized / 20000));
}

async function ensureJobDeletionSchedulesTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS job_deletion_schedules (
      job_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      delete_after_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(
    "CREATE INDEX IF NOT EXISTS idx_job_deletion_schedules_delete_after ON job_deletion_schedules(delete_after_at)",
  );
}

async function removeStoredFile(relPath: string | null | undefined) {
  if (!relPath) return;
  try {
    await fs.unlink(resolveStoredPath(relPath));
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

  await prisma.$executeRawUnsafe("DELETE FROM job_deletion_schedules WHERE job_id = ?", jobId);

  try {
    const queuedJob = await labelQueue.getJob(jobId);
    await queuedJob?.remove();
  } catch {
    // ignore queue cleanup failures
  }

  return true;
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

async function waitForResolvedMoneyOrderRelPath(jobId: string, relPath: string | null | undefined, attempts = 6, delayMs = 250) {
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
      destination: (_req, _file, cb) => cb(null, uploadsDir()),
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
  if (normalized === "envelope" || normalized === "envelope-9x4") return "envelope";
  if (normalized === "flyer") return "flyer";
  return "labels";
}

export const labelUploadMiddleware = (req: Request, res: Response, next: NextFunction) => {
  upload.single("file")(req, res, (err) => {
    if (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      return res.status(400).json({ success: false, error: msg, message: msg });
    }
    return next();
  });
};

export const labelPreviewUploadMiddleware = (req: Request, res: Response, next: NextFunction) => {
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
  const shipmentType = String(req.query?.shipmentType ?? "VPL").trim().toUpperCase() || "VPL";
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
  const shipmentTypeRaw = String(req.body?.shipmentType ?? "").trim().toUpperCase();
  const shipmentType =
    shipmentTypeRaw === "RL" || shipmentTypeRaw === "UMS" || shipmentTypeRaw === "VPL" || shipmentTypeRaw === "VPP" || shipmentTypeRaw === "PAR" || shipmentTypeRaw === "COD" || shipmentTypeRaw === "COURIER"
      ? shipmentTypeRaw
      : null;
  const includeMoneyOrders = String(req.body?.includeMoneyOrders ?? "false").toLowerCase() === "true";
  const barcodeMode = String(req.body?.barcodeMode ?? "auto").toLowerCase() === "manual" ? "manual" : "auto";
  const autoGenerateTracking = barcodeMode === "auto";
  const printMode = parsePrintMode(req.body?.outputMode);

  if (!tempPath) {
    return res.json({
      success: true,
      html: previewLabelHtml({ carrierType, shipmentType: shipmentType ?? "VPL", includeMoneyOrders, outputMode: printMode }),
    });
  }

  try {
    const orders = await parseOrdersFromFile(tempPath, { allowMissingTrackingId: autoGenerateTracking });
    const labelOrders = prepareLabelOrders(orders, {
      autoGenerateTracking,
      barcodeMode,
      trackingScheme: "standard",
      carrierType,
      shipmentType,
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
      await fs.unlink(tempPath).catch(() => {});
    }
  }
});

jobsRouter.get("/", requireAuth, async (req, res) => {
  const userId = (req as AuthedRequest).user!.id;
  const jobs = await prisma.labelJob.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  return res.json({ success: true, jobs });
});

jobsRouter.post("/delete", requireAuth, async (req, res) => {
  const userId = (req as AuthedRequest).user!.id;
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
      await prisma.$executeRawUnsafe(
        `INSERT OR REPLACE INTO job_deletion_schedules (job_id, user_id, delete_after_at) VALUES (?, ?, ?)`,
        jobId,
        userId,
        deleteAfterAt,
      );
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

export async function handleLabelUpload(req: Request, res: Response) {
  const userId = (req as AuthedRequest).user!.id;
  await ensureStorageDirs();

  if (!req.file) return res.status(400).json({ success: false, error: "Missing file", message: "Missing file" });

  const ext = path.extname(req.file.originalname).toLowerCase();
  const generateMoneyOrderRequested = String(req.body?.generateMoneyOrder ?? "false").toLowerCase() === "true";
  const autoGenerateTracking = String(req.body?.autoGenerateTracking ?? "false").toLowerCase() === "true";
  const barcodeMode = String(req.body?.barcodeMode ?? "auto").toLowerCase() === "manual" ? "manual" : "auto";
  const printMode = parsePrintMode(req.body?.printMode ?? req.body?.outputMode);
  const trackAfterGenerate = String(req.body?.trackAfterGenerate ?? "false").toLowerCase() === "true";
  const carrierType = String(req.body?.carrierType ?? "pakistan_post").toLowerCase() === "courier" ? "courier" : "pakistan_post";
  const shipmentTypeRaw = String(req.body?.shipmentType ?? "").trim().toUpperCase();
  const shipmentType =
    shipmentTypeRaw === "RL" || shipmentTypeRaw === "UMS" || shipmentTypeRaw === "VPL" || shipmentTypeRaw === "VPP" || shipmentTypeRaw === "PAR" || shipmentTypeRaw === "COD" || shipmentTypeRaw === "COURIER"
      ? shipmentTypeRaw
      : null;
  const eligibleForMoneyOrder = carrierType !== "courier" && shouldShowValuePayableAmount(shipmentType);
  const generateMoneyOrder = generateMoneyOrderRequested && eligibleForMoneyOrder;
  const trackingScheme = (() => {
    const v = String(req.body?.trackingScheme ?? "standard").toLowerCase();
    if (v === "rl") return "rl";
    if (v === "ums") return "ums";
    return "standard";
  })();

  const job = await prisma.labelJob.create({
    data: {
      userId,
      originalFilename: req.file.originalname,
      recordCount: 0,
      unitCount: 0,
      includeMoneyOrders: generateMoneyOrder,
      status: "QUEUED",
      uploadPath: "pending",
    },
  });

  const uploadPath = path.join(uploadsDir(), `${job.id}${ext}`);
  await fs.rename(req.file.path, uploadPath);

  let ordersCount = 0;
  let unitCount = 0;
  let effectiveGenerateMoneyOrder = generateMoneyOrder;
  const idempotencyKey = String(req.header("x-idempotency-key") ?? job.id).trim();
  let actionRequests: Array<{ actionType: "label" | "tracking" | "money_order"; requestKey: string }> = [];

  try {
    const orders = await parseOrdersFromFile(uploadPath, { allowMissingTrackingId: autoGenerateTracking });
    ordersCount = orders.length;
    if (ordersCount === 0) throw new Error("No rows found");
    if (ordersCount > 5000) throw new Error("Max upload size is 5000 records");

    const month = new Date().toISOString().slice(0, 7);
    const usageBefore = await prisma.usageMonthly.findUnique({ where: { userId_month: { userId, month } } });
    const unitsBefore = (usageBefore?.labelsGenerated ?? 0) + (usageBefore?.labelsQueued ?? 0);

    actionRequests = [];
    let labelUnits = 0;
    let moneyOrderUnits = 0;
    let trackingUnits = 0;
    for (let i = 0; i < ordersCount; i += 1) {
      actionRequests.push({ actionType: "label", requestKey: `${idempotencyKey}:label:${i}` });
      labelUnits += 1;
    }

    if (effectiveGenerateMoneyOrder) {
      const hasMoneyOrderAmount = orders.some((order) => toNum((order as any)?.CollectAmount ?? (order as any)?.amount ?? 0) > 0);
      if (!hasMoneyOrderAmount) {
        effectiveGenerateMoneyOrder = false;
      }
    }

    if (effectiveGenerateMoneyOrder) {
      let moUnits = 0;
      for (let i = 0; i < orders.length; i += 1) {
        const amount = toNum((orders[i] as any)?.CollectAmount ?? (orders[i] as any)?.amount ?? 0);
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
    const consumeResult = await consumeUnits(userId, actionRequests);
    if (!consumeResult.ok) throw new Error(consumeResult.reason);

    const usageAfter = await prisma.usageMonthly.findUnique({ where: { userId_month: { userId, month } } });
    const unitsAfter = (usageAfter?.labelsGenerated ?? 0) + (usageAfter?.labelsQueued ?? 0);
    console.log("Units before:", unitsBefore);
    console.log("Records processed:", orders.length);
    console.log("Units after:", unitsAfter);
    console.log(`Records: ${ordersCount}`);
    console.log(`Labels Generated: ${ordersCount} -> Units Deducted: ${labelUnits}`);
    console.log(`Money Orders: ${moneyOrderUnits} -> Units Deducted: ${moneyOrderUnits}`);
    console.log(`Tracking Uploaded: ${trackAfterGenerate ? ordersCount : 0} -> Units Deducted: ${trackingUnits}`);
  } catch (e) {
    await prisma.labelJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        error: e instanceof Error ? e.message : "Invalid upload",
        uploadPath,
        includeMoneyOrders: effectiveGenerateMoneyOrder,
      },
    });
    const msg = e instanceof Error ? e.message : "Invalid upload";
    return res.status(400).json({ success: false, error: msg, message: msg });
  }

  try {
    await prisma.labelJob.update({
      where: { id: job.id },
      data: { uploadPath, recordCount: ordersCount, unitCount, includeMoneyOrders: effectiveGenerateMoneyOrder, status: "QUEUED" },
    });
    await labelQueue.add(
      "generate-pdf",
      {
        jobId: job.id,
        generateLabels: true,
        generateMoneyOrder: effectiveGenerateMoneyOrder,
        autoGenerateTracking,
        barcodeMode,
        printMode,
        trackingScheme,
        trackAfterGenerate,
        carrierType,
        shipmentType,
      },
      { jobId: job.id },
    );
    return res.json({ success: true, message: "File uploaded successfully", jobId: job.id, recordCount: ordersCount });
  } catch (e) {
    await prisma.labelJob.update({
      where: { id: job.id },
      data: { status: "FAILED", error: "Failed to enqueue job" },
    });
    await refundUnits(userId, actionRequests);
    const msg = e instanceof Error ? e.message : "Failed to enqueue job";
    return res.status(500).json({ success: false, error: msg, message: msg });
  }
}

jobsRouter.post("/upload", requireAuth, labelUploadMiddleware, handleLabelUpload);

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
    const bullJob = await labelQueue.getJob(jobId);
    if (bullJob?.finishedOn) {
      const result = (await bullJob.returnvalue) as { labelsPath?: string } | null;
      if (result?.labelsPath) relPath = result.labelsPath;
    }
  } catch {
    // Redis unavailable — use DB path
  }

  if (!relPath) return res.status(404).json({ success: false, message: "Labels file not found" });

  const absPath = resolveStoredPath(relPath);
  const allowedRoot = outputsDir();
  const relToRoot = path.relative(allowedRoot, absPath);
  if (relToRoot.startsWith("..") || path.isAbsolute(relToRoot)) {
    return res.status(400).json({ success: false, message: "Invalid file path" });
  }
  try {
    await fs.access(absPath);
  } catch {
    return res.status(404).json({ success: false, message: "File not found on disk" });
  }

  return res.download(absPath, `labels-${jobId}.pdf`);
});

jobsRouter.get("/:jobId/download/money-orders", requireAuth, async (req, res) => {
  const userId = (req as AuthedRequest).user!.id;
  const jobId = req.params.jobId;
  const owned = await prisma.labelJob.findFirst({ where: { id: jobId, userId } });
  if (!owned) return res.status(404).json({ success: false, message: "Not found" });
  if (!owned.includeMoneyOrders) return res.status(404).json({ success: false, message: "Money orders not enabled for this job" });
  if (owned.status !== "COMPLETED") {
    return res.status(409).json({ success: false, status: "processing", message: "Money order is processing" });
  }

  // Prefer BullMQ return value, fall back to DB path
  let relPath: string | null | undefined = owned.moneyOrderPdfPath;
  try {
    const bullJob = await labelQueue.getJob(jobId);
    if (bullJob?.finishedOn) {
      const result = (await bullJob.returnvalue) as { moneyOrderPath?: string } | null;
      if (result?.moneyOrderPath) relPath = result.moneyOrderPath;
    }
  } catch {
    // Redis unavailable — use DB path
  }

  relPath = await waitForResolvedMoneyOrderRelPath(jobId, relPath);
  if (!relPath) {
    // Job is COMPLETED but no money order file was produced — generation failed silently.
    return res.status(404).json({ success: false, message: "Money order file was not generated" });
  }

  const absPath = await waitForStoredFile(relPath);
  if (!absPath) {
    return res.status(404).json({ success: false, message: "Money order file was not generated" });
  }

  const allowedRoot = outputsDir();
  const relToRoot = path.relative(allowedRoot, absPath);
  if (relToRoot.startsWith("..") || path.isAbsolute(relToRoot)) {
    return res.status(400).json({ success: false, message: "Invalid file path" });
  }

  if (owned.moneyOrderPdfPath !== relPath) {
    await prisma.labelJob.update({ where: { id: jobId }, data: { moneyOrderPdfPath: relPath } }).catch(() => {});
  }

  return res.download(absPath, `money-orders-${jobId}.pdf`);
});
