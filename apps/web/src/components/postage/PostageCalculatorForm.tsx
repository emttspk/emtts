import { useState } from "react";

export default function PostageCalculatorForm({ onSubmit }: { onSubmit: (rows: Array<Record<string, unknown>>) => void }) {
  const [json, setJson] = useState('[{"serviceCode":"RGL","weightGrams":120}]');
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-sm font-semibold">Rows (JSON)</div>
      <textarea className="mt-2 w-full rounded border p-2 font-mono text-xs" rows={8} value={json} onChange={(e) => setJson(e.target.value)} />
      <button
        type="button"
        className="mt-2 rounded bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white"
        onClick={() => onSubmit(JSON.parse(json))}
      >
        Calculate
      </button>
    </div>
  );
}
