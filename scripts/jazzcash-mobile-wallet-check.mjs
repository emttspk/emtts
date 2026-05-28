import crypto from "node:crypto";

function buildHashInput(fields, integritySalt) {
  const hashFields = Object.entries(fields)
    .filter(([key]) => /^pp/i.test(key) && !/^pp_securehash$/i.test(key))
    .sort(([a], [b]) => a.localeCompare(b, "en", { sensitivity: "base" }))
    .map(([, value]) => String(value ?? ""));
  return [integritySalt, ...hashFields].join("&");
}

function hmacSha256Uppercase(message, secret) {
  return crypto.createHmac("sha256", secret).update(message, "utf8").digest("hex").toUpperCase();
}

function formatPkDateTime(date) {
  const shifted = new Date(date.getTime() + 5 * 60 * 60 * 1000);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const d = String(shifted.getUTCDate()).padStart(2, "0");
  const hh = String(shifted.getUTCHours()).padStart(2, "0");
  const mm = String(shifted.getUTCMinutes()).padStart(2, "0");
  const ss = String(shifted.getUTCSeconds()).padStart(2, "0");
  return `${y}${m}${d}${hh}${mm}${ss}`;
}

function toPaisa(rsAmount) {
  return String(Math.round(Number(rsAmount) * 100));
}

const integritySalt = process.env.JAZZCASH_INTEGRITY_SALT || "test_hash_key";
const returnUrl = process.env.JAZZCASH_RETURN_URL || "https://api.epost.pk/api/payments/jazzcash/callback";
const txnDateTime = formatPkDateTime(new Date());
const txnRefNo = `Epo${txnDateTime}`;
const fields = {
  pp_Language: "EN",
  pp_Version: "1.1",
  pp_MerchantID: process.env.JAZZCASH_MERCHANT_ID || "MC_TEST",
  pp_Password: process.env.JAZZCASH_PASSWORD || "TEST_PASSWORD",
  pp_TxnType: process.env.JAZZCASH_TXN_TYPE || "MWALLET",
  pp_TxnRefNo: txnRefNo,
  pp_MobileNumber: "03123456789",
  pp_ReturnURL: returnUrl,
  pp_Amount: toPaisa(999),
  pp_TxnCurrency: "PKR",
  pp_TxnDateTime: txnDateTime,
  pp_BillReference: txnRefNo,
  pp_Description: "Mobile wallet test",
  pp_TxnExpiryDateTime: formatPkDateTime(new Date(Date.now() + 24 * 60 * 60 * 1000)),
  ppmpf_1: "03123456789",
  ppmpf_2: "",
  ppmpf_3: "",
  ppmpf_4: "",
  ppmpf_5: "",
};

const hashInput = buildHashInput(fields, integritySalt);
const secureHash = hmacSha256Uppercase(hashInput, integritySalt);

const statusInquiryFields = {
  pp_TxnRefNo: txnRefNo,
  pp_MerchantID: process.env.JAZZCASH_MERCHANT_ID || "MC_TEST",
  pp_Password: process.env.JAZZCASH_PASSWORD || "TEST_PASSWORD",
};
const statusInquiryHashInput = buildHashInput(statusInquiryFields, integritySalt);
const statusInquirySecureHash = hmacSha256Uppercase(statusInquiryHashInput, integritySalt);

const requiredChecks = [
  ["pp_Version present", fields.pp_Version === "1.1"],
  ["pp_ReturnURL present", Boolean(fields.pp_ReturnURL)],
  ["pp_ReturnURL exact", fields.pp_ReturnURL === "https://api.epost.pk/api/payments/jazzcash/callback"],
  ["TxnRefNo starts with Epo", /^Epo\d{14}$/.test(fields.pp_TxnRefNo)],
  ["pp_MobileNumber present", Boolean(fields.pp_MobileNumber)],
  ["ppmpf_1 present", Boolean(fields.ppmpf_1)],
  ["pp_CNIC excluded", !("pp_CNIC" in fields)],
  ["pp_BankID excluded", !("pp_BankID" in fields)],
  ["pp_ProductID excluded", !("pp_ProductID" in fields)],
  ["amount 999 => 99900", fields.pp_Amount === "99900"],
  ["amount 2500 => 250000", toPaisa(2500) === "250000"],
  ["pp_SecureHash computed", Boolean(secureHash)],
  ["hash input includes pp_ReturnURL", hashInput.includes(fields.pp_ReturnURL)],
  ["hash input includes ppmpf_1", hashInput.includes(fields.ppmpf_1)],
  ["status inquiry hash computed", Boolean(statusInquirySecureHash)],
  ["status inquiry hash includes txnRef", statusInquiryHashInput.includes(txnRefNo)],
];

const failed = requiredChecks.filter(([, pass]) => !pass);

console.log("[JazzCash Mobile Wallet local sanity]");
console.log("endpoint path:", "/ApplicationAPI/API/Payment/DoTransaction");
console.log("fields:", Object.keys(fields));
console.log("hash input:", hashInput);
console.log("secure hash:", secureHash);
console.log("status inquiry fields:", Object.keys(statusInquiryFields));
console.log("status inquiry hash input:", statusInquiryHashInput);
console.log("status inquiry secure hash:", statusInquirySecureHash);
for (const [label, pass] of requiredChecks) {
  console.log(`check: ${label} => ${pass ? "PASS" : "FAIL"}`);
}
if (failed.length > 0) {
  console.error("[JazzCash Mobile Wallet local sanity] FAILED checks:", failed.map(([label]) => label));
  process.exit(1);
}
