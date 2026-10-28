# Vodič za QA — Moj Ljubimac

> Verzija: 26. 10. 2026. · Izvori: `docs/product/01-product-brief.md` (v1.7), `02-prd.md` (v1.7), `04-design-system.md` (v1.6), `05-api-integration-contract.md` (v1.3), `06-build-plan.md` (§3)

## Kome je namenjeno

Ovaj folder je namenjen **Jovani Vrtunić (QA)** — osobi koja ručno testira veb aplikaciju Moj Ljubimac pre javnog pokretanja. Sve što je ovde napisano izvedeno je iz produktne dokumentacije; svaki zahtev ima ID (FR-xx, BR-xx, UC-xx, E-xx, ekran Sxx) da se može pratiti do PRD-a i dizajna.

## Šta je aplikacija (ukratko)

1. Moj Ljubimac je veb aplikacija na srpskom (latinica) i engleskom u kojoj vlasnik vodi kompletan zdravstveni karton ljubimca: profil, vakcine, terapije, preglede sa prilozima i težinu.
2. Aplikacija sama pravi podsetnike (vakcine, doze, kontrole, obroci, rođendani) i šalje ih mejlom i push obaveštenjem, a Premium korisnicima i preko WhatsApp-a.
3. Članovi domaćinstva dele iste ljubimce i beleže svakodnevnu negu (obroci, stolica, trenuci, date doze).
4. Azili (besplatno) i odgajivačnice (plaćeni plan) vode mnogo životinja, udomljavanja, legla i predaju kartona novom vlasniku, uz javnu stranicu organizacije.
5. Lokalni partneri (veterinari, pet shopovi, grooming saloni, pet hoteli) prikazuju se u blizini korisnika, a „Šapa pomoći" je oglasna tabla zajednice sa porukama, prijavama i moderacijom — novac nikada ne prolazi kroz aplikaciju.

## Sadržaj foldera

| Fajl | Šta sadrži |
|---|---|
| [README.md](README.md) | Ovaj vodič: okruženja, nalozi, uloge, ciklus testiranja, šta nije spremno |
| [01-o-aplikaciji.md](01-o-aplikaciji.md) | Opis proizvoda za testera: problem, korisnici, 8 sposobnosti, Free / Premium / organizacije, kanali, jezici, spisak ekrana S01–S37 sa statusom |
| [02-slucajevi-koriscenja.md](02-slucajevi-koriscenja.md) | Svi slučajevi korišćenja (UC-01 … UC-13 iz PRD-a + dodatni QA slučajevi) sa tokovima, izuzecima i oblastima scenarija |
| [03-sablon-prijave-greske.md](03-sablon-prijave-greske.md) | Šablon za GitHub Issue, prioriteti P1–P3, labele, snimci ekrana i šta se NE prijavljuje |
| [04-automatsko-testiranje.md](04-automatsko-testiranje.md) | Podešavanje računara (Git, Node, Docker, VS Code), pokretanje lokalne aplikacije i svih automatskih testova, pisanje Playwright testova, gde se prijavljuju greške |
| [test-scenariji/README.md](test-scenariji/README.md) | Pregled test scenarija po oblastima (AUTH, PET, REM, CARE, HH, PREM, ORG, PART, ADM, SAPA, WA, JOB) |

## Okruženja

| Okruženje | Adresa | Mejlovi | Push / WhatsApp | Nalozi |
|---|---|---|---|---|
| **Lokalno (sada)** | http://localhost:3000 | Mailpit: http://127.0.0.1:54324 | Ne šalju se — samo zapis u logu | Test nalozi iz tabele ispod |
| **Produkcija (posle prvog deploy-a)** | Adresa će biti dopisana | Pravi mejlovi na pravu adresu | Prema podešavanjima | Nalozi se prave registracijom; test nalozi iz seed-a **ne postoje** |

## Test nalozi (lokalno)

Lozinka za sve naloge: **`MojLjubimac123!`**

| Mejl | Tip naloga | Plan / stanje | Grad | Za šta se koristi |
|---|---|---|---|---|
| ivana.petrovic@mojljubimac.test | Vlasnik | Premium (mesečni, aktivan) | Novi Sad | Premium funkcije, vlasnica domaćinstva, PDF, neograničeni limiti |
| marko.jovanovic@mojljubimac.test | Vlasnik | Free | Beograd | Free limiti i Premium ponude (PremiumLock), primalac predaje kartona |
| jelena.nikolic@mojljubimac.test | Vlasnik | Free | Novi Sad | Drugi vlasnik — pozvani član domaćinstva (Ivana je poziva) |
| milica.stojanovic@mojljubimac.test | Azil | Čeka odobrenje operatera | Bečej | Stanje „azil na čekanju" (sve samo za čitanje) i kasnije tokovi azila |
| nikola.djordjevic@mojljubimac.test | Odgajivačnica | — | Beograd | Legla, upiti, cene, javna stranica odgajivačnice |
| ana.markovic@mojljubimac.test | Vlasnik + Operater | — | Novi Sad | Admin deo `/admin` (S26) — čeka Step 28 |

> Napomena: Premium se do Step 31 može dobiti samo kroz seed podatke u lokalnoj bazi. Novi nalozi koje sama napraviš uvek su Free.

## Tipovi naloga i uloge

Svaki korisnik ima **tačno jedan tip naloga**: Vlasnik, Azil ili Odgajivačnica (BR-30). Članstvo u domaćinstvu ili timu organizacije je **dodatna uloga** i ne menja tip naloga (BR-53).

| Uloga | Ko je to | Šta sme | Šta ne sme | Kako je dobiti za test |
|---|---|---|---|---|
| **Vlasnik — Free** | Vlasnik bez pretplate | Sve osnovno: 1 aktivan ljubimac, 2 uspomene, 10 priloga i 5 trenutaka po ljubimcu, mejl i push | PDF izvoz, domaćinstvo, WhatsApp/Viber, uklanjanje logoa (BR-01) | `marko.jovanovic`, `jelena.nikolic` ili novi nalog |
| **Vlasnik — Premium** | Vlasnik sa aktivnim Premium-om | Bez limita, PDF, domaćinstvo, WhatsApp (BR-02) | — | `ivana.petrovic` |
| **Član domaćinstva** | Korisnik kog je Premium vlasnik pozvao | Dodaje težinu, označava date doze, unosi obroke/stolicu, dodaje trenutke, označava podsetnike kao urađene (BR-22); menja/briše samo svoje unose (BR-23) | Vakcine, terapije, pregledi, prilozi, podsetnici — samo pregled; brisanje ljubimaca, pozivanje članova, pretplata (BR-25) | Ivana poziva Jelenu u S13 |
| **Azil — Admin** | Član tima azila sa ulogom Admin | Sve u organizaciji: životinje, prijem, statusi, zahtevi za udomljavanje, tim, javni profil, predaja kartona | Lične ljubimce na nalogu organizacije (BR-33) | `milica.stojanovic` (posle odobrenja) |
| **Azil — Volonter** | Član tima azila sa ulogom Volonter | Dodaje i menja zdravstvene unose i negu | Brisanje životinja, odluke o zahtevima, upravljanje timom, izmena javnog profila (BR-34, FR-60) | Admin azila poziva npr. Marka u tim kao Volontera (S20 → S14) |
| **Odgajivačnica — Admin** | Član tima odgajivačnice sa ulogom Admin | Životinje, legla, cene, upiti, tim, javni profil, predaja kartona (uz aktivan odgajivački plan, BR-11) | Bez aktivnog plana — sve samo za čitanje (E-21) | `nikola.djordjevic` |
| **Odgajivačnica — Volonter** | Član tima sa ulogom Volonter | Zdravstveni unosi i nega | Isto kao volonter azila | Nikola poziva npr. Jelenu u tim |
| **Operater** | Osoba koja vodi proizvod | Admin deo: odobrava azile, partneri, statistika klikova, kanal Viber, moderacija Šape pomoći | — | `ana.markovic` (⏳ čeka Step 28) |
| **Posetilac** | Neko ko nije prijavljen | Javni trenutak `/t/…`, javna stranica organizacije `/o/…`, pravne strane, pregled oglasa Šape pomoći | Sve što traži nalog (zahtev za udomljavanje, poruka, donacija) | Odjavi se ili koristi privatni prozor |

## Kako se radi ciklus testiranja

1. **Uzmi scenario.** Otvori fajl oblasti u `test-scenariji/` i izaberi scenario (npr. `TS-PET-004`). Proveri da oblast nije označena sa „⏳ Čeka Step NN" — takve scenarije za sada preskoči.
2. **Pripremi preduslove.** Prijavi se nalogom iz polja **Nalog**, ispuni **Preduslove** (npr. ljubimac postoji, nalog je Free).
3. **Izvrši korake** redom, tačno kako piše. Za ključne ekrane ponovi proveru i na širini telefona (375 px — u alatima pregledača uključi prikaz za mobilni).
4. **Uporedi sa očekivanim rezultatom.** Kad je tekst poruke naveden u navodnicima „…", mora se poklapati od reči do reči (i na engleskom, kad se jezik prebaci).
5. **Označi rezultat** u scenariju: ☐ Prošao · ☐ Pao · ☐ Blokiran (ne može da se izvrši zbog druge greške ili nedostajuće funkcije) i upiši napomenu.
6. **Za svaku grešku otvori GitHub Issue** po šablonu iz [03-sablon-prijave-greske.md](03-sablon-prijave-greske.md): labela **`bug`** + labela prioriteta (**`P1`**, **`P2`** ili **`P3`**), ID scenarija u naslovu i telu.
7. **Upiši broj Issue-a** u napomenu scenarija (npr. „Pao — #42"), da se zna šta treba ponovo proveriti kad greška bude ispravljena.
8. **Ponovna provera:** kad Ivana javi da je greška ispravljena, ponovi isti scenario i zatvori Issue komentarom „Provereno — prošlo".

## Šta trenutno nije spremno (stanje 26. 10. 2026.)

Gotovo je i spremno za test: **Step 01–27** (registracija, prijava, profil, jezik, ljubimci, karton, uspomene, PDF, podsetnici sa mejlom i push-om, dnevnik nege, trenuci, domaćinstvo, Premium stranica bez plaćanja, izvoz podataka i brisanje naloga, organizacije, zahtevi i predaja kartona, legla i javne stranice, partneri).

Čeka izgradnju — scenariji postoje, ali su označeni „⏳ Čeka Step NN":

| Step | Šta | Ekrani / delovi |
|---|---|---|
| 28 | Admin / operater: odobravanje azila, partneri, statistika, kanal Viber | S26 `/admin` |
| 28a–28c | „Šapa pomoći": oglasi, poruke, prijave, blokiranje, moderacija, podaci za donacije | S32–S37, kartica *Donacije* u S29, kartica *Poruke* u S12, tab *Moderacija* u S26 |
| 29 | WhatsApp kanal (povezivanje broja, slanje podsetnika, „Urađeno" iz poruke) | Deo *Kanali* i WhatsApp u S12 |
| 30 | Noćni poslovi: istek Premium-a i obaveštenja 30/7/1 dan, trajno brisanje naloga posle 30 dana, nasleđivanje domaćinstva i organizacije | — (pozadinski poslovi) |
| 30a | Backup baze i arhiva izvoza podataka (fajl za preuzimanje) | S19 — priprema arhive |
| 31 | Plaćanje i cene (čeka izbor provajdera plaćanja — OQ-11, i cene — OQ-03) | S17 — kupovina Premium-a, probni period, obnova |
| 32 | Završna provera pre pokretanja | — |

Do Step 28 odobrenje azila nije moguće iz aplikacije — ako ti treba odobren azil, zamoli Ivanu da ga odobri ručno.

## Kontakt

**Ivana (vlasnica proizvoda)** — sva pitanja o tome kako nešto treba da radi, nejasni zahtevi, pristup okruženjima i odobrenja. Ako dokumentacija i aplikacija kažu različito, ne pretpostavljaj — prijavi kao pitanje ili grešku i označi Ivanu.

## Gde se prijavljuju greške

U GitHub repozitorijumu: **https://github.com/pussycat993-gif/moj-ljubimac/issues → New issue → „Prijava greške"** (forma je već pripremljena). Ivana dobija obaveštenje za svaki novi Issue. Za pitanja i predloge koristi formu **„Pitanje ili predlog"**. Detalji u [04-automatsko-testiranje.md](04-automatsko-testiranje.md) §9 i [03-sablon-prijave-greske.md](03-sablon-prijave-greske.md).
