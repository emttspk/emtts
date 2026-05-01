import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma.js";

export type ComplaintCircuitState = "closed" | "open" | "half_open";

const FAILURE_WINDOW_MS = 10 * 60 * 1000;
const OPEN_COOLDOWN_MS = 30 * 60 * 1000;

async function ensureComplaintCircuitTables() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS complaint_circuit_events (
      id TEXT PRIMARY KEY,
      outcome TEXT NOT NULL,
      reason TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS complaint_circuit_state (
      id TEXT PRIMARY KEY,
      state TEXT NOT NULL,
      opened_at TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(`
    INSERT INTO complaint_circuit_state (id, state, opened_at, updated_at)
    VALUES ('global', 'closed', NULL, CURRENT_TIMESTAMP)
    ON CONFLICT (id) DO NOTHING
  `);
}

function parseState(value: string): ComplaintCircuitState {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "open") return "open";
  if (normalized === "half_open") return "half_open";
  return "closed";
}

export async function getComplaintCircuitState(): Promise<ComplaintCircuitState> {
  await ensureComplaintCircuitTables();
  const rows = await prisma.$queryRawUnsafe<Array<{ state: string; openedAt: string | null }>>(
    `SELECT state, opened_at as "openedAt" FROM complaint_circuit_state WHERE id = 'global' LIMIT 1`,
  );
  const state = parseState(rows[0]?.state ?? "closed");
  const openedAt = rows[0]?.openedAt ? new Date(rows[0].openedAt).getTime() : null;

  if (state === "open" && openedAt != null && (Date.now() - openedAt) >= OPEN_COOLDOWN_MS) {
    await prisma.$executeRawUnsafe(
      `UPDATE complaint_circuit_state SET state = 'half_open', updated_at = CURRENT_TIMESTAMP WHERE id = 'global'`,
    );
    return "half_open";
  }

  return state;
}

export async function isComplaintCircuitOpen() {
  const state = await getComplaintCircuitState();
  return state === "open";
}

async function setComplaintCircuitState(state: ComplaintCircuitState) {
  await ensureComplaintCircuitTables();
  await prisma.$executeRawUnsafe(
    `UPDATE complaint_circuit_state
     SET state = $1,
         opened_at = CASE WHEN $1 = 'open' THEN CURRENT_TIMESTAMP ELSE NULL END,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = 'global'`,
    state,
  );
}

export async function recordComplaintCircuitFailure(reason?: string) {
  await ensureComplaintCircuitTables();
  await prisma.$executeRawUnsafe(
    `INSERT INTO complaint_circuit_events (id, outcome, reason) VALUES ($1, 'failure', $2)`,
    randomUUID(),
    String(reason ?? "").slice(0, 500) || null,
  );

  const since = new Date(Date.now() - FAILURE_WINDOW_MS).toISOString();
  const rows = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
    `SELECT COUNT(*)::int as count FROM complaint_circuit_events WHERE outcome = 'failure' AND created_at >= ($1::timestamp)`,
    since,
  );
  const failures = Number(rows[0]?.count ?? 0);
  if (failures >= 5) {
    await setComplaintCircuitState("open");
    return "open" as const;
  }

  const current = await getComplaintCircuitState();
  if (current === "closed") return "closed" as const;
  return current;
}

export async function recordComplaintCircuitSuccess() {
  await ensureComplaintCircuitTables();
  await prisma.$executeRawUnsafe(
    `INSERT INTO complaint_circuit_events (id, outcome, reason) VALUES ($1, 'success', NULL)`,
    randomUUID(),
  );

  const current = await getComplaintCircuitState();
  if (current === "half_open" || current === "open") {
    await setComplaintCircuitState("closed");
  }
  return "closed" as const;
}
