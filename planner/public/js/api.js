export class ApiError extends Error { constructor(message, status, data) { super(message); this.status = status; this.data = data; } }

export async function api(method, url, body) {
  let resp;
  try {
    resp = await fetch('/api' + url, {
      method, credentials: 'same-origin',
      headers: { 'X-Requested-With': 'planner', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch { throw new ApiError('Нет связи с сервером. Проверьте, что сайт запущен.', 0); }
  let data = null; try { data = await resp.json(); } catch { /* пусто */ }
  if (resp.status === 401 && !url.startsWith('/auth/')) { window.dispatchEvent(new Event('planner:unauth')); }
  if (!resp.ok) throw new ApiError(data?.error || `Ошибка ${resp.status}`, resp.status, data);
  return data;
}
export const GET = (u) => api('GET', u);
export const POST = (u, b = {}) => api('POST', u, b);
export const PATCH = (u, b) => api('PATCH', u, b);
export const PUT = (u, b) => api('PUT', u, b);
export const DEL = (u) => api('DELETE', u);
