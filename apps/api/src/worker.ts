import { UnrecoverableError, Worker } from "bullmq";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { createCanvas } from "canvas";
import JsBarcode from "jsbarcode";
import type { Browser } from "puppeteer";
import path from "node:path";
import { Prisma } from "@prisma/client";
import { env } from "./config.js";
import { prisma } from "./lib/prisma.js";
import { connection } from "./lib/redis.js";
import { labelQueue, labelQueueName, trackingQueue, trackingQueueName } from "./queue/queue.js";
import { ensureRedisConnection } from "./queue/redis.js";
import { ensureStorageDirs, moneyOrdersOutputPath, outputsDir, toStoredPath, waitForStoredFile } from "./storage/paths.js";
import { parseOrdersFromFile } from "./parse/orders.js";
import { moneyOrderHtml, renderLabelDocumentHtml, type LabelOrder } from "./templates/labels.js";
import { htmlToPdfBuffer, launchPuppeteerBrowser } from "./pdf/render.js";
import { finalizeQueuedToGenerated, finalizeQueuedTrackingToGenerated, releaseQueuedLabels, releaseQueuedTracking } from "./usage/limits.js";
import { loadMoneyOrderBackgrounds } from "./money-order/backgrounds.js";
import { prepareLabelOrders } from "./services/labelDocument.js";
import {
  buildMoneyOrderNumber,
  moneyOrderBreakdown,
  normalizeTrackingId,
  parseIdentifierSequence,
  shouldApplyPakistanPostValuePayableRules,
  shouldShowValuePayableAmount,
  validateMoneyOrderNumber,
} from "./validation/trackingId.js";
import {
  pythonHealthCheck,
  pythonSubmitComplaint,
  pythonTrackBulk,
  pythonTrackOne,
  PythonServiceTimeoutError,
  PythonServiceUnavailableError,
} from "./services/trackingService.js";
import { processTracking } from "./services/trackingStatus.js";
import { persistTrackingIntelligence, refreshTrackingIntelligenceAggregates } from "./services/trackingIntelligence.js";

const require = createRequire(import.meta.url);

function sanitizeRedisUrl(input: string | undefined | null) {
  const value = String(input ?? "").trim();
  if (!value) return "(not set)";
  return value.replace(/:[^:@]*@/, ":****@");
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

const TIMEOUT = 60_000;

async function safeJob<T>(processJob: () => Promise<T>) {
  return Promise.race([
    processJob(),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Job timeout")), TIMEOUT)),
  ]);
}

async function launchWorkerBrowser() {
  console.log("Using puppeteer package:", require.resolve("puppeteer"));
  console.log("Launching Puppeteer...");
  try {
    const launchTimeoutMs = Number(process.env.PUPPETEER_LAUNCH_TIMEOUT_MS ?? 30_000);
    const browser = await withTimeout(
      launchPuppeteerBrowser(),
      launchTimeoutMs,
      `Puppeteer launch timed out after ${launchTimeoutMs}ms`,
    );
    const version = await browser.version();
    console.log(`Browser version: ${version}`);
    console.log("Puppeteer launched successfully");
    return browser;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Worker] Puppeteer launch failed: ${message}`);
    throw error;
  }
}

function normalizeCollectedAmount(input: unknown): number {
  const raw = String(input ?? "").trim();
  if (!raw) return 0;
  const m = raw.match(/[\d,]+(?:\.\d+)?/);
  const n = Number((m ? m[0] : raw).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

await ensureStorageDirs();
await prisma.$connect();
await ensureRedisConnection();
console.log("Worker started");
console.log("[WORKER] UPLOAD_DIR:", process.env.UPLOAD_DIR || "/app/storage/uploads");
console.log("Using Redis:", process.env.REDIS_URL);

async function reconcileLabelQueueState() {
  const jobs = await prisma.labelJob.findMany({
    where: { status: { in: ["QUEUED", "PROCESSING"] } },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      userId: true,
      status: true,
      unitCount: true,
      recordCount: true,
      labelsPdfPath: true,
      moneyOrderPdfPath: true,
    },
  });

  for (const dbJob of jobs) {
    const queueJob = await labelQueue.getJob(dbJob.id);
    if (!queueJob) {
      // BullMQ job has expired or been removed from Redis while DB still shows active status.
      // Mark it as failed so it does not remain stuck indefinitely.
      await prisma.labelJob.update({
        where: { id: dbJob.id },
        data: { status: "FAILED", error: "Job expired from queue without completing" },
      });
      await releaseQueuedLabels(dbJob.userId, dbJob.unitCount || dbJob.recordCount);
      continue;
    }

    const state = await queueJob.getState();
    if (state === "completed") {
      const result = (queueJob.returnvalue ?? null) as { labelsPath?: string | null; moneyOrderPath?: string | null } | null;
      await prisma.labelJob.update({
        where: { id: dbJob.id },
        data: {
          status: "COMPLETED",
          error: null,
          labelsPdfPath: result?.labelsPath ?? dbJob.labelsPdfPath,
          moneyOrderPdfPath: result?.moneyOrderPath ?? dbJob.moneyOrderPdfPath,
        },
      });
      await finalizeQueuedToGenerated(dbJob.userId, dbJob.unitCount || dbJob.recordCount);
      continue;
    }

    if (state === "failed") {
      await prisma.labelJob.update({
        where: { id: dbJob.id },
        data: { status: "FAILED", error: queueJob.failedReason || "Queue job failed" },
      });
      await releaseQueuedLabels(dbJob.userId, dbJob.unitCount || dbJob.recordCount);
    }
  }
}

await reconcileLabelQueueState();

let moneyOrderTablesReady = false;

async function ensureMoneyOrderTables() {
  if (moneyOrderTablesReady) return;
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS money_orders (
      seq BIGSERIAL PRIMARY KEY,
      id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      tracking_number TEXT NOT NULL,
      mo_number TEXT NOT NULL,
      segment_index INTEGER NOT NULL DEFAULT 0,
      tracking_id TEXT,
      issue_date TEXT,
      amount REAL NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `;
  const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'money_orders'
  `;
  const hasColumn = (name: string) => columns.some((col) => String(col.column_name).toLowerCase() === name.toLowerCase());
  if (!hasColumn("tracking_id")) {
    await prisma.$executeRaw`ALTER TABLE money_orders ADD COLUMN IF NOT EXISTS tracking_id TEXT`;
  }
  if (!hasColumn("issue_date")) {
    await prisma.$executeRaw`ALTER TABLE money_orders ADD COLUMN IF NOT EXISTS issue_date TEXT`;
  }
  if (!hasColumn("amount")) {
    await prisma.$executeRaw`ALTER TABLE money_orders ADD COLUMN IF NOT EXISTS amount REAL NOT NULL DEFAULT 0`;
  }
  if (!hasColumn("segment_index")) {
    await prisma.$executeRaw`ALTER TABLE money_orders ADD COLUMN IF NOT EXISTS segment_index INTEGER NOT NULL DEFAULT 0`;
  }
  await prisma.$executeRaw`CREATE UNIQUE INDEX IF NOT EXISTS idx_money_orders_mo_number ON money_orders(mo_number)`;
  await prisma.$executeRaw`DROP INDEX IF EXISTS idx_money_orders_user_tracking`;
  await prisma.$executeRaw`CREATE UNIQUE INDEX IF NOT EXISTS idx_money_orders_user_tracking_segment ON money_orders(user_id, tracking_number, segment_index)`;
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS idx_money_orders_user_tracking_id ON money_orders(user_id, tracking_id)`;
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS idx_money_orders_user_tracking ON money_orders(user_id, tracking_number)`;
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS idx_money_orders_issue_date ON money_orders(issue_date)`;
  moneyOrderTablesReady = true;
}

function normalizeAmount(value: unknown) {
  const parsed = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function hasMoneyOrderAmount(order: { CollectAmount?: unknown; amount?: unknown }) {
  return normalizeAmount(order.CollectAmount ?? order.amount) > 0;
}

function resolveOrderShipmentType(order: { shipmentType?: unknown; shipmenttype?: unknown }, fallback?: unknown) {
  const normalized = String(order.shipmentType ?? order.shipmenttype ?? fallback ?? "").trim().toUpperCase();
  return normalized || null;
}

type MoneyOrderRow = {
  seq: number;
  tracking_number: string;
  tracking_id: string | null;
  mo_number: string;
  issue_date: string | null;
  amount: number | null;
  segment_index: number;
};

async function allocateNextMoneyOrderNumber(issueDate: string, reservedNumbers: Set<string>) {
  await ensureMoneyOrderTables();

  let sequence = 1;
  const latestPrefix = `${buildMoneyOrderNumber(1, issueDate).slice(0, 7)}%`;
  const latest = await prisma.$queryRaw<Array<{ mo_number: string }>>`
    SELECT mo_number
    FROM money_orders
    WHERE mo_number LIKE ${latestPrefix}
    ORDER BY LENGTH(mo_number) DESC, mo_number DESC
    LIMIT 1
  `;
  const latestSequence = parseIdentifierSequence(String(latest[0]?.mo_number ?? ""));
  if (latestSequence && latestSequence > 0) {
    sequence = latestSequence + 1;
  }

  while (true) {
    const moNumber = buildMoneyOrderNumber(sequence, issueDate);
    if (!reservedNumbers.has(moNumber)) {
      reservedNumbers.add(moNumber);
      return moNumber;
    }
    sequence += 1;
  }
}

async function ensureSystemMoneyOrders(
  userId: string,
  rows: Array<{ trackingNumber: string; amount?: unknown; issueDate?: string; shipmentType?: unknown }>,
) {
  const uniqueRows = Array.from(
    new Map(
      rows
        .map((row) => ({
          trackingNumber: normalizeTrackingId(row.trackingNumber),
          amount: normalizeAmount(row.amount),
          issueDate: String(row.issueDate ?? "").trim() || new Date().toISOString().slice(0, 10),
          shipmentType: row.shipmentType,
        }))
        .filter((row) => row.trackingNumber)
        .map((row) => [row.trackingNumber, row] as const),
    ).values(),
  );
  if (uniqueRows.length === 0) return;
  await ensureMoneyOrderTables();
  const reservedNumbers = new Set<string>();

  for (const row of uniqueRows) {
    const desiredLines = moneyOrderBreakdown(row.amount, row.shipmentType);
    const existing = await prisma.$queryRaw<MoneyOrderRow[]>`
      SELECT seq, tracking_number, tracking_id, mo_number, issue_date, amount, segment_index
      FROM money_orders
      WHERE user_id = ${userId} AND tracking_number = ${row.trackingNumber}
      ORDER BY segment_index ASC, seq ASC
    `;

    existing.forEach((currentRow) => {
      const validatedMoNumber = validateMoneyOrderNumber(currentRow.mo_number);
      if (validatedMoNumber.ok) {
        reservedNumbers.add(validatedMoNumber.value);
      }
    });

    if (desiredLines.length === 0) {
      if (existing.length > 0) {
        await prisma.$executeRaw`
          DELETE FROM money_orders WHERE user_id = ${userId} AND tracking_number = ${row.trackingNumber}
        `;
      }
      continue;
    }

    for (const desiredLine of desiredLines) {
      const currentRow = existing.find((item) => item.segment_index === desiredLine.segmentIndex) ?? null;
      const validatedMoNumber = currentRow ? validateMoneyOrderNumber(currentRow.mo_number) : null;
      const moNumber = validatedMoNumber?.ok
        ? validatedMoNumber.value
        : await allocateNextMoneyOrderNumber(row.issueDate, reservedNumbers);

      if (currentRow) {
        await prisma.$executeRaw`
          UPDATE money_orders
          SET mo_number = ${moNumber},
              segment_index = ${desiredLine.segmentIndex},
              tracking_id = ${row.trackingNumber},
              issue_date = ${row.issueDate},
              amount = ${desiredLine.moAmount},
              updated_at = CURRENT_TIMESTAMP
          WHERE seq = ${currentRow.seq}
        `;
        continue;
      }

      await prisma.$executeRaw`
        INSERT INTO money_orders (id, user_id, tracking_number, mo_number, segment_index, tracking_id, issue_date, amount)
        VALUES (${randomUUID()}, ${userId}, ${row.trackingNumber}, ${moNumber}, ${desiredLine.segmentIndex}, ${row.trackingNumber}, ${row.issueDate}, ${desiredLine.moAmount})
      `;
    }

    const staleRows = existing.filter((item) => item.segment_index >= desiredLines.length);
    if (staleRows.length > 0) {
      const staleSeqs = staleRows.map((item) => item.seq);
      await prisma.$executeRaw`
        DELETE FROM money_orders WHERE seq IN (${Prisma.join(staleSeqs)})
      `;
    }
  }
}

async function getMoneyOrdersByTracking(userId: string, trackingNumbers: string[]) {
  const uniqueTracking = Array.from(new Set(trackingNumbers.map((t) => String(t).trim()).filter(Boolean)));
  if (uniqueTracking.length === 0) return new Map<string, MoneyOrderRow[]>();
  await ensureMoneyOrderTables();

  const rows = await prisma.$queryRaw<MoneyOrderRow[]>`
    SELECT seq, tracking_number, tracking_id, mo_number, issue_date, amount, segment_index
    FROM money_orders
    WHERE user_id = ${userId} AND tracking_number IN (${Prisma.join(uniqueTracking)})
    ORDER BY tracking_number ASC, segment_index ASC, seq ASC
  `;

  const grouped = new Map<string, MoneyOrderRow[]>();
  for (const row of rows) {
    const key = String(row.tracking_number ?? "").trim();
    if (!key) continue;
    const current = grouped.get(key) ?? [];
    current.push(row);
    grouped.set(key, current);
  }
  return grouped;
}

const worker = new Worker(
  labelQueueName,
  async (bullJob) => {
    const processJob = async () => {
    console.log("Processing job", bullJob.id);
    console.log(`Worker processing job: ${String(bullJob.id ?? "unknown")}`);
    await prisma.$connect();
    const {
      jobId,
      generateLabels,
      autoGenerateTracking,
      generateMoneyOrder,
        barcodeMode,
      printMode,
      trackingScheme,
      trackAfterGenerate,
      carrierType,
      shipmentType,
      filePath: jobDataFilePath,
    } = bullJob.data as {
      jobId: string;
      filePath?: string;
      generateLabels?: boolean;
      autoGenerateTracking?: boolean;
      generateMoneyOrder?: boolean;
        barcodeMode?: "manual" | "auto";
      printMode?: "labels" | "envelope" | "flyer";
      trackingScheme?: "standard" | "rl" | "ums";
      trackAfterGenerate?: boolean;
      carrierType?: "pakistan_post" | "courier";
      shipmentType?: "RL" | "UMS" | "VPL" | "VPP" | "PAR" | "COD" | "COURIER" | null;
    };
    const job = await prisma.labelJob.findUnique({
      where: { id: jobId },
      include: { user: true },
    });
    if (!job) return;

    console.log(`[Worker] Starting job ${jobId} (BullMQ ID: ${bullJob.id})`);

    await prisma.labelJob.update({ where: { id: jobId }, data: { status: "PROCESSING", error: null } });

    let browser: Browser | undefined;
    try {
      const resolvedFilePath = String(jobDataFilePath ?? "").trim();
      if (!resolvedFilePath) {
        throw new UnrecoverableError("Missing filePath in job data");
      }
      console.log(`[WORKER] Reading file: ${resolvedFilePath}`);

      if (!existsSync(resolvedFilePath)) {
        console.error(`[WORKER] Upload file not found at ${resolvedFilePath}`);
        throw new UnrecoverableError(`Upload file not found at ${resolvedFilePath}`);
      }

      browser = await launchWorkerBrowser();

      // --- Control Flags ---
      const doGenerateLabels = generateLabels === true; // Hard block: false if undefined or false
      const doAutoGenerateTracking = autoGenerateTracking === true; // Hard block: false if undefined or false
      const pakistanPostCarrier = carrierType !== "courier";
      const doGenerateMoneyOrder = generateMoneyOrder === true && pakistanPostCarrier; // Per-order gating happens after label preparation
      const autoModeChecked = doAutoGenerateTracking && doGenerateMoneyOrder;
      if (autoModeChecked) {
        console.log("Auto Mode: Tracking + MO generated");
      }

      let orders: any[] = [];
      try {
        orders = await parseOrdersFromFile(resolvedFilePath, { allowMissingTrackingId: doAutoGenerateTracking });
        console.log(`[Worker] Parsing success for job ${jobId}. Rows: ${orders.length}`);
      } catch (parseError) {
        const parseMessage = parseError instanceof Error ? parseError.message : String(parseError);
        console.error(`[Worker] File parse failed for job ${jobId}: ${parseMessage}`);
        throw new Error(`Upload parsing failed: ${parseMessage}`);
      }
      let useProfileShipper = false;
      if (job.user) {
        const user = job.user as any;
        const profileShipper = {
          shipperName: String(user.companyName ?? "").trim(),
          shipperPhone: String(user.contactNumber ?? "").trim(),
          shipperAddress: String(user.address ?? "").trim(),
          shipperEmail: String(user.email ?? "").trim(),
          senderCity: String(user.originCity ?? "").trim(),
        };
        const hasFullProfileShipper = Boolean(
          profileShipper.shipperName &&
            profileShipper.shipperPhone &&
            profileShipper.shipperAddress &&
            profileShipper.shipperEmail &&
            profileShipper.senderCity,
        );
        useProfileShipper = hasFullProfileShipper;

        for (const order of orders) {
          if (!useProfileShipper) {
            continue;
          }

          order.shipperName = profileShipper.shipperName;
          order.shipperPhone = profileShipper.shipperPhone;
          order.shipperAddress = profileShipper.shipperAddress;
          order.shipperEmail = profileShipper.shipperEmail;
          order.senderCity = profileShipper.senderCity;
        }
      }

      if (!useProfileShipper) {
        const uploadSourceErrors: string[] = [];
        orders.forEach((order, idx) => {
          const hasUploadShipper =
            String(order.shipperName ?? "").trim() &&
            String(order.shipperPhone ?? "").trim() &&
            String(order.shipperAddress ?? "").trim() &&
            String(order.shipperEmail ?? "").trim() &&
            String(order.senderCity ?? "").trim();
          if (!hasUploadShipper) {
            uploadSourceErrors.push(
              `Row ${idx + 2}: upload shipper source must include shipperName, shipperPhone, shipperAddress, shipperEmail, senderCity.`,
            );
          }
        });
        if (uploadSourceErrors.length > 0) {
          throw new Error(`Upload validation failed. ${uploadSourceErrors.slice(0, 20).join(" ")}`);
        }
      }
      const outputMode = printMode === "envelope" ? "envelope" : printMode === "flyer" ? "flyer" : "labels";
      const labelOrders = prepareLabelOrders(orders, {
        autoGenerateTracking: autoGenerateTracking === true,
        barcodeMode: barcodeMode === "manual" ? "manual" : "auto",
        trackingScheme: trackingScheme === "rl" ? "rl" : trackingScheme === "ums" ? "ums" : "standard",
        carrierType: carrierType === "courier" ? "courier" : "pakistan_post",
        shipmentType: shipmentType ?? null,
        outputMode,
      });
      const moneyOrderEligibleOrders = doGenerateMoneyOrder
        ? labelOrders.filter((order) => shouldApplyPakistanPostValuePayableRules(order.carrierType, resolveOrderShipmentType(order, shipmentType)) && hasMoneyOrderAmount(order))
        : [];
      let labelOrdersForRender = labelOrders;
      let moneyOrdersByTracking = new Map<string, MoneyOrderRow[]>();

      if (moneyOrderEligibleOrders.length > 0) {
        const today = new Date().toISOString().slice(0, 10);
        await ensureSystemMoneyOrders(
          job.userId,
          moneyOrderEligibleOrders.map((order) => ({
            trackingNumber: String(order.trackingNumber ?? "").trim(),
            amount: (order as any).CollectAmount,
            issueDate: today,
            shipmentType: resolveOrderShipmentType(order, shipmentType),
          })),
        );
        moneyOrdersByTracking = await getMoneyOrdersByTracking(
          job.userId,
          moneyOrderEligibleOrders.map((order) => String(order.trackingNumber ?? "").trim()),
        );
        labelOrdersForRender = labelOrders.map((order) => {
          const trackingNumber = String(order.trackingNumber ?? "").trim();
          const moneyOrderNumbers = (moneyOrdersByTracking.get(trackingNumber) ?? [])
            .map((item) => String(item.mo_number ?? "").trim())
            .filter(Boolean);
          return {
            ...order,
            moneyOrderNumbers,
          };
        });
      }

      if (trackAfterGenerate === true) {
        const orderByTracking = new Map(
          labelOrdersForRender
            .map((o) => [String(o.trackingNumber ?? "").trim(), o] as const)
            .filter(([t]) => Boolean(t)),
        );
        const trackingNumbers = Array.from(
          new Set(
            labelOrdersForRender
              .map((o) => String(o.trackingNumber ?? "").trim())
              .filter(Boolean),
          ),
        );

        if (trackingNumbers.length > 0) {
          try {
            await prisma.$transaction(
              trackingNumbers.map((trackingNumber) =>
                prisma.shipment.upsert({
                  where: { userId_trackingNumber: { userId: job.userId, trackingNumber } },
                  create: {
                    userId: job.userId,
                    trackingNumber,
                    shipmentType: resolveOrderShipmentType(orderByTracking.get(trackingNumber) ?? {}, shipmentType),
                    rawJson: (() => {
                      const o = orderByTracking.get(trackingNumber);
                      if (!o) return null;
                      const collectAmount = (o as any).CollectAmount ?? 0;
                      return JSON.stringify({
                        TrackingID: trackingNumber,
                        shipperName: String((o as any).shipperName ?? "").trim(),
                        shipperPhone: String((o as any).shipperPhone ?? "").trim(),
                        shipperAddress: String((o as any).shipperAddress ?? "").trim(),
                        shipperEmail: String((o as any).shipperEmail ?? "").trim(),
                        senderCity: String((o as any).senderCity ?? "").trim(),
                        consigneeName: String((o as any).consigneeName ?? "").trim(),
                        consigneeEmail: String((o as any).consigneeEmail ?? "").trim(),
                        consigneePhone: String((o as any).consigneePhone ?? "").trim(),
                        consigneeAddress: String((o as any).consigneeAddress ?? "").trim(),
                        receiverCity: String((o as any).receiverCity ?? "").trim(),
                        CollectAmount: String(collectAmount ?? "0").trim() || "0",
                        ordered: String((o as any).ordered ?? "").trim(),
                        ProductDescription: String((o as any).ProductDescription ?? "").trim(),
                        Weight: String((o as any).Weight ?? "").trim(),
                        shipmenttype: String((o as any).shipmenttype ?? "").trim(),
                        numberOfPieces: String((o as any).numberOfPieces ?? "").trim(),
                        tracking: null,
                      });
                    })(),
                  },
                  update: {
                    shipmentType: resolveOrderShipmentType(orderByTracking.get(trackingNumber) ?? {}, shipmentType),
                    rawJson: (() => {
                      const o = orderByTracking.get(trackingNumber);
                      if (!o) return undefined;
                      const collectAmount = (o as any).CollectAmount ?? 0;
                      return JSON.stringify({
                        TrackingID: trackingNumber,
                        shipperName: String((o as any).shipperName ?? "").trim(),
                        shipperPhone: String((o as any).shipperPhone ?? "").trim(),
                        shipperAddress: String((o as any).shipperAddress ?? "").trim(),
                        shipperEmail: String((o as any).shipperEmail ?? "").trim(),
                        senderCity: String((o as any).senderCity ?? "").trim(),
                        consigneeName: String((o as any).consigneeName ?? "").trim(),
                        consigneeEmail: String((o as any).consigneeEmail ?? "").trim(),
                        consigneePhone: String((o as any).consigneePhone ?? "").trim(),
                        consigneeAddress: String((o as any).consigneeAddress ?? "").trim(),
                        receiverCity: String((o as any).receiverCity ?? "").trim(),
                        CollectAmount: String(collectAmount ?? "0").trim() || "0",
                        ordered: String((o as any).ordered ?? "").trim(),
                        ProductDescription: String((o as any).ProductDescription ?? "").trim(),
                        Weight: String((o as any).Weight ?? "").trim(),
                        shipmenttype: String((o as any).shipmenttype ?? "").trim(),
                        numberOfPieces: String((o as any).numberOfPieces ?? "").trim(),
                        tracking: null,
                      });
                    })(),
                  },
                }),
              ),
            );
            await prisma.trackingJob.create({
              data: {
                id: jobId, // stable link: tracking job id == label job id
                userId: job.userId,
                kind: "BULK_TRACK",
                status: "QUEUED",
                originalFilename: job.originalFilename,
                recordCount: trackingNumbers.length,
                uploadPath: job.uploadPath,
              },
            });
            await trackingQueue.add(
              "track-bulk",
              { jobId, kind: "BULK_TRACK", trackingNumbers },
              { jobId },
            );
            console.log(`[Worker] Enqueued tracking job ${jobId} (${trackingNumbers.length} tracking numbers)`);
          } catch (e) {
            if (e instanceof PythonServiceUnavailableError || e instanceof PythonServiceTimeoutError) {
              await prisma.trackingJob.upsert({
                where: { id: jobId },
                create: {
                  id: jobId,
                  userId: job.userId,
                  kind: "BULK_TRACK",
                  status: "FAILED",
                  originalFilename: job.originalFilename,
                  recordCount: trackingNumbers.length,
                  uploadPath: job.uploadPath,
                  error: e instanceof Error ? e.message : "Tracking service unavailable",
                },
                update: {
                  status: "FAILED",
                  error: e instanceof Error ? e.message : "Tracking service unavailable",
                  recordCount: trackingNumbers.length,
                  uploadPath: job.uploadPath,
                },
              });
              console.warn(`[Worker] Skipped tracking enqueue for job ${jobId}: ${e instanceof Error ? e.message : "Tracking service unavailable"}`);
            }
            // Already created/enqueued (e.g., retry) — ignore.
          }
        }
      }

      // --- Conditional Label Generation ---
      let labelsPdf: Buffer | null = null;
      let labelsPath: string | null = null;
      if (doGenerateLabels) {
        console.log(`[Worker] Generating Labels PDF for job ${jobId}`);
        console.log("TEMPLATE:", printMode);
        console.log("TEMPLATE USED:", outputMode === "envelope" ? "label-envelope-9x4.html via envelopeHtml(labels.ts)" : outputMode === "flyer" ? "label-flyer-a4.html via flyerHtml(labels.ts)" : "label-box-a4.html via labelsHtml(labels.ts)");
        const html = renderLabelDocumentHtml(labelOrdersForRender, {
          autoGenerateTracking: doAutoGenerateTracking,
          includeMoneyOrders: moneyOrderEligibleOrders.length > 0,
          outputMode,
        });
        const pdfData = await htmlToPdfBuffer(html, browser, outputMode === "envelope" ? "envelope-9x4" : "A4");
        const pdfBuffer = Buffer.from(pdfData);
        labelsPdf = pdfBuffer;
        labelsPath = path.join(outputsDir(), `${jobId}-labels.pdf`);
        await fs.writeFile(labelsPath, pdfBuffer);
        if (!(await waitForStoredFile(toStoredPath(labelsPath), 3, 100))) {
          throw new Error("Labels PDF was not fully written to disk");
        }
        console.log(`[Worker] Labels saved to ${labelsPath}`);
        console.log("PDF generated");
      }

      // --- Conditional Money Order Generation (isolated so a failure doesn't kill labels) ---
      let moneyPdf: Buffer | null = null;
      let moneyPath: string | null = null;
      if (moneyOrderEligibleOrders.length > 0) {
        try {
          console.log(`[Worker] Generating Money Order PDF for job ${jobId}`);
          const printableOrders = moneyOrderEligibleOrders.flatMap((order) => {
            const trackingNumber = String(order.trackingNumber ?? "").trim();
            const allocatedRows = moneyOrdersByTracking.get(trackingNumber) ?? [];
            return allocatedRows.map((allocatedRow) => ({
              ...order,
              TrackingID: trackingNumber,
              trackingNumber,
              amount: String(allocatedRow.amount ?? 0),
              amountRs: Number(allocatedRow.amount ?? 0),
              mo_number: String(allocatedRow.mo_number ?? "").trim(),
              moneyOrderNumbers: [String(allocatedRow.mo_number ?? "").trim()],
              mo_barcodeBase64: generateBarcodeBase64(String(allocatedRow.mo_number ?? "").trim()),
              issueDate: allocatedRow.issue_date ?? new Date().toISOString().slice(0, 10),
            }));
          });
          if (printableOrders.length === 0) {
            moneyPdf = null;
            moneyPath = null;
          } else {
          const backgrounds = await loadMoneyOrderBackgrounds().catch(() => null);
          const moneyPdfData = await htmlToPdfBuffer(
            moneyOrderHtml(printableOrders, { backgrounds: backgrounds ?? undefined }),
            browser,
          );
          moneyPdf = Buffer.from(moneyPdfData);
          console.log("Generating MO file...");
          moneyPath = moneyOrdersOutputPath(jobId);
          console.log("Output path:", moneyPath);
          await fs.writeFile(moneyPath, moneyPdf);
          const moneyFileExists = Boolean(await waitForStoredFile(toStoredPath(moneyPath), 3, 100));
          console.log("File exists after generation:", moneyFileExists);
          if (!moneyPath || !moneyFileExists) {
            console.error("MO generation failed: file missing");
            console.error("MO FILE NOT FOUND:", moneyPath);
            throw new Error("Money order PDF was not fully written to disk");
          }
          console.log(`[Worker] Money Orders saved to ${moneyPath}`);
          }
        } catch (moErr) {
          console.error(`[Worker] Money order generation failed for job ${jobId}:`, moErr);
          const moMessage = moErr instanceof Error ? moErr.message : "Money order generation failed";
          throw new Error(`Money order generation failed: ${moMessage}`);
        }
      }

      await prisma.labelJob.update({
        where: { id: jobId },
        data: {
          status: "COMPLETED",
          labelsPdfPath: labelsPath ? toStoredPath(labelsPath) : null,
          moneyOrderPdfPath: moneyPath ? toStoredPath(moneyPath) : null,
        },
      });

      await finalizeQueuedToGenerated(job.userId, job.unitCount || job.recordCount);
      console.log("Job completed", jobId);
      console.log(`[Worker] Job ${jobId} completed successfully`);

      // MANDATORY: Return paths so the API can find the files
      return {
        labelsPath: labelsPath ? toStoredPath(labelsPath) : null,
        moneyOrderPath: moneyPath ? toStoredPath(moneyPath) : null,
      };
    } catch (e) {
      console.error(`[Worker] Job ${jobId} failed:`, e);
      const errorMessage = e instanceof Error ? e.message : "Generation failed";
      await prisma.labelJob.update({
        where: { id: jobId },
        data: { status: "FAILED", error: errorMessage },
      });
      try {
        await releaseQueuedLabels(job.userId, job.unitCount || job.recordCount);
      } catch (releaseError) {
        console.error(`Failed to release queued labels for job ${jobId}:`, releaseError);
      }
      throw e;
    } finally {
      if (browser) {
        await browser.close();
      }
    }
    };

    return await safeJob(processJob);
  },
  { connection, concurrency: 1, lockDuration: 60_000 },
);

worker.on("completed", (job) => {
  // eslint-disable-next-line no-console
  console.log("Job completed:", job.id);
});

worker.on("failed", (job, err) => {
  // eslint-disable-next-line no-console
  console.error("Job failed:", job?.id, err);
});

worker.on("error", (err) => {
  // eslint-disable-next-line no-console
  console.error("Worker error:", err);
});

// eslint-disable-next-line no-console
console.log(`Worker started. Connecting to Redis at ${sanitizeRedisUrl(env.REDIS_URL)}...`);

const trackingWorker = new Worker(
  trackingQueueName,
  async (bullJob) => {
    const data = bullJob.data as
      | { jobId: string; kind: "BULK_TRACK"; trackingNumbers: string[]; lockKey?: string | null }
      | { jobId: string; kind: "COMPLAINT"; trackingNumber: string; phone: string; complaintText?: string };

    const job = await prisma.trackingJob.findUnique({ where: { id: data.jobId } });
    if (!job) return;

    const globalBulkLockKey = "bulk_tracking_lock";
    const globalBulkLockValue = `${process.pid}:${job.id}`;
    let globalBulkLockAcquired = false;

    console.log(`[TrackingWorker] Starting job ${job.id} (${data.kind}) (BullMQ ID: ${bullJob.id})`);
    if (data.kind === "BULK_TRACK") {
      console.log(`[BulkTracking] Job Started ID=${job.id}`);
      const lockWaitDeadline = Date.now() + TIMEOUT;
      while (!globalBulkLockAcquired) {
        if (Date.now() > lockWaitDeadline) {
          throw new UnrecoverableError("Job timeout");
        }
        const lockAcquired = await connection.set(globalBulkLockKey, globalBulkLockValue, "EX", 300, "NX");
        if (lockAcquired === "OK") {
          globalBulkLockAcquired = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    await prisma.trackingJob.update({ where: { id: job.id }, data: { status: "PROCESSING", error: null } });

    try {
      if (data.kind === "BULK_TRACK") {
        const outPath = path.join(outputsDir(), `${job.id}-tracking.json`);
        const uniqueTrackingNumbers = Array.from(new Set(data.trackingNumbers.map((t) => String(t ?? "").trim()).filter(Boolean)));
        const resultIndexByTracking = new Map(uniqueTrackingNumbers.map((trackingNumber, index) => [trackingNumber, index] as const));
        const results: Array<{
          tracking_number: string;
          status: string;
          city: string | null;
          latest_date: string | null;
          latest_time: string | null;
          days_passed: number | null;
          events?: Array<{ date: string; time: string; location: string; description: string }>;
          dispatch_city?: string | null;
          delivery_city?: string | null;
        }> = uniqueTrackingNumbers.map((tracking_number) => ({
          tracking_number,
          status: "-",
          city: null,
          latest_date: null,
          latest_time: null,
          days_passed: null,
        }));
        await fs.writeFile(outPath, JSON.stringify(results, null, 2), "utf8");
        await prisma.trackingJob.update({
          where: { id: job.id },
          data: { status: "PROCESSING", resultPath: path.relative(process.cwd(), outPath) },
        });

        console.log(`[BulkTracking] Job ${job.id} | Single bulk pass | total=${uniqueTrackingNumbers.length}`);
        const bulkResults = await pythonTrackBulk(uniqueTrackingNumbers, { includeRaw: true, batchSize: 100, batchTimeoutMs: 120_000 });

        for (const r of bulkResults) {
            const trackingNumber = String(r.tracking_number ?? "").trim();
            const resultIndex = resultIndexByTracking.get(trackingNumber);
            if (resultIndex == null) {
              continue;
            }
            try {
            const existing = await prisma.shipment.findUnique({
              where: { userId_trackingNumber: { userId: job.userId, trackingNumber: r.tracking_number } },
              select: { rawJson: true },
            });
            let preserved: Record<string, unknown> = {};
            if (existing?.rawJson) {
              try {
                const parsed = JSON.parse(existing.rawJson);
                preserved = {
                  TrackingID: parsed?.TrackingID ?? r.tracking_number,
                  shipperName: parsed?.shipperName,
                  shipperPhone: parsed?.shipperPhone,
                  shipperAddress: parsed?.shipperAddress,
                  shipperEmail: parsed?.shipperEmail,
                  senderCity: parsed?.senderCity,
                  consigneeName: parsed?.consigneeName,
                  consigneeEmail: parsed?.consigneeEmail,
                  consigneePhone: parsed?.consigneePhone,
                  consigneeAddress: parsed?.consigneeAddress,
                  receiverCity: parsed?.receiverCity,
                  CollectAmount: parsed?.CollectAmount,
                  ordered: parsed?.ordered,
                  ProductDescription: parsed?.ProductDescription,
                  Weight: parsed?.Weight,
                  shipmenttype: parsed?.shipmenttype,
                  numberOfPieces: parsed?.numberOfPieces,
                  collected_amount: parsed?.collected_amount,
                  collect_amount: parsed?.collect_amount,
                };
              } catch {
                preserved = {};
              }
            }
            const collectedAmount = normalizeCollectedAmount(
              (preserved as any)?.collected_amount ??
              (preserved as any)?.collect_amount ??
              (preserved as any)?.CollectAmount ??
              (r.raw as any)?.collected_amount ??
              (r.raw as any)?.collect_amount ??
              (r.raw as any)?.CollectAmount,
            );
            const enrichedRaw = {
              ...preserved,
              tracking: r.raw ?? null,
              collected_amount: collectedAmount,
            };
            const processed = processTracking(enrichedRaw, {
              explicitMo: (preserved as any)?.moIssuedNumber ?? null,
              trackingNumber: r.tracking_number,
            });
            const lastEvent = processed.trackingSteps.length > 0 ? processed.trackingSteps[processed.trackingSteps.length - 1] : "-";
            console.log(`[TrackingStatus] ${r.tracking_number} | System MOS: ${processed.systemMo} | Tracking MOS: ${processed.trackingMo} | Match: ${processed.moMatch} | Last Event: ${lastEvent} | Final Status: ${processed.systemStatus}`);
            const mergedRaw = JSON.stringify({
              ...preserved,
              TrackingID: String((preserved as any).TrackingID ?? r.tracking_number).trim(),
              tracking: r.raw ?? null,
              collected_amount: collectedAmount,
              booking_office: (r.raw as any)?.booking_office ?? undefined,
              delivery_office: (r.raw as any)?.delivery_office ?? undefined,
              consignee_name: (r.raw as any)?.consignee_name ?? undefined,
              consignee_address: (r.raw as any)?.consignee_address ?? undefined,
              consignee_phone: (r.raw as any)?.consignee_phone ?? undefined,
              events: (r.raw as any)?.events ?? undefined,
              mo_issued_number: (r.raw as any)?.mo_issued_number ?? undefined,
              resolved_delivery_office: processed.resolvedDeliveryOffice,
              tracking_category: processed.trackingCategory,
              complaint_eligible: processed.complaintEligible,
              system_status: processed.systemStatus,
              System_Status: processed.systemStatus,
              MOS_Number: processed.moIssued !== "-" ? processed.moIssued : undefined,
              mos_number: processed.moIssued !== "-" ? processed.moIssued : undefined,
              moIssuedNumber: processed.moIssued !== "-" ? processed.moIssued : undefined,
            });
            try {
              await persistTrackingIntelligence({
                userId: job.userId,
                trackingNumber: r.tracking_number,
                shipmentStatus: processed.status,
                rawData: r.raw ?? null,
                processed,
              });
            } catch (intelligenceError) {
              console.warn(`[TrackingIntelligence] skip ${r.tracking_number}:`, intelligenceError);
            }
            results[resultIndex] = {
              tracking_number: r.tracking_number,
              status: processed.status,
              city: processed.resolvedDeliveryOffice !== "-" ? processed.resolvedDeliveryOffice : (r.city ?? null),
              latest_date: r.latest_date ?? null,
              latest_time: r.latest_time ?? null,
              days_passed: r.days_passed ?? null,
              events: (r as any).events ?? (r.raw as any)?.events ?? [],
              dispatch_city: (r.raw as any)?.booking_office ?? null,
              delivery_city: (r.raw as any)?.delivery_office ?? null,
            };
            await prisma.shipment.upsert({
              where: { userId_trackingNumber: { userId: job.userId, trackingNumber: r.tracking_number } },
              create: {
                userId: job.userId,
                trackingNumber: r.tracking_number,
                status: processed.status,
                city: processed.resolvedDeliveryOffice !== "-" ? processed.resolvedDeliveryOffice : (r.city ?? null),
                latestDate: r.latest_date ?? null,
                latestTime: r.latest_time ?? null,
                daysPassed: r.days_passed ?? null,
                rawJson: mergedRaw,
              },
              update: {
                status: processed.status,
                city: processed.resolvedDeliveryOffice !== "-" ? processed.resolvedDeliveryOffice : (r.city ?? null),
                latestDate: r.latest_date ?? null,
                latestTime: r.latest_time ?? null,
                daysPassed: r.days_passed ?? null,
                rawJson: mergedRaw,
              },
            });
            } catch (inner) {
              if (inner instanceof PythonServiceUnavailableError || inner instanceof PythonServiceTimeoutError) {
                throw inner;
              }
              results[resultIndex] = {
                tracking_number: trackingNumber,
                status: "-",
                city: null,
                latest_date: null,
                latest_time: null,
                days_passed: null,
              };
            }
        }
        await fs.writeFile(outPath, JSON.stringify(results, null, 2), "utf8");


        try {
          await refreshTrackingIntelligenceAggregates(job.userId);
        } catch (intelligenceError) {
          console.warn("[TrackingIntelligence] aggregate refresh skipped:", intelligenceError);
        }

        await prisma.trackingJob.update({
          where: { id: job.id },
          data: { status: "COMPLETED" },
        });
        await finalizeQueuedTrackingToGenerated(job.userId, 1);

        console.log(`[TrackingWorker] Job ${job.id} completed (${results.length} results)`);
        console.log(`[BulkTracking] Job Finished ID=${job.id}`);
        return { resultPath: path.relative(process.cwd(), outPath) };
      }

      if (data.kind === "COMPLAINT") {
        const resp = await pythonSubmitComplaint(data.trackingNumber, data.phone);
        const text = resp.response_text ?? "";
        const userNote = data.complaintText ? `User complaint:\n${data.complaintText}\n\n` : "";
        const combinedText = `${userNote}Response:\n${text}`;

        const complaintStatus = /Complaint\s*No/i.test(text)
          ? "FILED"
          : /already/i.test(text)
            ? "FILED"
            : "ERROR";

        await prisma.shipment.upsert({
          where: { userId_trackingNumber: { userId: job.userId, trackingNumber: data.trackingNumber } },
          create: {
            userId: job.userId,
            trackingNumber: data.trackingNumber,
            complaintStatus,
            complaintText: combinedText,
          },
          update: {
            complaintStatus,
            complaintText: combinedText,
          },
        });

        const outPath = path.join(outputsDir(), `${job.id}-complaint.json`);
        await fs.writeFile(outPath, JSON.stringify({ trackingNumber: data.trackingNumber, complaintStatus, responseText: combinedText }, null, 2), "utf8");

        await prisma.trackingJob.update({
          where: { id: job.id },
          data: { status: "COMPLETED", resultPath: path.relative(process.cwd(), outPath) },
        });

        console.log(`[TrackingWorker] Complaint job ${job.id} completed (${complaintStatus})`);
        return { resultPath: path.relative(process.cwd(), outPath), complaintStatus };
      }
    } catch (e) {
      const errorMessage =
        e instanceof PythonServiceUnavailableError || e instanceof PythonServiceTimeoutError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Tracking job failed";
      if (data.kind === "BULK_TRACK") {
        await releaseQueuedTracking(job.userId, 1);
      }
      if (e instanceof PythonServiceUnavailableError || e instanceof PythonServiceTimeoutError) {
        console.warn(`[TrackingWorker] Job ${job.id} failed: ${errorMessage}`);
      } else {
        console.error(`[TrackingWorker] Job ${job.id} failed:`, e);
      }
      await prisma.trackingJob.update({ where: { id: job.id }, data: { status: "FAILED", error: errorMessage } });
      if (data.kind === "BULK_TRACK") {
        console.log(`[BulkTracking] Job Finished ID=${job.id}`);
      }
      if (e instanceof PythonServiceUnavailableError || e instanceof PythonServiceTimeoutError) {
        throw new UnrecoverableError(errorMessage);
      }
      throw e;
    } finally {
      if (data.kind === "BULK_TRACK" && globalBulkLockAcquired) {
        try {
          const currentGlobalLockValue = await connection.get(globalBulkLockKey);
          if (currentGlobalLockValue === globalBulkLockValue) {
            await connection.del(globalBulkLockKey);
          }
        } catch (globalLockError) {
          console.warn(`[BulkTracking] Failed to release global lock for job ${job.id}:`, globalLockError);
        }
      }
      if (data.kind === "BULK_TRACK" && data.lockKey) {
        try {
          const currentLockValue = await connection.get(data.lockKey);
          if (currentLockValue === job.id) {
            await connection.del(data.lockKey);
          }
        } catch (lockError) {
          console.warn(`[BulkTracking] Failed to release lock for job ${job.id}:`, lockError);
        }
      }
    }
  },
  { connection, concurrency: 1 },
);

trackingWorker.on("failed", (job, err) => {
  // eslint-disable-next-line no-console
  console.error("Tracking worker job failed", job?.id, err);
});

trackingWorker.on("error", (err) => {
  const isConnRefused = err.message.includes("ECONNREFUSED") || (err as any).code === "ECONNREFUSED";
  const isConnReset = err.message.includes("ECONNRESET") || (err as any).code === "ECONNRESET";
  if (isConnRefused) {
    // eslint-disable-next-line no-console
    console.error("Tracking worker could not connect to Redis (ECONNREFUSED). Start Redis and retry.");
  } else if (isConnReset) {
    // eslint-disable-next-line no-console
    console.error("Tracking worker Redis connection reset (ECONNRESET). Ensure Redis is stable and retry.");
  } else {
    // eslint-disable-next-line no-console
    console.error("Tracking worker error:", err);
  }
});

console.log(`Worker ready (queues: ${labelQueueName}, ${trackingQueueName})`);

function generateBarcodeBase64(text: string) {
  const canvas = createCanvas(400, 120);

  JsBarcode(canvas, text, {
    format: "CODE128",
    width: 2.5,
    height: 90,
    displayValue: false,
    margin: 0,
  });

  return canvas.toDataURL();
}
