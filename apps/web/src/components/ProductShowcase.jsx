import Card from "./landing/Card";
import SectionTitle from "./landing/SectionTitle";
import { Boxes, CreditCard, UserCircle2 } from "lucide-react";
import AdaptiveImageRenderer from "./AdaptiveImageRenderer";
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
    tilt: -1.5,
  },
  {
    title: "Money Orders",
    description: "Create aligned money orders linked with shipment value and reference.",
    image: moneyOrderImage,
    alt: "Money orders preview",
    href: "/register",
    tilt: 1.2,
  },
  {
    title: "Tracking",
    description: "Monitor parcel movement with route-aware events and live status.",
    image: trackingImage,
    alt: "Tracking preview",
    href: "/tracking",
    tilt: -1,
  },
  {
    title: "Complaints",
    description: "Capture complaint cases with context and follow-up progress.",
    image: complaintImage,
    alt: "Complaints workflow preview",
    href: "/register",
    tilt: 1.3,
  },
  {
    title: "Parcel Booking",
    description: "Book parcel jobs quickly with operator-focused validation controls.",
    image: packageImage,
    alt: "Parcel booking preview",
    href: "/register",
    tilt: -1.4,
  },
  {
    title: "Profile",
    description: "Manage sender profile defaults used across labels and operations.",
    icon: UserCircle2,
    href: "/register",
    tilt: 1,
  },
  {
    title: "Billing",
    description: "Review plan usage and billing visibility with clean account controls.",
    icon: CreditCard,
    href: "/register",
    tilt: -1.2,
  },
  {
    title: "Packages",
    description: "Choose packages optimized for team scale and shipment demand.",
    icon: Boxes,
    href: "/register",
    tilt: 1.5,
  },
  {
    title: "Delivery Monitoring",
    description: "See operational health across active shipment batches and hubs.",
    image: deliveryMonitoringImage,
    alt: "Delivery monitoring preview",
    href: "/register",
    tilt: -1.1,
  },
];

export default function ProductShowcase() {
  return (
    <section id="workflow" className="relative overflow-hidden py-10 md:py-14">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(11,107,58,0.12),transparent_28%),linear-gradient(180deg,rgba(247,251,248,0.65),rgba(255,255,255,0.94))]" />
      <div className="ui-page">
        <SectionTitle
          kicker="Product Cards"
          title="Operational Features"
          subtitle="Unified clickable cards for labels, money orders, tracking, complaints, parcel booking, profile, billing, and packages."
        />
        <div className="relative mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {showcaseCards.map((card) => (
            <a href={card.href} key={card.title} className="block h-full">
              <Card
                className="group flex h-full min-h-[390px] flex-col overflow-hidden rounded-[28px] border border-slate-200/90 bg-white/94 p-0 shadow-[0_22px_54px_rgba(15,23,42,0.14)] transition-all duration-300 [transform:rotate(var(--tilt))] hover:[transform:rotate(0deg)_translateY(-10px)] hover:shadow-[0_36px_90px_rgba(15,23,42,0.18)]"
                style={{ "--tilt": `${card.tilt}deg` }}
              >
                <div className="border-b border-slate-200 bg-slate-50/90 px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-red-300" />
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
                    <span className="ml-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">SaaS Module</span>
                  </div>
                </div>

                <div className="min-h-[220px] p-4">
                  <div className="relative flex h-full items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] shadow-[0_12px_32px_rgba(15,23,42,0.07)]">
                    {card.image ? (
                      <AdaptiveImageRenderer
                        src={card.image}
                        alt={card.alt}
                        className="w-full max-w-[320px]"
                        frameClassName="shadow-none"
                        imageClassName="transition-transform duration-500 group-hover:scale-[1.03]"
                        paddingClassName="p-2.5"
                      />
                    ) : (
                      <div className="flex aspect-[16/10] w-full max-w-[320px] items-center justify-center rounded-xl border border-slate-200 bg-[linear-gradient(145deg,#f8fafc,#ecfdf5)]">
                        <card.icon className="h-14 w-14 text-emerald-600" />
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-1 flex-col px-5 pb-5 pt-0">
                  <div className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-600">{card.title}</div>
                  <p className="mt-2 flex-1 text-sm leading-6 text-slate-600">{card.description}</p>
                  <div className="mt-3 text-sm font-semibold text-emerald-700 transition-colors group-hover:text-emerald-800">Open feature</div>
                </div>
              </Card>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
