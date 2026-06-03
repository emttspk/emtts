type LoginResponse = {
  token?: string;
  refreshToken?: string;
  user?: { id?: string; email?: string; role?: string };
  error?: string;
  message?: string;
};

type GenericResponse = {
  success?: boolean;
  error?: string;
  message?: string;
  token?: string;
  refreshToken?: string;
};

function boolEnv(name: string, defaultValue = false): boolean {
  const value = String(process.env[name] ?? "").trim().toLowerCase();
  if (!value) return defaultValue;
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***";
  const first = local[0] ?? "*";
  const last = local.length > 1 ? local[local.length - 1] : "*";
  return `${first}***${last}@${domain}`;
}

function assertEnv(name: string): string {
  const value = String(process.env[name] ?? "").trim();
  if (!value) {
    throw new Error(`Missing ${name}. Set ${name} in env before running production auth smoke.`);
  }
  return value;
}

async function requestJson<T>(url: string, init: RequestInit): Promise<{ status: number; body: T }> {
  const response = await fetch(url, init);
  const text = await response.text();

  let body: T;
  try {
    body = text ? (JSON.parse(text) as T) : ({} as T);
  } catch {
    throw new Error(`Non-JSON response from ${url}: status ${response.status}`);
  }

  return { status: response.status, body };
}

function must(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const smokeEmail = assertEnv("SMOKE_EMAIL").toLowerCase();
  const smokePassword = assertEnv("SMOKE_PASSWORD");
  const apiBase = String(process.env.API_URL ?? "https://api.epost.pk").trim().replace(/\/+$/, "");
  const runForgot = boolEnv("SMOKE_ENABLE_FORGOT_PASSWORD", false);

  console.log(`[AUTH_SMOKE_PROD] Starting smoke verification against ${apiBase}`);
  console.log(`[AUTH_SMOKE_PROD] Using smoke account ${maskEmail(smokeEmail)}`);

  const health = await requestJson<{ status?: string }>(`${apiBase}/api/health`, { method: "GET" });
  must(health.status === 200, `Health failed: expected 200, got ${health.status}`);

  const login = await requestJson<LoginResponse>(`${apiBase}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier: smokeEmail, password: smokePassword }),
  });
  must(login.status === 200, `Login failed: expected 200, got ${login.status}`);
  must(!!login.body.token && !!login.body.refreshToken, "Login response missing token or refreshToken");

  const refresh = await requestJson<GenericResponse>(`${apiBase}/api/auth/refresh`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refreshToken: login.body.refreshToken }),
  });
  must(refresh.status === 200, `Refresh failed: expected 200, got ${refresh.status}`);
  must(!!refresh.body.token && !!refresh.body.refreshToken, "Refresh response missing token or refreshToken");

  const logout = await requestJson<GenericResponse>(`${apiBase}/api/auth/logout`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${refresh.body.token as string}`,
    },
    body: JSON.stringify({ refreshToken: refresh.body.refreshToken }),
  });
  must(logout.status === 200, `Logout failed: expected 200, got ${logout.status}`);

  const refreshAfterLogout = await requestJson<GenericResponse>(`${apiBase}/api/auth/refresh`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refreshToken: refresh.body.refreshToken }),
  });
  must(refreshAfterLogout.status === 401, `Refresh-after-logout must fail with 401, got ${refreshAfterLogout.status}`);

  if (runForgot) {
    const forgot = await requestJson<GenericResponse>(`${apiBase}/api/auth/forgot-password`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: smokeEmail }),
    });
    must(forgot.status === 200, `Forgot password failed: expected 200, got ${forgot.status}`);
    must(
      typeof forgot.body.message === "string" && forgot.body.message.toLowerCase().includes("if this account exists"),
      "Forgot password response did not return generic safety message",
    );
  } else {
    console.log("[AUTH_SMOKE_PROD] Forgot-password check skipped. Set SMOKE_ENABLE_FORGOT_PASSWORD=true to include it.");
  }

  console.log("[AUTH_SMOKE_PROD] PASS");
  console.log(
    JSON.stringify(
      {
        health: health.status,
        login: login.status,
        refresh: refresh.status,
        logout: logout.status,
        refreshAfterLogout: refreshAfterLogout.status,
        forgotPassword: runForgot ? "checked" : "skipped",
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[AUTH_SMOKE_PROD] FAIL ${message}`);
  process.exit(1);
});
