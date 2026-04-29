type ManualMoneyOrderRow = {
  receiverName: string;
  receiverAddress: string;
  receiverMobile: string;
  amount: string;
  trackingId: string;
  articleNumber: string;
  city: string;
};

type MoneyOrderFormProps = {
  rows: ManualMoneyOrderRow[];
  maxRows: number;
  onChangeRow: (index: number, patch: Partial<ManualMoneyOrderRow>) => void;
  onRemoveRow: (index: number) => void;
  onAddRow: () => void;
};

export default function MoneyOrderForm(props: MoneyOrderFormProps) {
  const canAddRow = props.rows.length < props.maxRows;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-base font-semibold text-slate-950">Manual Entry</div>
          <div className="mt-1 text-xs font-medium text-slate-600">Required: receiver name, address, mobile, amount. Optional: tracking ID, article number, city.</div>
        </div>
        <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
          {props.rows.length}/{props.maxRows} rows
        </div>
      </div>

      <div className="space-y-3">
        {props.rows.map((row, index) => (
          <div key={`mo-row-${index}`} className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 sm:grid-cols-2 xl:grid-cols-4">
            <input className="field-input" placeholder="Receiver Name *" value={row.receiverName} onChange={(event) => props.onChangeRow(index, { receiverName: event.target.value })} />
            <input className="field-input" placeholder="Receiver Address *" value={row.receiverAddress} onChange={(event) => props.onChangeRow(index, { receiverAddress: event.target.value })} />
            <input className="field-input" placeholder="Receiver Mobile *" value={row.receiverMobile} onChange={(event) => props.onChangeRow(index, { receiverMobile: event.target.value })} />
            <input className="field-input" placeholder="Amount *" value={row.amount} onChange={(event) => props.onChangeRow(index, { amount: event.target.value })} />
            <input className="field-input" placeholder="Tracking ID (optional)" value={row.trackingId} onChange={(event) => props.onChangeRow(index, { trackingId: event.target.value })} />
            <input className="field-input" placeholder="Article Number (optional)" value={row.articleNumber} onChange={(event) => props.onChangeRow(index, { articleNumber: event.target.value })} />
            <input className="field-input" placeholder="City (optional)" value={row.city} onChange={(event) => props.onChangeRow(index, { city: event.target.value })} />
            <div className="flex justify-end sm:col-span-2 xl:col-span-4">
              <button type="button" className="rounded-xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50" onClick={() => props.onRemoveRow(index)}>
                Remove Row
              </button>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={props.onAddRow}
        disabled={!canAddRow}
        className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-all hover:border-brand/40 hover:text-brand disabled:opacity-50"
      >
        Add Row
      </button>
    </div>
  );
}
