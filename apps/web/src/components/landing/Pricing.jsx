import { Link } from "react-router-dom";

const plans = [
  {
    name: "FREE",
    price: "Rs 0",
    per: "/month",
    badge: null,
    features: [
      { text: "250 labels / month", ok: true },
      { text: "Bulk tracking", ok: true },
      { text: "Money orders", ok: true },
      { text: "Complaint automation", ok: false },
    ],
    cta: "Get Started Free",
    highlight: false,
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
    highlight: true,
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
    highlight: false,
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
    <section id="pricing" className="border-b border-gray-100 bg-white">
      <div className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="text-center">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#0B5D3B]">Pricing</div>
          <h2 className="mt-2 text-3xl font-bold text-gray-900">Simple, transparent plans</h2>
          <p className="mt-2 text-sm text-gray-500">Start free. Upgrade when volume demands it.</p>
        </div>

        <div className="mt-10 grid gap-5 lg:grid-cols-3">
          {plans.map((plan) => (
            <article
              key={plan.name}
              className={`relative flex flex-col rounded-2xl border p-7 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                plan.highlight
                  ? "border-[#0B5D3B]/30 bg-[#0B5D3B] text-white"
                  : "border-gray-100 bg-white"
              }`}
            >
              {plan.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="rounded-full bg-[#16A34A] px-3 py-0.5 text-xs font-semibold text-white shadow">
                    {plan.badge}
                  </span>
                </div>
              )}

              <div className={`text-xs font-semibold uppercase tracking-[0.16em] ${plan.highlight ? "text-green-200" : "text-gray-500"}`}>
                {plan.name}
              </div>
              <div className="mt-3 flex items-baseline gap-1">
                <span className={`text-4xl font-extrabold ${plan.highlight ? "text-white" : "text-[#0B5D3B]"}`}>
                  {plan.price}
                </span>
                <span className={`text-sm ${plan.highlight ? "text-green-200" : "text-gray-400"}`}>{plan.per}</span>
              </div>

              <ul className="mt-5 flex-1 space-y-2.5">
                {plan.features.map((f) => (
                  <li key={f.text} className="flex items-center gap-2 text-sm">
                    <Check ok={f.ok} />
                    <span className={plan.highlight && f.ok ? "text-green-50" : plan.highlight ? "text-green-200" : f.ok ? "text-gray-700" : "text-gray-400"}>
                      {f.text}
                    </span>
                  </li>
                ))}
              </ul>

              <Link
                to="/register"
                className={`mt-7 inline-flex w-full items-center justify-center rounded-xl py-2.5 text-sm font-semibold transition ${
                  plan.highlight
                    ? "bg-white text-[#0B5D3B] hover:bg-green-50"
                    : "bg-[#0B5D3B] text-white hover:bg-[#094E32]"
                }`}
              >
                {plan.cta}
              </Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
