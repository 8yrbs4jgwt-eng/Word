import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { normalizeEvents } from "@/lib/spbu/normalize";
import { applySelection, buildCatalog, disciplineOf, displayName, kindOf, NONE, slotKey, undecidedElectives, unresolvedSlots, type Selection } from "@/lib/selection";

const events = normalizeEvents(JSON.parse(fs.readFileSync("tests/fixtures/events-week.json", "utf8")), 1);

describe("выбор дисциплин и подгрупп", () => {
  it("название и вид занятия", () => {
    expect(disciplineOf("Алгебра, лекция")).toBe("Алгебра");
    expect(kindOf("Алгебра, лекция")).toBe("лекция");
    expect(disciplineOf("Без вида")).toBe("Без вида");
    expect(disciplineOf("Русский язык как иностранный, сам. работа в присутствии преподавателя")).toBe("Русский язык как иностранный");
  });

  it("каталог находит параллельные подгруппы английского", () => {
    const c = buildCatalog(events);
    expect(c.disciplines.map((d) => d.name)).toContain("Английский язык");
    const mon = c.slots.find((s) => s.title.startsWith("Английский язык") && s.weekday === 0)!;
    expect(mon.start).toBe("11:15");
    expect(mon.options.length).toBe(7);
    // слоты без параллельных вариантов не попадают в список выбора
    expect(c.slots.some((s) => s.title === "Алгебра, лекция")).toBe(false);
  });

  it("без выбора и для чужой группы — всё показывается", () => {
    expect(applySelection(events, null, 1)).toHaveLength(events.length);
    const sel: Selection = { groupId: 2, hidden: ["Алгебра"], picks: {} };
    expect(applySelection(events, sel, 1)).toHaveLength(events.length);
  });

  it("скрытая дисциплина пропадает целиком", () => {
    const sel: Selection = { groupId: 1, hidden: ["Алгебра"], picks: {} };
    const r = applySelection(events, sel, 1);
    expect(r.some((e) => disciplineOf(e.title) === "Алгебра")).toBe(false);
    expect(r.length).toBeLessThan(events.length);
  });

  it("выбор преподавателя оставляет один вариант в слоте", () => {
    const eng = events.find((e) => e.title.startsWith("Английский язык") && e.date === "2026-10-05")!;
    const sel: Selection = { groupId: 1, hidden: [], picks: { [slotKey(eng)]: eng.teacher } };
    const r = applySelection(events, sel, 1).filter((e) => slotKey(e) === slotKey(eng));
    expect(r).toHaveLength(1);
    expect(r[0].teacher).toBe(eng.teacher);
  });

  it("«не хожу» скрывает слот целиком", () => {
    const eng = events.find((e) => e.title.startsWith("Английский язык") && e.date === "2026-10-05")!;
    const sel: Selection = { groupId: 1, hidden: [], picks: { [slotKey(eng)]: NONE } };
    expect(applySelection(events, sel, 1).filter((e) => slotKey(e) === slotKey(eng))).toHaveLength(0);
  });

  it("неразрешённые слоты: уменьшаются по мере выбора и не считают скрытые дисциплины", () => {
    const all = unresolvedSlots(events, null, 1);
    expect(all.length).toBeGreaterThan(0);
    const sel: Selection = { groupId: 1, hidden: ["Английский язык"], picks: {} };
    expect(unresolvedSlots(events, sel, 1).some((s) => s.title.startsWith("Английский язык"))).toBe(false);
    const first = all[0];
    const sel2: Selection = { groupId: 1, hidden: [], picks: { [first.key]: first.options[0].teacher } };
    expect(unresolvedSlots(events, sel2, 1)).toHaveLength(all.length - 1);
  });
});

describe("элективы", () => {
  const withElectives = events.map((e, i) => ({ ...e, elective: e.title.startsWith("Информатика") || i === 0 && false }));
  it("пока студент не выбирал — показываются все, но есть неопределённые", () => {
    expect(applySelection(withElectives, null, 1)).toHaveLength(events.length);
    expect(undecidedElectives(withElectives, null, 1)).toEqual(["Информатика"]);
  });
  it("после выбора остаются только отмеченные элективы", () => {
    const none: Selection = { groupId: 1, hidden: [], picks: {}, electives: [] };
    expect(applySelection(withElectives, none, 1).some((e) => e.title.startsWith("Информатика"))).toBe(false);
    expect(applySelection(withElectives, none, 1).length).toBeLessThan(events.length);
    const mine: Selection = { groupId: 1, hidden: [], picks: {}, electives: ["Информатика"] };
    expect(applySelection(withElectives, mine, 1)).toHaveLength(events.length);
    expect(undecidedElectives(withElectives, mine, 1)).toEqual([]);
  });
  it("обычные дисциплины электив-выбор не затрагивает", () => {
    const none: Selection = { groupId: 1, hidden: [], picks: {}, electives: [] };
    expect(applySelection(withElectives, none, 1).some((e) => e.title.startsWith("Алгебра"))).toBe(true);
  });
});

describe("реальные данные: ГМУ 23.Б09 (электив и факультатив — префикс в названии)", () => {
  const gmu = normalizeEvents(JSON.parse(fs.readFileSync("tests/fixtures/events-gmu.json", "utf8")), 475007);

  it("IsElective в API не выставлен, но элективы и факультативы распознаются по префиксу", () => {
    const raw = JSON.parse(fs.readFileSync("tests/fixtures/events-gmu.json", "utf8"));
    const flags = raw.Days.flatMap((d: { DayStudyEvents: { IsElective: boolean }[] }) => d.DayStudyEvents.map((e) => e.IsElective));
    expect(flags.every((f: boolean) => f === false)).toBe(true);
    const opt = new Set(gmu.filter((e) => e.elective).map((e) => disciplineOf(e.title)));
    expect([...opt].some((n) => n.startsWith("Электив. "))).toBe(true);
    expect([...opt].some((n) => n.startsWith("Факультатив. "))).toBe(true);
    expect(gmu.filter((e) => !e.elective).every((e) => !/^(Электив|Факультатив)\./.test(e.title))).toBe(true);
    expect(gmu.some((e) => e.title.startsWith("Государственные закупки") && !e.elective)).toBe(true);
  });

  it("студент выбрал один электив — остальные пропали, обычные предметы на месте", () => {
    const mine = "Электив. Лидерство";
    const sel: Selection = { groupId: 475007, hidden: [], picks: {}, electives: [mine] };
    const r = applySelection(gmu, sel, 475007);
    const optional = new Set(r.filter((e) => e.elective).map((e) => disciplineOf(e.title)));
    expect([...optional]).toEqual([mine]);
    expect(r.some((e) => e.title.startsWith("Государственные закупки"))).toBe(true);
    expect(r.length).toBeLessThan(gmu.length);
  });

  it("пока не выбирал — все элективы в списке неопределённых", () => {
    const u = undecidedElectives(gmu, null, 475007);
    expect(u.length).toBeGreaterThanOrEqual(8);
    expect(u).toContain("Факультатив. Испанский язык");
  });

  it("название для показа без префикса", () => {
    expect(displayName("Электив. Лидерство")).toBe("Лидерство");
    expect(displayName("Факультатив. Испанский язык")).toBe("Испанский язык");
    expect(displayName("Алгебра")).toBe("Алгебра");
  });
});
