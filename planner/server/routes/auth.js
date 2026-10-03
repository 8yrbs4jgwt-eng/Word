import { Router } from 'express';
import { all, get, run, tx } from '../db.js';
import { createSession, destroySession, hashPassword, verifyPassword, requireAuth, rateLimit, clearAttempts, userSettings } from '../auth.js';
import { bad, str } from '../validate.js';
import { isValidTz } from '../dates.js';
import { seedDemo } from '../demo.js';
import { randomToken } from '../crypto.js';
import crypto from 'node:crypto';

const codeOk = (given) => {
  const need = process.env.SETUP_CODE;
  if (!need) return true;
  const a = crypto.createHash('sha256').update(String(given || '')).digest(), b = crypto.createHash('sha256').update(need).digest();
  return crypto.timingSafeEqual(a, b);
};

const r = Router();

export const publicUser = (u) => ({ id: u.id, email: u.email, is_demo: !!u.is_demo, settings: userSettings(u) });

r.get('/auth/state', (req, res) => {
  const users = get('SELECT COUNT(*) AS n FROM users WHERE is_demo=0').n;
  res.json({
    code_required: !!process.env.SETUP_CODE,
    has_users: users > 0,
    registration_open: users === 0 || process.env.ALLOW_REGISTRATION === '1',
    demo_enabled: process.env.ALLOW_DEMO !== '0',
  });
});

r.post('/auth/register', (req, res) => {
  const users = get('SELECT COUNT(*) AS n FROM users WHERE is_demo=0').n;
  if (users > 0 && process.env.ALLOW_REGISTRATION !== '1') throw bad('Регистрация закрыта: аккаунт уже создан');
  if (!rateLimit(`reg|${req.ip}`, 10)) return res.status(429).json({ error: 'Слишком много попыток. Подождите 15 минут.' });
  if (!codeOk(req.body.code)) throw bad('Неверный код доступа');
  const email = str(req.body.email, 'Email', { required: true, max: 200 }).toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw bad('Введите корректный email');
  if (email.endsWith('@demo.local')) throw bad('Этот адрес зарезервирован');
  const pw = req.body.password;
  if (typeof pw !== 'string' || pw.length < 10) throw bad('Пароль должен быть не короче 10 символов');
  if (pw.length > 200) throw bad('Пароль слишком длинный');
  if (get('SELECT 1 FROM users WHERE email=?', email)) throw bad('Такой аккаунт уже существует');
  const info = run('INSERT INTO users(email,pass_hash) VALUES(?,?)', email, hashPassword(pw));
  createSession(res, Number(info.lastInsertRowid));
  res.json({ ok: true });
});

r.post('/auth/login', (req, res) => {
  const email = str(req.body.email, 'Email', { required: true, max: 200 }).toLowerCase();
  const key = `${req.ip}|${email}`;
  if (!rateLimit(key)) return res.status(429).json({ error: 'Слишком много попыток. Подождите 15 минут.' });
  const u = get('SELECT * FROM users WHERE email=? AND is_demo=0', email);
  const pw = typeof req.body.password === 'string' ? req.body.password : '';
  if (!u || !verifyPassword(pw, u.pass_hash)) return res.status(401).json({ error: 'Неверный email или пароль' });
  clearAttempts(key);
  createSession(res, u.id);
  res.json({ ok: true });
});

r.post('/auth/demo', (req, res) => {
  if (process.env.ALLOW_DEMO === '0') throw bad('Деморежим отключён');
  const uid = tx(() => {
    let u = get('SELECT * FROM users WHERE is_demo=1');
    if (!u) {
      const info = run('INSERT INTO users(email,pass_hash,is_demo) VALUES(?,?,1)', 'demo@demo.local', hashPassword(randomToken()));
      u = { id: Number(info.lastInsertRowid) };
    }
    seedDemo(u.id);
    return u.id;
  });
  createSession(res, uid);
  res.json({ ok: true });
});

r.post('/auth/logout', (req, res) => { destroySession(req, res); res.json({ ok: true }); });

r.get('/me', requireAuth, (req, res) => res.json(publicUser(req.user)));

r.put('/settings', requireAuth, (req, res) => {
  const b = req.body, s = { ...req.settings };
  if (b.name !== undefined) s.name = str(b.name, 'Имя', { max: 60 });
  if (b.timezone !== undefined) { if (!isValidTz(b.timezone)) throw bad('Неизвестный часовой пояс'); s.timezone = b.timezone; }
  for (const k of ['work_start', 'work_end']) {
    if (b[k] !== undefined) { if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(b[k])) throw bad('Время в формате ЧЧ:ММ'); s[k] = b[k]; }
  }
  if (s.work_end <= s.work_start) throw bad('Конец рабочего дня должен быть позже начала');
  if (b.break_min !== undefined) { const n = Number(b.break_min); if (!Number.isInteger(n) || n < 0 || n > 120) throw bad('Перерыв: от 0 до 120 минут'); s.break_min = n; }
  if (b.preferences !== undefined) s.preferences = str(b.preferences, 'Предпочтения', { max: 2000 });
  if (b.mail_period_days !== undefined) { const n = Number(b.mail_period_days); if (![7, 14, 30, 60].includes(n)) throw bad('Период: 7, 14, 30 или 60 дней'); s.mail_period_days = n; }
  if (b.onboarded !== undefined) s.onboarded = !!b.onboarded;
  run('UPDATE users SET settings=? WHERE id=?', JSON.stringify(s), req.user.id);
  res.json(s);
});

export default r;
