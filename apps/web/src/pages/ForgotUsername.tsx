import { useState } from "react";
import { Mail, Search } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import AuthShell from "../components/AuthShell";
import AuthInputField from "../components/auth/AuthInputField";

export default function ForgotUsername() {
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <AuthShell mode="login" title="Recover username" subtitle="Enter your email to retrieve your username.">
      {err ? (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {err}
        </div>
      ) : null}

      {result ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
            {result}
          </div>
          <Link to="/login" className="block text-center text-sm font-semibold text-brand hover:text-brand-dark">
            Back to Login
          </Link>
        </div>
      ) : (
        <form
          className="space-y-3.5"
          onSubmit={async (e) => {
            e.preventDefault();
            setErr(null);
            setLoading(true);
            try {
              const data = await api<{ success: boolean; message: string; username: string | null }>(
                "/api/auth/forgot-username",
                {
                  method: "POST",
                  body: JSON.stringify({ email: email.trim() }),
                }
              );
              setResult(data.message);
            } catch (error) {
              setErr(error instanceof Error ? error.message : "Request failed");
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
            <span>{loading ? "Looking up..." : "Recover Username"}</span>
            <Search className="h-4.5 w-4.5" />
          </button>

          <div className="flex items-center justify-between gap-2 pt-1 text-sm">
            <Link to="/login" className="font-medium text-slate-500 transition-colors hover:text-slate-700">
              Back to Login
            </Link>
            <Link to="/forgot-password" className="font-medium text-slate-500 transition-colors hover:text-slate-700">
              Forgot Password?
            </Link>
          </div>
        </form>
      )}
    </AuthShell>
  );
}
