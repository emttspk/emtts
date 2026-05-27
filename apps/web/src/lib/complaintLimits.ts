const UNLIMITED_SENTINEL = 9007199254740991;

function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

export function isUnlimitedComplaintLimit(value: unknown): boolean {
  const parsed = toFiniteNumber(value);
  if (parsed === null) return true;
  if (parsed === Infinity) return true;
  if (parsed >= Number.MAX_SAFE_INTEGER) return true;
  if (parsed >= UNLIMITED_SENTINEL) return true;
  if (parsed >= 1_000_000_000) return true;
  return false;
}

export function formatComplaintLimitValue(value: unknown): string {
  if (isUnlimitedComplaintLimit(value)) return "Unlimited";
  const parsed = toFiniteNumber(value);
  return String(Math.max(0, Math.trunc(parsed ?? 0)).toLocaleString());
}

export function formatComplaintUsage(used: unknown, limit: unknown): string {
  if (isUnlimitedComplaintLimit(limit)) return "Unlimited";
  const safeUsed = Math.max(0, Math.trunc(toFiniteNumber(used) ?? 0));
  return `${safeUsed.toLocaleString()} / ${formatComplaintLimitValue(limit)}`;
}
