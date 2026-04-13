import { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { UploadCloud } from "lucide-react";
import Card from "./Card";
import { cn } from "../lib/cn";

export default function UploadDropzone(props: {
  title?: string;
  subtitle?: string;
  file: File | null;
  onFileChange: (file: File | null) => void;
  statusLabel: string;
  progress: number;
  error?: string | null;
  busy?: boolean;
}) {
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const next = acceptedFiles[0] ?? null;
      props.onFileChange(next);
    },
    [props],
  );

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    noClick: true,
    accept: {
      "text/csv": [".csv"],
      "application/vnd.ms-excel": [".xls"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
    },
    maxFiles: 1,
  });

  return (
    <Card>
      <div className="border-b px-6 py-4">
        <div className="text-xl font-medium text-gray-900">{props.title ?? "Bulk Tracking"}</div>
        <div className="mt-1 text-sm text-gray-600">
          {props.subtitle ??
            "Upload CSV/XLS/XLSX using the strict shared sample columns."}
        </div>
      </div>

      <div className="grid gap-4 p-6">
        <div
          {...getRootProps()}
          className={cn(
            "relative rounded-xl border border-dashed bg-white p-8 transition-all duration-200 ease-in-out",
            isDragActive ? "border-indigo-600 bg-indigo-50/40" : "border-gray-200 hover:border-gray-300",
          )}
        >
          <input {...getInputProps()} />

          <div className="flex flex-col items-center text-center">
            <div className={cn("flex h-12 w-12 items-center justify-center rounded-xl bg-gray-50", props.busy && "bg-white")}>
              <UploadCloud className={cn("h-6 w-6", props.busy ? "text-amber-600" : "text-gray-600")} />
            </div>

            <div className="mt-4 text-base font-medium text-gray-900">Drag & drop Excel/CSV</div>
            <div className="mt-1 text-sm text-gray-600">
              or{" "}
              <button type="button" className="font-medium text-indigo-600 hover:text-indigo-700" onClick={open}>
                click to upload
              </button>
            </div>

            <div className="mt-4 w-full max-w-xl">
              <div className="flex items-center justify-between text-xs text-gray-600">
                <span>{props.file ? props.file.name : "No file selected"}</span>
                <span className={cn("font-medium", props.busy ? "text-amber-600" : "text-gray-700")}>{props.statusLabel}</span>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className={cn("h-full rounded-full transition-all duration-200 ease-in-out", props.error ? "bg-red-500" : props.busy ? "bg-amber-500" : "bg-indigo-600")}
                  style={{ width: `${Math.max(0, Math.min(100, props.progress))}%` }}
                />
              </div>
              {props.error ? <div className="mt-2 text-sm text-red-600">{props.error}</div> : null}
            </div>
          </div>

          {isDragActive ? <div className="pointer-events-none absolute inset-2 rounded-lg ring-1 ring-indigo-600/40" /> : null}
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="text-sm text-gray-600">
            File: <span className="font-medium text-gray-900">{props.file ? "Selected" : "Not selected"}</span>
          </div>
          <button
            type="button"
            onClick={() => props.onFileChange(null)}
            className="rounded-lg border bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-all duration-200 ease-in-out hover:bg-gray-50"
            disabled={props.busy}
          >
            Reset File
          </button>
        </div>
      </div>
    </Card>
  );
}
