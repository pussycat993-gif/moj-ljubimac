# Design System — Moj Ljubimac (Web)

## Document Control

| Field | Value |
|---|---|
| Product | Moj Ljubimac ("My Pet") — web application |
| Document | 04 — Design System & Living Screens |
| Version | 1.7 |
| Date | 2026-10-29 |
| Author | Keti Vrtunić (interview facilitated by "Jelena", Design Systems lead persona) |
| Traces to | Brief v1.8 · PRD v1.8 · Technical Constraints v1.8 |
| Status | Draft — 37 screens written and verified in a preview build (see `04-design/README.md`) |

**Change log**

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-10-19 | Initial design system and 29 screen specs. |
| 1.1 | 2026-10-19 | Official logo integrated (OQ-09 closed); `--primary` / `--ring` aligned to the logo brown `#563218`. |
| 1.2 | 2026-10-19 | Pet accent becomes two-tone: soft blush pink / pistachio surfaces with deep rose / olive for text, rings and graphics. |
| 1.3 | 2026-10-19 | Change requests from the API Contract field audit: new S27 treatment form; channel connection (push, WhatsApp) in S12; organisation name/city/PIB in S15; city as a list everywhere; pet names always in the nominative; no photo captions; structured partner hours and separate messaging number; household name and declined invitations in S14. |
| 1.4 | 2026-10-19 | Codex direction adopted: large pastel pet headers and cards, species icons in avatars, reminder-type icon tiles, pastel status pills, "Danas" as a card row, sidebar with full logo, counts and user footer, pet search; new S28 new password, S29 organisation public profile, S11 edit variant. |
| 1.5 | 2026-10-19 | Owner-approved change requests from the Build Plan review: CR-11 i18n rule (every string in `sr.ts` and `en.ts`); CR-12 S10 manual reminder rows open S11 edit; CR-13 S12 WhatsApp "Uskoro dostupno" state; CR-14 new §9.1 Message copy (email, push, action pages) with template ids; CR-18 S14 team invitation variant; CR-21 new S30 Politika privatnosti and S31 Uslovi korišćenja with placeholder legal text (new OQ-15); CR-22 S03 vet suggestion card, S17 "Plaćanje uskoro dostupno" state, count badge on the phone bottom nav, web app manifest exception to the no-hex rule. `ReminderRow` gains an optional `href`; public footer links go to `/privatnost` and `/uslovi`. |
| 1.6 | 2026-10-19 | New capability CAP-08 **Šapa pomoći** (EPIC-08, FR-61…FR-72): six new screens S32 list, S33 listing detail (with "Doniraj" donation info), S34 listing form (+ edit), S35 my listings, S36 messages (inbox + thread), S37 public user profile; S12 gets a "Poruke" notification card, S26 a "Moderacija" tab, S29 a "Donacije" section. Navigation: *Šapa pomoći* (HandHeart) in owner and organisation shells, phone bottom nav 5 items, *Poruke* (MessageCircle) with unread badge in the sidebar footer and phone top bar; admin *Moderacija*; `PublicShell` gains `wide`. New token `--info-soft`; new composites `ListingTypeTag`, `ListingCard`, `ReportDialog` / `BlockDialog`. §9.1 message copy for `new_message`, `listing_expiring`, `listing_expired`, `listing_hidden`, `marketplace_suspended`. Also fixed: S25 loading/error states lacked an `h1`. |
| 1.7 | 2026-10-29 | Owner decisions OQ-03 (EUR prices, VAT added by Paddle) and OQ-11 (Paddle Billing, TC ADR-09): S17 shows real EUR prices (*3 € mesečno*, *30 € godišnje (2 meseca gratis)*; breeder *11 € / 110 €*), the payment note names Paddle, and a new breeder variant sells the breeder plan; S18 gains *Upravljaj plaćanjem* (API EP-89); S20 breeder banner links to the plan; §9 plan-price format; placeholder-price notes removed; OQ-03 resolved. |

---

## 1. Executive Summary

This design system dresses all eight Moj Ljubimac epics in one visual language and defines 37 living screens. Foundations: a warm cream page with white cards, the existing brand brown `#563218` as primary, a per-pet accent (rose for female, teal for male, neutral for organisations), Nunito headings with Inter body text, a 4 px spacing base, 8/12 px radii and two shadow levels, light mode only. On phones the app uses a bottom navigation bar; on computers a left sidebar. One shared pattern each for loading, empty, error, Premium-locked, and read-only states. Traces to Brief v1.7, PRD v1.7, Technical Constraints v1.7.

---

## 2. Inherited Context

- **Personas:** P1 Pet Owner (primary), P2 Household Member, P3 Shelter, P4 Breeder, P5 Partner (via directory), P6 Community member (any signed-in user in Šapa pomoći, CAP-08), plus the Operator (admin) and the Visitor (public pages).
- **North-star:** active reminded pets → reminders get first-class placement (dashboard "Today" strip, dedicated tab in navigation).
- **Stack (TC v1.1):** Next.js App Router, TypeScript, shadcn/ui, Tailwind CSS v4, lucide-react (ADR-01, ADR-14). Interactive screens use `"use client"`.
- **Locale:** Serbian (Latin) default, English available (NFR-05). Screens are written in Serbian.
- **UI-shaping NFRs:** usable from 360 px (NFR-03); WCAG 2.1 AA, keyboard and screen reader (NFR-04); attachments ≤ 10 MB images/PDF (NFR-09).
- **Gated states implied by the PRD:** Premium-locked (BR-01, BR-10; Šapa pomoći: 4th active listing on Free, BR-55), read-only household (BR-28, FR-31), read-only organisation copy after transfer (BR-38), Viber hidden while switched off (BR-14b), shelter pending approval (BR-32); Šapa pomoći signed-out (browse only, FR-61/FR-62), blocked user (BR-59) and suspended from Šapa pomoći (BR-60).
- **Carried-forward open questions:** OQ-01, OQ-04 (targets and partner prices) — non-blocking for design. OQ-03 (plan prices) resolved in v1.7: EUR prices, VAT added by Paddle (PRD BR-62).

---

## 3. Visual Direction & References

Warm, calm, trustworthy — a well-kept paper health booklet translated to the screen, not a clinical dashboard. The cream ground and brown primary carry over the existing Moj Ljubimac brand (logo: dog and cat silhouette; brand brown from the mobile app). The per-pet accent from the mobile app is kept but disciplined: it colours only the active pet's identity — soft blush pink or pistachio for surfaces (avatar fill, header band), the deep rose or olive for the avatar ring, the pet's name and the active tab underline, never global actions, which always use `--primary`.

What is taken: the brand colour, logo, and per-pet-sex accent from the earlier mobile app. What is left: the mobile app's full-screen tinted themes — the accent never floods a whole page.

The official logo (dog and cat silhouette with the script wordmark "Moj Ljubimac") is in `04-design/assets/`: `logo-mark.png` (silhouette), `logo-wordmark.png`, `logo-full.png` (stacked), all transparent and recoloured to the exact brand brown `#563218` sampled from the original; `app-icon-{180,192,512}.png` (silhouette on cream) for the home-screen icon and favicon; `logo-original.png` as supplied. A vector (SVG) version is still wanted for print and very large sizes.

---

## 4. Design Tokens

Light mode only for v1. All colours are semantic tokens; no screen uses a raw hex value.

**Exception — web app manifest (CR-22):** `app/manifest.ts` cannot read CSS variables, so it carries the token values as hex, and only there: `name` "Moj Ljubimac", `short_name` "Ljubimac", `start_url` "/ljubimci", `display` "standalone", `theme_color` `#563218` (= `--primary`), `background_color` `#F6F1EB` (= `--background`), icons `app-icon-192.png` / `app-icon-512.png`. If either token changes, the manifest changes in the same commit. No other file may use raw hex.

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
| `--info-soft` | `#DCE4F2` soft blue (v1.6) | only the *Tražim* listing type tag (no status meaning); always with `--foreground` text |

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
| foreground on info-soft | 12.79 | AA ✅ |
| info-soft surface vs card / background | 1.28 / 1.14 | decorative only — the tag carries icon + label |

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
  --info-soft: #DCE4F2;
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
  --color-info-soft: var(--info-soft);

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
- **Phones (< md):** top bar (logo mark, pet switcher, **Poruke** icon button, profile avatar) + scrolling content + **bottom navigation** fixed, 5 items (v1.6): *Ljubimci*, *Podsetnici*, *Šapa pomoći* (lucide `HandHeart`, bottom-nav label shortened to *Šapa* with the full name as `aria-label` — the full label does not fit 72 px at 360 px), *Partneri*, *Profil*. Content gets `pb-24` so the bar never covers it.
- **Poruke (v1.6, FR-68):** `MessageCircle` icon linking to `/poruke` (S36) with an unread badge = number of conversations with unread messages (EP-80) — in the phone top bar (44 px icon button, `aria-label` "Poruke, N nepročitanih") and in the sidebar footer area above the user row (passed as `counts.poruke`). Zero → no badge. Owner and organisation shells only.
- **Count badge (CR-22):** *Podsetnici* carries a count badge = today's pending reminders (EP-25 `total` for filter `today`, status pending) — in the sidebar and on the phone bottom-nav icon. Zero → no badge.
- **Computers (≥ md):** **left sidebar** 240 px (`w-60`) with logo, *Ljubimci*, *Podsetnici*, *Šapa pomoći*, *Partneri*, *Domaćinstvo*, *Podešavanja*, *Profil*; footer area with *Poruke* and the user row; content area centred, `max-w-5xl`, `px-6 py-8`.
- **Pet context:** inside a pet's pages the content is wrapped in `data-pet-sex` so the pet header band and tab underline use `--pet-accent`.

### 5.2 Organisation shell (Shelter, Breeder)
Same structure, different items: *Životinje*, *Zahtevi* (shelter) / *Upiti* (breeder), *Legla* (breeder only), *Šapa pomoći* (v1.6 — shelters publish needs here; breeders can give, sell or seek), *Tim*, *Javni profil*, *Profil*; *Poruke* in the footer area and phone top bar as in 5.1. Phone bottom nav: shelter 4 items, breeder 5. All accents neutral.

### 5.3 Public shell (Visitor)
No navigation. Slim top bar with the logo mark and a "Napravi nalog" button; content `max-w-3xl`, centred; footer with links *Politika privatnosti* → `/privatnost` (S30) and *Uslovi korišćenja* → `/uslovi` (S31). **`wide` variant (v1.6):** `max-w-5xl` header, content and footer plus a ghost *Prijavi se* button (from `sm`) — used by the signed-out Šapa pomoći pages S32, S33, S37, which need a card grid or detail + aside.

### 5.4 Auth shell
Centred card `max-w-md` on the cream ground, logo above. Used for sign-in, registration, invitation acceptance.

### 5.5 Admin shell (Operator)
Computer-first: left sidebar *Azili na čekanju*, *Partneri*, *Statistika*, *Kanali*, *Moderacija* (v1.6, `Flag`, count badge = open Šapa pomoći reports). On phones it uses the bottom nav (5 items) plus the in-page tab row.

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
| `AppShell` | Button, Avatar, Sheet | owner/org/admin shells: sidebar with full logo, "MENI" label, count badges (`counts`, shown in the sidebar and on the phone bottom nav), user footer (`user`); bottom nav on phones. v1.6: *Šapa pomoći* item (`short` bottom-nav label), *Poruke* link with unread badge (`counts.poruke`) in the sidebar footer and phone top bar; admin *Moderacija* (`counts.moderacija`) |
| `PetAvatar` | Avatar | photo, species icon, or initial; `onSoft` puts a white circle on pastel blocks |
| `PetHeader` | Card, PetAvatar, Badge | large pastel (`bg-pet-accent-soft`) top block with avatar, name in deep accent, chips; actions below |
| `PremiumLock` | Card, Button, Badge | the single Premium-locked pattern |
| `EmptyState` | Card, Button | icon + heading + one line + action |
| `ErrorState` | Card, Button | message + "Pokušaj ponovo" |
| `ReadOnlyBanner` | Card | read-only household / organisation copy |
| `ReminderRow` | Badge, Button | one reminder occurrence with status and "Urađeno"; optional `href` makes the title a link (manual reminders → S11 edit) |
| `LogoMark` | `next/image` | official logo; variants `mark` (phone top bar), `horizontal` (sidebar, public header), `full` (auth screens) |
| `StatusBadge` | Badge | pastel status pills (Urađeno, Uskoro, Propušteno), Danas, Premium |
| `ReminderTypeIcon` | lucide icons | rounded tile per reminder type: Droplet (dose), Syringe (vaccination), Stethoscope (vet follow-up), UtensilsCrossed (meal), Cake (birthday), Bell (manual) |
| `StateSwitcher` | Tabs | dev-only state preview in mock screens |
| `PublicShell`, `AuthShell` | Button, LogoMark | public and auth frames (in `shells.tsx`); the public footer links to S30 / S31; `PublicShell wide` (v1.6) for Šapa pomoći public pages |
| `ListingTypeTag` | Badge | v1.6 — pastel pill per listing type, icon + label, `text-foreground`: *Potreba* `HandHeart` `bg-destructive-soft` · *Poklanjam* `Gift` `bg-success-soft` · *Prodajem* `Tag` `bg-warning-soft` · *Tražim* `Search` `bg-info-soft`. The same file exports the type/category/species labels, `outcomeForType` and `formatRsd` |
| `ListingCard` | Card, ListingTypeTag | v1.6 — one listing in a grid (S32, S37): 4:3 photo (placeholder `bg-foreground/5` + `ImageIcon` in mocks) with the type tag and photo count, title (whole card is the link to S33), price line (*2.500 RSD* / *Po dogovoru* / *Besplatno*), city · category · species, author · date |
| `ReportDialog`, `BlockDialog` | Dialog, RadioGroup, Textarea, AlertDialog | v1.6 (`safety-dialogs.tsx`) — report a listing or user (reason *Spam ili reklama / Prevara / Neprimeren sadržaj / Dobrobit životinja / Drugo*, note ≤ 500, note required for *Drugo*; sent confirmation) and block confirmation (*Da, blokiraj*, destructive). Used in S33, S36, S37 |

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
- **Status badges (solid fills):** *Urađeno* `bg-success-soft` · *Uskoro* `bg-warning-soft` · *Propušteno* `bg-destructive-soft` (all with `text-foreground`) · *Danas* `bg-primary` · *Premium* primary outline. Listing statuses reuse `StatusBadge`: *Aktivan* (done), *Ističe za N dana* (soon, ≤ 3 days), *Istekao* / *Sakriven* (missed), *Rešeno* (done).
- **Listing type tags (v1.6):** `ListingTypeTag` only — never a status colour on its own; the tag always carries icon + label, so type is never colour-only.
- **Signed-out (Šapa pomoći, v1.6):** public pages render in `PublicShell wide`; every action that needs an account (message, Doniraj, report, block, new listing) is replaced by one primary *"Prijavi se da pošalješ poruku"* (S33) or a sign-in card (S32) — never shown disabled.
- **Suspended from Šapa pomoći (v1.6, BR-60):** a status card with `ShieldAlert` in `text-destructive` explaining the suspension and the support address; create/extend/message controls hidden; browsing and reading old messages still work.
- **Blocked (v1.6, BR-59):** in the thread (S36) and profile (S37) a status line/`ReadOnlyBanner` *"Blokirao/la si ovog korisnika…"* with *Odblokiraj*; the composer and the user's listings are hidden.

---

## 9. Content & Voice (UI copy)

- **Locale:** Serbian Latin by default; every string also exists in English (NFR-05). Screens are written in Serbian.
- **i18n rule (CR-11):** every screen step adds all of its strings to both `lib/i18n/sr.ts` and `lib/i18n/en.ts`. The Serbian text is the copy in the mockups; the English text is a faithful translation of it — no new copy, no extra or missing messages. A key present in one file and missing in the other fails the build. Message copy in §9.1 follows the same rule.
- **Tone:** informal "ti", warm, short. Name the pet, always in the **nominative** — names are never declined, because user-entered names cannot be inflected reliably: *"Luna — vakcina ističe za 7 dana"*, *"Lek za: Luna"*, not *"Luni ističe vakcina"*.
- **Terminology:** use Brief/PRD glossary terms exactly — *Uspomena* (Memorial), *Trenutak* (Moment), *Domaćinstvo* (Household), *Partner*, *Podsetnik* (Reminder), *Premium*, *Azil*, *Odgajivačnica*, *Leglo*, *Udomljavanje*; Šapa pomoći (v1.6): *Šapa pomoći* (never translated in Serbian UI; EN "Helping Paw"), *Oglas* (Listing), *Potreba* (Need — shelter only), *Poklanjam / Prodajem / Tražim* (giving / selling / seeking), *Razgovor* (Conversation), *Poruke* (Messages), *Prijavi* (Report), *Blokiraj* (Block), *Doniraj* + *Podaci za donacije* (Donation info), *Rešeno* with *Poklonjeno / Prodato / Donirano / Pronađeno*, *Po dogovoru* (negotiable price). Users appear by display name (nickname or *Ime P.*), never with email or phone.
- **Formats:** dates `19. 10. 2026.`; time `08:00`; money `2.990 RSD`; plan prices (v1.7) in EUR with `Intl.NumberFormat` currency `EUR`, no decimals for whole euros and two otherwise — sr-Latn `3 €`, `30 €`, `2,50 €`; en-GB `€3`, `€30`, `€2.50`; weight `4,2 kg`, `850 g`.
- **Mock data:** realistic Serbian names and places — pets *Luna* (female cat), *Maks* (male dog), *Kiki* (female rabbit); people *Ivana Petrović*, *Marko Jovanović*; places *Novi Sad*, *Beograd*, *Bečej*; partners *Veterinarska ambulanta „Dr Vet"*, *Pet shop „Šapica"*, *Grooming salon „Čupko"*, *Pet hotel „Kod Mace"*. Never "Lorem ipsum", never "John Doe". Premium/breeder plan prices are the real EUR prices (v1.7, OQ-03): Premium 3 € / 30 €, breeder 11 € / 110 €.

### 9.1 Message copy (CR-14)

Copy for everything the product sends outside the app screens, plus the two action-link pages. Template ids are the keys used in code (`lib/i18n/{sr,en}.ts` under `messages.<id>`, and the Resend/push template id); the language follows the recipient's `profiles.locale`. Same voice as the screens: informal "ti", short, pet names in the **nominative** (never declined — use "ljubimac: Maks", "Maks — …"). Variables in `{braces}`; `{pet}` is the pet name, or *Za mene* / *For me* for personal reminders. Every email ends with the shared footer. WhatsApp templates are defined in the API Contract §9.4 (`reminder_due`, `verification_code`) and reuse the reminder wording below.

**Shared email footer** (`email_footer`) — sr: *"Moj Ljubimac · Ovaj mejl ti šaljemo jer imaš nalog. Obaveštenja menjaš u Podešavanjima."* · en: *"Moj Ljubimac · You're getting this email because you have an account. Change notifications in Settings."*

| Template id | Channel | Part | sr | en |
|---|---|---|---|---|
| `reminder_email` | Email | Subject | `{pet}: {title}` | `{pet}: {title}` |
| | | Body | Zdravo, {first_name}! Podsetnik: **{title}** — {pet}, {date} u {time}. | Hi {first_name}! Reminder: **{title}** — {pet}, {date} at {time}. |
| | | Buttons | **Urađeno** (action link, EP-32) · Otvori u aplikaciji | **Done** (action link, EP-32) · Open in the app |
| | | Note | Dugme „Urađeno“ važi 24 sata. | The "Done" button works for 24 hours. |
| `reminder_push` | Push | Title | `{pet}: {title}` | `{pet}: {title}` |
| | | Body | {date} u {time} | {date} at {time} |
| | | Action | Urađeno | Done |
| `action_done_page` | Page `/api/a/done` | Heading | Označeno kao urađeno | Marked as done |
| | | Body | {pet}: {title} — označeno u {time}. | {pet}: {title} — marked at {time}. |
| | | Button | Otvori aplikaciju | Open the app |
| `action_expired_page` | Page `/api/a/done` | Heading | Link je istekao | This link has expired |
| | | Body | Link važi 24 sata i samo jednom. Otvori aplikaciju i označi podsetnik tamo. | The link works once and for 24 hours. Open the app and mark the reminder there. |
| | | Button | Otvori aplikaciju | Open the app |
| `household_invitation` | Email | Subject | {inviter} te poziva u domaćinstvo: {household} | {inviter} invited you to a household: {household} |
| | | Body | {inviter} želi da zajedno brinete o ljubimcima ({pets}). Kao član unosiš svakodnevnu negu i vidiš ceo karton. Poziv važi do {date}. | {inviter} wants you to care for their pets together ({pets}). As a member you log daily care and see the full record. The invitation is valid until {date}. |
| | | Button | Pogledaj poziv | View invitation |
| `team_invitation` | Email | Subject | Poziv u tim: {organisation} | Team invitation: {organisation} |
| | | Body | {inviter} te poziva u tim organizacije {organisation} — uloga: {role}. Tvoj nalog ostaje kakav je i dalje vodiš i svoje ljubimce. Poziv važi do {date}. | {inviter} invited you to the {organisation} team — role: {role}. Your account stays as it is, and you keep your own pets. The invitation is valid until {date}. |
| | | Button | Pogledaj poziv | View invitation |
| `record_transfer` | Email | Subject | Stiže ti karton: {pet} | A record is on its way: {pet} |
| | | Body | {organisation} ti šalje ceo karton (ljubimac: {pet}) — vakcine, preglede i priloge. Link važi do {date}. | {organisation} is sending you the full record (pet: {pet}) — vaccinations, vet visits and attachments. The link is valid until {date}. |
| | | Button | Prihvati karton | Accept the record |
| `adoption_request_accepted` | Email | Subject | Zahtev prihvaćen: {pet} | Request accepted: {pet} |
| | | Body | Dobre vesti! {organisation} je prihvatio tvoj zahtev za udomljavanje (ljubimac: {pet}). Javi im se: {org_phone}, {org_email}. | Good news! {organisation} accepted your adoption request (pet: {pet}). Get in touch: {org_phone}, {org_email}. |
| `adoption_request_rejected` | Email | Subject | Odgovor na zahtev: {pet} | Reply to your request: {pet} |
| | | Body | {organisation} ovog puta nije prihvatio tvoj zahtev za udomljavanje (ljubimac: {pet}). Hvala ti što želiš da pomogneš — i druge životinje čekaju dom. | {organisation} couldn't accept your adoption request this time (pet: {pet}). Thank you for wanting to help — other animals are waiting for a home too. |
| | | Button | Pogledaj životinje | See the animals |
| `breeder_inquiry_accepted` | Email | Subject | Upit prihvaćen: {pet} | Inquiry accepted: {pet} |
| | | Body | {organisation} je prihvatio tvoj upit (ljubimac: {pet}). Javi im se: {org_phone}, {org_email}. | {organisation} accepted your inquiry (pet: {pet}). Get in touch: {org_phone}, {org_email}. |
| `breeder_inquiry_rejected` | Email | Subject | Odgovor na upit: {pet} | Reply to your inquiry: {pet} |
| | | Body | {organisation} ovog puta nije prihvatio tvoj upit (ljubimac: {pet}). Pogledaj ostale mladunce na njihovoj stranici. | {organisation} couldn't accept your inquiry this time (pet: {pet}). See their other offspring on their page. |
| | | Button | Pogledaj stranicu | View their page |
| `premium_expiry_30` | Email | Subject | Premium ističe za 30 dana | Premium ends in 30 days |
| | | Body | Tvoj Premium traje do {date}. {renew_line} | Your Premium runs until {date}. {renew_line} |
| `premium_expiry_7` | Email | Subject | Premium ističe za 7 dana | Premium ends in 7 days |
| | | Body | Tvoj Premium traje do {date}. {renew_line} | Your Premium runs until {date}. {renew_line} |
| `premium_expiry_1` | Email | Subject | Premium ističe sutra | Premium ends tomorrow |
| | | Body | Tvoj Premium traje do {date}. {renew_line} | Your Premium runs until {date}. {renew_line} |
| | | `{renew_line}` auto-renew on | Obnavlja se automatski — ne moraš ništa da radiš. | It renews automatically — nothing to do. |
| | | `{renew_line}` auto-renew off | Posle toga prelaziš na Free: ništa se ne briše, ali dodatni ljubimci i domaćinstvo postaju samo za čitanje. | After that you move to Free: nothing is deleted, but extra pets and the household become read-only. |
| | | Button | Pogledaj pretplatu | View subscription |
| `shelter_approved` | Email | Subject | Azil je odobren: {organisation} | Shelter approved: {organisation} |
| | | Body | Dobro došao/la! {organisation} je odobren — sada možeš da dodaješ životinje, pozivaš tim i objaviš javnu stranicu. | Welcome! {organisation} is approved — you can add animals, invite your team and publish your public page. |
| | | Button | Otvori organizaciju | Open organisation |
| `shelter_rejected` | Email | Subject | Azil nije odobren: {organisation} | Shelter not approved: {organisation} |
| | | Body | Nažalost, ovog puta ne možemo da odobrimo nalog za {organisation}. Ako misliš da je greška, odgovori na ovaj mejl. | Unfortunately we can't approve the account for {organisation} this time. If you think this is a mistake, reply to this email. |
| `data_export_ready` | Email | Subject | Tvoji podaci su spremni | Your data is ready |
| | | Body | Arhiva sa svim tvojim podacima i kartonima je spremna ({size}). Link važi do {date}. | The archive with all your data and records is ready ({size}). The link is valid until {date}. |
| | | Button | Preuzmi podatke | Download data |
| `account_deletion_scheduled` | Email | Subject | Nalog će biti obrisan {date} | Your account will be deleted on {date} |
| | | Body | Primili smo zahtev za brisanje naloga. Nalog je isključen, a {date} brišemo ga trajno sa svim podacima. Predomislio/la si se? Prijavi se pre tog datuma i otkaži brisanje. | We got your request to delete your account. It's switched off now, and on {date} we delete it permanently with all its data. Changed your mind? Sign in before then and cancel the deletion. |
| | | Button | Otkaži brisanje | Cancel deletion |
| `new_message` | Email | Subject | Nova poruka: {listing} | New message: {listing} |
| | | Body | Zdravo, {first_name}! Imaš novu poruku o oglasu **{listing}** (pošiljalac: {sender}): „{preview}“ | Hi {first_name}! You have a new message about **{listing}** (from: {sender}): "{preview}" |
| | | Button | Odgovori (opens S36 `/poruke/{conversation_id}`) | Reply (opens S36 `/poruke/{conversation_id}`) |
| | Push | Title | {sender} | {sender} |
| | | Body | {listing}: {preview} | {listing}: {preview} |
| | | Action | Odgovori | Reply |
| | | Note | `{preview}` = first 120 characters of the message; `{sender}` = display name. Sent by EP-82 only on channels switched on in S12 *Poruke*; never WhatsApp/Viber. | `{preview}` = first 120 characters; `{sender}` = display name. Only on channels switched on in S12. |
| `listing_expiring` | Email | Subject | Oglas ističe za 3 dana: {listing} | Your listing ends in 3 days: {listing} |
| | | Body | Tvoj oglas **{listing}** je aktivan do {date}. Ako je još aktuelan, produži ga za 30 dana. Ako je rešen, označi ga kao rešen. | Your listing **{listing}** is active until {date}. If it's still current, extend it by 30 days. If it's done, mark it as resolved. |
| | | Buttons | **Produži** (opens S35 and extends, EP-77) · Označi kao rešeno | **Extend** (opens S35 and extends, EP-77) · Mark as resolved |
| `listing_expired` | Email | Subject | Oglas je istekao: {listing} | Your listing has ended: {listing} |
| | | Body | Tvoj oglas **{listing}** je istekao {date} i više se ne prikazuje u Šapi pomoći. Možeš da ga objaviš ponovo na još 30 dana. | Your listing **{listing}** ended on {date} and is no longer shown in Šapa pomoći. You can publish it again for another 30 days. |
| | | Button | Objavi ponovo | Publish again |
| `listing_hidden` | Email | Subject | Oglas je sakriven: {listing} | Your listing was hidden: {listing} |
| | | Body | Operater je sakrio tvoj oglas **{listing}** jer krši pravila Šape pomoći. Razlog: {reason}. Ako misliš da je greška, odgovori na ovaj mejl. | An operator hid your listing **{listing}** because it breaks the Šapa pomoći rules. Reason: {reason}. If you think this is a mistake, reply to this email. |
| | | Button | Moji oglasi | My listings |
| `marketplace_suspended` | Email | Subject | Nalog je isključen iz Šape pomoći | Your account was suspended from Šapa pomoći |
| | | Body | Zbog prijava drugih korisnika tvoj nalog je isključen iz Šape pomoći: ne možeš da objavljuješ oglase ni da šalješ poruke, a tvoji aktivni oglasi su sakriveni. Kartoni, podsetnici i domaćinstvo rade kao i do sada. Razlog: {reason}. Ako misliš da je greška, odgovori na ovaj mejl. | Because of reports from other users, your account was suspended from Šapa pomoći: you can't publish listings or send messages, and your active listings are hidden. Records, reminders and your household work as before. Reason: {reason}. If you think this is a mistake, reply to this email. |

`{listing}` is the listing title as typed; `{reason}` is the Operator's note from S26, or the report reason label when the note is empty. Display names (`{sender}`) are never declined — hence "pošiljalac: {sender}" instead of a genitive.

Organisation names stay as typed (nominative, never declined); where Serbian needs a gendered verb after an organisation name, the masculine form is used, as for the default noun *azil* / *udruženje*.

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
| S29 | EPIC-06 | Javni profil organizacije | `/organizacija/profil` | FR-60, FR-72 | O | `org-profile.tsx` |
| S06 | EPIC-01 | Uspomene | `/uspomene` | FR-11, FR-12 | A | `memorials.tsx` |
| S07 | EPIC-02 | Dnevnik ishrane i stolice | `/ljubimci/[id]/dnevnik` | FR-14, FR-15, FR-16 | A | `care-log.tsx` |
| S08 | EPIC-02 | Trenuci | `/ljubimci/[id]/trenuci` | FR-17, FR-18, FR-19 | A | `moments.tsx` |
| S09 | EPIC-02 | Javni trenutak | `/t/[slug]` | FR-19 | P | `public-moment.tsx` |
| S10 | EPIC-03 | Podsetnici | `/podsetnici` | FR-20, FR-24 | A | `reminders.tsx` |
| S11 | EPIC-03 | Novi podsetnik | `/podsetnici/novi` | FR-21 | A | `reminder-form.tsx` |
| S12 | EPIC-03 | Podešavanja podsetnika | `/podesavanja/podsetnici` | FR-22, FR-23, FR-25, FR-69 | A | `reminder-settings.tsx` |
| S13 | EPIC-04 | Domaćinstvo | `/domacinstvo` | FR-26, FR-27, FR-28, FR-29, FR-30, FR-32 | A | `household.tsx` |
| S14 | EPIC-04 / EPIC-06 | Prihvati poziv / karton | `/poziv/[token]` | FR-26, FR-50, FR-51 | U | `invite-accept.tsx` |
| S15 | EPIC-05 | Registracija | `/registracija` | FR-33, FR-35 | U | `register.tsx` |
| S16 | EPIC-05 | Prijava | `/prijava` | FR-34 | U | `sign-in.tsx` |
| S17 | EPIC-05 | Premium | `/premium` | FR-36, FR-37, FR-42 (breeder variant) | A | `premium.tsx` |
| S18 | EPIC-05 | Profil i pretplata | `/profil` | FR-25, FR-35, FR-38, FR-39 | A | `profile.tsx` |
| S19 | EPIC-05 | Moji podaci i brisanje naloga | `/profil/podaci` | FR-40, FR-41 | A | `account-data.tsx` |
| S20 | EPIC-06 | Životinje i tim organizacije | `/organizacija` | FR-42, FR-43, FR-44, FR-45 | O | `org-animals.tsx` |
| S21 | EPIC-06 | Zahtevi i upiti | `/organizacija/zahtevi` | FR-47, FR-49, FR-50 | O | `org-requests.tsx` |
| S22 | EPIC-06 | Legla | `/organizacija/legla` | FR-48 | O | `litters.tsx` |
| S23 | EPIC-06 | Javna stranica azila / odgajivačnice | `/o/[slug]` | FR-46, FR-47, FR-49 | P | `public-org.tsx` |
| S24 | EPIC-07 | Partneri u blizini | `/partneri` | FR-52, FR-53, FR-55, FR-56 | A | `partners.tsx` |
| S25 | EPIC-07 | Profil partnera | `/partneri/[id]` | FR-54, FR-55 | A | `partner-profile.tsx` |
| S26 | EPIC-07 | Admin | `/admin` | FR-42, FR-57, FR-58 (+ BR-14b switch), FR-71 | D | `admin.tsx` |
| S30 | EPIC-05 | Politika privatnosti | `/privatnost` | Release Criterion 4 | P | `privacy.tsx` |
| S31 | EPIC-05 | Uslovi korišćenja | `/uslovi` | Release Criterion 4 | P | `terms.tsx` |
| S32 | EPIC-08 | Šapa pomoći | `/sapa-pomoci` | FR-61 | A / P | `sapa-pomoci.tsx` |
| S33 | EPIC-08 | Oglas | `/sapa-pomoci/[id]` | FR-62, FR-66, FR-68, FR-70 | A / P | `listing-detail.tsx` |
| S34 | EPIC-08 | Novi / izmeni oglas | `/sapa-pomoci/nova`, `/sapa-pomoci/[id]/izmeni` | FR-63, FR-64 | A / O | `listing-form.tsx` |
| S35 | EPIC-08 | Moji oglasi | `/sapa-pomoci/moje` | FR-64, FR-65 | A / O | `my-listings.tsx` |
| S36 | EPIC-08 | Poruke | `/poruke`, `/poruke/[id]` | FR-68, FR-69, FR-70 | A / O | `messages.tsx` |
| S37 | EPIC-08 | Profil korisnika | `/korisnik/[id]` | FR-67, FR-70 | A / P | `user-profile.tsx` |

**Coverage (37 screens / 8 epics):** EPIC-01 ✅ (7) · EPIC-02 ✅ (3) · EPIC-03 ✅ (3) · EPIC-04 ✅ (2) · EPIC-05 ✅ (8) · EPIC-06 ✅ (5) · EPIC-07 ✅ (3) · EPIC-08 ✅ (6). Every screen traces to PRD FRs, or (S30, S31) to PRD Release Criterion 4; no screen outside PRD scope. (S14 is counted under EPIC-04.) EPIC-08 FRs also land in existing screens: FR-69 in S12, FR-71 in S26, FR-72 in S29; FR-61…FR-72 are all covered. Šapa pomoći screens are reached from the owner (A) and organisation (O) shells; S32, S33 and S37 are also public (P, `PublicShell wide`) when signed out.

---

## 12. Screen Specs

Every screen: inline Serbian mock data, local React state only, `"use client"`, states listed below. "States" abbreviations: **D** default · **L** loading · **E** empty · **X** error · **G** Premium-locked · **R** read-only · (v1.6) **O** signed-out · **B** blocked · **S** suspended from Šapa pomoći. Each screen file has a small state switcher (dev-only `Tabs` above the content, labelled "Prikaz stanja") so reviewers can see every state.

**S01 Moji ljubimci** — Search field ("Pretraži ljubimce…", FR-59) next to "Dodaj ljubimca". "Danas" card: on md+ a row of up to 3 reminder cards (type icon, title, pet · time, status pill, "Urađeno"), stacked on phones. Pet cards: pastel top block (species avatar, name, breed, sex chip), stats (Starost, Težina), "Sledeći podsetnik", footer "Karton ažuriran pre …" + "Otvori karton →". "Dodaj ljubimca" button; on Free with 1 active pet it opens `PremiumLock` (FR-36). Link to Uspomene. States D L E (*"Dodaj svog prvog ljubimca"*) G. Phones: 1 column; md 2; lg 3.

**S02 Dodaj / izmeni ljubimca** — Form `max-w-3xl` in sections: Osnovno (ime*, vrsta* Select incl. "Ostalo" + text field, rasa, pol* RadioGroup, datum rođenja or okvirna godina), Izgled (boja/oznake, fotografija), Identifikacija (mikročip, pasoš, sterilisan da/ne/ne znam), Moj veterinar (ime, telefon), Jedinica težine (kg/g), napomena. Sex choice live-previews the pet accent. Validation inline. States D X.

**S03 Karton ljubimca** — `PetHeader` (accent band, avatar, name, age, microchip) + actions: "Izvezi PDF" (G on Free), DropdownMenu (Premesti u Uspomene, Obriši trajno → AlertDialog "Da, obriši"). Tabs: Pregled (next 3 reminders, last weight, last visit), Vakcine (list with next-dose badge), Terapije (with "Doza data" button and dose log), Pregledi (list, attachment chips), Težina (list + simple bar trend from div bars using tokens). Detail+aside on lg. Aside "Moj veterinar" card; when the pet has no "moj veterinar" it is replaced by a small **"Predlog veterinara u blizini"** card (CR-22, EP-64): the top 2 vet partners (featured first, then distance — name linking to S25, distance · address, call icon button) and a "Svi partneri →" link to `/partneri`. States D L E (per tab) G (PDF) R (member view hides medical edit buttons), plus the no-vet variant "Bez veterinara (predlog)".

**S04 Nova vakcina** — Fields per FR-05; "Datum sledeće doze" shows helper *"Napravićemo podsetnik."* States D X.

**S27 Nova terapija** — Fields per FR-06 (type*, name*, dose, frequency every X hours/days, start*, end date or duration in days, note); helper *"Napravićemo podsetnike za svaku dozu."* and a dose-schedule summary. States D X.

**S05 Novi pregled** — Fields per FR-07; attachment zone (images/PDF ≤ 10 MB; counter "7 / 10 priloga" on Free; 11th → PremiumLock); invalid type/size inline error. States D X G.

**S28 Nova lozinka** — Auth shell; new password + repeat (min 8 characters); states default, mismatch, link expired (`invalid_action_token`), success → "Prijavi se".

**S29 Javni profil organizacije** — Organisation shell; Admin edits description, phone, email, website, logo (FR-60); Volunteer read-only; shelter/breeder variants. **Donacije** card (v1.6, FR-72, EP-88 — shelters only, hidden for breeders): `HandHeart` tile, one line that it is shown by "Doniraj" and that money never passes through the app; fields *Broj računa* (format `160-0000012345678-90`, inline error), *Link za uplatu* (`https://`), *Adresa za donošenje*, *Radno vreme za donošenje* (free text, e.g. *Subota 10:00 – 14:00 · Nedelja 10:00 – 13:00*); all optional, with the note that without any of them the shelter's needs show only *"Pošalji poruku"* (EP-74 donation flag). Volunteer view lists the four values read-only.

**S06 Uspomene** — Muted cards (no accent) with date and reason; "Vrati među aktivne" (G when slot taken on Free); Free counter "2 / 2 uspomene". States D E G.

**S07 Dnevnik** — Tabs Ishrana / Stolica; quick-add forms in Dialog; day-grouped lists; "Podsetnici za obroke" card (times + weekday chips). States D L E.

**S08 Trenuci** — Photo grid of moments; new-moment Dialog (date, up to 5 photos, text); per moment: "Podeli kao sliku" (preview card with name/date/logo; "Ukloni logo" Switch G on Free), "Javni link" (Switch on/off + copy). Free counter "3 / 5 trenutaka". States D E G.

**S09 Javni trenutak** — Public shell; photos, text, pet name, date; no health data; CTA "Napravi nalog za svog ljubimca". States D, link-disabled (*"Ovaj trenutak više nije javan"*).

**S10 Podsetnici** — Tabs Danas / Uskoro / Propušteno / Urađeno; `ReminderRow` (pet avatar or "Za mene", title, time, channel icons, status badge, "Urađeno"). Tapping a **manual** reminder's title opens S11 in edit mode (`/podsetnici/[id]`, CR-12); generated reminders (vaccination, dose, follow-up, meal, birthday) are edited at their source. "Novi podsetnik" button. The *Podsetnici* nav count badge = today's pending reminders. States D L E.

**S11 Novi / izmeni podsetnik** — Title*, za koga (ljubimac Select or "Samo za mene"), datum i vreme*, ponavljanje (Select). Edit variant prefilled with "Obriši podsetnik" (AlertDialog). States D X, edit.

**S12 Podešavanja podsetnika** — One Card per type (Vakcine, Terapije/doze, Kontrole, Obroci, Rođendani, Moji podsetnici): lead-time chips (multi), delivery time, channel Checkboxes (Email, Push, WhatsApp with Premium badge/G on Free; Viber absent while switched off); doses and meals show *"Stižu tačno u zadato vreme"*. WhatsApp counter "12 / 30 poruka ovog meseca". iPhone push hint card ("Dodaj na početni ekran"). A "Kanali" card on top: Push (isključeno / uključeno / blokirano u pregledaču) and WhatsApp number connection (number → "Pošalji kod" → code → "Povezano" → "Prekini vezu"; G on Free). **"Šapa pomoći" → "Poruke" card** (v1.6, FR-69): `MessageCircle` tile, *"Kad ti neko piše povodom oglasa. Stižu odmah."*, two Switch rows *Mejl* and *Push* (on by default; no lead time, no delivery time, never WhatsApp/Viber — stored as `reminder_preferences` type `message`); while browser push is not on, a hint *"Push stiže tek kad uključiš obaveštenja u kartici „Kanali“ iznad."*; both off → *"Nove poruke ćeš videti samo u aplikaciji, u Porukama."* States D G, plus push-on/WhatsApp-connected and push-blocked variants, and **"WhatsApp uskoro"** (CR-13): for Premium users before the WhatsApp channel is live, the WhatsApp section shows an *"Uskoro dostupno"* badge and one line instead of the number form, every WhatsApp channel checkbox is disabled and unchecked with *"Uskoro dostupno"* beside it, and the monthly counter card is hidden.

**S13 Domaćinstvo** — Members list (role, joined date, remove), invite Dialog (email or copy link), shared-pets Switch list, counter "3 / 6 članova", own reminder opt-in Switch for members. States D G (Free owner) R (owner's Premium lapsed: banner + hidden controls) E.

**S14 Prihvati poziv / karton** — Auth shell; variants: household invitation (household by name, e.g. "Domaćinstvo Petrović", inviter), **team invitation** (CR-18: organisation name, type and city, inviter, role *Admin* or *Volonter* with what the role can and cannot do, team counter "6 / 20", validity, note that the invitee keeps their own account and pets — BR-53; "Pridruži se timu" / "Odbij"; accepted → "Idi u organizaciju"), declined ("Odbijeno") and record transfer (animal card, organisation name); "Prihvati" / sign-in prompt; expired variant; Free-slot-taken variant → PremiumLock (FR-51).

**S15 Registracija** — Account type RadioGroup (Vlasnik / Azil / Odgajivačnica) with one-line descriptions; email, lozinka, or "Nastavi sa Google-om"; language switch SR/EN; for Azil/Odgajivačnica also *Naziv organizacije\** and *Grad\** (Select from the city list) and optional *PIB*; shelter note *"Azil odobravamo ručno, obično u roku od 2 dana."* After submit: "Proveri mejl" state.

**S16 Prijava** — Email/lozinka, Google, "Zaboravljena lozinka". States D X.

**S17 Premium** — Free vs Premium comparison (rows from BR-01/BR-02), Mesečno / Godišnje toggle with the EP-44 prices (v1.7, EUR, VAT added at checkout): *Mesečno* → *"3 € mesečno"* / *"€3 a month"*; *Godišnje* → *"30 € godišnje (2 meseca gratis)"* / *"€30 a year (2 months free)"*; the Free card shows *"0 €"* / *"€0"*; under the price a muted line *"+ PDV prema tvojoj zemlji"* / *"+ VAT for your country"*. "Probaj 7 dana besplatno" (or "Pretplati se" when trial used) opens the Paddle checkout overlay over the page (API EP-45); after a completed payment the app goes to S18 with the toast *"Plaćanje je primljeno. Premium se uključuje za nekoliko trenutaka."* / *"Payment received. Premium switches on in a few moments."* Payment note card (v1.7, replaces the Monri note): title *"Plaćanje preko Paddle-a"* / *"Payments through Paddle"*, body *"Paddle je prodavac i izdaje račun; PDV se dodaje prema tvojoj zemlji. Podatke o kartici čuva Paddle, ne mi."* / *"Paddle is the seller and issues the invoice; VAT is added for your country. Paddle keeps your card details, not us."* **Breeder variant** (v1.7, Admin of a breeder organisation, FR-42): h1 *"Odgajivački plan"* / *"Breeder plan"*; instead of the comparison a card listing what the plan unlocks — *Legla i mladunci*, *Javna stranica sa cenama*, *Upiti kupaca*, *Predaja kartona* / *Litters and offspring*, *Public page with prices*, *Buyer inquiries*, *Record hand-over* (FR-48 … FR-50); the same toggle with *"11 € mesečno"* / *"€11 a month"* and *"110 € godišnje (2 meseca gratis)"* / *"€110 a year (2 months free)"*; no trial; CTA *"Pretplati se"*; while the breeder plan is running a status card *"Odgajivački plan je aktivan do {date}."* / *"Your breeder plan is active until {date}."* with *"Upravljaj plaćanjem"* (EP-89) instead of the CTA. Shelter accounts and Volunteers are still redirected to `/organizacija`. States D, trial used, and **"Plaćanje uskoro dostupno"** (CR-22: plans without prices from EP-44, EP-45 → `503 payment_provider_unavailable`): status card explaining payment is coming, billing toggle and prices hidden ("Cena će biti objavljena uskoro."), CTA disabled with the label "Plaćanje uskoro dostupno", card-payment note hidden.

**S18 Profil i pretplata** — Name, city, language; Premium card with days remaining (`Progress`), renewal date, price in EUR (e.g. *"Sledeća naplata 19. 11. 2026. · 3 € · Visa •••• 4821"*), auto-renew status, "Otkaži obnovu" AlertDialog; v1.7: an outline button *"Upravljaj plaćanjem"* / *"Manage billing"* (`ExternalLink` icon) when the subscription has a Paddle customer (API EP-89) — it opens the Paddle customer portal in a new tab for card changes and invoices; expired variant with downgrade note (FR-39). Links to reminder settings and S19.

**S19 Moji podaci** — "Preuzmi sve moje podatke" (preparing → ready states), "Obriši nalog" AlertDialog explaining 30 days; pending-deletion variant with "Otkaži brisanje".

**S20 Životinje i tim** — Org shell. Tabs Životinje / Tim. Animals: filter chips by status (shelter: Prijem, Na brizi, Za udomljavanje, Rezervisan, Udomljen; breeder: Dostupno, Rezervisano, Prodato); Table on lg, cards below; new intake Dialog (shelter). Tim: members with Admin/Volonter badge, "1 / 20". Pending-approval variant for shelters (banner, everything read-only). v1.7: for a breeder Admin without an active breeder plan, the read-only banner gets the action link *"Aktiviraj odgajivački plan"* / *"Activate the breeder plan"* → S17 breeder variant (`/premium`); Volunteers see the banner without the link.

**S21 Zahtevi i upiti** — List of requests (name, phone, email, message, animal) with Prihvati / Odbij (Admin only; Volunteer sees read-only); accepted → "Pošalji karton" (transfer Dialog with email, 30-day validity, re-send). States D E R (volunteer).

**S22 Legla** — Litter cards (majka, otac, datum okota, broj mladunaca) expanding to offspring rows with status and price; new litter Dialog. States D E.

**S23 Javna stranica** — Public shell; organisation header; grid of available animals with public fields (photo, name, species, sex, approx. age, description, sterilisan/vakcinisan badges; price for breeders); request Dialog (requires sign-in → prompt). States D E.

**S24 Partneri u blizini** — Type filter chips (Sve, Veterinari, Pet shopovi, Grooming, Pet hoteli); location row ("Koristi moju lokaciju" or city from profile); "Istaknuto" section first, then by distance; partner card with type badge, distance, quick-action buttons (Pozovi, Poruka, Mejl, Sajt — hidden when missing). Vet-suggestion banner when the active pet has no "moj veterinar". States D L E.

**S25 Profil partnera** — Header (logo, name, type, address, distance, working hours), description, the four quick actions as large buttons, website/Instagram handle.

**S30 Politika privatnosti** — Public shell; h1, a short intro with "Poslednja izmena", a "Sadržaj" card with anchor links, then numbered sections *Ko smo*, *Koje podatke prikupljamo*, *Zašto ih prikupljamo*, *Koliko ih čuvamo*, *Tvoja prava*, *Kontakt*. Every section body is a placeholder paragraph *"Tekst dostavlja vlasnik (OQ-15)."* — muted, dashed border — until the owner supplies the text. States D.

**S31 Uslovi korišćenja** — Same layout as S30; sections *Opšte*, *Nalog*, *Premium i plaćanje*, *Sadržaj korisnika*, *Odgovornost*, *Izmene uslova*, *Kontakt*; same placeholder (OQ-15). The intro shows "Verzija {TERMS_VERSION}" (constant in `lib/legal.ts`, TC CR-09 — the version registration stores). States D.

**S26 Admin** — Admin shell; Tabs: Azili na čekanju (approve/reject), Partneri (Table: name, type, city, Istaknut Switch with "3 / 3" limit hint, plaćeno do, status; add/edit Dialog with "Pronađi koordinate" button), Statistika (clicks per partner per action), Kanali (Viber Switch with cost warning), **Moderacija** (v1.6, FR-71, EP-86; tab label and nav badge carry the open-report count): *Otvorene prijave* — one card per report: reason pill (`StatusBadge` missed), target *Oglas* / *Korisnik*, "Prijava za isti oglas: N", listing title or user name, author and reporter display names, date, the reporter's note on `bg-foreground/5`; actions *Odbaci prijavu* (ghost), *Sakrij oglas* (outline, listing reports only), *Isključi autora / korisnika* (destructive) — hide and suspend confirm in an AlertDialog with an optional *"Razlog za korisnika"* (goes into `listing_hidden` / `marketplace_suspended`, §9.1); *"Obrađeno ovog meseca: N"*. Section *Sakriveni oglasi i isključeni korisnici* lists restrictions with *Vrati oglas* / *Vrati pristup* (restore). Empty: *"Nema otvorenih prijava"*. States D L E X apply to every tab.

**S32 Šapa pomoći** — `/sapa-pomoci`, FR-61 (EP-73). AppShell when signed in, `PublicShell wide` when signed out (the state switcher shows both). Header: h1 *Šapa pomoći*, one line, *Moji oglasi* (outline) and *Novi oglas* (primary). Filters: type chips in a scroll strip (*Sve*, *Potrebe azila*, *Poklanjam*, *Prodajem*, *Tražim*), then three Selects in `grid-cols-1 sm:grid-cols-3` — *Kategorija* (Hrana, Oprema i igračke, Nameštaj za ljubimce, Transporteri, Lekovi i nega — only offered with *Sve* or *Potrebe azila*, Ostalo), *Za koga* (Psi, Mačke, Ostale životinje), *Grad* (city list). Result line *"48 oglasa · najnoviji prvo"*, `ListingCard` grid (1 / 2 / 3 columns), offset pagination *Prethodna · Strana 1 od 3 · Sledeća*. Listings of blocked users never appear (BR-59). Mock data: Azil „Druga šansa“ *Potrebno 20 kg granula za odrasle pse*; *Poklanjam grebalicu za mačke, Bečej*; *Prodajem transporter za psa* 2.500 RSD; *Tražim kavez za zeca*; more needs/gifts across Novi Sad, Bečej, Beograd, Subotica. States D, O (sign-in card *"Oglase možeš da pregledaš i bez naloga. Prijavi se da pošalješ poruku, objaviš oglas ili doniraš azilu."* + *Prijavi se*; header actions hidden), L (card skeletons), E (*"Nema oglasa za ove filtere"* + *Poništi filtere*, or *"Još nema oglasa"* + *Novi oglas*), X, S (suspension card; header actions hidden).

**S33 Oglas** — `/sapa-pomoci/[id]`, FR-62, FR-66, FR-68, FR-70 (EP-74, EP-78, EP-82, EP-84, EP-85). Back link *← Šapa pomoći*. Detail + aside (`lg:grid-cols-[minmax(0,1fr)_320px]`). Main card: gallery (4:3 main photo, "1 / 4" counter, up to 5 thumbnails as `aria-pressed` buttons), tags (`ListingTypeTag`, category, species), h1 title, `⋯` menu (*Prijavi oglas*, *Blokiraj korisnika* — not for shelter needs), price as section heading (*2.500 RSD* / *Po dogovoru* / *Besplatno*), city, *Opis*, *"Objavljeno … · Aktivan do …"*. Aside: action card — selling/giving/seeking: *Pošalji poruku* → Dialog with a prefilled first message (≤ 2000, counter) → *"Poruka je poslata…"* + *Otvori razgovor* (if a conversation already exists, the button opens it — BR-61); need: *Doniraj* (primary) + *Pošalji poruku azilu* (outline); author card (initials avatar — square for shelters, display name, city · *član od septembra 2026.*, *Aktivnih oglasa: N*, *Pogledaj profil* → S37, or *Javna stranica azila* → S23 for shelters); safety tip card (*"Stvari razmenjuj uživo i ne plaćaj unapred nepoznatim osobama…"*). **Doniraj Dialog** (FR-66): title *Doniraj: Azil „Druga šansa“*, line *"Novac ne prolazi kroz Moj Ljubimac…"*, three `bg-foreground/5` blocks — *Uplata na račun* (account in card-title size + *Kopiraj* → *Kopirano*, recipient, purpose), *Online uplata* (*Uplati online* external link), *Donošenje u azil* (address, hours) — each block omitted when its field is empty; footer *Pošalji poruku azilu* · *Zatvori*. The button exists only when EP-74's donation flag is set. States D (selling), need, O (*"Prijavi se da pošalješ poruku"* primary + *Napravi nalog* link; menu hidden), own listing (*"Ovo je tvoj oglas"*: *N razgovora o oglasu* → S36, *Izmeni oglas* → S34, *Produži 30 dana*, *Označi kao rešeno* → AlertDialog; no message button — `cannot_message_self`), resolved (*Rešeno — Prodato* pill, *"Oglas više nije aktivan"*, messaging hidden), S (*"Poruke nisu dostupne"*), L, X, unavailable (hidden, expired or blocked author → EmptyState *"Oglas nije dostupan"*; blocking from the menu ends here).

**S34 Novi / izmeni oglas** — `/sapa-pomoci/nova`, `/sapa-pomoci/[id]/izmeni`, FR-63, FR-64 (EP-75, photos via EP-13 `listing_photo`). `max-w-3xl` form; subline with the active counter (*"Aktivni oglasi: 1 / 3 na Free planu"*; shelters *"bez ograničenja broja oglasa"*). Cards: *Vrsta oglasa* — RadioGroup as bordered option tiles with `ListingTypeTag` + one-line hint (*Poklanjam*, *Prodajem*, *Tražim*; *Potreba* only for members of an approved shelter — owners see *"Potrebe sa dugmetom „Doniraj“ objavljuju samo odobreni azili."*); *Osnovno* — *Naslov\** (5–80, counter), *Opis\** (≤ 1000, counter), *Kategorija\** (*Lekovi i nega* offered only for *Potreba*; switching type away clears it), *Za koga\**, *Grad\** (city list); *Cena* (selling only) — RSD Input + *Po dogovoru* Checkbox (disables the amount), note that payment is arranged between people; *Fotografije* — up to 5 square tiles (first labelled *Naslovna*, remove icon button), dashed *Dodaj* tile, *"N / 5"*, JPG/PNG ≤ 10 MB; for needs an info card linking to S29 *Donacije*; expiry line *"Oglas je aktivan 30 dana. Tri dana pre isteka šaljemo ti mejl da ga produžiš."*. Footer *Otkaži* · *Objavi oglas* (edit: *Sačuvaj izmene*, plus *Obriši oglas* → AlertDialog *Da, obriši*). Validation inline on blur and submit. States D, shelter (Organisation shell, *Potreba* selected), edit, invalid (inline errors), X (alert *"Oglas nije sačuvan — veza je prekinuta…"*), G (4th active listing on Free → `PremiumLock` over the blurred form, `premium_required:listings`), S (*"Ne možeš da objavljuješ oglase"* card instead of the form).

**S35 Moji oglasi** — `/sapa-pomoci/moje`, FR-64, FR-65 (EP-76, EP-77). Header with *Novi oglas* (hidden when the Free limit is reached or suspended). Counter card *"Aktivni oglasi 2 / 3"* + `Progress` + *"Na Free planu imaš do 3 aktivna oglasa. Sakriveni oglasi se ne računaju. Premium: bez ograničenja."* (hidden for Premium/shelters in production). Tabs *Aktivni (N)* (active + hidden), *Istekli (N)*, *Rešeni (N)*. Row card: thumbnail, `ListingTypeTag` + status pill (*Aktivan*, *Ističe za 3 dana*, *Sakriven*, *Istekao*, *Rešeno*), title (link to S33, 2 lines), price · *Aktivan do …* / *Istekao …* / *Poklonjeno 28. 09. 2026.*, `⋯` menu (*Izmeni*, *Označi kao rešeno* → AlertDialog naming the type's outcome — *Poklonjeno / Prodato / Donirano / Pronađeno*, *Obriši* → AlertDialog); hidden listings show the Operator's reason on `bg-foreground/5`; footer *"Razgovora: N · nepročitano: N"* → S36 and *Produži 30 dana* (primary when ≤ 3 days left) or, for expired, *Objavi ponovo (30 dana)* — disabled with an explanation when the Free limit is reached. States D L E (*"Još nemaš aktivnih oglasa"* + *Novi oglas*, per tab) X G (3 / 3 → `PremiumLock` card above the list) S (banner; edit/extend hidden, delete allowed).

**S36 Poruke** — `/poruke`, `/poruke/[id]`, FR-68, FR-69, FR-70 (EP-80…EP-85). h1 *Poruke* above one Card. **lg:** two panes `lg:grid-cols-[320px_minmax(0,1fr)]`, fixed 640 px height, each pane scrolls. **Phones:** one pane — the inbox; tapping a row opens the thread with a 44 px back button (*"Nazad na razgovore"*). Inbox row: initials avatar (square for shelters), display name (semibold when unread), time (*14:32*, *Juče*, *16. 10.*), listing title (*"Tvoj oglas: …"* when the user is the author), last message (*"Ti: …"* for own), unread count pill. Thread header: avatar, name → S37 (or S23 for shelters), listing title → S33 (*"· oglas više nije aktivan"* when resolved/expired), `ListingTypeTag` (from `sm`), `⋯` menu *Prijavi korisnika* / *Blokiraj*. Messages: day separator, own bubbles `bg-primary text-primary-foreground` right, others `bg-foreground/5` left, time and *"· Pročitano"* on own read messages (EP-83), screen-reader prefix *"Ti:"* / name. Composer: Textarea (2 rows, ≤ 2000) + 44 px send icon button, *"Samo tekst · N / 2000"*, inline error when empty; `rate_limited` (30 messages / hour) and `user_blocked` show as an inline error under the composer. States D, thread open (phone), L, E (*"Još nema poruka"* + *Pogledaj oglase*), X, B (*"Blokirao/la si korisnika …"* + *Odblokiraj*, composer hidden, inbox row shows *Blokiran korisnik*), S (banner; old messages readable, composer replaced by a note).

**S37 Profil korisnika** — `/korisnik/[id]`, FR-67, FR-70 (EP-79). AppShell signed in, `PublicShell wide` signed out. Header card: 80 px initials avatar, h1 display name (*Marko J.*), city, *"Član od septembra 2026."*, *"Aktivnih oglasa: 3"*, `⋯` menu (*Prijavi korisnika*, *Blokiraj*; hidden signed out), line *"Mejl i telefon se ne prikazuju. Javi se porukom iz nekog od oglasa."* Section *Aktivni oglasi* — `ListingCard` grid. Shelters have no S37 (their author link goes to S23). States D, O, L, E (*"Trenutno nema aktivnih oglasa"*), X, B (`ReadOnlyBanner` *"Blokirao/la si ovog korisnika…"* + *Odblokiraj*, listings hidden), unavailable (suspended or deleted → *"Profil nije dostupan"*).

---

## 13. Open Questions

| ID | Origin | Question | Blocking for API Contract? |
|---|---|---|---|
| OQ-01 | Brief | Metric targets. | No |
| OQ-03 | Brief | ✅ Resolved (v1.7, owner, 2026-10-29): EUR, VAT added by Paddle — Premium 3 € / month, 30 € / year; breeder 11 € / month, 110 € / year (PRD BR-62). | — |
| OQ-04 | Brief | Partner pricing. | No |
| OQ-09 | Design | ✅ Resolved (v1.1): logo supplied and integrated. An SVG version is still welcome but not blocking. | — |
| OQ-10 | Design | `[NEEDS CLARIFICATION]` Approve the proposed composites in §6 (DateField, compact PremiumLock, AttachmentChip, StatusBadge statuses, LogoAvatar, InlineAlert, Toaster in shells). | No |
| OQ-15 | Design (CR-21) | `[NEEDS CLARIFICATION]` The owner (with a lawyer) must supply the privacy policy and terms of use texts for S30 and S31, in Serbian and English. Until then the sections carry the placeholder *"Tekst dostavlja vlasnik (OQ-15)."* | No — blocks only Release (Step 32), not building |

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
| Šapa pomoći | CAP-08 / EPIC-08 (EN "Helping Paw"): the community board where signed-in users give, sell or seek pet items and shelters post needs; public to browse. |
| Oglas (Listing) | One Šapa pomoći post of type *Potreba*, *Poklanjam*, *Prodajem* or *Tražim*; active 30 days, then expired unless extended; can be marked *Rešeno*. |
| Potreba (Need) | A shelter-only listing type with a *Doniraj* button that shows the shelter's donation info. |
| Podaci za donacije (Donation info) | Shelter bank account, payment link, drop-off address and drop-off hours, edited in S29 and shown by *Doniraj*; money never passes through the app. |
| Razgovor (Conversation) | The 1:1 text thread between a listing's author and one interested user (one per listing + user), shown in S36. |
| Prijava (Report) / Blokiranje (Block) | A user's report of a listing or user to the Operator (S26 *Moderacija*); a block stops the other user from messaging you and hides their listings for you. |
| Isključenje iz Šape pomoći (Suspension) | Operator action: the user can no longer publish or message, and their listings are hidden; the rest of the app is unaffected. |
| ListingTypeTag / ListingCard | The Šapa pomoći type pill and grid card composites (§6). |
| `--info-soft` | The pastel surface of the *Tražim* tag; no status meaning. |

---

## 15. Appendix

_None for v1._
