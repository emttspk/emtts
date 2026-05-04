async function main() {
  const API = 'https://api.epost.pk';
  const trackingId = 'VPL26030761';

  const loginResp = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'nazimsaeed@gmail.com', password: 'Lahore!23' }),
  });
  const loginData = await loginResp.json();
  const token = loginData.token;
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  const trackingResp = await fetch(`${API}/api/tracking/bulk`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ tracking_numbers: [trackingId] }),
  });
  const trackingData = await trackingResp.json();
  const record = trackingData.records?.[0];
  console.log('tracking_found=', Boolean(record));
  console.log('tracking_status=', record?.final_status ?? 'NOT_FOUND');

  const prefillResp = await fetch(`${API}/api/tracking/complaint/prefill/${encodeURIComponent(trackingId)}`, { headers });
  const prefill = await prefillResp.json();
  console.log('prefill_status=', prefillResp.status);
  console.log('prefill_deliveryOffice=', prefill.deliveryOffice ?? null);
  console.log('prefill_matched=', Boolean(prefill.matched));

  const shipment = record?.shipment ?? {};
  const payload = {
    tracking_number: trackingId,
    phone: '03354299783',
    complaint_text: `Production live validation complaint for ${trackingId}. Please confirm complaint registration and response metadata.`,
    sender_name: shipment.sender_name || 'Unknown',
    sender_address: shipment.sender_address || 'Unknown',
    sender_city_value: shipment.booking_city || '57',
    receiver_name: 'Addressee',
    receiver_address: prefill?.deliveryOffice || 'Pakistan',
    receiver_city_value: prefill?.deliveryOffice || '1',
    booking_office: shipment.booking_city || 'Unknown',
    complaint_reason: 'Pending Delivery',
    prefer_reply_mode: 'POST',
    service_type: 'VPL',
    recipient_district: prefill?.matched?.district || '',
    recipient_tehsil: prefill?.matched?.tehsil || '',
    recipient_location: prefill?.matched?.location || '',
  };

  const complaintResp = await fetch(`${API}/api/tracking/complaint`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  const complaintData = await complaintResp.json();
  console.log('complaint_http=', complaintResp.status);
  console.log(JSON.stringify(complaintData, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
