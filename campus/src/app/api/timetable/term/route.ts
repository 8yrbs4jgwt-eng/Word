import type { NextRequest } from "next/server";
import { getTermEvents } from "@/lib/spbu/client";
import { termWindow } from "@/lib/spbu/term";
import { bad, upstream } from "@/lib/api";
import { todayIn } from "@/lib/time";

/** Занятия группы за весь семестр — для списка дисциплин, элективов и подгрупп. */
export function GET(req: NextRequest) {
  const group = Number(req.nextUrl.searchParams.get("group"));
  if (!Number.isInteger(group) || group <= 0) return bad("Некорректная группа");
  const { from, to } = termWindow(todayIn("Europe/Moscow"));
  return upstream(() => getTermEvents(group, from, to));
}
