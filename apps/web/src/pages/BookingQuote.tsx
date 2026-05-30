import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { PageShell, PageTitle, BodyText } from "../components/ui/PageSystem";
import Card from "../components/Card";
import { api, uploadFile } from "../lib/api";
import PostageSummaryCard from "../components/booking/PostageSummaryCard";
import PostageBreakdownTable from "../components/booking/PostageBreakdownTable";
import BookingRecommendationCard from "../components/booking/BookingRecommendationCard";
import BookingDraftNotice from "../components/booking/BookingDraftNotice";
import BookingDraftReview from "../components/booking/BookingDraftReview";
import BookingOptionSelector, {
  deriveBookingRecommendation,
  type BookingRecommendationOption,
} from "../components/booking/BookingOptionSelector";
import {
  convertQuoteToBookingDraft,
  type BookingSenderPayload,
} from "../lib/aggregatorBookings";
import type { BookingDraftSenderDetails } from "../components/booking/BookingDraftReview";

type QuoteSummary = {
  totalArticles: number;
  totalActualWeightGrams: number;
  totalChargeableWeightGrams: number;
  totalPostageAmount: number;
  byCategory: Array<{
    key: string;
    totalArticles: number;
    totalActualWeightGrams: number;
    totalChargeableWeightGrams: number;
    totalPostageAmount: number;
  }>;
  byProduct: Array<{
    key: string;
    totalArticles: number;
    totalActualWeightGrams: number;
    totalChargeableWeightGrams: number;
    totalPostageAmount: number;
  }>;
  perArticlePostageBreakdown: Array<{
    rowNumber: number;
    serviceCode: string;
    senderCity: string;
    receiverCity: string;
    result: {
      articleCategory: string;
      postalProduct: string;
      weightGrams: number | null;
      chargeableWeightGrams: number | null;
      postageAmount: number | null;
      matchedSlab: string | null;
      warnings: string[];
      errors: string[];
    };
  }>;
  warningRows: Array<{ rowNumber: number; warnings: string[] }>;
  errorRows: Array<{ rowNumber: number; errors: string[] }>;
};

export default function BookingQuote() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [summary, setSummary] = useState<QuoteSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jsonInput, setJsonInput] = useState("[]");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedOption, setSelectedOption] = useState<BookingRecommendationOption>("DIRECT_COURIER_OR_SELF_DROP_ADVISORY");
  const [creatingDraft, setCreatingDraft] = useState(false);
  const [createDraftError, setCreateDraftError] = useState<string | null>(null);
  const [createdDraftLink, setCreatedDraftLink] = useState<string | null>(null);
  const [customerNoticeAccepted, setCustomerNoticeAccepted] = useState(false);
  const [senderDetails, setSenderDetails] = useState<BookingDraftSenderDetails>({
    senderName: "",
    senderPhone: "",
    senderAddress: "",
    senderCity: "",
    intakeMethod: "DROP_LAHORE",
    hubCity: "",
    specialInstructions: "",
  });

  const rowCount = useMemo(() => rows.length, [rows]);

  const senderCityForRules = useMemo(() => {
    if (!summary) return "";
    const firstWithCity = summary.perArticlePostageBreakdown.find((item) => String(item.senderCity ?? "").trim().length > 0);
    return String(firstWithCity?.senderCity ?? "").trim();
  }, [summary]);

  const recommendation = useMemo(() => {
    if (!summary) return null;

    return deriveBookingRecommendation({
      senderCity: senderCityForRules,
      totalArticles: summary.totalArticles,
      totalActualWeightGrams: summary.totalActualWeightGrams,
      totalChargeableWeightGrams: summary.totalChargeableWeightGrams,
      serviceCodes: summary.perArticlePostageBreakdown.map((row) => row.serviceCode),
      perArticleWeightsGrams: summary.perArticlePostageBreakdown.map((row) => row.result.weightGrams),
    });
  }, [summary, senderCityForRules]);

  const requestPreview = useMemo(() => {
    if (!summary) return null;

    return {
      requestOnly: true as const,
      noPayment: true as const,
      noLiveBooking: true as const,
      noPickupExecution: true as const,
      selectedOption,
      quoteSnapshot: {
        totalArticles: summary.totalArticles,
        totalActualWeightGrams: summary.totalActualWeightGrams,
        totalChargeableWeightGrams: summary.totalChargeableWeightGrams,
        totalPostageAmount: summary.totalPostageAmount,
      },
      customerNotice: "This is only a booking request preview. It is not booking confirmation.",
    };
  }, [selectedOption, summary]);

  useEffect(() => {
    if (!recommendation) return;
    setSelectedOption(recommendation.recommendedOption);
  }, [recommendation]);

  useEffect(() => {
    if (!summary) return;
    setSenderDetails((previous) => ({
      ...previous,
      senderCity: previous.senderCity || senderCityForRules,
      hubCity: previous.hubCity || senderCityForRules || "Lahore",
      intakeMethod:
        selectedOption === "DROP_AT_COLLECTION_POINT"
          ? (senderCityForRules.toLowerCase() === "sahiwal" ? "DROP_SAHIWAL" : "DROP_LAHORE")
          : "PICKUP_REQUESTED_FUTURE",
    }));
  }, [summary, senderCityForRules, selectedOption]);

  useEffect(() => {
    setCreateDraftError(null);
    setCreatedDraftLink(null);
  }, [summary, selectedOption, customerNoticeAccepted]);

  function applyJsonRows() {
    try {
      const parsed = JSON.parse(jsonInput);
      if (!Array.isArray(parsed)) throw new Error("JSON input must be an array of rows");
      setRows(parsed as Array<Record<string, unknown>>);
      setSummary(null);
      setError(null);
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : "Invalid JSON input");
    }
  }

  async function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
    setSummary(null);
    setError(null);
  }

  async function calculateQuoteFromFile() {
    if (!selectedFile) {
      setError("Select a CSV or XLSX file first.");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await uploadFile("/api/booking-quotes/quote", selectedFile);
      setSummary((response as { quoteSummary: QuoteSummary }).quoteSummary);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to calculate quote");
    } finally {
      setLoading(false);
    }
  }

  async function calculateQuoteFromRows() {
    if (rows.length === 0) {
      setError("No rows available. Upload a file or paste JSON rows first.");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await api<{ success: boolean; quoteSummary: QuoteSummary }>("/api/booking-quotes/quote", {
        method: "POST",
        body: JSON.stringify({ rows }),
      });
      setSummary(response.quoteSummary);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to calculate quote");
    } finally {
      setLoading(false);
    }
  }

  async function createDraftRequest() {
    if (!summary || !recommendation) return;
    const quoteSummary = summary;
    const rowsForDraft = rows.length > 0
      ? rows
      : quoteSummary.perArticlePostageBreakdown.map((entry) => ({
        serviceCode: entry.serviceCode,
        weightGrams: entry.result.weightGrams,
        senderCity: entry.senderCity,
        receiverCity: entry.receiverCity,
        articleCategory: entry.result.articleCategory,
      }));
    if (!customerNoticeAccepted) {
      setCreateDraftError("Accept the request-only notice before creating draft request.");
      return;
    }
    if (!recommendation.requestPreviewAllowed || recommendation.blockers.includes("OVER_PHASE_LIMIT")) {
      setCreateDraftError("Draft request is blocked by current recommendation constraints.");
      return;
    }

    const senderPayload: BookingSenderPayload = {
      senderName: senderDetails.senderName.trim(),
      senderPhone: senderDetails.senderPhone.trim(),
      senderAddress: senderDetails.senderAddress.trim(),
      senderCity: senderDetails.senderCity.trim(),
      specialInstructions: senderDetails.specialInstructions?.trim() || "",
      intakeMethod: senderDetails.intakeMethod,
      hubCity: senderDetails.hubCity.trim(),
    };

    try {
      setCreatingDraft(true);
      setCreateDraftError(null);
      setCreatedDraftLink(null);

      const result = await convertQuoteToBookingDraft({
        rows: rowsForDraft,
        quoteSummary: {
          ...quoteSummary,
          totalBasePostage: quoteSummary.totalPostageAmount,
          totalRegistrationFee: 0,
          totalValuePayableFee: 0,
          totalInsuranceFee: 0,
          totalOfficialPostalCharge: quoteSummary.totalPostageAmount,
        },
        sender: senderPayload,
        selectedOption,
        recommendationSnapshot: {
          eligibility: recommendation.eligibility,
          blockers: recommendation.blockers,
          advisoryNotes: recommendation.advisoryNotes,
          valuePayableGuard: recommendation.valuePayableGuard,
          requestPreviewAllowed: recommendation.requestPreviewAllowed,
        },
        requestFlags: {
          requestOnly: true,
          noPayment: true,
          noLiveBooking: true,
          noPickupExecution: true,
          customerNoticeAccepted: true,
        },
      });

      const link = `/aggregator-bookings/${result.booking.id}`;
      setCreatedDraftLink(link);
      navigate(link);
    } catch (requestError) {
      setCreateDraftError(requestError instanceof Error ? requestError.message : "Failed to create draft request");
    } finally {
      setCreatingDraft(false);
    }
  }

  return (
    <PageShell>
      <div className="space-y-4">
        <div>
          <PageTitle>Aggregator Booking Quote</PageTitle>
          <BodyText className="mt-1">
            Phase 1 quote-only tool. This does not create a booking, does not generate labels, and does not consume SaaS units.
          </BodyText>
        </div>

        <Card className="border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-semibold text-slate-900">Input</h3>
          <p className="mt-1 text-xs text-slate-500">Upload a CSV/XLSX file or provide JSON rows with service and weight data.</p>

          <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <label className="text-xs font-semibold text-slate-700">Upload file</label>
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={onFileChange}
                className="mt-2 block w-full text-xs text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white"
              />
              <button
                type="button"
                onClick={calculateQuoteFromFile}
                disabled={loading || !selectedFile}
                className="mt-2 rounded-md bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Calculating..." : "Quote From File"}
              </button>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <label className="text-xs font-semibold text-slate-700">JSON rows</label>
              <textarea
                value={jsonInput}
                onChange={(event) => setJsonInput(event.target.value)}
                rows={8}
                className="mt-2 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 font-mono text-xs text-slate-700"
                placeholder='[{"serviceCode":"RGL","weightGrams":100,"senderCity":"Lahore","receiverCity":"Karachi"}]'
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={applyJsonRows}
                  className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700"
                >
                  Use JSON Rows
                </button>
                <button
                  type="button"
                  onClick={calculateQuoteFromRows}
                  disabled={loading || rowCount === 0}
                  className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? "Calculating..." : "Quote From JSON"}
                </button>
              </div>
            </div>
          </div>

          <div className="mt-3 text-xs text-slate-600">Rows loaded: {rowCount}</div>
          {error ? <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div> : null}
        </Card>

        {summary ? (
          <>
            <PostageSummaryCard summary={summary} />
            <BookingDraftNotice />
            {recommendation ? (
              <BookingOptionSelector
                recommendation={recommendation}
                selectedOption={selectedOption}
                onSelectOption={setSelectedOption}
              />
            ) : null}
            {requestPreview ? (
              <BookingDraftReview
                requestPreview={requestPreview}
                previewAllowed={Boolean(recommendation?.requestPreviewAllowed)}
                senderDetails={senderDetails}
                customerNoticeAccepted={customerNoticeAccepted}
                creatingDraft={creatingDraft}
                createError={createDraftError}
                createSuccessLink={createdDraftLink}
                onChangeSender={(patch) => setSenderDetails((previous) => ({ ...previous, ...patch }))}
                onToggleNoticeAccepted={setCustomerNoticeAccepted}
                onCreateDraft={createDraftRequest}
              />
            ) : null}
            <BookingRecommendationCard summary={summary} />
            <PostageBreakdownTable rows={summary.perArticlePostageBreakdown} />
          </>
        ) : null}
      </div>
    </PageShell>
  );
}
