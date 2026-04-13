import { interpretTrackingCycles } from "./apps/api/src/services/trackingInterpreter.ts";

function event(date, time, description, location = "-") {
  return { date, time, description, location };
}

const cases = [
  {
    name: "Delivered Cycle 1",
    trackingNumber: "XYZ123456",
    events: [
      event("2026-01-01", "09:00", "Booked at Lahore GPO", "Lahore"),
      event("2026-01-01", "12:00", "Received at DMO Lahore", "Lahore"),
      event("2026-01-02", "08:00", "Dispatch from DMO Lahore to DMO Karachi", "Lahore"),
      event("2026-01-03", "08:00", "Received at delivery office Karachi", "Karachi"),
      event("2026-01-03", "11:00", "Sent out for delivery", "Karachi"),
      event("2026-01-03", "16:00", "Delivered to addressee", "Karachi"),
    ],
    expected: { final_status: "DELIVERED", cycle_detected: "Cycle 1", cycle_type: "DELIVERY" },
  },
  {
    name: "Returned Cycle 2",
    trackingNumber: "XYZ654321",
    events: [
      event("2026-01-01", "09:00", "Booked at Lahore GPO", "Lahore"),
      event("2026-01-01", "12:00", "Received at DMO Lahore", "Lahore"),
      event("2026-01-02", "08:00", "Dispatch from DMO Lahore to DMO Karachi", "Lahore"),
      event("2026-01-03", "08:00", "Received at delivery office Karachi", "Karachi"),
      event("2026-01-03", "11:00", "Sent out for delivery", "Karachi"),
      event("2026-01-03", "17:00", "Undelivered - addressee not found", "Karachi"),
      event("2026-01-04", "09:00", "Return dispatch to Lahore", "Karachi"),
      event("2026-01-05", "10:00", "Received at DMO Lahore", "Lahore"),
      event("2026-01-05", "15:00", "Delivered at booking office", "Lahore"),
    ],
    expected: { final_status: "RETURNED", cycle_detected: "Cycle 2", cycle_type: "RETURN" },
  },
  {
    name: "COD Delivered With MOS Cycle 3",
    trackingNumber: "VPL111222",
    events: [
      event("2026-01-01", "09:00", "Booked at Lahore GPO", "Lahore"),
      event("2026-01-01", "12:00", "Received at DMO Lahore", "Lahore"),
      event("2026-01-02", "08:00", "Dispatch from DMO Lahore to DMO Karachi", "Lahore"),
      event("2026-01-03", "08:00", "Received at delivery office Karachi", "Karachi"),
      event("2026-01-03", "11:00", "Sent out for delivery", "Karachi"),
      event("2026-01-03", "16:00", "Delivered to addressee", "Karachi"),
      event("2026-01-03", "18:00", "Money Order Issued MOS24070001", "Karachi"),
      event("2026-01-04", "09:00", "MOS Booked", "Karachi"),
      event("2026-01-05", "10:00", "MOS Dispatch to Lahore", "Karachi"),
      event("2026-01-06", "12:00", "MOS Delivered at booking office", "Lahore"),
    ],
    expected: { final_status: "DELIVERED WITH PAYMENT", cycle_detected: "Cycle 3", mos_status: "COMPLETED" },
  },
  {
    name: "COD Delivered Without MOS",
    trackingNumber: "VPL999888",
    events: [
      event("2026-01-01", "09:00", "Booked at Lahore GPO", "Lahore"),
      event("2026-01-01", "12:00", "Received at DMO Lahore", "Lahore"),
      event("2026-01-02", "08:00", "Dispatch from DMO Lahore to DMO Karachi", "Lahore"),
      event("2026-01-03", "08:00", "Received at delivery office Karachi", "Karachi"),
      event("2026-01-03", "11:00", "Sent out for delivery", "Karachi"),
      event("2026-01-03", "16:00", "Delivered to addressee", "Karachi"),
    ],
    expected: { final_status: "PENDING", cycle_detected: "Cycle 3", mos_status: "MISSING" },
  },
  {
    name: "Stuck At Delivery City",
    trackingNumber: "XYZSTUCK01",
    events: [
      event("2026-01-01", "09:00", "Booked at Lahore GPO", "Lahore"),
      event("2026-01-01", "12:00", "Received at DMO Lahore", "Lahore"),
      event("2026-01-02", "08:00", "Dispatch from DMO Lahore to DMO Karachi", "Lahore"),
      event("2026-01-03", "08:00", "Received at delivery office Karachi", "Karachi"),
    ],
    expected: { final_status: "PENDING", cycle_detected: "Cycle 1", cycle_status: "IN_PROGRESS" },
  },
  {
    name: "Reforward Latest Cycle Only",
    trackingNumber: "XYZREFWD1",
    events: [
      event("2026-01-01", "09:00", "Booked at Lahore GPO", "Lahore"),
      event("2026-01-01", "12:00", "Received at DMO Lahore", "Lahore"),
      event("2026-01-02", "08:00", "Dispatch from DMO Lahore to DMO Karachi", "Lahore"),
      event("2026-01-03", "11:00", "Sent out for delivery", "Karachi"),
      event("2026-01-03", "17:00", "Undelivered - refused", "Karachi"),
      event("2026-01-04", "09:00", "Return dispatch to Lahore", "Karachi"),
      event("2026-01-05", "10:00", "Received at DMO Lahore", "Lahore"),
      event("2026-01-06", "09:00", "Dispatch from DMO Lahore to DMO Karachi", "Lahore"),
      event("2026-01-07", "08:00", "Received at delivery office Karachi", "Karachi"),
      event("2026-01-07", "11:00", "Sent out for delivery", "Karachi"),
      event("2026-01-07", "16:00", "Delivered to addressee", "Karachi"),
    ],
    expected: { final_status: "DELIVERED", cycle_detected: "Cycle 1" },
  },
];

const report = cases.map((test) => {
  const actual = interpretTrackingCycles({
    trackingNumber: test.trackingNumber,
    events: test.events,
  });

  const checks = Object.entries(test.expected).map(([key, expectedValue]) => ({
    key,
    expected: expectedValue,
    actual: actual[key],
    ok: actual[key] === expectedValue,
  }));

  return {
    name: test.name,
    pass: checks.every((check) => check.ok),
    checks,
    actual,
  };
});

console.log(JSON.stringify(report, null, 2));
