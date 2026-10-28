# Test scenariji — Podsetnici (REM)

**Oblast:** lista podsetnika i brojač u meniju, automatski podsetnici, ručni podsetnici, „Urađeno", podešavanja po vrsti (unapred, vreme slanja, kanali), push, mejl podsetnik i stranica posle klika na „Urađeno", član domaćinstva.
**Ekrani:** S10 `/podsetnici`, S11 `/podsetnici/novi` i `/podsetnici/[id]`, S12 `/podesavanja/podsetnici`, S01 kartica „Danas", S03 „Sledeći podsetnici", S13 `/domacinstvo` (prekidač za člana), stranica akcije `/api/a/done`.
**Zahtevi:** FR-09, FR-15, FR-20 … FR-24, FR-28, FR-29, BR-12 … BR-18, BR-24, BR-48, BR-49; API EP-25 … EP-29, EP-32, EP-33, EP-38.
**Status izgradnje:** Step 17, 18, 19 i 22 su gotovi. ⏳ Čeka Step 29 (WhatsApp kanal): povezivanje WhatsApp broja i slanje preko WhatsApp-a — vidi TS-REM-022. ⏳ Čeka Step 30 (noćni poslovi): istek Premium-a koji pravi domaćinstvo „samo za čitanje" — vidi TS-REM-031.

**Okruženje (lokalno):** http://localhost:3000 · Mailpit http://127.0.0.1:54324 · lozinka `MojLjubimac123!`
**Važno za slanje lokalno:**
- Lokalno se podsetnici NE šalju sami od sebe po rasporedu. Programer pokreće slanje ručno (poziv `/api/internal/dispatch`, opisan u README → „Scheduled jobs"). U scenarijima koji traže slanje, pre provere zamoli programera da pokrene slanje (ili da ti pokaže kako).
- Push i WhatsApp se lokalno ne šalju — samo se upisuju u log servera.
- Mejl podsetnika treba da se vidi u Mailpit-u. Ako lokalno nije podešen ključ za slanje mejlova, mejl se samo ispisuje u log servera; tada zamoli programera za tekst i link „Urađeno" iz loga, a u napomeni zapiši da je mejl proveren iz loga.
**Test nalozi:** ivana.petrovic@mojljubimac.test (Premium) · marko.jovanovic@mojljubimac.test (Free) · jelena.nikolic@mojljubimac.test (Free, član Ivaninog domaćinstva).
**Podrazumevana podešavanja (BR-48):** vakcine 7 dana pre i na dan u 09:00; kontrole 1 dan pre i na dan u 09:00; rođendani i moji podsetnici na dan u 09:00; doze i obroci tačno u zadato vreme; kanali Mejl + Push.

---

## Lista podsetnika (S10)

### TS-REM-001 — Lista podsetnika, tabovi i brojač u meniju
**Zahtevi:** FR-20, FR-24, EP-25 (ekran S10, meni) · **Prioritet:** P1 (kritično) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Ivana ima bar 2 podsetnika za danas koji nisu urađeni (npr. ručni podsetnik za danas kasnije i doza terapije danas), bar jedan za narednih dana i bar jedan urađen.
**Koraci:**
1. Pogledaj stavku „Podsetnici" u bočnom meniju (računar) i u donjoj navigaciji (telefon).
2. Otvori `/podsetnici`.
3. Klikni redom tabove „Danas", „Uskoro", „Propušteno", „Urađeno".
4. Označi jedan današnji podsetnik kao „Urađeno" i osveži stranicu.
**Očekivani rezultat:** Na „Podsetnici" stoji broj = broj današnjih neurađenih podsetnika; kad je 0, broja nema. Naslov „Podsetnici", ispod „Ljubimci: … — i podsetnici za tebe.", dugmad „Podešavanja" i „Novi podsetnik". Svaki red: slika ljubimca ili „Za mene", naslov, vreme, ikonice kanala, oznaka stanja i dugme „Urađeno". Posle označavanja broj u meniju se smanjuje za 1, a podsetnik je u tabu „Urađeno" sa vremenom i imenom (npr. „19. 10. 2026. u 10:15 · Ivana").
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-REM-002 — Prazna stanja liste
**Zahtevi:** EP-25 (ekran S10), Design §12 S10 · **Prioritet:** P3 (sitno) · **Nalog:** novi nalog (vlasnik, bez ljubimaca)
**Preduslovi:** Nov, potvrđen nalog.
**Koraci:**
1. Otvori `/podsetnici` i prođi kroz sva 4 taba.
2. Otvori `/ljubimci` i pogledaj karticu „Danas".
**Očekivani rezultat:** „Danas nema podsetnika" / „Podsetnike pravimo sami iz vakcina, terapija, kontrola i obroka. Možeš dodati i svoj."; „Ništa ne stiže uskoro" / „Kad uneseš vakcinu sa datumom sledeće doze, podsetnik se pojavi ovde."; „Ništa nije propušteno" / „Sve je pod kontrolom. Propušteni podsetnici bi se pojavili ovde."; „Još ništa nije urađeno" / „Kad označiš podsetnik kao urađen, videćeš ga ovde sa vremenom i imenom." Na `/ljubimci` kartica „Danas" kaže „Danas nema podsetnika." bez broja i linka. Brojač u meniju ne postoji.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

---

## Automatski podsetnici

### TS-REM-003 — Podsetnik iz vakcine (pravljenje, pomeranje, brisanje)
**Zahtevi:** FR-05, FR-20, BR-12, E-01, EP-09 (ekrani S04, S10, S03) · **Prioritet:** P1 (kritično) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Luna; podešavanja za vakcine su podrazumevana.
**Koraci:**
1. Dodaj vakcinu sa „Datum sledeće doze" = za 20 dana.
2. Otvori `/podsetnici` → „Uskoro" i karton Lune → tab Pregled („Sledeći podsetnici").
3. Izmeni vakcinu: sledeća doza za 25 dana. Ponovo proveri.
4. Obriši vakcinu. Ponovo proveri.
**Očekivani rezultat:** Posle 1: u „Uskoro" postoji podsetnik za vakcinu (ikonica šprica) za Lunu na datum sledeće doze u 09:00, i pojavljuje se u „Sledeći podsetnici" na kartonu. Posle 3: isti podsetnik je pomeren (nema duplog). Posle 4: podsetnika nema.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-REM-004 — Podsetnici za doze terapije
**Zahtevi:** FR-06, FR-20, BR-13, BR-49, EP-10 (ekrani S27, S10) · **Prioritet:** P1 (kritično) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Luna.
**Koraci:**
1. Dodaj terapiju sa početkom SUTRA, „Na svakih" 12 sati, trajanje 3 dana.
2. Otvori `/podsetnici` → „Uskoro".
3. Dodaj drugu terapiju sa početkom DANAS (posle 08:00), na svakih 1 dan, bez kraja.
4. Pogledaj „Danas".
**Očekivani rezultat:** Za prvu: doze sutra u 08:00 i 20:00, pa naredna 2 dana isto (ukupno 6), poslednja pre kraja trećeg dana. Za drugu: prva doza danas u prvi sledeći pun sat (npr. ako je sada 10:20 → 11:00), zatim svaki dan u to vreme. Doze nemaju „unapred" — stižu tačno u vreme doze.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-REM-005 — Podsetnik za kontrolu posle pregleda
**Zahtevi:** FR-07, FR-20, EP-12 (ekrani S05, S10) · **Prioritet:** P2 (važno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Luna.
**Koraci:**
1. Dodaj pregled sa „Datum kontrole" = za 10 dana.
2. Proveri `/podsetnici` → „Uskoro".
3. Izmeni pregled i obriši datum kontrole.
**Očekivani rezultat:** Posle 1: podsetnik za kontrolu (ikonica stetoskopa) za Lunu na datum kontrole u 09:00. Posle 3: podsetnik je uklonjen.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-REM-006 — Rođendanski podsetnik
**Zahtevi:** FR-09, FR-20, EP-03/EP-04 (ekrani S02, S10) · **Prioritet:** P2 (važno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** —
**Koraci:**
1. Dodaj ljubimca „Kiki" sa tačnim datumom rođenja čiji je rođendan za 5 dana (godina pre 2 godine).
2. Proveri `/podsetnici` → „Uskoro".
3. Izmeni ljubimca: obriši tačan datum, ostavi samo okvirnu godinu.
**Očekivani rezultat:** Posle 1: podsetnik „Rođendan — Kiki" (ikonica torte) na dan rođendana u 09:00. Posle 3: rođendanski podsetnik je uklonjen (okvirna godina ne pravi podsetnik).
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-REM-007 — Automatski podsetnik se ne menja iz liste
**Zahtevi:** Design §12 S10 (CR-12) (ekran S10) · **Prioritet:** P3 (sitno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Postoje i automatski (vakcina) i ručni podsetnik.
**Koraci:**
1. U `/podsetnici` klikni naslov podsetnika za vakcinu.
2. Klikni naslov ručnog podsetnika.
**Očekivani rezultat:** Naslov automatskog podsetnika nije link (menja se na izvoru — u vakcini). Naslov ručnog podsetnika otvara izmenu (`/podsetnici/[id]`, „Izmeni podsetnik").
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-REM-008 — Uspomena zaustavlja podsetnike
**Zahtevi:** FR-11, BR-17, EP-06 (ekrani S03, S10) · **Prioritet:** P2 (važno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Ljubimac sa budućom vakcinom, terapijom i rođendanom.
**Koraci:**
1. Premesti ljubimca u Uspomene.
2. Proveri `/podsetnici` (Danas, Uskoro).
3. Vrati ljubimca među aktivne (`/uspomene` → „Vrati među aktivne").
**Očekivani rezultat:** Posle premeštanja nema nijednog podsetnika tog ljubimca. Posle vraćanja ponovo postoje podsetnici čiji je datum u budućnosti.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

---

## Ručni podsetnici (S11)

### TS-REM-009 — Novi ručni podsetnik „Samo za mene"
**Zahtevi:** FR-21, BR-18, EP-27 (ekran S11) · **Prioritet:** P1 (kritično) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** —
**Koraci:**
1. Na `/podsetnici` klikni „Novi podsetnik".
2. Upiši „Naslov *" = Plati račun u Šapici, „Za koga" = „Samo za mene", datum = sutra, „Vreme *" = 10:00, „Ponavljanje" = „Ne ponavlja se".
3. Klikni „Sačuvaj podsetnik".
**Očekivani rezultat:** Ispod „Samo za mene" piše „Vidiš ga samo ti, nije vezan za ljubimca." Posle čuvanja: „Podsetnik „Plati račun u Šapici“ je sačuvan". U „Uskoro" je red sa „Za mene" (bez slike ljubimca), sutra u 10:00, ikonica zvona.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-REM-010 — Ručni podsetnik za ljubimca sa ponavljanjem
**Zahtevi:** FR-21, BR-18, EP-27 (ekrani S11, S10) · **Prioritet:** P2 (važno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Ivana ima aktivnog ljubimca Maks.
**Koraci:**
1. „Novi podsetnik": naslov „Šišanje u salonu „Čupko”", za koga = Maks, datum za 3 dana, 11:00.
2. Otvori „Ponavljanje" i proveri izbor; izaberi „Svakog meseca".
3. Sačuvaj i pogledaj „Uskoro".
4. Otvori listu „Za koga" i proveri koji su ljubimci ponuđeni.
**Očekivani rezultat:** Izbor ponavljanja: „Ne ponavlja se", „Svaki dan", „Svake nedelje", „Svakog meseca", „Svake godine"; uz mesečno piše „Sledeći put stiže tačno mesec dana kasnije." U „Uskoro" su pojave za za 3 dana i za mesec dana kasnije (u narednih 60 dana). U „Za koga" su samo aktivni ljubimci (ne uspomene) i „Samo za mene".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-REM-011 — Validacija ručnog podsetnika
**Zahtevi:** FR-21, EP-27 (ekran S11), vlasnička odluka Step 17 · **Prioritet:** P2 (važno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Otvoren `/podsetnici/novi`.
**Koraci:**
1. Obriši vreme i klikni „Sačuvaj podsetnik" sa praznim naslovom i bez datuma.
2. Upiši naslov od 81 znaka.
3. Upiši ispravan naslov, izaberi današnji datum i vreme pre sadašnjeg (npr. pre sat vremena).
**Očekivani rezultat:** „Upiši naslov podsetnika.", „Izaberi datum.", „Unesi vreme."; za predug naslov „Naslov može imati najviše 80 znakova."; za prošlo vreme „Izaberi datum i vreme u budućnosti." Podsetnik se ne čuva.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-REM-012 — Izmena ručnog podsetnika
**Zahtevi:** FR-21, EP-27 (ekran S11 izmena) · **Prioritet:** P2 (važno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Ručni mesečni podsetnik iz TS-REM-010.
**Koraci:**
1. U `/podsetnici` klikni naslov podsetnika.
2. Promeni vreme na 12:00 i ponavljanje na „Svake nedelje". Klikni „Sačuvaj izmene".
3. Proveri „Uskoro".
**Očekivani rezultat:** Naslov ekrana „Izmeni podsetnik", polja su popunjena, napomena „Izmene važe za sledeća ponavljanja. Ono što je već prošlo ostaje u istoriji." Posle čuvanja „Izmene su sačuvane"; buduće pojave su sada nedeljne u 12:00; ranije urađene ostaju u „Urađeno".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-REM-013 — Brisanje ručnog podsetnika
**Zahtevi:** FR-21, EP-27 (ekran S11 izmena) · **Prioritet:** P2 (važno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Ručni ponavljajući podsetnik koji već ima bar jednu urađenu pojavu.
**Koraci:**
1. Otvori izmenu podsetnika, klikni „Obriši podsetnik".
2. Klikni „Otkaži", pa ponovo „Obriši podsetnik" → „Da, obriši".
3. Proveri „Uskoro" i „Urađeno".
**Očekivani rezultat:** Dijalog „Obrisati podsetnik „{naslov}“?" / „Sledeća ponavljanja više neće stizati. Ono što je već urađeno ostaje u istoriji." Posle brisanja nema budućih pojava; prethodno urađena pojava ostaje u „Urađeno".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

---

## „Urađeno"

### TS-REM-014 — „Urađeno" iz liste, sa kartice „Danas" i sa kartona
**Zahtevi:** FR-24, EP-26 (ekrani S10, S01, S03) · **Prioritet:** P1 (kritično) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** 3 podsetnika za danas.
**Koraci:**
1. Na `/ljubimci` u kartici „Danas" klikni „Urađeno" na jednom.
2. Na kartonu ljubimca → Pregled → „Sledeći podsetnici" klikni „Urađeno" na drugom.
3. Na `/podsetnici` → „Danas" klikni „Urađeno" na trećem.
4. Otvori „Urađeno".
**Očekivani rezultat:** Posle svakog klika poruka („Označeno kao urađeno: {naslov}" na S01, „Podsetnik označen kao urađen." na kartonu) i red dobija zelenu oznaku „Urađeno". Sva tri su u tabu „Urađeno" sa vremenom i imenom; nestaju iz „Danas" i iz brojača u meniju. Ponovni klik na isti (npr. u drugom tabu pregledača) ne pravi grešku.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-REM-015 — „Urađeno" na podsetniku za dozu upisuje dozu
**Zahtevi:** FR-06, FR-24, EP-26 (ekrani S10, S03) · **Prioritet:** P1 (kritično) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Terapija sa dozom danas (TS-REM-004, druga terapija).
**Koraci:**
1. U `/podsetnici` → „Danas" klikni „Urađeno" na dozi.
2. Otvori karton → tab Terapije → „Dnevnik doza".
**Očekivani rezultat:** U dnevniku doza je novi red sa vremenom i imenom (samo jedan — nema duplog upisa).
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-REM-016 — Ponovno slanje posle 30 minuta i „Propušteno"
**Zahtevi:** FR-24, BR-15, E-05, EP-33 (ekran S10) · **Prioritet:** P2 (važno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Ručni podsetnik za za ~5 minuta. Programer pokreće slanje kad podsetnik dospe, pa ponovo posle 30 i posle 60 minuta.
**Koraci:**
1. Sačekaj vreme podsetnika; posle slanja proveri Mailpit (mejl #1). Ne klikći „Urađeno".
2. Posle 30+ minuta (i novog pokretanja slanja) proveri Mailpit.
3. Posle još 30 minuta (i novog pokretanja) otvori `/podsetnici` → „Propušteno".
4. Klikni „Urađeno" na propuštenom podsetniku.
**Očekivani rezultat:** Mejl stiže jednom u vreme podsetnika i još tačno jednom posle 30 minuta (ne više). Zatim je podsetnik u „Propušteno" sa crvenom oznakom „Propušteno"; tab ima napomenu „Ove podsetnike smo poslali dva puta, ali niko ih nije označio kao urađene." I propušten podsetnik može naknadno da se označi kao urađen.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

---

## Podešavanja podsetnika (S12)

### TS-REM-017 — Podrazumevana podešavanja po vrsti
**Zahtevi:** FR-22, FR-23, BR-48, EP-28 (ekran S12) · **Prioritet:** P2 (važno) · **Nalog:** novi nalog (vlasnik, Free)
**Preduslovi:** Nov, potvrđen nalog.
**Koraci:**
1. Otvori `/podesavanja/podsetnici` (ili „Podešavanja" na `/podsetnici`).
2. Pogledaj karticu „Kanali" i karticu za svaku vrstu.
**Očekivani rezultat:** Naslov „Podešavanja podsetnika" / „Za svaku vrstu biraš koliko ranije, u koliko sati i kojim kanalima stižu." Kanali: „Mejl stiže uvek na {tvoj mejl}…", Push „Isključeno". Kartice: Vakcine („Iz datuma sledeće doze u kartonu.") — „7 dana pre" i „Na dan", 09:00; Terapije i doze — „Stižu tačno u zadato vreme."; Kontrole — „1 dan pre" i „Na dan", 09:00; Obroci — „Stižu tačno u zadato vreme."; Rođendani i Moji podsetnici — „Na dan", 09:00. Kanali svuda Mejl + Push uključeni; WhatsApp zaključan (vidi TS-REM-021); Viber se ne prikazuje.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-REM-018 — Izmena „koliko ranije", vremena slanja i kanala
**Zahtevi:** FR-22, FR-23, BR-13, BR-14, EP-28 (ekrani S12, S10) · **Prioritet:** P1 (kritično) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Ivana ima vakcinu sa sledećom dozom za 20 dana.
**Koraci:**
1. U kartici „Vakcine" uključi „14 dana pre" i „1 dan pre", isključi „7 dana pre"; „Vreme slanja" = 18:30; ostavi samo kanal Mejl. Klikni „Sačuvaj podešavanja".
2. Osveži stranicu.
3. Proveri `/podsetnici` → „Uskoro" (vreme podsetnika za vakcinu).
**Očekivani rezultat:** Ponuđene vrednosti: „Na dan", „1 dan pre", „3 dana pre", „7 dana pre", „14 dana pre", „30 dana pre" (može više odjednom). Posle čuvanja „Podešavanja su sačuvana." i izmene ostaju posle osvežavanja. Podsetnik za vakcinu je sada u 18:30; slanje ide 14 dana pre, 1 dan pre i na dan (proverava se slanjem — mejl, bez push-a).
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-REM-019 — Validacija podešavanja
**Zahtevi:** FR-22, FR-23, EP-28 (ekran S12), vlasnička odluka Step 18 · **Prioritet:** P2 (važno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Otvoren S12.
**Koraci:**
1. U kartici „Rođendani" isključi sve vrednosti „koliko ranije".
2. U kartici „Kontrole" obriši vreme slanja.
3. U kartici „Moji podsetnici" isključi sve kanale.
4. Klikni „Sačuvaj podešavanja".
**Očekivani rezultat:** „Izaberi bar jedno vreme podsećanja.", „Upiši vreme slanja.", „Izaberi bar jedan kanal." Ništa se ne čuva dok se greške ne isprave.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-REM-020 — Doze i obroci nemaju „unapred" ni vreme slanja
**Zahtevi:** FR-22, BR-13 (ekran S12) · **Prioritet:** P3 (sitno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Otvoren S12.
**Koraci:**
1. Pogledaj kartice „Terapije i doze" i „Obroci".
**Očekivani rezultat:** Obe pokazuju „Stižu tačno u zadato vreme." i samo izbor kanala — bez „Koliko ranije" i „Vreme slanja".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-REM-021 — Free korisnik ne može WhatsApp/Viber
**Zahtevi:** FR-23, BR-14, E-09, EP-28 (ekran S12), vlasnička odluka Step 18 · **Prioritet:** P1 (kritično) · **Nalog:** marko.jovanovic@mojljubimac.test
**Preduslovi:** Marko je Free.
**Koraci:**
1. Otvori S12.
2. U kartici „Kanali" pogledaj WhatsApp deo.
3. U svakoj kartici vrste pokušaj da štikliraš WhatsApp.
4. Potraži Viber.
**Očekivani rezultat:** WhatsApp u „Kanali" je iza Premium zaključavanja („Dostupno u Premiumu", „Poveži broj telefona i primaj važne podsetnike i na WhatsApp-u, pored mejla i push obaveštenja.", „Probaj 7 dana besplatno" → `/premium`). U svakoj vrsti je WhatsApp štikla onemogućena sa oznakom „Premium" (čitač ekrana čita „Dostupno u Premiumu"). Viber se nigde ne prikazuje. Nema brojača WhatsApp poruka.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-REM-022 — Premium: WhatsApp „Uskoro dostupno"
⏳ **Čeka Step 29** (WhatsApp kanal). Dok Step 29 nije gotov, proveri samo stanje „Uskoro dostupno" ispod; povezivanje broja i slanje testiraj kad Step 29 bude gotov.
**Zahtevi:** FR-23, CR-13, BR-14b (ekran S12) · **Prioritet:** P2 (važno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Ivana je Premium.
**Koraci:**
1. Otvori S12, pogledaj WhatsApp deo u „Kanali".
2. Pogledaj WhatsApp štiklu u karticama vrsta.
**Očekivani rezultat:** WhatsApp ima oznaku „Uskoro dostupno" i tekst „WhatsApp podsetnici stižu uskoro. Javićemo ti mejlom kad budeš mogao/la da povežeš broj — do tada podsetnici stižu mejlom i push-om." Nema forme za broj. U svakoj vrsti WhatsApp štikla je onemogućena i prazna, sa „Uskoro dostupno". Brojač „… od 30 WhatsApp poruka ovog meseca" se ne prikazuje. Viber se ne prikazuje.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-REM-023 — Push obaveštenja: uključivanje, blokirano, nepodržano
**Zahtevi:** FR-23, EP-29 (ekran S12), vlasnička odluka Step 18 · **Prioritet:** P2 (važno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Chrome ili Firefox na računaru. (Lokalno se push poruke ne šalju — proverava se samo uključivanje.)
**Koraci:**
1. U „Kanali" → Push klikni „Uključi obaveštenja u ovom pregledaču" i u prozoru pregledača izaberi „Dozvoli".
2. Osveži stranicu. Klikni „Isključi u ovom pregledaču".
3. U podešavanjima sajta u pregledaču blokiraj obaveštenja za localhost i osveži S12.
4. U pregledaču koji ne podržava push (ili ako programer potvrdi da lokalni VAPID ključ nije podešen) otvori S12.
**Očekivani rezultat:** 1–2: status „Uključeno" i tekst „Ovaj pregledač prima obaveštenja. Na drugom uređaju ih uključuješ posebno."; posle isključivanja „Isključeno". 3: „Blokirano u pregledaču" i „Pregledač je blokirao obaveštenja za Moj Ljubimac. Klikni na ikonicu katanca pored adrese, dozvoli obaveštenja i osveži stranicu." + „Proveri ponovo". 4: dugme za push se ne prikazuje; piše „Ovaj pregledač ne podržava push obaveštenja."
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-REM-024 — iPhone napomena za push
**Zahtevi:** FR-23, RISK-09 (ekran S12), vlasnička odluka Step 18 · **Prioritet:** P3 (sitno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** iPhone sa Safarijem (i opciono Android telefon). Za lokalno testiranje telefon mora da vidi računar u mreži — ako ne može, izvrši na produkciji.
**Koraci:**
1. Na iPhone-u u Safariju otvori S12.
2. Dodaj sajt na početni ekran („Podeli" → „Dodaj na početni ekran") i otvori ga sa ikonice; ponovo otvori S12.
3. Otvori S12 na Android telefonu i na računaru.
**Očekivani rezultat:** 1: kartica „Koristiš iPhone?" / „Push obaveštenja rade tek kad dodaš aplikaciju." sa koracima („Otvori Moj Ljubimac u Safariju.", „Dodirni Podeli.", „Izaberi „Dodaj na početni ekran“ i otvori aplikaciju sa ikonice."). 2 i 3: kartica se NE prikazuje.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

---

## Mejl podsetnik i „Urađeno" iz poruke

### TS-REM-025 — Mejl podsetnika u Mailpit-u
**Zahtevi:** FR-23, FR-24, Design §9.1 `reminder_email`, EP-33 · **Prioritet:** P1 (kritično) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Ivana ima ime „Ivana Petrović" u profilu. Ručni podsetnik za Lunu za ~5 minuta (naslov „Kupi hranu"), i jedan ručni „Samo za mene". Kanal Mejl uključen za „Moji podsetnici". Programer pokreće slanje kad dospeju.
**Koraci:**
1. Posle slanja otvori Mailpit i pronađi mejlove.
2. Pročitaj naslov, tekst, dugmad i podnožje.
**Očekivani rezultat:** Naslov mejla „Luna: Kupi hranu". Tekst „Zdravo, Ivana! Podsetnik: **Kupi hranu** — Luna, {datum} u {vreme}." Dugmad „Urađeno" i „Otvori u aplikaciji", napomena „Dugme „Urađeno“ važi 24 sata.", podnožje „Moj Ljubimac · Ovaj mejl ti šaljemo jer imaš nalog. Obaveštenja menjaš u Podešavanjima." Za podsetnik bez ljubimca umesto imena stoji „Za mene" („Za mene: …"). Datum je u obliku „19. 10. 2026.", vreme po srpskom vremenu. Stiže samo JEDAN mejl po podsetniku (osim ponovnog slanja posle 30 min).
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-REM-026 — Klik na „Urađeno" u mejlu i stranica posle klika
**Zahtevi:** FR-24, EP-32, Design §9.1 `action_done_page` · **Prioritet:** P1 (kritično) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Mejl iz TS-REM-025 (podsetnik nije označen u aplikaciji).
**Koraci:**
1. U Mailpit-u klikni „Urađeno" (može i iz privatnog prozora — prijava nije potrebna).
2. Na stranici klikni „Otvori aplikaciju".
3. Otvori `/podsetnici` → „Urađeno".
4. Klikni „Otvori u aplikaciji" u istom mejlu.
**Očekivani rezultat:** Otvara se jednostavna stranica sa logom: „Označeno kao urađeno" / „Luna: Kupi hranu — označeno u {vreme}." i dugme „Otvori aplikaciju" (vodi na `/podsetnici`). Podsetnik je u „Urađeno" sa Ivaninim imenom. „Otvori u aplikaciji" vodi na `/podsetnici`.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-REM-027 — Iskorišćen i istekao link „Urađeno"
**Zahtevi:** FR-24, EP-32 `invalid_action_token`, Design §9.1 `action_expired_page` · **Prioritet:** P2 (važno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** (a) mejl iz TS-REM-026 čiji je link već kliknut; (b) mejl podsetnika stariji od 24 sata, čiji podsetnik nije označen (pošalji podsetnik danas, ne označavaj ga i klikni link sutra).
**Koraci:**
1. Klikni ponovo „Urađeno" iz mejla (a).
2. Klikni „Urađeno" iz mejla (b) posle više od 24 sata.
**Očekivani rezultat:** 1: ista stranica uspeha „Označeno kao urađeno" (ništa se ne menja, nema greške). 2: „Link je istekao" / „Link važi 24 sata i samo jednom. Otvori aplikaciju i označi podsetnik tamo." + „Otvori aplikaciju". Podsetnik nije označen.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-REM-028 — „Urađeno" iz mejla posle gubitka pristupa
**Zahtevi:** FR-24, FR-30, EP-32 `not_found`, vlasnička odluka Step 19 · **Prioritet:** P2 (važno) · **Nalog:** jelena.nikolic@mojljubimac.test (član) + ivana.petrovic@mojljubimac.test
**Preduslovi:** Jelena je član Ivaninog domaćinstva sa uključenim podsetnicima (TS-REM-029) i dobila je mejl podsetnika za Lunu (neoznačen).
**Koraci:**
1. Kao Ivana na `/domacinstvo` isključi deljenje Lune (ili ukloni Jelenu iz domaćinstva).
2. Kao Jelena klikni „Urađeno" u tom mejlu.
**Očekivani rezultat:** Stranica „Podsetnik nije dostupan" / „Više nemaš pristup ovom podsetniku." + „Otvori aplikaciju". Podsetnik nije označen.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

---

## Član domaćinstva

### TS-REM-029 — Član domaćinstva uključuje podsetnike za deljene ljubimce
**Zahtevi:** FR-28, FR-29, BR-24, EP-25, EP-38 (ekrani S13, S10) · **Prioritet:** P1 (kritično) · **Nalog:** jelena.nikolic@mojljubimac.test + ivana.petrovic@mojljubimac.test
**Preduslovi:** Jelena je prihvatila poziv u Ivanino domaćinstvo; Luna je deljena i ima podsetnike za danas i narednih dana.
**Koraci:**
1. Kao Jelena otvori `/podsetnici`.
2. Na `/domacinstvo` pogledaj prekidač „Moji podsetnici za deljene ljubimce" i uključi ga.
3. Ponovo otvori `/podsetnici`; označi jedan Lunin podsetnik „Urađeno".
4. Otvori S12 kao Jelena.
5. Pokreni slanje (programer) za Lunin podsetnik i proveri Mailpit.
6. Kao Ivana pogledaj „Urađeno".
**Očekivani rezultat:** 1: Luninih podsetnika NEMA (podrazumevano isključeno). 2: tekst „Uključi ako želiš da i tebi stižu podsetnici za deljene ljubimce (Luna…). Stižu samo mejlom i push-om."; posle uključivanja „Podsetnici su uključeni." 3: Lunini podsetnici se vide; „Urađeno" radi. 5: Jelena dobija mejl (i Ivana dobija svoj) — za Jelenu nikad WhatsApp, bez obzira na Ivanin Premium. 6: Ivana vidi podsetnik kao urađen sa Jeleninim imenom. Jelena ne može da napravi ručni podsetnik vezan za Lunu (Luna nije ponuđena u „Za koga").
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-REM-030 — Isključivanje podsetnika za člana
**Zahtevi:** FR-29, EP-38 (ekrani S13, S10) · **Prioritet:** P3 (sitno) · **Nalog:** jelena.nikolic@mojljubimac.test
**Preduslovi:** Završen TS-REM-029.
**Koraci:**
1. Na `/domacinstvo` isključi prekidač.
2. Otvori `/podsetnici`; pokreni slanje za naredni Lunin podsetnik i proveri Mailpit.
**Očekivani rezultat:** „Podsetnici su isključeni."; Lunini podsetnici nestaju iz Jelenine liste; Jelena ne dobija mejl (Ivana dobija).
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-REM-031 — Član u domaćinstvu „samo za čitanje" ne može da označi podsetnik
⏳ **Čeka Step 30** (istek Premium-a noćnim poslom). Do tada se može testirati samo ako programer ručno postavi da je Ivanin Premium istekao u bazi — dogovori sa programerom ili označi „Blokiran".
**Zahtevi:** FR-32, BR-28, EP-26 / EP-32 `household_read_only`, vlasnička odluka Step 19 · **Prioritet:** P2 (važno) · **Nalog:** jelena.nikolic@mojljubimac.test
**Preduslovi:** Ivanin Premium je istekao; Jelena ima uključene podsetnike i neoznačen mejl podsetnika za Lunu.
**Koraci:**
1. Kao Jelena otvori `/podsetnici`.
2. Klikni „Urađeno" iz mejla.
**Očekivani rezultat:** 1: dugme „Urađeno" se ne prikazuje (stanje samo za čitanje). 2: stranica „Domaćinstvo je samo za čitanje" / „Vlasniku domaćinstva je istekao Premium, pa podsetnik ne možeš da označiš." + „Otvori aplikaciju".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

---

## Jezik, telefon i pristupačnost

### TS-REM-032 — Podsetnici, mejl i stranica akcije na engleskom
**Zahtevi:** FR-35, Design §9.1 (ekrani S10, S11, S12, mejl, `/api/a/done`) · **Prioritet:** P2 (važno) · **Nalog:** marko.jovanovic@mojljubimac.test
**Preduslovi:** Marko prebacuje jezik na English u `/profil`; ima ručni podsetnik za ~5 minuta; programer pokreće slanje.
**Koraci:**
1. Prođi kroz S10 (sva 4 taba), S11 (izazovi grešku za prošlo vreme), S12 (sačuvaj).
2. Otvori mejl podsetnika u Mailpit-u i klikni „Done".
**Očekivani rezultat:** Ekrani su na engleskom („Pick a date and time in the future.", „Settings saved."). Mejl: „Hi Marko! Reminder: **{title}** — {pet}, {date} at {time}.", dugmad „Done" i „Open in the app", „The "Done" button works for 24 hours.", engleski footer. Stranica: „Marked as done" / „{pet}: {title} — marked at {time}." / „Open the app". Personalni podsetnik ima „For me". ⚠ Vrati jezik na srpski.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-REM-033 — Podsetnici na telefonu (375 px) i tastaturom
**Zahtevi:** NFR-03, NFR-04, Design §10 (ekrani S10, S11, S12) · **Prioritet:** P2 (važno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Više podsetnika sa dugim naslovima.
**Koraci:**
1. Na 375 px otvori `/podsetnici`, prođi tabove, klikni „Urađeno"; otvori S11 i S12.
2. Na računaru bez miša: Tab do „Urađeno" i Enter; na S11 popuni formu tastaturom; na S12 Space-om menjaj štikle i vrednosti, sačuvaj.
**Očekivani rezultat:** Telefon: bez horizontalnog skrolovanja, dugi naslovi se lome ili skraćuju, „Urađeno" je dovoljno veliko za prst, broj na ikonici „Podsetnici" u donjoj navigaciji se ažurira. Tastatura: sve radi, fokus je vidljiv, posle „Urađeno" fokus ne „nestaje" na vrh stranice; poruka „Podešavanja su sačuvana." se čita čitačem ekrana.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____
