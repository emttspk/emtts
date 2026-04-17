import path from "node:path";

export const UPLOAD_DIR = "/app/storage/uploads";

export function getUploadPath(filename: string) {
  return path.join(UPLOAD_DIR, filename);
}
