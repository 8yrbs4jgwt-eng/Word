import type Database from "better-sqlite3";
import type { Cached } from "./types";

const inflight = new Map<string, Promise<unknown>>();

/**
 * Читает из кэша (SQLite), пока запись свежее ttlMs. Иначе грузит заново.
 * Если загрузка упала — отдаёт последний удачный ответ с stale=true.
 * Если кэша нет совсем — пробрасывает ошибку.
 */
export async function fetchCached<T>(
  db: Database.Database,
  key: string,
  ttlMs: number,
  load: () => Promise<T>,
  now: () => number = Date.now,
): Promise<Cached<T>> {
  const row = db.prepare("SELECT value, fetched_at FROM cache WHERE key = ?").get(key) as
    | { value: string; fetched_at: number }
    | undefined;

  if (row && now() - row.fetched_at < ttlMs) {
    return { data: JSON.parse(row.value) as T, updatedAt: new Date(row.fetched_at).toISOString(), stale: false };
  }

  let p = inflight.get(key) as Promise<T> | undefined;
  if (!p) {
    p = load().finally(() => inflight.delete(key));
    inflight.set(key, p);
  }

  try {
    const data = await p;
    const at = now();
    db.prepare(
      "INSERT INTO cache(key, value, fetched_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, fetched_at=excluded.fetched_at",
    ).run(key, JSON.stringify(data), at);
    return { data, updatedAt: new Date(at).toISOString(), stale: false };
  } catch (err) {
    if (row) {
      return { data: JSON.parse(row.value) as T, updatedAt: new Date(row.fetched_at).toISOString(), stale: true };
    }
    throw err;
  }
}
