/* Лекторий — service worker: офлайн-оболочка и push-уведомления. */
const VERSION = "v1";
const SHELL = `campus-shell-${VERSION}`;
const STATIC = `campus-static-${VERSION}`;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.add("/")).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => ![SHELL, STATIC].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return; // API кэширует само приложение

  // Навигация: сеть, при отказе — сохранённая оболочка
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put("/", copy));
          return res;
        })
        .catch(() => caches.match("/").then((r) => r || new Response("Нет соединения", { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } }))),
    );
    return;
  }

  // Статика (хэшированные файлы Next, иконки): из кэша, параллельно обновляем
  if (url.pathname.startsWith("/_next/static/") || /\.(png|svg|webmanifest|ico|woff2?)$/.test(url.pathname)) {
    e.respondWith(
      caches.open(STATIC).then(async (c) => {
        const hit = await c.match(req);
        const net = fetch(req)
          .then((res) => {
            if (res.ok) c.put(req, res.clone());
            return res;
          })
          .catch(() => hit);
        return hit || net;
      }),
    );
  }
});

self.addEventListener("push", (e) => {
  let d = { title: "Лекторий", body: "", tag: undefined, url: "/" };
  try {
    d = { ...d, ...e.data.json() };
  } catch {}
  e.waitUntil(
    self.registration.showNotification(d.title, {
      body: d.body,
      tag: d.tag,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: d.url },
      lang: "ru",
    }),
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) if ("focus" in c) return c.focus();
      return self.clients.openWindow(url);
    }),
  );
});
