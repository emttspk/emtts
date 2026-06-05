import { CheckCircle2, CircleDashed, Download, FileArchive, LoaderCircle, TimerReset } from "lucide-react";

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

type StageDefinition = {
  id: LabelGenerationStage;
  title: string;
  activity: string;
};

export const LABEL_GENERATION_STAGES: StageDefinition[] = [
  { id: "uploading_file", title: "Uploading file", activity: "Sending the validated file package to the platform." },
  { id: "validating_records", title: "Validating records", activity: "Checking uploaded rows, services, and file readiness." },
  { id: "creating_job", title: "Creating job", activity: "Preparing the generation request and job record." },
  { id: "queued", title: "Queued", activity: "Waiting for the worker slot to start this label batch." },
  { id: "generating_labels", title: "Generating labels", activity: "Rendering labels and tracking artifacts for the accepted rows." },
  { id: "preparing_download", title: "Preparing download", activity: "Finalizing files so they can be downloaded safely." },
  { id: "completed", title: "Completed", activity: "Your label package is ready for download." },
];

function getStageIndex(stage: LabelGenerationStage) {
  return LABEL_GENERATION_STAGES.findIndex((item) => item.id === stage);
}

function formatProgress(progress: number) {
  return Math.max(8, Math.min(100, Math.round(progress)));
}

export default function LabelGenerationProgressCard(props: LabelGenerationProgressCardProps) {
  const { currentStage, elapsedSeconds, progress, recordsProcessed, labelsGenerated, downloadReady, statusLabel } = props;
  const currentStageMeta = LABEL_GENERATION_STAGES[getStageIndex(currentStage)] ?? LABEL_GENERATION_STAGES[0];
  const currentStageIndex = currentStage === "completed" && downloadReady ? LABEL_GENERATION_STAGES.length : getStageIndex(currentStage);
  const progressValue = formatProgress(progress);

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
              <div className="mt-1 text-xl font-bold text-slate-950">{currentStageMeta.title}</div>
              <div className="mt-1 max-w-xl text-sm leading-6 text-slate-600">{currentStageMeta.activity}</div>
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

      <div className="rounded-[1.7rem] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <TimerReset className="h-4 w-4 text-sky-700" />
          Processing Timeline
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
          {LABEL_GENERATION_STAGES.map((stage, index) => {
            const isDone = index < currentStageIndex;
            const isActive = index === currentStageIndex;
            const isUpcoming = index > currentStageIndex;
            return (
              <div
                key={stage.id}
                className={`rounded-2xl border px-3 py-3 transition-all ${isDone ? "border-emerald-200 bg-emerald-50 text-emerald-900" : isActive ? "border-sky-200 bg-sky-50 text-sky-900 shadow-sm" : "border-slate-200 bg-slate-50 text-slate-500"}`}
              >
                <div className="flex items-center gap-2">
                  <div className={`relative flex h-8 w-8 items-center justify-center rounded-full border text-xs font-bold ${isDone ? "border-emerald-300 bg-emerald-100 text-emerald-700" : isActive ? "border-sky-300 bg-white text-sky-700" : "border-slate-200 bg-white text-slate-400"}`}>
                    {isDone ? <CheckCircle2 className="h-4 w-4" /> : isActive ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CircleDashed className="h-4 w-4" />}
                    {isActive && !isDone ? <span className="absolute inset-0 animate-ping rounded-full bg-sky-200/60" /> : null}
                  </div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em]">
                    {isDone ? "Done" : isActive ? "Active" : "Pending"}
                  </div>
                </div>
                <div className="mt-3 text-sm font-semibold">{stage.title}</div>
                <div className={`mt-1 text-xs leading-5 ${isUpcoming ? "text-slate-400" : "text-current/80"}`}>{stage.activity}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-[1.5rem] border border-emerald-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">Records Processed</div>
              <div className="mt-2 text-3xl font-black text-slate-950">{recordsProcessed.toLocaleString()}</div>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
              <FileArchive className="h-5 w-5" />
            </div>
          </div>
        </div>
        <div className="rounded-[1.5rem] border border-sky-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700">Labels Generated</div>
              <div className="mt-2 text-3xl font-black text-slate-950">{labelsGenerated.toLocaleString()}</div>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
              <FileArchive className="h-5 w-5" />
            </div>
          </div>
        </div>
        <div className="rounded-[1.5rem] border border-violet-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-700">Download Ready</div>
              <div className="mt-2 text-2xl font-black text-slate-950">{downloadReady ? "Yes" : "Preparing"}</div>
            </div>
            <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${downloadReady ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-500"}`}>
              <Download className="h-5 w-5" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
