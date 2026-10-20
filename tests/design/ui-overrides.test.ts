import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const path = (p: string) => join(process.cwd(), p);
const read = (p: string) => readFileSync(path(p), "utf8").replace(/\r\n/g, "\n");

// Design §6 component inventory.
const PRIMITIVES = [
  "button", "card", "badge", "avatar", "tabs", "input", "textarea", "label", "select", "checkbox",
  "switch", "radio-group", "dialog", "alert-dialog", "sheet", "dropdown-menu", "separator", "skeleton",
  "progress", "table", "sonner", "calendar", "popover",
];

// Approved composites from 04-design/components (StateSwitcher excluded).
const COMPOSITES = [
  "shells", "empty-state", "error-state", "logo-mark", "pet-avatar", "pet-header", "premium-lock",
  "read-only-banner", "reminder-row", "reminder-type-icon", "status-badge",
];

// Undo the only changes the port allows: "@/components/app/x" imports and the hex-free logo comment.
function unport(name: string, source: string) {
  let s = source.replace(/from "@\/components\/app\/([a-z-]+)"/g, 'from "./$1"');
  if (name === "logo-mark") s = s.replace("brand brown = the --primary token)", "brand brown #563218)");
  return s;
}

describe("shadcn primitives (Design §6, ADR-14)", () => {
  it.each(PRIMITIVES)("components/ui/%s.tsx is installed", (name) => {
    expect(existsSync(path(`components/ui/${name}.tsx`))).toBe(true);
  });

  it.each(["card", "sonner"])("components/ui/%s.tsx equals the project override", (name) => {
    expect(read(`components/ui/${name}.tsx`)).toBe(read(`docs/product/04-design/ui-overrides/${name}.tsx`));
  });

  it("card override uses rounded-md and no shadow", () => {
    const card = read("components/ui/card.tsx");
    expect(card).toContain("rounded-md border");
    expect(card).not.toMatch(/shadow-/);
  });

  it("sonner override is fixed to light and re-exports toast", () => {
    const sonner = read("components/ui/sonner.tsx");
    expect(sonner).toContain('theme="light"');
    expect(sonner).not.toContain("next-themes");
    expect(sonner).toContain('export { toast } from "sonner"');
  });
});

describe("composites (Design §6)", () => {
  it.each(COMPOSITES)("components/app/%s.tsx is ported unchanged", (name) => {
    expect(unport(name, read(`components/app/${name}.tsx`))).toBe(
      read(`docs/product/04-design/components/${name}.tsx`),
    );
  });

  it.each(COMPOSITES)("components/app/%s.tsx has no relative imports", (name) => {
    expect(read(`components/app/${name}.tsx`)).not.toMatch(/from "\.\.?\//);
  });

  it("state-switcher is not ported (dev-only)", () => {
    expect(existsSync(path("components/app/state-switcher.tsx"))).toBe(false);
  });
});
