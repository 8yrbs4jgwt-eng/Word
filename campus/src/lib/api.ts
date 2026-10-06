import "server-only";
import { UpstreamError } from "@/lib/spbu/client";

export function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, { ...init, headers: { "cache-control": "no-store", ...init?.headers } });
}

export function bad(message: string, status = 400) {
  return json({ error: message }, { status });
}

/** Оборачивает загрузку расписания: недоступный университет → 502 с понятным текстом. */
export async function upstream<T>(fn: () => Promise<T>) {
  try {
    return json(await fn());
  } catch (e) {
    const status = e instanceof UpstreamError && e.status === 404 ? 404 : 502;
    return bad(
      status === 404 ? "Не найдено на timetable.spbu.ru" : "Расписание СПбГУ сейчас недоступно, а сохранённой копии ещё нет",
      status,
    );
  }
}
