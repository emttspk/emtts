import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { StorageProvider } from "./StorageProvider.js";
import { metrics, r2ConcurrencyLimitHits, r2FailureCounter, r2TimeoutCounter } from "../metrics.js";
import {
  logCompatibilityLookupAttempt,
  logCompatibilityLookupHit,
  logCompatibilityLookupMetadataBypass,
  logCompatibilityLookupMiss,
  logTelemetry,
} from "../telemetry.js";
import { Readable } from "stream";
import { pipeline } from "node:stream/promises";
import {
  DUAL_KEY_LOOKUP_ENABLED,
  ENABLE_NORMALIZED_LOOKUP_CANDIDATES,
  NORMALIZED_KEYS_FOR_NEW_UPLOADS,
  r2Config as rolloutR2Config,
} from "../config.js";
import { Semaphore } from "async-mutex";
import {
  resolveObjectKeyCandidates,
  getNormalizedObjectKey,
  type CompatibilityMode,
  type ObjectKeyVersion,
  validateCompatibilityLookupMetadata,
} from "./key-normalization.js";

export interface R2Config {
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string;
  region?: string;
  bucket: string;
  prefix?: string;
}

export interface R2ReadCompatibilityOptions {
  keyVersion?: "legacy" | "normalized";
  jobId?: string;
  artifactType?: "labelsPdf" | "moneyOrderPdf" | "trackingResult";
}

interface ResolvedCompatibilityKey {
  objectKey: string;
  objectKeyVersion: ObjectKeyVersion;
  lookupAttempt: number;
  compatibilityMode: CompatibilityMode;
  existsResolved?: boolean;
}

const r2StreamSemaphore = new Semaphore(rolloutR2Config.MAX_CONCURRENT_STREAMS);

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("Operation timed out")), timeoutMs)
  );
  return Promise.race([promise, timeout]);
}

/**
 * Measure execution time of an async operation
 * Returns: [result, elapsedMs]
 */
async function measureLatency<T>(fn: () => Promise<T>): Promise<[T, number]> {
  const startMs = Date.now();
  const result = await fn();
  const elapsedMs = Date.now() - startMs;
  return [result, elapsedMs];
}

export class R2StorageProvider implements StorageProvider {
  private client: S3Client;

  private bucket: string;

  private prefix: string;

  constructor(config: R2Config) {
    this.client = new S3Client({
      region: config.region || "auto",
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
    this.bucket = config.bucket;
    this.prefix = config.prefix ?? "";
  }

  /**
   * Phase 9B Day 1: Compute the upload object key, considering normalized key generation.
   * Returns an object with both the key and the version used (legacy or normalized).
   *
   * When NORMALIZED_KEYS_FOR_NEW_UPLOADS is enabled and type="pdf" with valid jobId/artifactType:
   *   - Returns normalized key format: pdf/{env}/{jobId}/{type}.pdf
   * Otherwise:
   *   - Returns legacy key format: pdf/{path}
   *
   * This method is exposed for use by the dual-write orchestration layer.
   */
  computeUploadObjectKey(
    type: string,
    key: string,
    options?: {
      jobId?: string;
      artifactType?: "labelsPdf" | "moneyOrderPdf" | "trackingResult";
    }
  ): {
    objectKey: string;
    objectKeyVersion: ObjectKeyVersion;
  } {
    // Phase 9B: If flag enabled, type is pdf, and metadata provided, generate normalized key
    if (NORMALIZED_KEYS_FOR_NEW_UPLOADS && type === "pdf" && options?.jobId && options?.artifactType) {
      const normalizedKey = getNormalizedObjectKey(options.jobId, options.artifactType);
      const objectKey = `${this.prefix}${normalizedKey}`.replace(/\\/g, "/");
      return { objectKey, objectKeyVersion: "normalized" };
    }

    // Otherwise, use legacy key format
    const objectKey = this.buildKey(type, key);
    return { objectKey, objectKeyVersion: "legacy" };
  }

  private async resolveCompatibleObjectKey(
    type: string,
    key: string,
    options?: R2ReadCompatibilityOptions
  ): Promise<ResolvedCompatibilityKey> {
    const activationFlagsEnabled = DUAL_KEY_LOOKUP_ENABLED && ENABLE_NORMALIZED_LOOKUP_CANDIDATES;
    const metadataValidation = validateCompatibilityLookupMetadata({
      type,
      keyVersion: options?.keyVersion,
      jobId: options?.jobId,
      artifactType: options?.artifactType,
    });
    const compatibilityEnabled = activationFlagsEnabled && metadataValidation.isValid;

    const candidates = resolveObjectKeyCandidates({
      type,
      key,
      prefix: this.prefix,
      compatibilityEnabled,
      jobId: options?.jobId,
      artifactType: options?.artifactType,
    });

    // Default runtime behavior: legacy-only short-circuit when gates are off or metadata invalid.
    if (!compatibilityEnabled) {
      const bypassReason = activationFlagsEnabled
        ? metadataValidation.metadataBypassReason
        : "activation_flag_disabled";
      const shouldEmitBypassTelemetry = DUAL_KEY_LOOKUP_ENABLED;
      if (bypassReason && shouldEmitBypassTelemetry) {
        logCompatibilityLookupMetadataBypass({
          objectKey: candidates[0].objectKey,
          objectKeyVersion: "legacy",
          lookupAttempt: 1,
          compatibilityMode: "legacy-only",
          metadataValidationResult: activationFlagsEnabled
            ? metadataValidation.metadataValidationResult
            : "invalid",
          metadataBypassReason: bypassReason,
          artifactType: options?.artifactType,
          jobId: options?.jobId,
        });
      }
      return {
        ...candidates[0],
        existsResolved: undefined,
      };
    }

    let fallbackCandidate = candidates[candidates.length - 1];
    for (const candidate of candidates) {
      logCompatibilityLookupAttempt({
        objectKey: candidate.objectKey,
        objectKeyVersion: candidate.objectKeyVersion,
        lookupAttempt: candidate.lookupAttempt,
        compatibilityMode: candidate.compatibilityMode,
        artifactType: options?.artifactType,
        jobId: options?.jobId,
      });

      try {
        await this.client.send(
          new HeadObjectCommand({
            Bucket: this.bucket,
            Key: candidate.objectKey,
          })
        );

        logCompatibilityLookupHit({
          objectKey: candidate.objectKey,
          objectKeyVersion: candidate.objectKeyVersion,
          lookupAttempt: candidate.lookupAttempt,
          compatibilityMode: candidate.compatibilityMode,
          artifactType: options?.artifactType,
          jobId: options?.jobId,
        });

        return {
          ...candidate,
          existsResolved: true,
        };
      } catch (err: any) {
        logCompatibilityLookupMiss({
          objectKey: candidate.objectKey,
          objectKeyVersion: candidate.objectKeyVersion,
          lookupAttempt: candidate.lookupAttempt,
          compatibilityMode: candidate.compatibilityMode,
          artifactType: options?.artifactType,
          jobId: options?.jobId,
          error: err instanceof Error ? err.message : String(err),
        });

        // Continue to next candidate for all miss/error conditions.
        fallbackCandidate = candidate;
      }
    }

    return {
      ...fallbackCandidate,
      existsResolved: false,
    };
  }

  async readArtifactStream(
    type: string,
    key: string,
    outputStream: NodeJS.WritableStream,
    options?: R2ReadCompatibilityOptions
  ): Promise<void> {
    const resolvedKey = await this.resolveCompatibleObjectKey(type, key, options);
    const objectKey = resolvedKey.objectKey;
    try {
      const availableSlots = r2StreamSemaphore.getValue();
      if (availableSlots <= 0) {
        r2ConcurrencyLimitHits.inc();
        logTelemetry({
          event: "concurrency_limit_hit",
          provider: "r2",
          artifactType: type,
          objectKey,
          activeStreams: rolloutR2Config.MAX_CONCURRENT_STREAMS,
          maxConcurrentStreams: rolloutR2Config.MAX_CONCURRENT_STREAMS,
        });
      }

      await r2StreamSemaphore.runExclusive(async () => {
        const res = await withTimeout(
          this.client.send(
            new GetObjectCommand({
              Bucket: this.bucket,
              Key: objectKey,
            })
          ),
          rolloutR2Config.TIMEOUT_MS
        );

        if (!res.Body) throw new Error("No body in R2 object response");
        const stream = res.Body as Readable;
        await pipeline(stream, outputStream);
      });
    } catch (err) {
      if (err instanceof Error && err.message === "Operation timed out") {
        r2TimeoutCounter.inc();
      } else {
        r2FailureCounter.inc();
      }
      throw err;
    }
  }

  private buildKey(type: string, key: string) {
    return `${this.prefix}${type}/${key}`.replace(/\\/g, "/");
  }

  async writeArtifact(type: string, key: string, data: Buffer | string): Promise<string> {
    const objectKey = this.buildKey(type, key);
    return this.writeArtifactWithKey(objectKey, data);
  }

  /**
   * Phase 9B Day 2.5: Write a pre-built object key directly, bypassing buildKey().
   * Used ONLY by the dual-write orchestration layer for normalized key uploads, where
   * the full key has already been computed by computeUploadObjectKey().
   * Legacy uploads continue to use writeArtifact() which applies buildKey().
   */
  async writeArtifactWithKey(objectKey: string, data: Buffer | string): Promise<string> {
    const start = Date.now();
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: objectKey,
          Body: data,
        })
      );
      const latency = Date.now() - start;
      metrics.observeHistogram("r2_upload_latency_ms", latency, { objectKey });
      logTelemetry({
        event: "r2_upload_latency",
        objectKey,
        latencyMs: latency,
        outcome: "success",
      });
      return objectKey;
    } catch (err) {
      logTelemetry({
        event: "r2_upload_latency",
        objectKey,
        outcome: "failure",
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  async readArtifact(type: string, key: string, options?: R2ReadCompatibilityOptions): Promise<Buffer> {
    const resolvedKey = await this.resolveCompatibleObjectKey(type, key, options);
    const objectKey = resolvedKey.objectKey;
    const start = Date.now();
    try {
      const res = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: objectKey,
        })
      );
      if (!res.Body) throw new Error("No body in R2 object response");
      const stream = res.Body as Readable;
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const latency = Date.now() - start;
      metrics.observeHistogram("r2_download_latency_ms", latency, { objectKey });
      logTelemetry({
        event: "r2_download_success",
        objectKey,
        latencyMs: latency,
        outcome: "success",
      });
      return Buffer.concat(chunks);
    } catch (err) {
      metrics.incCounter("r2_download_failure_total", { objectKey });
      logTelemetry({
        event: "r2_download_failure",
        objectKey,
        outcome: "failure",
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  async deleteArtifact(type: string, key: string): Promise<void> {
    const objectKey = this.buildKey(type, key);
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
      })
    );
  }

  async artifactExists(type: string, key: string, options?: R2ReadCompatibilityOptions): Promise<boolean> {
    const resolvedKey = await this.resolveCompatibleObjectKey(type, key, options);
    if (resolvedKey.existsResolved === false) {
      return false;
    }
    if (resolvedKey.existsResolved === true) {
      return true;
    }

    const objectKey = resolvedKey.objectKey;
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: objectKey,
        })
      );
      return true;
    } catch (err: any) {
      if (err?.$metadata?.httpStatusCode === 404) return false;
      return false;
    }
  }

  async getArtifactUrl(type: string, key: string, options?: R2ReadCompatibilityOptions): Promise<string> {
    const resolvedKey = await this.resolveCompatibleObjectKey(type, key, options);
    const objectKey = resolvedKey.objectKey;
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }),
      { expiresIn: 3600 }
    );
  }

  // ============= Stage S1 Staging Validation Methods =============

  async validateConnectivity(): Promise<{ success: boolean; error?: string }> {
    try {
      await withTimeout(
        this.client.send(
          new HeadObjectCommand({
            Bucket: this.bucket,
            Key: ".connectivity-check",
          })
        ),
        rolloutR2Config.TIMEOUT_MS
      );
      return { success: true };
    } catch (err) {
      // 404 is expected (object doesn't exist), means bucket is reachable
      const statusCode = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
      if ((err instanceof Error && err.message.includes("NotFound")) || statusCode === 404) {
        return { success: true };
      }
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async validateUploadPermission(): Promise<{ success: boolean; error?: string }> {
    const testKey = `.staging-test-upload-${Date.now()}`;
    try {
      await withTimeout(
        this.client.send(
          new PutObjectCommand({
            Bucket: this.bucket,
            Key: testKey,
            Body: Buffer.from("staging-test"),
          })
        ),
        rolloutR2Config.TIMEOUT_MS
      );
      // Clean up test object
      try {
        await this.client.send(
          new DeleteObjectCommand({
            Bucket: this.bucket,
            Key: testKey,
          })
        );
      } catch {
        // Ignore cleanup errors
      }
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async validateDownloadPermission(): Promise<{ success: boolean; error?: string }> {
    try {
      await withTimeout(
        this.client.send(
          new GetObjectCommand({
            Bucket: this.bucket,
            Key: ".connectivity-check",
          })
        ),
        rolloutR2Config.TIMEOUT_MS
      );
      return { success: true };
    } catch (err) {
      // 404 is expected, means permission exists but object doesn't
      const statusCode = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
      if ((err instanceof Error && err.message.includes("NotFound")) || statusCode === 404) {
        return { success: true };
      }
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async validatePresignedUrl(): Promise<{ success: boolean; error?: string }> {
    try {
      const url = await getSignedUrl(
        this.client,
        new GetObjectCommand({ Bucket: this.bucket, Key: ".connectivity-check" }),
        { expiresIn: 3600 }
      );
      return { success: Boolean(url && url.length > 0) };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async validateBucketAccess(): Promise<{
    connectivity: boolean;
    uploadable: boolean;
    downloadable: boolean;
    presignedUrl: boolean;
    allValid: boolean;
    errors: string[];
    latencies?: {
      connectivity_ms?: number;
      upload_ms?: number;
      download_ms?: number;
      presigned_ms?: number;
      total_ms?: number;
    };
  }> {
    const startMs = Date.now();
    const results = {
      connectivity: false,
      uploadable: false,
      downloadable: false,
      presignedUrl: false,
      allValid: false,
      errors: [] as string[],
      latencies: {
        connectivity_ms: 0,
        upload_ms: 0,
        download_ms: 0,
        presigned_ms: 0,
        total_ms: 0,
      },
    };

    // Connectivity check with latency
    const [connTest, connLatency] = await measureLatency(() => this.validateConnectivity());
    results.connectivity = connTest.success;
    results.latencies.connectivity_ms = connLatency;
    if (!connTest.success && connTest.error) results.errors.push(`Connectivity: ${connTest.error}`);

    // Upload check with latency
    const [uploadTest, uploadLatency] = await measureLatency(() => this.validateUploadPermission());
    results.uploadable = uploadTest.success;
    results.latencies.upload_ms = uploadLatency;
    if (!uploadTest.success && uploadTest.error) results.errors.push(`Upload: ${uploadTest.error}`);

    // Download check with latency
    const [downloadTest, downloadLatency] = await measureLatency(() => this.validateDownloadPermission());
    results.downloadable = downloadTest.success;
    results.latencies.download_ms = downloadLatency;
    if (!downloadTest.success && downloadTest.error) results.errors.push(`Download: ${downloadTest.error}`);

    // Presigned URL check with latency
    const [presignedTest, presignedLatency] = await measureLatency(() => this.validatePresignedUrl());
    results.presignedUrl = presignedTest.success;
    results.latencies.presigned_ms = presignedLatency;
    if (!presignedTest.success && presignedTest.error) results.errors.push(`Presigned URL: ${presignedTest.error}`);

    results.latencies.total_ms = Date.now() - startMs;
    results.allValid = results.connectivity && results.uploadable && results.downloadable && results.presignedUrl;
    return results;
  }
}
