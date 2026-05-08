const API='https://api.epost.pk';
const creds={email:'nazimsaeed@gmail.com',password:'Lahore!23'};
const trackingNumber='VPL26030723';
const marker='COMPLAINT_HISTORY_JSON:';
async function j(r){const t=await r.text(); try{return JSON.parse(t)}catch{return {raw:t}}}
(async()=>{
 const login=await fetch(`${API}/api/auth/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(creds)});
 const lb=await j(login); if(!login.ok||!lb.token) throw new Error('login failed');
 const headers={authorization:`Bearer ${lb.token}`};
 const pre=await fetch(`${API}/api/tracking/complaint/prefill/${encodeURIComponent(trackingNumber)}`,{headers});
 const pb=await j(pre);
 const payload={
   tracking_number:trackingNumber,
   phone:'03354299783',
   complaint_text:`Reopen overdue complaint test ${new Date().toISOString()}`,
   sender_name:pb.addresseeName||'Unknown',
   sender_address:pb.addresseeAddress||'Unknown',
   sender_city_value:pb.deliveryOffice||'57',
   receiver_name:pb.addresseeName||'Addressee',
   receiver_address:pb.deliveryOffice||'Pakistan',
   receiver_city_value:pb.deliveryOffice||'1',
   booking_office:pb.deliveryOffice||'Unknown',
   complaint_reason:'Pending Delivery',
   prefer_reply_mode:'POST',
   service_type:'VPL',
   recipient_district:pb?.matched?.district||'',
   recipient_tehsil:pb?.matched?.tehsil||'',
   recipient_location:pb?.matched?.location||'',
 };
 const submit=await fetch(`${API}/api/tracking/complaint`,{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify(payload)});
 const sb=await j(submit);
 let historyInfo=null;
 for(let i=0;i<20;i++){
   await new Promise(r=>setTimeout(r,2000));
   const sh=await fetch(`${API}/api/shipments?page=1&limit=200`,{headers});
   const bh=await j(sh);
   const row=(bh.shipments||[]).find(s=>String(s.trackingNumber||'')===trackingNumber);
   if(!row) continue;
   const text=String(row.complaintText||'');
   const idx=text.lastIndexOf(marker);
   if(idx>=0){
      let entries=[];
      try{entries=JSON.parse(text.slice(idx+marker.length).trim())?.entries||[]}catch{}
      historyInfo={entriesCount:entries.length,lastEntry:entries[entries.length-1]||null,complaintStatus:row.complaintStatus};
      if(entries.length>=2) break;
   }
 }
 console.log('REOPEN_TEST='+JSON.stringify({trackingNumber,submitHttp:submit.status,submitBody:sb,historyInfo}));
})().catch(e=>{console.error('REOPEN_TEST_FAILED',e.message);process.exit(1)});
