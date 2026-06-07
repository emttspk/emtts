import { initializeApp } from "firebase/app";
import { getAuth, browserLocalPersistence, browserPopupRedirectResolver, indexedDBLocalPersistence, initializeAuth } from "firebase/auth";
import { clearGoogleAuthDebugStorage, GOOGLE_AUTH_DEBUG_KEY, restoreGoogleAuthDebugFromStorage } from "./lib/googleAuth";

declare global {
  interface Window {
    __GOOGLE_AUTH_DEBUG__?: {
      step: string;
      uid: string | null;
      email: string | null;
      error: string | null;
    };
  }
}

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const firebaseConfigValues = Object.values(firebaseConfig);
export const firebaseReady = firebaseConfigValues.every((value) => String(value ?? "").trim().length > 0);
const GOOGLE_REDIRECT_START_KEY = "GOOGLE_REDIRECT_START";

const app = firebaseReady ? initializeApp(firebaseConfig) : null;

if (!firebaseReady) {
  console.warn("[FIREBASE] Missing Firebase web env vars. Firebase auth features are disabled.");
}

if (typeof window !== "undefined") {
  const restoredTrace = restoreGoogleAuthDebugFromStorage();
  if (restoredTrace) {
    console.info("[AUTH][google-callback] step=restore persistent debug", restoredTrace);
  } else {
    try {
      window.__GOOGLE_AUTH_DEBUG__ = undefined;
    } catch {
      // Ignore global assignment failures.
    }
  }

  if (window.location.pathname.startsWith("/dashboard")) {
    clearGoogleAuthDebugStorage();
    try {
      window.sessionStorage.removeItem(GOOGLE_REDIRECT_START_KEY);
    } catch {
      // Ignore storage failures.
    }
  } else if (!window.sessionStorage.getItem(GOOGLE_AUTH_DEBUG_KEY)) {
    // Keep the in-memory debug mirror in sync when no persisted trace exists.
    try {
      window.__GOOGLE_AUTH_DEBUG__ = undefined;
    } catch {
      // Ignore global assignment failures.
    }
  }
}

export const auth = app ? initializeAuth(app, {
  persistence: browserLocalPersistence,
  popupRedirectResolver: browserPopupRedirectResolver,
}) : null;

// Phase 5: Google Auth Firebase state loss diagnostics
export const GOOGLE_AUTH_FIREBASE_DIAG_KEY = "GOOGLE_AUTH_FIREBASE_DIAG";
if (typeof window !== "undefined" && auth) {
  const diagnostics = {
    windowOrigin: window.location.origin,
    authDomain: auth?.app?.options?.authDomain ?? null,
    authAppName: auth?.app?.name ?? null,
    authCurrentUserExists: Boolean(auth?.currentUser),
    authCurrentUserUid: auth?.currentUser?.uid ?? null,
    documentReferrer: document.referrer ?? null,
    initializeAuthUsed: true,
    persistence: "browserLocalPersistence",
    firebaseAppVersion: typeof app === "object" && app !== null && "version" in app
      ? String((app as { version?: string }).version ?? "unknown")
      : "unknown",
    authConstructorName: auth?.constructor?.name ?? null,
    currentTimestamp: new Date().toISOString(),
  };
  try {
    window.sessionStorage.setItem(GOOGLE_AUTH_FIREBASE_DIAG_KEY, JSON.stringify(diagnostics, null, 2));
  } catch {
    // Ignore storage failures.
  }
}
