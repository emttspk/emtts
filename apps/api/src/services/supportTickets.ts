import path from "node:path";

export const SUPPORT_TICKET_STATUSES = [
  "OPEN",
  "PENDING",
  "IN_PROGRESS",
  "WAITING_CUSTOMER",
  "RESOLVED",
  "CLOSED",
] as const;

export const SUPPORT_TICKET_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;

export const SUPPORT_TICKET_CATEGORIES = ["BILLING", "SHIPMENT", "TECHNICAL", "ACCOUNT", "OTHER"] as const;

export const SUPPORT_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const SUPPORT_ATTACHMENT_MAX_FILES = 5;

const BLOCKED_EXTENSIONS = new Set([
  ".exe",
  ".js",
  ".html",
  ".htm",
  ".sh",
  ".bat",
  ".cmd",
  ".php",
  ".svg",
  ".msi",
  ".com",
  ".jar",
]);

const ALLOWED_EXTENSIONS = new Set([
  ".pdf",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".csv",
  ".xls",
  ".xlsx",
  ".doc",
  ".docx",
  ".txt",
]);

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/csv",
  "application/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);

export function toSupportStatus(value: unknown) {
  const normalized = String(value ?? "").trim().toUpperCase();
  return SUPPORT_TICKET_STATUSES.includes(normalized as (typeof SUPPORT_TICKET_STATUSES)[number])
    ? (normalized as (typeof SUPPORT_TICKET_STATUSES)[number])
    : null;
}

export function toSupportPriority(value: unknown) {
  const normalized = String(value ?? "").trim().toUpperCase();
  return SUPPORT_TICKET_PRIORITIES.includes(normalized as (typeof SUPPORT_TICKET_PRIORITIES)[number])
    ? (normalized as (typeof SUPPORT_TICKET_PRIORITIES)[number])
    : null;
}

export function toSupportCategory(value: unknown) {
  const normalized = String(value ?? "").trim().toUpperCase();
  return SUPPORT_TICKET_CATEGORIES.includes(normalized as (typeof SUPPORT_TICKET_CATEGORIES)[number])
    ? (normalized as (typeof SUPPORT_TICKET_CATEGORIES)[number])
    : null;
}

export function getFirstResponseDueAt(priority: string, createdAt = new Date()) {
  const base = new Date(createdAt.getTime());
  const hours = priority === "URGENT"
    ? 4
    : priority === "HIGH"
      ? 8
      : priority === "MEDIUM"
        ? 24
        : 72;
  base.setHours(base.getHours() + hours);
  return base;
}

export function generateSupportTicketNumber(now = new Date()) {
  const y = String(now.getUTCFullYear());
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const random = Math.floor(Math.random() * 90000 + 10000);
  return `SUP-${y}${m}${d}-${random}`;
}

export function sanitizeAttachmentFileName(input: string) {
  const basename = path.basename(String(input ?? "file")).normalize("NFKC");
  const cleaned = basename
    .replace(/[^a-zA-Z0-9._ -]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  const fallback = cleaned || "file";
  return fallback.length > 120 ? fallback.slice(0, 120) : fallback;
}

export function isAllowedAttachment(fileName: string, mimeType: string) {
  const ext = path.extname(String(fileName ?? "")).toLowerCase();
  if (!ext || BLOCKED_EXTENSIONS.has(ext)) {
    return { ok: false, reason: "Unsupported file type" };
  }
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return { ok: false, reason: "Unsupported file extension" };
  }
  const normalizedMime = String(mimeType ?? "").trim().toLowerCase();
  if (!ALLOWED_MIME_TYPES.has(normalizedMime)) {
    return { ok: false, reason: "Unsupported MIME type" };
  }
  return { ok: true as const };
}

export function toR2SupportArtifactKey(ticketId: string, messageId: string, safeFileName: string) {
  return `${ticketId}/${messageId}/${safeFileName}`;
}

export function splitSupportObjectKey(objectKey: string) {
  const normalized = String(objectKey ?? "").replace(/\\/g, "/").replace(/^\/+/, "");
  const prefix = "support-tickets/";
  if (normalized.startsWith(prefix)) {
    return normalized.slice(prefix.length);
  }
  return normalized;
}

export function isOverdueTicket(status: string, firstResponseDueAt: Date | null, now = new Date()) {
  if (!firstResponseDueAt) return false;
  const normalizedStatus = String(status ?? "").trim().toUpperCase();
  if (["RESOLVED", "CLOSED", "WAITING_CUSTOMER"].includes(normalizedStatus)) return false;
  return firstResponseDueAt.getTime() < now.getTime();
}
