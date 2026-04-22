import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const API = 'https://api-production-28491.up.railway.app';
const email = 'nazimsaeed@gmail.com';
const password = 'Lahore!23q';
const trackingId = `VPL26${String(Math.floor(Math.random()*900000)+100000)}`;
const csvPath = path.join(os.tmpdir(), `railway-admin-loop-${Date.now()}.csv`);
const csv = [
  'shipperName,shipperPhone,shipperAddress,shipperEmail,senderCity,consigneeName,consigneeEmail,consigneePhone,consigneeAddress,ConsigneeCity,CollectAmount,orderid,ProductDescription,Weight,shipment_type,numberOfPieces,TrackingID',
  `Acme Store,03001234567,1 Mall Road,ops@acme.example,Lahore,Ali Raza,ali@example.com,03111222333,House 10 Street 5,Lahore,20000,ADMIN-${Date.now()},Books,1.0,VPL,1,${trackingId}`
].join('\n');
fs.writeFileSync(csvPath, csv, 'utf8');

const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));
async function asJson(r){const t=await r.text(); try{return JSON.parse(t);}catch{return {raw:t};}}

async function main(){
  const loginRes = await fetch(`${API}/api/auth/login`, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ email, password })});
  const loginBody = await asJson(loginRes);
  if(!loginRes.ok) throw new Error(`LOGIN_FAIL ${loginRes.status} ${JSON.stringify(loginBody)}`);
  const token = String(loginBody.token || '');

  const meBeforeRes = await fetch(`${API}/api/me`, { headers:{ authorization:`Bearer ${token}` }});
  const meBefore = await asJson(meBeforeRes);

  const form = new FormData();
  form.append('file', new Blob([fs.readFileSync(csvPath)]), path.basename(csvPath));
  form.append('generateMoneyOrder', 'true');
  form.append('autoGenerateTracking', 'false');
  form.append('trackAfterGenerate', 'true');
  form.append('carrierType', 'pakistan_post');
  form.append('shipmentType', 'VPL');

  const uploadRes = await fetch(`${API}/api/jobs/upload`, { method:'POST', headers:{ authorization:`Bearer ${token}` }, body: form });
  const uploadBody = await asJson(uploadRes);
  if(!uploadRes.ok) throw new Error(`UPLOAD_FAIL ${uploadRes.status} ${JSON.stringify(uploadBody)}`);
  const jobId = String(uploadBody.jobId || '');

  let status = 'UNKNOWN';
  for (let i=0; i<120; i++) {
    const jr = await fetch(`${API}/api/jobs/${jobId}`, { headers:{ authorization:`Bearer ${token}` }});
    const jb = await asJson(jr);
    status = String(jb?.job?.status || 'UNKNOWN').toUpperCase();
    if (status === 'COMPLETED') break;
    if (status === 'FAILED') throw new Error(`JOB_FAILED ${jb?.job?.error || 'unknown'}`);
    await sleep(2000);
  }
  if (status !== 'COMPLETED') throw new Error('JOB_TIMEOUT');

  const labelsRes = await fetch(`${API}/api/jobs/${jobId}/download/labels`, { headers:{ authorization:`Bearer ${token}` }});
  const moneyRes = await fetch(`${API}/api/jobs/${jobId}/download/money-orders`, { headers:{ authorization:`Bearer ${token}` }});

  const trackRes = await fetch(`${API}/api/tracking/track/${trackingId}`, { headers:{ authorization:`Bearer ${token}` }});
  const trackBody = await asJson(trackRes);

  const prefillRes = await fetch(`${API}/api/tracking/complaint/prefill/${trackingId}`, { headers:{ authorization:`Bearer ${token}` }});
  const prefillBody = await asJson(prefillRes);

  const payload = {
    tracking_number: trackingId,
    phone: '03001234567',
    complaint_text: 'Parcel pending too long. Please investigate.',
    complaint_reason: 'Pending Delivery',
    recipient_city_value: String(prefillBody?.matched?.district || 'Lahore'),
    recipient_district: String(prefillBody?.matched?.district || 'Lahore'),
    recipient_tehsil: String(prefillBody?.matched?.tehsil || 'Lahore City'),
    recipient_location: String(prefillBody?.matched?.location || 'GPO Lahore')
  };

  const compRes = await fetch(`${API}/api/tracking/complaint`, { method:'POST', headers:{ 'content-type':'application/json', authorization:`Bearer ${token}` }, body: JSON.stringify(payload)});
  const compBody = await asJson(compRes);

  const meAfterRes = await fetch(`${API}/api/me`, { headers:{ authorization:`Bearer ${token}` }});
  const meAfter = await asJson(meAfterRes);

  const result = {
    loginStatus: loginRes.status,
    meBeforeUnits: meBefore?.usage?.remainingUnits ?? meBefore?.usage?.unitsRemaining ?? meBefore?.unitsRemaining ?? null,
    uploadStatus: uploadRes.status,
    jobId,
    jobStatus: status,
    labelsDownloadStatus: labelsRes.status,
    moneyOrderDownloadStatus: moneyRes.status,
    trackingStatus: trackRes.status,
    trackingFinalStatus: trackBody?.current_status || trackBody?.status || '',
    complaintStatus: compRes.status,
    complaintSuccess: Boolean(compBody?.success || compBody?.status === 'FILED' || compBody?.complaint_id),
    complaintBody: compBody,
    meAfterUnits: meAfter?.usage?.remainingUnits ?? meAfter?.usage?.unitsRemaining ?? meAfter?.unitsRemaining ?? null,
  };

  console.log('SYSTEM_LOOP_JSON=' + JSON.stringify(result));
}

main().catch((e)=>{ console.error('SYSTEM_LOOP_FAILED', e?.message || e); process.exitCode = 1; }).finally(()=>{ try{fs.unlinkSync(csvPath);}catch{} });
