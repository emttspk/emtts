import { Package, CheckCircle2, Clock, ArrowUpRight, TrendingUp } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../lib/cn";

export type UnifiedShipmentCardKey = "ALL" | "DELIVERED" | "PENDING" | "RETURNED" | "COMPLAINTS";

export type UnifiedShipmentCardItem = {
  key: UnifiedShipmentCardKey;
  label: string;
  parcels: number;
  amount?: number;
  active?: boolean;
};

function formatAmount(value?: number) {
  if (value == null || !Number.isFinite(value)) return "Rs 0";
  return `Rs ${Math.max(0, Math.round(value)).toLocaleString()}`;
}

export default function UnifiedShipmentCards({
  items,
  onSelect,
  className,
}: {
  items: UnifiedShipmentCardItem[];
  onSelect?: (key: UnifiedShipmentCardKey) => void;
  className?: string;
}) {
  const iconByKey: Record<UnifiedShipmentCardKey, ReactNode> = {
    ALL: <Package className="h-5 w-5" />,
    DELIVERED: <CheckCircle2 className="h-5 w-5" />,
    PENDING: <Clock className="h-5 w-5" />,
    RETURNED: <ArrowUpRight className="h-5 w-5" />,
    COMPLAINTS: <TrendingUp className="h-5 w-5" />,
  };

  const toneByKey: Record<UnifiedShipmentCardKey, string> = {
    ALL: "border-slate-200 bg-white",
    DELIVERED: "border-emerald-200 bg-emerald-50",
    PENDING: "border-amber-200 bg-amber-50",
    RETURNED: "border-red-200 bg-red-50",
    COMPLAINTS: "border-violet-200 bg-violet-50",
  };

  return (
    <div className={cn("grid gap-3 sm:grid-cols-5", className)}>
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onSelect?.(item.key)}
          className={cn(
            "rounded-2xl border p-4 text-left transition-all",
            toneByKey[item.key],
            item.active ? "ring-2 ring-brand/35" : "hover:shadow-sm",
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="text-slate-700">{iconByKey[item.key]}</div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">{item.label}</div>
          </div>
          <div className="mt-3 text-xl font-bold text-slate-900">{item.parcels.toLocaleString()} Parcels</div>
          <div className="mt-1 text-xs font-semibold text-slate-600">{formatAmount(item.amount)}</div>
        </button>
      ))}
    </div>
  );
}
