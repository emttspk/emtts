import { useEffect, useRef, useState } from "react";
import { GoogleAuthProvider, getRedirectResult, onAuthStateChanged, signInWithRedirect, type User } from "firebase/auth";

import { Link, useNavigate, useSearchParams } from "react-router-dom";
import AuthShell from "../components/AuthShell";
import SEO from "../components/SEO";
import { auth, firebaseReady, GOOGLE_AUTH_FIREBASE_DIAG_KEY } from "../firebase";
import { getToken, setSession } from "../lib/auth";
import { trackLogin, trackRegistrationComplete } from "../lib/analytics";
import { getFriendlyFirebaseAuthMessage } from "../lib/firebaseAuthGuards";
import { exchangeGoogleFirebaseToken, normalizeNextPath, setGoogleAuthDebug, type GoogleAuthFlow } from "../lib/googleAuth";

const CALLBACK_REDIRECT_DELAY_MS = 1800;
const GOOGLE_REDIRECT_START_KEY = "GOOGLE_REDIRECT_START";

type GoogleRedirectStartState = {
  stage: "entry" | "redirect-started";
  timestamp: string;
  flow: GoogleAuthFlow;
  origin: string;
  authDomain: string | null;
};

function getFlow(value: string | null): GoogleAuthFlow {
  return value === "register" ? "register" : "login";
}

function describeCurrentUser(user: User | null) {
  if (!user) {
    return {
      type: "null",
      keys: [],
      constructorName: null as string | null,
      providerData: [],
      uid: null as string | null,
      email: null as string | null,
    };
  }

  return {
    type: typeof user,
    keys: Object.keys(user as object),
    constructorName: (user as { constructor?: { name?: string } }).constructor?.name ?? null,
    providerData: Array.isArray(user.providerData)
      ? user.providerData.map((provider) => ({
        providerId: provider.providerId ?? null,
        uid: provider.uid ?? null,
        email: provider.email ?? null,
      }))
      : [],
    uid: user.uid ?? null,
    email: user.email ?? null,
  };
}

// Phase 5: Firebase state loss diagnostics
export function captureFirebaseDiagnostics(authInstance: typeof auth, currentUser: User | null = null): Record<string, unknown> {
  const marker = readGoogleRedirectStart();
  const diagnostics: Record<string, unknown> = {
    windowOrigin: typeof window !== "undefined" ? window.location.origin : null,
    authDomain: authInstance?.app?.options?.authDomain ?? null,
    authAppName: authInstance?.app?.name ?? null,
    authCurrentUserExists: Boolean(authInstance?.currentUser),
    authCurrentUserUid: authInstance?.currentUser?.uid ?? null,
    authCurrentUserEmail: authInstance?.currentUser?.email ?? null,
    documentReferrer: typeof document !== "undefined" ? document.referrer ?? null : null,
    redirectMarkerExists: Boolean(marker),
    redirectMarkerStage: marker?.stage ?? null,
    redirectMarkerFlow: marker?.flow ?? null,
    redirectMarkerTimestamp: marker?.timestamp ?? null,
    redirectMarkerAuthDomain: marker?.authDomain ?? null,
    authConstructorName: authInstance?.constructor?.name ?? null,
        initializeAuthUsed: true,
    persistence: "browserLocalPersistence",
    popupRedirectResolverConfigured: true,
    currentTimestamp: new Date().toISOString(),
    currentUserType: typeof currentUser,
    currentUserConstructorName: currentUser?.constructor?.name ?? null,
    currentUserProviderData: currentUser?.providerData?.map((p: { providerId?: string; uid?: string }) => ({
      providerId: p.providerId ?? null,
      uid: p.uid ?? null,
    })) ?? [],
    currentUrl: typeof window !== "undefined" ? window.location.href : null,
    firebaseAppVersion: authInstance?.app && typeof authInstance.app === "object" && "version" in authInstance.app
      ? String((authInstance.app as { version?: string }).version ?? "unknown") : "unknown",
    providerId: (authInstance && typeof authInstance === "object" && "config" in (authInstance as object))
      ? String((authInstance as { config?: { providerId?: string } }).config?.providerId ?? "null") : "null",
  };
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.setItem(GOOGLE_AUTH_FIREBASE_DIAG_KEY, JSON.stringify(diagnostics, null, 2));
    } catch {
      // Ignore storage failures.
    }
  }
  return diagnostics;
}

function readGoogleRedirectStart(): GoogleRedirectStartState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(GOOGLE_REDIRECT_START_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as GoogleRedirectStartState;
  } catch {
    return null;
  }
}

function writeGoogleRedirectStart(flow: GoogleAuthFlow, stage: GoogleRedirectStartState["stage"]) {
  if (typeof window === "undefined") return;
  const state: GoogleRedirectStartState = {
    stage,
    timestamp: new Date().toISOString(),
    flow,
    origin: window.location.href,
    authDomain: auth?.app?.options?.authDomain ?? null,
  };
  try {
    window.sessionStorage.setItem(GOOGLE_REDIRECT_START_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage failures; diagnostics are best-effort.
  }
}

function clearGoogleRedirectStart() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(GOOGLE_REDIRECT_START_KEY);
  } catch {
    // Ignore storage failures.
  }
}

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
  const [status, setStatus] = useState("Preparing Google sign-in...");
  const timerRef = useRef<number | null>(null);
  const cancelledRef = useRef(false);

  async function completeSession(
    idToken: string,
    source: "redirect" | "fallback-current-user",
    identity: { uid?: string | null; email?: string | null } = {},
  ) {
    console.info("[AUTH][google-callback] step=exchange start", {
      flow,
      source,
      tokenExistsBeforeExchange: Boolean(getToken()),
      nextPath,
    });
    setGoogleAuthDebug("firebase-login request", {});

    const data = await exchangeGoogleFirebaseToken(idToken);

    console.info("[AUTH][google-callback] step=exchange response", {
      flow,
      source,
      tokenReceived: Boolean(data?.token),
      refreshTokenReceived: Boolean(data?.refreshToken),
      onboardingRequired: Boolean(data?.onboardingRequired),
      nextPath,
    });

    try {
      if (flow === "register") {
        trackRegistrationComplete("google");
      } else {
        trackLogin("google");
      }
    } catch (error) {
      console.warn("[AUTH][google-callback] step=analytics nonfatal error", {
        flow,
        source,
        message: error instanceof Error ? error.message : String(error),
      });
    }

    setSession(data.token, data.user.role, data.refreshToken);

    console.info("[AUTH][google-callback] step=session saved", {
      flow,
      source,
      tokenExistsAfterSave: Boolean(getToken()),
      redirectTarget: nextPath,
    });
    setGoogleAuthDebug("session save", {
      uid: identity.uid ?? null,
      email: identity.email ?? null,
    });

    if (!cancelledRef.current) {
      setStatus("Session saved. Redirecting...");
      setGoogleAuthDebug("redirect", {
        uid: identity.uid ?? null,
        email: identity.email ?? null,
      });
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
      writeGoogleRedirectStart(flow, "redirect-started");
    } catch {
      // Ignore session storage failures; redirect can still proceed.
    }

    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });

    console.info("[AUTH][google-callback] step=redirect start", {
      flow,
      tokenExistsBeforeRedirect: Boolean(getToken()),
      nextPath,
    });
    setGoogleAuthDebug("redirect", {});

    setStatus("Redirecting to Google...");
    await signInWithRedirect(auth, provider);
  }

  useEffect(() => {
    cancelledRef.current = false;
    console.info("[AUTH][google-callback] step=entered callback", {
      flow,
      nextPath,
      firebaseReady,
      authInstanceExists: !!auth,
    });
    setGoogleAuthDebug("callback entry");

    const redirectMarker = readGoogleRedirectStart();
    // Phase 5: Capture Firebase diagnostics at callback entry
    const phase5Diagnostics = captureFirebaseDiagnostics(auth, auth?.currentUser ?? null);
    console.info("[AUTH][google-callback] step=phase5-firebase-diagnostics", phase5Diagnostics);

    console.info("[AUTH][google-callback] step=redirect marker", {
      flow,
      nextPath,
      markerExists: Boolean(redirectMarker),
      markerTimestamp: redirectMarker?.timestamp ?? null,
      markerFlow: redirectMarker?.flow ?? null,
      markerOrigin: redirectMarker?.origin ?? null,
      markerAuthDomain: redirectMarker?.authDomain ?? null,
      currentUrl: window.location.href,
      authDomain: auth?.app?.options?.authDomain ?? null,
      appName: auth?.app?.name ?? null,
      markerStage: redirectMarker?.stage ?? null,
    });

    if (!firebaseReady || !auth) {
      setErr("Google sign-in is not configured. Please contact support.");
      setLoading(false);
      setGoogleAuthDebug("callback entry", {
        error: "Google sign-in is not configured. Please contact support.",
      });
      return () => {
        cancelledRef.current = true;
      };
    }

    const existingToken = getToken();
    if (existingToken) {
      console.info("[AUTH][google-callback] step=session already exists", {
        flow,
        tokenExists: true,
        nextPath,
      });

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
        console.info("[AUTH][google-callback] DIAGNOSTICS", {
          authInstanceExists: !!auth,
          authAppName: auth?.app?.name,
          authCurrentUserUid: auth?.currentUser?.uid ?? null,
          authCurrentUserEmail: auth?.currentUser?.email ?? null,
          firebaseReady,
          flow,
          nextPath,
          tokenExists: Boolean(getToken()),
        });

        const authInstance = auth;
        console.info("[AUTH][google-callback] step=getRedirectResult start", {
          flow,
          nextPath,
          authInstance: authInstance
            ? {
                constructor: authInstance.constructor?.name,
                appName: authInstance.app?.name,
                hasCurrentUser: !!authInstance.currentUser,
              }
            : null,
        });
        setGoogleAuthDebug("getRedirectResult start");
        let result = null;
        try {
          const isValidAuth = authInstance && typeof authInstance === "object" && "app" in authInstance && "currentUser" in authInstance;
          if (!isValidAuth) {
            throw new Error("Invalid auth instance: auth object is not a valid Firebase Auth instance");
          }
          result = await getRedirectResult(authInstance);
        } catch (error) {
          const errorCode = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
          const isAuthArgumentError = errorCode === "auth/argument-error"
            || (error instanceof Error && error.message.includes("auth/argument-error"))
            || (error instanceof Error && error.message.includes("Invalid auth instance"));

          if (!isAuthArgumentError) {
            throw error;
          }

          console.warn("[AUTH][google-callback] step=redirect result argument error", {
            flow,
            authInstanceExists: !!authInstance,
            authInstanceType: typeof authInstance,
            authInstanceConstructor: authInstance?.constructor?.name,
            authAppName: authInstance?.app?.name,
            firebaseReady,
            nextPath,
            errorMessage: error instanceof Error ? error.message : String(error),
          });
        }
                if (cancelled || cancelledRef.current) return;

        // Phase 5: Capture diagnostics after getRedirectResult resolves
        const phase5RedirectDiagnostics = captureFirebaseDiagnostics(auth, auth?.currentUser ?? null);
        phase5RedirectDiagnostics.getRedirectResultResultType = result === null ? "null" : typeof result;
        phase5RedirectDiagnostics.getRedirectResultHasUser = Boolean(result?.user);
        phase5RedirectDiagnostics.getRedirectResultUserUid = result?.user?.uid ?? null;
        phase5RedirectDiagnostics.getRedirectResultUserEmail = result?.user?.email ?? null;
        phase5RedirectDiagnostics.getRedirectResultOperationType = result?.operationType ?? null;
        console.info("[AUTH][google-callback] step=phase5-redirect-result-diagnostics", phase5RedirectDiagnostics);

        console.info("[AUTH][google-callback] step=redirect result resolved", {
          flow,
          hasResult: Boolean(result),
          tokenExists: Boolean(getToken()),
          nextPath,
        });
        setGoogleAuthDebug("getRedirectResult result", {
          uid: result?.user?.uid ?? null,
          email: result?.user?.email ?? null,
        });

        if (result) {
          setStatus("Google authentication finished. Saving session...");
          console.info("[AUTH][google-callback] step=currentUser exists?", {
            flow,
            source: "redirect",
            currentUserExists: false,
            nextPath,
          });
          const idToken = await result.user.getIdToken();
          console.info("[AUTH][google-callback] step=firebase token ready", {
            flow,
            source: "redirect",
            tokenExists: Boolean(getToken()),
            nextPath,
            currentUserUid: result.user.uid,
            currentUserEmail: result.user.email ?? null,
            tokenGenerated: Boolean(idToken),
          });
          setGoogleAuthDebug("getIdToken success", {
            uid: result.user.uid,
            email: result.user.email ?? null,
          });
          await completeSession(idToken, "redirect", {
            uid: result.user.uid,
            email: result.user.email ?? null,
          });
          return;
        }

        console.info("[AUTH][google-callback] step=currentUser raw diagnostics", describeCurrentUser(auth.currentUser));
        const currentUser = await waitForReadyCurrentUser();
        console.info("[AUTH][google-callback] step=currentUser exists?", {
          flow,
          source: "fallback-current-user",
          currentUserExists: Boolean(currentUser),
          nextPath,
        });
        setGoogleAuthDebug("currentUser detected", {
          uid: currentUser?.uid ?? null,
          email: currentUser?.email ?? null,
        });


                if (currentUser) {
          // Phase 5: Capture diagnostics when fallback currentUser is detected
          const phase5UserDiagnostics = captureFirebaseDiagnostics(auth, currentUser);
          phase5UserDiagnostics.waitForReadyCurrentUserTimeMs = 2500;
          phase5UserDiagnostics.fallbackUserUid = currentUser.uid;
          phase5UserDiagnostics.fallbackUserEmail = currentUser.email ?? null;
          phase5UserDiagnostics.fallbackUserProviderData = currentUser.providerData?.map((p: { providerId?: string; uid?: string }) => ({
            providerId: p.providerId ?? null,
            uid: p.uid ?? null,
          })) ?? [];
          console.info("[AUTH][google-callback] step=phase5-fallback-user-diagnostics", phase5UserDiagnostics);

          console.info("[AUTH][google-callback] step=currentUser uid/email", {
            flow,
            source: "fallback-current-user",
            currentUserUid: currentUser.uid,
            currentUserEmail: currentUser.email ?? null,
            nextPath,
          });
          console.info("[AUTH][google-callback] step=currentUser structure", describeCurrentUser(currentUser));
          setGoogleAuthDebug("currentUser detected", {
            uid: currentUser.uid,
            email: currentUser.email ?? null,
          });
          setStatus("Google authentication finished. Restoring session...");
          console.info("[AUTH][google-callback] step=getIdToken start", {
            flow,
            source: "fallback-current-user",
            currentUserUid: currentUser.uid,
            currentUserEmail: currentUser.email ?? null,
            nextPath,
          });
          setGoogleAuthDebug("getIdToken start", {
            uid: currentUser.uid,
            email: currentUser.email ?? null,
          });
          const idToken = await currentUser.getIdToken(true);
          console.info("[AUTH][google-callback] step=current user token ready", {
            flow,
            source: "fallback-current-user",
            tokenExists: Boolean(getToken()),
            nextPath,
            currentUserUid: currentUser.uid,
            currentUserEmail: currentUser.email ?? null,
            tokenGenerated: Boolean(idToken),
          });
          setGoogleAuthDebug("getIdToken success", {
            uid: currentUser.uid,
            email: currentUser.email ?? null,
          });
          await completeSession(idToken, "fallback-current-user", {
            uid: currentUser.uid,
            email: currentUser.email ?? null,
          });
          return;
        }

        const redirectMarker = readGoogleRedirectStart();
        const alreadyStarted = redirectMarker?.stage === "redirect-started";
        console.info("[AUTH][google-callback] step=check alreadyStarted", {
          alreadyStarted,
          markerExists: Boolean(redirectMarker),
          markerStage: redirectMarker?.stage ?? null,
          markerTimestamp: redirectMarker?.timestamp ?? null,
          markerFlow: redirectMarker?.flow ?? null,
        });

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
            stack: error instanceof Error ? error.stack ?? null : null,
          });
          setGoogleAuthDebug("error", {
            error: error instanceof Error ? error.message : String(error),
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
              clearGoogleRedirectStart();
              setGoogleAuthDebug("redirect-attempt");
              void startRedirect().catch((error) => {
                setErr(getFriendlyFirebaseAuthMessage(error, flow === "register" ? "Google registration failed" : "Google login failed"));
                setLoading(false);
                setGoogleAuthDebug("error", {
                  error: error instanceof Error ? error.message : String(error),
                });
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
