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

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="text-xl font-medium text-gray-900">Complaint Automation</div>
        <div className="mt-1 text-sm text-gray-600">Select a shipment and submit a complaint through the automation engine.</div>

        {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="md:col-span-2">
            <label className="text-sm font-medium text-gray-700">Shipment</label>
            <select
              className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              disabled={loading}
            >
              <option value="">Select tracking number…</option>
              {shipments.map((s) => (
                <option key={s.id} value={s.trackingNumber}>
                  {s.trackingNumber} {s.status ? `— ${s.status}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Phone</label>
            <input
              className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm"
              placeholder="03001234567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
        </div>

        {current ? (
          <div className="mt-4 rounded-lg border bg-gray-50 px-4 py-3 text-sm text-gray-700">
            <div>
              <span className="font-medium">Status:</span> {current.status ?? "—"} •{" "}
              <span className="font-medium">Complaint:</span> {current.complaintStatus ?? "—"}
            </div>
            {current.city ? (
              <div className="mt-1">
                <span className="font-medium">City:</span> {current.city}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            className="rounded-lg border bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
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
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-md hover:bg-indigo-700 disabled:opacity-50"
            disabled={!selected || !phone || polling.jobStatus === "PROCESSING" || polling.jobStatus === "QUEUED"}
            onClick={async () => {
              setError(null);
              polling.reset();
              try {
                const res = await api<{ jobId: string }>("/api/tracking/complaint", {
                  method: "POST",
                  body: JSON.stringify({ tracking_number: selected, phone }),
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
          <div className="mt-4 text-sm text-gray-700">
            Job status: <span className="font-medium">{polling.jobStatus}</span>
            {polling.jobError ? <span className="text-red-600"> • {polling.jobError}</span> : null}
          </div>
        ) : null}
      </Card>

      <Card className="p-6">
        <div className="text-lg font-medium text-gray-900">Recent Shipments</div>
        <div className="mt-3 overflow-x-auto rounded-xl border bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500 whitespace-nowrap">Tracking</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500 whitespace-nowrap">Status</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500 whitespace-nowrap">Complaint</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500 whitespace-nowrap">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {shipments.map((s) => (
                <tr key={s.id}>
                  <td className="px-3 py-2 font-mono text-xs text-gray-800 whitespace-nowrap">{s.trackingNumber}</td>
                  <td className="px-3 py-2 text-gray-800 whitespace-nowrap">{s.status ?? "—"}</td>
                  <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{s.complaintStatus ?? "—"}</td>
                  <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{new Date(s.updatedAt).toLocaleString()}</td>
                </tr>
              ))}
              {shipments.length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-sm text-gray-600" colSpan={4}>
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

