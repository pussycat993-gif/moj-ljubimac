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
