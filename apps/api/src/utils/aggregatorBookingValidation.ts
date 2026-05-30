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
  totalBasePostage: z.number().min(0),
  totalRegistrationFee: z.number().min(0),
  totalValuePayableFee: z.number().min(0),
  totalInsuranceFee: z.number().min(0),
  totalOfficialPostalCharge: z.number().min(0),
  byCategory: z.record(
    z.object({
      articles: z.number().int().min(0),
      totalActualWeightGrams: z.number().min(0),
      totalChargeableWeightGrams: z.number().min(0),
      totalBasePostage: z.number().min(0),
      totalRegistrationFee: z.number().min(0),
      totalValuePayableFee: z.number().min(0),
      totalInsuranceFee: z.number().min(0),
      totalOfficialPostalCharge: z.number().min(0),
    }),
  ),
  byProduct: z.record(
    z.object({
      articles: z.number().int().min(0),
      totalActualWeightGrams: z.number().min(0),
      totalChargeableWeightGrams: z.number().min(0),
      totalBasePostage: z.number().min(0),
      totalRegistrationFee: z.number().min(0),
      totalValuePayableFee: z.number().min(0),
      totalInsuranceFee: z.number().min(0),
      totalOfficialPostalCharge: z.number().min(0),
    }),
  ),
  perArticlePostageBreakdown: z.array(quoteResultRowSchema),
  warningRows: z.array(z.object({ rowNumber: z.number().int().positive(), warnings: z.array(z.string()) })),
  errorRows: z.array(z.object({ rowNumber: z.number().int().positive(), errors: z.array(z.string()) })),
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
