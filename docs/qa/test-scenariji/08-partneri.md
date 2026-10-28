# 08 — Partneri u blizini i predlog veterinara (oblast PART)

**Status:** ✅ spremno za test (Step 27 gotov). Admin ekran za unos partnera i statistiku klikova stiže tek sa Step 28 (fajl 09, sekcija ADM).
**Ekrani:** S24 Partneri u blizini (`/partneri`), S25 Profil partnera (`/partneri/[id]`), S03 Karton ljubimca (blok „Predlog veterinara u blizini")
**Zahtevi:** FR-52 … FR-56, FR-58 (beleženje klika), BR-40 … BR-44, E-22 … E-24, UC-10
**Okruženje:** lokalno http://localhost:3000 · lozinka `MojLjubimac123!`

**Pre početka:**
- Partnere za sada unosi programer (seed ili baza), jer admin stiže sa Step 28. Pre testa proveri sa programerom da u **Novom Sadu** postoje bar: 4 veterinara (bar 1 istaknut), 1 pet shop, 1 grooming salon i 1 pet hotel. Treba da postoji i jedan partner bez mejla i sajta i jedan partner kome je „plaćeno do" u prošlosti.
- `ivana.petrovic@mojljubimac.test` ima grad Novi Sad, a `marko.jovanovic@mojljubimac.test` Beograd.
- Kad pregledač pita za lokaciju, odgovaraj kako scenario kaže. Dozvolu možeš da poništiš u podešavanjima sajta (ikonica katanca pored adrese).

---

### TS-PART-001 — Lista partnera po gradu iz profila
**Zahtevi:** FR-52, FR-53, BR-42, EP-64 (ekran S24) · **Prioritet:** P1 (kritično) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Lokacija u pregledaču nije dozvoljena.
**Koraci:**
1. Otvori `/partneri`.
2. Pogledaj red sa lokacijom i redosled kartica.
**Očekivani rezultat:** Naslov je „Partneri u blizini". Ispod piše „Udaljenost od grada iz profila: Novi Sad" i postoji dugme „Koristi moju lokaciju". Prvo ide sekcija „Istaknuto", pa sekcija „Po udaljenosti", gde su partneri poređani od najbližeg ka najdaljem. Svaka kartica ima oznaku vrste, udaljenost (npr. „1,2 km") i dugmad za brzi kontakt.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PART-002 — Istaknuti partneri su prvi, najviše 3 po vrsti
**Zahtevi:** FR-52, BR-41 (ekran S24) · **Prioritet:** P2 (važno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** U Novom Sadu postoji bar jedan istaknut veterinar koji **nije** najbliži.
**Koraci:**
1. Otvori `/partneri`, izaberi „Veterinari" i uporedi redosled sa udaljenostima.
**Očekivani rezultat:** Istaknuti veterinar je u sekciji „Istaknuto" iznad ostalih, čak i kad je dalji. U „Istaknuto" nikad nema više od 3 partnera iste vrste. Isti partner se ne pojavljuje dva puta.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PART-003 — Filter po vrsti partnera
**Zahtevi:** FR-52, FR-54 (ekran S24) · **Prioritet:** P1 (kritično) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** —
**Koraci:**
1. Klikni redom čipove „Veterinari", „Pet shopovi", „Grooming", „Pet hoteli" i „Sve".
**Očekivani rezultat:** Svaki čip prikazuje samo partnere te vrste, sa odgovarajućom oznakom vrste na kartici. „Sve" prikazuje sve. Izabrani čip se jasno razlikuje (ne samo bojom).
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PART-004 — Udaljenost od trenutne lokacije
**Zahtevi:** FR-53, BR-42 (ekran S24) · **Prioritet:** P1 (kritično) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Pregledač ima lokaciju (prava ili simulirana u DevTools → Sensors, npr. Novi Sad, Liman).
**Koraci:**
1. Klikni „Koristi moju lokaciju" i dozvoli lokaciju.
2. Uporedi udaljenosti sa onima iz TS-PART-001.
**Očekivani rezultat:** Tekst se menja u „Udaljenost od tvoje trenutne lokacije", a udaljenosti i redosled „Po udaljenosti" se preračunavaju. Istaknuti partneri ostaju na vrhu.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PART-005 — Odbijena lokacija: ostaje grad iz profila
**Zahtevi:** FR-53, E-22 (ekran S24) · **Prioritet:** P2 (važno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Dozvola za lokaciju je poništena.
**Koraci:**
1. Klikni „Koristi moju lokaciju" i izaberi „Blokiraj".
**Očekivani rezultat:** Lista ostaje prema gradu iz profila („Udaljenost od grada iz profila: Novi Sad"). Nema tehničke greške ni praznog ekrana.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PART-006 — Bez grada u profilu i bez lokacije
**Zahtevi:** FR-53, odluka vlasnice za Step 27 (ekran S24) · **Prioritet:** P1 (kritično) · **Nalog:** novi nalog (vlasnik bez grada)
**Preduslovi:** Novi vlasnički nalog nema grad u profilu. Lokacija nije dozvoljena.
**Koraci:**
1. Otvori `/partneri`.
2. Klikni „Otvori profil", izaberi grad „Novi Sad" i sačuvaj.
3. Vrati se na `/partneri`.
**Očekivani rezultat:** Prikazuje se prazno stanje „Dodaj grad u profil" sa tekstom „Partnere u blizini prikazujemo prema lokaciji ili gradu iz profila." i dugmetom „Otvori profil", koje vodi na `/profil`. Posle čuvanja grada lista partnera iz Novog Sada se prikazuje normalno.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PART-007 — Grad bez partnera
**Zahtevi:** FR-52, EP-64 (ekran S24) · **Prioritet:** P2 (važno) · **Nalog:** marko.jovanovic@mojljubimac.test (ili nalog čiji grad nema partnere)
**Preduslovi:** U Markovom gradu nema partnera, ili ih nema za izabranu vrstu.
**Koraci:**
1. Otvori `/partneri` (po potrebi izaberi vrstu koje nema).
**Očekivani rezultat:** Prikazuje se „Još nema partnera u tvom gradu" i „Radimo na tome. U međuvremenu probaj drugu vrstu ili uključi lokaciju.".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PART-008 — Partner sa isteklim plaćanjem se ne vidi
**Zahtevi:** FR-52, FR-57, BR-40, E-23, EP-65 (ekrani S24, S25) · **Prioritet:** P1 (kritično) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Partner „X" u Novom Sadu ima „plaćeno do" u prošlosti. Zapiši njegov ID od programera.
**Koraci:**
1. Otvori `/partneri` i potraži partnera X (svi čipovi).
2. Otvori direktno `/partneri/{id partnera X}`.
3. Zamoli programera da pomeri „plaćeno do" na sutra i osveži listu.
**Očekivani rezultat:** Partner X se ne pojavljuje ni u jednoj listi. Direktna adresa prikazuje stanje greške („nije pronađeno"). Posle koraka 3 partner se ponovo vidi.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PART-009 — Profil partnera
**Zahtevi:** FR-54, FR-55, EP-65 (ekran S25) · **Prioritet:** P1 (kritično) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Partner ima sve podatke (telefon, kanal za poruke, mejl, sajt, Instagram, radno vreme, opis).
**Koraci:**
1. Na `/partneri` klikni ime partnera.
2. Pogledaj zaglavlje, „O nama", „Radno vreme", „Kontakt" i „Brzi kontakt".
**Očekivani rezultat:** Zaglavlje ima logo ili inicijale, naziv, vrstu, adresu, grad i udaljenost. „Radno vreme" prikazuje sve dane (Ponedeljak … Nedelja), a današnji dan je označen sa „· danas" (zatvoren dan: „Danas zatvoreno"). U „Brzi kontakt" su četiri velika dugmeta: „Pozovi", „Poruka ({kanal}, npr. WhatsApp)", „Pošalji mejl" i „Poseti sajt". Postoji i link „Uputstva do adrese". Link „Partneri" vodi nazad na listu.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PART-010 — „Pozovi" otvara poziv i beleži klik
**Zahtevi:** FR-55, FR-58, EP-66 (ekrani S24, S25) · **Prioritet:** P2 (važno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** —
**Koraci:**
1. Na kartici partnera u listi klikni „Pozovi".
2. Na profilu istog partnera klikni „Pozovi".
3. Zamoli programera da proveri tabelu klikova (`partner_clicks`).
**Očekivani rezultat:** Otvara se aplikacija za poziv (na računaru pregledač nudi program za poziv) sa tačnim brojem partnera. Programer vidi 2 nova klika tipa „call" za tog partnera i tvoj nalog. Ako beleženje klika ne uspe, poziv se ipak otvara.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PART-011 — „Poruka" ide na kanal koji je partner izabrao
**Zahtevi:** FR-55, BR-44 (ekran S25) · **Prioritet:** P2 (važno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Jedan partner ima kanal WhatsApp, a drugi SMS ili Viber.
**Koraci:**
1. Kod prvog partnera klikni „Poruka (WhatsApp)".
2. Kod drugog klikni dugme za poruku.
**Očekivani rezultat:** Svaki put se otvara kanal naveden u nazivu dugmeta (WhatsApp, Viber ili SMS), sa brojem za poruke tog partnera. Taj broj može da se razlikuje od broja za pozive.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PART-012 — „Pošalji mejl" i „Poseti sajt"
**Zahtevi:** FR-55 (ekrani S24, S25) · **Prioritet:** P2 (važno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Partner ima mejl i sajt. Sajt je upisan bez `https://` (npr. `drvet.rs`).
**Koraci:**
1. Klikni „Pošalji mejl".
2. Klikni „Poseti sajt".
**Očekivani rezultat:** Mejl otvara program za poštu sa adresom partnera. Sajt se otvara na `https://drvet.rs`, a ne kao putanja unutar aplikacije.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PART-013 — Partner bez mejla, sajta ili kanala za poruke
**Zahtevi:** FR-55, E-24 (ekrani S24, S25) · **Prioritet:** P2 (važno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Partner ima samo telefon (bez mejla, sajta i kanala za poruke).
**Koraci:**
1. Pogledaj njegovu karticu u listi i otvori profil.
**Očekivani rezultat:** Prikazano je samo „Pozovi". Dugmad „Poruka", „Mejl"/„Pošalji mejl" i „Sajt"/„Poseti sajt" ne postoje (nisu ni siva ni isključena). Raspored ne izgleda polomljeno.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PART-014 — Predlog veterinara u kartonu ljubimca bez veterinara
**Zahtevi:** FR-56, BR-43, EP-64 (ekran S03) · **Prioritet:** P1 (kritično) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Ivanin ljubimac nema upisan „Moj veterinar".
**Koraci:**
1. Otvori karton tog ljubimca i pogledaj bočni deo (na telefonu ispod sadržaja).
2. Klikni ime prvog veterinara.
3. Vrati se i klikni „Svi partneri →".
**Očekivani rezultat:** Umesto kartice „Moj veterinar" stoji blok „Predlog veterinara u blizini" sa **najviše 2** veterinara (istaknuti prvi, pa najbliži). Uz svakog stoje ime (link na profil), „udaljenost · adresa" i ikonica za poziv. Nikad se ne predlažu pet shop, grooming salon ili pet hotel. Ime vodi na S25, a „Svi partneri →" na `/partneri`.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PART-015 — Ljubimac sa veterinarom nema predlog
**Zahtevi:** FR-56, BR-43 (ekran S03) · **Prioritet:** P1 (kritično) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Ljubimac iz TS-PART-014.
**Koraci:**
1. Izmeni ljubimca i upiši „Moj veterinar" (ime i telefon), pa sačuvaj.
2. Otvori karton.
3. Obriši telefon veterinara i ponovo otvori karton.
**Očekivani rezultat:** Blok predloga nestaje i prikazuje se kartica „Moj veterinar" sa imenom i dugmetom „Pozovi". Bez telefona kartica i dalje postoji, ali bez dugmeta „Pozovi".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PART-016 — Predlog u kartonu kad nema grada ni lokacije
**Zahtevi:** FR-56, odluka vlasnice za Step 27 (ekran S03) · **Prioritet:** P2 (važno) · **Nalog:** novi nalog bez grada (iz TS-PART-006, pre dodavanja grada)
**Preduslovi:** Nalog nema grad i ima ljubimca bez veterinara.
**Koraci:**
1. Otvori karton ljubimca.
**Očekivani rezultat:** Blok „Predlog veterinara u blizini" se ne prikazuje. Ostatak kartona radi normalno, bez greške.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PART-017 — Predlog se ne prikazuje za deljene ljubimce i životinje organizacije
**Zahtevi:** FR-56, odluka vlasnice za Step 27 (ekran S03) · **Prioritet:** P3 (sitno) · **Nalog:** jelena.nikolic@mojljubimac.test (član domaćinstva), milica.stojanovic@mojljubimac.test
**Preduslovi:** Deljeni ljubimac nema veterinara. Životinja azila nema veterinara.
**Koraci:**
1. Kao Jelena otvori karton deljenog ljubimca.
2. Kao Milica otvori karton životinje azila.
**Očekivani rezultat:** U oba kartona nema bloka „Predlog veterinara u blizini". Predlog postoji samo za lične ljubimce vlasnika.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PART-018 — Traka „nema upisanog veterinara" na listi partnera
**Zahtevi:** FR-56 (ekran S24) · **Prioritet:** P2 (važno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Aktivni ljubimac (npr. Maks) nema veterinara.
**Koraci:**
1. Otvori `/partneri`.
2. Klikni „Pogledaj veterinare".
3. Osveži stranicu i klikni „Ne sada".
**Očekivani rezultat:** Iznad liste stoji traka „{ime} nema upisanog veterinara" sa tekstom „Evo veterinara u blizini — izaberi jednog i dodaj ga u karton.". „Pogledaj veterinare" uključuje filter „Veterinari", a „Ne sada" sklanja traku.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PART-019 — Udaljenost sa lokacije prelazi na profil partnera
**Zahtevi:** FR-53, odluka vlasnice za Step 27 (ekrani S24, S25) · **Prioritet:** P3 (sitno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Lokacija je dozvoljena i uključena na S24.
**Koraci:**
1. Zapiši udaljenost partnera na kartici i otvori njegov profil.
2. Isključi lokaciju (vrati na grad iz profila) i ponovo otvori profil.
**Očekivani rezultat:** U koraku 1 profil prikazuje istu udaljenost kao kartica (adresa sadrži `?lat=…&lng=…`). U koraku 2 udaljenost se računa od grada iz profila.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PART-020 — Partneri nisu dostupni bez prijave
**Zahtevi:** EP-64, EP-65 (ekrani S24, S25) · **Prioritet:** P2 (važno) · **Nalog:** bez prijave
**Preduslovi:** Privatni prozor.
**Koraci:**
1. Otvori `/partneri`.
2. Otvori `/partneri/{id}` jednog partnera.
**Očekivani rezultat:** U oba slučaja aplikacija traži prijavu (preusmerava na `/prijava`). Podaci partnera se ne prikazuju.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PART-021 — Partneri na engleskom
**Zahtevi:** FR-35, NFR-05 (ekrani S24, S25, S03) · **Prioritet:** P2 (važno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** —
**Koraci:**
1. Prebaci jezik na English i otvori `/partneri`, jedan profil partnera i karton ljubimca bez veterinara.
2. Na `/partneri` pod novim nalogom bez grada proveri prazno stanje.
**Očekivani rezultat:** Svi natpisi su na engleskom (čipovi vrsta, „Featured" ili ekvivalent, dugmad za kontakt, nazivi dana, „Add your city to your profile", „Open profile"). Nazivi partnera i adrese ostaju kako su upisani, a udaljenost je u formatu „1.2 km".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PART-022 — Prikaz na telefonu (375 px)
**Zahtevi:** NFR-03 (ekrani S24, S25, S03) · **Prioritet:** P2 (važno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Prikaz za telefon, širina 375 px.
**Koraci:**
1. Otvori `/partneri`, skroluj čipove vrsta i otvori jedan profil.
2. Otvori karton ljubimca bez veterinara.
**Očekivani rezultat:** Kartice su u jednoj koloni, čipovi se skroluju vodoravno bez skrolovanja cele stranice, a dugmad za brzi kontakt su bar 44 px visoka. Dugi nazivi (npr. „Veterinarska ambulanta „Dr Vet"") se prelamaju. Blok predloga je ispod sadržaja kartona.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PART-023 — Brzi kontakt samo tastaturom i čitačem ekrana
**Zahtevi:** NFR-04, Design §10 (ekrani S24, S25) · **Prioritet:** P3 (sitno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** —
**Koraci:**
1. Bez miša prođi Tab-om kroz čipove vrsta i kartice partnera.
2. Proveri (npr. u DevTools → Accessibility) naziv dugmadi koja imaju samo ikonicu, kao što je ikonica za poziv u predlogu veterinara.
**Očekivani rezultat:** Fokus se vidi na svakom čipu, imenu i dugmetu. Čip može da se izabere Enter-om ili razmakom. Dugme sa samo ikonicom ima čitljiv naziv (npr. „Pozovi {partner}"), a ne prazan naziv.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____
