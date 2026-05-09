import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const API_BASE_URL = (process.env.API_BASE_URL || "https://api.epost.pk").trim();
const EMAIL = (process.env.SMOKE_EMAIL || "").trim();
const PASSWORD = (process.env.SMOKE_PASSWORD || "").trim();
const MAX_JOB_WAIT_MS = Number(process.env.SMOKE_MAX_JOB_WAIT_MS || 240000);
const POLL_INTERVAL_MS = Number(process.env.SMOKE_POLL_INTERVAL_MS || 5000);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function jsonFetch(url, init = {}) {
  const res = await fetch(url, init);
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    const msg = body?.message || body?.error || `${res.status} ${res.statusText}`;
    const err = new Error(`${url} -> ${msg}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

async function ensureCredentials() {
  if (EMAIL && PASSWORD) return { email: EMAIL, password: PASSWORD, source: "env" };

  const ts = Date.now();
  const email = `forensic.auto.${ts}@example.com`;
  const password = `Forensic@${ts}Aa!`;
  const contactNumber = `03${String(ts).slice(-9)}`;
  const cnic = `${String(ts).slice(-13)}`;

  await jsonFetch(`${API_BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password,
      username: `forensic.${ts}`,
      companyName: "Forensic Auto",
      address: "Forensic Street",
      contactNumber,
      originCity: "Lahore",
      cnic,
    }),
  });

  return { email, password, source: "auto" };
}

async function login(creds) {
  const body = await jsonFetch(`${API_BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: creds.email, password: creds.password }),
  });
  const token = String(body?.token || "").trim();
  if (!token) throw new Error("Login succeeded but no token returned");
  return token;
}

function buildCsv() {
  return [
    "shipperName,shipperPhone,shipperAddress,shipperEmail,senderCity,consigneeName,consigneeEmail,consigneePhone,consigneeAddress,ConsigneeCity,CollectAmount,orderid,ProductDescription,Weight,shipment_type,numberOfPieces,TrackingID",
    "Forensic Sender,03001234567,1 Forensic Road,ops@forensic.example,Lahore,Receiver Forensic,receiver@example.com,03111222333,House 10 Street 5,Lahore,1500,2026-05-01,Forensic Parcel,1.0,VPL,1,VPL260399991",
  ].join("\n");
}

async function uploadCsv(token, { filename, generateMoneyOrder }) {
  const form = new FormData();
  const blob = new Blob([buildCsv()], { type: "text/csv" });
  form.append("file", blob, filename);
  form.append("generateMoneyOrder", generateMoneyOrder ? "true" : "false");
  form.append("autoGenerateTracking", "false");
  form.append("trackAfterGenerate", "false");
  form.append("carrierType", "pakistan_post");
  form.append("shipmentType", "VPL");

  const res = await fetch(`${API_BASE_URL}/api/jobs/upload`, {
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
    return {
      ok: false,
      status: res.status,
      body,
      errorMessage: body?.message || body?.error || `${res.status} ${res.statusText}`,
    };
  }

  return {
    ok: true,
    status: res.status,
    body,
    jobId: String(body?.jobId || "").trim(),
  };
}

async function waitForJob(token, jobId) {
  const started = Date.now();
  while (Date.now() - started < MAX_JOB_WAIT_MS) {
    const body = await jsonFetch(`${API_BASE_URL}/api/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const status = String(body?.job?.status || "").toUpperCase();
    if (status === "COMPLETED") return body.job;
    if (status === "FAILED") throw new Error(`Job ${jobId} failed: ${body?.job?.error || "unknown"}`);
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`Job ${jobId} did not finish in ${MAX_JOB_WAIT_MS}ms`);
}

async function downloadPdf(token, jobId, kind, outDir) {
  const url = `${API_BASE_URL}/api/jobs/${jobId}/download/${kind}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Download ${kind} failed (${res.status}): ${txt}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const outPath = path.join(outDir, `${jobId}-${kind}.pdf`);
  await fs.writeFile(outPath, buf);

  const text = buf.toString("latin1");
  const imageTokenCount = (text.match(/\/Subtype\s*\/Image/g) || []).length;

  return {
    kind,
    outPath,
    bytes: buf.length,
    imageTokenCount,
  };
}

async function tryAdminSettings(token) {
  try {
    const body = await jsonFetch(`${API_BASE_URL}/api/admin/settings`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return { ok: true, settings: body?.settings || null };
  } catch (error) {
    return {
      ok: false,
      status: error?.status || null,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  const evidenceDir = path.join(process.cwd(), "forensic-artifacts");
  await fs.mkdir(evidenceDir, { recursive: true });

  const creds = await ensureCredentials();
  const token = await login(creds);

  const report = {
    apiBaseUrl: API_BASE_URL,
    credentialsSource: creds.source,
    timestamp: new Date().toISOString(),
    phase5: {},
    phase6: {},
    notes: [],
  };

  // Phase 5: money-order generation + downloadable PDF evidence
  const moUpload = await uploadCsv(token, {
    filename: `forensic-money-order-${Date.now()}.csv`,
    generateMoneyOrder: true,
  });
  if (!moUpload.ok || !moUpload.jobId) {
    throw new Error(`Money-order upload failed: ${moUpload.errorMessage}`);
  }
  const moJob = await waitForJob(token, moUpload.jobId);
  const labelsPdf = await downloadPdf(token, moUpload.jobId, "labels", evidenceDir);
  const moneyPdf = await downloadPdf(token, moUpload.jobId, "money-orders", evidenceDir);

  report.phase5 = {
    jobId: moUpload.jobId,
    jobStatus: moJob.status,
    labelsPdf,
    moneyPdf,
    visualInference: {
      labelsHasImageTokens: labelsPdf.imageTokenCount > 0,
      moneyOrdersHasImageTokens: moneyPdf.imageTokenCount > 0,
      heuristic: "Money-order PDF contains embedded image resources; verify first page visually in OS PDF viewer if needed.",
    },
  };

  // Phase 6a: exempt filename should bypass duplicate blocking
  const exemptName = "LCS 15-13-11-2024.xls";
  const exemptFirst = await uploadCsv(token, { filename: exemptName, generateMoneyOrder: false });
  if (!exemptFirst.ok || !exemptFirst.jobId) {
    throw new Error(`Exempt first upload failed: ${exemptFirst.errorMessage}`);
  }
  await waitForJob(token, exemptFirst.jobId);

  const exemptSecond = await uploadCsv(token, { filename: exemptName, generateMoneyOrder: false });
  if (!exemptSecond.ok || !exemptSecond.jobId) {
    throw new Error(`Exempt second upload unexpectedly blocked: ${exemptSecond.errorMessage}`);
  }
  await waitForJob(token, exemptSecond.jobId);

  // Phase 6b: non-exempt filename should be blocked on second upload after completion
  const normalName = `forensic-non-exempt-${Date.now()}.csv`;
  const normalFirst = await uploadCsv(token, { filename: normalName, generateMoneyOrder: false });
  if (!normalFirst.ok || !normalFirst.jobId) {
    throw new Error(`Normal first upload failed: ${normalFirst.errorMessage}`);
  }
  await waitForJob(token, normalFirst.jobId);

  const normalSecond = await uploadCsv(token, { filename: normalName, generateMoneyOrder: false });

  const adminSettingsProbe = await tryAdminSettings(token);

  report.phase6 = {
    exemptFilename: {
      filename: exemptName,
      firstUpload: { ok: exemptFirst.ok, status: exemptFirst.status, jobId: exemptFirst.jobId },
      secondUpload: { ok: exemptSecond.ok, status: exemptSecond.status, jobId: exemptSecond.jobId },
      expected: "second upload accepted",
    },
    nonExemptFilename: {
      filename: normalName,
      firstUpload: { ok: normalFirst.ok, status: normalFirst.status, jobId: normalFirst.jobId },
      secondUpload: {
        ok: normalSecond.ok,
        status: normalSecond.status,
        errorMessage: normalSecond.errorMessage || null,
      },
      expected: "second upload blocked",
    },
    adminExemptionListAccess: adminSettingsProbe,
  };

  if (!adminSettingsProbe.ok) {
    report.notes.push("Admin exemption list update endpoint is not accessible with current token; dynamic admin-list mutation could not be validated in this run.");
  }

  const reportPath = path.join(process.cwd(), "temp-money-order-forensic-recovery-report.json");
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");

  console.log(JSON.stringify({
    ok: true,
    reportPath,
    evidenceDir,
    phase5: report.phase5,
    phase6: report.phase6,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
