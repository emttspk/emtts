const API = "https://api.epost.pk";
const creds = { email: "nazimsaeed@gmail.com", password: "Lahore!23" };
const tracking = process.argv[2] || "VPL13688853";
const marker = "COMPLAINT_HISTORY_JSON:";

async function parseJsonSafe(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

async function login() {
  const response = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(creds),
  });
  const body = await parseJsonSafe(response);
  if (!body?.token) {
    throw new Error(`login failed: ${response.status}`);
  }
  return body.token;
}

function extractIdAndDue(text, fallbackId, fallbackDue) {
  const id = (String(text).match(/COMPLAINT_ID:\s*([^\n|]+)/i) || [])[1]?.trim() || String(fallbackId || "");
  const due = (String(text).match(/DUE_DATE:\s*([^\n|]+)/i) || [])[1]?.trim() || String(fallbackDue || "");
  return { id, due };
}

async function findShipment(authHeaders) {
  for (let page = 1; page <= 10; page += 1) {
    const response = await fetch(`${API}/api/shipments?page=${page}&limit=200`, { headers: authHeaders });
    const body = await parseJsonSafe(response);
    const hit = (body.shipments || []).find((item) => String(item.trackingNumber || "") === tracking);
    if (hit) return hit;
  }
  return null;
}

async function main() {
  const token = await login();
  const authHeaders = { authorization: `Bearer ${token}` };

  const before = await findShipment(authHeaders);
  if (!before) {
    throw new Error(`tracking not found: ${tracking}`);
  }
  const beforeText = String(before.complaintText || "");
  const beforeMeta = extractIdAndDue(beforeText, before.complaintId, before.dueDate);

  const prefillResponse = await fetch(`${API}/api/tracking/complaint/prefill/${encodeURIComponent(tracking)}`, {
    headers: authHeaders,
  });
  const prefillBody = await parseJsonSafe(prefillResponse);

  const payload = {
    tracking_number: tracking,
    phone: "03001234567",
    complaint_text: `FINAL_VERIFICATION_REOPEN ${new Date().toISOString()}`,
    sender_name: prefillBody.addresseeName || "Sender",
    sender_address: prefillBody.addresseeAddress || "Address",
    sender_city_value: prefillBody.deliveryOffice || "57",
    receiver_name: prefillBody.addresseeName || "Receiver",
    receiver_address: prefillBody.deliveryOffice || "Address",
    receiver_city_value: prefillBody.deliveryOffice || "1",
    booking_office: prefillBody.deliveryOffice || "Office",
    complaint_reason: "Pending Delivery",
    prefer_reply_mode: "POST",
    service_type: "VPL",
    recipient_district: prefillBody?.matched?.district || "",
    recipient_tehsil: prefillBody?.matched?.tehsil || "",
    recipient_location: prefillBody?.matched?.location || "",
  };

  const submitResponse = await fetch(`${API}/api/tracking/complaint`, {
    method: "POST",
    headers: { ...authHeaders, "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const submitBody = await parseJsonSafe(submitResponse);

  let after = null;
  for (let index = 0; index < 45; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const candidate = await findShipment(authHeaders);
    if (!candidate) continue;

    const candidateText = String(candidate.complaintText || "");
    const candidateMeta = extractIdAndDue(candidateText, candidate.complaintId, candidate.dueDate);

    if (candidateMeta.id && candidateMeta.id !== beforeMeta.id) {
      after = candidate;
      break;
    }
    if (candidateText.includes("Previous Complaint IDs:") || candidateText.includes(marker)) {
      after = candidate;
    }
  }

  if (!after) {
    after = await findShipment(authHeaders);
  }

  const afterText = String(after?.complaintText || "");
  const afterMeta = extractIdAndDue(afterText, after?.complaintId, after?.dueDate);

  const hasPrevIds = afterText.includes("Previous Complaint IDs:");
  const hasPrevDue = afterText.includes("Previous Due Dates:");
  const hasPrevRemarks = afterText.includes("Previous Remarks:");
  const hasWarning =
    afterText.includes("This complaint remains unresolved despite previous closure.") &&
    afterText.includes(
      "Closing unresolved complaint without written lawful response may result in escalation before Consumer Court, PMG office, or Federal Ombudsman.",
    );

  let historyCount = 0;
  let lastEntry = null;
  const markerIndex = afterText.lastIndexOf(marker);
  if (markerIndex >= 0) {
    try {
      const parsed = JSON.parse(afterText.slice(markerIndex + marker.length).trim());
      const entries = Array.isArray(parsed?.entries) ? parsed.entries : [];
      historyCount = entries.length;
      lastEntry = entries[entries.length - 1] || null;
    } catch {
      // ignore malformed history blocks
    }
  }

  console.log(
    JSON.stringify(
      {
        tracking,
        submitStatus: submitResponse.status,
        submitBody,
        before: {
          complaintId: beforeMeta.id,
          dueDate: beforeMeta.due,
          state: before.complaintStatus,
        },
        after: {
          complaintId: afterMeta.id,
          dueDate: afterMeta.due,
          state: after?.complaintStatus || "",
        },
        checks: {
          newComplaintId: Boolean(afterMeta.id && afterMeta.id !== beforeMeta.id),
          newDueDate: Boolean(afterMeta.due && afterMeta.due !== beforeMeta.due),
          hasPrevIds,
          hasPrevDue,
          hasPrevRemarks,
          hasWarning,
          historyCount,
          lastEntry,
        },
        remarksExcerpt: afterText.slice(0, 2600),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error("LIVE_REOPEN_PROOF_FAILED", error?.message || error);
  process.exit(1);
});