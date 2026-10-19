import { statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const FOLDERS = [
  "app/(app)",
  "app/(org)",
  "app/(auth)",
  "app/(public)",
  "app/admin",
  "app/api",
  "components/ui",
  "components/app",
  "lib/supabase",
  "lib/actions",
  "lib/integrations",
  "lib/i18n",
  "lib/server",
  "scripts",
  "supabase/migrations",
  "supabase/seed",
  "supabase/tests",
  "tests",
  "e2e",
];

describe("ADR-16 folder layout", () => {
  it.each(FOLDERS)("%s exists", (folder) => {
    expect(statSync(join(process.cwd(), folder)).isDirectory()).toBe(true);
  });
});
