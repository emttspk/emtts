import { FileSpreadsheet, Package, Route, WalletCards } from "lucide-react";
import Card from "./Card";
import SectionTitle from "./SectionTitle";

const steps = [
  { step: "01", title: "Upload Excel", points: ["CSV/XLSX", "Bulk import"], icon: FileSpreadsheet },
  { step: "02", title: "Generate Label", points: ["A4/Envelope", "Code128"], icon: Package },
  { step: "03", title: "Generate MO", points: ["MOS reference", "PKR values"], icon: WalletCards },
  { step: "04", title: "Track Shipment", points: ["Timeline", "Route status"], icon: Route },
];

const flowCards = [
  { title: "Dashboard", image: "/media/dashboard-preview.png" },
  { title: "Label", image: "/media/label-preview.png" },
  { title: "Money Order", image: "/media/money-order-preview.png" },
  { title: "Tracking", image: "/media/tracking-preview.png" },
];

export default function ProcessTimeline() {
  return (
    <section id="workflow" className="py-10 md:py-12">
      <div className="ui-page">
        <SectionTitle kicker="Workflow" title="Single Clean Product Flow" subtitle="Upload, generate, and track in one premium surface." />
        <div className="relative mt-10 grid gap-4 lg:grid-cols-4">
          <div className="pointer-events-none absolute left-16 right-16 top-12 hidden h-px bg-[linear-gradient(90deg,rgba(11,107,58,0.2),rgba(11,107,58,0.85),rgba(11,107,58,0.2))] lg:block" />
          {steps.map((step) => {
            const Icon = step.icon;
            return (
              <Card key={step.title} className="relative rounded-3xl border border-slate-200 bg-white p-6 shadow-xl">
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

        <div className="mt-10">
          <div className="mb-4 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Real Product Flow</div>
          <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 md:grid md:grid-cols-4 md:overflow-visible md:pb-0">
            {flowCards.map((card) => (
              <Card key={card.title} className="min-w-[17rem] snap-center overflow-hidden rounded-3xl border border-slate-200 bg-white p-0 shadow-xl md:min-w-0">
                <img src={card.image} alt={`${card.title} preview`} className="h-40 w-full object-cover" />
                <div className="px-4 py-3 text-sm font-semibold text-brand-ink">{card.title}</div>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
