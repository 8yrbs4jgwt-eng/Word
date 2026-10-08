import type { Db } from "@/lib/db";
import type { Cached } from "./types";

const inflight = new Map<string, Promise<unknown>>();

type Row = { value: string; fetched_at: number };

/**
 * Читает из кэша (БД), пока запись свежее ttlMs. Иначе грузит заново.
 * Если загрузка упала — отдаёт последний удачный ответ с stale=true.
 * Если кэша нет совсем — пробрасывает ошибку.
 */
export async function fetchCached<T>(
  db: Db,
  key: string,
  ttlMs: number,
  load: () => Promise<T>,
  now: () => number = Date.now,
): Promise<Cached<T>> {
  const row = await db.get<Row>("SELECT value, fetched_at FROM cache WHERE key = ?", key);

  if (row && now() - row.fetched_at < ttlMs) {
    return { data: JSON.parse(row.value) as T, updatedAt: new Date(row.fetched_at).toISOString(), stale: false };
  }

  const flight = `${db.kind}:${key}`;
  let p = inflight.get(flight) as Promise<T> | undefined;
  if (!p) {
    p = load().finally(() => inflight.delete(flight));
    inflight.set(flight, p);
  }

  try {
    const data = await p;
    const at = now();
    // сбой записи кэша не должен ломать ответ: данные уже получены
    await db
      .run(
        "INSERT INTO cache(key, value, fetched_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, fetched_at=excluded.fetched_at",
        key,
        JSON.stringify(data),
        at,
      )
      .catch((e) => console.error("[cache] write failed:", e instanceof Error ? e.message : e));
    return { data, updatedAt: new Date(at).toISOString(), stale: false };
  } catch (err) {
    if (row) {
      return { data: JSON.parse(row.value) as T, updatedAt: new Date(row.fetched_at).toISOString(), stale: true };
    }
    throw err;
  }
}
