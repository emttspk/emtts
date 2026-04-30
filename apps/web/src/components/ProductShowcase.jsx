const showcaseCards = [
  { title: "Label", image: "/assets/label.png", href: "/register", orientation: "portrait" },
  { title: "Money Orders", image: "/assets/money-order.png", href: "/register", orientation: "portrait" },
  { title: "Tracking", image: "/assets/track.png", href: "/tracking", orientation: "landscape" },
  { title: "Dashboard", image: "/assets/dashboard.png", href: "/dashboard", orientation: "landscape" },
  { title: "Complaints", image: "/assets/complaint.png", href: "/complaints", orientation: "portrait" },
  { title: "Package", image: "/assets/package.png", href: "/register", orientation: "portrait" },
  { title: "Delivery Monitoring", image: "/assets/tracking.png", href: "/tracking", orientation: "landscape" },
];

export default function ProductShowcase() {
  return (
    <section id="features" className="relative overflow-hidden bg-[#f8fcfa] py-14 md:py-16">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_15%,rgba(11,107,58,0.08),transparent_32%),radial-gradient(circle_at_90%_0%,rgba(15,23,42,0.08),transparent_24%)]" />
      <div className="ui-page relative">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">Products</p>
          <h2 className="mt-2 text-3xl font-black tracking-[-0.03em] text-slate-900 sm:text-4xl">Operational Modules</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600 sm:text-base">Seven core surfaces for Pakistan Post workflows.</p>
        </div>

        <div className="mt-9 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {showcaseCards.map((card) => (
            <article
              key={card.title}
              className="group overflow-hidden rounded-xl border border-slate-200/80 bg-white p-3 shadow-[0_8px_24px_rgba(15,23,42,0.08)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_34px_rgba(15,23,42,0.12)]"
            >
              <div className="h-[260px] overflow-hidden rounded-xl border border-slate-100 bg-slate-50 md:h-[320px]">
                <img
                  src={card.image}
                  alt={card.title}
                  loading="lazy"
                  className={`h-full w-full transition duration-500 group-hover:scale-[1.02] ${card.orientation === "portrait" ? "object-contain p-2" : "object-cover"}`}
                />
              </div>
              <div className="px-1 pt-3">
                <h3 className="text-base font-bold tracking-[-0.01em] text-slate-900">{card.title}</h3>
                <a
                  href={card.href}
                  className="mt-3 inline-flex h-9 items-center justify-center rounded-lg bg-[linear-gradient(135deg,#0f172a,#0b6b3a)] px-4 text-sm font-semibold text-white transition hover:brightness-105"
                >
                  Open
                </a>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
