import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { env } from "../config.js";

let initialized = false;

function normalizePrivateKey(value: string | undefined) {
  if (!value) return "";
  return value.replace(/\\n/g, "\n").trim();
}

function canInitializeFirebaseAdmin() {
  return !!(env.FIREBASE_PROJECT_ID && env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY);
}

function getFirebaseWebApiKey() {
  const explicit = String((env as any).FIREBASE_WEB_API_KEY ?? "").trim();
  if (explicit) return explicit;

  // Backward compatibility: some environments incorrectly saved the web API key
  // into FIREBASE_PRIVATE_KEY. Detect and reuse that value as a non-admin fallback.
  const privateKeyValue = String(env.FIREBASE_PRIVATE_KEY ?? "").trim();
  if (privateKeyValue.startsWith("AIza")) return privateKeyValue;

  return "";
}

function ensureFirebaseAdmin() {
  if (initialized) return true;
  if (!canInitializeFirebaseAdmin()) return false;

  try {
    if (!getApps().length) {
      initializeApp({
        credential: cert({
          projectId: env.FIREBASE_PROJECT_ID,
          clientEmail: env.FIREBASE_CLIENT_EMAIL,
          privateKey: normalizePrivateKey(env.FIREBASE_PRIVATE_KEY),
        }),
      });
    }
  } catch {
    return false;
  }

  initialized = true;
  return true;
}

export function isFirebaseAdminConfigured() {
  return canInitializeFirebaseAdmin();
}

export function isFirebaseAuthConfigured() {
  return canInitializeFirebaseAdmin() || !!getFirebaseWebApiKey();
}

export async function verifyFirebaseIdToken(idToken: string) {
  if (ensureFirebaseAdmin()) {
    return getAuth().verifyIdToken(idToken, true);
  }

  const apiKey = getFirebaseWebApiKey();
  if (!apiKey) {
    throw new Error("Firebase Auth is not configured on this server");
  }

  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });

  const body = await response.json().catch(() => ({}));
  const user = Array.isArray(body?.users) ? body.users[0] : null;
  if (!response.ok || !user) {
    throw new Error(body?.error?.message || "Invalid Firebase token");
  }

  const provider = Array.isArray(user.providerUserInfo) && user.providerUserInfo.length > 0
    ? String(user.providerUserInfo[0]?.providerId || "firebase")
    : "firebase";

  return {
    email: String(user.email || ""),
    email_verified: !!user.emailVerified,
    name: user.displayName ?? null,
    firebase: {
      sign_in_provider: provider,
    },
  } as any;
}

export async function generateFirebasePasswordResetLink(email: string, continueUrl: string) {
  if (ensureFirebaseAdmin()) {
    return getAuth().generatePasswordResetLink(email, {
      url: continueUrl,
      handleCodeInApp: false,
    });
  }

  const apiKey = getFirebaseWebApiKey();
  if (!apiKey) {
    throw new Error("Firebase Auth is not configured on this server");
  }

  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requestType: "PASSWORD_RESET",
      email,
      continueUrl,
    }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body?.error?.message || "Failed to create password reset request");
  }

  return "";
}

export async function generateFirebaseEmailSignInLink(email: string, continueUrl: string) {
  if (ensureFirebaseAdmin()) {
    return getAuth().generateSignInWithEmailLink(email, {
      url: continueUrl,
      handleCodeInApp: true,
    });
  }

  const apiKey = getFirebaseWebApiKey();
  if (!apiKey) {
    throw new Error("Firebase Auth is not configured on this server");
  }

  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requestType: "EMAIL_SIGNIN",
      email,
      continueUrl,
      canHandleCodeInApp: true,
    }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body?.error?.message || "Failed to create email sign-in request");
  }

  return "";
}
