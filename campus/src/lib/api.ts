import "server-only";
import { UpstreamError } from "@/lib/spbu/client";

export function json(data: unknown, init?: ResponseInit) {
  // charset обязателен: без него Safari показывает кириллицу в JSON как «РЅР°РІ…»
  return Response.json(data, { ...init, headers: { "cache-control": "no-store", "content-type": "application/json; charset=utf-8", ...init?.headers } });
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
