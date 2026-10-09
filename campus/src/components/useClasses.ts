"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { loadWeek, pruneSavedWeeks, type WeekResult } from "@/lib/client/classes";
import type { ClassEvent } from "@/lib/spbu/types";
import { addDays, mondayOf, todayIn } from "@/lib/time";

/** Понедельники (по Москве) всех недель, пересекающих [from, to] с запасом в день на сдвиг поясов. */
export function weeksFor(from: string, to: string): string[] {
  const out: string[] = [];
  for (let m = mondayOf(addDays(from, -1)); m <= addDays(to, 1); m = addDays(m, 7)) out.push(m);
  return out;
}

export function useClasses(groupId: number | null, from: string, to: string) {
  const [weeks, setWeeks] = useState<Record<string, WeekResult>>({});
  const [nonce, setNonce] = useState(0);
  const needed = useMemo(() => weeksFor(from, to), [from, to]);

  useEffect(() => pruneSavedWeeks(mondayOf(todayIn("Europe/Moscow"))), []);

  useEffect(() => {
    if (!groupId) return;
    let cancelled = false;
    const missing = needed.filter((w) => !weeks[`${groupId}:${w}`]);
    if (!missing.length) return;
    Promise.all(missing.map(async (w) => [w, await loadWeek(groupId, w)] as const)).then((res) => {
      if (cancelled) return;
      setWeeks((prev) => ({ ...prev, ...Object.fromEntries(res.map(([w, r]) => [`${groupId}:${w}`, r])) }));
    });
    return () => {
      cancelled = true;
    };
    // weeks намеренно не в зависимостях: догружаем только недостающие при смене периода/повторе
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, needed, nonce]);

  const loading = !!groupId && needed.some((w) => !weeks[`${groupId}:${w}`]);
  const loaded = useMemo(() => needed.map((w) => (groupId ? weeks[`${groupId}:${w}`] : undefined)).filter(Boolean) as WeekResult[], [needed, weeks, groupId]);
  const classes: ClassEvent[] = useMemo(() => loaded.flatMap((r) => r.events), [loaded]);
  const failed = loaded.some((r) => r.failed);
  const staleAt = loaded.filter((r) => r.stale && r.updatedAt).map((r) => r.updatedAt as string).sort()[0] ?? null;
  const staleError = loaded.find((r) => r.stale && r.error)?.error ?? null;
  // «Повторить/Обновить»: забываем и неудавшиеся, и устаревшие недели — они загрузятся заново
  const retry = useCallback(() => {
    setWeeks((prev) => Object.fromEntries(Object.entries(prev).filter(([, v]) => !v.failed && !v.stale)));
    setNonce((n) => n + 1);
  }, []);
  return { classes, loading, failed, staleAt, staleError, retry };
}
