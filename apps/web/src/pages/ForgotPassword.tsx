import { useState } from "react";
import { Mail, SendHorizonal } from "lucide-react";
import { Link } from "react-router-dom";
import { sendPasswordResetEmail } from "firebase/auth";
import AuthShell from "../components/AuthShell";
import AuthInputField from "../components/auth/AuthInputField";
import { auth, firebaseReady } from "../firebase";

const PASSWORD_RESET_REDIRECT = "https://www.epost.pk/login";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <AuthShell mode="login" title="Reset password" subtitle="Send a secure ePost.pk reset link to your email.">
      {error ? <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div> : null}
      {notice ? <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{notice}</div> : null}

      <form
        className="space-y-3.5"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          setNotice(null);

          if (!firebaseReady || !auth) {
            setError("Password reset is not configured.");
            return;
          }

          setLoading(true);
          try {
            await sendPasswordResetEmail(auth, email.trim(), {
              url: PASSWORD_RESET_REDIRECT,
              handleCodeInApp: false,
            });
            setNotice("ePost.pk password reset email sent. Please check your inbox.");
          } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to send password reset email";
            setError(message);
          } finally {
            setLoading(false);
          }
        }}
      >
        <AuthInputField
          label="Email"
          icon={Mail}
          value={email}
          onChange={setEmail}
          type="email"
          placeholder="you@company.com"
          required
          autoComplete="email"
          name="email"
        />

        <button disabled={loading} className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,#0F9D58,#16C75A)] px-6 text-base font-semibold text-white shadow-[0_18px_40px_rgba(18,179,71,0.28)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_24px_50px_rgba(18,179,71,0.34)] disabled:cursor-not-allowed disabled:opacity-70">
          <span>{loading ? "Sending..." : "Send reset email"}</span>
          <SendHorizonal className="h-4.5 w-4.5" />
        </button>

        <div className="pt-1 text-sm">
          <Link to="/login" className="font-semibold text-brand transition-colors hover:text-brand-dark">
            Back to login
          </Link>
        </div>
      </form>
    </AuthShell>
  );
}
