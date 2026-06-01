import crypto from "node:crypto";
import { config } from "dotenv";

config();

function formatPkDateTime(date) {
  const shifted = new Date(date.getTime() + 5 * 60 * 60 * 1000);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  const hours = String(shifted.getUTCHours()).padStart(2, "0");
  const minutes = String(shifted.getUTCMinutes()).padStart(2, "0");
  const seconds = String(shifted.getUTCSeconds()).padStart(2, "0");
  return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

function buildHashInput(fields, integritySalt) {
  const values = Object.entries(fields)
    .filter(([key, value]) => /^pp/i.test(key) && !/^pp_securehash$/i.test(key) && String(value ?? "") !== "")
    .sort(([leftKey], [rightKey]) => (leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0))
    .map(([, value]) => String(value));

  return values.length > 0 ? `${integritySalt}&${values.join("&")}` : integritySalt;
}

function hmacSha256Uppercase(message, secret) {
  return crypto.createHmac("sha256", secret).update(message, "utf8").digest("hex").toUpperCase();
}

const merchantId = String(process.env.JAZZCASH_MERCHANT_ID || "").trim();
const password = String(process.env.JAZZCASH_PASSWORD || "").trim();
const integritySalt = String(process.env.JAZZCASH_INTEGRITY_SALT || "").trim();

if (!merchantId || !password || !integritySalt) {
  console.error("Missing required env values: JAZZCASH_MERCHANT_ID, JAZZCASH_PASSWORD, JAZZCASH_INTEGRITY_SALT");
  process.exit(1);
}

const endpoint = String(
  process.env.JAZZCASH_MOBILE_WALLET_ENDPOINT_SANDBOX
    || "https://sandbox.jazzcash.com.pk/ApplicationAPI/API/Payment/DoTransaction",
).trim();

const now = new Date();
const txnDateTime = formatPkDateTime(now);
const txnRefNo = `T${txnDateTime}`;
const txnExpiryDateTime = formatPkDateTime(new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000));

const amount = String(process.env.JAZZCASH_TEST_AMOUNT || "100").trim() || "100";
const mobileNumber = String(process.env.JAZZCASH_TEST_MOBILE || "03123456789").trim() || "03123456789";
const returnUrl = String(process.env.JAZZCASH_RETURN_URL || "https://api.epost.pk/api/payments/jazzcash/callback").trim();

const fields = {
  pp_Version: "1.1",
  pp_TxnType: "MWALLET",
  pp_Language: "EN",
  pp_MerchantID: merchantId,
  pp_Password: password,
  pp_TxnRefNo: txnRefNo,
  pp_Amount: amount,
  pp_TxnCurrency: "PKR",
  pp_TxnDateTime: txnDateTime,
  pp_BillReference: "billRef3781",
  pp_Description: "Test case description",
  pp_TxnExpiryDateTime: txnExpiryDateTime,
  pp_ReturnURL: returnUrl,
  ppmpf_1: mobileNumber,
};

const hashInput = buildHashInput(fields, integritySalt);
const secureHash = hmacSha256Uppercase(hashInput, integritySalt);
fields.pp_SecureHash = secureHash;

let httpStatus = 0;
let responseBody = {};

try {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(fields),
  });

  httpStatus = response.status;
  const raw = await response.text();
  try {
    responseBody = raw ? JSON.parse(raw) : {};
  } catch {
    responseBody = { raw };
  }
} catch (error) {
  console.error("Support payload check request failed:", error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const responseCode = String(responseBody.pp_ResponseCode || responseBody.pp_PaymentResponseCode || "").trim();
const responseMessage = String(responseBody.pp_ResponseMessage || responseBody.pp_PaymentResponseMessage || "").trim();

console.log("[JazzCash support payload check]");
console.log("HTTP status:", httpStatus);
console.log("pp_ResponseCode:", responseCode || "(empty)");
console.log("pp_ResponseMessage:", responseMessage || "(empty)");
console.log("txnRefNo:", txnRefNo);
console.log("field names used:", Object.keys(fields));
console.log("hash length:", secureHash.length);
