import { Link } from "react-router-dom";

export default function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-emerald-100 bg-[linear-gradient(140deg,#f8fcf9,#eef7f1)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(11,93,59,0.24),_transparent_45%)]" />
      <div className="pointer-events-none absolute -left-24 top-16 h-72 w-72 rounded-full bg-brand/10 blur-3xl" />
      <div className="ui-page relative">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-brand">
              <span className="h-2 w-2 rounded-full bg-brand" />
              Official Pakistan Post Partner Platform
            </div>
            <h1 className="mt-6 text-5xl font-black leading-tight tracking-tight text-slate-900">
              Ship Anywhere in Pakistan.
              <span className="block text-brand">Track Every Step.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-600">
              Generate Pakistan Post labels, create money orders, and track every shipment in real-time from one premium workspace.
            </p>

            <div className="mt-8 flex flex-col gap-4 sm:flex-row">
              <Link to="/register" className="btn-primary">
                Create Free Account
              </Link>
              <a href="#workflow" className="btn-secondary">
                See How It Works
              </a>
            </div>
          </div>

          <div className="relative">
            <div className="ui-card p-6">
              <div className="grid gap-4 sm:grid-cols-3">
                {[
                  { label: "Total Shipments", value: "12,458" },
                  { label: "Delivered", value: "9,876" },
                  { label: "In Transit", value: "2,134" },
                ].map((item) => (
                  <div key={item.label} className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-4">
                    <div className="text-xs font-medium text-slate-500">{item.label}</div>
                    <div className="mt-2 text-2xl font-bold text-slate-900">{item.value}</div>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-xl border border-emerald-100 bg-white p-4">
                <div className="text-sm font-semibold text-slate-900">Recent Shipment</div>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="font-mono text-slate-700">LK123456789PK</span>
                  <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-brand">Delivered</span>
                </div>
              </div>
            </div>
            <div className="ui-card absolute -bottom-5 -right-4 hidden p-4 sm:block">
              <div className="text-xs font-semibold text-slate-500">Money Order</div>
              <div className="mt-1 text-lg font-bold text-slate-900">PKR 25,000</div>
              <div className="text-xs text-brand">Status: Generated</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
