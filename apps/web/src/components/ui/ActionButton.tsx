import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

type ActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
};

const variants: Record<NonNullable<ActionButtonProps["variant"]>, string> = {
  primary:
    "border-transparent bg-[linear-gradient(135deg,#10B981,#0EA5A4)] text-white shadow-[0_18px_38px_rgba(16,185,129,0.24)] hover:-translate-y-0.5 hover:shadow-[0_22px_44px_rgba(16,185,129,0.32)]",
  secondary:
    "border-[color:var(--line)] bg-white text-[color:var(--text-strong)] shadow-[0_10px_24px_rgba(8,18,37,0.06)] hover:-translate-y-0.5 hover:border-[#D9E4F2] hover:bg-[#FBFCFE]",
  danger:
    "border-transparent bg-[linear-gradient(135deg,#EF4444,#DC2626)] text-white shadow-[0_18px_38px_rgba(239,68,68,0.2)] hover:-translate-y-0.5 hover:shadow-[0_22px_44px_rgba(239,68,68,0.3)]",
  ghost:
    "border-transparent bg-transparent text-[color:var(--text-muted)] hover:bg-[#F3F6FB] hover:text-[color:var(--text-strong)]",
};

export default function ActionButton({
  className,
  variant = "primary",
  leadingIcon,
  trailingIcon,
  children,
  type = "button",
  ...rest
}: ActionButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60",
        variants[variant],
        className,
      )}
      {...rest}
    >
      {leadingIcon ? <span className="shrink-0">{leadingIcon}</span> : null}
      <span>{children}</span>
      {trailingIcon ? <span className="shrink-0">{trailingIcon}</span> : null}
    </button>
  );
}