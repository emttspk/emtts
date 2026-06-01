import * as XLSX from "xlsx";
import { normalizeUploadRows, type PostageUploadRow } from "../utils/postageUploadValidation.js";

export function parsePostageUploadSummary(buffer: Buffer): PostageUploadRow[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const first = workbook.SheetNames[0];
  const sheet = workbook.Sheets[first];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { raw: false, defval: "" });
  return normalizeUploadRows(rows);
}
