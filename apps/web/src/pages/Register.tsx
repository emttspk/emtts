import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, apiUrl } from "../lib/api";
import { setSession } from "../lib/auth";
import AuthShell from "../components/AuthShell";

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
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <AuthShell title="Create your account" subtitle="Start with a Starter plan and generate labels in minutes.">
      <div className="text-xl font-medium text-gray-900">Get started</div>
      <div className="mt-1 text-sm text-gray-600">Create your account and set up your sender profile.</div>
      {err ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-800">{err}</div> : null}

      <form
        className="mt-5 space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setErr(null);
          setLoading(true);
          try {
            const endpoint = "/api/auth/register";
            const fullUrl = apiUrl(endpoint);
            console.log(`[REGISTER] Attempting registration for: ${email}`);
            console.log(`[REGISTER] Request URL: ${fullUrl}`);
            const data = await api<{ token: string; user: { role: string } }>(endpoint, {
              method: "POST",
              body: JSON.stringify({ email, password, companyName: companyName || null, address: address || null, contactNumber: contactNumber || null, originCity: originCity || null }),
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
        <label className="block text-sm">
          <div className="mb-1 font-medium text-gray-900">Email</div>
          <input
            className="w-full rounded-lg border bg-white px-3 py-2 text-sm text-gray-900 shadow-sm outline-none transition-all duration-200 ease-in-out placeholder:text-gray-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            placeholder="you@company.com"
            required
          />
        </label>
        <label className="block text-sm">
          <div className="mb-1 font-medium text-gray-900">Password</div>
          <input
            className="w-full rounded-lg border bg-white px-3 py-2 text-sm text-gray-900 shadow-sm outline-none transition-all duration-200 ease-in-out placeholder:text-gray-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            minLength={8}
            placeholder="At least 8 characters"
            required
          />
        </label>

        <div className="border-t pt-4">
          <div className="mb-3 text-sm font-medium text-gray-900">Sender Profile (optional)</div>
          
          <label className="block text-sm">
            <div className="mb-1 text-sm text-gray-700">Company Name</div>
            <input
              className="w-full rounded-lg border bg-white px-3 py-2 text-sm text-gray-900 shadow-sm outline-none transition-all duration-200 ease-in-out placeholder:text-gray-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              type="text"
              placeholder="Your Company Ltd."
              maxLength={120}
            />
          </label>

          <label className="mt-3 block text-sm">
            <div className="mb-1 text-sm text-gray-700">Address</div>
            <input
              className="w-full rounded-lg border bg-white px-3 py-2 text-sm text-gray-900 shadow-sm outline-none transition-all duration-200 ease-in-out placeholder:text-gray-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              type="text"
              placeholder="123 Business Street"
              maxLength={300}
            />
          </label>

          <label className="mt-3 block text-sm">
            <div className="mb-1 text-sm text-gray-700">Contact Number</div>
            <input
              className="w-full rounded-lg border bg-white px-3 py-2 text-sm text-gray-900 shadow-sm outline-none transition-all duration-200 ease-in-out placeholder:text-gray-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
              value={contactNumber}
              onChange={(e) => setContactNumber(e.target.value)}
              type="tel"
              placeholder="+92-300-1234567"
              maxLength={30}
            />
          </label>

          <label className="mt-3 block text-sm">
            <div className="mb-1 text-sm text-gray-700">City</div>
            <input
              className="w-full rounded-lg border bg-white px-3 py-2 text-sm text-gray-900 shadow-sm outline-none transition-all duration-200 ease-in-out placeholder:text-gray-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
              value={originCity}
              onChange={(e) => setOriginCity(e.target.value)}
              type="text"
              placeholder="Karachi"
              maxLength={80}
            />
          </label>
        </div>

        <button
          disabled={loading}
          className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-md transition-all duration-200 ease-in-out hover:bg-indigo-700 disabled:opacity-60"
        >
          {loading ? "Creating..." : "Create account"}
        </button>

        <div className="text-center text-sm text-gray-600">
          Already have an account? {" "}
          <Link
            to={`/login${email ? `?email=${encodeURIComponent(email)}` : ""}`}
            className="font-medium text-indigo-700 transition-colors hover:text-indigo-800"
          >
            Sign in
          </Link>
        </div>
      </form>
    </AuthShell>
  );
}
