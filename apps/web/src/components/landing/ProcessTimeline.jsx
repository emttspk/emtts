import Card from "./Card";
import SectionTitle from "./SectionTitle";

const showcaseCards = [
  { title: "Label", image: "/media/label-preview.png" },
  { title: "Money Order", image: "/media/money-order-preview.png" },
  { title: "Tracking Dashboard", image: "/media/tracking-preview.png" },
];

export default function ProcessTimeline() {
  return (
    <section id="workflow" className="py-10 md:py-12">
      <div className="ui-page">
        <SectionTitle kicker="Product Showcase" title="Real Product Surfaces" subtitle="Three focused experiences: labels, money orders, and tracking." />
        <div className="mt-10 grid gap-5 lg:grid-cols-3">
          {showcaseCards.map((card) => (
            <Card key={card.title} className="overflow-hidden rounded-[30px] border border-slate-200 bg-white p-0 shadow-[0_24px_60px_rgba(15,23,42,0.12)]">
              <div className="border-b border-slate-200 bg-slate-50 px-4 py-2">
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-300" />
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
                </div>
              </div>
              <div className="p-3">
                <div className="overflow-hidden rounded-[20px] border border-slate-200 bg-slate-50">
                  <img src={card.image} alt={`${card.title} preview`} className="h-48 w-full object-cover md:h-56" />
                </div>
              </div>
              <div className="px-5 pb-5 text-sm font-semibold uppercase tracking-[0.12em] text-slate-600">{card.title}</div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
