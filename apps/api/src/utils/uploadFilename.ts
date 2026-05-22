export type UploadFilenameDebug = {
  raw: string;
  basename: string;
  normalized: string;
};

function extractCrossPlatformBasename(value: string) {
  const unified = value.replace(/\\+/g, "/");
  const parts = unified.split("/").filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : "";
}

export function getUploadFilenameDebug(value: unknown): UploadFilenameDebug {
  const raw = String(value ?? "");
  const basename = extractCrossPlatformBasename(raw);
  const normalized = basename
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
  return { raw, basename, normalized };
}

export function normalizeUploadFilename(value: unknown) {
  return getUploadFilenameDebug(value).normalized;
}
