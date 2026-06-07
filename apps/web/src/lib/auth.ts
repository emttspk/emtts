const tokenKey = "labelgen_token";
const roleKey = "labelgen_role";
const refreshTokenKey = "labelgen_refresh_token";
const sessionScopeKey = "labelgen_session_scope";

type SessionScope = "local" | "session";

const memorySession = new Map<string, string>();

function readFromStorage(key: string) {
  const memoryValue = memorySession.get(key);
  if (memoryValue) return memoryValue;

  try {
    const sessionValue = sessionStorage.getItem(key);
    if (sessionValue) return sessionValue;
  } catch {
    // Ignore browser storage access failures and fall back to memory.
  }

  try {
    return localStorage.getItem(key);
  } catch {
    return memorySession.get(key) ?? null;
  }
}

function clearKeyEverywhere(key: string) {
  memorySession.delete(key);
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore browser storage access failures.
  }
  try {
    sessionStorage.removeItem(key);
  } catch {
    // Ignore browser storage access failures.
  }
}

function writeToStorage(key: string, value: string, storage: Storage) {
  try {
    storage.setItem(key, value);
  } catch {
    memorySession.set(key, value);
  }
}

export function getToken() {
  return readFromStorage(tokenKey);
}

export function setSession(token: string, role: string, refreshToken?: string, options?: { rememberMe?: boolean }) {
  const rememberMe = options?.rememberMe ?? true;
  const storage = rememberMe ? localStorage : sessionStorage;
  const scope: SessionScope = rememberMe ? "local" : "session";

  clearSession();
  writeToStorage(tokenKey, token, storage);
  writeToStorage(roleKey, role, storage);
  if (refreshToken) {
    writeToStorage(refreshTokenKey, refreshToken, storage);
  }
  writeToStorage(sessionScopeKey, scope, storage);
}

export function clearSession() {
  clearKeyEverywhere(tokenKey);
  clearKeyEverywhere(roleKey);
  clearKeyEverywhere(refreshTokenKey);
  clearKeyEverywhere(sessionScopeKey);
}

export function getRole() {
  return readFromStorage(roleKey);
}

export function getRefreshToken() {
  return readFromStorage(refreshTokenKey);
}
