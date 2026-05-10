import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import puppeteer from "puppeteer";

const API_BASE_URL = (process.env.API_BASE_URL || "https://api.epost.pk").trim();
const POLL_INTERVAL_MS = 5000;
const MAX_JOB_WAIT_MS = 240000;

const PDF_PATH = path.resolve(process.cwd(), "money-order-footer-proof.pdf");
const PNG_PATH = path.resolve(process.cwd(), "money-order-footer-proof.png");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function jsonFetch(url, init = {}) {
  const res = await fetch(url, init);
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    const msg = body?.message || body?.error || `${res.status} ${res.statusText}`;
    throw new Error(`${url} -> ${msg}`);
  }
  return body;
}

async function ensureCredentials() {
  const ts = Date.now();
  const autoEmail = `mo.proof.${ts}@example.com`;
  const autoPassword = `Proof@${ts}Aa!`;
  const uniqueDigits = String(ts).slice(-9);
  const autoContactNumber = `03${uniqueDigits}`;
  const autoCnic = `${String(ts).slice(-13)}`;

  await jsonFetch(`${API_BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: autoEmail,
      password: autoPassword,
      username: `mo.proof.${ts}`,
      companyName: "MO Proof Auto",
      address: "Proof Street",
      contactNumber: autoContactNumber,
      originCity: "Lahore",
      cnic: autoCnic,
    }),
  });

  return { email: autoEmail, password: autoPassword };
}

async function login(creds) {
  const body = await jsonFetch(`${API_BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: creds.email, password: creds.password }),
  });

  const token = String(body?.token || "").trim();
  if (!token) throw new Error("Login succeeded but token missing");
  return token;
}

async function createTempCsv() {
  const csvPath = path.join(os.tmpdir(), `money-order-proof-${Date.now()}.csv`);
  const csv = [
    "shipperName,shipperPhone,shipperAddress,shipperEmail,senderCity,consigneeName,consigneeEmail,consigneePhone,consigneeAddress,ConsigneeCity,CollectAmount,orderid,ProductDescription,Weight,shipment_type,numberOfPieces,TrackingID",
    "MO Sender,03001234567,1 Mall Road,sender@example.com,Lahore,MO Receiver,receiver@example.com,03111222333,House 10 Street 5,Lahore,20000,MO-PROOF-001,Books,1.0,VPL,1,VPL260500001",
  ].join("\n");
  await fs.writeFile(csvPath, csv, "utf8");
  return csvPath;
}

async function uploadFile(token, csvPath) {
  const form = new FormData();
  const blob = new Blob([await fs.readFile(csvPath)]);
  form.append("file", blob, "money-order-proof.csv");
  form.append("generateMoneyOrder", "true");
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
  if (!jobId) throw new Error("Upload succeeded but no jobId returned");
  return jobId;
}

async function pollJob(token, jobId) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < MAX_JOB_WAIT_MS) {
    const body = await jsonFetch(`${API_BASE_URL}/api/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const status = String(body?.job?.status || "").toUpperCase();
    if (status === "COMPLETED") return;
    if (status === "FAILED") throw new Error(`Job failed: ${body?.job?.error || "unknown"}`);
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`Job timeout after ${MAX_JOB_WAIT_MS}ms`);
}

async function downloadMoneyOrderPdf(token, jobId) {
  const res = await fetch(`${API_BASE_URL}/api/jobs/${jobId}/download/money-orders`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`Money-order PDF download failed (${res.status}): ${msg}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  if (!buffer.length) throw new Error("Money-order PDF is empty");

  await fs.writeFile(PDF_PATH, buffer);
}

async function renderPngFromPdf() {
  const pdfBytes = await fs.readFile(PDF_PATH);
  const pdfBase64 = pdfBytes.toString("base64");
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 2200 });
    await page.setContent(
      `<!doctype html>
      <html>
      <head><meta charset="utf-8" /></head>
      <body style="margin:0;background:#fff;display:flex;justify-content:center;align-items:flex-start;">
        <canvas id="pdf-canvas"></canvas>
      </body>
      </html>`,
      { waitUntil: "networkidle2", timeout: 60000 },
    );

    await page.evaluate(async (base64) => {
      const pdfjs = await import("https://cdn.jsdelivr.net/npm/pdfjs-dist@4.5.136/build/pdf.min.mjs");
      pdfjs.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.5.136/build/pdf.worker.min.mjs";
      const data = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const pdf = await pdfjs.getDocument({ data }).promise;
      const firstPage = await pdf.getPage(1);
      const viewport = firstPage.getViewport({ scale: 2.0 });
      const canvas = document.getElementById("pdf-canvas");
      const ctx = canvas.getContext("2d");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await firstPage.render({ canvasContext: ctx, viewport }).promise;
    }, pdfBase64);

    const canvasHandle = await page.$("#pdf-canvas");
    if (!canvasHandle) {
      throw new Error("Failed to render PDF canvas");
    }
    await canvasHandle.screenshot({ path: PNG_PATH });
  } finally {
    await browser.close();
  }
}

async function main() {
  const creds = await ensureCredentials();
  const token = await login(creds);
  const csvPath = await createTempCsv();
  try {
    const jobId = await uploadFile(token, csvPath);
    console.log(`JOB_ID=${jobId}`);
    await pollJob(token, jobId);
    await downloadMoneyOrderPdf(token, jobId);
    await renderPngFromPdf();
    console.log(`PDF_PROOF=${PDF_PATH}`);
    console.log(`PNG_PROOF=${PNG_PATH}`);
  } finally {
    await fs.unlink(csvPath).catch(() => {});
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
