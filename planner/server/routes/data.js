import { Router } from 'express';
import { all, get, run } from '../db.js';
import { requireAuth } from '../auth.js';
import * as v from '../validate.js';
import * as S from '../store.js';
import { todayLocal, addDays, isValidDate, diffMinutes } from '../dates.js';

const r = Router();
r.use(requireAuth);
const id = (req) => { const n = Number(req.params.id); if (!Number.isInteger(n)) throw v.bad('Неверный идентификатор'); return n; };

// ---------- Задачи ----------
r.get('/tasks', (req, res) => {
  const rows = all(`SELECT t.*, m.subject AS email_subject,
      (SELECT COALESCE(SUM((julianday(e."end")-julianday(e.start))*1440),0) FROM events e WHERE e.task_id=t.id AND e.kind='work_block' AND e.recur IS NULL) AS scheduled_min
    FROM tasks t LEFT JOIN emails m ON m.id=t.email_id WHERE t.user_id=? ORDER BY t.id`, req.user.id);
  res.json(rows.map((t) => ({ ...t, scheduled_min: Math.round(t.scheduled_min) })));
});
r.post('/tasks', (req, res) => res.status(201).json(S.createTask(req.user.id, req.body)));
r.patch('/tasks/:id', (req, res) => res.json(S.updateTask(req.user.id, id(req), req.body)));
r.delete('/tasks/:id', (req, res) => { S.deleteTask(req.user.id, id(req)); res.json({ ok: true }); });

// ---------- События ----------
r.get('/events', (req, res) => {
  const { from, to } = req.query;
  if (!isValidDate(from) || !isValidDate(to)) throw v.bad('Укажите from и to (ГГГГ-ММ-ДД)');
  if (from > to || diffMinutes(`${from}T00:00`, `${to}T00:00`) > 400 * 1440) throw v.bad('Слишком большой период');
  res.json(S.listEvents(req.user.id, from, to));
});
r.get('/events/conflicts', (req, res) => {
  const start = v.dt(req.query.start, 'start'), end = v.dt(req.query.end, 'end');
  const ex = req.query.exclude ? Number(req.query.exclude) : null;
  res.json(S.findConflicts(req.user.id, start, end, ex));
});
r.post('/events', (req, res) => {
  const ev = S.createEvent(req.user.id, req.body);
  const conflicts = ev.all_day ? [] : S.findConflicts(req.user.id, ev.start, ev.end, ev.id);
  res.status(201).json({ event: ev, conflicts });
});
r.patch('/events/:id', (req, res) => {
  const ev = S.updateEvent(req.user.id, id(req), req.body);
  const conflicts = ev.all_day ? [] : S.findConflicts(req.user.id, ev.start, ev.end, ev.id);
  res.json({ event: ev, conflicts });
});
r.delete('/events/:id', (req, res) => { S.deleteEvent(req.user.id, id(req)); res.json({ ok: true }); });

// Пропустить одно повторение серии
r.post('/events/:id/skip', (req, res) => {
  const ev = S.eventRow(req.user.id, id(req));
  if (!ev || !ev.recur) throw v.bad('Это не повторяющееся событие');
  const date = req.body.date;
  if (!isValidDate(date)) throw v.bad('Неверная дата');
  const ex = JSON.parse(ev.exdates); if (!ex.includes(date)) ex.push(date);
  run('UPDATE events SET exdates=? WHERE id=? AND user_id=?', JSON.stringify(ex), ev.id, req.user.id);
  res.json({ ok: true });
});
// Изменить только одно повторение: пропускаем его в серии и создаём отдельное событие
r.post('/events/:id/detach', (req, res) => {
  const ev = S.eventRow(req.user.id, id(req));
  if (!ev || !ev.recur) throw v.bad('Это не повторяющееся событие');
  const date = req.body.date;
  if (!isValidDate(date)) throw v.bad('Неверная дата');
  const single = S.createEvent(req.user.id, { ...req.body, recur: null, kind: ev.kind, task_id: ev.task_id });
  const ex = JSON.parse(ev.exdates); if (!ex.includes(date)) ex.push(date);
  run('UPDATE events SET exdates=? WHERE id=? AND user_id=?', JSON.stringify(ex), ev.id, req.user.id);
  const conflicts = single.all_day ? [] : S.findConflicts(req.user.id, single.start, single.end, single.id);
  res.status(201).json({ event: single, conflicts });
});

// ---------- Заметки ----------
r.get('/notes', (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const esc = q.replace(/[\\%_]/g, (c) => '\\' + c);
  const rows = q
    ? all(`SELECT * FROM notes WHERE user_id=? AND (title LIKE ? ESCAPE '\\' OR body LIKE ? ESCAPE '\\') ORDER BY pinned DESC, updated_at DESC`, req.user.id, `%${esc}%`, `%${esc}%`)
    : all('SELECT * FROM notes WHERE user_id=? ORDER BY pinned DESC, updated_at DESC', req.user.id);
  res.json(rows);
});
function noteFields(b, base = {}) {
  const n = { ...base };
  if (b.title !== undefined) n.title = v.str(b.title, 'Заголовок', { max: 200 });
  if (b.body !== undefined) n.body = v.str(b.body, 'Текст', { max: 50000 });
  if (b.pinned !== undefined) n.pinned = b.pinned ? 1 : 0;
  if (!n.title && !n.body) throw v.bad('Заметка пуста');
  return n;
}
r.post('/notes', (req, res) => {
  const n = noteFields(req.body, { title: '', body: '', pinned: 0 });
  const i = run('INSERT INTO notes(user_id,title,body,pinned) VALUES(?,?,?,?)', req.user.id, n.title, n.body, n.pinned);
  res.status(201).json(get('SELECT * FROM notes WHERE id=?', i.lastInsertRowid));
});
r.patch('/notes/:id', (req, res) => {
  const old = get('SELECT * FROM notes WHERE id=? AND user_id=?', id(req), req.user.id);
  if (!old) throw new v.HttpError(404, 'Заметка не найдена');
  const n = noteFields(req.body, old);
  run(`UPDATE notes SET title=?,body=?,pinned=?,updated_at=datetime('now') WHERE id=? AND user_id=?`, n.title, n.body, n.pinned, old.id, req.user.id);
  res.json(get('SELECT * FROM notes WHERE id=?', old.id));
});
r.delete('/notes/:id', (req, res) => {
  const info = run('DELETE FROM notes WHERE id=? AND user_id=?', id(req), req.user.id);
  if (!info.changes) throw new v.HttpError(404, 'Заметка не найдена');
  res.json({ ok: true });
});

// ---------- Мой день ----------
r.get('/today', (req, res) => {
  const uid = req.user.id, tz = req.settings.timezone;
  const today = todayLocal(tz);
  const open = all(`SELECT * FROM tasks WHERE user_id=? AND status!='done' AND parent_id IS NULL`, uid);
  const score = (t) => {
    const late = t.due_date && t.due_date < today ? 1000 : 0;
    const soon = t.due_date ? Math.max(0, 30 - Math.max(0, Math.round((Date.parse(t.due_date) - Date.parse(today)) / 864e5))) : 0;
    return late + soon * 10 + t.priority * 25 + (t.status === 'in_progress' ? 15 : 0);
  };
  const top3 = [...open].sort((a, b) => score(b) - score(a)).slice(0, 3);
  const deadlines = all(`SELECT id,title,category,priority,due_date,due_time,status FROM tasks
    WHERE user_id=? AND status!='done' AND due_date IS NOT NULL AND due_date<=? ORDER BY due_date, due_time`, uid, addDays(today, 7));
  const events = S.listEvents(uid, today, today);
  const mail = all(`SELECT m.id,m.subject,m.from_name,m.from_addr,m.date,
      (SELECT COUNT(*) FROM mail_suggestions s WHERE s.email_id=m.id AND s.status='pending') AS pending
    FROM emails m WHERE m.user_id=? ORDER BY (pending>0) DESC, m.date DESC LIMIT 5`, uid);
  res.json({ today, top3, deadlines, events, mail });
});

// ---------- Экспорт ----------
const csvCell = (x) => { let s = x == null ? '' : String(x); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
const toCsv = (rows, cols) => '﻿' + [cols.join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\r\n');
r.get('/export', (req, res) => {
  const uid = req.user.id;
  const tasks = all('SELECT id,parent_id,title,description,category,status,priority,due_date,due_time,duration_min,created_at,completed_at FROM tasks WHERE user_id=? ORDER BY id', uid);
  const events = all('SELECT id,title,description,start,"end",all_day,kind,task_id,recur,exdates FROM events WHERE user_id=? ORDER BY start', uid);
  const notes = all('SELECT id,title,body,pinned,created_at,updated_at FROM notes WHERE user_id=? ORDER BY id', uid);
  const { type = 'all', format = 'json' } = req.query;
  if (format === 'csv') {
    const sets = {
      tasks: [tasks, ['id', 'parent_id', 'title', 'description', 'category', 'status', 'priority', 'due_date', 'due_time', 'duration_min', 'created_at', 'completed_at']],
      events: [events, ['id', 'title', 'description', 'start', 'end', 'all_day', 'kind', 'task_id', 'recur', 'exdates']],
      notes: [notes, ['id', 'title', 'body', 'pinned', 'created_at', 'updated_at']],
    };
    if (!sets[type]) throw v.bad('Для CSV выберите tasks, events или notes');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${type}.csv"`);
    return res.send(toCsv(...sets[type]));
  }
  res.setHeader('Content-Disposition', 'attachment; filename="planner-export.json"');
  res.json({ exported_at: new Date().toISOString(), tasks, events, notes });
});

export default r;
