import { z } from "zod";
import {
  ADMIN_REVIEW_STATUSES,
  INTAKE_METHODS,
  PAYMENT_PLACEHOLDER_STATUSES,
} from "../services/aggregatorBookingStatusService.js";

const quoteRowSchema = z.record(z.unknown());

const quoteResultRowSchema = z.object({
  rowNumber: z.number().int().positive(),
  serviceCode: z.string(),
  senderCity: z.string().optional().default(""),
  receiverCity: z.string().optional().default(""),
  result: z.object({
    articleCategory: z.string(),
    postalProduct: z.string(),
    weightGrams: z.number().nullable(),
    chargeableWeightGrams: z.number().nullable(),
    basePostageAmount: z.number().nullable(),
    registrationFeeAmount: z.number().nullable(),
    valuePayableFeeAmount: z.number().nullable(),
    insuranceFeeAmount: z.number().nullable(),
    totalOfficialPostalCharge: z.number().nullable(),
    appliedComponents: z.array(z.string()),
    missingComponents: z.array(z.string()),
    matchedRateCards: z.array(z.string()),
    matchedSlabs: z.array(z.string()),
    warnings: z.array(z.string()),
    errors: z.array(z.string()),
  }),
});

const quoteSummarySchema = z.object({
  totalArticles: z.number().int().min(0),
  totalActualWeightGrams: z.number().min(0),
  totalChargeableWeightGrams: z.number().min(0),
  totalPostageAmount: z.number().min(0),
  totalBasePostage: z.number().min(0),
  totalRegistrationFee: z.number().min(0),
  totalValuePayableFee: z.number().min(0),
  totalInsuranceFee: z.number().min(0),
  totalOfficialPostalCharge: z.number().min(0),
  byCategory: z.array(
    z.object({
      key: z.string(),
      totalArticles: z.number().int().min(0),
      totalActualWeightGrams: z.number().min(0),
      totalChargeableWeightGrams: z.number().min(0),
      totalPostageAmount: z.number().min(0),
    }),
  ),
  byProduct: z.array(
    z.object({
      key: z.string(),
      totalArticles: z.number().int().min(0),
      totalActualWeightGrams: z.number().min(0),
      totalChargeableWeightGrams: z.number().min(0),
      totalPostageAmount: z.number().min(0),
    }),
  ),
  perArticlePostageBreakdown: z.array(quoteResultRowSchema),
  warningRows: z.array(z.object({ rowNumber: z.number().int().positive(), warnings: z.array(z.string()) })),
  errorRows: z.array(z.object({ rowNumber: z.number().int().positive(), errors: z.array(z.string()) })),
}).superRefine((summary, ctx) => {
  if (summary.totalChargeableWeightGrams < summary.totalActualWeightGrams) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["totalChargeableWeightGrams"],
      message: "totalChargeableWeightGrams must be greater than or equal to totalActualWeightGrams.",
    });
  }
  if (summary.totalPostageAmount > summary.totalOfficialPostalCharge) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["totalPostageAmount"],
      message: "totalPostageAmount cannot exceed totalOfficialPostalCharge.",
    });
  }
});

const recommendationSnapshotSchema = z.object({
  eligibility: z.enum(["recommended", "review_required", "not_recommended"]),
  blockers: z.array(z.string()),
  advisoryNotes: z.array(z.string()),
  valuePayableGuard: z.boolean(),
  requestPreviewAllowed: z.boolean(),
});

const requestFlagsSchema = z.object({
  requestOnly: z.literal(true),
  noPayment: z.literal(true),
  noLiveBooking: z.literal(true),
  noPickupExecution: z.literal(true),
  customerNoticeAccepted: z.literal(true),
});

const senderDetailsSchema = z.object({
  senderName: z.string().trim().min(2).max(120),
  senderPhone: z.string().trim().min(6).max(40),
  senderAddress: z.string().trim().min(5).max(500),
  senderCity: z.string().trim().min(2).max(120),
  specialInstructions: z.string().trim().max(2000).optional().nullable(),
  intakeMethod: z.enum(INTAKE_METHODS),
  hubCity: z.string().trim().min(2).max(120),
});

const quoteSourceFileMetadataSchema = z
  .object({
    sourceFileKey: z.string().trim().min(1).max(1024).optional(),
    sourceObjectKey: z.string().trim().min(1).max(1024).optional(),
    sourceBucket: z.string().trim().min(1).max(255),
    sourceSizeBytes: z.number().int().min(0).max(1024 * 1024 * 1024).optional(),
    sourceContentType: z.string().trim().min(1).max(255).optional(),
    sourceChecksum: z.string().trim().min(1).max(255).optional(),
    sourceOriginalFilename: z.string().trim().min(1).max(255).optional(),
    sourceUploadedAt: z.string().datetime().optional(),
  })
  .strict()
  .refine((value) => Boolean(value.sourceFileKey || value.sourceObjectKey), {
    message: "sourceFileKey or sourceObjectKey is required",
    path: ["sourceFileKey"],
  });

export const BOOKING_DOCUMENT_UPLOAD_STATUSES = ["PENDING", "R2_SYNCED", "FAILED"] as const;
export const BOOKING_DOCUMENT_LOCAL_CLEANUP_STATUSES = ["NOT_REQUIRED", "PENDING", "DELETED", "FAILED"] as const;

export const createBookingDocumentMetadataSchema = z.object({
  docType: z.string().trim().min(2).max(80),
  bucket: z.string().trim().min(1).max(255),
  objectKey: z.string().trim().min(1).max(1024),
  sizeBytes: z.number().int().min(0).max(2 * 1024 * 1024 * 1024).optional(),
  contentType: z.string().trim().min(1).max(255).optional(),
  checksum: z.string().trim().min(1).max(255).optional(),
  originalFileName: z.string().trim().min(1).max(255),
  uploadStatus: z.enum(BOOKING_DOCUMENT_UPLOAD_STATUSES).default("R2_SYNCED"),
  localTempPath: z.string().trim().min(1).max(1024).optional(),
  localCleanupStatus: z.enum(BOOKING_DOCUMENT_LOCAL_CLEANUP_STATUSES).optional(),
});

export const convertQuoteToDraftSchema = z.object({
  quoteVersion: z.string().trim().min(1).max(40).default("v1.5"),
  rows: z.array(quoteRowSchema).min(1),
  quoteSummary: quoteSummarySchema,
  rateCardVersionSet: z.record(z.string()).default({}),
  expiresAt: z.string().datetime().optional(),
  sender: senderDetailsSchema,
  sourceFile: quoteSourceFileMetadataSchema.optional(),
  selectedOption: z.enum(["DROP_AT_COLLECTION_POINT", "PICKUP_TO_HUB_PLANNING", "DIRECT_COURIER_OR_SELF_DROP_ADVISORY"]),
  recommendationSnapshot: recommendationSnapshotSchema,
  requestFlags: requestFlagsSchema,
}).superRefine((payload, ctx) => {
  if (payload.recommendationSnapshot.blockers.includes("OVER_PHASE_LIMIT")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["recommendationSnapshot", "blockers"],
      message: "Draft request cannot be created while OVER_PHASE_LIMIT blocker is present.",
    });
  }
});

export const createBookingDraftSchema = z.object({
  aggregatorQuoteId: z.string().trim().min(1),
  sender: senderDetailsSchema,
});

export const updateBookingDraftSchema = z.object({
  senderName: z.string().trim().min(2).max(120).optional(),
  senderPhone: z.string().trim().min(6).max(40).optional(),
  senderAddress: z.string().trim().min(5).max(500).optional(),
  senderCity: z.string().trim().min(2).max(120).optional(),
  specialInstructions: z.string().trim().max(2000).nullable().optional(),
  intakeMethod: z.enum(INTAKE_METHODS).optional(),
  hubCity: z.string().trim().min(2).max(120).optional(),
});

export const listBookingQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.string().trim().optional(),
});

export const adminListBookingQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.string().trim().optional(),
  intakeMethod: z.string().trim().optional(),
  hubCity: z.string().trim().optional(),
  search: z.string().trim().optional(),
});

export const submitBookingSchema = z.object({
  note: z.string().trim().max(2000).optional(),
});

export const cancelBookingSchema = z.object({
  reasonCode: z.string().trim().min(2).max(80),
  note: z.string().trim().max(2000).optional(),
});

export const adminActionSchema = z.object({
  reasonCode: z.string().trim().min(2).max(80).optional(),
  note: z.string().trim().max(2000).optional(),
  paymentStatus: z.enum(PAYMENT_PLACEHOLDER_STATUSES).optional(),
  adminReviewStatus: z.enum(ADMIN_REVIEW_STATUSES).optional(),
});

export const adminApproveActionSchema = z.object({
  reasonCode: z.string().trim().min(2).max(80).optional(),
  note: z.string().trim().min(10).max(2000),
  paymentStatus: z.enum(PAYMENT_PLACEHOLDER_STATUSES).optional(),
  adminReviewStatus: z.enum(ADMIN_REVIEW_STATUSES).optional(),
}).superRefine((payload, ctx) => {
  if (!/manual/i.test(payload.note)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["note"],
      message: "Approval note must confirm manual-action handling.",
    });
  }
});

export const adminRejectActionSchema = z.object({
  reasonCode: z.string().trim().min(2).max(80),
  note: z.string().trim().max(2000).optional(),
  paymentStatus: z.enum(PAYMENT_PLACEHOLDER_STATUSES).optional(),
  adminReviewStatus: z.enum(ADMIN_REVIEW_STATUSES).optional(),
});

export const adminCorrectionActionSchema = z.object({
  reasonCode: z.string().trim().min(2).max(80),
  note: z.string().trim().max(2000).optional(),
  paymentStatus: z.enum(PAYMENT_PLACEHOLDER_STATUSES).optional(),
  adminReviewStatus: z.enum(ADMIN_REVIEW_STATUSES).optional(),
});

export const adminMarkPendingActionSchema = adminActionSchema;

export const AGGREGATOR_WAREHOUSE_OPTIONS = [
  "EPOST_LAHORE_WAREHOUSE",
  "EPOST_SAHIWAL_WAREHOUSE",
] as const;

export const AGGREGATOR_INTAKE_CARRIER_OPTIONS = [
  "CUSTOMER_SELF_DROP",
  "PAKISTAN_POST_BULK_PACK",
  "LEOPARDS_BULK_PACK",
] as const;

const manualOnlyPlanningFlagsSchema = z.object({
  manualPlanningOnly: z.literal(true),
  noLiveCarrierApi: z.literal(true),
  noPakistanPostBookingApi: z.literal(true),
  noPickupExecution: z.literal(true),
  noDispatchExecution: z.literal(true),
  noFinalBookingConfirmation: z.literal(true),
});

const manualOnlyHubReceivingFlagsSchema = z.object({
  manualReceivingOnly: z.literal(true),
  noFinalDispatch: z.literal(true),
  noLiveCarrierApi: z.literal(true),
  noPakistanPostBookingApi: z.literal(true),
  noPickupExecution: z.literal(true),
  noDispatchExecution: z.literal(true),
  noFinalBookingConfirmation: z.literal(true),
});

export const adminBulkPackPlanningSelectionSchema = z.object({
  selectedWarehouse: z.enum(AGGREGATOR_WAREHOUSE_OPTIONS),
  intakeCarrier: z.enum(AGGREGATOR_INTAKE_CARRIER_OPTIONS),
  paymentVerifiedReference: z.string().trim().min(3).max(160),
  instructions: z.string().trim().min(10).max(2000),
  planningFlags: manualOnlyPlanningFlagsSchema,
});

export const adminBulkPackLabelPreviewSchema = z.object({
  planningFlags: manualOnlyPlanningFlagsSchema,
});

export const adminManifestPreviewSchema = z.object({
  planningFlags: manualOnlyPlanningFlagsSchema,
});

export const adminHubMarkReceivedSchema = z.object({
  receivedArticleCount: z.coerce.number().int().min(0),
  receivedBundleWeightGrams: z.coerce.number().int().positive().optional(),
  conditionNote: z.string().trim().min(10).max(2000),
  manualFlags: manualOnlyHubReceivingFlagsSchema,
}).strict();

export const adminHubVerifyManifestSchema = z.object({
  receivedArticleCount: z.coerce.number().int().min(0),
  manualFlags: manualOnlyHubReceivingFlagsSchema,
}).strict();

export const adminHubRecordMismatchSchema = z.object({
  receivedArticleCount: z.coerce.number().int().min(0),
  mismatchReason: z.string().trim().min(2).max(120),
  adminNote: z.string().trim().min(5).max(2000),
  manualFlags: manualOnlyHubReceivingFlagsSchema,
}).strict();

export const adminHubExceptionNoteSchema = z.object({
  exceptionNote: z.string().trim().min(3).max(2000),
  manualFlags: manualOnlyHubReceivingFlagsSchema,
}).strict();

export const adminHubResolveExceptionSchema = z.object({
  resolutionType: z.string().trim().min(2).max(120),
  resolutionNote: z.string().trim().min(5).max(2000),
  manualFlags: manualOnlyHubReceivingFlagsSchema,
}).strict();

const manualOnlyHandoffFlagsSchema = z.object({
  manualHandoffOnly: z.literal(true),
  noFinalDispatch: z.literal(true),
  noLiveCarrierApi: z.literal(true),
  noPakistanPostBookingApi: z.literal(true),
  noPickupExecution: z.literal(true),
  noDispatchExecution: z.literal(true),
  noFinalBookingConfirmation: z.literal(true),
});

export const adminDriverHandoffSchema = z.object({
  handoffType: z.string().trim().min(2).max(80),
  fromParty: z.string().trim().min(2).max(120),
  toParty: z.string().trim().min(2).max(120),
  receivedBy: z.string().trim().min(2).max(120),
  bundleCondition: z.string().trim().min(5).max(500),
  articleCount: z.coerce.number().int().min(0),
  note: z.string().trim().min(5).max(2000),
  manualFlags: manualOnlyHandoffFlagsSchema,
}).strict();

export const adminHubSortingDispatchSchema = z.object({
  fromWarehouse: z.string().trim().min(2).max(120),
  toSortingFacility: z.string().trim().min(2).max(120),
  dispatchedBy: z.string().trim().min(2).max(120),
  expectedArticleCount: z.coerce.number().int().min(0),
  bundleWeightGrams: z.coerce.number().int().positive().optional(),
  transportMode: z.string().trim().min(2).max(80),
  note: z.string().trim().min(5).max(2000),
  manualFlags: manualOnlyHandoffFlagsSchema,
}).strict();

export const adminInterFacilityTransferSchema = z.object({
  fromFacility: z.string().trim().min(2).max(120),
  toFacility: z.string().trim().min(2).max(120),
  transferBy: z.string().trim().min(2).max(120),
  transferReference: z.string().trim().min(2).max(120).optional(),
  articleCount: z.coerce.number().int().min(0),
  note: z.string().trim().min(5).max(2000),
  manualFlags: manualOnlyHandoffFlagsSchema,
}).strict();

export const adminReadyForPostalSchema = z.object({
  expectedArticleCount: z.coerce.number().int().min(0),
  note: z.string().trim().min(10).max(2000),
  manualFlags: manualOnlyHandoffFlagsSchema,
}).strict();
