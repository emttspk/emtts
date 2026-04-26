import Card from "./Card";

const items = [
  { title: "Validation accuracy", info: "Receiver, city and amount checks before queueing" },
  { title: "Bulk label output", info: "A4-ready files with barcode-rich layouts" },
  { title: "Money order sync", info: "MO references aligned with eligible shipments" },
  { title: "Tracking intelligence", info: "Status grouping, history, and live progression" },
  { title: "Complaint workflow", info: "Structured escalation with prefilled details" },
  { title: "Analytics visibility", info: "Volume, status and operational history cards" },
];

export default function FeatureStrip() {
  return (
    <section id="labels" className="py-6">
      <div className="ui-page">
        <Card className="overflow-hidden p-0">
          <div className="grid gap-0 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="grid gap-3 border-b border-slate-200/80 p-6 sm:grid-cols-2 lg:border-b-0 lg:border-r lg:p-8">
              {items.map((item) => (
                <div key={item.title} className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4 transition-all duration-300 hover:-translate-y-1 hover:bg-white hover:shadow-card">
                  <div className="text-sm font-semibold text-brand-ink">{item.title}</div>
                  <div className="mt-2 text-sm leading-6 text-slate-600">{item.info}</div>
                </div>
              ))}
            </div>
            <div className="bg-[linear-gradient(135deg,#0F172A,#162033)] p-8 text-white">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">Why teams switch</div>
              <div className="mt-3 max-w-sm font-display text-3xl font-extrabold tracking-[-0.04em]">A single operational layer instead of five disconnected tools.</div>
              <div className="mt-4 max-w-sm text-sm leading-7 text-slate-300">Create free labels, generate money orders, track consignments, and handle complaints in one high-trust interface.</div>
              <div className="mt-8 grid gap-3 text-sm">
                {[
                  "Fewer manual handoffs",
                  "Cleaner operator workflows",
                  "Real-time shipment visibility",
                ].map((item) => (
                  <div key={item} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-slate-100">
                    {item}
                  </div>
                ))}
              </div>
              <a href="/register" className="btn-secondary mt-8 w-full border-white/20 bg-white text-brand hover:bg-white/90">Create Free Account</a>
            </div>
          </div>
        </Card>
      </div>
    </section>
  );
}
