import { useMemo, useState, type ChangeEvent } from "react";
import * as XLSX from "xlsx";
import { PageShell, PageTitle, BodyText } from "../components/ui/PageSystem";
import Card from "../components/Card";
import { api } from "../lib/api";
import PostageSummaryCard from "../components/booking/PostageSummaryCard";
import PostageBreakdownTable from "../components/booking/PostageBreakdownTable";
import BookingRecommendationCard from "../components/booking/BookingRecommendationCard";

type QuoteSummary = {
  totalArticles: number;
  totalActualWeightGrams: number;
  totalChargeableWeightGrams: number;
  totalPostageAmount: number;
  byCategory: Record<string, { articles: number; totalActualWeightGrams: number; totalChargeableWeightGrams: number; totalPostageAmount: number }>;
  byProduct: Record<string, { articles: number; totalActualWeightGrams: number; totalChargeableWeightGrams: number; totalPostageAmount: number }>;
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
            <PostageSummaryCard summary={summary} />
            <BookingRecommendationCard summary={summary} />
            <PostageBreakdownTable rows={summary.perArticlePostageBreakdown} />
          </>
        ) : null}
      </div>
    </PageShell>
  );
}
