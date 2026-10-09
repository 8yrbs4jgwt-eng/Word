import { json } from "@/lib/api";
import { describeDbError, getDb } from "@/lib/db";

/** Диагностика: открыть /api/health в браузере — видно, подключена ли база и какая. */
export async function GET() {
  try {
    const db = await getDb();
    await db.get("SELECT 1 AS ok");
    return json({ ok: true, db: db.kind });
  } catch (e) {
    return json({ ok: false, db: process.env.DATABASE_URL ? "postgres" : "sqlite", error: describeDbError(e) }, { status: 503 });
  }
}
