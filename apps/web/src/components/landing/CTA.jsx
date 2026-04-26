import { Link } from "react-router-dom";

export default function CTA() {
  return (
    <section className="relative overflow-hidden py-12 md:py-14">
      <div className="ui-page relative">
        <div className="relative overflow-hidden rounded-[40px] bg-[linear-gradient(135deg,#0F172A,#111E32,#0B6B3A)] px-6 py-12 text-center shadow-[0_40px_120px_rgba(15,23,42,0.32)] sm:px-10 lg:px-16 lg:py-16">
          <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-white/10 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-10 left-10 h-48 w-48 rounded-full bg-emerald-400/20 blur-2xl" />
          <h2 className="font-display text-4xl font-extrabold tracking-[-0.05em] text-white md:text-5xl">Start Shipping Smarter</h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg leading-8 text-slate-200">
            Launch with free labels, then scale into money orders, tracking visibility, and complaint automation from one polished workspace.
        </p>
          <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center">
            <Link to="/register" className="btn-secondary w-full border-white/40 bg-white text-brand sm:w-auto">
            Create Free Account
            </Link>
            <a href="#pricing" className="btn-secondary w-full border-white/20 bg-transparent text-white hover:bg-white/10 sm:w-auto">
            View Pricing
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

