import { Link } from "react-router-dom";

export default function FreePlan() {
  return (
    <section className="border-b border-gray-100 bg-gray-50">
      <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-[#0B5D3B]/20 bg-white p-6 shadow-sm md:p-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#0B5D3B]">Free Plan</div>
              <h2 className="mt-2 text-2xl font-bold text-gray-900">Start with 250 labels every month</h2>
              <p className="mt-2 text-sm text-gray-600">Perfect for new dispatch teams testing workflow before scaling.</p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium text-gray-700">
                <span className="rounded-full bg-gray-100 px-3 py-1">250 labels/month</span>
                <span className="rounded-full bg-gray-100 px-3 py-1">Tracking included</span>
                <span className="rounded-full bg-gray-100 px-3 py-1">Money orders included</span>
                <span className="rounded-full bg-red-50 px-3 py-1 text-red-700">No complaint</span>
              </div>
            </div>
            <div>
              <Link to="/register" className="inline-flex items-center justify-center rounded-xl bg-[#16A34A] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#14853d]">
                Create Free Account
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
