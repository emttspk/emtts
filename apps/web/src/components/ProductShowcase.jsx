import dashbordCard from "../../../../images/dashbord.png";

const OPERATIONS_SUITE = [
  { title: "Label Generation", image: "/assets/label.png" },
  { title: "Money Order Generation", image: "/assets/money-order.png" },
  { title: "Tracking", image: "/assets/tracking.png" },
  { title: "Dashboard", image: dashbordCard },
];

export default function ProductShowcase() {
  return (
    <section className="relative overflow-hidden bg-[linear-gradient(180deg,#f4fbff_0%,#f8fcfa_40%,#eef6ff_100%)] py-14 md:py-16">
      <div className="mx-auto w-full max-w-[1400px] px-5 lg:px-12">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-black tracking-[-0.03em] text-slate-950 sm:text-4xl">Operations Product Suite</h2>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
          {OPERATIONS_SUITE.map((card) => (
            <article
              key={card.title}
              className="rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-[0_18px_38px_rgba(15,23,42,0.12)] transition hover:-translate-y-1 hover:shadow-[0_26px_54px_rgba(15,23,42,0.16)]"
            >
              <div className="overflow-hidden rounded-xl border border-slate-100 bg-slate-50">
                <img src={card.image} alt={card.title} className="h-[220px] w-full object-contain p-3" loading="lazy" />
              </div>
              <p className="mt-3 text-center text-base font-bold text-slate-900">{card.title}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
