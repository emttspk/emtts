const tokenKey = "labelgen_token";
const roleKey = "labelgen_role";

export function getToken() {
  return localStorage.getItem(tokenKey);
}

export function setSession(token: string, role: string) {
  localStorage.setItem(tokenKey, token);
  localStorage.setItem(roleKey, role);
}

export function clearSession() {
  localStorage.removeItem(tokenKey);
  localStorage.removeItem(roleKey);
}

export function getRole() {
  return localStorage.getItem(roleKey);
}

