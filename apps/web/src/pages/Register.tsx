import { useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { GoogleAuthProvider, createUserWithEmailAndPassword, sendEmailVerification, signInWithPopup, signOut } from "firebase/auth";
import { api } from "../lib/api";
import { setSession } from "../lib/auth";
import AuthShell from "../components/AuthShell";
import GoogleAuthButton from "../components/GoogleAuthButton";
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

  // Username availability
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [usernameSuggestions, setUsernameSuggestions] = useState<string[]>([]);
  const [usernameChecking, setUsernameChecking] = useState(false);

  // Debounced username check
  const usernameDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleUsernameChange(value: string) {
    setUsername(value);
    setUsernameAvailable(null);
    setUsernameSuggestions([]);
    if (usernameDebounceRef.current) clearTimeout(usernameDebounceRef.current);
    if (value.trim().length < 3) return;
    usernameDebounceRef.current = setTimeout(async () => {
      setUsernameChecking(true);
      try {
        const res = await fetch(`/api/auth/check-username?username=${encodeURIComponent(value.trim())}`);
        if (res.ok) {
          const data = await res.json() as { available: boolean; suggestions?: string[] };
          setUsernameAvailable(data.available);
          setUsernameSuggestions(data.suggestions ?? []);
        }
      } catch {
        // silently ignore availability check errors
      } finally {
        setUsernameChecking(false);
      }
    }, 400);
  }

  // Pending email verification state
  const [pendingVerification, setPendingVerification] = useState(false);
  const [pendingData, setPendingData] = useState<{ token: string; refreshToken?: string; user: { role: string }; onboardingRequired?: boolean } | null>(null);
  const [verifyChecking, setVerifyChecking] = useState(false);

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

      // Google accounts are always verified — proceed directly
      await finalizeRegistrationSession(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Google registration failed";
      setErr(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleContinueAfterVerify() {
    if (!pendingData || !auth) return;
    setVerifyChecking(true);
    setErr(null);
    try {
      // Reload the Firebase user to pick up latest emailVerified state
      await auth.currentUser?.reload();
      if (auth.currentUser?.emailVerified) {
        await signOut(auth);
        await finalizeRegistrationSession(pendingData);
      } else {
        setErr("Email not yet verified. Please click the link in your inbox, then try again.");
      }
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Verification check failed");
    } finally {
      setVerifyChecking(false);
    }
  }

  async function handleResendVerification() {
    if (!auth?.currentUser) return;
    setErr(null);
    try {
      await sendEmailVerification(auth.currentUser);
      setNotice("Verification email resent. Check your inbox.");
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Failed to resend verification email");
    }
  }

  // Pending verification screen
  if (pendingVerification) {
    return (
      <AuthShell mode="register" title="Verify your email" subtitle="Check your inbox to activate your account.">
        {err ? <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-800">{err}</div> : null}
        {notice ? <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-800">{notice}</div> : null}

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-700">
          <p className="font-semibold text-slate-900">A verification link was sent to:</p>
          <p className="mt-1 font-medium text-brand">{email}</p>
          <p className="mt-3 text-slate-600">Click the link in your email, then return here and press <strong>Continue</strong>.</p>
        </div>

        <div className="mt-4 grid gap-3">
          <button
            type="button"
            disabled={verifyChecking}
            className="btn-primary w-full rounded-xl"
            onClick={handleContinueAfterVerify}
          >
            {verifyChecking ? "Checking..." : "I've verified — Continue →"}
          </button>
          <button
            type="button"
            disabled={verifyChecking}
            className="btn-secondary w-full rounded-xl text-sm"
            onClick={handleResendVerification}
          >
            Resend verification email
          </button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      mode="register"
      title="Create account"
      subtitle="Enter your details to get started."
    >
      {err ? <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-800">{err}</div> : null}
      {notice ? <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-800">{notice}</div> : null}

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
          if (usernameAvailable === false) {
            setErr("Please choose an available username before continuing.");
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
                  // Block navigation — show verify email screen
                  setPendingData(data);
                  setPendingVerification(true);
                  setLoading(false);
                  return;
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
            <input
              className="field-input focus:ring-emerald-200"
              value={username}
              onChange={(e) => handleUsernameChange(e.target.value)}
              type="text"
              placeholder="your.username"
              maxLength={80}
              required
            />
            {usernameChecking && (
              <p className="mt-1 text-xs text-slate-400">Checking availability...</p>
            )}
            {!usernameChecking && usernameAvailable === true && username.trim().length >= 3 && (
              <p className="mt-1 text-xs font-medium text-emerald-600">Username is available</p>
            )}
            {!usernameChecking && usernameAvailable === false && (
              <div className="mt-1">
                <p className="text-xs font-medium text-red-600">Username already taken</p>
                {usernameSuggestions.length > 0 && (
                  <p className="mt-0.5 text-xs text-slate-500">
                    Try:{" "}
                    {usernameSuggestions.map((s, i) => (
                      <button
                        key={s}
                        type="button"
                        className="font-medium text-brand hover:underline"
                        onClick={() => handleUsernameChange(s)}
                      >
                        {s}{i < usernameSuggestions.length - 1 ? ", " : ""}
                      </button>
                    ))}
                  </p>
                )}
              </div>
            )}
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

        <GoogleAuthButton className="w-full" label="Sign up with Google" disabled={loading} loading={loading} onClick={handleGoogleRegister} />

        <div className="flex items-center justify-between text-sm text-slate-500">
          <Link to={`/login${email ? `?email=${encodeURIComponent(email)}` : ""}`} className="font-semibold text-brand transition hover:text-brand-dark">
            Login
          </Link>
        </div>
      </form>
    </AuthShell>
  );
}
