import crypto from 'node:crypto';
import { get, run, all } from './db.js';
import { randomToken, sha256 } from './crypto.js';
import { DEFAULT_SETTINGS } from './config.js';

const SESSION_DAYS = 30;

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(pw, salt, 64);
  return `scrypt$${salt.toString('hex')}$${h.toString('hex')}`;
}
export function verifyPassword(pw, stored) {
  const [alg, salt, hash] = stored.split('$');
  if (alg !== 'scrypt') return false;
  const h = crypto.scryptSync(pw, Buffer.from(salt, 'hex'), 64);
  return crypto.timingSafeEqual(h, Buffer.from(hash, 'hex'));
}

export function createSession(res, userId) {
  const token = randomToken();
  run('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)', sha256(token), userId, Date.now() + SESSION_DAYS * 864e5);
  const secure = process.env.COOKIE_SECURE === '1' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `sid=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 86400}${secure}`);
}
export function destroySession(req, res) {
  const t = readCookie(req, 'sid');
  if (t) run('DELETE FROM sessions WHERE token_hash=?', sha256(t));
  res.setHeader('Set-Cookie', 'sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
}
function readCookie(req, name) {
  const m = (req.headers.cookie || '').split(/;\s*/).find((c) => c.startsWith(name + '='));
  return m ? m.slice(name.length + 1) : null;
}

export function userSettings(user) {
  return { ...DEFAULT_SETTINGS, ...JSON.parse(user.settings || '{}') };
}

/** Middleware: проверяет сессию на сервере. Все данные запрашиваются только по user.id из сессии. */
export function requireAuth(req, res, next) {
  const t = readCookie(req, 'sid');
  if (t) {
    const row = get('SELECT u.*, s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?', sha256(t));
    if (row && row.expires_at > Date.now()) {
      req.user = row;
      req.settings = userSettings(row);
      return next();
    }
  }
  res.status(401).json({ error: 'Нужно войти в аккаунт' });
}

/** Защита от CSRF: изменяющие запросы должны идти из нашей страницы. */
export function csrfGuard(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.headers.origin;
  if (origin && new URL(origin).host !== req.headers.host) return res.status(403).json({ error: 'Запрос отклонён' });
  if (req.headers['x-requested-with'] !== 'planner') return res.status(403).json({ error: 'Запрос отклонён' });
  next();
}

const attempts = new Map();
export function rateLimit(key, max = 8, windowMs = 15 * 60 * 1000) {
  const now = Date.now();
  const a = (attempts.get(key) || []).filter((t) => now - t < windowMs);
  if (a.length >= max) return false;
  a.push(now); attempts.set(key, a);
  return true;
}
export const clearAttempts = (key) => attempts.delete(key);

export function cleanupSessions() { run('DELETE FROM sessions WHERE expires_at < ?', Date.now()); }
export { all };
