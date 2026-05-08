import { prisma } from "../lib/prisma.js";
import { Prisma } from "@prisma/client";
import { parseComplaintRecord } from "./complaint.service.js";

export const COMPLAINT_RETRY_SCHEDULE_MINUTES = [5, 15, 30, 60, 180] as const;
export const COMPLAINT_MAX_RETRIES = 6;

export type ComplaintQueueStatus = "queued" | "processing" | "submitted" | "duplicate" | "retry_pending" | "manual_review" | "resolved" | "closed";

const LEGACY_RETRY_STATUS = "retrying";
const ACTIVE_QUEUE_STATUSES = ["queued", "processing", "retry_pending", "submitted", "duplicate", "manual_review", LEGACY_RETRY_STATUS] as const;

export function normalizeComplaintQueueStatus(status: string | null | undefined): ComplaintQueueStatus | string {
  const normalized = String(status ?? "").trim().toLowerCase();
  if (!normalized) return "queued";
  if (normalized === LEGACY_RETRY_STATUS) return "retry_pending";
  return normalized;
}

export type ComplaintQueuePayload = {
  tracking_number: string;
  phone: string;
  complaint_text: string;
  current_user_remarks?: string;
  attempt_number?: number;
  previous_complaint_reference?: string;
  sender_name?: string;
  sender_address?: string;
  sender_city_value?: string;
  receiver_name?: string;
  receiver_address?: string;
  receiver_city_value?: string;
  receiver_contact?: string;
  booking_date?: string;
  booking_office?: string;
  complaint_reason?: string;
  prefer_reply_mode?: "POST" | "EMAIL" | "SMS";
  reply_email?: string;
  service_type?: string;
  recipient_city_value?: string;
  recipient_district?: string;
  recipient_tehsil?: string;
  recipient_location?: string;
};

export function getComplaintNextRetryAt(retryCount: number) {
  const index = Math.max(0, Math.min(retryCount - 1, COMPLAINT_RETRY_SCHEDULE_MINUTES.length - 1));
  const minutes = COMPLAINT_RETRY_SCHEDULE_MINUTES[index] ?? COMPLAINT_RETRY_SCHEDULE_MINUTES[COMPLAINT_RETRY_SCHEDULE_MINUTES.length - 1];
  return new Date(Date.now() + (minutes * 60 * 1000));
}

export async function findActiveComplaintDuplicate(userId: string, trackingId: string) {
  const now = new Date();
  const queueDuplicates = await prisma.complaintQueue.findMany({
    where: {
      userId,
      trackingId,
      complaintStatus: { in: ACTIVE_QUEUE_STATUSES as unknown as string[] },
    },
    orderBy: { updatedAt: "desc" },
  });

  for (const queueDuplicate of queueDuplicates) {
    const status = normalizeComplaintQueueStatus(queueDuplicate.complaintStatus);
    const dueDateActive = queueDuplicate.dueDate ? queueDuplicate.dueDate >= now : false;
    const missingDueDateButInFlight = ["queued", "processing", "retry_pending"].includes(String(status));
    if (dueDateActive || missingDueDateButInFlight) {
      return {
        duplicate: true,
        complaintId: queueDuplicate.complaintId ?? "",
        dueDate: queueDuplicate.dueDate,
        source: "queue" as const,
      };
    }
  }

  const shipment = await prisma.shipment.findUnique({
    where: { userId_trackingNumber: { userId, trackingNumber: trackingId } },
    select: { complaintStatus: true, complaintText: true },
  });

  const parsed = parseComplaintRecord(shipment?.complaintText, shipment?.complaintStatus);
  if (parsed.active) {
    return {
      duplicate: true,
      complaintId: parsed.complaintId,
      dueDate: parsed.dueDateTs != null ? new Date(parsed.dueDateTs) : null,
      source: "shipment" as const,
    };
  }

  return {
    duplicate: false,
    complaintId: "",
    dueDate: null,
    source: null,
  };
}

export async function enqueueComplaint(input: {
  userId: string;
  trackingId: string;
  payload: ComplaintQueuePayload;
  browserSession?: Record<string, unknown> | null;
}) {
  return prisma.complaintQueue.create({
    data: {
      userId: input.userId,
      trackingId: input.trackingId,
      payloadJson: input.payload,
      complaintStatus: "queued",
      retryCount: 0,
      nextRetryAt: new Date(),
      browserSessionJson: input.browserSession
        ? (input.browserSession as Prisma.InputJsonValue)
        : Prisma.JsonNull,
    },
  });
}

export async function markComplaintQueueProcessing(id: string) {
  await prisma.complaintQueue.update({
    where: { id },
    data: { complaintStatus: "processing", lastError: null },
  });
}

export async function markComplaintQueueSuccess(input: {
  id: string;
  complaintId: string;
  dueDate: Date | null;
  status: "submitted" | "duplicate";
}) {
  await prisma.complaintQueue.update({
    where: { id: input.id },
    data: {
      complaintStatus: input.status,
      complaintId: input.complaintId || null,
      dueDate: input.dueDate,
      nextRetryAt: null,
      lastError: null,
    },
  });
}

export async function markComplaintQueueFailure(id: string, reason: string) {
  const row = await prisma.complaintQueue.findUnique({ where: { id } });
  if (!row) return { status: "missing" as const, retryCount: 0 };

  const retryCount = Number(row.retryCount ?? 0) + 1;
  const status = retryCount >= COMPLAINT_MAX_RETRIES ? "manual_review" : "retry_pending";
  await prisma.complaintQueue.update({
    where: { id },
    data: {
      retryCount,
      complaintStatus: status,
      nextRetryAt: status === "manual_review" ? null : getComplaintNextRetryAt(retryCount),
      lastError: String(reason ?? "Unknown complaint queue failure").slice(0, 1000),
    },
  });

  return { status, retryCount };
}

export async function getQueuedComplaintsForRetry(limit = 25) {
  return prisma.complaintQueue.findMany({
    where: {
      complaintStatus: { in: ["queued", "retry_pending", LEGACY_RETRY_STATUS] },
      nextRetryAt: { lte: new Date() },
    },
    orderBy: [{ nextRetryAt: "asc" }, { createdAt: "asc" }],
    take: limit,
  });
}
