import { AlertCircle, FileSpreadsheet, Package, Route, WalletCards } from "lucide-react";
import Card from "./Card";
import SectionTitle from "./SectionTitle";

const steps = [
  { step: "STEP 1", title: "Upload Excel", points: ["CSV", "Excel", "Bulk import"], icon: FileSpreadsheet },
  { step: "STEP 2", title: "Generate Labels", points: ["PDF icon", "Barcode preview", "Print-ready badge"], icon: Package },
  { step: "STEP 3", title: "Generate Money Orders", points: ["PKR card", "MOS reference", "Generated status"], icon: WalletCards },
  { step: "STEP 4", title: "Track Shipment", points: ["Tracking status", "Shipment timeline", "Progress"], icon: Route },
  { step: "STEP 5", title: "Submit Complaint", points: ["Complaint form", "Ticket status", "Resolution tracking"], icon: AlertCircle },
];

export default function ProcessTimeline() {
  return (
    <section id="workflow" className="py-6">
      <div className="ui-page">
        <SectionTitle kicker="How It Works" title="Real Product Flow" subtitle="Upload Excel, generate outputs, track, and handle complaints in one system." />
        <div className="relative mt-12 grid gap-5 xl:grid-cols-5">
          <div className="pointer-events-none absolute left-10 right-10 top-14 hidden h-px bg-[linear-gradient(90deg,rgba(11,107,58,0.18),rgba(11,107,58,0.8),rgba(11,107,58,0.18))] xl:block" />
          {steps.map((step) => {
            const Icon = step.icon;
            return (
              <Card key={step.title} className="relative p-6">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/10 text-brand shadow-inner">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-brand">{step.step}</div>
                <h3 className="mt-2 text-xl font-bold text-brand-ink">{step.title}</h3>
                <ul className="mt-4 space-y-2 text-xs text-slate-600">
                  {step.points.map((point) => (
                    <li key={point} className="rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-2 shadow-sm">{point}</li>
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
