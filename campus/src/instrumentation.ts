export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.DISABLE_REMINDER_JOB === "1") return;
  const g = globalThis as { __campusReminderTimer?: ReturnType<typeof setInterval> };
  if (g.__campusReminderTimer) return;
  const { runReminders } = await import("@/lib/push");
  g.__campusReminderTimer = setInterval(() => {
    runReminders().catch((e) => console.error("[reminders]", e));
  }, 60_000);
}
