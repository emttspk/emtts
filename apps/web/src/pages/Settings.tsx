import { useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import Card from "../components/Card";
import { clearSession } from "../lib/auth";
import { api } from "../lib/api";
import type { MeResponse } from "../lib/types";
import { resolvePackageMeta, usagePercent } from "../lib/packageCatalog";

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
  const activePlanName = me?.subscription?.plan?.name ?? me?.activePackage?.planName ?? "BUSINESS";
  const packageMeta = resolvePackageMeta(activePlanName);
  const remainingUnits = me?.balances?.unitsRemaining ?? me?.activePackage?.unitsRemaining ?? 0;
  const unitLimit = me?.balances?.labelLimit ?? packageMeta.units;
  const usedPercent = usagePercent(remainingUnits, unitLimit);

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
      <Card className="p-8 md:p-10">
        <div className="ui-kicker">Profile settings</div>
        <div className="mt-5 font-display text-4xl font-extrabold tracking-[-0.05em] text-slate-950 md:text-5xl">Premium sender profile for labels, returns, and account control.</div>
        <div className="mt-4 max-w-2xl text-base leading-8 text-slate-600">Review account details and maintain the sender information used when your uploaded files do not provide return-address data.</div>

        <div className="mt-7 grid gap-4 rounded-[28px] border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-5 md:grid-cols-3">
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Subscription</div>
            <div className="mt-2 text-xl font-semibold text-emerald-900">{packageMeta.displayName}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 md:col-span-2">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              <span>Usage Meter</span>
              <span>{usedPercent}% used</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
              <div className="h-2 rounded-full bg-gradient-to-r from-brand to-emerald-500" style={{ width: `${usedPercent}%` }} />
            </div>
            <div className="mt-2 text-sm text-slate-600">
              {Math.max(0, unitLimit - remainingUnits).toLocaleString()} used out of {unitLimit.toLocaleString()} units
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Plan Price</div>
            <div className="mt-2 text-lg font-semibold text-slate-900">{packageMeta.priceText}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Tracking Limit</div>
            <div className="mt-2 text-lg font-semibold text-slate-900">{packageMeta.tracking.toLocaleString()}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Complaints</div>
            <div className="mt-2 text-lg font-semibold text-slate-900">{packageMeta.complaints}</div>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[0.72fr_1.28fr]">
        <Card className="p-6">
          <div className="text-xl font-medium text-gray-900">Account</div>
          <div className="mt-4 grid gap-3 text-sm text-gray-600">
            <div className="flex items-center justify-between gap-4 rounded-2xl bg-slate-50/80 px-4 py-3">
              <div>Email</div>
              <div className="font-medium text-gray-900">{me?.user.email ?? "-"}</div>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-2xl bg-slate-50/80 px-4 py-3">
              <div>Role</div>
              <div className="font-medium text-gray-900">{me?.user.role ?? "-"}</div>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-2xl bg-slate-50/80 px-4 py-3">
              <div>Plan</div>
              <div className="font-medium text-gray-900">{me?.subscription?.plan?.name ?? "-"}</div>
            </div>
          </div>

          <button
            className="btn-secondary mt-6 w-full"
            onClick={() => {
              clearSession();
              nav("/login");
            }}
          >
            Logout
          </button>
        </Card>

        <Card className="p-6 md:p-8">
          <div className="text-xl font-medium text-gray-900">Sender Profile</div>
          <div className="mt-1 text-sm text-gray-600">
            These fields are used as the sender / return address on every label when not provided in your CSV.
          </div>

          <form onSubmit={handleSave} className="mt-6 grid gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700" htmlFor="companyName">Company / Sender Name</label>
            <input
              id="companyName"
              type="text"
              className="field-input mt-2"
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
              className="field-input mt-2"
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
                className="field-input mt-2"
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
                className="field-input mt-2"
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
              className="field-input mt-2"
              value={cnic}
              onChange={(e) => setCnic(e.target.value)}
              maxLength={15}
              placeholder="35202-1234567-1 or 3520212345671"
            />
          </div>

          {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
          {saved ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">Profile saved successfully.</div> : null}

          <div className="flex justify-end">
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? "Saving..." : "Save Profile"}
            </button>
          </div>
        </form>
        </Card>
      </div>
    </div>
  );
}



