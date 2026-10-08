import { describe, expect, it } from "vitest";
import { authenticate, createUser, hashPassword, startSession, userByFeedToken, userByToken, verifyPassword } from "@/lib/auth";
import { backends } from "./helpers/db";

describe("пароли", () => {
  it("хэш пароля проверяется", () => {
    const h = hashPassword("секретный-пароль");
    expect(verifyPassword("секретный-пароль", h)).toBe(true);
    expect(verifyPassword("другой", h)).toBe(false);
    expect(verifyPassword("x", "garbage")).toBe(false);
  });
});

describe.each(backends)("аккаунты ($name)", ({ open }) => {
  it("регистрация, вход, сессия, токен подписки", async () => {
    const db = await open();
    const u = (await createUser(db, "a@b.ru", "12345678", "Алина"))!;
    expect(u).toBeTruthy();
    expect(await createUser(db, "a@b.ru", "other-pass", "")).toBeNull(); // email занят
    expect((await authenticate(db, "a@b.ru", "12345678"))?.id).toBe(u.id);
    expect(await authenticate(db, "a@b.ru", "wrong")).toBeNull();
    expect(await authenticate(db, "no@b.ru", "12345678")).toBeNull();
    const s = await startSession(db, u.id);
    expect((await userByToken(db, s.token))?.email).toBe("a@b.ru");
    expect(await userByToken(db, "bad")).toBeNull();
    expect((await userByFeedToken(db, u.feedToken))?.id).toBe(u.id);
    expect(await userByFeedToken(db, "nope")).toBeNull();
    await db.close();
  });

  it("просроченная сессия не действует", async () => {
    const db = await open();
    const u = (await createUser(db, "x@y.ru", "12345678", ""))!;
    const s = await startSession(db, u.id);
    await db.run("UPDATE sessions SET expires_at = ?", Date.now() - 1000);
    expect(await userByToken(db, s.token)).toBeNull();
    await db.close();
  });

  it("параллельная регистрация одного email — создаётся ровно один аккаунт", async () => {
    const db = await open();
    const r = await Promise.all([1, 2, 3, 4].map(() => createUser(db, "same@b.ru", "12345678", "")));
    expect(r.filter(Boolean)).toHaveLength(1);
    await db.close();
  });
});
