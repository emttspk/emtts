import { prisma } from "../lib/prisma.js";
import { pythonSubmitComplaint } from "../services/trackingService.js";
import {
  markComplaintQueueFailure,
  markComplaintQueueProcessing,
  markComplaintQueueSuccess,
  type ComplaintQueuePayload,
} from "../services/complaint-queue.service.js";
import { recordComplaintCircuitFailure, recordComplaintCircuitSuccess, isComplaintCircuitOpen } from "../services/complaint-circuit.service.js";
import { logComplaintAudit } from "../services/complaint-audit.service.js";
import { parseComplaintRecord } from "../services/complaint.service.js";

function normalizeDueDateToDate(input: string) {
  const value = String(input ?? "").trim();
  if (!value) return null;

  const slash = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    return new Date(Number(slash[3]), Number(slash[2]) - 1, Number(slash[1]), 0, 0, 0, 0);
  }

  const dash = value.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dash) {
    return new Date(Number(dash[3]), Number(dash[2]) - 1, Number(dash[1]), 0, 0, 0, 0);
  }

  const iso = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 0, 0, 0, 0);
  }

  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function normalizeDueDateToDdMmYyyy(input: string) {
  const dt = normalizeDueDateToDate(input);
  if (!dt) return "";
  return `${String(dt.getDate()).padStart(2, "0")}-${String(dt.getMonth() + 1).padStart(2, "0")}-${dt.getFullYear()}`;
}

function formatDateToDdMmYyyy(input: Date | null | undefined) {
  if (!input) return "";
  const dt = new Date(input);
  if (!Number.isFinite(dt.getTime())) return "";
  return `${String(dt.getDate()).padStart(2, "0")}-${String(dt.getMonth() + 1).padStart(2, "0")}-${dt.getFullYear()}`;
}

export async function processComplaintQueueById(queueId: string) {
  const queueRow = await prisma.complaintQueue.findUnique({ where: { id: queueId } });
  if (!queueRow) {
    return { success: false, status: "MISSING", message: "Complaint queue row not found" };
  }

  await markComplaintQueueProcessing(queueId);

  const circuitOpen = await isComplaintCircuitOpen();
  if (circuitOpen) {
    await markComplaintQueueFailure(queueId, "Complaint circuit is open; keeping request queued");
    return { success: false, status: "QUEUED_ONLY", message: "Circuit breaker is open" };
  }

  const payload = queueRow.payloadJson as ComplaintQueuePayload;
  const trackingNumber = String(payload.tracking_number ?? queueRow.trackingId).trim();
  const phone = String(payload.phone ?? "").trim();
  const existingShipment = await prisma.shipment.findUnique({
    where: { userId_trackingNumber: { userId: queueRow.userId, trackingNumber } },
    select: { complaintText: true, complaintStatus: true },
  });
  const existingParsed = parseComplaintRecord(existingShipment?.complaintText, existingShipment?.complaintStatus);

  try {
    const response = await pythonSubmitComplaint(trackingNumber, phone, payload as unknown as Record<string, unknown>);

    const responseText = String(response.response_text ?? "").trim();
    const alreadyExists = /already\s+under\s+process|duplicate/i.test(responseText) || response.already_exists === true;
    const complaintNumber = String(response.complaint_number ?? "").trim()
      || (responseText.match(/Complaint\s*(?:ID|No)\s*[:\-]?\s*([A-Z0-9\-]+)/i)?.[1] ?? "");
    const submitSuccess = /you\s+complaint\s+has\s+been\s+submitted\s+successfully/i.test(responseText) || Boolean(complaintNumber) || alreadyExists;

    const rawDueDate = String(response.due_date ?? "").trim()
      || (responseText.match(/Due\s*Date\s*(?:on)?\s*([0-3]?\d\/[0-1]?\d\/\d{4}|\d{4}-\d{1,2}-\d{1,2}|[0-3]?\d-[0-1]?\d-\d{4})/i)?.[1] ?? "");
    const normalizedDueDate = normalizeDueDateToDdMmYyyy(rawDueDate);
    const dueDate = normalizeDueDateToDate(rawDueDate);

    const complaintId = complaintNumber
      ? (complaintNumber.toUpperCase().startsWith("CMP-") ? complaintNumber.toUpperCase() : `CMP-${complaintNumber}`)
      : "";

    const finalizedComplaintId = String(
      complaintId
      || existingParsed.complaintId
      || queueRow.complaintId
      || "",
    ).trim();
    const finalizedDueDate = dueDate
      ?? queueRow.dueDate
      ?? (existingParsed.dueDateTs != null ? new Date(existingParsed.dueDateTs) : null);
    const normalizedFinalDueDate = normalizedDueDate
      || formatDateToDdMmYyyy(finalizedDueDate);

    const queueStatus: "duplicate" | "submitted" = alreadyExists ? "duplicate" : "submitted";
    if (submitSuccess || alreadyExists) {
      await markComplaintQueueSuccess({
        id: queueId,
        complaintId: finalizedComplaintId,
        dueDate: finalizedDueDate,
        status: queueStatus,
      });
      await recordComplaintCircuitSuccess();
    } else {
      await markComplaintQueueFailure(queueId, responseText || "Complaint submission failed");
      await recordComplaintCircuitFailure(responseText || "Complaint submission failed");
    }

    const structuredParts: string[] = [];
    if (finalizedComplaintId) structuredParts.push(`COMPLAINT_ID: ${finalizedComplaintId}`);
    if (normalizedFinalDueDate) structuredParts.push(`DUE_DATE: ${normalizedFinalDueDate}`);
    structuredParts.push("COMPLAINT_STATE: ACTIVE");
    const structuredHeader = structuredParts.join(" | ");
    const structuredText = `${structuredHeader}\nUser complaint:\n${String(payload.complaint_text ?? "").trim()}\n\nResponse:\n${responseText}`;

    await prisma.shipment.upsert({
      where: { userId_trackingNumber: { userId: queueRow.userId, trackingNumber } },
      create: {
        userId: queueRow.userId,
        trackingNumber,
        complaintStatus: submitSuccess || alreadyExists ? "FILED" : "ERROR",
        complaintText: structuredText,
      },
      update: {
        complaintStatus: submitSuccess || alreadyExists ? "FILED" : "ERROR",
        complaintText: structuredText,
      },
    });

    if (submitSuccess || alreadyExists) {
      await logComplaintAudit({
        actorEmail: "worker",
        action: "complaint_created",
        trackingId: trackingNumber,
        complaintId: finalizedComplaintId || undefined,
        details: `queue:${queueId};status:${queueStatus};due:${normalizedFinalDueDate || "-"}`,
      });
    }

    return {
      success: submitSuccess || alreadyExists,
      status: submitSuccess ? "FILED" : (alreadyExists ? "DUPLICATE" : "ERROR"),
      complaintId: finalizedComplaintId,
      dueDate: normalizedFinalDueDate,
      trackingId: trackingNumber,
      responseText,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Complaint worker submission failed";
    await markComplaintQueueFailure(queueId, message);
    await recordComplaintCircuitFailure(message);
    return { success: false, status: "ERROR", message, trackingId: trackingNumber };
  }
}
