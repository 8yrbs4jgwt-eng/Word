import crypto from "node:crypto";
import { openDb, type Db } from "@/lib/db";

/**
 * Бэкенды для тестов: SQLite в памяти всегда; Postgres — если задан TEST_DATABASE_URL.
 * Каждый тест получает свою временную базу Postgres, поэтому файлы тестов безопасно идут параллельно.
 */
async function openIsolatedPostgres(): Promise<Db> {
  const base = new URL(process.env.TEST_DATABASE_URL!);
  const name = `t_${crypto.randomBytes(6).toString("hex")}`;
  const admin = await openDb(base.toString());
  await admin.run(`CREATE DATABASE ${name}`);
  const url = new URL(base);
  url.pathname = `/${name}`;
  const db = await openDb(url.toString());
  return {
    ...db,
    close: async () => {
      await db.close();
      await admin.run(`DROP DATABASE ${name}`);
      await admin.close();
    },
  };
}

export const backends: { name: string; open: () => Promise<Db> }[] = [
  { name: "sqlite", open: () => openDb(":memory:") },
  ...(process.env.TEST_DATABASE_URL ? [{ name: "postgres", open: openIsolatedPostgres }] : []),
];
