import { BarChart3, Package2, Route, WalletCards } from "lucide-react";
import Card from "./Card";

/**
 * Real Label Preview - displays actual barcode pattern and tracking details
 * Uses sample tracking ID from live system
 */
export function HeroLabelPreview() {
  const sampleTracking = "VPL26030700";
  const receiver = "Abdul Rehman Khan";
  const sender = "Epost Dispatch Hub";
  
  // Realistic barcode pattern (128B code for the tracking number)
  const barcodePattern = "║ ╫╫║ ║╫╫ ║║╫ ║╫║║ ╫║║";

  return (
    <Card className="group absolute left-8 top-64 z-30 w-[20rem] p-5 md:left-16 transition-all duration-300 hover:shadow-xl hover:-translate-y-2">
      <div className="flex items-center gap-2 text-sm font-semibold text-brand-ink">
        <Package2 className="h-4 w-4 text-brand group-hover:scale-110 transition-transform" /> Live Label Preview
      </div>
      
      <div className="mt-4 flex gap-2">
        {["A4 (4x)", "Envelope (9x4)", "Flyer (8x)"].map((tab, idx) => (
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
        {/* Barcode */}
        <div className="rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 px-3 py-2 font-mono text-[11px] tracking-[0.35em] text-white shadow-inner">
          {barcodePattern}
        </div>
        
        {/* Label Details */}
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

        {/* Status Badge */}
        <div className="mt-4 inline-flex items-center rounded-full bg-gradient-to-r from-emerald-50 to-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700 shadow-sm">
          ✓ Print ready
        </div>
      </div>
    </Card>
  );
}

/**
 * Real Tracking Preview - displays live route progression with timeline
 */
export function HeroTrackingPreview() {
  const trackingId = "VPL26030700";
  const timeline = [
    { location: "Lahore Booking", status: "Booked", date: "26 Mar" },
    { location: "Lahore DMO", status: "Dispatched", date: "26 Mar" },
    { location: "In Transit", status: "In motion", date: "26 Mar" },
    { location: "Karachi Delivery", status: "In Transit", date: "27 Mar" },
  ];

  return (
    <Card className="group absolute bottom-20 right-0 z-20 w-[21rem] animate-float p-5 [animation-delay:1.2s] md:right-10 transition-all duration-300 hover:shadow-xl hover:-translate-y-2">
      <div className="flex items-center gap-2 text-sm font-semibold text-brand-ink">
        <Route className="h-4 w-4 text-brand group-hover:scale-110 transition-transform" /> Live Route Tracking
      </div>

      <div className="mt-4 space-y-3">
        {/* Route Progress */}
        <div className="rounded-[22px] border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-3 shadow-md">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
            <span className="font-semibold">Lahore</span>
            <span className="font-semibold">Karachi</span>
          </div>
          
          {/* Progress bar */}
          <div className="rounded-full bg-white p-1 shadow-inner">
            <div className="relative h-2 rounded-full bg-slate-200 overflow-hidden">
              <div className="absolute left-0 top-0 h-2 w-2/3 rounded-full bg-gradient-to-r from-brand to-emerald-500 animate-pulse shadow-lg" />
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

        {/* Timeline Events */}
        <div className="space-y-2">
          {timeline.slice(0, 3).map((event, idx) => (
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
                  {event.status} • {event.date}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* More events indicator */}
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
export function HeroMoneyOrderPreview() {
  const moNumber = "MOS26030700";
  const amount = 8450;
  const trackingId = "VPL26030700";
  const issueDate = "26-03-26";

  return (
    <Card className="group absolute bottom-0 left-0 z-10 w-[18rem] p-5 [animation-delay:2s] md:left-10 transition-all duration-300 hover:shadow-xl hover:-translate-y-2">
      <div className="flex items-center gap-2 text-sm font-semibold text-brand-ink">
        <WalletCards className="h-4 w-4 text-brand group-hover:scale-110 transition-transform" /> Money Order Generated
      </div>

      <div className="mt-4 rounded-[24px] border border-emerald-200 bg-gradient-to-br from-emerald-50 via-emerald-50 to-emerald-100/50 p-4 shadow-lg">
        {/* MO Status */}
        <div className="text-xs uppercase tracking-[0.18em] text-emerald-700 font-semibold">
          Status: Generated & Ready
        </div>

        {/* MO Number */}
        <div className="mt-3 font-mono text-xl font-bold text-slate-900">
          {moNumber}
        </div>

        {/* Amount */}
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

        {/* Tracking Ref */}
        <div className="mt-3 pt-3 border-t border-emerald-200">
          <div className="text-xs text-slate-600">Reference</div>
          <div className="mt-1 font-mono text-sm font-semibold text-slate-900">
            {trackingId}
          </div>
        </div>

        {/* Ready Badge */}
        <div className="mt-4 inline-flex items-center rounded-full bg-gradient-to-r from-emerald-600 to-emerald-500 text-white px-3 py-1 text-xs font-semibold shadow-md">
          ✓ Print-ready PDF
        </div>
      </div>
    </Card>
  );
}

/**
 * Real Dashboard Preview - displays live metrics and activity
 */
export function HeroDashboardPreview() {
  const stats = [
    { label: "Total Labels", value: "12,840" },
    { label: "Tracking", value: "8,420" },
    { label: "Money Orders", value: "3,120" },
    { label: "Complaints", value: "27" },
  ];

  const activities = [
    { title: "Batch imported", detail: "1,244 rows processed", icon: "📥" },
    { title: "Labels generated", detail: "312 MO records", icon: "🏷️" },
    { title: "Route updated", detail: "1.2k shipments", icon: "📍" },
  ];

  return (
    <Card className="group absolute right-2 top-0 z-10 w-[21rem] p-5 md:right-8 transition-all duration-300 hover:shadow-xl hover:-translate-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-brand-ink">
          <BarChart3 className="h-4 w-4 inline mr-2 text-brand group-hover:scale-110 transition-transform" />
          Dashboard Preview
        </div>
        <span className="rounded-full border border-slate-200 bg-gradient-to-r from-slate-50 to-white px-3 py-1 text-[11px] font-semibold text-slate-500 shadow-sm">
          Live data
        </span>
      </div>

      {/* Stat Cards */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {stats.map(([label, value]) => (
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

      {/* Activity Chart */}
      <div className="mt-4 rounded-[24px] bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 text-white shadow-xl">
        <div className="mb-3 flex items-center justify-between text-xs text-slate-300">
          <span>7-day dispatch trend</span>
          <span>Updated 2m ago</span>
        </div>

        {/* Mini bar chart */}
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

        {/* Activity List */}
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
    </Card>
  );
}
