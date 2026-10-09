import type { Cached, ClassEvent } from "@/lib/spbu/types";
import { lsGet, lsSet } from "./storage";

export type WeekResult = { events: ClassEvent[]; updatedAt: string | null; stale: boolean; failed: boolean; error?: string };

const key = (g: number, w: string) => `campus:classes:${g}:${w}`;

/**
 * Загружает неделю расписания. При ошибке сети/сервера отдаёт копию из localStorage
 * (последний удачный ответ) — это же работает офлайн.
 */
export async function loadWeek(groupId: number, weekMonday: string): Promise<WeekResult> {
  try {
    const res = await fetch(`/api/timetable/events?group=${groupId}&week=${weekMonday}`);
    if (!res.ok) throw new Error(String(res.status));
    const body = (await res.json()) as Cached<ClassEvent[]>;
    if (!body.stale) lsSet(key(groupId, weekMonday), { events: body.data, updatedAt: body.updatedAt });
    return { events: body.data, updatedAt: body.updatedAt, stale: body.stale, failed: false, error: body.error };
  } catch {
    const saved = lsGet<{ events: ClassEvent[]; updatedAt: string } | null>(key(groupId, weekMonday), null);
    if (saved) return { events: saved.events, updatedAt: saved.updatedAt, stale: true, failed: false, error: "нет связи с сервером" };
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
