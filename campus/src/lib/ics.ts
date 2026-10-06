import type { Entry } from "@/lib/entries";
import type { ClassEvent } from "@/lib/spbu/types";
import { SPBU_TZ, addDays, toInstant } from "@/lib/time";

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Складывание строк по 75 октетов (RFC 5545 §3.1), без разрыва многобайтных символов. */
export function fold(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = "";
  let size = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    const limit = out.length === 0 ? 75 : 74; // продолжение начинается с пробела
    if (size + n > limit) {
      out.push(cur);
      cur = "";
      size = 0;
    }
    cur += ch;
    size += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}

const utcStamp = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const dateStamp = (ymd: string) => ymd.replace(/-/g, "");
const localStamp = (ymd: string, hm: string) => `${dateStamp(ymd)}T${hm.replace(":", "")}00`;
const BYDAY = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

function rrule(r: NonNullable<Entry["repeat"]>, entryTz: string): string {
  const p = [`FREQ=${r.freq.toUpperCase()}`, `INTERVAL=${r.interval}`];
  if (r.freq === "weekly" && r.weekdays?.length) p.push(`BYDAY=${[...r.weekdays].sort().map((d) => BYDAY[d]).join(",")}`);
  if (r.until) p.push(`UNTIL=${utcStamp(toInstant(r.until, "23:59", entryTz))}`);
  return `RRULE:${p.join(";")}`;
}

export function entryToVevent(e: Entry, now = Date.now()): string[] {
  const L: string[] = ["BEGIN:VEVENT", `UID:${e.id}@campus`, `DTSTAMP:${utcStamp(now)}`];
  const prefix = e.kind === "deadline" ? "Дедлайн: " : "";
  L.push(`SUMMARY:${esc(prefix + e.title)}`);
  if (e.time) {
    const startMs = toInstant(e.date, e.time, e.tz);
    const dueLike = e.kind === "deadline";
    // дедлайн — отрезок в 30 минут, заканчивающийся в момент срока
    const s = dueLike ? startMs - 30 * 60_000 : startMs;
    const en = dueLike ? startMs : startMs + 30 * 60_000;
    if (e.repeat) {
      const hm = (ms: number) => new Date(ms + (toInstant(e.date, e.time!, "UTC") - startMs)).toISOString().slice(11, 16);
      L.push(`DTSTART;TZID=${e.tz}:${localStamp(e.date, hm(s))}`, `DTEND;TZID=${e.tz}:${localStamp(e.date, hm(en))}`);
    } else {
      L.push(`DTSTART:${utcStamp(s)}`, `DTEND:${utcStamp(en)}`);
    }
  } else {
    L.push(`DTSTART;VALUE=DATE:${dateStamp(e.date)}`, `DTEND;VALUE=DATE:${dateStamp(addDays(e.date, 1))}`);
  }
  if (e.repeat) L.push(rrule(e.repeat, e.tz));
  const desc = [e.subject && `Предмет: ${e.subject}`, e.body].filter(Boolean).join("\n");
  if (desc) L.push(`DESCRIPTION:${esc(desc)}`);
  L.push(`CATEGORIES:${e.kind === "deadline" ? "Дедлайн" : "Заметка"}`);
  if (e.priority === "high") L.push("PRIORITY:1");
  if (e.done && !e.repeat) L.push("STATUS:CONFIRMED", "TRANSP:TRANSPARENT");
  if (e.remind !== null && e.time) {
    L.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(e.title)}`, `TRIGGER:-PT${e.remind}M`, "END:VALARM");
  }
  L.push("END:VEVENT");
  return L;
}

export function classToVevent(c: ClassEvent, now = Date.now()): string[] {
  const L = ["BEGIN:VEVENT", `UID:${c.id}@campus`, `DTSTAMP:${utcStamp(now)}`, `SUMMARY:${esc(c.title)}`];
  if (c.start && c.end) {
    L.push(`DTSTART:${utcStamp(toInstant(c.date, c.start, SPBU_TZ))}`, `DTEND:${utcStamp(toInstant(c.date, c.end, SPBU_TZ))}`);
  } else {
    L.push(`DTSTART;VALUE=DATE:${dateStamp(c.date)}`, `DTEND;VALUE=DATE:${dateStamp(addDays(c.date, 1))}`);
  }
  if (c.location) L.push(`LOCATION:${esc(c.location)}`);
  if (c.teacher) L.push(`DESCRIPTION:${esc(c.teacher)}`);
  L.push("CATEGORIES:Пара");
  if (c.cancelled) L.push("STATUS:CANCELLED");
  L.push("END:VEVENT");
  return L;
}

export function buildIcs(opts: { name: string; entries: Entry[]; classes?: ClassEvent[]; now?: number }): string {
  const now = opts.now ?? Date.now();
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Кампус//Расписание и дедлайны//RU",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(opts.name)}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
    "X-PUBLISHED-TTL:PT6H",
    ...(opts.classes ?? []).flatMap((c) => classToVevent(c, now)),
    ...opts.entries.flatMap((e) => entryToVevent(e, now)),
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
