import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import Card from "../components/Card";
import SupportAttachmentUploader from "../components/SupportAttachmentUploader";
import {
  downloadSupportAttachment,
  getMySupportTicket,
  replyToMySupportTicket,
  uploadSupportAttachments,
  type SupportTicket,
} from "../lib/support";

export default function SupportTicketDetailPage() {
  const params = useParams<{ ticketId: string }>();
  const ticketId = String(params.ticketId ?? "").trim();
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const isClosed = String(ticket?.status ?? "").toUpperCase() === "CLOSED";

  async function load() {
    if (!ticketId) return;
    const response = await getMySupportTicket(ticketId);
    setTicket(response.ticket);
  }

  useEffect(() => {
    let alive = true;
    setLoading(true);
    load()
      .catch((e) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Failed to load ticket");
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [ticketId]);

  if (!ticketId) {
    return <Card className="p-6">Invalid ticket id.</Card>;
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        {loading ? <p className="text-sm text-slate-500">Loading ticket...</p> : null}
        {ticket ? (
          <>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">Support Ticket</div>
            <h1 className="mt-1 text-2xl font-semibold text-slate-900">{ticket.subject}</h1>
            <p className="mt-1 text-sm text-slate-600">{ticket.ticketNumber} · {ticket.status} · {ticket.priority}</p>

            <div className="mt-5 space-y-3">
              {ticket.messages?.map((message) => (
                <article key={message.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{message.authorRole}</p>
                    <p className="text-xs text-slate-500">{new Date(message.createdAt).toLocaleString()}</p>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{message.message}</p>
                  {message.attachments && message.attachments.length > 0 ? (
                    <div className="mt-3 space-y-2">
                      {message.attachments.map((attachment) => (
                        <div key={attachment.id} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-sm">
                          <span className="truncate text-slate-700">{attachment.originalName}</span>
                          <button
                            type="button"
                            className="text-brand hover:underline"
                            onClick={() => void downloadSupportAttachment(ticket.id, attachment.id, attachment.originalName)}
                          >
                            Download
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>

            {isClosed ? (
              <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                This ticket is closed. Please create a new support ticket for any further issue.
              </div>
            ) : (
              <>
                <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
                  <label className="text-sm font-medium text-slate-700">Reply</label>
                  <textarea
                    className="field-input mt-1 min-h-[120px]"
                    value={reply}
                    disabled={sending}
                    onChange={(event) => setReply(event.target.value)}
                  />
                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      className="btn-primary disabled:opacity-50"
                      disabled={sending || reply.trim().length < 1}
                      onClick={async () => {
                        setSending(true);
                        setError(null);
                        try {
                          await replyToMySupportTicket(ticket.id, reply.trim());
                          setReply("");
                          await load();
                        } catch (e) {
                          setError(e instanceof Error ? e.message : "Failed to post reply");
                        } finally {
                          setSending(false);
                        }
                      }}
                    >
                      {sending ? "Sending..." : "Send Reply"}
                    </button>
                  </div>
                </div>

                <div className="mt-5">
                  <SupportAttachmentUploader
                    disabled={sending}
                    onUpload={async (files, message) => {
                      await uploadSupportAttachments(ticket.id, files, message);
                      await load();
                    }}
                  />
                </div>
              </>
            )}
          </>
        ) : null}
      </Card>
    </div>
  );
}
