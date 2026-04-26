import { useEffect, useState } from "react";
import Card from "./Card";

const metrics = [
  { label: "Labels Processed", value: 12840 },
  { label: "Money Orders Created", value: 3120 },
  { label: "Tracking Requests", value: 8420 },
  { label: "Success Rate", value: 99.2, suffix: "%" },
];

export default function FeatureStrip() {
  const [counts, setCounts] = useState(metrics.map(() => 0));

  useEffect(() => {
    let frame = 0;
    const start = performance.now();
    const duration = 1200;

    const tick = (time) => {
      const progress = Math.min(1, (time - start) / duration);
      setCounts(metrics.map((metric) => Math.round(metric.value * progress)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <section id="trust" className="py-10 md:py-12">
      <div className="ui-page py-8 md:py-10">
        <Card className="rounded-full border border-emerald-100 bg-white/95 p-4 shadow-xl md:p-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {metrics.map((metric, index) => (
              <div key={metric.label} className="rounded-full border border-emerald-100/70 bg-emerald-50/40 px-5 py-3 text-center">
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{metric.label}</div>
                <div className="mt-1 text-2xl font-extrabold tracking-[-0.04em] text-brand-ink md:text-3xl">
                  {metric.suffix ? `${counts[index].toFixed(1)}${metric.suffix}` : counts[index].toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </section>
  );
}
