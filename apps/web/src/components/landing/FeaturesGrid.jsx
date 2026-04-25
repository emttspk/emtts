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
    <section id="tracking" className="border-b border-[#E5E7EB] bg-white">
      <div className="ui-page">
        <SectionTitle kicker="Features" title="Everything in One Logistics Workspace" subtitle="No disconnected tools, no manual reconciliation." />
        <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <Card key={feature.title} className="p-6">
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-brand/10 text-brand"><Icon className="h-5 w-5" /></div>
                <h3 className="mt-4 text-xl font-bold text-[#0F172A]">{feature.title}</h3>
                <p className="mt-2 text-sm text-slate-600">{feature.desc}</p>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
