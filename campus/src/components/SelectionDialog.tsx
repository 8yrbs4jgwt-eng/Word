"use client";

import { useMemo, useState } from "react";
import { buildCatalog, disciplineOf, displayName, NONE, type Selection } from "@/lib/selection";
import { addDays, todayIn } from "@/lib/time";
import { Banner, Button, Modal, cx, inputCls } from "@/components/ui";
import { useClasses } from "@/components/useClasses";

const WD = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

export function SelectionDialog({ open, onClose, group, selection, onSave }: { open: boolean; onClose: () => void; group: { id: number; name: string } | null; selection: Selection | null; onSave: (s: Selection | null) => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Мои дисциплины" wide>
      {open && group && <Body group={group} selection={selection} onClose={onClose} onSave={onSave} />}
    </Modal>
  );
}

function Body({ group, selection, onClose, onSave }: { group: { id: number; name: string }; selection: Selection | null; onClose: () => void; onSave: (s: Selection | null) => void }) {
  const today = todayIn("Europe/Moscow");
  // смотрим 4 недели вперёд, чтобы увидеть и редкие занятия
  const { classes, loading, failed, retry } = useClasses(group.id, today, addDays(today, 27));
  const catalog = useMemo(() => buildCatalog(classes), [classes]);
  const own = selection?.groupId === group.id ? selection : null;
  const [hidden, setHidden] = useState<string[]>(own?.hidden ?? []);
  // элективы по умолчанию не выбраны: студент отмечает только свои
  const [electives, setElectives] = useState<string[]>(own?.electives ?? []);
  const [picks, setPicks] = useState<Record<string, string>>(own?.picks ?? {});
  const [q, setQ] = useState("");
  const qq = q.trim().toLowerCase();

  const toggleElective = (name: string) => setElectives((h) => (h.includes(name) ? h.filter((x) => x !== name) : [...h, name]));
  const regular = catalog.disciplines.filter((d) => !d.elective);
  const electiveList = catalog.disciplines.filter((d) => d.elective);
  const toggleDiscipline = (name: string) => setHidden((h) => (h.includes(name) ? h.filter((x) => x !== name) : [...h, name]));
  const electiveNames = new Set(electiveList.map((d) => d.name));
  const active = (s: { title: string }) => {
    const n = disciplineOf(s.title);
    return !hidden.includes(n) && (!electiveNames.has(n) || electives.includes(n));
  };
  const slots = catalog.slots.filter((s) => active(s) && (!qq || s.title.toLowerCase().includes(qq)));
  const pending = catalog.slots.filter((s) => active(s) && picks[s.key] === undefined).length;

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted">
        Группа {group.name}. Отметьте предметы, которые вы посещаете, и выберите свою подгруппу там, где занятия идут параллельно.
        Расписание соберётся только из выбранного.
      </p>
      {failed && <Banner tone="error" action={<Button size="sm" onClick={retry}>Повторить</Button>}>Не удалось загрузить расписание группы.</Banner>}
      {loading && !classes.length && <p role="status" className="text-sm text-muted">Загружаем расписание…</p>}

      {catalog.disciplines.length > 0 && (
        <>
          <input type="search" className={inputCls} placeholder="Найти предмет" aria-label="Найти предмет" value={q} onChange={(e) => setQ(e.target.value)} />

          {electiveList.length > 0 && (
            <section aria-labelledby="sel-e" className="space-y-2">
              <h3 id="sel-e" className="eyebrow">Элективы и факультативы</h3>
              <p className="text-sm text-muted">Отметьте только те, на которые вы записаны. Остальные в расписании не покажутся.</p>
              <ul className="space-y-1.5">
                {electiveList.filter((d) => !qq || d.name.toLowerCase().includes(qq)).map((d) => {
                  const on = electives.includes(d.name);
                  return (
                    <li key={d.name}>
                      <label className={cx("flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5", on ? "border-primary bg-primary-soft" : "border-border")}>
                        <input type="checkbox" className="mt-1 size-5 accent-[var(--primary)]" checked={on} onChange={() => toggleElective(d.name)} />
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium">{displayName(d.name)}</span>
                          <span className="block text-xs text-muted">{/^факультатив/i.test(d.name) ? "факультатив" : "электив"} · {d.kinds.join(", ") || "занятия"} · {d.count} за 4 недели</span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <section aria-labelledby="sel-d" className="space-y-2">
            <h3 id="sel-d" className="eyebrow">Дисциплины</h3>
            <ul className="space-y-1.5">
              {regular.filter((d) => !qq || d.name.toLowerCase().includes(qq)).map((d) => {
                const on = !hidden.includes(d.name);
                return (
                  <li key={d.name}>
                    <label className={cx("flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5", on ? "border-border" : "border-dashed border-border bg-surface-2 text-muted")}>
                      <input type="checkbox" className="mt-1 size-5 accent-[var(--primary)]" checked={on} onChange={() => toggleDiscipline(d.name)} />
                      <span className="min-w-0 flex-1">
                        <span className={cx("block font-medium", !on && "line-through")}>{d.name}</span>
                        <span className="block text-xs text-muted">{d.kinds.join(", ") || "занятия"} · {d.count} за 4 недели</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>

          <section aria-labelledby="sel-s" className="space-y-2">
            <h3 id="sel-s" className="eyebrow">Параллельные занятия{pending > 0 ? ` · не выбрано: ${pending}` : ""}</h3>
            {slots.length === 0 ? (
              <p className="text-sm text-muted">Параллельных занятий нет — выбирать больше нечего.</p>
            ) : (
              <ul className="space-y-3">
                {slots.map((s) => (
                  <li key={s.key}>
                    <fieldset className="rounded-xl border border-border p-3">
                      <legend className="px-1 text-sm font-semibold">
                        {s.title} · {WD[s.weekday]} {s.start}{s.end ? `–${s.end}` : ""}
                      </legend>
                      <div className="space-y-1">
                        {s.options.map((o) => (
                          <label key={o.teacher} className={cx("flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2 hover:bg-surface-2", picks[s.key] === o.teacher && "bg-primary-soft")}>
                            <input type="radio" name={s.key} className="mt-1 size-4 accent-[var(--primary)]" checked={picks[s.key] === o.teacher} onChange={() => setPicks((p) => ({ ...p, [s.key]: o.teacher }))} />
                            <span className="min-w-0 text-sm">
                              {o.teacher}
                              {o.locations.length > 0 && <span className="block text-xs text-muted">{o.locations.join("; ")}</span>}
                            </span>
                          </label>
                        ))}
                        <label className={cx("flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-2", picks[s.key] === NONE && "bg-primary-soft")}>
                          <input type="radio" name={s.key} className="size-4 accent-[var(--primary)]" checked={picks[s.key] === NONE} onChange={() => setPicks((p) => ({ ...p, [s.key]: NONE }))} />
                          <span className="text-sm">Не хожу на это занятие</span>
                        </label>
                      </div>
                    </fieldset>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={onClose}>Пропустить</Button>
        <Button onClick={() => { onSave(null); onClose(); }}>Показывать всё</Button>
        <Button variant="primary" disabled={!catalog.disciplines.length} onClick={() => { onSave({ groupId: group.id, hidden, picks, ...(electiveList.length ? { electives } : {}) }); onClose(); }}>Сохранить</Button>
      </div>
    </div>
  );
}
