const steps = [
  {
    title: "Upload Data",
    description: "Import shipment records with one CSV/XLSX upload.",
  },
  {
    title: "Generate Documents",
    description: "Labels and money orders are generated in queue-safe batches.",
  },
  {
    title: "Track and Manage",
    description: "Follow status, complaints, and delivery outcomes from one place.",
  },
];

export default function Workflow() {
  return (
    <section id="workflow" className="border-b border-emerald-100 bg-white">
      <div className="ui-page">
        <div className="max-w-2xl">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">Workflow</div>
          <h2 className="mt-2 text-3xl font-bold text-slate-900">Simple steps, production-ready output</h2>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {steps.map((step, index) => (
            <article key={step.title} className="ui-card p-6">
              <div className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">
                {index + 1}
              </div>
              <h3 className="mt-4 text-base font-semibold text-slate-900">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{step.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
