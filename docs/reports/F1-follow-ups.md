# F1 — Pregled follow-up stavki iz Session logova

**Datum:** 2026-10-29 · **Grana:** `overnight` · **Nije korak plana** (§3 u `docs/product/06-build-plan.md` nije menjan).

Pročitani su Session logovi Koraka 01–31, 28a–28c i 30a, plus beleška R1 (pod Korakom 27) i Korak D1 (samo dokumentacija, bez follow-up stavki u planu). Svaka follow-up stavka je razvrstana:

- **✅ urađeno u F1**: mala izmena koda u ovom repozitorijumu, bez odluke vlasnika i bez eksternog naloga;
- **☑ već urađeno**: zatvorio ju je neki kasniji korak (naveden u tabeli);
- **⛔ nije urađeno**: uz razlog (vlasnik / eksterni nalog, odluka o proizvodu ili ugovoru, nedostaje tekst (copy), samo dokumentacija, ili nije mala izmena).

Oznake `TODO` / `PROPOSED` / `FIXME`: nema ih u `app/`, `components/`, `lib/`, `supabase/`, `scripts/`, `tests/`, `e2e/`, `proxy.ts` ni `public/sw.js` (poslednji `PROPOSED` komentar uklonjen je u Koraku 16).

## Urađeno u F1

| # | Izvor | Follow-up | Izmena | Testovi |
|---|---|---|---|---|
| 1 | Korak 03 | `.open-next` / `.wrangler` ignore u `eslint.config.mjs`, ignorisati `cloudflare-env.d.ts` | Ignore-i su prebačeni u `eslint.config.mjs`, a skripta `lint` je sada samo `eslint .`. Nestala su 2 poznata upozorenja iz generisanog `cloudflare-env.d.ts`. | `tests/tooling/scripts.test.ts` (ESLint `isPathIgnored`) |
| 2 | Korak 03 | `public/_headers` (immutable keš za `/_next/static/*`) | Dodat `public/_headers` sa sadržajem koji propisuje OpenNext adapter (`Cache-Control: public,max-age=31536000,immutable`). | `tests/tooling/static-headers.test.ts` |
| 3 | Korak 08 | Indeks `reminder_occurrences(reminder_id)` (vlasnik ga je sada odobrio) | Aditivna migracija `20261029150000_reminder_occurrences_reminder_id_idx.sql` (`create index if not exists`, bez izmene podataka). | `supabase/tests/reminder_occurrences_reminder_id_idx.test.sql` (indeks postoji, nije parcijalan, planer ga koristi) |
| 4 | Koraci 13, 17, 18 | `ReminderTypeIcon` ima sr-only oznake samo na srpskom | Komponenta dobija opcioni `labels` prop sa srpskim podrazumevanim vrednostima (obrazac `labels:start…labels:end`). `ReminderRowLabels.types` ga prosleđuje dalje. Ključevi `reminders.icon*` dodati su u `sr.ts` / `en.ts`, a pomoćna funkcija je `lib/i18n/reminder-type-labels.ts`. Ekrani S01, S03, S10 i S12 sada šalju oznake na aktivnom jeziku. | `tests/components/reminder-type-icon.test.tsx`, `tests/components/reminder-row.test.tsx`, `tests/reminder-settings/reminder-settings.test.tsx`, `tests/design/ui-overrides.test.ts` (strip) |
| 5 | Koraci 12, 13 | Tekst dugmeta u `ErrorState` iz rečnika | `labels` prop postoji od Koraka 13. Jedino mesto koje ga nije prosleđivalo bilo je S18 (`app/(app)/profil/profile-client.tsx`); sada prosleđuje `common.retry`. | `tests/profile/profile-form.test.tsx` |
| 6 | Koraci 14, 15 | Precizniji tipovi nizova u `PetRecord` (`lib/actions/pets.ts`) | `vaccinations` / `treatments` / `vet_visits` / `weights` su sada `Vaccination[]` / `Treatment[]` / `VetVisit[]` / `WeightEntry[]`. Uklonjena su `as unknown as` kastovanja u S03, na tri stranice za izmenu i u `lib/actions/pdf-export.ts`. | `npm run typecheck`; postojeći testovi S03 / PDF / formi |
| 7 | Koraci 16, 21, 22 | CTA u `PremiumLock` vodi na `/premium` (vlasnik je to odlučio u Koraku 22; Korak 23 ga nije povezao) | `PremiumLock` dobija opcioni `ctaHref`: dugme postaje `Link`, a bez njega ostaje kao u mockupu. `ctaHref="/premium"` je dodat na 9 mesta koja su bila neaktivna (S01, S02, S03 PDF, S03 Uspomene, S06, S08, S12 WhatsApp, Uspomene, S35). S13, S14 i S34 već imaju svoj omotač ka `/premium` i nisu menjani. | `tests/components/premium-lock.test.tsx`; tvrdnje „link → /premium” u testovima pets-home, pet-form, memorial-dialog, pdf-export, vet-visit-form, moments-screen, reminder-settings i my-listings-screen; `ui-overrides` strip |
| 8 | Korak 26 | `acceptTransfer` pravi R2 klijent i kad nema fajlova | R2 klijent se pravi samo kad postoji bar jedan ključ za kopiranje, pa lokalno prihvatanje kartona bez fajlova radi bez `R2_*`. | `tests/transfers/accept-transfer.test.ts` |
| 9 | Korak 28b (i 28c `/poruke`) | Prosleđivanje `next` pri preusmeravanju na prijavu za Šapu pomoći | `lib/supabase/middleware.ts`: za `/sapa-pomoci/…` (S34, S35) i `/poruke…` preusmeravanje ide na `/prijava?next=<putanja+upit>`; ostale površine se ne menjaju. `/prijava` već prihvata samo putanje sa istog sajta (`safeNextPath`). | `tests/sapa/sapa-layout.test.tsx` (uključujući link „Produži” sa `?produzi=`), `tests/auth/middleware.test.ts` (ostale površine bez `next`) |
| 10 | Koraci 28b, 28c | `listing-card`, `listing-type-tag` i `safety-dialogs` u `COMPOSITES` u `ui-overrides`, sa strip funkcijom | Dodate su tri strip funkcije, pa provera „ported unchanged” sada pokriva i ove kompozite. | `tests/design/ui-overrides.test.ts` |

## Već urađeno u kasnijim koracima

| Izvor | Follow-up | Zatvoreno u |
|---|---|---|
| Korak 12 (primer iz zadatka) | `SignedInShell` iz `profile-client.tsx` u `components/app/signed-in-shell.tsx` | Korak 12 (owner instruction b) |
| Korak 10 → 12 (primer iz zadatka) | `html lang` prema aktivnom jeziku | Korak 12 (`htmlLang(locale)` u `app/layout.tsx`) |
| Korak 02 | Server akcije za prijavu (S16/S28) | Korak 11 |
| Korak 04 | `terms_version` u seedu; profili drugih članova | Korak 12; security definer RPC-ovi (Koraci 22, 24) |
| Korak 05 | BR-27, `complete_registration`, EP-35/EP-40, `organisation_pending_approval` / `team_full`, `households.read_only` pri isteku | Koraci 30, 12, 22, 24, 30 |
| Korak 06 | FK `dose_logs.occurrence_id`, FK `pets.litter_id`, stari ključ fotografije u red za brisanje, memorijal, `breeder_plan_required`, kopija predatog kartona | Koraci 08, 09, 15, 16, 24, 25 |
| Korak 07 | `moments_api` / EP-24, pogledi dnevnika i validacija EP-18 | Koraci 21, 20 |
| Korak 08 | RPC-ovi Koraka 17–19, ponovno uključivanje podsetnika pri vraćanju iz Uspomena, raspored obroka | Koraci 17–19, 16, 20 |
| Korak 09 | `forbidden_role` za `breeding_status`, stari logo partnera u red za brisanje, RPC-ovi organizacija | Koraci 24, 28 (`save_partner`), 24–28 |
| Korak 11 | Stringovi `sign-in-form` u `lib/i18n`, `signOut`; rute koje su vraćale 404 | Korak 12; sve rute danas postoje (R1 za `/`) |
| Korak 16 | Promena statusa životinja organizacije | Korak 24 |
| Korak 18 | Živi WhatsApp; akcija „Urađeno” u `public/sw.js` | Koraci 29, 19 |
| Korak 19 | Slanje preko WhatsApp-a; šabloni Koraka 22/25/30 u `RENDERERS` | Koraci 29, 22/25/30 |
| Korak 20 | Link „Trenuci” na S03 | Korak 21 |
| Koraci 22–26 | `og_` / `tr_` putanje, arhive i istek izvoza, `submitOrgRequest` na S23, istek transfera, `donation` | Koraci 24–26, 28b, 30, 30a |
| Korak 28 / 28a | Tab Moderacija; provere za `listing_photo`; Poruke na S12 | Koraci 28c, 28b, 28c |
| Korak 30 | Resetovanje `last_notice_days` pri obnovi | Korak 31 (`apply_payment_event`) |

## Nije urađeno

| Izvor | Follow-up | Razlog |
|---|---|---|
| Korak 01 / 03 | `next typegen` pre `tsc` u CI-ju | Trenutno nije potrebno: nijedan kod ne koristi generisane tipove ruta, a `typecheck` prolazi. Ostaje kao napomena za kasnije. |
| Korak 01 | Isključivanje `docs` iz `tsconfig` | Odluka: mockupi se kopiraju, ne proveravaju na licu mesta. Ništa se ne menja. |
| Koraci 01, 10 | Zaglavlja koraka i dalje pišu „⬜ not started” | Dokumentacija plana. F1 ne menja tuđe redove i sekcije koraka. |
| Korak 03 | GitHub/Cloudflare tajne, prvi push na `main` | Vlasnik / eksterni nalog (Cloudflare, Supabase). |
| Korak 03 | Ponovo uključiti Cache Components | Zavisi od ispravke u adapteru (Workers hang). Treba ponovo testirati sa `npm run preview`. |
| Korak 03 | `npm run cf-typegen` posle izmene `wrangler.jsonc` | Procesna napomena; `wrangler.jsonc` nije menjan. |
| Korak 04 | CR-26: gradovi u produkciji | Vlasnik / produkcija. |
| Korak 08 | — | (indeks urađen, vidi gore) |
| Korak 10 | Uklanjanje `next-themes` i `shadcn` iz `dependencies` | Plan kaže „ako vlasnik želi”, dakle odluka vlasnika. |
| Korak 10 | Build preuzima fontove sa Google Fonts | CI mora imati mrežu; nije izmena koda. |
| Korak 11 | Prebaciti copy za S16/S28 u Design §12 | Samo dokumentacija (odluka vlasnika), nije kod. |
| Korak 11 | Ponovo testirati `proxy.ts` pod `npm run preview`; `localhost` umesto `127.0.0.1` | Ručna provera posle nadogradnje adaptera; operativna napomena. |
| Korak 11 | Podešavanje auth-a u produkciji | Vlasnik (Supabase dashboard). |
| Korak 12 | `ml_locale` u TC, `labels` prop u Design §6 | Samo dokumentacija. |
| Koraci 12, 19, 25, 26, 30 | CR-24: mejl Operateru za azile na čekanju, alarm watchdog-a, mejlovi adminima o zahtevima i transferima, push obaveštenja EP-49, mejl nasledniku BR-27 | Nema šablona i teksta u Design §9.1. Potreban je tekst (copy). |
| Koraci 13, 15, 21 | `R2_*` / `ACTION_TOKEN_SECRET` lokalno; CORS na R2 bucketu (PUT / GET) | Eksterni nalog (Cloudflare R2) i podešavanje okruženja. |
| Korak 13 | `ACTION_TOKEN_SECRET` u TC §8.1 | Samo dokumentacija. |
| Koraci 14, 15 | Pravilo za predati karton pri otpremanju | Baza ga sprovodi od Koraka 25 (guard trigeri, `forbidden_role` pri potvrdi). Za proveru već u EP-13 tiketu treba odluka u ugovoru (API); izmena je izostavljena. |
| Korak 17 | Kontekstualni `aria-label` za meni „Još opcija” | Nedostaje tekst (copy). |
| Korak 18 | `distinct` provera za `lead_minutes` u bazi | Ograničenje van TC §5.5. Treba izmena TC-a, a postojeći dupli redovi bi mogli da obore migraciju. |
| Korak 19 | RISK-19: stranica za potvrdu jednim klikom, lista user-agenata skenera | Odluka o ugovoru i dizajnu (API §9.3 / §15). |
| Korak 19 | Usklađivanje ponovnih pokušaja Resend-a (API §9.4) | Ugovor / dokumentacija. |
| Korak 19, 30 | Vault tajne `dispatch_url` / `dispatch_secret` i tajne aplikacije | Vlasnik, po okruženju. |
| Koraci 21–31 | Dodati RPC-ove i polja u `docs/product/05-api-integration-contract.md` / TC (confirm_moment, household / organisation / transfer / litter / partner / admin / jobs / payments funkcije, `data_export` u `FileUrl.kind`, `Plan.price` nullable, odgovor `/api/internal/exports`, preference_type = reminder_type) | Samo dokumentacija ugovora. Menja je vlasnik ugovora, nije kod. |
| Korak 21 | Host u `moments_api.public_link.url` | Prvo treba izmeniti TC §6 („site URL”). |
| Korak 22 | Prebacivanje između domaćinstava | Odluka o proizvodu (nova funkcionalnost). |
| Korak 23 | Očistiti e2e redove pre `supabase test db` | Procesna napomena; u F1 je pokrenut `npx supabase db reset` pre pgTAP-a. |
| Korak 24 | Tekst za greške S20/S14/S29, oznake `breeding_status`, baner za odbijenu organizaciju | Nedostaje tekst (copy). |
| Korak 24 | Stavka „Organizacija” u navigaciji vlasnika | Plan kaže „ako je i dalje poželjna”, a `(app)` layout već prebacuje članove u shell organizacije. Odluka o proizvodu. |
| Korak 25 | R2 token za `CopyObject` (čitanje i pisanje) | Vlasnik (Cloudflare R2). |
| Korak 26 | Odgajivač nema put na S02 do `breeding_status = active` | Odluka o proizvodu i dizajnu (nova UI putanja). |
| Koraci 27, 28 | EP-15 vraća `url = null` za `partner_logo` | Nema potrošača (S25 i admin sami potpisuju logo). Pravila pristupa za javni logo nisu precizirana. Nije urađeno bez potrebe. |
| Korak 27 | `LogoAvatar` | OQ-10, predloženi kompozit nije odobren. |
| Korak 28 | Logo partnera bez koraka potvrde | Siroče čisti noćni orphan scan (Korak 30). Za drugačije rešenje treba izmena dizajna. |
| Korak 28a / 28b | Kolizija indeksa u TC §5.10 (`reports_open_user_key`), deferrable unique za `listing_photos` | Treba izmena TC-a (šema), odluka vlasnika. |
| Korak 28c | `sendEmail` sa 1 ponovnim pokušajem za Šapu pomoći; akcija „Odgovori” u `sw.js` | U logu piše „Decide whether”, dakle odluka. |
| Korak 28c | OQ-17 privremena mapiranja | OQ-17 je otvoren; kolone se ne dodaju. |
| Korak 29 | Šabloni u Meta nalogu, `WHATSAPP_*`, webhook | Vlasnik / eksterni nalog (Meta). |
| Korak 29 | Fallback kad WhatsApp kasnije prijavi grešku; formulacija za HMAC/sha256 | Odluka o ugovoru (API §9.1 / §9.4, EP-30). |
| Korak 29 | Provera da broj koji odgovara odgovara `user_channels` | Ponašanje pri neslaganju nije specificirano (odluka). Potpisani token već vezuje podsetnik i primaoca. |
| Korak 30 | BR-27 za naslednika koji već ima domaćinstvo | Odluka o proizvodu. |
| Korak 30 | Brisanje `auth.users` na hostovanom projektu | Provera u produkciji (vlasnik). |
| Korak 30 | Kursor za orphan scan (>1000 objekata) | Treba izmena tabele ili kolone (change request). |
| Korak 30a | RISK-13 vežba restore-a; GitHub tajne i `workflow_dispatch` | Vlasnik / eksterni nalog. |
| Korak 30a | Streaming / multipart za velike izvoze (CPU limiti Workera) | Nije mala izmena; zahteva R2 multipart i testiranje sa pravim nalogom. |
| Korak 31 | Paddle sandbox/produkcija, `provider_price_id`, webhook, probna kupovina | Vlasnik / eksterni nalog (Paddle). |
| R1, D1 | — | Nema follow-up stavki. |

## Izuzeci i napomene

- **Testovi izmenjeni da proveravaju novo ponašanje** (zadatak to traži za svako promenjeno ponašanje):
  - `tests/sapa/sapa-layout.test.tsx`: preusmeravanje sada nosi `next`;
  - testovi koji su očekivali neaktivno *dugme* „Probaj 7 dana besplatno” sada očekuju *link* ka `/premium` (`pets-home`, `memorial-dialog`, `moments-screen`, `vet-visit-form`);
  - `tests/reminder-settings/reminder-settings.test.tsx` prosleđuje `locale` kao i stranica.
  - Nijedan test nije obrisan ni preskočen.
- **`tests/design/ui-overrides.test.ts`**: novi optional propovi (`ReminderTypeIcon.labels`, `ReminderRow.labels.types`, `PremiumLock.ctaHref`) uklanjaju se pre poređenja sa mockupom, po istom obrascu kao `shells` / `error-state`. Ostatak mora i dalje da bude jednak mockupu.
- **Migracija** je samo aditivna (`create index if not exists`). Nema brisanja ni izmene podataka.
- **`npm test`**: prvo pokretanje je imalo 1 timeout u `tests/sapa/listing-form-screen.test.tsx`. To je poznat flake pod opterećenjem iz Koraka 31; ekran nije menjan. Test prolazi sam (19/19), a ponovno pokretanje celog skupa prolazi.

## Verifikacija

| Komanda | Rezultat |
|---|---|
| `npm run typecheck` | ✅ exit 0 |
| `npm run lint` | ✅ 0 grešaka, 0 upozorenja (ranije 2 upozorenja u `cloudflare-env.d.ts`) |
| `npm test` | ✅ `Test Files 149 passed (149)`, `Tests 1766 passed (1766)` (posle ponovnog pokretanja zbog poznatog flake-a) |
| `npx supabase test db` (posle `npx supabase db reset`) | ✅ `Files=93, Tests=3191`, `Result: PASS` |
| `npm run build` | ✅ exit 0 |
| `npm run e2e` | ✅ `6 passed` (2 workera). Kao u ranijim koracima nema `.env.local`: Supabase promenljive su uzete iz `npx supabase status`, uz `NEXT_PUBLIC_SITE_URL=http://localhost:3000` i lokalni `ACTION_TOKEN_SECRET`. Placeholder `R2_*` vrednosti više nisu potrebne, zahvaljujući stavci 8. Prvi pokušaj bez ovih promenljivih je pao na 6/6 (okruženje, ne kod). |
