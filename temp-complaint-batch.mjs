const API = 'https://api-production-28491.up.railway.app';
const email = 'railway.quick.1776853708912@example.com';
const password = 'SmokePass123!';
const ids = ['VPL26030726', 'VPL26030761', 'VPL26030763', 'VPL26030759', 'VPL26030723', 'VPL26030730'];

async function asJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function main() {
  const login = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const loginBody = await asJson(login);
  if (!login.ok) {
    throw new Error(`login fail ${login.status} ${JSON.stringify(loginBody)}`);
  }

  const token = String(loginBody.token || '');

  for (const tracking of ids) {
    const prefillRes = await fetch(`${API}/api/tracking/complaint/prefill/${encodeURIComponent(tracking)}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const prefill = await asJson(prefillRes);

    const payload = {
      tracking_number: tracking,
      phone: '03354299783',
      complaint_text: `Complaint for ${tracking} pending delivery.`,
      complaint_reason: 'Pending Delivery',
      recipient_city_value: String(prefill?.matched?.district || 'Lahore'),
      recipient_district: String(prefill?.matched?.district || 'Lahore'),
      recipient_tehsil: String(prefill?.matched?.tehsil || 'Lahore City'),
      recipient_location: String(prefill?.matched?.location || 'GPO Lahore'),
    };

    const complaintRes = await fetch(`${API}/api/tracking/complaint`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const complaint = await asJson(complaintRes);
    console.log('COMPLAINT_TRY=' + JSON.stringify({
      tracking,
      http: complaintRes.status,
      status: complaint?.status,
      success: complaint?.success,
      complaint_id: complaint?.complaint_id,
      message: complaint?.message || complaint?.error || '',
    }));
  }
}

main().catch((e) => {
  console.error('COMPLAINT_BATCH_FAILED', e?.message || e);
  process.exitCode = 1;
});
