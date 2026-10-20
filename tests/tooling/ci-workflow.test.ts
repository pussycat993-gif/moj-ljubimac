import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(join(process.cwd(), ".github/workflows/ci.yml"), "utf8");
const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
  scripts: Record<string, string>;
};

/** Top-level keys under `jobs:` mapped to the text of each job. */
function jobs(): Record<string, string> {
  const body = workflow.slice(workflow.search(/^jobs:\s*$/m));
  const result: Record<string, string> = {};
  const parts = body.split(/^ {2}(?=[\w-]+:\s*$)/m).slice(1);
  for (const part of parts) {
    const name = part.slice(0, part.indexOf(":"));
    result[name] = part;
  }
  return result;
}

/** `run:` commands of a job, in order. */
function runs(job: string): string[] {
  return [...job.matchAll(/^\s+(?:- )?run:\s*(\|?)(.*)$/gm)].map((m, i, all) => {
    if (m[1] !== "|") return m[2].trim();
    const start = m.index! + m[0].length;
    const end = all[i + 1]?.index ?? job.length;
    return job.slice(start, end).trim();
  });
}

function positions(commands: string[], checks: string[]): number[] {
  return checks.map((check) => commands.findIndex((cmd) => cmd.includes(check)));
}

describe("CI workflow (TC §8, ADR-10, ADR-15)", () => {
  it("runs on every push", () => {
    expect(workflow).toMatch(/^on:\s*\n\s+push:\s*$/m);
    expect(workflow).not.toMatch(/branches(-ignore)?:/);
  });

  it("has only the check and deploy-production jobs", () => {
    expect(Object.keys(jobs()).sort()).toEqual(["check", "deploy-production"]);
  });

  it('"check" runs install, typecheck, lint, unit tests, pgTAP and build in that order', () => {
    const check = jobs().check;
    const order = positions(runs(check), [
      "npm ci",
      "npm run typecheck",
      "npm run lint",
      "npm test",
      "npx supabase start",
      "npx supabase test db",
      "npm run build",
    ]);
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(check.indexOf("supabase/setup-cli")).toBeLessThan(check.indexOf("npx supabase start"));
    expect(check).not.toMatch(/continue-on-error/);
  });

  it('"check" is not limited to a branch', () => {
    expect(jobs().check).not.toMatch(/^\s+if:/m);
  });

  it('"deploy-production" runs only on main, after check', () => {
    const deploy = jobs()["deploy-production"];
    expect(deploy).toMatch(/^\s+if:\s*github\.ref == 'refs\/heads\/main'\s*$/m);
    expect(deploy).toMatch(/^\s+needs:\s*check\s*$/m);
    expect(deploy).not.toMatch(/continue-on-error/);
  });

  it('"deploy-production" runs supabase db push before the Cloudflare deploy', () => {
    const commands = runs(jobs()["deploy-production"]);
    const push = commands.findIndex((cmd) => cmd.includes("supabase db push"));
    const deploy = commands.findIndex((cmd) => cmd.includes("npm run deploy"));
    expect(push).toBeGreaterThanOrEqual(0);
    expect(deploy).toBeGreaterThan(push);
    expect(pkg.scripts.deploy).toContain("opennextjs-cloudflare deploy");
  });

  it("uploads no preview or version on any branch", () => {
    expect(workflow).not.toMatch(/opennextjs-cloudflare upload|wrangler versions|versions upload/);
    const code = workflow.replace(/^\s*#.*$/gm, "");
    expect(code).not.toMatch(/preview/i);
    expect(jobs().check).not.toMatch(/npm run deploy|wrangler deploy|supabase db push/);
    expect(pkg.scripts.upload).toBeUndefined();
    expect(Object.values(pkg.scripts).join("\n")).not.toMatch(/opennextjs-cloudflare upload/);
  });

  it('defines the adapter\'s local "preview" script', () => {
    expect(pkg.scripts.preview).toContain("opennextjs-cloudflare preview");
  });
});
