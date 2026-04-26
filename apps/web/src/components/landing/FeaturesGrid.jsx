import { Boxes, ChartColumn, ClipboardCheck, FileSpreadsheet, Route, WalletCards } from "lucide-react";
import Card from "./Card";
import SectionTitle from "./SectionTitle";

const features = [
  { title: "Bulk Labels", icon: FileSpreadsheet, desc: "Generate thousands of print-ready labels in one queue run." },
  { title: "Money Orders", icon: WalletCards, desc: "Create and reconcile money order documents in sync with shipments." },
  { title: "Tracking Dashboard", icon: Route, desc: "Unified status history, milestone alerts, and route visibility." },
  { title: "Complaint Automation", icon: ClipboardCheck, desc: "Submit and manage complaint workflows with prefilled data." },
  { title: "Analytics", icon: ChartColumn, desc: "Operational metrics by status, volume, and conversion cycles." },
  { title: "API Access", icon: Boxes, desc: "Integrate shipping workflows directly into your internal tools." },
];

export default function FeaturesGrid() {
  return (
    <section id="products" className="py-6">
      <div className="ui-page">
        <SectionTitle kicker="Features" title="Everything in One Logistics Workspace" subtitle="No disconnected tools, no manual reconciliation." />
        <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <Card key={feature.title} className="group relative overflow-hidden p-6">
                <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,rgba(11,107,58,0),rgba(11,107,58,0.8),rgba(11,107,58,0))] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/10 text-brand"><Icon className="h-5 w-5" /></div>
                <h3 className="mt-5 text-[18px] font-bold text-brand-ink">{feature.title}</h3>
                <p className="mt-3 text-sm leading-7 text-slate-600">{feature.desc}</p>
                <div className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Hover to inspect module</div>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
