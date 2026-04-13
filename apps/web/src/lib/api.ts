import { getToken } from "./auth";

const envBase =
  (import.meta.env.VITE_API_BASE as string | undefined) ?? (import.meta.env.VITE_API_URL as string | undefined);
const base = envBase?.trim() || "";

function networkErrorMessage(url: string) {
  return `Failed to reach API endpoint ${url}. Verify the API server is running and reachable.`;
}

export function apiUrl(path: string) {
  return `${base}${path}`;
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
  } catch {
    throw new Error(`Non-JSON response: ${text}`);
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
  } catch {
    throw new Error(`Non-JSON response: ${text}`);
  }
  if (!res.ok) throw new Error(body?.error ?? body?.message ?? "Upload failed");
  return body;
}

export async function apiHealthCheck(timeoutMs = 2000) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(apiUrl("/api/health"), { signal: controller.signal });
    if (!res.ok) throw new Error("API not healthy");
    return true;
  } catch {
    throw new Error("API is offline or unreachable. Start the API on http://localhost:3000 and try again.");
  } finally {
    window.clearTimeout(timeout);
  }
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
