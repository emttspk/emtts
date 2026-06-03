const tokenKey = "labelgen_token";
const roleKey = "labelgen_role";
const refreshTokenKey = "labelgen_refresh_token";
const sessionScopeKey = "labelgen_session_scope";

type SessionScope = "local" | "session";

function readFromStorage(key: string) {
  const sessionValue = sessionStorage.getItem(key);
  if (sessionValue) return sessionValue;
  return localStorage.getItem(key);
}

function clearKeyEverywhere(key: string) {
  localStorage.removeItem(key);
  sessionStorage.removeItem(key);
}

export function getToken() {
  return readFromStorage(tokenKey);
}

export function setSession(token: string, role: string, refreshToken?: string, options?: { rememberMe?: boolean }) {
  const rememberMe = options?.rememberMe ?? true;
  const storage = rememberMe ? localStorage : sessionStorage;
  const scope: SessionScope = rememberMe ? "local" : "session";

  clearSession();
  storage.setItem(tokenKey, token);
  storage.setItem(roleKey, role);
  if (refreshToken) {
    storage.setItem(refreshTokenKey, refreshToken);
  }
  storage.setItem(sessionScopeKey, scope);
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

