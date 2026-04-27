import Card from "./landing/Card";
import SectionTitle from "./landing/SectionTitle";
import labelImage from "../assets/label.png";
import moneyOrderImage from "../assets/money-order.png";
import trackingImage from "../assets/tracking.png";

const showcaseCards = [
  {
    title: "Label",
    description: "Pakistan Post dispatch label preview sourced from the local image asset.",
    image: labelImage,
    alt: "Pakistan Post label preview",
  },
  {
    title: "Money Order",
    description: "Official Pakistan Post money order sender copy from the local asset library.",
    image: moneyOrderImage,
    alt: "Pakistan Post money order preview",
  },
  {
    title: "Tracking",
    description: "Mapped from the local tracking asset currently available in the workspace.",
    image: trackingImage,
    alt: "Tracking preview asset",
  },
];

export default function ProductShowcase() {
  return (
    <section id="workflow" className="relative overflow-hidden py-12 md:py-16">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(247,251,248,0.65),rgba(255,255,255,0.92))]" />
      <div className="ui-page">
        <SectionTitle kicker="Product Showcase" title="Real Product Surfaces" subtitle="Label, money order, and tracking previews rendered from the provided local image assets." />
        <div className="relative mt-10 grid gap-6 lg:grid-cols-3">
          {showcaseCards.map((card) => (
            <Card key={card.title} className="group overflow-hidden rounded-2xl border border-slate-200/90 bg-white/90 p-0 shadow-[0_24px_60px_rgba(15,23,42,0.1)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_28px_70px_rgba(15,23,42,0.14)]">
              <div className="border-b border-slate-200 bg-slate-50/90 px-4 py-3">
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-300" />
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
                  <span className="ml-2 text-xs font-semibold text-slate-600">Live Product Preview</span>
                </div>
              </div>
              <div className="h-[320px] overflow-hidden p-4">
                <div className="flex h-full items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f7fafc_100%)] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]">
                  <img src={card.image} alt={card.alt} className="h-full w-full rounded-lg object-contain shadow-sm transition-transform duration-500 group-hover:scale-[1.015]" />
                </div>
              </div>
              <div className="px-5 pb-5">
                <div className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-600">{card.title}</div>
                <p className="mt-2 text-sm leading-6 text-slate-600">{card.description}</p>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
