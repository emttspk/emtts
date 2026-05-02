const API = 'https://api-production-28491.up.railway.app';
const creds = { email: 'nazimsaeed@gmail.com', password: 'Lahore!23' };

async function readJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function main() {
  const loginRes = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(creds),
  });
  const loginBody = await readJson(loginRes);
  if (!loginRes.ok || !loginBody.token) {
    throw new Error(`login failed ${JSON.stringify(loginBody)}`);
  }

  const headers = { authorization: `Bearer ${loginBody.token}` };
  const meBefore = await readJson(await fetch(`${API}/api/me`, { headers }));
  const usageBefore = meBefore.usage ?? {};
  const balancesBefore = meBefore.balances ?? {};

  const shipmentsData = await readJson(await fetch(`${API}/api/shipments?page=1&limit=200`, { headers }));
  const pendingTrackingNumbers = (shipmentsData.shipments ?? [])
    .filter((row) => String(row?.status ?? '').trim().toUpperCase() === 'PENDING')
    .map((row) => String(row.trackingNumber ?? '').trim())
    .filter(Boolean)
    .slice(0, 50);

  const refreshRes = await fetch(`${API}/api/shipments/refresh-pending`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ trackingNumbers: pendingTrackingNumbers }),
  });
  const refreshBody = await readJson(refreshRes);

  const meAfter = await readJson(await fetch(`${API}/api/me`, { headers }));
  const usageAfter = meAfter.usage ?? {};
  const balancesAfter = meAfter.balances ?? {};

  const summary = {
    refreshHttp: refreshRes.status,
    refreshBody,
    before: {
      labelsQueued: usageBefore.labelsQueued,
      trackingQueued: usageBefore.trackingQueued,
      usedUnits: balancesBefore.used_units,
      unitsRemaining: balancesBefore.unitsRemaining,
    },
    after: {
      labelsQueued: usageAfter.labelsQueued,
      trackingQueued: usageAfter.trackingQueued,
      usedUnits: balancesAfter.used_units,
      unitsRemaining: balancesAfter.unitsRemaining,
    },
    checks: {
      noUsedUnitIncrease: Number(balancesAfter.used_units) <= Number(balancesBefore.used_units),
      noUnitsRemainingDrop: Number(balancesAfter.unitsRemaining) >= Number(balancesBefore.unitsRemaining),
    },
  };

  console.log(`REFRESH_UNIT_SUMMARY=${JSON.stringify(summary)}`);
}

main().catch((error) => {
  console.error(`REFRESH_UNIT_FAILED=${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exit(1);
});
