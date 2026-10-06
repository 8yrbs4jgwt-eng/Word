import "server-only";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const globalForDb = globalThis as unknown as { __campusDb?: Database.Database };

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  settings TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS entries_user ON entries(user_id);
CREATE TABLE IF NOT EXISTS cache (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  fetched_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS reminders_sent (
  key TEXT PRIMARY KEY,
  sent_at INTEGER NOT NULL
);
`;

export function openDb(file: string): Database.Database {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  return db;
}

export function getDb(): Database.Database {
  if (!globalForDb.__campusDb) {
    const file = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "campus.db");
    globalForDb.__campusDb = openDb(file);
  }
  return globalForDb.__campusDb;
}
