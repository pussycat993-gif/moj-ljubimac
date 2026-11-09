# FX — Ispravke nalaza iz Koraka 32 (Release verification)

> Korak van plana (nije korak iz `docs/product/06-build-plan.md`). Nenadgledano noćno pokretanje, samo lokalno (lokalni Supabase i `next dev`). Datum: 9. 11. 2026.

Obuhvat: defekti koje Session log Koraka 32 beleži kao neuspešne (❌, D-01 … D-09) i koji su greške u kodu ovog repozitorijuma. Stavke koje zavise od vlasnice, pravnih tekstova, Paddle-a, R2, Resend-a, WhatsApp-a ili produkcije nisu dirane (navedene su u tabeli kao „van obuhvata“). Za svaki ispravljeni defekt prvo je napisan test koji pada na starom kodu, zatim je urađena ispravka; test je zadržan. Nijedan postojeći test nije obrisan ni oslabljen; nema novih migracija (izmenjen je samo `supabase/seed.sql`).

## Tabela svih nalaza Koraka 32

| Nalaz | Šta je bilo | Status | Izmena | Test koji to dokazuje |
|---|---|---|---|---|
| **D-01** (RC-1: FR-13, FR-20, FR-28, FR-29) | Fiksni datumi u seed-u (Besnilo 26. 10. 2026, Tobrex 15–25. 10, kontrola 30. 10.) su prošli, pa posle `db reset` Luna nema nijedan termin podsetnika u prozoru od 60 dana; 6 pgTAP fajlova pada | ✅ ispravljeno | `supabase/seed.sql`: Lunini datumi su relativni u odnosu na današnji dan (Beograd): Besnilo dospeva za 17 dana, Purevax za 123 (van prozora, kao ranije), Tobrex od pre 3 do za 6 dana, doze juče, pregled pre 4 dana, kontrola za 10 dana. `get_pet_record.test.sql` sada čita te datume iz tabele umesto da ih piše napamet | novi `supabase/tests/seed_freshness.test.sql` (3 od 6 provera pada na starom seed-u, sve prolaze posle reset-a); `get_pet_record` #35, `household_member_permissions` (sva 26), `household_sharing` #29, `pet_delete` #2, `pet_summaries_api` #14–16, 27, 28, 30, `reminder_rls` #1 — sve prolaze posle `npx supabase db reset` |
| **D-02** (niska važnost) | pgTAP zavisi od starih lokalnih redova (posle e2e ili nedelja starog seed-a) | ✅ ispravljeno | Testovi sami postavljaju svoje podatke u transakciji koja se poništava: `get_me` i `subscription_read` vezuju Ivanin period na „sada + 1 mesec“; `retention_job` i `server_support` prvo brišu stare `idempotency_keys` / `rate_limit_counters`; `household_rls` i `household_invitations` brišu zaostale pozivnice domaćinstva b1…01; `sapa_listings_api` pravi oglas f3…08 jedan dan noviji od seed oglasa f3…04 | Reprodukcija: posle reset-a je baza „ostarena“ (period pretplate −20 dana, oglasi −20 dana, zaostali ključ, brojač i pozivnica) — tačno istih 6 provera kao u Koraku 32 pada (`get_me` #14, `subscription_read` #9, `retention_job` #24, `sapa_listings_api` #30, `household_rls` #16, `server_support` #12 / bad plan), a pala je i `household_invitations` #11. Posle izmene: `npx supabase test db` → PASS na ostarenoj bazi i na bazi posle punog e2e |
| **D-03** (NFR-04, axe serious) | Neaktivne kartice (`text-foreground/60`) imaju kontrast 4,18:1 i 4,05:1, ispod 4,5:1 | ✅ ispravljeno | `components/ui/tabs.tsx`: neaktivna kartica koristi `text-muted-foreground` (#6B5B4E: ≥ 4,5:1 na `--background` i `--muted`) | `tests/design/tabs-a11y.test.tsx` (klasa + izračunat kontrast tokena); `e2e/keyboard-focus.spec.ts` › D-03 (axe `color-contrast` na S03, S10 i S13 dijalogu: na starom kodu S03 4,18:1, sada 0); `e2e/accessibility.spec.ts`: 0 nalaza bilo koje težine na svih 14 ekrana |
| **D-04** (WCAG 2.4.3) | Posle „Urađeno“ na S10 fokus odlazi na `<body>` | ✅ ispravljeno | `app/(app)/podsetnici/reminders-client.tsx`: posle uspešnog EP-26 fokus prelazi na dugme „Urađeno“ reda koji je zauzeo mesto (ili prethodnog reda), a ako je lista prazna — na panel kartice | `tests/reminders/reminders-screen.test.tsx` › „S10 — focus after 'Urađeno'“ (3 testa); `e2e/keyboard-focus.spec.ts` › D-04 |
| **D-05** (WCAG 2.4.3) | Dijalog „Pozovi člana“ ne vraća fokus na dugme koje ga je otvorilo | ✅ ispravljeno | `app/(app)/domacinstvo/household-screen.tsx`: dijalog pamti dugme koje ga je otvorilo (gornje ili iz praznog stanja) i na zatvaranju (`onCloseAutoFocus`) vraća fokus na njega | `tests/household/household-screen.test.tsx` › „S13 invite Dialog — focus return“ (2 testa); `e2e/keyboard-focus.spec.ts` › D-05 |
| **D-06** (Design §10) | Panel kartice dobija fokus bez vidljivog prstena | ✅ ispravljeno | `components/ui/tabs.tsx`: `TabsContent` ima `focus-visible:ring-2 ring-ring ring-offset-2` (Design §10) | `tests/design/tabs-a11y.test.tsx`; `e2e/keyboard-focus.spec.ts` › D-04 and D-06 (izračunat stil panela) |
| **D-07** (FR-35, upotrebljivost) | (a) kalendar ostaje otvoren posle izbora dana; (b) klik na već izabran dan briše obavezan datum; (c) nazivi za čitač ekrana su na engleskom | ✅ ispravljeno | (a, b) Svaki birač datuma je kontrolisan i zatvara se posle izbora; obavezna polja (`required`) ignorišu poništavanje izbora: S04 datum davanja, S05 datum pregleda, S27 datum početka, težina, Uspomene, leglo, S11. Neobavezna polja (sledeća doza, kontrola, kraj terapije, datum rođenja) i dalje mogu da se obrišu ponovnim klikom, ali se kalendar zatvara. (c) `components/ui/calendar.tsx` koristi `sr-Latn` / `en-GB` lokal iz react-day-picker-a prema `<html lang>` (ili `lang` prop-u), sa neformalnim srpskim nazivima navigacije („Idi na prethodni mesec“, „Idi na sledeći mesec“, „Izaberi mesec“, „Izaberi godinu“) | `tests/design/calendar-locale.test.tsx`; novi testovi u `tests/pet-record/vaccination-form.test.tsx`, `vet-visit-form.test.tsx`, `treatment-form.test.tsx`, `weight-tab.test.tsx`, `tests/memorial/memorial-dialog.test.tsx`, `tests/litters/litters-screen.test.tsx`, `tests/pets/pet-form.test.tsx`, `tests/reminders/reminder-form.test.tsx` (11 novih testova pada na starom kodu); `e2e/keyboard-focus.spec.ts` › D-07 |
| **D-08** (niska važnost) | S19 Free korisniku kaže da mu se Premium neće obnoviti | ✅ ispravljeno | `app/(app)/profil/podaci/account-data-screen.tsx`: rečenica „Premium pretplata se neće obnoviti.“ u dijalogu i deo „a Premium se neće obnoviti“ na kartici čekanja prikazuju se samo kad `Me.entitlements.premium` = true. Novi ključ `accountData.pendingBodyFree` (sr i en) je postojeći tekst bez dela o Premiumu | `tests/data-control/account-data-screen.test.tsx` › „S19 Premium lines only for Premium“ (3 testa) |
| **D-09** (RC-1: FR-48) | Odgajivač ne može kroz UI da upiše leglo: nijedan ekran ne postavlja `breeding_status = active` | ⛔ nije ispravljeno — potrebna odluka | — | Treba odluka o proizvodu/dizajnu: gde i kako odgajivač označava životinju kao priplodnu (S02/S20 polje, akcija na kartici, ili da forma legla nudi sve ženke). Bez toga bi svako rešenje bilo izmišljen UI. Vlasnik: Keti / Design |
| RC-1 (CR-24) | Poruke bez teksta u Design §9.1 se ne šalju | ⏸ van obuhvata | — | Čeka tekstove (CR-24, plan/Design) |
| RC-2 | Paddle sandbox kupovina | ⏸ van obuhvata | — | Vlasnica (Paddle) |
| RC-4 | Pravni tekstovi S30/S31 (OQ-15) | ⏸ van obuhvata | — | Vlasnica sa advokatom |
| NFR-04 (čitač ekrana) | Ručni prolaz sa NVDA/TalkBack/VoiceOver | ⏸ van obuhvata | D-07 (c) uklanja engleske nazive kalendara | Vlasnica |
| NFR-10 | Mesečni troškovi iz kontrolnih tabli | ⏸ van obuhvata | — | Vlasnica (produkcija) |
| G-01 | Viber nema pošiljaoca | ⏸ van obuhvata | — | Odluka plana/vlasnice |
| G-04 | WhatsApp šabloni i tajne u produkciji | ⏸ van obuhvata | — | Vlasnica (Meta) |
| G-05 | R2 CORS i prava tokena za kopiranje | ⏸ van obuhvata | — | Vlasnica (R2) |
| G-06 | FR-31: naslednik koji već ima domaćinstvo; mejl nasledniku | ⏸ van obuhvata | — | Odluka (F1 ⛔) i CR-24 |
| G-07 | FR-40: brisanje auth korisnika na hostovanom projektu | ⏸ van obuhvata | — | Vlasnica (produkcija) |
| G-08 | FR-64 #6: brisanje oglasa sa prijavama (kolizija indeksa) | ⏸ van obuhvata | — | Odluka (F1 ⛔) — nije označeno kao ❌ u Koraku 32 |

## Napomene

- **Seed (D-01):** samo Lunini zdravstveni datumi su postali relativni; težine, dnevnik ishrane, trenuci i ostalo su ostali isti. Napomena u seed-u objašnjava razlog. Vrednosti u seed-u su u istoj ulozi kao ranije (Besnilo pravi podsetnik u prozoru, Purevax ne, FeLV nema sledeću dozu).
- **e2e i kalendar:** `e2e/mark-done.spec.ts` i `e2e/vaccination-reminder.spec.ts` su tražili englesko dugme „Go to the Next Month“; sada traže „Idi na sledeći mesec“. Postojeći test `tests/pets/pet-form.test.tsx` (QA Q1) je tražio dan po engleskom nazivu („June 10th, 2015“); sada po srpskom („10. jun 2015.“). Oba testa proveravaju istu stvar, samo sa ispravnim jezikom.
- **axe merenje dijaloga:** `e2e/accessibility.spec.ts` je dijalog „Pozovi člana“ merio dok se pojavljuje (prozirnost se animira), pa je broj nalaza zavisio od trenutka (1 u Koraku 32, 5 u prvom pokretanju FX). Sada sačeka kraj animacije; ishod: 0 nalaza na svih 14 ekrana.
- **Testovi koji su dodati:** 25 novih Vitest testova (1797 → 1822), 1 novi pgTAP fajl sa 6 provera (3191 → 3197 provera u 94 fajla), 4 nova Playwright testa u `e2e/keyboard-focus.spec.ts` (9 → 13).

## Verifikacija

| Komanda | Rezultat |
|---|---|
| `npm run typecheck` | ✅ exit 0 |
| `npm run lint` | ✅ exit 0 |
| `npm test` | ✅ `Test Files 153 passed (153)`, `Tests 1822 passed (1822)` |
| `npx supabase test db` | ✅ `Files=94, Tests=3197`, `Result: PASS` — posle `npx supabase db reset`, na „ostarenoj“ bazi (D-02) i na bazi posle punog e2e |
| `npm run build` | ✅ exit 0 |
| `npm run e2e` | ✅ `13 passed`, 2 radnika (lokalni Supabase, env iz `npx supabase status -o env` kao u Koraku 32) |

Reprodukcija „pre ispravke“: novi testovi su pokrenuti na kodu iz `HEAD` (kopije izmenjenih fajlova su privremeno vraćene): `seed_freshness` 3/6 pada; 11 novih testova birača datuma, 5 testova kalendara/kartica, 3 testa fokusa na S10, 2 na S13 i 2 na S19 padaju; sva 4 testa u `e2e/keyboard-focus.spec.ts` padaju. Posle ispravki svi prolaze.

Lokalno stanje posle pokretanja: `npx supabase db reset` je vratio seed; ništa nije push-ovano.
