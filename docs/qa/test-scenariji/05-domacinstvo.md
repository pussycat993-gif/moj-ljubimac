# 05 — Domaćinstvo (oblast HH)

**Status:** ✅ spremno za test (Step 22 gotov)
**Ekrani:** S13 Domaćinstvo (`/domacinstvo`), S14 Prihvati poziv (`/poziv/[token]`), S03 Karton ljubimca (prikaz za člana)
**Zahtevi:** FR-26 … FR-32, BR-19 … BR-28, BR-47, BR-52, E-10 … E-13, UC-05
**Okruženje:** lokalno http://localhost:3000 · mejlovi u Mailpit-u http://127.0.0.1:54324 · lozinka za sve test naloge: `MojLjubimac123!`

**Pre početka:**
- Vlasnik domaćinstva je `ivana.petrovic@mojljubimac.test` (Premium). Član je `jelena.nikolic@mojljubimac.test` (Free). `marko.jovanovic@mojljubimac.test` je Free vlasnik.
- Za scenarije sa 6 članova trebaju ti još 4–5 novih naloga. Napravi ih registracijom (npr. `qa.clan1@mojljubimac.test` … `qa.clan5@mojljubimac.test`) i potvrdi mejl u Mailpit-u.
- Mejlove koje šalje aplikacija (pozivi, podsetnici) traži u Mailpit-u. Ako mejla nema, a ostalo radi, upiši u napomenu „mejl nije stigao" i javi programeru, jer lokalno mejl može da završi samo u logu servera.
- Za scenarije isteka Premium-a vlasnika (TS-HH-025 … TS-HH-028) noćni posao (Step 30) još ne postoji, pa programer menja podatke u bazi: pretplata istekla, domaćinstvo samo za čitanje. Posle tih scenarija zamoli ga da vrati Premium.

---

### TS-HH-001 — Free vlasnik ne može da pozove člana
**Zahtevi:** FR-26, BR-19, E-10 (ekran S13) · **Prioritet:** P1 (kritično) · **Nalog:** marko.jovanovic@mojljubimac.test
**Preduslovi:** Marko je prijavljen i nema Premium.
**Koraci:**
1. Otvori „Domaćinstvo" (`/domacinstvo`).
2. Pogledaj sadržaj stranice i pokušaj da pozoveš člana.
**Očekivani rezultat:** Umesto liste članova vidi se zamućen sadržaj sa karticom „Dostupno u Premiumu", tekstom „Pozovi do 5 ukućana da zajedno beležite obroke, doze i trenutke. Deljenje je deo Premiuma." i dugmetom „Probaj 7 dana besplatno". Dugme vodi na `/premium`. Ne postoji način da se pošalje poziv.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-HH-002 — Premium vlasnik bez domaćinstva: prvi poziv pravi domaćinstvo
**Zahtevi:** FR-26, EP-35 (ekran S13) · **Prioritet:** P1 (kritično) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Ivana još nema domaćinstvo. Ako ga već ima, preskoči ovaj scenario i označi „Blokiran — domaćinstvo već postoji".
**Koraci:**
1. Otvori `/domacinstvo`.
2. Klikni „Pozovi člana".
3. Ostavi „Naziv domaćinstva" prazan, upiši mejl `jelena.nikolic@mojljubimac.test` i klikni „Pošalji poziv".
4. Upiši naziv duži od 60 znakova i pokušaj ponovo.
5. Upiši naziv „Domaćinstvo Petrović" i pošalji.
**Očekivani rezultat:** Prazno stanje poziva na prvog člana. U dijalogu postoji polje „Naziv domaćinstva". Za korak 3 ispod polja piše „Upiši naziv domaćinstva.", a za korak 4 „Najviše 60 znakova.". Posle koraka 5 poziv je poslat, a stranica prikazuje domaćinstvo „Domaćinstvo Petrović".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-HH-003 — Poziv mejlom stiže u Mailpit
**Zahtevi:** FR-26, Design §9.1 `household_invitation` (ekran S13) · **Prioritet:** P1 (kritično) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Ivana ima domaćinstvo i bar jednog deljenog ljubimca. Jelena nije član.
**Koraci:**
1. Na `/domacinstvo` klikni „Pozovi člana", ostani na kartici „Mejlom".
2. Upiši `jelena.nikolic@mojljubimac.test` i klikni „Pošalji poziv".
3. Otvori Mailpit i nađi mejl za Jelenu.
**Očekivani rezultat:** Na stranici se pojavljuje sekcija „Poslati pozivi" sa redom „jelena.nikolic@mojljubimac.test · važi do {datum za 7 dana}" i dugmetom „Opozovi". Mejl ima naslov „Ivana Petrović te poziva u domaćinstvo: {naziv}". U telu piše „… želi da zajedno brinete o ljubimcima ({imena ljubimaca}) … Poziv važi do {datum}." i postoji dugme „Pogledaj poziv".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-HH-004 — Validacija mejla u dijalogu poziva
**Zahtevi:** FR-26 (ekran S13) · **Prioritet:** P2 (važno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Ivana ima domaćinstvo.
**Koraci:**
1. Otvori dijalog „Pozovi člana" → „Mejlom".
2. Upiši `jelena@` i klikni „Pošalji poziv".
3. Upiši mejl osobe koja je već član, pa svoj mejl, i pošalji oba.
**Očekivani rezultat:** Za korak 2 ispod polja piše „Unesi ispravnu mejl adresu." i ništa se ne šalje. Za korak 3 u dijalogu piše „Ova osoba je već član domaćinstva." i poziv se ne pravi.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-HH-005 — Poziv linkom („Napravi link") i kopiranje
**Zahtevi:** FR-26, BR-52 (ekran S13) · **Prioritet:** P1 (kritično) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Ivana ima domaćinstvo sa manje od 6 članova.
**Koraci:**
1. Otvori „Pozovi člana" i izaberi karticu „Linkom".
2. Klikni „Napravi link".
3. Klikni dugme za kopiranje i nalepi link u beležnicu.
**Očekivani rezultat:** Prikazuje se „Link za poziv" oblika `http://localhost:3000/poziv/hh_…` i tekst „Pošalji link sam/a, npr. porukom.". Posle kopiranja se javlja „Link je kopiran". U sekciji „Poslati pozivi" pojavljuje se red „Poziv linkom · važi do {datum}". Mejl se ne šalje.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-HH-006 — Neprijavljena osoba otvara poziv
**Zahtevi:** FR-26, EP-39 (ekran S14) · **Prioritet:** P1 (kritično) · **Nalog:** bez prijave (privatni prozor)
**Preduslovi:** Postoji važeći link poziva iz TS-HH-005.
**Koraci:**
1. U privatnom prozoru otvori link poziva.
2. Pogledaj šta je ponuđeno.
3. Klikni „Već imam nalog — prijavi me".
**Očekivani rezultat:** Vidi se „Poziv u domaćinstvo" sa nazivom domaćinstva i imenom osobe koja poziva, i tekst „Da prihvatiš poziv, prijavi se ili napravi besplatan nalog. Poziv te čeka ovde.". Ponuđeni su „Napravi nalog" i „Već imam nalog — prijavi me". Posle prijave vraćaš se na isti poziv. Zdravstveni podaci ljubimaca se ne prikazuju.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-HH-007 — Prihvatanje poziva (srećan put)
**Zahtevi:** FR-26, FR-29, UC-05, EP-40 (ekrani S14, S13) · **Prioritet:** P1 (kritično) · **Nalog:** jelena.nikolic@mojljubimac.test
**Preduslovi:** Jelena je dobila poziv iz TS-HH-003.
**Koraci:**
1. Iz mejla klikni „Pogledaj poziv" (ili otvori link) i prijavi se kao Jelena ako treba.
2. Pročitaj šta član može, pa klikni „Prihvati poziv".
3. Klikni „Idi na ljubimce".
**Očekivani rezultat:** Pre prihvatanja se vidi „Prijavljen/a kao" sa Jeleninim imenom i linkom „Nisi ti?", lista „Deljeni ljubimci", spisak „Kao član možeš" i rečenica „Podsetnici su isključeni dok ih sam ne uključiš (mejl i push).". Posle prihvatanja se vidi potvrda „{ljubimci} su na tvojoj listi ljubimaca. Uključi podsetnike kad ti odgovara.". Na `/ljubimci` Jelena vidi deljene ljubimce.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-HH-008 — Odbijanje poziva
**Zahtevi:** FR-26, EP-40 (ekran S14) · **Prioritet:** P2 (važno) · **Nalog:** novi nalog (npr. qa.clan1@mojljubimac.test)
**Preduslovi:** Ivana je poslala poziv na ovaj nalog.
**Koraci:**
1. Otvori link poziva prijavljen/a kao pozvana osoba.
2. Klikni „Odbij".
3. Ponovo otvori isti link.
4. Kao Ivana osveži `/domacinstvo`.
**Očekivani rezultat:** Prikazuje se „Poziv je odbijen". Kad se link ponovo otvori, i dalje piše „Poziv je odbijen" i nema dugmeta „Prihvati poziv". Ivani se ta osoba ne pojavljuje među članovima.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-HH-009 — Istekao poziv
**Zahtevi:** BR-47, EP-39 `invitation_expired` (ekran S14) · **Prioritet:** P1 (kritično) · **Nalog:** novi nalog
**Preduslovi:** Postoji poziv stariji od 7 dana. Ako ga nema, uzmi opozvan poziv iz TS-HH-022, jer se opozvan poziv prikazuje kao istekao.
**Koraci:**
1. Otvori link isteklog poziva.
**Očekivani rezultat:** Varijanta „Ovaj poziv je istekao" bez dugmeta za prihvatanje. Objašnjenje glasi „Link više ne važi. Zamoli pošiljaoca da ti pošalje novi poziv." (odluka vlasnice za Step 24, važi za sve vrste poziva). Prihvatljiv je i raniji tekst za domaćinstvo: „Pozivi u domaćinstvo važe 7 dana. Zamoli osobu koja te je pozvala za novi." U napomenu upiši koji se tekst prikazao.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-HH-010 — Već iskorišćen poziv linkom
**Zahtevi:** BR-52, EP-40 `invitation_used` (ekran S14) · **Prioritet:** P1 (kritično) · **Nalog:** novi nalog (qa.clan2@mojljubimac.test)
**Preduslovi:** Jedan poziv linkom je već prihvatio drugi nalog (npr. qa.clan1).
**Koraci:**
1. Prijavi se kao qa.clan2 i otvori isti link.
2. Pokušaj da prihvatiš.
**Očekivani rezultat:** Prikazuje se „Ovaj poziv je već iskorišćen." ili stanje prihvaćenog poziva. qa.clan2 ne postaje član.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-HH-011 — Neispravan ili nepotpun link poziva
**Zahtevi:** EP-39 `not_found` (ekran S14) · **Prioritet:** P2 (važno) · **Nalog:** jelena.nikolic@mojljubimac.test
**Preduslovi:** Imaš važeći link poziva.
**Koraci:**
1. Otvori link bez poslednjih 5 znakova.
2. Otvori `http://localhost:3000/poziv/hh_nepostoji`.
**Očekivani rezultat:** U oba slučaja se prikazuje „Poziv nije pronađen" i „Proveri da li si otvorio/la ceo link.". Nema tehničke greške ni praznog ekrana.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-HH-012 — Član ponovo otvara poziv istog domaćinstva
**Zahtevi:** EP-40 `already_member` (ekran S14) · **Prioritet:** P3 (sitno) · **Nalog:** jelena.nikolic@mojljubimac.test
**Preduslovi:** Jelena je član. Ivana pravi novi link poziva.
**Koraci:**
1. Kao Jelena otvori novi link i klikni „Prihvati poziv".
**Očekivani rezultat:** U ekranu piše „Već si član ovog domaćinstva.". Jelena se ne dodaje dva puta.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-HH-013 — Brojač članova i granica od 6 (pozivanje)
**Zahtevi:** FR-26, BR-20, BR-51, E-11 (ekran S13) · **Prioritet:** P1 (kritično) · **Nalog:** ivana.petrovic@mojljubimac.test + qa.clan1…qa.clan5
**Preduslovi:** Nalozi qa.clan1 … qa.clan5 postoje.
**Koraci:**
1. Pozovi i prihvati članove dok domaćinstvo ne bude imalo 6 osoba (Ivana + 5 članova). Posle svakog prihvatanja pogledaj brojač.
2. Kad je brojač „6 / 6 članova", pokušaj da pozoveš još nekoga.
**Očekivani rezultat:** Brojač raste „2 / 6 članova", „3 / 6 članova" … do „6 / 6 članova", a vlasnica se računa. Na 6/6 novi poziv nije moguć i piše „Domaćinstvo ima najviše 6 članova. Ukloni nekog da pozoveš novog.".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-HH-014 — Prihvatanje poziva kad je domaćinstvo popunjeno
**Zahtevi:** BR-20, EP-40 `household_full` (ekran S14) · **Prioritet:** P2 (važno) · **Nalog:** novi nalog (qa.clan6@mojljubimac.test)
**Preduslovi:** Kad je domaćinstvo imalo 5 osoba, napravljen je link poziva. Posle toga je neko drugi prihvatio poziv i domaćinstvo sada ima 6.
**Koraci:**
1. Kao qa.clan6 otvori stari link i klikni „Prihvati poziv".
**Očekivani rezultat:** Prikazuje se „Domaćinstvo je popunjeno (najviše 6 članova)." i qa.clan6 ne postaje član.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-HH-015 — Biranje deljenih ljubimaca
**Zahtevi:** FR-27, BR-21, EP-37 (ekran S13) · **Prioritet:** P1 (kritično) · **Nalog:** ivana.petrovic@mojljubimac.test + jelena.nikolic@mojljubimac.test
**Preduslovi:** Ivana ima bar 2 aktivna ljubimca. Jelena je član.
**Koraci:**
1. Kao Ivana u kartici „Deljeni ljubimci" isključi jednog ljubimca, a drugog ostavi uključenog.
2. Kao Jelena osveži `/ljubimci`.
3. Kao Jelena otvori adresu kartona isključenog ljubimca (`/ljubimci/{id}`), ako je imaš od ranije.
4. Kao Ivana ponovo uključi ljubimca i osveži Jelenin `/ljubimci`.
**Očekivani rezultat:** Ispod naslova piše „Članovi vide samo ljubimce koje ovde uključiš.". Posle koraka 1 Jelena vidi samo uključenog ljubimca. U koraku 3 karton se ne prikazuje i pojavljuje se poruka da nije pronađen. Posle koraka 4 Jelena opet vidi ljubimca.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-HH-016 — Član vidi karton u režimu člana
**Zahtevi:** FR-28, BR-22, E-12 (ekran S03) · **Prioritet:** P1 (kritično) · **Nalog:** jelena.nikolic@mojljubimac.test
**Preduslovi:** Jelena je član, a ljubimac je deljen i ima vakcine, terapiju i pregled.
**Koraci:**
1. Otvori karton deljenog ljubimca.
2. Prođi kroz kartice Pregled, Vakcine, Terapije, Pregledi i Težina.
**Očekivani rezultat:** Na vrhu stoji traka „Ti si član domaćinstva (vlasnik: Ivana Petrović). Možeš da pregledaš karton, označiš podsetnike i date doze, a medicinske unose menja samo vlasnik.". Dugmad za dodavanje i izmenu vakcina, terapija i pregleda su **skrivena** (ne samo siva), a meni sa „Premesti u Uspomene" i „Obriši trajno" ne postoji. Vidljivi su „Dodaj merenje" i „Doza data".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-HH-017 — Član dodaje težinu, dozu, obrok, stolicu i trenutak
**Zahtevi:** FR-28, BR-22 (ekrani S03, S07, S08) · **Prioritet:** P1 (kritično) · **Nalog:** jelena.nikolic@mojljubimac.test
**Preduslovi:** Isto kao TS-HH-016. Ljubimac ima aktivnu terapiju.
**Koraci:**
1. Dodaj merenje težine.
2. Na terapiji klikni „Doza data".
3. U dnevniku dodaj obrok i unos stolice.
4. Dodaj trenutak sa jednom fotografijom.
5. Kao Ivana otvori isti karton.
**Očekivani rezultat:** Sva četiri unosa se čuvaju uz potvrdu. Ivana ih vidi, a u dnevniku doza piše da je dozu dala Jelena.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-HH-018 — Član ne menja tuđe unose, a svoje može
**Zahtevi:** FR-28, BR-23, E-12 (ekrani S03, S07) · **Prioritet:** P1 (kritično) · **Nalog:** jelena.nikolic@mojljubimac.test
**Preduslovi:** Postoji merenje koje je unela Ivana i merenje koje je unela Jelena.
**Koraci:**
1. Kao Jelena otvori meni („Još opcija") na Ivaninom merenju.
2. Otvori meni na svom merenju i izmeni ga.
3. Isto proveri na unosu obroka.
**Očekivani rezultat:** Na Ivaninom unosu nema „Izmeni" ni „Obriši" (meni ne postoji ili je prazan). Svoj unos Jelena može da izmeni i obriše.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-HH-019 — Član označava podsetnik kao urađen
**Zahtevi:** FR-28, FR-24 (ekran S10) · **Prioritet:** P1 (kritično) · **Nalog:** jelena.nikolic@mojljubimac.test
**Preduslovi:** Jelena je uključila podsetnike (TS-HH-020). Deljeni ljubimac ima podsetnik za danas.
**Koraci:**
1. Otvori `/podsetnici`, karticu „Danas".
2. Klikni „Urađeno" na podsetniku deljenog ljubimca.
3. Kao Ivana otvori `/podsetnici`.
**Očekivani rezultat:** Podsetnik prelazi u „Urađeno" sa vremenom i Jeleninim imenom, i Ivana ga vidi kao urađen. Jelena ne može da napravi novi podsetnik za Ivaninog ljubimca, jer on nije ponuđen u izboru „Za koga".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-HH-020 — Član uključuje svoje podsetnike za deljene ljubimce
**Zahtevi:** FR-29, BR-24, EP-38 (ekran S13) · **Prioritet:** P1 (kritično) · **Nalog:** jelena.nikolic@mojljubimac.test
**Preduslovi:** Jelena je tek postala član.
**Koraci:**
1. Otvori `/domacinstvo`.
2. Pogledaj prekidač „Moji podsetnici za deljene ljubimce".
3. Uključi ga, pa ga isključi.
4. Uključi ga ponovo i sačekaj podsetnik deljenog ljubimca (ili zamoli programera da pokrene slanje).
**Očekivani rezultat:** Prekidač je na početku isključen. Opis glasi „Uključi ako želiš da i tebi stižu podsetnici za deljene ljubimce ({imena}). Stižu samo mejlom i push-om.". Posle uključivanja se javlja „Podsetnici su uključeni.", a posle isključivanja „Podsetnici su isključeni.". Kad je uključen, podsetnik stiže Jeleni mejlom (Mailpit), nikad na WhatsApp.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-HH-021 — Prikaz domaćinstva iz ugla člana
**Zahtevi:** FR-28, BR-25, EP-34 (ekran S13) · **Prioritet:** P2 (važno) · **Nalog:** jelena.nikolic@mojljubimac.test
**Preduslovi:** Jelena je član.
**Koraci:**
1. Otvori `/domacinstvo`.
**Očekivani rezultat:** Naslov sadrži „{naziv domaćinstva} · vlasnik: Ivana Petrović". Piše „Ivana deli sa tobom ove ljubimce. Možeš da beležiš obroke, stolicu, težinu, doze i trenutke.". Nema „Pozovi člana", „Ukloni", prekidača deljenih ljubimaca ni sekcije „Poslati pozivi". Postoji „Napusti domaćinstvo".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-HH-022 — Opoziv poslatog poziva
**Zahtevi:** FR-30, EP-36 `revoke_invitation` (ekrani S13, S14) · **Prioritet:** P2 (važno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Postoji poslat poziv koji niko nije prihvatio (mejlom ili linkom).
**Koraci:**
1. U „Poslati pozivi" klikni „Opozovi".
2. Otvori link tog poziva.
**Očekivani rezultat:** Javlja se „Poziv je opozvan." i red nestaje iz liste. Link sada prikazuje stanje isteklog poziva (kao TS-HH-009).
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-HH-023 — Vlasnik uklanja člana
**Zahtevi:** FR-30, BR-26, EP-36 (ekran S13) · **Prioritet:** P1 (kritično) · **Nalog:** ivana.petrovic@mojljubimac.test + qa.clan1@mojljubimac.test
**Preduslovi:** qa.clan1 je član i dodao je bar jedan unos (npr. merenje).
**Koraci:**
1. Kao Ivana kod qa.clan1 klikni „Ukloni".
2. U dijalogu „Ukloniti člana iz domaćinstva?" klikni „Otkaži", pa ponovo „Ukloni" → „Da, ukloni".
3. Kao qa.clan1 osveži `/ljubimci` i pokušaj da otvoriš karton deljenog ljubimca.
4. Kao Ivana pogledaj karton.
**Očekivani rezultat:** „Otkaži" ne menja ništa. Posle „Da, ukloni" član nestaje iz liste i brojač se smanjuje. qa.clan1 više ne vidi deljene ljubimce i karton se ne otvara. Merenje koje je uneo ostaje u kartonu.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-HH-024 — Član napušta domaćinstvo
**Zahtevi:** FR-30, BR-26, EP-36 `leave` (ekran S13) · **Prioritet:** P1 (kritično) · **Nalog:** jelena.nikolic@mojljubimac.test
**Preduslovi:** Jelena je član i ima bar jedan svoj unos u deljenom kartonu.
**Koraci:**
1. Na `/domacinstvo` klikni „Napusti domaćinstvo".
2. Pročitaj dijalog i klikni „Da, napusti".
**Očekivani rezultat:** Dijalog „Napustiti domaćinstvo?" kaže „Više nećeš videti kartone deljenih ljubimaca ({imena}). Sve što si uneo/la ostaje u njihovim kartonima.". Posle potvrde Jelena dolazi na `/ljubimci` bez deljenih ljubimaca. Ivana i dalje vidi Jelenine unose, a Jelena je nestala iz liste članova.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-HH-025 — Istekao Premium vlasnika: prikaz za vlasnika
**Zahtevi:** FR-32, BR-28, E-13 (ekran S13) · **Prioritet:** P1 (kritično) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Programer je u bazi označio da je Ivanin Premium istekao i da je domaćinstvo samo za čitanje. Jelena je član.
**Koraci:**
1. Otvori `/domacinstvo`.
2. Pokušaj da pozoveš člana, ukloniš člana ili promeniš deljene ljubimce.
3. Klikni „Obnovi Premium".
**Očekivani rezultat:** Na vrhu stoji traka „Tvoj Premium je istekao {datum}. Članovi i dalje vide deljene ljubimce, ali niko ne može ništa da menja dok ne obnoviš Premium.". Dugmad za pozivanje i uklanjanje i prekidači deljenja su skriveni. „Obnovi Premium" vodi na `/premium`.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-HH-026 — Istekao Premium vlasnika: član ima samo čitanje
**Zahtevi:** FR-32, BR-28, E-13 (ekrani S13, S03, S10) · **Prioritet:** P1 (kritično) · **Nalog:** jelena.nikolic@mojljubimac.test
**Preduslovi:** Isto kao TS-HH-025.
**Koraci:**
1. Otvori `/domacinstvo`.
2. Otvori karton deljenog ljubimca i pokušaj da dodaš merenje, daš dozu ili dodaš trenutak.
3. Na `/podsetnici` pokušaj da označiš podsetnik deljenog ljubimca kao urađen.
4. Prekidač „Moji podsetnici za deljene ljubimce" uključi ili isključi.
**Očekivani rezultat:** Na S13 piše „Vlasniku domaćinstva je istekao Premium. Deljene ljubimce vidiš, ali ne možeš ništa da menjaš dok ga ne obnovi.". Na S03 piše „Domaćinstvo je samo za čitanje dok vlasnik ne obnovi Premium.", a sva dugmad za unos su skrivena. Podsetnik ne može da se označi. Prekidač podsetnika i dalje radi.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-HH-027 — „Urađeno" iz mejla dok je domaćinstvo samo za čitanje
**Zahtevi:** FR-32, EP-32 `household_read_only` (stranica `/api/a/done`) · **Prioritet:** P2 (važno) · **Nalog:** jelena.nikolic@mojljubimac.test
**Preduslovi:** Jelena je dobila mejl podsetnika za deljenog ljubimca **pre** nego što je domaćinstvo postalo samo za čitanje.
**Koraci:**
1. U Mailpit-u otvori mejl podsetnika i klikni „Urađeno".
**Očekivani rezultat:** Otvara se stranica „Domaćinstvo je samo za čitanje" sa tekstom „Vlasniku domaćinstva je istekao Premium, pa podsetnik ne možeš da označiš." i dugmetom „Otvori aplikaciju". Podsetnik ostaje neurađen.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-HH-028 — Novi član ne može da uđe u domaćinstvo samo za čitanje
**Zahtevi:** BR-28, EP-40 `household_read_only` (ekran S14) · **Prioritet:** P3 (sitno) · **Nalog:** novi nalog
**Preduslovi:** Link poziva je napravljen dok je Ivana imala Premium. Domaćinstvo je sada samo za čitanje.
**Koraci:**
1. Otvori link i klikni „Prihvati poziv".
**Očekivani rezultat:** Prikazuje se „Domaćinstvo je trenutno samo za čitanje, pa ne možeš da se pridružiš.".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-HH-029 — Član ostaje na Free pravilima za svoje ljubimce
**Zahtevi:** BR-24 (ekran S01) · **Prioritet:** P2 (važno) · **Nalog:** jelena.nikolic@mojljubimac.test
**Preduslovi:** Jelena je Free, član Ivaninog Premium domaćinstva i već ima 1 svog aktivnog ljubimca.
**Koraci:**
1. Na `/ljubimci` klikni „Dodaj ljubimca".
**Očekivani rezultat:** Otvara se „Dostupno u Premiumu" (Free granica od 1 aktivnog ljubimca). Ivanin Premium ne važi za Jelenu. Deljeni ljubimci se ne računaju u Jelenin limit.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-HH-030 — Domaćinstvo i poziv na engleskom
**Zahtevi:** FR-35, NFR-05 (ekrani S13, S14) · **Prioritet:** P2 (važno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Ivana ima domaćinstvo i bar jedan poslat poziv.
**Koraci:**
1. U profilu prebaci jezik na English.
2. Otvori `/domacinstvo` i dijalog poziva.
3. Otvori link isteklog poziva.
4. Vrati jezik na srpski.
**Očekivani rezultat:** Svi tekstovi su na engleskom, npr. „Household", „Sent invitations", „Revoke", „{naziv} · owner: Ivana Petrović", a istekao poziv kaže „This link no longer works. Ask the sender for a new invitation.". Nema srpskih reči koje su ostale neprevedene. Datumi su u formatu „19 Oct 2026".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-HH-031 — Prikaz na telefonu (375 px)
**Zahtevi:** NFR-03 (ekrani S13, S14) · **Prioritet:** P2 (važno) · **Nalog:** ivana.petrovic@mojljubimac.test, jelena.nikolic@mojljubimac.test
**Preduslovi:** U pregledaču uključi prikaz za telefon širine 375 px.
**Koraci:**
1. Kao Ivana otvori `/domacinstvo` i dijalog „Pozovi člana".
2. Kao Jelena otvori link poziva.
**Očekivani rezultat:** Nema vodoravnog skrolovanja. Kartice su jedna ispod druge, dijalog stane na ekran, dugmad i prekidači su dovoljno veliki za prst, a mejl adrese se ne prelivaju preko ivice.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-HH-032 — Pozivanje člana samo tastaturom
**Zahtevi:** NFR-04, Design §10 (ekran S13) · **Prioritet:** P2 (važno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Ivana ima domaćinstvo sa slobodnim mestom.
**Koraci:**
1. Bez miša, tasterom Tab dođi do „Pozovi člana" i pritisni Enter.
2. Tab-om dođi do kartica „Mejlom" i „Linkom" i prebacuj ih strelicama.
3. Upiši mejl i pošalji Enter-om.
4. Zatvori dijalog tasterom Esc.
**Očekivani rezultat:** Okvir fokusa se jasno vidi na svakom elementu. Fokus ostaje unutar otvorenog dijaloga, a posle zatvaranja se vraća na „Pozovi člana". Poziv se šalje bez miša.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____
