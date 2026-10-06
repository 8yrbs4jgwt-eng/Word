"use client";

import { Check, Repeat, Flag } from "lucide-react";
import type { Item } from "@/lib/calendar";
import { minToHm } from "@/lib/time";
import { KIND_CLS, KIND_LABEL, cx } from "@/components/ui";

export function timeLabel(i: Item) {
  if (i.start === null) return "весь день";
  return i.end !== null ? `${minToHm(i.start)}–${minToHm(i.end)}` : minToHm(i.start);
}

export function itemAria(i: Item) {
  const parts = [KIND_LABEL[i.kind], timeLabel(i), i.title];
  if (i.location) parts.push(i.location);
  if (i.cancelled) parts.push("отменено");
  if (i.done) parts.push("выполнено");
  if (i.high) parts.push("важно");
  return parts.join(", ");
}

export function ItemChip({ item, onOpen, compact, className, style }: { item: Item; onOpen: (i: Item) => void; compact?: boolean; className?: string; style?: React.CSSProperties }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      aria-label={itemAria(item)}
      style={style}
      className={cx(
        "block w-full min-w-0 overflow-hidden rounded-lg border-l-[3px] px-2 py-1 text-left text-xs leading-snug hover:brightness-95",
        KIND_CLS[item.kind],
        (item.done || item.cancelled) && "opacity-70",
        className,
      )}
    >
      <span className="flex items-center gap-1">
        {!compact && <span className="num font-semibold">{timeLabel(item)}</span>}
        {item.high && <Flag size={11} aria-hidden className="shrink-0" />}
        {item.repeats && <Repeat size={11} aria-hidden className="shrink-0" />}
        {item.done && <Check size={12} aria-hidden className="shrink-0" />}
      </span>
      <span className={cx("block break-words", compact ? "truncate" : "line-clamp-3 font-medium", (item.done || item.cancelled) && "line-through")}>{item.title}</span>
      {!compact && item.location && <span className="block truncate opacity-80">{item.location}</span>}
    </button>
  );
}
