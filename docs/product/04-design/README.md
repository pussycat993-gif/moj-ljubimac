# 04-design — Living mockup screens

Mock screens for Moj Ljubimac. Binding rules: `../04-design-system.md`. UI copy in Serbian (Latin); inline mock data only; every screen with more than one state has a dev-only **Prikaz stanja** switcher to preview them (S30 / S31 have one state).

## How to run
1. In the Next.js project (ADR-01, ADR-14), install the shadcn components listed in design system §6 and apply the two overrides in `ui-overrides/`.
2. Use `globals.css` as `app/globals.css` and load Nunito + Inter with `next/font/google` (`latin`, `latin-ext`).
3. Copy `assets/logo-*.png` and `assets/app-icon-*.png` into `public/brand/`.
4. Copy `components/` and `screens/` into the project (e.g. `design/`), then mount a screen: `import Screen from "@/design/screens/pets-home"`.

## Verification (2026-10-19)
Ran in a throwaway Next.js 16 / Tailwind v4 / shadcn preview app:
- `tsc --noEmit`: 0 errors.
- `next build`: all 31 routes built.
- Headless Chromium at **375 px** and **1440 px**, every state of every screen's switcher (activated with real pointer clicks and checked to be active — since v1.5; Radix tabs ignore a synthetic `element.click()`): no horizontal overflow, exactly one `h1`, no runtime errors (only expected 404s from links prefetching real app routes that don't exist in the preview).
- Tokens bind: pet accent resolves (`rgb(190 24 93)` for a female pet), `bg-foreground/5` emits a `color-mix` 5 % overlay, `shadow-soft` / `shadow-raised` generated.
- Fixed during verification: implicit grid tracks overflowing phones (system now requires `grid-cols-1`), large avatar initial size.
- Not verified: real screen-reader pass and keyboard-only walkthrough (NFR-04) — do one before launch.

## Index

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
| S30 | EPIC-05 | Politika privatnosti | `/privatnost` | Release Criterion 4 | P | `privacy.tsx` |
| S31 | EPIC-05 | Uslovi korišćenja | `/uslovi` | Release Criterion 4 | P | `terms.tsx` |
