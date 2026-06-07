export function buildScopedCacheKey(baseKey: string, scopeKey?: string | null) {
  const scope = String(scopeKey ?? "").trim();
  return scope ? `${baseKey}:${scope}` : baseKey;
}

export function clearLocalStorageKeysByPrefix(prefixes: string[]) {
  if (typeof window === "undefined") return;

  const uniquePrefixes = prefixes.map((prefix) => String(prefix ?? "").trim()).filter(Boolean);
  if (uniquePrefixes.length === 0) return;

  const keysToRemove: string[] = [];
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (!key) continue;
    if (uniquePrefixes.some((prefix) => key === prefix || key.startsWith(prefix))) {
      keysToRemove.push(key);
    }
  }

  for (const key of keysToRemove) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Best-effort cleanup only.
    }
  }
}
