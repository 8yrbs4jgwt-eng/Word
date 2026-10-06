import type { Entry } from "@/lib/entries";
import { addDays, addMonths, diffDays, mondayOf, weekdayOf } from "@/lib/time";

const MAX_OCCURRENCES = 1000;

/**
 * Даты вхождений записи (в её собственном поясе) в окне [from, to].
 * Для неповторяющейся записи — одна дата, если попала в окно.
 */
export function occurrences(e: Pick<Entry, "date" | "repeat">, from: string, to: string): string[] {
  const r = e.repeat;
  if (!r) return e.date >= from && e.date <= to ? [e.date] : [];

  const end = r.until && r.until < to ? r.until : to;
  if (e.date > end) return [];
  const out: string[] = [];
  const push = (d: string) => {
    if (d >= from && d <= end && d >= e.date) out.push(d);
  };

  if (r.freq === "daily") {
    const skip = from > e.date ? Math.floor(diffDays(e.date, from) / r.interval) : 0;
    for (let d = addDays(e.date, skip * r.interval), n = 0; d <= end && n < MAX_OCCURRENCES; d = addDays(d, r.interval), n++) push(d);
  } else if (r.freq === "weekly") {
    const days = r.weekdays?.length ? [...new Set(r.weekdays)].sort((a, b) => a - b) : [weekdayOf(e.date)];
    const startMonday = mondayOf(e.date);
    const weeksFromStart = from > e.date ? Math.floor(diffDays(startMonday, from) / 7 / r.interval) : 0;
    let monday = addDays(startMonday, weeksFromStart * r.interval * 7);
    for (let n = 0; monday <= end && n < MAX_OCCURRENCES; monday = addDays(monday, r.interval * 7), n++) {
      for (const wd of days) push(addDays(monday, wd));
    }
  } else {
    // monthly: тот же день месяца, при его отсутствии — последний день месяца
    const anchorDay = Number(e.date.slice(8, 10));
    for (let i = 0; i < MAX_OCCURRENCES; i++) {
      const ym = addMonths(`${e.date.slice(0, 7)}-01`, i * r.interval).slice(0, 7);
      const d = safeDay(ym, anchorDay);
      if (d > end) break;
      push(d);
    }
  }
  return out;
}

function safeDay(ym: string, day: number): string {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${ym}-${String(Math.min(day, last)).padStart(2, "0")}`;
}
