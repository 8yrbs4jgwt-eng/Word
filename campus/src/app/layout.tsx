import type { Metadata, Viewport } from "next";
import { PwaRegister } from "@/components/PwaRegister";
import "./globals.css";

export const metadata: Metadata = {
  title: "Лекторий — расписание и дедлайны",
  description: "Личный учебный календарь студента СПбГУ: пары, дедлайны, заметки и напоминания.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Лекторий", statusBarStyle: "default" },
  icons: { icon: "/icon.svg", apple: "/icon-192.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f7fc" },
    { media: "(prefers-color-scheme: dark)", color: "#0c1325" },
  ],
};

// Выставляем тему до первой отрисовки, чтобы не мигало
const themeScript = `try{var t=JSON.parse(localStorage.getItem('campus:guest')||'null');var s=localStorage.getItem('campus:theme')||(t&&t.settings&&t.settings.theme);if(s==='light'||s==='dark')document.documentElement.dataset.theme=s}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh">
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
