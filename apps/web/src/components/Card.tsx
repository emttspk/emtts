import { cn } from "../lib/cn";

export default function Card(props: { children: React.ReactNode; className?: string }) {
  return <div className={cn("ui-card", props.className)}>{props.children}</div>;
}
