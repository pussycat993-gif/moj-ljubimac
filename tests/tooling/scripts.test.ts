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

// Step 03 follow-up (done in Step F1): the adapter output and the generated Workers types are ignored in
// eslint.config.mjs itself, so `npm run lint` is plain `eslint .` and reports no warnings from generated code.
describe("eslint ignores (Step F1)", () => {
  it("npm run lint is plain eslint .", () => {
    expect(pkg.scripts?.lint).toBe("eslint .");
  });

  it.each([".open-next/worker.js", ".wrangler/state/x.js", "cloudflare-env.d.ts"])("%s is ignored", async (file) => {
    const { ESLint } = await import("eslint");
    expect(await new ESLint({ cwd: process.cwd() }).isPathIgnored(file)).toBe(true);
  });

  it("source files are still linted", async () => {
    const { ESLint } = await import("eslint");
    expect(await new ESLint({ cwd: process.cwd() }).isPathIgnored("proxy.ts")).toBe(false);
  });
});
