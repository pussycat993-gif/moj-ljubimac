# Test scenariji — Dnevnik nege i trenuci (CARE)

**Oblast:** dnevnik ishrane i stolice (unos, izmena, brisanje), raspored obroka i podsetnici za obrok, trenuci sa fotografijama, Free limit trenutaka, javni link `/t/...`, deljenje kao slike sa logom.
**Ekrani:** S07 `/ljubimci/[id]/dnevnik`, S08 `/ljubimci/[id]/trenuci`, S09 `/t/[slug]` (javno), S10 (provera podsetnika za obrok).
**Zahtevi:** FR-14 … FR-19, FR-28, FR-36, BR-01, BR-04, BR-06, BR-24, BR-45, BR-52; API EP-17 … EP-24.
**Status izgradnje:** Step 20, 21 i 22 su gotovi — sve je spremno za test.

**Okruženje (lokalno):** http://localhost:3000 · Mailpit http://127.0.0.1:54324 · lozinka `MojLjubimac123!`
**Test nalozi:** ivana.petrovic@mojljubimac.test (Premium) · marko.jovanovic@mojljubimac.test (Free) · jelena.nikolic@mojljubimac.test (Free, član Ivaninog domaćinstva).
**Do dnevnika i trenutaka:** karton ljubimca → bočna kartica „Još o ljubimcu" (ili linkovi „Dnevnik ishrane i stolice" i „Trenuci"), ili direktno `/ljubimci/<id>/dnevnik` i `/ljubimci/<id>/trenuci`.
**Test fajlovi:** 6 slika JPG/PNG manjih od 10 MB, `slika.webp`, `slika.heic`, `velika.jpg` (>10 MB), `nalaz.pdf`, `animacija.gif`.
**Napomena:** deljenje kao slike koristi fotografiju iz skladišta; ako fotografija na pripremljenoj slici lokalno izostane, zapiši to u napomenu (poznata stavka za podešavanje skladišta, „R2 CORS") i nastavi.

---

## Dnevnik ishrane i stolice (S07)

### TS-CARE-001 — Prazan dnevnik
**Zahtevi:** FR-14, FR-16, EP-17 (ekran S07) · **Prioritet:** P3 (sitno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Ljubimac bez unosa u dnevniku (npr. novi „Kiki").
**Koraci:**
1. Otvori dnevnik ljubimca.
2. Prebaci se na tab „Stolica".
**Očekivani rezultat:** Naslov „Dnevnik ishrane i stolice", tabovi „Ishrana" / „Stolica" (aktivni podvučen bojom ljubimca). Ishrana: „Još nema unosa ishrane" / „Zabeleži šta Kiki jede i koliko, pa ćeš lako pratiti ishranu iz dana u dan." + „Dodaj obrok". Stolica: „Još nema unosa stolice" / „Beleženje stolice pomaže da na vreme primetiš probleme sa varenjem." + „Dodaj stolicu". Kartica „Podsetnici za obroke" kaže „Nema zadatih obroka."
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-CARE-002 — Dodavanje obroka
**Zahtevi:** FR-14, EP-18 (ekran S07), vlasnička odluka Step 20 · **Prioritet:** P1 (kritično) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Luna (ženka).
**Koraci:**
1. Klikni „Dodaj obrok".
2. Proveri naslov i opis dijaloga.
3. Datum = danas, „Vreme *" = sat ranije od sadašnjeg, „Vrsta hrane *" = Suva hrana, „Naziv ili brend" = Royal Canin Indoor, „Količina (g)" = 40, napomena „Pojela sve za pet minuta." Klikni „Sačuvaj obrok".
**Očekivani rezultat:** Dijalog „Novi obrok" / „Šta je Luna jela i koliko." (za mužjaka „jeo", za nepoznat pol „jeo/la"). Vrste hrane: Suva hrana, Vlažna hrana, Poslastica, Domaća hrana, Ostalo. Posle čuvanja poruka „Unos sačuvan"; u listi pod „Danas, {dan}" red sa vremenom, vrstom, brendom, „· 40 g", napomenom i imenom ko je uneo.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-CARE-003 — Validacija obroka
**Zahtevi:** FR-14, EP-18 (ekran S07) · **Prioritet:** P2 (važno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Otvoren dijalog „Novi obrok".
**Koraci:**
1. Obriši vreme, ne biraj vrstu, klikni „Sačuvaj obrok".
2. U „Količina (g)" upiši `0`, pa `-5`, pa `abc`.
3. U „Naziv ili brend" pokušaj da upišeš više od 100 znakova, a u „Napomena" više od 500.
**Očekivani rezultat:** „Unesi vreme obroka.", „Izaberi vrstu hrane.", „Količina mora biti broj veći od nule." Polje za naziv ne prima više od 100 znakova, a napomena više od 500. Ništa se ne čuva dok greške postoje.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-CARE-004 — Vreme obroka/stolice u budućnosti
**Zahtevi:** FR-14, FR-16, EP-18 (ekran S07), vlasnička odluka Step 20 · **Prioritet:** P2 (važno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Otvoren dijalog „Novi obrok".
**Koraci:**
1. Datum = danas, vreme = 2 sata od sada. Sačuvaj.
2. Isto u dijalogu „Nova stolica".
3. Pokušaj da izabereš sutrašnji datum.
**Očekivani rezultat:** „Vreme ne može biti u budućnosti." u oba dijaloga; unos se ne čuva. Sutrašnji datum nije moguće izabrati. (Unos sa vremenom par minuta unapred je prihvaćen — dozvoljena je mala razlika u satu.)
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-CARE-005 — Dodavanje stolice
**Zahtevi:** FR-16, EP-18 (ekran S07) · **Prioritet:** P1 (kritično) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Luna.
**Koraci:**
1. Tab „Stolica" → „Dodaj stolicu".
2. Klikni „Sačuvaj unos" bez konzistencije i sa obrisanim vremenom.
3. Izaberi „Konzistencija *" = Meka, štikliraj „Vidi se krv ili sluz", napomena „Posle promene hrane.", sačuvaj.
4. Dodaj još jedan unos „Normalna" bez štikle.
**Očekivani rezultat:** Dijalog „Nova stolica" / „Kratak unos pomaže veterinaru ako se nešto promeni." Ponuđeno: Normalna, Meka, Proliv, Tvrda. Greške „Unesi vreme.", „Izaberi konzistenciju." Posle čuvanja „Unos sačuvan"; prvi unos prikazuje „Krv ili sluz: da", drugi nema tu oznaku.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-CARE-006 — Izmena i brisanje unosa u dnevniku
**Zahtevi:** FR-14, FR-16, EP-18 (ekran S07), vlasnička odluka Step 20 · **Prioritet:** P2 (važno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Postoji obrok i unos stolice.
**Koraci:**
1. Na redu obroka otvori meni (⋯) → „Izmeni", promeni količinu na 60, sačuvaj.
2. Na redu stolice → „Izmeni", promeni konzistenciju, sačuvaj.
3. Na jednom redu → „Obriši" → „Odustani", pa → „Obriši" → „Da, obriši".
**Očekivani rezultat:** Naslovi dijaloga „Izmeni obrok" i „Izmeni unos stolice"; posle čuvanja „Unos sačuvan" i nove vrednosti u listi. Brisanje: „Obrisati unos?" / „Ovo ne može da se poništi."; „Odustani" ne briše; posle „Da, obriši" poruka „Unos obrisan" i red nestaje.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-CARE-007 — Dnevnik nema ograničenje i grupisanje po danima
**Zahtevi:** FR-14, FR-16, BR-04, EP-17 (ekran S07) · **Prioritet:** P2 (važno) · **Nalog:** marko.jovanovic@mojljubimac.test
**Preduslovi:** Marko (Free) ima aktivnog ljubimca.
**Koraci:**
1. Dodaj 25 obroka: nekoliko danas, nekoliko juče i ostale ranijih dana.
2. Skroluj do kraja liste.
**Očekivani rezultat:** Svih 25 se čuva bez Premium zaključavanja (dnevnik je neograničen i na Free). Lista je od najnovijeg ka starijem, grupisana po danima: „Danas, {dan}", „Juče, {dan}", zatim datumi. Ako se prikazuje prvih 20, na dnu je „Učitaj još" koje učitava ostatak.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

---

## Raspored obroka i podsetnici za obrok

### TS-CARE-008 — Zadavanje rasporeda obroka
**Zahtevi:** FR-15, FR-20, EP-19 (ekran S07) · **Prioritet:** P1 (kritično) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Luna bez rasporeda.
**Koraci:**
1. U kartici „Podsetnici za obroke" u „Dodaj vreme obroka" upiši 08:00 → „Dodaj"; zatim 18:00 → „Dodaj".
2. Ostavi „Svaki dan" i klikni „Sačuvaj podsetnike".
3. Osveži stranicu.
**Očekivani rezultat:** Kartica kaže „Stižu tačno u zadato vreme."; vremena su prikazana kao čipovi „08:00", „18:00" sa dugmetom za uklanjanje („Ukloni obrok u 08:00"). Posle čuvanja „Podsetnici za obroke su sačuvani." i raspored ostaje posle osvežavanja.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-CARE-009 — Izabrani dani i validacija rasporeda
**Zahtevi:** FR-15, EP-19 (ekran S07) · **Prioritet:** P2 (važno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Raspored iz TS-CARE-008.
**Koraci:**
1. Izaberi „Izabrani dani", isključi sve dane i klikni „Sačuvaj podsetnike".
2. Uključi Pon, Sre, Pet i sačuvaj.
3. Pokušaj da dodaš isto vreme dva puta (18:00) i da dodaš više od 6 vremena.
**Očekivani rezultat:** 1: „Izaberi bar jedan dan." 2: sačuvano; dani su prikazani kao označeni čipovi. 3: isto vreme se ne dodaje dvaput; najviše 6 vremena obroka.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-CARE-010 — Podsetnici za obrok u listi podsetnika
**Zahtevi:** FR-15, FR-20, BR-13, EP-19, EP-25 (ekrani S07, S10) · **Prioritet:** P1 (kritično) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Raspored obroka za Lunu sa vremenom za ~10 minuta od sada, svaki dan.
**Koraci:**
1. Otvori `/podsetnici` → „Danas" i „Uskoro".
2. Klikni „Urađeno" na podsetniku za obrok.
3. (Opciono) zamoli programera da pokrene slanje kad dođe vreme i proveri Mailpit.
**Očekivani rezultat:** Postoje podsetnici za obrok (ikonica pribora za jelo) sa naslovom „Obrok — Luna", tačno u zadato vreme (bez „unapred"), za svaki izabrani dan. „Urađeno" ga prebacuje u tab „Urađeno". Mejl stiže u zadato vreme.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-CARE-011 — Uklanjanje rasporeda obroka
**Zahtevi:** FR-15, EP-19 (ekrani S07, S10), vlasnička odluka Step 20 · **Prioritet:** P2 (važno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Raspored postoji.
**Koraci:**
1. Ukloni sva vremena obroka (ikonica X na svakom čipu).
2. Proveri da je „Sačuvaj podsetnike" i dalje moguće kliknuti, i klikni.
3. Otvori `/podsetnici`.
**Očekivani rezultat:** Čuvanje sa nula vremena je dozvoljeno; kartica prikazuje „Nema zadatih obroka."; svi budući podsetnici „Obrok — Luna" nestaju iz liste.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-CARE-012 — Član domaćinstva u dnevniku
**Zahtevi:** FR-28, BR-22, BR-23, E-12, EP-18, EP-19 (ekran S07) · **Prioritet:** P1 (kritično) · **Nalog:** jelena.nikolic@mojljubimac.test + ivana.petrovic@mojljubimac.test
**Preduslovi:** Jelena je član Ivaninog domaćinstva, Luna je deljena; Ivana ima obroke u dnevniku i raspored obroka.
**Koraci:**
1. Kao Jelena otvori dnevnik Lune.
2. Dodaj obrok i unos stolice.
3. Izmeni svoj obrok; potraži meni na Ivaninom obroku.
4. Pogledaj karticu „Podsetnici za obroke".
5. Kao Ivana otvori dnevnik.
**Očekivani rezultat:** Jelena vidi sve unose; može da doda obrok i stolicu (prikazuje se njeno ime); može da menja/briše samo svoje unose — na Ivaninim nema menija. Raspored obroka vidi, ali bez dugmadi za izmenu (dodavanje vremena, dani, čuvanje sakriveni). Ivana vidi Jelenine unose i može da ih menja/briše (vlasnik).
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

---

## Trenuci (S08)

### TS-CARE-013 — Prazno stanje trenutaka
**Zahtevi:** FR-17, EP-20 (ekran S08) · **Prioritet:** P3 (sitno) · **Nalog:** marko.jovanovic@mojljubimac.test
**Preduslovi:** Markov ljubimac (npr. Maks, mužjak) bez trenutaka.
**Koraci:**
1. Otvori `/ljubimci/<id>/trenuci`.
**Očekivani rezultat:** Naslov „Trenuci", dugme „Novi trenutak", prazno stanje „Još nema trenutaka" / „Sačuvaj prvu fotografiju i par reči o tome šta je Maks danas radio." (za ženku „radila", za nepoznat pol „radio/la"). Free oznaka sa brojačem „0 od 5 trenutaka".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-CARE-014 — Novi trenutak sa fotografijama i tekstom
**Zahtevi:** FR-17, BR-06, EP-21 (ekran S08) · **Prioritet:** P1 (kritično) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Ljubimac Maks.
**Koraci:**
1. Klikni „Novi trenutak". Proveri naslov i opis dijaloga.
2. Datum = danas; u „Fotografije" klikni „Dodaj" i izaberi 3 slike (JPG, PNG, WEBP).
3. Ukloni drugu sliku („Ukloni fotografiju 2"), dodaj HEIC sliku.
4. U „Tekst" upiši „Prvi put na Štrandu posle leta." i klikni „Sačuvaj trenutak".
**Očekivani rezultat:** Dijalog „Novi trenutak" / „Do 5 fotografija i kratak tekst."; polje teksta ima pomoć „Šta je Maks danas radio?". Tokom slanja svaka fotografija pokazuje napredak. Posle čuvanja poruka „Trenutak sačuvan" i kartica trenutka u mreži: slike (kvadratne), datum, tekst, broj fotografija („3 fotografije"). Slike imaju opis za čitač ekrana „Maks, {datum}".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-CARE-015 — Trenutak samo sa tekstom ili prazan
**Zahtevi:** FR-17, BR-52, EP-21 (ekran S08), vlasnička odluka Step 21 · **Prioritet:** P2 (važno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Otvoren dijalog „Novi trenutak".
**Koraci:**
1. Bez fotografija i teksta klikni „Sačuvaj trenutak".
2. Upiši tekst od 281 znaka.
3. Upiši kratak tekst bez fotografija i sačuvaj.
4. Pokušaj da izabereš sutrašnji datum.
**Očekivani rezultat:** 1: „Dodaj fotografiju ili tekst." 2: tekst duži od 280 znakova se ne prihvata. 3: trenutak se čuva samo sa tekstom. 4: datum u budućnosti nije moguće izabrati.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-CARE-016 — Najviše 5 fotografija u trenutku
**Zahtevi:** FR-17, BR-06, E-08, EP-21 `too_many_photos` (ekran S08), vlasnička odluka Step 21 · **Prioritet:** P1 (kritično) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Otvoren dijalog „Novi trenutak", 6 slika spremno.
**Koraci:**
1. Izaberi odjednom 6 slika.
2. Izaberi 5, pa pokušaj da dodaš još jednu.
**Očekivani rezultat:** Prihvata se najviše 5; pojavljuje se poruka „Dodao/la si najviše 5 fotografija." (ili „Trenutak može imati najviše 5 fotografija."). Dugme „Dodaj" nestaje ili je onemogućeno kad ima 5. Čuvanje sa 5 radi.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-CARE-017 — Veličina i tip fotografije
**Zahtevi:** FR-17, BR-05, EP-21 (ekran S08), vlasnička odluka Step 21 · **Prioritet:** P2 (važno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Otvoren dijalog „Novi trenutak".
**Koraci:**
1. Dodaj `velika.jpg` (>10 MB).
2. Dodaj `nalaz.pdf`, pa `animacija.gif`.
**Očekivani rezultat:** 1: „Fotografija je veća od 10 MB." 2: „Dozvoljene su JPG, PNG, WEBP i HEIC fotografije." Odbijeni fajlovi se ne dodaju u trenutak.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-CARE-018 — Free limit: 5 trenutaka po ljubimcu
**Zahtevi:** FR-17, FR-36, BR-01, E-08, EP-21 `premium_required` (ekran S08), vlasnička odluka Step 21 · **Prioritet:** P1 (kritično) · **Nalog:** marko.jovanovic@mojljubimac.test
**Preduslovi:** Marko (Free), ljubimac bez trenutaka.
**Koraci:**
1. Dodaj 4 trenutka; pogledaj brojač.
2. Dodaj 5. trenutak.
3. Klikni „Novi trenutak" za 6. put.
4. Obriši jedan trenutak i pokušaj ponovo.
**Očekivani rezultat:** Brojač „4 od 5 trenutaka", pa „5 od 5 trenutaka". Kod 6.: Premium zaključavanje „Dostupno u Premiumu" / „Na Free planu čuvaš do 5 trenutaka po ljubimcu. Uz Premium ih beležiš bez ograničenja." + „Probaj 7 dana besplatno" (→ `/premium`). Ime ljubimca se nigde ne menja po padežima. Posle brisanja jednog — ponovo može da se doda. Limit je po ljubimcu (drugi ljubimac, ako postoji, ima svojih 5).
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-CARE-019 — Premium: trenuci bez ograničenja
**Zahtevi:** FR-17, BR-02 (ekran S08), vlasnička odluka Step 21 · **Prioritet:** P2 (važno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Ivanin ljubimac sa 5 trenutaka.
**Koraci:**
1. Dodaj 6. i 7. trenutak.
**Očekivani rezultat:** Trenuci se čuvaju bez zaključavanja; Free brojač „od 5" se ne prikazuje uopšte.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-CARE-020 — Brisanje trenutka
**Zahtevi:** FR-17, FR-19, BR-45, EP-22 (ekrani S08, S09), vlasnička odluka Step 21 · **Prioritet:** P1 (kritično) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Trenutak sa uključenim javnim linkom (zapiši link).
**Koraci:**
1. Na trenutku otvori meni → „Obriši" → „Odustani".
2. Ponovo → „Obriši" → potvrdi.
3. U privatnom prozoru otvori zapisani javni link.
**Očekivani rezultat:** Dijalog „Obrisati trenutak?" / „Brišu se fotografije i javni link. Ovo ne može da se poništi." Posle potvrde poruka „Trenutak obrisan", kartica nestaje (kad se obriše poslednji — prazno stanje). Javni link prikazuje „Ovaj trenutak više nije javan".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

---

## Javni link (S09)

### TS-CARE-021 — Uključivanje javnog linka i kopiranje
**Zahtevi:** FR-19, EP-23 (ekran S08), vlasnička odluka Step 21 · **Prioritet:** P1 (kritično) · **Nalog:** marko.jovanovic@mojljubimac.test
**Preduslovi:** Markov trenutak sa 3 fotografije i tekstom. (Javni link je dostupan i na Free planu.)
**Koraci:**
1. Na trenutku klikni „Javni link".
2. Pročitaj dijalog, uključi prekidač.
3. Klikni „Kopiraj".
4. Klikni „Gotovo" i pogledaj karticu trenutka.
**Očekivani rezultat:** Dijalog „Javni link" / „Ko ima link vidi samo ovaj trenutak — fotografije, tekst i ime. Zdravstveni podaci se nikad ne prikazuju." Posle uključivanja prikazuje se „Adresa" oblika `{adresa sajta}/t/{22 nasumična znaka}` (lokalno `http://localhost:3000/t/...`); „Kopiraj" je aktivno samo kad je link uključen, posle klika „Kopirano" / „Link je kopiran". Napomena „Kad isključiš link, ko god ga otvori videće poruku da trenutak više nije javan." Kartica dobija oznaku „Javni link je uključen".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-CARE-022 — Šta vidi neprijavljeni posetilac
**Zahtevi:** FR-19, BR-37, BR-45, EP-24 (ekran S09) · **Prioritet:** P1 (kritično) · **Nalog:** bez prijave
**Preduslovi:** Link iz TS-CARE-021. Markov ljubimac ima vakcine, težinu i pregled u kartonu.
**Koraci:**
1. U privatnom prozoru (bez prijave) otvori link.
2. Klikni na sličice da menjaš fotografije.
3. Klikni „Napravi nalog za svog ljubimca".
4. Otvori link i dok si prijavljen/a kao neki drugi korisnik (npr. Ivana).
**Očekivani rezultat:** Stranica bez menija aplikacije: fotografije (sa dugmadima „Prikaži fotografiju N od 3"), tekst, ime ljubimca i datum, i blok „I tvoj ljubimac zaslužuje svoj karton" / „Vakcine, podsetnici i najlepši trenuci — sve na jednom mestu, besplatno." NEMA: vakcina, težine, pregleda, imena ili mejla vlasnika, drugih trenutaka, linkova ka kartonu. „Napravi nalog za svog ljubimca" vodi na `/registracija`. Prijavljen drugi korisnik vidi isto (samo trenutak). U podnožju su linkovi „Politika privatnosti" i „Uslovi korišćenja".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-CARE-023 — Isključivanje javnog linka i ponovno uključivanje
**Zahtevi:** FR-19, E-07, EP-23, EP-24 (ekrani S08, S09) · **Prioritet:** P1 (kritično) · **Nalog:** marko.jovanovic@mojljubimac.test
**Preduslovi:** Uključen link iz TS-CARE-021, otvoren u privatnom prozoru.
**Koraci:**
1. Kao Marko isključi prekidač „Javni link".
2. Osveži stranicu u privatnom prozoru.
3. Ponovo uključi link i uporedi adresu sa prethodnom; osveži privatni prozor.
**Očekivani rezultat:** Posle isključivanja posetilac odmah (pri osvežavanju) vidi „Ovaj trenutak više nije javan" / „Vlasnik je isključio link ili je trenutak obrisan." Fotografije i tekst se više ne vide. Posle ponovnog uključivanja adresa je ISTA i trenutak se ponovo vidi. Oznaka „Javni link je uključen" prati stanje prekidača.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-CARE-024 — Nepostojeći javni link
**Zahtevi:** FR-19, EP-24 `not_found` (ekran S09) · **Prioritet:** P3 (sitno) · **Nalog:** bez prijave
**Preduslovi:** —
**Koraci:**
1. Otvori `/t/abc` i `/t/` + 22 nasumična znaka.
2. Promeni jedan znak u ispravnom linku iz TS-CARE-021.
**Očekivani rezultat:** U svim slučajevima ista poruka „Ovaj trenutak više nije javan" (aplikacija ne otkriva da li trenutak postoji). Nema tehničke greške ni praznog ekrana.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

---

## Deljenje kao slike

### TS-CARE-025 — „Podeli kao sliku" na Free planu (logo obavezan)
**Zahtevi:** FR-18, BR-01, E-25 (ekran S08), vlasnička odluka Step 21 · **Prioritet:** P1 (kritično) · **Nalog:** marko.jovanovic@mojljubimac.test
**Preduslovi:** Markov trenutak sa fotografijom.
**Koraci:**
1. Na trenutku klikni „Podeli kao sliku".
2. Pogledaj pregled slike.
3. Pokušaj da uključiš „Ukloni logo".
4. Klikni „Probaj 7 dana besplatno".
5. Vrati se i klikni „Podeli sliku" (na računaru).
**Očekivani rezultat:** Dijalog „Podeli kao sliku" / „Slika je spremna za WhatsApp, Viber ili Instagram." Pregled prikazuje fotografiju, ime ljubimca, datum i logo „Moj Ljubimac". Prekidač „Ukloni logo" je onemogućen, uz oznaku Premium i tekst „Uklanjanje logoa je deo Premiuma."; „Probaj 7 dana besplatno" vodi na `/premium`. „Podeli sliku" na računaru preuzima fajl `moj-ljubimac-{datum}.png` — na slici je logo. „Zatvori" zatvara dijalog.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-CARE-026 — Premium: uklanjanje loga sa slike
**Zahtevi:** FR-18, BR-02 (ekran S08), vlasnička odluka Step 21 · **Prioritet:** P2 (važno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Ivanin trenutak sa fotografijom.
**Koraci:**
1. „Podeli kao sliku" → uključi „Ukloni logo".
2. Klikni „Podeli sliku" i otvori preuzeti PNG.
3. Isključi „Ukloni logo" i ponovo preuzmi.
**Očekivani rezultat:** Prekidač je aktivan, nema Premium napomene. Sa uključenim prekidačem logo nestaje i iz pregleda i iz preuzete slike (ime i datum ostaju). Bez prekidača logo je na slici. Slika je oštra (visoka rezolucija).
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-CARE-027 — Deljenje slike sa telefona
**Zahtevi:** FR-18 (ekran S08), vlasnička odluka Step 21 · **Prioritet:** P2 (važno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Pravi telefon (Android i/ili iPhone) sa pristupom aplikaciji (lokalno preko mreže ili na produkciji).
**Koraci:**
1. Na telefonu otvori trenutak → „Podeli kao sliku" → „Podeli sliku".
2. Izaberi WhatsApp/Viber ili „Sačuvaj sliku".
**Očekivani rezultat:** Otvara se sistemski meni za deljenje telefona sa slikom kao fajlom; slika se šalje/čuva ispravno, sa imenom, datumom i (za Free) logom. Ako telefon ne podržava deljenje fajla, slika se preuzima.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

---

## Prava pristupa, telefon i jezik

### TS-CARE-028 — Član domaćinstva i trenuci
**Zahtevi:** FR-28, BR-22, BR-23, BR-24, EP-21, EP-22, EP-23 (ekran S08) · **Prioritet:** P1 (kritično) · **Nalog:** jelena.nikolic@mojljubimac.test + ivana.petrovic@mojljubimac.test
**Preduslovi:** Jelena (Free) je član Ivaninog (Premium) domaćinstva; Luna je deljena; Luna ima Ivanine trenutke (bar 5 ukupno).
**Koraci:**
1. Kao Jelena otvori trenutke Lune.
2. Pokušaj da dodaš novi trenutak.
3. Kao Ivana obriši trenutke dok Luna nema manje od 5; kao Jelena dodaj trenutak.
4. Kao Jelena potraži meni (obriši, javni link) na Ivaninom trenutku i na svom.
5. Kao Jelena uključi javni link na svom trenutku.
**Očekivani rezultat:** Jelena vidi sve Lunine trenutke. Pošto je Jelena na Free planu, i za nju važi limit 5 trenutaka po ljubimcu (Ivanin Premium se ne prenosi na člana) — kad Luna ima 5+, Jelena dobija Premium zaključavanje; kad ima manje, može da doda. Jelena može da briše i deli javnim linkom samo SVOJE trenutke; na Ivaninim nema tih opcija. Ivana može da briše i Jelenin trenutak.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-CARE-029 — Dnevnik i trenuci na telefonu (375 px)
**Zahtevi:** NFR-03 (ekrani S07, S08, S09) · **Prioritet:** P2 (važno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Telefon ili širina 375 px; postoje unosi i trenuci.
**Koraci:**
1. Otvori dnevnik, dodaj obrok preko dijaloga, otvori karticu rasporeda obroka.
2. Otvori trenutke, dodaj trenutak sa fotografijom iz kamere, otvori „Javni link" i „Podeli kao sliku".
3. Otvori javni link `/t/...` na telefonu.
**Očekivani rezultat:** Nema horizontalnog skrolovanja; dijalozi staju na ekran i mogu da se skroluju; čipovi dana i vremena obroka se lepo prelamaju; mreža trenutaka je u jednoj ili dve kolone; donja navigacija ne prekriva dugmad „Sačuvaj". Javna stranica izgleda uredno na telefonu.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-CARE-030 — Dnevnik, trenuci i javna stranica na engleskom
**Zahtevi:** FR-35, NFR-05 (ekrani S07, S08, S09) · **Prioritet:** P2 (važno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Jezik English u `/profil`.
**Koraci:**
1. Prođi kroz dnevnik (oba taba, dijalozi, greške, brisanje) i trenutke (novi trenutak, greške, Free/Premium poruke, javni link, deljenje).
2. Izazovi „vreme u budućnosti" i „prazan trenutak".
**Očekivani rezultat:** Sve na engleskom, npr. „What Luna ate and how much.", „The time can't be in the future.", „Add a photo or some text.", „Entry saved", „Moment saved", „Delete this moment?". Imena ljubimaca se ne menjaju. ⚠ Vrati jezik na srpski. (Javna stranica `/t/...` za neprijavljenog posetioca prikazuje se na podrazumevanom jeziku.)
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-CARE-031 — Dnevnik i trenuci samo tastaturom
**Zahtevi:** NFR-04, Design §10 (ekrani S07, S08) · **Prioritet:** P3 (sitno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Računar bez miša.
**Koraci:**
1. Tab-om dođi do „Dodaj obrok", popuni dijalog (lista „Vrsta hrane" strelicama), sačuvaj Enter-om.
2. Dodaj vreme obroka i sačuvaj raspored.
3. Otvori „Novi trenutak", izaberi fotografiju preko dugmeta „Dodaj" (Enter otvara izbor fajla), sačuvaj.
4. Otvori „Javni link", uključi prekidač Space-om, „Kopiraj" Enter-om, zatvori Esc.
**Očekivani rezultat:** Sve se radi bez miša; fokus je stalno vidljiv; dijalozi zadržavaju fokus unutar sebe i vraćaju ga na dugme posle zatvaranja; poruke („Unos sačuvan", „Link je kopiran") čita čitač ekrana.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____
