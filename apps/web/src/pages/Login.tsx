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
    <AuthShell
      mode="login"
      title="Sign in"
      subtitle="Access your shipment workspace."
    >
      {err ? <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{err}</div> : null}

      <form
        className="space-y-3.5"
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
          <button type="button" className="font-medium text-slate-500 transition-colors hover:text-slate-700" onClick={() => setErr("Password reset will be available soon.")}>
            Forgot password
          </button>
          <Link to="/register" className="font-semibold text-brand transition-colors hover:text-brand-dark">
            Register
          </Link>
        </div>
      </form>
    </AuthShell>
  );
}
