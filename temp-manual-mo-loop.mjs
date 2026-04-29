import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const API = "https://api-production-28491.up.railway.app";
const email = "nazimsaeed@gmail.com";
const password = "Lahore!23";

async function asJson(res) {
  const text = await res.text();
  try {
    return { text, json: JSON.parse(text) };
  } catch {
    return { text, json: null };
  }
}

async function runAttempt(attempt) {
  const trackingId = `VPL26${String(Math.floor(Math.random() * 900000) + 100000)}`;
  const csvPath = path.join(os.tmpdir(), `manual-mo-${Date.now()}-${attempt}.csv`);
  const csv = [
    "shipperName,shipperPhone,shipperAddress,shipperEmail,senderCity,consigneeName,consigneeEmail,consigneePhone,consigneeAddress,ConsigneeCity,CollectAmount,orderid,ProductDescription,Weight,shipment_type,numberOfPieces,TrackingID",
    `Manual Sender,03001234567,1 Mall Road,ops@example.com,Lahore,Manual Receiver,receiver@example.com,03111222333,House 10 Street 5,Lahore,20000,MANUAL-${Date.now()},Books,1.0,VPL,1,${trackingId}`,
  ].join("\n");
  fs.writeFileSync(csvPath, csv, "utf8");

  try {
    const loginRes = await fetch(`${API}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const login = await asJson(loginRes);
    if (!loginRes.ok) throw new Error(`Login failed: ${login.text}`);
    const token = login.json?.token;
    if (!token) throw new Error("No token from login");

    const form = new FormData();
    form.append("file", new Blob([fs.readFileSync(csvPath)]), path.basename(csvPath));
    form.append("generateMoneyOrder", "true");
    form.append("autoGenerateTracking", "false");
    form.append("trackAfterGenerate", "false");
    form.append("carrierType", "pakistan_post");
    form.append("shipmentType", "VPL");

    const uploadRes = await fetch(`${API}/api/jobs/upload`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: form,
    });
    const upload = await asJson(uploadRes);
    if (!uploadRes.ok) throw new Error(`Upload failed: ${upload.text}`);

    const jobId = upload.json?.jobId;
    if (!jobId) throw new Error(`No jobId in upload response: ${upload.text}`);

    let status = "QUEUED";
    let error = "";
    for (let i = 0; i < 60; i += 1) {
      await new Promise((r) => setTimeout(r, 2500));
      const jobRes = await fetch(`${API}/api/jobs/${jobId}`, { headers: { authorization: `Bearer ${token}` } });
      const job = await asJson(jobRes);
      status = String(job.json?.job?.status ?? "");
      error = String(job.json?.job?.error ?? "");
      if (status === "COMPLETED" || status === "FAILED") break;
    }

    const labelsRes = await fetch(`${API}/api/jobs/${jobId}/download/labels`, { headers: { authorization: `Bearer ${token}` } });
    const labelsBody = await asJson(labelsRes);
    const moneyRes = await fetch(`${API}/api/jobs/${jobId}/download/money-orders`, { headers: { authorization: `Bearer ${token}` } });
    const moneyBody = await asJson(moneyRes);

    return {
      attempt,
      trackingId,
      jobId,
      status,
      error,
      labelsStatus: labelsRes.status,
      labelsBody: labelsBody.text.slice(0, 220),
      moneyStatus: moneyRes.status,
      moneyBody: moneyBody.text.slice(0, 220),
      ok: status === "COMPLETED" && labelsRes.status === 200 && moneyRes.status === 200,
    };
  } finally {
    try { fs.unlinkSync(csvPath); } catch {}
  }
}

const maxAttempts = 4;
for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
  const result = await runAttempt(attempt);
  console.log(`ATTEMPT_${attempt}=` + JSON.stringify(result));
  if (result.ok) {
    console.log("SUCCESS_LOOP=true");
    process.exit(0);
  }
}

console.log("SUCCESS_LOOP=false");
process.exit(1);
