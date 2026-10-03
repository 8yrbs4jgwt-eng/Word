import { Router } from 'express';
import { all, get, run, tx } from '../db.js';
import { requireAuth } from '../auth.js';
import * as v from '../validate.js';
import * as S from '../store.js';
import { encrypt } from '../crypto.js';
import { MAIL_DOMAINS, verifyLogin } from '../mailclient.js';
import { syncMail, mailStatus } from '../mailsync.js';
import { localSummary } from '../extract.js';

const r = Router();
r.use('/mail', requireAuth);
const num = (x) => { const n = Number(x); if (!Number.isInteger(n)) throw v.bad('Неверный идентификатор'); return n; };
const notDemo = (req) => { if (req.user.is_demo) throw new v.HttpError(403, 'В деморежиме почта недоступна'); };

function syncErr(e) {
  if (e.status) return new v.HttpError(e.status, e.message);
  return new v.HttpError(502, e.message || 'Ошибка почты', { code: e.code });
}

r.get('/mail/status', (req, res) => res.json(mailStatus(req.user.id)));

r.post('/mail/connect', async (req, res) => {
  notDemo(req);
  const email = v.str(req.body.email, 'Адрес почты', { required: true, max: 200 }).toLowerCase();
  const domain = email.split('@')[1];
  if (!/^[^@\s]+@[^@\s]+$/.test(email) || !MAIL_DOMAINS.includes(domain)) {
    throw v.bad(`Подходит адрес Mail.ru: ${MAIL_DOMAINS.map((d) => '@' + d).join(', ')}`);
  }
  const pw = req.body.password;
  if (typeof pw !== 'string' || pw.length < 6 || pw.length > 200) throw v.bad('Введите пароль для внешнего приложения');
  const period = v.intIn(req.body.period_days, 'Период', 1, 60, 14);
  try { await verifyLogin(email, pw); } catch (e) { throw syncErr(e); }
  tx(() => {
    run(`INSERT INTO secrets(user_id,name,value_enc) VALUES(?,?,?) ON CONFLICT(user_id,name) DO UPDATE SET value_enc=excluded.value_enc`, req.user.id, 'mail_password', encrypt(pw));
    run(`INSERT INTO mail_accounts(user_id,email,period_days) VALUES(?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET email=excluded.email, period_days=excluded.period_days, last_sync_at=NULL, last_error=NULL`, req.user.id, email, period);
  });
  let result;
  try { result = await syncMail(req.user, req.settings); } catch (e) { throw syncErr(e); }
  res.json({ status: mailStatus(req.user.id), result });
});

r.post('/mail/sync', async (req, res) => {
  notDemo(req);
  let result;
  try { result = await syncMail(req.user, req.settings); } catch (e) { throw syncErr(e); }
  res.json({ status: mailStatus(req.user.id), result });
});

r.delete('/mail/connection', (req, res) => {
  const purge = req.query.purge === '1';
  tx(() => {
    run('DELETE FROM secrets WHERE user_id=? AND name=?', req.user.id, 'mail_password');
    run('DELETE FROM mail_accounts WHERE user_id=?', req.user.id);
    if (purge) run('DELETE FROM emails WHERE user_id=?', req.user.id);
  });
  res.json({ ok: true });
});

r.get('/mail/messages', (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const like = `%${q.replace(/[\\%_]/g, (c) => '\\' + c)}%`;
  const filter = q ? `AND (m.subject LIKE ? ESCAPE '\\' OR m.from_name LIKE ? ESCAPE '\\' OR m.from_addr LIKE ? ESCAPE '\\' OR m.body LIKE ? ESCAPE '\\')` : '';
  const rows = all(`SELECT m.id,m.from_name,m.from_addr,m.subject,m.date,
      substr(m.body,1,160) AS preview,
      (SELECT COUNT(*) FROM mail_suggestions s WHERE s.email_id=m.id AND s.status='pending') AS pending,
      (SELECT COUNT(*) FROM tasks t WHERE t.email_id=m.id) AS linked_tasks
    FROM emails m WHERE m.user_id=? ${filter} ORDER BY m.date DESC LIMIT 200`, req.user.id, ...(q ? [like, like, like, like] : []));
  res.json(rows);
});

r.get('/mail/messages/:id', (req, res) => {
  const m = get('SELECT * FROM emails WHERE id=? AND user_id=?', num(req.params.id), req.user.id);
  if (!m) throw new v.HttpError(404, 'Письмо не найдено');
  const suggestions = all('SELECT * FROM mail_suggestions WHERE email_id=? AND user_id=? ORDER BY id', m.id, req.user.id);
  const tasks = all('SELECT id,title,status FROM tasks WHERE email_id=? AND user_id=?', m.id, req.user.id);
  res.json({ ...m, attachments: JSON.parse(m.attachments), suggestions, tasks });
});

r.post('/mail/messages/:id/summary', (req, res) => {
  const m = get('SELECT subject,body FROM emails WHERE id=? AND user_id=?', num(req.params.id), req.user.id);
  if (!m) throw new v.HttpError(404, 'Письмо не найдено');
  res.json({ summary: localSummary(m.subject, m.body) });
});

r.post('/mail/suggestions/:id/accept', (req, res) => {
  const s = get('SELECT * FROM mail_suggestions WHERE id=? AND user_id=?', num(req.params.id), req.user.id);
  if (!s) throw new v.HttpError(404, 'Предложение не найдено');
  if (s.status !== 'pending') throw v.bad('Это предложение уже обработано');
  const b = req.body;
  const title = v.str(b.title ?? s.title, 'Название', { required: true, max: 200 });
  const date = v.dateOrNull(b.date ?? s.date, 'Дата');
  const time = v.timeOrNull(b.time ?? s.time, 'Время');
  let created;
  const exists = get('SELECT 1 FROM tasks WHERE user_id=? AND source_key=? UNION SELECT 1 FROM events WHERE user_id=? AND source_key=?', req.user.id, s.source_key, req.user.id, s.source_key);
  if (exists) { run(`UPDATE mail_suggestions SET status='accepted' WHERE id=?`, s.id); throw v.bad('По этому фрагменту письма уже создано дело'); }
  if (s.kind === 'event') {
    if (!date || !time) throw v.bad('Для события укажите дату и время', { need: ['date', 'time'] });
    const dur = v.intIn(b.duration_min, 'Длительность', 5, 1440, 60);
    created = tx(() => {
      const ev = S.createEvent(req.user.id, { title, description: `Из письма: «${s.snippet}»`, start: `${date}T${time}`, end: S.addMinutes(`${date}T${time}`, dur) }, { email_id: s.email_id, source_key: s.source_key });
      run(`UPDATE mail_suggestions SET status='accepted' WHERE id=?`, s.id);
      return ev;
    });
    return res.status(201).json({ kind: 'event', item: created, conflicts: S.findConflicts(req.user.id, created.start, created.end, created.id) });
  }
  if (!date && !b.no_date) throw v.bad('Укажите срок или отметьте «без срока»', { need: ['date'] });
  created = tx(() => {
    const t = S.createTask(req.user.id, {
      title, description: `Из письма: «${s.snippet}»`, due_date: date, due_time: time,
      category: b.category, priority: b.priority, duration_min: b.duration_min,
    }, { email_id: s.email_id, source_key: s.source_key });
    run(`UPDATE mail_suggestions SET status='accepted' WHERE id=?`, s.id);
    return t;
  });
  res.status(201).json({ kind: 'task', item: created });
});

r.post('/mail/suggestions/:id/dismiss', (req, res) => {
  const info = run(`UPDATE mail_suggestions SET status='dismissed' WHERE id=? AND user_id=? AND status='pending'`, num(req.params.id), req.user.id);
  if (!info.changes) throw new v.HttpError(404, 'Предложение не найдено');
  res.json({ ok: true });
});

// Связать существующую задачу с письмом (или снять связь)
r.put('/tasks/:id/email', requireAuth, (req, res) => {
  const id = num(req.params.id);
  if (!S.taskRow(req.user.id, id)) throw new v.HttpError(404, 'Задача не найдена');
  let emailId = null;
  if (req.body.email_id) {
    emailId = num(req.body.email_id);
    if (!get('SELECT 1 FROM emails WHERE id=? AND user_id=?', emailId, req.user.id)) throw new v.HttpError(404, 'Письмо не найдено');
  }
  run('UPDATE tasks SET email_id=? WHERE id=? AND user_id=?', emailId, id, req.user.id);
  res.json({ ok: true });
});

export default r;
