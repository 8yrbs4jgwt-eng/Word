"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DEFAULT_SETTINGS, newId, settingsSchema, type Entry, type Settings } from "@/lib/entries";
import { lsGet, lsRemove, lsSet } from "@/lib/client/storage";

type PublicUser = { id: string; email: string; name: string };
type Op = { type: "put"; entry: Entry } | { type: "del"; id: string };

type Ctx = {
  ready: boolean;
  user: PublicUser | null;
  feedToken: string | null;
  settings: Settings;
  entries: Entry[];
  /** есть изменения, ещё не ушедшие на сервер (офлайн) */
  pending: boolean;
  toast: string | null;
  say: (msg: string) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  saveEntry: (e: Omit<Entry, "updatedAt">) => void;
  removeEntry: (id: string) => void;
  /** отметить выполненным; для повторов — конкретное вхождение */
  toggleDone: (id: string, occurrence?: string) => void;
  auth: (mode: "login" | "register", email: string, password: string, name?: string) => Promise<string | null>;
  logout: () => Promise<void>;
};

const C = createContext<Ctx | null>(null);
export const useApp = () => {
  const v = useContext(C);
  if (!v) throw new Error("useApp вне AppProvider");
  return v;
};

const GUEST_KEY = "campus:guest";
const OUTBOX_KEY = "campus:outbox";
const cacheKey = (uid: string) => `campus:cache:${uid}`;

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<PublicUser | null>(null);
  const [feedToken, setFeedToken] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [pending, setPending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const userRef = useRef<PublicUser | null>(null);
  const entriesRef = useRef<Entry[]>([]);
  const settingsRef = useRef<Settings>(DEFAULT_SETTINGS);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const say = useCallback((msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  const commit = useCallback((next: Entry[], nextSettings: Settings) => {
    entriesRef.current = next;
    settingsRef.current = nextSettings;
    setEntries(next);
    setSettings(nextSettings);
    const u = userRef.current;
    if (u) lsSet(cacheKey(u.id), { entries: next, settings: nextSettings });
    else lsSet(GUEST_KEY, { entries: next, settings: nextSettings });
  }, []);

  /** Отправить накопленные изменения на сервер. */
  const flush = useCallback(async () => {
    if (!userRef.current) return;
    let ops = lsGet<Op[]>(OUTBOX_KEY, []);
    if (!ops.length) return setPending(false);
    try {
      const puts = new Map<string, Entry>();
      const dels: string[] = [];
      for (const op of ops) {
        if (op.type === "put") puts.set(op.entry.id, op.entry);
        else {
          puts.delete(op.id);
          dels.push(op.id);
        }
      }
      for (const id of dels) {
        const r = await fetch(`/api/entries?id=${encodeURIComponent(id)}`, { method: "DELETE" });
        if (!r.ok && r.status !== 404) throw new Error("del");
      }
      if (puts.size) {
        const r = await fetch("/api/entries", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ entries: [...puts.values()] }),
        });
        if (!r.ok) throw new Error("put");
      }
      ops = [];
      lsSet(OUTBOX_KEY, ops);
      setPending(false);
    } catch {
      setPending(true);
    }
  }, []);

  const loadServer = useCallback(
    async (u: PublicUser, serverSettings: Settings) => {
      userRef.current = u;
      lsSet("campus:lastUser", u);
      setUser(u);
      await flush();
      try {
        const r = await fetch("/api/entries");
        if (r.ok) {
          const { entries: list } = (await r.json()) as { entries: Entry[] };
          commit(list, serverSettings);
          return;
        }
      } catch {}
      const cached = lsGet<{ entries: Entry[]; settings: Settings } | null>(cacheKey(u.id), null);
      commit(cached?.entries ?? [], cached?.settings ?? serverSettings);
    },
    [commit, flush],
  );

  // Начальная загрузка
  useEffect(() => {
    (async () => {
      const guest = lsGet<{ entries?: Entry[]; settings?: unknown } | null>(GUEST_KEY, null);
      try {
        const r = await fetch("/api/me");
        const me = (await r.json()) as { user: PublicUser | null; settings?: Settings; feedToken?: string };
        if (me.user && me.settings) {
          setFeedToken(me.feedToken ?? null);
          await loadServer(me.user, me.settings);
          setReady(true);
          return;
        }
      } catch {
        // офлайн: если раньше входили, показываем кэш последнего пользователя
        const lastUser = lsGet<PublicUser | null>("campus:lastUser", null);
        if (lastUser) {
          const cached = lsGet<{ entries: Entry[]; settings: Settings } | null>(cacheKey(lastUser.id), null);
          if (cached) {
            userRef.current = lastUser;
            setUser(lastUser);
            commit(cached.entries, cached.settings);
            setPending(lsGet<Op[]>(OUTBOX_KEY, []).length > 0);
            setReady(true);
            return;
          }
        }
      }
      const parsed = settingsSchema.safeParse(guest?.settings ?? {});
      commit(guest?.entries ?? [], parsed.success ? parsed.data : DEFAULT_SETTINGS);
      setReady(true);
    })();
    const online = () => void flush();
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, [commit, flush, loadServer]);

  // Применить тему
  useEffect(() => {
    const el = document.documentElement;
    if (settings.theme === "system") delete el.dataset.theme;
    else el.dataset.theme = settings.theme;
    try {
      if (settings.theme === "system") localStorage.removeItem("campus:theme");
      else localStorage.setItem("campus:theme", settings.theme);
    } catch {}
  }, [settings.theme]);

  const queue = useCallback(
    (op: Op) => {
      if (!userRef.current) return;
      lsSet(OUTBOX_KEY, [...lsGet<Op[]>(OUTBOX_KEY, []), op]);
      setPending(true);
      void flush();
    },
    [flush],
  );

  const updateSettings = useCallback(
    (patch: Partial<Settings>) => {
      const next = { ...settingsRef.current, ...patch };
      commit(entriesRef.current, next);
      if (userRef.current) {
        void fetch("/api/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(next) }).catch(() => {});
      }
    },
    [commit],
  );

  const saveEntry = useCallback(
    (e: Omit<Entry, "updatedAt">) => {
      const full: Entry = { ...e, updatedAt: Date.now() };
      const list = entriesRef.current;
      const next = list.some((x) => x.id === full.id) ? list.map((x) => (x.id === full.id ? full : x)) : [...list, full];
      commit(next, settingsRef.current);
      queue({ type: "put", entry: full });
      say("Запись сохранена");
    },
    [commit, queue, say],
  );

  const removeEntry = useCallback(
    (id: string) => {
      commit(entriesRef.current.filter((x) => x.id !== id), settingsRef.current);
      queue({ type: "del", id });
      say("Запись удалена");
    },
    [commit, queue, say],
  );

  const toggleDone = useCallback(
    (id: string, occurrence?: string) => {
      const e = entriesRef.current.find((x) => x.id === id);
      if (!e) return;
      const upd: Entry = e.repeat && occurrence
        ? { ...e, doneDates: e.doneDates.includes(occurrence) ? e.doneDates.filter((d) => d !== occurrence) : [...e.doneDates, occurrence], updatedAt: Date.now() }
        : { ...e, done: !e.done, updatedAt: Date.now() };
      commit(entriesRef.current.map((x) => (x.id === id ? upd : x)), settingsRef.current);
      queue({ type: "put", entry: upd });
    },
    [commit, queue],
  );

  const auth = useCallback<Ctx["auth"]>(
    async (mode, email, password, name) => {
      let res: Response;
      try {
        res = await fetch(`/api/auth/${mode}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, password, name }),
        });
      } catch {
        return "Нет соединения с сервером";
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string; user?: PublicUser; settings?: Settings; feedToken?: string };
      if (!res.ok || !body.user || !body.settings) return body.error ?? "Не удалось войти";

      // Переносим гостевые записи и группу в аккаунт
      const guestEntries = entriesRef.current;
      const guestSettings = settingsRef.current;
      const hadGuestData = !userRef.current && guestEntries.length > 0;
      userRef.current = body.user;
      lsSet("campus:lastUser", body.user);
      if (hadGuestData) {
        lsSet(OUTBOX_KEY, [...lsGet<Op[]>(OUTBOX_KEY, []), ...guestEntries.map((entry): Op => ({ type: "put", entry }))]);
      }
      const merged: Settings = {
        ...body.settings,
        group: body.settings.group ?? guestSettings.group,
        selection: body.settings.group ? body.settings.selection : guestSettings.selection,
        tz: body.settings.tz === DEFAULT_SETTINGS.tz ? guestSettings.tz : body.settings.tz,
        theme: guestSettings.theme !== "system" ? guestSettings.theme : body.settings.theme,
      };
      setFeedToken(body.feedToken ?? null);
      await loadServer(body.user, merged);
      if (JSON.stringify(merged) !== JSON.stringify(body.settings)) {
        void fetch("/api/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(merged) });
      }
      lsRemove(GUEST_KEY);
      say(hadGuestData ? "Вы вошли. Гостевые записи перенесены в аккаунт" : "Вы вошли");
      return null;
    },
    [loadServer, say],
  );

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    const u = userRef.current;
    if (u) lsRemove(cacheKey(u.id));
    lsRemove("campus:lastUser");
    lsRemove(OUTBOX_KEY);
    userRef.current = null;
    setUser(null);
    setFeedToken(null);
    setPending(false);
    commit([], { ...DEFAULT_SETTINGS, theme: settingsRef.current.theme });
    say("Вы вышли из аккаунта");
  }, [commit, say]);

  const value = useMemo<Ctx>(
    () => ({ ready, user, feedToken, settings, entries, pending, toast, say, updateSettings, saveEntry, removeEntry, toggleDone, auth, logout }),
    [ready, user, feedToken, settings, entries, pending, toast, say, updateSettings, saveEntry, removeEntry, toggleDone, auth, logout],
  );
  return <C.Provider value={value}>{children}</C.Provider>;
}

export { newId };
