# Design System — Moj Ljubimac (Web)

## Document Control

| Field | Value |
|---|---|
| Product | Moj Ljubimac ("My Pet") — web application |
| Document | 04 — Design System & Living Screens |
| Version | 1.4 |
| Date | 2026-10-19 |
| Author | Keti Vrtunić (interview facilitated by "Jelena", Design Systems lead persona) |
| Traces to | Brief v1.6 · PRD v1.5 · Technical Constraints v1.4 |
| Status | Draft — 29 screens written and verified in a preview build (see `04-design/README.md`) |

**Change log**

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-10-19 | Initial design system and 29 screen specs. |
| 1.1 | 2026-10-19 | Official logo integrated (OQ-09 closed); `--primary` / `--ring` aligned to the logo brown `#563218`. |
| 1.2 | 2026-10-19 | Pet accent becomes two-tone: soft blush pink / pistachio surfaces with deep rose / olive for text, rings and graphics. |
| 1.3 | 2026-10-19 | Change requests from the API Contract field audit: new S27 treatment form; channel connection (push, WhatsApp) in S12; organisation name/city/PIB in S15; city as a list everywhere; pet names always in the nominative; no photo captions; structured partner hours and separate messaging number; household name and declined invitations in S14. |
| 1.4 | 2026-10-19 | Codex direction adopted: large pastel pet headers and cards, species icons in avatars, reminder-type icon tiles, pastel status pills, "Danas" as a card row, sidebar with full logo, counts and user footer, pet search; new S28 new password, S29 organisation public profile, S11 edit variant. |

---

## 1. Executive Summary

This design system dresses all seven Moj Ljubimac epics in one visual language and defines 29 living screens. Foundations: a warm cream page with white cards, the existing brand brown `#563218` as primary, a per-pet accent (rose for female, teal for male, neutral for organisations), Nunito headings with Inter body text, a 4 px spacing base, 8/12 px radii and two shadow levels, light mode only. On phones the app uses a bottom navigation bar; on computers a left sidebar. One shared pattern each for loading, empty, error, Premium-locked, and read-only states. Traces to Brief v1.6, PRD v1.5, Technical Constraints v1.4.

---

## 2. Inherited Context

- **Personas:** P1 Pet Owner (primary), P2 Household Member, P3 Shelter, P4 Breeder, P5 Partner (via directory), plus the Operator (admin) and the Visitor (public pages).
- **North-star:** active reminded pets → reminders get first-class placement (dashboard "Today" strip, dedicated tab in navigation).
- **Stack (TC v1.1):** Next.js App Router, TypeScript, shadcn/ui, Tailwind CSS v4, lucide-react (ADR-01, ADR-14). Interactive screens use `"use client"`.
- **Locale:** Serbian (Latin) default, English available (NFR-05). Screens are written in Serbian.
- **UI-shaping NFRs:** usable from 360 px (NFR-03); WCAG 2.1 AA, keyboard and screen reader (NFR-04); attachments ≤ 10 MB images/PDF (NFR-09).
- **Gated states implied by the PRD:** Premium-locked (BR-01, BR-10), read-only household (BR-28, FR-31), read-only organisation copy after transfer (BR-38), Viber hidden while switched off (BR-14b), shelter pending approval (BR-32).
- **Carried-forward open questions:** OQ-01, OQ-03, OQ-04 (targets and prices) — non-blocking for design; prices on screens are marked as placeholders.

---

## 3. Visual Direction & References

Warm, calm, trustworthy — a well-kept paper health booklet translated to the screen, not a clinical dashboard. The cream ground and brown primary carry over the existing Moj Ljubimac brand (logo: dog and cat silhouette; brand brown from the mobile app). The per-pet accent from the mobile app is kept but disciplined: it colours only the active pet's identity — soft blush pink or pistachio for surfaces (avatar fill, header band), the deep rose or olive for the avatar ring, the pet's name and the active tab underline, never global actions, which always use `--primary`.

What is taken: the brand colour, logo, and per-pet-sex accent from the earlier mobile app. What is left: the mobile app's full-screen tinted themes — the accent never floods a whole page.

The official logo (dog and cat silhouette with the script wordmark "Moj Ljubimac") is in `04-design/assets/`: `logo-mark.png` (silhouette), `logo-wordmark.png`, `logo-full.png` (stacked), all transparent and recoloured to the exact brand brown `#563218` sampled from the original; `app-icon-{180,192,512}.png` (silhouette on cream) for the home-screen icon and favicon; `logo-original.png` as supplied. A vector (SVG) version is still wanted for print and very large sizes.

---

## 4. Design Tokens

Light mode only for v1. All colours are semantic tokens; no screen uses a raw hex value.

### 4.1 Colour

| Token | Value | Use |
|---|---|---|
| `--background` | `#F6F1EB` | page ground |
| `--foreground` | `#2A1D14` | primary text |
| `--card` / `--card-foreground` | `#FFFFFF` / `#2A1D14` | cards, dialogs, popovers |
| `--muted` / `--muted-foreground` | `#EFE7DF` / `#6B5B4E` | subdued fills / secondary text |
| `--primary` / `--primary-foreground` | `#563218` / `#FFFFFF` | primary actions, links, focus ring |
| `--secondary` / `--secondary-foreground` | `#EFE7DF` / `#2A1D14` | secondary buttons |
| `--accent` / `--accent-foreground` | `#EFE7DF` / `#2A1D14` | hover fills on menu items |
| `--border` / `--input` | `#D9CCBF` | hairlines, input borders |
| `--ring` | `#563218` | focus ring |
| `--pet-female` / `--pet-female-soft` | `#9E2F59` deep rose / `#F9DCE5` soft blush pink | female pets: deep for text, rings, tab underline, chart bars; soft for surfaces (avatar fill, header band) |
| `--pet-male` / `--pet-male-soft` | `#4A6624` deep olive / `#D6E6B8` pistachio | male pets, same split |
| `--pet-neutral` / `--pet-neutral-soft` | `#57534E` / `#EFE7DF` | unknown sex and all organisation views |
| `--success` / `--success-foreground` | `#15803D` / `#FFFFFF` | done, delivered |
| `--warning` / `--warning-foreground` | `#B45309` / `#FFFFFF` | due soon, Premium expiring |
| `--destructive` / `--destructive-foreground` | `#B91C1C` / `#FFFFFF` | delete, missed |
| `--success-soft` / `--warning-soft` / `--destructive-soft` | `#D9EBC8` / `#F8E3A3` / `#F6D0D0` | pastel status pills, always with `--foreground` text |

`--pet-accent` and `--pet-accent-soft` resolve from the nearest `data-pet-sex` attribute: `female` → rose pair, `male` → pistachio pair, otherwise neutral. **Rule:** soft tones are surfaces only and never carry text other than the deep tone or `--foreground`; anything that must be seen against the card (text, rings, bars, underline) uses the deep tone.

**Computed contrast (WCAG formula):**

| Pair | Ratio | Result |
|---|---|---|
| foreground on card / on background | 16.35 / 14.56 | AA ✅ |
| muted-foreground on card / background / muted | 6.50 / 5.79 / 5.31 | AA ✅ |
| primary-foreground on primary | 11.26 | AA ✅ |
| primary as text on card / background | 11.26 / 10.03 | AA ✅ |
| deep rose / olive / neutral on card | 6.99 / 6.53 / 7.63 | AA ✅ |
| deep rose on blush / olive on pistachio | 5.46 / 4.93 | AA ✅ |
| white on deep rose / olive | 6.99 / 6.53 | AA ✅ |
| foreground on blush / pistachio | 12.77 / 12.36 | AA ✅ |
| blush / pistachio surface vs card | 1.28 / 1.32 | decorative only — identity is carried by the deep tone and text |
| white on destructive / success / warning | 6.47 / 5.02 / 5.02 | AA ✅ |
| success or warning **as text on background** | 4.47 | ❌ below 4.5 — not allowed |
| success or warning as text on a 10 % tint of itself | ≈ 4.38 | ❌ not allowed |
| foreground on success-soft / warning-soft / destructive-soft | 12.98 / 12.85 / 11.56 | AA ✅ |

**Rules derived from these numbers:**
- Success and warning colours appear as **text only on `--card`**. Status badges are **pastel pills with `--foreground` text** (`bg-success-soft text-foreground`), never a pastel fill with coloured text.
- Deep pet accents as text are allowed on card, background, and their own soft tone (≥ 4.93).

**Surface separation (computed):** background ↔ card = 1.12:1; card ↔ muted = 1.22:1. These steps are deliberately gentle, so **borders carry the separation**: every card has a 1 px `--border` (1.57:1 against card, 1.49:1 against background). Elements sitting on a card (list rows, nested panels, chips) use an alpha overlay `bg-foreground/5` (1.10:1 against card, text on it ≥ 5.9:1), never a surface token.

```css
/* app/globals.css — Tailwind CSS v4 */
@import "tailwindcss";

:root {
  --background: #F6F1EB;
  --foreground: #2A1D14;
  --card: #FFFFFF;
  --card-foreground: #2A1D14;
  --popover: #FFFFFF;
  --popover-foreground: #2A1D14;
  --muted: #EFE7DF;
  --muted-foreground: #6B5B4E;
  --primary: #563218;
  --primary-foreground: #FFFFFF;
  --secondary: #EFE7DF;
  --secondary-foreground: #2A1D14;
  --accent: #EFE7DF;
  --accent-foreground: #2A1D14;
  --border: #D9CCBF;
  --input: #D9CCBF;
  --ring: #563218;
  --pet-female: #9E2F59;
  --pet-female-soft: #F9DCE5;
  --pet-male: #4A6624;
  --pet-male-soft: #D6E6B8;
  --pet-neutral: #57534E;
  --pet-neutral-soft: #EFE7DF;
  --pet-accent: var(--pet-neutral);
  --pet-accent-soft: var(--pet-neutral-soft);
  --success: #15803D;
  --success-foreground: #FFFFFF;
  --warning: #B45309;
  --warning-foreground: #FFFFFF;
  --destructive: #B91C1C;
  --destructive-foreground: #FFFFFF;
  --success-soft: #D9EBC8;
  --warning-soft: #F8E3A3;
  --destructive-soft: #F6D0D0;
  --radius: 0.75rem;
}

[data-pet-sex="female"] { --pet-accent: var(--pet-female); --pet-accent-soft: var(--pet-female-soft); }
[data-pet-sex="male"]   { --pet-accent: var(--pet-male); --pet-accent-soft: var(--pet-male-soft); }

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-pet-accent: var(--pet-accent);
  --color-pet-accent-soft: var(--pet-accent-soft);
  --color-success: var(--success);
  --color-success-foreground: var(--success-foreground);
  --color-warning: var(--warning);
  --color-warning-foreground: var(--warning-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-success-soft: var(--success-soft);
  --color-warning-soft: var(--warning-soft);
  --color-destructive-soft: var(--destructive-soft);

  --font-heading: var(--font-nunito), ui-sans-serif, system-ui, sans-serif;
  --font-sans: var(--font-inter), ui-sans-serif, system-ui, sans-serif;

  --radius-sm: 0.5rem;   /* 8 px — inputs, buttons, chips */
  --radius-md: 0.75rem;  /* 12 px — cards, dialogs */
  --radius-lg: 0.75rem;

  --shadow-soft: 0 1px 2px rgb(42 29 20 / 0.06), 0 2px 8px rgb(42 29 20 / 0.06);
  --shadow-raised: 0 8px 24px rgb(42 29 20 / 0.14);
}

body { background: var(--background); color: var(--foreground); }
```

Tailwind v4 applies opacity modifiers to any colour through `color-mix`, so hex tokens accept `/5`, `/10` etc. Only the framework scale (multiples of 5) is used.

### 4.2 Typography

Fonts loaded with `next/font/google` (subsets `latin`, `latin-ext` — required for č, ć, š, đ, ž): **Nunito** (700) for headings, **Inter** (400, 500, 600) for everything else.

| Step | Class | Size / line-height | Font / weight |
|---|---|---|---|
| Page title | `font-heading text-[28px] leading-9 font-bold` | 28 / 36 | Nunito 700 |
| Section | `font-heading text-[22px] leading-7 font-bold` | 22 / 28 | Nunito 700 |
| Card title | `font-heading text-lg font-bold` | 18 / 28 | Nunito 700 |
| Body | `text-base` | 16 / 24 | Inter 400 |
| Small | `text-sm` | 14 / 20 | Inter 400/500 |
| Label | `text-xs font-medium` | 12 / 16 | Inter 500 |

### 4.3 Spacing, sizing, radius, elevation

- **Spacing scale (4 px base):** 4, 8, 12, 16, 24, 32, 48 → Tailwind `1, 2, 3, 4, 6, 8, 12`. No other steps.
- **Card padding:** `p-4` on phones, `md:p-6` from 768 px. Gap between cards `gap-4`; between page sections `space-y-6`.
- **Radius:** `rounded-sm` (8 px) inputs, buttons, chips; `rounded-md` (12 px) cards, dialogs; `rounded-full` avatars, badges.
- **Elevation:** `shadow-soft` (cards on hover, sticky bars), `shadow-raised` (dialogs, sheets, dropdowns). Cards at rest have no shadow — border only.
- **Borders:** 1 px `border-border` on every card and input.
- **Content max width:** `max-w-5xl` (1024 px) for app pages; `max-w-3xl` (768 px) for forms and public pages.
- **Touch targets:** interactive elements ≥ 44 × 44 px (`h-11` for primary buttons on phones).

### 4.4 Breakpoints and layers

- Breakpoints: Tailwind defaults; the system uses `md` (768 px) and `lg` (1024 px) only.
- Z-index: content 0; sticky headers `z-10`; bottom nav and sidebar `z-20`; sheets/dialogs/toasts are managed by shadcn (Radix portals).

---

## 5. Layout System

### 5.1 App shell (Owner, Household Member)
- **Phones (< md):** top bar (logo mark, pet switcher, profile avatar) + scrolling content + **bottom navigation** fixed, 4 items: *Ljubimci*, *Podsetnici*, *Partneri*, *Profil*. Content gets `pb-24` so the bar never covers it.
- **Computers (≥ md):** **left sidebar** 240 px (`w-60`) with logo, the same 4 items plus *Domaćinstvo* and *Podešavanja*; content area centred, `max-w-5xl`, `px-6 py-8`.
- **Pet context:** inside a pet's pages the content is wrapped in `data-pet-sex` so the pet header band and tab underline use `--pet-accent`.

### 5.2 Organisation shell (Shelter, Breeder)
Same structure, different items: *Životinje*, *Zahtevi* (shelter) / *Upiti* (breeder), *Legla* (breeder only), *Tim*, *Profil*. All accents neutral.

### 5.3 Public shell (Visitor)
No navigation. Slim top bar with the logo mark and a "Napravi nalog" button; content `max-w-3xl`, centred; footer with privacy and terms links.

### 5.4 Auth shell
Centred card `max-w-md` on the cream ground, logo above. Used for sign-in, registration, invitation acceptance.

### 5.5 Admin shell (Operator)
Computer-first: left sidebar *Azili na čekanju*, *Partneri*, *Statistika*, *Podešavanja kanala*. On phones it collapses to a top tab row.

### 5.6 Grid patterns
- **Card grid:** 1 column < md, 2 columns md, 3 columns lg (`grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3` — the explicit `grid-cols-1` is required: an implicit grid track sizes to min-content and overflows phones).
- **Detail + aside:** single column < lg; from lg `grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]`.
- **Every flex/grid child that carries text has `min-w-0`.** Horizontal scroll strips use `overflow-x-auto overflow-y-hidden`.

---

## 6. Component Inventory

Rule: **primitives are composed from shadcn/ui, never hand-rolled.**

| Component | Variants used | When | Install |
|---|---|---|---|
| Button | default (primary), secondary, outline, ghost, destructive, link; sizes default, sm, icon | every action | `npx shadcn@latest add button` |
| Card | — | every content block | `add card` |
| Badge | default, secondary, outline + custom `success`/`warning` via className | statuses, Premium | `add badge` |
| Avatar | — | pets, people, partners | `add avatar` |
| Tabs | — | pet record sections, reminder lists | `add tabs` |
| Input, Textarea, Label | — | forms | `add input textarea label` |
| Select | — | species, types, units | `add select` |
| Checkbox, Switch, RadioGroup | — | channel choice, toggles, account type | `add checkbox switch radio-group` |
| Dialog, AlertDialog | — | forms in place, delete confirmation | `add dialog alert-dialog` |
| Sheet | — | mobile pet switcher, filters | `add sheet` |
| DropdownMenu | — | row actions | `add dropdown-menu` |
| Separator | — | section dividers | `add separator` |
| Skeleton | — | loading | `add skeleton` |
| Progress | — | trial/Premium days, upload | `add progress` |
| Table | — | admin, organisation lists on computers | `add table` |
| Sonner (toast) | — | confirmations | `add sonner` |
| Calendar + Popover | — | date fields | `add calendar popover` |

**Project overrides of shadcn primitives** (the components are owned by the project — ADR-14):
- `components/ui/card.tsx`: default classes use `rounded-md` and **no shadow** (was `rounded-xl shadow-sm`), matching §4.3.
- `components/ui/sonner.tsx`: theme fixed to `light` (no `next-themes`), and `toast` re-exported so screens import it from `@/components/ui/sonner`.

**Custom composites** (in `04-design/components/`, built only from the primitives above):

| Composite | Built from | Purpose |
|---|---|---|
| `AppShell` | Button, Avatar, Sheet | owner/org/admin shells: sidebar with full logo, "MENI" label, count badges (`counts`), user footer (`user`); bottom nav on phones |
| `PetAvatar` | Avatar | photo, species icon, or initial; `onSoft` puts a white circle on pastel blocks |
| `PetHeader` | Card, PetAvatar, Badge | large pastel (`bg-pet-accent-soft`) top block with avatar, name in deep accent, chips; actions below |
| `PremiumLock` | Card, Button, Badge | the single Premium-locked pattern |
| `EmptyState` | Card, Button | icon + heading + one line + action |
| `ErrorState` | Card, Button | message + "Pokušaj ponovo" |
| `ReadOnlyBanner` | Card | read-only household / organisation copy |
| `ReminderRow` | Badge, Button | one reminder occurrence with status and "Urađeno" |
| `LogoMark` | `next/image` | official logo; variants `mark` (phone top bar), `horizontal` (sidebar, public header), `full` (auth screens) |
| `StatusBadge` | Badge | pastel status pills (Urađeno, Uskoro, Propušteno), Danas, Premium |
| `ReminderTypeIcon` | lucide icons | rounded tile per reminder type: Droplet (dose), Syringe (vaccination), Stethoscope (vet follow-up), UtensilsCrossed (meal), Cake (birthday), Bell (manual) |
| `StateSwitcher` | Tabs | dev-only state preview in mock screens |
| `PublicShell`, `AuthShell` | Button, LogoMark | public and auth frames (in `shells.tsx`) |

**Proposed additions (raised while writing screens — not yet approved, see OQ-10):** `DateField` (Serbian-locale date picker, now repeated in several screens), compact inline `PremiumLock` for a single switch/checkbox, `AttachmentChip`, organisation/request statuses in `StatusBadge` (screens currently use plain `Badge`), `LogoAvatar` for organisations/partners, `InlineAlert` for form-level errors, `Toaster` mounted in the shells (screens currently confirm inline with `role="status"`), and an optional `label` on `StateSwitcher`.

**Known prohibition:** lucide-react no longer ships brand icons (Instagram, WhatsApp, Viber, Facebook). Use `MessageCircle` (messaging), `Phone`, `Mail`, `Globe`, `AtSign` (Instagram handle). Importing a brand icon is a build failure.

---

## 7. Iconography & Imagery

- **Icons:** lucide-react, stroke 2. Sizes: 16 px inline with text (`size-4`), 20 px in buttons (`size-5`), 24 px in navigation (`size-6`). Decorative icons have `aria-hidden`.
- **Pet avatars:** photo cropped round; otherwise a species icon (Cat, Dog, Rabbit, Bird, Fish, Turtle) in the deep accent, on a white circle inside pastel blocks or on the soft accent elsewhere; other species fall back to the first initial. Icon sizes in avatars: 16 / 24 / 40 px (`size-10` is an avatar-only step).
- **People avatars:** initials on `--muted`, `--foreground` text.
- **Attachments:** chip with `FileText` (PDF) or `Image` icon, file name truncated, size in MB.
- **Empty states:** icon in a 48 px `bg-foreground/5` circle, no illustrations.
- **Moment photos:** `aspect-square object-cover rounded-sm` in grids; no captions; alt text = "<pet name>, <date>".
- **City fields** are always a `Select` from the city list, never free text.

---

## 8. Interaction & State Patterns

- **Hover/focus/active:** buttons darken via shadcn defaults; cards that navigate get `hover:shadow-soft`. Focus is always visible: `focus-visible:ring-2 ring-ring ring-offset-2`.
- **Loading:** `Skeleton` blocks in the shape of the content (avatar circle + two lines for list rows; card outlines for grids). No spinners except inside a pressed button.
- **Empty:** `EmptyState` — icon, heading, one sentence, one primary action. Example: *"Još nema vakcina" / "Dodaj prvu vakcinu i podsetićemo te na sledeću." / [Dodaj vakcinu]*.
- **Error:** `ErrorState` card — *"Nešto nije u redu. Pokušaj ponovo."* + button.
- **Premium-locked:** `PremiumLock` — the locked content is shown blurred (`blur-sm select-none pointer-events-none`) behind a card with a `Lock` icon, *"Dostupno u Premiumu"*, one sentence on what unlocks, and *[Probaj 7 dana besplatno]*. The same component for every Free limit (2nd pet, 11th attachment, 6th moment, PDF, sharing, WhatsApp, logo removal).
- **Read-only:** `ReadOnlyBanner` at the top of the page (`Eye` icon + reason) and every edit control hidden — not disabled.
- **Confirmations:** Sonner toast at bottom centre, 4 s (*"Vakcina sačuvana"*). Destructive actions use `AlertDialog` with *"Da, obriši"* in destructive variant.
- **Validation:** inline under the field in `text-destructive text-sm`, on blur and on submit.
- **Status badges (solid fills):** *Urađeno* `bg-success-soft` · *Uskoro* `bg-warning-soft` · *Propušteno* `bg-destructive-soft` (all with `text-foreground`) · *Danas* `bg-primary` · *Premium* primary outline.

---

## 9. Content & Voice (UI copy)

- **Locale:** Serbian Latin by default; every string also exists in English (NFR-05). Screens are written in Serbian.
- **Tone:** informal "ti", warm, short. Name the pet, always in the **nominative** — names are never declined, because user-entered names cannot be inflected reliably: *"Luna — vakcina ističe za 7 dana"*, *"Lek za: Luna"*, not *"Luni ističe vakcina"*.
- **Terminology:** use Brief/PRD glossary terms exactly — *Uspomena* (Memorial), *Trenutak* (Moment), *Domaćinstvo* (Household), *Partner*, *Podsetnik* (Reminder), *Premium*, *Azil*, *Odgajivačnica*, *Leglo*, *Udomljavanje*.
- **Formats:** dates `19. 10. 2026.`; time `08:00`; money `2.990 RSD`; weight `4,2 kg`, `850 g`.
- **Mock data:** realistic Serbian names and places — pets *Luna* (female cat), *Maks* (male dog), *Kiki* (female rabbit); people *Ivana Petrović*, *Marko Jovanović*; places *Novi Sad*, *Beograd*, *Bečej*; partners *Veterinarska ambulanta „Dr Vet"*, *Pet shop „Šapica"*, *Grooming salon „Čupko"*, *Pet hotel „Kod Mace"*. Never "Lorem ipsum", never "John Doe". Prices for Premium/breeder plans are placeholders until OQ-03 closes and are marked `/* placeholder price — OQ-03 */` in code.

---

## 10. Accessibility Baseline

- Text contrast ≥ 4.5:1 for every pair in §4.1 (computed); state colours as text only where computed ≥ 4.5.
- Visible focus ring on every interactive element (`--ring`, 2 px, 2 px offset).
- Full keyboard operation of core flows: add pet, add vaccination, mark reminder done, invite member, subscribe.
- Landmarks: `header`, `nav` (labelled), `main`, `footer`; one `h1` per page.
- Every input has a `Label`; icon-only buttons have `aria-label`; images have `alt` (pet photo alt = pet name).
- Status is never colour-only: badges always carry text.
- Touch targets ≥ 44 px on phones.

---
## 11. Screen Inventory & Traceability

Shells: **A** = App shell (owner), **O** = Organisation shell, **P** = Public shell, **U** = Auth shell, **D** = Admin shell. Files under `04-design/screens/`.

| # | Epic | Screen | Route | FRs | Shell | File |
|---|---|---|---|---|---|---|
| S01 | EPIC-01 | Moji ljubimci (home) | `/ljubimci` | FR-01, FR-20, FR-36 | A | `pets-home.tsx` |
| S02 | EPIC-01 | Dodaj / izmeni ljubimca | `/ljubimci/novi` | FR-01, FR-02, FR-03 | A | `pet-form.tsx` |
| S03 | EPIC-01 | Karton ljubimca | `/ljubimci/[id]` | FR-04, FR-05, FR-06, FR-07, FR-09, FR-10, FR-11, FR-13 | A | `pet-record.tsx` |
| S04 | EPIC-01 | Nova vakcina | `/ljubimci/[id]/vakcine/nova` | FR-05 | A | `vaccination-form.tsx` |
| S05 | EPIC-01 | Novi pregled sa prilozima | `/ljubimci/[id]/pregledi/novi` | FR-07, FR-08 | A | `vet-visit-form.tsx` |
| S27 | EPIC-01 | Nova terapija | `/ljubimci/[id]/terapije/nova` | FR-06 | A | `treatment-form.tsx` |
| S28 | EPIC-05 | Nova lozinka | `/prijava/nova-lozinka` | FR-34 | U | `new-password.tsx` |
| S29 | EPIC-06 | Javni profil organizacije | `/organizacija/profil` | FR-60 | O | `org-profile.tsx` |
| S06 | EPIC-01 | Uspomene | `/uspomene` | FR-11, FR-12 | A | `memorials.tsx` |
| S07 | EPIC-02 | Dnevnik ishrane i stolice | `/ljubimci/[id]/dnevnik` | FR-14, FR-15, FR-16 | A | `care-log.tsx` |
| S08 | EPIC-02 | Trenuci | `/ljubimci/[id]/trenuci` | FR-17, FR-18, FR-19 | A | `moments.tsx` |
| S09 | EPIC-02 | Javni trenutak | `/t/[slug]` | FR-19 | P | `public-moment.tsx` |
| S10 | EPIC-03 | Podsetnici | `/podsetnici` | FR-20, FR-24 | A | `reminders.tsx` |
| S11 | EPIC-03 | Novi podsetnik | `/podsetnici/novi` | FR-21 | A | `reminder-form.tsx` |
| S12 | EPIC-03 | Podešavanja podsetnika | `/podesavanja/podsetnici` | FR-22, FR-23, FR-25 | A | `reminder-settings.tsx` |
| S13 | EPIC-04 | Domaćinstvo | `/domacinstvo` | FR-26, FR-27, FR-28, FR-29, FR-30, FR-32 | A | `household.tsx` |
| S14 | EPIC-04 / EPIC-06 | Prihvati poziv / karton | `/poziv/[token]` | FR-26, FR-50, FR-51 | U | `invite-accept.tsx` |
| S15 | EPIC-05 | Registracija | `/registracija` | FR-33, FR-35 | U | `register.tsx` |
| S16 | EPIC-05 | Prijava | `/prijava` | FR-34 | U | `sign-in.tsx` |
| S17 | EPIC-05 | Premium | `/premium` | FR-36, FR-37 | A | `premium.tsx` |
| S18 | EPIC-05 | Profil i pretplata | `/profil` | FR-25, FR-35, FR-38, FR-39 | A | `profile.tsx` |
| S19 | EPIC-05 | Moji podaci i brisanje naloga | `/profil/podaci` | FR-40, FR-41 | A | `account-data.tsx` |
| S20 | EPIC-06 | Životinje i tim organizacije | `/organizacija` | FR-42, FR-43, FR-44, FR-45 | O | `org-animals.tsx` |
| S21 | EPIC-06 | Zahtevi i upiti | `/organizacija/zahtevi` | FR-47, FR-49, FR-50 | O | `org-requests.tsx` |
| S22 | EPIC-06 | Legla | `/organizacija/legla` | FR-48 | O | `litters.tsx` |
| S23 | EPIC-06 | Javna stranica azila / odgajivačnice | `/o/[slug]` | FR-46, FR-47, FR-49 | P | `public-org.tsx` |
| S24 | EPIC-07 | Partneri u blizini | `/partneri` | FR-52, FR-53, FR-55, FR-56 | A | `partners.tsx` |
| S25 | EPIC-07 | Profil partnera | `/partneri/[id]` | FR-54, FR-55 | A | `partner-profile.tsx` |
| S26 | EPIC-07 | Admin | `/admin` | FR-42, FR-57, FR-58 (+ BR-14b switch) | D | `admin.tsx` |

**Coverage (29 screens):** EPIC-01 ✅ (7) · EPIC-02 ✅ (3) · EPIC-03 ✅ (3) · EPIC-04 ✅ (2) · EPIC-05 ✅ (6) · EPIC-06 ✅ (5) · EPIC-07 ✅ (3). Every screen traces to PRD FRs; no screen outside PRD scope.

---

## 12. Screen Specs

Every screen: inline Serbian mock data, local React state only, `"use client"`, states listed below. "States" abbreviations: **D** default · **L** loading · **E** empty · **X** error · **G** Premium-locked · **R** read-only. Each screen file has a small state switcher (dev-only `Tabs` above the content, labelled "Prikaz stanja") so reviewers can see every state.

**S01 Moji ljubimci** — Search field ("Pretraži ljubimce…", FR-59) next to "Dodaj ljubimca". "Danas" card: on md+ a row of up to 3 reminder cards (type icon, title, pet · time, status pill, "Urađeno"), stacked on phones. Pet cards: pastel top block (species avatar, name, breed, sex chip), stats (Starost, Težina), "Sledeći podsetnik", footer "Karton ažuriran pre …" + "Otvori karton →". "Dodaj ljubimca" button; on Free with 1 active pet it opens `PremiumLock` (FR-36). Link to Uspomene. States D L E (*"Dodaj svog prvog ljubimca"*) G. Phones: 1 column; md 2; lg 3.

**S02 Dodaj / izmeni ljubimca** — Form `max-w-3xl` in sections: Osnovno (ime*, vrsta* Select incl. "Ostalo" + text field, rasa, pol* RadioGroup, datum rođenja or okvirna godina), Izgled (boja/oznake, fotografija), Identifikacija (mikročip, pasoš, sterilisan da/ne/ne znam), Moj veterinar (ime, telefon), Jedinica težine (kg/g), napomena. Sex choice live-previews the pet accent. Validation inline. States D X.

**S03 Karton ljubimca** — `PetHeader` (accent band, avatar, name, age, microchip) + actions: "Izvezi PDF" (G on Free), DropdownMenu (Premesti u Uspomene, Obriši trajno → AlertDialog "Da, obriši"). Tabs: Pregled (next 3 reminders, last weight, last visit), Vakcine (list with next-dose badge), Terapije (with "Doza data" button and dose log), Pregledi (list, attachment chips), Težina (list + simple bar trend from div bars using tokens). Detail+aside on lg. States D L E (per tab) G (PDF) R (member view hides medical edit buttons).

**S04 Nova vakcina** — Fields per FR-05; "Datum sledeće doze" shows helper *"Napravićemo podsetnik."* States D X.

**S27 Nova terapija** — Fields per FR-06 (type*, name*, dose, frequency every X hours/days, start*, end date or duration in days, note); helper *"Napravićemo podsetnike za svaku dozu."* and a dose-schedule summary. States D X.

**S05 Novi pregled** — Fields per FR-07; attachment zone (images/PDF ≤ 10 MB; counter "7 / 10 priloga" on Free; 11th → PremiumLock); invalid type/size inline error. States D X G.

**S28 Nova lozinka** — Auth shell; new password + repeat (min 8 characters); states default, mismatch, link expired (`invalid_action_token`), success → "Prijavi se".

**S29 Javni profil organizacije** — Organisation shell; Admin edits description, phone, email, website, logo (FR-60); Volunteer read-only; shelter/breeder variants.

**S06 Uspomene** — Muted cards (no accent) with date and reason; "Vrati među aktivne" (G when slot taken on Free); Free counter "2 / 2 uspomene". States D E G.

**S07 Dnevnik** — Tabs Ishrana / Stolica; quick-add forms in Dialog; day-grouped lists; "Podsetnici za obroke" card (times + weekday chips). States D L E.

**S08 Trenuci** — Photo grid of moments; new-moment Dialog (date, up to 5 photos, text); per moment: "Podeli kao sliku" (preview card with name/date/logo; "Ukloni logo" Switch G on Free), "Javni link" (Switch on/off + copy). Free counter "3 / 5 trenutaka". States D E G.

**S09 Javni trenutak** — Public shell; photos, text, pet name, date; no health data; CTA "Napravi nalog za svog ljubimca". States D, link-disabled (*"Ovaj trenutak više nije javan"*).

**S10 Podsetnici** — Tabs Danas / Uskoro / Propušteno / Urađeno; `ReminderRow` (pet avatar or "Za mene", title, time, channel icons, status badge, "Urađeno"). "Novi podsetnik" button. States D L E.

**S11 Novi / izmeni podsetnik** — Title*, za koga (ljubimac Select or "Samo za mene"), datum i vreme*, ponavljanje (Select). Edit variant prefilled with "Obriši podsetnik" (AlertDialog). States D X, edit.

**S12 Podešavanja podsetnika** — One Card per type (Vakcine, Terapije/doze, Kontrole, Obroci, Rođendani, Moji podsetnici): lead-time chips (multi), delivery time, channel Checkboxes (Email, Push, WhatsApp with Premium badge/G on Free; Viber absent while switched off); doses and meals show *"Stižu tačno u zadato vreme"*. WhatsApp counter "12 / 30 poruka ovog meseca". iPhone push hint card ("Dodaj na početni ekran"). A "Kanali" card on top: Push (isključeno / uključeno / blokirano u pregledaču) and WhatsApp number connection (number → "Pošalji kod" → code → "Povezano" → "Prekini vezu"; G on Free). States D G, plus push-on/WhatsApp-connected and push-blocked variants.

**S13 Domaćinstvo** — Members list (role, joined date, remove), invite Dialog (email or copy link), shared-pets Switch list, counter "3 / 6 članova", own reminder opt-in Switch for members. States D G (Free owner) R (owner's Premium lapsed: banner + hidden controls) E.

**S14 Prihvati poziv / karton** — Auth shell; variants: household invitation (household by name, e.g. "Domaćinstvo Petrović", inviter), declined ("Odbijeno") and record transfer (animal card, organisation name); "Prihvati" / sign-in prompt; expired variant; Free-slot-taken variant → PremiumLock (FR-51).

**S15 Registracija** — Account type RadioGroup (Vlasnik / Azil / Odgajivačnica) with one-line descriptions; email, lozinka, or "Nastavi sa Google-om"; language switch SR/EN; for Azil/Odgajivačnica also *Naziv organizacije\** and *Grad\** (Select from the city list) and optional *PIB*; shelter note *"Azil odobravamo ručno, obično u roku od 2 dana."* After submit: "Proveri mejl" state.

**S16 Prijava** — Email/lozinka, Google, "Zaboravljena lozinka". States D X.

**S17 Premium** — Free vs Premium comparison (rows from BR-01/BR-02), Mesečno / Godišnje toggle (placeholder prices — OQ-03), "Probaj 7 dana besplatno" (or "Pretplati se" when trial used), card-payment note (Monri). States D.

**S18 Profil i pretplata** — Name, city, language; Premium card with days remaining (`Progress`), renewal date, auto-renew status, "Otkaži obnovu" AlertDialog; expired variant with downgrade note (FR-39). Links to reminder settings and S19.

**S19 Moji podaci** — "Preuzmi sve moje podatke" (preparing → ready states), "Obriši nalog" AlertDialog explaining 30 days; pending-deletion variant with "Otkaži brisanje".

**S20 Životinje i tim** — Org shell. Tabs Životinje / Tim. Animals: filter chips by status (shelter: Prijem, Na brizi, Za udomljavanje, Rezervisan, Udomljen; breeder: Dostupno, Rezervisano, Prodato); Table on lg, cards below; new intake Dialog (shelter). Tim: members with Admin/Volonter badge, "1 / 20". Pending-approval variant for shelters (banner, everything read-only).

**S21 Zahtevi i upiti** — List of requests (name, phone, email, message, animal) with Prihvati / Odbij (Admin only; Volunteer sees read-only); accepted → "Pošalji karton" (transfer Dialog with email, 30-day validity, re-send). States D E R (volunteer).

**S22 Legla** — Litter cards (majka, otac, datum okota, broj mladunaca) expanding to offspring rows with status and price; new litter Dialog. States D E.

**S23 Javna stranica** — Public shell; organisation header; grid of available animals with public fields (photo, name, species, sex, approx. age, description, sterilisan/vakcinisan badges; price for breeders); request Dialog (requires sign-in → prompt). States D E.

**S24 Partneri u blizini** — Type filter chips (Sve, Veterinari, Pet shopovi, Grooming, Pet hoteli); location row ("Koristi moju lokaciju" or city from profile); "Istaknuto" section first, then by distance; partner card with type badge, distance, quick-action buttons (Pozovi, Poruka, Mejl, Sajt — hidden when missing). Vet-suggestion banner when the active pet has no "moj veterinar". States D L E.

**S25 Profil partnera** — Header (logo, name, type, address, distance, working hours), description, the four quick actions as large buttons, website/Instagram handle.

**S26 Admin** — Admin shell; Tabs: Azili na čekanju (approve/reject), Partneri (Table: name, type, city, Istaknut Switch with "3 / 3" limit hint, plaćeno do, status; add/edit Dialog with "Pronađi koordinate" button), Statistika (clicks per partner per action), Kanali (Viber Switch with cost warning).

---

## 13. Open Questions

| ID | Origin | Question | Blocking for API Contract? |
|---|---|---|---|
| OQ-01 | Brief | Metric targets. | No |
| OQ-03 | Brief | Premium / breeder prices — screens show placeholders. | No |
| OQ-04 | Brief | Partner pricing. | No |
| OQ-09 | Design | ✅ Resolved (v1.1): logo supplied and integrated. An SVG version is still welcome but not blocking. | — |
| OQ-10 | Design | `[NEEDS CLARIFICATION]` Approve the proposed composites in §6 (DateField, compact PremiumLock, AttachmentChip, StatusBadge statuses, LogoAvatar, InlineAlert, Toaster in shells). | No |

---

## 14. Glossary Additions

| Term | Definition |
|---|---|
| Pet accent | The per-pet colour (`--pet-accent`) derived from the active pet's sex; neutral for organisations. |
| App / Organisation / Public / Auth / Admin shell | The five page frames defined in §5. |
| PremiumLock | The single Premium-locked pattern used for every Free limit. |
| ReadOnlyBanner | The banner shown when a view is read-only. |
| State switcher | Dev-only tabs in each mock screen to preview its states. |
| LogoMark | The logo composite with `mark`, `horizontal`, and `full` variants. |

---

## 15. Appendix

_None for v1._
