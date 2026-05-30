import { useMemo, useState, type ChangeEvent } from "react";
import * as XLSX from "xlsx";
import { PageShell, PageTitle, BodyText } from "../components/ui/PageSystem";
import { Link } from "react-router-dom";
import Card from "../components/Card";
import { api } from "../lib/api";
import { convertQuoteToBookingDraft, type IntakeMethod } from "../lib/aggregatorBookings";
import PostageSummaryCard from "../components/booking/PostageSummaryCard";
import PostageBreakdownTable from "../components/booking/PostageBreakdownTable";
import BookingRecommendationCard from "../components/booking/BookingRecommendationCard";

type QuoteSummary = {
  totalArticles: number;
  totalActualWeightGrams: number;
  totalChargeableWeightGrams: number;
  totalBasePostage: number;
  totalRegistrationFee: number;
  totalValuePayableFee: number;
  totalInsuranceFee: number;
  totalOfficialPostalCharge: number;
  byCategory: Record<string, {
    articles: number;
    totalActualWeightGrams: number;
    totalChargeableWeightGrams: number;
    totalBasePostage: number;
    totalRegistrationFee: number;
    totalValuePayableFee: number;
    totalInsuranceFee: number;
    totalOfficialPostalCharge: number;
  }>;
  byProduct: Record<string, {
    articles: number;
    totalActualWeightGrams: number;
    totalChargeableWeightGrams: number;
    totalBasePostage: number;
    totalRegistrationFee: number;
    totalValuePayableFee: number;
    totalInsuranceFee: number;
    totalOfficialPostalCharge: number;
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
      basePostageAmount: number | null;
      registrationFeeAmount: number | null;
      valuePayableFeeAmount: number | null;
      insuranceFeeAmount: number | null;
      totalOfficialPostalCharge: number | null;
      appliedComponents: string[];
      missingComponents: string[];
      matchedRateCards: string[];
      matchedSlabs: string[];
      warnings: string[];
      errors: string[];
    };
  }>;
  warningRows: Array<{ rowNumber: number; warnings: string[] }>;
  errorRows: Array<{ rowNumber: number; errors: string[] }>;
};

function parseRowsFromWorkbook(ab: ArrayBuffer) {
  const workbook = XLSX.read(ab, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("No sheet found in uploaded file");
  const worksheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { raw: false, defval: "" });
  if (rows.length === 0) throw new Error("Uploaded file has no rows");
  return rows;
}

export default function BookingQuote() {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [summary, setSummary] = useState<QuoteSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [convertError, setConvertError] = useState<string | null>(null);
  const [convertBusy, setConvertBusy] = useState(false);
  const [createdBookingId, setCreatedBookingId] = useState<string | null>(null);
  const [senderName, setSenderName] = useState("");
  const [senderPhone, setSenderPhone] = useState("");
  const [senderAddress, setSenderAddress] = useState("");
  const [senderCity, setSenderCity] = useState("");
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [hubCity, setHubCity] = useState("Lahore");
  const [intakeMethod, setIntakeMethod] = useState<IntakeMethod>("DROP_LAHORE");
  const [jsonInput, setJsonInput] = useState("");

  const rowCount = useMemo(() => rows.length, [rows]);

  async function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);
    setSummary(null);

    try {
      const ab = await file.arrayBuffer();
      const parsedRows = parseRowsFromWorkbook(ab);
      setRows(parsedRows);
      setJsonInput(JSON.stringify(parsedRows.slice(0, 10), null, 2));
    } catch (fileError) {
      setError(fileError instanceof Error ? fileError.message : "Failed to parse file");
    }
  }

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

  async function calculateQuote() {
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

  async function convertToDraft() {
    if (!summary) {
      setConvertError("Calculate quote first.");
      return;
    }
    if (summary.errorRows.length > 0) {
      setConvertError("Resolve quote row errors before creating booking draft.");
      return;
    }
    if (!senderName.trim() || !senderPhone.trim() || !senderAddress.trim() || !senderCity.trim() || !hubCity.trim()) {
      setConvertError("Fill sender and intake details before converting to booking draft.");
      return;
    }

    try {
      setConvertBusy(true);
      setConvertError(null);
      setCreatedBookingId(null);
      const response = await convertQuoteToBookingDraft({
        rows,
        quoteSummary: summary as unknown as Record<string, unknown>,
        sender: {
          senderName: senderName.trim(),
          senderPhone: senderPhone.trim(),
          senderAddress: senderAddress.trim(),
          senderCity: senderCity.trim(),
          specialInstructions: specialInstructions.trim(),
          intakeMethod,
          hubCity: hubCity.trim(),
        },
      });
      setCreatedBookingId(response.booking.id);
    } catch (requestError) {
      setConvertError(requestError instanceof Error ? requestError.message : "Failed to convert quote to booking draft");
    } finally {
      setConvertBusy(false);
    }
  }

  return (
    <PageShell>
      <div className="space-y-4">
        <div>
          <PageTitle>Aggregator Booking Quote</PageTitle>
          <BodyText className="mt-1">
            Phase 1.5 quote-only tool. This does not create a booking, does not generate labels, and does not consume SaaS units.
          </BodyText>
        </div>

        <Card className="border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-semibold text-slate-900">Input</h3>
          <p className="mt-1 text-xs text-slate-500">Upload a CSV/XLSX file or paste JSON rows. Required fields include service code and weight per article.</p>
          <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <label className="text-xs font-semibold text-slate-700">Upload file</label>
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={onFileChange}
                className="mt-2 block w-full text-xs text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white"
              />
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <label className="text-xs font-semibold text-slate-700">JSON rows</label>
              <textarea
                value={jsonInput}
                onChange={(event) => setJsonInput(event.target.value)}
                rows={8}
                className="mt-2 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 font-mono text-xs text-slate-700"
                placeholder='[{"shipmenttype":"RGL","Weight":"100","senderCity":"Lahore","receiverCity":"Karachi"}]'
              />
              <button
                type="button"
                onClick={applyJsonRows}
                className="mt-2 rounded-md bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700"
              >
                Use JSON Rows
              </button>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={calculateQuote}
              disabled={loading}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Calculating..." : "Calculate Quote"}
            </button>
            <span className="text-xs text-slate-600">Rows loaded: {rowCount}</span>
          </div>
          {error ? <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div> : null}
        </Card>

        {summary ? (
          <>
            <Card className="border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-base font-semibold text-slate-900">Convert Quote to Booking Draft</h3>
              <p className="mt-1 text-xs text-slate-500">
                Phase 2 creates a money-based booking draft for admin review. No payment gateway, label generation, MO generation, or Pakistan Post booking is executed here.
              </p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <label className="text-xs text-slate-700">Sender Name
                  <input className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" value={senderName} onChange={(e) => setSenderName(e.target.value)} />
                </label>
                <label className="text-xs text-slate-700">Sender Phone
                  <input className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" value={senderPhone} onChange={(e) => setSenderPhone(e.target.value)} />
                </label>
                <label className="text-xs text-slate-700 md:col-span-2">Sender Address
                  <input className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" value={senderAddress} onChange={(e) => setSenderAddress(e.target.value)} />
                </label>
                <label className="text-xs text-slate-700">Sender City
                  <input className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" value={senderCity} onChange={(e) => setSenderCity(e.target.value)} />
                </label>
                <label className="text-xs text-slate-700">Hub City
                  <input className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" value={hubCity} onChange={(e) => setHubCity(e.target.value)} />
                </label>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <label className="text-xs text-slate-700">Intake Method
                  <select className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" value={intakeMethod} onChange={(e) => setIntakeMethod(e.target.value as IntakeMethod)}>
                    <option value="DROP_LAHORE">Drop at Lahore collection point</option>
                    <option value="DROP_SAHIWAL">Drop at Sahiwal collection point</option>
                    <option value="PICKUP_REQUESTED_FUTURE">Pickup requested from customer address (future Leopards workflow)</option>
                  </select>
                </label>
                <label className="text-xs text-slate-700">Special Instructions
                  <input className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" value={specialInstructions} onChange={(e) => setSpecialInstructions(e.target.value)} />
                </label>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={convertToDraft}
                  disabled={convertBusy || summary.errorRows.length > 0}
                  className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {convertBusy ? "Converting..." : "Create Booking Draft"}
                </button>
                {createdBookingId ? <Link className="text-xs font-semibold text-emerald-700 hover:underline" to={`/aggregator-bookings/${createdBookingId}`}>Open Booking Detail</Link> : null}
              </div>
              {convertError ? <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{convertError}</div> : null}
            </Card>

            <PostageSummaryCard summary={summary} />
            <BookingRecommendationCard summary={summary} />
            <PostageBreakdownTable rows={summary.perArticlePostageBreakdown} />
          </>
        ) : null}
      </div>
    </PageShell>
  );
}
