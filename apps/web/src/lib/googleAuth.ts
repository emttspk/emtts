import { apiUrl } from "./api";

export type GoogleAuthFlow = "login" | "register";

export type GoogleAuthSession = {
  token: string;
  refreshToken?: string;
  user: { role: string };
  onboardingRequired?: boolean;
};

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

  if (!response.ok) {
    const errorMessage =
      typeof body === "string"
        ? body || `Firebase login failed with status ${response.status}`
        : body.error ?? body.message ?? `Firebase login failed with status ${response.status}`;
    throw new Error(errorMessage);
  }

  return body as GoogleAuthSession;
}
