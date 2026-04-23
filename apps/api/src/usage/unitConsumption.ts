import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { monthKeyUTC } from "./month.js";

export const COMPLAINT_UNIT_COST = 5;

export type UnitActionType = "label" | "tracking" | "money_order" | "complaint";

type UnitRequest = {
  actionType: UnitActionType;
  requestKey: string;
  unitsUsed?: number;
};

type ConsumeResult = { ok: true; remainingUnits: number; idempotent?: boolean } | { ok: false; reason: string };

export type UnitSnapshot = {
  month: string;
  labelLimit: number;
  trackingLimit: number;
  labelsGenerated: number;
  labelsQueued: number;
  trackingGenerated: number;
  trackingQueued: number;
  remainingUnits: number;
};

export type ComplaintAllowance = {
  planName: string | null;
  dailyLimit: number;
  dailyUsed: number;
  dailyRemaining: number;
  unitsPerComplaint: number;
  remainingUnits: number;
  trackingRemaining: number;
};

let usageLogsReady = false;

function getRequestUnits(request: UnitRequest) {
  return Math.max(1, request.unitsUsed ?? 1);
}

function isTrackingScopedAction(actionType: UnitActionType) {
  return actionType === "tracking";
}

function getComplaintDailyLimit(planName: string | null | undefined) {
  return String(planName ?? "").toLowerCase().includes("free") ? 1 : 5;
}

function isClosedConnectionError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /connection is closed|Can't reach database server|P1001/i.test(message);
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

async function ensureUsageLogsTable() {
  if (usageLogsReady) return;
  await prisma.$executeRaw`
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
  `;
  await prisma.$executeRaw`
    CREATE UNIQUE INDEX IF NOT EXISTS usage_logs_unique_request ON usage_logs(user_id, action_type, request_key)
  `;
  usageLogsReady = true;
}

export async function getLatestUnitSnapshot(userId: string): Promise<UnitSnapshot> {
  await prisma.$connect();
  const month = monthKeyUTC();

  return withReconnectRetry(async () => {
    const [subscription, user, usage] = await Promise.all([
      prisma.subscription.findFirst({
        where: { userId, status: "ACTIVE" },
        include: { plan: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.user.findUnique({
        where: { id: userId },
        select: { extraLabelCredits: true, extraTrackingCredits: true },
      }),
      prisma.usageMonthly.findUnique({ where: { userId_month: { userId, month } } }),
    ]);

    const labelsGenerated = usage?.labelsGenerated ?? 0;
    const labelsQueued = usage?.labelsQueued ?? 0;
    const trackingGenerated = usage?.trackingGenerated ?? 0;
    const trackingQueued = usage?.trackingQueued ?? 0;
    const labelLimit = (subscription?.plan?.monthlyLabelLimit ?? 0) + (user?.extraLabelCredits ?? 0);
    const trackingLimit =
      (subscription?.plan?.monthlyTrackingLimit ?? subscription?.plan?.monthlyLabelLimit ?? 0) +
      (user?.extraTrackingCredits ?? 0);

    return {
      month,
      labelLimit,
      trackingLimit,
      labelsGenerated,
      labelsQueued,
      trackingGenerated,
      trackingQueued,
      remainingUnits: Math.max(0, labelLimit - (labelsGenerated + labelsQueued)),
    };
  });
}

export async function consumeUnit(userId: string, actionType: UnitActionType, requestKey: string): Promise<ConsumeResult> {
  return consumeUnits(userId, [{ actionType, requestKey }]);
}

export async function getComplaintAllowance(userId: string): Promise<ComplaintAllowance> {
  await prisma.$connect();
  await withReconnectRetry(async () => {
    await ensureUsageLogsTable();
  });

  return withReconnectRetry(async () => {
    const month = monthKeyUTC();
    const [subscription, user, usage, complaintCountRows] = await Promise.all([
      prisma.subscription.findFirst({
        where: { userId, status: "ACTIVE" },
        include: { plan: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.user.findUnique({
        where: { id: userId },
        select: { extraLabelCredits: true, extraTrackingCredits: true },
      }),
      prisma.usageMonthly.findUnique({ where: { userId_month: { userId, month } } }),
      prisma.$queryRaw<Array<{ count: number }>>`
        SELECT COUNT(*)::int AS count
        FROM usage_logs
        WHERE user_id = ${userId}
          AND action_type = 'complaint'
          AND status = 'CONSUMED'
          AND DATE(created_at::timestamp) = DATE(NOW() AT TIME ZONE 'UTC')
      `,
    ]);

    const labelLimit = (subscription?.plan?.monthlyLabelLimit ?? 0) + (user?.extraLabelCredits ?? 0);
    const trackingLimit =
      (subscription?.plan?.monthlyTrackingLimit ?? subscription?.plan?.monthlyLabelLimit ?? 0) +
      (user?.extraTrackingCredits ?? 0);
    const labelsGenerated = usage?.labelsGenerated ?? 0;
    const labelsQueued = usage?.labelsQueued ?? 0;
    const trackingGenerated = usage?.trackingGenerated ?? 0;
    const trackingQueued = usage?.trackingQueued ?? 0;
    const remainingUnits = Math.max(0, labelLimit - (labelsGenerated + labelsQueued));
    const trackingRemaining = Math.max(0, trackingLimit - (trackingGenerated + trackingQueued));
    const dailyLimit = getComplaintDailyLimit(subscription?.plan?.name ?? null);
    const dailyUsed = complaintCountRows[0]?.count ?? 0;

    return {
      planName: subscription?.plan?.name ?? null,
      dailyLimit,
      dailyUsed,
      dailyRemaining: Math.max(0, dailyLimit - dailyUsed),
      unitsPerComplaint: COMPLAINT_UNIT_COST,
      remainingUnits,
      trackingRemaining,
    };
  });
}

export async function consumeUnits(
  userId: string,
  requests: UnitRequest[],
): Promise<ConsumeResult> {
  if (requests.length === 0) return { ok: true, remainingUnits: 0, idempotent: true };
  await prisma.$connect();
  await withReconnectRetry(async () => {
    await ensureUsageLogsTable();
  });

  try {
    return await withReconnectRetry(async () => prisma.$transaction(async (tx) => {
      const subscription = await tx.subscription.findFirst({
        where: { userId, status: "ACTIVE" },
        include: { plan: true, user: { select: { extraLabelCredits: true, extraTrackingCredits: true } } },
      });

      if (!subscription || !subscription.plan) {
        return { ok: false, reason: "No active plan" };
      }

      if (new Date() > subscription.currentPeriodEnd) {
        return { ok: false, reason: "Plan Expired" };
      }

      const month = monthKeyUTC();
      const totalUnits = subscription.plan.monthlyLabelLimit + (subscription.user.extraLabelCredits ?? 0);
      const totalTrackingUnits =
        (subscription.plan.monthlyTrackingLimit ?? subscription.plan.monthlyLabelLimit ?? 0) +
        (subscription.user.extraTrackingCredits ?? 0);

      const existing = await tx.$queryRaw<Array<{ action_type: string; request_key: string; status: string }>>`
        SELECT action_type, request_key, status FROM usage_logs WHERE user_id = ${userId}
      `;
      const existingMap = new Map(existing.map((row) => [`${row.action_type}::${row.request_key}`, row.status]));
      const pendingRequests = requests.filter(
        (r) => !existingMap.has(`${r.actionType}::${r.requestKey}`),
      );
      const totalQueuedUnits = pendingRequests.reduce((sum, request) => sum + getRequestUnits(request), 0);
      const trackingQueuedUnits = pendingRequests.reduce(
        (sum, request) => sum + (isTrackingScopedAction(request.actionType) ? getRequestUnits(request) : 0),
        0,
      );

      const usageBefore = await tx.usageMonthly.findUnique({ where: { userId_month: { userId, month } } });
      const dbUsedBefore = (usageBefore?.labelsGenerated ?? 0) + (usageBefore?.labelsQueued ?? 0);
      const dbUnits = Math.max(0, totalUnits - dbUsedBefore);
      console.log("[UNITS_RUNTIME]", { userId, dbUnits, requiredUnits: totalQueuedUnits });

      if (pendingRequests.length === 0) {
        const usage = usageBefore ?? ({ labelsGenerated: 0, labelsQueued: 0 } as const);
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
      const usedTrackingUnits = (usage.trackingGenerated ?? 0) + (usage.trackingQueued ?? 0);
      console.log("Units consumed:", usedUnits);
      if (usedUnits > totalUnits) {
        throw new Error("Insufficient Units");
      }
      if (usedTrackingUnits > totalTrackingUnits) {
        throw new Error("Insufficient Tracking Units");
      }

      for (const req of pendingRequests) {
        await tx.$executeRaw`
          INSERT INTO usage_logs (id, user_id, action_type, units_used, request_key, status)
          VALUES (${randomUUID()}, ${userId}, ${req.actionType}, ${getRequestUnits(req)}, ${req.requestKey}, 'CONSUMED')
          ON CONFLICT (user_id, action_type, request_key) DO NOTHING
        `;
      }

      return { ok: true, remainingUnits: Math.max(0, totalUnits - usedUnits) };
    }));
  } catch (e) {
    if (e instanceof Error && e.message === "Insufficient Units") {
      return { ok: false, reason: "Insufficient Units" };
    }
    if (e instanceof Error && e.message === "Insufficient Tracking Units") {
      return { ok: false, reason: "Insufficient Tracking Units" };
    }
    return { ok: false, reason: e instanceof Error ? e.message : "Unit consumption failed" };
  }
}

export async function recordUnitsUsed(userId: string, requests: UnitRequest[]): Promise<ConsumeResult> {
  if (requests.length === 0) return { ok: true, remainingUnits: 0, idempotent: true };
  await prisma.$connect();
  await withReconnectRetry(async () => {
    await ensureUsageLogsTable();
  });

  try {
    return await withReconnectRetry(async () => prisma.$transaction(async (tx) => {
      const subscription = await tx.subscription.findFirst({
        where: { userId, status: "ACTIVE" },
        include: { plan: true, user: { select: { extraLabelCredits: true, extraTrackingCredits: true } } },
      });

      if (!subscription || !subscription.plan) {
        return { ok: false, reason: "No active plan" };
      }

      if (new Date() > subscription.currentPeriodEnd) {
        return { ok: false, reason: "Plan Expired" };
      }

      const month = monthKeyUTC();
      const totalUnits = subscription.plan.monthlyLabelLimit + (subscription.user.extraLabelCredits ?? 0);
      const totalTrackingUnits =
        (subscription.plan.monthlyTrackingLimit ?? subscription.plan.monthlyLabelLimit ?? 0) +
        (subscription.user.extraTrackingCredits ?? 0);
      const existing = await tx.$queryRaw<Array<{ action_type: string; request_key: string; status: string }>>`
        SELECT action_type, request_key, status FROM usage_logs WHERE user_id = ${userId}
      `;
      const existingMap = new Map(existing.map((row) => [`${row.action_type}::${row.request_key}`, row.status]));
      const pendingRequests = requests.filter(
        (request) => !existingMap.has(`${request.actionType}::${request.requestKey}`),
      );

      const totalUsedUnits = pendingRequests.reduce((sum, request) => sum + getRequestUnits(request), 0);
      const trackingUsedUnits = pendingRequests.reduce(
        (sum, request) => sum + (isTrackingScopedAction(request.actionType) ? getRequestUnits(request) : 0),
        0,
      );
      const usageBefore = await tx.usageMonthly.findUnique({ where: { userId_month: { userId, month } } });

      if (pendingRequests.length === 0) {
        const usage = usageBefore ?? ({ labelsGenerated: 0, labelsQueued: 0 } as const);
        const remaining = Math.max(0, totalUnits - ((usage.labelsGenerated ?? 0) + (usage.labelsQueued ?? 0)));
        return { ok: true, remainingUnits: remaining, idempotent: true };
      }

      const usage = await tx.usageMonthly.upsert({
        where: { userId_month: { userId, month } },
        create: {
          userId,
          month,
          labelsGenerated: totalUsedUnits,
          trackingGenerated: trackingUsedUnits,
        },
        update: {
          labelsGenerated: { increment: totalUsedUnits },
          trackingGenerated: { increment: trackingUsedUnits },
        },
      });

      const usedUnits = (usage.labelsGenerated ?? 0) + (usage.labelsQueued ?? 0);
      const usedTrackingUnits = (usage.trackingGenerated ?? 0) + (usage.trackingQueued ?? 0);
      if (usedUnits > totalUnits) {
        throw new Error("Insufficient Units");
      }
      if (usedTrackingUnits > totalTrackingUnits) {
        throw new Error("Insufficient Tracking Units");
      }

      for (const request of pendingRequests) {
        await tx.$executeRaw`
          INSERT INTO usage_logs (id, user_id, action_type, units_used, request_key, status)
          VALUES (${randomUUID()}, ${userId}, ${request.actionType}, ${getRequestUnits(request)}, ${request.requestKey}, 'CONSUMED')
          ON CONFLICT (user_id, action_type, request_key) DO NOTHING
        `;
      }

      return { ok: true, remainingUnits: Math.max(0, totalUnits - usedUnits) };
    }));
  } catch (e) {
    if (e instanceof Error && e.message === "Insufficient Units") {
      return { ok: false, reason: "Insufficient Units" };
    }
    if (e instanceof Error && e.message === "Insufficient Tracking Units") {
      return { ok: false, reason: "Insufficient Tracking Units" };
    }
    return { ok: false, reason: e instanceof Error ? e.message : "Unit consumption failed" };
  }
}

export async function refundUnit(userId: string, actionType: UnitActionType, requestKey: string): Promise<void> {
  await refundUnits(userId, [{ actionType, requestKey }]);
}

export async function refundUnits(
  userId: string,
  requests: UnitRequest[],
): Promise<void> {
  if (requests.length === 0) return;
  await prisma.$connect();
  await withReconnectRetry(async () => {
    await ensureUsageLogsTable();
  });

  const month = monthKeyUTC();
  await withReconnectRetry(async () => prisma.$transaction(async (tx) => {
    for (const req of requests) {
      await tx.$executeRaw`
        UPDATE usage_logs
        SET status = 'REFUNDED', refunded_at = CURRENT_TIMESTAMP
        WHERE user_id = ${userId} AND action_type = ${req.actionType} AND request_key = ${req.requestKey} AND status = 'CONSUMED'
      `;
    }

    const totalQueuedUnits = requests.reduce((sum, request) => sum + getRequestUnits(request), 0);
    const trackingQueuedUnits = requests.reduce(
      (sum, request) => sum + (isTrackingScopedAction(request.actionType) ? getRequestUnits(request) : 0),
      0,
    );
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
  }));
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
