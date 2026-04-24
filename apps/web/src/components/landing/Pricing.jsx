import { Link } from "react-router-dom";

const plans = [
  {
    name: "FREE",
    price: "Rs 0",
    per: "/month",
    badge: "Start Free",
    features: [
      { text: "250 labels / month", ok: true },
      { text: "Bulk tracking", ok: true },
      { text: "Money orders", ok: true },
      { text: "Complaint automation", ok: false },
    ],
    cta: "Create Free Account",
    style: "free",
  },
  {
    name: "STANDARD",
    price: "Rs 999",
    per: "/month",
    badge: "Most Popular",
    features: [
      { text: "1,000 labels / month", ok: true },
      { text: "Bulk tracking", ok: true },
      { text: "Money orders", ok: true },
      { text: "Complaints: 5/day · 50/month", ok: true },
      { text: "Unit cost ×5", ok: true },
    ],
    cta: "Create Free Account",
    style: "highlight",
  },
  {
    name: "BUSINESS",
    price: "Rs 2500",
    per: "/month",
    badge: null,
    features: [
      { text: "3,000 labels / month", ok: true },
      { text: "Bulk tracking", ok: true },
      { text: "Money orders", ok: true },
      { text: "Complaints: 10/day · 300/month", ok: true },
      { text: "Unit cost ×3", ok: true },
    ],
    cta: "Create Free Account",
    style: "plain",
  },
];

function Check({ ok }) {
  return ok ? (
    <svg className="h-4 w-4 shrink-0 text-[#16A34A]" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  ) : (
    <svg className="h-4 w-4 shrink-0 text-gray-300" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

export default function Pricing() {
  return (
    <section id="pricing" className="border-b border-gray-100 bg-[#f0faf4]">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="text-center">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#0B5D3B]">Pricing</div>
          <h2 className="mt-4 text-4xl font-bold text-gray-900">Simple, transparent plans</h2>
          <p className="mt-3 text-base text-gray-600">Start free. Upgrade when your volume demands it.</p>
        </div>

        <div className="mt-16 grid gap-8 lg:grid-cols-3">
          {plans.map((plan) => {
            const isFree = plan.style === "free";
            const isHighlight = plan.style === "highlight";

            return (
              <article
                key={plan.name}
                className={`relative flex flex-col rounded-2xl border p-8 transition hover:-translate-y-1 ${
                  isHighlight
                    ? "border-[#0B5D3B]/40 bg-[#0B5D3B] text-white shadow-[0_20px_50px_rgba(11,93,59,0.25)] hover:shadow-[0_25px_60px_rgba(11,93,59,0.35)]"
                    : isFree
                    ? "border-[#16A34A]/40 bg-white ring-2 ring-[#16A34A]/30 shadow-lg hover:shadow-[0_15px_40px_rgba(22,163,74,0.15)]"
                    : "border-gray-200 bg-white shadow-md hover:shadow-[0_15px_40px_rgba(0,0,0,0.1)]"
                }`}
              >
                {/* Badge */}
                {plan.badge && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <span
                      className={`rounded-full px-3 py-0.5 text-xs font-semibold shadow ${
                        isHighlight
                          ? "bg-[#16A34A] text-white"
                          : "bg-[#0B5D3B] text-white"
                      }`}
                    >
                      {plan.badge}
                    </span>
                  </div>
                )}

                {/* Plan name */}
                <div
                  className={`text-xs font-semibold uppercase tracking-[0.16em] ${
                    isHighlight ? "text-green-200" : "text-gray-500"
                  }`}
                >
                  {plan.name}
                </div>

                {/* Price */}
                <div className="mt-3 flex items-baseline gap-1">
                  <span
                    className={`text-4xl font-extrabold ${
                      isHighlight ? "text-white" : isFree ? "text-[#0B5D3B]" : "text-gray-900"
                    }`}
                  >
                    {plan.price}
                  </span>
                  <span className={`text-sm ${isHighlight ? "text-green-200" : "text-gray-400"}`}>
                    {plan.per}
                  </span>
                </div>

                {/* Features */}
                <ul className="mt-5 flex-1 space-y-2.5">
                  {plan.features.map((f) => (
                    <li key={f.text} className="flex items-center gap-2 text-sm">
                      <Check ok={f.ok} />
                      <span
                        className={
                          isHighlight
                            ? f.ok ? "text-green-50" : "text-green-300 line-through"
                            : f.ok ? "text-gray-700" : "text-gray-400 line-through"
                        }
                      >
                        {f.text}
                      </span>
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <Link
                  to="/register"
                  className={`mt-7 inline-flex w-full items-center justify-center rounded-xl py-3 text-sm font-semibold transition ${
                    isHighlight
                      ? "bg-white text-[#0B5D3B] hover:bg-green-50"
                      : isFree
                      ? "bg-[#0B5D3B] text-white hover:bg-[#094E32]"
                      : "border border-gray-200 bg-white text-gray-800 hover:border-[#0B5D3B] hover:text-[#0B5D3B]"
                  }`}
                >
                  {plan.cta}
                </Link>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
