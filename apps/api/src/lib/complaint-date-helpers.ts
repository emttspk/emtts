export type ComplaintState = "ACTIVE" | "OVERDUE" | "RESOLVED" | "CLOSED" | "REJECTED" | "IN_PROCESS";

export type ComplaintLifecycleState = ComplaintState | "QUEUED" | "PROCESSING" | "RETRY_PENDING" | "MANUAL_REVIEW";

export const LEGACY_DUE_DATE_BUG_START = new Date("2026-05-02T00:00:00.000Z").getTime();
export const LEGACY_DUE_DATE_BUG_END = new Date("2026-06-10T15:43:42.000Z").getTime();

export function getTodayStart(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function isDueDateExpired(dueDateTs: number | null, now?: number): boolean {
  if (dueDateTs == null) return false;
  const todayStart = getTodayStart();
  const referenceTime = now ?? todayStart.getTime();
  return dueDateTs < referenceTime;
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

export function isLegacyDueDateInheritedEntry(entry: { createdAt: string; dueDate: string; complaintId: string; attemptNumber: number }): boolean {
  if (entry.attemptNumber <= 1) return false;
  if (!entry.dueDate) return false;
  if (!entry.createdAt) return false;
  const createdTs = new Date(entry.createdAt).getTime();
  if (!Number.isFinite(createdTs)) return false;
  return createdTs >= LEGACY_DUE_DATE_BUG_START && createdTs <= LEGACY_DUE_DATE_BUG_END;
}

export function detectLegacyDueDateReview(entries: { createdAt: string; dueDate: string; complaintId: string; attemptNumber: number }[]): boolean {
  if (entries.length < 2) return false;
  const attempt2plus = entries.filter((e) => e.attemptNumber > 1);
  return attempt2plus.some((entry) => isLegacyDueDateInheritedEntry(entry));
}