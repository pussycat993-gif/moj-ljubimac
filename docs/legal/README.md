> **NACRT — nije pravni savet; pregled advokata obavezan pre objave.**

# Pravni tekstovi — nacrti za pregled advokata (OQ-15)

Ova fascikla sadrži **prve nacrte** pravnih tekstova za Moj Ljubimac. Napisani su strogo na osnovu onoga što proizvod radi prema dokumentaciji u `docs/product/` (Product Brief, PRD, Technical Constraints v1.9 §5 model podataka, §6 integracije, §8.2 kolačići, API Contract). Nisu pravni savet i **ne smeju da se objave pre pregleda advokata**.

Stranice S30 `/privatnost` i S31 `/uslovi` u aplikaciji i dalje prikazuju privremeni tekst „Tekst dostavlja vlasnik (OQ-15).“ — ovi nacrti ih nisu menjali. Kod nije menjan.

## Fajlovi

| Fajl | Sadržaj | Jezik |
|---|---|---|
| `politika-privatnosti.sr.md` | Politika privatnosti | srpski (latinica) |
| `privacy-policy.en.md` | Privacy Policy | engleski |
| `uslovi-koriscenja.sr.md` | Uslovi korišćenja | srpski |
| `terms-of-use.en.md` | Terms of Use | engleski |
| `politika-povracaja.sr.md` | Politika povraćaja novca (Paddle) | srpski |
| `refund-policy.en.md` | Refund Policy (Paddle) | engleski |

Engleske verzije su prevod srpskih; napomene za advokata su detaljnije u srpskim verzijama.

## Oznake u tekstu

- `[NAZIV PREDUZETNIKA]`, `[ADRESA]`, `[PIB]`, `[MATIČNI BROJ]`, `[KONTAKT MEJL]` — podaci budućeg preduzetnika (rukovalac i prodavac usluge); popunjava vlasnica posle registracije. U kopiji aplikacije već se pojavljuje adresa `podrska@mojljubimac.rs` — proveriti da li je to `[KONTAKT MEJL]`.
- `[POTVRDITI]` / `[TO BE CONFIRMED]` — činjenica koju dokumentacija ne utvrđuje (npr. lokacija servera nekog pružaoca).
- `[NAPOMENA ZA ADVOKATA: …]` / `[NOTE FOR THE LAWYER: …]` — pitanje uz konkretan odeljak; briše se pre objave.
- `[DATUM OBJAVE]`, `[TERMS_VERSION]`, `[ADRESA SAJTA]`, `[GRAD]`, linkovi ka Paddle dokumentima.

## Usklađenost sa ekranima S30 i S31

Design System §12 predviđa ove odeljke:
- **S30 Politika privatnosti:** Ko smo · Koje podatke prikupljamo · Zašto ih prikupljamo · Koliko ih čuvamo · Tvoja prava · Kontakt.
- **S31 Uslovi korišćenja:** Opšte · Nalog · Premium i plaćanje · Sadržaj korisnika · Odgovornost · Izmene uslova · Kontakt.

Nacrti imaju više odeljaka (deljenje sa trećim licima, javno vidljivi podaci, prenos van Srbije, kolačići, maloletnici, Šapa pomoći, partneri…). Kada tekst bude konačan, treba odlučiti da li se ekrani proširuju novim odeljcima ili se dodatni odeljci spajaju u postojeće — to je izmena dizajna i koda u posebnom koraku. Za politiku povraćaja ne postoji ekran ni ruta; Paddle traži da bude javno dostupna (vidi pitanje 12).

## Pre objave (posle pregleda advokata)

1. Uneti konačan tekst u `lib/i18n/sr.ts` i `lib/i18n/en.ts` (S30, S31) umesto placeholder-a — poseban korak sa testovima `tests/legal/legal-pages.test.tsx`.
2. Povećati `TERMS_VERSION` u `lib/legal.ts` (trenutno `2026-10-20`).
3. Dodati javnu stranicu za politiku povraćaja (ili je uključiti u Uslove) i linkove u futeru.
4. Zatvoriti OQ-15 u Build Plan-u (Step 32, stavka 4) i u Design System §13.

## Otvorena pitanja za advokata

**Rukovalac i osnov**

1. **Rukovalac:** potvrditi da je rukovalac preduzetnik (fizičko lice), da li je potreban predstavnik ili lice za zaštitu podataka (čl. 56 Zakona) i da li se vodi evidencija radnji obrade (čl. 47).
2. **Pravni osnovi:** potvrditi tabelu u Politici privatnosti, odeljak 3 — posebno legitimni interes za statistiku dodira kod partnera (vezana za nalog korisnika) i za rezervne kopije. Da li je potrebna procena uticaja (čl. 54) zbog poruka između korisnika i javnih oglasa?
3. **Azili i odgajivači:** zahtevi za udomljenje i upiti (ime, telefon, mejl, poruka podnosioca) idu organizaciji. Da li je organizacija samostalni rukovalac, zajednički rukovalac (čl. 43) ili smo mi njen obrađivač za podatke o životinjama i timu? Da li je potreban poseban ugovor sa organizacijama?
4. **Domaćinstvo:** članovi vide mejl adrese jedni drugih i ko je uneo koji podatak — da li je dovoljno obaveštenje u politici?

**Obrađivači i prenos**

5. **Ugovori o obradi (čl. 45):** Supabase (EU, Frankfurt), Cloudflare (Workers i R2 — lokacija skladišta nije utvrđena; R2 nudi „jurisdictional restrictions“ za EU), Resend, Meta (WhatsApp Business Platform), GitHub (Actions — noćna rezervna kopija prolazi kroz njihov runner), Google (prijava). Proveriti standardne DPA i navesti tačne lokacije.
6. **Prenos van Srbije (čl. 63–65):** SAD (Resend, Cloudflare, Meta, GitHub, Google), UK (Paddle) — da li važi Odluka Vlade o listi država sa primerenim nivoom zaštite i da li su potrebne standardne ugovorne klauzule Poverenika.
7. **Paddle:** kao merchant of record — samostalni rukovalac za podatke o plaćanju? Mi dobijamo samo identifikatore, vrstu kartice i poslednje 4 cifre, iznose i ishode naplate. Proveriti koje kolačiće postavlja Paddle.js overlay i da li ih treba navesti.
8. **OpenStreetMap Nominatim:** šalje se samo poslovna adresa partnera (nije podatak o ličnosti korisnika, ali može biti podatak o preduzetniku-partneru). Da li ga uopšte navoditi kao obrađivača?
9. **Push servisi pregledača** (Google FCM, Mozilla, Apple) prenose šifrovan sadržaj — dovoljno opšte navođenje?

**Rokovi čuvanja**

10. Nisu određeni rokovi za: evidenciju dodira kod partnera (`partner_clicks`), istekle i odbijene pozive, zahteve za udomljenje posle odluke, obrađene prijave u Šapi pomoći (posle brisanja naloga ostaju bez podatka o podnosiocu), razgovore kada nijedna strana ne obriše nalog, tehničke dnevnike Cloudflare-a. Predložiti rokove — svaki novi rok znači i noćni posao u kodu.
11. Rezervne kopije se čuvaju 14 dana, pa obrisani podaci postoje u kopiji do ~44 dana posle zahteva za brisanje (30 + 14). Da li je ovo prihvatljivo uz obaveštenje?

**Plaćanje i povraćaj**

12. **Paddle uslovi:** Paddle pri odobravanju naloga proverava javne stranice (Uslovi, Privatnost, Povraćaj, cene) i zahteva jasnu politiku povraćaja i svoju formulaciju o merchant of record. Proveriti trenutne Paddle zahteve i Buyer Terms; nacrt predviđa 14 dana za sve kupce (ne samo EU) — potvrditi.
13. Da li povraćaj od 14 dana važi i za **automatske obnove** ili samo za prvu naplatu? Da li se vraća srazmerni deo kod **brisanja naloga** usred plaćenog perioda? (Nacrt: ne.)
14. **Odgajivački plan** kupuju pravna lica/preduzetnici — pravo na odustanak potrošača se ne primenjuje; da li im ipak nuditi isti rok?
15. **Srpski potrošači:** proveriti obaveze po Zakonu o zaštiti potrošača za digitalne usluge sa automatskom obnovom (obaveštenja pre obnove, pravo na odustanak od ugovora na daljinu — čl. 27 i dalje), kada je prodavac strani merchant of record.
16. Cene su u EUR uz PDV koji dodaje Paddle — da li u Uslovima navoditi iznose ili samo upućivati na stranicu /premium?

**Maloletnici i uzrast**

17. Aplikacija **ne proverava uzrast** pri registraciji. Odlučiti: minimalni uzrast (15 po čl. 16 Zakona, 16 ili 18), uzrast za kupovinu plaćenog plana, uzrast za Šapu pomoći (prodaja, poruke sa nepoznatim osobama). Ako je potrebna potvrda uzrasta, to je izmena proizvoda.

**Šapa pomoći i moderacija**

18. Da li Šapa pomoći može da sadrži oglase za **žive životinje** (kategorije u proizvodu su samo stvari: hrana, oprema i igračke, nameštaj, transporteri, lekovi i nega, ostalo; vrsta „tražim“ je otvorena)? Nacrt to ostavlja kao `[POTVRDITI]`.
19. Kategorija „lekovi i nega“ dozvoljena je azilima za potrebe — da li je potrebna zabrana lekova na recept i veterinarskih lekova i upozorenje (Zakon o lekovima i medicinskim sredstvima)?
20. **Odgovornost platforme** za sadržaj korisnika (Zakon o elektronskoj trgovini — pružalac usluge smeštaja): da li su postupak prijave, sakrivanja i suspenzije dovoljni; da li treba obaveštenje o razlogu odluke i mogućnost žalbe? Operater ne čita poruke; razlog sakrivanja koji operater upiše šalje se samo mejlom i ne čuva se (OQ-17).
21. Prodaja među korisnicima: da li su korisnici koji često prodaju trgovci sa obavezama prema kupcima i treba li ih na to upozoriti?

**Ostalo**

22. **Ograničenje odgovornosti:** da li ograničiti iznos (npr. na plaćeno u poslednjih 12 meseci) i kako formulisati odricanje za kašnjenje ili izostanak podsetnika (aplikacija nije veterinarski savet).
23. **Izmene Uslova:** aplikacija beleži prihvaćenu verziju samo pri registraciji (`profiles.terms_version`); ne traži ponovno prihvatanje. Da li je obaveštenje 30 dana unapred dovoljno ili treba ponovno prihvatanje (izmena proizvoda)?
24. **Gašenje naloga od strane operatera:** u proizvodu postoji samo suspenzija iz Šape pomoći; gašenje celog naloga je ručno. Potvrditi formulaciju tačke 12.2 Uslova.
25. **Jezik:** da li srpska verzija ima prednost; da li je obraćanje sa „ti“ (ton aplikacije) prihvatljivo u pravnim tekstovima ili prelazimo na „Vi“.
26. **Nadležnost suda** i vansudsko rešavanje potrošačkih sporova — upisati grad i tačan naziv tela.
27. **Kolačići:** potvrditi da za dva neophodna kolačića (sesija, `ml_locale`) nije potrebna saglasnost i da nije potreban baner.
28. **Viber:** kanal postoji u kodu ali je isključen; Politika ga ne navodi kao obrađivača — dopuniti pre uključivanja.
29. **Brojevi članova Zakona** citirani u nacrtima (čl. 12, 16, 17, 21, 26, 29–31, 36–38, 45, 47, 52–56, 63–65, 82) navedeni su po najboljem znanju — proveriti svaki.

## Izvori činjenica (za proveru)

- Podaci po tabelama: TC §5.1–§5.10; dodatne funkcije §5.11.
- Pružaoci usluga: TC §6, ADR-03, ADR-05 … ADR-09, ADR-11, ADR-13.
- Rokovi: TC §5.9, NFR-06, NFR-08; ADR-13 (14 dana rezervne kopije, 7 dana arhiva za izvoz).
- Kolačići: TC §8.2.
- Pravila: PRD §8 (BR-01 … BR-62), FR-36 … FR-41, FR-61 … FR-72.
- Plaćanje: TC ADR-09 (Paddle, EUR, PDV, probni period, otkazivanje, dvostruka kupovina).
