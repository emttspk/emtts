import { prisma } from "../lib/prisma.js";
import { pythonSubmitComplaint } from "../services/trackingService.js";
import { COMPLAINT_UNIT_COST, refundUnits } from "../usage/unitConsumption.js";
import {
  markComplaintQueueFailure,
  markComplaintQueueProcessing,
  markComplaintQueueSuccess,
  type ComplaintQueuePayload,
} from "../services/complaint-queue.service.js";
import { recordComplaintCircuitFailure, recordComplaintCircuitSuccess, isComplaintCircuitOpen } from "../services/complaint-circuit.service.js";
import { logComplaintAudit } from "../services/complaint-audit.service.js";
import {
  appendComplaintHistoryAttempt,
  composeComplaintText,
  extractComplaintHistory,
  parseComplaintRecord,
  type ComplaintHistoryEntry,
} from "../services/complaint.service.js";
import { createComplaintNotification } from "../services/complaintNotifications.js";

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

  // Extract pure values (no I/O, cannot throw).
  const payload = queueRow.payloadJson as ComplaintQueuePayload;
  const trackingNumber = String(payload.tracking_number ?? queueRow.trackingId).trim();
  const phone = String(payload.phone ?? "").trim();

  try {
    // All I/O after markComplaintQueueProcessing is inside the try so that any
    // unexpected DB or network error still transitions the row away from "processing".
    const circuitOpen = await isComplaintCircuitOpen();
    if (circuitOpen) {
      await markComplaintQueueFailure(queueId, "Complaint circuit is open; keeping request queued");
      return { success: false, status: "QUEUED_ONLY", message: "Circuit breaker is open" };
    }

    const existingShipment = await prisma.shipment.findUnique({
      where: { userId_trackingNumber: { userId: queueRow.userId, trackingNumber } },
      select: { complaintText: true, complaintStatus: true },
    });
    const existingParsed = parseComplaintRecord(existingShipment?.complaintText, existingShipment?.complaintStatus);

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

    const existingHistory = extractComplaintHistory(existingShipment?.complaintText, existingShipment?.complaintStatus, trackingNumber);
    const attemptFromPayload = Math.max(1, Number(payload.attempt_number ?? 0) || 0);
    const inferredAttempt = existingHistory.length > 0 ? Math.max(...existingHistory.map((entry) => Math.max(1, Number(entry.attemptNumber ?? 1)))) + 1 : 1;
    const attemptNumber = attemptFromPayload > 0 ? attemptFromPayload : inferredAttempt;
    const latestHistory = existingHistory.length > 0 ? existingHistory[existingHistory.length - 1] : null;
    const nextEntry: ComplaintHistoryEntry = {
      complaintId: finalizedComplaintId || latestHistory?.complaintId || "",
      trackingId: trackingNumber,
      createdAt: new Date().toISOString(),
      dueDate: normalizedFinalDueDate || latestHistory?.dueDate || "",
      status: submitSuccess || alreadyExists ? "ACTIVE" : "ERROR",
      attemptNumber,
      previousComplaintReference: String(payload.previous_complaint_reference ?? latestHistory?.complaintId ?? "").trim(),
      userComplaint: String(payload.current_user_remarks ?? payload.complaint_text ?? "").trim(),
    };
    const mergedHistory = appendComplaintHistoryAttempt(existingHistory, nextEntry);
    const effectiveAttemptNumber = mergedHistory.length > 0
      ? Math.max(1, Number(mergedHistory[mergedHistory.length - 1]?.attemptNumber ?? 1))
      : attemptNumber;

    const structuredText = composeComplaintText({
      complaintId: finalizedComplaintId,
      dueDate: normalizedFinalDueDate,
      state: "ACTIVE",
      shipmentStatusAtComplaintSubmit: String(payload.shipment_status_at_complaint_submit ?? "PENDING").trim().toUpperCase() || "PENDING",
      trackingStateAtSync: "UNSYNCED",
      complaintStateReason: effectiveAttemptNumber > 1 ? "reopened_submission_pending_sync" : "submitted_pending_sync",
      userComplaint: String(payload.complaint_text ?? "").trim(),
      responseText,
      historyEntries: mergedHistory,
    });

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
      
      // Create notification for successful complaint submission
      const notificationType = submitSuccess ? "complaint_filed" : "complaint_resolved";
      const notificationTitle = submitSuccess 
        ? "Complaint Submitted" 
        : "Complaint Already Registered";
      const notificationMessage = submitSuccess
        ? `Your complaint for tracking ${trackingNumber} has been successfully submitted. Complaint ID: ${finalizedComplaintId || "-"}, Due Date: ${normalizedFinalDueDate || "-"}`
        : `A complaint already exists for tracking ${trackingNumber}. Complaint ID: ${finalizedComplaintId || "-"}`;
      
      await createComplaintNotification({
        userId: queueRow.userId,
        trackingId: trackingNumber,
        type: notificationType,
        title: notificationTitle,
        message: notificationMessage,
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
    
    // Refund units if complaint submission failed
    const refundKey = `complaint:${queueId}`;
    await refundUnits(queueRow.userId, [{
      actionType: "complaint" as const,
      requestKey: refundKey,
      unitsUsed: COMPLAINT_UNIT_COST,
    }]);
    
    // Notify user of failure
    await createComplaintNotification({
      userId: queueRow.userId,
      trackingId: trackingNumber,
      type: "complaint_failed",
      title: "Complaint Submission Failed",
      message: `Your complaint for tracking ${trackingNumber} failed to submit. Please try again or contact support.`,
    });
    
    return { success: false, status: "ERROR", message, trackingId: trackingNumber };
  }
}
