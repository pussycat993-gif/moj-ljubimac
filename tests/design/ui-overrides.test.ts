import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultErrorStateLabels } from "@/components/app/error-state";
import { defaultPetHeaderLabels } from "@/components/app/pet-header";
import { defaultReminderRowLabels } from "@/components/app/reminder-row";
import { defaultAppShellLabels, defaultPublicShellLabels } from "@/components/app/shells";

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
  if (name === "shells") s = stripShellLabels(s);
  if (name === "error-state") s = stripErrorStateLabels(s);
  if (name === "pet-header") s = stripPetHeaderLabels(s);
  if (name === "reminder-row") s = stripReminderRowLabels(s);
  if (name === "reminder-type-icon") s = stripReminderTypeIconMessage(s);
  if (name === "read-only-banner") s = stripReadOnlyBannerAction(s);
  return s;
}

// Owner decision (Step 12, FR-35): AppShell and PublicShell take one optional `labels` prop whose defaults are the
// mockup's Serbian strings, so the app can pass the active dictionary. That prop is the only allowed change, so it
// is ignored here: drop its types and defaults (the labels:start…labels:end block) and the prop declarations, and
// put each default value back where `labels.*` is used. Everything else must still equal the docs mockup.
function stripShellLabels(source: string) {
  const values: Record<string, string> = {
    ...Object.fromEntries(Object.entries(defaultAppShellLabels).filter(([key]) => key !== "nav")),
    ...defaultPublicShellLabels,
  };
  const value = (key: string) => {
    if (!(key in values)) throw new Error(`unknown shell label: ${key}`);
    return values[key];
  };
  return source
    .replace(/\/\/ labels:start[\s\S]*?\/\/ labels:end\n\n/, "")
    .replace("  topBarExtra,\n  labels = defaultAppShellLabels,\n", "  topBarExtra,\n")
    .replace("  topBarExtra?: ReactNode\n  labels?: AppShellLabels\n", "  topBarExtra?: ReactNode\n")
    .replace(
      "export function PublicShell({\n  children,\n  wide = false,\n  labels = defaultPublicShellLabels,\n}: {\n  children: ReactNode\n  wide?: boolean\n  labels?: PublicShellLabels\n}) {",
      "export function PublicShell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {",
    )
    .replace(/labels\.nav\[\((.+?)\) as NavLabel\]/g, "$1")
    .replace(/labels\.nav\[(.+?) as NavLabel\]/g, "$1")
    .replace(/\$\{labels\.(\w+)\}/g, (_, k: string) => value(k))
    .replace(/=\{labels\.(\w+)\}/g, (_, k: string) => `="${value(k)}"`)
    .replace(/\{labels\.(\w+)\}/g, (_, k: string) => value(k))
    .replace(/labels\.(\w+)/g, (_, k: string) => `"${value(k)}"`);
}

// Owner decision (Step 13, FR-35): ErrorState takes one optional `labels` prop (the button text) whose default is
// the mockup's Serbian string, so screens can pass the active dictionary. As for the shells, that prop is the only
// allowed change and is ignored here; everything else must still equal the docs mockup.
function stripErrorStateLabels(source: string) {
  return source
    .replace(/\/\/ labels:start[\s\S]*?\/\/ labels:end\n\n/, "")
    .replace("  onRetry,\n  labels = defaultErrorStateLabels,\n", "  onRetry,\n")
    .replace("  onRetry?: () => void\n  labels?: ErrorStateLabels\n", "  onRetry?: () => void\n")
    .replace("{labels.retry}", defaultErrorStateLabels.retry);
}

// Owner decision (Step 14, FR-35): PetHeader takes one optional `labels` prop (the chip list's aria-label) whose
// default is the mockup's Serbian string. As above, that prop is the only allowed change and is ignored here.
function stripPetHeaderLabels(source: string) {
  return source
    .replace(/\n\/\/ labels:start[\s\S]*?\/\/ labels:end\n/, "")
    .replace("  actions,\n  labels = defaultPetHeaderLabels,\n", "  actions,\n")
    .replace("  actions?: ReactNode\n  labels?: PetHeaderLabels\n", "  actions?: ReactNode\n")
    .replace("aria-label={labels.chips}", `aria-label="${defaultPetHeaderLabels.chips}"`);
}

// Owner decision (Step 17, FR-35): ReminderRow takes an optional `labels` prop ("Za mene", "Urađeno", the channel
// and status labels) whose defaults are the mockup's Serbian strings, and an optional `canMarkDone` prop (default
// true) that hides "Urađeno" when the caller may not mark the instance (EP-25 can_mark_done). Those two props are the
// only allowed changes and are ignored here; everything else must still equal the docs mockup.
function stripReminderRowLabels(source: string) {
  return source
    .replace(/\n\/\/ labels:start[\s\S]*?\/\/ labels:end\n/, "")
    .replace(
      "export function ReminderRow({\n  reminder,\n  onDone,\n  canMarkDone = true,\n  labels = defaultReminderRowLabels,\n}: {\n  reminder: ReminderRowData\n  onDone?: (id: string) => void\n  canMarkDone?: boolean\n  labels?: ReminderRowLabels\n}) {",
      "export function ReminderRow({ reminder, onDone }: { reminder: ReminderRowData; onDone?: (id: string) => void }) {",
    )
    .replace("{reminder.pet ? reminder.pet.name : labels.forMe}", `{reminder.pet ? reminder.pet.name : "${defaultReminderRowLabels.forMe}"}`)
    .replace("aria-label={labels.channels[c]}", "aria-label={channelLabel[c]}")
    .replace(" label={labels.status?.[reminder.status]}", "")
    .replace('{reminder.status !== "done" && canMarkDone && (', '{reminder.status !== "done" && (')
    .replace("{labels.done}", defaultReminderRowLabels.done);
}

// Owner decision (Step 28c, carried from Step 28a): reminder_type has the value `message` (the S12 Poruke row), so
// ReminderTypeIcon gets a `message` entry (MessageCircle, "Poruke"). That entry is the only allowed change and is
// ignored here; everything else must still equal the docs mockup.
function stripReminderTypeIconMessage(source: string) {
  return source
    .replace("Droplet, MessageCircle, Stethoscope", "Droplet, Stethoscope")
    .replace(' | "manual" | "message"\n', ' | "manual"\n')
    .replace("  manual: Bell,\n  message: MessageCircle,\n", "  manual: Bell,\n")
    .replace('  manual: "Moj podsetnik",\n  message: "Poruke",\n', '  manual: "Moj podsetnik",\n');
}

// Step 31 (Design v1.7 S20, owner decisions OQ-11 / OQ-03 of 2026-10-29): ReadOnlyBanner takes an optional
// `action` { href, label } rendered as a link after the reason (the breeder banner's "Aktiviraj odgajivački plan").
// That prop is the only allowed change and is ignored here; everything else must still equal the docs mockup.
function stripReadOnlyBannerAction(source: string) {
  return source
    .replace('import Link from "next/link"\n', "")
    .replace(
      "export function ReadOnlyBanner({ reason, action }: { reason: string; action?: { href: string; label: string } }) {",
      "export function ReadOnlyBanner({ reason }: { reason: string }) {",
    )
    .replace(/\n {6}\{action && \([\s\S]*?\n {6}\)\}/, "");
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
