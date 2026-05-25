import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

// Ensure fallback gate can open via route-level override while dual-read stays off.
process.env.ENABLE_R2_UPLOADS = "true";
process.env.ENABLE_DUAL_READ = "false";
process.env.DELETE_LOCAL_AFTER_R2_SYNC = "false";
process.env.NODE_ENV = process.env.NODE_ENV || "development";

const pathsMod = await import(pathToFileURL(path.join(repoRoot, "apps/api/dist/storage/paths.js")).href);
const providerMod = await import(pathToFileURL(path.join(repoRoot, "apps/api/dist/storage/provider.js")).href);
const keyNormMod = await import(pathToFileURL(path.join(repoRoot, "apps/api/dist/storage/key-normalization.js")).href);

const {
  waitForStoredFileWithFallback,
  resolveStoredPath,
} = pathsMod;
const { getDualProviders } = providerMod;
const { getNormalizedObjectKey } = keyNormMod;

const storedPath = "generated/proof-missing-labels.pdf";
const absPath = resolveStoredPath(storedPath);
await fs.rm(absPath, { force: true });

const jobId = "proof-job-r2-fallback";
const expectedNormalized = getNormalizedObjectKey(jobId, "labelsPdf").replace(/^(pdf|json|xlsx)\//, "");
const expectedLegacy = resolveStoredPath(storedPath);

const dualProviders = getDualProviders();
const r2Provider = dualProviders.r2;

if (typeof r2Provider.artifactExists !== "function") {
  throw new Error("R2 provider does not expose artifactExists for fallback verification");
}

const originalArtifactExists = r2Provider.artifactExists.bind(r2Provider);

try {
  const callsNormalizedFirst = [];
  r2Provider.artifactExists = async (_type, key) => {
    callsNormalizedFirst.push(key);
    return key === expectedNormalized;
  };

  const resultNormalized = await waitForStoredFileWithFallback(storedPath, 1, 0, {
    jobId,
    artifactType: "labelsPdf",
    forceR2FallbackOnLocalMiss: true,
  });

  assert.ok(resultNormalized, "Expected fallback result when local file is missing");
  assert.equal(resultNormalized.provider, "r2", "Expected provider=r2 on local miss");
  assert.equal(resultNormalized.path, expectedNormalized, "Expected normalized key to be selected first");
  assert.equal(callsNormalizedFirst[0], expectedNormalized, "Expected normalized key probe to happen first");

  const routeTelemetrySimulation = {
    labels_download_local_miss: resultNormalized.provider !== "local",
    labels_download_r2_fallback_attempt: resultNormalized.provider !== "local",
    labels_download_r2_fallback_success: resultNormalized.provider === "r2",
    labels_download_404: !resultNormalized,
  };

  assert.equal(routeTelemetrySimulation.labels_download_local_miss, true);
  assert.equal(routeTelemetrySimulation.labels_download_r2_fallback_attempt, true);
  assert.equal(routeTelemetrySimulation.labels_download_r2_fallback_success, true);
  assert.equal(routeTelemetrySimulation.labels_download_404, false);

  const callsLegacyPreserved = [];
  r2Provider.artifactExists = async (_type, key) => {
    callsLegacyPreserved.push(key);
    return key === expectedLegacy;
  };

  const resultLegacy = await waitForStoredFileWithFallback(storedPath, 1, 0, {
    jobId,
    artifactType: "labelsPdf",
    forceR2FallbackOnLocalMiss: true,
  });

  assert.ok(resultLegacy, "Expected legacy fallback result when normalized key misses");
  assert.equal(resultLegacy.provider, "r2", "Expected provider=r2 when legacy key exists");
  assert.equal(resultLegacy.path, expectedLegacy, "Expected legacy key to remain a supported fallback lookup");
  assert.equal(callsLegacyPreserved[0], expectedNormalized, "Expected normalized lookup to run before legacy lookup");
  assert.ok(
    callsLegacyPreserved.includes(expectedLegacy),
    "Expected legacy key lookup to be preserved after normalized miss"
  );

  const output = {
    status: "PASS",
    proof: "labels-download-r2-fallback-local-miss",
    localFileMissing: true,
    fallbackExercised: true,
    selectedProvider: resultNormalized.provider,
    selectedKey: resultNormalized.path,
    normalizedLookupFirst: callsNormalizedFirst[0] === expectedNormalized,
    legacyLookupPreserved: callsLegacyPreserved.includes(expectedLegacy),
    simulatedTelemetry: routeTelemetrySimulation,
  };

  console.log(JSON.stringify(output, null, 2));
} finally {
  r2Provider.artifactExists = originalArtifactExists;
}
