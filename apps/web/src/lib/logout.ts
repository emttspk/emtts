import { signOut } from "firebase/auth";
import { api } from "./api";
import { auth, firebaseReady } from "../firebase";
import { clearSession, getRefreshToken } from "./auth";
import { clearTrackingWorkspaceCache } from "./trackingWorkspaceCache";

export async function logoutAndClearSession() {
  const refreshToken = getRefreshToken();

  try {
    await api<{ success: boolean }>("/api/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
    });
  } catch {
    // Continue local cleanup even if logout API call fails.
  }

  try {
    if (firebaseReady && auth?.currentUser) {
      await signOut(auth);
    }
  } catch {
    // Continue local cleanup even if Firebase sign-out fails.
  }

  clearSession();
  clearTrackingWorkspaceCache();
}
