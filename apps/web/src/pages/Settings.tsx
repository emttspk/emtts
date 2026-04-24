import { useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import Card from "../components/Card";
import { clearSession } from "../lib/auth";
import { api } from "../lib/api";
import type { MeResponse } from "../lib/types";

type ShellCtx = { me: MeResponse | null; refreshMe: () => Promise<void> };

export default function Settings() {
  const nav = useNavigate();
  const { me, refreshMe } = useOutletContext<ShellCtx>();

  const [companyName, setCompanyName] = useState(me?.user.companyName ?? "");
  const [address, setAddress] = useState(me?.user.address ?? "");
  const [contactNumber, setContactNumber] = useState(me?.user.contactNumber ?? "");
  const [cnic, setCnic] = useState((me?.user as { cnic?: string | null } | null)?.cnic ?? "");
  const [originCity, setOriginCity] = useState(me?.user.originCity ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);

    const cnicTrimmed = cnic.trim();
    const cnicPattern = /^\d{5}-\d{7}-\d$/;
    const cnicDigitsPattern = /^\d{13}$/;
    if (cnicTrimmed && !cnicPattern.test(cnicTrimmed) && !cnicDigitsPattern.test(cnicTrimmed)) {
      setError("CNIC must be 35202-1234567-1 or 13 digits.");
      setSaving(false);
      return;
    }

    try {
      await api("/api/me", {
        method: "PATCH",
        body: JSON.stringify({
          companyName: companyName || null,
          address: address || null,
          contactNumber: contactNumber || null,
          cnic: cnicTrimmed || null,
          originCity: originCity || null,
        }),
      });
      await refreshMe();
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="text-3xl font-semibold text-gray-900">Settings</div>
        <div className="mt-2 text-sm text-gray-600">Account details and sender profile for generated labels.</div>
      </Card>

      <Card className="p-6">
        <div className="text-xl font-medium text-gray-900">Account</div>
        <div className="mt-4 grid gap-3 text-sm text-gray-600">
          <div className="flex items-center justify-between gap-4">
            <div>Email</div>
            <div className="font-medium text-gray-900">{me?.user.email ?? "—"}</div>
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>Role</div>
            <div className="font-medium text-gray-900">{me?.user.role ?? "—"}</div>
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>Plan</div>
            <div className="font-medium text-gray-900">{me?.subscription?.plan?.name ?? "—"}</div>
          </div>
        </div>

        <button
          className="mt-6 rounded-lg border bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-all duration-200 ease-in-out hover:bg-gray-50"
          onClick={() => {
            clearSession();
            nav("/login");
          }}
        >
          Logout
        </button>
      </Card>

      <Card className="p-6">
        <div className="text-xl font-medium text-gray-900">Sender Profile</div>
        <div className="mt-1 text-sm text-gray-600">
          These fields are used as the sender / return address on every label when not provided in your CSV.
        </div>

        <form onSubmit={handleSave} className="mt-5 grid gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700" htmlFor="companyName">Company / Sender Name</label>
            <input
              id="companyName"
              type="text"
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              maxLength={120}
              placeholder="e.g. My Courier Co."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700" htmlFor="address">Return Address</label>
            <input
              id="address"
              type="text"
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              maxLength={300}
              placeholder="e.g. 123 Main St, Karachi"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700" htmlFor="originCity">Origin City</label>
              <input
                id="originCity"
                type="text"
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                value={originCity}
                onChange={(e) => setOriginCity(e.target.value)}
                maxLength={80}
                placeholder="e.g. Karachi"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700" htmlFor="contactNumber">Contact Number</label>
              <input
                id="contactNumber"
                type="text"
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                value={contactNumber}
                onChange={(e) => setContactNumber(e.target.value)}
                maxLength={30}
                placeholder="e.g. 0300-1234567"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700" htmlFor="cnic">CNIC (Optional)</label>
            <input
              id="cnic"
              type="text"
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              value={cnic}
              onChange={(e) => setCnic(e.target.value)}
              maxLength={15}
              placeholder="35202-1234567-1 or 3520212345671"
            />
          </div>

          {error ? <div className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div> : null}
          {saved ? <div className="rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-700">Profile saved successfully.</div> : null}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white shadow-sm transition-all duration-200 ease-in-out hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save Profile"}
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}

