import type { Cached, ClassEvent } from "@/lib/spbu/types";
import { lsGet, lsSet } from "./storage";

export type WeekResult = { events: ClassEvent[]; updatedAt: string | null; stale: boolean; failed: boolean; error?: string };

class ServerError extends Error {
  constructor(readonly status: number) {
    super(String(status));
  }
}

const key = (g: number, w: string) => `campus:classes:${g}:${w}`;

/**
 * Загружает неделю расписания. При ошибке сети/сервера отдаёт копию из localStorage
 * (последний удачный ответ) — это же работает офлайн.
 */
export async function loadWeek(groupId: number, weekMonday: string): Promise<WeekResult> {
  try {
    const res = await fetch(`/api/timetable/events?group=${groupId}&week=${weekMonday}`);
    if (!res.ok) throw new ServerError(res.status);
    const body = (await res.json()) as Cached<ClassEvent[]>;
    if (!body.stale) lsSet(key(groupId, weekMonday), { events: body.data, updatedAt: body.updatedAt });
    return { events: body.data, updatedAt: body.updatedAt, stale: body.stale, failed: false, error: body.error };
  } catch (e) {
    // сервер ответил ошибкой — это не то же самое, что «нет интернета»
    const error = e instanceof ServerError ? `сервер сайта ответил ошибкой ${e.status}` : "нет связи с сервером";
    const saved = lsGet<{ events: ClassEvent[]; updatedAt: string } | null>(key(groupId, weekMonday), null);
    if (saved) return { events: saved.events, updatedAt: saved.updatedAt, stale: true, failed: false, error };
    return { events: [], updatedAt: null, stale: false, failed: true };
  }
}

/** Чистим сохранённые недели старше 8 недель, чтобы не раздувать localStorage. */
export function pruneSavedWeeks(currentMonday: string) {
  try {
    const limit = new Date(`${currentMonday}T00:00:00Z`).getTime() - 8 * 7 * 86400_000;
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      const m = k && /^campus:classes:\d+:(\d{4}-\d{2}-\d{2})$/.exec(k);
      if (m && new Date(`${m[1]}T00:00:00Z`).getTime() < limit) localStorage.removeItem(k!);
    }
  } catch {}
}

export type TermResult = { events: ClassEvent[]; updatedAt: string | null; stale: boolean; failed: boolean; error?: string };

const termKey = (g: number) => `campus:term:${g}`;

/** Занятия группы за семестр. Копия лежит в localStorage — список работает и без сети. */
export async function loadTerm(groupId: number): Promise<TermResult> {
  try {
    const res = await fetch(`/api/timetable/term?group=${groupId}`);
    if (!res.ok) throw new ServerError(res.status);
    const body = (await res.json()) as Cached<ClassEvent[]>;
    if (!body.stale) lsSet(termKey(groupId), { events: body.data, updatedAt: body.updatedAt });
    return { events: body.data, updatedAt: body.updatedAt, stale: body.stale, failed: false, error: body.error };
  } catch (e) {
    const error = e instanceof ServerError ? `сервер сайта ответил ошибкой ${e.status}` : "нет связи с сервером";
    const saved = lsGet<{ events: ClassEvent[]; updatedAt: string } | null>(termKey(groupId), null);
    if (saved) return { events: saved.events, updatedAt: saved.updatedAt, stale: true, failed: false, error };
    return { events: [], updatedAt: null, stale: false, failed: true, error };
  }
}
