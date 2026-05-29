import { calculatePostage, type PostageCalculatorInput, type PostageCalculatorResult } from "../utils/postageRates.js";

export type QuoteRow = Record<string, unknown>;

export type QuoteBreakdownRow = {
  rowNumber: number;
  serviceCode: string;
  senderCity: string;
  receiverCity: string;
  result: PostageCalculatorResult;
};

export type QuoteSummaryBucket = {
  articles: number;
  totalActualWeightGrams: number;
  totalChargeableWeightGrams: number;
  totalPostageAmount: number;
};

export type QuoteSummary = {
  totalArticles: number;
  totalActualWeightGrams: number;
  totalChargeableWeightGrams: number;
  totalPostageAmount: number;
  byCategory: Record<string, QuoteSummaryBucket>;
  byProduct: Record<string, QuoteSummaryBucket>;
  perArticlePostageBreakdown: QuoteBreakdownRow[];
  warningRows: Array<{ rowNumber: number; warnings: string[] }>;
  errorRows: Array<{ rowNumber: number; errors: string[] }>;
};

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const raw = String(value).toLowerCase().trim();
  const parsed = Number.parseFloat(raw.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(parsed)) return null;
  if (raw.includes("kg")) return parsed * 1000;
  return parsed;
}

function toBoolean(value: unknown): boolean {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "y";
}

function accumulate(bucket: Record<string, QuoteSummaryBucket>, key: string, row: QuoteBreakdownRow) {
  const normalizedKey = key || "UNKNOWN";
  const existing = bucket[normalizedKey] ?? {
    articles: 0,
    totalActualWeightGrams: 0,
    totalChargeableWeightGrams: 0,
    totalPostageAmount: 0,
  };
  existing.articles += 1;
  existing.totalActualWeightGrams += row.result.weightGrams ?? 0;
  existing.totalChargeableWeightGrams += row.result.chargeableWeightGrams ?? 0;
  existing.totalPostageAmount += row.result.postageAmount ?? 0;
  bucket[normalizedKey] = existing;
}

function toCalculatorInput(row: QuoteRow): PostageCalculatorInput {
  const serviceCode = String(row.serviceCode ?? row.shipmenttype ?? row.shipmentType ?? "").trim().toUpperCase();
  const senderCity = String(row.senderCity ?? row.bookingcity ?? row.originCity ?? "").trim();
  const receiverCity = String(row.receiverCity ?? row.consigneecity ?? row.destinationCity ?? "").trim();
  const categoryRaw = String(row.articleCategory ?? "").trim().toUpperCase();
  const category = categoryRaw || undefined;
  const isTextbook = toBoolean(row.isTextbook ?? row.textbook ?? row.is_textbook);

  return {
    serviceCode,
    weightGrams: toNumber(row.weightGrams ?? row.Weight ?? row.weight),
    senderCity,
    receiverCity,
    articleCategory: category as PostageCalculatorInput["articleCategory"],
    isTextbook,
  };
}

export function buildBookingQuoteSummary(rows: QuoteRow[]): QuoteSummary {
  const perArticlePostageBreakdown: QuoteBreakdownRow[] = [];
  const warningRows: Array<{ rowNumber: number; warnings: string[] }> = [];
  const errorRows: Array<{ rowNumber: number; errors: string[] }> = [];
  const byCategory: Record<string, QuoteSummaryBucket> = {};
  const byProduct: Record<string, QuoteSummaryBucket> = {};

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index] ?? {};
    const rowNumber = index + 1;
    const input = toCalculatorInput(row);
    const result = calculatePostage(input);
    const breakdownRow: QuoteBreakdownRow = {
      rowNumber,
      serviceCode: input.serviceCode,
      senderCity: input.senderCity ?? "",
      receiverCity: input.receiverCity ?? "",
      result,
    };

    perArticlePostageBreakdown.push(breakdownRow);

    if (result.warnings.length > 0) {
      warningRows.push({ rowNumber, warnings: result.warnings });
    }
    if (result.errors.length > 0) {
      errorRows.push({ rowNumber, errors: result.errors });
    }

    accumulate(byCategory, result.articleCategory, breakdownRow);
    accumulate(byProduct, result.postalProduct, breakdownRow);
  }

  return {
    totalArticles: perArticlePostageBreakdown.length,
    totalActualWeightGrams: perArticlePostageBreakdown.reduce((sum, row) => sum + (row.result.weightGrams ?? 0), 0),
    totalChargeableWeightGrams: perArticlePostageBreakdown.reduce((sum, row) => sum + (row.result.chargeableWeightGrams ?? 0), 0),
    totalPostageAmount: perArticlePostageBreakdown.reduce((sum, row) => sum + (row.result.postageAmount ?? 0), 0),
    byCategory,
    byProduct,
    perArticlePostageBreakdown,
    warningRows,
    errorRows,
  };
}
