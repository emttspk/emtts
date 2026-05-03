import xlsx from "xlsx";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { validateTrackingId } from "../validation/trackingId.js";
import { uploadsDir } from "../storage/paths.js";

export type OrderRecord = {
  shipperName: string;
  shipperPhone: string;
  shipperAddress: string;
  shipperEmail: string;
  senderCity: string;
  consigneeName: string;
  consigneeEmail: string;
  consigneePhone: string;
  consigneeAddress: string;
  receiverCity: string;
  CollectAmount: string;
  ordered: string;
  ProductDescription: string;
  Weight: string;
  shipmenttype: string;
  numberOfPieces: string;
  TrackingID: string;
  amount?: string;
  [key: string]: any;
};

const strictColumns = [
  "shipperName",
  "shipperPhone",
  "shipperAddress",
  "shipperEmail",
  "senderCity",
  "consigneeName",
  "consigneeEmail",
  "consigneePhone",
  "consigneeAddress",
  "receiverCity",
  "CollectAmount",
  "ordered",
  "ProductDescription",
  "Weight",
  "shipmenttype",
  "numberOfPieces",
  "TrackingID",
] as const;

type StrictColumn = (typeof strictColumns)[number];

const requiredRowFields: ReadonlyArray<StrictColumn> = [
  "consigneeName",
  "consigneePhone",
  "consigneeAddress",
];

const strictColumnAliases: Record<StrictColumn, string[]> = {
  shipperName: ["shippername", "sendername"],
  shipperPhone: ["shipperphone", "senderphone", "shippercontact", "sendercontact"],
  shipperAddress: ["shipperaddress", "senderaddress"],
  shipperEmail: ["shipperemail", "senderemail"],
  senderCity: ["sendercity", "bookingcity", "origincity"],
  consigneeName: ["consigneename", "receivername"],
  consigneeEmail: ["consigneeemail", "receiveremail"],
  consigneePhone: ["consigneephone", "receiverphone"],
  consigneeAddress: ["consigneeaddress", "receiveraddress"],
  receiverCity: ["receivercity", "consigneecity", "destinationcity"],
  CollectAmount: ["collectamount", "amount", "collect_amount", "codamount", "cod"],
  ordered: ["ordered", "orderid", "order_id", "reference", "referenceno"],
  ProductDescription: ["productdescription", "product", "itemdescription", "description"],
  Weight: ["weight", "parcelweight"],
  shipmenttype: ["shipmenttype", "shipment_type", "shipment"],
  numberOfPieces: ["numberofpieces", "pieces", "qty", "quantity"],
  TrackingID: [
    "trackingid",
    "tracking_id",
    "trackingnumber",
    "trackingno",
    "tracking",
    "barcode",
    "barcodeid",
    "barcodeno",
    "barcodevalue",
    "barcodenumber",
    "barcodenumbervplrl",
    "vplbarcode",
    "vplrlbarcode",
    "vplrlbarcodeid",
    "vplrlbarcodevalue",
    "vplrlbarcodeno",
    "vplrlbarcodecode",
  ],
};

function normalizeHeaderKey(key: string) {
  return key.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

const strictAliasLookup = (() => {
  const map = new Map<string, StrictColumn>();
  for (const col of strictColumns) {
    map.set(normalizeHeaderKey(col), col);
    for (const alias of strictColumnAliases[col]) {
      map.set(normalizeHeaderKey(alias), col);
    }
  }
  return map;
})();

function resolveStrictColumn(rawHeader: string) {
  const normalized = normalizeHeaderKey(rawHeader);
  const direct = strictAliasLookup.get(normalized);
  if (direct) return direct;

  // Compatibility fallback for variants like VPL/RL Bar Code, VPL Barcode, Tracking Barcode, etc.
  if (normalized.includes("tracking")) {
    return "TrackingID";
  }
  if (normalized.includes("barcode") || normalized.includes("barcodeid") || normalized.includes("barcodeno")) {
    return "TrackingID";
  }

  return undefined;
}

function normalizeTrackingCandidate(value: unknown) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function buildOrdersFromRows(
  jsonData: Array<Record<string, any>>,
  opts?: { allowMissingTrackingId?: boolean },
): OrderRecord[] {
  if (jsonData.length === 0) {
    return [];
  }

  const invalidRows: string[] = [];
  const firstRow = jsonData[0] ?? {};
  const strictToSource = new Map<StrictColumn, string>();

  const headerKeys = Object.keys(firstRow);
  console.log(`[OrdersParser] Raw headers: ${JSON.stringify(headerKeys)}`);
  console.log(
    `[OrdersParser] Normalized headers: ${JSON.stringify(
      headerKeys.map((key) => ({ raw: key, normalized: normalizeHeaderKey(key), mappedTo: resolveStrictColumn(key) ?? null })),
    )}`,
  );
  console.log(`[OrdersParser] First parsed rows sample: ${JSON.stringify(jsonData.slice(0, 3))}`);

  for (const key of headerKeys) {
    const strict = resolveStrictColumn(key);
    if (!strict) continue;
    if (!strictToSource.has(strict)) {
      strictToSource.set(strict, key);
    }
  }

  const requiredHeaders = opts?.allowMissingTrackingId
    ? strictColumns.filter((col) => col !== "TrackingID")
    : strictColumns;
  const missingHeaders = requiredHeaders.filter((col) => !strictToSource.has(col));
  if (missingHeaders.length > 0) {
    throw new Error(`Missing required columns: ${missingHeaders.join(", ")}`);
  }

  const mappedTrackingIds: string[] = [];
  const duplicateTrackingIds = new Set<string>();
  const seenTrackingIds = new Set<string>();

  const processedData: OrderRecord[] = jsonData.map((row, i) => {
    const strictRow: Record<StrictColumn, string> = {} as Record<StrictColumn, string>;
    for (const col of strictColumns) {
      const sourceKey = strictToSource.get(col);
      const raw = sourceKey ? row[sourceKey] : "";
      strictRow[col] = raw === undefined || raw === null ? "" : String(raw).trim();
    }

    if (!strictRow.CollectAmount) {
      strictRow.CollectAmount = "0";
    }

    const collectMatch = strictRow.CollectAmount.match(/[\d,]+(?:\.\d+)?/);
    strictRow.CollectAmount = collectMatch ? collectMatch[0].replace(/,/g, "") : "0";

    for (const reqCol of requiredRowFields) {
      if (!strictRow[reqCol]) {
        invalidRows.push(`Row ${i + 2}: ${reqCol} is required.`);
      }
    }

    const normalizedTracking = normalizeTrackingCandidate(strictRow.TrackingID);
    strictRow.TrackingID = normalizedTracking;

    if (normalizedTracking) {
      mappedTrackingIds.push(normalizedTracking);
      if (seenTrackingIds.has(normalizedTracking)) {
        duplicateTrackingIds.add(normalizedTracking);
      } else {
        seenTrackingIds.add(normalizedTracking);
      }
    }

    if (!normalizedTracking) {
      if (opts?.allowMissingTrackingId !== true) {
        invalidRows.push(`Row ${i + 2}: TrackingID is required.`);
      }
    } else {
      const trackingResult = validateTrackingId(normalizedTracking);
      if (!trackingResult.ok) {
        invalidRows.push(`Row ${i + 2}: ${(trackingResult as any).reason}`);
      } else {
        strictRow.TrackingID = trackingResult.value;
      }
    }

    return {
      ...strictRow,
    } satisfies OrderRecord;
  });

  console.log(`[OrdersParser] Mapped tracking IDs (first 20): ${JSON.stringify(mappedTrackingIds.slice(0, 20))}`);
  console.log(
    `[OrdersParser] Duplicate detection in file: ${JSON.stringify({ duplicates: duplicateTrackingIds.size, values: Array.from(duplicateTrackingIds).slice(0, 20) })}`,
  );

  if (invalidRows.length > 0) {
    throw new Error(`Upload validation failed. ${invalidRows.slice(0, 30).join(" ")}`);
  }

  console.log(`[OrdersParser] Final valid rows count: ${processedData.length}`);
  return processedData;
}

export async function parseOrdersFromFile(inputPath: string, opts?: { allowMissingTrackingId?: boolean }): Promise<any[]> {
  const fileName = path.basename(String(inputPath ?? "").trim());
  const normalizedUploadPath = path.join(uploadsDir(), fileName);

  const candidatePath = existsSync(inputPath)
    ? inputPath
    : existsSync(normalizedUploadPath)
      ? normalizedUploadPath
      : null;

  if (!candidatePath) {
    throw new Error(`File not found: ${normalizedUploadPath}`);
  }

  console.log("Reading file:", candidatePath);
  console.log("Reading file from:", candidatePath);

  let workbook: xlsx.WorkBook;
  try {
    const fileContent = await fs.readFile(candidatePath);
    workbook = xlsx.read(fileContent);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[OrdersParser] Failed reading/parsing file ${candidatePath}: ${message}`);
    throw new Error(`Failed to parse uploaded file: ${message}`);
  }

  const sheetName = workbook.SheetNames[0];

  if (!sheetName) {
    throw new Error("No sheets found in the uploaded file.");
  }

  const worksheet = workbook.Sheets[sheetName];
  const jsonData = xlsx.utils.sheet_to_json<Record<string, any>>(worksheet, {
    raw: false,
    defval: "",
  });

  return buildOrdersFromRows(jsonData, opts);
}

export async function parseOrdersFromBuffer(fileBuffer: Buffer, fileName: string, opts?: { allowMissingTrackingId?: boolean }): Promise<any[]> {
  if (!fileBuffer || fileBuffer.length === 0) {
    throw new Error("Uploaded file buffer is empty");
  }

  let workbook: xlsx.WorkBook;
  try {
    workbook = xlsx.read(fileBuffer, { type: "buffer" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[OrdersParser] Failed reading/parsing buffer ${fileName}: ${message}`);
    throw new Error(`Failed to parse uploaded file: ${message}`);
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("No sheets found in the uploaded file.");
  }

  const worksheet = workbook.Sheets[sheetName];
  const jsonData = xlsx.utils.sheet_to_json<Record<string, any>>(worksheet, {
    raw: false,
    defval: "",
  });

  return buildOrdersFromRows(jsonData, opts);
}
