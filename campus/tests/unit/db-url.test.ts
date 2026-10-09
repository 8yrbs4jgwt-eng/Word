import { describe, expect, it } from "vitest";
import { normalizePostgresUrl } from "@/lib/db";

describe("строка подключения к Postgres", () => {
  it("убирает channel_binding, остальное не трогает", () => {
    const u = normalizePostgresUrl("postgresql://user:p%40ss@ep-x-pooler.neon.tech/neondb?sslmode=require&channel_binding=require");
    expect(u).toBe("postgresql://user:p%40ss@ep-x-pooler.neon.tech/neondb?sslmode=require");
  });
  it("работает, если channel_binding первый или единственный", () => {
    expect(normalizePostgresUrl("postgres://u:p@h/db?channel_binding=require&sslmode=require")).toBe("postgres://u:p@h/db?sslmode=require");
    expect(normalizePostgresUrl("postgres://u:p@h/db?channel_binding=require")).toBe("postgres://u:p@h/db");
  });
  it("лишние пробелы и перевод строки при вставке не мешают", () => {
    expect(normalizePostgresUrl("  postgresql://u:p@h/db?sslmode=require \n")).toBe("postgresql://u:p@h/db?sslmode=require");
  });
  it("строка без параметров остаётся прежней", () => {
    expect(normalizePostgresUrl("postgres://u:p@localhost:5432/db")).toBe("postgres://u:p@localhost:5432/db");
  });
});

import { extractPostgresUrl, resolveTarget } from "@/lib/db";

describe("значение DATABASE_URL с лишним текстом", () => {
  const url = "postgresql://neondb_owner:pw@ep-x-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
  it("команда psql из окна Neon", () => {
    expect(extractPostgresUrl(`psql '${url}'`)).toBe(url);
    expect(extractPostgresUrl(`psql "${url}"`)).toBe(url);
  });
  it("кавычки, имя переменной и пробелы", () => {
    expect(extractPostgresUrl(`"${url}"`)).toBe(url);
    expect(extractPostgresUrl(`DATABASE_URL=${url}`)).toBe(url);
    expect(extractPostgresUrl(`  ${url}\n`)).toBe(url);
  });
  it("не ссылка — null", () => {
    expect(extractPostgresUrl("/data/campus.db")).toBeNull();
    expect(extractPostgresUrl("")).toBeNull();
  });
  it("нормализация тоже вынимает ссылку и убирает channel_binding", () => {
    expect(normalizePostgresUrl(`psql '${url}'`)).toBe("postgresql://neondb_owner:pw@ep-x-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require");
  });
  it("выбор подключения: Postgres из переменной, иначе SQLite; мусор в DATABASE_URL — понятная ошибка", () => {
    expect(resolveTarget({ DATABASE_URL: `psql '${url}'` })).toBe(url);
    expect(resolveTarget({ DATABASE_PATH: "/tmp/x.db" })).toBe("/tmp/x.db");
    expect(resolveTarget({ DATABASE_URL: "   ", DATABASE_PATH: "/tmp/y.db" })).toBe("/tmp/y.db");
    expect(() => resolveTarget({ DATABASE_URL: "что-то не то" })).toThrow(/postgresql:\/\//);
  });
});

import { describeDbError, describeValue } from "@/lib/db";

describe("диагностика без утечки секретов", () => {
  it("описание значения не содержит самого значения", () => {
    const d = describeValue("npg_SuperSecretPassword");
    expect(d).not.toContain("SuperSecret");
    expect(d).toContain("23 симв.");
    expect(d).toContain("есть «://»: нет");
  });
  it("в сообщении об ошибке ссылка с паролем вырезается, а обычный текст остаётся", () => {
    expect(describeDbError(new Error("fail postgresql://u:secret@host/db end"))).not.toContain("secret");
    expect(describeDbError(new Error("значение должно начинаться с postgresql:// (двоеточие)"))).toContain("postgresql://");
  });
  it("ошибка про неверное значение понятна и не раскрывает пароль", () => {
    let msg = "";
    try {
      resolveTarget({ DATABASE_URL: "npg_MkaSecret123" });
    } catch (e) {
      msg = describeDbError(e);
    }
    expect(msg).toContain("не ссылка на Postgres");
    expect(msg).not.toContain("MkaSecret");
  });
});
