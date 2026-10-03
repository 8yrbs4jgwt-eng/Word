import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './config.js';

fs.mkdirSync(DATA_DIR, { recursive: true });
export const db = new DatabaseSync(process.env.DB_FILE || path.join(DATA_DIR, 'planner.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE, pass_hash TEXT NOT NULL,
  is_demo INTEGER NOT NULL DEFAULT 0, settings TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS secrets (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL,
  value_enc TEXT NOT NULL, PRIMARY KEY (user_id, name));
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'personal', status TEXT NOT NULL DEFAULT 'planned',
  priority INTEGER NOT NULL DEFAULT 2, due_date TEXT, due_time TEXT, duration_min INTEGER,
  email_id INTEGER REFERENCES emails(id) ON DELETE SET NULL, source_key TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), completed_at TEXT);
CREATE UNIQUE INDEX IF NOT EXISTS tasks_source ON tasks(user_id, source_key) WHERE source_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS tasks_user ON tasks(user_id, status);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
  start TEXT NOT NULL, "end" TEXT NOT NULL, all_day INTEGER NOT NULL DEFAULT 0,
  kind TEXT NOT NULL DEFAULT 'event', task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  recur TEXT, exdates TEXT NOT NULL DEFAULT '[]', email_id INTEGER REFERENCES emails(id) ON DELETE SET NULL,
  source_key TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE UNIQUE INDEX IF NOT EXISTS events_source ON events(user_id, source_key) WHERE source_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS events_user ON events(user_id, start);
CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '', body TEXT NOT NULL DEFAULT '', pinned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS mail_accounts (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL, period_days INTEGER NOT NULL DEFAULT 14,
  last_sync_at TEXT, last_error TEXT);
CREATE TABLE IF NOT EXISTS emails (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  uidvalidity TEXT NOT NULL, uid INTEGER NOT NULL, message_id TEXT,
  from_name TEXT NOT NULL DEFAULT '', from_addr TEXT NOT NULL DEFAULT '', to_addr TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '', date TEXT NOT NULL, body TEXT NOT NULL DEFAULT '',
  attachments TEXT NOT NULL DEFAULT '[]', fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, uidvalidity, uid));
CREATE UNIQUE INDEX IF NOT EXISTS emails_msgid ON emails(user_id, message_id) WHERE message_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS mail_suggestions (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email_id INTEGER NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, title TEXT NOT NULL, date TEXT, time TEXT, snippet TEXT NOT NULL,
  inferred INTEGER NOT NULL DEFAULT 0, ambiguous INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending', source_key TEXT NOT NULL,
  UNIQUE (user_id, source_key));
CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL, content TEXT NOT NULL, proposal_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS proposals (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  summary TEXT NOT NULL, items TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
  undo TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), applied_at TEXT);
`);

export function tx(fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
}
export const all = (sql, ...p) => db.prepare(sql).all(...p);
export const get = (sql, ...p) => db.prepare(sql).get(...p);
export const run = (sql, ...p) => db.prepare(sql).run(...p);
