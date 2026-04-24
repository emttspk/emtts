import { Link } from "react-router-dom";

export default function FreePlan() {
  return (
    <section className="border-b border-gray-100 bg-[#f0faf4]">
      <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-6 overflow-hidden rounded-2xl border border-[#0B5D3B]/20 bg-white p-6 shadow md:flex-row md:items-center md:justify-between md:p-8">
          <div className="flex-1">
            <div className="inline-flex items-center rounded-full bg-[#0B5D3B]/10 px-3 py-1 text-xs font-semibold text-[#0B5D3B]">
              ✓ Free Plan — No credit card required
            </div>
            <h2 className="mt-3 text-2xl font-bold text-gray-900">250 labels every month, absolutely free</h2>
            <p className="mt-1.5 text-sm text-gray-500">The fastest way to start printing Pakistan Post labels at scale.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {["250 labels/month", "Bulk tracking", "Money orders"].map((tag) => (
                <span key={tag} className="rounded-full border border-[#0B5D3B]/20 bg-[#0B5D3B]/5 px-3 py-1 text-xs font-medium text-[#0B5D3B]">
                  ✓ {tag}
                </span>
              ))}
              <span className="rounded-full border border-red-100 bg-red-50 px-3 py-1 text-xs font-medium text-red-600">
                ✗ Complaint automation
              </span>
            </div>
          </div>
          <div className="shrink-0">
            <Link
              to="/register"
              className="inline-flex items-center justify-center rounded-xl bg-[#0B5D3B] px-6 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-[#094E32]"
            >
              Create Free Account →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
