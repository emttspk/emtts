const items = [
  {
    title: "Bulk Label Generation",
    description: "Upload once and generate print-ready label documents with consistent output quality.",
  },
  {
    title: "Money Order Support",
    description: "Issue money order print files alongside shipment processing without disrupting flow.",
  },
  {
    title: "Bulk Tracking",
    description: "Track parcel status in batches and keep your operations dashboard updated.",
  },
  {
    title: "Complaint Workflow",
    description: "Manage complaint submissions from the same product environment.",
  },
  {
    title: "Production-safe Queue",
    description: "Background jobs keep long-running operations stable and observable.",
  },
  {
    title: "Pakistan Post Theme",
    description: "A clean interface tuned for day-to-day operational clarity.",
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
            <article key={item.title} className="rounded-2xl border border-gray-100 bg-gray-50 p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
              <h3 className="text-base font-semibold text-gray-900">{item.title}</h3>
              <p className="mt-2 text-sm text-gray-600">{item.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
