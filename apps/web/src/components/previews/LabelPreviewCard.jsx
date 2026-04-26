import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

export default function LabelPreviewCard({ className = "" }) {
  const trackingId = "VPL26030700";
  const barcodeRef = useRef(null);

  useEffect(() => {
    if (!barcodeRef.current) return;
    JsBarcode(barcodeRef.current, trackingId, {
      format: "CODE128",
      displayValue: false,
      margin: 0,
      height: 28,
      width: 1.2,
      background: "transparent",
      lineColor: "#0f172a",
    });
  }, [trackingId]);

  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-3 shadow-sm ${className}`.trim()}>
      <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">
        <span>Label Preview</span>
        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700">Code128</span>
      </div>

      <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-2">
        <svg ref={barcodeRef} className="h-7 w-full" role="img" aria-label="Code128 barcode" />
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] text-slate-600">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
          <div className="text-[9px] uppercase tracking-[0.1em] text-slate-400">Receiver</div>
          <div className="mt-1 font-semibold text-slate-800">Abdul Rehman</div>
          <div className="text-slate-500">Karachi</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
          <div className="text-[9px] uppercase tracking-[0.1em] text-slate-400">Sender</div>
          <div className="mt-1 font-semibold text-slate-800">EPOS Hub</div>
          <div className="text-slate-500">Lahore</div>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2 text-[10px]">
        <div className="rounded-lg border border-slate-200 bg-white p-2">
          <div className="text-[9px] uppercase tracking-[0.1em] text-slate-400">Tracking</div>
          <div className="mt-1 font-mono font-semibold text-brand-ink">{trackingId}</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-2">
          <div className="text-[9px] uppercase tracking-[0.1em] text-slate-400">Weight</div>
          <div className="mt-1 font-semibold text-slate-800">0.72 kg</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-2">
          <div className="text-[9px] uppercase tracking-[0.1em] text-slate-400">MO Value</div>
          <div className="mt-1 font-semibold text-slate-800">Rs. 8,450</div>
        </div>
      </div>
    </div>
  );
}
