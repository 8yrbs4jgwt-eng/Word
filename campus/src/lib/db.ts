import "server-only";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

/**
 * Единый асинхронный интерфейс к базе. Два бэкенда:
 *  - Postgres (DATABASE_URL) — для хостинга, где локальный диск стирается (Render free + Neon);
 *  - SQLite (DATABASE_PATH) — для локальной разработки и VPS с диском.
 * SQL пишется один раз с плейсхолдерами `?` и общим синтаксисом (ON CONFLICT … DO UPDATE / DO NOTHING).
 */
export type Db = {
  kind: "sqlite" | "postgres";
  get<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T | undefined>;
  all<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T[]>;
  /** Выполняет запрос; возвращает число затронутых строк. */
  run(sql: string, ...params: unknown[]): Promise<number>;
  close(): Promise<void>;
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  settings TEXT NOT NULL DEFAULT '{}',
  feed_token TEXT NOT NULL UNIQUE,
  created_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS entries_user ON entries(user_id);
CREATE TABLE IF NOT EXISTS cache (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  fetched_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription TEXT NOT NULL,
  created_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS reminders_sent (
  key TEXT PRIMARY KEY,
  sent_at BIGINT NOT NULL
);
`;

function sqliteDb(file: string): Db {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  return {
    kind: "sqlite",
    get: async (sql, ...p) => db.prepare(sql).get(...(p as never[])) as never,
    all: async (sql, ...p) => db.prepare(sql).all(...(p as never[])) as never,
    run: async (sql, ...p) => db.prepare(sql).run(...(p as never[])).changes,
    close: async () => void db.close(),
  };
}

// BIGINT (oid 20) приходит строкой — все наши значения (миллисекунды) безопасно помещаются в number
pg.types.setTypeParser(20, (v) => Number(v));

/**
 * Строка из консоли Neon содержит channel_binding=require — драйвер pg и пулер соединений Neon
 * с ним не дружат, а для безопасности достаточно sslmode=require. Убираем параметр, чтобы
 * строку можно было вставлять как есть.
 */
export function normalizePostgresUrl(url: string): string {
  const u = new URL(url.trim());
  u.searchParams.delete("channel_binding");
  return u.toString();
}

async function postgresDb(url: string): Promise<Db> {
  const pool = new pg.Pool({
    connectionString: normalizePostgresUrl(url),
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000, // бесплатная база «просыпается» несколько секунд
  });
  // обрыв простаивающего соединения (база усыпила его) не должен ронять процесс
  pool.on("error", (e) => console.error("[db] idle client error:", e.message));
  const q = (sql: string) => {
    let i = 0;
    return sql.replace(/\?/g, () => `$${++i}`);
  };
  await pool.query(SCHEMA);
  return {
    kind: "postgres",
    get: async (sql, ...p) => (await pool.query(q(sql), p)).rows[0] as never,
    all: async (sql, ...p) => (await pool.query(q(sql), p)).rows as never,
    run: async (sql, ...p) => (await pool.query(q(sql), p)).rowCount ?? 0,
    close: () => pool.end(),
  };
}

/** target: postgres://… | путь к файлу SQLite | ":memory:" */
export async function openDb(target: string): Promise<Db> {
  return /^\s*postgres(ql)?:\/\//.test(target) ? postgresDb(target) : sqliteDb(target);
}

const g = globalThis as unknown as { __lektorijDb?: Promise<Db> };

export function getDb(): Promise<Db> {
  g.__lektorijDb ??= openDb(process.env.DATABASE_URL ?? process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "campus.db"));
  return g.__lektorijDb;
}
