import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, apiUrl } from "../lib/api";
import { setSession } from "../lib/auth";
import letterBoxImage from "../assets/letter_box.jpg";

export default function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_14%_10%,rgba(16,185,129,0.18),transparent_30%),linear-gradient(140deg,#f6fbf8_0%,#edf7f2_42%,#f1f5f9_100%)] p-4 sm:p-6 md:p-10">
      <div className="mx-auto grid min-h-[calc(100vh-2rem)] w-full max-w-[1320px] overflow-hidden rounded-[28px] border border-white/70 bg-white/72 shadow-[0_34px_90px_rgba(15,23,42,0.14)] backdrop-blur md:grid-cols-[1.18fr_0.82fr]">
        <section className="relative hidden md:block">
          <img src={letterBoxImage} alt="Pakistan Post letter box" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
          <div className="absolute bottom-10 left-8 right-8">
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300">Epost.pk</div>
            <div className="mt-2 text-3xl font-bold tracking-tight text-white">Dispatch Operations Cloud</div>
            <div className="mt-2 text-sm leading-6 text-slate-200">Real-time tracking, labels, money orders, and complaint workflows in one focused workspace.</div>
          </div>
        </section>

        <section className="flex items-center justify-center p-6 sm:p-10 lg:p-12">
          <div className="w-full max-w-[420px]">
            <div className="text-3xl font-semibold tracking-[-0.02em] text-slate-950">Sign in</div>
            <div className="mt-2 text-sm leading-6 text-slate-600">Continue to your shipment workspace.</div>

            {err ? <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{err}</div> : null}

            <form
              className="mt-6 space-y-4"
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
                <input className="field-input" value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="you@company.com" required />
              </label>

              <label className="block text-sm">
                <div className="mb-2 font-medium text-slate-900">Password</div>
                <input className="field-input" value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="********" required />
              </label>

              <div className="pt-2">
                <button disabled={loading} className="btn-primary w-full">
                  {loading ? "Signing in..." : "Login"}
                </button>
              </div>

              <div className="flex items-center justify-between gap-3 pt-2 text-sm">
                <Link to="/register" className="font-medium text-brand transition-colors hover:text-brand-dark">
                  Create account
                </Link>
                <button type="button" className="font-medium text-slate-500 transition-colors hover:text-slate-700" onClick={() => setErr("Password reset will be available soon.")}>
                  Forgot password
                </button>
              </div>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
}

