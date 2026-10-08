import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { normalizeDivisions, normalizeEvents, normalizeGroups, normalizeLevels } from "@/lib/spbu/normalize";

const fx = (n: string) => JSON.parse(fs.readFileSync(`tests/fixtures/${n}.json`, "utf8"));

describe("normalize", () => {
  it("направления отсортированы по имени", () => {
    const d = normalizeDivisions(fx("divisions"));
    expect(d.length).toBeGreaterThan(10);
    expect(d[0]).toHaveProperty("alias");
    const names = d.map((x) => x.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "ru")));
  });

  it("программы: годы по убыванию", () => {
    const l = normalizeLevels(fx("levels"));
    expect(l[0].level).toBe("Бакалавриат");
    const years = l[0].programs[0].years.map((y) => y.year);
    expect(years).toEqual([...years].sort((a, b) => b - a));
  });

  it("группы", () => {
    const g = normalizeGroups(fx("groups"));
    expect(g[0]).toMatchObject({ id: 459577, name: "26.Б81-мм", form: "очная" });
  });

  it("пары недели", () => {
    const e = normalizeEvents(fx("events-week"), 459577);
    expect(e).toHaveLength(34);
    expect(e[0]).toMatchObject({ date: "2026-10-05", start: "09:30", end: "11:05", cancelled: false });
    expect(e[0].teacher).toContain("Антоник");
    expect(new Set(e.map((x) => x.id)).size).toBeGreaterThan(30);
  });

  it("мусор не роняет парсер", () => {
    expect(normalizeEvents(null, 1)).toEqual([]);
    expect(normalizeEvents({ Days: [{ DayStudyEvents: [{ Start: "bad" }] }] }, 1)).toEqual([]);
    expect(normalizeGroups("x")).toEqual([]);
  });
});
