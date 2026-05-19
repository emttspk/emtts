// Utility functions for storage key normalization (Phase 9A Day 1)
import path from "path";

/**
 * Returns the current environment name for key scoping.
 * "production" | "staging" | "development" | "test"
 */
export function getEnvironmentName(): string {
  const env = process.env.NODE_ENV?.toLowerCase();
  if (env === "production" || env === "staging" || env === "test") return env;
  return "development";
}

/**
 * Returns the normalized R2 object key for a given job/artifact.
 * Format: pdf/{env}/{jobId}/{type}.pdf or json/{env}/{jobId}/{type}.json
 */
export function getNormalizedObjectKey(
  jobId: string,
  artifactType: "labelsPdf" | "moneyOrderPdf" | "trackingResult"
): string {
  const env = getEnvironmentName();
  if (artifactType === "trackingResult") {
    return `json/${env}/${jobId}/tracking-result.json`;
  }
  const type =
    artifactType === "labelsPdf"
      ? "labels"
      : artifactType === "moneyOrderPdf"
      ? "money-orders"
      : "unknown";
  return `pdf/${env}/${jobId}/${type}.pdf`;
}

/**
 * Returns true if the key matches the normalized format (PDF or JSON).
 */
export function isNormalizedKey(key: string): boolean {
  return /^pdf\/(staging|production|development|test)\/[^/]+\/(labels|money-orders|tracking)\.pdf$/.test(key) ||
         /^json\/(staging|production|development|test)\/[^/]+\/tracking-result\.json$/.test(key);
}

/**
 * Returns the legacy R2 object key for a given absolute path.
 */
export function getLegacyObjectKey(absolutePath: string): string {
  return `pdf/${absolutePath}`.replace(/\\/g, "/");
}

/**
 * Extracts the jobId from an absolute path (e.g., .../job123-labels.pdf).
 */
export function extractJobIdFromAbsolutePath(absolutePath: string): string | null {
  const fileName = path.basename(absolutePath);
  const match = fileName.match(/^([^-]+)-/);
  return match ? match[1] : null;
}

export type ObjectKeyVersion = "legacy" | "normalized";

export type CompatibilityMode = "legacy-only" | "dual-key";

export interface ObjectKeyCandidate {
  objectKey: string;
  objectKeyVersion: ObjectKeyVersion;
  lookupAttempt: number;
  compatibilityMode: CompatibilityMode;
}

export type MetadataBypassReason =
  | "missing_job_id"
  | "missing_artifact_type"
  | "unsupported_type"
  | "forced_legacy_override";

export interface CompatibilityLookupMetadataValidationResult {
  isValid: boolean;
  metadataValidationResult: "valid" | "invalid";
  metadataBypassReason?: MetadataBypassReason;
}

export function validateCompatibilityLookupMetadata(params: {
  type: string;
  keyVersion?: "legacy" | "normalized";
  jobId?: string;
  artifactType?: "labelsPdf" | "moneyOrderPdf" | "trackingResult";
}): CompatibilityLookupMetadataValidationResult {
  const { type, keyVersion, jobId, artifactType } = params;

  if (keyVersion === "legacy") {
    return {
      isValid: false,
      metadataValidationResult: "invalid",
      metadataBypassReason: "forced_legacy_override",
    };
  }

  if (type !== "pdf") {
    return {
      isValid: false,
      metadataValidationResult: "invalid",
      metadataBypassReason: "unsupported_type",
    };
  }

  if (!jobId) {
    return {
      isValid: false,
      metadataValidationResult: "invalid",
      metadataBypassReason: "missing_job_id",
    };
  }

  if (!artifactType) {
    return {
      isValid: false,
      metadataValidationResult: "invalid",
      metadataBypassReason: "missing_artifact_type",
    };
  }

  return {
    isValid: true,
    metadataValidationResult: "valid",
  };
}

/**
 * Builds ordered object-key candidates for compatibility lookup.
 * Ordering support:
 * 1) normalized
 * 2) legacy
 *
 * NOTE: caller controls whether normalized lookup is enabled.
 */
export function resolveObjectKeyCandidates(params: {
  type: string;
  key: string;
  prefix?: string;
  compatibilityEnabled: boolean;
  jobId?: string;
  artifactType?: "labelsPdf" | "moneyOrderPdf" | "trackingResult";
}): ObjectKeyCandidate[] {
  const { type, key, prefix = "", compatibilityEnabled, jobId, artifactType } = params;
  const legacyObjectKey = `${prefix}${type}/${key}`.replace(/\\/g, "/");

  if (compatibilityEnabled && type === "pdf" && jobId && artifactType) {
    const normalizedObjectKey = `${prefix}${getNormalizedObjectKey(jobId, artifactType)}`.replace(/\\/g, "/");
    return [
      {
        objectKey: normalizedObjectKey,
        objectKeyVersion: "normalized",
        lookupAttempt: 1,
        compatibilityMode: "dual-key",
      },
      {
        objectKey: legacyObjectKey,
        objectKeyVersion: "legacy",
        lookupAttempt: 2,
        compatibilityMode: "dual-key",
      },
    ];
  }

  return [
    {
      objectKey: legacyObjectKey,
      objectKeyVersion: "legacy",
      lookupAttempt: 1,
      compatibilityMode: "legacy-only",
    },
  ];
}
