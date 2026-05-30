export const AGGREGATOR_BOOKING_STATUSES = [
  "QUOTE_READY",
  "BOOKING_DRAFT",
  "BOOKING_SUBMITTED",
  "ADMIN_REVIEW_PENDING",
  "CORRECTION_REQUIRED",
  "ADMIN_APPROVED",
  "ADMIN_REJECTED",
  "PAYMENT_PENDING_PLACEHOLDER",
  "DROP_PENDING",
  "PICKUP_PENDING_FUTURE",
  "CANCELLED",
] as const;

export type AggregatorBookingStatus = (typeof AGGREGATOR_BOOKING_STATUSES)[number];

export const PAYMENT_PLACEHOLDER_STATUSES = [
  "NOT_INITIATED",
  "PENDING_PLACEHOLDER",
  "MARKED_FOR_OFFLINE_COLLECTION",
] as const;

export type AggregatorPaymentStatus = (typeof PAYMENT_PLACEHOLDER_STATUSES)[number];

export const ADMIN_REVIEW_STATUSES = [
  "NOT_REVIEWED",
  "PENDING",
  "CORRECTION_REQUIRED",
  "APPROVED",
  "REJECTED",
] as const;

export type AggregatorAdminReviewStatus = (typeof ADMIN_REVIEW_STATUSES)[number];

export const INTAKE_METHODS = [
  "DROP_LAHORE",
  "DROP_SAHIWAL",
  "PICKUP_REQUESTED_FUTURE",
] as const;

export type AggregatorIntakeMethod = (typeof INTAKE_METHODS)[number];

export const TERMINAL_BOOKING_STATUSES: readonly AggregatorBookingStatus[] = ["ADMIN_REJECTED", "CANCELLED"];

export type TransitionActor = "CUSTOMER" | "ADMIN" | "SYSTEM";

type TransitionRule = {
  from: AggregatorBookingStatus;
  to: AggregatorBookingStatus;
  actors: readonly TransitionActor[];
};

const TRANSITION_RULES: TransitionRule[] = [
  { from: "QUOTE_READY", to: "BOOKING_DRAFT", actors: ["CUSTOMER"] },
  { from: "BOOKING_DRAFT", to: "BOOKING_SUBMITTED", actors: ["CUSTOMER"] },
  { from: "BOOKING_SUBMITTED", to: "ADMIN_REVIEW_PENDING", actors: ["SYSTEM", "ADMIN"] },
  { from: "ADMIN_REVIEW_PENDING", to: "ADMIN_APPROVED", actors: ["ADMIN"] },
  { from: "ADMIN_REVIEW_PENDING", to: "ADMIN_REJECTED", actors: ["ADMIN"] },
  { from: "ADMIN_REVIEW_PENDING", to: "CORRECTION_REQUIRED", actors: ["ADMIN"] },
  { from: "CORRECTION_REQUIRED", to: "BOOKING_SUBMITTED", actors: ["CUSTOMER"] },
  { from: "ADMIN_APPROVED", to: "PAYMENT_PENDING_PLACEHOLDER", actors: ["SYSTEM", "ADMIN"] },
  { from: "PAYMENT_PENDING_PLACEHOLDER", to: "DROP_PENDING", actors: ["ADMIN"] },
  { from: "PAYMENT_PENDING_PLACEHOLDER", to: "PICKUP_PENDING_FUTURE", actors: ["ADMIN"] },
  { from: "BOOKING_DRAFT", to: "CANCELLED", actors: ["CUSTOMER", "ADMIN"] },
  { from: "BOOKING_SUBMITTED", to: "CANCELLED", actors: ["CUSTOMER", "ADMIN"] },
  { from: "ADMIN_REVIEW_PENDING", to: "CANCELLED", actors: ["ADMIN"] },
  { from: "CORRECTION_REQUIRED", to: "CANCELLED", actors: ["CUSTOMER", "ADMIN"] },
  { from: "PAYMENT_PENDING_PLACEHOLDER", to: "CANCELLED", actors: ["ADMIN"] },
  { from: "DROP_PENDING", to: "CANCELLED", actors: ["ADMIN"] },
  { from: "PICKUP_PENDING_FUTURE", to: "CANCELLED", actors: ["ADMIN"] },
];

function normalize<T extends string>(value: T | string): string {
  return String(value ?? "").trim().toUpperCase();
}

export function isAggregatorBookingStatus(value: unknown): value is AggregatorBookingStatus {
  const candidate = normalize(String(value ?? ""));
  return (AGGREGATOR_BOOKING_STATUSES as readonly string[]).includes(candidate);
}

export function isPaymentPlaceholderStatus(value: unknown): value is AggregatorPaymentStatus {
  const candidate = normalize(String(value ?? ""));
  return (PAYMENT_PLACEHOLDER_STATUSES as readonly string[]).includes(candidate);
}

export function isAdminReviewStatus(value: unknown): value is AggregatorAdminReviewStatus {
  const candidate = normalize(String(value ?? ""));
  return (ADMIN_REVIEW_STATUSES as readonly string[]).includes(candidate);
}

export function isIntakeMethod(value: unknown): value is AggregatorIntakeMethod {
  const candidate = normalize(String(value ?? ""));
  return (INTAKE_METHODS as readonly string[]).includes(candidate);
}

export function canTransitionBookingStatus(input: {
  from: AggregatorBookingStatus;
  to: AggregatorBookingStatus;
  actor: TransitionActor;
}) {
  const from = normalize(input.from) as AggregatorBookingStatus;
  const to = normalize(input.to) as AggregatorBookingStatus;
  const actor = normalize(input.actor);
  const rule = TRANSITION_RULES.find((item) => item.from === from && item.to === to);
  if (!rule) {
    return { ok: false, reason: `Transition not allowed: ${from} -> ${to}` };
  }
  if (!(rule.actors as readonly string[]).includes(actor)) {
    return { ok: false, reason: `Actor ${actor} cannot transition ${from} -> ${to}` };
  }
  return { ok: true as const };
}

export function assertCanTransitionBookingStatus(input: {
  from: AggregatorBookingStatus;
  to: AggregatorBookingStatus;
  actor: TransitionActor;
}) {
  const allowed = canTransitionBookingStatus(input);
  if (!allowed.ok) {
    throw new Error(allowed.reason);
  }
}

export function isTerminalStatus(status: AggregatorBookingStatus) {
  return TERMINAL_BOOKING_STATUSES.includes(status);
}
