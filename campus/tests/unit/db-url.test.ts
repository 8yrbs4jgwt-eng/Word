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
