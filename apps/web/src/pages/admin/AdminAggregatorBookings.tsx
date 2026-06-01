import { useEffect, useState } from "react";
import { BodyText, PageShell, PageTitle } from "../../components/ui/PageSystem";
import Card from "../../components/Card";
import AggregatorBookingStatusBadge from "../../components/booking/AggregatorBookingStatusBadge";
import AggregatorBookingTimeline from "../../components/booking/AggregatorBookingTimeline";
import AggregatorBookingSummaryCard from "../../components/booking/AggregatorBookingSummaryCard";
import {
  adminApproveAggregatorBooking,
  adminRejectAggregatorBooking,
  adminRequestCorrectionAggregatorBooking,
  getAdminAggregatorBooking,
  listAdminAggregatorBookings,
  type AggregatorBooking,
} from "../../lib/aggregatorBookings";

const MANUAL_GUARDRAILS = [
  "No payment is collected in this phase.",
  "No pickup is created in this phase.",
  "No dispatch is created in this phase.",
  "No external courier or Pakistan Post API is called.",
  "This is not booking confirmation.",
];

export default function AdminAggregatorBookings() {
  const [items, setItems] = useState<AggregatorBooking[]>([]);
  const [selected, setSelected] = useState<AggregatorBooking | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [decisionReasonCode, setDecisionReasonCode] = useState("");
  const [decisionNote, setDecisionNote] = useState("");
  const [manualActionConfirmed, setManualActionConfirmed] = useState(false);

  async function load() {
    const list = await listAdminAggregatorBookings({ page: 1, pageSize: 50, status: statusFilter || undefined });
    setItems(list.items);
    if (selected) {
      const detail = await getAdminAggregatorBooking(selected.id);
      setSelected(detail.booking);
    }
  }

  useEffect(() => {
    let alive = true;
    setLoading(true);
    load()
      .catch((e) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Failed to load admin aggregator queue");
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [statusFilter]);

  async function openDetail(id: string) {
    setError(null);
    try {
      const detail = await getAdminAggregatorBooking(id);
      setSelected(detail.booking);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load booking detail");
    }
  }

  function clearDecisionForm() {
    setDecisionReasonCode("");
    setDecisionNote("");
    setManualActionConfirmed(false);
  }

  function normalizeNote(raw: string) {
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  function validateAction(action: "approve" | "reject" | "correction") {
    const reasonCode = decisionReasonCode.trim();
    const note = decisionNote.trim();

    if ((action === "reject" || action === "correction") && reasonCode.length < 2) {
      return "Reason code is required for reject/correction actions.";
    }
    if (action === "approve") {
      if (!manualActionConfirmed) {
        return "Confirm manual-action guardrails before approving.";
      }
      if (note.length < 10 || !/manual/i.test(note)) {
        return "Approval note must confirm manual-action handling (min 10 chars).";
      }
    }

    return null;
  }

  async function runAction(action: "approve" | "reject" | "correction") {
    if (!selected) return;

    const validationError = validateAction(action);
    if (validationError) {
      setError(validationError);
      return;
    }

    const reasonCode = decisionReasonCode.trim() || undefined;
    const note = normalizeNote(decisionNote);

    setBusy(true);
    setError(null);
    try {
      if (action === "approve") {
        const approveNote = `${note ?? "Approved for manual action."} [MANUAL_ONLY_CONFIRMED]`;
        await adminApproveAggregatorBooking(selected.id, {
          reasonCode,
          note: approveNote,
        });
      } else if (action === "reject") {
        await adminRejectAggregatorBooking(selected.id, {
          reasonCode,
          note: note ?? "Rejected during admin review.",
        });
      } else {
        await adminRequestCorrectionAggregatorBooking(selected.id, {
          reasonCode,
          note: note ?? "Correction requested during admin review.",
        });
      }

      await load();
      const detail = await getAdminAggregatorBooking(selected.id);
      setSelected(detail.booking);
      clearDecisionForm();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Admin action failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell>
      <div className="space-y-4">
        <div>
          <PageTitle>Admin Aggregator Draft Requests</PageTitle>
          <BodyText className="mt-1">
            Phase 2B review queue. This is not booking confirmation.
          </BodyText>
        </div>

        {error ? <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div> : null}

        <Card className="border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold text-slate-900">Review Queue</div>
            <select
              className="rounded border border-slate-300 px-2 py-1 text-xs"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All statuses</option>
              <option value="ADMIN_REVIEW_PENDING">Pending Admin Review</option>
              <option value="CORRECTION_REQUIRED">Correction Required</option>
              <option value="ADMIN_APPROVED">Approved</option>
              <option value="ADMIN_REJECTED">Rejected</option>
            </select>
          </div>

          <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-3 py-2 text-left">Booking</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Sender</th>
                  <th className="px-3 py-2 text-left">Articles</th>
                  <th className="px-3 py-2 text-left">Total</th>
                  <th className="px-3 py-2 text-left">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {!loading && items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-slate-500">No draft requests found.</td>
                  </tr>
                ) : null}
                {items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-3 py-2 font-semibold text-slate-800">{item.bookingNo}</td>
                    <td className="px-3 py-2"><AggregatorBookingStatusBadge status={item.status} /></td>
                    <td className="px-3 py-2 text-slate-700">{item.senderName}</td>
                    <td className="px-3 py-2 text-slate-700">{item.totalArticles}</td>
                    <td className="px-3 py-2 text-slate-700">PKR {new Intl.NumberFormat("en-PK").format(item.totalOfficialPostalCharge)}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => void openDetail(item.id)}
                        className="rounded bg-slate-900 px-2 py-1 text-[11px] font-semibold text-white hover:bg-slate-800"
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {selected ? (
          <>
            <Card className="border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base font-semibold text-slate-900">{selected.bookingNo}</h3>
                <AggregatorBookingStatusBadge status={selected.status} />
              </div>

              <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                This is not booking confirmation. Admin actions are limited to approve, reject, or request correction.
              </div>

              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                {MANUAL_GUARDRAILS.map((line) => (
                  <div key={line}>{line}</div>
                ))}
              </div>

              <div className="mt-4">
                <AggregatorBookingSummaryCard booking={selected} />
              </div>
            </Card>

            <Card className="border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-base font-semibold text-slate-900">Admin Review Decision</h3>

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <label className="text-xs text-slate-700">
                  Reason Code
                  <input
                    className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
                    value={decisionReasonCode}
                    onChange={(e) => setDecisionReasonCode(e.target.value)}
                    placeholder="Required for reject/correction"
                  />
                </label>
                <label className="text-xs text-slate-700">
                  Note
                  <textarea
                    className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
                    rows={3}
                    value={decisionNote}
                    onChange={(e) => setDecisionNote(e.target.value)}
                    placeholder="Approval note must include manual handling confirmation"
                  />
                </label>
              </div>

              <label className="mt-3 flex items-center gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={manualActionConfirmed}
                  onChange={(e) => setManualActionConfirmed(e.target.checked)}
                />
                I confirm this remains Phase 2B manual review only.
              </label>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void runAction("approve")}
                  className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
                >
                  Approve
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void runAction("reject")}
                  className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-500 disabled:opacity-60"
                >
                  Reject
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void runAction("correction")}
                  className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-500 disabled:opacity-60"
                >
                  Needs Correction
                </button>
              </div>
            </Card>

            <Card className="border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-base font-semibold text-slate-900">Status Timeline</h3>
              <div className="mt-3">
                <AggregatorBookingTimeline events={selected.statusEvents ?? []} />
              </div>
            </Card>
          </>
        ) : null}
      </div>
    </PageShell>
  );
}
