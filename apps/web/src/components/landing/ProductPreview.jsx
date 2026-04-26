import Card from "./Card";
import SectionTitle from "./SectionTitle";

const previews = [
  {
    title: "Dashboard preview",
    visual: ["Overview", "Jobs", "Activity"],
    footer: "Metrics, status mix, and recent actions in one command center",
  },
  {
    title: "Label preview",
    visual: ["Barcode", "Receiver", "Tracking ID"],
    footer: "A premium print view with strong hierarchy for fast handling",
  },
  {
    title: "Tracking preview",
    visual: ["Timeline", "Status", "History"],
    footer: "Shipment progress, events and action context in a focused surface",
  },
];

export default function ProductPreview() {
  return (
    <section id="money-orders" className="py-6">
      <div className="ui-page">
        <SectionTitle kicker="Live Product" title="Real Screens, Real Workflow" subtitle="Preview how operations look inside the platform before signup." />
        <div className="mt-10 grid gap-5 lg:grid-cols-3">
          {previews.map((preview) => (
            <Card key={preview.title} className="overflow-hidden p-0">
              <div className="border-b border-slate-200 bg-[linear-gradient(180deg,rgba(11,107,58,0.10),rgba(255,255,255,0.4))] p-5">
                <div className="text-sm font-semibold text-brand-ink">{preview.title}</div>
                <div className="mt-4 rounded-[24px] border border-slate-200 bg-white p-4 shadow-inner">
                  <div className="grid gap-3">
                    {preview.visual.map((item, index) => (
                      <div key={item} className={`rounded-2xl px-3 py-3 text-sm ${index === 0 ? "bg-slate-900 text-white" : "bg-slate-50 text-slate-700"}`}>
                        {item}
                      </div>
                    ))}
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-5">
                      <div className="h-20 rounded-2xl bg-[linear-gradient(90deg,rgba(226,232,240,0.5),rgba(255,255,255,0.9),rgba(226,232,240,0.5))] bg-[length:200%_100%] animate-shimmer" />
                    </div>
                  </div>
                </div>
              </div>
              <div className="p-5 text-sm leading-7 text-slate-600">{preview.footer}</div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
