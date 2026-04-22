import fs from 'node:fs';

async function main() {
  // Login
  const loginResp = await fetch('https://api-production-28491.up.railway.app/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'nazimsaeed@gmail.com', password: 'Lahore!23' })
  });
  const { token } = await loginResp.json();
  console.log('Login OK, token length:', token.length);

  // Upload CSV using FormData
  const csvContent = fs.readFileSync('test-live-vpl875.csv', 'utf8');
  const { Blob } = globalThis;
  const form = new globalThis.FormData();
  form.set('file', new Blob([csvContent], { type: 'text/csv' }), 'test-live-vpl875.csv');
  form.set('generateMoneyOrder', 'true');
  form.set('shipmentType', 'VPL');
  form.set('carrierType', 'pakistan_post');
  form.set('barcodeMode', 'auto');
  form.set('outputMode', 'a4');

  const uploadResp = await fetch('https://api-production-28491.up.railway.app/api/upload', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token },
    body: form
  });
  const uploadResult = await uploadResp.json();
  console.log('Upload result:', JSON.stringify(uploadResult, null, 2));

  const jobId = uploadResult.jobId;
  const API = 'https://api-production-28491.up.railway.app';
  const headers = { Authorization: 'Bearer ' + token };

  // Poll job status until COMPLETED or FAILED
  console.log('Polling job status...');
  let status = 'QUEUED';
  let attempts = 0;
  while (status !== 'COMPLETED' && status !== 'FAILED' && attempts < 30) {
    await new Promise(r => setTimeout(r, 5000));
    const jobResp = await fetch(`${API}/api/jobs/${jobId}`, { headers });
    const jobData = await jobResp.json();
    status = jobData.job?.status || jobData.status;
    console.log(`  [${++attempts}] status=${status}`);
  }

  if (status !== 'COMPLETED') {
    console.error('Job did not complete! status=' + status);
    process.exit(1);
  }

  const jobResp = await fetch(`${API}/api/jobs/${jobId}`, { headers });
  const jobPayload = await jobResp.json();
  console.log('Job details:', JSON.stringify({
    status: jobPayload.job?.status,
    includeMoneyOrders: jobPayload.job?.includeMoneyOrders,
    labelsPdfPath: jobPayload.job?.labelsPdfPath,
    moneyOrderPdfPath: jobPayload.job?.moneyOrderPdfPath,
  }, null, 2));

  // Download money order PDF
  console.log('Downloading money order PDF...');
  const moDownResp = await fetch(`${API}/api/jobs/${jobId}/download/money-orders?token=${token}`, {});
  console.log('MO download status:', moDownResp.status);
  console.log('MO download Content-Disposition:', moDownResp.headers.get('content-disposition'));
  console.log('MO download Content-Type:', moDownResp.headers.get('content-type'));

  if (moDownResp.ok) {
    const buf = Buffer.from(await moDownResp.arrayBuffer());
    fs.writeFileSync('temp-live-mo-test.pdf', buf);
    console.log(`MO PDF saved: ${buf.length} bytes`);
    const sizeKB = (buf.length / 1024).toFixed(1);
    console.log(`MO PDF size: ${sizeKB} KB`);
    const under1MB = buf.length < 1_000_000;
    console.log(`Under 1MB: ${under1MB ? 'YES ✔' : 'NO ✗'}`);
  } else {
    const errText = await moDownResp.text();
    console.error('MO download failed:', errText);
  }

  // Download label PDF
  console.log('Downloading labels PDF...');
  const labelDownResp = await fetch(`${API}/api/jobs/${jobId}/download/labels?token=${token}`, {});
  console.log('Labels download status:', labelDownResp.status);
  console.log('Labels Content-Disposition:', labelDownResp.headers.get('content-disposition'));
  if (labelDownResp.ok) {
    const buf = Buffer.from(await labelDownResp.arrayBuffer());
    fs.writeFileSync('temp-live-labels-test.pdf', buf);
    console.log(`Labels PDF saved: ${buf.length} bytes`);
  }
}
main().catch(console.error);
