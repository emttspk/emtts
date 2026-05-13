import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const API_BASE_URL = "https://api.epost.pk";
const VALIDATION_DIR = path.resolve("storage", "validation", "premium-pass-20260512");
const sessionPath = path.join(VALIDATION_DIR, "live-tracking-session.json");
const session = JSON.parse(await fs.readFile(sessionPath, "utf8"));
const token = String(session?.token ?? "").trim();

if (!token) {
  throw new Error(`Missing token in ${sessionPath}`);
}

const stamp = Date.now();
const csvPath = path.join(os.tmpdir(), `premium-envelope-${stamp}.csv`);
const previewHtmlPath = path.join(VALIDATION_DIR, "production-premium-envelope-preview.html");
const labelsPdfPath = path.join(VALIDATION_DIR, "production-premium-envelope.pdf");

const csvLines = [
  [
    "TrackingID",
    "shipperName",
    "shipperEmail",
    "shipperAddress",
    "senderCity",
    "shipperPhone",
    "consigneeName",
    "consigneeEmail",
    "consigneeAddress",
    "receiverCity",
    "consigneePhone",
    "shipmentType",
    "carrierType",
    "CollectAmount",
    "ordered",
    "ProductDescription",
    "numberOfPieces",
    "Weight",
  ].join(","),
  [
    "CRX260513001",
    "Muhammad Usman",
    "muhammad.usman@example.com",
    '"House 14, Street 8, Gulberg, Lahore"',
    "Lahore",
    "03001234567",
    "Ayesha Khan",
    "ayesha.khan@example.com",
    '"Flat 6, Block C, Satellite Town"',
    "Rawalpindi",
    "03111222333",
    "COURIER",
    "courier",
    "18000",
    "ORDER-260513-001",
    "Premium documents",
    "1",
    "0.5 kg",
  ].join(","),
].join("\n");

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
    const message = body?.message || body?.error || `${res.status} ${res.statusText}`;
    throw new Error(`${url} -> ${message}`);
  }
  return body;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

await fs.writeFile(csvPath, csvLines, "utf8");

try {
  const previewForm = new FormData();
  previewForm.append("file", new Blob([await fs.readFile(csvPath)]), "premium-envelope.csv");
  previewForm.append("carrierType", "courier");
  previewForm.append("shipmentType", "COURIER");
  previewForm.append("outputMode", "envelope-premium");

  const previewBody = await jsonFetch(`${API_BASE_URL}/api/jobs/preview/labels`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: previewForm,
  });

  const previewHtml = String(previewBody?.html ?? "");
  await fs.writeFile(previewHtmlPath, previewHtml, "utf8");
  if (!previewHtml.includes("premium-envelope-page")) {
    throw new Error("Preview HTML did not contain premium envelope markup");
  }

  const uploadForm = new FormData();
  uploadForm.append("file", new Blob([await fs.readFile(csvPath)]), `premium-envelope-${stamp}.csv`);
  uploadForm.append("carrierType", "courier");
  uploadForm.append("shipmentType", "COURIER");
  uploadForm.append("outputMode", "envelope-premium");
  uploadForm.append("barcodeMode", "manual");
  uploadForm.append("trackAfterGenerate", "false");
  uploadForm.append("generateMoneyOrder", "false");

  const uploadBody = await jsonFetch(`${API_BASE_URL}/api/jobs/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: uploadForm,
  });

  const jobId = String(uploadBody?.jobId ?? "").trim();
  if (!jobId) {
    throw new Error("Upload succeeded without a jobId");
  }

  let finalJob = null;
  const startedAt = Date.now();
  while (Date.now() - startedAt < 240000) {
    const body = await jsonFetch(`${API_BASE_URL}/api/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const status = String(body?.job?.status ?? "").toUpperCase();
    if (status === "COMPLETED") {
      finalJob = body.job;
      break;
    }
    if (status === "FAILED") {
      throw new Error(`Label job failed: ${body?.job?.error || "unknown error"}`);
    }
    await sleep(5000);
  }

  if (!finalJob) {
    throw new Error("Label job did not complete in time");
  }

  const pdfRes = await fetch(`${API_BASE_URL}/api/jobs/${jobId}/download/labels`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!pdfRes.ok) {
    throw new Error(`PDF download failed: ${pdfRes.status} ${pdfRes.statusText}`);
  }

  const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());
  await fs.writeFile(labelsPdfPath, pdfBuffer);

  console.log(JSON.stringify({
    jobId,
    previewHtmlPath,
    previewHtmlBytes: Buffer.byteLength(previewHtml, "utf8"),
    labelsPdfPath,
    labelsPdfBytes: pdfBuffer.length,
    status: finalJob.status,
  }, null, 2));
} finally {
  await fs.unlink(csvPath).catch(() => {});
}