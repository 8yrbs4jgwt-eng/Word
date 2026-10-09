"use client";

import { ArrowLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { Division, Group, ProgramLevel } from "@/lib/spbu/types";
import { Banner, Button, Modal, cx, inputCls } from "@/components/ui";

type Step = 1 | 2 | 3;

async function get<T>(url: string): Promise<{ data: T; stale: boolean }> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "Ошибка загрузки");
  return r.json();
}

export function GroupDialog({ open, onClose, onView, onSave, myGroupId }: { open: boolean; onClose: () => void; onView: (g: { id: number; name: string }) => void; onSave: (g: { id: number; name: string }) => void; myGroupId: number | null }) {
  return (
    <Modal open={open} onClose={onClose} title="Найдите свою группу">
      {open && <Wizard onView={onView} onSave={onSave} myGroupId={myGroupId} />}
    </Modal>
  );
}

function Wizard({ onView, onSave, myGroupId }: { onView: (g: { id: number; name: string }) => void; onSave: (g: { id: number; name: string }) => void; myGroupId: number | null }) {
  const [step, setStep] = useState<Step>(1);
  const [divisions, setDivisions] = useState<Division[] | null>(null);
  const [division, setDivision] = useState<Division | null>(null);
  const [levels, setLevels] = useState<ProgramLevel[] | null>(null);
  const [programId, setProgramId] = useState<{ id: number; label: string } | null>(null);
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [picked, setPicked] = useState<Group | null>(null);
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const run = useCallback(async <T,>(fn: () => Promise<T>, set: (v: T) => void) => {
    setErr(null);
    try {
      set(await fn());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
    }
  }, []);

  const loadDivisions = useCallback(() => run(async () => (await get<Division[]>("/api/timetable/divisions")).data, setDivisions), [run]);
  useEffect(() => {
    get<Division[]>("/api/timetable/divisions").then((r) => setDivisions(r.data), (e) => setErr(e instanceof Error ? e.message : "Ошибка"));
  }, []);

  const chooseDivision = (d: Division) => {
    setDivision(d);
    setLevels(null);
    setQ("");
    setStep(2);
    void run(async () => (await get<ProgramLevel[]>(`/api/timetable/programs?division=${d.alias}`)).data, setLevels);
  };
  const chooseProgram = (id: number, label: string) => {
    setProgramId({ id, label });
    setGroups(null);
    setPicked(null);
    setStep(3);
    void run(async () => (await get<Group[]>(`/api/timetable/groups?program=${id}`)).data, setGroups);
  };

  const back = () => {
    setErr(null);
    setQ("");
    setStep((s) => (s === 3 ? 2 : 1));
  };
  const qq = q.trim().toLowerCase();

  return (
    <div>
      <p className="mb-3 text-sm text-muted">
        Шаг {step} из 3 · {step === 1 ? "направление" : step === 2 ? `программа и год поступления (${division?.name})` : `группа (${programId?.label})`}
      </p>
      {err && (
        <div className="mb-3">
          <Banner tone="error" action={<Button size="sm" variant="soft" onClick={() => (step === 1 ? loadDivisions() : step === 2 && division ? chooseDivision(division) : programId && chooseProgram(programId.id, programId.label))}>Повторить</Button>}>
            {err}
          </Banner>
        </div>
      )}
      {step === 1 && (
        <>
          <input className={cx(inputCls, "mb-3")} placeholder="Например, Менеджмент" aria-label="Поиск направления" value={q} onChange={(e) => setQ(e.target.value)} />
          <List loading={!divisions && !err}>
            {(divisions ?? []).filter((d) => d.name.toLowerCase().includes(qq)).map((d) => (
              <Row key={d.alias} onClick={() => chooseDivision(d)} title={d.name} />
            ))}
          </List>
        </>
      )}
      {step === 2 && (
        <>
          <Button variant="ghost" size="sm" onClick={back} className="mb-2 -ml-2"><ArrowLeft size={16} aria-hidden /> Назад</Button>
          <input className={cx(inputCls, "mb-3")} placeholder="Название программы" aria-label="Поиск программы" value={q} onChange={(e) => setQ(e.target.value)} />
          <List loading={!levels && !err}>
            {(levels ?? []).map((l) => {
              const progs = l.programs.filter((p) => p.years.length && p.name.toLowerCase().includes(qq));
              if (!progs.length) return null;
              return (
                <li key={l.level} className="pb-2">
                  <p className="eyebrow px-1 py-2">{l.level}</p>
                  <ul className="space-y-2">
                    {progs.map((p) => (
                      <li key={p.name} className="rounded-xl border border-border p-3">
                        <p className="mb-2 text-sm font-medium">{p.name}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {p.years.map((y) => (
                            <button key={y.id} type="button" onClick={() => chooseProgram(y.id, `${p.name.split(" / ").pop()}, ${y.year}`)} className="h-9 rounded-lg bg-surface-2 px-3 text-sm font-medium hover:bg-primary-soft" aria-label={`${p.name}, поступление ${y.year}`}>
                              {y.year}
                            </button>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </List>
        </>
      )}
      {step === 3 && (
        <>
          <Button variant="ghost" size="sm" onClick={back} className="mb-2 -ml-2"><ArrowLeft size={16} aria-hidden /> Назад</Button>
          <List loading={!groups && !err}>
            {groups?.length === 0 && <li className="p-3 text-sm text-muted">Для этой программы групп пока нет</li>}
            {(groups ?? []).map((g) => (
              <li key={g.id}>
                <button type="button" aria-pressed={picked?.id === g.id} onClick={() => setPicked(g)} className={cx("flex w-full items-center justify-between rounded-xl border px-3 py-3 text-left", picked?.id === g.id ? "border-primary bg-primary-soft" : "border-border hover:bg-surface-2")}>
                  <span><span className="font-medium">{g.name}</span>{g.form && <span className="ml-2 text-sm text-muted">{g.form}</span>}{g.profiles && <span className="block text-xs text-muted">{g.profiles}</span>}</span>
                  {g.id === myGroupId && <span className="text-xs text-muted">моя</span>}
                </button>
              </li>
            ))}
          </List>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Button disabled={!picked} onClick={() => picked && onView({ id: picked.id, name: picked.name })}>Посмотреть</Button>
            <Button variant="primary" disabled={!picked} onClick={() => picked && onSave({ id: picked.id, name: picked.name })}>Это моя группа</Button>
          </div>
        </>
      )}
    </div>
  );
}

function List({ children, loading }: { children: React.ReactNode; loading: boolean }) {
  return (
    <ul className="max-h-[50dvh] space-y-1.5 overflow-y-auto pr-1" aria-busy={loading}>
      {loading ? <li className="p-3 text-sm text-muted">Загружаем…</li> : children}
    </ul>
  );
}

function Row({ title, onClick }: { title: string; onClick: () => void }) {
  return (
    <li>
      <button type="button" onClick={onClick} className="flex w-full items-center justify-between rounded-xl border border-border px-3 py-3 text-left hover:bg-surface-2">
        <span className="font-medium">{title}</span>
        <ChevronRight size={18} aria-hidden className="text-muted" />
      </button>
    </li>
  );
}
