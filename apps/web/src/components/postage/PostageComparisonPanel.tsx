export default function PostageComparisonPanel({ pakistanPostTotal, courierTotal, savingAmount }: { pakistanPostTotal: number; courierTotal: number; savingAmount: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
      Pakistan Post: Rs. {pakistanPostTotal} | Courier Bundle: Rs. {courierTotal} | Saving: Rs. {savingAmount}
    </div>
  );
}
