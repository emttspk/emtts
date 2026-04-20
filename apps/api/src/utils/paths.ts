import path from "node:path";
import fs from "node:fs";

// STORAGE_PATH env var allows Railway (or any host) to pin the storage root to a
// known absolute path. Falls back to CWD-relative "storage" so local dev is unchanged.
const storageBase = process.env.STORAGE_PATH
  ? path.resolve(process.env.STORAGE_PATH)
  : path.join(process.cwd(), "storage");

export const UPLOAD_DIR = path.join(storageBase, "uploads");

// Ensure the upload directory exists at module load time
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export function getUploadPath(filename: string) {
  return path.join(UPLOAD_DIR, filename);
}
