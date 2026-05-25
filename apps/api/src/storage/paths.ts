import path from "node:path";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import { fileURLToPath } from "node:url";
import { env } from "../config.js";
import { UPLOAD_DIR } from "../utils/paths.js";
import { getDualProviders, storageFeatureFlags } from "./provider.js";
import type { R2ReadCompatibilityOptions } from "./R2StorageProvider.js";
import { getNormalizedObjectKey } from "./key-normalization.js";

type StoredFileFallbackOptions = R2ReadCompatibilityOptions & {
  // Opt-in override for read paths that must fallback to R2 even when dual-read flag is off.
  forceR2FallbackOnLocalMiss?: boolean;
};

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
function resolveR2FallbackKeys(storedPath: string, options?: StoredFileFallbackOptions): string[] {
  const keys: string[] = [];

  // Always probe normalized key first when metadata is available.
  if (options?.jobId && options?.artifactType) {
    const normalized = getNormalizedObjectKey(options.jobId, options.artifactType);
    keys.push(normalized.replace(/^(pdf|json|xlsx)\//, ""));
  }

  // Legacy dual-write uses absolute storage paths as key payload.
  const legacyKey = resolveStoredPath(storedPath);
  if (!keys.includes(legacyKey)) {
    keys.push(legacyKey);
  }

  return keys;
}

function resolveArtifactStorageType(storedPath: string, options?: R2ReadCompatibilityOptions): "pdf" | "json" | "xlsx" {
  if (options?.artifactType === "trackingResult") return "json";
  if (options?.artifactType === "trackingMasterXlsx") return "xlsx";
  if (/\.json$/i.test(storedPath)) return "json";
  if (/\.xlsx$/i.test(storedPath)) return "xlsx";
  return "pdf";
}

async function checkR2ExistsQuick(
  storedPath: string,
  timeoutMs = 2000,
  options?: StoredFileFallbackOptions
): Promise<{ exists: boolean; key?: string }> {
  const allowR2Fallback =
    storageFeatureFlags.ENABLE_R2_UPLOADS &&
    (
      options?.forceR2FallbackOnLocalMiss === true ||
      storageFeatureFlags.ENABLE_DUAL_READ ||
      process.env.DELETE_LOCAL_AFTER_R2_SYNC === "true"
    );

  if (!allowR2Fallback) {
    return { exists: false };
  }

  try {
    const r2Provider = getDualProviders().r2;
    const r2Keys = resolveR2FallbackKeys(storedPath, options);
    const storageType = resolveArtifactStorageType(storedPath, options);

    for (const r2Key of r2Keys) {
      const promise = r2Provider.artifactExists(storageType, r2Key, options);
      const timeoutPromise = new Promise<boolean>((_, reject) =>
        setTimeout(() => reject(new Error("R2 check timeout")), timeoutMs)
      );
      const exists = await Promise.race([promise, timeoutPromise]);
      if (exists) {
        return { exists: true, key: r2Key };
      }
    }

    return { exists: false };
  } catch {
    // Any R2 error (timeout, network, auth) → assume R2 unavailable
    return { exists: false };
  }
}

// Dual-read aware polling: tries local first, fallback to R2 if enabled
// Returns {path, provider} if found, null otherwise
export async function waitForStoredFileWithFallback(
  storedPath: string,
  attempts = 8,
  delayMs = 200,
  options?: StoredFileFallbackOptions
): Promise<{path: string, provider: 'local' | 'r2'} | null> {
  const absPath = resolveStoredPath(storedPath);
  const r2Keys = resolveR2FallbackKeys(storedPath, options);
  const r2PrimaryKey = r2Keys[0] || storedPath;
  const allowR2Fallback =
    storageFeatureFlags.ENABLE_R2_UPLOADS &&
    (
      options?.forceR2FallbackOnLocalMiss === true ||
      storageFeatureFlags.ENABLE_DUAL_READ ||
      process.env.DELETE_LOCAL_AFTER_R2_SYNC === "true"
    );
  
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
  if (allowR2Fallback) {
    try {
      const { metrics } = await import("../metrics.js");
      const { logTelemetry } = await import("../telemetry.js");
      metrics.incCounter("dual_read_fallback_total");
      logTelemetry({
        event: "dual_read_fallback",
        provider: "r2",
        objectKey: r2PrimaryKey,
      });
      const r2Result = await checkR2ExistsQuick(storedPath, 2000, options);
      if (r2Result.exists && r2Result.key) {
        logTelemetry({
          event: "provider_fallback",
          provider: "r2",
          objectKey: r2Result.key,
        });
        return { path: r2Result.key, provider: 'r2' };
      }
    } catch (err) {
      const { logTelemetry } = await import("../telemetry.js");
      logTelemetry({
        event: "provider_fallback",
        provider: "r2",
        objectKey: r2PrimaryKey,
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
