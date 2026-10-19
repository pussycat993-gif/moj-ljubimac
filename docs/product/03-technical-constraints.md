# Technical Constraints — Moj Ljubimac (Web)

## Document Control

| Field | Value |
|---|---|
| Product | Moj Ljubimac ("My Pet") — web application |
| Document | 03 — Technical Constraints |
| Version | 1.6 |
| Date | 2026-10-19 |
| Author | Keti Vrtunić (interview facilitated by "Iva", Staff Engineer persona) |
| Traces to | `01-product-brief.md` v1.6 · `02-prd.md` v1.6 · `04-design-system.md` v1.5 · `05-api-integration-contract.md` v1.2 (all 2026-10-19) |
| Status | Draft — awaiting owner review (Data Model in particular) |

**Change log**

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-10-19 | Initial document: ADR-01 … ADR-13, physical data model, integrations, technical targets. |
| 1.1 | 2026-10-19 | ADR-14 added during Design Mock: UI components and styling (shadcn/ui, Tailwind CSS, lucide-react). |
| 1.2 | 2026-10-19 | `partners.type` gains `pet_hotel` (PRD v1.4). |
| 1.3 | 2026-10-19 | Data-model additions from the API Contract field audit: `data_exports`, `organisation_invitations`, `partner_hours`; new columns on organisations, partners, households, litters, pets, subscriptions, profiles; declined state for invitations and transfers. |
| 1.4 | 2026-10-19 | OQ-13: `r2_deletion_queue`, `payment_webhook_events`, `subscriptions.last_notice_days`, nullable `created_by` (on delete set null), unique indexes for meal schedule and dose logs. |
| 1.5 | 2026-10-19 | Change requests from the Build Plan: ADR-15 test strategy, ADR-16 repository and folder layout. |
| 1.6 | 2026-10-19 | Owner-approved change requests CR-01 … CR-20 (Build Plan review): ADR-17 approved libraries; ADR-18 no edge caching of public pages (reverses the 5-minute cache); Next.js 16.x pinned and request-interception file rule (ADR-01); ADR-10 amended (no preview deployments, CI applies migrations); ADR-11 cities seed; ADR-13 backup and export mechanics; ADR-16 amended (`lib/server/`, `scripts/`, `public/sw.js`, page + client files); tables `idempotency_keys` and `rate_limit_counters`; `TERMS_VERSION` constant; database error format; §8.1 environment variables; pg_cron → `pg_net` dispatch via Vault secrets. |

---

## 1. Executive Summary

This document defines how Moj Ljubimac is built: thirteen architecture decisions, the physical data model for every PRD entity, the third-party services, and the technical path to every PRD non-functional requirement. The architecture is a single Next.js application hosted on Cloudflare, backed by one Supabase project (Postgres, Auth, scheduled jobs) with files on Cloudflare R2, a once-per-minute database job dispatching reminders by email (Resend), web push, WhatsApp, and (when switched on) Viber, and subscriptions charged through Monri. Every choice is sized for one builder and a running budget of about €20/month. It traces to Brief v1.5 and PRD v1.3.

---

## 2. Inherited Context (from Brief v1.5 & PRD v1.3)

- **Constraints:** web only; one person builds and operates; no deadline; running costs ≈ €20/month; Serbian (Latin) and English; public launch waits for a registered business and a domestic card-processing contract.
- **North-star:** active reminded pets (≥ 1 delivered reminder in the trailing 30 days) — the reminder pipeline is the most reliability-critical path.
- **Epics:** EPIC-01 Pet Health Record · EPIC-02 Care Log & Moments · EPIC-03 Reminders · EPIC-04 Household Sharing · EPIC-05 Accounts & Subscriptions · EPIC-06 Organisation Accounts · EPIC-07 Local Partners.
- **Domain entities (PRD §4):** User, Subscription, Household, Household Membership, Pet, Organisation, Organisation Membership, Weight Entry, Vaccination, Treatment, Dose Log, Vet Visit, Attachment, Feeding Entry, Stool Entry, Moment, Moment Photo, Public Link, Memorial Record, Reminder, Reminder Delivery, Intake, Adoption Request, Litter, Breeder Inquiry, Record Transfer, Partner, Partner Click.
- **NFRs:** NFR-01 … NFR-10 (PRD §10).

**Change requests raised in this interview and applied upstream**
- Apple sign-in deferred beyond v1 (requires a paid Apple Developer account) → PRD v1.2.
- WhatsApp/Viber capped at 30 messages per Premium user per month → PRD v1.2–1.3.
- Viber built but switched off until Premium revenue covers its fixed fee → Brief v1.5, PRD v1.3.
- Payments through a domestic processor; launch waits for business registration → Brief v1.5.

**Carried-forward open questions**

| ID | Origin | Status here |
|---|---|---|
| OQ-01 | Brief | Still open — metric targets (non-technical) |
| OQ-03 | Brief | Still open — prices (non-technical; plan table holds prices as data) |
| OQ-04 | Brief | Still open — partner pricing (non-technical; billed outside the product) |

---

## 3. Architecture Decision Records

### ADR-01 — Single Next.js application over Supabase
- **Context:** one builder, no team; the product has a UI, server-side logic (payments, messaging, admin), and public pages.
- **Decision:** one Next.js (App Router, TypeScript) application containing both the user interface and server-side logic, using Supabase for database, authentication, and scheduled jobs.
- **Alternatives considered:** separate backend API (e.g., Laravel or Node) plus a separate frontend — rejected: two codebases and two deployments to maintain for a single person, with no PRD requirement that needs the split.
- **Consequences:** all server logic lives in the Next.js server runtime and in database functions; the owner already knows Next.js and Supabase from earlier work.
- **Version pin (v1.6, CR-02):** Next.js 16.x. Request interception (session refresh, route protection) lives in the file name that both Next.js 16 and the OpenNext Cloudflare adapter support — Next.js 16 renamed `middleware.ts` to `proxy.ts`. The build step that introduces it must verify which name the adapter supports and stop (raise a change request) if neither works.

### ADR-02 — New Supabase project and a new schema derived from this PRD
- **Context:** the mobile app's Supabase schema was never put into production and lacks organisations, partners, transfers, and public pages.
- **Decision:** create a new Supabase project with a schema designed from PRD v1.3; the mobile app adapts to it later if revived.
- **Alternatives considered:** extend the mobile schema — rejected: retrofitting organisations and transfers onto an owner-only schema costs more than designing fresh, and nothing is in production to preserve.
- **Consequences:** no data migration; mobile and web will share this schema if mobile resumes.

### ADR-03 — Hosting: Cloudflare for the app, Supabase Free for data
- **Context:** ≈ €20/month budget. Vercel's free plan forbids commercial use and Vercel Pro plus Supabase Pro would cost about twice the budget.
- **Decision:** host the Next.js app on Cloudflare (Workers, free plan; commercial use allowed) and use the Supabase Free plan at launch. Move to Supabase Pro once Premium revenue covers it.
- **Alternatives considered:** (1) Supabase Pro from day one — rejected: exceeds budget before any revenue; (2) one rented server running app and database — rejected: makes the owner a server administrator (patching, security, backups).
- **Consequences:** Free-plan limits apply (project pause after inactivity, limited bandwidth, no automatic backups) — mitigated by ADR-07 and ADR-13 and listed in RISK-13.

### ADR-04 — Reminder dispatch by a once-per-minute database job
- **Context:** NFR-01 requires delivery within 5 minutes for ≥ 95% of reminders; reminders are the north-star path.
- **Decision:** a scheduled job inside Supabase (pg_cron) runs every minute, selects due reminder occurrences, and calls a server function that delivers them through the chosen channels and records each delivery.
- **Alternatives considered:** Cloudflare Cron Triggers calling the app — rejected: scheduling and sending logic would live in two systems.
- **Consequences:** worst-case delay ≈ 1–2 minutes plus provider latency; a single job is the single point of failure for reminders (RISK-14).

### ADR-05 — Web push as a free channel
- **Context:** Brief v1.2 adds push as a free channel; the product has no native app.
- **Decision:** standard Web Push (VAPID keys, service worker). iPhone users are shown a short "Add to Home Screen" guide when they enable push, since iOS delivers web push only to installed home-screen web apps.
- **Alternatives considered:** a paid push service (e.g., OneSignal) — rejected: standard Web Push is free and sufficient for one-way reminders.
- **Consequences:** iPhone users who skip home-screen installation get no push (RISK-09 in PRD); email remains available.

### ADR-06 — Authentication: Supabase Auth with email + password and Google
- **Context:** FR-33/34, BR-29 (as revised in PRD v1.2).
- **Decision:** Supabase Auth with email + password (mandatory verification) and Google sign-in.
- **Alternatives considered:** keep Apple sign-in in v1 — rejected: requires a paid Apple Developer account (≈ $99/year), the store cost the owner set out to avoid.
- **Consequences:** Apple sign-in can be added later without schema changes.

### ADR-07 — Files on Cloudflare R2
- **Context:** attachments up to 10 MB, unlimited for Premium (FR-08); moment photos (FR-17). Supabase Free storage is 1 GB with 2 GB/month bandwidth.
- **Decision:** store all files on Cloudflare R2 (10 GB free, no egress fees); the database stores only file keys and metadata. Files are private and served through short-lived signed links; public moment photos are served only through the public-link page.
- **Alternatives considered:** Supabase Storage, moving to Pro when full — rejected: the 1 GB limit would be reached quickly and push the whole project to Pro early.
- **Consequences:** two storage systems (database on Supabase, files on R2); deletion must remove both (handled by the deletion jobs in §5).

### ADR-08 — Transactional email via Resend
- **Context:** email reminders, invitations, verification, adoption/inquiry outcomes, expiry notices.
- **Decision:** Resend for all outgoing email, including Supabase Auth emails through custom SMTP.
- **Alternatives considered:** Brevo — rejected: Resend integrates more simply with Next.js; Supabase's built-in email — rejected: not intended for production volume.
- **Consequences:** free-tier daily/monthly limits must be watched (RISK-15).

### ADR-09 — Payments via Monri with tokenised recurring charges
- **Context:** Stripe does not onboard Serbian-registered businesses directly; the owner chose a domestic processor (Brief v1.5); auto-renewal is required (FR-37, BR-07).
- **Decision:** Monri, operating in Serbia, with card tokenisation: the first payment is customer-initiated with consent to future charges; renewals are merchant-initiated charges against the stored token. Our database stores only the Monri token reference and subscription state, never card data.
- **Alternatives considered:** Paddle / Lemon Squeezy (merchant of record) — rejected by the owner in favour of a domestic processor; a bank's own gateway — rejected for now: recurring support could not be confirmed.
- **Consequences:** the acquiring bank must approve merchant-initiated transactions; this is a hard condition when choosing the bank (RISK-16). Launch waits for business registration and the contract.

### ADR-10 — Environments: local and production
- **Context:** one builder, no deadline.
- **Decision:** local development (Supabase running locally) and production. Only `main` deploys: every push to `main` that passes CI first applies pending database migrations to production (`supabase db push`) and then deploys the app to production. Other branches run CI only (type-check, lint, tests, build); there are no preview deployments in v1 (amended in v1.6, CR-04, CR-05).
- **Alternatives considered:** a dedicated staging environment — rejected: a second full environment is maintenance a single person cannot justify for v1. Per-branch Cloudflare preview links (the original v1.0 decision) — rejected in v1.6: a preview needs its own database and secrets to be safe, which is the same maintenance as staging.
- **Consequences:** changes are checked locally before merging to `main`; a migration that fails on production stops the deploy, so the app never runs against a schema it does not expect.

### ADR-11 — Partner location without paid map services
- **Context:** "nearby" partners and vet suggestions (FR-52, FR-53, FR-56).
- **Decision:** when the Operator saves a partner, its address is converted once to coordinates through OpenStreetMap Nominatim; user profile cities come from a preloaded table of Serbian cities with coordinates; current location comes from the browser with permission; distance is computed in the database.
- **Alternatives considered:** Google Maps APIs — rejected: billed and requires a card on the account.
- **Consequences:** low-volume geocoding only in the admin area; the Operator can correct coordinates manually if geocoding fails.
- **Cities seed (v1.6, CR-06):** the `cities` table holds every town that is the seat of a municipality or city in Serbia, with names in Serbian Latin and English. Coordinates are fetched once from Nominatim by a one-off script in `scripts/` and committed as seed SQL (`supabase/seed/cities.sql`); the app never geocodes cities at runtime.

### ADR-12 — PDF export generated in the browser
- **Context:** Premium PDF export of the full record (FR-10).
- **Decision:** the PDF is generated in the user's browser from the record data.
- **Alternatives considered:** server-side PDF rendering — rejected: heavy work that does not fit the free Cloudflare runtime limits.
- **Consequences:** large records with many images may take longer on slow phones; attachments are listed rather than embedded if needed.

### ADR-13 — Nightly backups and data export via GitHub Actions
- **Context:** Supabase Free has no automatic backups; FR-41 requires a full personal data archive.
- **Decision:** a nightly GitHub Actions job exports the database to R2 and keeps the last 14 days; per-user data archives are built on request inside the app (amended in v1.6 — see Mechanics).
- **Alternatives considered:** rely on Supabase Pro backups — rejected for launch on cost (ADR-03).
- **Consequences:** up to 24 hours of data could be lost in a disaster; restores are manual.
- **Mechanics (v1.6, CR-20):** *Backups* — a nightly GitHub Actions workflow runs `scripts/backup.sh`, which runs `pg_dump` against `SUPABASE_DB_URL` and uploads the dump to the separate backup bucket (`R2_BACKUP_BUCKET`) with the AWS CLI (S3-compatible endpoint), then deletes objects older than 14 days. *Data export archives* — built inside the app, not in GitHub Actions: pg_cron calls the internal route `/api/internal/exports` every 5 minutes (same `pg_net` + Vault pattern as reminder dispatch, §8), which builds pending archives with `fflate` and uploads them to `R2_BUCKET` under `exports/`.

### ADR-14 — UI components and styling: shadcn/ui, Tailwind CSS, lucide-react
- **Context:** the design system needs an approved component and styling foundation; the original document did not name one (raised in Design Mock).
- **Decision:** shadcn/ui components (copied into the project), styled with Tailwind CSS utilities consuming design tokens; icons from lucide-react.
- **Alternatives considered:** a packaged component library such as Mantine or MUI — rejected: harder to apply the Moj Ljubimac brand, heavier pages, and a dependency the single builder cannot shape.
- **Consequences:** components live in the codebase and are owned by the project; tokens from `04-design-system.md` are the only source of colours, sizes, and radii.

### ADR-15 — Test strategy: Vitest, pgTAP, Playwright
- **Context:** every build step must ship tests for its acceptance criteria (Build Plan); business rules and Free limits live in the database (API Contract §3.1), so they must be tested there.
- **Decision:** Vitest + Testing Library for application logic, server actions, and components; pgTAP through the Supabase CLI (`supabase test db`) for constraints, triggers, RLS policies, and RPC functions; Playwright for a small set of end-to-end flows (registration, add pet, add vaccination and see the reminder, mark done, household invitation, shelter intake to adoption). Every step must pass type-check, lint, build, and the relevant test suites.
- **Alternatives considered:** Jest — rejected: slower and needs extra configuration for the Next.js/TypeScript setup that Vitest handles natively; testing rules only through the app — rejected: rules enforced in the database could be bypassed by a surface the app tests never call.
- **Consequences:** a local Supabase instance is required to run pgTAP and e2e tests; test volume grows with the requirement count (Build Plan risk).

### ADR-16 — Repository and folder layout
- **Context:** build prompts must name exact files; no layout was fixed.
- **Decision:** a new repository `pussycat993-gif/moj-ljubimac` (new and empty; the earlier mobile code is not in it). Layout:
  - `app/` — routes matching the Design System screen inventory (`app/(app)/…` signed-in, `app/(org)/…` organisation, `app/(auth)/…`, `app/(public)/…`, `app/admin/…`, `app/api/…` route handlers)
  - `components/ui/` — shadcn primitives (project-owned); `components/app/` — composites from `04-design/components`
  - `lib/supabase/` — server, browser, and service-role clients plus generated types; `lib/actions/<resource>.ts` — server actions per resource; `lib/integrations/` — Resend, WhatsApp, R2, web push, Nominatim, payments adapter; `lib/i18n/` — Serbian and English strings
  - `lib/server/` — shared server-only utilities (action tokens, `ApiError` / `ActionResult` helpers, idempotency, rate limits, database error mapping); every module imports `server-only` (v1.6, CR-16)
  - `lib/legal.ts` — `TERMS_VERSION` constant (v1.6, CR-09)
  - `supabase/migrations/` — SQL migrations; `supabase/tests/` — pgTAP tests; `supabase/seed.sql` — seed data; `supabase/seed/cities.sql` — cities seed (ADR-11)
  - `scripts/` — one-off and CI scripts (e.g. cities fetch, `backup.sh`) (v1.6, CR-16)
  - `public/sw.js` — the Web Push service worker (ADR-05) (v1.6, CR-16)
  - `tests/` — Vitest; `e2e/` — Playwright
  - Route convention (v1.6, CR-16): each route is a server `page.tsx` plus a colocated `*-client.tsx` client component ported from the matching mockup screen in `04-design/`.
- **Alternatives considered:** a folder inside the existing mobile repository — rejected: the schema is new and the mobile app is on hold, so a shared repository adds coupling without shared code.
- **Consequences:** mobile reuse of types, if revived, happens by generating types from the same Supabase project.

### ADR-17 — Approved libraries
- **Context:** build steps install packages; without an approved list each step would choose its own, and some popular packages do not run on Cloudflare Workers (Node-only crypto, file system, native binaries) (raised as CR-01).
- **Decision:** only the packages below (and their own dependencies) may be added. Anything else needs a Technical Constraints change first.

| Package | Purpose | ADR |
|---|---|---|
| `next` (16.x), `react`, `react-dom`, `typescript` | Application framework | ADR-01 |
| `@opennextjs/cloudflare`, `wrangler` | Cloudflare Workers adapter and deploy | ADR-03 |
| `@supabase/supabase-js`, `@supabase/ssr` | Database, auth, and session cookies | ADR-02, ADR-06 |
| `server-only` | Guards server-only modules (`lib/server/`) from client import | ADR-16 |
| `tailwindcss`, `tw-animate-css`, `lucide-react`, and whatever `npx shadcn@latest add` installs for the components in Design System §6 | UI components and styling | ADR-14 |
| `react-day-picker`, `date-fns` | Date picker and date arithmetic/formatting | ADR-14 |
| `aws4fetch` | R2 S3-compatible presigned URLs; runs on Workers | ADR-07 |
| `@pushforge/builder` | Web Push with VAPID on Workers; zero dependencies | ADR-05 |
| `@react-pdf/renderer` | Browser-side PDF export | ADR-12 |
| `html-to-image` | Moment share-as-image, in the browser | — (FR-18) |
| `fflate` | ZIP for data export archives on Workers | ADR-13 |
| `vitest`, `@vitejs/plugin-react`, `jsdom`, Testing Library | Unit and component tests | ADR-15 |
| `@playwright/test`, `@axe-core/playwright` | End-to-end and accessibility checks (NFR-04) | ADR-15 |

- **Alternatives considered:** `web-push` (Node crypto, does not run on Workers); `@aws-sdk/client-s3` (large bundle, Node-oriented); `jszip` (heavier than `fflate`); server-side PDF/image rendering (ADR-12) — all rejected for Workers compatibility or size; an open "any package" policy — rejected: unreviewed packages are the most likely cause of Workers runtime failures (RISK-11).
- **Consequences:** a step that needs a package not on the list stops and raises a change request; the list is the reference for dependency review.

### ADR-18 — No edge caching of public pages in v1
- **Context:** API Contract v1.1 cached public organisation pages and public moment pages for 5 minutes at the edge, which required purging the cache whenever a listing, organisation, or link changed (raised as CR-17).
- **Decision:** public pages (API EP-24, EP-62) render on every request; no edge cache and no purge mechanism in v1. This reverses the 5-minute cache.
- **Alternatives considered:** 5-minute edge cache with purge on change — rejected: purge calls from several write paths add complexity and failure modes (stale "available" animals after adoption, revoked links still visible) for traffic v1 does not have.
- **Consequences:** changes (status, revoked link) are visible immediately; every public view costs one database read — revisit if public traffic threatens Free-plan limits (RISK-12).

---

## 4. Tech Stack Summary

| Layer | Choice | ADR |
|---|---|---|
| Application (UI + server logic) | Next.js 16.x (App Router, TypeScript) | ADR-01 |
| Approved libraries | Fixed package list; anything else needs a TC change | ADR-17 |
| UI components & styling | shadcn/ui, Tailwind CSS, lucide-react | ADR-14 |
| App hosting | Cloudflare Workers (via OpenNext adapter) | ADR-03 |
| Database | Supabase Postgres (Free plan at launch) | ADR-02, ADR-03 |
| Authentication | Supabase Auth — email + password, Google | ADR-06 |
| Scheduled jobs | Supabase pg_cron → `pg_net` calls to internal routes (every minute: dispatch; every 5 min: data exports; nightly: occurrence generation, deletions) | ADR-04, ADR-13 |
| File storage | Cloudflare R2 (`aws4fetch` presigned URLs); separate backup bucket | ADR-07, ADR-17 |
| Email | Resend | ADR-08 |
| Push | Web Push (VAPID, `public/sw.js`, `@pushforge/builder`) | ADR-05, ADR-17 |
| Public page caching | None in v1 (render on request) | ADR-18 |
| WhatsApp / Viber | WhatsApp Business Platform (Cloud API); Viber chatbot (off until enabled) | ADR-04, §6 |
| Payments | Monri (tokenised recurring) | ADR-09 |
| Geocoding | OpenStreetMap Nominatim (admin only) | ADR-11 |
| PDF | Browser-side generation (`@react-pdf/renderer`) | ADR-12, ADR-17 |
| Backups & data export | Backups: GitHub Actions `pg_dump` → R2 backup bucket (14 days); exports: in-app route with `fflate` → R2 | ADR-13 |
| CI/CD | CI on every branch; push to `main` → `supabase db push` then Cloudflare deploy; no preview deployments | ADR-10 |
| Tests | Vitest + Testing Library, pgTAP (Supabase CLI), Playwright | ADR-15 |
| Repository layout | `pussycat993-gif/moj-ljubimac`, folders per ADR-16 | ADR-16 |

---

## 5. Data Model

Postgres (Supabase). Conventions for every table unless stated otherwise:
- `id uuid primary key default gen_random_uuid()`, `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`.
- Every care/record entry has `created_by uuid references profiles(id) on delete set null` — set on insert (not null at creation, enforced by trigger) and cleared when the author's account is deleted, so shared records survive (BR-23, BR-26, BR-27).
- Row Level Security is enabled on every table; access follows the PRD's permission rules (owner, household member, organisation Admin/Volunteer, Operator).
- Enumerations are Postgres enums; user-facing labels are translated in the app (Serbian Latin / English).
- Times are stored as `timestamptz` (UTC) and shown in Europe/Belgrade (NFR-02).
- Files are referenced by R2 object key (`r2_key text`); file bytes never live in the database.

### 5.1 Accounts, subscriptions, households

**profiles** (User) — one row per `auth.users` row
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | FK → `auth.users.id` on delete cascade |
| account_type | enum `owner` / `shelter` / `breeder` | not null (BR-30) |
| full_name | text | |
| locale | enum `sr-Latn` / `en` | not null, default `sr-Latn` |
| city_id | uuid FK → cities | profile city for "nearby" |
| email | text | not null; copy of `auth.users.email`, kept in sync by trigger — lets household/team/admin views show emails without reading `auth.users` |
| is_operator | boolean | default false; Operator admin access |
| trial_used | boolean | default false (BR-07: one trial per user) |
| deletion_requested_at | timestamptz | null unless deletion pending (BR-31) |
| deletion_due_at | timestamptz | `deletion_requested_at + 30 days`; indexed for the nightly job |
| terms_accepted_at | timestamptz | not null; set at registration |
| terms_version | text | not null; version of terms accepted — registration stores the `TERMS_VERSION` constant from `lib/legal.ts` (v1.6, CR-09) |

**subscriptions** (Subscription)
| Column | Type | Notes |
|---|---|---|
| user_id | uuid FK → profiles | not null; index |
| plan | enum `premium_monthly` / `premium_yearly` / `breeder_monthly` / `breeder_yearly` | not null |
| status | enum `trialing` / `active` / `cancelled` / `expired` / `payment_failed` | not null |
| trial_ends_at | timestamptz | |
| current_period_end | timestamptz | not null; drives "days remaining" and expiry notices |
| auto_renew | boolean | not null default true; false after cancellation (BR-08) |
| monri_token_ref | text | Monri card token reference only — never card data |
| monri_cit_id | text | initial customer-initiated transaction id |
| card_brand | text | e.g. `visa`, `mastercard` — display only, from Monri |
| card_last4 | char(4) | display only, from the provider; never the full number |
| last_notice_days | smallint | last expiry notice sent (30 / 7 / 1) so a re-run never double-sends (BR-09) |
- Unique partial index: one row with status in (`trialing`,`active`,`cancelled`) per `user_id` and plan family.

**subscription_payments** — technical necessity: record of every charge attempt
| Column | Type | Notes |
|---|---|---|
| subscription_id | uuid FK → subscriptions | not null; index |
| amount_minor | integer | > 0 (RSD para) |
| currency | char(3) | default `RSD` |
| kind | enum `initial` / `renewal` | |
| result | enum `succeeded` / `failed` | |
| monri_transaction_id | text | unique |

**plans** — technical necessity: prices as data, since OQ-03 is still open
| Column | Type | Notes |
|---|---|---|
| code | same enum as `subscriptions.plan`, unique | |
| price_minor | integer | > 0 |
| currency | char(3) | `RSD` |
| active | boolean | |

**households** (Household)
| Column | Type | Notes |
|---|---|---|
| owner_id | uuid FK → profiles | unique (BR-20: an owner owns at most one); `on delete set null` with ownership transfer (BR-27) |
| name | text | not null; e.g. "Domaćinstvo Petrović" |
| read_only | boolean | derived flag set when owner has no Premium (BR-28, FR-31) |

**household_memberships** (Household Membership)
| Column | Type | Notes |
|---|---|---|
| household_id | uuid FK → households | on delete cascade |
| user_id | uuid FK → profiles | |
| joined_at | timestamptz | not null; earliest-joined member inherits ownership (BR-27) |
| reminders_enabled | boolean | default false (BR-24, FR-29) |
- Unique (`household_id`, `user_id`). Max 6 members per household enforced by trigger (BR-20).

**household_invitations** — technical necessity: email or link invitations (FR-26)
| Column | Type | Notes |
|---|---|---|
| household_id | uuid FK → households | |
| email | text | null for link-only invitations |
| token_hash | text | unique; the raw token is only in the link |
| expires_at | timestamptz | |
| accepted_by | uuid FK → profiles | null until accepted |
| status | enum `pending` / `accepted` / `declined` / `expired` | default `pending` |
| decided_at | timestamptz | |

**household_pets** — join table for the many-to-many "household shares pets" (FR-27)
| Column | Type | Notes |
|---|---|---|
| household_id | uuid FK → households | PK part |
| pet_id | uuid FK → pets | PK part; on delete cascade |

### 5.2 Organisations

**organisations** (Organisation)
| Column | Type | Notes |
|---|---|---|
| type | enum `shelter` / `breeder` | not null |
| name | text | not null |
| slug | text | unique; used for the public page |
| city_id | uuid FK → cities | |
| approval_status | enum `pending` / `approved` / `rejected` | shelters start `pending`, breeders `approved` (BR-32) |
| rejection_reason | text | set by the Operator on rejection |
| tax_id | text | PIB, optional |
| registration_note | text | optional note at registration |
| description | text | public page |
| phone, email, website | text | public contact details |
| logo_r2_key | text | |
| created_by | uuid FK → profiles | |

**organisation_memberships** (Organisation Membership)
| Column | Type | Notes |
|---|---|---|
| organisation_id | uuid FK → organisations | on delete cascade |
| user_id | uuid FK → profiles | |
| role | enum `admin` / `volunteer` | not null (BR-34) |
- Unique (`organisation_id`, `user_id`). Max 20 per organisation enforced by trigger (BR-34).

**organisation_invitations** — technical necessity: team invitations (FR-43)
| Column | Type | Notes |
|---|---|---|
| organisation_id | uuid FK → organisations | on delete cascade |
| email | text | not null |
| role | enum `admin` / `volunteer` | not null |
| token_hash | text | unique |
| expires_at | timestamptz | |
| status | enum `pending` / `accepted` / `declined` / `expired` | default `pending` |
| accepted_by | uuid FK → profiles | |

### 5.3 Pets and the health record

**pets** (Pet) — one table for personal pets, shelter animals, and breeder animals/offspring
| Column | Type | Notes |
|---|---|---|
| owner_id | uuid FK → profiles | null if organisation-owned |
| organisation_id | uuid FK → organisations | null if personally owned |
| name | text | not null |
| species | enum (dog, cat, rabbit, hamster, guinea_pig, chinchilla, ferret, bird, fish, turtle, lizard, snake, other) | not null |
| species_other | text | required when `species = other` (check) |
| breed, colour_markings, microchip_number, passport_number, note | text | |
| sex | enum `male` / `female` / `unknown` | not null |
| birth_date | date | |
| birth_year | smallint | used when only an approximate year is known |
| neutered | enum `yes` / `no` / `unknown` | default `unknown` |
| photo_r2_key | text | |
| vet_name, vet_phone | text | "my vet"; empty → vet suggestions (BR-43) |
| weight_unit | enum `kg` / `g` | default `kg` (FR-03) |
| lifecycle | enum `active` / `memorial` | default `active` (BR-03) |
| shelter_status | enum `intake` / `in_care` / `available` / `reserved` / `adopted` / `deceased` / `returned_to_owner` | shelter animals only (BR-35) |
| offspring_status | enum `available` / `reserved` / `sold` | breeder offspring only (PRD v1.1) |
| breeding_status | enum `active` / `retired` | breeder's adult breeding animals only |
| litter_id | uuid FK → litters | breeder offspring only |
| price_minor | integer | breeder offspring only; ≥ 0 |
| public_description | text | shown on public pages |
| approx_age_text | text | public "approximate age" |
- Check: exactly one of `owner_id`, `organisation_id` is not null.
- Indexes: (`owner_id`, `lifecycle`) for the Free active-pet limit; (`organisation_id`, `shelter_status`); (`organisation_id`, `offspring_status`).

**memorial_records** (Memorial Record)
| Column | Type | Notes |
|---|---|---|
| pet_id | uuid FK → pets | unique; on delete cascade |
| date | date | not null |
| reason | enum `passed_away` / `rehomed` / `lost` | |
| note | text | |

**weight_entries** (Weight Entry) — `pet_id` FK (cascade), `measured_on date not null`, `value numeric(9,3) not null check (value > 0)` stored in the pet's unit, `note`, `created_by`. Index (`pet_id`, `measured_on`).

**vaccinations** (Vaccination) — `pet_id` FK (cascade), `name text not null`, `given_on date not null`, `next_due_on date`, `clinic text`, `batch_number text`, `note`, `created_by`. Index (`pet_id`, `given_on`).

**treatments** (Treatment) — `pet_id` FK (cascade), `type enum medication/deworming/flea_tick/other not null`, `name text not null`, `dose text`, `interval_value integer check > 0`, `interval_unit enum hours/days`, `starts_on date not null`, `ends_on date`, `note`, `created_by`.

**dose_logs** (Dose Log) — `treatment_id` FK (cascade), `given_at timestamptz not null`, `occurrence_id uuid FK → reminder_occurrences` (nullable, unique when not null), `created_by`.

**vet_visits** (Vet Visit) — `pet_id` FK (cascade), `visited_on date not null`, `clinic text`, `reason text not null`, `findings text`, `recommendations text`, `cost_minor integer check ≥ 0`, `follow_up_on date`, `created_by`.

**attachments** (Attachment)
| Column | Type | Notes |
|---|---|---|
| vet_visit_id | uuid FK → vet_visits | on delete cascade |
| pet_id | uuid FK → pets | denormalised for the per-pet Free limit (BR-01) |
| r2_key | text | not null |
| file_name | text | |
| mime_type | text | check: image/* or application/pdf (BR-05) |
| size_bytes | integer | check ≤ 10 485 760 (BR-05) |
| created_by | uuid FK → profiles | |
- Index (`pet_id`) for counting.

### 5.4 Care log and moments

**feeding_entries** (Feeding Entry) — `pet_id` FK (cascade), `fed_at timestamptz not null`, `type enum dry/wet/treat/home_made/other not null`, `brand text`, `amount_g numeric(8,1) check > 0`, `note`, `created_by`. Index (`pet_id`, `fed_at`).

**stool_entries** (Stool Entry) — `pet_id` FK (cascade), `observed_at timestamptz not null`, `consistency enum normal/soft/diarrhoea/hard not null`, `blood_or_mucus boolean not null default false`, `note`, `created_by`.

**moments** (Moment) — `pet_id` FK (cascade), `moment_date date not null`, `text text`, `created_by`. Index (`pet_id`) for the Free limit (BR-01).

**moment_photos** (Moment Photo) — `moment_id` FK (cascade), `r2_key text not null`, `position smallint check between 1 and 5`; unique (`moment_id`, `position`) (BR-06).

**moment_public_links** (Public Link) — `moment_id` FK (cascade) unique, `slug text unique not null` (unguessable), `active boolean not null default true` (BR-45).

### 5.5 Reminders

**reminders** (Reminder) — the definition
| Column | Type | Notes |
|---|---|---|
| user_id | uuid FK → profiles | owner of the reminder |
| pet_id | uuid FK → pets | nullable (BR-18); on delete cascade |
| type | enum `vaccination` / `treatment_dose` / `vet_follow_up` / `meal` / `birthday` / `manual` | not null |
| source_id | uuid | id of the vaccination / treatment / vet visit that created it; null for meal, birthday, manual |
| title | text | for manual reminders |
| starts_at | timestamptz | first due time |
| recurrence | enum `none` / `hourly_interval` / `daily` / `weekly` / `monthly` / `yearly` | |
| interval_value | integer | for treatment intervals |
| meal_times | time[] | meal reminders (FR-15) |
| meal_weekdays | smallint[] | 1–7; meal reminders |
| ends_at | timestamptz | |
| active | boolean | false for memorial pets (BR-17) |
- Index (`source_id`) to update/remove reminders when the source record changes (E-01).
- Unique partial index (`pet_id`) where `type = 'meal'` — one meal schedule per pet.

**reminder_occurrences** — technical necessity: each individual due instance
| Column | Type | Notes |
|---|---|---|
| reminder_id | uuid FK → reminders | on delete cascade |
| due_at | timestamptz | not null |
| notify_at | timestamptz | due_at minus a lead time; one row per lead time |
| status | enum `pending` / `sent` / `resent` / `done` / `missed` | default `pending` |
| sent_at, resent_at | timestamptz | BR-15 |
| done_at | timestamptz | |
| done_by | uuid FK → profiles | |
- Partial index on (`notify_at`) where `status = 'pending'` — the every-minute job's lookup (ADR-04).
- Partial index on (`sent_at`) where `status = 'sent'` — the 30-minute re-send lookup.
- Occurrences are generated on a rolling 60-day window by the nightly job, so recurring reminders never need unbounded rows.

**reminder_deliveries** (Reminder Delivery)
| Column | Type | Notes |
|---|---|---|
| occurrence_id | uuid FK → reminder_occurrences | on delete cascade |
| recipient_id | uuid FK → profiles | owner or opted-in member |
| channel | enum `email` / `push` / `whatsapp` / `viber` | |
| status | enum `delivered` / `failed` | |
| provider_message_id | text | |
| error | text | |
| delivered_at | timestamptz | |
- Index (`recipient_id`, `channel`, `delivered_at`) — monthly WhatsApp/Viber cap count (BR-14a).
- Index (`delivered_at`) — north-star query (pets with ≥ 1 delivered reminder in 30 days) and 12-month retention purge (NFR-08).

**reminder_preferences** — technical necessity: per-user, per-type settings (FR-22, FR-23)
| Column | Type | Notes |
|---|---|---|
| user_id | uuid FK → profiles | |
| type | same enum as `reminders.type` | |
| lead_minutes | integer[] | e.g. {10080, 0}; ignored for `treatment_dose` and `meal` |
| delivery_time | time | time of day for lead-time notices |
| channels | enum[] | subset of email/push/whatsapp/viber |
- Unique (`user_id`, `type`).

**push_subscriptions** — technical necessity: browser endpoints for Web Push (ADR-05) — `user_id` FK, `endpoint text unique`, `p256dh text`, `auth text`, `user_agent text`.

**user_channels** — technical necessity: verified WhatsApp/Viber identity per user — `user_id` FK, `channel enum whatsapp/viber`, `address text` (phone or Viber id), `opted_in_at timestamptz`; unique (`user_id`, `channel`).

**app_settings** — technical necessity: Operator switches — single row with `viber_enabled boolean default false` (BR-14b).

### 5.6 Shelter, breeder, transfers

**intakes** (Intake) — `pet_id` FK (cascade) unique, `intake_on date not null`, `arrival_type enum found/surrendered/confiscated/other not null`, `place_found text`, `note`, `created_by`.

**pet_status_history** — technical necessity: dated status changes (FR-45) — `pet_id` FK (cascade), `status text not null`, `changed_at timestamptz not null`, `changed_by`.

**adoption_requests** (Adoption Request) — `pet_id` FK, `requester_id` FK → profiles, `name text not null`, `phone text not null`, `email text not null`, `message text`, `status enum pending/accepted/rejected default pending`, `decided_by`, `decided_at`.

**litters** (Litter) — `organisation_id` FK, `mother_id uuid not null FK → pets`, `father_id uuid FK → pets`, `father_name text` (sire outside the system; check: at most one of `father_id`, `father_name`), `born_on date not null`, `offspring_count smallint check > 0`.

**breeder_inquiries** (Breeder Inquiry) — same columns as `adoption_requests`.

**record_transfers** (Record Transfer)
| Column | Type | Notes |
|---|---|---|
| pet_id | uuid FK → pets | |
| from_organisation_id | uuid FK → organisations | |
| recipient_email | text | not null |
| token_hash | text | unique |
| expires_at | timestamptz | 30 days; re-send creates a new token (BR-38) |
| accepted_by | uuid FK → profiles | |
| accepted_at | timestamptz | |
| status | enum `pending` / `accepted` / `declined` / `expired` | default `pending` |
| new_pet_id | uuid FK → pets | the copy created for the new owner; the original stays with the organisation as read-only (BR-38) |

### 5.7 Partners and reference data

**partners** (Partner)
| Column | Type | Notes |
|---|---|---|
| type | enum `vet` / `pet_shop` / `grooming` / `pet_hotel` | not null |
| name, address | text | not null |
| city_id | uuid FK → cities | not null |
| phone | text | not null |
| email, website, instagram, description | text | |
| logo_r2_key | text | |
| message_channel | enum `none` / `sms` / `viber` / `whatsapp` | default `none` (BR-44) |
| message_number | text | number used for "Send message"; may differ from `phone` |
| latitude, longitude | double precision | from Nominatim, editable (ADR-11) |
| featured | boolean | default false |
| paid_until | date | not null; hidden after this date (BR-40) |
- Index (`city_id`, `type`, `featured`, `paid_until`). Trigger limits `featured = true` to 3 per (`city_id`, `type`) (BR-41).

**partner_hours** — technical necessity: structured working hours — `partner_id` FK (cascade), `weekday smallint check 1–7`, `opens time not null`, `closes time not null`; unique (`partner_id`, `weekday`); a missing weekday means closed.

**partner_clicks** (Partner Click) — `partner_id` FK (cascade), `action enum call/message/email/website not null`, `clicked_at timestamptz not null default now()`, `user_id` FK nullable. Index (`partner_id`, `action`).

**r2_deletion_queue** — technical necessity: `r2_key text primary key`, `queued_at timestamptz not null default now()`; filled when rows with files are deleted, emptied by the nightly job.

**payment_webhook_events** — technical necessity: `provider text`, `event_id text`, `received_at timestamptz`; unique (`provider`, `event_id`) for webhook idempotency (provider deferred, OQ-11).

**data_exports** — technical necessity: personal data archives (FR-41) — `user_id` FK, `status enum preparing/ready/failed/expired`, `r2_key text`, `size_bytes bigint`, `requested_at`, `ready_at`, `expires_at` (7 days after ready).

**cities** — technical necessity: preloaded Serbian cities — `name_sr text`, `name_en text`, `latitude`, `longitude`. Seeded from `supabase/seed/cities.sql` (ADR-11).

**idempotency_keys** — technical necessity: replay-safe writes (API Contract §3.3 idempotency rule) (v1.6, CR-08)
| Column | Type | Notes |
|---|---|---|
| user_id | uuid FK → profiles | not null; on delete cascade |
| key | uuid | not null; client-supplied idempotency key |
| operation | text | not null; e.g. `pets.create` |
| result | jsonb | the stored result returned on replay |
| created_at | timestamptz | not null default now() |
- Unique (`user_id`, `key`). Rows older than 24 hours are purged by the nightly job (§5.9).

**rate_limit_counters** — technical necessity: per-user rate limits (API Contract §11) (v1.6, CR-08)
| Column | Type | Notes |
|---|---|---|
| user_id | uuid FK → profiles | not null; on delete cascade |
| operation | text | not null; e.g. `invitations.send` |
| window_start | timestamptz | not null; start of the counting window |
| count | integer | not null default 0 |
- Unique (`user_id`, `operation`, `window_start`). Expired windows are purged by the nightly job (§5.9).

### 5.7.1 Database error format (v1.6, CR-07)
Triggers and RPC functions that reject a write raise an exception whose `MESSAGE` is either `'<code>'` or `'<code>:<detail>'` (e.g. `premium_required:pets`). `lib/server` maps it to `ApiError { code, details }`, putting the detail under the key the code defines (e.g. `details.limit = 'pets'`); unknown messages map to `internal_error`. The code list and mapping are in API Contract §7.1.

### 5.8 Traceability (PRD entity → table)

| PRD entity | Table |
|---|---|
| User | profiles |
| Subscription | subscriptions |
| Household | households |
| Household Membership | household_memberships |
| Pet | pets |
| Organisation | organisations |
| Organisation Membership | organisation_memberships |
| Weight Entry | weight_entries |
| Vaccination | vaccinations |
| Treatment | treatments |
| Dose Log | dose_logs |
| Vet Visit | vet_visits |
| Attachment | attachments |
| Feeding Entry | feeding_entries |
| Stool Entry | stool_entries |
| Moment | moments |
| Moment Photo | moment_photos |
| Public Link | moment_public_links |
| Memorial Record | memorial_records |
| Reminder | reminders |
| Reminder Delivery | reminder_deliveries |
| Intake | intakes |
| Adoption Request | adoption_requests |
| Litter | litters |
| Breeder Inquiry | breeder_inquiries |
| Record Transfer | record_transfers |
| Partner | partners |
| Partner Click | partner_clicks |

All 28 PRD entities map to exactly one table. Additional technical tables: `idempotency_keys`, `rate_limit_counters`, `r2_deletion_queue`, `payment_webhook_events`, `data_exports`, `organisation_invitations`, `partner_hours`, `subscription_payments`, `plans`, `household_invitations`, `household_pets` (many-to-many join), `reminder_occurrences`, `reminder_preferences`, `push_subscriptions`, `user_channels`, `app_settings`, `pet_status_history`, `cities`.

### 5.9 Deletion and retention jobs
- **Nightly:** permanently delete accounts whose `deletion_due_at` has passed — database rows and their R2 files (BR-31, NFR-06); transfer household ownership first (BR-27).
- **Nightly:** purge `reminder_deliveries` older than 12 months (NFR-08); expire unaccepted invitations and transfers.
- **Nightly:** purge `idempotency_keys` older than 24 hours and `rate_limit_counters` whose window has ended.
- **Pet deletion (FR-13):** cascade deletes rows; R2 keys are queued and removed by the same nightly job.

---

## 6. Integrations & Third-Party Services

| Need (PRD) | Provider | Reason / ADR |
|---|---|---|
| Database, auth, scheduled jobs (all epics) | Supabase (Free plan at launch) | ADR-01, ADR-02, ADR-03, ADR-04, ADR-06 |
| App hosting | Cloudflare Workers | ADR-03 |
| Files: attachments, photos, logos, backups, data archives (FR-08, FR-17, FR-41, FR-54) | Cloudflare R2 | ADR-07, ADR-13 |
| Email reminders and transactional email (FR-23, FR-26, FR-47, FR-49, FR-50, FR-25) | Resend | ADR-08 |
| Push reminders (FR-23) | Web Push (VAPID) — no third party | ADR-05 |
| WhatsApp reminders (FR-23, Premium) | WhatsApp Business Platform (Meta Cloud API), utility message templates | Billed per delivered message (Serbia is in the "Rest of Central & Eastern Europe" rate group); bounded by the 30/month cap (BR-14a). Chosen over a reseller to avoid a markup. |
| Viber reminders (FR-23, Premium) | Viber chatbot | Fixed €100/month per bot plus per-message fees; built but switched off until revenue covers it (BR-14b). |
| Google sign-in (FR-33) | Google OAuth via Supabase Auth | ADR-06 |
| Payments (FR-37, FR-38, FR-42) | Monri | ADR-09 |
| Partner geocoding (FR-53, FR-57) | OpenStreetMap Nominatim | ADR-11 |
| North-star measurement (Brief §8) | None external — counted from `reminder_deliveries` | Owner decision: no external analytics in v1 |
| Backups, scheduled exports | GitHub Actions | ADR-13 |

---

## 7. Non-Functional Requirements → Technical Targets

| NFR | Technical approach | Verifiable target |
|---|---|---|
| NFR-01 Reminder within 5 min, ≥ 95%/month | pg_cron job every 60 s selects pending occurrences with `notify_at ≤ now()` and dispatches them; failures are logged per channel in `reminder_deliveries` | Median delay ≤ 2 min; ≥ 95% of deliveries within 5 min of `notify_at`, measured monthly from `reminder_deliveries.delivered_at − reminder_occurrences.notify_at` |
| NFR-02 Serbian time | Store UTC (`timestamptz`); compute and display in Europe/Belgrade, including daylight-saving changes | A reminder set for 08:00 arrives at 08:00 Belgrade time on both sides of a DST change |
| NFR-03 Phones and computers from 360 px | Responsive layout; tested at 360 px and 1440 px widths | No horizontal scroll and all core flows usable at 360 px |
| NFR-04 Keyboard + screen reader, WCAG 2.1 AA | Semantic HTML, visible focus, labelled controls, colour contrast ≥ 4.5:1 | Automated accessibility check with zero critical issues on core flows, plus a manual keyboard-only pass |
| NFR-05 Serbian (Latin) + English | All strings in translation files; locale stored on the profile | 100% of UI strings present in both locales (build fails on a missing key) |
| NFR-06 Deleted data removed after 30 days | Nightly job deletes rows and R2 objects past `deletion_due_at` | No row or file of a deleted account exists 31 days after the request |
| NFR-07 Memorials kept indefinitely | No retention job touches `memorial_records` or memorial pets | — (absence of purge) |
| NFR-08 Delivery history 12 months | Nightly purge of `reminder_deliveries` older than 12 months | No delivery row older than 12 months + 1 day |
| NFR-09 Attachments ≤ 10 MB | Size and type checked in the browser before upload and enforced by a database check | Uploads > 10 MB or of other types are rejected in both places |
| NFR-10 Running costs ≤ €20/month | Free tiers (ADR-03, ADR-07, ADR-08), Viber off (BR-14b), WhatsApp capped (BR-14a) | Monthly invoices total ≤ €20 until Premium revenue funds upgrades |

---

## 8. Environments & Deployment

- **Local:** Next.js dev server with Supabase running locally; seed data for all account types.
- **Production:** Cloudflare Workers + Supabase project + R2 bucket + Resend domain.
- **No staging and no preview deployments** (ADR-10, amended v1.6). Non-`main` branches run CI only.
- **CI/CD:** on every push, type-check, lint, tests, and build run. On a push to `main` that passes, CI applies pending migrations to production (`supabase db push`) and then deploys the app to Cloudflare. Database changes are versioned migration files in `supabase/migrations/`.
- **Scheduled jobs:** pg_cron (every minute: reminder dispatch and 30-minute re-send; every 5 minutes: data export archives (ADR-13); nightly: occurrence generation — scheduled in the reminders build step — deletions, retention, idempotency/rate-limit purge, invitation/transfer expiry, subscription renewals and expiry notices). GitHub Actions nightly: database backup to the R2 backup bucket (14-day retention, ADR-13).
- **pg_cron → app calls (v1.6, CR-15):** pg_cron calls the app's internal routes (reminder dispatch, `/api/internal/exports`) through `pg_net`, reading the target URL and the shared secret from Supabase Vault secrets `dispatch_url` and `dispatch_secret`, set per environment; the route rejects requests without a matching `DISPATCH_SECRET`. Locally, pg_cron can be disabled and dispatch run manually.

### 8.1 Environment variables and secrets (v1.6, CR-03)

**Application (Cloudflare Workers; `.env.local` locally)**

| Name | Purpose |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | Public base URL for links in emails and messages |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous (public) key |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key, server only |
| `R2_ACCOUNT_ID` | Cloudflare account id for the R2 endpoint |
| `R2_ACCESS_KEY_ID` | R2 access key |
| `R2_SECRET_ACCESS_KEY` | R2 secret key |
| `R2_BUCKET` | Files bucket (attachments, photos, logos, `exports/`) |
| `R2_BACKUP_BUCKET` | Backups bucket — a separate bucket (ADR-13) |
| `RESEND_API_KEY` | Resend API key |
| `EMAIL_FROM` | Sender address |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | VAPID public key for push subscription |
| `VAPID_PRIVATE_KEY_JWK` | VAPID private key (JWK) |
| `VAPID_SUBJECT` | VAPID subject (`mailto:` or site URL) |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp Cloud API phone number id |
| `WHATSAPP_ACCESS_TOKEN` | WhatsApp Cloud API access token |
| `WHATSAPP_APP_SECRET` | Webhook signature verification |
| `WHATSAPP_VERIFY_TOKEN` | Webhook subscription verification |
| `DISPATCH_SECRET` | Shared secret for pg_cron → internal routes (matches Vault `dispatch_secret`) |
| `ACTION_TOKEN_SECRET` | Signing key for one-click action tokens (e.g. `dn_`) |
| `OPERATOR_ALERT_EMAIL` | Recipient of Operator alerts (RISK-14) |

**GitHub Actions secrets**

| Name | Purpose |
|---|---|
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | App deploy |
| `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF` | `supabase db push` on `main` |
| `SUPABASE_DB_URL` | `pg_dump` for nightly backups |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BACKUP_BUCKET` | Backup upload and 14-day cleanup |

---

## 9. Technical Non-Goals / Out of Scope (v1)

| Not doing | Reason |
|---|---|
| Microservices or a separate API server | One builder; a single app covers every PRD requirement (ADR-01). |
| A message queue | The every-minute job meets NFR-01 at the expected volume. |
| Real-time live updates | The PRD does not require instant updates; members see changes on the next page load. |
| Offline mode | Not required by the PRD. |
| Staging environment and preview deployments | Maintenance a single person cannot justify (ADR-10). |
| Edge caching of public pages | Not needed at v1 traffic; avoids purge logic (ADR-18). |
| External analytics (e.g., PostHog) | The north-star is counted from the database. |
| Apple sign-in | Requires a paid Apple Developer account (ADR-06). |
| Storing card data | Only Monri token references are kept (ADR-09). |
| Native mobile apps | Brief §10. |

---

## 10. Technical Risks

| ID | Risk | Severity | Mitigation |
|---|---|---|---|
| RISK-11 | Next.js on Cloudflare runs through the OpenNext adapter; some Next.js features may lag or not work. | Medium | Keep to well-supported features; plan B is a small rented server (~€5/month). |
| RISK-12 | Supabase Free limits (inactivity pause, bandwidth, database size) are hit after launch. | Medium | The every-minute job keeps the project active; monitor usage monthly; upgrade to Pro when revenue allows (ADR-03). |
| RISK-13 | No automatic backups on Supabase Free; up to 24 h of data loss in a disaster. | Medium | Nightly backups to R2 (ADR-13); practise one restore before launch. |
| RISK-14 | The single reminder job is a single point of failure for the north-star path. | High | Alert the Operator by email if no delivery has been recorded for 15 minutes while pending occurrences exist. |
| RISK-15 | Email free-tier limits on Resend are exceeded as users grow. | Medium | Monitor daily volume; paid tier when revenue allows. |
| RISK-16 | The chosen acquiring bank does not approve merchant-initiated (recurring) charges. | High | Ask about MIT approval before signing; otherwise fall back to manual renewal via a PRD change. |
| RISK-17 | WhatsApp per-message cost, now also charged inside the service window, rises with Premium growth. | Low | 30-message monthly cap per user (BR-14a); review the cap against revenue quarterly. |

---

## 11. Technical Assumptions

_No technical assumptions were recorded during this interview._

---

## 12. Open Questions

| ID | Origin | Question | Blocking for Design Mock? |
|---|---|---|---|
| OQ-01 | Brief | `[NEEDS CLARIFICATION]` Confirm metric targets. | No |
| OQ-03 | Brief | `[NEEDS CLARIFICATION]` Premium and breeder plan prices (stored as data in `plans`). | No |
| OQ-04 | Brief | `[NEEDS CLARIFICATION]` Partner pricing (billed outside the product). | No |

---

## 13. Glossary Additions

| Term | Definition |
|---|---|
| Reminder occurrence | One concrete due instance of a reminder (per lead time), tracked from pending to done or missed. |
| Reminder dispatch job | The every-minute scheduled job that sends due occurrences. |
| MIT (merchant-initiated transaction) | A card charge started by the merchant against a stored token, used for subscription renewals. |
| CIT (customer-initiated transaction) | The first payment, made by the customer, in which they consent to future charges. |
| Token reference | Monri's identifier for a stored card; the only payment detail kept in our database. |
| R2 key | The identifier of a file stored on Cloudflare R2. |
| Operator switch | A setting only the Operator can change, e.g. turning the Viber channel on. |
| Preview link | A temporary deployment of a non-`main` branch — not used in v1 (ADR-10, amended v1.6). |

---

## 14. Appendix

- Supabase pricing and Free-plan limits — https://makerkit.dev/blog/saas/supabase-pricing
- Vercel Hobby plan commercial-use restriction — https://community.vercel.com/t/is-hobby-plan-suitable-for-a-saas-prototype/7205
- Stripe availability in Serbia — https://www.jotform.com/sr/answers/5259575-how-to-make-stripe-work-in-serbia
- WhatsApp Business Platform pricing — https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing
- Viber chatbot fees — https://respond.io/blog/viber-bot-pricing
- Free object storage comparison (R2 vs Supabase Storage) — https://agentdeals.dev/storage-comparison-2026
- Monri recurring payments — https://docs.monri.com/docs/en/recurring-payments.md
- Monri country coverage — https://powercommerce.com/blogs/partners/monri
