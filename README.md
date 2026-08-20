# Moj Ljubimac 🐾

Mobilna aplikacija (iOS + Android) za praćenje zdravlja, ishrane i trenutaka vašeg ljubimca.
React Native + Expo SDK 57, TypeScript, expo-router.

## Pokretanje

```bash
npm install
npx expo start
```

Zatim:
- **Telefon (najbrže):** instaliraj **Expo Go** sa App Store / Play prodavnice i skeniraj QR kod iz terminala.
  Napomena: notifikacije u Expo Go rade ograničeno — za pun test notifikacija koristi development build (dole).
- **Development build (pun test svih funkcija):**
  ```bash
  npx expo run:android   # ili run:ios na Mac-u
  ```
  Za build u oblaku bez lokalnog Android Studio/Xcode: EAS Build — `npx eas build`.

## Šta je implementirano

| Funkcija | Status |
|---|---|
| Više ljubimaca (ime, vrsta, rasa, pol, rođendan, mikročip, foto) | ✅ |
| Tema po polu ljubimca — promena ljubimca menja celu paletu | ✅ |
| Težina + grafikon kretanja | ✅ |
| Vakcinacije sa rokom važenja + automatski podsetnik 7 dana pre isteka | ✅ |
| Terapije/lekovi sa intervalom i notifikacijom za sledeću dozu | ✅ |
| Veterinarski pregledi sa prilozima (foto + PDF) | ✅ |
| Ishrana: brend, dnevna količina, beleženje stolice, analitika (Premium) | ✅ |
| Trenuci (milestones) sa fotografijama + popup pri otvaranju + deljenje | ✅ |
| Deljenje: sistemski share (FB/IG/…) + direktno WhatsApp i Viber | ✅ |
| Podsetnici sa lokalnim notifikacijama + rođendanska notifikacija | ✅ |
| Premium ograničenja (1 ljubimac besplatno, analitika, prilozi…) | ✅ (lokalni fleg) |
| Podaci trajno na uređaju (AsyncStorage) i fotografije u app folderu | ✅ |
| PDF izvoz celog kartona (Premium) — `expo-print` + share | ✅ |

## Šta je svesno ostavljeno kao sledeći korak (i gde se kači)

1. **Naplata pretplate** — `src/app/paywall.tsx`. Dugme trenutno uključuje lokalni demo fleg.
   Produkcija: RevenueCat (`react-native-purchases`) → StoreKit + Play Billing,
   pa `setPremium(true)` vezati za status pretplate. Cene u tekstu su probne.
2. **Deljenje profila sa supružnikom (sinhronizacija)** — traži backend sa nalozima.
   Preporuka: Supabase (Postgres + Auth + Realtime). Ceo model podataka je u `src/lib/types.ts`
   i preslikava se 1:1 u tabele; `src/lib/store.ts` je jedino mesto koje treba proširiti sync logikom.
3. **Veterinari/pet shopovi u blizini** — placeholder kartica na početnom ekranu.
   Produkcija: lokacija (`expo-location`) + vaša baza partnera (B2B monetizacija).

## Arhitektura (kratko)

```
src/
  lib/        tipovi, teme, store (zustand + AsyncStorage), datumi,
              notifikacije, mediji, deljenje
  hooks/      use-theme (tema prati pol aktivnog ljubimca)
  components/ UI kit (Card, Row, Btn…), sparkline, pet-switcher,
              milestone-popup, date-field
  app/        expo-router ekrani: (tabs)/ 5 tabova + modalne forme u entry/
```

- **Stanje:** jedan zustand store, automatski snimljen u AsyncStorage (ključ `moj-ljubimac-v1`).
- **Fotografije/PDF:** kopiraju se u trajni `media/` folder aplikacije (izbor iz galerije/kamere je privremen).
- **Teme:** `THEMES.f` (roze) i `THEMES.m` (zelena) u `src/lib/theme.ts`; brend braon iz loga je `BRAND`.
- **Demo podaci:** pri prvom pokretanju se ubacuje Luna sa istorijom, da app ne bude prazan.

## Pre objavljivanja u prodavnice (podsetnik)

- Privacy Policy + Terms na javnom URL-u; brisanje naloga iz aplikacije kad se doda backend.
- Google Play Data Safety + Apple Privacy „nutrition label".
- Pretplate isključivo kroz Play Billing / StoreKit + „Restore purchases".
- Ime i logo su vaši originalni — proveriti zauzetost imena u obe prodavnice.
