import { run, get } from './db.js';
import { addDays, todayLocal } from './dates.js';
import { DEFAULT_SETTINGS } from './config.js';

/** Демо-данные живут только в отдельной демо-учётной записи и не смешиваются с настоящими. */
export function seedDemo(uid) {
  for (const t of ['tasks', 'events', 'notes', 'chat_messages', 'proposals', 'emails', 'secrets']) run(`DELETE FROM ${t} WHERE user_id=?`, uid);
  run('DELETE FROM mail_accounts WHERE user_id=?', uid);
  run('UPDATE users SET settings=? WHERE id=?', JSON.stringify({ ...DEFAULT_SETTINGS, name: 'Гость', onboarded: true }), uid);
  const today = todayLocal(DEFAULT_SETTINGS.timezone);
  const d = (n) => addDays(today, n);
  const task = (title, category, priority, due, dur, status = 'planned', desc = '') =>
    Number(run('INSERT INTO tasks(user_id,title,description,category,priority,due_date,duration_min,status) VALUES(?,?,?,?,?,?,?,?)', uid, title, desc, category, priority, due, dur, status).lastInsertRowid);
  const t1 = task('Подготовить презентацию', 'study', 3, d(2), 180, 'in_progress', 'Слайды и краткий текст выступления');
  run('INSERT INTO tasks(user_id,parent_id,title,category,priority,duration_min) VALUES(?,?,?,?,?,?)', uid, t1, 'Собрать материалы', 'study', 2, 60);
  run('INSERT INTO tasks(user_id,parent_id,title,category,priority,duration_min,status) VALUES(?,?,?,?,?,?,?)', uid, t1, 'Сделать слайды', 'study', 2, 90, 'done');
  task('Отправить отчёт', 'work', 2, d(1), 45);
  task('Записаться к врачу', 'personal', 1, d(5), 15);
  task('Прочитать главу 4', 'study', 2, d(4), 90);
  const ev = (title, s, e, extra = {}) => run(`INSERT INTO events(user_id,title,start,"end",kind,task_id,recur) VALUES(?,?,?,?,?,?,?)`,
    uid, title, s, e, extra.kind || 'event', extra.task_id || null, extra.recur ? JSON.stringify(extra.recur) : null);
  ev('Лекция', `${d(-7)}T10:00`, `${d(-7)}T11:30`, { recur: { freq: 'weekly', interval: 1, byday: [0, 2] } });
  ev('Тренировка', `${d(0)}T18:30`, `${d(0)}T19:30`);
  ev('Работа над презентацией', `${d(1)}T14:00`, `${d(1)}T16:00`, { kind: 'work_block', task_id: t1 });
  run('INSERT INTO notes(user_id,title,body,pinned) VALUES(?,?,?,1)', uid, 'Идеи для доклада', 'Начать с примера из жизни.\nДобавить график роста.');
  run('INSERT INTO notes(user_id,title,body) VALUES(?,?,?)', uid, 'Список покупок', 'Молоко, хлеб, тетрадь');
}
export const isDemo = (user) => !!user.is_demo;
export { get };
