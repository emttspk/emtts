import type { LucideIcon } from "lucide-react";
import { cn } from "../../lib/cn";

type StatsCardProps = {
  title: string;
  value: string | number;
  detail?: string;
  icon: LucideIcon;
  tone?: "green" | "blue" | "amber" | "red" | "purple" | "cyan";
  className?: string;
  onClick?: () => void;
};

const tones: Record<NonNullable<StatsCardProps["tone"]>, { shell: string; icon: string; ring: string }> = {
  green: { shell: "from-[#ECFDF5] to-white", icon: "bg-[#D1FAE5] text-[#059669]", ring: "hover:border-[#A7F3D0]" },
  blue: { shell: "from-[#EFF6FF] to-white", icon: "bg-[#DBEAFE] text-[#2563EB]", ring: "hover:border-[#BFDBFE]" },
  amber: { shell: "from-[#FFFBEB] to-white", icon: "bg-[#FEF3C7] text-[#D97706]", ring: "hover:border-[#FDE68A]" },
  red: { shell: "from-[#FEF2F2] to-white", icon: "bg-[#FEE2E2] text-[#DC2626]", ring: "hover:border-[#FECACA]" },
  purple: { shell: "from-[#F5F3FF] to-white", icon: "bg-[#EDE9FE] text-[#7C3AED]", ring: "hover:border-[#DDD6FE]" },
  cyan: { shell: "from-[#ECFEFF] to-white", icon: "bg-[#CFFAFE] text-[#0891B2]", ring: "hover:border-[#A5F3FC]" },
};

export default function StatsCard({ title, value, detail, icon: Icon, tone = "blue", className, onClick }: StatsCardProps) {
  const toneClass = tones[tone];
  const Comp = onClick ? "button" : "div";

  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "w-full rounded-[20px] border border-[color:var(--line)] bg-[linear-gradient(135deg,var(--tw-gradient-stops))] p-5 text-left shadow-[0_16px_40px_rgba(8,18,37,0.06)] transition-all duration-200 hover:-translate-y-0.5",
        toneClass.shell,
        toneClass.ring,
        onClick ? "cursor-pointer" : "cursor-default",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--text-muted)]">{title}</div>
          <div className="mt-3 text-3xl font-extrabold tracking-[-0.04em] text-[color:var(--text-strong)]">{value}</div>
          {detail ? <div className="mt-2 text-sm text-[color:var(--text-muted)]">{detail}</div> : null}
        </div>
        <div className={cn("flex h-12 w-12 items-center justify-center rounded-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]", toneClass.icon)}>
          <Icon className="h-5 w-5" strokeWidth={2.1} />
        </div>
      </div>
    </Comp>
  );
}