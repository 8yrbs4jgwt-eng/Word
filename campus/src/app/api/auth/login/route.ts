import { z } from "zod";
import { authenticate, rateLimited, setSessionCookie, startSession } from "@/lib/auth";
import { bad, json } from "@/lib/api";
import { getDb } from "@/lib/db";

const body = z.object({ email: z.string().trim().toLowerCase().max(200), password: z.string().max(200) });

export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("Введите email и пароль");
  const ip = req.headers.get("x-forwarded-for") ?? "local";
  if (rateLimited(`login:${ip}:${parsed.data.email}`)) return bad("Слишком много попыток. Подождите минуту.", 429);
  const db = getDb();
  const user = authenticate(db, parsed.data.email, parsed.data.password);
  if (!user) return bad("Неверный email или пароль", 401);
  const s = startSession(db, user.id);
  await setSessionCookie(s.token, s.expires);
  return json({ user: { id: user.id, email: user.email, name: user.name }, settings: user.settings, feedToken: user.feedToken });
}
