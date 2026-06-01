import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const IDENTITY_PATH = path.join(ROOT, ".ai-project", "PROJECT_IDENTITY.json");

const ACCOUNT_ENV_NAMES = ["CLOUDFLARE_ACCOUNT_ID", "CF_ACCOUNT_ID"];
const BUCKET_ENV_NAMES = ["R2_BUCKET", "R2_BUCKET_NAME", "CLOUDFLARE_R2_BUCKET"];

function fail(message) {
  console.error(`STOP: ${message}`);
  process.exit(1);
}

function isPlaceholder(value) {
  return /^PASTE_/i.test(String(value || "").trim());
}

function readFirstAvailable(names) {
  for (const name of names) {
    const value = process.env[name];
    if (typeof value === "string" && value.trim()) {
      return { name, value: value.trim() };
    }
  }
  return { name: "", value: "" };
}

if (!fs.existsSync(IDENTITY_PATH)) {
  fail("Missing .ai-project/PROJECT_IDENTITY.json");
}

const identity = JSON.parse(fs.readFileSync(IDENTITY_PATH, "utf8"));

const expectedAccountId = String(identity.expectedCloudflareAccountId || "").trim();
const allowedBuckets = Array.isArray(identity.allowedR2Buckets)
  ? identity.allowedR2Buckets.map((v) => String(v || "").trim()).filter(Boolean)
  : [];

const account = readFirstAvailable(ACCOUNT_ENV_NAMES);
const bucket = readFirstAvailable(BUCKET_ENV_NAMES);

console.log("INFO: Running read-only R2 target check.");
console.log(`INFO: Account env detected: ${account.name || "(none)"}`);
console.log(`INFO: Bucket env detected: ${bucket.name || "(none)"}`);

if (expectedAccountId && !isPlaceholder(expectedAccountId) && account.value && account.value !== expectedAccountId) {
  fail(`Cloudflare account mismatch for ${account.name}`);
}

const effectiveAllowedBuckets = allowedBuckets.filter((value) => !isPlaceholder(value));
if (effectiveAllowedBuckets.length > 0 && bucket.value && !effectiveAllowedBuckets.includes(bucket.value)) {
  fail(`R2 bucket mismatch for ${bucket.name}`);
}

console.log("PASS: R2 check completed (read-only, no upload, no delete). ");

if (!account.name || !bucket.name) {
  console.log("INFO: Environment variable names not fully present; comparison limited to available values.");
}

if (isPlaceholder(expectedAccountId) || effectiveAllowedBuckets.length === 0) {
  console.log("INFO: Placeholder values still present in PROJECT_IDENTITY.json; replace to enforce strict target matching.");
}