import test from 'node:test';
import assert from 'node:assert/strict';
import { client, newUser } from './helpers.js';
import { expandEvent } from '../server/recurrence.js';

test('вход: без сессии доступа нет, чужие данные не видны', async () => {
  const anon = client();
  assert.equal((await anon.get('/tasks')).status, 401);
  const a = await newUser('a@example.com');
  const t = (await a.post('/tasks', { title: 'Секрет А' })).body;
  assert.equal((await a.get('/tasks')).body.length, 1);
  // второй пользователь (регистрация включена в тесте)
  const b = await newUser('b@example.com');
  assert.deepEqual((await b.get('/tasks')).body, []);
  assert.equal((await b.patch(`/tasks/${t.id}`, { title: 'взлом' })).status, 404);
  assert.equal((await b.del(`/tasks/${t.id}`)).status, 404);
  const n = (await a.post('/notes', { title: 'з', body: 'тест' })).body;
  assert.equal((await b.patch(`/notes/${n.id}`, { title: 'x' })).status, 404);
  assert.equal((await b.get('/mail/messages/1')).status, 404);
  assert.equal((await b.post('/ai/proposals/1/apply')).status, 404);
  // CSRF: запрос без заголовка отклоняется
  assert.equal((await a.raw('POST', '/tasks', { title: 'x' }, { 'x-requested-with': '' })).status, 403);
  // неверный пароль
  assert.equal((await client().post('/auth/login', { email: 'a@example.com', password: 'wrong-password' })).status, 401);
  assert.equal((await client().post('/auth/login', { email: 'a@example.com', password: 'correct-horse-battery' })).status, 200);
});

test('задачи: создание, правка, завершение, подзадачи, фильтрация данных', async () => {
  const c = await newUser('t1@example.com');
  const t = (await c.post('/tasks', { title: 'Доклад', category: 'study', priority: 3, due_date: '2026-10-10', duration_min: 120 })).body;
  assert.equal(t.status, 'planned');
  const sub = (await c.post('/tasks', { title: 'Шаг 1', parent_id: t.id })).body;
  assert.equal(sub.category, 'study');
  const done = (await c.patch(`/tasks/${t.id}`, { status: 'done' })).body;
  assert.equal(done.status, 'done'); assert.ok(done.completed_at);
  assert.equal((await c.patch(`/tasks/${t.id}`, { status: 'planned' })).body.completed_at, null);
  assert.equal((await c.post('/tasks', { title: '' })).status, 400);
  assert.equal((await c.post('/tasks', { title: 'x', due_date: '2026-13-40' })).status, 400);
  assert.equal((await c.post('/tasks', { title: 'x', parent_id: sub.id })).status, 400);
  await c.del(`/tasks/${t.id}`);
  assert.equal((await c.get('/tasks')).body.length, 0); // подзадачи удалены каскадом
});

test('события: время, повторы, пересечения, пропуск повторения', async () => {
  const c = await newUser('e1@example.com');
  const lec = (await c.post('/events', { title: 'Лекция', start: '2026-10-05T10:00', end: '2026-10-05T11:30', recur: { freq: 'weekly', interval: 1, byday: [0, 2] } })).body.event;
  const list = (await c.get('/events?from=2026-10-05&to=2026-10-18')).body.filter((e) => e.id === lec.id);
  assert.deepEqual(list.map((e) => e.start), ['2026-10-05T10:00', '2026-10-07T10:00', '2026-10-12T10:00', '2026-10-14T10:00']);
  assert.equal(list[0].end, '2026-10-05T11:30');
  const meet = (await c.post('/events', { title: 'Встреча', start: '2026-10-07T11:00', end: '2026-10-07T12:00' })).body;
  assert.equal(meet.conflicts.length, 1); assert.equal(meet.conflicts[0].title, 'Лекция');
  const touch = (await c.post('/events', { title: 'Сразу после', start: '2026-10-07T11:30', end: '2026-10-07T12:00' })).body;
  assert.ok(!touch.conflicts.some((x) => x.title === 'Лекция'), 'касание границ — не пересечение');
  assert.equal((await c.post('/events', { title: 'X', start: '2026-10-07T12:00', end: '2026-10-07T11:00' })).status, 400);
  assert.equal((await c.get('/events/conflicts?start=2026-10-12T10:30&end=2026-10-12T11:00')).body.length, 1);
  await c.post(`/events/${lec.id}/skip`, { date: '2026-10-07' });
  const after = (await c.get('/events?from=2026-10-05&to=2026-10-18')).body.filter((e) => e.id === lec.id);
  assert.equal(after.length, 3);
  const det = await c.post(`/events/${lec.id}/detach`, { date: '2026-10-12', title: 'Лекция (перенос)', start: '2026-10-12T15:00', end: '2026-10-12T16:30' });
  assert.equal(det.status, 201);
  const all = (await c.get('/events?from=2026-10-12&to=2026-10-12')).body;
  assert.deepEqual(all.map((e) => e.title), ['Лекция (перенос)']);
  // блок работы связан с задачей, крайний срок — отдельно
  const task = (await c.post('/tasks', { title: 'Курсовая', due_date: '2026-10-20' })).body;
  await c.post('/events', { title: 'Работа над курсовой', kind: 'work_block', task_id: task.id, start: '2026-10-08T09:00', end: '2026-10-08T11:00' });
  const tl = (await c.get('/tasks')).body.find((x) => x.id === task.id);
  assert.equal(tl.scheduled_min, 120); assert.equal(tl.due_date, '2026-10-20');
  assert.equal((await c.post('/events', { title: 'bad', kind: 'work_block', start: '2026-10-08T09:00', end: '2026-10-08T10:00' })).status, 400);
});

test('повторения: ежемесячно и ежедневно, until, ночные события', () => {
  const m = { start: '2026-01-31T09:00', end: '2026-01-31T10:00', recur: { freq: 'monthly', interval: 1 }, exdates: '[]' };
  assert.deepEqual(expandEvent(m, '2026-01-01', '2026-04-30').map((e) => e.start.slice(0, 10)), ['2026-01-31', '2026-03-31']);
  const d = { start: '2026-10-01T22:00', end: '2026-10-02T01:00', recur: { freq: 'daily', interval: 2, until: '2026-10-07' }, exdates: '[]' };
  assert.deepEqual(expandEvent(d, '2026-10-02', '2026-10-10').map((e) => e.start), ['2026-10-01T22:00', '2026-10-03T22:00', '2026-10-05T22:00', '2026-10-07T22:00']);
  assert.equal(expandEvent(d, '2026-10-02', '2026-10-02').length, 1); // ночь с 1 на 2 октября видна во 2-м
});

test('заметки и экспорт', async () => {
  const c = await newUser('n1@example.com');
  const n1 = (await c.post('/notes', { title: 'Идея', body: 'про 100% успех' })).body;
  await c.post('/notes', { title: 'Другое', body: 'текст' });
  await c.patch(`/notes/${n1.id}`, { pinned: true });
  const list = (await c.get('/notes')).body;
  assert.equal(list[0].id, n1.id);
  assert.equal((await c.get('/notes?q=' + encodeURIComponent('100%'))).body.length, 1);
  assert.equal((await c.get('/notes?q=' + encodeURIComponent('%'))).body.length, 1);
  await c.post('/tasks', { title: '=HYPERLINK("x")' });
  const csv = (await c.get('/export?type=tasks&format=csv')).text;
  assert.ok(csv.includes(`"'=HYPERLINK`), 'защита от формул в CSV');
  const j = (await c.get('/export')).body;
  assert.equal(j.notes.length, 2); assert.equal(j.tasks.length, 1);
});

test('деморежим отделён от настоящих данных', async () => {
  const real = await newUser('real@example.com');
  await real.post('/tasks', { title: 'Моя настоящая' });
  const demo = client();
  assert.equal((await demo.post('/auth/demo')).status, 200);
  const dt = (await demo.get('/tasks')).body;
  assert.ok(dt.length > 0 && !dt.some((t) => t.title === 'Моя настоящая'));
  assert.equal((await demo.get('/me')).body.is_demo, true);
  assert.equal((await demo.post('/mail/connect', { email: 'x@mail.ru', password: 'abcdefgh' })).status, 403);
  assert.ok(!(await real.get('/tasks')).body.some((t) => t.title === 'Подготовить презентацию'));
});
