import { useEffect, useMemo, useState } from "react";
import { fetchPlans } from "../lib/PackageService";

const MODULES = [
  {
    title: "Label Generation",
    image: "/assets/label.png",
    href: "/register",
    description: "Generate printable shipping labels instantly",
  },
  {
    title: "Money Orders",
    image: "/assets/money-order.png",
    href: "/register",
    description: "Create verified money orders with dispatch records",
  },
  {
    title: "Tracking",
    image: "/assets/track.png",
    href: "/tracking",
    description: "Track parcel movement and delivery status in real time",
  },
  {
    title: "Dashboard",
    image: "/assets/dashboard.png",
    href: "/dashboard",
    description: "Manage shipments, analytics, and operational workflow",
  },
  {
    title: "Complaints",
    image: "/assets/complaint.png",
    href: "/complaints",
    description: "Register and monitor customer complaints",
  },
];

const formatPrice = (priceCents) => `Rs ${Math.round((priceCents || 0) / 100).toLocaleString()} / Month`;

function toPlanSlug(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/\s+plan$/i, "")
    .trim();
}

function complaintText(plan) {
  const included = Number(plan.complaintsIncluded || 0);
  if (included <= 0) return "Complaints: Not included";
  const parts = [];
  if (plan.dailyComplaintLimit && plan.dailyComplaintLimit > 0) {
    parts.push(`${plan.dailyComplaintLimit}/day`);
  }
  if (plan.monthlyComplaintLimit && plan.monthlyComplaintLimit > 0) {
    parts.push(`${plan.monthlyComplaintLimit}/month`);
  }
  if (!parts.length) {
    parts.push(`${included}/month`);
  }
  return `Complaints: ${parts.join(", ")}`;
}

export default function OperationsModules() {
  const [plans, setPlans] = useState([]);

  useEffect(() => {
    fetchPlans()
      .then((items) => setPlans(items.filter((plan) => !plan.isSuspended)))
      .catch(() => setPlans([]));
  }, []);

  const billingPackages = useMemo(() => {
    return [...plans]
      .sort((a, b) => (a.discountPriceCents ?? a.priceCents) - (b.discountPriceCents ?? b.priceCents))
      .map((plan, index) => {
        const planSlug = toPlanSlug(plan.name);
        const priceCents = plan.discountPriceCents ?? plan.priceCents;
        return {
          name: planSlug.toUpperCase() || "PLAN",
          price: formatPrice(priceCents),
          shipmentLimit: `Labels/Units: ${(plan.monthlyLabelLimit || 0).toLocaleString()}`,
          moneyOrderLimit: `Tracking: ${(plan.monthlyTrackingLimit || 0).toLocaleString()}`,
          trackingAccess: `Money Orders: ${(plan.moneyOrdersIncluded || 0) > 0 ? "Included" : "Not included"}`,
          complaintSupport: complaintText(plan),
          cta: priceCents > 0 ? "Buy Now" : "Get Started Free",
          checkoutHref: priceCents > 0 ? `/billing/checkout?plan=${encodeURIComponent(planSlug)}` : "/register",
          badge: index === 1 ? "Most Popular" : null,
          featured: index === 1,
        };
      });
  }, [plans]);

  return (
    <section className="relative overflow-hidden bg-[linear-gradient(180deg,#f4fbff_0%,#f8fcfa_45%,#eef6ff_100%)] py-14 md:py-16">
      <div className="mx-auto w-full max-w-[1400px] px-4 md:px-6 lg:px-12">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-700">Operations Product Suite</p>
          <h2 className="mt-2 text-3xl font-black tracking-[-0.03em] text-slate-950 sm:text-4xl">
            Core Modules
          </h2>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-5">
          {MODULES.map((module) => (
            <article
              key={module.title}
              className="rounded-2xl border border-white/80 bg-white/70 p-4 shadow-[0_20px_42px_rgba(15,23,42,0.14)] backdrop-blur-lg transition hover:-translate-y-1 hover:shadow-[0_26px_54px_rgba(15,23,42,0.18)]"
            >
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                <img src={module.image} alt={module.title} className="h-[240px] w-full object-contain p-4" loading="lazy" />
              </div>
              <h3 className="mt-4 text-lg font-black tracking-[-0.02em] text-slate-900">{module.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{module.description}</p>
              <a
                href={module.href}
                className="mt-4 inline-flex h-10 items-center justify-center rounded-lg bg-[linear-gradient(135deg,#0f172a,#0b6b3a)] px-4 text-sm font-bold text-white"
              >
                Open Module
              </a>
            </article>
          ))}
        </div>

        <div className="mt-16">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">Billing Plans</p>
            <h3 className="mt-2 text-3xl font-black tracking-[-0.03em] text-slate-950 sm:text-4xl">
              Flexible Billing Packages
            </h3>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-3">
            {billingPackages.map((plan) => (
              <article
                key={plan.name}
                className={`rounded-2xl border bg-white/75 p-6 shadow-[0_22px_44px_rgba(15,23,42,0.14)] backdrop-blur-xl ${
                  plan.featured
                    ? "border-emerald-400/60 shadow-[0_22px_44px_rgba(11,107,58,0.18)]"
                    : "border-white/80"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-700">{plan.name}</div>
                  {plan.badge ? (
                    <span className="rounded-full bg-emerald-700 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                      {plan.badge}
                    </span>
                  ) : null}
                </div>
                <div className="mt-2 text-2xl font-black tracking-[-0.02em] text-slate-950">{plan.price}</div>
                <ul className="mt-5 space-y-2 text-sm leading-6 text-slate-700">
                  <li>{plan.shipmentLimit}</li>
                  <li>{plan.moneyOrderLimit}</li>
                  <li>{plan.trackingAccess}</li>
                  <li>{plan.complaintSupport}</li>
                </ul>
                <a
                  href={plan.checkoutHref}
                  className={`mt-6 inline-flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-bold transition-all duration-200 hover:-translate-y-0.5 ${
                    plan.name === "FREE"
                      ? "border border-slate-300 bg-white text-slate-800 hover:border-emerald-500 hover:text-emerald-700"
                      : "bg-[linear-gradient(135deg,#0f172a,#0b6b3a)] text-white shadow-[0_8px_20px_rgba(11,107,58,0.28)]"
                  }`}
                >
                  {plan.cta}
                </a>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}