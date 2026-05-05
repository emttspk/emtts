import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import AuthShell from "../components/AuthShell";

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
          <label className="block text-sm">
            <div className="mb-2 font-medium text-slate-900">Email</div>
            <input
              className="field-input focus:ring-emerald-200"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="you@company.com"
              required
              autoComplete="email"
            />
          </label>

          <button disabled={loading} className="btn-primary mt-1 w-full rounded-xl">
            {loading ? "Looking up..." : "Recover Username"}
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
