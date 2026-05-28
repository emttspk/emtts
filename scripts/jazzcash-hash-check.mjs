import crypto from "node:crypto";

function buildHashInput(fields, integritySalt) {
  const hashFields = Object.entries(fields)
    .filter(([key, value]) => /^pp/i.test(key) && !/^pp_securehash$/i.test(key) && value !== undefined && value !== null && String(value).trim() !== "")
    .sort(([a], [b]) => a.localeCompare(b, "en", { sensitivity: "base" }))
    .map(([, value]) => String(value));

  return [integritySalt, ...hashFields].join("&");
}

function hmacSha256Uppercase(message, secret) {
  return crypto.createHmac("sha256", secret).update(message, "utf8").digest("hex").toUpperCase();
}

const vectors = [
  {
    name: "Official docs short sample",
    integritySalt: "0F5DD14AE2",
    fields: {
      pp_MerchantID: "MER123",
      pp_TxnRefNo: "A48cvE28",
      pp_Amount: "2995",
    },
    expectedHash: "C7689CDA7474EB1ADCD343FD0C0B676BAD0BA66361CC46DB589BDB0DA4C1C867",
  },
  {
    name: "Hosted checkout canonical field set",
    integritySalt: "test_hash_key",
    fields: {
      pp_Amount: "10000",
      pp_BankID: "",
      pp_BillReference: "BILL-123",
      pp_Description: "Test",
      pp_Language: "EN",
      pp_MerchantID: "test_merchant",
      pp_Password: "test_password",
      pp_ProductID: "",
      pp_ReturnURL: "https://example.com",
      pp_SubMerchantID: "",
      pp_TxnCurrency: "PKR",
      pp_TxnDateTime: "20250115120000",
      pp_TxnExpiryDateTime: "20250116120000",
      pp_TxnRefNo: "TR123",
      pp_TxnType: "MWALLET",
      pp_Version: "1.1",
      ppmpf_1: "03123456789",
      ppmpf_2: "",
      ppmpf_3: "",
      ppmpf_4: "",
      ppmpf_5: "",
    },
  },
];

let hasFailure = false;

for (const vector of vectors) {
  const input = buildHashInput(vector.fields, vector.integritySalt);
  const actualHash = hmacSha256Uppercase(input, vector.integritySalt);

  console.log(`\n[${vector.name}]`);
  console.log("hash input:", input);
  console.log("hash:", actualHash);

  if (vector.expectedHash) {
    const pass = actualHash === vector.expectedHash;
    console.log("expected:", vector.expectedHash);
    console.log("status:", pass ? "PASS" : "FAIL");
    if (!pass) {
      hasFailure = true;
    }
  }
}

if (hasFailure) {
  process.exit(1);
}
