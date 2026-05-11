import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import Card from "../Card";
import PageHeader from "./PageHeader";

type Classy = { className?: string; children: ReactNode };

function normalizeShellClassName(className?: string) {
  if (!className) return undefined;
  return className
    .split(/\s+/)
    .filter((token) => token && !/^pt-/.test(token) && !/^mt-/.test(token) && !/^py-/.test(token) && !/^space-y-/.test(token))
    .join(" ");
}

export function PageShell(props: Classy) {
  return <section className={cn("ui-page w-full min-w-0 text-[color:var(--text-strong)]", normalizeShellClassName(props.className))}>{props.children}</section>;
}

export function SurfaceCard(props: Classy) {
  return <Card className={cn("border border-[color:var(--line)] bg-white p-5", props.className)}>{props.children}</Card>;
}

export function PageTitle(props: Classy) {
  return <h1 className={cn("text-3xl font-extrabold tracking-[-0.04em] text-[color:var(--text-strong)]", props.className)}>{props.children}</h1>;
}

export function SectionTitle(props: Classy) {
  return <h2 className={cn("text-xl font-semibold text-slate-900", props.className)}>{props.children}</h2>;
}

export function CardTitle(props: Classy) {
  return <h3 className={cn("text-base font-semibold tracking-[-0.02em] text-[color:var(--text-strong)]", props.className)}>{props.children}</h3>;
}

export function BodyText(props: Classy) {
  return <p className={cn("text-sm font-medium leading-6 text-[color:var(--text-muted)]", props.className)}>{props.children}</p>;
}

export function MutedText(props: Classy) {
  return <p className={cn("text-sm font-normal text-slate-500", props.className)}>{props.children}</p>;
}

export function TableWrap(props: Classy) {
  return <div className={cn("ui-table w-full overflow-x-auto", props.className)}>{props.children}</div>;
}

export function TableHeaderCell(props: Classy) {
  return <th className={cn("px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600", props.className)}>{props.children}</th>;
}

export function TableCell(props: Classy) {
  return <td className={cn("px-4 py-3 text-sm font-medium text-slate-700", props.className)}>{props.children}</td>;
}

export { PageHeader };
