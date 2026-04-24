const items = [
  {
    title: "Bulk Label Generation",
    description: "Upload Excel or CSV files and generate print-ready labels in one run.",
  },
  {
    title: "Money Order Support",
    description: "Create money-order documents automatically with compatible shipments.",
  },
  {
    title: "Bulk Parcel Tracking",
    description: "Track thousands of shipments with a single synchronized dashboard.",
  },
  {
    title: "Complaint Automation",
    description: "Open and manage complaint workflows from shipment history.",
  },
  {
    title: "Queue Processing",
    description: "Background workers process large jobs without blocking your team.",
  },
  {
    title: "Live Usage Dashboard",
    description: "Monitor credits, usage, and package health in real time.",
  },
];

export default function Features() {
  return (
    <section id="features" className="border-b border-emerald-100 bg-[#f8fcf9]">
      <div className="ui-page">
        <div className="max-w-2xl">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">Features</div>
          <h2 className="mt-2 text-3xl font-bold text-slate-900">Everything needed for dispatch operations</h2>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <article key={item.title} className="ui-card p-5">
              <h3 className="text-base font-semibold text-slate-900">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{item.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
