import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { createUserWithEmailAndPassword, sendEmailVerification, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { api, apiUrl } from "../lib/api";
import { setSession } from "../lib/auth";
import AuthShell from "../components/AuthShell";
import { auth, firebaseReady } from "../firebase";

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
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <AuthShell
      mode="register"
      title="Create free account"
      subtitle="Set up account and sender profile."
    >
      {err ? <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-800">{err}</div> : null}
      {notice ? <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-800">{notice}</div> : null}

      <form
        className="space-y-3.5"
        onSubmit={async (e) => {
          e.preventDefault();
          setErr(null);
          setNotice(null);

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
            const data = await api<{ token: string; refreshToken?: string; user: { role: string } }>(endpoint, {
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

            if (firebaseReady && auth) {
              try {
                let credential;
                try {
                  credential = await createUserWithEmailAndPassword(auth, email, password);
                } catch (createError) {
                  const message = createError instanceof Error ? createError.message : "Firebase registration failed";
                  const alreadyExists = /email-already-in-use/i.test(message);
                  if (!alreadyExists) throw createError;
                  credential = await signInWithEmailAndPassword(auth, email, password);
                }

                if (!credential.user.emailVerified) {
                  await sendEmailVerification(credential.user);
                  setNotice("Verification email sent. Please verify your email before next login.");
                }
                await signOut(auth);
              } catch (firebaseError) {
                const message = firebaseError instanceof Error ? firebaseError.message : "Failed to send verification email";
                console.warn(`[REGISTER] Firebase verification warning: ${message}`);
              }
            }

            console.log(`[REGISTER] Success, received token and user role: ${data.user.role}`);
            setSession(data.token, data.user.role, data.refreshToken);
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
        <div className="space-y-3 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand">Account</div>
          <label className="block text-sm">
            <div className="mb-2 font-medium text-slate-700">Email *</div>
            <input className="field-input focus:ring-emerald-200" value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="you@company.com" required />
          </label>
          <label className="block text-sm">
            <div className="mb-2 font-medium text-slate-700">Password *</div>
            <input className="field-input focus:ring-emerald-200" value={password} onChange={(e) => setPassword(e.target.value)} type="password" minLength={8} placeholder="At least 8 characters" required />
          </label>
        </div>

        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand">Sender Profile</div>

          <label className="block text-sm">
            <div className="mb-2 font-medium text-slate-700">Company Name *</div>
            <input className="field-input focus:ring-emerald-200" value={companyName} onChange={(e) => setCompanyName(e.target.value)} type="text" placeholder="Hoja Seeds Ltd." maxLength={120} required />
          </label>

          <label className="block text-sm">
            <div className="mb-2 font-medium text-slate-700">Address *</div>
            <input className="field-input focus:ring-emerald-200" value={address} onChange={(e) => setAddress(e.target.value)} type="text" placeholder="123 Business Street, Karachi" maxLength={300} required />
          </label>

          <label className="block text-sm">
            <div className="mb-2 font-medium text-slate-700">City *</div>
            <input className="field-input focus:ring-emerald-200" value={originCity} onChange={(e) => setOriginCity(e.target.value)} type="text" placeholder="Karachi" maxLength={80} required />
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

        <button disabled={loading} className="btn-primary w-full rounded-xl">
          {loading ? "Creating account..." : "Create Free Account"}
        </button>

        <div className="flex items-center justify-between text-sm text-slate-500">
          <Link to="/" className="font-medium transition hover:text-slate-700">
            Home
          </Link>
          <Link to={`/login${email ? `?email=${encodeURIComponent(email)}` : ""}`} className="font-semibold text-brand transition hover:text-brand-dark">
            Login
          </Link>
        </div>
      </form>
    </AuthShell>
  );
}
