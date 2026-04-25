import Card from "./Card";

const items = [
  { title: "Print Labels", info: "Up to 50/month" },
  { title: "Track Shipments", info: "Up to 100/month" },
  { title: "Money Orders", info: "Up to 10/month" },
  { title: "Analytics", info: "Shipment insights" },
  { title: "Email Alerts", info: "Real-time alerts" },
  { title: "API Access", info: "Developer ready" },
];

export default function FeatureStrip() {
  return (
    <section id="labels" className="border-b border-[#E5E7EB] bg-white">
      <div className="ui-page">
        <Card className="p-6">
          <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => (
                <div key={item.title} className="rounded-2xl border border-[#E5E7EB] bg-[#F8FAF9] p-4 shadow-lg transition-all duration-300 hover:shadow-xl">
                  <div className="text-sm font-semibold text-[#0F172A]">{item.title}</div>
                  <div className="mt-1 text-xs text-slate-600">{item.info}</div>
                </div>
              ))}
            </div>
            <div className="rounded-2xl border border-brand/20 bg-brand/5 p-5">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">Free Plan</div>
              <div className="mt-2 text-2xl font-bold text-[#0F172A]">100% Free</div>
              <div className="mt-1 text-sm text-slate-600">All core features to start shipping today.</div>
              <a href="/register" className="btn-primary mt-4 w-full">Create Free Account</a>
            </div>
          </div>
        </Card>
      </div>
    </section>
  );
}
