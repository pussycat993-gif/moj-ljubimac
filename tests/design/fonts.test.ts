import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => [] as { family: string; options: Record<string, unknown> }[]);

vi.mock("next/font/google", () => {
  const font = (family: string) => (options: Record<string, unknown>) => {
    calls.push({ family, options });
    return { className: family, variable: `var-${family}`, style: { fontFamily: family } };
  };
  return { Nunito: font("Nunito"), Inter: font("Inter") };
});
vi.mock("../../app/globals.css", () => ({}));

const layout = await import("@/app/layout");

describe("fonts (Design §4.2)", () => {
  it("loads Nunito 700 with latin and latin-ext as --font-nunito", () => {
    const nunito = calls.find((c) => c.family === "Nunito");
    expect(nunito?.options).toEqual({
      weight: ["700"],
      subsets: ["latin", "latin-ext"],
      variable: "--font-nunito",
    });
  });

  it("loads Inter 400/500/600 with latin and latin-ext as --font-inter", () => {
    const inter = calls.find((c) => c.family === "Inter");
    expect(inter?.options).toEqual({
      weight: ["400", "500", "600"],
      subsets: ["latin", "latin-ext"],
      variable: "--font-inter",
    });
  });

  it("applies both font variables on <html lang=sr-Latn>", () => {
    const html = layout.default({ children: null }) as ReactElement<{ lang: string; className: string }>;
    expect(html.props.lang).toBe("sr-Latn");
    expect(html.props.className).toContain("var-Nunito");
    expect(html.props.className).toContain("var-Inter");
  });

  it("serves the brand icons, 180 px as the Apple touch icon (Design §3)", () => {
    expect(layout.metadata.title).toBe("Moj Ljubimac");
    expect(layout.metadata.icons).toEqual({
      icon: "/brand/app-icon-192.png",
      apple: "/brand/app-icon-180.png",
    });
  });

  it("does not mount a Toaster (OQ-10)", () => {
    expect(readFileSync(join(process.cwd(), "app/layout.tsx"), "utf8")).not.toMatch(/Toaster/);
  });
});
