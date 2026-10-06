"use client";

import { useEffect, useMemo, useRef } from "react";
import { groupByDate, type Item } from "@/lib/calendar";
import { addDays, addMonths, fmtLong, fmtWeekdayShort, monthGrid, weekDays } from "@/lib/time";
import { KIND_DOT, KIND_LABEL_PL, cx } from "@/components/ui";

const KINDS = ["class", "deadline", "note"] as const;

export function MonthView({ date, today, items, selected, onSelect, onMove }: { date: string; today: string; items: Item[]; selected: string; onSelect: (d: string) => void; onMove: (d: string) => void }) {
  const grid = useMemo(() => monthGrid(date), [date]);
  const byDate = useMemo(() => groupByDate(items), [items]);
  const ref = useRef<HTMLDivElement>(null);
  const focusAfter = useRef(false);
  const month = date.slice(0, 7);

  // после перехода стрелкой возвращаем фокус на выбранную ячейку
  useEffect(() => {
    if (focusAfter.current) {
      ref.current?.querySelector<HTMLElement>(`[data-date="${selected}"]`)?.focus();
      focusAfter.current = false;
    }
  }, [selected]);

  function onKey(e: React.KeyboardEvent) {
    const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    let next: string | null = null;
    if (e.key in step) next = addDays(selected, step[e.key]);
    else if (e.key === "PageUp") next = addMonths(selected, -1);
    else if (e.key === "PageDown") next = addMonths(selected, 1);
    else if (e.key === "Home") next = addDays(selected, -((new Date(`${selected}T00:00:00Z`).getUTCDay() + 6) % 7));
    else if (e.key === "End") next = addDays(selected, 6 - ((new Date(`${selected}T00:00:00Z`).getUTCDay() + 6) % 7));
    if (next) {
      e.preventDefault();
      focusAfter.current = true;
      onMove(next);
    }
  }

  const head = weekDays(date);
  return (
    <div ref={ref} role="grid" aria-label="Календарь на месяц" onKeyDown={onKey} className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div role="row" className="grid grid-cols-7 border-b border-border">
        {head.map((d) => (
          <div key={d} role="columnheader" className="eyebrow py-2 text-center">
            {fmtWeekdayShort(d)}
          </div>
        ))}
      </div>
      {Array.from({ length: 6 }, (_, w) => (
        <div role="row" key={w} className="grid grid-cols-7">
          {grid.slice(w * 7, w * 7 + 7).map((d) => {
            const list = byDate.get(d) ?? [];
            const counts = KINDS.map((k) => [k, list.filter((i) => i.kind === k).length] as const).filter(([, n]) => n > 0);
            const label = `${fmtLong(d)}${counts.length ? ": " + counts.map(([k, n]) => `${KIND_LABEL_PL[k].toLowerCase()} — ${n}`).join(", ") : ": нет записей"}`;
            return (
              <button
                key={d}
                role="gridcell"
                type="button"
                data-date={d}
                tabIndex={d === selected ? 0 : -1}
                aria-selected={d === selected}
                aria-current={d === today ? "date" : undefined}
                aria-label={label}
                onClick={() => onSelect(d)}
                className={cx(
                  "flex min-h-[3.6rem] flex-col items-start gap-1 border-b border-r border-border p-1.5 text-left hover:bg-surface-2 sm:min-h-24 sm:p-2",
                  d.slice(0, 7) !== month && "text-muted",
                  d === selected && "bg-primary-soft",
                )}
              >
                <span className={cx("num grid size-7 place-items-center rounded-full text-sm font-semibold", d === today && "bg-primary text-on-primary")}>{Number(d.slice(8))}</span>
                <span className="hidden w-full space-y-0.5 sm:block">
                  {list.slice(0, 2).map((i) => (
                    <span key={i.key} className="flex items-center gap-1 text-[0.7rem] leading-tight">
                      <span className={cx("size-1.5 shrink-0 rounded-full", KIND_DOT[i.kind])} aria-hidden />
                      <span className="truncate">{i.title}</span>
                    </span>
                  ))}
                  {list.length > 2 && <span className="text-[0.7rem] text-muted">ещё {list.length - 2}</span>}
                </span>
                <span className="flex gap-0.5 sm:hidden" aria-hidden>
                  {counts.map(([k]) => (
                    <span key={k} className={cx("size-1.5 rounded-full", KIND_DOT[k])} />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
