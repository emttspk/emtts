import { Globe, ShieldCheck, Truck } from "lucide-react";
import Card from "./Card";
import SectionTitle from "./SectionTitle";

const types = [
  { code: "VPLXXXXXXXX", name: "Value Payable Letter", icon: Truck, badge: "Domestic" },
  { code: "RGLXXXXXXXX", name: "Registered Letter", icon: ShieldCheck, badge: "Registered" },
  { code: "IRLXXXXXXX", name: "International Registered Letter", icon: Globe, badge: "International" },
  { code: "CODXXXXXXXX", name: "Cash on Delivery", icon: Truck, badge: "COD" },
];

export default function TrackingTypes() {
  return (
    <section className="border-b border-[#E5E7EB] bg-white">
      <div className="ui-page">
        <SectionTitle kicker="Tracking Types" title="Supported Tracking Types" subtitle="Use the correct reference format for each shipment class." />
        <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {types.map((type) => {
            const Icon = type.icon;
            return (
              <Card key={type.code} className="p-5">
                <div className="flex items-center justify-between">
                  <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-brand/10 text-brand"><Icon className="h-5 w-5" /></div>
                  <span className="rounded-full border border-brand/20 bg-brand/10 px-3 py-1 text-xs font-semibold text-brand">{type.badge}</span>
                </div>
                <div className="mt-4 font-mono text-sm font-bold text-[#0F172A]">{type.code}</div>
                <div className="mt-2 text-sm text-slate-600">{type.name}</div>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
