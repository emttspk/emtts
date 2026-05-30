import { useState } from "react";
import type { BookingSenderPayload, IntakeMethod } from "../../lib/aggregatorBookings";

type Props = {
  initial: BookingSenderPayload;
  disabled?: boolean;
  submitLabel: string;
  onSubmit: (value: BookingSenderPayload) => Promise<void>;
};

const intakeOptions: Array<{ value: IntakeMethod; label: string }> = [
  { value: "DROP_LAHORE", label: "Drop at Lahore collection point" },
  { value: "DROP_SAHIWAL", label: "Drop at Sahiwal collection point" },
  { value: "PICKUP_REQUESTED_FUTURE", label: "Pickup requested from customer address (future Leopards workflow)" },
];

export default function AggregatorBookingDraftForm({ initial, disabled, submitLabel, onSubmit }: Props) {
  const [form, setForm] = useState<BookingSenderPayload>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      setSaving(true);
      await onSubmit(form);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to save booking details");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="space-y-3" onSubmit={handleSubmit}>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-xs text-slate-700">Sender Name
          <input className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" value={form.senderName} onChange={(e) => setForm((s) => ({ ...s, senderName: e.target.value }))} disabled={disabled || saving} />
        </label>
        <label className="text-xs text-slate-700">Sender Phone
          <input className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" value={form.senderPhone} onChange={(e) => setForm((s) => ({ ...s, senderPhone: e.target.value }))} disabled={disabled || saving} />
        </label>
        <label className="text-xs text-slate-700 md:col-span-2">Sender Address
          <input className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" value={form.senderAddress} onChange={(e) => setForm((s) => ({ ...s, senderAddress: e.target.value }))} disabled={disabled || saving} />
        </label>
        <label className="text-xs text-slate-700">Sender City
          <input className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" value={form.senderCity} onChange={(e) => setForm((s) => ({ ...s, senderCity: e.target.value }))} disabled={disabled || saving} />
        </label>
        <label className="text-xs text-slate-700">Hub City
          <input className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" value={form.hubCity} onChange={(e) => setForm((s) => ({ ...s, hubCity: e.target.value }))} disabled={disabled || saving} />
        </label>
      </div>

      <label className="block text-xs text-slate-700">Intake Method
        <select className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" value={form.intakeMethod} onChange={(e) => setForm((s) => ({ ...s, intakeMethod: e.target.value as IntakeMethod }))} disabled={disabled || saving}>
          {intakeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>

      <label className="block text-xs text-slate-700">Special Instructions
        <textarea className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" rows={3} value={form.specialInstructions ?? ""} onChange={(e) => setForm((s) => ({ ...s, specialInstructions: e.target.value }))} disabled={disabled || saving} />
      </label>

      {error ? <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div> : null}

      <button type="submit" disabled={disabled || saving} className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60">
        {saving ? "Saving..." : submitLabel}
      </button>
    </form>
  );
}
