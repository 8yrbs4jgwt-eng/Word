/**
 * Работа с датами без сторонних библиотек.
 * «Дата» — строка YYYY-MM-DD, «время» — HH:mm. Часовой пояс — IANA-имя.
 */
export const DEFAULT_TZ = "Europe/Moscow";
export const SPBU_TZ = "Europe/Moscow";

export const isYmd = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
export const isHm = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

const utc = (ymd: string) => new Date(`${ymd}T00:00:00Z`);
const fmt = (d: Date) => d.toISOString().slice(0, 10);

export function addDays(ymd: string, n: number): string {
  const d = utc(ymd);
  d.setUTCDate(d.getUTCDate() + n);
  return fmt(d);
}

export function addMonths(ymd: string, n: number): string {
  const d = utc(ymd);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return fmt(d);
}

/** 0 = понедельник … 6 = воскресенье */
export const weekdayOf = (ymd: string) => (utc(ymd).getUTCDay() + 6) % 7;
export const mondayOf = (ymd: string) => addDays(ymd, -weekdayOf(ymd));
export const diffDays = (a: string, b: string) => Math.round((utc(b).getTime() - utc(a).getTime()) / 86400000);
export const monthStart = (ymd: string) => `${ymd.slice(0, 7)}-01`;

/** Сетка месяца: 6 недель, начиная с понедельника. */
export function monthGrid(ymd: string): string[] {
  const start = mondayOf(monthStart(ymd));
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export const weekDays = (ymd: string): string[] => {
  const m = mondayOf(ymd);
  return Array.from({ length: 7 }, (_, i) => addDays(m, i));
};

const dtfCache = new Map<string, Intl.DateTimeFormat>();
function dtf(tz: string) {
  let f = dtfCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    dtfCache.set(tz, f);
  }
  return f;
}

export function isValidTz(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("ru-RU", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Момент (мс UTC) → дата и время в поясе tz. */
export function fromInstant(ms: number, tz: string): { date: string; time: string } {
  const p = Object.fromEntries(dtf(tz).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

/** Дата+время в поясе tz → момент (мс UTC). Для неоднозначных/несуществующих времён берёт ближайшее. */
export function toInstant(date: string, time: string, tz: string): number {
  const guess = Date.parse(`${date}T${time}:00Z`);
  let ms = guess;
  for (let i = 0; i < 3; i++) {
    const w = fromInstant(ms, tz);
    const diff = Date.parse(`${w.date}T${w.time}:00Z`) - guess;
    if (diff === 0) break;
    ms -= diff;
  }
  return ms;
}

/** Перевод «настенного» времени из одного пояса в другой. */
export function convertWall(date: string, time: string, from: string, to: string) {
  if (from === to) return { date, time };
  return fromInstant(toInstant(date, time, from), to);
}

export const todayIn = (tz: string, now = Date.now()) => fromInstant(now, tz).date;
export const nowMinutesIn = (tz: string, now = Date.now()) => hmToMin(fromInstant(now, tz).time);
export const hmToMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
export const minToHm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

// ---------- форматирование (ru-RU) ----------
const L = "ru-RU";
const at = (ymd: string) => utc(ymd);
const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(L, { timeZone: "UTC", ...o });

export const fmtLong = (ymd: string) => f({ weekday: "long", day: "numeric", month: "long" }).format(at(ymd));
export const fmtShort = (ymd: string) => f({ day: "numeric", month: "short" }).format(at(ymd)).replace(".", "");
export const fmtWeekdayShort = (ymd: string) => f({ weekday: "short" }).format(at(ymd));
export const fmtMonthYear = (ymd: string) => f({ month: "long", year: "numeric" }).format(at(ymd));
export const fmtDayMonth = (ymd: string) => f({ day: "numeric", month: "long" }).format(at(ymd));

export function fmtRange(a: string, b: string): string {
  const same = a.slice(0, 7) === b.slice(0, 7);
  const dA = f(same ? { day: "numeric" } : { day: "numeric", month: "short" }).format(at(a)).replace(".", "");
  const dB = f({ day: "numeric", month: "long" }).format(at(b));
  return `${dA} – ${dB}`;
}
