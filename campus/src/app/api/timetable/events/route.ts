import type { NextRequest } from "next/server";
import { getWeekEvents } from "@/lib/spbu/client";
import { bad, upstream } from "@/lib/api";
import { isYmd, mondayOf } from "@/lib/time";

export function GET(req: NextRequest) {
  const group = Number(req.nextUrl.searchParams.get("group"));
  const week = req.nextUrl.searchParams.get("week") ?? "";
  if (!Number.isInteger(group) || group <= 0) return bad("Некорректная группа");
  if (!isYmd(week)) return bad("Некорректная дата");
  return upstream(() => getWeekEvents(group, mondayOf(week)));
}
