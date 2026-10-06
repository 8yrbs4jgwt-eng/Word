import { describe, expect, it } from "vitest";
import { buildIcs, fold } from "@/lib/ics";
import { entrySchema } from "@/lib/entries";

const e = (p: object) => entrySchema.parse({ id: "id1", kind: "deadline", title: "Презентация, КСО", date: "2026-10-13", time: "23:59", tz: "Europe/Moscow", ...p });
const NOW = Date.parse("2026-10-06T00:00:00Z");

describe("ics", () => {
  it("структура и экранирование", () => {
    const s = buildIcs({ name: "Кампус", entries: [e({ body: "строка1\nстрока2; ещё" })], now: NOW });
    expect(s.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(s.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(s).toContain("SUMMARY:Дедлайн: Презентация\\, КСО");
    expect(s).toContain("строка1\\nстрока2\; ещё");
    expect(s).toContain("DTEND:20261013T205900Z"); // 23:59 МСК = 20:59 UTC
    expect(s).toContain("DTSTART:20261013T202900Z");
  });
  it("повтор и напоминание", () => {
    const s = buildIcs({ name: "K", entries: [e({ repeat: { freq: "weekly", interval: 2, weekdays: [0, 2], until: "2026-12-01" }, remind: 60 })], now: NOW });
    expect(s).toContain("RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;UNTIL=");
    expect(s).toContain("TRIGGER:-PT60M");
    expect(s).toContain("DTSTART;TZID=Europe/Moscow:20261013T232900");
  });
  it("запись без времени — на весь день", () => {
    const s = buildIcs({ name: "K", entries: [e({ kind: "note", time: null })], now: NOW });
    expect(s).toContain("DTSTART;VALUE=DATE:20261013");
    expect(s).toContain("DTEND;VALUE=DATE:20261014");
  });
  it("пары", () => {
    const s = buildIcs({ name: "K", entries: [], classes: [{ id: "c1", date: "2026-10-05", start: "09:30", end: "11:05", title: "Алгебра", location: "Ауд. 2", teacher: "", cancelled: true, elective: false }], now: NOW });
    expect(s).toContain("DTSTART:20261005T063000Z");
    expect(s).toContain("STATUS:CANCELLED");
  });
  it("строки не длиннее 75 октетов", () => {
    const long = "я".repeat(200);
    const f = fold(`SUMMARY:${long}`);
    for (const line of f.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(f.replace(/\r\n /g, "")).toBe(`SUMMARY:${long}`);
  });
});
