import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { parse as parseCsv } from "csv-parse/sync";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import type { AuthedRequest } from "../middleware/auth.js";
import { ensureStorageDirs, outputsDir, uploadsDir } from "../storage/paths.js";
import { trackingQueue } from "../queue/queue.js";
import { ensureRedisConnection, getRedisConnection } from "../queue/redis.js";
import { redisEnabled } from "../lib/redis.js";
import { parseOrdersFromFile } from "../parse/orders.js";
import { parseTrackingNumbersFromFile } from "../parse/tracking.js";
import { validateUploadedTrackingId } from "../validation/trackingId.js";
import { finalizeQueuedTrackingToGenerated, releaseQueuedTracking } from "../usage/limits.js";
import { COMPLAINT_UNIT_COST, consumeUnits, getComplaintAllowance, recordUnitsUsed, refundUnits } from "../usage/unitConsumption.js";
import {
  pythonTrackOne,
  pythonTrackBulk,
  pythonSubmitComplaint,
  PythonServiceTimeoutError,
  PythonServiceUnavailableError,
} from "../services/trackingService.js";
import { logComplaintAudit } from "../services/complaint-audit.service.js";
import { enqueueComplaint, findActiveComplaintDuplicate, type ComplaintQueuePayload } from "../services/complaint-queue.service.js";
import { extractComplaintHistory } from "../services/complaint.service.js";
import { processTracking } from "../services/trackingStatus.js";
import { persistTrackingIntelligence, refreshTrackingIntelligenceAggregates } from "../services/trackingIntelligence.js";

export const trackingRouter = Router();
const inlineRunningJobs = new Set<string>();
const STRICT_FINAL_STATUSES = new Set(["Delivered", "Pending", "Return"]);

type PublicTrackingEvent = {
  date: string;
  time: string;
  location: string;
  description: string;
};

type PublicTrackingResponse = {
  success: boolean;
  degraded?: boolean;
  warning?: string;
  tracking_number: string;
  status: "Delivered" | "Pending" | "Return";
  current_status: "Delivered" | "Pending" | "Return";
  booking_office: string | null;
  delivery_office: string | null;
  consignee_name: string | null;
  consignee_address: string | null;
  origin: string | null;
  destination: string | null;
  current_location: string | null;
  estimated_delivery: string | null;
  delivery_progress: number;
  history: PublicTrackingEvent[];
  events: PublicTrackingEvent[];
  meta: Record<string, unknown> | null;
  error?: string;
};

type ComplaintOfficeMatch = {
  district: string;
  tehsil: string;
  location: string;
};

function enforceFinalStatus(status: unknown): "Delivered" | "Pending" | "Return" {
  const raw = String(status ?? "").trim();
  if (STRICT_FINAL_STATUSES.has(raw)) return raw as "Delivered" | "Pending" | "Return";
  const upper = raw.toUpperCase();
  if (upper === "DELIVERED") return "Delivered";
  if (upper === "RETURN" || upper === "RETURNED" || upper === "RETURN_IN_PROCESS") return "Return";
  return "Pending";
}

function normalizePublicTrackingIds(value: unknown): string[] {
  return Array.from(
    new Set(
      String(value ?? "")
        .split(",")
        .map((entry) => entry.trim().toUpperCase())
        .filter(Boolean),
    ),
  );
}

function resolveDeliveryProgress(status: "Delivered" | "Pending" | "Return", events: PublicTrackingEvent[]) {
  if (status === "Delivered" || status === "Return") return 100;
  if (events.length >= 5) return 85;
  if (events.length >= 3) return 65;
  if (events.length >= 1) return 35;
  return 10;
}

function buildPublicTrackingResponse(
  result: {
    tracking_number: string;
    status: string;
    events?: Array<{ date?: string | null; time?: string | null; location?: string | null; description?: string | null }>;
    raw?: unknown;
    meta?: Record<string, unknown> | null;
  },
  opts?: {
    degraded?: boolean;
    warning?: string;
    fallbackTrackingNumber?: string;
  },
): PublicTrackingResponse {
  const raw = (result.raw && typeof result.raw === "object" ? result.raw : {}) as Record<string, unknown>;
  const trackingNode = (raw.tracking && typeof raw.tracking === "object" ? raw.tracking : raw) as Record<string, unknown>;
  const events = Array.isArray(result.events)
    ? result.events.map((event) => ({
        date: String(event?.date ?? "").trim(),
        time: String(event?.time ?? "").trim(),
        location: String(event?.location ?? "").trim(),
        description: String(event?.description ?? "").trim(),
      }))
    : [];
  const finalStatus = enforceFinalStatus((result.meta as any)?.final_status ?? result.status);
  const latestEvent = events.length > 0 ? events[events.length - 1] : null;
  const origin = String(trackingNode.booking_office ?? raw.booking_office ?? "").trim() || null;
  const destination = String(trackingNode.delivery_office ?? raw.delivery_office ?? "").trim() || null;
  const currentLocation =
    String(
      latestEvent?.location ??
      trackingNode.current_location ??
      raw.current_location ??
      trackingNode.current_office ??
      raw.current_office ??
      "",
    ).trim() || destination || origin || null;

  return {
    success: true,
    degraded: opts?.degraded,
    warning: opts?.warning,
    tracking_number: String(result.tracking_number ?? opts?.fallbackTrackingNumber ?? "").trim().toUpperCase(),
    status: finalStatus,
    current_status: finalStatus,
    booking_office: origin,
    delivery_office: destination,
    consignee_name: String(trackingNode.consignee_name ?? raw.consignee_name ?? "").trim() || null,
    consignee_address: String(trackingNode.consignee_address ?? raw.consignee_address ?? "").trim() || null,
    origin,
    destination,
    current_location: currentLocation,
    estimated_delivery: String(
      (result.meta as any)?.estimated_delivery ??
      trackingNode.estimated_delivery ??
      raw.estimated_delivery ??
      "",
    ).trim() || null,
    delivery_progress: resolveDeliveryProgress(finalStatus, events),
    history: events,
    events,
    meta: (result.meta as Record<string, unknown> | null) ?? null,
  };
}

function buildBulkLockKey(userId: string, trackingNumbers: string[]) {
  const signature = createHash("sha1")
    .update(`${userId}:${trackingNumbers.map((t) => t.trim().toUpperCase()).sort().join("|")}`)
    .digest("hex");
  return `bulk-track:job:${userId}:${signature}`;
}

function normalizeCollectedAmount(input: unknown): number {
  const raw = String(input ?? "").trim();
  if (!raw) return 0;
  const m = raw.match(/[\d,]+(?:\.\d+)?/);
  const n = Number((m ? m[0] : raw).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function normalizeManualStatus(input: unknown): "DELIVERED" | "PENDING" | "RETURN" | null {
  const raw = String(input ?? "").trim().toUpperCase();
  if (!raw) return null;
  if (raw === "DELIVERED") return "DELIVERED";
  if (raw === "PENDING") return "PENDING";
  if (raw === "RETURN" || raw === "RETURNED") return "RETURN";
  return null;
}

function resolvePersistedStatus(raw: Record<string, unknown>, computedStatus: unknown): "DELIVERED" | "PENDING" | "RETURN" {
  const manual = normalizeManualStatus((raw as any).manual_status);
  if (manual) return manual;
  const upper = String(computedStatus ?? "").trim().toUpperCase();
  if (upper === "DELIVERED") return "DELIVERED";
  if (upper === "RETURN" || upper === "RETURNED" || upper === "RETURN_IN_PROCESS") return "RETURN";
  return "PENDING";
}

async function getDbMoForTracking(userId: string, trackingNumber: string): Promise<string | null> {
  const normalized = String(trackingNumber ?? "").trim().toUpperCase();
  if (!normalized) return null;
  try {
    const rows = await prisma.$queryRaw<Array<{ mo_number: string }>>`
      SELECT mo_number
      FROM money_orders
      WHERE user_id = ${userId}
        AND COALESCE(NULLIF(TRIM(tracking_id), ''), tracking_number) = ${normalized}
      ORDER BY segment_index ASC, mo_number ASC
    `;
    const numbers = rows
      .map((row) => String(row.mo_number ?? "").trim().toUpperCase())
      .filter(Boolean);
    return numbers.length > 0 ? numbers.join(", ") : null;
  } catch {
    return null;
  }
}

function normalizeOffice(value: string): string {
  return String(value ?? "")
    .toUpperCase()
    .replace(/POST OFFICE/g, "")
    .replace(/DELIVERY OFFICE/g, "")
    .replace(/OFFICE/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function editDistance(a: string, b: string): number {
  const s = String(a ?? "");
  const t = String(b ?? "");
  if (!s.length) return t.length;
  if (!t.length) return s.length;
  const dp = Array.from({ length: s.length + 1 }, () => Array(t.length + 1).fill(0));
  for (let i = 0; i <= s.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= t.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= s.length; i += 1) {
    for (let j = 1; j <= t.length; j += 1) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }
  return dp[s.length][t.length];
}

async function readComplaintOfficeRows(): Promise<ComplaintOfficeMatch[]> {
  const candidates = [
    path.join(process.cwd(), "city", "post-office-list.csv"),
    path.join(process.cwd(), "city", "post office list.csv"),
    path.join(process.cwd(), "apps", "api", "city", "post-office-list.csv"),
    path.join(process.cwd(), "apps", "api", "city", "post office list.csv"),
    path.resolve(process.cwd(), "..", "..", "city", "post-office-list.csv"),
    path.resolve(process.cwd(), "..", "..", "city", "post office list.csv"),
  ];
  const csvPath = candidates.find((p) => existsSync(p));
  if (!csvPath) {
    console.error("Post office file missing:", candidates.join(" | "));
    return [];
  }

  const raw = await fs.readFile(csvPath, "utf8");
  const rows = parseCsv(raw, { columns: true, skip_empty_lines: true }) as Array<Record<string, unknown>>;
  return rows
    .map((row) => ({
      district: String(row.District ?? row.district ?? "").trim(),
      tehsil: String(row.Tehsil ?? row.tehsil ?? "").trim(),
      location: String(row.Location ?? row.location ?? row["Post Office"] ?? "").trim(),
    }))
    .filter((row) => row.district && row.tehsil && row.location);
}

function matchDeliveryOffice(deliveryOffice: string, rows: ComplaintOfficeMatch[]): ComplaintOfficeMatch | null {
  // Priority: exact location (50) > prefix/contains location (40/30) > fuzzy location (20)
  //         > exact tehsil (10) > contains tehsil (8)
  //         > exact district (5) > contains district (3).
  // Location always dominates. Never returns a wrong district match over a good location match.
  const source = normalizeOffice(deliveryOffice);
  if (!source) return null;

  let best: { score: number; row: ComplaintOfficeMatch } | null = null;
  for (const row of rows) {
    const loc = normalizeOffice(row.location);
    const teh = normalizeOffice(row.tehsil);
    const dist = normalizeOffice(row.district);
    let score = 0;

    // Location first (highest priority)
    if (loc) {
      if (source === loc) score = 50;
      else if (Math.min(source.length, loc.length) >= 5) {
        if (source.startsWith(loc) || loc.startsWith(source)) score = 40;
        else if (source.includes(loc) || loc.includes(source)) score = 30;
        else if (editDistance(source, loc) <= 2) score = 20;
      }
    }
    // Tehsil second
    if (score === 0 && teh) {
      if (source === teh) score = 10;
      else if (Math.min(source.length, teh.length) >= 5 && (source.includes(teh) || teh.includes(source))) score = 8;
    }
    // District last (lowest priority)
    if (score === 0 && dist) {
      if (source === dist) score = 5;
      else if (Math.min(source.length, dist.length) >= 5 && (source.includes(dist) || dist.includes(source))) score = 3;
    }

    if (score > 0 && (!best || score > best.score)) {
      best = { score, row };
    }
  }
  return best?.row ?? null;
}

function extractDeliveryOfficeFromLastEvent(raw: Record<string, unknown>): string {
  const clean = (v: unknown) => String(v ?? "").trim();
  const tracking = (raw.tracking && typeof raw.tracking === "object" ? raw.tracking : raw) as Record<string, unknown>;
  const events = (tracking.events as unknown[]) ?? (raw.events as unknown[]) ?? [];
  if (!Array.isArray(events) || events.length === 0) return "";
  const last = (events[events.length - 1] ?? {}) as Record<string, unknown>;
  const direct = clean(last.location ?? last.city ?? "");
  const description = clean(last.description ?? last.detail ?? last.status ?? "");
  const fromDescription = description.match(/delivery\s+office\s+(.+?)(?:\.|,|;|$)/i)?.[1] ?? "";
  return clean(fromDescription) || direct;
}

async function runInlineTracking(jobId: string, userId: string) {
  if (inlineRunningJobs.has(jobId)) return;
  inlineRunningJobs.add(jobId);
  try {
    const job = await prisma.trackingJob.findFirst({ where: { id: jobId, userId } });
    if (!job) return;
    if (!job.uploadPath) {
      await prisma.trackingJob.update({
        where: { id: jobId },
        data: {
          status: "FAILED",
          error: "Tracking worker unavailable and inline fallback requires upload source. Start worker and retry.",
        },
      });
      return;
    }

    const trackingNumbers = await parseTrackingNumbersFromFile(job.uploadPath);
    const outPath = path.join(outputsDir(), `${job.id}-tracking.json`);
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
    }> = trackingNumbers.map((tracking_number) => ({
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
      data: { status: "PROCESSING", resultPath: path.relative(process.cwd(), outPath), error: null },
    });

    for (let i = 0; i < trackingNumbers.length; i += 1) {
      const trackingNumber = trackingNumbers[i];
      try {
        const r = await pythonTrackOne(trackingNumber, { includeRaw: true });
        const existing = await prisma.shipment.findUnique({
          where: { userId_trackingNumber: { userId, trackingNumber: r.tracking_number } },
          select: { rawJson: true },
        });
        let preserved: Record<string, unknown> = {};
        if (existing?.rawJson) {
          try {
            preserved = JSON.parse(existing.rawJson);
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
        const explicitMo = await getDbMoForTracking(userId, r.tracking_number);
        const processed = processTracking(enrichedRaw, {
          explicitMo,
          trackingNumber: r.tracking_number,
        });

        const persistedStatus = resolvePersistedStatus(preserved, processed.systemStatus);
        const manualOverrideActive = Boolean(normalizeManualStatus((preserved as any).manual_status));
        const mergedRaw = JSON.stringify({
          ...preserved,
          TrackingID: String((preserved as any).TrackingID ?? r.tracking_number).trim(),
          tracking: r.raw ?? null,
          tracking_patch: (r as any).meta ?? undefined,
          tracking_display_events: (r as any).display_events ?? undefined,
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
          complaint_eligible: persistedStatus === "PENDING" ? true : processed.complaintEligible,
          system_status: manualOverrideActive ? persistedStatus : processed.systemStatus,
          System_Status: manualOverrideActive ? persistedStatus : processed.systemStatus,
          final_status: persistedStatus,
          MOS_Number: processed.moIssued !== "-" ? processed.moIssued : "-",
          mos_number: processed.moIssued !== "-" ? processed.moIssued : "-",
          moIssuedNumber: processed.moIssued !== "-" ? processed.moIssued : undefined,
        });
        try {
          await persistTrackingIntelligence({
            userId,
            trackingNumber: r.tracking_number,
            shipmentStatus: processed.status,
            rawData: r.raw ?? null,
            processed,
          });
        } catch (intelligenceError) {
          console.warn(`[TrackingIntelligence] skip ${r.tracking_number}:`, intelligenceError);
        }

        results[i] = {
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
          where: { userId_trackingNumber: { userId, trackingNumber: r.tracking_number } },
          create: {
            userId,
            trackingNumber: r.tracking_number,
            status: persistedStatus,
            city: processed.resolvedDeliveryOffice !== "-" ? processed.resolvedDeliveryOffice : (r.city ?? null),
            latestDate: r.latest_date ?? null,
            latestTime: r.latest_time ?? null,
            daysPassed: r.days_passed ?? null,
            rawJson: mergedRaw,
          },
          update: {
            status: persistedStatus,
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
        results[i] = {
          tracking_number: trackingNumber,
          status: "-",
          city: null,
          latest_date: null,
          latest_time: null,
          days_passed: null,
        };
      }
      await fs.writeFile(outPath, JSON.stringify(results, null, 2), "utf8");
    }

    try {
      await refreshTrackingIntelligenceAggregates(userId);
    } catch (intelligenceError) {
      console.warn("[TrackingIntelligence] aggregate refresh skipped:", intelligenceError);
    }

    await prisma.trackingJob.update({ where: { id: job.id }, data: { status: "COMPLETED" } });
    await finalizeQueuedTrackingToGenerated(userId, 1);
  } catch (e) {
    const fallbackJob = await prisma.trackingJob.findFirst({ where: { id: jobId, userId } });
    if (fallbackJob) {
      await releaseQueuedTracking(userId, 1);
    }
    const message =
      e instanceof PythonServiceUnavailableError || e instanceof PythonServiceTimeoutError
        ? e.message
        : e instanceof Error
          ? e.message
          : "Inline tracking failed";
    await prisma.trackingJob.update({ where: { id: jobId }, data: { status: "FAILED", error: message } });
    console.error(`[TrackingInlineFallback] Job ${jobId} failed: ${message}`);
  } finally {
    inlineRunningJobs.delete(jobId);
  }
}

const upload = multer({
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

export const trackingUploadMiddleware = (req: Request, res: Response, next: NextFunction) => {
  upload.single("file")(req, res, (err) => {
    if (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      return res.status(400).json({ success: false, error: msg, message: msg });
    }
    return next();
  });
};

export async function handleTrackingBulk(req: Request, res: Response) {
  await prisma.$connect();
  const userId = (req as AuthedRequest).user!.id;
  await ensureStorageDirs();

  const job = await prisma.trackingJob.create({
    data: {
      userId,
      kind: "BULK_TRACK",
      status: "QUEUED",
      uploadPath: null,
      recordCount: 0,
      originalFilename: req.file?.originalname ?? null,
    },
  });

  let trackingNumbers: string[] = [];
  let uploadRowsByTracking = new Map<string, Record<string, unknown>>();
  let reservedTracking = false;
  let bulkLockKey: string | null = null;
  let trackingUnitRequests: Array<{ actionType: "tracking"; requestKey: string }> = [];
  const trackingField = String(req.body?.trackingField ?? "").trim();
  const idempotencyKey = String(req.header("x-idempotency-key") ?? job.id).trim();
  try {
    if (req.file) {
      const ext = path.extname(req.file.originalname).toLowerCase();
      const uploadPath = path.join(uploadsDir(), `${job.id}${ext}`);
      await fs.rename(req.file.path, uploadPath);
      try {
        const rows = await parseOrdersFromFile(uploadPath);
        trackingNumbers = rows.map((r) => String(r.TrackingID ?? "").trim()).filter(Boolean);
        uploadRowsByTracking = new Map(rows.map((r) => [String(r.TrackingID ?? "").trim(), r]));
      } catch {
        trackingNumbers = await parseTrackingNumbersFromFile(uploadPath, trackingField || undefined);
      }
      if (trackingNumbers.length === 0) throw new Error("No tracking numbers found");
      if (trackingNumbers.length > 2000) throw new Error("Max upload size is 2000 tracking numbers");
      await prisma.trackingJob.update({ where: { id: job.id }, data: { uploadPath, recordCount: trackingNumbers.length } });
    } else {
      const body = z.object({ tracking_numbers: z.array(z.string().min(1)).min(1).max(2000) }).parse(req.body);
      const invalid: string[] = [];
      console.log("[TrackingUpload] Validation path used: UPLOAD");
      trackingNumbers = body.tracking_numbers
        .map((t, i) => {
          const result = validateUploadedTrackingId(t);
          if (!result.ok) {
            invalid.push(`Row ${i + 1}: ${(result as any).reason}`);
            return "";
          }
          return result.value;
        })
        .filter(Boolean);

      if (invalid.length > 0) {
        throw new Error(`Manual tracking validation failed. ${invalid.slice(0, 20).join(" ")}`);
      }

      if (trackingNumbers.length === 0) throw new Error("No tracking numbers provided");
      trackingNumbers = Array.from(new Set(trackingNumbers.map((t) => t.trim()).filter(Boolean)));
      await prisma.trackingJob.update({ where: { id: job.id }, data: { recordCount: trackingNumbers.length } });
    }

    if (req.file) {
      trackingNumbers = Array.from(new Set(trackingNumbers.map((t) => t.trim()).filter(Boolean)));
      await prisma.trackingJob.update({ where: { id: job.id }, data: { recordCount: trackingNumbers.length } });
    }

    bulkLockKey = buildBulkLockKey(userId, trackingNumbers);
    const lockAcquired = await getRedisConnection().set(bulkLockKey, job.id, "EX", 1800, "NX");
    if (lockAcquired !== "OK") {
      const existingJobId = (await getRedisConnection().get(bulkLockKey)) ?? null;
      await prisma.trackingJob.update({
        where: { id: job.id },
        data: { status: "FAILED", error: "Duplicate bulk request ignored" },
      });
      return res.json({
        success: true,
        message: "Duplicate bulk request ignored",
        jobId: existingJobId,
        recordCount: trackingNumbers.length,
        queued: true,
        duplicate: true,
      });
    }

    trackingUnitRequests = trackingNumbers.map((_, i) => ({ actionType: "tracking", requestKey: `${idempotencyKey}:tracking:${i}` }));
    const consumeResult = await consumeUnits(userId, trackingUnitRequests);
    if (!consumeResult.ok) throw new Error((consumeResult as any).reason ?? "Unit consumption failed");
    reservedTracking = true;
  } catch (e) {
    if (bulkLockKey) {
      const currentLockValue = await getRedisConnection().get(bulkLockKey);
      if (currentLockValue === job.id) {
        await getRedisConnection().del(bulkLockKey);
      }
    }
    await prisma.trackingJob.update({
      where: { id: job.id },
      data: { status: "FAILED", error: e instanceof Error ? e.message : "Invalid upload" },
    });
    const msg = e instanceof Error ? e.message : "Invalid upload";
    console.error(`[TrackingUpload] Validation failed for job ${job.id}: ${msg}`);
    return res.status(400).json({ success: false, error: msg, message: msg });
  }

  try {
    await ensureRedisConnection();
    await trackingQueue.add(
      "track-bulk",
      { jobId: job.id, kind: "BULK_TRACK", trackingNumbers, lockKey: bulkLockKey },
      { jobId: job.id },
    );

    const existing = await prisma.shipment.findMany({
      where: { userId, trackingNumber: { in: trackingNumbers } },
      select: { trackingNumber: true, rawJson: true },
    });
    const existingSet = new Set(existing.map((s) => s.trackingNumber));
    const uploadSequenceByTracking = new Map(trackingNumbers.map((trackingNumber, index) => [trackingNumber, index + 1]));
    const existingUploadSequenceByTracking = new Map<string, number>();
    for (const row of existing) {
      try {
        const raw = row.rawJson ? JSON.parse(row.rawJson) : null;
        const preservedSequence = Number((raw as any)?.upload_sequence ?? (raw as any)?.uploadSequence ?? 0);
        if (Number.isFinite(preservedSequence) && preservedSequence > 0) {
          existingUploadSequenceByTracking.set(row.trackingNumber, preservedSequence);
        }
      } catch {
        // Ignore malformed historical payloads.
      }
    }
    const toCreate = trackingNumbers
      .filter((t) => !existingSet.has(t))
      .map((trackingNumber) => ({
        userId,
        trackingNumber,
        status: "-",
        rawJson: (() => {
          const row = uploadRowsByTracking.get(trackingNumber);
          return row
            ? JSON.stringify({
                ...row,
                TrackingID: trackingNumber,
                tracking: null,
                upload_sequence: existingUploadSequenceByTracking.get(trackingNumber) ?? uploadSequenceByTracking.get(trackingNumber) ?? 0,
                collected_amount: normalizeCollectedAmount(
                  (row as any)?.collected_amount ?? (row as any)?.collect_amount ?? (row as any)?.CollectAmount,
                ),
              })
            : null;
        })(),
      }));
    if (toCreate.length > 0) {
      await prisma.shipment.createMany({ data: toCreate });
    }

    if (uploadRowsByTracking.size > 0) {
      await Promise.all(
        trackingNumbers.map((trackingNumber) => {
          const row = uploadRowsByTracking.get(trackingNumber);
          if (!row) return Promise.resolve();
          return prisma.shipment.updateMany({
            where: { userId, trackingNumber },
            data: {
              rawJson: JSON.stringify({
                ...row,
                TrackingID: trackingNumber,
                tracking: null,
                upload_sequence: existingUploadSequenceByTracking.get(trackingNumber) ?? uploadSequenceByTracking.get(trackingNumber) ?? 0,
                collected_amount: normalizeCollectedAmount(
                  (row as any)?.collected_amount ?? (row as any)?.collect_amount ?? (row as any)?.CollectAmount,
                ),
              }),
            },
          });
        }),
      );
    }
  } catch (e) {
    // Safely clean up Redis locks only if Redis is available
    if (bulkLockKey && redisEnabled) {
      try {
        const currentLockValue = await getRedisConnection().get(bulkLockKey);
        if (currentLockValue === job.id) {
          await getRedisConnection().del(bulkLockKey);
        }
      } catch (redisErr) {
        console.warn(`[TrackingUpload] Failed to clean up Redis lock for job ${job.id}: ${redisErr instanceof Error ? redisErr.message : String(redisErr)}`);
      }
    }
    if (reservedTracking) {
      await refundUnits(userId, trackingUnitRequests);
    }
    await prisma.trackingJob.update({
      where: { id: job.id },
      data: { status: "FAILED", error: e instanceof Error ? e.message : "Tracking submission failed" },
    });
    const msg = e instanceof Error ? e.message : "Tracking submission failed";
    console.error(`[TrackingUpload] Queue/enqueue failed for job ${job.id}: ${msg}`);
    return res.status(500).json({ success: false, error: msg, message: msg });
  }

  return res.json({
    success: true,
    message: req.file ? "File uploaded successfully" : "Tracking submitted successfully",
    jobId: job.id,
    recordCount: trackingNumbers.length,
    queued: true,
  });
}

trackingRouter.post("/bulk", requireAuth, trackingUploadMiddleware, handleTrackingBulk);
trackingRouter.post("/upload", requireAuth, trackingUploadMiddleware, handleTrackingBulk);

/**
 * POST /api/tracking/live-bulk
 * Direct bulk tracking: no queue, no file upload, immediate Python bulk call.
 * Returns: { results: { [trackingId]: TrackResult }, fetched: number, cached: number }
 */
trackingRouter.post("/live-bulk", requireAuth, async (req, res) => {
  await prisma.$connect();
  const userId = (req as AuthedRequest).user!.id;
  const body = z
    .object({ tracking_ids: z.array(z.string().min(1)).min(1).max(500) })
    .parse(req.body ?? {});
  const ids = Array.from(new Set(body.tracking_ids.map((t) => t.trim()).filter(Boolean)));
  if (ids.length === 0) return res.status(400).json({ success: false, error: "No tracking_ids provided" });

  try {
    const bulkResults = await pythonTrackBulk(ids, { includeRaw: false, batchSize: 100, batchTimeoutMs: 120_000 });
    const resultsMap: Record<string, unknown> = {};
    for (const r of bulkResults) {
      const enforced = enforceFinalStatus((r as any)?.meta?.final_status ?? r.status);
      resultsMap[r.tracking_number.trim().toUpperCase()] = {
        ...r,
        status: enforced,
        current_status: enforced,
      };
    }
    return res.json({ success: true, results: resultsMap, fetched: bulkResults.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Tracking service error";
    if (e instanceof PythonServiceUnavailableError || e instanceof PythonServiceTimeoutError) {
      const degradedResults: Record<string, unknown> = {};
      for (const id of ids) {
        degradedResults[id.trim().toUpperCase()] = {
          tracking_number: id.trim().toUpperCase(),
          status: "Pending",
          current_status: "Pending",
          events: [],
          meta: {
            source: "degraded_mode",
            reason: "python_service_unavailable",
          },
        };
      }
      return res.json({
        success: true,
        degraded: true,
        warning: msg,
        results: degradedResults,
        fetched: 0,
        cached: 0,
      });
    }
    return res.status(500).json({ success: false, error: msg });
  }
});

trackingRouter.get("/track/:trackingNumber", requireAuth, async (req, res) => {
  await prisma.$connect();
  const userId = (req as AuthedRequest).user!.id;
  const trackingNumber = String(req.params.trackingNumber ?? "").trim();
  if (!trackingNumber) return res.status(400).json({ success: false, error: "Invalid tracking number" });

  try {
    const result = await pythonTrackOne(trackingNumber, { includeRaw: true });
    const raw = (result.raw && typeof result.raw === "object" ? result.raw : {}) as Record<string, unknown>;
    const explicitMo = await getDbMoForTracking(userId, result.tracking_number);
    const processed = processTracking(raw, { explicitMo, trackingNumber: result.tracking_number });

    let existing: { rawJson: string | null } | null = null;
    try {
      existing = await prisma.shipment.findUnique({
        where: { userId_trackingNumber: { userId, trackingNumber: result.tracking_number } },
        select: { rawJson: true },
      });
    } catch (err) {
      console.log("Database unavailable for existing shipment check:", err instanceof Error ? err.message : err);
    }
    let preserved: Record<string, unknown> = {};
    if (existing?.rawJson) {
      try {
        preserved = JSON.parse(existing.rawJson);
      } catch {
        preserved = {};
      }
    }

    const collectedAmount = normalizeCollectedAmount(
      (preserved as any)?.collected_amount ??
      (preserved as any)?.collect_amount ??
      (preserved as any)?.CollectAmount ??
      (raw as any)?.collected_amount ??
      (raw as any)?.collect_amount ??
      (raw as any)?.CollectAmount,
    );

    const persistedStatus = resolvePersistedStatus(preserved, processed.systemStatus);
    const manualOverrideActive = Boolean(normalizeManualStatus((preserved as any).manual_status));
    const mergedRaw = JSON.stringify({
      ...preserved,
      TrackingID: String((preserved as any).TrackingID ?? result.tracking_number).trim(),
      tracking: raw,
      tracking_patch: (result as any).meta ?? undefined,
      collected_amount: collectedAmount,
      booking_office: (raw as any)?.booking_office ?? undefined,
      delivery_office: (raw as any)?.delivery_office ?? undefined,
      consignee_name: (raw as any)?.consignee_name ?? undefined,
      consignee_address: (raw as any)?.consignee_address ?? undefined,
      consignee_phone: (raw as any)?.consignee_phone ?? undefined,
      events: (raw as any)?.events ?? undefined,
      mo_issued_number: (raw as any)?.mo_issued_number ?? undefined,
      resolved_delivery_office: processed.resolvedDeliveryOffice,
      tracking_category: processed.trackingCategory,
      complaint_eligible: persistedStatus === "PENDING" ? true : processed.complaintEligible,
      system_status: manualOverrideActive ? persistedStatus : processed.systemStatus,
      System_Status: manualOverrideActive ? persistedStatus : processed.systemStatus,
      final_status: persistedStatus,
      MOS_Number: processed.moIssued !== "-" ? processed.moIssued : "-",
      mos_number: processed.moIssued !== "-" ? processed.moIssued : "-",
      moIssuedNumber: processed.moIssued !== "-" ? processed.moIssued : undefined,
    });

    try {
      await prisma.shipment.upsert({
        where: { userId_trackingNumber: { userId, trackingNumber: result.tracking_number } },
        create: {
          userId,
          trackingNumber: result.tracking_number,
          status: persistedStatus,
          city: result.city ?? null,
          latestDate: result.latest_date ?? null,
          latestTime: result.latest_time ?? null,
          daysPassed: result.days_passed ?? null,
          rawJson: mergedRaw,
        },
        update: {
          status: persistedStatus,
          city: result.city ?? null,
          latestDate: result.latest_date ?? null,
          latestTime: result.latest_time ?? null,
          daysPassed: result.days_passed ?? null,
          rawJson: mergedRaw,
        },
      });
    } catch (err) {
      console.log("Failed to save tracking data to database:", err instanceof Error ? err.message : err);
    }

    const responseEventCount = Array.isArray(result.events) ? result.events.length : 0;
    const responseFirst = responseEventCount > 0 ? `${String(result.events?.[0]?.date ?? "")} ${String(result.events?.[0]?.time ?? "")}`.trim() : "-";
    const responseLast =
      responseEventCount > 0
        ? `${String(result.events?.[responseEventCount - 1]?.date ?? "")} ${String(result.events?.[responseEventCount - 1]?.time ?? "")}`.trim()
        : "-";
    const statusAfterPatch = enforceFinalStatus((result as any)?.meta?.final_status ?? result.status);
    if (!STRICT_FINAL_STATUSES.has(String((result as any)?.meta?.final_status ?? "").trim())) {
      console.error(`[TrackingAPI] invalid status for ${result.tracking_number}: ${(result as any)?.meta?.final_status ?? result.status ?? "-"}`);
    }

    return res.json({
      success: true,
      tracking_number: result.tracking_number,
      mos_id: result.mos_id ?? null,
      status: statusAfterPatch,
      status_display: (result as any)?.meta?.cycle_description ?? statusAfterPatch,
      current_status: statusAfterPatch,
      booking_office: (raw as any)?.booking_office ?? null,
      delivery_office: (raw as any)?.delivery_office ?? null,
      consignee_name: (raw as any)?.consignee_name ?? null,
      consignee_address: (raw as any)?.consignee_address ?? null,
      consignee_phone: (raw as any)?.consignee_phone ?? null,
      complaint_eligible: result.complaint_eligible,
      complaint_remaining_hours: (result as any).complaint_remaining_hours ?? null,
      events: result.events ?? [],
      meta: (result as any).meta ?? null,
      raw,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Tracking fetch failed";
    if (e instanceof PythonServiceUnavailableError || e instanceof PythonServiceTimeoutError) {
      const existingShipment = await prisma.shipment.findFirst({
        where: { userId, trackingNumber },
        select: {
          trackingNumber: true,
          status: true,
          city: true,
          latestDate: true,
          latestTime: true,
          daysPassed: true,
          rawJson: true,
        },
      });

      if (existingShipment) {
        let raw: Record<string, unknown> = {};
        try {
          raw = existingShipment.rawJson ? (JSON.parse(existingShipment.rawJson) as Record<string, unknown>) : {};
        } catch {
          raw = {};
        }

        return res.json({
          success: true,
          degraded: true,
          warning: msg,
          tracking_number: existingShipment.trackingNumber,
          status: existingShipment.status ?? "Pending",
          current_status: existingShipment.status ?? "Pending",
          city: existingShipment.city ?? null,
          latest_date: existingShipment.latestDate ?? null,
          latest_time: existingShipment.latestTime ?? null,
          days_passed: existingShipment.daysPassed ?? null,
          events: Array.isArray((raw as any)?.events) ? (raw as any).events : [],
          raw,
        });
      }

      return res.json({
        success: true,
        degraded: true,
        warning: msg,
        tracking_number: trackingNumber.toUpperCase(),
        status: "Pending",
        current_status: "Pending",
        events: [],
        meta: {
          source: "degraded_mode",
          reason: "python_service_unavailable",
        },
      });
    }
    return res.status(500).json({ success: false, error: msg });
  }
});

trackingRouter.get("/complaint/prefill/:trackingNumber", requireAuth, async (req, res) => {
  const userId = (req as AuthedRequest).user!.id;
  const trackingNumber = String(req.params.trackingNumber ?? "").trim();
  if (!trackingNumber) {
    return res.status(400).json({ success: false, message: "Invalid tracking number" });
  }

  const shipment = await prisma.shipment.findFirst({
    where: { userId, trackingNumber },
    select: { rawJson: true },
  });

  const raw: Record<string, unknown> = shipment?.rawJson ? JSON.parse(shipment.rawJson) : {};
  const tracking = (raw.tracking && typeof raw.tracking === "object" ? raw.tracking : raw) as Record<string, unknown>;
  const cleanComplaintValue = (...values: unknown[]) => {
    for (const value of values) {
      const text = String(value ?? "").trim();
      if (text && text !== "-") return text;
    }
    return "";
  };
  const eventDeliveryOffice = extractDeliveryOfficeFromLastEvent(raw);
  const deliveryOffice = String(
    raw.resolved_delivery_office ??
    tracking.delivery_office ??
    raw.delivery_office ??
    eventDeliveryOffice ??
    "",
  ).trim();
  const addresseeName = cleanComplaintValue(
    raw.consignee_name,
    raw.consigneeName,
    raw.receiver_name,
    raw.receiverName,
    tracking.consignee_name,
    tracking.receiver_name,
  );
  const addresseeAddress = cleanComplaintValue(
    raw.consignee_address,
    raw.consigneeAddress,
    raw.receiver_address,
    raw.receiverAddress,
    tracking.consignee_address,
    tracking.receiver_address,
    deliveryOffice,
  );
  const addresseeCity = cleanComplaintValue(
    raw.receiver_city,
    raw.receiverCity,
    raw.consigneeCity,
    raw.ConsigneeCity,
    tracking.delivery_office,
    tracking.delivery_city,
    deliveryOffice,
  );

  const rows = await readComplaintOfficeRows();
  const match = matchDeliveryOffice(deliveryOffice, rows);

  const districts = Array.from(new Set(rows.map((r) => r.district))).sort((a, b) => a.localeCompare(b));
  const tehsils = match
    ? Array.from(new Set(rows.filter((r) => r.district === match.district).map((r) => r.tehsil))).sort((a, b) => a.localeCompare(b))
    : [];
  const locations = match
    ? Array.from(new Set(rows.filter((r) => r.district === match.district && r.tehsil === match.tehsil).map((r) => r.location))).sort((a, b) => a.localeCompare(b))
    : [];

  return res.json({
    success: true,
    deliveryOffice,
    addresseeName,
    addresseeAddress,
    addresseeCity,
    matched: match,
    districts,
    tehsils,
    locations,
    districtData: rows,
  });
});

/**
 * GET /api/tracking/public?ids=ID1,ID2
 * Public (no auth) endpoint: track one or many parcels and return structured results.
 */
trackingRouter.get("/public", async (req: Request, res: Response) => {
  const ids = normalizePublicTrackingIds(req.query.ids ?? req.query.id);
  if (ids.length === 0) {
    return res.status(400).json({ success: false, error: "Provide at least one tracking ID in ?ids=" });
  }
  if (ids.length > 5) {
    return res.status(400).json({ success: false, error: "Maximum 5 tracking IDs allowed" });
  }

  const results = await Promise.all(
    ids.map(async (trackingNumber) => {
      try {
        const result = await pythonTrackOne(trackingNumber, { includeRaw: true });
        return buildPublicTrackingResponse(result);
      } catch (error) {
        if (error instanceof PythonServiceUnavailableError || error instanceof PythonServiceTimeoutError) {
          return buildPublicTrackingResponse(
            {
              tracking_number: trackingNumber,
              status: "Pending",
              events: [],
              meta: { source: "degraded_mode" },
            },
            {
              degraded: true,
              warning: "Tracking service temporarily unavailable. Please try again shortly.",
              fallbackTrackingNumber: trackingNumber,
            },
          );
        }

        return {
          success: false,
          tracking_number: trackingNumber,
          status: "Pending",
          current_status: "Pending",
          booking_office: null,
          delivery_office: null,
          consignee_name: null,
          consignee_address: null,
          origin: null,
          destination: null,
          current_location: null,
          estimated_delivery: null,
          delivery_progress: 0,
          history: [],
          events: [],
          meta: null,
          error: error instanceof Error ? error.message : "Tracking fetch failed",
        };
      }
    }),
  );

  return res.json({ success: true, count: results.length, results });
});

/**
 * GET /api/tracking/public/:trackingNumber
 * Public (no auth) endpoint: track a single parcel and return status + events.
 */
trackingRouter.get("/public/:trackingNumber", async (req: Request, res: Response) => {
  const trackingNumber = String(req.params.trackingNumber ?? "").trim().toUpperCase();
  if (!trackingNumber) return res.status(400).json({ success: false, error: "Invalid tracking number" });

  try {
    const result = await pythonTrackOne(trackingNumber, { includeRaw: true });
    return res.json(buildPublicTrackingResponse(result));
  } catch (e) {
    if (e instanceof PythonServiceUnavailableError || e instanceof PythonServiceTimeoutError) {
      return res.json(
        buildPublicTrackingResponse(
          {
            tracking_number: trackingNumber,
            status: "Pending",
            events: [],
            meta: { source: "degraded_mode" },
          },
          {
            degraded: true,
            warning: "Tracking service temporarily unavailable. Please try again shortly.",
            fallbackTrackingNumber: trackingNumber,
          },
        ),
      );
    }
    const msg = e instanceof Error ? e.message : "Tracking fetch failed";
    return res.status(500).json({ success: false, error: msg });
  }
});

trackingRouter.get("/:jobId", requireAuth, async (req, res) => {
  const userId = (req as AuthedRequest).user!.id;
  const job = await prisma.trackingJob.findFirst({ where: { id: req.params.jobId, userId } });
  if (!job) return res.status(404).json({ success: false, message: "Not found" });

  let result: unknown | null = null;
  if (job.resultPath) {
    const absPath = path.resolve(process.cwd(), job.resultPath);
    const allowedRoot = outputsDir();
    const relToRoot = path.relative(allowedRoot, absPath);
    if (!relToRoot.startsWith("..") && !path.isAbsolute(relToRoot)) {
      try {
        const raw = await fs.readFile(absPath, "utf8");
        result = JSON.parse(raw);
      } catch {
        result = null;
      }
    }
  }

  return res.json({ success: true, job, result });
});

trackingRouter.post("/complaint", requireAuth, async (req, res) => {
  const userId = (req as AuthedRequest).user!.id;
  const body = z
    .object({
      tracking_number: z.string().min(1).max(80),
      phone: z.string().min(7).max(30),
      complaint_text: z.string().max(2000).optional(),
      prefer_reply_mode: z.enum(["POST", "EMAIL", "SMS"]).optional(),
      reply_email: z.string().email().max(320).optional(),
      service_type: z.string().min(2).max(20).optional(),
      complaint_reason: z.string().min(1).max(120).optional(),
      recipient_city_value: z.string().min(1).max(80).optional(),
      sender_city_value: z.string().min(1).max(120).optional(),
      receiver_city_value: z.string().min(1).max(120).optional(),
      sender_name: z.string().min(1).max(160).optional(),
      sender_address: z.string().min(1).max(300).optional(),
      receiver_name: z.string().min(1).max(160).optional(),
      receiver_address: z.string().min(1).max(300).optional(),
      booking_office: z.string().min(1).max(160).optional(),
      recipient_district: z.string().min(1).max(80).optional(),
      recipient_tehsil: z.string().min(1).max(80).optional(),
      recipient_location: z.string().min(1).max(120).optional(),
      browser_session: z
        .object({
          cookies: z.string().max(20000).optional(),
          viewstate: z.string().max(20000).optional(),
          eventvalidation: z.string().max(20000).optional(),
        })
        .optional(),
    })
    .parse(req.body);

  const trackingNumber = body.tracking_number.trim();
  if (!trackingNumber) {
    return res.status(400).json({ success: false, message: "Article number is required." });
  }
  const inputPhone = String(body.phone ?? "").trim();
  const digitsOnlyPhone = inputPhone.replace(/\D+/g, "");
  const normalizedPhone = (() => {
    if (/^923\d{9}$/.test(digitsOnlyPhone)) return `0${digitsOnlyPhone.slice(2)}`;
    if (/^03\d{9}$/.test(digitsOnlyPhone)) return digitsOnlyPhone;
    if (/^3\d{9}$/.test(digitsOnlyPhone)) return `0${digitsOnlyPhone}`;
    if (digitsOnlyPhone.length >= 11) {
      const idx = digitsOnlyPhone.lastIndexOf("03");
      if (idx >= 0 && digitsOnlyPhone.length >= idx + 11) {
        const candidate = digitsOnlyPhone.slice(idx, idx + 11);
        if (/^03\d{9}$/.test(candidate)) return candidate;
      }
    }
    return digitsOnlyPhone;
  })();
  if (!normalizedPhone || normalizedPhone.length < 10) {
    return res.status(400).json({ success: false, message: "Please provide a valid phone number (03XXXXXXXXX or 923XXXXXXXXX)." });
  }
  const remarks = String(body.complaint_text ?? "").trim();
  if (!remarks) {
    return res.status(400).json({ success: false, message: "Remarks are required for complaint submission." });
  }
  const pick = (...values: unknown[]) => {
    for (const value of values) {
      const text = String(value ?? "").trim();
      if (text) return text;
    }
    return "";
  };

  // Complaint eligibility: Pending status, or manual pending override.
  const shipment = await prisma.shipment.findFirst({
    where: { userId, trackingNumber },
    select: {
      daysPassed: true,
      rawJson: true,
      trackingNumber: true,
      complaintStatus: true,
      complaintText: true,
      city: true,
      latestDate: true,
    },
  });

  const parseDueDateToTs = (input: string): number | null => {
    const value = String(input ?? "").trim();
    if (!value) return null;
    const slash = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slash) {
      const d = new Date(Number(slash[3]), Number(slash[2]) - 1, Number(slash[1]), 0, 0, 0, 0).getTime();
      return Number.isFinite(d) ? d : null;
    }
    const iso = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (iso) {
      const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 0, 0, 0, 0).getTime();
      return Number.isFinite(d) ? d : null;
    }
    const dash = value.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (dash) {
      const d = new Date(Number(dash[3]), Number(dash[2]) - 1, Number(dash[1]), 0, 0, 0, 0).getTime();
      return Number.isFinite(d) ? d : null;
    }
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : null;
  };

  const toDdMmYyyy = (input: string) => {
    const value = String(input ?? "").trim();
    if (!value) return "";
    const slash = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slash) return `${String(Number(slash[1])).padStart(2, "0")}-${String(Number(slash[2])).padStart(2, "0")}-${slash[3]}`;
    const dash = value.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (dash) return `${String(Number(dash[1])).padStart(2, "0")}-${String(Number(dash[2])).padStart(2, "0")}-${dash[3]}`;
    const iso = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (iso) return `${String(Number(iso[3])).padStart(2, "0")}-${String(Number(iso[2])).padStart(2, "0")}-${iso[1]}`;
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime())) return value;
    return `${String(parsed.getDate()).padStart(2, "0")}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${parsed.getFullYear()}`;
  };

  const parseStoredComplaintLifecycle = (textBlob: string, complaintStatus?: string | null) => {
    const id = textBlob.match(/COMPLAINT_ID\s*:\s*([A-Z0-9\-]+)/i)?.[1]
      ?? textBlob.match(/Complaint\s*ID\s*([A-Z0-9\-]+)/i)?.[1]
      ?? "";
    const due = textBlob.match(/DUE_DATE\s*:\s*([^\n|]+)/i)?.[1]
      ?? textBlob.match(/Due\s*Date\s*(?:on)?\s*([0-3]?\d\/[0-1]?\d\/\d{4})/i)?.[1]
      ?? "";
    const dueTs = parseDueDateToTs(String(due).trim());
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const active = String(complaintStatus ?? "").toUpperCase() === "FILED" && Boolean(id) && dueTs != null && dueTs >= today.getTime();
    return { active, id: String(id).trim(), dueDate: String(due).trim() };
  };

  let complaintAllowed = false;
  let complaintContext: {
    complainant_name: string;
    sender_name: string;
    sender_address: string;
    sender_city: string;
    sender_contact: string;
    booking_office: string;
    receiver_name: string;
    receiver_address: string;
    receiver_city: string;
    delivery_city: string;
    mapped_city: string;
    upload_name: string;
    upload_address: string;
    upload_consignee_name: string;
    upload_consignee_address: string;
    upload_consignee_city: string;
    profile_name: string;
    booking_date: string;
    service_type: string;
    complaint_reason: string;
    remarks: string;
    complaint_text: string;
    reply_mode: "POST" | "EMAIL" | "SMS";
    reply_email: string;
    recipient_city: string;
    recipient_district: string;
    recipient_tehsil: string;
    recipient_location: string;
  } | null = null;
  if (shipment) {
    const userProfile = await prisma.user.findUnique({
      where: { id: userId },
      select: { companyName: true, address: true, contactNumber: true, originCity: true, email: true },
    });
    let raw: Record<string, unknown> = {};
    try {
      raw = shipment.rawJson ? (JSON.parse(shipment.rawJson) as Record<string, unknown>) : {};
    } catch {
      raw = {};
    }
    const explicitMo = await getDbMoForTracking(userId, shipment.trackingNumber);
    const processed = processTracking(raw, { explicitMo, trackingNumber: shipment.trackingNumber });
    const manualPendingOverride = Boolean((raw as any)?.manual_pending_override);
    const pendingStatus = String(processed.systemStatus ?? processed.status ?? "").trim().toUpperCase().startsWith("PENDING");
    complaintAllowed = manualPendingOverride || pendingStatus;

    const trackingNode = ((raw as any)?.tracking && typeof (raw as any).tracking === "object")
      ? ((raw as any).tracking as Record<string, unknown>)
      : {};
    const senderCityFromUpload = pick(
      (raw as any)?.booking_city,
      (raw as any)?.BookingCity,
      (raw as any)?.booking_dmo,
      (raw as any)?.bookingDMO,
      (raw as any)?.sender_city,
      (raw as any)?.SenderCity,
      (raw as any)?.origin_city,
      (raw as any)?.OriginCity,
    );
    const senderCityFromTracking = pick(
      (trackingNode as any)?.booking_dmo,
      (trackingNode as any)?.bookingDMO,
      (trackingNode as any)?.booking_office,
      (trackingNode as any)?.booking_city,
      (raw as any)?.booking_office,
      (raw as any)?.bookingOffice,
      userProfile?.originCity,
    );
    const deliveryCityFromTracking = pick(
      (trackingNode as any)?.delivery_office,
      (trackingNode as any)?.delivery_city,
      (raw as any)?.delivery_office,
      (raw as any)?.deliveryOffice,
      shipment.city,
    );
    const deliveryDmo = pick(
      (trackingNode as any)?.delivery_dmo,
      (raw as any)?.delivery_dmo,
      (raw as any)?.deliveryDMO,
    );
    const senderName = pick(
      body.sender_name,
      userProfile?.companyName,
      (raw as any)?.sender_name,
      (raw as any)?.senderName,
      (raw as any)?.SenderName,
      (raw as any)?.booking_name,
      (raw as any)?.BookingName,
      "Unknown Sender",
    );
    const senderAddress = pick(
      body.sender_address,
      (raw as any)?.sender_address,
      (raw as any)?.senderAddress,
      (raw as any)?.SenderAddress,
      (raw as any)?.booking_address,
      (raw as any)?.BookingAddress,
      "-",
    );
    const senderContact = pick(
      userProfile?.contactNumber,
      (raw as any)?.sender_phone,
      (raw as any)?.senderPhone,
      (raw as any)?.SenderPhone,
      (raw as any)?.booking_phone,
      (raw as any)?.BookingPhone,
      normalizedPhone,
    );
    const receiverName = pick(
      body.receiver_name,
      (raw as any)?.consignee_name,
      (raw as any)?.consigneeName,
      (raw as any)?.receiver_name,
      (raw as any)?.receiverName,
      (trackingNode as any)?.consignee_name,
      (trackingNode as any)?.receiver_name,
      "-",
    );
    const receiverAddress = pick(
      body.receiver_address,
      (raw as any)?.consignee_address,
      (raw as any)?.consigneeAddress,
      (raw as any)?.receiver_address,
      (raw as any)?.receiverAddress,
      (trackingNode as any)?.consignee_address,
      (trackingNode as any)?.receiver_address,
      "-",
    );
    const senderCity = pick(body.sender_city_value, senderCityFromUpload, senderCityFromTracking);
    const receiverCity = pick(body.receiver_city_value, (raw as any)?.receiver_city, (raw as any)?.consigneeCity, (raw as any)?.ConsigneeCity, deliveryCityFromTracking, "-");
    const bookingDate = pick(
      (raw as any)?.booking_date,
      (raw as any)?.BookingDate,
      (trackingNode as any)?.booking_date,
      (trackingNode as any)?.bookingDate,
      (trackingNode as any)?.first_date,
      shipment.latestDate,
      new Date().toISOString().slice(0, 10),
    );
    const serviceTypeMap: Record<string, string> = {
      UMS: "UMS",
      UMO: "MOS",
      FMO: "FMO",
      EMS: "EMS",
      MOS: "MOS",
      VPP: "VPP",
      VPL: "VPL",
      COD: "COD",
      RL: "RGL",
      PR: "PAR",
    };
    const trackingUpper = trackingNumber.toUpperCase();
    const servicePrefix3 = trackingUpper.slice(0, 3);
    const servicePrefix2 = trackingUpper.slice(0, 2);
    const serviceType = pick(
      body.service_type,
      (raw as any)?.service_type,
      (raw as any)?.ServiceType,
      (raw as any)?.article_type,
      (raw as any)?.ArticleType,
      serviceTypeMap[servicePrefix3],
      serviceTypeMap[servicePrefix2],
      "VPL",
    );
    const recipientCity = pick(body.recipient_city_value);
    const recipientDistrict = pick(body.recipient_district);
    const recipientTehsil = pick(body.recipient_tehsil);
    const recipientLocation = pick(body.recipient_location);
    const replyMode = body.prefer_reply_mode ?? "POST";
    const replyEmail = pick(
      body.reply_email,
      userProfile?.email,
      (raw as any)?.sender_email,
      (raw as any)?.shipperEmail,
    );
    const bookingOffice = pick(body.booking_office, senderCityFromTracking, senderCity, "Pakistan Post");
    const complainantName = senderName;
    complaintContext = {
      complainant_name: complainantName,
      sender_name: senderName,
      sender_address: senderAddress,
      sender_city: senderCity,
      sender_contact: senderContact,
      booking_office: bookingOffice,
      receiver_name: receiverName,
      receiver_address: receiverAddress,
      receiver_city: receiverCity,
      delivery_city: deliveryCityFromTracking,
      mapped_city: recipientCity,
      upload_name: pick((raw as any)?.sender_name, (raw as any)?.senderName),
      upload_address: pick((raw as any)?.sender_address, (raw as any)?.senderAddress),
      upload_consignee_name: pick((raw as any)?.consignee_name, (raw as any)?.consigneeName),
      upload_consignee_address: pick((raw as any)?.consignee_address, (raw as any)?.consigneeAddress),
      upload_consignee_city: pick((raw as any)?.receiver_city, (raw as any)?.consigneeCity, (raw as any)?.ConsigneeCity),
      profile_name: pick(userProfile?.companyName),
      booking_date: bookingDate,
      service_type: serviceType,
      complaint_reason: pick(body.complaint_reason, remarks, "Pending Delivery"),
      remarks,
      complaint_text: remarks,
      reply_mode: replyMode,
      reply_email: replyEmail,
      recipient_city: recipientCity,
      recipient_district: recipientDistrict,
      recipient_tehsil: recipientTehsil,
      recipient_location: recipientLocation,
    };

    const _isMeaningless = (v: string) => !v.trim() || v.trim() === "-";
    const missingRequired = [
      !trackingNumber.trim() ? "ArticleNo" : "",
      _isMeaningless(complaintContext.sender_name) ? "SenderName" : "",
      _isMeaningless(complaintContext.receiver_name) ? "ReceiverName" : "",
      _isMeaningless(complaintContext.sender_address) ? "SenderAddress" : "",
      _isMeaningless(complaintContext.receiver_address) ? "ReceiverAddress" : "",
      !complaintContext.sender_city.trim() ? "SenderCity" : "",
      !complaintContext.receiver_city.trim() ? "ReceiverCity" : "",
      !complaintContext.recipient_district.trim() ? "District" : "",
      !complaintContext.recipient_tehsil.trim() ? "Tehsil" : "",
      !complaintContext.recipient_location.trim() ? "DeliveryOffice" : "",
      !normalizedPhone.trim() ? "Mobile" : "",
      !remarks.trim() ? "Remarks" : "",
    ].filter(Boolean);

    if (missingRequired.length > 0) {
      return res.status(400).json({
        success: false,
        status: "ERROR",
        tracking_id: trackingNumber,
        complaint_id: "",
        due_date: "",
        message: `Complaint submission failed due to missing required fields: ${missingRequired.join(", ")}`,
      });
    }

    const existing = parseStoredComplaintLifecycle(String(shipment.complaintText ?? ""), shipment.complaintStatus);
    if (existing.active) {
      return res.status(409).json({
        success: false,
        message: `Complaint already registered. Complaint ID: ${existing.id || "-"} Due Date: ${existing.dueDate || "-"}`,
        complaintId: existing.id || "",
        dueDate: toDdMmYyyy(existing.dueDate || ""),
        trackingId: trackingNumber,
        complaint_id: existing.id || "",
        due_date: toDdMmYyyy(existing.dueDate || ""),
        tracking_id: trackingNumber,
        status: "FILED",
      });
    }

    const duplicate = await findActiveComplaintDuplicate(userId, trackingNumber);
    if (duplicate.duplicate) {
      const duplicateDueDateText = duplicate.dueDate
        ? toDdMmYyyy(duplicate.dueDate.toISOString().slice(0, 10))
        : "";
      const duplicateStructuredParts = [
        duplicate.complaintId ? `COMPLAINT_ID: ${duplicate.complaintId}` : "",
        duplicateDueDateText ? `DUE_DATE: ${duplicateDueDateText}` : "",
        "COMPLAINT_STATE: ACTIVE",
      ].filter(Boolean);
      const duplicateStructured = `${duplicateStructuredParts.join(" | ")}\nUser complaint:\n${remarks}\n\nResponse:\nComplaint already active for this tracking number.`;

      await prisma.shipment.upsert({
        where: { userId_trackingNumber: { userId, trackingNumber } },
        create: {
          userId,
          trackingNumber,
          complaintStatus: "FILED",
          complaintText: duplicateStructured,
        },
        update: {
          complaintStatus: "FILED",
          complaintText: duplicateStructured,
        },
      });

      return res.status(409).json({
        success: false,
        message: `Complaint already active for tracking ${trackingNumber}`,
        complaintId: duplicate.complaintId || "",
        dueDate: duplicateDueDateText,
        trackingId: trackingNumber,
        complaint_id: duplicate.complaintId || "",
        due_date: duplicateDueDateText,
        tracking_id: trackingNumber,
        duplicate: true,
      });
    }
  }
  if (!shipment) {
    try {
      const live = await pythonTrackOne(trackingNumber, { includeRaw: true });
      const liveStatus = String(live?.status ?? "").trim().toUpperCase();
      complaintAllowed = liveStatus.startsWith("PENDING") || live?.complaint_eligible === true;
      const liveRaw = (live?.raw && typeof live.raw === "object") ? (live.raw as Record<string, unknown>) : {};
      const liveTracking = ((liveRaw as any)?.tracking && typeof (liveRaw as any).tracking === "object")
        ? ((liveRaw as any).tracking as Record<string, unknown>)
        : {};

      const senderName = pick(
        body.sender_name,
        (liveRaw as any)?.sender_name,
        (liveRaw as any)?.senderName,
        (liveTracking as any)?.sender_name,
        "Unknown Sender",
      );
      const senderAddress = pick(
        body.sender_address,
        (liveRaw as any)?.sender_address,
        (liveRaw as any)?.senderAddress,
        (liveTracking as any)?.sender_address,
        "-",
      );
      const senderCity = pick(
        body.sender_city_value,
        (liveRaw as any)?.booking_city,
        (liveTracking as any)?.booking_office,
        (liveRaw as any)?.booking_office,
        "Pakistan Post",
      );
      const receiverName = pick(
        body.receiver_name,
        (liveRaw as any)?.consignee_name,
        (liveRaw as any)?.receiver_name,
        (liveTracking as any)?.consignee_name,
        "-",
      );
      const receiverAddress = pick(
        body.receiver_address,
        (liveRaw as any)?.consignee_address,
        (liveRaw as any)?.receiver_address,
        (liveTracking as any)?.consignee_address,
        "-",
      );
      const receiverCity = pick(
        body.receiver_city_value,
        (liveRaw as any)?.receiver_city,
        (liveRaw as any)?.consigneeCity,
        (liveTracking as any)?.delivery_office,
        "-",
      );
      const recipientDistrict = pick(body.recipient_district);
      const recipientTehsil = pick(body.recipient_tehsil);
      const recipientLocation = pick(body.recipient_location);
      const bookingDate = pick(
        (liveRaw as any)?.booking_date,
        (liveTracking as any)?.booking_date,
        new Date().toISOString().slice(0, 10),
      );
      const liveServiceType = (() => {
        const upper = trackingNumber.toUpperCase();
        const map: Record<string, string> = {
          UMS: "UMS",
          UMO: "MOS",
          FMO: "FMO",
          EMS: "EMS",
          MOS: "MOS",
          VPP: "VPP",
          VPL: "VPL",
          COD: "COD",
          RL: "RGL",
          PR: "PAR",
        };
        return map[upper.slice(0, 3)] ?? map[upper.slice(0, 2)] ?? "VPL";
      })();
      const serviceType = pick(body.service_type, liveServiceType);

      complaintContext = {
        complainant_name: senderName,
        sender_name: senderName,
        sender_address: senderAddress,
        sender_city: senderCity,
        sender_contact: normalizedPhone,
        booking_office: pick(body.booking_office, senderCity, "Pakistan Post"),
        receiver_name: receiverName,
        receiver_address: receiverAddress,
        receiver_city: receiverCity,
        delivery_city: receiverCity,
        mapped_city: pick(body.recipient_city_value, receiverCity),
        upload_name: senderName,
        upload_address: senderAddress,
        upload_consignee_name: receiverName,
        upload_consignee_address: receiverAddress,
        upload_consignee_city: receiverCity,
        profile_name: senderName,
        booking_date: bookingDate,
        service_type: serviceType,
        complaint_reason: pick(body.complaint_reason, remarks, "Pending Delivery"),
        remarks,
        complaint_text: remarks,
        reply_mode: body.prefer_reply_mode ?? "POST",
        reply_email: pick(body.reply_email),
        recipient_city: pick(body.recipient_city_value, receiverCity),
        recipient_district: recipientDistrict,
        recipient_tehsil: recipientTehsil,
        recipient_location: recipientLocation,
      };
    } catch (liveErr) {
      console.error(`[ComplaintAPI] Live tracking bootstrap failed for ${trackingNumber}:`, liveErr instanceof Error ? liveErr.message : liveErr);
    }
  }
  if (!complaintAllowed) {
    return res.status(403).json({
      success: false,
      message: "Complaint is available only for pending shipments.",
    });
  }

  const complaintAllowance = await getComplaintAllowance(userId);
  if (complaintAllowance.dailyRemaining <= 0) {
    return res.status(429).json({
      success: false,
      message: `Daily complaint limit reached (${complaintAllowance.dailyLimit}/day).`,
    });
  }
  if (complaintAllowance.monthlyRemaining <= 0) {
    return res.status(429).json({
      success: false,
      message: `Monthly complaint limit reached (${complaintAllowance.monthlyLimit}/month).`,
    });
  }
  if (complaintAllowance.remainingUnits < COMPLAINT_UNIT_COST) {
    return res.status(402).json({
      success: false,
      message: "Insufficient units for complaint submission.",
    });
  }

  const complaintHistory = extractComplaintHistory(shipment?.complaintText, shipment?.complaintStatus, trackingNumber);
  const latestHistory = complaintHistory.length > 0 ? complaintHistory[complaintHistory.length - 1] : null;
  const attemptNumber = latestHistory ? Math.max(1, Number(latestHistory.attemptNumber ?? 1) + 1) : 1;
  const previousComplaintReference = String(latestHistory?.complaintId ?? "").trim();
  const previousDueDate = String(latestHistory?.dueDate ?? "").trim();
  const previousDueDateTs = parseDueDateToTs(previousDueDate);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const previousDueDatePassed = previousDueDateTs != null && previousDueDateTs < todayStart.getTime();

  const stripReopenAppendix = (input: string) => input
    .replace(/\n\n--- PREVIOUS COMPLAINT HISTORY ---[\s\S]*$/i, "")
    .replace(/\n\nPrevious Complaint IDs:[\s\S]*$/i, "")
    .trim();
  const baseRemarks = stripReopenAppendix(remarks);
  const reopenWarning = "Repeated unresolved complaint.\nClosing unresolved complaint without written legal response may result in escalation before PMG office, Consumer Court, or Federal Ombudsman.";
  const finalRemarks = attemptNumber > 1
    ? `${baseRemarks}\n\nPrevious Complaint IDs:\n${complaintHistory.map((entry) => entry.complaintId || "-").join("\n")}\n\nPrevious Due Dates:\n${complaintHistory.map((entry) => entry.dueDate || "-").join("\n")}\n\nPrevious Remarks:\n${complaintHistory.map((entry, index) => `${index + 1}. ${String(entry.userComplaint ?? "").trim() || "-"}`).join("\n")}\n\n${reopenWarning}`
    : baseRemarks;

  if (complaintContext) {
    complaintContext.remarks = finalRemarks;
    complaintContext.complaint_text = finalRemarks;
  }

  const payload: ComplaintQueuePayload = {
    tracking_number: trackingNumber,
    phone: normalizedPhone,
    complaint_text: finalRemarks,
    current_user_remarks: baseRemarks,
    attempt_number: attemptNumber,
    previous_complaint_reference: previousComplaintReference,
    sender_name: body.sender_name,
    sender_address: body.sender_address,
    sender_city_value: body.sender_city_value,
    receiver_name: body.receiver_name,
    receiver_address: body.receiver_address,
    receiver_city_value: body.receiver_city_value,
    receiver_contact: normalizedPhone,
    booking_date: complaintContext?.booking_date,
    booking_office: body.booking_office,
    complaint_reason: body.complaint_reason,
    prefer_reply_mode: body.prefer_reply_mode,
    reply_email: body.reply_email,
    service_type: body.service_type,
    recipient_city_value: body.recipient_city_value,
    recipient_district: body.recipient_district,
    recipient_tehsil: body.recipient_tehsil,
    recipient_location: body.recipient_location,
  };

  const queueRow = await enqueueComplaint({
    userId,
    trackingId: trackingNumber,
    payload,
    browserSession: body.browser_session ?? null,
  });

  const complaintJob = await prisma.trackingJob.create({
    data: {
      userId,
      kind: "COMPLAINT",
      status: "QUEUED",
      recordCount: 1,
      originalFilename: null,
      uploadPath: null,
    },
    select: { id: true, status: true },
  });

  await trackingQueue.add(
    "process-complaint",
    {
      jobId: complaintJob.id,
      kind: "COMPLAINT",
      queueId: queueRow.id,
      trackingNumber,
      phone: normalizedPhone,
      complaintText: finalRemarks,
    },
    { jobId: complaintJob.id },
  );

  await logComplaintAudit({
    actorEmail: String((req as any).user?.email ?? body.reply_email ?? normalizedPhone ?? "system").trim() || "system",
    action: "complaint_updated",
    trackingId: trackingNumber,
    details: `queue_id:${queueRow.id};job_id:${complaintJob.id};status:queued`,
  });

  return res.json({
    success: true,
    queued: true,
    jobId: complaintJob.id,
    trackingId: trackingNumber,
    tracking_id: trackingNumber,
    status: "QUEUED",
    message: "Complaint queued for worker processing.",
  });
});
