const steps = [
  { title: "Upload Data", description: "Import CSV/XLSX once and validate shipment records." },
  { title: "Generate Documents", description: "Create labels and money-order outputs from the same flow." },
  { title: "Track Dispatch", description: "Run tracking updates and monitor statuses in bulk." },
  { title: "Handle Complaints", description: "Submit and monitor complaint states from your dashboard." },
];

export default function Workflow() {
  return (
    <section id="workflow" className="border-b border-gray-100 bg-gray-50">
      <div className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#0B5D3B]">Workflow</div>
          <h2 className="mt-2 text-3xl font-bold text-gray-900">Simple steps, production-grade output</h2>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, index) => (
            <article key={step.title} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#0B5D3B] text-xs font-bold text-white">
                {index + 1}
              </div>
              <h3 className="mt-4 text-base font-semibold text-gray-900">{step.title}</h3>
              <p className="mt-2 text-sm text-gray-600">{step.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
