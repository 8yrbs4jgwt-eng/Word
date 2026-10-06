import type { ClassEvent } from "@/lib/spbu/types";
import { weekdayOf } from "@/lib/time";

/**
 * Выбор студента: какие дисциплины он посещает и какой из параллельных вариантов — его.
 * Привязан к группе: при смене группы выбор сбрасывается.
 */
export type Selection = {
  groupId: number;
  /** названия дисциплин, которые скрыты целиком (факультативы «не мои») */
  hidden: string[];
  /** выбранные элективы (дисциплины по выбору); undefined — ещё не выбирал, показываем все */
  electives?: string[];
  /** слот → выбранный преподаватель; NONE — на этом слоте я не занимаюсь */
  picks: Record<string, string>;
};

export const NONE = "__none__";

/** «Алгебра, лекция» → «Алгебра». Вид занятия отделён последней запятой. */
export function disciplineOf(title: string): string {
  const i = title.lastIndexOf(", ");
  return i > 0 ? title.slice(0, i) : title;
}

export function kindOf(title: string): string {
  const i = title.lastIndexOf(", ");
  return i > 0 ? title.slice(i + 2) : "";
}

/** Слот — одно и то же занятие в одно и то же время каждую неделю (время московское). */
export const slotKey = (e: Pick<ClassEvent, "title" | "date" | "start">) => `${e.title}|${weekdayOf(e.date)}|${e.start ?? ""}`;

export type SlotOption = { teacher: string; locations: string[]; count: number };
export type Slot = { key: string; title: string; weekday: number; start: string | null; end: string | null; options: SlotOption[] };
export type Discipline = { name: string; kinds: string[]; count: number; elective: boolean };
export type Catalog = { disciplines: Discipline[]; slots: Slot[] };

/** Каталог для экрана выбора: все дисциплины и слоты, где есть несколько параллельных вариантов. */
export function buildCatalog(events: ClassEvent[]): Catalog {
  const disc = new Map<string, { kinds: Set<string>; count: number; elective: boolean }>();
  const slots = new Map<string, Slot>();
  for (const e of events) {
    const name = disciplineOf(e.title);
    const d = disc.get(name) ?? { kinds: new Set<string>(), count: 0, elective: false };
    if (e.elective) d.elective = true;
    const kind = kindOf(e.title);
    if (kind) d.kinds.add(kind);
    d.count++;
    disc.set(name, d);

    const key = slotKey(e);
    const s = slots.get(key) ?? { key, title: e.title, weekday: weekdayOf(e.date), start: e.start, end: e.end, options: [] };
    const label = e.teacher || "Преподаватель не указан";
    let o = s.options.find((x) => x.teacher === label);
    if (!o) s.options.push((o = { teacher: label, locations: [], count: 0 }));
    o.count++;
    if (e.location && !o.locations.includes(e.location)) o.locations.push(e.location);
    slots.set(key, s);
  }
  return {
    disciplines: [...disc].map(([name, v]) => ({ name, kinds: [...v.kinds], count: v.count, elective: v.elective })).sort((a, b) => a.name.localeCompare(b.name, "ru")),
    slots: [...slots.values()]
      .filter((s) => s.options.length > 1)
      .sort((a, b) => a.title.localeCompare(b.title, "ru") || a.weekday - b.weekday || (a.start ?? "").localeCompare(b.start ?? "")),
  };
}

/** Оставляет только то, что выбрал студент. Без выбора (или для чужой группы) возвращает всё. */
export function applySelection(events: ClassEvent[], sel: Selection | null | undefined, groupId: number | null): ClassEvent[] {
  if (!sel || sel.groupId !== groupId) return events;
  const hidden = new Set(sel.hidden);
  const electives = sel.electives ? new Set(sel.electives) : null;
  return events.filter((e) => {
    const name = disciplineOf(e.title);
    if (hidden.has(name)) return false;
    // элективы: после выбора остаются только отмеченные
    if (e.elective && electives && !electives.has(name)) return false;
    const pick = sel.picks[slotKey(e)];
    if (pick === undefined) return true;
    return pick !== NONE && pick === (e.teacher || "Преподаватель не указан");
  });
}

/** Названия элективов, по которым студент ещё не определился (выбор не сохранён). */
export function undecidedElectives(events: ClassEvent[], sel: Selection | null | undefined, groupId: number | null): string[] {
  if (sel && sel.groupId === groupId && sel.electives) return [];
  return buildCatalog(events).disciplines.filter((d) => d.elective).map((d) => d.name);
}

/** Слоты с параллельными вариантами, по которым выбор ещё не сделан (дисциплина не скрыта). */
export function unresolvedSlots(events: ClassEvent[], sel: Selection | null | undefined, groupId: number | null): Slot[] {
  const active = sel && sel.groupId === groupId ? sel : null;
  const hidden = new Set(active?.hidden ?? []);
  return buildCatalog(events.filter((e) => !hidden.has(disciplineOf(e.title)))).slots.filter((s) => active?.picks[s.key] === undefined);
}
