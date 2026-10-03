// Все даты и время в приложении хранятся как «настенное» локальное время пользователя
// (строки вида 2026-10-03T14:00). Часовой пояс пользователя хранится в настройках.
const DAY = 86400000;
export const RE_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const RE_DT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
export const RE_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const utc = (s) => {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  const [hh, mm] = s.length > 10 ? s.slice(11, 16).split(':').map(Number) : [0, 0];
  return Date.UTC(y, m - 1, d, hh, mm);
};
const fmtDate = (t) => new Date(t).toISOString().slice(0, 10);
const fmtDT = (t) => new Date(t).toISOString().slice(0, 16);

export function isValidDate(s) {
  if (typeof s !== 'string' || !RE_DATE.test(s)) return false;
  const t = utc(s);
  return !Number.isNaN(t) && fmtDate(t) === s;
}
export function isValidDT(s) {
  return typeof s === 'string' && RE_DT.test(s) && isValidDate(s.slice(0, 10)) && RE_TIME.test(s.slice(11, 16));
}
export function isValidTz(tz) {
  try { new Intl.DateTimeFormat('ru', { timeZone: tz }); return true; } catch { return false; }
}
export function nowLocal(tz = 'Europe/Moscow') {
  const s = new Intl.DateTimeFormat('sv-SE', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date());
  return s.replace(' ', 'T');
}
export const todayLocal = (tz) => nowLocal(tz).slice(0, 10);
export const addDays = (date, n) => fmtDate(utc(date) + n * DAY);
export const addMinutes = (dt, n) => fmtDT(utc(dt) + n * 60000);
export const diffMinutes = (a, b) => Math.round((utc(b) - utc(a)) / 60000);
export const diffDays = (a, b) => Math.round((utc(b) - utc(a)) / DAY);
/** День недели, понедельник = 0 */
export const dow = (date) => (new Date(utc(date)).getUTCDay() + 6) % 7;
export const mondayOf = (date) => addDays(date, -dow(date));
export const monthIndex = (date) => Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1;
export const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
