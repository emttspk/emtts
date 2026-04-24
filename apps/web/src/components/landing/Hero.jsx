import { Link } from "react-router-dom";

export default function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-gray-100 bg-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(22,163,74,0.12),_transparent_34%)]" />
      <div className="pointer-events-none absolute -left-28 top-16 h-72 w-72 rounded-full bg-[#0B5D3B]/10 blur-3xl" />
      <div className="pointer-events-none absolute right-0 top-0 h-64 w-64 rounded-full bg-[#16A34A]/20 blur-3xl" />

      <div className="relative mx-auto w-full max-w-7xl px-4 pb-16 pt-14 sm:px-6 lg:px-8 lg:pb-20 lg:pt-20">
        <div className="grid items-center gap-10 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <div className="inline-flex items-center rounded-full border border-[#0B5D3B]/20 bg-[#0B5D3B]/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#0B5D3B]">
              Pakistan Post Compatible
            </div>
            <h1 className="mt-5 text-4xl font-black leading-tight tracking-tight text-gray-900 sm:text-5xl lg:text-6xl">
              Premium Label Operations
              <span className="block text-[#0B5D3B]">for Modern Dispatch Teams</span>
            </h1>
            <p className="mt-5 max-w-2xl text-base text-gray-600 sm:text-lg">
              Generate labels, print money orders, track parcels, and manage complaints in one clean workflow built for scale.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link to="/register" className="inline-flex items-center justify-center rounded-xl bg-[#0B5D3B] px-6 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-[#094E32]">
                Create Free Account
              </Link>
              <a href="#pricing" className="inline-flex items-center justify-center rounded-xl border border-gray-300 bg-white px-6 py-3 text-sm font-semibold text-gray-800 transition hover:border-[#0B5D3B] hover:text-[#0B5D3B]">
                View Pricing
              </a>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-5 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">Labels / Month</div>
              <div className="mt-3 text-3xl font-extrabold text-[#0B5D3B]">3,000+</div>
              <p className="mt-2 text-sm text-gray-600">Production-ready output across envelope, flyer, and box modes.</p>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">Tracking</div>
              <div className="mt-3 text-3xl font-extrabold text-[#0B5D3B]">Bulk</div>
              <p className="mt-2 text-sm text-gray-600">Run queue-based updates and monitor dispatch progress clearly.</p>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm sm:col-span-2">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">Money Orders + Complaints</div>
              <div className="mt-3 text-xl font-bold text-gray-900">Unified and operationally safe</div>
              <p className="mt-2 text-sm text-gray-600">Use one dashboard to handle generation, status checks, and complaint submission.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
