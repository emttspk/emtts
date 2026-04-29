import Card from "./Card";
import type { MeResponse } from "../lib/types";

type Props = {
  me: MeResponse | null;
  className?: string;
  compact?: boolean;
};

type RowProps = {
  label: string;
  value: string;
  truncate?: boolean;
};

function DetailRow({ label, value, truncate = false }: RowProps) {
  return (
    <div className="grid grid-cols-[92px_minmax(0,1fr)] items-start gap-3 text-sm text-slate-700">
      <span className="text-slate-500">{label}</span>
      <span className={truncate ? "truncate text-right font-semibold text-slate-900" : "text-right font-semibold text-slate-900"} title={value}>
        {value}
      </span>
    </div>
  );
}

export default function SenderProfileCard({ me, className = "", compact = false }: Props) {
  const senderName = String(me?.user.companyName ?? "").trim() || "-";
  const cnic = String(me?.user.cnic ?? "").trim() || "-";
  const address = String(me?.user.address ?? "").trim() || "-";
  const city = String(me?.user.originCity ?? "").trim() || "-";
  const mobile = String(me?.user.contactNumber ?? "").trim() || "-";
  const packageName = me?.subscription?.plan?.name ?? me?.activePackage?.planName ?? "No package";
  const remainingUnits = me?.balances?.unitsRemaining ?? me?.balances?.labelsRemaining ?? me?.activePackage?.unitsRemaining ?? 0;
  const rowGap = compact ? "gap-2" : "gap-3";

  return (
    <Card className={`${compact ? "p-4" : "p-5"} ${className}`}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Sender Profile</div>
      <div className={`mt-3 grid ${rowGap}`}>
        <DetailRow label="Name" value={senderName} />
        <DetailRow label="CNIC" value={cnic} />
        <DetailRow label="Address" value={address} truncate />
        <DetailRow label="City" value={city} />
        <DetailRow label="Mobile" value={mobile} />
        <DetailRow label="Package" value={packageName} truncate />
        <DetailRow label="Remaining Units" value={Number(remainingUnits).toLocaleString()} />
      </div>
    </Card>
  );
}
