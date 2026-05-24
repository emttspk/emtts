import fs from "node:fs/promises";
import xlsx from "xlsx";
import { validateUploadedTrackingId } from "../validation/trackingId.js";

const TRACKING_HEADER_CANDIDATES = [
  "trackingid",
  "tracking_id",
  "trackingnumber",
  "tracking_number",
  "tracking",
  "cn",
  "consignment",
  "awb",
];

function normalizeHeader(v: string) {
  return v.toLowerCase().replace(/[^a-z0-9]/g, "");
}

type CanonicalTrackingUploadRow = Record<string, unknown>;

export type ParsedTrackingUploadRows = {
  trackingNumbers: string[];
  rowsByTracking: Map<string, CanonicalTrackingUploadRow>;
};

function normalizeCellText(value: unknown) {
  return String(value ?? "").trim();
}

function buildNormalizedRowLookup(row: Record<string, unknown>) {
  const out = new Map<string, unknown>();
  for (const [key, value] of Object.entries(row)) {
    out.set(normalizeHeader(key), value);
  }
  return out;
}

function pickCell(lookup: Map<string, unknown>, aliases: string[], fallback = "") {
  for (const alias of aliases) {
    const value = lookup.get(normalizeHeader(alias));
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return normalizeCellText(value);
    }
  }
  return fallback;
}

function toCanonicalTrackingRow(row: Record<string, unknown>, trackingId: string): CanonicalTrackingUploadRow {
  const lookup = buildNormalizedRowLookup(row);
  const collectAmount = pickCell(lookup, ["CollectAmount", "collect_amount", "collected_amount", "Collect Amount"], "0");
  const mosNumber = pickCell(lookup, ["MOS Number", "mos_number", "mo_issued_number"], "");

  return {
    TrackingID: trackingId,
    shipperName: pickCell(lookup, ["shipperName", "senderName"]),
    shipperPhone: pickCell(lookup, ["shipperPhone", "senderPhone", "shipperContact", "senderContact"]),
    shipperAddress: pickCell(lookup, ["shipperAddress", "senderAddress"]),
    shipperEmail: pickCell(lookup, ["shipperEmail", "senderEmail"]),
    senderCity: pickCell(lookup, ["senderCity", "BookingCity", "originCity"]),
    consigneeName: pickCell(lookup, ["consigneeName", "receiverName", "Receiver Name"]),
    consigneeEmail: pickCell(lookup, ["consigneeEmail", "receiverEmail"]),
    consigneePhone: pickCell(lookup, ["consigneePhone", "receiverPhone", "Receiver Phone"]),
    consigneeAddress: pickCell(lookup, ["consigneeAddress", "receiverAddress"]),
    receiverCity: pickCell(lookup, ["receiverCity", "ConsigneeCity", "Receiver City"]),
    CollectAmount: collectAmount || "0",
    ordered: pickCell(lookup, ["ordered", "orderid", "order_id", "reference", "referenceno", "Batch ID"]),
    ProductDescription: pickCell(lookup, ["ProductDescription", "product", "Product", "itemdescription", "description"]),
    Weight: pickCell(lookup, ["Weight", "weight", "parcelWeight"]),
    shipmenttype: pickCell(lookup, ["shipmenttype", "shipment_type", "shipment", "Shipment Type"]),
    numberOfPieces: pickCell(lookup, ["numberOfPieces", "number_of_pieces", "pieces", "qty", "quantity"], "1"),
    generatedDate: pickCell(lookup, ["Generated Date", "generated_date"]),
    batchId: pickCell(lookup, ["Batch ID", "batch_id"]),
    currentStatus: pickCell(lookup, ["Current Status", "current_status"]),
    complaintStatus: pickCell(lookup, ["Complaint Status", "complaint_status"]),
    settlementStatus: pickCell(lookup, ["Settlement Status", "settlement_status"]),
    MOS_Number: mosNumber,
    mos_number: mosNumber,
    tracking: null,
  };
}

function resolveTrackingHeader(headers: string[], trackingField?: string) {
  const normalized = new Map(headers.map((h) => [normalizeHeader(h), h]));
  const explicitField = String(trackingField ?? "").trim();
  const explicitFieldNormalized = normalizeHeader(explicitField);
  return (
    (explicitField && headers.find((h) => h === explicitField)) ||
    (explicitFieldNormalized ? normalized.get(explicitFieldNormalized) : undefined) ||
    TRACKING_HEADER_CANDIDATES.map((k) => normalized.get(normalizeHeader(k))).find(Boolean)
  );
}

export async function parseTrackingUploadRowsFromFile(inputPath: string, trackingField?: string): Promise<ParsedTrackingUploadRows> {
  const fileContent = await fs.readFile(inputPath);
  const workbook = xlsx.read(fileContent);
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { trackingNumbers: [], rowsByTracking: new Map() };

  const worksheet = workbook.Sheets[sheetName];
  const rows = xlsx.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    raw: false,
    defval: "",
  });
  if (rows.length === 0) return { trackingNumbers: [], rowsByTracking: new Map() };

  const firstRow = rows[0] ?? {};
  const headers = Object.keys(firstRow);
  const resolvedHeader = resolveTrackingHeader(headers, trackingField);

  let valuesByRow: string[];
  if (resolvedHeader) {
    valuesByRow = rows.map((r) => String(r[resolvedHeader] ?? "").trim());
  } else {
    const matrix = xlsx.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, raw: false, defval: "" });
    valuesByRow = matrix.slice(1).map((r) => String((r as unknown[])[16] ?? "").trim());
  }

  const invalidRows: string[] = [];
  const trackingNumbers: string[] = [];
  const rowsByTracking = new Map<string, CanonicalTrackingUploadRow>();

  valuesByRow.forEach((value, i) => {
    if (!value) return;
    const parsed = validateUploadedTrackingId(value);
    if (!parsed.ok) {
      invalidRows.push(`Row ${i + 2}: ${(parsed as any).reason}`);
      return;
    }
    if (rowsByTracking.has(parsed.value)) return;
    trackingNumbers.push(parsed.value);
    rowsByTracking.set(parsed.value, toCanonicalTrackingRow(rows[i] ?? {}, parsed.value));
  });

  console.log("[TrackingParser] Validation path used: UPLOAD");

  if (invalidRows.length > 0) {
    throw new Error(`Tracking upload validation failed. ${invalidRows.slice(0, 30).join(" ")}`);
  }

  if (trackingNumbers.length === 0) {
    throw new Error("No valid tracking IDs found after validation.");
  }

  return { trackingNumbers, rowsByTracking };
}

export async function parseTrackingNumbersFromFile(inputPath: string, trackingField?: string): Promise<string[]> {
  const parsed = await parseTrackingUploadRowsFromFile(inputPath, trackingField);
  return parsed.trackingNumbers;
}
