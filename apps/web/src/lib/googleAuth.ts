import { api } from "./api";

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
  return api<GoogleAuthSession>("/api/auth/firebase-login", {
    method: "POST",
    body: JSON.stringify({ idToken }),
  });
}
