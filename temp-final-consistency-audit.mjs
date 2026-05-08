import { PrismaClient } from "@prisma/client";

const API = "https://api.epost.pk";
const ADMIN_EMAIL = "nazimsaeed@gmail.com";
const ADMIN_PASS = "Lahore!23";

function parseRaw(rawJson) {
  if (!rawJson) return {};
  try {
    const parsed = JSON.parse(rawJson);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function toAmount(rawJson) {
  if (!rawJson) return 0;
  try {
    const parsed = JSON.parse(rawJson);
    const val = parsed?.CollectAmount ?? parsed?.collect_amount ?? parsed?.collected_amount ?? parsed?.collectAmount ?? 0;
    if (typeof val === "string") {
      const match = val.match(/[\d,]+(?:\.\d+)?/);
      if (!match) return 0;
      const num = Number(match[0].replace(/,/g, ""));
      return Number.isFinite(num) ? num : 0;
    }
    const num = Number(val);
    return Number.isFinite(num) ? num : 0;
  } catch {
    return 0;
  }
}

function normalizeManualStatus(input) {
  const raw = String(input ?? "").trim().toUpperCase();
  if (!raw) return null;
  if (raw === "DELIVERED") return "DELIVERED";
  if (raw === "PENDING") return "PENDING";
  if (raw === "RETURN" || raw === "RETURNED") return "RETURN";
  return null;
}

function parseEvents(raw) {
  const tracking = raw?.tracking && typeof raw.tracking === "object" ? raw.tracking : undefined;
  const events = tracking?.events ?? raw?.events ?? [];
  if (!Array.isArray(events)) return [];
  return events
    .map((ev) => {
      const date = String(ev?.date ?? "").trim();
      const time = String(ev?.time ?? "00:00").trim() || "00:00";
      const location = String(ev?.location ?? ev?.city ?? "").trim();
      const description = String(ev?.description ?? ev?.detail ?? ev?.status ?? "").trim();
      const d = new Date(`${date} ${time}`);
      return { date, time, location, description, ts: Number.isFinite(d.getTime()) ? d.getTime() : null };
    })
    .filter((ev) => ev.date || ev.time || ev.location || ev.description)
    .sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));
}

function hasForwardReverseReturnFlow(events) {
  if (events.length === 0) return false;
  let forwardStage = 0;
  let reverseStage = 0;
  for (const ev of events) {
    const blob = `${ev.location} ${ev.description}`.toLowerCase();
    const isBooking = blob.includes("booking") || blob.includes("booked");
    const isDmo = blob.includes("dmo") || blob.includes("dispatch") || blob.includes("arrived at") || blob.includes("received at");
    const isDelivery = blob.includes("delivery") || blob.includes("out for delivery") || blob.includes("delivery office");

    if (forwardStage === 0 && isBooking) {
      forwardStage = 1;
      continue;
    }
    if (forwardStage === 1 && isDmo) {
      forwardStage = 2;
      continue;
    }
    if (forwardStage === 2 && isDelivery) {
      forwardStage = 3;
      continue;
    }

    if (forwardStage >= 3) {
      if (reverseStage === 0 && isDelivery) {
        reverseStage = 1;
        continue;
      }
      if (reverseStage === 1 && isDmo) {
        reverseStage = 2;
        continue;
      }
      if (reverseStage === 2 && isBooking) {
        reverseStage = 3;
        break;
      }
    }
  }
  return forwardStage >= 3 && reverseStage >= 3;
}

function hasReturnLatestEventRule(raw) {
  const events = parseEvents(raw);
  if (events.length === 0) return false;
  const latest = [...events].sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0))[0];
  const d = String(latest?.description ?? "").toLowerCase();
  const isLatestReturnEvent =
    d.includes("delivered to sender") ||
    d.includes("returned to booking office") ||
    d.includes("received at booking dmo after return");
  if (!isLatestReturnEvent) return false;
  return hasForwardReverseReturnFlow(events);
}

function normalizeFinalShipmentStatusForStats(input) {
  const raw = String(input ?? "").trim().toUpperCase();
  if (!raw) return "PENDING";
  if (raw === "DELIVERED WITH PAYMENT") return "DELIVERED WITH PAYMENT";
  if (raw.includes("DELIVER")) return "DELIVERED";
  if (raw.includes("RETURN") || raw.includes("RTO")) return "RETURNED";
  return "PENDING";
}

function deriveFinalShipmentStatusForStats(shipment) {
  const raw = parseRaw(shipment.rawJson);
  const manual = normalizeManualStatus(raw.manual_status);
  if (manual === "RETURN") return "RETURNED";
  if (manual === "DELIVERED") return "DELIVERED";
  if (manual === "PENDING") return "PENDING";

  const preferredStatus = String(raw.final_status ?? raw.system_status ?? raw.System_Status ?? shipment.status ?? "").trim();
  const normalized = normalizeFinalShipmentStatusForStats(preferredStatus);
  if (normalized !== "RETURNED") return normalized;
  return hasReturnLatestEventRule(raw) ? "RETURNED" : "PENDING";
}

function parseDueDateToTs(input) {
  const value = String(input ?? "").trim();
  if (!value) return null;
  const slash = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const dt = new Date(Number(slash[3]), Number(slash[2]) - 1, Number(slash[1]), 0, 0, 0, 0).getTime();
    return Number.isFinite(dt) ? dt : null;
  }
  const dash = value.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dash) {
    const dt = new Date(Number(dash[3]), Number(dash[2]) - 1, Number(dash[1]), 0, 0, 0, 0).getTime();
    return Number.isFinite(dt) ? dt : null;
  }
  const iso = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const dt = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 0, 0, 0, 0).getTime();
    return Number.isFinite(dt) ? dt : null;
  }
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function parseComplaintRecord(textBlob, complaintStatus) {
  const text = String(textBlob ?? "").trim();
  const complaintId = text.match(/COMPLAINT_ID\s*:\s*([A-Z0-9\-]+)/i)?.[1]
    ?? text.match(/Complaint\s*ID\s*([A-Z0-9\-]+)/i)?.[1]
    ?? "";
  const dueDate = text.match(/DUE_DATE\s*:\s*([^\n|]+)/i)?.[1]
    ?? text.match(/Due\s*Date\s*(?:on)?\s*([0-3]?\d\/[0-1]?\d\/\d{4}|[0-3]?\d-[0-1]?\d-\d{4}|\d{4}-\d{1,2}-\d{1,2})/i)?.[1]
    ?? "";
  const state = String(
    text.match(/COMPLAINT_STATE\s*:\s*([^\n|]+)/i)?.[1]
      ?? (String(complaintStatus ?? "").toUpperCase() === "FILED" ? "ACTIVE" : complaintStatus ?? "ACTIVE"),
  ).trim().toUpperCase() || "ACTIVE";
  const dueDateTs = parseDueDateToTs(String(dueDate).trim());
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const active = String(complaintStatus ?? "").toUpperCase() === "FILED"
    && Boolean(String(complaintId).trim())
    && dueDateTs != null
    && dueDateTs >= today.getTime()
    && !["RESOLVED", "CLOSED"].includes(state);

  return {
    complaintId: String(complaintId).trim(),
    dueDate: String(dueDate).trim(),
    dueDateTs,
    state,
    active,
  };
}

function extractComplaintHistory(textBlob, complaintStatus, trackingId) {
  const text = String(textBlob ?? "");
  const marker = "COMPLAINT_HISTORY_JSON:";
  const markerIndex = text.lastIndexOf(marker);
  if (markerIndex >= 0) {
    const rawJson = text.slice(markerIndex + marker.length).trim();
    if (rawJson) {
      try {
        const parsed = JSON.parse(rawJson);
        const entries = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.entries) ? parsed.entries : [];
        const cleaned = entries
          .map((entry) => ({
            complaintId: String(entry?.complaintId ?? "").trim(),
            trackingId: String(entry?.trackingId ?? trackingId ?? "").trim(),
            createdAt: String(entry?.createdAt ?? "").trim(),
            dueDate: String(entry?.dueDate ?? "").trim(),
            status: String(entry?.status ?? "").trim().toUpperCase() || "ACTIVE",
            attemptNumber: Math.max(1, Number(entry?.attemptNumber ?? 1) || 1),
            previousComplaintReference: String(entry?.previousComplaintReference ?? "").trim(),
          }))
          .filter((entry) => Boolean(entry.complaintId));
        if (cleaned.length > 0) return cleaned;
      } catch {
        // Ignore malformed history.
      }
    }
  }

  const fallback = parseComplaintRecord(textBlob, complaintStatus);
  if (!fallback.complaintId) return [];
  return [{
    complaintId: fallback.complaintId,
    trackingId: String(trackingId ?? "").trim(),
    createdAt: new Date().toISOString(),
    dueDate: fallback.dueDate,
    status: fallback.state,
    attemptNumber: 1,
    previousComplaintReference: "",
  }];
}

function normalizeComplaintLifecycleState(state) {
  const token = String(state ?? "").trim().toUpperCase().replace(/[\-_]+/g, " ");
  if (!token) return "ACTIVE";
  if (["RESOLVED", "RESOLVE"].includes(token)) return "RESOLVED";
  if (["CLOSED", "CLOSE", "REJECTED", "REJECT", "ERROR", "FAILED"].includes(token)) return "CLOSED";
  if (["IN PROCESS", "INPROCESS", "PROCESSING", "PENDING", "DUPLICATE", "OPEN"].includes(token)) return "IN_PROCESS";
  return "ACTIVE";
}

async function request(path, opts = {}) {
  const r = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json", ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}) },
    ...opts,
  });
  let body;
  try { body = await r.json(); } catch { body = {}; }
  return { status: r.status, body };
}

async function login(email, pass) {
  const r = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ identifier: email, password: pass }),
  });
  return r.body?.token ?? r.body?.accessToken ?? r.body?.data?.token ?? null;
}

async function main() {
  const dbUrl = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error("DATABASE_PUBLIC_URL (or DATABASE_URL) is required");
  }

  const prisma = new PrismaClient({ datasourceUrl: dbUrl });
  const token = await login(ADMIN_EMAIL, ADMIN_PASS);
  if (!token) throw new Error("Login failed for audit user");

  const meAuth = await request("/api/auth/me", { token });
  const meCore = await request("/api/me", { token });
  const decodeJwtUserId = () => {
    try {
      const payloadRaw = String(token).split(".")[1] ?? "";
      if (!payloadRaw) return null;
      const normalized = payloadRaw.replace(/-/g, "+").replace(/_/g, "/");
      const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
      const payload = JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
      return payload?.id ?? payload?.userId ?? payload?.sub ?? null;
    } catch {
      return null;
    }
  };
  const userId = meAuth.body?.id
    ?? meAuth.body?.user?.id
    ?? meAuth.body?.data?.id
    ?? meAuth.body?.data?.user?.id
    ?? meCore.body?.id
    ?? meCore.body?.user?.id
    ?? meCore.body?.data?.id
    ?? meCore.body?.data?.user?.id
    ?? decodeJwtUserId();
  if (!userId) throw new Error("Could not resolve user ID from /api/auth/me");

  const [shipments, statsResp] = await Promise.all([
    prisma.shipment.findMany({
      where: { userId: String(userId) },
      select: {
        trackingNumber: true,
        status: true,
        rawJson: true,
        complaintStatus: true,
        complaintText: true,
      },
    }),
    request("/api/shipments/stats", { token }),
  ]);

  let total = 0;
  let delivered = 0;
  let pending = 0;
  let returned = 0;
  let totalAmount = 0;
  let deliveredAmount = 0;
  let pendingAmount = 0;
  let returnedAmount = 0;

  const shipmentAmounts = new Map();
  const shipmentStatuses = new Map();

  for (const s of shipments) {
    const finalStatus = deriveFinalShipmentStatusForStats(s);
    const amount = toAmount(s.rawJson);

    total += 1;
    totalAmount += amount;
    shipmentAmounts.set(s.trackingNumber, amount);
    shipmentStatuses.set(s.trackingNumber, finalStatus);

    if (finalStatus === "DELIVERED" || finalStatus === "DELIVERED WITH PAYMENT") {
      delivered += 1;
      deliveredAmount += amount;
    } else if (finalStatus === "RETURNED") {
      returned += 1;
      returnedAmount += amount;
    } else {
      pending += 1;
      pendingAmount += amount;
    }
  }

  let complaints = 0;
  let complaintAmount = 0;
  let complaintWatch = 0;
  let complaintActive = 0;
  let complaintResolved = 0;
  let complaintClosed = 0;
  let complaintReopened = 0;

  for (const s of shipments) {
    const parsed = parseComplaintRecord(s.complaintText, s.complaintStatus);
    if (!parsed.complaintId && String(s.complaintStatus ?? "").toUpperCase() !== "ERROR") continue;

    const trackingId = String(s.trackingNumber ?? "").trim();
    const history = extractComplaintHistory(s.complaintText, s.complaintStatus, trackingId);
    const attempts = Math.max(1, history.length || 1);
    complaints += attempts;

    const amount = shipmentAmounts.get(trackingId) ?? 0;
    complaintAmount += amount;

    const lifecycleState = normalizeComplaintLifecycleState(parsed.state);
    if (lifecycleState === "RESOLVED") complaintResolved += 1;
    if (lifecycleState === "CLOSED") complaintClosed += 1;
    if (lifecycleState === "ACTIVE" || lifecycleState === "IN_PROCESS") complaintActive += 1;
    if (attempts > 1) complaintReopened += 1;

    if (parsed.active && shipmentStatuses.get(trackingId) === "PENDING") complaintWatch += 1;
  }

  const dbAudit = {
    total,
    delivered,
    pending,
    returned,
    totalAmount,
    deliveredAmount,
    pendingAmount,
    returnedAmount,
    complaints,
    complaintAmount,
    complaintWatch,
    complaintActive,
    complaintResolved,
    complaintClosed,
    complaintReopened,
  };

  const apiStats = statsResp.body ?? {};
  const compare = {
    returned: Number(apiStats.returned ?? -1) === returned,
    complaints: Number(apiStats.complaints ?? -1) === complaints,
    complaintWatch: Number(apiStats.complaintWatch ?? -1) === complaintWatch,
    complaintActive: Number(apiStats.complaintActive ?? -1) === complaintActive,
    complaintResolved: Number(apiStats.complaintResolved ?? -1) === complaintResolved,
    complaintClosed: Number(apiStats.complaintClosed ?? -1) === complaintClosed,
    complaintReopened: Number(apiStats.complaintReopened ?? -1) === complaintReopened,
  };

  const result = {
    generatedAt: new Date().toISOString(),
    apiStatusCode: statsResp.status,
    userId,
    apiStats,
    dbAudit,
    compare,
    allMatch: Object.values(compare).every(Boolean),
  };

  const fs = await import("node:fs/promises");
  await fs.writeFile("temp-final-consistency-audit.json", JSON.stringify(result, null, 2), "utf8");
  console.log(`AUDIT_DONE allMatch=${result.allMatch} returned(api=${apiStats.returned},db=${returned}) complaints(api=${apiStats.complaints},db=${complaints})`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
