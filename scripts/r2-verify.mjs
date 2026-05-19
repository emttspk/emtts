#!/usr/bin/env node

/**
 * Stage S1 Staging: R2 Bucket Verification Script (Enhanced)
 * 
 * Validates Cloudflare R2 bucket connectivity, permissions, and configuration
 * Integrates Wrangler CLI validation (optional, non-fatal)
 * Includes live latency diagnostics
 * Usage: npm run r2:verify
 * 
 * Env loading: Automatically loads .env.staging.local if it exists
 * Precedence: shell env > .env.staging.local > defaults
 * 
 * Exit codes:
 *   0: All checks passed
 *   1: Configuration missing
 *   2: Connectivity failed
 *   3: Permission denied
 *   4: Wrangler validation failed (non-fatal)
 *   5: Timeout exceeded
 */

import { S3Client, HeadObjectCommand, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { loadStagingEnv, getEnvSource, logEnvDiagnostics } from "./env-loader.mjs";
import { getWranglerDiagnostics, validateBucketInWrangler } from "./wrangler-r2.mjs";

const args = process.argv.slice(2);
const verbose = args.includes("--verbose") || args.includes("-v");
const skipDiagnostics = args.includes("--no-diagnostics");

function log(msg) {
  console.log(msg);
}

function warn(msg) {
  console.warn(`⚠️  ${msg}`);
}

function error(msg) {
  console.error(`❌ ${msg}`);
}

function success(msg) {
  console.log(`✓ ${msg}`);
}

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Measure execution time of async operation
 * Returns: [result, elapsedMs]
 */
async function measureLatency(fn) {
  const startMs = Date.now();
  const result = await fn();
  const elapsedMs = Date.now() - startMs;
  return [result, elapsedMs];
}

async function main() {
  log("\n╔════════════════════════════════════════════════════╗");
  log("║  STAGE S1: R2 BUCKET VERIFICATION                  ║");
  log("╚════════════════════════════════════════════════════╝\n");

  // Load staging env (shell > .env.staging.local > defaults)
  loadStagingEnv({ verbose, silent: false });
  
  if (!skipDiagnostics) {
    logEnvDiagnostics();
  }

  // Optional: Wrangler CLI diagnostics (non-fatal if missing/unauth)
  log("\n[0/8] Checking Wrangler environment (optional)...");
  const wranglerDiags = getWranglerDiagnostics();
  if (wranglerDiags.wranglerAvailable) {
    success(`Wrangler detected: ${wranglerDiags.wranglerVersion}`);
    if (wranglerDiags.wranglerAuthenticated) {
      success(`Wrangler authenticated`);
      if (wranglerDiags.configuredBuckets.length > 0) {
        log(`  Available buckets: ${wranglerDiags.configuredBuckets.join(", ")}`);
      }
    } else {
      warn("Wrangler not authenticated - AWS SDK will be used for validation");
      if (wranglerDiags.errors.length > 0) {
        wranglerDiags.errors.forEach((err) => log(`  ${err}`));
      }
    }
  } else {
    log("Wrangler CLI not detected - using AWS SDK for validation");
  }

  // Configuration validation
  log("[1/8] Validating configuration...");
  const r2Endpoint = process.env.R2_ENDPOINT;
  const r2Bucket = process.env.R2_BUCKET;
  const accessKeyId = String(process.env.R2_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY || "").trim();
  const secretAccessKey = String(process.env.R2_SECRET_ACCESS_KEY || process.env.R2_SECRET_KEY || "").trim();
  const stagingEnabled = process.env.STAGING_R2_ENABLED === "true";

  if (!stagingEnabled) {
    warn("STAGING_R2_ENABLED is not set to 'true'");
    log("Run: STAGING_R2_ENABLED=true npm run r2:verify");
  }

  const configMissing = [];
  if (!r2Endpoint) configMissing.push("R2_ENDPOINT");
  if (!r2Bucket) configMissing.push("R2_BUCKET");
  if (!accessKeyId) configMissing.push("R2_ACCESS_KEY_ID or R2_ACCESS_KEY");
  if (!secretAccessKey) configMissing.push("R2_SECRET_ACCESS_KEY or R2_SECRET_KEY");

  if (configMissing.length > 0) {
    error(`Missing configuration: ${configMissing.join(", ")}`);
    process.exit(1);
  }
  success("Configuration found");

  if (verbose) {
    log(`  Endpoint: ${r2Endpoint}`);
    log(`  Bucket: ${r2Bucket}`);
    log(`  Access Key ID: ${accessKeyId.substring(0, 8)}...`);
  }

  // Bucket validation against Wrangler (if available)
  if (wranglerDiags.wranglerAvailable && wranglerDiags.wranglerAuthenticated) {
    log("\n[1.5/8] Cross-validating bucket with Wrangler...");
    const bucketCheck = validateBucketInWrangler(r2Bucket);
    if (bucketCheck.exists) {
      success(`Bucket "${r2Bucket}" exists in Wrangler`);
    } else {
      warn(`Bucket "${r2Bucket}" not found in Wrangler`);
      if (bucketCheck.allBuckets && bucketCheck.allBuckets.length > 0) {
        log(`  Available buckets: ${bucketCheck.allBuckets.join(", ")}`);
        log(`  Did you mean one of these? Update R2_BUCKET env var`);
      }
    }
  }

  // Create S3 client
  log("\n[2/8] Creating S3 client...");
  const client = new S3Client({
    region: "auto",
    endpoint: r2Endpoint,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
  success("S3 client created");

  // Test connectivity with latency measurement
  log("\n[3/8] Testing connectivity...");
  let connectivityLatency = 0;
  try {
    const [_, latency] = await measureLatency(() =>
      Promise.race([
        client.send(new HeadObjectCommand({ Bucket: r2Bucket, Key: ".connectivity-check" })),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000)),
      ])
    );
    connectivityLatency = latency;
    success(`Bucket is reachable (${latency}ms)`);
  } catch (err) {
    // 404 means bucket exists but object doesn't - that's fine
    if (err.message.includes("NotFound") || err.name === "NotFound") {
      connectivityLatency = Date.now();
      success(`Bucket is reachable (${connectivityLatency}ms, via 404)`);
    } else {
      error(`Connectivity failed: ${err.message}`);
      if (err.message.includes("timeout")) error("  > Request timed out (>5s)");
      if (err.message.includes("Access Denied")) error("  > Check R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY");
      if (err.message.includes("InvalidBucketName")) error("  > Check R2_BUCKET name");
      process.exit(2);
    }
  }

  // Test upload permission with latency measurement
  log("\n[4/8] Testing upload permission...");
  const testUploadKey = `healthchecks/staging-test-upload-${Date.now()}`;
  let uploadLatency = 0;
  try {
    const [_, latency] = await measureLatency(() =>
      client.send(
        new PutObjectCommand({
          Bucket: r2Bucket,
          Key: testUploadKey,
          Body: Buffer.from("staging-test"),
        })
      )
    );
    uploadLatency = latency;
    success(`Upload permission confirmed (${latency}ms)`);

    // Clean up test object
    try {
      await client.send(new DeleteObjectCommand({ Bucket: r2Bucket, Key: testUploadKey }));
      if (verbose) log("  (Test object cleaned up)");
    } catch (err) {
      warn(`Could not delete test object: ${err.message}`);
    }
  } catch (err) {
    error(`Upload permission denied: ${err.message}`);
    if (err.message.includes("Access Denied")) error("  > Check R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY");
    if (err.message.includes("NoSuchBucket")) error("  > Check R2_BUCKET name");
    process.exit(3);
  }

  // Test delete permission with latency measurement
  log("\n[5/8] Testing delete permission...");
  const testDeleteKey = `healthchecks/staging-test-delete-${Date.now()}`;
  let deleteLatency = 0;
  try {
    // First, upload a test object
    await client.send(
      new PutObjectCommand({
        Bucket: r2Bucket,
        Key: testDeleteKey,
        Body: Buffer.from("staging-delete-test"),
      })
    );

    // Then, delete it to test permission
    const [_, latency] = await measureLatency(() =>
      client.send(new DeleteObjectCommand({ Bucket: r2Bucket, Key: testDeleteKey }))
    );
    deleteLatency = latency;
    success(`Delete permission confirmed (${latency}ms)`);
  } catch (err) {
    error(`Delete permission denied: ${err.message}`);
    if (err.message.includes("Access Denied")) error("  > Check R2_SECRET_ACCESS_KEY permissions for s3:DeleteObject");
    process.exit(3);
  }

  // Test download permission with latency measurement
  log("\n[6/8] Testing download permission...");
  let downloadLatency = 0;
  try {
    // First upload a test object
    const testDownloadKey = `healthchecks/staging-test-download-${Date.now()}`;
    await client.send(
      new PutObjectCommand({
        Bucket: r2Bucket,
        Key: testDownloadKey,
        Body: Buffer.from("staging-download-test"),
      })
    );

    // Then download it to test permission
    const [_, latency] = await measureLatency(() =>
      client.send(new GetObjectCommand({ Bucket: r2Bucket, Key: testDownloadKey }))
    );
    downloadLatency = latency;
    success(`Download permission confirmed (${latency}ms)`);

    // Clean up test object
    try {
      await client.send(new DeleteObjectCommand({ Bucket: r2Bucket, Key: testDownloadKey }));
      if (verbose) log("  (Test object cleaned up)");
    } catch (err) {
      warn(`Could not delete test object: ${err.message}`);
    }
  } catch (err) {
    error(`Download permission denied: ${err.message}`);
    if (err.message.includes("Access Denied")) error("  > Check R2_SECRET_ACCESS_KEY permissions for s3:GetObject");
    process.exit(3);
  }

  // Test presigned URL generation with latency measurement
  log("\n[7/8] Testing presigned URL generation...");
  let presignedLatency = 0;
  try {
    const [url, latency] = await measureLatency(() =>
      getSignedUrl(
        client,
        new GetObjectCommand({ Bucket: r2Bucket, Key: `healthchecks/presigned-test-${Date.now()}` }),
        { expiresIn: 3600 }
      )
    );
    presignedLatency = latency;
    
    if (!url || url.length === 0) {
      error("Presigned URL generation returned empty URL");
      process.exit(3);
    }
    success(`Presigned URL generation working (${latency}ms)`);
    if (verbose) {
      log(`  URL: ${url.substring(0, 80)}...`);
    }
  } catch (err) {
    error(`Presigned URL generation failed: ${err.message}`);
    if (err.message.includes("Access Denied")) error("  > Check R2_SECRET_ACCESS_KEY permissions");
    process.exit(3);
  }

  // Summary with latency diagnostics
  log("\n[8/8] All checks passed!");
  log("\n╔════════════════════════════════════════════════════╗");
  log("║  ✓ R2 BUCKET READY FOR STAGE S1 STAGING            ║");
  log("╚════════════════════════════════════════════════════╝");
  
  // Latency summary
  log("\n📊 Latency Summary:");
  log(`  Connectivity:     ${connectivityLatency}ms`);
  log(`  Upload:           ${uploadLatency}ms`);
  log(`  Delete:           ${deleteLatency}ms`);
  log(`  Download:         ${downloadLatency}ms`);
  log(`  Presigned URL:    ${presignedLatency}ms`);
  const totalLatency = connectivityLatency + uploadLatency + deleteLatency + downloadLatency + presignedLatency;
  log(`  Total:            ${totalLatency}ms`);
  
  // Latency health warnings
  if (connectivityLatency > 2000) warn(`  ⚠️ Connectivity latency high (${connectivityLatency}ms)`);
  if (uploadLatency > 3000) warn(`  ⚠️ Upload latency high (${uploadLatency}ms)`);
  if (deleteLatency > 2000) warn(`  ⚠️ Delete latency high (${deleteLatency}ms)`);
  if (downloadLatency > 3000) warn(`  ⚠️ Download latency high (${downloadLatency}ms)`);
  if (presignedLatency > 1000) warn(`  ⚠️ Presigned URL generation latency high (${presignedLatency}ms)`);
  
  log("\n✨ Next Steps:");
  log(`  1. Enable S1 staging with:`);
  log(`     STAGING_R2_ENABLED=true ENABLE_DUAL_WRITE=true ENABLE_R2_UPLOADS=true npm run dev:api`);
  log(`  2. Monitor dual-write activity:`);
  log(`     npm run r2:canary-check`);
  log(`  3. Check telemetry summaries:`);
  log(`     npm run r2:telemetry-summary`);
  log();
}

main().catch((err) => {
  error(`Verification failed: ${err.message}`);
  if (verbose) console.error(err);
  process.exit(1);
});
