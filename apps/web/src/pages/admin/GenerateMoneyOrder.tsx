import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import Card from "../../components/Card";
import SenderProfileSidecard from "../../components/SenderProfileSidecard";
import MoneyOrderForm from "../../components/MoneyOrderForm";
import UploadDropzone from "../../components/UploadDropzone";
import SampleDownloadLink from "../../components/SampleDownloadLink";
import { api, apiHealthCheck, triggerBrowserDownload, uploadFile } from "../../lib/api";
import type { LabelJob, MeResponse } from "../../lib/types";
import { useJobPolling } from "../../lib/useJobPolling";
import { rowsToCsv, type UploadOrderRow } from "../../shared/orderColumns";
import { BodyText, CardTitle, PageShell, PageTitle } from "../../components/ui/PageSystem";

type ShellCtx = { me: MeResponse | null; refreshMe: () => Promise<void> };

type ManualMoneyOrderRow = {
  receiverName: string;
  receiverAddress: string;
  receiverMobile: string;
  amount: string;
  trackingId: string;
  articleNumber: string;
  city: string;
};

const MAX_MANUAL_ROWS = 5;

function createEmptyRow(): ManualMoneyOrderRow {
  return {
    receiverName: "",
    receiverAddress: "",
    receiverMobile: "",
    amount: "",
    trackingId: "",
    articleNumber: "",
    city: "",
  };
}

function inferShipmentType(trackingId: string) {
  const value = trackingId.trim().toUpperCase();
  if (value.startsWith("COD")) return "COD";
  if (value.startsWith("VPP")) return "VPP";
  return "VPL";
}

function normalizeCnic(value: string) {
  const compact = String(value ?? "").trim().replace(/\s+/g, "");
  if (/^\d{5}-\d{7}-\d$/.test(compact)) return compact;
  const digits = compact.replace(/\D/g, "");
  if (digits.length === 13) {
    return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
  }
  return "";
}

function toUploadRow(row: ManualMoneyOrderRow, me: MeResponse | null): UploadOrderRow {
  return {
    shipperName: String(me?.user.companyName ?? "").trim(),
    shipperPhone: String(me?.user.contactNumber ?? "").trim(),
    shipperAddress: String(me?.user.address ?? "").trim(),
    shipperEmail: String(me?.user.email ?? "").trim(),
    senderCity: String(me?.user.originCity ?? row.city ?? "").trim(),
    consigneeName: row.receiverName.trim(),
    consigneeEmail: "",
    consigneePhone: row.receiverMobile.trim(),
    consigneeAddress: row.receiverAddress.trim(),
    receiverCity: row.city.trim(),
    CollectAmount: row.amount.trim() || "0",
    ordered: row.articleNumber.trim(),
    ProductDescription: "Money Order",
    Weight: "0.5",
    shipmenttype: inferShipmentType(row.trackingId),
    numberOfPieces: "1",
    TrackingID: row.trackingId.trim().toUpperCase(),
  };
}

export default function GenerateMoneyOrder() {
  const { me, refreshMe } = useOutletContext<ShellCtx>();
  const [mode, setMode] = useState<"upload" | "manual">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<ManualMoneyOrderRow[]>([createEmptyRow()]);
  const [jobs, setJobs] = useState<LabelJob[]>([]);
  const [uiState, setUiState] = useState<"idle" | "uploading" | "processing" | "completed" | "failed">("idle");
  const [uiError, setUiError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  async function refreshJobs() {
    const data = await api<{ jobs: LabelJob[] }>("/api/jobs");
    setJobs(data.jobs);
  }

  const polling = useJobPolling({
    refreshJobs: async () => {
      await refreshJobs();
      await refreshMe();
    },
  });

  useEffect(() => {
    void refreshJobs().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (polling.jobStatus === "COMPLETED") {
      setUiState("completed");
      setProgress(100);
    }
    if (polling.jobStatus === "FAILED") {
      setUiState("failed");
      setProgress(100);
      setUiError(polling.jobError ?? "Generation failed");
    }
  }, [polling.jobError, polling.jobStatus]);

  const latestJob = useMemo(() => {
    if (!polling.jobId) return null;
    return jobs.find((job) => job.id === polling.jobId) ?? null;
  }, [jobs, polling.jobId]);

  function updateRow(index: number, patch: Partial<ManualMoneyOrderRow>) {
    setRows((previous) => previous.map((item, idx) => (idx === index ? { ...item, ...patch } : item)));
  }

  function removeRow(index: number) {
    setRows((previous) => {
      if (previous.length === 1) return previous;
      return previous.filter((_, idx) => idx !== index);
    });
  }

  function validateRows() {
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      if (!row.receiverName.trim() || !row.receiverAddress.trim() || !row.receiverMobile.trim() || !row.amount.trim()) {
        return `Row ${index + 1}: Receiver Name, Address, Mobile, and Amount are required.`;
      }
    }
    return null;
  }

  function validateSenderProfile() {
    const senderName = String(me?.user.companyName ?? "").trim();
    const senderAddress = String(me?.user.address ?? "").trim();
    const senderMobile = String(me?.user.contactNumber ?? "").trim();
    const senderCnic = normalizeCnic(String(me?.user.cnic ?? ""));
    const senderCity = String(me?.user.originCity ?? "").trim();
    if (!senderName || !senderAddress || !senderMobile || !senderCnic || !senderCity) {
      return "Complete sender profile first (name, address, mobile, CNIC, and origin city) from Settings before generating money orders.";
    }
    return null;
  }

  async function startGenerate() {
    if (uiState === "uploading" || uiState === "processing") return;

    setUiError(null);
    setUiState("uploading");
    setProgress(20);

    try {
      await apiHealthCheck();
      const senderError = validateSenderProfile();
      if (senderError) throw new Error(senderError);

      const sourceFile = (() => {
        if (mode === "upload") {
          return file;
        }
        const error = validateRows();
        if (error) throw new Error(error);
        const csvRows = rows.map((row) => toUploadRow(row, me));
        return new File([rowsToCsv(csvRows)], "manual-money-orders.csv", { type: "text/csv" });
      })();

      if (!sourceFile) {
        throw new Error("Upload a file before generating money orders.");
      }

      const result = await uploadFile("/api/upload", sourceFile, {
        barcodeMode: "auto",
        autoGenerateTracking: "true",
        carrierType: "pakistan_post",
        shipmentType: "VPL",
        printMode: "box",
        generateMoneyOrder: "true",
        trackAfterGenerate: "false",
      }) as { jobId: string };

      await refreshJobs();
      polling.start(result.jobId);
      setUiState("processing");
      setProgress(80);
    } catch (error) {
      setUiState("failed");
      setProgress(100);
      setUiError(error instanceof Error ? error.message : "Failed to generate money order");
    }
  }

  const senderName = String(me?.user.companyName ?? "").trim();
  const senderAddress = String(me?.user.address ?? "").trim();
  const senderMobile = String(me?.user.contactNumber ?? "").trim();
  const senderCnic = normalizeCnic(String(me?.user.cnic ?? ""));
  const senderTitle = senderName ? `${senderName} (${senderCnic || "CNIC missing"})` : "Profile incomplete";
  const readyToGenerate = uiState !== "uploading" && uiState !== "processing";
  const canGenerate = readyToGenerate && (mode === "manual" || Boolean(file));

  return (
    <PageShell className="space-y-3">
    <div className="grid gap-3 lg:grid-cols-12">
      <div className="space-y-3 lg:col-span-8">
        <Card className="border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <CardTitle>Generate Money Order</CardTitle>
              <div className="mt-1 text-sm font-normal text-slate-500">Premium manual + upload flow with sender profile lock from your account.</div>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">Sender: {senderTitle}</div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
            <button
              type="button"
              className={`h-11 rounded-xl px-4 text-sm font-semibold transition-all duration-200 ${mode === "upload" ? "bg-white text-brand shadow" : "text-slate-700 hover:bg-white/70"}`}
              onClick={() => setMode("upload")}
            >
              Upload File
            </button>
            <button
              type="button"
              className={`h-11 rounded-xl px-4 text-sm font-semibold transition-all duration-200 ${mode === "manual" ? "bg-white text-brand shadow" : "text-slate-700 hover:bg-white/70"}`}
              onClick={() => setMode("manual")}
            >
              Manual Entry
            </button>
          </div>
        </Card>

        {mode === "upload" ? (
          <UploadDropzone
            title="Upload Orders File"
            subtitle="CSV/XLS/XLSX supported with shared strict columns. Tracking ID can be empty; it will be generated automatically."
            file={file}
            onFileChange={setFile}
            statusLabel={uiState === "processing" ? "Processing" : uiState === "completed" ? "Completed" : "Ready"}
            progress={progress}
            error={uiError}
            busy={uiState === "uploading" || uiState === "processing"}
          />
        ) : (
          <Card className="border-slate-200 bg-white p-5 shadow-sm">
            <MoneyOrderForm
              rows={rows}
              maxRows={MAX_MANUAL_ROWS}
              onChangeRow={updateRow}
              onRemoveRow={removeRow}
              onAddRow={() => rows.length < MAX_MANUAL_ROWS && setRows((previous) => [...previous, createEmptyRow()])}
            />
          </Card>
        )}

        <div className="sticky bottom-3 z-10 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur lg:hidden">
          <button
            type="button"
            onClick={startGenerate}
            disabled={!canGenerate}
            className="w-full rounded-2xl bg-brand px-6 py-3.5 text-sm font-semibold text-white shadow-md transition-all hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            Generate Money Order
          </button>
        </div>
      </div>

      <div className="space-y-3 lg:col-span-4">
        <div className="space-y-3 lg:sticky lg:top-24">
          <Card className="border-slate-200 bg-white p-6 shadow-sm">
            <CardTitle>Action Panel</CardTitle>
            <div className="mt-1 text-sm font-normal text-slate-500">Uses existing upload pipeline and background worker.</div>
            <div className="mt-4 hidden justify-end lg:flex">
              <button
                type="button"
                onClick={startGenerate}
                disabled={!canGenerate}
                className="rounded-2xl bg-brand px-6 py-3 text-sm font-semibold text-white shadow-md transition-all hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
              >
                Generate Money Order
              </button>
            </div>
            {latestJob?.status === "COMPLETED" ? (
              <button
                type="button"
                onClick={() => triggerBrowserDownload(`/api/jobs/${latestJob.id}/download/money-orders`, `money-orders-${latestJob.id}.pdf`)}
                className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:border-brand/40"
              >
                Download Result
              </button>
            ) : null}
            {uiError ? <div className="mt-3 text-sm font-semibold text-red-700">{uiError}</div> : null}
            {latestJob ? <div className="mt-3 text-xs font-medium text-slate-500">Job: {latestJob.id} | Status: {latestJob.status}</div> : null}
          </Card>

          <SenderProfileSidecard me={me} />

          <Card className="border-slate-200 bg-white p-6 shadow-sm">
            <CardTitle>CSV Format</CardTitle>
            <div className="mt-2 text-sm font-normal text-slate-500">Use strict sample structure for upload and manual conversion.</div>
            <SampleDownloadLink className="mt-4 inline-flex items-center justify-center rounded-2xl bg-brand px-3 py-2 text-xs font-semibold text-white shadow-lg hover:bg-brand-dark" />
          </Card>
        </div>
      </div>
    </div>
    </PageShell>
  );
}
