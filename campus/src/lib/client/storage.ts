/** Безопасная обёртка над localStorage (может бросать в приватном режиме). */
export function lsGet<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function lsSet(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* переполнение или запрет — работаем без сохранения */
  }
}

export function lsRemove(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {}
}
