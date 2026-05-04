import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

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

export const auth = app ? getAuth(app) : null;