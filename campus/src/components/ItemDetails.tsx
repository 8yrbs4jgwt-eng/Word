"use client";

import { MapPin, User } from "lucide-react";
import type { Item } from "@/lib/calendar";
import { fmtLong } from "@/lib/time";
import { Modal } from "@/components/ui";
import { timeLabel } from "@/components/views/ItemChip";

/** Карточка пары (только чтение). */
export function ItemDetails({ item, onClose }: { item: Item | null; onClose: () => void }) {
  return (
    <Modal open={!!item} onClose={onClose} title={item?.title ?? ""}>
      {item && (
        <div className="space-y-3 text-[0.95rem]">
          {item.cancelled && <p role="status" className="rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger">Пара отменена</p>}
          <p className="first-letter:uppercase">
            {fmtLong(item.date)}, <span className="num font-semibold">{timeLabel(item)}</span>
          </p>
          {item.location && (
            <p className="flex items-start gap-2"><MapPin size={18} aria-hidden className="mt-0.5 shrink-0 text-muted" /> {item.location}</p>
          )}
          {item.teacher && (
            <p className="flex items-start gap-2"><User size={18} aria-hidden className="mt-0.5 shrink-0 text-muted" /> {item.teacher}</p>
          )}
          <p className="text-sm text-muted">Расписание берётся с timetable.spbu.ru и не редактируется.</p>
        </div>
      )}
    </Modal>
  );
}
