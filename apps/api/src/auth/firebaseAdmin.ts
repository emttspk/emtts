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

function ensureFirebaseAdmin() {
  if (initialized) return true;
  if (!canInitializeFirebaseAdmin()) return false;

  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: env.FIREBASE_PROJECT_ID,
        clientEmail: env.FIREBASE_CLIENT_EMAIL,
        privateKey: normalizePrivateKey(env.FIREBASE_PRIVATE_KEY),
      }),
    });
  }

  initialized = true;
  return true;
}

export function isFirebaseAdminConfigured() {
  return canInitializeFirebaseAdmin();
}

export async function verifyFirebaseIdToken(idToken: string) {
  if (!ensureFirebaseAdmin()) {
    throw new Error("Firebase Admin is not configured on this server");
  }
  return getAuth().verifyIdToken(idToken, true);
}
