import * as XLSX from "xlsx";
import { calculatePostage, type PostageCalculatorResult } from "../utils/postageRates.js";

export type QuoteRow = {
  serviceCode?: string;
  weightGrams?: number | null;
  senderCity?: string;
  receiverCity?: string;
  articleCategory?: string;
  isTextbook?: boolean;
};

export type QuoteBreakdownRow = {
  rowNumber: number;
  serviceCode: string;
  senderCity: string;
  receiverCity: string;
  result: PostageCalculatorResult;
};

export type QuoteSummaryBucket = {
  key: string;
  totalArticles: number;
  totalActualWeightGrams: number;
  totalChargeableWeightGrams: number;
  totalPostageAmount: number;
};

export type QuoteSummary = {
  totalArticles: number;
  totalActualWeightGrams: number;
  totalChargeableWeightGrams: number;
  totalPostageAmount: number;
  byCategory: QuoteSummaryBucket[];
  byProduct: QuoteSummaryBucket[];
  perArticlePostageBreakdown: QuoteBreakdownRow[];
  warningRows: Array<{ rowNumber: number; warnings: string[] }>;
  errorRows: Array<{ rowNumber: number; errors: string[] }>;
  totalBasePostage: number;
  totalRegistrationFee: number;
  totalValuePayableFee: number;
  totalInsuranceFee: number;
  totalOfficialPostalCharge: number;
};

type RowRecord = Record<string, unknown>;

type GroupAccumulator = {
  key: string;
  totalArticles: number;
  totalActualWeightGrams: number;
  totalChargeableWeightGrams: number;
  totalPostageAmount: number;
};

function toText(value: unknown): string | undefined {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : undefined;
}

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

function resolveField(row: RowRecord, candidates: string[]): unknown {
  const keyed = new Map<string, unknown>();
  for (const [key, value] of Object.entries(row)) {
    keyed.set(key.trim().toLowerCase(), value);
  }
  for (const candidate of candidates) {
    const match = keyed.get(candidate.toLowerCase());
    if (match !== undefined) return match;
  }
  return undefined;
}

function normalizeRow(input: QuoteRow | RowRecord): QuoteRow {
  const row = input as RowRecord;
  return {
    serviceCode: toText(resolveField(row, ["serviceCode", "service_code", "service", "shipmentType", "shipment_type", "type"])),
    weightGrams: toNumber(resolveField(row, ["weightGrams", "weight_grams", "weight", "weight(g)", "actualWeight"])),
    senderCity: toText(resolveField(row, ["senderCity", "sender_city", "originCity", "origin_city", "bookingCity"])),
    receiverCity: toText(resolveField(row, ["receiverCity", "receiver_city", "destinationCity", "destination_city", "consigneeCity"])),
    articleCategory: toText(resolveField(row, ["articleCategory", "article_category", "category"])),
    isTextbook: toBoolean(resolveField(row, ["isTextbook", "is_textbook", "textbook"])),
  };
}

function pushGroup(map: Map<string, GroupAccumulator>, key: string, row: QuoteBreakdownRow) {
  const amount = row.result.postageAmount ?? 0;
  const actualWeight = row.result.weightGrams ?? 0;
  const chargeableWeight = row.result.chargeableWeightGrams ?? 0;
  const current = map.get(key) ?? {
    key,
    totalArticles: 0,
    totalActualWeightGrams: 0,
    totalChargeableWeightGrams: 0,
    totalPostageAmount: 0,
  };
  current.totalArticles += 1;
  current.totalActualWeightGrams += actualWeight;
  current.totalChargeableWeightGrams += chargeableWeight;
  current.totalPostageAmount += amount;
  map.set(key, current);
}

export function parseQuoteRowsFromBuffer(buffer: Buffer): QuoteRow[] {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];

  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<RowRecord>(sheet, {
    defval: "",
    raw: false,
    blankrows: false,
  });

  return rows.map((row) => normalizeRow(row));
}

export function buildBookingQuoteSummary(rows: QuoteRow[]): QuoteSummary {
  const safeRows = Array.isArray(rows) ? rows : [];
  const byCategory = new Map<string, GroupAccumulator>();
  const byProduct = new Map<string, GroupAccumulator>();
  const warningRows: Array<{ rowNumber: number; warnings: string[] }> = [];
  const errorRows: Array<{ rowNumber: number; errors: string[] }> = [];
  const perArticlePostageBreakdown: QuoteBreakdownRow[] = [];

  let totalActualWeightGrams = 0;
  let totalChargeableWeightGrams = 0;
  let totalPostageAmount = 0;

  safeRows.forEach((row, index) => {
    const normalized = normalizeRow(row);
    const result = calculatePostage({
      serviceCode: normalized.serviceCode ?? "",
      weightGrams: normalized.weightGrams ?? null,
      senderCity: normalized.senderCity,
      receiverCity: normalized.receiverCity,
      articleCategory: normalized.articleCategory,
      isTextbook: normalized.isTextbook,
    });

    const item: QuoteBreakdownRow = {
      rowNumber: index + 1,
      serviceCode: String(normalized.serviceCode ?? "").trim().toUpperCase(),
      senderCity: normalized.senderCity ?? "",
      receiverCity: normalized.receiverCity ?? "",
      result,
    };

    perArticlePostageBreakdown.push(item);

    totalActualWeightGrams += result.weightGrams ?? 0;
    totalChargeableWeightGrams += result.chargeableWeightGrams ?? 0;
    totalPostageAmount += result.postageAmount ?? 0;

    pushGroup(byCategory, result.articleCategory || "UNKNOWN", item);
    pushGroup(byProduct, result.postalProduct || "UNKNOWN", item);

    if (result.warnings.length > 0) {
      warningRows.push({ rowNumber: item.rowNumber, warnings: result.warnings });
    }
    if (result.errors.length > 0) {
      errorRows.push({ rowNumber: item.rowNumber, errors: result.errors });
    }
  });

  return {
    totalArticles: safeRows.length,
    totalActualWeightGrams,
    totalChargeableWeightGrams,
    totalPostageAmount,
    byCategory: Array.from(byCategory.values()),
    byProduct: Array.from(byProduct.values()),
    perArticlePostageBreakdown,
    warningRows,
    errorRows,
    totalBasePostage: totalPostageAmount,
    totalRegistrationFee: 0,
    totalValuePayableFee: 0,
    totalInsuranceFee: 0,
    totalOfficialPostalCharge: totalPostageAmount,
  };
}
