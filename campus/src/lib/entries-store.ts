import type { Db } from "@/lib/db";
import type { Entry } from "@/lib/entries";

export async function listEntries(db: Db, userId: string): Promise<Entry[]> {
  const rows = await db.all<{ data: string }>("SELECT data FROM entries WHERE user_id = ?", userId);
  return rows.map((r) => JSON.parse(r.data) as Entry);
}

/**
 * Сохраняет записи пользователя. Побеждает более новый updatedAt; чужую запись с тем же id
 * перезаписать нельзя. Условие внутри одного запроса — без транзакций и гонок.
 */
export async function saveEntries(db: Db, userId: string, entries: Entry[]): Promise<void> {
  for (const e of entries) {
    await db.run(
      `INSERT INTO entries(id,user_id,data,updated_at) VALUES(?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at
       WHERE entries.user_id = excluded.user_id AND entries.updated_at <= excluded.updated_at`,
      e.id,
      userId,
      JSON.stringify(e),
      e.updatedAt,
    );
  }
}

export async function deleteEntry(db: Db, userId: string, id: string): Promise<void> {
  await db.run("DELETE FROM entries WHERE id = ? AND user_id = ?", id, userId);
}
