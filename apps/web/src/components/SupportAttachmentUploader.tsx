import { useRef, useState } from "react";
import { SUPPORT_ATTACHMENT_ACCEPT, SUPPORT_ATTACHMENT_MAX_FILES, validateSupportAttachmentFiles } from "../lib/support";

type Props = {
  onUpload?: (files: File[], message?: string) => Promise<void>;
  disabled?: boolean;
  selectionOnly?: boolean;
  files?: File[];
  onFilesChange?: (files: File[]) => void;
  message?: string;
  onMessageChange?: (message: string) => void;
};

export default function SupportAttachmentUploader({ onUpload, disabled, selectionOnly, files: controlledFiles, onFilesChange, message: controlledMessage, onMessageChange }: Props) {
  const [internalFiles, setInternalFiles] = useState<File[]>([]);
  const [internalMessage, setInternalMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const files = controlledFiles ?? internalFiles;
  const note = controlledMessage ?? internalMessage;

  function setFiles(nextFiles: File[]) {
    if (onFilesChange) {
      onFilesChange(nextFiles);
      return;
    }
    setInternalFiles(nextFiles);
  }

  function setMessage(nextMessage: string) {
    if (onMessageChange) {
      onMessageChange(nextMessage);
      return;
    }
    setInternalMessage(nextMessage);
  }

  async function submit() {
    if (files.length === 0 || !onUpload) return;
    setSubmitting(true);
    setError(null);
    try {
      await onUpload(files, note.trim() || undefined);
      setFiles([]);
      setMessage("");
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-sm font-semibold text-slate-800">Attachments</p>
      <p className="mt-1 text-xs text-slate-500">Max 5 files, 10 MB each. Allowed: PDF, images, Word, Excel, CSV, TXT.</p>

      <input
        ref={fileRef}
        type="file"
        accept={SUPPORT_ATTACHMENT_ACCEPT}
        multiple
        className="mt-3 block w-full text-sm"
        disabled={disabled || submitting}
        onChange={(event) => {
          const selected = Array.from(event.target.files ?? []).slice(0, SUPPORT_ATTACHMENT_MAX_FILES);
          const validationError = validateSupportAttachmentFiles(selected);
          if (validationError) {
            setError(validationError);
            setFiles([]);
            return;
          }
          setError(null);
          setFiles(selected);
        }}
      />

      <textarea
        className="field-input mt-3 min-h-[90px]"
        placeholder="Optional note for these attachments"
        value={note}
        disabled={disabled || submitting}
        onChange={(event) => setMessage(event.target.value)}
      />

      {files.length > 0 ? (
        <ul className="mt-3 space-y-1 text-xs text-slate-600">
          {files.map((file) => (
            <li key={`${file.name}-${file.size}`}>{file.name} ({Math.ceil(file.size / 1024)} KB)</li>
          ))}
        </ul>
      ) : null}

      {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}

      {!selectionOnly ? (
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            className="btn-primary disabled:opacity-50"
            disabled={disabled || submitting || files.length === 0}
            onClick={() => void submit()}
          >
            {submitting ? "Uploading..." : "Upload Attachments"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
