import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultErrorStateLabels } from "@/components/app/error-state";
import { defaultPetHeaderLabels } from "@/components/app/pet-header";
import { defaultReminderRowLabels } from "@/components/app/reminder-row";
import { defaultBlockDialogLabels, defaultReportDialogLabels } from "@/components/app/safety-dialogs";
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
  // Šapa pomoći composites (Steps 28b, 28c), added in Step F1.
  "listing-card", "listing-type-tag", "safety-dialogs",
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
  if (name === "premium-lock") s = stripPremiumLockHref(s);
  if (name === "listing-type-tag") s = stripListingTypeTagLabel(s);
  if (name === "listing-card") s = stripListingCardLabels(s);
  if (name === "safety-dialogs") s = stripSafetyDialogs(s);
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
    .replace("{labels.done}", defaultReminderRowLabels.done)
    // Step F1: the type icon's labels pass-through.
    .replace("import { ReminderTypeIcon, type ReminderType, type ReminderTypeIconLabels } from", "import { ReminderTypeIcon, type ReminderType } from")
    .replace(" labels={labels.types} />", " />");
}

// Owner decision (Step 28c, carried from Step 28a): reminder_type has the value `message` (the S12 Poruke row), so
// ReminderTypeIcon gets a `message` entry (MessageCircle, "Poruke"). That entry is the only allowed change and is
// ignored here; everything else must still equal the docs mockup. Step F1 (FR-35) adds an optional `labels` prop (the
// sr-only type label, Serbian defaults), also ignored here.
function stripReminderTypeIconMessage(source: string) {
  return source
    .replace(/\/\/ labels:start[\s\S]*?\/\/ labels:end\n\n/, "")
    .replace("  className,\n  labels = reminderTypeLabel,\n}: {", "  className,\n}: {")
    .replace("  className?: string\n  labels?: ReminderTypeIconLabels\n}) {", "  className?: string\n}) {")
    .replace("{labels[type]}", "{reminderTypeLabel[type]}")
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

// Step 28b (FR-35): ListingTypeTag takes an optional `label` (the dictionary's type label). That prop and its comment
// line are the only allowed changes and are ignored here (Step F1 follow-up of Steps 28b/28c).
function stripListingTypeTagLabel(source: string) {
  return source
    .replace(/\/\/ FR-35 \(Step 28b\): an optional `label`[^\n]*\n/, "")
    .replace(
      "export function ListingTypeTag({ type, className, label: labelOverride }: { type: ListingType; className?: string; label?: string }) {\n  const { label: defaultLabel, icon: Icon, surface } = config[type]\n  const label = labelOverride ?? defaultLabel\n",
      "export function ListingTypeTag({ type, className }: { type: ListingType; className?: string }) {\n  const { label, icon: Icon, surface } = config[type]\n",
    );
}

// Step 28b (FR-35): ListingCard takes an optional `labels` prop (every visible string, Serbian defaults) and an
// optional `coverUrl` (the signed cover photo in place of the placeholder). Those two props are the only allowed
// changes and are ignored here; everything else must still equal the docs mockup.
function stripListingCardLabels(source: string) {
  return source
    .replace("  listingSpeciesLabel,\n  listingTypeLabel,\n", "  listingSpeciesLabel,\n")
    .replace(/\/\/ labels:start[\s\S]*?\/\/ labels:end\n\n/, "")
    .replace(
      "export function listingPriceLine(\n  l: Pick<ListingSummary, \"type\" | \"priceRsd\" | \"negotiable\">,\n  labels: ListingCardLabels = defaultListingCardLabels,\n) {",
      'export function listingPriceLine(l: Pick<ListingSummary, "type" | "priceRsd" | "negotiable">) {',
    )
    .replace("labels.negotiable : labels.formatPrice(l.priceRsd)", '"Po dogovoru" : formatRsd(l.priceRsd)')
    .replace("return labels.free", 'return "Besplatno"')
    .replace(
      "export function ListingCard({\n  listing,\n  className,\n  labels = defaultListingCardLabels,\n  coverUrl,\n}: {\n  listing: ListingSummary\n  className?: string\n  labels?: ListingCardLabels\n  coverUrl?: string | null\n}) {\n  const price = listingPriceLine(listing, labels)",
      "export function ListingCard({ listing, className }: { listing: ListingSummary; className?: string }) {\n  const price = listingPriceLine(listing)",
    )
    .replace(
      /\{coverUrl \? \([\s\S]*?\) : \(\n\s*(<ImageIcon[^\n]*\/>)\n\s*\)\}/,
      "$1",
    )
    .replace(" label={labels.type[listing.type]}", "")
    .replace("{labels.photos(listing.photoCount)}", "{listing.photoCount} fotografije")
    .replace("{labels.category[listing.category]} · {labels.species[listing.species]}", "{listingCategoryLabel[listing.category]} · {listingSpeciesLabel[listing.species]}");
}

// Step 28c (FR-35, FR-70): ReportDialog and BlockDialog take an optional `labels` prop (Serbian defaults), and
// ReportDialog an optional `onSubmit` (EP-84) with its busy and "already submitted" states. Those additions are the
// only allowed changes and are ignored here; everything else must still equal the docs mockup.
function stripSafetyDialogs(source: string) {
  const r = defaultReportDialogLabels;
  const b = defaultBlockDialogLabels;
  return source
    .replace(/\/\/ labels:start[\s\S]*?const fill = [^\n]*\n\n/, "")
    .replace("  name,\n  onSubmit,\n  labels = defaultReportDialogLabels,\n}: {", "  name,\n}: {")
    .replace(/  \/\*\* EP-84;[^\n]*\n  onSubmit\?:[^\n]*\n  labels\?: ReportDialogLabels\n/, "")
    .replace(
      '  const [sent, setSent] = useState<false | "sent" | "already_submitted">(false)\n  const [busy, setBusy] = useState(false)\n',
      "  const [sent, setSent] = useState(false)\n",
    )
    .replace("  async function submit() {", "  function submit() {")
    .replace("setError(labels.errReason)", `setError("${r.errReason}")`)
    .replace("setError(labels.errNote)", `setError("${r.errNote}")`)
    .replace(/    if \(!onSubmit\) \{[\s\S]*?else setSent\(outcome\.status\)\n/, "    setSent(true)\n")
    .replace(/\{sent === "already_submitted" \? \([\s\S]*?\) : sent \? \(/, "{sent ? (")
    .replace("<DialogTitle>{labels.sentTitle}</DialogTitle>", `<DialogTitle>${r.sentTitle}</DialogTitle>`)
    .replace(
      "<DialogDescription>{labels.sentText}</DialogDescription>",
      `<DialogDescription>\n                ${r.sentText}\n              </DialogDescription>`,
    )
    .replace("{labels.sentHint}", r.sentHint)
    .replace(/\{labels\.ok\}/g, r.ok)
    .replace(
      "{target === \"listing\" ? labels.titleListing : labels.titleUser}",
      `{target === "listing" ? "${r.titleListing}" : "${r.titleUser}"}`,
    )
    .replace(
      "{fill(target === \"listing\" ? labels.targetListing : labels.targetUser, name)}",
      "{target === \"listing\" ? `Oglas: ${name}` : `Korisnik: ${name}`}",
    )
    .replace("{labels.reason}", r.reason)
    .replace("{labels.reasons[r]}", "{reportReasonLabel[r]}")
    .replace(
      '<Label htmlFor="report-note">\n                {labels.note}\n                {reason === "other" ? labels.noteRequired : labels.noteOptional}\n              </Label>',
      `<Label htmlFor="report-note">${r.note}{reason === "other" ? "${r.noteRequired}" : "${r.noteOptional}"}</Label>`,
    )
    .replace("placeholder={labels.notePlaceholder}", `placeholder="${r.notePlaceholder}"`)
    .replace("{labels.cancel}", r.cancel)
    .replace('<Button className="h-11 md:h-9" disabled={busy} onClick={() => void submit()}>', '<Button className="h-11 md:h-9" onClick={submit}>')
    .replace("{labels.submit}", r.submit)
    .replace("  onConfirm,\n  labels = defaultBlockDialogLabels,\n", "  onConfirm,\n")
    .replace("  onConfirm: () => void\n  labels?: BlockDialogLabels\n", "  onConfirm: () => void\n")
    .replace("<AlertDialogTitle>{fill(labels.title, name)}</AlertDialogTitle>", "<AlertDialogTitle>Blokirati korisnika {name}?</AlertDialogTitle>")
    .replace(
      "<AlertDialogDescription>{labels.text}</AlertDialogDescription>",
      "<AlertDialogDescription>\n            Ta osoba više neće moći da ti šalje poruke, a ti više nećeš videti njene oglase. Ne dobija obaveštenje o\n            blokadi. Blokadu skidaš na profilu te osobe.\n          </AlertDialogDescription>",
    )
    .replace(`<AlertDialogCancel>{labels.cancel}</AlertDialogCancel>`, `<AlertDialogCancel>${b.cancel}</AlertDialogCancel>`)
    .replace("{labels.confirm}", b.confirm);
}

// Step F1 (owner decision of Step 22: PremiumLock CTAs go to /premium): PremiumLock takes an optional `ctaHref` that
// renders the CTA as a link. That prop is the only allowed change and is ignored here.
function stripPremiumLockHref(source: string) {
  return source
    .replace('import Link from "next/link"\n', "")
    .replace('  cta = "Probaj 7 dana besplatno",\n  ctaHref,\n', '  cta = "Probaj 7 dana besplatno",\n')
    .replace(/ {2}\/\*\* Step F1[^\n]*\n {2}ctaHref\?: string\n/, "")
    .replace(/ {6}\{ctaHref \? \([\s\S]*?\) : \(\n {8}(<Button[^\n]*)\n {6}\)\}\n/, "      $1\n");
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
