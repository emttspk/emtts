import type { TrackingCycleAuditRecord } from "./trackingCycleAudit.js";
import { buildTrackingCycleAuditRecord } from "./trackingCycleAudit.js";
import { getTrackingCycleCorrections, saveTrackingCycleCorrections, type TrackingCycleExpectedStatus, type TrackingCycleDetected } from "./trackingCycleCorrections.js";
import { prisma } from "../lib/prisma.js";

export type ImportValidationResult = {
  success: boolean;
  totalRows: number;
  validRows: number;
  skippedRows: number;
  appliedCorrections: number;
  errors: {
    rowIndex: number;
    trackingNumber?: string;
    message: string;
    suggestedFix?: string;
  }[];
  warnings: {
    rowIndex: number;
    trackingNumber?: string;
    message: string;
    autoCorrection?: string;
  }[];
  reprocessedRecords: TrackingCycleAuditRecord[];
  summary: {
    statusChanges: Record<string, number>;
    cycleChanges: Record<string, number>;
    issueCodePatterns: Record<string, number>;
  };
};

export async function validateAndImportCycleAudit(
  csvRows: Record<string, string>[]
): Promise<ImportValidationResult> {
  const errors: ImportValidationResult["errors"] = [];
  const warnings: ImportValidationResult["warnings"] = [];
  const validCorrections: Array<Record<string, unknown>> = [];
  const statusChanges: Record<string, number> = {};
  const cycleChanges: Record<string, number> = {};
  const issueCodePatterns: Record<string, number> = {};

  // Process each row intelligently
  for (let i = 0; i < csvRows.length; i++) {
    const row = csvRows[i];
    const rowIndex = i + 2; // +2 for 1-based indexing and header

    if (!row) {
      errors.push({ rowIndex, message: "Empty row" });
      continue;
    }

    // Extract fields - handle various column name variations
    const trackingNumber = String(row["tracking_number"] ?? row["Tracking Number"] ?? row["tracking"] ?? row["Tracking"] ?? "").trim();
    const currentStatus = String(row["current_status"] ?? row["Current Status"] ?? "").trim();
    const expectedStatus = String(row["expected_status"] ?? row["Expected Status"] ?? row["Suggested Status"] ?? "").trim();
    const cycleDetected = String(row["cycle_detected"] ?? row["Cycle Detected"] ?? row["Cycle"] ?? "").trim();
    const issue = String(row["issue"] ?? row["Issue"] ?? "").trim();
    const applyToIssueCode = String(row["apply_to_issue_code"] ?? row["Apply to Issue Code"] ?? "no").trim().toLowerCase() === "yes" || 
                            String(row["apply_to_issue_code"] ?? row["Apply to Issue Code"] ?? "").trim().toLowerCase() === "true";

    // Validate tracking number
    if (!trackingNumber) {
      errors.push({
        rowIndex,
        trackingNumber,
        message: "Missing tracking number",
        suggestedFix: "Ensure tracking_number column is populated",
      });
      continue;
    }

    // Intelligent status normalization
    const normalized = normalizeStatus(expectedStatus);
    if (expectedStatus && !normalized) {
      warnings.push({
        rowIndex,
        trackingNumber,
        message: `Invalid status "${expectedStatus}" - using current status "${currentStatus}"`,
        autoCorrection: currentStatus,
      });
    }

    // Validate cycle format
    if (cycleDetected && !["Cycle 1", "Cycle 2", "Cycle 3", "Cycle Unknown"].includes(cycleDetected)) {
      warnings.push({
        rowIndex,
        trackingNumber,
        message: `Invalid cycle format "${cycleDetected}" - will use as-is`,
      });
    }

    // Check if tracking number exists
    try {
      const existing = await prisma.shipment.findFirst({
        where: { trackingNumber },
      });

      if (!existing) {
        errors.push({
          rowIndex,
          trackingNumber,
          message: `Tracking number not found in database`,
          suggestedFix: "Verify tracking number spelling or ensure it has been uploaded",
        });
        continue;
      }

      // Track changes for pattern learning
      if (normalized && normalized !== currentStatus) {
        const changeKey = `${currentStatus} → ${normalized}`;
        statusChanges[changeKey] = (statusChanges[changeKey] ?? 0) + 1;
      }

      if (cycleDetected) {
        const cycleKey = `Detected: ${cycleDetected}`;
        cycleChanges[cycleKey] = (cycleChanges[cycleKey] ?? 0) + 1;
      }

      if (issue) {
        issueCodePatterns[issue] = (issueCodePatterns[issue] ?? 0) + 1;
      }

      // Build correction object
      const missingSteps = String(row["missing_steps"] ?? row["Missing Steps"] ?? "")
        .trim()
        .split(/[;\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean);

      const reason = String(row["reason"] ?? row["Reason"] ?? row["Correction Reason"] ?? "").trim() || `Imported from CSV (row ${rowIndex})`;

      validCorrections.push({
        tracking_number: trackingNumber,
        expected_status: normalized || currentStatus,
        cycle_detected: cycleDetected || undefined,
        missing_steps: missingSteps,
        reason,
        issue_code: issue || undefined,
        apply_to_issue_code: applyToIssueCode,
      });
    } catch (err) {
      errors.push({
        rowIndex,
        trackingNumber,
        message: `Database error: ${err instanceof Error ? err.message : "Unknown error"}`,
      });
    }
  }

  // Apply corrections if there are valid ones
  let reprocessedRecords: TrackingCycleAuditRecord[] = [];
  if (validCorrections.length > 0) {
    try {
      // Save corrections to the correction store (as typed TrackingCycleCorrection array)
      const correction_array = validCorrections.map((c) => ({
        tracking_number: String(c.tracking_number ?? ""),
        expected_status: c.expected_status as TrackingCycleExpectedStatus | undefined,
        cycle_detected: c.cycle_detected as TrackingCycleDetected | undefined,
        missing_steps: Array.isArray(c.missing_steps) ? c.missing_steps : [],
        reason: String(c.reason ?? ""),
        issue_code: String(c.issue_code ?? ""),
        apply_to_issue_code: Boolean(c.apply_to_issue_code),
      }));

      await saveTrackingCycleCorrections(correction_array);

      // Get updated corrections for reprocessing
      const updatedCorrections = await getTrackingCycleCorrections();

      // Reprocess the corrected records
      const correctedTrackingNumbers = validCorrections.map((c) => String(c.tracking_number ?? "").trim()).filter(Boolean);
      const shipments = await prisma.shipment.findMany({
        where: { trackingNumber: { in: correctedTrackingNumbers } },
      });

      for (const shipment of shipments) {
        const auditRecord = await buildTrackingCycleAuditRecord(
          {
            trackingNumber: shipment.trackingNumber,
            currentStatus: shipment.status,
            rawJson: shipment.rawJson,
          },
          {
            trackingOverrides: updatedCorrections.tracking_overrides,
            issueOverrides: updatedCorrections.issue_overrides,
          }
        );
        reprocessedRecords.push(auditRecord);
      }
    } catch (err) {
      errors.push({
        rowIndex: 0,
        message: `Failed to apply corrections: ${err instanceof Error ? err.message : "Unknown error"}`,
      });
    }
  }

  return {
    success: errors.length === 0 && validCorrections.length > 0,
    totalRows: csvRows.length,
    validRows: validCorrections.length,
    skippedRows: csvRows.length - validCorrections.length,
    appliedCorrections: validCorrections.length,
    errors,
    warnings,
    reprocessedRecords,
    summary: {
      statusChanges,
      cycleChanges,
      issueCodePatterns,
    },
  };
}

function normalizeStatus(value: string): "DELIVERED" | "RETURNED" | "PENDING" | null {
  if (!value) return null;
  const upper = String(value).toUpperCase();
  if (upper.includes("DELIVER")) return "DELIVERED";
  if (upper.includes("RETURN")) return "RETURNED";
  if (upper.includes("PENDING")) return "PENDING";
  return null;
}

/**
 * Parse CSV text into array of records
 */
export function parseCSV(csvText: string): Record<string, string>[] {
  const lines = csvText.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];

  const header = lines[0].split(",").map((h) => h.trim().replace(/^["']|["']$/g, ""));
  const records: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const values = parseCSVLine(line);
    if (values.length === 0) continue;

    const record: Record<string, string> = {};
    for (let j = 0; j < header.length && j < values.length; j++) {
      record[header[j]] = values[j];
    }
    records.push(record);
  }

  return records;
}

/**
 * Simple CSV line parser that handles quoted values
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}
