import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'planner-test-'));
process.env.DATA_DIR = dir;
process.env.DB_FILE = path.join(dir, 't.db');
process.env.ALLOW_REGISTRATION = '1';
delete process.env.ANTHROPIC_API_KEY;

const { createApp } = await import('../server/index.js');
export const server = await new Promise((res) => { const s = createApp().listen(0, '127.0.0.1', () => res(s)); });
export const base = `http://127.0.0.1:${server.address().port}`;

export function client() {
  let cookie = '';
  const call = async (method, url, body, headers = {}) => {
    const r = await fetch(base + '/api' + url, {
      method, headers: { 'content-type': 'application/json', 'x-requested-with': 'planner', ...(cookie ? { cookie } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* csv */ }
    return { status: r.status, body: json, text };
  };
  return { get: (u) => call('GET', u), post: (u, b = {}) => call('POST', u, b), patch: (u, b) => call('PATCH', u, b), put: (u, b) => call('PUT', u, b), del: (u) => call('DELETE', u), raw: call };
}
export async function newUser(email) {
  const c = client();
  const r = await c.post('/auth/register', { email, password: 'correct-horse-battery' });
  if (r.status !== 200) throw new Error('register failed ' + JSON.stringify(r.body));
  return c;
}

/** Поддельный сервер Anthropic: отдаёт заранее заданный ответ и запоминает запросы. */
export function mockAnthropic(handler) {
  const calls = [];
  const s = http.createServer((req, res) => {
    let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => {
      const body = JSON.parse(b); calls.push({ headers: req.headers, body });
      const out = handler(body, calls.length);
      res.setHeader('content-type', 'application/json'); res.statusCode = out.status || 200;
      res.end(JSON.stringify(out.json));
    });
  });
  return new Promise((resolve) => s.listen(0, '127.0.0.1', () => resolve({ calls, url: `http://127.0.0.1:${s.address().port}`, close: () => s.close() })));
}
