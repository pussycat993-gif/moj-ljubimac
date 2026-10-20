import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Design §4 intro + "Exception — web app manifest": raw hex only in these two files.
const ALLOWED = new Set(["app/globals.css", "app/manifest.ts"]);
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

  it("detects a hex literal (self-check)", () => {
    expect('color: "#563218"'.match(HEX)).toEqual(["#563218"]);
    expect("bg-[#fff]".match(HEX)).toEqual(["#fff"]);
    expect("brand brown #563218)".match(HEX)).toEqual(["#563218"]);
  });
});
