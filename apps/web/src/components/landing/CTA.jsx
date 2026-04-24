import { Link } from "react-router-dom";

export default function CTA() {
  return (
    <section className="bg-[#0B5D3B]">
      <div className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-white/20 bg-white/10 p-8 text-center shadow-lg backdrop-blur-sm sm:p-10">
          <h2 className="text-3xl font-bold text-white">Move your dispatch operation to one premium dashboard</h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-green-100 sm:text-base">
            Labels, money orders, tracking, and complaint operations in one reliable SaaS workflow.
          </p>
          <Link to="/register" className="mt-6 inline-flex rounded-xl bg-[#16A34A] px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#14853d]">
            Create Free Account
          </Link>
        </div>
      </div>
    </section>
  );
}
