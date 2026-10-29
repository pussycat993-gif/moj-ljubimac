import { readFileSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// ADR-13 backup (TC ADR-13 Mechanics, §8, §8.1; RISK-13): .github/workflows/nightly-backup.yml runs
// scripts/backup.sh nightly and on workflow_dispatch with the TC §8.1 GitHub Actions secrets only; the script
// runs pg_dump against SUPABASE_DB_URL, uploads the dump to R2_BACKUP_BUCKET with the AWS CLI over the R2
// endpoint and deletes objects older than 14 days.

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");
const workflow = read(".github/workflows/nightly-backup.yml");
const script = read("scripts/backup.sh");
const config = read("supabase/config.toml");

const BACKUP_SECRETS = ["SUPABASE_DB_URL", "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BACKUP_BUCKET"];
// TC §8.1 GitHub Actions secrets (all of them).
const GITHUB_SECRETS = [
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_ACCOUNT_ID",
  "SUPABASE_ACCESS_TOKEN",
  "SUPABASE_DB_PASSWORD",
  "SUPABASE_PROJECT_REF",
  ...BACKUP_SECRETS,
];

/** Lines of the script that are not comments. */
const code = script
  .split(/\r?\n/)
  .filter((line) => !line.trim().startsWith("#"))
  .join("\n");

describe("nightly-backup.yml (TC ADR-13, §8)", () => {
  it("runs on a nightly schedule and on manual workflow_dispatch only", () => {
    const on = workflow.slice(workflow.search(/^on:\s*$/m), workflow.search(/^permissions:\s*$/m));
    expect(on).toMatch(/^\s+schedule:\s*\n\s+- cron: "17 1 \* \* \*"\s*$/m);
    expect(on).toMatch(/^\s+workflow_dispatch:\s*$/m);
    expect(on).not.toMatch(/^\s+(push|pull_request):/m);
  });

  it("runs scripts/backup.sh on ubuntu-24.04 with a PGDG pg_dump of the database's major version", () => {
    expect(workflow).toMatch(/runs-on: ubuntu-24\.04/);
    expect(workflow).toMatch(/run: bash scripts\/backup\.sh/);
    const major = /^major_version = (\d+)/m.exec(config)?.[1];
    expect(major).toBeTruthy();
    expect(workflow).toContain("/usr/share/postgresql-common/pgdg/apt.postgresql.org.sh");
    expect(workflow).toContain(`postgresql-client-${major}`);
    expect(workflow).toContain(`PG_DUMP: /usr/lib/postgresql/${major}/bin/pg_dump`);
  });

  it.each(BACKUP_SECRETS)("takes %s from GitHub secrets only", (name) => {
    const assignments = [...workflow.matchAll(new RegExp(String.raw`^\s*${name}:\s*(.+)$`, "gm"))];
    expect(assignments).toHaveLength(1);
    expect(assignments[0][1].trim()).toBe(`\${{ secrets.${name} }}`);
  });

  it("references only TC §8.1 GitHub Actions secret names and no application secret", () => {
    const used = [...workflow.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((m) => m[1]);
    expect(used.length).toBeGreaterThan(0);
    for (const name of used) expect(GITHUB_SECRETS).toContain(name);
    for (const name of ["SUPABASE_SERVICE_ROLE_KEY", "RESEND_API_KEY", "DISPATCH_SECRET", "R2_BUCKET:", "CLOUDFLARE_API_TOKEN"]) {
      expect(workflow).not.toContain(name);
    }
  });

  it("deploys nothing and only reads the repository", () => {
    expect(workflow).toMatch(/^permissions:\s*\n\s+contents: read\s*$/m);
    expect(workflow).not.toMatch(/wrangler|opennextjs|npm run deploy|supabase db push/);
  });
});

describe("scripts/backup.sh (TC ADR-13 Mechanics)", () => {
  it("is valid bash, executable in git, and stops on the first error", () => {
    expect(script.startsWith("#!/usr/bin/env bash")).toBe(true);
    expect(code).toMatch(/^set -euo pipefail$/m);
    const mode = execFileSync("git", ["ls-files", "-s", "scripts/backup.sh"], { encoding: "utf8" });
    expect(mode.startsWith("100755")).toBe(true);
    expect(statSync(join(process.cwd(), "scripts/backup.sh")).size).toBeGreaterThan(0);
  });

  it.each(BACKUP_SECRETS)("requires %s", (name) => {
    expect(code).toContain(`\${${name}:?`);
  });

  it("runs pg_dump in custom format against SUPABASE_DB_URL", () => {
    expect(code).toMatch(/"\$PG_DUMP" --format=custom --dbname="\$SUPABASE_DB_URL"/);
    expect(code).toMatch(/PG_DUMP="\$\{PG_DUMP:-pg_dump\}"/);
  });

  it("uploads the dump to R2_BACKUP_BUCKET with the AWS CLI over the R2 endpoint", () => {
    expect(code).toContain('ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"');
    expect(code).toContain("export AWS_DEFAULT_REGION=auto");
    expect(code).toContain('key="db/moj-ljubimac-${stamp}.dump"');
    expect(code).toContain('stamp="$(date -u +%Y%m%dT%H%M%SZ)"');
    expect(code).toMatch(/aws s3 cp "\$dump" "s3:\/\/\$\{R2_BACKUP_BUCKET\}\/\$\{key\}" --endpoint-url "\$ENDPOINT"/);
  });

  it("deletes backup objects older than 14 days by LastModified", () => {
    expect(code).toMatch(/^RETENTION_DAYS=14$/m);
    expect(code).toContain('date -u -d "${RETENTION_DAYS} days ago"');
    expect(code).toContain("aws s3api list-objects-v2");
    expect(code).toContain("Contents[?LastModified<'${cutoff}'].Key");
    expect(code).toMatch(/aws s3api delete-object --bucket "\$R2_BACKUP_BUCKET" --key "\$old" --endpoint-url "\$ENDPOINT"/);
  });

  it("contains no literal credentials", () => {
    for (const pattern of [/eyJ[A-Za-z0-9_-]{10,}/, /\b[a-f0-9]{32,}\b/, /postgres(ql)?:\/\/[^"$\s]+@/]) {
      expect(script).not.toMatch(pattern);
      expect(workflow).not.toMatch(pattern);
    }
  });
});
