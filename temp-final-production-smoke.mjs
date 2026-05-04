import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const API = "https://api.epost.pk";
const email = `railway.final.${Date.now()}@example.com`;
const password = "SmokePass123!";
const trackingId = `VPL26${String(Math.floor(Math.random()*900000)+100000)}`;
const csvPath = path.join(os.tmpdir(), `railway-final-${Date.now()}.csv`);
const csv = [
  "shipperName,shipperPhone,shipperAddress,shipperEmail,senderCity,consigneeName,consigneeEmail,consigneePhone,consigneeAddress,ConsigneeCity,CollectAmount,orderid,ProductDescription,Weight,shipment_type,numberOfPieces,TrackingID",
  `Acme Store,03001234567,1 Mall Road,ops@acme.example,Lahore,Ali Raza,ali@example.com,03111222333,House 10 Street 5,Lahore,20000,FINAL-${Date.now()},Books,1.0,VPL,1,${trackingId}`
].join("\n");
fs.writeFileSync(csvPath, csv, "utf8");

async function j(r){ const t=await r.text(); try{return JSON.parse(t)}catch{return {raw:t}} }
const out = (k,v)=>console.log(`${k}:`,v);

async function retryDownload(url, token, attempts=8, delayMs=2000){
  for(let i=1;i<=attempts;i++){
    const r = await fetch(url,{headers:{authorization:`Bearer ${token}`}});
    const ct = r.headers.get("content-type") || "";
    let body = null;
    if(ct.includes("application/json")) body = await j(r); else await r.arrayBuffer();
    out(`downloadAttempt${i}`, `${url.split('/').slice(-1)[0]}:${r.status}`);
    if(r.status===200) return {ok:true,status:r.status,body};
    if(i<attempts) await new Promise(res=>setTimeout(res,delayMs));
  }
  return {ok:false};
}

try {
  const regRes = await fetch(`${API}/api/auth/register`, { method:"POST", headers:{"content-type":"application/json"}, body: JSON.stringify({email,password,companyName:"Final Co",address:"1 Mall Road",contactNumber:"03001234567",originCity:"Lahore"}) });
  out("registerStatus", regRes.status);

  const loginRes = await fetch(`${API}/api/auth/login`, { method:"POST", headers:{"content-type":"application/json"}, body: JSON.stringify({email,password}) });
  const loginBody = await j(loginRes);
  out("loginStatus", loginRes.status);
  if(!loginRes.ok) throw new Error(`Login failed: ${JSON.stringify(loginBody)}`);
  const token = String(loginBody.token || "");

  const form = new FormData();
  form.append("file", new Blob([fs.readFileSync(csvPath)]), path.basename(csvPath));
  form.append("generateMoneyOrder", "true");
  form.append("autoGenerateTracking", "false");
  form.append("trackAfterGenerate", "false");
  form.append("carrierType", "pakistan_post");
  form.append("shipmentType", "VPL");

  const uploadRes = await fetch(`${API}/api/jobs/upload`, { method:"POST", headers:{authorization:`Bearer ${token}`}, body: form });
  const uploadBody = await j(uploadRes);
  out("uploadStatus", uploadRes.status);
  if(!uploadRes.ok) throw new Error(`Upload failed: ${JSON.stringify(uploadBody)}`);
  const jobId = String(uploadBody.jobId || "");
  out("jobId", jobId);

  const states = [];
  let completed = false;
  for(let i=0;i<120;i++){
    const jr = await fetch(`${API}/api/jobs/${jobId}`, {headers:{authorization:`Bearer ${token}`}});
    const jb = await j(jr);
    const st = String(jb?.job?.status || "UNKNOWN").toUpperCase();
    if(states[states.length-1]!==st) states.push(st);
    out("jobStatus", st);
    if(st==="COMPLETED") { completed=true; break; }
    if(st==="FAILED") throw new Error(`Job failed: ${jb?.job?.error || "unknown"}`);
    await new Promise(res=>setTimeout(res,2000));
  }
  out("jobSequence", states.join("->"));
  if(!completed) throw new Error("Job did not complete");

  const labels = await retryDownload(`${API}/api/jobs/${jobId}/download/labels`, token, 6, 1500);
  out("labelsDownloadStatus", labels.ok ? 200 : 0);

  const money = await retryDownload(`${API}/api/jobs/${jobId}/download/money-orders`, token, 10, 2000);
  out("moneyOrderDownloadStatus", money.ok ? 200 : 0);

  const trackRes = await fetch(`${API}/api/tracking/track/${trackingId}`, {headers:{authorization:`Bearer ${token}`}});
  const trackBody = await j(trackRes);
  out("trackStatus", trackRes.status);
  out("trackFinalStatus", trackBody?.current_status || trackBody?.status || "");

  const preRes = await fetch(`${API}/api/tracking/complaint/prefill/${trackingId}`, {headers:{authorization:`Bearer ${token}`}});
  const preBody = await j(preRes);
  out("complaintPrefillStatus", preRes.status);

  const payload = {
    tracking_number: trackingId,
    phone: "03001234567",
    complaint_text: "Parcel pending too long. Please investigate.",
    complaint_reason: "Pending Delivery",
    recipient_city_value: String(preBody?.matched?.district || "Lahore"),
    recipient_district: String(preBody?.matched?.district || "Lahore"),
    recipient_tehsil: String(preBody?.matched?.tehsil || "Lahore City"),
    recipient_location: String(preBody?.matched?.location || "GPO Lahore")
  };

  let compStatus = 0;
  let compBody = {};
  for(let i=1;i<=3;i++){
    const cr = await fetch(`${API}/api/tracking/complaint`, {method:"POST", headers:{"content-type":"application/json", authorization:`Bearer ${token}`}, body: JSON.stringify(payload)});
    compBody = await j(cr);
    compStatus = cr.status;
    out(`complaintAttempt${i}`, `${cr.status} ${(compBody?.status || compBody?.message || "")}`);
    if(compBody?.success===true || compBody?.status==="FILED" || (compBody?.complaint_id && compBody?.due_date)) break;
    await new Promise(res=>setTimeout(res,3000));
  }

  const result = {
    login: loginRes.status,
    upload: uploadRes.status,
    jobSequence: states,
    labelsDownload: labels.ok ? 200 : 0,
    moneyOrdersDownload: money.ok ? 200 : 0,
    tracking: trackRes.status,
    complaintHttp: compStatus,
    complaintBody: compBody,
    jobId,
    trackingId
  };
  console.log("FINAL_SMOKE_JSON=" + JSON.stringify(result));
} catch (e) {
  console.error("FINAL_SMOKE_FAILED", e?.message || e);
  process.exitCode = 1;
} finally {
  try{ fs.unlinkSync(csvPath); } catch {}
}
