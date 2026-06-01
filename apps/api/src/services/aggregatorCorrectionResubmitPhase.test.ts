import assert from "node:assert/strict";
import { prisma } from "../lib/prisma.js";
import { resubmitBookingAfterCorrection } from "./aggregatorBookingService.js";

type AsyncFn = () => Promise<void>;

const original = {
  transaction: prisma.$transaction.bind(prisma),
  aggBookingFindUnique: prisma.aggregatorBooking.findUnique.bind(prisma.aggregatorBooking),
  statusEventFindFirst: prisma.aggregatorBookingStatusEvent.findFirst.bind(prisma.aggregatorBookingStatusEvent),
  auditCreate: prisma.aggregatorBookingAuditLog.create.bind(prisma.aggregatorBookingAuditLog),
};

function restore() {
  prisma.$transaction = original.transaction;
  prisma.aggregatorBooking.findUnique = original.aggBookingFindUnique;
  prisma.aggregatorBookingStatusEvent.findFirst = original.statusEventFindFirst;
  prisma.aggregatorBookingAuditLog.create = original.auditCreate;
}

async function expectReject(fn: AsyncFn, messagePart: string) {
  let failed = false;
  try {
    await fn();
  } catch (error) {
    failed = true;
    const message = error instanceof Error ? error.message : String(error);
    assert.match(message, new RegExp(messagePart));
  }
  assert.equal(failed, true, `Expected rejection containing: ${messagePart}`);
}

function makeCounters() {
  return {
    paymentPlaceholderUpserts: 0,
    paymentTransactionCreates: 0,
    bulkPackPlanningMutations: 0,
    statusEvents: [] as Array<{ fromStatus: string | null; toStatus: string; reasonCode: string | null; note: string | null }>,
    auditActions: [] as string[],
  };
}

function installResubmitMocks(status: string, counters: ReturnType<typeof makeCounters>) {
  prisma.aggregatorBooking.findUnique = async () =>
    ({
      id: "booking_1",
      bookingNo: "ABK-20260601-0001",
      userId: "user_1",
      status,
      quoteSnapshotJson: {
        errorRows: [],
      },
      items: [],
      quote: {},
    }) as never;

  prisma.aggregatorBookingStatusEvent.findFirst = async () =>
    ({
      reasonCode: "MISSING_FIELDS",
      note: "Please correct sender phone and address.",
      createdAt: new Date("2026-06-01T10:00:00.000Z"),
      actorUserId: "admin_1",
    }) as never;

  prisma.aggregatorBookingAuditLog.create = async ({ data }: any) => {
    counters.auditActions.push(String(data.action));
    return {} as never;
  };

  prisma.$transaction = async (callback: any) => {
    const tx = {
      aggregatorBooking: {
        update: async ({ data }: any) => ({
          id: "booking_1",
          status: data.status,
          adminReviewStatus: data.adminReviewStatus ?? "PENDING",
        }),
      },
      aggregatorBookingStatusEvent: {
        create: async ({ data }: any) => {
          counters.statusEvents.push({
            fromStatus: data.fromStatus,
            toStatus: data.toStatus,
            reasonCode: data.reasonCode ?? null,
            note: data.note ?? null,
          });
          return {};
        },
      },
      aggregatorBookingAuditLog: {
        create: async ({ data }: any) => {
          counters.auditActions.push(String(data.action));
          return {};
        },
      },
      aggregatorPaymentPlaceholder: {
        upsert: async () => {
          counters.paymentPlaceholderUpserts += 1;
          return {};
        },
      },
      aggregatorPaymentTransaction: {
        create: async () => {
          counters.paymentTransactionCreates += 1;
          return {};
        },
      },
      aggregatorBulkPackPlanning: {
        upsert: async () => {
          counters.bulkPackPlanningMutations += 1;
          return {};
        },
      },
    };
    return callback(tx);
  };
}

async function run() {
  const successCounters = makeCounters();
  installResubmitMocks("CORRECTION_REQUIRED", successCounters);
  const updated = await resubmitBookingAfterCorrection({
    bookingId: "booking_1",
    userId: "user_1",
    correctionAcknowledged: true,
    note: "Updated requested fields and resubmitting.",
  });

  assert.equal(updated.status, "ADMIN_REVIEW_PENDING");
  assert.deepEqual(
    successCounters.statusEvents.map((e) => e.toStatus),
    ["BOOKING_SUBMITTED", "ADMIN_REVIEW_PENDING"],
  );
  assert.equal(successCounters.auditActions.includes("BOOKING_RESUBMITTED_AFTER_CORRECTION"), true);
  assert.equal(successCounters.auditActions.includes("CUSTOMER_ACKNOWLEDGED_ADMIN_CORRECTION_NOTE"), true);
  assert.equal(successCounters.paymentPlaceholderUpserts, 0);
  assert.equal(successCounters.paymentTransactionCreates, 0);
  assert.equal(successCounters.bulkPackPlanningMutations, 0);

  const blockedStatuses = [
    "BOOKING_DRAFT",
    "BOOKING_SUBMITTED",
    "ADMIN_REVIEW_PENDING",
    "ADMIN_APPROVED",
    "ADMIN_REJECTED",
    "PAYMENT_PENDING_PLACEHOLDER",
    "DROP_PENDING",
    "PICKUP_PENDING_FUTURE",
    "CANCELLED",
  ];

  for (const blockedStatus of blockedStatuses) {
    const counters = makeCounters();
    installResubmitMocks(blockedStatus, counters);
    await expectReject(
      async () =>
        resubmitBookingAfterCorrection({
          bookingId: "booking_1",
          userId: "user_1",
          correctionAcknowledged: true,
        }),
      "only allowed from CORRECTION_REQUIRED",
    );
    assert.equal(counters.statusEvents.length, 0);
  }

  const ackCounters = makeCounters();
  installResubmitMocks("CORRECTION_REQUIRED", ackCounters);
  await expectReject(
    async () =>
      resubmitBookingAfterCorrection({
        bookingId: "booking_1",
        userId: "user_1",
        correctionAcknowledged: false as true,
      }),
    "acknowledgment is required",
  );

  restore();
  console.log("aggregator correction resubmit phase tests passed");
}

run().catch((error) => {
  restore();
  console.error(error);
  process.exitCode = 1;
});
