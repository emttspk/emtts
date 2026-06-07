import { useEffect, useState } from "react";
import { GoogleAuthProvider, getRedirectResult, signInWithRedirect } from "firebase/auth";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import AuthShell from "../components/AuthShell";
import SEO from "../components/SEO";
import { auth, firebaseReady } from "../firebase";
import { setSession } from "../lib/auth";
import { trackLogin, trackRegistrationComplete } from "../lib/analytics";
import { getFriendlyFirebaseAuthMessage } from "../lib/firebaseAuthGuards";
import { exchangeGoogleFirebaseToken, normalizeNextPath, type GoogleAuthFlow } from "../lib/googleAuth";

const REDIRECT_STARTED_KEY = "labelgen_google_auth_redirect_started:v1";

function getFlow(value: string | null): GoogleAuthFlow {
  return value === "register" ? "register" : "login";
}

export default function GoogleAuthCallback() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const flow = getFlow(searchParams.get("flow"));
  const nextPath = normalizeNextPath(searchParams.get("next"));
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!firebaseReady || !auth) {
      setErr("Google sign-in is not configured. Please contact support.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        if (import.meta.env.DEV) {
          console.info("[AUTH][google-callback] flow=%s next=%s", flow, nextPath);
        }

        const result = await getRedirectResult(auth);
        if (cancelled) return;

        if (!result) {
          const alreadyStarted = window.sessionStorage.getItem(REDIRECT_STARTED_KEY) === "1";
          if (alreadyStarted) {
            window.sessionStorage.removeItem(REDIRECT_STARTED_KEY);
            setErr("Google sign-in could not be completed on this device. Please try again.");
            return;
          }

          window.sessionStorage.setItem(REDIRECT_STARTED_KEY, "1");
          const provider = new GoogleAuthProvider();
          provider.setCustomParameters({ prompt: "select_account" });
          await signInWithRedirect(auth, provider);
          return;
        }

        window.sessionStorage.removeItem(REDIRECT_STARTED_KEY);
        const idToken = await result.user.getIdToken();
        const data = await exchangeGoogleFirebaseToken(idToken);

        if (flow === "register") {
          trackRegistrationComplete("google");
        } else {
          trackLogin("google");
        }

        setSession(data.token, data.user.role, data.refreshToken);
        nav(nextPath, { replace: true });
      } catch (error) {
        window.sessionStorage.removeItem(REDIRECT_STARTED_KEY);
        if (!cancelled) {
          const fallback = flow === "register" ? "Google registration failed" : "Google login failed";
          setErr(getFriendlyFirebaseAuthMessage(error, fallback));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [flow, nextPath, nav]);

  const title = flow === "register" ? "Complete Google signup" : "Signing you in";
  const subtitle = flow === "register"
    ? "We are finalizing your account and restoring your workspace."
    : "We are restoring your session and preparing your dashboard.";

  return (
    <>
      <SEO
        title={`${flow === "register" ? "Register" : "Login"} | ePost.pk`}
        description="Google sign-in callback for ePost.pk."
        canonicalPath="/auth/callback"
      />
      <AuthShell mode={flow === "register" ? "register" : "login"} title={title} subtitle={subtitle}>
        {err ? (
          <div className="mb-4 rounded-[22px] border border-red-200/80 bg-red-50/90 px-4 py-3 text-sm font-medium text-red-700 shadow-[0_12px_24px_rgba(239,68,68,0.08)]" role="alert" aria-live="polite">
            {err}
          </div>
        ) : null}

        <div className="space-y-3 rounded-2xl border border-[#dce8f5] bg-[linear-gradient(145deg,#f4faff,#eefaf5)] px-4 py-4 text-sm text-slate-700">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#0b7f6d]">
            Google auth callback
          </div>
          <p>{loading ? "Checking your Google account..." : "Google authentication finished."}</p>
          <p className="text-slate-500">
            If this page does not continue automatically, go back to{" "}
            <Link className="font-semibold text-[#0b7f6d] transition hover:text-[#096658]" to={flow === "register" ? "/register" : "/login"}>
              retry Google sign-in
            </Link>.
          </p>
        </div>
      </AuthShell>
    </>
  );
}
