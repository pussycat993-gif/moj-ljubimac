import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");
const workflow = read(".github/workflows/ci.yml");
const wrangler = read("wrangler.jsonc");

// GitHub Actions secrets the deploy uses (TC §8.1).
const DEPLOY_SECRETS = [
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_ACCOUNT_ID",
  "SUPABASE_ACCESS_TOKEN",
  "SUPABASE_DB_PASSWORD",
  "SUPABASE_PROJECT_REF",
];

// Server-side application names (TC §8.1) — Worker runtime secrets, never in config.
const RUNTIME_SECRETS = read(".env.example")
  .split(/\r?\n/)
  .map((line) => line.match(/^([A-Z0-9_]+)=/)?.[1])
  .filter((name): name is string => !!name && !name.startsWith("NEXT_PUBLIC_"));

// Shapes of real credentials: JWTs, Supabase/Stripe-style keys, GitHub tokens, long hex/base64 blobs.
const LITERAL_SECRET = [
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
  /\bsb_(secret|publishable)_[A-Za-z0-9_-]{10,}/,
  /\bsbp_[A-Za-z0-9]{20,}/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/,
  /\bre_[A-Za-z0-9]{16,}/,
  /\b[a-f0-9]{32,}\b/,
  /[A-Za-z0-9+/]{40,}={0,2}/,
];

describe("no committed secrets (TC §8.1, ADR-10)", () => {
  it.each([
    ["ci.yml", workflow],
    ["wrangler.jsonc", wrangler],
  ])("%s contains no literal tokens or keys", (_, text) => {
    for (const pattern of LITERAL_SECRET) expect(text).not.toMatch(pattern);
  });

  it.each(DEPLOY_SECRETS)("ci.yml takes %s from GitHub secrets only", (name) => {
    expect(workflow).toContain(`\${{ secrets.${name} }}`);
    const assignments = [...workflow.matchAll(new RegExp(String.raw`^\s*${name}:\s*(.+)$`, "gm"))];
    expect(assignments.length).toBeGreaterThan(0);
    for (const [, value] of assignments) expect(value.trim()).toBe(`\${{ secrets.${name} }}`);
  });

  it("ci.yml references only TC §8.1 secret names", () => {
    const used = [...workflow.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((m) => m[1]);
    expect(used.every((name) => DEPLOY_SECRETS.includes(name))).toBe(true);
  });

  it("ci.yml passes no password or token as a literal flag value", () => {
    expect(workflow).not.toMatch(/--(password|token)[ =](?!"\$[A-Z_]+")/);
  });

  it("wrangler.jsonc holds no vars and no runtime secret names", () => {
    expect(wrangler).not.toMatch(/"vars"\s*:/);
    for (const name of RUNTIME_SECRETS) expect(wrangler).not.toContain(name);
  });
});
