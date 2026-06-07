import { LoaderCircle } from "lucide-react";
import ProcessStepper from "./ProcessStepper";

type LoadingOverlayProps = {
  title: string;
  subtitle?: string;
  progress?: number;
  steps: Array<{ label: string; detail?: string }>;
  activeIndex: number;
  className?: string;
};

export default function LoadingOverlay({
  title,
  subtitle,
  progress,
  steps,
  activeIndex,
  className = "",
}: LoadingOverlayProps) {
  return (
    <div className={`fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 px-4 ${className}`}>
      <div className="w-full max-w-3xl rounded-[2rem] border border-emerald-200 bg-white p-5 shadow-[0_28px_80px_rgba(15,23,42,0.28)] sm:p-7">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
            <LoaderCircle className="h-6 w-6 animate-spin" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Please wait</div>
            <h2 className="mt-1 text-2xl font-black tracking-[-0.03em] text-slate-950">{title}</h2>
            {subtitle ? <p className="mt-2 text-sm leading-6 text-slate-600">{subtitle}</p> : null}
          </div>
        </div>

        <div className="mt-6">
          <ProcessStepper
            steps={steps}
            activeIndex={activeIndex}
            progress={progress}
          />
        </div>
      </div>
    </div>
  );
}
