import { Link } from "react-router-dom";

export default function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-gray-100 bg-gradient-to-br from-white via-[#f0faf4] to-white">
      {/* Background decorations */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(22,163,74,0.13),_transparent_55%)]" />
      <div className="pointer-events-none absolute -left-32 top-20 h-80 w-80 rounded-full bg-[#0B5D3B]/8 blur-3xl" />
      <div className="pointer-events-none absolute right-0 -top-10 h-72 w-72 rounded-full bg-[#16A34A]/15 blur-3xl" />

      <div className="relative mx-auto w-full max-w-7xl px-4 pb-16 pt-14 sm:px-6 lg:px-8 lg:pb-24 lg:pt-20">
        <div className="grid items-center gap-12 lg:grid-cols-2">

          {/* LEFT — Copy */}
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-[#0B5D3B]/20 bg-[#0B5D3B]/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#0B5D3B]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#16A34A]" />
              Pakistan Post Compatible
            </div>

            <h1 className="mt-5 text-4xl font-black leading-tight tracking-tight text-gray-900 sm:text-5xl lg:text-[3.5rem]">
              Ship Anywhere
              <span className="block text-[#0B5D3B]">in Pakistan.</span>
              <span className="block text-gray-900">Track Every Step.</span>
            </h1>

            <p className="mt-5 max-w-xl text-base leading-relaxed text-gray-500 sm:text-lg">
              Generate labels, create money orders, and track shipments in real time — all in one platform built for Pakistan Post.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                to="/register"
                className="inline-flex items-center justify-center rounded-xl bg-[#0B5D3B] px-6 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-[#094E32] hover:shadow-lg"
              >
                Create Free Account
              </Link>
              <a
                href="#workflow"
                className="inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white px-6 py-3 text-sm font-semibold text-gray-700 shadow-sm transition hover:border-[#0B5D3B] hover:text-[#0B5D3B]"
              >
                See How It Works
              </a>
            </div>

            {/* Trust strip */}
            <div className="mt-8 flex flex-wrap items-center gap-4 border-t border-gray-100 pt-6 text-xs text-gray-400">
              <span className="flex items-center gap-1.5">
                <svg className="h-3.5 w-3.5 text-[#16A34A]" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                Free plan — no card needed
              </span>
              <span className="flex items-center gap-1.5">
                <svg className="h-3.5 w-3.5 text-[#16A34A]" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                Bulk up to 5,000 shipments
              </span>
              <span className="flex items-center gap-1.5">
                <svg className="h-3.5 w-3.5 text-[#16A34A]" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                Complaint automation
              </span>
            </div>
          </div>

          {/* RIGHT — Dashboard preview */}
          <div className="relative mx-auto w-full max-w-md lg:max-w-none">
            {/* Main dashboard card */}
            <div className="relative rounded-2xl border border-gray-200 bg-white p-5 shadow-xl">
              {/* Mock header bar */}
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-red-400" />
                  <span className="h-2 w-2 rounded-full bg-yellow-400" />
                  <span className="h-2 w-2 rounded-full bg-green-400" />
                </div>
                <div className="text-xs font-medium text-gray-400">ePost Dashboard</div>
                <div className="h-2 w-16 rounded bg-gray-100" />
              </div>

              {/* Stats row */}
              <div className="mt-4 grid grid-cols-3 gap-3">
                {[
                  { label: "Labels", value: "1,248", color: "text-[#0B5D3B]" },
                  { label: "Tracked", value: "892", color: "text-blue-600" },
                  { label: "MO Issued", value: "341", color: "text-amber-600" },
                ].map((s) => (
                  <div key={s.label} className="rounded-xl bg-gray-50 p-3 text-center">
                    <div className={`text-xl font-extrabold ${s.color}`}>{s.value}</div>
                    <div className="mt-0.5 text-xs text-gray-500">{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Mock rows */}
              <div className="mt-4 space-y-2">
                {[
                  { id: "VPL26030700", status: "Delivered", dot: "bg-green-500" },
                  { id: "VPL26030701", status: "In Transit", dot: "bg-blue-500" },
                  { id: "VPL26030702", status: "Processing", dot: "bg-amber-500" },
                ].map((row) => (
                  <div key={row.id} className="flex items-center justify-between rounded-lg border border-gray-50 bg-gray-50 px-3 py-2 text-xs">
                    <span className="font-mono font-medium text-gray-700">{row.id}</span>
                    <span className="flex items-center gap-1.5 text-gray-500">
                      <span className={`h-1.5 w-1.5 rounded-full ${row.dot}`} />
                      {row.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Floating card — Label preview */}
            <div className="absolute -left-6 -top-5 hidden rounded-xl border border-green-100 bg-white p-3 shadow-lg sm:block">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0B5D3B]/10 text-sm">🏷️</div>
                <div>
                  <div className="text-xs font-semibold text-gray-800">Label Ready</div>
                  <div className="text-[10px] text-gray-400">A4 · Envelope</div>
                </div>
              </div>
            </div>

            {/* Floating card — Money order */}
            <div className="absolute -right-4 top-1/3 hidden rounded-xl border border-amber-100 bg-white p-3 shadow-lg sm:block">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-sm">💸</div>
                <div>
                  <div className="text-xs font-semibold text-gray-800">Money Order</div>
                  <div className="text-[10px] text-gray-400">Rs 4,500 · COD</div>
                </div>
              </div>
            </div>

            {/* Floating card — Tracking */}
            <div className="absolute -bottom-4 right-8 hidden rounded-xl border border-blue-100 bg-white p-3 shadow-lg sm:block">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-sm">📦</div>
                <div>
                  <div className="text-xs font-semibold text-gray-800">Tracking Update</div>
                  <div className="text-[10px] text-green-600 font-medium">Delivered ✓</div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
