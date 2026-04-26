import { useEffect, useState } from "react";
import Card from "./Card";

const metrics = [
  { label: "Total Labels Generated", value: 12840 },
  { label: "Money Orders Processed", value: 3120 },
  { label: "Tracking Checked", value: 8420 },
  { label: "Complaints Resolved", value: 1190 },
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
      <div className="ui-page">
        <Card className="rounded-3xl border border-white/80 bg-white/90 p-6 shadow-xl md:p-8">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {metrics.map((metric, index) => (
              <div key={metric.label} className="rounded-3xl border border-slate-200 bg-slate-50/80 p-5 text-center">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{metric.label}</div>
                <div className="mt-3 text-3xl font-extrabold tracking-[-0.04em] text-brand-ink md:text-4xl">{counts[index].toLocaleString()}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </section>
  );
}
