import { Globe, ShieldCheck, Truck } from "lucide-react";
import Card from "./Card";
import SectionTitle from "./SectionTitle";

const types = [
  { code: "VPL26030700", name: "Value Payable Letter", icon: Truck, badge: "VPL", from: "Lahore", to: "Karachi" },
  { code: "RGL24092217", name: "Registered Letter", icon: ShieldCheck, badge: "RGL", from: "Islamabad", to: "Multan" },
  { code: "IRL19034455", name: "International RL", icon: Globe, badge: "IRL", from: "Karachi", to: "Dubai" },
  { code: "COD77102033", name: "Cash on Delivery", icon: Truck, badge: "COD", from: "Lahore", to: "Faisalabad" },
];

export default function TrackingTypes() {
  return (
    <section id="tracking" className="py-10 md:py-12">
      <div className="ui-page">
        <SectionTitle kicker="Tracking Types" title="Supported Tracking References" subtitle="Premium tracking cards with route previews and status context." />
        <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {types.map((type) => {
            const Icon = type.icon;
            return (
              <Card key={type.code} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xl">
                <div className="flex items-center justify-between">
                  <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-brand/10 text-brand"><Icon className="h-5 w-5" /></div>
                  <span className="rounded-full border border-brand/20 bg-brand/10 px-3 py-1 text-xs font-semibold text-brand">{type.badge}</span>
                </div>
                <div className="mt-4 font-mono text-sm font-bold tracking-[0.12em] text-brand-ink">{type.code}</div>
                <div className="mt-2 text-sm text-slate-600">{type.name}</div>

                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                  <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                    <span>{type.from}</span>
                    <span>{type.to}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                    <div className="h-2 w-2/3 rounded-full bg-gradient-to-r from-brand to-emerald-500" />
                  </div>
                  <svg viewBox="0 0 120 36" className="mt-2 h-8 w-full">
                    <path d="M8 28 C24 6, 56 34, 112 9" stroke="#bbf7d0" strokeWidth="4" fill="none" />
                    <path d="M8 28 C24 6, 56 34, 78 20" stroke="#0b6b3a" strokeWidth="4" fill="none" strokeLinecap="round" />
                    <circle cx="8" cy="28" r="3.5" fill="#0b6b3a" />
                    <circle cx="78" cy="20" r="3.5" fill="#22c55e" />
                    <circle cx="112" cy="9" r="3.5" fill="#94a3b8" />
                  </svg>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
