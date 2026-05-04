import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const API='https://api.epost.pk';
const email=`railway.quick.${Date.now()}@example.com`;
const password='SmokePass123!';
const trackingId=`VPL26${String(Math.floor(Math.random()*900000)+100000)}`;
const csvPath=path.join(os.tmpdir(),`railway-quick-${Date.now()}.csv`);
fs.writeFileSync(csvPath,[
'shipperName,shipperPhone,shipperAddress,shipperEmail,senderCity,consigneeName,consigneeEmail,consigneePhone,consigneeAddress,ConsigneeCity,CollectAmount,orderid,ProductDescription,Weight,shipment_type,numberOfPieces,TrackingID',
`Acme Store,03001234567,1 Mall Road,ops@acme.example,Lahore,Ali Raza,ali@example.com,03111222333,House 10 Street 5,Lahore,20000,Q-${Date.now()},Books,1.0,VPL,1,${trackingId}`
].join('\n'),'utf8');
async function j(r){const t=await r.text(); try{return JSON.parse(t)}catch{return {raw:t}}}
await fetch(`${API}/api/auth/register`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password,companyName:'Quick Co',address:'1 Mall Road',contactNumber:'03001234567',originCity:'Lahore'})});
const login=await fetch(`${API}/api/auth/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password})});
const lb=await j(login); if(!login.ok){throw new Error(`login ${login.status}`)}
const token=String(lb.token||'');
const me=await fetch(`${API}/api/me`,{headers:{authorization:`Bearer ${token}`}}); const meb=await j(me);
console.log('ME_SHAPE=' + JSON.stringify(meb));
const f=new FormData(); f.append('file',new Blob([fs.readFileSync(csvPath)]),path.basename(csvPath)); f.append('generateMoneyOrder','true'); f.append('autoGenerateTracking','false'); f.append('trackAfterGenerate','false'); f.append('carrierType','pakistan_post'); f.append('shipmentType','VPL');
const up=await fetch(`${API}/api/jobs/upload`,{method:'POST',headers:{authorization:`Bearer ${token}`},body:f});
const ub=await j(up);
console.log('QUICK_UPLOAD=' + JSON.stringify({status:up.status, jobId:ub.jobId, email}));
try{fs.unlinkSync(csvPath);}catch{}
