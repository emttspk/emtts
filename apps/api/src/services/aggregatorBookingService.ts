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
import {
  AGGREGATOR_INTAKE_CARRIER_OPTIONS,
  AGGREGATOR_WAREHOUSE_OPTIONS,
  buildBulkPackLabelPreview as buildBulkPackLabelPreviewPayload,
  buildManifestPreview as buildManifestPreviewPayload,
  isManualPlanningEligible,
  resolveWarehouseAddress,
  type AggregatorIntakeCarrierOption,
  type AggregatorWarehouseOption,
} from "./aggregatorBulkPackPlanningService.js";

type JsonValue = Prisma.InputJsonValue;

type Actor = {
  actorType: "CUSTOMER" | "ADMIN" | "SYSTEM";
  actorUserId: string;
};

type RequestContext = {
  req?: Request;
};

type HubReceivingGuardrailFlags = {
  manualReceivingOnly: true;
  noFinalDispatch: true;
  noLiveCarrierApi: true;
  noPakistanPostBookingApi: true;
  noPickupExecution: true;
  noDispatchExecution: true;
  noFinalBookingConfirmation: true;
};

type HubReceivingSnapshot = {
  bookingNo: string;
  warehouse: AggregatorWarehouseOption;
  receivedAt: string;
  receivedBy: string;
  receivedArticleCount: number;
  expectedArticleCount: number;
  receivedBundleWeightGrams: number | null;
  conditionNote: string;
  manualReceivingOnly: true;
  noFinalDispatch: true;
};

type HubManifestVerifiedSnapshot = {
  bookingNo: string;
  expectedArticleCount: number;
  receivedArticleCount: number;
  matched: true;
  verifiedAt: string;
  verifiedBy: string;
  manualOnly: true;
  noFinalDispatch: true;
};

type HubMismatchSnapshot = {
  mismatchDetected: true;
  expectedArticleCount: number;
  receivedArticleCount: number;
  mismatchReason: string;
  adminNote: string;
  holdForManualResolution: true;
  recordedAt: string;
  recordedBy: string;
  manualOnly: true;
};

type HubExceptionNoteSnapshot = {
  note: string;
  addedAt: string;
  addedBy: string;
  manualOnly: true;
};

type HubResolutionSnapshot = {
  resolvedBy: string;
  resolvedAt: string;
  resolutionType: string;
  resolutionNote: string;
  manualOnly: true;
};

type Phase3C2CurrentState =
  | "NOT_STARTED"
  | "HUB_RECEIVED"
  | "MANIFEST_VERIFIED"
  | "MISMATCH_RECORDED"
  | "EXCEPTION_RESOLVED";

type Phase3C2OperationalState = {
  currentState: Phase3C2CurrentState;
  hubReceiving: HubReceivingSnapshot | null;
  manifestVerification: HubManifestVerifiedSnapshot | null;
  mismatch: HubMismatchSnapshot | null;
  latestExceptionNote: HubExceptionNoteSnapshot | null;
  resolution: HubResolutionSnapshot | null;
  holdForManualResolution: boolean;
  updatedAt: string | null;
  customerNotice: string;
};

const PHASE_3C2_CUSTOMER_NOTICE = "This is warehouse receiving status only. Final article processing is separate.";
const HUB_RECEIVING_AUDIT_ACTIONS = [
  "HUB_RECEIVING_MARKED",
  "HUB_MANIFEST_VERIFIED",
  "HUB_MANIFEST_MISMATCH_RECORDED",
  "HUB_EXCEPTION_NOTE_ADDED",
  "HUB_EXCEPTION_RESOLVED",
] as const;

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

function toPlainObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function assertHubReceivingGuardrails(flags: HubReceivingGuardrailFlags) {
  if (!flags.manualReceivingOnly) throw new Error("Hub receiving must remain manual-only");
  if (!flags.noFinalDispatch) throw new Error("Final dispatch confirmation is not allowed in Phase 3C-2");
  if (!flags.noLiveCarrierApi) throw new Error("Live carrier API usage is not allowed");
  if (!flags.noPakistanPostBookingApi) throw new Error("Pakistan Post booking API usage is not allowed");
  if (!flags.noPickupExecution) throw new Error("Pickup execution is not allowed in Phase 3C-2");
  if (!flags.noDispatchExecution) throw new Error("Dispatch execution is not allowed in Phase 3C-2");
  if (!flags.noFinalBookingConfirmation) throw new Error("Final booking confirmation is not allowed in Phase 3C-2");
}

function parsePlanningSelection(logValue: unknown) {
  const obj = toPlainObject(logValue);
  if (!obj) return null;

  const selectedWarehouse = String(obj.selectedWarehouse ?? "").trim().toUpperCase();
  const intakeCarrier = String(obj.intakeCarrier ?? "").trim().toUpperCase();
  if (!(AGGREGATOR_WAREHOUSE_OPTIONS as readonly string[]).includes(selectedWarehouse)) return null;
  if (!(AGGREGATOR_INTAKE_CARRIER_OPTIONS as readonly string[]).includes(intakeCarrier)) return null;

  return {
    selectedWarehouse: selectedWarehouse as AggregatorWarehouseOption,
    intakeCarrier: intakeCarrier as AggregatorIntakeCarrierOption,
    paymentVerifiedReference: String(obj.paymentVerifiedReference ?? "").trim(),
    instructions: String(obj.instructions ?? "").trim(),
    warehouseAddress: String(obj.warehouseAddress ?? "").trim(),
    updatedAt: String(obj.updatedAt ?? "").trim(),
  };
}

async function findLatestPlanningSelection(bookingId: string) {
  const latest = await prisma.aggregatorBookingAuditLog.findFirst({
    where: {
      bookingId,
      action: "BULK_PACK_PLANNING_SELECTION_SAVED",
    },
    orderBy: { createdAt: "desc" },
    select: {
      newValueJson: true,
      createdAt: true,
    },
  });

  if (!latest) return null;
  const parsed = parsePlanningSelection(latest.newValueJson);
  if (!parsed) return null;

  return {
    ...parsed,
    updatedAt: parsed.updatedAt || latest.createdAt.toISOString(),
  };
}

function parseHubReceivingSnapshot(value: unknown): HubReceivingSnapshot | null {
  const obj = toPlainObject(value);
  if (!obj) return null;

  const warehouse = String(obj.warehouse ?? "").trim().toUpperCase();
  if (!(AGGREGATOR_WAREHOUSE_OPTIONS as readonly string[]).includes(warehouse)) return null;

  const conditionNote = String(obj.conditionNote ?? "").trim();
  if (!conditionNote) return null;

  return {
    bookingNo: String(obj.bookingNo ?? "").trim(),
    warehouse: warehouse as AggregatorWarehouseOption,
    receivedAt: String(obj.receivedAt ?? "").trim(),
    receivedBy: String(obj.receivedBy ?? "").trim(),
    receivedArticleCount: toSafeInt(Number(obj.receivedArticleCount ?? 0)),
    expectedArticleCount: toSafeInt(Number(obj.expectedArticleCount ?? 0)),
    receivedBundleWeightGrams: obj.receivedBundleWeightGrams == null ? null : toSafeInt(Number(obj.receivedBundleWeightGrams)),
    conditionNote,
    manualReceivingOnly: true,
    noFinalDispatch: true,
  };
}

function parseManifestVerifiedSnapshot(value: unknown): HubManifestVerifiedSnapshot | null {
  const obj = toPlainObject(value);
  if (!obj) return null;
  if (obj.matched !== true) return null;

  return {
    bookingNo: String(obj.bookingNo ?? "").trim(),
    expectedArticleCount: toSafeInt(Number(obj.expectedArticleCount ?? 0)),
    receivedArticleCount: toSafeInt(Number(obj.receivedArticleCount ?? 0)),
    matched: true,
    verifiedAt: String(obj.verifiedAt ?? "").trim(),
    verifiedBy: String(obj.verifiedBy ?? "").trim(),
    manualOnly: true,
    noFinalDispatch: true,
  };
}

function parseMismatchSnapshot(value: unknown): HubMismatchSnapshot | null {
  const obj = toPlainObject(value);
  if (!obj) return null;
  if (obj.mismatchDetected !== true) return null;

  const mismatchReason = String(obj.mismatchReason ?? "").trim();
  const adminNote = String(obj.adminNote ?? "").trim();
  if (!mismatchReason || !adminNote) return null;

  return {
    mismatchDetected: true,
    expectedArticleCount: toSafeInt(Number(obj.expectedArticleCount ?? 0)),
    receivedArticleCount: toSafeInt(Number(obj.receivedArticleCount ?? 0)),
    mismatchReason,
    adminNote,
    holdForManualResolution: true,
    recordedAt: String(obj.recordedAt ?? "").trim(),
    recordedBy: String(obj.recordedBy ?? "").trim(),
    manualOnly: true,
  };
}

function parseExceptionNoteSnapshot(value: unknown): HubExceptionNoteSnapshot | null {
  const obj = toPlainObject(value);
  if (!obj) return null;

  const note = String(obj.note ?? "").trim();
  if (!note) return null;

  return {
    note,
    addedAt: String(obj.addedAt ?? "").trim(),
    addedBy: String(obj.addedBy ?? "").trim(),
    manualOnly: true,
  };
}

function parseResolutionSnapshot(value: unknown): HubResolutionSnapshot | null {
  const obj = toPlainObject(value);
  if (!obj) return null;

  const resolutionType = String(obj.resolutionType ?? "").trim();
  const resolutionNote = String(obj.resolutionNote ?? "").trim();
  if (!resolutionType || !resolutionNote) return null;

  return {
    resolvedBy: String(obj.resolvedBy ?? "").trim(),
    resolvedAt: String(obj.resolvedAt ?? "").trim(),
    resolutionType,
    resolutionNote,
    manualOnly: true,
  };
}

async function derivePhase3C2OperationalState(bookingId: string): Promise<Phase3C2OperationalState> {
  const logs = await prisma.aggregatorBookingAuditLog.findMany({
    where: {
      bookingId,
      action: {
        in: [...HUB_RECEIVING_AUDIT_ACTIONS],
      },
    },
    orderBy: { createdAt: "asc" },
    select: {
      action: true,
      newValueJson: true,
      createdAt: true,
    },
  });

  let hubReceiving: HubReceivingSnapshot | null = null;
  let manifestVerification: HubManifestVerifiedSnapshot | null = null;
  let mismatch: HubMismatchSnapshot | null = null;
  let latestExceptionNote: HubExceptionNoteSnapshot | null = null;
  let resolution: HubResolutionSnapshot | null = null;
  let updatedAt: string | null = null;

  for (const entry of logs) {
    const stamp = entry.createdAt.toISOString();
    if (entry.action === "HUB_RECEIVING_MARKED") {
      const parsed = parseHubReceivingSnapshot(entry.newValueJson);
      if (parsed) {
        hubReceiving = parsed;
        updatedAt = stamp;
      }
      continue;
    }

    if (entry.action === "HUB_MANIFEST_VERIFIED") {
      const parsed = parseManifestVerifiedSnapshot(entry.newValueJson);
      if (parsed) {
        manifestVerification = parsed;
        mismatch = null;
        updatedAt = stamp;
      }
      continue;
    }

    if (entry.action === "HUB_MANIFEST_MISMATCH_RECORDED") {
      const parsed = parseMismatchSnapshot(entry.newValueJson);
      if (parsed) {
        mismatch = parsed;
        manifestVerification = null;
        resolution = null;
        updatedAt = stamp;
      }
      continue;
    }

    if (entry.action === "HUB_EXCEPTION_NOTE_ADDED") {
      const parsed = parseExceptionNoteSnapshot(entry.newValueJson);
      if (parsed) {
        latestExceptionNote = parsed;
        updatedAt = stamp;
      }
      continue;
    }

    if (entry.action === "HUB_EXCEPTION_RESOLVED") {
      const parsed = parseResolutionSnapshot(entry.newValueJson);
      if (parsed) {
        resolution = parsed;
        updatedAt = stamp;
      }
    }
  }

  let currentState: Phase3C2CurrentState = "NOT_STARTED";
  if (hubReceiving) currentState = "HUB_RECEIVED";
  if (manifestVerification) currentState = "MANIFEST_VERIFIED";
  if (mismatch) currentState = "MISMATCH_RECORDED";
  if (resolution) currentState = "EXCEPTION_RESOLVED";

  return {
    currentState,
    hubReceiving,
    manifestVerification,
    mismatch,
    latestExceptionNote,
    resolution,
    holdForManualResolution: Boolean(mismatch && !resolution),
    updatedAt,
    customerNotice: PHASE_3C2_CUSTOMER_NOTICE,
  };
}

async function appendPlanningMetadata<T extends { id: string }>(booking: T) {
  const [planning, phase3c2Operational] = await Promise.all([
    findLatestPlanningSelection(booking.id),
    derivePhase3C2OperationalState(booking.id),
  ]);

  return {
    ...booking,
    bulkPackPlanning: planning ?? null,
    phase3c2Operational,
  };
}

function assertPlanningGuardrails(flags: {
  manualPlanningOnly: true;
  noLiveCarrierApi: true;
  noPakistanPostBookingApi: true;
  noPickupExecution: true;
  noDispatchExecution: true;
  noFinalBookingConfirmation: true;
}) {
  if (!flags.manualPlanningOnly) throw new Error("Manual planning only flag is required");
  if (!flags.noLiveCarrierApi) throw new Error("Live carrier API usage is not allowed");
  if (!flags.noPakistanPostBookingApi) throw new Error("Pakistan Post booking API usage is not allowed");
  if (!flags.noPickupExecution) throw new Error("Pickup execution is not allowed in Phase 3C-1");
  if (!flags.noDispatchExecution) throw new Error("Dispatch execution is not allowed in Phase 3C-1");
  if (!flags.noFinalBookingConfirmation) throw new Error("Final booking confirmation is not allowed in Phase 3C-1");
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

  const [rawItems, total] = await Promise.all([
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

  const items = await Promise.all(rawItems.map((item) => appendPlanningMetadata(item)));

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

  const [rawItems, total] = await Promise.all([
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

  const items = await Promise.all(rawItems.map((item) => appendPlanningMetadata(item)));

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
  return appendPlanningMetadata(booking);
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
  return appendPlanningMetadata(booking);
}

export async function adminSaveBulkPackPlanningSelection(input: {
  bookingId: string;
  adminUserId: string;
  selectedWarehouse: AggregatorWarehouseOption;
  intakeCarrier: AggregatorIntakeCarrierOption;
  paymentVerifiedReference: string;
  instructions: string;
  planningFlags: {
    manualPlanningOnly: true;
    noLiveCarrierApi: true;
    noPakistanPostBookingApi: true;
    noPickupExecution: true;
    noDispatchExecution: true;
    noFinalBookingConfirmation: true;
  };
  context?: RequestContext;
}) {
  assertPlanningGuardrails(input.planningFlags);

  const booking = await prisma.aggregatorBooking.findUnique({
    where: { id: input.bookingId },
    select: {
      id: true,
      bookingNo: true,
      status: true,
      paymentStatus: true,
      totalArticles: true,
      totalActualWeightGrams: true,
      totalChargeableWeightGrams: true,
    },
  });

  if (!booking) throw new Error("Booking not found");

  const eligible = isManualPlanningEligible(booking);
  if (!eligible.ok) {
    throw new Error(eligible.reason);
  }

  const planningSelection = {
    selectedWarehouse: input.selectedWarehouse,
    warehouseAddress: resolveWarehouseAddress(input.selectedWarehouse),
    intakeCarrier: input.intakeCarrier,
    paymentVerifiedReference: normalizeOptionalString(input.paymentVerifiedReference),
    instructions: normalizeOptionalString(input.instructions),
    updatedAt: new Date().toISOString(),
    manualPlanningOnly: true,
    noLiveCarrierApi: true,
    noPakistanPostBookingApi: true,
    noPickupExecution: true,
    noDispatchExecution: true,
    noFinalBookingConfirmation: true,
  };

  await writeAuditLog({
    bookingId: booking.id,
    action: "BULK_PACK_PLANNING_SELECTION_SAVED",
    actor: { actorType: "ADMIN", actorUserId: input.adminUserId },
    targetField: "bulk_pack_planning",
    oldValueJson: undefined,
    newValueJson: planningSelection as unknown as JsonValue,
    context: input.context,
  });

  return {
    bookingId: booking.id,
    bookingNo: booking.bookingNo,
    planningSelection,
  };
}

export async function adminPreviewBulkPackLabel(input: {
  bookingId: string;
  adminUserId: string;
  planningFlags: {
    manualPlanningOnly: true;
    noLiveCarrierApi: true;
    noPakistanPostBookingApi: true;
    noPickupExecution: true;
    noDispatchExecution: true;
    noFinalBookingConfirmation: true;
  };
  context?: RequestContext;
}) {
  assertPlanningGuardrails(input.planningFlags);

  const booking = await prisma.aggregatorBooking.findUnique({
    where: { id: input.bookingId },
    select: {
      id: true,
      bookingNo: true,
      senderName: true,
      senderPhone: true,
      senderCity: true,
      totalArticles: true,
      totalActualWeightGrams: true,
      totalChargeableWeightGrams: true,
      status: true,
      paymentStatus: true,
    },
  });
  if (!booking) throw new Error("Booking not found");

  const eligible = isManualPlanningEligible(booking);
  if (!eligible.ok) {
    throw new Error(eligible.reason);
  }

  const planning = await findLatestPlanningSelection(booking.id);
  if (!planning) {
    throw new Error("Warehouse and intake carrier selection is required before bulk-pack label preview");
  }

  if (!planning.paymentVerifiedReference) {
    throw new Error("paymentVerifiedReference is required for bulk-pack label preview");
  }

  const labelPreview = buildBulkPackLabelPreviewPayload({
    booking,
    selectedWarehouse: planning.selectedWarehouse,
    intakeCarrier: planning.intakeCarrier,
    paymentVerifiedReference: planning.paymentVerifiedReference,
    instructions: planning.instructions || "Manual planning only. Move bundle to selected warehouse.",
  });

  await writeAuditLog({
    bookingId: booking.id,
    action: "BULK_PACK_LABEL_PREVIEW_GENERATED",
    actor: { actorType: "ADMIN", actorUserId: input.adminUserId },
    targetField: "bulk_pack_label_preview",
    oldValueJson: undefined,
    newValueJson: labelPreview as unknown as JsonValue,
    context: input.context,
  });

  return {
    bookingId: booking.id,
    labelPreview,
  };
}

export async function adminPreviewManifest(input: {
  bookingId: string;
  adminUserId: string;
  planningFlags: {
    manualPlanningOnly: true;
    noLiveCarrierApi: true;
    noPakistanPostBookingApi: true;
    noPickupExecution: true;
    noDispatchExecution: true;
    noFinalBookingConfirmation: true;
  };
  context?: RequestContext;
}) {
  assertPlanningGuardrails(input.planningFlags);

  const booking = await prisma.aggregatorBooking.findUnique({
    where: { id: input.bookingId },
    select: {
      id: true,
      bookingNo: true,
      totalArticles: true,
      totalActualWeightGrams: true,
      totalChargeableWeightGrams: true,
      status: true,
      paymentStatus: true,
      items: {
        orderBy: { rowNo: "asc" },
        select: {
          rowNo: true,
          serviceCode: true,
          articleCategory: true,
          receiverCity: true,
          weightGrams: true,
          chargeableWeightGrams: true,
          totalOfficialPostalCharge: true,
        },
      },
    },
  });
  if (!booking) throw new Error("Booking not found");

  const eligible = isManualPlanningEligible(booking);
  if (!eligible.ok) {
    throw new Error(eligible.reason);
  }

  const planning = await findLatestPlanningSelection(booking.id);
  if (!planning) {
    throw new Error("Warehouse and intake carrier selection is required before manifest preview");
  }

  const manifestPreview = buildManifestPreviewPayload({
    booking,
    items: booking.items,
    selectedWarehouse: planning.selectedWarehouse,
    intakeCarrier: planning.intakeCarrier,
  });

  await writeAuditLog({
    bookingId: booking.id,
    action: "BULK_PACK_MANIFEST_PREVIEW_GENERATED",
    actor: { actorType: "ADMIN", actorUserId: input.adminUserId },
    targetField: "bulk_pack_manifest_preview",
    oldValueJson: undefined,
    newValueJson: manifestPreview as unknown as JsonValue,
    context: input.context,
  });

  return {
    bookingId: booking.id,
    manifestPreview,
  };
}

async function loadHubReceivingContext(bookingId: string) {
  const booking = await prisma.aggregatorBooking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      bookingNo: true,
      status: true,
      paymentStatus: true,
      totalArticles: true,
      totalActualWeightGrams: true,
      totalChargeableWeightGrams: true,
    },
  });

  if (!booking) throw new Error("Booking not found");

  const eligible = isManualPlanningEligible(booking);
  if (!eligible.ok) {
    throw new Error(eligible.reason);
  }

  const planning = await findLatestPlanningSelection(booking.id);
  if (!planning) {
    throw new Error("Warehouse and intake carrier selection is required before hub receiving actions");
  }

  const phase3c2 = await derivePhase3C2OperationalState(booking.id);

  return {
    booking,
    planning,
    phase3c2,
  };
}

export async function adminMarkHubReceived(input: {
  bookingId: string;
  adminUserId: string;
  receivedArticleCount: number;
  receivedBundleWeightGrams?: number | null;
  conditionNote: string;
  manualFlags: HubReceivingGuardrailFlags;
  context?: RequestContext;
}) {
  assertHubReceivingGuardrails(input.manualFlags);

  const context = await loadHubReceivingContext(input.bookingId);
  const receivedArticleCount = toSafeInt(input.receivedArticleCount);
  const expectedArticleCount = toSafeInt(context.booking.totalArticles);
  const receivedBundleWeightGrams =
    input.receivedBundleWeightGrams === null || input.receivedBundleWeightGrams === undefined
      ? null
      : toSafeInt(input.receivedBundleWeightGrams);

  const snapshot: HubReceivingSnapshot = {
    bookingNo: context.booking.bookingNo,
    warehouse: context.planning.selectedWarehouse,
    receivedAt: new Date().toISOString(),
    receivedBy: input.adminUserId,
    receivedArticleCount,
    expectedArticleCount,
    receivedBundleWeightGrams,
    conditionNote: String(input.conditionNote ?? "").trim(),
    manualReceivingOnly: true,
    noFinalDispatch: true,
  };

  await writeAuditLog({
    bookingId: context.booking.id,
    action: "HUB_RECEIVING_MARKED",
    actor: { actorType: "ADMIN", actorUserId: input.adminUserId },
    targetField: "hub_receiving",
    oldValueJson: undefined,
    newValueJson: snapshot as unknown as JsonValue,
    context: input.context,
  });

  return {
    bookingId: context.booking.id,
    hubReceiving: snapshot,
    phase3c2Operational: await derivePhase3C2OperationalState(context.booking.id),
  };
}

export async function adminVerifyHubManifest(input: {
  bookingId: string;
  adminUserId: string;
  receivedArticleCount: number;
  manualFlags: HubReceivingGuardrailFlags;
  context?: RequestContext;
}) {
  assertHubReceivingGuardrails(input.manualFlags);

  const context = await loadHubReceivingContext(input.bookingId);
  if (!context.phase3c2.hubReceiving) {
    throw new Error("Hub receiving must be marked before manifest verification");
  }

  if (context.phase3c2.holdForManualResolution) {
    throw new Error("Resolve mismatch before verifying manifest as matched");
  }

  const expectedArticleCount = toSafeInt(context.booking.totalArticles);
  const receivedArticleCount = toSafeInt(input.receivedArticleCount);
  if (receivedArticleCount !== expectedArticleCount) {
    throw new Error("Manifest verification requires receivedArticleCount to equal expectedArticleCount");
  }

  const snapshot: HubManifestVerifiedSnapshot = {
    bookingNo: context.booking.bookingNo,
    expectedArticleCount,
    receivedArticleCount,
    matched: true,
    verifiedAt: new Date().toISOString(),
    verifiedBy: input.adminUserId,
    manualOnly: true,
    noFinalDispatch: true,
  };

  await writeAuditLog({
    bookingId: context.booking.id,
    action: "HUB_MANIFEST_VERIFIED",
    actor: { actorType: "ADMIN", actorUserId: input.adminUserId },
    targetField: "hub_manifest_verification",
    oldValueJson: undefined,
    newValueJson: snapshot as unknown as JsonValue,
    context: input.context,
  });

  return {
    bookingId: context.booking.id,
    manifestVerification: snapshot,
    phase3c2Operational: await derivePhase3C2OperationalState(context.booking.id),
  };
}

export async function adminRecordHubMismatch(input: {
  bookingId: string;
  adminUserId: string;
  receivedArticleCount: number;
  mismatchReason: string;
  adminNote: string;
  manualFlags: HubReceivingGuardrailFlags;
  context?: RequestContext;
}) {
  assertHubReceivingGuardrails(input.manualFlags);

  const context = await loadHubReceivingContext(input.bookingId);
  if (!context.phase3c2.hubReceiving) {
    throw new Error("Hub receiving must be marked before mismatch recording");
  }

  const expectedArticleCount = toSafeInt(context.booking.totalArticles);
  const receivedArticleCount = toSafeInt(input.receivedArticleCount);
  if (receivedArticleCount === expectedArticleCount) {
    throw new Error("Counts are matched. Use manifest verification instead of mismatch recording");
  }

  const snapshot: HubMismatchSnapshot = {
    mismatchDetected: true,
    expectedArticleCount,
    receivedArticleCount,
    mismatchReason: String(input.mismatchReason ?? "").trim(),
    adminNote: String(input.adminNote ?? "").trim(),
    holdForManualResolution: true,
    recordedAt: new Date().toISOString(),
    recordedBy: input.adminUserId,
    manualOnly: true,
  };

  await writeAuditLog({
    bookingId: context.booking.id,
    action: "HUB_MANIFEST_MISMATCH_RECORDED",
    actor: { actorType: "ADMIN", actorUserId: input.adminUserId },
    targetField: "hub_manifest_mismatch",
    oldValueJson: undefined,
    newValueJson: snapshot as unknown as JsonValue,
    context: input.context,
  });

  return {
    bookingId: context.booking.id,
    mismatch: snapshot,
    phase3c2Operational: await derivePhase3C2OperationalState(context.booking.id),
  };
}

export async function adminAddHubExceptionNote(input: {
  bookingId: string;
  adminUserId: string;
  exceptionNote: string;
  manualFlags: HubReceivingGuardrailFlags;
  context?: RequestContext;
}) {
  assertHubReceivingGuardrails(input.manualFlags);

  const context = await loadHubReceivingContext(input.bookingId);
  if (!context.phase3c2.mismatch) {
    throw new Error("Mismatch must be recorded before adding exception note");
  }

  const snapshot: HubExceptionNoteSnapshot = {
    note: String(input.exceptionNote ?? "").trim(),
    addedAt: new Date().toISOString(),
    addedBy: input.adminUserId,
    manualOnly: true,
  };

  await writeAuditLog({
    bookingId: context.booking.id,
    action: "HUB_EXCEPTION_NOTE_ADDED",
    actor: { actorType: "ADMIN", actorUserId: input.adminUserId },
    targetField: "hub_exception_note",
    oldValueJson: undefined,
    newValueJson: snapshot as unknown as JsonValue,
    context: input.context,
  });

  return {
    bookingId: context.booking.id,
    exceptionNote: snapshot,
    phase3c2Operational: await derivePhase3C2OperationalState(context.booking.id),
  };
}

export async function adminResolveHubException(input: {
  bookingId: string;
  adminUserId: string;
  resolutionType: string;
  resolutionNote: string;
  manualFlags: HubReceivingGuardrailFlags;
  context?: RequestContext;
}) {
  assertHubReceivingGuardrails(input.manualFlags);

  const context = await loadHubReceivingContext(input.bookingId);
  if (!context.phase3c2.mismatch) {
    throw new Error("Mismatch must be recorded before manual resolution");
  }

  const snapshot: HubResolutionSnapshot = {
    resolvedBy: input.adminUserId,
    resolvedAt: new Date().toISOString(),
    resolutionType: String(input.resolutionType ?? "").trim(),
    resolutionNote: String(input.resolutionNote ?? "").trim(),
    manualOnly: true,
  };

  await writeAuditLog({
    bookingId: context.booking.id,
    action: "HUB_EXCEPTION_RESOLVED",
    actor: { actorType: "ADMIN", actorUserId: input.adminUserId },
    targetField: "hub_exception_resolution",
    oldValueJson: undefined,
    newValueJson: snapshot as unknown as JsonValue,
    context: input.context,
  });

  return {
    bookingId: context.booking.id,
    resolution: snapshot,
    phase3c2Operational: await derivePhase3C2OperationalState(context.booking.id),
  };
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
