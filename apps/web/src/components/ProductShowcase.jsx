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
    variant: "portrait",
    image: labelImage,
    alt: "Label generation preview",
    href: "/register",
    tilt: -1.2,
  },
  {
    title: "Money Orders",
    description: "Create aligned money orders linked with shipment value and reference.",
    variant: "document",
    image: moneyOrderImage,
    alt: "Money orders preview",
    href: "/register",
    tilt: 1.1,
  },
  {
    title: "Tracking",
    description: "Monitor parcel movement with route-aware events and live status.",
    variant: "landscape",
    image: trackingImage,
    alt: "Tracking preview",
    href: "/tracking",
    tilt: -0.9,
  },
  {
    title: "Complaints",
    description: "Capture complaint cases with context and follow-up progress.",
    variant: "form",
    image: complaintImage,
    alt: "Complaints workflow preview",
    href: "/register",
    tilt: 0.8,
  },
  {
    title: "Profile",
    description: "Manage sender profile defaults used across labels and operations.",
    variant: "compact",
    icon: UserCircle2,
    href: "/register",
    tilt: -0.7,
  },
  {
    title: "Billing",
    description: "Review plan usage and billing visibility with clean account controls.",
    variant: "invoice",
    icon: CreditCard,
    href: "/register",
    tilt: 1.2,
  },
  {
    title: "Packages",
    description: "Choose packages optimized for team scale and shipment demand.",
    variant: "grid",
    icon: Boxes,
    href: "/register",
    tilt: -1.1,
  },
  {
    title: "Parcel Booking",
    description: "Book parcel jobs quickly with operator-focused validation controls.",
    variant: "landscape",
    image: packageImage,
    alt: "Parcel booking preview",
    href: "/register",
    tilt: 1.4,
  },
  {
    title: "Delivery Monitoring",
    description: "See operational health across active shipment batches and hubs.",
    variant: "landscape",
    image: deliveryMonitoringImage,
    alt: "Delivery monitoring preview",
    href: "/register",
    tilt: -1.1,
  },
];

function CardVisual({ card }) {
  if (card.variant === "portrait") {
    return (
      <div className="mx-auto w-full max-w-[300px] rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_10px_26px_rgba(15,23,42,0.09)]">
        <AdaptiveImageRenderer src={card.image} alt={card.alt} className="mx-auto w-full" imageClassName="transition-transform duration-500 group-hover:scale-[1.03]" />
      </div>
    );
  }
  if (card.variant === "document") {
    return (
      <div className="mx-auto w-full max-w-[320px] rounded-2xl border border-slate-200 bg-[linear-gradient(175deg,#ffffff,#f1f5f9)] p-2">
        <div className="rounded-xl border border-slate-200 bg-white p-2 shadow-[0_12px_28px_rgba(15,23,42,0.1)]">
          <AdaptiveImageRenderer src={card.image} alt={card.alt} className="w-full" imageClassName="transition-transform duration-500 group-hover:scale-[1.02]" />
        </div>
      </div>
    );
  }
  if (card.variant === "landscape") {
    return (
      <div className="mx-auto w-full max-w-[360px] overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_12px_30px_rgba(15,23,42,0.12)]">
        {card.image ? (
          <AdaptiveImageRenderer src={card.image} alt={card.alt} className="w-full" imageClassName="transition-transform duration-500 group-hover:scale-[1.02]" />
        ) : (
          <div className="flex aspect-[16/9] items-center justify-center rounded-xl bg-[linear-gradient(145deg,#f8fafc,#ecfdf5)]">
            <card.icon className="h-14 w-14 text-emerald-600" />
          </div>
        )}
      </div>
    );
  }
  if (card.variant === "form") {
    return (
      <div className="mx-auto w-full max-w-[330px] rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_10px_26px_rgba(15,23,42,0.09)]">
        <div className="space-y-2">
          <div className="h-3 w-24 rounded bg-slate-200" />
          <div className="h-9 rounded-xl border border-slate-200 bg-slate-50" />
          <div className="h-9 rounded-xl border border-slate-200 bg-slate-50" />
        </div>
        <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">Auto ticket timeline enabled</div>
      </div>
    );
  }
  if (card.variant === "compact") {
    return (
      <div className="mx-auto flex w-full max-w-[300px] items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-[0_10px_26px_rgba(15,23,42,0.09)]">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[linear-gradient(145deg,#0f172a,#0b6b3a)] text-white">
          <card.icon className="h-6 w-6" />
        </div>
        <div className="text-sm font-semibold text-slate-700">Account preferences synced</div>
      </div>
    );
  }
  if (card.variant === "invoice") {
    return (
      <div className="mx-auto w-full max-w-[320px] rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_10px_26px_rgba(15,23,42,0.09)]">
        <div className="flex items-center justify-between border-b border-dashed border-slate-200 pb-2 text-xs font-semibold text-slate-500">
          <span>Invoice</span>
          <span>APR 2026</span>
        </div>
        <div className="mt-3 space-y-2 text-xs text-slate-600">
          <div className="flex items-center justify-between"><span>Shipments</span><span className="font-semibold">240</span></div>
          <div className="flex items-center justify-between"><span>Complaints</span><span className="font-semibold">5</span></div>
          <div className="flex items-center justify-between border-t border-slate-200 pt-2 text-sm font-bold text-slate-800"><span>Total</span><span>PKR 29,400</span></div>
        </div>
      </div>
    );
  }
  return (
    <div className="mx-auto grid w-full max-w-[320px] grid-cols-3 gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_10px_26px_rgba(15,23,42,0.09)]">
      {[1, 2, 3, 4, 5, 6].map((cell) => (
        <div key={`${card.title}-${cell}`} className="h-12 rounded-lg border border-slate-200 bg-[linear-gradient(145deg,#f8fafc,#ecfdf5)]" />
      ))}
    </div>
  );
}

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
        <div className="relative mt-8 grid gap-5 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
          {showcaseCards.map((card) => (
            <a href={card.href} key={card.title} className="block h-full">
              <Card
                className="group flex h-full min-h-[390px] flex-col overflow-hidden rounded-[28px] border border-slate-200/90 bg-white/94 p-0 shadow-[0_22px_54px_rgba(15,23,42,0.14)] transition-all duration-300 [transform:rotate(var(--tilt))] hover:[transform:rotate(0deg)_translateY(-9px)] hover:shadow-[0_36px_90px_rgba(15,23,42,0.18)]"
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
                    <CardVisual card={card} />
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
