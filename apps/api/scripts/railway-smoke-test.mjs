import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const API_BASE_URL = (process.env.API_BASE_URL || "").trim();
const EMAIL = (process.env.SMOKE_EMAIL || "").trim();
const PASSWORD = (process.env.SMOKE_PASSWORD || "").trim();
const POLL_INTERVAL_MS = Number(process.env.SMOKE_POLL_INTERVAL_MS || 5000);
const RETRY_DELAY_MS = Number(process.env.SMOKE_RETRY_DELAY_MS || 8000);
const MAX_JOB_WAIT_MS = Number(process.env.SMOKE_MAX_JOB_WAIT_MS || 180000);

if (!API_BASE_URL) {
  console.error("Missing API_BASE_URL");
  process.exit(1);
}
if (!EMAIL || !PASSWORD) {
  console.error("Missing SMOKE_EMAIL or SMOKE_PASSWORD");
  process.exit(1);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function jsonFetch(url, init = {}) {
  const res = await fetch(url, init);
  const bodyText = await res.text();
  let body = null;
  try {
    body = bodyText ? JSON.parse(bodyText) : null;
  } catch {
    body = { raw: bodyText };
  }
  if (!res.ok) {
    const msg = body?.message || body?.error || `${res.status} ${res.statusText}`;
    throw new Error(`${url} -> ${msg}`);
  }
  return body;
}

async function login() {
  const body = await jsonFetch(`${API_BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });

  const token = String(body?.token || "").trim();
  if (!token) {
    throw new Error("Login succeeded but no token returned");
  }
  return token;
}

async function createTempCsv() {
  const filePath = path.join(os.tmpdir(), `railway-smoke-${Date.now()}.csv`);
  const csv = [
    "shipperName,shipperPhone,shipperAddress,shipperEmail,senderCity,consigneeName,consigneeEmail,consigneePhone,consigneeAddress,ConsigneeCity,CollectAmount,orderid,ProductDescription,Weight,shipment_type,numberOfPieces,TrackingID",
    "Acme Store,03001234567,1 Mall Road,ops@acme.example,Lahore,Ali Raza,ali@example.com,03111222333,House 10 Street 5,Lahore,20000,2026-04-17,Books,1.0,VPL,1,VPL260300001",
  ].join("\n");

  await fs.writeFile(filePath, csv, "utf8");
  return filePath;
}

async function uploadFile(token, filePath) {
  const form = new FormData();
  const blob = new Blob([await fs.readFile(filePath)]);
  form.append("file", blob, "smoke.csv");
  form.append("generateMoneyOrder", "false");
  form.append("autoGenerateTracking", "false");
  form.append("trackAfterGenerate", "false");
  form.append("carrierType", "pakistan_post");
  form.append("shipmentType", "VPL");

  const res = await fetch(`${API_BASE_URL}/api/jobs/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: form,
  });

  const bodyText = await res.text();
  let body = null;
  try {
    body = bodyText ? JSON.parse(bodyText) : null;
  } catch {
    body = { raw: bodyText };
  }

  if (!res.ok) {
    const msg = body?.message || body?.error || `${res.status} ${res.statusText}`;
    throw new Error(`Upload failed: ${msg}`);
  }

  const jobId = String(body?.jobId || "").trim();
  if (!jobId) {
    throw new Error("Upload succeeded but no jobId returned");
  }

  return { jobId, response: body };
}

async function pollJob(token, jobId) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < MAX_JOB_WAIT_MS) {
    const body = await jsonFetch(`${API_BASE_URL}/api/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const status = String(body?.job?.status || "").toUpperCase();
    if (status === "COMPLETED") {
      return body?.job;
    }
    if (status === "FAILED") {
      throw new Error(`Worker failed job ${jobId}: ${body?.job?.error || "unknown error"}`);
    }

    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(`Worker did not complete job ${jobId} within ${MAX_JOB_WAIT_MS}ms`);
}

async function verifyPdfDownload(token, jobId) {
  const res = await fetch(`${API_BASE_URL}/api/jobs/${jobId}/download/labels`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`PDF download failed (${res.status}): ${msg}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  if (!buffer.length) {
    throw new Error("PDF download is empty");
  }
}

async function runSmokeOnce() {
  const token = await login();
  const csvPath = await createTempCsv();

  try {
    const upload = await uploadFile(token, csvPath);
    console.log(`[SMOKE] Upload success. jobId=${upload.jobId}`);
    console.log("[SMOKE] Job created.");

    const job = await pollJob(token, upload.jobId);
    console.log(`[SMOKE] Worker picked and processed job. status=${job.status}`);

    await verifyPdfDownload(token, upload.jobId);
    console.log("[SMOKE] PDF generated and downloadable.");
  } finally {
    await fs.unlink(csvPath).catch(() => {});
  }
}

async function main() {
  let attempt = 1;
  while (true) {
    try {
      console.log(`[SMOKE] Attempt ${attempt}`);
      await runSmokeOnce();
      console.log("[SMOKE] SUCCESS");
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[SMOKE] Attempt ${attempt} failed: ${message}`);
      attempt += 1;
      await sleep(RETRY_DELAY_MS);
    }
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[SMOKE] Fatal error: ${message}`);
  process.exit(1);
});
