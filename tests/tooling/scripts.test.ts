import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
  scripts?: Record<string, string>;
};

describe("npm scripts (ADR-15)", () => {
  it.each(["typecheck", "lint", "test", "e2e", "build"])("defines %s", (name) => {
    expect(pkg.scripts?.[name]).toBeTruthy();
  });
});
