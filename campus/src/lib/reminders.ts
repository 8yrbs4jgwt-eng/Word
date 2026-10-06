import type { Entry } from "@/lib/entries";
import { occurrences } from "@/lib/recurrence";
import { addDays, fromInstant, toInstant } from "@/lib/time";

export type DueReminder = { key: string; entryId: string; title: string; body: string; dueAt: number };

/** Окно «догоняния»: если сервер был недоступен, напоминание не старше 15 минут ещё отправим. */
export const CATCH_UP_MS = 15 * 60_000;

/**
 * Напоминания, которые пора отправить в момент `now`.
 * Чистая функция: «уже отправлено» фильтруется снаружи по `key`.
 */
export function dueReminders(entries: Entry[], now: number): DueReminder[] {
  const out: DueReminder[] = [];
  for (const e of entries) {
    if (e.remind === null || !e.time) continue;
    // окно дат по поясу записи с запасом: срок может быть через 14 дней
    const today = fromInstant(now, e.tz).date;
    for (const occ of occurrences(e, addDays(today, -1), addDays(today, 15))) {
      const done = e.repeat ? e.doneDates.includes(occ) : e.done;
      if (done) continue;
      const dueAt = toInstant(occ, e.time, e.tz);
      const fireAt = dueAt - e.remind * 60_000;
      if (fireAt <= now && now - fireAt <= CATCH_UP_MS && dueAt + CATCH_UP_MS > now) {
        const when = e.remind === 0 ? "Срок — сейчас" : e.remind % 1440 === 0 ? `Срок через ${e.remind / 1440} дн.` : e.remind % 60 === 0 ? `Срок через ${e.remind / 60} ч` : `Срок через ${e.remind} мин`;
        out.push({
          key: `${e.id}@${occ}@${e.remind}`,
          entryId: e.id,
          title: `${e.kind === "deadline" ? "Дедлайн: " : ""}${e.title}`,
          body: [when, e.subject].filter(Boolean).join(" · "),
          dueAt,
        });
      }
    }
  }
  return out;
}
