import path from "node:path";

export const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), "storage/uploads");

export function getUploadPath(filename: string) {
  return path.join(UPLOAD_DIR, filename);
}
