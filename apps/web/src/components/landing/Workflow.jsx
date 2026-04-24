const steps = [
  {
    icon: "📁",
    title: "Upload Data",
    description: "Import one CSV or XLSX file with all your shipment records. Supports up to 5,000 rows.",
  },
  {
    icon: "🖨️",
    title: "Generate Documents",
    description: "Labels and money order PDFs are created in the background — download when ready.",
  },
  {
    icon: "🔍",
    title: "Track & Manage",
    description: "Check parcel statuses, submit complaints, and view delivery outcomes from one screen.",
  },
];

export default function Workflow() {
  return (
    <section id="workflow" className="border-b border-gray-100 bg-gray-50">
      <div className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#0B5D3B]">Workflow</div>
          <h2 className="mt-2 text-3xl font-bold text-gray-900">Simple steps, production-grade output</h2>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {steps.map((step, index) => (
            <article key={step.title} className="relative rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#0B5D3B] text-xs font-bold text-white shadow">
                  {index + 1}
                </div>
                <div className="text-xl">{step.icon}</div>
              </div>
              <h3 className="mt-4 text-base font-semibold text-gray-900">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-500">{step.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
