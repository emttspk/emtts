import path from "node:path";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import { fileURLToPath } from "node:url";
import { env } from "../config.js";
import { UPLOAD_DIR } from "../utils/paths.js";

export function appRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
}

export function storageRoot() {
  // Derive storage root from UPLOAD_DIR (one level up from uploads/)
  return path.dirname(UPLOAD_DIR);
}

export function uploadsDir() {
  return UPLOAD_DIR;
}

export function outputsDir() {
  return path.join(storageRoot(), "generated");
}

export function moneyOrdersOutputPath(jobId: string) {
  return path.join(outputsDir(), `${jobId}-money-orders.pdf`);
}

export function toStoredPath(absPath: string) {
  const relativeToStorage = path.relative(storageRoot(), absPath);
  if (!relativeToStorage.startsWith("..") && !path.isAbsolute(relativeToStorage)) {
    return relativeToStorage;
  }

  const relativeToAppRoot = path.relative(appRoot(), absPath);
  return relativeToAppRoot;
}

export function resolveStoredPath(storedPath: string) {
  if (path.isAbsolute(storedPath)) return storedPath;

  const candidates = [
    path.resolve(storageRoot(), storedPath),
    path.resolve(storageRoot(), "generated", path.basename(storedPath)),
    path.resolve(storageRoot(), "outputs", path.basename(storedPath)),
    path.resolve(appRoot(), storedPath),
    path.resolve(process.cwd(), storedPath),
  ];

  for (const candidate of candidates) {
    if (!path.relative(storageRoot(), candidate).startsWith("..") || !path.relative(appRoot(), candidate).startsWith("..")) {
      return candidate;
    }
  }

  return candidates[0];
}

export async function waitForStoredFile(storedPath: string, attempts = 8, delayMs = 200) {
  const absPath = resolveStoredPath(storedPath);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const stats = await fs.stat(absPath);
      if (stats.isFile() && stats.size > 0) {
        return absPath;
      }
    } catch {
      // keep polling until the file is fully materialized on disk
    }

    if (attempt < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return null;
}

export async function ensureStorageDirs() {
  if (!fsSync.existsSync(uploadsDir())) {
    fsSync.mkdirSync(uploadsDir(), { recursive: true });
  }
  if (!fsSync.existsSync(outputsDir())) {
    fsSync.mkdirSync(outputsDir(), { recursive: true });
  }
  await fs.mkdir(uploadsDir(), { recursive: true });
  await fs.mkdir(outputsDir(), { recursive: true });
}
