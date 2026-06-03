import { useEffect, useMemo, useState } from "react";
import { fetchPlans } from "../lib/PackageService";

const MODULES = [
  {
    title: "Label Generation",
    image: "/assets/label.png",
    href: "/register",
    description: "Generate printable labels fast",
  },
  {
    title: "Money Orders",
    image: "/assets/money-order.png",
    href: "/register",
    description: "Create money orders with dispatch records",
  },
  {
    title: "Parcel Booking",
    image: "/assets/package.png",
    href: "/upload",
    description: "Book single or bulk parcels",
  },
  {
    title: "Tracking",
    image: "/assets/track.png",
    href: "/tracking",
    description: "Track shipment progress in real time",
  },
  {
    title: "Admin Dashboard",
    image: "/assets/dashboard.png",
    href: "/dashboard",
    description: "Manage shipments and operations",
  },
  {
    title: "Complaint Automation",
    image: "/assets/complaint.png",
    href: "/complaints",
    description: "File and monitor complaints quickly",
  },
  {
    title: "Billing Packages",
    image: "/assets/money-order.png",
    href: "/#billing-packages",
    description: "Manage usage and plan upgrades",
  },
  {
    title: "Profile & Account",
    image: "/assets/tracking.png",
    href: "/login",
    description: "Secure login and account recovery",
  },
];

const formatPrice = (priceCents) => `Rs ${Math.round((priceCents || 0) / 100).toLocaleString()} / Month`;

function toPlanSlug(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/\s+plan$/i, "")
    .trim();
}

function complaintLimitText(plan) {
  return `${plan.dailyComplaintLimit || 0}/day, ${plan.monthlyComplaintLimit || 0}/month`;
}

export default function OperationsModules() {
  const [plans, setPlans] = useState([]);
  const [plansFailed, setPlansFailed] = useState(false);

  function loadPlans() {
    setPlansFailed(false);
    fetchPlans()
      .then((items) => setPlans(items.filter((plan) => !plan.isSuspended)))
      .catch(() => {
        setPlans([]);
        setPlansFailed(true);
      });
  }

  useEffect(() => {
    loadPlans();
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
          totalSharedUnits: `Total Shared Units: ${(plan.unitsIncluded ?? plan.monthlyLabelLimit ?? 0).toLocaleString()}`,
          complaintLimits: `Complaint Limits: ${complaintLimitText(plan)}`,
          cta: priceCents > 0 ? "Buy Now" : "Get Started Free",
          checkoutHref: priceCents > 0 ? `/billing/checkout?plan=${encodeURIComponent(planSlug)}` : "/register",
          badge: index === 1 || (planSlug || "").toUpperCase() === "STANDARD" ? "Most Popular" : null,
          featured: index === 1 || (planSlug || "").toUpperCase() === "STANDARD",
        };
      });
  }, [plans]);

  return (
    <section id="services" className="relative overflow-hidden bg-[linear-gradient(180deg,#edf6ff_0%,#f7fcfb_46%,#edf4ff_100%)] py-10 md:py-12">
      <div className="mx-auto w-full max-w-[1320px] px-4 md:px-6 lg:px-10">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-700">Operations Product Suite</p>
          <h2 className="mt-2 text-2xl font-black tracking-[-0.03em] text-[#0f1f3a] sm:text-3xl">Core Modules For Daily Dispatch Control</h2>
        </div>

        <div className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {MODULES.map((module, index) => (
            <article
              key={module.title}
              className="group ui-card-premium flex min-h-[300px] flex-col overflow-hidden p-0"
            >
              <div className="relative flex h-36 items-center justify-center overflow-hidden border-b border-[#dce8f5] bg-[radial-gradient(circle_at_top,rgba(47,126,219,0.18),transparent_56%),linear-gradient(160deg,#ffffff,#edf6ff_58%,#eefaf5)] sm:h-40">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(14,165,118,0.12),transparent_34%)]" />
                <img
                  src={module.image}
                  alt={module.title}
                  className="relative z-10 h-24 w-24 object-contain drop-shadow-[0_18px_28px_rgba(15,31,58,0.18)] transition-transform duration-300 group-hover:scale-[1.06] sm:h-28 sm:w-28"
                  loading={index < 2 ? "eager" : "lazy"}
                  decoding="async"
                  fetchPriority={index < 2 ? "high" : "low"}
                />
              </div>

              <div className="flex flex-1 flex-col p-4 sm:p-4.5">
                <h3 className="text-[17px] font-black tracking-[-0.02em] text-[#0f1f3a]">{module.title}</h3>
                <p className="mt-1.5 min-h-[52px] text-[13px] leading-5 text-slate-700">{module.description}</p>
                <a
                  href={module.href}
                  className="btn-primary mt-auto inline-flex h-11 rounded-xl px-4 text-sm font-bold"
                >
                  Explore
                </a>
              </div>
            </article>
          ))}
        </div>

        {plansFailed ? (
          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Billing plans could not load right now.
            <button type="button" className="ml-2 font-semibold underline" onClick={loadPlans}>
              Retry plans
            </button>
          </div>
        ) : null}

        <div id="how-it-works" className="ui-command-surface mt-11 p-5 md:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#2f7edb]">How It Works</p>
          <h3 className="mt-2 text-2xl font-black tracking-[-0.03em] text-[#0f1f3a] sm:text-3xl">Run Operations In 3 Steps</h3>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {[
              {
                title: "Step 1",
                detail: "Upload shipment data",
              },
              {
                title: "Step 2",
                detail: "Generate labels and MO",
              },
              {
                title: "Step 3",
                detail: "Track, complain, manage billing",
              },
            ].map((step, idx) => (
              <div key={step.title} className="relative rounded-2xl border border-[#dce8f5] bg-white/92 p-4 shadow-[0_12px_26px_rgba(10,31,68,0.08)]">
                <div className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-[linear-gradient(135deg,#0f1f3a,#0ea576)] text-xs font-bold text-white">{idx + 1}</div>
                <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-emerald-700">{step.title}</p>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-800">{step.detail}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="ui-command-surface mt-8 p-5 md:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">Why Teams Trust ePost.pk</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[
              "Pakistan Post focused",
              "Bulk seller friendly",
              "Fast PDF generation",
              "Complaint monitoring",
              "Usage/package control",
            ].map((item) => (
              <div key={item} className="rounded-2xl border border-[#dce8f5] bg-white/92 px-4 py-3 text-sm font-semibold text-slate-700 shadow-[0_10px_22px_rgba(10,31,68,0.06)]">
                {item}
              </div>
            ))}
          </div>
        </div>

        <div id="billing-packages" className="mt-12">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">Billing Plans</p>
            <h3 className="mt-2 text-3xl font-black tracking-[-0.03em] text-[#0f1f3a] sm:text-4xl">Billing Packages</h3>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-3">
            {billingPackages.map((plan) => (
              <article
                key={plan.name}
                className={`ui-pricing-card ${plan.featured ? "ui-pricing-card-featured" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-700">{plan.name}</div>
                  {plan.badge ? (
                    <span className="rounded-full bg-[linear-gradient(135deg,#0f1f3a,#0ea576)] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                      {plan.badge}
                    </span>
                  ) : null}
                </div>
                <div className="mt-2 text-2xl font-black tracking-[-0.02em] text-[#0f1f3a]">{plan.price}</div>
                <ul className="mt-5 space-y-2 text-sm leading-6 text-slate-700">
                  <li>{plan.totalSharedUnits}</li>
                  <li className="font-semibold text-slate-600">Services Included:</li>
                  <li>✔ Labels</li>
                  <li>✔ Tracking</li>
                  <li>✔ Money Orders</li>
                  <li>✔ Complaints</li>
                  <li>Complaint Cost: 10 Units Each</li>
                  <li>{plan.complaintLimits}</li>
                </ul>
                <a
                  href={plan.checkoutHref}
                  className={`mt-6 inline-flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-bold transition-all duration-200 hover:-translate-y-0.5 ${
                    plan.name === "FREE"
                      ? "border border-[#dce8f5] bg-white text-slate-800 hover:border-emerald-500 hover:text-emerald-700"
                      : "bg-[linear-gradient(135deg,#0f1f3a,#0ea576)] text-white shadow-[0_10px_24px_rgba(12,129,109,0.28)]"
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