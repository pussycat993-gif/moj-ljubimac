# Technical Constraints — Moj Ljubimac (Web)

## Document Control

| Field | Value |
|---|---|
| Product | Moj Ljubimac ("My Pet") — web application |
| Document | 03 — Technical Constraints |
| Version | 1.9 |
| Date | 2026-11-09 |
| Author | Keti Vrtunić (interview facilitated by "Iva", Staff Engineer persona) |
| Traces to | `01-product-brief.md` v1.8 · `02-prd.md` v1.8 · `04-design-system.md` v1.8 · `05-api-integration-contract.md` v1.5 (Brief and PRD 2026-10-29; Design and API 2026-11-09) |
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
| 1.7 | 2026-10-19 | CAP-08 "Šapa pomoći" (Brief v1.7, PRD v1.7): new §5.10 with `listings`, `listing_photos`, `conversations`, `messages`, `user_blocks`, `reports`; new columns `profiles.display_name`, `profiles.marketplace_suspended_at`, `organisations.donation_bank_account`, `donation_url`, `dropoff_address`, `dropoff_hours`; `reminder_preferences.type` gains `message`; §5.8 now 34 entities; daily listing expiry job (§8); NFR-11 target (§7); non-goals for real-time chat and in-app donation/sale payments (§9); RISK-31, RISK-32. |
| 1.8 | 2026-10-29 | Owner decisions OQ-11 and OQ-03: ADR-09 rewritten for **Paddle Billing** as merchant of record (EUR, Paddle.js overlay checkout, signed webhooks, provider-owned renewals, dunning, card updates and cancellation; RISK-16 updated). Neutral provider columns: `subscriptions.provider_customer_id`, `provider_subscription_id`, `provider_event_at`, `renewal_paused_for_deletion`; `subscription_payments.provider_transaction_id` (unique together with `result`); `monri_token_ref` and `monri_cit_id` dropped. `plans` gains `provider_price_id` and `provider_trial_price_id` (Premium only); plan money is EUR (`plans.currency`, `subscription_payments.currency` default `EUR`). §8.1 adds `PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET`, `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`, `NEXT_PUBLIC_PADDLE_ENV`; ADR-17 adds `@paddle/paddle-js`; §6, §8, §9 and §13 updated; OQ-03 and OQ-11 resolved. |
| 1.9 | 2026-11-09 | Step D2 (docs sync): owner decisions and deviations from the Build Plan Session logs (Steps 01–31, 28a–28c, 30a, F1) written into this document so it matches the built app. **Contradictions fixed:** there is no `preference_type` enum — `reminder_preferences.type` uses `reminder_type`, which gained `message` (migration `20261028222712`), with check `reminders_type_not_message_check` on `reminders` (§5.5); nightly occurrence generation runs inside the database, not through `pg_net` (§4, §8); `listings_need_shelter_only` fires on insert and on author updates only, `messages_body_check` trims whitespace and newlines, and the reports rule is the `reports_before_insert` trigger (§5.10); the BR-27 heir must own no household and have an owner account (§5.1, §5.9); the organisation grace is the last member's own 30-day grace (BR-46, §5.9); team size counts live pending invitations (§5.2); RISK-14 alerts are logged, not emailed, until CR-24 copy exists (§10). **Added:** §5 conventions (schema `private`, column grants, guard-trigger scope, revoking `anon` EXECUTE); column grants (`moments.id` insert, `organisations` select without the donation columns, `profiles.display_name` update); index `reminder_occurrences(reminder_id)` (§5.5); new §5.11 catalogue of database functions, views and triggers added during the build (incl. pre-approved exception 6 functions); R2 key layouts and presign lifetime (ADR-07); action-token formats `dn_` / `hh_` / `og_` / `tr_` / `wv_`, `up_`, `md_` (§8.1); cookies `ml_locale` and the httpOnly session (new §8.2); pg_cron job names, schedules and Belgrade-hour gating (§8); backup workflow details (ADR-13); Vitest `maxWorkers: 4` and Playwright `workers: 2` (ADR-15); Windows symlink note for the OpenNext build; manual deploy from the owner's computer while GitHub Actions is locked by a billing issue (§8); cities seed applied to production by the owner (CR-26); open technical items in §12. |

---

## 1. Executive Summary

This document defines how Moj Ljubimac is built: thirteen architecture decisions, the physical data model for every PRD entity, the third-party services, and the technical path to every PRD non-functional requirement. The architecture is a single Next.js application hosted on Cloudflare, backed by one Supabase project (Postgres, Auth, scheduled jobs) with files on Cloudflare R2, a once-per-minute database job dispatching reminders by email (Resend), web push, WhatsApp, and (when switched on) Viber, and subscriptions sold through Paddle Billing as merchant of record (v1.8). Every choice is sized for one builder and a running budget of about €20/month. It traces to Brief v1.5 and PRD v1.3; v1.7 adds the Šapa pomoći community board (§5.10) from Brief v1.7 and PRD v1.7.

---

## 2. Inherited Context (from Brief v1.5 & PRD v1.3; CAP-08 from Brief v1.7 & PRD v1.7)

- **Constraints:** web only; one person builds and operates; no deadline; running costs ≈ €20/month; Serbian (Latin) and English; public launch waits for a registered business and a domestic card-processing contract (superseded in v1.8: Paddle Billing as merchant of record; launch waits for the owner's sole-proprietor registration and Paddle account approval — Brief v1.8).
- **North-star:** active reminded pets (≥ 1 delivered reminder in the trailing 30 days) — the reminder pipeline is the most reliability-critical path.
- **Epics:** EPIC-01 Pet Health Record · EPIC-02 Care Log & Moments · EPIC-03 Reminders · EPIC-04 Household Sharing · EPIC-05 Accounts & Subscriptions · EPIC-06 Organisation Accounts · EPIC-07 Local Partners · EPIC-08 Šapa pomoći (v1.7).
- **Domain entities (PRD §4):** User, Subscription, Household, Household Membership, Pet, Organisation, Organisation Membership, Weight Entry, Vaccination, Treatment, Dose Log, Vet Visit, Attachment, Feeding Entry, Stool Entry, Moment, Moment Photo, Public Link, Memorial Record, Reminder, Reminder Delivery, Intake, Adoption Request, Litter, Breeder Inquiry, Record Transfer, Partner, Partner Click; v1.7: Listing, Listing Photo, Conversation, Message, User Block, Report.
- **NFRs:** NFR-01 … NFR-11 (PRD §10; NFR-11 no real-time messaging, v1.7).
- **Šapa pomoći rules (PRD v1.7):** listing types and permissions (BR-54), Free limit of 3 active listings and ≤ 5 photos (BR-55), 30-day expiry with a reminder 3 days before and extension (BR-56), price or "po dogovoru" (BR-57), no money through the product (BR-58), blocking (BR-59), suspension (BR-60), one conversation per listing and interested user (BR-61).

**Change requests raised in this interview and applied upstream**
- Apple sign-in deferred beyond v1 (requires a paid Apple Developer account) → PRD v1.2.
- WhatsApp/Viber capped at 30 messages per Premium user per month → PRD v1.2–1.3.
- Viber built but switched off until Premium revenue covers its fixed fee → Brief v1.5, PRD v1.3.
- Payments through a domestic processor; launch waits for business registration → Brief v1.5. Superseded by the owner on 2026-10-29: Paddle Billing as merchant of record, prices in EUR → Brief v1.8, PRD v1.8 (BR-62).

**Carried-forward open questions**

| ID | Origin | Status here |
|---|---|---|
| OQ-01 | Brief | Still open — metric targets (non-technical) |
| OQ-03 | Brief | ✅ Resolved (owner, 2026-10-29) — EUR prices seeded as data in `plans` (PRD BR-62) |
| OQ-04 | Brief | Still open — partner pricing (non-technical; billed outside the product) |

---

## 3. Architecture Decision Records

### ADR-01 — Single Next.js application over Supabase
- **Context:** one builder, no team; the product has a UI, server-side logic (payments, messaging, admin), and public pages.
- **Decision:** one Next.js (App Router, TypeScript) application containing both the user interface and server-side logic, using Supabase for database, authentication, and scheduled jobs.
- **Alternatives considered:** separate backend API (e.g., Laravel or Node) plus a separate frontend — rejected: two codebases and two deployments to maintain for a single person, with no PRD requirement that needs the split.
- **Consequences:** all server logic lives in the Next.js server runtime and in database functions; the owner already knows Next.js and Supabase from earlier work.
- **Version pin (v1.6, CR-02):** Next.js 16.x. Request interception (session refresh, route protection) lives in the file name that both Next.js 16 and the OpenNext Cloudflare adapter support — Next.js 16 renamed `middleware.ts` to `proxy.ts`. The build step that introduces it must verify which name the adapter supports and stop (raise a change request) if neither works.
- **As built (v1.9, Steps 01, 03, 11):** Next.js 16.4.2 and React 19.3 with `@opennextjs/cloudflare` 1.20.x. Step 11 verified `proxy.ts` (it calls `lib/supabase/middleware.ts`) on the adapter; the adapter marks its Node.js middleware support experimental, so the fallback is an edge `middleware.ts`, and `proxy.ts` is re-tested after every adapter upgrade. `proxy.ts` refreshes the session and sends unauthenticated requests for the signed-in prefixes (`/ljubimci`, `/uspomene`, `/podsetnici`, `/podesavanja`, `/domacinstvo`, `/premium`, `/profil`, `/partneri`, `/organizacija`, `/admin`) to `/prijava`; Šapa pomoći pages that need a session (`/sapa-pomoci/…`, `/poruke…`) redirect to `/prijava?next=<path>` (Step F1). Cache Components are **off** (`cacheComponents: false` in `next.config.ts`; `partialPrefetching` removed), because rendering hung on Workers (opennextjs-cloudflare issue #1450); re-enable only after the adapter is fixed and re-tested with `npm run preview` (open).

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
- **As built (v1.9, Steps 08, 19):** pg_cron job `reminder-dispatch` (`* * * * *`) runs `select private.call_internal_route('/api/internal/dispatch')` (§8). The route checks `X-Dispatch-Secret` against `DISPATCH_SECRET` in constant time (mismatch → `401`), then in one run: claims due notices in batches of up to 200 (`claim_due_occurrences`, `FOR UPDATE … SKIP LOCKED`, status → `sent`) within a 45-second budget, sends them, re-sends final notices unanswered for 30 minutes (`claim_resend_occurrences` → `resent`), marks `resent` notices older than 30 minutes `missed` (`mark_missed_occurrences`) and runs the watchdog check (`dispatch_watchdog_due`). A notice is skipped when its instance is already done, the reminder is inactive, the pet is a memorial, or the owner's deletion is pending. Recipients are the owner plus opted-in household members not pending deletion; members get only `email` / `push`. With no preference row the channels default to `{email,push}`. Email goes to Resend with `fetch` (no SDK), 3 tries inside the run (0 s / 1 s / 3 s); push retries once, refuses payloads over 4 KB and deletes endpoints that answer 404/410. Occurrences themselves are generated by the nightly job `nightly-reminder-occurrences`, which runs inside the database (§8), on the Europe/Belgrade wall clock, stored as UTC.

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
- **Session cookies (v1.9, owner decision 2026-10-19, Steps 02, 11):** the server Supabase client sets the session cookies `httpOnly` (`cookieOptions: { httpOnly: true }`), so the browser Supabase client is anonymous and every auth call runs on the server (sign-in, Google OAuth start, password reset, resend, `updateUser`, sign-out) — see §8.2. OAuth and email links return to the route handler `/auth/callback`; a recovery session is recognised by `amr = recovery`, the new password is set only in such a session, and that session ends with a local sign-out. The reset view is `/prijava?view=reset`. Locally `supabase/config.toml` requires email confirmation, a minimum password length of 8, and sends mail to Mailpit; Google is off locally. Production auth setup (Resend SMTP, Google OAuth client, Site URL, redirect URL `<NEXT_PUBLIC_SITE_URL>/auth/callback`) is done by the owner in the Supabase dashboard (README). Local development uses `http://localhost:3000`, not `127.0.0.1`, so the cookies match.

### ADR-07 — Files on Cloudflare R2
- **Context:** attachments up to 10 MB, unlimited for Premium (FR-08); moment photos (FR-17). Supabase Free storage is 1 GB with 2 GB/month bandwidth.
- **Decision:** store all files on Cloudflare R2 (10 GB free, no egress fees); the database stores only file keys and metadata. Files are private and served through short-lived signed links; public moment photos are served only through the public-link page.
- **Alternatives considered:** Supabase Storage, moving to Pro when full — rejected: the 1 GB limit would be reached quickly and push the whole project to Pro early.
- **Consequences:** two storage systems (database on Supabase, files on R2); deletion must remove both (handled by the deletion jobs in §5).
- **As built (v1.9, Steps 13, 15, 21, 24, 25, 28, 28b, 30a):** `lib/integrations/r2.ts` (`aws4fetch`) signs presigned PUT links (Content-Type and Content-Length signed) and inline GET links, both valid **10 minutes**; the server signs keys on each request and never returns raw keys to the browser (a failed presign gives `url = null`). Uploads use a stateless `up_` upload token (§8.1). Key layout:
  - pet photo `u/<owner_id>/pets/<pet_id>/photo/<uuid>-<name>`; visit attachment `u/<owner_id>/pets/<pet_id>/visits/<vet_visit_id>/<uuid>-<safe_file_name>`; for organisation animals the prefix is `o/<organisation_id>` instead of `u/<owner_id>`;
  - moment photo `u/<owner_id>/pets/<pet_id>/moments/<moment_id>/<position>-<uuid>-<safe_file_name>` (JPEG/PNG/WebP/HEIC, ≤ 10 MB);
  - listing photo `u/<author_id>/listings/<listing_id>/<uuid>-<safe>`; organisation logo `o/<org_id>/logo-<uuid>.<ext>`; partner logo `p/<partner_id>/logo-<uuid>.<ext>`;
  - data export archive `exports/<user_id>/<data_export_id>.zip` (download name `moj-ljubimac-podaci-<Belgrade date>.zip`); backups `db/moj-ljubimac-<UTC yyyymmddThhmmssZ>.dump` in `R2_BACKUP_BUCKET`.
  - Accepting a record transfer copies the files with S3 CopyObject (`r2.copy()`), so the R2 API token needs **read and write** on the bucket; copies are deleted again if the database step fails. The R2 client is created only when there is at least one key to copy.
  - The bucket needs a CORS rule allowing browser `PUT` (uploads) and `GET` (share-as-image) from the app origin; it is set by the owner in Cloudflare, not in code (open, owner).
  - Without `R2_*` values, R2 calls are skipped where the code allows it (the nightly R2 deletion and orphan scan leave keys queued; data exports stay `preparing`; admin logo HEAD checks are skipped).

### ADR-08 — Transactional email via Resend
- **Context:** email reminders, invitations, verification, adoption/inquiry outcomes, expiry notices.
- **Decision:** Resend for all outgoing email, including Supabase Auth emails through custom SMTP.
- **Alternatives considered:** Brevo — rejected: Resend integrates more simply with Next.js; Supabase's built-in email — rejected: not intended for production volume.
- **Consequences:** free-tier daily/monthly limits must be watched (RISK-15).

### ADR-09 — Payments via Paddle Billing (merchant of record) — rewritten in v1.8
- **Context:** Stripe does not onboard Serbian-registered businesses directly. The earlier domestic-processor plan (Monri, Brief v1.5) needed a registered business, an acquiring-bank contract and bank approval of merchant-initiated charges (old RISK-16). Auto-renewal is required (FR-37, BR-07). On 2026-10-29 the owner chose Paddle Billing (paddle.com) as merchant of record (OQ-11) and is opening a sole-proprietor business to receive payouts.
- **Decision:** Paddle Billing is the seller of record for every plan. It charges the card, adds and remits VAT, issues the invoice and pays out to the owner. Plan money is EUR, because RSD is not a Paddle currency; Paddle adds VAT on top (PRD BR-62). Each `plans` row maps to a Paddle price (`plans.provider_price_id`). Each Premium plan has a second Paddle price with a 7-day trial period (`plans.provider_trial_price_id`). Breeder plans have no trial price (BR-51).
  - **Checkout:** the **Paddle.js overlay** (`@paddle/paddle-js`, loaded in the browser on click). The server action EP-45 decides trial vs no trial (BR-07) by choosing the trial price id or the plain one. It returns `{price_id, customer_email, custom_data: {user_id, plan, idempotency_key}, environment, client_token}`, and the browser opens the overlay with them. Card data never reaches our servers.
  - **Webhooks:** Paddle POSTs to `/api/webhooks/payments` with the header `Paddle-Signature: ts=<unix>;h1=<hex>`, where `h1 = HMAC-SHA256(PADDLE_WEBHOOK_SECRET, "<ts>:<raw body>")`. A request is rejected when its signature does not match or its `ts` is more than 5 minutes old. Events are deduplicated on their `event_id` in `payment_webhook_events`. Mapped events: `subscription.created`, `subscription.activated`, `subscription.trialing`, `subscription.updated`, `subscription.past_due`, `subscription.paused`, `subscription.canceled`, `transaction.completed` and `transaction.payment_failed` (API EP-46). The subscription state in our database mirrors Paddle's.
  - **Provider-owned lifecycle:** Paddle owns renewals, dunning (payment retries and its own payment-failure emails), card updates and cancellation; we never start a charge. These operations call the Paddle API: cancelling or resuming renewal (EP-48), account deletion (EP-51, EP-52) and cancelling a duplicate purchase. The API is called with `PADDLE_API_KEY` (server only) through the `fetch`-based client in `lib/integrations/paddle.ts`. Card updates and invoices go through the Paddle customer portal (API EP-89). The nightly job (EP-49) only reconciles subscriptions with Paddle, then expires, notifies and recomputes household flags.
  - **Stored data:** only `provider_customer_id`, `provider_subscription_id`, `provider_transaction_id`, the subscription state, and the display-only card brand and last four digits from Paddle's transaction payload. No card data and no token.
  - **Local mode:** with empty `PADDLE_*` variables, EP-45 answers `503 payment_provider_unavailable` and S17 stays in *Plaćanje uskoro dostupno*. Tests never call Paddle.
  - **As built (v1.9, Steps 23, 31):** payments are on only when both `PADDLE_API_KEY` and `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` are set; the API base URL (`https://api.paddle.com` or the sandbox) follows `NEXT_PUBLIC_PADDLE_ENV` (anything but `production` → sandbox). The webhook accepts the request when any `h1` in `Paddle-Signature` matches and `ts` is within ±300 s; each event is applied by the database function `apply_payment_event` (security definer, service role only, §5.11), which also resets `last_notice_days` on renewal. A duplicate subscription purchase is cancelled at once and logged for a manual refund. EP-48 (`setAutoRenew`) cancels or resumes at Paddle first and then calls `set_auto_renew` (database state only); a row without a provider id (seed data) changes in the database only. Account deletion schedules the Paddle cancellation and sets `renewal_paused_for_deletion` through `set_renewal_paused_for_deletion`; cancelling the deletion resumes it. The nightly deletion skips, for that night, an account whose Paddle cancellation failed (`retention_delete_due_accounts(p_limit, p_skip)`). Open (owner, external account): Paddle sandbox/production setup, `provider_price_id` values per environment, the webhook destination and a test purchase.
- **Alternatives considered:** Monri (domestic processor, tokenised merchant-initiated renewals) — dropped by the owner: it needs a registered business, an acquiring-bank contract and bank approval of recurring charges, and makes us responsible for VAT and card-on-file flows. Lemon Squeezy (merchant of record) — not chosen by the owner. Stripe — does not onboard Serbian businesses directly.
- **Consequences:** plan prices are in EUR, while the rest of the product's money (vet costs, offspring and listing prices) stays in RSD. Paddle's fee and VAT handling are part of the price. Launch waits for the owner's sole-proprietor registration and Paddle account approval (RISK-16). Webhooks can arrive late, twice or out of order, so every handler is idempotent and ordered by event time, and the nightly reconciliation corrects missed events.

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
- **As built (v1.9, Steps 04, 09, 27, 28):** the seed has **145 rows** (117 municipalities and 28 cities from the RZS register, Kosovo and Metohija excluded; `name_en` equals `name_sr` except Belgrade), fetched by `scripts/fetch-cities.mjs` (1.1 s between requests, User-Agent `moj-ljubimac-cities-seed/1.0`). Locally `supabase/config.toml` loads `./seed/cities.sql` then `./seed.sql`. Production is not seeded by `supabase db push`: the owner pasted `supabase/seed/cities.sql` once into the production SQL editor on 2026-10-29 (CR-26, §8). Distance is haversine in plain SQL (`private.distance_km`, no PostGIS). The Nominatim adapter `lib/integrations/nominatim.ts` calls `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=rs&q=<address, city, Serbia>` with User-Agent `MojLjubimac/1.0 (+<NEXT_PUBLIC_SITE_URL>)`, at most one request per second, no retry (failure → `geocoding_failed`), and only when both coordinates are empty.

### ADR-12 — PDF export generated in the browser
- **Context:** Premium PDF export of the full record (FR-10).
- **Decision:** the PDF is generated in the user's browser from the record data.
- **Alternatives considered:** server-side PDF rendering — rejected: heavy work that does not fit the free Cloudflare runtime limits.
- **Consequences:** large records with many images may take longer on slow phones; attachments are listed rather than embedded if needed.
- **As built (v1.9, Step 16):** `@react-pdf/renderer` is loaded with `await import()` on click. Inter Regular/Bold are bundled in `public/fonts/` with `OFL.txt` (source: the Google Fonts GitHub repository, accepted by the owner). JPG/PNG attachments are embedded; PDF attachments are listed by name.

### ADR-13 — Nightly backups and data export via GitHub Actions
- **Context:** Supabase Free has no automatic backups; FR-41 requires a full personal data archive.
- **Decision:** a nightly GitHub Actions job exports the database to R2 and keeps the last 14 days; per-user data archives are built on request inside the app (amended in v1.6 — see Mechanics).
- **Alternatives considered:** rely on Supabase Pro backups — rejected for launch on cost (ADR-03).
- **Consequences:** up to 24 hours of data could be lost in a disaster; restores are manual.
- **Mechanics (v1.6, CR-20):** *Backups* — a nightly GitHub Actions workflow runs `scripts/backup.sh`, which runs `pg_dump` against `SUPABASE_DB_URL` and uploads the dump to the separate backup bucket (`R2_BACKUP_BUCKET`) with the AWS CLI (S3-compatible endpoint), then deletes objects older than 14 days. *Data export archives* — built inside the app, not in GitHub Actions: pg_cron calls the internal route `/api/internal/exports` every 5 minutes (same `pg_net` + Vault pattern as reminder dispatch, §8), which builds pending archives with `fflate` and uploads them to `R2_BUCKET` under `exports/`.
- **As built (v1.9, Step 30a):**
  - *Backup workflow* `.github/workflows/nightly-backup.yml`: runner `ubuntu-24.04`, schedule cron `17 1 * * *` (01:17 UTC) plus manual `workflow_dispatch`, `permissions: contents: read`, no concurrent runs, 30-minute timeout. It installs `postgresql-client-17` from the PGDG apt script (the dump client must not be older than the Postgres 17 database) and runs `scripts/backup.sh`: `pg_dump --format=custom` against `SUPABASE_DB_URL`, upload to `db/moj-ljubimac-<UTC yyyymmddThhmmssZ>.dump` in `R2_BACKUP_BUCKET` through the AWS CLI with endpoint `https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com`, region `auto` and `AWS_REQUEST_CHECKSUM_CALCULATION` / `AWS_RESPONSE_CHECKSUM_VALIDATION = when_required`; objects older than 14 days are found with `list-objects-v2` on `LastModified` and deleted. `SUPABASE_DB_URL` must be the **Session pooler** connection string, because GitHub runners have no IPv6 and the direct connection is IPv6 only (§8.1).
  - *Data export archives:* pg_cron job `data-exports` (`*/5 * * * *`) builds **one** archive per run: `data.json` (deflate level 6) plus the user's files under `files/<r2_key>` (stored as is), uploaded to `exports/<user_id>/<data_export_id>.zip`. An archive over 90 MB, or any read/upload error, sets `failed`; without `R2_*` values rows stay `preparing`. Provider ids and `push_subscriptions` are left out of the archive. The `data_export_ready` email is sent when the row becomes `ready`; the nightly job expires archives 7 days after `ready_at` and removes the files.
  - Open: the RISK-13 restore drill, the backup GitHub secrets and a first manual run (owner); streaming or multipart upload for large exports (Workers CPU limits).

### ADR-14 — UI components and styling: shadcn/ui, Tailwind CSS, lucide-react
- **Context:** the design system needs an approved component and styling foundation; the original document did not name one (raised in Design Mock).
- **Decision:** shadcn/ui components (copied into the project), styled with Tailwind CSS utilities consuming design tokens; icons from lucide-react.
- **Alternatives considered:** a packaged component library such as Mantine or MUI — rejected: harder to apply the Moj Ljubimac brand, heavier pages, and a dependency the single builder cannot shape.
- **Consequences:** components live in the codebase and are owned by the project; tokens from `04-design-system.md` are the only source of colours, sizes, and radii.
- **As built (v1.9, Steps 10, 19):** shadcn CLI 4.22.1 (`-b radix -p vega`, then `style: new-york`); `lib/utils.ts` re-exports `cn` from the `cn` package (no `clsx` / `tailwind-merge`). Fonts Nunito and Inter come from `next/font/google`, which downloads them at build time, so every build (CI or local) needs network access. Raw hex colours are allowed only in `app/globals.css`, `app/manifest.ts` (Design §4 exception) and `TOKEN_COLORS` in `lib/integrations/resend.ts`, used by emails and action pages, where a test checks every value equals its `globals.css` token.

### ADR-15 — Test strategy: Vitest, pgTAP, Playwright
- **Context:** every build step must ship tests for its acceptance criteria (Build Plan); business rules and Free limits live in the database (API Contract §3.1), so they must be tested there.
- **Decision:** Vitest + Testing Library for application logic, server actions, and components; pgTAP through the Supabase CLI (`supabase test db`) for constraints, triggers, RLS policies, and RPC functions; Playwright for a small set of end-to-end flows (registration, add pet, add vaccination and see the reminder, mark done, household invitation, shelter intake to adoption). Every step must pass type-check, lint, build, and the relevant test suites.
- **Alternatives considered:** Jest — rejected: slower and needs extra configuration for the Next.js/TypeScript setup that Vitest handles natively; testing rules only through the app — rejected: rules enforced in the database could be bypassed by a surface the app tests never call.
- **Consequences:** a local Supabase instance is required to run pgTAP and e2e tests; test volume grows with the requirement count (Build Plan risk).
- **Runner settings (v1.9, Steps 01, 17, 23, 26, 28):**
  - Vitest (`vitest.config.ts`): `environment: "jsdom"`, `include: tests/**/*.test.{ts,tsx}`, `setupFiles: ./tests/setup.ts` (jest-dom), **`test.maxWorkers: 4`** — caps the number of parallel test workers (a known timeout flake in a large Šapa pomoći screen test appears under load).
  - Playwright (`playwright.config.ts`): `testDir: "e2e"`, **`workers: 2`** (`next dev` cannot serve more browsers reliably), the web server is `npm run dev` and Playwright waits on port 3000 (not a URL, because `/` only redirects); `npm run e2e` passes `--pass-with-no-tests`. Browsers are installed once with `npx playwright install chromium`.
  - Local e2e environment: there is no `.env.local`; the Supabase variables come from `npx supabase status -o env`, with `NEXT_PUBLIC_SITE_URL=http://localhost:3000`, a local `ACTION_TOKEN_SECRET` and placeholder `R2_*` values; emails fall back to the local console (§8.1).
  - pgTAP: run `npx supabase db reset` before `npx supabase test db`. Leftover e2e rows and the seed subscription's `current_period_end = now() + 1 month` make some date- and count-sensitive tests fail days after seeding.

### ADR-16 — Repository and folder layout
- **Context:** build prompts must name exact files; no layout was fixed.
- **Decision:** a new repository `pussycat993-gif/moj-ljubimac` (new and empty; the earlier mobile code is not in it). Layout:
  - `app/` — routes matching the Design System screen inventory (`app/(app)/…` signed-in, `app/(org)/…` organisation, `app/(auth)/…`, `app/(public)/…`, `app/admin/…`, `app/api/…` route handlers)
  - `components/ui/` — shadcn primitives (project-owned); `components/app/` — composites from `04-design/components`
  - `lib/supabase/` — server, browser, and service-role clients plus generated types; `lib/actions/<resource>.ts` — server actions per resource; `lib/integrations/` — Resend, WhatsApp, R2, web push, Nominatim, payments adapter (`paddle.ts`, v1.8); `lib/i18n/` — Serbian and English strings
  - `lib/server/` — shared server-only utilities (action tokens, `ApiError` / `ActionResult` helpers, idempotency, rate limits, database error mapping); every module imports `server-only` (v1.6, CR-16)
  - `lib/legal.ts` — `TERMS_VERSION` constant (v1.6, CR-09)
  - `supabase/migrations/` — SQL migrations; `supabase/tests/` — pgTAP tests; `supabase/seed.sql` — seed data; `supabase/seed/cities.sql` — cities seed (ADR-11)
  - `scripts/` — one-off and CI scripts (e.g. cities fetch, `backup.sh`) (v1.6, CR-16)
  - `public/sw.js` — the Web Push service worker (ADR-05) (v1.6, CR-16)
  - `tests/` — Vitest; `e2e/` — Playwright
  - Route convention (v1.6, CR-16): each route is a server `page.tsx` plus a colocated `*-client.tsx` client component ported from the matching mockup screen in `04-design/`.
  - As built (v1.9): some server actions are inline `"use server"` functions in a route's `page.tsx`, passed to the client component as an `actions` prop, instead of living in `lib/actions/<resource>.ts` (Steps 18, 20) — the session is in httpOnly cookies, so every write runs on the server. `lib/i18n/` uses no package: `sr.ts` and `en.ts` share the `Dictionary` type, so a missing key fails type-check; dates and numbers are formatted with `Intl`. `lib/server/action-tokens.ts` signs the action tokens (§8.1). `lib/supabase/database.types.ts` is generated by `npm run db:types`. The root route `app/page.tsx` sends a Visitor to `/prijava` and a signed-in user to their home.
- **Alternatives considered:** a folder inside the existing mobile repository — rejected: the schema is new and the mobile app is on hold, so a shared repository adds coupling without shared code.
- **Consequences:** mobile reuse of types, if revived, happens by generating types from the same Supabase project.

### ADR-17 — Approved libraries
- **Context:** build steps install packages; without an approved list each step would choose its own, and some popular packages do not run on Cloudflare Workers (Node-only crypto, file system, native binaries) (raised as CR-01).
- **Decision:** only the packages below (and their own dependencies) may be added. Anything else needs a Technical Constraints change first. v1.8 adds `@paddle/paddle-js` (ADR-09); the Paddle server API is called with `fetch`, without a Paddle Node SDK.

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
| `@paddle/paddle-js` | Paddle.js loader for the checkout overlay, imported only in the browser on click (v1.8) | ADR-09 |
| `vitest`, `@vitejs/plugin-react`, `jsdom`, Testing Library | Unit and component tests | ADR-15 |
| `@playwright/test`, `@axe-core/playwright` | End-to-end and accessibility checks (NFR-04) | ADR-15 |

- **Alternatives considered:** `web-push` (Node crypto, does not run on Workers); `@aws-sdk/client-s3` (large bundle, Node-oriented); `jszip` (heavier than `fflate`); server-side PDF/image rendering (ADR-12) — all rejected for Workers compatibility or size; an open "any package" policy — rejected: unreviewed packages are the most likely cause of Workers runtime failures (RISK-11).
- **Consequences:** a step that needs a package not on the list stops and raises a change request; the list is the reference for dependency review.
- **Installed as built (v1.9):** the toolchain packages ADR-17 leaves implicit — `eslint` 9 (flat config) with `eslint-config-next`, `@tailwindcss/postcss` (Tailwind v4), the `@types/*` packages, `@testing-library/jest-dom` / `user-event`, and the `supabase` CLI as a dev dependency (CR-25; owner confirmation of the list is still recorded as open in the Build Plan). Packages installed by `npx shadcn add` (row "whatever shadcn installs"): `radix-ui`, `class-variance-authority`, `cn`, `sonner`, `next-themes`, `shadcn`; `next-themes` and `shadcn` are unused and may be removed if the owner wants (open). Pinned at build: `next` 16.4.2, `react` 19.3.0, `@opennextjs/cloudflare` 1.20.x, `wrangler` 4.x, `@pushforge/builder` 2.0.5. No package outside this list was added; Resend, Paddle's server API, Nominatim and the WhatsApp Cloud API are all called with `fetch`.

### ADR-18 — No edge caching of public pages in v1
- **Context:** API Contract v1.1 cached public organisation pages and public moment pages for 5 minutes at the edge, which required purging the cache whenever a listing, organisation, or link changed (raised as CR-17).
- **Decision:** public pages (API EP-24, EP-62) render on every request; no edge cache and no purge mechanism in v1. This reverses the 5-minute cache.
- **Alternatives considered:** 5-minute edge cache with purge on change — rejected: purge calls from several write paths add complexity and failure modes (stale "available" animals after adoption, revoked links still visible) for traffic v1 does not have.
- **Consequences:** changes (status, revoked link) are visible immediately; every public view costs one database read — revisit if public traffic threatens Free-plan limits (RISK-12).
- **As built (v1.9, Steps 21, 26, F1):** public routes are `force-dynamic` and answer `Cache-Control: no-store`; the public moment page also sends `X-Robots-Tag: noindex` and presigns photos for 10 minutes on each request. EP-24 reads with the service role and selects only public fields. The only long-lived cache is for build assets: `public/_headers` sets `Cache-Control: public,max-age=31536000,immutable` for `/_next/static/*` (OpenNext recommendation).

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
| Scheduled jobs | Supabase pg_cron → `pg_net` calls to internal routes (every minute: dispatch; every 5 min: data exports; nightly: billing, retention and deletions; daily: listing expiry); nightly occurrence generation runs inside the database (v1.9, §8) | ADR-04, ADR-13 |
| File storage | Cloudflare R2 (`aws4fetch` presigned URLs); separate backup bucket | ADR-07, ADR-17 |
| Email | Resend | ADR-08 |
| Push | Web Push (VAPID, `public/sw.js`, `@pushforge/builder`) | ADR-05, ADR-17 |
| Public page caching | None in v1 (render on request) | ADR-18 |
| WhatsApp / Viber | WhatsApp Business Platform (Cloud API); Viber chatbot (off until enabled) | ADR-04, §6 |
| Payments | Paddle Billing, merchant of record (EUR; Paddle.js overlay, signed webhooks, provider-owned renewals) | ADR-09 |
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
- **As built (v1.9):**
  - Helper functions that the API must not expose live in the schema `private` (not exposed through the Data API); everything callable by clients is in `public`.
  - Writes from clients are limited by **column grants**: the table-level `insert` / `update` is revoked and only the columns a client may set are granted to `authenticated` (e.g. `profiles` update `full_name`, `city_id`, `locale`, `display_name`; `moments` insert `id`, `pet_id`, `moment_date`, `text` — the `id` grant lets `confirm_moment` insert the id chosen in EP-21 step 1; `organisations` update the EP-72 columns and the four donation columns). `organisations` SELECT is a **column grant to `authenticated` without the four donation columns** (`anon` has none); the donation fields are read only through the definer functions of EP-53 / EP-78.
  - Guard triggers raise errors in the §5.7.1 format; triggers that check another user's rows are `security definer` with `set search_path = public`.
  - Every new function is `revoke all … from public`; `anon` gets EXECUTE only where a Visitor needs it (invitation / transfer lookup by token, public organisation page, listings, public profile). Functions used only by jobs and webhooks are granted to `service_role` only.
  - Each function added during the build is listed in §5.11.

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
| display_name | text | v1.7; nickname shown on the public profile and in conversations (FR-67); check `char_length` 2–40; when null the app shows `full_name` |
| marketplace_suspended_at | timestamptz | v1.7; null unless the Operator suspended the user from Šapa pomoći (FR-71, BR-60) |

**subscriptions** (Subscription)
| Column | Type | Notes |
|---|---|---|
| user_id | uuid FK → profiles | not null; index |
| plan | enum `premium_monthly` / `premium_yearly` / `breeder_monthly` / `breeder_yearly` | not null |
| status | enum `trialing` / `active` / `cancelled` / `expired` / `payment_failed` | not null |
| trial_ends_at | timestamptz | |
| current_period_end | timestamptz | not null; drives "days remaining" and expiry notices |
| auto_renew | boolean | not null default true; false after cancellation (BR-08) |
| provider_customer_id | text | v1.8; Paddle customer id (`ctm_…`); needed for the customer portal (API EP-89) |
| provider_subscription_id | text | v1.8; Paddle subscription id (`sub_…`); unique; null only for seeded test rows |
| provider_event_at | timestamptz | v1.8; `occurred_at` of the last Paddle subscription event applied — older events are ignored (out-of-order delivery) |
| renewal_paused_for_deletion | boolean | v1.8; not null default false; true while an account deletion request (FR-40) has scheduled the Paddle cancellation, so cancelling the deletion can resume renewal (E-16) |
| card_brand | text | e.g. `visa`, `mastercard` — display only, from Paddle's transaction payload |
| card_last4 | char(4) | display only, from the provider; never the full number |
| last_notice_days | smallint | last expiry notice sent (30 / 7 / 1) so a re-run never double-sends (BR-09); reset to null when a renewal moves `current_period_end` forward (v1.8) |
- Unique partial index: one row with status in (`trialing`,`active`,`cancelled`) per `user_id` and plan family.

**subscription_payments** — technical necessity: record of every charge attempt
| Column | Type | Notes |
|---|---|---|
| subscription_id | uuid FK → subscriptions | not null; index |
| amount_minor | integer | > 0 (euro cents as charged by Paddle, VAT included) |
| currency | char(3) | default `EUR` (v1.8) |
| kind | enum `initial` / `renewal` | |
| result | enum `succeeded` / `failed` | |
| provider_transaction_id | text | v1.8 (was `monri_transaction_id`); Paddle transaction id (`txn_…`); unique together with `result`, because a transaction can fail and later succeed |

**plans** — technical necessity: prices as data (OQ-03 resolved in v1.8: seeded EUR prices, PRD BR-62)
| Column | Type | Notes |
|---|---|---|
| code | same enum as `subscriptions.plan`, unique | |
| price_minor | integer | > 0; euro cents before VAT: `premium_monthly` 300, `premium_yearly` 3000, `breeder_monthly` 1100, `breeder_yearly` 11000 |
| currency | char(3) | `EUR` (v1.8; was `RSD`) |
| active | boolean | |
| provider_price_id | text | v1.8; Paddle price id (`pri_…`) without a trial; set per environment, null locally |
| provider_trial_price_id | text | v1.8; Paddle price id with a 7-day trial period, Premium plans only (check: null for `breeder_*`); set per environment, null locally |

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
| joined_at | timestamptz | not null; earliest-joined member inherits ownership (BR-27). As built (v1.9, Step 30): the heir is the earliest-joined member who owns no household of their own (`households.owner_id` is unique) and has an owner account; with no such member the household is deleted like one without members (§5.9) |
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
| donation_bank_account | text | v1.7; shelters only; shown by "Doniraj" (FR-66, FR-72) |
| donation_url | text | v1.7; payment link; check `donation_url ~ '^https://'` |
| dropoff_address | text | v1.7; drop-off address for item donations |
| dropoff_hours | text | v1.7; free text, e.g. "pon–pet 10–16h" |
- Donation columns are readable only by signed-in users (EP-78), never through the public page query (EP-24); only an organisation Admin may update them (FR-72).

**organisation_memberships** (Organisation Membership)
| Column | Type | Notes |
|---|---|---|
| organisation_id | uuid FK → organisations | on delete cascade |
| user_id | uuid FK → profiles | |
| role | enum `admin` / `volunteer` | not null (BR-34) |
- Unique (`organisation_id`, `user_id`). Max 20 per organisation enforced by trigger (BR-34). As built (v1.9, Step 24): the trigger `organisation_invitations_check_team_size` counts members **plus live pending invitations** (≥ 20 → `team_full`); `organisation_memberships_check_last_admin` refuses a role change or removal that leaves no Admin (`validation_failed:last_admin`); `organisation_guard_write` refuses writes to an organisation, its memberships or invitations while it is `pending` or `rejected` (`organisation_pending_approval`).

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
- Index (`reminder_id`) — `reminder_occurrences_reminder_id_idx` (v1.9, owner-approved 2026-10-29, migration `20261029150000`): regeneration of one reminder's future rows and the `on delete cascade` from `reminders` look rows up by `reminder_id`.
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
| type | enum `reminder_type` (v1.9: there is no separate `preference_type` enum; `reminder_type` gained the value `message` in migration `20261028222712`, owner decision 2026-10-28) | `message` holds the new-message notification switch (FR-69); it has no reminders or occurrences — the check `reminders_type_not_message_check` keeps `message` out of `reminders` |
| lead_minutes | integer[] | e.g. {10080, 0}; ignored for `treatment_dose`, `meal`, and `message` |
| delivery_time | time | time of day for lead-time notices |
| channels | enum[] | subset of email/push/whatsapp/viber |
- Unique (`user_id`, `type`).
- For `type = 'message'`: check `channels <@ '{email,push}'` (`reminder_preferences_message_channels_check`); `delivery_time` null; default row `{email, push}` created with the profile (FR-69); an empty array switches notifications off. With no row at all the dispatch job defaults to `{email,push}`. `lead_minutes` values are not checked for duplicates in the database; the S12 action refuses them (open: a `distinct` check needs a TC change and a data check first).

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

**payment_webhook_events** — technical necessity: `provider text`, `event_id text`, `received_at timestamptz`; unique (`provider`, `event_id`) for webhook idempotency; `provider = 'paddle'` (v1.8, ADR-09).

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
| Listing | listings |
| Listing Photo | listing_photos |
| Conversation | conversations |
| Message | messages |
| User Block | user_blocks |
| Report | reports |

All 34 PRD entities map to exactly one table. Additional technical tables: `idempotency_keys`, `rate_limit_counters`, `r2_deletion_queue`, `payment_webhook_events`, `data_exports`, `organisation_invitations`, `partner_hours`, `subscription_payments`, `plans`, `household_invitations`, `household_pets` (many-to-many join), `reminder_occurrences`, `reminder_preferences`, `push_subscriptions`, `user_channels`, `app_settings`, `pet_status_history`, `cities`.

### 5.9 Deletion and retention jobs
- **Nightly:** permanently delete accounts whose `deletion_due_at` has passed — database rows and their R2 files (BR-31, NFR-06); transfer household ownership first (BR-27).
- **Nightly:** purge `reminder_deliveries` older than 12 months (NFR-08); expire unaccepted invitations and transfers.
- **Nightly:** purge `idempotency_keys` older than 24 hours and `rate_limit_counters` whose window has ended.
- **Pet deletion (FR-13):** cascade deletes rows; R2 keys are queued and removed by the same nightly job.
- **Daily (v1.7):** listing expiry job (EP-87) — sends the 3-day expiry notice and sets `listings.status = 'expired'` where `expires_at` has passed (FR-65, BR-56). Listing deletion (FR-64) and account deletion cascade to listings, photos, conversations, and messages; photo R2 keys are queued.
- **As built (v1.9, Step 30):**
  - Account deletion runs in `retention_delete_due_accounts(p_limit, p_skip)` (at most 100 per run): first the BR-27 hand-over — the heir is the earliest-joined member who owns no household and has an owner account; without one the household and its shared-pet links are deleted — then the account's rows and queued R2 keys; `auth.users` is deleted through the Admin API. The heir notification is not sent until CR-24 copy exists.
  - **BR-46 organisation grace:** an organisation whose last member's account is deleted has no separate grace — the grace is that member's own 30-day account grace; the organisation is deleted in the same run (cascade to its animals; R2 keys queued). "Earliest-joined member" is decided by `organisation_memberships.created_at`.
  - **R2 cleanup:** the nightly retention route deletes queued keys in batches (`r2_deletion_batch`, `r2_dequeue`) and scans the prefixes `u/`, `o/`, `p/`, `exports/` for orphans (at most 1000 objects per run, no cursor yet — open), keeping keys reported by `r2_keys_in_use(p_keys)` (pets, attachments, moment photos, organisations, partners, listing photos, data exports). Without `R2_*` values R2 is skipped and keys stay queued.
  - Expiry of pending invitations and transfers, ready exports 7 days after `ready_at`, `reminder_deliveries` older than 12 months, `idempotency_keys` older than 24 h and ended `rate_limit_counters` windows: `retention_expire_invitations`, `retention_expire_exports`, `retention_purge_deliveries`, `retention_purge_server_support`.

### 5.10 Šapa pomoći (v1.7)

Community listings, 1:1 messaging, blocking, and reports (CAP-08, FR-61 … FR-72). Shared enums: `listing_type` (`need` / `giving` / `selling` / `seeking`), `listing_category` (`food` / `equipment_toys` / `furniture` / `carriers` / `medicine_care` / `other`), `listing_species` (`dog` / `cat` / `other`), `listing_status` (`active` / `resolved` / `expired` / `hidden`), `listing_outcome` (`given` / `sold` / `donated` / `found`), `report_reason` (`spam` / `scam` / `inappropriate` / `animal_welfare` / `other`), `report_status` (`open` / `actioned` / `dismissed`).

**listings** (Listing)
| Column | Type | Notes |
|---|---|---|
| author_id | uuid FK → profiles | not null; on delete cascade |
| organisation_id | uuid FK → organisations | set only for `need` (the shelter); on delete cascade; check `(type = 'need') = (organisation_id is not null)` |
| type | enum `listing_type` | not null (BR-54) |
| title | text | not null; check `char_length` 1–80 |
| description | text | not null; check `char_length` 1–2000 |
| category | enum `listing_category` | not null; check `category <> 'medicine_care' or type = 'need'` (BR-54) |
| species | enum `listing_species` | not null |
| city_id | uuid FK → cities | not null |
| price_minor | integer | RSD para; selling only; check `> 0` |
| price_negotiable | boolean | not null default false; "po dogovoru" (BR-57) |
| status | enum `listing_status` | not null default `active` |
| resolved_outcome | enum `listing_outcome` | check `(status = 'resolved') = (resolved_outcome is not null)` |
| published_at | timestamptz | not null default now() |
| expires_at | timestamptz | not null; `published_at + 30 days` on insert; extend sets `now() + 30 days` (BR-56) |
| expiry_notice_sent_at | timestamptz | set by the expiry job when the 3-day notice is sent; cleared on extend so a re-run never double-sends |
| created_at, updated_at | timestamptz | conventions |
- Price check (BR-57): `type = 'selling'` requires exactly one of `price_minor is not null`, `price_negotiable = true`; other types require `price_minor is null and price_negotiable = false`.
- Indexes: partial (`published_at desc`) where `status = 'active'` — public list, newest first (EP-73); partial (`city_id`, `type`, `category`, `species`, `published_at desc`) where `status = 'active'` — filtered list; (`author_id`, `status`) — Free limit count and "Moje objave" (EP-76); partial (`expires_at`) where `status = 'active'` — expiry job (EP-87); (`organisation_id`) where not null.
- Restore after hide (FR-71): status returns to `active` if `expires_at > now()`, otherwise `expired`.

**listing_photos** (Listing Photo) — `listing_id` FK (cascade), `r2_key text not null`, `position smallint not null check between 1 and 5`; unique (`listing_id`, `position`), which caps a listing at 5 photos (BR-55). Uploaded through EP-13 with purpose `listing_photo`; keys go to `r2_deletion_queue` on delete.

**conversations** (Conversation)
| Column | Type | Notes |
|---|---|---|
| listing_id | uuid FK → listings | on delete set null — the conversation survives deletion of the listing and shows "listing deleted" (FR-64, BR-61) |
| starter_id | uuid FK → profiles | not null; the interested user; on delete cascade |
| owner_id | uuid FK → profiles | not null; the listing's author at creation; on delete cascade; check `starter_id <> owner_id` (`cannot_message_self`) |
| last_message_at | timestamptz | not null; updated by trigger on every message insert |
- Unique (`listing_id`, `starter_id`) (BR-61).
- Indexes: (`starter_id`, `last_message_at desc`) and (`owner_id`, `last_message_at desc`) — inbox (EP-80).

**messages** (Message)
| Column | Type | Notes |
|---|---|---|
| conversation_id | uuid FK → conversations | not null; on delete cascade |
| sender_id | uuid FK → profiles | not null; must be the conversation's `starter_id` or `owner_id`; on delete cascade |
| body | text | not null; check `char_length(btrim(body))` 1–2000 (FR-68) |
| created_at | timestamptz | not null default now() |
| read_at | timestamptz | null until the recipient opens the conversation (EP-83) |
- No `updated_at`: messages cannot be edited.
- Indexes: (`conversation_id`, `created_at`) — thread, newest last (EP-81); partial (`conversation_id`) where `read_at is null` — unread counts (EP-80).

**user_blocks** (User Block) — `blocker_id` FK → profiles (cascade), `blocked_id` FK → profiles (cascade), `created_at`; unique (`blocker_id`, `blocked_id`); check `blocker_id <> blocked_id`. Index (`blocked_id`) for the message trigger. No `updated_at`.

**reports** (Report)
| Column | Type | Notes |
|---|---|---|
| reporter_id | uuid FK → profiles | on delete set null; not null at creation (trigger) |
| listing_id | uuid FK → listings | nullable; on delete set null |
| reported_user_id | uuid FK → profiles | nullable; on delete set null; set to the author when a listing is reported |
| reason | enum `report_reason` | not null |
| note | text | check `char_length ≤ 500`; required when `reason = 'other'` |
| status | enum `report_status` | not null default `open` |
| handled_by | uuid FK → profiles | Operator; on delete set null |
| handled_at | timestamptz | set with `actioned` / `dismissed` |
- Check: `listing_id is not null or reported_user_id is not null` at creation. As built (v1.9, Step 28a): enforced by the trigger `reports_before_insert` (`validation_failed`), not a check constraint, because deletions later set both columns to null; the trigger also sets `reporter_id` to the caller and the listing's author as `reported_user_id`. `reporter_id` is nullable (on delete set null).
- Unique partial indexes: (`reporter_id`, `listing_id`) where `status = 'open' and listing_id is not null`; (`reporter_id`, `reported_user_id`) where `status = 'open' and listing_id is null` — one open report per target (FR-70).
- Index (`status`, `created_at`) — moderation queue, oldest first (EP-86).

**Triggers** (errors use the §5.7.1 format; codes in API Contract §7.1)
- `listings_active_limit` — before insert, and before update that sets `status = 'active'` (extend from `expired`, restore): when `type <> 'need'`, the author has no active Premium and `account_type <> 'shelter'`, and the author already has 3 rows with `status = 'active'`, raise `premium_required:listings` (BR-55).
- `listings_need_shelter_only` — before insert/update: `type = 'need'` requires `organisation_id` to be an `approved` organisation of type `shelter` in which the author has a membership; otherwise raise `listing_type_not_allowed` (BR-54). As built (v1.9): it runs on insert and on updates **by the author** only, so the expiry job and moderation (service role / Operator) are not blocked when the author has since left the shelter.
- `listings_status_guard` (v1.9, Step 28a, owner-approved addition) — before update: when the caller is the author and not an Operator, and the old status is `hidden` / `resolved` or the new status is `hidden`, raise `listing_not_active`; the service role passes.
- `messages_body_check` (v1.9) trims spaces, tabs and line breaks (`btrim(body, E' \t\r\n')`), so a message of only line breaks counts as empty (FR-68).
- `marketplace_author_ok(p_author)` (v1.9) — stable definer helper used in the `listings` and `listing_photos` select policies (author not suspended).
- `medicine_care` only for needs — enforced by the check on `listings.category` above; violations map to `listing_type_not_allowed`.
- `listing_photos_max` — before insert: more than 5 photos per listing raises `validation_failed` (backs the position check, BR-55).
- `conversations_listing_active` — before insert: the listing must have `status = 'active'` (`listing_not_active`), `owner_id` is set from the listing's author, and `starter_id <> owner_id` (`cannot_message_self`) (BR-61).
- `messages_not_blocked` — before insert: if the other party has a `user_blocks` row blocking the sender, raise `user_blocked` (BR-59).
- `marketplace_not_suspended` — before insert on `listings` and `messages`, and before update on `listings` by the author: if the author/sender has `marketplace_suspended_at` set, raise `marketplace_suspended` (BR-60).
- `messages_touch_conversation` — after insert on `messages`: set `conversations.last_message_at = new.created_at`.
- `listing_photos` and `listings` delete → enqueue `r2_key` values in `r2_deletion_queue` (ADR-07).

**Row Level Security**
- `listings`, `listing_photos`: anonymous and signed-in `select` where `status = 'active'` and the author's `marketplace_suspended_at is null` (FR-61, FR-62, BR-60); the author selects all of their own rows; the Operator selects all. The "hide blocked authors" filter (BR-59) is applied in the list query (EP-73) for signed-in users. Insert/update/delete only by the author; `status = 'hidden'` and restore only by the Operator.
- Public profile (FR-67): exposed only through a `security definer` function returning `id`, `display_name` (or `full_name`), city, `created_at`, and active listings — never `email` or any phone (EP-79); `profiles` RLS is unchanged.
- `conversations`, `messages`: `select` only for `starter_id` and `owner_id`; `messages` insert only with `sender_id = auth.uid()` and the sender a party; `read_at` updated only by the recipient. The Operator has no read access to messages in v1; reports carry the reporter's note.
- `user_blocks`: the blocker selects, inserts, and deletes their own rows; the blocked user cannot see them.
- `reports`: insert by any signed-in user with `reporter_id = auth.uid()`; the reporter selects their own; the Operator selects and updates all.
- Donation columns on `organisations`: read through EP-78 for signed-in users only; updated only by an organisation Admin (FR-72).

**Notifications** — EP-82 sends the new-message email (Resend) and push (`push_subscriptions`) as a side effect, following the recipient's `reminder_preferences` row of type `message` (FR-69). No WhatsApp or Viber. Listing expiry notices and expired, hidden, and suspension emails are always sent by email (Design §9.1 templates `listing_expiring`, `listing_expired`, `listing_hidden`, `marketplace_suspended`).

### 5.11 Database functions, views and triggers added during the build (v1.9)

The build added the functions below (migrations `20261022…` to `20261029…`). Those the API Contract did not name were added under the Build Plan's pre-approved exception 6 (one transaction, or rows the caller cannot reach under RLS) or an owner decision recorded in the step's Session log. Request, response and error details are in API Contract §20. **Mode:** I = `security invoker` (RLS applies), D = `security definer` with `set search_path = public` and explicit `auth.uid()` / membership / Operator checks. **Grants:** a = `anon`, u = `authenticated`, s = `service_role`; every function is revoked from `public`. Helpers in schema `private` are not callable by clients.

**Added under pre-approved exception 6** (as recorded in the Session logs; mode in brackets): `create_household_invitation`, `get_household_invitation`, `decide_household_invitation` (D, Step 22); `create_organisation_invitation` (D, Step 24); `decide_organisation`, `save_partner` (D, Step 28); `send_message` (I), `new_message_notification`, `admin_decide_report`, `admin_restore_user`, `admin_get_restriction` (D, service role, Step 28c); `apply_payment_event` (D, service role), `set_renewal_paused_for_deletion` (D), `get_my_subscription` (I) and the `p_skip` parameter of `retention_delete_due_accounts` (Step 31). Each is to be confirmed in API Contract §20 (done in v1.5). The other functions were named in their step's prompt or by an owner decision (e.g. `confirm_moment` with the `moments.id` insert grant — Step 21, option A; `mark_occurrence_done_for` — Step 19; the Step 23–28c definer functions).

| Area (step) | Function or view | Mode | Grants |
|---|---|---|---|
| Me (11) | `get_me()` | D (reads `app_settings.viber_enabled`) | u, s |
| Pets (13, 14) | view `pet_summaries_api`; `get_pet_record(p_pet_id)`; view `weight_entries_api`; helpers `private.pet_access`, `pet_can_log`, `pet_upcoming_reminders`, `entry_access`, `is_transferred_copy` | views I; `get_pet_record` I; helpers D | u, s |
| Doses (15) | `log_dose(p_treatment_id, p_given_at, p_occurrence_id)`; helpers `private.dose_occurrence_due_at`, `complete_dose_occurrence` | I; helpers D | u |
| Memorial (16) | `move_pet_to_memorial(p_pet_id, p_date, p_reason, p_note)`, `restore_pet_from_memorial(p_pet_id, p_reenable_reminders)`; helper `private.reenable_pet_reminders` | I; helper D | u |
| Reminders (17, 18) | `list_reminder_occurrences(p_filter, p_pet_id, p_limit, p_offset)` | I | u, s |
| | `mark_occurrence_done(p_occurrence_id)`; `get_reminder_settings()`; `register_push_subscription(p_endpoint, p_p256dh, p_auth, p_user_agent)` | D | u, s |
| | `get_channel_usage()` | I | u, s |
| Dispatch (19) | `claim_due_occurrences(p_limit)`, `claim_resend_occurrences(p_limit)`, `mark_missed_occurrences()`, `dispatch_watchdog_due()`, `mark_occurrence_done_for(p_occurrence_id, p_recipient_id)` | D | s |
| | `private.call_internal_route(p_path)` — pg_cron → `pg_net` POST to `<dispatch_url><path>` with `X-Dispatch-Secret`; does nothing while either Vault secret is null | D | none (pg_cron only) |
| Care log (20) | views `feeding_entries_api`, `stool_entries_api`, `meal_schedules_api` (helper `private.pet_meal_schedule` D) | I | u |
| | `set_meal_schedule(p_pet_id, p_meal_times, p_meal_weekdays)` | D | u |
| Moments (21) | view `moments_api`; `confirm_moment(p_moment_id, p_pet_id, p_moment_date, p_text, p_photos)` (exception 6, one transaction) | I | u |
| Household (22) | `get_household(p_household_id)`, `create_household_invitation(p_invitation_id, p_token_hash, p_email, p_household_name)`, `decide_household_invitation(p_token_hash, p_decision)` | D | u (+ s for `get_household`) |
| | `get_household_invitation(p_token_hash)` | D | a, u |
| Subscription & data (23, 31) | view `v_public_plans` (every plan enum value left-joined to active `plans` rows; price null without a priced row) | I | a, u |
| | `get_my_subscription()` | I | u, s |
| | `set_auto_renew(p_auto_renew)`, `request_data_export()`, `get_my_data_overview_base()`, `request_account_deletion()`, `cancel_account_deletion()`, `set_renewal_paused_for_deletion(p_paused)` | D (`auth.uid()` only) | u |
| | `apply_payment_event(p_event, p_record_event)` | D | s |
| Organisation (24) | `get_my_organisation()`, `list_org_animals(p_q, p_status, p_limit, p_offset)`, `create_organisation_invitation(p_invitation_id, p_token_hash, p_email, p_role)`, `decide_organisation_invitation(p_token_hash, p_decision)` | D (membership check) | u |
| | `create_intake(p_name, p_species, p_species_other, p_sex, p_breed, p_approx_age_text, p_intake_on, p_arrival_type, p_place_found, p_note)` | I (one transaction) | u |
| | `get_organisation_invitation(p_token_hash)` | D | a, u |
| | triggers `organisation_guard_write`, `organisation_invitations_check_team_size`, `organisation_memberships_check_last_admin`, `pets_check_breeder_write`, `organisations_queue_logo_key`; helpers `private.search_text` (diacritic-insensitive `translate(lower(x), …)`), `private.my_organisation_membership`, `private.breeder_plan_active` (Step 09, used by the breeder guards) | — | — |
| Requests & transfers (25) | `list_org_requests`, `decide_org_request(p_kind, p_id, p_decision)`, `submit_org_request(p_pet_id, p_name, p_phone, p_email, p_message)`, `create_record_transfer(p_id, p_pet_id, p_recipient_email, p_token_hash)`, `resend_record_transfer(p_new_id, p_transfer_id, p_token_hash)`, `get_transfer_copy_plan(p_token_hash)`, `accept_record_transfer(p_token_hash, p_new_pet_id, p_visit_id_map, p_key_map)`, `decline_record_transfer(p_token_hash)` | D | u |
| | `get_transfer_by_token(p_token_hash)` | D | a, u |
| | triggers `transferred_copy_check_write` (read-only transferred copy → `forbidden_role`), `set_created_by` and `attachments_enforce_free_limit` (both skip their rule while `app.transfer_copy = on` during a copy); helper `private.pet_is_transferred` | — | — |
| Litters & public pages (26) | `list_litters()`, `create_litter(p_mother_id, p_father_id, p_father_name, p_born_on, p_offspring_count)` | D (membership + breeder plan) | u |
| | `get_public_org_page(p_slug, p_limit, p_offset)` (public fields only) | D | a, u, s |
| Partners (09, 27) | `partners_nearby(p_lat, p_lng, p_city_id, p_type, p_limit)`, `get_partner(p_partner_id, p_lat, p_lng, p_city_id)` | I | u, s |
| | `record_partner_click(p_partner_id, p_action)`; `is_premium(user_id)` (Step 06) | D | u, s |
| Operator (28) | view `admin_pending_organisations` (`security_invoker = false`, rows only when the caller `is_operator`) | owner rights | u (select) |
| | `decide_organisation(p_organisation_id, p_decision, p_rejection_reason)`, `save_partner(p_id, p_fields, p_hours)` | D (Operator) | u, s |
| | `admin_list_partners(p_city_id, p_type, p_limit, p_offset)`, `admin_partner_click_stats(p_period, p_limit, p_offset)` | D (first line raises `forbidden_role` for a non-Operator) | u |
| Šapa pomoći (28a–28c) | `marketplace_author_ok(p_author)`, `sapa_author_card(p_author, p_org)`, `org_has_donation_info(p_org)` | D | a, u, s |
| | `list_listings(…)`, `get_listing(p_listing_id)`, `get_public_profile(p_user_id, p_limit, p_offset)` | I / D (`get_public_profile`) | a, u |
| | `list_my_listings(p_group, …)`, `save_listing(…)`, `send_message(p_listing_id, p_conversation_id, p_body)`, `block_user(p_user_id)`, `unblock_user(p_user_id)` | I | u |
| | `my_listing_moderation(p_listing)`, `get_donation_info(p_listing_id)`, `list_my_conversations`, `get_conversation`, `mark_conversation_read`, `admin_list_moderation(p_view, …)` (empty for a non-Operator) | D | u |
| | `new_message_notification(p_message_id)`, `admin_decide_report(p_operator, p_report_id, p_op)`, `admin_restore_listing(p_id)`, `admin_restore_user(p_user_id)`, `admin_get_restriction(p_kind, p_id)`, `listings_expiry_notice_candidates`, `mark_listing_notices_sent`, `expire_listings` | D | s |
| | triggers `listings_set_expires_at`, `listings_active_limit`, `listings_need_shelter_only`, `listings_status_guard`, `marketplace_not_suspended`, `listing_photos_max`, `listing_photos_queue_r2_key`, `conversations_listing_active`, `messages_sender_is_party`, `messages_not_blocked`, `messages_touch_conversation`, `reports_before_insert`, `profiles_before_write`, `reminder_preferences_before_write`, `profiles_create_reminder_preferences` | D | — |
| Nightly jobs (30) | `billing_expire_subscriptions`, `billing_expiry_notice_candidates`, `mark_expiry_notice_sent`, `billing_refresh_household_flags`, `retention_delete_due_accounts(p_limit, p_skip)`, `r2_deletion_batch`, `r2_dequeue`, `r2_keys_in_use(p_keys)`, `retention_purge_deliveries`, `retention_expire_invitations`, `retention_expire_exports`, `retention_purge_server_support` | D | s |

---

## 6. Integrations & Third-Party Services

| Need (PRD) | Provider | Reason / ADR |
|---|---|---|
| Database, auth, scheduled jobs (all epics) | Supabase (Free plan at launch) | ADR-01, ADR-02, ADR-03, ADR-04, ADR-06 |
| App hosting | Cloudflare Workers | ADR-03 |
| Files: attachments, photos, logos, backups, data archives (FR-08, FR-17, FR-41, FR-54, FR-63) | Cloudflare R2 | ADR-07, ADR-13 |
| Email reminders and transactional email (FR-23, FR-26, FR-47, FR-49, FR-50, FR-25, FR-65, FR-69, FR-71) | Resend | ADR-08 |
| Push reminders and new-message notifications (FR-23, FR-69) | Web Push (VAPID) — no third party | ADR-05 |
| WhatsApp reminders (FR-23, Premium) | WhatsApp Business Platform (Meta Cloud API), utility message templates | Billed per delivered message (Serbia is in the "Rest of Central & Eastern Europe" rate group); bounded by the 30/month cap (BR-14a). Chosen over a reseller to avoid a markup. |
| Viber reminders (FR-23, Premium) | Viber chatbot | Fixed €100/month per bot plus per-message fees; built but switched off until revenue covers it (BR-14b). |
| Google sign-in (FR-33) | Google OAuth via Supabase Auth | ADR-06 |
| Payments (FR-37, FR-38, FR-42) | Paddle Billing (merchant of record; EUR; VAT added by Paddle) | ADR-09 |
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
| NFR-11 No real-time messaging | Inbox, threads, and unread counts are read on each page load (EP-80, EP-81); no WebSockets, Supabase Realtime, or polling loops | A message sent by one user appears for the other after a page load or refresh; no live connection is opened by any page |

---

## 8. Environments & Deployment

- **Local:** Next.js dev server with Supabase running locally; seed data for all account types.
- **Production:** Cloudflare Workers + Supabase project + R2 bucket + Resend domain.
- **No staging and no preview deployments** (ADR-10, amended v1.6). Non-`main` branches run CI only.
- **CI/CD:** on every push, type-check, lint, tests, and build run. On a push to `main` that passes, CI applies pending migrations to production (`supabase db push`) and then deploys the app to Cloudflare. Database changes are versioned migration files in `supabase/migrations/`.
- **Scheduled jobs:** pg_cron (every minute: reminder dispatch and 30-minute re-send; every 5 minutes: data export archives (ADR-13); nightly: occurrence generation — scheduled in the reminders build step — deletions, retention, idempotency/rate-limit purge, invitation/transfer expiry, subscription reconciliation with Paddle, expiry and expiry notices (Paddle charges the renewals, v1.8); daily (v1.7): listing expiry job EP-87 — 3-day expiry notices and expiry of listings past `expires_at`, at 09:00 Europe/Belgrade so emails arrive in the morning). GitHub Actions nightly: database backup to the R2 backup bucket (14-day retention, ADR-13).
- **pg_cron → app calls (v1.6, CR-15):** pg_cron calls the app's internal routes (reminder dispatch, `/api/internal/exports`, and from v1.7 the listing expiry job EP-87) through `pg_net`, reading the target URL and the shared secret from Supabase Vault secrets `dispatch_url` and `dispatch_secret`, set per environment; the route rejects requests without a matching `DISPATCH_SECRET`. Locally, pg_cron can be disabled and dispatch run manually.
- **pg_cron jobs as built (v1.9).** Schedules are in UTC. Jobs that must run at a Belgrade wall-clock hour are scheduled at both possible UTC hours, and the route does the work only when the Europe/Belgrade hour matches (otherwise it answers zero counts), so daylight saving time needs no change.

  | Job | Schedule (UTC) | Runs | Effective time |
  |---|---|---|---|
  | `reminder-dispatch` | `* * * * *` | `private.call_internal_route('/api/internal/dispatch')` (EP-33) | every minute |
  | `data-exports` | `*/5 * * * *` | `…('/api/internal/exports')` (EP-50) | every 5 minutes |
  | `nightly-reminder-occurrences` | `0 1 * * *` | `private.generate_all_reminder_occurrences()` **inside the database** — no `pg_net` call and no Vault secrets | 01:00 UTC |
  | `billing-nightly` | `0 1,2 * * *` | `…('/api/internal/billing-nightly')` (EP-49) | 03:00 Europe/Belgrade |
  | `retention-nightly` | `30 1,2 * * *` | `…('/api/internal/retention-nightly')` (EP-52) | 03:30 Europe/Belgrade |
  | `listings-daily` | `0 7,8 * * *` | `…('/api/internal/listings-daily')` (EP-87) | 09:00 Europe/Belgrade |

  `private.call_internal_route(path)` (security definer, executable by nobody but the cron owner) POSTs to `<dispatch_url><path>` with the header `X-Dispatch-Secret: <dispatch_secret>` and **does nothing while either Vault secret is null**, so a local stack never calls out. Every internal route compares the header with `DISPATCH_SECRET` in constant time; a mismatch answers `401` (`unauthenticated` for the nightly routes, `invalid_signature` for the exports route). Locally a route is run by hand with `curl -X POST http://localhost:3000/api/internal/<route> -H "X-Dispatch-Secret: <DISPATCH_SECRET>"`, or the Vault `dispatch_url` is set to `http://host.docker.internal:3000` (README *Scheduled jobs*).
- **Vault secrets per environment:** `dispatch_url` (the app's base URL, e.g. `NEXT_PUBLIC_SITE_URL`) and `dispatch_secret` (same value as `DISPATCH_SECRET`), created by the owner with `select vault.create_secret('<value>', '<name>');` — never in a migration.
- **Manual deploy (v1.9, current production path).** GitHub Actions is locked by a billing issue on the owner's GitHub account, so the `deploy-production` job of `.github/workflows/ci.yml` (and the nightly backup workflow) do not run. Until it is unlocked, the owner deploys from their own computer, in this order:
  1. `npx supabase link --project-ref <SUPABASE_PROJECT_REF>` (once per machine; asks for the database password);
  2. `npx supabase db push` — applies pending migrations to production (migrations only; no seed);
  3. `npm run deploy` with the four build-time variables `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and the deploy credentials `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` set in the shell (plus `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` / `NEXT_PUBLIC_PADDLE_ENV` once payments are on);
  4. `npx wrangler secret put <NAME>` for each runtime secret of §8.1 that is not `NEXT_PUBLIC_*` (`SUPABASE_SERVICE_ROLE_KEY`, `R2_*`, `RESEND_API_KEY`, `EMAIL_FROM`, `VAPID_PRIVATE_KEY_JWK`, `VAPID_SUBJECT`, `DISPATCH_SECRET`, `ACTION_TOKEN_SECRET`, `OPERATOR_ALERT_EMAIL`, `WHATSAPP_*`, `PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET`) — once, and again when a value changes;
  5. once per project: paste `supabase/seed/cities.sql` into the production Supabase SQL editor (CR-26 — done by the owner on 2026-10-29);
  6. once per project: create the Vault secrets `dispatch_url` and `dispatch_secret` in the production SQL editor (above).
  When GitHub Actions is available again, steps 2–3 return to CI as described in the *CI/CD* bullet; the secrets and the one-off steps 5–6 stay manual.
- **Windows note (v1.9):** the OpenNext build inside `npm run deploy` and `npm run preview` (`opennextjs-cloudflare build`) creates symlinks, so on Windows it needs an **Administrator PowerShell or Windows Developer Mode** enabled; otherwise the build fails with a symlink permission error. Wrangler also prints "OpenNext is not fully compatible with Windows"; CI runs on Ubuntu.
- **Cities seed in production (v1.9, CR-26 resolved):** `supabase db push` applies migrations only and the local seed (`supabase/seed.sql`) must never run in production, so `supabase/seed/cities.sql` is pasted once by the owner into the production SQL editor (done 2026-10-29).

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
| `ACTION_TOKEN_SECRET` | Signing key for action, upload and draft tokens (`dn_`, `hh_`, `og_`, `tr_`, `wv_`, `up_`, `md_` — see *Token formats* below); required — signing fails without it |
| `OPERATOR_ALERT_EMAIL` | Recipient of Operator alerts (RISK-14) |
| `PADDLE_API_KEY` | v1.8; Paddle Billing API key, server only (portal links, cancel/resume, reconciliation); empty locally → payments off |
| `PADDLE_WEBHOOK_SECRET` | v1.8; secret key of the Paddle notification destination, server only (`Paddle-Signature` verification, ADR-09) |
| `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` | v1.8; Paddle client-side token for Paddle.js |
| `NEXT_PUBLIC_PADDLE_ENV` | v1.8; `sandbox` or `production` |

**GitHub Actions secrets**

| Name | Purpose |
|---|---|
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | App deploy |
| `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF` | `supabase db push` on `main` |
| `SUPABASE_DB_URL` | `pg_dump` for nightly backups |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BACKUP_BUCKET` | Backup upload and 14-day cleanup |

**Local and unset values (v1.9).** Server code reads environment variables at request time. With `RESEND_API_KEY` empty outside production, an email is printed to the console and gets the id `local-<uuid>`; with empty VAPID keys push is skipped with a log line; with `WHATSAPP_ACCESS_TOKEN` empty the WhatsApp adapter logs `[whatsapp:fake]` and returns `fake-<uuid>`; with empty `PADDLE_*` payments are off (ADR-09); with empty `R2_*` see ADR-07. GitHub Actions *variables* (not secrets) hold the four `NEXT_PUBLIC_*` build-time values for `deploy-production`. `SUPABASE_DB_URL` must be the Session-pooler string (ADR-13).

**Token formats (v1.9, `lib/server/action-tokens.ts`).** All tokens are signed with HMAC-SHA256 and `ACTION_TOKEN_SECRET` through Web Crypto (runs on Workers) and checked in constant time.

| Prefix | Use | Shape and lifetime |
|---|---|---|
| `dn_` | "Urađeno" link in email / push (EP-32) | `"dn_" + base64url("dn|occurrence_id|recipient_id|exp_unix|nonce") + "." + base64url(HMAC)`; 24 h; single use through the occurrence's done state — nothing stored |
| `hh_`, `og_`, `tr_` | household invitation (EP-35), team invitation (EP-56), record transfer (EP-60) | random token (`randomToken(prefix)`); only `hashToken` (SHA-256 hex) is stored in the invitation / transfer row; 7 days |
| `wv_` | WhatsApp verification (EP-30) | signed payload `user_id|phone|<code digest>|exp|nonce`, where the digest is HMAC-SHA256 with `ACTION_TOKEN_SECRET` over `user_id|phone|code` (not a plain `sha256(code)`, which could be reversed offline — Step 29 deviation); 10 minutes; not single use, stateless |
| `up_` | upload ticket (EP-13) | HMAC over purpose, target, key, mime, size, expiry (and file name for attachments); 10 minutes |
| `md_` | moment draft (EP-21) | HMAC over moment id, pet, date, text, each photo key / position / mime / size, expiry; 10 minutes |

### 8.2 Cookies (v1.9)

| Cookie | Set by | Attributes | Purpose |
|---|---|---|---|
| Supabase session (`sb-<project>-auth-token`, chunked) | `@supabase/ssr` server client (`lib/supabase/server.ts`, `proxy.ts`) | `httpOnly` (owner decision 2026-10-19; `cookieOptions: { httpOnly: true }`), other attributes are the `@supabase/ssr` defaults | the session; the browser Supabase client never reads it, so every auth call is a server action (ADR-06) |
| `ml_locale` | server actions in `lib/actions/registration.ts` (S15 SR/EN switch; S18 language change) | value `sr` or `en`, `path=/`, 1 year, `SameSite=Lax`, `httpOnly` | language of auth-free pages (FR-35, NFR-05). A signed-in user's language comes from `profiles.locale` (EP-43); no cookie → `sr`; no `Accept-Language` detection and no `?lang=` parameter (owner decision, Step 12). `<html lang>` follows the active locale |

The app sets no other cookies of its own.

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
| Storing card data | Paddle (merchant of record) keeps all card data; we keep only Paddle ids and the display-only card brand and last four digits (ADR-09). |
| Native mobile apps | Brief §10. |
| Real-time chat for Šapa pomoći (v1.7) | Messages and unread counts appear on the next page load or refresh (NFR-11); no WebSockets or Supabase Realtime, which would add connection limits and cost on the Free plans. |
| In-app payments for donations or sales (v1.7) | Money never passes through the product (BR-58, Brief §10); "Doniraj" only shows the shelter's donation info. |

---

## 10. Technical Risks

| ID | Risk | Severity | Mitigation |
|---|---|---|---|
| RISK-11 | Next.js on Cloudflare runs through the OpenNext adapter; some Next.js features may lag or not work. | Medium | Keep to well-supported features; plan B is a small rented server (~€5/month). |
| RISK-12 | Supabase Free limits (inactivity pause, bandwidth, database size) are hit after launch. | Medium | The every-minute job keeps the project active; monitor usage monthly; upgrade to Pro when revenue allows (ADR-03). |
| RISK-13 | No automatic backups on Supabase Free; up to 24 h of data loss in a disaster. | Medium | Nightly backups to R2 (ADR-13); practise one restore before launch. |
| RISK-14 | The single reminder job is a single point of failure for the north-star path. | High | Alert the Operator by email if no delivery has been recorded for 15 minutes while pending occurrences exist. As built (v1.9): `dispatch_watchdog_due()` detects the condition and the dispatch route **logs** it at most once an hour per instance; the email to `OPERATOR_ALERT_EMAIL` is not sent until its copy exists (CR-24). |
| RISK-15 | Email free-tier limits on Resend are exceeded as users grow. | Medium | Monitor daily volume; paid tier when revenue allows. |
| RISK-16 | v1.8 (the earlier risk — the acquiring bank refusing merchant-initiated charges — went away with Monri). Paddle does not approve the account or the sole-proprietor business, delays payouts, or changes its fees; webhooks arrive late, twice or out of order. | Medium | Apply to Paddle early with the sole-proprietor registration and the public legal pages (OQ-15); develop against the Paddle sandbox; idempotent, time-ordered webhook handling and nightly reconciliation (API EP-46, EP-49); all provider calls isolated in `lib/integrations/paddle.ts`, so moving to another merchant of record touches one adapter. |
| RISK-17 | WhatsApp per-message cost, now also charged inside the service window, rises with Premium growth. | Low | 30-message monthly cap per user (BR-14a); review the cap against revenue quarterly. |
| RISK-31 | New-message emails (FR-69) and listing expiry emails (FR-65) multiply Resend volume and push it past the free-tier limits sooner (compounds RISK-15). | Medium | Users can switch message notifications off per channel; rate limit on sending messages (API EP-82); monitor daily email volume and move message notifications to push-first if needed. |
| RISK-32 | Listing photos and message history grow R2 storage and the Supabase Free database size (compounds RISK-12). | Low | ≤ 5 photos per listing; Free limit of 3 active listings; photos removed with deleted listings via `r2_deletion_queue`; text-only messages ≤ 2,000 characters; monitor size monthly. |

---

## 11. Technical Assumptions

_No technical assumptions were recorded during this interview._

---

## 12. Open Questions

| ID | Origin | Question | Blocking for Design Mock? |
|---|---|---|---|
| OQ-01 | Brief | `[NEEDS CLARIFICATION]` Confirm metric targets. | No |
| OQ-03 | Brief | ✅ Resolved (v1.8, owner, 2026-10-29): EUR, VAT added by Paddle — `premium_monthly` €3.00, `premium_yearly` €30.00, `breeder_monthly` €11.00, `breeder_yearly` €110.00 (seeded in `plans`). | — |
| OQ-11 | API | ✅ Resolved (v1.8, owner, 2026-10-29): Paddle Billing as merchant of record (ADR-09). | — |
| OQ-04 | Brief | `[NEEDS CLARIFICATION]` Partner pricing (billed outside the product). | No |

**Open technical items after the build (v1.9 — recorded, not decided here; source: Build Plan Session logs and `docs/reports/F1-follow-ups.md`)**
- Owner / external accounts: GitHub Actions billing lock (deploy and backups run manually, §8); GitHub and Cloudflare secrets; production auth setup (ADR-06); R2 bucket CORS for browser `PUT` / `GET` and an R2 token with read **and** write (ADR-07); Paddle sandbox / production setup (ADR-09); Meta WhatsApp templates, `WHATSAPP_*` values and the webhook; Vault secrets per environment; the RISK-13 restore drill and a first backup run; checking that `auth.users` deletion works on the hosted project.
- Re-enable Cache Components and re-test `proxy.ts` with `npm run preview` after each OpenNext adapter upgrade (ADR-01).
- CR-24 messages (Operator alerts, heir notification, organisation-admin emails, push expiry notices) are not sent until copy exists.
- Schema changes that need a TC change first: a `distinct` check on `reminder_preferences.lead_minutes`; the `reports_open_user_key` index naming and a deferrable unique for `listing_photos` positions (§5.10); a cursor for the R2 orphan scan beyond 1000 objects; the site host in `moments_api.public_link.url` (§6).
- Streaming or multipart upload for large data exports (Workers CPU limits, ADR-13).
- Unused packages `next-themes` and `shadcn` may be removed if the owner wants (ADR-17).

---

## 13. Glossary Additions

| Term | Definition |
|---|---|
| Reminder occurrence | One concrete due instance of a reminder (per lead time), tracked from pending to done or missed. |
| Reminder dispatch job | The every-minute scheduled job that sends due occurrences. |
| Merchant of record | The company that legally sells to the customer, charges the card, handles VAT and refunds — Paddle (ADR-09, v1.8). |
| Paddle price | A Paddle catalogue entry (`pri_…`) with an amount, billing period and optional trial; one per plan, plus a trial price for each Premium plan (v1.8). |
| Customer portal | Paddle's hosted page where the customer updates the card, sees invoices and cancels (API EP-89, v1.8). |
| R2 key | The identifier of a file stored on Cloudflare R2. |
| Operator switch | A setting only the Operator can change, e.g. turning the Viber channel on. |
| Preview link | A temporary deployment of a non-`main` branch — not used in v1 (ADR-10, amended v1.6). |
| Listing expiry job | The daily scheduled job (EP-87) that sends 3-day expiry notices and expires listings past `expires_at` (v1.7). |
| Marketplace suspension | `profiles.marketplace_suspended_at` set by the Operator; blocks listing and message writes for that user only (v1.7). |

---

## 14. Appendix

- Supabase pricing and Free-plan limits — https://makerkit.dev/blog/saas/supabase-pricing
- Vercel Hobby plan commercial-use restriction — https://community.vercel.com/t/is-hobby-plan-suitable-for-a-saas-prototype/7205
- Stripe availability in Serbia — https://www.jotform.com/sr/answers/5259575-how-to-make-stripe-work-in-serbia
- WhatsApp Business Platform pricing — https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing
- Viber chatbot fees — https://respond.io/blog/viber-bot-pricing
- Free object storage comparison (R2 vs Supabase Storage) — https://agentdeals.dev/storage-comparison-2026
- Paddle Billing — webhook signature verification — https://developer.paddle.com/webhooks/signature-verification
- Paddle Billing — Paddle.js overlay checkout — https://developer.paddle.com/paddlejs/overview
- Paddle Billing — customer portal sessions — https://developer.paddle.com/api-reference/customer-portals/create-customer-portal-session
- Paddle supported currencies — https://developer.paddle.com/concepts/sell/supported-currencies
- (Superseded in v1.8) Monri recurring payments — https://docs.monri.com/docs/en/recurring-payments.md
