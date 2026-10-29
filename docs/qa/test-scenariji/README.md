# Test scenariji — Moj Ljubimac (web)

Ovaj folder sadrži ručne test scenarije za QA. Svaki fajl pokriva jednu oblast aplikacije. Svaki scenario ima ID (npr. `TS-HH-007`), zahteve iz PRD-a (FR, BR, E) i ekran (Sxx), prioritet, nalog, preduslove, korake, očekivani rezultat i red za rezultat.

Stanje izgradnje: 29. 10. 2026. Izvor istine za to šta je gotovo je `docs/product/06-build-plan.md` §3.

## Indeks

| Fajl | Oblast | Broj scenarija | Status |
|---|---|---|---|
| [01-nalog-prijava-profil.md](01-nalog-prijava-profil.md) | AUTH — registracija, prijava, lozinka, profil, jezik, pravne stranice | 32 | ✅ spremno |
| [02-ljubimci-i-karton.md](02-ljubimci-i-karton.md) | PET — ljubimci, karton, prilozi, Uspomene, PDF | 35 | ✅ spremno |
| [03-podsetnici.md](03-podsetnici.md) | REM — podsetnici, podešavanja, mejl i push, „Urađeno" | 33 | ✅ spremno |
| [04-dnevnik-nege-i-trenuci.md](04-dnevnik-nege-i-trenuci.md) | CARE — dnevnik ishrane i stolice, obroci, trenuci, javni link | 31 | ✅ spremno |
| [05-domacinstvo.md](05-domacinstvo.md) | HH — domaćinstvo, pozivi, prava člana, samo za čitanje | 32 | ✅ spremno |
| [06-premium-pretplata-i-podaci.md](06-premium-pretplata-i-podaci.md) | PREM — Premium stranica, pretplata, izvoz podataka, brisanje naloga | 26 | ✅ spremno |
| [07-organizacije.md](07-organizacije.md) | ORG — azili, odgajivačnice, tim, zahtevi, predaja kartona, legla, javne stranice | 45 | ✅ spremno (azil odobrava operater — TS-ADM-002; odgajivački plan za sada postavlja programer) |
| [08-partneri.md](08-partneri.md) | PART — partneri u blizini, profil partnera, predlog veterinara | 23 | ✅ spremno |
| [09-admin.md](09-admin.md) | ADM — admin / operater: azili, partneri, statistika, Viber, moderacija | 26 | ✅ spremno |
| [10-sapa-pomoci.md](10-sapa-pomoci.md) | SAPA — Šapa pomoći: oglasi, donacije, poruke, prijave, blokiranje, isključenje | 52 | ✅ spremno |
| [11-whatsapp.md](11-whatsapp.md) | WA — WhatsApp kanal (lokalno lažno slanje, kod iz loga) | 13 | ✅ spremno (pravo slanje čeka Meta nalog) |
| [12-nocni-poslovi-i-backup.md](12-nocni-poslovi-i-backup.md) | JOB — noćni poslovi, nasledstvo, arhiva podataka, backup | 17 | ✅ spremno (poslove pokreće programer) |
| [13-placanje.md](13-placanje.md) | PAY — plaćanje preko Paddle-a, cene u evrima | 12 | ⏳ čeka Step 31 i Paddle sandbox |
| [14-produkcija.md](14-produkcija.md) | PROD — smoke test na produkciji posle deploy-a | 22 | ⏳ čeka prvi deploy i adresu sajta |
| **Ukupno** | | **399** (365 spremno + 34 čeka) | |

Kad Step 31 bude gotov, fajl 13 prelazi u ✅, a kad Ivana dopiše adresu produkcije, i fajl 14. U ovoj tabeli se tada ažuriraju status i broj scenarija (broj: `grep -c '^### TS-' <fajl>`).

## Okruženje i nalozi

- Lokalno: http://localhost:3000. Mejlovi stižu u Mailpit: http://127.0.0.1:54324. Push i WhatsApp se lokalno ne šalju, nego se samo upisuju u log servera.
- Lozinka za sve test naloge: `MojLjubimac123!`

| Nalog | Uloga |
|---|---|
| ivana.petrovic@mojljubimac.test | vlasnik, Premium (mesečni, aktivan), Novi Sad |
| marko.jovanovic@mojljubimac.test | vlasnik, Free, Beograd |
| jelena.nikolic@mojljubimac.test | vlasnik, Free, drugi vlasnik za domaćinstvo (član), Novi Sad |
| milica.stojanovic@mojljubimac.test | azil (čeka odobrenje operatera), Bečej |
| nikola.djordjevic@mojljubimac.test | odgajivačnica, Beograd |
| ana.markovic@mojljubimac.test | vlasnik + operater (admin), Novi Sad |

- Na produkciji test nalozi iz seed-a ne postoje, pa se nalozi prave registracijom, a ulogu operatera daje Ivana. Adresa sajta biće dopisana posle prvog deploy-a. Nalozi i očekivana ograničenja produkcije su u fajlu 14.
- Scenariji koji nešto brišu (nalog, ljubimca) izvršavaju se na **novim** nalozima, nikad na nalozima iz tabele.

## Kako se beleže rezultati

Svaki scenario se završava redom:

`**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____`

- **Prošao:** sve iz „Očekivani rezultat" se desilo.
- **Pao:** bar jedna stvar se razlikuje (pogrešan tekst, ponašanje, izgled). U napomenu upiši šta je drugačije i broj Issue-a sa greškom.
- **Blokiran:** scenario ne može da se izvrši (nedostaje preduslov, korak nije izgrađen, okruženje ne radi). U napomenu upiši razlog.

Izaberi jedan od dva načina za ceo ciklus i ne mešaj ih:

1. **Kopija fajlova po ciklusu.** Za svaki ciklus napravi folder `docs/qa/ciklusi/AAAA-MM-DD-<naziv>/` (npr. `2026-10-27-ciklus-1/`) i u njega kopiraj fajlove koje testiraš. U kopijama označavaj `☒` umesto `☐` i popunjavaj napomenu. Originalni fajlovi u ovom folderu ostaju prazni, kao šablon.
2. **Označavanje u Issue-u.** Otvori jedan GitHub Issue po ciklusu (naslov npr. „QA ciklus 1 — 27. 10. 2026."). Za svaki fajl napravi listu zadataka sa ID-jevima (`- [ ] TS-HH-001`). Kad scenario prođe, štikliraj ga. Za pao ili blokiran scenario dopiši ` — PAO: …` ili ` — BLOKIRAN: …` sa linkom na Issue greške.

Za svaku grešku otvori poseban Issue. U njega upiši ID scenarija, korake, šta se očekivalo, šta se desilo, snimak ekrana, pregledač i širinu ekrana.

Na kraju ciklusa upiši zbir u Issue ili u `README.md` foldera ciklusa: koliko je scenarija prošlo, palo i bilo blokirano.

## Preporučeni redosled prvog ciklusa

### 1. Smoke test (14 najvažnijih P1 scenarija)

Prvo izvrši ovih 14 scenarija. Ako neki padne, javi odmah, pre nastavka.

| # | ID | Šta proverava | Fajl |
|---|---|---|---|
| 1 | TS-AUTH-001 | Registracija vlasnika mejlom i lozinkom | 01 |
| 2 | TS-PET-001 | Prazno stanje i dodavanje prvog ljubimca | 02 |
| 3 | TS-PET-007 | Free limit: drugi aktivni ljubimac | 02 |
| 4 | TS-PET-015 | Nova vakcina sa datumom sledeće doze (i podsetnik) | 02 |
| 5 | TS-REM-014 | „Urađeno" iz liste, sa kartice „Danas" i sa kartona | 03 |
| 6 | TS-CARE-014 | Novi trenutak sa fotografijama i tekstom | 04 |
| 7 | TS-HH-007 | Prihvatanje poziva u domaćinstvo | 05 |
| 8 | TS-PREM-001 | Premium stranica „Plaćanje uskoro dostupno" | 06 |
| 9 | TS-ORG-025 | Slanje zahteva za udomljavanje sa javne stranice (azil mora biti odobren) | 07 |
| 10 | TS-PART-014 | Predlog veterinara u kartonu ljubimca bez veterinara | 08 |
| 11 | TS-ADM-002 | Operater odobrava azil iz admin dela | 09 |
| 12 | TS-SAPA-003 | Novi oglas „Prodajem" i validacija | 10 |
| 13 | TS-SAPA-006 | Poruka autoru oglasa i odgovor (vidi se posle osvežavanja) | 10 |
| 14 | TS-SAPA-010 | Moderacija: sakrij, isključi, vrati, odbaci | 10 |

### 2. Ostatak ciklusa

1. Fajlovi **01 → 02 → 03 → 04** po redu, jer ostali scenariji koriste naloge, ljubimce i podsetnike napravljene ovde.
2. **05 Domaćinstvo**, pa **06 Premium**. Scenarije isteka Premium-a ostavi za kraj fajla, jer posle njih programer vraća Premium.
3. **07 Organizacije** po redosledu iz „Pre početka" u fajlu: prvo azil na čekanju, pa odobrenje (kao Ana po TS-ADM-002 iz fajla 09, ili programer), pa ostalo.
4. **08 Partneri** (partnere u bazi priprema programer), pa **09 Admin** (unos partnera, odobravanje azila).
5. **10 Šapa pomoći** — posle odobrenja Miličinog azila (TS-ADM-002). Moderaciju u fajlu 09 (TS-ADM-019 … TS-ADM-023) radi kad u fajlu 10 napraviš prijave.
6. **11 WhatsApp** i **12 Noćni poslovi** — uz programera (kod iz loga, ručno pokretanje poslova, pomeranje datuma).
7. Na kraju ciklusa ponovo pokreni svih 14 scenarija iz smoke testa da proveriš da ništa nije pokvareno.
8. Fajl **13** se ne izvršava dok Step 31 nije gotov. Fajl **14** se izvršava na produkciji posle svakog deploy-a.
