import { useEffect, useMemo, useState } from "react";
import Card from "../components/Card";
import { api } from "../lib/api";
import { useTrackingJobPolling } from "../lib/useTrackingJobPolling";
import type { Shipment } from "../lib/types";

export default function Complaints() {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>("");
  const [phone, setPhone] = useState<string>("");

  const polling = useTrackingJobPolling({});

  async function refresh() {
    const data = await api<{ shipments: Shipment[] }>("/api/shipments?limit=50");
    setShipments(data.shipments);
  }

  useEffect(() => {
    let ok = true;
    setLoading(true);
    setError(null);
    refresh()
      .catch((e) => {
        if (!ok) return;
        setError(e instanceof Error ? e.message : "Failed to load shipments");
      })
      .finally(() => {
        if (!ok) return;
        setLoading(false);
      });
    return () => {
      ok = false;
    };
  }, []);

  const current = useMemo(() => shipments.find((s) => s.trackingNumber === selected) ?? null, [shipments, selected]);

  function normalizeComplaintPhone(raw: string) {
    const cleaned = String(raw || "").trim();
    const plus923 = cleaned.match(/^\+923\d{9}$/);
    if (plus923) {
      return `0${cleaned.slice(3)}`;
    }
    const digitsOnly = cleaned.replace(/\D+/g, "");
    if (/^03\d{9}$/.test(digitsOnly)) {
      return digitsOnly;
    }
    if (/^923\d{9}$/.test(digitsOnly)) {
      return `0${digitsOnly.slice(2)}`;
    }
    return "";
  }

  return (
    <div className="space-y-8">
      <Card className="p-8">
        <div className="inline-flex rounded-2xl border border-brand/30 bg-brand/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-brand">
          Epost.pk
        </div>
        <div className="mt-3 text-2xl font-semibold text-[#0F172A]">Complaint Automation</div>
        <div className="mt-1 text-sm text-slate-600">Submit and manage complaint workflows from one dashboard.</div>

        {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="md:col-span-2">
            <label className="text-sm font-medium text-slate-700">Shipment</label>
            <select className="field-input mt-1" value={selected} onChange={(e) => setSelected(e.target.value)} disabled={loading}>
              <option value="">Select tracking number...</option>
              {shipments.map((s) => (
                <option key={s.id} value={s.trackingNumber}>
                  {s.trackingNumber} {s.status ? `- ${s.status}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Phone</label>
            <input className="field-input mt-1" placeholder="03001234567 or +923001234567" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
        </div>

        {current ? (
          <div className="mt-5 rounded-2xl border border-[#E5E7EB] bg-[#F8FAF9] px-4 py-3 text-sm text-slate-700 shadow-xl">
            <div>
              <span className="font-medium">Status:</span> {current.status ?? "-"} • <span className="font-medium">Complaint:</span> {current.complaintStatus ?? "-"}
            </div>
            {current.city ? (
              <div className="mt-1">
                <span className="font-medium">City:</span> {current.city}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            className="btn-secondary"
            onClick={async () => {
              setError(null);
              try {
                await refresh();
              } catch (e) {
                setError(e instanceof Error ? e.message : "Refresh failed");
              }
            }}
          >
            Refresh Shipments
          </button>

          <button
            className="btn-primary disabled:opacity-50"
            disabled={!selected || !phone || polling.jobStatus === "PROCESSING" || polling.jobStatus === "QUEUED"}
            onClick={async () => {
              setError(null);
              polling.reset();
              try {
                const normalizedPhone = normalizeComplaintPhone(phone);
                if (!normalizedPhone) {
                  setError("Invalid phone. Use 03XXXXXXXXX or +923XXXXXXXXX.");
                  return;
                }
                const res = await api<{ jobId: string }>("/api/tracking/complaint", {
                  method: "POST",
                  body: JSON.stringify({ tracking_number: selected, phone: normalizedPhone }),
                });
                polling.start(res.jobId);
              } catch (e) {
                setError(e instanceof Error ? e.message : "Complaint request failed");
              }
            }}
          >
            Submit Complaint
          </button>
        </div>

        {polling.jobStatus ? (
          <div className="mt-4 text-sm text-slate-700">
            Job status: <span className="font-medium">{polling.jobStatus}</span>
            {polling.jobError ? <span className="text-red-600"> • {polling.jobError}</span> : null}
          </div>
        ) : null}
      </Card>

      <Card className="p-8">
        <div className="text-lg font-medium text-[#0F172A]">Recent Shipments</div>
        <div className="mt-4 overflow-x-auto rounded-2xl border border-[#E5E7EB] bg-white shadow-xl">
          <table className="min-w-full text-sm">
            <thead className="bg-[#F8FAF9]">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-500 whitespace-nowrap">Tracking</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-500 whitespace-nowrap">Status</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-500 whitespace-nowrap">Complaint</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-500 whitespace-nowrap">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E7EB]">
              {shipments.map((s) => (
                <tr key={s.id}>
                  <td className="px-3 py-2 font-mono text-xs text-slate-800 whitespace-nowrap">{s.trackingNumber}</td>
                  <td className="px-3 py-2 text-slate-800 whitespace-nowrap">{s.status ?? "-"}</td>
                  <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{s.complaintStatus ?? "-"}</td>
                  <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{new Date(s.updatedAt).toLocaleString()}</td>
                </tr>
              ))}
              {shipments.length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-sm text-slate-600" colSpan={4}>
                    No shipments yet. Run Bulk Tracking first.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
