import type { Entry } from "@/lib/entries";
import { occurrences } from "@/lib/recurrence";
import type { ClassEvent } from "@/lib/spbu/types";
import { SPBU_TZ, addDays, convertWall, hmToMin } from "@/lib/time";

export type ItemKind = "class" | "deadline" | "note";

/** Единый элемент календаря. Все даты/время — в поясе пользователя. */
export type Item = {
  key: string;
  kind: ItemKind;
  title: string;
  date: string;
  /** минуты от полуночи; null — без времени */
  start: number | null;
  end: number | null;
  location: string;
  teacher: string;
  subject: string;
  body: string;
  cancelled: boolean;
  elective: boolean;
  done: boolean;
  high: boolean;
  entryId?: string;
  /** дата вхождения в поясе записи (для повторов) */
  occurrence?: string;
  repeats: boolean;
};

export function classItems(events: ClassEvent[], tz: string): Item[] {
  return events.map((e) => {
    const s = e.start ? convertWall(e.date, e.start, SPBU_TZ, tz) : null;
    const en = e.end && e.start ? convertWall(e.date, e.end, SPBU_TZ, tz) : null;
    const date = s?.date ?? e.date;
    const start = s ? hmToMin(s.time) : null;
    let end = en ? hmToMin(en.time) : null;
    if (en && s && en.date > s.date) end = 24 * 60; // пара «перетекла» за полночь — обрежем по концу дня
    return {
      key: e.id,
      kind: "class",
      title: e.title,
      date,
      start,
      end,
      location: e.location,
      teacher: e.teacher,
      subject: "",
      body: "",
      cancelled: e.cancelled,
      elective: e.elective,
      done: false,
      high: false,
      repeats: false,
    };
  });
}

/** Развернуть личные записи в элементы за окно [from, to] (даты в поясе просмотра). */
export function entryItems(entries: Entry[], tz: string, from: string, to: string): Item[] {
  const out: Item[] = [];
  for (const e of entries) {
    // окно в поясе записи берём с запасом в сутки: при пересчёте дата может сместиться
    for (const occ of occurrences(e, addDays(from, -1), addDays(to, 1))) {
      const w = e.time ? convertWall(occ, e.time, e.tz, tz) : { date: occ, time: null as string | null };
      if (w.date < from || w.date > to) continue;
      out.push({
        key: e.repeat ? `${e.id}@${occ}` : e.id,
        kind: e.kind,
        title: e.title,
        date: w.date,
        start: w.time ? hmToMin(w.time) : null,
        end: null,
        location: "",
        teacher: "",
        subject: e.subject,
        body: e.body,
        cancelled: false,
        elective: false,
        done: e.repeat ? e.doneDates.includes(occ) : e.done,
        high: e.priority === "high",
        entryId: e.id,
        occurrence: occ,
        repeats: !!e.repeat,
      });
    }
  }
  return out;
}

const KIND_ORDER: Record<ItemKind, number> = { class: 0, deadline: 1, note: 2 };

export function sortItems(items: Item[]): Item[] {
  return [...items].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.start ?? 9999) - (b.start ?? 9999) ||
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      a.title.localeCompare(b.title, "ru"),
  );
}

export function groupByDate(items: Item[]): Map<string, Item[]> {
  const m = new Map<string, Item[]>();
  for (const it of sortItems(items)) {
    const list = m.get(it.date);
    if (list) list.push(it);
    else m.set(it.date, [it]);
  }
  return m;
}

export type Filters = { class: boolean; deadline: boolean; note: boolean; query: string };
export const ALL_FILTERS: Filters = { class: true, deadline: true, note: true, query: "" };

export function applyFilters(items: Item[], f: Filters): Item[] {
  const q = f.query.trim().toLowerCase();
  return items.filter(
    (i) =>
      f[i.kind] &&
      (!q || `${i.title} ${i.subject} ${i.location} ${i.teacher} ${i.body}`.toLowerCase().includes(q)),
  );
}

/** Ближайшие невыполненные дедлайны начиная с даты `from`; просроченные идут первыми. */
export function upcomingDeadlines(entries: Entry[], tz: string, today: string, nowMin: number, horizonDays = 365) {
  const items = entryItems(entries.filter((e) => e.kind === "deadline"), tz, addDays(today, -60), addDays(today, horizonDays));
  const open = items.filter((i) => !i.done);
  const overdue = (i: Item) => i.date < today || (i.date === today && i.start !== null && i.start < nowMin);
  return sortItems(open).map((i) => ({ item: i, overdue: overdue(i) })).filter((x) => !x.overdue || x.item.date >= addDays(today, -60));
}
