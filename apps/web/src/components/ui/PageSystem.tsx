import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import Card from "../Card";

type Classy = { className?: string; children: ReactNode };

export function PageShell(props: Classy) {
  return <div className={cn("w-full max-w-none px-4 py-4 text-slate-900", props.className)}>{props.children}</div>;
}

export function SurfaceCard(props: Classy) {
  return <Card className={cn("border border-slate-200 bg-white p-5 shadow-sm", props.className)}>{props.children}</Card>;
}

export function PageTitle(props: Classy) {
  return <h1 className={cn("text-3xl font-bold text-slate-900", props.className)}>{props.children}</h1>;
}

export function SectionTitle(props: Classy) {
  return <h2 className={cn("text-xl font-semibold text-slate-900", props.className)}>{props.children}</h2>;
}

export function CardTitle(props: Classy) {
  return <h3 className={cn("text-base font-semibold text-slate-900", props.className)}>{props.children}</h3>;
}

export function BodyText(props: Classy) {
  return <p className={cn("text-sm font-medium text-slate-600", props.className)}>{props.children}</p>;
}

export function MutedText(props: Classy) {
  return <p className={cn("text-sm font-normal text-slate-500", props.className)}>{props.children}</p>;
}

export function TableWrap(props: Classy) {
  return <div className={cn("w-full overflow-x-auto rounded-2xl border border-slate-200 bg-white", props.className)}>{props.children}</div>;
}

export function TableHeaderCell(props: Classy) {
  return <th className={cn("px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600", props.className)}>{props.children}</th>;
}

export function TableCell(props: Classy) {
  return <td className={cn("px-4 py-3 text-sm font-medium text-slate-700", props.className)}>{props.children}</td>;
}
