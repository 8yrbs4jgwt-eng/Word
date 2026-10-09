import { describe, expect, it, vi } from "vitest";
import { createUser } from "@/lib/auth";
import { entrySchema } from "@/lib/entries";
import { deleteEntry, listEntries, saveEntries } from "@/lib/entries-store";
import { fetchCached } from "@/lib/spbu/cache";
import { backends } from "./helpers/db";

const mk = (id: string, updatedAt: number, title = "T") =>
  entrySchema.parse({ id, kind: "deadline", title, date: "2026-10-06", time: "12:00", tz: "Europe/Moscow", updatedAt });

describe.each(backends)("хранилище записей ($name)", ({ open }) => {
  it("создание, изменение, удаление; побеждает более новая версия", async () => {
    const db = await open();
    const u = (await createUser(db, "a@b.ru", "12345678", ""))!;
    await saveEntries(db, u.id, [mk("e1", 1000, "старая")]);
    await saveEntries(db, u.id, [mk("e1", 2000, "новая")]);
    expect((await listEntries(db, u.id))[0].title).toBe("новая");
    await saveEntries(db, u.id, [mk("e1", 1500, "устаревшая")]); // пришла позже, но старше — игнорируем
    expect((await listEntries(db, u.id))[0].title).toBe("новая");
    await deleteEntry(db, u.id, "e1");
    expect(await listEntries(db, u.id)).toEqual([]);
    await db.close();
  });

  it("чужую запись с тем же id перезаписать нельзя, удалить — тоже", async () => {
    const db = await open();
    const a = (await createUser(db, "a@b.ru", "12345678", ""))!;
    const b = (await createUser(db, "b@b.ru", "12345678", ""))!;
    await saveEntries(db, a.id, [mk("shared", 1000, "Алина")]);
    await saveEntries(db, b.id, [mk("shared", 9999, "Борис")]);
    expect((await listEntries(db, a.id))[0].title).toBe("Алина");
    expect(await listEntries(db, b.id)).toEqual([]);
    await deleteEntry(db, b.id, "shared");
    expect(await listEntries(db, a.id)).toHaveLength(1);
    await db.close();
  });

  it("удаление пользователя удаляет его записи (каскад)", async () => {
    const db = await open();
    const u = (await createUser(db, "a@b.ru", "12345678", ""))!;
    await saveEntries(db, u.id, [mk("e1", 1)]);
    await db.run("DELETE FROM users WHERE id = ?", u.id);
    expect(await db.get("SELECT 1 FROM entries WHERE id = ?", "e1")).toBeUndefined();
    await db.close();
  });

  it("большие значения времени (мс) не теряются", async () => {
    const db = await open();
    const u = (await createUser(db, "a@b.ru", "12345678", ""))!;
    const t = 1_791_000_000_123;
    await saveEntries(db, u.id, [mk("big", t)]);
    expect((await listEntries(db, u.id))[0].updatedAt).toBe(t);
    const row = await db.get<{ updated_at: number }>("SELECT updated_at FROM entries WHERE id = ?", "big");
    expect(row?.updated_at).toBe(t);
    await db.close();
  });

  it("отметка «напоминание отправлено» ставится ровно один раз", async () => {
    const db = await open();
    const sql = "INSERT INTO reminders_sent(key, sent_at) VALUES(?,?) ON CONFLICT(key) DO NOTHING";
    expect(await db.run(sql, "k1", 1)).toBe(1);
    expect(await db.run(sql, "k1", 2)).toBe(0);
    await db.close();
  });
});

describe.each(backends)("кэш расписания ($name)", ({ open }) => {
  it("кэширует, потом отдаёт stale при сбое", async () => {
    const db = await open();
    let t = 1_000_000;
    const load = vi.fn().mockResolvedValueOnce([1, 2]);
    const a = await fetchCached(db, "k", 1000, load, () => t);
    expect(a).toMatchObject({ data: [1, 2], stale: false });
    await fetchCached(db, "k", 1000, load, () => t + 500);
    expect(load).toHaveBeenCalledTimes(1);

    t += 5000;
    load.mockRejectedValueOnce(new Error("down"));
    const b = await fetchCached(db, "k", 1000, load, () => t);
    expect(b).toMatchObject({ data: [1, 2], stale: true });
    expect(b.updatedAt).toBe(a.updatedAt);
    await db.close();
  });

  it("без кэша — пробрасывает ошибку", async () => {
    const db = await open();
    await expect(fetchCached(db, "x", 1000, () => Promise.reject(new Error("down")))).rejects.toThrow("down");
    await db.close();
  });

  it("повторное обновление ключа перезаписывает значение", async () => {
    const db = await open();
    let t = 1;
    await fetchCached(db, "k", 10, async () => "v1", () => t);
    t = 100;
    const r = await fetchCached(db, "k", 10, async () => "v2", () => t);
    expect(r.data).toBe("v2");
    expect((await fetchCached(db, "k", 10, async () => "v3", () => t + 1)).data).toBe("v2");
    await db.close();
  });
});

describe.each(backends)("причина сбоя при устаревшей копии ($name)", ({ open }) => {
  it("stale-ответ содержит короткую причину", async () => {
    const db = await open();
    let t = 1;
    await fetchCached(db, "k", 10, async () => ["ok"], () => t);
    t = 100;
    const timeout = Object.assign(new Error("signal timed out"), { name: "TimeoutError" });
    expect((await fetchCached(db, "k", 10, () => Promise.reject(timeout), () => t)).error).toBe("сайт СПбГУ не ответил вовремя");
    const http = Object.assign(new Error("x"), { status: 403 });
    expect((await fetchCached(db, "k", 10, () => Promise.reject(http), () => t)).error).toBe("сайт СПбГУ ответил с ошибкой 403");
    const net = Object.assign(new Error("fetch failed"), { cause: { code: "ECONNRESET" } });
    expect((await fetchCached(db, "k", 10, () => Promise.reject(net), () => t)).error).toBe("сетевая ошибка (ECONNRESET)");
    await db.close();
  });
});

describe("устойчивость к недоступной базе", () => {
  it("расписание грузится напрямую, если база не отвечает", async () => {
    const broken = {
      kind: "sqlite" as const,
      get: () => Promise.reject(new Error("connection refused")),
      all: () => Promise.reject(new Error("connection refused")),
      run: () => Promise.reject(new Error("connection refused")),
      close: async () => {},
    };
    const r = await fetchCached(broken, "k", 1000, async () => ["свежие данные"]);
    expect(r).toMatchObject({ data: ["свежие данные"], stale: false });
  });

  it("совсем без базы (null) — тоже работает", async () => {
    expect((await fetchCached(null, "k2", 1000, async () => 42)).data).toBe(42);
  });

  it("неудачное подключение не запоминается: следующий запрос пробует снова", async () => {
    vi.resetModules();
    const saved = { url: process.env.DATABASE_URL, path: process.env.DATABASE_PATH };
    try {
      process.env.DATABASE_URL = "postgres://u:p@127.0.0.1:1/db"; // порт закрыт — подключение сразу упадёт
      const { getDb, describeDbError } = await import("@/lib/db");
      const err = await getDb().then(() => null, (e) => e);
      expect(err).toBeTruthy();
      expect(describeDbError(new Error("fail postgres://user:secret@host/db?x=1 end"))).not.toContain("secret");

      delete process.env.DATABASE_URL;
      process.env.DATABASE_PATH = ":memory:";
      const db = await getDb(); // тот же модуль и тот же getDb — но теперь подключение удаётся
      expect(db.kind).toBe("sqlite");
      await db.close();
    } finally {
      if (saved.url === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = saved.url;
      if (saved.path === undefined) delete process.env.DATABASE_PATH;
      else process.env.DATABASE_PATH = saved.path;
      (globalThis as { __lektorijDb?: unknown }).__lektorijDb = undefined;
    }
  });
});
