import { api } from "./api";

export type IntakeMethod = "DROP_LAHORE" | "DROP_SAHIWAL" | "PICKUP_REQUESTED_FUTURE";

export type BookingStatus =
  | "QUOTE_READY"
  | "BOOKING_DRAFT"
  | "BOOKING_SUBMITTED"
  | "ADMIN_REVIEW_PENDING"
  | "CORRECTION_REQUIRED"
  | "ADMIN_APPROVED"
  | "ADMIN_REJECTED"
  | "PAYMENT_PENDING_PLACEHOLDER"
  | "DROP_PENDING"
  | "PICKUP_PENDING_FUTURE"
  | "CANCELLED";

export type PaymentPlaceholderStatus = "NOT_INITIATED" | "PENDING_PLACEHOLDER" | "MARKED_FOR_OFFLINE_COLLECTION";

export type AggregatorWarehouseOption = "EPOST_LAHORE_WAREHOUSE" | "EPOST_SAHIWAL_WAREHOUSE";

export type AggregatorIntakeCarrierOption = "CUSTOMER_SELF_DROP" | "PAKISTAN_POST_BULK_PACK" | "LEOPARDS_BULK_PACK";

export type AggregatorBookingItem = {
  id: string;
  rowNo: number;
  serviceCode: string;
  articleCategory: string;
  receiverCity: string | null;
  weightGrams: number | null;
  chargeableWeightGrams: number | null;
  basePostage: number;
  registrationFee: number;
  valuePayableFee: number;
  insuranceFee: number;
  totalOfficialPostalCharge: number;
  missingComponentsJson: unknown;
  warningsJson: unknown;
  errorsJson: unknown;
};

export type AggregatorBooking = {
  id: string;
  bookingNo: string;
  userId: string;
  status: BookingStatus;
  intakeMethod: IntakeMethod;
  hubCity: string;
  senderName: string;
  senderPhone: string;
  senderAddress: string;
  senderCity: string;
  specialInstructions: string | null;
  totalArticles: number;
  totalActualWeightGrams: number;
  totalChargeableWeightGrams: number;
  totalBasePostage: number;
  totalRegistrationFee: number;
  totalValuePayableFee: number;
  totalInsuranceFee: number;
  totalOfficialPostalCharge: number;
  paymentStatus: PaymentPlaceholderStatus;
  adminReviewStatus: string;
  adminNotes: string | null;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewedByUserId: string | null;
  items?: AggregatorBookingItem[];
  paymentPlaceholder?: {
    paymentStatus: PaymentPlaceholderStatus;
    placeholderMethod: string | null;
    placeholderReference: string | null;
    placeholderAmount: number | null;
    placeholderCurrency: string | null;
    dueAt: string | null;
  } | null;
  user?: {
    id: string;
    email: string;
    companyName?: string | null;
    contactNumber?: string | null;
  };
  statusEvents?: AggregatorBookingTimelineEvent[];
  bulkPackPlanning?: {
    selectedWarehouse: AggregatorWarehouseOption;
    intakeCarrier: AggregatorIntakeCarrierOption;
    paymentVerifiedReference: string;
    instructions: string;
    warehouseAddress: string;
    updatedAt: string;
  } | null;
};

export type AggregatorBulkPackLabelPreview = {
  bookingNo: string;
  bulkPackNo: string;
  customerName: string;
  customerPhone: string;
  senderCity: string;
  totalArticles: number;
  totalBundleWeightGrams: number;
  selectedWarehouse: AggregatorWarehouseOption;
  warehouseAddress: string;
  intakeCarrier: AggregatorIntakeCarrierOption;
  carrierService: string;
  paymentVerifiedReference: string;
  instructions: string;
  barcodeOrQr: string;
  createdAt: string;
  manualProcessingNotice: string;
};

export type AggregatorManifestPreview = {
  bookingNo: string;
  expectedArticles: number;
  totalBundleWeightGrams: number;
  articleRows: Array<{
    rowNo: number;
    serviceCode: string;
    articleCategory: string;
    receiverCity: string | null;
    weightGrams: number;
    chargeableWeightGrams: number;
    totalOfficialPostalCharge: number;
  }>;
  selectedWarehouse: AggregatorWarehouseOption;
  intakeCarrier: AggregatorIntakeCarrierOption;
  generatedAt: string;
  manualVerificationNotice: string;
};

const manualPlanningFlags = {
  manualPlanningOnly: true,
  noLiveCarrierApi: true,
  noPakistanPostBookingApi: true,
  noPickupExecution: true,
  noDispatchExecution: true,
  noFinalBookingConfirmation: true,
} as const;

export type AggregatorBookingTimelineEvent = {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  actorType: string;
  actorUserId: string;
  reasonCode: string | null;
  note: string | null;
  createdAt: string;
};

export type BookingSenderPayload = {
  senderName: string;
  senderPhone: string;
  senderAddress: string;
  senderCity: string;
  specialInstructions?: string;
  intakeMethod: IntakeMethod;
  hubCity: string;
};

export type BookingRecommendationSnapshot = {
  eligibility: "recommended" | "review_required" | "not_recommended";
  blockers: string[];
  advisoryNotes: string[];
  valuePayableGuard: boolean;
  requestPreviewAllowed: boolean;
};

export type BookingRequestFlags = {
  requestOnly: true;
  noPayment: true;
  noLiveBooking: true;
  noPickupExecution: true;
  customerNoticeAccepted: true;
};

export type BookingOptionSelection = "DROP_AT_COLLECTION_POINT" | "PICKUP_TO_HUB_PLANNING" | "DIRECT_COURIER_OR_SELF_DROP_ADVISORY";

export async function convertQuoteToBookingDraft(input: {
  rows: Array<Record<string, unknown>>;
  quoteSummary: Record<string, unknown>;
  sender: BookingSenderPayload;
  selectedOption: BookingOptionSelection;
  recommendationSnapshot: BookingRecommendationSnapshot;
  requestFlags: BookingRequestFlags;
  quoteVersion?: string;
  rateCardVersionSet?: Record<string, string>;
}) {
  return api<{ success: boolean; quote: { id: string }; booking: AggregatorBooking }>("/api/aggregator-bookings/quotes/convert-to-draft", {
    method: "POST",
    body: JSON.stringify({
      quoteVersion: input.quoteVersion ?? "v1.5",
      rows: input.rows,
      quoteSummary: input.quoteSummary,
      sender: input.sender,
      selectedOption: input.selectedOption,
      recommendationSnapshot: input.recommendationSnapshot,
      requestFlags: input.requestFlags,
      rateCardVersionSet: input.rateCardVersionSet ?? {},
    }),
  });
}

export async function listMyAggregatorBookings(params?: { page?: number; pageSize?: number; status?: string }) {
  const search = new URLSearchParams();
  if (params?.page) search.set("page", String(params.page));
  if (params?.pageSize) search.set("pageSize", String(params.pageSize));
  if (params?.status) search.set("status", params.status);
  const suffix = search.toString() ? `?${search.toString()}` : "";
  return api<{ success: boolean; items: AggregatorBooking[]; total: number; page: number; pageSize: number }>(`/api/aggregator-bookings${suffix}`);
}

export async function getMyAggregatorBooking(bookingId: string) {
  return api<{ success: boolean; booking: AggregatorBooking }>(`/api/aggregator-bookings/${encodeURIComponent(bookingId)}`);
}

export async function updateMyAggregatorBookingDraft(
  bookingId: string,
  patch: Partial<BookingSenderPayload>,
) {
  return api<{ success: boolean; booking: AggregatorBooking }>(`/api/aggregator-bookings/${encodeURIComponent(bookingId)}/draft`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function submitMyAggregatorBooking(bookingId: string, note?: string) {
  return api<{ success: boolean; booking: AggregatorBooking }>(`/api/aggregator-bookings/${encodeURIComponent(bookingId)}/submit`, {
    method: "POST",
    body: JSON.stringify(note ? { note } : {}),
  });
}

export async function cancelMyAggregatorBooking(bookingId: string, reasonCode: string, note?: string) {
  return api<{ success: boolean; booking: AggregatorBooking }>(`/api/aggregator-bookings/${encodeURIComponent(bookingId)}/cancel`, {
    method: "POST",
    body: JSON.stringify({ reasonCode, note }),
  });
}

export async function getMyAggregatorBookingTimeline(bookingId: string) {
  return api<{ success: boolean; timeline: AggregatorBookingTimelineEvent[] }>(`/api/aggregator-bookings/${encodeURIComponent(bookingId)}/timeline`);
}

export async function listAdminAggregatorBookings(params?: {
  page?: number;
  pageSize?: number;
  status?: string;
  intakeMethod?: string;
  hubCity?: string;
  search?: string;
}) {
  const search = new URLSearchParams();
  if (params?.page) search.set("page", String(params.page));
  if (params?.pageSize) search.set("pageSize", String(params.pageSize));
  if (params?.status) search.set("status", params.status);
  if (params?.intakeMethod) search.set("intakeMethod", params.intakeMethod);
  if (params?.hubCity) search.set("hubCity", params.hubCity);
  if (params?.search) search.set("search", params.search);
  const suffix = search.toString() ? `?${search.toString()}` : "";
  return api<{ success: boolean; items: AggregatorBooking[]; total: number; page: number; pageSize: number }>(`/api/admin/aggregator-bookings${suffix}`);
}

export async function getAdminAggregatorBooking(bookingId: string) {
  return api<{ success: boolean; booking: AggregatorBooking }>(`/api/admin/aggregator-bookings/${encodeURIComponent(bookingId)}`);
}

export async function adminApproveAggregatorBooking(bookingId: string, payload?: { reasonCode?: string; note?: string; paymentStatus?: PaymentPlaceholderStatus }) {
  return api<{ success: boolean; booking: AggregatorBooking }>(`/api/admin/aggregator-bookings/${encodeURIComponent(bookingId)}/approve`, {
    method: "POST",
    body: JSON.stringify(payload ?? {}),
  });
}

export async function adminRejectAggregatorBooking(bookingId: string, payload?: { reasonCode?: string; note?: string }) {
  return api<{ success: boolean; booking: AggregatorBooking }>(`/api/admin/aggregator-bookings/${encodeURIComponent(bookingId)}/reject`, {
    method: "POST",
    body: JSON.stringify(payload ?? {}),
  });
}

export async function adminRequestCorrectionAggregatorBooking(bookingId: string, payload?: { reasonCode?: string; note?: string }) {
  return api<{ success: boolean; booking: AggregatorBooking }>(`/api/admin/aggregator-bookings/${encodeURIComponent(bookingId)}/request-correction`, {
    method: "POST",
    body: JSON.stringify(payload ?? {}),
  });
}

export async function adminMarkPendingAggregatorBooking(bookingId: string, payload?: { reasonCode?: string; note?: string }) {
  return api<{ success: boolean; booking: AggregatorBooking }>(`/api/admin/aggregator-bookings/${encodeURIComponent(bookingId)}/mark-pending`, {
    method: "POST",
    body: JSON.stringify(payload ?? {}),
  });
}

export async function adminSelectAggregatorBulkPackPlan(
  bookingId: string,
  payload: {
    selectedWarehouse: AggregatorWarehouseOption;
    intakeCarrier: AggregatorIntakeCarrierOption;
    paymentVerifiedReference: string;
    instructions: string;
  },
) {
  return api<{
    success: boolean;
    bookingId: string;
    bookingNo: string;
    planningSelection: AggregatorBooking["bulkPackPlanning"];
  }>(`/api/admin/aggregator-bookings/${encodeURIComponent(bookingId)}/bulk-pack-plan/select`, {
    method: "POST",
    body: JSON.stringify({
      ...payload,
      planningFlags: manualPlanningFlags,
    }),
  });
}

export async function adminPreviewAggregatorBulkPackLabel(bookingId: string) {
  return api<{ success: boolean; bookingId: string; labelPreview: AggregatorBulkPackLabelPreview }>(
    `/api/admin/aggregator-bookings/${encodeURIComponent(bookingId)}/bulk-pack-plan/label-preview`,
    {
      method: "POST",
      body: JSON.stringify({ planningFlags: manualPlanningFlags }),
    },
  );
}

export async function adminPreviewAggregatorManifest(bookingId: string) {
  return api<{ success: boolean; bookingId: string; manifestPreview: AggregatorManifestPreview }>(
    `/api/admin/aggregator-bookings/${encodeURIComponent(bookingId)}/bulk-pack-plan/manifest-preview`,
    {
      method: "POST",
      body: JSON.stringify({ planningFlags: manualPlanningFlags }),
    },
  );
}
