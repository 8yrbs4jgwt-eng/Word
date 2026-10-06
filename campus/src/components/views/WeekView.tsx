"use client";

import { useMemo } from "react";
import { groupByDate, type Item } from "@/lib/calendar";
import { fmtWeekdayShort, minToHm, weekDays } from "@/lib/time";
import { cx } from "@/components/ui";
import { ItemChip } from "./ItemChip";

const HOUR_PX = 56;

const MAX_COLS = 2;
type Placed = { item: Item; col: number; cols: number };
type Overflow = { key: string; start: number; end: number; count: number; col: number; cols: number };

/** Раскладка пересекающихся элементов по колонкам; сверх MAX_COLS — сворачиваем в «ещё N». */
function layout(items: Item[]): { placed: Placed[]; overflow: Overflow[] } {
  const timed = items.filter((i) => i.start !== null).sort((a, b) => a.start! - b.start!);
  const placed: Placed[] = [];
  const overflow: Overflow[] = [];
  let group: { item: Item; col: number; end: number }[] = [];
  let groupEnd = -1;
  const flush = () => {
    if (!group.length) return;
    const total = Math.max(...group.map((g) => g.col)) + 1;
    const cols = Math.min(total, MAX_COLS);
    const hidden = total > MAX_COLS ? group.filter((g) => g.col >= MAX_COLS - 1) : [];
    for (const g of group) if (!hidden.includes(g)) placed.push({ item: g.item, col: g.col, cols });
    if (hidden.length) {
      overflow.push({
        key: `o${hidden[0].item.key}`,
        start: Math.min(...hidden.map((h) => h.item.start!)),
        end: Math.max(...hidden.map((h) => h.end)),
        count: hidden.length,
        col: MAX_COLS - 1,
        cols,
      });
    }
    group = [];
  };
  for (const it of timed) {
    const end = it.end ?? it.start! + 45;
    if (group.length && it.start! >= groupEnd) {
      flush();
      groupEnd = -1;
    }
    const used = new Set(group.filter((g) => g.end > it.start!).map((g) => g.col));
    let col = 0;
    while (used.has(col)) col++;
    group.push({ item: it, col, end });
    groupEnd = Math.max(groupEnd, end);
  }
  flush();
  return { placed, overflow };
}

export function WeekView({ date, today, items, onOpen, onPickDay, selected, nowMin }: { date: string; today: string; items: Item[]; onOpen: (i: Item) => void; onPickDay: (d: string) => void; selected: string; nowMin: number }) {
  const days = weekDays(date);
  const byDate = useMemo(() => groupByDate(items), [items]);
  const timed = items.filter((i) => i.start !== null);
  const startH = Math.min(8, ...timed.map((i) => Math.floor(i.start! / 60)));
  const endH = Math.max(19, ...timed.map((i) => Math.ceil((i.end ?? i.start! + 45) / 60)));
  const hours = Array.from({ length: endH - startH }, (_, k) => startH + k);
  const hasAllDay = items.some((i) => i.start === null);

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-surface" role="group" aria-label="Неделя">
      <div className="min-w-[760px]">
        <div className="grid grid-cols-[3.25rem_repeat(7,minmax(0,1fr))] border-b border-border">
          <div />
          {days.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => onPickDay(d)}
              aria-pressed={d === selected}
              aria-label={`${fmtWeekdayShort(d)}, ${d.slice(8)}`}
              className={cx("flex flex-col items-center gap-0.5 py-2.5 hover:bg-surface-2", d === selected && "bg-primary-soft")}
            >
              <span className="eyebrow">{fmtWeekdayShort(d)}</span>
              <span className={cx("num font-display text-2xl leading-none", d === today ? "grid size-9 place-items-center rounded-full bg-primary text-on-primary" : "")}>{Number(d.slice(8))}</span>
            </button>
          ))}
        </div>

        {hasAllDay && (
          <div className="grid grid-cols-[3.25rem_repeat(7,minmax(0,1fr))] border-b border-border">
            <div className="p-1 text-[0.65rem] leading-tight text-muted">весь день</div>
            {days.map((d) => (
              <div key={d} className="space-y-1 border-l border-border p-1">
                {(byDate.get(d) ?? []).filter((i) => i.start === null).map((i) => (
                  <ItemChip key={i.key} item={i} onOpen={onOpen} compact />
                ))}
              </div>
            ))}
          </div>
        )}

        <div className="relative grid grid-cols-[3.25rem_repeat(7,minmax(0,1fr))]" style={{ height: hours.length * HOUR_PX }}>
          <div>
            {hours.map((h) => (
              <div key={h} className="num relative -mt-0 pr-1.5 text-right text-[0.7rem] text-muted" style={{ height: HOUR_PX }}>
                <span className="relative -top-2">{minToHm(h * 60)}</span>
              </div>
            ))}
          </div>
          {days.map((d) => {
            const { placed, overflow } = layout(byDate.get(d) ?? []);
            return (
              <div key={d} className={cx("relative border-l border-border", d === selected && "bg-primary-soft/40")}>
                {hours.map((h, k) => (
                  <div key={h} className="absolute inset-x-0 border-t border-border/70" style={{ top: k * HOUR_PX }} />
                ))}
                {placed.map(({ item, col, cols }) => {
                  const top = ((item.start! - startH * 60) / 60) * HOUR_PX;
                  const h = Math.max(((item.end ?? item.start! + 45) - item.start!) / 60 * HOUR_PX, 26);
                  return (
                    <ItemChip
                      key={item.key}
                      item={item}
                      onOpen={onOpen}
                      className="absolute"
                      style={{ top: top + 1, height: h - 2, left: `calc(${(col / cols) * 100}% + 2px)`, width: `calc(${100 / cols}% - 4px)` }}
                    />
                  );
                })}
                {overflow.map((o) => (
                  <button
                    key={o.key}
                    type="button"
                    onClick={() => onPickDay(d)}
                    aria-label={`Ещё ${o.count} в это время, открыть план дня`}
                    className="absolute grid place-items-center rounded-lg border border-dashed border-border bg-surface-2 text-xs font-semibold text-muted hover:bg-primary-soft"
                    style={{ top: ((o.start - startH * 60) / 60) * HOUR_PX + 1, height: Math.max(((o.end - o.start) / 60) * HOUR_PX - 2, 26), left: `calc(${(o.col / o.cols) * 100}% + 2px)`, width: `calc(${100 / o.cols}% - 4px)` }}
                  >
                    ещё {o.count}
                  </button>
                ))}
                {d === today && nowMin >= startH * 60 && nowMin <= endH * 60 && (
                  <div aria-hidden className="pointer-events-none absolute inset-x-0 z-10 flex items-center" style={{ top: ((nowMin - startH * 60) / 60) * HOUR_PX }}>
                    <span className="-ml-1 size-2 rounded-full bg-danger" />
                    <span className="h-px flex-1 bg-danger" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
