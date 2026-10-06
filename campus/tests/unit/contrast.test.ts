import { describe, expect, it } from "vitest";
import fs from "node:fs";

const css = fs.readFileSync("src/app/globals.css", "utf8");

function block(start: string): Record<string, string> {
  const i = css.indexOf(start);
  const body = css.slice(css.indexOf("{", i) + 1, css.indexOf("\n}", i));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]));
}
const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const themes = { светлая: block(":root {"), тёмная: block(':root[data-theme="dark"]') };
const pairs: [string, string][] = [
  ["text", "bg"], ["text", "surface"], ["muted", "bg"], ["muted", "surface"], ["muted", "surface-2"],
  ["on-primary", "primary"], ["primary", "surface"], ["primary", "primary-soft"],
  ["class-fg", "class-bg"], ["deadline-fg", "deadline-bg"], ["note-fg", "note-bg"],
  ["danger", "surface"], ["danger", "danger-soft"], ["ok", "surface"],
];

describe("контраст WCAG AA (≥ 4.5:1)", () => {
  for (const [name, t] of Object.entries(themes)) {
    for (const [fg, bg] of pairs) {
      it(`${name}: ${fg} на ${bg}`, () => {
        expect(t[fg], `нет --${fg}`).toBeTruthy();
        expect(ratio(t[fg], t[bg])).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
  it("полосы типов видны на поверхности (≥ 3:1)", () => {
    for (const t of Object.values(themes)) for (const bar of ["class-bar", "deadline-bar", "note-bar"]) expect(ratio(t[bar], t["surface"])).toBeGreaterThanOrEqual(3);
  });
});
