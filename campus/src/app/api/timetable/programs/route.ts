import type { NextRequest } from "next/server";
import { getPrograms } from "@/lib/spbu/client";
import { bad, upstream } from "@/lib/api";

export function GET(req: NextRequest) {
  const division = req.nextUrl.searchParams.get("division") ?? "";
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(division)) return bad("Некорректное направление");
  return upstream(() => getPrograms(division));
}
