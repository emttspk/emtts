import fs from "node:fs/promises";
import path from "node:path";
import { outputsDir } from "../storage/paths.js";

export type TrackingCycleExpectedStatus = "DELIVERED" | "RETURNED" | "PENDING" | "DELIVERED WITH PAYMENT";
export type TrackingCycleDetected = "Cycle 1" | "Cycle 2" | "Cycle 3" | "Cycle Unknown";

export type TrackingCycleCorrection = {
  tracking_number: string;
  expected_status?: TrackingCycleExpectedStatus;
  cycle_detected?: TrackingCycleDetected;
  missing_steps?: string[];
  reason?: string;
  issue_code?: string;
  apply_to_issue_code?: boolean;
};

type PersistedCorrectionStore = {
  version: 1;
  updated_at: string;
  tracking_overrides: Record<string, Omit<TrackingCycleCorrection, "tracking_number">>;
  issue_overrides: Record<string, Omit<TrackingCycleCorrection, "tracking_number" | "apply_to_issue_code">>;
};

const CORRECTIONS_PATH = path.join(outputsDir(), "tracking-cycle-corrections.json");

let cache: PersistedCorrectionStore | null = null;

function defaultStore(): PersistedCorrectionStore {
  return {
    version: 1,
    updated_at: new Date().toISOString(),
    tracking_overrides: {},
    issue_overrides: {},
  };
}

async function ensureLoaded() {
  if (cache) return cache;
  try {
    const raw = await fs.readFile(CORRECTIONS_PATH, "utf8");
    const parsed = JSON.parse(raw) as PersistedCorrectionStore;
    cache = {
      version: 1,
      updated_at: String(parsed?.updated_at ?? new Date().toISOString()),
      tracking_overrides: parsed?.tracking_overrides ?? {},
      issue_overrides: parsed?.issue_overrides ?? {},
    };
    return cache;
  } catch {
    cache = defaultStore();
    return cache;
  }
}

async function persist(store: PersistedCorrectionStore) {
  const next: PersistedCorrectionStore = {
    ...store,
    version: 1,
    updated_at: new Date().toISOString(),
  };
  await fs.mkdir(outputsDir(), { recursive: true });
  await fs.writeFile(CORRECTIONS_PATH, JSON.stringify(next, null, 2), "utf8");
  cache = next;
}

export async function getTrackingCycleCorrections() {
  const store = await ensureLoaded();
  return {
    updated_at: store.updated_at,
    tracking_overrides: store.tracking_overrides,
    issue_overrides: store.issue_overrides,
  };
}

export async function saveTrackingCycleCorrections(corrections: TrackingCycleCorrection[]) {
  const store = await ensureLoaded();
  for (const row of corrections) {
    const trackingNumber = String(row.tracking_number ?? "").trim().toUpperCase();
    if (!trackingNumber) continue;

    const payload = {
      expected_status: row.expected_status,
      cycle_detected: row.cycle_detected,
      missing_steps: Array.isArray(row.missing_steps) ? row.missing_steps.filter(Boolean) : undefined,
      reason: row.reason,
      issue_code: row.issue_code,
    };

    store.tracking_overrides[trackingNumber] = payload;

    if (row.apply_to_issue_code && row.issue_code) {
      store.issue_overrides[row.issue_code] = payload;
    }
  }
  await persist(store);
  return {
    saved: corrections.length,
    updated_at: store.updated_at,
  };
}
