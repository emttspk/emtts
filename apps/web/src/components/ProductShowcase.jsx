import Card from "./landing/Card";
import SectionTitle from "./landing/SectionTitle";
import labelImage from "../assets/label.png";
import moneyOrderImage from "../assets/money-order.png";
import trackingImage from "../assets/tracking.png";
import complaintImage from "../assets/complaint.png";
import packageImage from "../assets/package.png";
import deliveryMonitoringImage from "../assets/delivery-monitoring.png";

const showcaseCards = [
  {
    title: "Labels",
    description: "Print-ready shipping labels with barcode accuracy.",
    image: labelImage,
    alt: "Label preview",
    href: "/register",
  },
  {
    title: "Money Orders",
    description: "Aligned money order forms with shipment reference.",
    image: moneyOrderImage,
    alt: "Money order preview",
    href: "/register",
  },
  {
    title: "Tracking",
    description: "Live parcel status and route history in one view.",
    image: trackingImage,
    alt: "Tracking preview",
    href: "/tracking",
  },
  {
    title: "Complaints",
    description: "Structured complaint intake with progress visibility.",
    image: complaintImage,
    alt: "Complaints preview",
    href: "/register",
  },
  {
    title: "Parcel Booking",
    description: "Fast booking for high-volume dispatch operations.",
    image: packageImage,
    alt: "Parcel booking preview",
    href: "/register",
  },
  {
    title: "Delivery Monitoring",
    description: "Operational health across active shipment batches.",
    image: deliveryMonitoringImage,
    alt: "Delivery monitoring preview",
    href: "/register",
  },
];

function CardVisual({ card }) {
  return (
    <img
      src={card.image}
      alt={card.alt}
      className="h-full w-full object-contain transition-transform duration-500 group-hover:scale-[1.03]"
    />
  );
}

export default function ProductShowcase() {
  return (
    <section id="features" className="relative overflow-hidden bg-white py-12 md:py-16">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_10%,rgba(11,107,58,0.07),transparent_28%)]" />
      <div className="ui-page">
        <SectionTitle
          kicker="Features"
          title="Everything You Need"
          subtitle="Labels, money orders, tracking and complaints — one workspace for all postal operations."
        />
        <div className="relative mt-10 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {showcaseCards.map((card) => (
            <a href={card.href} key={card.title} className="block h-full">
              <Card className="group flex h-full min-h-[340px] flex-col overflow-hidden rounded-[20px] border border-slate-200 bg-white p-0 shadow-[0_2px_16px_rgba(15,23,42,0.06)] transition-all duration-300 hover:-translate-y-2 hover:border-emerald-400/60 hover:shadow-[0_0_0_2px_rgba(16,185,129,0.15),0_20px_52px_rgba(15,23,42,0.12)]">
                <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-red-300" />
                    <span className="h-2 w-2 rounded-full bg-amber-300" />
                    <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  </div>
                </div>

                <div className="h-[188px] p-3">
                  <div className="relative h-full overflow-hidden rounded-xl border border-slate-100 bg-[linear-gradient(155deg,#f8fafc,#f0fdf4)]">
                    <CardVisual card={card} />
                  </div>
                </div>

                <div className="flex flex-1 flex-col px-5 pb-5 pt-2.5">
                  <div className="text-[15px] font-bold leading-tight text-slate-900">{card.title}</div>
                  <p className="mt-1.5 line-clamp-2 flex-1 text-sm leading-6 text-slate-500">{card.description}</p>
                  <div className="mt-4 inline-flex h-7 w-fit items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-bold text-emerald-700 transition-colors group-hover:bg-emerald-600 group-hover:text-white">
                    Open
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                      <path d="M2.5 6h7M6.5 3l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                </div>
              </Card>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}