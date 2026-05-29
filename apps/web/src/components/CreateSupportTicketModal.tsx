import { useState } from "react";
import type { SupportCategory, SupportPriority } from "../lib/support";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreate: (payload: {
    subject: string;
    category: SupportCategory;
    priority: SupportPriority;
    message: string;
  }) => Promise<void>;
};

const CATEGORIES: SupportCategory[] = ["BILLING", "SHIPMENT", "TECHNICAL", "ACCOUNT", "OTHER"];
const PRIORITIES: SupportPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

export default function CreateSupportTicketModal({ open, onClose, onCreate }: Props) {
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState<SupportCategory>("TECHNICAL");
  const [priority, setPriority] = useState<SupportPriority>("MEDIUM");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Create Support Ticket</h2>
          <button type="button" className="text-sm text-slate-500 hover:text-slate-800" onClick={onClose}>Close</button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="text-sm font-medium text-slate-700">Subject</label>
            <input className="field-input mt-1" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700">Category</label>
            <select className="field-input mt-1" value={category} onChange={(e) => setCategory(e.target.value as SupportCategory)}>
              {CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700">Priority</label>
            <select className="field-input mt-1" value={priority} onChange={(e) => setPriority(e.target.value as SupportPriority)}>
              {PRIORITIES.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="text-sm font-medium text-slate-700">Message</label>
            <textarea className="field-input mt-1 min-h-[140px]" value={message} onChange={(e) => setMessage(e.target.value)} />
          </div>
        </div>

        {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button
            type="button"
            className="btn-primary disabled:opacity-50"
            disabled={saving || subject.trim().length < 3 || message.trim().length < 3}
            onClick={async () => {
              setSaving(true);
              setError(null);
              try {
                await onCreate({
                  subject: subject.trim(),
                  category,
                  priority,
                  message: message.trim(),
                });
                setSubject("");
                setMessage("");
                setCategory("TECHNICAL");
                setPriority("MEDIUM");
              } catch (e) {
                setError(e instanceof Error ? e.message : "Failed to create ticket");
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Creating..." : "Create Ticket"}
          </button>
        </div>
      </div>
    </div>
  );
}
