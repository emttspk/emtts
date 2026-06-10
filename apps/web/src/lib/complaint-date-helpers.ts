export type ComplaintState = "ACTIVE" | "OVERDUE" | "RESOLVED" | "CLOSED" | "REJECTED" | "IN_PROCESS";
export type ComplaintLifecycleState = ComplaintState | "QUEUED" | "PROCESSING" | "RETRY PENDING" | "MANUAL_REVIEW";

export function getTodayStart(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function isDueDateExpired(dueDateTs: number | null): boolean {
  if (dueDateTs == null) return false;
  const todayStart = getTodayStart();
  return dueDateTs < todayStart.getTime();
}

export function isReopenEligible(
  shipmentStatus: string | null | undefined,
  lifecycleState: string | null | undefined,
  lifecycleDueDateTs: number | null,
): boolean {
  const statusUpper = String(shipmentStatus ?? "").trim().toUpperCase();
  const stateUpper = String(lifecycleState ?? "").trim().toUpperCase();
  if (statusUpper !== "PENDING") return false;
  if (["RESOLVED", "CLOSED", "REJECTED"].includes(stateUpper)) return true;
  return isDueDateExpired(lifecycleDueDateTs);
}

export function isComplaintInProcess(lifecycle: { exists: boolean; state: string; active: boolean }): boolean {
  const state = String(lifecycle.state ?? "").trim().toUpperCase();
  return lifecycle.exists && (state === "ACTIVE" || state === "IN PROCESS" || lifecycle.active);
}

export function isQueueStateBlockingReopen(queueStatus: string | null | undefined): boolean {
  const normalized = String(queueStatus ?? "").trim().toUpperCase().replace(/[\-_]+/g, " ");
  return ["QUEUED", "PROCESSING", "RETRY PENDING"].includes(normalized);
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