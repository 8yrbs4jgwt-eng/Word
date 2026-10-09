"use client";

import { Bell, ChevronLeft, ChevronRight, ListChecks, Plus, Search, Settings as Cog, UserRound, Users, WifiOff } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ALL_FILTERS, applyFilters, classItems, entryItems, sortItems, type Filters, type Item } from "@/lib/calendar";
import { addDays, addMonths, fmtLong, fmtMonthYear, fmtRange, monthGrid, nowMinutesIn, todayIn, weekDays, minToHm } from "@/lib/time";
import { AuthDialog } from "@/components/AuthDialog";
import { EntryDialog } from "@/components/EntryDialog";
import { GroupDialog } from "@/components/GroupDialog";
import { ItemDetails } from "@/components/ItemDetails";
import { DayPlan, DeadlinesPanel } from "@/components/Panels";
import { SelectionDialog } from "@/components/SelectionDialog";
import { SettingsDialog } from "@/components/SettingsDialog";
import { applySelection, undecidedElectives, unresolvedSlots } from "@/lib/selection";
import { Banner, Button, IconButton, KIND_DOT, KIND_LABEL_PL, cx, inputCls } from "@/components/ui";
import { useApp } from "@/components/store";
import { useClasses } from "@/components/useClasses";
import { useTerm } from "@/components/useTerm";
import { AgendaView } from "@/components/views/AgendaView";
import { MonthView } from "@/components/views/MonthView";
import { WeekView } from "@/components/views/WeekView";
import type { Entry } from "@/lib/entries";

type View = "week" | "month" | "agenda";
const VIEWS: { id: View; label: string }[] = [
  { id: "agenda", label: "Список" },
  { id: "week", label: "Неделя" },
  { id: "month", label: "Месяц" },
];

function useIsMobile() {
  const [m, setM] = useState(false);
  useEffect(() => {
    const q = window.matchMedia("(max-width: 767px)");
    const f = () => setM(q.matches);
    f();
    q.addEventListener("change", f);
    return () => q.removeEventListener("change", f);
  }, []);
  return m;
}

function useNow(tz: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  return { today: todayIn(tz, now), nowMin: nowMinutesIn(tz, now), now };
}

function greeting(hour: number) {
  return hour < 5 ? "Доброй ночи" : hour < 12 ? "Доброе утро" : hour < 18 ? "Добрый день" : "Добрый вечер";
}

export function CalendarApp() {
  const app = useApp();
  const { settings, entries, user, ready, pending, toast, updateSettings, toggleDone } = app;
  const tz = settings.tz;
  const { today, nowMin } = useNow(tz);
  const mobile = useIsMobile();

  const [date, setDate] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(ALL_FILTERS);
  const [viewGroup, setViewGroup] = useState<{ id: number; name: string } | null>(null);
  const [dlg, setDlg] = useState<null | "group" | "settings" | "auth" | "select">(null);
  const [entrySeed, setEntrySeed] = useState<{ entry?: Entry; date?: string; kind?: "deadline" | "note" } | null>(null);
  const [details, setDetails] = useState<Item | null>(null);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const f = () => setOnline(navigator.onLine);
    f();
    window.addEventListener("online", f);
    window.addEventListener("offline", f);
    return () => {
      window.removeEventListener("online", f);
      window.removeEventListener("offline", f);
    };
  }, []);

  const anchor = date ?? today;
  const sel = selected ?? anchor;
  const view: View = mobile && settings.view === "week" ? "agenda" : settings.view;
  const group = viewGroup ?? settings.group;
  const isMine = !viewGroup || viewGroup.id === settings.group?.id;

  const [from, to] = useMemo<[string, string]>(() => {
    if (view === "week") {
      const d = weekDays(anchor);
      return [d[0], d[6]];
    }
    if (view === "month") {
      const g = monthGrid(anchor);
      return [g[0], g[41]];
    }
    return [anchor, addDays(anchor, 13)];
  }, [view, anchor]);

  const { classes, loading, failed, staleAt, staleError, retry } = useClasses(group?.id ?? null, from, to);

  // выбор дисциплин и подгрупп применяется только к своей сохранённой группе
  const chosen = useMemo(() => applySelection(classes, settings.selection, group?.id ?? null), [classes, settings.selection, group?.id]);
  // «что ещё не выбрано» считаем по всему семестру, а не по видимой неделе
  const term = useTerm(group && isMine ? group.id : null);
  const unresolved = useMemo(() => (group && isMine ? unresolvedSlots(term.events, settings.selection, group.id) : []), [term.events, settings.selection, group, isMine]);
  const electivesLeft = useMemo(() => (group && isMine ? undecidedElectives(term.events, settings.selection, group.id) : []), [term.events, settings.selection, group, isMine]);

  const all = useMemo(() => {
    const cls = classItems(chosen, tz).filter((i) => i.date >= from && i.date <= to);
    // одна и та же пара может прийти из соседних недель — убираем дубли
    const seen = new Set<string>();
    const uniq = cls.filter((i) => (seen.has(i.key) ? false : (seen.add(i.key), true)));
    return [...uniq, ...entryItems(entries, tz, from, to)];
  }, [chosen, entries, tz, from, to]);
  const items = useMemo(() => applyFilters(all, filters), [all, filters]);
  const dayItems = useMemo(() => sortItems(items.filter((i) => i.date === sel)), [items, sel]);

  // «Сегодня» берём из полного набора, чтобы фильтры не ломали сводку
  const todayAll = useMemo(() => sortItems(all.filter((i) => i.date === today)), [all, today]);
  const stat = {
    classes: todayAll.filter((i) => i.kind === "class" && !i.cancelled).length,
    deadlines: todayAll.filter((i) => i.kind === "deadline" && !i.done).length,
    personal: todayAll.filter((i) => i.kind === "note").length,
  };
  const nextClass = todayAll.find((i) => i.kind === "class" && !i.cancelled && i.start !== null && (i.end ?? i.start) > nowMin);

  function shift(dir: -1 | 1) {
    const base = anchor;
    const next = view === "month" ? addMonths(base, dir) : addDays(base, dir * 7);
    setDate(next);
    setSelected(view === "month" ? next : null);
  }
  const title = view === "month" ? fmtMonthYear(anchor) : view === "week" ? fmtRange(weekDays(anchor)[0], weekDays(anchor)[6]) : fmtRange(from, to);

  const openItem = (i: Item) => {
    if (i.kind === "class" || !i.entryId) return setDetails(i);
    const e = entries.find((x) => x.id === i.entryId);
    if (e) setEntrySeed({ entry: e });
  };
  const toggle = (i: Item) => i.entryId && toggleDone(i.entryId, i.occurrence);

  if (!ready) return <main className="grid min-h-dvh place-items-center text-muted" aria-busy="true">Загружаем…</main>;

  const hour = Math.floor(nowMin / 60);
  const kinds = ["class", "deadline", "note"] as const;

  return (
    <div className="mx-auto flex min-h-dvh max-w-[1400px] flex-col px-3 pb-24 sm:px-5 lg:px-8">
      <a href="#main" className="sr-only-focusable rounded-lg bg-primary px-3 py-2 text-on-primary">К содержимому</a>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 py-4">
        <div className="flex items-center gap-2.5">
          <span aria-hidden className="grid size-10 place-items-center rounded-xl bg-primary text-on-primary font-display text-2xl font-medium">Л</span>
          <span className="font-display text-[26px] font-medium sm:text-[28px]">Лекторий</span>
        </div>
        <div className="relative order-3 w-full md:order-none md:ml-4 md:w-80">
          <Search size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input type="search" aria-label="Поиск по предметам, названиям и аудиториям" placeholder="Поиск" className={cx(inputCls, "pl-9")} value={filters.query} onChange={(e) => setFilters({ ...filters, query: e.target.value })} />
        </div>
        <div className="ml-auto flex items-center gap-1">
          <Button size="sm" onClick={() => setDlg("group")} className="max-w-[11rem]">
            <Users size={16} aria-hidden className="shrink-0" />
            <span className="truncate">{group ? (isMine ? `Моя группа · ${group.name}` : group.name) : "Выбрать группу"}</span>
          </Button>
          {viewGroup && settings.group && !isMine && <Button size="sm" variant="ghost" onClick={() => setViewGroup(null)}>К моей группе</Button>}
          {settings.group && <IconButton label="Мои дисциплины и подгруппы" onClick={() => setDlg("select")}><ListChecks size={20} aria-hidden /></IconButton>}
          <IconButton label="Настройки" onClick={() => setDlg("settings")}><Cog size={20} aria-hidden /></IconButton>
          <IconButton label={user ? `Аккаунт: ${user.email}` : "Войти"} onClick={() => setDlg(user ? "settings" : "auth")}><UserRound size={20} aria-hidden /></IconButton>
        </div>
      </header>

      <main id="main" className="grid flex-1 gap-5 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="min-w-0 space-y-4">
          <section aria-label="Сводка" className="grid gap-3 xl:grid-cols-[1fr_auto]">
            <div className="rounded-2xl bg-primary p-5 text-on-primary">
              <p className="text-sm opacity-90 first-letter:uppercase">{fmtLong(today)}</p>
              <h1 className="font-display text-4xl font-medium sm:text-5xl">{greeting(hour)}{user?.name ? `, ${user.name}` : ""}</h1>
              <p className="mt-2 text-sm opacity-95">
                {!group ? "Выберите группу, чтобы увидеть расписание." : nextClass ? <>Следующая пара: <b className="num">{minToHm(nextClass.start!)}</b> — {nextClass.title}{nextClass.location && `, ${nextClass.location}`}</> : stat.classes ? "Пары на сегодня закончились." : "Сегодня пар нет."}
              </p>
            </div>
            <dl className="grid grid-cols-3 gap-3 text-center xl:w-[22rem]">
              {([["пар сегодня", stat.classes, "class"], ["дедлайнов", stat.deadlines, "deadline"], ["личных дел", stat.personal, "note"]] as const).map(([l, n, k]) => (
                <div key={l} className="rounded-2xl border border-border bg-surface p-3">
                  <dd className="num font-display text-4xl font-medium leading-none">{n}</dd>
                  <dt className="mt-1.5 flex items-center justify-center gap-1.5 text-xs text-muted"><span aria-hidden className={cx("size-2 rounded-full", KIND_DOT[k])} />{l}</dt>
                </div>
              ))}
            </dl>
          </section>

          {!online && <Banner tone="warn"><WifiOff size={14} aria-hidden className="mr-1.5 inline" />Нет сети. Показаны сохранённые данные, изменения отправятся позже.</Banner>}
          {online && pending && user && <Banner tone="info">Есть несохранённые на сервере изменения — отправим автоматически.</Banner>}
          {!group && <Banner tone="info" action={<Button variant="primary" size="sm" onClick={() => setDlg("group")}>Выбрать группу</Button>}>Пары появятся после выбора группы. Дедлайны и заметки можно вести и без неё.</Banner>}
          {(unresolved.length > 0 || electivesLeft.length > 0) && (
            <Banner tone="info" action={<Button variant="primary" size="sm" onClick={() => setDlg("select")}>Выбрать</Button>}>
              {electivesLeft.length > 0 ? `В расписании есть элективы (${electivesLeft.length}) — отметьте свои.` : `В расписании есть параллельные занятия (${unresolved.length}) — выберите свою подгруппу или скройте лишние предметы.`}
            </Banner>
          )}
          {failed && <Banner tone="error" action={<Button size="sm" onClick={retry}>Повторить</Button>}>Не удалось загрузить расписание, и сохранённой копии ещё нет.</Banner>}
          {staleAt && !failed && (
            <Banner tone="warn" action={<Button size="sm" onClick={retry} disabled={loading}>{loading ? "Обновляем…" : "Обновить"}</Button>}>
              Не удалось получить свежее расписание — показана сохранённая копия от {new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: tz }).format(new Date(staleAt))}.
              {staleError && <span className="block text-xs opacity-80">Причина: {staleError}.</span>}
            </Banner>
          )}

          <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Навигация по календарю">
            <Button size="sm" onClick={() => { setDate(null); setSelected(null); }}>Сегодня</Button>
            <IconButton label="Назад" onClick={() => shift(-1)}><ChevronLeft size={20} aria-hidden /></IconButton>
            <IconButton label="Вперёд" onClick={() => shift(1)}><ChevronRight size={20} aria-hidden /></IconButton>
            <h2 aria-live="polite" className="num font-display text-2xl font-medium first-letter:uppercase sm:text-[28px]">{title}</h2>
            {loading && <span className="text-xs text-muted" role="status">Загрузка…</span>}
            <div role="tablist" aria-label="Вид календаря" className="ml-auto grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1">
              {VIEWS.filter((v) => !(mobile && v.id === "week")).map((v) => (
                <button key={v.id} type="button" role="tab" aria-selected={view === v.id} onClick={() => updateSettings({ view: v.id })} className={cx("h-9 rounded-lg px-3 text-sm font-medium", view === v.id ? "bg-surface shadow-sm" : "text-muted hover:text-text")}>{v.label}</button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Фильтр по типу записей">
            {kinds.map((k) => (
              <button key={k} type="button" aria-pressed={filters[k]} onClick={() => setFilters({ ...filters, [k]: !filters[k] })} className={cx("inline-flex h-8 items-center gap-2 rounded-full border px-3 text-sm", filters[k] ? "border-transparent bg-surface-2 font-medium" : "border-border text-muted line-through")}>
                <span aria-hidden className={cx("size-2.5 rounded-full", KIND_DOT[k])} />{KIND_LABEL_PL[k]}
              </button>
            ))}
          </div>

          {view === "week" && <WeekView date={anchor} today={today} items={items} onOpen={openItem} onPickDay={setSelected} selected={sel} nowMin={nowMin} />}
          {view === "month" && <MonthView date={anchor} today={today} items={items} selected={sel} onSelect={setSelected} onMove={(d) => { setSelected(d); if (d.slice(0, 7) !== anchor.slice(0, 7)) setDate(d); }} />}
          {view === "agenda" && <AgendaView from={from} days={14} today={today} items={items} onOpen={openItem} emptyHint={filters.query ? "Ничего не найдено" : undefined} />}
        </div>

        <aside className="space-y-4" aria-label="Дела">
          {view !== "agenda" && <DayPlan date={sel} today={today} items={dayItems} onOpen={openItem} onToggle={toggle} onAdd={() => setEntrySeed({ date: sel })} />}
          <DeadlinesPanel entries={entries} tz={tz} today={today} nowMin={nowMin} onOpen={openItem} onToggle={toggle} />
          <div className="flex items-start gap-2 rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
            <Bell size={16} aria-hidden className="mt-0.5 shrink-0" />
            <p>Напоминания о дедлайнах включаются в «Настройках» — для них нужен аккаунт.</p>
          </div>
        </aside>
      </main>

      <button type="button" onClick={() => setEntrySeed({ date: sel })} aria-label="Добавить запись" className="fixed bottom-5 right-5 z-20 grid size-14 place-items-center rounded-full bg-primary text-on-primary shadow-lg hover:brightness-110">
        <Plus size={26} aria-hidden />
      </button>

      <EntryDialog seed={entrySeed} onClose={() => setEntrySeed(null)} />
      <ItemDetails item={details} onClose={() => setDetails(null)} />
      <GroupDialog
        open={dlg === "group"}
        onClose={() => setDlg(null)}
        myGroupId={settings.group?.id ?? null}
        onView={(g) => { setViewGroup(g); setDlg(null); }}
        onSave={(g) => { updateSettings({ group: g, selection: settings.selection?.groupId === g.id ? settings.selection : null }); setViewGroup(null); setDlg("select"); app.say(`Группа ${g.name} сохранена`); }}
      />
      <SelectionDialog open={dlg === "select"} onClose={() => setDlg(null)} group={settings.group} selection={settings.selection} onSave={(sel) => { updateSettings({ selection: sel }); app.say(sel ? "Расписание обновлено по вашему выбору" : "Показываем всё расписание группы"); }} />
      <SettingsDialog open={dlg === "settings"} onClose={() => setDlg(null)} classes={chosen} onLogin={() => setDlg("auth")} />
      <AuthDialog open={dlg === "auth"} onClose={() => setDlg(null)} />

      <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-0 bottom-24 z-30 flex justify-center px-4">
        {toast && <p className="rounded-xl bg-text px-4 py-2.5 text-sm font-medium text-bg shadow-lg">{toast}</p>}
      </div>
    </div>
  );
}
