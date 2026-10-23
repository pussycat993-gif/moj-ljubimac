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

// Active locale (owner decision, Step 12): signed-in user → profiles.locale, else the ml_locale cookie, else sr.
const session = vi.hoisted(() => ({
  user: null as { id: string } | null,
  profileLocale: null as string | null,
  visitorLocale: "sr" as "sr" | "en",
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: session.user } }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: session.profileLocale ? { locale: session.profileLocale } : null }),
        }),
      }),
    }),
  }),
}));
vi.mock("@/lib/actions/registration", () => ({ getVisitorLocale: async () => session.visitorLocale }));

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

  const render = async () =>
    (await layout.default({ children: null })) as ReactElement<{ lang: string; className: string }>;

  it("applies both font variables on <html lang=sr-Latn> by default", async () => {
    Object.assign(session, { user: null, profileLocale: null, visitorLocale: "sr" });
    const html = await render();
    expect(html.props.lang).toBe("sr-Latn");
    expect(html.props.className).toContain("var-Nunito");
    expect(html.props.className).toContain("var-Inter");
  });

  it("sets <html lang> from the visitor's ml_locale cookie", async () => {
    Object.assign(session, { user: null, profileLocale: null, visitorLocale: "en" });
    expect((await render()).props.lang).toBe("en");
  });

  it("sets <html lang> from profiles.locale for a signed-in user", async () => {
    Object.assign(session, { user: { id: "u1" }, profileLocale: "en", visitorLocale: "sr" });
    expect((await render()).props.lang).toBe("en");
    Object.assign(session, { user: { id: "u1" }, profileLocale: "sr-Latn", visitorLocale: "en" });
    expect((await render()).props.lang).toBe("sr-Latn");
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
