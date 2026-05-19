import path from "node:path";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import { fileURLToPath } from "node:url";
import { env } from "../config.js";
import { UPLOAD_DIR } from "../utils/paths.js";
import { getDualProviders, storageFeatureFlags } from "./provider.js";
import type { R2ReadCompatibilityOptions } from "./R2StorageProvider.js";
import { getNormalizedObjectKey } from "./key-normalization.js";

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

// Quick R2 existence check (fail-fast, no retries)
// Returns true if R2 file exists, false otherwise (including errors)
function resolveR2FallbackKey(storedPath: string, options?: R2ReadCompatibilityOptions): string {
  if (options?.jobId && options?.artifactType) {
    return getNormalizedObjectKey(options.jobId, options.artifactType).replace(/^pdf\//, "");
  }

  return storedPath;
}

async function checkR2ExistsQuick(
  storedPath: string,
  timeoutMs = 2000,
  options?: R2ReadCompatibilityOptions
): Promise<boolean> {
  if (!storageFeatureFlags.ENABLE_DUAL_READ || !storageFeatureFlags.ENABLE_R2_UPLOADS) {
    return false;
  }

  try {
    const r2Provider = getDualProviders().r2;
    const r2Key = resolveR2FallbackKey(storedPath, options);
    const promise = r2Provider.artifactExists("pdf", r2Key, options);
    
    // Race against timeout to fail fast
    const timeoutPromise = new Promise<boolean>((_, reject) =>
      setTimeout(() => reject(new Error("R2 check timeout")), timeoutMs)
    );
    
    return await Promise.race([promise, timeoutPromise]);
  } catch {
    // Any R2 error (timeout, network, auth) → assume R2 unavailable
    return false;
  }
}

// Dual-read aware polling: tries local first, fallback to R2 if enabled
// Returns {path, provider} if found, null otherwise
export async function waitForStoredFileWithFallback(
  storedPath: string,
  attempts = 8,
  delayMs = 200,
  options?: R2ReadCompatibilityOptions
): Promise<{path: string, provider: 'local' | 'r2'} | null> {
  const absPath = resolveStoredPath(storedPath);
  const r2Key = resolveR2FallbackKey(storedPath, options);
  
  // PHASE 1: Try local first (8 attempts, normal polling cadence)
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const stats = await fs.stat(absPath);
      if (stats.isFile() && stats.size > 0) {
        return {path: absPath, provider: 'local'};
      }
    } catch {
      // keep polling
    }
    if (attempt < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  // PHASE 2: Fallback to R2 if enabled
  if (storageFeatureFlags.ENABLE_DUAL_READ && storageFeatureFlags.ENABLE_R2_UPLOADS) {
    try {
      const { metrics } = await import("../metrics.js");
      const { logTelemetry } = await import("../telemetry.js");
      metrics.incCounter("dual_read_fallback_total");
      logTelemetry({
        event: "dual_read_fallback",
        provider: "r2",
        objectKey: r2Key,
      });
      const r2Exists = await checkR2ExistsQuick(storedPath, 2000, options);
      if (r2Exists) {
        logTelemetry({
          event: "provider_fallback",
          provider: "r2",
          objectKey: r2Key,
        });
        return { path: r2Key, provider: 'r2' };
      }
    } catch (err) {
      const { logTelemetry } = await import("../telemetry.js");
      logTelemetry({
        event: "provider_fallback",
        provider: "r2",
        objectKey: r2Key,
        error: err instanceof Error ? err.message : String(err),
      });
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
