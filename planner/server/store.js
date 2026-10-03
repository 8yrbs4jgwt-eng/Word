// Общие операции с задачами и событиями: используются и обычным интерфейсом, и применением планов ИИ.
import { all, get, run } from './db.js';
import * as v from './validate.js';
import { expandEvent } from './recurrence.js';
import { addDays, addMinutes, diffMinutes } from './dates.js';

export const taskRow = (uid, id) => get('SELECT * FROM tasks WHERE id=? AND user_id=?', id, uid);
export const eventRow = (uid, id) => get('SELECT * FROM events WHERE id=? AND user_id=?', id, uid);

export function parseTask(b, base = {}) {
  const has = (k) => b[k] !== undefined;
  const out = { ...base };
  if (has('title') || !base.id) out.title = v.str(b.title, 'Название', { required: true, max: 200 });
  if (has('description')) out.description = v.str(b.description, 'Описание', { max: 5000 });
  if (has('category')) out.category = v.oneOf(b.category, v.CATEGORIES, 'Категория', 'personal');
  if (has('status')) out.status = v.oneOf(b.status, v.STATUSES, 'Статус', 'planned');
  if (has('priority')) out.priority = v.intIn(b.priority, 'Приоритет', 1, 3, 2);
  if (has('due_date')) out.due_date = v.dateOrNull(b.due_date, 'Срок');
  if (has('due_time')) out.due_time = v.timeOrNull(b.due_time, 'Время срока');
  if (has('duration_min')) out.duration_min = v.intIn(b.duration_min, 'Длительность', 5, 1440);
  if (out.due_time && !out.due_date) out.due_time = null;
  return out;
}

export function createTask(uid, b, extra = {}) {
  const t = parseTask(b, {});
  let parent = null;
  if (b.parent_id) {
    parent = taskRow(uid, b.parent_id);
    if (!parent) throw v.bad('Основная задача не найдена');
    if (parent.parent_id) throw v.bad('Подзадачи не могут иметь свои подзадачи');
  }
  const r = run(
    `INSERT INTO tasks(user_id,parent_id,title,description,category,status,priority,due_date,due_time,duration_min,email_id,source_key,completed_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    uid, parent?.id ?? null, t.title, t.description ?? '', t.category ?? parent?.category ?? 'personal', t.status ?? 'planned',
    t.priority ?? 2, t.due_date ?? null, t.due_time ?? null, t.duration_min ?? null,
    extra.email_id ?? null, extra.source_key ?? null, (t.status === 'done') ? new Date().toISOString() : null);
  return taskRow(uid, r.lastInsertRowid);
}

export function updateTask(uid, id, b) {
  const old = taskRow(uid, id);
  if (!old) throw new v.HttpError(404, 'Задача не найдена');
  const t = parseTask(b, old);
  let completed = old.completed_at;
  if (t.status === 'done' && old.status !== 'done') completed = new Date().toISOString();
  if (t.status !== 'done') completed = null;
  run(`UPDATE tasks SET title=?,description=?,category=?,status=?,priority=?,due_date=?,due_time=?,duration_min=?,completed_at=? WHERE id=? AND user_id=?`,
    t.title, t.description, t.category, t.status, t.priority, t.due_date, t.due_time, t.duration_min, completed, id, uid);
  return taskRow(uid, id);
}

export function deleteTask(uid, id) {
  if (!taskRow(uid, id)) throw new v.HttpError(404, 'Задача не найдена');
  run('DELETE FROM tasks WHERE id=? AND user_id=?', id, uid); // подзадачи и рабочие блоки удаляются каскадом
}

export function parseEvent(uid, b, base = {}) {
  const has = (k) => b[k] !== undefined;
  const out = { ...base };
  if (has('title') || !base.id) out.title = v.str(b.title, 'Название', { required: true, max: 200 });
  if (has('description')) out.description = v.str(b.description, 'Описание', { max: 5000 });
  if (has('all_day')) out.all_day = b.all_day ? 1 : 0;
  if (has('start') || !base.id) out.start = v.dt(b.start, 'Начало');
  if (has('end') || !base.id) out.end = v.dt(b.end, 'Окончание');
  if (has('kind')) out.kind = v.oneOf(b.kind, ['event', 'work_block'], 'Тип', 'event');
  if (has('task_id')) {
    if (b.task_id) {
      if (!taskRow(uid, b.task_id)) throw v.bad('Задача для блока не найдена');
      out.task_id = Number(b.task_id);
    } else out.task_id = null;
  }
  if (has('recur')) out.recur = v.recurObj(b.recur);
  else if (typeof out.recur === 'string') out.recur = JSON.parse(out.recur);
  if (out.end <= out.start) throw v.bad('Окончание должно быть позже начала');
  if (diffMinutes(out.start, out.end) > 14 * 1440) throw v.bad('Событие не может быть длиннее 14 дней');
  if (out.kind === 'work_block' && !out.task_id) throw v.bad('Блок работы должен быть связан с задачей');
  return out;
}

export function createEvent(uid, b, extra = {}) {
  const e = parseEvent(uid, b);
  const r = run(`INSERT INTO events(user_id,title,description,start,"end",all_day,kind,task_id,recur,email_id,source_key)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
    uid, e.title, e.description ?? '', e.start, e.end, e.all_day ?? 0, e.kind ?? 'event', e.task_id ?? null,
    e.recur ? JSON.stringify(e.recur) : null, extra.email_id ?? null, extra.source_key ?? null);
  return eventRow(uid, r.lastInsertRowid);
}

export function updateEvent(uid, id, b) {
  const old = eventRow(uid, id);
  if (!old) throw new v.HttpError(404, 'Событие не найдено');
  const e = parseEvent(uid, b, old);
  run(`UPDATE events SET title=?,description=?,start=?,"end"=?,all_day=?,kind=?,task_id=?,recur=? WHERE id=? AND user_id=?`,
    e.title, e.description, e.start, e.end, e.all_day, e.kind, e.task_id ?? null, e.recur ? JSON.stringify(e.recur) : null, id, uid);
  return eventRow(uid, id);
}

export function deleteEvent(uid, id) {
  if (!eventRow(uid, id)) throw new v.HttpError(404, 'Событие не найдено');
  run('DELETE FROM events WHERE id=? AND user_id=?', id, uid);
}

export function listEvents(uid, from, to) {
  // Берём все повторяющиеся и обычные события, потенциально попадающие в диапазон.
  const rows = all(`SELECT e.*, t.title AS task_title FROM events e LEFT JOIN tasks t ON t.id=e.task_id
    WHERE e.user_id=? AND (e.recur IS NOT NULL OR (e.start < ? AND e."end" > ?))`, uid, `${addDays(to, 1)}T00:00`, `${from}T00:00`);
  return rows.flatMap((r) => expandEvent(r, from, to))
    .sort((a, b) => a.start.localeCompare(b.start) || a.id - b.id);
}

/** Пересечения по времени для интервала [start, end). Событие «на весь день» не считается занятым временем. */
export function findConflicts(uid, start, end, excludeId = null) {
  const from = start.slice(0, 10), to = end.slice(0, 10);
  return listEvents(uid, from, to)
    .filter((e) => !e.all_day && e.id !== excludeId && e.start < end && e.end > start)
    .map((e) => ({ id: e.id, title: e.title, start: e.start, end: e.end, kind: e.kind }));
}

export { addMinutes };
