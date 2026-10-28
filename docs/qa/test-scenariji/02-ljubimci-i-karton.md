# Test scenariji — Ljubimci i karton (PET)

**Oblast:** dodavanje, izmena i brisanje ljubimca, pretraga, karton (težina, vakcine, terapije i doze, pregledi i prilozi), Uspomene i vraćanje, PDF izvoz, prava člana domaćinstva.
**Ekrani:** S01 `/ljubimci`, S02 `/ljubimci/novi` i `/ljubimci/[id]/izmena`, S03 `/ljubimci/[id]`, S04 `/ljubimci/[id]/vakcine/nova`, S27 `/ljubimci/[id]/terapije/nova`, S05 `/ljubimci/[id]/pregledi/novi`, S06 `/uspomene`.
**Zahtevi:** FR-01 … FR-13, FR-28, FR-36, FR-59, BR-01 … BR-05, BR-22, BR-23, BR-50; API EP-01 … EP-16.
**Status izgradnje:** Step 13–16 i Step 22 (domaćinstvo) su gotovi — sve je spremno za test.

**Okruženje (lokalno):** http://localhost:3000 · Mailpit http://127.0.0.1:54324 · lozinka `MojLjubimac123!`
**Test nalozi:** ivana.petrovic@mojljubimac.test (Premium) · marko.jovanovic@mojljubimac.test (Free) · jelena.nikolic@mojljubimac.test (Free, za domaćinstvo).
**Primeri u tekstu:** „Luna" (ženka, mačka) i „Maks" (mužjak, pas). Ako test nalog nema ljubimca sa tim imenom, koristi bilo kog svog ljubimca ili ga dodaj.
**Test fajlovi (pripremi pre testa):** `slika.jpg` (~1 MB), `slika.png`, `slika.webp`, `slika.heic`, `nalaz.pdf` (~1 MB), `velika.jpg` ili `velika.pdf` (veća od 10 MB, npr. 12 MB), `video.mp4`, `tabela.xlsx`.

---

## Ljubimci (S01, S02)

### TS-PET-001 — Prazno stanje i dodavanje prvog ljubimca
**Zahtevi:** FR-01, FR-36 (ekrani S01, S02) · **Prioritet:** P1 (kritično) · **Nalog:** novi nalog (vlasnik, Free)
**Preduslovi:** Napravljen i potvrđen nov vlasnički nalog bez ljubimaca.
**Koraci:**
1. Otvori `/ljubimci`.
2. Klikni „Dodaj ljubimca".
3. Upiši „Ime *" = Luna, „Vrsta *" = Mačka, „Pol *" = Ženka, rasa „Britanska kratkodlaka", izaberi „Znam tačan datum" i datum rođenja pre 3 godine.
4. Klikni „Sačuvaj ljubimca".
5. Vrati se na `/ljubimci`.
**Očekivani rezultat:** Pre dodavanja: prazno stanje „Dodaj svog prvog ljubimca" / „Napravi karton i podsetićemo te na vakcine, terapije i rođendane.". Na formi stoji „Polja sa zvezdicom (*) su obavezna." Posle čuvanja: poruka „Luna je sada među tvojim ljubimcima." i otvara se karton (S03). Na `/ljubimci` je kartica Lune (ime, rasa, pol, „Starost" = 3 godine) i brojač „Free · 1 / 1 aktivan ljubimac". Ispod polja za datum rođenja piše „Napravićemo podsetnik za rođendan."
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PET-002 — Validacija obaveznih polja ljubimca
**Zahtevi:** FR-01, EP-03 (ekran S02) · **Prioritet:** P2 (važno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Otvoren `/ljubimci/novi`.
**Koraci:**
1. Bez popunjavanja klikni „Sačuvaj ljubimca".
2. Izaberi „Znam okvirnu godinu" i upiši `21`, pa `2035`.
3. Upiši ime duže od 60 znakova.
**Očekivani rezultat:** Greške ispod polja: „Upiši ime ljubimca.", „Izaberi vrstu.", „Izaberi pol." Za godinu: „Upiši godinu sa četiri cifre, npr. 2021." (i godina u budućnosti se ne prihvata). Ime duže od 60 znakova se ne može sačuvati. Ljubimac se ne pravi; ako čuvanje ne uspe, vrh forme prikazuje „Nismo uspeli da sačuvamo ljubimca. Proveri označena polja i pokušaj ponovo."
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PET-003 — Vrste ljubimaca i „Ostalo"
**Zahtevi:** FR-01 (ekran S02) · **Prioritet:** P2 (važno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Otvoren `/ljubimci/novi`.
**Koraci:**
1. Otvori listu „Vrsta *" i proveri ponuđene vrste.
2. Izaberi „Ostalo" i sačuvaj bez popunjavanja polja „Koja vrsta? *".
3. Upiši „degu", popuni ostala obavezna polja i sačuvaj.
4. Otvori izmenu i promeni vrstu na „Zec".
**Očekivani rezultat:** Lista sadrži: Pas, Mačka, Zec, Hrčak, Zamorac, Činčila, Tvor, Ptica, Riba, Kornjača, Gušter, Zmija, Ostalo. Uz „Ostalo" se pojavljuje polje „Koja vrsta? *"; prazno → „Upiši koja je vrsta." Posle čuvanja karton prikazuje vrstu „degu". Kad se vrsta promeni na Zec, polje „Koja vrsta?" nestaje.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PET-004 — Okvirna godina i prikaz starosti
**Zahtevi:** FR-01, FR-09 (ekrani S02, S01) · **Prioritet:** P3 (sitno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Ivana je Premium (može da ima više ljubimaca).
**Koraci:**
1. Dodaj ljubimca sa „Znam okvirnu godinu" = 2021.
2. Dodaj ljubimca sa tačnim datumom rođenja pre 5 meseci.
3. Dodaj ljubimca bez datuma i bez godine.
4. Pogledaj kartice na `/ljubimci`.
**Očekivani rezultat:** 1: „Starost" počinje sa „oko" (npr. „oko 5 godina"). 2: starost u mesecima („5 meseci"). 3: red „Starost" se ne prikazuje. Oblici reči su pravilni (1 godina / 2 godine / 5 godina).
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PET-005 — Fotografija ljubimca
**Zahtevi:** FR-01, BR-05, EP-13 (ekran S02) · **Prioritet:** P2 (važno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Otvorena izmena postojećeg ljubimca. Pripremljeni test fajlovi.
**Koraci:**
1. U „Fotografija" klikni „Izaberi fotografiju" i izaberi `slika.jpg`. Sačuvaj.
2. Ponovi sa `slika.png`, `slika.webp`, `slika.heic`.
3. Pokušaj sa `nalaz.pdf` i sa `velika.jpg` (>10 MB).
4. Izaberi novu sliku, pa pre čuvanja klikni „Ukloni fotografiju".
**Očekivani rezultat:** Ispod polja piše „JPG ili PNG, do 10 MB." JPG/PNG/WEBP/HEIC se prihvataju, slika se vidi na kartonu i na kartici u `/ljubimci`. PDF i fajl veći od 10 MB se odbijaju sa porukom, stara slika ostaje. „Ukloni fotografiju" briše samo još nesačuvanu sliku; sačuvana slika može samo da se zameni novom. Bez slike se prikazuje ikonica vrste.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PET-006 — Izmena ljubimca i boja kartona po polu
**Zahtevi:** FR-02 (ekrani S02, S03, S01) · **Prioritet:** P2 (važno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Postoji Luna.
**Koraci:**
1. Na kartonu Lune klikni „Izmeni". Proveri naslov „Izmeni profil: Luna".
2. Promeni rasu, broj mikročipa (15 cifara), „Sterilisan/a" = Da, „Moj veterinar" (ime i telefon), napomenu.
3. Prebacuj „Pol" između Ženka / Mužjak / Ne znam i posmatraj pregled boje.
4. Vrati „Ženka" i klikni „Sačuvaj promene".
**Očekivani rezultat:** Boja (ružičasta za ženku, pistać/maslinasta za mužjaka, neutralna za „Ne znam") se menja odmah („Boja kartona prati pol koji izabereš."). Posle čuvanja poruka „Promene za Luna su sačuvane." i nove vrednosti se vide na kartonu (Osnovni podaci, Moj veterinar sa dugmetom za poziv) i na kartici u `/ljubimci`.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PET-007 — Free limit: drugi aktivni ljubimac
**Zahtevi:** FR-01, FR-36, BR-01, E-26, EP-03 `premium_required` (ekran S01) · **Prioritet:** P1 (kritično) · **Nalog:** marko.jovanovic@mojljubimac.test
**Preduslovi:** Marko (Free) ima tačno 1 aktivnog ljubimca.
**Koraci:**
1. Na `/ljubimci` klikni „Dodaj ljubimca".
2. Klikni „Probaj 7 dana besplatno".
3. Ručno otvori `/ljubimci/novi`, popuni i pokušaj da sačuvaš.
**Očekivani rezultat:** Umesto forme se pojavljuje Premium zaključavanje: „Dostupno u Premiumu", „Dodavanje drugog ljubimca", „Na Free planu imaš jednog aktivnog ljubimca. Premium otključava neograničen broj ljubimaca, PDF karton i deljenje sa domaćinstvom." i dugme „Probaj 7 dana besplatno" koje vodi na `/premium`. Direktan pokušaj preko adrese takođe ne pravi drugog ljubimca (prikazuje se isto Premium zaključavanje). Brojač ostaje „1 / 1".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PET-008 — Premium vlasnik dodaje više ljubimaca
**Zahtevi:** FR-01, BR-02 (ekran S01) · **Prioritet:** P2 (važno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Ivana je Premium.
**Koraci:**
1. Dodaj još 2 ljubimca (npr. Maks — pas, mužjak; Kiki — zec, ženka).
2. Pogledaj `/ljubimci` na računaru, pa na telefonu (375 px).
**Očekivani rezultat:** Svi ljubimci se dodaju bez Premium zaključavanja; nema Free brojača. Kartice: 3 u redu na širokom ekranu, 2 na srednjem, 1 na telefonu.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PET-009 — Pretraga ljubimaca
**Zahtevi:** FR-59 (ekran S01) · **Prioritet:** P2 (važno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Ivana ima više ljubimaca; dodaj jednog sa imenom „Žuća".
**Koraci:**
1. U polje „Pretraži ljubimce…" upiši `lu`.
2. Upiši `LUNA`.
3. Upiši `zuca` (bez kvačica).
4. Upiši `xyz`.
5. Klikni „Obriši pretragu".
**Očekivani rezultat:** 1–2: vidi se samo Luna (velika/mala slova nisu bitna). 3: vidi se „Žuća" (kvačice nisu bitne). 4: „Nema ljubimca sa imenom „xyz“" / „Proveri kako je ime napisano ili obriši pretragu." 5: vraćaju se svi ljubimci.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PET-010 — Trajno brisanje ljubimca
**Zahtevi:** FR-13, EP-05 (ekran S03) · **Prioritet:** P1 (kritično) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Napravi probnog ljubimca „Brisanje QA" (ženka) sa jednom vakcinom sa sledećom dozom, jednim pregledom sa prilogom i jednim trenutkom sa uključenim javnim linkom (zapiši link).
**Koraci:**
1. Na kartonu otvori meni „Još opcija" (⋯) → „Obriši trajno".
2. Pročitaj dijalog i klikni „Odustani".
3. Ponovo otvori i klikni „Da, obriši".
4. Proveri `/ljubimci`, `/podsetnici` i otvori zapisan javni link u privatnom prozoru.
**Očekivani rezultat:** Dijalog: „Trajno obriši karton — Brisanje QA?" / „Brišu se svi unosi, prilozi, trenuci i podsetnici. Ovo ne može da se poništi. Ako želiš da sačuvaš karton, premesti ljubimca u Uspomene." „Odustani" ne briše ništa. Posle „Da, obriši": prelazak na `/ljubimci` i poruka „Brisanje QA je trajno obrisana, sa svim unosima i podsetnicima." Ljubimca nema u listi, njegovih podsetnika nema u `/podsetnici`, javni link prikazuje „Ovaj trenutak više nije javan".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

---

## Karton (S03)

### TS-PET-011 — Karton: zaglavlje, tabovi i prazna stanja
**Zahtevi:** FR-04 … FR-07 (ekran S03), Design §12 S03 · **Prioritet:** P1 (kritično) · **Nalog:** novi ljubimac kod ivana.petrovic@mojljubimac.test
**Preduslovi:** Novi ljubimac bez ikakvih unosa.
**Koraci:**
1. Otvori karton.
2. Klikni redom tabove: Pregled, Vakcine, Terapije, Pregledi, Težina.
**Očekivani rezultat:** Zaglavlje: velika obojena traka, slika ili ikonica, ime, rasa · starost, mikročip ako postoji; dugmad „Izvezi PDF", „Izmeni" i meni ⋯. Prazna stanja: Pregled — „{ime} još nema unose" / „Dodaj vakcinu, terapiju ili pregled i ovde ćeš videti šta sledi."; Vakcine — „Još nema vakcina" / „Dodaj prvu vakcinu i podsetićemo te na sledeću."; Terapije — „Još nema terapija" / „Upiši lek ili zaštitu od parazita i podsetićemo te na svaku dozu."; Pregledi — „Još nema pregleda" / „Sačuvaj nalaz sa pregleda i priloži slike ili PDF."; Težina — „Još nema merenja" / „Upiši prvu težinu i pratićemo kako se menja." Svako prazno stanje ima dugme za dodavanje. Aktivni tab je podvučen bojom ljubimca. Sa strane (računar) su „Osnovni podaci" i „Moj veterinar" (ili predlog veterinara ako veterinar nije upisan).
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PET-012 — Dodavanje težine
**Zahtevi:** FR-03, FR-04, EP-08 (ekran S03, tab Težina) · **Prioritet:** P1 (kritično) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Luna sa jedinicom težine „kg".
**Koraci:**
1. Na tabu Težina klikni „Dodaj merenje". Proveri naslov „Novo merenje — Luna" i opis „Težinu upisuješ u jedinici izabranoj za ovog ljubimca (kg)."
2. Klikni „Sačuvaj merenje" bez podataka.
3. Upiši `0`, pa `-2`, pa `abc`.
4. Izaberi datum u budućnosti.
5. Upiši ispravno: današnji datum, `4,2`, napomena „izmereno kod veterinara". Sačuvaj.
6. Dodaj još 2 merenja sa ranijim datumima (3,9 i 4,0).
**Očekivani rezultat:** Greške: „Izaberi datum merenja.", „Upiši težinu, npr. 4,2."; nula, negativan broj i tekst se ne prihvataju; datum u budućnosti nije moguće izabrati. Posle čuvanja: „Merenje je sačuvano." Lista „Sva merenja" je po datumu, vrednosti u obliku „4,2 kg", grafikon „Trend" prikazuje rast. Pregled tab prikazuje „Poslednja težina".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PET-013 — Izmena i brisanje merenja
**Zahtevi:** FR-04, EP-08 (ekran S03) · **Prioritet:** P2 (važno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Luna ima bar 2 merenja.
**Koraci:**
1. Na redu merenja otvori „Još opcija" → „Izmeni". Promeni vrednost i sačuvaj.
2. Na drugom redu „Još opcija" → „Obriši" → „Odustani".
3. Ponovo „Obriši" → „Da, obriši".
**Očekivani rezultat:** Dijalog izmene ima naslov „Izmeni merenje — Luna"; nova vrednost se vidi u listi i grafikonu. Dijalog brisanja: „Obrisati unos?" / „Ovo ne može da se poništi." sa „Da, obriši" i „Odustani". „Odustani" ne briše; „Da, obriši" uklanja red.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PET-014 — Promena jedinice težine (kg ↔ g)
**Zahtevi:** FR-03, BR-50, EP-04 (ekrani S02, S03) · **Prioritet:** P2 (važno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Ljubimac (npr. Kiki) sa merenjima 1,9 kg i 2,0 kg.
**Koraci:**
1. Izmeni ljubimca: „Jedinica težine" = „Grami (g)". Sačuvaj.
2. Pogledaj tab Težina.
3. Dodaj merenje `850`.
4. Vrati na „Kilogrami (kg)".
**Očekivani rezultat:** Ispod izbora piše „Grami su zgodniji za male životinje, npr. hrčka ili zamorca." Posle prelaska na grame postojeća merenja su preračunata: „1900 g", „2000 g". Novo merenje traži grame („Upiši težinu u gramima, npr. 850." ako je prazno) i prikazuje „850 g". Posle povratka na kg: 1,9 kg, 2 kg i 0,85 kg (prikaz može biti zaokružen, ali vrednost se ne gubi — kad se ponovo prebaci na grame, opet je 850 g).
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PET-015 — Nova vakcina sa datumom sledeće doze
**Zahtevi:** FR-05, FR-20, EP-09 (ekrani S04, S03) · **Prioritet:** P1 (kritično) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Luna, Ivana ima upisanog „Moj veterinar".
**Koraci:**
1. Na tabu Vakcine klikni „Dodaj vakcinu". Proveri naslov „Nova vakcina" i red „Luna · Mačka · …".
2. Proveri da je „Veterinar ili ambulanta" unapred popunjen veterinarom iz profila.
3. Upiši „Naziv ili vrsta vakcine *" = Besnilo — Rabisin, „Datum davanja *" = danas, „Datum sledeće doze" = za godinu dana, serijski broj, napomenu. Klikni „Sačuvaj vakcinu".
4. Otvori `/podsetnici`, tab „Uskoro" (ili proveri karton → Pregled).
**Očekivani rezultat:** Uz „Datum sledeće doze" piše „Napravićemo podsetnik." Posle čuvanja: „Vakcina sačuvana. Podsetićemo te {datum} na sledeću dozu." i povratak na karton. Vakcina je u listi sa značkom „Sledeća {datum}". Podsetnik za vakcinu postoji (vidi i TS-REM-003).
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PET-016 — Validacija vakcine
**Zahtevi:** FR-05, EP-09 (ekran S04) · **Prioritet:** P2 (važno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Otvoren `/ljubimci/[id]/vakcine/nova`.
**Koraci:**
1. Klikni „Sačuvaj vakcinu" bez podataka.
2. Upiši naziv, datum davanja = danas, datum sledeće doze = juče.
3. Pokušaj da za datum davanja izabereš datum u budućnosti.
4. Sačuvaj vakcinu bez datuma sledeće doze.
**Očekivani rezultat:** „Upiši naziv ili vrstu vakcine.", „Izaberi datum davanja.", „Datum sledeće doze mora biti posle datuma davanja."; budući datum davanja nije moguće izabrati. Vakcina bez sledeće doze se čuva sa porukom „Vakcina sačuvana." i u listi ima oznaku „Bez sledeće doze"; za nju se ne pravi podsetnik.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PET-017 — Značke sledeće vakcine (uskoro, danas, kasni)
**Zahtevi:** FR-05 (ekran S03), vlasnička odluka Step 14 · **Prioritet:** P2 (važno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Luna.
**Koraci:**
1. Dodaj vakcinu (davanje pre 1 godine) sa sledećom dozom za 10 dana.
2. Dodaj vakcinu sa sledećom dozom danas (davanje ranije).
3. Dodaj vakcinu sa sledećom dozom pre 5 dana (davanje pre godinu dana).
4. Dodaj vakcinu sa sledećom dozom za 60 dana.
**Očekivani rezultat:** 1: „Sledeća {datum} · za 10 dana" sa žutom značkom „uskoro". 2: „Sledeća {datum} · danas". 3: „Sledeća {datum} · kasni 5 dana" sa crvenom značkom. 4: samo „Sledeća {datum}" bez upozorenja (više od 30 dana). Značke uvek imaju tekst, ne samo boju.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PET-018 — Izmena i brisanje vakcine
**Zahtevi:** FR-05, E-01, EP-09 (ekran S03, izmena vakcine) · **Prioritet:** P1 (kritično) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Vakcina iz TS-PET-015.
**Koraci:**
1. Na redu vakcine „Još opcija" → „Izmeni". Proveri naslov „Izmeni vakcinu" i dugme „Sačuvaj izmene".
2. Promeni datum sledeće doze na za 20 dana i sačuvaj.
3. „Još opcija" → „Obriši" → „Da, obriši".
4. Posle svakog koraka proveri `/podsetnici`.
**Očekivani rezultat:** Posle izmene podsetnik je pomeren na novi datum (nema duplog). Posle brisanja (dijalog „Obrisati unos?") vakcina i njen podsetnik su uklonjeni.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PET-019 — Nova terapija i rezime doza
**Zahtevi:** FR-06, FR-20, EP-10 (ekran S27) · **Prioritet:** P1 (kritično) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Luna.
**Koraci:**
1. Na tabu Terapije klikni „Dodaj terapiju".
2. Klikni „Sačuvaj terapiju" bez podataka.
3. Upiši „Na svakih" = `0`, pa `1,5`.
4. Izaberi „Kraj terapije" → „Datum završetka" pre datuma početka.
5. Izaberi „Trajanje" i upiši `0`.
6. Ispravno: „Vrsta *" = Lek, „Naziv *" = Tobrex kapi za oči, „Doza" = 1 kap u svako oko, „Na svakih" 12 sati, „Datum početka *" = danas, „Trajanje u danima" = 10. Sačuvaj.
**Očekivani rezultat:** Vrste: Lek, Dehelmintizacija, Zaštita od buva i krpelja, Ostalo. Greške: „Izaberi vrstu terapije.", „Upiši naziv leka ili preparata.", „Izaberi datum početka.", „Upiši ceo broj veći od nule, npr. 12.", „Datum završetka ne može biti pre datuma početka.", „Upiši broj dana veći od nule." Uz učestalost piše „Napravićemo podsetnike za svaku dozu." Posle čuvanja poruka „Terapija sačuvana. Podsetnik na svakih 12 sati, od {danas} do {danas+9}." Bez kraja: „… dok ne završiš terapiju." Terapija je na tabu sa učestalošću „Svakih 12 sati" i „Sledeća doza: …".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PET-020 — „Doza data" i dnevnik doza
**Zahtevi:** FR-06, FR-24, EP-11 (ekran S03, tab Terapije) · **Prioritet:** P1 (kritično) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Terapija iz TS-PET-019.
**Koraci:**
1. Na kartici terapije klikni „Doza data".
2. Pogledaj „Dnevnik doza".
3. Otvori `/podsetnici`.
4. Izmeni pa obriši terapiju (meni „Još opcija"; izmena ima naslov „Izmeni terapiju").
**Očekivani rezultat:** Poruka „Doza je upisana."; u „Dnevnik doza" je novi red sa vremenom i imenom (Ivana Petrović); „Sledeća doza" se pomera. Ako je data doza bila današnji podsetnik, u `/podsetnici` je u tabu „Urađeno". Posle brisanja terapije nestaju i njeni budući podsetnici za doze. Završena terapija ima oznaku „Završeno".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PET-021 — Novi pregled sa kontrolom i cenom
**Zahtevi:** FR-07, FR-20, EP-12 (ekrani S05, S03) · **Prioritet:** P1 (kritično) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Luna.
**Koraci:**
1. Na tabu Pregledi klikni „Novi pregled".
2. Klikni „Sačuvaj pregled" bez podataka.
3. U „Cena (RSD)" upiši `1500 dinara`; u „Datum kontrole" izaberi datum pre datuma pregleda.
4. Ispravno: datum danas, „Razlog *" = Kontrola očiju, nalaz, preporuke, cena `2.990`, kontrola za 14 dana. Sačuvaj.
**Očekivani rezultat:** „Ambulanta ili veterinar" je unapred popunjena veterinarom iz profila. Greške: „Izaberi datum pregleda.", „Upiši razlog pregleda.", „Upiši samo iznos u dinarima, npr. 2.990.", „Kontrola mora biti posle datuma pregleda." Posle čuvanja: „Pregled sačuvan. Podsetićemo te na kontrolu {datum}." Na kartonu pregled prikazuje „Nalaz", „Preporuke", „Kontrola: {datum}", cenu „2.990 RSD". Pregled tab prikazuje „Poslednji pregled".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PET-022 — Prilozi: dozvoljeni tipovi i veličina
**Zahtevi:** FR-08, BR-05, E-04, EP-13 (ekran S05) · **Prioritet:** P1 (kritično) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Otvoren „Novi pregled" ili izmena postojećeg pregleda. Test fajlovi spremni.
**Koraci:**
1. U „Prilozi" klikni „Dodaj slike ili PDF" i izaberi `slika.jpg`, `slika.png` i `nalaz.pdf` odjednom.
2. Dodaj `video.mp4`.
3. Dodaj `tabela.xlsx`.
4. Dodaj `velika.pdf` (>10 MB).
5. Sačuvaj pregled.
**Očekivani rezultat:** Ispod zone piše „JPG, PNG ili PDF, do 10 MB po fajlu." Dozvoljeni fajlovi se pojavljuju kao čipovi (ikonica, ime, veličina u MB, npr. „1,2 MB"). Za video: „video.mp4 nije podržan. Dodaj sliku (JPG, PNG) ili PDF do 10 MB." Isto za xlsx. Za veliki: „velika.pdf ima 12,0 MB. Najveća dozvoljena veličina je 10 MB." Odbijeni fajlovi se ne čuvaju; ostali se vide uz pregled na kartonu.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PET-023 — Otvaranje, preuzimanje i brisanje priloga
**Zahtevi:** FR-08, EP-14, EP-15 (ekran S03, tab Pregledi) · **Prioritet:** P2 (važno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Pregled sa jednim PDF i jednim slikovnim prilogom.
**Koraci:**
1. Klikni na čip PDF priloga.
2. Klikni na čip slike.
3. Na čipu klikni ikonicu X („Ukloni {ime fajla}") → „Odustani", pa ponovo → „Da, obriši".
**Očekivani rezultat:** PDF i slika se otvaraju/preuzimaju i sadržaj je ispravan. Brisanje traži potvrdu („Obrisati unos?" / „Ovo ne može da se poništi."); posle „Da, obriši" čip nestaje, a Free brojač priloga (ako postoji) se smanjuje. Ako fajl nije dostupan, prikazuje se „Fajl nije dostupan."
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PET-024 — Free limit: 10 priloga po ljubimcu
**Zahtevi:** FR-08, FR-36, BR-01, E-04, EP-13 `premium_required` (ekran S05) · **Prioritet:** P1 (kritično) · **Nalog:** marko.jovanovic@mojljubimac.test
**Preduslovi:** Marko (Free) ima aktivnog ljubimca. Pripremi 11 malih slika/PDF-ova.
**Koraci:**
1. Napravi pregled i dodaj 9 priloga. Pogledaj brojač.
2. U drugom pregledu istog ljubimca dodaj 10. prilog.
3. Pokušaj da dodaš 11. prilog.
4. Obriši jedan prilog i pokušaj ponovo.
**Očekivani rezultat:** Brojač „Iskorišćeno 9 od 10 priloga" pa „10 od 10" (broji SVE priloge ljubimca, ne po pregledu). Kod 11. priloga: Premium zaključavanje „Dostupno u Premiumu" / „Na Free planu možeš da sačuvaš 10 priloga po ljubimcu. Premium nema ograničenje — čuvaj sve nalaze i snimke." i „Probaj 7 dana besplatno". Posle brisanja jednog — ponovo može da se doda.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PET-025 — Premium: prilozi bez ograničenja
**Zahtevi:** FR-08, BR-02 (ekran S05) · **Prioritet:** P3 (sitno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Ivana (Premium), ljubimac sa 10 priloga.
**Koraci:**
1. Dodaj 11. i 12. prilog.
**Očekivani rezultat:** Prilozi se čuvaju; nema brojača „od 10" niti Premium zaključavanja.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

---

## Uspomene (S06)

### TS-PET-026 — Premeštanje ljubimca u Uspomene
**Zahtevi:** FR-11, BR-03, BR-17, EP-06 (ekrani S03, S06) · **Prioritet:** P1 (kritično) · **Nalog:** marko.jovanovic@mojljubimac.test
**Preduslovi:** Marko (Free) ima 1 aktivnog ljubimca sa bar jednim budućim podsetnikom i 0 uspomena.
**Koraci:**
1. Na kartonu „Još opcija" → „Premesti u Uspomene".
2. Klikni potvrdu bez datuma.
3. Izaberi datum (danas), razlog (npr. „Izgubljen/a"), napomenu i potvrdi.
4. Otvori `/uspomene`, `/podsetnici` i `/ljubimci`.
**Očekivani rezultat:** Dijalog „Premesti u Uspomene — {ime}" / „Karton ostaje sačuvan, a svi podsetnici za ovog ljubimca se zaustavljaju."; bez datuma: „Izaberi datum."; datum u budućnosti nije dozvoljen. Posle potvrde: „{ime} je premeštena/premešten u Uspomene. Podsetnici su zaustavljeni." Na `/uspomene` je prigušena kartica sa datumom i razlogom i dugmadima „Vrati među aktivne" i „Pogledaj karton". Podsetnici tog ljubimca više nisu u `/podsetnici`. Na `/ljubimci` Marko sada može da doda novog ljubimca (slot je slobodan).
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PET-027 — Free limit: najviše 2 uspomene
**Zahtevi:** FR-11, BR-01, E-02, EP-06 `premium_required` (ekrani S03, S06) · **Prioritet:** P1 (kritično) · **Nalog:** marko.jovanovic@mojljubimac.test
**Preduslovi:** Marko ima 2 uspomene i 1 aktivnog ljubimca (dodaj/premesti po potrebi).
**Koraci:**
1. Otvori `/uspomene` i pogledaj brojač.
2. Na kartonu aktivnog ljubimca pokušaj „Premesti u Uspomene".
**Očekivani rezultat:** Brojač „2 / 2 uspomene". Treća uspomena je blokirana Premium zaključavanjem u dijalogu („Dostupno u Premiumu" + „Probaj 7 dana besplatno"); ljubimac ostaje aktivan. Za Premium nalog (Ivana) na `/uspomene` stoji „Premium · bez ograničenja".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PET-028 — Vraćanje iz Uspomena (slobodan i zauzet slot)
**Zahtevi:** FR-12, E-03, EP-07 (ekran S06) · **Prioritet:** P1 (kritično) · **Nalog:** marko.jovanovic@mojljubimac.test
**Preduslovi:** Marko ima 1 aktivnog ljubimca i bar 1 uspomenu.
**Koraci:**
1. Na `/uspomene` klikni „Vrati među aktivne" na uspomeni.
2. Premesti aktivnog ljubimca u Uspomene (ako ima mesta) ili ga obriši, tako da nema aktivnog.
3. Ponovo klikni „Vrati među aktivne".
4. Otvori karton vraćenog ljubimca i `/podsetnici`.
**Očekivani rezultat:** 1: blokirano — „Vraćanje ljubimca među aktivne" / „Na Free planu imaš jednog aktivnog ljubimca, a to mesto zauzima {ime aktivnog}. Uz Premium možeš da vratiš i ovog ljubimca ({ime})." 3: kartica nestaje iz Uspomena, poruka „{ime} je ponovo među aktivnim ljubimcima."; ljubimac je na `/ljubimci`. Podsetnici čiji je datum u budućnosti ponovo rade. Na kartonu uspomene (pre vraćanja) nema stavke „Premesti u Uspomene".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

---

## PDF izvoz

### TS-PET-029 — PDF izvoz kartona (Premium) i srpska slova
**Zahtevi:** FR-10, BR-02, EP-16 (ekran S03), vlasnička odluka Step 16 · **Prioritet:** P1 (kritično) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Ljubimac sa imenom i podacima koji sadrže č, ć, š, ž, đ (npr. ime „Žuća", rasa „Domaća kratkodlaka", napomena „Đurđevak, šećer, čokolada"), sa težinom, vakcinom, terapijom, pregledom sa jednim slikovnim i jednim PDF prilogom.
**Koraci:**
1. Na kartonu klikni „Izvezi PDF".
2. Otvori preuzeti fajl.
**Očekivani rezultat:** Dugme pokazuje da se PDF pravi, zatim poruka „Karton je spreman: Žuća-karton.pdf" i preuzima se fajl `Žuća-karton.pdf`. U PDF-u: naslov „Karton ljubimca — Žuća"; sekcije kao na kartonu (osnovni podaci, vakcine, terapije, pregledi, težina) i „Prilozi"; slika je ugrađena, PDF prilog je naveden po imenu; podnožje „Moj Ljubimac · {datum}". Sva slova č, ć, š, ž, đ (i velika) su ispravna — nema kvadratića ni upitnika. Na EN: naslov „Pet record — Žuća".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PET-030 — PDF izvoz na Free planu
**Zahtevi:** FR-10, E-25, EP-16 `premium_required` (ekran S03) · **Prioritet:** P1 (kritično) · **Nalog:** marko.jovanovic@mojljubimac.test
**Preduslovi:** Marko (Free) ima ljubimca.
**Koraci:**
1. Na kartonu klikni „Izvezi PDF".
**Očekivani rezultat:** PDF se ne pravi. Prikazuje se Premium zaključavanje „Izvoz kartona u PDF" / „Izvezi ceo karton u PDF — za veterinara, groomera ili granicu." sa „Probaj 7 dana besplatno" (vodi na `/premium`).
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

---

## Prava pristupa

### TS-PET-031 — Član domaćinstva na kartonu deljenog ljubimca
**Zahtevi:** FR-28, BR-22, BR-23, E-12, EP-02 (ekran S03) · **Prioritet:** P1 (kritično) · **Nalog:** jelena.nikolic@mojljubimac.test (član) + ivana.petrovic@mojljubimac.test (vlasnik)
**Preduslovi:** Ivana je na `/domacinstvo` pozvala Jelenu, Jelena je prihvatila poziv, a Ivana je delila Lunu (prekidač za Lunu uključen). Luna ima težinu, vakcinu, terapiju i pregled koje je unela Ivana.
**Koraci:**
1. Prijavi se kao Jelena i otvori karton Lune.
2. Pregledaj sve tabove.
3. Na tabu Težina dodaj merenje, pa ga izmeni.
4. Na Ivaninom merenju potraži „Još opcija".
5. Na tabu Terapije klikni „Doza data".
6. Pokušaj da otvoriš `/ljubimci/<id Lune>/vakcine/nova` i `/ljubimci/<id Lune>/izmena` ručno.
**Očekivani rezultat:** Na vrhu: „Ti si član domaćinstva (vlasnik: Ivana Petrović). Možeš da pregledaš karton, označiš podsetnike i date doze, a medicinske unose menja samo vlasnik." Dugmad za dodavanje/izmenu vakcina, terapija, pregleda, priloga, „Izmeni", „Izvezi PDF", „Premesti u Uspomene" i „Obriši trajno" NISU prikazana (sakrivena, ne zasivljena). Jelena može „Dodaj merenje" i „Doza data" (dnevnik doza pokazuje Jelenino ime) i može da menja/briše SVOJE merenje; na Ivaninim unosima nema menija. Ručne adrese ne dozvoljavaju čuvanje.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PET-032 — Tuđi ljubimac se ne vidi
**Zahtevi:** FR-34, API §4.3 `not_found` (ekran S03) · **Prioritet:** P1 (kritično) · **Nalog:** marko.jovanovic@mojljubimac.test + ivana.petrovic@mojljubimac.test
**Preduslovi:** Kao Ivana kopiraj adresu kartona jednog njenog ljubimca koji NIJE deljen (`/ljubimci/<id>`).
**Koraci:**
1. Prijavi se kao Marko i otvori kopiranu adresu.
2. Dodaj na kraj `/vakcine/nova` i `/izmena` i otvori.
**Očekivani rezultat:** Prikazuje se stanje greške („Nešto nije u redu. Pokušaj ponovo." ili da karton nije pronađen) — bez ijednog podatka o Ivaninom ljubimcu. Marko ne može ništa da sačuva na tom ljubimcu.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

---

## Telefon, jezik i pristupačnost

### TS-PET-033 — Ljubimci i karton na telefonu (375 px)
**Zahtevi:** NFR-03 (ekrani S01, S02, S03, S05) · **Prioritet:** P2 (važno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Telefon ili alat za programere, širina 375 px. Luna ima unose na svim tabovima.
**Koraci:**
1. Otvori `/ljubimci`, karton Lune, prođi kroz sve tabove.
2. Otvori „Novi pregled" i dodaj prilog sa telefona (kamera ili galerija).
3. Otvori dijalog „Dodaj merenje".
**Očekivani rezultat:** Nema horizontalnog skrolovanja; tabovi su čitljivi (mogu da se skroluju vodoravno unutar trake, ali stranica ne); duga imena fajlova su skraćena „…"; „Osnovni podaci" i „Moj veterinar" su ispod sadržaja; dijalozi staju na ekran; donja navigacija ne prekriva dugmad za čuvanje.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PET-034 — Karton na engleskom
**Zahtevi:** FR-35, NFR-05 (ekrani S01–S06, S27) · **Prioritet:** P2 (važno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Jezik prebačen na English u `/profil`.
**Koraci:**
1. Prođi kroz `/ljubimci`, karton, sve tabove, formu nove vakcine, terapije, pregleda, `/uspomene`.
2. Izazovi po jednu grešku validacije u svakoj formi.
3. Obriši jedno merenje (dijalog).
**Očekivani rezultat:** Sav tekst je na engleskom, uključujući greške, prazna stanja, poruke posle čuvanja i dijalog „Delete this entry?" / „This can't be undone." / „Yes, delete" / „Cancel". Imena ljubimaca se ne prevode. Vrednosti: „4.2 kg", datumi „19 Oct 2026". ⚠ Vrati jezik na srpski.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PET-035 — Dodavanje ljubimca i vakcine samo tastaturom
**Zahtevi:** NFR-04, Design §10 (ekrani S02, S04) · **Prioritet:** P2 (važno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Računar bez miša.
**Koraci:**
1. Tab-om dođi do „Dodaj ljubimca", Enter. Popuni formu: listu „Vrsta" otvori Enter/strelicama, pol strelicama, datum preko izbornika datuma tastaturom. Sačuvaj.
2. Na kartonu Tab-om dođi do taba Vakcine (strelice levo/desno menjaju tab), „Dodaj vakcinu", popuni i sačuvaj.
3. Otvori meni „Još opcija" i dijalog brisanja, zatvori ga Esc.
**Očekivani rezultat:** Sve se može uraditi bez miša; fokus je uvek vidljiv; posle zatvaranja dijaloga fokus se vraća na dugme koje ga je otvorilo; Esc zatvara dijalog bez brisanja.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____
