import { Prisma } from "@prisma/client";
import type { Request } from "express";
import { createHash } from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { buildBookingQuoteSummary, type QuoteRow, type QuoteSummary } from "./bookingQuoteService.js";
import {
  assertCanTransitionBookingStatus,
  isAggregatorBookingStatus,
  isIntakeMethod,
  type AggregatorBookingStatus,
} from "./aggregatorBookingStatusService.js";

type JsonValue = Prisma.InputJsonValue;

type Actor = {
  actorType: "CUSTOMER" | "ADMIN" | "SYSTEM";
  actorUserId: string;
};

type RequestContext = {
  req?: Request;
};

function nowIsoCompact(date = new Date()) {
  const y = String(date.getUTCFullYear());
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

async function createBookingNo() {
  const prefix = `ABK-${nowIsoCompact()}`;
  const count = await prisma.aggregatorBooking.count({
    where: {
      bookingNo: {
        startsWith: `${prefix}-`,
      },
    },
  });
  return `${prefix}-${String(count + 1).padStart(4, "0")}`;
}

function toSafeInt(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

function normalizeOptionalString(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  return raw.length > 0 ? raw : null;
}

function summarizeRows(summary: QuoteSummary) {
  return summary.perArticlePostageBreakdown.map((row) => ({
    rowNo: row.rowNumber,
    receiverName: null,
    receiverPhone: null,
    receiverAddress: null,
    receiverCity: row.receiverCity || null,
    serviceCode: row.serviceCode,
    articleCategory: row.result.articleCategory,
    weightGrams: row.result.weightGrams,
    chargeableWeightGrams: row.result.chargeableWeightGrams,
    basePostage: toSafeInt(row.result.basePostageAmount),
    registrationFee: toSafeInt(row.result.registrationFeeAmount),
    valuePayableFee: toSafeInt(row.result.valuePayableFeeAmount),
    insuranceFee: toSafeInt(row.result.insuranceFeeAmount),
    totalOfficialPostalCharge: toSafeInt(row.result.totalOfficialPostalCharge),
    missingComponentsJson: row.result.missingComponents as unknown as JsonValue,
    warningsJson: row.result.warnings as unknown as JsonValue,
    errorsJson: row.result.errors as unknown as JsonValue,
    futurePakistanPostTrackingNo: null,
  }));
}

function getClientHashes(req?: Request) {
  const ipRaw = String(req?.ip ?? req?.socket?.remoteAddress ?? "").trim().toLowerCase();
  const uaRaw = String(req?.header("user-agent") ?? "").trim().toLowerCase();
  const hash = (input: string) => {
    if (!input) return null;
    return createHash("sha256").update(`aggregator-booking:${input}`).digest("hex");
  };

  return {
    ipHash: hash(ipRaw),
    userAgentHash: hash(uaRaw),
  };
}

async function writeStatusEvent(input: {
  bookingId: string;
  fromStatus: AggregatorBookingStatus | null;
  toStatus: AggregatorBookingStatus;
  actor: Actor;
  reasonCode?: string | null;
  note?: string | null;
}) {
  await prisma.aggregatorBookingStatusEvent.create({
    data: {
      bookingId: input.bookingId,
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      actorType: input.actor.actorType,
      actorUserId: input.actor.actorUserId,
      reasonCode: normalizeOptionalString(input.reasonCode),
      note: normalizeOptionalString(input.note),
    },
  });
}

async function writeAuditLog(input: {
  bookingId: string;
  action: string;
  actor: Actor;
  targetField?: string | null;
  oldValueJson?: JsonValue | null;
  newValueJson?: JsonValue | null;
  context?: RequestContext;
}) {
  const hashes = getClientHashes(input.context?.req);
  await prisma.aggregatorBookingAuditLog.create({
    data: {
      bookingId: input.bookingId,
      action: input.action,
      actorType: input.actor.actorType,
      actorUserId: input.actor.actorUserId,
      targetField: normalizeOptionalString(input.targetField),
      oldValueJson: input.oldValueJson ?? undefined,
      newValueJson: input.newValueJson ?? undefined,
      ipHash: hashes.ipHash,
      userAgentHash: hashes.userAgentHash,
    },
  });
}

function normalizeStatus(value: string): AggregatorBookingStatus {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (!isAggregatorBookingStatus(normalized)) {
    throw new Error(`Invalid booking status: ${value}`);
  }
  return normalized;
}

function ensureOwner(bookingUserId: string, userId: string) {
  if (bookingUserId !== userId) {
    throw new Error("Forbidden");
  }
}

export async function convertQuoteToDraft(input: {
  userId: string;
  quoteVersion: string;
  rows: QuoteRow[];
  quoteSummary: unknown;
  rateCardVersionSet: Record<string, string>;
  expiresAt?: string;
  sender: {
    senderName: string;
    senderPhone: string;
    senderAddress: string;
    senderCity: string;
    specialInstructions?: string | null;
    intakeMethod: string;
    hubCity: string;
  };
  selectedOption: "DROP_AT_COLLECTION_POINT" | "PICKUP_TO_HUB_PLANNING" | "DIRECT_COURIER_OR_SELF_DROP_ADVISORY";
  recommendationSnapshot: {
    eligibility: "recommended" | "review_required" | "not_recommended";
    blockers: string[];
    advisoryNotes: string[];
    valuePayableGuard: boolean;
    requestPreviewAllowed: boolean;
  };
  requestFlags: {
    requestOnly: true;
    noPayment: true;
    noLiveBooking: true;
    noPickupExecution: true;
    customerNoticeAccepted: true;
  };
  sourceFile?: {
    sourceFileKey?: string;
    sourceObjectKey?: string;
    sourceBucket: string;
    sourceSizeBytes?: number;
    sourceContentType?: string;
    sourceChecksum?: string;
    sourceOriginalFilename?: string;
    sourceUploadedAt?: string;
  };
  context?: RequestContext;
}) {
  const userId = String(input.userId).trim();
  if (!userId) throw new Error("Unauthorized");

  if (!input.requestFlags.customerNoticeAccepted) {
    throw new Error("Customer notice acceptance is required");
  }
  if (input.recommendationSnapshot.blockers.includes("OVER_PHASE_LIMIT")) {
    throw new Error("Draft request cannot be created while OVER_PHASE_LIMIT blocker is present");
  }
  if (!input.recommendationSnapshot.requestPreviewAllowed) {
    throw new Error("Draft request is not allowed for this recommendation result");
  }

  const recomputed = buildBookingQuoteSummary(input.rows);
  const requestPayload = {
    requestOnly: input.requestFlags.requestOnly,
    noPayment: input.requestFlags.noPayment,
    noLiveBooking: input.requestFlags.noLiveBooking,
    noPickupExecution: input.requestFlags.noPickupExecution,
    selectedOption: input.selectedOption,
    senderDetails: input.sender,
    quoteSnapshot: {
      totalArticles: recomputed.totalArticles,
      totalActualWeightGrams: recomputed.totalActualWeightGrams,
      totalChargeableWeightGrams: recomputed.totalChargeableWeightGrams,
      totalPostageAmount: recomputed.totalPostageAmount,
    },
    recommendationSnapshot: input.recommendationSnapshot,
    items: recomputed.perArticlePostageBreakdown,
    customerNoticeAccepted: input.requestFlags.customerNoticeAccepted,
  };
  const bookingNo = await createBookingNo();
  const actor: Actor = { actorType: "CUSTOMER", actorUserId: userId };

  const created = await prisma.$transaction(async (tx) => {
    const sourceKey = normalizeOptionalString(input.sourceFile?.sourceFileKey ?? input.sourceFile?.sourceObjectKey);
    const quote = await tx.aggregatorQuote.create({
      data: {
        userId,
        quoteVersion: String(input.quoteVersion || "v1.5").trim(),
        quoteInputJson: {
          rows: input.rows,
          requestPayload,
        } as unknown as JsonValue,
        quoteResultJson: recomputed as unknown as JsonValue,
        rateCardVersionSetJson: input.rateCardVersionSet as unknown as JsonValue,
        sourceFileKey: sourceKey,
        sourceObjectKey: sourceKey,
        sourceBucket: normalizeOptionalString(input.sourceFile?.sourceBucket),
        sourceSizeBytes:
          input.sourceFile?.sourceSizeBytes !== undefined
            ? toSafeInt(input.sourceFile.sourceSizeBytes)
            : null,
        sourceContentType: normalizeOptionalString(input.sourceFile?.sourceContentType),
        sourceChecksum: normalizeOptionalString(input.sourceFile?.sourceChecksum),
        sourceOriginalFilename: normalizeOptionalString(input.sourceFile?.sourceOriginalFilename),
        sourceUploadedAt: input.sourceFile?.sourceUploadedAt ? new Date(input.sourceFile.sourceUploadedAt) : null,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      },
    });

    const booking = await tx.aggregatorBooking.create({
      data: {
        bookingNo,
        userId,
        aggregatorQuoteId: quote.id,
        quoteSnapshotJson: {
          ...recomputed,
          requestPayload,
        } as unknown as JsonValue,
        status: "BOOKING_DRAFT",
        intakeMethod: input.sender.intakeMethod,
        hubCity: input.sender.hubCity,
        senderName: input.sender.senderName,
        senderPhone: input.sender.senderPhone,
        senderAddress: input.sender.senderAddress,
        senderCity: input.sender.senderCity,
        specialInstructions: normalizeOptionalString(input.sender.specialInstructions),
        totalArticles: toSafeInt(recomputed.totalArticles),
        totalActualWeightGrams: toSafeInt(recomputed.totalActualWeightGrams),
        totalChargeableWeightGrams: toSafeInt(recomputed.totalChargeableWeightGrams),
        totalBasePostage: toSafeInt(recomputed.totalBasePostage),
        totalRegistrationFee: toSafeInt(recomputed.totalRegistrationFee),
        totalValuePayableFee: toSafeInt(recomputed.totalValuePayableFee),
        totalInsuranceFee: toSafeInt(recomputed.totalInsuranceFee),
        totalOfficialPostalCharge: toSafeInt(recomputed.totalOfficialPostalCharge),
        paymentStatus: "NOT_INITIATED",
        adminReviewStatus: "NOT_REVIEWED",
        items: {
          create: summarizeRows(recomputed),
        },
      },
      include: {
        items: true,
        paymentPlaceholder: true,
      },
    });

    await tx.aggregatorBookingStatusEvent.create({
      data: {
        bookingId: booking.id,
        fromStatus: "QUOTE_READY",
        toStatus: "BOOKING_DRAFT",
        actorType: actor.actorType,
        actorUserId: actor.actorUserId,
        reasonCode: "QUOTE_CONVERTED",
        note: "Quote converted to booking draft.",
      },
    });

    await tx.aggregatorBookingAuditLog.create({
      data: {
        bookingId: booking.id,
        action: "QUOTE_CONVERTED_TO_DRAFT",
        actorType: actor.actorType,
        actorUserId: actor.actorUserId,
        targetField: "status",
        oldValueJson: "QUOTE_READY" as unknown as JsonValue,
        newValueJson: "BOOKING_DRAFT" as unknown as JsonValue,
      },
    });

    await tx.aggregatorBookingAuditLog.create({
      data: {
        bookingId: booking.id,
        action: "BOOKING_DRAFT_REQUEST_ONLY_METADATA",
        actorType: actor.actorType,
        actorUserId: actor.actorUserId,
        targetField: "requestPayload",
        oldValueJson: undefined,
        newValueJson: requestPayload as unknown as JsonValue,
      },
    });

    if (input.sourceFile) {
      await tx.aggregatorBookingAuditLog.create({
        data: {
          bookingId: booking.id,
          action: "QUOTE_SOURCE_FILE_METADATA_ATTACHED",
          actorType: actor.actorType,
          actorUserId: actor.actorUserId,
          targetField: "sourceFile",
          oldValueJson: undefined,
          newValueJson: {
            sourceFileKey: quote.sourceFileKey,
            sourceObjectKey: quote.sourceObjectKey,
            sourceBucket: quote.sourceBucket,
            sourceSizeBytes: quote.sourceSizeBytes,
            sourceContentType: quote.sourceContentType,
            sourceChecksum: quote.sourceChecksum,
            sourceOriginalFilename: quote.sourceOriginalFilename,
            sourceUploadedAt: quote.sourceUploadedAt?.toISOString() ?? null,
          } as unknown as JsonValue,
        },
      });
    }

    return { quote, booking };
  });

  await writeAuditLog({
    bookingId: created.booking.id,
    action: "BOOKING_DRAFT_CREATED",
    actor,
    targetField: "quoteSnapshotJson",
    oldValueJson: null,
    newValueJson: created.booking.quoteSnapshotJson as unknown as JsonValue,
    context: input.context,
  });

  return created;
}

export async function createDraftFromQuote(input: {
  userId: string;
  aggregatorQuoteId: string;
  sender: {
    senderName: string;
    senderPhone: string;
    senderAddress: string;
    senderCity: string;
    specialInstructions?: string | null;
    intakeMethod: string;
    hubCity: string;
  };
  context?: RequestContext;
}) {
  const userId = String(input.userId ?? "").trim();
  const quoteId = String(input.aggregatorQuoteId ?? "").trim();
  if (!userId) throw new Error("Unauthorized");

  const quote = await prisma.aggregatorQuote.findFirst({ where: { id: quoteId, userId } });
  if (!quote) throw new Error("Quote not found");

  const summary = quote.quoteResultJson as unknown as QuoteSummary;
  const bookingNo = await createBookingNo();

  const booking = await prisma.aggregatorBooking.create({
    data: {
      bookingNo,
      userId,
      aggregatorQuoteId: quote.id,
      quoteSnapshotJson: quote.quoteResultJson as unknown as JsonValue,
      status: "BOOKING_DRAFT",
      intakeMethod: input.sender.intakeMethod,
      hubCity: input.sender.hubCity,
      senderName: input.sender.senderName,
      senderPhone: input.sender.senderPhone,
      senderAddress: input.sender.senderAddress,
      senderCity: input.sender.senderCity,
      specialInstructions: normalizeOptionalString(input.sender.specialInstructions),
      totalArticles: toSafeInt(summary.totalArticles),
      totalActualWeightGrams: toSafeInt(summary.totalActualWeightGrams),
      totalChargeableWeightGrams: toSafeInt(summary.totalChargeableWeightGrams),
      totalBasePostage: toSafeInt(summary.totalBasePostage),
      totalRegistrationFee: toSafeInt(summary.totalRegistrationFee),
      totalValuePayableFee: toSafeInt(summary.totalValuePayableFee),
      totalInsuranceFee: toSafeInt(summary.totalInsuranceFee),
      totalOfficialPostalCharge: toSafeInt(summary.totalOfficialPostalCharge),
      paymentStatus: "NOT_INITIATED",
      adminReviewStatus: "NOT_REVIEWED",
      items: {
        create: summarizeRows(summary),
      },
    },
  });

  await writeStatusEvent({
    bookingId: booking.id,
    fromStatus: "QUOTE_READY",
    toStatus: "BOOKING_DRAFT",
    actor: { actorType: "CUSTOMER", actorUserId: userId },
    reasonCode: "QUOTE_LINKED",
    note: "Draft created from existing quote snapshot.",
  });

  await writeAuditLog({
    bookingId: booking.id,
    action: "BOOKING_DRAFT_CREATED_FROM_QUOTE",
    actor: { actorType: "CUSTOMER", actorUserId: userId },
    targetField: "aggregatorQuoteId",
    oldValueJson: null,
    newValueJson: quote.id as unknown as JsonValue,
    context: input.context,
  });

  return booking;
}

export async function listBookingsForUser(input: {
  userId: string;
  status?: string;
  page: number;
  pageSize: number;
}) {
  const where: Prisma.AggregatorBookingWhereInput = {
    userId: input.userId,
    ...(input.status ? { status: String(input.status).trim().toUpperCase() } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.aggregatorBooking.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      include: {
        paymentPlaceholder: true,
      },
    }),
    prisma.aggregatorBooking.count({ where }),
  ]);

  return { items, total, page: input.page, pageSize: input.pageSize };
}

export async function listBookingsForAdmin(input: {
  page: number;
  pageSize: number;
  status?: string;
  intakeMethod?: string;
  hubCity?: string;
  search?: string;
}) {
  const where: Prisma.AggregatorBookingWhereInput = {
    ...(input.status ? { status: String(input.status).trim().toUpperCase() } : {}),
    ...(input.intakeMethod ? { intakeMethod: String(input.intakeMethod).trim().toUpperCase() } : {}),
    ...(input.hubCity ? { hubCity: { contains: String(input.hubCity).trim(), mode: "insensitive" } } : {}),
  };

  if (input.search) {
    const q = String(input.search).trim();
    where.OR = [
      { bookingNo: { contains: q, mode: "insensitive" } },
      { senderName: { contains: q, mode: "insensitive" } },
      { senderPhone: { contains: q, mode: "insensitive" } },
      { user: { email: { contains: q, mode: "insensitive" } } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.aggregatorBooking.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            companyName: true,
          },
        },
        paymentPlaceholder: true,
      },
      orderBy: { updatedAt: "desc" },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    }),
    prisma.aggregatorBooking.count({ where }),
  ]);

  return { items, total, page: input.page, pageSize: input.pageSize };
}

export async function getBookingForUser(input: { bookingId: string; userId: string }) {
  const booking = await prisma.aggregatorBooking.findFirst({
    where: { id: input.bookingId, userId: input.userId },
    include: {
      items: { orderBy: { rowNo: "asc" } },
      documents: { orderBy: { createdAt: "desc" } },
      paymentPlaceholder: true,
    },
  });
  if (!booking) throw new Error("Booking not found");
  return booking;
}

export async function getBookingTimelineForUser(input: { bookingId: string; userId: string }) {
  const booking = await prisma.aggregatorBooking.findFirst({
    where: { id: input.bookingId, userId: input.userId },
    select: { id: true },
  });
  if (!booking) throw new Error("Booking not found");

  return prisma.aggregatorBookingStatusEvent.findMany({
    where: { bookingId: booking.id },
    orderBy: { createdAt: "asc" },
  });
}

export async function getBookingForAdmin(bookingId: string) {
  const booking = await prisma.aggregatorBooking.findUnique({
    where: { id: bookingId },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          companyName: true,
          contactNumber: true,
        },
      },
      items: { orderBy: { rowNo: "asc" } },
      documents: { orderBy: { createdAt: "desc" } },
      statusEvents: { orderBy: { createdAt: "asc" } },
      paymentPlaceholder: true,
    },
  });
  if (!booking) throw new Error("Booking not found");
  return booking;
}

export async function updateBookingDraft(input: {
  bookingId: string;
  userId: string;
  patch: Partial<{
    senderName: string;
    senderPhone: string;
    senderAddress: string;
    senderCity: string;
    specialInstructions: string | null;
    intakeMethod: string;
    hubCity: string;
  }>;
  context?: RequestContext;
}) {
  const booking = await prisma.aggregatorBooking.findUnique({ where: { id: input.bookingId } });
  if (!booking) throw new Error("Booking not found");
  ensureOwner(booking.userId, input.userId);

  const status = normalizeStatus(booking.status);
  if (status !== "BOOKING_DRAFT" && status !== "CORRECTION_REQUIRED") {
    throw new Error("Only draft or correction-required bookings can be edited");
  }

  if (input.patch.intakeMethod && !isIntakeMethod(input.patch.intakeMethod)) {
    throw new Error("Invalid intake method");
  }

  const data: Prisma.AggregatorBookingUpdateInput = {
    ...(input.patch.senderName ? { senderName: input.patch.senderName } : {}),
    ...(input.patch.senderPhone ? { senderPhone: input.patch.senderPhone } : {}),
    ...(input.patch.senderAddress ? { senderAddress: input.patch.senderAddress } : {}),
    ...(input.patch.senderCity ? { senderCity: input.patch.senderCity } : {}),
    ...(input.patch.specialInstructions !== undefined ? { specialInstructions: normalizeOptionalString(input.patch.specialInstructions) } : {}),
    ...(input.patch.intakeMethod ? { intakeMethod: input.patch.intakeMethod } : {}),
    ...(input.patch.hubCity ? { hubCity: input.patch.hubCity } : {}),
  };

  const updated = await prisma.aggregatorBooking.update({
    where: { id: booking.id },
    data,
  });

  await writeAuditLog({
    bookingId: booking.id,
    action: "BOOKING_DRAFT_UPDATED",
    actor: { actorType: "CUSTOMER", actorUserId: input.userId },
    targetField: "draft_fields",
    oldValueJson: {
      senderName: booking.senderName,
      senderPhone: booking.senderPhone,
      senderAddress: booking.senderAddress,
      senderCity: booking.senderCity,
      specialInstructions: booking.specialInstructions,
      intakeMethod: booking.intakeMethod,
      hubCity: booking.hubCity,
    } as unknown as JsonValue,
    newValueJson: {
      senderName: updated.senderName,
      senderPhone: updated.senderPhone,
      senderAddress: updated.senderAddress,
      senderCity: updated.senderCity,
      specialInstructions: updated.specialInstructions,
      intakeMethod: updated.intakeMethod,
      hubCity: updated.hubCity,
    } as unknown as JsonValue,
    context: input.context,
  });

  return updated;
}

export async function submitBooking(input: {
  bookingId: string;
  userId: string;
  note?: string;
  context?: RequestContext;
}) {
  const booking = await prisma.aggregatorBooking.findUnique({
    where: { id: input.bookingId },
    include: {
      quote: true,
      items: true,
    },
  });
  if (!booking) throw new Error("Booking not found");
  ensureOwner(booking.userId, input.userId);

  const from = normalizeStatus(booking.status);
  const actor: Actor = { actorType: "CUSTOMER", actorUserId: input.userId };
  assertCanTransitionBookingStatus({ from, to: "BOOKING_SUBMITTED", actor: "CUSTOMER" });

  const updated = await prisma.$transaction(async (tx) => {
    const quoteSnapshot = booking.quoteSnapshotJson as unknown as QuoteSummary;
    const isInvalid = (quoteSnapshot.errorRows ?? []).length > 0;
    if (isInvalid) {
      throw new Error("Booking cannot be submitted while quote has unresolved errors");
    }

    const first = await tx.aggregatorBooking.update({
      where: { id: booking.id },
      data: {
        status: "BOOKING_SUBMITTED",
        adminReviewStatus: "PENDING",
        submittedAt: new Date(),
      },
    });

    await tx.aggregatorBookingStatusEvent.create({
      data: {
        bookingId: booking.id,
        fromStatus: from,
        toStatus: "BOOKING_SUBMITTED",
        actorType: actor.actorType,
        actorUserId: actor.actorUserId,
        reasonCode: "CUSTOMER_SUBMIT",
        note: normalizeOptionalString(input.note),
      },
    });

    assertCanTransitionBookingStatus({ from: "BOOKING_SUBMITTED", to: "ADMIN_REVIEW_PENDING", actor: "ADMIN" });

    const second = await tx.aggregatorBooking.update({
      where: { id: booking.id },
      data: {
        status: "ADMIN_REVIEW_PENDING",
        adminReviewStatus: "PENDING",
      },
    });

    await tx.aggregatorBookingStatusEvent.create({
      data: {
        bookingId: booking.id,
        fromStatus: "BOOKING_SUBMITTED",
        toStatus: "ADMIN_REVIEW_PENDING",
        actorType: "SYSTEM",
        actorUserId: actor.actorUserId,
        reasonCode: "AUTO_QUEUE_ADMIN_REVIEW",
        note: "Auto moved to admin review pending after customer submission.",
      },
    });

    await tx.aggregatorBookingAuditLog.create({
      data: {
        bookingId: booking.id,
        action: "BOOKING_SUBMITTED",
        actorType: actor.actorType,
        actorUserId: actor.actorUserId,
        targetField: "status",
        oldValueJson: from as unknown as JsonValue,
        newValueJson: "ADMIN_REVIEW_PENDING" as unknown as JsonValue,
      },
    });

    return { first, second };
  });

  await writeAuditLog({
    bookingId: booking.id,
    action: "QUOTE_SNAPSHOT_FROZEN_ON_SUBMIT",
    actor,
    targetField: "quoteSnapshotJson",
    oldValueJson: booking.quoteSnapshotJson as unknown as JsonValue,
    newValueJson: booking.quoteSnapshotJson as unknown as JsonValue,
    context: input.context,
  });

  return updated.second;
}

export async function cancelBooking(input: {
  bookingId: string;
  userId: string;
  reasonCode: string;
  note?: string;
  context?: RequestContext;
}) {
  const booking = await prisma.aggregatorBooking.findUnique({ where: { id: input.bookingId } });
  if (!booking) throw new Error("Booking not found");
  ensureOwner(booking.userId, input.userId);

  const from = normalizeStatus(booking.status);
  assertCanTransitionBookingStatus({ from, to: "CANCELLED", actor: "CUSTOMER" });

  const updated = await prisma.aggregatorBooking.update({
    where: { id: booking.id },
    data: {
      status: "CANCELLED",
      adminReviewStatus: from === "ADMIN_REJECTED" ? "REJECTED" : booking.adminReviewStatus,
      adminNotes: normalizeOptionalString(input.note),
    },
  });

  await writeStatusEvent({
    bookingId: booking.id,
    fromStatus: from,
    toStatus: "CANCELLED",
    actor: { actorType: "CUSTOMER", actorUserId: input.userId },
    reasonCode: input.reasonCode,
    note: input.note,
  });

  await writeAuditLog({
    bookingId: booking.id,
    action: "BOOKING_CANCELLED_BY_CUSTOMER",
    actor: { actorType: "CUSTOMER", actorUserId: input.userId },
    targetField: "status",
    oldValueJson: from as unknown as JsonValue,
    newValueJson: "CANCELLED" as unknown as JsonValue,
    context: input.context,
  });

  return updated;
}

async function adminTransition(input: {
  bookingId: string;
  adminUserId: string;
  toStatus: AggregatorBookingStatus;
  reasonCode?: string;
  note?: string;
  paymentStatus?: string;
  context?: RequestContext;
}) {
  const booking = await prisma.aggregatorBooking.findUnique({
    where: { id: input.bookingId },
    include: { paymentPlaceholder: true },
  });
  if (!booking) throw new Error("Booking not found");

  const reasonCode = normalizeOptionalString(input.reasonCode);
  const note = normalizeOptionalString(input.note);

  if ((input.toStatus === "ADMIN_REJECTED" || input.toStatus === "CORRECTION_REQUIRED") && !reasonCode) {
    throw new Error("Reason code is required for reject/correction actions");
  }
  if (input.toStatus === "ADMIN_APPROVED") {
    if (!note || !/manual/i.test(note)) {
      throw new Error("Approval requires a manual-action confirmation note");
    }
  }

  const from = normalizeStatus(booking.status);
  assertCanTransitionBookingStatus({ from, to: input.toStatus, actor: "ADMIN" });

  const reviewStatus =
    input.toStatus === "ADMIN_APPROVED"
      ? "APPROVED"
      : input.toStatus === "ADMIN_REJECTED"
        ? "REJECTED"
        : input.toStatus === "CORRECTION_REQUIRED"
          ? "CORRECTION_REQUIRED"
          : "PENDING";

  const updated = await prisma.$transaction(async (tx) => {
    const first = await tx.aggregatorBooking.update({
      where: { id: booking.id },
      data: {
        status: input.toStatus,
        adminReviewStatus: reviewStatus,
        adminNotes: note,
        reviewedAt: new Date(),
        reviewedByUserId: input.adminUserId,
      },
    });

    await tx.aggregatorBookingStatusEvent.create({
      data: {
        bookingId: booking.id,
        fromStatus: from,
        toStatus: input.toStatus,
        actorType: "ADMIN",
        actorUserId: input.adminUserId,
        reasonCode,
        note,
      },
    });

    if (input.toStatus === "ADMIN_APPROVED") {
      assertCanTransitionBookingStatus({ from: "ADMIN_APPROVED", to: "PAYMENT_PENDING_PLACEHOLDER", actor: "ADMIN" });

      await tx.aggregatorBooking.update({
        where: { id: booking.id },
        data: {
          status: "PAYMENT_PENDING_PLACEHOLDER",
          paymentStatus: input.paymentStatus ?? "PENDING_PLACEHOLDER",
        },
      });

      await tx.aggregatorBookingStatusEvent.create({
        data: {
          bookingId: booking.id,
          fromStatus: "ADMIN_APPROVED",
          toStatus: "PAYMENT_PENDING_PLACEHOLDER",
          actorType: "SYSTEM",
          actorUserId: input.adminUserId,
          reasonCode: "AUTO_PAYMENT_PLACEHOLDER",
          note: "Approved for manual action. Placeholder state only; no live payment collection.",
        },
      });

      await tx.aggregatorPaymentPlaceholder.upsert({
        where: { bookingId: booking.id },
        create: {
          bookingId: booking.id,
          paymentStatus: input.paymentStatus ?? "PENDING_PLACEHOLDER",
          placeholderAmount: booking.totalOfficialPostalCharge,
          placeholderCurrency: "PKR",
        },
        update: {
          paymentStatus: input.paymentStatus ?? "PENDING_PLACEHOLDER",
          placeholderAmount: booking.totalOfficialPostalCharge,
          placeholderCurrency: "PKR",
          placeholderReference: null,
          dueAt: null,
        },
      });

      return tx.aggregatorBooking.findUniqueOrThrow({ where: { id: booking.id } });
    }

    return first;
  });

  await writeAuditLog({
    bookingId: booking.id,
    action:
      input.toStatus === "ADMIN_APPROVED"
        ? "ADMIN_DECISION_APPROVED_FOR_MANUAL_ACTION"
        : input.toStatus === "ADMIN_REJECTED"
          ? "ADMIN_DECISION_REJECTED"
          : input.toStatus === "CORRECTION_REQUIRED"
            ? "ADMIN_DECISION_CORRECTION_REQUIRED"
            : "ADMIN_DECISION_REVIEW_PENDING",
    actor: { actorType: "ADMIN", actorUserId: input.adminUserId },
    targetField: "status",
    oldValueJson: from as unknown as JsonValue,
    newValueJson: updated.status as unknown as JsonValue,
    context: input.context,
  });

  await writeAuditLog({
    bookingId: booking.id,
    action: "ADMIN_DECISION_RATIONALE",
    actor: { actorType: "ADMIN", actorUserId: input.adminUserId },
    targetField: "admin_decision",
    oldValueJson: undefined,
    newValueJson: {
      toStatus: input.toStatus,
      reasonCode,
      note,
      manualProcessingOnly: true,
      noLivePaymentCollection: true,
      noPickupExecution: true,
      noDispatchExecution: true,
      noExternalCourierOrPakistanPostApiCall: true,
    } as unknown as JsonValue,
    context: input.context,
  });

  return updated;
}

export async function adminApproveBooking(input: {
  bookingId: string;
  adminUserId: string;
  reasonCode?: string;
  note?: string;
  paymentStatus?: string;
  context?: RequestContext;
}) {
  return adminTransition({ ...input, toStatus: "ADMIN_APPROVED" });
}

export async function adminRejectBooking(input: {
  bookingId: string;
  adminUserId: string;
  reasonCode?: string;
  note?: string;
  context?: RequestContext;
}) {
  return adminTransition({ ...input, toStatus: "ADMIN_REJECTED" });
}

export async function adminRequestCorrection(input: {
  bookingId: string;
  adminUserId: string;
  reasonCode?: string;
  note?: string;
  context?: RequestContext;
}) {
  return adminTransition({ ...input, toStatus: "CORRECTION_REQUIRED" });
}

export async function adminMarkPending(input: {
  bookingId: string;
  adminUserId: string;
  reasonCode?: string;
  note?: string;
  context?: RequestContext;
}) {
  return adminTransition({ ...input, toStatus: "ADMIN_REVIEW_PENDING" });
}
