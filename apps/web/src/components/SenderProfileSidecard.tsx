import Card from "./Card";
import type { MeResponse } from "../lib/types";

type Props = {
  me: MeResponse | null;
  className?: string;
};

export default function SenderProfileSidecard({ me, className = "" }: Props) {
  const senderName = String(me?.user.companyName ?? "").trim() || "-";
  const cnic = String(me?.user.cnic ?? "").trim() || "-";
  const address = String(me?.user.address ?? "").trim() || "-";
  const city = String(me?.user.originCity ?? "").trim() || "-";
  const mobile = String(me?.user.contactNumber ?? "").trim() || "-";
  const packageName = me?.subscription?.plan?.name ?? me?.activePackage?.planName ?? "No package";
  const remainingUnits =
    me?.balances?.unitsRemaining ??
    me?.balances?.labelsRemaining ??
    me?.activePackage?.unitsRemaining ??
    0;

  return (
    <Card className={`p-5 ${className}`}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Sender Profile</div>
      <div className="mt-3 grid gap-2 text-sm text-slate-700">
        <div className="flex items-center justify-between gap-3"><span className="text-slate-500">Sender Name</span><span className="text-right font-semibold text-slate-900">{senderName}</span></div>
        <div className="flex items-center justify-between gap-3"><span className="text-slate-500">CNIC</span><span className="text-right font-semibold text-slate-900">{cnic}</span></div>
        <div className="flex items-center justify-between gap-3"><span className="text-slate-500">Address</span><span className="max-w-[65%] truncate text-right font-semibold text-slate-900" title={address}>{address}</span></div>
        <div className="flex items-center justify-between gap-3"><span className="text-slate-500">City</span><span className="text-right font-semibold text-slate-900">{city}</span></div>
        <div className="flex items-center justify-between gap-3"><span className="text-slate-500">Mobile</span><span className="text-right font-semibold text-slate-900">{mobile}</span></div>
      </div>
      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
        <div className="flex items-center justify-between gap-3 text-xs text-slate-600"><span>Package</span><span className="font-semibold text-slate-900">{packageName}</span></div>
        <div className="mt-1 flex items-center justify-between gap-3 text-xs text-slate-600"><span>Remaining Units</span><span className="font-semibold text-slate-900">{Number(remainingUnits).toLocaleString()}</span></div>
      </div>
    </Card>
  );
}
