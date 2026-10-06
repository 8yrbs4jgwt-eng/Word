import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import type Database from "better-sqlite3";
import { getDb } from "@/lib/db";
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

export function createUser(db: Database.Database, email: string, password: string, name: string): User | null {
  const id = crypto.randomUUID();
  const feedToken = crypto.randomBytes(24).toString("base64url");
  try {
    db.prepare("INSERT INTO users(id,email,password_hash,name,settings,feed_token,created_at) VALUES(?,?,?,?,?,?,?)").run(
      id,
      email,
      hashPassword(password),
      name,
      JSON.stringify(DEFAULT_SETTINGS),
      feedToken,
      Date.now(),
    );
  } catch {
    return null; // email занят
  }
  return { id, email, name, feedToken, settings: DEFAULT_SETTINGS };
}

type UserRow = { id: string; email: string; name: string; feed_token: string; settings: string; password_hash?: string };
const toUser = (r: UserRow): User => {
  let settings = DEFAULT_SETTINGS;
  try {
    settings = settingsSchema.parse(JSON.parse(r.settings));
  } catch {}
  return { id: r.id, email: r.email, name: r.name, feedToken: r.feed_token, settings };
};

export function authenticate(db: Database.Database, email: string, password: string): User | null {
  const row = db.prepare("SELECT * FROM users WHERE email = ?").get(email) as UserRow | undefined;
  // Считаем хэш даже для несуществующего пользователя, чтобы не выдавать наличие email по времени ответа
  const ok = verifyPassword(password, row?.password_hash ?? "scrypt$00$00");
  return row && ok ? toUser(row) : null;
}

export function startSession(db: Database.Database, userId: string): { token: string; expires: Date } {
  const token = crypto.randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000);
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());
  db.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").run(sha(token), userId, expires.getTime());
  return { token, expires };
}

export function userByToken(db: Database.Database, token: string): User | null {
  const row = db
    .prepare(
      "SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?",
    )
    .get(sha(token), Date.now()) as UserRow | undefined;
  return row ? toUser(row) : null;
}

export function userByFeedToken(db: Database.Database, token: string): User | null {
  const row = db.prepare("SELECT * FROM users WHERE feed_token = ?").get(token) as UserRow | undefined;
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
  return token ? userByToken(getDb(), token) : null;
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) getDb().prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha(token));
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
