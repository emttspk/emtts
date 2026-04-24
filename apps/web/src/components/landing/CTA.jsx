import { Link } from "react-router-dom";

export default function CTA() {
  return (
    <section className="relative overflow-hidden bg-[#0B5D3B]">
      <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-white/5" />
      <div className="pointer-events-none absolute -bottom-10 left-10 h-48 w-48 rounded-full bg-white/5" />
      <div className="relative mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-white sm:text-4xl">
            Ready to streamline your dispatch?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base text-green-100">
            Join dispatch teams using ePost to generate labels, print money orders, track parcels, and manage complaints — all in one place.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              to="/register"
              className="inline-flex rounded-xl bg-white px-7 py-3 text-sm font-semibold text-[#0B5D3B] shadow transition hover:bg-green-50"
            >
              Create Free Account
            </Link>
            <a
              href="#pricing"
              className="inline-flex rounded-xl border border-white/30 px-7 py-3 text-sm font-medium text-white transition hover:bg-white/10"
            >
              View Pricing
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
