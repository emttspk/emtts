import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const API = "https://api-production-28491.up.railway.app";
const email = `railway.retry.${Date.now()}@example.com`;
const password = "SmokePass123!";
const trackingId = `VPL26${String(Math.floor(Math.random()*900000)+100000)}`;
const csvPath = path.join(os.tmpdir(), `railway-retry-${Date.now()}.csv`);
const csv = [
  "shipperName,shipperPhone,shipperAddress,shipperEmail,senderCity,consigneeName,consigneeEmail,consigneePhone,consigneeAddress,ConsigneeCity,CollectAmount,orderid,ProductDescription,Weight,shipment_type,numberOfPieces,TrackingID",
  `Acme Store,03001234567,1 Mall Road,ops@acme.example,Lahore,Ali Raza,ali@example.com,03111222333,House 10 Street 5,Lahore,20000,RETRY-${Date.now()},Books,1.0,VPL,1,${trackingId}`
].join("\n");
fs.writeFileSync(csvPath, csv, "utf8");

async function j(r){const t=await r.text(); try{return JSON.parse(t)}catch{return {raw:t}}}
const out = (k,v)=>console.log(`${k}:`,v);

try {
  await fetch(`${API}/api/auth/register`, { method:"POST", headers:{"content-type":"application/json"}, body: JSON.stringify({email,password,companyName:"Retry Co",address:"1 Mall Road",contactNumber:"03001234567",originCity:"Lahore"}) });
  const loginRes = await fetch(`${API}/api/auth/login`, { method:"POST", headers:{"content-type":"application/json"}, body: JSON.stringify({email,password}) });
  const loginBody = await j(loginRes);
  out("login", loginRes.status);
  if(!loginRes.ok) throw new Error(JSON.stringify(loginBody));
  const token = loginBody.token;

  const form = new FormData();
  form.append("file", new Blob([fs.readFileSync(csvPath)]), path.basename(csvPath));
  form.append("generateMoneyOrder", "true");
  form.append("autoGenerateTracking", "false");
  form.append("trackAfterGenerate", "false");
  form.append("carrierType", "pakistan_post");
  form.append("shipmentType", "VPL");

  const uploadRes = await fetch(`${API}/api/jobs/upload`, { method:"POST", headers:{authorization:`Bearer ${token}`}, body: form });
  const uploadBody = await j(uploadRes);
  out("upload", uploadRes.status);
  if(!uploadRes.ok) throw new Error(JSON.stringify(uploadBody));
  const jobId = uploadBody.jobId;
  out("jobId", jobId);

  let done = false;
  for (let i=0;i<80;i++) {
    const jr = await fetch(`${API}/api/jobs/${jobId}`, { headers:{authorization:`Bearer ${token}`}});
    const jb = await j(jr);
    const st = String(jb?.job?.status||"");
    out("status", st);
    if(st === "COMPLETED") { done = true; break; }
    if(st === "FAILED") throw new Error(`FAILED:${jb?.job?.error||""}`);
    await new Promise(r=>setTimeout(r,2500));
  }
  if(!done) throw new Error("timeout waiting completed");

  const lr = await fetch(`${API}/api/jobs/${jobId}/download/labels`, { headers:{authorization:`Bearer ${token}`}});
  const ltext = await lr.text();
  out("labels", lr.status);
  if(lr.status !== 200) out("labelsBody", ltext.slice(0,220));

  const mr = await fetch(`${API}/api/jobs/${jobId}/download/money-orders`, { headers:{authorization:`Bearer ${token}`}});
  const mtext = await mr.text();
  out("money", mr.status);
  if(mr.status !== 200) out("moneyBody", mtext.slice(0,220));

  console.log("RETRY_RESULT=" + JSON.stringify({jobId,trackingId,labels:lr.status,money:mr.status}));
} catch (e) {
  console.error("RETRY_FAILED", e?.message||e);
  process.exitCode = 1;
} finally {
  try{fs.unlinkSync(csvPath);}catch{}
}
