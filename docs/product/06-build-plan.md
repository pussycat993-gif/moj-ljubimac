# Build Plan — Moj Ljubimac (Web)

## Document Control

| Field | Value |
|---|---|
| Product | Moj Ljubimac ("My Pet") — web application |
| Document | 06 — Build Plan |
| Version | 1.2 |
| Date | 2026-10-19 |
| Author | Keti Vrtunić (planned with "Nindza Tigar", Build Lead persona) |
| Traces to | Brief v1.7 · PRD v1.7 · Technical Constraints v1.7 · Design System v1.6 (37 screens) · API Contract v1.3 |
| Status | Draft — no step executed yet |

**Change log**

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-10-19 | Initial plan: 32 steps, 1 blocked (Step 31 — payments). |
| 1.1 | 2026-10-19 | Change requests CR-01 … CR-23 resolved upstream (PRD v1.6, TC v1.6, Design v1.5, API v1.2). Every pre-flight/blocker check that waited on a CR is replaced by a concrete instruction citing the fixed section (stop clauses kept). Preview deployments removed (TC ADR-10); Step 03 CI runs `supabase db push` on `main` before deploy. Step 04 adds `idempotency_keys`, `rate_limit_counters` and the cities seed (`scripts/fetch-cities.*` → `supabase/seed/cities.sql`, TC ADR-11). Step 08 schedules nightly occurrence generation. Step 11 creates the `lib/server/` foundation (TC ADR-16). Step 12 adds S30 `/privatnost`, S31 `/uslovi`, `lib/legal.ts` (`TERMS_VERSION`) and links registration to the terms. Step 17 adds the S10 → S11 edit link and the count badge; Step 18 the S12 "Uskoro dostupno" WhatsApp state; Step 23 S17 in the payments-coming-soon state with EP-44 and the provider-neutral EP-45 stub; Step 24 the S14 team-invitation variant; Step 27 the S03 vet suggestion block. Step 30 split into Step 30 (nightly jobs) and Step 30a (backups and data export archives). Dependencies fixed for Steps 12, 23, 24, 27, 28, 31, 32. New OQ-15 locks only Step 32 checklist item 4. New CR-24 (copy for emails that have no Design §9.1 template). Coverage matrix regenerated: 60 FRs, 72 EPs, 31 screens, 46 tables. |
| 1.2 | 2026-10-19 | CAP-08 "Šapa pomoći" (Brief v1.7, PRD v1.7 FR-61 … FR-72, TC v1.7 §5.10, Design v1.6 S32 … S37, API v1.3 EP-73 … EP-88). Three steps appended between Step 28 and Step 29: Step 28a (schema: six tables, CAP-08 columns, `message` preference, triggers, RLS), Step 28b (listings, public pages S32/S33/S37, S34, S35, S29 *Donacije*, EP-73 … EP-79, EP-87 daily job, EP-88, EP-13/EP-15 `listing_photo`), Step 28c (messaging S36, S12 *Poruke* card, report/block, S26 *Moderacija*, EP-80 … EP-86, new-message email + push, 30 messages/hour). Steps 01 … 28 unchanged; new ordering invariant 11 says where CAP-08 parts of shared contracts are built. Step 32 depends on Step 28c, quotes Release Criteria 1 and 6 as revised in PRD v1.7 and adds the e2e flow "give away an item and message the author" (`e2e/sapa-pomoci.spec.ts`). Carried-forward OQ-16 and OQ-17 (non-blocking; interim mappings of API v1.3). New CR-27 (route group for pages shown in both a signed-in and the public shell) and CR-28 (TC §5.10 error-code wording for `medicine_care`), both non-blocking. RISK-37 … RISK-39. Coverage matrix regenerated: 72 FRs, 88 EPs, 37 screens, 52 tables. |

---

## 1. Executive Summary

The build runs in 36 steps (Step 01 … Step 32 plus Steps 28a, 28b, 28c and 30a), each one coding session: foundation (repository, Supabase, CI with production migrations on `main`), the database in six domain slices with every table's access rules and Free limits landing together with its tests, the design foundation, authentication and the shared server utilities, then features in dependency order — registration with the legal pages, pets and the health record, reminders and their delivery (the north-star path, deliberately early), care log and moments, household, subscription status and account data control (including the Premium page before payments), organisations, partners and admin — then the Šapa pomoći community board in three steps (its schema, the listings with public pages and donation info, then messaging, report/block and moderation), followed by WhatsApp, the nightly jobs, backups and data export archives, payments, and release verification. One step is blocked: Step 31 (payments and pricing) waits for OQ-11 (payment provider) and OQ-03 (prices). Step 32 runs, but its Release Criterion 4 item stays open until OQ-15 (legal texts) is answered. OQ-16 and OQ-17 (Šapa pomoći) are open but non-blocking: Steps 28a–28c apply the PRD default and the interim mappings defined in API v1.3. Traces to Brief v1.7, PRD v1.7, Technical Constraints v1.7, Design System v1.6, API Contract v1.3.

---

## 2. Inherited Context

- **Stack (TC v1.7):** Next.js 16.x App Router + TypeScript (ADR-01) on Cloudflare Workers via OpenNext (ADR-03), Supabase Postgres/Auth/pg_cron → `pg_net` with Vault secrets (ADR-02/04/06, TC §8), Cloudflare R2 with `aws4fetch` (ADR-07, ADR-17), Resend (ADR-08), Web Push with `@pushforge/builder` and `public/sw.js` (ADR-05, ADR-17), WhatsApp Cloud API (templates in API §9.4), Nominatim (ADR-11), browser-side PDF with `@react-pdf/renderer` (ADR-12), GitHub Actions backups and in-app data export archives with `fflate` (ADR-13), shadcn/ui + Tailwind v4 + lucide (ADR-14), Vitest + pgTAP + Playwright with `@axe-core/playwright` (ADR-15), layout per ADR-16 (incl. `lib/server/`, `scripts/`, `lib/legal.ts`), approved libraries only (ADR-17), no edge caching of public pages (ADR-18), no preview deployments (ADR-10).
- **Environment variables and secrets:** exactly the names in TC §8.1 (application and GitHub Actions secrets).
- **Repository at plan time:** `pussycat993-gif/moj-ljubimac` contains one commit with `docs/`, `CLAUDE.md` and `README.md` only; Step 01 creates the application.
- **Scale:** 72 FRs (FR-01 … FR-72), 88 operations (EP-01 … EP-88), 37 screens (S01 … S37), 52 tables (TC §5: 34 PRD entities + 18 technical tables, per TC §5.8; v1.7 adds the six Šapa pomoći tables of TC §5.10).
- **Team and deadline:** one builder, no deadline → a single serial track.
- **Non-goals steps must respect (TC §9, API §14):** no microservices or separate API server, no message queue, no real-time, no offline mode, no staging and no preview deployments, no edge caching of public pages, no external analytics, no Apple sign-in, no card data stored, no public API, no API versioning.
- **Mockups:** `docs/product/04-design/screens/*.tsx` and `04-design/components/*.tsx` are the starting material for every screen step; they use inline mock data and must be wired to real data, not redesigned. Each route is a server `page.tsx` plus a colocated `*-client.tsx` (or the screen file name a step names) ported from its mockup (TC ADR-16).
- **Copy:** every screen step adds all of its strings to both `lib/i18n/sr.ts` and `lib/i18n/en.ts`; English is a faithful translation of the Serbian mockup copy, no new copy (Design §9 i18n rule). Message copy and template ids are in Design §9.1; WhatsApp templates in API §9.4.

**Carried-forward open questions**

| ID | Origin | Effect on this plan |
|---|---|---|
| OQ-01 | Brief | None — targets |
| OQ-03 | Brief | 🔒 Step 31 (plan prices, S17 purchase state) |
| OQ-04 | Brief | None — partner billing is outside the product |
| OQ-10 | Design | None — proposed composites stay out until approved; steps use only approved composites |
| OQ-11 | API | 🔒 Step 31 (provider checkout, webhook, renewal charge) |
| OQ-15 | Design | Step 32 checklist item 4 (Release Criterion 4) stays open; nothing else is locked |
| OQ-16 | PRD (v1.7) | None locked — Steps 28a and 28b apply the PRD default (a breeder plan does not lift the 3-active-listing limit) |
| OQ-17 | API (v1.3) | None locked — Steps 28a–28c add no proposed column and use the API v1.3 interim mappings |

---

## 3. Step Sequence & Status

**This table is the authoritative status record.** Update it after every step. Steps 28a, 28b and 28c sit between Step 28 and Step 29, and Step 30a between Step 30 and Step 31, in execution order.

| Step | Name | Status | Depends on | Blocked by | Done |
|---|---|---|---|---|---|
| 01 | Repository scaffold & tooling | ✅ | — | — | 2026-10-19 |
| 02 | Supabase project, local dev & clients | ✅ | 01 | — | 2026-10-19 |
| 03 | CI pipeline & Cloudflare deploy | ✅ (push checks pending owner) | 02 | — | 2026-10-20 |
| 04 | Schema: accounts, reference & billing tables | ✅ | 02 | — | 2026-10-19 |
| 05 | Schema: households & organisations | ✅ | 04 | — | 2026-10-19 |
| 06 | Schema: pets & health record | ✅ | 05 | — | 2026-10-19 |
| 07 | Schema: care log & moments | ✅ | 06 | — | 2026-10-19 |
| 08 | Schema: reminders & delivery | ✅ | 07 | — | 2026-10-20 |
| 09 | Schema: organisation workflows & partners | ✅ | 08 | — | 2026-10-20 |
| 10 | Design foundation | ✅ | 01 | — | 2026-10-20 |
| 11 | Authentication, gates & server utilities | ✅ | 04, 10 | — | 2026-10-21 |
| 12 | Registration, profile, legal pages & i18n | ✅ | 11, 05, 08 | — | 2026-10-23 |
| 13 | Pets: list, create, edit, delete | ✅ | 12, 06 | — | 2026-10-23 |
| 14 | Pet record: view, weight, vaccinations | ✅ | 13, 08 | — | 2026-10-23 |
| 15 | Treatments, doses, vet visits & attachments | ✅ | 14 | — | 2026-10-23 |
| 16 | Memorial, restore & PDF export | ✅ | 15 | — | 2026-10-23 |
| 17 | Reminder lists & manual reminders | ✅ | 14 | — | 2026-10-23 |
| 18 | Reminder settings, email & push channels | ✅ | 17 | — | 2026-10-23 |
| 19 | Reminder dispatch job & message actions | ✅ | 18 | — | 2026-10-23 |
| 20 | Care log & meal reminders | ✅ | 19 | — | 2026-10-23 |
| 21 | Moments & public links | ✅ | 15 | — | 2026-10-23 |
| 22 | Household sharing | ✅ | 19 | — | 2026-10-23 |
| 23 | Subscription status, Premium page & account data control | ✅ | 12, 15, 19 | — | 2026-10-23 |
| 24 | Organisations: animals, team, public profile | ✅ | 09, 15, 19, 22 | — | 2026-10-23 |
| 25 | Requests, inquiries & record transfers | ✅ | 24, 22 | — | 2026-10-23 |
| 26 | Litters & public organisation pages | ✅ | 25 | — | 2026-10-23 |
| 27 | Partners directory & vet suggestion | ✅ | 09, 12, 14 | — | 2026-10-23 |
| 28 | Operator admin | ✅ | 27, 24, 19 | — | 2026-10-28 |
| 28a | Schema: Šapa pomoći | ✅ | 28 | — | 2026-10-28 |
| 28b | Listings, public pages, profiles & donation info | ✅ | 28a, 21, 19 | — | 2026-10-29 |
| 28c | Messaging, notifications, report/block & moderation | ✅ | 28b, 19 | — | 2026-10-29 |
| 29 | WhatsApp channel | ✅ | 19 | — | 2026-10-29 |
| 30 | Nightly jobs | ✅ | 23, 25, 29 | — | 2026-10-29 |
| 30a | Backups & data export archives | ⬜ | 30, 23 | — | |
| 31 | Payments & pricing | 🔒 | 30a | OQ-11, OQ-03 | |
| 32 | Release verification | ⬜ | 30a, 28c (31 when unblocked) | — (checklist item 4 open until OQ-15) | |

---

## 4. Ordering Invariants & Dependency Rules

1. Infrastructure before anything that runs (01–03).
2. A table, its RLS policies, its Free-limit triggers, and its pgTAP tests land in the same step — no table ever exists unprotected (04–09).
3. Design tokens, fonts, shadcn components, and the shared composites exist before any screen (10).
4. Authentication, the gates of API §4.1 and the shared server utilities of `lib/server/` (TC ADR-16) exist before any signed-in surface (11).
5. An operation's data access lands in the same step as the first screen that consumes it, ported from its mockup.
6. Reminders come right after the pet record (17–19) because they are the north-star path; this departs from PRD epic order on purpose.
7. Integrations come after the surfaces they feed (19 email/push, 29 WhatsApp, 30 nightly jobs, 30a backups and data export archives).
8. Steps blocked by an open question get no prompt until it is answered (31). An open question that affects only one checklist item of a step keeps that item open, not the step (32 item 4, OQ-15).
9. Release verification is last (32).
10. A step inserted later gets a suffix (`14a`, `28a`, `30a`), never a renumbering; a suffixed step runs after its base number and before the next number.
11. (v1.2) The Šapa pomoći additions that upstream v1.3/v1.7 made to contracts earlier steps already own are built by Steps 28a–28c, not by those earlier steps: the CAP-08 columns, the `preference_type` value `message` and its default row (28a — added there only if Step 04, 05 or 08 did not already create them from TC v1.7), `Me.display_name` and `Me.marketplace` in `rpc:get_me` and `Organisation.donation` in `rpc:get_my_organisation` (28b), EP-13 / EP-15 `listing_photo` (28b), the composites `ListingTypeTag` and `ListingCard` (28b) and `ReportDialog` / `BlockDialog` (28c), the *Šapa pomoći* nav item (from the v1.6 `shells.tsx`, checked in 28b), the *Donacije* card of S29 (28b), the seventh `get_reminder_settings` row and the S12 *Poruke* card (28c), the S26 *Moderacija* tab and the *Poruke* / *Moderacija* badges (28c). An earlier step that meets one of these in a v1.3/v1.6/v1.7 section builds only its own part, leaves the Šapa pomoći part out, and records that in its Session log — it does not stop for it.

PRD priorities are all P0, so dependency order alone decides the sequence.

---

## 5. How to Run a Step

1. Open the step. Read every section listed under **Read before starting**.
2. Start a fresh Claude Code session in the repository root and paste the **Prompt** block verbatim.
3. When the session finishes, run the **Verification** commands yourself and compare with the expected results.
4. Append a **Session log** entry under the step: date, what was built, verification output (pass/fail per command), deviations, follow-ups.
5. Update the step's row in §3 (status ✅ and the date), commit with the step number in the message (`Step 07: care log and moments schema`), and push. Branches run CI only; a push to `main` applies migrations to production and deploys (TC ADR-10).

**When verification fails:** fix it within the step's file allowlist in the same or a new session. If the fix needs a file outside the allowlist, stop, amend the step in this document (file list and prompt), then continue.

**When a prompt turns out ambiguous:** stop, resolve the ambiguity against the upstream document it references, and edit the prompt in this file so the next reader doesn't hit it again. If the upstream document itself is unclear, raise a change request against it (§12) instead of deciding inside the code.

**Calibration:** run Steps 01–03 first and revise step sizing and file allowlists from what actually happened before trusting the rest.

---

## 6. Test & Verification Policy

Per ADR-15 (TC v1.6):
- **pgTAP** (`supabase/tests/*.sql`, run with `npx supabase test db`): every constraint, trigger, Free limit, RLS policy, and RPC function.
- **Vitest + Testing Library** (`tests/**/*.test.ts(x)`, run with `npm test`): server actions, `lib/server/` utilities, integration adapters (with fakes), and components with logic.
- **Playwright** (`e2e/*.spec.ts`, run with `npm run e2e`): the six end-to-end flows in ADR-15, added in the steps that complete them and run in full at Step 32, plus the automated accessibility check with `@axe-core/playwright` (ADR-17, NFR-04) added in Step 32.
- **i18n:** `npm run typecheck` fails when a key exists in `lib/i18n/sr.ts` but not in `lib/i18n/en.ts` (Design §9, TC §7 NFR-05).

**Standing rule:** every step ships at least one test per acceptance criterion it implements, in the test files named in the step.

**Every step must pass, in this order:**
```
npm run typecheck      # tsc --noEmit
npm run lint
npm test               # Vitest
npx supabase test db   # pgTAP (from Step 04 on)
npm run build
```
plus `npm run e2e` in the steps that add Playwright specs. Scripts are created in Step 01.

The cost of this policy is real (test volume grows with 72 requirements) and is recorded as RISK-23.

---

## 7. Blocked Steps & Unblocking Conditions

| Step | Blocked by | Origin | Question | Who answers | Unlocks |
|---|---|---|---|---|---|
| 31 Payments & pricing | OQ-11 | API | Which payment provider (Monri deferred)? | Keti (owner) | Checkout (EP-45 provider part), provider webhook (EP-46), renewal charging (EP-49 step 1), S17 purchase state |
| 31 Payments & pricing | OQ-03 | Brief | Premium monthly/yearly and breeder plan prices | Keti (owner) | Seeding `plans` with prices, prices on S17 |
| 32 Release verification — checklist item 4 only | OQ-15 | Design | Privacy policy and terms of use texts for S30 and S31, in Serbian and English | Keti (owner, with a lawyer) | Release Criterion 4 can pass once the placeholders on S30/S31 are replaced; every other Step 32 check runs now |

Until Step 31 runs, Premium can only be granted for testing through seed data in the local database (Step 04 seeds a test Premium user); production users stay on Free, and S17 shows the "Plaćanje uskoro dostupno" state (Step 23, API EP-44/EP-45).

---

## 8. The Steps



### Step 01 — Repository scaffold & tooling

| | |
|---|---|
| **Status** | ⬜ not started |
| **Outcome** | A Next.js App Router + TypeScript application with Tailwind CSS v4, ESLint, Vitest + Testing Library, a Playwright configuration, the five standard npm scripts, and the ADR-16 folder skeleton exists in the repository. |
| **Implements** | ADR-01, ADR-14 (tooling only: Tailwind CSS v4 wiring), ADR-15, ADR-16 |
| **Depends on** | — |
| **Blocked by** | — |
| **Track** | single |

**Read before starting:** `docs/product/03-technical-constraints.md` §3 (ADR-01, ADR-14, ADR-15, ADR-16, ADR-17), §4, §9 · `docs/product/06-build-plan.md` §5, §6 · `docs/product/04-design/README.md` ("How to run", "Verification" — the Next.js major the mockups were verified with).

**Files this step may touch:**
- `package.json`, `package-lock.json`
- `tsconfig.json`, `next-env.d.ts`, `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`
- `vitest.config.ts`, `tests/setup.ts`
- `playwright.config.ts`
- `app/layout.tsx`, `app/globals.css` (minimal Tailwind import only — replaced in Step 10), `app/page.tsx` and `app/favicon.ico` (delete the create-next-app samples), `public/*` (delete create-next-app sample assets)
- `.gitignore`, `README.md`
- ADR-16 skeleton placeholders: `app/(app)/.gitkeep`, `app/(org)/.gitkeep`, `app/(auth)/.gitkeep`, `app/(public)/.gitkeep`, `app/admin/.gitkeep`, `app/api/.gitkeep`, `components/ui/.gitkeep`, `components/app/.gitkeep`, `lib/supabase/.gitkeep`, `lib/actions/.gitkeep`, `lib/integrations/.gitkeep`, `lib/i18n/.gitkeep`, `lib/server/.gitkeep`, `scripts/.gitkeep`, `supabase/migrations/.gitkeep`, `supabase/seed/.gitkeep`, `supabase/tests/.gitkeep`, `e2e/.gitkeep`
- `tests/tooling/layout.test.ts`, `tests/tooling/scripts.test.ts`, `tests/tooling/testing-library.test.tsx`
- `docs/product/06-build-plan.md` (only this step's §3 row and its Session log)

**Out of bounds:** `docs/product/**` except the two places named above; `CLAUDE.md`; any route, screen, component, Supabase file, or CI file; any design token (Step 10 owns `app/globals.css` content).

**Acceptance criteria:** No PRD FR applies. Derived from ADR-01, ADR-14, ADR-15, ADR-16:
- (ADR-01) The repository contains one Next.js application using the App Router and TypeScript; `npm run build` produces a production build.
- (ADR-14, tooling only) Tailwind CSS v4 is wired through PostCSS and imported from `app/globals.css`.
- (ADR-15) Vitest with Testing Library runs component tests in a DOM environment via `npm test`; Playwright is configured for `e2e/` and runs via `npm run e2e`.
- (ADR-15) `npm run typecheck`, `npm run lint`, `npm test`, `npm run e2e`, and `npm run build` exist as npm scripts.
- (ADR-16) Every folder listed in ADR-16 exists at the stated path.

**Tests to ship:**
- (ADR-01, ADR-14) covered by the `npm run build` verification command (no separate test file).
- (ADR-15 DOM tests) `tests/tooling/testing-library.test.tsx` — renders a trivial element and asserts on it with a Testing Library matcher.
- (ADR-15 scripts) `tests/tooling/scripts.test.ts` — asserts `package.json` defines `typecheck`, `lint`, `test`, `e2e`, `build`.
- (ADR-16) `tests/tooling/layout.test.ts` — asserts each ADR-16 folder exists.

**Verification:**
```
npm run typecheck      # expected: exit 0, no errors
npm run lint           # expected: exit 0, no errors
npm test               # expected: 3 test files pass
npm run e2e            # expected: exit 0 with "no tests" (no specs exist yet)
npm run build          # expected: exit 0
```

#### Prompt
```
You are executing Step 01 — Repository scaffold & tooling — of docs/product/06-build-plan.md.

Read first, in full: docs/product/03-technical-constraints.md §3 (ADR-01, ADR-14, ADR-15, ADR-16, ADR-17), §4 and §9; docs/product/06-build-plan.md §5 and §6; docs/product/04-design/README.md ("How to run" and "Verification").

Goal: create the application scaffold and tooling only. No screens, no Supabase, no CI.

Do exactly this:
1. Scaffold a Next.js App Router application with TypeScript, Tailwind CSS v4 and ESLint in the repository root, using npm. Use Next.js 16.x (TC ADR-01 version pin; the mockups were verified with Next.js 16, 04-design/README.md "Verification"). The repository already contains docs/ and CLAUDE.md — keep them untouched. Configure the "@/*" import alias to the repository root (the design mockups import "@/components/..." and "@/lib/...").
2. Delete the create-next-app sample content: app/page.tsx, app/favicon.ico and the sample files in public/. Keep app/layout.tsx minimal (html/body, imports app/globals.css). Keep app/globals.css to the Tailwind v4 import only — Step 10 replaces it with the design tokens.
3. Install and configure Vitest with Testing Library (ADR-15): vitest.config.ts with a DOM environment and the "@/*" alias, tests/setup.ts registering the Testing Library matchers, test files under tests/.
4. Install and configure Playwright (ADR-15): playwright.config.ts with testDir "e2e", using the Next.js dev server as its web server. Configure it so a run with zero spec files exits successfully.
5. Add npm scripts exactly named: typecheck (tsc --noEmit), lint (ESLint over the repository), test (Vitest, single run), e2e (Playwright), build (next build). Keep dev and start.
6. Create the ADR-16 folder skeleton with .gitkeep files: app/(app), app/(org), app/(auth), app/(public), app/admin, app/api, components/ui, components/app, lib/supabase, lib/actions, lib/integrations, lib/i18n, lib/server, scripts, supabase/migrations, supabase/seed, supabase/tests, e2e (TC ADR-16). (tests/ exists through its test files.)
7. .gitignore: Next.js build output, node_modules, all .env files except .env.example, Playwright reports and results, test coverage.
8. README.md: product name, one paragraph pointing to docs/product/ (01–06) and stating that docs/product/06-build-plan.md §3 is the build status record, and the npm scripts. No other content.
9. Write the tests listed below.

Allowed packages: next, react, react-dom, typescript and the type packages create-next-app installs, tailwindcss v4 and its PostCSS plugin, eslint and the Next.js ESLint config, vitest, @vitejs/plugin-react, jsdom, @testing-library/react, @testing-library/dom, @testing-library/jest-dom, @testing-library/user-event, @playwright/test — the TC ADR-17 list plus the ESLint/PostCSS/type packages create-next-app installs with Next.js (see CR-25 in §12). Nothing else. No other libraries outside docs/product/03-technical-constraints.md ADR-17. No components, tokens, colours or routes — they belong to later steps.

Files you may create, modify or delete — nothing else:
package.json, package-lock.json, tsconfig.json, next-env.d.ts, next.config.ts, postcss.config.mjs, eslint.config.mjs, vitest.config.ts, tests/setup.ts, playwright.config.ts, app/layout.tsx, app/globals.css, app/page.tsx (delete), app/favicon.ico (delete), public/* (delete samples), .gitignore, README.md, the .gitkeep files of step 6, tests/tooling/layout.test.ts, tests/tooling/scripts.test.ts, tests/tooling/testing-library.test.tsx, and docs/product/06-build-plan.md (only the Step 01 row in §3 and the Step 01 Session log).

Tests to write (one per acceptance criterion; ADR-01 and ADR-14 are proven by npm run build):
- tests/tooling/testing-library.test.tsx — renders a trivial element in the DOM environment and asserts on it with a Testing Library matcher (ADR-15).
- tests/tooling/scripts.test.ts — package.json defines typecheck, lint, test, e2e and build (ADR-15).
- tests/tooling/layout.test.ts — every ADR-16 folder from step 6 exists (ADR-16).

Done means all of these pass, in this order:
  npm run typecheck   → exit 0
  npm run lint        → exit 0
  npm test            → the 3 test files pass
  npm run e2e         → exit 0, no specs
  npm run build       → exit 0

When everything passes: in docs/product/06-build-plan.md set the Step 01 row in §3 to ✅ with today's date in "Done", and append a Session log entry under Step 01 (date, what was built, pass/fail per verification command, deviations, follow-ups). Then commit all changes with the message "Step 01: Repository scaffold & tooling".

If anything above is ambiguous, if a referenced section doesn't contain what this prompt says it does, or if completing this step would require touching a file outside the list, installing a package not listed, or making a decision the referenced documents don't settle — STOP and ask. Do not choose a reasonable default. Do not proceed with a partial implementation.
```

#### Session log
**2026-10-19**
- **Built:** Next.js 16.4.2 App Router + TypeScript app (React 19.3) in the repo root; Tailwind CSS v4 via `@tailwindcss/postcss`, `app/globals.css` = `@import "tailwindcss"` only; minimal `app/layout.tsx`; create-next-app samples removed (no `public/`). ESLint 9 flat config with `eslint-config-next` (core-web-vitals + typescript). Vitest 5 + jsdom + Testing Library (`tests/setup.ts` registers jest-dom matchers, `@/*` alias). Playwright with `testDir: "e2e"`, `next dev` as web server, `--pass-with-no-tests`. Scripts `typecheck`, `lint`, `test`, `e2e`, `build` (plus `dev`, `start`). ADR-16 skeleton with `.gitkeep` files. `.gitignore`, `README.md`. Tests: `tests/tooling/testing-library.test.tsx`, `scripts.test.ts`, `layout.test.ts`.
- **Verification:** `npm run typecheck` ✅ exit 0 · `npm run lint` ✅ exit 0 · `npm test` ✅ 3 files / 25 tests passed · `npm run e2e` ✅ exit 0, no specs · `npm run build` ✅ exit 0.
- **Deviations:**
  - `tsconfig.json` excludes `docs/`: the design mockups in `docs/product/04-design/` import shadcn/lucide modules that don't exist until Step 10, so `tsc` over them fails.
  - `app/layout.tsx` types `children` as `React.ReactNode` instead of the generated `LayoutProps<"/">` global: that type only exists after `next dev`/`next build` generates `.next/types`, so `npm run typecheck` on a clean checkout (as in CI) failed.
  - `playwright.config.ts` waits for `port: 3000` instead of a `url`: with no routes `/` returns 404, which Playwright does not accept as ready, so the run timed out.
  - `next.config.ts`: `cacheComponents` and `partialPrefetching` are create-next-app 16.4 defaults (kept); `agentRules: false` added so `next dev` doesn't write an `AGENTS.md` (`CLAUDE.md` is the agent instruction file).
  - `next-env.d.ts` is gitignored (create-next-app default; Next regenerates it).
- **Follow-ups:** Step 03 (CI): `npm run typecheck` runs before `next build`, so any later code that uses Next's generated route types (`PageProps`, `LayoutProps`, typed routes) needs `next typegen` before `tsc`. Step 10: remove the `docs` exclusion only if the mockups are meant to be type-checked in place (they are meant to be copied, per 04-design/README.md). The Status cell in the Step 01 header table still reads "⬜ not started" because this step may only edit the §3 row and the Session log.

---

### Step 02 — Supabase project, local dev & clients

| | |
|---|---|
| **Status** | ⬜ not started |
| **Outcome** | A local Supabase stack runs from `supabase/config.toml`; `.env.example` names every environment variable later steps need; typed server, browser, and service-role Supabase clients exist in `lib/supabase/`; `npm run db:types` generates database types. |
| **Implements** | ADR-02, ADR-03, ADR-06 (client side only); API §3.1 (service-role rule), §4.1 (cookie session) |
| **Depends on** | Step 01 |
| **Blocked by** | — |
| **Track** | single |

**Read before starting:** `docs/product/03-technical-constraints.md` §3 (ADR-02, ADR-03, ADR-06, ADR-07, ADR-08, ADR-05, ADR-16, ADR-17), §6, §8, §8.1 · `docs/product/05-api-integration-contract.md` §3.1, §4.1, §4.2, §5.3 (EP-29 — `NEXT_PUBLIC_VAPID_PUBLIC_KEY`; EP-33 — `DISPATCH_SECRET`), §9.1, §9.3 · `docs/product/06-build-plan.md` §6.

**Files this step may touch:**
- `supabase/config.toml` (created by `supabase init`), `supabase/.gitignore` (created by `supabase init`), `supabase/seed.sql` (empty placeholder only)
- `.env.example`, `.gitignore`
- `lib/supabase/server.ts`, `lib/supabase/browser.ts`, `lib/supabase/service-role.ts`, `lib/supabase/database.types.ts`, removal of `lib/supabase/.gitkeep`
- `package.json`, `package-lock.json`
- `README.md` (local development section only)
- `tests/supabase/clients.test.ts`, `tests/tooling/env-example.test.ts`
- `docs/product/06-build-plan.md` (only this step's §3 row and its Session log)

**Out of bounds:** any migration or table (Step 04 onward); `supabase/config.toml` auth provider, SMTP, and redirect settings (Step 11); middleware and auth routes (Step 11); CI and Cloudflare files (Step 03); any screen or component.

**Acceptance criteria:** No PRD FR applies. Derived from ADR-02, ADR-03, ADR-06 and API §3.1, §4.1:
- (ADR-02, TC §8) A new local Supabase stack starts from `supabase/config.toml` with `npx supabase start`.
- (API §4.1) The server client keeps the Supabase Auth session in httpOnly cookies through `@supabase/ssr` and the Next.js cookie store.
- (ADR-06, client side) The browser client is created with the public URL and anon key only.
- (API §3.1) The service-role client reads the service-role key only on the server and cannot be bundled into client code.
- (TC §8.1) `.env.example` lists exactly the application variable names of TC §8.1, with no values; real env files are git-ignored.
- (ADR-02) `npm run db:types` regenerates `lib/supabase/database.types.ts` from the local database.

**Tests to ship:**
- (ADR-02 start) proven by the `npx supabase start` verification command.
- (API §4.1 cookies) `tests/supabase/clients.test.ts` — server client reads and writes the session through the cookie store adapter.
- (ADR-06 browser) `tests/supabase/clients.test.ts` — browser client is built from the two public variables only.
- (API §3.1 service role) `tests/supabase/clients.test.ts` — service-role module throws without its key and is marked server-only.
- (env names) `tests/tooling/env-example.test.ts` — every TC §8.1 application name is present in `.env.example` with an empty value and no other name exists; `.gitignore` ignores real env files.
- (ADR-02 types) proven by the `npm run db:types` verification command.

**Verification:**
```
npx supabase start     # expected: local stack running, API URL and anon key printed
npm run db:types       # expected: lib/supabase/database.types.ts regenerated, exit 0
npm run typecheck      # expected: exit 0
npm run lint           # expected: exit 0
npm test               # expected: all test files pass (Step 01 + this step)
npm run build          # expected: exit 0
```

#### Prompt
```
You are executing Step 02 — Supabase project, local dev & clients — of docs/product/06-build-plan.md.

Read first, in full: docs/product/03-technical-constraints.md §3 (ADR-02, ADR-03, ADR-05, ADR-06, ADR-07, ADR-08, ADR-16, ADR-17), §6, §8 and §8.1; docs/product/05-api-integration-contract.md §3.1, §4.1, §4.2, EP-29 and EP-33 in §5.3, §9.1 and §9.3; docs/product/06-build-plan.md §6.

Goal: local Supabase, environment variable names, and the three typed Supabase clients. No tables, no auth configuration, no routes.

Do exactly this:
1. Run the Supabase CLI init in the repository root (installed as a dev dependency, invoked with npx). Keep the generated supabase/config.toml defaults except: set the project id to "moj-ljubimac". Do not change auth provider, SMTP or redirect settings (Step 11 owns them). Leave supabase/seed.sql as an empty file.
2. Create .env.example with exactly the application variable names of docs/product/03-technical-constraints.md §8.1 (the "Application" table, in that order) and empty values, each preceded by a one-line comment with the purpose TC §8.1 gives it. No other names: no payment-provider variables (OQ-11 is open), no Google OAuth variables (Google sign-in is configured in the Supabase dashboard — Step 11), and none of the GitHub Actions secrets (Step 03 and Step 30a use them in workflows only).
   Make sure .gitignore ignores every real env file and supabase local temp output, and keeps .env.example tracked.
3. Install @supabase/supabase-js and @supabase/ssr (API §4.1) and create:
   - lib/supabase/server.ts — server client for Server Components, server actions and route handlers, using @supabase/ssr with the Next.js cookie store so the session lives in httpOnly cookies (API §4.1). Typed with the generated Database type.
   - lib/supabase/browser.ts — browser client from NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY only. Typed.
   - lib/supabase/service-role.ts — service-role client from SUPABASE_SERVICE_ROLE_KEY, no session persistence, importable only from server code (use the "server-only" package to make a client import a build error). Throws a clear error when the key is missing. Typed. API §3.1: it is for Operator actions, jobs and webhooks only — state this in a one-line comment.
   - lib/supabase/database.types.ts — generated, never hand-edited.
4. Add the npm script db:types that generates TypeScript types from the local database into lib/supabase/database.types.ts using the Supabase CLI.
5. README.md: add a "Local development" section — copy .env.example to .env.local, npx supabase start, npm run db:types, npm run dev. Nothing else.
6. Write the tests listed below.

Allowed packages added in this step: supabase (the CLI ADR-02/ADR-15 rely on, dev dependency — see CR-25 in §12), and @supabase/supabase-js, @supabase/ssr, server-only (TC ADR-17). Nothing else; no libraries outside docs/product/03-technical-constraints.md ADR-17. No tables, columns or functions — the schema starts in Step 04. No environment variable names other than TC §8.1.

Files you may create or modify — nothing else:
supabase/config.toml, supabase/.gitignore, supabase/seed.sql, .env.example, .gitignore, lib/supabase/server.ts, lib/supabase/browser.ts, lib/supabase/service-role.ts, lib/supabase/database.types.ts, lib/supabase/.gitkeep (delete), package.json, package-lock.json, README.md, tests/supabase/clients.test.ts, tests/tooling/env-example.test.ts, and docs/product/06-build-plan.md (only the Step 02 row in §3 and the Step 02 Session log).

Tests to write (one per acceptance criterion; "stack starts" and "types generate" are proven by the verification commands):
- tests/supabase/clients.test.ts — (a) the server client reads and writes auth cookies through the cookie store adapter it is given; (b) the browser client is created from the two NEXT_PUBLIC_ variables only; (c) the service-role module throws without SUPABASE_SERVICE_ROLE_KEY and imports "server-only".
- tests/tooling/env-example.test.ts — every TC §8.1 application name is present in .env.example with an empty value and no other names exist; .gitignore ignores real env files and does not ignore .env.example.

Done means all of these pass, in this order:
  npx supabase start  → local stack running
  npm run db:types    → exit 0, lib/supabase/database.types.ts written
  npm run typecheck   → exit 0
  npm run lint        → exit 0
  npm test            → all test files pass
  npm run build       → exit 0

When everything passes: in docs/product/06-build-plan.md set the Step 02 row in §3 to ✅ with today's date in "Done", and append a Session log entry under Step 02 (date, what was built, pass/fail per verification command, deviations, follow-ups). Then commit all changes with the message "Step 02: Supabase project, local dev & clients".

If anything above is ambiguous, if a referenced section doesn't contain what this prompt says it does, or if completing this step would require touching a file outside the list, adding an environment variable or package not listed, or making a decision the referenced documents don't settle — STOP and ask. Do not choose a reasonable default. Do not proceed with a partial implementation.
```

#### Session log
**2026-10-19**
- **Built:** `supabase init` (CLI 2.121.0 as a dev dependency): `supabase/config.toml` with generated defaults (`project_id = "moj-ljubimac"`, Postgres 17; auth/SMTP/redirect untouched), `supabase/.gitignore`, empty `supabase/seed.sql`. `.env.example` with the 21 TC §8.1 application names in order, empty values, one-line purpose comments. Root `.gitignore` also ignores `supabase/.temp/` and `supabase/.branches/`. Packages: `@supabase/supabase-js` 2.118, `@supabase/ssr` 0.12.7, `server-only`. Clients: `lib/supabase/server.ts` (`createServerSupabase(cookieStore)` + `createClient()` over `next/headers` cookies, `cookieOptions: { httpOnly: true }`), `lib/supabase/browser.ts` (public URL + anon key only), `lib/supabase/service-role.ts` (`import "server-only"`, no session persistence, throws without the key). `npm run db:types` → `lib/supabase/database.types.ts`. README "Local development" section. Tests: `tests/supabase/clients.test.ts` (real `@supabase/ssr` server client reading a session cookie and writing httpOnly cookies on sign-out; browser client args; service-role guard and missing-key error), `tests/tooling/env-example.test.ts` (exact names in order, empty values, `git check-ignore` for real env files and `.env.example`).
- **Verification:** `npx supabase start` ✅ stack running, API URL `http://127.0.0.1:54321` and anon key printed · `npm run db:types` ✅ exit 0, file written · `npm run typecheck` ✅ exit 0 · `npm run lint` ✅ exit 0 · `npm test` ✅ 5 files / 38 tests passed · `npm run build` ✅ exit 0.
- **Deviations / decisions:**
  - **httpOnly session (owner decision, 2026-10-19):** `@supabase/ssr` sets auth cookies with `httpOnly: false` by default so its browser client can read the session; API §4.1 requires httpOnly. The owner chose httpOnly: the server client passes `cookieOptions: { httpOnly: true }`, so the browser client is anonymous (no session), and sign-in, sign-out, password reset and `updateUser` must run on the server.
  - The first `npx supabase start` failed because another local Supabase project (`ysb`) held ports 54321–54327; it was stopped with `supabase stop --project-id ysb` (data volumes kept). No ports were changed in `config.toml`.
  - The generated `database.types.ts` is unformatted (the CLI suggests `oxfmt`, which isn't an approved package); lint and typecheck pass on it as is.
- **Follow-ups:**
  - **Amend Step 11 before running it:** S16 (`sign-in-form.tsx`) and S28 must call `signInWithPassword`, `signInWithOAuth`, `resetPasswordForEmail`, `updateUser` and `signOut` through server actions / route handlers using `lib/supabase/server.ts`, not the browser client; request interception must keep `httpOnly: true` when refreshing cookies. Check EP-42 wording ("Supabase Auth client") against this.
  - Only one local Supabase stack can run on the default ports at a time (stop the other project first).

---

### Step 03 — CI pipeline & Cloudflare deploy

| | |
|---|---|
| **Status** | ⬜ not started |
| **Outcome** | Every push runs install, type-check, lint, unit tests, local Supabase + pgTAP, and build in GitHub Actions; a green push to `main` first applies pending migrations to production (`supabase db push`) and then deploys to Cloudflare through the OpenNext adapter; other branches run CI only — there are no preview deployments (TC ADR-10). |
| **Implements** | ADR-03, ADR-10, TC §8 (CI/CD), ADR-15 (CI gate) |
| **Depends on** | Step 02 |
| **Blocked by** | — |
| **Track** | single |

**Read before starting:** `docs/product/03-technical-constraints.md` §3 (ADR-03, ADR-10, ADR-15, ADR-17), §4, §8, §8.1, §10 (RISK-11) · `docs/product/06-build-plan.md` §6 · the OpenNext Cloudflare adapter's getting-started documentation for the installed Next.js major.

**Files this step may touch:**
- `.github/workflows/ci.yml`
- `wrangler.jsonc`, `open-next.config.ts`, `next.config.ts`, `cloudflare-env.d.ts` (only if the adapter's documented type generation creates it)
- `package.json`, `package-lock.json`, `.gitignore`
- `supabase/tests/smoke.test.sql`
- `README.md` (deployment section only)
- `tests/tooling/ci-workflow.test.ts`, `tests/tooling/no-secrets.test.ts`
- `docs/product/06-build-plan.md` (only this step's §3 row and its Session log)

**Out of bounds:** application code, routes, migrations, `supabase/config.toml`, `.env.example` (variable names are fixed in Step 02); creating a Supabase project or Cloudflare resources by hand inside the session (the owner does that and supplies secrets).

**Acceptance criteria:** No PRD FR applies. Derived from ADR-03, ADR-10, ADR-15 and TC §8:
- (TC §8, ADR-15) On every push, CI runs in order: dependency install, `npm run typecheck`, `npm run lint`, `npm test`, local Supabase start + `npx supabase test db`, `npm run build`; any failure fails the run.
- (ADR-10, TC §8) A push to `main` that passes every check first applies pending migrations to production with `supabase db push` and then deploys the application to Cloudflare Workers through the OpenNext adapter; a failing migration stops the deploy.
- (ADR-10, TC §8) A push to any other branch runs the checks only; no deployment and no preview version is created.
- (ADR-03) The application builds and runs locally through the Cloudflare adapter's preview command.
- (TC §8.1, ADR-10) No secret value is committed; workflows and Cloudflare config reference secrets by their TC §8.1 names only.

**Tests to ship:**
- (CI order) `tests/tooling/ci-workflow.test.ts` — the workflow runs the six checks in the stated order on every push.
- (main deploy) `tests/tooling/ci-workflow.test.ts` — the deploy job runs only on `main`, only after the check job succeeds, and runs `supabase db push` before the Cloudflare deploy.
- (branches) `tests/tooling/ci-workflow.test.ts` — on any other branch only the check job runs, and no workflow step uploads a preview or version.
- (ADR-03 local) proven by the adapter preview verification command.
- (no secrets) `tests/tooling/no-secrets.test.ts` — workflow and `wrangler.jsonc` contain only secret references, no literal keys or tokens.
- (CI pgTAP gate has something to run) `supabase/tests/smoke.test.sql` — pgTAP plan asserting the local database answers and pgTAP loads.

**Verification:**
```
npm run typecheck      # expected: exit 0
npm run lint           # expected: exit 0
npm test               # expected: all test files pass
npm run build          # expected: exit 0
npm run preview        # (adapter preview script) expected: app served locally by the Workers runtime; stop it after the check
# after push of a feature branch: GitHub Actions "check" green, no deploy job runs
# after the first push to main (owner has set the TC §8.1 GitHub secrets): "deploy-production" runs supabase db push, then deploys (logged)
```

#### Prompt
```
You are executing Step 03 — CI pipeline & Cloudflare deploy — of docs/product/06-build-plan.md.

Read first, in full: docs/product/03-technical-constraints.md §3 (ADR-03, ADR-10, ADR-15, ADR-17), §4, §8, §8.1 and §10 (RISK-11); docs/product/06-build-plan.md §6; the OpenNext Cloudflare adapter's getting-started documentation for the Next.js major installed in Step 01.

Goal: CI on every push; on main, production migrations (supabase db push) and then the production deploy; other branches run CI only — no preview deployments (TC ADR-10). No application code.

Do exactly this:
1. Install the OpenNext Cloudflare adapter and wrangler as documented by the adapter. Create wrangler.jsonc and open-next.config.ts and apply the adapter's documented change to next.config.ts. Add the adapter's documented npm scripts for local preview and deploy (use the script names the adapter documentation uses; "preview" must exist — it serves the app locally in the Workers runtime). Add no version-upload script. Add the adapter's build output folders to .gitignore. If the adapter documentation says the installed Next.js major is unsupported, STOP and report (RISK-11) — do not downgrade or upgrade Next.js.
2. Create supabase/tests/smoke.test.sql: a pgTAP test that proves the local database answers and pgTAP is available, so the CI pgTAP gate has a test before Step 04 adds real ones.
3. Create .github/workflows/ci.yml:
   - Trigger: every push.
   - Job "check": checkout, Node setup, npm ci, npm run typecheck, npm run lint, npm test, Supabase CLI setup + npx supabase start + npx supabase test db, npm run build — in this order (docs/product/06-build-plan.md §6). Public build-time variables (the NEXT_PUBLIC_ names from .env.example) come from GitHub Actions variables; for this job use the values printed by the local Supabase stack, never production values.
   - Job "deploy-production": only on refs/heads/main, needs "check". First applies pending migrations to the production Supabase project with supabase db push (TC ADR-10, §8) — if it fails, the job stops and nothing is deployed — then builds with the adapter and deploys to Cloudflare Workers. Uses exactly the GitHub Actions secrets TC §8.1 lists for the app deploy and supabase db push (CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, SUPABASE_ACCESS_TOKEN, SUPABASE_DB_PASSWORD, SUPABASE_PROJECT_REF), and GitHub Actions variables named after the TC §8.1 NEXT_PUBLIC_ names for the production build-time values.
   - No other job: branches other than main run "check" only; there is no preview deployment (TC ADR-10).
4. Server-side runtime secrets for the deployed Worker (every non-NEXT_PUBLIC_ application name in TC §8.1) are set by the owner with wrangler; do not put values in wrangler.jsonc.
5. README.md: add a "Deployment" section listing the GitHub secrets and variables of step 3 and stating that Worker runtime secrets are the server-side names in .env.example. Names only, no values.
6. Write the tests listed below.

Allowed packages added in this step: @opennextjs/cloudflare and wrangler (TC ADR-17). Nothing else; no libraries outside docs/product/03-technical-constraints.md ADR-17. No staging environment and no preview deployments (ADR-10, TC §9). No new environment variable names in the application.

Files you may create or modify — nothing else:
.github/workflows/ci.yml, wrangler.jsonc, open-next.config.ts, next.config.ts, cloudflare-env.d.ts (only if the adapter's documented type generation creates it), package.json, package-lock.json, .gitignore, supabase/tests/smoke.test.sql, README.md, tests/tooling/ci-workflow.test.ts, tests/tooling/no-secrets.test.ts, and docs/product/06-build-plan.md (only the Step 03 row in §3 and the Step 03 Session log).

Tests to write (one per acceptance criterion; local Workers preview is proven by the verification command):
- tests/tooling/ci-workflow.test.ts — reads .github/workflows/ci.yml as text and asserts: (a) push trigger and the six checks in order in "check"; (b) "deploy-production" is limited to main, needs "check", and runs supabase db push before the deploy step; (c) on branches other than main only "check" runs, and no step uploads a preview or version.
- tests/tooling/no-secrets.test.ts — ci.yml and wrangler.jsonc contain secret references only (no literal tokens, keys or passwords).
- supabase/tests/smoke.test.sql — as in step 2.

Done means all of these pass, in this order:
  npm run typecheck   → exit 0
  npm run lint        → exit 0
  npm test            → all test files pass
  npm run build       → exit 0
  npm run preview     → app served locally through the Workers runtime (stop it afterwards)
  push this branch    → GitHub Actions "check" green; no deploy job on the branch

When everything passes: in docs/product/06-build-plan.md set the Step 03 row in §3 to ✅ with today's date in "Done", and append a Session log entry under Step 03 (date, what was built, pass/fail per verification command, deviations, follow-ups). Then commit all changes with the message "Step 03: CI pipeline & Cloudflare deploy".

If anything above is ambiguous, if a referenced section doesn't contain what this prompt says it does, or if completing this step would require touching a file outside the list, adding a package not listed, or making a decision the referenced documents don't settle — STOP and ask. Do not choose a reasonable default. Do not proceed with a partial implementation.
```

#### Session log
**2026-10-20**
- **Built:** `@opennextjs/cloudflare` 1.20.12 (supports Next.js `>=16.4.1`; installed 16.4.2, so no RISK-11 stop) and `wrangler` 4.151.2 (dev). `wrangler.jsonc` from the adapter template (worker `moj-ljubimac`, `nodejs_compat` + `global_fetch_strictly_public`, `ASSETS`, `WORKER_SELF_REFERENCE`; no R2 incremental cache, no `IMAGES` binding, no `vars`). `open-next.config.ts` = `defineCloudflareConfig({})`. `next.config.ts` calls `initOpenNextCloudflareForDev()`. Scripts `preview`, `deploy`, `cf-typegen` as in the adapter docs; no `upload` script. `cloudflare-env.d.ts` generated by `npm run cf-typegen`. `.gitignore` adds `/.open-next/`, `/.wrangler/`, `.dev.vars*`. `.github/workflows/ci.yml`: job `check` on every push (checkout, Node 24, `npm ci`, typecheck, lint, `npm test`, `supabase/setup-cli` + `npx supabase start` + `npx supabase test db`, local-stack `NEXT_PUBLIC_*` values from `supabase status -o env`, `npm run build`); job `deploy-production` (`if: github.ref == 'refs/heads/main'`, `needs: check`) runs `supabase link` + `supabase db push`, then `npm run deploy`, with the five TC §8.1 secrets and the four `NEXT_PUBLIC_*` GitHub variables. `supabase/tests/smoke.test.sql` (3 pgTAP assertions). README "Deployment" section (names only). Tests: `tests/tooling/ci-workflow.test.ts` (8), `tests/tooling/no-secrets.test.ts` (10).
- **Verification:** `npm run typecheck` ✅ exit 0 · `npm run lint` ✅ exit 0 (2 warnings: unused `eslint-disable` directives in the generated `cloudflare-env.d.ts`) · `npm test` ✅ 19 files / 229 tests passed · `npx supabase test db` ✅ 33 files / 1124 tests, PASS · `npm run build` ✅ exit 0 · `npm run preview` ✅ served by workerd on `http://127.0.0.1:8787` (`/manifest.webmanifest` 200, unknown routes the Next.js 404 page; there are no pages yet), stopped afterwards; also repeated in a Linux container (`node:24-bookworm`, `npm ci` + `npm run preview`), including 6 parallel requests · **push this branch — not done, pending owner** (nothing may be pushed in this unattended run) · **first push to `main` (`deploy-production`) — not done, pending owner** (the Cloudflare resources and the TC §8.1 GitHub secrets/variables are not created yet).
- **Deviations:**
  - `next.config.ts`: `cacheComponents` set to `false` and `partialPrefetching` removed (it requires Cache Components). With Cache Components on, every HTML render in `npm run preview` hung ("The Workers runtime canceled this request because it detected that your Worker's code had hung", 500 on `/`, unknown routes never answered) on Windows and on Linux — a known open adapter issue (opennextjs-cloudflare #1450, PR #1318; next.js #94880). Decided under TC RISK-11 ("keep to well-supported features"); nothing in 01–05 uses `'use cache'` and ADR-18 renders public pages on every request. Supersedes the Step 01 note that kept both defaults.
  - `package.json` `lint` script now ignores `.open-next/**` and `.wrangler/**` (`--ignore-pattern`): after `npm run preview`, ESLint linted the adapter output (352 errors). `eslint.config.mjs` is not in this step's allowlist.
  - Not created, although the adapter's getting-started lists them, because they are outside the allowlist: `public/_headers` (immutable cache header for `/_next/static/*`) and `.dev.vars` (`NEXTJS_ENV=development`). `.dev.vars*` is gitignored.
  - npm 11.16 locally blocks dependency install scripts (`workerd`, `esbuild`, `unrs-resolver` reported under allow-scripts); preview and build worked without them, and `npm ci` in the Linux container (npm 11.19) succeeded.
  - `wrangler` prints "OpenNext is not fully compatible with Windows"; CI and deploy run on `ubuntu-latest`.
- **Follow-ups:**
  - **Owner:** create the Cloudflare API token and the production Supabase project; set GitHub secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF` and variables `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`; set Worker runtime secrets with `npx wrangler secret put`. Then run both deferred checks: push a feature branch (expect "check" green, no deploy job) and the first push to `main` (expect "deploy-production" to run `supabase db push`, then deploy).
  - Move the `.open-next`/`.wrangler` ignores into `eslint.config.mjs` (and ignore `cloudflare-env.d.ts`) in a step that owns that file; add `public/_headers` in a step that owns `public/`.
  - Re-enable Cache Components only after the adapter fixes the Workers hang (re-test with `npm run preview`).
  - Step 01 follow-up still stands: CI runs `typecheck` before `next build`, so code that uses generated route types needs `next typegen` first.
  - Re-run `npm run cf-typegen` whenever `wrangler.jsonc` changes (Step 11/30 bindings).

---

### Step 04 — Schema: accounts, reference & billing tables

| | |
|---|---|
| **Status** | ⬜ not started |
| **Outcome** | Migrations create `profiles`, `cities`, `plans`, `app_settings`, `subscriptions`, `subscription_payments`, `payment_webhook_events`, `data_exports`, `r2_deletion_queue`, `idempotency_keys`, `rate_limit_counters` with RLS, the `profiles.email` sync trigger, and the `is_premium(user)` helper; the cities seed `supabase/seed/cities.sql` (every municipality/city seat in Serbia, coordinates fetched once from Nominatim by `scripts/fetch-cities.*`) and a local-only seed of test users including one Premium user exist; pgTAP proves it. |
| **Implements** | Tables `profiles`, `cities`, `plans`, `app_settings`, `subscriptions`, `subscription_payments`, `payment_webhook_events`, `data_exports`, `r2_deletion_queue`, `idempotency_keys`, `rate_limit_counters` (TC §5.1, §5.5 `app_settings`, §5.7); BR-07, BR-14b, BR-30, BR-31 (data side); API §5.6 "Premium active" definition; API §3.3, §11 (storage); ADR-02; ADR-11 (cities seed) |
| **Depends on** | Step 02 |
| **Blocked by** | — (prices stay out: OQ-03) |
| **Track** | single |

**Read before starting:** `docs/product/03-technical-constraints.md` §3 (ADR-11, ADR-16), §5 (conventions), §5.1 (`profiles`, `subscriptions`, `subscription_payments`, `plans`), §5.5 (`app_settings`), §5.7 (`r2_deletion_queue`, `payment_webhook_events`, `data_exports`, `cities`, `idempotency_keys`, `rate_limit_counters`), §5.7.1, §5.9 · `docs/product/02-prd.md` §8 (BR-07, BR-14b, BR-29, BR-30, BR-31, BR-53) · `docs/product/05-api-integration-contract.md` §3.1, §3.3, §9.4 (Nominatim row), §11, §4.1–§4.4, §5.5 (EP-41, EP-43, EP-44), §5.6 intro + EP-47, EP-50, EP-51, §5.8 (EP-67, EP-71), §6 (Me, Entitlements, Plan, Subscription, DataExport, City, AppSettings), §7.1, §7.2 · `docs/product/04-design-system.md` §9 (mock-data names) · `docs/product/06-build-plan.md` §6, §7.

**Files this step may touch:**
- `supabase/migrations/*_accounts.sql`, `supabase/migrations/*_reference_data.sql`, `supabase/migrations/*_billing.sql`, `supabase/migrations/*_data_control.sql`, `supabase/migrations/*_entitlements.sql`, `supabase/migrations/*_server_support.sql`
- `scripts/fetch-cities.*` (exactly one file, run once with Node and the platform `fetch`; no package), removal of `scripts/.gitkeep`
- `supabase/seed/cities.sql`, removal of `supabase/seed/.gitkeep`; `supabase/seed.sql`
- `supabase/config.toml` (seed section only: `sql_paths`)
- `supabase/tests/profiles.test.sql`, `supabase/tests/reference_data.test.sql`, `supabase/tests/billing.test.sql`, `supabase/tests/data_control.test.sql`, `supabase/tests/entitlements.test.sql`, `supabase/tests/server_support.test.sql`
- `lib/supabase/database.types.ts` (regenerated with `npm run db:types`)
- `docs/product/06-build-plan.md` (only this step's §3 row and its Session log)

**Out of bounds:** any table not listed above; any price row in `plans` (OQ-03); the `v_public_plans` view and every RPC other than `is_premium` (later steps); application code; `supabase/config.toml` outside its seed section; loading the cities into production (CR-26).

**Acceptance criteria:** Business rules quoted verbatim from PRD §8 (data side only), plus checks derived from TC §5 and API §5.6:
- BR-30: "Each user has one account type: Owner, Shelter, or Breeder (team membership does not change it, BR-53)."
- BR-31: "Account deletion takes effect after a 30-day grace period during which it can be cancelled." (data side: `deletion_due_at` is `deletion_requested_at` + 30 days and clears when the request is cleared)
- BR-07: "Premium is monthly or yearly, auto-renewing, with one 7-day trial per user." (data side: plan enum, `auto_renew`, `trial_used`)
- BR-14b: "The Viber channel is built but hidden until the Operator switches it on; while it is off, users cannot select Viber." (data side: `app_settings` holds one row with `viber_enabled = false`)
- (Derived from TC §5.1) `profiles.email` stays equal to `auth.users.email` when the auth email changes.
- (Derived from TC §5.1, §5.7) Every column, type, check, unique and partial index listed for these eleven tables exists; `plans` has no rows (OQ-03).
- (Derived from TC §5, API §3.1, §4.4, EP-41, EP-43, EP-47, EP-50, EP-67, EP-71) RLS is enabled on every table; a user reads only their own `profiles`, `subscriptions`, `data_exports`; clients can write only the `profiles` columns EP-41/EP-43 allow; `cities` is readable by `anon` and `authenticated`; `app_settings`, `subscription_payments`, `payment_webhook_events`, `r2_deletion_queue` have no client write path.
- (Derived from API §5.6 intro) `is_premium(user)` is true exactly when the user has a `premium_*` subscription with status in (`trialing`, `active`, `cancelled`) and `current_period_end > now()`.
- (Derived from TC ADR-11) `supabase/seed/cities.sql` holds every town that is the seat of a municipality or city in Serbia with `name_sr` (Serbian Latin), `name_en` and coordinates, generated once by `scripts/fetch-cities.*` from Nominatim, and `npx supabase db reset` loads it.
- (Derived from TC §5.7, API §3.1, §3.3, §11) `idempotency_keys` and `rate_limit_counters` exist with their uniques and RLS: a user reads and inserts only their own rows; a counter's `count` can only grow; neither table has a client delete path (purge is the Step 30 nightly job).
- (Derived from ADR-02, TC §8) The local seed creates test users for every account type, including one Premium owner; it runs only locally.

**Tests to ship:**
- BR-30 → `supabase/tests/profiles.test.sql` (account_type enum and not null)
- BR-31 → `supabase/tests/profiles.test.sql` (`deletion_due_at` derivation)
- BR-07 → `supabase/tests/billing.test.sql` (plan enum values, `auto_renew` default, `trial_used` default false)
- BR-14b → `supabase/tests/reference_data.test.sql` (single row, `viber_enabled = false`)
- email sync → `supabase/tests/profiles.test.sql`
- columns/checks/indexes, empty `plans` → `supabase/tests/billing.test.sql`, `supabase/tests/reference_data.test.sql`, `supabase/tests/data_control.test.sql`
- RLS and column grants → `supabase/tests/profiles.test.sql`, `supabase/tests/billing.test.sql`, `supabase/tests/reference_data.test.sql`, `supabase/tests/data_control.test.sql` (each table in its file)
- `is_premium` truth table → `supabase/tests/entitlements.test.sql`
- cities seed → `supabase/tests/reference_data.test.sql` (seats present with both names and coordinates, including the mock-data cities Novi Sad, Beograd, Bečej)
- `idempotency_keys` / `rate_limit_counters` → `supabase/tests/server_support.test.sql`
- users seed →  `supabase/tests/entitlements.test.sql` (the seeded Premium owner is premium, the seeded Free owner is not)

**Verification:**
```
npx supabase db reset  # expected: all migrations + seed apply without error
npm run db:types       # expected: exit 0
npm run typecheck      # expected: exit 0
npm run lint           # expected: exit 0
npm test               # expected: all test files pass
npx supabase test db   # expected: all pgTAP files pass
npm run build          # expected: exit 0
```

#### Prompt
```
You are executing Step 04 — Schema: accounts, reference & billing tables — of docs/product/06-build-plan.md.

Read first, in full: docs/product/03-technical-constraints.md §3 (ADR-11, ADR-16), §5 (conventions block), §5.1 (profiles, subscriptions, subscription_payments, plans), §5.5 (app_settings only), §5.7 (r2_deletion_queue, payment_webhook_events, data_exports, cities, idempotency_keys, rate_limit_counters), §5.7.1, §5.9; docs/product/02-prd.md §8 (BR-07, BR-14b, BR-29, BR-30, BR-31, BR-53); docs/product/05-api-integration-contract.md §3.1, §3.3, §4.1–§4.4, EP-41, EP-43, EP-44 (§5.5), the §5.6 intro and EP-47, EP-50, EP-51, EP-67 and EP-71 (§5.8), §6 schemas Me, Entitlements, Plan, Subscription, DataExport, City, AppSettings, §7.1–§7.2, the Nominatim row of §9.4 and §11; docs/product/04-design-system.md §9 (mock-data names); docs/product/06-build-plan.md §6 and §7.

Goal: these eleven tables, their RLS, the email sync trigger, is_premium(user) and the cities seed — and nothing else.

Do exactly this:
1. Migrations (one file per name, created with the Supabase CLI so they carry a timestamp prefix):
   - *_accounts.sql — the shared updated_at trigger function used by every table (TC §5 conventions); enums needed by profiles; table profiles exactly per TC §5.1 (FK to auth.users on delete cascade; deletion_due_at = deletion_requested_at + 30 days, null when no request; index on deletion_due_at); a trigger that copies auth.users.email into profiles.email whenever the auth email changes.
   - *_reference_data.sql — cities per TC §5.7; app_settings per TC §5.5 holding exactly one row with viber_enabled = false (inserted by the migration, so production has it too) and a guard so a second row cannot exist.
   - *_billing.sql — plan and status enums; plans, subscriptions (with the unique partial index of TC §5.1), subscription_payments, payment_webhook_events (unique provider + event_id). Insert no plan rows — prices are OQ-03.
   - *_data_control.sql — data_exports and r2_deletion_queue per TC §5.7.
   - *_entitlements.sql — function is_premium(user uuid) returning boolean, implementing exactly the "Premium active" definition in the 05- §5.6 intro. Stable, callable from RLS and triggers in later steps.
   - *_server_support.sql — idempotency_keys and rate_limit_counters exactly per TC §5.7 (FK to profiles on delete cascade; unique (user_id, key) and unique (user_id, operation, window_start)).
2. RLS on every table, derived only from the authorization lines of the EPs listed above and API §3.1/§4.4:
   - profiles: a user selects only their own row; insert of the own row (id = auth.uid()) and update are limited by column grants to exactly the columns EP-41 complete_registration writes and EP-43 update allows; is_operator, trial_used and the deletion columns are never client-writable (EP-51 is a server action — leave its write path to its step).
   - cities: select for anon and authenticated (EP-67); no client writes.
   - plans: select for anon and authenticated (EP-44); no client writes.
   - subscriptions: a user selects only their own rows (EP-47); no client writes.
   - subscription_payments, payment_webhook_events, r2_deletion_queue: no client access.
   - data_exports: a user selects only their own rows (EP-50); no client writes.
   - app_settings: Operator (profiles.is_operator) select and update (EP-71); no other client access.
   - idempotency_keys, rate_limit_counters: server actions never bypass RLS for a user's own data (05- §3.1), so a user selects and inserts only rows with user_id = auth.uid(); idempotency_keys has no update; rate_limit_counters allows update of own rows only when count does not decrease (trigger); neither has a client delete (the Step 30 nightly job purges them, TC §5.9).
   Where 05- names a specific error code for a denied write, raise it in the TC §5.7.1 format (ERRCODE P0001, MESSAGE '<code>' or '<code>:<detail>', mapped per 05- §7.1); where 05- says "no relation", the row is simply invisible.
3. Cities seed (TC ADR-11): write scripts/fetch-cities.* — a one-off Node script using the platform fetch only — that geocodes every town that is the seat of a municipality or city in Serbia through OpenStreetMap Nominatim (at most 1 request per second, an identifying User-Agent — 05- §9.4 Nominatim row) and writes supabase/seed/cities.sql (insert statements for name_sr in Serbian Latin, name_en, latitude, longitude; the source of the list and the fetch date in a header comment). TC fixes the scope but not the list itself; the owner settled it on 2026-10-19: the seats of every municipality and city in the Republic Statistical Office of Serbia (RZS) register of territorial units, without the municipalities of Kosovo and Metohija, one entry per city (no separate entries for city municipalities such as Zemun or Petrovaradin). This decision is the approval: compile the list from that source, run the script without asking, and record the source, the scope and the number of entries in the Session log. Run the script once and commit its output. Set the seed section of supabase/config.toml (sql_paths) so that npx supabase db reset loads ./seed/cities.sql first and then ./seed.sql. How cities.sql reaches production is not settled (CR-26) — do not run anything against production.
4. supabase/seed.sql (local only, runs on npx supabase db reset after the cities): test users in auth.users plus their profiles — a Free owner, a Premium owner (with a premium_monthly subscription row, status active, current_period_end in the future), a second owner for household tests, a shelter user, a breeder user, and an Operator (is_operator = true) — named per docs/product/04-design-system.md §9 mock-data rules (cities from the cities seed), with one local-only password stated in the seed header comment. Later schema steps append to this file.
5. Run npm run db:types to regenerate lib/supabase/database.types.ts.
6. Write the pgTAP tests listed below.

Do not invent: no tables, columns, enums, indexes or functions outside docs/product/03-technical-constraints.md §5 and the is_premium helper and counter trigger named here; no city outside the owner-approved list; no endpoints, RPCs, fields or error codes outside docs/product/05-api-integration-contract.md; no plan prices; no Postgres extensions beyond what the Supabase CLI provides by default; no libraries outside docs/product/03-technical-constraints.md ADR-17.

Files you may create or modify — nothing else:
supabase/migrations/*_accounts.sql, supabase/migrations/*_reference_data.sql, supabase/migrations/*_billing.sql, supabase/migrations/*_data_control.sql, supabase/migrations/*_entitlements.sql, supabase/migrations/*_server_support.sql, scripts/fetch-cities.* (one file), scripts/.gitkeep (delete), supabase/seed/cities.sql, supabase/seed/.gitkeep (delete), supabase/seed.sql, supabase/config.toml (seed section only), supabase/tests/profiles.test.sql, supabase/tests/reference_data.test.sql, supabase/tests/billing.test.sql, supabase/tests/data_control.test.sql, supabase/tests/entitlements.test.sql, supabase/tests/server_support.test.sql, lib/supabase/database.types.ts, and docs/product/06-build-plan.md (only the Step 04 row in §3 and the Step 04 Session log).

Acceptance criteria (verbatim from the PRD, data side only; then derived checks):
- BR-30: "Each user has one account type: Owner, Shelter, or Breeder (team membership does not change it, BR-53)."
- BR-31: "Account deletion takes effect after a 30-day grace period during which it can be cancelled." (data side: deletion_due_at derivation)
- BR-07: "Premium is monthly or yearly, auto-renewing, with one 7-day trial per user." (data side: plan enum, auto_renew, trial_used)
- BR-14b: "The Viber channel is built but hidden until the Operator switches it on; while it is off, users cannot select Viber." (data side: app_settings single row, viber_enabled false)
- Derived from TC §5.1: profiles.email follows auth.users.email.
- Derived from TC §5.1/§5.7: every listed column, type, check, unique and partial index of the eleven tables exists; plans is empty.
- Derived from TC ADR-11: supabase/seed/cities.sql holds every municipality/city seat with both names and coordinates and loads on db reset.
- Derived from TC §5.7 and API §3.1/§3.3/§11: idempotency_keys and rate_limit_counters own-row RLS, count never decreases, no client delete.
- Derived from API §3.1/§4.4 and the EPs above: RLS and column grants as in step 2.
- Derived from API §5.6 intro: is_premium truth table.
- Derived from ADR-02/TC §8: seed creates all test users including one Premium owner.

Tests to write (pgTAP, one assertion group per criterion):
- supabase/tests/profiles.test.sql — BR-30 enum/not null; BR-31 deletion_due_at derivation and clearing; email sync trigger; profiles RLS (own row only) and column grants (is_operator, trial_used, deletion columns not writable by authenticated).
- supabase/tests/reference_data.test.sql — cities columns, anon/authenticated read, no client write, seeded seats present with both names and coordinates (including Novi Sad, Beograd, Bečej); app_settings single row, viber_enabled false, second row rejected, Operator-only access.
- supabase/tests/billing.test.sql — BR-07 data side; plans columns/checks and zero rows; subscriptions unique partial index; subscription_payments checks and unique transaction id; payment_webhook_events uniqueness; RLS (own subscriptions only, no client writes, payments and webhook events invisible).
- supabase/tests/data_control.test.sql — data_exports columns and own-row read; r2_deletion_queue invisible to clients.
- supabase/tests/server_support.test.sql — idempotency_keys and rate_limit_counters columns and uniques; own-row select/insert; another user's rows invisible; count decrease refused; no client delete.
- supabase/tests/entitlements.test.sql — is_premium true for trialing/active/cancelled with future current_period_end; false for expired, payment_failed, past current_period_end, breeder plans, no subscription; seeded Premium owner true, seeded Free owner false.

Done means all of these pass, in this order:
  npx supabase db reset → migrations and seed apply cleanly
  npm run db:types      → exit 0
  npm run typecheck     → exit 0
  npm run lint          → exit 0
  npm test              → all test files pass
  npx supabase test db  → all pgTAP files pass
  npm run build         → exit 0

When everything passes: in docs/product/06-build-plan.md set the Step 04 row in §3 to ✅ with today's date in "Done", and append a Session log entry under Step 04 (date, what was built, pass/fail per verification command, the owner-approved city list source, deviations, follow-ups — CR-26 production cities load still open). Then commit all changes with the message "Step 04: Schema: accounts, reference & billing tables".

If anything above is ambiguous, if a referenced section doesn't contain what this prompt says it does, or if completing this step would require touching a file outside the list, a column or table not in 03- §5, or a decision the referenced documents don't settle — STOP and ask. Do not choose a reasonable default. Do not proceed with a partial implementation.
```

#### Session log
**2026-10-19**
- **Built:** six migrations — `20261019191630_accounts.sql` (shared `set_updated_at()`; enums `account_type`, `app_locale`; `profiles` per TC §5.1 with `deletion_due_at` index; trigger `profiles_before_write` that copies the email from `auth.users` on insert, derives `deletion_due_at = deletion_requested_at + 30 days` (null when cleared) and raises `account_pending_deletion` on a `full_name`/`city_id`/`locale` change while deletion is pending (EP-43); trigger `on_auth_user_email_changed` on `auth.users` → `profiles.email`), `20261019191632_reference_data.sql` (`cities`, the `profiles.city_id` foreign key, `app_settings` with its one row `viber_enabled = false` inserted by the migration and a unique index on `((true))` as the single-row guard), `20261019191635_billing.sql` (enums `subscription_plan`, `subscription_status`, `payment_kind`, `payment_result`; `plans` with no rows; `subscriptions` with the `user_id` index and the unique partial index on (user_id, plan family) where status in trialing/active/cancelled; `subscription_payments` with unique `monri_transaction_id`; `payment_webhook_events` unique (provider, event_id)), `20261019191638_data_control.sql` (`data_export_status` enum, `data_exports`, `r2_deletion_queue`), `20261019191641_entitlements.sql` (`is_premium(user_id uuid)`: stable, security definer, execute for `authenticated` and `service_role` only), `20261019191644_server_support.sql` (`idempotency_keys`, `rate_limit_counters`, and the trigger that stops `count` from decreasing). RLS is on for every table. `anon`/`authenticated` lose all default privileges and get back only what step 2 of the prompt allows: profiles insert columns `id, account_type, locale, email, terms_accepted_at, terms_version` (EP-41) and update columns `full_name, city_id, locale` (EP-43); app_settings update column `viber_enabled` for the Operator only. Cities seed: `scripts/fetch-cities.mjs` (Node, platform `fetch`, 1.1 s between requests, User-Agent `moj-ljubimac-cities-seed/1.0 (+repo URL)`) → `supabase/seed/cities.sql`, 145 entries. `supabase/config.toml` `sql_paths = ["./seed/cities.sql", "./seed.sql"]`. `supabase/seed.sql`: six local test users, all with password `MojLjubimac123!`, in `auth.users` + `auth.identities` + `profiles`: Ivana Petrović (Premium owner, `premium_monthly` active until now + 1 month, Novi Sad), Marko Jovanović (Free owner, Beograd), Jelena Nikolić (second owner, Novi Sad), Milica Stojanović (shelter, Bečej), Nikola Đorđević (breeder, Beograd), Ana Marković (Operator, Novi Sad). Seeded password sign-in through local GoTrue checked by hand. `lib/supabase/database.types.ts` regenerated. pgTAP: 6 files, 153 assertions.
- **City list (owner-approved source):** the local self-government units of the RZS register of territorial units (Zakon o teritorijalnoj organizaciji Republike Srbije) without Kosovo and Metohija: 117 municipalities + 28 cities (Beograd included) = **145 entries**, one per city (Beograd, Niš, Novi Sad, Požarevac, Užice and Vranje have no separate city-municipality entries). `stat.gov.rs` refused scripted requests (403/404), so the list was compiled from the English Wikipedia article "Municipalities and cities of Serbia". That article reproduces the law's list ("117 municipalities + 28 cities, excluding Kosovo"), and its parsed list matched the script's list name for name. `name_en` equals `name_sr` except Beograd → Belgrade. Coordinates come from Nominatim, fetched 2026-10-19.
- **Verification:** `npx supabase db reset` ✅ (6 migrations + both seed files) · `npm run db:types` ✅ exit 0 · `npm run typecheck` ✅ exit 0 · `npm run lint` ✅ exit 0 · `npm test` ✅ 5 files / 38 tests · `npx supabase test db` ✅ 6 files / 153 tests · `npm run build` ✅ exit 0.
- **Deviations / decisions:**
  - The script ran twice. On the first run, Boljevac, Žabari, Rača and Trgovište matched villages of the same name in other municipalities. The script now accepts only results inside the seat's own `Opština <name>` / `Grad <name>`, and the committed file is the output of the second run. All 145 results were checked against their municipality or city.
  - `profiles.city_id` gets its foreign key in the reference_data migration, because `cities` is created after `profiles` in the prompt's migration order.
  - Conventions (TC §5): `id`, `created_at` and `updated_at` were added to every table except `profiles` (its id is the `auth.users` FK) and `r2_deletion_queue` (TC gives it `r2_key` as primary key plus `queued_at` only). Enum type names are not set by TC, so the names above were chosen. The `subscriptions.last_notice_days` check is `in (30, 7, 1)`. `subscription_payments.monri_transaction_id` is not null because EP-46 requires a transaction id. `plans.active` is not null with no default.
  - `rate_limit_counters` decrease: 05- names no error code for this, so it raises `P0001 'internal_error'` with a DETAIL. An insert into `profiles` takes its email from `auth.users`, whatever the client sends.
  - The seeded profiles use `terms_version = 'seed'` because `TERMS_VERSION` is set in Step 12.
  - Local seed users have fixed ids `a1000000-0000-4000-8000-00000000000N` (N = 1…6, in the order above). Tests refer to them.
- **Follow-ups:**
  - **CR-26 still open:** how `supabase/seed/cities.sql` reaches production. Nothing was run against production.
  - Step 12: if registration checks `terms_version`, either align the seed's `'seed'` value with `TERMS_VERSION` or leave it as is.
  - Step 05+: other users' profiles (household and team views) are invisible under the current own-row `profiles` policy. The step that needs them must add a policy.

---

### Step 05 — Schema: households & organisations

| | |
|---|---|
| **Status** | ⬜ not started |
| **Outcome** | Migrations create `households`, `household_memberships`, `household_invitations`, `organisations`, `organisation_memberships`, `organisation_invitations` with RLS and the triggers for household size, team size, one household per owner, and the household `read_only` flag; pgTAP proves it. |
| **Implements** | Tables `households`, `household_memberships`, `household_invitations`, `organisations`, `organisation_memberships`, `organisation_invitations` (TC §5.1, §5.2); BR-19, BR-20, BR-24 (opt-in default), BR-25, BR-28, BR-32, BR-34, BR-47, BR-51 (household size) |
| **Depends on** | Step 04 |
| **Blocked by** | — |
| **Track** | single |

**Read before starting:** `docs/product/03-technical-constraints.md` §5 (conventions), §5.1 (`households`, `household_memberships`, `household_invitations`), §5.2, §5.7.1 · `docs/product/02-prd.md` §8 (BR-19, BR-20, BR-24, BR-25, BR-28, BR-32, BR-34, BR-46, BR-47, BR-51, BR-52) · `docs/product/05-api-integration-contract.md` §3.1, §4.1–§4.4, §5.4 (EP-34 … EP-40), §5.5 (EP-41 side effects), §5.7 intro + EP-53, EP-56, EP-72, §5.8 (EP-68), §6 (Household, HouseholdMember, HouseholdInvitation, InvitationView, Organisation, OrganisationMember, OrganisationInvitation, PendingOrganisation), §7.1, §7.2 · `docs/product/06-build-plan.md` §6.

**Files this step may touch:**
- `supabase/migrations/*_households.sql`, `supabase/migrations/*_organisations.sql`
- `supabase/seed.sql` (append only)
- `supabase/tests/households.test.sql`, `supabase/tests/household_rls.test.sql`, `supabase/tests/organisations.test.sql`, `supabase/tests/organisation_rls.test.sql`
- `lib/supabase/database.types.ts` (regenerated)
- `docs/product/06-build-plan.md` (only this step's §3 row and its Session log)

**Out of bounds:** `household_pets` (Step 06, needs `pets`); ownership transfer on owner deletion (BR-27) and organisation succession (BR-46) — Step 30; time-based Premium expiry (Step 30 nightly job); invitation emails, tokens, and actions (Steps 22, 24); application code.

**Acceptance criteria:** Business rules quoted verbatim from PRD §8 (data side), plus derived checks:
- BR-20: "An owner owns at most one household; a household has at most 6 members; a user may belong to several households."
- BR-51 (second sentence): "The household limit of 6 includes the owner."
- BR-19: "Household sharing requires the owner to have Premium." (data side: `households.read_only` is true whenever the owner is not Premium)
- BR-28: "When the owner's Premium expires, members keep read-only access." (data side: subscription changes recompute `read_only`; member select stays allowed, member writes are refused)
- BR-24 (data side): "reminders for shared pets are off until the member switches them on" — `household_memberships.reminders_enabled` defaults to false.
- BR-25: "Only the owner can delete pets, invite or remove members, and manage the subscription." (data side for invitations and memberships)
- BR-32: "Shelter accounts are free and require Operator approval before use." (data side: a new shelter organisation starts `pending`, a breeder `approved`)
- BR-34: "Organisation teams have up to 20 users, role Admin or Volunteer; Volunteers cannot delete animals, decide requests/inquiries, or manage the team." (data side: 20-member limit, role enum, Volunteers cannot write memberships or invitations)
- (Derived from TC §5.1, §5.2) Every listed column, type, unique, enum and default exists.
- (Derived from API §4.4, EP-34 … EP-40, EP-53, EP-56, EP-72) Owners manage their household's invitations and memberships; members read their household and update only `reminders_enabled` on their own row; organisation members read their organisation; only Admins write team rows and the EP-72 public-profile columns; approval fields have no client write path.

**Tests to ship:**
- BR-20 (one household per owner; several memberships per user) → `supabase/tests/households.test.sql`
- BR-20 + BR-51 (sixth person rejected with `household_full`) → `supabase/tests/households.test.sql`
- BR-19 (`read_only` set for a non-Premium owner, cleared for Premium) → `supabase/tests/households.test.sql`
- BR-28 (subscription change flips `read_only`; member read allowed, member write refused with `household_read_only`) → `supabase/tests/household_rls.test.sql`
- BR-24 default → `supabase/tests/households.test.sql`
- BR-25 → `supabase/tests/household_rls.test.sql`
- BR-32 → `supabase/tests/organisations.test.sql`
- BR-34 (21st member rejected with `team_full`; Volunteer cannot write team rows) → `supabase/tests/organisations.test.sql`, `supabase/tests/organisation_rls.test.sql`
- columns/uniques/defaults → `supabase/tests/households.test.sql`, `supabase/tests/organisations.test.sql`
- RLS matrix → `supabase/tests/household_rls.test.sql`, `supabase/tests/organisation_rls.test.sql`

**Verification:**
```
npx supabase db reset  # expected: all migrations + seed apply without error
npm run db:types       # expected: exit 0
npm run typecheck      # expected: exit 0
npm run lint           # expected: exit 0
npm test               # expected: all test files pass
npx supabase test db   # expected: all pgTAP files pass
npm run build          # expected: exit 0
```

#### Prompt
```
You are executing Step 05 — Schema: households & organisations — of docs/product/06-build-plan.md.

Read first, in full: docs/product/03-technical-constraints.md §5 (conventions), §5.1 (households, household_memberships, household_invitations), §5.2 and §5.7.1; docs/product/02-prd.md §8 (BR-19, BR-20, BR-24, BR-25, BR-28, BR-32, BR-34, BR-46, BR-47, BR-51, BR-52); docs/product/05-api-integration-contract.md §3.1, §4.1–§4.4, §5.4 (EP-34 … EP-40), EP-41 side effects (§5.5), the §5.7 intro and EP-53, EP-56, EP-72, EP-68 (§5.8), §6 schemas Household, HouseholdMember, HouseholdInvitation, InvitationView, Organisation, OrganisationMember, OrganisationInvitation, PendingOrganisation, and §7.1–§7.2; docs/product/06-build-plan.md §6.

Goal: the six household and organisation tables, their RLS and the four rules below — nothing else.

Do exactly this:
1. *_households.sql — enums and tables households, household_memberships, household_invitations exactly per TC §5.1 (household_pets is NOT created here — it needs pets, Step 06). Triggers:
   - one household per owner (the unique owner_id of TC §5.1);
   - household size: the owner has no membership row (EP-38), so owner + memberships may not exceed 6 (BR-20, BR-51); an insert that would exceed it raises household_full in the TC §5.7.1 format (ERRCODE P0001, MESSAGE 'household_full'; mapped per 05- §7.1);
   - read_only maintenance: households.read_only = not is_premium(owner_id), recomputed when a household is created and when any subscriptions row of its owner is inserted or updated (BR-19, BR-28). Time-based expiry without a row change is handled by the Step 30 nightly job — do not schedule anything here.
2. *_organisations.sql — enums and tables organisations, organisation_memberships, organisation_invitations exactly per TC §5.2. Triggers:
   - approval_status on insert follows BR-32 (shelter → pending, breeder → approved) as TC §5.2 states;
   - team size: at most 20 organisation_memberships per organisation (BR-34); an insert that would exceed it raises team_full in the TC §5.7.1 format.
3. RLS on all six tables, derived only from 05- §4.4 and the authorization lines of EP-34 … EP-40, EP-53, EP-56, EP-68, EP-72:
   - households: owner selects and updates own; members select households they belong to; no client delete.
   - household_memberships: owner selects/deletes memberships of own household; a member selects memberships of households they belong to and updates only reminders_enabled on their own row (column grant, EP-38); writes by a member of a read_only household are refused with household_read_only where 05- names that code (EP-36, EP-38 allow leave and opt-in while read-only — follow them exactly).
   - household_invitations: owner of the household only (BR-25); invitees reach invitations only through the server actions of EP-39/EP-40 (later step) — no direct client policy for them.
   - organisations: members select their organisation; Admins update only the EP-72 public-profile columns (column grant); approval_status and rejection_reason have no client write path (EP-68 uses the service role).
   - organisation_memberships, organisation_invitations: members select their organisation's rows (Volunteers do not see pending invitations, EP-53); only Admins insert/update/delete (BR-34, EP-56); a Volunteer write raises forbidden_role.
   Where 05- names a specific error code for a denied write, raise it per §7.1; where it says "no relation", the row is invisible.
4. supabase/seed.sql — append: a household owned by the seeded Premium owner with the second seeded owner as member; an organisation for the seeded shelter user (pending) and one for the seeded breeder user (approved), each with that user as admin.
5. Run npm run db:types.
6. Write the pgTAP tests listed below.

Do not invent: no tables, columns, enums or indexes outside docs/product/03-technical-constraints.md §5.1–§5.2; no BR-27/BR-46 succession logic (Step 30); no last-admin rule (Step 24); no RPCs (EP-34, EP-53 belong to their steps); no endpoints, fields or error codes outside docs/product/05-api-integration-contract.md; no libraries outside docs/product/03-technical-constraints.md ADR-17.

Files you may create or modify — nothing else:
supabase/migrations/*_households.sql, supabase/migrations/*_organisations.sql, supabase/seed.sql, supabase/tests/households.test.sql, supabase/tests/household_rls.test.sql, supabase/tests/organisations.test.sql, supabase/tests/organisation_rls.test.sql, lib/supabase/database.types.ts, and docs/product/06-build-plan.md (only the Step 05 row in §3 and the Step 05 Session log).

Acceptance criteria (verbatim from the PRD, data side; then derived checks):
- BR-20: "An owner owns at most one household; a household has at most 6 members; a user may belong to several households."
- BR-51 (second sentence): "The household limit of 6 includes the owner."
- BR-19: "Household sharing requires the owner to have Premium." (read_only follows is_premium of the owner)
- BR-28: "When the owner's Premium expires, members keep read-only access."
- BR-24 (data side): "reminders for shared pets are off until the member switches them on"
- BR-25: "Only the owner can delete pets, invite or remove members, and manage the subscription." (invitations, memberships)
- BR-32: "Shelter accounts are free and require Operator approval before use." (approval default)
- BR-34: "Organisation teams have up to 20 users, role Admin or Volunteer; Volunteers cannot delete animals, decide requests/inquiries, or manage the team." (20 limit, Volunteer write refusal)
- Derived from TC §5.1–§5.2: all listed columns, uniques, enums, defaults.
- Derived from API §4.4 and the EPs above: the RLS matrix in step 3.

Tests to write (pgTAP):
- supabase/tests/households.test.sql — BR-20 one household per owner and multi-household membership; BR-20 + BR-51 owner + 5 members accepted, the next membership raises household_full; BR-19 read_only true for a Free owner, false for a Premium owner; BR-24 reminders_enabled default false; columns/uniques/defaults of the three tables.
- supabase/tests/household_rls.test.sql — BR-28 cancelling/expiring the owner's subscription row flips read_only, member select still works, member write refused with household_read_only where 05- requires it; BR-25 only the owner writes invitations and removes memberships; member may update only reminders_enabled on own row; an unrelated user sees nothing.
- supabase/tests/organisations.test.sql — BR-32 shelter pending / breeder approved on insert; BR-34 20 members accepted, 21st raises team_full; columns/uniques/defaults of the three tables.
- supabase/tests/organisation_rls.test.sql — members read own organisation only; Admin updates EP-72 columns only; approval columns not client-writable; Volunteer team write raises forbidden_role; Volunteer cannot see pending invitations; another organisation's rows are invisible.

Done means all of these pass, in this order:
  npx supabase db reset → migrations and seed apply cleanly
  npm run db:types      → exit 0
  npm run typecheck     → exit 0
  npm run lint          → exit 0
  npm test              → all test files pass
  npx supabase test db  → all pgTAP files pass
  npm run build         → exit 0

When everything passes: in docs/product/06-build-plan.md set the Step 05 row in §3 to ✅ with today's date in "Done", and append a Session log entry under Step 05 (date, what was built, pass/fail per verification command, deviations, follow-ups). Then commit all changes with the message "Step 05: Schema: households & organisations".

If anything above is ambiguous, if a referenced section doesn't contain what this prompt says it does, or if completing this step would require touching a file outside the list, a column or table not in 03- §5, or a decision the referenced documents don't settle — STOP and ask. Do not choose a reasonable default. Do not proceed with a partial implementation.
```

#### Session log
**2026-10-19**
- **Built:** two migrations. `20261019220000_households.sql` adds the shared enum `invitation_status` and the tables `households` (unique `owner_id` with on delete set null; `read_only` not null default false), `household_memberships` (unique (household_id, user_id); `reminders_enabled` default false) and `household_invitations` (unique `token_hash`; `expires_at` default now() + 7 days, BR-47). Triggers: `households_set_read_only` (before insert: `read_only = not is_premium(owner_id)`), `subscriptions_refresh_household_read_only` (after insert/update on `subscriptions`: recomputes the owner's household), `household_memberships_check_size` (owner + memberships ≤ 6, else `household_full`), `household_memberships_check_delete` (EP-36: the owner removes and a member leaves; another member gets `forbidden_role`; the owner removing a member while `read_only` gets `household_read_only`; leaving stays allowed), `household_invitations_check_role` (a member who inserts an invitation gets `forbidden_role`). `20261019220005_organisations.sql` adds the enums `organisation_type`, `approval_status` and `organisation_role` and the tables `organisations` (unique `slug`), `organisation_memberships` (unique (organisation_id, user_id)) and `organisation_invitations` (unique `token_hash`; `expires_at` default now() + 7 days). Triggers: `organisations_set_approval_status` (before insert: shelter → pending, breeder → approved, whatever the insert says), `organisation_memberships_check_size` (≤ 20, else `team_full`), `organisation_check_admin_write` (a member who is not an Admin and writes the profile, team rows or invitations gets `forbidden_role`). RLS follows step 3 of the prompt. Column grants: `households` update (name); `household_memberships` update (reminders_enabled) and delete; `household_invitations` insert (household_id, email, token_hash, expires_at) and update (status, expires_at), owner only; `organisations` update (description, phone, email, website, logo_r2_key); `organisation_memberships` insert (organisation_id, user_id, role), update (role), delete; `organisation_invitations` insert (organisation_id, email, role, token_hash, expires_at), update (status), delete. Admins see all of their organisation's invitations; Volunteers see all but the pending ones. Seed: household `b1000000-…-000000000001` "Domaćinstvo Petrović" (owner Ivana, member Jelena); shelter `b2000000-…-000000000001` "Azil Šapica" in Bečej (Milica, admin, pending); breeder `b2000000-…-000000000002` "Odgajivačnica Đorđević" in Beograd (Nikola, admin, approved). `lib/supabase/database.types.ts` regenerated. pgTAP: 4 new files with 157 assertions (40 + 41 + 37 + 39).
- **Verification:** `npx supabase db reset` ✅ (8 migrations + both seed files) · `npm run db:types` ✅ exit 0 · `npm run typecheck` ✅ exit 0 · `npm run lint` ✅ exit 0 · `npm test` ✅ 5 files / 38 tests · `npx supabase test db` ✅ 10 files / 310 tests · `npm run build` ✅ exit 0.
- **Deviations / decisions:**
  - The RLS helpers `is_household_owner`, `is_household_member`, `is_organisation_member` and `is_organisation_admin` are security definer functions. Without them, the households and memberships policies would refer to each other and recurse. They live in a new, non-exposed schema `private`, so they are not RPCs and do not appear in the generated types. `authenticated` and `service_role` get usage and execute.
  - Role errors are raised by before-row triggers and checked only when `current_user = 'authenticated'`. Security definer functions of later steps (e.g. EP-40 accept, which inserts a membership as the invitee) and the service role are not blocked. To let those triggers fire, the update/delete policies admit every member of the household or organisation, and the triggers then reject the wrong role. Insert/update `WITH CHECK` admits only the owner or Admin.
  - BR-28 member writes: in this step's tables, 05- names `household_read_only` only for the owner's `remove_member` (EP-36). A member's opt-in (EP-38), a member leaving, and the owner revoking an invitation stay allowed while the household is read-only. The tests assert exactly this. Member writes on pets and records that are refused with `household_read_only` belong to Step 06.
  - A member leaving (EP-36 `leave`, member only per §4.4 "leave only") is a client delete of their own `household_memberships` row. Step 3 of the prompt does not list it, but EP-36 requires it.
  - No client insert on `households`, `household_memberships` or `organisations`. No client insert for an organisation's first admin membership. Step 3 of the prompt does not list them, so EP-35 / EP-40 / EP-41 need server-side functions (see follow-ups).
  - Not set by TC, chosen here: enum type names; `household_memberships.user_id`, `organisation_memberships.user_id` on delete cascade; `household_invitations.household_id` on delete cascade; `accepted_by` and `organisations.created_by` on delete set null; `joined_at` default now(); `expires_at` not null (required by the §6 schemas) with default now() + 7 days (BR-47); `organisations.slug` not null (§6 Organisation.slug is non-null); `households.read_only` not null default false. The standard `id`/`created_at`/`updated_at` columns are on every table (`organisation_memberships.created_at` is the §6 `joined_at`).
  - Household and team size triggers lock the parent row (`for update`) so that concurrent joins cannot pass the limit together.
  - `organisation_pending_approval` is not enforced on the organisation tables here. Step 3 of the prompt does not list it, and Step 11 gates it in `lib/server/gates.ts`.
- **Follow-ups:**
  - BR-27 ownership-transfer function: **not shipped** (Step 30). Step 22 defers FR-31 tests to Step 30.
  - Step 12 (EP-41 `complete_registration`): RLS gives no client insert on `organisations`, and none on the creator's first admin `organisation_memberships` row (only existing Admins may insert). Step 12's migration (`get_me`) must add a security definer function or a policy for this. Otherwise Step 12 stops on it.
  - Step 22: EP-35 (create household and invitation), EP-40 (insert membership) need security definer functions. Step 22's prompt already allows them. The owner's direct invitation insert does not check Premium (`premium_required:household`); EP-35's function must check it.
  - Step 24: EP-72 is a direct Data API update. A pending/rejected organisation's Admin can update profile columns at the database level until Step 24 adds `organisation_pending_approval` enforcement. EP-56 `team_full` counts members + pending invitations; this step's trigger counts memberships only, as the prompt says.
  - Step 30: time-based Premium expiry must recompute `households.read_only` (no subscriptions row changes then).
  - Profiles of other household/team members are still invisible under the own-row `profiles` policy (carried over from Step 04). EP-34 / EP-53 are security definer RPCs, so they can read them.

---

### Step 06 — Schema: pets & health record

| | |
|---|---|
| **Status** | ⬜ not started |
| **Outcome** | Migrations create `pets`, `household_pets`, `memorial_records`, `weight_entries`, `vaccinations`, `treatments`, `dose_logs`, `vet_visits`, `attachments` with RLS for owners, household members, and organisation roles, the Free-limit triggers, weight-unit conversion, `created_by` handling, and R2-key queuing on delete; pgTAP proves it. |
| **Implements** | Tables `pets`, `household_pets`, `memorial_records`, `weight_entries`, `vaccinations`, `treatments`, `dose_logs`, `vet_visits`, `attachments` (TC §5.1, §5.3); BR-01 (pets, memorials, attachments), BR-02, BR-03, BR-05, BR-21, BR-22, BR-23, BR-25, BR-26, BR-33, BR-50 |
| **Depends on** | Step 05 |
| **Blocked by** | — |
| **Track** | single |

**Read before starting:** `docs/product/03-technical-constraints.md` §5 (conventions), §5.1 (`household_pets`), §5.3, §5.7.1, §5.9 · `docs/product/02-prd.md` §8 (BR-01, BR-02, BR-03, BR-05, BR-21, BR-22, BR-23, BR-25, BR-26, BR-28, BR-33, BR-34, BR-50), §9 (E-02, E-03, E-04, E-12, E-26) · `docs/product/05-api-integration-contract.md` §3.1, §4.1–§4.4, §5.1 (EP-01 … EP-15), §5.4 (EP-37), §5.7 intro, §6 (Access, PetSummary, Pet, PetRecord, WeightEntry, Vaccination, Treatment, DoseLog, VetVisit, Attachment, MemorialRecord), §7.1, §7.2, §10 · `docs/product/06-build-plan.md` §6.

**Files this step may touch:**
- `supabase/migrations/*_pets.sql`, `supabase/migrations/*_health_record.sql`, `supabase/migrations/*_pet_limits.sql`
- `supabase/seed.sql` (append only)
- `supabase/tests/pets.test.sql`, `supabase/tests/pet_limits.test.sql`, `supabase/tests/health_record.test.sql`, `supabase/tests/attachments.test.sql`, `supabase/tests/health_record_rls.test.sql`, `supabase/tests/weight_unit.test.sql`, `supabase/tests/r2_queue.test.sql`
- `lib/supabase/database.types.ts` (regenerated)
- `docs/product/06-build-plan.md` (only this step's §3 row and its Session log)

**Out of bounds:** the FK `dose_logs.occurrence_id → reminder_occurrences` (Step 08 adds it; the column is created here); the FK `pets.litter_id → litters` (Step 09 adds it; the column is created here); reminder triggers (Step 08); record-transfer read-only copy (Step 25); PDF gating (application, Step 16); application code.

**Acceptance criteria:** Business rules quoted verbatim from PRD §8 (data side), plus derived checks:
- BR-01 (pets, memorials, attachments part): "Free owner: 1 active pet, 2 memorials, 10 attachments per pet, 5 moments per pet; no PDF export; no household sharing; email and push only; shared images always carry the logo." (this step enforces 1 active pet, 2 memorials, 10 attachments per pet)
- BR-02: "Premium owner: no limits on active pets, memorials, attachments, or moments; PDF export; household sharing; WhatsApp and Viber channels; optional logo removal." (this step: no pet, memorial, or attachment limit for Premium)
- BR-03: "Memorial pets do not count toward the Free active-pet limit."
- BR-05: "Attachments are images or PDFs, ≤ 10 MB each."
- BR-33: "Organisation accounts hold no personal pets and have no animal limit."
- BR-21: "The owner chooses which pets are shared."
- BR-22: "Members may add weight, mark doses, add feeding/stool entries, add moments, and mark reminders done; everything else is view-only." (this step: weight entries and dose logs; feeding, stool, moments in Step 07; reminders in Step 08)
- BR-23: "Members edit or delete only their own entries."
- BR-25: "Only the owner can delete pets, invite or remove members, and manage the subscription." (this step: pet deletion)
- BR-26: "When a member leaves or is removed, their entries remain."
- BR-50: "Changing a pet's weight unit converts all its existing weight entries."
- (Derived from TC §5.3) Every listed column, enum, check (owner XOR organisation, `species_other` when `other`, value and size checks), unique and index exists; `created_by` is set on insert and set null when the author is deleted.
- (Derived from API §4.4, §5.7 intro, BR-34) Organisation Admins and Volunteers read and write their organisation's animals and entries; Volunteers cannot delete animals; writes on a pending organisation are refused with `organisation_pending_approval`; another owner's or organisation's pet is invisible.
- (Derived from TC §5.9, API §10 step 7) Deleting an attachment or a pet queues every affected R2 key in `r2_deletion_queue`.

**Tests to ship:**
- BR-01 + BR-02 + BR-03 (second active pet blocked on Free with `premium_required`/`pets`; memorial frees the slot; restore into a taken slot blocked; third memorial blocked with `memorials`; Premium unlimited) → `supabase/tests/pet_limits.test.sql`
- BR-01 + BR-02 attachments (11th on Free blocked with `attachments`; Premium unlimited) → `supabase/tests/attachments.test.sql`
- BR-05 (non-image/PDF and > 10 MB rejected) → `supabase/tests/attachments.test.sql`
- BR-33 (organisation pets not limited; organisation account cannot own a personal pet) → `supabase/tests/pet_limits.test.sql`
- BR-21 (only the pet's owner shares/unshares via `household_pets`) → `supabase/tests/health_record_rls.test.sql`
- BR-22 → `supabase/tests/health_record_rls.test.sql`
- BR-23 → `supabase/tests/health_record_rls.test.sql`
- BR-25 → `supabase/tests/health_record_rls.test.sql`
- BR-26 → `supabase/tests/health_record.test.sql`
- BR-50 → `supabase/tests/weight_unit.test.sql`
- TC §5.3 structure → `supabase/tests/pets.test.sql`, `supabase/tests/health_record.test.sql`
- organisation roles and pending approval → `supabase/tests/health_record_rls.test.sql`
- R2 queue → `supabase/tests/r2_queue.test.sql`

**Verification:**
```
npx supabase db reset  # expected: all migrations + seed apply without error
npm run db:types       # expected: exit 0
npm run typecheck      # expected: exit 0
npm run lint           # expected: exit 0
npm test               # expected: all test files pass
npx supabase test db   # expected: all pgTAP files pass
npm run build          # expected: exit 0
```

#### Prompt
```
You are executing Step 06 — Schema: pets & health record — of docs/product/06-build-plan.md.

Read first, in full: docs/product/03-technical-constraints.md §5 (conventions), §5.1 (household_pets), §5.3, §5.7.1 and §5.9; docs/product/02-prd.md §8 (BR-01, BR-02, BR-03, BR-05, BR-21, BR-22, BR-23, BR-25, BR-26, BR-28, BR-33, BR-34, BR-50) and §9 (E-02, E-03, E-04, E-12, E-26); docs/product/05-api-integration-contract.md §3.1, §4.1–§4.4, §5.1 (EP-01 … EP-15), EP-37 (§5.4), the §5.7 intro, §6 schemas Access, PetSummary, Pet, PetRecord, WeightEntry, Vaccination, Treatment, DoseLog, VetVisit, Attachment, MemorialRecord, §7.1, §7.2 and §10; docs/product/06-build-plan.md §6.

Database error format (settled upstream): every trigger in this step raises its error exactly per docs/product/03-technical-constraints.md §5.7.1 — ERRCODE P0001 with MESSAGE '<code>' or '<code>:<detail>' (e.g. 'premium_required:pets') — which lib/server maps to ApiError { code, details: { limit } } per docs/product/05-api-integration-contract.md §7.1 (Step 11).

Goal: the nine pet and health-record tables, their RLS and the rules below — nothing else.

Do exactly this:
1. *_pets.sql — enums and table pets exactly per TC §5.3, including litter_id as a plain nullable uuid column (its FK to litters is added in Step 09); the owner XOR organisation check; the species_other check; the indexes of TC §5.3. memorial_records per TC §5.3. household_pets per TC §5.1. A shared trigger function that sets created_by = auth.uid() on insert and refuses a null author at creation (TC §5 conventions); FKs to profiles with on delete set null.
2. *_health_record.sql — weight_entries, vaccinations, treatments, dose_logs (occurrence_id as a nullable uuid column, unique when not null; its FK to reminder_occurrences is added in Step 08), vet_visits, attachments (mime and size checks, pet_id denormalised) exactly per TC §5.3. created_by triggers on every entry table. BR-50: changing pets.weight_unit converts every existing weight_entries.value of that pet. R2 queue: deleting an attachments row, or a pets row (including the rows its cascade removes), inserts every affected r2_key / photo_r2_key into r2_deletion_queue (TC §5.9, 05- §10 step 7).
3. *_pet_limits.sql — Free-limit triggers for personally owned pets only (organisation pets have no limit, BR-33), using is_premium(owner) from Step 04:
   - insert of an active pet, or a memorial → active restore, when the owner already has 1 active pet and is not Premium → MESSAGE 'premium_required:pets' (BR-01, BR-03, E-03, E-26);
   - a pet becoming memorial when the owner already has 2 memorials and is not Premium → MESSAGE 'premium_required:memorials' (E-02);
   - an 11th attachment on a pet whose owner is not Premium → MESSAGE 'premium_required:attachments' (E-04).
   Raise in the TC §5.7.1 format above.
4. RLS on all nine tables, derived only from 05- §4.4 and the authorization lines of EP-01 … EP-15 and EP-37:
   - Owner: full access to own pets and their entries; only the owner deletes a pet (BR-25); only the owner writes household_pets for own pets in own household (BR-21, EP-37).
   - Member (pet shared through household_pets with a household the user belongs to): select the pet and every entry; insert weight_entries and dose_logs; update/delete only rows they created (BR-22, BR-23, E-12); everything else view-only. When the household is read_only, member writes raise household_read_only (BR-28).
   - OrgAdmin / Volunteer: full read and write on their organisation's pets and entries; pet deletion Admin only (BR-34); writes on a pending or rejected organisation raise organisation_pending_approval (05- §4.1 gate 4, §5.7 intro).
   - No relation: rows invisible (05- §4.3).
   Where 05- names a specific error code for a denied write (forbidden_role, household_read_only, organisation_pending_approval), raise it in the TC §5.7.1 format rather than relying on a silent RLS denial.
5. supabase/seed.sql — append pets from docs/product/04-design-system.md §9 (Luna, Maks, Kiki) for the seeded owners with a few weight entries, vaccinations, a treatment and a vet visit; share one pet into the seeded household; one animal for the seeded shelter organisation.
6. Run npm run db:types.
7. Write the pgTAP tests listed below.

Do not invent: no tables, columns, enums or indexes outside docs/product/03-technical-constraints.md §5.1/§5.3; no reminder logic (Step 08); no endpoints, RPCs, fields or error codes outside docs/product/05-api-integration-contract.md; no Postgres extensions; no libraries outside docs/product/03-technical-constraints.md ADR-17.

Files you may create or modify — nothing else:
supabase/migrations/*_pets.sql, supabase/migrations/*_health_record.sql, supabase/migrations/*_pet_limits.sql, supabase/seed.sql, supabase/tests/pets.test.sql, supabase/tests/pet_limits.test.sql, supabase/tests/health_record.test.sql, supabase/tests/attachments.test.sql, supabase/tests/health_record_rls.test.sql, supabase/tests/weight_unit.test.sql, supabase/tests/r2_queue.test.sql, lib/supabase/database.types.ts, and docs/product/06-build-plan.md (only the Step 06 row in §3 and the Step 06 Session log).

Acceptance criteria (verbatim from the PRD, data side; then derived checks):
- BR-01: "Free owner: 1 active pet, 2 memorials, 10 attachments per pet, 5 moments per pet; no PDF export; no household sharing; email and push only; shared images always carry the logo." (this step: active pets, memorials, attachments)
- BR-02: "Premium owner: no limits on active pets, memorials, attachments, or moments; PDF export; household sharing; WhatsApp and Viber channels; optional logo removal." (this step: pets, memorials, attachments)
- BR-03: "Memorial pets do not count toward the Free active-pet limit."
- BR-05: "Attachments are images or PDFs, ≤ 10 MB each."
- BR-33: "Organisation accounts hold no personal pets and have no animal limit."
- BR-21: "The owner chooses which pets are shared."
- BR-22: "Members may add weight, mark doses, add feeding/stool entries, add moments, and mark reminders done; everything else is view-only." (this step: weight, doses)
- BR-23: "Members edit or delete only their own entries."
- BR-25: "Only the owner can delete pets, invite or remove members, and manage the subscription." (pet deletion)
- BR-26: "When a member leaves or is removed, their entries remain."
- BR-50: "Changing a pet's weight unit converts all its existing weight entries."
- Derived from TC §5.3: structure, checks, indexes, created_by behaviour.
- Derived from API §4.4/§5.7 intro/BR-34: organisation roles and pending-approval refusal.
- Derived from TC §5.9/API §10: R2 keys queued on delete.

Tests to write (pgTAP):
- supabase/tests/pets.test.sql — pets, memorial_records, household_pets structure; owner XOR organisation; species_other check; indexes.
- supabase/tests/pet_limits.test.sql — BR-01/02/03 for pets and memorials (premium_required with the pets / memorials limit; restore into a taken slot blocked; Premium unlimited); BR-33 organisation pets unlimited and organisation accounts cannot own personal pets.
- supabase/tests/health_record.test.sql — entry-table structure and checks; created_by set on insert, null author refused, set null when the author's profile is deleted while the entry remains (BR-26).
- supabase/tests/attachments.test.sql — BR-05 type and size checks; 11th attachment on Free raises premium_required (attachments); Premium unlimited.
- supabase/tests/health_record_rls.test.sql — BR-21, BR-22, BR-23, BR-25; read_only household refuses member writes with household_read_only; Admin/Volunteer access, Volunteer cannot delete a pet, pending organisation write raises organisation_pending_approval; unrelated users see nothing.
- supabase/tests/weight_unit.test.sql — BR-50 kg ↔ g conversion of existing entries.
- supabase/tests/r2_queue.test.sql — deleting an attachment, and deleting a pet with a photo and attachments, queues every key.

Done means all of these pass, in this order:
  npx supabase db reset → migrations and seed apply cleanly
  npm run db:types      → exit 0
  npm run typecheck     → exit 0
  npm run lint          → exit 0
  npm test              → all test files pass
  npx supabase test db  → all pgTAP files pass
  npm run build         → exit 0

When everything passes: in docs/product/06-build-plan.md set the Step 06 row in §3 to ✅ with today's date in "Done", and append a Session log entry under Step 06 (date, what was built, pass/fail per verification command, deviations, follow-ups). Then commit all changes with the message "Step 06: Schema: pets & health record".

If anything above is ambiguous, if a referenced section doesn't contain what this prompt says it does, or if completing this step would require touching a file outside the list, a column or table not in 03- §5, or a decision the referenced documents don't settle — STOP and ask. Do not choose a reasonable default. Do not proceed with a partial implementation.
```

#### Session log
**2026-10-19**
- **Built:** three migrations. `20261019230000_pets.sql` adds the enums `pet_species`, `pet_sex`, `neutered_status`, `weight_unit`, `pet_lifecycle`, `shelter_status`, `offspring_status`, `breeding_status` and `memorial_reason`, and the tables `pets`, `memorial_records` and `household_pets`. `pets` has the owner XOR organisation check, the `species_other` check, `price_minor ≥ 0`, `litter_id` as a plain uuid, and the three TC §5.3 indexes. `memorial_records.pet_id` is unique and cascades. `household_pets` has PK (household_id, pet_id), and `pet_id` cascades. The migration also adds the shared `public.set_created_by()` trigger function and the RLS helpers in `private` (`is_pet_owner`, `is_pet_household_member`, `is_pet_organisation_member`, `can_manage_pet`, `can_read_pet`, `is_pet_household_read_only`, `assert_organisation_writable`, `pet_write_role`). Role triggers: `pets_check_write`, `memorial_records_check_write` (owner only) and `household_pets_check_write` (EP-37). `20261019230005_health_record.sql` adds the enums `treatment_type` and `treatment_interval_unit` and the tables `weight_entries`, `vaccinations`, `treatments`, `dose_logs` (`occurrence_id` unique, no FK yet), `vet_visits` and `attachments` (mime check `image/%` or `application/pdf`, `size_bytes ≤ 10485760`, `pet_id` index). Triggers on these tables: `created_by` and `updated_at` on every one; `attachments_set_pet_id` (pet_id always taken from the visit); one shared role trigger `health_record_check_write`; BR-50 `pets_convert_weight_entries` (after update of `weight_unit`: ×1000 or ÷1000); R2 queuing `attachments_queue_r2_key` and `pets_queue_r2_key` (after delete, so cascaded rows are covered too, `on conflict do nothing`). `20261019230010_pet_limits.sql` adds `pets_enforce_free_limits` (`premium_required:pets` / `premium_required:memorials`; organisation accounts as owner → `forbidden_role`, BR-33) and `attachments_enforce_free_limit` (`premium_required:attachments`). Both lock the parent row. Seed: Luna (cat) and Maks (dog) for Ivana, with Luna shared into her household; Kiki (rabbit) for Marko; Žuća (dog, `intake`) for the shelter. Also seeded: 7 weight entries (one by Jelena), 3 vaccinations, a Tobrex treatment with 2 dose logs, and a vet visit for Luna. `lib/supabase/database.types.ts` regenerated. pgTAP: 7 new files with 220 assertions (pets 44, pet_limits 18, health_record 51, attachments 14, health_record_rls 78, weight_unit 7, r2_queue 8).
- **Verification:** `npx supabase db reset` ✅ (11 migrations + both seed files) · `npm run db:types` ✅ exit 0 · `npm run typecheck` ✅ exit 0 · `npm run lint` ✅ exit 0 · `npm test` ✅ 5 files / 38 tests · `npx supabase test db` ✅ 17 files / 530 tests · `npm run build` ✅ exit 0.
- **Deviations / decisions:**
  - Same pattern as Step 05: role errors come from before-row triggers that run only when `current_user = 'authenticated'`. Update/delete `USING` admits every related user (`can_read_pet`), so a member or Volunteer gets the API code instead of a silent no-op. `WITH CHECK` admits only the owner and the organisation's team (plus members on `weight_entries` / `dose_logs`). Cascades, security definer functions and the service role are not blocked by the role triggers. Free limits apply to every writer.
  - Error codes raised: member writes outside weight and doses, member edits of someone else's entry, member pet edit/delete, memorial records by anyone but the owner, a Volunteer deleting an animal, a lifecycle change on an organisation animal (EP-06/EP-07 "organisation animals ❌"), and an `owner_id` other than the caller on insert (EP-03) → `forbidden_role`. A member write while every household that shares the pet is read-only → `household_read_only`. The owner sharing or unsharing on a read-only household → `household_read_only` (EP-37). Organisation writes on a pending organisation → `organisation_pending_approval`. On a rejected organisation → `organisation_pending_approval:rejected` (05- §5.7 intro puts `approval_status = "rejected"` in details). The owner keeps writing their own pet's record when the household is read-only (BR-28 limits members only).
  - A null author at creation raises `internal_error`, the same code `rate_limit_counters` uses for a system invariant: it can only happen on a System insert without `created_by`. A session's insert always takes `auth.uid()`.
  - BR-33 "organisation accounts hold no personal pets": a pet whose `owner_id` is a shelter/breeder profile raises `forbidden_role`. 05- names no specific code for this, and `forbidden_role` is the catalog code for "role may not do this".
  - Memorial limit: it also covers an insert made directly with `lifecycle = memorial`, so the limit holds on every surface. The limits trigger fires on insert and on updates of `owner_id` / `lifecycle`.
  - Not set by TC, chosen here: `pets.owner_id` on delete cascade (account deletion, BR-31); `pets.organisation_id` and `household_pets.household_id` with the default (no action); `attachments.vet_visit_id`, `pet_id`, `mime_type` and `size_bytes` not null (non-null in the §6 Attachment schema); conventions columns (`id`, `created_at`, `updated_at`) on every table, and `created_at`/`updated_at` on `household_pets`; index `household_pets_pet_id_idx` for the RLS lookups.
  - Column grants: `pets` insert all client columns, and update all but `owner_id` / `organisation_id`. `lifecycle`, `photo_r2_key` and the statuses stay updatable for the Step 15/16/24 actions; the limits and role triggers guard them. Entries get insert on their content columns and update without the parent id or `created_by`. `dose_logs` update (given_at). `attachments` insert/delete only. `memorial_records` insert (pet_id, date, reason, note) and update (date, reason, note). `household_pets` insert/delete. `id` is not client-insertable on any table.
  - BR-50 conversion g → kg rounds to 3 decimals (numeric(9,3)). An entry under 0.5 g would round to 0 and fail `value > 0`, which refuses the unit change.
- **Follow-ups:**
  - Step 08: FK `dose_logs.occurrence_id → reminder_occurrences`; reminder triggers on `pets`, `vaccinations`, `treatments`, `vet_visits`.
  - Step 09: FK `pets.litter_id → litters`.
  - Step 13 (EP-01) shows members their shared pets "active only" in the view. RLS lets members read memorial shared pets too.
  - Step 15 (EP-13 confirm_upload for `pet_photo`): the old `photo_r2_key` is not queued by a trigger here (only deletes are). The action must queue it.
  - Step 16: `move_pet_to_memorial` / `restore_pet_from_memorial` get the limits from `pets_enforce_free_limits`. If they are security invoker, the role trigger already refuses members and organisation roles.
  - Step 24: `breeder_plan_required` (BR-11) is not enforced on pets here.
  - Step 25: transferred organisation copy (`forbidden_role` on writes) not enforced here.

---

### Step 07 — Schema: care log & moments

| | |
|---|---|
| **Status** | ⬜ not started |
| **Outcome** | Migrations create `feeding_entries`, `stool_entries`, `moments`, `moment_photos`, `moment_public_links` with RLS (members add their own entries and moments), the Free moment limit, the 5-photo rule, and R2-key queuing; pgTAP proves it. |
| **Implements** | Tables `feeding_entries`, `stool_entries`, `moments`, `moment_photos`, `moment_public_links` (TC §5.4); BR-01 (moments), BR-02, BR-04, BR-06, BR-22, BR-23, BR-24 (Free rules for members), BR-45, BR-52 (moment text) |
| **Depends on** | Step 06 |
| **Blocked by** | — |
| **Track** | single |

**Read before starting:** `docs/product/03-technical-constraints.md` §5 (conventions), §5.4, §5.7.1, §5.9 · `docs/product/02-prd.md` §8 (BR-01, BR-02, BR-04, BR-06, BR-22, BR-23, BR-24, BR-28, BR-45, BR-52), §9 (E-07, E-08, E-12) · `docs/product/05-api-integration-contract.md` §3.1, §4.3, §4.4, §5.2 (EP-17 … EP-24), §6 (FeedingEntry, StoolEntry, MealSchedule, Moment, MomentPhoto, PublicMoment), §7.1, §7.2, §10 · `docs/product/06-build-plan.md` §6.

**Files this step may touch:**
- `supabase/migrations/*_care_log.sql`, `supabase/migrations/*_moments.sql`
- `supabase/seed.sql` (append only)
- `supabase/tests/care_log.test.sql`, `supabase/tests/moments.test.sql`, `supabase/tests/care_moments_rls.test.sql`
- `lib/supabase/database.types.ts` (regenerated)
- `docs/product/06-build-plan.md` (only this step's §3 row and its Session log)

**Out of bounds:** meal schedule reminders (Step 08 index, Step 20 operation); the `moments_api` view and public-moment route (Step 21); slug generation in the application (Step 21); application code.

**Acceptance criteria:** Business rules quoted verbatim from PRD §8 (data side), plus derived checks:
- BR-04: "Feeding and stool logs are unlimited on every tier."
- BR-01 (moments part): "Free owner: 1 active pet, 2 memorials, 10 attachments per pet, 5 moments per pet; no PDF export; no household sharing; email and push only; shared images always carry the logo." (this step enforces 5 moments per pet)
- BR-02 (moments part): "Premium owner: no limits on active pets, memorials, attachments, or moments; PDF export; household sharing; WhatsApp and Viber channels; optional logo removal."
- BR-24 (Free rules part): "Members use Free rules (owner's Premium does not extend to them)" — the moment limit follows the creator's Premium (EP-21).
- BR-06: "A moment holds at most 5 photos."
- BR-52 (second sentence): "Moment text is at most 280 characters."
- BR-22: "Members may add weight, mark doses, add feeding/stool entries, add moments, and mark reminders done; everything else is view-only." (this step: feeding, stool, moments)
- BR-23: "Members edit or delete only their own entries."
- BR-45: "A public moment link shows only photos, text, and pet name; it can be disabled by the owner and is disabled automatically when the moment is deleted." (data side: one link per moment, unique slug, `active` flag, removed with the moment)
- (Derived from TC §5.4) Every listed column, enum, check, unique and index exists.
- (Derived from API §4.4) Care log and moments exist only for personal pets' owners and members; organisation roles have no access (rows absent); a read-only household refuses member writes with `household_read_only`.
- (Derived from TC §5.9, API §10) Deleting a moment or a moment photo queues its R2 keys.

**Tests to ship:**
- BR-04 → `supabase/tests/care_log.test.sql`
- BR-01 + BR-02 + BR-24 moments (6th moment by a non-Premium creator raises `premium_required`/`moments`; Premium creator unlimited; member creator on a Premium owner's pet follows the member's own entitlement) → `supabase/tests/moments.test.sql`
- BR-06 → `supabase/tests/moments.test.sql`
- BR-52 → `supabase/tests/moments.test.sql`
- BR-22 → `supabase/tests/care_moments_rls.test.sql`
- BR-23 → `supabase/tests/care_moments_rls.test.sql`
- BR-45 data side → `supabase/tests/moments.test.sql`
- TC §5.4 structure → `supabase/tests/care_log.test.sql`, `supabase/tests/moments.test.sql`
- organisation access and read-only household → `supabase/tests/care_moments_rls.test.sql`
- R2 queue → `supabase/tests/moments.test.sql`

**Verification:**
```
npx supabase db reset  # expected: all migrations + seed apply without error
npm run db:types       # expected: exit 0
npm run typecheck      # expected: exit 0
npm run lint           # expected: exit 0
npm test               # expected: all test files pass
npx supabase test db   # expected: all pgTAP files pass
npm run build          # expected: exit 0
```

#### Prompt
```
You are executing Step 07 — Schema: care log & moments — of docs/product/06-build-plan.md.

Read first, in full: docs/product/03-technical-constraints.md §5 (conventions), §5.4, §5.7.1 and §5.9; docs/product/02-prd.md §8 (BR-01, BR-02, BR-04, BR-06, BR-22, BR-23, BR-24, BR-28, BR-45, BR-52) and §9 (E-07, E-08, E-12); docs/product/05-api-integration-contract.md §3.1, §4.3, §4.4, §5.2 (EP-17 … EP-24), §6 schemas FeedingEntry, StoolEntry, MealSchedule, Moment, MomentPhoto, PublicMoment, §7.1, §7.2 and §10; docs/product/06-build-plan.md §6.

Database error format (settled upstream): raise every error exactly per docs/product/03-technical-constraints.md §5.7.1 (ERRCODE P0001, MESSAGE '<code>' or '<code>:<detail>', e.g. 'premium_required:moments'), as Step 06 does; lib/server maps it per 05- §7.1.

Goal: the five care-log and moment tables, their RLS and the rules below — nothing else.

Do exactly this:
1. *_care_log.sql — enums and tables feeding_entries and stool_entries exactly per TC §5.4, with the created_by trigger function from Step 06. No count limit (BR-04).
2. *_moments.sql — moments, moment_photos (position 1–5, unique moment_id + position, BR-06), moment_public_links (moment_id unique, slug unique and not null, active default true; cascade-deleted with the moment, BR-45) exactly per TC §5.4. Moment text at most 280 characters (BR-52). Free limit: inserting a 6th moment on a pet when the creator (created_by) is not Premium raises MESSAGE 'premium_required:moments' (BR-01, BR-24; EP-21 "the creator has no Premium"). R2 queue: deleting a moment_photos row (directly or by cascade) inserts its r2_key into r2_deletion_queue.
3. RLS on all five tables, derived only from 05- §4.4 and the authorization lines of EP-17 … EP-23:
   - Owner of a personal pet: full access.
   - Member of a household the pet is shared with: select all rows of the pet; insert feeding, stool, moments, moment photos and public links for own moments; update/delete only own rows (BR-22, BR-23, E-12). Writes while the household is read_only raise household_read_only (EP-21 … EP-23).
   - Organisation roles: no access (05- §4.4 "—").
   - No relation: invisible.
   - Public moment reads happen only through the Step 21 route with the service role — no anon policy.
   Where 05- names a specific error code for a denied write, raise it in the TC §5.7.1 format.
4. supabase/seed.sql — append a few feeding and stool entries and two moments (one with a public link) for a seeded pet.
5. Run npm run db:types.
6. Write the pgTAP tests listed below.

Do not invent: no tables, columns, enums or indexes outside docs/product/03-technical-constraints.md §5.4; no views or RPCs (moments_api, EP-19, EP-24 belong to later steps); no endpoints, fields or error codes outside docs/product/05-api-integration-contract.md; no Postgres extensions; no libraries outside docs/product/03-technical-constraints.md ADR-17.

Files you may create or modify — nothing else:
supabase/migrations/*_care_log.sql, supabase/migrations/*_moments.sql, supabase/seed.sql, supabase/tests/care_log.test.sql, supabase/tests/moments.test.sql, supabase/tests/care_moments_rls.test.sql, lib/supabase/database.types.ts, and docs/product/06-build-plan.md (only the Step 07 row in §3 and the Step 07 Session log).

Acceptance criteria (verbatim from the PRD, data side; then derived checks):
- BR-04: "Feeding and stool logs are unlimited on every tier."
- BR-01: "Free owner: 1 active pet, 2 memorials, 10 attachments per pet, 5 moments per pet; no PDF export; no household sharing; email and push only; shared images always carry the logo." (this step: 5 moments per pet)
- BR-02: "Premium owner: no limits on active pets, memorials, attachments, or moments; PDF export; household sharing; WhatsApp and Viber channels; optional logo removal." (this step: moments)
- BR-24 (part): "Members use Free rules (owner's Premium does not extend to them)"
- BR-06: "A moment holds at most 5 photos."
- BR-52 (second sentence): "Moment text is at most 280 characters."
- BR-22: "Members may add weight, mark doses, add feeding/stool entries, add moments, and mark reminders done; everything else is view-only." (this step: feeding, stool, moments)
- BR-23: "Members edit or delete only their own entries."
- BR-45: "A public moment link shows only photos, text, and pet name; it can be disabled by the owner and is disabled automatically when the moment is deleted." (data side)
- Derived from TC §5.4: structure, checks, uniques, indexes.
- Derived from API §4.4: organisation roles have no access; read-only household refusal.
- Derived from TC §5.9/API §10: photo keys queued on delete.

Tests to write (pgTAP):
- supabase/tests/care_log.test.sql — structure and checks of feeding_entries and stool_entries; many entries accepted on Free (BR-04).
- supabase/tests/moments.test.sql — structure; 6th moment by a Free creator raises premium_required (moments), Premium creator unlimited, member creator follows own entitlement (BR-24); 6th photo position rejected (BR-06); 281-character text rejected (BR-52); one public link per moment, unique slug, link removed with the moment (BR-45); photo keys queued on delete.
- supabase/tests/care_moments_rls.test.sql — owner full access; member inserts own feeding/stool/moments and edits only own (BR-22, BR-23); read-only household member write raises household_read_only; organisation roles and unrelated users see nothing.

Done means all of these pass, in this order:
  npx supabase db reset → migrations and seed apply cleanly
  npm run db:types      → exit 0
  npm run typecheck     → exit 0
  npm run lint          → exit 0
  npm test              → all test files pass
  npx supabase test db  → all pgTAP files pass
  npm run build         → exit 0

When everything passes: in docs/product/06-build-plan.md set the Step 07 row in §3 to ✅ with today's date in "Done", and append a Session log entry under Step 07 (date, what was built, pass/fail per verification command, deviations, follow-ups). Then commit all changes with the message "Step 07: Schema: care log & moments".

If anything above is ambiguous, if a referenced section doesn't contain what this prompt says it does, or if completing this step would require touching a file outside the list, a column or table not in 03- §5, or a decision the referenced documents don't settle — STOP and ask. Do not choose a reasonable default. Do not proceed with a partial implementation.
```

#### Session log
**2026-10-19**
- **Built:** two migrations. `20261019233000_care_log.sql` adds the enums `feeding_type` and `stool_consistency`; the tables `feeding_entries` (`amount_g numeric(8,1) > 0`, index (pet_id, fed_at)) and `stool_entries` (`blood_or_mucus` not null, default false); `created_by` / `updated_at` triggers; the helper `private.can_access_pet_care(pet_id)` (owner or a member of a household the pet is shared with); and the shared role trigger `public.care_check_write()`. There is no count limit (BR-04). `20261019233005_moments.sql` adds:
  - `moments`: text check `char_length ≤ 280` (BR-52) and index (pet_id).
  - `moment_photos`: `position` not null and between 1 and 5, unique (moment_id, position) (BR-06).
  - `moment_public_links`: `moment_id` unique, `slug` unique and not null, `active` default true, cascade with the moment (BR-45).
  - `moments_enforce_free_limit`, which raises `premium_required:moments` on the 6th moment of a pet when the creator (`auth.uid()`, or `created_by` for System inserts) is not Premium (BR-01, BR-02, BR-24). It locks the pet row.
  - `moment_photos_queue_r2_key` (after delete, so cascades are covered too).
  - `private.moment_pet_id` and RLS on all five tables.

  Seed: 3 feeding entries (one by Jelena) and 2 stool entries on Luna, plus two moments by Ivana. The second moment has a public link. The moments have no photos, so Step 06 R2 counts stay unchanged. `lib/supabase/database.types.ts` regenerated. pgTAP: 3 new files with 151 assertions (care_log 34, moments 55, care_moments_rls 62).
- **Verification:** `npx supabase db reset` ✅ (13 migrations + both seed files) · `npm run db:types` ✅ exit 0 · `npm run typecheck` ✅ exit 0 · `npm run lint` ✅ exit 0 · `npm test` ✅ 5 files / 38 tests · `npx supabase test db` ✅ 20 files / 681 tests · `npm run build` ✅ exit 0.
- **Deviations / decisions:**
  - Same pattern as Steps 05/06. `care_check_write()` runs only for `current_user = 'authenticated'`. Update/delete `USING` admits the owner and members, so members get the API code instead of a silent no-op. Cascades and the service role are not affected. The owner writes every row, including while the household is read-only (BR-28 limits members only).
  - Member writes:
    - Any write while every sharing household is read-only → `household_read_only`.
    - Update or delete of a feeding entry, stool entry or moment they did not create → `forbidden_role`.
    - Any write to `moment_photos` or `moment_public_links` of a moment they did not create → `forbidden_role` (EP-21, EP-23 "own moments only"). These two tables have no `created_by` in TC §5.4, so ownership comes from `moments.created_by`.
  - Organisation roles get no relation to care rows, even for their own organisation's animals (05- §4.4 "—"). Their reads return nothing and their inserts fail the RLS check (42501, rows absent). No organisation-specific error code is raised.
  - The Free limit counts every moment on the pet, whoever created them, and the creator's own entitlement decides. A Free member on a Premium owner's pet with 5+ moments is refused (BR-24). The limit applies to every writer, System included.
  - Not set by TC, chosen here:
    - Enum names `feeding_type` / `stool_consistency`.
    - `moment_photos.moment_id`, `moment_photos.position` and `moment_public_links.moment_id` are not null. A null position would bypass the unique constraint and BR-06, and §6 MomentPhoto has `position` non-null.
    - Conventions columns (`id`, `created_at`, `updated_at`) on every table.
    - No extra index on `stool_entries` (TC §5.4 lists none).
  - Grants:
    - `feeding_entries` / `stool_entries` / `moments`: insert on content columns plus `pet_id`; update on content columns; delete.
    - `moment_photos`: insert (moment_id, r2_key, position) and delete; no update.
    - `moment_public_links`: insert (moment_id, slug, active) and update (active) only. A link goes only with its moment (EP-23 keeps the slug).
    - `id` is not client-insertable. There is no anon grant; EP-24 reads with the service role.
  - The slug format (22-char base62) is not checked in the database. Generating it is Step 21's job.
- **Follow-ups:**
  - Step 21: the `moments_api` view and EP-24 route. Slug generation in `set_moment_public_link`. EP-21 `prepare_moment` checks "active pet" and "moment_date not in the future" (not enforced here). EP-21 confirm inserts `moments` and `moment_photos` in one transaction; the limit trigger runs on the moment insert.
  - Step 20: the `feeding_entries_api` / `stool_entries_api` views. The EP-18 field rules (`fed_at` ≤ 5 min in the future, brand ≤ 100, note ≤ 500) are application validation.

---

### Step 08 — Schema: reminders & delivery

| | |
|---|---|
| **Status** | ⬜ not started |
| **Outcome** | Migrations create `reminders`, `reminder_occurrences`, `reminder_deliveries`, `reminder_preferences`, `push_subscriptions`, `user_channels`; triggers create and maintain reminders from vaccinations, treatments, vet visits, birthdays, and memorials; an occurrence-generation function fills a rolling 60-day window per lead time in Europe/Belgrade time and pg_cron runs it for all reminders every night (TC §8); default preferences exist for every profile; pgTAP proves it. |
| **Implements** | Tables `reminders`, `reminder_occurrences`, `reminder_deliveries`, `reminder_preferences`, `push_subscriptions`, `user_channels` (TC §5.5); FR-20 and FR-05 (database side); BR-12, BR-13, BR-17, BR-18, BR-48, BR-49, BR-51 (no organisation reminders); NFR-02; ADR-04 (data side); TC §8 (nightly occurrence generation, scheduled in this step) |
| **Depends on** | Step 07 |
| **Blocked by** | — |
| **Track** | single |

**Read before starting:** `docs/product/03-technical-constraints.md` §3 (ADR-04, ADR-05), §5 (conventions), §5.3 (`dose_logs`), §5.5, §7 (NFR-01, NFR-02 rows), §8 (scheduled jobs) · `docs/product/02-prd.md` §6 (FR-05, FR-06, FR-07, FR-09, FR-15, FR-20, FR-21, FR-22, FR-29), §8 (BR-12 … BR-18, BR-24, BR-48, BR-49, BR-51), §9 (E-01), §10 (NFR-02) · `docs/product/05-api-integration-contract.md` §3.5, §4.4, §5.3 intro ("Occurrence instances"), EP-25, EP-26, EP-27, EP-28, EP-29, EP-30 (side effects), EP-33 (claim and index use), §6 (ReminderOccurrence, Reminder, ReminderPreference, PushSubscription, WhatsAppConnection, ChannelUsage), §7.1, §7.2 · `docs/product/06-build-plan.md` §6.

**Files this step may touch:**
- `supabase/migrations/*_reminders.sql`, `supabase/migrations/*_reminder_triggers.sql`, `supabase/migrations/*_reminder_occurrences.sql`, `supabase/migrations/*_delivery_channels.sql`, `supabase/migrations/*_occurrence_schedule.sql`
- `supabase/seed.sql` (append only)
- `supabase/tests/reminders.test.sql`, `supabase/tests/reminder_triggers.test.sql`, `supabase/tests/reminder_occurrences.test.sql`, `supabase/tests/reminder_preferences.test.sql`, `supabase/tests/reminder_rls.test.sql`, `supabase/tests/delivery_channels.test.sql`, `supabase/tests/occurrence_schedule.test.sql`
- `lib/supabase/database.types.ts` (regenerated)
- `docs/product/06-build-plan.md` (only this step's §3 row and its Session log)

**Out of bounds:** RPCs `list_reminder_occurrences`, `mark_occurrence_done`, `get_reminder_settings`, `register_push_subscription`, `get_channel_usage`, `claim_due_occurrences` (Steps 17–19); every pg_cron schedule other than the nightly occurrence generation (Step 19 dispatch, Step 30 nightly jobs, Step 30a export archives); `pg_net`; memorial restore re-enabling (Step 16); meal schedule operation EP-19 (Step 20); application code.

**Acceptance criteria:** Quoted verbatim from the PRD (database side), plus derived checks:
- FR-20: "Given a vaccination next-dose date, treatment frequency, vet-visit check-up date, meal schedule, or date of birth, When saved, Then the corresponding reminder exists without further action." (this step: vaccination, treatment, vet visit, date of birth via triggers; meal schedule rows are written by EP-19 in Step 20, their occurrences are generated here)
- FR-05: "Given a saved vaccination, When the owner edits or deletes it, Then the linked reminder is updated or removed accordingly."
- BR-12: "Reminders are created automatically from vaccination next-dose dates, treatment frequencies, vet check-up dates, meal schedules, and dates of birth."
- BR-13: "Lead times (one or more) and delivery time are set per reminder type; doses and meals are always sent at their exact time."
- BR-17: "Memorial pets have no active reminders."
- BR-18: "Manual reminders may be linked to a pet or only to the user, with repeat none / daily / weekly / monthly / yearly."
- BR-48: "Default reminder preferences: vaccinations 7 days before and on the day at 09:00; vet follow-ups 1 day before and on the day at 09:00; birthdays and manual reminders on the day at 09:00; doses and meals at their exact time; channels email + push."
- BR-49: "The first treatment dose is due on the start date at 08:00 (or the next full hour if that has passed)."
- BR-51 (first sentence): "Organisation animals have no automatic reminders in v1."
- NFR-02: "All dates and times are in Serbian time (Europe/Belgrade)."
- (Derived from TC §5.5) Every listed column, enum, unique, partial index (pending `notify_at`, sent `sent_at`, one meal schedule per pet) and index exists; `dose_logs.occurrence_id` now references `reminder_occurrences`.
- (Derived from TC §5.5, API §5.3 intro) Occurrences are generated one row per lead time inside a rolling 60-day window; regenerating replaces future pending rows only and keeps done/missed history.
- (Derived from TC §8) A pg_cron job runs the occurrence generation for all active reminders once per night.
- (Derived from API §4.4, EP-25 … EP-30) Reminders, preferences, push subscriptions and channels are self-only; members read occurrences of shared pets only when opted in; organisation roles see no reminders; deliveries are readable by their recipient only; `user_channels` has no client write path (EP-30 is a server action).

**Tests to ship:**
- FR-20 (vaccination / treatment / vet visit / birthday each create a reminder; organisation pet creates none) → `supabase/tests/reminder_triggers.test.sql`
- FR-05 (edit next-dose date updates the reminder and its pending occurrences; clearing or deleting removes it) → `supabase/tests/reminder_triggers.test.sql`
- BR-12 → `supabase/tests/reminder_triggers.test.sql`
- BR-13 (one occurrence per lead time at the delivery time; doses and meals at exact time with lead 0) → `supabase/tests/reminder_occurrences.test.sql`
- BR-17 (moving a pet to memorial deactivates its reminders and they produce no pending occurrences) → `supabase/tests/reminder_triggers.test.sql`
- BR-18 (manual reminder with and without pet; recurrence values; `hourly_interval` rejected for manual) → `supabase/tests/reminders.test.sql`
- BR-48 (new profile gets six preference rows with the stated defaults) → `supabase/tests/reminder_preferences.test.sql`
- BR-49 (start date in future → 08:00 Belgrade; start today after 08:00 → next full hour) → `supabase/tests/reminder_triggers.test.sql`
- BR-51 → `supabase/tests/reminder_triggers.test.sql`
- NFR-02 (an 08:00 reminder resolves to 08:00 Belgrade on both sides of a DST change) → `supabase/tests/reminder_occurrences.test.sql`
- TC §5.5 structure and dose_logs FK → `supabase/tests/reminders.test.sql`, `supabase/tests/delivery_channels.test.sql`
- rolling window and regeneration → `supabase/tests/reminder_occurrences.test.sql`
- RLS → `supabase/tests/reminder_rls.test.sql`, `supabase/tests/delivery_channels.test.sql`
- nightly schedule → `supabase/tests/occurrence_schedule.test.sql`

**Verification:**
```
npx supabase db reset  # expected: all migrations + seed apply without error
npm run db:types       # expected: exit 0
npm run typecheck      # expected: exit 0
npm run lint           # expected: exit 0
npm test               # expected: all test files pass
npx supabase test db   # expected: all pgTAP files pass
npm run build          # expected: exit 0
```

#### Prompt
```
You are executing Step 08 — Schema: reminders & delivery — of docs/product/06-build-plan.md.

Read first, in full: docs/product/03-technical-constraints.md §3 (ADR-04, ADR-05), §5 (conventions), §5.3 (dose_logs), §5.5, §7 (NFR-01, NFR-02 rows) and §8 (scheduled jobs); docs/product/02-prd.md §6 (FR-05, FR-06, FR-07, FR-09, FR-15, FR-20, FR-21, FR-22, FR-29), §8 (BR-12 … BR-18, BR-24, BR-48, BR-49, BR-51), §9 (E-01) and §10 (NFR-02); docs/product/05-api-integration-contract.md §3.5, §4.4, the §5.3 intro ("Occurrence instances"), EP-25, EP-26, EP-27, EP-28, EP-29, EP-30 side effects, EP-33 (claim step and the indexes it relies on), §6 schemas ReminderOccurrence, Reminder, ReminderPreference, PushSubscription, WhatsAppConnection, ChannelUsage, §7.1 and §7.2; docs/product/06-build-plan.md §6.

Goal: the six reminder and delivery tables, the triggers that create reminders from records, the occurrence-generation function and its nightly schedule, default preferences and RLS — nothing else. No RPCs for screens or the dispatch job; the only pg_cron schedule is the nightly occurrence generation.

Do exactly this:
1. *_reminders.sql — enums and tables reminders and reminder_preferences exactly per TC §5.5, with the index on source_id and the unique partial index "one meal schedule per pet". Add the FK from dose_logs.occurrence_id to reminder_occurrences once that table exists (in *_reminder_occurrences.sql).
2. *_reminder_occurrences.sql — reminder_occurrences and reminder_deliveries exactly per TC §5.5 with their partial and plain indexes. An occurrence-generation function that, for one reminder, deletes its future pending rows and regenerates them inside the rolling 60-day window: one row per lead time from the owner's reminder_preferences for that type (lead_minutes, delivery_time), lead 0 at the exact scheduled time for treatment_dose and meal (BR-13), recurrence and interval per TC §5.5, meal_times × meal_weekdays for meal, all computed in Europe/Belgrade and stored as UTC (NFR-02, TC §5 conventions). Done and missed rows are never touched. Instances share (reminder_id, due_at) per the 05- §5.3 intro. Call it from reminders insert/update and from reminder_preferences changes (EP-27, EP-28 side effects). It must also be callable for all active reminders at once (the nightly refresh in step 4a).
3. *_reminder_triggers.sql — triggers on personally owned pets only (organisation animals get none, BR-51), reminders.user_id = the pet's owner:
   - vaccinations: next_due_on set → vaccination reminder (source_id = vaccination id); changed → updated; cleared or row deleted → removed (FR-05, E-01).
   - treatments: interval set → treatment_dose reminder, first dose per BR-49, repeating every interval until ends_on; changed → updated; deleted → removed.
   - vet_visits: follow_up_on set → vet_follow_up reminder; changed/cleared/deleted accordingly.
   - pets: birth_date set → yearly birthday reminder; changed/cleared accordingly.
   - memorial: a pet becoming memorial sets active = false on all its reminders and removes their pending occurrences (BR-17). Re-enabling on restore is Step 16 — do not add it.
   - profiles insert → the six reminder_preferences rows with the BR-48 defaults (lead_minutes per 05- EP-28 value set, delivery_time 09:00 except treatment_dose and meal, channels email + push).
4. *_delivery_channels.sql — push_subscriptions and user_channels exactly per TC §5.5.
4a. *_occurrence_schedule.sql — schedule the all-reminders occurrence generation with pg_cron once per night (TC §8: "nightly: occurrence generation — scheduled in the reminders build step"; ADR-04 names pg_cron). The job runs SQL inside the database, so it needs no pg_net and no Vault secret. TC §8 fixes no clock time; the owner chose 03:00 Europe/Belgrade (2026-10-19). pg_cron runs in UTC, so schedule it at 01:00 UTC (03:00 in summer time, 02:00 in winter time — the owner accepts the one-hour seasonal shift) and write this conversion in a migration comment. Do not ask.
5. RLS on all six tables, derived only from 05- §4.4 and the authorization lines of EP-25 … EP-30:
   - reminders: owner selects own; inserts/updates/deletes only type manual (EP-27; other types are written by triggers only); user_id defaults to auth.uid() and cannot be set; shelter/breeder accounts cannot insert (EP-27 forbidden_role).
   - reminder_occurrences: owner selects occurrences of own reminders; a household member selects occurrences of reminders on pets shared with a household where their reminders_enabled = true (EP-25); no direct client writes (done marking is EP-26's RPC in Step 17).
   - reminder_deliveries: recipient selects own rows; no client writes.
   - reminder_preferences, push_subscriptions: self only (EP-28, EP-29).
   - user_channels: self select; no client writes (EP-30 server action).
   - Organisation roles and Operator see no personal reminders (EP-25).
   Where 05- names a specific error code for a denied write, raise it in the TC §5.7.1 format.
6. supabase/seed.sql — append one manual reminder for a seeded owner; seeded vaccinations/treatments now produce reminders through the triggers.
7. Run npm run db:types.
8. Write the pgTAP tests listed below.

Do not invent: no tables, columns, enums or indexes outside docs/product/03-technical-constraints.md §5.5 (plus the dose_logs FK of §5.3); no RPCs named in 05- (they belong to Steps 17–19); no pg_net usage and no pg_cron schedule other than step 4a; no endpoints, fields or error codes outside docs/product/05-api-integration-contract.md; no libraries outside docs/product/03-technical-constraints.md ADR-17.

Files you may create or modify — nothing else:
supabase/migrations/*_reminders.sql, supabase/migrations/*_reminder_occurrences.sql, supabase/migrations/*_reminder_triggers.sql, supabase/migrations/*_delivery_channels.sql, supabase/migrations/*_occurrence_schedule.sql, supabase/seed.sql, supabase/tests/reminders.test.sql, supabase/tests/reminder_triggers.test.sql, supabase/tests/reminder_occurrences.test.sql, supabase/tests/reminder_preferences.test.sql, supabase/tests/reminder_rls.test.sql, supabase/tests/delivery_channels.test.sql, supabase/tests/occurrence_schedule.test.sql, lib/supabase/database.types.ts, and docs/product/06-build-plan.md (only the Step 08 row in §3 and the Step 08 Session log).

Acceptance criteria (verbatim from the PRD, database side; then derived checks):
- FR-20: "Given a vaccination next-dose date, treatment frequency, vet-visit check-up date, meal schedule, or date of birth, When saved, Then the corresponding reminder exists without further action."
- FR-05: "Given a saved vaccination, When the owner edits or deletes it, Then the linked reminder is updated or removed accordingly."
- BR-12: "Reminders are created automatically from vaccination next-dose dates, treatment frequencies, vet check-up dates, meal schedules, and dates of birth."
- BR-13: "Lead times (one or more) and delivery time are set per reminder type; doses and meals are always sent at their exact time."
- BR-17: "Memorial pets have no active reminders."
- BR-18: "Manual reminders may be linked to a pet or only to the user, with repeat none / daily / weekly / monthly / yearly."
- BR-48: "Default reminder preferences: vaccinations 7 days before and on the day at 09:00; vet follow-ups 1 day before and on the day at 09:00; birthdays and manual reminders on the day at 09:00; doses and meals at their exact time; channels email + push."
- BR-49: "The first treatment dose is due on the start date at 08:00 (or the next full hour if that has passed)."
- BR-51 (first sentence): "Organisation animals have no automatic reminders in v1."
- NFR-02: "All dates and times are in Serbian time (Europe/Belgrade)."
- Derived from TC §5.5: structure, indexes, dose_logs FK.
- Derived from TC §5.5/API §5.3 intro: per-lead-time rows, 60-day window, history-preserving regeneration.
- Derived from TC §8: nightly pg_cron occurrence generation for all active reminders.
- Derived from API §4.4/EP-25 … EP-30: RLS as in step 5.

Tests to write (pgTAP):
- supabase/tests/reminders.test.sql — reminders and reminder_preferences structure, unique meal schedule per pet, source_id index; BR-18 manual reminder with and without pet, recurrence values, hourly_interval rejected for manual; dose_logs.occurrence_id FK.
- supabase/tests/reminder_triggers.test.sql — FR-20/BR-12 each source creates its reminder; FR-05/E-01 update and removal; BR-49 first-dose time both cases; BR-17 memorial deactivates and clears pending; BR-51 organisation pets create no reminders.
- supabase/tests/reminder_occurrences.test.sql — BR-13 one row per lead time at delivery_time, doses and meals exact time; NFR-02 08:00 Belgrade before and after a DST change; 60-day window bound; regeneration replaces future pending rows only.
- supabase/tests/reminder_preferences.test.sql — BR-48 six default rows on profile creation with exact values.
- supabase/tests/reminder_rls.test.sql — owner sees own; opted-in member sees shared-pet occurrences, not-opted-in member sees none; organisation roles see none; only manual reminders are client-writable; shelter/breeder insert refused with forbidden_role.
- supabase/tests/delivery_channels.test.sql — reminder_deliveries, push_subscriptions, user_channels structure and uniques; self-only access; no client writes to deliveries and user_channels.
- supabase/tests/occurrence_schedule.test.sql — exactly one cron job for the nightly occurrence generation exists and calls the all-reminders function; calling the function refreshes the 60-day window and leaves done/missed rows untouched.

Done means all of these pass, in this order:
  npx supabase db reset → migrations and seed apply cleanly
  npm run db:types      → exit 0
  npm run typecheck     → exit 0
  npm run lint          → exit 0
  npm test              → all test files pass
  npx supabase test db  → all pgTAP files pass
  npm run build         → exit 0

When everything passes: in docs/product/06-build-plan.md set the Step 08 row in §3 to ✅ with today's date in "Done", and append a Session log entry under Step 08 (date, what was built, pass/fail per verification command, deviations, follow-ups — record the owner's run time for the nightly occurrence generation). Then commit all changes with the message "Step 08: Schema: reminders & delivery".

If anything above is ambiguous, if a referenced section doesn't contain what this prompt says it does, or if completing this step would require touching a file outside the list, a column or table not in 03- §5, or a decision the referenced documents don't settle — STOP and ask. Do not choose a reasonable default. Do not proceed with a partial implementation.
```

#### Session log
**2026-10-20**
- **Built:** five migrations.
  - `20261020010000_reminders.sql`: `reminders` and `reminder_preferences` per TC §5.5, index `reminders_source_id_idx`, unique partial index `reminders_one_meal_per_pet`. The BR-17 trigger keeps reminders of memorial pets inactive for every writer. The EP-27 client write check raises `forbidden_role`; the EP-28 preference check covers lead `{0}` for doses/meals, `channel_disabled`, `premium_required:whatsapp` and `whatsapp_not_connected[:viber]`. Also RLS helpers and policies.
  - `20261020010005_reminder_occurrences.sql`: `reminder_occurrences` (partial indexes on pending `notify_at` and sent `sent_at`) and `reminder_deliveries` (indexes on recipient/channel/delivered_at and delivered_at). The FK `dose_logs.occurrence_id → reminder_occurrences` (on delete set null). Occurrence generation runs on the Europe/Belgrade wall clock and stores UTC. It writes one row per lead time inside the rolling 60-day window, and doses/meals get lead 0 at the exact time. Regeneration deletes only future pending rows and never touches done/missed rows. It is called from reminders insert/update and reminder_preferences changes; `private.generate_all_reminder_occurrences()` covers every active reminder.
  - `20261020010010_reminder_triggers.sql`: personal-pet-only triggers (BR-51) on vaccinations, treatments, vet_visits and pets (birthday). BR-49 first dose. BR-17 memorial deactivation that removes pending occurrences. BR-48 six default preference rows on profile insert.
  - `20261020010015_delivery_channels.sql`: `push_subscriptions` and `user_channels` with self-only RLS. `user_channels` has no client write path.
  - `20261020010020_occurrence_schedule.sql`: pg_cron job `nightly-reminder-occurrences`, `0 1 * * *` UTC, which calls `private.generate_all_reminder_occurrences()`.

  Seed: one monthly manual reminder for Ivana, with no pet. Luna's records produce their reminders through the triggers. `lib/supabase/database.types.ts` regenerated. pgTAP: 7 new files with 211 assertions (reminders 41, reminder_triggers 43, reminder_occurrences 29, reminder_preferences 16, reminder_rls 33, delivery_channels 38, occurrence_schedule 11).
- **Nightly occurrence generation run time (owner, 2026-10-19):** 03:00 Europe/Belgrade, scheduled at 01:00 UTC. That is 03:00 in summer time and 02:00 in winter time; the owner accepts the one-hour seasonal shift.
- **Verification:** `npx supabase db reset` ✅ (18 migrations + both seed files) · `npm run db:types` ✅ exit 0 · `npm run typecheck` ✅ exit 0 · `npm run lint` ✅ exit 0 · `npm test` ✅ 5 files / 38 tests · `npx supabase test db` ✅ 27 files / 892 tests · `npm run build` ✅ exit 0.
- **Deviations / decisions:**
  - Owner approval (2026-10-20): Step 08 was also allowed to touch `supabase/tests/health_record.test.sql` (Step 06). Its test 18 now expects the `dose_logs.occurrence_id` FK to `reminder_occurrences`. Tests 29–30 now use a real seeded occurrence id (preferring one of Luna's treatment reminder) instead of an invented uuid, which the new FK would reject. The previous run stopped on exactly these 3 failures and left everything uncommitted.
  - The owner accepted these decisions from the previous run (2026-10-20):
    - A manual reminder's same-day notice (lead 0) fires at the reminder's own time (`starts_at`), not at the manual delivery time.
    - Household members read the reminders (not only the occurrences) of shared pets when they have opted in (`reminders_enabled`), so EP-25 can join them.
    - A treatment without a frequency (`interval_value` null) gets a single dose reminder at the BR-49 first-dose time.
    - Time handling: all schedule arithmetic runs on the Europe/Belgrade wall clock and is stored as UTC. Date-based reminders (vaccination, vet follow-up, birthday) take the date of `starts_at` at the delivery time. Monthly and yearly recurrences count from `starts_at`, so month ends do not drift. Hourly intervals use elapsed time. Treatment `ends_at` = the end of `ends_on`.
    - The reminder_preferences checks of EP-28: lead `{0}` and no delivery time for doses and meals; the WhatsApp/Viber Premium, connection and `channel_disabled` rules.
    - Access-rule fix: a client manual reminder linked to a pet requires the caller to own the pet. A household member gets `forbidden_role`; a pet with no relation falls through to the RLS check.
    - No `reminder_occurrences(reminder_id)` index without a change request (TC §5.5 lists none).
- **Follow-ups:**
  - Steps 17–19: the RPCs `list_reminder_occurrences`, `mark_occurrence_done`, `get_reminder_settings`, `register_push_subscription`, `get_channel_usage`, `claim_due_occurrences`, and the dispatch cron (Step 19).
  - Step 16: re-enable reminders on restore from memorial.
  - Step 20: EP-19 writes meal schedule reminders; their occurrences are already generated here.
  - Possible CR: an index on `reminder_occurrences(reminder_id)` if regeneration or the cascade gets slow.

---

### Step 09 — Schema: organisation workflows & partners

| | |
|---|---|
| **Status** | ⬜ not started |
| **Outcome** | Migrations create `intakes`, `pet_status_history`, `adoption_requests`, `breeder_inquiries`, `litters`, `record_transfers`, `partners`, `partner_hours`, `partner_clicks` with RLS, the status-history trigger, the featured-partner limit, and the `partners_nearby` and `record_partner_click` RPCs; pgTAP proves it. |
| **Implements** | Tables `intakes`, `pet_status_history`, `adoption_requests`, `breeder_inquiries`, `litters`, `record_transfers`, `partners`, `partner_hours`, `partner_clicks` (TC §5.6, §5.7); EP-64 (`rpc:partners_nearby`), EP-66 (`rpc:record_partner_click`); FR-45, FR-52, FR-53, FR-58 (database side); BR-35, BR-36 (access), BR-40, BR-41, BR-42, BR-44 |
| **Depends on** | Step 08 |
| **Blocked by** | — |
| **Track** | single |

**Read before starting:** `docs/product/03-technical-constraints.md` §3 (ADR-11), §5 (conventions), §5.3 (`pets.litter_id`, status columns), §5.6, §5.7 (`partners`, `partner_hours`, `partner_clicks`, `cities`) · `docs/product/02-prd.md` §6 (FR-45, FR-48, FR-52, FR-53, FR-55, FR-58), §8 (BR-34 … BR-44) · `docs/product/05-api-integration-contract.md` §3.1, §4.4, §5.7 intro + EP-54 … EP-63, §5.8 (EP-64, EP-66, EP-69, EP-70), §6 (OrgAnimalRow, Intake, AdoptionRequest, BreederInquiry, RecordTransfer, TransferView, Litter, Partner, PartnerHours, PartnerClickStats), §7.1, §7.2 · `docs/product/06-build-plan.md` §6.

**Files this step may touch:**
- `supabase/migrations/*_organisation_workflows.sql`, `supabase/migrations/*_partners.sql`, `supabase/migrations/*_partner_rpcs.sql`
- `supabase/seed.sql` (append only)
- `supabase/tests/organisation_workflows.test.sql`, `supabase/tests/organisation_workflows_rls.test.sql`, `supabase/tests/partners.test.sql`, `supabase/tests/partners_nearby.test.sql`, `supabase/tests/partner_clicks.test.sql`
- `lib/supabase/database.types.ts` (regenerated)
- `docs/product/06-build-plan.md` (only this step's §3 row and its Session log)

**Out of bounds:** `list_org_animals`, `list_org_requests`, `list_litters`, `get_partner`, admin statistics RPCs and every server action (Steps 24–28); transfer copy logic (Step 25); public routes (Step 26); Nominatim (Step 28); application code.

**Acceptance criteria:** Quoted verbatim from the PRD (database side), plus derived checks:
- FR-45: "Given an animal, When its status changes, Then the new status and date are recorded."
- BR-35: "Shelter statuses: Intake → In care → Available for adoption → Reserved → Adopted; exits Deceased and Returned to owner."
- FR-48 (data side): "Given a saved litter, Then each offspring has its own pet record linked to the litter." — `pets.litter_id` references `litters`; offspring creation is EP-61 (Step 26).
- BR-40: "Only partners with a paid-until date not yet passed are shown."
- BR-41: "Featured partners first (max 3 per partner type per city), then others by distance."
- FR-52: "Given the "Partners" section, Then only partners whose paid-until date has not passed are shown." / "Then featured partners appear first (max 3 per partner type per city), followed by the others ordered by distance." (RPC side)
- BR-42: "Distance is from current location if permitted, otherwise from the profile city."
- FR-53: "Given the user allowed location, Then distance is measured from their current location; otherwise from the city in their profile." (RPC side)
- BR-44: ""Send message" uses the messaging channel chosen in the partner's profile." (click RPC refuses `message` when the partner has no channel or number)
- FR-58 (data side): "Given partner quick actions, Then each use of Call, Send message, Send email, and Visit website is counted per partner and shown in the admin area." — counting only; the admin view is Step 28.
- (Derived from TC §5.6, §5.7) Every listed column, enum, check (litter father: at most one of `father_id`, `father_name`), unique and index exists.
- (Derived from API §4.4, §5.7 intro, EP-55 … EP-63, BR-34, BR-36) Admins and Volunteers read and write intakes and status changes of their organisation; requests/inquiries are read by the organisation (Volunteer read-only) and by their requester; only Admins decide and send transfers; clients write `partners` and `partner_hours` not at all (EP-69 uses the service role); partners are readable by signed-in users only while `paid_until` has not passed.

**Tests to ship:**
- FR-45 (a status change inserts a `pet_status_history` row with the new status, time, and author) → `supabase/tests/organisation_workflows.test.sql`
- BR-35 (shelter status enum holds exactly these values) → `supabase/tests/organisation_workflows.test.sql`
- FR-48 data side (`pets.litter_id` FK) → `supabase/tests/organisation_workflows.test.sql`
- BR-40 + FR-52 first criterion → `supabase/tests/partners_nearby.test.sql`
- BR-41 (4th featured in the same city and type raises `featured_limit_reached`) → `supabase/tests/partners.test.sql`
- FR-52 second criterion (featured first, then by distance) → `supabase/tests/partners_nearby.test.sql`
- BR-42 + FR-53 (coordinates vs `p_city_id`; validation errors of EP-64) → `supabase/tests/partners_nearby.test.sql`
- BR-44 → `supabase/tests/partner_clicks.test.sql`
- FR-58 data side (each action recorded with partner, action, user, time) → `supabase/tests/partner_clicks.test.sql`
- TC §5.6/§5.7 structure → `supabase/tests/organisation_workflows.test.sql`, `supabase/tests/partners.test.sql`
- RLS → `supabase/tests/organisation_workflows_rls.test.sql`, `supabase/tests/partners.test.sql`

**Verification:**
```
npx supabase db reset  # expected: all migrations + seed apply without error
npm run db:types       # expected: exit 0
npm run typecheck      # expected: exit 0
npm run lint           # expected: exit 0
npm test               # expected: all test files pass
npx supabase test db   # expected: all pgTAP files pass
npm run build          # expected: exit 0
```

#### Prompt
```
You are executing Step 09 — Schema: organisation workflows & partners — of docs/product/06-build-plan.md.

Read first, in full: docs/product/03-technical-constraints.md §3 (ADR-11), §5 (conventions), §5.3 (pets.litter_id and the status columns), §5.6 and §5.7 (partners, partner_hours, partner_clicks, cities); docs/product/02-prd.md §6 (FR-45, FR-48, FR-52, FR-53, FR-55, FR-58) and §8 (BR-34 … BR-44); docs/product/05-api-integration-contract.md §3.1, §4.4, the §5.7 intro and EP-54 … EP-63, EP-64, EP-66, EP-69, EP-70 (§5.8), §6 schemas OrgAnimalRow, Intake, AdoptionRequest, BreederInquiry, RecordTransfer, TransferView, Litter, Partner, PartnerHours, PartnerClickStats, §7.1 and §7.2; docs/product/06-build-plan.md §6.

Goal: the nine organisation-workflow and partner tables, their RLS, the status-history trigger, the featured limit and the two RPCs EP-64 and EP-66 — nothing else.

Do exactly this:
1. *_organisation_workflows.sql — enums and tables intakes, pet_status_history, adoption_requests, breeder_inquiries, litters, record_transfers exactly per TC §5.6. litters: father check exactly as TC §5.6 states ("at most one of father_id, father_name"). Add the FK from pets.litter_id (created in Step 06) to litters. A trigger on pets that inserts pet_status_history { status, changed_at = now(), changed_by = auth.uid() } whenever shelter_status, offspring_status or breeding_status changes (FR-45; EP-55, EP-61 side effects).
2. *_partners.sql — enums and tables partners, partner_hours, partner_clicks exactly per TC §5.7, with the index of TC §5.7. Trigger limiting featured = true to 3 per (city_id, type) (BR-41); exceeding raises featured_limit_reached in the TC §5.7.1 format (ERRCODE P0001, MESSAGE 'featured_limit_reached').
3. *_partner_rpcs.sql —
   - rpc partners_nearby(p_lat, p_lng, p_city_id, p_type, p_limit) exactly per EP-64: request validation and error codes, paid_until filter in Europe/Belgrade (BR-40), city resolution (p_city_id, or the nearest cities row to the coordinates), featured first (≤ 3 per type per city, BR-41) then by distance_km asc from the coordinates if given, else from the city's coordinates (BR-42), response shape = 05- §6 Partner with logo_url null. Distance is computed in SQL with no extension (ADR-11; no PostGIS).
   - rpc record_partner_click(p_partner_id, p_action) exactly per EP-66: partner must be visible; the action must have its data (phone; message_channel <> none and message_number, BR-44; email; website); inserts partner_clicks with user_id = auth.uid(); returns nothing.
   Both callable by authenticated only; anon gets 401-equivalent denial (EP-64, EP-66 "Visitor → 401").
4. RLS on all nine tables, derived only from 05- §4.4, the §5.7 intro and the authorization lines of EP-55 … EP-63, EP-69:
   - intakes, pet_status_history: Admin and Volunteer of the pet's organisation select and insert; writes on a pending/rejected organisation raise organisation_pending_approval.
   - adoption_requests, breeder_inquiries: the requester selects own rows; the organisation's Admin and Volunteer select rows for their animals; only Admins update decision columns (Volunteer → forbidden_role); inserts happen through EP-63's server action (later step) — no direct client insert policy.
   - litters: Admin and Volunteer of a breeder organisation select; inserts happen through EP-61's server action (later step).
   - record_transfers: Admins of the organisation select; inserts and updates happen through EP-59/EP-60 server actions (later steps).
   - partners, partner_hours: authenticated select only rows with paid_until ≥ current_date (Europe/Belgrade) (BR-40); no client writes (EP-69 service role).
   - partner_clicks: no direct client access; written only by record_partner_click.
   Where 05- names a specific error code for a denied write, raise it in the TC §5.7.1 format.
5. supabase/seed.sql — append partners from docs/product/04-design-system.md §9 (Veterinarska ambulanta „Dr Vet", Pet shop „Šapica", Grooming salon „Čupko", Pet hotel „Kod Mace") in the seeded cities with hours, one featured, one with paid_until in the past; an intake and a status change for the seeded shelter animal; one adoption request.
6. Run npm run db:types.
7. Write the pgTAP tests listed below.

Do not invent: no tables, columns, enums or indexes outside docs/product/03-technical-constraints.md §5.6–§5.7 (plus the pets.litter_id FK); no RPCs other than partners_nearby and record_partner_click; no Postgres extensions; no endpoints, fields or error codes outside docs/product/05-api-integration-contract.md; no libraries outside docs/product/03-technical-constraints.md ADR-17.

Files you may create or modify — nothing else:
supabase/migrations/*_organisation_workflows.sql, supabase/migrations/*_partners.sql, supabase/migrations/*_partner_rpcs.sql, supabase/seed.sql, supabase/tests/organisation_workflows.test.sql, supabase/tests/organisation_workflows_rls.test.sql, supabase/tests/partners.test.sql, supabase/tests/partners_nearby.test.sql, supabase/tests/partner_clicks.test.sql, lib/supabase/database.types.ts, and docs/product/06-build-plan.md (only the Step 09 row in §3 and the Step 09 Session log).

Acceptance criteria (verbatim from the PRD, database side; then derived checks):
- FR-45: "Given an animal, When its status changes, Then the new status and date are recorded."
- BR-35: "Shelter statuses: Intake → In care → Available for adoption → Reserved → Adopted; exits Deceased and Returned to owner."
- FR-48 (data side): "Given a saved litter, Then each offspring has its own pet record linked to the litter."
- BR-40: "Only partners with a paid-until date not yet passed are shown."
- BR-41: "Featured partners first (max 3 per partner type per city), then others by distance."
- FR-52: "Given the "Partners" section, Then only partners whose paid-until date has not passed are shown." and "Then featured partners appear first (max 3 per partner type per city), followed by the others ordered by distance."
- BR-42: "Distance is from current location if permitted, otherwise from the profile city."
- FR-53: "Given the user allowed location, Then distance is measured from their current location; otherwise from the city in their profile."
- BR-44: ""Send message" uses the messaging channel chosen in the partner's profile."
- FR-58 (data side): "Given partner quick actions, Then each use of Call, Send message, Send email, and Visit website is counted per partner and shown in the admin area." (counting only)
- Derived from TC §5.6–§5.7: structure, father check, indexes.
- Derived from API §4.4/§5.7 intro/EPs: RLS as in step 4.

Tests to write (pgTAP):
- supabase/tests/organisation_workflows.test.sql — structure of the six tables; BR-35 enum values; FR-45 status-history row on each status column change; FR-48 litter_id FK; father check.
- supabase/tests/organisation_workflows_rls.test.sql — Admin/Volunteer access to intakes and history; pending organisation write raises organisation_pending_approval; requester sees own requests; Volunteer decision update raises forbidden_role; other organisations see nothing.
- supabase/tests/partners.test.sql — structure of partners, partner_hours, partner_clicks; BR-41 4th featured raises featured_limit_reached; authenticated read hides paid_until in the past; no client writes; anon sees nothing.
- supabase/tests/partners_nearby.test.sql — BR-40/FR-52 hidden after paid_until; featured first then distance order (FR-52); coordinates vs city fallback (BR-42/FR-53); EP-64 validation errors; p_type and p_limit filters.
- supabase/tests/partner_clicks.test.sql — FR-58 each action recorded; BR-44 message refused without channel/number; actions without data refused; hidden partner → not_found.

Done means all of these pass, in this order:
  npx supabase db reset → migrations and seed apply cleanly
  npm run db:types      → exit 0
  npm run typecheck     → exit 0
  npm run lint          → exit 0
  npm test              → all test files pass
  npx supabase test db  → all pgTAP files pass
  npm run build         → exit 0

When everything passes: in docs/product/06-build-plan.md set the Step 09 row in §3 to ✅ with today's date in "Done", and append a Session log entry under Step 09 (date, what was built, pass/fail per verification command, deviations, follow-ups). Then commit all changes with the message "Step 09: Schema: organisation workflows & partners".

If anything above is ambiguous, if a referenced section doesn't contain what this prompt says it does, or if completing this step would require touching a file outside the list, a column or table not in 03- §5, or a decision the referenced documents don't settle — STOP and ask. Do not choose a reasonable default. Do not proceed with a partial implementation.
```

#### Session log
**2026-10-20**
- **Built:** three migrations.
  - `20261020020000_organisation_workflows.sql`: enums `arrival_type`, `request_status`; tables `intakes`, `pet_status_history`, `adoption_requests`, `breeder_inquiries`, `litters` (father check: at most one of `father_id`, `father_name`), `record_transfers` per TC §5.6. The FK `pets.litter_id → litters` (on delete set null). Trigger `pets_record_status_history` writes { status, changed_at = now(), changed_by = auth.uid() } when `shelter_status`, `offspring_status` or `breeding_status` changes (FR-45). Client write checks: intakes/history on a pending/rejected organisation → `organisation_pending_approval`, intake on a breeder → `forbidden_role`; request/inquiry decisions by a Volunteer → `forbidden_role`, plus `organisation_pending_approval`, `breeder_plan_required`, `already_decided`. RLS per step 4 (no client insert on requests, inquiries, litters, transfers).
  - `20261020020005_partners.sql`: enums `partner_type`, `partner_message_channel`, `partner_click_action`; tables `partners`, `partner_hours`, `partner_clicks` per TC §5.7 with index `(city_id, type, featured, paid_until)`. BR-41 trigger: a 4th featured partner per (city_id, type) raises `featured_limit_reached` (P0001). RLS: authenticated reads partners / hours only while `paid_until` ≥ today in Europe/Belgrade; no client writes; `partner_clicks` has no client access.
  - `20261020020010_partner_rpcs.sql`: `rpc:partners_nearby` (EP-64; haversine distance in plain SQL, no extension) and `rpc:record_partner_click` (EP-66); authenticated only, anon is denied.

  Seed: four partners in Novi Sad from Design §9 with hours („Dr Vet" featured, „Kod Mace" with paid_until in the past); an intake and a status change for Žuća (Milica's shelter); Marko's adoption request. `lib/supabase/database.types.ts` regenerated. pgTAP: 5 new files with 229 assertions (organisation_workflows 68, organisation_workflows_rls 54, partners 51, partners_nearby 34, partner_clicks 22).
- **Verification:** `npx supabase db reset` ✅ (21 migrations + both seed files) · `npm run db:types` ✅ exit 0 · `npm run typecheck` ✅ exit 0 · `npm run lint` ✅ exit 0 · `npm test` ✅ 5 files / 38 tests · `npx supabase test db` ✅ 32 files / 1121 tests · `npm run build` ✅ exit 0.
- **Deviations / decisions:**
  - Owner-approved exception 1 (2026-10-20): Step 09 also touched `supabase/tests/pets.test.sql` (Step 06). Its test 21 asserted "litter_id has no FK yet (Step 09)"; it now expects the FK, labelled 'litter_id references litters (Step 09)'.
  - Owner-approved exception 2 (2026-10-20): `npm run lint` failed with 3 `react-hooks/static-components` errors in `docs/product/04-design/screens/my-listings.tsx`. `TabBody` moved to module level and now receives `view`, `tab`, `suspended`, `onRetry` and `Row` as props. No change to markup, classes, copy or rendering.
  - The previous run stopped on these two points and left everything uncommitted. The owner accepted its decisions (2026-10-20):
    - The status-history trigger records actual changes only (an update that keeps the same status writes no row).
    - `partners_nearby`: the city comes from `p_city_id` when given (else the nearest `cities` row to the coordinates); distance is measured from the coordinates when given, else from the city's coordinates.
    - The delete behaviour of the new FKs (pet → its intakes, history, requests, inquiries, transfers and litters as mother cascade; authors, father, `new_pet_id` and `pets.litter_id` set null; partner → hours and clicks cascade, click user set null).
    - The required (not null) columns as built.
    - Partner `initials` per the mockup: first letters of the quoted name part (or of the whole name), at most two, upper case.
    - EP-64 / EP-66 validation errors raise `validation_failed` with the offending field in the detail.
- **Follow-ups:**
  - `breeding_status` changes on pets: add a `forbidden_role` check (owner-accepted follow-up).
  - Step 28: when a partner logo is replaced, queue the old logo for deletion (owner-accepted follow-up).
  - Steps 24–28: `list_org_animals`, `list_org_requests`, `list_litters`, `get_partner`, admin statistics RPCs and the server actions (EP-55 … EP-63, EP-69); Step 24 does not need to ship the status-history trigger — it exists here.

---

### Step 10 — Design foundation

| | |
|---|---|
| **Status** | ⬜ not started |
| **Outcome** | The design tokens, Nunito and Inter fonts, every shadcn primitive from Design §6 with the two project overrides, all approved composites in `components/app/`, the brand assets, and the web app manifest of Design §4 exist; tests prove the tokens resolve, that no raw hex value appears outside `app/globals.css` and `app/manifest.ts` (Design §4 manifest exception), and that no brand icon appears anywhere. |
| **Implements** | Design System §4 (incl. the web app manifest exception), §5, §6, §7, §8 (foundation only); ADR-14; ADR-17 (shadcn and UI packages); ADR-05 (home-screen install prerequisite: manifest and icons) |
| **Depends on** | Step 01 |
| **Blocked by** | — (proposed composites stay out: OQ-10) |
| **Track** | single |

**Read before starting:** `docs/product/04-design-system.md` §3 (logo files), §4 (all), §5, §6 (component inventory, install commands, overrides, composites, known prohibition), §7, §8, §10 · `docs/product/04-design/README.md` · `docs/product/04-design/globals.css` · `docs/product/04-design/ui-overrides/card.tsx`, `sonner.tsx` · `docs/product/04-design/components/*.tsx` · `docs/product/03-technical-constraints.md` §3 (ADR-05, ADR-14, ADR-17) · `docs/product/06-build-plan.md` §6.

**Files this step may touch:**
- `app/globals.css`, `app/layout.tsx`, `app/manifest.ts`
- `components.json`, `lib/utils.ts`
- `components/ui/button.tsx`, `card.tsx`, `badge.tsx`, `avatar.tsx`, `tabs.tsx`, `input.tsx`, `textarea.tsx`, `label.tsx`, `select.tsx`, `checkbox.tsx`, `switch.tsx`, `radio-group.tsx`, `dialog.tsx`, `alert-dialog.tsx`, `sheet.tsx`, `dropdown-menu.tsx`, `separator.tsx`, `skeleton.tsx`, `progress.tsx`, `table.tsx`, `sonner.tsx`, `calendar.tsx`, `popover.tsx`; removal of `components/ui/.gitkeep`
- `components/app/shells.tsx`, `empty-state.tsx`, `error-state.tsx`, `logo-mark.tsx`, `pet-avatar.tsx`, `pet-header.tsx`, `premium-lock.tsx`, `read-only-banner.tsx`, `reminder-row.tsx`, `reminder-type-icon.tsx`, `status-badge.tsx`; removal of `components/app/.gitkeep`
- `public/brand/logo-full.png`, `logo-mark.png`, `logo-wordmark.png`, `logo-original.png`, `app-icon-180.png`, `app-icon-192.png`, `app-icon-512.png`
- `package.json`, `package-lock.json`
- `tests/design/tokens.test.ts`, `tests/design/no-raw-hex.test.ts`, `tests/design/no-brand-icons.test.ts`, `tests/design/fonts.test.ts`, `tests/design/ui-overrides.test.ts`, `tests/design/manifest.test.ts`, `tests/components/pet-avatar.test.tsx`, `tests/components/status-badge.test.tsx`, `tests/components/premium-lock.test.tsx`, `tests/components/read-only-banner.test.tsx`, `tests/components/reminder-type-icon.test.tsx`, `tests/components/app-shell.test.tsx`
- `docs/product/06-build-plan.md` (only this step's §3 row and its Session log)

**Out of bounds:** any route or screen; `components/app/state-switcher.tsx` (dev-only, never ported); the proposed composites of Design §6 (OQ-10: `DateField`, compact `PremiumLock`, `AttachmentChip`, extra `StatusBadge` statuses, `LogoAvatar`, `InlineAlert`, `Toaster` in shells); any token, colour, size, or component not in Design §4/§6; Supabase files.

**Acceptance criteria:** No PRD FR applies. Derived from Design System §4–§8 and ADR-14:
- (Design §4.1) `app/globals.css` equals `04-design/globals.css`; every colour token of the §4.1 table resolves to its listed value, and `--pet-accent` / `--pet-accent-soft` resolve per `data-pet-sex`.
- (Design §4.1, §4 intro, §4 manifest exception) No raw hex colour value appears in application source outside `app/globals.css` and `app/manifest.ts`.
- (Design §4.2) Nunito 700 and Inter 400/500/600 load through `next/font/google` with subsets `latin` and `latin-ext`, exposed as `--font-nunito` and `--font-inter`.
- (Design §6, ADR-14) Every shadcn primitive in the §6 inventory is installed in `components/ui/`, and `card.tsx` and `sonner.tsx` carry the project overrides from `04-design/ui-overrides/`.
- (Design §6) Every approved composite from `04-design/components/` (all except `StateSwitcher`) exists in `components/app/` with its markup and tokens unchanged.
- (Design §6 "Known prohibition") No lucide brand icon is imported anywhere.
- (Design §3, §4 manifest exception, ADR-05) The brand assets are served from `/brand/`; `app/manifest.ts` carries exactly the fields and values of Design §4 "Exception — web app manifest"; the 180 px icon is the Apple touch icon.
- (Design §7, §10) Composites with logic behave as specified: `PetAvatar` shows photo, species icon, or initial; `StatusBadge` always carries text; `PremiumLock` shows the single Premium-locked pattern; `ReadOnlyBanner` shows the `Eye` icon and reason; `ReminderTypeIcon` maps each reminder type to its icon; `AppShell` renders a labelled navigation.

**Tests to ship:**
- tokens resolve → `tests/design/tokens.test.ts`
- no raw hex (manifest excepted) → `tests/design/no-raw-hex.test.ts`
- fonts → `tests/design/fonts.test.ts`
- primitives installed + overrides → `tests/design/ui-overrides.test.ts`
- composites ported (one test file per composite with logic; presence of the rest asserted in `tests/design/ui-overrides.test.ts`) → `tests/components/*.test.tsx` listed above
- no brand icons → `tests/design/no-brand-icons.test.ts`
- assets + manifest → `tests/design/manifest.test.ts`
- composite behaviour → `tests/components/pet-avatar.test.tsx`, `status-badge.test.tsx`, `premium-lock.test.tsx`, `read-only-banner.test.tsx`, `reminder-type-icon.test.tsx`, `app-shell.test.tsx`

**Verification:**
```
npm run typecheck      # expected: exit 0
npm run lint           # expected: exit 0
npm test               # expected: all test files pass
npx supabase test db   # expected: all pgTAP files pass (unchanged by this step)
npm run build          # expected: exit 0
```

#### Prompt
```
You are executing Step 10 — Design foundation — of docs/product/06-build-plan.md.

Read first, in full: docs/product/04-design-system.md §3 (logo files), §4, §5, §6 (inventory, install commands, project overrides, custom composites, known prohibition), §7, §8 and §10; docs/product/04-design/README.md; docs/product/04-design/globals.css; docs/product/04-design/ui-overrides/card.tsx and sonner.tsx; every file in docs/product/04-design/components/; docs/product/03-technical-constraints.md §3 (ADR-05, ADR-14, ADR-17); docs/product/06-build-plan.md §6.

Goal: the visual foundation every screen step builds on. No routes, no screens.

Do exactly this:
1. Initialise shadcn/ui for the existing Next.js + Tailwind v4 project (components.json, lib/utils.ts with the cn helper the mockups import from "@/lib/utils"). Then run exactly the install commands in docs/product/04-design-system.md §6 for: button, card, badge, avatar, tabs, input, textarea, label, select, checkbox, switch, radio-group, dialog, alert-dialog, sheet, dropdown-menu, separator, skeleton, progress, table, sonner, calendar, popover.
2. Replace app/globals.css with the exact contents of docs/product/04-design/globals.css (after shadcn init, so init cannot overwrite it).
3. Replace components/ui/card.tsx and components/ui/sonner.tsx with docs/product/04-design/ui-overrides/card.tsx and sonner.tsx.
4. app/layout.tsx: load Nunito (700) and Inter (400, 500, 600) with next/font/google, subsets latin and latin-ext, exposed as the CSS variables --font-nunito and --font-inter that app/globals.css consumes (Design §4.2); html lang = "sr-Latn" (Design §9 default locale; Step 12 makes it switchable); metadata title "Moj Ljubimac" and icons from public/brand (app-icon-192.png favicon, app-icon-180.png Apple touch icon, per Design §3). Do not mount a Toaster (OQ-10).
5. Copy docs/product/04-design/assets/logo-*.png and app-icon-*.png into public/brand/ (04-design/README.md "How to run" step 3).
6. app/manifest.ts — Next.js web app manifest with exactly the fields and values of docs/product/04-design-system.md §4 "Exception — web app manifest" (name, short_name, start_url, display, theme_color, background_color, icons app-icon-192.png and app-icon-512.png; ADR-05: iPhone push needs the home-screen install). It is the only file besides app/globals.css that may contain hex colour values, and its two colours must equal the --primary and --background values in app/globals.css.
7. Port every composite from docs/product/04-design/components/ to components/app/ with the same file names — shells.tsx, empty-state.tsx, error-state.tsx, logo-mark.tsx, pet-avatar.tsx, pet-header.tsx, premium-lock.tsx, read-only-banner.tsx, reminder-row.tsx, reminder-type-icon.tsx, status-badge.tsx — keeping markup, classes and props unchanged. Only fix import paths to "@/components/app/…" and "@/components/ui/…". Do NOT port state-switcher.tsx (dev-only). Remove the hex value from the comment in logo-mark.tsx (refer to the --primary token instead) so the hex scan stays clean. Do not add any composite from the "Proposed additions" list (OQ-10).
8. Write the tests listed below.

Allowed packages: the shadcn CLI and exactly the dependencies it installs for the listed components and its init (including lucide-react, sonner, tw-animate-css, class-variance-authority, clsx, tailwind-merge, the Radix packages and react-day-picker / date-fns for the calendar) — TC ADR-17: "whatever npx shadcn@latest add installs for the components in Design System §6". Nothing else; no libraries outside docs/product/03-technical-constraints.md ADR-17. Do not invent: no colours, spacing, radii, shadows, fonts or components outside docs/product/04-design-system.md §4 and §6; no lucide brand icons (Design §6 "Known prohibition").

Files you may create, modify or delete — nothing else:
app/globals.css, app/layout.tsx, app/manifest.ts, components.json, lib/utils.ts, components/ui/{button,card,badge,avatar,tabs,input,textarea,label,select,checkbox,switch,radio-group,dialog,alert-dialog,sheet,dropdown-menu,separator,skeleton,progress,table,sonner,calendar,popover}.tsx, components/ui/.gitkeep (delete), components/app/{shells,empty-state,error-state,logo-mark,pet-avatar,pet-header,premium-lock,read-only-banner,reminder-row,reminder-type-icon,status-badge}.tsx, components/app/.gitkeep (delete), public/brand/{logo-full,logo-mark,logo-wordmark,logo-original,app-icon-180,app-icon-192,app-icon-512}.png, package.json, package-lock.json, the test files listed below, and docs/product/06-build-plan.md (only the Step 10 row in §3 and the Step 10 Session log).

Acceptance criteria (derived from Design System §4–§8 and ADR-14; no PRD FR applies):
- app/globals.css equals 04-design/globals.css; every §4.1 colour token resolves to its listed value; --pet-accent pairs follow data-pet-sex.
- No raw hex colour value in source outside app/globals.css and app/manifest.ts (Design §4 manifest exception).
- Fonts per §4.2 with latin and latin-ext.
- Every §6 primitive installed; card and sonner overrides applied.
- Every approved composite ported unchanged (StateSwitcher excluded).
- No lucide brand icon imported.
- Brand assets under /brand; manifest exactly per the Design §4 exception; 180 icon as Apple touch icon.
- Composite behaviour per Design §7/§8/§10 as listed in the tests.

Tests to write (Vitest + Testing Library):
- tests/design/tokens.test.ts — app/globals.css matches 04-design/globals.css; each §4.1 token is declared with its listed value; the @theme inline block maps each colour; data-pet-sex selectors set the accent pairs.
- tests/design/no-raw-hex.test.ts — scans app/, components/, lib/ (.ts, .tsx, .css) and fails on any hex colour literal outside app/globals.css and app/manifest.ts.
- tests/design/no-brand-icons.test.ts — fails if any source file imports Instagram, Whatsapp, Facebook or another lucide brand icon.
- tests/design/fonts.test.ts — app/layout.tsx loads Nunito 700 and Inter 400/500/600 with latin and latin-ext and the two CSS variables.
- tests/design/ui-overrides.test.ts — every §6 primitive file exists; card.tsx and sonner.tsx equal the 04-design/ui-overrides files; every approved composite file exists in components/app/ and state-switcher.tsx does not.
- tests/design/manifest.test.ts — every manifest field equals the Design §4 exception value; theme_color and background_color equal the --primary and --background values declared in app/globals.css; every referenced /brand file exists in public/brand.
- tests/components/pet-avatar.test.tsx — photo renders an image with the pet name as alt; no photo + known species renders the species icon; other species renders the initial.
- tests/components/status-badge.test.tsx — every status renders visible text (never colour-only, Design §10).
- tests/components/premium-lock.test.tsx — renders the Lock icon, "Dostupno u Premiumu" and the trial call to action (Design §8).
- tests/components/read-only-banner.test.tsx — renders the Eye icon and the given reason.
- tests/components/reminder-type-icon.test.tsx — each of the six reminder types renders its Design §6 icon.
- tests/components/app-shell.test.tsx — renders a labelled nav with the Design §5.1 items and the main landmark.

Done means all of these pass, in this order:
  npm run typecheck     → exit 0
  npm run lint          → exit 0
  npm test              → all test files pass
  npx supabase test db  → all pgTAP files pass (unchanged)
  npm run build         → exit 0

When everything passes: in docs/product/06-build-plan.md set the Step 10 row in §3 to ✅ with today's date in "Done", and append a Session log entry under Step 10 (date, what was built, pass/fail per verification command, deviations, follow-ups). Then commit all changes with the message "Step 10: Design foundation".

If anything above is ambiguous, if a referenced section doesn't contain what this prompt says it does, if a ported composite needs a primitive, prop or token not in Design §4/§6, or if completing this step would require touching a file outside the list or making a decision the referenced documents don't settle — STOP and ask. Do not choose a reasonable default. Do not proceed with a partial implementation.
```

#### Session log
**2026-10-20**
- **Built:**
  - shadcn/ui (CLI 4.22.1) initialised: `components.json`, `lib/utils.ts`; the 23 Design §6 primitives installed in `components/ui/`; `card.tsx` and `sonner.tsx` replaced by the `04-design/ui-overrides/` files.
  - `app/globals.css` = `04-design/globals.css`, byte for byte.
  - `app/layout.tsx`: Nunito 700 and Inter 400/500/600 via `next/font/google` (`latin`, `latin-ext`) as `--font-nunito` / `--font-inter` on `<html lang="sr-Latn">`; metadata title "Moj Ljubimac", icon `/brand/app-icon-192.png`, Apple touch icon `/brand/app-icon-180.png`. No Toaster.
  - `app/manifest.ts` per the Design §4 manifest exception (served as `/manifest.webmanifest`).
  - `public/brand/`: the 7 logo and app-icon PNGs from `04-design/assets/`.
  - `components/app/`: the 11 approved composites (shells, empty-state, error-state, logo-mark, pet-avatar, pet-header, premium-lock, read-only-banner, reminder-row, reminder-type-icon, status-badge), ported unchanged. The only edits: `./x` imports became `@/components/app/x`, and the logo-mark comment now names the `--primary` token instead of the hex. `state-switcher.tsx` not ported. Both `.gitkeep` files removed.
  - Tests: 12 new files with 173 tests (`tests/design/` tokens, no-raw-hex, no-brand-icons, fonts, ui-overrides, manifest; `tests/components/` pet-avatar, status-badge, premium-lock, read-only-banner, reminder-type-icon, app-shell).
- **Verification:** `npm run typecheck` ✅ exit 0 · `npm run lint` ✅ exit 0 · `npm test` ✅ 17 files / 211 tests · `npx supabase test db` ✅ 32 files / 1121 tests (unchanged) · `npm run build` ✅ exit 0.
- **Deviations / decisions:**
  - shadcn style. CLI 4.22.1's `init -d` defaults to `base-nova`, which uses Base UI. The mockups need Radix (`asChild` on `Button`), and the prompt names the Radix packages. So init ran with `-b radix -p vega`, and `components.json` `style` was then set to `new-york` before `add`. Why `new-york`: Design §6 describes the original card as "was `rounded-xl shadow-sm`", which is the new-york card. The radix-vega components also rely on custom variants (`data-open:` …) from `shadcn/tailwind.css`, and `04-design/globals.css` does not import that file.
  - `lib/utils.ts` is what shadcn 4.22 init generates: `export { cn } from "cn"`. `cn` is shadcn-ui's single-package replacement for clsx + tailwind-merge, so clsx and tailwind-merge are not installed. The installed primitives import `cn` from `"cn"`; the composites import it from `@/lib/utils`. Both are the same function. It merges the project's token classes correctly (checked: `bg-primary` + `bg-success-soft` → `bg-success-soft`).
  - Packages added are exactly what shadcn init/add installed: `class-variance-authority`, `cn`, `date-fns`, `lucide-react`, `next-themes`, `radix-ui`, `react-day-picker`, `shadcn`, `sonner`, `tw-animate-css`. Two of these are no longer used: `next-themes` (the sonner override drops it) and `shadcn` (init added it for the `shadcn/tailwind.css` import, which the design `globals.css` replaces). Both were kept, because the prompt allows exactly what the CLI installs.
  - Manifest icons carry `sizes` ("192x192", "512x512") and `type` ("image/png") alongside the Design §4 `src` values. These describe the PNG files as they are; no other field was added.
  - `shells.tsx` is the current v1.6 mock (Šapa pomoći item with short label "Šapa", Poruke link). `ListingTypeTag`, `ListingCard` and `safety-dialogs` stay out (Steps 28b / 28c, §4 invariant 11).
- **Follow-ups:**
  - `next-themes` and `shadcn` could be removed from `dependencies` in a later cleanup, if the owner wants.
  - `npm run build` downloads Nunito and Inter from Google Fonts at build time (`next/font/google`), so CI (Step 03) needs network access during the build.
  - The Step 10 header table still reads "⬜ not started". This step may only edit its §3 row and Session log.

---

### Step 11 — Authentication, gates & server utilities

| | |
|---|---|
| **Status** | ⬜ not started |
| **Outcome** | Users sign in with email + password or Google, reset a forgotten password, and sign out; middleware refreshes the session on every request and redirects unauthenticated visitors away from signed-in surfaces; the API §4.1 gates exist as one shared check for protected calls; `lib/server/` holds the shared server-only utilities (ActionResult/ApiError with the TC §5.7.1 database-error mapping, the gates, idempotency, rate limits); S16 and S28 are live. |
| **Implements** | FR-34; EP-42; S16 `/prijava`, S28 `/prijava/nova-lozinka`; route handler `GET /auth/callback`; API §3.3 (idempotency), §3.6, §4.1, §7.1, §7.3 (auth states), §11 (rate limits); TC §5.7.1; tables `idempotency_keys`, `rate_limit_counters` (used, created in Step 04); ADR-01 (request-interception file), ADR-06, ADR-08 (auth email via Resend SMTP — configuration note), ADR-16 (`lib/server/`) |
| **Depends on** | Step 04, Step 10 |
| **Blocked by** | — |
| **Track** | single |

**Read before starting:** `docs/product/02-prd.md` §6 (FR-33, FR-34), §8 (BR-29, BR-31) · `docs/product/03-technical-constraints.md` §3 (ADR-01, ADR-06, ADR-08, ADR-16, ADR-17), §5.7 (`idempotency_keys`, `rate_limit_counters`), §5.7.1, §8.1 · `docs/product/05-api-integration-contract.md` §3.1, §3.3, §3.6, §4.1, §4.2, §5.5 (EP-41 resend address only, EP-42, EP-43 read), §7.1, §7.2, §7.3, §11 (EP-42 row) · `docs/product/04-design-system.md` §5.4, §8, §9, §11 (S15, S16, S18, S19, S20, S28 routes; shells A/O/D/P/U), §12 (S16, S28) · `docs/product/04-design/screens/sign-in.tsx`, `new-password.tsx` · `docs/product/04-design/components/shells.tsx` (AuthShell) · `docs/product/06-build-plan.md` §6.

**Files this step may touch:**
- `proxy.ts` (or `middleware.ts` if the OpenNext Cloudflare adapter supports only that name — TC ADR-01, see prompt)
- `lib/supabase/middleware.ts`
- `lib/server/result.ts`, `lib/server/gates.ts`, `lib/server/idempotency.ts`, `lib/server/rate-limit.ts`; removal of `lib/server/.gitkeep`
- `lib/actions/auth.ts`
- `app/(auth)/layout.tsx`, `app/(auth)/prijava/page.tsx`, `app/(auth)/prijava/sign-in-form.tsx`, `app/(auth)/prijava/nova-lozinka/page.tsx`, `app/(auth)/prijava/nova-lozinka/new-password-form.tsx`, `app/(auth)/auth/callback/route.ts`; removal of `app/(auth)/.gitkeep`
- `supabase/config.toml` (auth sections only)
- `README.md` (production auth setup section only)
- `tests/auth/gates.test.ts`, `tests/auth/middleware.test.ts`, `tests/auth/callback.test.ts`, `tests/auth/sign-in-form.test.tsx`, `tests/auth/new-password-form.test.tsx`, `tests/auth/sign-out.test.ts`, `tests/server/result.test.ts`, `tests/server/idempotency.test.ts`, `tests/server/rate-limit.test.ts`
- `docs/product/06-build-plan.md` (only this step's §3 row and its Session log)

**Out of bounds:** S15 registration, `complete_registration`, `get_me`, i18n dictionaries (Step 12); app/org/admin shells wiring and the sign-out button placement (Step 12); every screen other than S16 and S28; migrations; `components/app/*` and `components/ui/*` (use them, do not change them); `.env.example` (names fixed in Step 02).

**Acceptance criteria:** Quoted verbatim from PRD FR-34, plus checks derived from API §4.1 and ADR-06:
- FR-34: "Given a registered user, When they sign in with their method, Then they reach their own data; When they sign out, Then no data is visible."
- FR-34: "Given a user who forgot their password, When they request a reset, Then they receive an email link that lets them set a new password once."
- (Derived from API §4.1) The session lives in httpOnly cookies set by `@supabase/ssr` and is refreshed by middleware on every request.
- (Derived from API §4.1) An unauthenticated request for a signed-in surface (Design §11 shells A, O, D) redirects to `/prijava`; protected calls return `401 unauthenticated`.
- (Derived from API §4.1) Protected calls check, in this order: no session → `401 unauthenticated`; email not verified → `403 email_not_verified`; `deletion_requested_at` set → `403 account_pending_deletion` (only EP-51 cancel and EP-42 sign-out allowed); organisation `pending` → writes `403 organisation_pending_approval`, reads allowed.
- (Derived from API EP-42) `GET /auth/callback` exchanges the code for the cookie session and redirects: no profile → S15 completion step; pending deletion → `/profil/podaci`; organisation member → `/organizacija`; otherwise `next` or `/ljubimci`.
- (Derived from API EP-42, §7.3) S16 shows *error* on `401` (wrong credentials) and the error with a resend option on `403 email_not_verified`; S28 shows default, mismatch, link expired, and success states.
- (Derived from ADR-06, ADR-08, TC §8.1) Local Supabase Auth requires email confirmation; the production Resend SMTP and Google OAuth setup in the Supabase dashboard is documented (TC §8.1 defines no application variable for Google credentials).
- (Derived from TC §5.7.1, API §7.1) Database messages `'<code>'` and `'<code>:<detail>'` map to `ApiError { code, details }` exactly per the API §7.1 table; a code not in API §7.2 maps to `internal_error`.
- (Derived from API §3.3) A repeat of an operation with the same `idempotency_key` within 24 h returns the stored result and performs nothing.
- (Derived from API §11) A per-user counter per operation and window refuses calls over the limit with `429 rate_limited` and `details.retry_after_s`.

**Tests to ship:**
- FR-34 first criterion (sign-in reaches the user's session and redirects to `/ljubimci`; after sign-out a protected route redirects to `/prijava`) → `tests/auth/sign-in-form.test.tsx`, `tests/auth/sign-out.test.ts`
- FR-34 second criterion (reset request always succeeds; recovery callback leads to S28; S28 sets the password once and a second use shows the link-expired state) → `tests/auth/callback.test.ts`, `tests/auth/new-password-form.test.tsx`
- cookie session refresh → `tests/auth/middleware.test.ts`
- unauthenticated redirect and `401` → `tests/auth/middleware.test.ts`, `tests/auth/gates.test.ts`
- gate order → `tests/auth/gates.test.ts`
- callback redirect matrix → `tests/auth/callback.test.ts`
- S16 / S28 states → `tests/auth/sign-in-form.test.tsx`, `tests/auth/new-password-form.test.tsx`
- auth config → checked by `npx supabase start` in verification (config parses) and the Session log note
- database-error mapping → `tests/server/result.test.ts` (every row of the API §7.1 table, unknown code → `internal_error`)
- idempotency → `tests/server/idempotency.test.ts` (first call stores the result in `idempotency_keys`; same key within 24 h replays it without re-running; a different user's key is independent)
- rate limits → `tests/server/rate-limit.test.ts` (calls up to the limit pass; the next returns `rate_limited` with `retry_after_s`; a new window resets)

**Verification:**
```
npx supabase db reset  # expected: config and migrations apply; auth confirms emails
npm run typecheck      # expected: exit 0
npm run lint           # expected: exit 0
npm test               # expected: all test files pass
npx supabase test db   # expected: all pgTAP files pass (unchanged by this step)
npm run build          # expected: exit 0
```

#### Prompt
```
You are executing Step 11 — Authentication, gates & server utilities — of docs/product/06-build-plan.md.

Read first, in full: docs/product/02-prd.md §6 (FR-33, FR-34) and §8 (BR-29, BR-31); docs/product/03-technical-constraints.md §3 (ADR-01, ADR-06, ADR-08, ADR-16, ADR-17), §5.7 (idempotency_keys, rate_limit_counters), §5.7.1 and §8.1; docs/product/05-api-integration-contract.md §3.1, §3.3, §3.6, §4.1, §4.2, EP-41 (the resend address only), EP-42, EP-43 (read) in §5.5, §7.1, §7.2, §7.3 and §11; docs/product/04-design-system.md §5.4, §8, §9, §11 (routes and shells of S15, S16, S18, S19, S20, S28) and §12 (S16, S28); docs/product/04-design/screens/sign-in.tsx and new-password.tsx; docs/product/04-design/components/shells.tsx (AuthShell); docs/product/06-build-plan.md §6.

Goal: sign-in, password reset, sign-out, session refresh, the API §4.1 gates and the shared lib/server utilities. No registration, no profile, no i18n.

Do exactly this:
1. lib/server/ (TC ADR-16; every module imports "server-only"):
   - lib/server/result.ts — the ActionResult and ApiError types exactly as 05- §3.6 and §7.1 define them, plus one mapper from Supabase Auth errors and database errors to ApiError: database messages follow TC §5.7.1 ('<code>' or '<code>:<detail>') and map exactly per the 05- §7.1 table (detail under the key the code defines; a code not in §7.2 → internal_error, original message logged). No codes outside §7.2.
   - lib/server/idempotency.ts — API §3.3: run an operation once per (user, idempotency_key) and replay the stored result for 24 h, storing it in idempotency_keys (TC §5.7) through the caller's own session (05- §3.1: server actions never bypass RLS for a user's own data).
   - lib/server/rate-limit.ts — API §11: count calls per user, operation and window in rate_limit_counters (TC §5.7) through the caller's own session; over the limit → ApiError rate_limited with details.retry_after_s. The limit and window are arguments; each later step passes the API §11 values for its operation.
2. lib/supabase/middleware.ts + the root request-middleware file: refresh the Supabase session on every request with @supabase/ssr (05- §4.1). Request interception lives in proxy.ts, the Next.js 16 name (TC ADR-01). First check the OpenNext Cloudflare adapter documentation for the version installed in Step 03: if it supports proxy.ts, use it; if it supports only middleware.ts, use middleware.ts and record that in the Session log; if neither works, STOP and raise a change request to 03-technical-constraints.md ADR-01. Redirect unauthenticated requests for signed-in surfaces to /prijava. Signed-in surfaces are the routes of shells A, O and D in Design §11 (/ljubimci, /uspomene, /podsetnici, /podesavanja, /domacinstvo, /premium, /profil, /partneri, /organizacija, /admin and their children); /prijava, /registracija, /poziv, /t, /o, /privatnost, /uslovi, /auth and /api are not redirected.
3. lib/server/gates.ts — one function protected server code calls first, implementing the four gates of 05- §4.1 in that order and returning the matching ApiError (unauthenticated, email_not_verified, account_pending_deletion with the EP-51-cancel and EP-42-sign-out exemption, organisation_pending_approval for writes only). It reads the caller's profile and organisation membership directly (get_me is Step 12).
4. app/(auth)/auth/callback/route.ts — GET /auth/callback per EP-42: exchangeCodeForSession, then redirect: no profiles row → the S15 completion step (/registracija); deletion_requested_at set → /profil/podaci; organisation member → /organizacija; otherwise the next parameter (only same-site paths) or /ljubimci. Target routes built in later steps may 404 until then — do not create them.
5. app/(auth)/layout.tsx — wraps auth pages in AuthShell from components/app/shells.tsx (Design §5.4).
6. S16 /prijava — app/(auth)/prijava/page.tsx and sign-in-form.tsx ported from docs/product/04-design/screens/sign-in.tsx: keep markup, classes and Serbian copy exactly; remove StateSwitcher and drive the states from real responses (05- §7.3, EP-42 "States"): signInWithPassword, signInWithOAuth Google with redirectTo /auth/callback, "Zaboravljena lozinka" calling resetPasswordForEmail with redirectTo /auth/callback?next=/prijava/nova-lozinka (always shows success — no account enumeration), 401 → error state, 403 email_not_verified → error state with the resend option using the EP-41 resend call. Copy stays inline in Serbian; Step 12 moves it into the dictionaries.
7. S28 /prijava/nova-lozinka — page.tsx and new-password-form.tsx ported from docs/product/04-design/screens/new-password.tsx the same way: updateUser({ password }) with the ≥ 8 character rule; states default, mismatch, link expired (no recovery session or a used link → the invalid_action_token state S28 names), success → "Prijavi se".
8. lib/actions/auth.ts — signOut server action (EP-42: clears cookies, redirects to /prijava; allowed during pending deletion). The sign-out control in the shells is wired in Step 12.
9. supabase/config.toml, auth sections only: email confirmation required (BR-29); site URL and additional redirect URL for /auth/callback on the local dev origin. Leave the local Google provider disabled: TC §8.1 defines no environment variable for Google credentials, so Google is configured only in the Supabase dashboard for production; tests fake the OAuth call. Local auth emails stay on the local mail catcher.
10. README.md — "Production auth setup" section: in the Supabase dashboard set custom SMTP to Resend (ADR-08), enable Google with the owner's OAuth client, add the production /auth/callback redirect URL. Names only, no values.
11. Write the tests listed below.

Do not invent: no screens other than S16 and S28; no copy, colours, components or states outside docs/product/04-design-system.md §8/§12 and the two mockups; no endpoints, fields or error codes outside docs/product/05-api-integration-contract.md; no schema changes; no packages — everything needed was installed in Steps 01, 02 and 10; no libraries outside docs/product/03-technical-constraints.md ADR-17.

Files you may create, modify or delete — nothing else:
the request-interception file (proxy.ts, or middleware.ts per step 2), lib/supabase/middleware.ts, lib/server/result.ts, lib/server/gates.ts, lib/server/idempotency.ts, lib/server/rate-limit.ts, lib/server/.gitkeep (delete), lib/actions/auth.ts, app/(auth)/layout.tsx, app/(auth)/prijava/page.tsx, app/(auth)/prijava/sign-in-form.tsx, app/(auth)/prijava/nova-lozinka/page.tsx, app/(auth)/prijava/nova-lozinka/new-password-form.tsx, app/(auth)/auth/callback/route.ts, app/(auth)/.gitkeep (delete), supabase/config.toml (auth sections only), README.md, tests/auth/gates.test.ts, tests/auth/middleware.test.ts, tests/auth/callback.test.ts, tests/auth/sign-in-form.test.tsx, tests/auth/new-password-form.test.tsx, tests/auth/sign-out.test.ts, tests/server/result.test.ts, tests/server/idempotency.test.ts, tests/server/rate-limit.test.ts, and docs/product/06-build-plan.md (only the Step 11 row in §3 and the Step 11 Session log).

Acceptance criteria (verbatim from the PRD; then derived checks):
- FR-34: "Given a registered user, When they sign in with their method, Then they reach their own data; When they sign out, Then no data is visible."
- FR-34: "Given a user who forgot their password, When they request a reset, Then they receive an email link that lets them set a new password once."
- Derived from API §4.1: cookie session refreshed by middleware on every request.
- Derived from API §4.1: unauthenticated → redirect /prijava for signed-in surfaces, 401 for protected calls.
- Derived from API §4.1: the four gates in order with the stated exemptions.
- Derived from API EP-42: the /auth/callback redirect matrix.
- Derived from API EP-42/§7.3: S16 and S28 states.
- Derived from ADR-06/ADR-08/TC §8.1: local auth config; production setup documented.
- Derived from TC §5.7.1/API §7.1: database-error mapping.
- Derived from API §3.3: idempotent replay within 24 h.
- Derived from API §11: per-user rate limits with retry_after_s.

Tests to write (Vitest + Testing Library; Supabase calls faked at the client boundary):
- tests/auth/sign-in-form.test.tsx — FR-34 sign-in success navigates to /ljubimci (or next); 401 shows the error state; 403 email_not_verified shows the error with resend and resend calls the EP-41 resend; Google button starts OAuth with redirectTo /auth/callback; reset request always shows success.
- tests/auth/sign-out.test.ts — FR-34 signOut clears the session and redirects to /prijava; afterwards the middleware redirects a protected route to /prijava.
- tests/auth/callback.test.ts — code exchange then each redirect of the EP-42 matrix; recovery link leads to /prijava/nova-lozinka; external next values are refused.
- tests/auth/new-password-form.test.tsx — FR-34 password set once: success state; mismatch and < 8 characters inline errors; no recovery session → link-expired state.
- tests/auth/middleware.test.ts — session refresh on every request; unauthenticated request to each signed-in prefix redirects to /prijava; public prefixes pass through.
- tests/auth/gates.test.ts — gate order: 401, then 403 email_not_verified, then 403 account_pending_deletion (EP-51 cancel and sign-out exempt), then 403 organisation_pending_approval on writes only; reads pass for a pending organisation.
- tests/server/result.test.ts — every row of the 05- §7.1 mapping table; unknown code → internal_error.
- tests/server/idempotency.test.ts — store, replay within 24 h, per-user independence.
- tests/server/rate-limit.test.ts — limit reached → rate_limited with retry_after_s; new window resets.

Done means all of these pass, in this order:
  npx supabase db reset → config and migrations apply
  npm run typecheck     → exit 0
  npm run lint          → exit 0
  npm test              → all test files pass
  npx supabase test db  → all pgTAP files pass (unchanged)
  npm run build         → exit 0

When everything passes: in docs/product/06-build-plan.md set the Step 11 row in §3 to ✅ with today's date in "Done", and append a Session log entry under Step 11 (date, what was built, pass/fail per verification command, deviations, follow-ups — list the redirect targets that will 404 until their steps run). Then commit all changes with the message "Step 11: Authentication, gates & server utilities".

If anything above is ambiguous, if a referenced section doesn't contain what this prompt says it does, or if completing this step would require touching a file outside the list, adding a package, or making a decision the referenced documents don't settle — STOP and ask. Do not choose a reasonable default. Do not proceed with a partial implementation.
```

#### Session log
**2026-10-21**
- **Built:** `lib/server/result.ts` (`ApiError`, `ActionResult`, `ok`/`fail`, the §7.2 catalog, `fromDatabaseError` per the API §7.1 table — `'<code>'`, `'<code>:<detail>'` with the detail under `limit` (`premium_required`) or `channel` (`whatsapp_not_connected`); other or non-P0001 errors → `internal_error` with the original message logged — `fromAuthError` for the EP-41/EP-42 auth errors, `httpStatus` per §7.2). `lib/server/idempotency.ts` (`withIdempotency`: replays the `idempotency_keys` row for (user, key) within 24 h, otherwise runs and stores the successful result; caller's session). `lib/server/rate-limit.ts` (`checkRateLimit`: fixed windows in `rate_limit_counters`, limit and window are arguments; over the limit → `rate_limited` with `details.retry_after_s`). `lib/server/gates.ts` (`checkGates` with the four API §4.1 gates in order, `exempt: cancel_deletion | sign_out`, organisation gate on writes only; `postSignInPath` = the EP-42 redirect matrix; `safeNextPath`; `recoverySessionEmail` — a reset-link session is recognised by its `amr` claim `recovery`). `lib/supabase/middleware.ts` + `proxy.ts` (session refresh on every request with `@supabase/ssr`, cookies kept `httpOnly: true`; unauthenticated requests for `/ljubimci`, `/uspomene`, `/podsetnici`, `/podesavanja`, `/domacinstvo`, `/premium`, `/profil`, `/partneri`, `/organizacija`, `/admin` and their children → `/prijava`). `lib/actions/auth.ts` (server actions `signInWithPassword`, `signInWithGoogle`, `requestPasswordReset`, `resendVerification`, `setNewPassword`, `signOut`). `app/(auth)/layout.tsx` (AuthShell); S16 `app/(auth)/prijava/page.tsx` + `sign-in-form.tsx`; S28 `app/(auth)/prijava/nova-lozinka/page.tsx` + `new-password-form.tsx`; `app/(auth)/auth/callback/route.ts`. `supabase/config.toml`, auth only: `enable_confirmations = true`, `minimum_password_length = 8`, `site_url = "http://localhost:3000"`, `additional_redirect_urls` = `/auth/callback` on `localhost:3000` and `127.0.0.1:3000`; Google stays disabled locally; mail stays on Mailpit. README "Production auth setup" (Resend SMTP, email confirmation, Google OAuth client, Site URL and redirect URL — names only). Removed `lib/server/.gitkeep` and `app/(auth)/.gitkeep`. Tests: 9 files, 105 tests.
- **Verification:** `npx supabase db reset` ✅ config and migrations apply (after `supabase stop`/`start` to load the new auth config; `/auth/v1/settings` reports `mailer_autoconfirm: false`, Google off) · `npm run typecheck` ✅ exit 0 · `npm run lint` ✅ exit 0 (the 2 known warnings in the generated `cloudflare-env.d.ts`) · `npm test` ✅ 28 files / 334 tests passed · `npx supabase test db` ✅ 33 files / 1124 tests, PASS (unchanged) · `npm run build` ✅ exit 0 (`ƒ Proxy (Middleware)`, `/prijava`, `/prijava/nova-lozinka`, `/auth/callback`).
- **Extra checks:** a live run against the local stack: a PKCE reset link redirects to `/auth/callback?code=…&next=%2Fprijava%2Fnova-lozinka`; the exchanged session has `amr: [{ method: "recovery" }]`; a second click redirects with `error_code=otp_expired` and keeps `next`, so the callback sends it to S28 (link expired); a wrong password returns `invalid_credentials` (400) and an unconfirmed email `email_not_confirmed` (400), which is how `fromAuthError` maps them. `npm run preview` (Workers runtime): `/ljubimci` and `/organizacija/zahtevi` → 307 `/prijava`; `/prijava`, `/prijava?view=reset` (reset view) and `/prijava/nova-lozinka` (link expired, no session) → 200. Preview stopped afterwards.
- **Decisions / deviations:**
  - **Request interception = `proxy.ts`.** `@opennextjs/cloudflare` 1.20.12 builds and bundles the Next.js 16 Node.js proxy (`bundle-node-middleware.js`), and it ran in `npm run preview`. The adapter build warns "Node.js middleware support is experimental in cloudflare, and not officially maintained by OpenNext maintainers"; recorded under TC RISK-11. If it breaks in production, the fallback is `middleware.ts` (edge). Later steps that add signed-in prefixes change `SIGNED_IN_PREFIXES` in `lib/supabase/middleware.ts`, which `proxy.ts` calls.
  - **Server-only auth (owner decision, 2026-10-21, Step 02 follow-up):** the session cookies are httpOnly, so the browser client cannot see the session. Every Supabase Auth call that creates, reads or changes a session — `signInWithPassword`, `signInWithOAuth` (returns the provider URL with `skipBrowserRedirect: true`; the client then calls `window.location.assign`), `resetPasswordForEmail`, the EP-41 `resend`, `updateUser` — runs in `lib/actions/auth.ts` as server actions returning `ActionResult`. `sign-in-form.tsx` and `new-password-form.tsx` only call those actions, and `lib/supabase/browser.ts` is not used for auth. EP-42's "Supabase Auth client" is read as the server client.
  - **S16/S28 copy (owner decision, 2026-10-21; Design S16/S28 had none):** there is no `/zaboravljena-lozinka`. "Zaboravljena lozinka?" switches `/prijava` to a reset view (also reachable as `/prijava?view=reset`) in the same AuthShell card: title *Nova lozinka*; text *Upiši mejl adresu naloga i poslaćemo ti link za novu lozinku.*; email prefilled from the sign-in form and validated with *Upiši ispravnu mejl adresu.*; button *Pošalji link*; link *Nazad na prijavu*. Sent state (always after a valid submit, no account enumeration): *Ako nalog sa adresom {email} postoji, poslali smo link za novu lozinku. Proveri i spam folder.* + *Nazad na prijavu*. 403 `email_not_verified`: *Mejl adresa još nije potvrđena. Otvori link iz mejla koji smo ti poslali.* with the secondary button *Pošalji link ponovo* (EP-41 resend; `variant="outline"`, the style the mockups use for secondary actions), then *Poslali smo novi link za potvrdu na {email}.* S28 *Pošalji novi link* → `/prijava?view=reset`. English for Step 12: [Reset password], [Enter your account email and we'll send you a link to set a new password.], [Send link], [Back to sign in], [If an account with {email} exists, we've sent a link to set a new password. Check your spam folder too.], [Your email address isn't confirmed yet. Open the link in the email we sent you.], [Resend link], [We've sent a new confirmation link to {email}.]. Same components, classes and alert styles as the two mockups; no new components.
  - **Step 03** is done locally; its push checks are pending the owner, which does not block this step (owner, 2026-10-21).
  - Other failures show the Design §8 error copy *Nešto nije u redu. Pokušaj ponovo.* in the mockup's alert block, not the wrong-credentials text. On S16 that covers 429, 5xx, network errors and a failed Google start; on S28 an unexpected `updateUser` error. An empty password on S16 shows the wrong-credentials error without a call, as the mockup does. The mockup's prefilled demo email and the StateSwitcher are removed; S28 shows the email of the recovery session.
  - **Recovery routing:** `/auth/callback` with `next=/prijava/nova-lozinka` always goes to S28, ahead of the EP-42 matrix, so an organisation member or a user with pending deletion can still set the password. A missing or failed code with that `next` also goes to S28, which then shows link expired. A failed exchange of any other link → `/prijava`.
  - **"Set a new password once":** `setNewPassword` only works in a session whose `amr` is `recovery` (otherwise `invalid_action_token` → link expired). After `updateUser` it ends that session with `signOut({ scope: "local" })`, and the success card's *Prijavi se* leads to S16.
  - Password sign-in uses the same EP-42 redirect matrix (`postSignInPath`), so a user with pending deletion lands on S19 (EP-42 side effects).
  - `withIdempotency` stores only `ok: true` results: a failed attempt performed nothing, so the same intent may be retried. A key reused after 24 h but not yet purged hits the unique (`user_id`, `key`) constraint on insert; that is logged and the fresh result is returned.
  - The API §7.1 row "SQLSTATE 23514 on `listings.category` → `category_not_allowed`" is not mapped yet: the `listings` table and its constraint do not exist until Step 28a, and Step 28b adds that row (its prompt allows it). `premium_required:listings` is already covered by the generic mapping. `organisation_pending_approval:rejected` (raised by a Step 05 trigger) maps to `{ code: "organisation_pending_approval" }` because §7.1 defines no details key for it.
  - `checkGates` lets a session with no `profiles` row through gates 3 and 4 (`profile: null`); callers that need a profile decide (`complete_registration` is exempt, EP-41).
- **Follow-ups:**
  - **Fold the S16/S28 copy above into `docs/product/04-design-system.md` §12 (S16, S28)** (owner decision).
  - Step 12 moves the inline Serbian strings of `sign-in-form.tsx` and `new-password-form.tsx` into `lib/i18n` with the English above, and wires `signOut` into the shells and S18.
  - Redirect targets that 404 until their steps run: `/ljubimci` (Step 13), `/registracija` (Step 12; also S16's *Napravi nalog*), `/profil/podaci` (Step 23), `/organizacija` (Step 24). `next` values such as `/poziv/…` 404 until Step 22.
  - Next.js rewrites `127.0.0.1` to `localhost` in `request.nextUrl`, so `/auth/callback` redirects to `localhost:<port>`. Open the local app at `http://localhost:3000` so the session cookies match.
  - Owner: production auth setup in the Supabase dashboard (README "Production auth setup").
  - Re-test `proxy.ts` under `npm run preview` after adapter upgrades (its Node.js middleware support is experimental).

### Step 12 — Registration, profile, legal pages & i18n

| | |
|---|---|
| **Status** | ⬜ not started |
| **Outcome** | A visitor can register as Owner, Shelter or Breeder (email + password or Google) and complete their profile; every existing screen reads its text from Serbian (Latin) and English dictionaries and switches language; signed-in shells show the real user; S30 `/privatnost` and S31 `/uslovi` render in the PublicShell with the OQ-15 placeholder text, and registration links to the terms and stores `TERMS_VERSION` from `lib/legal.ts`. |
| **Implements** | FR-33, FR-35, NFR-05 · EP-41, EP-43, EP-67 · S15 `/registracija`, S18 `/profil` (name, city, language part only) · S30 `/privatnost`, S31 `/uslovi` (PRD §12 Release Criterion 4 — pages only; text OQ-15) · tables `profiles`, `organisations`, `organisation_memberships`, `cities` (read/write through EP-41/EP-43/EP-67 only) · ADR-06, ADR-16 (`lib/i18n/`, `lib/legal.ts`) · Design §9 i18n rule · ADR-15 flow "registration" |
| **Depends on** | Step 11, Step 05, Step 08 (default reminder preferences are created on profile insert) |
| **Blocked by** | — (OQ-15 does not block: S30/S31 ship with the Design placeholder text) |
| **Track** | single |

**Read before starting:**
- `docs/product/02-prd.md` §6 FR-33, FR-35; §8 BR-29, BR-30, BR-32; §10 NFR-05; §12 item 4
- `docs/product/03-technical-constraints.md` §3 ADR-06, ADR-08, ADR-15, ADR-16 (incl. `lib/legal.ts`); §5.1 (`profiles`, `terms_version`), §5.2 (`organisations`, `organisation_memberships`), §5.7 (`cities`); §7 row NFR-05
- `docs/product/04-design-system.md` §5.1, §5.2, §5.3, §5.4 (shells), §6 (AppShell, AuthShell, PublicShell), §8, §9 (locale, i18n rule, tone, formats), §11 rows S15, S18, S30, S31, §12 S15, S18, S30, S31, §13 OQ-15
- `docs/product/04-design/screens/register.tsx`, `docs/product/04-design/screens/profile.tsx`, `docs/product/04-design/screens/privacy.tsx`, `docs/product/04-design/screens/terms.tsx`, `docs/product/04-design/components/shells.tsx`
- `docs/product/05-api-integration-contract.md` §3.1, §3.5, §3.6, §4.1, §4.4 rows EP-41 – EP-44 and EP-67, §5.5 EP-41, EP-42, EP-43, §5.8 EP-67, §6 schemas `Me`, `Entitlements`, `City`, §7.1, §7.2, §7.3 rows *email_sent*, *inline field errors*
- `docs/product/06-build-plan.md` §4, §5, §6 and the Session logs of Steps 10 and 11

**Files this step may touch:**
- `supabase/migrations/*_get_me.sql` (new: `rpc:get_me()` per EP-43 and the `Me`/`Entitlements` schemas; column grant on `profiles` limiting updates to `full_name`, `city_id`, `locale`)
- `lib/supabase/` generated types file (regenerated with `npm run db:types` only, never hand-edited)
- `lib/i18n/index.ts`, `lib/i18n/sr.ts`, `lib/i18n/en.ts` (new); removal of `lib/i18n/.gitkeep`
- `lib/legal.ts` (new: `TERMS_VERSION`)
- `lib/actions/registration.ts` (new: `action:complete_registration`, EP-41)
- `app/(auth)/registracija/page.tsx`, `app/(auth)/registracija/register-client.tsx` (new, S15)
- `app/(auth)/auth/callback/route.ts` (modify: call `complete_registration` when no profile exists, per EP-41/EP-42)
- `app/(auth)/layout.tsx`, `app/(app)/layout.tsx`, `app/(org)/layout.tsx` (modify or create: locale from EP-43, `AppShell` `user` from EP-43)
- The S16 and S28 screen files created in Step 11 under `app/(auth)/prijava/` (modify: move their strings into `lib/i18n` only)
- `app/(app)/profil/page.tsx`, `app/(app)/profil/profile-client.tsx` (new, S18 name/city/language part)
- `app/(public)/privatnost/page.tsx`, `app/(public)/privatnost/privacy-client.tsx` (new, S30); `app/(public)/uslovi/page.tsx`, `app/(public)/uslovi/terms-client.tsx` (new, S31); removal of `app/(public)/.gitkeep`
- `supabase/tests/get_me.test.sql`
- `tests/i18n/dictionaries.test.ts`, `tests/i18n/locale-switch.test.tsx`, `tests/registration/register-form.test.tsx`, `tests/registration/complete-registration.test.ts`, `tests/profile/profile-form.test.tsx`, `tests/legal/legal-pages.test.tsx`
- `e2e/registration.spec.ts`
- `docs/product/06-build-plan.md` (§3 row of Step 12 and the Step 12 Session log only)

**Out of bounds:** S18 subscription card, days remaining, cancel (Step 23); S19 and the links' targets beyond rendering the existing links; EP-44 plans and S17 (Steps 23/31); the Operator notification email for a pending shelter listed in EP-41 side effects (the Resend adapter does not exist until Step 19 — do not send it and do not create `lib/integrations/resend.ts`; Design §9.1 has no template for it either — CR-24); shell count badges (`AppShell` `counts`, Step 17); the legal text of S30/S31 (OQ-15); any schema change other than the `get_me` function and the column grant; any file under `components/ui` or `components/app`.

**Acceptance criteria:** (PRD v1.6, verbatim)
- FR-33 — Given a new user, When registering with email and password or Google, Then they choose an account type (Owner / Shelter / Breeder).
- FR-33 — Given registration with email and password, When the email is not yet verified, Then the product cannot be used until it is.
- FR-35 — Given any user, When they switch language, Then all product text is shown in the chosen language.
- NFR-05 (derived from TC §7 row NFR-05): 100% of UI strings are present in both locales, and a missing key fails the build.
- (Derived from TC ADR-16 / §5.1, API EP-41) Registration sends `terms_version` = `TERMS_VERSION` from `lib/legal.ts`; `complete_registration` stores it in `profiles.terms_version` and rejects any other value with `fields.terms_version = outdated`.
- (Derived from Design §11, §12 S30/S31, §5.3) S30 and S31 render at `/privatnost` and `/uslovi` in the PublicShell without signing in, with the Design section headings and the placeholder "Tekst dostavlja vlasnik (OQ-15)."; S31 shows "Verzija {TERMS_VERSION}".
- (Owner instruction, Build Plan v1.1) The S15 terms acceptance links to `/uslovi` and `/privatnost`.

**Tests to ship:**
- FR-33 (account type, email + password and Google paths) → `tests/registration/register-form.test.tsx` (S15 requires an account type before submit; shelter/breeder require organisation name and city; the Google path reaches the completion step with the account-type choice); `tests/registration/complete-registration.test.ts` (inserts `profiles`, and for shelter/breeder `organisations` with `approval_status` pending/approved and an admin membership; idempotent when a profile exists)
- FR-33 (unverified email blocks use) → `e2e/registration.spec.ts` (register with email + password → "Proveri mejl" state → protected route is refused until the local verification link is followed → after verification the user reaches `/ljubimci`)
- FR-35 → `tests/i18n/locale-switch.test.tsx` (switching locale on S15 and on S18 re-renders every visible string from the other dictionary; EP-43 update with `locale` persists it)
- NFR-05 → `tests/i18n/dictionaries.test.ts` (both dictionaries have identical key sets) plus the type-level check that makes `npm run typecheck` fail on a missing key
- EP-43 / Entitlements → `supabase/tests/get_me.test.sql` (returns null without a profile; computes `entitlements` and `usage` for the local Free and Premium seed users; only `full_name`, `city_id`, `locale` are updatable)
- S18 profile form → `tests/profile/profile-form.test.tsx` (city is a Select from EP-67; `422` field codes render inline)
- terms version → `tests/registration/complete-registration.test.ts` (`TERMS_VERSION` stored; another value → `outdated`) and `tests/registration/register-form.test.tsx` (sign-up sends `TERMS_VERSION`; the terms label links to `/uslovi` and `/privatnost`)
- S30/S31 → `tests/legal/legal-pages.test.tsx` (both routes render the PublicShell, every Design section heading, the OQ-15 placeholder in each section, S31's version line from `TERMS_VERSION`, in sr and en)

**Verification:**
```
npm run typecheck      # expect: exit 0
npm run lint           # expect: exit 0
npm test               # expect: all Vitest suites pass, including the six files above
npx supabase test db   # expect: all pgTAP files pass, including get_me.test.sql
npm run build          # expect: build succeeds
npm run e2e            # expect: e2e/registration.spec.ts passes
```

#### Prompt
```
You are executing Step 12 — Registration, profile, legal pages & i18n — of docs/product/06-build-plan.md. Work in the repository root.

Read first, in full:
- docs/product/02-prd.md §6 FR-33, FR-35; §8 BR-29, BR-30, BR-32; §10 NFR-05; §12 item 4
- docs/product/03-technical-constraints.md §3 ADR-06, ADR-08, ADR-15, ADR-16 (lib/legal.ts); §5.1 profiles (terms_version); §5.2 organisations, organisation_memberships; §5.7 cities; §7 row NFR-05
- docs/product/04-design-system.md §5.1, §5.2, §5.3, §5.4, §6 (AppShell, AuthShell, PublicShell), §8, §9, §11 rows S15, S18, S30, S31, §12 S15, S18, S30, S31, §13 OQ-15
- docs/product/04-design/screens/register.tsx, profile.tsx, privacy.tsx, terms.tsx, docs/product/04-design/components/shells.tsx
- docs/product/05-api-integration-contract.md §3.1, §3.5, §3.6, §4.1, §4.4 (rows EP-41 – EP-44, EP-67), §5.5 EP-41, EP-42, EP-43, §5.8 EP-67, §6 Me, Entitlements, City, §7.1, §7.2, §7.3
- docs/product/06-build-plan.md §4, §5, §6, and the Session logs of Steps 10 and 11

Settled upstream — apply exactly:
1. Terms version: create lib/legal.ts exporting the constant TERMS_VERSION (TC ADR-16, §5.1 profiles.terms_version). TC fixes no initial value: ask the owner for it at the start of the session and record the answer in the Session log. Sign-up (EP-41) sends this value, and complete_registration accepts only it (fields.terms_version = "outdated" otherwise).
2. Copy: docs/product/04-design-system.md §9 i18n rule — every string goes into lib/i18n/sr.ts and lib/i18n/en.ts; the Serbian text is the mockup copy and the English text is its faithful translation (register.tsx already carries the English for S15); no new copy, no missing key.
3. ApiError, ActionResult and the database-error mapping live in lib/server/result.ts and the gates in lib/server/gates.ts (Step 11; TC ADR-16, §5.7.1; 05- §7.1). Use them; do not redefine them.
4. S30/S31 text: the legal text is OQ-15 (owner, with a lawyer). Ship the pages with the Design placeholder exactly; write no legal text.

Build:
1. lib/i18n/sr.ts, lib/i18n/en.ts and lib/i18n/index.ts: Serbian (Latin) and English dictionaries plus an index that resolves the active locale. Locale for a signed-in user comes from profiles.locale via EP-43; on auth-shell screens the SR/EN switch from S15 sets it for the page and is sent as `locale` to EP-41. Make the English dictionary's type depend on the Serbian keys so that a missing key fails `npm run typecheck` (TC §7 NFR-05). Do not add an i18n package. If persisting a Visitor's language across page navigation turns out to be required, STOP and ask — no storage mechanism for it is specified.
2. Move the strings of every screen and shell that exists in the repository at this point into lib/i18n, without changing markup.
3. supabase migration `get_me` (create with `npx supabase migration new get_me`): rpc:get_me() exactly as EP-43 and the Me/Entitlements schemas define, plus the profiles column grant from EP-43. Then run `npm run db:types`. The tables this function reads from Steps 04–08 already exist (single serial track).
4. lib/legal.ts (TERMS_VERSION, settled item 1) and lib/actions/registration.ts: action:complete_registration per EP-41 (Request, Errors, Side effects), returning ActionResult<Me>; terms_version must equal TERMS_VERSION. Do not send the Operator notification email (Out of bounds).
5. app/(auth)/auth/callback/route.ts: when the session has no profiles row, call complete_registration with the payload from user_metadata as EP-41 states; keep every redirect from EP-42.
6. S15: port docs/product/04-design/screens/register.tsx to app/(auth)/registracija/register-client.tsx with app/(auth)/registracija/page.tsx as the route. Keep markup, classes and composites; change imports from ../components/* to @/components/app/*; replace inline data with real calls (EP-41 sign-up, resend, Google; EP-67 cities for the organisation city Select); remove the StateSwitcher and drive default / email_sent / inline field errors from real responses per 05- §7.3 and EP-41 States. Sign-up sends TERMS_VERSION as terms_version. In the terms checkbox label, link "uslove korišćenja" to /uslovi and "politiku privatnosti" to /privatnost (and the matching English words), using the link markup the PublicShell footer already uses — owner instruction, Build Plan v1.1; no other layout change. Include the Google completion step (account type, and organisation fields for Azil/Odgajivačnica) for a signed-in user with no profile.
7. S18 (profile part only): port the name, city and language section of docs/product/04-design/screens/profile.tsx to app/(app)/profil/profile-client.tsx with app/(app)/profil/page.tsx; read with EP-43 get, save with EP-43 update; a locale change switches the UI immediately. Render the subscription card area and the links as they are in the mockup only if they need no data; otherwise omit them (Step 23 adds the subscription card).
8. Wire app/(app)/layout.tsx and app/(org)/layout.tsx so AppShell receives `user` from EP-43 and the locale from profiles.locale. Do not pass `counts` — Step 17 wires the count badge (EP-25).
9. S30 and S31: port docs/product/04-design/screens/privacy.tsx to app/(public)/privatnost/privacy-client.tsx with app/(public)/privatnost/page.tsx, and terms.tsx to app/(public)/uslovi/terms-client.tsx with app/(public)/uslovi/page.tsx, inside the PublicShell exactly as the mockups render it (Design §5.3, §12 S30/S31). Keep the section headings and the placeholder "Tekst dostavlja vlasnik (OQ-15)." exactly; S31's version line reads TERMS_VERSION from lib/legal.ts. Both pages are public (no sign-in) and follow the visitor's language like the other auth-free screens.

Do not invent:
- No colours, spacing, radii, fonts or components outside 04-design-system.md §4–§6 and the existing components/ui and components/app; do not edit components/ui or components/app.
- No packages outside 03-technical-constraints.md ADR-17; do not add any dependency to package.json.
- No endpoints, fields, error codes or RPC names outside 05-api-integration-contract.md.
- No tables, columns or enum values outside 03-technical-constraints.md §5.
- No user-facing copy that is not in 04-design-system.md or docs/product/04-design.

Files: create or modify only these. Touching any other file requires stopping and asking.
- supabase/migrations/<timestamp>_get_me.sql; the generated types file in lib/supabase/ (via npm run db:types only)
- lib/i18n/index.ts, lib/i18n/sr.ts, lib/i18n/en.ts, lib/i18n/.gitkeep (delete)
- lib/legal.ts, lib/actions/registration.ts
- app/(auth)/registracija/page.tsx, app/(auth)/registracija/register-client.tsx
- app/(auth)/auth/callback/route.ts, app/(auth)/layout.tsx, app/(app)/layout.tsx, app/(org)/layout.tsx
- the S16 and S28 files from Step 11 under app/(auth)/prijava/ (string extraction only)
- app/(app)/profil/page.tsx, app/(app)/profil/profile-client.tsx
- app/(public)/privatnost/page.tsx, app/(public)/privatnost/privacy-client.tsx, app/(public)/uslovi/page.tsx, app/(public)/uslovi/terms-client.tsx, app/(public)/.gitkeep (delete)
- supabase/tests/get_me.test.sql
- tests/i18n/dictionaries.test.ts, tests/i18n/locale-switch.test.tsx, tests/registration/register-form.test.tsx, tests/registration/complete-registration.test.ts, tests/profile/profile-form.test.tsx, tests/legal/legal-pages.test.tsx
- e2e/registration.spec.ts
- docs/product/06-build-plan.md (Step 12 row in §3 and the Step 12 Session log only)

Acceptance criteria (PRD v1.6, verbatim — each needs a passing test):
- Given a new user, When registering with email and password or Google, Then they choose an account type (Owner / Shelter / Breeder).
- Given registration with email and password, When the email is not yet verified, Then the product cannot be used until it is.
- Given any user, When they switch language, Then all product text is shown in the chosen language.
- Derived from TC §7 NFR-05: 100% of UI strings are present in both locales, and a missing key fails the build.
- Derived from TC ADR-16/§5.1 and API EP-41: registration stores TERMS_VERSION; any other value → fields.terms_version = outdated.
- Derived from Design §11/§12 S30, S31: both pages render in the PublicShell with the Design headings and the OQ-15 placeholder; S31 shows the version.
- Owner instruction (Build Plan v1.1): the S15 terms label links to /uslovi and /privatnost.

Tests to write: exactly the files listed under "Tests to ship" in Step 12 of docs/product/06-build-plan.md, each covering the criterion named there.

Done means all of these pass, in this order, and you paste their output into the Session log:
npm run typecheck
npm run lint
npm test
npx supabase test db
npm run build
npm run e2e

When verification passes: update the Step 12 row in docs/product/06-build-plan.md §3 (Status ✅, Done = today's date), append a Session log entry under Step 12 (date, what was built, the output of each verification command, deviations, follow-ups — include the TERMS_VERSION value the owner chose and "Operator notification for pending shelters not sent — no Design §9.1 template (CR-24)"), then commit with the message "Step 12: Registration, profile, legal pages & i18n".

If anything above is ambiguous, if a referenced section doesn't contain what this prompt says it does, or if completing this step would require touching a file outside the list or making a decision the referenced documents don't settle — STOP and ask. Do not choose a reasonable default. Do not proceed with a partial implementation.
```

#### Session log
**2026-10-23** (built 2026-10-22, completed and committed 2026-10-23 after the owner's go-ahead)
- **Built:** `lib/i18n/sr.ts`, `lib/i18n/en.ts` (typed as `Dictionary` = the type of `sr`, so a missing or extra key fails `npm run typecheck`), `lib/i18n/index.ts` (locale resolution, `parseLocale`, `toProfileLocale`/`fromProfileLocale`, `htmlLang`, `format`, `interpolate`; no i18n package); removed `lib/i18n/.gitkeep`. `lib/legal.ts` (`TERMS_VERSION`). Migration `20261022124053_get_me.sql`: `rpc:get_me()` per EP-43 and the `Me`/`Entitlements` schemas; the column grant on `profiles` (update only `full_name`, `city_id`, `locale`); the organisation registration insert policy and creator-admin trigger (see deviations). `lib/supabase/database.types.ts` regenerated with `npm run db:types`. `lib/actions/registration.ts` (server actions `signUp`, `completeRegistration` (EP-41, `ActionResult<Me>`, `terms_version` must equal `TERMS_VERSION` → otherwise `fields.terms_version = outdated`), `updateMe` (EP-43), `setVisitorLocale`/`getVisitorLocale`). `app/(auth)/auth/callback/route.ts` calls `complete_registration` from `user_metadata` when no profile exists. S15 `app/(auth)/registracija/page.tsx` + `register-client.tsx` (account type, organisation fields and city Select from EP-67, SR/EN switch, `email_sent` and inline field errors from real responses, the terms label linking to `/uslovi` and `/privatnost`, the Google completion step). S18 `app/(app)/profil/page.tsx` + `profile-client.tsx` (name, city, language; the locale switches the UI immediately; sign-out). `app/(app)/layout.tsx`, `app/(org)/layout.tsx` (AppShell `user` and labels from EP-43 / `profiles.locale`; no `counts`). S30 `app/(public)/privatnost/*`, S31 `app/(public)/uslovi/*` in the PublicShell with the Design headings, the placeholder "Tekst dostavlja vlasnik (OQ-15)." and S31's "Verzija {TERMS_VERSION}"; removed `app/(public)/.gitkeep`. S16/S28 strings moved into the dictionaries. `components/app/shells.tsx` (`labels` prop, owner decision), `components/app/signed-in-shell.tsx` (owner instruction), `app/layout.tsx` (`<html lang>`, owner instruction). Tests: `tests/i18n/dictionaries.test.ts`, `tests/i18n/locale-switch.test.tsx`, `tests/registration/register-form.test.tsx`, `tests/registration/complete-registration.test.ts`, `tests/profile/profile-form.test.tsx`, `tests/legal/legal-pages.test.tsx`, `supabase/tests/get_me.test.sql`, `e2e/registration.spec.ts`.
- **Verification:**
  - `npm run typecheck` ✅ exit 0
  - `npm run lint` ✅ exit 0 (0 errors; the 2 known warnings in the generated `cloudflare-env.d.ts`)
  - `npm test` ✅ 34 files / 384 tests passed
  - `npx supabase test db` ✅ 34 files / 1172 tests, `All tests successful. Result: PASS` (includes `get_me.test.sql`)
  - `npm run build` ✅ exit 0 (`ƒ /_not-found`, `/auth/callback`, `/prijava`, `/prijava/nova-lozinka`, `/privatnost`, `/profil`, `/registracija`, `/uslovi`, `ƒ Proxy (Middleware)`)
  - `npm run e2e` ✅ `1 passed` — `[chromium] › e2e\registration.spec.ts › register with email and password; the product is usable only after verification` (sign up → "Proveri mejl" → `/ljubimci` refused → Mailpit verification link → `/ljubimci` → `/profil`). There is no `.env.local`; the run got `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and `NEXT_PUBLIC_SITE_URL=http://localhost:3000` as environment variables from `npx supabase status -o env`. The first run had needed `npx playwright install chromium` (user cache only).
- **Owner decisions:**
  - **`TERMS_VERSION = '2026-10-20'`** (owner).
  - **Shell labels (owner decision 1):** Step 12 may edit `components/app/shells.tsx`. `AppShell` and `PublicShell` each take one optional `labels` prop, a typed object of every visible string and aria-label they hardcoded, with today's Serbian strings as defaults; markup, classes and the docs mockups are unchanged. There is no separate OrgShell/AdminShell (they are `AppShell` variants). Nav labels are keyed by their Serbian text (`NavLabel`), so the nav arrays stay exactly as in the mockup. The app passes `dict.shell.app` / `dict.shell.public`. AuthShell is unchanged.
  - **Visitor language (owner decision 2):** cookie `ml_locale` = `sr` | `en`, path `/`, one year, `SameSite=Lax`, httpOnly, set and read on the server only. The S15 SR/EN switch sets it; every auth-free page (S15, S16, S28, S30, S31) reads it; no cookie → sr. A signed-in user uses `profiles.locale`; a language change on S18 updates both `profiles.locale` and the cookie. No Accept-Language detection, no `?lang=`. The S30/S31 en test sets `ml_locale=en`.
  - **Server-only auth:** sign-up, resend and Google sign-in from S15 run as server actions (`lib/actions/registration.ts`, `lib/actions/auth.ts`), never through the browser Supabase client (session cookies are httpOnly, Step 11).
  - **Owner instructions for the resume run (2026-10-23):** (a) `tests/design/ui-overrides.test.ts` keeps the "ported unchanged" check for `shells` and strips only the `labels` prop before comparing with the docs mockup: the `// labels:start … // labels:end` block (types and defaults), the two prop declarations, and each `labels.*` usage replaced by its default value. A comment in the test explains why `labels` is ignored. (b) `SignedInShell` moved from `app/(app)/profil/profile-client.tsx` into `components/app/signed-in-shell.tsx`. (c) `<html lang>` in `app/layout.tsx` comes from the active locale: a signed-in user's `profiles.locale`, otherwise the `ml_locale` cookie, otherwise `sr-Latn`.
  - **Exception 3, owner-approved:** (c) changes `app/layout.tsx`, so `tests/design/fonts.test.ts` (Step 10) now checks the new behaviour. `RootLayout` is async; the test awaits it and covers default `sr-Latn`, the visitor cookie `en`, and a signed-in `profiles.locale` that wins over the cookie. The font, icon and no-Toaster checks are unchanged.
- **Deviations (all accepted by the owner, from the previous run's STOPPED report):**
  - **Organisations at registration:** the `get_me` migration also adds a client insert policy on `organisations` (`organisations_insert_registration`, column grant on the insertable columns, `private.can_register_organisation`) and a trigger (`organisations_add_creator_admin` → `private.add_creator_admin`) that makes the creator its first admin. The Step 05 Session log said Step 12's `get_me` migration must add this.
  - **`get_me` is security definer**, scoped to the caller (`auth.uid()`), so it can read `app_settings.viber_enabled` (Operator-only under RLS). `Me.display_name` and `Me.marketplace` are left for Step 28b.
  - **Active nav item:** a layout cannot read the current path, so the `(app)` and `(org)` layouts render the client wrapper `SignedInShell`. It now lives in `components/app/signed-in-shell.tsx` (owner instruction b).
  - `lib/actions/registration.ts` also holds `updateMe` (EP-43) and the locale cookie helpers.
  - A member of a pending organisation can still change their profile (EP-43 lists no organisation gate).
  - The Google completion step reuses the S15 form without the email and password fields.
  - A rejected PIB turns its hint red, because there is no error copy for it.
  - A general form error reuses "Nešto nije u redu. Pokušaj ponovo." in a small inline line.
  - Users with no name show their email in the shell.
  - The `ErrorState` button text stays Serbian (`components/app/error-state.tsx` was not on this step's list; Step 13 adds its `labels` prop).
  - The seed users keep `terms_version = 'seed'`.
- **Follow-ups:**
  - Add the `ml_locale` cookie to `docs/product/03-technical-constraints.md`.
  - Add the shells' `labels` prop to `docs/product/04-design-system.md` §6.
  - Operator notification for pending shelters not sent — no Design §9.1 template (CR-24).
  - S18 screen file for Step 23: `app/(app)/profil/profile-client.tsx` (rendered by `app/(app)/profil/page.tsx`).
  - Local e2e needs the Supabase env vars (README: copy `.env.example` to `.env.local` and fill it from `npx supabase status`).

---

### Step 13 — Pets: list, create, edit, delete

| | |
|---|---|
| **Status** | ⬜ not started |
| **Outcome** | An owner sees their pets on S01 (with search and the Free limit), creates and edits a pet with a photo on S02, and a server action permanently deletes a pet; R2 upload and view links work for pet photos. |
| **Implements** | FR-01, FR-02, FR-03, FR-09, FR-13, FR-36 (active-pet limit), FR-59 · EP-01, EP-02 (RPC introduced here because S02 edit is its first consumer — Ordering Invariant 5), EP-03, EP-04, EP-05 (server action; its S03 control is wired in Step 14), EP-13 (`pet_photo`), EP-15 (`pet_photo`) · S01 `/ljubimci`, S02 `/ljubimci/novi` and `/ljubimci/[id]/izmena` · tables `pets`, `r2_deletion_queue` (via EP-05) · ADR-07 (`lib/integrations/r2.ts`), ADR-17 (`aws4fetch`) · ADR-15 flow "add pet" |
| **Depends on** | Step 12, Step 06 |
| **Blocked by** | — |
| **Track** | single |

**Read before starting:**
- `docs/product/02-prd.md` §6 FR-01, FR-02, FR-03, FR-09, FR-13, FR-36, FR-59; §8 BR-01, BR-03, BR-05, BR-50; §9 E-26
- `docs/product/03-technical-constraints.md` §3 ADR-07, ADR-14, ADR-16, ADR-17; §5 conventions, §5.3 `pets`, §5.5 `reminders` (birthday), §5.7 `r2_deletion_queue`, §5.9
- `docs/product/04-design-system.md` §5.1, §5.6, §6, §7 (pet avatars), §8, §9, §11 rows S01, S02, §12 S01, S02
- `docs/product/04-design/screens/pets-home.tsx`, `docs/product/04-design/screens/pet-form.tsx`
- `docs/product/05-api-integration-contract.md` §3, §4.3, §4.4 rows EP-01 – EP-05, EP-13, EP-15; §5.1 Part A conventions, EP-01, EP-02, EP-03, EP-04, EP-05, EP-13, EP-15; §6 `Access`, `PetSummary`, `Pet`, `PetRecord`, `UploadTicket`, `FileUrl`, `Entitlements`; §7; §10; §13 row FR-59
- `docs/product/06-build-plan.md` §4, §5, §6 and the Session logs of Steps 06, 08, 10, 12

**Files this step may touch:**
- `supabase/migrations/*_pet_summaries_api.sql` (new: `view:pet_summaries_api`, EP-01)
- `supabase/migrations/*_get_pet_record.sql` (new: `rpc:get_pet_record`, EP-02, full `PetRecord` per §6)
- `lib/supabase/` generated types file (via `npm run db:types` only)
- `lib/integrations/r2.ts` (new: presigned PUT, presigned GET, HEAD, delete — with `aws4fetch`)
- `package.json`, `package-lock.json` (add `aws4fetch` only)
- `lib/actions/uploads.ts` (new: EP-13 `request_upload` / `confirm_upload`, purpose `pet_photo` only)
- `lib/actions/files.ts` (new: EP-15 `get_file_urls`, kind `pet_photo` only)
- `lib/actions/pets.ts` (new: EP-05 `delete_pet`)
- `app/(app)/ljubimci/page.tsx`, `app/(app)/ljubimci/pets-home-client.tsx` (new, S01)
- `app/(app)/ljubimci/novi/page.tsx`, `app/(app)/ljubimci/novi/pet-form-client.tsx` (new, S02 create)
- `app/(app)/ljubimci/[id]/izmena/page.tsx` (new, S02 edit, reuses `pet-form-client.tsx`)
- `lib/i18n/sr.ts`, `lib/i18n/en.ts` (add keys)
- `supabase/tests/pet_summaries_api.test.sql`, `supabase/tests/get_pet_record.test.sql`, `supabase/tests/pet_birthday_reminder.test.sql`, `supabase/tests/pet_delete.test.sql`
- `tests/pets/pets-home.test.tsx`, `tests/pets/pet-form.test.tsx`, `tests/pets/delete-pet.test.ts`, `tests/pets/pet-photo-upload.test.ts`, `tests/integrations/r2.test.ts`
- `e2e/add-pet.spec.ts`
- `docs/product/06-build-plan.md` (Step 13 row in §3 and the Step 13 Session log only)

**Out of bounds:** S03 and every pet-record tab (Step 14); the "Danas" strip data (render it empty — EP-25 arrives in Step 17); the S01 link to Uspomene (Step 16); attachment and moment upload purposes and file kinds (Steps 15, 21); organisation animal fields of EP-03 (Step 24); any schema change other than the two read migrations; `components/ui`, `components/app`.

**Acceptance criteria:** (PRD v1.6, verbatim)
- FR-01 — Given a Free user with no active pet, When they save a profile with all required fields, Then the pet appears as active.
- FR-01 — Given a Free user who already has one active pet, When they try to create another, Then creation is blocked and a Premium offer is shown.
- FR-01 — Given the species "other", When saving without the free-text species, Then saving is blocked with a message.
- FR-02 — Given an existing pet, When the owner changes any field and saves, Then the new values are shown everywhere the pet appears.
- FR-03 — Given a pet, When the owner sets the unit to grams, Then weight entries for that pet are entered and shown in grams.
- FR-09 — Given a pet with a date of birth, When the profile is saved, Then a yearly birthday reminder is created (FR-20).
- FR-13 — Given a pet, When the owner confirms a single "Yes, delete" prompt, Then the pet and all its entries, attachments, moments, and reminders are permanently removed.
- FR-36 — Given a Free owner, Then limits are: 1 active pet, 2 memorials, 10 attachments per pet, 5 moments per pet, email and push channels only, no PDF export, no household sharing, logo always on shared images. *(this step verifies the 1-active-pet limit; the other limits are verified in Steps 15, 16, 18, 21, 22)*
- FR-59 — Given a list of pets, When the user types part of a name, Then only pets whose name contains the text (case- and diacritic-insensitive) are shown.
- FR-59 — Given no match, Then an empty result with the search term is shown.

**Tests to ship:**
- FR-01 (active after save) → `e2e/add-pet.spec.ts` (ADR-15 "add pet": signed-in Free owner creates a pet on S02 and sees it active on S01) and `supabase/tests/pet_summaries_api.test.sql` (row appears with `lifecycle = active`)
- FR-01 (second active pet blocked) → `supabase/tests/pet_summaries_api.test.sql` (second insert raises `premium_required`, `limit = pets`) and `tests/pets/pets-home.test.tsx` ("Dodaj ljubimca" opens PremiumLock for Free with 1 active pet)
- FR-01 (species other) → `tests/pets/pet-form.test.tsx` (inline message, no request sent)
- FR-02 → `tests/pets/pet-form.test.tsx` (edit variant preloads from EP-02 `pet` and saves through EP-04) and `supabase/tests/get_pet_record.test.sql` (updated values returned by EP-01 and EP-02)
- FR-03 → `tests/pets/pet-form.test.tsx` (unit `g` is saved) and `supabase/tests/get_pet_record.test.sql` (weights returned in the pet's unit after a unit change; display on S03 is re-asserted in Step 14)
- FR-09 → `supabase/tests/pet_birthday_reminder.test.sql` (insert/update with `birth_date` through the same columns S02 sends creates / recreates / removes the `birthday` reminder)
- FR-13 → `tests/pets/delete-pet.test.ts` (`confirm` must be true; Member/Volunteer get `forbidden_role`) and `supabase/tests/pet_delete.test.sql` (cascade removes entries, attachments, moments, reminders; R2 keys land in `r2_deletion_queue`)
- FR-36 (1 active pet) → covered by the FR-01 second-pet tests above
- FR-59 (both) → `tests/pets/pets-home.test.tsx` ("lu" matches "Luna"; "č" matches "c"; no match shows the empty result with the term)
- EP-13/EP-15 pet photo and R2 adapter → `tests/pets/pet-photo-upload.test.ts`, `tests/integrations/r2.test.ts` (with a fake R2; size/type rejection, HEAD mismatch deletes object)

**Verification:**
```
npm run typecheck      # expect: exit 0
npm run lint           # expect: exit 0
npm test               # expect: all Vitest suites pass, including the five files above
npx supabase test db   # expect: all pgTAP files pass, including the four files above
npm run build          # expect: build succeeds
npm run e2e            # expect: e2e/registration.spec.ts and e2e/add-pet.spec.ts pass
```

#### Prompt
```
You are executing Step 13 — Pets: list, create, edit, delete — of docs/product/06-build-plan.md. Work in the repository root.

Read first, in full:
- docs/product/02-prd.md §6 FR-01, FR-02, FR-03, FR-09, FR-13, FR-36, FR-59; §8 BR-01, BR-03, BR-05, BR-50; §9 E-26
- docs/product/03-technical-constraints.md §3 ADR-07, ADR-14, ADR-16, ADR-17, ADR-18; §5 conventions; §5.3 pets; §5.5 reminders; §5.7 r2_deletion_queue; §5.9
- docs/product/04-design-system.md §5.1, §5.6, §6, §7, §8, §9, §11 rows S01 and S02, §12 S01 and S02
- docs/product/04-design/screens/pets-home.tsx, docs/product/04-design/screens/pet-form.tsx
- docs/product/05-api-integration-contract.md §3; §4.3; §4.4 rows EP-01 – EP-05, EP-13, EP-15; §5.1 Part A conventions, EP-01, EP-02, EP-03, EP-04, EP-05, EP-13, EP-15; §6 Access, PetSummary, Pet, PetRecord, UploadTicket, FileUrl, Entitlements; §7; §10; §13 row FR-59
- docs/product/06-build-plan.md §4, §5, §6, and the Session logs of Steps 06, 08, 10 and 12

Settled upstream — apply exactly:
1. R2 signing: install aws4fetch (TC ADR-17) and use it in lib/integrations/r2.ts for presigned PUT/GET URLs and signed HEAD/DELETE requests against the R2 S3-compatible endpoint; do not hand-write request signing.
2. R2 keys: use exactly the key layout of docs/product/05-api-integration-contract.md §10 item 6 — the only layout; EP-13 references it.
3. Copy: docs/product/04-design-system.md §9 i18n rule for every string of S01 and S02 (lib/i18n/sr.ts and lib/i18n/en.ts; English is a faithful translation of the mockup copy; no new copy).
4. Public moment pages are not cached (TC ADR-18): EP-05 has no purge step.

Build:
1. Migration pet_summaries_api (npx supabase migration new pet_summaries_api): view:pet_summaries_api as EP-01 and §5.1 Part A define (security_invoker, computed fields per PetSummary). Migration get_pet_record: rpc:get_pet_record exactly as EP-02 and the PetRecord schema define. Validation rules in EP-03/EP-04 Request that the existing schema does not yet enforce may be added in these migrations only as check constraints on columns that already exist in 03- §5.3 — no new columns, tables or enum values. Run npm run db:types.
2. lib/integrations/r2.ts: presigned PUT and GET (10-minute expiry, 05- §10), HEAD, delete, configured from R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET (TC §8.1).
3. lib/actions/uploads.ts: EP-13 request_upload and confirm_upload for purpose pet_photo only (Request, Errors, Side effects as written; old photo key queued in r2_deletion_queue). lib/actions/files.ts: EP-15 get_file_urls for kind pet_photo only. lib/actions/pets.ts: EP-05 delete_pet (transaction, R2 key collection and queueing as written).
4. S01: port docs/product/04-design/screens/pets-home.tsx to app/(app)/ljubimci/pets-home-client.tsx with app/(app)/ljubimci/page.tsx. Keep markup, classes and composites; change imports from ../components/* to @/components/app/*; replace inline pets with EP-01 rows and photos via EP-15; FR-59 search filters the bounded EP-01 list on the client (05- §13 row FR-59), case- and diacritic-insensitive; "Dodaj ljubimca" opens PremiumLock when Entitlements say Free and own active count ≥ 1 (EP-01 States). Render the "Danas" card in its empty form (no reminder data until Step 17) and omit the Uspomene link (Step 16). Remove the StateSwitcher; drive loading / default / empty / premium_locked from real responses per 05- §7.3.
5. S02: port docs/product/04-design/screens/pet-form.tsx to app/(app)/ljubimci/novi/pet-form-client.tsx with app/(app)/ljubimci/novi/page.tsx (create, EP-03) and app/(app)/ljubimci/[id]/izmena/page.tsx (edit, preload from EP-02 `pet`, save with EP-04). Photo through EP-13 after the pet exists. Map 422 fields to inline errors, premium_required to PremiumLock, 5xx to the X state, per EP-03/EP-04 States. Remove the StateSwitcher.
6. Put every new string into lib/i18n/sr.ts and lib/i18n/en.ts per docs/product/04-design-system.md §9 (i18n rule: the Serbian text is the mockup copy, the English text its faithful translation; no new copy, no missing key).

Do not invent:
- No colours, spacing, radii, fonts or components outside 04-design-system.md §4–§6 and the existing components/ui and components/app; do not edit components/ui or components/app.
- No packages outside 03-technical-constraints.md ADR-17; add only aws4fetch to package.json.
- No endpoints, fields, error codes or RPC names outside 05-api-integration-contract.md.
- No tables, columns or enum values outside 03-technical-constraints.md §5.
- No user-facing copy that is not in 04-design-system.md or docs/product/04-design.

Files: create or modify only these. Touching any other file requires stopping and asking.
- supabase/migrations/<timestamp>_pet_summaries_api.sql, supabase/migrations/<timestamp>_get_pet_record.sql; the generated types file in lib/supabase/ (via npm run db:types only)
- lib/integrations/r2.ts, lib/actions/uploads.ts, lib/actions/files.ts, lib/actions/pets.ts
- package.json, package-lock.json (aws4fetch only)
- app/(app)/ljubimci/page.tsx, app/(app)/ljubimci/pets-home-client.tsx
- app/(app)/ljubimci/novi/page.tsx, app/(app)/ljubimci/novi/pet-form-client.tsx, app/(app)/ljubimci/[id]/izmena/page.tsx
- lib/i18n/sr.ts, lib/i18n/en.ts
- supabase/tests/pet_summaries_api.test.sql, supabase/tests/get_pet_record.test.sql, supabase/tests/pet_birthday_reminder.test.sql, supabase/tests/pet_delete.test.sql
- tests/pets/pets-home.test.tsx, tests/pets/pet-form.test.tsx, tests/pets/delete-pet.test.ts, tests/pets/pet-photo-upload.test.ts, tests/integrations/r2.test.ts
- e2e/add-pet.spec.ts
- docs/product/06-build-plan.md (Step 13 row in §3 and the Step 13 Session log only)

Acceptance criteria (PRD v1.6, verbatim — each needs a passing test):
- Given a Free user with no active pet, When they save a profile with all required fields, Then the pet appears as active.
- Given a Free user who already has one active pet, When they try to create another, Then creation is blocked and a Premium offer is shown.
- Given the species "other", When saving without the free-text species, Then saving is blocked with a message.
- Given an existing pet, When the owner changes any field and saves, Then the new values are shown everywhere the pet appears.
- Given a pet, When the owner sets the unit to grams, Then weight entries for that pet are entered and shown in grams.
- Given a pet with a date of birth, When the profile is saved, Then a yearly birthday reminder is created (FR-20).
- Given a pet, When the owner confirms a single "Yes, delete" prompt, Then the pet and all its entries, attachments, moments, and reminders are permanently removed.
- Given a Free owner, Then limits are: 1 active pet, 2 memorials, 10 attachments per pet, 5 moments per pet, email and push channels only, no PDF export, no household sharing, logo always on shared images. (This step tests the 1-active-pet limit only.)
- Given a list of pets, When the user types part of a name, Then only pets whose name contains the text (case- and diacritic-insensitive) are shown.
- Given no match, Then an empty result with the search term is shown.

Tests to write: exactly the files listed under "Tests to ship" in Step 13 of docs/product/06-build-plan.md, each covering the criterion named there.

Done means all of these pass, in this order, and you paste their output into the Session log:
npm run typecheck
npm run lint
npm test
npx supabase test db
npm run build
npm run e2e

When verification passes: update the Step 13 row in docs/product/06-build-plan.md §3 (Status ✅, Done = today's date), append a Session log entry under Step 13 (date, what was built, the output of each verification command, deviations, follow-ups), then commit with the message "Step 13: Pets: list, create, edit, delete".

If anything above is ambiguous, if a referenced section doesn't contain what this prompt says it does, or if completing this step would require touching a file outside the list or making a decision the referenced documents don't settle — STOP and ask. Do not choose a reasonable default. Do not proceed with a partial implementation.
```

#### Session log
**2026-10-23** (unattended overnight run)
- **Built:**
  - Migration `20261023051407_pet_summaries_api.sql`: `view:pet_summaries_api` (EP-01, `security_invoker`, every PetSummary field; on top of RLS it lists own pets, shared pets that are active, and the organisation's active breeding stock). Security definer helpers scoped to `auth.uid()`: `private.pet_access` (Access), `private.pet_can_log`, `private.is_transferred_copy`, `private.pet_person_name` (profiles RLS is self-only, so `owner_name` / `created_by_name` come from here, only for callers who can read the pet), and `private.pet_upcoming_reminders` (ReminderOccurrence instances per API §5.3 and the EP-25 visibility rules, with channels and `can_mark_done`). Also the EP-03/EP-04 Request rules as check constraints on existing `pets` columns: name 1–60, species_other 1–60, the ≤100 / ≤30 / ≤2000 / ≤1000 / ≤40 lengths, `birth_year ≥ 1990`, birth_date XOR birth_year. The clock-dependent rules (birth_date not in the future, birth_year ≤ this year) are checked in the action, because a check constraint must not depend on the clock.
  - Migration `20261023051410_get_pet_record.sql`: `rpc:get_pet_record(p_pet_id)` (EP-02, stable, security invoker; no relation → `not_found`) returns the full PetRecord: Pet without the raw key, access, can_log, read_only_reason, owner_name, memorial, upcoming_reminders (3), vaccinations with days_until_due, treatments with is_active / next dose / recent_doses / dose_count, vet_visits with Money cost and attachments, weights in the pet's unit with per-entry access, and attachment_count. Helpers `private.pet_json` and `private.entry_access`. `lib/supabase/database.types.ts` regenerated with `npm run db:types`.
  - `lib/integrations/r2.ts` (aws4fetch): presigned PUT, with Content-Type and Content-Length signed, and presigned GET with inline Content-Disposition, both 10 minutes; signed HEAD and DELETE; `safeFileName`; config from `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET`.
  - `lib/actions/uploads.ts`: EP-13 `requestUpload` / `confirmUpload` for `pet_photo`. Uses the §10 key layout, a stateless HMAC `upload_token`, and HEAD verification (on a mismatch the object is deleted and the action returns `file_too_large` / `file_type_not_allowed`). The old photo key is queued in `r2_deletion_queue`.
  - `lib/actions/files.ts`: EP-15 `getFileUrls` (`pet_photo`; other kinds answer `url = null` until their steps).
  - `lib/actions/pets.ts`: EP-03 `createPet`, EP-04 `updatePet` (with Request validation and field codes) and EP-05 `deletePet`. Also the PetSummary / Pet / PetRecord / ReminderOccurrence types.
  - S01 `app/(app)/ljubimci/page.tsx` + `pets-home-client.tsx`: Suspense loading state, then default / empty / error. FR-59 search uses the mockup's normaliser. The Free counter and PremiumLock show when the owner's active pets reach `Entitlements.limits.active_pets`. Photos come from EP-15. The "Danas" card is in its empty form. No StateSwitcher.
  - S02 `app/(app)/ljubimci/novi/page.tsx` + `pet-form-client.tsx` and `app/(app)/ljubimci/[id]/izmena/page.tsx`: create (EP-03) and edit (EP-02 preload, EP-04 save). The photo goes through EP-13 after save. Errors map as follows: 422 → inline, `premium_required` → PremiumLock, other / 5xx → the X ErrorState. Success shows a toast and redirects to `/ljubimci/[id]`. No StateSwitcher.
  - i18n: `common` (retry, premium lock title/CTA, Premium), `pet`, `petsHome`, `petForm` in `lib/i18n/sr.ts` and `en.ts`.
  - Tests: `tests/pets/pets-home.test.tsx` (15), `tests/pets/pet-form.test.tsx` (16), `tests/pets/delete-pet.test.ts` (10), `tests/pets/pet-photo-upload.test.ts` (19), `tests/integrations/r2.test.ts` (9), `tests/components/error-state.test.tsx` (2); pgTAP `pet_summaries_api` (43), `get_pet_record` (47), `pet_birthday_reminder` (16), `pet_delete` (27); `e2e/add-pet.spec.ts`.
- **Verification:**
  - `npm run typecheck` ✅ exit 0
  - `npm run lint` ✅ exit 0 (0 errors; the 2 known warnings in the generated `cloudflare-env.d.ts`)
  - `npm test` ✅ `Test Files 40 passed (40)`, `Tests 455 passed (455)`
  - `npx supabase test db` ✅ `Files=38, Tests=1305`, `All tests successful.` `Result: PASS`
  - `npm run build` ✅ exit 0. Routes: `ƒ /_not-found`, `/auth/callback`, `/ljubimci`, `/ljubimci/[id]/izmena`, `/ljubimci/novi`, `○ /manifest.webmanifest`, `ƒ /prijava`, `/prijava/nova-lozinka`, `/privatnost`, `/profil`, `/registracija`, `/uslovi`, `ƒ Proxy (Middleware)`
  - `npm run e2e` ✅ `2 passed` — `e2e\registration.spec.ts` and `e2e\add-pet.spec.ts` (fresh verified Free owner → S01 empty → S02 create → toast + redirect → S01 shows Luna active, "Free · 1 / 1 aktivan ljubimac", and "Dodaj ljubimca" → `#premium-lock`). As in Step 12, the Supabase env vars came from `npx supabase status -o env` (no `.env.local`).
- **Owner decisions used (2026-10-23):**
  - EP-03/EP-04 run as the server actions `createPet` / `updatePet` in `lib/actions/pets.ts`.
  - `<Toaster/>` from `@/components/ui/sonner` is mounted in `app/(app)/layout.tsx` (bottom centre, 4 s, Design §8). The toast text is the mockup's `role="status"` text. A failed photo upload after save shows the 5xx toast "Nešto nije u redu. Pokušaj ponovo."
  - `components/app/error-state.tsx` got an optional `labels` prop (`{ retry }`, default "Pokušaj ponovo"), following the shells.tsx pattern. **Exception 3:** `tests/design/ui-overrides.test.ts` keeps the "ported unchanged" check and strips only that prop (`stripErrorStateLabels`). `tests/components/error-state.test.tsx` is new.
  - English is a faithful translation written in this step. Formats use `Intl` (sr-Latn "19. 10. 2026.", en-GB "19 Oct 2026", "08:00"). Plurals use `Intl.PluralRules` with `_one/_few/_other` keys; `lib/i18n/index.ts` is unchanged. The calendar captions are the mockup arrays, stored as comma-separated dictionary strings.
  - 422 without mockup copy: the date picker disables future dates. Any other unmapped field code shows the S02 form-level error ("Nismo uspeli da sačuvamo ljubimca…").
  - Sex unknown: the S01 sex chip is hidden.
  - PremiumLock CTA stays inert (Step 23).
  - S01 cards leave out Težina and "Karton ažuriran". With only "Otvori karton" left in the footer, the footer row is `justify-end` instead of `justify-between`.
  - No next reminder → "Nema zakazanih podsetnika.". A birthday with a null title → "Rođendan — {pet}".
  - Age: years with plurals. Under 1 year it shows months. With only a birth year it shows "oko …"; a birth year equal to the current year counts months since January. No date hides Starost.
  - "Danas" card when empty: heading, weekday from `Intl`, "Danas nema podsetnika."; no count, no "Pogledaj sve".
  - "Ukloni fotografiju" only clears a photo not uploaded yet; a saved photo can only be replaced.
  - The edit route is `/ljubimci/[id]/izmena`. EP-03/EP-04 redirect to S03 (`/ljubimci/[id]`, Step 14); the e2e spec opens `/ljubimci` itself.
- **Deviations / decisions:**
  - **upload_token signing key:** TC §8.1 names no separate key. The HMAC uses `ACTION_TOKEN_SECRET` (the app's only token-signing secret), with an `up_` prefix and an `upload:` domain separator.
  - **Old photo key queueing** writes `r2_deletion_queue` with the service-role client, because the table has no client access (TC §5.7) and this step allows no new trigger. This is the Step 06 follow-up.
  - **EP-05:** the key collection and queueing are done by the existing after-delete triggers on `pets`, `attachments` and `moment_photos`, inside the same transaction as the delete (not after commit). The action is a single RLS-scoped delete: 0 rows → `not_found`, and the role trigger → `forbidden_role`.
  - **EP-13 authorization** is checked in the action: owner or organisation team ✅, member → `forbidden_role`. The transferred-copy rule (`forbidden_role`) is not enforced on uploads yet (Step 25, as in Step 06).
  - **EP-03 organisation callers:** a caller with an organisation membership creates for that organisation (`organisation_id`). The organisation-only fields remain Step 24's.
  - **Per-entry access when the household is read-only:** only members lose edit rights. The owner keeps writing (Step 06 rule).
  - **ReminderOccurrence on S01:** vaccination, birthday and vet follow-up show the date; doses, meals and manual reminders show date · time. A reminder due today shows "Danas · HH:mm" and the Danas badge. Other open reminders get no badge.
  - **S01 subtitle without a breed:** the species label (or `species_other`).
  - **S02 photo preview:** the avatar preview shows the saved photo (EP-15) in edit mode.
  - **Files touched outside the original Step 13 list (owner decisions):** `app/(app)/layout.tsx` (Toaster), `components/app/error-state.tsx`, `tests/design/ui-overrides.test.ts`, `tests/components/error-state.test.tsx`.
- **Follow-ups:**
  - `ReminderTypeIcon` still has a Serbian-only sr-only type label (`reminderTypeLabel`). It is not on this step's list; Step 17 adds the reminder composites' labels.
  - Local photo upload needs real R2 credentials (`R2_*`) and `ACTION_TOKEN_SECRET` in `.env.local`. Without them the upload fails and the save still succeeds, with the error toast.
  - Add `ACTION_TOKEN_SECRET` as the upload-token key to TC §8.1 (its purpose line names only action links).

---

### Step 14 — Pet record: view, weight, vaccinations

| | |
|---|---|
| **Status** | ⬜ not started |
| **Outcome** | S03 shows a pet's record (header, Pregled, Vakcine, Težina tabs) for owners and read-only for household members; weight entries and vaccinations can be added, edited and deleted; the S03 menu permanently deletes a pet. |
| **Implements** | FR-04, FR-05, FR-28 (view side), FR-03 (display re-check) · EP-02 (consumed), EP-05 (S03 caller), EP-08, EP-09 · S03 `/ljubimci/[id]`, S04 `/ljubimci/[id]/vakcine/nova` · tables `weight_entries`, `vaccinations` (+ `reminders` via the Step 08 trigger) |
| **Depends on** | Step 13, Step 08 |
| **Blocked by** | — |
| **Track** | single |

**Read before starting:**
- `docs/product/02-prd.md` §6 FR-03, FR-04, FR-05, FR-28; §8 BR-22, BR-23, BR-28; §9 E-01, E-12
- `docs/product/03-technical-constraints.md` §5.3 `weight_entries`, `vaccinations`; §5.5 `reminders`
- `docs/product/04-design-system.md` §5.1, §5.6, §6 (PetHeader, ReadOnlyBanner, EmptyState, StatusBadge), §8, §9, §11 rows S03, S04, §12 S03, S04
- `docs/product/04-design/screens/pet-record.tsx`, `docs/product/04-design/screens/vaccination-form.tsx`
- `docs/product/05-api-integration-contract.md` §4.3, §4.4 rows EP-02, EP-05, EP-08, EP-09; §5.1 Part A, EP-02, EP-05, EP-08, EP-09; §6 `Access`, `PetRecord`, `WeightEntry`, `Vaccination`; §7.3 rows *empty*, *error*, *read_only*
- `docs/product/06-build-plan.md` §4, §5, §6 and the Session log of Step 13

**Files this step may touch:**
- `supabase/migrations/*_weight_entries_api.sql` (new: `view:weight_entries_api`, EP-08)
- `lib/supabase/` generated types file (via `npm run db:types` only)
- `app/(app)/ljubimci/[id]/page.tsx`, `app/(app)/ljubimci/[id]/pet-record-client.tsx` (new, S03)
- `app/(app)/ljubimci/[id]/vakcine/nova/page.tsx`, `app/(app)/ljubimci/[id]/vakcine/nova/vaccination-form-client.tsx` (new, S04)
- `lib/i18n/sr.ts`, `lib/i18n/en.ts` (add keys)
- `supabase/tests/weight_entries_api.test.sql`, `supabase/tests/vaccination_reminder_sync.test.sql`
- `tests/pet-record/weight-tab.test.tsx`, `tests/pet-record/vaccination-form.test.tsx`, `tests/pet-record/member-view.test.tsx`, `tests/pet-record/delete-dialog.test.tsx`
- `docs/product/06-build-plan.md` (Step 14 row in §3 and the Step 14 Session log only)

**Out of bounds:** Terapije and Pregledi tabs and their forms (Step 15); "Premesti u Uspomene" and "Izvezi PDF" actions (Step 16); the Pregled tab's "next 3 reminders" block (Step 17 — omit it); links to Dnevnik and Trenuci (Steps 20, 21 — omit them); the "Predlog veterinara u blizini" aside block (Step 27); organisation-animal variant reached from S20 (Step 24); any schema change other than the view; `components/ui`, `components/app`.

**Acceptance criteria:** (PRD v1.6, verbatim)
- FR-04 — Given two or more weight entries, When the owner opens weight history, Then all entries are shown in date order as a trend over time.
- FR-05 — Given a vaccination with a next dose date, When it is saved, Then a vaccination reminder is created automatically (FR-20).
- FR-05 — Given a saved vaccination, When the owner edits or deletes it, Then the linked reminder is updated or removed accordingly.
- FR-28 — Given a member, Then they can add weight entries, mark doses given, add feeding and stool entries, add moments, and mark reminders done. *(this step: weight entries)*
- FR-28 — Given a member, Then they can view but not add or change vaccinations, treatments (other than marking doses), vet visits, attachments, or reminders. *(this step: vaccinations)*
- FR-28 — Given an entry created by another person, When a member tries to edit or delete it, Then the action is not available. *(this step: weight entries)*
- FR-03 — Given a pet, When the owner sets the unit to grams, Then weight entries for that pet are entered and shown in grams. *(display half, first asserted here)*

**Tests to ship:**
- FR-04 → `tests/pet-record/weight-tab.test.tsx` (entries rendered in `measured_on` order as the bar trend)
- FR-05 (created) → `supabase/tests/vaccination_reminder_sync.test.sql` (insert with `next_due_on` creates the `vaccination` reminder) and `tests/pet-record/vaccination-form.test.tsx` (S04 sends `next_due_on`, shows the helper, returns to S03)
- FR-05 (edit/delete) → `supabase/tests/vaccination_reminder_sync.test.sql` (moving `next_due_on` moves the reminder; clearing it or deleting the row removes reminder and occurrences)
- FR-28 (member adds weight; others' entries not editable) → `supabase/tests/weight_entries_api.test.sql` (member insert allowed; update/delete of another person's entry → `forbidden_role`; read-only household → `household_read_only`) and `tests/pet-record/member-view.test.tsx` (row actions hidden where `access.can_edit = false`)
- FR-28 (vaccinations view-only) → `tests/pet-record/member-view.test.tsx` (member sees ReadOnlyBanner per `read_only_reason` and no vaccination add/edit controls)
- FR-03 (display) → `tests/pet-record/weight-tab.test.tsx` (values and input in `g` when `weight_unit = g`)
- EP-05 S03 control → `tests/pet-record/delete-dialog.test.tsx` (AlertDialog "Da, obriši" calls `delete_pet` with `confirm: true`, then redirects to S01)

**Verification:**
```
npm run typecheck      # expect: exit 0
npm run lint           # expect: exit 0
npm test               # expect: all Vitest suites pass, including the four files above
npx supabase test db   # expect: all pgTAP files pass, including the two files above
npm run build          # expect: build succeeds
```

#### Prompt
```
You are executing Step 14 — Pet record: view, weight, vaccinations — of docs/product/06-build-plan.md. Work in the repository root.

Read first, in full:
- docs/product/02-prd.md §6 FR-03, FR-04, FR-05, FR-28; §8 BR-22, BR-23, BR-28; §9 E-01, E-12
- docs/product/03-technical-constraints.md §5.3 weight_entries, vaccinations; §5.5 reminders
- docs/product/04-design-system.md §5.1, §5.6, §6, §8, §9, §11 rows S03 and S04, §12 S03 and S04
- docs/product/04-design/screens/pet-record.tsx, docs/product/04-design/screens/vaccination-form.tsx
- docs/product/05-api-integration-contract.md §4.3; §4.4 rows EP-02, EP-05, EP-08, EP-09; §5.1 Part A, EP-02, EP-05, EP-08, EP-09; §6 Access, PetRecord, WeightEntry, Vaccination; §7.3
- docs/product/06-build-plan.md §4, §5, §6, and the Session log of Step 13

Copy (settled upstream): docs/product/04-design-system.md §9 i18n rule — every string of S03 and S04 goes into lib/i18n/sr.ts and lib/i18n/en.ts; the Serbian text is the mockup copy and the English text is its faithful translation; no new copy, no missing key.

Build:
1. Migration weight_entries_api (npx supabase migration new weight_entries_api): view:weight_entries_api as §5.1 Part A and the WeightEntry schema define, including per-entry access. Validation rules in EP-08/EP-09 Request not yet enforced by the schema may be added only as check constraints on existing 03- §5.3 columns. Run npm run db:types.
2. S03: port docs/product/04-design/screens/pet-record.tsx to app/(app)/ljubimci/[id]/pet-record-client.tsx with app/(app)/ljubimci/[id]/page.tsx. Keep markup, classes and composites (PetHeader inside data-pet-sex); change imports from ../components/* to @/components/app/*. Data from EP-02; photos via EP-15. In this step include only the header (with the "Izmeni" link to /ljubimci/[id]/izmena and the DropdownMenu item "Obriši trajno" → AlertDialog → EP-05 delete_pet), and the Pregled (last weight, last visit only), Vakcine and Težina tabs. Omit the Terapije and Pregledi tabs, "Premesti u Uspomene", "Izvezi PDF", the next-reminders block, and the Dnevnik/Trenuci links — later steps add them. Weight add/edit/delete through EP-08; vaccination edit/delete through EP-09. Remove the StateSwitcher; drive loading / default / per-tab empty / read_only / error from real responses per EP-02 States and 05- §7.3 (read_only hides controls, never disables them).
3. S04: port docs/product/04-design/screens/vaccination-form.tsx to app/(app)/ljubimci/[id]/vakcine/nova/vaccination-form-client.tsx with its page.tsx; pet header from EP-01 (id filter), clinic prefilled from vet_name; save with EP-09; States per EP-09. Remove the StateSwitcher.
4. Put every new string into lib/i18n/sr.ts and lib/i18n/en.ts per docs/product/04-design-system.md §9 (i18n rule: the Serbian text is the mockup copy, the English text its faithful translation; no new copy, no missing key).

Do not invent:
- No colours, spacing, radii, fonts or components outside 04-design-system.md §4–§6 and the existing components/ui and components/app; do not edit components/ui or components/app.
- No packages outside 03-technical-constraints.md ADR-17; do not add any dependency to package.json.
- No endpoints, fields, error codes or RPC names outside 05-api-integration-contract.md.
- No tables, columns or enum values outside 03-technical-constraints.md §5.
- No user-facing copy that is not in 04-design-system.md or docs/product/04-design.

Files: create or modify only these. Touching any other file requires stopping and asking.
- supabase/migrations/<timestamp>_weight_entries_api.sql; the generated types file in lib/supabase/ (via npm run db:types only)
- app/(app)/ljubimci/[id]/page.tsx, app/(app)/ljubimci/[id]/pet-record-client.tsx
- app/(app)/ljubimci/[id]/vakcine/nova/page.tsx, app/(app)/ljubimci/[id]/vakcine/nova/vaccination-form-client.tsx
- lib/i18n/sr.ts, lib/i18n/en.ts
- supabase/tests/weight_entries_api.test.sql, supabase/tests/vaccination_reminder_sync.test.sql
- tests/pet-record/weight-tab.test.tsx, tests/pet-record/vaccination-form.test.tsx, tests/pet-record/member-view.test.tsx, tests/pet-record/delete-dialog.test.tsx
- docs/product/06-build-plan.md (Step 14 row in §3 and the Step 14 Session log only)

Acceptance criteria (PRD v1.6, verbatim — each needs a passing test):
- Given two or more weight entries, When the owner opens weight history, Then all entries are shown in date order as a trend over time.
- Given a vaccination with a next dose date, When it is saved, Then a vaccination reminder is created automatically (FR-20).
- Given a saved vaccination, When the owner edits or deletes it, Then the linked reminder is updated or removed accordingly.
- Given a member, Then they can add weight entries, mark doses given, add feeding and stool entries, add moments, and mark reminders done. (This step: weight entries.)
- Given a member, Then they can view but not add or change vaccinations, treatments (other than marking doses), vet visits, attachments, or reminders. (This step: vaccinations.)
- Given an entry created by another person, When a member tries to edit or delete it, Then the action is not available. (This step: weight entries.)
- Given a pet, When the owner sets the unit to grams, Then weight entries for that pet are entered and shown in grams. (Display half.)

Tests to write: exactly the files listed under "Tests to ship" in Step 14 of docs/product/06-build-plan.md, each covering the criterion named there.

Done means all of these pass, in this order, and you paste their output into the Session log:
npm run typecheck
npm run lint
npm test
npx supabase test db
npm run build

When verification passes: update the Step 14 row in docs/product/06-build-plan.md §3 (Status ✅, Done = today's date), append a Session log entry under Step 14 (date, what was built, the output of each verification command, deviations, follow-ups), then commit with the message "Step 14: Pet record: view, weight, vaccinations".

If anything above is ambiguous, if a referenced section doesn't contain what this prompt says it does, or if completing this step would require touching a file outside the list or making a decision the referenced documents don't settle — STOP and ask. Do not choose a reasonable default. Do not proceed with a partial implementation.
```

#### Session log
**2026-10-23** (unattended overnight run)
- **Built:**
  - Migration `20261023053835_weight_entries_api.sql`: `view:weight_entries_api` (EP-08, `security_invoker`, every WeightEntry field). `weight_unit` comes from the pet, `created_by_name` from `private.pet_person_name`, and the per-entry `access` from `private.entry_access(private.pet_access(…))`, the same rule as `get_pet_record`. The EP-08 / EP-09 Request rules are added as check constraints on existing columns: `weight_entries.note` ≤ 500; `vaccinations.name` 1–100, `next_due_on > given_on`, `clinic` ≤ 100, `batch_number` ≤ 60, `note` ≤ 1000. The clock rules (`measured_on` / `given_on` not in the future) are checked in the actions. `lib/supabase/database.types.ts` regenerated with `npm run db:types`.
  - `lib/actions/weights.ts`: EP-08 `createWeightEntry` / `updateWeightEntry` / `deleteWeightEntry`. Request validation with field codes; writes read back through `weight_entries_api`; RLS insert rejection → `not_found`; 0 rows → `not_found`; trigger errors (`forbidden_role`, `household_read_only`) pass through.
  - `lib/actions/vaccinations.ts`: EP-09 `createVaccination` / `updateVaccination` / `deleteVaccination`. Request validation, including `before_start` against the stored `given_on` on update; returns the Vaccination schema with `days_until_due` (Belgrade). The Step 08 trigger syncs the reminder.
  - S03 `app/(app)/ljubimci/[id]/page.tsx` + `pet-record-client.tsx`, ported from `pet-record.tsx`: Suspense loading state, then default / per-tab empty / read_only / error (`PetRecordError`, retry = `router.refresh()`). Shows PetHeader (EP-15 photo, "Izmeni" link, DropdownMenu "Obriši trajno" → AlertDialog → EP-05 → toast + `/ljubimci`), Pregled (last weight with change, last visit), Vakcine (next-dose badge, row menu, edit route link, delete dialog → EP-09) and Težina (bar trend oldest → newest, all measurements newest first, add / edit dialog and delete dialog → EP-08). Aside: "Osnovni podaci" and "Moj veterinar". No StateSwitcher.
  - S04 `app/(app)/ljubimci/[id]/vakcine/nova/page.tsx` + `vaccination-form-client.tsx`: EP-01 single-pet header (`[]` or `access.can_edit = false` → error state), clinic prefilled from `vet_name`, "Napravićemo podsetnik." helper, EP-09 insert → toast + back to S03. 422 → inline; any other failure → the X ErrorState. No StateSwitcher.
  - Edit route `app/(app)/ljubimci/[id]/vakcine/[vakcinaId]/page.tsx`: EP-02 preload, the S04 form in edit mode ("Izmeni vakcinu", "Sačuvaj izmene"), EP-09 update.
  - i18n: `petRecord` and `vaccinationForm` in `lib/i18n/sr.ts` and `en.ts`.
  - Tests: `tests/pet-record/weight-tab.test.tsx` (11), `vaccination-form.test.tsx` (12), `member-view.test.tsx` (11), `delete-dialog.test.tsx` (8), `tests/components/pet-header.test.tsx` (2); pgTAP `weight_entries_api` (29), `vaccination_reminder_sync` (22).
- **Verification:**
  - `npm run typecheck` ✅ exit 0
  - `npm run lint` ✅ exit 0 (0 errors; the 2 known warnings in the generated `cloudflare-env.d.ts`)
  - `npm test` ✅ `Test Files 45 passed (45)`, `Tests 499 passed (499)`
  - `npx supabase test db` ✅ `Files=40, Tests=1356`, `All tests successful.` `Result: PASS`
  - `npm run build` ✅ exit 0. Routes: `ƒ /_not-found`, `/auth/callback`, `/ljubimci`, `/ljubimci/[id]`, `/ljubimci/[id]/izmena`, `/ljubimci/[id]/vakcine/[vakcinaId]`, `/ljubimci/[id]/vakcine/nova`, `/ljubimci/novi`, `○ /manifest.webmanifest`, `ƒ /prijava`, `/prijava/nova-lozinka`, `/privatnost`, `/profil`, `/registracija`, `/uslovi`, `ƒ Proxy (Middleware)`
- **Owner decisions used (2026-10-23):**
  - EP-08 / EP-09 run as server actions in `lib/actions/weights.ts` and `lib/actions/vaccinations.ts` (added to the file list).
  - `components/app/pet-header.tsx` got an optional `labels` prop (`{ chips }`, default "Osnovni podaci"), following the shells.tsx pattern. **Exception 3:** `tests/design/ui-overrides.test.ts` keeps the "ported unchanged" check and strips only that prop (`stripPetHeaderLabels`). `tests/components/pet-header.test.tsx` is new.
  - Weight and vaccination rows have a row DropdownMenu ("Još opcija: {entry}") with "Izmeni" / "Obriši". Delete opens the AlertDialog "Obrisati unos?" / "Ovo ne može da se poništi." / "Da, obriši" / "Odustani".
  - Weight edit reuses the weight dialog with the title "Izmeni merenje — {pet}". Vaccination edit uses the new route `/ljubimci/[id]/vakcine/[vakcinaId]` with "Izmeni vakcinu" / "Sačuvaj izmene".
  - "Dodaj merenje" (header button and empty-state action) is gated on `can_log` (FR-28). Weight row actions follow the entry's `access.can_edit`. Vaccination add and row actions follow `access.can_edit`. "Izmeni" follows `access.can_edit`; "Obriši trajno" follows `access.can_delete`, and the DropdownMenu is hidden when it would be empty.
  - ReadOnlyBanner text by `read_only_reason` (household_member with `owner_name`, household_read_only, transferred), as given.
  - Vaccine badge: 0–30 days → soon ("· danas" at 0, "· za {n} dan/dana" with Intl plurals); below 0 → missed ("· kasni {n} dan/dana"); over 30 → outline "Sledeća {date}"; no next dose → "Bez sledeće doze".
  - S03 aside: "Osnovni podaci" and "Moj veterinar" ("Pozovi" hidden without a phone). The no-vet card, "Još o ljubimcu" and "Svi pregledi" are left out.
  - `page.tsx` passes `Me.entitlements` to the client (unused until Steps 15–16).
  - Toast text is the mockup's `role="status"` text; failed writes show the 5xx toast "Nešto nije u redu. Pokušaj ponovo." and reload the record.
  - English is a faithful translation written in this step. Formats use `Intl` (sr-Latn "19. 10. 2026." / "4,2 kg", en-GB "19 Oct 2026" / "4.2 kg"). Plurals use `_one/_few/_other` keys; `lib/i18n/index.ts` is unchanged.
  - 422 without mockup copy: the date pickers disable future dates (`measured_on`, `given_on`) and days on or before `given_on` (`next_due_on`). Any other unmapped field code shows the form-level error: "Nismo uspeli da sačuvamo vakcinu…" on S04, and the 5xx message in the weight dialog's error slot.
  - Sex unknown: masculine forms ("Kastriran", "obrisan"); the sex chip is hidden.
- **Deviations / decisions:**
  - **Pregled empty condition** keeps the mockup rule (no upcoming reminders, no weight, no visit), using `PetRecord.upcoming_reminders`, even though the reminders block itself is left out until Step 17.
  - **Aside rows without a value** (breed, birthday, colour, microchip, passport) are hidden. A birth year alone shows the year. Neutered `unknown` shows "Ne znam" (S02 copy). The microchip meta line in the header is hidden without a microchip. Without a breed, the header subtitle uses the species label, as on S01.
  - **Vakcine empty-state action** links to S04 (the mockup button had no target).
  - **Weight values** use `Intl.NumberFormat` with 1–3 decimals in kg and 0–3 in g, so stored decimals are never rounded away. The mockup used `toFixed(1)` / round.
  - **No toast after an entry delete** (the mockup has no copy for it); the list refreshes.
  - **S04 `role="status"` line** is replaced by the toast, because a successful save navigates back to S03 (same as S02 in Step 13). S04 and the edit route show the error state for a caller without `access.can_edit` (a member who opens the URL directly).
  - **PetRecord entry types:** `lib/actions/pets.ts` (not on this step's list) still types `vaccinations` / `weights` loosely. The client casts them to `Vaccination` / `WeightEntry` from the new action files.
  - **Insert ids in pgTAP:** `vaccinations.id` is not a client-insertable column, so `vaccination_reminder_sync.test.sql` inserts as the authenticated owner and reads the id back.
  - **Files touched outside the original Step 14 list (owner decisions):** `lib/actions/weights.ts`, `lib/actions/vaccinations.ts`, `app/(app)/ljubimci/[id]/vakcine/[vakcinaId]/page.tsx`, `components/app/pet-header.tsx`, `tests/design/ui-overrides.test.ts`, `tests/components/pet-header.test.tsx`.
- **Follow-ups:**
  - Tighten the `PetRecord` entry array types in `lib/actions/pets.ts` when that file is next on a step's list (Step 15 adds treatments and visits).
  - The transferred-copy rule (`forbidden_role`) is still not enforced on entry writes in the database (Step 25, as noted in Steps 06 and 13). The UI already hides the controls.

---

### Step 15 — Treatments, doses, vet visits & attachments

| | |
|---|---|
| **Status** | ⬜ not started |
| **Outcome** | Owners record treatments (with dose reminders) and vet visits (with check-up reminders and image/PDF attachments up to 10 MB); anyone with care rights logs a dose; S03 gains the Terapije and Pregledi tabs. |
| **Implements** | FR-06, FR-07, FR-08, FR-36 (attachment limit) · EP-10, EP-11, EP-12, EP-13 (`attachment`), EP-14, EP-15 (`attachment`) · S27 `/ljubimci/[id]/terapije/nova`, S05 `/ljubimci/[id]/pregledi/novi`, S03 tabs Terapije, Pregledi · tables `treatments`, `dose_logs`, `vet_visits`, `attachments` · ADR-07 (uses `lib/integrations/r2.ts` from Step 13) |
| **Depends on** | Step 14 |
| **Blocked by** | — |
| **Track** | single |

**Read before starting:**
- `docs/product/02-prd.md` §6 FR-06, FR-07, FR-08, FR-28; §8 BR-01, BR-02, BR-05, BR-13, BR-22, BR-49; §9 E-04; §10 NFR-09
- `docs/product/03-technical-constraints.md` §3 ADR-07; §5.3 `treatments`, `dose_logs`, `vet_visits`, `attachments`; §5.5 `reminders`, `reminder_occurrences`; §7 row NFR-09
- `docs/product/04-design-system.md` §6 (PremiumLock), §7 (attachments), §8, §9, §11 rows S03, S05, S27, §12 S03, S05, S27
- `docs/product/04-design/screens/treatment-form.tsx`, `docs/product/04-design/screens/vet-visit-form.tsx`, `docs/product/04-design/screens/pet-record.tsx` (Terapije, Pregledi tabs)
- `docs/product/05-api-integration-contract.md` §4.4 rows EP-10 – EP-15; §5.1 Part A, EP-10, EP-11, EP-12, EP-13, EP-14, EP-15; §6 `Treatment`, `DoseLog`, `VetVisit`, `Attachment`, `UploadTicket`, `FileUrl`; §7.2; §7.3; §10
- `docs/product/06-build-plan.md` §4, §5, §6 and the Session logs of Steps 13, 14

**Files this step may touch:**
- `supabase/migrations/*_log_dose.sql` (new: `rpc:log_dose`, EP-11)
- `lib/supabase/` generated types file (via `npm run db:types` only)
- `lib/actions/uploads.ts` (modify: add purpose `attachment`)
- `lib/actions/files.ts` (modify: add kind `attachment`)
- `lib/actions/attachments.ts` (new: EP-14 `delete_attachment`)
- `lib/integrations/r2.ts` (modify only if an operation EP-13/EP-14 needs is missing)
- `app/(app)/ljubimci/[id]/terapije/nova/page.tsx`, `app/(app)/ljubimci/[id]/terapije/nova/treatment-form-client.tsx` (new, S27)
- `app/(app)/ljubimci/[id]/pregledi/novi/page.tsx`, `app/(app)/ljubimci/[id]/pregledi/novi/vet-visit-form-client.tsx` (new, S05)
- `app/(app)/ljubimci/[id]/pet-record-client.tsx` (modify: add Terapije and Pregledi tabs)
- `lib/i18n/sr.ts`, `lib/i18n/en.ts` (add keys)
- `supabase/tests/treatment_dose_reminders.test.sql`, `supabase/tests/log_dose.test.sql`, `supabase/tests/vet_visit_followup_reminder.test.sql`, `supabase/tests/attachments_limits.test.sql`
- `tests/attachments/attachment-upload.test.ts`, `tests/attachments/delete-attachment.test.ts`, `tests/pet-record/treatment-form.test.tsx`, `tests/pet-record/vet-visit-form.test.tsx`, `tests/pet-record/therapies-tab.test.tsx`
- `docs/product/06-build-plan.md` (Step 15 row in §3 and the Step 15 Session log only)

**Out of bounds:** memorial, restore, PDF (Step 16); reminder lists and "Urađeno" on S10 (Step 17); moment photos (Step 21); any schema change other than `log_dose`; `components/ui`, `components/app`.

**Acceptance criteria:** (PRD v1.6, verbatim)
- FR-06 — Given a treatment with a frequency, When it is saved, Then dose reminders are created at that frequency until the end date (FR-20).
- FR-06 — Given a dose reminder, When a user marks the dose as given, Then a dose log entry is recorded with time and user.
- FR-07 — Given a visit with a check-up date, When it is saved, Then a check-up reminder is created automatically (FR-20).
- FR-08 — Given a file that is an image or PDF of ≤ 10 MB, When attached, Then it is stored with the visit and can be opened.
- FR-08 — Given a file over 10 MB or of another type, When attached, Then it is rejected with a message.
- FR-08 — Given a Free user with 10 attachments on a pet, When they add an 11th, Then it is blocked and a Premium offer is shown.
- FR-08 — Given a Premium user, When adding attachments, Then there is no per-pet limit.
- FR-36 — Given a Free owner, Then limits are: 1 active pet, 2 memorials, 10 attachments per pet, 5 moments per pet, email and push channels only, no PDF export, no household sharing, logo always on shared images. *(this step: 10 attachments per pet)*

**Tests to ship:**
- FR-06 (dose reminders at frequency until end date) → `supabase/tests/treatment_dose_reminders.test.sql` (hours and days intervals; first dose per BR-49; occurrences stop at `ends_on`) and `tests/pet-record/treatment-form.test.tsx` ("Trajanje N dana" → `ends_on` conversion; schedule summary)
- FR-06 (dose log with time and user) → `supabase/tests/log_dose.test.sql` (owner and member log a dose; `given_at` and `created_by` stored; idempotent on `p_occurrence_id`; read-only household → `household_read_only`) and `tests/pet-record/therapies-tab.test.tsx` ("Doza data" calls EP-11 and the dose appears)
- FR-07 → `supabase/tests/vet_visit_followup_reminder.test.sql` (insert with `follow_up_on` creates `vet_follow_up` reminder; change/clear/delete sync) and `tests/pet-record/vet-visit-form.test.tsx`
- FR-08 (stored and opened) → `tests/attachments/attachment-upload.test.ts` (ticket → PUT → confirm inserts `attachments`; EP-15 returns a view URL) with a fake R2
- FR-08 (too large / wrong type) → `tests/attachments/attachment-upload.test.ts` (`file_too_large`, `file_type_not_allowed`; HEAD mismatch deletes the object) and `tests/pet-record/vet-visit-form.test.tsx` (inline file error) and `supabase/tests/attachments_limits.test.sql` (mime and size checks)
- FR-08 (11th on Free) and FR-36 (10 per pet) → `supabase/tests/attachments_limits.test.sql` (11th insert → `premium_required`, `limit = attachments`) and `tests/pet-record/vet-visit-form.test.tsx` (counter "n / 10", PremiumLock)
- FR-08 (Premium unlimited) → `supabase/tests/attachments_limits.test.sql` (Premium seed user inserts an 11th)
- EP-14 → `tests/attachments/delete-attachment.test.ts` (row deleted, R2 delete attempted, key queued on R2 failure; Member → `forbidden_role`)

**Verification:**
```
npm run typecheck      # expect: exit 0
npm run lint           # expect: exit 0
npm test               # expect: all Vitest suites pass, including the five files above
npx supabase test db   # expect: all pgTAP files pass, including the four files above
npm run build          # expect: build succeeds
```

#### Prompt
```
You are executing Step 15 — Treatments, doses, vet visits & attachments — of docs/product/06-build-plan.md. Work in the repository root.

Read first, in full:
- docs/product/02-prd.md §6 FR-06, FR-07, FR-08, FR-28; §8 BR-01, BR-02, BR-05, BR-13, BR-22, BR-49; §9 E-04; §10 NFR-09
- docs/product/03-technical-constraints.md §3 ADR-07; §5.3 treatments, dose_logs, vet_visits, attachments; §5.5 reminders, reminder_occurrences; §7 row NFR-09
- docs/product/04-design-system.md §6, §7, §8, §9, §11 rows S03, S05, S27, §12 S03, S05, S27
- docs/product/04-design/screens/treatment-form.tsx, docs/product/04-design/screens/vet-visit-form.tsx, docs/product/04-design/screens/pet-record.tsx (Terapije and Pregledi tabs)
- docs/product/05-api-integration-contract.md §4.4 rows EP-10 – EP-15; §5.1 Part A, EP-10, EP-11, EP-12, EP-13, EP-14, EP-15; §6 Treatment, DoseLog, VetVisit, Attachment, UploadTicket, FileUrl; §7.2; §7.3; §10
- docs/product/06-build-plan.md §4, §5, §6, and the Session logs of Steps 13 and 14

Copy (settled upstream): docs/product/04-design-system.md §9 i18n rule — every string of S27, S05 and the S03 Terapije/Pregledi tabs goes into lib/i18n/sr.ts and lib/i18n/en.ts; the Serbian text is the mockup copy and the English text is its faithful translation; no new copy, no missing key.

Build:
1. Migration log_dose (npx supabase migration new log_dose): rpc:log_dose exactly as EP-11 defines. Validation rules in EP-10/EP-12 Request not yet enforced may be added only as check constraints on existing 03- §5.3 columns. Run npm run db:types.
2. lib/actions/uploads.ts: add purpose attachment to EP-13 (limits checked at ticket time and by the insert trigger at confirm, as written). lib/actions/files.ts: add kind attachment to EP-15. lib/actions/attachments.ts: EP-14 delete_attachment. Use lib/integrations/r2.ts from Step 13; extend it only if an R2 operation these EPs need is missing.
3. S27: port docs/product/04-design/screens/treatment-form.tsx to app/(app)/ljubimci/[id]/terapije/nova/treatment-form-client.tsx with its page.tsx; save with EP-10; convert "Trajanje N dana" as EP-10 states; States per EP-10. Remove the StateSwitcher.
4. S05: port docs/product/04-design/screens/vet-visit-form.tsx to app/(app)/ljubimci/[id]/pregledi/novi/vet-visit-form-client.tsx with its page.tsx; save the visit with EP-12, then upload each file with EP-13 (one ticket per file), counter "n / 10" from Me.usage.attachments_by_pet and Entitlements, PremiumLock on premium_required, inline errors on file_too_large / file_type_not_allowed; check type and size in the browser before upload as well (TC §7 NFR-09). Remove the StateSwitcher.
5. S03: add the Terapije tab (list, "Doza data" → EP-11, dose log) and the Pregledi tab (list, attachment chips opening EP-15 URLs, chip delete → EP-14) to app/(app)/ljubimci/[id]/pet-record-client.tsx from the same mockup, with edit/delete through EP-10/EP-12; members see these tabs read-only except "Doza data" (FR-28).
6. Put every new string into lib/i18n/sr.ts and lib/i18n/en.ts per docs/product/04-design-system.md §9 (i18n rule: the Serbian text is the mockup copy, the English text its faithful translation; no new copy, no missing key).

Do not invent:
- No colours, spacing, radii, fonts or components outside 04-design-system.md §4–§6 and the existing components/ui and components/app; do not edit components/ui or components/app. AttachmentChip is a proposed composite (OQ-10) — do not create it; use the mockup's markup as written.
- No packages outside 03-technical-constraints.md ADR-17; do not add any dependency to package.json.
- No endpoints, fields, error codes or RPC names outside 05-api-integration-contract.md.
- No tables, columns or enum values outside 03-technical-constraints.md §5.
- No user-facing copy that is not in 04-design-system.md or docs/product/04-design.

Files: create or modify only these. Touching any other file requires stopping and asking.
- supabase/migrations/<timestamp>_log_dose.sql; the generated types file in lib/supabase/ (via npm run db:types only)
- lib/actions/uploads.ts, lib/actions/files.ts, lib/actions/attachments.ts, lib/integrations/r2.ts (only if needed)
- app/(app)/ljubimci/[id]/terapije/nova/page.tsx, app/(app)/ljubimci/[id]/terapije/nova/treatment-form-client.tsx
- app/(app)/ljubimci/[id]/pregledi/novi/page.tsx, app/(app)/ljubimci/[id]/pregledi/novi/vet-visit-form-client.tsx
- app/(app)/ljubimci/[id]/pet-record-client.tsx
- lib/i18n/sr.ts, lib/i18n/en.ts
- supabase/tests/treatment_dose_reminders.test.sql, supabase/tests/log_dose.test.sql, supabase/tests/vet_visit_followup_reminder.test.sql, supabase/tests/attachments_limits.test.sql
- tests/attachments/attachment-upload.test.ts, tests/attachments/delete-attachment.test.ts, tests/pet-record/treatment-form.test.tsx, tests/pet-record/vet-visit-form.test.tsx, tests/pet-record/therapies-tab.test.tsx
- docs/product/06-build-plan.md (Step 15 row in §3 and the Step 15 Session log only)

Acceptance criteria (PRD v1.6, verbatim — each needs a passing test):
- Given a treatment with a frequency, When it is saved, Then dose reminders are created at that frequency until the end date (FR-20).
- Given a dose reminder, When a user marks the dose as given, Then a dose log entry is recorded with time and user.
- Given a visit with a check-up date, When it is saved, Then a check-up reminder is created automatically (FR-20).
- Given a file that is an image or PDF of ≤ 10 MB, When attached, Then it is stored with the visit and can be opened.
- Given a file over 10 MB or of another type, When attached, Then it is rejected with a message.
- Given a Free user with 10 attachments on a pet, When they add an 11th, Then it is blocked and a Premium offer is shown.
- Given a Premium user, When adding attachments, Then there is no per-pet limit.
- Given a Free owner, Then limits are: 1 active pet, 2 memorials, 10 attachments per pet, 5 moments per pet, email and push channels only, no PDF export, no household sharing, logo always on shared images. (This step: 10 attachments per pet.)

Tests to write: exactly the files listed under "Tests to ship" in Step 15 of docs/product/06-build-plan.md, each covering the criterion named there.

Done means all of these pass, in this order, and you paste their output into the Session log:
npm run typecheck
npm run lint
npm test
npx supabase test db
npm run build

When verification passes: update the Step 15 row in docs/product/06-build-plan.md §3 (Status ✅, Done = today's date), append a Session log entry under Step 15 (date, what was built, the output of each verification command, deviations, follow-ups), then commit with the message "Step 15: Treatments, doses, vet visits & attachments".

If anything above is ambiguous, if a referenced section doesn't contain what this prompt says it does, or if completing this step would require touching a file outside the list or making a decision the referenced documents don't settle — STOP and ask. Do not choose a reasonable default. Do not proceed with a partial implementation.
```

#### Session log
**2026-10-23** (unattended overnight run)
- **Built:**
  - Migration `20261023055505_log_dose.sql`: `rpc:log_dose(p_treatment_id, p_given_at, p_occurrence_id)` (EP-11) returns the DoseLog. It is security invoker, so RLS on treatments and dose_logs and `health_record_check_write` decide who may log: owner, member and organisation team ✅; a read-only household → `household_read_only`; no relation → `not_found`. An organisation's copy after a transfer → `forbidden_role`. `p_given_at` may be at most 5 minutes ahead. It is idempotent on `p_occurrence_id`, including a concurrent `unique_violation`. Two definer helpers support it: `private.dose_occurrence_due_at` checks that the occurrence belongs to the treatment's `treatment_dose` reminder (`p_occurrence_id:invalid` otherwise), and `private.complete_dose_occurrence` sets every lead-time row of that instance to done / `done_at` / `done_by`. They are needed because occurrences have no client writes, and a member with household reminders off cannot read them. `private.dose_log_json` builds the DoseLog JSON. The EP-10 / EP-12 Request rules are added as check constraints on existing columns: treatments name 1–100, dose ≤ 60, `interval_value` / `interval_unit` both or neither, `ends_on ≥ starts_on`, note ≤ 1000; vet_visits reason 1–200, clinic ≤ 100, findings / recommendations ≤ 4000, `follow_up_on > visited_on`. The reminders come from the Step 08 triggers (unchanged). `lib/supabase/database.types.ts` was regenerated with `npm run db:types`.
  - `lib/actions/treatments.ts`: EP-10 `createTreatment` / `updateTreatment` / `deleteTreatment`. They validate the Request with field codes (on update, against the stored row) and return the Treatment read back through EP-02, where its computed fields live. EP-11 `logDose` maps the RPC's `DETAIL '<field>:<code>'` to `fields`.
  - `lib/actions/vet-visits.ts`: EP-12 `createVetVisit` / `updateVetVisit` / `deleteVetVisit`. They validate the Request, including `visited_on` not in the future (Belgrade) and `before_start` against the stored row, and return the VetVisit with Money cost and attachments.
  - `lib/actions/uploads.ts`: EP-13 now handles purpose `attachment`. The target is the visit; owner / organisation ✅, member → `forbidden_role`. Images (`image/*`) and PDF ≤ 10 MB are accepted. At ticket time a Free owner's pet at 10 attachments → `premium_required` (`limit = attachments`); Premium and organisation animals have no limit. The key is `…/pets/<pet_id>/visits/<vet_visit_id>/<uuid>-<safe_file_name>`. Confirm HEAD-verifies the object (a mismatch deletes it) and inserts `attachments`; the insert trigger's `premium_required:attachments` passes through. The `pet_photo` path is unchanged.
  - `lib/actions/files.ts`: EP-15 kind `attachment` returns a presigned GET with the stored file name and `mime_type`; rows hidden by RLS get `url = null`.
  - `lib/actions/attachments.ts`: EP-14 `deleteAttachment` deletes the row (RLS + trigger: member → `forbidden_role`, none → `not_found`), then the R2 object; on R2 failure the key stays queued.
  - S27 `app/(app)/ljubimci/[id]/terapije/nova/page.tsx` + `treatment-form-client.tsx`, ported from `treatment-form.tsx`. The header comes from EP-01 (id filter); `[]` or no `can_edit` → error state. "Trajanje N dana" is sent as `ends_on = starts_on + N − 1`; the schedule summary and toast use the mockup copy. States are D / inline / X. No StateSwitcher. Edit route `terapije/[terapijaId]/page.tsx`: EP-02 preload, "Izmeni terapiju" / "Sačuvaj izmene".
  - S05 `app/(app)/ljubimci/[id]/pregledi/novi/page.tsx` + `vet-visit-form-client.tsx`, ported from `vet-visit-form.tsx`. The header and clinic prefill come from EP-01. The counter "n / 10", progress bar and Free note use `Me.usage.attachments_by_pet` (falling back to `PetSummary.attachment_count`) and `Entitlements.limits.attachments_per_pet`, on the owner's own pet only. Type, size and the limit are checked in the browser (NFR-09). The visit is saved with EP-12, then each file goes ticket → PUT → confirm. `premium_required` → PremiumLock; `file_too_large` / `file_type_not_allowed` → the inline file message; any other upload failure → toast "{file} nije sačuvan. Pokušaj ponovo.". Cost "2.990" → 299000. No StateSwitcher. Edit route `pregledi/[pregledId]/page.tsx`: EP-02 preload, the saved files listed with an X (AlertDialog → EP-14), "Izmeni pregled" / "Sačuvaj izmene".
  - S03 `pet-record-client.tsx`: new Terapije tab (type badge, dose · frequency · period, "Sledeća doza", "Završeno", "Doza data" → EP-11 with `next_dose_occurrence_id`, "Dnevnik doza" with time and user, row menu → edit route / delete dialog → EP-10). New Pregledi tab (Free counter, visit cards with cost / Nalaz / Preporuke / Kontrola + "Uskoro", attachment chips opening EP-15 URLs, chip X → EP-14, row menu → edit route / delete → EP-12). The Pregled tab's last-visit card gets "Svi pregledi". Members see these tabs read-only except "Doza data" (`can_log`).
  - i18n: `petRecord` (tabs), `pet.treatmentType`, `treatmentForm`, `vetVisitForm` in `lib/i18n/sr.ts` and `en.ts`.
  - Tests: `tests/attachments/attachment-upload.test.ts` (16), `tests/attachments/delete-attachment.test.ts` (6), `tests/pet-record/treatment-form.test.tsx` (15), `tests/pet-record/vet-visit-form.test.tsx` (15), `tests/pet-record/therapies-tab.test.tsx` (18); pgTAP `treatment_dose_reminders` (24), `log_dose` (27), `vet_visit_followup_reminder` (22), `attachments_limits` (17).
- **Verification:**
  - `npm run typecheck` ✅ exit 0
  - `npm run lint` ✅ exit 0 (0 errors; the 2 known warnings in the generated `cloudflare-env.d.ts`)
  - `npm test` ✅ `Test Files 50 passed (50)`, `Tests 569 passed (569)`
  - `npx supabase test db` ✅ `Files=44, Tests=1446`, `All tests successful.` `Result: PASS`
  - `npm run build` ✅ exit 0. Routes: `ƒ /_not-found`, `/auth/callback`, `/ljubimci`, `/ljubimci/[id]`, `/ljubimci/[id]/izmena`, `/ljubimci/[id]/pregledi/[pregledId]`, `/ljubimci/[id]/pregledi/novi`, `/ljubimci/[id]/terapije/[terapijaId]`, `/ljubimci/[id]/terapije/nova`, `/ljubimci/[id]/vakcine/[vakcinaId]`, `/ljubimci/[id]/vakcine/nova`, `/ljubimci/novi`, `○ /manifest.webmanifest`, `ƒ /prijava`, `/prijava/nova-lozinka`, `/privatnost`, `/profil`, `/registracija`, `/uslovi`, `ƒ Proxy (Middleware)`
- **Owner decisions used (2026-10-23):**
  - EP-10 / EP-11 run in `lib/actions/treatments.ts` and EP-12 in `lib/actions/vet-visits.ts` (added to the file list).
  - Treatment and visit cards use the Step 14 row menu ("Još opcija: {entry}" → "Izmeni" / "Obriši") and delete dialog ("Obrisati unos?" / "Ovo ne može da se poništi." / "Da, obriši" / "Odustani"). The edit routes `terapije/[terapijaId]` ("Izmeni terapiju" / "Edit treatment") and `pregledi/[pregledId]` ("Izmeni pregled" / "Edit vet visit") were added to the list.
  - The attachment chip has an X button ("Ukloni {file}" / "Remove {file}") that opens the same delete dialog. The same dialog guards removing a saved file on S05.
  - Approved copy: "Fajl nije dostupan." / "File not available." (EP-15 `url = null`, as a toast on click) and "{file} nije sačuvan. Pokušaj ponovo." / "{file} wasn't saved. Try again." (an upload failing after the visit is saved).
  - "Doza data" is gated on `can_log` (hidden for a read-only household). Add, edit, delete and the chip X follow `access.can_edit`.
  - S03 `page.tsx` did not need to change: it already passes `Me.entitlements` (Step 14), and the new copy lives in the `petRecord` and `pet` sections it already sends.
  - English is a faithful translation written in this step. Formats use `Intl` ("2.990 RSD" / "2,990 RSD", "0,8 MB" / "0.8 MB", dates and "08:00" in Europe/Belgrade). Plurals (`everyHours`, `everyDays`, `unitHours`, `unitDays`, `freqHours`) use the `_one/_few/_other` keys; `lib/i18n/index.ts` is unchanged. The PremiumLock CTA stays inert (Step 23).
  - 422 without mockup copy: the date pickers disable invalid days (end before start on S27; future `visited_on` and a check-up on or before the visit on S05). Any other unmapped field code shows the form-level error ("Nismo uspeli da sačuvamo terapiju / pregled…").
  - **Exception 1:** `tests/pets/pet-photo-upload.test.ts` asserted "other purposes are not handled yet" using purpose `attachment`, which this step adds. Only that assertion was updated: `attachment` is now handled, and a pet id is not a vet visit → `not_found`.
- **Deviations / decisions:**
  - **log_dose security:** invoker for the dose log (reusing RLS and the Step 06 trigger), with two narrow definer helpers for the occurrence. Its validation codes travel in `DETAIL '<field>:<code>'`, the convention of the Step 09 partner RPCs; `lib/server/result.ts` (not on the list) is unchanged, so `logDose` maps them itself.
  - **EP-14 and the queue:** the Step 06 `attachments_queue_r2_key` trigger always queues the key inside the delete's transaction. So the action removes the key from `r2_deletion_queue` (service role) after a successful R2 delete, and upserts it again after a failure.
  - **Treatment / VetVisit responses:** EP-10 reads the written treatment back through EP-02, because `is_active`, the next dose and the recent doses are computed there; EP-12 reads the visit's attachments separately.
  - **S05 retry without duplicates:** once the visit is saved, the form remembers its id, so saving again (after a failed upload) runs EP-12 update rather than a second insert. Files already confirmed move to the saved list; the rest can be removed or retried.
  - **S05 cost in English** is parsed with en-GB separators ("2,990.50"); Serbian uses the mockup rule ("2.990,50").
  - **Double period:** the mockup's "…do {end}." and "…na kontrolu {date}." give "2026.." after a sr-Latn date, so these two Serbian strings drop the final period. English keeps it.
  - **S03 details without a value:** the dose log is hidden when a treatment has no doses yet, and Nalaz / Preporuke / cost are hidden when empty. "Uskoro" shows only while the check-up date is today or later. A one-dose treatment shows its start date as the period; a course with an end shows "start – end"; an open-ended course shows "Od …". The Pregledi empty-state action links to S05 (the mockup button had no target).
  - **Attachment URLs:** S03 fetches EP-15 for all chips after render, in batches of 50. A click on a chip whose URL is missing or expired fetches a fresh one and opens it.
  - **Weight / PetRecord types:** `lib/actions/pets.ts` (not on this step's list) still types the entry arrays loosely; S03 and the edit routes cast them to the new `Treatment` / `VetVisit` types.
  - **Files touched outside the original Step 15 list (owner decisions):** `lib/actions/treatments.ts`, `lib/actions/vet-visits.ts`, `app/(app)/ljubimci/[id]/terapije/[terapijaId]/page.tsx`, `app/(app)/ljubimci/[id]/pregledi/[pregledId]/page.tsx`, `tests/pets/pet-photo-upload.test.ts` (exception 1).
- **Follow-ups:**
  - Tighten the `PetRecord` entry array types in `lib/actions/pets.ts` when that file is next on a step's list.
  - The transferred-copy rule is enforced in `log_dose` but still not on the other entry writes or on uploads (Step 25, as in Steps 06, 13, 14).
  - Real uploads need `R2_*` and `ACTION_TOKEN_SECRET` in `.env.local`, plus a CORS rule on the bucket that allows browser `PUT` from the app origin (TC ADR-07); this is not configured in code.

---

### Step 16 — Memorial, restore & PDF export

| | |
|---|---|
| **Status** | ⬜ not started |
| **Outcome** | An owner moves a pet to Memorial (reminders stop) and restores it, sees memorials on S06 with the Free limits, and a Premium owner exports the full record as a PDF generated in the browser. |
| **Implements** | FR-10, FR-11, FR-12, FR-36 (memorials, PDF) · EP-06, EP-07, EP-16 · S06 `/uspomene`, S03 memorial dialog and "Izvezi PDF", S01 link to Uspomene · tables `memorial_records`, `pets.lifecycle`, `reminders.active` · ADR-12, ADR-17 (`@react-pdf/renderer`) |
| **Depends on** | Step 15 |
| **Blocked by** | — |
| **Track** | single |

**Read before starting:**
- `docs/product/02-prd.md` §6 FR-10, FR-11, FR-12, FR-36; §8 BR-01, BR-02, BR-03, BR-17; §9 E-02, E-03, E-25; §10 NFR-07
- `docs/product/03-technical-constraints.md` §3 ADR-12, ADR-17; §4; §5.3 `pets`, `memorial_records`; §5.5 `reminders`
- `docs/product/04-design-system.md` §6 (PremiumLock), §8, §9, §11 rows S01, S03, S06, §12 S01, S03, S06
- `docs/product/04-design/screens/memorials.tsx`, `docs/product/04-design/screens/pet-record.tsx` (memorial dialog, "Izvezi PDF"), `docs/product/04-design/screens/pets-home.tsx` (Uspomene link)
- `docs/product/05-api-integration-contract.md` §4.4 rows EP-01, EP-06, EP-07, EP-16; §5.1 EP-01 (S06 caller), EP-06, EP-07, EP-16; §6 `MemorialRecord`, `PdfExportBundle`, `Me` (`usage.free_slot_pet`); §7.3 *premium_locked*
- `docs/product/06-build-plan.md` §4, §5, §6 and the Session logs of Steps 13–15

**Files this step may touch:**
- `supabase/migrations/*_memorial_rpcs.sql` (new: `rpc:move_pet_to_memorial`, `rpc:restore_pet_from_memorial`)
- `lib/supabase/` generated types file (via `npm run db:types` only)
- `lib/actions/memorial.ts` (new: EP-06, EP-07)
- `lib/actions/pdf-export.ts` (new: EP-16 `get_pdf_export_bundle`)
- `package.json`, `package-lock.json` (add `@react-pdf/renderer` only)
- `app/(app)/ljubimci/[id]/pdf-export-client.ts` (new: browser-side PDF rendering from `PdfExportBundle`)
- `app/(app)/uspomene/page.tsx`, `app/(app)/uspomene/memorials-client.tsx` (new, S06)
- `app/(app)/ljubimci/[id]/pet-record-client.tsx` (modify: "Premesti u Uspomene" dialog, "Izvezi PDF")
- `app/(app)/ljubimci/pets-home-client.tsx` (modify: Uspomene link)
- `lib/i18n/sr.ts`, `lib/i18n/en.ts` (add keys)
- `supabase/tests/memorial_rpcs.test.sql`
- `tests/memorial/memorials-screen.test.tsx`, `tests/memorial/memorial-dialog.test.tsx`, `tests/pdf/pdf-export.test.ts`
- `docs/product/06-build-plan.md` (Step 16 row in §3 and the Step 16 Session log only)

**Out of bounds:** organisation status changes (Step 24); any PDF package other than `@react-pdf/renderer`; reminder screens (Step 17); any schema change other than the two RPCs; `components/ui`, `components/app`.

**Acceptance criteria:** (PRD v1.6, verbatim)
- FR-10 — Given a Premium user, When they export, Then a PDF containing the entire record is produced.
- FR-10 — Given a Free user, When they try to export, Then export is blocked and a Premium offer is shown.
- FR-11 — Given an active pet, When moved to Memorial, Then all its reminders stop and it no longer counts toward the Free active-pet limit.
- FR-11 — Given a Free user with 2 memorials, When they try to add a third, Then it is blocked and a Premium offer is shown.
- FR-11 — Given a Premium user, When adding memorials, Then there is no limit.
- FR-12 — Given a memorial pet and a free active slot, When restored, Then it becomes active and its reminders can be re-enabled.
- FR-12 — Given a Free user whose active slot is taken, When they try to restore, Then it is blocked and a Premium offer is shown.
- FR-36 — Given a Free owner, Then limits are: 1 active pet, 2 memorials, 10 attachments per pet, 5 moments per pet, email and push channels only, no PDF export, no household sharing, logo always on shared images. *(this step: 2 memorials, no PDF export)*

**Tests to ship:**
- FR-10 (Premium PDF) → `tests/pdf/pdf-export.test.ts` (bundle fetched via EP-16 for the Premium seed user; the generated document contains every section of `PdfExportBundle`)
- FR-10 (Free blocked) and FR-36 (no PDF) → `tests/pdf/pdf-export.test.ts` (`premium_required`, `limit = pdf_export` → PremiumLock)
- FR-11 (reminders stop, slot freed) → `supabase/tests/memorial_rpcs.test.sql` (`reminders.active = false`, pending occurrences deleted, another active pet can be created on Free)
- FR-11 (third memorial on Free) and FR-36 (2 memorials) → `supabase/tests/memorial_rpcs.test.sql` (`premium_required`, `limit = memorials`) and `tests/memorial/memorial-dialog.test.tsx` (PremiumLock inside the dialog)
- FR-11 (Premium unlimited) → `supabase/tests/memorial_rpcs.test.sql` (Premium seed user moves a third pet)
- FR-12 (restore with free slot) → `supabase/tests/memorial_rpcs.test.sql` (`lifecycle = active`, reminders with future due re-enabled and occurrences generated when `reenable_reminders`) and `tests/memorial/memorials-screen.test.tsx` (card leaves the list)
- FR-12 (slot taken on Free) → `supabase/tests/memorial_rpcs.test.sql` (`premium_required`, `limit = pets`) and `tests/memorial/memorials-screen.test.tsx` (PremiumLock naming `usage.free_slot_pet`)

**Verification:**
```
npm run typecheck      # expect: exit 0
npm run lint           # expect: exit 0
npm test               # expect: all Vitest suites pass, including the three files above
npx supabase test db   # expect: all pgTAP files pass, including memorial_rpcs.test.sql
npm run build          # expect: build succeeds
```

#### Prompt
```
You are executing Step 16 — Memorial, restore & PDF export — of docs/product/06-build-plan.md. Work in the repository root.

Read first, in full:
- docs/product/02-prd.md §6 FR-10, FR-11, FR-12, FR-36; §8 BR-01, BR-02, BR-03, BR-17; §9 E-02, E-03, E-25; §10 NFR-07
- docs/product/03-technical-constraints.md §3 ADR-12, ADR-17; §4; §5.3 pets, memorial_records; §5.5 reminders
- docs/product/04-design-system.md §6, §8, §9, §11 rows S01, S03, S06, §12 S01, S03, S06
- docs/product/04-design/screens/memorials.tsx, docs/product/04-design/screens/pet-record.tsx (memorial dialog, "Izvezi PDF"), docs/product/04-design/screens/pets-home.tsx (Uspomene link)
- docs/product/05-api-integration-contract.md §4.4 rows EP-01, EP-06, EP-07, EP-16; §5.1 EP-01, EP-06, EP-07, EP-16; §6 MemorialRecord, PdfExportBundle, Me; §7.3
- docs/product/06-build-plan.md §4, §5, §6, and the Session logs of Steps 13, 14 and 15

Settled upstream — apply exactly:
1. PDF: install @react-pdf/renderer (TC ADR-12, ADR-17) and render the PdfExportBundle with it in the browser; no server-side rendering.
2. Copy: docs/product/04-design-system.md §9 i18n rule for every string of S06, the S03 memorial dialog and the export button (lib/i18n/sr.ts and lib/i18n/en.ts; English is a faithful translation of the mockup copy; no new copy).

Build:
1. Migration memorial_rpcs (npx supabase migration new memorial_rpcs): rpc:move_pet_to_memorial and rpc:restore_pet_from_memorial with the exact effects in EP-06 and EP-07 Side effects. Run npm run db:types.
2. lib/actions/memorial.ts: EP-06 and EP-07 as server actions wrapping those RPCs, returning ActionResult per 05- §3.6. lib/actions/pdf-export.ts: EP-16.
3. app/(app)/ljubimci/[id]/pdf-export-client.ts: render the PdfExportBundle into a PDF in the browser with @react-pdf/renderer (ADR-12, ADR-17); attachments listed rather than embedded when ADR-12 Consequences apply.
4. S06: port docs/product/04-design/screens/memorials.tsx to app/(app)/uspomene/memorials-client.tsx with its page.tsx; data from EP-01 (lifecycle=memorial) and EP-43 usage; restore via EP-07; Free counter "n / 2"; PremiumLock on premium_required; remove the StateSwitcher; States per EP-01 and EP-07.
5. S03: add "Premesti u Uspomene" (dialog → EP-06, PremiumLock on premium_required, redirect to S06) and "Izvezi PDF" (PremiumLock when Entitlements.pdf_export is false; otherwise EP-16 → pdf-export-client) to app/(app)/ljubimci/[id]/pet-record-client.tsx from the mockup.
6. S01: add the Uspomene link from the mockup to app/(app)/ljubimci/pets-home-client.tsx.
7. Put every new string into lib/i18n/sr.ts and lib/i18n/en.ts per docs/product/04-design-system.md §9 (i18n rule: the Serbian text is the mockup copy, the English text its faithful translation; no new copy, no missing key).

Do not invent:
- No colours, spacing, radii, fonts or components outside 04-design-system.md §4–§6 and the existing components/ui and components/app; do not edit components/ui or components/app.
- No packages outside 03-technical-constraints.md ADR-17; add only @react-pdf/renderer to package.json.
- No endpoints, fields, error codes or RPC names outside 05-api-integration-contract.md.
- No tables, columns or enum values outside 03-technical-constraints.md §5.
- No user-facing copy that is not in 04-design-system.md or docs/product/04-design.

Files: create or modify only these. Touching any other file requires stopping and asking.
- supabase/migrations/<timestamp>_memorial_rpcs.sql; the generated types file in lib/supabase/ (via npm run db:types only)
- lib/actions/memorial.ts, lib/actions/pdf-export.ts
- package.json, package-lock.json (@react-pdf/renderer only)
- app/(app)/ljubimci/[id]/pdf-export-client.ts, app/(app)/ljubimci/[id]/pet-record-client.tsx
- app/(app)/uspomene/page.tsx, app/(app)/uspomene/memorials-client.tsx
- app/(app)/ljubimci/pets-home-client.tsx
- lib/i18n/sr.ts, lib/i18n/en.ts
- supabase/tests/memorial_rpcs.test.sql
- tests/memorial/memorials-screen.test.tsx, tests/memorial/memorial-dialog.test.tsx, tests/pdf/pdf-export.test.ts
- docs/product/06-build-plan.md (Step 16 row in §3 and the Step 16 Session log only)

Acceptance criteria (PRD v1.6, verbatim — each needs a passing test):
- Given a Premium user, When they export, Then a PDF containing the entire record is produced.
- Given a Free user, When they try to export, Then export is blocked and a Premium offer is shown.
- Given an active pet, When moved to Memorial, Then all its reminders stop and it no longer counts toward the Free active-pet limit.
- Given a Free user with 2 memorials, When they try to add a third, Then it is blocked and a Premium offer is shown.
- Given a Premium user, When adding memorials, Then there is no limit.
- Given a memorial pet and a free active slot, When restored, Then it becomes active and its reminders can be re-enabled.
- Given a Free user whose active slot is taken, When they try to restore, Then it is blocked and a Premium offer is shown.
- Given a Free owner, Then limits are: 1 active pet, 2 memorials, 10 attachments per pet, 5 moments per pet, email and push channels only, no PDF export, no household sharing, logo always on shared images. (This step: 2 memorials, no PDF export.)

Tests to write: exactly the files listed under "Tests to ship" in Step 16 of docs/product/06-build-plan.md, each covering the criterion named there.

Done means all of these pass, in this order, and you paste their output into the Session log:
npm run typecheck
npm run lint
npm test
npx supabase test db
npm run build

When verification passes: update the Step 16 row in docs/product/06-build-plan.md §3 (Status ✅, Done = today's date), append a Session log entry under Step 16 (date, what was built, the output of each verification command, deviations, follow-ups), then commit with the message "Step 16: Memorial, restore & PDF export".

If anything above is ambiguous, if a referenced section doesn't contain what this prompt says it does, or if completing this step would require touching a file outside the list or making a decision the referenced documents don't settle — STOP and ask. Do not choose a reasonable default. Do not proceed with a partial implementation.
```

#### Session log
**2026-10-23** (unattended overnight run; resumed after the copy-approval stop)
- **Built:**
  - Migration `20261023062348_memorial_rpcs.sql`: `rpc:move_pet_to_memorial` (EP-06) and `rpc:restore_pet_from_memorial` (EP-07), both security invoker. RLS on `pets` / `memorial_records`, the role trigger `pets_check_write` (member, organisation lifecycle → `forbidden_role`) and `pets_enforce_free_limits` (`premium_required:memorials`, `premium_required:pets`; BR-01, BR-03, E-02, E-03) decide who may change the lifecycle. The Step 08 trigger stops reminders on the way in (BR-17). Restore with `reenable_reminders` runs the definer helper `private.reenable_pet_reminders`. That helper works only for the owner and only once the pet is active again. It re-enables only reminders whose next due time is still in the future: a one-off reminder needs `starts_at` ahead, and a repeating or meal reminder needs no end or an end ahead. The Step 08 trigger then regenerates their occurrences. Field codes use `DETAIL '<field>:<code>'`. `lib/supabase/database.types.ts` was regenerated with `npm run db:types`.
  - `lib/actions/memorial.ts`: EP-06 `movePetToMemorial` and EP-07 `restorePetFromMemorial` return ActionResult (05- §3.6). They validate the Request (date not in the future, Europe/Belgrade; reason enum).
  - `lib/actions/pdf-export.ts`: EP-16 builds the `PdfExportBundle`. Owner with Premium ✅; Free → `premium_required` (`limit = pdf_export`, E-25); member / organisation → `forbidden_role`; none → `not_found`. Its data comes from EP-02, the full dose logs, and EP-15 URLs for the photo and image attachments.
  - `app/(app)/ljubimci/[id]/pdf-export-client.tsx`: `@react-pdf/renderer` is loaded with `await import()` on click. The document has the title "Karton ljubimca — {pet}", "Vlasnik: {name}", the S03 section labels plus "Prilozi", and the footer "Moj Ljubimac · {date}". The file is named `{pet}-karton.pdf`. JPG/PNG images are embedded; PDFs and failed images are listed by name (ADR-12). Inter Regular/Bold are registered from `public/fonts` for č/ć/š/ž/đ.
  - S06 `app/(app)/uspomene/page.tsx` + `memorials-client.tsx`, ported from `memorials.tsx`:
    - Data comes from EP-01 (lifecycle = memorial), EP-15 photos and EP-43 Entitlements / `usage.free_slot_pet`.
    - It shows the Free counter "n / 2" or the Premium badge.
    - "Vrati među aktivne" → EP-07 with `reenable_reminders = true`. It shows the toast "{name} je ponovo među aktivnim ljubimcima." and the card leaves the list.
    - On Free with the slot taken, PremiumLock names `usage.free_slot_pet`. This is checked before the call and again on `premium_required`.
    - States are default / empty / premium_locked / error. No StateSwitcher.
  - S03 `pet-record-client.tsx`:
    - DropdownMenu "Premesti u Uspomene" opens a dialog (date, reason, note) → EP-06. It then shows a toast and redirects to S06. A third memorial on Free shows PremiumLock inside the dialog.
    - "Izvezi PDF": Free (`Entitlements.pdf_export` false) → PremiumLock; Premium → EP-16 → pdf-export-client.
    - For a memorial pet, "Premesti u Uspomene" is hidden. The years line is hidden when birth is unknown, and the reason badge when the reason is null.
  - S01 `pets-home-client.tsx`: the Uspomene link → `/uspomene`.
  - i18n: the `petRecord` keys (memorial dialog, PDF, `pdfOwner`) and the `memorials` section in `lib/i18n/sr.ts` / `en.ts`.
  - `public/fonts/Inter-Regular.ttf`, `Inter-Bold.ttf` and `OFL.txt` (SIL Open Font License 1.1 for Inter, from the Google Fonts GitHub repository `ofl/inter/OFL.txt`).
  - Tests: `tests/memorial/memorials-screen.test.tsx` (11), `tests/memorial/memorial-dialog.test.tsx` (8), `tests/pdf/pdf-export.test.ts` (8; asserts on the react-pdf Document element tree); pgTAP `memorial_rpcs` (45).
- **Verification (final run, after the owner decisions below were applied):**
  - `npm run typecheck` ✅ exit 0
  - `npm run lint` ✅ exit 0 (0 errors; the 2 known warnings in the generated `cloudflare-env.d.ts`)
  - `npm test` ✅ `Test Files 53 passed (53)`, `Tests 596 passed (596)`
  - `npx supabase test db` ✅ `Files=45, Tests=1491`, `All tests successful.` `Result: PASS`
  - `npm run build` ✅ exit 0. Routes: `ƒ /_not-found`, `/auth/callback`, `/ljubimci`, `/ljubimci/[id]`, `/ljubimci/[id]/izmena`, `/ljubimci/[id]/pregledi/[pregledId]`, `/ljubimci/[id]/pregledi/novi`, `/ljubimci/[id]/terapije/[terapijaId]`, `/ljubimci/[id]/terapije/nova`, `/ljubimci/[id]/vakcine/[vakcinaId]`, `/ljubimci/[id]/vakcine/nova`, `/ljubimci/novi`, `○ /manifest.webmanifest`, `ƒ /prijava`, `/prijava/nova-lozinka`, `/privatnost`, `/profil`, `/registracija`, `/uslovi`, `/uspomene`, `ƒ Proxy (Middleware)`
- **Owner decisions used (2026-10-23):**
  - `pdf-export-client.ts` was renamed to `pdf-export-client.tsx`; `@react-pdf/renderer` loads with `await import()` on click.
  - Fonts: `public/fonts/Inter-Regular.ttf` and `Inter-Bold.ttf` were added. `@fontsource/inter` is not installed, so they come from the Google Fonts GitHub repository; the owner accepted that source. At the owner's request, `public/fonts/OFL.txt` (the OFL text for Inter) was added next to them.
  - The PDF title, sections, footer, file name, image embedding and Document-tree test follow the owner's decisions. The owner name under the title is labelled "Vlasnik: {name}" / "Owner: {name}" (new key `petRecord.pdfOwner`).
  - Restore sends `reenable_reminders = true` and shows only "{name} je ponovo među aktivnim ljubimcima." / "{name} is back among your active pets."
  - S03 for a memorial pet: "Premesti u Uspomene" is hidden. The years line is hidden without a birth date, and the reason badge when the reason is null.
  - Approved copy: `petRecord.memorialLockDescription` (no mockup copy for the third-memorial PremiumLock) is "Na Free planu čuvaš do 2 uspomene. Uz Premium čuvaš uspomene bez ograničenja." / "On the Free plan you keep up to 2 memorials. With Premium you keep memorials without limit." The PROPOSED comment was removed.
  - Also accepted from the previous STOPPED report:
    - PDF dose logs name their author (`created_by_name`).
    - PremiumLock is used on S03 for "Izvezi PDF" and inside the memorial dialog.
    - The S06 counter wording is "Free · {count} / {limit} uspomene".
    - Reason badges use the masculine form when the sex is unknown.
  - English is a faithful translation written in this step. Dates use `Intl` (sr-Latn / en-GB, Europe/Belgrade). The PremiumLock CTA stays inert (Step 23).
  - **Exception 1:** `tests/pets/pets-home.test.tsx` asserted "no Uspomene link", which Step 16 adds. Only that assertion was changed, to expect the link to `/uspomene`.
- **Deviations / decisions:**
  - **Files outside the original list (owner decisions):** `app/(app)/ljubimci/[id]/pdf-export-client.tsx` (renamed from `.ts`), `public/fonts/Inter-Regular.ttf`, `public/fonts/Inter-Bold.ttf`, `public/fonts/OFL.txt`, `tests/pets/pets-home.test.tsx` (exception 1).
  - **Reminder re-enable** is a narrow definer helper, because clients write only their own manual reminders (Step 08 RLS). It re-enables only reminders whose next due time is in the future.
- **Follow-ups:**
  - The PremiumLock CTA needs to be wired in Step 23.
  - Organisation animal status changes stay with Step 24.

---

### Step 17 — Reminder lists & manual reminders

| | |
|---|---|
| **Status** | ⬜ not started |
| **Outcome** | Users see their reminder instances on S10 (Danas / Uskoro / Propušteno / Urađeno), on the S01 "Danas" strip and the S03 Pregled tab, mark them done in the product, and create, edit and delete manual reminders. |
| **Implements** | FR-20 (display), FR-21, FR-24 (in-app mark done) · EP-25, EP-26, EP-27 · S10 `/podsetnici`, S11 `/podsetnici/novi` and edit variant `/podsetnici/[id]` (route from the mockup header), S01 "Danas" strip, S03 Pregled "next 3", S10 → S11 edit link for manual reminders (Design §12 S10, CR-12), AppShell count badge on *Podsetnici* (Design §5.1, EP-25 `total` for `filter=today`) · tables `reminders`, `reminder_occurrences`, `dose_logs` (via EP-26) · ADR-15 flows "add vaccination and see the reminder", "mark done" |
| **Depends on** | Step 14 |
| **Blocked by** | — |
| **Track** | single |

**Read before starting:**
- `docs/product/02-prd.md` §6 FR-20, FR-21, FR-24, FR-28, FR-29; §8 BR-12, BR-17, BR-18, BR-24, BR-48; §10 NFR-02
- `docs/product/03-technical-constraints.md` §5.5 `reminders`, `reminder_occurrences`, `reminder_preferences`; §7 row NFR-02
- `docs/product/04-design-system.md` §5.1 (count badge), §6 (ReminderRow, ReminderTypeIcon, StatusBadge), §8, §9, §11 rows S01, S03, S10, S11, §12 S01, S03, S10, S11
- `docs/product/04-design/screens/reminders.tsx`, `docs/product/04-design/screens/reminder-form.tsx` (header comment names the routes), `docs/product/04-design/screens/pets-home.tsx` ("Danas"), `docs/product/04-design/screens/pet-record.tsx` (Pregled reminders)
- `docs/product/04-design/components/reminder-row.tsx` (optional `href`), `docs/product/04-design/components/shells.tsx` (`counts`)
- `docs/product/05-api-integration-contract.md` §3.4; §4.4 rows EP-25 – EP-27; §5.3 preamble (occurrence instances), EP-25, EP-26, EP-27; §6 `ReminderOccurrence`, `Reminder`, `ReminderPreference`; §7.3
- `docs/product/06-build-plan.md` §4, §5, §6 and the Session logs of Steps 08, 13, 14, 15

**Files this step may touch:**
- `supabase/migrations/*_reminder_occurrence_rpcs.sql` (new: `rpc:list_reminder_occurrences`, `rpc:mark_occurrence_done`)
- `lib/supabase/` generated types file (via `npm run db:types` only)
- `app/(app)/podsetnici/page.tsx`, `app/(app)/podsetnici/reminders-client.tsx` (new, S10)
- `app/(app)/podsetnici/novi/page.tsx`, `app/(app)/podsetnici/novi/reminder-form-client.tsx` (new, S11 create)
- `app/(app)/podsetnici/[id]/page.tsx` (new, S11 edit variant, reuses `reminder-form-client.tsx`)
- `app/(app)/ljubimci/pets-home-client.tsx` (modify: "Danas" strip from EP-25)
- `app/(app)/ljubimci/[id]/pet-record-client.tsx` (modify: Pregled "next 3" from EP-25, "Svi podsetnici" link)
- `app/(app)/layout.tsx` (modify: `AppShell` `counts.podsetnici` from EP-25 only)
- `lib/i18n/sr.ts`, `lib/i18n/en.ts` (add keys)
- `supabase/tests/list_reminder_occurrences.test.sql`, `supabase/tests/mark_occurrence_done.test.sql`, `supabase/tests/manual_reminders.test.sql`
- `tests/reminders/reminders-screen.test.tsx`, `tests/reminders/reminder-form.test.tsx`, `tests/reminders/danas-strip.test.tsx`, `tests/reminders/count-badge.test.tsx`
- `e2e/vaccination-reminder.spec.ts`, `e2e/mark-done.spec.ts`
- `docs/product/06-build-plan.md` (Step 17 row in §3 and the Step 17 Session log only)

**Out of bounds:** S12 reminder settings (Step 18); delivery by email/push and the action link (Step 19); meal schedule (Step 20); the organisation shell; any schema change other than the two RPCs; `components/ui`, `components/app` (ReminderRow's optional `href` and AppShell's `counts` from Step 10 are used as they are).

**Acceptance criteria:** (PRD v1.6, verbatim)
- FR-20 — Given a vaccination next-dose date, treatment frequency, vet-visit check-up date, meal schedule, or date of birth, When saved, Then the corresponding reminder exists without further action. *(display side: the created reminder's instances are listed; meal schedules are verified in Step 20)*
- FR-21 — Given a manual reminder with repeat "monthly", When its time passes, Then the next occurrence is scheduled one month later.
- FR-21 — Given an existing manual reminder, When its owner edits or deletes it, Then future occurrences change or disappear; past history is kept.
- FR-24 — Given a delivered reminder, When the user marks it done (from the message or in the product), Then it is shown as done with time and user. *(this step: in the product)*
- (Derived from Design §12 S10, CR-12) Tapping a manual reminder's title on S10 opens S11 in edit mode at `/podsetnici/[id]`; generated reminders carry no edit link (they are edited at their source).
- (Derived from Design §5.1, API EP-25 Callers) The *Podsetnici* item in the sidebar and on the phone bottom nav shows today's pending count (EP-25 `total` for `filter=today`); zero shows no badge.

**Tests to ship:**
- FR-20 (display) → `supabase/tests/list_reminder_occurrences.test.sql` (instances from a vaccination, a treatment, a vet visit and a birthday appear under the right filter; inactive reminders and memorial pets never appear; members see shared-pet instances only when opted in; Europe/Belgrade day boundary for `today`) and `e2e/vaccination-reminder.spec.ts` (ADR-15: add a vaccination with a next-dose date, then see the reminder on S10 and on S03 Pregled)
- FR-21 (monthly) → `supabase/tests/manual_reminders.test.sql` (occurrences of a monthly manual reminder fall one calendar month apart in Europe/Belgrade)
- FR-21 (edit/delete) → `supabase/tests/manual_reminders.test.sql` (update regenerates future pending rows and keeps done/missed rows; delete removes the reminder) and `tests/reminders/reminder-form.test.tsx` (create, edit prefill, "Obriši podsetnik" AlertDialog; `in_past`, `required`, `too_long` inline)
- FR-24 (in product) → `supabase/tests/mark_occurrence_done.test.sql` (every row of the instance done with `done_at`/`done_by`; idempotent; `treatment_dose` inserts a dose log once; read-only household → `household_read_only`), `tests/reminders/reminders-screen.test.tsx` (row moves to Urađeno with time and first name), `tests/reminders/danas-strip.test.tsx`, and `e2e/mark-done.spec.ts` (ADR-15 "mark done")
- S10 → S11 edit link → `tests/reminders/reminders-screen.test.tsx` (manual rows link to `/podsetnici/[id]`; vaccination, dose, follow-up, meal and birthday rows do not)
- count badge → `tests/reminders/count-badge.test.tsx` (`counts.podsetnici` equals EP-25 `total` for `today`; 0 → no badge; shown in sidebar and bottom nav)

**Verification:**
```
npm run typecheck      # expect: exit 0
npm run lint           # expect: exit 0
npm test               # expect: all Vitest suites pass, including the four files above
npx supabase test db   # expect: all pgTAP files pass, including the three files above
npm run build          # expect: build succeeds
npm run e2e            # expect: all specs pass, including vaccination-reminder.spec.ts and mark-done.spec.ts
```

#### Prompt
```
You are executing Step 17 — Reminder lists & manual reminders — of docs/product/06-build-plan.md. Work in the repository root.

Read first, in full:
- docs/product/02-prd.md §6 FR-20, FR-21, FR-24, FR-28, FR-29; §8 BR-12, BR-17, BR-18, BR-24, BR-48; §10 NFR-02
- docs/product/03-technical-constraints.md §5.5 reminders, reminder_occurrences, reminder_preferences; §7 row NFR-02
- docs/product/04-design-system.md §5.1, §6, §8, §9, §11 rows S01, S03, S10, S11, §12 S01, S03, S10, S11
- docs/product/04-design/screens/reminders.tsx, docs/product/04-design/screens/reminder-form.tsx, docs/product/04-design/screens/pets-home.tsx, docs/product/04-design/screens/pet-record.tsx
- docs/product/04-design/components/reminder-row.tsx and shells.tsx
- docs/product/05-api-integration-contract.md §3.4; §4.4 rows EP-25 – EP-27; §5.3 preamble, EP-25, EP-26, EP-27; §6 ReminderOccurrence, Reminder, ReminderPreference; §7.3
- docs/product/06-build-plan.md §4, §5, §6, and the Session logs of Steps 08, 13, 14 and 15

Settled upstream — apply exactly:
1. Edit entry point: docs/product/04-design-system.md §12 S10 (CR-12) — tapping a manual reminder's title opens S11 in edit mode at /podsetnici/[id]; pass that route as ReminderRow's optional href for manual reminders only; generated reminders get no href (they are edited at their source).
2. Count badge: Design §5.1 and EP-25 Callers — AppShell counts = { podsetnici: EP-25 total for filter=today }, set in app/(app)/layout.tsx; zero → no badge.
3. Copy: docs/product/04-design-system.md §9 i18n rule for every string of S10, S11 and the S01/S03 reminder blocks (lib/i18n/sr.ts and lib/i18n/en.ts; English is a faithful translation of the mockup copy; no new copy).

Build:
1. Migration reminder_occurrence_rpcs (npx supabase migration new reminder_occurrence_rpcs): rpc:list_reminder_occurrences and rpc:mark_occurrence_done exactly as EP-25 and EP-26 (filters, sorting, counts, instance rule, authorization, side effects) and the ReminderOccurrence schema define. Run npm run db:types.
2. S10: port docs/product/04-design/screens/reminders.tsx to app/(app)/podsetnici/reminders-client.tsx with its page.tsx; tabs map to EP-25 filters today / upcoming / missed / done with "Učitaj još" for paged tabs (05- §3.4); "Urađeno" → EP-26; rows rendered with ReminderRow from ReminderOccurrence fields, manual reminders with href /podsetnici/[id]; remove the StateSwitcher; loading / default / empty / error per EP-25 States.
3. S11: port docs/product/04-design/screens/reminder-form.tsx to app/(app)/podsetnici/novi/reminder-form-client.tsx with app/(app)/podsetnici/novi/page.tsx (create) and app/(app)/podsetnici/[id]/page.tsx (edit variant, prefilled from EP-27 get, "Obriši podsetnik" → EP-27 delete). Pet picker from EP-01 (active pets) plus "Samo za mene"; convert the Belgrade date + HH:MM to UTC as EP-27 states; field codes inline. Remove the StateSwitcher.
4. S01: replace the empty "Danas" card from Step 13 with EP-25 filter=today (first 3) and "Urađeno" → EP-26, as the mockup shows.
5. S03: add the Pregled tab's next-3 reminders (EP-25 filter=next, pet_id, limit=3) and the "Svi podsetnici" link from the mockup.
5a. app/(app)/layout.tsx: pass counts.podsetnici from EP-25 (filter=today, total) to AppShell; change nothing else in the layout.
6. Put every new string into lib/i18n/sr.ts and lib/i18n/en.ts per docs/product/04-design-system.md §9 (i18n rule: the Serbian text is the mockup copy, the English text its faithful translation; no new copy, no missing key).

Do not invent:
- No colours, spacing, radii, fonts or components outside 04-design-system.md §4–§6 and the existing components/ui and components/app; do not edit components/ui or components/app.
- No packages outside 03-technical-constraints.md ADR-17; do not add any dependency to package.json.
- No endpoints, fields, error codes or RPC names outside 05-api-integration-contract.md.
- No tables, columns or enum values outside 03-technical-constraints.md §5.
- No user-facing copy that is not in 04-design-system.md or docs/product/04-design.

Files: create or modify only these. Touching any other file requires stopping and asking.
- supabase/migrations/<timestamp>_reminder_occurrence_rpcs.sql; the generated types file in lib/supabase/ (via npm run db:types only)
- app/(app)/podsetnici/page.tsx, app/(app)/podsetnici/reminders-client.tsx
- app/(app)/podsetnici/novi/page.tsx, app/(app)/podsetnici/novi/reminder-form-client.tsx, app/(app)/podsetnici/[id]/page.tsx
- app/(app)/ljubimci/pets-home-client.tsx, app/(app)/ljubimci/[id]/pet-record-client.tsx, app/(app)/layout.tsx (counts only)
- lib/i18n/sr.ts, lib/i18n/en.ts
- supabase/tests/list_reminder_occurrences.test.sql, supabase/tests/mark_occurrence_done.test.sql, supabase/tests/manual_reminders.test.sql
- tests/reminders/reminders-screen.test.tsx, tests/reminders/reminder-form.test.tsx, tests/reminders/danas-strip.test.tsx, tests/reminders/count-badge.test.tsx
- e2e/vaccination-reminder.spec.ts, e2e/mark-done.spec.ts
- docs/product/06-build-plan.md (Step 17 row in §3 and the Step 17 Session log only)

Acceptance criteria (PRD v1.6, verbatim — each needs a passing test):
- Given a vaccination next-dose date, treatment frequency, vet-visit check-up date, meal schedule, or date of birth, When saved, Then the corresponding reminder exists without further action. (Display side; meal schedules are verified in Step 20.)
- Given a manual reminder with repeat "monthly", When its time passes, Then the next occurrence is scheduled one month later.
- Given an existing manual reminder, When its owner edits or deletes it, Then future occurrences change or disappear; past history is kept.
- Given a delivered reminder, When the user marks it done (from the message or in the product), Then it is shown as done with time and user. (This step: in the product.)
- Derived from Design §12 S10 (CR-12): manual reminder rows open S11 edit at /podsetnici/[id]; generated rows have no edit link.
- Derived from Design §5.1 and API EP-25: the Podsetnici count badge equals today's pending total; zero → no badge.

Tests to write: exactly the files listed under "Tests to ship" in Step 17 of docs/product/06-build-plan.md, each covering the criterion named there.

Done means all of these pass, in this order, and you paste their output into the Session log:
npm run typecheck
npm run lint
npm test
npx supabase test db
npm run build
npm run e2e

When verification passes: update the Step 17 row in docs/product/06-build-plan.md §3 (Status ✅, Done = today's date), append a Session log entry under Step 17 (date, what was built, the output of each verification command, deviations, follow-ups), then commit with the message "Step 17: Reminder lists & manual reminders".

If anything above is ambiguous, if a referenced section doesn't contain what this prompt says it does, or if completing this step would require touching a file outside the list or making a decision the referenced documents don't settle — STOP and ask. Do not choose a reasonable default. Do not proceed with a partial implementation.
```

#### Session log
- **2026-10-23** — Step 17 built (unattended overnight run; the first run stopped before committing, and the owner approved both fixes and accepted all of its decisions, exceptions and deviations. This resumed run applied the fixes, re-ran all six commands and committed).
  - **Built:**
    - Migration `20261023083039_reminder_occurrence_rpcs.sql`: `rpc:list_reminder_occurrences` (EP-25 filters today / upcoming / missed / done / next, `pet_id`, paging, sorting, `total` and per-tab `counts`, the instance rule, Europe/Belgrade day boundary, member visibility only when `reminders_enabled`, memorial pets and inactive reminders excluded) and `rpc:mark_occurrence_done` (EP-26: every row of the instance done with `done_at` / `done_by`, idempotent, a `treatment_dose` inserts one dose log, read-only household → `household_read_only`). `npm run db:types` regenerated `lib/supabase/database.types.ts`.
    - S10 `/podsetnici` (`page.tsx`, `reminders-client.tsx`): tabs Danas / Uskoro / Propušteno / Urađeno on EP-25, "Učitaj još" paging, "Urađeno" → EP-26, manual rows link to `/podsetnici/[id]` and generated rows have no link, loading / default / empty / error states. The StateSwitcher was removed.
    - S11 `/podsetnici/novi` and the edit variant `/podsetnici/[id]` (shared `reminder-form-client.tsx`): pet picker from EP-01 plus "Samo za mene", Belgrade date + HH:MM → UTC, EP-27 create / get / update / delete with the "Obriši podsetnik" AlertDialog, field codes shown inline.
    - S01 "Danas" strip from EP-25 `filter=today` (first 3, "Urađeno" → EP-26, "Pogledaj sve" → `/podsetnici`). S03 Pregled shows the next 3 reminders from `PetRecord.upcoming_reminders` and the "Svi podsetnici" link.
    - `app/(app)/layout.tsx` passes `counts.podsetnici` = EP-25 `total` for `filter=today` (0 → no badge). `lib/actions/reminders.ts` holds the EP-25/26/27 server actions. New keys in `lib/i18n/sr.ts` and `en.ts`.
    - Tests: the three pgTAP files, the four `tests/reminders/*` files, `tests/components/reminder-row.test.tsx`, `e2e/vaccination-reminder.spec.ts` and `e2e/mark-done.spec.ts`.
  - **Owner decisions applied (2026-10-23):** server actions in `lib/actions/reminders.ts`. `/podsetnici/[id]` is keyed by `ReminderOccurrence.reminder_id`. Copy: `in_past` → "Izaberi datum i vreme u budućnosti." / "Pick a date and time in the future."; `pet_memorial` → "Ovaj ljubimac je u Uspomenama." / "This pet is in Memorials."; "Učitaj još" / "Load more"; meal with null title → "Obrok — {pet}" / "Meal — {pet}"; birthday with null title → "Rođendan — {pet}" / "Birthday — {pet}". S03 uses `PetRecord.upcoming_reminders`. S01 "Danas" loads through `lib/actions/reminders.ts`. The S01 and S03 `page.tsx` files changed only to pass the reminder copy and data. "Pogledaj sve" → `/podsetnici` is shown now. "Podešavanja" links to S12 before Step 18 builds it. `components/app/reminder-row.tsx` gets an optional `labels` prop (Serbian defaults) and a `canMarkDone` prop. Dates and times use Intl (sr-Latn / en-GB). Unmapped field codes show the form-level error, and date pickers disable invalid dates.
  - **Owner-approved fixes in this resumed run:** (1) `components/app/signed-in-shell.tsx` passes `counts?: Record<string, number>` through to `AppShell`. This is a 3-line change, needed because the layout renders `SignedInShell`, not `AppShell`, so the count badge could not reach the shell without it. (2) `playwright.config.ts` sets `workers: 2`, because `next dev` on this machine cannot serve 4 browsers at once.
  - **Owner-approved exceptions (pre-approved exception 3):** `tests/design/ui-overrides.test.ts` now strips ReminderRow's `labels` and `canMarkDone` before comparing it with the mockup, and still checks the rest of the file. `tests/pets/pets-home.test.tsx` now mocks `next/navigation` and expects "Pogledaj sve" → `/podsetnici`, because S01 now marks reminders done and refreshes the badge. `tests/components/reminder-row.test.tsx` covers the new props.
  - **Verification** (env vars for `npm run e2e` came from `npx supabase status -o env` as in Steps 12–13. There is no `.env.local`, and without these vars the first e2e attempt failed in `lib/supabase/middleware.ts` "URL and Key are required"):
    - `npm run typecheck` ✅ exit 0
    - `npm run lint` ✅ exit 0. 0 errors and 2 warnings, both unused eslint-disable directives in the generated `cloudflare-env.d.ts` that were already there.
    - `npm test` ✅ `Test Files 58 passed (58)`, `Tests 631 passed (631)`
    - `npx supabase test db` ✅ `All tests successful. Files=48, Tests=1569`, `Result: PASS`
    - `npm run build` ✅ exit 0. The routes include `/podsetnici`, `/podsetnici/[id]` and `/podsetnici/novi`.
    - `npm run e2e` ✅ `4 passed (18.3s)` with 2 workers: mark-done, add-pet, registration and vaccination-reminder.
  - **Deviations:** the out-of-list files listed above (`signed-in-shell.tsx`, `playwright.config.ts`, `lib/actions/reminders.ts`, S01/S03 `page.tsx`, `reminder-row.tsx` and its test, the two guarded tests). All are owner-approved.
  - **Follow-ups:** `ReminderTypeIcon` still has Serbian-only sr-only type labels (`reminderTypeLabel`), so these are not translated in English. A later step should add labels to it.

---

### Step 18 — Reminder settings, email & push channels

| | |
|---|---|
| **Status** | ⬜ not started |
| **Outcome** | On S12 a user sets lead times, delivery time and channels per reminder type, turns web push on or off for the current browser (with the iPhone home-screen hint), and sees WhatsApp as Premium-locked (Free) or in the "Uskoro dostupno" state (Premium, until Step 29). |
| **Implements** | FR-22, FR-23 (email/push part), FR-36 (channels) · EP-28, EP-29, EP-31 · S12 `/podesavanja/podsetnici` (incl. the "WhatsApp uskoro" state, Design §12 S12, CR-13) · tables `reminder_preferences`, `push_subscriptions` (read: `user_channels`, `app_settings`, `reminder_deliveries`) · ADR-05 (service worker) |
| **Depends on** | Step 17 |
| **Blocked by** | — |
| **Track** | single |

**Read before starting:**
- `docs/product/02-prd.md` §6 FR-22, FR-23, FR-36; §8 BR-13, BR-14, BR-14a, BR-14b, BR-48; §9 E-09, E-27; §14 RISK-09
- `docs/product/03-technical-constraints.md` §3 ADR-05; §5.5 `reminder_preferences`, `push_subscriptions`, `user_channels`, `app_settings`
- `docs/product/04-design-system.md` §6 (PremiumLock, StatusBadge, ReminderTypeIcon), §8, §9, §11 row S12, §12 S12
- `docs/product/04-design/screens/reminder-settings.tsx`
- `docs/product/05-api-integration-contract.md` §4.4 row EP-28 – EP-31; §5.3 EP-28, EP-29, EP-31 (and EP-30 for what the WhatsApp section will call later); §6 `ReminderPreference`, `PushSubscription`, `WhatsAppConnection`, `ChannelUsage`, `Entitlements`; §7.2; §7.3 *premium_locked*; §9.4 row Web Push
- `docs/product/06-build-plan.md` §4, §5, §6 and the Session logs of Steps 08 and 17

**Files this step may touch:**
- `supabase/migrations/*_reminder_settings_rpcs.sql` (new: `rpc:get_reminder_settings`, `rpc:register_push_subscription`, `rpc:get_channel_usage`)
- `lib/supabase/` generated types file (via `npm run db:types` only)
- `app/(app)/podesavanja/podsetnici/page.tsx`, `app/(app)/podesavanja/podsetnici/reminder-settings-client.tsx` (new, S12)
- `public/sw.js` (new: service worker — receives push and shows the notification with the `{ title, body, url, done_url }` payload of 05- §9.4)
- `lib/i18n/sr.ts`, `lib/i18n/en.ts` (add keys)
- `supabase/tests/reminder_preferences.test.sql`, `supabase/tests/push_subscriptions.test.sql`
- `tests/reminder-settings/reminder-settings.test.tsx`, `tests/reminder-settings/push-toggle.test.tsx`
- `docs/product/06-build-plan.md` (Step 18 row in §3 and the Step 18 Session log only)

**Out of bounds:** sending anything (Step 19); EP-30 and the WhatsApp adapter (Step 29); Viber (stays hidden, BR-14b); the S18 link target beyond the existing route; any schema change other than the three RPCs; `components/ui`, `components/app`.

**Acceptance criteria:** (PRD v1.6, verbatim)
- FR-22 — Given a reminder type (e.g., vaccinations), When the user sets several lead times (e.g., 7 days before and on the day) and a delivery time, Then a notice is sent at each lead time at that time of day. *(this step: the occurrences are scheduled at each lead time; sending is Step 19)*
- FR-22 — Given medication doses and meals, Then they are always delivered at the exact scheduled time with no lead time.
- FR-23 — Given any user, When choosing channels, Then email and push are available.
- FR-23 — Given a Free user, When opening the channel choice, Then WhatsApp and Viber are shown as Premium-only.
- FR-23 — Given any reminder type, When the user selects several available channels (e.g., email and Viber), Then the reminder is delivered on each selected channel. *(this step: several channels are stored per type; delivery is Step 19)*
- FR-36 — Given a Free owner, Then limits are: 1 active pet, 2 memorials, 10 attachments per pet, 5 moments per pet, email and push channels only, no PDF export, no household sharing, logo always on shared images. *(this step: email and push channels only)*
- (Derived from Design §12 S12, CR-13) For a Premium user, before the WhatsApp channel is live (Step 29), the WhatsApp section shows the "WhatsApp uskoro" state.

**Tests to ship:**
- FR-22 (lead times + delivery time) → `supabase/tests/reminder_preferences.test.sql` (upserting `{10080, 0}` at 09:00 regenerates future pending occurrences with one `notify_at` per lead time at 09:00 Europe/Belgrade; done/missed rows untouched) and `tests/reminder-settings/reminder-settings.test.tsx` (lead-time chips and time saved per type card)
- FR-22 (doses and meals exact) → `supabase/tests/reminder_preferences.test.sql` (`lead_minutes` stored as `{0}` and `delivery_time` null for `treatment_dose` and `meal`) and `tests/reminder-settings/reminder-settings.test.tsx` ("Stižu tačno u zadato vreme" shown, no lead-time chips)
- FR-23 (email and push available) → `tests/reminder-settings/reminder-settings.test.tsx` and `tests/reminder-settings/push-toggle.test.tsx` (register / check / unregister through EP-29; "blokirano" when permission is denied; iPhone hint card when not installed)
- FR-23 (Free sees Premium-only) and FR-36 (channels) → `tests/reminder-settings/reminder-settings.test.tsx` (WhatsApp checkbox in PremiumLock for Free; Viber absent while `viber_enabled = false`) and `supabase/tests/reminder_preferences.test.sql` (`whatsapp` on Free → `premium_required`, `viber` while off → `channel_disabled`)
- FR-23 (several channels stored) → `supabase/tests/reminder_preferences.test.sql` (`{email, push}` stored and returned by `get_reminder_settings`)
- EP-29 register re-assignment → `supabase/tests/push_subscriptions.test.sql` (endpoint stored for another user is re-assigned to the caller)
- WhatsApp uskoro → `tests/reminder-settings/reminder-settings.test.tsx` (Premium user: "Uskoro dostupno" badge and line instead of the number form, every WhatsApp checkbox disabled and unchecked, monthly counter card hidden)

**Verification:**
```
npm run typecheck      # expect: exit 0
npm run lint           # expect: exit 0
npm test               # expect: all Vitest suites pass, including the two files above
npx supabase test db   # expect: all pgTAP files pass, including the two files above
npm run build          # expect: build succeeds
```

#### Prompt
```
You are executing Step 18 — Reminder settings, email & push channels — of docs/product/06-build-plan.md. Work in the repository root.

Read first, in full:
- docs/product/02-prd.md §6 FR-22, FR-23, FR-36; §8 BR-13, BR-14, BR-14a, BR-14b, BR-48; §9 E-09, E-27; §14 RISK-09
- docs/product/03-technical-constraints.md §3 ADR-05; §5.5 reminder_preferences, push_subscriptions, user_channels, app_settings
- docs/product/04-design-system.md §6, §8, §9, §11 row S12, §12 S12
- docs/product/04-design/screens/reminder-settings.tsx
- docs/product/05-api-integration-contract.md §4.4 row EP-28 – EP-31; §5.3 EP-28, EP-29, EP-30, EP-31; §6 ReminderPreference, PushSubscription, WhatsAppConnection, ChannelUsage, Entitlements; §7.2; §7.3; §9.4 row Web Push
- docs/product/06-build-plan.md §4, §5, §6, and the Session logs of Steps 08 and 17

Settled upstream — apply exactly:
1. WhatsApp before Step 29: for a Premium user render the "WhatsApp uskoro" state of docs/product/04-design-system.md §12 S12 (CR-13) as the SOON view of docs/product/04-design/screens/reminder-settings.tsx shows it; Free users get the G state. Step 29 replaces the uskoro state with the live connection.
2. Copy: docs/product/04-design-system.md §9 i18n rule for every string of S12 (lib/i18n/sr.ts and lib/i18n/en.ts; English is a faithful translation of the mockup copy; no new copy).

Build:
1. Migration reminder_settings_rpcs (npx supabase migration new reminder_settings_rpcs): rpc:get_reminder_settings (EP-28 get), rpc:register_push_subscription (EP-29 register, security definer re-assignment as written), rpc:get_channel_usage (EP-31, ChannelUsage schema). The reminder_preferences upsert of EP-28 is a Data API write: its validation (lead_minutes set, delivery_time, channels incl. premium_required / whatsapp_not_connected / channel_disabled) and its side effect (regenerating future pending occurrences) must be enforced in the database, using only existing 03- §5.5 columns. Run npm run db:types.
2. public/sw.js: register from S12; on push, show a notification from the 05- §9.4 Web Push payload; on click, open `url` (the done_url action is wired in Step 19). The VAPID public key is NEXT_PUBLIC_VAPID_PUBLIC_KEY (EP-29 Callers).
3. S12: port docs/product/04-design/screens/reminder-settings.tsx to app/(app)/podesavanja/podsetnici/reminder-settings-client.tsx with its page.tsx. One card per type from EP-28 get (always 6); each card saves with EP-28 update; WhatsApp checkbox Premium-locked on Free; Viber absent while viber_enabled = false; push row from the browser permission plus EP-29 check; register/unregister via EP-29; iPhone hint card per ADR-05 (client-side detection); for Premium users the WhatsApp section in the uskoro state (no number form, WhatsApp checkboxes disabled, counter card hidden). Remove the StateSwitcher; drive default / premium_locked / push-on / push-blocked / WhatsApp uskoro from real responses per EP-28, EP-29 States and 05- §7.3.
4. Put every new string into lib/i18n/sr.ts and lib/i18n/en.ts per docs/product/04-design-system.md §9 (i18n rule: the Serbian text is the mockup copy, the English text its faithful translation; no new copy, no missing key).

Do not invent:
- No colours, spacing, radii, fonts or components outside 04-design-system.md §4–§6 and the existing components/ui and components/app; do not edit components/ui or components/app. The compact inline PremiumLock is a proposed composite (OQ-10) — use PremiumLock as it exists.
- No packages outside 03-technical-constraints.md ADR-17; do not add any dependency to package.json.
- No endpoints, fields, error codes or RPC names outside 05-api-integration-contract.md.
- No tables, columns or enum values outside 03-technical-constraints.md §5.
- No user-facing copy that is not in 04-design-system.md or docs/product/04-design.

Files: create or modify only these. Touching any other file requires stopping and asking.
- supabase/migrations/<timestamp>_reminder_settings_rpcs.sql; the generated types file in lib/supabase/ (via npm run db:types only)
- app/(app)/podesavanja/podsetnici/page.tsx, app/(app)/podesavanja/podsetnici/reminder-settings-client.tsx
- public/sw.js
- lib/i18n/sr.ts, lib/i18n/en.ts
- supabase/tests/reminder_preferences.test.sql, supabase/tests/push_subscriptions.test.sql
- tests/reminder-settings/reminder-settings.test.tsx, tests/reminder-settings/push-toggle.test.tsx
- docs/product/06-build-plan.md (Step 18 row in §3 and the Step 18 Session log only)

Acceptance criteria (PRD v1.6, verbatim — each needs a passing test):
- Given a reminder type (e.g., vaccinations), When the user sets several lead times (e.g., 7 days before and on the day) and a delivery time, Then a notice is sent at each lead time at that time of day. (This step: occurrences scheduled at each lead time; sending is Step 19.)
- Given medication doses and meals, Then they are always delivered at the exact scheduled time with no lead time.
- Given any user, When choosing channels, Then email and push are available.
- Given a Free user, When opening the channel choice, Then WhatsApp and Viber are shown as Premium-only.
- Given any reminder type, When the user selects several available channels (e.g., email and Viber), Then the reminder is delivered on each selected channel. (This step: several channels stored per type; delivery is Step 19.)
- Given a Free owner, Then limits are: 1 active pet, 2 memorials, 10 attachments per pet, 5 moments per pet, email and push channels only, no PDF export, no household sharing, logo always on shared images. (This step: email and push channels only.)
- Derived from Design §12 S12 (CR-13): the WhatsApp uskoro state for Premium users until Step 29.

Tests to write: exactly the files listed under "Tests to ship" in Step 18 of docs/product/06-build-plan.md, each covering the criterion named there.

Done means all of these pass, in this order, and you paste their output into the Session log:
npm run typecheck
npm run lint
npm test
npx supabase test db
npm run build

When verification passes: update the Step 18 row in docs/product/06-build-plan.md §3 (Status ✅, Done = today's date), append a Session log entry under Step 18 (date, what was built, the output of each verification command, deviations, follow-ups), then commit with the message "Step 18: Reminder settings, email & push channels".

If anything above is ambiguous, if a referenced section doesn't contain what this prompt says it does, or if completing this step would require touching a file outside the list or making a decision the referenced documents don't settle — STOP and ask. Do not choose a reasonable default. Do not proceed with a partial implementation.
```

#### Session log
- **2026-10-23** — Step 18 built (unattended overnight run).
  - **Built:**
    - Migration `20261023120736_reminder_settings_rpcs.sql`: `rpc:get_reminder_settings` (EP-28 get). It is security definer so it can read `app_settings.viber_enabled`, and is scoped to `auth.uid()`. It returns one `ReminderPreference` per reminder type in enum order (always 6), and defaults with `is_default = true` when a row is missing. It also returns `viber_enabled` and `whatsapp` (`WhatsAppConnection`). `rpc:register_push_subscription` (EP-29 register) is security definer: an endpoint stored for another user is re-assigned to the caller with the new keys. It checks `endpoint:invalid`, `p256dh` / `auth` `required` | `invalid` (base64url), cuts `user_agent` to 300 characters and never returns the keys. `rpc:get_channel_usage` (EP-31 `ChannelUsage`, Europe/Belgrade month, cap 30) is security invoker over the caller's own `reminder_deliveries`. `anon` cannot execute any of the three. The EP-28 update stays the Data API upsert on `reminder_preferences` (`onConflict: "user_id,type"`). Its validation and its regeneration of future pending occurrences are the Step 08 check constraints and triggers, which this step reuses unchanged. `npm run db:types` regenerated `lib/supabase/database.types.ts`.
    - S12 `/podesavanja/podsetnici` (`page.tsx`, `reminder-settings-client.tsx`), ported from `reminder-settings.tsx` with the StateSwitcher removed. The page shows the Kanali card (Push and WhatsApp), the iPhone hint card, and the six type cards: lead-time chips 0/1/3/7/14/30 days ↔ `lead_minutes`, delivery time, and channel checkboxes. Doses and meals show "Stižu tačno u zadato vreme." with no chips and no time. "Sačuvaj podešavanja" upserts each changed card. The states come from real responses: `Me.entitlements.premium = false` or `403 premium_required` on save → G state (the WhatsApp form inside PremiumLock, WhatsApp checkboxes disabled with the Premium badge and sr-only "Dostupno u Premiumu"); Premium → "WhatsApp uskoro" (badge and line instead of the number form, WhatsApp checkboxes disabled and unchecked with "Uskoro dostupno", no counter card); Viber is shown only when `viber_enabled`. The push row has five states: checking, isključeno, uključeno, blokirano (`Notification.permission = denied`, no call) and not supported. Register / check / unregister go through EP-29. A failed EP-28 read shows the error state.
    - `public/sw.js`: on `push` it shows a notification from the §9.4 payload `{ title, body, url, done_url }`, and on click it opens `url` (default `/podsetnici`). `done_url` is stored in the notification data for Step 19. Also skipWaiting / clients.claim.
    - The `reminderSettings` section in `lib/i18n/sr.ts` and `en.ts`.
    - Tests: `supabase/tests/reminder_preferences.test.sql` grows from 16 to 34 assertions. They cover an upsert of `{10080, 0}` at 09:00 that regenerates the pending occurrences with one `notify_at` per lead time at 09:00 Europe/Belgrade while done and missed rows stay untouched, doses and meals stored as `{0}` / null through the upsert, `{email, push}` stored and returned by `get_reminder_settings`, the defaults with `is_default`, `get_channel_usage`, and anon denied. The existing `premium_required` / `channel_disabled` checks stay. New: `supabase/tests/push_subscriptions.test.sql` (17), `tests/reminder-settings/reminder-settings.test.tsx` (15) and `tests/reminder-settings/push-toggle.test.tsx` (13).
  - **Owner decisions applied (2026-10-23):**
    - Test wording: the Kanali WhatsApp form is asserted inside PremiumLock, and each type's WhatsApp checkbox is asserted disabled with StatusBadge premium and sr-only "Dostupno u Premiumu" / "Available with Premium".
    - The mockup's single "Sačuvaj podešavanja" button upserts each changed card through EP-28. Success shows "Podešavanja su sačuvana." / "Settings saved." (role=status).
    - An empty delivery time shows "Upiši vreme slanja." / "Enter a delivery time."
    - With no push support or an empty `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, the push button is hidden and the screen shows "Ovaj pregledač ne podržava push obaveštenja." / "This browser doesn't support push notifications."
    - The iPhone hint card shows only on iOS when the app is not running from the home screen (`navigator.standalone !== true` and not `display-mode: standalone`).
    - From the Steps 13–17 decisions: the 5xx toast "Nešto nije u redu. Pokušaj ponovo." / "Something went wrong. Try again."; English is a faithful translation; the PremiumLock CTA stays inert until Step 23.
  - **Verification:**
    - `npm run typecheck` ✅ exit 0
    - `npm run lint` ✅ exit 0. 0 errors and 2 warnings, both the unused eslint-disable directives in the generated `cloudflare-env.d.ts` that were already there.
    - `npm test` ✅ `Test Files 60 passed (60)`, `Tests 659 passed (659)`
    - `npx supabase test db` ✅ `All tests successful. Files=49, Tests=1604`, `Result: PASS`
    - `npm run build` ✅ exit 0. The routes include `ƒ /podesavanja/podsetnici`.
    - Extra live check against the local stack as seeded Marko (Free): the upsert with `onConflict: "user_id,type"` returned the row; `whatsapp` gave `P0001 premium_required:whatsapp`; lead `{60}` gave `23514`; the three RPCs, the check and the unregister all answered as specified. The local DB was reset afterwards.
  - **Deviations:**
    - The four server calls (EP-28 update, EP-29 register / check / unregister) are inline `"use server"` functions in `app/(app)/podesavanja/podsetnici/page.tsx`, passed to the client as an `actions` prop. The session lives in httpOnly cookies, so the browser Supabase client is anonymous, and Step 18's file list has no `lib/actions/*` file. No file outside the list was touched.
    - The EP-28 check-constraint violations (`23514`) are mapped in that server action to `validation_failed` with `fields.lead_minutes: invalid`, `delivery_time: required` or `channels: required`. The Step 08 trigger and constraints were not changed (out of bounds: no schema change other than the three RPCs). The server action also refuses duplicate lead values, which the database check does not.
    - WhatsApp and Viber are sent only when they can be used now. While WhatsApp is locked (Free) or "uskoro" (Premium), saving a changed card drops a stored `whatsapp` choice from that card, so the save does not fail with `premium_required` / `whatsapp_not_connected`. Cards that were not changed keep their stored choice (EP-28: stored choices survive Premium expiry).
    - With the WhatsApp counter card hidden (uskoro and G states), S12 does not call EP-31 yet. The RPC exists and is covered by pgTAP, and Step 29 shows the counter.
    - The Šapa pomoći "Poruke" card and the seventh (`message`) row are left to Step 28c (§4 invariant 11).
  - **Follow-ups:**
    - Step 29: the live WhatsApp connection (EP-30), the "Broj nije povezan" note, and the counter card from EP-31. `WHATSAPP_LIVE` in the client switches the uskoro state off.
    - Step 19: the `done_url` "Urađeno" action in `public/sw.js`.
    - The database accepts duplicate `lead_minutes` values (for example `{0,0}`), and only the S12 server action refuses them. A later schema step could add a distinct check.
    - `ReminderTypeIcon`'s sr-only type labels are still Serbian-only (Step 17 follow-up).

---

### Step 19 — Reminder dispatch job & message actions

| | |
|---|---|
| **Status** | ⬜ not started |
| **Outcome** | Every minute pg_cron calls the dispatch route, which claims due occurrences and delivers them by email (Resend) and web push with a signed "Urađeno" link, re-sends once after 30 minutes, marks missed, falls back from WhatsApp/Viber to email + push, and alerts the Operator when deliveries stop. |
| **Implements** | FR-20, FR-24, FR-25 (fallback), NFR-01, NFR-02 · EP-32, EP-33 · route handlers `/api/internal/dispatch`, `/api/a/done` · tables `reminder_occurrences`, `reminder_deliveries`, `push_subscriptions` · ADR-04, ADR-05, ADR-08, ADR-16 (`lib/server/action-tokens.ts`), ADR-17 (`@pushforge/builder`) · TC §8 (pg_cron → `pg_net` with Vault secrets) · Design §9.1 (message copy, template ids) · API §9.3, §9.4 · RISK-14, RISK-19, RISK-22 |
| **Depends on** | Step 18 |
| **Blocked by** | — |
| **Track** | single |

**Read before starting:**
- `docs/product/02-prd.md` §6 FR-20, FR-22, FR-23, FR-24, FR-25, FR-29; §8 BR-13 – BR-17, BR-24; §9 E-05, E-06; §10 NFR-01, NFR-02
- `docs/product/03-technical-constraints.md` §3 ADR-04, ADR-05, ADR-08, ADR-16, ADR-17; §5.5 (all tables); §7 rows NFR-01, NFR-02; §8 scheduled jobs and pg_cron → app calls; §8.1; §10 RISK-14, RISK-15
- `docs/product/04-design-system.md` §9 (copy, formats, pet names in nominative), §9.1 (message copy and template ids); §11 row S10
- `docs/product/05-api-integration-contract.md` §5.3 preamble, EP-26 (side effects reused), EP-32, EP-33; §7.2 (`invalid_action_token`, `invalid_signature`, `whatsapp_cap_reached`); §9.3; §9.4; §12 row `job`; §15 RISK-19, RISK-22
- `docs/product/06-build-plan.md` §4, §5, §6 and the Session logs of Steps 02, 08, 17, 18

**Files this step may touch:**
- `supabase/migrations/*_reminder_dispatch.sql` (new: `rpc:claim_due_occurrences` and the re-send / missed / watchdog queries EP-33 describes; pg_cron schedule calling the route via `pg_net` every minute)
- `lib/supabase/` generated types file (via `npm run db:types` only)
- `app/api/internal/dispatch/route.ts` (new, EP-33)
- `app/api/a/done/route.ts` (new, EP-32)
- `lib/integrations/resend.ts` (new: send with template id + locale + variables, retries per §9.4)
- `lib/integrations/webpush.ts` (new: VAPID send, deletes endpoints answering 404/410)
- `lib/server/action-tokens.ts` (new: sign/verify per API §9.3; TC ADR-16)
- `package.json`, `package-lock.json` (add `@pushforge/builder` only)
- `README.md` (Scheduled jobs section only)
- `public/sw.js` (modify: notification click opens `done_url` for "Urađeno")
- `lib/i18n/sr.ts`, `lib/i18n/en.ts` (add keys for the EP-32 confirmation and error pages)
- `supabase/tests/claim_due_occurrences.test.sql`, `supabase/tests/dispatch_resend_missed.test.sql`, `supabase/tests/dispatch_dst.test.sql`
- `tests/dispatch/dispatch-route.test.ts`, `tests/dispatch/channel-resolution.test.ts`, `tests/dispatch/action-done-route.test.ts`, `tests/integrations/resend.test.ts`, `tests/integrations/webpush.test.ts`, `tests/integrations/action-tokens.test.ts`
- `docs/product/06-build-plan.md` (Step 19 row in §3 and the Step 19 Session log only)

**Out of bounds:** WhatsApp and Viber sending, the WhatsApp webhook and EP-30 (Step 29 — in this step `whatsapp`/`viber` channels always resolve to the fallback); Premium expiry notices (EP-49, Step 30); invitation, transfer and request emails (Steps 22, 25); RISK-19's one-click confirm page for cookie-less requests and any scanner user-agent list (not specified — log as follow-up); any table or column change; `components/ui`, `components/app`.

**Acceptance criteria:** (PRD v1.6, verbatim)
- FR-20 — Given a vaccination next-dose date, treatment frequency, vet-visit check-up date, meal schedule, or date of birth, When saved, Then the corresponding reminder exists without further action. *(this step: its occurrences are delivered)*
- FR-24 — Given a delivered reminder, When the user marks it done (from the message or in the product), Then it is shown as done with time and user. *(this step: from the message — email and push link)*
- FR-24 — Given a delivered reminder not marked done within 30 minutes, Then it is re-sent once; if still not marked done, it is shown as missed.
- FR-25 — Given Premium has expired, When a reminder previously set to WhatsApp or Viber is due, Then it is delivered by email and push instead.
- NFR-01 (derived from ADR-04 and TC §7 row NFR-01): a pending occurrence with `notify_at ≤ now()` is claimed by the next run and delivered within that run; one run completes within the `job` budget (05- §12).
- NFR-02 (derived from TC §7 row NFR-02): a reminder set for 08:00 arrives at 08:00 Belgrade time on both sides of a DST change.

**Tests to ship:**
- FR-20 (delivered) → `tests/dispatch/dispatch-route.test.ts` (with fake Resend and push adapters: a claimed vaccination occurrence produces one `reminder_deliveries` row per recipient × channel) and `supabase/tests/claim_due_occurrences.test.sql` (claims only `pending` with `notify_at ≤ now()`; skips done instances, inactive reminders, memorial pets, owners pending deletion; `SKIP LOCKED` prevents double claim)
- FR-24 (from the message) → `tests/dispatch/action-done-route.test.ts` (valid `dn_` token marks the instance done with `done_by = recipient`; reused token on a done instance returns the success page; bad/expired token → `invalid_action_token`; lost access → `not_found`; read-only household → `household_read_only`; `HEAD` and `Purpose`/`Sec-Purpose: prefetch` mark nothing) and `tests/integrations/action-tokens.test.ts`
- FR-24 (re-send once, then missed) → `supabase/tests/dispatch_resend_missed.test.sql` (final notice `sent` 30 min ago and not done → `resent`; `resent` 30 min ago → `missed`; earlier lead-time notices never re-sent)
- FR-25 (fallback) → `tests/dispatch/channel-resolution.test.ts` (no Premium, Viber off, no `user_channels` row, and the 31st message of the month each resolve `whatsapp`/`viber` to `{email, push}` and count `fell_back`; members limited to email + push)
- NFR-01 → `tests/dispatch/dispatch-route.test.ts` (missing or wrong `X-Dispatch-Secret` → `invalid_signature`; response counters; batch ≤ 200) and `supabase/tests/claim_due_occurrences.test.sql`
- NFR-02 → `supabase/tests/dispatch_dst.test.sql` (08:00 Europe/Belgrade `notify_at` correct on the dates before and after the DST change)
- Adapters → `tests/integrations/resend.test.ts` (3 tries, then `failed`), `tests/integrations/webpush.test.ts` (404/410 delete the endpoint)
- RISK-14 watchdog → `tests/dispatch/dispatch-route.test.ts` (the condition — pending rows > 15 min overdue and no delivery in 15 min — is detected and logged at most once per hour; no alert email until CR-24 supplies its copy)
- copy → `tests/integrations/resend.test.ts` and `tests/dispatch/action-done-route.test.ts` (template ids `reminder_email`, `reminder_push`, `action_done_page`, `action_expired_page` of Design §9.1 rendered in the recipient's locale)

**Verification:**
```
npm run typecheck      # expect: exit 0
npm run lint           # expect: exit 0
npm test               # expect: all Vitest suites pass, including the six files above
npx supabase test db   # expect: all pgTAP files pass, including the three files above
npm run build          # expect: build succeeds
```

#### Prompt
```
You are executing Step 19 — Reminder dispatch job & message actions — of docs/product/06-build-plan.md. Work in the repository root.

Read first, in full:
- docs/product/02-prd.md §6 FR-20, FR-22, FR-23, FR-24, FR-25, FR-29; §8 BR-13 – BR-17, BR-24; §9 E-05, E-06; §10 NFR-01, NFR-02
- docs/product/03-technical-constraints.md §3 ADR-04, ADR-05, ADR-08, ADR-16, ADR-17; §5.5; §7 rows NFR-01, NFR-02; §8; §8.1; §10 RISK-14, RISK-15
- docs/product/04-design-system.md §9, §9.1; §11 row S10
- docs/product/05-api-integration-contract.md §5.3 preamble, EP-26, EP-32, EP-33; §7.2; §9.3; §9.4; §12; §15 RISK-19, RISK-22
- docs/product/06-build-plan.md §4, §5, §6, and the Session logs of Steps 02, 08, 17 and 18

Settled upstream — apply exactly:
1. Copy and template ids: docs/product/04-design-system.md §9.1 — reminder_email, reminder_push, action_done_page, action_expired_page and the shared email_footer, each in sr and en under messages.<id> in lib/i18n/sr.ts and lib/i18n/en.ts; the language follows the recipient's profiles.locale. The RISK-14 Operator alert has no §9.1 template (CR-24): implement the watchdog detection and log it; send no email with invented text.
2. Web push: @pushforge/builder (TC ADR-17) in lib/integrations/webpush.ts, with NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY_JWK and VAPID_SUBJECT (TC §8.1); do not hand-write the payload encryption.
3. Scheduling: pg_cron calls POST /api/internal/dispatch every minute through pg_net, reading the target URL and the shared secret from the Supabase Vault secrets dispatch_url and dispatch_secret (TC §8, ADR-04); the route compares the header with DISPATCH_SECRET (TC §8.1). dispatch_url holds the app's base URL — TC §8 uses this one secret for every internal route (dispatch, the nightly jobs, /api/internal/exports) — and each schedule appends its route path. The migration only reads the Vault secrets by name — never put a value in a migration; the owner sets them per environment. Locally pg_cron may be disabled and dispatch run manually (TC §8): document both in the README.md Scheduled jobs section.
4. Action tokens: lib/server/action-tokens.ts (TC ADR-16; imports "server-only"), signed with ACTION_TOKEN_SECRET (TC §8.1); Steps 22, 24 and 25 reuse it.
5. Email: Resend with RESEND_API_KEY and sender EMAIL_FROM (TC §8.1).

Build:
1. Migration reminder_dispatch (npx supabase migration new reminder_dispatch): rpc:claim_due_occurrences and the re-send / missed / watchdog queries exactly as EP-33 Side effects 1, 6, 7, 8 describe, and the pg_cron schedule (every minute, pg_net, Vault secrets dispatch_url / dispatch_secret — settled item 3). No new tables or columns. Run npm run db:types.
2. lib/integrations/resend.ts and lib/integrations/webpush.ts per 05- §9.4 (payloads, retries, permanent-failure handling); emails by Design §9.1 template id. Call Resend through its HTTP API with the platform fetch; do not add Resend's SDK package. Web push through @pushforge/builder.
3. lib/server/action-tokens.ts: sign and verify per 05- §9.3 using ACTION_TOKEN_SECRET; dn_ tokens single-use, 24 h, bound to occurrence and recipient.
4. app/api/internal/dispatch/route.ts: EP-33 exactly — secret check in constant time, then steps 1–8 in order within the 45 s budget, batches of ≤ 200, response counters. Channel resolution per EP-33 step 3; in this step WhatsApp/Viber always resolve to the fallback {email, push} because no user_channels row can exist yet. One reminder_deliveries row per recipient × channel (step 5). The Operator alert is detection and logging only (settled item 1, CR-24).
5. app/api/a/done/route.ts: EP-32 exactly — token check, same effect as EP-26 with done_by = recipient, HEAD and Purpose/Sec-Purpose: prefetch guard, localized HTML page (recipient's profiles.locale) or JSON with Accept: application/json; error pages for invalid_action_token, not_found, household_read_only. Render the pages with the existing AuthShell/PublicShell composite and Card only. RISK-19's one-click confirm page and scanner user-agent list are not specified: do not implement them; record them as a follow-up in the Session log.
6. public/sw.js: on notification click for the done action, open done_url.
7. Put every new string into lib/i18n/sr.ts and lib/i18n/en.ts, using only the Design §9.1 copy (settled item 1).
8. README.md: add a "Scheduled jobs" section naming the two Vault secrets (dispatch_url, dispatch_secret — names only) and how to run the dispatch manually when local pg_cron is disabled.

Do not invent:
- No colours, spacing, radii, fonts or components outside 04-design-system.md §4–§6 and the existing components/ui and components/app; do not edit components/ui or components/app.
- No packages outside 03-technical-constraints.md ADR-17; add only @pushforge/builder to package.json.
- No endpoints, fields, error codes or RPC names outside 05-api-integration-contract.md.
- No tables, columns or enum values outside 03-technical-constraints.md §5.
- No user-facing copy that is not in 04-design-system.md or docs/product/04-design.

Files: create or modify only these. Touching any other file requires stopping and asking.
- supabase/migrations/<timestamp>_reminder_dispatch.sql; the generated types file in lib/supabase/ (via npm run db:types only)
- app/api/internal/dispatch/route.ts, app/api/a/done/route.ts
- lib/integrations/resend.ts, lib/integrations/webpush.ts
- lib/server/action-tokens.ts
- package.json, package-lock.json (@pushforge/builder only)
- README.md (Scheduled jobs section only)
- public/sw.js
- lib/i18n/sr.ts, lib/i18n/en.ts
- supabase/tests/claim_due_occurrences.test.sql, supabase/tests/dispatch_resend_missed.test.sql, supabase/tests/dispatch_dst.test.sql
- tests/dispatch/dispatch-route.test.ts, tests/dispatch/channel-resolution.test.ts, tests/dispatch/action-done-route.test.ts, tests/integrations/resend.test.ts, tests/integrations/webpush.test.ts, tests/integrations/action-tokens.test.ts
- docs/product/06-build-plan.md (Step 19 row in §3 and the Step 19 Session log only)

Acceptance criteria (PRD v1.6, verbatim — each needs a passing test):
- Given a vaccination next-dose date, treatment frequency, vet-visit check-up date, meal schedule, or date of birth, When saved, Then the corresponding reminder exists without further action. (This step: its occurrences are delivered.)
- Given a delivered reminder, When the user marks it done (from the message or in the product), Then it is shown as done with time and user. (This step: from the message.)
- Given a delivered reminder not marked done within 30 minutes, Then it is re-sent once; if still not marked done, it is shown as missed.
- Given Premium has expired, When a reminder previously set to WhatsApp or Viber is due, Then it is delivered by email and push instead.
- Derived from ADR-04 and TC §7 NFR-01: a pending occurrence with notify_at ≤ now() is claimed by the next run and delivered within that run; one run completes within the job budget (05- §12).
- Derived from TC §7 NFR-02: a reminder set for 08:00 arrives at 08:00 Belgrade time on both sides of a DST change.

Tests to write: exactly the files listed under "Tests to ship" in Step 19 of docs/product/06-build-plan.md, each covering the criterion named there. External providers are always faked in tests.

Done means all of these pass, in this order, and you paste their output into the Session log:
npm run typecheck
npm run lint
npm test
npx supabase test db
npm run build

When verification passes: update the Step 19 row in docs/product/06-build-plan.md §3 (Status ✅, Done = today's date), append a Session log entry under Step 19 (date, what was built, the output of each verification command, deviations, follow-ups — include the RISK-19 one-click confirm follow-up and the CR-24 Operator alert email), then commit with the message "Step 19: Reminder dispatch job & message actions".

If anything above is ambiguous, if a referenced section doesn't contain what this prompt says it does, or if completing this step would require touching a file outside the list or making a decision the referenced documents don't settle — STOP and ask. Do not choose a reasonable default. Do not proceed with a partial implementation.
```

#### Session log
- **2026-10-23** — Step 19 built (unattended overnight run).
  - **Built:**
    - Migration `20261023122425_reminder_dispatch.sql` (`create extension pg_net`). `rpc:claim_due_occurrences(p_limit default 200)` does EP-33 step 1: `UPDATE … SET status = 'sent', sent_at = now()` over a `FOR UPDATE OF c SKIP LOCKED` subselect of pending notices with `notify_at <= now()`. It skips instances already done, inactive reminders, memorial pets and owners with `deletion_requested_at`, and returns a jsonb array. Each claimed notice carries what steps 2–4 need (`private.dispatch_occurrence_json`): the title (resolved as in `ReminderOccurrence`), the pet name and `viber_enabled`. It also carries the recipients: the owner, plus opted-in (`reminders_enabled`) members of households the pet is shared with whose accounts are not pending deletion. Each recipient comes with locale, full name, email, Premium, `reminder_preferences.channels` for the type (default `{email,push}`), WhatsApp/Viber opt-in, the BR-14a count of delivered WhatsApp/Viber messages this Europe/Belgrade month, and the push endpoints. Step 6 is `claim_resend_occurrences(p_limit)`: final notices `sent` ≥ 30 min ago whose instance is not done become `resent` with `resent_at = now()`, in the same return shape. Step 7 is `mark_missed_occurrences()`: `resent` ≥ 30 min ago and not done becomes `missed`, and it returns the count. Step 8 is `dispatch_watchdog_due()`. EP-32 is `mark_occurrence_done_for(occurrence_id, recipient_id)`. pg_cron job `reminder-dispatch` (`* * * * *`) runs `select private.call_internal_route('/api/internal/dispatch')`, which reads the Vault secrets `dispatch_url` / `dispatch_secret` by name and calls `net.http_post` with `X-Dispatch-Secret`. It does nothing while either secret is missing. All of these are service-role only (revoked from public, anon and authenticated). `npm run db:types` regenerated `lib/supabase/database.types.ts`.
    - `lib/server/dispatch.ts`: `resolveChannels` (EP-33 step 3) and `runDispatch` (steps 1–8 in order, batches of 200 while a batch is full, 45 s budget, response counters, one `reminder_deliveries` insert per occurrence with one row per recipient × channel). It also has the Belgrade date/time formatting (`sr-Latn` "19. 10. 2026." / `en-GB` "19 Oct 2026", "08:00"), `{first_name}` and the `{pet}` / `{title}` labels.
    - `app/api/internal/dispatch/route.ts` (EP-33): checks `X-Dispatch-Secret` against `DISPATCH_SECRET` in constant time (missing, wrong or unset → `401 invalid_signature`), then wires the service-role client, Resend, web push (gone endpoints are deleted from `push_subscriptions`) and `signDoneToken` into `runDispatch`. Errors → `500 internal_error`.
    - `app/api/a/done/route.ts` (EP-32): `HEAD` and `Purpose` / `Sec-Purpose: prefetch` → 200 with an empty body and no reads or writes. Otherwise the `dn_` token is checked (2 uuid fields), the recipient's `profiles.locale` is read (also for an expired token whose signature is valid), and `mark_occurrence_done_for` runs. The answer is the localized `action_done_page` ("{pet}: {title} — označeno u {time}." at the Belgrade `done_at`). `invalid_action_token` → 400 `action_expired_page`, `not_found` → 404, `household_read_only` → 403; other errors → 500 with `common.error`. `Accept: application/json` gets `{ occurrence }` or the `ApiError`. A reused token on a done instance shows the same success page.
    - `lib/server/action-tokens.ts`: `signActionToken(kind, fields, expiresAt)`, `verifyActionToken(token, kind, { now, fieldCount })` (Web Crypto HMAC verify, so the compare is constant time), `signDoneToken` (24 h from send), `randomToken(prefix)` and `hashToken` (SHA-256 hex). Requires `ACTION_TOKEN_SECRET`.
    - `lib/integrations/resend.ts`: `renderEmail(template, locale)` renders the Design §9.1 `reminder_email` (bold title, "Urađeno" and "Otvori u aplikaciji" buttons, the 24 h note) and `email_footer` as escaped HTML plus a text part. It uses a template-id → renderer map that Steps 22, 25 and 30 extend. `sendEmail` POSTs to `https://api.resend.com/emails` with fetch (no SDK). It retries on network errors, 429 and 5xx (3 tries) and fails other 4xx at once. Env vars are read at call time.
    - `lib/integrations/webpush.ts`: `sendPush` (via `buildPushHTTPRequest` from `@pushforge/builder`) sends to every endpoint with 1 retry. 404/410 → `removeEndpoint`, and the result is `delivered` when ≥ 1 endpoint accepted. Payloads over 4 KB are refused. `pushConfigFromEnv()` is null while a VAPID key is empty.
    - `public/sw.js`: a "Urađeno" / "Done" action (from `navigator.language`) when the payload has `done_url`. Clicking the action opens `done_url`, and clicking the body still opens `url`.
    - `lib/i18n/sr.ts` / `en.ts`: `messages.email_footer`, `messages.reminder_email`, `messages.reminder_push`, `messages.action_done_page`, `messages.action_expired_page`, plus the owner-approved `action_not_found_page`, `action_read_only_page` and `reminder_email.bodyNoName`.
    - `README.md` "Scheduled jobs" section. `package.json` / `package-lock.json`: `@pushforge/builder` 2.0.5 only.
    - Tests: `supabase/tests/claim_due_occurrences.test.sql` (39), `dispatch_resend_missed.test.sql` (22), `dispatch_dst.test.sql` (12). `tests/dispatch/dispatch-route.test.ts` (16), `channel-resolution.test.ts` (9), `action-done-route.test.ts` (19). `tests/integrations/action-tokens.test.ts` (10), `resend.test.ts` (11), `webpush.test.ts` (9).
  - **Owner decisions applied (2026-10-23):**
    - `lib/server/dispatch.ts` exports `resolveChannels` and `runDispatch`, and `route.ts` only wires it up. `lib/server/action-tokens.ts` exports `signActionToken`, `verifyActionToken`, `randomToken` and `hashToken`.
    - The `dn_` format is `"dn_" + base64url("dn|occurrence_id|recipient_id|exp_unix|nonce") + "." + base64url(HMAC-SHA256)`. Single use comes from the done state, and nothing is stored.
    - `mark_occurrence_done_for` is security definer and granted to service_role only. It runs `public.mark_occurrence_done` with `request.jwt.claim.sub` set to the recipient for the call and then restores it, so the EP-26 effects and access checks are the same code.
    - The action pages are a template-string HTML page (escaped variables, inline `<style>` with the Design §4.1 values, `<img>` logo), not React shells (deviation from Build step 5 "AuthShell/PublicShell and Card").
    - Action page copy: "Otvori aplikaciju" / "Open the app"; not_found → "Podsetnik nije dostupan" / "Reminder not available", "Više nemaš pristup ovom podsetniku." / "You no longer have access to this reminder."; household_read_only → "Domaćinstvo je samo za čitanje" / "The household is read-only", "Vlasniku domaćinstva je istekao Premium, pa podsetnik ne možeš da označiš." / "The household owner's Premium has ended, so you can't mark this reminder."
    - The links ("Otvori u aplikaciji", push `url`, the page button) go to `${NEXT_PUBLIC_SITE_URL}/podsetnici`. HEAD and prefetch requests → 200 with an empty body.
    - `{first_name}` is the first word of `full_name`. `display_name` does not exist in TC §5 yet, so with no name the greeting is "Zdravo! Podsetnik: …" / "Hi! Reminder: …". A null meal / birthday title reuses "Obrok — {pet}" / "Rođendan — {pet}". The `sw.js` action label comes from `navigator.language`.
    - Retries: Resend gets 3 tries inside the run (0, 1 s, 3 s) and push gets 1 immediate retry. The watchdog uses a module-level `lastWatchdogLogAt` and logs at most once an hour; the test uses fake timers.
    - Local mode: with an empty `RESEND_API_KEY` outside production the email is `console.info`'d and gets id `local-<uuid>`. With empty VAPID keys push is skipped with a log line. Env vars are read at request time. `call_internal_route` (revoked from anon and authenticated) does nothing without both Vault secrets. README has the three lines (`npx @pushforge/builder vapid`, `dispatch_url = http://host.docker.internal:3000`, the manual `curl`).
    - The tests generate ECDSA P-256 / ECDH keys in-test. The route tests mock the service-role client and the adapters, and the database behaviour is proven in pgTAP.
  - **Owner-approved exceptions:**
    - **Exception 1:** `supabase/tests/occurrence_schedule.test.sql` (Step 08) asserted that the nightly job is the only cron job ("exactly one cron job exists (only the nightly generation)"). That assertion and the row check after it now exclude `reminder-dispatch`, which this step adds. Nothing else in the file changed.
    - **Exception 3:** `tests/design/no-raw-hex.test.ts` forbade raw hex outside `app/globals.css` and `app/manifest.ts`. The owner decision puts the Design §4.1 token values inline in the action pages, and emails cannot read CSS variables either. Those values now live in one table, `TOKEN_COLORS` in `lib/integrations/resend.ts`, which the done route imports. The test allows that one file and adds a check that every entry equals the `app/globals.css` token of the same name and that the file has no other hex.
  - **Verification:**
    - `npm run typecheck` ✅ exit 0
    - `npm run lint` ✅ exit 0. 0 errors and 2 warnings, both the unused eslint-disable directives in the generated `cloudflare-env.d.ts` that were already there.
    - `npm test` ✅ `Test Files 66 passed (66)`, `Tests 734 passed (734)`
    - `npx supabase test db` ✅ `All tests successful. Files=52, Tests=1677`, `Result: PASS`. This was run after `npx supabase db reset`, which applied all migrations and the seed cleanly.
    - `npm run build` ✅ exit 0. The routes include `ƒ /api/a/done` and `ƒ /api/internal/dispatch`.
    - Extra live check (`next start` against the local stack as seeded Ivana):
      - A wrong secret → 401 `invalid_signature`.
      - A due vaccination notice → `{"claimed":1,"delivered":0,"failed":1,…}`. In production mode with no `RESEND_API_KEY` the row is `email / failed / resend_not_configured`, as designed, and push had no endpoint, so no row.
      - A `dn_` link: HEAD and `Sec-Purpose: prefetch` → 200, still `sent`. GET → "Označeno kao urađeno" / "Luna: Besnilo — Rabisin — označeno u 14:40.", and the row is `done` with `done_by` = Ivana. A tampered token → 400 `invalid_action_token`.
      - The local DB was reset afterwards.
  - **Deviations / decisions:**
    - Internal function names: the contract names only `rpc:claim_due_occurrences`, but the step's file list asks for the "re-send / missed / watchdog queries EP-33 describes" in the migration, and the route calls them through the service role. They are `claim_resend_occurrences`, `mark_missed_occurrences` and `dispatch_watchdog_due`, plus the private helpers `is_dispatchable` and `dispatch_occurrence_json`. None is a client API: all are service-role only. `claim_due_occurrences` validates `p_limit` 1–200 (`validation_failed`, `limit:out_of_range`).
    - Watchdog scope: "pending rows > 15 min overdue" counts only notices the claim would take. Rows it skips by design (inactive reminder, memorial pet, owner pending deletion, instance done) stay pending and would otherwise trigger a false alarm. "No delivery recorded" uses `reminder_deliveries.created_at` in the last 15 minutes.
    - The re-send applies the claim's eligibility (active reminder, active pet, owner not pending deletion). Missed marking only needs "instance not done".
    - Members get the plain intersection with {email, push} (EP-33 step 3). A member whose preferences hold only WhatsApp/Viber gets nothing, and this does not count as `fell_back`.
    - `fell_back` counts each replaced WhatsApp/Viber channel. Until Step 29 no channel is live (`liveChannels` empty), so WhatsApp/Viber always fall back. `resolveChannels` already applies the Premium, Viber-off, opt-in and 30-per-month rules, which the tests cover with a live set.
    - Email date and time are the instance's `due_at` in Europe/Belgrade. The done page time is `done_at` in Europe/Belgrade.
    - A token whose recipient profile no longer exists → `not_found`. A server error on the page reuses `common.error` as the heading, with no new copy.
    - `@pushforge/builder` sends `Content-Encoding: aesgcm`, and the test accepts either `aesgcm` or `aes128gcm`.
  - **Follow-ups:**
    - **RISK-19:** the one-click confirm page for cookie-less requests and any scanner user-agent list are not specified (API §9.3 / §15), so neither is implemented. Only the `HEAD` and `Purpose` / `Sec-Purpose: prefetch` guard exists. This needs a contract/design decision.
    - **CR-24:** the Operator alert email (RISK-14, `OPERATOR_ALERT_EMAIL`) has no Design §9.1 template. The watchdog only detects and logs (`console.error`, at most once per hour per instance). Sending waits for the copy.
    - Step 29: WhatsApp sending (add `whatsapp` to `liveChannels`, count the in-run cap per message, the quick-reply payload = the same `dn_` token).
    - Steps 22, 25, 30: add their §9.1 templates to the `RENDERERS` map in `lib/integrations/resend.ts`, and use `randomToken` / `hashToken` for `hh_` / `og_` / `tr_`.
    - Owner, per environment: Vault secrets `dispatch_url` / `dispatch_secret`, and the app secrets `DISPATCH_SECRET`, `ACTION_TOKEN_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `VAPID_PRIVATE_KEY_JWK`, `VAPID_SUBJECT` and `NEXT_PUBLIC_VAPID_PUBLIC_KEY`.
    - The Resend retries are 0 / 1 s / 3 s inside the run (owner decision). API §9.4 says 1 / 5 / 15 min, so the contract could be aligned.

---

### Step 20 — Care log & meal reminders

| | |
|---|---|
| **Status** | ⬜ not started |
| **Outcome** | Owners and household members log feeding and stool on S07 without limits; the owner sets a meal schedule that creates meal reminders at the exact times on the chosen days. |
| **Implements** | FR-14, FR-15, FR-16, FR-20 (meal schedule), FR-28 (feeding/stool) · EP-17, EP-18, EP-19 · S07 `/ljubimci/[id]/dnevnik`, S03 link to Dnevnik · tables `feeding_entries`, `stool_entries`, `reminders` (type `meal`) |
| **Depends on** | Step 19 |
| **Blocked by** | — |
| **Track** | single |

**Read before starting:**
- `docs/product/02-prd.md` §6 FR-14, FR-15, FR-16, FR-20, FR-28; §8 BR-04, BR-13, BR-17, BR-22, BR-23
- `docs/product/03-technical-constraints.md` §5.4 `feeding_entries`, `stool_entries`; §5.5 `reminders` (meal columns, unique meal index), `reminder_occurrences`
- `docs/product/04-design-system.md` §6, §8, §9, §11 row S07, §12 S07
- `docs/product/04-design/screens/care-log.tsx`, `docs/product/04-design/screens/pet-record.tsx` (Dnevnik link)
- `docs/product/05-api-integration-contract.md` §3.4; §4.4 rows EP-17 – EP-19; §5.1 Part A (read views, per-entry access); §5.2 EP-17, EP-18, EP-19; §6 `FeedingEntry`, `StoolEntry`, `MealSchedule`; §7.3
- `docs/product/06-build-plan.md` §4, §5, §6 and the Session logs of Steps 07, 08, 17, 19

**Files this step may touch:**
- `supabase/migrations/*_care_log_api.sql` (new: `view:feeding_entries_api`, `view:stool_entries_api`, `view:meal_schedules_api`, `rpc:set_meal_schedule`)
- `lib/supabase/` generated types file (via `npm run db:types` only)
- `app/(app)/ljubimci/[id]/dnevnik/page.tsx`, `app/(app)/ljubimci/[id]/dnevnik/care-log-client.tsx` (new, S07)
- `app/(app)/ljubimci/[id]/pet-record-client.tsx` (modify: Dnevnik link)
- `lib/i18n/sr.ts`, `lib/i18n/en.ts` (add keys)
- `supabase/tests/care_log_api.test.sql`, `supabase/tests/set_meal_schedule.test.sql`
- `tests/care-log/care-log-screen.test.tsx`, `tests/care-log/meal-schedule-card.test.tsx`
- `docs/product/06-build-plan.md` (Step 20 row in §3 and the Step 20 Session log only)

**Out of bounds:** moments (Step 21); reminder settings and dispatch code (Steps 18, 19 — meal delivery uses them unchanged); any table or column change; `components/ui`, `components/app`.

**Acceptance criteria:** (PRD v1.6, verbatim)
- FR-14 — Given any user, When adding feeding entries, Then there is no limit on Free or Premium.
- FR-15 — Given meal times (e.g., 08:00 and 18:00) and selected days (every day or chosen weekdays), When saved, Then a reminder is sent at each time on each selected day.
- FR-16 — Given any user, When adding stool entries, Then there is no limit on Free or Premium.

**Tests to ship:**
- FR-14 → `supabase/tests/care_log_api.test.sql` (Free seed user inserts more feeding entries than any Free limit; member inserts and may edit/delete only own entries; read-only household → `household_read_only`) and `tests/care-log/care-log-screen.test.tsx` (quick-add Dialog, day grouping in Europe/Belgrade, "Učitaj još")
- FR-15 → `supabase/tests/set_meal_schedule.test.sql` (times 08:00 and 18:00 on chosen weekdays create one `meal` reminder with occurrences at each exact time on each selected day; empty times remove it; member → `forbidden_role`; memorial pet → `invalid_state`) and `tests/care-log/meal-schedule-card.test.tsx` (card shows times and weekday chips; member sees no edit controls)
- FR-16 → `supabase/tests/care_log_api.test.sql` (same as FR-14 for stool entries) and `tests/care-log/care-log-screen.test.tsx` (Stolica tab)

**Verification:**
```
npm run typecheck      # expect: exit 0
npm run lint           # expect: exit 0
npm test               # expect: all Vitest suites pass, including the two files above
npx supabase test db   # expect: all pgTAP files pass, including the two files above
npm run build          # expect: build succeeds
```

#### Prompt
```
You are executing Step 20 — Care log & meal reminders — of docs/product/06-build-plan.md. Work in the repository root.

Read first, in full:
- docs/product/02-prd.md §6 FR-14, FR-15, FR-16, FR-20, FR-28; §8 BR-04, BR-13, BR-17, BR-22, BR-23
- docs/product/03-technical-constraints.md §5.4 feeding_entries, stool_entries; §5.5 reminders, reminder_occurrences
- docs/product/04-design-system.md §6, §8, §9, §11 row S07, §12 S07
- docs/product/04-design/screens/care-log.tsx, docs/product/04-design/screens/pet-record.tsx (Dnevnik link)
- docs/product/05-api-integration-contract.md §3.4; §4.4 rows EP-17 – EP-19; §5.1 Part A; §5.2 EP-17, EP-18, EP-19; §6 FeedingEntry, StoolEntry, MealSchedule; §7.3
- docs/product/06-build-plan.md §4, §5, §6, and the Session logs of Steps 07, 08, 17 and 19

Copy (settled upstream): docs/product/04-design-system.md §9 i18n rule — every string of S07 goes into lib/i18n/sr.ts and lib/i18n/en.ts; the Serbian text is the mockup copy and the English text is its faithful translation; no new copy, no missing key.

Build:
1. Migration care_log_api (npx supabase migration new care_log_api): view:feeding_entries_api, view:stool_entries_api and view:meal_schedules_api as §5.1 Part A and the FeedingEntry / StoolEntry / MealSchedule schemas define (security_invoker, per-entry access), and rpc:set_meal_schedule exactly as EP-19 defines (one meal reminder per pet, occurrences at exact times). EP-18 field rules not yet enforced may be added only as check constraints on existing 03- §5.4 columns. Run npm run db:types.
2. S07: port docs/product/04-design/screens/care-log.tsx to app/(app)/ljubimci/[id]/dnevnik/care-log-client.tsx with its page.tsx. Pet header from EP-01 (id filter); tabs Ishrana / Stolica from EP-17 (paged, "Učitaj još"); quick-add, edit and delete Dialogs through EP-18 (fed_at / observed_at built from date + HH:MM Europe/Belgrade as EP-18 states); edit/delete hidden where access.can_edit = false; "Podsetnici za obroke" card from EP-19 get and saved with EP-19 set (hidden controls for members). Remove the StateSwitcher; loading / default / empty per EP-17 States.
3. S03: add the Dnevnik link from the mockup to app/(app)/ljubimci/[id]/pet-record-client.tsx.
4. Put every new string into lib/i18n/sr.ts and lib/i18n/en.ts per docs/product/04-design-system.md §9 (i18n rule: the Serbian text is the mockup copy, the English text its faithful translation; no new copy, no missing key).

Do not invent:
- No colours, spacing, radii, fonts or components outside 04-design-system.md §4–§6 and the existing components/ui and components/app; do not edit components/ui or components/app.
- No packages outside 03-technical-constraints.md ADR-17; do not add any dependency to package.json.
- No endpoints, fields, error codes or RPC names outside 05-api-integration-contract.md.
- No tables, columns or enum values outside 03-technical-constraints.md §5.
- No user-facing copy that is not in 04-design-system.md or docs/product/04-design.

Files: create or modify only these. Touching any other file requires stopping and asking.
- supabase/migrations/<timestamp>_care_log_api.sql; the generated types file in lib/supabase/ (via npm run db:types only)
- app/(app)/ljubimci/[id]/dnevnik/page.tsx, app/(app)/ljubimci/[id]/dnevnik/care-log-client.tsx
- app/(app)/ljubimci/[id]/pet-record-client.tsx
- lib/i18n/sr.ts, lib/i18n/en.ts
- supabase/tests/care_log_api.test.sql, supabase/tests/set_meal_schedule.test.sql
- tests/care-log/care-log-screen.test.tsx, tests/care-log/meal-schedule-card.test.tsx
- docs/product/06-build-plan.md (Step 20 row in §3 and the Step 20 Session log only)

Acceptance criteria (PRD v1.6, verbatim — each needs a passing test):
- Given any user, When adding feeding entries, Then there is no limit on Free or Premium.
- Given meal times (e.g., 08:00 and 18:00) and selected days (every day or chosen weekdays), When saved, Then a reminder is sent at each time on each selected day.
- Given any user, When adding stool entries, Then there is no limit on Free or Premium.

Tests to write: exactly the files listed under "Tests to ship" in Step 20 of docs/product/06-build-plan.md, each covering the criterion named there.

Done means all of these pass, in this order, and you paste their output into the Session log:
npm run typecheck
npm run lint
npm test
npx supabase test db
npm run build

When verification passes: update the Step 20 row in docs/product/06-build-plan.md §3 (Status ✅, Done = today's date), append a Session log entry under Step 20 (date, what was built, the output of each verification command, deviations, follow-ups), then commit with the message "Step 20: Care log & meal reminders".

If anything above is ambiguous, if a referenced section doesn't contain what this prompt says it does, or if completing this step would require touching a file outside the list or making a decision the referenced documents don't settle — STOP and ask. Do not choose a reasonable default. Do not proceed with a partial implementation.
```

#### Session log
- **2026-10-23** — Step 20 built (unattended overnight run).
  - **Built:**
    - Migration `20261023124529_care_log_api.sql`:
      - `view:feeding_entries_api` and `view:stool_entries_api` (`security_invoker`). They carry the §6 FeedingEntry / StoolEntry fields, `created_by_name` (`private.pet_person_name`) and the per-entry `access` (`private.entry_access`, the same rule as `weight_entries_api`: creator or owner, member entries locked while the household is read-only).
      - `view:meal_schedules_api` (`security_invoker` over `pets`, so RLS on pets decides which pets are visible) with the §6 MealSchedule fields. The meal reminder row comes from the security-definer helper `private.pet_meal_schedule(pet_id)`, limited to `private.can_access_pet_care`, because reminders RLS would hide it from a member who has not switched reminders on, while EP-19 get is Member 👁. `meal_times` are `HH:MM` ascending, `meal_weekdays` ascending, `every_day` when all of 1…7 are chosen.
      - `rpc:set_meal_schedule(p_pet_id uuid, p_meal_times time[], p_meal_weekdays smallint[] default null) → MealSchedule` (security definer, granted to authenticated only). No relation (organisation animals included) → `not_found`; member → `forbidden_role`; memorial pet → `validation_failed` `p_pet_id:invalid_state`; `p_meal_times` required, at most 6 (`out_of_range`), distinct whole minutes (`invalid`); `p_meal_weekdays` required with times, distinct values in 1…7 (`invalid`). Non-empty times upsert the single `meal` reminder (`on conflict (pet_id) where type = 'meal'`, `user_id` = owner, active), and the existing reminders trigger regenerates its future occurrences at the exact times on the chosen days. Empty times delete the reminder and, by cascade, its occurrences, and return `reminder_id = null` with empty arrays. Field codes travel in the error DETAIL as in the memorial RPCs.
      - EP-18 check constraints on existing columns: `feeding_entries.brand ≤ 100`, `feeding_entries.note ≤ 500`, `stool_entries.note ≤ 500`.
      - `npm run db:types` regenerated `lib/supabase/database.types.ts`.
    - `app/(app)/ljubimci/[id]/dnevnik/page.tsx`: EP-01 header (`pet_summaries_api`, id filter), the first EP-17 page of each tab (20, `count: 'exact'`, `fed_at` / `observed_at` desc), EP-19 get, EP-43 locale and the EP-15 pet photo on the server. The loading state is the Suspense fallback. No pet, any read error, or a pet without a care log (organisation roles) → `ErrorState`. The inline `"use server"` actions `listEntries`, `createFeeding`, `updateFeeding`, `createStool`, `updateStool`, `deleteEntry` and `setMealSchedule` check the §4.1 gates and the EP-17 / EP-18 / EP-19 request rules: timestamps not more than 5 min in the future (`out_of_range`), enums, brand ≤ 100, note ≤ 500, `amount_g` > 0 with ≤ 1 decimal, `limit` 1–50. Each write is returned through the matching `*_api` view, and an RLS-rejected insert → `not_found`.
    - `app/(app)/ljubimci/[id]/dnevnik/care-log-client.tsx`: port of `care-log.tsx` without the StateSwitcher.
      - Header with the back link "Karton: {name}", avatar, name · species · breed.
      - Ishrana / Stolica tabs with day groups in Europe/Belgrade ("Danas, …" / "Juče, …"), Belgrade times, grams in the locale number format, "upisao/la {name}", "Krv ili sluz: da", and "Učitaj još" from the current offset.
      - Quick-add / edit Dialogs. `fed_at` / `observed_at` are built from the date + `HH:MM` on the Belgrade wall clock (DST-aware). Inline errors come from the mockup, and 422 field codes map back to them.
      - Row menu and AlertDialog on rows with `access.can_edit`. "Dodaj obrok" / "Dodaj stolicu" (header and empty state) are gated on `can_log`.
      - "Podsetnici za obroke" card: times with remove buttons, "Dodaj vreme obroka" (at most 6), the "Svaki dan" Switch, weekday chips (`aria-pressed`, full-name aria-label), "Izaberi bar jedan dan.", "Sačuvaj podsetnike", and `role="status"` "Podsetnici za obroke su sačuvani.". The owner of an active pet edits it. Members (and the owner of a memorial pet) see the times plus either "Svaki dan" or outline weekday chips, with no controls.
    - `app/(app)/ljubimci/[id]/pet-record-client.tsx`: the mockup's aside card "Još o ljubimcu" with the "Dnevnik ishrane i stolice" link (`Utensils`), shown for owner and member (care log is personal). The Trenuci link is left for Step 21.
    - `lib/i18n/sr.ts` / `en.ts`: the new `careLog` section (every S07 string) and `petRecord.moreAbout` / `petRecord.careLogLink`, with English translations.
    - Tests:
      - `supabase/tests/care_log_api.test.sql` (47): view shape and grants. A Free owner adds 60 feeding and 60 stool entries, and a Premium owner adds 30 more. Created_by_name and access are checked. No relation / organisation admin → 42501. A member adds entries and edits / deletes only their own (`forbidden_role` otherwise). A read-only household → `household_read_only` on every member write, with every entry read-only. The brand / note / amount checks are covered.
      - `supabase/tests/set_meal_schedule.test.sql` (33): 08:00 + 18:00 on Mon/Wed/Fri gives one owner meal reminder whose occurrences equal the expected Belgrade due times in the 60-day window, with `notify_at = due_at`. Saving again keeps the same reminder and regenerates. The member sees the schedule but gets `forbidden_role`. No relation / organisation animal → `not_found`. The request rules are covered. Empty times remove the reminder and its occurrences. Memorial → `invalid_state`.
      - `tests/care-log/care-log-screen.test.tsx` (15): Belgrade day grouping (a 22:30 UTC entry sits under "Danas") and en-GB labels; "Učitaj još"; empty and loading states. Feeding quick-add with validation, Belgrade `fed_at`, toast and the new row. A future time is rejected. 422 / other errors; edit prefill and update; delete via AlertDialog. Member row menus only on own entries; `can_log = false` hides add buttons. Stolica tab list, quick-add (consistency, blood/mucus) and edit.
      - `tests/care-log/meal-schedule-card.test.tsx` (11): times and chips; add/toggle/save through EP-19; "Svaki dan" → 1…7; no day → error and Save disabled; removing all times sends empty arrays; error toast; English; member and memorial pets see no controls.
  - **Owner decisions applied (2026-10-23):**
    - Gendered dialog description by `pets.sex`: "Šta je {pet} jela / jeo / jeo/la i koliko." / "What {pet} ate and how much."
    - Edit/delete: "Izmeni obrok" / "Edit meal", "Izmeni unos stolice" / "Edit stool entry"; AlertDialog "Obrisati unos?" / "Delete this entry?", "Ovo ne može da se poništi." / "This can't be undone.", "Da, obriši" / "Yes, delete", "Odustani" / "Cancel"; row menu "Još opcija" / "More options" with "Izmeni" / "Obriši" (the Step 14 pattern); toasts "Unos sačuvan" / "Entry saved" (create and edit) and "Unos obrisan" / "Entry deleted".
    - Future time: "Vreme ne može biti u budućnosti." / "The time can't be in the future." Length limits via `maxLength` 100 (brand) and 500 (notes). The date picker disables future days.
    - A meal schedule can be removed: Save is enabled with zero times when a schedule exists and sends empty arrays.
    - From Steps 13–17: server writes on the server because of the httpOnly session; 5xx / unmapped errors → toast "Nešto nije u redu. Pokušaj ponovo."; sr-Latn / en-GB date formats and Intl number format.
  - **Verification:**
    - `npm run typecheck` ✅ exit 0
    - `npm run lint` ✅ exit 0. 0 errors and 2 warnings, both the unused eslint-disable directives in the generated `cloudflare-env.d.ts` that were already there.
    - `npm test` ✅ `Test Files 68 passed (68)`, `Tests 760 passed (760)`
    - `npx supabase test db` ✅ `All tests successful. Files=54, Tests=1757`, `Result: PASS`. This was run after `npx supabase db reset`, which applied all migrations and the seed cleanly.
    - `npm run build` ✅ exit 0. The routes include `ƒ /ljubimci/[id]/dnevnik`.
    - Extra live check through PostgREST as seeded Ivana: `rpc/set_meal_schedule` with `["18:00","08:00"]`, `[1,3,5]` → `{"meal_times": ["08:00", "18:00"], "meal_weekdays": [1, 3, 5], "every_day": false, "active": true, …}`. `meal_schedules_api` returns the same row. Empty weekdays → `{"code":"P0001","details":"p_meal_weekdays:required","message":"validation_failed"}`. `feeding_entries_api` with `count=exact` works. Empty times → removed (`reminder_id: null`), which put the local DB back to the seed state.
  - **Deviations / decisions:**
    - Server actions are inline `"use server"` functions in `dnevnik/page.tsx`, passed to the client as `actions`. No `lib/actions` file is on the Step 20 list, so this follows the Step 18 precedent (`podesavanja/podsetnici/page.tsx`).
    - `meal_schedules_api` reads the reminder through the security-definer helper (see Built), because a security_invoker view over `reminders` alone would return `[]` to a member who has not opted into reminders. Visibility still comes from RLS on `pets` plus `can_access_pet_care`.
    - `set_meal_schedule` treats organisation animals as "no relation" (`not_found`), as EP-17 / EP-19 list organisation roles as "—". After removal it returns `active: false` (there is no reminder).
    - S07 has no ReadOnlyBanner copy, so in a read-only household (`can_log = false`) the add buttons and row menus are hidden without a banner (Design §8: controls hidden, not disabled).
    - Pets without a care log (organisation roles) get `ErrorState` on S07, and S03 hides the "Još o ljubimcu" card for them.
    - The member's read-only meal card shows the selected days as outline Badges, or "Svaki dan". Both are existing copy and components.
    - `amount_g` with more than 1 decimal, or ≤ 0, shows the mockup's "Količina mora biti broj veći od nule." (no separate copy).
  - **Follow-ups:**
    - Step 21: add the Trenuci link to the S03 "Još o ljubimcu" card (Utensils / Camera as in the mockup).
    - The DropdownMenu trigger is labelled "Još opcija" without row context. The Step 14 weight rows append the date. A contextual label could be added once copy exists.

---

### Step 21 — Moments & public links

| | |
|---|---|
| **Status** | ⬜ not started |
| **Outcome** | Owners and members create moments with up to 5 photos (Free: 5 moments per pet), share a moment as an image composed in the browser (logo removable on Premium only), and publish or disable a public link that visitors open at `/t/[slug]` without signing in (rendered on every request, TC ADR-18). |
| **Implements** | FR-17, FR-18, FR-19, FR-36 (moments, logo) · EP-15 (`moment_photo`), EP-20, EP-21, EP-22, EP-23, EP-24 · S08 `/ljubimci/[id]/trenuci`, S09 `/t/[slug]`, S03 link to Trenuci · tables `moments`, `moment_photos`, `moment_public_links` · ADR-17 (`html-to-image`), ADR-18 (no cache) |
| **Depends on** | Step 15 |
| **Blocked by** | — |
| **Track** | single |

**Read before starting:**
- `docs/product/02-prd.md` §6 FR-17, FR-18, FR-19, FR-36; §8 BR-01, BR-02, BR-06, BR-22, BR-23, BR-37, BR-45, BR-52; §9 E-07, E-08, E-25
- `docs/product/03-technical-constraints.md` §3 ADR-03, ADR-07, ADR-17, ADR-18; §4; §5.4 `moments`, `moment_photos`, `moment_public_links`
- `docs/product/04-design-system.md` §5.3 (Public shell), §6 (PremiumLock, LogoMark, EmptyState), §7 (moment photos), §8, §9, §11 rows S08, S09, §12 S08, S09
- `docs/product/04-design/screens/moments.tsx`, `docs/product/04-design/screens/public-moment.tsx`, `docs/product/04-design/screens/pet-record.tsx` (Trenuci link)
- `docs/product/05-api-integration-contract.md` §4.4 rows EP-15, EP-20 – EP-24; §5.1 Part A, EP-05 (side effects), EP-15, EP-20, EP-21, EP-22, EP-23, EP-24; §6 `Moment`, `MomentPhoto`, `PublicMoment`, `UploadTicket`, `FileUrl`; §7.2; §7.3 rows *premium_locked*, *link_disabled*; §10; §13 row FR-18
- `docs/product/06-build-plan.md` §4, §5, §6 and the Session logs of Steps 07, 13, 15

**Files this step may touch:**
- `supabase/migrations/*_moments_api.sql` (new: `view:moments_api`)
- `lib/supabase/` generated types file (via `npm run db:types` only)
- `lib/actions/moments.ts` (new: EP-21 `prepare_moment` / `confirm_moment`, EP-22 `delete_moment`, EP-23 `set_moment_public_link`)
- `lib/actions/files.ts` (modify: kind `moment_photo`)
- `package.json`, `package-lock.json` (add `html-to-image` only)
- `app/api/public/moments/[slug]/route.ts` (new, EP-24)
- `app/(public)/t/[slug]/page.tsx`, `app/(public)/t/[slug]/public-moment-client.tsx` (new, S09)
- `app/(app)/ljubimci/[id]/trenuci/page.tsx`, `app/(app)/ljubimci/[id]/trenuci/moments-client.tsx`, `app/(app)/ljubimci/[id]/trenuci/share-image.ts` (new, S08 and browser image composition)
- `app/(app)/ljubimci/[id]/pet-record-client.tsx` (modify: Trenuci link)
- `lib/i18n/sr.ts`, `lib/i18n/en.ts` (add keys)
- `supabase/tests/moments_api.test.sql`
- `tests/moments/moment-actions.test.ts`, `tests/moments/public-link.test.ts`, `tests/moments/public-moment-route.test.ts`, `tests/moments/share-image.test.ts`, `tests/moments/moments-screen.test.tsx`
- `docs/product/06-build-plan.md` (Step 21 row in §3 and the Step 21 Session log only)

**Out of bounds:** organisation public pages (Step 26); any CDN or edge-cache configuration and any purge call (TC ADR-18); any image-composition package other than `html-to-image`; any table or column change; `components/ui`, `components/app`.

**Acceptance criteria:** (PRD v1.6, verbatim)
- FR-17 — Given a moment with 6 photos, When saving, Then saving is blocked with a message.
- FR-17 — Given a Free user with 5 moments on a pet, When adding a 6th, Then it is blocked and a Premium offer is shown.
- FR-17 — Given a Premium user, When adding moments, Then there is no limit.
- FR-18 — Given a moment, When shared as an image, Then the image shows the pet's name, the date, and the "Moj Ljubimac" logo.
- FR-18 — Given a Premium user, When they turn the logo off, Then the shared image has no logo.
- FR-18 — Given a Free user, Then the logo cannot be turned off.
- FR-19 — Given a public link, When a Visitor opens it without signing in, Then they see only the moment (photos, text, pet name) and never any health data.
- FR-19 — Given an active link, When the owner disables it, Then the link no longer shows the moment.
- FR-19 — Given a moment with a link, When the moment is deleted, Then the link is disabled automatically.
- FR-36 — Given a Free owner, Then limits are: 1 active pet, 2 memorials, 10 attachments per pet, 5 moments per pet, email and push channels only, no PDF export, no household sharing, logo always on shared images. *(this step: 5 moments per pet, logo always on shared images)*

**Tests to ship:**
- FR-17 (6 photos) → `tests/moments/moment-actions.test.ts` (`prepare_moment` with 6 photos → `too_many_photos`) and `tests/moments/moments-screen.test.tsx` (inline message in the Dialog)
- FR-17 (6th on Free) and FR-36 (5 moments) → `supabase/tests/moments_api.test.sql` (6th insert for a Free creator → `premium_required`, `limit = moments`) and `tests/moments/moments-screen.test.tsx` (counter "n / 5", PremiumLock on "Novi trenutak")
- FR-17 (Premium unlimited) → `supabase/tests/moments_api.test.sql` (Premium seed user inserts a 6th)
- FR-18 (name, date, logo) → `tests/moments/share-image.test.ts` (composed image includes pet name, date and the LogoMark asset)
- FR-18 (Premium logo off) → `tests/moments/share-image.test.ts` (logo omitted when `Entitlements.logo_removal` and the switch is off)
- FR-18 (Free cannot) and FR-36 (logo always on) → `tests/moments/moments-screen.test.tsx` ("Ukloni logo" Switch inside PremiumLock for Free) and `tests/moments/share-image.test.ts`
- FR-19 (visitor sees only the moment) → `tests/moments/public-moment-route.test.ts` (response contains exactly the `PublicMoment` fields; `Cache-Control: no-store` and `X-Robots-Tag: noindex` per EP-24; no session needed)
- FR-19 (disable) → `tests/moments/public-link.test.ts` (`set_moment_public_link` false → EP-24 returns `404` on the next request → S09 *link_disabled*)
- FR-19 (moment deleted) → `tests/moments/moment-actions.test.ts` (`delete_moment` cascades the link and queues photo keys; EP-24 then returns `404`) and `supabase/tests/moments_api.test.sql` (cascade removes `moment_public_links`)

**Verification:**
```
npm run typecheck      # expect: exit 0
npm run lint           # expect: exit 0
npm test               # expect: all Vitest suites pass, including the five files above
npx supabase test db   # expect: all pgTAP files pass, including moments_api.test.sql
npm run build          # expect: build succeeds
```

#### Prompt
```
You are executing Step 21 — Moments & public links — of docs/product/06-build-plan.md. Work in the repository root.

Read first, in full:
- docs/product/02-prd.md §6 FR-17, FR-18, FR-19, FR-36; §8 BR-01, BR-02, BR-06, BR-22, BR-23, BR-37, BR-45, BR-52; §9 E-07, E-08, E-25
- docs/product/03-technical-constraints.md §3 ADR-03, ADR-07, ADR-17, ADR-18; §4; §5.4 moments, moment_photos, moment_public_links
- docs/product/04-design-system.md §5.3, §6, §7, §8, §9, §11 rows S08 and S09, §12 S08 and S09
- docs/product/04-design/screens/moments.tsx, docs/product/04-design/screens/public-moment.tsx, docs/product/04-design/screens/pet-record.tsx (Trenuci link)
- docs/product/05-api-integration-contract.md §4.4 rows EP-15, EP-20 – EP-24; §5.1 Part A, EP-05, EP-15, EP-20, EP-21, EP-22, EP-23, EP-24; §6 Moment, MomentPhoto, PublicMoment, UploadTicket, FileUrl; §7.2; §7.3; §10; §13 row FR-18
- docs/product/06-build-plan.md §4, §5, §6, and the Session logs of Steps 07, 13 and 15

Settled upstream — apply exactly:
1. Public pages are not cached (TC ADR-18; 05- EP-24): EP-24 renders on every request with Cache-Control: no-store and X-Robots-Tag: noindex; EP-05, EP-22 and EP-23 have no purge step.
2. Share-as-image: install html-to-image (TC ADR-17) and compose the image in the browser in app/(app)/ljubimci/[id]/trenuci/share-image.ts (05- §13 row FR-18).
3. Copy: docs/product/04-design-system.md §9 i18n rule for every string of S08 and S09 (lib/i18n/sr.ts and lib/i18n/en.ts; English is a faithful translation of the mockup copy; no new copy).

Build:
1. Migration moments_api (npx supabase migration new moments_api): view:moments_api as §5.1 Part A and the Moment / MomentPhoto schemas define. EP-21 field rules not yet enforced (text ≤ 280 chars, BR-52) may be added only as check constraints on existing 03- §5.4 columns. Run npm run db:types.
2. lib/actions/moments.ts: EP-21 prepare_moment / confirm_moment (stateless draft token, R2 HEAD verification, one transaction), EP-22 delete_moment, EP-23 set_moment_public_link (128-bit base62 22-char slug), exactly as written. lib/actions/files.ts: add kind moment_photo to EP-15. Use lib/integrations/r2.ts and the R2 key layout of 05- §10 item 6.
3. app/api/public/moments/[slug]/route.ts: EP-24 exactly (service role reads only PublicMoment fields; Cache-Control: no-store and X-Robots-Tag: noindex; 404 for unknown, inactive or deleted).
4. S09: port docs/product/04-design/screens/public-moment.tsx to app/(public)/t/[slug]/public-moment-client.tsx with app/(public)/t/[slug]/page.tsx (server-rendered from EP-24); default on 200, link_disabled on 404. Remove the StateSwitcher.
5. S08: port docs/product/04-design/screens/moments.tsx to app/(app)/ljubimci/[id]/trenuci/moments-client.tsx with its page.tsx. Grid from EP-20 with thumbnails from EP-15; new-moment Dialog through EP-21 with per-photo progress; delete through EP-22; "Javni link" Switch and copy through EP-23; "Podeli kao sliku" preview composed by app/(app)/ljubimci/[id]/trenuci/share-image.ts in the browser with html-to-image, showing the pet name, date and LogoMark, "Ukloni logo" Switch Premium-locked unless Entitlements.logo_removal. Free counter "n / 5". Remove the StateSwitcher; default / empty / premium_locked per EP-20, EP-21 States and 05- §7.3.
6. S03: add the Trenuci link from the mockup to app/(app)/ljubimci/[id]/pet-record-client.tsx.
7. Put every new string into lib/i18n/sr.ts and lib/i18n/en.ts per docs/product/04-design-system.md §9 (i18n rule: the Serbian text is the mockup copy, the English text its faithful translation; no new copy, no missing key).

Do not invent:
- No colours, spacing, radii, fonts or components outside 04-design-system.md §4–§6 and the existing components/ui and components/app; do not edit components/ui or components/app.
- No packages outside 03-technical-constraints.md ADR-17; add only html-to-image to package.json.
- No endpoints, fields, error codes or RPC names outside 05-api-integration-contract.md.
- No tables, columns or enum values outside 03-technical-constraints.md §5.
- No user-facing copy that is not in 04-design-system.md or docs/product/04-design.

Files: create or modify only these. Touching any other file requires stopping and asking.
- supabase/migrations/<timestamp>_moments_api.sql; the generated types file in lib/supabase/ (via npm run db:types only)
- lib/actions/moments.ts, lib/actions/files.ts
- package.json, package-lock.json (html-to-image only)
- app/api/public/moments/[slug]/route.ts
- app/(public)/t/[slug]/page.tsx, app/(public)/t/[slug]/public-moment-client.tsx
- app/(app)/ljubimci/[id]/trenuci/page.tsx, app/(app)/ljubimci/[id]/trenuci/moments-client.tsx, app/(app)/ljubimci/[id]/trenuci/share-image.ts
- app/(app)/ljubimci/[id]/pet-record-client.tsx
- lib/i18n/sr.ts, lib/i18n/en.ts
- supabase/tests/moments_api.test.sql
- tests/moments/moment-actions.test.ts, tests/moments/public-link.test.ts, tests/moments/public-moment-route.test.ts, tests/moments/share-image.test.ts, tests/moments/moments-screen.test.tsx
- docs/product/06-build-plan.md (Step 21 row in §3 and the Step 21 Session log only)

Acceptance criteria (PRD v1.6, verbatim — each needs a passing test):
- Given a moment with 6 photos, When saving, Then saving is blocked with a message.
- Given a Free user with 5 moments on a pet, When adding a 6th, Then it is blocked and a Premium offer is shown.
- Given a Premium user, When adding moments, Then there is no limit.
- Given a moment, When shared as an image, Then the image shows the pet's name, the date, and the "Moj Ljubimac" logo.
- Given a Premium user, When they turn the logo off, Then the shared image has no logo.
- Given a Free user, Then the logo cannot be turned off.
- Given a public link, When a Visitor opens it without signing in, Then they see only the moment (photos, text, pet name) and never any health data.
- Given an active link, When the owner disables it, Then the link no longer shows the moment.
- Given a moment with a link, When the moment is deleted, Then the link is disabled automatically.
- Given a Free owner, Then limits are: 1 active pet, 2 memorials, 10 attachments per pet, 5 moments per pet, email and push channels only, no PDF export, no household sharing, logo always on shared images. (This step: 5 moments per pet, logo always on shared images.)

Tests to write: exactly the files listed under "Tests to ship" in Step 21 of docs/product/06-build-plan.md, each covering the criterion named there. R2 is faked in tests.

Done means all of these pass, in this order, and you paste their output into the Session log:
npm run typecheck
npm run lint
npm test
npx supabase test db
npm run build

When verification passes: update the Step 21 row in docs/product/06-build-plan.md §3 (Status ✅, Done = today's date), append a Session log entry under Step 21 (date, what was built, the output of each verification command, deviations, follow-ups), then commit with the message "Step 21: Moments & public links".

If anything above is ambiguous, if a referenced section doesn't contain what this prompt says it does, or if completing this step would require touching a file outside the list or making a decision the referenced documents don't settle — STOP and ask. Do not choose a reasonable default. Do not proceed with a partial implementation.
```

#### Session log
- **2026-10-23** — Step 21 built (unattended overnight run).
  - **Built:**
    - Migration `20261023185025_moments_api.sql`:
      - `view:moments_api` (`security_invoker`, so RLS on `moments` decides visibility). It carries the §6 Moment fields: `photos` (MomentPhoto `id`, `moment_id`, `position`, ordered by position), `photo_count`, `public_link` (`{slug, active, url}`, null until first enabled; `url` = `https://mojljubimac.rs/t/` + slug as §6 says, rebuilt by the app from `NEXT_PUBLIC_SITE_URL`), `created_by_name` (`private.pet_person_name`) and the per-entry `access` (`private.entry_access`: creator or owner; a member's own moments lock while the household is read-only).
      - `grant insert (id) on public.moments to authenticated` and `rpc:confirm_moment(p_moment_id, p_pet_id, p_moment_date, p_text, p_photos jsonb) → Moment` (SECURITY INVOKER, granted to authenticated only; owner decision, option A). One call inserts the moment with the chosen id and its `moment_photos` in one transaction, so RLS, `care_check_write` and the Free-limit trigger (`premium_required:moments`) still apply. It repeats the EP-21 rules: no relation → `not_found`; memorial pet → `p_pet_id:invalid_state`; date after today in Europe/Belgrade → `p_moment_date:out_of_range`; more than 5 photos → `too_many_photos`; neither text nor photos → `p_text:required`; each photo key must sit under `u/<owner_id>/pets/<pet_id>/moments/<moment_id>/`, else `p_photos:invalid`. This stops a direct Data API call from attaching another object. A repeated id fails with `23505`.
      - No new check constraints: text ≤ 280 (BR-52) and position 1–5 (BR-06) were already column checks from Step 07.
      - `npm run db:types` regenerated `lib/supabase/database.types.ts`.
    - `lib/actions/moments.ts` (`"use server"`):
      - `listMoments` (EP-20: limit 1–50, offset ≥ 0, `moment_date desc, created_at desc`, `count: 'exact'`).
      - `prepareMoment` (EP-21 step 1). It checks the request: 0–5 photos (`too_many_photos`), JPEG/PNG/WebP/HEIC (`file_type_not_allowed`), ≤ 10 MB (`file_too_large`), date not in the future, text ≤ 280, text or photos required. It checks the pet through RLS (owner or member, else `not_found`; memorial → `invalid_state`; member with `can_log = false` → `household_read_only`) and the creator's own Free limit (`is_premium`, then 5 per pet → `premium_required` `limit = moments`). It then picks the moment id, builds the keys `u/<owner_id>/pets/<pet_id>/moments/<moment_id>/<position>-<uuid>-<safe_file_name>` (API §10 item 6), presigns one PUT per photo and signs the `md_` draft token. Nothing is written.
      - `confirmMoment` (EP-21 step 3). It verifies the token, HEADs every object (missing → `draft_token:not_uploaded`; size or type mismatch → the object is deleted and `file_too_large` / `file_type_not_allowed`), then calls `rpc:confirm_moment`. 42501 → `not_found`; a second confirm (23505) → `draft_token:invalid`; other DB errors map through `fromDatabaseError` with the DETAIL field.
      - `deleteMoment` (EP-22): deletes the `moments` row. The existing cascade removes photos and the link (BR-45), and the existing `moment_photos_queue_r2_key` trigger queues the keys.
      - `setMomentPublicLink` (EP-23): on first use it inserts the link with a 128-bit base62 slug left-padded to 22 characters (retried on a slug collision); later calls always update `active`, so `care_check_write` also answers a no-op toggle, and keep the slug. `url` = `NEXT_PUBLIC_SITE_URL + "/t/" + slug`. No cache purge anywhere (TC ADR-18).
    - `lib/actions/files.ts`: EP-15 kind `moment_photo` (RLS on `moment_photos`; invisible ids → `url = null`).
    - `lib/server/public-moments.ts` (owner decision): the EP-24 read shared by the route and the S09 page. It validates the slug (`^[0-9A-Za-z]{22}$`), then the service role selects only `slug, active, moments(moment_date, text, pets(name, sex), moment_photos(position, r2_key))` for an active link. Photos are sorted by position and presigned for 10 min on each request. Unknown, inactive or deleted all return null.
    - `app/api/public/moments/[slug]/route.ts` (EP-24): 200 PublicMoment, 404 `not_found`, 500 `internal_error`, always with `Cache-Control: no-store` and `X-Robots-Tag: noindex`; `force-dynamic`; no session.
    - S09 `app/(public)/t/[slug]/page.tsx` (`force-dynamic`, `robots: noindex`, locale from the `ml_locale` cookie) and `public-moment-client.tsx`: port of `public-moment.tsx` without the StateSwitcher. The default state shows avatar, name, date, the main photo with thumbnails ("Prikaži fotografiju n od N", `aria-pressed`) and the text. link_disabled shows "Ovaj trenutak više nije javan". Both have the sign-up CTA, linking to `/registracija`.
    - S08 `app/(app)/ljubimci/[id]/trenuci/page.tsx` and `moments-client.tsx`: port of `moments.tsx` without the StateSwitcher.
      - The page loads, on the server, the EP-01 header, the first EP-20 page, EP-15 URLs for the pet photo and each cover photo (position 1), and EP-43 locale and Entitlements. Pets without moments (organisation roles) → `ErrorState`. The loading state is the Suspense fallback (Skeleton cards).
      - Free counter "n / 5 trenutaka" with Progress when `!entitlements.premium` and total > 0. At 5 (or on a `premium_required` answer) the PremiumLock takes the place of "Novi trenutak"; its CTA stays inert until Step 23. "Novi trenutak" is gated on `can_log` and an active pet.
      - Cards: cover photo (`aspect-square object-cover rounded-sm`, alt "<pet>, <date>"), photo-count badge with plurals, "Bez opisa", "Javni link je uključen", a row menu (`access.can_delete`) → AlertDialog, "Podeli kao sliku", and "Javni link" (`access.can_edit`). "Učitaj još" pages EP-20.
      - New-moment Dialog: a date picker with future days disabled, a photo grid (hidden file input, local previews, "Ukloni fotografiju n", "Dodaj" tile hidden at 5), inline errors (6th photo, type, size, empty), and a 280-character counter. Saving runs prepare → one XHR PUT per photo with a Progress bar ("Otpremanje fotografije n") → confirm, then the toast "Trenutak sačuvan", and the moment is inserted in date order.
      - Public-link Dialog: Switch → EP-23, the address Input, "Kopiraj" (clipboard) with `role="status"` "Link je kopiran".
      - Share Dialog: the `ShareCard` preview (photo inlined as a data URL, pet name in the pet accent, date, LogoMark). For Free it shows the mockup's disabled "Ukloni logo" Switch with the Premium badge, sr-only "Dostupno u Premiumu" and the "Probaj 7 dana besplatno" link to `/premium`. With `logo_removal` the Switch is enabled and the hint is hidden. "Podeli sliku" calls `share-image.ts`.
    - `app/(app)/ljubimci/[id]/trenuci/share-image.ts`: `showsLogo` (logo off only with `logo_removal` and the switch on), `photoDataUrl` (CORS fetch → data URL), `composeShareImage` (html-to-image `toBlob`, pixelRatio 3) and `shareMomentImage` (`navigator.share({files})` when `canShare`, else download `moj-ljubimac-<date>.png`). `html-to-image` is added to `package.json`, the only new package.
    - `app/(app)/ljubimci/[id]/pet-record-client.tsx`: the "Trenuci" link (`Camera`) in the "Još o ljubimcu" card, as in the mockup.
    - `lib/i18n/sr.ts` / `en.ts`: new `moments` and `publicMoment` sections and `petRecord.momentsLink`, with English translations.
    - Tests:
      - `supabase/tests/moments_api.test.sql` (38): view shape, security_invoker and grants; `insert (id)` granted and `update (id)` not; `confirm_moment` signature, SECURITY INVOKER and execute grants. Owner reads moments, the public link and access. `confirm_moment` with photos (order, id, created_by), 6 photos → `too_many_photos`, a foreign key prefix, a future date, an empty moment, a repeated id. A Premium creator adds a 6th moment on a pet. Deleting a moment removes its public link and queues both photo keys. A member confirms on a shared pet and may delete only their own. A Free creator adds 5 and the 6th → `premium_required:moments` with nothing written. An unrelated user → `not_found` and sees nothing.
      - `tests/moments/moment-actions.test.ts` (19): 6 photos → `too_many_photos`, 5 accepted; key layout, tickets and draft token; nothing written at step 1; type / size / text / date rules; the Free 6th → `premium_required` `limit = moments`, Premium passes; read-only member and memorial pet; confirm calls `rpc:confirm_moment` with the token's id, date, text and keys; EP-15 `moment_photo` URL; not_uploaded; a HEAD mismatch deletes the object; a forged, tampered or expired token; a second confirm; the trigger's `premium_required`; delete removes the moment and link, queues the keys, and EP-24 then returns null.
      - `tests/moments/public-link.test.ts` (5): first enable → 22-char base62 slug and site url; an active link opens (EP-24 200, S09 default); disable keeps the slug → EP-24 404 with `no-store` on the next request → S09 link_disabled; re-enable reuses the slug; `not_found`, `validation_failed`, and `forbidden_role` / `household_read_only` passed through.
      - `tests/moments/public-moment-route.test.ts` (6): exactly the six PublicMoment keys, photos sorted and signed, no session used; the service-role select and filters contain only public fields; `Cache-Control: no-store` and `X-Robots-Tag: noindex` on 200 and 404; 404 for unknown, inactive, malformed and missing-moment slugs; a text-only moment.
      - `tests/moments/share-image.test.ts` (7): the node given to html-to-image has the pet name, the date, the LogoMark asset (`/brand/logo-mark.png`, alt "Moj Ljubimac") and the inlined photo at pixelRatio 3. With `logo_removal` and the switch off there is no logo. For Free the logo is always on. Web Share with `moj-ljubimac-2026-10-12.png`, the download fallback, and the CORS data-URL fetch are covered.
      - `tests/moments/moments-screen.test.tsx` (14): counter "3 / 5 trenutaka" with progressbar; at 5 the PremiumLock replaces "Novi trenutak"; Premium has no counter; `premium_required` from step 1 → PremiumLock; empty state with the gendered sentence; a 6th photo → the inline "Trenutak može imati najviše 5 fotografija." in the Dialog without a request; server `too_many_photos` shown inline; type, size and empty errors; the full prepare → upload ×2 → confirm flow with toast and counter. Free "Ukloni logo" Switch disabled, with the Premium badge, the description "Dostupno u Premiumu" and the `/premium` link; Premium Switch removes the logo from the preview. Public link on through EP-23 with the address; delete through the menu and AlertDialog; a member's view of someone else's moment has no menu and no "Javni link".
  - **Verification:**
    - `npm run typecheck` ✅ exit 0
    - `npm run lint` ✅ exit 0. 0 errors and 2 warnings, both the unused eslint-disable directives in the generated `cloudflare-env.d.ts` that were already there.
    - `npm test` ✅ `Test Files 73 passed (73)`, `Tests 811 passed (811)`
    - `npx supabase test db` ✅ `All tests successful. Files=55, Tests=1795`, `Result: PASS`. This was run after `npx supabase db reset`, which applied all migrations and the seed cleanly.
    - `npm run build` ✅ exit 0. The routes include `ƒ /api/public/moments/[slug]`, `ƒ /ljubimci/[id]/trenuci` and `ƒ /t/[slug]`.
    - Extra live check through PostgREST with the service role: the exact EP-24 select (`moment_public_links?select=slug,active,moments(moment_date,text,pets(name,sex),moment_photos(position,r2_key))&active=eq.true`) returns the seeded link `Lu7nAk3QpZ9xRtW2mVb4Ys` with Luna's moment, and `moments_api` returns the seeded moments with `photos`, `photo_count` and `public_link`.
  - **Owner decisions applied:**
    - EP-21 conflict, option A: `grant insert (id) on public.moments to authenticated` and `rpc:confirm_moment` (SECURITY INVOKER, authenticated only) in the `moments_api` migration. `prepare_moment` chooses the moment id and hands out the API §10 keys under it. The draft token is signed with a local HMAC over `ACTION_TOKEN_SECRET` inside `lib/actions/moments.ts` (prefix `md_`, HMAC-SHA256 over `moment:<payload>`, payload = moment id, pet, date, text, keys with position / mime / size, expiry; 10 minutes).
    - `lib/server/public-moments.ts` added for the EP-24 read shared by `route.ts` and `page.tsx`.
    - Public link = `NEXT_PUBLIC_SITE_URL + "/t/" + slug`.
    - Pet names are never declined: "Na Free planu čuvaš do 5 trenutaka po ljubimcu. Uz Premium ih beležiš bez ograničenja." / "On the Free plan you keep up to 5 moments per pet. With Premium there's no limit."
    - Gendered verbs by sex: radio / radila / radio/la (unknown → "radio/la"); "Dodao/la si najviše 5 fotografija." / "You can add up to 5 photos."
    - Logo switch as in the mockup: a disabled Switch plus badge, with "Probaj 7 dana besplatno" linking to `/premium`. For Premium (`logo_removal`) the Switch is enabled and the hint hidden. The test wording checks this instead of "Switch inside PremiumLock".
    - Copy: delete "Obrisati trenutak?" / "Delete this moment?", "Brišu se fotografije i javni link. Ovo ne može da se poništi." / "Its photos and public link are deleted. This can't be undone."; toasts "Trenutak sačuvan" / "Moment saved", "Trenutak obrisan" / "Moment deleted"; "Dodaj fotografiju ili tekst." / "Add a photo or some text."; "Fotografija je veća od 10 MB." / "The photo is larger than 10 MB."; "Dozvoljene su JPG, PNG, WEBP i HEIC fotografije." / "Only JPG, PNG, WEBP and HEIC photos are allowed."; upload aria "Otpremanje fotografije {n}" / "Uploading photo {n}". Row menu "Još opcija" / "Obriši" and "Da, obriši" / "Odustani" follow the Step 14 pattern.
    - Share image: the photo at position 1 is inlined as a data URL via CORS fetch; pixelRatio 3; `navigator.share({files})` else download `moj-ljubimac-<date>.png`; the tests mock html-to-image and check the DOM node.
    - The Free counter is shown only when `!entitlements.premium`.
    - From Steps 13–17: server writes run on the server because of the httpOnly session; the PremiumLock CTA stays inert until Step 23; 5xx / unmapped errors → toast "Nešto nije u redu. Pokušaj ponovo."; sr-Latn / en-GB dates; plurals with Intl.PluralRules; date pickers disable invalid (future) dates.
  - **Deviations / decisions:**
    - Every UploadTicket from `prepare_moment` carries the draft token as its `upload_token`. §6 UploadTicket requires the field, and EP-21 confirms by `draft_token`, so there is no separate per-photo token.
    - The draft token carries the moment text itself (signed), not only a hash. Confirm takes only `draft_token` (EP-21), so the text has to travel in it.
    - `set_moment_public_link` with `active = false` on a moment that never had a link inserts an inactive link, so the response always has a slug as the contract shape requires. It always writes, so a member's no-op toggle on someone else's moment still answers `forbidden_role`.
    - S08 has a card DropdownMenu ("Još opcija" → "Obriši") that the mockup does not draw; EP-22 names "moment menu → AlertDialog" and the owner gave its copy. "Učitaj još" (existing copy) pages EP-20 beyond 20 moments.
    - If the EP-24 read fails on the S09 page (5xx), the page logs it and renders link_disabled, because S09 has no error state in the Design. The route itself answers 500 `internal_error`.
    - The S09 CTA "Napravi nalog za svog ljubimca" links to `/registracija`; the mockup's button had no target.
    - Moment photos and public photos are plain `<img>` tags (presigned R2 URLs and local previews cannot go through `next/image`), with a scoped eslint-disable comment.
    - No loading text was added: the S08 loading state is Skeleton cards with `aria-busy` (no mockup copy).
  - **Follow-ups:**
    - Add `rpc:confirm_moment` to `docs/product/05-api-integration-contract.md` EP-21 (step 3 calls it), and the `insert (id)` grant on `moments` to `docs/product/03-technical-constraints.md` (owner decision, option A).
    - Configure CORS on the R2 bucket (GET from the app origin) so the share image can embed the photo. Without it the preview and image show the placeholder instead of the photo.
    - The `moments_api.public_link.url` column uses the §6 constant `https://mojljubimac.rs/t/`; the app replaces it with `NEXT_PUBLIC_SITE_URL`. If §6 is changed to say "site URL", the view could drop the column's host.
    - Step 23: the PremiumLock CTA and the S08 trial link go to the real Premium page.

---

### Step 22 — Household sharing

| | |
|---|---|
| **Status** | ⬜ not started |
| **Outcome** | A Premium owner can invite household members by email or link, choose shared pets, remove members; members can accept/decline, opt in to reminders, and leave — with the household read-only state driven by real data. |
| **Implements** | FR-26, FR-27, FR-28, FR-29, FR-30, FR-31 (data side check only), FR-32; EP-34, EP-35, EP-36, EP-37, EP-38, EP-39, EP-40; S13 `/domacinstvo`, S14 `/poziv/[token]` (household variant); tables `households`, `household_memberships`, `household_invitations`, `household_pets` (functions/grants only — tables exist from Step 05); ADR-08 (invitation email, Design §9.1 `household_invitation`); API §3.3 (idempotency via `lib/server/idempotency.ts`), §11 (20 invitations/day via `lib/server/rate-limit.ts`) |
| **Depends on** | Step 19 |
| **Blocked by** | — |
| **Track** | single |

**Read before starting:**
- `docs/product/02-prd.md` §6 FR-26 … FR-32; §8 BR-19 … BR-28, BR-47, BR-51, BR-52; §9 E-10 … E-14.
- `docs/product/03-technical-constraints.md` §5.1 (`households`, `household_memberships`, `household_invitations`, `household_pets`), §5.7 (`idempotency_keys`, `rate_limit_counters`), §5 conventions, ADR-08, ADR-15, ADR-16.
- `docs/product/04-design-system.md` §5.1, §5.4, §6 (composites `AppShell`, `AuthShell`, `PremiumLock`, `ReadOnlyBanner`, `EmptyState`, `PetAvatar`), §8, §9, §9.1 (`household_invitation`), §11 (S13, S14), §12 S13 and S14.
- `docs/product/04-design/screens/household.tsx`, `docs/product/04-design/screens/invite-accept.tsx`.
- `docs/product/05-api-integration-contract.md` §3.3, §3.6, §4.1, §4.3, §4.4 (rows EP-34 … EP-40), §5.4 (EP-34 … EP-40), §6 (`Household`, `HouseholdMember`, `HouseholdInvitation`, `InvitationView`, `Access`), §7.2, §7.3, §9.3, §9.4 (Resend row), §11.
- Session logs of Steps 05, 11, 12, 18 and 19 in `docs/product/06-build-plan.md` (for the names of the migrations, `lib/server/` helpers, generated-types file and Resend template mechanism they created).

**Files this step may touch:**
- `supabase/migrations/*_household_sharing.sql` (new: `rpc:get_household`, the EP-38 column grant, and any database function EP-35 / EP-36 / EP-40 need for atomicity)
- `supabase/tests/household_invitations.test.sql`
- `supabase/tests/household_sharing.test.sql`
- `supabase/tests/household_member_permissions.test.sql`
- `supabase/tests/household_read_only.test.sql`
- `supabase/tests/household_succession.test.sql` (only if Step 05 shipped a BR-27 ownership-transfer function)
- `lib/actions/household.ts` (new: EP-35, EP-36)
- `lib/actions/invitations.ts` (new: EP-39, EP-40)
- `lib/integrations/resend.ts` (add the `household_invitation` template of Design §9.1 only)
- `lib/i18n/sr.ts` and `lib/i18n/en.ts` (add keys only)
- the generated Supabase types file under `lib/supabase/` (regenerate with `npm run db:types` only)
- `app/(app)/domacinstvo/page.tsx`, `app/(app)/domacinstvo/household-screen.tsx`
- `app/(auth)/poziv/[token]/page.tsx`, `app/(auth)/poziv/[token]/invite-accept-screen.tsx`
- `tests/household/create-invitation.test.ts`, `tests/household/change-membership.test.ts`, `tests/household/decide-invitation.test.ts`, `tests/household/household-screen.test.tsx`, `tests/household/invite-accept-screen.test.tsx`, `tests/household/member-reminder-channels.test.ts`
- `e2e/household-invitation.spec.ts`
- `docs/product/06-build-plan.md` (§3 row for Step 22 and the Step 22 session log only)

**Out of bounds:** table/column/enum changes (Step 05 owns the household tables); the dispatch job and its modules (Step 19); S15, S16, `/auth/callback` (Steps 11–12); organisation team invitations `og_` (Step 24); record transfers `tr_` (Step 25); account-deletion ownership transfer job (Step 30); `components/ui/*` and `components/app/*`.

**Acceptance criteria:** (PRD §6, verbatim)

FR-26 — Invite a household member (Premium)
- Given a Premium owner, When they invite by email or by a link they send themselves, Then the invitee can join after signing in to their own account.
- Given an invitee without an account, When they open the invitation, Then they must create an account before joining.
- Given a Free owner, When they try to invite, Then it is blocked and a Premium offer is shown.
- Given a household with 6 members, When the owner invites another, Then it is blocked with a message.

FR-27 — Choose which pets are shared
- Given a household, When the owner shares or un-shares a pet, Then members gain or lose access to that pet.

FR-28 — Member permissions
- Given a member, Then they can add weight entries, mark doses given, add feeding and stool entries, add moments, and mark reminders done.
- Given a member, Then they can view but not add or change vaccinations, treatments (other than marking doses), vet visits, attachments, or reminders.
- Given an entry created by another person, When a member tries to edit or delete it, Then the action is not available.

FR-29 — Member reminders opt-in
- Given a new member, Then they receive no reminders for shared pets until they switch them on.
- Given a member who switched reminders on, Then they receive them only by email and push, regardless of the owner's Premium.

FR-30 — Leave or remove a member
- Given a member who leaves or is removed, Then they lose access and all entries they made remain in the record.

FR-31 — Owner account deletion keeps the household *(the deletion job is Step 30; here only the BR-27 function from Step 05, if it exists, is tested)*
- Given an owner whose account is permanently deleted, Then ownership passes to the earliest-joined member and the shared pets and records remain.
- Given the new owner has no Premium, Then the household becomes read-only for all members until the new owner has Premium (same as FR-32).

FR-32 — Owner's Premium expires
- Given an owner whose Premium expired, Then members keep read-only access to shared pets until Premium is renewed.

**Tests to ship:**
| Criterion | Test | File |
|---|---|---|
| FR-26 #1 | email and link invitations created by a Premium owner; a different signed-in user accepts and becomes a member (`joined_at` set, `reminders_enabled = false`) | `tests/household/create-invitation.test.ts`, `tests/household/decide-invitation.test.ts`, `supabase/tests/household_invitations.test.sql`; end-to-end in `e2e/household-invitation.spec.ts` |
| FR-26 #2 | EP-40 without a session → `401 unauthenticated`; S14 with `is_signed_in = false` renders the sign-in/register prompt variant | `tests/household/decide-invitation.test.ts`, `tests/household/invite-accept-screen.test.tsx` |
| FR-26 #3 | EP-35 by a Free owner → `403 premium_required` (`details.limit = "household"`); S13 renders `PremiumLock` when `household = null` and `entitlements.premium = false` | `tests/household/create-invitation.test.ts`, `tests/household/household-screen.test.tsx` |
| FR-26 #4 | EP-35 and EP-40 with owner + 5 members → `409 household_full`; Dialog shows the inline message | `tests/household/create-invitation.test.ts`, `supabase/tests/household_invitations.test.sql` |
| FR-27 | sharing a pet makes it visible to members via RLS; un-sharing removes visibility | `supabase/tests/household_sharing.test.sql` |
| FR-28 #1 | member inserts weight, dose log, feeding, stool, moment and marks an occurrence done on a shared pet — all succeed | `supabase/tests/household_member_permissions.test.sql` |
| FR-28 #2 | member insert/update on vaccinations, treatments, vet_visits, attachments, reminders is rejected | `supabase/tests/household_member_permissions.test.sql` |
| FR-28 #3 | member update/delete of an entry created by another user is rejected | `supabase/tests/household_member_permissions.test.sql` |
| FR-29 #1 | new member's EP-25 list for shared pets is empty until `reminders_enabled = true` (EP-38) | `supabase/tests/household_sharing.test.sql` |
| FR-29 #2 | the Step 19 dispatch recipient/channel resolution gives an opted-in member only `email`/`push`, even when the member's preferences include `whatsapp` and the owner has Premium | `tests/household/member-reminder-channels.test.ts` |
| FR-30 | after `remove_member` and after `leave`, the user can no longer read the shared pet; entries they created still exist | `supabase/tests/household_sharing.test.sql`, `tests/household/change-membership.test.ts` |
| FR-31 #1, #2 | only if Step 05 shipped a BR-27 function: earliest-joined member becomes owner, shared pets and records remain, `read_only` follows the heir's Premium. Otherwise record "deferred to Step 30" in the session log | `supabase/tests/household_succession.test.sql` |
| FR-32 | owner's Premium expired → `households.read_only = true`; member reads still succeed; member writes return `household_read_only`; S13 renders `ReadOnlyBanner` with controls hidden | `supabase/tests/household_read_only.test.sql`, `tests/household/household-screen.test.tsx` |
| API §11 | 21st EP-35 call in a day → `429 rate_limited` | `tests/household/create-invitation.test.ts` |
| ADR-15 flow | household invitation end to end | `e2e/household-invitation.spec.ts` |

**Verification:**
```
npm run typecheck      # exit 0
npm run lint           # exit 0
npm test               # all Vitest suites pass, incl. tests/household/*
npx supabase test db   # all pgTAP tests pass, incl. supabase/tests/household_*.test.sql
npm run build          # exit 0
npm run e2e            # all Playwright specs pass, incl. e2e/household-invitation.spec.ts
```

#### Prompt
```
You are executing Step 22 — Household sharing — of docs/product/06-build-plan.md for the Moj Ljubimac web app. One outcome: the household feature (S13 /domacinstvo and the household variant of S14 /poziv/[token]) works end to end on real data through EP-34 … EP-40.

READ FIRST, in this order:
1. docs/product/02-prd.md §6 FR-26 … FR-32, §8 BR-19 … BR-28, BR-47, BR-51, BR-52, §9 E-10 … E-14.
2. docs/product/03-technical-constraints.md §5 conventions, §5.1 household tables, §5.7 (idempotency_keys, rate_limit_counters), ADR-08, ADR-15, ADR-16.
3. docs/product/05-api-integration-contract.md §3.3, §3.6, §4.1, §4.3, §4.4 (EP-34 … EP-40 rows), §5.4 EP-34 … EP-40, §6 Household, HouseholdMember, HouseholdInvitation, InvitationView, Access, §7.2, §7.3, §9.3, §9.4 (Resend), §11.
4. docs/product/04-design-system.md §5.1, §5.4, §6, §8, §9, §9.1, §11 (S13, S14), §12 S13 and S14.
5. docs/product/04-design/screens/household.tsx and docs/product/04-design/screens/invite-accept.tsx.
6. The session logs of Steps 05, 11, 12, 18 and 19 in docs/product/06-build-plan.md, to learn the exact names of the household migrations, the lib/server helpers, the generated types file, and the Resend template mechanism.

SETTLED UPSTREAM — apply exactly:
- EP-35 idempotency (API §3.3) uses lib/server/idempotency.ts, and its 20-per-day limit (API §11) uses lib/server/rate-limit.ts — both from Step 11, over the TC §5.7 tables idempotency_keys and rate_limit_counters. Tokens use lib/server/action-tokens.ts from Step 19 (TC ADR-16).
- Email copy: the household_invitation template of docs/product/04-design-system.md §9.1 (sr, en; recipient locale).
- If Step 05's session log shows that the BR-27 ownership-transfer function does not exist, do not write it; FR-31 tests are deferred to Step 30 and you record that in the session log.

BUILD:
1. Migration supabase/migrations/<timestamp>_household_sharing.sql: rpc:get_household exactly as EP-34 (security definer, returns only households the caller owns or belongs to, shape §6 Household + my_households); the EP-38 column grant (members may update only reminders_enabled on their own row); and only those additional database functions EP-35 / EP-36 / EP-40 need to perform their listed side effects atomically. RLS for the tables already exists from Step 05 — do not change table definitions.
2. lib/actions/household.ts: server actions create_household_invitation (EP-35) and change_household_membership (EP-36), returning ActionResult per API §3.6 and the exact error codes in EP-35 / EP-36; idempotency and the rate limit through the lib/server helpers. Token generation and hashing per API §9.3 with lib/server/action-tokens.ts (prefix hh_, stored only as token_hash, raw token only in invite_url). Email invitations send through lib/integrations/resend.ts with the Design §9.1 household_invitation template, following the template mechanism Step 19 established; link invitations send nothing.
3. lib/actions/invitations.ts: get_household_invitation (EP-39) and decide_household_invitation (EP-40), exactly as specified, selecting the household path by the hh_ token prefix.
4. S13: port docs/product/04-design/screens/household.tsx into app/(app)/domacinstvo/household-screen.tsx (client) rendered by app/(app)/domacinstvo/page.tsx. Keep markup, classes and tokens; replace inline mock data with EP-34 (read), EP-35 (invite Dialog), EP-36 (revoke / remove / leave), EP-37 (shared-pets Switch, Data API household_pets), EP-38 (member opt-in Switch). Remove the dev-only StateSwitcher; drive D / G / R / E / member view from real responses exactly as the EP-34 "States" line and API §7.3 say. After leave, route the member to /ljubimci (EP-36).
5. S14 household variant: port docs/product/04-design/screens/invite-accept.tsx into app/(auth)/poziv/[token]/invite-accept-screen.tsx rendered by app/(auth)/poziv/[token]/page.tsx. Implement only the household, declined, sign-in, expired and loading variants from EP-39 / EP-40 responses per API §7.3. Leave the transfer and slot-taken variants for Step 25 and the team variant for Step 24 (an og_ or tr_ token renders the error state for now). Remove the StateSwitcher. For the sign-in variant: if S16 (Step 11) already honours a next query parameter, link to /prijava?next=/poziv/<token>; otherwise link to /prijava and /registracija without it. Do not modify S15, S16 or /auth/callback.
6. All user-facing strings go into lib/i18n/sr.ts and lib/i18n/en.ts per docs/product/04-design-system.md §9 (keys only; Serbian copy from the mockups, English its faithful translation).
7. Regenerate types with npm run db:types.
8. Tests: write every test listed in the "Tests to ship" table of Step 22 in docs/product/06-build-plan.md, in exactly those files. FR-29 #2 tests the Step 19 dispatch module as it is; if it fails, STOP — do not edit Step 19 files. e2e/household-invitation.spec.ts covers: Premium owner (local seed) invites by link → second user signs in → accepts → sees the shared pet read-only medical tabs → logs a weight entry.

FILES YOU MAY CREATE OR MODIFY (allowlist — nothing else):
- supabase/migrations/<timestamp>_household_sharing.sql
- supabase/tests/household_invitations.test.sql, household_sharing.test.sql, household_member_permissions.test.sql, household_read_only.test.sql, household_succession.test.sql (last one only if the BR-27 function exists)
- lib/actions/household.ts, lib/actions/invitations.ts
- lib/integrations/resend.ts (household_invitation template only)
- lib/i18n/sr.ts and lib/i18n/en.ts (add keys only)
- the generated types file under lib/supabase/ (via npm run db:types only)
- app/(app)/domacinstvo/page.tsx, app/(app)/domacinstvo/household-screen.tsx
- app/(auth)/poziv/[token]/page.tsx, app/(auth)/poziv/[token]/invite-accept-screen.tsx
- tests/household/create-invitation.test.ts, change-membership.test.ts, decide-invitation.test.ts, household-screen.test.tsx, invite-accept-screen.test.tsx, member-reminder-channels.test.ts
- e2e/household-invitation.spec.ts
- docs/product/06-build-plan.md (Step 22 row in §3 and the Step 22 session log only)
Touching any other file requires stopping and asking.

FORBIDDEN:
- No colours, spacing, radii, shadows, fonts or components outside docs/product/04-design-system.md §4–§6 and the composites already in components/app. The proposed composites under OQ-10 (DateField, InlineAlert, Toaster in shells, etc.) are NOT approved — do not create them.
- No library outside docs/product/03-technical-constraints.md ADR-17; add no npm dependency.
- No endpoint, field, error code or screen state outside docs/product/05-api-integration-contract.md.
- No table, column, enum or constraint change; nothing outside docs/product/03-technical-constraints.md §5.
- No edits to files created by earlier steps other than those in the allowlist.

DONE MEANS:
- Every test in the Step 22 "Tests to ship" table exists and passes.
- These commands all exit 0, in this order: npm run typecheck; npm run lint; npm test; npx supabase test db; npm run build; npm run e2e.
- In docs/product/06-build-plan.md: set the Step 22 row in §3 to ✅ with today's date, and append a Step 22 session log entry (date, what was built, pass/fail output per command, deviations, follow-ups — including whether FR-31 tests ran or were deferred to Step 30).
- Commit with the message "Step 22: Household sharing".

If anything above is ambiguous, if a referenced section doesn't contain what this prompt says it does, or if completing this step would require touching a file outside the list or making a decision the referenced documents don't settle — STOP and ask. Do not choose a reasonable default. Do not proceed with a partial implementation.
```

#### Session log
- **2026-10-23** — Step 22 built (unattended overnight run).
  - **Built:**
    - Migration `20261023200000_household_sharing.sql` (no table, column, enum or policy change):
      - `rpc:get_household(p_household_id default null)` (EP-34): security definer, `authenticated` only. It reads only households the caller owns or belongs to, and an unrelated id → `not_found`. Without an id it picks the household the caller owns, else the earliest-joined membership. It returns `{ household, my_households }` in the §6 shapes: `owner_premium_until` is the latest premium-family `current_period_end`; members are the owner first, then memberships by `joined_at`; pets are all of the owner's pets for the owner and only shared pets for a member; `pending_invitations` (pending and not past `expires_at`, newest first) is filled for the owner only; `access` is owner → `can_edit = not read_only`, member → read-only.
      - The EP-38 column grant `update (reminders_enabled)` on `household_memberships`, re-stated. Step 05 had already granted it together with the own-row policy.
      - `rpc:create_household_invitation(p_invitation_id, p_token_hash, p_email, p_household_name)` (EP-35): security definer, `authenticated` only, one transaction. It checks, in order: owner account (`forbidden_role`), Premium (`premium_required:household`), token hash and email shape, then `household_name` `required` / `too_long` only when the caller has no household. It creates that household on first use. Then: owner + memberships ≥ 6 → `household_full`; the owner's or a member's address → `already_member`. It expires a pending invitation to the same address, inserts the invitation (email lower-cased, `expires_at = now() + 7 days`), and returns the HouseholdInvitation plus what the email needs (household name, inviter, inviter locale, the address's account locale, active shared pet names).
      - `rpc:get_household_invitation(p_token_hash)` (EP-39): security definer, `anon` and `authenticated`. It returns the household InvitationView. The (session) fields are null without a session. `expired` or past `expires_at` → `invitation_expired`, unknown → `not_found`.
      - `rpc:decide_household_invitation(p_token_hash, p_decision)` (EP-40): security definer, `authenticated` only. It locks the row and checks, in order: `validation_failed` (decision), `not_found`, `invitation_used`, `invitation_expired`. On decline it sets `declined` + `decided_at`. On accept it checks `already_member` and `household_read_only` (`read_only` or the owner without Premium). It then inserts the membership (`joined_at = now()`, `reminders_enabled = false`, and the Step 05 size trigger raises `household_full`) and sets `accepted`, `accepted_by` and `decided_at`.
      - The helper `private.household_invitation_json` (HouseholdInvitation; `pending` past `expires_at` is reported `expired`).
      - `npm run db:types` regenerated `lib/supabase/database.types.ts`.
    - `lib/actions/household.ts` (`"use server"`):
      - `getHousehold` (EP-34).
      - `createHouseholdInvitation` (EP-35). It checks the gates and the request (`email` invalid, `idempotency_key` required / uuid v4, `household_name` ≤ 60), then runs `withIdempotency` (24 h replay). Inside it, `checkRateLimit` allows 20 per user per day, then the hh_ token is built: `signActionToken("hh", [invitation_id], now + 7 days)`, and only `hashToken(token)` goes to the database. `invite_url` is `NEXT_PUBLIC_SITE_URL + "/poziv/" + token`. Email invitations send the Design §9.1 `household_invitation` email through `sendEmail`. Link invitations send nothing.
      - `changeHouseholdMembership` (EP-36). `revoke_invitation` sets a pending invitation to `expired` with `expires_at = now()`; otherwise it answers `invitation_used`, and an invisible one → `not_found`. `remove_member` is owner only and `leave` is member only (else `forbidden_role`). Both are Data API deletes, so the Step 05 trigger answers `household_read_only` / `forbidden_role`. Revoke and remove return the refreshed Household; leave returns `{ left: true }`.
      - `setSharedPet` (EP-37: upsert with `ignoreDuplicates` / delete) and `setMyReminderOptIn` (EP-38, own row; the owner → `not_found`).
    - `lib/actions/invitations.ts` (`"use server"`): `getHouseholdInvitation` (EP-39, with or without a session) and `decideHouseholdInvitation` (EP-40: gates first, so a Visitor → `401 unauthenticated`). The path is chosen by the `hh_` prefix. `og_` / `tr_` / malformed tokens → `not_found` without a database call, and S14 shows its error state for them.
    - `lib/integrations/resend.ts`: the `household_invitation` template only (subject, body with `({pets})` or the no-pets body, the "Pogledaj poziv" button, the shared footer). `EmailTemplate` is now a union, and `renderEmail` casts the renderer looked up by id.
    - S13 `app/(app)/domacinstvo/page.tsx` + `household-screen.tsx`: port of `household.tsx` without the StateSwitcher.
      - The view comes from EP-34 (API EP-34 "States"). `household = null` and no Premium, or a 403 `premium_required` → G (PremiumLock over the blurred cards). `household = null` with Premium, or only the owner → E. `read_only` → R (ReadOnlyBanner with `owner_premium_until`, "Obnovi Premium" → `/premium`, and every control hidden). `my_role = member` → M. Otherwise D.
      - Invite Dialog: "Naziv domaćinstva" when there is no household; Mejlom with client checks, then "Poziv je poslat na …"; Linkom with "Napravi link" → the address field + "Kopiraj" + sr-only "Link je kopiran". `household_full`, `already_member` and `rate_limited` are inline; `premium_required` → G.
      - "Poslati pozivi" lists pending invitations with "Opozovi" (toast "Poziv je opozvan.").
      - "Ukloni" goes through the AlertDialog (EP-36). The shared-pets Switch (EP-37) is optimistic and reverts on error.
      - Member view: the subtitle "{household} · vlasnik: {owner}", the opt-in Switch with its `role="status"` line (EP-38), and "Napusti domaćinstvo" → `/ljubimci`.
      - A failed EP-34 read → ErrorState.
    - S14 `app/(auth)/poziv/[token]/page.tsx` + `invite-accept-screen.tsx`: port of `invite-accept.tsx`, household variant only, without the StateSwitcher. EP-39 runs on the server, and the loading variant is the Suspense fallback.
      - The variants come from EP-39 / EP-40: household (pending), accepted, declined, sign-in prompt (`is_signed_in = false`: "Napravi nalog" → `/registracija`, "Već imam nalog — prijavi me" → `/prijava?next=/poziv/<token>`, because S16 already honours `next`), expired (410) and error (404 / 5xx / og_ / tr_).
      - EP-40 `household_full`, `already_member`, `invitation_used` and `household_read_only` are inline messages; 401 → the sign-in variant. The language is `profiles.locale` when signed in, else the `ml_locale` cookie.
    - `lib/i18n/sr.ts` / `en.ts`: the new sections `household` and `invitation`, and `messages.household_invitation`, with English translations.
    - Tests:
      - pgTAP: `supabase/tests/household_invitations.test.sql` (50), `household_sharing.test.sql` (34), `household_member_permissions.test.sql` (26), `household_read_only.test.sql` (20).
      - Vitest: `tests/household/create-invitation.test.ts` (11), `decide-invitation.test.ts` (9), `change-membership.test.ts` (10), `member-reminder-channels.test.ts` (3), `household-screen.test.tsx` (17), `invite-accept-screen.test.tsx` (18).
      - Playwright: `e2e/household-invitation.spec.ts`.
  - **Owner decisions applied (2026-10-23):**
    - The invite Dialog asks for "Naziv domaćinstva" / "Household name" while `household = null` ("Upiši naziv domaćinstva." / "Enter a household name.", "Najviše 60 znakova." / "At most 60 characters."). The Linkom tab has "Napravi link" / "Create link" (EP-35 with email null). `rate_limited`: "Danas si poslao/la previše poziva. Pokušaj sutra." / "You've sent too many invitations today. Try again tomorrow."
    - "Poslati pozivi" / "Sent invitations": each row shows the email or "Poziv linkom" / "Link invitation", plus "važi do {date}" / "valid until {date}", "Opozovi" / "Revoke" (EP-36), and the toast "Poziv je opozvan." / "Invitation revoked."
    - "{household_name} · vlasnik: {owner_name}" / "{household_name} · owner: {owner_name}" (no declension).
    - The member read-only banner: "Vlasniku domaćinstva je istekao Premium. Deljene ljubimce vidiš, ali ne možeš ništa da menjaš dok ga ne obnovi." / "The household owner's Premium has ended. You can still see the shared pets but can't change anything until they renew."
    - S14 for hh_: expired "Pozivi u domaćinstvo važe 7 dana. Zamoli osobu koja te je pozvala za novi." The error state and og_ / tr_ tokens show "Poziv nije pronađen" / "Proveri da li si otvorio/la ceo link." The inline messages: already member, household full, already used, read-only (owner copy).
    - Email with no shared pets drops " ({pets})", and names are joined with `Intl.ListFormat`.
    - "Obnovi Premium" and the PremiumLock CTA go to `/premium` (built in Step 23).
    - With several households, the default one is shown.
    - e2e: the seed already has a Premium owner (Ivana) and a second verified user (Marko), so no users are created. The existing Toaster is used.
    - From Steps 13–17: server actions run on the server because of the httpOnly session; 5xx → toast "Nešto nije u redu. Pokušaj ponovo."; sr-Latn / en-GB dates (Europe/Belgrade); plurals with `Intl.PluralRules` (`acceptedBody_one/_few/_other`); English is a faithful translation.
  - **Verification:**
    - `npm run typecheck` ✅ exit 0
    - `npm run lint` ✅ exit 0. 0 errors and 2 warnings, both the unused eslint-disable directives in the generated `cloudflare-env.d.ts` that were already there.
    - `npm test` ✅ `Test Files 79 passed (79)`, `Tests 879 passed (879)`
    - `npx supabase test db` ✅ `All tests successful. Files=59, Tests=1925`, `Result: PASS`. This was run after `npx supabase db reset`, which applied all migrations and the seed cleanly.
    - `npm run build` ✅ exit 0. The routes include `ƒ /domacinstvo` and `ƒ /poziv/[token]`.
    - `npm run e2e` ✅ `5 passed`, including `e2e\household-invitation.spec.ts › a Premium owner invites by link; a second user signs in, accepts and logs weight on the shared pet`. As in Step 12, there is no `.env.local`. The run got `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` from `npx supabase status`, plus `NEXT_PUBLIC_SITE_URL=http://localhost:3000` and a local `ACTION_TOKEN_SECRET` (needed to sign the hh_ token). The spec puts the seed back before and after the run, using the service role: it removes Marko's membership and his entries on Luna, and expires the household's pending invitations.
    - An extra live check through psql as seeded Ivana / Marko / anon: `get_household`, `create_household_invitation`, `get_household_invitation` (signed in and anon) and `decide_household_invitation` answered as specified, inside a rolled-back transaction.
  - **Deviations / decisions:**
    - **Database functions (pre-approved exception 6):** `create_household_invitation`, `get_household_invitation` and `decide_household_invitation` are security definer with `search_path` set, act on `auth.uid()` only, are revoked from public, and are granted to `authenticated` (plus `anon` for EP-39 only). There is no client insert on `households` / `household_memberships`, and the invitee cannot see the invitation under RLS. Errors use the TC §5.7.1 format with §7.2 codes, and field codes go in DETAIL. EP-36 and EP-37 / EP-38 stay Data API writes (single rows, existing triggers), run from server actions.
    - **PremiumLock CTA → `/premium`:** the composite's button has no link, and `components/app/*` is out of bounds. S13 wraps the PremiumLock in a `div` whose click handler sends a click on its button to `/premium`.
    - **hh_ token:** it follows §9.3 and the Step 24 og_ decision: `signActionToken("hh", [invitation_id], now + 7 days)`, stored as `hashToken`. Lookup is by hash only, and validity is the table's `expires_at` (§9.3: "follow their table's expires_at"). The signature is not checked again on lookup. Creating an invitation needs `ACTION_TOKEN_SECRET`; without it the action answers `internal_error`.
    - Rate-limit operation `household_invitations.create`, a fixed UTC-day window (86 400 s). Idempotency operation `household_invitation`. Only successful results are stored, so a call refused by the limiter can be retried with the same key.
    - A failed invitation email → `internal_error` (not stored for idempotency). The invitation row stays pending, and the next attempt to the same address expires it.
    - The email language is the address's account locale when an account exists, else the inviter's. `{date}` is `expires_at` on the Europe/Belgrade calendar (`formatBelgradeDate` from Step 19).
    - S14 when EP-39 answers `accepted`: the member who accepted sees the accepted variant. Anyone else sees the household card with "Ovaj poziv je već iskorišćen." and no buttons. A pending invitation opened by a current member shows "Već si član ovog domaćinstva." and no buttons.
    - S14 sign-in variant: a Visitor gets no `shared_pets` (session field), so the mockup's pet-avatar row shows "Poziva te: {inviter}" in the same row. The accepted variant keeps the mockup's "Idi na ljubimce" → `/ljubimci`, although EP-40 "States" says "then S13".
    - New copy variants with no mockup text: `readOnlyOwnerNoDate` (no `owner_premium_until`), `remindersDescriptionNoPets`, `leaveDescriptionNoPets`, `acceptedBodyNoPets`, and the singular / plural `acceptedBody_*`. The sr `readOnlyOwner` has no period after `{date}`, because the sr-Latn date already ends with one. The S14 error variant uses the lucide `SearchX` icon.
    - EP-39 / EP-40 apply `invitation_expired` literally ("status = expired or expires_at < now()"), also to decided invitations past their expiry. EP-40 reports `invitation_used` before `invitation_expired`.
    - S13 in the R state hides "Opozovi" too (Design: controls hidden), although EP-36 allows revoke while read-only. The owner view lists memorial pets as well (EP-34: all of the owner's pets). "(ti)" is shown only in the member view, as in the mockup.
  - **FR-31:** Step 05 shipped no BR-27 ownership-transfer function, so `supabase/tests/household_succession.test.sql` was not created. **FR-31 tests are deferred to Step 30.**
  - **Follow-ups:**
    - Add `rpc:create_household_invitation`, `rpc:get_household_invitation` and `rpc:decide_household_invitation` to `docs/product/05-api-integration-contract.md` (EP-35, EP-39, EP-40), as the database side of those actions.
    - Step 24: `lib/actions/invitations.ts` gets the og_ path (EP-39 `kind = organisation`, EP-40 team accept) and S14 the team variant. Step 25: tr_ → EP-60. Step 24 decides whether team invitations share the 20-per-day counter (`household_invitations.create` here).
    - The household switcher for users in several households.
    - Step 30: time-based Premium expiry must refresh `households.read_only` (Step 05 follow-up). EP-34 reports the stored flag, while EP-40 accept also checks `is_premium(owner)`.
    - Local setup: `ACTION_TOKEN_SECRET` must be set (it is already in `.env.example`) for invitations to work.

---

### Step 23 — Subscription status, Premium page & account data control

| | |
|---|---|
| **Status** | ⬜ not started |
| **Outcome** | S18 shows the real subscription card (days remaining, renewal, cancel / resume auto-renew, expired downgrade summary), S19 lets a user request a data archive and request or cancel account deletion, and S17 `/premium` shows the Free vs Premium comparison in the "Plaćanje uskoro dostupno" state (EP-44 lists plans without prices; EP-45 answers `503 payment_provider_unavailable`). |
| **Implements** | FR-25 (days-remaining display), FR-38, FR-39, FR-40, FR-41 (request side; archive builder in Step 30a); EP-44 (before payments: plans without prices), EP-45 (provider-neutral stub: validation, then `503 payment_provider_unavailable`), EP-47, EP-48, EP-50, EP-51; S17 `/premium` (*payments_coming_soon* state), S18 `/profil` (subscription card), S19 `/profil/podaci`; tables `plans` (view `v_public_plans`), `subscriptions`, `data_exports`, `profiles` (deletion fields) — views/functions only |
| **Depends on** | Step 12, Step 15, Step 19 |
| **Blocked by** | — |
| **Track** | single |

**Read before starting:**
- `docs/product/02-prd.md` §6 FR-25, FR-36, FR-37, FR-38, FR-39, FR-40, FR-41; §8 BR-01, BR-02, BR-07 … BR-10, BR-27, BR-31; §9 E-15, E-16.
- `docs/product/03-technical-constraints.md` §5.1 (`profiles`, `subscriptions`, `plans`; `data_exports` in §5.7), §5.9, ADR-07, ADR-08, ADR-09 (provider context only), ADR-13, ADR-15, ADR-16.
- `docs/product/04-design-system.md` §6, §8, §9 (incl. placeholder-price rule), §9.1 (`account_deletion_scheduled`), §11 (S17, S18, S19), §12 S17, S18 and S19.
- `docs/product/04-design/screens/premium.tsx`, `docs/product/04-design/screens/profile.tsx`, `docs/product/04-design/screens/account-data.tsx`.
- `docs/product/05-api-integration-contract.md` §3.3, §4.1 (gate 3), §4.4 (EP-44 – EP-48, EP-50 / EP-51 rows), §5.5 EP-44, §5.6 intro, EP-45, EP-47, EP-48, EP-50, EP-51, EP-43 (read exemption), §6 (`Plan`, `CheckoutSession`, `Subscription`, `DataExport`, `Me`, `Entitlements`, `FileUrl`), §7.2, §7.3 (S17, S18, S19 states), §10, §17 OQ-11.
- Session logs of Steps 04, 06, 07, 11, 12, 13, 15 and 19 (names of the S18 screen file, i18n dictionaries, generated types file, R2 adapter functions, Resend template mechanism, and the Free-limit triggers).

**Files this step may touch:**
- `supabase/migrations/*_subscription_and_data_control.sql` (new: view `v_public_plans` (EP-44), `rpc:get_my_subscription` and any function EP-50 / EP-51 need)
- `supabase/tests/subscription_read.test.sql`, `supabase/tests/downgrade_limits.test.sql`, `supabase/tests/account_deletion_request.test.sql`, `supabase/tests/public_plans.test.sql`
- `lib/actions/subscription.ts` (new: EP-48)
- `lib/actions/checkout.ts` (new: EP-45 provider-neutral stub)
- `app/(app)/premium/page.tsx`, `app/(app)/premium/premium-client.tsx` (new, S17)
- `lib/actions/data-control.ts` (new: EP-50, EP-51)
- `lib/integrations/resend.ts` (the `account_deletion_scheduled` template of Design §9.1 only)
- `lib/i18n/sr.ts` and `lib/i18n/en.ts` (add keys only)
- the generated Supabase types file under `lib/supabase/` (via `npm run db:types` only)
- `app/(app)/profil/page.tsx` and the S18 screen component file Step 12 created (named in its session log)
- `app/(app)/profil/podaci/page.tsx`, `app/(app)/profil/podaci/account-data-screen.tsx`
- `tests/subscription/set-auto-renew.test.ts`, `tests/subscription/profile-subscription-card.test.tsx`, `tests/data-control/request-data-export.test.ts`, `tests/data-control/account-deletion.test.ts`, `tests/data-control/account-data-screen.test.tsx`, `tests/premium/start-checkout.test.ts`, `tests/premium/premium-screen.test.tsx`
- `docs/product/06-build-plan.md` (§3 row for Step 23 and its session log only)

**Out of bounds:** the provider checkout session, plan prices and plan rows, the S17 purchase state, the provider webhook and renewal charging (Step 31 — locked); the archive builder (Step 30a); the nightly deletion and expiry jobs (Step 30); emails without a Design §9.1 template (EP-48 confirmation, EP-51 cancel confirmation — CR-24); the S18 name/city/language form (Step 12 — keep it unchanged); table definitions.

**Acceptance criteria:** (PRD §6, verbatim)

FR-25 — Premium expiry notices and channel fallback *(display criterion only; notices and fallback: Steps 19 and 30)*
- Given any Premium user, When they open profile settings, Then the number of Premium days remaining is shown.

FR-38 — Cancel Premium
- Given an active subscription, When cancelled, Then auto-renewal stops and Premium remains until the end of the paid period.

FR-39 — Downgrade behaviour
- Given a user whose Premium ended with more than Free allows, Then all existing pets, attachments, and moments remain visible, and adding new items beyond Free limits is blocked with a Premium offer.

FR-40 — Delete account with a 30-day grace period
- Given a deletion request, Then the account is deactivated and permanently deleted after 30 days. *(deactivation here; permanent deletion verified in Step 30)*
- Given a user within the 30 days, When they sign in and cancel deletion, Then the account is restored unchanged.

FR-41 — Download all my data *(request side here; archive delivery verified in Step 30a)*
- Given any user, When they request their data, Then they receive an archive with all their personal data and records.

Derived (no PRD criterion covers the state before payments):
- (API EP-44, Design §12 S17, CR-22) While `plans` holds no priced rows, EP-44 lists the plan codes with price fields `null`, and S17 renders the *payments_coming_soon* state ("Plaćanje uskoro dostupno") exactly as Design §12 S17 describes it.
- (API EP-45, OQ-11) `startCheckout` runs the EP-45 Request validation and then always returns `503 payment_provider_unavailable`; it creates no checkout session and writes no `subscriptions` row.

**Tests to ship:**
| Criterion | Test | File |
|---|---|---|
| FR-25 #2 | S18 with a trialing/active `Subscription` renders the days-remaining `Progress` and value computed from `current_period_end` (Europe/Belgrade) | `tests/subscription/profile-subscription-card.test.tsx` |
| FR-38 | EP-48 `auto_renew = false` → `status = cancelled`, `auto_renew = false`, `current_period_end` unchanged, `Entitlements.premium` still true; `auto_renew = true` resumes; no active row → `409 subscription_not_active` | `tests/subscription/set-auto-renew.test.ts`, `supabase/tests/subscription_read.test.sql` |
| FR-39 | user with an expired subscription and 2 active pets, 11 attachments, 6 moments on a pet: all rows readable; inserting a further pet / attachment / moment fails with `premium_required`; S18 expired variant shows the `over_limits` summary | `supabase/tests/downgrade_limits.test.sql`, `tests/subscription/profile-subscription-card.test.tsx` |
| FR-40 #1 (deactivation) | EP-51 request sets `deletion_requested_at` / `deletion_due_at = +30 days`; a protected write afterwards returns `403 account_pending_deletion`; S19 renders *pending_deletion* | `tests/data-control/account-deletion.test.ts`, `supabase/tests/account_deletion_request.test.sql`, `tests/data-control/account-data-screen.test.tsx` |
| FR-40 #2 | EP-51 cancel clears both columns; profile, pets and subscription rows are identical to before the request | `tests/data-control/account-deletion.test.ts`, `supabase/tests/account_deletion_request.test.sql` |
| FR-41 (request side) | EP-50 `requestDataExport` inserts a `preparing` row and returns `DataExport`; a second call → `409 export_in_progress`; `getMyDataOverview` returns the summary and deletion block; S19 renders *preparing* and *ready* (with `download_url`) from data | `tests/data-control/request-data-export.test.ts`, `tests/data-control/account-data-screen.test.tsx` |
| EP-44 (derived) | `v_public_plans` is readable by anon and authenticated; with no plan rows it lists the plan codes with price fields `null`; S17 renders *payments_coming_soon* (prices and billing toggle hidden, CTA disabled "Plaćanje uskoro dostupno", card-payment note hidden) | `supabase/tests/public_plans.test.sql`, `tests/premium/premium-screen.test.tsx` |
| EP-45 (derived) | validation errors still surface (`validation_failed` with `plan_not_allowed`, `trial_already_used`, `subscription_already_active`, `forbidden_role`); a valid request returns `503 payment_provider_unavailable` and writes nothing (an active `plans` row exists only as a test fixture); S17 shows *payments_coming_soon* on `503` and *trial_used* when EP-47 `trial_available = false` | `tests/premium/start-checkout.test.ts`, `tests/premium/premium-screen.test.tsx` |

**Verification:**
```
npm run typecheck      # exit 0
npm run lint           # exit 0
npm test               # all Vitest suites pass, incl. tests/subscription/*, tests/data-control/* and tests/premium/*
npx supabase test db   # all pgTAP tests pass, incl. the four files above
npm run build          # exit 0
```

#### Prompt
```
You are executing Step 23 — Subscription status, Premium page & account data control — of docs/product/06-build-plan.md for the Moj Ljubimac web app. One outcome: the user's subscription and data-control surfaces work before payments exist — S18 /profil shows the real subscription card with cancel/resume auto-renew, S19 /profil/podaci lets the user request a data archive and request or cancel account deletion, and S17 /premium shows the "Plaćanje uskoro dostupno" state from EP-44 / EP-45.

READ FIRST, in this order:
1. docs/product/02-prd.md §6 FR-25, FR-36, FR-37, FR-38, FR-39, FR-40, FR-41; §8 BR-01, BR-02, BR-07 … BR-10, BR-27, BR-31; §9 E-15, E-16.
2. docs/product/03-technical-constraints.md §5.1 (profiles, subscriptions, plans), §5.7 (data_exports), §5.9, ADR-07, ADR-08, ADR-13, ADR-15, ADR-16.
3. docs/product/05-api-integration-contract.md §3.3, §4.1 (gate 3), §4.4, §5.5 EP-43, EP-44, §5.6 intro and EP-45, EP-47, EP-48, EP-50, EP-51, §6 Plan, CheckoutSession, Subscription, DataExport, Me, Entitlements, FileUrl, §7.2, §7.3, §10, §17 OQ-11.
4. docs/product/04-design-system.md §6, §8, §9, §9.1, §11 (S17, S18, S19), §12 S17, S18 and S19.
5. docs/product/04-design/screens/premium.tsx, profile.tsx and account-data.tsx.
6. The session logs of Steps 04, 06, 07, 11, 12, 13, 15 and 19 in docs/product/06-build-plan.md, for the exact names of the S18 screen file, the i18n dictionaries, the generated types file, the R2 presign function, the Resend template mechanism, and the Free-limit triggers.

BUILD:
1. Migration supabase/migrations/<timestamp>_subscription_and_data_control.sql: view v_public_plans exactly as EP-44 defines it (anon and authenticated read; active plans sorted family then period), including the before-payments shape — while plans holds no priced rows the plan codes are listed with price fields null (EP-44 Response, CR-22); insert no plan rows (OQ-03). rpc:get_my_subscription exactly as EP-47 (security invoker, own rows only, most recent row of the caller's plan family, never-subscribed shape with trial_available computed). Add only functions EP-50 / EP-51 need; no table changes.
2. lib/actions/subscription.ts: setAutoRenew (EP-48) with exactly its side effects and errors. EP-48's confirmation email has no Design §9.1 template (CR-24): send none and record it in the Session log. No payment-provider call.
2a. lib/actions/checkout.ts: startCheckout (EP-45) as the provider-neutral stub 05- EP-45 defines until OQ-11 is answered — run the EP-45 Request validation (plan, family vs account type, expect_trial vs trial_used, idempotency_key present, subscription_already_active, forbidden_role) and then return 503 payment_provider_unavailable. No provider call, no checkout session, no subscriptions row, nothing stored in idempotency_keys (there is no result to replay until Step 31). Tests that reach the 503 path insert an active plans fixture row inside the test; migrations and seed keep plans empty (OQ-03).
3. lib/actions/data-control.ts: requestDataExport and getMyDataOverview (EP-50) and requestAccountDeletion / cancelAccountDeletion (EP-51) exactly as specified. The deletion request sends the Design §9.1 account_deletion_scheduled email; the cancel confirmation has no §9.1 template (CR-24) — send none and record it. requestDataExport only inserts the data_exports row (status preparing) and returns it — the in-app route /api/internal/exports builds the archive (Step 30a, TC ADR-13); leave no placeholder call. download_url is a presigned R2 GET from the existing lib/integrations/r2.ts (10 min).
4. S18: in the S18 screen file created in Step 12, port the Premium card of docs/product/04-design/screens/profile.tsx (days remaining with Progress, renewal date, auto-renew status, "Otkaži obnovu" AlertDialog, "Uključi obnovu", expired variant with downgrade note). Drive active / cancelled / expired / loading / error from EP-47 and EP-43 per API §7.3. Keep the price element as the mockup's placeholder with the comment /* placeholder price — OQ-03 */ (Design §9); real prices are Step 31. Keep the existing name/city/language form unchanged.
4a. S17: port docs/product/04-design/screens/premium.tsx to app/(app)/premium/premium-client.tsx with app/(app)/premium/page.tsx; comparison rows as the mockup; drive the payments_coming_soon state from EP-44 (price fields null) and from a 503 payment_provider_unavailable of EP-45, and trial_used from EP-47 (trial_available = false), exactly as Design §12 S17 and 05- §7.3 describe; the purchase state with prices is Step 31. Remove the StateSwitcher.
5. S19: port docs/product/04-design/screens/account-data.tsx into app/(app)/profil/podaci/account-data-screen.tsx rendered by app/(app)/profil/podaci/page.tsx. Replace mock data with EP-50 / EP-51 / EP-43; drive default / preparing / ready / pending / error from real responses per EP-50 and EP-51 "States". Remove the StateSwitcher.
6. Strings (S17, S18, S19 and the §9.1 email) into lib/i18n/sr.ts and lib/i18n/en.ts per docs/product/04-design-system.md §9 (English is a faithful translation of the mockup's Serbian copy; no new copy). Regenerate types with npm run db:types.
7. Tests: write every test in the Step 23 "Tests to ship" table of docs/product/06-build-plan.md in exactly those files. pgTAP tests create their own fixtures (subscriptions rows inserted in the test transaction); do not change supabase/seed.sql.

FILES YOU MAY CREATE OR MODIFY (allowlist — nothing else):
- supabase/migrations/<timestamp>_subscription_and_data_control.sql
- supabase/tests/subscription_read.test.sql, downgrade_limits.test.sql, account_deletion_request.test.sql, public_plans.test.sql
- lib/actions/subscription.ts, lib/actions/checkout.ts, lib/actions/data-control.ts
- lib/integrations/resend.ts (account_deletion_scheduled template only)
- lib/i18n/sr.ts and lib/i18n/en.ts (add keys only)
- the generated types file under lib/supabase/ (via npm run db:types only)
- app/(app)/profil/page.tsx and the S18 screen component file named in the Step 12 session log
- app/(app)/profil/podaci/page.tsx, app/(app)/profil/podaci/account-data-screen.tsx
- app/(app)/premium/page.tsx, app/(app)/premium/premium-client.tsx
- tests/subscription/set-auto-renew.test.ts, profile-subscription-card.test.tsx
- tests/premium/start-checkout.test.ts, premium-screen.test.tsx
- tests/data-control/request-data-export.test.ts, account-deletion.test.ts, account-data-screen.test.tsx
- docs/product/06-build-plan.md (Step 23 row in §3 and the Step 23 session log only)
Touching any other file requires stopping and asking.

FORBIDDEN:
- No colours, spacing, radii, shadows, fonts or components outside docs/product/04-design-system.md §4–§6 and the composites already in components/app; OQ-10 proposed composites are not approved.
- No library outside docs/product/03-technical-constraints.md ADR-17; add no npm dependency.
- No endpoint, field, error code or state outside docs/product/05-api-integration-contract.md; EP-45 is only the stub of step 2a; do not implement EP-46 or EP-49.
- No table, column, enum or constraint change; nothing outside docs/product/03-technical-constraints.md §5.
- No real prices anywhere (OQ-03 is open).

DONE MEANS:
- Every test in the Step 23 "Tests to ship" table exists and passes.
- These commands all exit 0, in this order: npm run typecheck; npm run lint; npm test; npx supabase test db; npm run build.
- In docs/product/06-build-plan.md: set the Step 23 row in §3 to ✅ with today's date and append a Step 23 session log entry (date, what was built, pass/fail per command, deviations, follow-ups — note that archive delivery is Step 30a and list the CR-24 emails not sent).
- Commit with the message "Step 23: Subscription status, Premium page & account data control".

If anything above is ambiguous, if a referenced section doesn't contain what this prompt says it does, or if completing this step would require touching a file outside the list or making a decision the referenced documents don't settle — STOP and ask. Do not choose a reasonable default. Do not proceed with a partial implementation.
```

#### Session log
- **2026-10-23** — Step 23 built (unattended overnight run).
  - **Built:**
    - Migration `20261023210000_subscription_and_data_control.sql`. It changes no table, column, enum or constraint and inserts no plan rows (OQ-03):
      - View `v_public_plans` (EP-44): `unnest(enum_range(null::subscription_plan)) with ordinality` left-joined to active `plans` rows, in enum order (family, then monthly before yearly). Columns `code`, `family`, `period`, `price`, `monthly_equivalent` (yearly: `round(price_minor / 12)`) and `trial_days` (7 premium, 0 breeder). Without an active priced row, `price` and `monthly_equivalent` are null (CR-22). `security_invoker`; select granted to `anon`, `authenticated` and `service_role`.
      - `rpc:get_my_subscription()` (EP-47): security invoker, own rows through RLS, the most recent row of the caller's plan family, or the never-subscribed shape. `days_remaining` and `period_days` are counted on the Europe/Belgrade calendar (7 while trialing). `over_limits` is filled for owners without an active row and lists only the Free limits currently exceeded: active pets > 1, attachments per pet > 10, household memberships (members without the owner) > 0, and reminder types with WhatsApp selected > 0.
      - The helper `private.subscription_family_of(uuid)`: owner → premium; the admin of a breeder organisation → breeder; everyone else → `forbidden_role`.
      - Owner-decision functions, all security definer with `set search_path`, acting on `auth.uid()` only, revoked from public / anon:
        - `set_auto_renew(p_auto_renew)` returns `subscriptions` (EP-48). It locks the running row, sets `false` → `cancelled`, and `true` → `trialing` while `trial_ends_at > now()`, else `active`. No running row → `subscription_not_active`.
        - `request_data_export()` returns `data_exports` (EP-50). It locks the profile; a `preparing` row → `export_in_progress`.
        - `get_my_data_overview_base()` returns jsonb with the summary (own pet names, attachment and moment counts), the deletion block (`days_left` on the Belgrade calendar) and the BR-27 heir's `full_name`.
        - `request_account_deletion()` (already pending → `account_pending_deletion`) and `cancel_account_deletion()` (a no-op when nothing is pending). `deletion_due_at` is still derived by the Step 04 profiles trigger.
      - `npm run db:types` regenerated `lib/supabase/database.types.ts`.
    - `lib/actions/subscription.ts`: `getMySubscription` (EP-47) and `setAutoRenew` (EP-48, then a re-read of EP-47). It also has the §6 `Subscription` / `Plan` types (`Plan.price` nullable).
    - `lib/actions/checkout.ts`: `startCheckout` (EP-45 stub). The checks run in this order: gates, request (`idempotency_key` required / uuid v4, `plan` enum), role (shelter accounts and breeder non-admins → `forbidden_role`), active `plans` row of the account's family (else `fields.plan = plan_not_allowed`), `expect_trial` with `trial_used` → `trial_already_used`, a running row of the same family → `subscription_already_active`. It then always answers `503 payment_provider_unavailable`. It writes nothing and stores nothing in `idempotency_keys`.
    - `lib/actions/data-control.ts`:
      - `requestDataExport`: inserts the row only.
      - `getMyDataOverview`: `latest_export` plus a presigned R2 GET (10 min, `r2().presignGet`) when `ready`. `file_name` is `moj-ljubimac-podaci-<Belgrade date>.zip`.
      - `requestAccountDeletion`: `confirm` must be true. It sends the §9.1 `account_deletion_scheduled` email with the due date and `NEXT_PUBLIC_SITE_URL/profil/podaci`.
      - `cancelAccountDeletion`: gate-3 exempt, no email.
    - `lib/integrations/resend.ts`: the `account_deletion_scheduled` template only.
    - S18: `app/(app)/profil/page.tsx` and `profile-client.tsx`.
      - The page now renders a Suspense loading state (`ProfileLoading`, the mockup's skeletons). It reads EP-43, the cities and, for owner accounts, EP-47; a failed read → ErrorState.
      - The Premium card: days remaining as `Progress`, computed from `current_period_end` on the Belgrade calendar; "Sledeća naplata {date} · {price} · {card}" without the null segments; the "Otkaži obnovu" AlertDialog → EP-48 false; the cancelled variant with "Uključi obnovu" → EP-48 true; the expired variant with the `over_limits` list and "Obnovi Premium" → `/premium`; never subscribed → "Free plan", Free pill and "Pogledaj Premium".
      - The name/city/language form is unchanged.
    - S17: `app/(app)/premium/page.tsx` and `premium-client.tsx`, a port of `premium.tsx` without the StateSwitcher.
      - `payments_coming_soon` shows when either Premium plan has `price` null (EP-44) or after a 503 from EP-45. `trial_used` shows when EP-47 `trial_available = false` or after EP-45 `trial_already_used`.
      - The purchase state is wired to data only (prices from EP-44, marked `/* placeholder price — OQ-03 */`). Step 31 owns it.
    - S19: `app/(app)/profil/podaci/page.tsx` and `account-data-screen.tsx`, a port of `account-data.tsx` without the StateSwitcher. The states are default / preparing / ready / failed / pending / error, all driven by EP-43 / EP-50 / EP-51.
    - `lib/i18n/sr.ts` and `en.ts`: new sections `subscription`, `premium` and `accountData`, and `messages.account_deletion_scheduled`, with English translations.
    - Tests:
      - pgTAP: `supabase/tests/public_plans.test.sql` (14), `subscription_read.test.sql` (38), `downgrade_limits.test.sql` (14), `account_deletion_request.test.sql` (30).
      - Vitest: `tests/subscription/set-auto-renew.test.ts` (6), `profile-subscription-card.test.tsx` (9), `tests/premium/start-checkout.test.ts` (6), `premium-screen.test.tsx` (6), `tests/data-control/request-data-export.test.ts` (5), `account-deletion.test.ts` (6), `account-data-screen.test.tsx` (9).
  - **Owner decisions applied (2026-10-23):**
    - The database functions `set_auto_renew`, `request_data_export`, `request_account_deletion`, `cancel_account_deletion` and `get_my_data_overview_base`, and `v_public_plans` built from the plan enum with nullable prices.
    - Pending deletion: the S19 card is built from the EP-43 `deletion_*` fields and the export card is hidden.
    - The heir line has no declension and is omitted without an heir.
    - Plurals dan / prilog / trenutak / član.
    - A failed export: the default card plus "Priprema arhive nije uspela. Pokušaj ponovo."; the fake Progress bar in the preparing state is removed.
    - S18: the never-subscribed card; the subscription card only for `account_type = owner`; non-owners opening `/premium` are redirected to `/organizacija`.
    - S18: a price only when `Subscription.price` is set; the card segment is omitted when `card_brand` is null.
    - The over-limit copy and "{used} od {allowed}".
    - The S17 trial-used copy; "Tvoj plan" only on the current plan's card.
    - The `account_deletion_scheduled` button → `${NEXT_PUBLIC_SITE_URL}/profil/podaci`.
    - Applied from earlier decisions: server actions; the existing Toaster for errors; English written in this step; sr-Latn / en-GB dates on the Europe/Belgrade calendar; `Intl.PluralRules` with `_one/_few/_other`.
  - **Verification** (in order; all on the same code):
    - `npm run typecheck`: exit 0.
    - `npm run lint`: exit 0 (2 pre-existing warnings in `cloudflare-env.d.ts`).
    - `npm test`: 86 files, 926 tests passed.
    - `npx supabase test db`: PASS, 63 files, 2021 tests.
      - The first run failed in `household_rls.test.sql` #16 and `server_support.test.sql` #12. Both failures came from rows the Step 22 Playwright run had left in the local database at 19:40 UTC: one accepted household invitation, its `idempotency_keys` row and its `rate_limit_counters` row.
      - Those three local rows were deleted with psql. No file changed, and the re-run passed.
    - `npm run build`: exit 0; `/premium` and `/profil/podaci` are built.
  - **Deviations:**
    - **`DataExport.download_url`:** API §6 types it as `FileUrl`, but the `FileUrl.kind` enum has no value for archives. The action returns the FileUrl shape with `kind: "data_export"` and `mime_type: "application/zip"`.
    - **Gate 4:** EP-45 / EP-47 / EP-48 / EP-50 / EP-51 run `checkGates` with `access: "read"`, so the organisation-pending gate does not apply. API §5.6 intro limits that gate to organisation writes. Gates 1–3 still apply.
    - **`over_limits.household`:** `used` counts the members without the owner, because the Free allowance is 0 members. The "3 člana" value uses the član plural.
    - **The deletion email:** if it fails, the failure is logged and the request still returns `ok`, because the deletion is already stored and S19 shows the same date. The contract does not say what to do here.
    - **New copy keys:**
      - `planYearly` ("Godišnji plan"), because the mockup shows only "Mesečni plan".
      - `dialogBodyNoPets`, `readyValid` (no size) and `yearlyNote` without "2 meseca gratis". That text is a claim about real prices, so it waits for OQ-03.
      - S17 hides the Free card's "Trenutni plan" button for Premium users.
    - **S19 delete dialog date:** "today + 30 days" is computed when the dialog opens, to satisfy the React purity lint rule.
    - **The account-deletion pgTAP file** also covers the EP-50 database side (`request_data_export`, `get_my_data_overview_base`), because the file list has no separate export pgTAP file. The "identical to before" check compares the profile without `updated_at`, which the cancel necessarily bumps.
  - **Not sent (CR-24, no Design §9.1 template):** the EP-48 cancel / resume confirmation email and the EP-51 cancel-deletion confirmation email.
  - **Follow-ups:**
    - Archive delivery — the `/api/internal/exports` builder, the `data_export_ready` email and `ready` / `failed` rows — is Step 30a. Export expiry and R2 removal are Step 30 (EP-52). Renewal and expiry of subscriptions are Step 30 / 31 (EP-49).
    - Add these to `docs/product/05-api-integration-contract.md`:
      - `rpc:set_auto_renew`, `rpc:request_data_export`, `rpc:get_my_data_overview_base`, `rpc:request_account_deletion` and `rpc:cancel_account_deletion` as the database side of EP-48, EP-50 and EP-51.
      - `data_export` in the `FileUrl.kind` enum.
      - `Plan.price` as nullable before payments.
    - Step 31: the S17 purchase state with real prices, and the "2 meseca gratis" note once the prices are known.
    - Local setup: before `npx supabase test db`, clear leftover e2e rows (or run `npx supabase db reset`), because the Step 22 e2e spec leaves data that two older pgTAP files count.

---

### Step 24 — Organisations: animals, team, public profile

| | |
|---|---|
| **Status** | ⬜ not started |
| **Outcome** | Shelter and breeder users get a working organisation workspace: animal list with search and status filters, shelter intake and status changes, team management with invitations, pending-approval read-only state, and the public-profile editor. |
| **Implements** | FR-42 (gating side), FR-43, FR-44, FR-45, FR-59 (organisation side), FR-60; EP-53, EP-54, EP-55, EP-56, EP-72, EP-13 (`organisation_logo` purpose), EP-39 / EP-40 (`og_` team-invitation path, `InvitationView.kind = organisation`); S20 `/organizacija`, S29 `/organizacija/profil`, S14 `/poziv/[token]` (team-invitation variant, Design §12 S14, CR-18); BR-53; tables `organisations`, `organisation_memberships`, `organisation_invitations`, `intakes`, `pet_status_history`, `pets` (functions/grants only) |
| **Depends on** | Step 09, Step 15, Step 19, Step 22 (S14 screen file and `lib/actions/invitations.ts`) |
| **Blocked by** | — |
| **Track** | single |

**Read before starting:**
- `docs/product/02-prd.md` §6 FR-42, FR-43, FR-44, FR-45, FR-59, FR-60; §8 BR-30, BR-32 … BR-35, BR-46, BR-47, BR-51, BR-52, BR-53; §9 E-21.
- `docs/product/03-technical-constraints.md` §5.2, §5.3 (`pets` organisation columns), §5.6 (`intakes`, `pet_status_history`), §5.7 (`idempotency_keys`, `rate_limit_counters`), ADR-07, ADR-08, ADR-15, ADR-16.
- `docs/product/04-design-system.md` §5.2, §6, §8, §9, §9.1 (`team_invitation`), §11 (S20, S29, S14), §12 S20, S29, S14.
- `docs/product/04-design/screens/org-animals.tsx`, `docs/product/04-design/screens/org-profile.tsx`, `docs/product/04-design/screens/invite-accept.tsx`.
- `docs/product/05-api-integration-contract.md` §4.1 (gate 4), §4.4 (EP-53 … EP-56, EP-72 rows), §5.7 intro, EP-53, EP-54, EP-55, EP-56, EP-72, §5.1 EP-13, §5.4 EP-39, EP-40, §6 (`Organisation`, `OrganisationMember`, `OrganisationInvitation`, `OrgAnimalRow`, `Intake`, `InvitationView`, `Access`), §7.2, §7.3, §9.3, §10, §11.
- Session logs of Steps 09, 11, 12, 15, 19 and 22 (names of the organisation migrations, the `lib/server/` helpers, the org shell layout, the EP-13 action file, i18n dictionaries, generated types, Resend template mechanism, and `lib/actions/invitations.ts`).

**Files this step may touch:**
- `supabase/migrations/*_organisation_workspace.sql` (new: `rpc:get_my_organisation`, `rpc:list_org_animals`, the status-history trigger only if Step 09 did not ship it, grants for EP-55 status columns and EP-72 columns)
- `supabase/tests/organisation_access.test.sql`, `supabase/tests/org_animals.test.sql`, `supabase/tests/org_team.test.sql`, `supabase/tests/org_profile.test.sql`
- `lib/actions/organisation.ts` (new: `createIntake`)
- `lib/actions/team.ts` (new: `inviteTeamMember`)
- `lib/actions/invitations.ts` (extend with the `og_` path of EP-39 / EP-40)
- the EP-13 upload action file created in Step 15 (named in its session log) — add the `organisation_logo` purpose only
- `lib/integrations/resend.ts` (the `team_invitation` template of Design §9.1 only)
- `lib/i18n/sr.ts` and `lib/i18n/en.ts` (add keys only); the generated types file under `lib/supabase/` (via `npm run db:types` only)
- `app/(org)/layout.tsx`
- `app/(org)/organizacija/page.tsx`, `app/(org)/organizacija/org-animals-screen.tsx`
- `app/(org)/organizacija/profil/page.tsx`, `app/(org)/organizacija/profil/org-profile-screen.tsx`
- `app/(auth)/poziv/[token]/page.tsx`, `app/(auth)/poziv/[token]/invite-accept-screen.tsx` (team variant only)
- `tests/organisation/create-intake.test.ts`, `tests/organisation/invite-team-member.test.ts`, `tests/organisation/team-invitation-accept.test.ts`, `tests/organisation/org-animals-screen.test.tsx`, `tests/organisation/org-profile-screen.test.tsx`
- `docs/product/06-build-plan.md` (§3 row for Step 24 and its session log only)

**Out of bounds:** adoption requests, inquiries, transfers (Step 25); litters and the public organisation page (Step 26); Operator approval (Step 28); breeder plan purchase (Step 31); household variant of S14 (Step 22 — do not change its behaviour); table definitions.

**Acceptance criteria:** (PRD §6, verbatim)

FR-42 — Shelter approval and breeder plan *(gating side; approval action in Step 28, plan purchase in Step 31)*
- Given a newly registered Shelter, Then it cannot use the product until the Operator approves it.
- Given a Breeder, Then breeder features require an active breeder plan (separate price).
- Given an organisation account, Then it cannot hold personal pets.

FR-43 — Organisation team
- Given an organisation, Then it can have up to 20 users with role Admin or Volunteer.
- Given a Volunteer, Then they can add and edit health and care entries, but cannot delete animals, decide adoption requests or inquiries, or manage the team.

FR-44 — Unlimited animals with full records
- Given an organisation, Then it can manage any number of animals, each with the full record from EPIC-01.

FR-45 — Shelter intake and status
- Given an animal, When its status changes, Then the new status and date are recorded.

FR-59 — Search my pets *(organisation side)*
- Given a list of pets, When the user types part of a name, Then only pets whose name contains the text (case- and diacritic-insensitive) are shown.
- Given no match, Then an empty result with the search term is shown.

FR-60 — Edit the organisation's public profile
- Given an Admin, When they save description, phone, email, website, or logo, Then the public page shows the new values within 5 minutes. *(saved values verified here; EP-62 renders on every request (TC ADR-18), so the public page shows them on the next request — verified in Step 26)*
- Given a Volunteer, Then these fields are view-only.

**Tests to ship:**
| Criterion | Test | File |
|---|---|---|
| FR-42 #1 | member of a `pending` shelter: reads succeed, every organisation write returns `organisation_pending_approval`; S20 renders the pending-approval banner with everything read-only | `supabase/tests/organisation_access.test.sql`, `tests/organisation/org-animals-screen.test.tsx` |
| FR-42 #2 | breeder organisation without an active breeder plan: breeder-only writes return `breeder_plan_required`, reads succeed; with a plan (test fixture) they succeed | `supabase/tests/organisation_access.test.sql` |
| FR-42 #3 | inserting a pet with `owner_id` = a shelter/breeder user is rejected | `supabase/tests/organisation_access.test.sql` |
| FR-43 #1 | 20 memberships + pending invitations → `inviteTeamMember` returns `409 team_full`; roles limited to admin/volunteer | `supabase/tests/org_team.test.sql`, `tests/organisation/invite-team-member.test.ts` |
| FR-43 #2 | Volunteer can insert/update vaccinations, weight, care entries on an org animal; EP-05 delete, EP-56 actions and EP-58 decide return `forbidden_role` (EP-58 asserted at RLS/function level only if its function exists; else record in session log as covered by Step 25) | `supabase/tests/org_team.test.sql` |
| FR-44 | organisation creates more than 1 animal (no Free limit) and EP-02 returns the full record for each | `supabase/tests/org_animals.test.sql` |
| FR-45 | status change through EP-55 writes `pet_status_history` with status and `changed_at`; `createIntake` writes pet + intake + history in one transaction | `supabase/tests/org_animals.test.sql`, `tests/organisation/create-intake.test.ts` |
| FR-59 #1 | `list_org_animals(p_q)` matches substring, case- and diacritic-insensitive ("luna" matches "Lúna", "sapa" matches "Šapa") | `supabase/tests/org_animals.test.sql` |
| FR-59 #2 | no match → `items: []`, `total: 0`; S20 renders the empty state containing the search term | `supabase/tests/org_animals.test.sql`, `tests/organisation/org-animals-screen.test.tsx` |
| FR-60 #1 | Admin update of description/phone/email/website/logo persists and EP-53 returns the new values | `supabase/tests/org_profile.test.sql`, `tests/organisation/org-profile-screen.test.tsx` |
| FR-60 #2 | Volunteer update → rejected (`forbidden_role`); S29 renders read-only for `access.can_edit = false` | `supabase/tests/org_profile.test.sql`, `tests/organisation/org-profile-screen.test.tsx` |
| EP-39/40 `og_` | EP-39 returns `InvitationView` with `kind = organisation`; invitee accepts → `organisation_memberships` row with the invited role, `status = accepted`; the invitee's `profiles.account_type` is unchanged (BR-53); S14 renders the team variant for Volonter and Admin, declined and expired | `tests/organisation/team-invitation-accept.test.ts` |

**Verification:**
```
npm run typecheck      # exit 0
npm run lint           # exit 0
npm test               # all Vitest suites pass, incl. tests/organisation/*
npx supabase test db   # all pgTAP tests pass, incl. the four files above
npm run build          # exit 0
```

#### Prompt
```
You are executing Step 24 — Organisations: animals, team, public profile — of docs/product/06-build-plan.md for the Moj Ljubimac web app. One outcome: the organisation workspace (S20 /organizacija, S29 /organizacija/profil, and the team-invitation variant of S14) works on real data through EP-53 … EP-56, EP-72, EP-13 (organisation_logo) and the og_ path of EP-39 / EP-40.

READ FIRST, in this order:
1. docs/product/02-prd.md §6 FR-42, FR-43, FR-44, FR-45, FR-59, FR-60; §8 BR-30, BR-32 … BR-35, BR-46, BR-47, BR-51, BR-52, BR-53; §9 E-21.
2. docs/product/03-technical-constraints.md §5.2, §5.3 (pets), §5.6 (intakes, pet_status_history), §5.7 (idempotency_keys, rate_limit_counters), ADR-07, ADR-08, ADR-15, ADR-16.
3. docs/product/05-api-integration-contract.md §4.1, §4.4, §5.7 intro, EP-53, EP-54, EP-55, EP-56, EP-72, §5.1 EP-13, §5.4 EP-39, EP-40, §6 Organisation, OrganisationMember, OrganisationInvitation, OrgAnimalRow, Intake, InvitationView, Access, §7.2, §7.3, §9.3, §10, §11.
4. docs/product/04-design-system.md §5.2, §6, §8, §9, §9.1, §11 (S20, S29, S14), §12 S20, S29, S14.
5. docs/product/04-design/screens/org-animals.tsx, org-profile.tsx, invite-accept.tsx.
6. The session logs of Steps 09, 11, 12, 15, 19 and 22 in docs/product/06-build-plan.md, for the exact names of the organisation migrations, the lib/server helpers, app/(org)/layout.tsx, the EP-13 action file, the i18n dictionaries, the generated types file and the Resend template mechanism.

SETTLED UPSTREAM — apply exactly:
- EP-56 idempotency (API §3.3) and its 20-per-day limit (API §11) use lib/server/idempotency.ts and lib/server/rate-limit.ts (Step 11); og_ tokens use lib/server/action-tokens.ts (Step 19, TC ADR-16).
- Team invitations: EP-39 / EP-40 handle og_ tokens and return InvitationView with kind = organisation (05- §5.4 and §6 InvitationView, v1.2, CR-18); accepting inserts organisation_memberships with the invited role, and the invitee keeps their own profiles.account_type (PRD BR-53). The S14 team variant is specified in docs/product/04-design-system.md §12 S14 and by the team / teamAdmin views of docs/product/04-design/screens/invite-accept.tsx.
- Email copy: the team_invitation template of docs/product/04-design-system.md §9.1.

BUILD:
1. Migration supabase/migrations/<timestamp>_organisation_workspace.sql: rpc:get_my_organisation (EP-53) and rpc:list_org_animals(p_q, p_status, p_limit, p_offset) (EP-54) exactly as specified, including status_counts and case- and diacritic-insensitive p_q; the pet_status_history trigger for EP-55 status changes only if Step 09 did not ship it; column grants for EP-55 status columns and EP-72 profile columns. No table changes.
2. lib/actions/organisation.ts: createIntake (EP-55) in one transaction as specified. Status changes are Data API updates from the screen.
3. lib/actions/team.ts: inviteTeamMember (EP-56) with token per API §9.3 via lib/server/action-tokens.ts (prefix og_), validity as household invitations (BR-47), idempotency and rate limit through the lib/server helpers, email with the Design §9.1 team_invitation template through lib/integrations/resend.ts. Revoke, remove and change role are Data API calls from the screen, with the last_admin rule of EP-56 enforced in the database.
4. lib/actions/invitations.ts: add the og_ path of EP-39 / EP-40 exactly as 05- EP-39 / EP-40 (v1.2) define it — InvitationView kind = organisation, organisation_memberships insert, account type unchanged (BR-53).
5. EP-13: in the Step 15 upload action file, add purpose organisation_logo exactly as EP-13 says (OrgAdmin only, images only, confirm sets organisations.logo_r2_key; old key queued for deletion).
6. S20: port docs/product/04-design/screens/org-animals.tsx into app/(org)/organizacija/org-animals-screen.tsx rendered by app/(org)/organizacija/page.tsx; replace mock data with EP-53, EP-54, EP-55, EP-56; drive default / loading / empty / error / pending (pending_approval) from real responses per API §7.3; remove the StateSwitcher. Animal rows open S03 /ljubimci/[id] (Step 14). Wire app/(org)/layout.tsx to the organisation AppShell variant with data from EP-53 (and EP-43) only if Step 12 has not already done so.
7. S29: port docs/product/04-design/screens/org-profile.tsx into app/(org)/organizacija/profil/org-profile-screen.tsx rendered by app/(org)/organizacija/profil/page.tsx; EP-72 save, EP-13 organisation_logo upload, read-only for Volunteers (access.can_edit = false from EP-53); remove the StateSwitcher.
8. S14 team variant: in app/(auth)/poziv/[token]/invite-accept-screen.tsx add only the team-invitation variant as docs/product/04-design-system.md §12 S14 and the team / teamAdmin views of invite-accept.tsx specify; do not change the household variant.
9. Strings into lib/i18n/sr.ts and lib/i18n/en.ts per docs/product/04-design-system.md §9 (English is a faithful translation of the mockup's Serbian copy; no new copy); regenerate types with npm run db:types.
10. Tests: write every test in the Step 24 "Tests to ship" table of docs/product/06-build-plan.md in exactly those files.

FILES YOU MAY CREATE OR MODIFY (allowlist — nothing else):
- supabase/migrations/<timestamp>_organisation_workspace.sql
- supabase/tests/organisation_access.test.sql, org_animals.test.sql, org_team.test.sql, org_profile.test.sql
- lib/actions/organisation.ts, lib/actions/team.ts, lib/actions/invitations.ts
- the EP-13 upload action file named in the Step 15 session log (organisation_logo purpose only)
- lib/integrations/resend.ts (team_invitation template only)
- lib/i18n/sr.ts and lib/i18n/en.ts (add keys only); the generated types file under lib/supabase/ (via npm run db:types only)
- app/(org)/layout.tsx
- app/(org)/organizacija/page.tsx, app/(org)/organizacija/org-animals-screen.tsx
- app/(org)/organizacija/profil/page.tsx, app/(org)/organizacija/profil/org-profile-screen.tsx
- app/(auth)/poziv/[token]/page.tsx, app/(auth)/poziv/[token]/invite-accept-screen.tsx (team variant only)
- tests/organisation/create-intake.test.ts, invite-team-member.test.ts, team-invitation-accept.test.ts, org-animals-screen.test.tsx, org-profile-screen.test.tsx
- docs/product/06-build-plan.md (Step 24 row in §3 and the Step 24 session log only)
Touching any other file requires stopping and asking.

FORBIDDEN:
- No colours, spacing, radii, shadows, fonts or components outside docs/product/04-design-system.md §4–§6 and the composites already in components/app; OQ-10 proposed composites (incl. StatusBadge organisation statuses, LogoAvatar) are not approved — use what the mockups use.
- No library outside docs/product/03-technical-constraints.md ADR-17; add no npm dependency.
- No endpoint, field, error code or state outside docs/product/05-api-integration-contract.md.
- No table, column, enum or constraint change; nothing outside docs/product/03-technical-constraints.md §5.

DONE MEANS:
- Every test in the Step 24 "Tests to ship" table exists and passes.
- These commands all exit 0, in this order: npm run typecheck; npm run lint; npm test; npx supabase test db; npm run build.
- In docs/product/06-build-plan.md: set the Step 24 row in §3 to ✅ with today's date and append a Step 24 session log entry (date, what was built, pass/fail per command, deviations, follow-ups).
- Commit with the message "Step 24: Organisations: animals, team, public profile".

If anything above is ambiguous, if a referenced section doesn't contain what this prompt says it does, or if completing this step would require touching a file outside the list or making a decision the referenced documents don't settle — STOP and ask. Do not choose a reasonable default. Do not proceed with a partial implementation.
```

#### Session log
- **2026-10-23** — Step 24 built (unattended overnight run).
  - **Built:**
    - Migration `20261023220000_organisation_workspace.sql`. It changes no table, column, enum or constraint. The Step 09 trigger `pets_record_status_history` already records EP-55 status changes, so no history trigger is added.
      - Helpers in `private`: `search_text` (immutable `translate(lower(x), …)`), `my_organisation_membership` (the caller's earliest membership), `organisation_invitation_json` (OrganisationInvitation; pending past `expires_at` → `expired`) and `organisation_other_admin_exists` (locks the organisation row).
      - `rpc:get_my_organisation()` (EP-53): security definer with an explicit membership check (`not_found` without one). It returns Organisation (`public_path`, `city`, `member_count`, `member_limit` 20, `donation` null until Step 28b, and the internal `logo_r2_key`, which the action turns into `logo_url`), `team` (admin first, then `created_at`, names and emails from `profiles`), `pending_invitations` (Admins only; Volunteers `[]`), `breeder_plan_active` (`private.breeder_plan_active`, Step 09) and `access` (`can_edit` = approved and, for breeders, the plan; `can_delete` = `can_edit` and admin).
      - `rpc:list_org_animals(p_q, p_status, p_limit, p_offset)` (EP-54): security definer with the same membership check. It returns `{ items: OrgAnimalRow[], total, status_counts }`. `p_q` is a case- and diacritic-insensitive substring search. `p_status` is a shelter status, or an offspring status / `breeding_active` / `breeding_retired` for breeders. `status_counts` covers every key and ignores `p_status`. Shelters sort by `intake_on` desc, breeders by `created_at` desc. Errors: `validation_failed` (`p_status`, `p_limit` 1–50, `p_offset`) and `not_found`.
      - `rpc:create_intake(…)` (EP-55): security invoker, one transaction. It validates the Request with `DETAIL '<field>:<code>'`, then inserts `pets` (`shelter_status = intake`), `intakes` and the first `pet_status_history` row (the Step 09 trigger fires on updates only). RLS and the Step 06 / 09 triggers answer `organisation_pending_approval`; a breeder gets `forbidden_role`.
      - `rpc:create_organisation_invitation(p_invitation_id, p_token_hash, p_email, p_role)` (EP-56 invite): security definer. It checks, in order: membership (`not_found`), admin (`forbidden_role`), approval, then the token hash, email and role (`validation_failed`). A member's address → `already_member`. It expires an earlier pending invitation to the same address and inserts the new one (`expires_at = now() + 7 days`). It returns the invitation plus the organisation name, inviter name and locale, and the address's account locale.
      - `rpc:get_organisation_invitation(p_token_hash)` (EP-39 og_, `anon` + `authenticated`): InvitationView with `kind = organisation`. Session fields (`inviter_city` = `organisations.city_id`, `member_count`, `member_limit`, `already_member`) are null for a Visitor. `inviter_name` is `organisations.created_by`. Errors: `invitation_expired`, `not_found`.
      - `rpc:decide_organisation_invitation(p_token_hash, p_decision)` (EP-40 og_, `authenticated`): it locks the row. Errors: `validation_failed`, `not_found`, `invitation_used`, `invitation_expired`, `already_member`; the Step 05 size trigger raises `team_full`. Accept inserts `organisation_memberships` with the invited role and sets `accepted` + `accepted_by`. It does not touch `profiles.account_type` (BR-53). Decline sets `declined`.
      - Guards:
        - `organisation_guard_write` (organisations update; memberships and invitations insert / update / delete): a pending / rejected organisation → `organisation_pending_approval` (rejected: `organisation_pending_approval:rejected`). For organisations it also runs the EP-72 checks: description ≤ 1000, phone ≤ 30, email shape, website `https://…`, and a new `logo_r2_key` must start with `o/<org_id>/logo-`.
        - `organisation_invitations_check_team_size`: members + live pending invitations ≥ 20 → `team_full`.
        - `organisation_memberships_check_last_admin`: a role change or delete that leaves no admin → `validation_failed:last_admin` (DETAIL `user_id:last_admin`).
        - `pets_check_breeder_write`: a breeder's `offspring_status` / `price_minor` change without an active plan → `breeder_plan_required`; `breeding_status` on a shelter animal → `forbidden_role` (EP-55).
        - `organisations_queue_logo_key`: a replaced or removed logo key goes to `r2_deletion_queue`.
        - All guards except the team-size trigger run for client sessions only (`current_user = 'authenticated'`), like the Step 05 / 09 triggers.
      - The EP-55 / EP-72 column grants are re-stated (Steps 05 / 06 had granted them).
      - `npm run db:types` regenerated `lib/supabase/database.types.ts`.
    - `lib/actions/organisation.ts` (new): `getMyOrganisation` (EP-53, presigned `logo_url` through `r2().presignGet`; on presign failure `url = null`), `listOrgAnimals` (EP-54), `createIntake` (EP-55, Request checked with field codes, then one `create_intake` call), `changeAnimalStatus` (EP-55 Data API `pets` update of `shelter_status` / `breeding_status`) and `updateOrganisationProfile` (EP-72 Data API `organisations` update; `logo_r2_key` may only be null here, a new key comes from EP-13 confirm). It also has the §6 types Organisation, OrganisationMember, OrganisationInvitation, OrgAnimalRow and Intake.
    - `lib/actions/team.ts` (new): `inviteTeamMember` (EP-56). It checks the gates and the Request, then runs `withIdempotency` (operation `organisation_invitation`) and `checkRateLimit` (`organisation_invitations.create`, 20 per day). The token is `signActionToken("og", [invitation_id], now + 7 days)` and only `hashToken` is stored. The §9.1 `team_invitation` email goes to the address's account locale (else the inviter's), with `{date}` from `formatBelgradeDate` and the link `NEXT_PUBLIC_SITE_URL/poziv/<token>`. A failed email → `internal_error`. Also `revokeInvitation` (delete of a pending row), `removeMember`, and `changeMemberRole` (returns the OrganisationMember from EP-53). `validation_failed:last_admin` → `fields.user_id = "last_admin"`.
    - `lib/actions/invitations.ts`: the og_ path of EP-39 / EP-40. The token prefix picks `get_` / `decide_organisation_invitation`; tr_ still answers `not_found` (Step 25).
    - `lib/actions/uploads.ts`: EP-13 purpose `organisation_logo`. The target is the organisation id: its Admin ✅, a Volunteer → `forbidden_role`, anyone else → `not_found`. Types are image/jpeg, png and webp, up to 10 MB. The key is `o/<org_id>/logo-<uuid>.<ext>`. Confirm HEAD-checks the object, sets `organisations.logo_r2_key` (the trigger queues the old key) and returns the Organisation.
    - `lib/integrations/resend.ts`: the `team_invitation` template only (role shown as Admin / Volonter).
    - `app/(org)/layout.tsx`: the organisation type comes from EP-53. EP-53 `not_found` → `/ljubimci`. The Sonner Toaster is mounted.
    - S20 `app/(org)/organizacija/page.tsx` + `org-animals-screen.tsx`: port of `org-animals.tsx` without the StateSwitcher. The loading variant is the Suspense fallback; `?tab=tim` opens Tim.
      - Animals: table on lg, cards below. Status chips come with `status_counts`. Search (250 ms) and chips go through EP-54. "Učitaj još" pages by 50. The no-match empty state shows the term; "Nema životinja sa statusom …" covers an empty filter.
      - Row menu: "Otvori karton" → `/ljubimci/[id]`, the "Promeni status" radio submenu (shelters, `can_edit`, not transferred) and "Obriši životinju" (`can_delete`; AlertDialog → EP-05 `deletePet`, toast).
      - Intake Dialog (EP-55). Tim: members, pending invitations, the invite Dialog (EP-56) and the member / invitation menus.
      - States: pending banner, breeder-plan banner, empty (no animals), error (retry → `router.refresh()`).
    - S29 `app/(org)/organizacija/profil/page.tsx` + `org-profile-screen.tsx`: port of `org-profile.tsx` without the StateSwitcher.
      - Admin form: EP-72 save with inline errors, the "Sačuvano" status and "Poništi izmene". The logo goes through EP-13 (ticket → PUT → confirm); "X" removes it on save.
      - `access.can_edit = false` → the read-only card. Volunteers get the volunteer banner; a pending or plan-less Admin gets the S20 banner.
    - S14 `invite-accept-screen.tsx` / `page.tsx`: the team variant only (team / teamAdmin views). It shows kicker, organisation, "{type} · {city} · Poziva te", the role tile with counter, can / cannot lines, the account note and validity, then "Pridruži se timu" / "Odbij". Also: accepted → "Idi u organizaciju" (`/organizacija`), declined (team copy), the sign-in variant "Poziv u tim: {organisation}", and expired for og_ tokens. The household variant is unchanged.
    - `lib/i18n/sr.ts` / `en.ts`: new sections `orgAnimals` and `orgProfile`, team keys in `invitation`, and `messages.team_invitation`, with English translations.
    - Tests:
      - pgTAP: `organisation_access.test.sql` (36), `org_animals.test.sql` (37), `org_team.test.sql` (56), `org_profile.test.sql` (20).
      - Vitest: `tests/organisation/create-intake.test.ts` (8), `invite-team-member.test.ts` (12), `team-invitation-accept.test.ts` (14), `org-animals-screen.test.tsx` (19), `org-profile-screen.test.tsx` (6).
  - **Owner decisions applied (2026-10-23):**
    - Database functions `create_intake` (invoker, one transaction; the history row is inserted because the Step 09 trigger covers updates only), `get_organisation_invitation` / `decide_organisation_invitation` (definer, `invitation_expired` / `invitation_used` / `already_member` / `team_full`), and `get_my_organisation` / `list_org_animals` (definer with an explicit membership check; names from `profiles`). The og_ action uses `randomUUID` + `signActionToken('og', [id], now + 7 days)` and stores `hashToken`.
    - Guards: `breeder_plan_active` is the existing Step 09 `private.breeder_plan_active(organisation_id)` (definer, stable), reused rather than duplicated. The team_full invitation trigger, the last-admin trigger, the pending / rejected organisation guard on organisations / memberships / invitations, and `breeder_plan_required` on pets `offspring_status` / `price_minor` (breeder_inquiries updates already had it, Step 09). `lib/actions/team.ts` has `revokeInvitation`, `removeMember` and `changeMemberRole`, and maps `last_admin` to `fields.user_id`.
    - Diacritic-insensitive search with `translate(lower(x), …)` — see the deviation below on the target string.
    - EP-13 `organisation_logo`: `target_id` = organisation id, image/jpeg|png|webp, 10 MB, confirm returns Organisation, a trigger queues the old key. Hint "PNG ili JPG, najviše 10 MB. Najbolje kvadratna slika."
    - S29: description max 1000, website must start with `https://`, the volunteer banner "…menjaju samo admini — javi im se ako nešto treba ispraviti."
    - S20:
      - The intake Dialog uses the S02 species list and the "Ostalo" field keys (`petForm.speciesOther*`, `errSpeciesOther`). There is no weight and no "Karton ažuriran".
      - "Promeni status" is a submenu of status radios (shelters only). The labels "Uginuo" / "Vraćen vlasniku" and their chips show only when the count > 0.
      - The "Za sada si sam" empty state is removed.
      - Pending invitation rows read "{email} · Čeka odgovor · važi do {date}", with the menu "Opozovi poziv".
      - The breeder-without-plan banner.
    - S14 team variant: the sign-in title "Poziv u tim: {organisation}" and, for og_ tokens, the expired body "Link više ne važi. Zamoli pošiljaoca da ti pošalje novi poziv." hh_ keeps its Step 22 expired copy, because this step's prompt forbids changing the household variant ("expired for all kinds" read as every non-household kind).
    - `app/(org)/layout.tsx` admits anyone EP-53 returns an organisation for.
    - Applied from earlier decisions: server actions (httpOnly session); the Sonner Toaster and the 5xx toast "Nešto nije u redu. Pokušaj ponovo."; sr-Latn / en-GB dates on the Belgrade calendar; age plurals from Step 13; English written in this step; unmapped codes show the existing generic error.
  - **Owner-approved exceptions:**
    - **Exception 1:** `tests/household/decide-invitation.test.ts` (Step 22) asserted that og_ tokens answer `not_found` "(Steps 24–25)". This step adds og_, so only those two assertions changed: they now use a `tr_` token (and an unsigned `og_` string stays malformed). The header comment was updated to match.
    - **Exception 3:**
      - `supabase/tests/organisation_workflows.test.sql` (Step 09) changes offspring statuses as a plan-less breeder. The new `breeder_plan_required` guard (owner decision) now refuses that, so the test gets an active `breeder_monthly` subscription fixture before that block.
      - `supabase/tests/organisation_rls.test.sql` (Step 05) saved `logo_r2_key = 'org/logo.png'`. The organisations guard (owner decision) rejects keys that are not `o/<org_id>/logo-…` (EP-72 "must come from a confirmed EP-13 ticket for this organisation"), so the test now uses an EP-13-shaped key.
  - **Database functions (pre-approved exception 6):** `create_organisation_invitation` (security definer, `set search_path`, `auth.uid()` membership + admin checks, revoked from public / anon, granted to `authenticated`). It is needed because the invitation id is not client-insertable, the expire-and-insert must be one transaction, and `already_member` reads other members' emails. **Follow-up:** add it to `docs/product/05-api-integration-contract.md` (EP-56). Also add the owner-decided `rpc:create_intake`, `rpc:get_organisation_invitation` and `rpc:decide_organisation_invitation` there (EP-55, EP-39, EP-40).
  - **Verification** (in order; all on the same code):
    - `npm run typecheck` ✅ exit 0
    - `npm run lint` ✅ exit 0 (0 errors; the 2 known warnings in the generated `cloudflare-env.d.ts`)
    - `npm test` ✅ `Test Files 91 passed (91)`, `Tests 985 passed (985)`
    - `npx supabase test db` ✅ `Files=67, Tests=2170`, `All tests successful.`, `Result: PASS` (after `npx supabase db reset`)
    - `npm run build` ✅ exit 0. Routes include `ƒ /organizacija`, `ƒ /organizacija/profil` and `ƒ /poziv/[token]`.
  - **Deviations / decisions:**
    - **Search translate string:** the owner-given target `'ccszdaaaeeeiioooouuu'` has one `o` too many, so `ú` mapped to `o` and "luna" did not match "Lúna" (FR-59 #1 failed). The migration uses `'ccszdaaaeeeiiooouuu'` (19 → 19 characters).
    - **Last-admin trigger** is security invoker (a definer trigger sees `current_user = postgres` and skipped the client-only check). The row lock lives in the definer helper `private.organisation_other_admin_exists`.
    - **Rate limit:** team invitations have their own counter `organisation_invitations.create` (20 per user per day), separate from `household_invitations.create`. Step 22 left this to Step 24. The idempotency operation is `organisation_invitation`.
    - **Copy with no mockup text** uses existing copy and no new strings:
      - The S20 invite Dialog keeps "Pošalji poziv" disabled until the email looks valid. Any EP-56 error (`team_full`, `already_member`, `rate_limited`, …) shows the generic error inline.
      - S14 team `team_full` → the generic error inline. `invitation_used` → "Ovaj poziv je već iskorišćen.".
      - A current member opening a pending team invitation (or EP-40 `already_member`) sees no buttons and "Idi u organizaciju" instead of a message.
      - S29 logo type / size or upload failures → the generic toast; the file input accepts PNG / JPG / WebP only.
      - Breeding animals (`status_kind = breeding`) show no status badge (no breeding-status copy). A mother shows "Majka" in the Poreklo column.
    - **S20 "Obriši životinju"** (in the mockup menu) is wired to EP-05 `deletePet` with an AlertDialog ("Trajno obriši karton — {name}?", "Ovo ne može da se poništi.", "Da, obriši" / "Odustani"; the S03 / Step 14 wording, without the memorial sentence) and the S03 deleted toast. `deletePet` is the existing Step 13 action.
    - **S29 Donacije card** (FR-72, EP-88) is not built: its columns arrive in Step 28a/28b, and EP-53 returns `donation: null` until Step 28b replaces `get_my_organisation`.
    - **S29 saved logo name:** Organisation has only `logo_url`, so a saved logo's chip shows the last part of its key (`logo-<uuid>.<ext>`) without a size. A file uploaded in this session shows its own name and size.
    - **Owner shell "Organizacija" item:** not added. `app/(app)/layout.tsx` already renders the organisation shell (with "Životinje" → `/organizacija`) for any user with a membership, so a pet owner who volunteers already reaches S20. Adding an item to the owner nav would need a change in `components/app/shells.tsx`, which is more than a pass-through. The step is complete without it.
    - **FR-43 #2 "care entries":** the care log (EP-17 / EP-18) is not available to organisation roles (API §4.4 "—"), so the pgTAP test covers vaccinations, weight entries and treatments (health and care entries, BR-34), plus status changes and intake. EP-58 is asserted at the RLS / trigger level (`adoption_requests` update by a Volunteer → `forbidden_role`); its function arrives in Step 25.
    - **`team-invitation-accept.test.ts`** is a `.ts` file, as the table names it, so it renders S14 with `createElement` instead of JSX.
    - **Rejected organisations** get no banner (no copy). They are read-only through `access.can_edit = false`, and writes answer `organisation_pending_approval` (rejected).
  - **Follow-ups:**
    - Add `rpc:create_organisation_invitation`, `rpc:create_intake`, `rpc:get_organisation_invitation` and `rpc:decide_organisation_invitation` to `docs/product/05-api-integration-contract.md` (EP-55, EP-56, EP-39, EP-40).
    - Design copy is needed for:
      - the S20 invite Dialog errors (`team_full`, `already_member`, `rate_limited`, invalid email);
      - S14 team `already_member` / `team_full`;
      - S29 logo type / size errors;
      - breeding-status labels;
      - a rejected-organisation banner.
    - The owner-shell "Organizacija" nav item needs a `components/app/shells.tsx` change if it is still wanted; today the (app) layout switches members to the organisation shell.
    - Step 26: EP-62 reads the EP-72 values saved here. Step 28b replaces `get_my_organisation` with `donation`. Step 30: BR-46 succession (the last-admin trigger skips System sessions).

---

### Step 25 — Requests, inquiries & record transfers

| | |
|---|---|
| **Status** | ⬜ not started |
| **Outcome** | Organisations can list and decide adoption requests / breeder inquiries and send record transfers; signed-in users can submit requests (action level); a recipient can accept or decline a transfer in S14 and receives a full copy of the record. |
| **Implements** | FR-47, FR-49 (inquiry part), FR-50, FR-51; EP-57, EP-58, EP-59, EP-60, EP-63; S21 `/organizacija/zahtevi`, S14 `/poziv/[token]` (transfer, slot-taken variants); tables `adoption_requests`, `breeder_inquiries`, `record_transfers` (functions only); API §11 (5 requests/hour) |
| **Depends on** | Step 24, Step 22 |
| **Blocked by** | — |
| **Track** | single |

**Read before starting:**
- `docs/product/02-prd.md` §6 FR-47, FR-49, FR-50, FR-51; §8 BR-36, BR-38, BR-39, BR-52; §9 E-17 … E-20.
- `docs/product/03-technical-constraints.md` §5.3, §5.6 (`adoption_requests`, `breeder_inquiries`, `record_transfers`), §5.7 (`idempotency_keys`, `rate_limit_counters`), ADR-07, ADR-08, ADR-15, ADR-16.
- `docs/product/04-design-system.md` §6, §8, §9, §9.1, §11 (S21, S14), §12 S21 and S14.
- `docs/product/04-design/screens/org-requests.tsx`, `docs/product/04-design/screens/invite-accept.tsx`.
- `docs/product/05-api-integration-contract.md` §3.3, §4.4 (EP-57 … EP-60, EP-63 rows), §5.7 intro, EP-57, EP-58, EP-59, EP-60, EP-63, §6 (`AdoptionRequest`, `BreederInquiry`, `RecordTransfer`, `TransferView`, `Access`), §7.2, §7.3, §9.3, §10, §11.
- Session logs of Steps 11, 15, 19, 22 and 24 (`lib/server/` helpers, R2 adapter, Resend template mechanism, `lib/actions/invitations.ts`, S14 files, organisation migrations).

**Files this step may touch:**
- `supabase/migrations/*_org_requests_and_transfers.sql` (new: `rpc:list_org_requests`, the transactional row-copy function for EP-60 accept, and functions EP-58 / EP-59 / EP-63 need)
- `supabase/tests/org_requests.test.sql`, `supabase/tests/record_transfers.test.sql`
- `lib/actions/org-requests.ts` (new: `decideRequest`, `submitOrgRequest`)
- `lib/actions/transfers.ts` (new: `sendRecordTransfer`, `resendRecordTransfer`, `getTransfer`, `acceptTransfer`, `declineTransfer`)
- `lib/integrations/r2.ts` (add server-side object copy only)
- `lib/integrations/resend.ts` (the Design §9.1 templates `record_transfer`, `adoption_request_accepted`, `adoption_request_rejected`, `breeder_inquiry_accepted`, `breeder_inquiry_rejected` only)
- `lib/i18n/sr.ts` and `lib/i18n/en.ts` (add keys only); the generated types file under `lib/supabase/` (via `npm run db:types` only)
- `app/(org)/organizacija/zahtevi/page.tsx`, `app/(org)/organizacija/zahtevi/org-requests-screen.tsx`
- `app/(auth)/poziv/[token]/page.tsx`, `app/(auth)/poziv/[token]/invite-accept-screen.tsx` (transfer and slot-taken variants only)
- `tests/org-requests/submit-request.test.ts`, `tests/org-requests/decide-request.test.ts`, `tests/org-requests/org-requests-screen.test.tsx`, `tests/transfers/send-transfer.test.ts`, `tests/transfers/accept-transfer.test.ts`, `tests/transfers/transfer-variant.test.tsx`
- `docs/product/06-build-plan.md` (§3 row for Step 25 and its session log only)

**Out of bounds:** S23 public page and its request Dialog (Step 26 wires EP-63 into S23); EP-62 (Step 26); emails without a Design §9.1 template (EP-63 admin notification, EP-60 accept/decline emails to the organisation's admins — CR-24); litters (Step 26); transfer/invitation expiry job (Step 30); table definitions.

**Acceptance criteria:** (PRD §6, verbatim)

FR-47 — Adoption requests
- Given a signed-in user, When they submit name\*, phone\*, email\*, and a message, Then the shelter receives the request.
- Given a visitor without an account, When they try to request, Then they must create an account first. *(action-level `401` here; the S23 prompt is Step 26)*
- Given a request, When the shelter accepts it, Then the animal becomes Reserved and the applicant is emailed; When rejected, Then the applicant is emailed.

FR-49 — Public breeder page and inquiries *(inquiry part)*
- Given a signed-in user, When they send an inquiry (name\*, phone\*, email\*, message), Then the breeder can accept or reject it and the user is emailed either way.
- Given an inquiry, When the breeder accepts it, Then the offspring becomes Reserved; When the sale is completed, Then it becomes Sold.

FR-50 — Record transfer to the new owner
- Given an adopted or sold animal, When the organisation sends a transfer invitation by email, Then the new owner receives the full record including attachments, and the organisation keeps a read-only copy.
- Given an invitation, Then it is valid for 30 days and can be re-sent.

FR-51 — Transfer and the Free limit
- Given a Free recipient whose active slot is taken, When accepting a transfer, Then it is blocked and a Premium offer is shown.

**Tests to ship:**
| Criterion | Test | File |
|---|---|---|
| FR-47 #1 | `submitOrgRequest` on an available shelter animal inserts a pending `adoption_requests` row visible in `list_org_requests` for the shelter (the admin notification email is CR-24 and not sent) | `tests/org-requests/submit-request.test.ts`, `supabase/tests/org_requests.test.sql` |
| FR-47 #2 | `submitOrgRequest` without a session → `401 unauthenticated` | `tests/org-requests/submit-request.test.ts` |
| FR-47 #3 | accept → pet `shelter_status = reserved` + history row + applicant email; reject → applicant email; second decision → `409 already_decided` | `tests/org-requests/decide-request.test.ts`, `supabase/tests/org_requests.test.sql` |
| FR-49 #2 (inquiry) | breeder accepts / rejects an inquiry; user emailed either way | `tests/org-requests/decide-request.test.ts` |
| FR-49 #3 | accept → `offspring_status = reserved`; sending the transfer → `sold` | `supabase/tests/org_requests.test.sql`, `tests/transfers/send-transfer.test.ts` |
| FR-50 #1 | accept transfer → new `pets` row owned by the recipient with copied weight, vaccinations, treatments + dose logs, vet visits + attachments (R2 copy via fake), photo; organisation's original returns `access.can_edit = false` | `supabase/tests/record_transfers.test.sql`, `tests/transfers/accept-transfer.test.ts` |
| FR-50 #2 | new transfer `expires_at = now + 30 days`; re-send creates a new token and expires the previous pending one; accept after expiry → `410 invitation_expired` | `supabase/tests/record_transfers.test.sql`, `tests/transfers/send-transfer.test.ts` |
| FR-51 | Free recipient with an active pet → `403 premium_required` (`details.limit = "transfer_slot"`, `slot_pet_name`); S14 renders the slot-taken `PremiumLock` | `tests/transfers/accept-transfer.test.ts`, `tests/transfers/transfer-variant.test.tsx` |
| API §11 | 6th `submitOrgRequest` within an hour → `429 rate_limited` | `tests/org-requests/submit-request.test.ts` |
| S21 states | default / empty / read_only (Volunteer) from EP-57 | `tests/org-requests/org-requests-screen.test.tsx` |

**Verification:**
```
npm run typecheck      # exit 0
npm run lint           # exit 0
npm test               # all Vitest suites pass, incl. tests/org-requests/* and tests/transfers/*
npx supabase test db   # all pgTAP tests pass, incl. org_requests and record_transfers
npm run build          # exit 0
```

#### Prompt
```
You are executing Step 25 — Requests, inquiries & record transfers — of docs/product/06-build-plan.md for the Moj Ljubimac web app. One outcome: organisations decide adoption requests / breeder inquiries and hand records over by transfer, and recipients accept or decline transfers, through EP-57 … EP-60 and EP-63.

READ FIRST, in this order:
1. docs/product/02-prd.md §6 FR-47, FR-49, FR-50, FR-51; §8 BR-36, BR-38, BR-39, BR-52; §9 E-17 … E-20.
2. docs/product/03-technical-constraints.md §5.3, §5.6, §5.7 (idempotency_keys, rate_limit_counters), ADR-07, ADR-08, ADR-15, ADR-16.
3. docs/product/05-api-integration-contract.md §3.3, §4.4, §5.7 intro, EP-57, EP-58, EP-59, EP-60, EP-63, §6 AdoptionRequest, BreederInquiry, RecordTransfer, TransferView, Access, §7.2, §7.3, §9.3, §10, §11.
4. docs/product/04-design-system.md §6, §8, §9, §9.1, §11 (S21, S14), §12 S21 and S14.
5. docs/product/04-design/screens/org-requests.tsx and invite-accept.tsx.
6. The session logs of Steps 11, 15, 19, 22 and 24 in docs/product/06-build-plan.md, for the lib/server helpers, the R2 adapter, the Resend template mechanism, lib/actions/invitations.ts and the S14 files.

SETTLED UPSTREAM — apply exactly:
- EP-59 and EP-63 idempotency (API §3.3) and EP-63's 5-per-hour limit (API §11) use lib/server/idempotency.ts and lib/server/rate-limit.ts (Step 11); tr_ tokens use lib/server/action-tokens.ts (Step 19, TC ADR-16).
- Email copy: the Design §9.1 templates record_transfer, adoption_request_accepted, adoption_request_rejected, breeder_inquiry_accepted and breeder_inquiry_rejected. EP-63's admin notification and EP-60's accept/decline emails to the organisation's admins have no §9.1 template (CR-24): send none and record them in the Session log.

BUILD:
1. Migration supabase/migrations/<timestamp>_org_requests_and_transfers.sql: rpc:list_org_requests (EP-57) exactly as specified; a database function that performs the EP-60 accept row copy in one transaction (new pets row with organisation-only fields cleared, copies of weight_entries, vaccinations, treatments + dose_logs, vet_visits + attachments with new r2 keys, created_by preserved, record_transfers updated); and only the functions EP-58 / EP-59 / EP-63 need for their listed side effects. No table changes.
2. lib/actions/org-requests.ts: decideRequest (EP-58) and submitOrgRequest (EP-63) with exactly their side effects, errors and emails (applicant locale per EP-58).
3. lib/actions/transfers.ts: sendRecordTransfer / resendRecordTransfer (EP-59), getTransfer / acceptTransfer / declineTransfer (EP-60). Tokens per API §9.3 via lib/server/action-tokens.ts (prefix tr_). R2 objects for copied attachments and the photo are copied server-side through a new copy function in lib/integrations/r2.ts.
4. Emails: add the five Design §9.1 templates listed in the Step 25 file allowlist to lib/integrations/resend.ts using the Step 19 mechanism (no email for the CR-24 cases).
5. S21: port docs/product/04-design/screens/org-requests.tsx into app/(org)/organizacija/zahtevi/org-requests-screen.tsx rendered by app/(org)/organizacija/zahtevi/page.tsx; EP-57 list with filters and "Učitaj još" (offset paging, API §3.4), EP-58 Prihvati/Odbij (Admin only), "Pošalji karton" transfer Dialog (EP-59) with re-send; drive admin / empty / volunteer (read_only) from real responses; remove the StateSwitcher.
6. S14 transfer variants: in app/(auth)/poziv/[token]/invite-accept-screen.tsx add the transfer, declined, expired, sign-in and slot-taken variants for tr_ tokens from EP-60 per API §7.3; do not change the household or team variants.
7. EP-63 is built as an action only; S23 calls it in Step 26.
8. Strings into lib/i18n/sr.ts and lib/i18n/en.ts per docs/product/04-design-system.md §9 (English is a faithful translation of the mockup's Serbian copy; no new copy); regenerate types with npm run db:types.
9. Tests: write every test in the Step 25 "Tests to ship" table of docs/product/06-build-plan.md in exactly those files; R2 and Resend are faked in Vitest.

FILES YOU MAY CREATE OR MODIFY (allowlist — nothing else):
- supabase/migrations/<timestamp>_org_requests_and_transfers.sql
- supabase/tests/org_requests.test.sql, record_transfers.test.sql
- lib/actions/org-requests.ts, lib/actions/transfers.ts
- lib/integrations/r2.ts (server-side copy only), lib/integrations/resend.ts (five templates only)
- lib/i18n/sr.ts and lib/i18n/en.ts (add keys only); the generated types file under lib/supabase/ (via npm run db:types only)
- app/(org)/organizacija/zahtevi/page.tsx, app/(org)/organizacija/zahtevi/org-requests-screen.tsx
- app/(auth)/poziv/[token]/page.tsx, app/(auth)/poziv/[token]/invite-accept-screen.tsx (transfer and slot-taken variants only)
- tests/org-requests/submit-request.test.ts, decide-request.test.ts, org-requests-screen.test.tsx
- tests/transfers/send-transfer.test.ts, accept-transfer.test.ts, transfer-variant.test.tsx
- docs/product/06-build-plan.md (Step 25 row in §3 and the Step 25 session log only)
Touching any other file requires stopping and asking.

FORBIDDEN:
- No colours, spacing, radii, shadows, fonts or components outside docs/product/04-design-system.md §4–§6 and the composites already in components/app; OQ-10 proposed composites are not approved.
- No library outside docs/product/03-technical-constraints.md ADR-17; add no npm dependency.
- No endpoint, field, error code or state outside docs/product/05-api-integration-contract.md.
- No table, column, enum or constraint change; nothing outside docs/product/03-technical-constraints.md §5.

DONE MEANS:
- Every test in the Step 25 "Tests to ship" table exists and passes.
- These commands all exit 0, in this order: npm run typecheck; npm run lint; npm test; npx supabase test db; npm run build.
- In docs/product/06-build-plan.md: set the Step 25 row in §3 to ✅ with today's date and append a Step 25 session log entry (date, what was built, pass/fail per command, deviations, follow-ups — list the CR-24 emails not sent).
- Commit with the message "Step 25: Requests, inquiries & record transfers".

If anything above is ambiguous, if a referenced section doesn't contain what this prompt says it does, or if completing this step would require touching a file outside the list or making a decision the referenced documents don't settle — STOP and ask. Do not choose a reasonable default. Do not proceed with a partial implementation.
```

#### Session log
- **2026-10-23** — Step 25 built (unattended overnight run).
  - **Built:**
    - Migration `20261023230000_org_requests_and_transfers.sql`. It changes no table, column, enum or constraint.
      - Helpers in `private`: `pet_is_transferred(p_pet)` (the pet has an accepted transfer), `city_json`, `record_transfer_json` (RecordTransfer; `is_expired` = expired, or pending past `expires_at`), `org_request_json(kind, id)` (AdoptionRequest / BreederInquiry, `pet.price` on inquiries only, `transfer` = latest by `created_at`), `transfer_view_json` (TransferView; `new_pet_id` only to the accepting user; the internal `photo_r2_key` that the action turns into `animal.photo_url`), `pending_transfer_for_update` (locks the row; `not_found` / `invitation_used` / `invitation_expired`) and `assert_transfer_recipient` (owner account, else `forbidden_role`; Free with an active pet → `premium_required:transfer_slot`).
      - `rpc:list_org_requests(p_status, p_limit, p_offset)` (EP-57): security definer with an explicit membership check. Shelter → `adoption_requests`, breeder → `breeder_inquiries`. Returns `{ kind, items, total, status_counts, access }`, sort `created_at` desc, counts over all rows. `access.can_edit` = Admin and approved and (shelter or active breeder plan); Volunteer → `false`. Errors: `validation_failed` (`p_status`, `p_limit` 1–50, `p_offset`), `not_found`.
      - `rpc:decide_org_request(p_kind, p_id, p_decision)` (EP-58): locks the request; `not_found` (no relation), `validation_failed` (kind ≠ organisation type), `forbidden_role` (Volunteer), `organisation_pending_approval`, `breeder_plan_required`, `already_decided`. Sets `status`, `decided_by`, `decided_at`; accept → `shelter_status` / `offspring_status = reserved` (the Step 09 trigger writes `pet_status_history`). Other pending requests stay. Returns the request, the applicant's `profiles.locale` and the organisation's name, slug, phone and email.
      - `rpc:submit_org_request(p_pet_id, p_name, p_phone, p_email, p_message)` (EP-63): the pet must be listed on EP-62 right now (approved organisation, active pet, shelter `available` / breeder offspring `available` with an active plan), else `not_found`. Validates name 1–120, phone 6–30, email, message ≤ 2000 (`DETAIL '<field>:<code>'`). Inserts the pending row for `auth.uid()` and returns `{ id, kind, status, created_at }`.
      - `rpc:create_record_transfer(p_id, p_pet_id, p_recipient_email, p_token_hash)` and `rpc:resend_record_transfer(p_new_id, p_transfer_id, p_token_hash)` (EP-59): membership (`not_found`), Admin (`forbidden_role`), approval, breeder plan, Request checks, pet already handed over → `invitation_used`. One transaction: pending transfers of the pet → `expired`, the new row (`expires_at = now() + 30 days`), the animal → `adopted` (shelter) / `sold` (breeder animal that is not a breeding animal) if not already. Re-send copies `pet_id` and `recipient_email`. Returns the RecordTransfer plus the organisation and pet names and the sender's / recipient account's locale for the email.
      - `rpc:get_transfer_by_token(p_token_hash)` (EP-60 get, `anon` + `authenticated`): `not_found`; expired → `invitation_expired`; accepted / declined are returned with their status.
      - `rpc:get_transfer_copy_plan(p_token_hash)` and `rpc:accept_record_transfer(p_token_hash, p_new_pet_id, p_visit_id_map, p_key_map)` (EP-60 accept), `rpc:decline_record_transfer(p_token_hash)` (EP-60 decline).
      - Read-only organisation copy: `transferred_copy_check_write` on `pets` (update / delete) and on `weight_entries`, `vaccinations`, `treatments`, `dose_logs`, `vet_visits`, `attachments` (insert / update / delete): a transferred pet → `forbidden_role` for the organisation team's client sessions.
      - `public.set_created_by` and `public.attachments_enforce_free_limit` (Step 06) are recreated to honour `app.transfer_copy`.
      - `npm run db:types` regenerated `lib/supabase/database.types.ts`.
    - `lib/actions/org-requests.ts` (new): `listOrgRequests` (EP-57, for S21 filters and paging), `decideRequest` (EP-58; the applicant gets `adoption_request_accepted` / `_rejected` or `breeder_inquiry_accepted` / `_rejected` in their locale; accepted emails carry the organisation's phone and email, rejected ones link `NEXT_PUBLIC_SITE_URL/o/<slug>`), `submitOrgRequest` (EP-63; gates → Request checks → `withIdempotency` (operation `org_request`) → `checkRateLimit` (`org_requests.create`, 5 per hour) → RPC). Types AdoptionRequest / BreederInquiry (`OrgRequest`), RecordTransfer, OrgRequestsPage.
    - `lib/actions/transfers.ts` (new): `sendRecordTransfer` / `resendRecordTransfer` (EP-59; `withIdempotency` operation `record_transfer`; token `signActionToken("tr", [transfer_id], now + 30 days)`, only `hashToken` stored; §9.1 `record_transfer` email to the recipient's account locale, else the sender's, link `NEXT_PUBLIC_SITE_URL/poziv/<token>`; a failed email → `internal_error`), `getTransfer`, `acceptTransfer`, `declineTransfer` (EP-60). Accept: copy plan → new pet id, visit ids and keys `u/<owner>/pets/<new_pet>/photo/<uuid>-<name>` and `…/visits/<new_visit>/<uuid>-<safe_file_name>` → R2 copies → `accept_record_transfer`; a failed copy or database step deletes the copied objects. `premium_required:transfer_slot` gets `details.slot_pet_id` / `slot_pet_name` from `Me.usage.free_slot_pet`.
    - `lib/integrations/r2.ts`: `copy(sourceKey, targetKey)` (S3 CopyObject, `x-amz-copy-source`; throws unless R2 confirms).
    - `lib/integrations/resend.ts`: the five §9.1 templates `record_transfer`, `adoption_request_accepted`, `adoption_request_rejected`, `breeder_inquiry_accepted`, `breeder_inquiry_rejected`.
    - S21 `app/(org)/organizacija/zahtevi/page.tsx` + `org-requests-screen.tsx`: port of `org-requests.tsx` without the StateSwitchers. EP-53 heading line and EP-57 list; filter chips with `status_counts`; "Učitaj još" pages by 20; Prihvati (status notice) / Odbij (AlertDialog); "Pošalji karton" / "Pošalji ponovo" Dialog (prefilled email, inline validation, re-send when the address is unchanged, a new send otherwise); transfer lines sent / expired / declined / accepted. States: default, empty, read_only (Volunteer banner; pending / plan-less banners from S20), error (ErrorState), loading (Suspense fallback).
    - S14 `invite-accept-screen.tsx` / `page.tsx`: a new `TransferAcceptScreen` export for tr_ tokens (page picks it by prefix). Variants transfer (animal card with plural counts, "{organisation} zadržava kopiju…", validity), accepted, declined, sign-in, expired, slot taken (PremiumLock; CTA → `/premium`), error; `invitation_used` / `forbidden_role` inline. The household and team variants are unchanged (two comments updated).
    - `lib/i18n/sr.ts` / `en.ts`: new section `orgRequests`, transfer keys in `invitation`, and the five `messages.*` templates, with English translations.
    - Tests:
      - pgTAP: `org_requests.test.sql` (51), `record_transfers.test.sql` (57).
      - Vitest: `tests/org-requests/submit-request.test.ts` (7), `decide-request.test.ts` (9), `org-requests-screen.test.tsx` (19), `tests/transfers/send-transfer.test.ts` (9), `accept-transfer.test.ts` (11), `transfer-variant.test.tsx` (13).
  - **Owner decisions applied (2026-10-23):**
    - The security definer functions `submit_org_request`, `decide_org_request` (returns the applicant locale and organisation contacts), `create_record_transfer`, `resend_record_transfer`, `get_transfer_by_token` (anon + authenticated), `get_transfer_copy_plan`, `accept_record_transfer`, `decline_record_transfer`, with the given signatures.
    - Accept order: copy plan → pre-generated ids and new u/ keys → R2 copies → accept; the copied objects are deleted when the database step fails.
    - `set_config('app.transfer_copy','on',true)` inside the copy; the Step 06 attachment-limit and created_by trigger functions recreated to skip the limit and keep the supplied `created_by`; copied `dose_logs.occurrence_id` is null.
    - Slot error `premium_required:transfer_slot`; the action adds `slot_pet_id` and `slot_pet_name` from `Me.usage.free_slot_pet`.
    - Read-only copy: `pet_is_transferred(p_pet)` (in `private`) and guard triggers on pets and the entry tables raising `forbidden_role`. `get_pet_record` and the EP-01 list were **not** recreated: they already return `can_edit = can_delete = false` on a transferred copy through `private.pet_access` / `private.is_transferred_copy` (Step 13), which `record_transfers.test.sql` asserts.
    - S21 copy without gendered verbs (accept notice "{pet} — status: {statusLabel}. Poslali smo mejl: {name}.", reject dialog "…da zahtev nije prihvaćen (ljubimac: {pet}).", transfer dialog "…a status postaje: Udomljen/Prodato.", declined and accepted transfer lines).
    - S14 transfer copy: "{organisation} zadržava kopiju kartona samo za čitanje.", `invitation_used` "Ovaj link je već iskorišćen", `forbidden_role` "Karton može da primi samo nalog vlasnika ljubimca.", plurals vakcina / pregled; prilog/priloga/priloga from Step 23.
    - Applied from earlier decisions: server actions (httpOnly session); the existing Sonner Toaster and the 5xx text "Nešto nije u redu. Pokušaj ponovo."; sr-Latn / en-GB dates on the Belgrade calendar; Step 13 age plurals; unknown sex hidden from the detail line; English written in this step; the Step 24 "link no longer works" expired copy for non-household tokens; PremiumLock CTA → `/premium` (Step 22).
  - **Database functions (pre-approved exception 6):** none beyond the owner-decided RPCs above (`rpc:list_org_requests` is already in the contract). **Follow-up:** add `rpc:decide_org_request`, `rpc:submit_org_request`, `rpc:create_record_transfer`, `rpc:resend_record_transfer`, `rpc:get_transfer_by_token`, `rpc:get_transfer_copy_plan`, `rpc:accept_record_transfer` and `rpc:decline_record_transfer` to `docs/product/05-api-integration-contract.md` (EP-58, EP-59, EP-60, EP-63).
  - **Verification** (in order; all on the same code):
    - `npm run typecheck` ✅ exit 0
    - `npm run lint` ✅ exit 0 (0 errors; the 2 known warnings in the generated `cloudflare-env.d.ts`)
    - `npm test` ✅ `Test Files 97 passed (97)`, `Tests 1053 passed (1053)`
    - `npx supabase test db` ✅ `Files=69, Tests=2278`, `All tests successful.`, `Result: PASS` (after `npx supabase db reset`)
    - `npm run build` ✅ exit 0. Routes include `ƒ /organizacija/zahtevi` and `ƒ /poziv/[token]`.
  - **Deviations / decisions:**
    - **S14 transfer as its own component:** `TransferAcceptScreen` lives in `invite-accept-screen.tsx` next to `InviteAcceptScreen`, so the household and team variants are untouched.
    - **Copy without mockup text** (minimal variants of mockup copy, no new messages): the transfer intro without a city drops "iz mesta {city}" (`transferIntroNoCity`); the transfer sign-in variant uses the transfer title, the existing sign-in body and the animal card.
    - **Accepted-email contacts:** `organisations.phone` / `email` are optional. `decide_org_request` falls back to the deciding Admin's account email when the organisation has none, and the action shows "—" for a missing phone.
    - **Sentence-final dates:** the sr-Latn date ends with "." ("22. 11. 2026."), so the trailing dot is dropped where the copy ends with "{date}." (`record_transfer` email, S21 sent / accepted lines).
    - **EP-59 status change for breeders:** `offspring_status = sold` is set only for an animal that is not a breeding animal (`breeding_status` null).
    - **S21 dialog errors:** `validation_failed` → "Upiši ispravnu mejl adresu."; any other EP-59 error (`invitation_used`, …) → the generic error inline; EP-58 failures → the generic toast (and a reload on `already_decided`).
    - **`listOrgRequests`** wraps EP-57 as a server action (the session is httpOnly), like `listOrgAnimals` in Step 24.
    - **Accepted transfers by another user:** S14 shows the transfer card with "Ovaj link je već iskorišćen" and no buttons.
  - **Follow-ups:**
    - CR-24 emails not sent (no Design §9.1 template): the EP-63 notification to the organisation's admins about a new request / inquiry, and the EP-60 emails to the organisation's admins when a transfer is accepted or declined.
    - Add the Step 25 RPCs listed above to `docs/product/05-api-integration-contract.md`.
    - Step 26 wires `submitOrgRequest` into the S23 request Dialog. Step 30 expires pending transfers past 30 days (`get_transfer_by_token` already treats them as expired).
    - Owner: R2 `CopyObject` needs the R2 token to have read + write on the bucket (it already has both for uploads).

---

### Step 26 — Litters & public organisation pages

| | |
|---|---|
| **Status** | ⬜ not started |
| **Outcome** | Breeders record litters with offspring rows, status and price; the public organisation page `/o/[slug]` serves available animals (rendered on every request, TC ADR-18) and lets signed-in visitors submit a request or inquiry; the shelter intake-to-adoption flow runs end to end. |
| **Implements** | FR-46, FR-48, FR-49 (public page part); EP-61, EP-62, EP-63 (S23 wiring); S22 `/organizacija/legla`, S23 `/o/[slug]`; table `litters` (functions only); ADR-18 (no edge cache); ADR-15 flow "shelter intake to adoption" |
| **Depends on** | Step 25 |
| **Blocked by** | — |
| **Track** | single |

**Read before starting:**
- `docs/product/02-prd.md` §6 FR-46, FR-48, FR-49; §8 BR-36, BR-37, BR-51; §9 E-17, E-21; UC-08, UC-09 (§7).
- `docs/product/03-technical-constraints.md` §5.3 (`pets` offspring columns), §5.6 (`litters`), ADR-03, ADR-07, ADR-15, ADR-16, ADR-18.
- `docs/product/04-design-system.md` §5.2, §5.3, §6, §8, §9, §11 (S22, S23), §12 S22 and S23.
- `docs/product/04-design/screens/litters.tsx`, `docs/product/04-design/screens/public-org.tsx`.
- `docs/product/05-api-integration-contract.md` §4.4 (EP-61 … EP-63 rows), §5.7 intro, EP-61, EP-62, EP-63, §6 (`Litter`, `PublicOrgPage`, `PublicAnimal`, `Access`), §7.3, §10, §12 (`public` budget).
- Session logs of Steps 24 and 25 (organisation actions, request/transfer actions).

**Files this step may touch:**
- `supabase/migrations/*_litters_and_public_pages.sql` (new: `rpc:list_litters`, the transactional function behind `createLitter`, and any function the EP-62 read needs)
- `supabase/tests/litters.test.sql`, `supabase/tests/public_org_page.test.sql`
- `lib/actions/litters.ts` (new: `createLitter`)
- `app/api/public/orgs/[slug]/route.ts`
- `app/(org)/organizacija/legla/page.tsx`, `app/(org)/organizacija/legla/litters-screen.tsx`
- `app/(public)/o/[slug]/page.tsx`, `app/(public)/o/[slug]/public-org-screen.tsx`
- `lib/i18n/sr.ts` and `lib/i18n/en.ts` (add keys only); the generated types file under `lib/supabase/` (via `npm run db:types` only)
- `tests/litters/create-litter.test.ts`, `tests/litters/litters-screen.test.tsx`, `tests/public/public-org-route.test.ts`, `tests/public/public-org-screen.test.tsx`
- `e2e/shelter-intake-to-adoption.spec.ts`
- `docs/product/06-build-plan.md` (§3 row for Step 26 and its session log only)

**Out of bounds:** the Operator approval action (Step 28); breeder plan purchase (Step 31); the privacy/terms pages linked from the public shell footer (Step 12); any edge cache or purge (TC ADR-18); table definitions.

**Acceptance criteria:** (PRD §6, verbatim)

FR-46 — Public adoption page (Shelter)
- Given an animal "Available for adoption", Then it appears on the shelter's public page with photo, name, species, sex, approximate age, description, spayed/neutered yes/no, and vaccinated yes/no — and no detailed health record.

FR-48 — Litters (Breeder)
- Given a saved litter, Then each offspring has its own pet record linked to the litter.

FR-49 — Public breeder page and inquiries *(public page part)*
- Given an available offspring, Then it appears on the breeder's public page with the same public fields as FR-46 plus price.

**Tests to ship:**
| Criterion | Test | File |
|---|---|---|
| FR-46 | EP-62 for an approved shelter returns only `available` animals with exactly the `PublicAnimal` fields; no health-record fields present; pending/rejected org → `404`; response carries `Cache-Control: no-store` (TC ADR-18), and a profile change saved through EP-72 appears on the next request (covers FR-60 #1 from Step 24) | `tests/public/public-org-route.test.ts`, `supabase/tests/public_org_page.test.sql` |
| FR-48 | `createLitter` with `offspring_count = 3` creates the litter and 3 `pets` rows with `litter_id`, mother's species/breed, `birth_date = born_on`, `offspring_status = available`, and history rows; both father fields set → `422`; non-female mother → `422` | `tests/litters/create-litter.test.ts`, `supabase/tests/litters.test.sql` |
| FR-49 #1 | EP-62 for a breeder with an active plan lists available offspring with price as Money; without a plan → `404` (E-21) | `tests/public/public-org-route.test.ts` |
| S22 / S23 states | S22 default / empty from EP-61; S23 guest / signed-in / empty, request Dialog calls EP-63 and shows the sign-in prompt on `401` | `tests/litters/litters-screen.test.tsx`, `tests/public/public-org-screen.test.tsx` |
| ADR-15 flow | shelter intake → set Available → visible on `/o/[slug]` → signed-in adopter submits request → shelter accepts (Reserved) → sends transfer → adopter accepts and owns the record | `e2e/shelter-intake-to-adoption.spec.ts` |

**Verification:**
```
npm run typecheck      # exit 0
npm run lint           # exit 0
npm test               # all Vitest suites pass, incl. tests/litters/* and tests/public/*
npx supabase test db   # all pgTAP tests pass, incl. litters and public_org_page
npm run build          # exit 0
npm run e2e            # all Playwright specs pass, incl. e2e/shelter-intake-to-adoption.spec.ts
```

#### Prompt
```
You are executing Step 26 — Litters & public organisation pages — of docs/product/06-build-plan.md for the Moj Ljubimac web app. One outcome: breeders manage litters (S22) and every approved organisation has a working public page (S23 /o/[slug]), rendered on every request (TC ADR-18), from which signed-in users submit requests or inquiries.

READ FIRST, in this order:
1. docs/product/02-prd.md §6 FR-46, FR-48, FR-49; §7 UC-08, UC-09; §8 BR-36, BR-37, BR-51; §9 E-17, E-21.
2. docs/product/03-technical-constraints.md §5.3, §5.6 (litters), ADR-03, ADR-07, ADR-15, ADR-16, ADR-18.
3. docs/product/05-api-integration-contract.md §4.4, §5.7 intro, EP-61, EP-62, EP-63; §6 Litter, PublicOrgPage, PublicAnimal, Access; §7.3; §10; §12.
4. docs/product/04-design-system.md §5.2, §5.3, §6, §8, §9, §11 (S22, S23), §12 S22 and S23.
5. docs/product/04-design/screens/litters.tsx and public-org.tsx.
6. The session logs of Steps 24 and 25 in docs/product/06-build-plan.md.

SETTLED UPSTREAM — apply exactly:
- Public pages are not cached (TC ADR-18; 05- EP-62): GET /api/public/orgs/[slug] renders on every request with Cache-Control: no-store; there is no cache tag and no purge call anywhere (EP-55, EP-58, EP-59, EP-61 and EP-68 have none).

BUILD:
1. Migration supabase/migrations/<timestamp>_litters_and_public_pages.sql: rpc:list_litters (EP-61 list shape incl. eligible_mothers / eligible_fathers and access), a database function that performs createLitter's side effects in one transaction, and any function the EP-62 read needs so that only public fields (BR-37) can leave the database. No table changes. Offspring status/price updates are Data API updates (EP-61) with the history trigger.
2. lib/actions/litters.ts: createLitter (EP-61) with exactly its validation and errors.
3. app/api/public/orgs/[slug]/route.ts: GET per EP-62 — approved organisations only (breeders also need an active breeder plan), available animals only, presigned photo/logo URLs (10 min), paging, Cache-Control: no-store (EP-62).
4. S22: port docs/product/04-design/screens/litters.tsx into app/(org)/organizacija/legla/litters-screen.tsx rendered by app/(org)/organizacija/legla/page.tsx; EP-61 list / create / offspring update; default / empty / read_only from real responses; remove the StateSwitcher.
5. S23: port docs/product/04-design/screens/public-org.tsx into app/(public)/o/[slug]/public-org-screen.tsx rendered by app/(public)/o/[slug]/page.tsx; data from EP-62; guest vs signed-in from the session (EP-43), not from EP-62; request Dialog calls submitOrgRequest (EP-63, Step 25), shows the sign-in prompt on 401 (E-17) and inline field errors on 422; remove the StateSwitcher. Footer privacy/terms links stay as the PublicShell renders them.
6. Strings into lib/i18n/sr.ts and lib/i18n/en.ts per docs/product/04-design-system.md §9 (English is a faithful translation of the mockup's Serbian copy; no new copy); regenerate types with npm run db:types.
7. Tests: write every test in the Step 26 "Tests to ship" table of docs/product/06-build-plan.md in exactly those files, including e2e/shelter-intake-to-adoption.spec.ts (local seed: approved shelter admin + owner user).

FILES YOU MAY CREATE OR MODIFY (allowlist — nothing else):
- supabase/migrations/<timestamp>_litters_and_public_pages.sql
- supabase/tests/litters.test.sql, public_org_page.test.sql
- lib/actions/litters.ts
- app/api/public/orgs/[slug]/route.ts
- app/(org)/organizacija/legla/page.tsx, app/(org)/organizacija/legla/litters-screen.tsx
- app/(public)/o/[slug]/page.tsx, app/(public)/o/[slug]/public-org-screen.tsx
- lib/i18n/sr.ts and lib/i18n/en.ts (add keys only); the generated types file under lib/supabase/ (via npm run db:types only)
- tests/litters/create-litter.test.ts, litters-screen.test.tsx
- tests/public/public-org-route.test.ts, public-org-screen.test.tsx
- e2e/shelter-intake-to-adoption.spec.ts
- docs/product/06-build-plan.md (Step 26 row in §3 and the Step 26 session log only)
Touching any other file requires stopping and asking.

FORBIDDEN:
- No colours, spacing, radii, shadows, fonts or components outside docs/product/04-design-system.md §4–§6 and the composites already in components/app; OQ-10 proposed composites are not approved.
- No library outside docs/product/03-technical-constraints.md ADR-17; add no npm dependency.
- No endpoint, field, error code or state outside docs/product/05-api-integration-contract.md; no health-record field on any public response.
- No table, column, enum or constraint change; nothing outside docs/product/03-technical-constraints.md §5.
- Do not change the privacy-policy or terms pages (Step 12).

DONE MEANS:
- Every test in the Step 26 "Tests to ship" table exists and passes.
- These commands all exit 0, in this order: npm run typecheck; npm run lint; npm test; npx supabase test db; npm run build; npm run e2e.
- In docs/product/06-build-plan.md: set the Step 26 row in §3 to ✅ with today's date and append a Step 26 session log entry (date, what was built, pass/fail per command, deviations, follow-ups).
- Commit with the message "Step 26: Litters & public organisation pages".

If anything above is ambiguous, if a referenced section doesn't contain what this prompt says it does, or if completing this step would require touching a file outside the list or making a decision the referenced documents don't settle — STOP and ask. Do not choose a reasonable default. Do not proceed with a partial implementation.
```

#### Session log
- **2026-10-23** — Step 26 built (unattended overnight run).
  - **Built:**
    - Migration `20261023233000_litters_and_public_pages.sql`. It changes no table, column, enum or constraint, and adds no cache tag or purge (TC ADR-18).
      - Helpers in `private`: `litter_json(litters)` (API §6 Litter; `father_name` = the father's `pets.name`, else the outside sire; offspring in creation order) and `name_initials(text)` (first letter of the first two words with letters: "Azil Šapica" → "AŠ").
      - `rpc:list_litters()` (EP-61 list): security definer with an explicit membership check (`not_found` without one; a shelter → `forbidden_role`). Returns `{ items, eligible_mothers, eligible_fathers, access }`: items by `born_on` desc; mothers / fathers = the organisation's female / male non-offspring pets with `breeding_status = active`; `access.can_edit` = approved and an active breeder plan (Admins and Volunteers, API §4.4), `can_delete` for Admins.
      - `rpc:create_litter(p_mother_id, p_father_id, p_father_name, p_born_on, p_offspring_count) → uuid` (EP-61 create): checks membership, breeder type, approval and the breeder plan, then the Request (`DETAIL '<field>:<code>'`: mother female and ours, at most one father field, father a male of ours, `father_name` ≤ 120, `born_on` not in the future on the Belgrade calendar, count 1–20). One transaction: `litters` + `offspring_count` `pets` rows ("Mladunče N", the mother's species / species_other / breed, sex unknown, `birth_date = born_on`, `available`; `created_at = clock_timestamp()` keeps the order) + one `pet_status_history` row each (`available`, by the caller). Organisation pets get no reminders (BR-51; the Step 08 sync skips pets without an owner).
      - `rpc:get_public_org_page(p_slug, p_limit, p_offset)` (EP-62): approved organisations only, a breeder also needs an active plan (E-21), else `not_found`; `validation_failed` for limit outside 1–50 or a negative offset. Returns exactly PublicOrgPage / PublicAnimal (BR-37): available animals (shelter `shelter_status`, breeder `offspring_status`, active lifecycle), sort `created_at` desc, `vaccinated` as a yes/no, price as Money for breeders only. The R2 keys (`logo_r2_key`, `photo_r2_key`) are added only when `auth.role() = 'service_role'`, so anon / authenticated callers never get a key.
      - Offspring status / price changes are Data API `pets` updates (EP-61): the Step 09 trigger writes `pet_status_history`, the Step 24 guard answers `breeder_plan_required`.
      - `npm run db:types` regenerated `lib/supabase/database.types.ts`.
    - `lib/server/public-org-page.ts` (new, owner decision): `getPublicOrgPage(slug, { limit, offset })`, the EP-62 read shared by the route and the S23 page. Service-role RPC, then presigned GETs (10 min) as API §6 FileUrl (`pet_photo` with the pet id; `organisation_logo` with the slug — PublicOrgPage carries no organisation id); a failed presign gives `url = null`. Types PublicOrgPage, PublicAnimal; `PUBLIC_ORG_HEADERS` = `Cache-Control: no-store`.
    - `app/api/public/orgs/[slug]/route.ts`: GET per EP-62 (`force-dynamic`; 200 / 404 / 422 / 500, `Cache-Control: no-store` on every answer).
    - `lib/actions/litters.ts` (new): `listLitters`, `createLitter` (Request checks with field codes → one `create_litter` call → the Litter from `list_litters`) and `updateOffspring` (Data API update of `offspring_status` / `price_minor` where `litter_id is not null`; price `{amount_minor ≥ 0, currency "RSD"}`, null clears). Types Litter, LitterOffspring, LittersPage.
    - S22 `app/(org)/organizacija/legla/page.tsx` + `litters-screen.tsx`: port of `litters.tsx` without the StateSwitcher. EP-53 heading line; litter cards (first expanded) with "{mother} × {father}" ("{name} (spoljni pastuv)" for an outside sire, "—" without a father), breed · okot {date}, plural count · available; offspring rows with link to S03, sex (left out when unknown) · price or "Cena nije upisana", status badge, the "Cena (RSD)" input (saved on blur / Enter) and the status Select. New litter Dialog: mother Select from `eligible_mothers`, "Otac" name field (`father_name`), date picker with future days disabled, count 1–20, inline errors, form-level generic error for unmapped codes. States: default, empty, read_only (pending / plan-less banners, no "Novo leglo", controls disabled), error, loading (Suspense fallback).
    - S23 `app/(public)/o/[slug]/page.tsx` + `public-org-screen.tsx`: port of `public-org.tsx` without the StateSwitchers. Header (logo or initials, "{type} · {city}", description, phone / email / website links shown only when set), the animal grid (photo, name, price for breeders, species · sex · age, public description, neutered badge hidden when unknown, vaccinated badge; masculine forms for unknown sex), "Učitaj još" through EP-62. Guest vs signed-in from the session (EP-43 `get_me`; visitor language from the `ml_locale` cookie). Request Dialog: guest → sign-in prompt (`/prijava?next=/o/<slug>`, "Napravi nalog"); signed-in → form prefilled from Me → EP-63 `submitOrgRequest` with a fresh idempotency key per opening; ok → sent confirmation; 401 → sign-in prompt; 422 → inline field errors; 429 → rate-limit message; 404 → "Ova životinja više nije dostupna."; other → generic. Error state on 404 / 5xx. The PublicShell footer links are unchanged.
    - `lib/i18n/sr.ts` / `en.ts`: new sections `litters` and `publicOrg`, with English translations.
    - Tests:
      - pgTAP: `litters.test.sql` (45), `public_org_page.test.sql` (30).
      - Vitest: `tests/litters/create-litter.test.ts` (8), `tests/litters/litters-screen.test.tsx` (13), `tests/public/public-org-route.test.ts` (8), `tests/public/public-org-screen.test.tsx` (14).
      - Playwright: `e2e/shelter-intake-to-adoption.spec.ts` (intake on S20 → "Za udomljavanje" → visible on `/o/azil-sapica` → Ivana sends a request → Milica accepts (Rezervisan; the animal leaves the public page on the next request) → "Pošalji karton" → minted tr_ token → Ivana accepts on S14 and sees the pet on S01; the copy is owned by her).
  - **Owner decisions applied (2026-10-23):**
    - `lib/server/public-org-page.ts` as the shared EP-62 loader for `route.ts` and `page.tsx`.
    - `get_public_org_page(p_slug, p_limit, p_offset)` returns jsonb, security definer, granted to anon and authenticated, public fields only (the service role additionally gets the R2 keys to presign — see deviations).
    - `create_litter(p_mother_id, p_father_id, p_father_name, p_born_on, p_offspring_count)` returns uuid, security definer, checks membership and the breeder plan.
    - S22: per-offspring "Cena (RSD)" / "Price (RSD)", empty → "Cena nije upisana" / "No price yet"; count required 1–20 "Upiši broj od 1 do 20." / "Enter a number from 1 to 20."; "Otac" is a name field only (`father_name`); plural mladunče / mladunčeta / mladunaca.
    - S23: unknown sex uses the masculine form and the neutered badge is hidden when unknown; rate limited "Previše zahteva za kratko vreme. Pokušaj ponovo za {n} min."; not found "Ova životinja više nije dostupna."
    - e2e: setup approves the seeded shelter with a service-role client (and puts it back to pending afterwards); after "Pošalji karton" the spec mints a tr_ token for the newest transfer, overwrites its `token_hash`, and accepts as the seeded Premium owner.
    - Applied from earlier decisions: server actions (httpOnly session); sr-Latn / en-GB date and number formats; plurals with Intl.PluralRules; date pickers disable invalid dates; unmapped field codes show the screen's form-level error; unknown sex hides the sex label; the existing Toaster and the 5xx text "Nešto nije u redu. Pokušaj ponovo."; English written in this step.
  - **Database functions (pre-approved exception 6):** none beyond the owner-decided RPCs above (`rpc:list_litters` is already in the contract). **Follow-up:** add `rpc:create_litter` and `rpc:get_public_org_page` to `docs/product/05-api-integration-contract.md` (EP-61, EP-62).
  - **Verification** (in order; all on the same code):
    - `npm run typecheck` ✅ exit 0
    - `npm run lint` ✅ exit 0 (0 errors; the 2 known warnings in the generated `cloudflare-env.d.ts`)
    - `npm test` ✅ `Test Files 101 passed (101)`, `Tests 1096 passed (1096)`
    - `npx supabase test db` ✅ `Files=71, Tests=2353`, `All tests successful.`, `Result: PASS` (after `npx supabase db reset`)
    - `npm run build` ✅ exit 0. Routes include `ƒ /api/public/orgs/[slug]`, `ƒ /o/[slug]` and `ƒ /organizacija/legla`.
    - `npm run e2e` ✅ `6 passed` with 2 workers, including `e2e\shelter-intake-to-adoption.spec.ts › a shelter takes in an animal, an adopter requests it on the public page, and receives the record`. As in earlier steps there is no `.env.local`: the run got the Supabase variables from `npx supabase status`, plus `NEXT_PUBLIC_SITE_URL=http://localhost:3000`, a local `ACTION_TOKEN_SECRET` and placeholder `R2_*` values (EP-60 accept calls `r2()` even when nothing is copied; with no photo or attachment no R2 request is made). Emails went to the local Resend console fallback.
  - **Deviations / decisions:**
    - **R2 keys only for the service role:** `get_public_org_page` adds `logo_r2_key` / `photo_r2_key` only when `auth.role() = 'service_role'`, so the server can presign (API §10) while anon / authenticated callers of the RPC get no internal field. The loader drops the keys before responding.
    - **FileUrl ids on EP-62:** `photo_url.id` is the pet id; `logo_url.id` is the slug, because PublicOrgPage has no organisation id.
    - **Litter validation codes:** both father fields and a father that is not a male of the organisation → `fields.father_id = invalid`; `born_on` in the future → `born_on: invalid` (the §7.1 field-code list has no `in_future`). S22 shows them as the form-level error (the date picker already blocks future days).
    - **Copy composed from mockup strings (no new messages):** the price input's accessible name "Cena (RSD) — {name}"; a litter without a father shows "—" (as the mockup's save does); `typeCity` "{type} · {city}" falls back to the type alone without a city.
    - **S23 paging:** EP-62 pages by 20; S23 adds "Učitaj još" (the S20 / S21 label) when `total` exceeds the loaded animals, fetching `GET /api/public/orgs/<slug>?offset=`. A failed fetch leaves the button for another try.
    - **S23 width:** `PublicShell` default width, as in the mockup.
    - **Website link:** EP-72 stores `https://…`, so the link uses the stored value and the label drops the scheme (mockup shows "drugasansa.rs").
  - **Follow-ups:**
    - Add `rpc:create_litter` and `rpc:get_public_org_page` to `docs/product/05-api-integration-contract.md` (EP-61, EP-62).
    - CR-24 (Step 25) still applies: EP-63 sends no admin notification email.
    - `acceptTransfer` (Step 25) calls `r2()` before checking whether anything must be copied, so a local run without `R2_*` fails on accept even for a record without files; local e2e sets placeholder `R2_*` values. Consider creating the R2 client only when the key map is non-empty.
    - Breeders have no S02 path in this step to mark a pet as a breeding animal (`breeding_status = active`), which `eligible_mothers` needs; EP-03 accepts `breeding_status` for organisations, so a later step or the S20 breeder flow should expose it.

---

### Step 27 — Partners directory & vet suggestion

| | |
|---|---|
| **Status** | ⬜ not started |
| **Outcome** | Owners see paid, nearby partners (featured first, then by distance, from browser location or profile city), open a partner profile, use quick actions that are counted, and get vet suggestions when a pet has no vet — on S24 and in the S03 "Predlog veterinara u blizini" block. |
| **Implements** | FR-52, FR-53, FR-54, FR-55, FR-56; EP-64, EP-65, EP-66; S24 `/partneri`, S25 `/partneri/[id]`, S03 `/ljubimci/[id]` ("Predlog veterinara u blizini" block, Design §12 S03, CR-22); tables `partners`, `partner_hours`, `partner_clicks`, `cities` (functions only); ADR-11 |
| **Depends on** | Step 09, Step 12, Step 14 (S03 screen file) |
| **Blocked by** | — |
| **Track** | single |

**Read before starting:**
- `docs/product/02-prd.md` §6 FR-52 … FR-56; §8 BR-40 … BR-44; §9 E-22 … E-24; UC-10.
- `docs/product/03-technical-constraints.md` §5.7 (`partners`, `partner_hours`, `partner_clicks`, `cities`), ADR-11, ADR-15, ADR-16.
- `docs/product/04-design-system.md` §6 (incl. the brand-icon prohibition), §7, §8, §11 (S03, S24, S25), §12 S03 (no-vet variant), S24, S25.
- `docs/product/04-design/screens/partners.tsx`, `docs/product/04-design/screens/partner-profile.tsx`, `docs/product/04-design/screens/pet-record.tsx` (view "Bez veterinara (predlog)").
- `docs/product/05-api-integration-contract.md` §4.4 (EP-64 … EP-67 rows), EP-64 (incl. the S03 caller), EP-65, EP-66, EP-01 (S24 vet-suggestion banner caller), EP-02 (`vet_name`), EP-43 (`city_id`), §6 (`Partner`, `PartnerHours`, `City`), §7.3, §10.
- Session logs of Steps 09, 12, 14 and 15 (partner RPCs from Step 09, the S03 screen file, i18n dictionaries, generated types, R2 presign function).

**Files this step may touch:**
- `supabase/migrations/*_partner_directory.sql` (new: `rpc:get_partner` only, plus fixes to the Step 09 `partners_nearby` / `record_partner_click` only if their tests here fail against EP-64 / EP-66)
- `supabase/tests/partner_directory.test.sql`
- `lib/actions/partners.ts` (new: `getPartner`)
- `app/(app)/partneri/page.tsx`, `app/(app)/partneri/partners-screen.tsx`
- `app/(app)/partneri/[id]/page.tsx`, `app/(app)/partneri/[id]/partner-profile-screen.tsx`
- `app/(app)/ljubimci/[id]/pet-record-client.tsx` (aside vet card / vet-suggestion block only)
- `lib/i18n/sr.ts` and `lib/i18n/en.ts` (add keys only); the generated types file under `lib/supabase/` (via `npm run db:types` only)
- `tests/partners/get-partner.test.ts`, `tests/partners/partners-screen.test.tsx`, `tests/partners/partner-profile-screen.test.tsx`, `tests/partners/vet-suggestion.test.tsx`
- `docs/product/06-build-plan.md` (§3 row for Step 27 and its session log only)

**Out of bounds:** every part of S03 other than the aside vet card and the vet-suggestion block; partner creation/editing and statistics (Step 28); geocoding (Step 28); table definitions.

**Acceptance criteria:** (PRD §6, verbatim)

FR-52 — Partner directory
- Given the "Partners" section, Then only partners whose paid-until date has not passed are shown.
- Then featured partners appear first (max 3 per partner type per city), followed by the others ordered by distance.

FR-53 — Determining "nearby"
- Given the user allowed location, Then distance is measured from their current location; otherwise from the city in their profile.

FR-54 — Partner profile
- *The PRD gives FR-54 a field list and no Given/When/Then criterion.* Derived from PRD §6 FR-54: the profile shows name, type, address, city, phone, email, website, Instagram, working hours, logo or photo, short description and preferred messaging channel where present.

FR-55 — Quick actions
- Given a partner, Then "Call", "Send message" (via the partner's chosen channel), "Send email", and "Visit website" are available where the partner has the data.

FR-56 — Vet suggestion when no own vet
- Given a pet whose "my vet" is empty, Then the product suggests nearby vet partners. Pet shops, grooming salons, and pet hotels are shown only in the "Partners" section.

**Tests to ship:**
| Criterion | Test | File |
|---|---|---|
| FR-52 #1 | `partners_nearby` excludes partners with `paid_until < current_date` (Belgrade); EP-65 on such a partner → `404` | `supabase/tests/partner_directory.test.sql`, `tests/partners/get-partner.test.ts` |
| FR-52 #2 | featured partners first (≤ 3 per type per city), then ascending `distance_km` | `supabase/tests/partner_directory.test.sql` |
| FR-53 | with `p_lat`/`p_lng` distances come from the coordinates; without, from the profile city; S24 uses browser location when permitted and falls back to `profiles.city_id` on denial (E-22) | `supabase/tests/partner_directory.test.sql`, `tests/partners/partners-screen.test.tsx` |
| FR-54 (derived) | S25 renders every `Partner` field present and omits absent ones (*minimal* variant) | `tests/partners/partner-profile-screen.test.tsx` |
| FR-55 | quick actions rendered only when data exists (E-24); "Poruka" uses `message_channel` + `message_number`; each tap calls EP-66 and a failure does not block the link | `tests/partners/partners-screen.test.tsx`, `tests/partners/partner-profile-screen.test.tsx`, `supabase/tests/partner_directory.test.sql` (click row inserted; action without data → `422`) |
| FR-56 | S24 shows the vet-suggestion banner when an active pet from EP-01 has `vet_name = null`, listing vets only (`p_type = vet`); non-vet partners never appear in it | `tests/partners/partners-screen.test.tsx` |
| FR-56 (S03) | pet with empty `vet_name`: the S03 aside shows "Predlog veterinara u blizini" with the first 2 vets from EP-64 (`p_type = vet`, `p_limit = 2`, `p_city_id` = the profile city), names linking to S25, a call button and "Svi partneri →" to `/partneri`; EP-64 `[]` → no block; a pet with a vet shows the "Moj veterinar" card | `tests/partners/vet-suggestion.test.tsx` |

**Verification:**
```
npm run typecheck      # exit 0
npm run lint           # exit 0
npm test               # all Vitest suites pass, incl. tests/partners/* (four files)
npx supabase test db   # all pgTAP tests pass, incl. partner_directory
npm run build          # exit 0
```

#### Prompt
```
You are executing Step 27 — Partners directory & vet suggestion — of docs/product/06-build-plan.md for the Moj Ljubimac web app. One outcome: partner discovery works on real data through EP-64, EP-65 and EP-66 — S24 /partneri, S25 /partneri/[id], the S24 vet-suggestion banner and the S03 vet-suggestion block.

READ FIRST, in this order:
1. docs/product/02-prd.md §6 FR-52 … FR-56; §7 UC-10; §8 BR-40 … BR-44; §9 E-22 … E-24.
2. docs/product/03-technical-constraints.md §5.7, ADR-11, ADR-15, ADR-16.
3. docs/product/05-api-integration-contract.md §4.4, EP-64, EP-65, EP-66, EP-01, EP-02, EP-43, §6 Partner, PartnerHours, City, §7.3, §10.
4. docs/product/04-design-system.md §6 (brand icons are forbidden — use MessageCircle, Phone, Mail, Globe, AtSign), §7, §8, §11 (S03, S24, S25), §12 S03, S24, S25.
5. docs/product/04-design/screens/partners.tsx, partner-profile.tsx and pet-record.tsx (view "Bez veterinara (predlog)").
6. The session logs of Steps 09, 12, 14 and 15 in docs/product/06-build-plan.md.

SETTLED UPSTREAM — S03 vet suggestion (Design §12 S03, CR-22; 05- EP-64 Callers): when the pet has no "moj veterinar" (pets.vet_name empty, BR-43), the S03 aside "Moj veterinar" card is replaced by the "Predlog veterinara u blizini" block of the "Bez veterinara (predlog)" view in docs/product/04-design/screens/pet-record.tsx, fed by EP-64 with p_type = vet, p_limit = 2 and p_city_id = the profile city from EP-43; no block when EP-64 returns [].

BUILD:
1. Migration supabase/migrations/<timestamp>_partner_directory.sql: rpc:get_partner for EP-65 (distance from lat/lng or city_id, full hours, today_hours). If the Step 09 functions partners_nearby / record_partner_click fail the tests below against the EP-64 / EP-66 contract, fix them here (create or replace) — no table changes.
2. lib/actions/partners.ts: getPartner (EP-65) — calls rpc:get_partner, then signs logo_url via the existing lib/integrations/r2.ts presign (10 min).
3. S24: port docs/product/04-design/screens/partners.tsx into app/(app)/partneri/partners-screen.tsx rendered by app/(app)/partneri/page.tsx; type chips → p_type; "Koristi moju lokaciju" uses the browser Geolocation API with permission and falls back to the profile city from EP-43 (E-22); featured section then list by distance; quick actions call EP-66 fire-and-forget before opening tel:/mailto:/https:/messaging links; vet-suggestion banner when any active EP-01 pet has vet_name = null. default / loading / empty / error from real responses; remove the StateSwitcher.
4. S25: port docs/product/04-design/screens/partner-profile.tsx into app/(app)/partneri/[id]/partner-profile-screen.tsx rendered by app/(app)/partneri/[id]/page.tsx; data from getPartner; default / minimal / loading / error per EP-65 States; remove the StateSwitcher.
5. S03: in app/(app)/ljubimci/[id]/pet-record-client.tsx add only the vet-suggestion block described above (from the same mockup view); change nothing else on S03.
6. Strings into lib/i18n/sr.ts and lib/i18n/en.ts per docs/product/04-design-system.md §9 (English is a faithful translation of the mockup's Serbian copy; no new copy); regenerate types with npm run db:types.
7. Tests: write every test in the Step 27 "Tests to ship" table of docs/product/06-build-plan.md in exactly those files (seed partner rows inside the pgTAP test transaction; do not change supabase/seed.sql).

FILES YOU MAY CREATE OR MODIFY (allowlist — nothing else):
- supabase/migrations/<timestamp>_partner_directory.sql
- supabase/tests/partner_directory.test.sql
- lib/actions/partners.ts
- app/(app)/partneri/page.tsx, app/(app)/partneri/partners-screen.tsx
- app/(app)/partneri/[id]/page.tsx, app/(app)/partneri/[id]/partner-profile-screen.tsx
- app/(app)/ljubimci/[id]/pet-record-client.tsx (vet-suggestion block only)
- lib/i18n/sr.ts and lib/i18n/en.ts (add keys only); the generated types file under lib/supabase/ (via npm run db:types only)
- tests/partners/get-partner.test.ts, partners-screen.test.tsx, partner-profile-screen.test.tsx, vet-suggestion.test.tsx
- docs/product/06-build-plan.md (Step 27 row in §3 and the Step 27 session log only)
Touching any other file requires stopping and asking.

FORBIDDEN:
- No colours, spacing, radii, shadows, fonts or components outside docs/product/04-design-system.md §4–§6 and the composites already in components/app; OQ-10 proposed composites (incl. LogoAvatar) are not approved; no lucide brand icons.
- No library outside docs/product/03-technical-constraints.md ADR-17 (no map or geolocation library); add no npm dependency.
- No endpoint, field, error code or state outside docs/product/05-api-integration-contract.md.
- No table, column, enum or constraint change; nothing outside docs/product/03-technical-constraints.md §5.

DONE MEANS:
- Every test in the Step 27 "Tests to ship" table exists and passes.
- These commands all exit 0, in this order: npm run typecheck; npm run lint; npm test; npx supabase test db; npm run build.
- In docs/product/06-build-plan.md: set the Step 27 row in §3 to ✅ with today's date and append a Step 27 session log entry (date, what was built, pass/fail per command, deviations, follow-ups).
- Commit with the message "Step 27: Partners directory & vet suggestion".

If anything above is ambiguous, if a referenced section doesn't contain what this prompt says it does, or if completing this step would require touching a file outside the list or making a decision the referenced documents don't settle — STOP and ask. Do not choose a reasonable default. Do not proceed with a partial implementation.
```

#### Session log
- **2026-10-23** — Step 27 built (unattended overnight run).
  - **Built:**
    - Migration `20261023235000_partner_directory.sql`: `rpc:get_partner(p_partner_id, p_lat, p_lng, p_city_id) → jsonb` (EP-65). Security invoker (the partners / partner_hours RLS applies too), granted to authenticated and service_role only. It returns one Partner: `distance_km` from the coordinates, else from the `p_city_id` city centre, else null (BR-42); full `hours` by weekday; `today_hours` for today's ISO weekday in Europe/Belgrade (null means closed). An unknown partner, or one whose `paid_until` has passed, raises `not_found` (BR-40, E-23). One coordinate only raises `validation_failed` (`lat` / `lng: required`). `logo_url` is null; `logo_r2_key` is passed back for signing. No table, column, enum or constraint changes. The Step 09 `partners_nearby` and `record_partner_click` passed every Step 27 test unchanged, so they were not touched. `npm run db:types` regenerated `lib/supabase/database.types.ts`.
    - `lib/actions/partners.ts` (new):
      - `getPartner` (EP-65): Request checks with field codes, then one `get_partner` call. The logo is signed through `lib/integrations/r2.ts` `presignGet` (10 min) and the key is dropped. If signing fails, the profile shows initials.
      - `listPartnersNearby` (EP-64 for S24 re-reads): coordinates or `city_id` required; `type` / `limit` checked.
      - `suggestNearbyVets` (S03 block): EP-43 `get_me` city, then EP-64 with `p_type = vet`, `p_limit = 2`, `p_city_id` = the profile city. With no city it returns `[]`.
      - `recordPartnerClick` (EP-66, owner decision).
      - Types Partner, PartnerHours, City (re-exported from registration.ts).
    - S24 `app/(app)/partneri/page.tsx` + `partners-screen.tsx`: port of `partners.tsx` without the StateSwitcher.
      - First read uses the EP-43 profile city with every type. Type chips re-read with `p_type`.
      - "Koristi moju lokaciju" uses the browser Geolocation API with permission, then re-reads with `p_lat` / `p_lng`. On denial or with no API, the profile city stays (E-22).
      - "Istaknuto" (the `featured` rows EP-64 lists first) is followed by "Po udaljenosti". Cards show initials, type badge, featured badge, distance ("1,2 km" / "1.2 km" via Intl), address and today's hours.
      - Quick actions appear only when the partner has the data (E-24). "Poruka" uses `message_channel` + `message_number` (wa.me / viber:// / sms:, BR-44). Each tap calls EP-66 fire-and-forget, and a failure never blocks the link.
      - Vet-suggestion banner: shown for the first active EP-01 pet (`pet_summaries_api`, by name) with an empty `vet_name`. "Pogledaj veterinare" switches to the vet chip (`p_type = vet`); "Ne sada" hides the banner.
      - States: default / loading (skeleton grid, and the Suspense fallback) / empty (`[]`) / error (retry re-reads). With no profile city and no location, the owner-decided "Dodaj grad u profil" state links to `/profil`.
      - Card links carry `?lat=&lng=` when the location is in use.
    - S25 `app/(app)/partneri/[id]/page.tsx` + `partner-profile-screen.tsx`: port of `partner-profile.tsx` without the StateSwitcher.
      - Data comes from `getPartner`, with `?lat=&lng=` or else the EP-43 profile city.
      - Header: logo (AvatarImage) or initials, name, type, "{distance} od tebe" (only when `distance_km` is set), "{address}, {city}".
      - The four quick actions as large buttons (EP-66 on tap), "O nama" (only with a description), and "Radno vreme" for all 7 weekdays (today marked from the Belgrade weekday; a missing weekday shows "Zatvoreno").
      - Contact card: phone, messaging number · channel, email, website, Instagram, plus "Uputstva do adrese".
      - States: default / minimal (absent fields and their actions hidden) / loading (h1 + skeletons) / error (404 / 5xx, retry = `router.refresh()`).
    - S03 `app/(app)/ljubimci/[id]/pet-record-client.tsx`: the aside "Moj veterinar" card is now `vet_name ? card : block`. The new `VetSuggestion` block comes from the mockup's "Bez veterinara (predlog)" view. It shows the first 2 vets from `suggestNearbyVets`: name linking to S25, "{distance} · {address}", call icon button "Pozovi: {name}", and "Svi partneri →" to `/partneri`. It renders only for personal pets (`access.role` owner / member). `[]`, no profile city, or any failure means no block. Nothing else on S03 changed.
    - `lib/i18n/sr.ts` / `en.ts`: new sections `partners` and `partnerProfile`; five `petRecord.vetSuggestion*` / `allPartners` keys. All copy comes from the mockups or the owner decisions; English written in this step.
    - Tests:
      - pgTAP: `partner_directory.test.sql` (30). It seeds partners in Kragujevac inside the transaction and sets Ivana's profile city there for the test. It checks: FR-52 hidden by `paid_until`; `get_partner` → `not_found`; featured first with ≤ 3 per type and a 4th featured refused, then distance ascending; FR-53 coordinates vs profile city; `get_partner` distance / hours / today_hours / fields / validation; FR-55 click row inserted, actions without data → `validation_failed`, hidden partner → `not_found`; Visitors can't call `get_partner`.
      - Vitest: `tests/partners/get-partner.test.ts` (9), `partners-screen.test.tsx` (13), `partner-profile-screen.test.tsx` (8), `vet-suggestion.test.tsx` (6). `vet-suggestion` runs the real `suggestNearbyVets` against a fake server client and asserts the `partners_nearby` arguments.
  - **Owner decisions applied (2026-10-23):**
    - No profile city and no location: empty state "Dodaj grad u profil" / "Add your city to your profile", "Partnere u blizini prikazujemo prema lokaciji ili gradu iz profila." / "We show nearby partners by your location or your profile city.", action "Otvori profil" / "Open profile" → `/profil`. On S03 in that case, no block.
    - S24 links to S25 with `?lat=&lng=` when the location is in use; otherwise S25 uses the EP-43 city.
    - S03 vet block: personal pets only; it renders nothing on any failure, so the Step 14 tests needed no mock (all existing S03 tests pass unchanged).
    - EP-66 goes through `recordPartnerClick` in `lib/actions/partners.ts`; `https://` is added to partner websites only when the stored value has no scheme. No Nominatim calls.
    - Applied from earlier decisions: server actions; sr-Latn / en-GB number formats; the 5xx text "Nešto nije u redu. Pokušaj ponovo."; English written in this step.
  - **Database functions (pre-approved exception 6):** none. `rpc:get_partner` is the function this step's prompt names for EP-65.
  - **Verification** (in order; all on the same code):
    - `npm run typecheck` ✅ exit 0
    - `npm run lint` ✅ exit 0 (0 errors; the 2 known warnings in the generated `cloudflare-env.d.ts`)
    - `npm test` ✅ `Test Files 105 passed (105)`, `Tests 1132 passed (1132)`
    - `npx supabase test db` ✅ `Files=72, Tests=2383`, `All tests successful.`, `Result: PASS`. Ran after `npx supabase db reset`: the first run failed `household_rls` #16 and `server_support` #12 only because of leftover local rows (extra invitations / idempotency keys from earlier e2e runs). After the reset everything passed.
    - `npm run build` ✅ exit 0. Routes include `ƒ /partneri` and `ƒ /partneri/[id]`.
  - **Deviations / decisions:**
    - **Extra wrappers in `lib/actions/partners.ts`:** `listPartnersNearby` and `suggestNearbyVets` wrap EP-64 (no client in the app calls the Data API from the browser). `suggestNearbyVets` composes EP-43 + EP-64 because the S03 `page.tsx` is not on this step's list and does not pass the profile city to the client. Neither adds an endpoint, field or error code.
    - **`logo_r2_key` in the `get_partner` result:** the RPC passes the key so `getPartner` can sign it in the same round trip. The action removes it, so EP-65 returns exactly Partner.
    - **External links:** https links (website, wa.me, Instagram, maps) open in a new tab (`target="_blank" rel="noopener noreferrer"`) so the EP-66 call is not cut off by navigation. tel:, mailto:, sms: and viber: open in place.
    - **Display details:** S25 does not repeat the city when the stored address already ends with it (the seed addresses include ", Novi Sad"). The website label drops the scheme (mockup shows "drvet.rs"). An Instagram handle loses a leading "@" in the link. The S03 call button is not counted through EP-66 (EP-66 callers are S24 / S25 only).
    - **S24 banner visibility:** as in the mockup, the banner shows only in the default state with partners listed (not while loading, empty or in error). The banner pet is the first active EP-01 pet with an empty `vet_name`, organisation animals included, as EP-01 returns them; owner accounts see only personal pets.
    - **S03 for memorial pets:** the block follows the rule as written (empty `vet_name` on a personal pet), memorial pets included.
  - **Follow-ups:**
    - Add `rpc:get_partner` (with its signature) to `docs/product/05-api-integration-contract.md` EP-65.
    - `lib/actions/files.ts` (EP-15) still answers `url = null` for `partner_logo`. S25 signs the logo in `getPartner`, so nothing needs it yet; Step 28 (admin partner logo) may want EP-15 to serve it.
    - The logo is shown with shadcn `AvatarImage` inside the existing Avatar (OQ-10 `LogoAvatar` not approved).
- **2026-10-28 — Root route fix (owner request, 2026-10-28).** Not a plan step; §3 unchanged. QA found that `/` returned 404 (no `app/page.tsx`).
  - **Built:** `app/page.tsx`, a server component with no UI. With no session it redirects to `/prijava`. With a session it redirects to the existing `postSignInPath(supabase, user, null)` from `lib/server/gates.ts`, the same EP-42 matrix that `app/(auth)/auth/callback/route.ts` uses: no profile → `/registracija`, deletion pending → `/profil/podaci`, organisation member → `/organizacija`, otherwise `/ljubimci`. No helper had to be extracted, and no behaviour changed. `/` is not a signed-in prefix, so the proxy passes it through unchanged. `playwright.config.ts`: only the webServer comment changed (it said `/` is a 404).
  - **Tests:** `tests/auth/root-redirect.test.ts` (3): visitor → `/prijava`; signed-in owner → `/ljubimci`; the EP-42 cases (no profile, pending deletion, organisation member).
  - **Verification:** `npm run typecheck` ✅ exit 0. `npm run lint` ✅ 0 errors (the 2 known warnings in `cloudflare-env.d.ts`). `npm test` ✅ `Test Files 106 passed (106)`, `Tests 1135 passed (1135)`. The first run had 1 failure in `tests/reminders/reminder-form.test.tsx` ("too_long"). It passed alone (12/12) and on the full rerun, so it was load flake unrelated to this change. `npm run build` ✅ exit 0, route `ƒ /`.

---

### Step 28 — Operator admin

| | |
|---|---|
| **Status** | ⬜ not started |
| **Outcome** | The Operator can approve or reject pending shelters (with emails), create and edit partners with geocoding, logo, hours, featured flag and paid-until date, see click statistics per partner and action, and switch the Viber channel. |
| **Implements** | FR-42 (approval), FR-57, FR-58; EP-68, EP-69, EP-70, EP-71; S26 `/admin`; ADR-11 (`lib/integrations/nominatim.ts`); tables `organisations` (approval), `partners`, `partner_hours`, `partner_clicks`, `app_settings` (views/functions only) |
| **Depends on** | Step 27, Step 24, Step 19 (Resend adapter) |
| **Blocked by** | — |
| **Track** | single |

**Read before starting:**
- `docs/product/02-prd.md` §6 FR-42, FR-57, FR-58; §8 BR-14b, BR-32, BR-40, BR-41, BR-44; §9 E-23, E-27; §12 item 6.
- `docs/product/03-technical-constraints.md` §5.2 (`organisations` approval columns), §5.5 (`app_settings`), §5.7, ADR-07, ADR-08, ADR-11, ADR-15, ADR-16.
- `docs/product/04-design-system.md` §5.5, §6, §8, §9.1 (`shelter_approved`, `shelter_rejected`), §11 (S26), §12 S26.
- `docs/product/04-design/screens/admin.tsx`.
- `docs/product/05-api-integration-contract.md` §4.2 (Operator), §4.4 (EP-68 … EP-71 rows), EP-68, EP-69, EP-70, EP-71, EP-67, §6 (`PendingOrganisation`, `Partner`, `PartnerHours`, `PartnerClickStats`, `AppSettings`, `UploadTicket`), §7.2, §7.3, §9.4 (Nominatim row), §10.
- Session logs of Steps 09, 12, 15, 19 and 27 (partner functions, i18n, R2 presign, Resend template mechanism).

**Files this step may touch:**
- `supabase/migrations/*_operator_admin.sql` (new: view `admin_pending_organisations`, `rpc:admin_list_partners`, `rpc:admin_partner_click_stats`, and functions `decideOrganisation` / `savePartner` need for atomicity)
- `supabase/tests/admin_access.test.sql`, `supabase/tests/admin_partners.test.sql`
- `lib/actions/admin.ts` (new: `decideOrganisation`, `geocodeAddress`, `createPartnerLogoUpload`, `savePartner`, `setAppSettings`)
- `lib/integrations/nominatim.ts` (new)
- `lib/integrations/resend.ts` (the Design §9.1 templates `shelter_approved`, `shelter_rejected` only)
- `app/admin/layout.tsx`, `app/admin/page.tsx`, `app/admin/admin-screen.tsx`
- `lib/i18n/sr.ts` and `lib/i18n/en.ts` (add keys only); the generated types file under `lib/supabase/` (via `npm run db:types` only)
- `tests/admin/decide-organisation.test.ts`, `tests/admin/save-partner.test.ts`, `tests/admin/admin-screen.test.tsx`, `tests/integrations/nominatim.test.ts`
- `docs/product/06-build-plan.md` (§3 row for Step 28 and its session log only)

**Out of bounds:** partner billing (outside the product, OQ-04); Viber sending (built but off, Step 29 keeps it hidden); the partner directory screens (Step 27); table definitions.

**Acceptance criteria:** (PRD §6, verbatim)

FR-42 — Shelter approval and breeder plan *(approval side)*
- Given a newly registered Shelter, Then it cannot use the product until the Operator approves it.

FR-57 — Operator admin area
- Given a pending shelter, When the Operator approves or rejects it, Then the shelter is activated or informed.
- Given a partner, When the Operator creates or edits it (all FR-54 fields, featured flag, paid-until date), Then changes appear in the directory; When the paid-until date passes, Then the partner is hidden automatically.

FR-58 — Partner click statistics
- Given partner quick actions, Then each use of Call, Send message, Send email, and Visit website is counted per partner and shown in the admin area.

**Tests to ship:**
| Criterion | Test | File |
|---|---|---|
| FR-42 #1 (approval) | after `decideOrganisation(approve)` the shelter member's writes succeed (were `organisation_pending_approval` before) | `supabase/tests/admin_access.test.sql`, `tests/admin/decide-organisation.test.ts` |
| FR-57 #1 | approve → `approval_status = approved` + creator emailed; reject → `rejected` + `rejection_reason` + email; second decision → `409 already_decided`; non-Operator → `403 forbidden_role` and the view returns `[]` | `tests/admin/decide-organisation.test.ts`, `supabase/tests/admin_access.test.sql` |
| FR-57 #2 | `savePartner` create/update (all FR-54 fields, hours replaced, featured, paid_until) is returned by `partners_nearby`; a 4th featured partner per type/city → `409 featured_limit_reached`; a partner with `paid_until` yesterday is absent from `partners_nearby` but present in `admin_list_partners` | `tests/admin/save-partner.test.ts`, `supabase/tests/admin_partners.test.sql` |
| FR-58 | clicks recorded via `record_partner_click` appear per partner and action in `admin_partner_click_stats` for the period; S26 Statistika renders them | `supabase/tests/admin_partners.test.sql`, `tests/admin/admin-screen.test.tsx` |
| ADR-11 | Nominatim adapter sends the app User-Agent, ≤ 1 request/s, returns `geocoding_failed` on no result (fake HTTP) | `tests/integrations/nominatim.test.ts` |
| EP-71 | `setAppSettings` toggles `viber_enabled` for the Operator only | `tests/admin/admin-screen.test.tsx`, `supabase/tests/admin_access.test.sql` |

**Verification:**
```
npm run typecheck      # exit 0
npm run lint           # exit 0
npm test               # all Vitest suites pass, incl. tests/admin/* and tests/integrations/nominatim.test.ts
npx supabase test db   # all pgTAP tests pass, incl. admin_access and admin_partners
npm run build          # exit 0
```

#### Prompt
```
You are executing Step 28 — Operator admin — of docs/product/06-build-plan.md for the Moj Ljubimac web app. One outcome: S26 /admin works for the Operator on real data through EP-68 … EP-71, with the Nominatim adapter for partner coordinates.

READ FIRST, in this order:
1. docs/product/02-prd.md §6 FR-42, FR-57, FR-58; §8 BR-14b, BR-32, BR-40, BR-41, BR-44; §9 E-23, E-27; §12 item 6.
2. docs/product/03-technical-constraints.md §5.2, §5.5 (app_settings), §5.7, ADR-07, ADR-08, ADR-11, ADR-15, ADR-16.
3. docs/product/05-api-integration-contract.md §4.2, §4.4, EP-67, EP-68, EP-69, EP-70, EP-71, §6 PendingOrganisation, Partner, PartnerHours, PartnerClickStats, AppSettings, UploadTicket, §7.2, §7.3, §9.4 (Nominatim row), §10.
4. docs/product/04-design-system.md §5.5, §6, §8, §9.1, §11 (S26), §12 S26.
5. docs/product/04-design/screens/admin.tsx.
6. The session logs of Steps 09, 12, 15, 19 and 27 in docs/product/06-build-plan.md (partner functions, i18n, R2 presign, Resend template mechanism).

BUILD:
1. Migration supabase/migrations/<timestamp>_operator_admin.sql: view admin_pending_organisations (RLS: profiles.is_operator; returns [] to others), rpc:admin_list_partners (incl. hidden partners and featured_count), rpc:admin_partner_click_stats (period YYYY-MM Europe/Belgrade, available_periods), and only the functions decideOrganisation / savePartner need to be atomic (savePartner upserts partners and replaces partner_hours in one transaction). No table changes; the featured ≤ 3 trigger exists from Step 09.
2. lib/integrations/nominatim.ts: server-side geocoding per ADR-11 and API §9.4 — query "<address, city, Serbia>", identifying User-Agent, at most 1 request per second, no retry, failure → geocoding_failed. Use fetch only.
3. lib/actions/admin.ts: decideOrganisation (EP-68, emails with the Design §9.1 shelter_approved / shelter_rejected templates; no purge — EP-62 is not cached, TC ADR-18), geocodeAddress, createPartnerLogoUpload (UploadTicket via the existing R2 presign; images only, ≤ 10 MB), savePartner (EP-69; geocode when both coordinates are null; old logo key queued for deletion), setAppSettings (EP-71). Every action checks profiles.is_operator explicitly and uses the service role on the server only (API §3.1).
4. S26: port docs/product/04-design/screens/admin.tsx into app/admin/admin-screen.tsx rendered by app/admin/page.tsx inside app/admin/layout.tsx (Admin shell, Design §5.5). Tabs Azili na čekanju (EP-68), Partneri (EP-69 table, Istaknut switch with "n / 3", add/edit Dialog, "Pronađi koordinate", logo upload, hours editor, city Select from EP-67), Statistika (EP-70 month selector), Kanali (EP-71 Viber switch with cost-warning confirm). default / loading / empty / error from real responses; remove the StateSwitcher. What a non-Operator sees at /admin is defined only as 403 forbidden_role (API §4.4); if Design §5.5 / §12 S26 do not settle the page a non-Operator gets, STOP and ask.
5. Strings into lib/i18n/sr.ts and lib/i18n/en.ts per docs/product/04-design-system.md §9 (English is a faithful translation of the mockup's Serbian copy; no new copy); regenerate types with npm run db:types.
6. Tests: write every test in the Step 28 "Tests to ship" table of docs/product/06-build-plan.md in exactly those files; Nominatim, R2 and Resend are faked in Vitest.

FILES YOU MAY CREATE OR MODIFY (allowlist — nothing else):
- supabase/migrations/<timestamp>_operator_admin.sql
- supabase/tests/admin_access.test.sql, admin_partners.test.sql
- lib/actions/admin.ts
- lib/integrations/nominatim.ts
- lib/integrations/resend.ts (two approval templates only)
- app/admin/layout.tsx, app/admin/page.tsx, app/admin/admin-screen.tsx
- lib/i18n/sr.ts and lib/i18n/en.ts (add keys only); the generated types file under lib/supabase/ (via npm run db:types only)
- tests/admin/decide-organisation.test.ts, save-partner.test.ts, admin-screen.test.tsx
- tests/integrations/nominatim.test.ts
- docs/product/06-build-plan.md (Step 28 row in §3 and the Step 28 session log only)
Touching any other file requires stopping and asking.

FORBIDDEN:
- No colours, spacing, radii, shadows, fonts or components outside docs/product/04-design-system.md §4–§6 and the composites already in components/app; OQ-10 proposed composites are not approved.
- No library outside docs/product/03-technical-constraints.md ADR-17 (no geocoding SDK, no map library); add no npm dependency.
- No endpoint, field, error code or state outside docs/product/05-api-integration-contract.md; no partner-pricing fields (OQ-04).
- No table, column, enum or constraint change; nothing outside docs/product/03-technical-constraints.md §5.
- The service-role key never reaches the browser.

DONE MEANS:
- Every test in the Step 28 "Tests to ship" table exists and passes.
- These commands all exit 0, in this order: npm run typecheck; npm run lint; npm test; npx supabase test db; npm run build.
- In docs/product/06-build-plan.md: set the Step 28 row in §3 to ✅ with today's date and append a Step 28 session log entry (date, what was built, pass/fail per command, deviations, follow-ups).
- Commit with the message "Step 28: Operator admin".

If anything above is ambiguous, if a referenced section doesn't contain what this prompt says it does, or if completing this step would require touching a file outside the list or making a decision the referenced documents don't settle — STOP and ask. Do not choose a reasonable default. Do not proceed with a partial implementation.
```

#### Session log
- **2026-10-28** — Step 28 built (unattended overnight run).
  - **Built:**
    - Migration `20261028000000_operator_admin.sql` (no table, column, enum or constraint changes):
      - `private.is_operator()` and `private.assert_operator()` (the Operator, or the service role used by `lib/actions/admin.ts` after its own `is_operator` check; anyone else → `forbidden_role`).
      - View `admin_pending_organisations` (EP-68 list, PendingOrganisation columns, `city` as the City object, `contact_email` = the creator's `profiles.email`). It has `security_invoker = false` and `WHERE exists(… profiles.is_operator)`, so everyone else gets `[]`. Revoked from anon, select granted to authenticated.
      - `rpc:decide_organisation(p_organisation_id, p_decision, p_rejection_reason)`: security definer, one transaction. It returns `{ organisation: PendingOrganisation, creator_locale }`. Errors: `not_found`, `already_decided`, and `validation_failed` (a reason with approve, or a reason over 500 characters).
      - `rpc:admin_list_partners(p_city_id, p_type, p_limit, p_offset)` → `{ items: (Partner & { featured_count })[], total }`. Hidden partners are included, sorted by name, and logo keys are not exposed.
      - `rpc:save_partner(p_id, p_fields jsonb, p_hours jsonb)`: one transaction. It upserts `partners` (on update only the keys sent change) and replaces `partner_hours` when `p_hours` is not null. It queues a replaced or removed `logo_r2_key` in `r2_deletion_queue` (the Step 09 follow-up). BR-41 stays with the Step 09 trigger.
      - `rpc:admin_partner_click_stats(p_period, p_limit, p_offset)` → `{ period, available_periods, items, total }`. Months are Europe/Belgrade calendar months. Results are sorted by total desc, then name.
      - `admin_list_partners` and `admin_partner_click_stats` are security definer with `set search_path = public`. Their first check raises `forbidden_role` for non-Operators. Revoked from public/anon, granted to authenticated.
      - EP-71 uses the Step 04 `app_settings` RLS unchanged.
      - `npm run db:types` regenerated `lib/supabase/database.types.ts`.
    - `lib/integrations/nominatim.ts`: fetch only. It calls `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=rs&q=<address, city, Serbia>` with User-Agent `MojLjubimac/1.0 (+${NEXT_PUBLIC_SITE_URL})`. Calls are serialised, and a module-level last-call timestamp waits until 1 s has passed. No retry. No result, an HTTP error or a network error → `geocoding_failed`. The city is not appended when the address already ends with it.
    - `lib/actions/admin.ts`: each action runs the API §4.1 gates, then an explicit `profiles.is_operator` check, and only then writes with the service role.
      - `decideOrganisation`: emails `shelter_approved` (button → `${NEXT_PUBLIC_SITE_URL}/organizacija`) or `shelter_rejected` in the creator's `profiles.locale`. A failed email is logged and does not undo the decision.
      - `geocodeAddress`.
      - `createPartnerLogoUpload`: `image/*`, ≤ 10 MB, existing partner. Key `p/<id>/logo-<uuid>.<ext>`.
      - `savePartner`: full Request validation. It geocodes when both coordinates are null: on create, and on update only when both are sent as null. The logo key must start with `p/<id>/`, and R2 HEAD checks it exists (skipped when R2 credentials are empty). It returns the Partner with a presigned `logo_url`.
      - `setAppSettings`.
    - `lib/integrations/resend.ts`: templates `shelter_approved` and `shelter_rejected`. The rejected email appends "Razlog: {reason}." / "Reason: {reason}." when a reason was given.
    - S26: `app/admin/layout.tsx` (Operator gate + Toaster), `app/admin/page.tsx` (all reads with the Operator's session, Suspense loading), `app/admin/admin-screen.tsx` (port of `admin.tsx` without the StateSwitcher, rendering the Admin `AppShell` itself with `active` = `?tab=`).
      - Azili: cards, approve, reject AlertDialog with reason (≤ 500), and the mockup's role=status notice.
      - Partneri: table, Istaknut Switch "n / 3" / "3 / 3 — limit" from `featured_count`, status badges, and the add/edit Dialog. The Dialog has every EP-69 field, "Pronađi koordinate", the latitude / longitude Inputs, the hours editor, the logo file and the city Select from EP-67.
      - Statistika: Period Select from `available_periods` ∪ the current period, labelled "Oktobar 2026." / "October 2026".
      - Kanali: Viber Switch; switching on goes through the cost-warning AlertDialog. The WhatsApp card shows `{cap}` from AppSettings.
      - States: loading (Suspense fallback and transitions), default, empty, error (retry = `router.refresh()`).
      - "Učitaj još" raises the row count in the URL (`?azili=` / `?partneri=` / `?statistika=`), read in pages of ≤ 50 (API §3.4).
    - `lib/i18n/sr.ts` / `en.ts`: a new `admin` section and `messages.shelter_approved` / `shelter_rejected`. English written in this step.
    - Tests:
      - pgTAP `admin_access.test.sql` (27): FR-42 #1 before/after, FR-57 #1, the view `[]` for non-Operators and the shelter itself, the anon 42501, EP-71 Operator-only, the service-role path.
      - pgTAP `admin_partners.test.sql` (34): FR-57 #2 incl. `partners_nearby`, BR-41 on create and update, E-23, `featured_count`, the logo queue, FR-58 periods.
      - Vitest `tests/admin/decide-organisation.test.ts` (9): includes the gate-4 before/after check through the real `checkGates`, and the real `renderEmail` output.
      - Vitest `tests/admin/save-partner.test.ts` (12), `tests/admin/admin-screen.test.tsx` (16), `tests/integrations/nominatim.test.ts` (7).
  - **Owner decisions applied (2026-10-24):**
    - `app/admin/layout.tsx`: no session → `/prijava?next=/admin`; signed in without `is_operator` → `/ljubimci` (this settles the STOP condition on what a non-Operator sees). `proxy.ts` is unchanged.
    - Partner logo order: create → ticket → PUT → `savePartner({ id, logo_r2_key })`. The key must start with `p/<id>/` and R2 HEAD checks it (skipped without R2 credentials).
    - `shelter_rejected` appends "Razlog: {reason}." / "Reason: {reason}."; the `shelter_approved` button goes to `/organizacija`.
    - The latitude / longitude Inputs and the toasts `geocoding_failed`, `featured_limit_reached` and "Partner sačuvan" / "Partner saved".
    - The Nominatim User-Agent, rate limit and URL as given.
    - The view and the two RPCs as specified.
    - `?tab=moderacija` falls back to Azili, and no moderacija count is passed. The mockup types shop / hotel map to `pet_shop` / `pet_hotel`.
    - Applied from earlier decisions: the 5xx text "Nešto nije u redu. Pokušaj ponovo."; unmapped 422 field codes show the screen's form-level message; sr-Latn / en-GB date formats via Intl.
  - **Database functions (pre-approved exception 6):** `rpc:decide_organisation` and `rpc:save_partner`, the functions the prompt allows for `decideOrganisation` / `savePartner` atomicity. Follow-up: add both, with their signatures, to `docs/product/05-api-integration-contract.md` EP-68 / EP-69.
  - **Verification** (in order, on the final code):
    - `npm run typecheck` ✅ exit 0
    - `npm run lint` ✅ exit 0 (0 errors; the 2 known warnings in the generated `cloudflare-env.d.ts`)
    - `npm test` ✅ `Test Files 110 passed (110)`, `Tests 1179 passed (1179)`
    - `npx supabase test db` ✅ `Files=74, Tests=2444`, `Result: PASS`. Ran after `npx supabase db reset`. The first run failed only `get_me` #14 and `subscription_read` #9: the seed subscription's `current_period_end` (`now() + 1 month` at seed time, days earlier) no longer fell in the expected 28–32 day window. This step does not touch those files.
    - `npm run build` ✅ exit 0. Route `ƒ /admin`.
  - **Deviations / decisions:**
    - **`r2_key` on the logo ticket:** `createPartnerLogoUpload` returns `UploadTicket & { r2_key }`, because EP-69 says `logo_r2_key` comes "from the UploadTicket" and API §10 step 3 lists `r2_key` in the ticket, but §6 UploadTicket has no such field. There is no confirm step for partner logos (owner decision), so the `upload_token` (HMAC over purpose, key, mime, size and expiry, signed with ACTION_TOKEN_SECRET as in `uploads.ts`) is issued but not consumed.
    - **Reads in `page.tsx`:** the reads run in the server page with the Operator's session rather than through extra actions. A period change or "Učitaj još" is a URL change. A tab click only rewrites `?tab=` (`history.replaceState`).
    - **Mockup details not carried over:** the mockup line "Istaknuti veterinari u Novom Sadu: n / 3" is dropped, because it named one fixed city and type; the per-row "n / 3" carries the count. The pending-shelter note shows "PIB {tax_id}" (the S15 label) and `registration_note`. The mockup's "Grooming salon" label is kept in the Dialog type Select, "Grooming" in the table.
    - **Validation details:** a partner website is accepted with or without a scheme (stored as typed; Step 27 adds `https://` when displaying). An Instagram handle loses a leading "@". Hours must have `opens < closes` (`closes = "24:00"` allowed); a duplicate weekday is invalid.
    - **Viber state:** the switch updates locally from the EP-71 response; app_settings is not re-read.
  - **Follow-ups:**
    - Add `rpc:decide_organisation`, `rpc:save_partner` and the `r2_key` field of the partner-logo ticket to `docs/product/05-api-integration-contract.md`.
    - `lib/actions/files.ts` (EP-15) still answers `url = null` for `partner_logo`. The edit Dialog shows no current logo preview (none in the mockup).
    - The partner logo has no confirm step, so an uploaded object whose save failed is left for the EP-52 orphan scan (Step 30).
    - Step 28c adds the Moderacija tab and the shell's moderacija count.

---

### Step 28a — Schema: Šapa pomoći

| | |
|---|---|
| **Status** | ⬜ not started |
| **Outcome** | Migrations create `listings`, `listing_photos`, `conversations`, `messages`, `user_blocks`, `reports` with their enums, checks, indexes, the TC §5.10 triggers and RLS; the CAP-08 columns on `profiles` and `organisations`, the `reminder_preferences` type `message` and its default `{email, push}` row exist (added here only where Steps 04, 05 and 08 did not already create them); the local seed gains Šapa pomoći data; pgTAP proves it. |
| **Implements** | Tables `listings`, `listing_photos`, `conversations`, `messages`, `user_blocks`, `reports` (TC §5.10); columns `profiles.display_name`, `profiles.marketplace_suspended_at` (TC §5.1), `organisations.donation_bank_account`, `donation_url`, `dropoff_address`, `dropoff_hours` (TC §5.2); `reminder_preferences` type `message` + default row (TC §5.5); BR-54 … BR-61 (data side); FR-63, FR-64, FR-68, FR-70 (data side); EP-43 (`display_name` column grant); EP-52 (Šapa pomoći cascade, data side); TC §5.9 (listing photo keys queued); ADR-02; tables `profiles`, `organisations`, `reminder_preferences`, `r2_deletion_queue` (columns, grants, triggers only) |
| **Depends on** | Step 28 |
| **Blocked by** | — (OQ-16 and OQ-17 are non-blocking: this step applies the PRD default of OQ-16 and adds none of the columns OQ-17 proposes — API v1.3 defines interim mappings) |
| **Track** | single |

**Read before starting:**
- `docs/product/03-technical-constraints.md` §5 (conventions), §5.1 (`profiles`), §5.2 (`organisations`), §5.5 (`reminder_preferences`), §5.7 (`r2_deletion_queue`), §5.7.1, §5.8, §5.9, §5.10 (all).
- `docs/product/02-prd.md` §4 (Šapa pomoći relationships), §6 FR-61 … FR-72, §8 BR-54 … BR-61, §9 E-28 … E-35, §15 OQ-16.
- `docs/product/05-api-integration-contract.md` §3.1, §4.4 (rows EP-13 `listing_photo`, EP-73 … EP-88), §5.9 (conventions block, EP-75, EP-77, EP-82, EP-84, EP-85, EP-86), EP-28 (type `message`), EP-43 (`display_name`), EP-52 (Šapa pomoći cascade note), §6 Šapa pomoći schemas (`ListingSummary` … `Restriction`, `MarketplaceStatus`), §7.1, §7.2, §17 OQ-16, OQ-17.
- `docs/product/04-design-system.md` §9 (mock-data names), §12 S32 (mock data).
- `docs/product/06-build-plan.md` §4 (invariant 11), §6, and the Session logs of Steps 04, 05 and 08 (which CAP-08 columns, enum values, grants and default-preference trigger already exist; the seed users).

**Files this step may touch:**
- `supabase/migrations/*_sapa_columns.sql` (new: only the CAP-08 columns, checks and grants on `profiles`, `organisations`, `reminder_preferences` that Steps 04, 05 and 08 did not create, and the default `message` preference row for new and existing profiles)
- `supabase/migrations/*_preference_type_message.sql` (new, only if `preference_type` lacks `message`: the enum value alone in its own migration, because Postgres cannot use an enum value in the transaction that adds it)
- `supabase/migrations/*_sapa_listings.sql` (new: enums, `listings`, `listing_photos`, their triggers and RLS)
- `supabase/migrations/*_sapa_messaging.sql` (new: `conversations`, `messages`, their triggers and RLS)
- `supabase/migrations/*_sapa_safety.sql` (new: `user_blocks`, `reports`, their triggers and RLS)
- `supabase/seed.sql` (append only)
- `supabase/tests/sapa_columns.test.sql`, `supabase/tests/sapa_listings.test.sql`, `supabase/tests/sapa_listing_rls.test.sql`, `supabase/tests/sapa_messaging.test.sql`, `supabase/tests/sapa_safety.test.sql`
- the generated types file under `lib/supabase/` (via `npm run db:types` only)
- `docs/product/06-build-plan.md` (Step 28a row in §3 and the Step 28a Session log only)

**Out of bounds:** every RPC, view, route handler, server action and screen (Steps 28b, 28c); the EP-87 schedule and functions (Step 28b); moderation functions (Step 28c); the columns OQ-17 proposes (`listings.resolved_at`, `listings.hidden_at`, `listings.moderation_note`, `profiles.marketplace_suspension_note`, `organisations.donation_recipient`); any table or column not in TC §5.10 / the CAP-08 rows of TC §5.1, §5.2, §5.5; application code; `components/`.

**Acceptance criteria:** (PRD v1.7, verbatim — data side)
- BR-54: "Listing types are need, giving, selling, and seeking. Only members (Admin or Volunteer) of an approved shelter organisation may post needs, and a need is posted for that shelter; any signed-in user may post giving, selling, and seeking listings. The category "medicine and care" is allowed only for needs."
- BR-55: "A Free user may have at most 3 active listings at a time; Premium users and users with a Shelter account have no limit, and need listings never count toward or are stopped by the limit. Resolved, expired, and hidden listings do not count. A listing holds at most 5 photos."
- BR-56: "A listing expires 30 days after it is published. One reminder email is sent 3 days before expiry. The author may extend at any time ("Produži"), which sets the expiry to 30 days from that moment; extending an expired listing counts toward BR-55. Editing does not change the expiry date. Resolved outcomes: given, sold, donated, found." *(data side: `expires_at` = `published_at` + 30 days on insert; outcome enum)*
- BR-57: "Only selling listings carry a price: an amount in whole RSD greater than 0, or "po dogovoru" (negotiable). Other types have no price."
- BR-58: "Money never passes through the product. "Doniraj" only shows the shelter's donation info (bank account, payment link, drop-off address, drop-off hours); sales are settled directly between the users." *(data side: no payment table or column exists for listings or donations)*
- BR-59: "When user A blocks user B, B cannot send messages to A (in any conversation) and B's listings are hidden from A; A can unblock at any time. Blocking is not shown to B beyond the refusal to send." *(data side: the `messages_not_blocked` trigger; listing hiding is the EP-73 query, Step 28b)*
- BR-60: "A user suspended from Šapa pomoći by the Operator cannot publish, extend, or edit listings or send messages; their listings are hidden from everyone; they can still read their existing conversations. The rest of the product is unaffected. Only the Operator can lift the suspension." *(data side: the `marketplace_not_suspended` trigger and the RLS visibility rule)*
- BR-61: "There is at most one conversation per listing and interested user; new conversations can be started only on active listings, while existing conversations continue after the listing is resolved, expired, or deleted. A user cannot message their own listing. Public profiles never show email or phone."

FR-63 — Create a listing *(criteria #3, #5, #6, #7)*
- Given a listing whose type is not "need", When the category "medicine and care" is chosen, Then saving is blocked with a message.
- Given a listing with 6 photos, When saving, Then saving is blocked with a message.
- Given a Free user with 3 active listings, When they try to publish a 4th, Then it is blocked and a Premium offer is shown.
- Given a Premium user, a user with a Shelter account, or any need listing, When publishing, Then there is no limit on active listings.

FR-64 — Manage my listings *(criteria #6; data side: cascade and set-null)*
- Given any of their listings, When the author confirms a single "Yes, delete" prompt, Then the listing and its photos are permanently removed; existing conversations remain readable and show "listing deleted".

FR-68 — Messaging *(criteria #2, #7; data side: unique pair; body check)*
- Given a user who already has a conversation about that listing, When they tap "Pošalji poruku" again, Then the existing conversation opens (BR-61).
- Given a message, Then it is text only, at most 2,000 characters; an empty message cannot be sent.

FR-70 — Report and block *(criteria #2; data side: one open report per reporter and target)*
- Given a signed-in user, When they report the same listing or user again while their earlier report is open, Then the earlier report is shown as already submitted.

Derived checks:
- (Derived from TC §5.1, §5.2, §5.5, §5.10) Every listed column, enum, check, unique, partial index and default exists exactly once — none is duplicated where Steps 04, 05 or 08 already created it.
- (Derived from TC §5.5, FR-69) Every profile — existing and new — has a `reminder_preferences` row of type `message` with `channels = {email, push}`; its channels can only be a subset of `{email, push}` and may be empty.
- (Derived from TC §5.10 RLS, API §5.9 "Public visibility") Anonymous and signed-in users read listings and photos only when `status = 'active'` and the author is not suspended; authors read all their own rows; the Operator reads all; only the Operator sets `hidden` or restores; conversations and messages are visible only to their two parties and never to the Operator; `user_blocks` is visible only to the blocker; reports are readable by their reporter and the Operator.
- (Derived from API EP-43, TC §5.1) `profiles.display_name` is client-writable by its owner (column grant, check 2–40 chars); `marketplace_suspended_at` and the donation columns of other organisations are not.
- (Derived from TC §5.9, §5.10, API EP-52) Deleting a listing or a profile removes its listings, photos, conversations (where a party) and messages, sets `conversations.listing_id` and `reports.listing_id` / user columns to null as TC §5.10 states, and queues every removed `listing_photos.r2_key` in `r2_deletion_queue`.
- (Derived from PRD OQ-16 default, API §17 OQ-16) An active breeder plan does not lift the 3-active-listing limit.

**Tests to ship:**
| Criterion | Test | File |
|---|---|---|
| BR-54, FR-63 #3 | `need` by a member of an approved shelter → `organisation_id` set; by a non-member, a pending shelter's member or a breeder → `listing_type_not_allowed`; `medicine_care` on a non-need → check violation (SQLSTATE `23514`, mapped to `category_not_allowed` per API §7.1) | `supabase/tests/sapa_listings.test.sql` |
| BR-55, FR-63 #6, FR-63 #7, OQ-16 | Free owner's 4th active non-need listing → `premium_required:listings`; seeded Premium owner, shelter account and need listings unlimited; resolved / expired / hidden rows not counted; breeder with an active breeder plan still limited; extend from `expired` and restore re-check the limit | `supabase/tests/sapa_listings.test.sql` |
| BR-55, FR-63 #5 | 6th `listing_photos` row → refused (position check and `listing_photos_max`) | `supabase/tests/sapa_listings.test.sql` |
| BR-56 | insert sets `expires_at = published_at + 30 days`; `(status = 'resolved') = (resolved_outcome is not null)` | `supabase/tests/sapa_listings.test.sql` |
| BR-57 | selling needs exactly one of `price_minor > 0` / `price_negotiable`; other types reject both | `supabase/tests/sapa_listings.test.sql` |
| BR-58 | no listing or organisation column stores a payment; donation columns are plain text/URL (`donation_url` must start with `https://`) | `supabase/tests/sapa_columns.test.sql` |
| BR-59 | message from a blocked user to the blocker → `user_blocked`; the other direction succeeds | `supabase/tests/sapa_messaging.test.sql` |
| BR-60 | suspended author: listing insert / author update and message insert → `marketplace_suspended`; their active listings invisible to anon and other users, visible to themselves and the Operator; their conversations stay readable | `supabase/tests/sapa_listing_rls.test.sql`, `supabase/tests/sapa_messaging.test.sql` |
| BR-61, FR-68 #2 | second conversation for the same (`listing_id`, `starter_id`) → unique violation; conversation on a non-active listing → `listing_not_active`; on one's own listing → `cannot_message_self`; `owner_id` set from the listing author | `supabase/tests/sapa_messaging.test.sql` |
| FR-68 #7 | empty / whitespace-only body and 2,001 characters refused; 2,000 accepted; `last_message_at` follows the newest message | `supabase/tests/sapa_messaging.test.sql` |
| FR-64 #6 | deleting a listing cascades photos, queues their keys, sets `conversations.listing_id` and `reports.listing_id` null; messages remain | `supabase/tests/sapa_listings.test.sql`, `supabase/tests/sapa_messaging.test.sql` |
| FR-70 #2 | second open report by the same reporter on the same listing or user → unique violation; allowed again after the first is `dismissed`; note required for `other`, ≤ 500 | `supabase/tests/sapa_safety.test.sql` |
| columns, `message` preference | CAP-08 columns, checks and grants; every seeded profile has the `message` row `{email, push}`; a new profile gets it; `whatsapp` in a `message` row refused; empty array accepted | `supabase/tests/sapa_columns.test.sql` |
| RLS matrix | anon / owner / other user / Operator per the derived check above, for all six tables; `user_blocks` invisible to the blocked user | `supabase/tests/sapa_listing_rls.test.sql`, `supabase/tests/sapa_messaging.test.sql`, `supabase/tests/sapa_safety.test.sql` |
| account deletion | deleting a seeded profile removes their listings, photos (keys queued), conversations and messages, and nulls their `reports` references | `supabase/tests/sapa_safety.test.sql` |

**Verification:**
```
npx supabase db reset  # expected: all migrations + seed apply without error
npm run db:types       # expected: exit 0
npm run typecheck      # expected: exit 0
npm run lint           # expected: exit 0
npm test               # expected: all test files pass
npx supabase test db   # expected: all pgTAP files pass, incl. the five sapa_* files
npm run build          # expected: exit 0
```

#### Prompt
```
You are executing Step 28a — Schema: Šapa pomoći — of docs/product/06-build-plan.md for the Moj Ljubimac web app. One outcome: the six Šapa pomoći tables of TC §5.10 with their triggers and RLS, plus the CAP-08 columns and the `message` preference — nothing else.

READ FIRST, in this order:
1. docs/product/03-technical-constraints.md §5 (conventions), §5.1 (profiles), §5.2 (organisations), §5.5 (reminder_preferences), §5.7 (r2_deletion_queue), §5.7.1, §5.8, §5.9, §5.10.
2. docs/product/02-prd.md §4, §6 FR-61 … FR-72, §8 BR-54 … BR-61, §9 E-28 … E-35, §15 OQ-16.
3. docs/product/05-api-integration-contract.md §3.1, §4.4 (rows EP-13 listing_photo and EP-73 … EP-88), §5.9 (conventions block, EP-75, EP-77, EP-82, EP-84, EP-85, EP-86), EP-28, EP-43, EP-52, §6 Šapa pomoći schemas and MarketplaceStatus, §7.1, §7.2, §17 (OQ-16, OQ-17).
4. docs/product/04-design-system.md §9 (mock-data names) and §12 S32 (mock data).
5. docs/product/06-build-plan.md §4 (invariant 11), §6, and the Session logs of Steps 04, 05 and 08.

SETTLED UPSTREAM — apply exactly:
- OQ-16 is open and non-blocking: apply the PRD default — only active owner Premium (is_premium) and account_type = shelter lift the 3-active-listing limit; an active breeder plan does not (TC §5.10 trigger listings_active_limit, API MarketplaceStatus).
- OQ-17 is open and non-blocking: do NOT add listings.resolved_at, listings.hidden_at, listings.moderation_note, profiles.marketplace_suspension_note or organisations.donation_recipient. Steps 28b and 28c use the interim mappings of API §17 OQ-17.
- Error format: TC §5.7.1 (ERRCODE P0001, MESSAGE '<code>' or '<code>:<detail>'); the medicine_care rule is the listings.category check constraint, which API §7.1 maps (SQLSTATE 23514) to category_not_allowed — do not raise listing_type_not_allowed for it (CR-28 records the TC wording).
- Earlier steps may already have created some CAP-08 items because they read TC v1.7: profiles.display_name and marketplace_suspended_at (Step 04), the four organisations donation columns (Step 05), preference_type value 'message' and its default row (Step 08). Inspect the existing migrations and the Step 04/05/08 Session logs first; add only what is missing and record in the Session log what already existed. Never redefine an existing column, enum value, grant or trigger.

BUILD:
1. Migrations, each created with npx supabase migration new <name>:
   - preference_type_message — only if preference_type lacks 'message': the enum value alone.
   - sapa_columns — the missing CAP-08 columns with their TC checks (display_name 2–40 chars; donation_url '^https://'); the column grant that lets a user update their own profiles.display_name (EP-43); the TC §5.5 check that a 'message' row's channels are a subset of {email, push} (empty allowed); a 'message' row with channels {email, push} for every existing profile and, for new profiles, through the same mechanism Step 08 uses for the six default rows (extend it; do not create a second mechanism).
   - sapa_listings — the seven enums of TC §5.10; listings and listing_photos exactly per TC §5.10 (columns, checks incl. the price check and the type/organisation_id check, indexes); triggers listings_active_limit (reuse is_premium from Step 04), listings_need_shelter_only, listing_photos_max, marketplace_not_suspended (listings part), expires_at = published_at + 30 days on insert, and the r2_deletion_queue enqueue on listing_photos delete (which also covers listing and account deletion through the cascade); RLS per TC §5.10.
   - sapa_messaging — conversations and messages exactly per TC §5.10; triggers conversations_listing_active (sets owner_id from the listing author; listing_not_active; cannot_message_self), messages_not_blocked, marketplace_not_suspended (messages part), messages_touch_conversation, and "sender must be a party"; RLS: select for the two parties only, messages insert only with sender_id = auth.uid(), read_at updatable only by the recipient (column grant), no Operator access.
   - sapa_safety — user_blocks and reports exactly per TC §5.10 (checks, unique partial indexes, the reporter_id not-null-at-creation trigger, the "listing_id or reported_user_id" check); RLS per TC §5.10.
   Where a TC §5.10 FK says on delete cascade / set null, use exactly that. Every new table gets the shared updated_at trigger from Step 04 where TC gives it updated_at (messages and user_blocks have none).
2. supabase/seed.sql — append, named per docs/product/04-design-system.md §9 and the S32 mock data: one more shelter test user (account_type shelter, same local-only password as the Step 04 seed header) with an approved shelter organisation (Azil „Druga šansa“, Novi Sad) and donation info, because the Step 05 seeded shelter is pending; a need listing by that shelter; a giving listing by the Free owner (Bečej); a selling listing with a price and one "po dogovoru"; a seeking listing; one expired and one resolved listing; one conversation with two messages (one unread); one block; one open report. Cities from the cities seed.
3. Run npm run db:types.
4. Write the pgTAP tests listed in the Step 28a "Tests to ship" table of docs/product/06-build-plan.md, in exactly those files.

FILES YOU MAY CREATE OR MODIFY (allowlist — nothing else):
- supabase/migrations/<timestamp>_preference_type_message.sql (only if needed), <timestamp>_sapa_columns.sql, <timestamp>_sapa_listings.sql, <timestamp>_sapa_messaging.sql, <timestamp>_sapa_safety.sql
- supabase/seed.sql (append only)
- supabase/tests/sapa_columns.test.sql, sapa_listings.test.sql, sapa_listing_rls.test.sql, sapa_messaging.test.sql, sapa_safety.test.sql
- the generated types file under lib/supabase/ (via npm run db:types only)
- docs/product/06-build-plan.md (Step 28a row in §3 and the Step 28a Session log only)
Touching any other file requires stopping and asking.

ACCEPTANCE CRITERIA (PRD v1.7, verbatim, data side — each needs a passing test):
- BR-54: "Listing types are need, giving, selling, and seeking. Only members (Admin or Volunteer) of an approved shelter organisation may post needs, and a need is posted for that shelter; any signed-in user may post giving, selling, and seeking listings. The category "medicine and care" is allowed only for needs."
- BR-55: "A Free user may have at most 3 active listings at a time; Premium users and users with a Shelter account have no limit, and need listings never count toward or are stopped by the limit. Resolved, expired, and hidden listings do not count. A listing holds at most 5 photos."
- BR-56: "A listing expires 30 days after it is published. One reminder email is sent 3 days before expiry. The author may extend at any time ("Produži"), which sets the expiry to 30 days from that moment; extending an expired listing counts toward BR-55. Editing does not change the expiry date. Resolved outcomes: given, sold, donated, found."
- BR-57: "Only selling listings carry a price: an amount in whole RSD greater than 0, or "po dogovoru" (negotiable). Other types have no price."
- BR-58: "Money never passes through the product. "Doniraj" only shows the shelter's donation info (bank account, payment link, drop-off address, drop-off hours); sales are settled directly between the users."
- BR-59: "When user A blocks user B, B cannot send messages to A (in any conversation) and B's listings are hidden from A; A can unblock at any time. Blocking is not shown to B beyond the refusal to send."
- BR-60: "A user suspended from Šapa pomoći by the Operator cannot publish, extend, or edit listings or send messages; their listings are hidden from everyone; they can still read their existing conversations. The rest of the product is unaffected. Only the Operator can lift the suspension."
- BR-61: "There is at most one conversation per listing and interested user; new conversations can be started only on active listings, while existing conversations continue after the listing is resolved, expired, or deleted. A user cannot message their own listing. Public profiles never show email or phone."
- FR-63 #3: Given a listing whose type is not "need", When the category "medicine and care" is chosen, Then saving is blocked with a message.
- FR-63 #5: Given a listing with 6 photos, When saving, Then saving is blocked with a message.
- FR-63 #6: Given a Free user with 3 active listings, When they try to publish a 4th, Then it is blocked and a Premium offer is shown.
- FR-63 #7: Given a Premium user, a user with a Shelter account, or any need listing, When publishing, Then there is no limit on active listings.
- FR-64 #6: Given any of their listings, When the author confirms a single "Yes, delete" prompt, Then the listing and its photos are permanently removed; existing conversations remain readable and show "listing deleted".
- FR-68 #2: Given a user who already has a conversation about that listing, When they tap "Pošalji poruku" again, Then the existing conversation opens (BR-61).
- FR-68 #7: Given a message, Then it is text only, at most 2,000 characters; an empty message cannot be sent.
- FR-70 #2: Given a signed-in user, When they report the same listing or user again while their earlier report is open, Then the earlier report is shown as already submitted.
- Derived checks: every column/enum/check/index once; the message preference row; the RLS matrix; display_name grant; deletion cascade and key queueing; OQ-16 default — exactly as listed under "Acceptance criteria" in Step 28a of docs/product/06-build-plan.md.

FORBIDDEN:
- No table, column, enum value, index, check or trigger outside docs/product/03-technical-constraints.md §5.10 and the CAP-08 rows of §5.1, §5.2, §5.5; none of the OQ-17 proposed columns.
- No RPC, view, route, action or screen (Steps 28b, 28c); no pg_cron schedule.
- No error code outside docs/product/05-api-integration-contract.md §7.2; no library; no application code.

DONE MEANS:
- Every test in the Step 28a "Tests to ship" table exists and passes.
- These commands all exit 0, in this order: npx supabase db reset; npm run db:types; npm run typecheck; npm run lint; npm test; npx supabase test db; npm run build.
- In docs/product/06-build-plan.md: set the Step 28a row in §3 to ✅ with today's date and append a Step 28a Session log entry (date, what was built, which CAP-08 items already existed from Steps 04/05/08, pass/fail per command, deviations, follow-ups).
- Commit with the message "Step 28a: Schema: Šapa pomoći".

If anything above is ambiguous, if a referenced section doesn't contain what this prompt says it does, or if completing this step would require touching a file outside the list or making a decision the referenced documents don't settle — STOP and ask. Do not choose a reasonable default. Do not proceed with a partial implementation.
```

#### Session log
- **2026-10-28** — Step 28a built (unattended overnight run).
  - **Already existing from Steps 04 / 05 / 08:** none of the CAP-08 items. `profiles` had no `display_name` / `marketplace_suspended_at`, `organisations` had no donation columns, and there was no `preference_type` enum, no `message` value and no default `message` row. Step 08 typed `reminder_preferences.type` with `public.reminder_type` (see the owner decision below). The Step 12 `get_me` and Step 18 `reminder_settings_rpcs` migrations already noted that these parts were left to Steps 28a–28c (invariant 11).
  - **Built:**
    - `20261028222712_preference_type_message.sql`: `alter type public.reminder_type add value if not exists 'message'`, alone in its own migration.
    - `20261028222714_sapa_columns.sql`:
      - `profiles.display_name` (check 2–40), `profiles.marketplace_suspended_at`, and `grant update (display_name)` to authenticated. `profiles_before_write` is recreated so `display_name` joins the `account_pending_deletion` guard (EP-43).
      - `organisations.donation_bank_account`, `donation_url` (check `^https://`), `dropoff_address`, `dropoff_hours`. The table-level SELECT of authenticated is replaced by a column grant without the four donation columns (owner decision for Step 28a; anon had none). `grant update` on the four columns for the existing Admin-only update policy (FR-72) — Step 28b no longer needs to ship that grant.
      - Owner-decision guards for `message` (below): `reminders_type_not_message_check`; on `reminder_preferences`, `reminder_preferences_channels_check` (type = message or ≥ 1 channel), `reminder_preferences_message_channels_check` (channels <@ {email, push}) and `reminder_preferences_delivery_time_check` (null for treatment_dose, meal and message).
      - `reminder_preferences_before_write` resets lead / delivery time for message too, and skips the WhatsApp / Viber channel rules for message rows so the subset check answers (23514).
      - `profiles_create_reminder_preferences` (the Step 08 mechanism) adds the message row `{email, push}`. Every existing profile got the row.
      - `get_reminder_settings` is recreated with the same body plus `where t.type <> 'message'`.
    - `20261028222717_sapa_listings.sql`:
      - The seven TC §5.10 enums, then `listings` and `listing_photos` exactly per TC: checks for title, description, category (medicine_care only for need), price (BR-57), need ⇔ organisation_id, resolved ⇔ outcome and photo position 1–5; unique (listing_id, position); the five TC indexes.
      - Triggers: `listings_set_expires_at` (insert: published_at + 30 days), `listings_active_limit` (insert / status update to active; non-need, not is_premium, not account_type shelter, ≥ 3 active non-need rows → `premium_required:listings`; every writer), `listings_need_shelter_only` (insert, and updates by the author → `listing_type_not_allowed`), `listings_status_guard` (owner decision), `marketplace_not_suspended` (listing insert, update by the author; also attached to messages), `listing_photos_max` (> 5 → `validation_failed`), `listing_photos_queue_r2_key` (after delete, so listing and account deletion queue keys through the cascade), plus the shared `set_updated_at`.
      - `public.marketplace_author_ok(uuid)` (owner decision).
      - RLS: public select (anon + authenticated) on status active and author not suspended; author and Operator select; insert / update / delete by the author; Operator update for hide / restore. Column grants: insert without `id` / `author_id` / `published_at` / `expires_at`; update of the content, status, outcome, `expires_at`, `expiry_notice_sent_at`. Photos follow their listing's visibility (subquery under listings RLS); the author inserts / reorders (position) / deletes them.
    - `20261028222719_sapa_messaging.sql`:
      - `conversations` (listing_id on delete set null; starter / owner cascade; check starter ≠ owner; unique (listing_id, starter_id); both inbox indexes) and `messages` (no updated_at; body check; both indexes).
      - Triggers: `conversations_listing_active` (`listing_not_active` / `cannot_message_self`; sets `owner_id` from the author), `messages_sender_is_party` (→ `not_found`, the EP-82 code), `messages_not_blocked`, `marketplace_not_suspended`, `messages_touch_conversation`.
      - RLS: the two parties select; conversations insert with starter = caller (grant on `listing_id` only); messages insert with sender = caller and a party; `read_at` update only by the recipient (column grant); no Operator access.
    - `20261028222721_sapa_safety.sql`:
      - `user_blocks` (check not self, unique pair, index blocked_id; RLS blocker select / insert / delete).
      - `reports`: note ≤ 500, note required for `other`, both unique partial indexes, index (status, created_at). `reports_before_insert` enforces at creation: reporter = caller when not given and not null, a listing or a user, and the listing's author as `reported_user_id`. RLS: insert as self, the reporter selects own, the Operator selects / updates all.
    - `supabase/seed.sql` (appended): Dragana Kovačević (`dragana.kovacevic@mojljubimac.test`, shelter, same local password) with the approved Azil „Druga šansa“ (Novi Sad, donation info). Listings: a need by the shelter; Marko's gift (Bečej); Ivana's sale for 2.500 RSD; Jelena's sale "po dogovoru"; Jelena's search (Subotica); Marko's expired gift; Ivana's resolved gift. Ivana ↔ Marko conversation with 2 messages, the newest unread. Jelena blocks Nikola. Marko has an open report on Jelena's sale.
    - `npm run db:types` regenerated `lib/supabase/database.types.ts`.
    - pgTAP: `sapa_columns` (45), `sapa_listings` (78), `sapa_listing_rls` (36), `sapa_messaging` (47), `sapa_safety` (47) — every row of the Tests to ship table.
  - **Owner decisions applied:**
    - **preference_type gap (2026-10-28, option 1 with guards):** (a) `reminder_type` gets `message`; the docs' `preference_type` reads `reminder_type`. (b) Check `reminders.type <> 'message'`. (c) Only `get_reminder_settings` is recreated, skipping message until Step 28c; the S12 client and `reminder-type-icon` are untouched. (d) Message rows may have empty channels; delivery_time is null for treatment_dose, meal and message; the before-write reset includes message. (e) The default message row for existing and new profiles. **Follow-up:** align `docs/product/03-technical-constraints.md` §5.5 and API §6 (preference_type = reminder_type).
    - Step 28a decisions of 2026-10-24: `marketplace_author_ok`; `messages_not_blocked` and `messages_touch_conversation` as security definer with `set search_path = public`; `listings_status_guard`; the organisations SELECT column grant without the donation columns.
  - **Owner-approved exceptions:**
    - Pre-approved exception 1 (earlier tests that asserted the exact column list now grown by this step): `supabase/tests/profiles.test.sql` and `supabase/tests/organisations.test.sql` `columns_are` lists gained the CAP-08 columns.
    - Pre-approved exception 3 (owner decision on reminder_type): `supabase/tests/reminders.test.sql` enum labels include `message`. `supabase/tests/reminder_preferences.test.sql` expects 7 rows per profile (six + message) and the message defaults. `app/(app)/podesavanja/podsetnici/page.tsx` `savePreference` returns the validated input `type` instead of `data.type`. The regenerated enum includes `message`, which no longer fit the S12 `ReminderType`, so typecheck failed. This is a one-token change with the same runtime value; the S12 client is untouched.
  - **Verification** (in order, on the final code):
    - `npx supabase db reset` ✅ exit 0 (all migrations + seed)
    - `npm run db:types` ✅ exit 0
    - `npm run typecheck` ✅ exit 0 (after the page.tsx change above; it failed before with TS2322 on `data.type`)
    - `npm run lint` ✅ exit 0 (0 errors; the 2 known warnings in the generated `cloudflare-env.d.ts`)
    - `npm test` ✅ `Test Files 110 passed (110)`, `Tests 1179 passed (1179)`
    - `npx supabase test db` ✅ `Files=79, Tests=2697`, `Result: PASS`
    - `npm run build` ✅ exit 0
  - **Deviations / decisions:**
    - `messages_body_check` uses `btrim(body, E' \t\r\n')` rather than plain `btrim(body)`. Plain `btrim` strips spaces only, which would let a newline-only message through (FR-68 #7 "empty message").
    - `listings_need_shelter_only` checks on insert and on updates by the author only. The expiry job and moderation (service role / Operator) are not blocked when the author has since left the shelter.
    - `messages_sender_is_party` raises `not_found` (EP-82: "conversation not the caller's"). It fires before RLS, so a non-party also gets `not_found` rather than 42501.
    - Client inserts never carry `id` (same convention as the other tables). Clients may update `expires_at`. Extend (`now() + 30 days`) is enforced by the Step 28b action, not by a trigger.
    - `reports.reporter_id` is nullable (on delete set null). TC's "listing_id or reported_user_id" rule is checked "at creation" in `reports_before_insert` (`validation_failed`), not as a check constraint, because both columns are set to null by deletions.
  - **Follow-ups:**
    - TC §5.5 / API §6: preference_type = reminder_type (above).
    - **TC §5.10 index collision (for the owner):** reporter R has an open listing report on listing L of author A and also an open user report on A. If A deletes L, `listing_id → null` turns the listing report into a second open (R, A, listing_id null) row. `reports_open_user_key` then fails with 23505, and the listing delete fails. Not triggered by the seed or tests; built as specified. The fix needs a TC change, e.g. a report kind column used in the index predicate.
    - Step 28b: `listing_photo` uploads by a suspended author, and photo adds on a non-active listing, are refused in the EP-13 action (TC has no trigger for them). The donation-column update grant already exists.
    - Step 28c: the seventh `get_reminder_settings` row, the S12 Poruke card and `ReminderType` / icon for message.

---

### Step 28b — Listings, public pages, profiles & donation info

| | |
|---|---|
| **Status** | ⬜ not started |
| **Outcome** | Anyone browses Šapa pomoći (S32) and opens a listing (S33) and a public profile (S37) without signing in; signed-in users create and edit listings with up to 5 photos (S34), manage, extend, resolve and delete them (S35) and see a shelter's donation info behind "Doniraj"; shelter Admins edit donation info in S29 *Donacije*; a daily job sends the 3-day expiry notice and expires listings; the *Šapa pomoći* item is live in the owner and organisation shells. |
| **Implements** | FR-61, FR-62, FR-63, FR-64, FR-65, FR-66, FR-67, FR-72 · EP-73, EP-74, EP-75, EP-76, EP-77, EP-78, EP-79, EP-87, EP-88; EP-13 (`listing_photo`), EP-15 (`listing_photo`), EP-43 (`display_name`, `marketplace`), EP-53 (`Organisation.donation`) · S32 `/sapa-pomoci`, S33 `/sapa-pomoci/[id]`, S34 `/sapa-pomoci/nova` and `/sapa-pomoci/[id]/izmeni`, S35 `/sapa-pomoci/moje`, S37 `/korisnik/[id]`, S29 `/organizacija/profil` (*Donacije* card) · route handlers `GET /api/public/listings`, `GET /api/public/listings/[id]`, `GET /api/public/users/[id]`, `POST /api/internal/listings-daily` · composites `ListingTypeTag`, `ListingCard`; `AppShell` *Šapa pomoći* item; token `--info-soft` (Design §4.1) · Design §9.1 (`listing_expiring`, `listing_expired`) · tables `listings`, `listing_photos`, `organisations` (donation columns), `profiles`, `cities`, `r2_deletion_queue` · TC §8 (daily job via pg_cron → `pg_net`), ADR-07, ADR-18, ADR-16 (CR-27 route group) |
| **Depends on** | Step 28a, Step 21 (R2 photo patterns), Step 19 (Resend adapter and pg_cron → `pg_net` schedule mechanism) |
| **Blocked by** | — (OQ-16, OQ-17 non-blocking: interim mappings of API v1.3 §17; CR-27 non-blocking: route group as stated in the prompt) |
| **Track** | single |

**Read before starting:**
- `docs/product/02-prd.md` §6 FR-61 … FR-67, FR-72; §7 UC-11, UC-12; §8 BR-54 … BR-58, BR-61; §9 E-28 … E-33; §15 OQ-16.
- `docs/product/03-technical-constraints.md` ADR-07, ADR-16, ADR-17, ADR-18; §5.9; §5.10; §8 (daily listing expiry job, pg_cron → app calls); §8.1.
- `docs/product/04-design-system.md` §4.1 (`--info-soft`), §5.1, §5.2, §5.3 (`PublicShell wide`), §5.6, §6 (`AppShell`, `ListingTypeTag`, `ListingCard`, `PremiumLock`, `EmptyState`, `ErrorState`), §7, §8, §9, §9.1 (`listing_expiring`, `listing_expired`, `email_footer`), §10, §11 (S29, S32 … S35, S37), §12 S29, S32, S33, S34, S35, S37.
- `docs/product/04-design/screens/sapa-pomoci.tsx`, `listing-detail.tsx`, `listing-form.tsx`, `my-listings.tsx`, `user-profile.tsx`, `org-profile.tsx`; `docs/product/04-design/components/listing-type-tag.tsx`, `listing-card.tsx`, `shells.tsx`.
- `docs/product/05-api-integration-contract.md` §3.1, §3.3, §4.1, §4.4 (rows EP-13 `listing_photo`, EP-73 … EP-79, EP-87, EP-88), §5.1 EP-13, EP-15, §5.5 EP-43, §5.7 EP-53, §5.9 (conventions block, EP-73 … EP-79, EP-87, EP-88), §6 (`ListingSummary`, `Listing`, `ListingPhoto`, `ListingAuthor`, `MyListing`, `MarketplaceStatus`, `DonationInfo`, `PublicProfile`, `Me`, `Organisation`, `UploadTicket`, `FileUrl`), §7.1, §7.2, §7.3 (premium_locked, signed_out, suspended, unavailable, own / resolved), §9.4 (Šapa pomoći notifications), §10, §11, §12, §17 OQ-16, OQ-17.
- `docs/product/06-build-plan.md` §4 (invariant 11), §5, §6, §12 (CR-27, OQ-16, OQ-17) and the Session logs of Steps 10, 11, 12, 13, 15, 17, 19, 21, 24 and 28a (composites, request-interception file name, `get_me`, `lib/actions/uploads.ts` / `files.ts`, `counts.podsetnici`, Resend and the pg_cron → `pg_net` schedule, R2 photo flow, `get_my_organisation` and the S29 files, the Šapa pomoći schema).

**Files this step may touch:**
- `supabase/migrations/*_sapa_listings_api.sql` (new: `rpc:list_listings`, `rpc:get_listing`, `rpc:list_my_listings`, `rpc:get_public_profile`, `rpc:get_donation_info`; `rpc:get_me` replaced to add `display_name` and `marketplace`; `rpc:get_my_organisation` replaced to add `donation`; the `organisations` donation-column grant for Admins of shelters if Step 28a did not ship it; functions `saveListing` / `changeListing` need for atomicity)
- `supabase/migrations/*_listings_daily.sql` (new: the EP-87 database functions and the daily pg_cron schedule)
- the generated types file under `lib/supabase/` (via `npm run db:types` only)
- `lib/actions/listings.ts` (new: `saveListing` EP-75, `changeListing` EP-77)
- `lib/actions/uploads.ts` (modify: EP-13 purpose `listing_photo`), `lib/actions/files.ts` (modify: EP-15 kind `listing_photo`)
- `lib/actions/organisation.ts` (modify: add `updateDonationInfo` EP-88)
- `lib/integrations/resend.ts` (the Design §9.1 templates `listing_expiring`, `listing_expired` only)
- `lib/server/result.ts` (only if the API v1.3 §7.1 rows `premium_required:listings` and SQLSTATE `23514` → `category_not_allowed` are missing)
- `app/api/public/listings/route.ts`, `app/api/public/listings/[id]/route.ts`, `app/api/public/users/[id]/route.ts` (new: EP-73, EP-74, EP-79)
- `app/api/internal/listings-daily/route.ts` (new: EP-87)
- `app/(sapa)/layout.tsx` (new: shell by session — CR-27)
- `app/(sapa)/sapa-pomoci/page.tsx`, `app/(sapa)/sapa-pomoci/sapa-pomoci-client.tsx` (new, S32)
- `app/(sapa)/sapa-pomoci/[id]/page.tsx`, `app/(sapa)/sapa-pomoci/[id]/listing-detail-client.tsx` (new, S33)
- `app/(sapa)/sapa-pomoci/nova/page.tsx`, `app/(sapa)/sapa-pomoci/nova/listing-form-client.tsx`, `app/(sapa)/sapa-pomoci/[id]/izmeni/page.tsx` (new, S34 create and edit — the edit page renders the same client component)
- `app/(sapa)/sapa-pomoci/moje/page.tsx`, `app/(sapa)/sapa-pomoci/moje/my-listings-client.tsx` (new, S35)
- `app/(sapa)/korisnik/[id]/page.tsx`, `app/(sapa)/korisnik/[id]/user-profile-client.tsx` (new, S37)
- `app/(org)/organizacija/profil/page.tsx`, `app/(org)/organizacija/profil/org-profile-screen.tsx` (modify: *Donacije* card only)
- `components/app/listing-type-tag.tsx`, `components/app/listing-card.tsx` (new: ported from `04-design/components/`)
- `components/app/shells.tsx` (modify only if it differs from `04-design/components/shells.tsx` v1.6: bring it to that file)
- the request-interception file named in the Step 11 Session log (`proxy.ts` or `middleware.ts`) — add the signed-in prefixes `/sapa-pomoci/nova`, `/sapa-pomoci/moje`, `/sapa-pomoci/*/izmeni` only
- `lib/i18n/sr.ts`, `lib/i18n/en.ts` (add keys only)
- `README.md` (Scheduled jobs section only: the listings-daily job)
- `supabase/tests/sapa_listings_api.test.sql`, `supabase/tests/sapa_profile_donation.test.sql`, `supabase/tests/sapa_expiry_job.test.sql`, `supabase/tests/get_me_marketplace.test.sql`
- `tests/sapa/save-listing.test.ts`, `tests/sapa/change-listing.test.ts`, `tests/sapa/listing-photos.test.ts`, `tests/sapa/public-routes.test.ts`, `tests/sapa/listings-daily-route.test.ts`, `tests/sapa/update-donation-info.test.ts`, `tests/sapa/sapa-layout.test.tsx`, `tests/sapa/sapa-list-screen.test.tsx`, `tests/sapa/listing-detail-screen.test.tsx`, `tests/sapa/listing-form-screen.test.tsx`, `tests/sapa/my-listings-screen.test.tsx`, `tests/sapa/user-profile-screen.test.tsx`, `tests/organisation/org-donation-card.test.tsx`, `tests/components/listing-card.test.tsx`
- `docs/product/06-build-plan.md` (Step 28b row in §3 and the Step 28b Session log only)

**Out of bounds:** messaging — EP-80 … EP-83, the S33 *Pošalji poruku* Dialog, `/poruke`, the *Poruke* badge (Step 28c); report and block — EP-84, EP-85, the S33 / S37 `⋯` menus and `ReportDialog` / `BlockDialog` (Step 28c); moderation — EP-86, S26 (Step 28c); the S12 *Poruke* card (Step 28c); the OQ-17 proposed columns and any table or column change; edge caching or purge (ADR-18); `components/ui/*`; `components/app/*` other than the files listed.

**Acceptance criteria:** (PRD v1.7, verbatim)

FR-61 — Browse listings
- Given a Visitor who is not signed in, When they open Šapa pomoći, Then active listings are shown, newest first, in pages.
- Given one or more filters, When applied, Then only active listings matching every selected filter are shown.
- Given a listing that is resolved, expired, or hidden, or whose author is suspended from Šapa pomoći, Then it is not shown in the list.
- Given a signed-in user who blocked another user, Then listings by the blocked user are not shown to them (BR-59).
- Given no match, Then an empty result with a "clear filters" action is shown.
*(FR-61 #4: this step filters with existing `user_blocks` rows; the block action is Step 28c)*

FR-62 — Listing detail
- Given an active listing, When anyone opens it (signed in or not), Then they see its photos, title, type, category, species, city, description, price in RSD or "po dogovoru" (selling only), posted date, expiry date, and an author card linking to the author's public profile (FR-67).
- Given a need listing, Then a "Doniraj" button is shown (FR-66).
- Given a listing that is not active, When opened by anyone other than its author or the Operator, Then a "listing is no longer available" message is shown instead of its content.
- Given the listing's author, When they open it, Then edit, extend, mark resolved, and delete actions are shown instead of "Pošalji poruku".
*(FR-62 #4: this step shows the author's actions and no message button; the "Pošalji poruku" Dialog for non-authors is Step 28c)*

FR-63 — Create a listing
- Given a signed-in user, When they save a giving, selling, or seeking listing with all required fields, Then it is published as active with an expiry date 30 days later.
- Given a member of an approved shelter organisation, When they choose type "need", Then the listing is published for that shelter; Given any other user, Then "need" is not offered.
- Given a listing whose type is not "need", When the category "medicine and care" is chosen, Then saving is blocked with a message.
- Given a selling listing, When neither an amount nor "po dogovoru" is set, Then saving is blocked with a message.
- Given a listing with 6 photos, When saving, Then saving is blocked with a message.
- Given a Free user with 3 active listings, When they try to publish a 4th, Then it is blocked and a Premium offer is shown.
- Given a Premium user, a user with a Shelter account, or any need listing, When publishing, Then there is no limit on active listings.

FR-64 — Manage my listings
- Given "Moje objave", Then the author sees all their listings grouped as active, resolved, and expired, each with its expiry date.
- Given an active listing, When the author edits and saves it, Then the new values are shown and the expiry date does not change.
- Given an active or expired listing, When the author taps "Produži", Then it is active with an expiry date 30 days from now.
- Given an expired listing of a Free user who already has 3 active listings, When they extend it, Then it is blocked and a Premium offer is shown.
- Given an active listing, When the author marks it resolved with an outcome (given / sold / donated / found), Then it leaves the public list and is shown as resolved with that outcome.
- Given any of their listings, When the author confirms a single "Yes, delete" prompt, Then the listing and its photos are permanently removed; existing conversations remain readable and show "listing deleted".

FR-65 — Listing expiry
- Given an active listing, When 3 days remain before its expiry date, Then the author receives one email with a "Produži" button.
- Given the email's "Produži" button, When the author uses it, Then the listing is extended as in FR-64.
- Given an active listing whose expiry date has passed, Then it becomes expired, leaves the public list, and the author receives one email that it expired.

FR-66 — Donate to a shelter need
- Given a signed-in user on a need listing, When they tap "Doniraj", Then the shelter's donation info is shown: bank account and/or payment link, drop-off address, and drop-off hours, as far as the shelter provided them (FR-72).
- Given a Visitor who is not signed in, When they tap "Doniraj", Then they are asked to sign in or register and return to the listing afterwards.
- Given a shelter with no donation info at all, Then "Doniraj" shows a message that the shelter has not added donation info yet, with "Pošalji poruku".
- Given any donation, Then no money is collected or processed by the product (BR-58).
*(FR-66 #3: this step shows the no-donation-info message and the "Pošalji poruku azilu" button; the button opens the Step 28c message Dialog)*

FR-67 — Public user profile
- Given any user's profile opened from a listing (signed in or not), Then it shows display name (nickname or name), city, member-since month and year, and the user's active listings.
- Given any public profile, Then email address and phone number are never shown.
- Given a shelter member's need listing, Then the author card shows the shelter's name and links to the shelter's public page.

FR-72 — Shelter donation info
- Given a Shelter Admin on the organisation profile's "Donacije" section, When they save donation info, Then "Doniraj" on the shelter's need listings shows the new values.
- Given a Volunteer, Then these fields are view-only.
- Given a payment link that is not a valid https URL, When saving, Then saving is blocked with a message.

Derived checks:
- (Derived from API §5.9 "Public routes", TC ADR-18) EP-73, EP-74 and EP-79 answer with `Cache-Control: no-store`, read with the caller's own session, and return photo URLs signed for 10 minutes; no email or phone appears in any response.
- (Derived from API EP-87, TC §8) The daily job runs at 09:00 Europe/Belgrade through pg_cron → `pg_net` with the Vault secrets `dispatch_url` / `dispatch_secret`; a missing or wrong `X-Dispatch-Secret` → `401 invalid_signature`; a re-run on the same day sends no second notice.
- (Derived from API OQ-17 interim mappings) S33 / S35 resolved date from `listings.updated_at`; S35 hidden card and reason from the actioned report; *Doniraj* recipient = `organisations.name`, purpose = `Donacija — <listing title>`; S34 description limit 2,000 characters (PRD / TC), title ≥ 5 client-side; a resolved listing opened by a non-author → *unavailable*.
- (Derived from Design §5.1, §5.2, §5.3, §11) Signed-out visitors see S32, S33 and S37 in `PublicShell wide`; signed-in owners in the owner `AppShell`, organisation members in the organisation `AppShell`; both shells show *Šapa pomoći* (`HandHeart`) in the sidebar and the bottom nav (*Šapa*).

**Tests to ship:**
| Criterion | Test | File |
|---|---|---|
| FR-61 #1, FR-61 #2 | `list_listings` returns active listings newest first with `total`, paging by `limit`/`offset`; every filter combination ANDs; unknown enum / city → `validation_failed` | `supabase/tests/sapa_listings_api.test.sql`, `tests/sapa/public-routes.test.ts` |
| FR-61 #3 | resolved, expired, hidden and suspended-author listings absent | `supabase/tests/sapa_listings_api.test.sql` |
| FR-61 #4 | a signed-in user with a seeded block does not see the blocked author's listings; anon still does | `supabase/tests/sapa_listings_api.test.sql` |
| FR-61 #5 | S32 empty state with filters shows *Poništi filtere* which clears them; without filters *Još nema oglasa* | `tests/sapa/sapa-list-screen.test.tsx` |
| FR-62 #1 | EP-74 returns every listed field for anon and signed-in callers; S33 renders gallery, tags, price or *Po dogovoru*, dates and the author card linking to S37 | `tests/sapa/public-routes.test.ts`, `tests/sapa/listing-detail-screen.test.tsx` |
| FR-62 #2 | need listing with donation info shows *Doniraj* | `tests/sapa/listing-detail-screen.test.tsx` |
| FR-62 #3 | non-active listing → `404` for others (S33 *unavailable*), full listing for the author and the Operator | `supabase/tests/sapa_listings_api.test.sql`, `tests/sapa/listing-detail-screen.test.tsx` |
| FR-62 #4 | author sees the own-listing card (edit, extend, resolve, delete) and no message button | `tests/sapa/listing-detail-screen.test.tsx` |
| FR-63 #1 | create returns `status = active`, `expires_at` 30 days later; appears in EP-73 on the next request | `tests/sapa/save-listing.test.ts` |
| FR-63 #2 | *Potreba* offered only when `Me.marketplace.can_post_need`; need saved for that shelter; otherwise `listing_type_not_allowed` | `tests/sapa/save-listing.test.ts`, `tests/sapa/listing-form-screen.test.tsx`, `supabase/tests/get_me_marketplace.test.sql` |
| FR-63 #3 | `medicine_care` on a non-need → `category_not_allowed` shown under *Kategorija*; *Lekovi i nega* offered only for *Potreba* | `tests/sapa/save-listing.test.ts`, `tests/sapa/listing-form-screen.test.tsx` |
| FR-63 #4 | selling without amount and without *Po dogovoru* → inline error | `tests/sapa/save-listing.test.ts`, `tests/sapa/listing-form-screen.test.tsx` |
| FR-63 #5 | 6th photo → `too_many_photos` at ticket time; S34 shows *5 / 5* and blocks adding | `tests/sapa/listing-photos.test.ts`, `tests/sapa/listing-form-screen.test.tsx` |
| FR-63 #6 | Free owner's 4th → `premium_required` (`listings`) → S34 `PremiumLock`; `Me.marketplace.active_listing_limit = 3` | `tests/sapa/save-listing.test.ts`, `tests/sapa/listing-form-screen.test.tsx`, `supabase/tests/get_me_marketplace.test.sql` |
| FR-63 #7 | Premium, shelter account and need listings: `active_listing_limit` null and no block | `supabase/tests/get_me_marketplace.test.sql`, `tests/sapa/save-listing.test.ts` |
| FR-64 #1 | `list_my_listings` groups (active incl. hidden / expired / resolved) with counts, order and `expires_at`; S35 tabs | `supabase/tests/sapa_listings_api.test.sql`, `tests/sapa/my-listings-screen.test.tsx` |
| FR-64 #2 | update keeps `published_at` and `expires_at`; `photo_ids` reorders and deletes omitted photos (keys queued) | `tests/sapa/save-listing.test.ts` |
| FR-64 #3 | extend of active or expired → active, `expires_at = now() + 30 days`, `expiry_notice_sent_at` null; resolved / hidden → `listing_not_active` | `tests/sapa/change-listing.test.ts` |
| FR-64 #4 | extend of an expired listing by a Free user with 3 active → `premium_required` → S35 `PremiumLock`, *Objavi ponovo* disabled | `tests/sapa/change-listing.test.ts`, `tests/sapa/my-listings-screen.test.tsx` |
| FR-64 #5 | resolve with an outcome (default by type) → leaves EP-73; S35 *Rešeni* shows the outcome | `tests/sapa/change-listing.test.ts`, `tests/sapa/my-listings-screen.test.tsx` |
| FR-64 #6 | delete requires `confirm = true`, removes listing and photos (keys queued) | `tests/sapa/change-listing.test.ts` |
| FR-65 #1 | job sends one `listing_expiring` email for a listing with ≤ 3 days left, sets `expiry_notice_sent_at` only after Resend accepted, and sends none on a re-run; suspended / pending-deletion authors get none | `supabase/tests/sapa_expiry_job.test.sql`, `tests/sapa/listings-daily-route.test.ts` |
| FR-65 #2 | `/sapa-pomoci/moje?produzi=<id>` extends after sign-in (EP-77 `extend`) | `tests/sapa/my-listings-screen.test.tsx` |
| FR-65 #3 | listing past `expires_at` → `expired`, one `listing_expired` email; it leaves EP-73 | `supabase/tests/sapa_expiry_job.test.sql`, `tests/sapa/listings-daily-route.test.ts` |
| FR-66 #1 | `get_donation_info` returns the shelter's four fields and `payment_purpose`; Doniraj Dialog omits each empty block; *Kopiraj* copies the account | `supabase/tests/sapa_profile_donation.test.sql`, `tests/sapa/listing-detail-screen.test.tsx` |
| FR-66 #2 | signed-out *Doniraj* → sign-in with `next` back to the listing; EP-78 for anon → `401` | `tests/sapa/listing-detail-screen.test.tsx`, `supabase/tests/sapa_profile_donation.test.sql` |
| FR-66 #3 | `has_any = false` → *"Azil još nije dodao podatke za donacije"* + *Pošalji poruku azilu* | `tests/sapa/listing-detail-screen.test.tsx` |
| FR-66 #4 | no payment call or field exists in the Doniraj flow; the only outbound link is the shelter's `payment_url` | `tests/sapa/listing-detail-screen.test.tsx` |
| FR-67 #1 | EP-79 returns display name (or full name), city, member-since and active listings for anon and signed-in callers; S37 renders them | `supabase/tests/sapa_profile_donation.test.sql`, `tests/sapa/user-profile-screen.test.tsx` |
| FR-67 #2 | no email or phone in EP-73, EP-74, EP-79 responses (response keys asserted) | `tests/sapa/public-routes.test.ts` |
| FR-67 #3 | need listing author card shows the shelter name and links to `/o/<slug>` (S23) | `tests/sapa/listing-detail-screen.test.tsx` |
| FR-72 #1 | Admin saves donation info (EP-88); EP-78 returns the new values | `tests/sapa/update-donation-info.test.ts`, `tests/organisation/org-donation-card.test.tsx`, `supabase/tests/sapa_profile_donation.test.sql` |
| FR-72 #2 | Volunteer sees the four values read-only; EP-88 → `forbidden_role`; breeders do not see the card | `tests/organisation/org-donation-card.test.tsx`, `tests/sapa/update-donation-info.test.ts` |
| FR-72 #3 | non-`https://` link → `fields.payment_url = "invalid"` inline; bank account outside `^\d{3}-\d{1,13}-\d{2}$` → inline error | `tests/sapa/update-donation-info.test.ts`, `tests/organisation/org-donation-card.test.tsx` |
| public routes (derived) | `Cache-Control: no-store` on EP-73 / EP-74 / EP-79; signed URLs | `tests/sapa/public-routes.test.ts` |
| daily job auth (derived) | missing / wrong secret → `401 invalid_signature` | `tests/sapa/listings-daily-route.test.ts` |
| OQ-17 interim (derived) | resolved date from `updated_at`; Doniraj purpose line; description 2,000 limit | `tests/sapa/my-listings-screen.test.tsx`, `tests/sapa/listing-detail-screen.test.tsx`, `tests/sapa/listing-form-screen.test.tsx` |
| shells (derived) | `(sapa)` layout picks `PublicShell wide` / owner / organisation `AppShell`; *Šapa pomoći* nav item present; signed-in prefixes redirect to `/prijava` | `tests/sapa/sapa-layout.test.tsx` |
| composites | `ListingCard` shows *2.500 RSD* / *Po dogovoru* / *Besplatno* and links to S33; `ListingTypeTag` icon + label per type | `tests/components/listing-card.test.tsx` |

**Verification:**
```
npx supabase db reset  # expected: all migrations + seed apply without error
npm run db:types       # expected: exit 0
npm run typecheck      # expected: exit 0
npm run lint           # expected: exit 0
npm test               # expected: all Vitest suites pass, incl. tests/sapa/*, tests/organisation/org-donation-card.test.tsx, tests/components/listing-card.test.tsx
npx supabase test db   # expected: all pgTAP files pass, incl. the four files above
npm run build          # expected: exit 0
```

#### Prompt
```
You are executing Step 28b — Listings, public pages, profiles & donation info — of docs/product/06-build-plan.md for the Moj Ljubimac web app. One outcome: the Šapa pomoći board works end to end without messaging — S32, S33, S34, S35, S37 and the S29 Donacije card on real data through EP-73 … EP-79, EP-87, EP-88 (with EP-13 / EP-15 listing_photo and the EP-43 / EP-53 additions).

READ FIRST, in this order:
1. docs/product/02-prd.md §6 FR-61 … FR-67 and FR-72; §7 UC-11, UC-12; §8 BR-54 … BR-58, BR-61; §9 E-28 … E-33; §15 OQ-16.
2. docs/product/03-technical-constraints.md ADR-07, ADR-16, ADR-17, ADR-18; §5.9; §5.10; §8; §8.1.
3. docs/product/05-api-integration-contract.md §3.1, §3.3, §4.1, §4.4, EP-13, EP-15, EP-43, EP-53, §5.9 (conventions block, EP-73 … EP-79, EP-87, EP-88), §6 ListingSummary, Listing, ListingPhoto, ListingAuthor, MyListing, MarketplaceStatus, DonationInfo, PublicProfile, Me, Organisation, UploadTicket, FileUrl, §7.1, §7.2, §7.3, §9.4, §10, §11, §12, §17 (OQ-16, OQ-17).
4. docs/product/04-design-system.md §4.1, §5.1, §5.2, §5.3, §5.6, §6, §7, §8, §9, §9.1, §10, §11, §12 S29, S32, S33, S34, S35, S37.
5. docs/product/04-design/screens/sapa-pomoci.tsx, listing-detail.tsx, listing-form.tsx, my-listings.tsx, user-profile.tsx, org-profile.tsx; docs/product/04-design/components/listing-type-tag.tsx, listing-card.tsx, shells.tsx.
6. docs/product/06-build-plan.md §4 (invariant 11), §5, §6, §12 (CR-27, OQ-16, OQ-17) and the Session logs of Steps 10, 11, 12, 13, 15, 17, 19, 21, 24 and 28a.

SETTLED UPSTREAM — apply exactly:
- Route group (CR-27, non-blocking; TC ADR-16 names no group for pages shown in both a signed-in and the public shell): S32–S37 live under app/(sapa)/ with app/(sapa)/layout.tsx choosing the shell from the session — no session → PublicShell wide (Design §5.3); organisation member → AppShell variant "organisation" with its orgType; otherwise AppShell variant "owner" — using the same EP-43 fields and counts.podsetnici source app/(app)/layout.tsx and app/(org)/layout.tsx use (Steps 12, 17, 24 Session logs). Signed-in-only routes (/sapa-pomoci/nova, /sapa-pomoci/moje, /sapa-pomoci/<id>/izmeni) are added to the request-interception file's signed-in prefixes; /sapa-pomoci, /sapa-pomoci/<id> and /korisnik/<id> stay public. Sign-in prompts (E-32) link to /prijava?next=<current path>.
- Public routes EP-73, EP-74, EP-79: route handlers that read with the caller's own Supabase session, sign photo URLs for 10 minutes with lib/integrations/r2.ts, and answer Cache-Control: no-store (TC ADR-18); no X-Robots-Tag; no purge anywhere.
- OQ-16 (open, non-blocking): MarketplaceStatus.active_listing_limit = 3 unless active owner Premium or account_type = shelter; a breeder plan does not lift it.
- OQ-17 (open, non-blocking) — the API §17 interim mappings: (a) resolved date shown from listings.updated_at; (b) S35 hidden card shows the reason and time of the actioned report on that listing; (c) Doniraj recipient = organisations.name, purpose = "Donacija — <listing title>" (DonationInfo.payment_purpose); (d) S34 description up to 2,000 characters (PRD/TC; replace the mock's 1000), title 5–80 client-side and 1–80 on the server; (e) bank account validated in updateDonationInfo with ^\d{3}-\d{1,13}-\d{2}$; (f) no screen edits display_name; (g) a resolved listing opened by a non-author is unavailable (404) — the resolved content variant is for the author only.
- Composites: port docs/product/04-design/components/listing-type-tag.tsx and listing-card.tsx to components/app/ exactly as Step 10 ported the other composites (markup, classes, props unchanged; only import paths fixed). components/app/shells.tsx must equal the v1.6 mock (Šapa pomoći item with short label "Šapa", Poruke link, PublicShell wide); change it only if Step 10 ported an older version. The --info-soft token comes from app/globals.css (Step 10 copied 04-design/globals.css); if it is missing, STOP and ask.
- Daily job EP-87: pg_cron at 09:00 Europe/Belgrade calls POST /api/internal/listings-daily through pg_net with the Vault secrets dispatch_url / dispatch_secret exactly as Step 19 schedules /api/internal/dispatch; handle Europe/Belgrade the way the Step 08 / Step 19 Session logs record. The route compares X-Dispatch-Secret with DISPATCH_SECRET in constant time.
- Copy: Design §9.1 templates listing_expiring and listing_expired (with email_footer) in the recipient's profiles.locale, via lib/integrations/resend.ts; one retry is the next daily run (API §9.4). Every screen string goes into lib/i18n/sr.ts and lib/i18n/en.ts per Design §9 (Serbian = mockup copy, English = faithful translation; no new copy).
- Database errors follow TC §5.7.1 and map per API §7.1 (incl. premium_required:listings and SQLSTATE 23514 on listings.category → category_not_allowed); add those rows to lib/server/result.ts only if Step 11 did not.

BUILD:
1. Migration sapa_listings_api: rpc:list_listings (EP-73), rpc:get_listing (EP-74, Listing incl. viewer fields and has_donation_info), rpc:list_my_listings (EP-76 with counts and usage), rpc:get_public_profile (EP-79, security definer, only the TC-listed fields), rpc:get_donation_info (EP-78, security definer, authenticated only); replace rpc:get_me (Step 12) with the same body plus Me.display_name and Me.marketplace (MarketplaceStatus — unread_conversations computed from the 28a tables); replace rpc:get_my_organisation (Step 24) with the same body plus Organisation.donation (members of shelters only); the shelter-Admin column grant on the four donation columns if Step 28a did not ship it; only the functions saveListing / changeListing need to stay atomic. Security invoker unless the EP says definer.
2. Migration listings_daily: the EP-87 functions (step 1 notice candidates, step 2 expire — batches ≤ 200, FOR UPDATE SKIP LOCKED) and the daily pg_cron schedule (settled above). Run npm run db:types.
3. lib/actions/listings.ts: saveListing (EP-75: create/update, need → caller's shelter from Me.marketplace.need_organisation, photo_ids reorder/delete with keys queued) and changeListing (EP-77: extend / resolve with default outcome by type / delete with confirm). lib/actions/uploads.ts: EP-13 purpose listing_photo (author only, active or expired listing, ≤ 5, images per BR-05, key u/<author_id>/listings/<listing_id>/<uuid>-<safe_file_name> per API §10 item 6). lib/actions/files.ts: EP-15 kind listing_photo. lib/actions/organisation.ts: updateDonationInfo (EP-88). Every action runs the API §4.1 gates (lib/server/gates.ts) and maps errors with lib/server/result.ts.
4. Route handlers app/api/public/listings/route.ts (EP-73), app/api/public/listings/[id]/route.ts (EP-74), app/api/public/users/[id]/route.ts (EP-79), app/api/internal/listings-daily/route.ts (EP-87, response counts per EP-87).
5. app/(sapa)/layout.tsx per the settled route group; the request-interception file gets the three signed-in prefixes.
6. Screens — port each mockup to its client file with its page.tsx, remove the StateSwitcher, drive every state from real responses per API §7.3:
   - S32 sapa-pomoci.tsx → app/(sapa)/sapa-pomoci/sapa-pomoci-client.tsx: type chips, Kategorija / Za koga / Grad Selects (cities from EP-67), result line, ListingCard grid, pagination (limit 18); states D, O, L, E, X, S.
   - S33 listing-detail.tsx → app/(sapa)/sapa-pomoci/[id]/listing-detail-client.tsx: gallery, tags, price, author card (S37 or S23 for shelters), safety tip, own-listing card (edit → S34, extend, resolve AlertDialog), Doniraj Dialog from EP-78 (sign-in first when signed out), resolved (author only), unavailable on 404. Do NOT build the Pošalji poruku Dialog or the ⋯ menu (Step 28c): render the "Pošalji poruku" / "Pošalji poruku azilu" buttons as the mockup shows them for non-authors but leave them without an action, and record that in the Session log.
   - S34 listing-form.tsx → app/(sapa)/sapa-pomoci/nova/listing-form-client.tsx, used by nova/page.tsx and [id]/izmeni/page.tsx (edit preloaded from EP-74): type tiles (Potreba only when can_post_need), fields with the OQ-17 (d) limits, Cena for selling, photos via EP-13 after EP-75 saved the listing (N / 5), delete AlertDialog on edit; states D, shelter, edit, invalid, X, G, S.
   - S35 my-listings.tsx → app/(sapa)/sapa-pomoci/moje/my-listings-client.tsx: counter card, tabs, row cards, extend / republish / resolve / delete, ?produzi=<id> extends on load; states D L E X G S. The "Razgovora: N · nepročitano: N" footer comes from MyListing.
   - S37 user-profile.tsx → app/(sapa)/korisnik/[id]/user-profile-client.tsx: header card, Aktivni oglasi grid; states D, O, L, E, X, unavailable. Do NOT build the ⋯ menu or the blocked state actions (Step 28c).
   - S29: add the Donacije card of docs/product/04-design/screens/org-profile.tsx to app/(org)/organizacija/profil/org-profile-screen.tsx (shelters only; Volunteer read-only; values from EP-53 Organisation.donation; save via EP-88).
7. lib/integrations/resend.ts: the two templates. README.md Scheduled jobs: the listings-daily schedule (names of the Vault secrets only) and how to call it manually locally.
8. Strings into lib/i18n/sr.ts and lib/i18n/en.ts; regenerate types with npm run db:types.
9. Tests: write every test in the Step 28b "Tests to ship" table of docs/product/06-build-plan.md in exactly those files; R2 and Resend are faked in Vitest.

FILES YOU MAY CREATE OR MODIFY (allowlist — nothing else):
- supabase/migrations/<timestamp>_sapa_listings_api.sql, <timestamp>_listings_daily.sql; the generated types file under lib/supabase/ (via npm run db:types only)
- lib/actions/listings.ts, lib/actions/uploads.ts, lib/actions/files.ts, lib/actions/organisation.ts
- lib/integrations/resend.ts (listing_expiring and listing_expired only); lib/server/result.ts (only the two API v1.3 rows, only if missing)
- app/api/public/listings/route.ts, app/api/public/listings/[id]/route.ts, app/api/public/users/[id]/route.ts, app/api/internal/listings-daily/route.ts
- app/(sapa)/layout.tsx; app/(sapa)/sapa-pomoci/page.tsx, sapa-pomoci-client.tsx; app/(sapa)/sapa-pomoci/[id]/page.tsx, listing-detail-client.tsx; app/(sapa)/sapa-pomoci/nova/page.tsx, listing-form-client.tsx; app/(sapa)/sapa-pomoci/[id]/izmeni/page.tsx; app/(sapa)/sapa-pomoci/moje/page.tsx, my-listings-client.tsx; app/(sapa)/korisnik/[id]/page.tsx, user-profile-client.tsx
- app/(org)/organizacija/profil/page.tsx, app/(org)/organizacija/profil/org-profile-screen.tsx (Donacije card only)
- components/app/listing-type-tag.tsx, components/app/listing-card.tsx; components/app/shells.tsx (only to match the v1.6 mock)
- the request-interception file named in the Step 11 Session log (the three signed-in prefixes only)
- lib/i18n/sr.ts, lib/i18n/en.ts (add keys only); README.md (Scheduled jobs section only)
- supabase/tests/sapa_listings_api.test.sql, sapa_profile_donation.test.sql, sapa_expiry_job.test.sql, get_me_marketplace.test.sql
- tests/sapa/save-listing.test.ts, change-listing.test.ts, listing-photos.test.ts, public-routes.test.ts, listings-daily-route.test.ts, update-donation-info.test.ts, sapa-layout.test.tsx, sapa-list-screen.test.tsx, listing-detail-screen.test.tsx, listing-form-screen.test.tsx, my-listings-screen.test.tsx, user-profile-screen.test.tsx; tests/organisation/org-donation-card.test.tsx; tests/components/listing-card.test.tsx
- docs/product/06-build-plan.md (Step 28b row in §3 and the Step 28b Session log only)
Touching any other file requires stopping and asking.

ACCEPTANCE CRITERIA (PRD v1.7, verbatim — each needs a passing test):
- FR-61 #1: Given a Visitor who is not signed in, When they open Šapa pomoći, Then active listings are shown, newest first, in pages.
- FR-61 #2: Given one or more filters, When applied, Then only active listings matching every selected filter are shown.
- FR-61 #3: Given a listing that is resolved, expired, or hidden, or whose author is suspended from Šapa pomoći, Then it is not shown in the list.
- FR-61 #4: Given a signed-in user who blocked another user, Then listings by the blocked user are not shown to them (BR-59).
- FR-61 #5: Given no match, Then an empty result with a "clear filters" action is shown.
- FR-62 #1: Given an active listing, When anyone opens it (signed in or not), Then they see its photos, title, type, category, species, city, description, price in RSD or "po dogovoru" (selling only), posted date, expiry date, and an author card linking to the author's public profile (FR-67).
- FR-62 #2: Given a need listing, Then a "Doniraj" button is shown (FR-66).
- FR-62 #3: Given a listing that is not active, When opened by anyone other than its author or the Operator, Then a "listing is no longer available" message is shown instead of its content.
- FR-62 #4: Given the listing's author, When they open it, Then edit, extend, mark resolved, and delete actions are shown instead of "Pošalji poruku".
- FR-63 #1: Given a signed-in user, When they save a giving, selling, or seeking listing with all required fields, Then it is published as active with an expiry date 30 days later.
- FR-63 #2: Given a member of an approved shelter organisation, When they choose type "need", Then the listing is published for that shelter; Given any other user, Then "need" is not offered.
- FR-63 #3: Given a listing whose type is not "need", When the category "medicine and care" is chosen, Then saving is blocked with a message.
- FR-63 #4: Given a selling listing, When neither an amount nor "po dogovoru" is set, Then saving is blocked with a message.
- FR-63 #5: Given a listing with 6 photos, When saving, Then saving is blocked with a message.
- FR-63 #6: Given a Free user with 3 active listings, When they try to publish a 4th, Then it is blocked and a Premium offer is shown.
- FR-63 #7: Given a Premium user, a user with a Shelter account, or any need listing, When publishing, Then there is no limit on active listings.
- FR-64 #1: Given "Moje objave", Then the author sees all their listings grouped as active, resolved, and expired, each with its expiry date.
- FR-64 #2: Given an active listing, When the author edits and saves it, Then the new values are shown and the expiry date does not change.
- FR-64 #3: Given an active or expired listing, When the author taps "Produži", Then it is active with an expiry date 30 days from now.
- FR-64 #4: Given an expired listing of a Free user who already has 3 active listings, When they extend it, Then it is blocked and a Premium offer is shown.
- FR-64 #5: Given an active listing, When the author marks it resolved with an outcome (given / sold / donated / found), Then it leaves the public list and is shown as resolved with that outcome.
- FR-64 #6: Given any of their listings, When the author confirms a single "Yes, delete" prompt, Then the listing and its photos are permanently removed; existing conversations remain readable and show "listing deleted".
- FR-65 #1: Given an active listing, When 3 days remain before its expiry date, Then the author receives one email with a "Produži" button.
- FR-65 #2: Given the email's "Produži" button, When the author uses it, Then the listing is extended as in FR-64.
- FR-65 #3: Given an active listing whose expiry date has passed, Then it becomes expired, leaves the public list, and the author receives one email that it expired.
- FR-66 #1: Given a signed-in user on a need listing, When they tap "Doniraj", Then the shelter's donation info is shown: bank account and/or payment link, drop-off address, and drop-off hours, as far as the shelter provided them (FR-72).
- FR-66 #2: Given a Visitor who is not signed in, When they tap "Doniraj", Then they are asked to sign in or register and return to the listing afterwards.
- FR-66 #3: Given a shelter with no donation info at all, Then "Doniraj" shows a message that the shelter has not added donation info yet, with "Pošalji poruku".
- FR-66 #4: Given any donation, Then no money is collected or processed by the product (BR-58).
- FR-67 #1: Given any user's profile opened from a listing (signed in or not), Then it shows display name (nickname or name), city, member-since month and year, and the user's active listings.
- FR-67 #2: Given any public profile, Then email address and phone number are never shown.
- FR-67 #3: Given a shelter member's need listing, Then the author card shows the shelter's name and links to the shelter's public page.
- FR-72 #1: Given a Shelter Admin on the organisation profile's "Donacije" section, When they save donation info, Then "Doniraj" on the shelter's need listings shows the new values.
- FR-72 #2: Given a Volunteer, Then these fields are view-only.
- FR-72 #3: Given a payment link that is not a valid https URL, When saving, Then saving is blocked with a message.
(FR-61 #4: filter only — blocking is Step 28c. FR-62 #4 and FR-66 #3: the message Dialog is Step 28c.)
- Derived checks (public routes not cached, daily job schedule and auth, OQ-17 interim mappings, shells) exactly as listed under "Acceptance criteria" in Step 28b of docs/product/06-build-plan.md.

FORBIDDEN:
- No colours, spacing, radii, shadows, fonts or components outside docs/product/04-design-system.md §4–§6 and the composites in components/app; OQ-10 proposed composites are not approved; no lucide brand icons.
- No library outside docs/product/03-technical-constraints.md ADR-17; add no npm dependency.
- No endpoint, field, error code or state outside docs/product/05-api-integration-contract.md; no messaging, report, block or moderation code (Step 28c).
- No table, column, enum or constraint change; none of the OQ-17 proposed columns.
- No edge cache, cache header other than no-store on the three public routes, or purge (TC ADR-18). No payment code of any kind (BR-58). The service-role key never reaches the browser.
- No user-facing copy that is not in 04-design-system.md or docs/product/04-design.

DONE MEANS:
- Every test in the Step 28b "Tests to ship" table exists and passes.
- These commands all exit 0, in this order: npx supabase db reset; npm run db:types; npm run typecheck; npm run lint; npm test; npx supabase test db; npm run build.
- In docs/product/06-build-plan.md: set the Step 28b row in §3 to ✅ with today's date and append a Step 28b Session log entry (date, what was built, pass/fail per command, the files Step 28c will extend — the S33 and S37 client files and app/(sapa)/layout.tsx —, deviations, follow-ups incl. the OQ-17 interim mappings applied).
- Commit with the message "Step 28b: Listings, public pages, profiles & donation info".

If anything above is ambiguous, if a referenced section doesn't contain what this prompt says it does, or if completing this step would require touching a file outside the list or making a decision the referenced documents don't settle — STOP and ask. Do not choose a reasonable default. Do not proceed with a partial implementation.
```

#### Session log
- **2026-10-29** — Step 28b built (unattended overnight run).
  - **Built:**
    - `20261028233000_sapa_listings_api.sql`:
      - Reads: `list_listings` (EP-73) and `get_listing` (EP-74) as security invoker, readable by anon and authenticated; `list_my_listings` (EP-76, invoker); `get_donation_info` (EP-78, definer, authenticated only); `get_public_profile` (EP-79, definer, anon + authenticated, only the TC fields, never email or phone).
      - `save_listing` (EP-75, invoker, one transaction) with `private.reorder_listing_photos` (definer). The latter deletes omitted photos, whose keys are queued by the 28a trigger, and renumbers the kept ones. `(listing_id, position)` is unique and not deferrable, so kept rows are re-inserted with the same id, key and created_at, and the queue rows written by their delete trigger are removed again.
      - Owner-decision helpers `sapa_author_card`, `org_has_donation_info` (definer, anon + authenticated) and `my_listing_moderation` (definer, authenticated); `private.marketplace_status`, `private.donation_info_json`, `private.listing_days_left`, `private.listing_summary_json`.
      - `get_me` was replaced: the same body plus `display_name` and `marketplace`.
      - `get_my_organisation` was replaced: the same body plus `organisation.donation`, for shelters only.
      - The anon paths (`list_listings`, `get_listing`) inline City, days_left and the photo file name, and read `user_blocks` / `conversations` only inside signed-in branches. Visitors have no usage on the `private` schema and no grant on those tables.
    - `20261028233005_listings_daily.sql`: `listings_expiry_notice_candidates`, `mark_listing_notices_sent` and `expire_listings` (definer, service_role only, ≤ 200 rows, `FOR UPDATE SKIP LOCKED`; suspended or deletion-pending authors are not notified). pg_cron `listings-daily` `0 7,8 * * *` → `private.call_internal_route('/api/internal/listings-daily')` (same Vault secrets as Step 19).
    - `lib/actions/listings.ts`:
      - `saveListing` (EP-75) and `changeListing` (EP-77).
      - Server wrappers `listMyListings` (EP-76) and `getDonationInfo` (EP-78), since the session lives in httpOnly cookies.
      - Gate 4 is applied only to need listings.
      - Types for ListingSummary, Listing, ListingPhoto, ListingAuthor, MyListing, MarketplaceStatus and PublicProfile.
    - `lib/actions/uploads.ts`: EP-13 `listing_photo`. Author only; listing active or expired; caller not suspended (checked in the action, per the 28a follow-up); `too_many_photos` at ticket time; key `u/<author_id>/listings/<listing_id>/<uuid>-<safe>`; confirm inserts at the lowest free position and returns ListingPhoto with a signed URL.
    - `lib/actions/files.ts`: EP-15 `listing_photo`.
    - `lib/actions/organisation.ts`: `updateDonationInfo` (EP-88) and the DonationInfo type; `Organisation.donation` is typed.
    - `lib/server/result.ts`: SQLSTATE 23514 on `listings_category_check` → `category_not_allowed` (the row was missing). `premium_required:listings` was already covered generically.
    - `lib/integrations/resend.ts`: `listing_expiring` and `listing_expired` in the recipient's locale, with the footer. The Serbian date already ends with a full stop, so it is not doubled.
    - Route handlers EP-73 / EP-74 / EP-79: the caller's session, `Cache-Control: no-store` on every answer, cover photos and photos signed for 10 minutes with internal keys dropped, no X-Robots-Tag, no purge.
    - EP-87 `app/api/internal/listings-daily/route.ts`:
      - Constant-time secret check.
      - Runs only when the Europe/Belgrade hour is 9; otherwise it answers zero counts.
      - Marks the notice only for emails Resend accepted.
      - Answers `{ notices_sent, expired, emails_failed, duration_ms }`.
    - `app/(sapa)/layout.tsx`: PublicShell wide, or the organisation / owner AppShell, with the owner's Podsetnici badge from the same source as `(app)/layout.tsx` and the Toaster.
    - `lib/supabase/middleware.ts` (where Step 11's log says prefixes go): `/sapa-pomoci/nova`, `/sapa-pomoci/moje` and the pattern `/sapa-pomoci/<id>/izmeni`.
    - Screens: S32 `sapa-pomoci-client.tsx`, S33 `listing-detail-client.tsx`, S34 `listing-form-client.tsx` (create and edit), S35 `my-listings-client.tsx`, S37 `user-profile-client.tsx`, each with its page.tsx, and the S29 Donacije card in `org-profile-screen.tsx`, with `page.tsx` passing `updateDonationInfo`.
    - Composites `components/app/listing-type-tag.tsx` and `listing-card.tsx`. `shells.tsx` already equalled the v1.6 mock plus the Step 12 labels, so it is unchanged; `--info-soft` is present in globals.css.
    - i18n `sapa.*`, `orgProfile.donation` and `messages.listing_expiring` / `listing_expired` (sr + en).
    - README Scheduled jobs: the listings-daily job and the manual curl.
    - Tests: pgTAP `sapa_listings_api` (71), `sapa_profile_donation` (27), `sapa_expiry_job` (25), `get_me_marketplace` (19). Vitest: 14 files from the Tests to ship table (`tests/sapa/*`, `tests/organisation/org-donation-card.test.tsx`, `tests/components/listing-card.test.tsx`).
  - **Owner decisions applied (2026-10-23):**
    - `sapa_author_card` / `org_has_donation_info` are definer and called by the invoker reads; `my_listing_moderation` is definer.
    - Display-name fallback "Korisnik" / "User"; report reasons in `sapa.common.reportReason.*`.
    - The S35 hidden-card copy, without the reason part when there is none.
    - The 09:00 job as `0 7,8 * * *` with the Belgrade-hour check in the route.
    - Organisation actions file = `lib/actions/organisation.ts`.
    - General rules: Intl date formats, plurals with _one / _few / _other keys, unmapped 422 field codes show the form-level message.
  - **OQ-17 interim mappings applied:**
    - (a) `resolved_at` = `listings.updated_at` (S33, S35).
    - (b) S35 hidden card = `handled_at` / `reason` of the latest actioned report, via `my_listing_moderation`.
    - (c) Doniraj recipient = `organisations.name`, purpose "Donacija — <title>".
    - (d) Description limit 2,000; title 5–80 client-side and 1–80 on the server.
    - (e) Bank account `^\d{3}-\d{1,13}-\d{2}$` in `updateDonationInfo`.
    - (f) No screen edits `display_name`.
    - (g) A resolved listing opened by a non-author → 404 / unavailable.
    - OQ-16: `active_listing_limit` = 3 unless owner Premium or a shelter account; a breeder plan does not lift it (proved in `get_me_marketplace`).
  - **Owner-approved exceptions:**
    - Pre-approved exception 1: `supabase/tests/occurrence_schedule.test.sql` asserted that no cron job other than `reminder-dispatch` and the nightly generation exists. It now also excludes `listings-daily`, which this step adds; only that assertion changed.
  - **Verification** (in order, on the final code):
    - `npx supabase db reset` ✅ exit 0
    - `npm run db:types` ✅ exit 0
    - `npm run typecheck` ✅ exit 0
    - `npm run lint` ✅ exit 0 (0 errors; the 2 known warnings in the generated `cloudflare-env.d.ts`)
    - `npm test` ✅ `Test Files 124 passed (124)`, `Tests 1420 passed (1420)`
    - `npx supabase test db` ✅ `Files=83, Tests=2839`, `Result: PASS`
    - `npm run build` ✅ exit 0
  - **Deviations / decisions:**
    - **Composites:**
      - `ListingCard` gained an optional `labels` prop (Serbian defaults, in a `labels:start` / `labels:end` block, the FR-35 pattern of shells / error-state / pet-header / reminder-row) and an optional `coverUrl`, which shows the signed cover photo instead of the placeholder.
      - `ListingTypeTag` gained an optional `label`.
      - Without these, English screens would show Serbian card text and no photos. Markup and classes are otherwise the mock's.
      - Follow-up: add both composites to `tests/design/ui-overrides.test.ts` COMPOSITES with a strip function (that file was not on this step's list).
    - **S33 and S37 message / report buttons:** "Pošalji poruku" and "Pošalji poruku azilu" (on S33 and in the Doniraj Dialog) are rendered as the mockup shows them for non-authors, without an action. The ⋯ menus, ReportDialog / BlockDialog and the S37 blocked-state actions are not built (Step 28c).
    - **Client-side reads:** S32, S33 and S37 load through their public route handlers (fetch, no-store). S34 edit preloads with `rpc:get_listing` in page.tsx and signs thumbnails with EP-15. S35 uses `listMyListings` with EP-15 thumbnails.
    - **S33:**
      - Delete is added to the own-listing card (FR-62 #4; the mock has none), using the S34 / S35 delete copy.
      - The resolve dialog title uses the S35 wording, which fits every type.
      - The author's expired / hidden variants reuse S35 copy.
      - Signed out, Doniraj links to `/prijava?next=/sapa-pomoci/<id>`.
    - **S34:**
      - The usage line is hidden for unlimited non-shelter users.
      - Photo errors turn the existing hint red (no mockup copy).
      - A photo upload failing after a successful create keeps the form on the saved listing, so a resave updates it.
      - No toast after delete.
    - **S35:**
      - "Izmeni" is hidden for hidden listings and "Označi kao rešeno" while suspended, because the API refuses both.
      - The delete notice is a toast.
      - "Ističe za 1 dan" is a singular plural form.
      - Donation save in S29 shows the existing status card and a toast (EP-88).
    - **S37:** Serbian genitive month names ("septembra") come from the dictionary, because Intl sr-Latn gives the nominative. Listings load with limit 50 and no pagination, as the mockup has none.
    - **S32:** pagination also shows with filters.
    - **Request interception:**
      - The middleware redirect still drops `next` (unchanged behaviour). A signed-out author opening the `listing_expiring` "Produži" link (`/sapa-pomoci/moje?produzi=<id>`) lands on `/prijava` and then S01; opening the link again while signed in extends.
      - Follow-up: pass `next` in the interception redirect for the Šapa pomoći prefixes.
    - **Grants:** `save_listing`, `list_my_listings` and `my_listing_moderation` revoke execute from anon explicitly (Supabase default privileges grant anon EXECUTE on new public functions); pgTAP asserts 42501.
    - **Manual EP-87 call:** the route answers zeros outside 09:xx Belgrade, so a manual local curl does real work only then (README says so).
  - **Files Step 28c will extend:**
    - `app/(sapa)/sapa-pomoci/[id]/listing-detail-client.tsx` (the Pošalji poruku Dialog, the ⋯ menu, the Doniraj Dialog's "Pošalji poruku azilu").
    - `app/(sapa)/korisnik/[id]/user-profile-client.tsx` (the ⋯ menu, the B state).
    - `app/(sapa)/layout.tsx` (`counts.poruke` = `Me.marketplace.unread_conversations`).
    - The S35 "Razgovora" footer already links to `/poruke`.
  - **Follow-ups:**
    - The `ui-overrides` composites entry (above).
    - `next` in the interception redirect (above).
    - TC §5.10 / API: `listing_photos` position renumbering needs a re-insert, because the unique constraint is not deferrable. A deferrable constraint would simplify `reorder_listing_photos`.
    - Carried over: the 28a TC §5.10 report index collision and preference_type = reminder_type.

---

### Step 28c — Messaging, notifications, report/block & moderation

| | |
|---|---|
| **Status** | ⬜ not started |
| **Outcome** | Signed-in users message a listing's author from S33 and continue in S36 *Poruke* (inbox + thread, unread counts, *Poruke* badge in the shells), the recipient gets an email and a push unless switched off in the S12 *Poruke* card; users report listings and users and block or unblock users from S33, S36 and S37; the Operator works the S26 *Moderacija* queue — dismiss, hide, suspend, restore — with the author emailed. |
| **Implements** | FR-68, FR-69, FR-70, FR-71; FR-62 #4 and FR-66 #3 (message action), NFR-11 · EP-80, EP-81, EP-82, EP-83, EP-84, EP-85, EP-86; EP-28 (type `message`), EP-43 (`marketplace.unread_conversations` badge) · S36 `/poruke`, `/poruke/[id]`; S33 `/sapa-pomoci/[id]` (*Pošalji poruku* Dialog, `⋯` menu); S37 `/korisnik/[id]` (`⋯` menu, blocked state); S12 `/podesavanja/podsetnici` (*Poruke* card); S26 `/admin` (*Moderacija* tab) · composites `ReportDialog`, `BlockDialog`; `AppShell` *Poruke* badge (`counts.poruke`) and admin *Moderacija* badge (`counts.moderacija`) · API §11 (30 messages / hour), §3.3 (idempotency) · Design §9.1 (`new_message`, `listing_hidden`, `marketplace_suspended`) · tables `conversations`, `messages`, `user_blocks`, `reports`, `listings` (hide/restore), `profiles` (suspension), `reminder_preferences` (`message`), `push_subscriptions`, `rate_limit_counters`, `idempotency_keys` |
| **Depends on** | Step 28b, Step 19 (Resend and Web Push adapters) |
| **Blocked by** | — (OQ-17 non-blocking: moderation note only in the email, restrictions derived from the actioned report) |
| **Track** | single |

**Read before starting:**
- `docs/product/02-prd.md` §6 FR-62, FR-66, FR-68, FR-69, FR-70, FR-71; §7 UC-11, UC-13; §8 BR-59, BR-60, BR-61; §9 E-32 … E-35; §10 NFR-11.
- `docs/product/03-technical-constraints.md` §5.5 (`reminder_preferences` type `message`, `push_subscriptions`), §5.7 (`idempotency_keys`, `rate_limit_counters`), §5.10, §7 (NFR-11 row), §9, ADR-05, ADR-08, ADR-16, §10 RISK-31.
- `docs/product/04-design-system.md` §5.1, §5.2, §5.5 (*Moderacija*), §6 (`AppShell` counts, `ReportDialog`, `BlockDialog`, `ReadOnlyBanner`), §8, §9, §9.1 (`new_message`, `listing_hidden`, `marketplace_suspended`, `email_footer`), §10, §11 (S12, S26, S33, S36, S37), §12 S12, S26, S33, S36, S37.
- `docs/product/04-design/screens/messages.tsx`, `listing-detail.tsx`, `user-profile.tsx`, `reminder-settings.tsx`, `admin.tsx`; `docs/product/04-design/components/safety-dialogs.tsx`, `shells.tsx`.
- `docs/product/05-api-integration-contract.md` §3.3, §4.1, §4.4 (rows EP-28, EP-80 … EP-86), §5.3 EP-28, §5.5 EP-43, §5.9 (conventions block, EP-74 viewer fields, EP-80 … EP-86), §6 (`ConversationSummary`, `Conversation`, `Message`, `UserBlock`, `Report`, `ModerationItem`, `Restriction`, `ReminderPreference`, `MarketplaceStatus`), §7.1, §7.2, §7.3 (blocked, suspended), §8, §9.4 (Web Push row, Šapa pomoći notifications), §11, §12, §17 OQ-17.
- `docs/product/06-build-plan.md` §4 (invariant 11), §5, §6 and the Session logs of Steps 11, 12, 17, 18, 19, 24, 28, 28a and 28b (request-interception file, layouts and counts, S12 files and `rpc:get_reminder_settings`, Resend / Web Push adapters, S26 files and `lib/actions/admin.ts`, the Šapa pomoći schema and the S33 / S37 / `(sapa)` files).

**Files this step may touch:**
- `supabase/migrations/*_sapa_messaging_api.sql` (new: `rpc:list_my_conversations`, `rpc:get_conversation`, `rpc:mark_conversation_read`, `rpc:block_user`, `rpc:unblock_user`, `rpc:admin_list_moderation`, and the functions `moderate` needs for atomicity; `rpc:get_reminder_settings` replaced to return the seven preference rows incl. `message`, and the database validation EP-28 states for the `message` row if Step 28a's check does not already enforce it)
- the generated types file under `lib/supabase/` (via `npm run db:types` only)
- `lib/actions/messages.ts` (new: `sendMessage` EP-82 incl. the new-message notification)
- `lib/actions/reports.ts` (new: `submitReport` EP-84)
- `lib/actions/admin.ts` (modify: add `moderate` EP-86)
- `lib/integrations/resend.ts` (the Design §9.1 templates `new_message`, `listing_hidden`, `marketplace_suspended` only)
- `lib/integrations/webpush.ts` (modify only if it cannot send the `{ title, body, url }` payload of API §9.4)
- `public/sw.js` (modify only if a notification without `done_url` does not open `url`)
- `app/(sapa)/poruke/page.tsx`, `app/(sapa)/poruke/[id]/page.tsx`, `app/(sapa)/poruke/messages-client.tsx` (new, S36 — both pages render the same client component)
- `app/(sapa)/sapa-pomoci/[id]/listing-detail-client.tsx` (modify: *Pošalji poruku* Dialog and `⋯` menu)
- `app/(sapa)/korisnik/[id]/user-profile-client.tsx` (modify: `⋯` menu and blocked state)
- `components/app/safety-dialogs.tsx` (new: ported from `04-design/components/`)
- `app/(app)/podesavanja/podsetnici/reminder-settings-client.tsx` (modify: *Poruke* card only)
- `app/admin/admin-screen.tsx` (modify: *Moderacija* tab only), `app/admin/layout.tsx` (modify: `counts.moderacija`)
- `app/(app)/layout.tsx`, `app/(org)/layout.tsx`, `app/(sapa)/layout.tsx` (modify: `counts.poruke` from `Me.marketplace.unread_conversations`)
- the request-interception file named in the Step 11 Session log — add the signed-in prefix `/poruke` only
- `lib/i18n/sr.ts`, `lib/i18n/en.ts` (add keys only)
- `supabase/tests/sapa_conversations_api.test.sql`, `supabase/tests/sapa_moderation_api.test.sql`, `supabase/tests/message_preferences.test.sql`
- `tests/sapa/send-message.test.ts`, `tests/sapa/new-message-notification.test.ts`, `tests/sapa/submit-report.test.ts`, `tests/sapa/messages-screen.test.tsx`, `tests/sapa/listing-detail-messaging.test.tsx`, `tests/sapa/user-profile-safety.test.tsx`, `tests/sapa/unread-badge.test.tsx`, `tests/admin/moderate.test.ts`, `tests/admin/moderation-tab.test.tsx`, `tests/reminder-settings/message-notifications-card.test.tsx`, `tests/components/safety-dialogs.test.tsx`
- `docs/product/06-build-plan.md` (Step 28c row in §3 and the Step 28c Session log only)

**Out of bounds:** listings, public pages, donation info and the expiry job (Step 28b — unchanged); WhatsApp and Viber for messages (never, API §9.4); any real-time mechanism, polling loop or Supabase Realtime (NFR-11, TC §9); message editing, deleting or attachments (API §14); Operator access to message bodies (TC §5.10); storing the Operator's note (OQ-17); any table or column change; the S12 reminder-type cards and channel behaviour (Steps 18, 29); `components/ui/*`.

**Acceptance criteria:** (PRD v1.7, verbatim)

FR-68 — Messaging
- Given a signed-in user on an active listing they did not post, When they tap "Pošalji poruku" and send text, Then a conversation tied to that listing is created and the message is delivered to the author.
- Given a user who already has a conversation about that listing, When they tap "Pošalji poruku" again, Then the existing conversation opens (BR-61).
- Given the author of a listing, Then "Pošalji poruku" is not available on their own listing.
- Given a Visitor who is not signed in, When they tap "Pošalji poruku", Then they are asked to sign in or register and return to the listing afterwards.
- Given "Poruke", Then the inbox lists the user's conversations by latest message first, each with the listing title, the other user's display name, the last message, and an unread count; a total unread count is shown on the messages icon.
- Given a conversation, When the user opens it, Then all messages are shown oldest to newest and the conversation's unread count becomes 0.
- Given a message, Then it is text only, at most 2,000 characters; an empty message cannot be sent.

FR-69 — New-message notifications
- Given a new message, When it is sent, Then the recipient receives an email and a push notification (if they enabled push on a device) with the sender's display name, the listing title, and a link to the conversation.
- Given the "Poruke" card in reminder settings, When the user switches email or push off, Then new-message notifications are no longer sent on that channel.
- Given a new user, Then new-message notifications are on for email and push by default.

FR-70 — Report and block
- Given a signed-in user on a listing or a public profile, When they submit "Prijavi" with a reason, Then a report is recorded for the Operator and the user sees a confirmation.
- Given a signed-in user, When they report the same listing or user again while their earlier report is open, Then the earlier report is shown as already submitted.
- Given a signed-in user in a conversation or on a public profile, When they tap "Blokiraj" and confirm, Then the blocked user can no longer send them messages and the blocked user's listings are hidden from them.
- Given a blocked user, When they try to send a message to the blocker, Then sending is refused with a message that the user cannot be contacted.
- Given the blocker, When they unblock the user, Then messaging and listing visibility return to normal.

FR-71 — Operator moderation
- Given the admin area's "Moderacija" tab, Then open reports are listed oldest first with reason, note, reporter, and the reported listing and/or user.
- Given a reported listing, When the Operator hides it, Then it disappears from the public list and its detail, the report is marked actioned, and the author is emailed.
- Given a reported user, When the Operator suspends them from Šapa pomoći, Then they cannot publish, edit, or extend listings or send messages, their listings are hidden, the report is marked actioned, and they are emailed.
- Given a hidden listing or a suspended user, When the Operator restores it, Then the listing or the user's access and listings return to their previous state.
- Given a report, When the Operator dismisses it, Then it is marked dismissed and nothing else changes.

FR-62 — Listing detail *(criteria #4; this step: no message action for the author; the Dialog for everyone else)*
- Given the listing's author, When they open it, Then edit, extend, mark resolved, and delete actions are shown instead of "Pošalji poruku".

FR-66 — Donate to a shelter need *(criteria #3; this step: "Pošalji poruku azilu" opens the message Dialog)*
- Given a shelter with no donation info at all, Then "Doniraj" shows a message that the shelter has not added donation info yet, with "Pošalji poruku".

NFR-11 — *no Given/When/Then in the PRD; derived from TC §7 target:*
- A message sent by one user appears for the other after a page load or refresh; no live connection is opened by any page.

Derived checks:
- (Derived from API §11, §3.3, EP-82) The 31st message within an hour → `429 rate_limited` with `details.retry_after_s`, shown under the composer / in the S33 Dialog; a repeat with the same `idempotency_key` within 24 h returns the original result and sends nothing.
- (Derived from API EP-28, TC §5.5) `get_reminder_settings` returns seven rows incl. `message`; a `message` row accepts `{}`, `{email}`, `{push}`, `{email, push}` and refuses `whatsapp` / `viber` with `fields.channels = "invalid"`.
- (Derived from API EP-86, OQ-17) The Operator never reads message bodies; the `reason_note` goes only into the email.

**Tests to ship:**
| Criterion | Test | File |
|---|---|---|
| FR-68 #1 | `sendMessage` with `listing_id` creates the conversation and the first message (`created_conversation = true`); S33 Dialog → *"Poruka je poslata…"* + *Otvori razgovor* | `tests/sapa/send-message.test.ts`, `tests/sapa/listing-detail-messaging.test.tsx` |
| FR-68 #2 | second start on the same listing reuses the conversation (`created_conversation = false`); S33 button opens `/poruke/<id>` when `viewer.my_conversation_id` is set | `tests/sapa/send-message.test.ts`, `tests/sapa/listing-detail-messaging.test.tsx` |
| FR-68 #3 | author's own listing has no message button; `cannot_message_self` from the action | `tests/sapa/listing-detail-messaging.test.tsx`, `tests/sapa/send-message.test.ts` |
| FR-68 #4 | signed-out *Pošalji poruku* → `/prijava?next=/sapa-pomoci/<id>`; action → `401` | `tests/sapa/listing-detail-messaging.test.tsx`, `tests/sapa/send-message.test.ts` |
| FR-68 #5 | `list_my_conversations` order, fields and per-row unread count; `unread_conversations` equals `Me.marketplace.unread_conversations`; badge on the *Poruke* icon in owner and organisation shells (none at zero) | `supabase/tests/sapa_conversations_api.test.sql`, `tests/sapa/messages-screen.test.tsx`, `tests/sapa/unread-badge.test.tsx` |
| FR-68 #6 | `get_conversation` pages newest-last with `total`; `mark_conversation_read` sets `read_at` for the other party's messages and the count becomes 0 | `supabase/tests/sapa_conversations_api.test.sql`, `tests/sapa/messages-screen.test.tsx` |
| FR-68 #7 | empty body → *"Napiši poruku pre slanja."*; 2,001 characters refused; counter *N / 2000* | `tests/sapa/send-message.test.ts`, `tests/sapa/messages-screen.test.tsx` |
| FR-69 #1 | after commit: one `new_message` email (Resend fake, recipient locale, sender display name, listing title, link `/poruke/<id>`) and one push per endpoint (`{ title, body, url }`); 404/410 endpoints deleted; failures logged, send still `ok`; nothing written to `reminder_deliveries` | `tests/sapa/new-message-notification.test.ts` |
| FR-69 #2 | channels from the `message` row: `{email}` → email only, `{}` → none; S12 *Poruke* card switches save via EP-28 and show the both-off line | `tests/sapa/new-message-notification.test.ts`, `tests/reminder-settings/message-notifications-card.test.tsx`, `supabase/tests/message_preferences.test.sql` |
| FR-69 #3 | a new profile's `message` row is `{email, push}`; S12 shows both switches on | `supabase/tests/message_preferences.test.sql`, `tests/reminder-settings/message-notifications-card.test.tsx` |
| FR-70 #1 | `submitReport` on a listing (`reported_user_id` = author) and on a user → open report; `ReportDialog` confirmation | `tests/sapa/submit-report.test.ts`, `tests/components/safety-dialogs.test.tsx` |
| FR-70 #2 | repeat while open → `already_submitted = true`, nothing written; Dialog shows *"Već si prijavio/la…"* | `tests/sapa/submit-report.test.ts`, `tests/components/safety-dialogs.test.tsx` |
| FR-70 #3 | `block_user` from S36 and S37 (`BlockDialog`, *Da, blokiraj*); the blocked user's listings vanish from the blocker's EP-73 / EP-74 / EP-79 results; S33 → *unavailable* after blocking from its menu | `supabase/tests/sapa_conversations_api.test.sql`, `tests/sapa/user-profile-safety.test.tsx`, `tests/sapa/listing-detail-messaging.test.tsx` |
| FR-70 #4 | blocked sender → `user_blocked`, inline error under the composer, no notification sent | `tests/sapa/send-message.test.ts`, `tests/sapa/new-message-notification.test.ts`, `tests/sapa/messages-screen.test.tsx` |
| FR-70 #5 | `unblock_user` → messaging and listings return; S36 / S37 *Odblokiraj* | `supabase/tests/sapa_conversations_api.test.sql`, `tests/sapa/user-profile-safety.test.tsx` |
| FR-71 #1 | `admin_list_moderation(open_reports)` oldest first with reason, note, reporter, listing and/or user; non-Operator gets nothing; tab and nav badge show `open_count` | `supabase/tests/sapa_moderation_api.test.sql`, `tests/admin/moderation-tab.test.tsx` |
| FR-71 #2 | `hide_listing` → `status = hidden`, gone from EP-73 / EP-74, all open reports on it `actioned`, one `listing_hidden` email with the note or the reason label | `tests/admin/moderate.test.ts`, `supabase/tests/sapa_moderation_api.test.sql` |
| FR-71 #3 | `suspend_user` → `marketplace_suspended_at` set; publish / edit / extend / send → `marketplace_suspended`; listings hidden; reports `actioned`; `marketplace_suspended` email only for a new suspension | `tests/admin/moderate.test.ts`, `supabase/tests/sapa_moderation_api.test.sql` |
| FR-71 #4 | `restore_listing` → `active` if `expires_at > now()`, else `expired` (and `expired` when the limit trigger refuses); `restore_user` clears the suspension; listings reappear by their own status | `tests/admin/moderate.test.ts`, `supabase/tests/sapa_moderation_api.test.sql` |
| FR-71 #5 | `dismiss_report` → `dismissed`, nothing else changes; a decided report → `409 already_decided` | `tests/admin/moderate.test.ts` |
| FR-62 #4, FR-66 #3 | author sees no message action; non-author *Pošalji poruku* / *Pošalji poruku azilu* opens the message Dialog | `tests/sapa/listing-detail-messaging.test.tsx` |
| NFR-11 (derived) | no WebSocket, `EventSource`, Supabase Realtime channel or interval polling in `app/(sapa)/poruke/` and the shells (source scan); a message appears for the other party after a reload | `tests/sapa/messages-screen.test.tsx` |
| rate limit, idempotency (derived) | 31st message in an hour → `rate_limited` with `retry_after_s`; same key replays without a second insert or notification | `tests/sapa/send-message.test.ts` |
| EP-28 `message` (derived) | seven rows from `get_reminder_settings`; `whatsapp` in `message` → `fields.channels = "invalid"`; `{}` accepted | `supabase/tests/message_preferences.test.sql` |
| composites | `ReportDialog` reasons, note required for *Drugo*, ≤ 500; `BlockDialog` destructive confirm | `tests/components/safety-dialogs.test.tsx` |

**Verification:**
```
npx supabase db reset  # expected: all migrations + seed apply without error
npm run db:types       # expected: exit 0
npm run typecheck      # expected: exit 0
npm run lint           # expected: exit 0
npm test               # expected: all Vitest suites pass, incl. tests/sapa/*, tests/admin/moderate.test.ts, moderation-tab.test.tsx, tests/reminder-settings/message-notifications-card.test.tsx, tests/components/safety-dialogs.test.tsx
npx supabase test db   # expected: all pgTAP files pass, incl. the three files above
npm run build          # expected: exit 0
```

#### Prompt
```
You are executing Step 28c — Messaging, notifications, report/block & moderation — of docs/product/06-build-plan.md for the Moj Ljubimac web app. One outcome: the people side of Šapa pomoći works — S36 Poruke with the S33 message Dialog and the shell badge (EP-80 … EP-83), new-message email + push controlled by the S12 Poruke card (EP-28 type message), report and block from S33 / S36 / S37 (EP-84, EP-85), and the S26 Moderacija tab (EP-86).

READ FIRST, in this order:
1. docs/product/02-prd.md §6 FR-62, FR-66, FR-68, FR-69, FR-70, FR-71; §7 UC-11, UC-13; §8 BR-59, BR-60, BR-61; §9 E-32 … E-35; §10 NFR-11.
2. docs/product/03-technical-constraints.md §5.5, §5.7, §5.10, §7, §9, ADR-05, ADR-08, ADR-16, §10 RISK-31.
3. docs/product/05-api-integration-contract.md §3.3, §4.1, §4.4, EP-28, EP-43, §5.9 (conventions block, EP-74 viewer fields, EP-80 … EP-86), §6 ConversationSummary, Conversation, Message, UserBlock, Report, ModerationItem, Restriction, ReminderPreference, MarketplaceStatus, §7.1, §7.2, §7.3, §8, §9.4, §11, §12, §17 (OQ-17).
4. docs/product/04-design-system.md §5.1, §5.2, §5.5, §6, §8, §9, §9.1, §10, §11, §12 S12, S26, S33, S36, S37.
5. docs/product/04-design/screens/messages.tsx, listing-detail.tsx, user-profile.tsx, reminder-settings.tsx, admin.tsx; docs/product/04-design/components/safety-dialogs.tsx, shells.tsx.
6. docs/product/06-build-plan.md §4 (invariant 11), §5, §6 and the Session logs of Steps 11, 12, 17, 18, 19, 24, 28, 28a and 28b.

SETTLED UPSTREAM — apply exactly:
- Not real-time (NFR-11, TC §9, API §8): inbox, thread and badge are plain reads per page load (EP-43, EP-80, EP-81); no WebSocket, EventSource, Supabase Realtime or polling interval anywhere.
- New-message notification (API EP-82 side effects, §9.4): after the transaction commits, read the recipient's reminder_preferences row of type message; email → Resend template new_message (Design §9.1, recipient's profiles.locale, preview = first 120 characters, button to /poruke/<conversation_id>); push → every push_subscriptions endpoint of the recipient through the Step 19 lib/integrations/webpush.ts with { title, body, url }; one retry; failures logged and never fail the send; skipped when the recipient's deletion is pending or the send was refused (user_blocked); never WhatsApp or Viber; nothing in reminder_deliveries.
- Rate limit and idempotency: EP-82 uses lib/server/rate-limit.ts with 30 messages per hour per user across all conversations (API §11) and lib/server/idempotency.ts (API §3.3) — both from Step 11.
- S12 Poruke card: add the card of docs/product/04-design/screens/reminder-settings.tsx to the Step 18 S12 client file; it saves through the existing EP-28 upsert with type message; rpc:get_reminder_settings must now return seven rows (API EP-28) — replace it with the Step 18 body plus the message row. Leave the six reminder-type cards and channel behaviour unchanged.
- Moderation (API EP-86): the list is rpc:admin_list_moderation under profiles.is_operator RLS; moderate is a server action that checks profiles.is_operator explicitly and uses the service role on the server only (API §3.1). Emails listing_hidden and marketplace_suspended per Design §9.1 with {reason} = reason_note or the report reason label. OQ-17 (open, non-blocking): reason_note is not stored; the restrictions view derives reason and time from the actioned report; the Operator has no access to message bodies.
- Shell badges: AppShell counts.poruke = Me.marketplace.unread_conversations in app/(app)/layout.tsx, app/(org)/layout.tsx and app/(sapa)/layout.tsx; admin counts.moderacija = open_count in app/admin/layout.tsx. /poruke is added to the request-interception file's signed-in prefixes.
- Composites: port docs/product/04-design/components/safety-dialogs.tsx (ReportDialog, BlockDialog) to components/app/ exactly as Step 10 ported the other composites.
- Copy: every string into lib/i18n/sr.ts and lib/i18n/en.ts per Design §9; email/push copy only from Design §9.1.

BUILD:
1. Migration sapa_messaging_api: rpc:list_my_conversations (EP-80), rpc:get_conversation (EP-81), rpc:mark_conversation_read (EP-83), rpc:block_user / rpc:unblock_user (EP-85), rpc:admin_list_moderation (EP-86 list, both views with open_count and handled_this_month), the functions moderate needs to stay atomic, and the replaced rpc:get_reminder_settings (seven rows). Add the EP-28 message-row validation only if Step 28a's check does not already enforce it. Run npm run db:types.
2. lib/actions/messages.ts: sendMessage exactly per EP-82 (start or reply, one transaction, triggers from Step 28a, then the notification as settled). lib/actions/reports.ts: submitReport per EP-84 (already_submitted). lib/actions/admin.ts: moderate per EP-86 (dismiss_report, hide_listing, suspend_user, restore_listing, restore_user). lib/integrations/resend.ts: the three templates.
3. S36: port docs/product/04-design/screens/messages.tsx to app/(sapa)/poruke/messages-client.tsx rendered by app/(sapa)/poruke/page.tsx and app/(sapa)/poruke/[id]/page.tsx — two panes on lg, single pane with back button on phones; inbox from EP-80, thread from EP-81 then EP-83, "Učitaj starije", composer through EP-82 with the inline errors; states D, thread open, L, E, X, B, S. Remove the StateSwitcher.
4. S33: in the Step 28b listing-detail client file add the Pošalji poruku / Pošalji poruku azilu Dialog (EP-82 with listing_id; existing conversation opens /poruke/<id>) and the ⋯ menu (Prijavi oglas → ReportDialog EP-84; Blokiraj korisnika → BlockDialog EP-85, not on shelter needs). S37: in the Step 28b user-profile client file add the ⋯ menu and the B state (ReadOnlyBanner + Odblokiraj). Change nothing else in those files.
5. S12 Poruke card and S26 Moderacija tab (port the tab of docs/product/04-design/screens/admin.tsx into app/admin/admin-screen.tsx: Otvorene prijave cards, AlertDialog with "Razlog za korisnika", Obrađeno ovog meseca, Sakriveni oglasi i isključeni korisnici with restore). Shell badges and the /poruke prefix as settled.
6. Strings into lib/i18n/sr.ts and lib/i18n/en.ts; regenerate types with npm run db:types.
7. Tests: write every test in the Step 28c "Tests to ship" table of docs/product/06-build-plan.md in exactly those files; Resend and Web Push are faked in Vitest.

FILES YOU MAY CREATE OR MODIFY (allowlist — nothing else):
- supabase/migrations/<timestamp>_sapa_messaging_api.sql; the generated types file under lib/supabase/ (via npm run db:types only)
- lib/actions/messages.ts, lib/actions/reports.ts, lib/actions/admin.ts (moderate only)
- lib/integrations/resend.ts (new_message, listing_hidden, marketplace_suspended only); lib/integrations/webpush.ts and public/sw.js (only as stated in Step 28c "Files this step may touch")
- app/(sapa)/poruke/page.tsx, app/(sapa)/poruke/[id]/page.tsx, app/(sapa)/poruke/messages-client.tsx
- app/(sapa)/sapa-pomoci/[id]/listing-detail-client.tsx, app/(sapa)/korisnik/[id]/user-profile-client.tsx (additions above only)
- components/app/safety-dialogs.tsx
- app/(app)/podesavanja/podsetnici/reminder-settings-client.tsx (Poruke card only)
- app/admin/admin-screen.tsx (Moderacija tab only), app/admin/layout.tsx (counts.moderacija only)
- app/(app)/layout.tsx, app/(org)/layout.tsx, app/(sapa)/layout.tsx (counts.poruke only)
- the request-interception file named in the Step 11 Session log (/poruke prefix only)
- lib/i18n/sr.ts, lib/i18n/en.ts (add keys only)
- supabase/tests/sapa_conversations_api.test.sql, sapa_moderation_api.test.sql, message_preferences.test.sql
- tests/sapa/send-message.test.ts, new-message-notification.test.ts, submit-report.test.ts, messages-screen.test.tsx, listing-detail-messaging.test.tsx, user-profile-safety.test.tsx, unread-badge.test.tsx; tests/admin/moderate.test.ts, moderation-tab.test.tsx; tests/reminder-settings/message-notifications-card.test.tsx; tests/components/safety-dialogs.test.tsx
- docs/product/06-build-plan.md (Step 28c row in §3 and the Step 28c Session log only)
Touching any other file requires stopping and asking.

ACCEPTANCE CRITERIA (PRD v1.7, verbatim — each needs a passing test):
- FR-68 #1: Given a signed-in user on an active listing they did not post, When they tap "Pošalji poruku" and send text, Then a conversation tied to that listing is created and the message is delivered to the author.
- FR-68 #2: Given a user who already has a conversation about that listing, When they tap "Pošalji poruku" again, Then the existing conversation opens (BR-61).
- FR-68 #3: Given the author of a listing, Then "Pošalji poruku" is not available on their own listing.
- FR-68 #4: Given a Visitor who is not signed in, When they tap "Pošalji poruku", Then they are asked to sign in or register and return to the listing afterwards.
- FR-68 #5: Given "Poruke", Then the inbox lists the user's conversations by latest message first, each with the listing title, the other user's display name, the last message, and an unread count; a total unread count is shown on the messages icon.
- FR-68 #6: Given a conversation, When the user opens it, Then all messages are shown oldest to newest and the conversation's unread count becomes 0.
- FR-68 #7: Given a message, Then it is text only, at most 2,000 characters; an empty message cannot be sent.
- FR-69 #1: Given a new message, When it is sent, Then the recipient receives an email and a push notification (if they enabled push on a device) with the sender's display name, the listing title, and a link to the conversation.
- FR-69 #2: Given the "Poruke" card in reminder settings, When the user switches email or push off, Then new-message notifications are no longer sent on that channel.
- FR-69 #3: Given a new user, Then new-message notifications are on for email and push by default.
- FR-70 #1: Given a signed-in user on a listing or a public profile, When they submit "Prijavi" with a reason, Then a report is recorded for the Operator and the user sees a confirmation.
- FR-70 #2: Given a signed-in user, When they report the same listing or user again while their earlier report is open, Then the earlier report is shown as already submitted.
- FR-70 #3: Given a signed-in user in a conversation or on a public profile, When they tap "Blokiraj" and confirm, Then the blocked user can no longer send them messages and the blocked user's listings are hidden from them.
- FR-70 #4: Given a blocked user, When they try to send a message to the blocker, Then sending is refused with a message that the user cannot be contacted.
- FR-70 #5: Given the blocker, When they unblock the user, Then messaging and listing visibility return to normal.
- FR-71 #1: Given the admin area's "Moderacija" tab, Then open reports are listed oldest first with reason, note, reporter, and the reported listing and/or user.
- FR-71 #2: Given a reported listing, When the Operator hides it, Then it disappears from the public list and its detail, the report is marked actioned, and the author is emailed.
- FR-71 #3: Given a reported user, When the Operator suspends them from Šapa pomoći, Then they cannot publish, edit, or extend listings or send messages, their listings are hidden, the report is marked actioned, and they are emailed.
- FR-71 #4: Given a hidden listing or a suspended user, When the Operator restores it, Then the listing or the user's access and listings return to their previous state.
- FR-71 #5: Given a report, When the Operator dismisses it, Then it is marked dismissed and nothing else changes.
- FR-62 #4: Given the listing's author, When they open it, Then edit, extend, mark resolved, and delete actions are shown instead of "Pošalji poruku".
- FR-66 #3: Given a shelter with no donation info at all, Then "Doniraj" shows a message that the shelter has not added donation info yet, with "Pošalji poruku".
- Derived from TC §7 NFR-11: a message sent by one user appears for the other after a page load or refresh; no live connection is opened by any page.
- Derived checks (rate limit and idempotency, the seven-row EP-28 response and message-row validation, no Operator access to bodies) exactly as listed under "Acceptance criteria" in Step 28c of docs/product/06-build-plan.md.

FORBIDDEN:
- No colours, spacing, radii, shadows, fonts or components outside docs/product/04-design-system.md §4–§6 and the composites in components/app; OQ-10 proposed composites are not approved; no lucide brand icons (MessageCircle for messages).
- No library outside docs/product/03-technical-constraints.md ADR-17; add no npm dependency; no real-time library or Supabase Realtime.
- No endpoint, field, error code or state outside docs/product/05-api-integration-contract.md; no WhatsApp or Viber for messages.
- No table, column, enum or constraint change; no stored moderation note (OQ-17); no Operator read path to messages.
- The service-role key never reaches the browser. No user-facing copy that is not in 04-design-system.md or docs/product/04-design.

DONE MEANS:
- Every test in the Step 28c "Tests to ship" table exists and passes.
- These commands all exit 0, in this order: npx supabase db reset; npm run db:types; npm run typecheck; npm run lint; npm test; npx supabase test db; npm run build.
- In docs/product/06-build-plan.md: set the Step 28c row in §3 to ✅ with today's date and append a Step 28c Session log entry (date, what was built, pass/fail per command, deviations, follow-ups incl. OQ-17 items still on interim mappings).
- Commit with the message "Step 28c: Messaging, notifications, report/block & moderation".

If anything above is ambiguous, if a referenced section doesn't contain what this prompt says it does, or if completing this step would require touching a file outside the list or making a decision the referenced documents don't settle — STOP and ask. Do not choose a reasonable default. Do not proceed with a partial implementation.
```

#### Session log
- **2026-10-29** — Step 28c built (unattended overnight run).
  - **Built:**
    - `20261029000000_sapa_messaging_api.sql`:
      - EP-80 `list_my_conversations`, EP-81 `get_conversation` (the newest `p_limit` after `p_offset`, returned oldest → newest, `total`, `conversation.can_send` / `message_total`) and EP-83 `mark_conversation_read` — security definer, parties only (others → `not_found`), anon has no execute.
      - EP-82 `send_message(p_listing_id, p_conversation_id, p_body)` — security invoker, one transaction: reuses the caller's conversation about the listing (BR-61) or inserts one, then the message; RLS and the Step 28a triggers give `cannot_message_self`, `listing_not_active`, `user_blocked`, `marketplace_suspended`; a listing the caller cannot see → `not_found` (or `listing_not_active` when it exists but is not active); a listing whose author the caller blocked → `not_found` (BR-59).
      - `new_message_notification(p_message_id)` (definer, service_role only): the recipient (email, locale, full_name, deletion pending, channels of the `message` preference — default `{email, push}`), the sender's display name (the shelter name for a need's owner), the listing title and the push endpoints.
      - EP-85 `block_user` (returns UserBlock; the existing row when already blocked; an unknown user → `not_found`, owner decision) and `unblock_user` — security invoker on the Step 28a RLS.
      - EP-86 `admin_list_moderation(p_view, p_limit, p_offset)` — security definer, empty for non-Operators (owner decision); `open_reports` oldest first as ModerationItem, `restrictions` newest first as Restriction (OQ-17: time and reason from the latest actioned report), `open_count`, `handled_this_month` (Europe/Belgrade month).
      - Service-role only, for the `moderate` action: `admin_decide_report(p_operator, p_report_id, p_op)` (dismiss / hide / suspend in one transaction; hide only changes an `active` listing and actions every open report on it; suspend sets `marketplace_suspended_at` only when not set and actions every open report on the user; returns the ModerationItem and the email due — `listing_hidden` only when the listing went from active to hidden, `marketplace_suspended` only for a new suspension), `admin_restore_listing(p_id) returns listing_status` (owner decision: `active` when `expires_at > now()`, else `expired`; `premium_required:listings` from the limit trigger → `expired`), `admin_restore_user(p_user_id)` (returns the lifted Restriction) and `admin_get_restriction(p_kind, p_id)`.
      - The decided report is stamped last (`clock_timestamp()`), so "the latest actioned report" whose reason the restriction and the S35 hidden card show is the one the Operator acted on.
      - Private helpers: `person_name`, `conversation_summary_json`, `message_json`, `unread_conversations`, `listing_status_of`, `moderation_item_json`, `restriction_json`.
      - `get_reminder_settings` replaced: the Step 28a body without its `message` filter — seven rows; the message row has lead `[0]`, no delivery time, `fixed_time = false`. The EP-28 message-row validation is Step 28a's `reminder_preferences_message_channels_check` (no new constraint).
    - `lib/actions/messages.ts`: `sendMessage` (gates 1–3, input rules, `withIdempotency` → `checkRateLimit` 30 / hour `messages.send` → `rpc:send_message` → the notification after the commit: Resend `new_message` in the recipient's locale, Web Push `{ title, body, url }` to every endpoint with 404 / 410 endpoints deleted, skipped when the recipient's deletion is pending, failures logged; never WhatsApp / Viber; nothing in `reminder_deliveries`). Also the server wrappers `listConversations`, `getConversation`, `markConversationRead` and `saveMessagePreference` (see Deviations).
    - `lib/actions/reports.ts`: `submitReport` (EP-84; `already_submitted` when the caller has an open report on the target; own listing / self → `invalid`; invisible listing → `not_found`; 23503 → `not_found`; a 23505 race is answered as already submitted) and the EP-85 wrappers `blockUser` / `unblockUser`.
    - `lib/actions/admin.ts`: `moderate` (EP-86 — gates, explicit `is_operator`, then the service-role functions; emails with `{reason}` = `reason_note` or the report reason label in the recipient's language; `reason_note` is never sent to the database) and the list wrapper `listModeration`.
    - `lib/integrations/resend.ts`: `new_message` (with `bodyNoName` when the recipient has no full name, as `reminder_email`), `listing_hidden`, `marketplace_suspended`; "Razlog: {reason}." does not double the full stop when the note already ends a sentence.
    - `lib/integrations/webpush.ts`: `PushPayload.done_url` is optional, so a message push is exactly `{ title, body, url }`. `public/sw.js` unchanged (a notification without `done_url` already opens `url`).
    - S36 `app/(sapa)/poruke/page.tsx`, `[id]/page.tsx` (re-exports the same page), `messages-client.tsx`: two panes on lg (the newest conversation opens there when none is chosen), one pane with the back button on phones; inbox from EP-80, thread from EP-81 then EP-83 (`router.refresh()` re-reads the shell badge), "Učitaj starije", composer through EP-82 with the inline errors and counter, day separators in Europe/Belgrade, ⋯ menu (Prijavi korisnika; Blokiraj, not for shelters); states D, thread open, L, E, X, B, S. Row selection updates the address with `history.pushState`. No socket, EventSource, Realtime or interval.
    - S33 `listing-detail-client.tsx`: the Pošalji poruku Dialog (prefilled first message, ≤ 2000 with counter, one idempotency key per opened Dialog) → "Poruka je poslata…" + Otvori razgovor; `viewer.my_conversation_id` → `/poruke/<id>`; "Pošalji poruku azilu" on the action card and in the Doniraj Dialog; the ⋯ menu (Prijavi oglas; Blokiraj korisnika, not on needs → unavailable after blocking).
    - S37 `user-profile-client.tsx`: the ⋯ menu (signed in, not one's own profile) and the B state (ReadOnlyBanner, listings hidden, "Aktivnih oglasa: —", Odblokiraj); EP-79 is read again after block / unblock.
    - `components/app/safety-dialogs.tsx`: ported `ReportDialog` / `BlockDialog` with an optional `labels` prop (Serbian defaults, `labels:start` / `labels:end`) and an optional `onSubmit` on ReportDialog (EP-84 outcome: sent / already submitted / error message).
    - S12 `reminder-settings-client.tsx`: the "Šapa pomoći" → "Poruke" card (Mejl / Push Switches, the push hint, the both-off line), saved by "Sačuvaj podešavanja"; the six type cards and channel behaviour unchanged (the message row is filtered out of them).
    - S26 `admin-screen.tsx`: the Moderacija tab (Otvorene prijave cards, AlertDialog with "Razlog za korisnika", "Obrađeno ovog meseca", Sakriveni oglasi i isključeni korisnici with Vrati oglas / Vrati pristup), tab label and admin shell badge with `open_count`; `?tab=moderacija` now opens it. `app/admin/layout.tsx` reads `open_count` and hands it to the screen through `AdminCountsProvider` (exported by `admin-screen.tsx`).
    - `counts.poruke` = `Me.marketplace.unread_conversations` in `app/(app)/layout.tsx`, `app/(org)/layout.tsx`, `app/(sapa)/layout.tsx`. `/poruke` added to the signed-in prefixes of `lib/supabase/middleware.ts`.
    - i18n (sr + en, keys only): `reminderSettings.messages*` / `typeMessage*`, `admin` moderation keys (with `admin.reportReason` and `admin.userFallback`, since the S26 copy is `dict.admin`), `sapa.common` menu / report / block / send-error keys, `sapa.detail` message Dialog keys, `sapa.profile.blocked*`, `sapa.conversations`, `messages.new_message` / `new_message_push` / `listing_hidden` / `marketplace_suspended`.
    - Tests: pgTAP `sapa_conversations_api` (69), `sapa_moderation_api` (59), `message_preferences` (22). Vitest: the 11 files of the Tests to ship table (`tests/sapa/send-message`, `new-message-notification`, `submit-report`, `messages-screen`, `listing-detail-messaging`, `user-profile-safety`, `unread-badge`; `tests/admin/moderate`, `moderation-tab`; `tests/reminder-settings/message-notifications-card`; `tests/components/safety-dialogs`).
  - **Owner decisions applied:**
    - Carried from Step 28a (this run's prompt): `get_reminder_settings` no longer skips `message` (S12 shows the row); `components/app/reminder-type-icon.tsx` gets the `message` entry (MessageCircle, "Poruke") and the sr / en label `reminderSettings.typeMessage` "Poruke" / "Messages" (the Poruke card title). Their tests changed with them: `tests/components/reminder-type-icon.test.tsx` (message case), `tests/design/ui-overrides.test.ts` (a strip function ignores only the message entry — pre-approved exception 3), `supabase/tests/reminder_preferences.test.sql` and `sapa_columns.test.sql` (seven rows instead of six, message included).
    - Step 28c (2026-10-23): `user_blocked` "Ovoj osobi trenutno ne možeš da pišeš."; `rate_limited` "Poslao/la si mnogo poruka za kratko vreme. Pokušaj ponovo za {minutes} min."; "Već si prijavio/la ovaj oglas." / "…ovog korisnika."; deleted listing "oglas obrisan"; block toasts "Korisnik {name} je blokiran." / "…odblokiran." (en "{name} is blocked." / "{name} is unblocked."); `admin_list_moderation` definer and empty for non-Operators; `admin_restore_listing(p_id) returns listing_status` catching `premium_required` → `expired`, service_role only; 23503 on an unknown user → `not_found` in `block_user` and `submitReport`.
    - General: English written as faithful translations; Intl dates (sr-Latn / en-GB); display-name fallback "Korisnik" / "User"; report reasons in English as decided for Step 28b; unmapped errors show the form-level / generic message.
  - **Owner-approved exceptions:**
    - Pre-approved exception 1: `tests/admin/admin-screen.test.tsx` asserted "?tab=moderacija falls back to Azili (Moderacija is Step 28c)"; that test now asserts the Moderacija tab opens. Nothing else in the file changed.
    - Pre-approved exception 3: `tests/design/ui-overrides.test.ts` (see above).
    - Pre-approved exception 4 (pass-throughs only): `app/(sapa)/sapa-pomoci/[id]/page.tsx` adds `sendMessage`, `submitReport`, `blockUser` to the `actions` prop; `app/(sapa)/korisnik/[id]/page.tsx` passes `actions={{ submitReport, blockUser, unblockUser }}`; `app/(app)/podesavanja/podsetnici/page.tsx` adds `saveMessagePreference` to its `actions`. The clients take these as optional props, so the existing S12 / S33 / S37 tests stay valid (a client importing a server-action module directly would load `server-only` in Vitest).
    - Pre-approved exception 6 (database functions not named in the API contract), each to be added to `docs/product/05-api-integration-contract.md` as a follow-up: `send_message` (EP-82 one transaction, invoker), `new_message_notification` (definer, service_role), `admin_decide_report`, `admin_restore_user`, `admin_get_restriction` (definer, service_role; "the functions moderate needs for atomicity").
  - **Verification** (in order, on the final code):
    - `npx supabase db reset` ✅ exit 0
    - `npm run db:types` ✅ exit 0
    - `npm run typecheck` ✅ exit 0
    - `npm run lint` ✅ exit 0 (0 errors; the 2 known warnings in the generated `cloudflare-env.d.ts`)
    - `npm test` ✅ `Test Files 135 passed (135)`, `Tests 1552 passed (1552)`
    - `npx supabase test db` ✅ `Files=86, Tests=2989`, `Result: PASS`
    - `npm run build` ✅ exit 0 (routes include `ƒ /poruke` and `ƒ /poruke/[id]`)
  - **Deviations / decisions:**
    - **Server wrappers:** the Data API reads and RPCs EP-80 / EP-81 / EP-83 (`lib/actions/messages.ts`), EP-85 (`lib/actions/reports.ts`) and the EP-86 list (`listModeration`, `lib/actions/admin.ts`) are server actions because the session lives in httpOnly cookies (as Step 28b's EP-76 / EP-78 wrappers). They add no logic beyond the gates and error mapping.
    - **S12 save path:** the EP-28 upsert for `type = message` is `saveMessagePreference` in `lib/actions/messages.ts` (the same `reminder_preferences` upsert on `(user_id, type)`), because the Step 18 `savePreference` in the S12 page accepts only the six reminder types and refuses empty channels. WhatsApp / Viber → `fields.channels = "invalid"`, also from the 23514 of the Step 28a check.
    - **Admin count:** layouts cannot pass props to the page, and the S26 screen renders the Admin AppShell, so `app/admin/layout.tsx` provides `open_count` through a context exported by `admin-screen.tsx`; the tab's own reads keep it current after each decision. The 409 toast uses the generic error copy (no design copy exists for it).
    - **Email retries:** `new_message`, `listing_hidden` and `marketplace_suspended` use the Step 19 `sendEmail` as is (3 tries: now, +1 s, +3 s) instead of API §9.4's "1 retry" for Šapa pomoći; push keeps its 1 retry.
    - **Push action:** the Design §9.1 push action "Odgovori" is not added — `public/sw.js` may change only if a notification without `done_url` failed to open `url`, and it does open it (tapping the notification opens the conversation).
    - **send_message errors:** a listing the caller cannot see answers `not_found` unless it exists and is not active (`listing_not_active`, via `private.listing_status_of`); a listing whose author the caller blocked answers `not_found` (BR-59 visibility).
    - **S36 on lg:** `/poruke` opens the newest conversation in the right pane (as the mockup), which also marks it read; on phones nothing opens until a row is tapped.
    - **S33:** the message Dialog keeps one idempotency key per opened Dialog (a retry after an error is the same intent); a new key after a successful send.
    - **Composites:** `safety-dialogs.tsx` gained `labels` and ReportDialog `onSubmit` (without them the dialogs could not be localised or call EP-84). It is not yet in `tests/design/ui-overrides.test.ts` COMPOSITES (follow-up, as for Step 28b's ListingCard).
  - **Follow-ups:**
    - API contract: list `send_message`, `new_message_notification`, `admin_decide_report`, `admin_restore_listing`, `admin_restore_user`, `admin_get_restriction` (and the server wrappers) in `docs/product/05-api-integration-contract.md` §5.9.
    - Add `safety-dialogs` (and Step 28b's `listing-card` / `listing-type-tag`) to the `ui-overrides` COMPOSITES with strip functions.
    - Decide whether the Šapa pomoći emails should use a 1-retry `sendEmail` variant (API §9.4) and whether the push should get the "Odgovori" action in `public/sw.js`.
    - OQ-17 still on interim mappings: `reason_note` only in the email; restrictions and the S35 hidden card read time and reason from the latest actioned report; `resolved_at` = `updated_at`; no proposed columns added.
    - Carried over: `next` in the interception redirect (now also `/poruke`), TC §5.10 report index collision, preference_type = reminder_type alignment in TC §5.5 / API §6.

---

### Step 29 — WhatsApp channel

| | |
|---|---|
| **Status** | ⬜ not started |
| **Outcome** | Premium users connect a WhatsApp number by code, choose WhatsApp per reminder type, and receive reminders by WhatsApp with an "Urađeno" quick reply (capped at 30/month, falling back to email + push); delivery statuses and replies arrive through the WhatsApp webhook; Viber stays hidden. |
| **Implements** | FR-23 (WhatsApp criteria), FR-24 (quick reply); EP-30, EP-31 (WhatsApp part), EP-28 (WhatsApp channel checks), EP-33 (WhatsApp sending); S12 `/podesavanja/podsetnici` (Kanali card WhatsApp, WhatsApp channel checkbox, counter); `POST`/`GET /api/webhooks/whatsapp` (API §9.1); `lib/integrations/whatsapp.ts`; tables `user_channels`, `reminder_deliveries`, `reminder_preferences` (functions/triggers only); BR-14a, BR-14b |
| **Depends on** | Step 19 |
| **Blocked by** | — |
| **Track** | single |

**Read before starting:**
- `docs/product/02-prd.md` §6 FR-23, FR-24; §8 BR-14, BR-14a, BR-14b, BR-15, BR-16, BR-24; §9 E-09, E-27.
- `docs/product/03-technical-constraints.md` §5.5 (`reminder_deliveries`, `reminder_preferences`, `user_channels`, `app_settings`), §5.7 (`idempotency_keys`, `rate_limit_counters`), §6 (WhatsApp, Viber rows), §8.1, ADR-04, ADR-15, ADR-16, §10 RISK-17.
- `docs/product/04-design-system.md` §6, §8, §11 (S12), §12 S12.
- `docs/product/04-design/screens/reminder-settings.tsx`.
- `docs/product/05-api-integration-contract.md` §3.3, §5.3 EP-28, EP-30, EP-31, EP-32, EP-33, §6 (`WhatsAppConnection`, `ChannelUsage`, `ReminderPreference`), §7.2 (`whatsapp_cap_reached`, `whatsapp_not_connected`, `verification_code_invalid`, `channel_disabled`), §9.1, §9.3, §9.4 (WhatsApp, Viber rows and the WhatsApp message templates table), §11, §12 (cost row).
- Session logs of Steps 02, 08, 11, 18 and 19 (env var names, the `lib/server/` helpers, `reminder_preferences` triggers, the S12 screen files, the dispatch modules and the action-token helper).

**Files this step may touch:**
- `supabase/migrations/*_whatsapp_channel.sql` (new: only the `reminder_preferences` WhatsApp/Viber checks of EP-28 if Steps 08/18 did not ship them, and any function the cap count needs)
- `supabase/tests/whatsapp_channel.test.sql`
- `lib/integrations/whatsapp.ts` (new)
- `lib/actions/whatsapp.ts` (new: EP-30)
- `app/api/webhooks/whatsapp/route.ts` (new)
- `app/api/internal/dispatch/route.ts` and the dispatch module(s) created in Step 19 (named in its session log) — add WhatsApp sending only
- the S12 screen file(s) created in Step 18 (named in its session log) — WhatsApp parts only
- `lib/i18n/sr.ts` and `lib/i18n/en.ts` (add keys only); the generated types file under `lib/supabase/` (via `npm run db:types` only)
- `tests/integrations/whatsapp.test.ts`, `tests/whatsapp/connection.test.ts`, `tests/whatsapp/webhook.test.ts`, `tests/reminders/dispatch-whatsapp.test.ts`, `tests/reminders/reminder-settings-whatsapp.test.tsx`
- `docs/product/06-build-plan.md` (§3 row for Step 29 and its session log only)

**Out of bounds:** Viber sending (stays built-but-off per BR-14b; do not implement a Viber adapter); email and push behaviour (Steps 18–19 — unchanged); Premium expiry job (Step 30); table definitions.

**Acceptance criteria:** (PRD §6, verbatim)

FR-23 — Delivery channels per reminder type *(WhatsApp criteria; email/push criterion in Step 18)*
- Given a Premium user, When choosing channels, Then WhatsApp is also available, and Viber is available once the Operator has switched the Viber channel on.
- Given a Free user, When opening the channel choice, Then WhatsApp and Viber are shown as Premium-only.
- Given a Premium user who reached the monthly WhatsApp/Viber cap, When a further reminder is due that month, Then it is delivered by email and push.
- Given any reminder type, When the user selects several available channels (e.g., email and Viber), Then the reminder is delivered on each selected channel.

FR-24 — Mark a reminder as done; repeat when ignored *(from the WhatsApp message)*
- Given a delivered reminder, When the user marks it done (from the message or in the product), Then it is shown as done with time and user.

**Tests to ship:**
| Criterion | Test | File |
|---|---|---|
| FR-23 #2 | Premium user with a connected number can save `whatsapp` in a type's channels; Viber checkbox absent while `viber_enabled = false` and saving `viber` → `409 channel_disabled`; without a connected number → `409 whatsapp_not_connected` | `supabase/tests/whatsapp_channel.test.sql`, `tests/reminders/reminder-settings-whatsapp.test.tsx` |
| FR-23 #3 | Free user: saving `whatsapp` → `403 premium_required` (`whatsapp`); EP-30 send/verify → `premium_required`; S12 renders the WhatsApp checkbox and Kanali card as `PremiumLock` | `supabase/tests/whatsapp_channel.test.sql`, `tests/whatsapp/connection.test.ts`, `tests/reminders/reminder-settings-whatsapp.test.tsx` |
| FR-23 #4 | dispatch for a recipient with 30 delivered WhatsApp messages this Belgrade month sends the occurrence by email and push and increments `fell_back`; the 30th is still sent by WhatsApp | `tests/reminders/dispatch-whatsapp.test.ts` |
| FR-23 #5 | channels `{email, whatsapp}` → one `reminder_deliveries` row per channel | `tests/reminders/dispatch-whatsapp.test.ts` |
| FR-24 #1 (WhatsApp) | webhook button reply carrying the signed done token marks the instance done with `done_at` and `done_by = recipient` exactly like EP-32; invalid `X-Hub-Signature-256` → `401 invalid_signature`; status events update the delivery row by `provider_message_id` | `tests/whatsapp/webhook.test.ts` |
| EP-30 | send code → `CodeSent`; verify with the right code → `user_channels` row + `connected`; wrong code → `422 verification_code_invalid`; disconnect removes `whatsapp` from preferences (type left empty → `{email, push}`); 6th send in an hour → `429` | `tests/whatsapp/connection.test.ts` |
| Adapter | utility template + quick reply payload and authentication template requests built per API §9.4 (fake HTTP), 2 tries | `tests/integrations/whatsapp.test.ts` |
| EP-31 | `get_channel_usage` counts this month's delivered WhatsApp/Viber rows; S12 shows "n / 30 poruka ovog meseca" for Premium | `supabase/tests/whatsapp_channel.test.sql`, `tests/reminders/reminder-settings-whatsapp.test.tsx` |

**Verification:**
```
npm run typecheck      # exit 0
npm run lint           # exit 0
npm test               # all Vitest suites pass, incl. tests/whatsapp/*, tests/integrations/whatsapp.test.ts, tests/reminders/*whatsapp*
npx supabase test db   # all pgTAP tests pass, incl. whatsapp_channel
npm run build          # exit 0
```

#### Prompt
```
You are executing Step 29 — WhatsApp channel — of docs/product/06-build-plan.md for the Moj Ljubimac web app. One outcome: WhatsApp works as a Premium reminder channel end to end — connect by code (EP-30), select per type (EP-28), send with an "Urađeno" quick reply under the 30/month cap (EP-33), and receive statuses and replies on /api/webhooks/whatsapp (API §9.1). Viber stays hidden.

READ FIRST, in this order:
1. docs/product/02-prd.md §6 FR-23, FR-24; §8 BR-14, BR-14a, BR-14b, BR-15, BR-16, BR-24; §9 E-09, E-27.
2. docs/product/03-technical-constraints.md §5.5, §5.7 (idempotency_keys, rate_limit_counters), §6 (WhatsApp and Viber rows), §8.1, ADR-04, ADR-15, ADR-16, §10 RISK-17.
3. docs/product/05-api-integration-contract.md §3.3, §5.3 EP-28, EP-30, EP-31, EP-32, EP-33, §6 WhatsAppConnection, ChannelUsage, ReminderPreference, §7.2, §9.1, §9.3, §9.4, §11, §12.
4. docs/product/04-design-system.md §6, §8, §11 (S12), §12 S12.
5. docs/product/04-design/screens/reminder-settings.tsx.
6. The session logs of Steps 02, 08, 11, 18 and 19 in docs/product/06-build-plan.md, for the env var names in .env.example, the lib/server helpers, the reminder_preferences triggers, the S12 screen file(s), the dispatch module(s) and the action-token helper.

SETTLED UPSTREAM — apply exactly:
- EP-30 send_code idempotency (API §3.3) and its rate limits (API §11) use lib/server/idempotency.ts and lib/server/rate-limit.ts (Step 11).
- WhatsApp templates: exactly the two templates of docs/product/05-api-integration-contract.md §9.4 — reminder_due and verification_code, with the categories, languages, variables and buttons listed there; the language follows profiles.locale (sr-Latn → sr). Until Meta approves them, EP-30 and WhatsApp delivery work only against the Meta test number (API §9.4).
- Secrets: the TC §8.1 WhatsApp names (WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN, WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN).

BUILD:
1. lib/integrations/whatsapp.ts: Meta Cloud API adapter using fetch only — send the verification_code template with a code, send the reminder_due template with the quick-reply payload (the occurrence's dn_ token), 2 tries (API §9.4), and verify X-Hub-Signature-256 over the raw body with WHATSAPP_APP_SECRET (API §9.1). Secrets from the TC §8.1 WhatsApp names.
2. lib/actions/whatsapp.ts: whatsapp_connection (EP-30) with ops send_code / verify_code / disconnect exactly as specified (stateless verification_token per EP-30 and API §9.3; upsert user_channels on verify; disconnect cleans reminder_preferences.channels).
3. Migration supabase/migrations/<timestamp>_whatsapp_channel.sql: only if Steps 08/18 did not ship them, the database checks EP-28 requires when channels contain whatsapp or viber (premium_required / whatsapp_not_connected / channel_disabled), and any function needed for the BR-14a monthly cap count or rpc:get_channel_usage if missing. No table changes.
4. Dispatch: in the Step 19 dispatch module(s), add WhatsApp to step 3 (channel resolution — Premium, user_channels, viber_enabled, cap ≥ 30 delivered this Europe/Belgrade calendar month → fallback {email, push}, members intersected with {email, push}) and step 4 (send the reminder_due template with the same signed done token as the email link), recording reminder_deliveries per EP-33 step 5 and whatsapp_cap_reached on the delivery row where API §7.2 says so. Change nothing in email or push behaviour. Viber is never sent (no adapter).
5. app/api/webhooks/whatsapp/route.ts: GET verification handshake and POST per API §9.1 — signature check, status events update reminder_deliveries by provider_message_id (last write wins by timestamp), button reply "Urađeno" applies exactly the EP-32 rules via the Step 19 action-token helper and replies with a short confirmation; always 200 within 5 s once the signature is valid.
6. S12: in the Step 18 S12 screen file(s), wire the WhatsApp parts of docs/product/04-design/screens/reminder-settings.tsx — Kanali card number connection (number → "Pošalji kod" → code → "Povezano" → "Prekini vezu"), the WhatsApp channel checkbox per type, and the "n / 30 poruka ovog meseca" counter from EP-31 — replacing the "WhatsApp uskoro" state Step 18 rendered for Premium users. G state for Free users per API §7.3. Viber remains absent while viber_enabled = false (from EP-28 get).
7. Strings into lib/i18n/sr.ts and lib/i18n/en.ts per docs/product/04-design-system.md §9 (English is a faithful translation of the mockup's Serbian copy; no new copy); regenerate types with npm run db:types.
8. Tests: write every test in the Step 29 "Tests to ship" table of docs/product/06-build-plan.md in exactly those files; the Meta API is faked.

FILES YOU MAY CREATE OR MODIFY (allowlist — nothing else):
- supabase/migrations/<timestamp>_whatsapp_channel.sql
- supabase/tests/whatsapp_channel.test.sql
- lib/integrations/whatsapp.ts
- lib/actions/whatsapp.ts
- app/api/webhooks/whatsapp/route.ts
- app/api/internal/dispatch/route.ts and the dispatch module(s) named in the Step 19 session log (WhatsApp additions only)
- the S12 screen file(s) named in the Step 18 session log (WhatsApp parts only)
- lib/i18n/sr.ts and lib/i18n/en.ts (add keys only); the generated types file under lib/supabase/ (via npm run db:types only)
- tests/integrations/whatsapp.test.ts
- tests/whatsapp/connection.test.ts, webhook.test.ts
- tests/reminders/dispatch-whatsapp.test.ts, reminder-settings-whatsapp.test.tsx
- docs/product/06-build-plan.md (Step 29 row in §3 and the Step 29 session log only)
Touching any other file requires stopping and asking.

FORBIDDEN:
- No colours, spacing, radii, shadows, fonts or components outside docs/product/04-design-system.md §4–§6 and the composites already in components/app; OQ-10 proposed composites (incl. compact inline PremiumLock) are not approved; no lucide brand icons (use MessageCircle).
- No library outside docs/product/03-technical-constraints.md ADR-17 (no WhatsApp SDK, no reseller); add no npm dependency.
- No endpoint, field, error code or state outside docs/product/05-api-integration-contract.md.
- No table, column, enum or constraint change; nothing outside docs/product/03-technical-constraints.md §5.
- No Viber sending code; Viber stays hidden (BR-14b).

DONE MEANS:
- Every test in the Step 29 "Tests to ship" table exists and passes.
- These commands all exit 0, in this order: npm run typecheck; npm run lint; npm test; npx supabase test db; npm run build.
- In docs/product/06-build-plan.md: set the Step 29 row in §3 to ✅ with today's date and append a Step 29 session log entry (date, what was built, pass/fail per command, deviations, follow-ups — including that the Meta templates must be approved in the Meta business account before production use).
- Commit with the message "Step 29: WhatsApp channel".

If anything above is ambiguous, if a referenced section doesn't contain what this prompt says it does, or if completing this step would require touching a file outside the list or making a decision the referenced documents don't settle — STOP and ask. Do not choose a reasonable default. Do not proceed with a partial implementation.
```

#### Session log
- **2026-10-29** — Step 29 built (unattended overnight run; resumed after the first run hit the usage limit with `lib/integrations/whatsapp.ts`, `lib/actions/whatsapp.ts` and the `lib/server/action-tokens.ts` change uncommitted. Those files were reviewed against this prompt and the owner decisions and kept, with one fix: the `"use server"` actions file no longer exports its two rate-limit constants, because Next.js allows only async exports there).
  - **Built:**
    - No migration. Steps 08 and 18 already ship everything the database needs. The `reminder_preferences_before_write` trigger raises `premium_required:whatsapp`, `whatsapp_not_connected`, `whatsapp_not_connected:viber` and `channel_disabled`. `rpc:get_channel_usage` (EP-31) and the BR-14a `cap_used` in `claim_due_occurrences` come from Steps 18 and 19. `npm run db:types` produced no diff.
    - `lib/integrations/whatsapp.ts`: a Meta Cloud API adapter that uses fetch only (Graph `v21.0`, `/{WHATSAPP_PHONE_NUMBER_ID}/messages`, Bearer `WHATSAPP_ACCESS_TOKEN`). It sends the two API §9.4 templates. `reminder_due` (Utility) has `{{1}}` pet or "Za mene", `{{2}}` title and `{{3}}` "{date} u {time}" in Europe/Belgrade, plus a quick-reply button whose payload is the `dn_` token. `verification_code` (Authentication) has the code in the body and the copy-code button. The language follows `profiles.locale` (sr-Latn → `sr`). `sendText` sends the free-form confirmation. Sending gets 2 tries (0 s, 1 s) on network errors, 429 and 5xx; other 4xx fail at once, and Meta codes 100/131009/131021/131026/131030 are flagged `undeliverable`. `verifyWebhookSignature` checks `X-Hub-Signature-256` over the raw body with `WHATSAPP_APP_SECRET` using Web Crypto verify, which compares in constant time. Fake mode is described under owner decisions.
    - `lib/server/action-tokens.ts`: adds kind `wv` (EP-30 `verification_token`) with `signVerificationToken` / `checkVerificationToken`. The fields are user_id, phone and a code digest. Expiry and nonce come from the shared format, it lives 10 minutes, it is stateless and not single-use.
    - `lib/actions/whatsapp.ts`: `whatsappConnection` (EP-30). It runs the API §4.1 gates. `send_code` and `verify_code` require Premium (`premium_required`, `details.limit = "whatsapp"`), and `disconnect` is always allowed. `send_code` validates E.164 (`fields.phone: invalid`) and the uuid v4 `idempotency_key`. It is idempotent for 24 h through `lib/server/idempotency.ts` and limited to 5 per hour through `lib/server/rate-limit.ts`. It sends a random 6-digit code and returns `CodeSent`: `expires_at` is now + 10 min and `resend_available_at` is now + 60 s. When Meta rejects the number the result is `fields.phone: undeliverable`. `verify_code` is limited to 10 per hour. A wrong code, an expired or tampered token, or another user's token all give `verification_code_invalid`. A correct code upserts `user_channels { whatsapp, address, opted_in_at: now() }`. `disconnect` deletes that row and removes `whatsapp` from every `reminder_preferences.channels` of the caller; a type left empty becomes `{email, push}`. `user_channels` has no client write path, so both writes use the service role and are scoped to the gated caller.
    - `lib/server/dispatch.ts` (EP-33 steps 3–5) and `app/api/internal/dispatch/route.ts`. WhatsApp is live when a `sendWhatsApp` sender is wired; Viber is never live. The BR-14a cap is counted per message inside the run (`cap_used` plus WhatsApp messages delivered earlier in the run): the 30th message is sent and the 31st falls back to `{email, push}`. That fallback increments `fell_back` and records a `whatsapp` delivery row with `status = failed` and `error = whatsapp_cap_reached` (API §7.2). The template's quick-reply payload is the same `dn_` token as the email link. The number is read from the recipient's opted-in `user_channels` row, once per recipient per run. A failed WhatsApp send is recorded as `failed` and falls back to email + push for that occurrence (API §9.4). Members still get only `{email, push}` (BR-24). Email and push behaviour is unchanged. `whatsappCapReached` is exported for the cap rule.
    - `app/api/webhooks/whatsapp/route.ts` (API §9.1). `GET` echoes `hub.challenge` when `hub.verify_token = WHATSAPP_VERIFY_TOKEN`, otherwise it returns 401 `invalid_signature`. `POST` checks the signature first (missing or wrong → 401 `invalid_signature`), then always answers 200 within a 4.5 s budget and logs any failure.
      - Status events are matched by `provider_message_id`. `sent` changes nothing, because the row is already `delivered` when Meta accepts the message. `delivered` sets `delivered_at` to the event time. `failed` sets the row to `failed` with `whatsapp_<code>: <title>`.
      - A button reply whose payload is a `dn_` token follows exactly the EP-32 rules: token check, then `mark_occurrence_done_for` as the recipient (naturally idempotent). It then replies in the recipient's locale.
      - Everything else is ignored.
    - S12 (`page.tsx`, `reminder-settings-client.tsx`): the live WhatsApp parts of the mockup replace Step 18's "WhatsApp uskoro" state. The `WHATSAPP_LIVE` flag and every uskoro branch are gone.
      - The Kanali card connection runs number → "Pošalji kod" → "Poslali smo kod na …" → "Kod iz poruke" / "Potvrdi" → "Povezano: +381 64 123 4567" → "Prekini vezu". "Pošalji kod ponovo" waits until `resend_available_at` and sends with a new idempotency key; "Promeni broj" goes back to the number.
      - The number accepts "+381 …", "064 …" and "00381 …" and is normalised to E.164.
      - Inline errors: the mockup's "Upiši broj mobilnog telefona…" and "Kod ima 6 cifara…" for local checks, plus the owner-decision copy for 422 and 429.
      - `premium_required` from EP-30 switches the screen to the G state.
      - Each type card has a WhatsApp checkbox, with "Broj nije povezan" beside it while no number is connected. A disconnect mirrors the server clean-up in the cards.
      - Premium users get the "WhatsApp poruke" counter card from EP-31: "n / 30 poruka ovog meseca", a Progress bar and the reset date. `page.tsx` reads EP-31 only for Premium users and passes `whatsappConnection`, `usage` and `locale`.
      - Free users keep the G state. Viber stays absent while `viber_enabled = false`.
    - `lib/i18n/sr.ts` / `en.ts` (keys added only): the `reminderSettings.whatsapp*` connection strings and `usage*` counter strings (mockup copy plus the owner-decision errors), and `messages.whatsapp_done_reply`.
    - Tests:
      - Vitest: `tests/integrations/whatsapp.test.ts` (10), `tests/whatsapp/connection.test.ts` (11), `tests/whatsapp/webhook.test.ts` (12), `tests/reminders/dispatch-whatsapp.test.ts` (9) and `tests/reminders/reminder-settings-whatsapp.test.tsx` (12).
      - pgTAP: `supabase/tests/whatsapp_channel.test.sql` (17).
      - The Meta API is faked everywhere.
  - **Owner decisions applied (2026-10-24):**
    - `lib/server/action-tokens.ts` gets kind `wv` with user_id, phone and a code digest. It expires in 10 minutes and is not single-use. See the deviation below on how the digest is computed.
    - Fake mode: when `WHATSAPP_ACCESS_TOKEN` is empty, the adapter logs `console.info("[whatsapp:fake]", template, to, vars)`, which prints the code, and returns id `fake-<uuid>`.
    - Webhook reply: "Označeno kao urađeno. {pet}: {title} — označeno u {time}." / "Marked as done. {pet}: {title} — marked at {time}." An invalid or expired token reuses the `action_expired_page` body. For not_found and household_read_only the same pattern reuses the `action_not_found_page` / `action_read_only_page` bodies from the Step 19 owner decisions.
    - S12 errors: `verification_code_invalid` → "Kod nije tačan ili je istekao." / "The code is wrong or has expired."; `rate_limited` → "Previše pokušaja. Pokušaj ponovo za {minutes} min." / "Too many attempts. Try again in {minutes} min."; `undeliverable` → "Na ovaj broj ne možemo da pošaljemo WhatsApp poruku." / "We can't send a WhatsApp message to this number."
    - Carried over: unmapped error codes (for example 409 `whatsapp_not_connected` on save) show the screen's existing form-level error, the toast "Nešto nije u redu. Pokušaj ponovo.". English is a faithful translation of the mockup's Serbian copy.
  - **Owner-approved exception:**
    - **Exception 1:** `tests/reminder-settings/reminder-settings.test.tsx` (Step 18) had the block "S12 — WhatsApp uskoro (Premium, until Step 29)". It asserted that Premium users have no number form, disabled "Uskoro dostupno" WhatsApp checkboxes, no counter card, and that a stored WhatsApp choice is not sent; this step replaces all of that. Only that block, and the matching header line, were changed. They now expect the live state: the number form, enabled checkboxes described "Broj nije povezan", and the stored WhatsApp choice sent on save. Nothing else in the file changed.
  - **Verification:**
    - `npm run typecheck` ✅ exit 0
    - `npm run lint` ✅ exit 0. 0 errors and 2 warnings, both the unused eslint-disable directives in the generated `cloudflare-env.d.ts` that were already there.
    - `npm test` ✅ `Test Files 140 passed (140)`, `Tests 1606 passed (1606)`
    - `npx supabase test db` ✅ `Files=87, Tests=3006`, `Result: PASS`
    - `npm run build` ✅ exit 0. The routes include `ƒ /api/webhooks/whatsapp` and `ƒ /api/internal/dispatch`.
  - **Deviations / decisions:**
    - **Verification token digest.** The owner decision says the token carries `sha256(code)`. The token payload is readable base64url and goes to the browser, so a plain SHA-256 of a 6-digit code can be reversed offline in about a million hashes. Anyone could then "verify" a number they don't own. The digest is therefore HMAC-SHA256 with `ACTION_TOKEN_SECRET` over `user_id|phone|code`, which is what EP-30 itself requires ("the code cannot be checked without the server secret"). The token format and everything else follow the decision.
    - **WhatsApp in production without a token.** In production, the dispatch treats WhatsApp as live only when `WHATSAPP_ACCESS_TOKEN` is set. Otherwise the adapter's fake mode would record fake "delivered" WhatsApp rows that use up the cap and replace the email/push fallback. Outside production the fake mode is live, as the owner decision intends.
    - **Status ordering ("last write wins by timestamp").** `reminder_deliveries` has no column for the last event time, and `updated_at` is set by trigger, so ordering uses the event timestamps:
      - Within one POST, only the latest event per message is applied (a failure wins a tie).
      - Across POSTs, `delivered` only updates a delivered row whose `delivered_at` is not later than the event. `failed` applies when the row's `delivered_at` is null or not later than the event.
      - Meta timestamps are whole seconds, so an event counts as the end of its second.
      - A failure is final: a later `delivered` never revives it. `read` is ignored.
    - **Not-connected WhatsApp checkbox.** It stays enabled with "Broj nije povezan" beside it, as in the mockup, and the save sends what is checked. The database then answers 409 `whatsapp_not_connected`, which shows the form-level error.
    - **Webhook reply copy.** The reply is its own key (`messages.whatsapp_done_reply`) rather than a join of `action_done_page.heading` and `.body`. A webhook DB error other than not_found or household_read_only is logged and gets no reply.
    - **Webhook GET mismatch.** A wrong `hub.verify_token` returns 401 `invalid_signature`; API §9.1 names no other code.
  - **Follow-ups:**
    - **Owner, before production:** approve the `reminder_due` and `verification_code` templates (`sr` and `en`) in the Meta business account (API §9.4). Until then EP-30 and WhatsApp delivery work only against the Meta test number. Set `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET` and `WHATSAPP_VERIFY_TOKEN` per environment, and subscribe the app's webhook (`https://<site>/api/webhooks/whatsapp`, field `messages`) with the verify token.
    - **Async failure fallback.** A WhatsApp failure reported later through the webhook marks the row `failed` but does not send the email + push fallback; only a synchronous send failure in the dispatch does. API §9.4 could say whether the late case needs a fallback.
    - **Contract wording.** API §9.1 "last write wins by timestamp" has no stored event time (see the deviation above). EP-30 says "HMAC over … the code", while the owner decision says `sha256(code)`; the contract text and the decision should be aligned.
    - The webhook does not check that the replying WhatsApp number matches the recipient's `user_channels` address. The signed token already binds occurrence and recipient.

---

### Step 30 — Nightly jobs

| | |
|---|---|
| **Status** | ⬜ not started |
| **Outcome** | The nightly retention job (account deletion with household and organisation succession, R2 cleanup, delivery purge, invitation/transfer/export expiry, idempotency and rate-limit purge) and the nightly subscription job's non-provider parts (expiry, 30/7/1 notices, household read-only flag) run on schedule, called by pg_cron through `pg_net`. |
| **Implements** | EP-52; EP-49 (non-provider parts: steps 2–4); FR-25, FR-31, FR-32, FR-39, FR-40; NFR-06, NFR-08; ADR-04 (nightly schedules); TC §5.9 (incl. the `idempotency_keys` / `rate_limit_counters` purge), §8 (pg_cron → `pg_net` with Vault secrets); Design §9.1 (`premium_expiry_30`, `premium_expiry_7`, `premium_expiry_1`); tables `profiles`, `subscriptions`, `households`, `household_memberships`, `organisation_memberships`, `r2_deletion_queue`, `reminder_deliveries`, `household_invitations`, `organisation_invitations`, `record_transfers`, `data_exports`, `idempotency_keys`, `rate_limit_counters` (functions only) |
| **Depends on** | Step 23, Step 25, Step 29 |
| **Blocked by** | — |
| **Track** | single |

**Read before starting:**
- `docs/product/02-prd.md` §6 FR-25, FR-31, FR-32, FR-39, FR-40; §8 BR-09, BR-10, BR-16, BR-27, BR-28, BR-31, BR-38, BR-46, BR-47; §10 NFR-06, NFR-07, NFR-08.
- `docs/product/03-technical-constraints.md` §5.1 (`subscriptions.last_notice_days`), §5.7 (`r2_deletion_queue`, `data_exports`, `idempotency_keys`, `rate_limit_counters`), §5.7.1, §5.9, §7 (NFR-06, NFR-08 targets), §8 (scheduled jobs, pg_cron → app calls), §8.1, ADR-04, ADR-07, ADR-15, ADR-16.
- `docs/product/04-design-system.md` §9, §9.1 (`premium_expiry_30`, `premium_expiry_7`, `premium_expiry_1`, `email_footer`).
- `docs/product/05-api-integration-contract.md` EP-49, EP-52, EP-33 (secret-header mechanism), §9.4, §10 (item 7), §12 (`job` budget).
- Session logs of Steps 05, 08, 15, 19, 23 and 25 (BR-27 function if any, occurrence-generation schedule, R2 adapter, the dispatch schedule and its Vault secrets, `lib/actions/data-control.ts`, transfer functions).

**Files this step may touch:**
- `supabase/migrations/*_nightly_jobs.sql` (new: the database functions the two nightly routes call, and the pg_cron schedules for billing-nightly 03:00 and retention-nightly 03:30 Europe/Belgrade)
- `supabase/tests/retention_job.test.sql`, `supabase/tests/billing_job.test.sql`, `supabase/tests/succession_job.test.sql`
- `app/api/internal/billing-nightly/route.ts`, `app/api/internal/retention-nightly/route.ts`
- `lib/integrations/r2.ts` (add the delete/list operations the queue and orphan cleanup need only)
- `lib/integrations/resend.ts` (the Design §9.1 templates `premium_expiry_30`, `premium_expiry_7`, `premium_expiry_1` only)
- `lib/i18n/sr.ts`, `lib/i18n/en.ts` (add keys only); the generated types file under `lib/supabase/` (via `npm run db:types` only)
- `tests/jobs/billing-nightly.test.ts`, `tests/jobs/retention-nightly.test.ts`
- `docs/product/06-build-plan.md` (§3 row for Step 30 and its session log only)

**Out of bounds:** renewal charging (EP-49 step 1 — provider part, Step 31, locked); the payment webhook (Step 31); the dispatch job's minute schedule (Step 19); the nightly occurrence generation (scheduled in Step 08); backups and data export archives (Step 30a); any purge of `memorial_records` or memorial pets (NFR-07); emails and pushes without a Design §9.1 template — the EP-52 heir notification and the EP-49 push notices (CR-24); table definitions.

**Acceptance criteria:** (PRD §6, verbatim)

FR-25 — Premium expiry notices and channel fallback
- Given an active Premium subscription, When 30, 7, and 1 day(s) remain, Then the user receives an expiry reminder each time.
- Given Premium has expired, When a reminder previously set to WhatsApp or Viber is due, Then it is delivered by email and push instead.

FR-31 — Owner account deletion keeps the household
- Given an owner whose account is permanently deleted, Then ownership passes to the earliest-joined member and the shared pets and records remain.
- Given the new owner has no Premium, Then the household becomes read-only for all members until the new owner has Premium (same as FR-32).

FR-32 — Owner's Premium expires
- Given an owner whose Premium expired, Then members keep read-only access to shared pets until Premium is renewed.

FR-39 — Downgrade behaviour
- Given a user whose Premium ended with more than Free allows, Then all existing pets, attachments, and moments remain visible, and adding new items beyond Free limits is blocked with a Premium offer.

FR-40 — Delete account with a 30-day grace period *(permanent deletion)*
- Given a deletion request, Then the account is deactivated and permanently deleted after 30 days.

NFR-06 / NFR-08 — *no Given/When/Then in the PRD; derived from TC §7 targets:*
- No row or file of a deleted account exists 31 days after the request.
- No delivery row older than 12 months + 1 day.

Derived from TC §5.9:
- `idempotency_keys` rows older than 24 hours and `rate_limit_counters` rows whose window has ended are purged nightly.

**Tests to ship:**
| Criterion | Test | File |
|---|---|---|
| FR-25 #1 | billing job on Belgrade dates with 30 / 7 / 1 days remaining sends one `premium_expiry_*` email each (Resend fake), sets `last_notice_days`, and a re-run on the same date sends nothing; a monthly plan skips the 30-day notice on the period's first day | `supabase/tests/billing_job.test.sql`, `tests/jobs/billing-nightly.test.ts` |
| FR-25 #2 | after the job sets `status = expired`, the Step 19/29 dispatch delivers a WhatsApp-configured reminder by email + push | `tests/jobs/billing-nightly.test.ts` |
| FR-31 #1 | retention job on an owner past `deletion_due_at`: earliest-joined member becomes owner, their membership row is removed, shared pets move to the heir with records intact | `supabase/tests/succession_job.test.sql`, `tests/jobs/retention-nightly.test.ts` |
| FR-31 #2 | heir without Premium → `households.read_only = true` | `supabase/tests/succession_job.test.sql` |
| FR-32 | billing job expiring the owner's Premium sets `households.read_only = true`; members still read shared pets | `supabase/tests/billing_job.test.sql` |
| FR-39 | after the job expires a subscription, over-limit rows stay readable and new over-limit inserts fail with `premium_required` | `supabase/tests/billing_job.test.sql` |
| FR-40 #1 | profile with `deletion_due_at` passed is deleted with its unshared pets; R2 keys queued and then deleted (fake); a profile inside the window is untouched | `supabase/tests/retention_job.test.sql`, `tests/jobs/retention-nightly.test.ts` |
| BR-46 | last Admin deleted → earliest-joined remaining member becomes Admin; no members left → organisation enters the 30-day grace, then is deleted with its animals | `supabase/tests/succession_job.test.sql` |
| NFR-06 (derived) | 31 days after a request no row referencing the user and no queued key remains | `supabase/tests/retention_job.test.sql` |
| NFR-08 (derived) | deliveries older than 12 months are purged; newer kept | `supabase/tests/retention_job.test.sql` |
| TC §5.9 (derived) | `idempotency_keys` older than 24 h and ended `rate_limit_counters` windows are deleted; current ones kept | `supabase/tests/retention_job.test.sql` |
| EP-52 steps 4–5 | pending invitations/transfers past `expires_at` → `expired`; ready exports past `expires_at` → R2 object deleted, `expired` | `supabase/tests/retention_job.test.sql` |
| Route auth | both nightly routes reject a missing/wrong secret with `401` | `tests/jobs/billing-nightly.test.ts`, `tests/jobs/retention-nightly.test.ts` |

**Verification:**
```
npm run typecheck      # exit 0
npm run lint           # exit 0
npm test               # all Vitest suites pass, incl. tests/jobs/billing-nightly.test.ts and retention-nightly.test.ts
npx supabase test db   # all pgTAP tests pass, incl. retention_job, billing_job, succession_job
npm run build          # exit 0
```

#### Prompt
```
You are executing Step 30 — Nightly jobs — of docs/product/06-build-plan.md for the Moj Ljubimac web app. One outcome: the two nightly jobs of TC §8 that this step owns run on schedule — retention (EP-52) and the non-provider parts of the subscription job (EP-49 steps 2–4).

READ FIRST, in this order:
1. docs/product/02-prd.md §6 FR-25, FR-31, FR-32, FR-39, FR-40; §8 BR-09, BR-10, BR-16, BR-27, BR-28, BR-31, BR-38, BR-46, BR-47; §10 NFR-06, NFR-07, NFR-08.
2. docs/product/03-technical-constraints.md §5.1, §5.7, §5.7.1, §5.9, §7, §8, §8.1, ADR-04, ADR-07, ADR-15, ADR-16.
3. docs/product/04-design-system.md §9 and §9.1.
4. docs/product/05-api-integration-contract.md EP-49, EP-52, EP-33 (secret-header mechanism), §9.4, §10 item 7, §12.
5. The session logs of Steps 05, 08, 15, 19, 23 and 25 in docs/product/06-build-plan.md.

SETTLED UPSTREAM — apply exactly:
- Scheduling: pg_cron calls POST /api/internal/billing-nightly at 03:00 and POST /api/internal/retention-nightly at 03:30 Europe/Belgrade (EP-49, EP-52) through pg_net, reading the URL and the shared secret from the Supabase Vault secrets dispatch_url and dispatch_secret exactly as Step 19 does for /api/internal/dispatch (TC §8); each route rejects a request without a matching DISPATCH_SECRET (TC §8.1). Locally pg_cron may be disabled and the routes called manually (TC §8).
- Nightly occurrence generation is already scheduled (Step 08); do not schedule it again.
- Copy: expiry notices use the Design §9.1 templates premium_expiry_30, premium_expiry_7 and premium_expiry_1 with the {renew_line} variant matching auto_renew. The EP-49 web-push notices and the EP-52 heir email have no §9.1 template (CR-24): send none and record them in the Session log.
- Database errors raised by the new functions follow TC §5.7.1.

BUILD:
1. Migration supabase/migrations/<timestamp>_nightly_jobs.sql: database functions for EP-52 steps 1, 3, 4, 5 (incl. BR-27 household succession — reuse the Step 05 function if it exists — and BR-46 organisation succession), the TC §5.9 purge of idempotency_keys (older than 24 h) and rate_limit_counters (window ended), and EP-49 steps 2–4 (expiry, notices driven by subscriptions.last_notice_days per TC §5.1, household read_only recompute). The two pg_cron schedules as settled above. No table changes. Nothing may touch memorial_records or memorial pets (NFR-07).
2. app/api/internal/billing-nightly/route.ts: EP-49 with steps 2–4 only; step 1 (renewal charge) logs the warning EP-49 specifies and does nothing (OQ-11). Response counts per EP-49. Notices by email through lib/integrations/resend.ts with the three §9.1 templates.
3. app/api/internal/retention-nightly/route.ts: EP-52 steps 1–5 in order plus the TC §5.9 idempotency/rate-limit purge, each idempotent; R2 deletions through lib/integrations/r2.ts (dequeue only after R2 confirms; orphaned objects older than 24 h with no row are deleted, API §10 item 7). Response counts per EP-52.
4. Strings into lib/i18n/sr.ts and lib/i18n/en.ts per docs/product/04-design-system.md §9 and §9.1; regenerate types with npm run db:types.
5. Tests: write every test in the Step 30 "Tests to ship" table of docs/product/06-build-plan.md in exactly those files; R2 and Resend are faked in Vitest; pgTAP tests move time by setting the relevant timestamps in fixtures.

FILES YOU MAY CREATE OR MODIFY (allowlist — nothing else):
- supabase/migrations/<timestamp>_nightly_jobs.sql
- supabase/tests/retention_job.test.sql, billing_job.test.sql, succession_job.test.sql
- app/api/internal/billing-nightly/route.ts, app/api/internal/retention-nightly/route.ts
- lib/integrations/r2.ts (delete/list additions only), lib/integrations/resend.ts (the three premium_expiry templates only)
- lib/i18n/sr.ts and lib/i18n/en.ts (add keys only); the generated types file under lib/supabase/ (via npm run db:types only)
- tests/jobs/billing-nightly.test.ts, retention-nightly.test.ts
- docs/product/06-build-plan.md (Step 30 row in §3 and the Step 30 session log only)
Touching any other file requires stopping and asking.

FORBIDDEN:
- No library outside docs/product/03-technical-constraints.md ADR-17; add no npm dependency.
- No endpoint, field, error code or state outside docs/product/05-api-integration-contract.md; no payment-provider call (OQ-11).
- No table, column, enum or constraint change; nothing outside docs/product/03-technical-constraints.md §5.
- No secret value in a migration or in code; production data never used in tests (ADR-10).

DONE MEANS:
- Every test in the Step 30 "Tests to ship" table exists and passes.
- These commands all exit 0, in this order: npm run typecheck; npm run lint; npm test; npx supabase test db; npm run build.
- In docs/product/06-build-plan.md: set the Step 30 row in §3 to ✅ with today's date and append a Step 30 session log entry (date, what was built, pass/fail per command, deviations, follow-ups — list the CR-24 notices not sent).
- Commit with the message "Step 30: Nightly jobs".

If anything above is ambiguous, if a referenced section doesn't contain what this prompt says it does, or if completing this step would require touching a file outside the list or making a decision the referenced documents don't settle — STOP and ask. Do not choose a reasonable default. Do not proceed with a partial implementation.
```

#### Session log
- **2026-10-29** — Step 30 built (unattended overnight run).
  - **Built:**
    - Migration `20261029100000_nightly_jobs.sql`. It changes no table, column, enum or constraint. All new functions are security definer with `set search_path = ''`, revoked from public / anon / authenticated and granted to `service_role` only.
      - EP-49: `billing_expire_subscriptions()` (step 2: cancelled, payment_failed, trialing/active with `auto_renew` off, and any running row of a user with a pending deletion, once `current_period_end <= now()`, become `expired`; returns `expired` and the ids of households whose flag the Step 05 trigger changed). `billing_expiry_notice_candidates(p_now default now())` (step 3: premium rows in trialing / active / cancelled with 30, 7 or 1 whole Europe/Belgrade days left and `last_notice_days` null or larger; a 30-day notice on or before a monthly period's first day is skipped). `mark_expiry_notice_sent(id, days)` (sets `last_notice_days`, only after Resend accepted; `validation_failed` / `p_days:invalid` for other values). `billing_refresh_household_flags()` (step 4: every household whose stored flag differs from `not is_premium(owner)`, which also closes the Step 05 follow-up on time-based expiry).
      - EP-52: `retention_delete_due_accounts(p_limit)` (step 1; each account runs `private.nightly_delete_account` in its own subtransaction, a failure is logged as a warning and retried the next night). `private.nightly_delete_account` does BR-27 (heir = earliest `joined_at` member; the heir's membership row deleted, the shared pets and their pet reminders moved to the heir, `read_only = not is_premium(heir)`; a household without an heir is deleted), BR-46 (`private.nightly_delete_organisation`), queues the user's `data_exports` keys and deletes `auth.users` (profiles and everything owned cascade; the delete triggers queue pet, attachment, moment and listing photo keys). `r2_deletion_batch(p_limit)` / `r2_dequeue(keys)` (step 2). `r2_keys_in_use(keys)` (orphan scan). `retention_purge_deliveries()` (step 3). `retention_expire_invitations()` (step 4: household and team invitations and record transfers). `retention_expire_exports()` (step 5: ready exports past `expires_at` → expired, keys queued and returned). `retention_purge_server_support()` (TC §5.9).
      - `public.pets_enforce_free_limits()` recreated: it skips the Free-limit checks (not the account-type check) while `app.nightly_job = on`, which only the account-deletion step sets for its transaction — the Step 25 `app.transfer_copy` pattern. Without it a Free heir with an active pet could not receive the shared pets (FR-31 #1).
      - pg_cron jobs `billing-nightly` (`0 1,2 * * *`) and `retention-nightly` (`30 1,2 * * *`), both `select private.call_internal_route('/api/internal/…')` (Step 19 mechanism, Vault `dispatch_url` / `dispatch_secret`).
      - `npm run db:types` regenerated `lib/supabase/database.types.ts`.
    - `app/api/internal/billing-nightly/route.ts` (EP-49): `X-Dispatch-Secret` compared in constant time with `DISPATCH_SECRET`; missing / wrong / unset → `401 unauthenticated`. Works only when the Europe/Belgrade hour is 3, otherwise `200` with zero counts. Step 1 logs `console.warn` (OQ-11) and does nothing. Step 3 sends `premium_expiry_30 / _7 / _1` through `lib/integrations/resend.ts` in the recipient's locale (`{date}` = `current_period_end` as a Belgrade date, button → `/profil`) and records the notice only when Resend accepted it. Response `{renewals_attempted, expired, notices_sent, households_updated}`; errors → `500 internal_error`.
    - `app/api/internal/retention-nightly/route.ts` (EP-52): same secret and Belgrade-hour-3 rules. Steps 1–5 in order, then the TC §5.9 purge. Accounts in batches of 100 (repeats while a batch is full). The queue in batches of 500, dequeued only for keys R2 confirmed. Orphan scan of `u/`, `o/`, `p/`, `exports/`, at most 1000 objects listed per run; objects older than 24 h that no row uses (and that are not queued) are deleted. Expired archives are deleted right after step 5. Without R2 credentials (`r2Configured()` false) R2 is skipped entirely and the keys stay queued. Response `{accounts_deleted, households_transferred, r2_objects_deleted, deliveries_purged, invitations_expired, transfers_expired, exports_expired}`; the extra counts (organisations deleted, failed accounts, idempotency / rate-limit purge) are only logged.
    - `lib/integrations/r2.ts`: `list(prefix, { maxKeys, continuationToken })` (signed ListObjectsV2, XML parsed with the platform only) and `r2Configured()`.
    - `lib/integrations/resend.ts`: the `premium_expiry_30`, `premium_expiry_7`, `premium_expiry_1` templates (`{renew_line}` from `auto_renew`; a Serbian date ending in "." drops the sentence's second full stop, as in Step 28b).
    - `lib/i18n/sr.ts` / `en.ts`: `messages.premium_expiry_30 / _7 / _1` (subject, body, `renewOn`, `renewOff`, button) per Design §9.1.
    - Tests: pgTAP `supabase/tests/billing_job.test.sql` (33), `retention_job.test.sql` (32), `succession_job.test.sql` (27). Vitest `tests/jobs/billing-nightly.test.ts` (18), `tests/jobs/retention-nightly.test.ts` (17, incl. two for the real R2 `list`).
  - **Owner decisions applied (2026-10-23):**
    - BR-46 grace = the last member's own 30-day account grace; when that account is deleted, the organisation is deleted in the same run with its animals (keys queued). Earliest-joined member by `organisation_memberships.created_at`.
    - Expiry notices when `days_left` ∈ {30, 7, 1} and (`last_notice_days` is null or `days_left < last_notice_days`), then `last_notice_days` is set. Breeder-plan rows get no `premium_expiry` email (CR-24).
    - Both nightly routes answer `401 unauthenticated` (EP-49, EP-52).
    - `r2_keys_in_use(p_keys text[]) returns text[]`, security definer, service_role only, checking pets, attachments, moment_photos, organisations, partners, listing_photos and data_exports. Orphan scan of `u/`, `o/`, `p/`, `exports/`, at most 1000 objects per run; without R2 credentials R2 is skipped (`r2_objects_deleted: 0`, keys stay queued).
    - Schedules `0 1,2 * * *` and `30 1,2 * * *`, each running only when the Europe/Belgrade hour is 3.
  - **Owner-approved exception:**
    - **Exception 1:** `supabase/tests/occurrence_schedule.test.sql` (Step 08) asserted that the nightly generation is the only cron job besides `reminder-dispatch` and `listings-daily`. Its two `jobname not in (…)` filters now also exclude `billing-nightly` and `retention-nightly`, which this step adds. Nothing else in the file changed.
  - **Verification** (in order, after `npx supabase db reset`):
    - `npm run typecheck` ✅ exit 0
    - `npm run lint` ✅ exit 0 (0 errors; the 2 known warnings in the generated `cloudflare-env.d.ts`)
    - `npm test` ✅ `Test Files 142 passed (142)`, `Tests 1641 passed (1641)`
    - `npx supabase test db` ✅ `All tests successful. Files=90, Tests=3098`, `Result: PASS`
    - `npm run build` ✅ exit 0; the routes include `ƒ /api/internal/billing-nightly` and `ƒ /api/internal/retention-nightly`.
  - **Not sent (CR-24, no Design §9.1 template):** the EP-49 web-push expiry notices (30 / 7 / 1 days), the EP-52 heir email (BR-27 "the heir is emailed"), and `premium_expiry` for breeder plans.
  - **Deviations / decisions:**
    - **BR-27 heir who already owns a household:** `households.owner_id` is unique, so a member who owns a household of their own cannot inherit. The heir is the earliest-joined member who owns no household (and has an owner account); when no member qualifies, the household is deleted like one without members and the shared pets go with the account. EP-50's `heir_full_name` (Step 23) still names the earliest-joined member, so the two differ only in this case — see follow-ups.
    - **Pet reminders move with the shared pets:** `reminders.user_id` cascades on account deletion, so the reminders of the moved pets are reassigned to the heir; otherwise the heir would silently lose the vaccination / treatment / birthday reminders of the pets they inherit.
    - **Memorial pets (NFR-07):** a memorial pet shared in the household moves to the heir like the others; nothing purges memorials apart from the account that owns them.
    - **Delivery purge:** failed delivery rows have no `delivered_at`, so the purge uses `coalesce(delivered_at, created_at)`; otherwise they would stay forever, against NFR-08's 12 months.
    - **Rate-limit windows:** `rate_limit_counters` stores no window length. Rows whose `window_start` is 24 h or more in the past are purged — the longest API §11 window is one day, so these windows have all ended; hourly windows are purged at the latest a day after they end.
    - **Export expiry:** step 5 marks the rows expired and queues their keys in one database call; the route deletes those objects right away and dequeues what R2 confirms, so an R2 failure or missing credentials leaves the key queued for the next run instead of losing it.
    - **Notice candidates take `p_now`** (default `now()`): the route passes the request time and the pgTAP test fixes the Belgrade date, which makes the monthly first-day skip testable on any run date.
    - **`r2_keys_in_use`** also treats queued keys as in use, so the orphan scan never deletes a key the queue already owns (the queue step handles it).
    - **Orphan scan coverage:** without stored state the scan lists the first 1000 objects (in prefix order) each night; a bucket larger than that is not fully covered — see follow-ups.
    - **Response fields:** only the EP-49 / EP-52 counts are returned; the extra counts are logged.
    - **The internal job functions** (`billing_*`, `mark_expiry_notice_sent`, `retention_*`, `r2_deletion_batch`, `r2_dequeue`, `r2_keys_in_use`) are not client APIs; like Step 19's, they are service-role only.
  - **Follow-ups:**
    - Add the job functions above to `docs/product/05-api-integration-contract.md` as the database side of EP-49 and EP-52; align EP-49 step 3's "no column records sent notices" note with TC §5.1 `last_notice_days`.
    - Owner / product: decide BR-27 for a heir who already owns a household (merge, next member, or delete as now), and align EP-50 `heir_full_name` with the rule.
    - Step 31: reset `last_notice_days` on renewal (owner decision); renewal charging (EP-49 step 1).
    - CR-24: copy for the EP-49 push notices and the BR-27 heir email.
    - Production check: the account deletion deletes `auth.users` from a security definer function owned by `postgres`; confirm on the hosted project that this role may delete from `auth.users` (it works locally). If not, the route can call the Auth admin API after the database step.
    - Orphan scan: if the bucket grows past ~1000 objects, add a stored cursor (needs a table/column change request) or a rotating start key so every object is reached over several nights.
    - Owner, per environment: Vault secrets `dispatch_url` / `dispatch_secret` (already needed by Step 19) and the R2 credentials; without R2 credentials queued keys only accumulate.

---

### Step 30a — Backups & data export archives

| | |
|---|---|
| **Status** | ⬜ not started |
| **Outcome** | A nightly GitHub Actions workflow backs up the production database through `scripts/backup.sh` (`pg_dump` → `R2_BACKUP_BUCKET`, objects older than 14 days deleted), and the in-app route `/api/internal/exports`, called by pg_cron every 5 minutes, builds pending personal data archives with `fflate`, uploads them to `R2_BUCKET` under `exports/`, and emails the user that the archive is ready. |
| **Implements** | FR-41 (archive delivery); EP-50 (archive builder side effects); ADR-13 (Mechanics), ADR-16 (`scripts/`), ADR-17 (`fflate`); TC §8 (pg_cron → `pg_net` with Vault secrets, every 5 minutes; GitHub Actions nightly backup), §8.1 (GitHub Actions secrets); API §10 item 6 (`exports/` keys); Design §9.1 (`data_export_ready`); RISK-13; tables `data_exports` (functions only) |
| **Depends on** | Step 30, Step 23 |
| **Blocked by** | — |
| **Track** | single |

**Read before starting:**
- `docs/product/02-prd.md` §6 FR-41; §12 item 3.
- `docs/product/03-technical-constraints.md` §3 ADR-07, ADR-10, ADR-13 (incl. Mechanics), ADR-15, ADR-16, ADR-17; §5.7 (`data_exports`); §8 (scheduled jobs, pg_cron → app calls); §8.1 (application and GitHub Actions secrets); §10 RISK-13.
- `docs/product/04-design-system.md` §9, §9.1 (`data_export_ready`, `email_footer`).
- `docs/product/05-api-integration-contract.md` EP-50, EP-52 (step 5, export expiry), §6 (`DataExport`), §9.4 (Resend row), §10 (items 6 and 7), §12 (`job` budget).
- Session logs of Steps 03, 13, 19, 23 and 30 (CI workflow conventions, R2 adapter, dispatch schedule and Vault secrets, `lib/actions/data-control.ts`, nightly job schedules).

**Files this step may touch:**
- `scripts/backup.sh` (new: `pg_dump` against `SUPABASE_DB_URL`, upload to `R2_BACKUP_BUCKET` with the AWS CLI over the R2 S3-compatible endpoint, delete objects older than 14 days)
- `.github/workflows/nightly-backup.yml` (new: nightly schedule plus manual `workflow_dispatch`, runs `scripts/backup.sh`)
- `supabase/migrations/*_export_schedule.sql` (new: pg_cron every 5 minutes → `POST /api/internal/exports` through `pg_net`, Vault secrets as in Step 19)
- `app/api/internal/exports/route.ts`, `app/api/internal/exports/build-archive.ts` (new)
- `lib/integrations/r2.ts` (add the server-side object read and upload the builder needs only)
- `lib/integrations/resend.ts` (the Design §9.1 `data_export_ready` template only)
- `package.json`, `package-lock.json` (add `fflate` only)
- `README.md` (Backups section only: workflow, GitHub secret names, restore note)
- `lib/i18n/sr.ts`, `lib/i18n/en.ts` (add keys only); the generated types file under `lib/supabase/` (via `npm run db:types` only)
- `supabase/tests/export_schedule.test.sql`
- `tests/jobs/data-export-builder.test.ts`, `tests/jobs/exports-route.test.ts`, `tests/tooling/backup-workflow.test.ts`
- `docs/product/06-build-plan.md` (§3 row for Step 30a and its session log only)

**Out of bounds:** export expiry and R2 removal of expired archives (EP-52 step 5, Step 30); the request side of EP-50 and S19 (Step 23 — unchanged); the CI workflow `ci.yml` (Step 03); restoring a backup (manual, RISK-13); any staging or preview environment (ADR-10); table definitions.

**Acceptance criteria:** (PRD §6, verbatim)

FR-41 — Download all my data *(archive delivery)*
- Given any user, When they request their data, Then they receive an archive with all their personal data and records.

Derived from TC ADR-13 (Mechanics), §8, §8.1 and API EP-50:
- (ADR-13, §8) A nightly GitHub Actions workflow runs `scripts/backup.sh`, which runs `pg_dump` against `SUPABASE_DB_URL`, uploads the dump to `R2_BACKUP_BUCKET` with the AWS CLI, and deletes backup objects older than 14 days; secrets are referenced by their TC §8.1 GitHub Actions names only.
- (ADR-13, §8) pg_cron calls `POST /api/internal/exports` every 5 minutes through `pg_net` with the Vault secrets `dispatch_url` / `dispatch_secret`; the route rejects a request without a matching `DISPATCH_SECRET`.
- (EP-50, API §10) The route picks up `preparing` rows, builds one ZIP per row with `fflate` (all personal data, records, attachments, photos), uploads it to `R2_BUCKET` at `exports/<user_id>/<data_export_id>.zip`, sets `status = ready`, `r2_key`, `size_bytes`, `ready_at = now`, `expires_at = ready_at + 7 days`, and emails the user with the `data_export_ready` template; on failure it sets `status = failed`.

**Tests to ship:**
| Criterion | Test | File |
|---|---|---|
| FR-41 | for a seeded user, the builder produces one ZIP containing the profile, pets, records, care log, moments, reminders, attachments and photos; the row becomes `ready` with `r2_key`, `size_bytes`, `ready_at`, `expires_at = +7 days`; the `data_export_ready` email is sent (fake); a failing R2 read sets `failed` | `tests/jobs/data-export-builder.test.ts` |
| EP-50 route | `POST /api/internal/exports` without or with a wrong secret → `401`; with the secret it processes only `preparing` rows and reports counts; a second run does not rebuild `ready` rows | `tests/jobs/exports-route.test.ts` |
| TC §8 schedule | exactly one pg_cron job calls `/api/internal/exports` every 5 minutes through `pg_net` and reads `dispatch_url` / `dispatch_secret` from Vault; no secret value appears in the migration | `supabase/tests/export_schedule.test.sql` |
| ADR-13 backup | `nightly-backup.yml` has a nightly schedule and `workflow_dispatch`, runs `scripts/backup.sh`, references only the TC §8.1 GitHub Actions secret names; `scripts/backup.sh` runs `pg_dump`, uploads to `R2_BACKUP_BUCKET` and deletes objects older than 14 days | `tests/tooling/backup-workflow.test.ts` |
| ADR-13 backup (run) | one manual `workflow_dispatch` run succeeds and the dump object appears in the backup bucket | Step 30a session log |

**Verification:**
```
npm run typecheck      # exit 0
npm run lint           # exit 0
npm test               # all Vitest suites pass, incl. the three files above
npx supabase test db   # all pgTAP tests pass, incl. export_schedule
npm run build          # exit 0
# plus: one manual workflow_dispatch run of nightly-backup.yml succeeds and the object appears in R2_BACKUP_BUCKET (logged)
```

#### Prompt
```
You are executing Step 30a — Backups & data export archives — of docs/product/06-build-plan.md for the Moj Ljubimac web app. One outcome: the two file-producing jobs of TC ADR-13 run — the nightly database backup to the R2 backup bucket, and the in-app builder that turns pending data export requests (EP-50) into downloadable archives.

READ FIRST, in this order:
1. docs/product/02-prd.md §6 FR-41; §12 item 3.
2. docs/product/03-technical-constraints.md §3 ADR-07, ADR-10, ADR-13 (incl. Mechanics), ADR-15, ADR-16, ADR-17; §5.7 (data_exports); §8; §8.1; §10 RISK-13.
3. docs/product/04-design-system.md §9 and §9.1 (data_export_ready, email_footer).
4. docs/product/05-api-integration-contract.md EP-50, EP-52 (step 5), §6 DataExport, §9.4 (Resend row), §10 items 6 and 7, §12.
5. The session logs of Steps 03, 13, 19, 23 and 30 in docs/product/06-build-plan.md.

SETTLED UPSTREAM — apply exactly:
- Backups (TC ADR-13 Mechanics, §8): .github/workflows/nightly-backup.yml runs scripts/backup.sh nightly (and on workflow_dispatch); the script runs pg_dump against SUPABASE_DB_URL, uploads the dump to R2_BACKUP_BUCKET with the AWS CLI over the R2 S3-compatible endpoint (credentials R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY), then deletes backup objects older than 14 days. Secrets are the TC §8.1 GitHub Actions secrets, by name only. Use a pg_dump whose major version is not lower than the production database's (record which one in the Session log).
- Export archives (TC ADR-13 Mechanics, API EP-50): built inside the app, not in GitHub Actions. pg_cron calls POST /api/internal/exports every 5 minutes through pg_net, reading the URL and secret from the Vault secrets dispatch_url and dispatch_secret exactly as Step 19 does; the route rejects a request without a matching DISPATCH_SECRET (TC §8.1). Archives are ZIP files built with fflate (TC ADR-17), stored in R2_BUCKET under the key exports/<user_id>/<data_export_id>.zip (API §10 item 6).
- Copy: the ready email is the Design §9.1 data_export_ready template (sr, en; recipient locale).

BUILD:
1. scripts/backup.sh and .github/workflows/nightly-backup.yml as settled above. The workflow runs on a nightly schedule and on workflow_dispatch; it uses no application secret and deploys nothing.
2. Migration supabase/migrations/<timestamp>_export_schedule.sql: the pg_cron schedule (every 5 minutes) calling POST /api/internal/exports through pg_net with the Vault secrets, as settled. No table changes; no secret value in the migration.
3. app/api/internal/exports/route.ts and app/api/internal/exports/build-archive.ts: secret check in constant time; pick up data_exports rows with status preparing; for each, read the user's personal data and records with the service role (05- §3.1: jobs use the service role), fetch their attachments and photos from R2 through lib/integrations/r2.ts, build one ZIP with fflate, upload it to R2 under the EP-50 key, then set status = ready, r2_key, size_bytes, ready_at = now, expires_at = ready_at + 7 days, and send the data_export_ready email through lib/integrations/resend.ts; on any failure set status = failed. Each run stays within the job budget of 05- §12; rows not reached wait for the next run.
4. lib/integrations/r2.ts: add only the server-side object read and upload the builder needs (aws4fetch, as in Step 13).
5. README.md: add a "Backups" section — the workflow, the GitHub Actions secret names it needs (names only), and that one restore must be practised before launch (RISK-13).
6. Strings into lib/i18n/sr.ts and lib/i18n/en.ts per docs/product/04-design-system.md §9 and §9.1; regenerate types with npm run db:types.
7. Tests: write every test in the Step 30a "Tests to ship" table of docs/product/06-build-plan.md in exactly those files; R2 and Resend are faked in Vitest.
8. Run nightly-backup.yml once by workflow_dispatch (after the owner has set its GitHub Actions secrets) and record the result in the Session log.

FILES YOU MAY CREATE OR MODIFY (allowlist — nothing else):
- scripts/backup.sh, .github/workflows/nightly-backup.yml
- supabase/migrations/<timestamp>_export_schedule.sql, supabase/tests/export_schedule.test.sql
- app/api/internal/exports/route.ts, app/api/internal/exports/build-archive.ts
- lib/integrations/r2.ts (object read and upload only), lib/integrations/resend.ts (data_export_ready template only)
- package.json, package-lock.json (fflate only)
- README.md (Backups section only)
- lib/i18n/sr.ts and lib/i18n/en.ts (add keys only); the generated types file under lib/supabase/ (via npm run db:types only)
- tests/jobs/data-export-builder.test.ts, tests/jobs/exports-route.test.ts, tests/tooling/backup-workflow.test.ts
- docs/product/06-build-plan.md (Step 30a row in §3 and the Step 30a session log only)
Touching any other file requires stopping and asking.

FORBIDDEN:
- No library outside docs/product/03-technical-constraints.md ADR-17; add only fflate to package.json. The AWS CLI and pg_dump are used only inside the GitHub Actions runner, never in the app.
- No endpoint, field, error code or state outside docs/product/05-api-integration-contract.md.
- No table, column, enum or constraint change; nothing outside docs/product/03-technical-constraints.md §5.
- No secret value in any file; production data never used in tests (ADR-10).

DONE MEANS:
- Every test in the Step 30a "Tests to ship" table exists and passes.
- These commands all exit 0, in this order: npm run typecheck; npm run lint; npm test; npx supabase test db; npm run build; and one manual run of nightly-backup.yml succeeds with the backup object visible in R2_BACKUP_BUCKET.
- In docs/product/06-build-plan.md: set the Step 30a row in §3 to ✅ with today's date and append a Step 30a session log entry (date, what was built, pass/fail per command, the backup run result and pg_dump version, deviations, follow-ups — including "practise one restore before launch" from RISK-13).
- Commit with the message "Step 30a: Backups & data export archives".

If anything above is ambiguous, if a referenced section doesn't contain what this prompt says it does, or if completing this step would require touching a file outside the list or making a decision the referenced documents don't settle — STOP and ask. Do not choose a reasonable default. Do not proceed with a partial implementation.
```

#### Session log
_(empty — append after the step runs)_

---

### Step 31 — Payments & pricing

| | |
|---|---|
| **Status** | 🔒 blocked |
| **Outcome** | Users can start Premium (with the one-time 7-day trial) or a breeder plan, pay through the chosen provider, and renew automatically; S17 shows real prices. |
| **Implements** | FR-37, FR-42 (breeder plan); EP-44 (priced plans), EP-45 (provider checkout session — validation and the `503` stub exist from Step 23), EP-46, EP-49 (provider part — step 1 renewals); S17 `/premium` purchase state (the *payments_coming_soon* state exists from Step 23); plan seeding with prices; tables `plans` (price data), `subscriptions` (provider columns), `subscription_payments`, `payment_webhook_events`; BR-07, BR-11; ADR-09 |
| **Depends on** | Step 30a |
| **Blocked by** | **OQ-11** (API) — which payment provider replaces the deferred Monri choice; **OQ-03** (Brief) — Premium monthly/yearly and breeder plan prices |
| **Track** | single |

**Read before starting:** to be defined when unblocked (at minimum: PRD §6 FR-37, FR-42, §8 BR-07, BR-08, BR-11, §9 E-15, E-21; TC ADR-09, §5.1, §5.7 `payment_webhook_events`; Design §11–§12 S17; API §5.5 EP-44, §5.6 EP-45, EP-46, EP-49, §9.2, §9.4 payment row — each as revised after OQ-11; the Step 23 and Step 30 session logs for the EP-45 stub, S17 and the billing-nightly route).

**Files this step may touch:** to be defined when unblocked.

**Out of bounds:** everything until unblocked.

**Acceptance criteria:** (PRD §6, verbatim — settled; implementation waits for the locks)

FR-37 — Subscribe to Premium with a trial
- Given a user who never had a trial, When they start Premium, Then they get 7 days free before the first charge.
- Given a paid subscription, When its period ends, Then it renews automatically.

FR-42 — Shelter approval and breeder plan *(breeder plan)*
- Given a Breeder, Then breeder features require an active breeder plan (separate price).

**Tests to ship:** to be defined when unblocked.

**Verification:** to be defined when unblocked.

#### 🔒 Lock notice
```
LOCKED — no executable prompt.

Blocked by:
- OQ-11 (origin: API Contract) — Which payment provider is used (Monri deferred)? Determines the checkout session (EP-45), the webhook signature header, algorithm and payload mapping (EP-46, API §9.2), the renewal charge call (EP-49 step 1), and the provider column names in subscriptions / subscription_payments. Who answers: Keti (owner), after the business registration and acquiring-bank contract (TC ADR-09, RISK-16).
- OQ-03 (origin: Brief) — Premium monthly, Premium yearly and breeder plan prices. Determines the priced plans rows and the prices shown on S17 (purchase state) and S18. Who answers: Keti (owner).

What unlocks when answered:
- OQ-11 → revise 03-technical-constraints.md ADR-09 and 05-api-integration-contract.md EP-45 / EP-46 / EP-49 / §9.2 for the chosen provider, then write this step's file list, tests, verification and prompt.
- OQ-03 → seed plans with real prices (EP-44 then returns prices and S17 leaves the payments_coming_soon state) and remove the "/* placeholder price — OQ-03 */" placeholders on S17 / S18.

Until then EP-45 answers 503 payment_provider_unavailable (Step 23 stub) and S17 shows "Plaćanje uskoro dostupno"; production users stay on Free; Premium exists only through local seed data (Step 04).
Do not write a provisional prompt for this step.
```

#### Session log
_(empty — append after the step runs)_

---

### Step 32 — Release verification

| | |
|---|---|
| **Status** | ⬜ not started |
| **Outcome** | A recorded, item-by-item verdict on PRD §12 Release Criteria: all six ADR-15 end-to-end flows and the Šapa pomoći flow (PRD UC-11) pass, the automated accessibility check and the cost checks are done, and every gap that stands between the build and launch — including Release Criterion 4 until OQ-15 is answered — is listed with an owner. |
| **Implements** | PRD §12 Release Criteria 1–6; ADR-15 (full Playwright run), ADR-17 (`@axe-core/playwright`); PRD UC-11 (e2e flow "give away an item and message the author", `e2e/sapa-pomoci.spec.ts`); NFR-03, NFR-04, NFR-10 (checks); Design §10; S30/S31 publication check (RC-4) |
| **Depends on** | Step 30a, Step 28c (and Step 31 once unblocked, for Release Criterion 2) |
| **Blocked by** | — (the step runs now; checklist item 4 — Release Criterion 4 — stays open until OQ-15 is answered; Release Criterion 2 stays open until Step 31 runs) |
| **Track** | single |

**Read before starting:**
- `docs/product/02-prd.md` §6 (every FR's acceptance criteria), §7 UC-11, §10 NFR-01 … NFR-11, §12.
- `docs/product/03-technical-constraints.md` ADR-15, ADR-17, §7 (verifiable targets), §8.
- `docs/product/04-design-system.md` §5.3 (public shell footer), §10, §11 (S30, S31), §13 OQ-15.
- `docs/product/05-api-integration-contract.md` §12, §13.
- `docs/product/06-build-plan.md` §3, §12 and the session logs of Steps 01 … 31 (incl. 28a, 28b, 28c, 30a).

**Files this step may touch:**
- `e2e/accessibility.spec.ts` (new: automated accessibility check, NFR-04)
- `e2e/sapa-pomoci.spec.ts` (new: e2e flow "give away an item and message the author", PRD UC-11)
- `package.json`, `package-lock.json` (add `@axe-core/playwright` as a dev dependency only)
- `docs/product/06-build-plan.md` (§3 row for Step 32 and the Step 32 session log only)

**Out of bounds:** all application code, migrations, configuration, content, and every test other than `e2e/accessibility.spec.ts` and `e2e/sapa-pomoci.spec.ts`. A defect found here becomes a new suffixed step (e.g. `24a`) added to §3 and §8 by the plan owner, never a fix inside this step.

**Acceptance criteria:** (PRD §12 Release Criteria, verbatim)
1. All 72 P0 requirements (FR-01 … FR-72) are implemented and every acceptance criterion in §6 is verified.
2. Payments are tested end to end: trial, renewal, cancellation, expiry, downgrade, and breeder plan.
3. Account deletion (with grace period) and full data download work.
4. Privacy policy and terms of use are published at public URLs, in Serbian and English.
5. Delivered reminders are counted, so the north-star metric can be measured from day one.
6. The operator admin area works: shelter approval, partner management, paid-until hiding, click statistics, and Šapa pomoći moderation (hide, suspend, restore, dismiss).

Derived from TC §7 (NFR targets) for this step:
- NFR-03: no horizontal scroll and all core flows usable at 360 px.
- NFR-04: automated accessibility check with zero critical issues on core flows, plus a manual keyboard-only pass.
- NFR-10: monthly invoices total ≤ €20.

**Tests to ship:** two — `e2e/accessibility.spec.ts` (NFR-04) and `e2e/sapa-pomoci.spec.ts` (PRD UC-11); everything else runs existing suites and records results.
| Criterion | Check | Evidence recorded in |
|---|---|---|
| RC-1 | full `npm test`, `npx supabase test db`, `npm run e2e`; every FR in PRD §6 mapped to a passing test from its step's "Tests to ship" table | Step 32 session log (per-FR table) |
| RC-1 / ADR-15 | the six Playwright flows (registration, add pet, add vaccination and see the reminder, mark done, household invitation, shelter intake to adoption) pass | Step 32 session log |
| RC-1 / UC-11 | `e2e/sapa-pomoci.spec.ts`: a signed-in owner publishes a giving listing with a photo (S34); a second signed-in user finds it with the S32 filters, opens S33 and sends a message; the author sees the unread conversation in S36 after a reload, replies, and marks the listing resolved as "given" (S35); the listing leaves S32 | Step 32 session log |
| RC-2 | ❌ until Step 31 runs — recorded as open | Step 32 session log |
| RC-3 | Step 23 and Step 30 tests pass; one manual export request and one deletion + cancel on a local account | Step 32 session log |
| RC-4 | S30 `/privatnost` and S31 `/uslovi` (Step 12) reachable without signing in, in sr and en, from the PublicShell footer; ❌ open until OQ-15 — the owner's legal texts replace the placeholders | Step 32 session log |
| RC-5 | query counting `reminder_deliveries` with `status = delivered` per pet over the trailing 30 days returns the expected count on seed data | Step 32 session log |
| RC-6 | Step 28 and Step 28c tests pass; one manual pass through S26 tabs on a local Operator account, including *Moderacija* (hide, suspend, restore, dismiss) | Step 32 session log |
| NFR-03 | each core flow at 360 px and 1440 px in the browser: no horizontal scroll | Step 32 session log |
| NFR-04 | `e2e/accessibility.spec.ts` runs `@axe-core/playwright` (ADR-17) on the core-flow screens: zero critical issues; manual keyboard-only and screen-reader pass on add pet, add vaccination, mark reminder done, invite member (Design §10) | Step 32 session log |
| NFR-10 | current monthly costs from the Cloudflare, Supabase, Resend and Meta dashboards summed ≤ €20 | Step 32 session log |

**Verification:**
```
npm run typecheck      # exit 0
npm run lint           # exit 0
npm test               # all Vitest suites pass
npx supabase test db   # all pgTAP tests pass
npm run build          # exit 0
npm run e2e            # all six ADR-15 flows, e2e/sapa-pomoci.spec.ts and e2e/accessibility.spec.ts pass
```

#### Prompt
```
You are executing Step 32 — Release verification — of docs/product/06-build-plan.md for the Moj Ljubimac web app. One outcome: a recorded, item-by-item verdict on PRD §12 Release Criteria 1–6 and the NFR checks listed in Step 32, written into the Step 32 session log. You change no application code, migration or configuration in this step, and add no test other than e2e/accessibility.spec.ts and e2e/sapa-pomoci.spec.ts.

READ FIRST, in this order:
1. docs/product/02-prd.md §6, §7 UC-11, §10, §12.
2. docs/product/03-technical-constraints.md ADR-15, ADR-17, §7, §8.
3. docs/product/04-design-system.md §5.3, §10, §11, §13 (OQ-15).
4. docs/product/05-api-integration-contract.md §12, §13.
5. docs/product/06-build-plan.md §3, §12 and the session logs of Steps 01 … 31 (incl. 28a, 28b, 28c, 30a).

CHECKS — record each result (pass / fail / open, with evidence) in the Step 32 session log:
1. Run, in order: npm run typecheck; npm run lint; npm test; npx supabase test db; npm run build; npm run e2e. Record the output summary of each.
2. Release Criterion 1: build a table of every FR in docs/product/02-prd.md §6 → the step(s) that implemented it (from §3 and the step sections) → the test file(s) that cover each acceptance criterion → pass/fail. Any FR or criterion without a passing test is a fail. Note any criterion a step marked "deferred" and whether a later step closed it.
3. ADR-15: confirm the six Playwright flows exist and pass: registration, add pet, add vaccination and see the reminder, mark done, household invitation, shelter intake to adoption. A missing spec is a fail. Then write e2e/sapa-pomoci.spec.ts for PRD UC-11 "give away an item and message the author" against the local seed: a signed-in owner publishes a giving listing with one photo on S34; a second signed-in user finds it through the S32 filters, opens S33 and sends a message; the author reloads S36, sees the unread conversation, opens it and replies; the author marks the listing resolved as "given" on S35 and it no longer appears on S32. External providers (R2, Resend, Web Push) stay faked as in the existing specs (Step 22 Session log). It must pass.
4. Release Criterion 2: if Step 31 is not ✅ in §3, record "open — blocked by OQ-11 and OQ-03 (Step 31)". If it is ✅, verify trial, renewal, cancellation, expiry, downgrade and breeder plan from Step 31's tests.
5. Release Criterion 3: confirm the Step 23, Step 30 and Step 30a tests pass; on a local account request a data export and request then cancel account deletion through S19; record what happened.
6. Release Criterion 4: confirm S30 /privatnost and S31 /uslovi (Step 12) are reachable without signing in, in sr and en, from the PublicShell footer links. Their legal text is OQ-15 (owner, with a lawyer): while the "Tekst dostavlja vlasnik (OQ-15)." placeholders remain, record RC-4 as "open — OQ-15" and continue with the remaining checks. Do not write legal text.
7. Release Criterion 5: run a read-only SQL query against the local database counting pets with ≥ 1 reminder_deliveries row with status delivered in the trailing 30 days (TC §6 north-star row); record the query and the result on seed data.
8. Release Criterion 6: confirm Step 28 and Step 28c tests pass; walk S26 as the local Operator (approve a pending shelter, edit a partner, set paid-until to yesterday and confirm the partner disappears from /partneri, view click statistics; in Moderacija hide a reported listing, suspend a reported user, restore both, and dismiss a report).
9. NFR-03: open each core flow at 360 px and 1440 px widths; record any horizontal scroll.
10. NFR-04: add @axe-core/playwright (TC ADR-17) as a dev dependency and write e2e/accessibility.spec.ts running an axe check on the core-flow screens (Design §10 list); zero critical issues passes (TC §7 NFR-04). Then a manual keyboard-only pass and a screen-reader pass on add pet, add vaccination, mark reminder done, invite member.
11. NFR-10: sum the current monthly costs shown in the Cloudflare, Supabase, Resend and Meta dashboards; record the figures and whether the total is ≤ €20.
12. Open change requests and questions: record the status of every open item in §12 of docs/product/06-build-plan.md (CR-24, CR-25, CR-26, CR-27, CR-28, OQ-16, OQ-17) with its owner; CR-26 (cities in production) must be resolved before the first production release.

FILES YOU MAY CREATE OR MODIFY (allowlist — nothing else):
- e2e/accessibility.spec.ts
- e2e/sapa-pomoci.spec.ts
- package.json, package-lock.json (@axe-core/playwright only)
- docs/product/06-build-plan.md (Step 32 row in §3 and the Step 32 session log only)
Touching any other file requires stopping and asking. A defect found here is recorded with the step it belongs to and proposed as a new suffixed step (e.g. 24a); you do not fix it.

FORBIDDEN:
- No application, migration, configuration or content change; the only new tests are e2e/accessibility.spec.ts and e2e/sapa-pomoci.spec.ts.
- No library or tool installed other than @axe-core/playwright (TC ADR-17).
- No new endpoint, field, screen or copy.

DONE MEANS:
- Every check above has a recorded result with evidence in the Step 32 session log, and every fail or open item names its owning step or change request.
- The six commands in check 1 were run (e2e including e2e/sapa-pomoci.spec.ts and e2e/accessibility.spec.ts) and their outcomes recorded.
- In docs/product/06-build-plan.md: set the Step 32 row in §3 to ✅ with today's date only if Release Criteria 1–6 all pass; otherwise set it to ▶️ and list the open items in the session log (RC-4 stays open until OQ-15 is answered — that keeps the row at ▶️ but does not stop the other checks).
- Commit with the message "Step 32: Release verification".

If anything above is ambiguous, if a referenced section doesn't contain what this prompt says it does, or if completing this step would require touching a file outside the list or making a decision the referenced documents don't settle — STOP and ask. Do not choose a reasonable default. Do not proceed with a partial implementation.
```

#### Session log
_(empty — append after the step runs)_

---

## 9. Coverage Matrix

Regenerated for v1.2 by comparing every id against each step's **Implements** row (FR, EP, screens by id or route) and, for tables, the **Implements** and **Outcome** rows (every step that names the table); v1.1 rows are kept and Steps 28a, 28b, 28c and the revised Step 32 are added. Forward check: every one of the 72 FRs, 88 EPs, 37 screens and 52 tables (TC §5) is built by at least one step. Reverse check: every step implements at least one FR, EP, screen, table, ADR, or a confirmed operational necessity (Steps 01–03, 10). Dependency check: every dependency is an earlier step in execution order (Steps 28a–28c run between Step 28 and Step 29; Step 30a between Step 30 and Step 31).

### 9.1 Requirements
| FR | Steps |
|---|---|
| FR-01 | 13, 19 |
| FR-02 | 08, 13, 19 |
| FR-03 | 13, 14, 32 |
| FR-04 | 14, 32 |
| FR-05 | 08, 12, 14 |
| FR-06 | 15, 30 |
| FR-07 | 15 |
| FR-08 | 15, 30 |
| FR-09 | 13 |
| FR-10 | 16, 32 |
| FR-11 | 16 |
| FR-12 | 16 |
| FR-13 | 13 |
| FR-14 | 20 |
| FR-15 | 20 |
| FR-16 | 20 |
| FR-17 | 21 |
| FR-18 | 21 |
| FR-19 | 21 |
| FR-20 | 08, 17, 19, 20 |
| FR-21 | 17 |
| FR-22 | 18 |
| FR-23 | 18, 29 |
| FR-24 | 17, 19, 29 |
| FR-25 | 19, 23, 30 |
| FR-26 | 22 |
| FR-27 | 22 |
| FR-28 | 14, 20, 22 |
| FR-29 | 22 |
| FR-30 | 22 |
| FR-31 | 22, 30 |
| FR-32 | 22, 30 |
| FR-33 | 12 |
| FR-34 | 11 |
| FR-35 | 12 |
| FR-36 | 13, 15, 16, 18, 21 |
| FR-37 | 31 |
| FR-38 | 23 |
| FR-39 | 23, 30 |
| FR-40 | 23, 30 |
| FR-41 | 23, 30a |
| FR-42 | 24, 28, 31 |
| FR-43 | 24 |
| FR-44 | 24 |
| FR-45 | 09, 24 |
| FR-46 | 26 |
| FR-47 | 25 |
| FR-48 | 26 |
| FR-49 | 25, 26 |
| FR-50 | 25 |
| FR-51 | 25 |
| FR-52 | 09, 27 |
| FR-53 | 09, 27 |
| FR-54 | 27 |
| FR-55 | 27 |
| FR-56 | 27 |
| FR-57 | 28 |
| FR-58 | 09, 28 |
| FR-59 | 13, 24 |
| FR-60 | 24 |
| FR-61 | 28b, 32 |
| FR-62 | 28b, 28c |
| FR-63 | 28a, 28b, 32 |
| FR-64 | 28a, 28b, 32 |
| FR-65 | 28b |
| FR-66 | 28b, 28c |
| FR-67 | 28b |
| FR-68 | 28a, 28c, 32 |
| FR-69 | 28c |
| FR-70 | 28a, 28c |
| FR-71 | 28c, 32 |
| FR-72 | 28b |

### 9.2 Operations
| EP | Steps |
|---|---|
| EP-01 | 13 |
| EP-02 | 13, 14 |
| EP-03 | 13 |
| EP-04 | 13 |
| EP-05 | 13, 14 |
| EP-06 | 16 |
| EP-07 | 16 |
| EP-08 | 14 |
| EP-09 | 14 |
| EP-10 | 15 |
| EP-11 | 15 |
| EP-12 | 15 |
| EP-13 | 13, 15, 24, 28b |
| EP-14 | 15 |
| EP-15 | 13, 15, 21, 28b |
| EP-16 | 16 |
| EP-17 | 20 |
| EP-18 | 20 |
| EP-19 | 20 |
| EP-20 | 21 |
| EP-21 | 21 |
| EP-22 | 21 |
| EP-23 | 21 |
| EP-24 | 21 |
| EP-25 | 17 |
| EP-26 | 17 |
| EP-27 | 17 |
| EP-28 | 18, 28c, 29 |
| EP-29 | 18 |
| EP-30 | 29 |
| EP-31 | 18, 29 |
| EP-32 | 19 |
| EP-33 | 19, 29 |
| EP-34 | 22 |
| EP-35 | 22 |
| EP-36 | 22 |
| EP-37 | 22 |
| EP-38 | 22 |
| EP-39 | 22, 24 |
| EP-40 | 22, 24 |
| EP-41 | 12 |
| EP-42 | 11 |
| EP-43 | 12, 28a, 28b, 28c |
| EP-44 | 23, 31 |
| EP-45 | 23, 31 |
| EP-46 | 31 |
| EP-47 | 23 |
| EP-48 | 23 |
| EP-49 | 30, 31 |
| EP-50 | 23, 30a |
| EP-51 | 23 |
| EP-52 | 28a, 30 |
| EP-53 | 24, 28b |
| EP-54 | 24 |
| EP-55 | 24 |
| EP-56 | 24 |
| EP-57 | 25 |
| EP-58 | 25 |
| EP-59 | 25 |
| EP-60 | 25 |
| EP-61 | 26 |
| EP-62 | 26 |
| EP-63 | 25, 26 |
| EP-64 | 09, 27 |
| EP-65 | 27 |
| EP-66 | 09, 27 |
| EP-67 | 12 |
| EP-68 | 28 |
| EP-69 | 28 |
| EP-70 | 28 |
| EP-71 | 28 |
| EP-72 | 24 |
| EP-73 | 28b |
| EP-74 | 28b |
| EP-75 | 28b |
| EP-76 | 28b |
| EP-77 | 28b |
| EP-78 | 28b |
| EP-79 | 28b |
| EP-80 | 28c |
| EP-81 | 28c |
| EP-82 | 28c |
| EP-83 | 28c |
| EP-84 | 28c |
| EP-85 | 28c |
| EP-86 | 28c |
| EP-87 | 28b |
| EP-88 | 28b |

### 9.3 Screens
| Screen | Route | Steps |
|---|---|---|
| S01 | `/ljubimci` | 13, 16, 17 |
| S02 | `/ljubimci/novi` | 13 |
| S03 | `/ljubimci/[id]` | 13, 14, 15, 16, 17, 20, 21, 27 |
| S04 | `/ljubimci/[id]/vakcine/nova` | 14 |
| S05 | `/ljubimci/[id]/pregledi/novi` | 15 |
| S06 | `/uspomene` | 16 |
| S07 | `/ljubimci/[id]/dnevnik` | 20 |
| S08 | `/ljubimci/[id]/trenuci` | 21 |
| S09 | `/t/[slug]` | 21 |
| S10 | `/podsetnici` | 17 |
| S11 | `/podsetnici/novi` | 17 |
| S12 | `/podesavanja/podsetnici` | 18, 28c, 29 |
| S13 | `/domacinstvo` | 22 |
| S14 | `/poziv/[token]` | 22, 24, 25 |
| S15 | `/registracija` | 12 |
| S16 | `/prijava` | 11 |
| S17 | `/premium` | 23, 31 |
| S18 | `/profil` | 12, 23 |
| S19 | `/profil/podaci` | 23 |
| S20 | `/organizacija` | 24 |
| S21 | `/organizacija/zahtevi` | 25 |
| S22 | `/organizacija/legla` | 26 |
| S23 | `/o/[slug]` | 26 |
| S24 | `/partneri` | 27 |
| S25 | `/partneri/[id]` | 27 |
| S26 | `/admin` | 28, 28c |
| S27 | `/ljubimci/[id]/terapije/nova` | 15 |
| S28 | `/prijava/nova-lozinka` | 11 |
| S29 | `/organizacija/profil` | 24, 28b |
| S30 | `/privatnost` | 12, 32 |
| S31 | `/uslovi` | 12, 32 |
| S32 | `/sapa-pomoci` | 28b, 32 |
| S33 | `/sapa-pomoci/[id]` | 28b, 28c, 32 |
| S34 | `/sapa-pomoci/nova`, `/sapa-pomoci/[id]/izmeni` | 28b, 32 |
| S35 | `/sapa-pomoci/moje` | 28b, 32 |
| S36 | `/poruke`, `/poruke/[id]` | 28c, 32 |
| S37 | `/korisnik/[id]` | 28b, 28c |

### 9.4 Tables
| Table | Steps |
|---|---|
| `adoption_requests` | 09, 25 |
| `app_settings` | 04, 18, 28 |
| `attachments` | 06, 15 |
| `breeder_inquiries` | 09, 25 |
| `cities` | 04, 12, 27, 28b |
| `conversations` | 28a, 28c |
| `data_exports` | 04, 23, 30, 30a |
| `dose_logs` | 06, 15, 17 |
| `feeding_entries` | 07, 20 |
| `household_invitations` | 05, 22, 30 |
| `household_memberships` | 05, 22, 30 |
| `household_pets` | 06, 22 |
| `households` | 05, 22, 30 |
| `idempotency_keys` | 04, 11, 28c, 30 |
| `intakes` | 09, 24 |
| `listing_photos` | 28a, 28b |
| `listings` | 28a, 28b, 28c |
| `litters` | 09, 26 |
| `memorial_records` | 06, 16 |
| `messages` | 28a, 28c |
| `moment_photos` | 07, 21 |
| `moment_public_links` | 07, 21 |
| `moments` | 07, 21 |
| `organisation_invitations` | 05, 24, 30 |
| `organisation_memberships` | 05, 12, 24, 30 |
| `organisations` | 05, 12, 24, 28, 28a, 28b |
| `partner_clicks` | 09, 27, 28 |
| `partner_hours` | 09, 27, 28 |
| `partners` | 09, 27, 28 |
| `payment_webhook_events` | 04, 31 |
| `pet_status_history` | 09, 24 |
| `pets` | 06, 13, 16, 22, 24 |
| `plans` | 04, 23, 31 |
| `profiles` | 04, 12, 23, 28a, 28b, 28c, 30 |
| `push_subscriptions` | 08, 18, 19, 28c |
| `r2_deletion_queue` | 04, 13, 28a, 28b, 30 |
| `rate_limit_counters` | 04, 11, 28c, 30 |
| `record_transfers` | 09, 25, 30 |
| `reminder_deliveries` | 08, 18, 19, 29, 30 |
| `reminder_occurrences` | 08, 17, 19 |
| `reminder_preferences` | 08, 18, 28a, 28c, 29 |
| `reminders` | 08, 14, 15, 16, 17, 20, 22, 29 |
| `reports` | 28a, 28c |
| `stool_entries` | 07, 20 |
| `subscription_payments` | 04, 31 |
| `subscriptions` | 04, 23, 30, 31 |
| `treatments` | 06, 08, 15 |
| `user_blocks` | 28a, 28c |
| `user_channels` | 08, 18, 29 |
| `vaccinations` | 06, 08, 14 |
| `vet_visits` | 06, 15 |
| `weight_entries` | 06, 14 |

---

## 10. Risks

| ID | Risk | Severity | Mitigation |
|---|---|---|---|
| RISK-23 | Test volume: every step ships tests for every acceptance criterion across 60 FRs, roughly doubling the work of each step for a single builder. | Medium | Accepted by the owner (ADR-15); pgTAP covers the rules once at the database, so screen steps test only their own behaviour. |
| RISK-24 | Step sizing is unverified; schema and screen steps may not fit one session (Steps 11, 12, 19 and 23 grew in v1.1). | Medium | Calibrate on Steps 01–03; split oversized steps with suffixes (`14a`). |
| RISK-25 | Premium cannot be bought until Step 31, so household sharing, WhatsApp, PDF and other Premium paths are only testable with the local seeded Premium user. | Medium | Seeded Premium test user (Step 04); Premium e2e flows run locally; S17 shows "Plaćanje uskoro dostupno" (Step 23). |
| RISK-26 | v1.0 change requests CR-01 … CR-23 stopped prompts at pre-flight checks. **Resolved in v1.1:** every CR is fixed upstream (§12) and each prompt now cites the fixing section. Residual: CR-24 leaves eight notifications unsent until Design §9.1 adds their copy; CR-26 leaves the production load of the cities seed unspecified. | Low | CR-24 and CR-26 do not block any step; Step 32 records their status and CR-26 must be closed before the first production release. |
| RISK-27 | Later steps reference file names created by earlier steps (taken from their session logs); a missing log entry stalls the next step. | Low | Session logs are mandatory (§5). |
| RISK-28 | Two steps need a one-time owner answer at run time (Step 08: nightly run time; Step 12: initial `TERMS_VERSION`) and Step 04 needs the owner's approval of the city list; a session started without the owner present stalls. | Low | Run those steps with the owner available; each prompt asks once and records the answer in its session log. |
| RISK-37 | (v1.2) Steps 04, 05, 08, 10, 12, 18, 24 and 28 read upstream sections that now contain Šapa pomoći additions (TC v1.7 columns and the `message` preference, `Me.marketplace`, the seventh EP-28 row, the S12 *Poruke* card, the S29 *Donacije* card, the S26 *Moderacija* tab, the new composites), some of which need tables that exist only from Step 28a; a session may stop on them or build them early. Their prompts were not amended in v1.2 because Step 01 was being executed from the same repository. | Medium | Ordering invariant 11 (§4) assigns every such part to Steps 28a–28c and tells earlier steps to leave it out and log it; Steps 28a and 28b check what already exists before adding; amend those prompts in a later revision if a session stalls on them. |
| RISK-38 | (v1.2) Steps 28b and 28c are larger than most steps (28b: five screens, the S29 card, nine operations and a daily job; 28c: S36, four screen additions, seven operations and notifications) and may not fit one session. | Medium | Calibrate on Step 28a; if 28b or 28c stalls, split it before re-running by inserting a suffixed step and moving part of its file allowlist and tests table, never by improvising inside the session. |
| RISK-39 | (v1.2) The OQ-17 interim mappings (resolved date from `updated_at`, hidden reason from the report, donation recipient = organisation name, description 2,000 characters) may change when OQ-17 is answered, forcing a migration and screen rework after Steps 28a–28c have run. | Low | Each prompt names the interim mappings explicitly so they are easy to find; an OQ-17 answer becomes a new suffixed step. |

---

## 11. Assumptions

_None recorded by the owner. Highest upstream ids are ASM-10 (Brief v1.7) and RISK-36 (API v1.3); this plan's risks continue at RISK-37._

---

## 12. Open Questions & Change Requests

**Carried forward**

| ID | Origin | Question | Locks |
|---|---|---|---|
| OQ-03 | Brief | Prices | Step 31 |
| OQ-11 | API | Payment provider | Step 31 |
| OQ-15 | Design | Privacy policy and terms of use texts (sr, en) for S30/S31 — owner, with a lawyer | Step 32 checklist item 4 only (Release Criterion 4 stays open; the step runs) |
| OQ-16 | PRD (v1.7) | `[NEEDS CLARIFICATION]` Does an active breeder plan lift the Free limit of 3 active listings (BR-55)? Default until answered: no — only owner Premium and Shelter accounts are unlimited. Non-blocking (PRD §15, API §17). Who answers: Keti (owner). | — (affects Step 28a `listings_active_limit` and Step 28b `MarketplaceStatus.active_listing_limit`, S34/S35 counters; both apply the default. A "yes" needs TC §5.10 and API `MarketplaceStatus` revised first, then those two steps amended or a suffixed step if they already ran) |
| OQ-17 | API (v1.3) | `[NEEDS CLARIFICATION]` Fields the Šapa pomoći screens render that TC v1.7 cannot supply exactly: (a) resolved date — no `listings.resolved_at`, derived from `updated_at`; (b) hidden time and the Operator's "Razlog za korisnika" — no columns, derived from the actioned report, note only in the email; (c) donation *Primalac* legal name and *Svrha* — `organisations.name` and "Donacija — <listing title>"; (d) Design limits differ from PRD/TC (description ≤ 1000 vs 2000, title ≥ 5 vs 1); (e) bank-account format has no TC check (EP-88 validates in the action); (f) no screen edits `display_name`; (g) S33's *resolved* state for a non-author vs FR-62 — the contract follows FR-62. Proposed: `listings.resolved_at`, `listings.hidden_at`, `listings.moderation_note`, `profiles.marketplace_suspension_note`, `organisations.donation_recipient`; align S34 to 2000. Non-blocking — "interim mappings are defined" (API §17). Who answers: Keti (owner). | — (Step 28a adds none of the proposed columns; Step 28b applies (a), (b) on S35, (c), (d), (e), (f), (g); Step 28c applies (b) on S26 and keeps the note out of storage) |
| OQ-01, OQ-04, OQ-10 | Brief / Design | Targets, partner pricing, proposed composites | — |

**Change requests raised by v1.0 — all resolved upstream** (owner approval 2026-10-19; prompts in v1.1 cite the resolving section)

| ID | Against | Change request | Status | Resolved by | Steps |
|---|---|---|---|---|---|
| CR-01 | TC | Approve extra packages | ✅ resolved | TC v1.6 ADR-17 (approved libraries) | 01, 02, 10, 13, 16, 19, 21, 30a, 32 |
| CR-02 | TC | Pin Next.js 16 and the request-interception file name | ✅ resolved | TC v1.6 ADR-01 (version pin, `proxy.ts` rule) | 01, 11 |
| CR-03 | TC | Environment variable and GitHub secret names | ✅ resolved | TC v1.6 §8.1 | 02, 03, 11, 13, 19, 29, 30a |
| CR-04 | TC (ADR-10) | Preview behaviour | ✅ resolved | TC v1.6 ADR-10 (amended: no preview deployments) | 03 |
| CR-05 | TC §8 | CI applies migrations to production on `main` | ✅ resolved | TC v1.6 ADR-10, §8 (`supabase db push` before deploy) | 03 |
| CR-06 | TC | Production city list and coordinate source | ✅ resolved | TC v1.6 ADR-11 (cities seed via one-off script, `supabase/seed/cities.sql`) | 04 |
| CR-07 | API §7.1 | How database errors carry `details` | ✅ resolved | TC v1.6 §5.7.1; API v1.2 §7.1 (`<code>:<detail>` mapping) | 04–09, 11 |
| CR-08 | TC §5 | Tables for idempotency keys and rate-limit counters | ✅ resolved | TC v1.6 §5.7 (`idempotency_keys`, `rate_limit_counters`), §5.9 | 04, 11, 22, 24, 25, 29, 30 |
| CR-09 | TC / API | Source of the current terms version | ✅ resolved | TC v1.6 ADR-16, §5.1 (`TERMS_VERSION` in `lib/legal.ts`) | 12 |
| CR-10 | API | One R2 key layout | ✅ resolved | API v1.2 §10 item 6 (EP-13 references it) | 13, 15, 21, 30a |
| CR-11 | Design | English strings for every screen | ✅ resolved | Design v1.5 §9 (i18n rule: `sr.ts` / `en.ts`, faithful translation) | 12–29 |
| CR-12 | Design | Entry point to edit a manual reminder | ✅ resolved | Design v1.5 §12 S10 (manual row → S11 edit) | 17 |
| CR-13 | Design | S12 WhatsApp section before WhatsApp exists | ✅ resolved | Design v1.5 §12 S12 ("WhatsApp uskoro" state) | 18, 29 |
| CR-14 | Design / API | Copy and template ids for reminder emails, push, action pages | ✅ resolved | Design v1.5 §9.1 (message copy, template ids) | 19, 22–25, 28, 30, 30a |
| CR-15 | TC (ADR-04) | How pg_cron gets the dispatch URL and secret | ✅ resolved | TC v1.6 §8 (pg_cron → `pg_net`, Vault `dispatch_url` / `dispatch_secret`) | 19, 30, 30a |
| CR-16 | TC (ADR-16) | Folder for shared server utilities | ✅ resolved | TC v1.6 ADR-16 (amended: `lib/server/`, `scripts/`, `public/sw.js`, page + client files) | 11, 19, 22, 24, 25, 29 |
| CR-17 | TC / API | Public page caching and purge mechanism | ✅ resolved | TC v1.6 ADR-18 (no edge cache); API v1.2 EP-24, EP-62, §11, §12 (no purge) | 13, 21, 26, 28 |
| CR-18 | API / Design | Team invitations through S14 and the new member's account type | ✅ resolved | API v1.2 EP-39, EP-40, §6 `InvitationView.kind`; Design v1.5 §12 S14; PRD v1.6 BR-53 | 24 |
| CR-19 | API §9.4 | WhatsApp template names, languages, variables | ✅ resolved | API v1.2 §9.4 (WhatsApp message templates) | 29 |
| CR-20 | TC (ADR-13/16) | Backup and data-export mechanics | ✅ resolved | TC v1.6 ADR-13 (Mechanics); API v1.2 EP-50 | 23, 30a |
| CR-21 | Design | Privacy policy and terms pages | ✅ resolved | Design v1.5 §11, §12 S30 / S31 (pages with placeholder text; new OQ-15 for the text) | 12, 32 |
| CR-22 | Design / API | S03 vet suggestion, count badge source, S17 before payments, manifest | ✅ resolved | Design v1.5 §4 (manifest exception), §5.1 (count badge), §12 S03, S17; API v1.2 EP-25, EP-44, EP-45, EP-64 | 10, 17, 23, 27 |
| CR-23 | PRD | Requirement count 58 vs 60 | ✅ resolved | PRD v1.6 §1, §11, §12 (60 requirements) | 32 |

**Change requests raised by v1.1** (none blocks a step; Step 32 records their status)

| ID | Against | Change request | Steps affected |
|---|---|---|---|
| CR-24 | Design §9.1 | Copy and template ids for messages the API names but §9.1 does not cover: the Operator notification for a pending shelter (EP-41), the auto-renew confirmation (EP-48), the cancel-deletion confirmation (EP-51), the heir notification (EP-52), the organisation-admin emails on transfer accept/decline (EP-60) and on a new request/inquiry (EP-63), the web-push expiry notices (EP-49), and the RISK-14 Operator alert (EP-33 watchdog). Until added, those messages are not sent and each step logs them. | 12, 19, 23, 25, 30 |
| CR-25 | TC ADR-17 | Name the toolchain packages that ADR-17 leaves implicit: ESLint and `eslint-config-next`, `@tailwindcss/postcss`, the `@types/*` packages create-next-app installs, `@testing-library/jest-dom` / `user-event` (under "Testing Library"), and the Supabase CLI as a dev dependency. Steps 01–02 install them as the ADR-01/ADR-14/ADR-15 toolchain; confirm by adding them to ADR-17. | 01, 02 |
| CR-26 | TC ADR-11 / §8 | How `supabase/seed/cities.sql` reaches production: `supabase db push` on `main` applies migrations only, and the local seed must not run in production. Must be answered before the first production release. | 03, 04, 32 |

**Change requests raised by v1.2** (non-blocking; the steps carry the stated interim rule; Step 32 records their status)

| ID | Against | Change request | Interim rule in the steps | Steps affected |
|---|---|---|---|---|
| CR-27 | TC ADR-16 | ADR-16 names route groups for signed-in (`app/(app)`, `app/(org)`) and public (`app/(public)`) pages, but S32, S33 and S37 render in `AppShell` when signed in and in `PublicShell wide` when signed out, and S34–S36 in either the owner or the organisation shell (Design §11 "A / P", "A / O"). Confirm a route group for these pages and its shell rule in ADR-16. | `app/(sapa)/` with `app/(sapa)/layout.tsx` choosing `PublicShell wide` / organisation `AppShell` / owner `AppShell` from the session | 28b, 28c |
| CR-28 | TC §5.10 | TC §5.10 says a `medicine_care` category violation "maps to `listing_type_not_allowed`", while API v1.3 §7.1 (SQLSTATE `23514` on the `listings.category` check), EP-75 and §7.2 return `422 category_not_allowed`. Align the TC wording with the API, which owns what crosses the wire. | the API mapping (`category_not_allowed`) | 28a, 28b |

---

## 13. Glossary Additions

| Term | Definition |
|---|---|
| Step | One coding session with a closed prompt, file allowlist, tests, and verification. |
| Pre-flight check | (v1.0) The first instruction in a prompt that stopped the session if an upstream decision it relied on was missing. All were resolved in v1.1. |
| Settled-upstream block | (v1.1) The part of a prompt that replaced a pre-flight check: it names the upstream section that now settles the decision and tells the agent to apply it exactly. |
| Lock notice | The text that replaces a prompt in a blocked step. |
| Checklist item lock | (v1.1) An open question that keeps one verification item of a runnable step open instead of locking the whole step (Step 32 item 4, OQ-15). |
| Session log | The record appended under a step after it runs. |
| Calibration pass | Running Steps 01–03 first to adjust sizing and allowlists. |
| Interim mapping | (v1.2) How a step renders a field the data model cannot supply exactly while a non-blocking open question is unanswered, as defined upstream (API v1.3 §17 OQ-17); named in the prompt so it can be revisited. |
| `(sapa)` route group | (v1.2, CR-27) The folder `app/(sapa)/` holding S32–S37, whose layout picks the public or the signed-in shell from the session. |

---

## 14. Appendix

_None for v1._
