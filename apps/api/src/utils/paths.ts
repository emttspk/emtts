import path from "node:path";
import fs from "node:fs";

export const UPLOAD_DIR = path.join(process.cwd(), "storage/uploads");

// Ensure the upload directory exists at module load time
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export function getUploadPath(filename: string) {
  return path.join(UPLOAD_DIR, filename);
}
