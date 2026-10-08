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
