export default function MoneyOrderPreviewCard({ className = "" }) {
  return (
    <div className={`rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-3 shadow-sm ${className}`.trim()}>
      <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.1em] text-emerald-700">
        <span>Money Order</span>
        <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-white">Issued</span>
      </div>

      <div className="mt-2 rounded-xl border border-emerald-200 bg-white p-2">
        <div className="grid grid-cols-2 gap-2 text-[10px]">
          <div>
            <div className="text-[9px] uppercase tracking-[0.1em] text-slate-400">MOS ID</div>
            <div className="mt-1 font-mono font-semibold text-slate-900">MOS26030700</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-[0.1em] text-slate-400">Amount</div>
            <div className="mt-1 font-semibold text-slate-900">Rs. 8,450</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-[0.1em] text-slate-400">Sender</div>
            <div className="mt-1 font-semibold text-slate-900">EPOS Hub</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-[0.1em] text-slate-400">Receiver</div>
            <div className="mt-1 font-semibold text-slate-900">Abdul Rehman</div>
          </div>
        </div>
        <div className="mt-2 border-t border-emerald-100 pt-2 text-[10px] text-slate-600">
          Issue Date: <span className="font-semibold text-slate-800">26-03-26</span>
        </div>
      </div>
    </div>
  );
}
