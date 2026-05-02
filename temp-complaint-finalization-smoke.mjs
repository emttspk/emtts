const API = 'https://api-production-28491.up.railway.app';
const creds = { email: 'nazimsaeed@gmail.com', password: 'Lahore!23' };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function readJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function summarizeUsage(me) {
  const subscription = me?.subscription ?? {};
  const usage = subscription?.usage ?? {};
  return {
    remainingUnits: usage.remainingUnits ?? null,
    labelsGenerated: usage.labelsGenerated ?? null,
    labelsQueued: usage.labelsQueued ?? null,
    trackingGenerated: usage.trackingGenerated ?? null,
    trackingQueued: usage.trackingQueued ?? null,
  };
}

function parseComplaintState(shipment) {
  const text = String(shipment?.complaintText ?? '').trim();
  const complaintId = text.match(/COMPLAINT_ID\s*:\s*([A-Z0-9\-]+)/i)?.[1] ?? '';
  const dueDate = text.match(/DUE_DATE\s*:\s*([^\n|]+)/i)?.[1]?.trim() ?? '';
  const state = text.match(/COMPLAINT_STATE\s*:\s*([^\n|]+)/i)?.[1]?.trim() ?? '';
  return {
    complaintId,
    dueDate,
    state,
    complaintStatus: String(shipment?.complaintStatus ?? '').trim(),
  };
}

async function main() {
  const loginRes = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(creds),
  });
  const loginBody = await readJson(loginRes);
  if (!loginRes.ok || !loginBody.token) {
    throw new Error(`login failed ${JSON.stringify(loginBody)}`);
  }

  const token = loginBody.token;
  const headers = { authorization: `Bearer ${token}` };
  const jsonHeaders = { ...headers, 'content-type': 'application/json' };

  const meBeforeRes = await fetch(`${API}/api/me`, { headers });
  const meBefore = await readJson(meBeforeRes);
  const unitsBefore = summarizeUsage(meBefore);

  let chosen = null;
  for (let page = 1; page <= 10 && !chosen; page += 1) {
    const shipmentsRes = await fetch(`${API}/api/shipments?page=${page}&limit=100`, { headers });
    const shipmentsBody = await readJson(shipmentsRes);
    for (const shipment of shipmentsBody.shipments ?? []) {
      const status = String(shipment?.status ?? '').trim().toUpperCase();
      const complaintStatus = String(shipment?.complaintStatus ?? '').trim().toUpperCase();
      const complaintText = String(shipment?.complaintText ?? '').trim();
      if (
        status === 'PENDING' &&
        complaintStatus !== 'FILED' &&
        complaintStatus !== 'DUPLICATE' &&
        !/COMPLAINT_ID/i.test(complaintText)
      ) {
        chosen = shipment;
        break;
      }
    }
  }

  if (!chosen) {
    throw new Error('no fresh pending shipment found');
  }

  const trackingNumber = String(chosen.trackingNumber).trim();
  const prefillRes = await fetch(`${API}/api/tracking/complaint/prefill/${encodeURIComponent(trackingNumber)}`, { headers });
  const prefillBody = await readJson(prefillRes);
  if (!prefillRes.ok) {
    throw new Error(`prefill failed ${JSON.stringify(prefillBody)}`);
  }

  const matched = prefillBody.matched ?? null;
  if (!matched?.district || !matched?.tehsil || !matched?.location) {
    throw new Error(`prefill missing hierarchy for ${trackingNumber}: ${JSON.stringify(prefillBody)}`);
  }

  const complaintPayload = {
    tracking_number: trackingNumber,
    phone: '03354299783',
    complaint_text: `Live complaint finalization smoke for ${trackingNumber} at ${new Date().toISOString()}`,
    sender_name: prefillBody.addresseeName || 'Unknown Sender',
    sender_address: prefillBody.addresseeAddress || 'Pakistan',
    sender_city_value: prefillBody.deliveryOffice || 'Pakistan Post',
    receiver_name: prefillBody.addresseeName || 'Addressee',
    receiver_address: prefillBody.addresseeAddress || prefillBody.deliveryOffice || 'Pakistan',
    receiver_city_value: prefillBody.addresseeCity || prefillBody.deliveryOffice || 'Pakistan',
    booking_office: prefillBody.deliveryOffice || 'Pakistan Post',
    complaint_reason: 'Pending Delivery',
    prefer_reply_mode: 'POST',
    service_type: 'VPL',
    recipient_city_value: prefillBody.addresseeCity || prefillBody.deliveryOffice || 'Pakistan',
    recipient_district: matched.district,
    recipient_tehsil: matched.tehsil,
    recipient_location: matched.location,
  };

  const submitRes = await fetch(`${API}/api/tracking/complaint`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify(complaintPayload),
  });
  const submitBody = await readJson(submitRes);
  if (!submitRes.ok && submitRes.status !== 409) {
    throw new Error(`complaint submit failed ${submitRes.status} ${JSON.stringify(submitBody)}`);
  }

  const queueStates = [];
  let lastQueueState = null;
  let finalizedShipment = null;
  let finalJob = null;
  const jobId = String(submitBody.jobId ?? '');

  for (let attempt = 0; attempt < 45; attempt += 1) {
    const monitorRes = await fetch(`${API}/api/admin/complaints/monitor`, { headers });
    const monitorBody = await readJson(monitorRes);
    const queueRow = Array.isArray(monitorBody.queue)
      ? monitorBody.queue.find((row) => String(row.trackingId ?? '').trim() === trackingNumber)
      : null;
    const queueState = String(queueRow?.complaintStatus ?? '').trim().toUpperCase();
    if (queueState && queueState !== lastQueueState) {
      queueStates.push(queueState);
      lastQueueState = queueState;
    }

    if (jobId) {
      const jobRes = await fetch(`${API}/api/tracking/${jobId}`, { headers });
      const jobBody = await readJson(jobRes);
      finalJob = jobBody.job ?? finalJob;
    }

    const shipmentsRes = await fetch(`${API}/api/shipments?page=1&limit=200`, { headers });
    const shipmentsBody = await readJson(shipmentsRes);
    finalizedShipment = (shipmentsBody.shipments ?? []).find((row) => String(row.trackingNumber ?? '').trim() === trackingNumber) ?? finalizedShipment;
    const parsed = finalizedShipment ? parseComplaintState(finalizedShipment) : null;
    const active = parsed && parsed.complaintId && parsed.dueDate && String(parsed.complaintStatus).toUpperCase() === 'FILED';
    if (active) {
      break;
    }
    await sleep(3000);
  }

  if (!finalizedShipment) {
    throw new Error(`shipment not found after submit for ${trackingNumber}`);
  }

  const parsedFinal = parseComplaintState(finalizedShipment);
  const meAfterSubmitRes = await fetch(`${API}/api/me`, { headers });
  const meAfterSubmit = await readJson(meAfterSubmitRes);
  const unitsAfterSubmit = summarizeUsage(meAfterSubmit);

  const refreshShipmentsRes = await fetch(`${API}/api/shipments?page=1&limit=200`, { headers });
  await readJson(refreshShipmentsRes);
  const meAfterRefreshRes = await fetch(`${API}/api/me`, { headers });
  const meAfterRefresh = await readJson(meAfterRefreshRes);
  const unitsAfterRefresh = summarizeUsage(meAfterRefresh);

  const summary = {
    trackingNumber,
    submitHttp: submitRes.status,
    submitBody,
    jobId,
    queueStates,
    finalJobStatus: finalJob?.status ?? null,
    finalShipment: {
      complaintStatus: finalizedShipment.complaintStatus ?? null,
      complaintId: parsedFinal.complaintId,
      dueDate: parsedFinal.dueDate,
      state: parsedFinal.state,
    },
    unitsBefore,
    unitsAfterSubmit,
    unitsAfterRefresh,
    checks: {
      queuedSeen: queueStates.includes('QUEUED'),
      processingSeen: queueStates.includes('PROCESSING'),
      activeFinalized: String(finalizedShipment.complaintStatus ?? '').toUpperCase() === 'FILED' && Boolean(parsedFinal.complaintId) && Boolean(parsedFinal.dueDate),
      complaintIdSaved: Boolean(parsedFinal.complaintId),
      dueDateSaved: Boolean(parsedFinal.dueDate),
      noExtraRefreshDeduction: JSON.stringify(unitsAfterSubmit) === JSON.stringify(unitsAfterRefresh),
    },
  };

  console.log(`SMOKE_SUMMARY=${JSON.stringify(summary)}`);
}

main().catch((error) => {
  console.error(`SMOKE_FAILED=${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exit(1);
});
