const items = [
  {
    icon: "🏷️",
    title: "Bulk Label Generation",
    description: "Upload Excel/CSV once and generate print-ready PDF labels in envelope, flyer, or box format.",
  },
  {
    icon: "💸",
    title: "Money Order Support",
    description: "Automatically generate money order PDFs alongside your VPL, VPP, and COD shipments.",
  },
  {
    icon: "📦",
    title: "Bulk Parcel Tracking",
    description: "Submit tracking batches, store results, and monitor delivery progress from one dashboard.",
  },
  {
    icon: "📩",
    title: "Complaint Automation",
    description: "Submit, track and manage Pakistan Post complaints directly from shipment records.",
  },
  {
    icon: "⚙️",
    title: "Queue-based Processing",
    description: "Background workers handle large jobs safely. No timeouts, no data loss.",
  },
  {
    icon: "📊",
    title: "Live Usage Dashboard",
    description: "See label credits, tracking usage, and plan status in real time.",
  },
];

export default function Features() {
  return (
    <section id="features" className="border-b border-gray-100 bg-white">
      <div className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#0B5D3B]">Features</div>
          <h2 className="mt-2 text-3xl font-bold text-gray-900">Everything needed for label operations</h2>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <article key={item.title} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[#0B5D3B]/20 hover:shadow-md">
              <div className="text-2xl">{item.icon}</div>
              <h3 className="mt-3 text-base font-semibold text-gray-900">{item.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-gray-500">{item.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
