import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n");
const css = read("app/globals.css");

// Design System §4.1 colour table.
const TOKENS: Record<string, string> = {
  "--background": "#F6F1EB",
  "--foreground": "#2A1D14",
  "--card": "#FFFFFF",
  "--card-foreground": "#2A1D14",
  "--muted": "#EFE7DF",
  "--muted-foreground": "#6B5B4E",
  "--primary": "#563218",
  "--primary-foreground": "#FFFFFF",
  "--secondary": "#EFE7DF",
  "--secondary-foreground": "#2A1D14",
  "--accent": "#EFE7DF",
  "--accent-foreground": "#2A1D14",
  "--border": "#D9CCBF",
  "--input": "#D9CCBF",
  "--ring": "#563218",
  "--pet-female": "#9E2F59",
  "--pet-female-soft": "#F9DCE5",
  "--pet-male": "#4A6624",
  "--pet-male-soft": "#D6E6B8",
  "--pet-neutral": "#57534E",
  "--pet-neutral-soft": "#EFE7DF",
  "--success": "#15803D",
  "--success-foreground": "#FFFFFF",
  "--warning": "#B45309",
  "--warning-foreground": "#FFFFFF",
  "--destructive": "#B91C1C",
  "--destructive-foreground": "#FFFFFF",
  "--success-soft": "#D9EBC8",
  "--warning-soft": "#F8E3A3",
  "--destructive-soft": "#F6D0D0",
  "--info-soft": "#DCE4F2",
};

// Colour utilities the @theme inline block must expose (Design §4.1 code block).
const THEME_COLOURS = [
  "background", "foreground", "card", "card-foreground", "popover", "popover-foreground",
  "muted", "muted-foreground", "primary", "primary-foreground", "secondary", "secondary-foreground",
  "accent", "accent-foreground", "border", "input", "ring", "pet-accent", "pet-accent-soft",
  "success", "success-foreground", "warning", "warning-foreground", "destructive", "destructive-foreground",
  "success-soft", "warning-soft", "destructive-soft", "info-soft",
];

function block(selector: RegExp): string {
  const m = css.match(selector);
  if (!m) throw new Error(`block ${selector} not found`);
  return m[1];
}

describe("design tokens (Design §4.1)", () => {
  it("app/globals.css equals 04-design/globals.css", () => {
    expect(css).toBe(read("docs/product/04-design/globals.css"));
  });

  const root = block(/:root\s*\{([^}]*)\}/);

  it.each(Object.entries(TOKENS))("%s resolves to %s", (token, value) => {
    const m = root.match(new RegExp(`\\s${token}:\\s*([^;]+);`));
    expect(m?.[1].trim().toUpperCase()).toBe(value);
  });

  it("pet accent defaults to the neutral pair", () => {
    expect(root).toMatch(/--pet-accent:\s*var\(--pet-neutral\);/);
    expect(root).toMatch(/--pet-accent-soft:\s*var\(--pet-neutral-soft\);/);
  });

  it.each(["female", "male"])('[data-pet-sex="%s"] sets the accent pair', (sex) => {
    const rule = block(new RegExp(`\\[data-pet-sex="${sex}"\\]\\s*\\{([^}]*)\\}`));
    expect(rule).toMatch(new RegExp(`--pet-accent:\\s*var\\(--pet-${sex}\\);`));
    expect(rule).toMatch(new RegExp(`--pet-accent-soft:\\s*var\\(--pet-${sex}-soft\\);`));
  });

  const theme = block(/@theme inline\s*\{([\s\S]*?)\n\}/);

  it.each(THEME_COLOURS)("@theme inline maps --color-%s", (name) => {
    expect(theme).toMatch(new RegExp(`--color-${name}:\\s*var\\(--${name}\\);`));
  });

  it("@theme inline maps the fonts to the next/font variables", () => {
    expect(theme).toMatch(/--font-heading:\s*var\(--font-nunito\)/);
    expect(theme).toMatch(/--font-sans:\s*var\(--font-inter\)/);
  });
});
