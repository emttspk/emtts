import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
import { monthKeyUTC } from "./month.js";

export type UnitActionType = "label" | "tracking" | "money_order";

type ConsumeResult = { ok: true; remainingUnits: number; idempotent?: boolean } | { ok: false; reason: string };

let usageLogsReady = false;

async function ensureUsageLogsTable() {
  if (usageLogsReady) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS usage_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      action_type TEXT NOT NULL,
      units_used INTEGER NOT NULL DEFAULT 1,
      request_key TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'CONSUMED',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      refunded_at TEXT
    )
  `);
  await prisma.$executeRawUnsafe(
    "CREATE UNIQUE INDEX IF NOT EXISTS usage_logs_unique_request ON usage_logs(user_id, action_type, request_key)",
  );
  usageLogsReady = true;
}

export async function consumeUnit(userId: string, actionType: UnitActionType, requestKey: string): Promise<ConsumeResult> {
  return consumeUnits(userId, [{ actionType, requestKey }]);
}

export async function consumeUnits(
  userId: string,
  requests: Array<{ actionType: UnitActionType; requestKey: string }>,
): Promise<ConsumeResult> {
  if (requests.length === 0) return { ok: true, remainingUnits: 0, idempotent: true };
  await ensureUsageLogsTable();

  try {
    return await prisma.$transaction(async (tx) => {
      const subscription = await tx.subscription.findFirst({
        where: { userId, status: "ACTIVE" },
        include: { plan: true, user: { select: { extraLabelCredits: true } } },
      });

      if (!subscription || !subscription.plan) {
        return { ok: false, reason: "No active plan" };
      }

      if (new Date() > subscription.currentPeriodEnd) {
        return { ok: false, reason: "Plan Expired" };
      }

      const month = monthKeyUTC();
      const totalUnits = subscription.plan.monthlyLabelLimit + (subscription.user.extraLabelCredits ?? 0);

      const existing = await tx.$queryRawUnsafe<Array<{ action_type: string; request_key: string; status: string }>>(
        `SELECT action_type, request_key, status FROM usage_logs WHERE user_id = ?`,
        userId,
      );
      const existingMap = new Map(existing.map((row) => [`${row.action_type}::${row.request_key}`, row.status]));
      const pendingRequests = requests.filter(
        (r) => !existingMap.has(`${r.actionType}::${r.requestKey}`),
      );
      const totalQueuedUnits = pendingRequests.length;
      const trackingQueuedUnits = pendingRequests.filter((r) => r.actionType === "tracking").length;

      if (pendingRequests.length === 0) {
        const usage =
          (await tx.usageMonthly.findUnique({ where: { userId_month: { userId, month } } })) ??
          ({ labelsGenerated: 0, labelsQueued: 0 } as const);
        const remaining = Math.max(0, totalUnits - ((usage.labelsGenerated ?? 0) + (usage.labelsQueued ?? 0)));
        return { ok: true, remainingUnits: remaining, idempotent: true };
      }

      const usage = await tx.usageMonthly.upsert({
        where: { userId_month: { userId, month } },
        create: {
          userId,
          month,
          labelsQueued: totalQueuedUnits,
          trackingQueued: trackingQueuedUnits,
        },
        update: {
          labelsQueued: { increment: totalQueuedUnits },
          trackingQueued: { increment: trackingQueuedUnits },
        },
      });

      const usedUnits = (usage.labelsGenerated ?? 0) + (usage.labelsQueued ?? 0);
      console.log("Units consumed:", usedUnits);
      if (usedUnits > totalUnits) {
        throw new Error("Insufficient Units");
      }

      for (const req of pendingRequests) {
        await tx.$executeRawUnsafe(
          `INSERT OR IGNORE INTO usage_logs (id, user_id, action_type, units_used, request_key, status) VALUES (?, ?, ?, 1, ?, 'CONSUMED')`,
          randomUUID(),
          userId,
          req.actionType,
          req.requestKey,
        );
      }

      return { ok: true, remainingUnits: Math.max(0, totalUnits - usedUnits) };
    });
  } catch (e) {
    if (e instanceof Error && e.message === "Insufficient Units") {
      return { ok: false, reason: "Insufficient Units" };
    }
    return { ok: false, reason: e instanceof Error ? e.message : "Unit consumption failed" };
  }
}

export async function refundUnit(userId: string, actionType: UnitActionType, requestKey: string): Promise<void> {
  await refundUnits(userId, [{ actionType, requestKey }]);
}

export async function refundUnits(
  userId: string,
  requests: Array<{ actionType: UnitActionType; requestKey: string }>,
): Promise<void> {
  if (requests.length === 0) return;
  await ensureUsageLogsTable();

  const month = monthKeyUTC();
  await prisma.$transaction(async (tx) => {
    for (const req of requests) {
      await tx.$executeRawUnsafe(
        `UPDATE usage_logs SET status = 'REFUNDED', refunded_at = CURRENT_TIMESTAMP WHERE user_id = ? AND action_type = ? AND request_key = ? AND status = 'CONSUMED'`,
        userId,
        req.actionType,
        req.requestKey,
      );
    }

    const totalQueuedUnits = requests.length;
    const trackingQueuedUnits = requests.filter((req) => req.actionType === "tracking").length;
    const data: {
      labelsQueued?: { decrement: number };
      trackingQueued?: { decrement: number };
    } = {};

    if (totalQueuedUnits > 0) {
      data.labelsQueued = { decrement: totalQueuedUnits };
    }
    if (trackingQueuedUnits > 0) {
      data.trackingQueued = { decrement: trackingQueuedUnits };
    }

    await tx.usageMonthly.updateMany({
      where: {
        userId,
        month,
        labelsQueued: { gte: totalQueuedUnits },
        ...(trackingQueuedUnits > 0 ? { trackingQueued: { gte: trackingQueuedUnits } } : {}),
      },
      data,
    });
  });
}

export async function refundUnitsByAmount(userId: string, units: number): Promise<void> {
  if (units <= 0) return;
  const month = monthKeyUTC();
  await prisma.usageMonthly.updateMany({
    where: {
      userId,
      month,
      labelsQueued: { gte: units },
    },
    data: {
      labelsQueued: { decrement: units },
    },
  });
}
