const TOKEN_KEY = 'poker_token';

// 使用 sessionStorage 而非 localStorage：每个标签页独立登录，
// 方便在同一浏览器开多个标签测试多人对局
export function getToken() { return sessionStorage.getItem(TOKEN_KEY); }
export function setToken(t) { sessionStorage.setItem(TOKEN_KEY, t); }
export function clearToken() { sessionStorage.removeItem(TOKEN_KEY); }

export async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}
