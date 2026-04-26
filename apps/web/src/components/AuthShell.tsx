import { Link } from "react-router-dom";
import { ArrowUpRight, BadgeCheck, CheckCircle2, LayoutDashboard, ShieldCheck, Sparkles } from "lucide-react";

const perks = [
  "Bulk labels and envelopes with clean PDF output",
  "Money order references aligned with value-payable shipments",
  "Tracking and complaint workflows from the same workspace",
  "Operational UI designed for daily dispatch teams",
];

export default function AuthShell(props: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-brand-radial">
      <div className="pointer-events-none absolute inset-0 bg-hero-grid bg-[size:34px_34px] opacity-35" />
      <div className="pointer-events-none absolute -top-28 left-1/2 h-[500px] w-[860px] -translate-x-1/2 rounded-full bg-brand/10 blur-3xl" aria-hidden />

      <div className="relative mx-auto grid min-h-screen w-full max-w-7xl items-center gap-12 px-6 py-12 md:grid-cols-[1.05fr_0.95fr] md:px-8 lg:py-16 xl:px-10">
        <div className="hidden md:block">
          <Link to="/" className="inline-flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand text-sm font-extrabold text-white shadow-glow">EP</div>
            <div>
              <div className="text-base font-semibold text-slate-900">Epost.pk</div>
              <div className="text-xs text-slate-600">Pakistan Post shipment management, rebuilt as a premium SaaS workspace</div>
            </div>
          </Link>

          <div className="mt-10 ui-kicker"><Sparkles className="h-4 w-4" /> Premium workspace access</div>
          <h1 className="mt-8 max-w-xl font-display text-5xl font-extrabold tracking-[-0.05em] text-slate-950">{props.title}</h1>
          <p className="mt-4 max-w-xl text-lg leading-8 text-slate-600">{props.subtitle}</p>

          <div className="mt-8 grid gap-3">
            {perks.map((item) => (
              <div key={item} className="flex items-center gap-3 rounded-3xl border border-white/60 bg-white/70 px-4 py-4 text-sm text-slate-700 shadow-sm backdrop-blur-xl">
                <CheckCircle2 className="h-4 w-4 text-brand" />
                {item}
              </div>
            ))}
          </div>

          <div className="mt-8 grid gap-4 xl:grid-cols-2">
            <div className="ui-panel p-5">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-900">Operations overview</div>
                <LayoutDashboard className="h-4 w-4 text-brand" />
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                {[
                  ["Labels", "1,284"],
                  ["Tracking", "842"],
                  ["Complaints", "27"],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl bg-slate-50 px-4 py-3">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">{label}</div>
                    <div className="mt-2 text-xl font-bold text-slate-900">{value}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-[32px] bg-[linear-gradient(135deg,#0F172A,#142236)] p-5 text-white shadow-card">
              <div className="flex items-center gap-2 text-sm font-semibold text-white"><ShieldCheck className="h-4 w-4 text-emerald-300" /> Secure onboarding</div>
              <div className="mt-4 space-y-3 text-sm text-slate-200">
                <div className="rounded-2xl bg-white/10 px-4 py-3">Free account setup</div>
                <div className="rounded-2xl bg-white/10 px-4 py-3">Sender profile ready for label generation</div>
                <div className="rounded-2xl bg-white/10 px-4 py-3">Live access to tracking and complaints</div>
              </div>
            </div>
          </div>
        </div>

        <div className="mx-auto w-full max-w-md">
          <div className="md:hidden">
            <Link to="/" className="inline-flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand text-sm font-semibold text-white shadow-glow">EP</div>
              <div className="text-sm font-semibold text-slate-900">Epost.pk</div>
            </Link>
            <h1 className="mt-6 text-3xl font-semibold tracking-tight text-slate-900">{props.title}</h1>
            <p className="mt-2 text-sm text-slate-600">{props.subtitle}</p>
          </div>

          <div className="ui-glass mt-8 overflow-hidden p-2">
            <div className="ui-panel p-6 md:p-7">{props.children}</div>
          </div>

          <div className="mt-6 flex items-center justify-center gap-4 text-xs text-slate-600">
            <span>(c) {new Date().getFullYear()} Epost.pk</span>
            <span className="h-1 w-1 rounded-full bg-slate-300" />
            <Link to="/" className="inline-flex items-center gap-1 hover:text-brand">
              Home <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
            <span className="h-1 w-1 rounded-full bg-slate-300" />
            <span className="inline-flex items-center gap-1 text-brand"><BadgeCheck className="h-3.5 w-3.5" /> Trusted workflow</span>
          </div>
        </div>
      </div>
    </div>
  );
}


