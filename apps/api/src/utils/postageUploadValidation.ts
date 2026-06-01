export type PostageUploadRow = {
  serviceCode: string;
  weightGrams: number;
  senderCity?: string;
  receiverCity?: string;
  articleCategory?: string;
};

export function parseNumericWeight(value: unknown): number {
  const raw = String(value ?? "").trim().toLowerCase();
  const parsed = Number.parseFloat(raw.replace(/[^\d.]+/g, ""));
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return raw.includes("kg") ? Math.round(parsed * 1000) : Math.round(parsed);
}

export function normalizeUploadRows(rows: Array<Record<string, unknown>>): PostageUploadRow[] {
  return rows
    .map((row) => ({
      serviceCode: String(row.serviceCode ?? row.shipment_type ?? "").trim().toUpperCase(),
      weightGrams: parseNumericWeight(row.weightGrams ?? row.Weight),
      senderCity: String(row.senderCity ?? row.SenderCity ?? "").trim(),
      receiverCity: String(row.receiverCity ?? row.ConsigneeCity ?? "").trim(),
      articleCategory: String(row.articleCategory ?? "").trim() || undefined,
    }))
    .filter((row) => row.serviceCode.length > 0 && row.weightGrams > 0);
}
