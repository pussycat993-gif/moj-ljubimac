import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultAppShellLabels, defaultPublicShellLabels } from "@/components/app/shells";
import { dictionaries, format, fromProfileLocale, parseLocale, toProfileLocale } from "@/lib/i18n";
import { en } from "@/lib/i18n/en";
import { sr } from "@/lib/i18n/sr";

// NFR-05 / TC §7: 100% of UI strings in both locales; a missing key fails the build.

type Tree = { [key: string]: string | Tree };

function leaves(tree: Tree, prefix = ""): [string, string][] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === "string" ? [[`${prefix}${key}`, value] as [string, string]] : leaves(value, `${prefix}${key}.`),
  );
}

const srLeaves = new Map(leaves(sr as Tree));
const enLeaves = new Map(leaves(en as Tree));

describe("lib/i18n dictionaries (NFR-05)", () => {
  it("sr and en have identical key sets", () => {
    expect([...enLeaves.keys()].sort()).toEqual([...srLeaves.keys()].sort());
  });

  it("no string is empty", () => {
    for (const [key, value] of [...srLeaves, ...enLeaves]) expect(value.trim(), key).not.toBe("");
  });

  it("every {placeholder} appears in both translations", () => {
    const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
    for (const [key, value] of srLeaves) expect(placeholders(enLeaves.get(key)!), key).toEqual(placeholders(value));
  });

  it("en.ts is typed by the Serbian keys, so a missing key fails `npm run typecheck`", () => {
    const source = readFileSync(join(process.cwd(), "lib/i18n/en.ts"), "utf8");
    expect(source).toMatch(/import type \{ Dictionary \} from "\.\/sr"/);
    expect(source).toMatch(/export const en: Dictionary = \{/);
    const srSource = readFileSync(join(process.cwd(), "lib/i18n/sr.ts"), "utf8");
    expect(srSource).toMatch(/export type Dictionary = Widen<typeof sr>/);
  });

  it("the Serbian shell labels are exactly the shells' default copy", () => {
    expect(sr.shell.app).toEqual(defaultAppShellLabels);
    expect(sr.shell.public).toEqual(defaultPublicShellLabels);
  });
});

describe("lib/i18n locale helpers", () => {
  it("ml_locale values: sr | en; anything else (or none) → sr", () => {
    expect(parseLocale("en")).toBe("en");
    expect(parseLocale("sr")).toBe("sr");
    expect(parseLocale(undefined)).toBe("sr");
    expect(parseLocale("de")).toBe("sr");
  });

  it("maps to and from profiles.locale (sr-Latn | en)", () => {
    expect(toProfileLocale("sr")).toBe("sr-Latn");
    expect(toProfileLocale("en")).toBe("en");
    expect(fromProfileLocale("sr-Latn")).toBe("sr");
    expect(fromProfileLocale("en")).toBe("en");
  });

  it("format fills placeholders", () => {
    expect(format(dictionaries.sr.terms.intro, { version: "2026-10-20" })).toContain("Verzija 2026-10-20");
  });
});
