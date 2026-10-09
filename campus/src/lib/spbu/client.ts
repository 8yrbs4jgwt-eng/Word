import "server-only";
import { describeDbError, getDb, type Db } from "@/lib/db";
import { fetchCached } from "./cache";
import { normalizeDivisions, normalizeEvents, normalizeGroups, normalizeLevels } from "./normalize";
import type { Cached, ClassEvent, Division, Group, ProgramLevel } from "./types";

const BASE = process.env.SPBU_BASE_URL ?? "https://timetable.spbu.ru/api/v1";
const HOUR = 3600_000;

export class UpstreamError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

/** БД недоступна — работаем без кэша, но не молчим в логах. */
const db = (): Promise<Db | null> =>
  getDb().catch((e) => {
    console.error("[db] недоступна, расписание грузится без кэша:", describeDbError(e));
    return null;
  });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** GET JSON с таймаутом и повторами (сеть и 5xx). 4xx — сразу ошибка. */
export async function getJson(path: string, attempts = 3, timeoutMs = 10_000): Promise<unknown> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(`${BASE}${path}`, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { accept: "application/json" },
        cache: "no-store",
      });
      if (res.ok) return await res.json();
      if (res.status < 500) throw new UpstreamError(`timetable.spbu.ru: ${res.status}`, res.status);
      last = new UpstreamError(`timetable.spbu.ru: ${res.status}`, res.status);
    } catch (e) {
      if (e instanceof UpstreamError && (e.status ?? 500) < 500) throw e;
      last = e;
    }
    if (i < attempts - 1) await sleep(300 * 2 ** i);
  }
  throw last instanceof Error ? last : new UpstreamError("timetable.spbu.ru недоступен");
}

export const getDivisions = async (): Promise<Cached<Division[]>> =>
  fetchCached(await db(), "divisions", 24 * HOUR, async () => normalizeDivisions(await getJson("/study/divisions")));

export const getPrograms = async (alias: string): Promise<Cached<ProgramLevel[]>> =>
  fetchCached(await db(), `programs:${alias}`, 24 * HOUR, async () =>
    normalizeLevels(await getJson(`/study/divisions/${alias}/programs/levels`)),
  );

export const getGroups = async (programId: number): Promise<Cached<Group[]>> =>
  fetchCached(await db(), `groups:${programId}`, 24 * HOUR, async () =>
    normalizeGroups(await getJson(`/programs/${programId}/groups`)),
  );

/** weekMonday — YYYY-MM-DD понедельника (по Москве). */
export const getWeekEvents = async (groupId: number, weekMonday: string): Promise<Cached<ClassEvent[]>> =>
  fetchCached(await db(), `events:${groupId}:${weekMonday}`, 15 * 60_000, async () => {
    const end = addDays(weekMonday, 6);
    return normalizeEvents(await getJson(`/groups/${groupId}/events/${weekMonday}/${end}`), groupId);
  });

function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
