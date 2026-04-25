import { FileSpreadsheet, Package, Route, WalletCards } from "lucide-react";
import Card from "./Card";
import SectionTitle from "./SectionTitle";

const steps = [
  {
    step: "STEP 1",
    title: "Upload File",
    points: ["CSV", "Excel", "Bulk import"],
    icon: FileSpreadsheet,
  },
  {
    step: "STEP 2",
    title: "Generate Labels",
    points: ["PDF icon", "Barcode preview", "Print-ready badge"],
    icon: Package,
  },
  {
    step: "STEP 3",
    title: "Track Shipments",
    points: ["Tracking status", "Shipment timeline", "Progress"],
    icon: Route,
  },
  {
    step: "STEP 4",
    title: "Money Orders",
    points: ["PKR amount card", "Status generated", "Download ready"],
    icon: WalletCards,
  },
];

export default function ProcessTimeline() {
  return (
    <section id="how-it-works" className="border-b border-[#E5E7EB] bg-[#F8FAF9]">
      <div className="ui-page">
        <SectionTitle kicker="How It Works" title="From Upload to Delivery in Four Steps" subtitle="Designed for fast operations with clear progress at every stage." />
        <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {steps.map((step) => {
            const Icon = step.icon;
            return (
              <Card key={step.title} className="p-6">
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-brand/10 text-brand">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-brand">{step.step}</div>
                <h3 className="mt-2 text-xl font-bold text-[#0F172A]">{step.title}</h3>
                <ul className="mt-3 space-y-2 text-sm text-slate-600">
                  {step.points.map((point) => (
                    <li key={point} className="rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 shadow-lg">{point}</li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
