import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, apiUrl } from "../lib/api";
import { setSession } from "../lib/auth";
import AuthShell from "../components/AuthShell";

const CONTACT_PATTERN = /^03[0-9]{9}$/;

function validateContact(value: string): string | null {
  if (!CONTACT_PATTERN.test(value)) {
    return "Contact No must match 03XXXXXXXXX.";
  }
  return null;
}

function validateCnic(value: string): string | null {
  if (!value) return null;
  const withDashes = /^\d{5}-\d{7}-\d$/;
  const rawDigits = /^\d{13}$/;
  if (!withDashes.test(value) && !rawDigits.test(value)) {
    return "CNIC must be 35202-1234567-1 or 13 digits.";
  }
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
  const [originCity, setOriginCity] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [cnic, setCnic] = useState("");
  const [contactErr, setContactErr] = useState<string | null>(null);
  const [cnicErr, setCnicErr] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <AuthShell title="Create your account" subtitle="Free plan - 250 labels/month, tracking and money orders included.">
      <div className="text-2xl font-semibold text-slate-900">Get started for free</div>
      <div className="mt-2 text-sm leading-6 text-slate-500">No credit card required. Build your sender profile once and start shipping in minutes.</div>
      {err ? <div className="mt-4 rounded-3xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800">{err}</div> : null}

      <form
        className="mt-6 space-y-5"
        onSubmit={async (e) => {
          e.preventDefault();
          setErr(null);

          const contactError = validateContact(contactNumber.trim());
          if (contactError) {
            setContactErr(contactError);
            return;
          }
          setContactErr(null);

          const cnicError = validateCnic(cnic.trim());
          if (cnicError) {
            setCnicErr(cnicError);
            return;
          }
          setCnicErr(null);

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
                cnic: cnic.trim() || null,
              }),
            });
            console.log(`[REGISTER] Success, received token and user role: ${data.user.role}`);
            setSession(data.token, data.user.role);
            nav("/dashboard");
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : "Registration failed";
            console.error(`[REGISTER] Error: ${errorMsg}`);
            setErr(errorMsg);
          } finally {
            setLoading(false);
          }
        }}
      >
        <div className="space-y-3 rounded-[28px] border border-emerald-100 bg-emerald-50/50 p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">Account</div>
          <label className="block text-sm">
            <div className="mb-2 font-medium text-slate-700">Email *</div>
            <input className="field-input" value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="you@company.com" required />
          </label>
          <label className="block text-sm">
            <div className="mb-2 font-medium text-slate-700">Password *</div>
            <input className="field-input" value={password} onChange={(e) => setPassword(e.target.value)} type="password" minLength={8} placeholder="At least 8 characters" required />
          </label>
        </div>

        <div className="space-y-3 rounded-[28px] border border-slate-200 bg-white p-5 shadow-card hover:shadow-cardHover">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">Sender Profile</div>

          <label className="block text-sm">
            <div className="mb-2 font-medium text-slate-700">Company Name *</div>
            <input className="field-input" value={companyName} onChange={(e) => setCompanyName(e.target.value)} type="text" placeholder="Hoja Seeds Ltd." maxLength={120} required />
          </label>

          <label className="block text-sm">
            <div className="mb-2 font-medium text-slate-700">Address *</div>
            <input className="field-input" value={address} onChange={(e) => setAddress(e.target.value)} type="text" placeholder="123 Business Street, Karachi" maxLength={300} required />
          </label>

          <label className="block text-sm">
            <div className="mb-2 font-medium text-slate-700">City *</div>
            <input className="field-input" value={originCity} onChange={(e) => setOriginCity(e.target.value)} type="text" placeholder="Karachi" maxLength={80} required />
          </label>

          <div className="block text-sm">
            <div className="mb-1 font-medium text-slate-700">Contact No *</div>
            <input
              className={contactErr ? "w-full rounded-2xl border border-red-400 bg-red-50 px-4 py-3 text-sm text-slate-900 outline-none focus:border-red-500 focus:ring-4 focus:ring-red-200" : "field-input"}
              value={contactNumber}
              onChange={(e) => {
                setContactNumber(e.target.value);
                if (contactErr) setContactErr(validateContact(e.target.value.trim()));
              }}
              type="tel"
              placeholder="03012345678"
              maxLength={11}
              required
            />
            {contactErr ? <p className="mt-1 text-xs font-medium text-red-600">{contactErr}</p> : <p className="mt-1 text-xs text-slate-400">Format: 03XXXXXXXXX</p>}
          </div>

          <div className="block text-sm">
            <div className="mb-1 font-medium text-slate-700">
              CNIC <span className="text-xs font-normal text-slate-400">(Optional)</span>
            </div>
            <input
              className={cnicErr ? "w-full rounded-2xl border border-red-400 bg-red-50 px-4 py-3 text-sm text-slate-900 outline-none focus:border-red-500 focus:ring-4 focus:ring-red-200" : "field-input"}
              value={cnic}
              onChange={(e) => {
                setCnic(e.target.value);
                if (cnicErr) setCnicErr(validateCnic(e.target.value.trim()));
              }}
              type="text"
              placeholder="35202-1234567-1"
              maxLength={15}
            />
            {cnicErr ? <p className="mt-1 text-xs font-medium text-red-600">{cnicErr}</p> : <p className="mt-1 text-xs text-slate-400">Format: 35202-1234567-1 or 13 digits</p>}
          </div>
        </div>

        <button disabled={loading} className="btn-primary w-full">
          {loading ? "Creating account..." : "Create Free Account"}
        </button>

        <div className="text-center text-sm text-slate-500">
          Already have an account?{" "}
          <Link to={`/login${email ? `?email=${encodeURIComponent(email)}` : ""}`} className="font-semibold text-brand transition hover:text-brand-dark">
            Sign in
          </Link>
        </div>
      </form>
    </AuthShell>
  );
}

