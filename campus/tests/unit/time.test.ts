import { describe, expect, it } from "vitest";
import { addDays, addMonths, convertWall, fmtMonthYear, fromInstant, mondayOf, monthGrid, toInstant, weekdayOf } from "@/lib/time";

describe("даты", () => {
  it("понедельник недели", () => {
    expect(mondayOf("2026-10-06")).toBe("2026-10-05");
    expect(mondayOf("2026-10-11")).toBe("2026-10-05");
    expect(mondayOf("2026-10-05")).toBe("2026-10-05");
    expect(weekdayOf("2026-10-11")).toBe(6);
  });
  it("addMonths не вылезает за конец месяца", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
  it("сетка месяца — 42 дня с понедельника", () => {
    const g = monthGrid("2026-10-06");
    expect(g).toHaveLength(42);
    expect(g[0]).toBe("2026-09-28");
    expect(weekdayOf(g[0])).toBe(0);
  });
  it("форматирование по-русски", () => {
    expect(fmtMonthYear("2026-10-06")).toMatch(/октябрь 2026/);
  });
});

describe("часовые пояса", () => {
  it("Москва ↔ Новосибирск (+4 ч)", () => {
    expect(convertWall("2026-10-06", "10:00", "Europe/Moscow", "Asia/Novosibirsk")).toEqual({ date: "2026-10-06", time: "14:00" });
  });
  it("переход через полночь", () => {
    expect(convertWall("2026-10-06", "23:59", "Europe/Moscow", "Asia/Vladivostok")).toEqual({ date: "2026-10-07", time: "06:59" });
  });
  it("летнее время в Берлине", () => {
    expect(convertWall("2026-07-01", "12:00", "Europe/Moscow", "Europe/Berlin")).toEqual({ date: "2026-07-01", time: "11:00" });
    expect(convertWall("2026-12-01", "12:00", "Europe/Moscow", "Europe/Berlin")).toEqual({ date: "2026-12-01", time: "10:00" });
  });
  it("round-trip", () => {
    const ms = toInstant("2026-10-06", "09:30", "Europe/Moscow");
    expect(ms).toBe(Date.parse("2026-10-06T06:30:00Z"));
    expect(fromInstant(ms, "Europe/Moscow")).toEqual({ date: "2026-10-06", time: "09:30" });
  });
});
