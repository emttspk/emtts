const tokenKey = "labelgen_token";
const roleKey = "labelgen_role";
const refreshTokenKey = "labelgen_refresh_token";

export function getToken() {
  return localStorage.getItem(tokenKey);
}

export function setSession(token: string, role: string, refreshToken?: string) {
  localStorage.setItem(tokenKey, token);
  localStorage.setItem(roleKey, role);
  if (refreshToken) {
    localStorage.setItem(refreshTokenKey, refreshToken);
  }
}

export function clearSession() {
  localStorage.removeItem(tokenKey);
  localStorage.removeItem(roleKey);
  localStorage.removeItem(refreshTokenKey);
}

export function getRole() {
  return localStorage.getItem(roleKey);
}

export function getRefreshToken() {
  return localStorage.getItem(refreshTokenKey);
}

