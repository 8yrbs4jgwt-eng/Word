/**
 * Логотип «Лекторий»: знак (цветной) и надпись. Надпись — маска, закрашенная цветом текста темы:
 * чернильная на светлом фоне и молочно-белая на тёмном. Размеры берутся из пропорций файлов.
 */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <span role="img" aria-label="Лекторий" className={`logo inline-flex items-center ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-mark.svg" alt="" className="logo-mark" draggable={false} />
      <span aria-hidden className="logo-word" />
    </span>
  );
}
