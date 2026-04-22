import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const API = 'https://api-production-28491.up.railway.app';
const email = `railway.complaint.${Date.now()}@example.com`;
const password = 'SmokePass123!';
const trackingId = `VPL26${String(Math.floor(Math.random()*900000)+100000)}`;
const csvPath = path.join(os.tmpdir(), `railway-complaint-${Date.now()}.csv`);
const csv = [
  'shipperName,shipperPhone,shipperAddress,shipperEmail,senderCity,consigneeName,consigneeEmail,consigneePhone,consigneeAddress,ConsigneeCity,CollectAmount,orderid,ProductDescription,Weight,shipment_type,numberOfPieces,TrackingID',
  `Acme Store,03001234567,1 Mall Road,ops@acme.example,Lahore,Ali Raza,ali@example.com,03111222333,House 10 Street 5,Lahore,20000,COMP-${Date.now()},Books,1.0,VPL,1,${trackingId}`
].join('\n');
fs.writeFileSync(csvPath, csv, 'utf8');

const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
async function j(r){const t=await r.text(); try{return JSON.parse(t)}catch{return {raw:t}}}

try{
  await fetch(`${API}/api/auth/register`, {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({email,password,companyName:'Complaint Co',address:'1 Mall Road',contactNumber:'03001234567',originCity:'Lahore'})});
  const login = await fetch(`${API}/api/auth/login`, {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({email,password})});
  const lb = await j(login);
  if(!login.ok) throw new Error(`LOGIN ${login.status}`);
  const token = String(lb.token||'');

  const form = new FormData();
  form.append('file', new Blob([fs.readFileSync(csvPath)]), path.basename(csvPath));
  form.append('generateMoneyOrder', 'true');
  form.append('autoGenerateTracking', 'false');
  form.append('trackAfterGenerate', 'true');
  form.append('carrierType', 'pakistan_post');
  form.append('shipmentType', 'VPL');

  const up = await fetch(`${API}/api/jobs/upload`, {method:'POST', headers:{authorization:`Bearer ${token}`}, body:form});
  const ub = await j(up);
  if(!up.ok) throw new Error(`UPLOAD ${up.status} ${JSON.stringify(ub)}`);
  const jobId = String(ub.jobId || '');

  for(let i=0;i<120;i++){
    const jr = await fetch(`${API}/api/jobs/${jobId}`, {headers:{authorization:`Bearer ${token}`}});
    const jb = await j(jr);
    const st = String(jb?.job?.status || '').toUpperCase();
    if(st==='COMPLETED') break;
    if(st==='FAILED') throw new Error(`JOB FAILED ${jb?.job?.error||''}`);
    await sleep(2000);
  }

  const tr = await fetch(`${API}/api/tracking/track/${trackingId}`, {headers:{authorization:`Bearer ${token}`}});
  const tb = await j(tr);

  const pre = await fetch(`${API}/api/tracking/complaint/prefill/${trackingId}`, {headers:{authorization:`Bearer ${token}`}});
  const pb = await j(pre);

  const payload = {
    tracking_number: trackingId,
    phone: '03001234567',
    complaint_text: 'Parcel pending too long. Please investigate.',
    complaint_reason: 'Pending Delivery',
    recipient_city_value: String(pb?.matched?.district || 'Lahore'),
    recipient_district: String(pb?.matched?.district || 'Lahore'),
    recipient_tehsil: String(pb?.matched?.tehsil || 'Lahore City'),
    recipient_location: String(pb?.matched?.location || 'GPO Lahore')
  };

  const cr = await fetch(`${API}/api/tracking/complaint`, {method:'POST', headers:{'content-type':'application/json', authorization:`Bearer ${token}`}, body: JSON.stringify(payload)});
  const cb = await j(cr);

  console.log('COMPLAINT_LOOP_JSON=' + JSON.stringify({
    email,
    jobId,
    trackingId,
    trackingStatus: tr.status,
    trackingFinal: tb?.current_status || tb?.status || '',
    complaintStatus: cr.status,
    complaintBody: cb
  }));
}catch(e){
  console.error('COMPLAINT_LOOP_FAILED', e?.message || e);
  process.exitCode=1;
}finally{
  try{fs.unlinkSync(csvPath);}catch{}
}
