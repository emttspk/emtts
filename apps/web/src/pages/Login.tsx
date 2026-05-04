import { GoogleAuthProvider, signInWithEmailAndPassword, signInWithPopup, signOut } from "firebase/auth";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, apiUrl } from "../lib/api";
import { setSession } from "../lib/auth";
import AuthShell from "../components/AuthShell";
import { auth, firebaseReady } from "../firebase";

export default function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
      {err ? <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{err}</div> : null}

      <button type="button" className="btn-secondary mb-4 w-full rounded-xl" disabled={loading} onClick={handleGoogleLogin}>
        {loading ? "Please wait..." : "Continue with Google"}
      </button>

      <form
        className="space-y-3.5"
        onSubmit={async (e) => {
          e.preventDefault();
          setErr(null);
          setLoading(true);
          try {
            if (firebaseReady && auth) {
              try {
                const credential = await signInWithEmailAndPassword(auth, email, password);
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
            console.log(`[LOGIN] Attempting login for: ${email}`);
            console.log(`[LOGIN] Request URL: ${fullUrl}`);
            const data = await api<{ token: string; refreshToken?: string; user: { role: string } }>(endpoint, {
              method: "POST",
              body: JSON.stringify({ email, password }),
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
        <label className="block text-sm">
          <div className="mb-2 font-medium text-slate-900">Email</div>
          <input className="field-input focus:ring-emerald-200" value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="you@company.com" required />
        </label>

        <label className="block text-sm">
          <div className="mb-2 font-medium text-slate-900">Password</div>
          <input className="field-input focus:ring-emerald-200" value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="********" required />
        </label>

        <button disabled={loading} className="btn-primary mt-1 w-full rounded-xl">
          {loading ? "Signing in..." : "Login"}
        </button>

        <div className="flex items-center justify-between gap-2 pt-1 text-sm">
          <Link to="/forgot-password" className="font-medium text-slate-500 transition-colors hover:text-slate-700">
            Forgot password
          </Link>
          <Link to="/email-otp" className="font-medium text-slate-500 transition-colors hover:text-slate-700">
            Email OTP
          </Link>
          <Link to="/register" className="font-semibold text-brand transition-colors hover:text-brand-dark">
            Register
          </Link>
        </div>
      </form>
    </AuthShell>
  );
}
