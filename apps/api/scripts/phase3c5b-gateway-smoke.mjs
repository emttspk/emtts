import assert from "node:assert/strict";
import {
  adminAggregatorGatewayMarkFailedSchema,
  adminAggregatorGatewayReconcileSchema,
  adminAggregatorGatewayRefundNoteSchema,
  aggregatorGatewayJazzcashCallbackSchema,
  aggregatorGatewayJazzcashStartSchema,
  aggregatorGatewayStatusQuerySchema,
} from "../src/utils/aggregatorBookingValidation.ts";

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

ok("gateway start valid", () => {
  const parsed = aggregatorGatewayJazzcashStartSchema.parse({
    amount: 1590,
    currency: "PKR",
    mobileNumber: "03001234567",
  });
  assert.equal(parsed.currency, "PKR");
});

bad("gateway start invalid amount", () => {
  aggregatorGatewayJazzcashStartSchema.parse({
    amount: 0,
    currency: "PKR",
    mobileNumber: "03001234567",
  });
});

ok("gateway status query default", () => {
  const parsed = aggregatorGatewayStatusQuerySchema.parse({});
  assert.equal(parsed.withInquiry, false);
});

ok("gateway status query with true", () => {
  const parsed = aggregatorGatewayStatusQuerySchema.parse({ withInquiry: "true" });
  assert.equal(parsed.withInquiry, true);
});

ok("gateway callback valid by pp ref", () => {
  const parsed = aggregatorGatewayJazzcashCallbackSchema.parse({
    pp_TxnRefNo: "AGG-JC-12345",
    pp_ResponseCode: "000",
    pp_SecureHash: "hash",
  });
  assert.equal(parsed.pp_TxnRefNo, "AGG-JC-12345");
});

ok("gateway callback valid by orderRef", () => {
  const parsed = aggregatorGatewayJazzcashCallbackSchema.parse({
    orderRef: "AGG-JC-67890",
    pp_Status: "PAID",
  });
  assert.equal(parsed.orderRef, "AGG-JC-67890");
});

bad("gateway callback missing reference", () => {
  aggregatorGatewayJazzcashCallbackSchema.parse({
    pp_ResponseCode: "000",
  });
});

ok("admin reconcile valid", () => {
  const parsed = adminAggregatorGatewayReconcileSchema.parse({
    orderRef: "AGG-JC-12345",
    status: "AGGREGATOR_GATEWAY_SUCCESS",
    reconciliationNote: "Callback reviewed and amount matched.",
  });
  assert.equal(parsed.status, "AGGREGATOR_GATEWAY_SUCCESS");
});

bad("admin reconcile invalid status", () => {
  adminAggregatorGatewayReconcileSchema.parse({
    orderRef: "AGG-JC-12345",
    status: "SUCCESS",
    reconciliationNote: "ok note",
  });
});

ok("admin mark failed valid", () => {
  const parsed = adminAggregatorGatewayMarkFailedSchema.parse({
    orderRef: "AGG-JC-12345",
    reason: "Gateway response mismatch",
  });
  assert.equal(parsed.reason, "Gateway response mismatch");
});

ok("admin refund note valid", () => {
  const parsed = adminAggregatorGatewayRefundNoteSchema.parse({
    orderRef: "AGG-JC-12345",
    note: "Refund initiated after duplicate debit report.",
  });
  assert.equal(parsed.orderRef, "AGG-JC-12345");
});

bad("admin refund note missing", () => {
  adminAggregatorGatewayRefundNoteSchema.parse({
    orderRef: "AGG-JC-12345",
    note: "",
  });
});

console.log("SMOKE_SCHEMA_ALL_DONE");
