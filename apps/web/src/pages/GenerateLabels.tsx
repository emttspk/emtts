import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import Card from "../components/Card";
import UploadDropzone from "../components/UploadDropzone";
import SampleDownloadLink from "../components/SampleDownloadLink";
import { api, apiHealthCheck, triggerBrowserDownload, uploadFile } from "../lib/api";
import type { LabelJob, MeResponse } from "../lib/types";
import { useJobPolling } from "../lib/useJobPolling";
import { rowsToCsv, type UploadOrderRow } from "../shared/orderColumns";

type ShellCtx = { me: MeResponse | null; refreshMe: () => Promise<void> };

type LabelManualRow = {
  consigneeName: string;
  consigneeAddress: string;
  consigneePhone: string;
  receiverCity: string;
  productName: string;
  weight: string;
  codAmount: string;
  trackingId: string;
};

const MAX_MANUAL_ROWS = 5;

function createEmptyLabelRow(): LabelManualRow {
  return {
    consigneeName: "",
    consigneeAddress: "",
    consigneePhone: "",
    receiverCity: "",
    productName: "",
    weight: "",
    codAmount: "",
    trackingId: "",
  };
}

function toUploadRow(row: LabelManualRow, me: MeResponse | null): UploadOrderRow {
  return {
    shipperName: String(me?.user.companyName ?? "Admin Dispatch").trim() || "Admin Dispatch",
    shipperPhone: String(me?.user.contactNumber ?? "03000000000").trim() || "03000000000",
    shipperAddress: String(me?.user.address ?? "Pakistan").trim() || "Pakistan",
    shipperEmail: String(me?.user.email ?? "admin@epost.pk").trim() || "admin@epost.pk",
    senderCity: String(me?.user.originCity ?? row.receiverCity ?? "").trim(),
    consigneeName: row.consigneeName.trim(),
    consigneeEmail: "",
    consigneePhone: row.consigneePhone.trim(),
    consigneeAddress: row.consigneeAddress.trim(),
    receiverCity: row.receiverCity.trim(),
    CollectAmount: row.codAmount.trim() || "0",
    ordered: "",
    ProductDescription: row.productName.trim(),
    Weight: row.weight.trim() || "0.5",
    shipmenttype: "VPL",
    numberOfPieces: "1",
    TrackingID: row.trackingId.trim().toUpperCase(),
  };
}

export default function GenerateLabels() {
  const { me, refreshMe } = useOutletContext<ShellCtx>();
  const [mode, setMode] = useState<"upload" | "manual">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<LabelManualRow[]>([createEmptyLabelRow()]);
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

  const canAddRow = rows.length < MAX_MANUAL_ROWS;

  function updateRow(index: number, patch: Partial<LabelManualRow>) {
    setRows((previous) => previous.map((item, idx) => (idx === index ? { ...item, ...patch } : item)));
  }

  function removeRow(index: number) {
    setRows((previous) => {
      if (previous.length === 1) return previous;
      return previous.filter((_, idx) => idx !== index);
    });
  }

  function validateManualRows() {
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      if (!row.consigneeName.trim() || !row.consigneeAddress.trim() || !row.consigneePhone.trim() || !row.receiverCity.trim()) {
        return `Row ${index + 1}: Consignee Name, Address, Mobile, and City are required.`;
      }
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

      const sourceFile = (() => {
        if (mode === "upload") {
          return file;
        }
        const error = validateManualRows();
        if (error) {
          throw new Error(error);
        }
        const csvRows = rows.map((row) => toUploadRow(row, me));
        const csv = rowsToCsv(csvRows);
        return new File([csv], "manual-labels.csv", { type: "text/csv" });
      })();

      if (!sourceFile) {
        throw new Error("Upload a file before generating labels.");
      }

      const result = await uploadFile("/api/upload", sourceFile, {
        barcodeMode: "auto",
        autoGenerateTracking: "true",
        carrierType: "pakistan_post",
        shipmentType: "VPL",
        printMode: "box",
        generateMoneyOrder: "false",
        trackAfterGenerate: "false",
      }) as { jobId: string };

      await refreshJobs();
      polling.start(result.jobId);
      setUiState("processing");
      setProgress(80);
    } catch (error) {
      setUiState("failed");
      setProgress(100);
      setUiError(error instanceof Error ? error.message : "Failed to generate labels");
    }
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card className="p-5">
            <div className="text-base font-medium text-gray-900">Generate Labels</div>
            <div className="mt-1 text-sm text-gray-600">Switch between file upload and manual entry. Manual mode supports up to 5 rows.</div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className={`rounded-2xl border px-4 py-2 text-sm font-medium ${mode === "upload" ? "border-brand bg-brand/10 text-brand" : "border-slate-200 bg-white text-slate-700"}`}
                onClick={() => setMode("upload")}
              >
                Upload File
              </button>
              <button
                type="button"
                className={`rounded-2xl border px-4 py-2 text-sm font-medium ${mode === "manual" ? "border-brand bg-brand/10 text-brand" : "border-slate-200 bg-white text-slate-700"}`}
                onClick={() => setMode("manual")}
              >
                Manual Entry
              </button>
            </div>
          </Card>

          {mode === "upload" ? (
            <UploadDropzone
              title="Upload Orders File"
              subtitle="CSV/XLS/XLSX supported with shared strict columns."
              file={file}
              onFileChange={setFile}
              statusLabel={uiState === "processing" ? "Processing" : uiState === "completed" ? "Completed" : "Ready"}
              progress={progress}
              error={uiError}
              busy={uiState === "uploading" || uiState === "processing"}
            />
          ) : (
            <Card className="p-5">
              <div className="text-base font-medium text-gray-900">Manual Entry</div>
              <div className="mt-1 text-xs text-gray-500">Rows: {rows.length}/{MAX_MANUAL_ROWS}</div>
              <div className="mt-4 space-y-3">
                {rows.map((row, index) => (
                  <div key={`label-row-${index}`} className="grid gap-2 rounded-2xl border border-slate-200 p-3 sm:grid-cols-2 xl:grid-cols-4">
                    <input className="field-input" placeholder="Consignee Name" value={row.consigneeName} onChange={(event) => updateRow(index, { consigneeName: event.target.value })} />
                    <input className="field-input" placeholder="Address" value={row.consigneeAddress} onChange={(event) => updateRow(index, { consigneeAddress: event.target.value })} />
                    <input className="field-input" placeholder="Mobile" value={row.consigneePhone} onChange={(event) => updateRow(index, { consigneePhone: event.target.value })} />
                    <input className="field-input" placeholder="City" value={row.receiverCity} onChange={(event) => updateRow(index, { receiverCity: event.target.value })} />
                    <input className="field-input" placeholder="Product Name" value={row.productName} onChange={(event) => updateRow(index, { productName: event.target.value })} />
                    <input className="field-input" placeholder="Weight" value={row.weight} onChange={(event) => updateRow(index, { weight: event.target.value })} />
                    <input className="field-input" placeholder="COD Amount" value={row.codAmount} onChange={(event) => updateRow(index, { codAmount: event.target.value })} />
                    <input className="field-input" placeholder="Tracking ID (optional)" value={row.trackingId} onChange={(event) => updateRow(index, { trackingId: event.target.value })} />
                    <div className="sm:col-span-2 xl:col-span-4 flex justify-end">
                      <button type="button" className="rounded-xl border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700" onClick={() => removeRow(index)}>
                        Remove Row
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => canAddRow && setRows((previous) => [...previous, createEmptyLabelRow()])}
                disabled={!canAddRow}
                className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
              >
                Add Row
              </button>
            </Card>
          )}

          <Card className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xl font-medium text-gray-900">Generate</div>
                <div className="mt-1 text-sm text-gray-600">Generates labels using existing upload and generation flow.</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={startGenerate}
                  disabled={(mode === "upload" && !file) || uiState === "uploading" || uiState === "processing"}
                  className="rounded-2xl bg-brand px-6 py-3 text-sm font-semibold text-white shadow-md hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Generate Labels
                </button>
                {latestJob?.status === "COMPLETED" ? (
                  <button
                    type="button"
                    onClick={() => triggerBrowserDownload(`/api/jobs/${latestJob.id}/download/labels`, `labels-${latestJob.id}.pdf`)}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700"
                  >
                    Download Result
                  </button>
                ) : null}
              </div>
            </div>
            {uiError ? <div className="mt-3 text-sm font-medium text-red-700">{uiError}</div> : null}
            {latestJob ? <div className="mt-3 text-xs text-slate-500">Job: {latestJob.id} | Status: {latestJob.status}</div> : null}
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-6">
            <div className="text-xl font-medium text-gray-900">CSV Format</div>
            <div className="mt-2 text-sm text-gray-600">Use the same strict sample structure for upload and manual conversion.</div>
            <SampleDownloadLink className="mt-4 inline-flex items-center justify-center rounded-2xl bg-brand px-3 py-2 text-xs font-medium text-white shadow-lg hover:bg-brand-dark" />
          </Card>
        </div>
      </div>
    </div>
  );
}
