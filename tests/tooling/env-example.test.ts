import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// TC §8.1 "Application" table, in order.
const APPLICATION_NAMES = [
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "R2_BACKUP_BUCKET",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY_JWK",
  "VAPID_SUBJECT",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_APP_SECRET",
  "WHATSAPP_VERIFY_TOKEN",
  "DISPATCH_SECRET",
  "ACTION_TOKEN_SECRET",
  "OPERATOR_ALERT_EMAIL",
  "PADDLE_API_KEY",
  "PADDLE_WEBHOOK_SECRET",
  "NEXT_PUBLIC_PADDLE_CLIENT_TOKEN",
  "NEXT_PUBLIC_PADDLE_ENV",
];

const entries = readFileSync(join(process.cwd(), ".env.example"), "utf8")
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#"))
  .map((line) => {
    const eq = line.indexOf("=");
    return { name: line.slice(0, eq), value: line.slice(eq + 1) };
  });

function isIgnored(path: string) {
  try {
    execFileSync("git", ["check-ignore", "-q", path]);
    return true;
  } catch {
    return false;
  }
}

describe(".env.example (TC §8.1)", () => {
  it("lists exactly the application names, in order", () => {
    expect(entries.map((e) => e.name)).toEqual(APPLICATION_NAMES);
  });

  it("has no values", () => {
    expect(entries.filter((e) => e.value !== "")).toEqual([]);
  });
});

describe(".gitignore", () => {
  it.each([".env", ".env.local", ".env.production", ".env.development.local"])("ignores %s", (file) => {
    expect(isIgnored(file)).toBe(true);
  });

  it("keeps .env.example tracked", () => {
    expect(isIgnored(".env.example")).toBe(false);
  });
});
