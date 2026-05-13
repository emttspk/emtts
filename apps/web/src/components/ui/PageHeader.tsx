import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  actions?: ReactNode;
  className?: string;
};

export default function PageHeader({ title, subtitle, eyebrow, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow ? (
          <div className="mb-1 inline-flex items-center rounded-full border border-[#DCEBFF] bg-[#EFF6FF] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#2563EB]">
            {eyebrow}
          </div>
        ) : null}
        <h1 className="text-[1.55rem] font-extrabold tracking-[-0.04em] text-[color:var(--text-strong)] md:text-[1.72rem]">{title}</h1>
        {subtitle ? <p className="mt-0.5 max-w-3xl text-[11px] leading-[18px] text-[color:var(--text-muted)]">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}