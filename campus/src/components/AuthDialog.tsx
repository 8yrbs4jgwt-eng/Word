"use client";

import { useState } from "react";
import { Button, Field, Modal, inputCls } from "@/components/ui";
import { useApp } from "@/components/store";

export function AuthDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Вход в аккаунт">
      {open && <AuthForm onDone={onClose} />}
    </Modal>
  );
}

function AuthForm({ onDone }: { onDone: () => void }) {
  const { auth, entries } = useApp();
  const [mode, setMode] = useState<"login" | "register">("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const err = await auth(mode, email, password, name);
    setBusy(false);
    if (err) setError(err);
    else onDone();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-muted">
        Аккаунт нужен, чтобы записи были на всех устройствах и приходили push-напоминания.
        {entries.length > 0 && " Ваши гостевые записи перенесутся автоматически."}
      </p>
      <div role="tablist" aria-label="Режим" className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
        {(["register", "login"] as const).map((m) => (
          <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => { setMode(m); setError(null); }} className={`h-10 rounded-lg text-sm font-medium ${mode === m ? "bg-surface shadow-sm" : "text-muted hover:text-text"}`}>
            {m === "register" ? "Регистрация" : "Вход"}
          </button>
        ))}
      </div>
      {mode === "register" && (
        <Field label="Имя" htmlFor="a-name" hint="необязательно">
          <input id="a-name" className={inputCls} value={name} maxLength={80} autoComplete="name" onChange={(e) => setName(e.target.value)} />
        </Field>
      )}
      <Field label="Email" htmlFor="a-email">
        <input id="a-email" type="email" required className={inputCls} value={email} autoComplete="email" onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label="Пароль" htmlFor="a-pass" hint={mode === "register" ? "Не короче 8 символов" : undefined}>
        <input id="a-pass" type="password" required minLength={mode === "register" ? 8 : undefined} className={inputCls} value={password} autoComplete={mode === "register" ? "new-password" : "current-password"} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      {error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      <Button variant="primary" type="submit" disabled={busy} className="w-full">
        {busy ? "Подождите…" : mode === "register" ? "Создать аккаунт" : "Войти"}
      </Button>
    </form>
  );
}
