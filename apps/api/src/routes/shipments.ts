import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/auth.js";
import type { AuthedRequest } from "../middleware/auth.js";
import { pythonTrackBulk, PythonServiceUnavailableError, PythonServiceTimeoutError } from "../services/trackingService.js";
import { canonicalShipmentStatus, isComplaintEnabled, processTracking } from "../services/trackingStatus.js";
import { extractComplaintHistory, listComplaintRecords } from "../services/complaint.service.js";
import { persistTrackingIntelligence, refreshTrackingIntelligenceAggregates } from "../services/trackingIntelligence.js";
import { buildTrackingCycleAuditRecord } from "../services/trackingCycleAudit.js";
import { getTrackingCycleCorrections, saveTrackingCycleCorrections } from "../services/trackingCycleCorrections.js";
import { validateAndImportCycleAudit, parseCSV } from "../services/trackingCycleImport.js";

export const shipmentsRouter = Router();

shipmentsRouter.use(requireAuth);

const TRACKING_CACHE_TTL_MS = 10 * 60 * 1000;
let moTablesReady = false;

type MoneyOrderRow = {
  mo_number: string;
  tracking_number: string;
  segment_index?: number;
  amount?: number | null;
};

type MoneyOrderSummary = {
  numbers: string[];
  value: number;
};

async function ensureMoneyOrderTables() {
  if (moTablesReady) return;
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
      mo_amount REAL NOT NULL DEFAULT 0,
      commission REAL NOT NULL DEFAULT 0,
      gross_amount REAL NOT NULL DEFAULT 0,
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
  if (!hasColumn("mo_amount")) {
    await prisma.$executeRaw`ALTER TABLE money_orders ADD COLUMN IF NOT EXISTS mo_amount REAL NOT NULL DEFAULT 0`;
  }
  if (!hasColumn("commission")) {
    await prisma.$executeRaw`ALTER TABLE money_orders ADD COLUMN IF NOT EXISTS commission REAL NOT NULL DEFAULT 0`;
  }
  if (!hasColumn("gross_amount")) {
    await prisma.$executeRaw`ALTER TABLE money_orders ADD COLUMN IF NOT EXISTS gross_amount REAL NOT NULL DEFAULT 0`;
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
  moTablesReady = true;
}

async function getMoneyOrderMap(userId: string, trackingNumbers: string[]) {
  await ensureMoneyOrderTables();
  const uniqueTracking = Array.from(new Set(trackingNumbers.map((v) => String(v ?? "").trim()).filter(Boolean)));
  if (uniqueTracking.length === 0) return new Map<string, MoneyOrderSummary>();
  const rows = await prisma.$queryRaw<MoneyOrderRow[]>`
    SELECT mo_number,
           COALESCE(NULLIF(TRIM(tracking_id), ''), tracking_number) AS tracking_number,
           segment_index,
           amount
    FROM money_orders
    WHERE user_id = ${userId}
      AND COALESCE(NULLIF(TRIM(tracking_id), ''), tracking_number) IN (${Prisma.join(uniqueTracking)})
    ORDER BY tracking_number ASC, segment_index ASC, mo_number ASC
  `;
  const grouped = new Map<string, MoneyOrderSummary>();
  rows.forEach((row) => {
    const trackingNumber = String(row.tracking_number ?? "").trim();
    const moNumber = String(row.mo_number ?? "").trim();
    if (!trackingNumber || !moNumber) return;
    const current = grouped.get(trackingNumber) ?? { numbers: [], value: 0 };
    current.numbers.push(moNumber);
    current.value += Number(row.amount ?? 0) || 0;
    grouped.set(trackingNumber, current);
  });
  return grouped;
}

function parseRaw(rawJson?: string | null): Record<string, unknown> {
  if (!rawJson) return {};
  try {
    const parsed = JSON.parse(rawJson);
    if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
    return {};
  } catch {
    return {};
  }
}

function toAmount(rawJson?: string | null): number {
  if (!rawJson) return 0;
  try {
    const parsed = JSON.parse(rawJson);
    const val = parsed?.CollectAmount ?? parsed?.collect_amount ?? parsed?.collected_amount ?? parsed?.collectAmount ?? 0;

    if (typeof val === "string") {
      const match = val.match(/[\d,]+(?:\.\d+)?/);
      if (match) {
        const num = Number(match[0].replace(/,/g, ""));
        return Number.isFinite(num) ? num : 0;
      }
      return 0;
    }

    const num = Number(val);
    return Number.isFinite(num) ? num : 0;
  } catch {
    return 0;
  }
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

function resolveMoForDisplay(explicitSystemMo: string | null, processed: ReturnType<typeof processTracking>): string | null {
  if (!processed.moneyOrderIssued) return null;
  if (explicitSystemMo) return explicitSystemMo;
  if (processed.trackingMo && processed.trackingMo !== "-") return processed.trackingMo;
  return null;
}

function resolveMoValueForDisplay(fromDbValue: number | null | undefined, processed: ReturnType<typeof processTracking>): number | null {
  if (typeof fromDbValue === "number" && Number.isFinite(fromDbValue) && fromDbValue > 0) {
    return fromDbValue;
  }
  if (typeof processed.collectedAmount === "number" && Number.isFinite(processed.collectedAmount) && processed.collectedAmount > 0) {
    return processed.collectedAmount;
  }
  return null;
}

function resolvePersistedStatus(raw: Record<string, unknown>, computedStatus: unknown): "DELIVERED" | "PENDING" | "RETURN" {
  const manual = normalizeManualStatus((raw as any).manual_status);
  if (manual) return manual;
  const computed = canonicalShipmentStatus(String(computedStatus ?? "").trim(), null);
  if (computed === "DELIVERED") return "DELIVERED";
  if (computed === "RETURN") return "RETURN";
  return "PENDING";
}

function resolveConsigneeFields(raw: Record<string, unknown>) {
  const tracking = raw.tracking && typeof raw.tracking === "object"
    ? raw.tracking as Record<string, unknown>
    : {};

  return {
    consignee_name: String(
      raw.receiver_name ??
      raw.receiverName ??
      raw.consignee_name ??
      raw.consigneeName ??
      tracking.receiver_name ??
      tracking.consignee_name ??
      "",
    ).trim() || null,
    consignee_address: String(
      raw.receiver_address ??
      raw.receiverAddress ??
      raw.consignee_address ??
      raw.consigneeAddress ??
      tracking.receiver_address ??
      tracking.consignee_address ??
      "",
    ).trim() || null,
    consignee_phone: String(
      raw.receiver_phone ??
      raw.receiverPhone ??
      raw.consignee_phone ??
      raw.consigneePhone ??
      tracking.receiver_phone ??
      tracking.consignee_phone ??
      "",
    ).trim() || null,
  };
}

type ShipmentEvent = { date: string; time: string; location: string; description: string; ts: number | null };

function parseShipmentEvents(raw: Record<string, unknown>): ShipmentEvent[] {
  const tracking = raw.tracking && typeof raw.tracking === "object" ? raw.tracking as Record<string, unknown> : undefined;
  const events = (tracking?.events as Array<Record<string, unknown>> | undefined) ?? (raw.events as Array<Record<string, unknown>> | undefined) ?? [];
  if (!Array.isArray(events)) return [];

  return events
    .map((ev) => {
      const date = String(ev?.date ?? "").trim();
      const time = String(ev?.time ?? "00:00").trim() || "00:00";
      const location = String(ev?.location ?? ev?.city ?? "").trim();
      const description = String(ev?.description ?? ev?.detail ?? ev?.status ?? "").trim();
      const d = new Date(`${date} ${time}`);
      return { date, time, location, description, ts: Number.isFinite(d.getTime()) ? d.getTime() : null };
    })
    .filter((ev) => ev.date || ev.time || ev.location || ev.description)
    .sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));
}

function hasForwardReverseReturnFlow(events: ShipmentEvent[]): boolean {
  if (events.length === 0) return false;
  let forwardStage = 0;
  let reverseStage = 0;
  for (const ev of events) {
    const blob = `${ev.location} ${ev.description}`.toLowerCase();
    const isBooking = blob.includes("booking") || blob.includes("booked");
    const isDmo = blob.includes("dmo") || blob.includes("dispatch") || blob.includes("arrived at") || blob.includes("received at");
    const isDelivery = blob.includes("delivery") || blob.includes("out for delivery") || blob.includes("delivery office");

    if (forwardStage === 0 && isBooking) {
      forwardStage = 1;
      continue;
    }
    if (forwardStage === 1 && isDmo) {
      forwardStage = 2;
      continue;
    }
    if (forwardStage === 2 && isDelivery) {
      forwardStage = 3;
      continue;
    }

    if (forwardStage >= 3) {
      if (reverseStage === 0 && isDelivery) {
        reverseStage = 1;
        continue;
      }
      if (reverseStage === 1 && isDmo) {
        reverseStage = 2;
        continue;
      }
      if (reverseStage === 2 && isBooking) {
        reverseStage = 3;
        break;
      }
    }
  }
  return forwardStage >= 3 && reverseStage >= 3;
}

function hasReturnLatestEventRule(raw: Record<string, unknown>): boolean {
  const events = parseShipmentEvents(raw);
  if (events.length === 0) return false;
  const latest = [...events].sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0))[0];
  const d = String(latest?.description ?? "").toLowerCase();
  const isLatestReturnEvent =
    d.includes("delivered to sender") ||
    d.includes("returned to booking office") ||
    d.includes("received at booking dmo after return");
  if (!isLatestReturnEvent) return false;
  return hasForwardReverseReturnFlow(events);
}

function normalizeFinalShipmentStatusForStats(input: unknown): "DELIVERED" | "DELIVERED WITH PAYMENT" | "RETURNED" | "PENDING" {
  const raw = String(input ?? "").trim().toUpperCase();
  if (!raw) return "PENDING";
  if (raw === "DELIVERED WITH PAYMENT") return "DELIVERED WITH PAYMENT";
  if (raw.includes("DELIVER")) return "DELIVERED";
  if (raw.includes("RETURN") || raw.includes("RTO")) return "RETURNED";
  return "PENDING";
}

function deriveFinalShipmentStatusForStats(shipment: { status: string | null; rawJson: string | null }): "DELIVERED" | "DELIVERED WITH PAYMENT" | "RETURNED" | "PENDING" {
  const raw = parseRaw(shipment.rawJson);
  const manual = normalizeManualStatus((raw as Record<string, unknown>).manual_status);
  if (manual === "RETURN") return "RETURNED";
  if (manual === "DELIVERED") return "DELIVERED";
  if (manual === "PENDING") return "PENDING";

  const preferredStatus = String(
    (raw as Record<string, unknown>).final_status
    ?? (raw as Record<string, unknown>).system_status
    ?? (raw as Record<string, unknown>).System_Status
    ?? shipment.status
    ?? "",
  ).trim();

  const normalized = normalizeFinalShipmentStatusForStats(preferredStatus);
  if (normalized !== "RETURNED") return normalized;
  return hasReturnLatestEventRule(raw) ? "RETURNED" : "PENDING";
}

function normalizeComplaintLifecycleState(state: string): "ACTIVE" | "IN_PROCESS" | "RESOLVED" | "CLOSED" {
  const token = String(state ?? "").trim().toUpperCase().replace(/[\-_]+/g, " ");
  if (!token) return "ACTIVE";
  if (["RESOLVED", "RESOLVE"].includes(token)) return "RESOLVED";
  if (["CLOSED", "CLOSE", "REJECTED", "REJECT", "ERROR", "FAILED"].includes(token)) return "CLOSED";
  if (["IN PROCESS", "INPROCESS", "PROCESSING", "PENDING", "DUPLICATE", "OPEN"].includes(token)) return "IN_PROCESS";
  return "ACTIVE";
}

shipmentsRouter.get("/stats", async (req, res) => {
  const userId = (req as AuthedRequest).user!.id;
  try {
    await ensureMoneyOrderTables();
  } catch (err) {
    console.log("Failed to ensure money order tables:", err instanceof Error ? err.message : err);
  }

  let shipments: Array<{ trackingNumber: string; status: string | null; daysPassed: number | null; rawJson: string | null; createdAt: Date }> = [];
  try {
    shipments = await prisma.shipment.findMany({
      where: { userId },
      select: { trackingNumber: true, status: true, daysPassed: true, rawJson: true, createdAt: true },
    });
  } catch (err) {
    console.log("Database unavailable for shipments, returning empty data:", err instanceof Error ? err.message : err);
  }

  let complaintRecords: Awaited<ReturnType<typeof listComplaintRecords>> = [];
  try {
    complaintRecords = await listComplaintRecords({ userId });
  } catch (err) {
    console.log("Failed to fetch complaint records for stats:", err instanceof Error ? err.message : err);
  }

  const byStatus: Record<string, number> = {};
  const byDate: Record<string, { total: number; byStatus: Record<string, number> }> = {};
  let total = 0;
  let delivered = 0;
  let pending = 0;
  let returned = 0;
  let delayed = 0;
  let totalAmount = 0;
  let deliveredAmount = 0;
  let pendingAmount = 0;
  let returnedAmount = 0;
  let delayedAmount = 0;
  let trackingUsed = 0;
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const shipmentAmounts = new Map<string, number>();
  const shipmentStatuses = new Map<string, "DELIVERED" | "DELIVERED WITH PAYMENT" | "RETURNED" | "PENDING">();

  for (const s of shipments) {
    const key = deriveFinalShipmentStatusForStats(s);
    total += 1;
    byStatus[key] = (byStatus[key] ?? 0) + 1;
    const amt = toAmount(s.rawJson);
    shipmentAmounts.set(s.trackingNumber, amt);
    shipmentStatuses.set(s.trackingNumber, key);

    if (key === "DELIVERED" || key === "DELIVERED WITH PAYMENT") {
      delivered += 1;
      deliveredAmount += amt;
    } else if (key === "RETURNED") {
      returned += 1;
      returnedAmount += amt;
    } else {
      pending += 1;
      pendingAmount += amt;
    }
    if (isComplaintEnabled(s.daysPassed, key) && key === "PENDING") {
      delayed += 1;
      delayedAmount += amt;
    }
    if (s.createdAt >= monthStart) trackingUsed += 1;
    totalAmount += amt;

    const date = new Date(s.createdAt).toISOString().split("T")[0];
    if (!byDate[date]) {
      byDate[date] = { total: 0, byStatus: {} };
    }
    byDate[date].total++;
    byDate[date].byStatus[key] = (byDate[date].byStatus[key] ?? 0) + 1;
  }

  let complaintAmount = 0;
  let complaintTotal = 0;
  let complaintActive = 0;
  let complaintInProcess = 0;
  let complaintResolved = 0;
  let complaintClosed = 0;
  let complaintReopened = 0;
  let complaintActiveAmount = 0;
  let complaintInProcessAmount = 0;
  let complaintResolvedAmount = 0;
  let complaintClosedAmount = 0;
  let complaintReopenedAmount = 0;
  let complaintWatch = 0;
  let complaintWatchAmount = 0;
  for (const record of complaintRecords) {
    const trackingId = String(record.trackingId ?? "").trim();
    const amount = shipmentAmounts.get(trackingId) ?? 0;
    complaintAmount += amount;
    const history = extractComplaintHistory(record.complaintText, record.complaintStatus, trackingId);
    const totalAttempts = Math.max(1, history.length || 1);
    complaintTotal += totalAttempts;

    const lifecycleState = normalizeComplaintLifecycleState(record.state);
    if (lifecycleState === "ACTIVE") {
      complaintActive += 1;
      complaintActiveAmount += amount;
    }
    if (lifecycleState === "IN_PROCESS") {
      complaintInProcess += 1;
      complaintInProcessAmount += amount;
    }
    if (lifecycleState === "RESOLVED") {
      complaintResolved += 1;
      complaintResolvedAmount += amount;
    }
    if (lifecycleState === "CLOSED") {
      complaintClosed += 1;
      complaintClosedAmount += amount;
    }
    if (totalAttempts > 1) {
      complaintReopened += 1;
      complaintReopenedAmount += amount;
    }

    if (record.active && shipmentStatuses.get(trackingId) === "PENDING") {
      complaintWatch += 1;
      complaintWatchAmount += amount;
    }
  }

  const graphData = Object.keys(byDate)
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
    .map((date) => ({
      date,
      total: byDate[date].total,
      byStatus: byDate[date].byStatus,
    }));

  return res.json({
    success: true,
    total,
    delivered,
    pending,
    returned,
    undelivered: byStatus.UNDELIVERED ?? 0,
    outForDelivery: 0,
    delayed,
    byStatus,
    totalAmount,
    deliveredAmount,
    pendingAmount,
    returnedAmount,
    delayedAmount,
    trackingUsed,
    graphData,
    complaintAmount,
    complaints: complaintTotal,
    complaintWatch,
    complaintWatchAmount,
    complaintActive,
    complaintInProcess,
    complaintResolved,
    complaintClosed,
    complaintReopened,
    complaintActiveAmount,
    complaintInProcessAmount,
    complaintResolvedAmount,
    complaintClosedAmount,
    complaintReopenedAmount,
  });
});

shipmentsRouter.get("/", async (req, res) => {
  const userId = (req as AuthedRequest).user!.id;
  const query = z
    .object({
      status: z.string().optional(),
      q: z.string().optional(),
      page: z.coerce.number().optional(),
      limit: z.coerce.number().optional(),
    })
    .parse(req.query);

  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(200, Math.max(1, query.limit ?? 50));
  const status = query.status?.trim();
  const q = query.q?.trim();

  const where = {
    userId,
    ...(status ? { status } : {}),
    ...(q
      ? {
          trackingNumber: { contains: q },
        }
      : {}),
  } as const;

  const [total, shipments] = await Promise.all([
    prisma.shipment.count({ where }),
    prisma.shipment.findMany({
      where,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  const moMap = await getMoneyOrderMap(
    userId,
    shipments.map((s) => s.trackingNumber),
  );

  const enriched = shipments.map((shipment) => {
    const fromDb = moMap.get(shipment.trackingNumber) ?? null;
    const raw = parseRaw(shipment.rawJson);
    const consignee = resolveConsigneeFields(raw);
    const explicitSystemMo = fromDb && fromDb.numbers.length > 0 ? fromDb.numbers.join(", ") : null;
    const processed = processTracking(raw, { explicitMo: explicitSystemMo, trackingNumber: shipment.trackingNumber });
    const preferredStatus = String(
      (raw as Record<string, unknown>).final_status
      ?? (raw as Record<string, unknown>).system_status
      ?? (raw as Record<string, unknown>).System_Status
      ?? processed.systemStatus
      ?? processed.status
      ?? shipment.status
      ?? "",
    ).trim();
    const canonicalStatus = resolvePersistedStatus(raw, preferredStatus);
    const manualStatus = normalizeManualStatus((raw as any).manual_status);
    const manualOverrideActive = Boolean((raw as any).manual_override) && Boolean(manualStatus);
    const statusForRaw = manualOverrideActive ? canonicalStatus : processed.systemStatus;
    const moIssued = resolveMoForDisplay(explicitSystemMo, processed);
    const moValue = resolveMoValueForDisplay(fromDb?.value ?? null, processed);
    const mergedRaw = JSON.stringify({
      ...raw,
      collected_amount: normalizeCollectedAmount((raw as any)?.collected_amount ?? (raw as any)?.collect_amount ?? (raw as any)?.CollectAmount),
      final_status: canonicalStatus,
      System_Status: statusForRaw,
      system_status: statusForRaw,
      resolved_delivery_office: processed.resolvedDeliveryOffice,
      tracking_category: processed.trackingCategory,
      complaint_eligible: canonicalStatus === "PENDING" ? true : processed.complaintEligible,
      MOS_Number: moIssued ?? "-",
      mos_number: moIssued ?? "-",
      moIssuedNumber: moIssued ?? undefined,
      moneyOrderIssued: processed.moneyOrderIssued,
      moIssuedValue: moValue ?? undefined,
      trackingMo: processed.trackingMo,
      systemMo: processed.systemMo,
      moMatch: processed.moMatch,
    });
    return {
      ...shipment,
      status: canonicalStatus,
      city: processed.resolvedDeliveryOffice && processed.resolvedDeliveryOffice !== "-"
        ? processed.resolvedDeliveryOffice
        : shipment.city,
      ...consignee,
      rawJson: mergedRaw,
      moIssued,
      moneyOrderIssued: processed.moneyOrderIssued,
      moValue,
    };
  });

  return res.json({ success: true, total, page, limit, shipments: enriched });
});

shipmentsRouter.post("/diff", async (req, res) => {
  const userId = (req as AuthedRequest).user!.id;
  const body = z
    .object({
      rows: z.array(z.object({
        trackingNumber: z.string().min(1),
        updatedAt: z.string().min(1),
      })).max(5000),
    })
    .parse(req.body ?? {});

  const clientRows = body.rows ?? [];
  const clientMap = new Map(
    clientRows.map((row) => [String(row.trackingNumber).trim(), String(row.updatedAt).trim()]),
  );

  const trackingNumbers = Array.from(clientMap.keys());
  if (trackingNumbers.length === 0) {
    return res.json({ success: true, changedRows: [], unchangedCount: 0 });
  }

  const serverRows = await prisma.shipment.findMany({
    where: { userId, trackingNumber: { in: trackingNumbers } },
    select: { trackingNumber: true, updatedAt: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  const changedTrackingNumbers: string[] = [];
  let unchangedCount = 0;

  for (const row of serverRows) {
    const trackingNumber = String(row.trackingNumber ?? "").trim();
    const serverUpdatedAt = row.updatedAt.toISOString();
    const clientUpdatedAt = clientMap.get(trackingNumber) ?? "";
    if (serverUpdatedAt !== clientUpdatedAt) {
      changedTrackingNumbers.push(trackingNumber);
    } else {
      unchangedCount += 1;
    }
  }

  if (changedTrackingNumbers.length === 0) {
    return res.json({ success: true, changedRows: [], unchangedCount });
  }

  const changedRows = await prisma.shipment.findMany({
    where: { userId, trackingNumber: { in: changedTrackingNumbers } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  const moMap = await getMoneyOrderMap(
    userId,
    changedRows.map((s) => s.trackingNumber),
  );

  const enrichedChangedRows = changedRows.map((shipment) => {
    const fromDb = moMap.get(shipment.trackingNumber) ?? null;
    const raw = parseRaw(shipment.rawJson);
    const consignee = resolveConsigneeFields(raw);
    const explicitSystemMo = fromDb && fromDb.numbers.length > 0 ? fromDb.numbers.join(", ") : null;
    const processed = processTracking(raw, { explicitMo: explicitSystemMo, trackingNumber: shipment.trackingNumber });
    const preferredStatus = String(
      (raw as Record<string, unknown>).final_status
      ?? (raw as Record<string, unknown>).system_status
      ?? (raw as Record<string, unknown>).System_Status
      ?? processed.systemStatus
      ?? processed.status
      ?? shipment.status
      ?? "",
    ).trim();
    const canonicalStatus = resolvePersistedStatus(raw, preferredStatus);
    const manualStatus = normalizeManualStatus((raw as any).manual_status);
    const manualOverrideActive = Boolean((raw as any).manual_override) && Boolean(manualStatus);
    const statusForRaw = manualOverrideActive ? canonicalStatus : processed.systemStatus;
    const moIssued = resolveMoForDisplay(explicitSystemMo, processed);
    const moValue = resolveMoValueForDisplay(fromDb?.value ?? null, processed);
    return {
      ...shipment,
      status: canonicalStatus,
      city: processed.resolvedDeliveryOffice && processed.resolvedDeliveryOffice !== "-"
        ? processed.resolvedDeliveryOffice
        : shipment.city,
      ...consignee,
      rawJson: JSON.stringify({
        ...raw,
        collected_amount: normalizeCollectedAmount((raw as any)?.collected_amount ?? (raw as any)?.collect_amount ?? (raw as any)?.CollectAmount),
        final_status: canonicalStatus,
        System_Status: statusForRaw,
        system_status: statusForRaw,
        resolved_delivery_office: processed.resolvedDeliveryOffice,
        tracking_category: processed.trackingCategory,
        complaint_eligible: canonicalStatus === "PENDING" ? true : processed.complaintEligible,
        MOS_Number: moIssued ?? "-",
        mos_number: moIssued ?? "-",
        moIssuedNumber: moIssued ?? undefined,
        moneyOrderIssued: processed.moneyOrderIssued,
        moIssuedValue: moValue ?? undefined,
        trackingMo: processed.trackingMo,
        systemMo: processed.systemMo,
        moMatch: processed.moMatch,
      }),
      moIssued,
      moneyOrderIssued: processed.moneyOrderIssued,
      moValue,
    };
  });

  return res.json({ success: true, changedRows: enrichedChangedRows, unchangedCount });
});

shipmentsRouter.get("/cycle-audit", requireAdmin, async (req, res) => {
  const userId = (req as AuthedRequest).user!.id;
  const query = z
    .object({
      sample: z.coerce.number().optional(),
      mode: z.enum(["latest", "random"]).optional(),
    })
    .parse(req.query ?? {});

  const sample = Math.max(1, Math.min(100, query.sample ?? 100));
  const mode = query.mode ?? "latest";

  const fetched = await prisma.shipment.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    take: mode === "random" ? 500 : sample,
    select: {
      trackingNumber: true,
      status: true,
      rawJson: true,
      updatedAt: true,
    },
  });

  const rows = mode === "random"
    ? [...fetched].sort(() => Math.random() - 0.5).slice(0, sample)
    : fetched.slice(0, sample);

  const corrections = await getTrackingCycleCorrections();
  const audit = rows.map((row) => buildTrackingCycleAuditRecord(
    {
      trackingNumber: row.trackingNumber,
      currentStatus: row.status,
      rawJson: row.rawJson,
    },
    {
      trackingOverrides: corrections.tracking_overrides,
      issueOverrides: corrections.issue_overrides,
    },
  ));

  const mismatchCount = audit.filter((row) => row.correction_required).length;
  return res.json({
    success: true,
    mode,
    sample,
    mismatchCount,
    generatedAt: new Date().toISOString(),
    audit,
  });
});

shipmentsRouter.post("/cycle-audit/corrections", requireAdmin, async (req, res) => {
  const userId = (req as AuthedRequest).user!.id;
  const body = z
    .object({
      corrections: z.array(
        z.object({
          tracking_number: z.string().min(1),
          expected_status: z.enum(["DELIVERED", "RETURNED", "PENDING", "DELIVERED WITH PAYMENT"]).optional(),
          cycle_detected: z.enum(["Cycle 1", "Cycle 2", "Cycle 3", "Cycle Unknown"]).optional(),
          missing_steps: z.array(z.string().min(1)).optional(),
          reason: z.string().optional(),
          issue_code: z.string().optional(),
          apply_to_issue_code: z.boolean().optional(),
        }),
      ).min(1).max(200),
    })
    .parse(req.body ?? {});

  const saved = await saveTrackingCycleCorrections(body.corrections as any);

  // Persist correction note in shipment rawJson for traceability without schema change.
  await Promise.all(
    body.corrections.map(async (row) => {
      const trackingNumber = String(row.tracking_number ?? "").trim().toUpperCase();
      if (!trackingNumber) return;
      const shipments = await prisma.shipment.findMany({
        where: { userId, trackingNumber },
        select: { id: true, rawJson: true },
      });

      await Promise.all(shipments.map((shipment) => {
        const raw = parseRaw(shipment.rawJson);
        return prisma.shipment.update({
          where: { id: shipment.id },
          data: {
            rawJson: JSON.stringify({
              ...raw,
              tracking_cycle_correction: {
                expected_status: row.expected_status,
                cycle_detected: row.cycle_detected,
                missing_steps: row.missing_steps,
                reason: row.reason,
                issue_code: row.issue_code,
                corrected_at: new Date().toISOString(),
              },
            }),
          },
        });
      }));
    }),
  );

  const trackingSet = new Set(body.corrections.map((row) => String(row.tracking_number).trim().toUpperCase()));
  const refreshedRows = await prisma.shipment.findMany({
    where: { userId, trackingNumber: { in: Array.from(trackingSet) } },
    select: { trackingNumber: true, status: true, rawJson: true },
  });
  const corrections = await getTrackingCycleCorrections();
  const reprocessed = refreshedRows.map((row) => buildTrackingCycleAuditRecord(
    {
      trackingNumber: row.trackingNumber,
      currentStatus: row.status,
      rawJson: row.rawJson,
    },
    {
      trackingOverrides: corrections.tracking_overrides,
      issueOverrides: corrections.issue_overrides,
    },
  ));

  return res.json({
    success: true,
    saved,
    reprocessed,
  });
});

shipmentsRouter.post("/cycle-audit/reprocess", requireAdmin, async (req, res) => {
  const userId = (req as AuthedRequest).user!.id;
  const body = z
    .object({
      tracking_numbers: z.array(z.string().min(1)).optional(),
      limit: z.coerce.number().optional(),
    })
    .parse(req.body ?? {});

  const trackingNumbers = Array.from(new Set((body.tracking_numbers ?? []).map((row) => row.trim().toUpperCase()).filter(Boolean)));
  const limit = Math.max(1, Math.min(100, body.limit ?? 100));

  const rows = await prisma.shipment.findMany({
    where: {
      userId,
      ...(trackingNumbers.length > 0 ? { trackingNumber: { in: trackingNumbers } } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
    select: { trackingNumber: true, status: true, rawJson: true },
  });

  const corrections = await getTrackingCycleCorrections();
  const reprocessed = rows.map((row) => buildTrackingCycleAuditRecord(
    {
      trackingNumber: row.trackingNumber,
      currentStatus: row.status,
      rawJson: row.rawJson,
    },
    {
      trackingOverrides: corrections.tracking_overrides,
      issueOverrides: corrections.issue_overrides,
    },
  ));

  return res.json({
    success: true,
    count: reprocessed.length,
    reprocessed,
  });
});

shipmentsRouter.post("/cycle-audit/import", requireAdmin, async (req, res) => {
  const body = z
    .object({
      csv_text: z.string().min(10),
    })
    .parse(req.body ?? {});

  try {
    const csvRows = parseCSV(body.csv_text);
    if (csvRows.length === 0) {
      return res.status(400).json({
        success: false,
        message: "CSV contains no data rows",
      });
    }

    const result = await validateAndImportCycleAudit(csvRows);
    return res.json(result);
  } catch (err) {
    return res.status(400).json({
      success: false,
      message: err instanceof Error ? err.message : "CSV import failed",
    });
  }
});

shipmentsRouter.get("/:id", async (req, res) => {
  const userId = (req as AuthedRequest).user!.id;
  const param = String(req.params.id ?? "").trim();
  if (!param) return res.status(400).json({ success: false, message: "Invalid identifier" });

  const shipment = await prisma.shipment.findFirst({
    where: { userId, OR: [{ id: param }, { trackingNumber: param }] },
  });
  if (!shipment) return res.status(404).json({ success: false, message: "Not found" });
  const moMap = await getMoneyOrderMap(userId, [shipment.trackingNumber]);
  const fromDb = moMap.get(shipment.trackingNumber) ?? null;
  const raw = parseRaw(shipment.rawJson);
  const explicitSystemMo = fromDb && fromDb.numbers.length > 0 ? fromDb.numbers.join(", ") : null;
  const processed = processTracking(raw, { explicitMo: explicitSystemMo, trackingNumber: shipment.trackingNumber });
  const canonicalStatus = resolvePersistedStatus(raw, shipment.status ?? processed.status);
  const manualStatus = normalizeManualStatus((raw as any).manual_status);
  const manualOverrideActive = Boolean((raw as any).manual_override) && Boolean(manualStatus);
  const statusForRaw = manualOverrideActive ? canonicalStatus : processed.systemStatus;
  const moIssued = resolveMoForDisplay(explicitSystemMo, processed);
  const moValue = resolveMoValueForDisplay(fromDb?.value ?? null, processed);
  return res.json({
    success: true,
    shipment: {
      ...shipment,
      status: canonicalStatus,
      rawJson: JSON.stringify({
        ...raw,
        collected_amount: normalizeCollectedAmount((raw as any)?.collected_amount ?? (raw as any)?.collect_amount ?? (raw as any)?.CollectAmount),
        final_status: canonicalStatus,
        System_Status: statusForRaw,
        system_status: statusForRaw,
        resolved_delivery_office: processed.resolvedDeliveryOffice,
        tracking_category: processed.trackingCategory,
        complaint_eligible: canonicalStatus === "PENDING" ? true : processed.complaintEligible,
        MOS_Number: moIssued ?? "-",
        mos_number: moIssued ?? "-",
        moIssuedNumber: moIssued ?? undefined,
        moneyOrderIssued: processed.moneyOrderIssued,
        moIssuedValue: moValue ?? undefined,
        trackingMo: processed.trackingMo,
        systemMo: processed.systemMo,
        moMatch: processed.moMatch,
      }),
      moIssued,
      moneyOrderIssued: processed.moneyOrderIssued,
      moValue,
    },
  });
});

shipmentsRouter.patch("/:id", async (req, res) => {
  const userId = (req as AuthedRequest).user!.id;
  const param = String(req.params.id ?? "").trim();
  if (!param) return res.status(400).json({ success: false, message: "Invalid identifier" });

  const normalizedBody = {
    ...(req.body ?? {}),
    status:
      String((req.body as any)?.status ?? "").trim().toUpperCase() === "RETURNED"
        ? "RETURN"
        : (req.body as any)?.status,
  };

  const body = z
    .object({
      status: z.enum(["DELIVERED", "PENDING", "RETURN"]),
    })
    .parse(normalizedBody);

  const currentTargets = await prisma.shipment.findMany({
    where: { userId, OR: [{ id: param }, { trackingNumber: param }] },
    select: { id: true, trackingNumber: true, rawJson: true },
  });

  if (currentTargets.length === 0) return res.status(404).json({ success: false, message: "Not found" });

  const updated = await prisma.shipment.updateMany({
    where: { userId, OR: [{ id: param }, { trackingNumber: param }] },
    data: { status: body.status },
  });

  if (updated.count === 0) return res.status(404).json({ success: false, message: "Not found" });

  const targets = currentTargets.map((row) => ({ id: row.id, rawJson: row.rawJson }));

  await Promise.all(
    targets.map((row) => {
      const raw = parseRaw(row.rawJson);
      const manualPending = body.status === "PENDING";
      return prisma.shipment.update({
        where: { id: row.id },
        data: {
          rawJson: JSON.stringify({
            ...raw,
            final_status: body.status,
            system_status: body.status,
            System_Status: body.status,
            manual_override: true,
            manual_status: body.status,
            manual_pending_override: manualPending,
            complaint_eligible: manualPending ? true : (raw as any)?.complaint_eligible,
          }),
        },
      });
    }),
  );

  return res.json({ success: true, status: body.status });
});

shipmentsRouter.delete("/:id", async (req, res) => {
  const userId = (req as AuthedRequest).user!.id;
  const param = String(req.params.id ?? "").trim();
  if (!param) return res.status(400).json({ success: false, message: "Invalid identifier" });

  const deleted = await prisma.shipment.deleteMany({
    where: { userId, OR: [{ id: param }, { trackingNumber: param }] },
  });
  return res.json({ success: true, deleted: deleted.count });
});

shipmentsRouter.post("/refresh-pending", async (req, res) => {
  const userId = (req as AuthedRequest).user!.id;
  const body = z
    .object({
      trackingNumbers: z.array(z.string().min(1)).optional(),
      force: z.boolean().optional(),
    })
    .parse(req.body ?? {});

  const requested = (body.trackingNumbers ?? []).map((t) => t.trim()).filter(Boolean);
  const requestedUnique = Array.from(new Set(requested));
  const pendingStatuses = ["PENDING"];

  const shipments = await prisma.shipment.findMany({
    where: {
      userId,
      ...(requestedUnique.length > 0 ? { trackingNumber: { in: requestedUnique } } : { status: { in: pendingStatuses } }),
    },
    orderBy: { updatedAt: "desc" },
    take: 500,
  });

  const moMap = await getMoneyOrderMap(
    userId,
    shipments.map((s) => s.trackingNumber),
  );

  const chargedUnits = 0;
  let cachedCount = 0;
  let refreshedCount = 0;
  const now = Date.now();
  const details: Array<{ trackingNumber: string; refreshed: boolean; cached: boolean; charged: boolean; status: string }> = [];

  // ── Phase 1: Classify: cache-hit vs needs-refresh ──────────────────────────
  type ShipmentRow = (typeof shipments)[number];
  const needsRefresh: ShipmentRow[] = [];
  for (const shipment of shipments) {
    const raw = parseRaw(shipment.rawJson);
    const cacheAt = Number(raw?.trackingCacheAt ?? 0);
    const hasCache = Number.isFinite(cacheAt) && now - cacheAt < TRACKING_CACHE_TTL_MS;
    if (hasCache && body.force !== true) {
      cachedCount += 1;
      details.push({
        trackingNumber: shipment.trackingNumber,
        refreshed: false,
        cached: true,
        charged: false,
        status: canonicalShipmentStatus(shipment.status, null),
      });
    } else {
      needsRefresh.push(shipment);
    }
  }

  console.log(
    `[BulkTracking] Cache pre-filter (DB) | total=${shipments.length} cached=${cachedCount} non_cached=${needsRefresh.length}`,
  );

  // ── Phase 2: Refresh eligibility (no unit charging on refresh paths) ───────
  const approvedForFetch: ShipmentRow[] = [...needsRefresh];

  // ── Phase 3: BULK FETCH — single Python call for all approved tracking IDs ─
  const bulkTrackingNumbers = approvedForFetch.map((s) => s.trackingNumber);
  const bulkResultMap = new Map<string, Awaited<ReturnType<typeof pythonTrackBulk>>[number]>();
  let bulkError: unknown = null;
  if (bulkTrackingNumbers.length > 0) {
    console.log(`[BulkTracking] Fetching ${bulkTrackingNumbers.length} non-cached IDs in batched bulk mode`);
    try {
      const bulkResults = await pythonTrackBulk(bulkTrackingNumbers, {
        includeRaw: true,
        batchSize: 100,
        batchTimeoutMs: 120_000,
      });
      for (const r of bulkResults) {
        bulkResultMap.set(r.tracking_number.trim().toUpperCase(), r);
      }
      console.log(`[BulkTracking] Bulk fetch complete: ${bulkResults.length} results received`);
    } catch (e) {
      bulkError = e;
      console.error(`[BulkTracking] Bulk fetch failed:`, e);
    }
  }

  // If the tracking service is down, return an unavailable response.
  if (bulkError instanceof PythonServiceUnavailableError || bulkError instanceof PythonServiceTimeoutError) {
    return res.status(503).json({
      success: false,
      error: bulkError instanceof Error ? bulkError.message : "Tracking service unavailable",
    });
  }

  // ── Phase 4: Process each result from the bulk map ─────────────────────────
  for (const shipment of approvedForFetch) {
    const trackingNumber = shipment.trackingNumber;
    const charged = false;

    const tracked = bulkResultMap.get(trackingNumber.trim().toUpperCase()) ?? null;
    if (!tracked || bulkError) {
      details.push({
        trackingNumber,
        refreshed: false,
        cached: false,
        charged: false,
        status: canonicalShipmentStatus(shipment.status, null),
      });
      continue;
    }

    try {
      const raw = parseRaw(shipment.rawJson);
      const fromDbMo = moMap.get(trackingNumber) ?? null;
      const explicitSystemMo = fromDbMo && fromDbMo.numbers.length > 0 ? fromDbMo.numbers.join(", ") : null;
      const trackedRaw = tracked.raw ?? null;
      const collectedAmount = normalizeCollectedAmount(
        (raw as any)?.collected_amount ??
        (raw as any)?.collect_amount ??
        (raw as any)?.CollectAmount ??
        (trackedRaw as any)?.collected_amount ??
        (trackedRaw as any)?.collect_amount ??
        (trackedRaw as any)?.CollectAmount,
      );
      const processed = processTracking(
        { ...raw, tracking: trackedRaw, collected_amount: collectedAmount },
        { explicitMo: explicitSystemMo, trackingNumber },
      );
      const moIssued = resolveMoForDisplay(explicitSystemMo, processed);
      const moValue = resolveMoValueForDisplay(fromDbMo?.value ?? null, processed);
      const mergedRaw: Record<string, unknown> = {
        ...raw,
        TrackingID: String(raw?.TrackingID ?? trackingNumber).trim(),
        tracking: trackedRaw,
        tracking_patch: (tracked as any)?.meta ?? undefined,
        collected_amount: collectedAmount,
        booking_office: (tracked.raw as any)?.booking_office ?? raw?.booking_office,
        delivery_office: (tracked.raw as any)?.delivery_office ?? raw?.delivery_office,
        resolved_delivery_office: processed.resolvedDeliveryOffice,
        trackingCacheAt: now,
        system_status: processed.systemStatus,
        System_Status: processed.systemStatus,
        tracking_category: processed.trackingCategory,
        complaint_eligible: processed.complaintEligible,
        MOS_Number: moIssued ?? "-",
        mos_number: moIssued ?? "-",
        trackingMo: processed.trackingMo,
        systemMo: processed.systemMo,
        moMatch: processed.moMatch,
        moIssuedNumber: moIssued ?? undefined,
        moneyOrderIssued: processed.moneyOrderIssued,
        moIssuedValue: moIssued ? moValue ?? undefined : undefined,
      };

      const normalized = resolvePersistedStatus(raw, processed.status);
      const manualStatus = normalizeManualStatus((raw as any).manual_status);
      const manualOverrideActive = Boolean((raw as any).manual_override) && Boolean(manualStatus);
      if (manualOverrideActive) {
        mergedRaw.system_status = normalized;
        mergedRaw.System_Status = normalized;
        mergedRaw.final_status = normalized;
        mergedRaw.complaint_eligible = normalized === "PENDING" ? true : processed.complaintEligible;
      } else {
        mergedRaw.final_status = normalized;
      }
      await prisma.shipment.update({
        where: { id: shipment.id },
        data: {
          status: normalized,
          city: tracked.city ?? shipment.city,
          latestDate: tracked.latest_date ?? shipment.latestDate,
          latestTime: tracked.latest_time ?? shipment.latestTime,
          daysPassed: tracked.days_passed ?? shipment.daysPassed,
          rawJson: JSON.stringify(mergedRaw),
        },
      });
      try {
        await persistTrackingIntelligence({
          userId,
          trackingNumber,
          shipmentStatus: normalized,
          rawData: trackedRaw,
          processed,
        });
      } catch (intelligenceError) {
        console.warn(`[TrackingIntelligence] skip ${trackingNumber}:`, intelligenceError);
      }

      refreshedCount += 1;
      details.push({ trackingNumber, refreshed: true, cached: false, charged, status: normalized });
    } catch {
      details.push({
        trackingNumber,
        refreshed: false,
        cached: false,
        charged: false,
        status: canonicalShipmentStatus(shipment.status, null),
      });
    }
  }

  try {
    await refreshTrackingIntelligenceAggregates(userId);
  } catch (intelligenceError) {
    console.warn("[TrackingIntelligence] aggregate refresh skipped:", intelligenceError);
  }

  return res.json({
    success: true,
    total: shipments.length,
    refreshed: refreshedCount,
    cached: cachedCount,
    chargedUnits,
    cacheTtlSeconds: TRACKING_CACHE_TTL_MS / 1000,
    details,
  });
});

shipmentsRouter.post("/batch-delete", async (req, res) => {
  const userId = (req as AuthedRequest).user!.id;
  const body = z.object({ trackingNumbers: z.array(z.string().min(1)).min(1).max(500) }).parse(req.body);
  const deleted = await prisma.shipment.deleteMany({
    where: { userId, trackingNumber: { in: body.trackingNumbers.map((t) => t.trim()) } },
  });
  return res.json({ success: true, deleted: deleted.count });
});
