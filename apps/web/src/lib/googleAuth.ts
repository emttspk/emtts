import { apiUrl } from "./api";

export type GoogleAuthFlow = "login" | "register";

export type GoogleAuthDebugState = {
  step: string;
  uid: string | null;
  email: string | null;
  error: string | null;
  timestamp: string;
};

export type GoogleAuthSession = {
  token: string;
  refreshToken?: string;
  user: { role: string };
  onboardingRequired?: boolean;
};

export const GOOGLE_AUTH_DEBUG_KEY = "GOOGLE_AUTH_DEBUG";

export function setGoogleAuthDebug(step: string, payload: { uid?: string | null; email?: string | null; error?: string | null } = {}) {
  if (typeof window === "undefined") return;
  const state: GoogleAuthDebugState = {
    step,
    uid: payload.uid ?? null,
    email: payload.email ?? null,
    error: payload.error ?? null,
    timestamp: new Date().toISOString(),
  };

  try {
    window.sessionStorage.setItem(GOOGLE_AUTH_DEBUG_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage failures; console logs still remain available.
  }

  try {
    window.__GOOGLE_AUTH_DEBUG__ = JSON.parse(window.sessionStorage.getItem(GOOGLE_AUTH_DEBUG_KEY) ?? "null") as GoogleAuthDebugState | null ?? undefined;
  } catch {
    window.__GOOGLE_AUTH_DEBUG__ = state;
  }
}

export function restoreGoogleAuthDebugFromStorage() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(GOOGLE_AUTH_DEBUG_KEY);
    if (!raw) {
      window.__GOOGLE_AUTH_DEBUG__ = undefined;
      return null;
    }
    const parsed = JSON.parse(raw) as GoogleAuthDebugState;
    window.__GOOGLE_AUTH_DEBUG__ = parsed;
    return parsed;
  } catch {
    window.__GOOGLE_AUTH_DEBUG__ = undefined;
    return null;
  }
}

export function clearGoogleAuthDebugStorage() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(GOOGLE_AUTH_DEBUG_KEY);
  } catch {
    // Ignore storage failures.
  }
  window.__GOOGLE_AUTH_DEBUG__ = undefined;
}

export function buildGoogleAuthCallbackPath(flow: GoogleAuthFlow, next = "/dashboard") {
  const safeNext = normalizeNextPath(next);
  const params = new URLSearchParams({ flow, next: safeNext });
  return `/auth/callback?${params.toString()}`;
}

export function normalizeNextPath(next: string | null | undefined, fallback = "/dashboard") {
  const candidate = String(next ?? "").trim();
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//")) {
    return fallback;
  }
  return candidate;
}

export async function exchangeGoogleFirebaseToken(idToken: string) {
  const url = apiUrl("/api/auth/firebase-login");
  console.info("[AUTH][google-callback] step=firebase-login request-sent", {
    url,
    tokenExists: Boolean(idToken),
    tokenPreview: `${idToken.slice(0, 12)}...`,
  });
  setGoogleAuthDebug("firebase-login request", {});

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ idToken }),
    });
  } catch (error) {
    console.error("[AUTH][google-callback] step=firebase-login request-failed", {
      url,
      message: error instanceof Error ? error.message : String(error),
    });
    throw error instanceof Error ? error : new Error(String(error));
  }

  const responseText = await response.text();
  let body: GoogleAuthSession | { error?: string; message?: string } | string;
  try {
    body = JSON.parse(responseText) as GoogleAuthSession | { error?: string; message?: string };
  } catch {
    body = responseText;
  }

  console.info("[AUTH][google-callback] step=firebase-login response", {
    url,
    status: response.status,
    ok: response.ok,
    body,
  });
  setGoogleAuthDebug("firebase-login response", {
    error: response.ok ? null : (typeof body === "string" ? body : body.error ?? body.message ?? null),
  });

  if (!response.ok) {
    const errorMessage =
      typeof body === "string"
        ? body || `Firebase login failed with status ${response.status}`
        : body.error ?? body.message ?? `Firebase login failed with status ${response.status}`;
    throw new Error(errorMessage);
  }

  return body as GoogleAuthSession;
}
