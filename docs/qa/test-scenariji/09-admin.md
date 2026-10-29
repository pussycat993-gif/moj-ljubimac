# 09 — Admin / operater (oblast ADM)

**Status:** ✅ spremno za test (Step 28 i Step 28c gotovi). Kartica „Moderacija" dolazi iz Step 28c i radi zajedno sa prijavama iz fajla 10 (Šapa pomoći).
**Ekrani:** S26 Admin (`/admin`, tabovi „Azili na čekanju", „Partneri", „Statistika", „Kanali", „Moderacija"), S20, S24, S12 (posledice izmena)
**Zahtevi:** FR-42, FR-57, FR-58, FR-71, BR-14b, BR-40, BR-41, BR-60, E-23, E-27, E-35, UC-10, UC-13, UC-QA-06
**Okruženje:** lokalno http://localhost:3000 · Mailpit http://127.0.0.1:54324 · lozinka `MojLjubimac123!` · Operater (admin) je `ana.markovic@mojljubimac.test`

**Pre početka:**
- U admin deo ulazi samo nalog sa ulogom Operater (`ana.markovic`). Svi ostali nalozi se sa `/admin` preusmeravaju na `/ljubimci`.
- Za odbijanje azila napravi **novi** azil registracijom (npr. `qa.azil2@mojljubimac.test`), da Miličin azil (`milica.stojanovic`) ostane za odobravanje.
- Lokalno se adresa partnera traži preko servisa OpenStreetMap (Nominatim) i to može da potraje oko 1 sekunde. Ako računar nema internet, „Pronađi koordinate" uvek vraća grešku — tada upiši koordinate ručno (TS-ADM-005).
- Za „Moderaciju" (TS-ADM-019 … TS-ADM-023) prvo napravi prijave iz fajla 10 (TS-SAPA-007, TS-SAPA-042).

---

### TS-ADM-001 — Ulaz u admin deo samo za operatera
**Zahtevi:** FR-57, EP-68, odluka vlasnice za Step 28 (ekran S26) · **Prioritet:** P1 (kritično) · **Nalog:** ana.markovic@mojljubimac.test, ivana.petrovic@mojljubimac.test, bez prijave
**Preduslovi:** —
**Koraci:**
1. U privatnom prozoru otvori `/admin`.
2. Prijavi se kao Ivana (nije operater) i otvori `/admin`.
3. Prijavi se kao Ana i otvori `/admin`.
**Očekivani rezultat:** Bez prijave aplikacija vodi na `/prijava?next=/admin`, a posle prijave kao Ana otvara `/admin`. Ivana se preusmerava na `/ljubimci` i ne vidi nijedan admin podatak (ni na trenutak). Ana vidi „Administracija" sa karticama „Azili na čekanju", „Partneri", „Statistika", „Kanali" i „Moderacija".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-ADM-002 — Odobravanje azila
**Zahtevi:** FR-42, FR-57, EP-68, Design §9.1 `shelter_approved`, odluka vlasnice za Step 28 (ekrani S26, S20) · **Prioritet:** P1 (kritično) · **Nalog:** ana.markovic@mojljubimac.test + milica.stojanovic@mojljubimac.test
**Preduslovi:** Miličin azil čeka odobrenje.
**Koraci:**
1. U „Azili na čekanju" pronađi Miličin azil (naziv, grad, osoba, mejl, datum, napomena, PIB).
2. Klikni „Odobri".
3. Otvori Mailpit (Milica) i klikni dugme iz mejla.
**Očekivani rezultat:** Javlja se „{naziv azila} je odobren. Poslali smo mejl na {mejl}." i azil nestaje sa liste na čekanju. Milica dobija mejl „Azil je odobren: {organizacija}" sa tekstom „Dobro došao/la! {organizacija} je odobren — sada možeš da dodaješ životinje, pozivaš tim i objaviš javnu stranicu." i dugmetom „Otvori organizaciju", koje vodi na `/organizacija`. Tamo više nema trake „Čeka odobrenje" i sve izmene su dozvoljene. Javna stranica `/o/{slug}` sada radi.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-ADM-003 — Odbijanje azila sa razlogom
**Zahtevi:** FR-57, EP-68, Design §9.1 `shelter_rejected`, odluka vlasnice za Step 28 (ekran S26) · **Prioritet:** P1 (kritično) · **Nalog:** ana.markovic@mojljubimac.test
**Preduslovi:** Novi azil (npr. `qa.azil2@mojljubimac.test`) čeka odobrenje.
**Koraci:**
1. Klikni „Odbij", u polje „Razlog (opciono)" upiši „Nedostaje dokaz o registraciji udruženja." i potvrdi sa „Da, odbij".
2. Otvori Mailpit.
3. Prijavi se kao taj azil.
**Očekivani rezultat:** Javlja se „{naziv azila} je odbijen i obavešten mejlom.". Mejl ima naslov „Azil nije odobren: {organizacija}", telo „Nažalost, ovog puta ne možemo da odobrimo nalog za {organizacija}. Ako misliš da je greška, odgovori na ovaj mejl." i na kraju „Razlog: Nedostaje dokaz o registraciji udruženja.". Bez upisanog razloga ta rečenica ne postoji. Odbijen azil ne može ništa da menja.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-ADM-004 — Prazna lista azila na čekanju
**Zahtevi:** FR-57 (ekran S26) · **Prioritet:** P3 (sitno) · **Nalog:** ana.markovic@mojljubimac.test
**Preduslovi:** Nijedan azil ne čeka (posle TS-ADM-002 i TS-ADM-003).
**Koraci:**
1. Otvori „Azili na čekanju".
**Očekivani rezultat:** Prikazuje se „Nema azila na čekanju" i „Sve prijave su obrađene. Nove stižu ovde čim se azil registruje.".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-ADM-005 — Novi partner i koordinate
**Zahtevi:** FR-54, FR-57, EP-69, odluka vlasnice za Step 28 (ekrani S26, S24) · **Prioritet:** P1 (kritično) · **Nalog:** ana.markovic@mojljubimac.test
**Preduslovi:** —
**Koraci:**
1. U „Partneri" klikni „Novi partner" i pokušaj da sačuvaš prazan formular.
2. Popuni naziv, tip „Veterinar", grad „Novi Sad", adresu „Bulevar oslobođenja 45", telefon i „Plaćeno do" (za mesec dana), pa klikni „Pronađi koordinate".
3. Upiši nepostojeću adresu i sačuvaj bez koordinata.
4. Upiši koordinate ručno („Geografska širina", „Geografska dužina") i sačuvaj.
5. Kao Ivana otvori `/partneri`.
**Očekivani rezultat:** Dijalog kaže „Polja sa * su obavezna. Partner je vidljiv dok ne prođe datum „plaćeno do“.", a obavezna polja prikazuju greške. Za ispravnu adresu se popunjavaju koordinate. Za nepostojeću adresu se javlja „Adresa nije pronađena. Upiši koordinate ručno i sačuvaj ponovo.". Posle čuvanja se javlja „Partner sačuvan" i partner je vidljiv na `/partneri`. Kad je „Kanal za poruke" = „Bez poruka", ispod piše „Dugme „Poruka” se ne prikazuje.".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-ADM-006 — Najviše 3 istaknuta partnera po vrsti u gradu
**Zahtevi:** FR-57, BR-41, EP-69 `featured_limit_reached` (ekran S26) · **Prioritet:** P2 (važno) · **Nalog:** ana.markovic@mojljubimac.test
**Preduslovi:** U Novom Sadu već postoje 3 istaknuta veterinara.
**Koraci:**
1. Uključi „Istaknut" četvrtom veterinaru iz Novog Sada.
**Očekivani rezultat:** Prekidač ima napomenu „Najviše 3 po tipu u gradu." i u tabeli piše „3 / 3 — limit". Pokušaj se odbija porukom „Već postoje 3 istaknuta partnera ove vrste u ovom gradu.". Četvrti veterinar ostaje neistaknut.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-ADM-007 — Isteklo „plaćeno do" automatski sakriva partnera
**Zahtevi:** FR-57, BR-40, E-23 (ekrani S26, S24) · **Prioritet:** P1 (kritično) · **Nalog:** ana.markovic@mojljubimac.test + ivana.petrovic@mojljubimac.test
**Preduslovi:** —
**Koraci:**
1. Partneru postavi „Plaćeno do" na jučerašnji datum i sačuvaj.
2. Kao Ivana otvori `/partneri` i stari link na profil tog partnera (`/partneri/{id}`).
**Očekivani rezultat:** U admin tabeli partner ima status „Istekao — skriven" i i dalje je u listi. Na `/partneri` ga nema, a stari link ne prikazuje njegove podatke.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-ADM-008 — Statistika klikova
**Zahtevi:** FR-58, EP-70 (ekran S26) · **Prioritet:** P2 (važno) · **Nalog:** ana.markovic@mojljubimac.test
**Preduslovi:** U ovom mesecu su korišćeni „Pozovi", „Poruka", „Mejl" i „Sajt" (fajl 08, TS-PART-010 … TS-PART-012). Zapiši koliko puta je kliknuto koje dugme.
**Koraci:**
1. Otvori „Statistika" → „Klikovi po partneru".
2. Promeni „Period" na prošli mesec.
**Očekivani rezultat:** Tabela ima redove po partneru i kolone po akciji (Pozovi, Poruka, Mejl, Sajt) i „Ukupno". Brojevi se slažu sa izvršenim klikovima, a sortirano je po ukupnom broju. Za mesec bez klikova se prikazuje „Još nema klikova" i „Kad vlasnici koriste brze akcije, brojke se pojavljuju ovde.".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-ADM-009 — Uključivanje Viber kanala
**Zahtevi:** BR-14b, EP-71, E-27 (ekrani S26, S12) · **Prioritet:** P2 (važno) · **Nalog:** ana.markovic@mojljubimac.test + ivana.petrovic@mojljubimac.test
**Preduslovi:** Viber je isključen. Posle testa ga **obavezno** vrati na isključeno.
**Koraci:**
1. Kao Ivana otvori `/podesavanja/podsetnici` i proveri da li se Viber nudi.
2. Kao Ana u „Kanali" uključi Viber, pročitaj dijalog „Uključiti Viber?" i potvrdi sa „Da, uključi".
3. Kao Ivana osveži podešavanja podsetnika.
4. Kao Ana isključi Viber.
**Očekivani rezultat:** Dok je Viber isključen, nigde se ne vidi kao kanal koji može da se izabere. Kartica „Kanali" kaže „Kad je uključen, Premium korisnici mogu da izaberu Viber za podsetnike. Dok je isključen, Viber se nigde ne prikazuje.". Dijalog upozorava „Ovo pokreće trošak od oko 100 € mesečno. Premium korisnici će odmah moći da izaberu Viber u podešavanjima podsetnika.". Posle uključivanja Ivana (Premium) može da izabere Viber. Posle isključivanja Viber nestaje. (Viber poruke se ne šalju ni kad je uključen — samo se nudi izbor, BR-14b.)
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-ADM-010 — Nalozi organizacija ne ulaze u admin deo
**Zahtevi:** FR-57, odluka vlasnice za Step 28 (ekran S26) · **Prioritet:** P1 (kritično) · **Nalog:** milica.stojanovic@mojljubimac.test, nikola.djordjevic@mojljubimac.test, jelena.nikolic@mojljubimac.test
**Preduslovi:** —
**Koraci:**
1. Svakim od tri naloga otvori `/admin`, pa `/admin?tab=partneri` i `/admin?tab=moderacija`.
**Očekivani rezultat:** Nijedan nalog ne vidi admin podatke. Svaki se preusmerava sa `/admin` na `/ljubimci` (za nalog organizacije aplikacija odatle može dalje da otvori njegovu uobičajenu početnu stranu — zapiši gde je završio). Nema praznog ekrana ni tehničke greške.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-ADM-011 — Otkazivanje odbijanja ostavlja azil na čekanju
**Zahtevi:** FR-57 (ekran S26) · **Prioritet:** P3 (sitno) · **Nalog:** ana.markovic@mojljubimac.test
**Preduslovi:** Bar jedan azil čeka odobrenje.
**Koraci:**
1. Klikni „Odbij", upiši razlog i zatvori dijalog sa „Otkaži" (ili tasterom Esc).
2. Pogledaj Mailpit.
**Očekivani rezultat:** Azil ostaje na listi „Azili na čekanju". Ne stiže nijedan mejl. Kad ponovo otvoriš „Odbij", razlog je prazan.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-ADM-012 — Izmena postojećeg partnera
**Zahtevi:** FR-54, FR-57, EP-69 (ekrani S26, S24, S25) · **Prioritet:** P1 (kritično) · **Nalog:** ana.markovic@mojljubimac.test + ivana.petrovic@mojljubimac.test
**Preduslovi:** Postoji aktivan partner u Novom Sadu.
**Koraci:**
1. U tabeli partnera klikni „Izmeni" za tog partnera.
2. Promeni telefon, kratak opis i radno vreme (jedan dan označi „Zatvoreno") i klikni „Sačuvaj partnera".
3. Kao Ivana otvori profil tog partnera na `/partneri/{id}`.
**Očekivani rezultat:** Dijalog ima naslov „Izmeni partnera" i već popunjena polja. Posle čuvanja se javlja „Partner sačuvan". Ivana vidi nov telefon, opis i radno vreme; za zatvoren dan piše da ne radi.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-ADM-013 — Kanal za poruke partnera
**Zahtevi:** FR-54, FR-55, BR-44, EP-69 (ekrani S26, S25) · **Prioritet:** P2 (važno) · **Nalog:** ana.markovic@mojljubimac.test + ivana.petrovic@mojljubimac.test
**Preduslovi:** Postoji partner sa „Kanal za poruke" = „Bez poruka".
**Koraci:**
1. Promeni „Kanal za poruke" na „WhatsApp" i ostavi broj prazan. Sačuvaj.
2. Upiši broj `+381 64 123 4567` i sačuvaj.
3. Kao Ivana otvori profil partnera.
**Očekivani rezultat:** Bez broja čuvanje nije moguće (greška ispod polja za broj). Ispod polja za broj piše „Može da se razlikuje od broja za pozive.". Posle čuvanja Ivana na profilu partnera vidi dugme „Poruka", koje otvara WhatsApp sa tim brojem.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-ADM-014 — Logo partnera
**Zahtevi:** FR-54, EP-69 `logo`, odluka vlasnice za Step 28 (ekrani S26, S24) · **Prioritet:** P3 (sitno) · **Nalog:** ana.markovic@mojljubimac.test + ivana.petrovic@mojljubimac.test
**Preduslovi:** Pripremljeni `slika.jpg` i `nalaz.pdf`.
**Koraci:**
1. U „Novi partner" popuni obavezna polja i u „Logo ili fotografija" izaberi `slika.jpg`. Sačuvaj.
2. Kod istog partnera pokušaj da izabereš `nalaz.pdf`.
3. Kao Ivana otvori `/partneri`.
**Očekivani rezultat:** Partner se čuva sa logom (prvo se pravi partner, pa se šalje logo). Ivana vidi logo na kartici i profilu partnera. PDF se ne prihvata (polje prima samo slike). Ako se logo lokalno ne prikaže, a partner je sačuvan, zapiši u napomenu i javi programeru.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-ADM-015 — Isključivanje „Istaknut" oslobađa mesto
**Zahtevi:** FR-57, BR-41 (ekrani S26, S24) · **Prioritet:** P2 (važno) · **Nalog:** ana.markovic@mojljubimac.test + ivana.petrovic@mojljubimac.test
**Preduslovi:** Stanje iz TS-ADM-006 (3 / 3 istaknuta veterinara u Novom Sadu).
**Koraci:**
1. Jednom istaknutom veterinaru isključi „Istaknut".
2. Uključi „Istaknut" četvrtom veterinaru (onom koji je u TS-ADM-006 odbijen).
3. Kao Ivana otvori `/partneri` sa filterom na veterinare.
**Očekivani rezultat:** Posle koraka 1 brojač u tabeli je „2 / 3". Korak 2 uspeva i brojač je ponovo „3 / 3 — limit". Na `/partneri` su istaknuti prvi, i to tačno ona tri koja su sada označena.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-ADM-016 — Produženje „plaćeno do" vraća partnera
**Zahtevi:** FR-57, BR-40, E-23 (ekrani S26, S24) · **Prioritet:** P2 (važno) · **Nalog:** ana.markovic@mojljubimac.test + ivana.petrovic@mojljubimac.test
**Preduslovi:** Partner iz TS-ADM-007 ima status „Istekao — skriven".
**Koraci:**
1. Postavi „Plaćeno do" na datum za mesec dana i sačuvaj.
2. Kao Ivana osveži `/partneri`.
**Očekivani rezultat:** Status u tabeli je ponovo „Aktivan". Partner se ponovo vidi na `/partneri` i njegov profil radi.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-ADM-017 — Prazna lista partnera
**Zahtevi:** FR-57 (ekran S26) · **Prioritet:** P3 (sitno) · **Nalog:** ana.markovic@mojljubimac.test
**Preduslovi:** Programer lokalno privremeno uklanja sve partnere (ili koristi praznu bazu). Posle testa vraća seed podatke.
**Koraci:**
1. Otvori „Partneri".
**Očekivani rezultat:** Prikazuje se „Još nema partnera" i „Dodaj prvog partnera i pojaviće se vlasnicima u njegovom gradu." sa dugmetom za novog partnera.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-ADM-018 — Direktni linkovi na tabove i bočni meni
**Zahtevi:** FR-57, FR-71, Design §5.5 (ekran S26) · **Prioritet:** P3 (sitno) · **Nalog:** ana.markovic@mojljubimac.test
**Preduslovi:** —
**Koraci:**
1. Otvori redom `/admin?tab=azili`, `/admin?tab=partneri`, `/admin?tab=statistika`, `/admin?tab=kanali`, `/admin?tab=moderacija`.
2. Klikni svaku stavku bočnog menija.
**Očekivani rezultat:** Svaka adresa otvara odgovarajući tab, a aktivna stavka u meniju je označena. U admin delu nema ikonice „Poruke" (ona postoji samo za vlasnike i organizacije).
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-ADM-019 — Moderacija: lista otvorenih prijava i brojači
**Zahtevi:** FR-71, EP-86 (ekran S26) · **Prioritet:** P1 (kritično) · **Nalog:** ana.markovic@mojljubimac.test
**Preduslovi:** Postoje bar 3 otvorene prijave: dve za isti oglas (od dva različita korisnika) i jedna za korisnika (fajl 10, TS-SAPA-007 i TS-SAPA-042).
**Koraci:**
1. Otvori „Moderacija".
2. Pročitaj jednu karticu prijave.
**Očekivani rezultat:** Tab i stavka menija „Moderacija" imaju broj otvorenih prijava (npr. „(3)"). Prijave su poređane od najstarije. Kartica ima razlog („Spam ili reklama", „Prevara", „Neprimeren sadržaj", „Dobrobit životinja" ili „Drugo"), oznaku „Oglas" ili „Korisnik", naslov oglasa ili ime korisnika, „Autor: …" i ko je prijavio, datum i napomenu prijavljivača. Za oglas sa dve prijave piše „Prijava za isti oglas: 2". Prikazuje se „Obrađeno ovog meseca: N".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-ADM-020 — Sakrivanje oglasa bez razloga
**Zahtevi:** FR-71, Design §9.1 `listing_hidden`, odluka vlasnice za Step 28b (ekrani S26, S35) · **Prioritet:** P2 (važno) · **Nalog:** ana.markovic@mojljubimac.test + autor prijavljenog oglasa
**Preduslovi:** Otvorena prijava oglasa sa razlogom „Prevara".
**Koraci:**
1. Klikni „Sakrij oglas", polje „Razlog za korisnika (opciono)" ostavi prazno i potvrdi sa „Da, sakrij".
2. Kao autor pogledaj Mailpit i `/sapa-pomoci/moje`.
**Očekivani rezultat:** Javlja se „Oglas „{naslov}“ je sakriven. {autor} je dobio/la mejl.". Mejl „Oglas je sakriven: {oglas}" umesto razloga ima naziv razloga iz prijave („Razlog: Prevara.") i dugme „Moji oglasi". Na S35 oglas ima status „Sakriven" i karticu „Sakrio operater {datum}. Piši na podrska@mojljubimac.rs ako misliš da je greška." (deo „— razlog: …" se prikazuje samo kad razlog postoji).
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-ADM-021 — Vraćanje oglasa kad autor već ima 3 aktivna oglasa
**Zahtevi:** FR-71, BR-55, odluka vlasnice za Step 28c (ekrani S26, S35) · **Prioritet:** P2 (važno) · **Nalog:** ana.markovic@mojljubimac.test + marko.jovanovic@mojljubimac.test
**Preduslovi:** Markov oglas je sakriven (TS-SAPA-010). Posle toga je Marko objavio nove oglase, pa sada ima 3 aktivna (Free).
**Koraci:**
1. Kao Ana u „Sakriveni oglasi i isključeni korisnici" klikni „Vrati oglas" za Markov oglas.
2. Kao Marko otvori `/sapa-pomoci/moje`.
**Očekivani rezultat:** Oglas nestaje iz liste sakrivenih. Pošto bi Marko sa njim imao 4 aktivna oglasa, oglas se **ne** vraća kao aktivan, nego kao „Istekao" (tab „Istekli"), odakle Marko može da ga objavi ponovo kad bude imao manje od 3 aktivna. Nema greške u admin delu.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-ADM-022 — Operater ne vidi tekst poruka
**Zahtevi:** FR-71, TC §5.10 (ekran S26) · **Prioritet:** P2 (važno) · **Nalog:** ana.markovic@mojljubimac.test
**Preduslovi:** Ivana je prijavila Marka iz razgovora (TS-SAPA-007, korak 4) i upisala napomenu.
**Koraci:**
1. Otvori tu prijavu u „Moderacija".
2. Potraži bilo kakav prikaz ili link ka razgovoru.
**Očekivani rezultat:** Vide se razlog, napomena prijavljivača, ime prijavljenog korisnika i ko je prijavio. Tekst poruka iz razgovora se nigde ne vidi i ne postoji link ka razgovoru.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-ADM-023 — Prazna moderacija i prazna lista ograničenja
**Zahtevi:** FR-71 (ekran S26) · **Prioritet:** P3 (sitno) · **Nalog:** ana.markovic@mojljubimac.test
**Preduslovi:** Sve prijave su obrađene, a svi sakriveni oglasi i isključeni korisnici vraćeni.
**Koraci:**
1. Otvori „Moderacija".
**Očekivani rezultat:** Prikazuje se „Nema otvorenih prijava" i „Kad neko prijavi oglas ili korisnika u Šapi pomoći, prijava stiže ovde.". U sekciji „Sakriveni oglasi i isključeni korisnici" piše „Trenutno ništa nije sakriveno.". Broj pored „Moderacija" se ne prikazuje.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-ADM-024 — Admin na engleskom
**Zahtevi:** FR-35, NFR-05 (ekran S26) · **Prioritet:** P2 (važno) · **Nalog:** ana.markovic@mojljubimac.test
**Preduslovi:** Ana na `/profil` menja jezik na „English".
**Koraci:**
1. Prođi kroz svih 5 tabova, otvori dijalog za partnera i dijalog za sakrivanje oglasa.
2. Izazovi grešku nepostojeće adrese i limit istaknutih.
3. Vrati jezik na srpski.
**Očekivani rezultat:** Ceo admin deo je na engleskom, bez ijedne srpske reči (osim podataka koje su ljudi upisali). Poruke glase „Address not found. Enter the coordinates manually and save again." i „There are already 3 featured partners of this type in this city.", a posle čuvanja „Partner saved".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-ADM-025 — Admin na telefonu (375 px)
**Zahtevi:** NFR-03, Design §5.5 (ekran S26) · **Prioritet:** P2 (važno) · **Nalog:** ana.markovic@mojljubimac.test
**Preduslovi:** Pregledač u prikazu za mobilni, širina 375 px.
**Koraci:**
1. Otvori `/admin` i prođi kroz tabove (donja navigacija i red tabova na stranici).
2. Otvori dijalog „Novi partner" i jednu karticu prijave u „Moderacija".
**Očekivani rezultat:** Navigacija je dole (5 stavki). Red tabova može da se pomera vodoravno unutar sebe, ali **stranica** nema vodoravno skrolovanje. Tabela partnera se pomera unutar svoje kartice. Dijalog staje na ekran, a sva dugmad su vidljiva i dovoljno velika za dodir.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-ADM-026 — Odobravanje azila i moderacija samo tastaturom
**Zahtevi:** NFR-04, Design §10 (ekran S26) · **Prioritet:** P2 (važno) · **Nalog:** ana.markovic@mojljubimac.test
**Preduslovi:** Postoji azil na čekanju i otvorena prijava oglasa.
**Koraci:**
1. Bez miša (Tab, Shift+Tab, Enter, razmak, Esc) odobri azil.
2. Otvori „Odbij" kod drugog azila i zatvori dijalog tasterom Esc.
3. U „Moderacija" otvori „Sakrij oglas" i potvrdi sa „Da, sakrij".
**Očekivani rezultat:** Fokus je uvek vidljiv. Kad se dijalog otvori, fokus je u dijalogu, a posle zatvaranja se vraća na dugme koje ga je otvorilo. Sve radnje mogu da se izvrše tastaturom.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____
