import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Design §4 intro + "Exception — web app manifest": raw hex only in these two files — plus, since
// Step 19 (owner decision: emails and the EP-32 action pages inline the Design §4.1 token values,
// which they cannot read as CSS variables), the TOKEN_COLORS table of lib/integrations/resend.ts,
// whose values must equal the app/globals.css tokens.
const TOKEN_TABLE = "lib/integrations/resend.ts";
const ALLOWED = new Set(["app/globals.css", "app/manifest.ts", TOKEN_TABLE]);
const ROOTS = ["app", "components", "lib"];
const HEX = /(?<![\w&/])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![\w-])/g;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(ts|tsx|css)$/.test(name) ? [full] : [];
  });
}

const files = ROOTS.flatMap((r) => walk(join(process.cwd(), r))).map((f) =>
  relative(process.cwd(), f).split("\\").join("/"),
);

describe("no raw hex colours (Design §4)", () => {
  it("scans application source", () => {
    expect(files).toContain("components/app/logo-mark.tsx");
    expect(files).toContain("app/layout.tsx");
  });

  it("finds no hex colour literal outside app/globals.css and app/manifest.ts", () => {
    const offenders = files
      .filter((f) => !ALLOWED.has(f))
      .flatMap((f) => (readFileSync(f, "utf8").match(HEX) ?? []).map((hex) => `${f}: ${hex}`));
    expect(offenders).toEqual([]);
  });

  it("the email / action-page token table holds only app/globals.css token values", () => {
    const css = readFileSync("app/globals.css", "utf8");
    const root = /:root\s*\{([^}]*)\}/.exec(css)![1];
    const cssToken = (name: string) => new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`).exec(root)?.[1];
    const source = readFileSync(TOKEN_TABLE, "utf8");
    const table = /export const TOKEN_COLORS = \{([^}]*)\}/.exec(source)![1];
    const entries = [...table.matchAll(/(\w+): "(#[0-9A-Fa-f]{6})"/g)].map((m) => [m[1], m[2]] as const);
    expect(entries.length).toBeGreaterThan(0);
    for (const [key, hex] of entries) {
      const name = key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
      expect(hex, key).toBe(cssToken(name));
    }
    // No other hex in that file.
    expect((source.match(HEX) ?? []).length).toBe(entries.length);
  });

  it("detects a hex literal (self-check)", () => {
    expect('color: "#563218"'.match(HEX)).toEqual(["#563218"]);
    expect("bg-[#fff]".match(HEX)).toEqual(["#fff"]);
    expect("brand brown #563218)".match(HEX)).toEqual(["#563218"]);
  });
});
