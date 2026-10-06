import { z } from "zod";
import { createUser, rateLimited, setSessionCookie, startSession } from "@/lib/auth";
import { bad, json } from "@/lib/api";
import { getDb } from "@/lib/db";

const body = z.object({
  email: z.string().trim().toLowerCase().email("Введите корректный email").max(200),
  password: z.string().min(8, "Пароль — не короче 8 символов").max(200),
  name: z.string().trim().max(80).default(""),
});

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for") ?? "local";
  if (rateLimited(`reg:${ip}`, 10, 3600_000)) return bad("Слишком много попыток. Попробуйте позже.", 429);
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad(parsed.error.issues[0].message);
  const db = getDb();
  const user = createUser(db, parsed.data.email, parsed.data.password, parsed.data.name);
  if (!user) return bad("Этот email уже зарегистрирован", 409);
  const s = startSession(db, user.id);
  await setSessionCookie(s.token, s.expires);
  return json({ user: { id: user.id, email: user.email, name: user.name }, settings: user.settings, feedToken: user.feedToken });
}
