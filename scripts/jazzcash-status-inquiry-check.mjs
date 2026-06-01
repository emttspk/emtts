import crypto from "node:crypto";

function buildHashInput(fields, integritySalt) {
  const hashFields = Object.entries(fields)
    .filter(([key, value]) => /^pp/i.test(key) && !/^pp_securehash$/i.test(key) && String(value ?? "") !== "")
    .sort(([leftKey], [rightKey]) => (leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0))
    .map(([, value]) => String(value ?? ""));
  return hashFields.length > 0 ? `${integritySalt}&${hashFields.join("&")}` : integritySalt;
}

function hmacSha256Uppercase(message, secret) {
  return crypto.createHmac("sha256", secret).update(message, "utf8").digest("hex").toUpperCase();
}

const integritySalt = process.env.JAZZCASH_INTEGRITY_SALT || "test_hash_key";
const sandboxEndpoint = process.env.JAZZCASH_STATUS_INQUIRY_ENDPOINT_SANDBOX
  || "https://sandbox.jazzcash.com.pk/ApplicationAPI/API/PaymentInquiry/Inquire";
const liveEndpoint = process.env.JAZZCASH_STATUS_INQUIRY_ENDPOINT_LIVE
  || "https://payments.jazzcash.com.pk/ApplicationAPI/API/PaymentInquiry/Inquire";
const txnRefNo = "T20260529000000";

const fields = {
  pp_TxnRefNo: txnRefNo,
  pp_MerchantID: process.env.JAZZCASH_MERCHANT_ID || "MC_TEST",
  pp_Password: process.env.JAZZCASH_PASSWORD || "TEST_PASSWORD",
};

const hashInput = buildHashInput(fields, integritySalt);
const secureHash = hmacSha256Uppercase(hashInput, integritySalt);

const requiredChecks = [
  ["sandbox endpoint exact", sandboxEndpoint === "https://sandbox.jazzcash.com.pk/ApplicationAPI/API/PaymentInquiry/Inquire"],
  ["live endpoint exact", liveEndpoint === "https://payments.jazzcash.com.pk/ApplicationAPI/API/PaymentInquiry/Inquire"],
  ["TxnRefNo starts with T", /^T\d{14}$/.test(txnRefNo)],
  ["pp_MerchantID present", Boolean(fields.pp_MerchantID)],
  ["pp_Password present", Boolean(fields.pp_Password)],
  ["status inquiry secure hash computed", Boolean(secureHash)],
  ["hash input has no pp_SecureHash value", !hashInput.includes("pp_SecureHash")],
  ["hash input includes txnRefNo", hashInput.includes(txnRefNo)],
];

const failed = requiredChecks.filter(([, pass]) => !pass);

console.log("[JazzCash Status Inquiry local sanity]");
console.log("sandbox endpoint:", sandboxEndpoint);
console.log("live endpoint:", liveEndpoint);
console.log("fields:", Object.keys(fields));
console.log("hash input:", hashInput);
console.log("secure hash:", secureHash);
for (const [label, pass] of requiredChecks) {
  console.log(`check: ${label} => ${pass ? "PASS" : "FAIL"}`);
}

if (failed.length > 0) {
  console.error("[JazzCash Status Inquiry local sanity] FAILED checks:", failed.map(([label]) => label));
  process.exit(1);
}
