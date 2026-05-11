import { GoogleAuthProvider, signInWithEmailAndPassword, signInWithPopup, signOut } from "firebase/auth";
import { useState } from "react";
import { ArrowRight, Eye, EyeOff, KeyRound, Mail, SquareArrowOutUpRight } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { api, apiUrl } from "../lib/api";
import { setSession } from "../lib/auth";
import AuthShell from "../components/AuthShell";
import GoogleAuthButton from "../components/GoogleAuthButton";
import AuthInputField from "../components/auth/AuthInputField";
import { auth, firebaseReady } from "../firebase";

export default function Login() {
  const nav = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  async function loginWithFirebaseToken(idToken: string) {
    const data = await api<{ token: string; refreshToken?: string; user: { role: string } }>("/api/auth/firebase-login", {
      method: "POST",
      body: JSON.stringify({ idToken }),
    });
    setSession(data.token, data.user.role, data.refreshToken);
    nav("/dashboard");
  }

  async function handleGoogleLogin() {
    setErr(null);
    if (!firebaseReady || !auth) {
      setErr("Google login is not configured. Please contact support.");
      return;
    }

    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const result = await signInWithPopup(auth, provider);
      const idToken = await result.user.getIdToken();
      await loginWithFirebaseToken(idToken);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Google login failed";
      setErr(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      mode="login"
      title="Sign in"
      subtitle="Access your shipment workspace."
    >
      {err ? (
        <div
          className="mb-5 rounded-[24px] border border-red-200/80 bg-red-50/90 px-4 py-3.5 text-sm font-medium text-red-700 shadow-[0_12px_24px_rgba(239,68,68,0.08)]"
          role="alert"
          aria-live="polite"
        >
          {err}
        </div>
      ) : null}

      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setErr(null);
          setLoading(true);
          try {
            const isEmail = identifier.includes("@");

            if (isEmail && firebaseReady && auth) {
              try {
                const credential = await signInWithEmailAndPassword(auth, identifier, password);
                if (!credential.user.emailVerified) {
                  await signOut(auth);
                  throw new Error("Email is not verified. Please verify your email before logging in.");
                }

                const idToken = await credential.user.getIdToken();
                await loginWithFirebaseToken(idToken);
                await signOut(auth);
                return;
              } catch (firebaseError) {
                const message = firebaseError instanceof Error ? firebaseError.message : "Firebase login failed";
                const shouldFallback = /user-not-found|invalid-credential|auth\/invalid-login-credentials/i.test(message);
                if (!shouldFallback) {
                  throw firebaseError;
                }
              }
            }

            const endpoint = "/api/auth/login";
            const fullUrl = apiUrl(endpoint);
            console.log(`[LOGIN] Attempting login for: ${identifier}`);
            console.log(`[LOGIN] Request URL: ${fullUrl}`);
            const data = await api<{ token: string; refreshToken?: string; user: { role: string } }>(endpoint, {
              method: "POST",
              body: JSON.stringify({ identifier, password }),
            });
            console.log(`[LOGIN] Success, received token and user role: ${data.user.role}`);
            setSession(data.token, data.user.role, data.refreshToken);
            nav("/dashboard");
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : "Login failed";
            console.error(`[LOGIN] Error: ${errorMsg}`);
            setErr(errorMsg);
          } finally {
            setLoading(false);
          }
        }}
      >
        <div className="space-y-3.5">
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
                className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#12B347]"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            }
          />
        </div>

        <div className="flex items-center justify-between gap-3 pt-1 text-sm">
          <label className="inline-flex cursor-pointer items-center gap-3 text-slate-600">
            <input
              checked={rememberMe}
              onChange={(event) => setRememberMe(event.target.checked)}
              type="checkbox"
              className="h-4.5 w-4.5 rounded border-slate-300 text-[#12B347] focus:ring-[#12B347]/20"
            />
            <span className="font-medium">Remember me</span>
          </label>

          <Link to="/forgot-password" className="font-semibold text-[#0F9D58] transition hover:text-[#0b7d46]">
            Forgot Password?
          </Link>
        </div>

        <button disabled={loading} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,#0F9D58,#16C75A)] px-5 text-[15px] font-semibold text-white shadow-[0_16px_34px_rgba(18,179,71,0.26)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_22px_44px_rgba(18,179,71,0.3)] disabled:cursor-not-allowed disabled:opacity-70">
          <span>{loading ? "Signing in..." : "Login"}</span>
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20">
            <ArrowRight className="h-4.5 w-4.5" />
          </span>
        </button>

        <div className="flex items-center gap-3 py-0.5 text-sm text-slate-400">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-200 to-slate-200" />
          <span className="font-medium">or</span>
          <div className="h-px flex-1 bg-gradient-to-l from-transparent via-slate-200 to-slate-200" />
        </div>

        <GoogleAuthButton className="mt-1" label="Sign in with Google" disabled={loading} loading={loading} onClick={handleGoogleLogin} />

        <div className="pt-1 text-center text-sm text-slate-500">
          Don&apos;t have an account?{" "}
          <Link to="/register" className="font-semibold text-[#0F9D58] transition hover:text-[#0b7d46]">
            Register now
          </Link>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t border-slate-200/70 pt-3 text-sm">
          <Link to="/forgot-username" className="font-medium text-slate-500 transition hover:text-slate-800">
            Forgot Username?
          </Link>
          <Link to="/email-otp-login" className="inline-flex items-center gap-1.5 font-medium text-slate-500 transition hover:text-slate-800">
            Email OTP
            <SquareArrowOutUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </form>
    </AuthShell>
  );
}
