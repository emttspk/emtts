import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, apiUrl } from "../lib/api";
import { setSession } from "../lib/auth";
import AuthShell from "../components/AuthShell";

// Contact number: must start with 03 and be exactly 11 digits
function validateContact(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 11) return "Contact number must be 11 digits (e.g. 03012345678).";
  if (!digits.startsWith("03")) return "Contact number must start with 03.";
  return null;
}

export default function Register() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const initialEmail = searchParams.get("email") ?? "";
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [address, setAddress] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [originCity, setOriginCity] = useState("");
  const [contactErr, setContactErr] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const inputClass =
    "w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm outline-none transition focus:border-[#0B5D3B] focus:ring-2 focus:ring-[#0B5D3B]/20 placeholder:text-gray-400";
  const inputErrClass =
    "w-full rounded-lg border border-red-400 bg-red-50 px-3 py-2.5 text-sm text-gray-900 shadow-sm outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-500/20 placeholder:text-gray-400";

  return (
    <AuthShell title="Create your account" subtitle="Free plan — 250 labels/month, tracking & money orders included.">
      <div className="text-xl font-semibold text-gray-900">Get started for free</div>
      <div className="mt-1 text-sm text-gray-500">No credit card required. Set up in minutes.</div>
      {err ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-800">{err}</div> : null}

      <form
        className="mt-5 space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setErr(null);

          const contactError = validateContact(contactNumber);
          if (contactError) {
            setContactErr(contactError);
            return;
          }
          setContactErr(null);

          setLoading(true);
          try {
            const endpoint = "/api/auth/register";
            const fullUrl = apiUrl(endpoint);
            console.log(`[REGISTER] Attempting registration for: ${email}`);
            console.log(`[REGISTER] Request URL: ${fullUrl}`);
            const data = await api<{ token: string; user: { role: string } }>(endpoint, {
              method: "POST",
              body: JSON.stringify({
                email,
                password,
                companyName: companyName || null,
                address: address || null,
                contactNumber: contactNumber || null,
                originCity: originCity || null,
              }),
            });
            console.log(`[REGISTER] Success, received token and user role: ${data.user.role}`);
            setSession(data.token, data.user.role);
            nav("/dashboard");
          } catch (e) {
            const errorMsg = e instanceof Error ? e.message : "Registration failed";
            console.error(`[REGISTER] Error: ${errorMsg}`);
            setErr(errorMsg);
          } finally {
            setLoading(false);
          }
        }}
      >
        {/* Account credentials */}
        <div className="space-y-3">
          <label className="block text-sm">
            <div className="mb-1 font-medium text-gray-700">Email <span className="text-red-500">*</span></div>
            <input
              className={inputClass}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="you@company.com"
              required
            />
          </label>
          <label className="block text-sm">
            <div className="mb-1 font-medium text-gray-700">Password <span className="text-red-500">*</span></div>
            <input
              className={inputClass}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              minLength={8}
              placeholder="At least 8 characters"
              required
            />
          </label>
        </div>

        {/* Sender profile — all required */}
        <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 space-y-3">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#0B5D3B]">Sender Profile</div>

          <label className="block text-sm">
            <div className="mb-1 font-medium text-gray-700">Company Name <span className="text-red-500">*</span></div>
            <input
              className={inputClass}
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              type="text"
              placeholder="Hoja Seeds Ltd."
              maxLength={120}
              required
            />
          </label>

          <label className="block text-sm">
            <div className="mb-1 font-medium text-gray-700">Address <span className="text-red-500">*</span></div>
            <input
              className={inputClass}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              type="text"
              placeholder="123 Business Street, Karachi"
              maxLength={300}
              required
            />
          </label>

          <label className="block text-sm">
            <div className="mb-1 font-medium text-gray-700">City <span className="text-red-500">*</span></div>
            <input
              className={inputClass}
              value={originCity}
              onChange={(e) => setOriginCity(e.target.value)}
              type="text"
              placeholder="Karachi"
              maxLength={80}
              required
            />
          </label>

          <div className="block text-sm">
            <div className="mb-1 font-medium text-gray-700">Contact No <span className="text-red-500">*</span></div>
            <input
              className={contactErr ? inputErrClass : inputClass}
              value={contactNumber}
              onChange={(e) => {
                setContactNumber(e.target.value);
                if (contactErr) setContactErr(validateContact(e.target.value));
              }}
              type="tel"
              placeholder="03012345678"
              maxLength={11}
              required
            />
            {contactErr ? (
              <p className="mt-1 text-xs font-medium text-red-600">{contactErr}</p>
            ) : (
              <p className="mt-1 text-xs text-gray-400">Must start with 03, exactly 11 digits</p>
            )}
          </div>
        </div>

        <button
          disabled={loading}
          className="w-full rounded-xl bg-[#0B5D3B] px-4 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-[#094E32] disabled:opacity-60"
        >
          {loading ? "Creating account…" : "Create Free Account"}
        </button>

        <div className="text-center text-sm text-gray-500">
          Already have an account?{" "}
          <Link
            to={`/login${email ? `?email=${encodeURIComponent(email)}` : ""}`}
            className="font-semibold text-[#0B5D3B] transition hover:text-[#094E32]"
          >
            Sign in
          </Link>
        </div>
      </form>
    </AuthShell>
  );
}
