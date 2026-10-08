import "server-only";
import webpush from "web-push";
import { getDb, type Db } from "@/lib/db";
import { entrySchema, type Entry } from "@/lib/entries";
import { dueReminders } from "@/lib/reminders";

type Vapid = { publicKey: string; privateKey: string };

/** VAPID-ключи берём из окружения, иначе генерируем один раз и храним в БД. */
export async function getVapid(db?: Db): Promise<Vapid> {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  }
  const d = db ?? (await getDb());
  const row = await d.get<{ value: string }>("SELECT value FROM cache WHERE key = 'vapid'");
  if (row) return JSON.parse(row.value) as Vapid;
  const keys = webpush.generateVAPIDKeys();
  // при гонке двух процессов выигрывает первый; перечитываем, чтобы все использовали одни ключи
  await d.run("INSERT INTO cache(key,value,fetched_at) VALUES('vapid',?,?) ON CONFLICT(key) DO NOTHING", JSON.stringify(keys), Date.now());
  const saved = await d.get<{ value: string }>("SELECT value FROM cache WHERE key = 'vapid'");
  return saved ? (JSON.parse(saved.value) as Vapid) : keys;
}

async function configure(db: Db) {
  const v = await getVapid(db);
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:admin@example.com", v.publicKey, v.privateKey);
}

type Payload = { title: string; body: string; tag?: string; url?: string };

/** Шлёт уведомление всем устройствам пользователя; мёртвые подписки удаляет. Возвращает число доставленных. */
export async function sendToUser(db: Db, userId: string, payload: Payload): Promise<number> {
  await configure(db);
  const subs = await db.all<{ endpoint: string; subscription: string }>("SELECT endpoint, subscription FROM push_subscriptions WHERE user_id = ?", userId);
  let ok = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(JSON.parse(s.subscription), JSON.stringify(payload), { TTL: 3600 });
        ok++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await db.run("DELETE FROM push_subscriptions WHERE endpoint = ?", s.endpoint);
      }
    }),
  );
  return ok;
}

/** Один проход планировщика. Вызывается раз в минуту из instrumentation.ts. */
export async function runReminders(db?: Db, now = Date.now()): Promise<number> {
  const d = db ?? (await getDb());
  const users = await d.all<{ user_id: string }>("SELECT DISTINCT user_id FROM push_subscriptions");
  let sent = 0;
  for (const { user_id } of users) {
    const rows = await d.all<{ data: string }>("SELECT data FROM entries WHERE user_id = ?", user_id);
    const entries: Entry[] = rows.flatMap((r) => {
      const p = entrySchema.safeParse(JSON.parse(r.data));
      return p.success ? [p.data] : [];
    });
    for (const due of dueReminders(entries, now)) {
      const key = `${user_id}:${due.key}`;
      // «отметиться, что отправили» одним атомарным запросом: вставилась строка — значит мы первые
      const first = await d.run("INSERT INTO reminders_sent(key, sent_at) VALUES(?,?) ON CONFLICT(key) DO NOTHING", key, now);
      if (!first) continue;
      if (await sendToUser(d, user_id, { title: due.title, body: due.body, tag: due.key, url: "/" })) sent++;
    }
  }
  await d.run("DELETE FROM reminders_sent WHERE sent_at < ?", now - 30 * 86400_000);
  return sent;
}
