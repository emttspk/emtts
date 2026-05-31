import assert from "node:assert/strict";
import {
  aggregatorManualPaymentSubmitSchema,
  adminAggregatorManualPaymentVerifySchema,
  adminAggregatorManualPaymentRejectSchema,
  adminAggregatorManualPaymentCancelSchema,
} from "../src/utils/aggregatorBookingValidation.ts";

const flags = {
  manualOnly: true,
  noLiveGateway: true,
  noSubscriptionMutation: true,
  noInvoiceMutation: true,
  noPickupExecution: true,
  noDispatchExecution: true,
  noPakistanPostBookingApi: true,
  noFinalBookingConfirmation: true,
};

function ok(name, fn) {
  try {
    fn();
  } catch (error) {
    throw new Error(`Expected pass for ${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function bad(name, fn) {
  let failed = false;
  try {
    fn();
  } catch {
    failed = true;
  }
  assert.equal(failed, true, `Expected failure for ${name}`);
}

ok("submit bank transfer valid", () => {
  const parsed = aggregatorManualPaymentSubmitSchema.parse({
    method: "BANK_TRANSFER",
    amount: 1200,
    currency: "PKR",
    reference: "TXN-123",
    payerName: "Nazim",
    proofNote: "Payment slip shared.",
    manualFlags: flags,
  });
  assert.equal(parsed.method, "BANK_TRANSFER");
});

ok("submit office cash without reference", () => {
  const parsed = aggregatorManualPaymentSubmitSchema.parse({
    method: "OFFICE_CASH",
    amount: 200,
    payerName: "Nazim",
    proofNote: "Cash deposited at office counter.",
    manualFlags: flags,
  });
  assert.equal(parsed.currency, "PKR");
});

bad("submit missing reference for transfer", () => {
  aggregatorManualPaymentSubmitSchema.parse({
    method: "JAZZCASH_WALLET_TRANSFER",
    amount: 300,
    payerName: "Nazim",
    proofNote: "Wallet transfer done.",
    manualFlags: flags,
  });
});

bad("submit invalid method", () => {
  aggregatorManualPaymentSubmitSchema.parse({
    method: "CARD",
    amount: 100,
    reference: "ABC",
    payerName: "Nazim",
    proofNote: "Invalid method",
    manualFlags: flags,
  });
});

bad("submit negative amount", () => {
  aggregatorManualPaymentSubmitSchema.parse({
    method: "BANK_TRANSFER",
    amount: -10,
    reference: "ABC",
    payerName: "Nazim",
    proofNote: "Invalid amount",
    manualFlags: flags,
  });
});

bad("submit missing payer name", () => {
  aggregatorManualPaymentSubmitSchema.parse({
    method: "BANK_TRANSFER",
    amount: 100,
    reference: "ABC",
    payerName: "",
    proofNote: "Slip",
    manualFlags: flags,
  });
});

bad("submit unknown field rejected", () => {
  aggregatorManualPaymentSubmitSchema.parse({
    method: "BANK_TRANSFER",
    amount: 100,
    reference: "ABC",
    payerName: "Nazim",
    proofNote: "Slip",
    manualFlags: flags,
    extraField: true,
  });
});

bad("submit false guardrail rejected", () => {
  aggregatorManualPaymentSubmitSchema.parse({
    method: "BANK_TRANSFER",
    amount: 100,
    reference: "ABC",
    payerName: "Nazim",
    proofNote: "Slip",
    manualFlags: { ...flags, noLiveGateway: false },
  });
});

ok("verify valid", () => {
  const parsed = adminAggregatorManualPaymentVerifySchema.parse({
    verificationNote: "Manual evidence verified by operations admin.",
    verifiedReference: "VR-1",
    manualFlags: flags,
  });
  assert.equal(parsed.verifiedReference, "VR-1");
});

bad("verify missing note", () => {
  adminAggregatorManualPaymentVerifySchema.parse({
    verificationNote: "",
    manualFlags: flags,
  });
});

bad("verify unknown field rejected", () => {
  adminAggregatorManualPaymentVerifySchema.parse({
    verificationNote: "note ok",
    manualFlags: flags,
    random: "x",
  });
});

ok("reject valid", () => {
  const parsed = adminAggregatorManualPaymentRejectSchema.parse({
    rejectionReason: "Reference mismatch",
    rejectionNote: "Please resubmit with clear proof.",
    manualFlags: flags,
  });
  assert.equal(parsed.rejectionReason, "Reference mismatch");
});

bad("reject missing reason", () => {
  adminAggregatorManualPaymentRejectSchema.parse({
    rejectionReason: "",
    manualFlags: flags,
  });
});

bad("reject guardrail false", () => {
  adminAggregatorManualPaymentRejectSchema.parse({
    rejectionReason: "Mismatch",
    manualFlags: { ...flags, noPakistanPostBookingApi: false },
  });
});

ok("cancel valid", () => {
  const parsed = adminAggregatorManualPaymentCancelSchema.parse({
    cancellationReason: "Customer asked to cancel",
    cancellationNote: "Will pay later.",
    manualFlags: flags,
  });
  assert.equal(parsed.cancellationReason, "Customer asked to cancel");
});

bad("cancel missing reason", () => {
  adminAggregatorManualPaymentCancelSchema.parse({
    cancellationReason: "",
    manualFlags: flags,
  });
});

bad("cancel unknown field rejected", () => {
  adminAggregatorManualPaymentCancelSchema.parse({
    cancellationReason: "Requested",
    manualFlags: flags,
    junk: 1,
  });
});

console.log("SMOKE_SCHEMA_ALL_DONE");
