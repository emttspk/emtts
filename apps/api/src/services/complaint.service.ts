import { prisma } from "../lib/prisma.js";

export type ComplaintRecord = {
  userId: string;
  userEmail: string;
  trackingId: string;
  complaintId: string;
  dueDate: string;
  dueDateTs: number | null;
  state: "OPEN" | "IN_PROCESS" | "OVERDUE" | "RESOLVED" | "CLOSED" | "ACTIVE" | "REJECTED";
  manualStatePinned: boolean;
  active: boolean;
  complaintStatus: string;
  complaintText: string;
  shipmentStatus: string;
  manualPendingOverride: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type ComplaintAlertRecord = {
  id: string;
  trackingId: string;
  complaintId: string;
  alertType: string;
  dueDate: string;
  createdAt: string;
};

export type ComplaintHistoryEntry = {
  complaintId: string;
  trackingId: string;
  createdAt: string;
  dueDate: string;
  status: string;
  attemptNumber: number;
  previousComplaintReference: string;
  userComplaint?: string;
};

const COMPLAINT_HISTORY_MARKER = "COMPLAINT_HISTORY_JSON:";

function normalizeComplaintId(input: string | null | undefined) {
  const value = String(input ?? "").trim().toUpperCase();
  if (!value) return "";
  return value.startsWith("CMP-") ? value : `CMP-${value}`;
}

function sanitizeComplaintHistoryEntry(entry: Partial<ComplaintHistoryEntry>, fallbackTrackingId = ""): ComplaintHistoryEntry {
  return {
    complaintId: normalizeComplaintId(String(entry.complaintId ?? "")),
    trackingId: String(entry.trackingId ?? fallbackTrackingId).trim(),
    createdAt: String(entry.createdAt ?? "").trim() || new Date().toISOString(),
    dueDate: String(entry.dueDate ?? "").trim(),
    status: String(entry.status ?? "").trim().toUpperCase() || "ACTIVE",
    attemptNumber: Math.max(1, Number(entry.attemptNumber ?? 1) || 1),
    previousComplaintReference: normalizeComplaintId(String(entry.previousComplaintReference ?? "")),
    userComplaint: String(entry.userComplaint ?? "").trim(),
  };
}

export function normalizeComplaintHistoryEntries(entries: ComplaintHistoryEntry[]): ComplaintHistoryEntry[] {
  const seenByComplaintId = new Set<string>();
  const sorted = [...entries]
    .map((entry) => sanitizeComplaintHistoryEntry(entry, String(entry.trackingId ?? "").trim()))
    .filter((entry) => Boolean(entry.complaintId))
    .sort((a, b) => Number(a.attemptNumber ?? 1) - Number(b.attemptNumber ?? 1));

  const unique: ComplaintHistoryEntry[] = [];
  for (const entry of sorted) {
    if (seenByComplaintId.has(entry.complaintId)) continue;
    seenByComplaintId.add(entry.complaintId);
    unique.push(entry);
  }

  return unique.map((entry, index) => ({
    ...entry,
    attemptNumber: index + 1,
    previousComplaintReference: index === 0
      ? ""
      : (entry.previousComplaintReference || unique[index - 1]?.complaintId || ""),
  }));
}

export function appendComplaintHistoryAttempt(
  existingEntries: ComplaintHistoryEntry[],
  nextEntry: ComplaintHistoryEntry,
) {
  const normalizedExisting = normalizeComplaintHistoryEntries(existingEntries);
  const sanitizedNext = sanitizeComplaintHistoryEntry(nextEntry, normalizedExisting[normalizedExisting.length - 1]?.trackingId ?? "");
  if (!sanitizedNext.complaintId) {
    return normalizedExisting;
  }
  if (normalizedExisting.some((entry) => entry.complaintId === sanitizedNext.complaintId)) {
    return normalizedExisting;
  }

  return normalizeComplaintHistoryEntries([
    ...normalizedExisting,
    {
      ...sanitizedNext,
      attemptNumber: normalizedExisting.length + 1,
      previousComplaintReference: sanitizedNext.previousComplaintReference
        || normalizedExisting[normalizedExisting.length - 1]?.complaintId
        || "",
    },
  ]);
}

function parseDueDateToTs(input: string): number | null {
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

export function parseComplaintRecord(textBlob: string | null | undefined, complaintStatus?: string | null) {
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
  const shipmentStatusAtComplaintSubmit = String(text.match(/shipmentStatusAtComplaintSubmit\s*:\s*([^|\n]+)/i)?.[1] ?? "").trim().toUpperCase();
  const trackingStateAtSync = String(text.match(/trackingStateAtSync\s*:\s*([^|\n]+)/i)?.[1] ?? "").trim().toUpperCase();
  const complaintStateReason = String(text.match(/complaintStateReason\s*:\s*([^|\n]+)/i)?.[1] ?? "").trim();
  const manualStatePinned = String(text.match(/manualStatePinned\s*:\s*([^|\n|]+)/i)?.[1] ?? "").trim().toLowerCase() === "true";
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
    state: state as ComplaintRecord["state"],
    manualStatePinned,
    active,
    shipmentStatusAtComplaintSubmit,
    trackingStateAtSync,
    complaintStateReason,
  };
}

export function upsertComplaintMetadata(textBlob: string | null | undefined, metadata: Record<string, string>) {
  const text = String(textBlob ?? "").trim();
  const lines = text ? text.split(/\r?\n/) : [""];
  let firstLine = lines[0] ?? "";
  for (const [key, value] of Object.entries(metadata)) {
    if (!String(value ?? "").trim()) continue;
    const pattern = new RegExp(`(?:\\s*\\|\\s*)?${key}\\s*:\\s*[^|\\n]+`, "i");
    firstLine = firstLine.replace(pattern, "").trim();
    firstLine = firstLine ? `${firstLine} | ${key}: ${value}` : `${key}: ${value}`;
  }
  lines[0] = firstLine;
  return lines.join("\n").trim();
}

function parseStoredComplaintHistory(textBlob: string | null | undefined): ComplaintHistoryEntry[] {
  const text = String(textBlob ?? "");
  const markerIndex = text.lastIndexOf(COMPLAINT_HISTORY_MARKER);
  if (markerIndex < 0) return [];
  const rawJson = text.slice(markerIndex + COMPLAINT_HISTORY_MARKER.length).trim();
  if (!rawJson) return [];
  try {
    const parsed = JSON.parse(rawJson) as { entries?: ComplaintHistoryEntry[] } | ComplaintHistoryEntry[];
    const entries = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.entries) ? parsed.entries : [];
    return normalizeComplaintHistoryEntries(entries.map((entry) => sanitizeComplaintHistoryEntry(entry)));
  } catch {
    return [];
  }
}

export function extractComplaintHistory(textBlob: string | null | undefined, complaintStatus?: string | null, trackingId?: string) {
  const stored = parseStoredComplaintHistory(textBlob);
  if (stored.length > 0) return stored;

  const fallback = parseComplaintRecord(textBlob, complaintStatus);
  const fallbackUserComplaint = String(textBlob ?? "").match(/User complaint:\s*([\s\S]*?)\n\nResponse:/i)?.[1]?.trim() ?? "";
  if (!fallback.complaintId) return [];
  return normalizeComplaintHistoryEntries([{
    complaintId: fallback.complaintId,
    trackingId: String(trackingId ?? "").trim(),
    createdAt: new Date().toISOString(),
    dueDate: fallback.dueDate,
    status: fallback.state,
    attemptNumber: 1,
    previousComplaintReference: "",
    userComplaint: fallbackUserComplaint,
  }]);
}

export function composeComplaintText(input: {
  complaintId: string;
  dueDate: string;
  state?: string;
  shipmentStatusAtComplaintSubmit?: string;
  trackingStateAtSync?: string;
  complaintStateReason?: string;
  userComplaint: string;
  responseText: string;
  historyEntries: ComplaintHistoryEntry[];
}) {
  const stateLabel = String(input.state ?? "ACTIVE").trim().toUpperCase() || "ACTIVE";
  const headerParts: string[] = [];
  if (String(input.complaintId ?? "").trim()) headerParts.push(`COMPLAINT_ID: ${String(input.complaintId).trim()}`);
  if (String(input.dueDate ?? "").trim()) headerParts.push(`DUE_DATE: ${String(input.dueDate).trim()}`);
  headerParts.push(`COMPLAINT_STATE: ${stateLabel}`);
  if (String(input.shipmentStatusAtComplaintSubmit ?? "").trim()) {
    headerParts.push(`shipmentStatusAtComplaintSubmit: ${String(input.shipmentStatusAtComplaintSubmit).trim().toUpperCase()}`);
  }
  if (String(input.trackingStateAtSync ?? "").trim()) {
    headerParts.push(`trackingStateAtSync: ${String(input.trackingStateAtSync).trim().toUpperCase()}`);
  }
  if (String(input.complaintStateReason ?? "").trim()) {
    headerParts.push(`complaintStateReason: ${String(input.complaintStateReason).trim()}`);
  }
  const header = headerParts.join(" | ");
  const historyJson = JSON.stringify({ entries: input.historyEntries });
  return `${header}\nUser complaint:\n${String(input.userComplaint ?? "").trim()}\n\nResponse:\n${String(input.responseText ?? "").trim()}\n\n${COMPLAINT_HISTORY_MARKER} ${historyJson}`;
}

export async function listComplaintRecords(filters?: { trackingIds?: string[]; userId?: string }) {
  const userId = String(filters?.userId ?? "").trim();
  const trackingIds = Array.from(new Set((filters?.trackingIds ?? []).map((value) => String(value ?? "").trim()).filter(Boolean)));
  const shipments = await prisma.shipment.findMany({
    where: {
      ...(userId ? { userId } : {}),
      ...(trackingIds.length > 0 ? { trackingNumber: { in: trackingIds } } : {}),
      OR: [
        { complaintStatus: { in: ["FILED", "DUPLICATE", "ERROR"] } },
        { complaintText: { not: null } },
      ],
    },
    orderBy: { updatedAt: "desc" },
    include: {
      user: {
        select: { email: true },
      },
    },
  });

  return shipments
    .map((shipment) => {
      const parsed = parseComplaintRecord(shipment.complaintText, shipment.complaintStatus);
      if (!parsed.complaintId && String(shipment.complaintStatus ?? "").toUpperCase() !== "ERROR") return null;
      let manualPendingOverride = false;
      try {
        const raw = shipment.rawJson ? JSON.parse(shipment.rawJson) as Record<string, unknown> : {};
        manualPendingOverride = Boolean((raw as any)?.manual_pending_override);
      } catch {
        manualPendingOverride = false;
      }
      return {
        userId: shipment.userId,
        userEmail: String(shipment.user?.email ?? "").trim(),
        trackingId: shipment.trackingNumber,
        complaintId: parsed.complaintId,
        dueDate: parsed.dueDate,
        dueDateTs: parsed.dueDateTs,
        state: parsed.state,
        manualStatePinned: parsed.manualStatePinned,
        active: parsed.active,
        complaintStatus: String(shipment.complaintStatus ?? "").trim().toUpperCase(),
        complaintText: String(shipment.complaintText ?? ""),
        shipmentStatus: String(shipment.status ?? "").trim().toUpperCase(),
        manualPendingOverride,
        createdAt: shipment.createdAt,
        updatedAt: shipment.updatedAt,
      } satisfies ComplaintRecord;
    })
    .filter((record): record is ComplaintRecord => Boolean(record));
}

function escapeCsvValue(value: unknown) {
  const text = String(value ?? "");
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

export function buildComplaintExportCsv(records: ComplaintRecord[]) {
  const header = ["trackingId", "complaintId", "dueDate", "status", "createdAt", "updatedAt"];
  const rows = records.map((record) => [
    record.trackingId,
    record.complaintId,
    record.dueDate,
    record.state,
    record.createdAt.toISOString(),
    record.updatedAt.toISOString(),
  ]);
  return [header, ...rows].map((row) => row.map(escapeCsvValue).join(",")).join("\n");
}

export async function ensureComplaintNotificationTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS complaint_notification_logs (
      id TEXT PRIMARY KEY,
      tracking_id TEXT NOT NULL,
      complaint_id TEXT NOT NULL,
      alert_type TEXT NOT NULL,
      due_date TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

export async function markComplaintResolved(input: {
  userId: string;
  trackingNumber: string;
  complaintId: string;
  actorEmail: string;
  resolutionNote?: string;
}) {
  const shipment = await prisma.shipment.findUnique({
    where: { userId_trackingNumber: { userId: input.userId, trackingNumber: input.trackingNumber } },
  });
  if (!shipment || !shipment.complaintText) {
    return { success: false, message: "Complaint record not found" };
  }

  const existingHistory = extractComplaintHistory(shipment.complaintText, shipment.complaintStatus, input.trackingNumber);
  const resolvedHistoryEntry: ComplaintHistoryEntry = {
    complaintId: input.complaintId,
    trackingId: input.trackingNumber,
    createdAt: new Date().toISOString(),
    dueDate: "",
    status: "RESOLVED",
    attemptNumber: existingHistory.length + 1,
    previousComplaintReference: existingHistory.length > 0 ? existingHistory[existingHistory.length - 1]?.complaintId : "",
  };
  const updatedHistory = appendComplaintHistoryAttempt(existingHistory, resolvedHistoryEntry);

  const metadata: Record<string, string> = {
    COMPLAINT_STATE: "RESOLVED",
    complaintStateReason: input.actorEmail ? "user_confirmed_resolution" : "admin_resolved",
    manualStatePinned: "true",
    trackingStateAtSync: "MANUAL_RESOLVE",
  };
  if (String(input.resolutionNote ?? "").trim()) {
    metadata.resolutionNote = String(input.resolutionNote).trim();
  }
  const nextText = upsertComplaintMetadata(shipment.complaintText, metadata);
  const finalText = `${nextText}\n\n${COMPLAINT_HISTORY_MARKER} ${JSON.stringify({ entries: updatedHistory })}`;

  await prisma.shipment.update({
    where: { userId_trackingNumber: { userId: input.userId, trackingNumber: input.trackingNumber } },
    data: { complaintText: finalText },
  });

  return { success: true, state: "RESOLVED", text: finalText };
}

export async function listComplaintAlerts(limit = 200): Promise<ComplaintAlertRecord[]> {
  await ensureComplaintNotificationTable();
  const rows = await prisma.$queryRawUnsafe<Array<ComplaintAlertRecord>>(
    `SELECT id, tracking_id as "trackingId", complaint_id as "complaintId", alert_type as "alertType", due_date as "dueDate", created_at as "createdAt"
     FROM complaint_notification_logs
     ORDER BY created_at DESC
     LIMIT ${Number(limit)}`,
  );
  return rows;
}