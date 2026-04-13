import { cn } from "../lib/cn";

export default function Card(props: { children: React.ReactNode; className?: string }) {
  return <div className={cn("rounded-[24px] border border-white/70 bg-white/90 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur", props.className)}>{props.children}</div>;
}

