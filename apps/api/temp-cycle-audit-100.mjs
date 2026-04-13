import fs from "node:fs";
import path from "node:path";
import xlsx from "xlsx";
import { pythonTrackBulk } from "./dist/services/trackingService.js";

const ROOT = path.resolve(process.cwd(), "..", "..");
const XLS_PATH = path.join(ROOT, "LCS 13-11-2024.xls");
const OUT_PATH = path.join(process.cwd(), "temp-cycle-audit-100.json");

function collectTrackingIdsFromWorkbook(filePath, limit = 100) {
  const wb = xlsx.readFile(filePath, { cellDates: false });
  const ids = [];
  const seen = new Set();
  const idRegex = /\b(?:[A-Z]{2,4}\d{8,16}|MOS[A-Z0-9]{4,})\b/i;
  for (const name of wb.SheetNames) {
    const rows = xlsx.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false });
    for (const row of rows) {
      if (!Array.isArray(row)) continue;
      for (const cell of row) {
        const val = String(cell ?? "").trim().toUpperCase();
        const hit = val.match(idRegex);
        if (!hit?.[0]) continue;
        const id = hit[0].toUpperCase();
        if (seen.has(id)) continue;
        seen.add(id);
        ids.push(id);
        if (ids.length >= limit) return ids;
      }
    }
  }
  return ids;
}

function hasStrictDeliveredEvent(events) {
  return (events ?? []).some((ev) => {
    const t = String(ev?.description ?? "").trim().toLowerCase();
    if (t === "delivered") return true;
    if (t.includes("delivered to addressee")) return true;
    if (t.includes("delivered") && (t.includes("to addressee") || t.includes("to addresse"))) return true;
    return /\bdelivered\b[\s\S]*\bto addres{1,2}e?\b/i.test(t);
  });
}

function hasMosIssued(events) {
  return (events ?? []).some((ev) => String(ev?.description ?? "").toLowerCase().includes("mos issued"));
}

function normalizeFinalStatus(value) {
  const raw = String(value ?? "").trim();
  if (["Delivered", "Pending", "Return"].includes(raw)) return raw;
  const up = raw.toUpperCase();
  if (up === "DELIVERED") return "Delivered";
  if (up.startsWith("RETURN")) return "Return";
  return "Pending";
}

async function main() {
  if (!fs.existsSync(XLS_PATH)) {
    throw new Error(`Audit source file not found: ${XLS_PATH}`);
  }

  const ids = collectTrackingIdsFromWorkbook(XLS_PATH, 100);
  if (ids.length === 0) throw new Error("No tracking IDs extracted for audit.");
  console.log(`[AUDIT] extracted_ids=${ids.length}`);

  const results = await pythonTrackBulk(ids, { includeRaw: true, batchSize: 100, batchTimeoutMs: 180_000 });
  const records = [];
  let failures = 0;

  for (const row of results) {
    const events = Array.isArray(row.events) ? row.events : [];
    const meta = row.meta ?? null;
    const finalStatus = normalizeFinalStatus(meta?.final_status ?? row.status);
    const lastEvent = events[events.length - 1]
      ? `${events[events.length - 1].date ?? ""} ${events[events.length - 1].time ?? ""} ${events[events.length - 1].description ?? ""}`.trim()
      : "-";
    const reason = String(meta?.decision_reason ?? "").trim() || "No cycle reason emitted.";

    const failureReasons = [];
    if (!["Delivered", "Pending", "Return"].includes(finalStatus)) failureReasons.push("INVALID_FINAL_STATUS");
    const lastEventText = String(events[events.length - 1]?.description ?? "").toLowerCase();
    if (finalStatus === "Delivered" && (!hasStrictDeliveredEvent(events) || !lastEventText.includes("delivered"))) {
      failureReasons.push("DELIVERED_BEFORE_ACTUAL_DELIVERY");
    }
    if (hasMosIssued(events) && !String(meta?.mos_id ?? "").trim()) failureReasons.push("MOS_IGNORED");
    if (finalStatus === "Return" && !reason.toLowerCase().includes("origin")) failureReasons.push("RETURN_WITHOUT_ORIGIN_CONFIRMATION");
    if ((meta?.final_cycle_index ?? 0) < (meta?.total_cycles ?? 0)) failureReasons.push("OLDER_CYCLE_USED_INSTEAD_OF_LATEST");

    if (failureReasons.length > 0) failures += 1;
    records.push({
      tracking_number: row.tracking_number,
      total_cycles: meta?.total_cycles ?? 1,
      final_cycle_index: meta?.final_cycle_index ?? meta?.current_cycle ?? 1,
      final_status: finalStatus,
      last_event: lastEvent,
      decision_reason: reason,
      failures: failureReasons,
    });
  }

  const summary = {
    total_records: records.length,
    failed_records: failures,
    passed_records: records.length - failures,
    generated_at: new Date().toISOString(),
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify({ summary, records }, null, 2), "utf8");
  console.log(`[AUDIT] total=${summary.total_records} passed=${summary.passed_records} failed=${summary.failed_records}`);
  console.log(`[AUDIT] report=${OUT_PATH}`);
}

main().catch((e) => {
  console.error(`[AUDIT] failed: ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
});
