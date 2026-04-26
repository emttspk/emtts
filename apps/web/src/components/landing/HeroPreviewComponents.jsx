import { useEffect, useMemo, useRef, useState } from "react";
import JsBarcode from "jsbarcode";
import { motion } from "framer-motion";
import { BarChart3, Package2, Route, WalletCards } from "lucide-react";
import Card from "./Card";

const STACK_ORDER_ROTATION = [-4, 0, 4, -2];

function useRotatingStack(length) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActive((prev) => (prev + 1) % length);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [length]);

  return active;
}

function StackLayer({ children, order, total }) {
  const depth = total - order;
  const rotate = STACK_ORDER_ROTATION[order] ?? STACK_ORDER_ROTATION[STACK_ORDER_ROTATION.length - 1];
  const scale = order === 0 ? 1 : Math.max(0.9, 0.96 - order * 0.02);
  const y = order * 40;
  const opacity = Math.max(0.3, 1 - order * 0.16);

  return (
    <motion.div
      className="absolute inset-x-0 top-0"
      initial={{ y: 120, opacity: 0 }}
      animate={{ y, rotate, scale, opacity }}
      transition={{
        type: "spring",
        damping: 24,
        stiffness: 210,
        mass: 0.72,
      }}
      style={{ zIndex: depth }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Real Label Preview - displays actual barcode pattern and tracking details
 * Uses sample tracking ID from live system
 */
export function HeroLabelPreview({ className = "" }) {
  const sampleTracking = "VPL26030700";
  const receiver = "Abdul Rehman Khan";
  const sender = "Epost Dispatch Hub";
  const barcodeRef = useRef(null);

  useEffect(() => {
    if (!barcodeRef.current) return;
    JsBarcode(barcodeRef.current, sampleTracking, {
      format: "CODE128",
      displayValue: false,
      margin: 0,
      height: 30,
      width: 1.35,
      background: "transparent",
      lineColor: "#f8fafc",
    });
  }, [sampleTracking]);

  return (
    <Card className={`group w-[20rem] rounded-3xl border border-white/80 bg-white/95 p-4 shadow-xl transition-all duration-300 hover:shadow-2xl ${className}`}>
      <div className="flex items-center gap-2 text-sm font-semibold text-brand-ink">
        <Package2 className="h-4 w-4 text-brand transition-transform group-hover:scale-110" /> Label Preview
      </div>

      <div className="mt-4 flex gap-2">
        {["A4", "Envelope", "Multi Sheet"].map((tab, idx) => (
          <span
            key={tab}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
              idx === 0
                ? "bg-brand text-white shadow-md"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {tab}
          </span>
        ))}
      </div>

      <div className="mt-4 rounded-[24px] border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4 shadow-lg">
        <div className="rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 px-3 py-2 shadow-inner">
          <svg ref={barcodeRef} className="h-[30px] w-full" role="img" aria-label="Code128 barcode" />
        </div>

        <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200">
          <img src="/media/label-preview.png" alt="Real label preview" className="h-24 w-full object-cover" />
        </div>

        <div className="mt-4 grid gap-2 text-sm text-slate-600">
          <div>
            <span className="font-semibold text-slate-900">TO:</span> {receiver}
          </div>
          <div>
            <span className="font-semibold text-slate-900">FROM:</span> {sender}
          </div>
          <div>
            <span className="font-semibold text-slate-900">Tracking:</span>{" "}
            <span className="font-mono text-brand font-semibold">{sampleTracking}</span>
          </div>
        </div>

        <div className="mt-4 inline-flex items-center rounded-full bg-gradient-to-r from-emerald-50 to-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700 shadow-sm">
          Print Ready
        </div>
      </div>
    </Card>
  );
}

/**
 * Real Tracking Preview - displays live route progression with timeline
 */
export function HeroTrackingPreview({ className = "" }) {
  const trackingId = "VPL26030700";
  const timeline = [
    { location: "Lahore Booking", status: "Booked", date: "26 Mar" },
    { location: "Lahore DMO", status: "Dispatched", date: "26 Mar" },
    { location: "In Transit", status: "In motion", date: "26 Mar" },
    { location: "Karachi Delivery", status: "In Transit", date: "27 Mar" },
  ];

  return (
    <Card className={`group w-[21rem] rounded-3xl border border-white/80 bg-white/95 p-4 shadow-xl transition-all duration-300 hover:shadow-2xl ${className}`}>
      <div className="flex items-center gap-2 text-sm font-semibold text-brand-ink">
        <Route className="h-4 w-4 text-brand transition-transform group-hover:scale-110" /> Tracking Preview
      </div>

      <div className="mt-4 space-y-3">
        <div className="rounded-[22px] border border-slate-200 bg-gradient-to-br from-emerald-50/70 to-white p-3 shadow-md">
          <svg viewBox="0 0 320 92" className="h-20 w-full">
            <path d="M16 64 C70 14, 148 90, 304 26" stroke="#d1fae5" strokeWidth="7" fill="none" />
            <path d="M16 64 C70 14, 148 90, 220 45" stroke="#0b6b3a" strokeWidth="6" fill="none" strokeLinecap="round" />
            <circle cx="16" cy="64" r="7" fill="#0b6b3a" />
            <circle cx="220" cy="45" r="7" fill="#22c55e" />
            <circle cx="304" cy="26" r="7" fill="#94a3b8" />
          </svg>
        </div>

        <div className="rounded-[22px] border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-3 shadow-md">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
            <span className="font-semibold">Lahore</span>
            <span className="font-semibold">Karachi</span>
          </div>

          <div className="rounded-full bg-white p-1 shadow-inner">
            <div className="relative h-2 overflow-hidden rounded-full bg-slate-200">
              <div className="absolute left-0 top-0 h-2 w-2/3 rounded-full bg-gradient-to-r from-brand to-emerald-500 shadow-lg" />
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between">
            <span className="font-mono text-sm font-semibold text-slate-900">
              {trackingId}
            </span>
            <span className="inline-flex items-center rounded-full bg-gradient-to-r from-amber-50 to-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700 shadow-sm">
              In Transit
            </span>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <img src="/media/tracking-preview.png" alt="Tracking dashboard preview" className="h-20 w-full object-cover" />
        </div>

        <div className="space-y-2">
          {timeline.slice(0, 3).map((event) => (
            <div
              key={event.location}
              className="flex items-start gap-3 rounded-[18px] border border-slate-200 bg-white px-3 py-2.5 transition-all hover:shadow-md hover:bg-slate-50"
            >
              <div className="mt-1 h-2 w-2 rounded-full bg-brand flex-shrink-0 shadow-md" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-slate-900">
                  {event.location}
                </div>
                <div className="text-xs text-slate-500">
                  {event.status} - {event.date}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="text-center text-xs text-slate-500">
          +1 more event in timeline
        </div>
      </div>
    </Card>
  );
}

/**
 * Real Money Order Preview - displays generated MO with amount and status
 */
export function HeroMoneyOrderPreview({ className = "" }) {
  const moNumber = "MOS26030700";
  const amount = 8450;
  const trackingId = "VPL26030700";
  const issueDate = "26-03-26";

  return (
    <Card className={`group w-[18rem] rounded-3xl border border-white/80 bg-white/95 p-4 shadow-xl transition-all duration-300 hover:shadow-2xl ${className}`}>
      <div className="flex items-center gap-2 text-sm font-semibold text-brand-ink">
        <WalletCards className="h-4 w-4 text-brand transition-transform group-hover:scale-110" /> Money Order Preview
      </div>

      <div className="mt-4 rounded-[24px] border border-emerald-200 bg-gradient-to-br from-emerald-50 via-emerald-50 to-emerald-100/50 p-4 shadow-lg">
        <div className="text-xs uppercase tracking-[0.18em] text-emerald-700 font-semibold">
          Status: Ready for disbursement
        </div>

        <div className="mt-3 font-mono text-xl font-bold text-slate-900">
          {moNumber}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-xs text-slate-600">Amount</div>
            <div className="mt-1 font-semibold text-slate-900">
              Rs. {amount.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-600">Issue Date</div>
            <div className="mt-1 font-semibold text-slate-900">{issueDate}</div>
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-emerald-200">
          <div className="text-xs text-slate-600">Reference</div>
          <div className="mt-1 font-mono text-sm font-semibold text-slate-900">
            {trackingId}
          </div>
        </div>

        <div className="mt-4 inline-flex items-center rounded-full bg-gradient-to-r from-emerald-600 to-emerald-500 text-white px-3 py-1 text-xs font-semibold shadow-md">
          Verified Payment Slip
        </div>

        <div className="mt-3 overflow-hidden rounded-2xl border border-emerald-200">
          <img src="/media/money-order-preview.png" alt="Money order preview" className="h-20 w-full object-cover" />
        </div>
      </div>
    </Card>
  );
}

/**
 * Real Dashboard Preview - displays live metrics and activity
 */
export function HeroDashboardPreview({ className = "" }) {
  const stats = [
    { label: "Total Labels", value: "12,840" },
    { label: "Tracking", value: "8,420" },
    { label: "Money Orders", value: "3,120" },
    { label: "Complaints", value: "27" },
  ];

  const activities = [
    { title: "Batch imported", detail: "1,244 rows processed", icon: "IMP" },
    { title: "Labels generated", detail: "312 MO records", icon: "LBL" },
    { title: "Route updated", detail: "1.2k shipments", icon: "RTE" },
  ];

  return (
    <Card className={`group w-[21rem] rounded-3xl border border-white/80 bg-white/95 p-4 shadow-xl transition-all duration-300 hover:shadow-2xl ${className}`}>
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-brand-ink">
          <BarChart3 className="mr-2 inline h-4 w-4 text-brand transition-transform group-hover:scale-110" />
          Dashboard Snapshot
        </div>
        <span className="rounded-full border border-slate-200 bg-gradient-to-r from-slate-50 to-white px-3 py-1 text-[11px] font-semibold text-slate-500 shadow-sm">
          Live data
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {stats.map(({ label, value }) => (
          <div
            key={label}
            className="rounded-2xl border border-slate-100 bg-gradient-to-br from-slate-50 to-white p-3 shadow-md transition-all hover:shadow-lg hover:-translate-y-1"
          >
            <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">
              {label}
            </div>
            <div className="mt-2 text-xl font-bold text-slate-900">{value}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-[24px] bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 text-white shadow-xl">
        <div className="mb-3 flex items-center justify-between text-xs text-slate-300">
          <span>7-day dispatch trend</span>
          <span>Updated 2m ago</span>
        </div>

        <div className="grid grid-cols-7 items-end gap-1.5 mb-4">
          {[28, 42, 36, 54, 64, 58, 72].map((bar, idx) => (
            <div key={idx} className="h-16 rounded bg-white/10 p-1 shadow-inner">
              <div
                className="w-full rounded bg-gradient-to-t from-emerald-400 to-emerald-300 shadow-lg"
                style={{ height: `${bar}%` }}
              />
            </div>
          ))}
        </div>

        <div className="space-y-2">
          {activities.map((item) => (
            <div
              key={item.title}
              className="flex items-center justify-between rounded-2xl bg-white/10 px-3 py-2 transition-all hover:bg-white/15"
            >
              <div>
                <div className="text-sm font-semibold text-white">
                  {item.icon} {item.title}
                </div>
                <div className="text-xs text-slate-300">{item.detail}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200">
        <img src="/media/dashboard-preview.png" alt="Dashboard preview" className="h-20 w-full object-cover" />
      </div>
    </Card>
  );
}

export function HeroPreviewStack() {
  const active = useRotatingStack(4);

  const cards = useMemo(
    () => [
      { key: "label", node: <HeroLabelPreview /> },
      { key: "money-order", node: <HeroMoneyOrderPreview /> },
      { key: "tracking", node: <HeroTrackingPreview /> },
      { key: "dashboard", node: <HeroDashboardPreview /> },
    ],
    [],
  );

  return (
    <div className="relative mx-auto h-[31rem] w-[21rem] md:h-[33rem] md:w-[22rem]">
      {cards.map((card, index) => {
        const order = (index - active + cards.length) % cards.length;
        return (
          <StackLayer key={card.key} order={order} total={cards.length}>
            {card.node}
          </StackLayer>
        );
      })}
    </div>
  );
}
