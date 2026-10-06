import { defineConfig } from "@playwright/test";
import fs from "node:fs";

const chromium = "/opt/pw-browsers/chromium";
const executablePath = fs.existsSync(chromium) ? chromium : undefined;
const PORT = 3200;

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: /.*\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "ru-RU",
    timezoneId: "Europe/Moscow",
    trace: "retain-on-failure",
    launchOptions: { executablePath, args: ["--no-sandbox"] },
  },
  webServer: [
    { command: "node tests/e2e/fake-spbu.mjs 4010", port: 4010, reuseExistingServer: true },
    {
      command: `rm -rf .e2e-data && npm run build && npx next start -p ${PORT}`,
      port: PORT,
      timeout: 240_000,
      reuseExistingServer: !process.env.CI,
      env: { SPBU_BASE_URL: "http://localhost:4010/api/v1", DATABASE_PATH: ".e2e-data/e2e.db", COOKIE_SECURE: "false" },
    },
  ],
});
