export const ORDER_UPLOAD_COLUMNS = [
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

export type OrderUploadColumn = (typeof ORDER_UPLOAD_COLUMNS)[number];

export type UploadOrderRow = Record<OrderUploadColumn, string>;

const COLUMN_ALIAS_MAP: Record<string, OrderUploadColumn> = {
  bookingcity: "senderCity",
  consigneecity: "receiverCity",
  orderid: "ordered",
  shipment_type: "shipmenttype",
  amount: "CollectAmount",
};

export function normalizeOrderColumnKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function normalizeOrderHeaders(headers: string[]) {
  const normalized = new Set(headers.map((header) => normalizeOrderColumnKey(header)));
  for (const [alias, target] of Object.entries(COLUMN_ALIAS_MAP)) {
    if (normalized.has(alias)) {
      normalized.add(normalizeOrderColumnKey(target));
    }
  }
  return normalized;
}

export function getMissingOrderColumns(headers: string[]) {
  const normalized = normalizeOrderHeaders(headers);
  return ORDER_UPLOAD_COLUMNS.filter((column) => !normalized.has(normalizeOrderColumnKey(column)));
}

export function toCsvValue(value: string) {
  if (!/[",\n]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

export function rowsToCsv(rows: UploadOrderRow[]) {
  const header = ORDER_UPLOAD_COLUMNS.join(",");
  const body = rows.map((row) => ORDER_UPLOAD_COLUMNS.map((column) => toCsvValue(String(row[column] ?? ""))).join(",")).join("\n");
  return `${header}\n${body}`;
}
