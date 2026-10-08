import type { NextRequest } from "next/server";
import { userByFeedToken } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { entrySchema, type Entry } from "@/lib/entries";
import { buildIcs } from "@/lib/ics";
import { applySelection } from "@/lib/selection";
import { getWeekEvents } from "@/lib/spbu/client";
import type { ClassEvent } from "@/lib/spbu/types";
import { addDays, mondayOf, todayIn } from "@/lib/time";

/** Подписка на календарь: /api/feed?token=… — личные записи и пары сохранённой группы. */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const db = getDb();
  const user = token ? userByFeedToken(db, token) : null;
  if (!user) return new Response("Not found", { status: 404 });

  const rows = db.prepare("SELECT data FROM entries WHERE user_id = ?").all(user.id) as { data: string }[];
  const entries: Entry[] = rows.flatMap((r) => {
    const p = entrySchema.safeParse(JSON.parse(r.data));
    return p.success ? [p.data] : [];
  });

  let classes: ClassEvent[] = [];
  if (user.settings.group) {
    const monday = mondayOf(todayIn("Europe/Moscow"));
    const weeks = Array.from({ length: 10 }, (_, i) => addDays(monday, (i - 1) * 7));
    const res = await Promise.allSettled(weeks.map((w) => getWeekEvents(user.settings.group!.id, w)));
    classes = applySelection(
      res.flatMap((r) => (r.status === "fulfilled" ? r.value.data : [])),
      user.settings.selection,
      user.settings.group.id,
    );
  }

  return new Response(buildIcs({ name: "Лекторий", entries, classes }), {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'inline; filename="lektorij.ics"',
      "cache-control": "private, max-age=900",
    },
  });
}
