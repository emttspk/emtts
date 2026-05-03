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

export async function parseTrackingNumbersFromFile(inputPath: string, trackingField?: string): Promise<string[]> {
  const fileContent = await fs.readFile(inputPath);
  const workbook = xlsx.read(fileContent);
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];

  const worksheet = workbook.Sheets[sheetName];
  const rows = xlsx.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    raw: false,
    defval: "",
  });
  if (rows.length === 0) return [];

  const firstRow = rows[0] ?? {};
  const headers = Object.keys(firstRow);
  const normalized = new Map(headers.map((h) => [normalizeHeader(h), h]));

  const explicitField = String(trackingField ?? "").trim();
  const explicitFieldNormalized = normalizeHeader(explicitField);
  const resolvedHeader =
    (explicitField && headers.find((h) => h === explicitField)) ||
    (explicitFieldNormalized ? normalized.get(explicitFieldNormalized) : undefined) ||
    TRACKING_HEADER_CANDIDATES.map((k) => normalized.get(normalizeHeader(k))).find(Boolean);

  let values: string[];
  if (resolvedHeader) {
    values = rows.map((r) => String(r[resolvedHeader] ?? "").trim()).filter(Boolean);
  } else {
    // Fallback to physical column Q (17th column, index 16) when header mapping is unavailable.
    const matrix = xlsx.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, raw: false, defval: "" });
    values = matrix
      .slice(1)
      .map((r) => String((r as unknown[])[16] ?? "").trim())
      .filter(Boolean);
  }

  const invalidRows: string[] = [];
  const out: string[] = [];
  values.forEach((value, i) => {
    const parsed = validateUploadedTrackingId(value);
    if (!parsed.ok) {
      invalidRows.push(`Row ${i + 2}: ${(parsed as any).reason}`);
      return;
    }
    out.push(parsed.value);
  });

  console.log("[TrackingParser] Validation path used: UPLOAD");

  if (invalidRows.length > 0) {
    throw new Error(`Tracking upload validation failed. ${invalidRows.slice(0, 30).join(" ")}`);
  }

  if (out.length === 0) throw new Error("No valid tracking IDs found after validation.");

  // de-dup while preserving order
  const seen = new Set<string>();
  return out.filter((t) => (seen.has(t) ? false : (seen.add(t), true)));
}
