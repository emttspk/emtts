import { useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { sendPasswordResetEmail } from "firebase/auth";
import Card from "../components/Card";
import { clearSession } from "../lib/auth";
import { api } from "../lib/api";
import type { MeResponse } from "../lib/types";
import { resolvePackageMeta, usagePercent } from "../lib/packageCatalog";
import { TEMPLATE_DESIGNER_ADMIN_EMAIL, TEMPLATE_DESIGNER_ENABLED } from "../lib/featureFlags";
import { BodyText, CardTitle, PageShell, PageTitle } from "../components/ui/PageSystem";
import { auth, firebaseReady } from "../firebase";

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

  // Change Password state
  const [cpCurrentPw, setCpCurrentPw] = useState("");
  const [cpNewPw, setCpNewPw] = useState("");
  const [cpConfirmPw, setCpConfirmPw] = useState("");
  const [cpSaving, setCpSaving] = useState(false);
  const [cpSaved, setCpSaved] = useState(false);
  const [cpError, setCpError] = useState<string | null>(null);

  // Reset Password state
  const [resetSending, setResetSending] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const activePlanName = me?.subscription?.plan?.name ?? me?.activePackage?.planName ?? "BUSINESS";
  const packageMeta = resolvePackageMeta(activePlanName);
  const remainingUnits = me?.balances?.unitsRemaining ?? me?.activePackage?.unitsRemaining ?? 0;
  const unitLimit = me?.balances?.labelLimit ?? packageMeta.units;
  const usedPercent = usagePercent(remainingUnits, unitLimit);
  const billingStatus = me?.subscription?.status ?? me?.activePackage?.status ?? "-";
  const expiryDate = me?.activePackage?.expiresAt ?? me?.subscription?.currentPeriodEnd;
  const canUseTemplateDesigner =
    me?.user.role === "ADMIN" &&
    TEMPLATE_DESIGNER_ENABLED &&
    String(me?.user.email ?? "").trim().toLowerCase() === TEMPLATE_DESIGNER_ADMIN_EMAIL;

  async function handleSave(e: React.FormEvent) {    e.preventDefault();
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

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setCpError(null);
    setCpSaved(false);

    if (cpNewPw !== cpConfirmPw) {
      setCpError("New passwords do not match.");
      return;
    }
    if (cpNewPw.length < 8) {
      setCpError("New password must be at least 8 characters.");
      return;
    }

    setCpSaving(true);
    try {
      await api("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword: cpCurrentPw, newPassword: cpNewPw }),
      });
      setCpSaved(true);
      setCpCurrentPw("");
      setCpNewPw("");
      setCpConfirmPw("");
    } catch (err) {
      setCpError(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setCpSaving(false);
    }
  }

  async function handleResetPassword() {
    if (!me?.user.email) return;
    setResetError(null);
    setResetSent(false);
    setResetSending(true);
    try {
      if (firebaseReady && auth) {
        const continueUrl = `${window.location.origin}/login`;
        await sendPasswordResetEmail(auth, me.user.email, { url: continueUrl, handleCodeInApp: false });
      } else {
        await api("/api/auth/forgot-password", {
          method: "POST",
          body: JSON.stringify({ email: me.user.email }),
        });
      }
      setResetSent(true);
    } catch (err) {
      setResetError(err instanceof Error ? err.message : "Failed to send reset email");
    } finally {
      setResetSending(false);
    }
  }

  return (
    <PageShell className="space-y-3">
      <Card className="border-slate-200 bg-white p-5 shadow-sm md:p-6">
        <div className="ui-kicker">Profile settings</div>
        <div className="mt-5 text-xl font-semibold text-slate-900">Premium sender profile for labels, returns, and account control.</div>
        <BodyText className="mt-2 max-w-2xl">Review account details and maintain the sender information used when your uploaded files do not provide return-address data.</BodyText>

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
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Billing Status</div>
            <div className="mt-2 text-lg font-semibold text-slate-900">{billingStatus}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 md:col-span-2">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Package Expiry</div>
            <div className="mt-2 text-lg font-semibold text-slate-900">{expiryDate ? new Date(expiryDate).toLocaleDateString("en-PK") : "-"}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Package Actions</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className="rounded-xl bg-brand px-3 py-2 text-xs font-semibold text-white" onClick={() => nav("/update-package")}>Update package</button>
              <button type="button" className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700" onClick={() => nav("/select-package")}>Select package</button>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[0.72fr_1.28fr]">
        <Card className="border-slate-200 bg-white p-6 shadow-sm">
          <CardTitle>Account</CardTitle>
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
              <div className="font-medium text-gray-900">{me?.subscription?.plan?.name ?? me?.activePackage?.planName ?? "-"}</div>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-2xl bg-slate-50/80 px-4 py-3">
              <div>Used Units</div>
              <div className="font-medium text-gray-900">{Math.max(0, unitLimit - remainingUnits).toLocaleString()}</div>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-2xl bg-slate-50/80 px-4 py-3">
              <div>Remaining Units</div>
              <div className="font-medium text-gray-900">{remainingUnits.toLocaleString()}</div>
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

        <Card className="border-slate-200 bg-white p-6 shadow-sm md:p-8">
          <CardTitle>Sender Profile</CardTitle>
          <div className="mt-1 text-sm font-normal text-slate-500">
            These fields are used as the sender / return address on every label when not provided in your CSV.
          </div>

          <form onSubmit={handleSave} className="mt-6 grid gap-4">
          <div>

          {canUseTemplateDesigner ? (
            <Card className="border-slate-200 bg-white p-6 shadow-sm">
              <CardTitle>Admin tools</CardTitle>
              <div className="mt-1 text-sm font-normal text-slate-500">Internal-only controls for advanced money order layout management.</div>
              <div className="mt-4">
                <button type="button" className="btn-primary" onClick={() => nav("/admin/template-designer")}>Open Money Order Designer</button>
              </div>
            </Card>
          ) : null}
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

      <div className="grid gap-6 xl:grid-cols-2">
        {/* Change Password */}
        <Card className="border-slate-200 bg-white p-6 shadow-sm">
          <CardTitle>Change Password</CardTitle>
          <div className="mt-1 text-sm font-normal text-slate-500">Update your account password. You must provide your current password to confirm.</div>
          <form onSubmit={handleChangePassword} className="mt-5 grid gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700" htmlFor="cpCurrentPw">Current Password</label>
              <input
                id="cpCurrentPw"
                type="password"
                className="field-input mt-2"
                value={cpCurrentPw}
                onChange={(e) => setCpCurrentPw(e.target.value)}
                placeholder="Your current password"
                required
                autoComplete="current-password"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700" htmlFor="cpNewPw">New Password</label>
              <input
                id="cpNewPw"
                type="password"
                className="field-input mt-2"
                value={cpNewPw}
                onChange={(e) => setCpNewPw(e.target.value)}
                placeholder="At least 8 characters"
                minLength={8}
                required
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700" htmlFor="cpConfirmPw">Confirm New Password</label>
              <input
                id="cpConfirmPw"
                type="password"
                className="field-input mt-2"
                value={cpConfirmPw}
                onChange={(e) => setCpConfirmPw(e.target.value)}
                placeholder="Repeat new password"
                minLength={8}
                required
                autoComplete="new-password"
              />
            </div>
            {cpError ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{cpError}</div> : null}
            {cpSaved ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">Password updated successfully.</div> : null}
            <div className="flex justify-end">
              <button type="submit" disabled={cpSaving} className="btn-primary">
                {cpSaving ? "Updating..." : "Update Password"}
              </button>
            </div>
          </form>
        </Card>

        {/* Reset Password */}
        <Card className="border-slate-200 bg-white p-6 shadow-sm">
          <CardTitle>Reset Password</CardTitle>
          <div className="mt-1 text-sm font-normal text-slate-500">
            Forgot your current password? Send a reset link to your registered email address.
          </div>
          <div className="mt-5 rounded-2xl bg-slate-50/80 px-4 py-3 text-sm text-slate-700">
            Reset link will be sent to: <span className="font-semibold text-slate-900">{me?.user.email ?? "-"}</span>
          </div>
          {resetError ? <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{resetError}</div> : null}
          {resetSent ? (
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              Password reset email sent. Check your inbox and follow the link.
            </div>
          ) : null}
          <div className="mt-5 flex justify-end">
            <button
              type="button"
              disabled={resetSending || resetSent}
              className="btn-secondary"
              onClick={handleResetPassword}
            >
              {resetSending ? "Sending..." : resetSent ? "Email Sent" : "Send Reset Email"}
            </button>
          </div>
        </Card>
      </div>
    </PageShell>
  );
}



