import type { ClassEvent, Division, Group, ProgramLevel } from "./types";

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === "object" ? (v as Json) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

export function normalizeDivisions(raw: unknown): Division[] {
  return arr(raw)
    .map((d) => ({ alias: str(obj(d).Alias), name: str(obj(d).Name) }))
    .filter((d) => d.alias && d.name)
    .sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

export function normalizeLevels(raw: unknown): ProgramLevel[] {
  return arr(raw).map((lvl) => ({
    level: str(obj(lvl).StudyLevelName),
    programs: arr(obj(lvl).StudyProgramCombinations).map((p) => ({
      name: str(obj(p).Name),
      years: arr(obj(p).AdmissionYears)
        .map(obj)
        .filter((y) => y.IsEmpty !== true)
        .map((y) => ({ id: Number(y.StudyProgramId), year: Number(y.YearNumber) }))
        .filter((y) => Number.isFinite(y.id) && Number.isFinite(y.year))
        .sort((a, b) => b.year - a.year),
    })),
  }));
}

export function normalizeGroups(raw: unknown): Group[] {
  return arr(obj(raw).Groups)
    .map((g) => ({
      id: Number(obj(g).StudentGroupId),
      name: str(obj(g).StudentGroupName),
      form: str(obj(g).StudentGroupStudyForm),
      profiles: str(obj(g).StudentGroupProfiles),
    }))
    .filter((g) => Number.isFinite(g.id) && g.name);
}

/** "2026-10-05T09:30:00" → ["2026-10-05", "09:30"] */
function splitLocal(v: unknown): [string, string] | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(str(v));
  return m ? [m[1], m[2]] : null;
}

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function normalizeEvents(raw: unknown, groupId: number): ClassEvent[] {
  const out: ClassEvent[] = [];
  for (const day of arr(obj(raw).Days)) {
    for (const e of arr(obj(day).DayStudyEvents)) {
      const ev = obj(e);
      const s = splitLocal(ev.Start);
      if (!s) continue;
      const en = splitLocal(ev.End);
      const allDay = ev.AllDay === true;
      const title = str(ev.Subject);
      const location = str(ev.LocationsDisplayText);
      out.push({
        id: `c${groupId}-${hash(`${ev.Start}|${title}|${location}`)}`,
        date: s[0],
        start: allDay ? null : s[1],
        end: allDay || !en ? null : en[1],
        title,
        location,
        teacher: str(ev.EducatorsDisplayText),
        cancelled: ev.IsCancelled === true,
        elective: ev.IsElective === true,
      });
    }
  }
  return out.sort((a, b) => (a.date + (a.start ?? "")).localeCompare(b.date + (b.start ?? "")));
}
