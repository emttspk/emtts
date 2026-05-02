import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
export { PageShell } from "../ui/PageSystem";

type WrapperProps = {
	className?: string;
	children: ReactNode;
};

export function LayoutWrapper(props: WrapperProps) {
	return <div className={cn("w-full min-w-0", props.className)}>{props.children}</div>;
}

export function NavigationWrapper(props: WrapperProps) {
	return <nav className={cn("w-full", props.className)}>{props.children}</nav>;
}
