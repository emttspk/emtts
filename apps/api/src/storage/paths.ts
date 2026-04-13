import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { env } from "../config";

export function appRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
}

export function storageRoot() {
  return path.resolve(appRoot(), env.STORAGE_DIR);
}

export function uploadsDir() {
  return path.join(storageRoot(), "uploads");
}

export function outputsDir() {
  return path.join(storageRoot(), "outputs");
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
  await fs.mkdir(uploadsDir(), { recursive: true });
  await fs.mkdir(outputsDir(), { recursive: true });
}
