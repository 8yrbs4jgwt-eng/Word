import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { bad, json } from "@/lib/api";
import { getDb } from "@/lib/db";
import { entrySchema } from "@/lib/entries";
import { deleteEntry, listEntries, saveEntries } from "@/lib/entries-store";

export async function GET() {
  const u = await currentUser();
  if (!u) return bad("Нужно войти", 401);
  return json({ entries: await listEntries(await getDb(), u.id) });
}

/** Пакетное сохранение (создание/изменение/перенос гостевых записей). */
export async function PUT(req: Request) {
  const u = await currentUser();
  if (!u) return bad("Нужно войти", 401);
  const parsed = z.object({ entries: z.array(entrySchema).max(500) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad(parsed.error.issues[0].message);
  const db = await getDb();
  await saveEntries(db, u.id, parsed.data.entries);
  return json({ entries: await listEntries(db, u.id) });
}

export async function DELETE(req: Request) {
  const u = await currentUser();
  if (!u) return bad("Нужно войти", 401);
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return bad("Не указана запись");
  await deleteEntry(await getDb(), u.id, id);
  return json({ ok: true });
}
