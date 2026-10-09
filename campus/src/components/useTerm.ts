"use client";

import { useCallback, useEffect, useState } from "react";
import { loadTerm, type TermResult } from "@/lib/client/classes";

/** Занятия группы за весь семестр (для списка дисциплин, элективов и подгрупп). */
export function useTerm(groupId: number | null) {
  const [state, setState] = useState<{ id: number; result: TermResult } | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!groupId) return;
    let cancelled = false;
    loadTerm(groupId).then((result) => {
      if (!cancelled) setState({ id: groupId, result });
    });
    return () => {
      cancelled = true;
    };
  }, [groupId, nonce]);

  const current = groupId && state?.id === groupId ? state.result : null;
  const retry = useCallback(() => {
    setState(null);
    setNonce((n) => n + 1);
  }, []);
  return { events: current?.events ?? [], loading: !!groupId && !current, failed: current?.failed ?? false, stale: current?.stale ?? false, retry };
}
