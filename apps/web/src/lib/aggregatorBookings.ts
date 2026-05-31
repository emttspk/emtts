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
  phase3c2Operational?: {
    currentState: "NOT_STARTED" | "HUB_RECEIVED" | "MANIFEST_VERIFIED" | "MISMATCH_RECORDED" | "EXCEPTION_RESOLVED";
    hubReceiving: {
      bookingNo: string;
      warehouse: AggregatorWarehouseOption;
      receivedAt: string;
      receivedBy: string;
      receivedArticleCount: number;
      expectedArticleCount: number;
      receivedBundleWeightGrams: number | null;
      conditionNote: string;
      manualReceivingOnly: true;
      noFinalDispatch: true;
    } | null;
    manifestVerification: {
      bookingNo: string;
      expectedArticleCount: number;
      receivedArticleCount: number;
      matched: true;
      verifiedAt: string;
      verifiedBy: string;
      manualOnly: true;
      noFinalDispatch: true;
    } | null;
    mismatch: {
      mismatchDetected: true;
      expectedArticleCount: number;
      receivedArticleCount: number;
      mismatchReason: string;
      adminNote: string;
      holdForManualResolution: true;
      recordedAt: string;
      recordedBy: string;
      manualOnly: true;
    } | null;
    latestExceptionNote: {
      note: string;
      addedAt: string;
      addedBy: string;
      manualOnly: true;
    } | null;
    resolution: {
      resolvedBy: string;
      resolvedAt: string;
      resolutionType: string;
      resolutionNote: string;
      manualOnly: true;
    } | null;
    holdForManualResolution: boolean;
    updatedAt: string | null;
    customerNotice: string;
  } | null;
  phase3c3Operational?: Phase3C3OperationalState | null;
};

export type Phase3C3OperationalState = {
  currentState:
    | "NOT_STARTED"
    | "DRIVER_HANDOFF_RECORDED"
    | "HUB_SORTING_DISPATCHED"
    | "INTER_FACILITY_TRANSFER_RECORDED"
    | "READY_FOR_FINAL_POSTAL_PROCESSING";
  driverHandoff: {
    bookingNo: string;
    handoffType: string;
    fromParty: string;
    toParty: string;
    handoffAt: string;
    receivedBy: string;
    bundleCondition: string;
    articleCount: number;
    note: string;
    manualOnly: true;
    noLiveCarrierApi: true;
    noFinalDispatch: true;
  } | null;
  sortingDispatch: {
    bookingNo: string;
    fromWarehouse: string;
    toSortingFacility: string;
    dispatchedAt: string;
    dispatchedBy: string;
    expectedArticleCount: number;
    bundleWeightGrams: number | null;
    transportMode: string;
    note: string;
    manualOnly: true;
    noPakistanPostBookingApi: true;
    noFinalBookingConfirmation: true;
  } | null;
  latestTransfer: {
    bookingNo: string;
    fromFacility: string;
    toFacility: string;
    transferAt: string;
    articleCount: number;
    transferReference: string | null;
    note: string;
    manualOnly: true;
    noFinalDispatch: true;
  } | null;
  readyForPostal: {
    bookingNo: string;
    readyAt: string;
    markedBy: string;
    expectedArticleCount: number;
    note: string;
    manualOnly: true;
    noPakistanPostBookingApi: true;
    finalBookingNotCreated: true;
  } | null;
  updatedAt: string | null;
  customerNotice: string;
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

const manualHubReceivingFlags = {
  manualReceivingOnly: true,
  noFinalDispatch: true,
  noLiveCarrierApi: true,
  noPakistanPostBookingApi: true,
  noPickupExecution: true,
  noDispatchExecution: true,
  noFinalBookingConfirmation: true,
} as const;

const manualHandoffFlags = {
  manualOnly: true as const,
  noLiveCarrierApi: true as const,
  noFinalDispatch: true as const,
  noPakistanPostBookingApi: true as const,
  noPickupExecution: true as const,
  noDispatchExecution: true as const,
  noFinalBookingConfirmation: true as const,
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

export async function adminMarkAggregatorHubReceived(
  bookingId: string,
  payload: {
    receivedArticleCount: number;
    receivedBundleWeightGrams?: number;
    conditionNote: string;
  },
) {
  return api<{ success: boolean; bookingId: string; phase3c2Operational: AggregatorBooking["phase3c2Operational"] }>(
    `/api/admin/aggregator-bookings/${encodeURIComponent(bookingId)}/hub-receiving/mark-received`,
    {
      method: "POST",
      body: JSON.stringify({
        ...payload,
        manualFlags: manualHubReceivingFlags,
      }),
    },
  );
}

export async function adminVerifyAggregatorHubManifest(bookingId: string, payload: { receivedArticleCount: number }) {
  return api<{ success: boolean; bookingId: string; phase3c2Operational: AggregatorBooking["phase3c2Operational"] }>(
    `/api/admin/aggregator-bookings/${encodeURIComponent(bookingId)}/hub-receiving/verify-manifest`,
    {
      method: "POST",
      body: JSON.stringify({
        ...payload,
        manualFlags: manualHubReceivingFlags,
      }),
    },
  );
}

export async function adminRecordAggregatorHubMismatch(
  bookingId: string,
  payload: {
    receivedArticleCount: number;
    mismatchReason: string;
    adminNote: string;
  },
) {
  return api<{ success: boolean; bookingId: string; phase3c2Operational: AggregatorBooking["phase3c2Operational"] }>(
    `/api/admin/aggregator-bookings/${encodeURIComponent(bookingId)}/hub-receiving/record-mismatch`,
    {
      method: "POST",
      body: JSON.stringify({
        ...payload,
        manualFlags: manualHubReceivingFlags,
      }),
    },
  );
}

export async function adminAddAggregatorHubExceptionNote(bookingId: string, payload: { exceptionNote: string }) {
  return api<{ success: boolean; bookingId: string; phase3c2Operational: AggregatorBooking["phase3c2Operational"] }>(
    `/api/admin/aggregator-bookings/${encodeURIComponent(bookingId)}/hub-receiving/add-exception-note`,
    {
      method: "POST",
      body: JSON.stringify({
        ...payload,
        manualFlags: manualHubReceivingFlags,
      }),
    },
  );
}

export async function adminResolveAggregatorHubException(
  bookingId: string,
  payload: {
    resolutionType: string;
    resolutionNote: string;
  },
) {
  return api<{ success: boolean; bookingId: string; phase3c2Operational: AggregatorBooking["phase3c2Operational"] }>(
    `/api/admin/aggregator-bookings/${encodeURIComponent(bookingId)}/hub-receiving/resolve-exception`,
    {
      method: "POST",
      body: JSON.stringify({
        ...payload,
        manualFlags: manualHubReceivingFlags,
      }),
    },
  );
}

export async function adminRecordAggregatorDriverHandoff(
  bookingId: string,
  payload: {
    handoffType: string;
    fromParty: string;
    toParty: string;
    receivedBy: string;
    bundleCondition: string;
    articleCount: number;
    note: string;
  },
) {
  return api<{ success: boolean; bookingId: string; phase3c3Operational: Phase3C3OperationalState }>(
    `/api/admin/aggregator-bookings/${encodeURIComponent(bookingId)}/handoff/record-driver-handoff`,
    {
      method: "POST",
      body: JSON.stringify({ ...payload, manualFlags: manualHandoffFlags }),
    },
  );
}

export async function adminRecordAggregatorSortingDispatch(
  bookingId: string,
  payload: {
    fromWarehouse: string;
    toSortingFacility: string;
    dispatchedBy: string;
    expectedArticleCount: number;
    bundleWeightGrams?: number | null;
    transportMode: string;
    note: string;
  },
) {
  return api<{ success: boolean; bookingId: string; phase3c3Operational: Phase3C3OperationalState }>(
    `/api/admin/aggregator-bookings/${encodeURIComponent(bookingId)}/handoff/record-sorting-dispatch`,
    {
      method: "POST",
      body: JSON.stringify({ ...payload, manualFlags: manualHandoffFlags }),
    },
  );
}

export async function adminRecordAggregatorInterFacilityTransfer(
  bookingId: string,
  payload: {
    fromFacility: string;
    toFacility: string;
    transferBy: string;
    transferReference?: string | null;
    articleCount: number;
    note: string;
  },
) {
  return api<{ success: boolean; bookingId: string; phase3c3Operational: Phase3C3OperationalState }>(
    `/api/admin/aggregator-bookings/${encodeURIComponent(bookingId)}/handoff/record-transfer`,
    {
      method: "POST",
      body: JSON.stringify({ ...payload, manualFlags: manualHandoffFlags }),
    },
  );
}

export async function adminMarkAggregatorReadyForPostal(
  bookingId: string,
  payload: {
    expectedArticleCount: number;
    note: string;
  },
) {
  return api<{ success: boolean; bookingId: string; phase3c3Operational: Phase3C3OperationalState }>(
    `/api/admin/aggregator-bookings/${encodeURIComponent(bookingId)}/handoff/mark-ready-for-postal`,
    {
      method: "POST",
      body: JSON.stringify({ ...payload, manualFlags: manualHandoffFlags }),
    },
  );
}
