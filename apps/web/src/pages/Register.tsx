import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { GoogleAuthProvider, createUserWithEmailAndPassword, sendEmailVerification, signInWithPopup, signOut } from "firebase/auth";
import { api } from "../lib/api";
import { setSession } from "../lib/auth";
import AuthShell from "../components/AuthShell";
import GoogleAuthButton from "../components/GoogleAuthButton";
import SEO from "../components/SEO";
import { auth, firebaseReady } from "../firebase";
import { trackRegistrationComplete } from "../lib/analytics";
import {
  getCooldownRemainingSeconds,
  getFriendlyFirebaseAuthMessage,
  isFirebaseTooManyRequests,
  shouldThrottle,
  shouldUseRedirectAuthFlow,
} from "../lib/firebaseAuthGuards";

const VERIFY_ACTION_DEBOUNCE_MS = 1200;
const RESEND_COOLDOWN_MS = 60 * 1000;
const LOCKOUT_COOLDOWN_MS = 10 * 60 * 1000;

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

  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [usernameSuggestions, setUsernameSuggestions] = useState<string[]>([]);
  const [usernameChecking, setUsernameChecking] = useState(false);
  const [usernameFormatErr, setUsernameFormatErr] = useState<string | null>(null);
  const usernameDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const USERNAME_REGEX = /^[a-zA-Z0-9_]+$/;

  const [pendingVerification, setPendingVerification] = useState(false);
  const [pendingData, setPendingData] = useState<{ token: string; refreshToken?: string; user: { role: string }; onboardingRequired?: boolean } | null>(null);
  const [verifyChecking, setVerifyChecking] = useState(false);
  const [resendPending, setResendPending] = useState(false);
  const [resendCooldownUntil, setResendCooldownUntil] = useState(0);
  const [resendCountdown, setResendCountdown] = useState(0);
  const lastContinueAttemptAtRef = useRef(0);
  const lastResendAttemptAtRef = useRef(0);

  function handleUsernameChange(value: string) {
    setUsername(value);
    setUsernameAvailable(null);
    setUsernameSuggestions([]);
    setUsernameFormatErr(null);
    if (usernameDebounceRef.current) clearTimeout(usernameDebounceRef.current);

    const trimmed = value.trim();
    if (trimmed.includes("@")) {
      setUsernameFormatErr("Username cannot be an email address");
      return;
    }
    if (trimmed.length > 0 && !USERNAME_REGEX.test(trimmed)) {
      setUsernameFormatErr("Username can only contain letters, numbers, and underscores");
      return;
    }
    if (trimmed.length < 3) return;

    usernameDebounceRef.current = setTimeout(async () => {
      setUsernameChecking(true);
      try {
        const res = await fetch(`/api/auth/check-username?username=${encodeURIComponent(value.trim())}`);
        if (res.ok) {
          const data = (await res.json()) as { available: boolean; suggestions?: string[] };
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

  useEffect(() => {
    if (!pendingVerification) {
      setResendCountdown(0);
      return;
    }

    const updateCountdown = () => {
      setResendCountdown(getCooldownRemainingSeconds(resendCooldownUntil));
    };
    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);
    return () => clearInterval(timer);
  }, [pendingVerification, resendCooldownUntil]);

  async function finalizeRegistrationSession(data: { token: string; refreshToken?: string; user: { role: string }; onboardingRequired?: boolean }) {
    setSession(data.token, data.user.role, data.refreshToken);
    nav("/dashboard", { replace: true });
  }

  async function handleGoogleRegister() {
    setErr(null);
    setNotice(null);

    if (!firebaseReady || !auth) {
      setErr("Google registration is not configured. Please contact support.");
      return;
    }

    setLoading(true);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });

    if (shouldUseRedirectAuthFlow()) {
      nav("/auth/callback?flow=register&next=%2Fdashboard", { replace: true });
      return;
    }

    try {
      const result = await signInWithPopup(auth, provider);
      const idToken = await result.user.getIdToken();
      const data = await api<{ token: string; refreshToken?: string; user: { role: string }; onboardingRequired?: boolean }>("/api/auth/firebase-login", {
        method: "POST",
        body: JSON.stringify({ idToken }),
      });

      trackRegistrationComplete("google");
      await finalizeRegistrationSession(data);
    } catch (error) {
      setErr(getFriendlyFirebaseAuthMessage(error, "Google registration failed"));
    } finally {
      setLoading(false);
    }
  }

  async function handleContinueAfterVerify() {
    if (verifyChecking) return;
    const now = Date.now();
    if (shouldThrottle(lastContinueAttemptAtRef.current, VERIFY_ACTION_DEBOUNCE_MS, now)) {
      setNotice("Please wait a moment before checking again.");
      return;
    }
    lastContinueAttemptAtRef.current = now;

    if (!pendingData || !auth) {
      setErr("Your verification session expired. Please log in again.");
      return;
    }

    setVerifyChecking(true);
    setErr(null);
    setNotice(null);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        setErr("Session expired. Please log in again, then complete verification.");
        return;
      }

      await currentUser.reload();
      if (currentUser.emailVerified) {
        await signOut(auth);
        await finalizeRegistrationSession(pendingData);
      } else {
        setErr("Email not yet verified. Please click the link in your inbox, then try again.");
      }
    } catch (error) {
      setErr(getFriendlyFirebaseAuthMessage(error, "Verification check failed"));
    } finally {
      setVerifyChecking(false);
    }
  }

  async function handleResendVerification() {
    if (verifyChecking || resendPending) return;
    const now = Date.now();
    if (resendCooldownUntil > now) {
      setNotice(`Please wait ${getCooldownRemainingSeconds(resendCooldownUntil, now)}s before resending.`);
      return;
    }
    if (shouldThrottle(lastResendAttemptAtRef.current, VERIFY_ACTION_DEBOUNCE_MS, now)) {
      setNotice("Please wait a moment before resending.");
      return;
    }
    lastResendAttemptAtRef.current = now;

    if (!auth?.currentUser) {
      setErr("Session expired. Please log in again to resend verification email.");
      return;
    }

    setResendPending(true);
    setErr(null);
    setNotice(null);
    try {
      await sendEmailVerification(auth.currentUser);
      setNotice("Verification email resent. Check your inbox.");
      setResendCooldownUntil(Date.now() + RESEND_COOLDOWN_MS);
    } catch (error) {
      if (isFirebaseTooManyRequests(error)) {
        setResendCooldownUntil(Date.now() + LOCKOUT_COOLDOWN_MS);
      }
      setErr(getFriendlyFirebaseAuthMessage(error, "Failed to resend verification email"));
    } finally {
      setResendPending(false);
    }
  }

  if (pendingVerification) {
    return (
      <>
        <SEO
          title="Register | ePost.pk"
          description="Create your ePost.pk account for Pakistan Post tracking, bulk tracking, shipping labels, money orders, complaints, and ecommerce shipping tools."
          canonicalPath="/register"
        />
        <AuthShell mode="register" title="Verify your email" subtitle="Check your inbox to activate your account.">
          {err ? <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-800">{err}</div> : null}
          {notice ? <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-800">{notice}</div> : null}

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-700">
            <p className="font-semibold text-slate-900">A verification link was sent to:</p>
            <p className="mt-1 break-all font-medium text-[#0b7f6d]">{email}</p>
            <p className="mt-3 text-slate-600">Click the link in your email, then return here and press <strong>Continue</strong>.</p>
          </div>

          <div className="mt-4 grid gap-3">
            <button type="button" disabled={verifyChecking} className="btn-primary w-full rounded-xl" onClick={handleContinueAfterVerify}>
              {verifyChecking ? "Checking..." : "I've verified - Continue ->"}
            </button>
            <button
              type="button"
              disabled={verifyChecking || resendPending || resendCountdown > 0}
              className="btn-secondary w-full rounded-xl text-sm"
              onClick={handleResendVerification}
            >
              {resendPending
                ? "Sending..."
                : resendCountdown > 0
                  ? `Resend available in ${resendCountdown}s`
                  : "Resend verification email"}
            </button>
            <Link to="/login" className="text-center text-sm font-medium text-[#0b7f6d] transition hover:text-[#096658]">
              Session expired? Go to login
            </Link>
          </div>
        </AuthShell>
      </>
    );
  }

  return (
    <>
      <SEO
        title="Register | ePost.pk"
        description="Create your ePost.pk account for Pakistan Post tracking, bulk tracking, shipping labels, money orders, complaints, and ecommerce shipping tools."
        canonicalPath="/register"
      />
      <AuthShell mode="register" title="Create account" subtitle="Create your ePost.pk workspace in minutes.">
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
            if (normalizedUsername.includes("@")) {
              setErr("Username cannot be an email address.");
              return;
            }
            if (!/^[a-zA-Z0-9_]+$/.test(normalizedUsername)) {
              setErr("Username can only contain letters, numbers, and underscores.");
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

              trackRegistrationComplete("email_password");

              if (firebaseReady && auth) {
                try {
                  const credential = await createUserWithEmailAndPassword(auth, email, password);

                  if (!credential.user.emailVerified) {
                    await sendEmailVerification(credential.user);
                    setResendCooldownUntil(Date.now() + RESEND_COOLDOWN_MS);
                    setPendingData(data);
                    setPendingVerification(true);
                    setLoading(false);
                    return;
                  }
                  await signOut(auth);
                } catch (firebaseError) {
                  const message = getFriendlyFirebaseAuthMessage(firebaseError, "Failed to send verification email");
                  console.warn(`[REGISTER] Firebase verification warning: ${message}`);
                  setPendingData(data);
                  setPendingVerification(true);
                  setErr(message);
                  setLoading(false);
                  return;
                }
              }

              await finalizeRegistrationSession(data);
            } catch (error) {
              setErr(getFriendlyFirebaseAuthMessage(error, "Registration failed"));
            } finally {
              setLoading(false);
            }
          }}
        >
          <div className="rounded-2xl border border-[#dce8f5] bg-[linear-gradient(145deg,#f4faff,#eefaf5)] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#2f7edb]">
            Built for Pakistan Post operations teams
          </div>
          <div className="space-y-3 rounded-2xl border border-[#dce8f5] bg-white/82 p-4 shadow-[0_14px_30px_rgba(10,31,68,0.06)]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#0b7f6d]">Identity</div>
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
              {usernameFormatErr ? <p className="mt-1 text-xs font-medium text-red-600">{usernameFormatErr}</p> : null}
              {!usernameFormatErr && usernameChecking ? <p className="mt-1 text-xs text-slate-400">Checking availability...</p> : null}
              {!usernameFormatErr && !usernameChecking && usernameAvailable === true && username.trim().length >= 3 ? (
                <p className="mt-1 text-xs font-medium text-emerald-600">Username is available</p>
              ) : null}
              {!usernameFormatErr && !usernameChecking && usernameAvailable === false ? (
                <div className="mt-1">
                  <p className="text-xs font-medium text-red-600">Username already taken</p>
                  {usernameSuggestions.length > 0 ? (
                    <p className="mt-0.5 text-xs text-slate-500">
                      Try:{" "}
                      {usernameSuggestions.map((s, i) => (
                        <button key={s} type="button" className="font-medium text-[#0b7f6d] hover:underline" onClick={() => handleUsernameChange(s)}>
                          {s}
                          {i < usernameSuggestions.length - 1 ? ", " : ""}
                        </button>
                      ))}
                    </p>
                  ) : null}
                </div>
              ) : null}
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
            {loading ? "Creating account..." : "Continue"}
          </button>

          <GoogleAuthButton className="w-full" label="Sign up with Google" disabled={loading} loading={loading} onClick={handleGoogleRegister} />

          <div className="flex items-center justify-between text-sm text-slate-500">
            <Link to={`/login${email ? `?email=${encodeURIComponent(email)}` : ""}`} className="font-semibold text-[#0b7f6d] transition hover:text-[#096658]">
              Login
            </Link>
          </div>
        </form>
      </AuthShell>
    </>
  );
}
