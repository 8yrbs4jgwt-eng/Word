"use client";

import { Check, Copy, Download, LogOut } from "lucide-react";
import { useMemo, useState } from "react";
import { buildIcs } from "@/lib/ics";
import type { ClassEvent } from "@/lib/spbu/types";
import { fromInstant } from "@/lib/time";
import { Button, Field, Modal, inputCls } from "@/components/ui";
import { useApp } from "@/components/store";
import { PushSettings } from "@/components/PushSettings";

const RU_ZONES = ["Europe/Kaliningrad", "Europe/Moscow", "Europe/Samara", "Asia/Yekaterinburg", "Asia/Omsk", "Asia/Novosibirsk", "Asia/Krasnoyarsk", "Asia/Irkutsk", "Asia/Yakutsk", "Asia/Vladivostok", "Asia/Magadan", "Asia/Kamchatka"];

function offsetLabel(tz: string) {
  const now = Date.now();
  const w = fromInstant(now, tz);
  const diff = Math.round((Date.parse(`${w.date}T${w.time}:00Z`) - Math.floor(now / 60000) * 60000) / 60000);
  const sign = diff < 0 ? "−" : "+";
  const a = Math.abs(diff);
  return `UTC${sign}${String(Math.floor(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`;
}

export function SettingsDialog({ open, onClose, classes, onLogin }: { open: boolean; onClose: () => void; classes: ClassEvent[]; onLogin: () => void }) {
  const { settings, updateSettings, user, logout, entries, feedToken, say } = useApp();
  const [copied, setCopied] = useState(false);

  const zones = useMemo(() => {
    const all = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : RU_ZONES;
    const rest = all.filter((z) => !RU_ZONES.includes(z));
    return { ru: RU_ZONES, rest };
  }, []);
  const device = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "Europe/Moscow";

  function download() {
    const blob = new Blob([buildIcs({ name: "Лекторий", entries, classes })], { type: "text/calendar;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "lektorij.ics";
    a.click();
    URL.revokeObjectURL(a.href);
    say("Файл lektorij.ics скачан");
  }

  const feedUrl = feedToken && typeof location !== "undefined" ? `${location.origin}/api/feed?token=${feedToken}` : null;

  return (
    <Modal open={open} onClose={onClose} title="Настройки" wide>
      {open && (
        <div className="space-y-6">
          <section className="space-y-3" aria-labelledby="s-tz">
            <h3 id="s-tz" className="eyebrow">Время и оформление</h3>
            <Field label="Часовой пояс" htmlFor="s-tzsel" hint="Пары СПбГУ идут по Москве — они пересчитываются в ваш пояс">
              <select id="s-tzsel" className={inputCls} value={settings.tz} onChange={(e) => updateSettings({ tz: e.target.value })}>
                {device && !RU_ZONES.includes(device) && <option value={device}>Как на устройстве — {device} ({offsetLabel(device)})</option>}
                <optgroup label="Россия">
                  {zones.ru.map((z) => <option key={z} value={z}>{z.split("/")[1].replace("_", " ")} ({offsetLabel(z)})</option>)}
                </optgroup>
                <optgroup label="Другие">
                  {zones.rest.map((z) => <option key={z} value={z}>{z.replace("_", " ")} ({offsetLabel(z)})</option>)}
                </optgroup>
              </select>
            </Field>
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium">Тема</legend>
              <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1">
                {([["system", "Как в системе"], ["light", "Светлая"], ["dark", "Тёмная"]] as const).map(([v, l]) => (
                  <button key={v} type="button" aria-pressed={settings.theme === v} onClick={() => updateSettings({ theme: v })} className={`h-10 rounded-lg text-sm font-medium ${settings.theme === v ? "bg-surface shadow-sm" : "text-muted hover:text-text"}`}>{l}</button>
                ))}
              </div>
            </fieldset>
          </section>

          <section className="space-y-3" aria-labelledby="s-exp">
            <h3 id="s-exp" className="eyebrow">Экспорт и подписка</h3>
            <Button onClick={download}><Download size={16} aria-hidden /> Скачать .ics (записи и загруженные пары)</Button>
            {user && feedUrl ? (
              <div className="space-y-2">
                <p className="text-sm text-muted">Подписка обновляется сама: личные записи и пары вашей группы. Ссылка секретная — не делитесь ею.</p>
                <div className="flex gap-2">
                  <input readOnly aria-label="Ссылка на календарь" className={inputCls} value={feedUrl} onFocus={(e) => e.currentTarget.select()} />
                  <Button onClick={async () => { await navigator.clipboard?.writeText(feedUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); }} aria-label="Скопировать ссылку">
                    {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2 text-sm">
                  <a className="text-primary underline" href={feedUrl.replace(/^https?:/, "webcal:")}>Открыть в календаре (Apple, Outlook)</a>
                  <a className="text-primary underline" target="_blank" rel="noreferrer" href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(feedUrl.replace(/^https?:/, "webcal:"))}`}>Добавить в Google Календарь</a>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted">Подписка по ссылке доступна после входа в аккаунт.</p>
            )}
          </section>

          <PushSettings />

          <section className="space-y-3" aria-labelledby="s-acc">
            <h3 id="s-acc" className="eyebrow">Аккаунт</h3>
            {user ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm">{user.name ? `${user.name} · ` : ""}{user.email}</p>
                <Button onClick={() => { void logout(); onClose(); }}><LogOut size={16} aria-hidden /> Выйти</Button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted">Вы работаете как гость: данные хранятся только в этом браузере.</p>
                <Button variant="primary" onClick={() => { onClose(); onLogin(); }}>Войти или зарегистрироваться</Button>
              </div>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}
