import { getRedirectResult } from "firebase/auth";
import { useEffect, useRef, useState } from "react";

import { Link, useNavigate, useSearchParams } from "react-router-dom";
import AuthShell from "../components/AuthShell";
import SEO from "../components/SEO";
import { auth, firebaseReady } from "../firebase";
import { getToken, setSession } from "../lib/auth";
import { trackLogin, trackRegistrationComplete } from "../lib/analytics";
import { getFriendlyFirebaseAuthMessage } from "../lib/firebaseAuthGuards";
import { exchangeGoogleFirebaseToken, getFlow, normalizeNextPath, clearGoogleRedirectStart } from "../lib/googleAuth";

export default function GoogleAuthCallback() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const flow = getFlow(searchParams.get("flow"));
  const nextPath = normalizeNextPath(searchParams.get("next"));
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [status, setStatus] = useState("Completing Google sign-in...");
  const cancelledRef = useRef(false);

  async function completeSession(idToken: string) {
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

    if (!firebaseReady || !auth) {
      setStatus("Google sign-in is not configured.");
      setLoading(false);
      return () => {
        cancelledRef.current = true;
      };
    }

    const existingToken = getToken();
    if (existingToken) {
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
          // Fall through.
        }

        if (cancelled || cancelledRef.current) return;

        if (result) {
          setStatus("Google authentication finished. Saving session...");
          const idToken = await result.user.getIdToken();
          await completeSession(idToken);
          return;
        }

        setErr("Google sign-in now uses a popup. Please sign in from the login or register page.");
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

  return (
    <>
      <SEO
        title={`${flow === "register" ? "Register" : "Login"} | ePost.pk`}
        description="Google sign-in callback for ePost.pk."
        canonicalPath="/auth/callback"
      />
      <AuthShell mode={flow === "register" ? "register" : "login"} title="Google sign-in" subtitle="Legacy callback page" loading={loading}>

        {err ? (
          <div className="mb-4 rounded-[22px] border border-red-200/80 bg-red-50/90 px-4 py-3 text-sm font-medium text-red-700 shadow-[0_12px_24px_rgba(239,68,68,0.08)]" role="alert" aria-live="polite">
            {err}
          </div>
        ) : null}

        <div className="space-y-3 rounded-2xl border border-[#dce8f5] bg-[linear-gradient(145deg,#f4faff,#eefaf5)] px-4 py-4 text-sm text-slate-700">
          <p>{loading ? status : "Google sign-in handled."}</p>
        </div>

        <div className="mt-4">
          <Link
            to={flow === "register" ? "/register" : "/login"}
            className="block text-center text-sm font-semibold text-[#0b7f6d] transition hover:text-[#096658]"
          >
            Go to {flow === "register" ? "register" : "login"}
          </Link>
        </div>
      </AuthShell>
    </>
  );
}
