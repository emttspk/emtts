import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Card from "../components/Card";
import CreateSupportTicketModal from "../components/CreateSupportTicketModal";
import SEO from "../components/SEO";
import { trackSupportTicketCreated } from "../lib/analytics";
import { createSupportTicket, listMySupportTickets, uploadSupportAttachments, type SupportTicket } from "../lib/support";

export default function SupportTicketsPage() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [openCreate, setOpenCreate] = useState(false);

  async function load() {
    const response = await listMySupportTickets({ page: 1, pageSize: 50 });
    setTickets(response.tickets);
  }

  useEffect(() => {
    let alive = true;
    setLoading(true);
    load()
      .catch((e) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Failed to load support tickets");
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      <SEO
        title="Support | ePost.pk"
        description="Manage support requests for Pakistan Post tracking, bulk tracking, shipping labels, money orders, complaints, and ecommerce shipping workflows."
        canonicalPath="/support"
      />
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">Support</div>
            <h1 className="mt-1 text-2xl font-semibold text-slate-900">My Support Tickets</h1>
            <p className="mt-1 text-sm text-slate-600">Create and track your support requests.</p>
          </div>
          <button type="button" className="btn-primary" onClick={() => setOpenCreate(true)}>New Ticket</button>
        </div>

        {error ? <p className="mt-4 text-sm text-rose-600">{error}</p> : null}
  {warning ? <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{warning}</p> : null}

        <div className="ui-table-scroll mt-5 rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Ticket</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Subject</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Category</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Priority</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Status</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {!loading && tickets.length === 0 ? (
                <tr>
                  <td className="px-3 py-8 text-sm text-slate-500" colSpan={6}>No support tickets yet.</td>
                </tr>
              ) : null}

              {tickets.map((ticket) => (
                <tr key={ticket.id}>
                  <td className="px-3 py-2 text-xs font-semibold text-slate-800">
                    <Link className="text-brand hover:underline" to={`/support/${ticket.id}`}>{ticket.ticketNumber}</Link>
                  </td>
                  <td className="px-3 py-2 text-slate-800">{ticket.subject}</td>
                  <td className="px-3 py-2 text-slate-600">{ticket.category}</td>
                  <td className="px-3 py-2 text-slate-600">{ticket.priority}</td>
                  <td className="px-3 py-2 text-slate-700">{ticket.status}</td>
                  <td className="px-3 py-2 text-slate-500">{new Date(ticket.updatedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <CreateSupportTicketModal
        open={openCreate}
        onClose={() => setOpenCreate(false)}
        onCreate={async (payload, options) => {
          setWarning(null);
          const created = await createSupportTicket(payload);
          trackSupportTicketCreated();
          let attachmentWarning: string | undefined;
          if (options.files.length > 0) {
            try {
              await uploadSupportAttachments(created.ticket.id, options.files, options.attachmentMessage);
            } catch (e) {
              attachmentWarning = `Ticket ${created.ticket.ticketNumber} was created, but attachment upload failed: ${e instanceof Error ? e.message : "Upload failed"}`;
              setWarning(attachmentWarning);
            }
          }
          await load();
          return attachmentWarning ? { warning: attachmentWarning } : undefined;
        }}
      />
    </div>
  );
}
