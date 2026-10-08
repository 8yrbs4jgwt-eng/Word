import { currentUser } from "@/lib/auth";
import { bad, json } from "@/lib/api";
import { getDb } from "@/lib/db";
import { settingsSchema } from "@/lib/entries";

export async function PUT(req: Request) {
  const u = await currentUser();
  if (!u) return bad("Нужно войти", 401);
  const parsed = settingsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("Некорректные настройки");
  await (await getDb()).run("UPDATE users SET settings = ? WHERE id = ?", JSON.stringify(parsed.data), u.id);
  return json(parsed.data);
}
