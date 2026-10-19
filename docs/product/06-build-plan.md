# Build Plan — Moj Ljubimac (Web)

## Document Control

| Field | Value |
|---|---|
| Product | Moj Ljubimac ("My Pet") — web application |
| Document | 06 — Build Plan |
| Version | 1.0 |
| Date | 2026-10-19 |
| Author | Keti Vrtunić (planned with "Nindza Tigar", Build Lead persona) |
| Traces to | Brief v1.6 · PRD v1.5 · Technical Constraints v1.5 · Design System v1.4 (29 screens) · API Contract v1.1 |
| Status | Draft — no step executed yet |

**Change log**

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-10-19 | Initial plan: 32 steps, 1 blocked (Step 31 — payments). |

---

## 1. Executive Summary

The build runs in 32 steps, each one coding session: foundation (repository, Supabase, CI), the database in six domain slices with every table's access rules and Free limits landing together with its tests, the design foundation, authentication, then features in dependency order — pets and the health record, reminders and their delivery (the north-star path, deliberately early), care log and moments, household, account data control, organisations, partners and admin — followed by WhatsApp, nightly jobs and backups, payments, and release verification. One step is blocked: Step 31 (payments and pricing) waits for OQ-11 (payment provider) and OQ-03 (prices). Everything else can be executed now. Traces to Brief v1.6, PRD v1.5, Technical Constraints v1.5, Design System v1.4, API Contract v1.1.

---

## 2. Inherited Context

- **Stack (TC v1.5):** Next.js App Router + TypeScript (ADR-01) on Cloudflare via OpenNext (ADR-03), Supabase Postgres/Auth/pg_cron (ADR-02/04/06), Cloudflare R2 (ADR-07), Resend (ADR-08), Web Push (ADR-05), WhatsApp Cloud API, Nominatim (ADR-11), browser-side PDF (ADR-12), GitHub Actions backups (ADR-13), shadcn/ui + Tailwind v4 + lucide (ADR-14), Vitest + pgTAP + Playwright (ADR-15), layout per ADR-16.
- **Repository at plan time:** `pussycat993-gif/moj-ljubimac` exists and is **empty** (no commits). The first commit adds `docs/` and `CLAUDE.md` only; Step 01 creates the application.
- **Scale:** 60 FRs (FR-01 … FR-60), 72 operations (EP-01 … EP-72), 29 screens (S01 … S29), 44 tables (TC §5).
- **Team and deadline:** one builder, no deadline → a single serial track.
- **Non-goals steps must respect (TC §9, API §14):** no microservices or separate API server, no message queue, no real-time, no offline mode, no staging, no external analytics, no Apple sign-in, no card data stored, no public API, no API versioning.
- **Mockups:** `docs/product/04-design/screens/*.tsx` and `04-design/components/*.tsx` are the starting material for every screen step; they use inline mock data and must be wired to real data, not redesigned.

**Carried-forward open questions**

| ID | Origin | Effect on this plan |
|---|---|---|
| OQ-01 | Brief | None — targets |
| OQ-03 | Brief | 🔒 Step 31 (plan prices, S17) |
| OQ-04 | Brief | None — partner billing is outside the product |
| OQ-10 | Design | None — proposed composites stay out until approved; steps use only approved composites |
| OQ-11 | API | 🔒 Step 31 (provider checkout, webhook, renewal charge) |

---

## 3. Step Sequence & Status

**This table is the authoritative status record.** Update it after every step.

| Step | Name | Status | Depends on | Blocked by | Done |
|---|---|---|---|---|---|
| 01 | Repository scaffold & tooling | ⬜ | — | — | |
| 02 | Supabase project, local dev & clients | ⬜ | 01 | — | |
| 03 | CI pipeline & Cloudflare deploy | ⬜ | 02 | — | |
| 04 | Schema: accounts, reference & billing tables | ⬜ | 02 | — | |
| 05 | Schema: households & organisations | ⬜ | 04 | — | |
| 06 | Schema: pets & health record | ⬜ | 05 | — | |
| 07 | Schema: care log & moments | ⬜ | 06 | — | |
| 08 | Schema: reminders & delivery | ⬜ | 07 | — | |
| 09 | Schema: organisation workflows & partners | ⬜ | 08 | — | |
| 10 | Design foundation | ⬜ | 01 | — | |
| 11 | Authentication & gates | ⬜ | 04, 10 | — | |
| 12 | Registration, profile & i18n | ⬜ | 11, 05 | — | |
| 13 | Pets: list, create, edit, delete | ⬜ | 12, 06 | — | |
| 14 | Pet record: view, weight, vaccinations | ⬜ | 13, 08 | — | |
| 15 | Treatments, doses, vet visits & attachments | ⬜ | 14 | — | |
| 16 | Memorial, restore & PDF export | ⬜ | 15 | — | |
| 17 | Reminder lists & manual reminders | ⬜ | 14 | — | |
| 18 | Reminder settings, email & push channels | ⬜ | 17 | — | |
| 19 | Reminder dispatch job & message actions | ⬜ | 18 | — | |
| 20 | Care log & meal reminders | ⬜ | 19 | — | |
| 21 | Moments & public links | ⬜ | 15 | — | |
| 22 | Household sharing | ⬜ | 19 | — | |
| 23 | Subscription status & account data control | ⬜ | 12 | — | |
| 24 | Organisations: animals, team, public profile | ⬜ | 09, 15 | — | |
| 25 | Requests, inquiries & record transfers | ⬜ | 24, 22 | — | |
| 26 | Litters & public organisation pages | ⬜ | 25 | — | |
| 27 | Partners directory | ⬜ | 09, 12 | — | |
| 28 | Operator admin | ⬜ | 27, 24 | — | |
| 29 | WhatsApp channel | ⬜ | 19 | — | |
| 30 | Nightly jobs, backups & data export | ⬜ | 23, 25, 29 | — | |
| 31 | Payments & pricing | 🔒 | 30 | OQ-11, OQ-03 | |
| 32 | Release verification | ⬜ | 30 (31 when unblocked) | — | |

---

## 4. Ordering Invariants & Dependency Rules

1. Infrastructure before anything that runs (01–03).
2. A table, its RLS policies, its Free-limit triggers, and its pgTAP tests land in the same step — no table ever exists unprotected (04–09).
3. Design tokens, fonts, shadcn components, and the shared composites exist before any screen (10).
4. Authentication and the gates of API §4.1 exist before any signed-in surface (11).
5. An operation's data access lands in the same step as the first screen that consumes it, ported from its mockup.
6. Reminders come right after the pet record (17–19) because they are the north-star path; this departs from PRD epic order on purpose.
7. Integrations come after the surfaces they feed (19 email/push, 29 WhatsApp, 30 jobs and backups).
8. Steps blocked by an open question get no prompt until it is answered (31).
9. Release verification is last (32).
10. A step inserted later gets a suffix (`14a`), never a renumbering.

PRD priorities are all P0, so dependency order alone decides the sequence.

---

## 5. How to Run a Step

1. Open the step. Read every section listed under **Read before starting**.
2. Start a fresh Claude Code session in the repository root and paste the **Prompt** block verbatim.
3. When the session finishes, run the **Verification** commands yourself and compare with the expected results.
4. Append a **Session log** entry under the step: date, what was built, verification output (pass/fail per command), deviations, follow-ups.
5. Update the step's row in §3 (status ✅ and the date), commit with the step number in the message (`Step 07: care log and moments schema`), and push.

**When verification fails:** fix it within the step's file allowlist in the same or a new session. If the fix needs a file outside the allowlist, stop, amend the step in this document (file list and prompt), then continue.

**When a prompt turns out ambiguous:** stop, resolve the ambiguity against the upstream document it references, and edit the prompt in this file so the next reader doesn't hit it again. If the upstream document itself is unclear, raise a change request against it (§12) instead of deciding inside the code.

**Calibration:** run Steps 01–03 first and revise step sizing and file allowlists from what actually happened before trusting the rest.

---

## 6. Test & Verification Policy

Per ADR-15 (TC v1.5):
- **pgTAP** (`supabase/tests/*.sql`, run with `npx supabase test db`): every constraint, trigger, Free limit, RLS policy, and RPC function.
- **Vitest + Testing Library** (`tests/**/*.test.ts(x)`, run with `npm test`): server actions, integration adapters (with fakes), utilities, and components with logic.
- **Playwright** (`e2e/*.spec.ts`, run with `npm run e2e`): the six end-to-end flows in ADR-15, added in the steps that complete them and run in full at Step 32.

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

The cost of this policy is real (test volume grows with 60 requirements) and is recorded as RISK-23.

---

## 7. Blocked Steps & Unblocking Conditions

| Step | Blocked by | Origin | Question | Who answers | Unlocks |
|---|---|---|---|---|---|
| 31 Payments & pricing | OQ-11 | API | Which payment provider (Monri deferred)? | Keti (owner) | Checkout (EP-45), provider webhook (EP-46), renewal charging (EP-49 provider part), S17 purchase |
| 31 Payments & pricing | OQ-03 | Brief | Premium monthly/yearly and breeder plan prices | Keti (owner) | Seeding `plans`, prices on S17 |

Until Step 31 runs, Premium can only be granted for testing through seed data in the local database (Step 04 seeds a test Premium user); production users stay on Free.

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

**Read before starting:** `docs/product/03-technical-constraints.md` §3 (ADR-01, ADR-14, ADR-15, ADR-16), §4, §9 · `docs/product/06-build-plan.md` §5, §6 · `docs/product/04-design/README.md` ("How to run", "Verification" — the Next.js major the mockups were verified with).

**Files this step may touch:**
- `package.json`, `package-lock.json`
- `tsconfig.json`, `next-env.d.ts`, `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`
- `vitest.config.ts`, `tests/setup.ts`
- `playwright.config.ts`
- `app/layout.tsx`, `app/globals.css` (minimal Tailwind import only — replaced in Step 10), `app/page.tsx` and `app/favicon.ico` (delete the create-next-app samples), `public/*` (delete create-next-app sample assets)
- `.gitignore`, `README.md`
- ADR-16 skeleton placeholders: `app/(app)/.gitkeep`, `app/(org)/.gitkeep`, `app/(auth)/.gitkeep`, `app/(public)/.gitkeep`, `app/admin/.gitkeep`, `app/api/.gitkeep`, `components/ui/.gitkeep`, `components/app/.gitkeep`, `lib/supabase/.gitkeep`, `lib/actions/.gitkeep`, `lib/integrations/.gitkeep`, `lib/i18n/.gitkeep`, `supabase/migrations/.gitkeep`, `supabase/tests/.gitkeep`, `e2e/.gitkeep`
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

Read first, in full: docs/product/03-technical-constraints.md §3 (ADR-01, ADR-14, ADR-15, ADR-16), §4 and §9; docs/product/06-build-plan.md §5 and §6; docs/product/04-design/README.md ("How to run" and "Verification").

Goal: create the application scaffold and tooling only. No screens, no Supabase, no CI.

Do exactly this:
1. Scaffold a Next.js App Router application with TypeScript, Tailwind CSS v4 and ESLint in the repository root, using npm. Use the Next.js major version the design mockups were verified with (04-design/README.md "Verification"). The repository already contains docs/ and CLAUDE.md — keep them untouched. Configure the "@/*" import alias to the repository root (the design mockups import "@/components/..." and "@/lib/...").
2. Delete the create-next-app sample content: app/page.tsx, app/favicon.ico and the sample files in public/. Keep app/layout.tsx minimal (html/body, imports app/globals.css). Keep app/globals.css to the Tailwind v4 import only — Step 10 replaces it with the design tokens.
3. Install and configure Vitest with Testing Library (ADR-15): vitest.config.ts with a DOM environment and the "@/*" alias, tests/setup.ts registering the Testing Library matchers, test files under tests/.
4. Install and configure Playwright (ADR-15): playwright.config.ts with testDir "e2e", using the Next.js dev server as its web server. Configure it so a run with zero spec files exits successfully.
5. Add npm scripts exactly named: typecheck (tsc --noEmit), lint (ESLint over the repository), test (Vitest, single run), e2e (Playwright), build (next build). Keep dev and start.
6. Create the ADR-16 folder skeleton with .gitkeep files: app/(app), app/(org), app/(auth), app/(public), app/admin, app/api, components/ui, components/app, lib/supabase, lib/actions, lib/integrations, lib/i18n, supabase/migrations, supabase/tests, e2e. (tests/ exists through its test files.)
7. .gitignore: Next.js build output, node_modules, all .env files except .env.example, Playwright reports and results, test coverage.
8. README.md: product name, one paragraph pointing to docs/product/ (01–06) and stating that docs/product/06-build-plan.md §3 is the build status record, and the npm scripts. No other content.
9. Write the tests listed below.

Allowed packages: next, react, react-dom, typescript and the type packages create-next-app installs, tailwindcss v4 and its PostCSS plugin, eslint and the Next.js ESLint config, vitest, @vitejs/plugin-react, jsdom, @testing-library/react, @testing-library/dom, @testing-library/jest-dom, @testing-library/user-event, @playwright/test. Nothing else. No other libraries outside docs/product/03-technical-constraints.md §4. No components, tokens, colours or routes — they belong to later steps.

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
_(empty — append after the step runs)_

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

**Read before starting:** `docs/product/03-technical-constraints.md` §3 (ADR-02, ADR-03, ADR-06, ADR-07, ADR-08, ADR-05, ADR-16), §6, §8 · `docs/product/05-api-integration-contract.md` §3.1, §4.1, §4.2, §5.3 (EP-29 — `NEXT_PUBLIC_VAPID_PUBLIC_KEY`; EP-33 — `DISPATCH_SECRET`), §9.1, §9.3 · `docs/product/06-build-plan.md` §6.

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
- (TC §8, ADR-07, ADR-08, ADR-05, API §9.1, §9.3, EP-29, EP-33) `.env.example` lists the name of every environment variable in the list fixed by this step, with no values; real env files are git-ignored.
- (ADR-02) `npm run db:types` regenerates `lib/supabase/database.types.ts` from the local database.

**Tests to ship:**
- (ADR-02 start) proven by the `npx supabase start` verification command.
- (API §4.1 cookies) `tests/supabase/clients.test.ts` — server client reads and writes the session through the cookie store adapter.
- (ADR-06 browser) `tests/supabase/clients.test.ts` — browser client is built from the two public variables only.
- (API §3.1 service role) `tests/supabase/clients.test.ts` — service-role module throws without its key and is marked server-only.
- (env names) `tests/tooling/env-example.test.ts` — every name in the step's list is present in `.env.example` with an empty value; `.gitignore` ignores real env files.
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

Read first, in full: docs/product/03-technical-constraints.md §3 (ADR-02, ADR-03, ADR-05, ADR-06, ADR-07, ADR-08, ADR-16), §6 and §8; docs/product/05-api-integration-contract.md §3.1, §4.1, §4.2, EP-29 and EP-33 in §5.3, §9.1 and §9.3; docs/product/06-build-plan.md §6.

Goal: local Supabase, environment variable names, and the three typed Supabase clients. No tables, no auth configuration, no routes.

Do exactly this:
1. Run the Supabase CLI init in the repository root (installed as a dev dependency, invoked with npx). Keep the generated supabase/config.toml defaults except: set the project id to "moj-ljubimac". Do not change auth provider, SMTP or redirect settings (Step 11 owns them). Leave supabase/seed.sql as an empty file.
2. Create .env.example with these names and empty values, grouped with one comment line per group naming the ADR or API section that needs it — exactly this list, no more, no fewer:
   Supabase (ADR-02, ADR-06): NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID, SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET
   Application (links in emails and messages): NEXT_PUBLIC_SITE_URL
   Cloudflare R2 (ADR-07): R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
   Resend (ADR-08): RESEND_API_KEY, RESEND_FROM_EMAIL
   Web Push (ADR-05, EP-29): NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
   WhatsApp Cloud API (TC §6, API §9.1): WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN
   Internal job secret (EP-33): DISPATCH_SECRET
   Signed action links (API §9.3): ACTION_TOKEN_SECRET
   No payment-provider variables (OQ-11 is open).
   Make sure .gitignore ignores every real env file and supabase local temp output, and keeps .env.example tracked.
3. Install @supabase/supabase-js and @supabase/ssr (API §4.1) and create:
   - lib/supabase/server.ts — server client for Server Components, server actions and route handlers, using @supabase/ssr with the Next.js cookie store so the session lives in httpOnly cookies (API §4.1). Typed with the generated Database type.
   - lib/supabase/browser.ts — browser client from NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY only. Typed.
   - lib/supabase/service-role.ts — service-role client from SUPABASE_SERVICE_ROLE_KEY, no session persistence, importable only from server code (use the "server-only" package to make a client import a build error). Throws a clear error when the key is missing. Typed. API §3.1: it is for Operator actions, jobs and webhooks only — state this in a one-line comment.
   - lib/supabase/database.types.ts — generated, never hand-edited.
4. Add the npm script db:types that generates TypeScript types from the local database into lib/supabase/database.types.ts using the Supabase CLI.
5. README.md: add a "Local development" section — copy .env.example to .env.local, npx supabase start, npm run db:types, npm run dev. Nothing else.
6. Write the tests listed below.

Allowed packages added in this step: supabase (CLI, dev dependency), @supabase/supabase-js, @supabase/ssr, server-only. Nothing else; no libraries outside docs/product/03-technical-constraints.md §4. No tables, columns or functions — the schema starts in Step 04. No environment variable names other than the list in step 2.

Files you may create or modify — nothing else:
supabase/config.toml, supabase/.gitignore, supabase/seed.sql, .env.example, .gitignore, lib/supabase/server.ts, lib/supabase/browser.ts, lib/supabase/service-role.ts, lib/supabase/database.types.ts, lib/supabase/.gitkeep (delete), package.json, package-lock.json, README.md, tests/supabase/clients.test.ts, tests/tooling/env-example.test.ts, and docs/product/06-build-plan.md (only the Step 02 row in §3 and the Step 02 Session log).

Tests to write (one per acceptance criterion; "stack starts" and "types generate" are proven by the verification commands):
- tests/supabase/clients.test.ts — (a) the server client reads and writes auth cookies through the cookie store adapter it is given; (b) the browser client is created from the two NEXT_PUBLIC_ variables only; (c) the service-role module throws without SUPABASE_SERVICE_ROLE_KEY and imports "server-only".
- tests/tooling/env-example.test.ts — every name in the step 2 list is present in .env.example with an empty value and no other names exist; .gitignore ignores real env files and does not ignore .env.example.

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
_(empty — append after the step runs)_

---

### Step 03 — CI pipeline & Cloudflare deploy

| | |
|---|---|
| **Status** | ⬜ not started |
| **Outcome** | Every push runs install, type-check, lint, unit tests, local Supabase + pgTAP, and build in GitHub Actions; a green push to `main` applies migrations and deploys to Cloudflare through the OpenNext adapter; other branches get a preview link built without production secrets. |
| **Implements** | ADR-03, ADR-10, TC §8 (CI/CD), ADR-15 (CI gate) |
| **Depends on** | Step 02 |
| **Blocked by** | — |
| **Track** | single |

**Read before starting:** `docs/product/03-technical-constraints.md` §3 (ADR-03, ADR-10, ADR-15), §4, §8, §10 (RISK-11) · `docs/product/06-build-plan.md` §6 · the OpenNext Cloudflare adapter's getting-started documentation for the installed Next.js major.

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
- (ADR-10, TC §8) A push to `main` that passes every check applies the versioned migrations to production and deploys the application to Cloudflare Workers through the OpenNext adapter.
- (ADR-10) A push to any other branch that passes every check uploads a preview version with a temporary preview link, built without production secrets.
- (ADR-03) The application builds and runs locally through the Cloudflare adapter's preview command.
- (TC §8, ADR-10) No secret value is committed; workflows and Cloudflare config reference secrets by name only.

**Tests to ship:**
- (CI order) `tests/tooling/ci-workflow.test.ts` — the workflow runs the six checks in the stated order on every push.
- (main deploy) `tests/tooling/ci-workflow.test.ts` — migration + deploy job runs only on `main` and only after the check job succeeds.
- (preview) `tests/tooling/ci-workflow.test.ts` — preview upload runs only on non-`main` branches, after the check job, with no production secrets referenced.
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
# after push: GitHub Actions run on a feature branch → all checks green + preview link printed
```

#### Prompt
```
You are executing Step 03 — CI pipeline & Cloudflare deploy — of docs/product/06-build-plan.md.

Read first, in full: docs/product/03-technical-constraints.md §3 (ADR-03, ADR-10, ADR-15), §4, §8 and §10 (RISK-11); docs/product/06-build-plan.md §6; the OpenNext Cloudflare adapter's getting-started documentation for the Next.js major installed in Step 01.

Goal: CI on every push, production deploy from main, preview links for other branches. No application code.

Do exactly this:
1. Install the OpenNext Cloudflare adapter and wrangler as documented by the adapter. Create wrangler.jsonc and open-next.config.ts and apply the adapter's documented change to next.config.ts. Add the adapter's documented npm scripts for local preview, deploy and version upload (use the script names the adapter documentation uses; "preview" must exist). Add the adapter's build output folders to .gitignore. If the adapter documentation says the installed Next.js major is unsupported, STOP and report (RISK-11) — do not downgrade or upgrade Next.js.
2. Create supabase/tests/smoke.test.sql: a pgTAP test that proves the local database answers and pgTAP is available, so the CI pgTAP gate has a test before Step 04 adds real ones.
3. Create .github/workflows/ci.yml:
   - Trigger: every push.
   - Job "check": checkout, Node setup, npm ci, npm run typecheck, npm run lint, npm test, Supabase CLI setup + npx supabase start + npx supabase test db, npm run build — in this order (docs/product/06-build-plan.md §6). Public build-time variables (the NEXT_PUBLIC_ names from .env.example) come from GitHub Actions variables; for this job use the values printed by the local Supabase stack, never production values.
   - Job "deploy-production": only on refs/heads/main, needs "check". Applies the migrations in supabase/migrations to the production Supabase project with the Supabase CLI (TC §8: "Database changes are versioned migration files applied to production as part of the release"), then builds with the adapter and deploys to Cloudflare Workers. Uses GitHub secrets CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, SUPABASE_ACCESS_TOKEN, SUPABASE_DB_PASSWORD, SUPABASE_PROJECT_REF and GitHub variables for the production NEXT_PUBLIC_ values.
   - Job "preview": only on branches other than main, needs "check". Builds with the adapter and uploads a preview version (adapter/wrangler version upload) and prints the preview URL. It must reference no production secret and no production NEXT_PUBLIC_ value (ADR-10: previews never use production data). Which non-production Supabase project previews should point to is not settled upstream — leave preview Supabase variables unset and record this in the Session log as an open follow-up; do not create or invent one.
4. Server-side runtime secrets for the deployed Worker (every non-NEXT_PUBLIC_ name in .env.example) are set by the owner with wrangler; do not put values in wrangler.jsonc.
5. README.md: add a "Deployment" section listing the GitHub secrets and variables of step 3 and stating that Worker runtime secrets are the server-side names in .env.example. Names only, no values.
6. Write the tests listed below.

Allowed packages added in this step: the OpenNext Cloudflare adapter and wrangler. Nothing else; no libraries outside docs/product/03-technical-constraints.md §4. No staging environment (ADR-10, TC §9). No new environment variable names in the application.

Files you may create or modify — nothing else:
.github/workflows/ci.yml, wrangler.jsonc, open-next.config.ts, next.config.ts, cloudflare-env.d.ts (only if the adapter's documented type generation creates it), package.json, package-lock.json, .gitignore, supabase/tests/smoke.test.sql, README.md, tests/tooling/ci-workflow.test.ts, tests/tooling/no-secrets.test.ts, and docs/product/06-build-plan.md (only the Step 03 row in §3 and the Step 03 Session log).

Tests to write (one per acceptance criterion; local Workers preview is proven by the verification command):
- tests/tooling/ci-workflow.test.ts — reads .github/workflows/ci.yml as text and asserts: (a) push trigger and the six checks in order in "check"; (b) "deploy-production" is limited to main, needs "check", and runs migrations before deploy; (c) "preview" is limited to non-main branches, needs "check", and references none of the production secret names.
- tests/tooling/no-secrets.test.ts — ci.yml and wrangler.jsonc contain secret references only (no literal tokens, keys or passwords).
- supabase/tests/smoke.test.sql — as in step 2.

Done means all of these pass, in this order:
  npm run typecheck   → exit 0
  npm run lint        → exit 0
  npm test            → all test files pass
  npm run build       → exit 0
  npm run preview     → app served locally through the Workers runtime (stop it afterwards)
  push this branch    → GitHub Actions "check" green and a preview URL printed

When everything passes: in docs/product/06-build-plan.md set the Step 03 row in §3 to ✅ with today's date in "Done", and append a Session log entry under Step 03 (date, what was built, pass/fail per verification command, the preview URL, deviations, follow-ups including the preview-database question). Then commit all changes with the message "Step 03: CI pipeline & Cloudflare deploy".

If anything above is ambiguous, if a referenced section doesn't contain what this prompt says it does, or if completing this step would require touching a file outside the list, adding a package not listed, or making a decision the referenced documents don't settle — STOP and ask. Do not choose a reasonable default. Do not proceed with a partial implementation.
```

#### Session log
_(empty — append after the step runs)_

---

### Step 04 — Schema: accounts, reference & billing tables

| | |
|---|---|
| **Status** | ⬜ not started |
| **Outcome** | Migrations create `profiles`, `cities`, `plans`, `app_settings`, `subscriptions`, `subscription_payments`, `payment_webhook_events`, `data_exports`, `r2_deletion_queue` with RLS, the `profiles.email` sync trigger, and the `is_premium(user)` helper; a local-only seed provides Serbian cities and test users including one Premium user; pgTAP proves it. |
| **Implements** | Tables `profiles`, `cities`, `plans`, `app_settings`, `subscriptions`, `subscription_payments`, `payment_webhook_events`, `data_exports`, `r2_deletion_queue` (TC §5.1, §5.5 `app_settings`, §5.7); BR-07, BR-14b, BR-30, BR-31 (data side); API §5.6 "Premium active" definition; ADR-02 |
| **Depends on** | Step 02 |
| **Blocked by** | — (prices stay out: OQ-03) |
| **Track** | single |

**Read before starting:** `docs/product/03-technical-constraints.md` §5 (conventions), §5.1 (`profiles`, `subscriptions`, `subscription_payments`, `plans`), §5.5 (`app_settings`), §5.7 (`r2_deletion_queue`, `payment_webhook_events`, `data_exports`, `cities`), §5.9 · `docs/product/02-prd.md` §8 (BR-07, BR-14b, BR-29, BR-30, BR-31) · `docs/product/05-api-integration-contract.md` §3.1, §4.1–§4.4, §5.5 (EP-41, EP-43, EP-44), §5.6 intro + EP-47, EP-50, EP-51, §5.8 (EP-67, EP-71), §6 (Me, Entitlements, Plan, Subscription, DataExport, City, AppSettings), §7.1, §7.2 · `docs/product/04-design-system.md` §9 (mock-data names) · `docs/product/06-build-plan.md` §6, §7.

**Files this step may touch:**
- `supabase/migrations/*_accounts.sql`, `supabase/migrations/*_reference_data.sql`, `supabase/migrations/*_billing.sql`, `supabase/migrations/*_data_control.sql`, `supabase/migrations/*_entitlements.sql`
- `supabase/seed.sql`
- `supabase/tests/profiles.test.sql`, `supabase/tests/reference_data.test.sql`, `supabase/tests/billing.test.sql`, `supabase/tests/data_control.test.sql`, `supabase/tests/entitlements.test.sql`
- `lib/supabase/database.types.ts` (regenerated with `npm run db:types`)
- `docs/product/06-build-plan.md` (only this step's §3 row and its Session log)

**Out of bounds:** any table not listed above; any price row in `plans` (OQ-03); the `v_public_plans` view and every RPC other than `is_premium` (later steps); application code; `supabase/config.toml`.

**Acceptance criteria:** Business rules quoted verbatim from PRD §8 (data side only), plus checks derived from TC §5 and API §5.6:
- BR-30: "Each user has one account type: Owner, Shelter, or Breeder."
- BR-31: "Account deletion takes effect after a 30-day grace period during which it can be cancelled." (data side: `deletion_due_at` is `deletion_requested_at` + 30 days and clears when the request is cleared)
- BR-07: "Premium is monthly or yearly, auto-renewing, with one 7-day trial per user." (data side: plan enum, `auto_renew`, `trial_used`)
- BR-14b: "The Viber channel is built but hidden until the Operator switches it on; while it is off, users cannot select Viber." (data side: `app_settings` holds one row with `viber_enabled = false`)
- (Derived from TC §5.1) `profiles.email` stays equal to `auth.users.email` when the auth email changes.
- (Derived from TC §5.1, §5.7) Every column, type, check, unique and partial index listed for these nine tables exists; `plans` has no rows (OQ-03).
- (Derived from TC §5, API §3.1, §4.4, EP-41, EP-43, EP-47, EP-50, EP-67, EP-71) RLS is enabled on every table; a user reads only their own `profiles`, `subscriptions`, `data_exports`; clients can write only the `profiles` columns EP-41/EP-43 allow; `cities` is readable by `anon` and `authenticated`; `app_settings`, `subscription_payments`, `payment_webhook_events`, `r2_deletion_queue` have no client write path.
- (Derived from API §5.6 intro) `is_premium(user)` is true exactly when the user has a `premium_*` subscription with status in (`trialing`, `active`, `cancelled`) and `current_period_end > now()`.
- (Derived from ADR-02, TC §8) The local seed creates Serbian cities and test users for every account type, including one Premium owner; it runs only locally.

**Tests to ship:**
- BR-30 → `supabase/tests/profiles.test.sql` (account_type enum and not null)
- BR-31 → `supabase/tests/profiles.test.sql` (`deletion_due_at` derivation)
- BR-07 → `supabase/tests/billing.test.sql` (plan enum values, `auto_renew` default, `trial_used` default false)
- BR-14b → `supabase/tests/reference_data.test.sql` (single row, `viber_enabled = false`)
- email sync → `supabase/tests/profiles.test.sql`
- columns/checks/indexes, empty `plans` → `supabase/tests/billing.test.sql`, `supabase/tests/reference_data.test.sql`, `supabase/tests/data_control.test.sql`
- RLS and column grants → `supabase/tests/profiles.test.sql`, `supabase/tests/billing.test.sql`, `supabase/tests/reference_data.test.sql`, `supabase/tests/data_control.test.sql` (each table in its file)
- `is_premium` truth table → `supabase/tests/entitlements.test.sql`
- seed → `supabase/tests/reference_data.test.sql` (cities present) and `supabase/tests/entitlements.test.sql` (the seeded Premium owner is premium, the seeded Free owner is not)

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

Read first, in full: docs/product/03-technical-constraints.md §5 (conventions block), §5.1 (profiles, subscriptions, subscription_payments, plans), §5.5 (app_settings only), §5.7 (r2_deletion_queue, payment_webhook_events, data_exports, cities), §5.9; docs/product/02-prd.md §8 (BR-07, BR-14b, BR-29, BR-30, BR-31); docs/product/05-api-integration-contract.md §3.1, §4.1–§4.4, EP-41, EP-43, EP-44 (§5.5), the §5.6 intro and EP-47, EP-50, EP-51, EP-67 and EP-71 (§5.8), §6 schemas Me, Entitlements, Plan, Subscription, DataExport, City, AppSettings, and §7.1–§7.2; docs/product/04-design-system.md §9 (mock-data names); docs/product/06-build-plan.md §6 and §7.

Goal: these nine tables, their RLS, the email sync trigger and is_premium(user) — and nothing else.

Do exactly this:
1. Migrations (one file per name, created with the Supabase CLI so they carry a timestamp prefix):
   - *_accounts.sql — the shared updated_at trigger function used by every table (TC §5 conventions); enums needed by profiles; table profiles exactly per TC §5.1 (FK to auth.users on delete cascade; deletion_due_at = deletion_requested_at + 30 days, null when no request; index on deletion_due_at); a trigger that copies auth.users.email into profiles.email whenever the auth email changes.
   - *_reference_data.sql — cities per TC §5.7; app_settings per TC §5.5 holding exactly one row with viber_enabled = false (inserted by the migration, so production has it too) and a guard so a second row cannot exist.
   - *_billing.sql — plan and status enums; plans, subscriptions (with the unique partial index of TC §5.1), subscription_payments, payment_webhook_events (unique provider + event_id). Insert no plan rows — prices are OQ-03.
   - *_data_control.sql — data_exports and r2_deletion_queue per TC §5.7.
   - *_entitlements.sql — function is_premium(user uuid) returning boolean, implementing exactly the "Premium active" definition in the 05- §5.6 intro. Stable, callable from RLS and triggers in later steps.
2. RLS on every table, derived only from the authorization lines of the EPs listed above and API §3.1/§4.4:
   - profiles: a user selects only their own row; insert of the own row (id = auth.uid()) and update are limited by column grants to exactly the columns EP-41 complete_registration writes and EP-43 update allows; is_operator, trial_used and the deletion columns are never client-writable (EP-51 is a server action — leave its write path to its step).
   - cities: select for anon and authenticated (EP-67); no client writes.
   - plans: select for anon and authenticated (EP-44); no client writes.
   - subscriptions: a user selects only their own rows (EP-47); no client writes.
   - subscription_payments, payment_webhook_events, r2_deletion_queue: no client access.
   - data_exports: a user selects only their own rows (EP-50); no client writes.
   - app_settings: Operator (profiles.is_operator) select and update (EP-71); no other client access.
   Where 05- names a specific error code for a denied write, raise it as 05- §7.1 specifies (ERRCODE P0001, MESSAGE = the code); where 05- says "no relation", the row is simply invisible.
3. supabase/seed.sql (local only, runs on npx supabase db reset): the Serbian cities that appear in docs/product/04-design/screens and components (Novi Sad, Beograd, Bečej, Kragujevac, Kraljevo, Niš, Sombor, Subotica, Zrenjanin) with name_sr, name_en and their public coordinates (write the coordinate source in a seed comment); test users in auth.users plus their profiles — a Free owner, a Premium owner (with a premium_monthly subscription row, status active, current_period_end in the future), a second owner for household tests, a shelter user, a breeder user, and an Operator (is_operator = true) — named per docs/product/04-design-system.md §9 mock-data rules, with one local-only password stated in the seed header comment. Later schema steps append to this file.
4. Run npm run db:types to regenerate lib/supabase/database.types.ts.
5. Write the pgTAP tests listed below.

Do not invent: no tables, columns, enums, indexes or functions outside docs/product/03-technical-constraints.md §5 and the is_premium helper named here; no endpoints, RPCs, fields or error codes outside docs/product/05-api-integration-contract.md; no plan prices; no Postgres extensions beyond what the Supabase CLI provides by default; no libraries outside docs/product/03-technical-constraints.md §4.

Files you may create or modify — nothing else:
supabase/migrations/*_accounts.sql, supabase/migrations/*_reference_data.sql, supabase/migrations/*_billing.sql, supabase/migrations/*_data_control.sql, supabase/migrations/*_entitlements.sql, supabase/seed.sql, supabase/tests/profiles.test.sql, supabase/tests/reference_data.test.sql, supabase/tests/billing.test.sql, supabase/tests/data_control.test.sql, supabase/tests/entitlements.test.sql, lib/supabase/database.types.ts, and docs/product/06-build-plan.md (only the Step 04 row in §3 and the Step 04 Session log).

Acceptance criteria (verbatim from the PRD, data side only; then derived checks):
- BR-30: "Each user has one account type: Owner, Shelter, or Breeder."
- BR-31: "Account deletion takes effect after a 30-day grace period during which it can be cancelled." (data side: deletion_due_at derivation)
- BR-07: "Premium is monthly or yearly, auto-renewing, with one 7-day trial per user." (data side: plan enum, auto_renew, trial_used)
- BR-14b: "The Viber channel is built but hidden until the Operator switches it on; while it is off, users cannot select Viber." (data side: app_settings single row, viber_enabled false)
- Derived from TC §5.1: profiles.email follows auth.users.email.
- Derived from TC §5.1/§5.7: every listed column, type, check, unique and partial index exists; plans is empty.
- Derived from API §3.1/§4.4 and the EPs above: RLS and column grants as in step 2.
- Derived from API §5.6 intro: is_premium truth table.
- Derived from ADR-02/TC §8: seed creates cities and all test users including one Premium owner.

Tests to write (pgTAP, one assertion group per criterion):
- supabase/tests/profiles.test.sql — BR-30 enum/not null; BR-31 deletion_due_at derivation and clearing; email sync trigger; profiles RLS (own row only) and column grants (is_operator, trial_used, deletion columns not writable by authenticated).
- supabase/tests/reference_data.test.sql — cities columns, anon/authenticated read, no client write, seeded cities present; app_settings single row, viber_enabled false, second row rejected, Operator-only access.
- supabase/tests/billing.test.sql — BR-07 data side; plans columns/checks and zero rows; subscriptions unique partial index; subscription_payments checks and unique transaction id; payment_webhook_events uniqueness; RLS (own subscriptions only, no client writes, payments and webhook events invisible).
- supabase/tests/data_control.test.sql — data_exports columns and own-row read; r2_deletion_queue invisible to clients.
- supabase/tests/entitlements.test.sql — is_premium true for trialing/active/cancelled with future current_period_end; false for expired, payment_failed, past current_period_end, breeder plans, no subscription; seeded Premium owner true, seeded Free owner false.

Done means all of these pass, in this order:
  npx supabase db reset → migrations and seed apply cleanly
  npm run db:types      → exit 0
  npm run typecheck     → exit 0
  npm run lint          → exit 0
  npm test              → all test files pass
  npx supabase test db  → all pgTAP files pass
  npm run build         → exit 0

When everything passes: in docs/product/06-build-plan.md set the Step 04 row in §3 to ✅ with today's date in "Done", and append a Session log entry under Step 04 (date, what was built, pass/fail per verification command, deviations, follow-ups). Then commit all changes with the message "Step 04: Schema: accounts, reference & billing tables".

If anything above is ambiguous, if a referenced section doesn't contain what this prompt says it does, or if completing this step would require touching a file outside the list, a column or table not in 03- §5, or a decision the referenced documents don't settle — STOP and ask. Do not choose a reasonable default. Do not proceed with a partial implementation.
```

#### Session log
_(empty — append after the step runs)_

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

**Read before starting:** `docs/product/03-technical-constraints.md` §5 (conventions), §5.1 (`households`, `household_memberships`, `household_invitations`), §5.2 · `docs/product/02-prd.md` §8 (BR-19, BR-20, BR-24, BR-25, BR-28, BR-32, BR-34, BR-46, BR-47, BR-51, BR-52) · `docs/product/05-api-integration-contract.md` §3.1, §4.1–§4.4, §5.4 (EP-34 … EP-40), §5.5 (EP-41 side effects), §5.7 intro + EP-53, EP-56, EP-72, §5.8 (EP-68), §6 (Household, HouseholdMember, HouseholdInvitation, InvitationView, Organisation, OrganisationMember, OrganisationInvitation, PendingOrganisation), §7.1, §7.2 · `docs/product/06-build-plan.md` §6.

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

Read first, in full: docs/product/03-technical-constraints.md §5 (conventions), §5.1 (households, household_memberships, household_invitations) and §5.2; docs/product/02-prd.md §8 (BR-19, BR-20, BR-24, BR-25, BR-28, BR-32, BR-34, BR-46, BR-47, BR-51, BR-52); docs/product/05-api-integration-contract.md §3.1, §4.1–§4.4, §5.4 (EP-34 … EP-40), EP-41 side effects (§5.5), the §5.7 intro and EP-53, EP-56, EP-72, EP-68 (§5.8), §6 schemas Household, HouseholdMember, HouseholdInvitation, InvitationView, Organisation, OrganisationMember, OrganisationInvitation, PendingOrganisation, and §7.1–§7.2; docs/product/06-build-plan.md §6.

Goal: the six household and organisation tables, their RLS and the four rules below — nothing else.

Do exactly this:
1. *_households.sql — enums and tables households, household_memberships, household_invitations exactly per TC §5.1 (household_pets is NOT created here — it needs pets, Step 06). Triggers:
   - one household per owner (the unique owner_id of TC §5.1);
   - household size: the owner has no membership row (EP-38), so owner + memberships may not exceed 6 (BR-20, BR-51); an insert that would exceed it raises household_full per 05- §7.1 (ERRCODE P0001, MESSAGE = code);
   - read_only maintenance: households.read_only = not is_premium(owner_id), recomputed when a household is created and when any subscriptions row of its owner is inserted or updated (BR-19, BR-28). Time-based expiry without a row change is handled by the Step 30 nightly job — do not schedule anything here.
2. *_organisations.sql — enums and tables organisations, organisation_memberships, organisation_invitations exactly per TC §5.2. Triggers:
   - approval_status on insert follows BR-32 (shelter → pending, breeder → approved) as TC §5.2 states;
   - team size: at most 20 organisation_memberships per organisation (BR-34); an insert that would exceed it raises team_full (05- §7.1).
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

Do not invent: no tables, columns, enums or indexes outside docs/product/03-technical-constraints.md §5.1–§5.2; no BR-27/BR-46 succession logic (Step 30); no last-admin rule (Step 24); no RPCs (EP-34, EP-53 belong to their steps); no endpoints, fields or error codes outside docs/product/05-api-integration-contract.md; no libraries outside docs/product/03-technical-constraints.md §4.

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
_(empty — append after the step runs)_

---

### Step 06 — Schema: pets & health record

| | |
|---|---|
| **Status** | ⬜ not started |
| **Outcome** | Migrations create `pets`, `household_pets`, `memorial_records`, `weight_entries`, `vaccinations`, `treatments`, `dose_logs`, `vet_visits`, `attachments` with RLS for owners, household members, and organisation roles, the Free-limit triggers, weight-unit conversion, `created_by` handling, and R2-key queuing on delete; pgTAP proves it. |
| **Implements** | Tables `pets`, `household_pets`, `memorial_records`, `weight_entries`, `vaccinations`, `treatments`, `dose_logs`, `vet_visits`, `attachments` (TC §5.1, §5.3); BR-01 (pets, memorials, attachments), BR-02, BR-03, BR-05, BR-21, BR-22, BR-23, BR-25, BR-26, BR-33, BR-50 |
| **Depends on** | Step 05 |
| **Blocked by** | — (see the error-carrier check in the prompt) |
| **Track** | single |

**Read before starting:** `docs/product/03-technical-constraints.md` §5 (conventions), §5.1 (`household_pets`), §5.3, §5.9 · `docs/product/02-prd.md` §8 (BR-01, BR-02, BR-03, BR-05, BR-21, BR-22, BR-23, BR-25, BR-26, BR-28, BR-33, BR-34, BR-50), §9 (E-02, E-03, E-04, E-12, E-26) · `docs/product/05-api-integration-contract.md` §3.1, §4.1–§4.4, §5.1 (EP-01 … EP-15), §5.4 (EP-37), §5.7 intro, §6 (Access, PetSummary, Pet, PetRecord, WeightEntry, Vaccination, Treatment, DoseLog, VetVisit, Attachment, MemorialRecord), §7.1, §7.2, §10 · `docs/product/06-build-plan.md` §6.

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

Read first, in full: docs/product/03-technical-constraints.md §5 (conventions), §5.1 (household_pets), §5.3 and §5.9; docs/product/02-prd.md §8 (BR-01, BR-02, BR-03, BR-05, BR-21, BR-22, BR-23, BR-25, BR-26, BR-28, BR-33, BR-34, BR-50) and §9 (E-02, E-03, E-04, E-12, E-26); docs/product/05-api-integration-contract.md §3.1, §4.1–§4.4, §5.1 (EP-01 … EP-15), EP-37 (§5.4), the §5.7 intro, §6 schemas Access, PetSummary, Pet, PetRecord, WeightEntry, Vaccination, Treatment, DoseLog, VetVisit, Attachment, MemorialRecord, §7.1, §7.2 and §10; docs/product/06-build-plan.md §6.

Blocker check before writing any trigger: 05- §7.1 says database rules raise ERRCODE P0001 with MESSAGE = the code, and §7.2 says premium_required carries details.limit (pets, memorials, attachments). If §7.1 does not state where details.limit travels in a database error, STOP and ask for a change request to docs/product/05-api-integration-contract.md — do not choose a carrier yourself.

Goal: the nine pet and health-record tables, their RLS and the rules below — nothing else.

Do exactly this:
1. *_pets.sql — enums and table pets exactly per TC §5.3, including litter_id as a plain nullable uuid column (its FK to litters is added in Step 09); the owner XOR organisation check; the species_other check; the indexes of TC §5.3. memorial_records per TC §5.3. household_pets per TC §5.1. A shared trigger function that sets created_by = auth.uid() on insert and refuses a null author at creation (TC §5 conventions); FKs to profiles with on delete set null.
2. *_health_record.sql — weight_entries, vaccinations, treatments, dose_logs (occurrence_id as a nullable uuid column, unique when not null; its FK to reminder_occurrences is added in Step 08), vet_visits, attachments (mime and size checks, pet_id denormalised) exactly per TC §5.3. created_by triggers on every entry table. BR-50: changing pets.weight_unit converts every existing weight_entries.value of that pet. R2 queue: deleting an attachments row, or a pets row (including the rows its cascade removes), inserts every affected r2_key / photo_r2_key into r2_deletion_queue (TC §5.9, 05- §10 step 7).
3. *_pet_limits.sql — Free-limit triggers for personally owned pets only (organisation pets have no limit, BR-33), using is_premium(owner) from Step 04:
   - insert of an active pet, or a memorial → active restore, when the owner already has 1 active pet and is not Premium → premium_required, limit pets (BR-01, BR-03, E-03, E-26);
   - a pet becoming memorial when the owner already has 2 memorials and is not Premium → premium_required, limit memorials (E-02);
   - an 11th attachment on a pet whose owner is not Premium → premium_required, limit attachments (E-04).
   Raise per 05- §7.1 (see the blocker check above).
4. RLS on all nine tables, derived only from 05- §4.4 and the authorization lines of EP-01 … EP-15 and EP-37:
   - Owner: full access to own pets and their entries; only the owner deletes a pet (BR-25); only the owner writes household_pets for own pets in own household (BR-21, EP-37).
   - Member (pet shared through household_pets with a household the user belongs to): select the pet and every entry; insert weight_entries and dose_logs; update/delete only rows they created (BR-22, BR-23, E-12); everything else view-only. When the household is read_only, member writes raise household_read_only (BR-28).
   - OrgAdmin / Volunteer: full read and write on their organisation's pets and entries; pet deletion Admin only (BR-34); writes on a pending or rejected organisation raise organisation_pending_approval (05- §4.1 gate 4, §5.7 intro).
   - No relation: rows invisible (05- §4.3).
   Where 05- names a specific error code for a denied write (forbidden_role, household_read_only, organisation_pending_approval), raise it per §7.1 rather than relying on a silent RLS denial.
5. supabase/seed.sql — append pets from docs/product/04-design-system.md §9 (Luna, Maks, Kiki) for the seeded owners with a few weight entries, vaccinations, a treatment and a vet visit; share one pet into the seeded household; one animal for the seeded shelter organisation.
6. Run npm run db:types.
7. Write the pgTAP tests listed below.

Do not invent: no tables, columns, enums or indexes outside docs/product/03-technical-constraints.md §5.1/§5.3; no reminder logic (Step 08); no endpoints, RPCs, fields or error codes outside docs/product/05-api-integration-contract.md; no Postgres extensions; no libraries outside docs/product/03-technical-constraints.md §4.

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
_(empty — append after the step runs)_

---

### Step 07 — Schema: care log & moments

| | |
|---|---|
| **Status** | ⬜ not started |
| **Outcome** | Migrations create `feeding_entries`, `stool_entries`, `moments`, `moment_photos`, `moment_public_links` with RLS (members add their own entries and moments), the Free moment limit, the 5-photo rule, and R2-key queuing; pgTAP proves it. |
| **Implements** | Tables `feeding_entries`, `stool_entries`, `moments`, `moment_photos`, `moment_public_links` (TC §5.4); BR-01 (moments), BR-02, BR-04, BR-06, BR-22, BR-23, BR-24 (Free rules for members), BR-45, BR-52 (moment text) |
| **Depends on** | Step 06 |
| **Blocked by** | — (same error-carrier check as Step 06) |
| **Track** | single |

**Read before starting:** `docs/product/03-technical-constraints.md` §5 (conventions), §5.4, §5.9 · `docs/product/02-prd.md` §8 (BR-01, BR-02, BR-04, BR-06, BR-22, BR-23, BR-24, BR-28, BR-45, BR-52), §9 (E-07, E-08, E-12) · `docs/product/05-api-integration-contract.md` §3.1, §4.3, §4.4, §5.2 (EP-17 … EP-24), §6 (FeedingEntry, StoolEntry, MealSchedule, Moment, MomentPhoto, PublicMoment), §7.1, §7.2, §10 · `docs/product/06-build-plan.md` §6.

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

Read first, in full: docs/product/03-technical-constraints.md §5 (conventions), §5.4 and §5.9; docs/product/02-prd.md §8 (BR-01, BR-02, BR-04, BR-06, BR-22, BR-23, BR-24, BR-28, BR-45, BR-52) and §9 (E-07, E-08, E-12); docs/product/05-api-integration-contract.md §3.1, §4.3, §4.4, §5.2 (EP-17 … EP-24), §6 schemas FeedingEntry, StoolEntry, MealSchedule, Moment, MomentPhoto, PublicMoment, §7.1, §7.2 and §10; docs/product/06-build-plan.md §6.

Blocker check: use the same database-error mechanism Step 06 used for premium_required with details.limit (look at its migrations). If Step 06 is not done or its mechanism is missing, STOP.

Goal: the five care-log and moment tables, their RLS and the rules below — nothing else.

Do exactly this:
1. *_care_log.sql — enums and tables feeding_entries and stool_entries exactly per TC §5.4, with the created_by trigger function from Step 06. No count limit (BR-04).
2. *_moments.sql — moments, moment_photos (position 1–5, unique moment_id + position, BR-06), moment_public_links (moment_id unique, slug unique and not null, active default true; cascade-deleted with the moment, BR-45) exactly per TC §5.4. Moment text at most 280 characters (BR-52). Free limit: inserting a 6th moment on a pet when the creator (created_by) is not Premium raises premium_required, limit moments (BR-01, BR-24; EP-21 "the creator has no Premium"). R2 queue: deleting a moment_photos row (directly or by cascade) inserts its r2_key into r2_deletion_queue.
3. RLS on all five tables, derived only from 05- §4.4 and the authorization lines of EP-17 … EP-23:
   - Owner of a personal pet: full access.
   - Member of a household the pet is shared with: select all rows of the pet; insert feeding, stool, moments, moment photos and public links for own moments; update/delete only own rows (BR-22, BR-23, E-12). Writes while the household is read_only raise household_read_only (EP-21 … EP-23).
   - Organisation roles: no access (05- §4.4 "—").
   - No relation: invisible.
   - Public moment reads happen only through the Step 21 route with the service role — no anon policy.
   Where 05- names a specific error code for a denied write, raise it per §7.1.
4. supabase/seed.sql — append a few feeding and stool entries and two moments (one with a public link) for a seeded pet.
5. Run npm run db:types.
6. Write the pgTAP tests listed below.

Do not invent: no tables, columns, enums or indexes outside docs/product/03-technical-constraints.md §5.4; no views or RPCs (moments_api, EP-19, EP-24 belong to later steps); no endpoints, fields or error codes outside docs/product/05-api-integration-contract.md; no Postgres extensions; no libraries outside docs/product/03-technical-constraints.md §4.

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
_(empty — append after the step runs)_

---

### Step 08 — Schema: reminders & delivery

| | |
|---|---|
| **Status** | ⬜ not started |
| **Outcome** | Migrations create `reminders`, `reminder_occurrences`, `reminder_deliveries`, `reminder_preferences`, `push_subscriptions`, `user_channels`; triggers create and maintain reminders from vaccinations, treatments, vet visits, birthdays, and memorials; an occurrence-generation function fills a rolling 60-day window per lead time in Europe/Belgrade time; default preferences exist for every profile; pgTAP proves it. |
| **Implements** | Tables `reminders`, `reminder_occurrences`, `reminder_deliveries`, `reminder_preferences`, `push_subscriptions`, `user_channels` (TC §5.5); FR-20 and FR-05 (database side); BR-12, BR-13, BR-17, BR-18, BR-48, BR-49, BR-51 (no organisation reminders); NFR-02; ADR-04 (data side) |
| **Depends on** | Step 07 |
| **Blocked by** | — |
| **Track** | single |

**Read before starting:** `docs/product/03-technical-constraints.md` §3 (ADR-04, ADR-05), §5 (conventions), §5.3 (`dose_logs`), §5.5, §7 (NFR-01, NFR-02 rows), §8 (scheduled jobs) · `docs/product/02-prd.md` §6 (FR-05, FR-06, FR-07, FR-09, FR-15, FR-20, FR-21, FR-22, FR-29), §8 (BR-12 … BR-18, BR-24, BR-48, BR-49, BR-51), §9 (E-01), §10 (NFR-02) · `docs/product/05-api-integration-contract.md` §3.5, §4.4, §5.3 intro ("Occurrence instances"), EP-25, EP-26, EP-27, EP-28, EP-29, EP-30 (side effects), EP-33 (claim and index use), §6 (ReminderOccurrence, Reminder, ReminderPreference, PushSubscription, WhatsAppConnection, ChannelUsage), §7.1, §7.2 · `docs/product/06-build-plan.md` §6.

**Files this step may touch:**
- `supabase/migrations/*_reminders.sql`, `supabase/migrations/*_reminder_triggers.sql`, `supabase/migrations/*_reminder_occurrences.sql`, `supabase/migrations/*_delivery_channels.sql`
- `supabase/seed.sql` (append only)
- `supabase/tests/reminders.test.sql`, `supabase/tests/reminder_triggers.test.sql`, `supabase/tests/reminder_occurrences.test.sql`, `supabase/tests/reminder_preferences.test.sql`, `supabase/tests/reminder_rls.test.sql`, `supabase/tests/delivery_channels.test.sql`
- `lib/supabase/database.types.ts` (regenerated)
- `docs/product/06-build-plan.md` (only this step's §3 row and its Session log)

**Out of bounds:** RPCs `list_reminder_occurrences`, `mark_occurrence_done`, `get_reminder_settings`, `register_push_subscription`, `get_channel_usage`, `claim_due_occurrences` (Steps 17–19); pg_cron schedules of any kind (Step 19 dispatch; nightly window refresh in Step 30); memorial restore re-enabling (Step 16); meal schedule operation EP-19 (Step 20); application code.

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

Goal: the six reminder and delivery tables, the triggers that create reminders from records, the occurrence-generation function, default preferences and RLS — nothing else. No RPCs for screens or the dispatch job, no pg_cron schedule.

Do exactly this:
1. *_reminders.sql — enums and tables reminders and reminder_preferences exactly per TC §5.5, with the index on source_id and the unique partial index "one meal schedule per pet". Add the FK from dose_logs.occurrence_id to reminder_occurrences once that table exists (in *_reminder_occurrences.sql).
2. *_reminder_occurrences.sql — reminder_occurrences and reminder_deliveries exactly per TC §5.5 with their partial and plain indexes. An occurrence-generation function that, for one reminder, deletes its future pending rows and regenerates them inside the rolling 60-day window: one row per lead time from the owner's reminder_preferences for that type (lead_minutes, delivery_time), lead 0 at the exact scheduled time for treatment_dose and meal (BR-13), recurrence and interval per TC §5.5, meal_times × meal_weekdays for meal, all computed in Europe/Belgrade and stored as UTC (NFR-02, TC §5 conventions). Done and missed rows are never touched. Instances share (reminder_id, due_at) per the 05- §5.3 intro. Call it from reminders insert/update and from reminder_preferences changes (EP-27, EP-28 side effects). It must also be callable for all reminders, for the nightly refresh a later step schedules — do not schedule it here.
3. *_reminder_triggers.sql — triggers on personally owned pets only (organisation animals get none, BR-51), reminders.user_id = the pet's owner:
   - vaccinations: next_due_on set → vaccination reminder (source_id = vaccination id); changed → updated; cleared or row deleted → removed (FR-05, E-01).
   - treatments: interval set → treatment_dose reminder, first dose per BR-49, repeating every interval until ends_on; changed → updated; deleted → removed.
   - vet_visits: follow_up_on set → vet_follow_up reminder; changed/cleared/deleted accordingly.
   - pets: birth_date set → yearly birthday reminder; changed/cleared accordingly.
   - memorial: a pet becoming memorial sets active = false on all its reminders and removes their pending occurrences (BR-17). Re-enabling on restore is Step 16 — do not add it.
   - profiles insert → the six reminder_preferences rows with the BR-48 defaults (lead_minutes per 05- EP-28 value set, delivery_time 09:00 except treatment_dose and meal, channels email + push).
4. *_delivery_channels.sql — push_subscriptions and user_channels exactly per TC §5.5.
5. RLS on all six tables, derived only from 05- §4.4 and the authorization lines of EP-25 … EP-30:
   - reminders: owner selects own; inserts/updates/deletes only type manual (EP-27; other types are written by triggers only); user_id defaults to auth.uid() and cannot be set; shelter/breeder accounts cannot insert (EP-27 forbidden_role).
   - reminder_occurrences: owner selects occurrences of own reminders; a household member selects occurrences of reminders on pets shared with a household where their reminders_enabled = true (EP-25); no direct client writes (done marking is EP-26's RPC in Step 17).
   - reminder_deliveries: recipient selects own rows; no client writes.
   - reminder_preferences, push_subscriptions: self only (EP-28, EP-29).
   - user_channels: self select; no client writes (EP-30 server action).
   - Organisation roles and Operator see no personal reminders (EP-25).
   Where 05- names a specific error code for a denied write, raise it per §7.1.
6. supabase/seed.sql — append one manual reminder for a seeded owner; seeded vaccinations/treatments now produce reminders through the triggers.
7. Run npm run db:types.
8. Write the pgTAP tests listed below.

Do not invent: no tables, columns, enums or indexes outside docs/product/03-technical-constraints.md §5.5 (plus the dose_logs FK of §5.3); no RPCs named in 05- (they belong to Steps 17–19); no pg_cron or pg_net usage; no endpoints, fields or error codes outside docs/product/05-api-integration-contract.md; no libraries outside docs/product/03-technical-constraints.md §4.

Files you may create or modify — nothing else:
supabase/migrations/*_reminders.sql, supabase/migrations/*_reminder_occurrences.sql, supabase/migrations/*_reminder_triggers.sql, supabase/migrations/*_delivery_channels.sql, supabase/seed.sql, supabase/tests/reminders.test.sql, supabase/tests/reminder_triggers.test.sql, supabase/tests/reminder_occurrences.test.sql, supabase/tests/reminder_preferences.test.sql, supabase/tests/reminder_rls.test.sql, supabase/tests/delivery_channels.test.sql, lib/supabase/database.types.ts, and docs/product/06-build-plan.md (only the Step 08 row in §3 and the Step 08 Session log).

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
- Derived from API §4.4/EP-25 … EP-30: RLS as in step 5.

Tests to write (pgTAP):
- supabase/tests/reminders.test.sql — reminders and reminder_preferences structure, unique meal schedule per pet, source_id index; BR-18 manual reminder with and without pet, recurrence values, hourly_interval rejected for manual; dose_logs.occurrence_id FK.
- supabase/tests/reminder_triggers.test.sql — FR-20/BR-12 each source creates its reminder; FR-05/E-01 update and removal; BR-49 first-dose time both cases; BR-17 memorial deactivates and clears pending; BR-51 organisation pets create no reminders.
- supabase/tests/reminder_occurrences.test.sql — BR-13 one row per lead time at delivery_time, doses and meals exact time; NFR-02 08:00 Belgrade before and after a DST change; 60-day window bound; regeneration replaces future pending rows only.
- supabase/tests/reminder_preferences.test.sql — BR-48 six default rows on profile creation with exact values.
- supabase/tests/reminder_rls.test.sql — owner sees own; opted-in member sees shared-pet occurrences, not-opted-in member sees none; organisation roles see none; only manual reminders are client-writable; shelter/breeder insert refused with forbidden_role.
- supabase/tests/delivery_channels.test.sql — reminder_deliveries, push_subscriptions, user_channels structure and uniques; self-only access; no client writes to deliveries and user_channels.

Done means all of these pass, in this order:
  npx supabase db reset → migrations and seed apply cleanly
  npm run db:types      → exit 0
  npm run typecheck     → exit 0
  npm run lint          → exit 0
  npm test              → all test files pass
  npx supabase test db  → all pgTAP files pass
  npm run build         → exit 0

When everything passes: in docs/product/06-build-plan.md set the Step 08 row in §3 to ✅ with today's date in "Done", and append a Session log entry under Step 08 (date, what was built, pass/fail per verification command, deviations, follow-ups — state that the nightly 60-day refresh still needs a schedule). Then commit all changes with the message "Step 08: Schema: reminders & delivery".

If anything above is ambiguous, if a referenced section doesn't contain what this prompt says it does, or if completing this step would require touching a file outside the list, a column or table not in 03- §5, or a decision the referenced documents don't settle — STOP and ask. Do not choose a reasonable default. Do not proceed with a partial implementation.
```

#### Session log
_(empty — append after the step runs)_

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

**Out of bounds:** `list_org_animals`, `list_org_requests`, `list_litters`, `get_partner`, admin statistics RPCs and every server action (Steps 24–28); transfer copy logic (Step 25); public cached routes (Steps 26–27); Nominatim (Step 28); application code.

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
2. *_partners.sql — enums and tables partners, partner_hours, partner_clicks exactly per TC §5.7, with the index of TC §5.7. Trigger limiting featured = true to 3 per (city_id, type) (BR-41); exceeding raises featured_limit_reached per 05- §7.1 (ERRCODE P0001, MESSAGE = code).
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
   Where 05- names a specific error code for a denied write, raise it per §7.1.
5. supabase/seed.sql — append partners from docs/product/04-design-system.md §9 (Veterinarska ambulanta „Dr Vet", Pet shop „Šapica", Grooming salon „Čupko", Pet hotel „Kod Mace") in the seeded cities with hours, one featured, one with paid_until in the past; an intake and a status change for the seeded shelter animal; one adoption request.
6. Run npm run db:types.
7. Write the pgTAP tests listed below.

Do not invent: no tables, columns, enums or indexes outside docs/product/03-technical-constraints.md §5.6–§5.7 (plus the pets.litter_id FK); no RPCs other than partners_nearby and record_partner_click; no Postgres extensions; no endpoints, fields or error codes outside docs/product/05-api-integration-contract.md; no libraries outside docs/product/03-technical-constraints.md §4.

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
_(empty — append after the step runs)_

---

### Step 10 — Design foundation

| | |
|---|---|
| **Status** | ⬜ not started |
| **Outcome** | The design tokens, Nunito and Inter fonts, every shadcn primitive from Design §6 with the two project overrides, all approved composites in `components/app/`, the brand assets, and a web app manifest exist; tests prove the tokens resolve and that no raw hex value or brand icon appears outside `app/globals.css`. |
| **Implements** | Design System §4, §5, §6, §7, §8 (foundation only); ADR-14; ADR-05 (home-screen install prerequisite: manifest and icons) |
| **Depends on** | Step 01 |
| **Blocked by** | — (proposed composites stay out: OQ-10) |
| **Track** | single |

**Read before starting:** `docs/product/04-design-system.md` §3 (logo files), §4 (all), §5, §6 (component inventory, install commands, overrides, composites, known prohibition), §7, §8, §10 · `docs/product/04-design/README.md` · `docs/product/04-design/globals.css` · `docs/product/04-design/ui-overrides/card.tsx`, `sonner.tsx` · `docs/product/04-design/components/*.tsx` · `docs/product/03-technical-constraints.md` §3 (ADR-05, ADR-14) · `docs/product/06-build-plan.md` §6.

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
- (Design §4.1, §4 intro) No raw hex colour value appears in application source outside `app/globals.css`.
- (Design §4.2) Nunito 700 and Inter 400/500/600 load through `next/font/google` with subsets `latin` and `latin-ext`, exposed as `--font-nunito` and `--font-inter`.
- (Design §6, ADR-14) Every shadcn primitive in the §6 inventory is installed in `components/ui/`, and `card.tsx` and `sonner.tsx` carry the project overrides from `04-design/ui-overrides/`.
- (Design §6) Every approved composite from `04-design/components/` (all except `StateSwitcher`) exists in `components/app/` with its markup and tokens unchanged.
- (Design §6 "Known prohibition") No lucide brand icon is imported anywhere.
- (Design §3, ADR-05) The brand assets are served from `/brand/`, and a web app manifest names "Moj Ljubimac" with the 192 px and 512 px app icons; the 180 px icon is the Apple touch icon.
- (Design §7, §10) Composites with logic behave as specified: `PetAvatar` shows photo, species icon, or initial; `StatusBadge` always carries text; `PremiumLock` shows the single Premium-locked pattern; `ReadOnlyBanner` shows the `Eye` icon and reason; `ReminderTypeIcon` maps each reminder type to its icon; `AppShell` renders a labelled navigation.

**Tests to ship:**
- tokens resolve → `tests/design/tokens.test.ts`
- no raw hex → `tests/design/no-raw-hex.test.ts`
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

Read first, in full: docs/product/04-design-system.md §3 (logo files), §4, §5, §6 (inventory, install commands, project overrides, custom composites, known prohibition), §7, §8 and §10; docs/product/04-design/README.md; docs/product/04-design/globals.css; docs/product/04-design/ui-overrides/card.tsx and sonner.tsx; every file in docs/product/04-design/components/; docs/product/03-technical-constraints.md §3 (ADR-05, ADR-14); docs/product/06-build-plan.md §6.

Goal: the visual foundation every screen step builds on. No routes, no screens.

Do exactly this:
1. Initialise shadcn/ui for the existing Next.js + Tailwind v4 project (components.json, lib/utils.ts with the cn helper the mockups import from "@/lib/utils"). Then run exactly the install commands in docs/product/04-design-system.md §6 for: button, card, badge, avatar, tabs, input, textarea, label, select, checkbox, switch, radio-group, dialog, alert-dialog, sheet, dropdown-menu, separator, skeleton, progress, table, sonner, calendar, popover.
2. Replace app/globals.css with the exact contents of docs/product/04-design/globals.css (after shadcn init, so init cannot overwrite it).
3. Replace components/ui/card.tsx and components/ui/sonner.tsx with docs/product/04-design/ui-overrides/card.tsx and sonner.tsx.
4. app/layout.tsx: load Nunito (700) and Inter (400, 500, 600) with next/font/google, subsets latin and latin-ext, exposed as the CSS variables --font-nunito and --font-inter that app/globals.css consumes (Design §4.2); html lang = "sr-Latn" (Design §9 default locale; Step 12 makes it switchable); metadata title "Moj Ljubimac" and icons from public/brand (app-icon-192.png favicon, app-icon-180.png Apple touch icon, per Design §3). Do not mount a Toaster (OQ-10).
5. Copy docs/product/04-design/assets/logo-*.png and app-icon-*.png into public/brand/ (04-design/README.md "How to run" step 3).
6. app/manifest.ts — Next.js web app manifest: name and short_name "Moj Ljubimac", display standalone, icons app-icon-192.png and app-icon-512.png (ADR-05: iPhone push needs the home-screen install). Do not add theme or background colour fields: the only allowed colour values live in app/globals.css (Design §4) and a manifest cannot reference CSS variables — record this in the Session log as a follow-up for the design owner.
7. Port every composite from docs/product/04-design/components/ to components/app/ with the same file names — shells.tsx, empty-state.tsx, error-state.tsx, logo-mark.tsx, pet-avatar.tsx, pet-header.tsx, premium-lock.tsx, read-only-banner.tsx, reminder-row.tsx, reminder-type-icon.tsx, status-badge.tsx — keeping markup, classes and props unchanged. Only fix import paths to "@/components/app/…" and "@/components/ui/…". Do NOT port state-switcher.tsx (dev-only). Remove the hex value from the comment in logo-mark.tsx (refer to the --primary token instead) so the hex scan stays clean. Do not add any composite from the "Proposed additions" list (OQ-10).
8. Write the tests listed below.

Allowed packages: the shadcn CLI and exactly the dependencies it installs for the listed components and its init (including lucide-react, sonner, tw-animate-css, class-variance-authority, clsx, tailwind-merge, the Radix packages and the calendar's date dependencies). Nothing else; no libraries outside docs/product/03-technical-constraints.md §4. Do not invent: no colours, spacing, radii, shadows, fonts or components outside docs/product/04-design-system.md §4 and §6; no lucide brand icons (Design §6 "Known prohibition").

Files you may create, modify or delete — nothing else:
app/globals.css, app/layout.tsx, app/manifest.ts, components.json, lib/utils.ts, components/ui/{button,card,badge,avatar,tabs,input,textarea,label,select,checkbox,switch,radio-group,dialog,alert-dialog,sheet,dropdown-menu,separator,skeleton,progress,table,sonner,calendar,popover}.tsx, components/ui/.gitkeep (delete), components/app/{shells,empty-state,error-state,logo-mark,pet-avatar,pet-header,premium-lock,read-only-banner,reminder-row,reminder-type-icon,status-badge}.tsx, components/app/.gitkeep (delete), public/brand/{logo-full,logo-mark,logo-wordmark,logo-original,app-icon-180,app-icon-192,app-icon-512}.png, package.json, package-lock.json, the test files listed below, and docs/product/06-build-plan.md (only the Step 10 row in §3 and the Step 10 Session log).

Acceptance criteria (derived from Design System §4–§8 and ADR-14; no PRD FR applies):
- app/globals.css equals 04-design/globals.css; every §4.1 colour token resolves to its listed value; --pet-accent pairs follow data-pet-sex.
- No raw hex colour value in source outside app/globals.css.
- Fonts per §4.2 with latin and latin-ext.
- Every §6 primitive installed; card and sonner overrides applied.
- Every approved composite ported unchanged (StateSwitcher excluded).
- No lucide brand icon imported.
- Brand assets under /brand; manifest with name and 192/512 icons; 180 icon as Apple touch icon.
- Composite behaviour per Design §7/§8/§10 as listed in the tests.

Tests to write (Vitest + Testing Library):
- tests/design/tokens.test.ts — app/globals.css matches 04-design/globals.css; each §4.1 token is declared with its listed value; the @theme inline block maps each colour; data-pet-sex selectors set the accent pairs.
- tests/design/no-raw-hex.test.ts — scans app/, components/, lib/ (.ts, .tsx, .css) and fails on any hex colour literal outside app/globals.css.
- tests/design/no-brand-icons.test.ts — fails if any source file imports Instagram, Whatsapp, Facebook or another lucide brand icon.
- tests/design/fonts.test.ts — app/layout.tsx loads Nunito 700 and Inter 400/500/600 with latin and latin-ext and the two CSS variables.
- tests/design/ui-overrides.test.ts — every §6 primitive file exists; card.tsx and sonner.tsx equal the 04-design/ui-overrides files; every approved composite file exists in components/app/ and state-switcher.tsx does not.
- tests/design/manifest.test.ts — manifest name, display and icons; every referenced /brand file exists in public/brand.
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

When everything passes: in docs/product/06-build-plan.md set the Step 10 row in §3 to ✅ with today's date in "Done", and append a Session log entry under Step 10 (date, what was built, pass/fail per verification command, deviations, follow-ups including the manifest colour question). Then commit all changes with the message "Step 10: Design foundation".

If anything above is ambiguous, if a referenced section doesn't contain what this prompt says it does, if a ported composite needs a primitive, prop or token not in Design §4/§6, or if completing this step would require touching a file outside the list or making a decision the referenced documents don't settle — STOP and ask. Do not choose a reasonable default. Do not proceed with a partial implementation.
```

#### Session log
_(empty — append after the step runs)_

---

### Step 11 — Authentication & gates

| | |
|---|---|
| **Status** | ⬜ not started |
| **Outcome** | Users sign in with email + password or Google, reset a forgotten password, and sign out; middleware refreshes the session on every request and redirects unauthenticated visitors away from signed-in surfaces; the API §4.1 gates exist as one shared check for protected calls; S16 and S28 are live. |
| **Implements** | FR-34; EP-42; S16 `/prijava`, S28 `/prijava/nova-lozinka`; route handler `GET /auth/callback`; API §3.6, §4.1, §7.1, §7.3 (auth states); ADR-06, ADR-08 (auth email via Resend SMTP — configuration note) |
| **Depends on** | Step 04, Step 10 |
| **Blocked by** | — |
| **Track** | single |

**Read before starting:** `docs/product/02-prd.md` §6 (FR-33, FR-34), §8 (BR-29, BR-31) · `docs/product/03-technical-constraints.md` §3 (ADR-06, ADR-08, ADR-16) · `docs/product/05-api-integration-contract.md` §3.6, §4.1, §4.2, §5.5 (EP-41 resend address only, EP-42, EP-43 read), §7.1, §7.2, §7.3, §11 (EP-42 row) · `docs/product/04-design-system.md` §5.4, §8, §9, §11 (S15, S16, S18, S19, S20, S28 routes; shells A/O/D/P/U), §12 (S16, S28) · `docs/product/04-design/screens/sign-in.tsx`, `new-password.tsx` · `docs/product/04-design/components/shells.tsx` (AuthShell) · `docs/product/06-build-plan.md` §6.

**Files this step may touch:**
- `middleware.ts` (or the file name the installed Next.js major documents for request middleware — see prompt)
- `lib/supabase/middleware.ts`, `lib/supabase/gates.ts`
- `lib/actions/result.ts`, `lib/actions/auth.ts`
- `app/(auth)/layout.tsx`, `app/(auth)/prijava/page.tsx`, `app/(auth)/prijava/sign-in-form.tsx`, `app/(auth)/prijava/nova-lozinka/page.tsx`, `app/(auth)/prijava/nova-lozinka/new-password-form.tsx`, `app/(auth)/auth/callback/route.ts`; removal of `app/(auth)/.gitkeep`
- `supabase/config.toml` (auth sections only)
- `README.md` (production auth setup section only)
- `tests/auth/gates.test.ts`, `tests/auth/middleware.test.ts`, `tests/auth/callback.test.ts`, `tests/auth/sign-in-form.test.tsx`, `tests/auth/new-password-form.test.tsx`, `tests/auth/sign-out.test.ts`
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
- (Derived from ADR-06, ADR-08) Local Supabase Auth requires email confirmation and has Google configured from the Step 02 variable names; the production Resend SMTP and Google OAuth setup is documented.

**Tests to ship:**
- FR-34 first criterion (sign-in reaches the user's session and redirects to `/ljubimci`; after sign-out a protected route redirects to `/prijava`) → `tests/auth/sign-in-form.test.tsx`, `tests/auth/sign-out.test.ts`
- FR-34 second criterion (reset request always succeeds; recovery callback leads to S28; S28 sets the password once and a second use shows the link-expired state) → `tests/auth/callback.test.ts`, `tests/auth/new-password-form.test.tsx`
- cookie session refresh → `tests/auth/middleware.test.ts`
- unauthenticated redirect and `401` → `tests/auth/middleware.test.ts`, `tests/auth/gates.test.ts`
- gate order → `tests/auth/gates.test.ts`
- callback redirect matrix → `tests/auth/callback.test.ts`
- S16 / S28 states → `tests/auth/sign-in-form.test.tsx`, `tests/auth/new-password-form.test.tsx`
- auth config → checked by `npx supabase start` in verification (config parses) and the Session log note

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
You are executing Step 11 — Authentication & gates — of docs/product/06-build-plan.md.

Read first, in full: docs/product/02-prd.md §6 (FR-33, FR-34) and §8 (BR-29, BR-31); docs/product/03-technical-constraints.md §3 (ADR-06, ADR-08, ADR-16); docs/product/05-api-integration-contract.md §3.6, §4.1, §4.2, EP-41 (the resend address only), EP-42, EP-43 (read) in §5.5, §7.1, §7.2, §7.3 and the EP-42 row of §11; docs/product/04-design-system.md §5.4, §8, §9, §11 (routes and shells of S15, S16, S18, S19, S20, S28) and §12 (S16, S28); docs/product/04-design/screens/sign-in.tsx and new-password.tsx; docs/product/04-design/components/shells.tsx (AuthShell); docs/product/06-build-plan.md §6.

Goal: sign-in, password reset, sign-out, session refresh and the API §4.1 gates. No registration, no profile, no i18n.

Do exactly this:
1. lib/actions/result.ts — the ActionResult and ApiError types exactly as 05- §3.6 and §7.1 define them, plus one mapper from Supabase Auth errors and database errors (ERRCODE P0001, MESSAGE = code, §7.1) to ApiError codes from §7.2. No codes outside §7.2.
2. lib/supabase/middleware.ts + the root request-middleware file: refresh the Supabase session on every request with @supabase/ssr (05- §4.1). Redirect unauthenticated requests for signed-in surfaces to /prijava. Signed-in surfaces are the routes of shells A, O and D in Design §11 (/ljubimci, /uspomene, /podsetnici, /podesavanja, /domacinstvo, /premium, /profil, /partneri, /organizacija, /admin and their children); /prijava, /registracija, /poziv, /t, /o, /auth and /api are not redirected. Use the request-middleware file name the installed Next.js major documents (middleware.ts, or its documented successor); if that file convention is not supported by the OpenNext adapter configured in Step 03, STOP.
3. lib/supabase/gates.ts — one function protected server code calls first, implementing the four gates of 05- §4.1 in that order and returning the matching ApiError (unauthenticated, email_not_verified, account_pending_deletion with the EP-51-cancel and EP-42-sign-out exemption, organisation_pending_approval for writes only). It reads the caller's profile and organisation membership directly (get_me is Step 12).
4. app/(auth)/auth/callback/route.ts — GET /auth/callback per EP-42: exchangeCodeForSession, then redirect: no profiles row → the S15 completion step (/registracija); deletion_requested_at set → /profil/podaci; organisation member → /organizacija; otherwise the next parameter (only same-site paths) or /ljubimci. Target routes built in later steps may 404 until then — do not create them.
5. app/(auth)/layout.tsx — wraps auth pages in AuthShell from components/app/shells.tsx (Design §5.4).
6. S16 /prijava — app/(auth)/prijava/page.tsx and sign-in-form.tsx ported from docs/product/04-design/screens/sign-in.tsx: keep markup, classes and Serbian copy exactly; remove StateSwitcher and drive the states from real responses (05- §7.3, EP-42 "States"): signInWithPassword, signInWithOAuth Google with redirectTo /auth/callback, "Zaboravljena lozinka" calling resetPasswordForEmail with redirectTo /auth/callback?next=/prijava/nova-lozinka (always shows success — no account enumeration), 401 → error state, 403 email_not_verified → error state with the resend option using the EP-41 resend call. Copy stays inline in Serbian; Step 12 moves it into the dictionaries.
7. S28 /prijava/nova-lozinka — page.tsx and new-password-form.tsx ported from docs/product/04-design/screens/new-password.tsx the same way: updateUser({ password }) with the ≥ 8 character rule; states default, mismatch, link expired (no recovery session or a used link → the invalid_action_token state S28 names), success → "Prijavi se".
8. lib/actions/auth.ts — signOut server action (EP-42: clears cookies, redirects to /prijava; allowed during pending deletion). The sign-out control in the shells is wired in Step 12.
9. supabase/config.toml, auth sections only: email confirmation required (BR-29); site URL and additional redirect URL for /auth/callback on the local dev origin; Google provider enabled through env(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID) and env(SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET). Local auth emails stay on the local mail catcher.
10. README.md — "Production auth setup" section: in the Supabase dashboard set custom SMTP to Resend (ADR-08), enable Google with the two variables, add the production /auth/callback redirect URL. Names only, no values.
11. Write the tests listed below.

Do not invent: no screens other than S16 and S28; no copy, colours, components or states outside docs/product/04-design-system.md §8/§12 and the two mockups; no endpoints, fields or error codes outside docs/product/05-api-integration-contract.md; no schema changes; no packages — everything needed was installed in Steps 01, 02 and 10; no libraries outside docs/product/03-technical-constraints.md §4.

Files you may create, modify or delete — nothing else:
the root request-middleware file (middleware.ts or its documented successor), lib/supabase/middleware.ts, lib/supabase/gates.ts, lib/actions/result.ts, lib/actions/auth.ts, app/(auth)/layout.tsx, app/(auth)/prijava/page.tsx, app/(auth)/prijava/sign-in-form.tsx, app/(auth)/prijava/nova-lozinka/page.tsx, app/(auth)/prijava/nova-lozinka/new-password-form.tsx, app/(auth)/auth/callback/route.ts, app/(auth)/.gitkeep (delete), supabase/config.toml (auth sections only), README.md, tests/auth/gates.test.ts, tests/auth/middleware.test.ts, tests/auth/callback.test.ts, tests/auth/sign-in-form.test.tsx, tests/auth/new-password-form.test.tsx, tests/auth/sign-out.test.ts, and docs/product/06-build-plan.md (only the Step 11 row in §3 and the Step 11 Session log).

Acceptance criteria (verbatim from the PRD; then derived checks):
- FR-34: "Given a registered user, When they sign in with their method, Then they reach their own data; When they sign out, Then no data is visible."
- FR-34: "Given a user who forgot their password, When they request a reset, Then they receive an email link that lets them set a new password once."
- Derived from API §4.1: cookie session refreshed by middleware on every request.
- Derived from API §4.1: unauthenticated → redirect /prijava for signed-in surfaces, 401 for protected calls.
- Derived from API §4.1: the four gates in order with the stated exemptions.
- Derived from API EP-42: the /auth/callback redirect matrix.
- Derived from API EP-42/§7.3: S16 and S28 states.
- Derived from ADR-06/ADR-08: local auth config; production setup documented.

Tests to write (Vitest + Testing Library; Supabase calls faked at the client boundary):
- tests/auth/sign-in-form.test.tsx — FR-34 sign-in success navigates to /ljubimci (or next); 401 shows the error state; 403 email_not_verified shows the error with resend and resend calls the EP-41 resend; Google button starts OAuth with redirectTo /auth/callback; reset request always shows success.
- tests/auth/sign-out.test.ts — FR-34 signOut clears the session and redirects to /prijava; afterwards the middleware redirects a protected route to /prijava.
- tests/auth/callback.test.ts — code exchange then each redirect of the EP-42 matrix; recovery link leads to /prijava/nova-lozinka; external next values are refused.
- tests/auth/new-password-form.test.tsx — FR-34 password set once: success state; mismatch and < 8 characters inline errors; no recovery session → link-expired state.
- tests/auth/middleware.test.ts — session refresh on every request; unauthenticated request to each signed-in prefix redirects to /prijava; public prefixes pass through.
- tests/auth/gates.test.ts — gate order: 401, then 403 email_not_verified, then 403 account_pending_deletion (EP-51 cancel and sign-out exempt), then 403 organisation_pending_approval on writes only; reads pass for a pending organisation.

Done means all of these pass, in this order:
  npx supabase db reset → config and migrations apply
  npm run typecheck     → exit 0
  npm run lint          → exit 0
  npm test              → all test files pass
  npx supabase test db  → all pgTAP files pass (unchanged)
  npm run build         → exit 0

When everything passes: in docs/product/06-build-plan.md set the Step 11 row in §3 to ✅ with today's date in "Done", and append a Session log entry under Step 11 (date, what was built, pass/fail per verification command, deviations, follow-ups — list the redirect targets that will 404 until their steps run). Then commit all changes with the message "Step 11: Authentication & gates".

If anything above is ambiguous, if a referenced section doesn't contain what this prompt says it does, or if completing this step would require touching a file outside the list, adding a package, or making a decision the referenced documents don't settle — STOP and ask. Do not choose a reasonable default. Do not proceed with a partial implementation.
```

#### Session log
_(empty — append after the step runs)_

### Step 12 — Registration, profile & i18n

| | |
|---|---|
| **Status** | ⬜ not started |
| **Outcome** | A visitor can register as Owner, Shelter or Breeder (email + password or Google) and complete their profile; every existing screen reads its text from Serbian (Latin) and English dictionaries and switches language; signed-in shells show the real user. |
| **Implements** | FR-33, FR-35, NFR-05 · EP-41, EP-43, EP-67 · S15 `/registracija`, S18 `/profil` (name, city, language part only) · tables `profiles`, `organisations`, `organisation_memberships`, `cities` (read/write through EP-41/EP-43/EP-67 only) · ADR-06, ADR-16 (`lib/i18n/`) · ADR-15 flow "registration" |
| **Depends on** | Step 11, Step 05 |
| **Blocked by** | — (no open question; the prompt carries two blocker checks — current terms version source, English copy — see change requests) |
| **Track** | single |

**Read before starting:**
- `docs/product/02-prd.md` §6 FR-33, FR-35; §8 BR-29, BR-30, BR-32; §10 NFR-05
- `docs/product/03-technical-constraints.md` §3 ADR-06, ADR-08, ADR-15, ADR-16; §5.1 (`profiles`), §5.2 (`organisations`, `organisation_memberships`), §5.7 (`cities`); §7 row NFR-05
- `docs/product/04-design-system.md` §5.1, §5.2, §5.4 (shells), §6 (AppShell, AuthShell), §8, §9 (locale, tone, formats), §11 rows S15, S18, §12 S15 and S18
- `docs/product/04-design/screens/register.tsx`, `docs/product/04-design/screens/profile.tsx`, `docs/product/04-design/components/shells.tsx`
- `docs/product/05-api-integration-contract.md` §3.1, §3.5, §3.6, §4.1, §4.4 rows EP-41 – EP-44 and EP-67, §5.5 EP-41, EP-42, EP-43, §5.8 EP-67, §6 schemas `Me`, `Entitlements`, `City`, §7.1, §7.2, §7.3 rows *email_sent*, *inline field errors*
- `docs/product/06-build-plan.md` §4, §5, §6 and the Session logs of Steps 10 and 11

**Files this step may touch:**
- `supabase/migrations/*_get_me.sql` (new: `rpc:get_me()` per EP-43 and the `Me`/`Entitlements` schemas; column grant on `profiles` limiting updates to `full_name`, `city_id`, `locale`)
- `lib/supabase/` generated types file (regenerated with `npm run db:types` only, never hand-edited)
- `lib/i18n/index.ts`, `lib/i18n/sr-Latn.ts`, `lib/i18n/en.ts` (new)
- `lib/actions/registration.ts` (new: `action:complete_registration`, EP-41)
- `app/(auth)/registracija/page.tsx`, `app/(auth)/registracija/register-client.tsx` (new, S15)
- `app/(auth)/auth/callback/route.ts` (modify: call `complete_registration` when no profile exists, per EP-41/EP-42)
- `app/(auth)/layout.tsx`, `app/(app)/layout.tsx`, `app/(org)/layout.tsx` (modify or create: locale from EP-43, `AppShell` `user` from EP-43)
- The S16 and S28 screen files created in Step 11 under `app/(auth)/prijava/` (modify: move their strings into `lib/i18n` only)
- `app/(app)/profil/page.tsx`, `app/(app)/profil/profile-client.tsx` (new, S18 name/city/language part)
- `supabase/tests/get_me.test.sql`
- `tests/i18n/dictionaries.test.ts`, `tests/i18n/locale-switch.test.tsx`, `tests/registration/register-form.test.tsx`, `tests/registration/complete-registration.test.ts`, `tests/profile/profile-form.test.tsx`
- `e2e/registration.spec.ts`
- `docs/product/06-build-plan.md` (§3 row of Step 12 and the Step 12 Session log only)

**Out of bounds:** S18 subscription card, days remaining, cancel (Step 23); S19 and the links' targets beyond rendering the existing links; EP-44 plans and S17 (Steps 23/31); the Operator notification email for a pending shelter listed in EP-41 side effects (the Resend adapter does not exist until Step 19 — do not send it and do not create `lib/integrations/resend.ts`); shell count badges (`AppShell` `counts`) — 05- names no source for them; any schema change other than the `get_me` function and the column grant; any file under `components/ui` or `components/app`.

**Acceptance criteria:** (PRD v1.5, verbatim)
- FR-33 — Given a new user, When registering with email and password or Google, Then they choose an account type (Owner / Shelter / Breeder).
- FR-33 — Given registration with email and password, When the email is not yet verified, Then the product cannot be used until it is.
- FR-35 — Given any user, When they switch language, Then all product text is shown in the chosen language.
- NFR-05 (derived from TC §7 row NFR-05): 100% of UI strings are present in both locales, and a missing key fails the build.

**Tests to ship:**
- FR-33 (account type, email + password and Google paths) → `tests/registration/register-form.test.tsx` (S15 requires an account type before submit; shelter/breeder require organisation name and city; the Google path reaches the completion step with the account-type choice); `tests/registration/complete-registration.test.ts` (inserts `profiles`, and for shelter/breeder `organisations` with `approval_status` pending/approved and an admin membership; idempotent when a profile exists)
- FR-33 (unverified email blocks use) → `e2e/registration.spec.ts` (register with email + password → "Proveri mejl" state → protected route is refused until the local verification link is followed → after verification the user reaches `/ljubimci`)
- FR-35 → `tests/i18n/locale-switch.test.tsx` (switching locale on S15 and on S18 re-renders every visible string from the other dictionary; EP-43 update with `locale` persists it)
- NFR-05 → `tests/i18n/dictionaries.test.ts` (both dictionaries have identical key sets) plus the type-level check that makes `npm run typecheck` fail on a missing key
- EP-43 / Entitlements → `supabase/tests/get_me.test.sql` (returns null without a profile; computes `entitlements` and `usage` for the local Free and Premium seed users; only `full_name`, `city_id`, `locale` are updatable)
- S18 profile form → `tests/profile/profile-form.test.tsx` (city is a Select from EP-67; `422` field codes render inline)

**Verification:**
```
npm run typecheck      # expect: exit 0
npm run lint           # expect: exit 0
npm test               # expect: all Vitest suites pass, including the five files above
npx supabase test db   # expect: all pgTAP files pass, including get_me.test.sql
npm run build          # expect: build succeeds
npm run e2e            # expect: e2e/registration.spec.ts passes
```

#### Prompt
```
You are executing Step 12 — Registration, profile & i18n — of docs/product/06-build-plan.md. Work in the repository root.

Read first, in full:
- docs/product/02-prd.md §6 FR-33, FR-35; §8 BR-29, BR-30, BR-32; §10 NFR-05
- docs/product/03-technical-constraints.md §3 ADR-06, ADR-08, ADR-15, ADR-16; §5.1 profiles; §5.2 organisations, organisation_memberships; §5.7 cities; §7 row NFR-05
- docs/product/04-design-system.md §5.1, §5.2, §5.4, §6 (AppShell, AuthShell), §8, §9, §11 rows S15 and S18, §12 S15 and S18
- docs/product/04-design/screens/register.tsx, docs/product/04-design/screens/profile.tsx, docs/product/04-design/components/shells.tsx
- docs/product/05-api-integration-contract.md §3.1, §3.5, §3.6, §4.1, §4.4 (rows EP-41 – EP-44, EP-67), §5.5 EP-41, EP-42, EP-43, §5.8 EP-67, §6 Me, Entitlements, City, §7.1, §7.2, §7.3
- docs/product/06-build-plan.md §4, §5, §6, and the Session logs of Steps 10 and 11

Blocker checks — do these before writing any code:
1. EP-41 requires terms_version to equal "the currently published terms version", but 03- and 05- do not say where that value is defined. Search the repository (env example from Step 02, seed and migrations from Step 04). If no existing source for the current terms version exists, STOP and report: "Step 12 blocked — the current terms version has no defined source (change request to 03-/05-)". Do not invent a constant.
2. 04-design-system.md §9 requires every string in Serbian (Latin) and English. register.tsx carries both languages; profile.tsx, shells.tsx and the S16/S28 mockups carry Serbian only. If docs/product/04-design does not contain English copy for every string you must move into lib/i18n, STOP and report: "Step 12 blocked — English copy missing for <screens> (change request to 04-design-system)". Do not translate copy yourself.
3. Confirm that the ApiError and ActionResult types (05- §3.6, §7.1) and the database-error-to-code mapping (05- §7.1) exist from Step 11. If they do not, STOP and ask where they belong (ADR-16 names no location for them).

Build:
1. lib/i18n: Serbian (Latin) and English dictionaries plus an index that resolves the active locale. Locale for a signed-in user comes from profiles.locale via EP-43; on auth-shell screens the SR/EN switch from S15 sets it for the page and is sent as `locale` to EP-41. Make the English dictionary's type depend on the Serbian keys so that a missing key fails `npm run typecheck` (TC §7 NFR-05). Do not add an i18n package. If persisting a Visitor's language across page navigation turns out to be required, STOP and ask — no storage mechanism for it is specified.
2. Move the strings of every screen and shell that exists in the repository at this point into lib/i18n, without changing markup.
3. supabase migration `get_me` (create with `npx supabase migration new get_me`): rpc:get_me() exactly as EP-43 and the Me/Entitlements schemas define, plus the profiles column grant from EP-43. Then run `npm run db:types`. The tables this function reads from Steps 04–08 already exist (single serial track).
4. lib/actions/registration.ts: action:complete_registration per EP-41 (Request, Errors, Side effects), returning ActionResult<Me>. Do not send the Operator notification email (Out of bounds).
5. app/(auth)/auth/callback/route.ts: when the session has no profiles row, call complete_registration with the payload from user_metadata as EP-41 states; keep every redirect from EP-42.
6. S15: port docs/product/04-design/screens/register.tsx to app/(auth)/registracija/register-client.tsx with app/(auth)/registracija/page.tsx as the route. Keep markup, classes and composites; change imports from ../components/* to @/components/app/*; replace inline data with real calls (EP-41 sign-up, resend, Google; EP-67 cities for the organisation city Select); remove the StateSwitcher and drive default / email_sent / inline field errors from real responses per 05- §7.3 and EP-41 States. Include the Google completion step (account type, and organisation fields for Azil/Odgajivačnica) for a signed-in user with no profile.
7. S18 (profile part only): port the name, city and language section of docs/product/04-design/screens/profile.tsx to app/(app)/profil/profile-client.tsx with app/(app)/profil/page.tsx; read with EP-43 get, save with EP-43 update; a locale change switches the UI immediately. Render the subscription card area and the links as they are in the mockup only if they need no data; otherwise omit them (Step 23 adds the subscription card).
8. Wire app/(app)/layout.tsx and app/(org)/layout.tsx so AppShell receives `user` from EP-43 and the locale from profiles.locale. Do not pass `counts` — 05- defines no source for shell counts.

Do not invent:
- No colours, spacing, radii, fonts or components outside 04-design-system.md §4–§6 and the existing components/ui and components/app; do not edit components/ui or components/app.
- No packages outside 03-technical-constraints.md §4; do not add any dependency to package.json.
- No endpoints, fields, error codes or RPC names outside 05-api-integration-contract.md.
- No tables, columns or enum values outside 03-technical-constraints.md §5.
- No user-facing copy that is not in 04-design-system.md or docs/product/04-design.

Files: create or modify only these. Touching any other file requires stopping and asking.
- supabase/migrations/<timestamp>_get_me.sql; the generated types file in lib/supabase/ (via npm run db:types only)
- lib/i18n/index.ts, lib/i18n/sr-Latn.ts, lib/i18n/en.ts
- lib/actions/registration.ts
- app/(auth)/registracija/page.tsx, app/(auth)/registracija/register-client.tsx
- app/(auth)/auth/callback/route.ts, app/(auth)/layout.tsx, app/(app)/layout.tsx, app/(org)/layout.tsx
- the S16 and S28 files from Step 11 under app/(auth)/prijava/ (string extraction only)
- app/(app)/profil/page.tsx, app/(app)/profil/profile-client.tsx
- supabase/tests/get_me.test.sql
- tests/i18n/dictionaries.test.ts, tests/i18n/locale-switch.test.tsx, tests/registration/register-form.test.tsx, tests/registration/complete-registration.test.ts, tests/profile/profile-form.test.tsx
- e2e/registration.spec.ts
- docs/product/06-build-plan.md (Step 12 row in §3 and the Step 12 Session log only)

Acceptance criteria (PRD v1.5, verbatim — each needs a passing test):
- Given a new user, When registering with email and password or Google, Then they choose an account type (Owner / Shelter / Breeder).
- Given registration with email and password, When the email is not yet verified, Then the product cannot be used until it is.
- Given any user, When they switch language, Then all product text is shown in the chosen language.
- Derived from TC §7 NFR-05: 100% of UI strings are present in both locales, and a missing key fails the build.

Tests to write: exactly the files listed under "Tests to ship" in Step 12 of docs/product/06-build-plan.md, each covering the criterion named there.

Done means all of these pass, in this order, and you paste their output into the Session log:
npm run typecheck
npm run lint
npm test
npx supabase test db
npm run build
npm run e2e

When verification passes: update the Step 12 row in docs/product/06-build-plan.md §3 (Status ✅, Done = today's date), append a Session log entry under Step 12 (date, what was built, the output of each verification command, deviations, follow-ups — include "Operator notification for pending shelters not sent; needs Resend adapter"), then commit with the message "Step 12: Registration, profile & i18n".

If anything above is ambiguous, if a referenced section doesn't contain what this prompt says it does, or if completing this step would require touching a file outside the list or making a decision the referenced documents don't settle — STOP and ask. Do not choose a reasonable default. Do not proceed with a partial implementation.
```

#### Session log
_(empty — append after the step runs)_

---

### Step 13 — Pets: list, create, edit, delete

| | |
|---|---|
| **Status** | ⬜ not started |
| **Outcome** | An owner sees their pets on S01 (with search and the Free limit), creates and edits a pet with a photo on S02, and a server action permanently deletes a pet; R2 upload and view links work for pet photos. |
| **Implements** | FR-01, FR-02, FR-03, FR-09, FR-13, FR-36 (active-pet limit), FR-59 · EP-01, EP-02 (RPC introduced here because S02 edit is its first consumer — Ordering Invariant 5), EP-03, EP-04, EP-05 (server action; its S03 control is wired in Step 14), EP-13 (`pet_photo`), EP-15 (`pet_photo`) · S01 `/ljubimci`, S02 `/ljubimci/novi` and `/ljubimci/[id]/izmena` · tables `pets`, `r2_deletion_queue` (via EP-05) · ADR-07 (`lib/integrations/r2.ts`) · ADR-15 flow "add pet" |
| **Depends on** | Step 12, Step 06 |
| **Blocked by** | — (prompt carries blocker checks: R2 presigning without an approved library, English copy) |
| **Track** | single |

**Read before starting:**
- `docs/product/02-prd.md` §6 FR-01, FR-02, FR-03, FR-09, FR-13, FR-36, FR-59; §8 BR-01, BR-03, BR-05, BR-50; §9 E-26
- `docs/product/03-technical-constraints.md` §3 ADR-07, ADR-14, ADR-16; §5 conventions, §5.3 `pets`, §5.5 `reminders` (birthday), §5.7 `r2_deletion_queue`, §5.9
- `docs/product/04-design-system.md` §5.1, §5.6, §6, §7 (pet avatars), §8, §9, §11 rows S01, S02, §12 S01, S02
- `docs/product/04-design/screens/pets-home.tsx`, `docs/product/04-design/screens/pet-form.tsx`
- `docs/product/05-api-integration-contract.md` §3, §4.3, §4.4 rows EP-01 – EP-05, EP-13, EP-15; §5.1 Part A conventions, EP-01, EP-02, EP-03, EP-04, EP-05, EP-13, EP-15; §6 `Access`, `PetSummary`, `Pet`, `PetRecord`, `UploadTicket`, `FileUrl`, `Entitlements`; §7; §10; §13 row FR-59
- `docs/product/06-build-plan.md` §4, §5, §6 and the Session logs of Steps 06, 08, 10, 12

**Files this step may touch:**
- `supabase/migrations/*_pet_summaries_api.sql` (new: `view:pet_summaries_api`, EP-01)
- `supabase/migrations/*_get_pet_record.sql` (new: `rpc:get_pet_record`, EP-02, full `PetRecord` per §6)
- `lib/supabase/` generated types file (via `npm run db:types` only)
- `lib/integrations/r2.ts` (new: presigned PUT, presigned GET, HEAD, delete)
- `lib/actions/uploads.ts` (new: EP-13 `request_upload` / `confirm_upload`, purpose `pet_photo` only)
- `lib/actions/files.ts` (new: EP-15 `get_file_urls`, kind `pet_photo` only)
- `lib/actions/pets.ts` (new: EP-05 `delete_pet`)
- `app/(app)/ljubimci/page.tsx`, `app/(app)/ljubimci/pets-home-client.tsx` (new, S01)
- `app/(app)/ljubimci/novi/page.tsx`, `app/(app)/ljubimci/novi/pet-form-client.tsx` (new, S02 create)
- `app/(app)/ljubimci/[id]/izmena/page.tsx` (new, S02 edit, reuses `pet-form-client.tsx`)
- `lib/i18n/sr-Latn.ts`, `lib/i18n/en.ts` (add keys)
- `supabase/tests/pet_summaries_api.test.sql`, `supabase/tests/get_pet_record.test.sql`, `supabase/tests/pet_birthday_reminder.test.sql`, `supabase/tests/pet_delete.test.sql`
- `tests/pets/pets-home.test.tsx`, `tests/pets/pet-form.test.tsx`, `tests/pets/delete-pet.test.ts`, `tests/pets/pet-photo-upload.test.ts`, `tests/integrations/r2.test.ts`
- `e2e/add-pet.spec.ts`
- `docs/product/06-build-plan.md` (Step 13 row in §3 and the Step 13 Session log only)

**Out of bounds:** S03 and every pet-record tab (Step 14); the "Danas" strip data (render it empty — EP-25 arrives in Step 17); the S01 link to Uspomene (Step 16); attachment and moment upload purposes and file kinds (Steps 15, 21); public-moment cache purge in EP-05 side effects (no purge mechanism exists until Step 21 — leave it out and log it); organisation animal fields of EP-03 (Step 24); any schema change other than the two read migrations; `components/ui`, `components/app`.

**Acceptance criteria:** (PRD v1.5, verbatim)
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
- docs/product/03-technical-constraints.md §3 ADR-07, ADR-14, ADR-16; §5 conventions; §5.3 pets; §5.5 reminders; §5.7 r2_deletion_queue; §5.9
- docs/product/04-design-system.md §5.1, §5.6, §6, §7, §8, §9, §11 rows S01 and S02, §12 S01 and S02
- docs/product/04-design/screens/pets-home.tsx, docs/product/04-design/screens/pet-form.tsx
- docs/product/05-api-integration-contract.md §3; §4.3; §4.4 rows EP-01 – EP-05, EP-13, EP-15; §5.1 Part A conventions, EP-01, EP-02, EP-03, EP-04, EP-05, EP-13, EP-15; §6 Access, PetSummary, Pet, PetRecord, UploadTicket, FileUrl, Entitlements; §7; §10; §13 row FR-59
- docs/product/06-build-plan.md §4, §5, §6, and the Session logs of Steps 06, 08, 10 and 12

Blocker checks — do these before writing any code:
1. ADR-07 approves Cloudflare R2 but 03- §4 names no client library for presigned URLs. If producing presigned PUT/GET URLs and HEAD/DELETE requests requires any package not already in package.json, STOP and report: "Step 13 blocked — R2 signing needs a library not approved in 03- (change request to ADR-07)", naming the package. Do not install it and do not hand-write a request-signing implementation.
2. 05- §5.1 Part A and §10 describe two different R2 key layouts. STOP and ask which one applies before writing lib/actions/uploads.ts.
3. If docs/product/04-design has no English copy for the strings of S01 and S02, STOP and report: "Step 13 blocked — English copy missing for S01, S02 (change request to 04-design-system)". Do not translate copy yourself.

Build:
1. Migration pet_summaries_api (npx supabase migration new pet_summaries_api): view:pet_summaries_api as EP-01 and §5.1 Part A define (security_invoker, computed fields per PetSummary). Migration get_pet_record: rpc:get_pet_record exactly as EP-02 and the PetRecord schema define. Validation rules in EP-03/EP-04 Request that the existing schema does not yet enforce may be added in these migrations only as check constraints on columns that already exist in 03- §5.3 — no new columns, tables or enum values. Run npm run db:types.
2. lib/integrations/r2.ts: presigned PUT and GET (10-minute expiry, 05- §10), HEAD, delete, configured from the R2 environment variable names in the .env example from Step 02.
3. lib/actions/uploads.ts: EP-13 request_upload and confirm_upload for purpose pet_photo only (Request, Errors, Side effects as written; old photo key queued in r2_deletion_queue). lib/actions/files.ts: EP-15 get_file_urls for kind pet_photo only. lib/actions/pets.ts: EP-05 delete_pet (transaction, R2 key collection and queueing as written). Leave out the public-moment cache purge and record it as a follow-up.
4. S01: port docs/product/04-design/screens/pets-home.tsx to app/(app)/ljubimci/pets-home-client.tsx with app/(app)/ljubimci/page.tsx. Keep markup, classes and composites; change imports from ../components/* to @/components/app/*; replace inline pets with EP-01 rows and photos via EP-15; FR-59 search filters the bounded EP-01 list on the client (05- §13 row FR-59), case- and diacritic-insensitive; "Dodaj ljubimca" opens PremiumLock when Entitlements say Free and own active count ≥ 1 (EP-01 States). Render the "Danas" card in its empty form (no reminder data until Step 17) and omit the Uspomene link (Step 16). Remove the StateSwitcher; drive loading / default / empty / premium_locked from real responses per 05- §7.3.
5. S02: port docs/product/04-design/screens/pet-form.tsx to app/(app)/ljubimci/novi/pet-form-client.tsx with app/(app)/ljubimci/novi/page.tsx (create, EP-03) and app/(app)/ljubimci/[id]/izmena/page.tsx (edit, preload from EP-02 `pet`, save with EP-04). Photo through EP-13 after the pet exists. Map 422 fields to inline errors, premium_required to PremiumLock, 5xx to the X state, per EP-03/EP-04 States. Remove the StateSwitcher.
6. Put every new string into lib/i18n (both dictionaries).

Do not invent:
- No colours, spacing, radii, fonts or components outside 04-design-system.md §4–§6 and the existing components/ui and components/app; do not edit components/ui or components/app.
- No packages outside 03-technical-constraints.md §4; do not add any dependency to package.json.
- No endpoints, fields, error codes or RPC names outside 05-api-integration-contract.md.
- No tables, columns or enum values outside 03-technical-constraints.md §5.
- No user-facing copy that is not in 04-design-system.md or docs/product/04-design.

Files: create or modify only these. Touching any other file requires stopping and asking.
- supabase/migrations/<timestamp>_pet_summaries_api.sql, supabase/migrations/<timestamp>_get_pet_record.sql; the generated types file in lib/supabase/ (via npm run db:types only)
- lib/integrations/r2.ts, lib/actions/uploads.ts, lib/actions/files.ts, lib/actions/pets.ts
- app/(app)/ljubimci/page.tsx, app/(app)/ljubimci/pets-home-client.tsx
- app/(app)/ljubimci/novi/page.tsx, app/(app)/ljubimci/novi/pet-form-client.tsx, app/(app)/ljubimci/[id]/izmena/page.tsx
- lib/i18n/sr-Latn.ts, lib/i18n/en.ts
- supabase/tests/pet_summaries_api.test.sql, supabase/tests/get_pet_record.test.sql, supabase/tests/pet_birthday_reminder.test.sql, supabase/tests/pet_delete.test.sql
- tests/pets/pets-home.test.tsx, tests/pets/pet-form.test.tsx, tests/pets/delete-pet.test.ts, tests/pets/pet-photo-upload.test.ts, tests/integrations/r2.test.ts
- e2e/add-pet.spec.ts
- docs/product/06-build-plan.md (Step 13 row in §3 and the Step 13 Session log only)

Acceptance criteria (PRD v1.5, verbatim — each needs a passing test):
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

When verification passes: update the Step 13 row in docs/product/06-build-plan.md §3 (Status ✅, Done = today's date), append a Session log entry under Step 13 (date, what was built, the output of each verification command, deviations, follow-ups — include "EP-05 public-moment cache purge pending Step 21"), then commit with the message "Step 13: Pets: list, create, edit, delete".

If anything above is ambiguous, if a referenced section doesn't contain what this prompt says it does, or if completing this step would require touching a file outside the list or making a decision the referenced documents don't settle — STOP and ask. Do not choose a reasonable default. Do not proceed with a partial implementation.
```

#### Session log
_(empty — append after the step runs)_

---

### Step 14 — Pet record: view, weight, vaccinations

| | |
|---|---|
| **Status** | ⬜ not started |
| **Outcome** | S03 shows a pet's record (header, Pregled, Vakcine, Težina tabs) for owners and read-only for household members; weight entries and vaccinations can be added, edited and deleted; the S03 menu permanently deletes a pet. |
| **Implements** | FR-04, FR-05, FR-28 (view side), FR-03 (display re-check) · EP-02 (consumed), EP-05 (S03 caller), EP-08, EP-09 · S03 `/ljubimci/[id]`, S04 `/ljubimci/[id]/vakcine/nova` · tables `weight_entries`, `vaccinations` (+ `reminders` via the Step 08 trigger) |
| **Depends on** | Step 13, Step 08 |
| **Blocked by** | — (prompt carries a blocker check: English copy) |
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
- `lib/i18n/sr-Latn.ts`, `lib/i18n/en.ts` (add keys)
- `supabase/tests/weight_entries_api.test.sql`, `supabase/tests/vaccination_reminder_sync.test.sql`
- `tests/pet-record/weight-tab.test.tsx`, `tests/pet-record/vaccination-form.test.tsx`, `tests/pet-record/member-view.test.tsx`, `tests/pet-record/delete-dialog.test.tsx`
- `docs/product/06-build-plan.md` (Step 14 row in §3 and the Step 14 Session log only)

**Out of bounds:** Terapije and Pregledi tabs and their forms (Step 15); "Premesti u Uspomene" and "Izvezi PDF" actions (Step 16); the Pregled tab's "next 3 reminders" block (Step 17 — omit it); links to Dnevnik and Trenuci (Steps 20, 21 — omit them); vet-suggestion banner (Step 27); organisation-animal variant reached from S20 (Step 24); any schema change other than the view; `components/ui`, `components/app`.

**Acceptance criteria:** (PRD v1.5, verbatim)
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

Blocker check — before writing any code: if docs/product/04-design has no English copy for the strings of S03 and S04, STOP and report: "Step 14 blocked — English copy missing for S03, S04 (change request to 04-design-system)". Do not translate copy yourself.

Build:
1. Migration weight_entries_api (npx supabase migration new weight_entries_api): view:weight_entries_api as §5.1 Part A and the WeightEntry schema define, including per-entry access. Validation rules in EP-08/EP-09 Request not yet enforced by the schema may be added only as check constraints on existing 03- §5.3 columns. Run npm run db:types.
2. S03: port docs/product/04-design/screens/pet-record.tsx to app/(app)/ljubimci/[id]/pet-record-client.tsx with app/(app)/ljubimci/[id]/page.tsx. Keep markup, classes and composites (PetHeader inside data-pet-sex); change imports from ../components/* to @/components/app/*. Data from EP-02; photos via EP-15. In this step include only the header (with the "Izmeni" link to /ljubimci/[id]/izmena and the DropdownMenu item "Obriši trajno" → AlertDialog → EP-05 delete_pet), and the Pregled (last weight, last visit only), Vakcine and Težina tabs. Omit the Terapije and Pregledi tabs, "Premesti u Uspomene", "Izvezi PDF", the next-reminders block, and the Dnevnik/Trenuci links — later steps add them. Weight add/edit/delete through EP-08; vaccination edit/delete through EP-09. Remove the StateSwitcher; drive loading / default / per-tab empty / read_only / error from real responses per EP-02 States and 05- §7.3 (read_only hides controls, never disables them).
3. S04: port docs/product/04-design/screens/vaccination-form.tsx to app/(app)/ljubimci/[id]/vakcine/nova/vaccination-form-client.tsx with its page.tsx; pet header from EP-01 (id filter), clinic prefilled from vet_name; save with EP-09; States per EP-09. Remove the StateSwitcher.
4. Put every new string into lib/i18n (both dictionaries).

Do not invent:
- No colours, spacing, radii, fonts or components outside 04-design-system.md §4–§6 and the existing components/ui and components/app; do not edit components/ui or components/app.
- No packages outside 03-technical-constraints.md §4; do not add any dependency to package.json.
- No endpoints, fields, error codes or RPC names outside 05-api-integration-contract.md.
- No tables, columns or enum values outside 03-technical-constraints.md §5.
- No user-facing copy that is not in 04-design-system.md or docs/product/04-design.

Files: create or modify only these. Touching any other file requires stopping and asking.
- supabase/migrations/<timestamp>_weight_entries_api.sql; the generated types file in lib/supabase/ (via npm run db:types only)
- app/(app)/ljubimci/[id]/page.tsx, app/(app)/ljubimci/[id]/pet-record-client.tsx
- app/(app)/ljubimci/[id]/vakcine/nova/page.tsx, app/(app)/ljubimci/[id]/vakcine/nova/vaccination-form-client.tsx
- lib/i18n/sr-Latn.ts, lib/i18n/en.ts
- supabase/tests/weight_entries_api.test.sql, supabase/tests/vaccination_reminder_sync.test.sql
- tests/pet-record/weight-tab.test.tsx, tests/pet-record/vaccination-form.test.tsx, tests/pet-record/member-view.test.tsx, tests/pet-record/delete-dialog.test.tsx
- docs/product/06-build-plan.md (Step 14 row in §3 and the Step 14 Session log only)

Acceptance criteria (PRD v1.5, verbatim — each needs a passing test):
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
_(empty — append after the step runs)_

---

### Step 15 — Treatments, doses, vet visits & attachments

| | |
|---|---|
| **Status** | ⬜ not started |
| **Outcome** | Owners record treatments (with dose reminders) and vet visits (with check-up reminders and image/PDF attachments up to 10 MB); anyone with care rights logs a dose; S03 gains the Terapije and Pregledi tabs. |
| **Implements** | FR-06, FR-07, FR-08, FR-36 (attachment limit) · EP-10, EP-11, EP-12, EP-13 (`attachment`), EP-14, EP-15 (`attachment`) · S27 `/ljubimci/[id]/terapije/nova`, S05 `/ljubimci/[id]/pregledi/novi`, S03 tabs Terapije, Pregledi · tables `treatments`, `dose_logs`, `vet_visits`, `attachments` · ADR-07 (uses `lib/integrations/r2.ts` from Step 13) |
| **Depends on** | Step 14 |
| **Blocked by** | — (prompt carries a blocker check: English copy) |
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
- `lib/i18n/sr-Latn.ts`, `lib/i18n/en.ts` (add keys)
- `supabase/tests/treatment_dose_reminders.test.sql`, `supabase/tests/log_dose.test.sql`, `supabase/tests/vet_visit_followup_reminder.test.sql`, `supabase/tests/attachments_limits.test.sql`
- `tests/attachments/attachment-upload.test.ts`, `tests/attachments/delete-attachment.test.ts`, `tests/pet-record/treatment-form.test.tsx`, `tests/pet-record/vet-visit-form.test.tsx`, `tests/pet-record/therapies-tab.test.tsx`
- `docs/product/06-build-plan.md` (Step 15 row in §3 and the Step 15 Session log only)

**Out of bounds:** memorial, restore, PDF (Step 16); reminder lists and "Urađeno" on S10 (Step 17); moment photos (Step 21); any schema change other than `log_dose`; `components/ui`, `components/app`.

**Acceptance criteria:** (PRD v1.5, verbatim)
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

Blocker check — before writing any code: if docs/product/04-design has no English copy for the strings of S27, S05 and the S03 Terapije/Pregledi tabs, STOP and report: "Step 15 blocked — English copy missing for S27, S05, S03 tabs (change request to 04-design-system)". Do not translate copy yourself.

Build:
1. Migration log_dose (npx supabase migration new log_dose): rpc:log_dose exactly as EP-11 defines. Validation rules in EP-10/EP-12 Request not yet enforced may be added only as check constraints on existing 03- §5.3 columns. Run npm run db:types.
2. lib/actions/uploads.ts: add purpose attachment to EP-13 (limits checked at ticket time and by the insert trigger at confirm, as written). lib/actions/files.ts: add kind attachment to EP-15. lib/actions/attachments.ts: EP-14 delete_attachment. Use lib/integrations/r2.ts from Step 13; extend it only if an R2 operation these EPs need is missing.
3. S27: port docs/product/04-design/screens/treatment-form.tsx to app/(app)/ljubimci/[id]/terapije/nova/treatment-form-client.tsx with its page.tsx; save with EP-10; convert "Trajanje N dana" as EP-10 states; States per EP-10. Remove the StateSwitcher.
4. S05: port docs/product/04-design/screens/vet-visit-form.tsx to app/(app)/ljubimci/[id]/pregledi/novi/vet-visit-form-client.tsx with its page.tsx; save the visit with EP-12, then upload each file with EP-13 (one ticket per file), counter "n / 10" from Me.usage.attachments_by_pet and Entitlements, PremiumLock on premium_required, inline errors on file_too_large / file_type_not_allowed; check type and size in the browser before upload as well (TC §7 NFR-09). Remove the StateSwitcher.
5. S03: add the Terapije tab (list, "Doza data" → EP-11, dose log) and the Pregledi tab (list, attachment chips opening EP-15 URLs, chip delete → EP-14) to app/(app)/ljubimci/[id]/pet-record-client.tsx from the same mockup, with edit/delete through EP-10/EP-12; members see these tabs read-only except "Doza data" (FR-28).
6. Put every new string into lib/i18n (both dictionaries).

Do not invent:
- No colours, spacing, radii, fonts or components outside 04-design-system.md §4–§6 and the existing components/ui and components/app; do not edit components/ui or components/app. AttachmentChip is a proposed composite (OQ-10) — do not create it; use the mockup's markup as written.
- No packages outside 03-technical-constraints.md §4; do not add any dependency to package.json.
- No endpoints, fields, error codes or RPC names outside 05-api-integration-contract.md.
- No tables, columns or enum values outside 03-technical-constraints.md §5.
- No user-facing copy that is not in 04-design-system.md or docs/product/04-design.

Files: create or modify only these. Touching any other file requires stopping and asking.
- supabase/migrations/<timestamp>_log_dose.sql; the generated types file in lib/supabase/ (via npm run db:types only)
- lib/actions/uploads.ts, lib/actions/files.ts, lib/actions/attachments.ts, lib/integrations/r2.ts (only if needed)
- app/(app)/ljubimci/[id]/terapije/nova/page.tsx, app/(app)/ljubimci/[id]/terapije/nova/treatment-form-client.tsx
- app/(app)/ljubimci/[id]/pregledi/novi/page.tsx, app/(app)/ljubimci/[id]/pregledi/novi/vet-visit-form-client.tsx
- app/(app)/ljubimci/[id]/pet-record-client.tsx
- lib/i18n/sr-Latn.ts, lib/i18n/en.ts
- supabase/tests/treatment_dose_reminders.test.sql, supabase/tests/log_dose.test.sql, supabase/tests/vet_visit_followup_reminder.test.sql, supabase/tests/attachments_limits.test.sql
- tests/attachments/attachment-upload.test.ts, tests/attachments/delete-attachment.test.ts, tests/pet-record/treatment-form.test.tsx, tests/pet-record/vet-visit-form.test.tsx, tests/pet-record/therapies-tab.test.tsx
- docs/product/06-build-plan.md (Step 15 row in §3 and the Step 15 Session log only)

Acceptance criteria (PRD v1.5, verbatim — each needs a passing test):
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
_(empty — append after the step runs)_

---

### Step 16 — Memorial, restore & PDF export

| | |
|---|---|
| **Status** | ⬜ not started |
| **Outcome** | An owner moves a pet to Memorial (reminders stop) and restores it, sees memorials on S06 with the Free limits, and a Premium owner exports the full record as a PDF generated in the browser. |
| **Implements** | FR-10, FR-11, FR-12, FR-36 (memorials, PDF) · EP-06, EP-07, EP-16 · S06 `/uspomene`, S03 memorial dialog and "Izvezi PDF", S01 link to Uspomene · tables `memorial_records`, `pets.lifecycle`, `reminders.active` · ADR-12 |
| **Depends on** | Step 15 |
| **Blocked by** | — (prompt carries blocker checks: PDF library not named by ADR-12, English copy) |
| **Track** | single |

**Read before starting:**
- `docs/product/02-prd.md` §6 FR-10, FR-11, FR-12, FR-36; §8 BR-01, BR-02, BR-03, BR-17; §9 E-02, E-03, E-25; §10 NFR-07
- `docs/product/03-technical-constraints.md` §3 ADR-12; §4; §5.3 `pets`, `memorial_records`; §5.5 `reminders`
- `docs/product/04-design-system.md` §6 (PremiumLock), §8, §9, §11 rows S01, S03, S06, §12 S01, S03, S06
- `docs/product/04-design/screens/memorials.tsx`, `docs/product/04-design/screens/pet-record.tsx` (memorial dialog, "Izvezi PDF"), `docs/product/04-design/screens/pets-home.tsx` (Uspomene link)
- `docs/product/05-api-integration-contract.md` §4.4 rows EP-01, EP-06, EP-07, EP-16; §5.1 EP-01 (S06 caller), EP-06, EP-07, EP-16; §6 `MemorialRecord`, `PdfExportBundle`, `Me` (`usage.free_slot_pet`); §7.3 *premium_locked*
- `docs/product/06-build-plan.md` §4, §5, §6 and the Session logs of Steps 13–15

**Files this step may touch:**
- `supabase/migrations/*_memorial_rpcs.sql` (new: `rpc:move_pet_to_memorial`, `rpc:restore_pet_from_memorial`)
- `lib/supabase/` generated types file (via `npm run db:types` only)
- `lib/actions/memorial.ts` (new: EP-06, EP-07)
- `lib/actions/pdf-export.ts` (new: EP-16 `get_pdf_export_bundle`)
- `app/(app)/ljubimci/[id]/pdf-export-client.ts` (new: browser-side PDF rendering from `PdfExportBundle`)
- `app/(app)/uspomene/page.tsx`, `app/(app)/uspomene/memorials-client.tsx` (new, S06)
- `app/(app)/ljubimci/[id]/pet-record-client.tsx` (modify: "Premesti u Uspomene" dialog, "Izvezi PDF")
- `app/(app)/ljubimci/pets-home-client.tsx` (modify: Uspomene link)
- `lib/i18n/sr-Latn.ts`, `lib/i18n/en.ts` (add keys)
- `supabase/tests/memorial_rpcs.test.sql`
- `tests/memorial/memorials-screen.test.tsx`, `tests/memorial/memorial-dialog.test.tsx`, `tests/pdf/pdf-export.test.ts`
- `docs/product/06-build-plan.md` (Step 16 row in §3 and the Step 16 Session log only)

**Out of bounds:** organisation status changes (Step 24); any PDF package (see blocker check); reminder screens (Step 17); any schema change other than the two RPCs; `components/ui`, `components/app`.

**Acceptance criteria:** (PRD v1.5, verbatim)
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
- docs/product/03-technical-constraints.md §3 ADR-12; §4; §5.3 pets, memorial_records; §5.5 reminders
- docs/product/04-design-system.md §6, §8, §9, §11 rows S01, S03, S06, §12 S01, S03, S06
- docs/product/04-design/screens/memorials.tsx, docs/product/04-design/screens/pet-record.tsx (memorial dialog, "Izvezi PDF"), docs/product/04-design/screens/pets-home.tsx (Uspomene link)
- docs/product/05-api-integration-contract.md §4.4 rows EP-01, EP-06, EP-07, EP-16; §5.1 EP-01, EP-06, EP-07, EP-16; §6 MemorialRecord, PdfExportBundle, Me; §7.3
- docs/product/06-build-plan.md §4, §5, §6, and the Session logs of Steps 13, 14 and 15

Blocker checks — do these before writing any code:
1. ADR-12 approves generating the PDF in the browser but 03- names no PDF library. If producing a PDF file in the browser requires any package not already in package.json, STOP before installing anything and report: "Step 16 blocked — browser PDF generation needs a library not approved in 03- (change request to ADR-12)", naming the library you would need. Do not choose an alternative mechanism yourself.
2. If docs/product/04-design has no English copy for the strings of S06, the S03 memorial dialog and export button, STOP and report: "Step 16 blocked — English copy missing for S06, S03 memorial/export (change request to 04-design-system)". Do not translate copy yourself.

Build:
1. Migration memorial_rpcs (npx supabase migration new memorial_rpcs): rpc:move_pet_to_memorial and rpc:restore_pet_from_memorial with the exact effects in EP-06 and EP-07 Side effects. Run npm run db:types.
2. lib/actions/memorial.ts: EP-06 and EP-07 as server actions wrapping those RPCs, returning ActionResult per 05- §3.6. lib/actions/pdf-export.ts: EP-16.
3. app/(app)/ljubimci/[id]/pdf-export-client.ts: render the PdfExportBundle into a PDF in the browser (ADR-12); attachments listed rather than embedded when ADR-12 Consequences apply.
4. S06: port docs/product/04-design/screens/memorials.tsx to app/(app)/uspomene/memorials-client.tsx with its page.tsx; data from EP-01 (lifecycle=memorial) and EP-43 usage; restore via EP-07; Free counter "n / 2"; PremiumLock on premium_required; remove the StateSwitcher; States per EP-01 and EP-07.
5. S03: add "Premesti u Uspomene" (dialog → EP-06, PremiumLock on premium_required, redirect to S06) and "Izvezi PDF" (PremiumLock when Entitlements.pdf_export is false; otherwise EP-16 → pdf-export-client) to app/(app)/ljubimci/[id]/pet-record-client.tsx from the mockup.
6. S01: add the Uspomene link from the mockup to app/(app)/ljubimci/pets-home-client.tsx.
7. Put every new string into lib/i18n (both dictionaries).

Do not invent:
- No colours, spacing, radii, fonts or components outside 04-design-system.md §4–§6 and the existing components/ui and components/app; do not edit components/ui or components/app.
- No packages outside 03-technical-constraints.md §4; do not add any dependency to package.json.
- No endpoints, fields, error codes or RPC names outside 05-api-integration-contract.md.
- No tables, columns or enum values outside 03-technical-constraints.md §5.
- No user-facing copy that is not in 04-design-system.md or docs/product/04-design.

Files: create or modify only these. Touching any other file requires stopping and asking.
- supabase/migrations/<timestamp>_memorial_rpcs.sql; the generated types file in lib/supabase/ (via npm run db:types only)
- lib/actions/memorial.ts, lib/actions/pdf-export.ts
- app/(app)/ljubimci/[id]/pdf-export-client.ts, app/(app)/ljubimci/[id]/pet-record-client.tsx
- app/(app)/uspomene/page.tsx, app/(app)/uspomene/memorials-client.tsx
- app/(app)/ljubimci/pets-home-client.tsx
- lib/i18n/sr-Latn.ts, lib/i18n/en.ts
- supabase/tests/memorial_rpcs.test.sql
- tests/memorial/memorials-screen.test.tsx, tests/memorial/memorial-dialog.test.tsx, tests/pdf/pdf-export.test.ts
- docs/product/06-build-plan.md (Step 16 row in §3 and the Step 16 Session log only)

Acceptance criteria (PRD v1.5, verbatim — each needs a passing test):
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
_(empty — append after the step runs)_

---

### Step 17 — Reminder lists & manual reminders

| | |
|---|---|
| **Status** | ⬜ not started |
| **Outcome** | Users see their reminder instances on S10 (Danas / Uskoro / Propušteno / Urađeno), on the S01 "Danas" strip and the S03 Pregled tab, mark them done in the product, and create, edit and delete manual reminders. |
| **Implements** | FR-20 (display), FR-21, FR-24 (in-app mark done) · EP-25, EP-26, EP-27 · S10 `/podsetnici`, S11 `/podsetnici/novi` and edit variant `/podsetnici/[id]` (route from the mockup header), S01 "Danas" strip, S03 Pregled "next 3" · tables `reminders`, `reminder_occurrences`, `dose_logs` (via EP-26) · ADR-15 flows "add vaccination and see the reminder", "mark done" |
| **Depends on** | Step 14 |
| **Blocked by** | — (prompt carries blocker checks: entry point to the S11 edit variant, English copy) |
| **Track** | single |

**Read before starting:**
- `docs/product/02-prd.md` §6 FR-20, FR-21, FR-24, FR-28, FR-29; §8 BR-12, BR-17, BR-18, BR-24, BR-48; §10 NFR-02
- `docs/product/03-technical-constraints.md` §5.5 `reminders`, `reminder_occurrences`, `reminder_preferences`; §7 row NFR-02
- `docs/product/04-design-system.md` §6 (ReminderRow, ReminderTypeIcon, StatusBadge), §8, §9, §11 rows S01, S03, S10, S11, §12 S01, S03, S10, S11
- `docs/product/04-design/screens/reminders.tsx`, `docs/product/04-design/screens/reminder-form.tsx` (header comment names the routes), `docs/product/04-design/screens/pets-home.tsx` ("Danas"), `docs/product/04-design/screens/pet-record.tsx` (Pregled reminders)
- `docs/product/04-design/components/reminder-row.tsx`
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
- `lib/i18n/sr-Latn.ts`, `lib/i18n/en.ts` (add keys)
- `supabase/tests/list_reminder_occurrences.test.sql`, `supabase/tests/mark_occurrence_done.test.sql`, `supabase/tests/manual_reminders.test.sql`
- `tests/reminders/reminders-screen.test.tsx`, `tests/reminders/reminder-form.test.tsx`, `tests/reminders/danas-strip.test.tsx`
- `e2e/vaccination-reminder.spec.ts`, `e2e/mark-done.spec.ts`
- `docs/product/06-build-plan.md` (Step 17 row in §3 and the Step 17 Session log only)

**Out of bounds:** S12 reminder settings (Step 18); delivery by email/push and the action link (Step 19); meal schedule (Step 20); `AppShell` count badges (no source defined in 05-); any schema change other than the two RPCs; `components/ui`, `components/app` (including adding an edit affordance to `ReminderRow`).

**Acceptance criteria:** (PRD v1.5, verbatim)
- FR-20 — Given a vaccination next-dose date, treatment frequency, vet-visit check-up date, meal schedule, or date of birth, When saved, Then the corresponding reminder exists without further action. *(display side: the created reminder's instances are listed; meal schedules are verified in Step 20)*
- FR-21 — Given a manual reminder with repeat "monthly", When its time passes, Then the next occurrence is scheduled one month later.
- FR-21 — Given an existing manual reminder, When its owner edits or deletes it, Then future occurrences change or disappear; past history is kept.
- FR-24 — Given a delivered reminder, When the user marks it done (from the message or in the product), Then it is shown as done with time and user. *(this step: in the product)*

**Tests to ship:**
- FR-20 (display) → `supabase/tests/list_reminder_occurrences.test.sql` (instances from a vaccination, a treatment, a vet visit and a birthday appear under the right filter; inactive reminders and memorial pets never appear; members see shared-pet instances only when opted in; Europe/Belgrade day boundary for `today`) and `e2e/vaccination-reminder.spec.ts` (ADR-15: add a vaccination with a next-dose date, then see the reminder on S10 and on S03 Pregled)
- FR-21 (monthly) → `supabase/tests/manual_reminders.test.sql` (occurrences of a monthly manual reminder fall one calendar month apart in Europe/Belgrade)
- FR-21 (edit/delete) → `supabase/tests/manual_reminders.test.sql` (update regenerates future pending rows and keeps done/missed rows; delete removes the reminder) and `tests/reminders/reminder-form.test.tsx` (create, edit prefill, "Obriši podsetnik" AlertDialog; `in_past`, `required`, `too_long` inline)
- FR-24 (in product) → `supabase/tests/mark_occurrence_done.test.sql` (every row of the instance done with `done_at`/`done_by`; idempotent; `treatment_dose` inserts a dose log once; read-only household → `household_read_only`), `tests/reminders/reminders-screen.test.tsx` (row moves to Urađeno with time and first name), `tests/reminders/danas-strip.test.tsx`, and `e2e/mark-done.spec.ts` (ADR-15 "mark done")

**Verification:**
```
npm run typecheck      # expect: exit 0
npm run lint           # expect: exit 0
npm test               # expect: all Vitest suites pass, including the three files above
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
- docs/product/04-design-system.md §6, §8, §9, §11 rows S01, S03, S10, S11, §12 S01, S03, S10, S11
- docs/product/04-design/screens/reminders.tsx, docs/product/04-design/screens/reminder-form.tsx, docs/product/04-design/screens/pets-home.tsx, docs/product/04-design/screens/pet-record.tsx
- docs/product/04-design/components/reminder-row.tsx
- docs/product/05-api-integration-contract.md §3.4; §4.4 rows EP-25 – EP-27; §5.3 preamble, EP-25, EP-26, EP-27; §6 ReminderOccurrence, Reminder, ReminderPreference; §7.3
- docs/product/06-build-plan.md §4, §5, §6, and the Session logs of Steps 08, 13, 14 and 15

Blocker checks — do these before writing any code:
1. The S11 edit variant has a route (/podsetnici/[id], header comment of reminder-form.tsx) but no designed entry point: ReminderRow has no edit control and 05- EP-27 says update/get/delete have no screen in Design v1.3. If docs/product/04-design-system.md and docs/product/04-design still define no control that opens the edit variant, STOP and report: "Step 17 blocked — no designed entry point to the S11 edit variant (change request to 04-design-system)". Do not add a control yourself.
2. If docs/product/04-design has no English copy for the strings of S10, S11 and the S01/S03 reminder blocks, STOP and report: "Step 17 blocked — English copy missing for S10, S11 (change request to 04-design-system)". Do not translate copy yourself.

Build:
1. Migration reminder_occurrence_rpcs (npx supabase migration new reminder_occurrence_rpcs): rpc:list_reminder_occurrences and rpc:mark_occurrence_done exactly as EP-25 and EP-26 (filters, sorting, counts, instance rule, authorization, side effects) and the ReminderOccurrence schema define. Run npm run db:types.
2. S10: port docs/product/04-design/screens/reminders.tsx to app/(app)/podsetnici/reminders-client.tsx with its page.tsx; tabs map to EP-25 filters today / upcoming / missed / done with "Učitaj još" for paged tabs (05- §3.4); "Urađeno" → EP-26; rows rendered with ReminderRow from ReminderOccurrence fields; remove the StateSwitcher; loading / default / empty / error per EP-25 States.
3. S11: port docs/product/04-design/screens/reminder-form.tsx to app/(app)/podsetnici/novi/reminder-form-client.tsx with app/(app)/podsetnici/novi/page.tsx (create) and app/(app)/podsetnici/[id]/page.tsx (edit variant, prefilled from EP-27 get, "Obriši podsetnik" → EP-27 delete). Pet picker from EP-01 (active pets) plus "Samo za mene"; convert the Belgrade date + HH:MM to UTC as EP-27 states; field codes inline. Remove the StateSwitcher.
4. S01: replace the empty "Danas" card from Step 13 with EP-25 filter=today (first 3) and "Urađeno" → EP-26, as the mockup shows.
5. S03: add the Pregled tab's next-3 reminders (EP-25 filter=next, pet_id, limit=3) and the "Svi podsetnici" link from the mockup.
6. Put every new string into lib/i18n (both dictionaries).

Do not invent:
- No colours, spacing, radii, fonts or components outside 04-design-system.md §4–§6 and the existing components/ui and components/app; do not edit components/ui or components/app.
- No packages outside 03-technical-constraints.md §4; do not add any dependency to package.json.
- No endpoints, fields, error codes or RPC names outside 05-api-integration-contract.md.
- No tables, columns or enum values outside 03-technical-constraints.md §5.
- No user-facing copy that is not in 04-design-system.md or docs/product/04-design.

Files: create or modify only these. Touching any other file requires stopping and asking.
- supabase/migrations/<timestamp>_reminder_occurrence_rpcs.sql; the generated types file in lib/supabase/ (via npm run db:types only)
- app/(app)/podsetnici/page.tsx, app/(app)/podsetnici/reminders-client.tsx
- app/(app)/podsetnici/novi/page.tsx, app/(app)/podsetnici/novi/reminder-form-client.tsx, app/(app)/podsetnici/[id]/page.tsx
- app/(app)/ljubimci/pets-home-client.tsx, app/(app)/ljubimci/[id]/pet-record-client.tsx
- lib/i18n/sr-Latn.ts, lib/i18n/en.ts
- supabase/tests/list_reminder_occurrences.test.sql, supabase/tests/mark_occurrence_done.test.sql, supabase/tests/manual_reminders.test.sql
- tests/reminders/reminders-screen.test.tsx, tests/reminders/reminder-form.test.tsx, tests/reminders/danas-strip.test.tsx
- e2e/vaccination-reminder.spec.ts, e2e/mark-done.spec.ts
- docs/product/06-build-plan.md (Step 17 row in §3 and the Step 17 Session log only)

Acceptance criteria (PRD v1.5, verbatim — each needs a passing test):
- Given a vaccination next-dose date, treatment frequency, vet-visit check-up date, meal schedule, or date of birth, When saved, Then the corresponding reminder exists without further action. (Display side; meal schedules are verified in Step 20.)
- Given a manual reminder with repeat "monthly", When its time passes, Then the next occurrence is scheduled one month later.
- Given an existing manual reminder, When its owner edits or deletes it, Then future occurrences change or disappear; past history is kept.
- Given a delivered reminder, When the user marks it done (from the message or in the product), Then it is shown as done with time and user. (This step: in the product.)

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
_(empty — append after the step runs)_

---

### Step 18 — Reminder settings, email & push channels

| | |
|---|---|
| **Status** | ⬜ not started |
| **Outcome** | On S12 a user sets lead times, delivery time and channels per reminder type, turns web push on or off for the current browser (with the iPhone home-screen hint), and sees WhatsApp as Premium-only / not yet connectable. |
| **Implements** | FR-22, FR-23 (email/push part), FR-36 (channels) · EP-28, EP-29, EP-31 · S12 `/podesavanja/podsetnici` · tables `reminder_preferences`, `push_subscriptions` (read: `user_channels`, `app_settings`, `reminder_deliveries`) · ADR-05 (service worker) |
| **Depends on** | Step 17 |
| **Blocked by** | — (prompt carries blocker checks: S12 WhatsApp section before Step 29, English copy) |
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
- `lib/i18n/sr-Latn.ts`, `lib/i18n/en.ts` (add keys)
- `supabase/tests/reminder_preferences.test.sql`, `supabase/tests/push_subscriptions.test.sql`
- `tests/reminder-settings/reminder-settings.test.tsx`, `tests/reminder-settings/push-toggle.test.tsx`
- `docs/product/06-build-plan.md` (Step 18 row in §3 and the Step 18 Session log only)

**Out of bounds:** sending anything (Step 19); EP-30 and the WhatsApp adapter (Step 29); Viber (stays hidden, BR-14b); the S18 link target beyond the existing route; any schema change other than the three RPCs; `components/ui`, `components/app`.

**Acceptance criteria:** (PRD v1.5, verbatim)
- FR-22 — Given a reminder type (e.g., vaccinations), When the user sets several lead times (e.g., 7 days before and on the day) and a delivery time, Then a notice is sent at each lead time at that time of day. *(this step: the occurrences are scheduled at each lead time; sending is Step 19)*
- FR-22 — Given medication doses and meals, Then they are always delivered at the exact scheduled time with no lead time.
- FR-23 — Given any user, When choosing channels, Then email and push are available.
- FR-23 — Given a Free user, When opening the channel choice, Then WhatsApp and Viber are shown as Premium-only.
- FR-23 — Given any reminder type, When the user selects several available channels (e.g., email and Viber), Then the reminder is delivered on each selected channel. *(this step: several channels are stored per type; delivery is Step 19)*
- FR-36 — Given a Free owner, Then limits are: 1 active pet, 2 memorials, 10 attachments per pet, 5 moments per pet, email and push channels only, no PDF export, no household sharing, logo always on shared images. *(this step: email and push channels only)*

**Tests to ship:**
- FR-22 (lead times + delivery time) → `supabase/tests/reminder_preferences.test.sql` (upserting `{10080, 0}` at 09:00 regenerates future pending occurrences with one `notify_at` per lead time at 09:00 Europe/Belgrade; done/missed rows untouched) and `tests/reminder-settings/reminder-settings.test.tsx` (lead-time chips and time saved per type card)
- FR-22 (doses and meals exact) → `supabase/tests/reminder_preferences.test.sql` (`lead_minutes` stored as `{0}` and `delivery_time` null for `treatment_dose` and `meal`) and `tests/reminder-settings/reminder-settings.test.tsx` ("Stižu tačno u zadato vreme" shown, no lead-time chips)
- FR-23 (email and push available) → `tests/reminder-settings/reminder-settings.test.tsx` and `tests/reminder-settings/push-toggle.test.tsx` (register / check / unregister through EP-29; "blokirano" when permission is denied; iPhone hint card when not installed)
- FR-23 (Free sees Premium-only) and FR-36 (channels) → `tests/reminder-settings/reminder-settings.test.tsx` (WhatsApp checkbox in PremiumLock for Free; Viber absent while `viber_enabled = false`) and `supabase/tests/reminder_preferences.test.sql` (`whatsapp` on Free → `premium_required`, `viber` while off → `channel_disabled`)
- FR-23 (several channels stored) → `supabase/tests/reminder_preferences.test.sql` (`{email, push}` stored and returned by `get_reminder_settings`)
- EP-29 register re-assignment → `supabase/tests/push_subscriptions.test.sql` (endpoint stored for another user is re-assigned to the caller)

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

Blocker checks — do these before writing any code:
1. The S12 "Kanali" card's WhatsApp connection (number → "Pošalji kod" → code → "Povezano") calls EP-30, which is built in Step 29. 04-design-system.md §12 S12 defines a G (Premium-locked) state for Free users but no "not yet available" state for Premium users. Check docs/product/04-design-system.md and docs/product/04-design/screens/reminder-settings.tsx: if they define no state for a Premium user before WhatsApp connection exists, STOP and report: "Step 18 blocked — S12 has no designed state for the WhatsApp section before Step 29 (change request to 04-design-system, or move the section to Step 29)". Do not design that state.
2. If docs/product/04-design has no English copy for the strings of S12, STOP and report: "Step 18 blocked — English copy missing for S12 (change request to 04-design-system)". Do not translate copy yourself.

Build:
1. Migration reminder_settings_rpcs (npx supabase migration new reminder_settings_rpcs): rpc:get_reminder_settings (EP-28 get), rpc:register_push_subscription (EP-29 register, security definer re-assignment as written), rpc:get_channel_usage (EP-31, ChannelUsage schema). The reminder_preferences upsert of EP-28 is a Data API write: its validation (lead_minutes set, delivery_time, channels incl. premium_required / whatsapp_not_connected / channel_disabled) and its side effect (regenerating future pending occurrences) must be enforced in the database, using only existing 03- §5.5 columns. Run npm run db:types.
2. public/sw.js: register from S12; on push, show a notification from the 05- §9.4 Web Push payload; on click, open `url` (the done_url action is wired in Step 19). The VAPID public key is NEXT_PUBLIC_VAPID_PUBLIC_KEY (EP-29 Callers).
3. S12: port docs/product/04-design/screens/reminder-settings.tsx to app/(app)/podesavanja/podsetnici/reminder-settings-client.tsx with its page.tsx. One card per type from EP-28 get (always 6); each card saves with EP-28 update; WhatsApp checkbox Premium-locked on Free; Viber absent while viber_enabled = false; push row from the browser permission plus EP-29 check; register/unregister via EP-29; iPhone hint card per ADR-05 (client-side detection); WhatsApp counter from EP-31 only when Premium. Remove the StateSwitcher; drive default / premium_locked / push-on / push-blocked from real responses per EP-28, EP-29 States and 05- §7.3.
4. Put every new string into lib/i18n (both dictionaries).

Do not invent:
- No colours, spacing, radii, fonts or components outside 04-design-system.md §4–§6 and the existing components/ui and components/app; do not edit components/ui or components/app. The compact inline PremiumLock is a proposed composite (OQ-10) — use PremiumLock as it exists.
- No packages outside 03-technical-constraints.md §4; do not add any dependency to package.json.
- No endpoints, fields, error codes or RPC names outside 05-api-integration-contract.md.
- No tables, columns or enum values outside 03-technical-constraints.md §5.
- No user-facing copy that is not in 04-design-system.md or docs/product/04-design.

Files: create or modify only these. Touching any other file requires stopping and asking.
- supabase/migrations/<timestamp>_reminder_settings_rpcs.sql; the generated types file in lib/supabase/ (via npm run db:types only)
- app/(app)/podesavanja/podsetnici/page.tsx, app/(app)/podesavanja/podsetnici/reminder-settings-client.tsx
- public/sw.js
- lib/i18n/sr-Latn.ts, lib/i18n/en.ts
- supabase/tests/reminder_preferences.test.sql, supabase/tests/push_subscriptions.test.sql
- tests/reminder-settings/reminder-settings.test.tsx, tests/reminder-settings/push-toggle.test.tsx
- docs/product/06-build-plan.md (Step 18 row in §3 and the Step 18 Session log only)

Acceptance criteria (PRD v1.5, verbatim — each needs a passing test):
- Given a reminder type (e.g., vaccinations), When the user sets several lead times (e.g., 7 days before and on the day) and a delivery time, Then a notice is sent at each lead time at that time of day. (This step: occurrences scheduled at each lead time; sending is Step 19.)
- Given medication doses and meals, Then they are always delivered at the exact scheduled time with no lead time.
- Given any user, When choosing channels, Then email and push are available.
- Given a Free user, When opening the channel choice, Then WhatsApp and Viber are shown as Premium-only.
- Given any reminder type, When the user selects several available channels (e.g., email and Viber), Then the reminder is delivered on each selected channel. (This step: several channels stored per type; delivery is Step 19.)
- Given a Free owner, Then limits are: 1 active pet, 2 memorials, 10 attachments per pet, 5 moments per pet, email and push channels only, no PDF export, no household sharing, logo always on shared images. (This step: email and push channels only.)

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
_(empty — append after the step runs)_

---

### Step 19 — Reminder dispatch job & message actions

| | |
|---|---|
| **Status** | ⬜ not started |
| **Outcome** | Every minute pg_cron calls the dispatch route, which claims due occurrences and delivers them by email (Resend) and web push with a signed "Urađeno" link, re-sends once after 30 minutes, marks missed, falls back from WhatsApp/Viber to email + push, and alerts the Operator when deliveries stop. |
| **Implements** | FR-20, FR-24, FR-25 (fallback), NFR-01, NFR-02 · EP-32, EP-33 · route handlers `/api/internal/dispatch`, `/api/a/done` · tables `reminder_occurrences`, `reminder_deliveries`, `push_subscriptions` · ADR-04, ADR-05, ADR-08 · API §9.3, §9.4 · RISK-14, RISK-19, RISK-22 |
| **Depends on** | Step 18 |
| **Blocked by** | — (prompt carries blocker checks: email/push copy and Resend template ids, web-push sending without an approved library, pg_cron secret and app URL, location of the action-token module) |
| **Track** | single |

**Read before starting:**
- `docs/product/02-prd.md` §6 FR-20, FR-22, FR-23, FR-24, FR-25, FR-29; §8 BR-13 – BR-17, BR-24; §9 E-05, E-06; §10 NFR-01, NFR-02
- `docs/product/03-technical-constraints.md` §3 ADR-04, ADR-05, ADR-08; §5.5 (all tables); §7 rows NFR-01, NFR-02; §8 scheduled jobs; §10 RISK-14, RISK-15
- `docs/product/04-design-system.md` §9 (copy, formats, pet names in nominative); §11 row S10
- `docs/product/05-api-integration-contract.md` §5.3 preamble, EP-26 (side effects reused), EP-32, EP-33; §7.2 (`invalid_action_token`, `invalid_signature`, `whatsapp_cap_reached`); §9.3; §9.4; §12 row `job`; §15 RISK-19, RISK-22
- `docs/product/06-build-plan.md` §4, §5, §6 and the Session logs of Steps 02, 08, 17, 18

**Files this step may touch:**
- `supabase/migrations/*_reminder_dispatch.sql` (new: `rpc:claim_due_occurrences` and the re-send / missed / watchdog queries EP-33 describes; pg_cron schedule calling the route via `pg_net` every minute)
- `lib/supabase/` generated types file (via `npm run db:types` only)
- `app/api/internal/dispatch/route.ts` (new, EP-33)
- `app/api/a/done/route.ts` (new, EP-32)
- `lib/integrations/resend.ts` (new: send with template id + locale + variables, retries per §9.4)
- `lib/integrations/webpush.ts` (new: VAPID send, deletes endpoints answering 404/410)
- the action-token module (sign/verify per §9.3) — **path pending the ADR-16 change request** (see blocker check 4)
- `public/sw.js` (modify: notification click opens `done_url` for "Urađeno")
- `lib/i18n/sr-Latn.ts`, `lib/i18n/en.ts` (add keys for the EP-32 confirmation and error pages)
- `supabase/tests/claim_due_occurrences.test.sql`, `supabase/tests/dispatch_resend_missed.test.sql`, `supabase/tests/dispatch_dst.test.sql`
- `tests/dispatch/dispatch-route.test.ts`, `tests/dispatch/channel-resolution.test.ts`, `tests/dispatch/action-done-route.test.ts`, `tests/integrations/resend.test.ts`, `tests/integrations/webpush.test.ts`, `tests/integrations/action-tokens.test.ts`
- `docs/product/06-build-plan.md` (Step 19 row in §3 and the Step 19 Session log only)

**Out of bounds:** WhatsApp and Viber sending, the WhatsApp webhook and EP-30 (Step 29 — in this step `whatsapp`/`viber` channels always resolve to the fallback); Premium expiry notices (EP-49, Step 30); invitation, transfer and request emails (Steps 22, 25); RISK-19's one-click confirm page for cookie-less requests and any scanner user-agent list (not specified — log as follow-up); any table or column change; `components/ui`, `components/app`.

**Acceptance criteria:** (PRD v1.5, verbatim)
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
- RISK-14 watchdog → `tests/dispatch/dispatch-route.test.ts` (Operator emailed once per hour when pending rows are > 15 min overdue and no delivery in 15 min)

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
- docs/product/03-technical-constraints.md §3 ADR-04, ADR-05, ADR-08; §5.5; §7 rows NFR-01, NFR-02; §8; §10 RISK-14, RISK-15
- docs/product/04-design-system.md §9; §11 row S10
- docs/product/05-api-integration-contract.md §5.3 preamble, EP-26, EP-32, EP-33; §7.2; §9.3; §9.4; §12; §15 RISK-19, RISK-22
- docs/product/06-build-plan.md §4, §5, §6, and the Session logs of Steps 02, 08, 17 and 18

Blocker checks — do all four before writing any code, and report every one that fails in a single message:
1. Copy: the reminder email (subject and body per type), the push notification title/body, and the EP-32 confirmation and error pages need user-facing text in Serbian and English, and 05- §9.4 says Resend is called with a "template id". If docs/product/04-design-system.md / docs/product/04-design define neither that copy nor the template ids, STOP and report: "Step 19 blocked — reminder email/push/confirmation copy and Resend template ids are not designed (change request to 04-design-system and 05-)". Do not write copy.
2. Web push: ADR-05 approves standard Web Push with VAPID but 03- §4 names no library. If sending an encrypted push message requires a package not already in package.json, STOP and report: "Step 19 blocked — web push sending needs a library not approved in 03- (change request to ADR-05)", naming it. Do not install it and do not hand-write the payload encryption.
3. Scheduling: pg_cron must call POST /api/internal/dispatch with the X-Dispatch-Secret header (EP-33, ADR-04). 03-/05- do not say how the database obtains the app URL and DISPATCH_SECRET for each environment. If no mechanism is defined, STOP and report: "Step 19 blocked — how pg_cron gets the dispatch URL and secret is unspecified (change request to 03- ADR-04)". Do not choose a secret store.
4. ADR-16 lists lib/supabase, lib/actions, lib/integrations and lib/i18n only; the action-token signing and verification of 05- §9.3 (used here and by Steps 22 and 25) has no defined location. If ADR-16 still names no location, STOP and report: "Step 19 blocked — no ADR-16 location for the action-token module (change request to ADR-16)". Do not create a new lib folder.

Build (only after every blocker check passes):
1. Migration reminder_dispatch (npx supabase migration new reminder_dispatch): rpc:claim_due_occurrences and the re-send / missed / watchdog queries exactly as EP-33 Side effects 1, 6, 7, 8 describe, and the pg_cron schedule (every minute, pg_net) using the mechanism settled in blocker check 3. No new tables or columns. Run npm run db:types.
2. lib/integrations/resend.ts and lib/integrations/webpush.ts per 05- §9.4 (payloads, retries, permanent-failure handling). Call Resend through its HTTP API with the platform fetch; do not add Resend's SDK package.
3. The action-token module at the location settled in blocker check 4: sign and verify per 05- §9.3 using the action-token secret from the Step 02 env example; dn_ tokens single-use, 24 h, bound to occurrence and recipient.
4. app/api/internal/dispatch/route.ts: EP-33 exactly — secret check in constant time, then steps 1–8 in order within the 45 s budget, batches of ≤ 200, response counters. Channel resolution per EP-33 step 3; in this step WhatsApp/Viber always resolve to the fallback {email, push} because no user_channels row can exist yet. One reminder_deliveries row per recipient × channel (step 5).
5. app/api/a/done/route.ts: EP-32 exactly — token check, same effect as EP-26 with done_by = recipient, HEAD and Purpose/Sec-Purpose: prefetch guard, localized HTML page (recipient's profiles.locale) or JSON with Accept: application/json; error pages for invalid_action_token, not_found, household_read_only. Render the pages with the existing AuthShell/PublicShell composite and Card only. RISK-19's one-click confirm page and scanner user-agent list are not specified: do not implement them; record them as a follow-up in the Session log.
6. public/sw.js: on notification click for the done action, open done_url.
7. Put every new string into lib/i18n (both dictionaries), using only the copy settled in blocker check 1.

Do not invent:
- No colours, spacing, radii, fonts or components outside 04-design-system.md §4–§6 and the existing components/ui and components/app; do not edit components/ui or components/app.
- No packages outside 03-technical-constraints.md §4; do not add any dependency to package.json.
- No endpoints, fields, error codes or RPC names outside 05-api-integration-contract.md.
- No tables, columns or enum values outside 03-technical-constraints.md §5.
- No user-facing copy that is not in 04-design-system.md or docs/product/04-design.

Files: create or modify only these. Touching any other file requires stopping and asking.
- supabase/migrations/<timestamp>_reminder_dispatch.sql; the generated types file in lib/supabase/ (via npm run db:types only)
- app/api/internal/dispatch/route.ts, app/api/a/done/route.ts
- lib/integrations/resend.ts, lib/integrations/webpush.ts
- the action-token module at the path settled in blocker check 4 (one file)
- public/sw.js
- lib/i18n/sr-Latn.ts, lib/i18n/en.ts
- supabase/tests/claim_due_occurrences.test.sql, supabase/tests/dispatch_resend_missed.test.sql, supabase/tests/dispatch_dst.test.sql
- tests/dispatch/dispatch-route.test.ts, tests/dispatch/channel-resolution.test.ts, tests/dispatch/action-done-route.test.ts, tests/integrations/resend.test.ts, tests/integrations/webpush.test.ts, tests/integrations/action-tokens.test.ts
- docs/product/06-build-plan.md (Step 19 row in §3 and the Step 19 Session log only)

Acceptance criteria (PRD v1.5, verbatim — each needs a passing test):
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

When verification passes: update the Step 19 row in docs/product/06-build-plan.md §3 (Status ✅, Done = today's date), append a Session log entry under Step 19 (date, what was built, the output of each verification command, deviations, follow-ups — include the RISK-19 one-click confirm follow-up), then commit with the message "Step 19: Reminder dispatch job & message actions".

If anything above is ambiguous, if a referenced section doesn't contain what this prompt says it does, or if completing this step would require touching a file outside the list or making a decision the referenced documents don't settle — STOP and ask. Do not choose a reasonable default. Do not proceed with a partial implementation.
```

#### Session log
_(empty — append after the step runs)_

---

### Step 20 — Care log & meal reminders

| | |
|---|---|
| **Status** | ⬜ not started |
| **Outcome** | Owners and household members log feeding and stool on S07 without limits; the owner sets a meal schedule that creates meal reminders at the exact times on the chosen days. |
| **Implements** | FR-14, FR-15, FR-16, FR-20 (meal schedule), FR-28 (feeding/stool) · EP-17, EP-18, EP-19 · S07 `/ljubimci/[id]/dnevnik`, S03 link to Dnevnik · tables `feeding_entries`, `stool_entries`, `reminders` (type `meal`) |
| **Depends on** | Step 19 |
| **Blocked by** | — (prompt carries a blocker check: English copy) |
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
- `lib/i18n/sr-Latn.ts`, `lib/i18n/en.ts` (add keys)
- `supabase/tests/care_log_api.test.sql`, `supabase/tests/set_meal_schedule.test.sql`
- `tests/care-log/care-log-screen.test.tsx`, `tests/care-log/meal-schedule-card.test.tsx`
- `docs/product/06-build-plan.md` (Step 20 row in §3 and the Step 20 Session log only)

**Out of bounds:** moments (Step 21); reminder settings and dispatch code (Steps 18, 19 — meal delivery uses them unchanged); any table or column change; `components/ui`, `components/app`.

**Acceptance criteria:** (PRD v1.5, verbatim)
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

Blocker check — before writing any code: if docs/product/04-design has no English copy for the strings of S07, STOP and report: "Step 20 blocked — English copy missing for S07 (change request to 04-design-system)". Do not translate copy yourself.

Build:
1. Migration care_log_api (npx supabase migration new care_log_api): view:feeding_entries_api, view:stool_entries_api and view:meal_schedules_api as §5.1 Part A and the FeedingEntry / StoolEntry / MealSchedule schemas define (security_invoker, per-entry access), and rpc:set_meal_schedule exactly as EP-19 defines (one meal reminder per pet, occurrences at exact times). EP-18 field rules not yet enforced may be added only as check constraints on existing 03- §5.4 columns. Run npm run db:types.
2. S07: port docs/product/04-design/screens/care-log.tsx to app/(app)/ljubimci/[id]/dnevnik/care-log-client.tsx with its page.tsx. Pet header from EP-01 (id filter); tabs Ishrana / Stolica from EP-17 (paged, "Učitaj još"); quick-add, edit and delete Dialogs through EP-18 (fed_at / observed_at built from date + HH:MM Europe/Belgrade as EP-18 states); edit/delete hidden where access.can_edit = false; "Podsetnici za obroke" card from EP-19 get and saved with EP-19 set (hidden controls for members). Remove the StateSwitcher; loading / default / empty per EP-17 States.
3. S03: add the Dnevnik link from the mockup to app/(app)/ljubimci/[id]/pet-record-client.tsx.
4. Put every new string into lib/i18n (both dictionaries).

Do not invent:
- No colours, spacing, radii, fonts or components outside 04-design-system.md §4–§6 and the existing components/ui and components/app; do not edit components/ui or components/app.
- No packages outside 03-technical-constraints.md §4; do not add any dependency to package.json.
- No endpoints, fields, error codes or RPC names outside 05-api-integration-contract.md.
- No tables, columns or enum values outside 03-technical-constraints.md §5.
- No user-facing copy that is not in 04-design-system.md or docs/product/04-design.

Files: create or modify only these. Touching any other file requires stopping and asking.
- supabase/migrations/<timestamp>_care_log_api.sql; the generated types file in lib/supabase/ (via npm run db:types only)
- app/(app)/ljubimci/[id]/dnevnik/page.tsx, app/(app)/ljubimci/[id]/dnevnik/care-log-client.tsx
- app/(app)/ljubimci/[id]/pet-record-client.tsx
- lib/i18n/sr-Latn.ts, lib/i18n/en.ts
- supabase/tests/care_log_api.test.sql, supabase/tests/set_meal_schedule.test.sql
- tests/care-log/care-log-screen.test.tsx, tests/care-log/meal-schedule-card.test.tsx
- docs/product/06-build-plan.md (Step 20 row in §3 and the Step 20 Session log only)

Acceptance criteria (PRD v1.5, verbatim — each needs a passing test):
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
_(empty — append after the step runs)_

---

### Step 21 — Moments & public links

| | |
|---|---|
| **Status** | ⬜ not started |
| **Outcome** | Owners and members create moments with up to 5 photos (Free: 5 moments per pet), share a moment as an image composed in the browser (logo removable on Premium only), and publish or disable a public link that visitors open at `/t/[slug]` without signing in. |
| **Implements** | FR-17, FR-18, FR-19, FR-36 (moments, logo) · EP-15 (`moment_photo`), EP-20, EP-21, EP-22, EP-23, EP-24, EP-05 (public-cache purge part) · S08 `/ljubimci/[id]/trenuci`, S09 `/t/[slug]`, S03 link to Trenuci · tables `moments`, `moment_photos`, `moment_public_links` |
| **Depends on** | Step 15 |
| **Blocked by** | — (prompt carries blocker checks: public-cache purge mechanism, browser image composition without an approved library, English copy) |
| **Track** | single |

**Read before starting:**
- `docs/product/02-prd.md` §6 FR-17, FR-18, FR-19, FR-36; §8 BR-01, BR-02, BR-06, BR-22, BR-23, BR-37, BR-45, BR-52; §9 E-07, E-08, E-25
- `docs/product/03-technical-constraints.md` §3 ADR-03, ADR-07; §4; §5.4 `moments`, `moment_photos`, `moment_public_links`
- `docs/product/04-design-system.md` §5.3 (Public shell), §6 (PremiumLock, LogoMark, EmptyState), §7 (moment photos), §8, §9, §11 rows S08, S09, §12 S08, S09
- `docs/product/04-design/screens/moments.tsx`, `docs/product/04-design/screens/public-moment.tsx`, `docs/product/04-design/screens/pet-record.tsx` (Trenuci link)
- `docs/product/05-api-integration-contract.md` §4.4 rows EP-15, EP-20 – EP-24; §5.1 Part A, EP-05 (side effects), EP-15, EP-20, EP-21, EP-22, EP-23, EP-24; §6 `Moment`, `MomentPhoto`, `PublicMoment`, `UploadTicket`, `FileUrl`; §7.2; §7.3 rows *premium_locked*, *link_disabled*; §10; §13 row FR-18
- `docs/product/06-build-plan.md` §4, §5, §6 and the Session logs of Steps 07, 13, 15

**Files this step may touch:**
- `supabase/migrations/*_moments_api.sql` (new: `view:moments_api`)
- `lib/supabase/` generated types file (via `npm run db:types` only)
- `lib/actions/moments.ts` (new: EP-21 `prepare_moment` / `confirm_moment`, EP-22 `delete_moment`, EP-23 `set_moment_public_link`)
- `lib/actions/files.ts` (modify: kind `moment_photo`)
- `lib/actions/pets.ts` (modify: add the public-moment cache purge to EP-05)
- the public-cache purge module — **path and mechanism pending the change request** (see blocker check 1)
- `app/api/public/moments/[slug]/route.ts` (new, EP-24)
- `app/(public)/t/[slug]/page.tsx`, `app/(public)/t/[slug]/public-moment-client.tsx` (new, S09)
- `app/(app)/ljubimci/[id]/trenuci/page.tsx`, `app/(app)/ljubimci/[id]/trenuci/moments-client.tsx`, `app/(app)/ljubimci/[id]/trenuci/share-image.ts` (new, S08 and browser image composition)
- `app/(app)/ljubimci/[id]/pet-record-client.tsx` (modify: Trenuci link)
- `lib/i18n/sr-Latn.ts`, `lib/i18n/en.ts` (add keys)
- `supabase/tests/moments_api.test.sql`
- `tests/moments/moment-actions.test.ts`, `tests/moments/public-link.test.ts`, `tests/moments/public-moment-route.test.ts`, `tests/moments/share-image.test.ts`, `tests/moments/moments-screen.test.tsx`
- `docs/product/06-build-plan.md` (Step 21 row in §3 and the Step 21 Session log only)

**Out of bounds:** organisation public pages (Step 26); any CDN or cache configuration outside the module settled in blocker check 1; any package for image composition; any table or column change; `components/ui`, `components/app`.

**Acceptance criteria:** (PRD v1.5, verbatim)
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
- FR-19 (visitor sees only the moment) → `tests/moments/public-moment-route.test.ts` (response contains exactly the `PublicMoment` fields; `Cache-Control` and `X-Robots-Tag` headers; no session needed)
- FR-19 (disable) → `tests/moments/public-link.test.ts` (`set_moment_public_link` false → purge called; EP-24 returns `404` → S09 *link_disabled*)
- FR-19 (moment deleted) → `tests/moments/moment-actions.test.ts` (`delete_moment` cascades the link, queues photo keys, purges the slug) and `supabase/tests/moments_api.test.sql` (cascade removes `moment_public_links`)
- EP-05 purge → `tests/moments/moment-actions.test.ts` (deleting a pet purges every collected slug)

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
- docs/product/03-technical-constraints.md §3 ADR-03, ADR-07; §4; §5.4 moments, moment_photos, moment_public_links
- docs/product/04-design-system.md §5.3, §6, §7, §8, §9, §11 rows S08 and S09, §12 S08 and S09
- docs/product/04-design/screens/moments.tsx, docs/product/04-design/screens/public-moment.tsx, docs/product/04-design/screens/pet-record.tsx (Trenuci link)
- docs/product/05-api-integration-contract.md §4.4 rows EP-15, EP-20 – EP-24; §5.1 Part A, EP-05, EP-15, EP-20, EP-21, EP-22, EP-23, EP-24; §6 Moment, MomentPhoto, PublicMoment, UploadTicket, FileUrl; §7.2; §7.3; §10; §13 row FR-18
- docs/product/06-build-plan.md §4, §5, §6, and the Session logs of Steps 07, 13 and 15

Blocker checks — do all three before writing any code, and report every one that fails in a single message:
1. EP-22, EP-23 and EP-05 require purging the CDN cache for /t/{slug} and /api/public/moments/{slug} immediately, but 03- and 05- name no purge mechanism, no adapter in ADR-16's lib/integrations list, and no environment variables for it (the Step 02 env example does not include any). If no mechanism is defined, STOP and report: "Step 21 blocked — public-cache purge mechanism unspecified (change request to 03- ADR-03/ADR-16 and 05- EP-23)". Do not choose one.
2. FR-18's image is composed in the browser (05- §13 row FR-18) and 03- names no library for it. If composing the image requires any package not already in package.json, STOP and report: "Step 21 blocked — share-as-image needs a library not approved in 03- (change request to 03-)", naming it. Do not install it.
3. If docs/product/04-design has no English copy for the strings of S08 and S09, STOP and report: "Step 21 blocked — English copy missing for S08, S09 (change request to 04-design-system)". Do not translate copy yourself.

Build (only after every blocker check passes):
1. Migration moments_api (npx supabase migration new moments_api): view:moments_api as §5.1 Part A and the Moment / MomentPhoto schemas define. EP-21 field rules not yet enforced (text ≤ 280 chars, BR-52) may be added only as check constraints on existing 03- §5.4 columns. Run npm run db:types.
2. lib/actions/moments.ts: EP-21 prepare_moment / confirm_moment (stateless draft token, R2 HEAD verification, one transaction), EP-22 delete_moment, EP-23 set_moment_public_link (128-bit base62 22-char slug, purge on disable), exactly as written. lib/actions/files.ts: add kind moment_photo to EP-15. lib/actions/pets.ts: add the EP-05 purge for every collected slug. Use lib/integrations/r2.ts and the R2 key layout settled in Step 13.
3. app/api/public/moments/[slug]/route.ts: EP-24 exactly (service role reads only PublicMoment fields; headers; 404 for unknown, inactive or deleted).
4. S09: port docs/product/04-design/screens/public-moment.tsx to app/(public)/t/[slug]/public-moment-client.tsx with app/(public)/t/[slug]/page.tsx (server-rendered from EP-24); default on 200, link_disabled on 404. Remove the StateSwitcher.
5. S08: port docs/product/04-design/screens/moments.tsx to app/(app)/ljubimci/[id]/trenuci/moments-client.tsx with its page.tsx. Grid from EP-20 with thumbnails from EP-15; new-moment Dialog through EP-21 with per-photo progress; delete through EP-22; "Javni link" Switch and copy through EP-23; "Podeli kao sliku" preview composed by app/(app)/ljubimci/[id]/trenuci/share-image.ts in the browser with the pet name, date and LogoMark, "Ukloni logo" Switch Premium-locked unless Entitlements.logo_removal. Free counter "n / 5". Remove the StateSwitcher; default / empty / premium_locked per EP-20, EP-21 States and 05- §7.3.
6. S03: add the Trenuci link from the mockup to app/(app)/ljubimci/[id]/pet-record-client.tsx.
7. Put every new string into lib/i18n (both dictionaries).

Do not invent:
- No colours, spacing, radii, fonts or components outside 04-design-system.md §4–§6 and the existing components/ui and components/app; do not edit components/ui or components/app.
- No packages outside 03-technical-constraints.md §4; do not add any dependency to package.json.
- No endpoints, fields, error codes or RPC names outside 05-api-integration-contract.md.
- No tables, columns or enum values outside 03-technical-constraints.md §5.
- No user-facing copy that is not in 04-design-system.md or docs/product/04-design.

Files: create or modify only these. Touching any other file requires stopping and asking.
- supabase/migrations/<timestamp>_moments_api.sql; the generated types file in lib/supabase/ (via npm run db:types only)
- lib/actions/moments.ts, lib/actions/files.ts, lib/actions/pets.ts
- the public-cache purge module at the path settled in blocker check 1 (one file)
- app/api/public/moments/[slug]/route.ts
- app/(public)/t/[slug]/page.tsx, app/(public)/t/[slug]/public-moment-client.tsx
- app/(app)/ljubimci/[id]/trenuci/page.tsx, app/(app)/ljubimci/[id]/trenuci/moments-client.tsx, app/(app)/ljubimci/[id]/trenuci/share-image.ts
- app/(app)/ljubimci/[id]/pet-record-client.tsx
- lib/i18n/sr-Latn.ts, lib/i18n/en.ts
- supabase/tests/moments_api.test.sql
- tests/moments/moment-actions.test.ts, tests/moments/public-link.test.ts, tests/moments/public-moment-route.test.ts, tests/moments/share-image.test.ts, tests/moments/moments-screen.test.tsx
- docs/product/06-build-plan.md (Step 21 row in §3 and the Step 21 Session log only)

Acceptance criteria (PRD v1.5, verbatim — each needs a passing test):
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

Tests to write: exactly the files listed under "Tests to ship" in Step 21 of docs/product/06-build-plan.md, each covering the criterion named there. R2 and the purge mechanism are faked in tests.

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
_(empty — append after the step runs)_

---

### Step 22 — Household sharing

| | |
|---|---|
| **Status** | ⬜ not started |
| **Outcome** | A Premium owner can invite household members by email or link, choose shared pets, remove members; members can accept/decline, opt in to reminders, and leave — with the household read-only state driven by real data. |
| **Implements** | FR-26, FR-27, FR-28, FR-29, FR-30, FR-31 (data side check only), FR-32; EP-34, EP-35, EP-36, EP-37, EP-38, EP-39, EP-40; S13 `/domacinstvo`, S14 `/poziv/[token]` (household variant); tables `households`, `household_memberships`, `household_invitations`, `household_pets` (functions/grants only — tables exist from Step 05); ADR-08 (invitation email); API §11 (20 invitations/day) |
| **Depends on** | Step 19 |
| **Blocked by** | — (pre-flight check in the prompt: TC §5 defines no storage for idempotency keys (API §3.3) or rate-limit counters (API §11)) |
| **Track** | single |

**Read before starting:**
- `docs/product/02-prd.md` §6 FR-26 … FR-32; §8 BR-19 … BR-28, BR-47, BR-51, BR-52; §9 E-10 … E-14.
- `docs/product/03-technical-constraints.md` §5.1 (`households`, `household_memberships`, `household_invitations`, `household_pets`), §5 conventions, ADR-08, ADR-15, ADR-16.
- `docs/product/04-design-system.md` §5.1, §5.4, §6 (composites `AppShell`, `AuthShell`, `PremiumLock`, `ReadOnlyBanner`, `EmptyState`, `PetAvatar`), §8, §9, §11 (S13, S14), §12 S13 and S14.
- `docs/product/04-design/screens/household.tsx`, `docs/product/04-design/screens/invite-accept.tsx`.
- `docs/product/05-api-integration-contract.md` §3.3, §3.6, §4.1, §4.3, §4.4 (rows EP-34 … EP-40), §5.4 (EP-34 … EP-40), §6 (`Household`, `HouseholdMember`, `HouseholdInvitation`, `InvitationView`, `Access`), §7.2, §7.3, §9.3, §9.4 (Resend row), §11.
- Session logs of Steps 05, 12, 18 and 19 in `docs/product/06-build-plan.md` (for the names of the migrations, i18n dictionaries, generated-types file and Resend template mechanism they created).

**Files this step may touch:**
- `supabase/migrations/*_household_sharing.sql` (new: `rpc:get_household`, the EP-38 column grant, and any database function EP-35 / EP-36 / EP-40 need for atomicity)
- `supabase/tests/household_invitations.test.sql`
- `supabase/tests/household_sharing.test.sql`
- `supabase/tests/household_member_permissions.test.sql`
- `supabase/tests/household_read_only.test.sql`
- `supabase/tests/household_succession.test.sql` (only if Step 05 shipped a BR-27 ownership-transfer function)
- `lib/actions/household.ts` (new: EP-35, EP-36)
- `lib/actions/invitations.ts` (new: EP-39, EP-40)
- `lib/integrations/resend.ts` (add the household-invitation template only)
- the `sr-Latn` and `en` dictionary files under `lib/i18n/` created in Step 12 (add keys only)
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
2. docs/product/03-technical-constraints.md §5 conventions, §5.1 household tables, ADR-08, ADR-15, ADR-16.
3. docs/product/05-api-integration-contract.md §3.3, §3.6, §4.1, §4.3, §4.4 (EP-34 … EP-40 rows), §5.4 EP-34 … EP-40, §6 Household, HouseholdMember, HouseholdInvitation, InvitationView, Access, §7.2, §7.3, §9.3, §9.4 (Resend), §11.
4. docs/product/04-design-system.md §5.1, §5.4, §6, §8, §9, §11 (S13, S14), §12 S13 and S14.
5. docs/product/04-design/screens/household.tsx and docs/product/04-design/screens/invite-accept.tsx.
6. The session logs of Steps 05, 12, 18 and 19 in docs/product/06-build-plan.md, to learn the exact names of the household migrations, the i18n dictionary files, the generated types file, and the Resend template mechanism.

PRE-FLIGHT BLOCKER CHECK (before writing any code):
- EP-35 needs idempotency (API §3.3: same idempotency_key within 24 h returns the original result) and a 20-per-day rate limit (API §11: counters live in the database). Check docs/product/03-technical-constraints.md §5 for a table that stores idempotency keys and rate-limit counters. If §5 defines none, STOP and report: "Change request to 03-technical-constraints.md: no storage defined for idempotency keys (API §3.3) or rate-limit counters (API §11)." Do not create such a table yourself.
- If Step 05's session log shows that the BR-27 ownership-transfer function does not exist, do not write it; FR-31 tests are deferred to Step 30 and you record that in the session log.

BUILD:
1. Migration supabase/migrations/<timestamp>_household_sharing.sql: rpc:get_household exactly as EP-34 (security definer, returns only households the caller owns or belongs to, shape §6 Household + my_households); the EP-38 column grant (members may update only reminders_enabled on their own row); and only those additional database functions EP-35 / EP-36 / EP-40 need to perform their listed side effects atomically. RLS for the tables already exists from Step 05 — do not change table definitions.
2. lib/actions/household.ts: server actions create_household_invitation (EP-35) and change_household_membership (EP-36), returning ActionResult per API §3.6 and the exact error codes in EP-35 / EP-36. Token generation and hashing per API §9.3 (prefix hh_, stored only as token_hash, raw token only in invite_url). Email invitations send through lib/integrations/resend.ts using a new household-invitation template in sr-Latn and en, following the template mechanism Step 19 established; link invitations send nothing.
3. lib/actions/invitations.ts: get_household_invitation (EP-39) and decide_household_invitation (EP-40), exactly as specified, selecting the household path by the hh_ token prefix.
4. S13: port docs/product/04-design/screens/household.tsx into app/(app)/domacinstvo/household-screen.tsx (client) rendered by app/(app)/domacinstvo/page.tsx. Keep markup, classes and tokens; replace inline mock data with EP-34 (read), EP-35 (invite Dialog), EP-36 (revoke / remove / leave), EP-37 (shared-pets Switch, Data API household_pets), EP-38 (member opt-in Switch). Remove the dev-only StateSwitcher; drive D / G / R / E / member view from real responses exactly as the EP-34 "States" line and API §7.3 say. After leave, route the member to /ljubimci (EP-36).
5. S14 household variant: port docs/product/04-design/screens/invite-accept.tsx into app/(auth)/poziv/[token]/invite-accept-screen.tsx rendered by app/(auth)/poziv/[token]/page.tsx. Implement only the household, declined, sign-in, expired and loading variants from EP-39 / EP-40 responses per API §7.3. Leave the transfer and slot-taken variants for Step 25 and the team variant for Step 24 (an og_ or tr_ token renders the error state for now). Remove the StateSwitcher. For the sign-in variant: if S16 (Step 11) already honours a next query parameter, link to /prijava?next=/poziv/<token>; otherwise link to /prijava and /registracija without it. Do not modify S15, S16 or /auth/callback.
6. All user-facing strings go into the Step 12 sr-Latn and en dictionaries (keys only; Serbian copy taken from the mockups).
7. Regenerate types with npm run db:types.
8. Tests: write every test listed in the "Tests to ship" table of Step 22 in docs/product/06-build-plan.md, in exactly those files. FR-29 #2 tests the Step 19 dispatch module as it is; if it fails, STOP — do not edit Step 19 files. e2e/household-invitation.spec.ts covers: Premium owner (local seed) invites by link → second user signs in → accepts → sees the shared pet read-only medical tabs → logs a weight entry.

FILES YOU MAY CREATE OR MODIFY (allowlist — nothing else):
- supabase/migrations/<timestamp>_household_sharing.sql
- supabase/tests/household_invitations.test.sql, household_sharing.test.sql, household_member_permissions.test.sql, household_read_only.test.sql, household_succession.test.sql (last one only if the BR-27 function exists)
- lib/actions/household.ts, lib/actions/invitations.ts
- lib/integrations/resend.ts (household-invitation template only)
- the Step 12 sr-Latn and en dictionary files under lib/i18n/ (add keys only)
- the generated types file under lib/supabase/ (via npm run db:types only)
- app/(app)/domacinstvo/page.tsx, app/(app)/domacinstvo/household-screen.tsx
- app/(auth)/poziv/[token]/page.tsx, app/(auth)/poziv/[token]/invite-accept-screen.tsx
- tests/household/create-invitation.test.ts, change-membership.test.ts, decide-invitation.test.ts, household-screen.test.tsx, invite-accept-screen.test.tsx, member-reminder-channels.test.ts
- e2e/household-invitation.spec.ts
- docs/product/06-build-plan.md (Step 22 row in §3 and the Step 22 session log only)
Touching any other file requires stopping and asking.

FORBIDDEN:
- No colours, spacing, radii, shadows, fonts or components outside docs/product/04-design-system.md §4–§6 and the composites already in components/app. The proposed composites under OQ-10 (DateField, InlineAlert, Toaster in shells, etc.) are NOT approved — do not create them.
- No library outside docs/product/03-technical-constraints.md §4; add no npm dependency.
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
_(empty — append after the step runs)_

---

### Step 23 — Subscription status & account data control

| | |
|---|---|
| **Status** | ⬜ not started |
| **Outcome** | S18 shows the real subscription card (days remaining, renewal, cancel / resume auto-renew, expired downgrade summary) and S19 lets a user request a data archive and request or cancel account deletion. |
| **Implements** | FR-25 (days-remaining display), FR-38, FR-39, FR-40, FR-41 (request side; archive builder in Step 30); EP-47, EP-48, EP-50, EP-51; S18 `/profil` (subscription card), S19 `/profil/podaci`; tables `subscriptions`, `data_exports`, `profiles` (deletion fields) — functions only |
| **Depends on** | Step 12 |
| **Blocked by** | — |
| **Track** | single |

**Read before starting:**
- `docs/product/02-prd.md` §6 FR-25, FR-38, FR-39, FR-40, FR-41; §8 BR-08 … BR-10, BR-27, BR-31; §9 E-16.
- `docs/product/03-technical-constraints.md` §5.1 (`profiles`, `subscriptions`, `data_exports` in §5.7), §5.9, ADR-07, ADR-08, ADR-13, ADR-15, ADR-16.
- `docs/product/04-design-system.md` §6, §8, §9 (incl. placeholder-price rule), §11 (S18, S19), §12 S18 and S19.
- `docs/product/04-design/screens/profile.tsx`, `docs/product/04-design/screens/account-data.tsx`.
- `docs/product/05-api-integration-contract.md` §4.1 (gate 3), §4.4 (EP-45 – EP-48, EP-50 / EP-51 rows), §5.6 intro, EP-47, EP-48, EP-50, EP-51, EP-43 (read exemption), §6 (`Subscription`, `DataExport`, `Me`, `Entitlements`, `FileUrl`), §7.2, §7.3 (S18, S19 states), §10.
- Session logs of Steps 04, 06, 07, 11, 12, 15 and 19 (names of the S18 screen file, i18n dictionaries, generated types file, R2 adapter functions, Resend template mechanism, and the Free-limit triggers).

**Files this step may touch:**
- `supabase/migrations/*_subscription_and_data_control.sql` (new: `rpc:get_my_subscription` and any function EP-50 / EP-51 need)
- `supabase/tests/subscription_read.test.sql`, `supabase/tests/downgrade_limits.test.sql`, `supabase/tests/account_deletion_request.test.sql`
- `lib/actions/subscription.ts` (new: EP-48)
- `lib/actions/data-control.ts` (new: EP-50, EP-51)
- `lib/integrations/resend.ts` (templates: auto-renew changed, deletion requested, deletion cancelled)
- the `sr-Latn` and `en` dictionary files under `lib/i18n/` created in Step 12 (add keys only)
- the generated Supabase types file under `lib/supabase/` (via `npm run db:types` only)
- `app/(app)/profil/page.tsx` and the S18 screen component file Step 12 created (named in its session log)
- `app/(app)/profil/podaci/page.tsx`, `app/(app)/profil/podaci/account-data-screen.tsx`
- `tests/subscription/set-auto-renew.test.ts`, `tests/subscription/profile-subscription-card.test.tsx`, `tests/data-control/request-data-export.test.ts`, `tests/data-control/account-deletion.test.ts`, `tests/data-control/account-data-screen.test.tsx`
- `docs/product/06-build-plan.md` (§3 row for Step 23 and its session log only)

**Out of bounds:** checkout, plans list, S17 `/premium`, provider webhook (Step 31 — locked); starting the GitHub Actions export workflow and the archive builder (Step 30); the nightly deletion and expiry jobs (Step 30); the S18 name/city/language form (Step 12 — keep it unchanged); table definitions.

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

FR-41 — Download all my data *(request side here; archive delivery verified in Step 30)*
- Given any user, When they request their data, Then they receive an archive with all their personal data and records.

**Tests to ship:**
| Criterion | Test | File |
|---|---|---|
| FR-25 #2 | S18 with a trialing/active `Subscription` renders the days-remaining `Progress` and value computed from `current_period_end` (Europe/Belgrade) | `tests/subscription/profile-subscription-card.test.tsx` |
| FR-38 | EP-48 `auto_renew = false` → `status = cancelled`, `auto_renew = false`, `current_period_end` unchanged, `Entitlements.premium` still true; `auto_renew = true` resumes; no active row → `409 subscription_not_active` | `tests/subscription/set-auto-renew.test.ts`, `supabase/tests/subscription_read.test.sql` |
| FR-39 | user with an expired subscription and 2 active pets, 11 attachments, 6 moments on a pet: all rows readable; inserting a further pet / attachment / moment fails with `premium_required`; S18 expired variant shows the `over_limits` summary | `supabase/tests/downgrade_limits.test.sql`, `tests/subscription/profile-subscription-card.test.tsx` |
| FR-40 #1 (deactivation) | EP-51 request sets `deletion_requested_at` / `deletion_due_at = +30 days`; a protected write afterwards returns `403 account_pending_deletion`; S19 renders *pending_deletion* | `tests/data-control/account-deletion.test.ts`, `supabase/tests/account_deletion_request.test.sql`, `tests/data-control/account-data-screen.test.tsx` |
| FR-40 #2 | EP-51 cancel clears both columns; profile, pets and subscription rows are identical to before the request | `tests/data-control/account-deletion.test.ts`, `supabase/tests/account_deletion_request.test.sql` |
| FR-41 (request side) | EP-50 `requestDataExport` inserts a `preparing` row and returns `DataExport`; a second call → `409 export_in_progress`; `getMyDataOverview` returns the summary and deletion block; S19 renders *preparing* and *ready* (with `download_url`) from data | `tests/data-control/request-data-export.test.ts`, `tests/data-control/account-data-screen.test.tsx` |

**Verification:**
```
npm run typecheck      # exit 0
npm run lint           # exit 0
npm test               # all Vitest suites pass, incl. tests/subscription/* and tests/data-control/*
npx supabase test db   # all pgTAP tests pass, incl. the three files above
npm run build          # exit 0
```

#### Prompt
```
You are executing Step 23 — Subscription status & account data control — of docs/product/06-build-plan.md for the Moj Ljubimac web app. One outcome: S18 /profil shows the real subscription card with cancel/resume auto-renew, and S19 /profil/podaci lets the user request a data archive and request or cancel account deletion.

READ FIRST, in this order:
1. docs/product/02-prd.md §6 FR-25, FR-38, FR-39, FR-40, FR-41; §8 BR-08 … BR-10, BR-27, BR-31; §9 E-16.
2. docs/product/03-technical-constraints.md §5.1 (profiles, subscriptions), §5.7 (data_exports), §5.9, ADR-07, ADR-08, ADR-13, ADR-15, ADR-16.
3. docs/product/05-api-integration-contract.md §4.1 (gate 3), §4.4, §5.6 intro and EP-47, EP-48, EP-50, EP-51, §5.5 EP-43, §6 Subscription, DataExport, Me, Entitlements, FileUrl, §7.2, §7.3, §10.
4. docs/product/04-design-system.md §6, §8, §9, §11 (S18, S19), §12 S18 and S19.
5. docs/product/04-design/screens/profile.tsx and docs/product/04-design/screens/account-data.tsx.
6. The session logs of Steps 04, 06, 07, 11, 12, 15 and 19 in docs/product/06-build-plan.md, for the exact names of the S18 screen file, the i18n dictionaries, the generated types file, the R2 presign function, the Resend template mechanism, and the Free-limit triggers.

BUILD:
1. Migration supabase/migrations/<timestamp>_subscription_and_data_control.sql: rpc:get_my_subscription exactly as EP-47 (security invoker, own rows only, most recent row of the caller's plan family, never-subscribed shape with trial_available computed). Add only functions EP-50 / EP-51 need; no table changes.
2. lib/actions/subscription.ts: setAutoRenew (EP-48) with exactly its side effects and errors; confirmation email through lib/integrations/resend.ts (new template, sr-Latn and en, using the Step 19 mechanism). No payment-provider call.
3. lib/actions/data-control.ts: requestDataExport and getMyDataOverview (EP-50) and requestAccountDeletion / cancelAccountDeletion (EP-51) exactly as specified, including confirmation emails (new templates). requestDataExport only inserts the data_exports row and returns it — starting the GitHub Actions workflow is Step 30; leave no placeholder call. download_url is a presigned R2 GET from the existing lib/integrations/r2.ts (10 min).
4. S18: in the S18 screen file created in Step 12, port the Premium card of docs/product/04-design/screens/profile.tsx (days remaining with Progress, renewal date, auto-renew status, "Otkaži obnovu" AlertDialog, "Uključi obnovu", expired variant with downgrade note). Drive active / cancelled / expired / loading / error from EP-47 and EP-43 per API §7.3. Keep the price element as the mockup's placeholder with the comment /* placeholder price — OQ-03 */ (Design §9); EP-44 and S17 belong to Step 31. Keep the existing name/city/language form unchanged.
5. S19: port docs/product/04-design/screens/account-data.tsx into app/(app)/profil/podaci/account-data-screen.tsx rendered by app/(app)/profil/podaci/page.tsx. Replace mock data with EP-50 / EP-51 / EP-43; drive default / preparing / ready / pending / error from real responses per EP-50 and EP-51 "States". Remove the StateSwitcher.
6. Strings into the Step 12 sr-Latn and en dictionaries. Regenerate types with npm run db:types.
7. Tests: write every test in the Step 23 "Tests to ship" table of docs/product/06-build-plan.md in exactly those files. pgTAP tests create their own fixtures (subscriptions rows inserted in the test transaction); do not change supabase/seed.sql.

FILES YOU MAY CREATE OR MODIFY (allowlist — nothing else):
- supabase/migrations/<timestamp>_subscription_and_data_control.sql
- supabase/tests/subscription_read.test.sql, downgrade_limits.test.sql, account_deletion_request.test.sql
- lib/actions/subscription.ts, lib/actions/data-control.ts
- lib/integrations/resend.ts (the three new templates only)
- the Step 12 sr-Latn and en dictionary files under lib/i18n/ (add keys only)
- the generated types file under lib/supabase/ (via npm run db:types only)
- app/(app)/profil/page.tsx and the S18 screen component file named in the Step 12 session log
- app/(app)/profil/podaci/page.tsx, app/(app)/profil/podaci/account-data-screen.tsx
- tests/subscription/set-auto-renew.test.ts, profile-subscription-card.test.tsx
- tests/data-control/request-data-export.test.ts, account-deletion.test.ts, account-data-screen.test.tsx
- docs/product/06-build-plan.md (Step 23 row in §3 and the Step 23 session log only)
Touching any other file requires stopping and asking.

FORBIDDEN:
- No colours, spacing, radii, shadows, fonts or components outside docs/product/04-design-system.md §4–§6 and the composites already in components/app; OQ-10 proposed composites are not approved.
- No library outside docs/product/03-technical-constraints.md §4; add no npm dependency.
- No endpoint, field, error code or state outside docs/product/05-api-integration-contract.md; do not implement EP-44, EP-45, EP-46 or EP-49.
- No table, column, enum or constraint change; nothing outside docs/product/03-technical-constraints.md §5.
- No real prices anywhere (OQ-03 is open).

DONE MEANS:
- Every test in the Step 23 "Tests to ship" table exists and passes.
- These commands all exit 0, in this order: npm run typecheck; npm run lint; npm test; npx supabase test db; npm run build.
- In docs/product/06-build-plan.md: set the Step 23 row in §3 to ✅ with today's date and append a Step 23 session log entry (date, what was built, pass/fail per command, deviations, follow-ups — note that workflow start and archive delivery are Step 30).
- Commit with the message "Step 23: Subscription status & account data control".

If anything above is ambiguous, if a referenced section doesn't contain what this prompt says it does, or if completing this step would require touching a file outside the list or making a decision the referenced documents don't settle — STOP and ask. Do not choose a reasonable default. Do not proceed with a partial implementation.
```

#### Session log
_(empty — append after the step runs)_

---

### Step 24 — Organisations: animals, team, public profile

| | |
|---|---|
| **Status** | ⬜ not started |
| **Outcome** | Shelter and breeder users get a working organisation workspace: animal list with search and status filters, shelter intake and status changes, team management with invitations, pending-approval read-only state, and the public-profile editor. |
| **Implements** | FR-42 (gating side), FR-43, FR-44, FR-45, FR-59 (organisation side), FR-60; EP-53, EP-54, EP-55, EP-56, EP-72, EP-13 (`organisation_logo` purpose), EP-39 / EP-40 (`og_` team-invitation path); S20 `/organizacija`, S29 `/organizacija/profil`, S14 `/poziv/[token]` (team variant); tables `organisations`, `organisation_memberships`, `organisation_invitations`, `intakes`, `pet_status_history`, `pets` (functions/grants only) |
| **Depends on** | Step 09, Step 15 |
| **Blocked by** | — (pre-flight checks in the prompt: idempotency/rate-limit storage not in TC §5; `InvitationView` and S14 have no team-invitation variant) |
| **Track** | single |

**Read before starting:**
- `docs/product/02-prd.md` §6 FR-42, FR-43, FR-44, FR-45, FR-59, FR-60; §8 BR-30, BR-32 … BR-35, BR-46, BR-47, BR-51, BR-52; §9 E-21.
- `docs/product/03-technical-constraints.md` §5.2, §5.3 (`pets` organisation columns), §5.6 (`intakes`, `pet_status_history`), ADR-07, ADR-08, ADR-15, ADR-16.
- `docs/product/04-design-system.md` §5.2, §6, §8, §9, §11 (S20, S29, S14), §12 S20, S29, S14.
- `docs/product/04-design/screens/org-animals.tsx`, `docs/product/04-design/screens/org-profile.tsx`, `docs/product/04-design/screens/invite-accept.tsx`.
- `docs/product/05-api-integration-contract.md` §4.1 (gate 4), §4.4 (EP-53 … EP-56, EP-72 rows), §5.7 intro, EP-53, EP-54, EP-55, EP-56, EP-72, §5.1 EP-13, §5.4 EP-39, EP-40, §6 (`Organisation`, `OrganisationMember`, `OrganisationInvitation`, `OrgAnimalRow`, `Intake`, `InvitationView`, `Access`), §7.2, §7.3, §9.3, §10, §11.
- Session logs of Steps 09, 12, 15, 19 and 22 (names of the organisation migrations, the org shell layout, the EP-13 action file, i18n dictionaries, generated types, Resend template mechanism, and `lib/actions/invitations.ts`).

**Files this step may touch:**
- `supabase/migrations/*_organisation_workspace.sql` (new: `rpc:get_my_organisation`, `rpc:list_org_animals`, the status-history trigger only if Step 09 did not ship it, grants for EP-55 status columns and EP-72 columns)
- `supabase/tests/organisation_access.test.sql`, `supabase/tests/org_animals.test.sql`, `supabase/tests/org_team.test.sql`, `supabase/tests/org_profile.test.sql`
- `lib/actions/organisation.ts` (new: `createIntake`)
- `lib/actions/team.ts` (new: `inviteTeamMember`)
- `lib/actions/invitations.ts` (extend with the `og_` path of EP-39 / EP-40)
- the EP-13 upload action file created in Step 15 (named in its session log) — add the `organisation_logo` purpose only
- `lib/integrations/resend.ts` (team-invitation template only)
- the `sr-Latn` and `en` dictionary files under `lib/i18n/` (add keys only); the generated types file under `lib/supabase/` (via `npm run db:types` only)
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
- Given an Admin, When they save description, phone, email, website, or logo, Then the public page shows the new values within 5 minutes. *(saved values verified here; the 5-minute public cache is verified in Step 26)*
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
| EP-39/40 `og_` | invitee accepts a team invitation → `organisation_memberships` row with the invited role; `status = accepted` | `tests/organisation/team-invitation-accept.test.ts` |

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
1. docs/product/02-prd.md §6 FR-42, FR-43, FR-44, FR-45, FR-59, FR-60; §8 BR-30, BR-32 … BR-35, BR-46, BR-47, BR-51, BR-52; §9 E-21.
2. docs/product/03-technical-constraints.md §5.2, §5.3 (pets), §5.6 (intakes, pet_status_history), ADR-07, ADR-08, ADR-15, ADR-16.
3. docs/product/05-api-integration-contract.md §4.1, §4.4, §5.7 intro, EP-53, EP-54, EP-55, EP-56, EP-72, §5.1 EP-13, §5.4 EP-39, EP-40, §6 Organisation, OrganisationMember, OrganisationInvitation, OrgAnimalRow, Intake, InvitationView, Access, §7.2, §7.3, §9.3, §10, §11.
4. docs/product/04-design-system.md §5.2, §6, §8, §9, §11 (S20, S29, S14), §12 S20, S29, S14.
5. docs/product/04-design/screens/org-animals.tsx, org-profile.tsx, invite-accept.tsx.
6. The session logs of Steps 09, 12, 15, 19 and 22 in docs/product/06-build-plan.md, for the exact names of the organisation migrations, app/(org)/layout.tsx, the EP-13 action file, the i18n dictionaries, the generated types file and the Resend template mechanism.

PRE-FLIGHT BLOCKER CHECKS (before writing any code):
- EP-56 invite needs idempotency (API §3.3) and a 20-per-day rate limit (API §11). If docs/product/03-technical-constraints.md §5 defines no storage for idempotency keys and rate-limit counters, STOP and report: "Change request to 03-technical-constraints.md: no storage defined for idempotency keys (API §3.3) or rate-limit counters (API §11)."
- EP-56 says team invitations are viewed and decided through EP-39 / EP-40 and InvitationView, but §6 InvitationView has kind = constant "household" and no organisation fields, EP-39 selects only hh_ / tr_ prefixes, and docs/product/04-design/screens/invite-accept.tsx has no team-invitation variant. Unless the API contract and the Design System have since been revised to define the og_ view and the S14 team variant, STOP and report: "Change request to 05-api-integration-contract.md (InvitationView / EP-39 / EP-40 for og_ tokens) and to 04-design-system.md (S14 team-invitation variant); also unresolved: which account type a newly registering team member gets (BR-30)." Do not design the variant or the payload yourself.

BUILD (only once both checks pass):
1. Migration supabase/migrations/<timestamp>_organisation_workspace.sql: rpc:get_my_organisation (EP-53) and rpc:list_org_animals(p_q, p_status, p_limit, p_offset) (EP-54) exactly as specified, including status_counts and case- and diacritic-insensitive p_q; the pet_status_history trigger for EP-55 status changes only if Step 09 did not ship it; column grants for EP-55 status columns and EP-72 profile columns. No table changes.
2. lib/actions/organisation.ts: createIntake (EP-55) in one transaction as specified. Status changes are Data API updates from the screen.
3. lib/actions/team.ts: inviteTeamMember (EP-56) with token per API §9.3 (prefix og_), validity as household invitations (BR-47), email via a new team-invitation template in lib/integrations/resend.ts (sr-Latn, en). Revoke, remove and change role are Data API calls from the screen, with the last_admin rule of EP-56 enforced in the database.
4. lib/actions/invitations.ts: add the og_ path of EP-39 / EP-40 exactly as the revised API defines it.
5. EP-13: in the Step 15 upload action file, add purpose organisation_logo exactly as EP-13 says (OrgAdmin only, images only, confirm sets organisations.logo_r2_key; old key queued for deletion).
6. S20: port docs/product/04-design/screens/org-animals.tsx into app/(org)/organizacija/org-animals-screen.tsx rendered by app/(org)/organizacija/page.tsx; replace mock data with EP-53, EP-54, EP-55, EP-56; drive default / loading / empty / error / pending (pending_approval) from real responses per API §7.3; remove the StateSwitcher. Animal rows open S03 /ljubimci/[id] (Step 14). Wire app/(org)/layout.tsx to the organisation AppShell variant with data from EP-53 (and EP-43) only if Step 12 has not already done so.
7. S29: port docs/product/04-design/screens/org-profile.tsx into app/(org)/organizacija/profil/org-profile-screen.tsx rendered by app/(org)/organizacija/profil/page.tsx; EP-72 save, EP-13 organisation_logo upload, read-only for Volunteers (access.can_edit = false from EP-53); remove the StateSwitcher.
8. S14 team variant: in app/(auth)/poziv/[token]/invite-accept-screen.tsx add only the team-invitation variant as the revised Design System specifies; do not change the household variant.
9. Strings into the sr-Latn and en dictionaries; regenerate types with npm run db:types.
10. Tests: write every test in the Step 24 "Tests to ship" table of docs/product/06-build-plan.md in exactly those files.

FILES YOU MAY CREATE OR MODIFY (allowlist — nothing else):
- supabase/migrations/<timestamp>_organisation_workspace.sql
- supabase/tests/organisation_access.test.sql, org_animals.test.sql, org_team.test.sql, org_profile.test.sql
- lib/actions/organisation.ts, lib/actions/team.ts, lib/actions/invitations.ts
- the EP-13 upload action file named in the Step 15 session log (organisation_logo purpose only)
- lib/integrations/resend.ts (team-invitation template only)
- the Step 12 sr-Latn and en dictionary files under lib/i18n/ (add keys only); the generated types file under lib/supabase/ (via npm run db:types only)
- app/(org)/layout.tsx
- app/(org)/organizacija/page.tsx, app/(org)/organizacija/org-animals-screen.tsx
- app/(org)/organizacija/profil/page.tsx, app/(org)/organizacija/profil/org-profile-screen.tsx
- app/(auth)/poziv/[token]/page.tsx, app/(auth)/poziv/[token]/invite-accept-screen.tsx (team variant only)
- tests/organisation/create-intake.test.ts, invite-team-member.test.ts, team-invitation-accept.test.ts, org-animals-screen.test.tsx, org-profile-screen.test.tsx
- docs/product/06-build-plan.md (Step 24 row in §3 and the Step 24 session log only)
Touching any other file requires stopping and asking.

FORBIDDEN:
- No colours, spacing, radii, shadows, fonts or components outside docs/product/04-design-system.md §4–§6 and the composites already in components/app; OQ-10 proposed composites (incl. StatusBadge organisation statuses, LogoAvatar) are not approved — use what the mockups use.
- No library outside docs/product/03-technical-constraints.md §4; add no npm dependency.
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
_(empty — append after the step runs)_

---

### Step 25 — Requests, inquiries & record transfers

| | |
|---|---|
| **Status** | ⬜ not started |
| **Outcome** | Organisations can list and decide adoption requests / breeder inquiries and send record transfers; signed-in users can submit requests (action level); a recipient can accept or decline a transfer in S14 and receives a full copy of the record. |
| **Implements** | FR-47, FR-49 (inquiry part), FR-50, FR-51; EP-57, EP-58, EP-59, EP-60, EP-63; S21 `/organizacija/zahtevi`, S14 `/poziv/[token]` (transfer, slot-taken variants); tables `adoption_requests`, `breeder_inquiries`, `record_transfers` (functions only); API §11 (5 requests/hour) |
| **Depends on** | Step 24, Step 22 |
| **Blocked by** | — (pre-flight check in the prompt: idempotency/rate-limit storage not in TC §5) |
| **Track** | single |

**Read before starting:**
- `docs/product/02-prd.md` §6 FR-47, FR-49, FR-50, FR-51; §8 BR-36, BR-38, BR-39, BR-52; §9 E-17 … E-20.
- `docs/product/03-technical-constraints.md` §5.3, §5.6 (`adoption_requests`, `breeder_inquiries`, `record_transfers`), ADR-07, ADR-08, ADR-15, ADR-16.
- `docs/product/04-design-system.md` §6, §8, §9, §11 (S21, S14), §12 S21 and S14.
- `docs/product/04-design/screens/org-requests.tsx`, `docs/product/04-design/screens/invite-accept.tsx`.
- `docs/product/05-api-integration-contract.md` §3.3, §4.4 (EP-57 … EP-60, EP-63 rows), §5.7 intro, EP-57, EP-58, EP-59, EP-60, EP-63, §6 (`AdoptionRequest`, `BreederInquiry`, `RecordTransfer`, `TransferView`, `Access`), §7.2, §7.3, §9.3, §10, §11.
- Session logs of Steps 15, 19, 22 and 24 (R2 adapter, Resend template mechanism, `lib/actions/invitations.ts`, S14 files, organisation migrations).

**Files this step may touch:**
- `supabase/migrations/*_org_requests_and_transfers.sql` (new: `rpc:list_org_requests`, the transactional row-copy function for EP-60 accept, and functions EP-58 / EP-59 / EP-63 need)
- `supabase/tests/org_requests.test.sql`, `supabase/tests/record_transfers.test.sql`
- `lib/actions/org-requests.ts` (new: `decideRequest`, `submitOrgRequest`)
- `lib/actions/transfers.ts` (new: `sendRecordTransfer`, `resendRecordTransfer`, `getTransfer`, `acceptTransfer`, `declineTransfer`)
- `lib/integrations/r2.ts` (add server-side object copy only)
- `lib/integrations/resend.ts` (templates: request received, request accepted, request rejected, transfer invitation, transfer accepted, transfer declined)
- the `sr-Latn` and `en` dictionary files under `lib/i18n/` (add keys only); the generated types file under `lib/supabase/` (via `npm run db:types` only)
- `app/(org)/organizacija/zahtevi/page.tsx`, `app/(org)/organizacija/zahtevi/org-requests-screen.tsx`
- `app/(auth)/poziv/[token]/page.tsx`, `app/(auth)/poziv/[token]/invite-accept-screen.tsx` (transfer and slot-taken variants only)
- `tests/org-requests/submit-request.test.ts`, `tests/org-requests/decide-request.test.ts`, `tests/org-requests/org-requests-screen.test.tsx`, `tests/transfers/send-transfer.test.ts`, `tests/transfers/accept-transfer.test.ts`, `tests/transfers/transfer-variant.test.tsx`
- `docs/product/06-build-plan.md` (§3 row for Step 25 and its session log only)

**Out of bounds:** S23 public page and its request Dialog (Step 26 wires EP-63 into S23); EP-62 and cache purge (Step 26); litters (Step 26); transfer/invitation expiry job (Step 30); table definitions.

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
| FR-47 #1 | `submitOrgRequest` on an available shelter animal inserts a pending `adoption_requests` row visible in `list_org_requests` for the shelter; admins are emailed (Resend fake) | `tests/org-requests/submit-request.test.ts`, `supabase/tests/org_requests.test.sql` |
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
2. docs/product/03-technical-constraints.md §5.3, §5.6, ADR-07, ADR-08, ADR-15, ADR-16.
3. docs/product/05-api-integration-contract.md §3.3, §4.4, §5.7 intro, EP-57, EP-58, EP-59, EP-60, EP-63, §6 AdoptionRequest, BreederInquiry, RecordTransfer, TransferView, Access, §7.2, §7.3, §9.3, §10, §11.
4. docs/product/04-design-system.md §6, §8, §9, §11 (S21, S14), §12 S21 and S14.
5. docs/product/04-design/screens/org-requests.tsx and invite-accept.tsx.
6. The session logs of Steps 15, 19, 22 and 24 in docs/product/06-build-plan.md, for the R2 adapter, the Resend template mechanism, lib/actions/invitations.ts and the S14 files.

PRE-FLIGHT BLOCKER CHECK (before writing any code):
- EP-59 and EP-63 need idempotency (API §3.3) and EP-63 a 5-per-hour rate limit (API §11). If docs/product/03-technical-constraints.md §5 defines no storage for idempotency keys and rate-limit counters, STOP and report: "Change request to 03-technical-constraints.md: no storage defined for idempotency keys (API §3.3) or rate-limit counters (API §11)."

BUILD (only once the check passes):
1. Migration supabase/migrations/<timestamp>_org_requests_and_transfers.sql: rpc:list_org_requests (EP-57) exactly as specified; a database function that performs the EP-60 accept row copy in one transaction (new pets row with organisation-only fields cleared, copies of weight_entries, vaccinations, treatments + dose_logs, vet_visits + attachments with new r2 keys, created_by preserved, record_transfers updated); and only the functions EP-58 / EP-59 / EP-63 need for their listed side effects. No table changes.
2. lib/actions/org-requests.ts: decideRequest (EP-58) and submitOrgRequest (EP-63) with exactly their side effects, errors and emails (applicant locale per EP-58).
3. lib/actions/transfers.ts: sendRecordTransfer / resendRecordTransfer (EP-59), getTransfer / acceptTransfer / declineTransfer (EP-60). Tokens per API §9.3 (prefix tr_). R2 objects for copied attachments and the photo are copied server-side through a new copy function in lib/integrations/r2.ts.
4. Emails: add the six templates listed in the Step 25 file allowlist to lib/integrations/resend.ts (sr-Latn, en) using the Step 19 mechanism.
5. S21: port docs/product/04-design/screens/org-requests.tsx into app/(org)/organizacija/zahtevi/org-requests-screen.tsx rendered by app/(org)/organizacija/zahtevi/page.tsx; EP-57 list with filters and "Učitaj još" (offset paging, API §3.4), EP-58 Prihvati/Odbij (Admin only), "Pošalji karton" transfer Dialog (EP-59) with re-send; drive admin / empty / volunteer (read_only) from real responses; remove the StateSwitcher.
6. S14 transfer variants: in app/(auth)/poziv/[token]/invite-accept-screen.tsx add the transfer, declined, expired, sign-in and slot-taken variants for tr_ tokens from EP-60 per API §7.3; do not change the household or team variants.
7. EP-63 is built as an action only; S23 calls it in Step 26.
8. Strings into the sr-Latn and en dictionaries; regenerate types with npm run db:types.
9. Tests: write every test in the Step 25 "Tests to ship" table of docs/product/06-build-plan.md in exactly those files; R2 and Resend are faked in Vitest.

FILES YOU MAY CREATE OR MODIFY (allowlist — nothing else):
- supabase/migrations/<timestamp>_org_requests_and_transfers.sql
- supabase/tests/org_requests.test.sql, record_transfers.test.sql
- lib/actions/org-requests.ts, lib/actions/transfers.ts
- lib/integrations/r2.ts (server-side copy only), lib/integrations/resend.ts (six templates only)
- the Step 12 sr-Latn and en dictionary files under lib/i18n/ (add keys only); the generated types file under lib/supabase/ (via npm run db:types only)
- app/(org)/organizacija/zahtevi/page.tsx, app/(org)/organizacija/zahtevi/org-requests-screen.tsx
- app/(auth)/poziv/[token]/page.tsx, app/(auth)/poziv/[token]/invite-accept-screen.tsx (transfer and slot-taken variants only)
- tests/org-requests/submit-request.test.ts, decide-request.test.ts, org-requests-screen.test.tsx
- tests/transfers/send-transfer.test.ts, accept-transfer.test.ts, transfer-variant.test.tsx
- docs/product/06-build-plan.md (Step 25 row in §3 and the Step 25 session log only)
Touching any other file requires stopping and asking.

FORBIDDEN:
- No colours, spacing, radii, shadows, fonts or components outside docs/product/04-design-system.md §4–§6 and the composites already in components/app; OQ-10 proposed composites are not approved.
- No library outside docs/product/03-technical-constraints.md §4; add no npm dependency.
- No endpoint, field, error code or state outside docs/product/05-api-integration-contract.md.
- No table, column, enum or constraint change; nothing outside docs/product/03-technical-constraints.md §5.

DONE MEANS:
- Every test in the Step 25 "Tests to ship" table exists and passes.
- These commands all exit 0, in this order: npm run typecheck; npm run lint; npm test; npx supabase test db; npm run build.
- In docs/product/06-build-plan.md: set the Step 25 row in §3 to ✅ with today's date and append a Step 25 session log entry (date, what was built, pass/fail per command, deviations, follow-ups).
- Commit with the message "Step 25: Requests, inquiries & record transfers".

If anything above is ambiguous, if a referenced section doesn't contain what this prompt says it does, or if completing this step would require touching a file outside the list or making a decision the referenced documents don't settle — STOP and ask. Do not choose a reasonable default. Do not proceed with a partial implementation.
```

#### Session log
_(empty — append after the step runs)_

---

### Step 26 — Litters & public organisation pages

| | |
|---|---|
| **Status** | ⬜ not started |
| **Outcome** | Breeders record litters with offspring rows, status and price; the public organisation page `/o/[slug]` serves available animals (cached 5 min) and lets signed-in visitors submit a request or inquiry; the shelter intake-to-adoption flow runs end to end. |
| **Implements** | FR-46, FR-48, FR-49 (public page part); EP-61, EP-62, EP-63 (S23 wiring); S22 `/organizacija/legla`, S23 `/o/[slug]`; table `litters` (functions only); EP-62 cache purge calls from EP-55, EP-58, EP-59, EP-61; ADR-15 flow "shelter intake to adoption" |
| **Depends on** | Step 25 |
| **Blocked by** | — (pre-flight check in the prompt: cache-purge mechanism) |
| **Track** | single |

**Read before starting:**
- `docs/product/02-prd.md` §6 FR-46, FR-48, FR-49; §8 BR-36, BR-37, BR-51; §9 E-17, E-21; UC-08, UC-09 (§7).
- `docs/product/03-technical-constraints.md` §5.3 (`pets` offspring columns), §5.6 (`litters`), ADR-03, ADR-07, ADR-15, ADR-16.
- `docs/product/04-design-system.md` §5.2, §5.3, §6, §8, §9, §11 (S22, S23), §12 S22 and S23.
- `docs/product/04-design/screens/litters.tsx`, `docs/product/04-design/screens/public-org.tsx`.
- `docs/product/05-api-integration-contract.md` §4.4 (EP-61 … EP-63 rows), §5.7 intro, EP-61, EP-62, EP-63, EP-55 / EP-58 / EP-59 (cache-purge side effects), §6 (`Litter`, `PublicOrgPage`, `PublicAnimal`, `Access`), §7.3, §10, §12 (`public` budget).
- Session logs of Steps 21, 24 and 25 (the cache-purge mechanism used for public moments, organisation actions, request/transfer actions).

**Files this step may touch:**
- `supabase/migrations/*_litters_and_public_pages.sql` (new: `rpc:list_litters`, the transactional function behind `createLitter`, and any function the EP-62 read needs)
- `supabase/tests/litters.test.sql`, `supabase/tests/public_org_page.test.sql`
- `lib/actions/litters.ts` (new: `createLitter`)
- `lib/actions/organisation.ts`, `lib/actions/org-requests.ts`, `lib/actions/transfers.ts` (add the EP-62 cache-purge call only)
- `app/api/public/orgs/[slug]/route.ts`
- `app/(org)/organizacija/legla/page.tsx`, `app/(org)/organizacija/legla/litters-screen.tsx`
- `app/(public)/o/[slug]/page.tsx`, `app/(public)/o/[slug]/public-org-screen.tsx`
- the `sr-Latn` and `en` dictionary files under `lib/i18n/` (add keys only); the generated types file under `lib/supabase/` (via `npm run db:types` only)
- `tests/litters/create-litter.test.ts`, `tests/litters/litters-screen.test.tsx`, `tests/public/public-org-route.test.ts`, `tests/public/public-org-screen.test.tsx`
- `e2e/shelter-intake-to-adoption.spec.ts`
- `docs/product/06-build-plan.md` (§3 row for Step 26 and its session log only)

**Out of bounds:** the Operator approval action and its purge (Step 28); breeder plan purchase (Step 31); privacy/terms pages linked from the public shell footer (Step 32 raises the change request); table definitions.

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
| FR-46 | EP-62 for an approved shelter returns only `available` animals with exactly the `PublicAnimal` fields; no health-record fields present; pending/rejected org → `404`; response carries `Cache-Control: public, s-maxage=300` (also covers FR-60 #1's 5-minute window from Step 24) | `tests/public/public-org-route.test.ts`, `supabase/tests/public_org_page.test.sql` |
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
You are executing Step 26 — Litters & public organisation pages — of docs/product/06-build-plan.md for the Moj Ljubimac web app. One outcome: breeders manage litters (S22) and every approved organisation has a working, cached public page (S23 /o/[slug]) from which signed-in users submit requests or inquiries.

READ FIRST, in this order:
1. docs/product/02-prd.md §6 FR-46, FR-48, FR-49; §7 UC-08, UC-09; §8 BR-36, BR-37, BR-51; §9 E-17, E-21.
2. docs/product/03-technical-constraints.md §5.3, §5.6 (litters), ADR-03, ADR-07, ADR-15, ADR-16.
3. docs/product/05-api-integration-contract.md §4.4, §5.7 intro, EP-61, EP-62, EP-63, and the cache-purge side effects in EP-55, EP-58, EP-59; §6 Litter, PublicOrgPage, PublicAnimal, Access; §7.3; §10; §12.
4. docs/product/04-design-system.md §5.2, §5.3, §6, §8, §9, §11 (S22, S23), §12 S22 and S23.
5. docs/product/04-design/screens/litters.tsx and public-org.tsx.
6. The session logs of Steps 21, 24 and 25 in docs/product/06-build-plan.md.

PRE-FLIGHT BLOCKER CHECK (before writing any code):
- EP-62 is cached at the edge with cache tag org:<slug> and must be purged by EP-55, EP-58, EP-59, EP-61 (and EP-68 in Step 28). Read Step 21's session log for the cache-purge mechanism it built for public moments (EP-23). Reuse exactly that mechanism. If Step 21 established no purge mechanism, STOP and report: "Change request to 03-technical-constraints.md: no edge-cache purge mechanism (and no credentials for it in .env.example) is defined for EP-23 / EP-62." Do not choose one yourself.

BUILD (only once the check passes):
1. Migration supabase/migrations/<timestamp>_litters_and_public_pages.sql: rpc:list_litters (EP-61 list shape incl. eligible_mothers / eligible_fathers and access), a database function that performs createLitter's side effects in one transaction, and any function the EP-62 read needs so that only public fields (BR-37) can leave the database. No table changes. Offspring status/price updates are Data API updates (EP-61) with the history trigger.
2. lib/actions/litters.ts: createLitter (EP-61) with exactly its validation and errors.
3. app/api/public/orgs/[slug]/route.ts: GET per EP-62 — approved organisations only (breeders also need an active breeder plan), available animals only, presigned photo/logo URLs (10 min), paging, Cache-Control public, s-maxage=300 and cache tag org:<slug>.
4. Purge calls: add the EP-62 purge (Step 21 mechanism) to the status/price paths of EP-55 (lib/actions/organisation.ts and the Data API status change path), EP-58 (lib/actions/org-requests.ts), EP-59 (lib/actions/transfers.ts) and EP-61 (lib/actions/litters.ts and the offspring update path). Change nothing else in those files.
5. S22: port docs/product/04-design/screens/litters.tsx into app/(org)/organizacija/legla/litters-screen.tsx rendered by app/(org)/organizacija/legla/page.tsx; EP-61 list / create / offspring update; default / empty / read_only from real responses; remove the StateSwitcher.
6. S23: port docs/product/04-design/screens/public-org.tsx into app/(public)/o/[slug]/public-org-screen.tsx rendered by app/(public)/o/[slug]/page.tsx; data from EP-62; guest vs signed-in from the session (EP-43), not from EP-62; request Dialog calls submitOrgRequest (EP-63, Step 25), shows the sign-in prompt on 401 (E-17) and inline field errors on 422; remove the StateSwitcher. Footer privacy/terms links stay as the PublicShell renders them.
7. Strings into the sr-Latn and en dictionaries; regenerate types with npm run db:types.
8. Tests: write every test in the Step 26 "Tests to ship" table of docs/product/06-build-plan.md in exactly those files, including e2e/shelter-intake-to-adoption.spec.ts (local seed: approved shelter admin + owner user).

FILES YOU MAY CREATE OR MODIFY (allowlist — nothing else):
- supabase/migrations/<timestamp>_litters_and_public_pages.sql
- supabase/tests/litters.test.sql, public_org_page.test.sql
- lib/actions/litters.ts
- lib/actions/organisation.ts, lib/actions/org-requests.ts, lib/actions/transfers.ts (purge call only)
- app/api/public/orgs/[slug]/route.ts
- app/(org)/organizacija/legla/page.tsx, app/(org)/organizacija/legla/litters-screen.tsx
- app/(public)/o/[slug]/page.tsx, app/(public)/o/[slug]/public-org-screen.tsx
- the Step 12 sr-Latn and en dictionary files under lib/i18n/ (add keys only); the generated types file under lib/supabase/ (via npm run db:types only)
- tests/litters/create-litter.test.ts, litters-screen.test.tsx
- tests/public/public-org-route.test.ts, public-org-screen.test.tsx
- e2e/shelter-intake-to-adoption.spec.ts
- docs/product/06-build-plan.md (Step 26 row in §3 and the Step 26 session log only)
Touching any other file requires stopping and asking.

FORBIDDEN:
- No colours, spacing, radii, shadows, fonts or components outside docs/product/04-design-system.md §4–§6 and the composites already in components/app; OQ-10 proposed composites are not approved.
- No library outside docs/product/03-technical-constraints.md §4; add no npm dependency.
- No endpoint, field, error code or state outside docs/product/05-api-integration-contract.md; no health-record field on any public response.
- No table, column, enum or constraint change; nothing outside docs/product/03-technical-constraints.md §5.
- Do not create privacy-policy or terms pages.

DONE MEANS:
- Every test in the Step 26 "Tests to ship" table exists and passes.
- These commands all exit 0, in this order: npm run typecheck; npm run lint; npm test; npx supabase test db; npm run build; npm run e2e.
- In docs/product/06-build-plan.md: set the Step 26 row in §3 to ✅ with today's date and append a Step 26 session log entry (date, what was built, pass/fail per command, deviations, follow-ups).
- Commit with the message "Step 26: Litters & public organisation pages".

If anything above is ambiguous, if a referenced section doesn't contain what this prompt says it does, or if completing this step would require touching a file outside the list or making a decision the referenced documents don't settle — STOP and ask. Do not choose a reasonable default. Do not proceed with a partial implementation.
```

#### Session log
_(empty — append after the step runs)_

---

### Step 27 — Partners directory

| | |
|---|---|
| **Status** | ⬜ not started |
| **Outcome** | Owners see paid, nearby partners (featured first, then by distance, from browser location or profile city), open a partner profile, use quick actions that are counted, and get vet suggestions when a pet has no vet. |
| **Implements** | FR-52, FR-53, FR-54, FR-55, FR-56; EP-64, EP-65, EP-66; S24 `/partneri`, S25 `/partneri/[id]`; tables `partners`, `partner_hours`, `partner_clicks`, `cities` (functions only); ADR-11 |
| **Depends on** | Step 09, Step 12 |
| **Blocked by** | — |
| **Track** | single |

**Read before starting:**
- `docs/product/02-prd.md` §6 FR-52 … FR-56; §8 BR-40 … BR-44; §9 E-22 … E-24; UC-10.
- `docs/product/03-technical-constraints.md` §5.7 (`partners`, `partner_hours`, `partner_clicks`, `cities`), ADR-11, ADR-15, ADR-16.
- `docs/product/04-design-system.md` §6 (incl. the brand-icon prohibition), §7, §8, §11 (S24, S25), §12 S24, S25 and S03.
- `docs/product/04-design/screens/partners.tsx`, `docs/product/04-design/screens/partner-profile.tsx`, `docs/product/04-design/screens/pet-record.tsx`.
- `docs/product/05-api-integration-contract.md` §4.4 (EP-64 … EP-67 rows), EP-64, EP-65, EP-66, EP-01 (S24 vet-suggestion banner caller), §6 (`Partner`, `PartnerHours`, `City`), §7.3, §10.
- Session logs of Steps 09, 12 and 15 (partner RPCs from Step 09, i18n dictionaries, generated types, R2 presign function).

**Files this step may touch:**
- `supabase/migrations/*_partner_directory.sql` (new: `rpc:get_partner` only, plus fixes to the Step 09 `partners_nearby` / `record_partner_click` only if their tests here fail against EP-64 / EP-66)
- `supabase/tests/partner_directory.test.sql`
- `lib/actions/partners.ts` (new: `getPartner`)
- `app/(app)/partneri/page.tsx`, `app/(app)/partneri/partners-screen.tsx`
- `app/(app)/partneri/[id]/page.tsx`, `app/(app)/partneri/[id]/partner-profile-screen.tsx`
- the `sr-Latn` and `en` dictionary files under `lib/i18n/` (add keys only); the generated types file under `lib/supabase/` (via `npm run db:types` only)
- `tests/partners/get-partner.test.ts`, `tests/partners/partners-screen.test.tsx`, `tests/partners/partner-profile-screen.test.tsx`
- `docs/product/06-build-plan.md` (§3 row for Step 27 and its session log only)

**Out of bounds:** S03 (`pet-record.tsx` has no vet-suggestion markup — see prompt); partner creation/editing and statistics (Step 28); geocoding (Step 28); table definitions.

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

**Verification:**
```
npm run typecheck      # exit 0
npm run lint           # exit 0
npm test               # all Vitest suites pass, incl. tests/partners/*
npx supabase test db   # all pgTAP tests pass, incl. partner_directory
npm run build          # exit 0
```

#### Prompt
```
You are executing Step 27 — Partners directory — of docs/product/06-build-plan.md for the Moj Ljubimac web app. One outcome: S24 /partneri and S25 /partneri/[id] work on real data through EP-64, EP-65 and EP-66, including the vet-suggestion banner.

READ FIRST, in this order:
1. docs/product/02-prd.md §6 FR-52 … FR-56; §7 UC-10; §8 BR-40 … BR-44; §9 E-22 … E-24.
2. docs/product/03-technical-constraints.md §5.7, ADR-11, ADR-15, ADR-16.
3. docs/product/05-api-integration-contract.md §4.4, EP-64, EP-65, EP-66, EP-01, §6 Partner, PartnerHours, City, §7.3, §10.
4. docs/product/04-design-system.md §6 (brand icons are forbidden — use MessageCircle, Phone, Mail, Globe, AtSign), §7, §8, §11 (S24, S25), §12 S24, S25 and S03.
5. docs/product/04-design/screens/partners.tsx, partner-profile.tsx and pet-record.tsx.
6. The session logs of Steps 09, 12 and 15 in docs/product/06-build-plan.md.

SCOPE NOTE — S03 vet suggestions: EP-64 lists S03 as a caller, but docs/product/04-design/screens/pet-record.tsx and Design §12 S03 contain no vet-suggestion block, while Design §11 maps FR-56 to S24 only. Implement FR-56 through the S24 banner (present in partners.tsx). Do NOT add a block to S03. Record in the session log: "Change request to 04-design-system.md: S03 vet-suggestion block named by API EP-64 has no design."

BUILD:
1. Migration supabase/migrations/<timestamp>_partner_directory.sql: rpc:get_partner for EP-65 (distance from lat/lng or city_id, full hours, today_hours). If the Step 09 functions partners_nearby / record_partner_click fail the tests below against the EP-64 / EP-66 contract, fix them here (create or replace) — no table changes.
2. lib/actions/partners.ts: getPartner (EP-65) — calls rpc:get_partner, then signs logo_url via the existing lib/integrations/r2.ts presign (10 min).
3. S24: port docs/product/04-design/screens/partners.tsx into app/(app)/partneri/partners-screen.tsx rendered by app/(app)/partneri/page.tsx; type chips → p_type; "Koristi moju lokaciju" uses the browser Geolocation API with permission and falls back to the profile city from EP-43 (E-22); featured section then list by distance; quick actions call EP-66 fire-and-forget before opening tel:/mailto:/https:/messaging links; vet-suggestion banner when any active EP-01 pet has vet_name = null. default / loading / empty / error from real responses; remove the StateSwitcher.
4. S25: port docs/product/04-design/screens/partner-profile.tsx into app/(app)/partneri/[id]/partner-profile-screen.tsx rendered by app/(app)/partneri/[id]/page.tsx; data from getPartner; default / minimal / loading / error per EP-65 States; remove the StateSwitcher.
5. Strings into the sr-Latn and en dictionaries; regenerate types with npm run db:types.
6. Tests: write every test in the Step 27 "Tests to ship" table of docs/product/06-build-plan.md in exactly those files (seed partner rows inside the pgTAP test transaction; do not change supabase/seed.sql).

FILES YOU MAY CREATE OR MODIFY (allowlist — nothing else):
- supabase/migrations/<timestamp>_partner_directory.sql
- supabase/tests/partner_directory.test.sql
- lib/actions/partners.ts
- app/(app)/partneri/page.tsx, app/(app)/partneri/partners-screen.tsx
- app/(app)/partneri/[id]/page.tsx, app/(app)/partneri/[id]/partner-profile-screen.tsx
- the Step 12 sr-Latn and en dictionary files under lib/i18n/ (add keys only); the generated types file under lib/supabase/ (via npm run db:types only)
- tests/partners/get-partner.test.ts, partners-screen.test.tsx, partner-profile-screen.test.tsx
- docs/product/06-build-plan.md (Step 27 row in §3 and the Step 27 session log only)
Touching any other file requires stopping and asking.

FORBIDDEN:
- No colours, spacing, radii, shadows, fonts or components outside docs/product/04-design-system.md §4–§6 and the composites already in components/app; OQ-10 proposed composites (incl. LogoAvatar) are not approved; no lucide brand icons.
- No library outside docs/product/03-technical-constraints.md §4 (no map or geolocation library); add no npm dependency.
- No endpoint, field, error code or state outside docs/product/05-api-integration-contract.md.
- No table, column, enum or constraint change; nothing outside docs/product/03-technical-constraints.md §5.

DONE MEANS:
- Every test in the Step 27 "Tests to ship" table exists and passes.
- These commands all exit 0, in this order: npm run typecheck; npm run lint; npm test; npx supabase test db; npm run build.
- In docs/product/06-build-plan.md: set the Step 27 row in §3 to ✅ with today's date and append a Step 27 session log entry (date, what was built, pass/fail per command, deviations, follow-ups, and the S03 change request above).
- Commit with the message "Step 27: Partners directory".

If anything above is ambiguous, if a referenced section doesn't contain what this prompt says it does, or if completing this step would require touching a file outside the list or making a decision the referenced documents don't settle — STOP and ask. Do not choose a reasonable default. Do not proceed with a partial implementation.
```

#### Session log
_(empty — append after the step runs)_

---

### Step 28 — Operator admin

| | |
|---|---|
| **Status** | ⬜ not started |
| **Outcome** | The Operator can approve or reject pending shelters (with emails), create and edit partners with geocoding, logo, hours, featured flag and paid-until date, see click statistics per partner and action, and switch the Viber channel. |
| **Implements** | FR-42 (approval), FR-57, FR-58; EP-68, EP-69, EP-70, EP-71; S26 `/admin`; ADR-11 (`lib/integrations/nominatim.ts`); tables `organisations` (approval), `partners`, `partner_hours`, `partner_clicks`, `app_settings` (views/functions only) |
| **Depends on** | Step 27, Step 24 |
| **Blocked by** | — |
| **Track** | single |

**Read before starting:**
- `docs/product/02-prd.md` §6 FR-42, FR-57, FR-58; §8 BR-14b, BR-32, BR-40, BR-41, BR-44; §9 E-23, E-27; §12 item 6.
- `docs/product/03-technical-constraints.md` §5.2 (`organisations` approval columns), §5.5 (`app_settings`), §5.7, ADR-07, ADR-08, ADR-11, ADR-15, ADR-16.
- `docs/product/04-design-system.md` §5.5, §6, §8, §11 (S26), §12 S26.
- `docs/product/04-design/screens/admin.tsx`.
- `docs/product/05-api-integration-contract.md` §4.2 (Operator), §4.4 (EP-68 … EP-71 rows), EP-68, EP-69, EP-70, EP-71, EP-67, §6 (`PendingOrganisation`, `Partner`, `PartnerHours`, `PartnerClickStats`, `AppSettings`, `UploadTicket`), §7.2, §7.3, §9.4 (Nominatim row), §10.
- Session logs of Steps 09, 12, 15, 19, 26 and 27 (partner functions, i18n, R2 presign, Resend template mechanism, EP-62 purge mechanism).

**Files this step may touch:**
- `supabase/migrations/*_operator_admin.sql` (new: view `admin_pending_organisations`, `rpc:admin_list_partners`, `rpc:admin_partner_click_stats`, and functions `decideOrganisation` / `savePartner` need for atomicity)
- `supabase/tests/admin_access.test.sql`, `supabase/tests/admin_partners.test.sql`
- `lib/actions/admin.ts` (new: `decideOrganisation`, `geocodeAddress`, `createPartnerLogoUpload`, `savePartner`, `setAppSettings`)
- `lib/integrations/nominatim.ts` (new)
- `lib/integrations/resend.ts` (templates: organisation approved, organisation rejected)
- `app/admin/layout.tsx`, `app/admin/page.tsx`, `app/admin/admin-screen.tsx`
- the `sr-Latn` and `en` dictionary files under `lib/i18n/` (add keys only); the generated types file under `lib/supabase/` (via `npm run db:types` only)
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
4. docs/product/04-design-system.md §5.5, §6, §8, §11 (S26), §12 S26.
5. docs/product/04-design/screens/admin.tsx.
6. The session logs of Steps 09, 12, 15, 19, 26 and 27 in docs/product/06-build-plan.md (partner functions, i18n, R2 presign, Resend template mechanism, EP-62 purge mechanism).

BUILD:
1. Migration supabase/migrations/<timestamp>_operator_admin.sql: view admin_pending_organisations (RLS: profiles.is_operator; returns [] to others), rpc:admin_list_partners (incl. hidden partners and featured_count), rpc:admin_partner_click_stats (period YYYY-MM Europe/Belgrade, available_periods), and only the functions decideOrganisation / savePartner need to be atomic (savePartner upserts partners and replaces partner_hours in one transaction). No table changes; the featured ≤ 3 trigger exists from Step 09.
2. lib/integrations/nominatim.ts: server-side geocoding per ADR-11 and API §9.4 — query "<address, city, Serbia>", identifying User-Agent, at most 1 request per second, no retry, failure → geocoding_failed. Use fetch only.
3. lib/actions/admin.ts: decideOrganisation (EP-68, emails via two new Resend templates, EP-62 purge for the slug using the Step 26 mechanism), geocodeAddress, createPartnerLogoUpload (UploadTicket via the existing R2 presign; images only, ≤ 10 MB), savePartner (EP-69; geocode when both coordinates are null; old logo key queued for deletion), setAppSettings (EP-71). Every action checks profiles.is_operator explicitly and uses the service role on the server only (API §3.1).
4. S26: port docs/product/04-design/screens/admin.tsx into app/admin/admin-screen.tsx rendered by app/admin/page.tsx inside app/admin/layout.tsx (Admin shell, Design §5.5). Tabs Azili na čekanju (EP-68), Partneri (EP-69 table, Istaknut switch with "n / 3", add/edit Dialog, "Pronađi koordinate", logo upload, hours editor, city Select from EP-67), Statistika (EP-70 month selector), Kanali (EP-71 Viber switch with cost-warning confirm). default / loading / empty / error from real responses; remove the StateSwitcher. What a non-Operator sees at /admin is defined only as 403 forbidden_role (API §4.4); if Design §5.5 / §12 S26 do not settle the page a non-Operator gets, STOP and ask.
5. Strings into the sr-Latn and en dictionaries; regenerate types with npm run db:types.
6. Tests: write every test in the Step 28 "Tests to ship" table of docs/product/06-build-plan.md in exactly those files; Nominatim, R2 and Resend are faked in Vitest.

FILES YOU MAY CREATE OR MODIFY (allowlist — nothing else):
- supabase/migrations/<timestamp>_operator_admin.sql
- supabase/tests/admin_access.test.sql, admin_partners.test.sql
- lib/actions/admin.ts
- lib/integrations/nominatim.ts
- lib/integrations/resend.ts (two approval templates only)
- app/admin/layout.tsx, app/admin/page.tsx, app/admin/admin-screen.tsx
- the Step 12 sr-Latn and en dictionary files under lib/i18n/ (add keys only); the generated types file under lib/supabase/ (via npm run db:types only)
- tests/admin/decide-organisation.test.ts, save-partner.test.ts, admin-screen.test.tsx
- tests/integrations/nominatim.test.ts
- docs/product/06-build-plan.md (Step 28 row in §3 and the Step 28 session log only)
Touching any other file requires stopping and asking.

FORBIDDEN:
- No colours, spacing, radii, shadows, fonts or components outside docs/product/04-design-system.md §4–§6 and the composites already in components/app; OQ-10 proposed composites are not approved.
- No library outside docs/product/03-technical-constraints.md §4 (no geocoding SDK, no map library); add no npm dependency.
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
_(empty — append after the step runs)_

---

### Step 29 — WhatsApp channel

| | |
|---|---|
| **Status** | ⬜ not started |
| **Outcome** | Premium users connect a WhatsApp number by code, choose WhatsApp per reminder type, and receive reminders by WhatsApp with an "Urađeno" quick reply (capped at 30/month, falling back to email + push); delivery statuses and replies arrive through the WhatsApp webhook; Viber stays hidden. |
| **Implements** | FR-23 (WhatsApp criteria), FR-24 (quick reply); EP-30, EP-31 (WhatsApp part), EP-28 (WhatsApp channel checks), EP-33 (WhatsApp sending); S12 `/podesavanja/podsetnici` (Kanali card WhatsApp, WhatsApp channel checkbox, counter); `POST`/`GET /api/webhooks/whatsapp` (API §9.1); `lib/integrations/whatsapp.ts`; tables `user_channels`, `reminder_deliveries`, `reminder_preferences` (functions/triggers only); BR-14a, BR-14b |
| **Depends on** | Step 19 |
| **Blocked by** | — (pre-flight checks in the prompt: idempotency/rate-limit storage not in TC §5; WhatsApp template names not fixed upstream) |
| **Track** | single |

**Read before starting:**
- `docs/product/02-prd.md` §6 FR-23, FR-24; §8 BR-14, BR-14a, BR-14b, BR-15, BR-16, BR-24; §9 E-09, E-27.
- `docs/product/03-technical-constraints.md` §5.5 (`reminder_deliveries`, `reminder_preferences`, `user_channels`, `app_settings`), §6 (WhatsApp, Viber rows), ADR-04, ADR-15, ADR-16, §10 RISK-17.
- `docs/product/04-design-system.md` §6, §8, §11 (S12), §12 S12.
- `docs/product/04-design/screens/reminder-settings.tsx`.
- `docs/product/05-api-integration-contract.md` §3.3, §5.3 EP-28, EP-30, EP-31, EP-32, EP-33, §6 (`WhatsAppConnection`, `ChannelUsage`, `ReminderPreference`), §7.2 (`whatsapp_cap_reached`, `whatsapp_not_connected`, `verification_code_invalid`, `channel_disabled`), §9.1, §9.3, §9.4 (WhatsApp, Viber rows), §11, §12 (cost row).
- Session logs of Steps 02, 08, 18 and 19 (env var names, `reminder_preferences` triggers, the S12 screen files, the dispatch modules and the action-token helper).

**Files this step may touch:**
- `supabase/migrations/*_whatsapp_channel.sql` (new: only the `reminder_preferences` WhatsApp/Viber checks of EP-28 if Steps 08/18 did not ship them, and any function the cap count needs)
- `supabase/tests/whatsapp_channel.test.sql`
- `lib/integrations/whatsapp.ts` (new)
- `lib/actions/whatsapp.ts` (new: EP-30)
- `app/api/webhooks/whatsapp/route.ts` (new)
- `app/api/internal/dispatch/route.ts` and the dispatch module(s) created in Step 19 (named in its session log) — add WhatsApp sending only
- the S12 screen file(s) created in Step 18 (named in its session log) — WhatsApp parts only
- the `sr-Latn` and `en` dictionary files under `lib/i18n/` (add keys only); the generated types file under `lib/supabase/` (via `npm run db:types` only)
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
2. docs/product/03-technical-constraints.md §5.5, §6 (WhatsApp and Viber rows), ADR-04, ADR-15, ADR-16, §10 RISK-17.
3. docs/product/05-api-integration-contract.md §3.3, §5.3 EP-28, EP-30, EP-31, EP-32, EP-33, §6 WhatsAppConnection, ChannelUsage, ReminderPreference, §7.2, §9.1, §9.3, §9.4, §11, §12.
4. docs/product/04-design-system.md §6, §8, §11 (S12), §12 S12.
5. docs/product/04-design/screens/reminder-settings.tsx.
6. The session logs of Steps 02, 08, 18 and 19 in docs/product/06-build-plan.md, for the env var names in .env.example, the reminder_preferences triggers, the S12 screen file(s), the dispatch module(s) and the action-token helper.

PRE-FLIGHT BLOCKER CHECKS (before writing any code):
- EP-30 send_code needs idempotency (API §3.3) and rate limits of 5 send / 10 verify per hour (API §11). If docs/product/03-technical-constraints.md §5 defines no storage for idempotency keys and rate-limit counters, STOP and report: "Change request to 03-technical-constraints.md: no storage defined for idempotency keys (API §3.3) or rate-limit counters (API §11)."
- The WhatsApp utility template (reminder + "Urađeno" quick reply) and the authentication template (verification code) must be called by name and language. If neither 05-api-integration-contract.md nor the .env.example created in Step 02 fixes these template names and their variables, STOP and report: "Change request to 05-api-integration-contract.md §9.4: WhatsApp template names, languages and variables are not specified." Do not invent template names.

BUILD (only once both checks pass):
1. lib/integrations/whatsapp.ts: Meta Cloud API adapter using fetch only — send the authentication template with a code, send the utility reminder template with the quick-reply payload, 2 tries (API §9.4), and verify X-Hub-Signature-256 over the raw body (API §9.1). Secrets from the env names Step 02 declared.
2. lib/actions/whatsapp.ts: whatsapp_connection (EP-30) with ops send_code / verify_code / disconnect exactly as specified (stateless verification_token per EP-30 and API §9.3; upsert user_channels on verify; disconnect cleans reminder_preferences.channels).
3. Migration supabase/migrations/<timestamp>_whatsapp_channel.sql: only if Steps 08/18 did not ship them, the database checks EP-28 requires when channels contain whatsapp or viber (premium_required / whatsapp_not_connected / channel_disabled), and any function needed for the BR-14a monthly cap count or rpc:get_channel_usage if missing. No table changes.
4. Dispatch: in the Step 19 dispatch module(s), add WhatsApp to step 3 (channel resolution — Premium, user_channels, viber_enabled, cap ≥ 30 delivered this Europe/Belgrade calendar month → fallback {email, push}, members intersected with {email, push}) and step 4 (send the utility template with the same signed done token as the email link), recording reminder_deliveries per EP-33 step 5 and whatsapp_cap_reached on the delivery row where API §7.2 says so. Change nothing in email or push behaviour. Viber is never sent (no adapter).
5. app/api/webhooks/whatsapp/route.ts: GET verification handshake and POST per API §9.1 — signature check, status events update reminder_deliveries by provider_message_id (last write wins by timestamp), button reply "Urađeno" applies exactly the EP-32 rules via the Step 19 action-token helper and replies with a short confirmation; always 200 within 5 s once the signature is valid.
6. S12: in the Step 18 S12 screen file(s), wire the WhatsApp parts of docs/product/04-design/screens/reminder-settings.tsx — Kanali card number connection (number → "Pošalji kod" → code → "Povezano" → "Prekini vezu"), the WhatsApp channel checkbox per type, and the "n / 30 poruka ovog meseca" counter from EP-31 — replacing the Premium-lock / not-available placeholder Step 18 left. G state for Free users per API §7.3. Viber remains absent while viber_enabled = false (from EP-28 get).
7. Strings into the sr-Latn and en dictionaries; regenerate types with npm run db:types.
8. Tests: write every test in the Step 29 "Tests to ship" table of docs/product/06-build-plan.md in exactly those files; the Meta API is faked.

FILES YOU MAY CREATE OR MODIFY (allowlist — nothing else):
- supabase/migrations/<timestamp>_whatsapp_channel.sql
- supabase/tests/whatsapp_channel.test.sql
- lib/integrations/whatsapp.ts
- lib/actions/whatsapp.ts
- app/api/webhooks/whatsapp/route.ts
- app/api/internal/dispatch/route.ts and the dispatch module(s) named in the Step 19 session log (WhatsApp additions only)
- the S12 screen file(s) named in the Step 18 session log (WhatsApp parts only)
- the Step 12 sr-Latn and en dictionary files under lib/i18n/ (add keys only); the generated types file under lib/supabase/ (via npm run db:types only)
- tests/integrations/whatsapp.test.ts
- tests/whatsapp/connection.test.ts, webhook.test.ts
- tests/reminders/dispatch-whatsapp.test.ts, reminder-settings-whatsapp.test.tsx
- docs/product/06-build-plan.md (Step 29 row in §3 and the Step 29 session log only)
Touching any other file requires stopping and asking.

FORBIDDEN:
- No colours, spacing, radii, shadows, fonts or components outside docs/product/04-design-system.md §4–§6 and the composites already in components/app; OQ-10 proposed composites (incl. compact inline PremiumLock) are not approved; no lucide brand icons (use MessageCircle).
- No library outside docs/product/03-technical-constraints.md §4 (no WhatsApp SDK, no reseller); add no npm dependency.
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
_(empty — append after the step runs)_

---

### Step 30 — Nightly jobs, backups & data export

| | |
|---|---|
| **Status** | ⬜ not started |
| **Outcome** | The nightly retention job (account deletion with household and organisation succession, R2 cleanup, delivery purge, invitation/transfer/export expiry), the nightly subscription job's non-provider parts (expiry, 30/7/1 notices, household read-only flag), nightly occurrence generation, the per-user data archive builder, and the nightly database backup to R2 all run on schedule. |
| **Implements** | EP-52; EP-49 (non-provider parts: steps 2–4); EP-50 (archive builder and workflow start); FR-25, FR-31, FR-32, FR-39, FR-40, FR-41; NFR-06, NFR-08; ADR-04 (nightly schedules), ADR-13; TC §5.5 (rolling 60-day occurrence generation), §5.9, §8 |
| **Depends on** | Step 23, Step 25, Step 29 |
| **Blocked by** | — (pre-flight checks in the prompt: export-workflow trigger, location of workflow scripts, archive/backup tooling) |
| **Track** | single |

**Read before starting:**
- `docs/product/02-prd.md` §6 FR-25, FR-31, FR-32, FR-39, FR-40, FR-41; §8 BR-09, BR-10, BR-16, BR-27, BR-28, BR-31, BR-38, BR-46, BR-47; §10 NFR-06, NFR-07, NFR-08.
- `docs/product/03-technical-constraints.md` §5.1 (`subscriptions.last_notice_days`), §5.5 (occurrence window), §5.7 (`r2_deletion_queue`, `data_exports`), §5.9, §7 (NFR-06, NFR-08 targets), §8, ADR-04, ADR-07, ADR-13, ADR-15, ADR-16, RISK-13.
- `docs/product/05-api-integration-contract.md` EP-49, EP-50, EP-52, EP-33 (secret-header mechanism), §6 (`DataExport`), §9.4, §10 (item 7), §12 (`job` budget).
- Session logs of Steps 02, 03, 05, 08, 15, 19, 23 and 25 (env names, CI workflow, BR-27 function if any, occurrence-generation function, R2 adapter, dispatch schedule mechanism and secret, `lib/actions/data-control.ts`).

**Files this step may touch:**
- `supabase/migrations/*_nightly_jobs.sql` (new: the database functions the two nightly routes call, and pg_cron schedules for billing-nightly 03:00 and retention-nightly 03:30 Europe/Belgrade and for nightly occurrence generation if Step 08/19 did not schedule it)
- `supabase/tests/retention_job.test.sql`, `supabase/tests/billing_job.test.sql`, `supabase/tests/succession_job.test.sql`
- `app/api/internal/billing-nightly/route.ts`, `app/api/internal/retention-nightly/route.ts`
- `lib/integrations/r2.ts` (add delete/list needed for queue and orphan cleanup only)
- `lib/integrations/resend.ts` (templates: expiry notice "obnavlja se" / "ističe", heir notification, export ready)
- `lib/actions/data-control.ts` (add the workflow start to `requestDataExport` only)
- `.github/workflows/nightly-backup.yml`, `.github/workflows/data-export.yml`
- the archive-builder and backup script files at the location fixed by the change request (see pre-flight)
- the `sr-Latn` and `en` dictionary files under `lib/i18n/` (add keys only); the generated types file under `lib/supabase/` (via `npm run db:types` only)
- `tests/jobs/billing-nightly.test.ts`, `tests/jobs/retention-nightly.test.ts`, `tests/jobs/data-export-builder.test.ts`
- `docs/product/06-build-plan.md` (§3 row for Step 30 and its session log only)

**Out of bounds:** renewal charging (EP-49 step 1 — provider part, Step 31, locked); payment webhook (Step 31); the dispatch job's minute schedule (Step 19); any purge of `memorial_records` or memorial pets (NFR-07); table definitions.

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

FR-41 — Download all my data *(archive delivery)*
- Given any user, When they request their data, Then they receive an archive with all their personal data and records.

NFR-06 / NFR-08 — *no Given/When/Then in the PRD; derived from TC §7 targets:*
- No row or file of a deleted account exists 31 days after the request.
- No delivery row older than 12 months + 1 day.

**Tests to ship:**
| Criterion | Test | File |
|---|---|---|
| FR-25 #1 | billing job on Belgrade dates with 30 / 7 / 1 days remaining sends one notice each (email + push fakes), sets `last_notice_days`, and a re-run on the same date sends nothing; monthly plan skips the 30-day notice on the period's first day | `supabase/tests/billing_job.test.sql`, `tests/jobs/billing-nightly.test.ts` |
| FR-25 #3 | after the job sets `status = expired`, the Step 19/29 dispatch delivers a WhatsApp-configured reminder by email + push | `tests/jobs/billing-nightly.test.ts` |
| FR-31 #1 | retention job on an owner past `deletion_due_at`: earliest-joined member becomes owner, their membership row is removed, shared pets move to the heir with records intact, heir emailed | `supabase/tests/succession_job.test.sql`, `tests/jobs/retention-nightly.test.ts` |
| FR-31 #2 | heir without Premium → `households.read_only = true` | `supabase/tests/succession_job.test.sql` |
| FR-32 | billing job expiring the owner's Premium sets `households.read_only = true`; members still read shared pets | `supabase/tests/billing_job.test.sql` |
| FR-39 | after the job expires a subscription, over-limit rows stay readable and new over-limit inserts fail with `premium_required` | `supabase/tests/billing_job.test.sql` |
| FR-40 #1 | profile with `deletion_due_at` passed is deleted with its unshared pets; R2 keys queued and then deleted (fake); a profile inside the window is untouched | `supabase/tests/retention_job.test.sql`, `tests/jobs/retention-nightly.test.ts` |
| BR-46 | last Admin deleted → earliest-joined remaining member becomes Admin; no members left → organisation enters the 30-day grace, then is deleted with its animals | `supabase/tests/succession_job.test.sql` |
| FR-41 | builder produces one ZIP containing the user's profile, pets, records, care log, moments, reminders, attachments and photos; sets `ready`, `r2_key`, `size_bytes`, `ready_at`, `expires_at = +7 days`; emails the user; failure sets `failed` | `tests/jobs/data-export-builder.test.ts` |
| NFR-06 (derived) | 31 days after a request no row referencing the user and no queued key remains | `supabase/tests/retention_job.test.sql` |
| NFR-08 (derived) | deliveries older than 12 months are purged; newer kept | `supabase/tests/retention_job.test.sql` |
| EP-52 steps 4–5 | pending invitations/transfers past `expires_at` → `expired`; ready exports past `expires_at` → R2 object deleted, `expired` | `supabase/tests/retention_job.test.sql` |
| Route auth | both nightly routes reject a missing/wrong secret with `401` | `tests/jobs/billing-nightly.test.ts`, `tests/jobs/retention-nightly.test.ts` |
| ADR-13 | backup workflow file defines a nightly schedule, uploads to R2, deletes backups older than 14 days (asserted by reviewing the workflow run log after the first manual dispatch; recorded in the session log) | `.github/workflows/nightly-backup.yml` |

**Verification:**
```
npm run typecheck      # exit 0
npm run lint           # exit 0
npm test               # all Vitest suites pass, incl. tests/jobs/*
npx supabase test db   # all pgTAP tests pass, incl. retention_job, billing_job, succession_job
npm run build          # exit 0
# plus: one manual workflow_dispatch run of nightly-backup.yml succeeds and the object appears in R2 (logged)
```

#### Prompt
```
You are executing Step 30 — Nightly jobs, backups & data export — of docs/product/06-build-plan.md for the Moj Ljubimac web app. One outcome: every nightly process in TC §8 runs on schedule — retention (EP-52), the non-provider parts of the subscription job (EP-49 steps 2–4), occurrence generation, the data-archive builder for EP-50, and the nightly database backup to R2 (ADR-13).

READ FIRST, in this order:
1. docs/product/02-prd.md §6 FR-25, FR-31, FR-32, FR-39, FR-40, FR-41; §8 BR-09, BR-10, BR-16, BR-27, BR-28, BR-31, BR-38, BR-46, BR-47; §10 NFR-06, NFR-07, NFR-08.
2. docs/product/03-technical-constraints.md §4, §5.1, §5.5, §5.7, §5.9, §7, §8, ADR-04, ADR-07, ADR-13, ADR-15, ADR-16, RISK-13.
3. docs/product/05-api-integration-contract.md EP-49, EP-50, EP-52, EP-33 (secret-header mechanism), §6 DataExport, §9.4, §10 item 7, §12.
4. The session logs of Steps 02, 03, 05, 08, 15, 19, 23 and 25 in docs/product/06-build-plan.md.

PRE-FLIGHT BLOCKER CHECKS (before writing any code). For each, if the upstream documents still do not settle it, STOP and report the quoted change request; do not decide it yourself:
1. How the app starts the export workflow (EP-50 "starts the GitHub Actions export workflow"): no GitHub credential is among the env names Step 02 declared, and neither TC nor the API defines a polling schedule instead. → "Change request to 03-technical-constraints.md (ADR-13): define how requestDataExport triggers the export workflow and which credential/env var it uses."
2. Where the archive builder and backup scripts live: ADR-16 defines no folder for code run by GitHub Actions. → "Change request to 03-technical-constraints.md (ADR-16): define the location of GitHub Actions job scripts."
3. Tooling for the database dump, the ZIP archive and the R2 upload inside GitHub Actions: TC §4 names none. → "Change request to 03-technical-constraints.md (ADR-13 / §4): name the dump, archive and upload tooling."

BUILD (only once all three checks pass):
1. Migration supabase/migrations/<timestamp>_nightly_jobs.sql: database functions for EP-52 steps 1, 3, 4, 5 (incl. BR-27 household succession — reuse the Step 05 function if it exists — and BR-46 organisation succession) and EP-49 steps 2–4 (expiry, notices driven by subscriptions.last_notice_days per TC §5.1, household read_only recompute). pg_cron schedules via pg_net for POST /api/internal/billing-nightly at 03:00 and /api/internal/retention-nightly at 03:30 Europe/Belgrade, using exactly the mechanism and secret Step 19 used for /api/internal/dispatch (EP-49: "same mechanism"); and a nightly schedule for the Step 08 rolling 60-day occurrence-generation function if neither Step 08 nor Step 19 scheduled it. No table changes. Nothing may touch memorial_records or memorial pets (NFR-07).
2. app/api/internal/billing-nightly/route.ts: EP-49 with steps 2–4 only; step 1 (renewal charge) logs the warning EP-49 specifies and does nothing (OQ-11). Response counts per EP-49. Notices by email (new templates "obnavlja se" / "ističe") and web push via the existing lib/integrations/webpush.ts.
3. app/api/internal/retention-nightly/route.ts: EP-52 steps 1–5 in order, each idempotent; R2 deletions through lib/integrations/r2.ts (dequeue only after R2 confirms; orphaned objects older than 24 h with no row are deleted, API §10 item 7); heir email (new template). Response counts per EP-52.
4. Data export: the archive builder at the location fixed by check 2, run by .github/workflows/data-export.yml, writing one ZIP per EP-50 to R2 and updating data_exports, emailing "export ready" (new template); requestDataExport in lib/actions/data-control.ts starts it as fixed by check 1.
5. Backup: .github/workflows/nightly-backup.yml exports the database nightly to R2 and keeps the last 14 days (ADR-13), with the tooling fixed by check 3 and secrets from GitHub Actions secrets named after the Step 02 env names.
6. Strings into the sr-Latn and en dictionaries; regenerate types with npm run db:types.
7. Tests: write every test in the Step 30 "Tests to ship" table of docs/product/06-build-plan.md in exactly those files; R2, Resend and web push are faked in Vitest; pgTAP tests move time by setting the relevant timestamps in fixtures.
8. Run nightly-backup.yml once by workflow_dispatch and record the result in the session log.

FILES YOU MAY CREATE OR MODIFY (allowlist — nothing else):
- supabase/migrations/<timestamp>_nightly_jobs.sql
- supabase/tests/retention_job.test.sql, billing_job.test.sql, succession_job.test.sql
- app/api/internal/billing-nightly/route.ts, app/api/internal/retention-nightly/route.ts
- lib/integrations/r2.ts (delete/list additions only), lib/integrations/resend.ts (the new templates only)
- lib/actions/data-control.ts (workflow start in requestDataExport only)
- .github/workflows/nightly-backup.yml, .github/workflows/data-export.yml
- the job script files at the location fixed by the ADR-16 change request
- the Step 12 sr-Latn and en dictionary files under lib/i18n/ (add keys only); the generated types file under lib/supabase/ (via npm run db:types only)
- tests/jobs/billing-nightly.test.ts, retention-nightly.test.ts, data-export-builder.test.ts
- docs/product/06-build-plan.md (Step 30 row in §3 and the Step 30 session log only)
Touching any other file requires stopping and asking.

FORBIDDEN:
- No library or tool outside docs/product/03-technical-constraints.md §4 and what the three change requests approve; add no npm dependency beyond them.
- No endpoint, field, error code or state outside docs/product/05-api-integration-contract.md; no payment-provider call (OQ-11).
- No table, column, enum or constraint change; nothing outside docs/product/03-technical-constraints.md §5.
- Production data never used in tests or previews (ADR-10).

DONE MEANS:
- Every test in the Step 30 "Tests to ship" table exists and passes.
- These commands all exit 0, in this order: npm run typecheck; npm run lint; npm test; npx supabase test db; npm run build; and one manual run of nightly-backup.yml succeeds with the backup object visible in R2.
- In docs/product/06-build-plan.md: set the Step 30 row in §3 to ✅ with today's date and append a Step 30 session log entry (date, what was built, pass/fail per command, the backup run result, deviations, follow-ups — including "practise one restore before launch" from RISK-13).
- Commit with the message "Step 30: Nightly jobs, backups & data export".

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
| **Implements** | FR-37, FR-42 (breeder plan); EP-44, EP-45, EP-46, EP-49 (provider part — step 1 renewals); S17 `/premium`; tables `plans` (price data), `subscriptions` (provider columns), `subscription_payments`, `payment_webhook_events`; BR-07, BR-11; ADR-09 |
| **Depends on** | Step 30 |
| **Blocked by** | **OQ-11** (API) — which payment provider replaces the deferred Monri choice; **OQ-03** (Brief) — Premium monthly/yearly and breeder plan prices |
| **Track** | single |

**Read before starting:** to be defined when unblocked (at minimum: PRD §6 FR-37, FR-42, §8 BR-07, BR-08, BR-11, §9 E-15, E-21; TC ADR-09, §5.1, §5.7 `payment_webhook_events`; Design §11–§12 S17; API §5.5 EP-44, §5.6 EP-45, EP-46, EP-49, §9.2, §9.4 payment row — each as revised after OQ-11).

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
- OQ-03 (origin: Brief) — Premium monthly, Premium yearly and breeder plan prices. Determines the plans seed data and the prices shown on S17 and S18. Who answers: Keti (owner).

What unlocks when answered:
- OQ-11 → revise 03-technical-constraints.md ADR-09 and 05-api-integration-contract.md EP-45 / EP-46 / EP-49 / §9.2 for the chosen provider, then write this step's file list, tests, verification and prompt.
- OQ-03 → seed plans with real prices and remove the "/* placeholder price — OQ-03 */" placeholders on S17 / S18.

Until then EP-45 is not built; production users stay on Free; Premium exists only through local seed data (Step 04).
Do not write a provisional prompt for this step.
```

#### Session log
_(empty — append after the step runs)_

---

### Step 32 — Release verification

| | |
|---|---|
| **Status** | ⬜ not started |
| **Outcome** | A recorded, item-by-item verdict on PRD §12 Release Criteria: all six ADR-15 end-to-end flows pass, accessibility and cost checks are done, and every gap that stands between the build and launch is listed with an owner. |
| **Implements** | PRD §12 Release Criteria 1–6; ADR-15 (full Playwright run); NFR-03, NFR-04, NFR-10 (checks); Design §10 |
| **Depends on** | Step 30 (and Step 31 once unblocked, for Release Criterion 2) |
| **Blocked by** | — (Release Criterion 2 cannot pass until Step 31 runs; Release Criterion 4 needs a Design change request — see prompt) |
| **Track** | single |

**Read before starting:**
- `docs/product/02-prd.md` §6 (every FR's acceptance criteria), §10 NFR-01 … NFR-10, §12.
- `docs/product/03-technical-constraints.md` ADR-15, §7 (verifiable targets), §8.
- `docs/product/04-design-system.md` §5.3 (public shell footer), §10, §11.
- `docs/product/05-api-integration-contract.md` §12, §13.
- `docs/product/06-build-plan.md` §3 and the session logs of Steps 01 … 31.

**Files this step may touch:**
- `docs/product/06-build-plan.md` (§3 row for Step 32 and the Step 32 session log only)

**Out of bounds:** all application code, migrations, tests and configuration. A defect found here becomes a new suffixed step (e.g. `30a`) added to §3 and §8 by the plan owner, never a fix inside this step.

**Acceptance criteria:** (PRD §12 Release Criteria, verbatim)
1. All 58 P0 requirements are implemented and every acceptance criterion in §6 is verified.
2. Payments are tested end to end: trial, renewal, cancellation, expiry, downgrade, and breeder plan.
3. Account deletion (with grace period) and full data download work.
4. Privacy policy and terms of use are published at public URLs, in Serbian and English.
5. Delivered reminders are counted, so the north-star metric can be measured from day one.
6. The operator admin area works: shelter approval, partner management, paid-until hiding, click statistics.

Derived from TC §7 (NFR targets) for this step:
- NFR-03: no horizontal scroll and all core flows usable at 360 px.
- NFR-04: automated accessibility check with zero critical issues on core flows, plus a manual keyboard-only pass.
- NFR-10: monthly invoices total ≤ €20.

**Tests to ship:** none new — this step runs existing suites and records results.
| Criterion | Check | Evidence recorded in |
|---|---|---|
| RC-1 | full `npm test`, `npx supabase test db`, `npm run e2e`; every FR in PRD §6 mapped to a passing test from its step's "Tests to ship" table | Step 32 session log (per-FR table) |
| RC-1 / ADR-15 | the six Playwright flows (registration, add pet, add vaccination and see the reminder, mark done, household invitation, shelter intake to adoption) pass | Step 32 session log |
| RC-2 | ❌ until Step 31 runs — recorded as open | Step 32 session log |
| RC-3 | Step 23 and Step 30 tests pass; one manual export request and one deletion + cancel on a local account | Step 32 session log |
| RC-4 | STOP condition — see prompt | Step 32 session log + change request |
| RC-5 | query counting `reminder_deliveries` with `status = delivered` per pet over the trailing 30 days returns the expected count on seed data | Step 32 session log |
| RC-6 | Step 28 tests pass; one manual pass through S26 tabs on a local Operator account | Step 32 session log |
| NFR-03 | each core flow at 360 px and 1440 px in the browser: no horizontal scroll | Step 32 session log |
| NFR-04 | Lighthouse accessibility audit in Chrome DevTools on core-flow screens (no dependency added); manual keyboard-only and screen-reader pass on add pet, add vaccination, mark reminder done, invite member (Design §10) | Step 32 session log |
| NFR-10 | current monthly costs from the Cloudflare, Supabase, Resend and Meta dashboards summed ≤ €20 | Step 32 session log |

**Verification:**
```
npm run typecheck      # exit 0
npm run lint           # exit 0
npm test               # all Vitest suites pass
npx supabase test db   # all pgTAP tests pass
npm run build          # exit 0
npm run e2e            # all six ADR-15 flows pass
```

#### Prompt
```
You are executing Step 32 — Release verification — of docs/product/06-build-plan.md for the Moj Ljubimac web app. One outcome: a recorded, item-by-item verdict on PRD §12 Release Criteria 1–6 and the NFR checks listed in Step 32, written into the Step 32 session log. You change no application code, test, migration or configuration in this step.

READ FIRST, in this order:
1. docs/product/02-prd.md §6, §10, §12.
2. docs/product/03-technical-constraints.md ADR-15, §7, §8.
3. docs/product/04-design-system.md §5.3, §10, §11.
4. docs/product/05-api-integration-contract.md §12, §13.
5. docs/product/06-build-plan.md §3 and the session logs of Steps 01 … 31.

CHECKS — record each result (pass / fail / open, with evidence) in the Step 32 session log:
1. Run, in order: npm run typecheck; npm run lint; npm test; npx supabase test db; npm run build; npm run e2e. Record the output summary of each.
2. Release Criterion 1: build a table of every FR in docs/product/02-prd.md §6 → the step(s) that implemented it (from §3 and the step sections) → the test file(s) that cover each acceptance criterion → pass/fail. Any FR or criterion without a passing test is a fail. Note any criterion a step marked "deferred" and whether a later step closed it.
3. ADR-15: confirm the six Playwright flows exist and pass: registration, add pet, add vaccination and see the reminder, mark done, household invitation, shelter intake to adoption. A missing spec is a fail.
4. Release Criterion 2: if Step 31 is not ✅ in §3, record "open — blocked by OQ-11 and OQ-03 (Step 31)". If it is ✅, verify trial, renewal, cancellation, expiry, downgrade and breeder plan from Step 31's tests.
5. Release Criterion 3: confirm the Step 23 and Step 30 tests pass; on a local account request a data export and request then cancel account deletion through S19; record what happened.
6. Release Criterion 4: Design System §11 lists no privacy-policy or terms-of-use screen or route, and the PublicShell footer links point to "#". STOP and report: "Change request to 04-design-system.md (and 05-api-integration-contract.md if the pages are served from data): privacy policy and terms of use pages (routes, content source, sr-Latn and en) are not designed — Release Criterion 4 cannot be met." Record it as open. Do not create the pages or their content. Then continue with the remaining checks only if the person running the step confirms; otherwise stop here.
7. Release Criterion 5: run a read-only SQL query against the local database counting pets with ≥ 1 reminder_deliveries row with status delivered in the trailing 30 days (TC §6 north-star row); record the query and the result on seed data.
8. Release Criterion 6: confirm Step 28 tests pass; walk S26 as the local Operator (approve a pending shelter, edit a partner, set paid-until to yesterday and confirm the partner disappears from /partneri, view click statistics).
9. NFR-03: open each core flow at 360 px and 1440 px widths; record any horizontal scroll.
10. NFR-04: run the Lighthouse accessibility audit built into Chrome DevTools on the core-flow screens (Design §10 list); then a manual keyboard-only pass and a screen-reader pass on add pet, add vaccination, mark reminder done, invite member. If an automated check that requires installing a library is needed to meet TC §7 NFR-04, STOP and report: "Change request to 03-technical-constraints.md: name the automated accessibility tool (TC §7 NFR-04)." Do not install one.
11. NFR-10: sum the current monthly costs shown in the Cloudflare, Supabase, Resend and Meta dashboards; record the figures and whether the total is ≤ €20.

FILES YOU MAY CREATE OR MODIFY (allowlist — nothing else):
- docs/product/06-build-plan.md (Step 32 row in §3 and the Step 32 session log only)
Touching any other file requires stopping and asking. A defect found here is recorded with the step it belongs to and proposed as a new suffixed step (e.g. 28a); you do not fix it.

FORBIDDEN:
- No application, test, migration, configuration or content change.
- No library or tool installed; nothing outside docs/product/03-technical-constraints.md §4.
- No new endpoint, field, screen or copy.

DONE MEANS:
- Every check above has a recorded result with evidence in the Step 32 session log, and every fail or open item names its owning step or change request.
- The six commands in check 1 were run and their outcomes recorded.
- In docs/product/06-build-plan.md: set the Step 32 row in §3 to ✅ with today's date only if Release Criteria 1–6 all pass; otherwise set it to ▶️ and list the open items in the session log.
- Commit with the message "Step 32: Release verification".

If anything above is ambiguous, if a referenced section doesn't contain what this prompt says it does, or if completing this step would require touching a file outside the list or making a decision the referenced documents don't settle — STOP and ask. Do not choose a reasonable default. Do not proceed with a partial implementation.
```

#### Session log
_(empty — append after the step runs)_

---

## 9. Coverage Matrix

Generated by comparing every id against each step's **Implements** row (tables: every step that names the table). Forward check: nothing unbuilt. Reverse check: every step implements at least one FR, EP, screen, table, ADR, or a confirmed operational necessity (Steps 01–03, 10).

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
| FR-41 | 23, 30 |
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

### 9.2 Operations
| EP | Steps |
|---|---|
| EP-01 | 13 |
| EP-02 | 13, 14 |
| EP-03 | 13 |
| EP-04 | 13 |
| EP-05 | 13, 14, 21 |
| EP-06 | 16 |
| EP-07 | 16 |
| EP-08 | 14 |
| EP-09 | 14 |
| EP-10 | 15 |
| EP-11 | 15 |
| EP-12 | 15 |
| EP-13 | 13, 15, 24 |
| EP-14 | 15 |
| EP-15 | 13, 15, 21 |
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
| EP-28 | 18, 29 |
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
| EP-43 | 12 |
| EP-44 | 31 |
| EP-45 | 31 |
| EP-46 | 31 |
| EP-47 | 23 |
| EP-48 | 23 |
| EP-49 | 30, 31 |
| EP-50 | 23, 30 |
| EP-51 | 23 |
| EP-52 | 30 |
| EP-53 | 24 |
| EP-54 | 24 |
| EP-55 | 24, 26 |
| EP-56 | 24 |
| EP-57 | 25 |
| EP-58 | 25, 26 |
| EP-59 | 25, 26 |
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

### 9.3 Screens
| Screen | Steps |
|---|---|
| S01 | 13, 16, 17 |
| S02 | 13 |
| S03 | 13, 14, 15, 16, 17, 20, 21 |
| S04 | 14 |
| S05 | 15 |
| S06 | 16 |
| S07 | 20 |
| S08 | 21 |
| S09 | 21 |
| S10 | 17 |
| S11 | 17 |
| S12 | 18, 29 |
| S13 | 22 |
| S14 | 22, 24, 25 |
| S15 | 12 |
| S16 | 11 |
| S17 | 31 |
| S18 | 12, 23 |
| S19 | 23 |
| S20 | 24 |
| S21 | 25 |
| S22 | 26 |
| S23 | 26 |
| S24 | 27 |
| S25 | 27 |
| S26 | 28 |
| S27 | 15 |
| S28 | 11 |
| S29 | 24 |

### 9.4 Tables
| Table | Steps |
|---|---|
| `adoption_requests` | 09, 25 |
| `app_settings` | 04, 18, 28, 29 |
| `attachments` | 06, 07, 13, 14, 15, 16, 18, 21, 22, 23, 25, 30 |
| `breeder_inquiries` | 09, 25 |
| `cities` | 04, 09, 12, 27 |
| `data_exports` | 04, 23, 30 |
| `dose_logs` | 06, 08, 15, 17, 25 |
| `feeding_entries` | 07, 20 |
| `household_invitations` | 05, 22 |
| `household_memberships` | 05, 22 |
| `household_pets` | 05, 06, 22 |
| `households` | 05, 22, 30 |
| `intakes` | 09, 24 |
| `litters` | 06, 09, 24, 25, 26 |
| `memorial_records` | 06, 16, 30 |
| `moment_photos` | 07, 21 |
| `moment_public_links` | 07, 21 |
| `moments` | 06, 07, 13, 14, 15, 16, 18, 20, 21, 22, 23, 26, 30 |
| `organisation_invitations` | 05, 24 |
| `organisation_memberships` | 05, 12, 24 |
| `organisations` | 05, 09, 12, 24, 25, 26, 28 |
| `partner_clicks` | 09, 27, 28 |
| `partner_hours` | 09, 27, 28 |
| `partners` | 09, 27, 28 |
| `payment_webhook_events` | 04, 31 |
| `pet_status_history` | 09, 24 |
| `pets` | 05, 06, 07, 08, 09, 13, 16, 17, 19, 21, 22, 23, 24, 25, 26, 30, 32 |
| `plans` | 04, 12, 23, 31 |
| `profiles` | 04, 06, 08, 11, 12, 19, 23, 27, 28 |
| `push_subscriptions` | 08, 18, 19 |
| `record_transfers` | 09, 25 |
| `reminder_deliveries` | 08, 18, 19, 29, 32 |
| `reminder_occurrences` | 06, 08, 15, 17, 19, 20 |
| `reminder_preferences` | 08, 17, 18, 29 |
| `reminders` | 05, 06, 07, 08, 13, 14, 15, 16, 17, 19, 20, 22, 29, 30, 32 |
| `stool_entries` | 07, 20 |
| `subscription_payments` | 04, 31 |
| `subscriptions` | 04, 05, 08, 23, 30, 31 |
| `treatments` | 06, 08, 14, 15, 22, 25 |
| `user_channels` | 08, 18, 19, 29 |
| `vaccinations` | 06, 08, 14, 18, 22, 24, 25 |
| `vet_visits` | 06, 08, 15, 22, 25 |
| `weight_entries` | 06, 14, 25 |

---

## 10. Risks

| ID | Risk | Severity | Mitigation |
|---|---|---|---|
| RISK-23 | Test volume: every step ships tests for every acceptance criterion across 60 FRs, roughly doubling the work of each step for a single builder. | Medium | Accepted by the owner (ADR-15); pgTAP covers the rules once at the database, so screen steps test only their own behaviour. |
| RISK-24 | Step sizing is unverified; schema and screen steps may not fit one session. | Medium | Calibrate on Steps 01–03; split oversized steps with suffixes (`14a`). |
| RISK-25 | Premium cannot be bought until Step 31, so household sharing, WhatsApp, PDF and other Premium paths are only testable with the local seeded Premium user. | Medium | Seeded Premium test user (Step 04); Premium e2e flows run locally. |
| RISK-26 | Change requests CR-01 … CR-22 (§12) stop several prompts at their pre-flight checks until the upstream documents are revised. | High | Resolve the CR batch before running the affected steps; the prompts re-check and run unchanged once the documents are updated. |
| RISK-27 | Later steps reference file names created by earlier steps (taken from their session logs); a missing log entry stalls the next step. | Low | Session logs are mandatory (§5). |

---

## 11. Assumptions

_None recorded by the owner. Highest upstream ids remain ASM-09 and RISK-22._

---

## 12. Open Questions & Change Requests

**Carried forward**

| ID | Origin | Question | Locks |
|---|---|---|---|
| OQ-03 | Brief | Prices | Step 31 |
| OQ-11 | API | Payment provider | Step 31 |
| OQ-01, OQ-04, OQ-10 | Brief / Design | Targets, partner pricing, proposed composites | — |

**Change requests raised while writing the steps** (pre-flight checks in the named steps stop until each is resolved upstream)

| ID | Against | Change request | Steps |
|---|---|---|---|
| CR-01 | TC | Approve extra packages: `jsdom`, `@vitejs/plugin-react`, `server-only`, `tw-animate-css`, `react-day-picker`, `date-fns`, plus libraries for R2 presigning, web push on Workers, browser PDF, share-as-image, axe accessibility checks | 01, 02, 10, 13, 16, 19, 21, 32 |
| CR-02 | TC | Pin Next.js 16 and the middleware/proxy file name supported by the Cloudflare adapter | 01, 11 |
| CR-03 | TC | Confirm environment variable names (Step 02 list) and GitHub secret names (Step 03) | 02, 03 |
| CR-04 | TC (ADR-10) | Previews cannot reach a local database — decide preview behaviour | 03 |
| CR-05 | TC §8 | CI applies migrations to production on `main` | 03 |
| CR-06 | TC | Production city list and coordinate source | 04 |
| CR-07 | API §7.1 | How database errors carry `details` (e.g. `premium_required` → `limit`) | 06, 07 |
| CR-08 | TC §5 | Tables for idempotency keys and rate-limit counters | 22, 24, 25, 29 |
| CR-09 | TC / API | Source of the current terms version | 12 |
| CR-10 | API | One R2 key layout (§5.1 vs §10 disagree) | 13 |
| CR-11 | Design | English strings for every screen (only S15 has them) | 12–28 |
| CR-12 | Design | Entry point to edit a manual reminder | 17 |
| CR-13 | Design | S12 WhatsApp section for a Premium user before WhatsApp exists | 18 |
| CR-14 | Design / API | Copy and template ids for reminder emails, push, and "marked done" pages | 19 |
| CR-15 | TC (ADR-04) | How pg_cron gets the dispatch URL and secret | 19 |
| CR-16 | TC (ADR-16) | Folder for shared server utilities (action tokens, errors, idempotency, rate limits) | 19, 22, 25 |
| CR-17 | TC / API | Public page caching and purge mechanism | 21, 26 |
| CR-18 | API / Design | Team invitations through S14 (`og_` tokens, `InvitationView.kind`), and the account type of a new team member | 24 |
| CR-19 | API §9.4 | WhatsApp template names, languages, variables | 29 |
| CR-20 | TC (ADR-13/16) | Backup and data-export mechanics (tools, script folder, trigger) | 30 |
| CR-21 | Design | Privacy policy and terms pages (Release Criterion 4) and their text | 32 |
| CR-22 | Design / API | Vet suggestion on S03, count badges source, S17 before payments, manifest start URL and colours | 10, 17, 23, 27 |
| CR-23 | PRD | §11 and Release Criterion 1 say 58 requirements; the PRD now has 60 | 32 |

---

## 13. Glossary Additions

| Term | Definition |
|---|---|
| Step | One coding session with a closed prompt, file allowlist, tests, and verification. |
| Pre-flight check | The first instruction in a prompt that stops the session if an upstream decision it relies on is missing. |
| Lock notice | The text that replaces a prompt in a blocked step. |
| Session log | The record appended under a step after it runs. |
| Calibration pass | Running Steps 01–03 first to adjust sizing and allowlists. |

---

## 14. Appendix

_None for v1._
