import type { NextRequest } from "next/server";
import { getGroups } from "@/lib/spbu/client";
import { bad, upstream } from "@/lib/api";

export function GET(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get("program"));
  if (!Number.isInteger(id) || id <= 0) return bad("Некорректная программа");
  return upstream(() => getGroups(id));
}
