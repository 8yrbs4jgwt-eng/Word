"use client";

import { useEffect } from "react";

/** Регистрирует service worker в production (в dev он мешает горячей перезагрузке). */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
