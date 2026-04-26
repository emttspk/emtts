import Card from "./landing/Card";
import SectionTitle from "./landing/SectionTitle";

const showcaseCards = [
  {
    title: "Label Card",
    content: (
      <div className="rounded-2xl border border-slate-200 bg-white p-3 text-[10px] leading-tight text-slate-700">
        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
          <div>
            <div className="text-[11px] font-extrabold tracking-[0.08em] text-slate-900">PAKISTAN POST</div>
            <div className="text-[9px] text-slate-500">Official Dispatch Label</div>
          </div>
          <div className="text-right">
            <div className="font-bold text-slate-900">VPL</div>
            <div className="font-semibold text-emerald-700">Rs. 8,450</div>
          </div>
        </div>
        <div className="mt-2 rounded-lg border border-slate-300 bg-slate-950 px-2 py-2 text-slate-50">
          <svg viewBox="0 0 340 38" className="h-8 w-full" aria-label="label barcode">
            <rect x="0" y="0" width="340" height="38" fill="#020617" />
            {Array.from({ length: 56 }).map((_, idx) => (
              <rect key={idx} x={3 + idx * 6} y="3" width={idx % 3 === 0 ? 3.2 : 1.6} height="32" fill="#f8fafc" />
            ))}
          </svg>
          <div className="mt-1 text-center text-[10px] font-bold tracking-[0.16em] text-slate-100">VPL26030700</div>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
            <div className="text-[9px] uppercase tracking-[0.08em] text-slate-500">Receiver</div>
            <div className="mt-0.5 font-semibold text-slate-900">Abdul Rehman, Karachi</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
            <div className="text-[9px] uppercase tracking-[0.08em] text-slate-500">Sender</div>
            <div className="mt-0.5 font-semibold text-slate-900">Lahore Hub, Punjab</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
            <div className="text-[9px] uppercase tracking-[0.08em] text-slate-500">Weight</div>
            <div className="mt-0.5 font-semibold text-slate-900">1.25 kg</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
            <div className="text-[9px] uppercase tracking-[0.08em] text-slate-500">Product</div>
            <div className="mt-0.5 font-semibold text-slate-900">Value Payable</div>
          </div>
        </div>
        <div className="mt-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-[10px]"><span className="font-semibold text-emerald-800">Money Order:</span> MOS26030700</div>
        <div className="mt-1.5 border-t border-slate-200 pt-1.5 text-center text-[9px] text-slate-500">
          <div className="font-semibold text-slate-700">Free Bulk Dispatch &amp; Tracking</div>
          <div>www.epost.pk</div>
        </div>
      </div>
    ),
  },
  {
    title: "Money Order Card",
    content: (
      <div className="rounded-2xl border-2 border-emerald-700 bg-[#f9fff8] p-3 text-[10px] text-slate-800">
        <div className="flex items-start justify-between border-b border-emerald-200 pb-2">
          <div>
            <div className="text-[11px] font-extrabold tracking-[0.08em] text-emerald-900">PAKISTAN POST MONEY ORDER</div>
            <div className="text-[9px] text-emerald-800/80">Official Settlement Slip</div>
          </div>
          <div className="rounded-md border border-emerald-300 bg-white px-2 py-1 text-right">
            <div className="text-[9px] text-slate-500">Ref</div>
            <div className="font-bold text-slate-900">MOS26030700</div>
          </div>
        </div>
        <div className="mt-2 rounded-md border border-slate-300 bg-slate-900 px-2 py-1.5 text-white">
          <svg viewBox="0 0 300 30" className="h-6 w-full" aria-label="money order barcode">
            <rect x="0" y="0" width="300" height="30" fill="#0f172a" />
            {Array.from({ length: 52 }).map((_, idx) => (
              <rect key={idx} x={4 + idx * 5.6} y="3" width={idx % 4 === 0 ? 2.8 : 1.4} height="24" fill="#f8fafc" />
            ))}
          </svg>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <div className="rounded-md border border-emerald-200 bg-white px-2 py-1.5"><div className="text-[9px] text-slate-500">Amount</div><div className="text-sm font-extrabold text-emerald-800">Rs. 8,450</div></div>
          <div className="rounded-md border border-emerald-200 bg-white px-2 py-1.5"><div className="text-[9px] text-slate-500">Date</div><div className="font-semibold text-slate-900">27 Mar 2026</div></div>
          <div className="rounded-md border border-emerald-200 bg-white px-2 py-1.5"><div className="text-[9px] text-slate-500">Sender</div><div className="font-semibold text-slate-900">Lahore Dispatch Hub</div></div>
          <div className="rounded-md border border-emerald-200 bg-white px-2 py-1.5"><div className="text-[9px] text-slate-500">Receiver</div><div className="font-semibold text-slate-900">Abdul Rehman, Karachi</div></div>
        </div>
      </div>
    ),
  },
  {
    title: "Tracking Route Card",
    content: (
      <div className="rounded-2xl border border-slate-200 bg-white p-3 text-[10px] text-slate-700">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold tracking-[0.08em] text-slate-900">TRACKING ROUTE</div>
            <div className="text-[9px] text-slate-500">ID: VPL26030700</div>
          </div>
          <div className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[9px] font-semibold">ETA: 27 Mar, 04:30 PM</div>
        </div>
        <svg viewBox="0 0 330 150" className="mt-2 h-[160px] w-full rounded-xl border border-slate-200 bg-slate-50" aria-label="Pakistan map route">
          <path d="M36 118 L72 66 L120 50 L170 70 L226 58 L280 82 L248 116 L190 124 L126 132 L72 126 Z" fill="#dff3ea" stroke="#9ac7b3" strokeWidth="2" />
          <path d="M82 62 Q138 98 178 88 T254 98" stroke="#c6d7cf" strokeWidth="5" fill="none" strokeLinecap="round" />
          <path d="M82 62 Q138 98 178 88 T254 98" stroke="#0b6b3a" strokeWidth="4" fill="none" strokeLinecap="round" strokeDasharray="8 7">
            <animate attributeName="stroke-dashoffset" from="0" to="-60" dur="1.5s" repeatCount="indefinite" />
          </path>
          <circle cx="82" cy="62" r="5" fill="#0f172a" />
          <circle cx="138" cy="98" r="5" fill="#eab308" />
          <circle cx="178" cy="88" r="5" fill="#f97316" />
          <circle cx="254" cy="98" r="5" fill="#22c55e" />
          <text x="66" y="52" fontSize="10" fill="#0f172a" fontWeight="700">Lahore</text>
          <text x="112" y="116" fontSize="10" fill="#0f172a" fontWeight="700">Multan</text>
          <text x="156" y="76" fontSize="10" fill="#0f172a" fontWeight="700">Islamabad</text>
          <text x="238" y="117" fontSize="10" fill="#0f172a" fontWeight="700">Karachi</text>
        </svg>
        <div className="mt-1.5 flex flex-wrap gap-1.5 text-[9px] font-semibold">
          <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">Booked</span>
          <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-700">In Transit</span>
          <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">Delivered</span>
        </div>
      </div>
    ),
  },
  {
    title: "Complaint Form Card",
    content: (
      <div className="rounded-2xl border border-slate-200 bg-white p-3 text-[10px] text-slate-700">
        <div className="text-[11px] font-bold tracking-[0.08em] text-slate-900">COMPLAINT FORM</div>
        <div className="mt-2 grid gap-1.5">
          <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5"><span className="font-semibold">Tracking ID:</span> VPL26030700</div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5"><span className="font-semibold">Issue:</span> Pending delivery update</div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5"><span className="font-semibold">Reply mode:</span> POST</div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5"><span className="font-semibold">Customer:</span> Abdul Rehman</div>
        </div>
      </div>
    ),
  },
  {
    title: "Booking Dashboard Card",
    content: (
      <div className="rounded-2xl border border-slate-200 bg-white p-3 text-[10px] text-slate-700">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-bold tracking-[0.08em] text-slate-900">BOOKING DASHBOARD</div>
          <div className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-semibold text-emerald-700">Live</div>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-2"><div className="text-[8px] uppercase tracking-[0.08em] text-slate-500">Today</div><div className="mt-1 text-base font-bold text-slate-900">264</div></div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-2"><div className="text-[8px] uppercase tracking-[0.08em] text-slate-500">Queued</div><div className="mt-1 text-base font-bold text-slate-900">41</div></div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-2"><div className="text-[8px] uppercase tracking-[0.08em] text-slate-500">Done</div><div className="mt-1 text-base font-bold text-emerald-700">223</div></div>
        </div>
      </div>
    ),
  },
];

export default function ProductShowcase() {
  return (
    <section id="workflow" className="py-10 md:py-12">
      <div className="ui-page">
        <SectionTitle kicker="Product Showcase" title="Real Product Surfaces" subtitle="Live label, money order, tracking, complaints, and booking previews." />
        <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {showcaseCards.map((card) => (
            <Card key={card.title} className="overflow-hidden rounded-[30px] border border-slate-200 bg-white p-0 shadow-[0_24px_60px_rgba(15,23,42,0.12)]">
              <div className="border-b border-slate-200 bg-slate-50 px-4 py-2">
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-300" />
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
                  <span className="ml-2 text-xs font-semibold text-slate-600">Live Product Preview</span>
                </div>
              </div>
              <div className="h-[320px] overflow-hidden p-3">
                {card.content}
              </div>
              <div className="px-5 pb-5 text-sm font-semibold uppercase tracking-[0.12em] text-slate-600">{card.title}</div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
