const productCards = [
  { title: "Label Generation", image: "/assets/label.png", href: "/register" },
  { title: "Money Order Generation", image: "/assets/money-order.png", href: "/register" },
  { title: "Tracking", image: "/assets/tracking.png", href: "/tracking" },
  { title: "Dashboard", image: "/assets/dashboard.png", href: "/dashboard" },
];

export default function ProductShowcase() {
  return (
    <section id="features" className="relative overflow-hidden bg-[#f7fcfa] py-14 md:py-16">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_15%,rgba(11,107,58,0.08),transparent_32%),radial-gradient(circle_at_90%_0%,rgba(15,23,42,0.07),transparent_24%)]" />

      <div className="ui-page relative">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">Pakistan Post Product Suite</p>
          <h2 className="mt-2 text-3xl font-black tracking-[-0.03em] text-slate-900 sm:text-4xl">Core Operations Modules</h2>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
          {productCards.map((card) => (
            <article
              key={card.title}
              className="rounded-xl border border-white/75 bg-white/90 p-3 shadow-lg backdrop-blur-sm transition hover:-translate-y-0.5 hover:shadow-[0_16px_34px_rgba(15,23,42,0.14)]"
            >
              <div className="h-[320px] overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                <img src={card.image} alt={card.title} loading="lazy" className="h-full w-full object-contain p-3" />
              </div>
              <h3 className="mt-4 text-base font-bold tracking-[-0.01em] text-slate-900">{card.title}</h3>
              <a
                href={card.href}
                className="mt-3 inline-flex h-10 items-center justify-center rounded-lg bg-[linear-gradient(135deg,#0f172a,#0b6b3a)] px-4 text-sm font-bold text-white transition hover:brightness-105"
              >
                Open
              </a>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
