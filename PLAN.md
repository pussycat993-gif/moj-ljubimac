# Moj Ljubimac — plan rada 🐾

> Ovaj fajl drži u repou. Kad završiš stavku, promeni `[ ]` u `[x]`, commit, push —
> tako uvek znaš gde si stala, i sa bilo kog računara.

---

## 📍 CHECKPOINT — trenutno stanje (22. jul 2026)

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
- [x] PDF izvoz kartona (Premium) — kod isporučen u `pdf-izvoz-izmene.zip`

**SLEDEĆI KORAK → Faza 1, tačka 1.1 (terminal).**

---

## Faza 1 — Lokalno testiranje na telefonu (ova nedelja)

- [ ] 1.1 Prekopirati `pdf-izvoz-izmene.zip` preko projekta (4 fajla)
- [ ] 1.2 Terminal: `npm install` pa `npx expo start` → skenirati QR Expo Go aplikacijom
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

- [ ] 3.1 Supabase projekat (besplatan tier je dovoljan za start)
- [ ] 3.2 Tabele = model iz `src/lib/types.ts` (1:1) + Auth (email/Google/Apple)
- [ ] 3.3 Sync sloj u `src/lib/store.ts` (lokalno ostaje, backend dodaje sinhronizaciju)
- [ ] 3.4 Pozivnica supružniku → oba telefona vide isti karton u realnom vremenu
- [ ] 3.5 Brisanje naloga iz aplikacije (obavezno za obe prodavnice!)

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
