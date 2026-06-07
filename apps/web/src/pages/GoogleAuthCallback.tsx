import { useEffect, useRef, useState } from "react";
import { getRedirectResult, onAuthStateChanged, type User } from "firebase/auth";

import { Link, useNavigate, useSearchParams } from "react-router-dom";
import AuthShell from "../components/AuthShell";
import SEO from "../components/SEO";
import { auth, firebaseReady } from "../firebase";
import { getToken, setSession } from "../lib/auth";
import { trackLogin, trackRegistrationComplete } from "../lib/analytics";
import { getFriendlyFirebaseAuthMessage } from "../lib/firebaseAuthGuards";
import { clearGoogleRedirectStart, exchangeGoogleFirebaseToken, getFlow, normalizeNextPath, readGoogleRedirectStart, type GoogleAuthFlow } from "../lib/googleAuth";

async function waitForReadyCurrentUser(maxWaitMs = 2500) {
  if (!auth) return null;
  const snapshot = auth.currentUser;
  if (snapshot?.uid) return snapshot;

  return await new Promise<User | null>((resolve) => {
    let settled = false;
    let timeoutId: ReturnType<typeof window.setTimeout> | null = null;
    let unsubscribe = () => {};

    const finish = (user: User | null) => {
      if (settled) return;
      settled = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
      unsubscribe();
      resolve(user?.uid ? user : null);
    };

    timeoutId = window.setTimeout(() => {
      finish(auth.currentUser);
    }, maxWaitMs);

    unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user?.uid) {
        finish(user);
      }
    });
  });
}

export default function GoogleAuthCallback() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const flow = getFlow(searchParams.get("flow"));
  const nextPath = normalizeNextPath(searchParams.get("next"));
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [status, setStatus] = useState("Completing Google sign-in...");
  const cancelledRef = useRef(false);

  async function completeSession(
    idToken: string,
    source: "redirect" | "fallback-current-user",
    identity: { uid?: string | null; email?: string | null } = {},
  ) {
    const data = await exchangeGoogleFirebaseToken(idToken);

    try {
      if (flow === "register") {
        trackRegistrationComplete("google");
      } else {
        trackLogin("google");
      }
    } catch {
      // Analytics failure is non-fatal.
    }

    setSession(data.token, data.user.role, data.refreshToken);

    if (!cancelledRef.current) {
      setStatus("Session saved. Redirecting...");
      clearGoogleRedirectStart();
      nav(nextPath, { replace: true });
    }
  }

  useEffect(() => {
    cancelledRef.current = false;

    // Clear stale redirect marker if present (not our flow)
    const marker = readGoogleRedirectStart();
    if (marker && marker.flow !== flow) {
      clearGoogleRedirectStart();
    }

    if (!firebaseReady || !auth) {
      setErr("Google sign-in is not configured. Please contact support.");
      setLoading(false);
      return () => {
        cancelledRef.current = true;
      };
    }

    const existingToken = getToken();
    if (existingToken) {
      setStatus("Session already exists. Redirecting...");
      clearGoogleRedirectStart();
      const timer = window.setTimeout(() => {
        if (!cancelledRef.current) {
          nav(nextPath, { replace: true });
        }
      }, 250);
      setLoading(false);
      return () => {
        cancelledRef.current = true;
        window.clearTimeout(timer);
      };
    }

    let cancelled = false;
    void (async () => {
      try {
        let result = null;
        try {
          result = await getRedirectResult(auth);
        } catch {
          // getRedirectResult may throw on some browsers; fall through to currentUser.
        }

        if (cancelled || cancelledRef.current) return;

        if (result) {
          setStatus("Google authentication finished. Saving session...");
          const idToken = await result.user.getIdToken();
          await completeSession(idToken, "redirect", {
            uid: result.user.uid,
            email: result.user.email ?? null,
          });
          return;
        }

        const currentUser = await waitForReadyCurrentUser();

        if (cancelled || cancelledRef.current) return;

        if (currentUser) {
          setStatus("Google authentication finished. Restoring session...");
          const idToken = await currentUser.getIdToken(true);
          await completeSession(idToken, "fallback-current-user", {
            uid: currentUser.uid,
            email: currentUser.email ?? null,
          });
          return;
        }

        const fallbackMessage = flow === "register"
          ? "Google registration could not be completed. Please try again."
          : "Google sign-in could not be completed. Please try again.";
        setErr(fallbackMessage);
      } catch (error) {
        if (!cancelled && !cancelledRef.current) {
          const fallback = flow === "register" ? "Google registration failed" : "Google login failed";
          setErr(getFriendlyFirebaseAuthMessage(error, fallback));
        }
      } finally {
        if (!cancelled && !cancelledRef.current) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      cancelledRef.current = true;
    };
  }, [flow, nextPath, nav]);

  const title = flow === "register" ? "Complete Google signup" : "Signing you in";
  const subtitle = flow === "register"
    ? "Finalizing your account and restoring your workspace."
    : "Restoring your session and preparing your dashboard.";

  return (
    <>
      <SEO
        title={`${flow === "register" ? "Register" : "Login"} | ePost.pk`}
        description="Google sign-in callback for ePost.pk."
        canonicalPath="/auth/callback"
      />
      <AuthShell mode={flow === "register" ? "register" : "login"} title={title} subtitle={subtitle} loading={loading}>

        {err ? (
          <div className="mb-4 rounded-[22px] border border-red-200/80 bg-red-50/90 px-4 py-3 text-sm font-medium text-red-700 shadow-[0_12px_24px_rgba(239,68,68,0.08)]" role="alert" aria-live="polite">
            {err}
          </div>
        ) : null}

        <div className="space-y-3 rounded-2xl border border-[#dce8f5] bg-[linear-gradient(145deg,#f4faff,#eefaf5)] px-4 py-4 text-sm text-slate-700">
          <p>{loading ? status : "Google authentication finished."}</p>
          {!loading && !err ? (
            <p className="text-slate-500">Redirecting to your workspace...</p>
          ) : null}
        </div>

        {err ? (
          <div className="mt-4">
            <Link
              to={flow === "register" ? "/register" : "/login"}
              className="block text-center text-sm font-semibold text-[#0b7f6d] transition hover:text-[#096658]"
            >
              Back to {flow === "register" ? "register" : "login"}
            </Link>
          </div>
        ) : null}
      </AuthShell>
    </>
  );
}
