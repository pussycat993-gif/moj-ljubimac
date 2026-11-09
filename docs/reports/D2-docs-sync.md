# D2 — Usklađivanje dokumentacije sa izgrađenom aplikacijom

**Datum:** 2026-11-09 · **Grana:** `overnight` · **Nije korak plana** (u §3 Build Plana dodat je red u tabelu *Off-plan steps*). Samo dokumentacija — kod aplikacije, migracije i testovi nisu menjani.

**Izvori:** Session logovi Koraka 01–31, 28a–28c i 30a u `docs/product/06-build-plan.md`, beleška R1 (pod Korakom 27), `docs/reports/F1-follow-ups.md`, a činjenice su proverene u `supabase/migrations/`, `lib/actions/`, `lib/server/`, `app/` i `package.json`.

**Nastavak prekinutog rada:** prethodno pokretanje D2 je prekinuto (malo memorije). Njegove necommit-ovane izmene u četiri dokumenta su pregledane i zadržane, uz ispravke navedene ispod; ono što je falilo je dovršeno.

## 1. `03-technical-constraints.md` — v1.8 → v1.9

- **Change log** red 1.9 i zaglavlje (datum, *Traces to*).
- **ADR-01:** Next.js 16.4.2 / React 19.3 / `@opennextjs/cloudflare` 1.20.x; `proxy.ts` provereno na adapteru; Cache Components isključeni (adapter issue #1450); prefiksi zaštićenih ruta i `?next=` za Šapu pomoći (F1).
- **ADR-04:** pg_cron `reminder-dispatch` → `private.call_internal_route`, tok dispatch-a (claim, resend, missed, watchdog), retry-ji, kanali.
- **ADR-06:** httpOnly sesijski kolačić (odluka vlasnika 2026-10-19), sve auth akcije na serveru, `/auth/callback`, recovery sesija, **`/prijava?view=reset`**.
- **ADR-07:** R2 raspored ključeva, presign 10 min, `up_` token, CopyObject pri transferu (R2 token čita **i** piše), CORS na bucket-u (vlasnik), ponašanje bez `R2_*`.
- **ADR-09:** Paddle kako je izgrađeno (`apply_payment_event`, `set_auto_renew`, `set_renewal_paused_for_deletion`, `p_skip`).
- **ADR-11:** seed od 145 gradova, `scripts/fetch-cities.mjs`, Nominatim adapter; seed u produkciji ručno (CR-26).
- **ADR-12:** PDF — `@react-pdf/renderer` na klik, Inter fontovi u `public/fonts/`.
- **ADR-13:** backup workflow (`ubuntu-24.04`, `17 1 * * *`, `postgresql-client-17`, Session pooler), arhive izvoza podataka (jedna po pokretanju, > 90 MB → `failed`).
- **ADR-14 / ADR-16 / ADR-17 / ADR-18:** shadcn podešavanja, `cn` paket, fontovi na build-u, izuzeci za hex boje; inline `"use server"` akcije; `lib/i18n` bez paketa; instalirani paketi (CR-25); `force-dynamic` + `no-store` za javne stranice i `public/_headers`.
- **ADR-15:** **Vitest `test.maxWorkers: 4`**, **Playwright `workers: 2`**, lokalno e2e okruženje, pgTAP napomene.
- **§5 konvencije:** šema `private`, column grant-ovi (**`moments.id` insert grant** za `confirm_moment`, `organisations` select bez kolona za donacije, `profiles.display_name`), guard trigeri, `anon` EXECUTE samo gde treba.
- **§5.1 / §5.2 / §5.9:** naslednik po BR-27 (nema svoje domaćinstvo, owner nalog), `team_full` broji i pozive na čekanju, `last_admin`, grace organizacije po BR-46, R2 čišćenje, retention funkcije.
- **§5.5:** **nema enum-a `preference_type`** — `reminder_preferences.type` koristi `reminder_type`, koji je dobio vrednost `message` (migracija `20261028222712`), check `reminders_type_not_message_check`; **indeks `reminder_occurrences(reminder_id)`** (migracija `20261029150000`).
- **§5.10:** `listings_need_shelter_only` samo pri insert-u i izmenama autora, `listings_status_guard`, `messages_body_check` sa trim-om novih redova, `reports_before_insert` umesto check-a, `marketplace_author_ok`.
- **Nova §5.11:** katalog svih funkcija, view-ova i trigera dodatih tokom izgradnje, sa **security modom** (invoker / definer) i grant-ovima; posebno nabrojane **funkcije dodate po izuzetku 6**. Ispravka u odnosu na prekinuti rad: `record_partner_click` je *security definer* (ne invoker); dodat `is_premium`.
- **§8:** tabela pg_cron poslova (UTC, provera sata po Beogradu), `call_internal_route` ne radi ništa dok Vault tajne nisu postavljene, Vault tajne **`dispatch_url`** i **`dispatch_secret`**; **ručni deploy** sa vlasnikovog računara dok je GitHub Actions zaključan zbog problema sa naplatom: `supabase link` → `supabase db push` → `npm run deploy` sa četiri `NEXT_PUBLIC_*` promenljive i `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` → `wrangler secret put` za runtime tajne → `cities.sql` u SQL editoru → Vault tajne; **Windows napomena** (OpenNext build u `npm run deploy` / `npm run preview` pravi symlink-ove → Administrator PowerShell ili Developer Mode) — ispravljeno da se odnosi na OpenNext build, ne na `next build`.
- **§8.1:** lokalni režim bez ključeva, formati tokena `dn_` / `hh_` / `og_` / `tr_` / `wv_` / `up_` / `md_`.
- **Nova §8.2 Kolačići:** sesija (httpOnly) i **`ml_locale`**.
- **§10 RISK-14:** watchdog se loguje, mejl čeka CR-24. **§12:** otvorene tehničke stavke posle izgradnje.

## 2. `04-design-system.md` — v1.7 → v1.8

- **Change log** red 1.8 i zaglavlje.
- **Nova §6.1:** **`labels` prop** sa srpskim podrazumevanim tekstom (shells, `SignedInShell`, `ErrorState`, `PetHeader`, `ReminderRow` + `canMarkDone`, `ReminderTypeIcon`, `ListingCard` + `coverUrl`, `ReportDialog` / `BlockDialog` + `onSubmit`), `label` na `StatusBadge` / `ListingTypeTag`, **`PremiumLock.ctaHref` → `/premium`**, `ReadOnlyBanner.action`.
- **§8:** PremiumLock tekstovi i inline zaključavanje, Free brojači, **katalog read-only banera**, toast-ovi (Toaster odobren), **row meniji**, **dijalozi za brisanje**, rute i dijalozi za izmenu, validacija, povratak posle prijave (`?next=`).
- **§9:** `Intl` formati (sr-Latn / en-GB), bez druge tačke posle srpskog datuma, množina `_one/_few/_other`, rod (muški oblik za oznake, kosa crta za rečenice), „Korisnik“ kao zamensko ime.
- **§9.1:** nove varijante poruka (`bodyNoName`, `bodyNoPets`, `action_not_found_page`, `action_read_only_page`, WhatsApp odgovor, razlog odbijanja azila, „oglas obrisan“).
- **§12:** **S16** (reset prikaz, `/prijava?view=reset`, tekstovi), **S28** (tekstovi, istekli link → `/prijava?view=reset`), **S12** (WhatsApp, push, „Sačuvaj podešavanja“), S01.
- **Nova §12.1:** odobreni tekstovi i odstupanja po ekranu — S01/S02, S03 (+PDF), S06, S07, S08/S09, S10/S11, S13, S14, **S17/S18/S19 (podaci naloga)**, S20–S23, S24/S25, S26, **S32–S37 (Šapa pomoći)**.
- **§13:** OQ-10 suženo (Toaster odobren), spisak tekstova koji i dalje nedostaju.

## 3. `05-api-integration-contract.md` — v1.4 → v1.5

- **Change log** red 1.5, zaglavlje (*Traces to* sada TC v1.9 · Design v1.8).
- **§4.1 / EP-42:** auth samo na serveru, **S16 reset prikaz `/prijava?view=reset`**, S28, `next` za Šapu pomoći, preusmeravanje sa `/`.
- **§5:** *As built (v1.5)* beleške u EP-ovima (iz prekinutog rada, zadržane) — uključujući **EP-89** (već dokumentovan od v1.4, dopunjen beleškom).
- **§6:** `UploadTicket`, `FileUrl.kind = data_export`, `ReminderPreference.type` = `reminder_type`, `Plan` iz `v_public_plans`.
- **§7.1 (novo):** konvencija `DETAIL '<field>:<code>'`, poruke `validation_failed:last_admin`, `organisation_pending_approval:rejected`, `premium_required:transfer_slot`, `not_found:subscription`, SQLSTATE mapiranja (`23503`, `23505`, `42501`, `PGRST116`).
- **§9.1 / §9.3 / §9.4 (novo):** WhatsApp webhook kako je izgrađen, formati tokena i HEAD/prefetch ponašanje, Resend/Push/WhatsApp retry-ji i lokalni režim, poruke koje se ne šalju do CR-24, linkovi u mejlovima.
- **§10 (novo):** stavka 8 — presign, HEAD provera, logo organizacije i partnera, CopyObject, orphan scan, CORS.
- **§11 (novo):** tabela naziva operacija u `rate_limit_counters` (uključujući `whatsapp.verify_code` 10/sat i `messages.send` 30/sat).
- **§17 (novo):** stavke otvorene posle izgradnje (bez odluka).
- **Nova §20:** **20.1** sve RPC funkcije i view-ovi dodati tokom izgradnje — parametri, povratni oblik, mod, grant-ovi, greške koje funkcija sama podiže, EP koji opslužuje (npr. `confirm_moment`, `apply_payment_event`, `mark_occurrence_done_for`, Šapa pomoći i admin definer funkcije), sa oznakom **exc. 6** samo za one koje Session logovi tako beleže; **20.2** rute (`/auth/callback`, `/api/a/done`, `/api/internal/*`, webhook-ovi, `/api/public/*`); **20.3** fajlovi server akcija i EP-ovi koje pokrivaju.
- Ispravke u odnosu na prekinuti rad: change log više ne obećava „EP → action map“ nego §20.2/§20.3 kako postoje; `moments_api.public_link.url` ima konstantan host (nije samo putanja).

## 4. `06-build-plan.md` — v1.3 → v1.4

- **Change log** red 1.4 (premešten posle reda 1.2, hronološki), zaglavlje (datum, status, *Traces to*).
- **§3:** nova tabela *Off-plan steps*: R1 ✅ (2026-10-28), D1 ✅ (2026-10-29), F1 ✅ (2026-10-29), D2 ✅ (2026-11-09); **L1 i FX ⬜** — nemaju commit niti opis u repozitorijumu, pa nisu označeni kao urađeni.
- **§12 CR-26:** ✅ rešeno — vlasnik jednom lepi `supabase/seed/cities.sql` u produkcijski SQL editor; urađeno 2026-10-29.

## 5. Provera

- `npm run lint` (`eslint .`) — prolazi bez grešaka i upozorenja. Pun test suite nije pokretan jer su izmene samo u dokumentaciji.

## 6. Ostaje otvoreno (nije odlučivano ovde)

- Vlasnik treba da potvrdi funkcije iz API §20 koje ugovor ranije nije imenovao.
- CR-24 tekstovi; OQ-10, OQ-15, OQ-16, OQ-17; eksterni nalozi (GitHub Actions naplata, Paddle, Meta WhatsApp, R2 CORS, Vault tajne po okruženju, restore vežba).
- Opis koraka L1 i FX treba da dopiše vlasnik kad budu urađeni.
