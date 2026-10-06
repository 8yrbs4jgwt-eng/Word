import { describe, expect, it } from "vitest";
import { dueReminders } from "@/lib/reminders";
import { entrySchema, type Entry } from "@/lib/entries";
import { toInstant } from "@/lib/time";

const mk = (p: Partial<Entry>) => entrySchema.parse({ id: "e", kind: "deadline", title: "Эссе", date: "2026-10-13", time: "12:00", tz: "Europe/Moscow", remind: 60, ...p });
const at = (d: string, t: string) => toInstant(d, t, "Europe/Moscow");

describe("напоминания", () => {
  it("срабатывает за час до срока", () => {
    const r = dueReminders([mk({})], at("2026-10-13", "11:00"));
    expect(r).toHaveLength(1);
    expect(r[0].body).toContain("через 1 ч");
  });
  it("не срабатывает раньше", () => expect(dueReminders([mk({})], at("2026-10-13", "10:59"))).toHaveLength(0));
  it("догоняет в пределах 15 минут, дальше — нет", () => {
    expect(dueReminders([mk({})], at("2026-10-13", "11:10"))).toHaveLength(1);
    expect(dueReminders([mk({})], at("2026-10-13", "11:20"))).toHaveLength(0);
  });
  it("выполненные и без времени пропускаются", () => {
    expect(dueReminders([mk({ done: true })], at("2026-10-13", "11:00"))).toHaveLength(0);
    expect(dueReminders([mk({ time: null })], at("2026-10-13", "11:00"))).toHaveLength(0);
    expect(dueReminders([mk({ remind: null })], at("2026-10-13", "11:00"))).toHaveLength(0);
  });
  it("за день до срока", () => {
    const r = dueReminders([mk({ remind: 1440 })], at("2026-10-12", "12:00"));
    expect(r[0].body).toContain("через 1 дн.");
  });
  it("повторяющийся: ключ уникален для каждого вхождения, выполненное пропускается", () => {
    const e = mk({ date: "2026-10-06", repeat: { freq: "weekly", interval: 1 }, doneDates: ["2026-10-13"] });
    expect(dueReminders([e], at("2026-10-13", "11:00"))).toHaveLength(0);
    const r = dueReminders([e], at("2026-10-20", "11:00"));
    expect(r[0].key).toBe("e@2026-10-20@60");
  });
});
