import Card from "./landing/Card";
import SectionTitle from "./landing/SectionTitle";
import { Boxes, CreditCard, UserCircle2 } from "lucide-react";
import labelImage from "../assets/label.png";
import moneyOrderImage from "../assets/money-order.png";
import trackingImage from "../assets/tracking.png";
import complaintImage from "../assets/complaint.png";
import packageImage from "../assets/package.png";
import deliveryMonitoringImage from "../assets/delivery-monitoring.png";

const showcaseCards = [
  {
    title: "Labels",
    description: "Generate dispatch-ready labels with production-safe print output.",
    image: labelImage,
    alt: "Label generation preview",
    href: "/register",
  },
  {
    title: "Money Orders",
    description: "Create aligned money orders linked with shipment value and reference.",
    image: moneyOrderImage,
    alt: "Money orders preview",
    href: "/register",
  },
  {
    title: "Tracking",
    description: "Monitor parcel movement with route-aware events and live status.",
    image: trackingImage,
    alt: "Tracking preview",
    href: "/tracking",
  },
  {
    title: "Complaints",
    description: "Capture complaint cases with context and follow-up progress.",
    image: complaintImage,
    alt: "Complaints workflow preview",
    href: "/register",
  },
  {
    title: "Parcel Booking",
    description: "Book parcel jobs quickly with operator-focused validation controls.",
    image: packageImage,
    alt: "Parcel booking preview",
    href: "/register",
  },
  {
    title: "Delivery Monitoring",
    description: "See operational health across active shipment batches and hubs.",
    image: deliveryMonitoringImage,
    alt: "Delivery monitoring preview",
    href: "/register",
  },
  {
    title: "Profile",
    description: "Manage sender profile defaults used across labels and operations.",
    icon: UserCircle2,
    href: "/register",
  },
  {
    title: "Billing",
    description: "Review plan usage and billing visibility with clean account controls.",
    icon: CreditCard,
    href: "/register",
  },
  {
    title: "Packages",
    description: "Choose packages optimized for team scale and shipment demand.",
    icon: Boxes,
    href: "/register",
  },
];

function CardVisual({ card }) {
  if (card.image) {
    return (
      <div className="flex h-full w-full items-center justify-center p-3">
        <img
          src={card.image}
          alt={card.alt}
          className="h-full w-full object-contain transition-transform duration-500 group-hover:scale-[1.04]"
        />
      </div>
    );
  }
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-4">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[linear-gradient(145deg,#f0fdf4,#dcfce7)] shadow-[0_6px_18px_rgba(16,185,129,0.15)]">
        <card.icon className="h-8 w-8 text-emerald-600" />
      </div>
      <span className="text-center text-xs font-semibold text-slate-500">{card.title}</span>
    </div>
  );
}

export default function ProductShowcase() {
  return (
    <section id="workflow" className="relative overflow-hidden bg-white py-12 md:py-16">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(11,107,58,0.08),transparent_28%),radial-gradient(circle_at_82%_88%,rgba(11,107,58,0.06),transparent_26%)]" />
      <div className="ui-page">
        <SectionTitle
          kicker="Platform Features"
          title="Everything In One Workspace"
          subtitle="Labels, money orders, tracking, complaints, parcel booking -- all accessible from a single operations surface."
        />
        <div className="relative mt-10 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {showcaseCards.map((card) => (
            <a href={card.href} key={card.title} className="block h-full">
              <Card className="group flex h-full min-h-[360px] flex-col overflow-hidden rounded-[22px] border border-slate-200 bg-white p-0 shadow-[0_4px_20px_rgba(15,23,42,0.07)] transition-all duration-300 hover:-translate-y-2 hover:border-emerald-400/50 hover:shadow-[0_0_0_2px_rgba(16,185,129,0.16),0_24px_60px_rgba(15,23,42,0.13)]">
                <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-red-300" />
                    <span className="h-2 w-2 rounded-full bg-amber-300" />
                    <span className="h-2 w-2 rounded-full bg-emerald-400" />
                    <span className="ml-auto text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Module</span>
                  </div>
                </div>

                <div className="h-[190px] p-3">
                  <div className="relative h-full overflow-hidden rounded-xl border border-slate-100 bg-[linear-gradient(155deg,#f8fafc_0%,#f0fdf4_100%)]">
                    <CardVisual card={card} />
                  </div>
                </div>

                <div className="flex flex-1 flex-col px-5 pb-5 pt-2">
                  <div className="text-[15px] font-bold leading-snug text-slate-900">{card.title}</div>
                  <p className="mt-1.5 flex-1 text-sm leading-6 text-slate-500">{card.description}</p>
                  <div className="mt-4 inline-flex h-8 w-fit items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-bold text-emerald-700 transition-colors group-hover:bg-emerald-600 group-hover:text-white">
                    Open Feature
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
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