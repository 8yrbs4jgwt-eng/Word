"use client";

import { Bell, BellOff } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { useApp } from "@/components/store";

type State = "loading" | "unsupported" | "denied" | "off" | "on";

const toKey = (b64: string) => {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

async function registration() {
  return (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
}

export function PushSettings() {
  const { user, say } = useApp();
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setState("unsupported");
      if (Notification.permission === "denied") return setState("denied");
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        setState((await reg?.pushManager.getSubscription()) ? "on" : "off");
      } catch {
        setState("off");
      }
    })();
  }, []);

  async function enable() {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return setState(perm === "denied" ? "denied" : "off");
      const reg = await registration();
      await navigator.serviceWorker.ready;
      const { publicKey } = (await (await fetch("/api/push/key")).json()) as { publicKey: string };
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(publicKey) }));
      const r = await fetch("/api/push/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ subscription: sub.toJSON() }) });
      if (!r.ok) throw new Error();
      setState("on");
      say("Напоминания включены на этом устройстве");
    } catch {
      say("Не удалось включить уведомления");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch(`/api/push/subscribe?endpoint=${encodeURIComponent(sub.endpoint)}`, { method: "DELETE" });
        await sub.unsubscribe();
      }
      setState("off");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    const r = await fetch("/api/push/test", { method: "POST" });
    say(r.ok ? "Тестовое уведомление отправлено" : "Не получилось отправить уведомление");
  }

  return (
    <section className="space-y-3" aria-labelledby="s-push">
      <h3 id="s-push" className="eyebrow">Напоминания о дедлайнах</h3>
      {!user ? (
        <p className="text-sm text-muted">Push-напоминания приходят на устройства из вашего аккаунта — сначала войдите.</p>
      ) : state === "unsupported" ? (
        <p className="text-sm text-muted">Браузер не поддерживает push. На iPhone добавьте сайт на экран «Домой» (Поделиться → На экран «Домой») и откройте оттуда.</p>
      ) : state === "denied" ? (
        <p className="text-sm text-danger">Уведомления запрещены в настройках браузера для этого сайта. Разрешите их и вернитесь сюда.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {state === "on" ? (
            <>
              <Button onClick={disable} disabled={busy}><BellOff size={16} aria-hidden /> Выключить на этом устройстве</Button>
              <Button variant="ghost" onClick={test}>Отправить тест</Button>
            </>
          ) : (
            <Button variant="primary" onClick={enable} disabled={busy || state === "loading"}><Bell size={16} aria-hidden /> Включить уведомления</Button>
          )}
          <p className="w-full text-sm text-muted">Время напоминания выбирается в каждой записи: за час, за день и т. д.</p>
        </div>
      )}
    </section>
  );
}
