import assert from "node:assert/strict";
import { prisma } from "../lib/prisma.js";
import {
  adminApproveBooking,
  adminRejectBooking,
  adminRequestCorrection,
  convertQuoteToDraft,
} from "./aggregatorBookingService.js";

type AsyncFn = () => Promise<void>;

const original = {
  transaction: prisma.$transaction.bind(prisma),
  aggQuoteCreate: prisma.aggregatorQuote.create.bind(prisma.aggregatorQuote),
  aggBookingCreate: prisma.aggregatorBooking.create.bind(prisma.aggregatorBooking),
  aggBookingFindUnique: prisma.aggregatorBooking.findUnique.bind(prisma.aggregatorBooking),
  aggBookingAuditCreate: prisma.aggregatorBookingAuditLog.create.bind(prisma.aggregatorBookingAuditLog),
};

function restore() {
  prisma.$transaction = original.transaction;
  prisma.aggregatorQuote.create = original.aggQuoteCreate;
  prisma.aggregatorBooking.create = original.aggBookingCreate;
  prisma.aggregatorBooking.findUnique = original.aggBookingFindUnique;
  prisma.aggregatorBookingAuditLog.create = original.aggBookingAuditCreate;
}

function makeTxCounters() {
  return {
    placeholderUpserts: 0,
    paymentTransactions: 0,
  };
}

function installConvertMocks(counters: { placeholderUpserts: number; paymentTransactions: number }) {
  prisma.aggregatorBooking.findUnique = async () => null as never;
  prisma.aggregatorBookingAuditLog.create = async () => ({}) as never;
  prisma.$transaction = async (callback: any) => {
    const tx = {
      aggregatorQuote: {
        create: async ({ data }: any) => ({ id: "quote_1", ...data }),
      },
      aggregatorBooking: {
        create: async ({ data, include }: any) => ({
          id: "booking_1",
          bookingNo: data.bookingNo,
          quoteSnapshotJson: data.quoteSnapshotJson,
          status: data.status,
          adminReviewStatus: data.adminReviewStatus,
          paymentStatus: data.paymentStatus,
          totalOfficialPostalCharge: data.totalOfficialPostalCharge,
          items: include?.items ? data.items?.create ?? [] : undefined,
          paymentPlaceholder: include?.paymentPlaceholder ? null : undefined,
        }),
      },
      aggregatorBookingStatusEvent: {
        create: async () => ({}),
      },
      aggregatorBookingAuditLog: {
        create: async () => ({}),
      },
      aggregatorPaymentPlaceholder: {
        upsert: async () => {
          counters.placeholderUpserts += 1;
          return {};
        },
      },
      aggregatorPaymentTransaction: {
        create: async () => {
          counters.paymentTransactions += 1;
          return {};
        },
      },
    };
    return callback(tx);
  };
}

function installAdminMocks(counters: { placeholderUpserts: number; paymentTransactions: number }) {
  let status = "ADMIN_REVIEW_PENDING";
  prisma.aggregatorBooking.findUnique = async () => ({
    id: "booking_admin_1",
    bookingNo: "ABK-20260601-0001",
    userId: "user_admin_1",
    status,
    adminReviewStatus: "PENDING",
    adminNotes: null,
    totalOfficialPostalCharge: 123,
    paymentStatus: "NOT_INITIATED",
    paymentPlaceholder: null,
  } as any);
  prisma.aggregatorBookingAuditLog.create = async () => ({}) as never;

  prisma.$transaction = async (callback: any) => {
    const tx = {
      aggregatorBooking: {
        update: async ({ data }: any) => {
          status = data.status ?? status;
          return {
            id: "booking_admin_1",
            status,
            adminReviewStatus: data.adminReviewStatus ?? "PENDING",
            paymentStatus: "NOT_INITIATED",
          };
        },
      },
      aggregatorBookingStatusEvent: {
        create: async () => ({}),
      },
      aggregatorBookingAuditLog: {
        create: async () => ({}),
      },
      aggregatorPaymentPlaceholder: {
        upsert: async () => {
          counters.placeholderUpserts += 1;
          return {};
        },
      },
      aggregatorPaymentTransaction: {
        create: async () => {
          counters.paymentTransactions += 1;
          return {};
        },
      },
    };
    return callback(tx);
  };
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

const baseInput = {
  userId: "user_1",
  quoteVersion: "v1.5",
  rows: [
    {
      serviceCode: "RGL",
      weightGrams: 250,
      senderCity: "Lahore",
      receiverCity: "Karachi",
    },
  ],
  quoteSummary: {},
  rateCardVersionSet: {},
  sender: {
    senderName: "Ali",
    senderPhone: "03001234567",
    senderAddress: "Street 1, Lahore",
    senderCity: "Lahore",
    intakeMethod: "DROP_LAHORE",
    hubCity: "Lahore",
  },
  selectedOption: "DROP_AT_COLLECTION_POINT" as const,
  recommendationSnapshot: {
    eligibility: "recommended" as const,
    blockers: [] as string[],
    advisoryNotes: [],
    valuePayableGuard: false,
    requestPreviewAllowed: true,
  },
  requestFlags: {
    requestOnly: true as const,
    noPayment: true as const,
    noLiveBooking: true as const,
    noPickupExecution: true as const,
    customerNoticeAccepted: true as const,
  },
};

async function run() {
  const counters = makeTxCounters();

  installConvertMocks(counters);
  const created = await convertQuoteToDraft(baseInput);
  assert.equal(created.booking.status, "ADMIN_REVIEW_PENDING");
  assert.equal(created.booking.adminReviewStatus, "PENDING");
  assert.equal(counters.placeholderUpserts, 0);
  assert.equal(counters.paymentTransactions, 0);

  await expectReject(
    async () =>
      convertQuoteToDraft({
        ...baseInput,
        rows: [{ serviceCode: "", weightGrams: 250, senderCity: "Lahore", receiverCity: "Karachi" }],
      }),
    "zero error rows",
  );

  await expectReject(
    async () =>
      convertQuoteToDraft({
        ...baseInput,
        recommendationSnapshot: { ...baseInput.recommendationSnapshot, blockers: ["OVER_PHASE_LIMIT"] },
      }),
    "OVER_PHASE_LIMIT",
  );

  await expectReject(
    async () =>
      convertQuoteToDraft({
        ...baseInput,
        sender: { ...baseInput.sender, senderName: "" },
      }),
    "required",
  );

  await expectReject(
    async () =>
      convertQuoteToDraft({
        ...baseInput,
        requestFlags: { ...baseInput.requestFlags, customerNoticeAccepted: false as true },
      }),
    "acceptance",
  );

  const adminCounters = makeTxCounters();
  installAdminMocks(adminCounters);

  const approved = await adminApproveBooking({
    bookingId: "booking_admin_1",
    adminUserId: "admin_1",
    note: "Approved for manual review action only.",
  });
  assert.equal(approved.status, "ADMIN_APPROVED");

  installAdminMocks(adminCounters);
  const rejected = await adminRejectBooking({
    bookingId: "booking_admin_1",
    adminUserId: "admin_1",
    reasonCode: "INVALID_DATA",
    note: "Rejected due to invalid sender data.",
  });
  assert.equal(rejected.status, "ADMIN_REJECTED");

  installAdminMocks(adminCounters);
  const correction = await adminRequestCorrection({
    bookingId: "booking_admin_1",
    adminUserId: "admin_1",
    reasonCode: "MISSING_FIELDS",
    note: "Please update sender details.",
  });
  assert.equal(correction.status, "CORRECTION_REQUIRED");

  assert.equal(adminCounters.placeholderUpserts, 0);
  assert.equal(adminCounters.paymentTransactions, 0);

  restore();
  console.log("phase 2b draft request tests passed");
}

run().catch((error) => {
  restore();
  console.error(error);
  process.exitCode = 1;
});
