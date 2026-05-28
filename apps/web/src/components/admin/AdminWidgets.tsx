import type { ReactNode } from "react";

export function MetricCard(props: { label: string; value: ReactNode; hint?: string; tone?: "neutral" | "good" | "warn" | "danger" }) {
  const toneClass =
    props.tone === "good"
      ? "border-emerald-200 bg-emerald-50"
      : props.tone === "warn"
        ? "border-amber-200 bg-amber-50"
        : props.tone === "danger"
          ? "border-rose-200 bg-rose-50"
          : "border-[color:var(--line)] bg-white";

  return (
    <article className={`rounded-2xl border p-4 shadow-sm ${toneClass}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{props.label}</p>
      <p className="mt-2 text-2xl font-extrabold tracking-[-0.02em] text-[color:var(--text-strong)]">{props.value}</p>
      {props.hint ? <p className="mt-1 text-xs text-slate-500">{props.hint}</p> : null}
    </article>
  );
}

export function StatusPill(props: { status: string }) {
  const normalized = props.status.toLowerCase();
  const className =
    normalized === "ok"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : normalized === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : normalized === "error"
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : "border-slate-200 bg-slate-100 text-slate-700";

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${className}`}>
      {props.status}
    </span>
  );
}
