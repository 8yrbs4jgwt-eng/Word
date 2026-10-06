import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { bad, json } from "@/lib/api";
import { getDb } from "@/lib/db";
import { entrySchema, type Entry } from "@/lib/entries";

function list(userId: string): Entry[] {
  const rows = getDb().prepare("SELECT data FROM entries WHERE user_id = ?").all(userId) as { data: string }[];
  return rows.map((r) => JSON.parse(r.data) as Entry);
}

export async function GET() {
  const u = await currentUser();
  if (!u) return bad("Нужно войти", 401);
  return json({ entries: list(u.id) });
}

/** Пакетное сохранение (создание/изменение/перенос гостевых записей). Побеждает более новый updatedAt. */
export async function PUT(req: Request) {
  const u = await currentUser();
  if (!u) return bad("Нужно войти", 401);
  const parsed = z.object({ entries: z.array(entrySchema).max(500) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad(parsed.error.issues[0].message);
  const db = getDb();
  const get = db.prepare("SELECT data FROM entries WHERE id = ? AND user_id = ?");
  const upsert = db.prepare(
    "INSERT INTO entries(id,user_id,data,updated_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at WHERE entries.user_id = excluded.user_id",
  );
  db.transaction(() => {
    for (const e of parsed.data.entries) {
      const cur = get.get(e.id, u.id) as { data: string } | undefined;
      if (cur && (JSON.parse(cur.data) as Entry).updatedAt > e.updatedAt) continue;
      upsert.run(e.id, u.id, JSON.stringify(e), e.updatedAt);
    }
  })();
  return json({ entries: list(u.id) });
}

export async function DELETE(req: Request) {
  const u = await currentUser();
  if (!u) return bad("Нужно войти", 401);
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return bad("Не указана запись");
  getDb().prepare("DELETE FROM entries WHERE id = ? AND user_id = ?").run(id, u.id);
  return json({ ok: true });
}
