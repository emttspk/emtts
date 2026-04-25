import Card from "./Card";

export default function StatCard({ title, value, hint, tone = "text-slate-900" }) {
  return (
    <Card className="p-4">
      <div className="text-xs uppercase tracking-[0.12em] text-slate-500">{title}</div>
      <div className={`mt-2 text-3xl font-bold ${tone}`}>{value}</div>
      {hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
    </Card>
  );
}
