const API = "https://api.epost.pk";
const EMAIL = "nazimsaeed@gmail.com";
const PASSWORD = "Lahore!23";

function parseComplaintMeta(textBlob) {
  const text = String(textBlob || "");
  const state = (text.match(/COMPLAINT_STATE\s*:\s*([^\n|]+)/i) || [])[1]?.trim().toUpperCase() || "";
  const dueDate = (text.match(/DUE_DATE\s*:\s*([^\n|]+)/i) || [])[1]?.trim() || "";
  return { state, dueDate };
}

function parseDueDateTs(dueDate) {
  const m = String(dueDate || "").match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (!m) return null;
  const ts = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 0, 0, 0, 0).getTime();
  return Number.isFinite(ts) ? ts : null;
}

async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    ...options,
  });
  let body = {};
  try {
    body = await response.json();
  } catch {
    body = {};
  }
  return { status: response.status, body };
}

async function main() {
  const login = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ identifier: EMAIL, password: PASSWORD }),
  });
  const token = login.body?.token || login.body?.accessToken || login.body?.data?.token;
  if (!token) {
    console.error("LOGIN_FAILED", login.status, login.body);
    process.exit(1);
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const rows = [];
  for (let page = 1; page <= 10; page += 1) {
    const res = await request(`/api/shipments?page=${page}&limit=200`, { token });
    const shipments = Array.isArray(res.body?.shipments) ? res.body.shipments : [];
    for (const shipment of shipments) {
      const meta = parseComplaintMeta(shipment.complaintText);
      const normalizedState = (meta.state || String(shipment.complaintStatus || "").toUpperCase()).replace(/[\-_]+/g, " ").trim();
      if (!normalizedState && !meta.dueDate) continue;
      const dueTs = parseDueDateTs(meta.dueDate);
      const expired = dueTs != null && dueTs < todayStart.getTime();
      const terminal = ["RESOLVED", "CLOSED", "REJECTED"].includes(normalizedState);
      if (terminal || expired) {
        rows.push({
          trackingNumber: shipment.trackingNumber,
          state: normalizedState || "-",
          dueDate: meta.dueDate || "-",
          expired,
          complaintStatus: shipment.complaintStatus || "-",
        });
      }
    }
  }

  console.log(JSON.stringify({ count: rows.length, candidates: rows.slice(0, 30) }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
