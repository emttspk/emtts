import type { AggregatorBookingTimelineEvent } from "../../lib/aggregatorBookings";
import AggregatorBookingStatusBadge from "./AggregatorBookingStatusBadge";

type Props = {
  events: AggregatorBookingTimelineEvent[];
};

export default function AggregatorBookingTimeline({ events }: Props) {
  if (!events.length) {
    return <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">No status events yet.</div>;
  }

  return (
    <div className="space-y-2">
      {events.map((event) => (
        <div key={event.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {event.fromStatus ? <AggregatorBookingStatusBadge status={event.fromStatus} /> : <span className="text-xs text-slate-500">START</span>}
              <span className="text-xs text-slate-400">to</span>
              <AggregatorBookingStatusBadge status={event.toStatus} />
            </div>
            <div className="text-xs text-slate-500">{new Date(event.createdAt).toLocaleString()}</div>
          </div>
          <div className="mt-2 text-xs text-slate-600">
            <span className="font-semibold">Actor:</span> {event.actorType}
            {event.reasonCode ? <span className="ml-3"><span className="font-semibold">Reason:</span> {event.reasonCode}</span> : null}
          </div>
          {event.note ? <div className="mt-1 text-xs text-slate-700">{event.note}</div> : null}
        </div>
      ))}
    </div>
  );
}
