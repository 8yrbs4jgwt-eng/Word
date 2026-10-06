import { describe, expect, it } from "vitest";
import { openDb } from "@/lib/db";
import { authenticate, createUser, hashPassword, startSession, userByToken, verifyPassword } from "@/lib/auth";

describe("auth", () => {
  it("хэш пароля проверяется", () => {
    const h = hashPassword("секретный-пароль");
    expect(verifyPassword("секретный-пароль", h)).toBe(true);
    expect(verifyPassword("другой", h)).toBe(false);
    expect(verifyPassword("x", "garbage")).toBe(false);
  });
  it("регистрация, вход, сессия", () => {
    const db = openDb(":memory:");
    const u = createUser(db, "a@b.ru", "12345678", "Алина")!;
    expect(u).toBeTruthy();
    expect(createUser(db, "a@b.ru", "other-pass", "")).toBeNull();
    expect(authenticate(db, "a@b.ru", "12345678")?.id).toBe(u.id);
    expect(authenticate(db, "a@b.ru", "wrong")).toBeNull();
    expect(authenticate(db, "no@b.ru", "12345678")).toBeNull();
    const s = startSession(db, u.id);
    expect(userByToken(db, s.token)?.email).toBe("a@b.ru");
    expect(userByToken(db, "bad")).toBeNull();
  });
});
