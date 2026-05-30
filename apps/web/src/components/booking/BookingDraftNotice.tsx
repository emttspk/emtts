import Card from "../Card";

export default function BookingDraftNotice() {
  return (
    <Card className="border-sky-200 bg-sky-50 p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-sky-900">Phase 2A Request Preview Notice</h3>
      <div className="mt-2 space-y-1 text-xs text-sky-900">
        <p>This is only a booking request preview. It is not booking confirmation.</p>
        <p>No payment is collected in this step.</p>
        <p>No pickup or dispatch is created in this step.</p>
      </div>
    </Card>
  );
}
