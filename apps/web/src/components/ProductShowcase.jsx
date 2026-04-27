import Card from "./landing/Card";
import SectionTitle from "./landing/SectionTitle";
import labelImage from "../assets/label.png";
import moneyOrderImage from "../assets/money-order.png";
import trackingImage from "../assets/tracking.png";
import complaintImage from "../assets/complaint.png";

const showcaseCards = [
  {
    title: "Generate Labels",
    description: "Create dispatch-ready labels with barcode, recipient profile, and compliant print layout.",
    image: labelImage,
    alt: "Generate labels preview",
  },
  {
    title: "Money Orders",
    description: "Issue sender-side money orders with secure references and amount confirmation instantly.",
    image: moneyOrderImage,
    alt: "Money orders preview",
  },
  {
    title: "Tracking",
    description: "Monitor parcel journeys with route-aware events, ETA signals, and status badges.",
    image: trackingImage,
    alt: "Tracking preview",
  },
  {
    title: "Complaints",
    description: "Capture and escalate delivery complaints with structured context and SLA-friendly inputs.",
    image: complaintImage,
    alt: "Complaints workflow preview",
  },
  {
    title: "Parcel Booking",
    description: "Book parcel batches fast with clean validation and production-grade dispatch controls.",
    image: labelImage,
    alt: "Parcel booking preview",
  },
  {
    title: "Delivery Monitoring",
    description: "Track high-volume shipment health with operational insights across destinations and hubs.",
    image: moneyOrderImage,
    alt: "Delivery monitoring preview",
  },
];

export default function ProductShowcase() {
  return (
    <section id="workflow" className="relative overflow-hidden py-14 md:py-18">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(11,107,58,0.12),transparent_28%),linear-gradient(180deg,rgba(247,251,248,0.65),rgba(255,255,255,0.94))]" />
      <div className="ui-page">
        <SectionTitle kicker="Product Showcase" title="Premium Dispatch Surfaces" subtitle="Six production-ready cards for labels, money orders, tracking, complaints, parcel booking, and delivery monitoring." />
        <div className="relative mt-10 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {showcaseCards.map((card) => (
            <Card key={card.title} className="group flex h-full flex-col overflow-hidden rounded-[26px] border border-slate-200/90 bg-white/92 p-0 shadow-[0_28px_65px_rgba(15,23,42,0.12)] transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_34px_85px_rgba(15,23,42,0.17)]">
              <div className="border-b border-slate-200 bg-slate-50/90 px-4 py-3">
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-300" />
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
                  <span className="ml-2 text-xs font-semibold text-slate-600">Live Product Preview</span>
                </div>
              </div>
              <div className="overflow-hidden p-4">
                <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f7fafc_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]">
                  <img src={card.image} alt={card.alt} className="h-auto w-full object-contain transition-transform duration-500 group-hover:scale-[1.02]" />
                </div>
              </div>
              <div className="flex flex-1 flex-col px-5 pb-5">
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
