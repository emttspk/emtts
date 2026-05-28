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

const integritySalt = process.env.JAZZCASH_INTEGRITY_SALT || "test_hash_key";
const returnUrl = process.env.JAZZCASH_RETURN_URL || "https://api.epost.pk/api/payments/jazzcash/callback";
const fields = {
  pp_Language: "EN",
  pp_Version: "1.1",
  pp_MerchantID: process.env.JAZZCASH_MERCHANT_ID || "MC_TEST",
  pp_SubMerchantID: "",
  pp_Password: process.env.JAZZCASH_PASSWORD || "TEST_PASSWORD",
  pp_TxnType: process.env.JAZZCASH_TXN_TYPE || "MWALLET",
  pp_TxnRefNo: "JZ20260528190000ABCD",
  pp_MobileNumber: "03123456789",
  pp_ReturnURL: returnUrl,
  pp_CNIC: "345678",
  pp_Amount: "10000",
  pp_DiscountedAmount: "",
  pp_TxnCurrency: "PKR",
  pp_TxnDateTime: "20260528190000",
  pp_BillReference: "JZ20260528190000ABCD",
  pp_Description: "Mobile wallet test",
  pp_TxnExpiryDateTime: "20260529190000",
  ppmpf_1: "",
  ppmpf_2: "",
  ppmpf_3: "",
  ppmpf_4: "",
  ppmpf_5: "",
};

const hashInput = buildHashInput(fields, integritySalt);
const secureHash = hmacSha256Uppercase(hashInput, integritySalt);

const requiredChecks = [
  ["pp_Version present", fields.pp_Version === "1.1"],
  ["pp_ReturnURL present", Boolean(fields.pp_ReturnURL)],
  ["pp_ReturnURL exact", fields.pp_ReturnURL === "https://api.epost.pk/api/payments/jazzcash/callback"],
  ["pp_MobileNumber present", Boolean(fields.pp_MobileNumber)],
  ["pp_CNIC present", Boolean(fields.pp_CNIC)],
  ["pp_SecureHash computed", Boolean(secureHash)],
  ["hash input includes pp_ReturnURL", hashInput.includes(fields.pp_ReturnURL)],
];

const failed = requiredChecks.filter(([, pass]) => !pass);

console.log("[JazzCash Mobile Wallet local sanity]");
console.log("endpoint path:", "/ApplicationAPI/API/Payment/DoTransaction");
console.log("fields:", Object.keys(fields));
console.log("hash input:", hashInput);
console.log("secure hash:", secureHash);
for (const [label, pass] of requiredChecks) {
  console.log(`check: ${label} => ${pass ? "PASS" : "FAIL"}`);
}
if (failed.length > 0) {
  console.error("[JazzCash Mobile Wallet local sanity] FAILED checks:", failed.map(([label]) => label));
  process.exit(1);
}
