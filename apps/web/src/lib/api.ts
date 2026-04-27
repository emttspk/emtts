import { getToken } from "./auth";

const base = (
  (import.meta.env.VITE_API_URL as string | undefined)?.trim()
  || ""
);

function resolveBaseUrl() {
  const trimmed = base.replace(/\/+$/, "");
  if (typeof window === "undefined") return trimmed;

  const host = window.location.hostname;
  const runningLocal = /^(localhost|127\.0\.0\.1)$/i.test(host);

  // In local web runs, default to the API dev port when no explicit env is provided.
  if (!trimmed) {
    if (runningLocal && window.location.port !== "3000") return "http://127.0.0.1:3000";
    return "";
  }

  const envPointsLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(trimmed);

  // Prevent deployed frontend from trying to call localhost API.
  if (!runningLocal && envPointsLocal) return "";
  return trimmed;
}

const resolvedBase = resolveBaseUrl();

// Log API configuration for debugging
console.log(`[API] Base URL configured: "${resolvedBase}" (empty means same-origin requests to /api)`);
console.log(`[API] VITE_API_URL: "${import.meta.env.VITE_API_URL ?? "undefined"}"`);

function networkErrorMessage(url: string) {
  return `Failed to reach API endpoint ${url}. Verify the API server is running and reachable.`;
}

export function apiUrl(path: string) {
  return `${resolvedBase}${path}`;
}

export function buildAuthenticatedApiUrl(path: string) {
  const url = new URL(apiUrl(path), window.location.origin);
  const token = getToken();
  if (token) {
    url.searchParams.set("token", token);
  }
  return url.toString();
}

function getFilenameFromContentDisposition(header: string | null, fallback?: string) {
  const encoded = header?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      return fallback ?? "download";
    }
  }

  const plain = header?.match(/filename="?([^";]+)"?/i)?.[1]?.trim();
  return plain || fallback || "download";
}

export async function triggerBrowserDownload(path: string, filename?: string) {
  const token = getToken();
  const url = apiUrl(path);

  try {
    const res = await fetch(url, {
      headers: token ? { authorization: `Bearer ${token}` } : undefined,
    });
    if (!res.ok) {
      throw new Error(`Download failed with status ${res.status}`);
    }

    const blob = await res.blob();
    const objectUrl = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = getFilenameFromContentDisposition(res.headers.get("content-disposition"), filename);
    link.rel = "noopener";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 1000);
    return;
  } catch {
    const fallbackUrl = buildAuthenticatedApiUrl(path);
    window.open(fallbackUrl, "_blank", "noopener");
  }
}

export async function api<T>(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (!headers.has("content-type") && init.body && typeof init.body === "string") {
    headers.set("content-type", "application/json");
  }
  const token = getToken();
  if (token) headers.set("authorization", `Bearer ${token}`);

  const url = apiUrl(path);
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers });
  } catch {
    throw new Error(networkErrorMessage(url));
  }
  const text = await res.text();
  let body: any;
  try {
    body = JSON.parse(text);
  } catch (parseError) {
    // Log detailed error info when JSON parsing fails
    console.error(`[API] Non-JSON response from ${url}`);
    console.error(`[API] Status: ${res.status} ${res.statusText}`);
    console.error(`[API] Content-Type: ${res.headers.get("content-type")}`);
    console.error(`[API] Response body (first 500 chars): ${text.substring(0, 500)}`);
    throw new Error(`Non-JSON response from ${path}: ${text.substring(0, 200)}`);
  }
  if (!res.ok) throw new Error(body?.error ?? body?.message ?? "Request failed");
  if (path.includes("/api/tracking/track/")) {
    const events = Array.isArray((body as any)?.events) ? (body as any).events : [];
    const first = events[0] ? `${String(events[0]?.date ?? "").trim()} ${String(events[0]?.time ?? "").trim()}`.trim() : "-";
    const last =
      events.length > 0
        ? `${String(events[events.length - 1]?.date ?? "").trim()} ${String(events[events.length - 1]?.time ?? "").trim()}`.trim()
        : "-";
    const statusBefore = String((body as any)?.raw?.status ?? "-").trim() || "-";
    const statusAfter = String((body as any)?.current_status ?? (body as any)?.meta?.final_status ?? (body as any)?.status ?? "-").trim() || "-";
    console.log(
      `[TRACE] stage=FRONTEND_TRACK_API_RECEIVED event_count=${events.length} first_event=${first} last_event=${last} status_before_patch=${statusBefore} status_after_patch=${statusAfter}`,
    );
  }
  return body as T;
}

export async function uploadFile(path: string, file: File, fields?: Record<string, string>) {
  const token = getToken();
  const form = new FormData();
  form.append("file", file);
  if (fields) {
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
  }
  const url = apiUrl(path);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: token ? { authorization: `Bearer ${token}` } : undefined,
      body: form,
    });
  } catch {
    throw new Error(networkErrorMessage(url));
  }
  const text = await res.text();
  let body: any;
  try {
    body = JSON.parse(text);
  } catch (parseError) {
    // Log detailed error info when JSON parsing fails
    console.error(`[API] Non-JSON response from ${url}`);
    console.error(`[API] Status: ${res.status} ${res.statusText}`);
    console.error(`[API] Content-Type: ${res.headers.get("content-type")}`);
    console.error(`[API] Response body (first 500 chars): ${text.substring(0, 500)}`);
    throw new Error(`Non-JSON response from ${path}: ${text.substring(0, 200)}`);
  }
  if (!res.ok) throw new Error(body?.error ?? body?.message ?? "Upload failed");
  return body;
}

export async function apiHealthCheck(timeoutMs = 2000) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  const url = apiUrl("/api/health");
  console.log(`[HEALTH] Checking API health at: ${url}`);
  try {
    const res = await fetch(url, { signal: controller.signal });
    console.log(`[HEALTH] Status: ${res.status} ${res.statusText}`);
    console.log(`[HEALTH] Content-Type: ${res.headers.get("content-type")}`);
    if (!res.ok) {
      console.error(`[HEALTH] API returned error status`);
      throw new Error("API not healthy");
    }
    console.log(`[HEALTH] API is healthy`);
    return true;
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : "Unknown error";
    console.error(`[HEALTH] API check failed: ${errorMsg}`);
    throw new Error("API is offline or unreachable. Verify VITE_API_URL is set correctly.");
  } finally {
    window.clearTimeout(timeout);
  }
}

// Helper function for debugging API connectivity
export function debugApiConfig() {
  const url = apiUrl("/api/auth/login");
  console.group("[DEBUG] API Configuration");
  console.log(`VITE_API_URL: "${import.meta.env.VITE_API_URL ?? "undefined"}"`);
  console.log(`Resolved base: "${resolvedBase}"`);
  console.log(`Sample URL: ${url}`);
  console.log(`Current Origin: ${window.location.origin}`);
  console.log(`API accessible: ${url.startsWith("http") ? "Yes (different origin)" : "No (same origin)"}`);
  console.groupEnd();
  return { base: resolvedBase, sampleUrl: url, origin: window.location.origin };
}

export async function downloadApiFile(path: string) {
  const token = getToken();
  const url = apiUrl(path);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: token ? { authorization: `Bearer ${token}` } : undefined,
    });
  } catch {
    throw new Error(networkErrorMessage(url));
  }

  if (!res.ok) {
    const text = await res.text();
    try {
      const body = JSON.parse(text) as { error?: string; message?: string };
      throw new Error(body.error ?? body.message ?? "Download failed");
    } catch {
      throw new Error(text || "Download failed");
    }
  }

  return res.blob();
}

export async function downloadApiFileWithRetry(path: string, attempts = 1, delayMs = 250) {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await downloadApiFile(path);
    } catch (error) {
      lastError = error;
      if (attempt >= attempts - 1) break;
      await new Promise((resolve) => window.setTimeout(resolve, delayMs));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Download failed");
}
