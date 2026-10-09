"use client";

import { CalendarDays } from "lucide-react";
import { useMemo } from "react";
import { groupByDate, type Item } from "@/lib/calendar";
import { addDays, fmtLong } from "@/lib/time";
import { cx } from "@/components/ui";
import { ItemChip } from "./ItemChip";

/** Список по дням — основной вид на телефоне. */
export function AgendaView({ from, days, today, items, onOpen, emptyHint }: { from: string; days: number; today: string; items: Item[]; onOpen: (i: Item) => void; emptyHint?: string }) {
  const byDate = useMemo(() => groupByDate(items), [items]);
  const list = Array.from({ length: days }, (_, i) => addDays(from, i));
  const nonEmpty = list.filter((d) => byDate.has(d) || d === today);
  if (!nonEmpty.length)
    return (
      <div className="grid place-items-center gap-2 rounded-2xl border border-dashed border-border py-14 text-center text-muted">
        <CalendarDays aria-hidden />
        <p>{emptyHint ?? "В этом периоде записей нет"}</p>
      </div>
    );
  return (
    <ol className="space-y-5">
      {nonEmpty.map((d) => {
        const dayItems = byDate.get(d) ?? [];
        return (
          <li key={d} aria-label={fmtLong(d)}>
            <div className="mb-2 flex items-baseline gap-2">
              <h3 className={cx("font-display text-2xl font-medium first-letter:uppercase", d === today && "text-primary")}>{fmtLong(d)}</h3>
              {d === today && <span className="rounded-full bg-primary px-2 py-0.5 text-[0.7rem] font-semibold text-on-primary">сегодня</span>}
            </div>
            {dayItems.length ? (
              <ul className="space-y-1.5">
                {dayItems.map((i) => (
                  <li key={i.key}>
                    <ItemChip item={i} onOpen={onOpen} className="!px-3 !py-2 !text-[15px]" />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Свободный день</p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
