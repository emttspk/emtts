import { GoogleAuthProvider, signInWithEmailAndPassword, signInWithPopup, signOut } from "firebase/auth";
import { useRef, useState } from "react";
import { ArrowRight, Eye, EyeOff, KeyRound, Mail, SquareArrowOutUpRight } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { api, apiUrl } from "../lib/api";
import { logDevTiming } from "../lib/devTiming";
import { setSession } from "../lib/auth";
import AuthShell from "../components/AuthShell";
import GoogleAuthButton from "../components/GoogleAuthButton";
import AuthInputField from "../components/auth/AuthInputField";
import LoadingOverlay from "../components/LoadingOverlay";
import { auth, firebaseReady } from "../firebase";
import { getFriendlyFirebaseAuthMessage, shouldFallbackToApiLogin, shouldThrottle, shouldUseRedirectAuthFlow } from "../lib/firebaseAuthGuards";
import { trackLogin } from "../lib/analytics";
import SEO from "../components/SEO";
import { buildGoogleAuthCallbackPath } from "../lib/googleAuth";

const AUTH_ACTION_DEBOUNCE_MS = 1200;

export default function Login() {
  const nav = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [passwordLoginLoading, setPasswordLoginLoading] = useState(false);
  const [googleLoginLoading, setGoogleLoginLoading] = useState(false);
  const [postLoginRedirecting, setPostLoginRedirecting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const lastPasswordSubmitAtRef = useRef(0);
  const loginOverlayVisible = passwordLoginLoading || googleLoginLoading || postLoginRedirecting;

  function finalizeLogin(token: string, role: string, refreshToken?: string, method = "password") {
    const sessionStartedAt = performance.now();
    setSession(token, role, refreshToken, { rememberMe });
    trackLogin(method);
    logDevTiming("session_restore", performance.now() - sessionStartedAt, { rememberMe });
    setPostLoginRedirecting(true);
    nav("/dashboard", { state: { postLogin: true, loginAt: Date.now() } });
  }

  async function loginWithFirebaseToken(idToken: string, method = "google") {
    const startedAt = performance.now();
    const data = await api<{ token: string; refreshToken?: string; user: { role: string } }>("/api/auth/firebase-login", {
      method: "POST",
      body: JSON.stringify({ idToken }),
    });
    logDevTiming("google_token_exchange", performance.now() - startedAt);
    finalizeLogin(data.token, data.user.role, data.refreshToken, method);
  }

  async function handleGoogleLogin() {
    if (googleLoginLoading || passwordLoginLoading) return;
    setErr(null);
    if (!firebaseReady || !auth) {
      setErr("Google login is not configured. Please contact support.");
      return;
    }

    setGoogleLoginLoading(true);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });

    if (shouldUseRedirectAuthFlow()) {
      nav(buildGoogleAuthCallbackPath("login"), { replace: true });
      return;
    }

    try {
      const result = await signInWithPopup(auth, provider);
      const idToken = await result.user.getIdToken();
      await loginWithFirebaseToken(idToken);
    } catch (error) {
      const message = getFriendlyFirebaseAuthMessage(error, "Google login failed");
      setErr(message);
      setPostLoginRedirecting(false);
    } finally {
      setGoogleLoginLoading(false);
    }
  }

  return (
    <>
      <SEO
        title="Login | ePost.pk"
        description="Sign in to access Pakistan Post tracking workspace, bulk tracking, label generation, money orders, complaints, and ecommerce shipping tools."
        canonicalPath="/login"
      />
      <AuthShell
        mode="login"
        title="Sign in"
        subtitle="Access your ePost.pk workspace."
      >
      {err ? (
        <div
          className="mb-4 rounded-[22px] border border-red-200/80 bg-red-50/90 px-4 py-3 text-sm font-medium text-red-700 shadow-[0_12px_24px_rgba(239,68,68,0.08)]"
          role="alert"
          aria-live="polite"
        >
          {err}
        </div>
      ) : null}

      <form
        className="space-y-3.5"
        onSubmit={async (e) => {
          e.preventDefault();
          if (passwordLoginLoading || googleLoginLoading) return;
          const now = Date.now();
          if (shouldThrottle(lastPasswordSubmitAtRef.current, AUTH_ACTION_DEBOUNCE_MS, now)) {
            setErr("Please wait a moment before trying again.");
            return;
          }
          lastPasswordSubmitAtRef.current = now;
          setErr(null);
          setPasswordLoginLoading(true);
          const loginStartedAt = performance.now();
          try {
            const isEmail = identifier.includes("@");

            if (isEmail && firebaseReady && auth) {
              try {
                const credential = await signInWithEmailAndPassword(auth, identifier, password);
                await credential.user.reload();
                if (!credential.user.emailVerified) {
                  await signOut(auth);
                  throw new Error("Email is not verified. Please verify your email before logging in.");
                }

                const idToken = await credential.user.getIdToken();
                await loginWithFirebaseToken(idToken, "email_password");
                await signOut(auth);
                return;
              } catch (firebaseError) {
                const message = firebaseError instanceof Error ? firebaseError.message : "Firebase login failed";
                const shouldFallback = shouldFallbackToApiLogin(firebaseError) || /user-not-found|invalid-credential|auth\/invalid-login-credentials/i.test(message);
                if (!shouldFallback) {
                  throw firebaseError;
                }
              }
            }

            const endpoint = "/api/auth/login";
            const fullUrl = apiUrl(endpoint);
            logDevTiming("password_login_begin", 0, { identifier, endpoint: fullUrl });
            const apiStartedAt = performance.now();
            const data = await api<{ token: string; refreshToken?: string; user: { role: string } }>(endpoint, {
              method: "POST",
              body: JSON.stringify({ identifier, password }),
            });
            logDevTiming("password_login_api", performance.now() - apiStartedAt);
            finalizeLogin(data.token, data.user.role, data.refreshToken, "password");
            logDevTiming("password_login_total", performance.now() - loginStartedAt);
          } catch (error) {
            const errorMsg = getFriendlyFirebaseAuthMessage(error, error instanceof Error ? error.message : "Login failed");
            setErr(errorMsg);
            setPostLoginRedirecting(false);
          } finally {
            setPasswordLoginLoading(false);
          }
        }}
      >
        <div className="rounded-2xl border border-[#dce8f5] bg-[linear-gradient(145deg,#f5fbff,#eefaf5)] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#0b7f6d]">Secure login for labels, tracking, complaints, and billing</div>
        <div className="space-y-3">
          <AuthInputField
            label="Username or Email"
            icon={Mail}
            value={identifier}
            onChange={setIdentifier}
            type="text"
            placeholder="username or you@company.com"
            required
            autoComplete="username"
            name="identifier"
          />

          <AuthInputField
            label="Password"
            icon={KeyRound}
            value={password}
            onChange={setPassword}
            type={showPassword ? "text" : "password"}
            placeholder="Enter your password"
            required
            autoComplete="current-password"
            name="password"
            rightAdornment={
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0ea576]"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            }
          />
        </div>

        <div className="flex items-center justify-between gap-3 pt-0.5 text-sm">
          <label className="inline-flex cursor-pointer items-center gap-3 text-slate-600">
            <input
              checked={rememberMe}
              onChange={(event) => setRememberMe(event.target.checked)}
              type="checkbox"
              className="h-4.5 w-4.5 rounded border-slate-300 text-[#0ea576] focus:ring-[#0ea576]/20"
            />
            <span className="font-medium">Remember me</span>
          </label>

          <Link to="/forgot-password" className="font-semibold text-[#0b7f6d] transition hover:text-[#096658]">
            Forgot Password?
          </Link>
        </div>

        <button disabled={passwordLoginLoading || googleLoginLoading} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,#0f1f3a,#0ea576)] px-5 text-[15px] font-semibold text-white shadow-[0_16px_34px_rgba(10,31,68,0.24)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_22px_44px_rgba(10,31,68,0.3)] disabled:cursor-not-allowed disabled:opacity-70">
          <span>{passwordLoginLoading ? "Signing in..." : "Sign in"}</span>
          <span className="flex h-6.5 w-6.5 items-center justify-center rounded-full bg-white/20">
            <ArrowRight className="h-4.5 w-4.5" />
          </span>
        </button>

        <div className="flex items-center gap-3 py-0.5 text-sm text-slate-400">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-200 to-slate-200" />
          <span className="font-medium">or</span>
          <div className="h-px flex-1 bg-gradient-to-l from-transparent via-slate-200 to-slate-200" />
        </div>

        <GoogleAuthButton
          className="mt-1"
          label="Sign in with Google"
          disabled={passwordLoginLoading || googleLoginLoading}
          loading={googleLoginLoading}
          onClick={handleGoogleLogin}
        />

        <div className="pt-0.5 text-center text-sm text-slate-500">
          Don&apos;t have an account?{" "}
          <Link to="/register" className="font-semibold text-[#0b7f6d] transition hover:text-[#096658]">
            Register now
          </Link>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-t border-slate-200/70 pt-2.5 text-sm">
          <Link to="/forgot-username" className="font-medium text-slate-500 transition hover:text-slate-800">
            Forgot Username?
          </Link>
          <Link to="/email-otp-login" className="inline-flex items-center gap-1.5 font-medium text-slate-500 transition hover:text-slate-800">
            Email OTP
            <SquareArrowOutUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </form>

      {loginOverlayVisible ? (
        <LoadingOverlay
          title="Signing you in"
          subtitle="We are verifying your account, restoring the session, and preparing the dashboard."
          progress={postLoginRedirecting ? 100 : passwordLoginLoading || googleLoginLoading ? 58 : 24}
          activeIndex={postLoginRedirecting ? 3 : passwordLoginLoading || googleLoginLoading ? 1 : 0}
          steps={[
            { label: "Authenticate", detail: "Verify your login credentials or Google sign-in." },
            { label: "Load account", detail: "Exchange tokens and restore the authenticated session." },
            { label: "Prepare workspace", detail: "Fetch dashboard data and browser-scoped state." },
            { label: "Open dashboard", detail: "Navigate into the workspace once ready." },
          ]}
        />
      ) : null}
      </AuthShell>
    </>
  );
}
