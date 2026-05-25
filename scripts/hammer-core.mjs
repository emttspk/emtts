import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const DEFAULT_POLL_INTERVAL_MS = Number(process.env.HAMMER_POLL_INTERVAL_MS || 3000);
const DEFAULT_MAX_WAIT_MS = Number(process.env.HAMMER_MAX_WAIT_MS || 300000);

export function getApiBaseUrl() {
  return (process.env.API_BASE_URL || "http://localhost:3000").trim();
}

export function assertSafeTarget(apiBaseUrl) {
  let url;
  try {
    url = new URL(apiBaseUrl);
  } catch {
    throw new Error(`Invalid API_BASE_URL: ${apiBaseUrl}`);
  }

  const host = url.hostname.toLowerCase();
  const allowNonLocal = process.env.ALLOW_NON_LOCAL_HAMMER_TARGET === "true";
  const blockedProdLike = host === "api.epost.pk" || host.endsWith(".epost.pk") || host === "epost.pk";
  const localHosts = new Set(["localhost", "127.0.0.1"]);

  if (blockedProdLike && !allowNonLocal) {
    throw new Error(
      "Refusing to run against production-like target. Set ALLOW_NON_LOCAL_HAMMER_TARGET=true only for approved staging.",
    );
  }

  if (!localHosts.has(host) && !allowNonLocal) {
    throw new Error(
      `Refusing non-local target (${host}). Set ALLOW_NON_LOCAL_HAMMER_TARGET=true only for approved staging.`,
    );
  }

  return { host, allowNonLocal };
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function jsonFetch(url, init = {}) {
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

export async function ensureCredentials(apiBaseUrl, tag = "hammer") {
  const email = (process.env.HAMMER_EMAIL || "").trim();
  const password = (process.env.HAMMER_PASSWORD || "").trim();
  if (email && password) {
    return { email, password, autoCreated: false };
  }

  const ts = Date.now();
  const random = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, "0");
  const autoEmail = `${tag}.${ts}.${random}@example.com`;
  const autoPassword = `Hammer@${ts}Aa!`;
  const autoUsername = `${tag}.${ts}.${random}`.slice(0, 30);
  const contactSeed = String(ts).slice(-9);

  await jsonFetch(`${apiBaseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: autoEmail,
      password: autoPassword,
      username: autoUsername,
      companyName: "Hammer Synthetic",
      address: "Synthetic Street",
      contactNumber: `03${contactSeed}`,
      originCity: "Lahore",
      cnic: String(ts).slice(-13),
    }),
  });

  return { email: autoEmail, password: autoPassword, autoCreated: true };
}

export async function login(apiBaseUrl, creds) {
  const body = await jsonFetch(`${apiBaseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: creds.email, password: creds.password }),
  });

  const token = String(body?.token || "").trim();
  if (!token) {
    throw new Error("Login succeeded but no token returned");
  }
  return token;
}

function toTrackingId(index) {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const serial = String(index).padStart(4, "0").slice(-4);
  return `VPL${yy}${mm}${serial}`;
}

export async function createSyntheticCsv(recordCount, scenarioTag = "phase3") {
  if (!Number.isInteger(recordCount) || recordCount < 1) {
    throw new Error(`recordCount must be a positive integer. Received: ${recordCount}`);
  }

  const headers = [
    "shipperName",
    "shipperPhone",
    "shipperAddress",
    "shipperEmail",
    "senderCity",
    "consigneeName",
    "consigneeEmail",
    "consigneePhone",
    "consigneeAddress",
    "ConsigneeCity",
    "CollectAmount",
    "orderid",
    "ProductDescription",
    "Weight",
    "shipment_type",
    "numberOfPieces",
    "TrackingID",
  ];

  const rows = [headers.join(",")];
  for (let i = 1; i <= recordCount; i += 1) {
    const consignee = `Synthetic User ${i}`;
    const city = i % 2 === 0 ? "Karachi" : "Lahore";
    rows.push(
      [
        "Hammer Synthetic",
        "03001234567",
        "1 Synthetic Road",
        "hammer.synthetic@example.com",
        "Lahore",
        consignee,
        `synthetic.user.${i}@example.com`,
        `03${String(100000000 + i).slice(-9)}`,
        `House ${i} Synthetic Block`,
        city,
        "2000",
        `ORD-${scenarioTag}-${i}`,
        "Synthetic Parcel",
        "1.0",
        "VPL",
        "1",
        toTrackingId(i),
      ].join(","),
    );
  }

  const filePath = path.join(os.tmpdir(), `phase3-hammer-${scenarioTag}-${recordCount}-${Date.now()}.csv`);
  await fs.writeFile(filePath, rows.join("\n"), "utf8");
  return filePath;
}

export async function uploadFile(apiBaseUrl, token, inputPath, options = {}) {
  const form = new FormData();
  const blob = new Blob([await fs.readFile(inputPath)]);
  form.append("file", blob, path.basename(inputPath));
  form.append("generateMoneyOrder", String(options.generateMoneyOrder ?? false));
  form.append("autoGenerateTracking", String(options.autoGenerateTracking ?? false));
  form.append("trackAfterGenerate", String(options.trackAfterGenerate ?? false));
  form.append("carrierType", options.carrierType || "pakistan_post");
  form.append("shipmentType", options.shipmentType || "VPL");

  const res = await fetch(`${apiBaseUrl}/api/jobs/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }

  if (!res.ok) {
    const msg = body?.message || body?.error || `${res.status} ${res.statusText}`;
    throw new Error(`Upload failed: ${msg}`);
  }

  const jobId = String(body?.jobId || "").trim();
  if (!jobId) {
    throw new Error("Upload succeeded but no jobId returned");
  }

  return { jobId, body };
}

export async function pollJob(apiBaseUrl, token, jobId, options = {}) {
  const pollIntervalMs = Number(options.pollIntervalMs || DEFAULT_POLL_INTERVAL_MS);
  const maxWaitMs = Number(options.maxWaitMs || DEFAULT_MAX_WAIT_MS);
  const startedAt = Date.now();
  const history = [];

  while (Date.now() - startedAt < maxWaitMs) {
    const body = await jsonFetch(`${apiBaseUrl}/api/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const job = body?.job || null;
    const status = String(job?.status || "UNKNOWN").toUpperCase();
    history.push({ ts: new Date().toISOString(), status });

    if (status === "COMPLETED" || status === "FAILED") {
      return { job, history, elapsedMs: Date.now() - startedAt };
    }

    await sleep(pollIntervalMs);
  }

  throw new Error(`Job ${jobId} did not finish within ${maxWaitMs}ms`);
}

export async function verifyLabelsDownload(apiBaseUrl, token, jobId) {
  const res = await fetch(`${apiBaseUrl}/api/jobs/${jobId}/download/labels`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Label PDF download failed (${res.status}): ${body}`);
  }

  const bytes = Buffer.from(await res.arrayBuffer());
  if (!bytes.length) {
    throw new Error("Label PDF download returned empty payload");
  }

  return bytes.length;
}

export async function cleanupTempFile(filePath) {
  if (!filePath) return;
  await fs.unlink(filePath).catch(() => {});
}

export async function runSingleHammerScenario({
  scenarioName,
  recordCount,
  expectedStatus = "COMPLETED",
  verifyDownload = true,
  credentialsTag = "hammer",
  pollIntervalMs,
  maxWaitMs,
}) {
  const apiBaseUrl = getApiBaseUrl();
  assertSafeTarget(apiBaseUrl);

  const creds = await ensureCredentials(apiBaseUrl, credentialsTag);
  const token = await login(apiBaseUrl, creds);
  const csvPath = await createSyntheticCsv(recordCount, scenarioName);
  const startedAt = Date.now();

  try {
    const uploadStartedAt = Date.now();
    const upload = await uploadFile(apiBaseUrl, token, csvPath);
    const uploadResponseMs = Date.now() - uploadStartedAt;

    const completionStartedAt = Date.now();
    const polled = await pollJob(apiBaseUrl, token, upload.jobId, { pollIntervalMs, maxWaitMs });
    const jobCompletionMs = Date.now() - completionStartedAt;
    const finalStatus = String(polled.job?.status || "UNKNOWN").toUpperCase();

    if (finalStatus !== expectedStatus.toUpperCase()) {
      throw new Error(
        `${scenarioName}: expected status ${expectedStatus}, got ${finalStatus}. error=${polled.job?.error || "n/a"}`,
      );
    }

    let pdfBytes = 0;
    if (verifyDownload && finalStatus === "COMPLETED") {
      pdfBytes = await verifyLabelsDownload(apiBaseUrl, token, upload.jobId);
    }

    return {
      scenarioName,
      apiBaseUrl,
      jobId: upload.jobId,
      finalStatus,
      uploadResponseMs,
      jobCompletionMs,
      elapsedMs: Date.now() - startedAt,
      pollElapsedMs: polled.elapsedMs,
      pdfBytes,
      autoCreatedUser: creds.autoCreated,
      jobError: polled.job?.error || null,
      history: polled.history,
      job: polled.job,
    };
  } finally {
    await cleanupTempFile(csvPath);
  }
}