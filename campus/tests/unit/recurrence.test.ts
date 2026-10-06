import { describe, expect, it } from "vitest";
import { occurrences } from "@/lib/recurrence";
import { classItems, entryItems, applyFilters, ALL_FILTERS, upcomingDeadlines } from "@/lib/calendar";
import { entrySchema, type Entry } from "@/lib/entries";

const mk = (p: Partial<Entry>): Entry =>
  entrySchema.parse({ id: "e1", kind: "deadline", title: "Т", date: "2026-10-06", time: "23:59", tz: "Europe/Moscow", ...p });

describe("повторы", () => {
  it("без повтора", () => {
    expect(occurrences({ date: "2026-10-06", repeat: null }, "2026-10-01", "2026-10-31")).toEqual(["2026-10-06"]);
    expect(occurrences({ date: "2026-10-06", repeat: null }, "2026-10-07", "2026-10-31")).toEqual([]);
  });
  it("каждые 2 дня, окно позже старта", () => {
    const r = { freq: "daily" as const, interval: 2 };
    expect(occurrences({ date: "2026-10-01", repeat: r }, "2026-10-10", "2026-10-15")).toEqual(["2026-10-11", "2026-10-13", "2026-10-15"]);
  });
  it("по неделям с днями недели и until", () => {
    const r = { freq: "weekly" as const, interval: 1, weekdays: [0, 3], until: "2026-10-15" };
    expect(occurrences({ date: "2026-10-06", repeat: r }, "2026-10-01", "2026-11-30")).toEqual(["2026-10-08", "2026-10-12", "2026-10-15"]);
  });
  it("раз в 2 недели", () => {
    const r = { freq: "weekly" as const, interval: 2 };
    expect(occurrences({ date: "2026-10-06", repeat: r }, "2026-10-01", "2026-11-10")).toEqual(["2026-10-06", "2026-10-20", "2026-11-03"]);
  });
  it("ежемесячно 31-го — в коротких месяцах последний день", () => {
    const r = { freq: "monthly" as const, interval: 1 };
    expect(occurrences({ date: "2026-01-31", repeat: r }, "2026-01-01", "2026-04-30")).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  });
});

describe("календарь", () => {
  it("пары переводятся в пояс пользователя", () => {
    const [i] = classItems([{ id: "c", date: "2026-10-06", start: "10:00", end: "11:30", title: "A", location: "", teacher: "", cancelled: false, elective: false }], "Asia/Novosibirsk");
    expect([i.start, i.end]).toEqual([14 * 60, 15 * 60 + 30]);
  });
  it("дедлайн 23:59 МСК у студента во Владивостоке уходит на следующий день", () => {
    const items = entryItems([mk({})], "Asia/Vladivostok", "2026-10-01", "2026-10-31");
    expect(items[0].date).toBe("2026-10-07");
  });
  it("повторяющийся: выполнение по вхождениям", () => {
    const e = mk({ repeat: { freq: "daily", interval: 1 }, doneDates: ["2026-10-07"] });
    const items = entryItems([e], "Europe/Moscow", "2026-10-06", "2026-10-08");
    expect(items.map((i) => i.done)).toEqual([false, true, false]);
    expect(new Set(items.map((i) => i.key)).size).toBe(3);
  });
  it("фильтры и поиск", () => {
    const items = entryItems([mk({ title: "Эссе по КСО" }), mk({ id: "n", kind: "note", title: "Идея" })], "Europe/Moscow", "2026-10-01", "2026-10-31");
    expect(applyFilters(items, { ...ALL_FILTERS, note: false })).toHaveLength(1);
    expect(applyFilters(items, { ...ALL_FILTERS, query: "ксо" })).toHaveLength(1);
  });
  it("просроченные дедлайны помечаются", () => {
    const e = mk({ date: "2026-10-01", time: null });
    const [u] = upcomingDeadlines([e], "Europe/Moscow", "2026-10-06", 600);
    expect(u.overdue).toBe(true);
  });
});

describe("валидация", () => {
  it("название ≤160 и обязательно", () => {
    expect(entrySchema.safeParse({ id: "x", kind: "note", title: "", date: "2026-10-06", time: null, tz: "Europe/Moscow" }).success).toBe(false);
    expect(entrySchema.safeParse({ id: "x", kind: "note", title: "a".repeat(161), date: "2026-10-06", time: null, tz: "Europe/Moscow" }).success).toBe(false);
    expect(entrySchema.safeParse({ id: "x", kind: "note", title: "ok", date: "2026-13-40", time: null, tz: "Europe/Moscow" }).success).toBe(false);
  });
});
