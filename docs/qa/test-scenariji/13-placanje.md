# 13 — Plaćanje i cene (oblast PAY)

**Status:** ⏳ Čeka Step 31 i Paddle sandbox. Step 31 je u izradi: provajder plaćanja je **Paddle**, a cene su u evrima. Scenarije **ne izvršavaj** dok Step 31 nije označen ✅ u `docs/product/06-build-plan.md` §3 i dok programer ne potvrdi da je Paddle sandbox (test okruženje Paddle-a, bez pravog novca) povezan. Kad bude spremno, pročitaj fajl ponovo i uporedi tekstove sa aplikacijom; tačni tekstovi ekrana biće dopunjeni posle Step 31.
**Ekrani:** S17 Premium (`/premium`), S18 Profil i pretplata (`/profil`), S20 / S22 (odgajivački plan), Paddle stranica za plaćanje i Paddle portal za upravljanje pretplatom
**Zahtevi:** FR-37, FR-38, FR-39, FR-42, BR-07, BR-08, BR-11, BR-28, E-15, E-21, EP-44 … EP-46, EP-49, UC-06
**Okruženje:** lokalno http://localhost:3000 · Mailpit http://127.0.0.1:54324 · lozinka `MojLjubimac123!`

**Cene (odluka vlasnice):**

| Plan | Mesečno | Godišnje | Probni period |
|---|---|---|---|
| Premium (vlasnik) | 3 € | 30 € | 7 dana besplatno, samo jednom po nalogu |
| Odgajivački plan | 11 € | 110 € | nema |

**Pre početka:**
- Plaća se isključivo **test karticama Paddle sandbox-a** (npr. `4242 4242 4242 4242`, bilo koji budući datum i bilo koji CVC). Karticu koja odbija plaćanje daje programer. Nikad ne unosi pravu karticu.
- Potvrdu plaćanja aplikaciji šalje Paddle (webhook). Lokalno to radi samo ako ga je programer podesio — ako se posle plaćanja ništa ne promeni u aplikaciji, prvo pitaj programera.
- Obnovu i istek perioda u sandbox-u ne čekaš 30 dana: programer pomera datume ili pokreće obnovu ručno.
- Za kupovinu koristi **nove** naloge (npr. `qa.pay1@mojljubimac.test`), jer probni period važi samo jednom.
- Dok Paddle nije podešen, važi TS-PREM-001 (fajl 06) i TS-PAY-010.

---

### TS-PAY-001 — Premium mesečno sa 7 dana besplatno
**Zahtevi:** FR-37, BR-07 (ekrani S17, S18) · **Prioritet:** P1 (kritično) · **Nalog:** novi vlasnički nalog (`qa.pay1@mojljubimac.test`)
**Preduslovi:** Nalog nikad nije koristio probni period. Paddle sandbox je povezan.
**Koraci:**
1. Na `/premium` izaberi „Mesečno" i klikni „Probaj 7 dana besplatno".
2. Na Paddle stranici unesi test karticu `4242 4242 4242 4242` i potvrdi.
3. Vrati se u aplikaciju i otvori `/profil`.
4. Probaj neku Premium funkciju (npr. dodaj drugog aktivnog ljubimca ili PDF izvoz).
**Očekivani rezultat:** Paddle prikazuje 3 € mesečno i da se prvih 7 dana ne naplaćuje ništa. Posle potvrde Premium je aktivan odmah. S18 prikazuje probni period, datum prve naplate (danas + 7 dana) i iznos 3 €. Premium funkcije rade bez ponude „Dostupno u Premiumu".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PAY-002 — Iskorišćen probni period: naplata odmah
**Zahtevi:** FR-37, BR-07, E-15 (ekran S17) · **Prioritet:** P1 (kritično) · **Nalog:** nalog sa iskorišćenim probnim periodom (npr. `qa.pay1` posle TS-PAY-007)
**Preduslovi:** Nalog je već jednom koristio probu i sada je na Free planu.
**Koraci:**
1. Otvori `/premium`.
2. Klikni dugme za pretplatu i plati test karticom.
**Očekivani rezultat:** Ne nudi se „Probaj 7 dana besplatno", nego piše „Probni period je već iskorišćen na ovom nalogu. Otkazuješ bilo kad u profilu.". Na Paddle stranici prva naplata je odmah (3 € ili 30 €), a Premium je aktivan posle plaćanja.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PAY-003 — Automatska obnova i neuspela naplata
**Zahtevi:** FR-37, FR-38, BR-08, EP-46, EP-49 (ekran S18) · **Prioritet:** P1 (kritično) · **Nalog:** Premium nalog iz TS-PAY-001
**Preduslovi:** **Traži od programera:** da u Paddle sandbox-u izazove obnovu pretplate (ili pomeri kraj perioda i pokrene obnovu).
**Koraci:**
1. Programer pokreće obnovu sa ispravnom test karticom. Otvori `/profil`.
2. Programer menja karticu na onu koja odbija naplatu i ponovo pokreće obnovu. Pogledaj Mailpit i `/profil`.
**Očekivani rezultat:** Ispravna kartica produžava period za mesec dana i S18 prikazuje novi datum. Neuspela naplata šalje mejl „Naplata nije uspela" sa linkom na `/premium`, a posle kraja perioda važe Free pravila (kao TS-PREM-011).
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PAY-004 — Odgajivački plan (bez probnog perioda)
**Zahtevi:** FR-42, BR-11, BR-51, E-21 (ekrani S20, S22) · **Prioritet:** P2 (važno) · **Nalog:** nova odgajivačnica (`qa.odgajivac@mojljubimac.test`)
**Preduslovi:** Odgajivačnica nema plan.
**Koraci:**
1. Kao admin odgajivačnice pokreni kupovinu odgajivačkog plana (mesečno).
2. Plati test karticom.
3. Otvori „Legla" i javnu stranicu.
**Očekivani rezultat:** Ne nudi se probni period; prva naplata je odmah, 11 €. Posle plaćanja nestaje traka „Odgajivački plan nije aktivan — sve možeš samo da pregledaš.", a legla, cene i javna stranica rade.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PAY-005 — Prikaz cena u evrima
**Zahtevi:** FR-36, FR-37, EP-44, OQ-03 (ekrani S17, S18) · **Prioritet:** P1 (kritično) · **Nalog:** marko.jovanovic@mojljubimac.test, nikola.djordjevic@mojljubimac.test
**Preduslovi:** Paddle je podešen i cene su upisane.
**Koraci:**
1. Kao Marko otvori `/premium` i prebaci „Mesečno / Godišnje".
2. Prebaci jezik na „English" i ponovi.
3. Kao Nikola otvori mesto gde se kupuje odgajivački plan.
**Očekivani rezultat:** Premium: 3 € mesečno i 30 € godišnje. Odgajivački plan: 11 € mesečno i 110 € godišnje. Cene su u evrima (ne u dinarima) i na oba jezika iste. Na stranici više nema „Plaćanje uskoro dostupno" ni „Cena će biti objavljena uskoro.". Ista cena se vidi i na Paddle stranici za plaćanje.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PAY-006 — Premium godišnje sa 7 dana besplatno
**Zahtevi:** FR-37, BR-07 (ekrani S17, S18) · **Prioritet:** P1 (kritično) · **Nalog:** novi vlasnički nalog (`qa.pay2@mojljubimac.test`)
**Preduslovi:** Nalog nikad nije koristio probni period.
**Koraci:**
1. Na `/premium` izaberi „Godišnje" i klikni „Probaj 7 dana besplatno".
2. Plati test karticom.
3. Otvori `/profil`.
**Očekivani rezultat:** Paddle prikazuje 30 € godišnje i 7 dana bez naplate. Premium je aktivan odmah. S18 prikazuje godišnji plan, probni period i datum prve naplate (danas + 7 dana).
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PAY-007 — Proba samo jednom: otkazivanje tokom probe
**Zahtevi:** FR-37, FR-38, BR-07, E-15 (ekrani S18, S17) · **Prioritet:** P1 (kritično) · **Nalog:** `qa.pay1@mojljubimac.test` (iz TS-PAY-001, u probnom periodu)
**Preduslovi:** Nalog je u probnom periodu.
**Koraci:**
1. Otkaži pretplatu (iz profila / Paddle portala, TS-PAY-008).
2. **Traži od programera:** da pomeri kraj probe na juče (i pokrene posao pretplata).
3. Otvori `/profil` i `/premium`.
**Očekivani rezultat:** Tokom probe ništa nije naplaćeno. Posle kraja probe nalog je na Free planu. Na `/premium` se proba više ne nudi (TS-PAY-002).
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PAY-008 — Otkazivanje kroz Paddle portal
**Zahtevi:** FR-38, BR-08 (ekran S18) · **Prioritet:** P1 (kritično) · **Nalog:** `qa.pay2@mojljubimac.test` (iz TS-PAY-006)
**Preduslovi:** Nalog ima aktivan Premium.
**Koraci:**
1. Na `/profil` otvori upravljanje pretplatom (vodi na Paddle portal).
2. U Paddle portalu otkaži pretplatu.
3. Vrati se u aplikaciju i osveži `/profil`.
**Očekivani rezultat:** Paddle portal se otvara za tačno tu pretplatu. Posle otkazivanja S18 prikazuje da se pretplata ne obnavlja i da Premium traje do kraja plaćenog perioda (datum). Do tog datuma Premium funkcije rade.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PAY-009 — Odbijeno plaćanje pri kupovini
**Zahtevi:** FR-37, EP-45, EP-46 (ekran S17) · **Prioritet:** P2 (važno) · **Nalog:** novi vlasnički nalog (`qa.pay3@mojljubimac.test`)
**Preduslovi:** Programer je dao test karticu koja odbija plaćanje.
**Koraci:**
1. Na `/premium` pokreni kupovinu i unesi karticu koja odbija plaćanje.
2. Zatvori Paddle prozor i vrati se u aplikaciju.
**Očekivani rezultat:** Paddle prikazuje da plaćanje nije uspelo i nudi drugu karticu. Nalog ostaje Free (S18 bez Premium-a), proba nije potrošena i može ponovo da se pokuša.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PAY-010 — „Plaćanje uskoro dostupno" dok Paddle nije podešen
**Zahtevi:** FR-37, EP-45 `payment_provider_unavailable`, CR-22 (ekran S17) · **Prioritet:** P1 (kritično) · **Nalog:** marko.jovanovic@mojljubimac.test
**Preduslovi:** Okruženje bez Paddle podešavanja (npr. produkcija pre podešavanja, ili programer lokalno isključi Paddle).
**Koraci:**
1. Otvori `/premium` i pokušaj kupovinu.
**Očekivani rezultat:** Stranica izgleda kao u TS-PREM-001: kartica „Plaćanje uskoro dostupno", isključeno dugme „Plaćanje uskoro dostupno", bez Paddle prozora i bez tehničke greške.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PAY-011 — Kupovina vraća domaćinstvo i limite
**Zahtevi:** FR-32, FR-39, BR-28, EP-46 (ekrani S13, S01, S18) · **Prioritet:** P2 (važno) · **Nalog:** vlasnik sa isteklim Premium-om i domaćinstvom samo za čitanje (kao TS-JOB-003) + njegov član
**Preduslovi:** Probni period je već iskorišćen; domaćinstvo je samo za čitanje.
**Koraci:**
1. Vlasnik kupuje Premium (plaća odmah).
2. Vlasnik i član osvežavaju `/domacinstvo` i `/ljubimci`.
**Očekivani rezultat:** Posle plaćanja domaćinstvo više nije samo za čitanje (nestaju trake iz TS-HH-025 i TS-HH-026), članovi ponovo beleže negu, a vlasnik može da dodaje preko Free limita.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PAY-012 — Azil ne plaća i ne vidi Premium
**Zahtevi:** BR-11, BR-32, FR-42 (ekrani S17, S20) · **Prioritet:** P3 (sitno) · **Nalog:** milica.stojanovic@mojljubimac.test
**Preduslovi:** Azil je odobren.
**Koraci:**
1. Otvori `/premium` i potraži bilo kakvu kupovinu u okviru organizacije.
**Očekivani rezultat:** Azil nema ponudu za plaćanje — azili su besplatni. `/premium` se ponaša kao u TS-PREM-006 (nalog organizacije ne vidi Premium za vlasnike).
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____
