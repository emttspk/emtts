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

type HandoffOperationalGuardrailFlags = {
  manualHandoffOnly: true;
  noFinalDispatch: true;
  noLiveCarrierApi: true;
  noPakistanPostBookingApi: true;
  noPickupExecution: true;
  noDispatchExecution: true;
  noFinalBookingConfirmation: true;
};

type DriverHandoffSnapshot = {
  bookingNo: string;
  handoffType: string;
  fromParty: string;
  toParty: string;
  handoffAt: string;
  receivedBy: string;
  bundleCondition: string;
  articleCount: number;
  note: string;
  manualOnly: true;
  noLiveCarrierApi: true;
  noFinalDispatch: true;
};

type HubSortingDispatchSnapshot = {
  bookingNo: string;
  fromWarehouse: string;
  toSortingFacility: string;
  dispatchedAt: string;
  dispatchedBy: string;
  expectedArticleCount: number;
  bundleWeightGrams: number | null;
  transportMode: string;
  note: string;
  manualOnly: true;
  noPakistanPostBookingApi: true;
  noFinalBookingConfirmation: true;
};

type InterFacilityTransferSnapshot = {
  bookingNo: string;
  fromFacility: string;
  toFacility: string;
  transferAt: string;
  transferBy: string;
  transferReference: string | null;
  articleCount: number;
  note: string;
  manualOnly: true;
  noLiveCarrierApi: true;
  noFinalDispatch: true;
};

type ReadyForPostalSnapshot = {
  bookingNo: string;
  readyAt: string;
  markedBy: string;
  expectedArticleCount: number;
  note: string;
  manualOnly: true;
  noPakistanPostBookingApi: true;
  finalBookingNotCreated: true;
};

type Phase3C3CurrentState =
  | "NOT_STARTED"
  | "DRIVER_HANDOFF_RECORDED"
  | "HUB_SORTING_DISPATCHED"
  | "INTER_FACILITY_TRANSFER_RECORDED"
  | "READY_FOR_FINAL_POSTAL_PROCESSING";

type Phase3C3OperationalState = {
  currentState: Phase3C3CurrentState;
  driverHandoff: DriverHandoffSnapshot | null;
  sortingDispatch: HubSortingDispatchSnapshot | null;
  latestTransfer: InterFacilityTransferSnapshot | null;
  readyForPostal: ReadyForPostalSnapshot | null;
  updatedAt: string | null;
  customerNotice: string;
};

type FinalProcessingGuardrailFlags = {
  manualOnly: true;
  noPakistanPostBookingApi: true;
  noFinalBookingConfirmation: true;
  noLiveBooking: true;
  noLabelJobCreation: true;
  noUnitConsumption: true;
  noAutoDispatch: true;
};

type FinalProcessingServiceCode = "RGL" | "VPL" | "VPP" | "IRL" | "PAR" | "UMS" | "COD";

type FinalProcessingReadinessSnapshot = {
  bookingNo: string;
  expectedArticleCount: number;
  verifiedArticleCount: number;
  servicesIncluded: FinalProcessingServiceCode[];
  valuePayableIncluded: boolean;
  codIncluded: boolean;
  moRequired: boolean;
  labelReadinessChecked: boolean;
  moneyOrderReadinessChecked: boolean;
  exceptions: string[];
  note: string;
  checkedAt: string;
  checkedBy: string;
  manualOnly: true;
  noPakistanPostBookingApi: true;
  noFinalBookingConfirmation: true;
};

type FinalProcessingPacketRow = {
  rowNo: number;
  serviceCode: FinalProcessingServiceCode;
  articleCategory: string;
  receiverCity: string | null;
  chargeableWeightGrams: number | null;
  totalOfficialPostalCharge: number;
};

type FinalProcessingPacketSnapshot = {
  bookingNo: string;
  packetNo: string;
  generatedAt: string;
  generatedBy: string;
  articleRows: FinalProcessingPacketRow[];
  serviceSummary: Record<FinalProcessingServiceCode, number>;
  valuePayableSummary: {
    included: boolean;
    serviceCodes: Array<"VPL" | "VPP" | "COD">;
  };
  codSummary: {
    included: boolean;
    codArticles: number;
  };
  readinessWarnings: string[];
  manualProcessingNotice: string;
  noLiveBooking: true;
};

type FinalProcessingExportSnapshot = {
  bookingNo: string;
  packetNo: string;
  exportedAt: string;
  exportedBy: string;
  exportFormat: "json" | "csv";
  note: string;
  manualOnly: true;
};

type FinalProcessingReviewSnapshot = {
  bookingNo: string;
  packetNo: string;
  reviewedAt: string;
  reviewedBy: string;
  reviewNote: string;
  manualOnly: true;
};

type Phase3C4CurrentState =
  | "NOT_STARTED"
  | "READINESS_CHECKED"
  | "PACKET_PREPARED"
  | "PACKET_EXPORTED"
  | "REVIEW_COMPLETED";

type Phase3C4FinalProcessingState = {
  currentState: Phase3C4CurrentState;
  readiness: FinalProcessingReadinessSnapshot | null;
  packet: FinalProcessingPacketSnapshot | null;
  exportEvent: FinalProcessingExportSnapshot | null;
  reviewEvent: FinalProcessingReviewSnapshot | null;
  updatedAt: string | null;
  customerNotice: string;
};

const AGGREGATOR_MANUAL_PAYMENT_METHODS = [
  "BANK_TRANSFER",
  "JAZZCASH_WALLET_TRANSFER",
  "EASYPAISA_WALLET_TRANSFER",
  "OFFICE_CASH",
] as const;

type AggregatorManualPaymentMethod = (typeof AGGREGATOR_MANUAL_PAYMENT_METHODS)[number];

type Phase3C5CurrentState =
  | "PAYMENT_OPTIONS_VISIBLE"
  | "MANUAL_PAYMENT_SUBMITTED"
  | "UNDER_ADMIN_VERIFICATION"
  | "MANUAL_PAYMENT_VERIFIED"
  | "MANUAL_PAYMENT_REJECTED"
  | "MANUAL_PAYMENT_CANCELLED";

type ManualPaymentGuardrailFlags = {
  manualOnly: true;
  noLiveGateway: true;
  noSubscriptionMutation: true;
  noInvoiceMutation: true;
  noPickupExecution: true;
  noDispatchExecution: true;
  noPakistanPostBookingApi: true;
  noFinalBookingConfirmation: true;
};

type Phase3C5ManualSubmissionSnapshot = {
  method: AggregatorManualPaymentMethod;
  amount: number;
  currency: string;
  reference: string | null;
  payerName: string;
  proofNote: string;
  submittedBy: string;
  submittedAt: string;
  manualOnly: true;
  noLiveGateway: true;
  noSubscriptionMutation: true;
  noInvoiceMutation: true;
  noPickupExecution: true;
  noDispatchExecution: true;
  noPakistanPostBookingApi: true;
  noFinalBookingConfirmation: true;
};

type Phase3C5ManualVerificationSnapshot = {
  method: AggregatorManualPaymentMethod;
  amount: number;
  currency: string;
  reference: string | null;
  payerName: string;
  proofNote: string;
  verifiedBy: string;
  verificationNote: string;
  verifiedAt: string;
  manualOnly: true;
  noLiveGateway: true;
  noSubscriptionMutation: true;
  noInvoiceMutation: true;
  noPickupExecution: true;
  noDispatchExecution: true;
  noPakistanPostBookingApi: true;
  noFinalBookingConfirmation: true;
};

type Phase3C5ManualRejectionSnapshot = {
  rejectedBy: string;
  rejectionReason: string;
  rejectionNote: string | null;
  rejectedAt: string;
  manualOnly: true;
  noLiveGateway: true;
  noSubscriptionMutation: true;
  noInvoiceMutation: true;
  noPickupExecution: true;
  noDispatchExecution: true;
  noPakistanPostBookingApi: true;
  noFinalBookingConfirmation: true;
};

type Phase3C5ManualCancellationSnapshot = {
  cancelledBy: string;
  cancellationReason: string;
  cancellationNote: string | null;
  cancelledAt: string;
  manualOnly: true;
  noLiveGateway: true;
  noSubscriptionMutation: true;
  noInvoiceMutation: true;
  noPickupExecution: true;
  noDispatchExecution: true;
  noPakistanPostBookingApi: true;
  noFinalBookingConfirmation: true;
};

type Phase3C5PaymentState = {
  currentState: Phase3C5CurrentState;
  eligibleForManualPayment: boolean;
  paymentOptionsVisible: boolean;
  latestSubmission: Phase3C5ManualSubmissionSnapshot | null;
  verification: Phase3C5ManualVerificationSnapshot | null;
  rejection: Phase3C5ManualRejectionSnapshot | null;
  cancellation: Phase3C5ManualCancellationSnapshot | null;
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

const PHASE_3C3_CUSTOMER_NOTICE =
  "This is operational movement status only. Final Pakistan Post article processing is a separate future step.";

const PHASE_3C4_CUSTOMER_NOTICE =
  "Your articles are ready for final postal processing review. This is not final Pakistan Post booking confirmation.";

const HUB_HANDOFF_AUDIT_ACTIONS = [
  "DRIVER_HANDOFF_RECORDED",
  "HUB_SORTING_DISPATCH_RECORDED",
  "INTER_FACILITY_TRANSFER_RECORDED",
  "READY_FOR_FINAL_POSTAL_PROCESSING",
] as const;

const FINAL_PROCESSING_AUDIT_ACTIONS = [
  "FINAL_PROCESSING_READINESS_CHECKED",
  "FINAL_PROCESSING_PACKET_PREPARED",
  "FINAL_PROCESSING_PACKET_EXPORTED",
  "FINAL_PROCESSING_REVIEW_MARKED",
] as const;

const PHASE_3C5_CUSTOMER_NOTICE =
  "Payment verification only. This is not final Pakistan Post booking confirmation.";

const PHASE_3C5_AUDIT_ACTIONS = [
  "AGGREGATOR_PAYMENT_OPTIONS_SHOWN",
  "AGGREGATOR_MANUAL_PAYMENT_SUBMITTED",
  "AGGREGATOR_MANUAL_PAYMENT_VERIFIED",
  "AGGREGATOR_MANUAL_PAYMENT_REJECTED",
  "AGGREGATOR_MANUAL_PAYMENT_CANCELLED",
] as const;

const FINAL_PROCESSING_SERVICE_CODES: FinalProcessingServiceCode[] = ["RGL", "VPL", "VPP", "IRL", "PAR", "UMS", "COD"];

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

function assertManualPaymentGuardrails(flags: ManualPaymentGuardrailFlags) {
  if (!flags.manualOnly) throw new Error("Manual payment verification must remain manual-only");
  if (!flags.noLiveGateway) throw new Error("Live payment gateway is not allowed in Phase 3C-5A");
  if (!flags.noSubscriptionMutation) throw new Error("Subscription mutation is not allowed in Phase 3C-5A");
  if (!flags.noInvoiceMutation) throw new Error("Invoice mutation is not allowed in Phase 3C-5A");
  if (!flags.noPickupExecution) throw new Error("Pickup execution is not allowed in Phase 3C-5A");
  if (!flags.noDispatchExecution) throw new Error("Dispatch execution is not allowed in Phase 3C-5A");
  if (!flags.noPakistanPostBookingApi) throw new Error("Pakistan Post booking API is not allowed in Phase 3C-5A");
  if (!flags.noFinalBookingConfirmation) throw new Error("Final booking confirmation is not allowed in Phase 3C-5A");
}

function isAggregatorManualPaymentMethod(value: unknown): value is AggregatorManualPaymentMethod {
  return (AGGREGATOR_MANUAL_PAYMENT_METHODS as readonly string[]).includes(String(value ?? "").trim().toUpperCase());
}

function parsePhase3C5ManualSubmission(value: unknown): Phase3C5ManualSubmissionSnapshot | null {
  const obj = toPlainObject(value);
  if (!obj) return null;

  const method = String(obj.method ?? "").trim().toUpperCase();
  const amount = Number(obj.amount ?? 0);
  const currency = String(obj.currency ?? "PKR").trim().toUpperCase() || "PKR";
  const payerName = String(obj.payerName ?? "").trim();
  const proofNote = String(obj.proofNote ?? "").trim();
  const submittedBy = String(obj.submittedBy ?? "").trim();
  const submittedAt = String(obj.submittedAt ?? "").trim();
  if (!isAggregatorManualPaymentMethod(method)) return null;
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (!payerName || !proofNote || !submittedBy || !submittedAt) return null;

  return {
    method,
    amount,
    currency,
    reference: normalizeOptionalString(obj.reference as string | null | undefined),
    payerName,
    proofNote,
    submittedBy,
    submittedAt,
    manualOnly: true,
    noLiveGateway: true,
    noSubscriptionMutation: true,
    noInvoiceMutation: true,
    noPickupExecution: true,
    noDispatchExecution: true,
    noPakistanPostBookingApi: true,
    noFinalBookingConfirmation: true,
  };
}

function parsePhase3C5ManualVerification(value: unknown): Phase3C5ManualVerificationSnapshot | null {
  const obj = toPlainObject(value);
  if (!obj) return null;

  const method = String(obj.method ?? "").trim().toUpperCase();
  const amount = Number(obj.amount ?? 0);
  const currency = String(obj.currency ?? "PKR").trim().toUpperCase() || "PKR";
  const payerName = String(obj.payerName ?? "").trim();
  const proofNote = String(obj.proofNote ?? "").trim();
  const verifiedBy = String(obj.verifiedBy ?? "").trim();
  const verificationNote = String(obj.verificationNote ?? "").trim();
  const verifiedAt = String(obj.verifiedAt ?? "").trim();
  if (!isAggregatorManualPaymentMethod(method)) return null;
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (!payerName || !proofNote || !verifiedBy || !verificationNote || !verifiedAt) return null;

  return {
    method,
    amount,
    currency,
    reference: normalizeOptionalString(obj.reference as string | null | undefined),
    payerName,
    proofNote,
    verifiedBy,
    verificationNote,
    verifiedAt,
    manualOnly: true,
    noLiveGateway: true,
    noSubscriptionMutation: true,
    noInvoiceMutation: true,
    noPickupExecution: true,
    noDispatchExecution: true,
    noPakistanPostBookingApi: true,
    noFinalBookingConfirmation: true,
  };
}

function parsePhase3C5ManualRejection(value: unknown): Phase3C5ManualRejectionSnapshot | null {
  const obj = toPlainObject(value);
  if (!obj) return null;
  const rejectedBy = String(obj.rejectedBy ?? "").trim();
  const rejectionReason = String(obj.rejectionReason ?? "").trim();
  const rejectedAt = String(obj.rejectedAt ?? "").trim();
  if (!rejectedBy || !rejectionReason || !rejectedAt) return null;

  return {
    rejectedBy,
    rejectionReason,
    rejectionNote: normalizeOptionalString(obj.rejectionNote as string | null | undefined),
    rejectedAt,
    manualOnly: true,
    noLiveGateway: true,
    noSubscriptionMutation: true,
    noInvoiceMutation: true,
    noPickupExecution: true,
    noDispatchExecution: true,
    noPakistanPostBookingApi: true,
    noFinalBookingConfirmation: true,
  };
}

function parsePhase3C5ManualCancellation(value: unknown): Phase3C5ManualCancellationSnapshot | null {
  const obj = toPlainObject(value);
  if (!obj) return null;
  const cancelledBy = String(obj.cancelledBy ?? "").trim();
  const cancellationReason = String(obj.cancellationReason ?? "").trim();
  const cancelledAt = String(obj.cancelledAt ?? "").trim();
  if (!cancelledBy || !cancellationReason || !cancelledAt) return null;

  return {
    cancelledBy,
    cancellationReason,
    cancellationNote: normalizeOptionalString(obj.cancellationNote as string | null | undefined),
    cancelledAt,
    manualOnly: true,
    noLiveGateway: true,
    noSubscriptionMutation: true,
    noInvoiceMutation: true,
    noPickupExecution: true,
    noDispatchExecution: true,
    noPakistanPostBookingApi: true,
    noFinalBookingConfirmation: true,
  };
}

export async function derivePhase3C5PaymentState(bookingId: string): Promise<Phase3C5PaymentState> {
  const [booking, logs] = await Promise.all([
    prisma.aggregatorBooking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        status: true,
        paymentStatus: true,
        paymentPlaceholder: {
          select: {
            paymentStatus: true,
            placeholderMethod: true,
            placeholderReference: true,
            placeholderAmount: true,
            placeholderCurrency: true,
            updatedAt: true,
          },
        },
      },
    }),
    prisma.aggregatorBookingAuditLog.findMany({
      where: {
        bookingId,
        action: { in: [...PHASE_3C5_AUDIT_ACTIONS] },
      },
      orderBy: { createdAt: "desc" },
      select: {
        action: true,
        newValueJson: true,
        createdAt: true,
      },
    }),
  ]);

  if (!booking) throw new Error("Booking not found");

  const eligibleStatuses = new Set(["PAYMENT_PENDING_PLACEHOLDER", "DROP_PENDING", "PICKUP_PENDING_FUTURE"]);
  const eligibleForManualPayment = eligibleStatuses.has(String(booking.status ?? "").trim().toUpperCase());

  const submittedLog = logs.find((log) => log.action === "AGGREGATOR_MANUAL_PAYMENT_SUBMITTED");
  const verifiedLog = logs.find((log) => log.action === "AGGREGATOR_MANUAL_PAYMENT_VERIFIED");
  const rejectedLog = logs.find((log) => log.action === "AGGREGATOR_MANUAL_PAYMENT_REJECTED");
  const cancelledLog = logs.find((log) => log.action === "AGGREGATOR_MANUAL_PAYMENT_CANCELLED");

  const latestSubmission = submittedLog ? parsePhase3C5ManualSubmission(submittedLog.newValueJson) : null;
  const verification = verifiedLog ? parsePhase3C5ManualVerification(verifiedLog.newValueJson) : null;
  const rejection = rejectedLog ? parsePhase3C5ManualRejection(rejectedLog.newValueJson) : null;
  const cancellation = cancelledLog ? parsePhase3C5ManualCancellation(cancelledLog.newValueJson) : null;

  let currentState: Phase3C5CurrentState = "PAYMENT_OPTIONS_VISIBLE";
  if (verification) {
    currentState = "MANUAL_PAYMENT_VERIFIED";
  } else if (rejection) {
    currentState = "MANUAL_PAYMENT_REJECTED";
  } else if (cancellation) {
    currentState = "MANUAL_PAYMENT_CANCELLED";
  } else if (latestSubmission) {
    currentState = "UNDER_ADMIN_VERIFICATION";
  }

  const latestTimestamp = logs[0]?.createdAt?.toISOString() ?? booking.paymentPlaceholder?.updatedAt?.toISOString() ?? null;

  return {
    currentState,
    eligibleForManualPayment,
    paymentOptionsVisible: eligibleForManualPayment,
    latestSubmission,
    verification,
    rejection,
    cancellation,
    updatedAt: latestTimestamp,
    customerNotice: PHASE_3C5_CUSTOMER_NOTICE,
  };
}

export async function loadAggregatorPaymentContext(input: {
  bookingId: string;
  actorUserId: string;
  actorType: "CUSTOMER" | "ADMIN";
}) {
  const booking = await prisma.aggregatorBooking.findUnique({
    where: { id: input.bookingId },
    include: { paymentPlaceholder: true },
  });
  if (!booking) throw new Error("Booking not found");

  if (input.actorType === "CUSTOMER") {
    ensureOwner(booking.userId, input.actorUserId);
  }

  const phase3c5Payment = await derivePhase3C5PaymentState(booking.id);
  if (!phase3c5Payment.eligibleForManualPayment) {
    throw new Error("Booking is not eligible for manual payment options yet");
  }

  return { booking, phase3c5Payment };
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

function assertHandoffGuardrails(flags: HandoffOperationalGuardrailFlags) {
  if (!flags.manualHandoffOnly) throw new Error("Handoff recording must remain manual-only");
  if (!flags.noFinalDispatch) throw new Error("Final dispatch confirmation is not allowed in Phase 3C-3");
  if (!flags.noLiveCarrierApi) throw new Error("Live carrier API usage is not allowed");
  if (!flags.noPakistanPostBookingApi) throw new Error("Pakistan Post booking API usage is not allowed");
  if (!flags.noPickupExecution) throw new Error("Pickup execution is not allowed in Phase 3C-3");
  if (!flags.noDispatchExecution) throw new Error("Dispatch execution is not allowed in Phase 3C-3");
  if (!flags.noFinalBookingConfirmation) throw new Error("Final booking confirmation is not allowed in Phase 3C-3");
}

function parseDriverHandoffSnapshot(value: unknown): DriverHandoffSnapshot | null {
  const obj = toPlainObject(value);
  if (!obj) return null;
  const handoffType = String(obj.handoffType ?? "").trim();
  const fromParty = String(obj.fromParty ?? "").trim();
  const toParty = String(obj.toParty ?? "").trim();
  if (!handoffType || !fromParty || !toParty) return null;
  return {
    bookingNo: String(obj.bookingNo ?? "").trim(),
    handoffType,
    fromParty,
    toParty,
    handoffAt: String(obj.handoffAt ?? "").trim(),
    receivedBy: String(obj.receivedBy ?? "").trim(),
    bundleCondition: String(obj.bundleCondition ?? "").trim(),
    articleCount: toSafeInt(Number(obj.articleCount ?? 0)),
    note: String(obj.note ?? "").trim(),
    manualOnly: true,
    noLiveCarrierApi: true,
    noFinalDispatch: true,
  };
}

function parseHubSortingDispatchSnapshot(value: unknown): HubSortingDispatchSnapshot | null {
  const obj = toPlainObject(value);
  if (!obj) return null;
  const fromWarehouse = String(obj.fromWarehouse ?? "").trim();
  const toSortingFacility = String(obj.toSortingFacility ?? "").trim();
  if (!fromWarehouse || !toSortingFacility) return null;
  return {
    bookingNo: String(obj.bookingNo ?? "").trim(),
    fromWarehouse,
    toSortingFacility,
    dispatchedAt: String(obj.dispatchedAt ?? "").trim(),
    dispatchedBy: String(obj.dispatchedBy ?? "").trim(),
    expectedArticleCount: toSafeInt(Number(obj.expectedArticleCount ?? 0)),
    bundleWeightGrams: obj.bundleWeightGrams == null ? null : toSafeInt(Number(obj.bundleWeightGrams)),
    transportMode: String(obj.transportMode ?? "").trim(),
    note: String(obj.note ?? "").trim(),
    manualOnly: true,
    noPakistanPostBookingApi: true,
    noFinalBookingConfirmation: true,
  };
}

function parseInterFacilityTransferSnapshot(value: unknown): InterFacilityTransferSnapshot | null {
  const obj = toPlainObject(value);
  if (!obj) return null;
  const fromFacility = String(obj.fromFacility ?? "").trim();
  const toFacility = String(obj.toFacility ?? "").trim();
  if (!fromFacility || !toFacility) return null;
  return {
    bookingNo: String(obj.bookingNo ?? "").trim(),
    fromFacility,
    toFacility,
    transferAt: String(obj.transferAt ?? "").trim(),
    transferBy: String(obj.transferBy ?? "").trim(),
    transferReference: normalizeOptionalString(obj.transferReference as string | null | undefined),
    articleCount: toSafeInt(Number(obj.articleCount ?? 0)),
    note: String(obj.note ?? "").trim(),
    manualOnly: true,
    noLiveCarrierApi: true,
    noFinalDispatch: true,
  };
}

function parseReadyForPostalSnapshot(value: unknown): ReadyForPostalSnapshot | null {
  const obj = toPlainObject(value);
  if (!obj) return null;
  const note = String(obj.note ?? "").trim();
  if (!note) return null;
  return {
    bookingNo: String(obj.bookingNo ?? "").trim(),
    readyAt: String(obj.readyAt ?? "").trim(),
    markedBy: String(obj.markedBy ?? "").trim(),
    expectedArticleCount: toSafeInt(Number(obj.expectedArticleCount ?? 0)),
    note,
    manualOnly: true,
    noPakistanPostBookingApi: true,
    finalBookingNotCreated: true,
  };
}

async function derivePhase3C3OperationalState(bookingId: string): Promise<Phase3C3OperationalState> {
  const logs = await prisma.aggregatorBookingAuditLog.findMany({
    where: {
      bookingId,
      action: { in: [...HUB_HANDOFF_AUDIT_ACTIONS] },
    },
    orderBy: { createdAt: "asc" },
    select: { action: true, newValueJson: true, createdAt: true },
  });

  let driverHandoff: DriverHandoffSnapshot | null = null;
  let sortingDispatch: HubSortingDispatchSnapshot | null = null;
  let latestTransfer: InterFacilityTransferSnapshot | null = null;
  let readyForPostal: ReadyForPostalSnapshot | null = null;
  let updatedAt: string | null = null;

  for (const entry of logs) {
    const stamp = entry.createdAt.toISOString();
    if (entry.action === "DRIVER_HANDOFF_RECORDED") {
      const parsed = parseDriverHandoffSnapshot(entry.newValueJson);
      if (parsed) { driverHandoff = parsed; updatedAt = stamp; }
      continue;
    }
    if (entry.action === "HUB_SORTING_DISPATCH_RECORDED") {
      const parsed = parseHubSortingDispatchSnapshot(entry.newValueJson);
      if (parsed) { sortingDispatch = parsed; updatedAt = stamp; }
      continue;
    }
    if (entry.action === "INTER_FACILITY_TRANSFER_RECORDED") {
      const parsed = parseInterFacilityTransferSnapshot(entry.newValueJson);
      if (parsed) { latestTransfer = parsed; updatedAt = stamp; }
      continue;
    }
    if (entry.action === "READY_FOR_FINAL_POSTAL_PROCESSING") {
      const parsed = parseReadyForPostalSnapshot(entry.newValueJson);
      if (parsed) { readyForPostal = parsed; updatedAt = stamp; }
    }
  }

  let currentState: Phase3C3CurrentState = "NOT_STARTED";
  if (driverHandoff) currentState = "DRIVER_HANDOFF_RECORDED";
  if (sortingDispatch) currentState = "HUB_SORTING_DISPATCHED";
  if (latestTransfer) currentState = "INTER_FACILITY_TRANSFER_RECORDED";
  if (readyForPostal) currentState = "READY_FOR_FINAL_POSTAL_PROCESSING";

  return {
    currentState,
    driverHandoff,
    sortingDispatch,
    latestTransfer,
    readyForPostal,
    updatedAt,
    customerNotice: PHASE_3C3_CUSTOMER_NOTICE,
  };
}

function assertFinalProcessingGuardrails(flags: FinalProcessingGuardrailFlags) {
  if (!flags.manualOnly) throw new Error("Final processing prep must remain manual-only");
  if (!flags.noPakistanPostBookingApi) throw new Error("Pakistan Post booking API usage is not allowed");
  if (!flags.noFinalBookingConfirmation) throw new Error("Final booking confirmation is not allowed in Phase 3C-4");
  if (!flags.noLiveBooking) throw new Error("Live booking is not allowed in Phase 3C-4");
  if (!flags.noLabelJobCreation) throw new Error("LabelJob creation is not allowed in Phase 3C-4");
  if (!flags.noUnitConsumption) throw new Error("Unit consumption is not allowed in Phase 3C-4");
  if (!flags.noAutoDispatch) throw new Error("Auto dispatch is not allowed in Phase 3C-4");
}

function normalizeFinalProcessingServiceCode(value: string): FinalProcessingServiceCode {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (!FINAL_PROCESSING_SERVICE_CODES.includes(normalized as FinalProcessingServiceCode)) {
    throw new Error(`Unsupported serviceCode for final processing: ${value}`);
  }
  return normalized as FinalProcessingServiceCode;
}

function buildServiceSummary(rows: FinalProcessingPacketRow[]) {
  const base: Record<FinalProcessingServiceCode, number> = {
    RGL: 0,
    VPL: 0,
    VPP: 0,
    IRL: 0,
    PAR: 0,
    UMS: 0,
    COD: 0,
  };

  for (const row of rows) {
    base[row.serviceCode] += 1;
  }

  return base;
}

function buildReadinessWarnings(services: FinalProcessingServiceCode[]) {
  const warnings: string[] = [];
  const hasVpl = services.includes("VPL");
  const hasVpp = services.includes("VPP");
  const hasCod = services.includes("COD");

  if (hasVpl || hasVpp) {
    warnings.push("MOS readiness review is required for value payable rows (VPL/VPP) before manual final processing.");
  }
  if (hasCod) {
    warnings.push("UMO readiness review is required for COD rows before manual final processing.");
  }

  return warnings;
}

function parseFinalProcessingReadinessSnapshot(value: unknown): FinalProcessingReadinessSnapshot | null {
  const obj = toPlainObject(value);
  if (!obj) return null;
  const bookingNo = String(obj.bookingNo ?? "").trim();
  if (!bookingNo) return null;

  const servicesInput = Array.isArray(obj.servicesIncluded) ? obj.servicesIncluded : [];
  let servicesIncluded: FinalProcessingServiceCode[] = [];
  try {
    servicesIncluded = servicesInput.map((item) => normalizeFinalProcessingServiceCode(String(item ?? "")));
  } catch {
    return null;
  }

  return {
    bookingNo,
    expectedArticleCount: toSafeInt(Number(obj.expectedArticleCount ?? 0)),
    verifiedArticleCount: toSafeInt(Number(obj.verifiedArticleCount ?? 0)),
    servicesIncluded,
    valuePayableIncluded: Boolean(obj.valuePayableIncluded),
    codIncluded: Boolean(obj.codIncluded),
    moRequired: Boolean(obj.moRequired),
    labelReadinessChecked: Boolean(obj.labelReadinessChecked),
    moneyOrderReadinessChecked: Boolean(obj.moneyOrderReadinessChecked),
    exceptions: Array.isArray(obj.exceptions) ? obj.exceptions.map((item) => String(item ?? "").trim()).filter(Boolean) : [],
    note: String(obj.note ?? "").trim(),
    checkedAt: String(obj.checkedAt ?? "").trim(),
    checkedBy: String(obj.checkedBy ?? "").trim(),
    manualOnly: true,
    noPakistanPostBookingApi: true,
    noFinalBookingConfirmation: true,
  };
}

function parseFinalProcessingPacketSnapshot(value: unknown): FinalProcessingPacketSnapshot | null {
  const obj = toPlainObject(value);
  if (!obj) return null;
  const bookingNo = String(obj.bookingNo ?? "").trim();
  const packetNo = String(obj.packetNo ?? "").trim();
  if (!bookingNo || !packetNo) return null;

  const rowsRaw = Array.isArray(obj.articleRows) ? obj.articleRows : [];
  const articleRows: FinalProcessingPacketRow[] = [];
  for (const rowRaw of rowsRaw) {
    const row = toPlainObject(rowRaw);
    if (!row) continue;
    try {
      articleRows.push({
        rowNo: toSafeInt(Number(row.rowNo ?? 0)),
        serviceCode: normalizeFinalProcessingServiceCode(String(row.serviceCode ?? "")),
        articleCategory: String(row.articleCategory ?? "").trim(),
        receiverCity: normalizeOptionalString(row.receiverCity as string | null | undefined),
        chargeableWeightGrams: row.chargeableWeightGrams == null ? null : toSafeInt(Number(row.chargeableWeightGrams ?? 0)),
        totalOfficialPostalCharge: toSafeInt(Number(row.totalOfficialPostalCharge ?? 0)),
      });
    } catch {
      return null;
    }
  }

  return {
    bookingNo,
    packetNo,
    generatedAt: String(obj.generatedAt ?? "").trim(),
    generatedBy: String(obj.generatedBy ?? "").trim(),
    articleRows,
    serviceSummary: buildServiceSummary(articleRows),
    valuePayableSummary: {
      included: articleRows.some((row) => row.serviceCode === "VPL" || row.serviceCode === "VPP" || row.serviceCode === "COD"),
      serviceCodes: articleRows
        .map((row) => row.serviceCode)
        .filter((service): service is "VPL" | "VPP" | "COD" => service === "VPL" || service === "VPP" || service === "COD"),
    },
    codSummary: {
      included: articleRows.some((row) => row.serviceCode === "COD"),
      codArticles: articleRows.filter((row) => row.serviceCode === "COD").length,
    },
    readinessWarnings: Array.isArray(obj.readinessWarnings)
      ? obj.readinessWarnings.map((item) => String(item ?? "").trim()).filter(Boolean)
      : [],
    manualProcessingNotice: String(obj.manualProcessingNotice ?? "").trim(),
    noLiveBooking: true,
  };
}

function parseFinalProcessingExportSnapshot(value: unknown): FinalProcessingExportSnapshot | null {
  const obj = toPlainObject(value);
  if (!obj) return null;
  const packetNo = String(obj.packetNo ?? "").trim();
  if (!packetNo) return null;

  const exportFormatRaw = String(obj.exportFormat ?? "json").trim().toLowerCase();
  const exportFormat: "json" | "csv" = exportFormatRaw === "csv" ? "csv" : "json";

  return {
    bookingNo: String(obj.bookingNo ?? "").trim(),
    packetNo,
    exportedAt: String(obj.exportedAt ?? "").trim(),
    exportedBy: String(obj.exportedBy ?? "").trim(),
    exportFormat,
    note: String(obj.note ?? "").trim(),
    manualOnly: true,
  };
}

function parseFinalProcessingReviewSnapshot(value: unknown): FinalProcessingReviewSnapshot | null {
  const obj = toPlainObject(value);
  if (!obj) return null;
  const packetNo = String(obj.packetNo ?? "").trim();
  if (!packetNo) return null;

  return {
    bookingNo: String(obj.bookingNo ?? "").trim(),
    packetNo,
    reviewedAt: String(obj.reviewedAt ?? "").trim(),
    reviewedBy: String(obj.reviewedBy ?? "").trim(),
    reviewNote: String(obj.reviewNote ?? "").trim(),
    manualOnly: true,
  };
}

async function derivePhase3C4FinalProcessingState(bookingId: string): Promise<Phase3C4FinalProcessingState> {
  const logs = await prisma.aggregatorBookingAuditLog.findMany({
    where: {
      bookingId,
      action: { in: [...FINAL_PROCESSING_AUDIT_ACTIONS] },
    },
    orderBy: { createdAt: "asc" },
    select: { action: true, newValueJson: true, createdAt: true },
  });

  let readiness: FinalProcessingReadinessSnapshot | null = null;
  let packet: FinalProcessingPacketSnapshot | null = null;
  let exportEvent: FinalProcessingExportSnapshot | null = null;
  let reviewEvent: FinalProcessingReviewSnapshot | null = null;
  let updatedAt: string | null = null;

  for (const entry of logs) {
    const stamp = entry.createdAt.toISOString();

    if (entry.action === "FINAL_PROCESSING_READINESS_CHECKED") {
      const parsed = parseFinalProcessingReadinessSnapshot(entry.newValueJson);
      if (parsed) {
        readiness = parsed;
        updatedAt = stamp;
      }
      continue;
    }

    if (entry.action === "FINAL_PROCESSING_PACKET_PREPARED") {
      const parsed = parseFinalProcessingPacketSnapshot(entry.newValueJson);
      if (parsed) {
        packet = parsed;
        updatedAt = stamp;
      }
      continue;
    }

    if (entry.action === "FINAL_PROCESSING_PACKET_EXPORTED") {
      const parsed = parseFinalProcessingExportSnapshot(entry.newValueJson);
      if (parsed) {
        exportEvent = parsed;
        updatedAt = stamp;
      }
      continue;
    }

    if (entry.action === "FINAL_PROCESSING_REVIEW_MARKED") {
      const parsed = parseFinalProcessingReviewSnapshot(entry.newValueJson);
      if (parsed) {
        reviewEvent = parsed;
        updatedAt = stamp;
      }
    }
  }

  let currentState: Phase3C4CurrentState = "NOT_STARTED";
  if (readiness) currentState = "READINESS_CHECKED";
  if (packet) currentState = "PACKET_PREPARED";
  if (exportEvent) currentState = "PACKET_EXPORTED";
  if (reviewEvent) currentState = "REVIEW_COMPLETED";

  return {
    currentState,
    readiness,
    packet,
    exportEvent,
    reviewEvent,
    updatedAt,
    customerNotice: PHASE_3C4_CUSTOMER_NOTICE,
  };
}

async function loadFinalProcessingContext(bookingId: string) {
  const booking = await prisma.aggregatorBooking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      bookingNo: true,
      totalArticles: true,
      items: {
        orderBy: { rowNo: "asc" },
        select: {
          rowNo: true,
          serviceCode: true,
          articleCategory: true,
          receiverCity: true,
          chargeableWeightGrams: true,
          totalOfficialPostalCharge: true,
        },
      },
    },
  });
  if (!booking) throw new Error("Booking not found");

  const phase3c3 = await derivePhase3C3OperationalState(booking.id);
  if (phase3c3.currentState !== "READY_FOR_FINAL_POSTAL_PROCESSING") {
    throw new Error("Phase 3C-3 must be READY_FOR_FINAL_POSTAL_PROCESSING before Phase 3C-4 actions");
  }

  const phase3c4 = await derivePhase3C4FinalProcessingState(booking.id);

  return { booking, phase3c3, phase3c4 };
}

async function loadHandoffContext(bookingId: string) {
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
  if (!eligible.ok) throw new Error(eligible.reason);

  const planning = await findLatestPlanningSelection(booking.id);
  if (!planning) throw new Error("Warehouse and intake carrier selection is required before handoff actions");

  const phase3c2 = await derivePhase3C2OperationalState(booking.id);
  if (phase3c2.currentState !== "MANIFEST_VERIFIED" && phase3c2.currentState !== "EXCEPTION_RESOLVED") {
    throw new Error(
      "Phase 3C-2 manifest verification or exception resolution must be complete before recording handoff events",
    );
  }

  const phase3c3 = await derivePhase3C3OperationalState(booking.id);

  return { booking, planning, phase3c2, phase3c3 };
}

async function appendPlanningMetadata<T extends { id: string }>(booking: T) {
  const [planning, phase3c2Operational, phase3c3Operational, phase3c4FinalProcessing, phase3c5Payment] = await Promise.all([
    findLatestPlanningSelection(booking.id),
    derivePhase3C2OperationalState(booking.id),
    derivePhase3C3OperationalState(booking.id),
    derivePhase3C4FinalProcessingState(booking.id),
    derivePhase3C5PaymentState(booking.id),
  ]);

  return {
    ...booking,
    bulkPackPlanning: planning ?? null,
    phase3c2Operational,
    phase3c3Operational,
    phase3c4FinalProcessing,
    phase3c5Payment,
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

  const senderName = String(input.sender.senderName ?? "").trim();
  const senderPhone = String(input.sender.senderPhone ?? "").trim();
  const senderAddress = String(input.sender.senderAddress ?? "").trim();
  const senderCity = String(input.sender.senderCity ?? "").trim();
  if (!senderName || !senderPhone || !senderAddress || !senderCity) {
    throw new Error("Sender name, phone, address, and city are required");
  }

  const recomputed = buildBookingQuoteSummary(input.rows);
  if ((recomputed.errorRows ?? []).length > 0) {
    throw new Error("Draft request can only be created when quote has zero error rows");
  }
  const requestPayload = {
    requestOnly: input.requestFlags.requestOnly,
    noPayment: input.requestFlags.noPayment,
    noLiveBooking: input.requestFlags.noLiveBooking,
    noPickupExecution: input.requestFlags.noPickupExecution,
    selectedOption: input.selectedOption,
      senderDetails: {
        ...input.sender,
        senderName,
        senderPhone,
        senderAddress,
        senderCity,
      },
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
        status: "ADMIN_REVIEW_PENDING",
        intakeMethod: input.sender.intakeMethod,
        hubCity: input.sender.hubCity,
        senderName,
        senderPhone,
        senderAddress,
        senderCity,
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
        adminReviewStatus: "PENDING",
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
        toStatus: "ADMIN_REVIEW_PENDING",
        actorType: actor.actorType,
        actorUserId: actor.actorUserId,
        reasonCode: "QUOTE_CONVERTED",
        note: "Quote converted to draft request and queued for admin review.",
      },
    });

    await tx.aggregatorBookingAuditLog.create({
      data: {
        bookingId: booking.id,
        action: "QUOTE_CONVERTED_TO_DRAFT_REQUEST",
        actorType: actor.actorType,
        actorUserId: actor.actorUserId,
        targetField: "status",
        oldValueJson: "QUOTE_READY" as unknown as JsonValue,
        newValueJson: "ADMIN_REVIEW_PENDING" as unknown as JsonValue,
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
      action: "BOOKING_DRAFT_REQUEST_CREATED",
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

export async function adminRecordDriverHandoff(input: {
  bookingId: string;
  adminUserId: string;
  handoffType: string;
  fromParty: string;
  toParty: string;
  receivedBy: string;
  bundleCondition: string;
  articleCount: number;
  note: string;
  manualFlags: HandoffOperationalGuardrailFlags;
  context?: RequestContext;
}) {
  assertHandoffGuardrails(input.manualFlags);
  const context = await loadHandoffContext(input.bookingId);

  const snapshot: DriverHandoffSnapshot = {
    bookingNo: context.booking.bookingNo,
    handoffType: String(input.handoffType ?? "").trim(),
    fromParty: String(input.fromParty ?? "").trim(),
    toParty: String(input.toParty ?? "").trim(),
    handoffAt: new Date().toISOString(),
    receivedBy: input.adminUserId,
    bundleCondition: String(input.bundleCondition ?? "").trim(),
    articleCount: toSafeInt(input.articleCount),
    note: String(input.note ?? "").trim(),
    manualOnly: true,
    noLiveCarrierApi: true,
    noFinalDispatch: true,
  };

  await writeAuditLog({
    bookingId: context.booking.id,
    action: "DRIVER_HANDOFF_RECORDED",
    actor: { actorType: "ADMIN", actorUserId: input.adminUserId },
    targetField: "driver_handoff",
    oldValueJson: undefined,
    newValueJson: snapshot as unknown as JsonValue,
    context: input.context,
  });

  return {
    bookingId: context.booking.id,
    driverHandoff: snapshot,
    phase3c3Operational: await derivePhase3C3OperationalState(context.booking.id),
  };
}

export async function adminRecordHubSortingDispatch(input: {
  bookingId: string;
  adminUserId: string;
  fromWarehouse: string;
  toSortingFacility: string;
  dispatchedBy: string;
  expectedArticleCount: number;
  bundleWeightGrams?: number | null;
  transportMode: string;
  note: string;
  manualFlags: HandoffOperationalGuardrailFlags;
  context?: RequestContext;
}) {
  assertHandoffGuardrails(input.manualFlags);
  const context = await loadHandoffContext(input.bookingId);

  if (!context.phase3c2.hubReceiving) {
    throw new Error("Hub receiving must be marked before recording sorting dispatch");
  }

  const snapshot: HubSortingDispatchSnapshot = {
    bookingNo: context.booking.bookingNo,
    fromWarehouse: String(input.fromWarehouse ?? "").trim(),
    toSortingFacility: String(input.toSortingFacility ?? "").trim(),
    dispatchedAt: new Date().toISOString(),
    dispatchedBy: input.adminUserId,
    expectedArticleCount: toSafeInt(input.expectedArticleCount),
    bundleWeightGrams:
      input.bundleWeightGrams == null ? null : toSafeInt(input.bundleWeightGrams),
    transportMode: String(input.transportMode ?? "").trim(),
    note: String(input.note ?? "").trim(),
    manualOnly: true,
    noPakistanPostBookingApi: true,
    noFinalBookingConfirmation: true,
  };

  await writeAuditLog({
    bookingId: context.booking.id,
    action: "HUB_SORTING_DISPATCH_RECORDED",
    actor: { actorType: "ADMIN", actorUserId: input.adminUserId },
    targetField: "hub_sorting_dispatch",
    oldValueJson: undefined,
    newValueJson: snapshot as unknown as JsonValue,
    context: input.context,
  });

  return {
    bookingId: context.booking.id,
    sortingDispatch: snapshot,
    phase3c3Operational: await derivePhase3C3OperationalState(context.booking.id),
  };
}

export async function adminRecordInterFacilityTransfer(input: {
  bookingId: string;
  adminUserId: string;
  fromFacility: string;
  toFacility: string;
  transferBy: string;
  transferReference?: string | null;
  articleCount: number;
  note: string;
  manualFlags: HandoffOperationalGuardrailFlags;
  context?: RequestContext;
}) {
  assertHandoffGuardrails(input.manualFlags);
  const context = await loadHandoffContext(input.bookingId);

  if (!context.phase3c3.sortingDispatch) {
    throw new Error("Hub sorting dispatch must be recorded before recording inter-facility transfer");
  }

  const snapshot: InterFacilityTransferSnapshot = {
    bookingNo: context.booking.bookingNo,
    fromFacility: String(input.fromFacility ?? "").trim(),
    toFacility: String(input.toFacility ?? "").trim(),
    transferAt: new Date().toISOString(),
    transferBy: input.adminUserId,
    transferReference: normalizeOptionalString(input.transferReference),
    articleCount: toSafeInt(input.articleCount),
    note: String(input.note ?? "").trim(),
    manualOnly: true,
    noLiveCarrierApi: true,
    noFinalDispatch: true,
  };

  await writeAuditLog({
    bookingId: context.booking.id,
    action: "INTER_FACILITY_TRANSFER_RECORDED",
    actor: { actorType: "ADMIN", actorUserId: input.adminUserId },
    targetField: "inter_facility_transfer",
    oldValueJson: undefined,
    newValueJson: snapshot as unknown as JsonValue,
    context: input.context,
  });

  return {
    bookingId: context.booking.id,
    transfer: snapshot,
    phase3c3Operational: await derivePhase3C3OperationalState(context.booking.id),
  };
}

export async function adminMarkReadyForFinalPostal(input: {
  bookingId: string;
  adminUserId: string;
  expectedArticleCount: number;
  note: string;
  manualFlags: HandoffOperationalGuardrailFlags;
  context?: RequestContext;
}) {
  assertHandoffGuardrails(input.manualFlags);
  const context = await loadHandoffContext(input.bookingId);

  if (!context.phase3c3.sortingDispatch) {
    throw new Error("Hub sorting dispatch must be recorded before marking ready for final postal processing");
  }

  const snapshot: ReadyForPostalSnapshot = {
    bookingNo: context.booking.bookingNo,
    readyAt: new Date().toISOString(),
    markedBy: input.adminUserId,
    expectedArticleCount: toSafeInt(input.expectedArticleCount),
    note: String(input.note ?? "").trim(),
    manualOnly: true,
    noPakistanPostBookingApi: true,
    finalBookingNotCreated: true,
  };

  await writeAuditLog({
    bookingId: context.booking.id,
    action: "READY_FOR_FINAL_POSTAL_PROCESSING",
    actor: { actorType: "ADMIN", actorUserId: input.adminUserId },
    targetField: "ready_for_postal_processing",
    oldValueJson: undefined,
    newValueJson: snapshot as unknown as JsonValue,
    context: input.context,
  });

  return {
    bookingId: context.booking.id,
    readyForPostal: snapshot,
    phase3c3Operational: await derivePhase3C3OperationalState(context.booking.id),
  };
}

function containsForbiddenFinalBookingWording(value: string | null | undefined) {
  const text = String(value ?? "").trim();
  if (!text) return false;
  return /(final\s+booking\s+confirmation|pakistan\s+post\s+booking\s+confirmed|booking\s+confirmed)/i.test(text);
}

export async function adminCheckFinalProcessingReadiness(input: {
  bookingId: string;
  adminUserId: string;
  expectedArticleCount: number;
  verifiedArticleCount: number;
  servicesIncluded: string[];
  exceptions: string[];
  note?: string;
  manualFlags: FinalProcessingGuardrailFlags;
  context?: RequestContext;
}) {
  assertFinalProcessingGuardrails(input.manualFlags);

  if (containsForbiddenFinalBookingWording(input.note)) {
    throw new Error("Final booking confirmation wording is not allowed in readiness notes");
  }

  const context = await loadFinalProcessingContext(input.bookingId);
  const servicesIncluded = input.servicesIncluded.map((item) => normalizeFinalProcessingServiceCode(item));
  const valuePayableIncluded = servicesIncluded.some((service) => service === "VPL" || service === "VPP" || service === "COD");
  const codIncluded = servicesIncluded.includes("COD");
  const moRequired = valuePayableIncluded;

  const snapshot: FinalProcessingReadinessSnapshot = {
    bookingNo: context.booking.bookingNo,
    expectedArticleCount: toSafeInt(input.expectedArticleCount || context.booking.totalArticles),
    verifiedArticleCount: toSafeInt(input.verifiedArticleCount),
    servicesIncluded,
    valuePayableIncluded,
    codIncluded,
    moRequired,
    labelReadinessChecked: true,
    moneyOrderReadinessChecked: true,
    exceptions: (input.exceptions ?? []).map((item) => String(item ?? "").trim()).filter(Boolean),
    note: String(input.note ?? "Manual readiness reviewed for final postal processing packet preparation.").trim(),
    checkedAt: new Date().toISOString(),
    checkedBy: input.adminUserId,
    manualOnly: true,
    noPakistanPostBookingApi: true,
    noFinalBookingConfirmation: true,
  };

  await writeAuditLog({
    bookingId: context.booking.id,
    action: "FINAL_PROCESSING_READINESS_CHECKED",
    actor: { actorType: "ADMIN", actorUserId: input.adminUserId },
    targetField: "final_processing_readiness",
    oldValueJson: undefined,
    newValueJson: snapshot as unknown as JsonValue,
    context: input.context,
  });

  return {
    bookingId: context.booking.id,
    readiness: snapshot,
    phase3c4FinalProcessing: await derivePhase3C4FinalProcessingState(context.booking.id),
  };
}

export async function adminPrepareFinalProcessingPacket(input: {
  bookingId: string;
  adminUserId: string;
  packetNo?: string;
  articleRows: Array<{
    rowNo: number;
    serviceCode: string;
    articleCategory: string;
    receiverCity?: string | null;
    chargeableWeightGrams?: number | null;
    totalOfficialPostalCharge?: number;
  }>;
  readinessWarnings: string[];
  note?: string;
  manualFlags: FinalProcessingGuardrailFlags;
  context?: RequestContext;
}) {
  assertFinalProcessingGuardrails(input.manualFlags);

  if (containsForbiddenFinalBookingWording(input.note)) {
    throw new Error("Final booking confirmation wording is not allowed in packet notes");
  }

  const context = await loadFinalProcessingContext(input.bookingId);
  if (!context.phase3c4.readiness) {
    throw new Error("Final processing readiness must be checked before packet preparation");
  }

  const packetNo = normalizeOptionalString(input.packetNo) ?? `FPP-${context.booking.bookingNo}-${nowIsoCompact()}`;

  const rows: FinalProcessingPacketRow[] = input.articleRows.map((row) => ({
    rowNo: toSafeInt(row.rowNo),
    serviceCode: normalizeFinalProcessingServiceCode(row.serviceCode),
    articleCategory: String(row.articleCategory ?? "").trim(),
    receiverCity: normalizeOptionalString(row.receiverCity),
    chargeableWeightGrams: row.chargeableWeightGrams == null ? null : toSafeInt(row.chargeableWeightGrams),
    totalOfficialPostalCharge: toSafeInt(row.totalOfficialPostalCharge ?? 0),
  }));

  const serviceSummary = buildServiceSummary(rows);
  const valuePayableServiceCodes = rows
    .map((row) => row.serviceCode)
    .filter((service): service is "VPL" | "VPP" | "COD" => service === "VPL" || service === "VPP" || service === "COD");

  const derivedWarnings = buildReadinessWarnings(rows.map((row) => row.serviceCode));
  const readinessWarnings = [...new Set([...(input.readinessWarnings ?? []).map((item) => String(item ?? "").trim()).filter(Boolean), ...derivedWarnings])];

  const snapshot: FinalProcessingPacketSnapshot = {
    bookingNo: context.booking.bookingNo,
    packetNo,
    generatedAt: new Date().toISOString(),
    generatedBy: input.adminUserId,
    articleRows: rows,
    serviceSummary,
    valuePayableSummary: {
      included: valuePayableServiceCodes.length > 0,
      serviceCodes: [...new Set(valuePayableServiceCodes)],
    },
    codSummary: {
      included: rows.some((row) => row.serviceCode === "COD"),
      codArticles: rows.filter((row) => row.serviceCode === "COD").length,
    },
    readinessWarnings,
    manualProcessingNotice:
      "This is manual final postal processing preparation only. It does not create Pakistan Post booking or final dispatch.",
    noLiveBooking: true,
  };

  await writeAuditLog({
    bookingId: context.booking.id,
    action: "FINAL_PROCESSING_PACKET_PREPARED",
    actor: { actorType: "ADMIN", actorUserId: input.adminUserId },
    targetField: "final_processing_packet",
    oldValueJson: undefined,
    newValueJson: snapshot as unknown as JsonValue,
    context: input.context,
  });

  return {
    bookingId: context.booking.id,
    packet: snapshot,
    phase3c4FinalProcessing: await derivePhase3C4FinalProcessingState(context.booking.id),
  };
}

export async function adminMarkFinalProcessingPacketExported(input: {
  bookingId: string;
  adminUserId: string;
  packetNo: string;
  exportFormat: "json" | "csv";
  note?: string;
  manualFlags: FinalProcessingGuardrailFlags;
  context?: RequestContext;
}) {
  assertFinalProcessingGuardrails(input.manualFlags);

  if (containsForbiddenFinalBookingWording(input.note)) {
    throw new Error("Final booking confirmation wording is not allowed in export notes");
  }

  const context = await loadFinalProcessingContext(input.bookingId);
  if (!context.phase3c4.packet) {
    throw new Error("Packet must be prepared before marking it exported");
  }

  const snapshot: FinalProcessingExportSnapshot = {
    bookingNo: context.booking.bookingNo,
    packetNo: String(input.packetNo ?? "").trim(),
    exportedAt: new Date().toISOString(),
    exportedBy: input.adminUserId,
    exportFormat: input.exportFormat === "csv" ? "csv" : "json",
    note: String(input.note ?? "Manual packet export marked for operator handling.").trim(),
    manualOnly: true,
  };

  await writeAuditLog({
    bookingId: context.booking.id,
    action: "FINAL_PROCESSING_PACKET_EXPORTED",
    actor: { actorType: "ADMIN", actorUserId: input.adminUserId },
    targetField: "final_processing_packet_export",
    oldValueJson: undefined,
    newValueJson: snapshot as unknown as JsonValue,
    context: input.context,
  });

  return {
    bookingId: context.booking.id,
    exportEvent: snapshot,
    phase3c4FinalProcessing: await derivePhase3C4FinalProcessingState(context.booking.id),
  };
}

export async function adminMarkFinalProcessingReviewed(input: {
  bookingId: string;
  adminUserId: string;
  packetNo: string;
  reviewNote: string;
  manualFlags: FinalProcessingGuardrailFlags;
  context?: RequestContext;
}) {
  assertFinalProcessingGuardrails(input.manualFlags);

  if (containsForbiddenFinalBookingWording(input.reviewNote)) {
    throw new Error("Final booking confirmation wording is not allowed in review note");
  }

  const context = await loadFinalProcessingContext(input.bookingId);
  if (!context.phase3c4.packet) {
    throw new Error("Packet must be prepared before review completion");
  }

  const snapshot: FinalProcessingReviewSnapshot = {
    bookingNo: context.booking.bookingNo,
    packetNo: String(input.packetNo ?? "").trim(),
    reviewedAt: new Date().toISOString(),
    reviewedBy: input.adminUserId,
    reviewNote: String(input.reviewNote ?? "").trim(),
    manualOnly: true,
  };

  await writeAuditLog({
    bookingId: context.booking.id,
    action: "FINAL_PROCESSING_REVIEW_MARKED",
    actor: { actorType: "ADMIN", actorUserId: input.adminUserId },
    targetField: "final_processing_review",
    oldValueJson: undefined,
    newValueJson: snapshot as unknown as JsonValue,
    context: input.context,
  });

  return {
    bookingId: context.booking.id,
    reviewEvent: snapshot,
    phase3c4FinalProcessing: await derivePhase3C4FinalProcessingState(context.booking.id),
  };
}

export async function adminGetFinalProcessingPacket(input: { bookingId: string }) {
  const context = await loadFinalProcessingContext(input.bookingId);
  return context.phase3c4.packet;
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

export async function getAggregatorPaymentOptions(input: {
  bookingId: string;
  userId: string;
  context?: RequestContext;
}) {
  const actor: Actor = { actorType: "CUSTOMER", actorUserId: input.userId };
  const { booking, phase3c5Payment } = await loadAggregatorPaymentContext({
    bookingId: input.bookingId,
    actorUserId: input.userId,
    actorType: "CUSTOMER",
  });

  await writeAuditLog({
    bookingId: booking.id,
    action: "AGGREGATOR_PAYMENT_OPTIONS_SHOWN",
    actor,
    targetField: "phase3c5_payment",
    oldValueJson: undefined,
    newValueJson: {
      currentState: phase3c5Payment.currentState,
      options: AGGREGATOR_MANUAL_PAYMENT_METHODS,
      shownAt: new Date().toISOString(),
      manualOnly: true,
      noLiveGateway: true,
      noSubscriptionMutation: true,
      noInvoiceMutation: true,
      noPickupExecution: true,
      noDispatchExecution: true,
      noPakistanPostBookingApi: true,
      noFinalBookingConfirmation: true,
    } as unknown as JsonValue,
    context: input.context,
  });

  return {
    bookingId: booking.id,
    methods: [...AGGREGATOR_MANUAL_PAYMENT_METHODS],
    paymentState: await derivePhase3C5PaymentState(booking.id),
    notice: PHASE_3C5_CUSTOMER_NOTICE,
  };
}

export async function submitAggregatorManualPayment(input: {
  bookingId: string;
  userId: string;
  method: AggregatorManualPaymentMethod;
  amount: number;
  currency?: string;
  reference?: string | null;
  payerName: string;
  proofNote: string;
  manualFlags: ManualPaymentGuardrailFlags;
  context?: RequestContext;
}) {
  assertManualPaymentGuardrails(input.manualFlags);

  const actor: Actor = { actorType: "CUSTOMER", actorUserId: input.userId };
  const { booking, phase3c5Payment } = await loadAggregatorPaymentContext({
    bookingId: input.bookingId,
    actorUserId: input.userId,
    actorType: "CUSTOMER",
  });

  if (phase3c5Payment.currentState === "MANUAL_PAYMENT_VERIFIED") {
    throw new Error("Manual payment has already been verified for this booking");
  }

  const normalizedReference = normalizeOptionalString(input.reference);
  const amount = toSafeInt(input.amount);
  if (amount <= 0) throw new Error("Manual payment amount must be greater than 0");

  const snapshot: Phase3C5ManualSubmissionSnapshot = {
    method: input.method,
    amount,
    currency: String(input.currency ?? "PKR").trim().toUpperCase() || "PKR",
    reference: normalizedReference,
    payerName: String(input.payerName ?? "").trim(),
    proofNote: String(input.proofNote ?? "").trim(),
    submittedBy: input.userId,
    submittedAt: new Date().toISOString(),
    manualOnly: true,
    noLiveGateway: true,
    noSubscriptionMutation: true,
    noInvoiceMutation: true,
    noPickupExecution: true,
    noDispatchExecution: true,
    noPakistanPostBookingApi: true,
    noFinalBookingConfirmation: true,
  };

  if (!snapshot.payerName || !snapshot.proofNote) {
    throw new Error("payerName and proofNote are required for manual payment submission");
  }

  await prisma.$transaction(async (tx) => {
    await tx.aggregatorPaymentPlaceholder.upsert({
      where: { bookingId: booking.id },
      create: {
        bookingId: booking.id,
        paymentStatus: "PENDING_PLACEHOLDER",
        placeholderMethod: snapshot.method,
        placeholderReference: snapshot.reference,
        placeholderAmount: snapshot.amount,
        placeholderCurrency: snapshot.currency,
      },
      update: {
        paymentStatus: "PENDING_PLACEHOLDER",
        placeholderMethod: snapshot.method,
        placeholderReference: snapshot.reference,
        placeholderAmount: snapshot.amount,
        placeholderCurrency: snapshot.currency,
      },
    });

    await tx.aggregatorBookingAuditLog.create({
      data: {
        bookingId: booking.id,
        action: "AGGREGATOR_MANUAL_PAYMENT_SUBMITTED",
        actorType: actor.actorType,
        actorUserId: actor.actorUserId,
        targetField: "phase3c5_payment",
        oldValueJson: undefined,
        newValueJson: snapshot as unknown as JsonValue,
      },
    });
  });

  return {
    bookingId: booking.id,
    paymentState: await derivePhase3C5PaymentState(booking.id),
  };
}

export async function adminVerifyAggregatorManualPayment(input: {
  bookingId: string;
  adminUserId: string;
  verificationNote: string;
  verifiedReference?: string | null;
  manualFlags: ManualPaymentGuardrailFlags;
  context?: RequestContext;
}) {
  assertManualPaymentGuardrails(input.manualFlags);

  const actor: Actor = { actorType: "ADMIN", actorUserId: input.adminUserId };
  const { booking, phase3c5Payment } = await loadAggregatorPaymentContext({
    bookingId: input.bookingId,
    actorUserId: input.adminUserId,
    actorType: "ADMIN",
  });

  if (!phase3c5Payment.latestSubmission) {
    throw new Error("Manual payment submission is required before verification");
  }

  const verificationNote = String(input.verificationNote ?? "").trim();
  if (!verificationNote) {
    throw new Error("Verification note is required");
  }

  const verifiedReference = normalizeOptionalString(input.verifiedReference) ?? phase3c5Payment.latestSubmission.reference;
  const snapshot: Phase3C5ManualVerificationSnapshot = {
    method: phase3c5Payment.latestSubmission.method,
    amount: phase3c5Payment.latestSubmission.amount,
    currency: phase3c5Payment.latestSubmission.currency,
    reference: verifiedReference,
    payerName: phase3c5Payment.latestSubmission.payerName,
    proofNote: phase3c5Payment.latestSubmission.proofNote,
    verifiedBy: input.adminUserId,
    verificationNote,
    verifiedAt: new Date().toISOString(),
    manualOnly: true,
    noLiveGateway: true,
    noSubscriptionMutation: true,
    noInvoiceMutation: true,
    noPickupExecution: true,
    noDispatchExecution: true,
    noPakistanPostBookingApi: true,
    noFinalBookingConfirmation: true,
  };

  await prisma.$transaction(async (tx) => {
    await tx.aggregatorPaymentPlaceholder.upsert({
      where: { bookingId: booking.id },
      create: {
        bookingId: booking.id,
        paymentStatus: "MARKED_FOR_OFFLINE_COLLECTION",
        placeholderMethod: snapshot.method,
        placeholderReference: snapshot.reference,
        placeholderAmount: snapshot.amount,
        placeholderCurrency: snapshot.currency,
      },
      update: {
        paymentStatus: "MARKED_FOR_OFFLINE_COLLECTION",
        placeholderMethod: snapshot.method,
        placeholderReference: snapshot.reference,
        placeholderAmount: snapshot.amount,
        placeholderCurrency: snapshot.currency,
      },
    });

    await tx.aggregatorBookingAuditLog.create({
      data: {
        bookingId: booking.id,
        action: "AGGREGATOR_MANUAL_PAYMENT_VERIFIED",
        actorType: actor.actorType,
        actorUserId: actor.actorUserId,
        targetField: "phase3c5_payment",
        oldValueJson: undefined,
        newValueJson: snapshot as unknown as JsonValue,
      },
    });
  });

  return {
    bookingId: booking.id,
    paymentState: await derivePhase3C5PaymentState(booking.id),
  };
}

export async function adminRejectAggregatorManualPayment(input: {
  bookingId: string;
  adminUserId: string;
  rejectionReason: string;
  rejectionNote?: string;
  manualFlags: ManualPaymentGuardrailFlags;
  context?: RequestContext;
}) {
  assertManualPaymentGuardrails(input.manualFlags);

  const actor: Actor = { actorType: "ADMIN", actorUserId: input.adminUserId };
  const { booking } = await loadAggregatorPaymentContext({
    bookingId: input.bookingId,
    actorUserId: input.adminUserId,
    actorType: "ADMIN",
  });

  const rejectionReason = String(input.rejectionReason ?? "").trim();
  if (!rejectionReason) {
    throw new Error("Rejection reason is required");
  }

  const snapshot: Phase3C5ManualRejectionSnapshot = {
    rejectedBy: input.adminUserId,
    rejectionReason,
    rejectionNote: normalizeOptionalString(input.rejectionNote),
    rejectedAt: new Date().toISOString(),
    manualOnly: true,
    noLiveGateway: true,
    noSubscriptionMutation: true,
    noInvoiceMutation: true,
    noPickupExecution: true,
    noDispatchExecution: true,
    noPakistanPostBookingApi: true,
    noFinalBookingConfirmation: true,
  };

  await prisma.$transaction(async (tx) => {
    await tx.aggregatorPaymentPlaceholder.upsert({
      where: { bookingId: booking.id },
      create: {
        bookingId: booking.id,
        paymentStatus: "PENDING_PLACEHOLDER",
      },
      update: {
        paymentStatus: "PENDING_PLACEHOLDER",
      },
    });

    await tx.aggregatorBookingAuditLog.create({
      data: {
        bookingId: booking.id,
        action: "AGGREGATOR_MANUAL_PAYMENT_REJECTED",
        actorType: actor.actorType,
        actorUserId: actor.actorUserId,
        targetField: "phase3c5_payment",
        oldValueJson: undefined,
        newValueJson: snapshot as unknown as JsonValue,
      },
    });
  });

  return {
    bookingId: booking.id,
    paymentState: await derivePhase3C5PaymentState(booking.id),
  };
}

export async function adminCancelAggregatorManualPayment(input: {
  bookingId: string;
  adminUserId: string;
  cancellationReason: string;
  cancellationNote?: string;
  manualFlags: ManualPaymentGuardrailFlags;
  context?: RequestContext;
}) {
  assertManualPaymentGuardrails(input.manualFlags);

  const actor: Actor = { actorType: "ADMIN", actorUserId: input.adminUserId };
  const { booking } = await loadAggregatorPaymentContext({
    bookingId: input.bookingId,
    actorUserId: input.adminUserId,
    actorType: "ADMIN",
  });

  const cancellationReason = String(input.cancellationReason ?? "").trim();
  if (!cancellationReason) {
    throw new Error("Cancellation reason is required");
  }

  const snapshot: Phase3C5ManualCancellationSnapshot = {
    cancelledBy: input.adminUserId,
    cancellationReason,
    cancellationNote: normalizeOptionalString(input.cancellationNote),
    cancelledAt: new Date().toISOString(),
    manualOnly: true,
    noLiveGateway: true,
    noSubscriptionMutation: true,
    noInvoiceMutation: true,
    noPickupExecution: true,
    noDispatchExecution: true,
    noPakistanPostBookingApi: true,
    noFinalBookingConfirmation: true,
  };

  await prisma.$transaction(async (tx) => {
    await tx.aggregatorPaymentPlaceholder.upsert({
      where: { bookingId: booking.id },
      create: {
        bookingId: booking.id,
        paymentStatus: "NOT_INITIATED",
      },
      update: {
        paymentStatus: "NOT_INITIATED",
      },
    });

    await tx.aggregatorBookingAuditLog.create({
      data: {
        bookingId: booking.id,
        action: "AGGREGATOR_MANUAL_PAYMENT_CANCELLED",
        actorType: actor.actorType,
        actorUserId: actor.actorUserId,
        targetField: "phase3c5_payment",
        oldValueJson: undefined,
        newValueJson: snapshot as unknown as JsonValue,
      },
    });
  });

  return {
    bookingId: booking.id,
    paymentState: await derivePhase3C5PaymentState(booking.id),
  };
}
