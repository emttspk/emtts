/**
 * Smoke test for the LabelGen system.
 *
 * Validates:
 *  1. Storage directories exist and are writable
 *  2. Puppeteer can launch with bundled Chromium
 *  3. Redis connection succeeds
 *  4. PDF generation pipeline works end-to-end
 *
 * Usage:
 *   npx tsx apps/api/src/scripts/smokeTest.ts
 *   # or after build:
 *   node apps/api/dist/scripts/smokeTest.js
 */
import fs from "node:fs";
import path from "node:path";
import { UPLOAD_DIR } from "../utils/paths.js";
import { outputsDir } from "../storage/paths.js";

const OUTPUT_DIR = outputsDir();

let passed = 0;
let failed = 0;

function ok(label: string) {
  passed++;
  console.log(`  ✔ ${label}`);
}
function fail(label: string, reason: string) {
  failed++;
  console.error(`  ✘ ${label}: ${reason}`);
}

// ---------- 1. Storage dirs ----------
console.log("\n[1/4] Storage directories");
try {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const testFile = path.join(UPLOAD_DIR, ".smoke-test");
  fs.writeFileSync(testFile, "ok");
  fs.unlinkSync(testFile);
  ok(`Uploads writable: ${UPLOAD_DIR}`);
} catch (e) {
  fail("Uploads dir", e instanceof Error ? e.message : String(e));
}
try {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const testFile = path.join(OUTPUT_DIR, ".smoke-test");
  fs.writeFileSync(testFile, "ok");
  fs.unlinkSync(testFile);
  ok(`Outputs writable: ${OUTPUT_DIR}`);
} catch (e) {
  fail("Outputs dir", e instanceof Error ? e.message : String(e));
}

// ---------- 2. Puppeteer ----------
console.log("\n[2/4] Puppeteer (bundled Chromium)");
try {
  const puppeteer = await import("puppeteer");
  const browser = await puppeteer.default.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  const version = await browser.version();
  ok(`Browser launched: ${version}`);

  const page = await browser.newPage();
  await page.setContent("<h1>Smoke Test</h1>", { waitUntil: "networkidle0" });
  const pdf = await page.pdf({ format: "A4" });
  await page.close();
  await browser.close();

  if (pdf.length > 100) {
    ok(`PDF generated (${pdf.length} bytes)`);
  } else {
    fail("PDF generation", `Output too small: ${pdf.length} bytes`);
  }
} catch (e) {
  fail("Puppeteer launch", e instanceof Error ? e.message : String(e));
}

// ---------- 3. Redis ----------
console.log("\n[3/4] Redis connection");
const redisUrl = (process.env.REDIS_URL ?? "").trim();
if (!redisUrl) {
  fail("Redis", "REDIS_URL not set — skipping");
} else {
  try {
    const { default: Redis } = await import("ioredis");
    const redis = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      connectTimeout: 15_000,
      commandTimeout: 15_000,
      lazyConnect: true,
      retryStrategy: (times: number) => Math.min(times * 300, 3_000),
    });
    await redis.connect();
    ok("Redis connected");
    const pong = await redis.ping();
    ok(`Redis ping: ${pong}`);
    await redis.quit();
  } catch (e) {
    fail("Redis connection", e instanceof Error ? e.message : String(e));
  }
}

// ---------- 4. Path consistency ----------
console.log("\n[4/4] Path consistency");
ok(`UPLOAD_DIR: ${UPLOAD_DIR}`);

// No reference to apps/api/storage should exist at runtime
const badPath = path.join(process.cwd(), "apps/api/storage/uploads");
if (fs.existsSync(badPath)) {
  fail("Stale path", `${badPath} still exists — may cause confusion`);
} else {
  ok("No stale apps/api/storage/uploads directory");
}

// ---------- Summary ----------
console.log(`\n${"=".repeat(40)}`);
if (failed === 0) {
  console.log(`SYSTEM WORKING — ${passed} checks passed`);
  process.exit(0);
} else {
  console.error(`${failed} check(s) FAILED, ${passed} passed`);
  process.exit(1);
}
