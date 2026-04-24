import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, apiUrl } from "../lib/api";
import { setSession } from "../lib/auth";
import AuthShell from "../components/AuthShell";

export default function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <AuthShell title="Sign in" subtitle="Access your workspace to upload orders and download A4-ready PDFs.">
      <div className="text-xl font-semibold text-slate-900">Welcome back</div>
      <div className="mt-1 text-sm text-slate-600">Use the account you created during onboarding.</div>
      {err ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-800">{err}</div> : null}

      <form
        className="mt-5 space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setErr(null);
          setLoading(true);
          try {
            const endpoint = "/api/auth/login";
            const fullUrl = apiUrl(endpoint);
            console.log(`[LOGIN] Attempting login for: ${email}`);
            console.log(`[LOGIN] Request URL: ${fullUrl}`);
            const data = await api<{ token: string; user: { role: string } }>(endpoint, {
              method: "POST",
              body: JSON.stringify({ email, password }),
            });
            console.log(`[LOGIN] Success, received token and user role: ${data.user.role}`);
            setSession(data.token, data.user.role);
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
          <div className="mb-1 font-medium text-slate-900">Email</div>
          <input className="field-input" value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="you@company.com" required />
        </label>
        <label className="block text-sm">
          <div className="mb-1 font-medium text-slate-900">Password</div>
          <input className="field-input" value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="********" required />
        </label>

        <button disabled={loading} className="btn-primary w-full">
          {loading ? "Signing in..." : "Sign in"}
        </button>

        <div className="flex items-center justify-between text-sm">
          <Link to={`/register${email ? `?email=${encodeURIComponent(email)}` : ""}`} className="font-medium text-brand transition-colors hover:text-brand-dark">
            Create account instead
          </Link>
          <span className="text-slate-500">No self-service password reset yet</span>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          If login keeps failing, either your email is not registered in this local database or the password is incorrect. Use{" "}
          <Link to={`/register${email ? `?email=${encodeURIComponent(email)}` : ""}`} className="font-semibold text-amber-950 underline decoration-amber-400 underline-offset-2">
            Create account
          </Link>{" "}
          to register again on this machine.
        </div>
      </form>
    </AuthShell>
  );
}
