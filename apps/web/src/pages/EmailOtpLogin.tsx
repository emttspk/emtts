import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { isSignInWithEmailLink, sendSignInLinkToEmail, signInWithEmailLink } from "firebase/auth";
import AuthShell from "../components/AuthShell";
import { auth, firebaseReady } from "../firebase";
import { api } from "../lib/api";
import { setSession } from "../lib/auth";

const EMAIL_KEY = "labelgen_email_otp";
const EMAIL_OTP_URL = "https://www.epost.pk/email-otp-login";

export default function EmailOtpLogin() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const currentUrl = useMemo(() => window.location.href, []);

  useEffect(() => {
    async function completeEmailLinkSignIn() {
      if (!firebaseReady || !auth) return;
      if (!isSignInWithEmailLink(auth, currentUrl)) return;

      const storedEmail = localStorage.getItem(EMAIL_KEY) ?? "";
      if (!storedEmail) {
        setError("Email OTP link opened without a stored email. Request a new link.");
        return;
      }

      setLoading(true);
      try {
        const credential = await signInWithEmailLink(auth, storedEmail, currentUrl);
        localStorage.removeItem(EMAIL_KEY);

        const idToken = await credential.user.getIdToken();
        const data = await api<{ token: string; refreshToken?: string; user: { role: string } }>("/api/auth/firebase-login", {
          method: "POST",
          body: JSON.stringify({ idToken }),
        });
        setSession(data.token, data.user.role, data.refreshToken);
        nav("/dashboard");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Email OTP sign-in failed";
        setError(message);
      } finally {
        setLoading(false);
      }
    }

    completeEmailLinkSignIn();
  }, [currentUrl, nav]);

  return (
    <AuthShell mode="login" title="Email OTP login" subtitle="Get a one-time ePost.pk sign-in link in your email inbox.">
      {error ? <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div> : null}
      {notice ? <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{notice}</div> : null}

      <form
        className="space-y-3.5"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          setNotice(null);

          if (!firebaseReady || !auth) {
            setError("Email OTP is not configured.");
            return;
          }

          setLoading(true);
          try {
            const normalized = email.trim().toLowerCase();
            await sendSignInLinkToEmail(auth, normalized, {
              url: EMAIL_OTP_URL,
              handleCodeInApp: true,
            });
            localStorage.setItem(EMAIL_KEY, normalized);
            setNotice("ePost.pk OTP email link sent. Open it on this same browser to continue.");
          } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to send email OTP link";
            setError(message);
          } finally {
            setLoading(false);
          }
        }}
      >
        <label className="block text-sm">
          <div className="mb-2 font-medium text-slate-900">Email</div>
          <input
            className="field-input focus:ring-emerald-200"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            placeholder="you@company.com"
            required
          />
        </label>

        <button disabled={loading} className="btn-primary mt-1 w-full rounded-xl">
          {loading ? "Sending OTP link..." : "Send email OTP link"}
        </button>

        <div className="flex items-center justify-between pt-1 text-sm">
          <Link to="/login" className="font-medium text-slate-500 transition-colors hover:text-slate-700">
            Password login
          </Link>
          <Link to="/register" className="font-semibold text-brand transition-colors hover:text-brand-dark">
            Register
          </Link>
        </div>
      </form>
    </AuthShell>
  );
}
