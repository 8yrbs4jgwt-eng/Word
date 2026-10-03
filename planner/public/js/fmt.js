import { state } from './state.js';

export const CATS = { study: 'Учёба', work: 'Работа', personal: 'Личное' };
export const STATUSES = { planned: 'Запланировано', in_progress: 'В работе', done: 'Выполнено' };
export const PRIOS = { 1: 'Низкий', 2: 'Средний', 3: 'Высокий' };
const tz = () => state.settings?.timezone || 'Europe/Moscow';

export function todayStr() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: tz(), year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
export function nowMinutes() {
  const p = new Intl.DateTimeFormat('sv-SE', { timeZone: tz(), hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
  return Number(p.slice(0, 2)) * 60 + Number(p.slice(3, 5));
}
const ms = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10), +(s.slice(11, 13) || 0), +(s.slice(14, 16) || 0));
export const addDays = (d, n) => new Date(ms(d) + n * 864e5).toISOString().slice(0, 10);
export const diffDays = (a, b) => Math.round((ms(b) - ms(a)) / 864e5);
export const addMin = (dt, n) => new Date(ms(dt) + n * 6e4).toISOString().slice(0, 16);
export const minutesBetween = (a, b) => Math.round((ms(b) - ms(a)) / 6e4);
export const dow = (d) => (new Date(ms(d)).getUTCDay() + 6) % 7;
export const mondayOf = (d) => addDays(d, -dow(d));
const f = (opts) => new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', ...opts });
const dtf = {};
const fmt = (key, opts) => (dtf[key] ||= f(opts));
export const fmtLong = (d) => fmt('long', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(ms(d)));
export const fmtMonth = (d) => fmt('month', { month: 'long', year: 'numeric' }).format(new Date(ms(d)));
export const fmtShort = (d) => fmt('short', { day: 'numeric', month: 'short' }).format(new Date(ms(d)));
export const fmtWd = (d) => fmt('wd', { weekday: 'short' }).format(new Date(ms(d)));
export const timeOf = (dt) => dt.slice(11, 16);
export function dueLabel(t) {
  if (!t.due_date) return 'без срока';
  const today = todayStr(); const diff = diffDays(today, t.due_date);
  let s = diff === 0 ? 'сегодня' : diff === 1 ? 'завтра' : diff === -1 ? 'вчера' : fmtShort(t.due_date);
  if (t.due_time) s += ' ' + t.due_time;
  return s;
}
export const isLate = (t) => t.status !== 'done' && t.due_date && t.due_date < todayStr();
export function fmtDur(min) { if (!min) return ''; const h = Math.floor(min / 60), m = min % 60; return (h ? `${h} ч` : '') + (h && m ? ' ' : '') + (m ? `${m} мин` : ''); }
export function fmtStamp(iso) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('ru-RU', { timeZone: tz(), day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}
export const fmtMailDate = (iso) => new Intl.DateTimeFormat('ru-RU', { timeZone: tz(), day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
export const pluralRu = (n, one, few, many) => { const a = n % 10, b = n % 100; return b > 10 && b < 20 ? many : a === 1 ? one : a >= 2 && a <= 4 ? few : many; };
