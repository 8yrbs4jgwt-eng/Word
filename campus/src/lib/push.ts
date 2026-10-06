import "server-only";
import webpush from "web-push";
import type Database from "better-sqlite3";
import { getDb } from "@/lib/db";
import { entrySchema, type Entry } from "@/lib/entries";
import { dueReminders } from "@/lib/reminders";

type Vapid = { publicKey: string; privateKey: string };

/** VAPID-ключи берём из окружения, иначе генерируем один раз и храним в БД. */
export function getVapid(db: Database.Database = getDb()): Vapid {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  }
  const row = db.prepare("SELECT value FROM cache WHERE key = 'vapid'").get() as { value: string } | undefined;
  if (row) return JSON.parse(row.value) as Vapid;
  const keys = webpush.generateVAPIDKeys();
  db.prepare("INSERT INTO cache(key,value,fetched_at) VALUES('vapid',?,?)").run(JSON.stringify(keys), Date.now());
  return keys;
}

function configure(db: Database.Database) {
  const v = getVapid(db);
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:admin@example.com", v.publicKey, v.privateKey);
}

type Payload = { title: string; body: string; tag?: string; url?: string };

/** Шлёт уведомление всем устройствам пользователя; мёртвые подписки удаляет. Возвращает число доставленных. */
export async function sendToUser(db: Database.Database, userId: string, payload: Payload): Promise<number> {
  configure(db);
  const subs = db.prepare("SELECT endpoint, subscription FROM push_subscriptions WHERE user_id = ?").all(userId) as { endpoint: string; subscription: string }[];
  let ok = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(JSON.parse(s.subscription), JSON.stringify(payload), { TTL: 3600 });
        ok++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").run(s.endpoint);
      }
    }),
  );
  return ok;
}

/** Один проход планировщика. Вызывается раз в минуту из instrumentation.ts. */
export async function runReminders(db: Database.Database = getDb(), now = Date.now()): Promise<number> {
  const users = db.prepare("SELECT DISTINCT user_id FROM push_subscriptions").all() as { user_id: string }[];
  let sent = 0;
  const seen = db.prepare("SELECT 1 FROM reminders_sent WHERE key = ?");
  const mark = db.prepare("INSERT OR IGNORE INTO reminders_sent(key, sent_at) VALUES(?,?)");
  for (const { user_id } of users) {
    const rows = db.prepare("SELECT data FROM entries WHERE user_id = ?").all(user_id) as { data: string }[];
    const entries: Entry[] = rows.flatMap((r) => {
      const p = entrySchema.safeParse(JSON.parse(r.data));
      return p.success ? [p.data] : [];
    });
    for (const d of dueReminders(entries, now)) {
      const key = `${user_id}:${d.key}`;
      if (seen.get(key)) continue;
      mark.run(key, now);
      if (await sendToUser(db, user_id, { title: d.title, body: d.body, tag: d.key, url: "/" })) sent++;
    }
  }
  db.prepare("DELETE FROM reminders_sent WHERE sent_at < ?").run(now - 30 * 86400_000);
  return sent;
}
