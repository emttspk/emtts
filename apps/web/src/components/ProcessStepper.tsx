type ProcessStep = {
  label: string;
  detail?: string;
};

type ProcessStepperProps = {
  title?: string;
  subtitle?: string;
  steps: ProcessStep[];
  activeIndex: number;
  progress?: number;
  className?: string;
};

function clampProgress(progress: number | undefined) {
  if (typeof progress !== "number" || Number.isNaN(progress)) return 0;
  return Math.max(0, Math.min(100, Math.round(progress)));
}

export default function ProcessStepper({
  title,
  subtitle,
  steps,
  activeIndex,
  progress,
  className = "",
}: ProcessStepperProps) {
  const safeActiveIndex = Math.max(0, Math.min(steps.length - 1, activeIndex));
  const safeProgress = clampProgress(progress);

  return (
    <div className={className}>
      {(title || subtitle) ? (
        <div className="mb-4">
          {title ? <div className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">{title}</div> : null}
          {subtitle ? <div className="mt-1 text-sm text-slate-600">{subtitle}</div> : null}
        </div>
      ) : null}

      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          <span>Progress</span>
          <span>{safeProgress}%</span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-[linear-gradient(90deg,#0ea576,#14b8a6,#2563eb)] transition-all duration-500"
            style={{ width: `${safeProgress}%` }}
          />
        </div>

        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {steps.map((step, index) => {
            const isDone = index < safeActiveIndex;
            const isActive = index === safeActiveIndex;
            return (
              <div
                key={`${step.label}-${index}`}
                className={`rounded-2xl border px-3 py-3 transition-all ${
                  isDone
                    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                    : isActive
                      ? "border-sky-200 bg-sky-50 text-sky-900 shadow-sm"
                      : "border-slate-200 bg-slate-50 text-slate-500"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em]">
                    {isDone ? "Done" : isActive ? "Active" : "Pending"}
                  </div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em]">
                    {index + 1}/{steps.length}
                  </div>
                </div>
                <div className="mt-2 text-sm font-semibold">{step.label}</div>
                {step.detail ? <div className="mt-1 text-xs leading-5 text-current/80">{step.detail}</div> : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
