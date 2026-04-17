/**
 * Smoke test for the LabelGen system.
 *
 * Validates:
 *  1. Storage directories exist and are writable
 *  2. Puppeteer can launch with bundled Chromium
 *  3. Redis connection succeeds
 *  4. PDF generation pipeline works end-to-end
 *  5. Optional API job lifecycle: QUEUED -> PROCESSING -> COMPLETED
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
  console.log("Launching Puppeteer with bundled Chromium");
  const browser = await puppeteer.default.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
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
if (!process.env.REDIS_URL) {
  ok("Redis smoke skipped (REDIS_URL not set)");
} else {
  try {
    // Re-use the shared singleton from lib/redis — no second connection needed.
    const { redis } = await import("../lib/redis.js");
    const pong = await redis.ping();
    ok(`Redis connected (status=${redis.status})`);
    ok(`Redis ping: ${pong}`);
  } catch (e) {
    fail("Redis connection", e instanceof Error ? e.message : String(e));
  }
}

// ---------- 4. Path consistency ----------
console.log("\n[4/4] Path consistency");
ok(`UPLOAD_DIR: ${UPLOAD_DIR}`);

// Confirm UPLOAD_DIR is inside CWD/storage (not a hardcoded /app path)
const isAbsoluteHardcoded = UPLOAD_DIR === "/app/storage/uploads";
if (isAbsoluteHardcoded) {
  fail("Upload path", "UPLOAD_DIR is still hardcoded to /app/storage/uploads — should be CWD-relative");
} else {
  ok(`Upload path is CWD-relative: ${UPLOAD_DIR}`);
}

// ---------- Summary ----------
console.log("\n[5/5] API job lifecycle (optional)");
const apiBaseUrl = (process.env.API_BASE_URL ?? "").trim();
const smokeEmail = (process.env.SMOKE_EMAIL ?? "").trim();
const smokePassword = (process.env.SMOKE_PASSWORD ?? "").trim();

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function parseJsonSafe(res: Response) {
  const bodyText = await res.text();
  try {
    return bodyText ? JSON.parse(bodyText) : null;
  } catch {
    return { raw: bodyText };
  }
}

if (!apiBaseUrl || !smokeEmail || !smokePassword) {
  ok("API lifecycle smoke skipped (set API_BASE_URL, SMOKE_EMAIL, SMOKE_PASSWORD)");
} else {
  try {
    const loginRes = await fetch(`${apiBaseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: smokeEmail, password: smokePassword }),
    });
    const loginBody = await parseJsonSafe(loginRes);
    if (!loginRes.ok) {
      throw new Error(String((loginBody as any)?.message ?? (loginBody as any)?.error ?? "Login failed"));
    }
    const token = String((loginBody as any)?.token ?? "").trim();
    if (!token) {
      throw new Error("Login succeeded but no token was returned");
    }

    const uploadCsvPath = path.join(UPLOAD_DIR, `.smoke-upload-${Date.now()}.csv`);
    const csv = [
      "shipperName,shipperPhone,shipperAddress,shipperEmail,senderCity,consigneeName,consigneeEmail,consigneePhone,consigneeAddress,ConsigneeCity,CollectAmount,orderid,ProductDescription,Weight,shipment_type,numberOfPieces,TrackingID",
      "Acme Store,03001234567,1 Mall Road,ops@acme.example,Lahore,Ali Raza,ali@example.com,03111222333,House 10 Street 5,Lahore,20000,2026-04-17,Books,1.0,VPL,1,VPL260300001",
    ].join("\n");
    fs.writeFileSync(uploadCsvPath, csv, "utf8");

    const form = new FormData();
    const blob = new Blob([fs.readFileSync(uploadCsvPath)]);
    form.append("file", blob, "smoke.csv");
    form.append("generateMoneyOrder", "false");
    form.append("autoGenerateTracking", "false");
    form.append("trackAfterGenerate", "false");
    form.append("carrierType", "pakistan_post");
    form.append("shipmentType", "VPL");

    const uploadRes = await fetch(`${apiBaseUrl}/api/jobs/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const uploadBody = await parseJsonSafe(uploadRes);
    fs.unlinkSync(uploadCsvPath);
    if (!uploadRes.ok) {
      throw new Error(String((uploadBody as any)?.message ?? (uploadBody as any)?.error ?? "Upload failed"));
    }

    const jobId = String((uploadBody as any)?.jobId ?? "").trim();
    if (!jobId) {
      throw new Error("Upload succeeded but no jobId returned");
    }
    ok(`Upload created job: ${jobId}`);

    const seen = new Set<string>();
    const startedAt = Date.now();
    const maxWaitMs = Number(process.env.SMOKE_MAX_JOB_WAIT_MS ?? 180_000);
    while (Date.now() - startedAt < maxWaitMs) {
      const jobRes = await fetch(`${apiBaseUrl}/api/jobs/${jobId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const jobBody = await parseJsonSafe(jobRes);
      if (!jobRes.ok) {
        throw new Error(String((jobBody as any)?.message ?? (jobBody as any)?.error ?? "Failed to fetch job"));
      }

      const status = String((jobBody as any)?.job?.status ?? "").toUpperCase();
      if (status) {
        seen.add(status);
      }

      if (status === "COMPLETED") {
        break;
      }
      if (status === "FAILED") {
        throw new Error(String((jobBody as any)?.job?.error ?? "Job failed"));
      }
      await sleep(4000);
    }

    if (!seen.has("QUEUED")) {
      fail("Job lifecycle", "Did not observe QUEUED status");
    } else {
      ok("Observed QUEUED status");
    }
    if (!seen.has("PROCESSING")) {
      fail("Job lifecycle", "Did not observe PROCESSING status");
    } else {
      ok("Observed PROCESSING status");
    }
    if (!seen.has("COMPLETED")) {
      fail("Job lifecycle", "Did not observe COMPLETED status");
    } else {
      ok("Observed COMPLETED status");
    }

    const pdfRes = await fetch(`${apiBaseUrl}/api/jobs/${jobId}/download/labels`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!pdfRes.ok) {
      const text = await pdfRes.text();
      throw new Error(`PDF download failed: ${text}`);
    }
    const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());
    if (pdfBuffer.length < 100) {
      throw new Error(`PDF too small: ${pdfBuffer.length} bytes`);
    }
    ok(`Downloaded generated PDF (${pdfBuffer.length} bytes)`);
  } catch (e) {
    fail("API lifecycle smoke", e instanceof Error ? e.message : String(e));
  }
}

console.log(`\n${"=".repeat(40)}`);
if (failed === 0) {
  console.log(`SYSTEM WORKING — ${passed} checks passed`);
  process.exit(0);
} else {
  console.error(`${failed} check(s) FAILED, ${passed} passed`);
  process.exit(1);
}
