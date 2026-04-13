import { prisma } from '../prisma.js';

type LimitResult = { ok: true; reason: '' } | { ok: false; reason: string };

function limitError(reason: string): LimitResult {
  return { ok: false, reason };
}

function limitOk(): LimitResult {
  return { ok: true, reason: '' };
}

/**
 * Checks if adding a certain number of labels is within the user's monthly limit
 * and atomically increments the queued count if it is.
 * This function is designed to be rolled back by the caller if a subsequent
 * operation fails.
 */
export async function assertWithinMonthlyLimit(userId: string, count: number) {
  const month = new Date().toISOString().slice(0, 7); // YYYY-MM

  try {
    return await prisma.$transaction(async tx => {
      const subscription = await tx.subscription.findFirst({
        where: { userId, status: 'ACTIVE' },
        include: { plan: true, user: { select: { extraLabelCredits: true } } },
      });

      if (!subscription || !subscription.plan) {
        return limitError('No active subscription found.');
      }

      const limit = subscription.plan.monthlyLabelLimit + (subscription.user.extraLabelCredits ?? 0);

      // Upsert and update in one go to get the current state atomically
      const usage = await tx.usageMonthly.upsert({
        where: { userId_month: { userId, month } },
        create: {
          userId,
          month,
          labelsQueued: count,
        },
        update: {
          labelsQueued: { increment: count },
        },
      });

      const totalUsed = usage.labelsGenerated + usage.labelsQueued;

      if (totalUsed > limit) {
        // This will cause the transaction to roll back the increment
        throw new Error(
          `Adding ${count} labels would exceed your monthly limit of ${limit}. You have used ${
            usage.labelsGenerated + usage.labelsQueued - count
          } labels.`,
        );
      }

      return limitOk();
    });
  } catch (e) {
    if (e instanceof Error) {
      return limitError(e.message);
    }
    return limitError('An unknown error occurred during limit check.');
  }
}

export async function assertWithinTrackingLimit(userId: string, count: number) {
  const month = new Date().toISOString().slice(0, 7);

  try {
    return await prisma.$transaction(async tx => {
      const subscription = await tx.subscription.findFirst({
        where: { userId, status: 'ACTIVE' },
        include: { plan: true, user: { select: { extraLabelCredits: true } } },
      });

      if (!subscription || !subscription.plan) {
        return limitError('No active subscription found.');
      }

      const limit = subscription.plan.monthlyLabelLimit + (subscription.user.extraLabelCredits ?? 0);
      const usage = await tx.usageMonthly.upsert({
        where: { userId_month: { userId, month } },
        create: {
          userId,
          month,
          labelsQueued: count,
          trackingQueued: count,
        },
        update: {
          labelsQueued: { increment: count },
          trackingQueued: { increment: count },
        },
      });

      const totalUsed = usage.labelsGenerated + usage.labelsQueued;
      if (totalUsed > limit) {
        throw new Error(
          `Adding ${count} tracking records would exceed your monthly unit limit of ${limit}. You have used ${
            usage.labelsGenerated + usage.labelsQueued - count
          } units.`,
        );
      }

      return limitOk();
    });
  } catch (e) {
    if (e instanceof Error) {
      return limitError(e.message);
    }
    return limitError('An unknown error occurred during tracking limit check.');
  }
}

/**
 * Moves a number of labels from "queued" to "generated" status for the current month.
 */
export async function finalizeQueuedToGenerated(userId: string, count: number) {
  const month = new Date().toISOString().slice(0, 7);
  await prisma.usageMonthly.updateMany({
    where: { userId, month, labelsQueued: { gte: count } },
    data: {
      labelsQueued: { decrement: count },
      labelsGenerated: { increment: count },
    },
  });
}

export async function finalizeQueuedTrackingToGenerated(userId: string, count: number) {
  const month = new Date().toISOString().slice(0, 7);
  await prisma.usageMonthly.updateMany({
    where: { userId, month, trackingQueued: { gte: count } },
    data: {
      trackingQueued: { decrement: count },
      trackingGenerated: { increment: count },
    },
  });
}

/**
 * Releases a number of labels from the "queued" count, e.g. when a job fails.
 */
export async function releaseQueuedLabels(userId: string, count: number) {
  const month = new Date().toISOString().slice(0, 7);
  await prisma.usageMonthly.updateMany({
    where: { userId, month, labelsQueued: { gte: count } },
    data: {
      labelsQueued: { decrement: count },
    },
  });
}

export async function releaseQueuedTracking(userId: string, count: number) {
  const month = new Date().toISOString().slice(0, 7);
  await prisma.usageMonthly.updateMany({
    where: { userId, month, trackingQueued: { gte: count } },
    data: {
      trackingQueued: { decrement: count },
    },
  });
}