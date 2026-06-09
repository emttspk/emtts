export type ComplaintLifecycleCardInput = {
  exists: boolean;
  active: boolean;
  complaintId: string;
  dueDateText: string;
  dueDateTs: number | null;
  state: string;
  stateLabel: string;
  message: string;
  complaintCount: number;
  latestAttempt: number;
  previousComplaintReference: string;
};

export type ComplaintQueueCardInput = {
  id: string;
  trackingId: string;
  complaintStatus: string;
  complaintId: string | null;
  dueDate: string | null;
  nextRetryAt: string | null;
  retryCount: number;
  updatedAt: string;
};

function normalizeStatus(input: string | null | undefined): string {
  return String(input ?? "").trim().toUpperCase();
}

export function normalizeQueueStatusLabel(raw: string | null | undefined): "QUEUED" | "PROCESSING" | "ACTIVE" | "RETRY PENDING" | "RESOLVED" | "MANUAL REVIEW" | "DUPLICATE" | "SUBMITTED" | "OVERDUE" {
  const token = String(raw ?? "").trim().toUpperCase().replace(/[\-_]+/g, " ");
  if (!token) return "ACTIVE";
  if (token === "RETRYING" || token === "RETRY PENDING") return "RETRY PENDING";
  if (token === "QUEUED") return "QUEUED";
  if (token === "PROCESSING") return "PROCESSING";
  if (token === "MANUAL REVIEW") return "MANUAL REVIEW";
  if (token === "DUPLICATE") return "DUPLICATE";
  if (token === "SUBMITTED") return "SUBMITTED";
  if (token === "RESOLVED" || token === "CLOSED") return "RESOLVED";
  return "ACTIVE";
}

export function resolveComplaintCardState(
  lifecycle: ComplaintLifecycleCardInput,
  shipmentStatus: string | null | undefined,
  queueSnapshot: ComplaintQueueCardInput | undefined,
) {
  const shipmentPending = normalizeStatus(shipmentStatus) === "PENDING";
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const queueState = normalizeQueueStatusLabel(queueSnapshot?.complaintStatus);
  const lifecycleResolved = ["RESOLVED", "CLOSED", "REJECTED"].includes(String(lifecycle.state ?? "").toUpperCase());
  const hasComplaintId = Boolean(String(lifecycle.complaintId ?? "").trim() || String(queueSnapshot?.complaintId ?? "").trim());
  const hasDueDate = lifecycle.dueDateTs != null || Boolean(String(queueSnapshot?.dueDate ?? "").trim());
  const queueSubmitDone = queueState === "SUBMITTED" || queueState === "DUPLICATE";

  if (hasComplaintId && (hasDueDate || queueSubmitDone)) {
    if (lifecycleResolved && !shipmentPending) return "RESOLVED";
    return "ACTIVE";
  }

  if (shipmentPending && lifecycleResolved) {
    if (queueState === "PROCESSING") return "PROCESSING";
    if (queueState === "RETRY PENDING") return "RETRY PENDING";
    if (queueState === "MANUAL REVIEW") return "MANUAL REVIEW";
    const dueExpired = lifecycle.dueDateTs != null && lifecycle.dueDateTs < todayStart.getTime();
    return dueExpired ? "OVERDUE" : "ACTIVE";
  }

  if (lifecycleResolved) return "RESOLVED";
  if (hasComplaintId || queueSubmitDone) return "ACTIVE";
  if (queueState === "PROCESSING") return "PROCESSING";
  if (queueState === "QUEUED") return "QUEUED";
  if (queueState === "RETRY PENDING") return "RETRY PENDING";
  if (queueState === "MANUAL REVIEW") return "MANUAL REVIEW";
  if (lifecycle.exists) return lifecycle.stateLabel || "ACTIVE";
  return "";
}
