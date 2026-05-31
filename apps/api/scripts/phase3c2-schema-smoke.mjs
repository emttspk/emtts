/**
 * Phase 3C-2 schema smoke.  Run with:
 *   node --input-type=module scripts/phase3c2-schema-smoke.mjs
 * or:
 *   npx tsx scripts/phase3c2-schema-smoke.mjs
 */
import { z } from "zod";

const manualFlagsSchema = z.object({
  manualReceivingOnly: z.literal(true),
  noFinalDispatch: z.literal(true),
  noLiveCarrierApi: z.literal(true),
  noPakistanPostBookingApi: z.literal(true),
  noPickupExecution: z.literal(true),
  noDispatchExecution: z.literal(true),
  noFinalBookingConfirmation: z.literal(true),
});

const markReceivedSchema = z.object({
  receivedArticleCount: z.coerce.number().int().min(0),
  receivedBundleWeightGrams: z.coerce.number().int().positive().optional(),
  conditionNote: z.string().trim().min(10).max(2000),
  manualFlags: manualFlagsSchema,
}).strict();

const verifyManifestSchema = z.object({
  receivedArticleCount: z.coerce.number().int().min(0),
  manualFlags: manualFlagsSchema,
}).strict();

const mismatchSchema = z.object({
  receivedArticleCount: z.coerce.number().int().min(0),
  mismatchReason: z.string().trim().min(2).max(120),
  adminNote: z.string().trim().min(5).max(2000),
  manualFlags: manualFlagsSchema,
}).strict();

const exceptionNoteSchema = z.object({
  exceptionNote: z.string().trim().min(3).max(2000),
  manualFlags: manualFlagsSchema,
}).strict();

const resolveExceptionSchema = z.object({
  resolutionType: z.string().trim().min(2).max(120),
  resolutionNote: z.string().trim().min(5).max(2000),
  manualFlags: manualFlagsSchema,
}).strict();

const ok = {
  manualReceivingOnly: true,
  noFinalDispatch: true,
  noLiveCarrierApi: true,
  noPakistanPostBookingApi: true,
  noPickupExecution: true,
  noDispatchExecution: true,
  noFinalBookingConfirmation: true,
};

let pass = 0, fail = 0;
function assert(label, got, expected = true) {
  if (got === expected) {
    console.log("PASS", label);
    pass++;
  } else {
    console.log("FAIL", label, { got, expected });
    fail++;
  }
}

// 1. Valid mark-received
assert("MARK_RECEIVED_VALID", markReceivedSchema.safeParse({ receivedArticleCount: 5, conditionNote: "Bundle outer seal intact at hub.", manualFlags: ok }).success);

// 2. conditionNote too short
assert("MARK_RECEIVED_REJECTS_SHORT_NOTE", markReceivedSchema.safeParse({ receivedArticleCount: 5, conditionNote: "short", manualFlags: ok }).success, false);

// 3. noFinalDispatch must be true
assert("MARK_RECEIVED_REJECTS_DISPATCH_FALSE", markReceivedSchema.safeParse({ receivedArticleCount: 5, conditionNote: "Bundle outer seal intact at hub.", manualFlags: { ...ok, noFinalDispatch: false } }).success, false);

// 4. manualReceivingOnly must be true
assert("MARK_RECEIVED_REJECTS_NON_MANUAL", markReceivedSchema.safeParse({ receivedArticleCount: 5, conditionNote: "Bundle outer seal intact at hub.", manualFlags: { ...ok, manualReceivingOnly: false } }).success, false);

// 5. receivedArticleCount cannot be negative
assert("MARK_RECEIVED_REJECTS_NEGATIVE_COUNT", markReceivedSchema.safeParse({ receivedArticleCount: -1, conditionNote: "Bundle outer seal intact at hub.", manualFlags: ok }).success, false);

// 6. verifyManifest - valid
assert("VERIFY_MANIFEST_VALID", verifyManifestSchema.safeParse({ receivedArticleCount: 10, manualFlags: ok }).success);

// 7. mismatch - empty reason and note rejected
assert("MISMATCH_REJECTS_EMPTY_REASON_NOTE", mismatchSchema.safeParse({ receivedArticleCount: 8, mismatchReason: "", adminNote: "", manualFlags: ok }).success, false);

// 8. mismatch - valid
assert("MISMATCH_VALID", mismatchSchema.safeParse({ receivedArticleCount: 8, mismatchReason: "COUNT_DIFF", adminNote: "Two articles missing from pack.", manualFlags: ok }).success);

// 9. exceptionNote too short
assert("EXCEPTION_NOTE_REJECTS_SHORT", exceptionNoteSchema.safeParse({ exceptionNote: "hi", manualFlags: ok }).success, false);

// 10. exceptionNote valid
assert("EXCEPTION_NOTE_VALID", exceptionNoteSchema.safeParse({ exceptionNote: "Contact customer about missing articles.", manualFlags: ok }).success);

// 11. resolve - empty fields rejected
assert("RESOLUTION_REJECTS_EMPTY", resolveExceptionSchema.safeParse({ resolutionType: "", resolutionNote: "", manualFlags: ok }).success, false);

// 12. resolve - valid
assert("RESOLUTION_VALID", resolveExceptionSchema.safeParse({ resolutionType: "CONTINUE_RECEIVED_COUNT", resolutionNote: "Proceeding with received count on file.", manualFlags: ok }).success);

// 13. No live Pakistan Post API flag bypass
assert("REJECTS_PP_API_MISSING", markReceivedSchema.safeParse({ receivedArticleCount: 5, conditionNote: "Bundle outer seal intact at hub.", manualFlags: { ...ok, noPakistanPostBookingApi: false } }).success, false);

// 14. No live carrier API flag bypass
assert("REJECTS_CARRIER_API_MISSING", markReceivedSchema.safeParse({ receivedArticleCount: 5, conditionNote: "Bundle outer seal intact at hub.", manualFlags: { ...ok, noLiveCarrierApi: false } }).success, false);

// 15. Strict mode rejects unknown extra fields
assert("STRICT_REJECTS_EXTRA_FIELDS", markReceivedSchema.safeParse({ receivedArticleCount: 5, conditionNote: "Bundle outer seal intact at hub.", manualFlags: ok, unknownField: "x" }).success, false);

console.log(`\nPhase 3C-2 schema smoke: ${pass} PASS, ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
