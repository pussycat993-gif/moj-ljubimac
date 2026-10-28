# 09 — Funkcije koje čekaju izgradnju (ADM, SAPA, WA, JOB, PAY)

**Status:** ⏳ Ovi scenariji su napisani unapred, po dokumentima (PRD, Design, API i odluke vlasnice). Nijedan se ne izvršava dok njegov korak nije označen ✅ u `docs/product/06-build-plan.md` §3. Svaka sekcija na vrhu kaže koji korak čeka.
**Kad korak bude gotov:** pročitaj sekciju ponovo, uporedi tekstove sa aplikacijom i javi ako se nešto razlikuje od dokumenata. Tek onda kreni sa izvršavanjem.
**Okruženje:** lokalno http://localhost:3000 · Mailpit http://127.0.0.1:54324 · lozinka `MojLjubimac123!` · Operater (admin) je `ana.markovic@mojljubimac.test`

---

## ADM — Admin / operater (S26)

> ⏳ Čeka Step 28

### TS-ADM-001 — Ulaz u admin deo samo za operatera
**Zahtevi:** FR-57, EP-68 (ekran S26) · **Prioritet:** P1 (kritično) · **Nalog:** ana.markovic@mojljubimac.test, ivana.petrovic@mojljubimac.test, bez prijave
**Preduslovi:** —
**Koraci:**
1. U privatnom prozoru otvori `/admin`.
2. Prijavi se kao Ivana (nije operater) i otvori `/admin`.
3. Prijavi se kao Ana i otvori `/admin`.
**Očekivani rezultat:** Bez prijave aplikacija vodi na `/prijava?next=/admin`. Ivana se preusmerava na `/ljubimci` i ne vidi nijedan admin podatak. Ana vidi „Administracija" sa karticama „Azili na čekanju", „Partneri", „Statistika", „Kanali" i (posle Step 28c) „Moderacija".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-ADM-002 — Odobravanje azila
**Zahtevi:** FR-42, FR-57, EP-68, Design §9.1 `shelter_approved` (ekrani S26, S20) · **Prioritet:** P1 (kritično) · **Nalog:** ana.markovic@mojljubimac.test + milica.stojanovic@mojljubimac.test
**Preduslovi:** Miličin azil čeka odobrenje.
**Koraci:**
1. U „Azili na čekanju" pronađi Miličin azil (naziv, grad, osoba, napomena, PIB).
2. Klikni „Odobri".
3. Otvori Mailpit (Milica) i klikni dugme iz mejla.
**Očekivani rezultat:** Azil nestaje sa liste na čekanju. Milica dobija mejl „Azil je odobren: {organizacija}" sa dugmetom „Otvori organizaciju", koje vodi na `/organizacija`. Tamo više nema trake „Čeka odobrenje" i sve izmene su dozvoljene. Javna stranica `/o/{slug}` sada radi.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-ADM-003 — Odbijanje azila sa razlogom
**Zahtevi:** FR-57, EP-68, Design §9.1 `shelter_rejected` (ekran S26) · **Prioritet:** P1 (kritično) · **Nalog:** ana.markovic@mojljubimac.test
**Preduslovi:** Novi azil (npr. qa.azil2) čeka odobrenje.
**Koraci:**
1. Klikni „Odbij", u polje „Razlog (opciono)" upiši „Nedostaje dokaz o registraciji udruženja." i potvrdi sa „Da, odbij".
2. Otvori Mailpit.
3. Prijavi se kao taj azil.
**Očekivani rezultat:** Mejl ima naslov „Azil nije odobren: {organizacija}" i telo koje se završava sa „Razlog: Nedostaje dokaz o registraciji udruženja.". Bez upisanog razloga ta rečenica ne postoji. Odbijen azil ne može ništa da menja.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-ADM-004 — Prazna lista azila na čekanju
**Zahtevi:** FR-57 (ekran S26) · **Prioritet:** P3 (sitno) · **Nalog:** ana.markovic@mojljubimac.test
**Preduslovi:** Nijedan azil ne čeka.
**Koraci:**
1. Otvori „Azili na čekanju".
**Očekivani rezultat:** Prikazuje se „Nema azila na čekanju" i „Sve prijave su obrađene. Nove stižu ovde čim se azil registruje.".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-ADM-005 — Novi partner i koordinate
**Zahtevi:** FR-54, FR-57, EP-69 (ekrani S26, S24) · **Prioritet:** P1 (kritično) · **Nalog:** ana.markovic@mojljubimac.test
**Preduslovi:** —
**Koraci:**
1. U „Partneri" klikni „Novi partner" i pokušaj da sačuvaš prazan formular.
2. Popuni naziv, tip „Veterinar", grad „Novi Sad", adresu „Bulevar oslobođenja 45", telefon i „Plaćeno do" (za mesec dana), pa klikni „Pronađi koordinate".
3. Upiši nepostojeću adresu i sačuvaj bez koordinata.
4. Upiši koordinate ručno („Geografska širina", „Geografska dužina") i sačuvaj.
5. Kao Ivana otvori `/partneri`.
**Očekivani rezultat:** Dijalog kaže „Polja sa * su obavezna. Partner je vidljiv dok ne prođe datum „plaćeno do".", a obavezna polja prikazuju greške. Za ispravnu adresu se popunjavaju koordinate. Za nepostojeću adresu se javlja „Adresa nije pronađena. Upiši koordinate ručno i sačuvaj ponovo.". Posle čuvanja se javlja „Partner sačuvan" i partner je vidljiv na `/partneri`. Bez kanala za poruke piše „Dugme „Poruka" se ne prikazuje.".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-ADM-006 — Najviše 3 istaknuta partnera po vrsti u gradu
**Zahtevi:** FR-57, BR-41, EP-69 `featured_limit_reached` (ekran S26) · **Prioritet:** P2 (važno) · **Nalog:** ana.markovic@mojljubimac.test
**Preduslovi:** U Novom Sadu već postoje 3 istaknuta veterinara.
**Koraci:**
1. Uključi „Istaknut" četvrtom veterinaru iz Novog Sada.
**Očekivani rezultat:** Prekidač ima napomenu „Najviše 3 po tipu u gradu." i u tabeli piše „3 / 3 — limit". Pokušaj se odbija porukom „Već postoje 3 istaknuta partnera ove vrste u ovom gradu.".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-ADM-007 — Isteklo „plaćeno do" automatski sakriva partnera
**Zahtevi:** FR-57, BR-40, E-23 (ekrani S26, S24) · **Prioritet:** P1 (kritično) · **Nalog:** ana.markovic@mojljubimac.test + ivana.petrovic@mojljubimac.test
**Preduslovi:** —
**Koraci:**
1. Partneru postavi „Plaćeno do" na jučerašnji datum i sačuvaj.
2. Kao Ivana otvori `/partneri`.
**Očekivani rezultat:** U admin tabeli partner ima status „Istekao — skriven" i i dalje je u listi. Na `/partneri` ga nema.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-ADM-008 — Statistika klikova
**Zahtevi:** FR-58, EP-70 (ekran S26) · **Prioritet:** P2 (važno) · **Nalog:** ana.markovic@mojljubimac.test
**Preduslovi:** U ovom mesecu su korišćeni „Pozovi", „Poruka", „Mejl" i „Sajt" (fajl 08, TS-PART-010 … TS-PART-012).
**Koraci:**
1. Otvori „Statistika" → „Klikovi po partneru".
2. Promeni „Period" na prošli mesec.
**Očekivani rezultat:** Tabela ima redove po partneru i kolone po akciji (Pozovi, Poruka, Mejl, Sajt) i „Ukupno". Brojevi se slažu sa izvršenim klikovima, a sortirano je po ukupnom broju. Za mesec bez klikova se prikazuje „Još nema klikova" i „Kad vlasnici koriste brze akcije, brojke se pojavljuju ovde.".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-ADM-009 — Uključivanje Viber kanala
**Zahtevi:** BR-14b, EP-71, E-27 (ekrani S26, S12) · **Prioritet:** P2 (važno) · **Nalog:** ana.markovic@mojljubimac.test + ivana.petrovic@mojljubimac.test
**Preduslovi:** Viber je isključen.
**Koraci:**
1. Kao Ivana otvori `/podesavanja/podsetnici` i proveri da li se Viber nudi.
2. Kao Ana u „Kanali" uključi Viber, pročitaj dijalog „Uključiti Viber?" i potvrdi sa „Da, uključi".
3. Kao Ivana osveži podešavanja podsetnika.
4. Kao Ana isključi Viber.
**Očekivani rezultat:** Dok je Viber isključen, nigde se ne vidi. Dijalog upozorava „Ovo pokreće trošak od oko 100 € mesečno. …". Posle uključivanja Ivana (Premium) može da izabere Viber. Posle isključivanja Viber nestaje.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

---

## SAPA — Šapa pomoći (S32–S37, S29 Donacije, S26 Moderacija)

> ⏳ Čeka Steps 28a, 28b i 28c (28b: oglasi, javne stranice, profili i podaci za donacije · 28c: poruke, obaveštenja, prijave, blokiranje i moderacija)

### TS-SAPA-001 — Pregled oglasa bez prijave
**Zahtevi:** FR-61, FR-62, EP-73, EP-74 (ekrani S32, S33) · **Prioritet:** P1 (kritično) · **Nalog:** bez prijave
**Preduslovi:** Postoji bar 20 aktivnih oglasa različitih vrsta, gradova i životinja.
**Koraci:**
1. U privatnom prozoru otvori `/sapa-pomoci`.
2. Prođi na drugu stranu („Sledeća").
3. Otvori jedan oglas za prodaju i jedan oglas „Potreba azila".
**Očekivani rezultat:** Naslov je „Šapa pomoći" sa karticom „Oglase možeš da pregledaš i bez naloga. Prijavi se da pošalješ poruku, objaviš oglas ili doniraš azilu.". Nema „Moji oglasi" ni „Novi oglas". Red rezultata glasi „{N} oglasa · najnoviji prvo", a straničenje je „Prethodna · Strana 1 od N · Sledeća". U oglasu se vide fotografije, naslov, cena (npr. „2.500 RSD" ili „Po dogovoru"), grad, opis i „Objavljeno … · Aktivan do …". Umesto akcija stoji „Prijavi se da pošalješ poruku" sa linkom „Napravi nalog". Meni za prijavu i blokiranje se ne vidi.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-SAPA-002 — Filteri i prazan rezultat
**Zahtevi:** FR-61, EP-73 (ekran S32) · **Prioritet:** P2 (važno) · **Nalog:** marko.jovanovic@mojljubimac.test
**Preduslovi:** —
**Koraci:**
1. Izaberi „Prodajem", pa „Kategorija" i „Grad".
2. Izaberi „Poklanjam" i otvori listu kategorija.
3. Izaberi kombinaciju bez rezultata, pa klikni „Poništi filtere".
**Očekivani rezultat:** Prikazuju se samo oglasi koji odgovaraju **svim** filterima. „Lekovi i nega" se nudi samo uz „Sve" ili „Potrebe azila". Prazan rezultat prikazuje „Nema oglasa za ove filtere" i „Probaj drugu kategoriju ili grad, ili poništi filtere." sa dugmetom „Poništi filtere", koje vraća sve oglase.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-SAPA-003 — Novi oglas i validacija
**Zahtevi:** FR-63, BR-54, BR-57, EP-75 (ekran S34) · **Prioritet:** P1 (kritično) · **Nalog:** marko.jovanovic@mojljubimac.test
**Preduslovi:** Marko (Free) ima 0 aktivnih oglasa.
**Koraci:**
1. Otvori „Novi oglas" i klikni „Objavi oglas" bez podataka.
2. Izaberi „Prodajem", upiši naslov „Tra", izaberi kategoriju „Lekovi i nega" i ne upisuj cenu.
3. Štikliraj „Po dogovoru", pa ga odštikliraj i upiši 2500.
4. Ispravi naslov, dodaj 2 fotografije i objavi.
**Očekivani rezultat:** Iznad formulara piše „Aktivni oglasi: 0 / 3 na Free planu" (ili 1 / 3 posle objave). „Potreba" se ne nudi, nego piše „Potrebe sa dugmetom „Doniraj" objavljuju samo odobreni azili.". Greške su „Naslov ima bar 5 znakova, npr. „Poklanjam grebalicu za mačke".", „Lekovi i nega mogu da budu samo potreba azila." i „Upiši cenu u dinarima ili označi „Po dogovoru".". „Po dogovoru" isključuje polje za iznos. Posle objave se javlja „Oglas je objavljen i aktivan je do {datum za 30 dana}.". Prva fotografija je označena „Naslovna", a šesta fotografija ne može da se doda („N / 5").
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-SAPA-004 — Moji oglasi: limit 3 na Free, produženje, rešavanje i istek
**Zahtevi:** FR-63, FR-64, FR-65, BR-55, BR-56, E-28, E-31, EP-76, EP-77, EP-87 (ekrani S35, S34) · **Prioritet:** P1 (kritično) · **Nalog:** marko.jovanovic@mojljubimac.test
**Preduslovi:** Marko ima 3 aktivna oglasa. Programer je jednom oglasu pomerio istek na za 2 dana, a jednom na juče, i pokrenuo dnevni posao za oglase.
**Koraci:**
1. Otvori „Novi oglas".
2. Otvori `/sapa-pomoci/moje` i pogledaj brojač, kartice i statuse.
3. Pogledaj Mailpit.
4. Na oglasu koji uskoro ističe klikni „Produži 30 dana".
5. Jedan oglas označi kao rešen (dijalog „Označiti oglas kao poklonjen?" → „Da, rešeno je").
6. Na isteklom oglasu klikni „Objavi ponovo (30 dana)".
**Očekivani rezultat:** U koraku 1 formular je zamućen iza „Dostupno u Premiumu" sa tekstom „Na Free planu možeš imati 3 aktivna oglasa. Sa Premiumom objavljuješ koliko god želiš — ili označi neki oglas kao rešen.". Na S35 se vide „Aktivni oglasi 3 / 3" i statusi „Ističe za 2 dana" i „Istekao". Mejlovi su „Oglas ističe za 3 dana: {oglas}" i „Oglas je istekao: {oglas}". Produženje daje „Oglas je produžen do {datum}.". Rešen oglas prelazi u „Rešeni" sa „Poklonjeno {datum}". „Objavi ponovo" radi tek kad je ispod 3 aktivna, a dok ih je 3, isključeno je uz objašnjenje „Imaš 3 aktivna oglasa — reši jedan ili pređi na Premium da ponovo objaviš ovaj.".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-SAPA-005 — Potreba azila, „Doniraj" i podaci za donacije
**Zahtevi:** FR-63, FR-66, FR-72, BR-54, BR-58, EP-75, EP-78, EP-88 (ekrani S29, S34, S33) · **Prioritet:** P1 (kritično) · **Nalog:** milica.stojanovic@mojljubimac.test (odobren azil), ivana.petrovic@mojljubimac.test, bez prijave
**Preduslovi:** Azil je odobren.
**Koraci:**
1. Kao Milica na `/organizacija/profil` u kartici „Donacije" upiši račun `160-123`, pa link `http://uplata.rs`, i sačuvaj.
2. Ispravi na `160-0000012345678-90` i `https://uplata.rs`, dodaj adresu i radno vreme, i sačuvaj.
3. Objavi oglas vrste „Potreba", kategorija „Lekovi i nega".
4. Kao Ivana otvori taj oglas i klikni „Doniraj", pa „Kopiraj".
5. Bez prijave klikni „Doniraj".
6. Kao Milica obriši sva polja za donacije, pa kao Ivana ponovo otvori oglas.
**Očekivani rezultat:** Greške su „Upiši račun u obliku 160-0000012345678-90." i „Link za uplatu počinje sa https://". Za potrebu je „Lekovi i nega" dozvoljeno, a oglas ne ulazi u limit. Dijalog „Doniraj: {azil}" kaže „Novac ne prolazi kroz Moj Ljubimac — uplaćuješ ili donosiš direktno azilu." i ima blokove „Uplata na račun" (dugme „Kopiraj" se menja u „Kopirano"), „Online uplata" i „Donošenje u azil". Bez prijave aplikacija traži prijavu i posle nje vraća na oglas. Bez podataka za donacije dugme „Doniraj" ne postoji, nego samo „Pošalji poruku azilu". Volonter vidi karticu „Donacije" samo za čitanje.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-SAPA-006 — Poruke o oglasu (bez realtime-a)
**Zahtevi:** FR-68, FR-69, BR-61, NFR-11, EP-80 … EP-83, Design §9.1 `new_message` (ekrani S33, S36) · **Prioritet:** P1 (kritično) · **Nalog:** ivana.petrovic@mojljubimac.test + marko.jovanovic@mojljubimac.test
**Preduslovi:** Marko ima aktivan oglas.
**Koraci:**
1. Kao Ivana na Markovom oglasu klikni „Pošalji poruku", obriši tekst i pokušaj da pošalješ, pa pošalji „Zdravo! Da li je oglas još aktuelan?".
2. Ponovo klikni dugme za poruku na istom oglasu.
3. Kao Marko, sa već otvorenom stranicom `/poruke`, sačekaj minut bez osvežavanja, pa osveži.
4. Kao Marko otvori razgovor i odgovori. Kao Ivana osveži razgovor.
5. Pogledaj Mailpit (Marko).
6. Kao Marko otvori svoj oglas.
**Očekivani rezultat:** Prazna poruka daje „Napiši poruku pre slanja.". Posle slanja piše „Poruka je poslata. Odgovor stiže u Poruke, a javićemo ti i mejlom." sa dugmetom „Otvori razgovor". Korak 2 otvara isti razgovor, ne novi. Nova poruka se kod Marka pojavljuje **tek posle osvežavanja** (sa brojem nepročitanih na ikonici „Poruke"). Posle čitanja Ivana na svojoj poruci vidi „· Pročitano". Marko dobija mejl „Nova poruka: {oglas}" sa dugmetom „Odgovori". Na svom oglasu Marko ne vidi „Pošalji poruku", nego „Ovo je tvoj oglas".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-SAPA-007 — Prijava oglasa ili korisnika
**Zahtevi:** FR-70, EP-84 (ekrani S33, S36, S37) · **Prioritet:** P1 (kritično) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Postoji Markov oglas i razgovor sa Markom.
**Koraci:**
1. U meniju oglasa izaberi „Prijavi oglas", izaberi razlog „Drugo" bez napomene i pošalji.
2. Upiši napomenu i pošalji.
3. Ponovo prijavi isti oglas.
4. U razgovoru izaberi „Prijavi korisnika".
**Očekivani rezultat:** Razlozi su „Spam ili reklama", „Prevara", „Neprimeren sadržaj", „Dobrobit životinja" i „Drugo". Za „Drugo" je napomena obavezna (najviše 500 znakova). Posle slanja stiže potvrda „Prijava je poslata…". Ponovna prijava pokazuje „Već si prijavio/la ovaj oglas.", a prijava korisnika potvrdu ili „Već si prijavio/la ovog korisnika.".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-SAPA-008 — Blokiranje i odblokiranje
**Zahtevi:** FR-70, BR-59, E-34, EP-85 (ekrani S36, S37, S32) · **Prioritet:** P1 (kritično) · **Nalog:** ivana.petrovic@mojljubimac.test + marko.jovanovic@mojljubimac.test
**Preduslovi:** Postoji razgovor između Ivane i Marka.
**Koraci:**
1. Kao Ivana u razgovoru izaberi „Blokiraj" i potvrdi.
2. Kao Ivana otvori `/sapa-pomoci` i Markov profil.
3. Kao Marko pokušaj da pošalješ poruku Ivani.
4. Kao Ivana klikni „Odblokiraj".
**Očekivani rezultat:** Javlja se „Korisnik Marko J. je blokiran.". U razgovoru piše „Blokirao/la si korisnika …", polje za pisanje je sakriveno, a u inboksu stoji „Blokiran korisnik". Markovi oglasi se Ivani ne prikazuju, a na njegovom profilu piše „Blokirao/la si ovog korisnika. Ne može da ti šalje poruke, a ti ne vidiš oglase te osobe.". Marko dobija grešku ispod polja „Ovoj osobi trenutno ne možeš da pišeš.", Ivani ne stiže mejl i Marko ne saznaje ništa više. Posle odblokiranja se javlja „Korisnik Marko J. je odblokiran." i sve se vraća.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-SAPA-009 — Javni profil korisnika
**Zahtevi:** FR-67, BR-61, EP-79 (ekran S37) · **Prioritet:** P2 (važno) · **Nalog:** bez prijave, ivana.petrovic@mojljubimac.test
**Preduslovi:** Marko ima aktivne oglase.
**Koraci:**
1. Bez prijave sa Markovog oglasa klikni „Pogledaj profil".
2. Kao Ivana otvori isti profil.
3. Otvori profil isključenog (suspendovanog) korisnika.
**Očekivani rezultat:** Profil prikazuje ime za prikaz („Marko J."), grad, „Član od {mesec godina}.", „Aktivnih oglasa: N", liniju „Mejl i telefon se ne prikazuju. Javi se porukom iz nekog od oglasa." i oglase. Mejl i telefon se ne vide nigde. Bez prijave nema menija „⋯". Isključen korisnik daje „Profil nije dostupan".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-SAPA-010 — Moderacija: sakrij, isključi, vrati, odbaci
**Zahtevi:** FR-71, BR-60, E-35, EP-86, Design §9.1 `listing_hidden`, `marketplace_suspended` (ekrani S26, S35, S34, S36) · **Prioritet:** P1 (kritično) · **Nalog:** ana.markovic@mojljubimac.test + marko.jovanovic@mojljubimac.test
**Preduslovi:** Postoje bar 3 otvorene prijave (TS-SAPA-007).
**Koraci:**
1. Kao Ana otvori „Moderacija" (najstarije prijave su prve).
2. Na jednoj prijavi klikni „Odbaci prijavu".
3. Na prijavi oglasa klikni „Sakrij oglas", upiši razlog i potvrdi sa „Da, sakrij".
4. Na prijavi korisnika (Marko) klikni „Isključi korisnika" i potvrdi sa „Da, isključi".
5. Kao Marko otvori `/sapa-pomoci/moje`, „Novi oglas" i jedan razgovor. Pogledaj Mailpit.
6. Kao Ana u „Sakriveni oglasi i isključeni korisnici" klikni „Vrati pristup" i „Vrati oglas".
**Očekivani rezultat:** Odbacivanje daje „Prijava je odbačena. Oglas i korisnik ostaju kakvi jesu.". Sakriven oglas nestaje iz liste, a Marko dobija mejl „Oglas je sakriven: {oglas}" sa razlogom. Na S35 piše „Sakrio operater {datum} — razlog: {razlog}. Piši na podrska@mojljubimac.rs ako misliš da je greška.". Isključenje šalje „Nalog je isključen iz Šape pomoći". Umesto formulara Marko vidi „Ne možeš da objavljuješ oglase", stare poruke čita, ali ne može da šalje nove, a ostatak aplikacije (kartoni, podsetnici) radi. Posle vraćanja sve je kao pre, bez novog mejla. Kad nema prijava, prikazuje se „Nema otvorenih prijava".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

---

## WA — WhatsApp kanal (S12)

> ⏳ Čeka Step 29. Lokalno se WhatsApp ne šalje: kod i poruke se vide samo u logu servera (red `[whatsapp:fake]`). Zamoli programera da ti ih pročita.

### TS-WA-001 — Free korisnik ne može da poveže WhatsApp
**Zahtevi:** FR-23, BR-14, E-09, EP-30 (ekran S12) · **Prioritet:** P1 (kritično) · **Nalog:** marko.jovanovic@mojljubimac.test
**Preduslovi:** —
**Koraci:**
1. Otvori `/podesavanja/podsetnici`.
**Očekivani rezultat:** WhatsApp deo u kartici „Kanali" je zamućen iza „Dostupno u Premiumu" sa tekstom „Poveži broj telefona i primaj važne podsetnike i na WhatsApp-u, pored mejla i push obaveštenja.". U svakoj vrsti podsetnika polje WhatsApp je isključeno, sa oznakom Premium (čitač ekrana čita „Dostupno u Premiumu"). Nema brojača poruka.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-WA-002 — Povezivanje broja kodom
**Zahtevi:** FR-23, EP-30 (ekran S12) · **Prioritet:** P1 (kritično) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Ivana ima Premium i nema povezan broj.
**Koraci:**
1. U „Broj telefona za WhatsApp" upiši `+381 64 123 4567` i klikni „Pošalji kod".
2. Uzmi kod iz loga servera, upiši ga u „Kod iz poruke" i klikni „Potvrdi".
**Očekivani rezultat:** Ispod polja piše „Poslaćemo ti kod na WhatsApp da potvrdimo da je broj tvoj.". Posle slanja piše „Poslali smo kod na +381 64 123 4567." i postoji „Pošalji kod ponovo". Posle potvrde se prikazuje „Povezano: +381 64 123 4567" sa dugmetom „Prekini vezu", a WhatsApp polja u vrstama podsetnika postaju dostupna.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-WA-003 — Pogrešan, kratak ili istekao kod i previše pokušaja
**Zahtevi:** EP-30 `verification_code_invalid`, `rate_limited` (ekran S12) · **Prioritet:** P2 (važno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Kod je poslat.
**Koraci:**
1. Upiši `123` i potvrdi.
2. Upiši pogrešan kod od 6 cifara.
3. Sačekaj 11 minuta i upiši tačan (stari) kod.
4. Klikni „Pošalji kod" 6 puta u sat vremena.
**Očekivani rezultat:** Korak 1 daje „Kod ima 6 cifara. Proveri poruku na WhatsApp-u.". Koraci 2 i 3 daju „Kod nije tačan ili je istekao.". Šesto slanje u satu daje „Previše pokušaja. Pokušaj ponovo za {n} min.".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-WA-004 — Broj na koji WhatsApp ne može da stigne
**Zahtevi:** EP-30 `undeliverable` (ekran S12) · **Prioritet:** P3 (sitno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Programer zna kako da lažni WhatsApp vrati „nedostupan broj" (ili test na produkciji sa pravim brojem bez WhatsApp-a).
**Koraci:**
1. Upiši taj broj i klikni „Pošalji kod".
**Očekivani rezultat:** Ispod polja piše „Na ovaj broj ne možemo da pošaljemo WhatsApp poruku.".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-WA-005 — WhatsApp kao kanal, brojač i granica od 30
**Zahtevi:** FR-23, BR-14a, EP-31 (ekran S12) · **Prioritet:** P1 (kritično) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Broj je povezan. Programer može da postavi brojač na 29.
**Koraci:**
1. Za „Vakcine" štikliraj i Mejl i WhatsApp i klikni „Sačuvaj podešavanja".
2. Pogledaj karticu „WhatsApp poruke".
3. Sa brojačem na 29 sačekaj (ili pokreni) dva podsetnika.
**Očekivani rezultat:** Javlja se „Podešavanja su sačuvana.". Brojač pokazuje „{n} / 30 poruka ovog meseca" i „Kad potrošiš svih 30, do kraja meseca podsetnici stižu mejlom i push-om. Brojač se vraća na nulu {1. sledećeg meseca}.". Trideseta poruka ide na WhatsApp, a sledeći podsetnik stiže samo mejlom (i push-om). Mejl stiže u svakom slučaju, jer je i on izabran.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-WA-006 — „Urađeno" iz WhatsApp poruke
**Zahtevi:** FR-24, EP-32, API §9.1 (WhatsApp webhook) · **Prioritet:** P1 (kritično) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Podsetnik je poslat na WhatsApp. Programer simulira odgovor „Urađeno" (lokalno) ili se testira na produkciji sa pravim telefonom.
**Koraci:**
1. Pritisni „Urađeno" u WhatsApp poruci.
2. Otvori `/podsetnici`.
3. Pritisni isto dugme posle više od 24 sata.
**Očekivani rezultat:** Stiže odgovor „Označeno kao urađeno. {ljubimac}: {naslov} — označeno u {vreme}.", a podsetnik je u aplikaciji „Urađeno". Posle 24 sata odgovor koristi tekst isteklog linka („Link važi 24 sata i samo jednom. Otvori aplikaciju i označi podsetnik tamo.").
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-WA-007 — Prekid veze
**Zahtevi:** FR-23, EP-30 `disconnect` (ekran S12) · **Prioritet:** P2 (važno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Broj je povezan. Jedna vrsta podsetnika ima **samo** WhatsApp.
**Koraci:**
1. Klikni „Prekini vezu".
2. Osveži stranicu i pogledaj kanale po vrstama.
**Očekivani rezultat:** Prikazuje se ponovo polje za broj. WhatsApp je uklonjen iz svih vrsta, a vrsta koja je imala samo WhatsApp sada ima Mejl i Push.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-WA-008 — Član domaćinstva nikad ne dobija WhatsApp za deljene ljubimce
**Zahtevi:** FR-29, BR-24 (ekran S13) · **Prioritet:** P2 (važno) · **Nalog:** jelena.nikolic@mojljubimac.test
**Preduslovi:** Jelena je član sa uključenim podsetnicima. Vlasnica Ivana ima WhatsApp za tu vrstu podsetnika.
**Koraci:**
1. Sačekaj (ili pokreni) podsetnik deljenog ljubimca.
**Očekivani rezultat:** Ivani podsetnik stiže i na WhatsApp, a Jeleni samo mejlom i push-om.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

---

## JOB — Noćni poslovi, nasledstvo i arhiva podataka

> ⏳ Čeka Step 30 (TS-JOB-001 … TS-JOB-007) i Step 30a (TS-JOB-008, TS-JOB-009). Poslovi rade u 03:00 i 03:30 po beogradskom vremenu, a arhive se prave na svakih 5 minuta. Za test ih programer pokreće ručno i pomera datume u bazi.

### TS-JOB-001 — Obaveštenja o isteku Premium-a (30, 7 i 1 dan)
**Zahtevi:** FR-25, BR-09, EP-49, Design §9.1 `premium_expiry_*` · **Prioritet:** P1 (kritično) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Programer postavlja kraj perioda na tačno 30, pa 7, pa 1 dan od danas i posle svakog pokreće noćni posao.
**Koraci:**
1. Posle svakog pokretanja pogledaj Mailpit.
2. Ponovi korak 7 dana sa isključenom automatskom obnovom.
**Očekivani rezultat:** Stižu mejlovi „Premium ističe za 30 dana", „Premium ističe za 7 dana" i „Premium ističe sutra", sa telom „Tvoj Premium traje do {datum}." i dugmetom „Pogledaj pretplatu". Sa uključenom obnovom piše „Obnavlja se automatski — ne moraš ništa da radiš.", a sa isključenom „Posle toga prelaziš na Free: ništa se ne briše, ali dodatni ljubimci i domaćinstvo postaju samo za čitanje.".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-JOB-002 — Obaveštenje se ne ponavlja
**Zahtevi:** FR-25, odluka vlasnice za Step 30 · **Prioritet:** P2 (važno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Mejl za 7 dana je već stigao.
**Koraci:**
1. Programer pokreće noćni posao još dva puta istog dana.
**Očekivani rezultat:** Ne stiže nijedan dodatni mejl za isti prag.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-JOB-003 — Istek Premium-a: Free pravila, domaćinstvo samo za čitanje i WhatsApp prelazi na mejl
**Zahtevi:** FR-25, FR-32, FR-39, BR-16, BR-28, EP-49 (ekrani S18, S13, S12) · **Prioritet:** P1 (kritično) · **Nalog:** ivana.petrovic@mojljubimac.test + jelena.nikolic@mojljubimac.test
**Preduslovi:** Ivana ima otkazanu obnovu, a kraj perioda je juče. Ima domaćinstvo i WhatsApp podsetnike.
**Koraci:**
1. Programer pokreće noćni posao.
2. Kao Ivana otvori `/profil` i `/domacinstvo`. Kao Jelena otvori `/domacinstvo`.
3. Sačekaj podsetnik koji je bio podešen na WhatsApp.
**Očekivani rezultat:** Pretplata je „Isteklo" sa pregledom prekoračenja (kao TS-PREM-011). Domaćinstvo **samo od sebe** postaje samo za čitanje (trake kao TS-HH-025 i TS-HH-026). Podsetnik stiže mejlom i push-om, a ne na WhatsApp.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-JOB-004 — Brisanje naloga posle 30 dana
**Zahtevi:** FR-40, NFR-06, BR-31, EP-52 · **Prioritet:** P1 (kritično) · **Nalog:** novi nalog sa zakazanim brisanjem (fajl 06, TS-PREM-020)
**Preduslovi:** Programer pomera datum brisanja u prošlost i pokreće noćni posao.
**Koraci:**
1. Pokušaj prijavu tim nalogom.
2. Programer proverava da li u bazi i skladištu fajlova postoje ljubimci, fotografije i prilozi tog naloga.
**Očekivani rezultat:** Prijava ne uspeva (kao za nepostojeći nalog). Ljubimci, unosi, prilozi, fotografije, oglasi i arhive tog naloga su obrisani.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-JOB-005 — Nasledstvo domaćinstva
**Zahtevi:** FR-31, BR-27, E-14, EP-52 (ekrani S13, S01) · **Prioritet:** P1 (kritično) · **Nalog:** novi Premium vlasnik sa domaćinstvom + 2 člana (prvi pridružen je Free)
**Preduslovi:** Vlasnik je zakazao brisanje. Programer pomera datum i pokreće noćni posao.
**Koraci:**
1. Kao član koji se prvi pridružio otvori `/ljubimci` i `/domacinstvo`.
2. Kao drugi član otvori `/domacinstvo`.
**Očekivani rezultat:** Prvi član je novi vlasnik i deljeni ljubimci su na njegovoj listi sa celom istorijom. Lični (nedeljeni) ljubimci bivšeg vlasnika su obrisani. Pošto novi vlasnik nema Premium, domaćinstvo je samo za čitanje za sve. Drugi član ostaje član.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-JOB-006 — Nasledstvo organizacije
**Zahtevi:** BR-46, EP-52 (ekran S20) · **Prioritet:** P2 (važno) · **Nalog:** novi azil sa jednim adminom i jednim volonterom; drugi azil sa samo jednim adminom
**Preduslovi:** Jedini admin svakog azila je zakazao brisanje. Programer pomera datum i pokreće posao.
**Koraci:**
1. Kao volonter prvog azila otvori `/organizacija`.
2. Programer proverava drugi azil (bez članova).
**Očekivani rezultat:** Volonter koji se najranije pridružio postaje admin i vidi admin opcije. Organizacija bez članova se briše zajedno sa životinjama i fajlovima, posle istog roka od 30 dana.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-JOB-007 — Noćni istek poziva i kartona
**Zahtevi:** BR-38, BR-47, EP-52 (ekrani S14, S21, S13) · **Prioritet:** P2 (važno) · **Nalog:** ivana.petrovic@mojljubimac.test, milica.stojanovic@mojljubimac.test
**Preduslovi:** Postoje poziv u domaćinstvo star 8 dana, poziv u tim star 8 dana i karton poslat pre 31 dan (datume pomera programer).
**Koraci:**
1. Programer pokreće noćni posao.
2. Otvori sva tri linka i pogledaj „Poslati pozivi" (S13) i S21.
**Očekivani rezultat:** Sva tri linka prikazuju istekao poziv. Na S21 piše „Poziv za karton je istekao {datum} — nije prihvaćen." sa dugmetom „Pošalji ponovo".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-JOB-008 — Arhiva podataka je spremna
**Zahtevi:** FR-41, EP-50, Design §9.1 `data_export_ready` (ekran S19) · **Prioritet:** P1 (kritično) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Ivana je zatražila arhivu (TS-PREM-014).
**Koraci:**
1. Sačekaj do 5 minuta (ili neka programer pokrene posao).
2. Otvori Mailpit i klikni „Preuzmi podatke".
3. Na `/profil/podaci` klikni „Preuzmi ZIP" i otvori arhivu.
**Očekivani rezultat:** Mejl „Tvoji podaci su spremni" kaže „Arhiva sa svim tvojim podacima i kartonima je spremna ({veličina}, npr. „12,4 MB"). Link važi do {datum}.". Dugme vodi na `/profil/podaci`. Kartica je „Arhiva spremna", sa imenom fajla (npr. `moj-ljubimac-ivana-petrovic-{datum}.zip`) i „{veličina} · link važi do {datum za 7 dana}". ZIP sadrži `data.json` (profil, ljubimci, kartoni, dnevnik, trenuci, podsetnici, domaćinstvo, oglasi i poruke) i fasciklu `files/` sa prilozima i fotografijama.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-JOB-009 — Istek arhive posle 7 dana
**Zahtevi:** FR-41, EP-52 (ekran S19) · **Prioritet:** P3 (sitno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Programer pomera rok arhive u prošlost i pokreće noćni posao.
**Koraci:**
1. Otvori `/profil/podaci`.
2. Probaj stari link za preuzimanje.
**Očekivani rezultat:** Kartica je ponovo u osnovnom stanju sa dugmetom „Pripremi arhivu". Stari link više ne radi.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

---

## PAY — Plaćanje i cene

> ⏳ Čeka Step 31, koji je **zaključan** 🔒 dok vlasnica ne izabere provajdera plaćanja (OQ-11) i ne odredi cene (OQ-03).
> **Napomena:** Scenariji ispod su samo okvir po PRD-u (FR-37, FR-42, BR-07, BR-08, BR-11, E-15). Tačni koraci, test kartice i tekstovi biće dopisani kad se izabere provajder. Do tada važi TS-PREM-001 („Plaćanje uskoro dostupno").

### TS-PAY-001 — Premium sa 7 dana besplatno
**Zahtevi:** FR-37, BR-07 (ekrani S17, S18) · **Prioritet:** P1 (kritično) · **Nalog:** novi vlasnički nalog
**Preduslovi:** Nalog nikad nije koristio probni period. Provajder je u test režimu.
**Koraci:**
1. Na `/premium` izaberi Mesečno ili Godišnje i klikni „Probaj 7 dana besplatno".
2. Unesi test karticu kod provajdera.
**Očekivani rezultat:** Prvih 7 dana se ništa ne naplaćuje. Premium je aktivan odmah, a S18 prikazuje probni period i datum prve naplate.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PAY-002 — Iskorišćen probni period: naplata odmah
**Zahtevi:** FR-37, E-15 (ekran S17) · **Prioritet:** P1 (kritično) · **Nalog:** nalog sa iskorišćenim probnim periodom
**Preduslovi:** —
**Koraci:**
1. Na `/premium` klikni „Pretplati se" i plati test karticom.
**Očekivani rezultat:** Nema probnog perioda, prva naplata je odmah i Premium je aktivan.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PAY-003 — Automatska obnova i neuspela naplata
**Zahtevi:** FR-37, FR-38, BR-08, EP-46, EP-49 (ekran S18) · **Prioritet:** P1 (kritično) · **Nalog:** Premium nalog iz TS-PAY-001
**Preduslovi:** Programer pomera kraj perioda.
**Koraci:**
1. Pokreće se obnova sa ispravnom test karticom.
2. Pokreće se obnova sa test karticom koja odbija naplatu.
**Očekivani rezultat:** Ispravna kartica produžava period. Neuspela naplata šalje mejl „Naplata nije uspela" sa linkom na `/premium`, a posle kraja perioda važe Free pravila.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PAY-004 — Odgajivački plan (bez probnog perioda)
**Zahtevi:** FR-42, BR-11, BR-51 (ekrani S20, S22) · **Prioritet:** P2 (važno) · **Nalog:** nova odgajivačnica
**Preduslovi:** Odgajivačnica nema plan.
**Koraci:**
1. Admin odgajivačnice kupuje odgajivački plan.
**Očekivani rezultat:** Nema probnog perioda. Posle plaćanja nestaje traka „Odgajivački plan nije aktivan — sve možeš samo da pregledaš.", a legla, cene i javna stranica rade.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____
