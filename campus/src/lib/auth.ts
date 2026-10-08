import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { getDb, type Db } from "@/lib/db";
import { DEFAULT_SETTINGS, settingsSchema, type Settings } from "@/lib/entries";

export const SESSION_COOKIE = "campus_session";
const SESSION_DAYS = 60;

export type User = { id: string; email: string; name: string; feedToken: string; settings: Settings };

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

export async function createUser(db: Db, email: string, password: string, name: string): Promise<User | null> {
  const id = crypto.randomUUID();
  const feedToken = crypto.randomBytes(24).toString("base64url");
  // email уникален: занятый адрес не вставится (ON CONFLICT DO NOTHING → 0 строк), без разбора текстов ошибок разных БД
  const n = await db.run(
    "INSERT INTO users(id,email,password_hash,name,settings,feed_token,created_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(email) DO NOTHING",
    id,
    email,
    hashPassword(password),
    name,
    JSON.stringify(DEFAULT_SETTINGS),
    feedToken,
    Date.now(),
  );
  return n === 0 ? null : { id, email, name, feedToken, settings: DEFAULT_SETTINGS };
}

type UserRow = { id: string; email: string; name: string; feed_token: string; settings: string; password_hash?: string };
const toUser = (r: UserRow): User => {
  let settings = DEFAULT_SETTINGS;
  try {
    settings = settingsSchema.parse(JSON.parse(r.settings));
  } catch {}
  return { id: r.id, email: r.email, name: r.name, feedToken: r.feed_token, settings };
};

export async function authenticate(db: Db, email: string, password: string): Promise<User | null> {
  const row = await db.get<UserRow>("SELECT * FROM users WHERE email = ?", email);
  // Считаем хэш даже для несуществующего пользователя, чтобы не выдавать наличие email по времени ответа
  const ok = verifyPassword(password, row?.password_hash ?? "scrypt$00$00");
  return row && ok ? toUser(row) : null;
}

export async function startSession(db: Db, userId: string): Promise<{ token: string; expires: Date }> {
  const token = crypto.randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await db.run("DELETE FROM sessions WHERE expires_at < ?", Date.now());
  await db.run("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)", sha(token), userId, expires.getTime());
  return { token, expires };
}

export async function userByToken(db: Db, token: string): Promise<User | null> {
  const row = await db.get<UserRow>(
    "SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?",
    sha(token),
    Date.now(),
  );
  return row ? toUser(row) : null;
}

export async function userByFeedToken(db: Db, token: string): Promise<User | null> {
  const row = await db.get<UserRow>("SELECT * FROM users WHERE feed_token = ?", token);
  return row ? toUser(row) : null;
}

export async function setSessionCookie(token: string, expires: Date) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === "true" : process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
}

export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? userByToken(await getDb(), token) : null;
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await (await getDb()).run("DELETE FROM sessions WHERE token_hash = ?", sha(token));
  jar.delete(SESSION_COOKIE);
}

// ---- простой лимит попыток входа (в памяти процесса) ----
const attempts = new Map<string, { n: number; reset: number }>();
export function rateLimited(key: string, max = 8, windowMs = 60_000): boolean {
  const now = Date.now();
  const a = attempts.get(key);
  if (!a || a.reset < now) {
    attempts.set(key, { n: 1, reset: now + windowMs });
    return false;
  }
  a.n++;
  return a.n > max;
}
