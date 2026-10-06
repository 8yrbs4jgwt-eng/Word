import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";

async function open(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

async function pickGroup(page: Page) {
  await page.getByRole("button", { name: "Выбрать группу" }).first().click();
  const dlg = page.getByRole("dialog", { name: "Найдите свою группу" });
  await dlg.getByLabel("Поиск направления").fill("Математика и компьютерные");
  await dlg.getByRole("button", { name: /Математика и компьютерные науки/ }).first().click();
  await dlg.getByRole("button", { name: /поступление/ }).first().click();
  await dlg.getByRole("button", { name: /^\d\d\.Б/ }).first().click();
  await dlg.getByRole("button", { name: "Это моя группа" }).click();
}

async function addDeadline(page: Page, title: string, opts: { date?: string; time?: string; repeat?: "daily" | "weekly" } = {}) {
  await page.getByRole("button", { name: "Добавить запись" }).click();
  const dlg = page.getByRole("dialog", { name: "Новая запись" });
  await dlg.getByLabel("Название").fill(title);
  if (opts.date) await dlg.getByLabel("Сдать до").fill(opts.date);
  else await dlg.getByLabel("Сдать до").fill(new Date(Date.now() + 2 * 86400_000).toISOString().slice(0, 10));
  if (opts.time) await dlg.getByLabel("Время").fill(opts.time);
  if (opts.repeat) await dlg.getByLabel("Повторять").selectOption(opts.repeat);
  await dlg.getByRole("button", { name: "Добавить дедлайн" }).click();
}

test("гость: дедлайн создаётся, отмечается выполненным и переживает перезагрузку", async ({ page }) => {
  await open(page);
  await addDeadline(page, "Эссе по экономике труда");
  const panel = page.getByRole("region", { name: "Ближайшие дедлайны" });
  await expect(panel.getByText("Эссе по экономике труда")).toBeVisible();
  await expect(page.getByText("Запись сохранена")).toBeVisible();

  await page.reload();
  await expect(page.getByRole("region", { name: "Ближайшие дедлайны" }).getByText("Эссе по экономике труда")).toBeVisible();

  await page.getByRole("checkbox", { name: /Отметить выполненным: Эссе/ }).click();
  await expect(page.getByRole("region", { name: "Ближайшие дедлайны" }).getByText("Открытых дедлайнов нет")).toBeVisible();
});

test("валидация: пустое название и счётчик символов", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Добавить запись" }).click();
  const dlg = page.getByRole("dialog", { name: "Новая запись" });
  await dlg.getByRole("button", { name: "Добавить дедлайн" }).click();
  await expect(dlg.getByRole("alert").first()).toContainText("Введите название");
  await dlg.getByLabel("Название").fill("a".repeat(160));
  await expect(dlg.getByText("160/160")).toBeVisible();
});

test("выбор группы показывает пары и сохраняется", async ({ page }) => {
  await open(page);
  await pickGroup(page);
  await expect(page.getByRole("button", { name: /Моя группа · 26\./ })).toBeVisible();
  await page.getByRole("tab", { name: "Список" }).click();
  await expect(page.getByRole("button", { name: /^Пара, .*Алгебра/ }).first()).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: /Моя группа · 26\./ })).toBeVisible();
});

test("фильтры: скрыть пары, поиск", async ({ page }) => {
  await open(page);
  await pickGroup(page);
  await page.getByRole("tab", { name: "Список" }).click();
  await expect(page.getByRole("button", { name: /^Пара, / }).first()).toBeVisible();
  await page.getByRole("button", { name: "Пары" }).click();
  await expect(page.getByRole("button", { name: /^Пара, / })).toHaveCount(0);
  await page.getByRole("button", { name: "Пары" }).click();
  await page.getByLabel(/Поиск по предметам/).fill("Алгебра");
  const n = await page.getByRole("button", { name: /^Пара, / }).count();
  expect(n).toBeGreaterThan(0);
  for (const t of await page.getByRole("button", { name: /^Пара, / }).allTextContents()) expect(t).toContain("Алгебра");
});

test("повторяющийся дедлайн раскладывается по дням", async ({ page }) => {
  await open(page);
  const today = new Date().toISOString().slice(0, 10);
  await addDeadline(page, "Ежедневный отчёт", { date: today, repeat: "daily" });
  await page.getByRole("tab", { name: "Список" }).click();
  await expect(page.getByRole("button", { name: /Дедлайн, .*Ежедневный отчёт/ })).toHaveCount(14);
});

test("месяц: навигация с клавиатуры", async ({ page }) => {
  await open(page);
  await page.getByRole("tab", { name: "Месяц" }).click();
  const grid = page.getByRole("grid", { name: "Календарь на месяц" });
  const first = grid.locator('[role="gridcell"][tabindex="0"]');
  await expect(first).toHaveCount(1);
  const before = await first.getAttribute("data-date");
  await first.focus();
  await page.keyboard.press("ArrowRight");
  const after = await grid.locator('[role="gridcell"][tabindex="0"]').getAttribute("data-date");
  expect(after).not.toBe(before);
  expect(new Date(`${after}T00:00:00Z`).getTime() - new Date(`${before}T00:00:00Z`).getTime()).toBe(86400000);
  await expect(grid.locator(`[data-date="${after}"]`)).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("PageDown");
  await expect(grid.locator('[role="gridcell"][tabindex="0"]')).toHaveCount(1);
});

test("тёмная тема сохраняется", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Настройки" }).click();
  await page.getByRole("button", { name: "Тёмная" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("часовой пояс: дедлайн 23:59 МСК во Владивостоке — 06:59 следующего дня", async ({ page }) => {
  await open(page);
  const date = "2026-12-10";
  await addDeadline(page, "Сдать КСО", { date, time: "23:59" });
  await page.getByRole("button", { name: "Настройки" }).click();
  await page.getByLabel("Часовой пояс").selectOption("Asia/Vladivostok");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("region", { name: "Ближайшие дедлайны" }).getByText(/11 дек.*06:59/)).toBeVisible();
});

test("экспорт .ics содержит запись", async ({ page }) => {
  await open(page);
  await addDeadline(page, "Презентация, КСО", { date: "2026-12-10", time: "23:59" });
  await page.getByRole("button", { name: "Настройки" }).click();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /Скачать \.ics/ }).click()]);
  const text = fs.readFileSync((await download.path())!, "utf8");
  expect(text).toContain("BEGIN:VCALENDAR");
  expect(text).toContain("SUMMARY:Дедлайн: Презентация\\, КСО");
  expect(text).toContain("DTEND:20261210T205900Z");
});

test("регистрация переносит гостевые записи, вход на другом устройстве их видит", async ({ page, browser }) => {
  await open(page);
  await addDeadline(page, "Гостевой дедлайн");
  const email = `student${Date.now()}@example.com`;
  await page.getByRole("button", { name: "Войти" }).click();
  const dlg = page.getByRole("dialog", { name: "Вход в аккаунт" });
  await dlg.getByLabel("Имя").fill("Алина");
  await dlg.getByLabel("Email").fill(email);
  await dlg.getByLabel("Пароль").fill("correct-horse-1");
  await dlg.getByRole("button", { name: "Создать аккаунт" }).click();
  await expect(page.getByText(/Гостевые записи перенесены/)).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Алина");

  // «другое устройство»: чистый контекст
  const ctx2 = await browser.newContext({ baseURL: "http://localhost:3200", locale: "ru-RU" });
  const p2 = await ctx2.newPage();
  await p2.goto("/");
  await p2.getByRole("button", { name: "Войти" }).click();
  const d2 = p2.getByRole("dialog", { name: "Вход в аккаунт" });
  await d2.getByRole("tab", { name: "Вход" }).click();
  await d2.getByLabel("Email").fill(email);
  await d2.getByLabel("Пароль").fill("wrong-password");
  await d2.getByRole("button", { name: "Войти" }).last().click();
  await expect(d2.getByRole("alert")).toContainText("Неверный email или пароль");
  await d2.getByLabel("Пароль").fill("correct-horse-1");
  await d2.getByRole("button", { name: "Войти" }).last().click();
  await expect(p2.getByRole("region", { name: "Ближайшие дедлайны" }).getByText("Гостевой дедлайн")).toBeVisible();
  await ctx2.close();
});

test("подписка .ics отдаёт календарь по секретной ссылке и 404 без токена", async ({ page, request }) => {
  await open(page);
  const email = `feed${Date.now()}@example.com`;
  await page.getByRole("button", { name: "Войти" }).click();
  const dlg = page.getByRole("dialog", { name: "Вход в аккаунт" });
  await dlg.getByLabel("Email").fill(email);
  await dlg.getByLabel("Пароль").fill("correct-horse-1");
  await dlg.getByRole("button", { name: "Создать аккаунт" }).click();
  await addDeadline(page, "Из фида", { date: "2026-12-10", time: "10:00" });
  await page.getByRole("button", { name: /Аккаунт:/ }).click();
  const url = await page.getByLabel("Ссылка на календарь").inputValue();
  const res = await request.get(url);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/calendar");
  expect(await res.text()).toContain("Дедлайн: Из фида");
  expect((await request.get("/api/feed?token=nope")).status()).toBe(404);
});

test("офлайн: приложение открывается и показывает сохранённое", async ({ page, context }) => {
  await open(page);
  await pickGroup(page);
  await page.getByRole("tab", { name: "Список" }).click();
  await expect(page.getByRole("button", { name: /^Пара, / }).first()).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload(); // чтобы страница оказалась под управлением SW
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText(/Нет сети/)).toBeVisible();
  await expect(page.getByRole("button", { name: /^Пара, / }).first()).toBeVisible();
  await context.setOffline(false);
});

test("мобильный вид: список вместо недельной сетки", async ({ browser }) => {
  const ctx = await browser.newContext({ baseURL: "http://localhost:3200", viewport: { width: 390, height: 844 }, locale: "ru-RU" });
  const page = await ctx.newPage();
  await open(page);
  await expect(page.getByRole("tab", { name: "Неделя" })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Список" })).toHaveAttribute("aria-selected", "true");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
  await ctx.close();
});
