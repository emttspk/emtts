import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { GoogleAuthProvider, createUserWithEmailAndPassword, sendEmailVerification, signInWithPopup, signOut } from "firebase/auth";
import { api } from "../lib/api";
import { setSession } from "../lib/auth";
import AuthShell from "../components/AuthShell";
import { auth, firebaseReady } from "../firebase";

export default function Register() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const initialEmail = searchParams.get("email") ?? "";

  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function finalizeRegistrationSession(data: { token: string; refreshToken?: string; user: { role: string }; onboardingRequired?: boolean }) {
    setSession(data.token, data.user.role, data.refreshToken);
    nav(data.onboardingRequired ? "/register/profile" : "/dashboard");
  }

  async function handleGoogleRegister() {
    setErr(null);
    setNotice(null);

    if (!firebaseReady || !auth) {
      setErr("Google registration is not configured. Please contact support.");
      return;
    }

    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const result = await signInWithPopup(auth, provider);
      const idToken = await result.user.getIdToken();

      const data = await api<{ token: string; refreshToken?: string; user: { role: string }; onboardingRequired?: boolean }>("/api/auth/firebase-login", {
        method: "POST",
        body: JSON.stringify({ idToken }),
      });

      await finalizeRegistrationSession(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Google registration failed";
      setErr(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      mode="register"
      title="Create account"
      subtitle="Step 1: create your auth identity."
    >
      {err ? <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-800">{err}</div> : null}
      {notice ? <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-800">{notice}</div> : null}

      <button type="button" className="btn-secondary mb-4 w-full rounded-xl" disabled={loading} onClick={handleGoogleRegister}>
        {loading ? "Please wait..." : "Continue with Google"}
      </button>

      <form
        className="space-y-3.5"
        onSubmit={async (e) => {
          e.preventDefault();
          setErr(null);
          setNotice(null);

          const normalizedUsername = username.trim();
          if (!normalizedUsername) {
            setErr("Username is required.");
            return;
          }

          setLoading(true);
          try {
            const data = await api<{ token: string; refreshToken?: string; user: { role: string }; onboardingRequired?: boolean }>("/api/auth/register", {
              method: "POST",
              body: JSON.stringify({
                username: normalizedUsername,
                email,
                password,
              }),
            });

            if (firebaseReady && auth) {
              try {
                const credential = await createUserWithEmailAndPassword(auth, email, password);

                if (!credential.user.emailVerified) {
                  await sendEmailVerification(credential.user);
                  setNotice("Verification email sent. Please verify your email.");
                }
                await signOut(auth);
              } catch (firebaseError) {
                const message = firebaseError instanceof Error ? firebaseError.message : "Failed to send verification email";
                console.warn(`[REGISTER] Firebase verification warning: ${message}`);
              }
            }

            await finalizeRegistrationSession(data);
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : "Registration failed";
            setErr(errorMsg);
          } finally {
            setLoading(false);
          }
        }}
      >
        <div className="space-y-3 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand">Identity</div>
          <label className="block text-sm">
            <div className="mb-2 font-medium text-slate-700">Username *</div>
            <input className="field-input focus:ring-emerald-200" value={username} onChange={(e) => setUsername(e.target.value)} type="text" placeholder="your.username" maxLength={80} required />
          </label>
          <label className="block text-sm">
            <div className="mb-2 font-medium text-slate-700">Email *</div>
            <input className="field-input focus:ring-emerald-200" value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="you@company.com" required />
          </label>
          <label className="block text-sm">
            <div className="mb-2 font-medium text-slate-700">Password *</div>
            <input className="field-input focus:ring-emerald-200" value={password} onChange={(e) => setPassword(e.target.value)} type="password" minLength={8} placeholder="At least 8 characters" required />
          </label>
        </div>

        <button disabled={loading} className="btn-primary w-full rounded-xl">
          {loading ? "Creating identity..." : "Continue to Profile"}
        </button>

        <div className="flex items-center justify-between text-sm text-slate-500">
          <Link to={`/login${email ? `?email=${encodeURIComponent(email)}` : ""}`} className="font-semibold text-brand transition hover:text-brand-dark">
            Login
          </Link>
        </div>
      </form>
    </AuthShell>
  );
}
