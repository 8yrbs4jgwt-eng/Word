"use client";

import { Check, Flag, MapPin, Repeat } from "lucide-react";
import { useMemo, useState } from "react";
import { upcomingDeadlines, type Item } from "@/lib/calendar";
import type { Entry } from "@/lib/entries";
import { addDays, fmtLong, fmtShort, mondayOf } from "@/lib/time";
import { Button, KIND_DOT, cx } from "@/components/ui";
import { ItemChip, timeLabel } from "@/components/views/ItemChip";

export function CheckBox({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={cx("grid size-7 shrink-0 place-items-center rounded-lg border-2 transition-colors", checked ? "border-primary bg-primary text-on-primary" : "border-muted hover:border-primary")}
    >
      {checked && <Check size={16} aria-hidden strokeWidth={3} />}
    </button>
  );
}

export function DeadlinesPanel({ entries, tz, today, nowMin, onOpen, onToggle }: { entries: Entry[]; tz: string; today: string; nowMin: number; onOpen: (i: Item) => void; onToggle: (i: Item) => void }) {
  const [all, setAll] = useState(false);
  const list = useMemo(() => upcomingDeadlines(entries, tz, today, nowMin), [entries, tz, today, nowMin]);
  const thisWeekEnd = addDays(mondayOf(today), 6);
  const week = list.filter((x) => x.item.date <= thisWeekEnd).length;
  const shown = all ? list : list.slice(0, 6);
  return (
    <section aria-labelledby="dl-h" className="rounded-2xl border border-border bg-surface p-4">
      <div className="mb-3">
        <h2 id="dl-h" className="font-display text-2xl font-medium">Ближайшие дедлайны</h2>
        <span className="num mt-0.5 block text-sm text-muted" aria-label={`Всего ${list.length}, на этой неделе ${week}`}>{list.length} · на неделе {week}</span>
      </div>
      {shown.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted">Открытых дедлайнов нет — отличная работа!</p>
      ) : (
        <ul className="space-y-2">
          {shown.map(({ item, overdue }) => (
            <li key={item.key} className="flex items-start gap-2.5">
              <CheckBox checked={false} onChange={() => onToggle(item)} label={`Отметить выполненным: ${item.title}`} />
              <button type="button" onClick={() => onOpen(item)} className="min-w-0 flex-1 rounded-lg px-1 text-left hover:bg-surface-2">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  {item.high && <Flag size={13} aria-label="важно" className="shrink-0 text-danger" />}
                  <span className="truncate">{item.title}</span>
                  {item.repeats && <Repeat size={12} aria-label="повторяется" className="shrink-0 text-muted" />}
                </span>
                <span className="block text-xs text-muted">
                  {item.subject && `${item.subject} · `}
                  {fmtShort(item.date)}{item.start !== null && `, ${timeLabel(item)}`}
                </span>
              </button>
              {overdue ? (
                <span className="shrink-0 rounded-full bg-danger-soft px-2 py-0.5 text-xs font-semibold text-danger">Просрочено</span>
              ) : item.date === today ? (
                <span className="shrink-0 rounded-full bg-deadline-bg px-2 py-0.5 text-xs font-semibold text-deadline-fg">Сегодня</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {list.length > 6 && (
        <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={() => setAll((v) => !v)}>
          {all ? "Свернуть" : `Показать все (${list.length})`}
        </Button>
      )}
    </section>
  );
}

export function DayPlan({ date, today, items, onOpen, onToggle, onAdd }: { date: string; today: string; items: Item[]; onOpen: (i: Item) => void; onToggle: (i: Item) => void; onAdd: () => void }) {
  return (
    <section aria-labelledby="dp-h" className="rounded-2xl border border-border bg-surface p-4">
      <div className="mb-3">
        <p className="eyebrow">{date === today ? "Сегодня" : "План на день"}</p>
        <h2 id="dp-h" className="font-display text-2xl font-medium first-letter:uppercase">{fmtLong(date)}</h2>
      </div>
      {items.length === 0 ? (
        <div className="space-y-3 py-3 text-center">
          <p className="text-sm text-muted">На этот день ничего не запланировано</p>
          <Button size="sm" onClick={onAdd}>Добавить на этот день</Button>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((i) => (
            <li key={i.key} className="flex items-start gap-2.5">
              {i.kind === "deadline" ? <CheckBox checked={i.done} onChange={() => onToggle(i)} label={`${i.done ? "Снять отметку" : "Отметить выполненным"}: ${i.title}`} /> : <span aria-hidden className={cx("mt-2.5 ml-2.5 mr-2 size-2 shrink-0 rounded-full", KIND_DOT[i.kind])} />}
              <div className="min-w-0 flex-1">
                <ItemChip item={i} onOpen={onOpen} className="!px-2.5 !py-1.5 !text-[15px]" />
                {i.teacher && <p className="mt-0.5 flex items-center gap-1 px-1 text-xs text-muted"><MapPin size={11} aria-hidden /> {i.teacher}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
