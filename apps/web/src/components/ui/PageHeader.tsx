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
    <div className={cn("flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow ? (
          <div className="mb-2 inline-flex items-center rounded-full border border-[#DCEBFF] bg-[#EFF6FF] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#2563EB]">
            {eyebrow}
          </div>
        ) : null}
        <h1 className="text-3xl font-extrabold tracking-[-0.04em] text-[color:var(--text-strong)]">{title}</h1>
        {subtitle ? <p className="mt-2 max-w-3xl text-sm leading-6 text-[color:var(--text-muted)]">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
    </div>
  );
}