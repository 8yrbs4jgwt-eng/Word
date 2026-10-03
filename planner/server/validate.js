import { isValidDate, isValidDT, RE_TIME } from './dates.js';

export class HttpError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; }
}
export const bad = (msg, extra) => new HttpError(400, msg, extra);

export const CATEGORIES = ['study', 'work', 'personal'];
export const STATUSES = ['planned', 'in_progress', 'done'];

export function str(v, name, { max = 500, required = false, def = '' } = {}) {
  if (v === undefined || v === null) { if (required) throw bad(`Заполните поле «${name}»`); return def; }
  if (typeof v !== 'string') throw bad(`Поле «${name}» должно быть текстом`);
  const s = v.trim();
  if (required && !s) throw bad(`Заполните поле «${name}»`);
  if (s.length > max) throw bad(`Поле «${name}» слишком длинное (максимум ${max} символов)`);
  return s;
}
export function oneOf(v, list, name, def) {
  if (v === undefined || v === null || v === '') return def;
  if (!list.includes(v)) throw bad(`Недопустимое значение поля «${name}»`);
  return v;
}
export function intIn(v, name, min, max, def = null) {
  if (v === undefined || v === null || v === '') return def;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw bad(`Поле «${name}»: число от ${min} до ${max}`);
  return n;
}
export function dateOrNull(v, name) {
  if (v === undefined || v === null || v === '') return null;
  if (!isValidDate(v)) throw bad(`Поле «${name}»: неверная дата`);
  return v;
}
export function timeOrNull(v, name) {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string' || !RE_TIME.test(v)) throw bad(`Поле «${name}»: время в формате ЧЧ:ММ`);
  return v;
}
export function dt(v, name) {
  if (!isValidDT(v)) throw bad(`Поле «${name}»: неверные дата и время`);
  return v;
}
export function recurObj(v) {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'object') throw bad('Неверное правило повторения');
  const freq = oneOf(v.freq, ['daily', 'weekly', 'monthly'], 'повтор', null);
  if (!freq) throw bad('Неверное правило повторения');
  const r = { freq, interval: intIn(v.interval, 'интервал', 1, 52, 1) };
  if (freq === 'weekly' && Array.isArray(v.byday) && v.byday.length) {
    r.byday = [...new Set(v.byday.map((d) => intIn(d, 'день недели', 0, 6)))].sort();
  }
  if (v.until) r.until = dateOrNull(v.until, 'повторять до');
  return r;
}
