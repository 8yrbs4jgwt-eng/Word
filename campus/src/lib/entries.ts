import { z } from "zod";
import { isHm, isValidTz, isYmd } from "@/lib/time";

export const REMIND_OPTIONS = [
  { value: null, label: "Не напоминать" },
  { value: 0, label: "В момент срока" },
  { value: 60, label: "За 1 час" },
  { value: 180, label: "За 3 часа" },
  { value: 1440, label: "За день" },
  { value: 2880, label: "За 2 дня" },
] as const;

const ymd = z.string().refine(isYmd, "Некорректная дата");

export const repeatSchema = z
  .object({
    freq: z.enum(["daily", "weekly", "monthly"]),
    interval: z.number().int().min(1).max(52).default(1),
    /** для weekly: дни недели 0=пн … 6=вс; пусто — день недели начальной даты */
    weekdays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
    until: ymd.optional(),
  })
  .nullable();

export const entrySchema = z.object({
  id: z.string().min(1).max(64),
  kind: z.enum(["deadline", "note"]),
  title: z.string().trim().min(1, "Введите название").max(160, "Не длиннее 160 символов"),
  date: ymd,
  time: z.string().refine(isHm, "Время в формате ЧЧ:ММ").nullable(),
  tz: z.string().refine(isValidTz, "Неизвестный часовой пояс"),
  subject: z.string().trim().max(160).default(""),
  body: z.string().max(5000, "Не длиннее 5000 символов").default(""),
  done: z.boolean().default(false),
  /** даты вхождений повторяющейся записи, отмеченные выполненными */
  doneDates: z.array(ymd).max(2000).default([]),
  priority: z.enum(["normal", "high"]).default("normal"),
  repeat: repeatSchema.default(null),
  /** за сколько минут напомнить; null — без напоминания */
  remind: z.number().int().min(0).max(60 * 24 * 14).nullable().default(null),
  updatedAt: z.number().int().default(0),
});

export type Entry = z.infer<typeof entrySchema>;
export type Repeat = NonNullable<Entry["repeat"]>;

export const settingsSchema = z.object({
  tz: z.string().refine(isValidTz).default("Europe/Moscow"),
  theme: z.enum(["system", "light", "dark"]).default("system"),
  group: z.object({ id: z.number().int(), name: z.string().max(100) }).nullable().default(null),
  view: z.enum(["week", "month", "agenda"]).default("week"),
  /** выбор дисциплин и подгрупп для сохранённой группы */
  selection: z
    .object({
      groupId: z.number().int(),
      hidden: z.array(z.string().max(300)).max(300),
      /** выбранные элективы; undefined — студент ещё не выбирал (показываем все) */
      electives: z.array(z.string().max(300)).max(300).optional(),
      picks: z.record(z.string().max(400), z.string().max(300)).refine((r) => Object.keys(r).length <= 400),
    })
    .nullable()
    .default(null),
});
export type Settings = z.infer<typeof settingsSchema>;
export const DEFAULT_SETTINGS: Settings = settingsSchema.parse({});

export function newId(): string {
  return globalThis.crypto.randomUUID();
}
