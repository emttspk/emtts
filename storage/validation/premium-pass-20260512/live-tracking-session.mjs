import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const API_BASE_URL = "https://api.epost.pk";
const ts = Date.now();
const email = `premium.pass.${ts}@example.com`;
const password = `Premium@${ts}Aa!`;
const username = `premium_${ts}`;
const contactNumber = `03${String(ts).slice(-9)}`;
const cnic = String(ts).slice(-13);
const trackingIds = ["VPL25120101", "VPL25120102", "VPL25120103"];

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const registerBody = {
  email,
  password,
  username,
  companyName: "Premium Pass Validation",
  address: "Validation Street",
  contactNumber,
  cnic,
  originCity: "Lahore"
};

const auth = await jsonFetch(`${API_BASE_URL}/api/auth/register`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(registerBody)
});

const token = String(auth?.token || "").trim();
const role = String(auth?.user?.role || "USER").trim() || "USER";
if (!token) throw new Error("Registration succeeded without token");

const csvPath = path.join(os.tmpdir(), `premium-pass-${ts}.csv`);
const csv = ["TrackingID", ...trackingIds].join("\n");
await fs.writeFile(csvPath, csv, "utf8");

try {
  const form = new FormData();
  const blob = new Blob([await fs.readFile(csvPath)]);
  form.append("file", blob, "tracking.csv");

  const uploadRes = await fetch(`${API_BASE_URL}/api/tracking/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  const uploadText = await uploadRes.text();
  let uploadBody = null;
  try {
    uploadBody = uploadText ? JSON.parse(uploadText) : null;
  } catch {
    uploadBody = { raw: uploadText };
  }

  if (!uploadRes.ok) {
    const msg = uploadBody?.message || uploadBody?.error || `${uploadRes.status} ${uploadRes.statusText}`;
    throw new Error(`Upload failed: ${msg}`);
  }

  const jobId = String(uploadBody?.jobId || "").trim();
  if (!jobId) throw new Error("Tracking upload returned no jobId");

  const started = Date.now();
  let finalJob = null;
  while (Date.now() - started < 240000) {
    const jobBody = await jsonFetch(`${API_BASE_URL}/api/tracking/${jobId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const status = String(jobBody?.job?.status || "").toUpperCase();
    if (status === "COMPLETED") {
      finalJob = jobBody.job;
      break;
    }
    if (status === "FAILED") {
      throw new Error(`Tracking job failed: ${jobBody?.job?.error || "unknown error"}`);
    }
    await sleep(5000);
  }

  if (!finalJob) throw new Error("Tracking job did not complete in time");

  const shipments = await jsonFetch(`${API_BASE_URL}/api/shipments?page=1&limit=20`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const payload = {
    email,
    password,
    token,
    role,
    jobId,
    trackingIds,
    shipmentCount: Array.isArray(shipments?.shipments) ? shipments.shipments.length : 0,
    sampleTrackingNumbers: Array.isArray(shipments?.shipments)
      ? shipments.shipments.slice(0, 10).map((row) => String(row?.trackingNumber || "").trim())
      : []
  };

  const outPath = path.resolve("storage", "validation", "premium-pass-20260512", "live-tracking-session.json");
  await fs.writeFile(outPath, JSON.stringify(payload, null, 2), "utf8");
  console.log(JSON.stringify({ outPath, ...payload }, null, 2));
} finally {
  await fs.unlink(csvPath).catch(() => {});
}
