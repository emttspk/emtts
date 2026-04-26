import { MapPin, Route } from "lucide-react";

const timeline = [
  { label: "Booked", city: "Lahore", active: true },
  { label: "Dispatched", city: "DMO Lahore", active: true },
  { label: "In Transit", city: "Sindh Route", active: true },
  { label: "Delivery", city: "Karachi", active: false },
];

export default function TrackingPreviewCard({ className = "", compact = false }) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-3 shadow-sm ${className}`.trim()}>
      <div className="flex items-center justify-between">
        <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-brand-ink">
          <Route className="h-3.5 w-3.5 text-brand" /> Tracking Preview
        </div>
        <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-semibold text-amber-700">In Transit</span>
      </div>

      <div className="mt-2 text-[10px] font-mono font-semibold text-brand-ink">VPL26030700</div>
      <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500">
        <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> Lahore</span>
        <span>Karachi</span>
      </div>

      <svg viewBox="0 0 180 44" className="mt-2 h-8 w-full">
        <path d="M8 34 C36 8, 108 48, 172 12" stroke="#bbf7d0" strokeWidth="5" fill="none" />
        <path d="M8 34 C36 8, 108 48, 124 25" stroke="#0b6b3a" strokeWidth="5" fill="none" strokeLinecap="round" className="animate-pulse" />
        <circle cx="8" cy="34" r="4" fill="#0b6b3a" />
        <circle cx="124" cy="25" r="4" fill="#22c55e" />
        <circle cx="172" cy="12" r="4" fill="#94a3b8" />
      </svg>

      <div className={`mt-2 grid gap-1 ${compact ? "grid-cols-2" : "grid-cols-4"}`}>
        {(compact ? timeline.slice(0, 2) : timeline).map((item) => (
          <div key={`${item.label}-${item.city}`} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
            <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-500">{item.label}</div>
            <div className="mt-0.5 text-[10px] font-medium text-slate-700">{item.city}</div>
          </div>
        ))}
      </div>

      <div className="mt-2 text-[10px] text-slate-600">
        ETA: <span className="font-semibold text-slate-800">27 Mar, 4:00 PM</span>
      </div>
    </div>
  );
}
