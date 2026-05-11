export type JobStatus = "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED";

export type LabelJob = {
  id: string;
  originalFilename: string;
  recordCount: number;
  unitCount?: number;
  includeMoneyOrders?: boolean;
  status: JobStatus;
  error?: string | null;
  createdAt: string;
};

export type TrackingJob = {
  id: string;
  kind: "BULK_TRACK" | "COMPLAINT" | string;
  status: JobStatus;
  error?: string | null;
  originalFilename?: string | null;
  recordCount: number;
  resultPath?: string | null;
  createdAt: string;
};

export type TrackingLifecycleEvent = {
  date: string;
  time: string;
  location: string;
  description: string;
};

export type TrackingLifecycle = {
  normalized_status: string;
  underlying_status: string;
  canonical_status: "DELIVERED" | "RETURNED" | "PENDING";
  display_status: string;
  progress: number;
  active_stage: number;
  current_stage: string;
  latest_event: TrackingLifecycleEvent | null;
  is_terminal: boolean;
  stuck_bucket: string;
  inactivity_days: number;
  complaint_enabled: boolean;
  money_order_status: string;
  money_order_number?: string | null;
  cycle_type: string;
  cycle_status: string;
  decision_reason: string;
  source_status: string;
};

export type Shipment = {
  id: string;
  trackingNumber: string;
  moIssued?: string | null;
  moneyOrderIssued?: boolean | null;
  moValue?: number | null;
  status?: string | null;
  city?: string | null;
  consignee_name?: string | null;
  consignee_address?: string | null;
  consignee_phone?: string | null;
  rawJson?: string | null;
  latestDate?: string | null;
  latestTime?: string | null;
  daysPassed?: number | null;
  complaintStatus?: string | null;
  complaintText?: string | null;
  trackingLifecycle?: TrackingLifecycle | null;
  updatedAt: string;
  createdAt: string;
};

export type TrackResult = {
  tracking_number: string;
  status: string;
  current_status?: string;
  delivery_progress?: number | null;
  lifecycle?: TrackingLifecycle | null;
  city?: string | null;
  latest_date?: string | null;
  latest_time?: string | null;
  days_passed?: number | null;
  dispatch_city?: string | null;
  delivery_city?: string | null;
  events?: Array<{
    date: string;
    time: string;
    location: string;
    description: string;
  }>;
};

export type UserProfile = {
  id: string;
  email: string;
  role: "USER" | "ADMIN";
  createdAt: string;
  companyName?: string | null;
  address?: string | null;
  contactNumber?: string | null;
  cnic?: string | null;
  originCity?: string | null;
  extraLabelCredits?: number;
  extraTrackingCredits?: number;
};

export type MeResponse = {
  user: UserProfile;
  subscription:
    | {
        id: string;
        status: string;
        plan: {
          id: string;
          name: string;
          priceCents: number;
          fullPriceCents?: number;
          discountPriceCents?: number;
          discountPct?: number;
          isSuspended?: boolean;
          unitsIncluded?: number;
          labelsIncluded?: number;
          trackingIncluded?: number;
          moneyOrdersIncluded?: number;
          complaintsIncluded?: number;
          dailyComplaintLimit?: number;
          monthlyComplaintLimit?: number;
          monthlyLabelLimit: number;
          monthlyTrackingLimit: number;
        };
        currentPeriodStart: string;
        currentPeriodEnd: string;
      }
    | null;
  usage: { month: string; labelsGenerated: number; labelsQueued?: number; trackingGenerated?: number; trackingQueued?: number };
  balances?: {
    labelLimit: number;
    trackingLimit: number;
    labelsRemaining: number;
    trackingRemaining: number;
    unitsRemaining?: number;
    extraLabelCredits: number;
    extraTrackingCredits: number;
    complaintDailyLimit?: number;
    complaintDailyUsed?: number;
    complaintDailyRemaining?: number;
    complaintMonthlyLimit?: number;
    complaintMonthlyUsed?: number;
    complaintMonthlyRemaining?: number;
  };
  activePackage?: {
    planName: string | null;
    expiresAt: string | null;
    status: "ACTIVE" | "EXPIRED";
    nearExpiry: boolean;
    unitsRemaining: number;
  };
  pendingPayment?: {
    reference: string;
    status: string;
    kind: string;
    amountCents: number;
    currency: string;
    planName: string;
    invoiceNumber: string | null;
    checkoutUrl: string;
    createdAt: string;
  } | null;
};
