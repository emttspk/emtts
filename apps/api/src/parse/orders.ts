import xlsx from "xlsx";
import fs from "node:fs/promises";
import { validateTrackingId } from "../validation/trackingId.js";

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

export async function parseOrdersFromFile(filePath: string, opts?: { allowMissingTrackingId?: boolean }): Promise<any[]> {
  const fileContent = await fs.readFile(filePath);
  const workbook = xlsx.read(fileContent);
  const sheetName = workbook.SheetNames[0];

  if (!sheetName) {
    throw new Error("No sheets found in the uploaded file.");
  }

  const worksheet = workbook.Sheets[sheetName];
  const jsonData = xlsx.utils.sheet_to_json<Record<string, any>>(worksheet, {
    raw: false,
    defval: "",
  });

  if (jsonData.length === 0) {
    return [];
  }

  const normalizeKey = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, "");
  const invalidRows: string[] = [];

  const firstRow = jsonData[0] ?? {};
  const sourceToStrict = new Map<string, StrictColumn>();
  const strictToSource = new Map<StrictColumn, string>();

  const headerKeys = Object.keys(firstRow);
  const normalizedHeaderMap = new Map(headerKeys.map(key => [normalizeKey(key), key]));
  if (normalizedHeaderMap.has("bookingcity")) normalizedHeaderMap.set("sendercity", normalizedHeaderMap.get("bookingcity")!);
  if (normalizedHeaderMap.has("consigneecity")) normalizedHeaderMap.set("receivercity", normalizedHeaderMap.get("consigneecity")!);


  for (const key of Object.keys(firstRow)) {
    let normalized = normalizeKey(key);
    if (normalized === "bookingcity") {
      normalized = "sendercity";
    }
    if (normalized === "consigneecity") {
      normalized = "receivercity";
    }
    if (normalized === "orderid") {
      normalized = "ordered";
    }
    if (normalized === "shipment_type") {
      normalized = "shipmenttype";
    }
    if (normalized === "amount") {
      normalized = "collectamount";
    }
    const strict = strictColumns.find((col) => normalizeKey(col) === normalized);
    if (!strict) continue;
    if (!strictToSource.has(strict)) {
      strictToSource.set(strict, key);
      sourceToStrict.set(key, strict);
    }
  }

  const missingHeaders = strictColumns.filter((col) => !strictToSource.has(col));
  if (missingHeaders.length > 0) {
    throw new Error(`Missing required columns: ${missingHeaders.join(", ")}`);
  }

  const processedData: OrderRecord[] = jsonData.map((row, i) => {
    const strictRow: Record<StrictColumn, string> = {} as Record<StrictColumn, string>;
    for (const col of strictColumns) {
      const sourceKey = strictToSource.get(col)!;
      const raw = row[sourceKey];
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

    if (!strictRow.TrackingID) {
      if (opts?.allowMissingTrackingId !== true) {
        invalidRows.push(`Row ${i + 2}: TrackingID is required.`);
      }
    } else {
      const trackingResult = validateTrackingId(strictRow.TrackingID);
      if (!trackingResult.ok) {
        invalidRows.push(`Row ${i + 2}: ${trackingResult.reason}`);
      } else {
        strictRow.TrackingID = trackingResult.value;
      }
    }

    return {
      ...strictRow,
    } satisfies OrderRecord;
  });

  if (invalidRows.length > 0) {
    throw new Error(`Upload validation failed. ${invalidRows.slice(0, 30).join(" ")}`);
  }

  return processedData;
}
