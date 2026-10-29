# Moj Ljubimac

Web aplikacija za zdravstveni karton ljubimca, podsetnike i deljenje sa ukućanima. Sva dokumentacija je u `docs/product/` (01–06): product brief, PRD, tehnička ograničenja, dizajn sistem, API ugovor i plan gradnje. Evidencija statusa gradnje je `docs/product/06-build-plan.md` §3.

## Local development

1. Kopiraj `.env.example` u `.env.local` i popuni vrednosti.
2. `npx supabase start` (potreban Docker).
3. `npm run db:types`
4. `npm run dev`

## npm skripte

| Skripta | Šta radi |
|---|---|
| `npm run dev` | Next.js dev server |
| `npm run build` | produkcijski build (`next build`) |
| `npm run start` | pokreće produkcijski build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint nad celim repozitorijumom |
| `npm test` | Vitest (jedno pokretanje) |
| `npm run e2e` | Playwright (`e2e/`) |

## Deployment

CI (`.github/workflows/ci.yml`) radi na svakom push-u: `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, lokalni Supabase + `npx supabase test db`, `npm run build`. Samo zelen push na `main` pokreće job `deploy-production`: prvo `supabase db push` na produkcijski Supabase projekat, pa `npm run deploy` (OpenNext adapter → Cloudflare Workers). Ako migracija ne prođe, deploy se ne izvršava. Ostale grane pokreću samo proveru; preview deployment ne postoji (TC ADR-10).

Lokalno, `npm run preview` gradi aplikaciju adapterom i služi je u Workers runtime-u; `npm run cf-typegen` ponovo generiše `cloudflare-env.d.ts` posle izmene `wrangler.jsonc`.

**GitHub Actions secrets** (samo imena, vrednosti postavlja vlasnik):

| Ime | Namena |
|---|---|
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | deploy aplikacije |
| `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF` | `supabase db push` na `main` |

**GitHub Actions variables** (produkcijske build-time vrednosti za `deploy-production`; job `check` koristi vrednosti lokalnog Supabase-a):

`NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`

**Worker runtime secrets** su server-side imena iz `.env.example` (sva imena bez prefiksa `NEXT_PUBLIC_`). Vlasnik ih postavlja sa `npx wrangler secret put <IME>`; ne upisuju se u `wrangler.jsonc`.

## Production auth setup

Prijava ide preko Supabase Auth (TC ADR-06); sesija je u httpOnly kolačićima, a sve Auth operacije rade na serveru (`lib/actions/auth.ts`, `app/(auth)/auth/callback/route.ts`). Lokalno, `supabase/config.toml` traži potvrdu mejla, a mejlovi idu u lokalni mail catcher (Mailpit, `http://127.0.0.1:54324`). Za produkciju vlasnik u Supabase dashboard-u (Authentication) podešava (samo imena, bez vrednosti):

1. **Emails → SMTP Settings:** custom SMTP preko Resend-a (TC ADR-08) — host, port, korisnik i lozinka (Resend API ključ) i pošiljalac `EMAIL_FROM`.
2. **Sign In / Providers → Email:** uključena potvrda mejla (BR-29), minimalna dužina lozinke 8.
3. **Sign In / Providers → Google:** uključen, sa Client ID i Client Secret vlasnikovog Google OAuth klijenta. U Google Cloud konzoli je authorized redirect URI Supabase-ov callback (`https://<SUPABASE_PROJECT_REF>.supabase.co/auth/v1/callback`). TC §8.1 nema promenljivu aplikacije za Google — podešava se samo ovde.
4. **URL Configuration:** Site URL = `NEXT_PUBLIC_SITE_URL`; Redirect URLs sadrži `<NEXT_PUBLIC_SITE_URL>/auth/callback`.

## Scheduled jobs

pg_cron u Supabase-u (TC §8, ADR-04) svakog minuta poziva `POST /api/internal/dispatch` (EP-33: slanje podsetnika mejlom i push-om, ponovno slanje posle 30 minuta, propušteni, watchdog) preko `pg_net`. Job `reminder-dispatch` poziva `private.call_internal_route('/api/internal/dispatch')`, koja iz Supabase Vault-a čita dve tajne (samo imena; vrednosti vlasnik postavlja po okruženju, nikad u migraciji):

- `dispatch_url` — osnovni URL aplikacije (npr. `NEXT_PUBLIC_SITE_URL`); svaki job dodaje svoju putanju.
- `dispatch_secret` — ista vrednost kao `DISPATCH_SECRET` aplikacije; šalje se u zaglavlju `X-Dispatch-Secret`.

Dok bilo koja od tih tajni nedostaje, poziv ne radi ništa — lokalno pg_cron zato nikad ne zove napolje. Noćno generisanje podsetnika (`nightly-reminder-occurrences`) radi u bazi i ne koristi te tajne.

Lokalno:

- VAPID ključevi za push: `npx @pushforge/builder vapid` (javni ključ u `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, privatni JWK u `VAPID_PRIVATE_KEY_JWK`, plus `VAPID_SUBJECT`). Bez njih se push preskače; bez `RESEND_API_KEY` mejl se samo ispiše u konzolu.
- Ako želiš da lokalni pg_cron zove `next dev`, u Vault upiši `dispatch_url` = `http://host.docker.internal:3000` i `dispatch_secret` = tvoj `DISPATCH_SECRET` (`select vault.create_secret('<vrednost>', '<ime>');`). Job se gasi sa `select cron.unschedule('reminder-dispatch');`.
- Ručno pokretanje (kad je lokalni pg_cron isključen ili bez tajni): `curl -X POST http://localhost:3000/api/internal/dispatch -H "X-Dispatch-Secret: <DISPATCH_SECRET>"`

Šapa pomoći — istek oglasa (EP-87, Step 28b): job `listings-daily` (`0 7,8 * * *`, UTC) poziva `private.call_internal_route('/api/internal/listings-daily')` sa istim Vault tajnama `dispatch_url` / `dispatch_secret`. Ruta radi samo kad je u Beogradu 9 sati (09:00 Europe/Belgrade leti i zimi); drugi poziv tog dana vraća nule. Šalje `listing_expiring` 3 dana pre isteka (jednom po periodu) i prebacuje istekle oglase u `expired` uz mejl `listing_expired`.

- Ručno pokretanje lokalno (radi samo u 09:xx po beogradskom vremenu; u ostalo vreme odgovor su nule): `curl -X POST http://localhost:3000/api/internal/listings-daily -H "X-Dispatch-Secret: <DISPATCH_SECRET>"`. Job se gasi sa `select cron.unschedule('listings-daily');`.

## Backups

**Noćni backup baze** (TC ADR-13, §8; RISK-13): workflow `.github/workflows/nightly-backup.yml` radi svake noći u 01:17 UTC i ručno (Actions → Nightly backup → Run workflow, `workflow_dispatch`). Na `ubuntu-24.04` instalira `postgresql-client-17` iz PGDG repozitorijuma (major verzija iz `supabase/config.toml`, nikad starija od baze) i pokreće `scripts/backup.sh`: `pg_dump --format=custom` nad `SUPABASE_DB_URL`, upload AWS CLI-jem na R2 (`https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com`, region `auto`) u bucket `R2_BACKUP_BUCKET` kao `db/moj-ljubimac-<UTC yyyymmddThhmmssZ>.dump`, pa brisanje objekata starijih od 14 dana. Workflow ne koristi tajne aplikacije i ništa ne deploy-uje.

**GitHub Actions secrets** za backup (samo imena, vrednosti postavlja vlasnik):

| Ime | Namena |
|---|---|
| `SUPABASE_DB_URL` | `pg_dump`; mora biti connection string **Session pooler-a** iz Supabase dashboard-a (GitHub runneri nemaju IPv6, a direktna konekcija je samo IPv6) |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BACKUP_BUCKET` | upload i brisanje posle 14 dana; `R2_BACKUP_BUCKET` je zaseban bucket, ne `R2_BUCKET` |

**Restore:** backup se vraća ručno, `pg_restore` (iste ili novije major verzije) iz preuzetog `.dump` fajla u prazan Supabase projekat. Pre lansiranja vlasnik mora bar jednom da uvežba ceo restore (RISK-13) i zapiše korake.

**Arhive ličnih podataka** (EP-50, FR-41): job `data-exports` (`*/5 * * * *`) poziva `private.call_internal_route('/api/internal/exports')` sa istim Vault tajnama `dispatch_url` / `dispatch_secret`. Ruta po pozivu pravi jednu arhivu (`fflate`) za najstariji red `data_exports` u stanju `preparing`, upload-uje je u `R2_BUCKET` kao `exports/<user_id>/<data_export_id>.zip`, red prebacuje u `ready` (link važi 7 dana) i šalje mejl `data_export_ready`; greška ili arhiva veća od 90 MB → `failed`. Bez R2 kredencijala ne radi ništa i redovi ostaju `preparing`. Ručno lokalno: `curl -X POST http://localhost:3000/api/internal/exports -H "X-Dispatch-Secret: <DISPATCH_SECRET>"`.
