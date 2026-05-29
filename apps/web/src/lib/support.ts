import { api, apiUrl, getFilenameFromContentDisposition } from "./api";
import { getToken } from "./auth";

export type SupportStatus = "OPEN" | "PENDING" | "IN_PROGRESS" | "WAITING_CUSTOMER" | "RESOLVED" | "CLOSED";
export type SupportPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type SupportCategory = "BILLING" | "SHIPMENT" | "TECHNICAL" | "ACCOUNT" | "OTHER";

export const SUPPORT_ATTACHMENT_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.csv,.xls,.xlsx,.doc,.docx,.txt";
export const SUPPORT_ATTACHMENT_MAX_FILES = 5;
export const SUPPORT_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_SUPPORT_ATTACHMENT_EXTENSIONS = new Set(["pdf", "jpg", "jpeg", "png", "webp", "csv", "xls", "xlsx", "doc", "docx", "txt"]);

export type SupportAttachment = {
  id: string;
  messageId: string;
  originalName: string;
  safeFileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
};

export type SupportMessage = {
  id: string;
  ticketId: string;
  authorUserId: string;
  authorRole: "USER" | "ADMIN" | string;
  message: string;
  createdAt: string;
  attachments?: SupportAttachment[];
};

export type SupportTicket = {
  id: string;
  ticketNumber: string;
  userId: string;
  subject: string;
  category: SupportCategory | string;
  priority: SupportPriority | string;
  status: SupportStatus | string;
  isPreserved?: boolean;
  deleteAfter?: string | null;
  firstResponseDueAt?: string | null;
  lastReplyAt?: string | null;
  createdAt: string;
  updatedAt: string;
  messages?: SupportMessage[];
  _count?: { messages: number; attachments: number };
};

export type SupportNotification = {
  id: string;
  userId?: string | null;
  ticketId: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  ticket?: {
    id: string;
    ticketNumber: string;
    subject: string;
    status: string;
    priority: string;
  };
};

export function validateSupportAttachmentFiles(files: File[]) {
  if (files.length > SUPPORT_ATTACHMENT_MAX_FILES) {
    return `No more than ${SUPPORT_ATTACHMENT_MAX_FILES} attachments are allowed.`;
  }

  for (const file of files) {
    if (file.size > SUPPORT_ATTACHMENT_MAX_BYTES) {
      return `${file.name} exceeds the 10 MB file size limit.`;
    }
    const ext = String(file.name.split(".").pop() ?? "").trim().toLowerCase();
    if (!ext || !ALLOWED_SUPPORT_ATTACHMENT_EXTENSIONS.has(ext)) {
      return `Unsupported file type for ${file.name}. Allowed: PDF, JPG, JPEG, PNG, WEBP, CSV, XLS, XLSX, DOC, DOCX, TXT.`;
    }
  }

  return null;
}

export async function createSupportTicket(payload: {
  subject: string;
  category: SupportCategory;
  priority: SupportPriority;
  message: string;
}) {
  return api<{ ticket: SupportTicket }>("/api/support/tickets", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listMySupportTickets(params?: { page?: number; pageSize?: number; status?: string }) {
  const q = new URLSearchParams();
  if (params?.page) q.set("page", String(params.page));
  if (params?.pageSize) q.set("pageSize", String(params.pageSize));
  if (params?.status) q.set("status", params.status);
  const suffix = q.toString() ? `?${q.toString()}` : "";
  return api<{ tickets: SupportTicket[]; total: number; page: number; pageSize: number }>(`/api/support/tickets${suffix}`);
}

export async function getMySupportTicket(ticketId: string) {
  return api<{ ticket: SupportTicket }>(`/api/support/tickets/${encodeURIComponent(ticketId)}`);
}

export async function replyToMySupportTicket(ticketId: string, message: string) {
  return api<{ message: SupportMessage }>(`/api/support/tickets/${encodeURIComponent(ticketId)}/messages`, {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

export async function uploadSupportAttachments(ticketId: string, files: File[], message?: string) {
  const token = getToken();
  const form = new FormData();
  for (const file of files) {
    form.append("files", file);
  }
  if (message) form.append("message", message);
  const res = await fetch(apiUrl(`/api/support/tickets/${encodeURIComponent(ticketId)}/attachments`), {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
    body: form,
  });
  const text = await res.text();
  let body: any = null;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error("Upload failed");
  }
  if (!res.ok) {
    throw new Error(body?.error ?? "Upload failed");
  }
  return body as { messageId: string; attachments: SupportAttachment[] };
}

export async function getSupportAttachmentLink(ticketId: string, attachmentId: string) {
  return api<{ url: string; expiresInSeconds: number }>(
    `/api/support/tickets/${encodeURIComponent(ticketId)}/attachments/${encodeURIComponent(attachmentId)}/download`,
  );
}

export async function viewSupportAttachmentInNewTab(ticketId: string, attachmentId: string) {
  const signed = await getSupportAttachmentLink(ticketId, attachmentId);
  window.open(signed.url, "_blank", "noopener,noreferrer");
}

export async function downloadSupportAttachment(ticketId: string, attachmentId: string, fallbackName?: string) {
  const token = getToken();
  const signed = await getSupportAttachmentLink(ticketId, attachmentId);
  const res = await fetch(signed.url, {
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) {
    throw new Error("Failed to download attachment");
  }
  const blob = await res.blob();
  const objectUrl = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = getFilenameFromContentDisposition(res.headers.get("content-disposition"), fallbackName);
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 1000);
}

export async function listAdminSupportTickets(params?: {
  page?: number;
  pageSize?: number;
  status?: string;
  priority?: string;
  category?: string;
  userId?: string;
  search?: string;
  from?: string;
  to?: string;
}) {
  const q = new URLSearchParams();
  if (params?.page) q.set("page", String(params.page));
  if (params?.pageSize) q.set("pageSize", String(params.pageSize));
  if (params?.status) q.set("status", params.status);
  if (params?.priority) q.set("priority", params.priority);
  if (params?.category) q.set("category", params.category);
  if (params?.userId) q.set("userId", params.userId);
  if (params?.search) q.set("search", params.search);
  if (params?.from) q.set("from", params.from);
  if (params?.to) q.set("to", params.to);
  const suffix = q.toString() ? `?${q.toString()}` : "";
  return api<{ tickets: SupportTicket[]; total: number; page: number; pageSize: number }>(`/api/admin/support/tickets${suffix}`);
}

export async function getAdminSupportTicket(ticketId: string) {
  return api<{ ticket: SupportTicket & { user?: { id: string; email: string; companyName?: string | null } } }>(
    `/api/admin/support/tickets/${encodeURIComponent(ticketId)}`,
  );
}

export async function listAdminSupportSummary() {
  return api<{
    openTickets: number;
    pendingTickets: number;
    resolvedTickets: number;
    overdueTickets: number;
    totalSupportTickets: number;
    closedTickets: number;
    totalSupportAttachments: number;
    totalSupportStorageMb: number;
  }>("/api/admin/support/summary");
}

export async function updateAdminSupportStatus(ticketId: string, status: SupportStatus) {
  return api<{ ticket: SupportTicket }>(`/api/admin/support/tickets/${encodeURIComponent(ticketId)}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export async function updateAdminSupportPriority(ticketId: string, priority: SupportPriority) {
  return api<{ ticket: SupportTicket }>(`/api/admin/support/tickets/${encodeURIComponent(ticketId)}/priority`, {
    method: "PATCH",
    body: JSON.stringify({ priority }),
  });
}

export async function updateAdminSupportPreserve(ticketId: string, isPreserved: boolean) {
  return api<{ ticket: SupportTicket }>(`/api/admin/support/tickets/${encodeURIComponent(ticketId)}/preserve`, {
    method: "PATCH",
    body: JSON.stringify({ isPreserved }),
  });
}

export async function replyAdminSupportTicket(ticketId: string, message: string) {
  return api<{ message: SupportMessage }>(`/api/admin/support/tickets/${encodeURIComponent(ticketId)}/messages`, {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

export async function listSupportNotifications() {
  return api<{ notifications: SupportNotification[]; unreadCount: number }>("/api/support/notifications");
}

export async function markSupportNotificationsRead(input: { notificationIds?: string[]; markAll?: boolean }) {
  return api<{ updatedCount: number }>("/api/support/notifications/read", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function listAdminSupportNotifications() {
  return api<{ notifications: SupportNotification[]; unreadCount: number }>("/api/admin/support/notifications");
}

export async function markAdminSupportNotificationsRead(input: { notificationIds?: string[]; markAll?: boolean }) {
  return api<{ updatedCount: number }>("/api/admin/support/notifications/read", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
