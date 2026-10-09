"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { ItemKind } from "@/lib/calendar";

export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(" ");

export const KIND_LABEL: Record<ItemKind, string> = { class: "Пара", deadline: "Дедлайн", note: "Заметка" };
export const KIND_LABEL_PL: Record<ItemKind, string> = { class: "Пары", deadline: "Дедлайны", note: "Заметки" };

/** Классы цвета для типа записи: фон, текст, левая полоса. */
export const KIND_CLS: Record<ItemKind, string> = {
  class: "bg-class-bg text-class-fg border-class-bar",
  deadline: "bg-deadline-bg text-deadline-fg border-deadline-bar",
  note: "bg-note-bg text-note-fg border-note-bar",
};
export const KIND_DOT: Record<ItemKind, string> = { class: "bg-class-bar", deadline: "bg-deadline-bar", note: "bg-note-bar" };

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "soft" | "ghost" | "danger"; size?: "sm" | "md" };

export function Button({ variant = "soft", size = "md", className, ...p }: BtnProps) {
  return (
    <button
      type="button"
      {...p}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none",
        size === "sm" ? "h-9 px-3 text-sm" : "h-11 px-4 text-[0.95rem]",
        variant === "primary" && "bg-primary text-on-primary hover:brightness-110",
        variant === "soft" && "bg-surface-2 text-text hover:bg-primary-soft",
        variant === "ghost" && "text-text hover:bg-surface-2",
        variant === "danger" && "bg-danger-soft text-danger hover:brightness-95",
        className,
      )}
    />
  );
}

export function IconButton({ label, className, children, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...p}
      className={cx("inline-flex size-11 md:size-10 items-center justify-center rounded-xl text-text hover:bg-surface-2 transition-colors disabled:opacity-40", className)}
    >
      {children}
    </button>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  // Событие close срабатывает и при программном закрытии — тогда onClose звать нельзя,
  // иначе оно сбросит только что открытое следующее окно.
  const programmatic = useRef(false);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) {
      programmatic.current = true;
      d.close();
    }
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={() => {
        if (programmatic.current) programmatic.current = false;
        else onClose();
      }}
      onClick={(e) => e.target === ref.current && onClose()}
      className={cx(
        "m-auto w-[calc(100%-1.5rem)] rounded-2xl border border-border bg-surface p-0 shadow-2xl max-h-[92dvh] overflow-y-auto",
        wide ? "max-w-2xl" : "max-w-md",
      )}
    >
      {open && (
        <div className="p-5 sm:p-6">
          <div className="mb-4 flex items-start justify-between gap-3">
            <h2 id={titleId} className="font-display text-[26px] font-medium">
              {title}
            </h2>
            <IconButton label="Закрыть" onClick={onClose} className="-mr-2 -mt-1">
              <X size={20} aria-hidden />
            </IconButton>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: string; error?: string | null; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-muted">{hint}</p>}
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export const inputCls =
  "h-11 w-full rounded-xl border border-border bg-surface px-3 text-[0.95rem] text-text placeholder:text-muted";

export function Banner({ tone = "info", children, action }: { tone?: "info" | "warn" | "error"; children: ReactNode; action?: ReactNode }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cx(
        "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-4 py-3 text-sm",
        tone === "info" && "border-border bg-surface-2 text-text",
        tone === "warn" && "border-deadline-bar bg-deadline-bg text-deadline-fg",
        tone === "error" && "border-danger bg-danger-soft text-danger",
      )}
    >
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  );
}
