# Moj Ljubimac — plan rada 🐾

> Ovaj fajl drži u repou. Kad završiš stavku, promeni `[ ]` u `[x]`, commit, push —
> tako uvek znaš gde si stala, i sa bilo kog računara.

---

## 📍 CHECKPOINT — trenutno stanje (20. avgust 2026)

**Urađeno do sada:**
- [x] Klikabilan HTML prototip (izgled i tok aplikacije)
- [x] Kompletna React Native + Expo aplikacija (SDK 57, TypeScript)
- [x] Logo ubačen (ikonica, splash, Android adaptive, header)
- [x] Sve osnovne funkcije: ljubimci, teme po polu, težina + grafikon, vakcine,
      terapije, pregledi sa prilozima, ishrana + stolica, trenuci + deljenje,
      podsetnici + notifikacije, rođendan
- [x] Skeniranje hrane uklonjeno (odluka)
- [x] Premium ograničenja (lokalni demo fleg)
- [x] Projekat na GitHub-u: `pussycat993-gif/moj-ljubimac`
- [x] PDF izvoz kartona (Premium) — u repou (`src/lib/pdf.ts`), spojeno sa sync-om
- [x] Sync sloj za Supabase napisan (`src/lib/supabase.ts`, `src/lib/sync.ts`, `supabase/schema.sql`)
      — **ali još nije uključen**: `app.json → extra.supabase` je prazan, vidi 3.1

**SLEDEĆI KORAK → Faza 1, tačka 1.3.**

---

## Faza 1 — Lokalno testiranje na telefonu (ova nedelja)

- [x] 1.1 Prekopirati `pdf-izvoz-izmene.zip` preko projekta (4 fajla)
- [x] 1.2 Terminal: `npm install` pa `npx expo start` → skenirati QR Expo Go aplikacijom
- [ ] 1.3 Proći kroz SVE ekrane sa pravim podacima (unesi svog ljubimca, obriši demo Lunu)
- [ ] 1.4 Test PDF: Profil → demo Premium → „Napravi PDF" → pošalji sebi na Viber
- [ ] 1.5 Test deljenja trenutka (WhatsApp/Viber/sistemski share)
- [ ] 1.6 Zapisati šta ne valja / šta bi menjala (tekstovi, boje, raspored) → lista za doradu
- [ ] 1.7 `git add -A && git commit -m "PDF izvoz" && git push`

## Faza 2 — Development build (sledeći korak posle 1)

Zašto: Expo Go ne pokazuje notifikacije 100% verno; development build je „prava" aplikacija.

- [ ] 2.1 Nalog na expo.dev (besplatan) + `npm install -g eas-cli` + `eas login`
- [ ] 2.2 `eas build --profile development --platform android` → instaliraj .apk na telefon
- [ ] 2.3 Pun test notifikacija: podsetnik za 2 min, doza leka, rođendan (promeni datum za test)

## Faza 3 — Backend: nalozi + deljenje sa porodicom

Kod je napisan (`src/lib/supabase.ts`, `src/lib/sync.ts`, `supabase/schema.sql`), ali faza
nije završena — ostalo je da se poveže pravi projekat i doda pozivnica. Detalji po tački:

- [ ] 3.1 Supabase projekat (besplatan tier je dovoljan za start)
      → FALI: `app.json → extra.supabase.url` i `.anonKey` su prazni, pa `isCloudConfigured()`
        vraća `false` i cela prijava/sync je isključena u aplikaciji. Napravi projekat,
        pokreni `supabase/schema.sql`, upiši URL i anon ključ.
- [ ] 3.2 Tabele = model iz `src/lib/types.ts` (1:1) + Auth (email/Google/Apple)
      → URAĐENO: tabele 1:1 u `supabase/schema.sql` (pets, weights, vaccinations, medications,
        checkups, food_profiles, stools, milestones, reminders) + RLS + realtime.
      → FALI: Auth ima samo email/lozinku (`src/app/auth.tsx`). Google i Apple prijava nisu urađene.
        Apple prijava je obavezna na iOS-u ako postoji bilo koja druga socijalna prijava.
- [x] 3.3 Sync sloj (lokalno ostaje, backend dodaje sinhronizaciju)
      → Urađeno u `src/lib/sync.ts` (ne u `store.ts`): pull + realtime + debounce push + prenos
        brisanja. Poznato ograničenje: fotografije/prilozi se ne sinhronizuju (treba Storage).
- [ ] 3.4 Pozivnica supružniku → oba telefona vide isti karton u realnom vremenu
      → FALI: dugme „Pozovi člana porodice" samo deli reklamni link (`Share.share`), nema
        pozivnicu ni pristupanje household-u. `ensureHousehold()` svakom novom korisniku pravi
        SVOJ household, pa se supružnik sa svojim nalogom NE bi video isti karton.
        Danas radi samo deljenje preko istog naloga na dva telefona.
- [ ] 3.5 Brisanje naloga iz aplikacije (obavezno za obe prodavnice!) — kod napisan
  - [ ] 3.5a Posle 3.1: `supabase functions deploy delete-account` (bez `--no-verify-jwt`!)
  - [ ] 3.5b Samo ako je stari `schema.sql` već pokrenut: `supabase/patch-brisanje-naloga.sql`
  - [ ] 3.5c Zameniti placeholder email u `docs/brisanje-naloga.html` pravom adresom
  - [ ] 3.5d Objaviti tu stranu na GitHub Pages → URL ide u Google Data Safety (5.2)
  - [ ] 3.5e Test: probni nalog → obriši ga → proveri da nema reda u `auth.users`
      → NIJE urađeno i NE štiklirati dok se ne napravi. Bez ovoga App Store i Google Play
        odbijaju aplikaciju koja ima naloge. (`deletePet` briše samo ljubimca, ne nalog.)

## Faza 4 — Naplata (pravi Premium)

- [ ] 4.1 Google Play Console nalog (25 USD jednokratno) + Apple Developer (99 USD/god)
- [ ] 4.2 RevenueCat nalog + `react-native-purchases` → zameniti demo fleg u `paywall.tsx`
- [ ] 4.3 Definisati konačne cene (sadašnje 399/2.990 din su probne) + 7 dana trial
- [ ] 4.4 „Restore purchases" dugme (obavezno po pravilima prodavnica)

## Faza 5 — Priprema za prodavnice

- [ ] 5.1 Privacy Policy + Terms na javnom URL-u (može besplatno na GitHub Pages)
- [ ] 5.2 Google Data Safety upitnik + Apple Privacy „nutrition label"
- [ ] 5.3 Screenshotovi (oba pola teme!) + opis aplikacije na srpskom i engleskom
- [ ] 5.4 Provera zauzetosti imena „Moj Ljubimac" u obe prodavnice
- [ ] 5.5 Produkcijski build: `eas build --profile production`

## Faza 6 — Beta pa objava

- [ ] 6.1 Google Play: Internal testing (do 100 testera preko mejl liste)
- [ ] 6.2 iOS: TestFlight
- [ ] 6.3 2 nedelje bete → ispravke → objava 🚀

## Kasnije (posle objave)

- [ ] Veterinari/pet shopovi u blizini (B2B modul — naplata ordinacijama)
- [ ] Push kampanje (rođendani, neaktivni korisnici)
- [ ] Statistika korišćenja (npr. PostHog) za odluke o funkcijama
