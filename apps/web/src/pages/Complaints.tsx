import { useEffect, useMemo, useState } from "react";
import Card from "../components/Card";
import { api } from "../lib/api";
import { useTrackingJobPolling } from "../lib/useTrackingJobPolling";
import type { Shipment } from "../lib/types";

export default function Complaints() {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [totalShipments, setTotalShipments] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>("");
  const [phone, setPhone] = useState<string>("");
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const totalPages = Math.max(1, Math.ceil(totalShipments / pageSize));
  const cacheKey = `complaints.shipments.page.${page}.limit.${pageSize}.v1`;

  const polling = useTrackingJobPolling({});

  async function refresh() {
    const data = await api<{ shipments: Shipment[]; total: number }>(`/api/shipments?page=${page}&limit=${pageSize}`);
    setShipments(data.shipments);
    setTotalShipments(Number(data.total ?? data.shipments.length));
    window.localStorage.setItem(cacheKey, JSON.stringify({ shipments: data.shipments, total: data.total, ts: Date.now() }));
  }

  useEffect(() => {
    let ok = true;
    setLoading(true);
    setError(null);
    const cachedRaw = window.localStorage.getItem(cacheKey);
    if (cachedRaw) {
      try {
        const cached = JSON.parse(cachedRaw) as { shipments: Shipment[]; total: number };
        if (Array.isArray(cached?.shipments)) {
          setShipments(cached.shipments);
          setTotalShipments(Number(cached.total ?? cached.shipments.length));
        }
      } catch {
        // Ignore malformed cache.
      }
    }
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
  }, [page]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

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
    <div className="space-y-6">
      <Card className="p-4 sm:p-6 md:p-8">
        <div className="inline-flex rounded-2xl border border-brand/30 bg-brand/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-brand">
          ePost.pk
        </div>
        <div className="mt-3 text-2xl font-semibold text-[#0F172A]">Complaint Automation</div>
        <div className="mt-1 text-sm text-slate-600">Submit and manage complaint workflows from one ePost.pk dashboard.</div>

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
              <span className="font-medium">Status:</span> {current.status ?? "-"} | <span className="font-medium">Complaint:</span> {current.complaintStatus ?? "-"}
            </div>
            {current.city ? (
              <div className="mt-1">
                <span className="font-medium">City:</span> {current.city}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mt-5 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:gap-3">
          <button
            className="btn-secondary w-full sm:w-auto"
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
            className="btn-primary w-full sm:w-auto disabled:opacity-50"
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
            {polling.jobError ? <span className="text-red-600"> | {polling.jobError}</span> : null}
          </div>
        ) : null}
      </Card>

      <Card className="p-4 sm:p-6 md:p-8">
        <div className="text-lg font-medium text-[#0F172A]">Recent Shipments</div>
        <div className="mt-3 flex flex-col items-start gap-2 rounded-xl border border-[#E5E7EB] bg-[#F8FAF9] px-3 py-2 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <div className="ui-cell-wrap">
            Page <span className="font-semibold text-slate-800">{page}</span> of <span className="font-semibold text-slate-800">{totalPages}</span> · <span className="font-semibold text-slate-800">{shipments.length}</span> shown · <span className="font-semibold text-slate-800">{totalShipments}</span> total
          </div>
          <div className="grid w-full grid-cols-2 gap-1.5 sm:flex sm:w-auto sm:items-center">
            <button className="rounded-lg border border-[#E5E7EB] bg-white px-2.5 py-1.5 disabled:opacity-40" disabled={page <= 1} onClick={() => setPage(1)}>First</button>
            <button className="rounded-lg border border-[#E5E7EB] bg-white px-2.5 py-1.5 disabled:opacity-40" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</button>
            <button className="rounded-lg border border-[#E5E7EB] bg-white px-2.5 py-1.5 disabled:opacity-40" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next</button>
            <button className="rounded-lg border border-[#E5E7EB] bg-white px-2.5 py-1.5 disabled:opacity-40" disabled={page >= totalPages} onClick={() => setPage(totalPages)}>Last</button>
          </div>
        </div>

        <div className="mt-4 grid gap-2.5 md:hidden">
          {shipments.map((s) => (
            <div key={`mobile-${s.id}`} className="rounded-2xl border border-[#E5E7EB] bg-white p-3 shadow-sm">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Tracking</div>
              <div className="ui-cell-mono mt-1 text-slate-800">{s.trackingNumber}</div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <div className="font-semibold uppercase tracking-[0.12em] text-slate-500">Status</div>
                  <div className="ui-cell-wrap mt-1 text-slate-800">{s.status ?? "-"}</div>
                </div>
                <div>
                  <div className="font-semibold uppercase tracking-[0.12em] text-slate-500">Complaint</div>
                  <div className="ui-cell-wrap mt-1 text-slate-700">{s.complaintStatus ?? "-"}</div>
                </div>
              </div>
              <div className="mt-2 text-xs text-slate-500">Updated: <span className="ui-cell-wrap text-slate-700">{new Date(s.updatedAt).toLocaleString()}</span></div>
            </div>
          ))}
          {shipments.length === 0 ? (
            <div className="rounded-2xl border border-[#E5E7EB] bg-white px-3 py-6 text-sm text-slate-600">
              No shipments yet. Run Bulk Tracking first.
            </div>
          ) : null}
        </div>

        <div className="ui-table-scroll mt-4 hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-xl md:block">
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
                  <td className="px-3 py-2 font-mono text-xs text-slate-800">
                    <div className="max-w-[18ch] truncate ui-cell-mono" title={s.trackingNumber}>{s.trackingNumber}</div>
                  </td>
                  <td className="px-3 py-2 text-slate-800">
                    <div className="max-w-[16ch] truncate ui-cell-wrap" title={s.status ?? "-"}>{s.status ?? "-"}</div>
                  </td>
                  <td className="px-3 py-2 text-slate-700">
                    <div className="max-w-[16ch] truncate ui-cell-wrap" title={s.complaintStatus ?? "-"}>{s.complaintStatus ?? "-"}</div>
                  </td>
                  <td className="px-3 py-2 text-slate-700">
                    <div className="max-w-[24ch] truncate ui-cell-wrap" title={new Date(s.updatedAt).toLocaleString()}>{new Date(s.updatedAt).toLocaleString()}</div>
                  </td>
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
        <div className="mt-3 grid grid-cols-2 gap-1.5 text-xs text-slate-600 sm:flex sm:items-center sm:justify-end">
          <button className="rounded-lg border border-[#E5E7EB] bg-white px-2.5 py-1.5 disabled:opacity-40" disabled={page <= 1} onClick={() => setPage(1)}>First</button>
          <button className="rounded-lg border border-[#E5E7EB] bg-white px-2.5 py-1.5 disabled:opacity-40" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</button>
          <button className="rounded-lg border border-[#E5E7EB] bg-white px-2.5 py-1.5 disabled:opacity-40" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next</button>
          <button className="rounded-lg border border-[#E5E7EB] bg-white px-2.5 py-1.5 disabled:opacity-40" disabled={page >= totalPages} onClick={() => setPage(totalPages)}>Last</button>
        </div>
      </Card>
    </div>
  );
}
