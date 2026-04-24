import { Link } from "react-router-dom";

export default function CTA() {
  return (
    <section className="relative overflow-hidden border-b border-emerald-100 bg-brand">
      <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-white/10" />
      <div className="pointer-events-none absolute -bottom-10 left-10 h-48 w-48 rounded-full bg-white/10" />
      <div className="ui-page relative text-center">
        <h2 className="text-4xl font-bold text-white">Ready to streamline your dispatch?</h2>
        <p className="mx-auto mt-4 max-w-xl text-base text-emerald-100">
          Generate labels, track parcels, and manage operations from one Pakistan Post workspace.
        </p>
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link to="/register" className="btn-secondary border-white/40 bg-white text-brand">
            Create Free Account
          </Link>
          <a href="#pricing" className="btn-secondary border-white/40 bg-transparent text-white hover:bg-white/10">
            View Pricing
          </a>
        </div>
      </div>
    </section>
  );
}
