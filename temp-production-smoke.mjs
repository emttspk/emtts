import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const API = "https://api-production-28491.up.railway.app";
const email = `railway.smoke.${Date.now()}@example.com`;
const password = "SmokePass123!";
const trackingId = `VPL26${String(Math.floor(Math.random()*900000)+100000)}`;
const csvPath = path.join(os.tmpdir(), `railway-smoke-${Date.now()}.csv`);

const csv = [
  "shipperName,shipperPhone,shipperAddress,shipperEmail,senderCity,consigneeName,consigneeEmail,consigneePhone,consigneeAddress,ConsigneeCity,CollectAmount,orderid,ProductDescription,Weight,shipment_type,numberOfPieces,TrackingID",
  `Acme Store,03001234567,1 Mall Road,ops@acme.example,Lahore,Ali Raza,ali@example.com,03111222333,House 10 Street 5,Lahore,20000,SMOKE-${Date.now()},Books,1.0,VPL,1,${trackingId}`
].join("\n");
fs.writeFileSync(csvPath, csv, "utf8");

function out(label, value) { console.log(`${label}:`, value); }
async function j(res){ const t=await res.text(); try{return JSON.parse(t);}catch{return {raw:t}} }

let token = "";
let jobId = "";
let finalJob = null;

try {
  const regRes = await fetch(`${API}/api/auth/register`, {
    method: "POST",
    headers: {"content-type":"application/json"},
    body: JSON.stringify({ email, password, companyName: "Smoke Co", address: "1 Mall Road", contactNumber: "03001234567", originCity: "Lahore" })
  });
  const regBody = await j(regRes);
  out("registerStatus", regRes.status);

  const loginRes = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: {"content-type":"application/json"},
    body: JSON.stringify({ email, password })
  });
  const loginBody = await j(loginRes);
  out("loginStatus", loginRes.status);
  if(!loginRes.ok) throw new Error(`login failed ${JSON.stringify(loginBody)}`);
  token = String(loginBody.token || "");
  if(!token) throw new Error("missing token");

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
    body: form
  });
  const uploadBody = await j(uploadRes);
  out("uploadStatus", uploadRes.status);
  if(!uploadRes.ok) throw new Error(`upload failed ${JSON.stringify(uploadBody)}`);
  jobId = String(uploadBody.jobId || "");
  out("jobId", jobId);
  if(!jobId) throw new Error("missing jobId");

  const seen = new Set();
  const start = Date.now();
  while(Date.now()-start < 240000){
    const r = await fetch(`${API}/api/jobs/${jobId}`, { headers: { authorization: `Bearer ${token}` } });
    const b = await j(r);
    const s = String(b?.job?.status || "UNKNOWN").toUpperCase();
    seen.add(s);
    out("jobStatus", s);
    if(s === "COMPLETED") { finalJob = b.job; break; }
    if(s === "FAILED") throw new Error(`job failed ${b?.job?.error || "unknown"}`);
    await new Promise(r => setTimeout(r, 3000));
  }
  out("statusSequence", Array.from(seen).join("->"));
  if(!finalJob) throw new Error("job did not complete in time");

  const labelsRes = await fetch(`${API}/api/jobs/${jobId}/download/labels`, { headers: { authorization: `Bearer ${token}` } });
  out("labelsDownloadStatus", labelsRes.status);
  const labelsBuf = Buffer.from(await labelsRes.arrayBuffer());
  out("labelsBytes", labelsBuf.length);

  const moRes = await fetch(`${API}/api/jobs/${jobId}/download/money-orders`, { headers: { authorization: `Bearer ${token}` } });
  out("moneyOrdersDownloadStatus", moRes.status);
  const moBuf = Buffer.from(await moRes.arrayBuffer());
  out("moneyOrdersBytes", moBuf.length);

  const trackRes = await fetch(`${API}/api/tracking/track/${trackingId}`, { headers: { authorization: `Bearer ${token}` } });
  const trackBody = await j(trackRes);
  out("trackStatus", trackRes.status);

  const preRes = await fetch(`${API}/api/tracking/complaint/prefill/${trackingId}`, { headers: { authorization: `Bearer ${token}` } });
  const preBody = await j(preRes);
  out("prefillStatus", preRes.status);

  const complaintPayload = {
    tracking_number: trackingId,
    phone: "03001234567",
    complaint_text: "Parcel pending too long. Please investigate.",
    complaint_reason: "Pending Delivery",
    recipient_city_value: String(preBody?.prefill?.recipient_city || "Lahore"),
    recipient_district: String(preBody?.prefill?.district || "Lahore"),
    recipient_tehsil: String(preBody?.prefill?.tehsil || "Lahore City"),
    recipient_location: String(preBody?.prefill?.delivery_office || "GPO Lahore")
  };

  const compRes = await fetch(`${API}/api/tracking/complaint`, {
    method: "POST",
    headers: { "content-type":"application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(complaintPayload)
  });
  const compBody = await j(compRes);
  out("complaintStatusCode", compRes.status);
  out("complaintSuccess", compBody?.success);
  out("complaintStatus", compBody?.status || compBody?.message || "");
  out("complaintId", compBody?.complaint_id || "");
  out("complaintDueDate", compBody?.due_date || "");

  console.log("SMOKE_RESULT_JSON=" + JSON.stringify({
    email,
    jobId,
    trackingId,
    statusSequence: Array.from(seen),
    labelsStatus: labelsRes.status,
    moneyOrdersStatus: moRes.status,
    complaintHttp: compRes.status,
    complaint: compBody
  }));
} catch (e) {
  console.error("SMOKE_FAILED", e?.message || e);
  process.exitCode = 1;
} finally {
  try { fs.unlinkSync(csvPath); } catch {}
}
