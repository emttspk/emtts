import Card from "../Card";
import type { BookingRecommendationOption } from "./BookingOptionSelector";

type QuoteSnapshot = {
  totalArticles: number;
  totalActualWeightGrams: number;
  totalChargeableWeightGrams: number;
  totalPostageAmount: number;
};

type RequestPreview = {
  requestOnly: true;
  noPayment: true;
  noLiveBooking: true;
  noPickupExecution: true;
  selectedOption: BookingRecommendationOption;
  quoteSnapshot: QuoteSnapshot;
  customerNotice: string;
};

export type BookingDraftSenderDetails = {
  senderName: string;
  senderPhone: string;
  senderAddress: string;
  senderCity: string;
  specialInstructions?: string;
  intakeMethod: "DROP_LAHORE" | "DROP_SAHIWAL" | "PICKUP_REQUESTED_FUTURE";
  hubCity: string;
};

export default function BookingDraftReview(props: {
  requestPreview: RequestPreview;
  previewAllowed: boolean;
  senderDetails: BookingDraftSenderDetails;
  customerNoticeAccepted: boolean;
  creatingDraft: boolean;
  createError?: string | null;
  createSuccessLink?: string | null;
  onChangeSender: (patch: Partial<BookingDraftSenderDetails>) => void;
  onToggleNoticeAccepted: (value: boolean) => void;
  onCreateDraft: () => void;
}) {
  const {
    requestPreview,
    previewAllowed,
    senderDetails,
    customerNoticeAccepted,
    creatingDraft,
    createError,
    createSuccessLink,
    onChangeSender,
    onToggleNoticeAccepted,
    onCreateDraft,
  } = props;

  const senderComplete =
    senderDetails.senderName.trim().length >= 2
    && senderDetails.senderPhone.trim().length >= 6
    && senderDetails.senderAddress.trim().length >= 5
    && senderDetails.senderCity.trim().length >= 2
    && senderDetails.hubCity.trim().length >= 2;

  const canCreate = previewAllowed && customerNoticeAccepted && senderComplete && !creatingDraft;

  return (
    <Card className="border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-base font-semibold text-slate-900">Quote-To-Request Preview (Phase 2A)</h3>
      <p className="mt-1 text-xs text-slate-600">Preview only. No database write is performed in this phase.</p>

      <div className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">Selected Option</div>
          <div className="mt-1 font-semibold text-slate-900">{requestPreview.selectedOption}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">Request Mode</div>
          <div className="mt-1 font-semibold text-slate-900">Request Preview Only</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">Total Articles</div>
          <div className="mt-1 font-semibold text-slate-900">{requestPreview.quoteSnapshot.totalArticles}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">Total Postage</div>
          <div className="mt-1 font-semibold text-slate-900">Rs. {requestPreview.quoteSnapshot.totalPostageAmount}</div>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800">
        {requestPreview.customerNotice}
      </div>

      <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
        <div>This is a draft request only. It is not booking confirmation.</div>
        <div>No payment is collected.</div>
        <div>No pickup or dispatch is created.</div>
        <div>Admin review is required before any operational action.</div>
      </div>

      <div className="mt-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs text-slate-800">
        <div className="text-sm font-semibold text-slate-900">Sender Details For Draft Request</div>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input
            value={senderDetails.senderName}
            onChange={(event) => onChangeSender({ senderName: event.target.value })}
            placeholder="Sender Name"
            className="rounded-md border border-slate-300 px-2 py-1.5"
          />
          <input
            value={senderDetails.senderPhone}
            onChange={(event) => onChangeSender({ senderPhone: event.target.value })}
            placeholder="Sender Phone"
            className="rounded-md border border-slate-300 px-2 py-1.5"
          />
          <input
            value={senderDetails.senderCity}
            onChange={(event) => onChangeSender({ senderCity: event.target.value })}
            placeholder="Sender City"
            className="rounded-md border border-slate-300 px-2 py-1.5"
          />
          <input
            value={senderDetails.hubCity}
            onChange={(event) => onChangeSender({ hubCity: event.target.value })}
            placeholder="Hub City"
            className="rounded-md border border-slate-300 px-2 py-1.5"
          />
          <select
            value={senderDetails.intakeMethod}
            onChange={(event) => onChangeSender({ intakeMethod: event.target.value as BookingDraftSenderDetails["intakeMethod"] })}
            className="rounded-md border border-slate-300 px-2 py-1.5"
          >
            <option value="DROP_LAHORE">DROP_LAHORE</option>
            <option value="DROP_SAHIWAL">DROP_SAHIWAL</option>
            <option value="PICKUP_REQUESTED_FUTURE">PICKUP_REQUESTED_FUTURE</option>
          </select>
          <input
            value={senderDetails.specialInstructions ?? ""}
            onChange={(event) => onChangeSender({ specialInstructions: event.target.value })}
            placeholder="Special Instructions (optional)"
            className="rounded-md border border-slate-300 px-2 py-1.5"
          />
        </div>
        <textarea
          value={senderDetails.senderAddress}
          onChange={(event) => onChangeSender({ senderAddress: event.target.value })}
          rows={2}
          placeholder="Sender Address"
          className="mt-2 w-full rounded-md border border-slate-300 px-2 py-1.5"
        />
      </div>

      <label className="mt-3 flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800">
        <input
          type="checkbox"
          checked={customerNoticeAccepted}
          onChange={(event) => onToggleNoticeAccepted(event.target.checked)}
          className="mt-0.5"
        />
        <span>
          I confirm: This is a draft request only. It is not booking confirmation. No payment is collected. No pickup or dispatch is created. Admin review is required before any operational action.
        </span>
      </label>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onCreateDraft}
          disabled={!canCreate}
          title={canCreate ? "Create persisted draft request" : "Complete sender details and accept notice to continue"}
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {creatingDraft ? "Creating Draft..." : "Create Draft Request"}
        </button>
        {!previewAllowed ? (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700">
            Request preview is blocked by current phase limits.
          </div>
        ) : null}
        {!senderComplete ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700">
            Fill required sender details to create draft request.
          </div>
        ) : null}
      </div>

      {createError ? (
        <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {createError}
        </div>
      ) : null}

      {createSuccessLink ? (
        <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          Draft request created successfully. Open detail: <a className="font-semibold underline" href={createSuccessLink}>View Draft</a>
        </div>
      ) : null}
    </Card>
  );
}
