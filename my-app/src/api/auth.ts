import api from './client';

const STORAGE_TOKEN_KEY = 'auth_token';
const STORAGE_USER_KEY = 'auth_user';
const STORAGE_LAST_ACTIVITY = 'auth_last_activity';
const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export async function login(email: string, password: string) {
  const res = await api.post<{ token: string; user: any }>('/v1/auth/login', { email, password });
  api.setAuthToken(res.token);
  try {
    localStorage.setItem(STORAGE_TOKEN_KEY, res.token);
    localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(res.user));
    localStorage.setItem(STORAGE_LAST_ACTIVITY, String(Date.now()));
  } catch {}
  return res.user;
}

export async function register(email: string, fullName: string, password: string) {
  const res = await api.post<any>('/v1/auth/register', { email, fullName, password });
  return res;
}

export function logout() {
  api.setAuthToken(null);
  try {
    localStorage.removeItem(STORAGE_TOKEN_KEY);
    localStorage.removeItem(STORAGE_USER_KEY);
    localStorage.removeItem(STORAGE_LAST_ACTIVITY);
  } catch {}
}

export function getStoredAuth() {
  try {
    const token = localStorage.getItem(STORAGE_TOKEN_KEY);
    const userText = localStorage.getItem(STORAGE_USER_KEY);
    const user = userText ? JSON.parse(userText) : null;
    if (token) api.setAuthToken(token);
    return { token, user };
  } catch {
    return { token: null, user: null };
  }
}

export function touchSession() {
  try {
    localStorage.setItem(STORAGE_LAST_ACTIVITY, String(Date.now()));
  } catch {}
}

export function isSessionExpired(): boolean {
  try {
    const ts = localStorage.getItem(STORAGE_LAST_ACTIVITY);
    if (!ts) return true;
    const last = Number(ts);
    if (Number.isNaN(last)) return true;
    return Date.now() - last > INACTIVITY_TIMEOUT_MS;
  } catch {
    return true;
  }
}

export default { login, register, logout, getStoredAuth, touchSession, isSessionExpired };
