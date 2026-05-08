import { prisma } from "../lib/prisma.js";

const SETTINGS_TABLE = "app_runtime_settings";
const SETTINGS_KEY = "upload.exemptFileNames";
export const DEFAULT_EXEMPT_FILE_NAMES = ["LCS 15-13-11-2024.xls"];

function normalizeFileName(value: string) {
  return value.trim();
}

function normalizeExemptFileNames(input: unknown): string[] {
  if (!Array.isArray(input)) return [];

  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of input) {
    const normalized = normalizeFileName(String(entry ?? ""));
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

async function ensureRuntimeSettingsTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS ${SETTINGS_TABLE} (
      key TEXT PRIMARY KEY,
      value_json JSONB NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

export async function getUploadExemptFileNames() {
  await ensureRuntimeSettingsTable();

  const rows = await prisma.$queryRawUnsafe<Array<{ value_json: unknown }>>(
    `SELECT value_json FROM ${SETTINGS_TABLE} WHERE key = $1 LIMIT 1`,
    SETTINGS_KEY,
  );

  if (!rows[0]) {
    await saveUploadExemptFileNames(DEFAULT_EXEMPT_FILE_NAMES);
    return [...DEFAULT_EXEMPT_FILE_NAMES];
  }

  const parsed = normalizeExemptFileNames(rows[0].value_json);
  if (parsed.length === 0) {
    await saveUploadExemptFileNames(DEFAULT_EXEMPT_FILE_NAMES);
    return [...DEFAULT_EXEMPT_FILE_NAMES];
  }

  return parsed;
}

export async function saveUploadExemptFileNames(fileNames: string[]) {
  await ensureRuntimeSettingsTable();
  const normalized = normalizeExemptFileNames(fileNames);

  await prisma.$executeRawUnsafe(
    `
      INSERT INTO ${SETTINGS_TABLE} (key, value_json, updated_at)
      VALUES ($1, $2::jsonb, CURRENT_TIMESTAMP)
      ON CONFLICT (key)
      DO UPDATE SET
        value_json = EXCLUDED.value_json,
        updated_at = CURRENT_TIMESTAMP
    `,
    SETTINGS_KEY,
    JSON.stringify(normalized.length > 0 ? normalized : DEFAULT_EXEMPT_FILE_NAMES),
  );

  return normalized.length > 0 ? normalized : [...DEFAULT_EXEMPT_FILE_NAMES];
}

export async function isUploadFileNameExempt(fileName: string) {
  const normalizedName = normalizeFileName(fileName).toLowerCase();
  if (!normalizedName) return false;
  const exemptNames = await getUploadExemptFileNames();
  return exemptNames.some((entry) => entry.trim().toLowerCase() === normalizedName);
}
