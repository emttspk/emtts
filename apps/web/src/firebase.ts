import { initializeApp } from "firebase/app";
import { browserLocalPersistence, browserPopupRedirectResolver, initializeAuth } from "firebase/auth";
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
  } else if (!window.sessionStorage.getItem(GOOGLE_AUTH_DEBUG_KEY)) {
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
