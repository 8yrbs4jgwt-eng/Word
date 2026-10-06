import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { bad, json } from "@/lib/api";
import { getDb } from "@/lib/db";

const sub = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }),
});

export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return bad("Нужно войти", 401);
  const p = z.object({ subscription: sub }).safeParse(await req.json().catch(() => null));
  if (!p.success) return bad("Некорректная подписка");
  getDb()
    .prepare("INSERT INTO push_subscriptions(endpoint,user_id,subscription,created_at) VALUES(?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id, subscription=excluded.subscription")
    .run(p.data.subscription.endpoint, u.id, JSON.stringify(p.data.subscription), Date.now());
  return json({ ok: true });
}

export async function DELETE(req: Request) {
  const u = await currentUser();
  if (!u) return bad("Нужно войти", 401);
  const endpoint = new URL(req.url).searchParams.get("endpoint");
  if (endpoint) getDb().prepare("DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?").run(endpoint, u.id);
  return json({ ok: true });
}
