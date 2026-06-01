import { api, uploadFile } from "./api";

export async function calculatePostageFromRows(rows: Array<Record<string, unknown>>, courierRatePerKg = 350) {
  return api("/api/postage-calculator/calculate", {
    method: "POST",
    body: JSON.stringify({ rows, courierRatePerKg }),
  });
}

export async function calculatePostageFromFile(file: File, courierRatePerKg = 350) {
  return uploadFile("/api/postage-calculator/calculate", file, { courierRatePerKg: String(courierRatePerKg) });
}
