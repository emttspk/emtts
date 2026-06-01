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

function parsePkDateTime(value) {
  const raw = String(value ?? "");
  const year = Number(raw.slice(0, 4));
  const month = Number(raw.slice(4, 6));
  const day = Number(raw.slice(6, 8));
  const hour = Number(raw.slice(8, 10));
  const minute = Number(raw.slice(10, 12));
  const second = Number(raw.slice(12, 14));
  // Reverse the +5h display shift from formatPkDateTime.
  return new Date(Date.UTC(year, month - 1, day, hour - 5, minute, second));
}

function toPaisa(rsAmount) {
  return String(Math.round(Number(rsAmount) * 100));
}

const integritySalt = process.env.JAZZCASH_INTEGRITY_SALT || "test_hash_key";
const returnUrl = process.env.JAZZCASH_RETURN_URL || "https://api.epost.pk/api/payments/jazzcash/callback";
const txnDateTime = formatPkDateTime(new Date());
const txnRefNo = `T${txnDateTime}`;
const fields = {
  pp_Version: "1.1",
  pp_TxnType: process.env.JAZZCASH_TXN_TYPE || "MWALLET",
  pp_Language: "EN",
  pp_MerchantID: process.env.JAZZCASH_MERCHANT_ID || "MC_TEST",
  pp_Password: process.env.JAZZCASH_PASSWORD || "TEST_PASSWORD",
  pp_TxnRefNo: txnRefNo,
  pp_Amount: toPaisa(999),
  pp_TxnCurrency: "PKR",
  pp_TxnDateTime: txnDateTime,
  pp_BillReference: txnRefNo,
  pp_Description: "Mobile wallet support payload check",
  pp_TxnExpiryDateTime: formatPkDateTime(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)),
  pp_ReturnURL: returnUrl,
  ppmpf_1: "03123456789",
};

const outboundFieldNames = [
  "pp_Version",
  "pp_TxnType",
  "pp_Language",
  "pp_MerchantID",
  "pp_Password",
  "pp_TxnRefNo",
  "pp_Amount",
  "pp_TxnCurrency",
  "pp_TxnDateTime",
  "pp_BillReference",
  "pp_Description",
  "pp_TxnExpiryDateTime",
  "pp_ReturnURL",
  "ppmpf_1",
];

const hashInput = buildHashInput(fields, integritySalt);
const secureHash = hmacSha256Uppercase(hashInput, integritySalt);
const hashInputValuesOnly = hashInput.startsWith(`${integritySalt}&`) ? hashInput.slice(integritySalt.length + 1) : "";
const hashInputParts = hashInputValuesOnly ? hashInputValuesOnly.split("&") : [];
const sortedOutboundKeys = [...outboundFieldNames].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
const expectedHashParts = sortedOutboundKeys.map((key) => String(fields[key] ?? "")).filter((value) => value !== "");

const txnDate = parsePkDateTime(fields.pp_TxnDateTime);
const txnExpiry = parsePkDateTime(fields.pp_TxnExpiryDateTime);
const expiryDeltaHours = Math.round((txnExpiry.getTime() - txnDate.getTime()) / (60 * 60 * 1000));

const statusInquiryFields = {
  pp_TxnRefNo: txnRefNo,
  pp_MerchantID: process.env.JAZZCASH_MERCHANT_ID || "MC_TEST",
  pp_Password: process.env.JAZZCASH_PASSWORD || "TEST_PASSWORD",
};
const statusInquiryHashInput = buildHashInput(statusInquiryFields, integritySalt);
const statusInquirySecureHash = hmacSha256Uppercase(statusInquiryHashInput, integritySalt);

const forbiddenFields = [
  "pp_CNIC",
  "pp_BankID",
  "pp_ProductID",
  "pp_SubMerchantID",
  "pp_DiscountedAmount",
  "ppmpf_2",
  "ppmpf_3",
  "ppmpf_4",
  "ppmpf_5",
];

const requiredChecks = [
  ["pp_Version present", fields.pp_Version === "1.1"],
  ["pp_TxnType MWALLET", fields.pp_TxnType === "MWALLET"],
  ["pp_ReturnURL present", Boolean(fields.pp_ReturnURL)],
  ["pp_ReturnURL exact", fields.pp_ReturnURL === "https://api.epost.pk/api/payments/jazzcash/callback"],
  ["TxnRefNo starts with T", /^T\d{14}$/.test(fields.pp_TxnRefNo)],
  ["ppmpf_1 present", Boolean(fields.ppmpf_1)],
  ["expiry about 7 days", expiryDeltaHours >= 167 && expiryDeltaHours <= 169],
  ["field names match support set", Object.keys(fields).length === outboundFieldNames.length && outboundFieldNames.every((name) => name in fields)],
  ["forbidden fields excluded", forbiddenFields.every((fieldName) => !(fieldName in fields))],
  ["amount 999 => 99900", fields.pp_Amount === "99900"],
  ["amount 2500 => 250000", toPaisa(2500) === "250000"],
  ["pp_SecureHash computed", Boolean(secureHash)],
  ["hash is uppercase 64 chars", /^[A-F0-9]{64}$/.test(secureHash)],
  ["hash uses exact outbound fields", hashInputParts.length === expectedHashParts.length && hashInputParts.every((value, index) => value === expectedHashParts[index])],
  ["status inquiry hash computed", Boolean(statusInquirySecureHash)],
  ["status inquiry hash includes txnRef", statusInquiryHashInput.includes(txnRefNo)],
];

const failed = requiredChecks.filter(([, pass]) => !pass);

console.log("[JazzCash Mobile Wallet local sanity]");
console.log("endpoint path:", "/ApplicationAPI/API/Payment/DoTransaction");
console.log("fields:", Object.keys(fields));
console.log("sorted outbound hash keys:", sortedOutboundKeys);
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
