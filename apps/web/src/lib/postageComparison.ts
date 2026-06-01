export function recommendationLabel(code: string): string {
  if (code === "DIRECT_COURIER_OR_SELF_DROP") return "Direct Courier / Self Drop";
  if (code === "PAKISTAN_POST_ROUTE_RECOMMENDED") return "Pakistan Post Route Recommended";
  if (code === "COURIER_BUNDLE_ROUTE") return "Courier Bundle Route";
  return code;
}
