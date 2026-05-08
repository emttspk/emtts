const API='https://api.epost.pk';
const creds={email:'nazimsaeed@gmail.com',password:'Lahore!23'};
const marker='COMPLAINT_HISTORY_JSON:';
const idRx=/COMPLAINT_ID\s*:\s*([A-Z0-9\-]+)/i;
const dueRx=/DUE_DATE\s*:\s*([^\n|]+)/i;
(async()=>{
 const login=await fetch(`${API}/api/auth/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(creds)});
 const lb=await login.json();
 if(!login.ok||!lb.token) throw new Error('login failed');
 const headers={authorization:`Bearer ${lb.token}`};
 let foundMulti=null;
 let foundReopen=null;
 for(let page=1; page<=15 && (!foundMulti || !foundReopen); page++){
  const r=await fetch(`${API}/api/shipments?page=${page}&limit=200`,{headers});
  const b=await r.json();
  for(const s of (b.shipments||[])){
   const text=String(s.complaintText||'');
   const idx=text.lastIndexOf(marker);
   if(idx>=0){
    let entries=[];
    try{ const raw=text.slice(idx+marker.length).trim(); entries=JSON.parse(raw)?.entries||[];}catch{}
    if(entries.length>=2 && !foundMulti){
      foundMulti={trackingNumber:s.trackingNumber,entries:entries.slice(-3),complaintStatus:s.complaintStatus};
    }
   }
   const due=(text.match(dueRx)||[])[1]?.trim();
   const cid=(text.match(idRx)||[])[1]||'';
   if(due && cid && String(s.complaintStatus||'').toUpperCase()==='FILED'){
      const [dd,mm,yy]=due.split('-').map(v=>parseInt(v,10));
      const yyyy=yy<100?2000+yy:yy;
      const ts=new Date(yyyy,(mm||1)-1,dd||1,23,59,59).getTime();
      if(Number.isFinite(ts) && ts < Date.now() && !foundReopen){
        foundReopen={trackingNumber:s.trackingNumber,complaintId:cid,dueDate:due,complaintStatus:s.complaintStatus};
      }
   }
  }
 }
 console.log('COMPLAINT_CHAIN_SCAN='+JSON.stringify({foundMulti,foundReopen}));
})().catch(e=>{console.error('COMPLAINT_CHAIN_SCAN_FAILED',e.message);process.exit(1);});
