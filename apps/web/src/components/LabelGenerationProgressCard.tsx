import { CheckCircle2, LoaderCircle } from "lucide-react";
import ProcessStepper from "./ProcessStepper";

export type LabelGenerationStage =
  | "uploading_file"
  | "validating_records"
  | "creating_job"
  | "queued"
  | "generating_labels"
  | "preparing_download"
  | "completed";

type LabelGenerationProgressCardProps = {
  currentStage: LabelGenerationStage;
  elapsedSeconds: number;
  progress: number;
  recordsProcessed: number;
  labelsGenerated: number;
  downloadReady: boolean;
  statusLabel: string;
};

const LABEL_WORKFLOW_STEPS = [
  { label: "Upload", detail: "Send the validated source file." },
  { label: "Validate", detail: "Check rows, services, and limits." },
  { label: "Generate", detail: "Render labels and tracking assets." },
  { label: "Download", detail: "Get the finished files." },
  { label: "Complete", detail: "Make downloads available." },
];

function getStageIndex(stage: LabelGenerationStage) {
  const LABEL_GENERATION_STAGES = ["uploading_file", "validating_records", "creating_job", "queued", "generating_labels", "preparing_download", "completed"];
  return LABEL_GENERATION_STAGES.indexOf(stage);
}

function formatProgress(progress: number) {
  return Math.max(8, Math.min(100, Math.round(progress)));
}

export default function LabelGenerationProgressCard(props: LabelGenerationProgressCardProps) {
  const { currentStage, elapsedSeconds, progress, recordsProcessed, labelsGenerated, downloadReady, statusLabel } = props;
  const currentStageIndex = getStageIndex(currentStage);
  const progressValue = formatProgress(progress);
  const workflowIndex =
    currentStage === "completed" ? LABEL_WORKFLOW_STEPS.length - 1
      : currentStage === "preparing_download" ? 3
        : currentStage === "generating_labels" || currentStage === "queued" ? 2
          : currentStage === "creating_job" || currentStage === "validating_records" ? 1
            : 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 rounded-[1.7rem] border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(240,253,250,0.9),_rgba(255,255,255,0.98)_52%,_rgba(239,246,255,0.96)_100%)] p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className={`relative flex h-12 w-12 items-center justify-center rounded-2xl ${currentStage === "completed" ? "bg-emerald-100 text-emerald-700" : "bg-sky-100 text-sky-700"}`}>
              {currentStage === "completed" ? <CheckCircle2 className="h-6 w-6" /> : <LoaderCircle className="h-6 w-6 animate-spin" />}
              {currentStage !== "completed" ? <span className="absolute inset-0 animate-ping rounded-2xl bg-sky-200/60" /> : null}
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Current Stage</div>
              <div className="mt-1 text-xl font-bold text-slate-950">{LABEL_WORKFLOW_STEPS[workflowIndex]?.label ?? currentStage}</div>
              <div className="mt-1 max-w-xl text-sm leading-6 text-slate-600">{LABEL_WORKFLOW_STEPS[workflowIndex]?.detail ?? ""}</div>
            </div>
          </div>
          <div className="rounded-2xl border border-white/80 bg-white/90 px-4 py-3 text-right shadow-sm">
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Live Status</div>
            <div className="mt-1 text-sm font-semibold text-slate-900">{statusLabel}</div>
            <div className="mt-2 text-xs text-slate-500">Elapsed {elapsedSeconds}s</div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            <span>Progress</span>
            <span>{progressValue}%</span>
          </div>
          <div className="h-3 rounded-full bg-slate-100">
            <div className="h-3 rounded-full bg-[linear-gradient(90deg,#10b981,#14b8a6,#2563eb)] transition-all duration-500" style={{ width: `${progressValue}%` }} />
          </div>
        </div>
      </div>

      <ProcessStepper
        title="Workflow"
        subtitle="Upload, validate, generate, download, complete."
        steps={LABEL_WORKFLOW_STEPS}
        activeIndex={workflowIndex}
        progress={progressValue}
      />

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-[1.5rem] border border-emerald-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">Records Processed</div>
              <div className="mt-2 text-3xl font-black text-slate-950">{recordsProcessed.toLocaleString()}</div>
            </div>
          </div>
        </div>
        <div className="rounded-[1.5rem] border border-sky-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700">Labels Generated</div>
              <div className="mt-2 text-3xl font-black text-slate-950">{labelsGenerated.toLocaleString()}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
