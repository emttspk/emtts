import { useEffect, useRef, useState } from "react";
import { GoogleAuthProvider, getRedirectResult, signInWithRedirect } from "firebase/auth";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import AuthShell from "../components/AuthShell";
import SEO from "../components/SEO";
import { auth, firebaseReady } from "../firebase";
import { getToken, setSession } from "../lib/auth";
import { trackLogin, trackRegistrationComplete } from "../lib/analytics";
import { getFriendlyFirebaseAuthMessage } from "../lib/firebaseAuthGuards";
import { exchangeGoogleFirebaseToken, normalizeNextPath, type GoogleAuthFlow } from "../lib/googleAuth";

const REDIRECT_STARTED_KEY = "labelgen_google_auth_redirect_started:v1";
const CALLBACK_REDIRECT_DELAY_MS = 1800;

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
  const [status, setStatus] = useState("Preparing Google sign-in...");
  const timerRef = useRef<number | null>(null);
  const cancelledRef = useRef(false);

  async function completeSession(idToken: string, source: "redirect" | "fallback-current-user") {
    if (import.meta.env.DEV) {
      console.info("[AUTH][google-callback] step=exchange start", {
        flow,
        source,
        tokenExistsBeforeExchange: Boolean(getToken()),
        nextPath,
      });
    }

    const data = await exchangeGoogleFirebaseToken(idToken);

    if (import.meta.env.DEV) {
      console.info("[AUTH][google-callback] step=exchange response", {
        flow,
        source,
        tokenReceived: Boolean(data?.token),
        refreshTokenReceived: Boolean(data?.refreshToken),
        onboardingRequired: Boolean(data?.onboardingRequired),
        nextPath,
      });
    }

    if (flow === "register") {
      trackRegistrationComplete("google");
    } else {
      trackLogin("google");
    }

    setSession(data.token, data.user.role, data.refreshToken);

    if (import.meta.env.DEV) {
      console.info("[AUTH][google-callback] step=session saved", {
        flow,
        source,
        tokenExistsAfterSave: Boolean(getToken()),
        redirectTarget: nextPath,
      });
    }

    if (!cancelledRef.current) {
      setStatus("Session saved. Redirecting...");
      nav(nextPath, { replace: true });
    }
  }

  async function startRedirect() {
    if (!firebaseReady || !auth) {
      setErr("Google sign-in is not configured. Please contact support.");
      setLoading(false);
      return;
    }

    try {
      window.sessionStorage.setItem(REDIRECT_STARTED_KEY, "1");
    } catch {
      // Ignore session storage failures; redirect can still proceed.
    }

    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });

    if (import.meta.env.DEV) {
      console.info("[AUTH][google-callback] step=redirect start", {
        flow,
        tokenExistsBeforeRedirect: Boolean(getToken()),
        nextPath,
      });
    }

    setStatus("Redirecting to Google...");
    await signInWithRedirect(auth, provider);
  }

  useEffect(() => {
    cancelledRef.current = false;

    if (!firebaseReady || !auth) {
      setErr("Google sign-in is not configured. Please contact support.");
      setLoading(false);
      return () => {
        cancelledRef.current = true;
      };
    }

    const existingToken = getToken();
    if (existingToken) {
      if (import.meta.env.DEV) {
        console.info("[AUTH][google-callback] step=session already exists", {
          flow,
          tokenExists: true,
          nextPath,
        });
      }

      setStatus("Session already exists. Redirecting...");
      timerRef.current = window.setTimeout(() => {
        if (!cancelledRef.current) {
          nav(nextPath, { replace: true });
        }
      }, 250);

      setLoading(false);
      return () => {
        cancelledRef.current = true;
        if (timerRef.current) window.clearTimeout(timerRef.current);
      };
    }

    let cancelled = false;
    void (async () => {
      try {
        if (import.meta.env.DEV) {
          console.info("[AUTH][google-callback] step=read redirect result", {
            flow,
            tokenExists: Boolean(getToken()),
            nextPath,
          });
        }
        
        console.info("[AUTH][google-callback] DIAGNOSTICS", {
          authInstanceExists: !!auth,
          authAppName: auth?.app?.name,
          firebaseReady
        });

        const result = await getRedirectResult(auth!);
        if (cancelled || cancelledRef.current) return;

        if (import.meta.env.DEV) {
          console.info("[AUTH][google-callback] step=redirect result resolved", {
            flow,
            hasResult: Boolean(result),
            tokenExists: Boolean(getToken()),
            nextPath,
          });
        }

        if (result) {
          setStatus("Google authentication finished. Saving session...");
          const idToken = await result.user.getIdToken();
          console.info("[AUTH][google-callback] step=firebase token ready", {
            flow,
            source: "redirect",
            tokenExists: Boolean(getToken()),
            nextPath,
          });
          await completeSession(idToken, "redirect");
          return;
        }

        const currentUser = auth.currentUser;
        if (currentUser) {
          setStatus("Google authentication finished. Restoring session...");
          const idToken = await currentUser.getIdToken(true);
          console.info("[AUTH][google-callback] step=current user token ready", {
            flow,
            source: "fallback-current-user",
            tokenExists: Boolean(getToken()),
            nextPath,
          });
          await completeSession(idToken, "fallback-current-user");
          return;
        }

        const alreadyStarted = (() => {
          try {
            return window.sessionStorage.getItem(REDIRECT_STARTED_KEY) === "1";
          } catch {
            return false;
          }
        })();
        console.info("[AUTH][google-callback] step=check alreadyStarted", { alreadyStarted });

        if (!alreadyStarted) {
          await startRedirect();
          return;
        }

        setStatus("Google auth returned without a session. Showing recovery options.");
        setErr("Google sign-in could not be completed on this device. Please try again.");
      } catch (error) {
        if (!cancelled && !cancelledRef.current) {
          const fallback = flow === "register" ? "Google registration failed" : "Google login failed";
          setErr(getFriendlyFirebaseAuthMessage(error, fallback));
          console.error("[AUTH][google-callback] step=error", {
            flow,
            tokenExists: Boolean(getToken()),
            nextPath,
            message: error instanceof Error ? error.message : String(error),
          });
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
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, [flow, nextPath, nav]);

  const title = flow === "register" ? "Complete Google signup" : "Signing you in";
  const subtitle = flow === "register"
    ? "We are finalizing your account and restoring your workspace."
    : "We are restoring your session and preparing your dashboard.";

  const canContinue = Boolean(getToken());

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
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#0b7f6d]">
            Google auth callback
          </div>
          <p>{loading ? status : "Google authentication finished."}</p>
          <p className="text-slate-500">
            If this page does not continue automatically, use the recovery buttons below.
          </p>
        </div>

        <div className="mt-4 grid gap-3">
          <button
            type="button"
            className="btn-primary w-full rounded-xl"
            disabled={loading}
            onClick={() => {
              setErr(null);
              setLoading(true);
              void startRedirect().catch((error) => {
                setErr(getFriendlyFirebaseAuthMessage(error, flow === "register" ? "Google registration failed" : "Google login failed"));
                setLoading(false);
              });
            }}
          >
            Retry Google sign-in
          </button>

          <button
            type="button"
            className="btn-secondary w-full rounded-xl text-sm"
            disabled={!canContinue}
            onClick={() => nav(nextPath, { replace: true })}
          >
            Continue to Dashboard
          </button>

          <Link
            to={flow === "register" ? "/register" : "/login"}
            className="text-center text-sm font-semibold text-[#0b7f6d] transition hover:text-[#096658]"
          >
            Back to {flow === "register" ? "register" : "login"}
          </Link>
        </div>
      </AuthShell>
    </>
  );
}
