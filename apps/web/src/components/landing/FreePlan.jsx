import { Link } from "react-router-dom";

export default function FreePlan() {
  return (
    <section className="border-b border-emerald-100 bg-white">
      <div className="ui-page">
        <div className="ui-card flex flex-col gap-6 p-8 md:flex-row md:items-center md:justify-between">
          <div className="flex-1">
            <div className="inline-flex items-center rounded-full bg-brand/10 px-3 py-1 text-xs font-semibold text-brand">
              Free Plan - No Credit Card Required
            </div>
            <h2 className="mt-3 text-3xl font-bold text-slate-900">Start with 250 labels every month for free</h2>
            <p className="mt-2 text-sm text-slate-600">Perfect for new stores and growing dispatch teams.</p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              {["250 labels / month", "Bulk tracking", "Money orders"].map((item) => (
                <span key={item} className="rounded-full border border-brand/20 bg-brand/5 px-3 py-1 font-medium text-brand">
                  {item}
                </span>
              ))}
            </div>
          </div>
          <div className="shrink-0">
            <Link to="/register" className="btn-primary">
              Create Free Account
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
