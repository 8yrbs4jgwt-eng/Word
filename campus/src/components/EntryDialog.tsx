"use client";

import { useState } from "react";
import { entrySchema, newId, REMIND_OPTIONS, type Entry, type Repeat } from "@/lib/entries";
import { convertWall, fmtLong, weekdayOf } from "@/lib/time";
import { Button, Field, Modal, cx, inputCls } from "@/components/ui";
import { useApp } from "@/components/store";

const WD = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
type Seed = { entry?: Entry; date?: string; kind?: "deadline" | "note" };

export function EntryDialog({ seed, onClose }: { seed: Seed | null; onClose: () => void }) {
  return (
    <Modal open={!!seed} onClose={onClose} title={seed?.entry ? "Редактировать запись" : "Новая запись"} wide>
      {seed && <Form key={seed.entry?.id ?? "new"} seed={seed} onClose={onClose} />}
    </Modal>
  );
}

function Form({ seed, onClose }: { seed: Seed; onClose: () => void }) {
  const { settings, saveEntry, removeEntry, user, say } = useApp();
  const e = seed.entry;
  // редактируем в поясе пользователя из настроек
  const shown = e ? (e.time ? convertWall(e.date, e.time, e.tz, settings.tz) : { date: e.date, time: "" }) : null;

  const [kind, setKind] = useState<"deadline" | "note">(e?.kind ?? seed.kind ?? "deadline");
  const [title, setTitle] = useState(e?.title ?? "");
  const [date, setDate] = useState(shown?.date ?? seed.date ?? "");
  const [time, setTime] = useState(shown?.time ?? "");
  const [subject, setSubject] = useState(e?.subject ?? "");
  const [body, setBody] = useState(e?.body ?? "");
  const [high, setHigh] = useState(e?.priority === "high");
  const [remind, setRemind] = useState<number | null>(e?.remind ?? null);
  const [freq, setFreq] = useState<Repeat["freq"] | "">(e?.repeat?.freq ?? "");
  const [interval, setIntervalN] = useState(e?.repeat?.interval ?? 1);
  const [weekdays, setWeekdays] = useState<number[]>(e?.repeat?.weekdays ?? []);
  const [until, setUntil] = useState(e?.repeat?.until ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  function submit(ev: React.FormEvent) {
    ev.preventDefault();
    const repeat: Repeat | null = freq
      ? { freq, interval, ...(freq === "weekly" && weekdays.length ? { weekdays } : {}), ...(until ? { until } : {}) }
      : null;
    const parsed = entrySchema.omit({ updatedAt: true }).safeParse({
      id: e?.id ?? newId(),
      kind,
      title,
      date,
      time: time || null,
      tz: settings.tz,
      subject,
      body,
      done: e?.done ?? false,
      doneDates: e?.doneDates ?? [],
      priority: high ? "high" : "normal",
      repeat,
      remind: time ? remind : null,
    });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[String(i.path[0])] ??= i.message;
      if (errs.date) errs.date = "Выберите дату";
      setErrors(errs);
      return;
    }
    if (repeat?.until && repeat.until < date) return setErrors({ until: "Окончание раньше начала" });
    saveEntry(parsed.data);
    if (parsed.data.remind !== null && !user) say("Запись сохранена. Напоминания приходят после входа в аккаунт");
    onClose();
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div role="radiogroup" aria-label="Тип записи" className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
        {(["deadline", "note"] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            onClick={() => setKind(k)}
            className={cx("h-10 rounded-lg text-sm font-medium", kind === k ? "bg-surface shadow-sm" : "text-muted hover:text-text")}
          >
            {k === "deadline" ? "Дедлайн" : "Заметка"}
          </button>
        ))}
      </div>

      <Field label="Название" htmlFor="e-title" error={errors.title} hint={`${title.length}/160`}>
        <input id="e-title" className={inputCls} value={title} maxLength={160} autoFocus onChange={(x) => setTitle(x.target.value)} placeholder={kind === "deadline" ? "Презентация по КСО" : "Идея для курсовой"} aria-invalid={!!errors.title} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label={kind === "deadline" ? "Сдать до" : "Дата"} htmlFor="e-date" error={errors.date}>
          <input id="e-date" type="date" className={inputCls} value={date} onChange={(x) => setDate(x.target.value)} aria-invalid={!!errors.date} />
        </Field>
        <Field label="Время" htmlFor="e-time" hint="необязательно" error={errors.time}>
          <input id="e-time" type="time" className={inputCls} value={time} onChange={(x) => setTime(x.target.value)} />
        </Field>
      </div>
      <p className="-mt-2 text-xs text-muted">Часовой пояс: {settings.tz.replace("_", " ")}</p>

      <Field label="Предмет" htmlFor="e-subject" hint="необязательно">
        <input id="e-subject" className={inputCls} value={subject} maxLength={160} onChange={(x) => setSubject(x.target.value)} />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">Приоритет</legend>
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
            {[false, true].map((h) => (
              <button key={String(h)} type="button" aria-pressed={high === h} onClick={() => setHigh(h)} className={cx("h-9 rounded-lg text-sm font-medium", high === h ? "bg-surface shadow-sm" : "text-muted hover:text-text")}>
                {h ? "Важный" : "Обычный"}
              </button>
            ))}
          </div>
        </fieldset>
        <Field label="Напомнить" htmlFor="e-remind" hint={time ? undefined : "Укажите время, чтобы включить напоминание"}>
          <select id="e-remind" className={inputCls} disabled={!time} value={remind ?? ""} onChange={(x) => setRemind(x.target.value === "" ? null : Number(x.target.value))}>
            {REMIND_OPTIONS.map((o) => (
              <option key={String(o.value)} value={o.value ?? ""}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="space-y-3 rounded-xl border border-border p-3">
        <Field label="Повторять" htmlFor="e-freq">
          <select id="e-freq" className={inputCls} value={freq} onChange={(x) => setFreq(x.target.value as Repeat["freq"] | "")}>
            <option value="">Не повторять</option>
            <option value="daily">Каждый день</option>
            <option value="weekly">Каждую неделю</option>
            <option value="monthly">Каждый месяц</option>
          </select>
        </Field>
        {freq && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label={`Каждые (${freq === "daily" ? "дн." : freq === "weekly" ? "нед." : "мес."})`} htmlFor="e-int">
                <input id="e-int" type="number" min={1} max={52} className={inputCls} value={interval} onChange={(x) => setIntervalN(Math.min(52, Math.max(1, Number(x.target.value) || 1)))} />
              </Field>
              <Field label="Закончить" htmlFor="e-until" hint="необязательно" error={errors.until}>
                <input id="e-until" type="date" className={inputCls} value={until} onChange={(x) => setUntil(x.target.value)} />
              </Field>
            </div>
            {freq === "weekly" && (
              <fieldset>
                <legend className="mb-1.5 text-sm font-medium">Дни недели</legend>
                <div className="flex flex-wrap gap-1.5">
                  {WD.map((n, i) => (
                    <button key={n} type="button" aria-pressed={weekdays.includes(i)} onClick={() => setWeekdays((w) => (w.includes(i) ? w.filter((x) => x !== i) : [...w, i].sort()))} className={cx("h-9 min-w-10 rounded-lg px-2 text-sm font-medium", weekdays.includes(i) ? "bg-primary text-on-primary" : "bg-surface-2 hover:bg-primary-soft")}>
                      {n}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-xs text-muted">{weekdays.length || !date ? "" : `Если не выбрать — по дню недели даты (${WD[weekdayOf(date)]}).`}</p>
              </fieldset>
            )}
            {e && <p className="text-xs text-muted">Изменения применятся ко всей серии.</p>}
          </>
        )}
      </div>

      <Field label="Заметка" htmlFor="e-body" hint={`необязательно · ${body.length}/5000`} error={errors.body}>
        <textarea id="e-body" rows={3} className={cx(inputCls, "h-auto py-2")} value={body} maxLength={5000} onChange={(x) => setBody(x.target.value)} placeholder="Подготовить слайды и выступление" />
      </Field>

      {confirmDelete ? (
        <div role="alertdialog" aria-label="Подтверждение удаления" className="flex flex-wrap items-center gap-2 rounded-xl border border-danger bg-danger-soft p-3 text-sm text-danger">
          <span className="flex-1">Удалить «{e?.title}»{e?.repeat ? " вместе со всей серией" : ""}?</span>
          <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>Отмена</Button>
          <Button variant="danger" size="sm" onClick={() => { removeEntry(e!.id); onClose(); }}>Удалить</Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {e && <Button variant="danger" onClick={() => setConfirmDelete(true)}>Удалить</Button>}
          <div className="flex-1" />
          <Button variant="ghost" onClick={onClose}>Отмена</Button>
          <Button variant="primary" type="submit">{e ? "Сохранить" : kind === "deadline" ? "Добавить дедлайн" : "Добавить заметку"}</Button>
        </div>
      )}
      <span className="sr-only">{date && fmtLong(date)}</span>
    </form>
  );
}
