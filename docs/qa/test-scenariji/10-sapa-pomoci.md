# 10 — Šapa pomoći: oglasi, donacije, poruke, prijave i blokiranje (oblast SAPA)

**Status:** ✅ spremno za test (Steps 28a, 28b i 28c gotovi). Moderacija iz ugla operatera je u fajlu 09 (TS-ADM-019 … TS-ADM-023).
**Ekrani:** S32 Šapa pomoći (`/sapa-pomoci`), S33 Oglas (`/sapa-pomoci/[id]`), S34 Novi / izmeni oglas (`/sapa-pomoci/nova`, `/sapa-pomoci/[id]/izmeni`), S35 Moji oglasi (`/sapa-pomoci/moje`), S36 Poruke (`/poruke`, `/poruke/[id]`), S37 Profil korisnika (`/korisnik/[id]`), kartica „Donacije" u S29, kartica „Poruke" u S12, tab „Moderacija" u S26
**Zahtevi:** FR-61 … FR-72, BR-54 … BR-61, E-28 … E-35, NFR-11, UC-11, UC-12, UC-13, OQ-16, OQ-17
**Okruženje:** lokalno http://localhost:3000 · Mailpit http://127.0.0.1:54324 · lozinka `MojLjubimac123!` · Operater je `ana.markovic@mojljubimac.test`

**Pre početka:**
- U aplikaciji se objava zove **oglas**. Vrste oglasa su „Poklanjam" (ponuda bez cene), „Prodajem" (ponuda sa cenom), „Tražim" (potražnja) i „Potreba" (potreba azila sa dugmetom „Doniraj" — samo odobreni azil). U filteru se „Potreba" zove „Potrebe azila".
- Kategorije: „Hrana", „Oprema i igračke", „Nameštaj za ljubimce", „Transporteri", „Lekovi i nega" (samo za potrebu azila), „Ostalo". „Za koga": „Psi", „Mačke", „Ostale životinje".
- Limit aktivnih oglasa: Free vlasnik **3**, odgajivačnica takođe **3** (OQ-16 je još otvoreno — dok vlasnica ne odluči, odgajivački plan ne skida limit), Premium vlasnik i azil bez ograničenja. Potrebe azila se nikad ne računaju. Rešeni, istekli i sakriveni oglasi se ne računaju.
- Miličin azil (`milica.stojanovic`) mora biti **odobren** (fajl 09, TS-ADM-002) pre scenarija sa potrebama azila.
- Poruke **nisu u realnom vremenu** (NFR-11): nova poruka i broj nepročitanih se vide tek posle osvežavanja ili otvaranja stranice. To nije greška.
- Mejlovi o porukama i oglasima stižu u Mailpit. Push se lokalno ne šalje — vidi se samo u logu servera (zamoli programera).
- Istek oglasa i mejl 3 dana pre isteka radi dnevni posao u 09:00 po beogradskom vremenu. Za test programer pomera datum isteka oglasa u bazi i ručno pokreće posao. Reci mu tačno koji oglas (naslov) i koji datum.
- Ime za prikaz: nijedan ekran za sada ne menja nadimak (OQ-17), pa se prikazuje ime i prezime iz profila (npr. „Marko Jovanović"). U primerima ispod piše „{ime}".
- Pripremi test fajlove: `slika.jpg`, `slika.png`, `slika.webp`, `nalaz.pdf`, `velika.jpg` (> 10 MB) i 6 malih JPG slika.
- Za scenarije sa više korisnika koristi dva pregledača (ili običan + privatni prozor).

---

### TS-SAPA-001 — Pregled oglasa bez prijave
**Zahtevi:** FR-61, FR-62, EP-73, EP-74 (ekrani S32, S33) · **Prioritet:** P1 (kritično) · **Nalog:** bez prijave
**Preduslovi:** Postoji dovoljno aktivnih oglasa različitih vrsta, gradova i životinja da lista ima bar dve strane (ako ih nema, zamoli programera da ih doda u lokalnu bazu).
**Koraci:**
1. U privatnom prozoru otvori `/sapa-pomoci`.
2. Prođi na drugu stranu („Sledeća").
3. Otvori jedan oglas za prodaju i jedan oglas „Potreba azila".
**Očekivani rezultat:** Naslov je „Šapa pomoći" sa karticom „Oglase možeš da pregledaš i bez naloga. Prijavi se da pošalješ poruku, objaviš oglas ili doniraš azilu." i dugmetom „Prijavi se". Nema „Moji oglasi" ni „Novi oglas". Red rezultata glasi „{N} oglasa · najnoviji prvo", a straničenje je „Prethodna · Strana 1 od N · Sledeća". U oglasu se vide fotografije, naslov, cena (npr. „2.500 RSD" ili „Po dogovoru"), grad, opis i „Objavljeno … · Aktivan do …". Umesto akcija stoji „Prijavi se da pošalješ poruku" sa linkom „Napravi nalog". Meni „⋯" za prijavu i blokiranje se ne vidi.
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

### TS-SAPA-003 — Novi oglas „Prodajem" i validacija
**Zahtevi:** FR-63, BR-54, BR-57, EP-75 (ekran S34) · **Prioritet:** P1 (kritično) · **Nalog:** marko.jovanovic@mojljubimac.test
**Preduslovi:** Marko (Free) ima 0 aktivnih oglasa.
**Koraci:**
1. Otvori „Novi oglas" i klikni „Objavi oglas" bez podataka.
2. Izaberi „Prodajem", upiši naslov „Tra", izaberi kategoriju „Lekovi i nega" i ne upisuj cenu.
3. Štikliraj „Po dogovoru", pa ga odštikliraj i upiši 2500.
4. Ispravi naslov, izaberi drugu kategoriju, dodaj 2 fotografije i objavi.
**Očekivani rezultat:** Iznad formulara piše „Aktivni oglasi: 0 / 3 na Free planu". „Potreba" se ne nudi, nego piše „Potrebe sa dugmetom „Doniraj“ objavljuju samo odobreni azili.". Greške su „Naslov ima bar 5 znakova, npr. „Poklanjam grebalicu za mačke“.", „Lekovi i nega mogu da budu samo potreba azila." i „Upiši cenu u dinarima ili označi „Po dogovoru“.". „Po dogovoru" isključuje polje za iznos. Ispod cene piše „Plaćanje dogovarate vi — novac ne prolazi kroz Moj Ljubimac.". Posle objave se javlja „Oglas je objavljen i aktivan je do {datum za 30 dana}.", a oglas ima cenu „2.500 RSD". Prva fotografija je označena „Naslovna".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-SAPA-004 — Moji oglasi: limit 3 na Free, produženje, rešavanje i istek
**Zahtevi:** FR-63, FR-64, FR-65, BR-55, BR-56, E-28, E-31, EP-76, EP-77, EP-87 (ekrani S35, S34) · **Prioritet:** P1 (kritično) · **Nalog:** marko.jovanovic@mojljubimac.test
**Preduslovi:** Marko ima 3 aktivna oglasa. Programer je jednom oglasu pomerio istek na za 2 dana, a jednom na juče, i pokrenuo dnevni posao za oglase.
**Koraci:**
1. Otvori „Novi oglas".
2. Otvori `/sapa-pomoci/moje` i pogledaj brojač, kartice i statuse.
3. Pogledaj Mailpit.
4. Na oglasu koji uskoro ističe klikni „Produži 30 dana".
5. Jedan oglas „Poklanjam" označi kao rešen (dijalog „Označiti oglas kao poklonjen?" → „Da, rešeno je").
6. Na isteklom oglasu klikni „Objavi ponovo (30 dana)".
**Očekivani rezultat:** U koraku 1 formular je zamućen iza „Dostupno u Premiumu" sa tekstom „Na Free planu možeš imati 3 aktivna oglasa. Sa Premiumom objavljuješ koliko god želiš — ili označi neki oglas kao rešen.". Na S35 se vide brojač aktivnih oglasa (3 od 3), tekst „Na Free planu imaš do 3 aktivna oglasa. Sakriveni oglasi se ne računaju. Premium: bez ograničenja." i statusi „Ističe za 2 dana" i „Istekao". Mejlovi su „Oglas ističe za 3 dana: {oglas}" i „Oglas je istekao: {oglas}". Produženje daje „„{naslov}“ je produžen do {datum}.". Rešen oglas prelazi u „Rešeni" sa „Poklonjeno {datum}". „Objavi ponovo" radi tek kad je ispod 3 aktivna, a dok ih je 3, isključeno je uz objašnjenje „Imaš 3 aktivna oglasa — reši jedan ili pređi na Premium da ponovo objaviš ovaj.".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-SAPA-005 — Potreba azila, „Doniraj" i podaci za donacije
**Zahtevi:** FR-63, FR-66, FR-72, BR-54, BR-58, EP-75, EP-78, EP-88, OQ-17 (ekrani S29, S34, S33) · **Prioritet:** P1 (kritično) · **Nalog:** milica.stojanovic@mojljubimac.test (odobren azil), ivana.petrovic@mojljubimac.test, bez prijave
**Preduslovi:** Azil je odobren.
**Koraci:**
1. Kao Milica na `/organizacija/profil` u kartici „Donacije" upiši „Broj računa" `160-123`, pa „Link za uplatu" `http://uplata.rs`, i sačuvaj.
2. Ispravi na `160-0000012345678-90` i `https://uplata.rs`, dodaj „Adresa za donošenje" i „Radno vreme za donošenje", i sačuvaj.
3. Objavi oglas vrste „Potreba", kategorija „Lekovi i nega".
4. Kao Ivana otvori taj oglas i klikni „Doniraj", pa „Kopiraj".
5. Bez prijave klikni „Doniraj".
6. Kao Milica obriši sva polja za donacije, pa kao Ivana ponovo otvori oglas.
**Očekivani rezultat:** Greške su „Upiši račun u obliku 160-0000012345678-90." i „Link za uplatu počinje sa https://". Za potrebu je „Lekovi i nega" dozvoljeno, iznad formulara piše „{azil} · bez ograničenja broja oglasa", a oglas ne ulazi u limit. Dijalog „Doniraj: {azil}" kaže „Novac ne prolazi kroz Moj Ljubimac — uplaćuješ ili donosiš direktno azilu." i ima blokove „Uplata na račun" (primalac je naziv azila, „Svrha: Donacija — {naslov oglasa}", dugme „Kopiraj" se menja u „Kopirano"), „Online uplata" (dugme „Uplati online") i „Donošenje u azil". Bez prijave aplikacija traži prijavu i posle nje vraća na oglas. Bez podataka za donacije dugme „Doniraj" ne postoji, nego samo „Pošalji poruku azilu".
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
**Očekivani rezultat:** Polje za poruku je već popunjeno tekstom „Zdravo! Da li je oglas još aktuelan?". Prazna poruka daje „Napiši poruku pre slanja.". Posle slanja piše „Poruka je poslata. Odgovor stiže u Poruke, a javićemo ti i mejlom." sa dugmetom „Otvori razgovor". Korak 2 otvara isti razgovor, ne novi. Nova poruka se kod Marka pojavljuje **tek posle osvežavanja** (sa brojem na ikonici „Poruke"). Posle čitanja Ivana na svojoj poruci vidi „· Pročitano". Marko dobija mejl „Nova poruka: {oglas}" sa tekstom „Zdravo, Marko! Imaš novu poruku o oglasu **{oglas}** (pošiljalac: {ime}): „{početak poruke}“" i dugmetom „Odgovori", koje otvara `/poruke/{id}`. Na svom oglasu Marko ne vidi „Pošalji poruku", nego „Ovo je tvoj oglas".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-SAPA-007 — Prijava oglasa ili korisnika
**Zahtevi:** FR-70, EP-84, odluka vlasnice za Step 28c (ekrani S33, S36) · **Prioritet:** P1 (kritično) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Postoji Markov oglas i razgovor sa Markom.
**Koraci:**
1. U meniju „⋯" oglasa izaberi „Prijavi oglas", izaberi razlog „Drugo" bez napomene i pošalji.
2. Upiši napomenu i pošalji.
3. Ponovo prijavi isti oglas.
4. U razgovoru izaberi „Prijavi korisnika", izaberi razlog i upiši napomenu.
**Očekivani rezultat:** Dijalog prikazuje „Oglas: {naslov}". Razlozi su „Spam ili reklama", „Prevara", „Neprimeren sadržaj", „Dobrobit životinja" i „Drugo". Za „Drugo" je napomena obavezna („Napomena *", greška „Napiši ukratko šta nije u redu."), inače piše „Napomena (opciono)"; najviše 500 znakova. Bez izabranog razloga: „Izaberi razlog prijave.". Posle slanja stiže potvrda „Prijava je poslata" sa „Hvala ti. Operater pregleda prijavu i po potrebi sakriva oglas ili isključuje korisnika iz Šape pomoći." i dugmetom „U redu". Ponovna prijava pokazuje „Već si prijavio/la ovaj oglas.", a ponovna prijava korisnika „Već si prijavio/la ovog korisnika.".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-SAPA-008 — Blokiranje i odblokiranje u razgovoru
**Zahtevi:** FR-70, BR-59, E-34, EP-85, odluka vlasnice za Step 28c (ekrani S36, S37, S32) · **Prioritet:** P1 (kritično) · **Nalog:** ivana.petrovic@mojljubimac.test + marko.jovanovic@mojljubimac.test
**Preduslovi:** Postoji razgovor između Ivane i Marka.
**Koraci:**
1. Kao Ivana u razgovoru izaberi „Blokiraj", pročitaj dijalog „Blokirati korisnika {ime}?" i potvrdi sa „Da, blokiraj".
2. Kao Ivana otvori `/sapa-pomoci` i Markov profil.
3. Kao Marko pokušaj da pošalješ poruku Ivani.
4. Kao Ivana klikni „Odblokiraj".
**Očekivani rezultat:** Dijalog kaže „Ta osoba više neće moći da ti šalje poruke, a ti više nećeš videti njene oglase. Ne dobija obaveštenje o blokadi. Blokadu skidaš na profilu te osobe.". Javlja se „Korisnik {ime} je blokiran.". U razgovoru piše „Blokirao/la si korisnika …", polje za pisanje je sakriveno, a u inboksu stoji „Blokiran korisnik". Markovi oglasi se Ivani ne prikazuju, a na njegovom profilu piše „Blokirao/la si ovog korisnika. Ne može da ti šalje poruke, a ti ne vidiš oglase te osobe.". Marko dobija grešku ispod polja „Ovoj osobi trenutno ne možeš da pišeš.", Ivani ne stiže mejl i Marko ne saznaje ništa više. Posle odblokiranja se javlja „Korisnik {ime} je odblokiran." i sve se vraća.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-SAPA-009 — Javni profil korisnika
**Zahtevi:** FR-67, BR-61, EP-79 (ekran S37) · **Prioritet:** P2 (važno) · **Nalog:** bez prijave, ivana.petrovic@mojljubimac.test
**Preduslovi:** Marko ima aktivne oglase. Postoji jedan korisnik isključen iz Šape pomoći (TS-SAPA-010).
**Koraci:**
1. Bez prijave sa Markovog oglasa klikni „Pogledaj profil".
2. Kao Ivana otvori isti profil.
3. Otvori profil isključenog (suspendovanog) korisnika.
**Očekivani rezultat:** Profil prikazuje ime za prikaz („{ime}"), grad, „Član od {meseca godine}." (npr. „Član od septembra 2026."), „Aktivnih oglasa: N", liniju „Mejl i telefon se ne prikazuju. Javi se porukom iz nekog od oglasa." i sekciju „Aktivni oglasi". Mejl i telefon se ne vide nigde. Bez prijave nema menija „⋯". Isključen korisnik daje „Profil nije dostupan" i „Ovaj korisnik više nije u Šapi pomoći ili je nalog obrisan.".
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
**Očekivani rezultat:** Odbacivanje daje „Prijava je odbačena. Oglas i korisnik ostaju kakvi jesu.". Sakriven oglas nestaje iz liste, a Marko dobija mejl „Oglas je sakriven: {oglas}" sa razlogom. Na S35 piše „Sakrio operater {datum} — razlog: {razlog}. Piši na podrska@mojljubimac.rs ako misliš da je greška.". Isključenje šalje mejl „Nalog je isključen iz Šape pomoći". Umesto formulara Marko vidi „Ne možeš da objavljuješ oglase", stare poruke čita, ali ne može da šalje nove, a ostatak aplikacije (kartoni, podsetnici) radi. Posle vraćanja se javlja „{ime} ponovo može da koristi Šapu pomoći." i „Oglas „{naslov}“ je ponovo vidljiv.", sve je kao pre i ne stiže nov mejl. Kad nema prijava, prikazuje se „Nema otvorenih prijava".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-SAPA-011 — Novi oglas „Poklanjam"
**Zahtevi:** FR-61, FR-63, BR-57, UC-11 (ekrani S34, S32, S33) · **Prioritet:** P1 (kritično) · **Nalog:** jelena.nikolic@mojljubimac.test
**Preduslovi:** Jelena (Free) ima manje od 3 aktivna oglasa.
**Koraci:**
1. Otvori „Novi oglas" i izaberi „Poklanjam". Pročitaj opis vrste.
2. Upiši naslov „Poklanjam grebalicu za mačke", opis, kategoriju „Oprema i igračke", „Za koga" = „Mačke", grad „Novi Sad", dodaj 1 fotografiju i objavi.
3. Otvori `/sapa-pomoci`.
**Očekivani rezultat:** Uz „Poklanjam" piše „Besplatno, nekome kome treba." i kartica „Cena" se ne prikazuje. Ispod formulara piše „Oglas je aktivan 30 dana. Tri dana pre isteka šaljemo ti mejl da ga produžiš.". Posle objave oglas je prvi na listi (najnoviji prvo), sa oznakom „Poklanjam", cenom „Besplatno", gradom, kategorijom, vrstom životinje, autorom i datumom.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-SAPA-012 — Novi oglas „Tražim"
**Zahtevi:** FR-63, BR-54, BR-57 (ekrani S34, S33) · **Prioritet:** P2 (važno) · **Nalog:** jelena.nikolic@mojljubimac.test
**Preduslovi:** Jelena ima manje od 3 aktivna oglasa.
**Koraci:**
1. Izaberi „Tražim" i pročitaj opis vrste.
2. Upiši naslov „Tražim kavez za zeca", popuni obavezna polja bez fotografija i objavi.
3. Otvori oglas.
**Očekivani rezultat:** Uz „Tražim" piše „Tražiš nešto za svog ljubimca.". Nema polja za cenu. Oglas može da se objavi bez fotografija; na kartici i detalju se tada prikazuje zamena za sliku (ikonica), bez greške. Oglas nema cenu u dinarima.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-SAPA-013 — Kategorije i „Lekovi i nega"
**Zahtevi:** FR-63, BR-54, E-29 (ekran S34) · **Prioritet:** P2 (važno) · **Nalog:** marko.jovanovic@mojljubimac.test, milica.stojanovic@mojljubimac.test
**Preduslovi:** Miličin azil je odobren.
**Koraci:**
1. Kao Marko izaberi „Poklanjam" i otvori listu „Kategorija *".
2. Kao Milica izaberi „Potreba", izaberi „Lekovi i nega", pa promeni vrstu na „Poklanjam".
**Očekivani rezultat:** Lista ima „Hrana", „Oprema i igračke", „Nameštaj za ljubimce", „Transporteri", „Ostalo"; „Lekovi i nega" se za Marka ne nudi, a pored polja piše „„Lekovi i nega“ je dostupno samo za potrebe azila.". Kod Milice je „Lekovi i nega" dostupno za „Potreba", a posle promene vrste kategorija se briše i mora ponovo da se izabere („Izaberi kategoriju.").
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-SAPA-014 — Naslov, opis i obavezna polja
**Zahtevi:** FR-63, OQ-17 (d) (ekran S34) · **Prioritet:** P2 (važno) · **Nalog:** marko.jovanovic@mojljubimac.test
**Preduslovi:** Otvoren „Novi oglas".
**Koraci:**
1. Klikni „Objavi oglas" bez ijednog polja.
2. U naslov nalepi tekst od 81 znaka, pa od tačno 80.
3. U opis nalepi tekst od 2001 znaka, pa od tačno 2000.
4. Pređi tasterom Tab preko svakog obaveznog polja bez unosa.
**Očekivani rezultat:** Greške ispod polja: „Naslov ima bar 5 znakova, npr. „Poklanjam grebalicu za mačke“.", „Opiši stanje, veličinu i kako se preuzima.", „Izaberi kategoriju.", „Izaberi za koju životinju je oglas." i „Izaberi grad.". Za 81 znak: „Naslov može imati najviše 80 znakova."; za 2001: „Opis može imati najviše 2000 znakova.". Tačno 80 i 2000 znakova prolaze. Brojači znakova pokazuju trenutni broj. Greške se pojavljuju i pri napuštanju polja.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-SAPA-015 — Cena: granice i „Po dogovoru"
**Zahtevi:** FR-63, BR-57 (ekrani S34, S33) · **Prioritet:** P2 (važno) · **Nalog:** marko.jovanovic@mojljubimac.test
**Preduslovi:** Otvoren „Novi oglas", vrsta „Prodajem".
**Koraci:**
1. Upiši cenu 0, pa -100, pa 99,50 i pokušaj da objaviš.
2. Upiši 1500000.
3. Štikliraj „Po dogovoru" i objavi.
4. Promeni vrstu na „Poklanjam" pa nazad na „Prodajem".
**Očekivani rezultat:** 0, negativan i decimalan iznos se ne prihvataju (cena je ceo broj dinara veći od 0). 1500000 se prikazuje kao „1.500.000 RSD". Sa „Po dogovoru" polje za iznos je isključeno, a na oglasu piše „Po dogovoru". Za „Poklanjam" kartica „Cena" nestaje.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-SAPA-016 — Fotografije oglasa
**Zahtevi:** FR-63, BR-55, E-30, EP-13 `listing_photo` (ekrani S34, S33) · **Prioritet:** P1 (kritično) · **Nalog:** marko.jovanovic@mojljubimac.test
**Preduslovi:** Otvoren „Novi oglas". Test fajlovi spremni.
**Koraci:**
1. Dodaj `slika.jpg` i `slika.png`.
2. Pokušaj `nalaz.pdf` i `velika.jpg`.
3. Dodaj još 3 slike (ukupno 5), pa pokušaj šestu.
4. Ukloni prvu fotografiju.
5. Objavi i otvori oglas; klikni sličice u galeriji.
**Očekivani rezultat:** Ispod piše „Do 5 fotografija, JPG ili PNG do 10 MB. Prva je naslovna." i brojač „N / 5". PDF i fajl veći od 10 MB se odbijaju sa porukom. Posle pete fotografije dugme „Dodaj" nestaje ili je isključeno i šesta ne može da se doda. Posle uklanjanja prve, sledeća postaje „Naslovna". Na oglasu galerija ima brojač (npr. „1 / 4") i sličice koje menjaju glavnu fotografiju.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-SAPA-017 — „Potreba" samo za odobreni azil
**Zahtevi:** FR-63, BR-54, E-29 (ekran S34) · **Prioritet:** P1 (kritično) · **Nalog:** marko.jovanovic@mojljubimac.test, nikola.djordjevic@mojljubimac.test, novi azil koji čeka odobrenje (npr. `qa.azil3@mojljubimac.test`)
**Preduslovi:** Azil `qa.azil3` je registrovan i još nije odobren.
**Koraci:**
1. Svakim od tri naloga otvori „Novi oglas" i pogledaj „Vrsta oglasa".
**Očekivani rezultat:** Ni vlasnik, ni odgajivačnica, ni azil koji čeka odobrenje ne vide „Potreba" — nude se samo „Poklanjam", „Prodajem" i „Tražim", uz napomenu „Potrebe sa dugmetom „Doniraj“ objavljuju samo odobreni azili.". (Azil na čekanju je inače sve samo za čitanje — zapiši šta tačno vidi.)
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-SAPA-018 — Volonter azila objavljuje potrebu
**Zahtevi:** FR-63, BR-54, FR-67 (ekrani S34, S33) · **Prioritet:** P2 (važno) · **Nalog:** jelena.nikolic@mojljubimac.test (volonter u Miličinom azilu, fajl 07 TS-ORG-015)
**Preduslovi:** Jelena je volonter u odobrenom azilu.
**Koraci:**
1. Kao Jelena, u okviru organizacije, otvori „Novi oglas" i izaberi „Potreba".
2. Objavi potrebu „Potrebne ćebad i peškiri za zimu".
3. Otvori oglas kao Ivana.
**Očekivani rezultat:** Volonter vidi „Potreba" sa opisom „Šta azilu trenutno treba. Uz oglas ide dugme „Doniraj“." i karticu sa linkom „Proveri podatke za donacije". Oglas je objavljen **za azil**: autor kartica pokazuje naziv azila („Objavio azil"), a ne Jelenino ime.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-SAPA-019 — Premium vlasnik nema limit oglasa
**Zahtevi:** FR-63, BR-55 (ekrani S34, S35) · **Prioritet:** P1 (kritično) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Ivana (Premium) ima 3 aktivna oglasa.
**Koraci:**
1. Objavi četvrti i peti oglas.
2. Otvori `/sapa-pomoci/moje`.
**Očekivani rezultat:** Oba oglasa se objavljuju bez Premium ponude. Na S35 se ne prikazuje brojač „… od 3 na Free planu", a dugme „Novi oglas" je uvek vidljivo.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-SAPA-020 — Odgajivačnica ima limit od 3 oglasa (OQ-16)
**Zahtevi:** FR-63, BR-55, OQ-16 (ekrani S34, S35) · **Prioritet:** P2 (važno) · **Nalog:** nikola.djordjevic@mojljubimac.test
**Preduslovi:** Odgajivačnica ima aktivan odgajivački plan (postavlja programer) i 3 aktivna oglasa.
**Koraci:**
1. Otvori „Novi oglas".
**Očekivani rezultat:** Isto kao Free vlasnik: formular je iza „Dostupno u Premiumu" sa tekstom o 3 aktivna oglasa. Odgajivački plan **ne** skida limit dok vlasnica ne odluči drugačije (OQ-16). Ako aplikacija dozvoli četvrti oglas, označi scenario kao Pao i u napomeni napiši „OQ-16".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-SAPA-021 — Azil nema limit, ni za potrebe ni za druge oglase
**Zahtevi:** FR-63, BR-55 (ekrani S34, S35) · **Prioritet:** P2 (važno) · **Nalog:** milica.stojanovic@mojljubimac.test
**Preduslovi:** Azil je odobren.
**Koraci:**
1. Objavi 2 potrebe i 3 oglasa „Poklanjam" (ukupno 5 aktivnih).
2. Otvori „Novi oglas" i `/sapa-pomoci/moje`.
**Očekivani rezultat:** Svih 5 se objavljuje. Iznad formulara piše „{azil} · bez ograničenja broja oglasa". Nema Premium ponude ni brojača „od 3".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-SAPA-022 — Šta se ne računa u limit
**Zahtevi:** BR-55, FR-64 (ekrani S35, S34) · **Prioritet:** P1 (kritično) · **Nalog:** marko.jovanovic@mojljubimac.test
**Preduslovi:** Marko ima 3 aktivna oglasa.
**Koraci:**
1. Označi jedan kao rešen i otvori „Novi oglas".
2. Objavi nov oglas (opet 3 aktivna). Zamoli Anu (operater) da sakrije jedan Markov oglas, pa otvori „Novi oglas".
3. Programer jednom oglasu pomera istek u prošlost i pokreće dnevni posao; ponovo otvori „Novi oglas".
**Očekivani rezultat:** Posle svakog koraka brojač pokazuje manje od 3 aktivna i formular je dostupan. Rešeni, sakriveni i istekli oglasi se ne računaju („Sakriveni oglasi se ne računaju.").
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-SAPA-023 — Izmena oglasa ne menja datum isteka
**Zahtevi:** FR-64, BR-56 (ekrani S34, S33, S35) · **Prioritet:** P2 (važno) · **Nalog:** marko.jovanovic@mojljubimac.test, ivana.petrovic@mojljubimac.test
**Preduslovi:** Marko ima aktivan oglas. Zapiši njegov datum „Aktivan do …".
**Koraci:**
1. Kao Marko na S35 u meniju oglasa izaberi „Izmeni", promeni naslov i cenu i klikni „Sačuvaj izmene".
2. Kao Ivana otvori adresu `/sapa-pomoci/{id Markovog oglasa}/izmeni`.
**Očekivani rezultat:** Javlja se „Izmene su sačuvane.". Nov naslov i cena se vide na oglasu i listi, a „Aktivan do" je isti kao pre izmene. Ivana ne može da menja tuđi oglas (nema formulara sa njegovim podacima — prikazuje se da oglas nije dostupan ili je vraćena na oglas).
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-SAPA-024 — Brisanje oglasa i razgovori „oglas obrisan"
**Zahtevi:** FR-64, BR-61, odluka vlasnice za Step 28c (ekrani S35, S34, S36) · **Prioritet:** P1 (kritično) · **Nalog:** marko.jovanovic@mojljubimac.test + ivana.petrovic@mojljubimac.test
**Preduslovi:** Ivana i Marko imaju razgovor o Markovom oglasu.
**Koraci:**
1. Kao Marko na S35 izaberi „Obriši", pročitaj dijalog i klikni „Otkaži".
2. Ponovo „Obriši" i potvrdi sa „Da, obriši".
3. Kao Ivana otvori `/poruke` i taj razgovor, pa stari link oglasa.
**Očekivani rezultat:** Dijalog „Obrisati oglas?" kaže „Oglas „{naslov}“ i njegove fotografije brišemo trajno. Ovo ne može da se poništi.". Posle „Otkaži" ništa se ne menja. Posle brisanja se javlja „„{naslov}“ je obrisan." i oglasa nema ni u jednom tabu. Razgovor ostaje čitljiv, a umesto naslova oglasa piše „oglas obrisan". Stari link prikazuje „Oglas nije dostupan".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-SAPA-025 — Rešavanje oglasa po vrsti i prikaz za druge
**Zahtevi:** FR-62, FR-64, BR-56, OQ-17 (g) (ekrani S35, S33, S32) · **Prioritet:** P1 (kritično) · **Nalog:** marko.jovanovic@mojljubimac.test, milica.stojanovic@mojljubimac.test, ivana.petrovic@mojljubimac.test
**Preduslovi:** Marko ima aktivne oglase „Prodajem" i „Tražim"; Milica ima aktivnu potrebu.
**Koraci:**
1. Marko označi „Prodajem" kao rešen, pa „Tražim". Milica označi potrebu kao rešenu.
2. Otvori tab „Rešeni" kod oba naloga.
3. Kao autor (Marko) otvori svoj rešen oglas.
4. Kao Ivana otvori iste oglase preko starih linkova i pogledaj `/sapa-pomoci`.
**Očekivani rezultat:** Ishodi su „Prodato", „Pronađeno" i „Donirano" (za „Poklanjam" je „Poklonjeno"), sa datumom. Posle potvrde se javlja „„{naslov}“ je označen kao rešen — {ishod}.". Autor na svom oglasu vidi oznaku „Rešeno — {ishod}" i „Oglas više nije aktivan". Ivana (nije autor) dobija „Oglas nije dostupan" i „Oglas je istekao, uklonjen ili ga autor više ne prikazuje. Pogledaj ostale oglase u svom gradu.". Rešeni oglasi nisu na listi.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-SAPA-026 — Mejl 3 dana pre isteka i „Produži" iz mejla
**Zahtevi:** FR-65, BR-56, EP-87, Design §9.1 `listing_expiring`, odluka vlasnice za Step 28b (ekran S35) · **Prioritet:** P1 (kritično) · **Nalog:** jelena.nikolic@mojljubimac.test
**Preduslovi:** Programer Jelenom oglasu „Poklanjam grebalicu za mačke" postavlja istek na tačno 3 dana od danas i ručno pokreće dnevni posao za oglase (inače radi u 09:00 po beogradskom vremenu).
**Koraci:**
1. Otvori Mailpit.
2. Zamoli programera da posao pokrene još jednom.
3. U mejlu klikni „Produži".
**Očekivani rezultat:** Stiže tačno jedan mejl „Oglas ističe za 3 dana: Poklanjam grebalicu za mačke" sa tekstom „Tvoj oglas **Poklanjam grebalicu za mačke** je aktivan do {datum}. Ako je još aktuelan, produži ga za 30 dana. Ako je rešen, označi ga kao rešen." i dugmadima „Produži" i „Označi kao rešeno". Drugo pokretanje ne šalje nov mejl. „Produži" otvara S35 i oglas je aktivan do datuma 30 dana od danas.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-SAPA-027 — Istek oglasa i ponovno objavljivanje
**Zahtevi:** FR-64, FR-65, BR-56, E-31, Design §9.1 `listing_expired` (ekrani S35, S32, S33) · **Prioritet:** P1 (kritično) · **Nalog:** jelena.nikolic@mojljubimac.test, ivana.petrovic@mojljubimac.test
**Preduslovi:** Programer Jeleninom oglasu postavlja istek na juče i pokreće dnevni posao.
**Koraci:**
1. Pogledaj Mailpit.
2. Kao Ivana potraži oglas na `/sapa-pomoci` i otvori stari link.
3. Kao Jelena otvori tab „Istekli" i klikni „Objavi ponovo (30 dana)".
**Očekivani rezultat:** Stiže mejl „Oglas je istekao: {oglas}" sa tekstom „Tvoj oglas **{oglas}** je istekao {datum} i više se ne prikazuje u Šapi pomoći. Možeš da ga objaviš ponovo na još 30 dana." i dugmetom „Objavi ponovo". Ivana oglas ne nalazi, a stari link prikazuje „Oglas nije dostupan". Kod Jelene je status „Istekao" i „Istekao {datum}". Posle ponovne objave oglas je u „Aktivni" sa „Aktivan do {danas + 30 dana}" i ponovo je na listi.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-SAPA-028 — Produženje računa 30 dana od danas
**Zahtevi:** FR-64, BR-56, EP-77 (ekrani S35, S33) · **Prioritet:** P2 (važno) · **Nalog:** marko.jovanovic@mojljubimac.test
**Preduslovi:** Markov oglas je aktivan još 20 dana.
**Koraci:**
1. Na oglasu (S33) klikni „Produži 30 dana".
2. Pogledaj datum na S35.
**Očekivani rezultat:** Javlja se „Oglas je produžen do {datum}." Novi datum je **30 dana od danas**, a ne 30 dana posle starog datuma isteka. Dugme „Produži 30 dana" je istaknuto (primarno) samo kad su ostala ≤ 3 dana.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-SAPA-029 — Prazna stanja
**Zahtevi:** FR-61, FR-64, Design §12 S32, S35 (ekrani S32, S35) · **Prioritet:** P3 (sitno) · **Nalog:** novi vlasnički nalog (npr. `qa.sapa@mojljubimac.test`)
**Preduslovi:** Nov nalog nema nijedan oglas.
**Koraci:**
1. Otvori `/sapa-pomoci/moje` i prođi kroz tabove „Aktivni", „Istekli", „Rešeni".
2. Zamoli programera da lokalno privremeno nema nijednog aktivnog oglasa (ili koristi praznu bazu) i otvori `/sapa-pomoci`.
**Očekivani rezultat:** Tabovi prikazuju „Još nemaš aktivnih oglasa" / „Pokloni ili prodaj nešto što tvom ljubimcu više ne treba, ili potraži ono što mu treba." sa dugmetom „Novi oglas", „Nema isteklih oglasa" / „Oglasi kojima prođe 30 dana prelaze ovde. Možeš da ih objaviš ponovo." i „Nema rešenih oglasa" / „Kad nešto pokloniš, prodaš ili pronađeš, označi oglas kao rešen.". Prazna tabla prikazuje „Još nema oglasa" i „Budi prvi/a — pokloni ili prodaj nešto što tvom ljubimcu više ne treba." sa dugmetom „Novi oglas".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-SAPA-030 — Neprijavljen posetilac: poruka i donacija traže prijavu
**Zahtevi:** FR-66, FR-68, E-32 (ekrani S33, S16) · **Prioritet:** P1 (kritično) · **Nalog:** bez prijave, pa marko.jovanovic@mojljubimac.test
**Preduslovi:** Postoji aktivan oglas „Prodajem" i potreba azila sa podacima za donacije.
**Koraci:**
1. U privatnom prozoru otvori oglas „Prodajem" i klikni „Prijavi se da pošalješ poruku". Prijavi se kao Marko.
2. Odjavi se, otvori potrebu azila i klikni „Doniraj". Prijavi se.
3. Odjavi se i ručno otvori `/sapa-pomoci/nova`, `/sapa-pomoci/moje` i `/poruke`.
**Očekivani rezultat:** U koracima 1 i 2 posle prijave vraćaš se **na isti oglas**. Uz poruku piše „Poruke šalješ i primaš u aplikaciji — tvoj mejl i telefon niko ne vidi.". Adrese iz koraka 3 vode na prijavu i ne prikazuju podatke.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-SAPA-031 — Filteri „Za koga" i „Grad" i straničenje
**Zahtevi:** FR-61, EP-73 (ekran S32) · **Prioritet:** P2 (važno) · **Nalog:** bez prijave
**Preduslovi:** Postoje oglasi za pse i mačke u Novom Sadu i Bečeju.
**Koraci:**
1. Izaberi „Za koga" = „Mačke" i „Grad" = „Bečej".
2. Promeni na „Psi" i „Svi gradovi".
3. Sa filterom koji ima više strana pređi na drugu stranu, pa promeni filter.
**Očekivani rezultat:** U svakom koraku prikazuju se samo oglasi koji odgovaraju svim izabranim filterima, a broj u redu „{N} oglasa · najnoviji prvo" se slaže. Posle promene filtera prikaz kreće od strane 1. Filteri rade i bez prijave.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-SAPA-032 — Filter „Potrebe azila" i kategorija „Lekovi i nega"
**Zahtevi:** FR-61, BR-54 (ekran S32) · **Prioritet:** P2 (važno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Postoji potreba azila sa kategorijom „Lekovi i nega" (TS-SAPA-005).
**Koraci:**
1. Izaberi „Potrebe azila", pa kategoriju „Lekovi i nega".
2. Promeni vrstu na „Prodajem".
**Očekivani rezultat:** U koraku 1 prikazuju se samo potrebe azila te kategorije. Posle promene na „Prodajem" kategorija „Lekovi i nega" više nije ponuđena i izbor kategorije se vraća na „Sve kategorije" (ili se prikazuju svi oglasi za prodaju) — nikad se ne prikazuje oglas za prodaju sa kategorijom „Lekovi i nega".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-SAPA-033 — „Doniraj" sa delimičnim podacima
**Zahtevi:** FR-66, FR-72 (ekrani S29, S33) · **Prioritet:** P2 (važno) · **Nalog:** milica.stojanovic@mojljubimac.test, ivana.petrovic@mojljubimac.test
**Preduslovi:** Milica ima aktivnu potrebu.
**Koraci:**
1. Kao Milica u „Donacije" ostavi samo „Adresa za donošenje" i „Radno vreme za donošenje", sačuvaj.
2. Kao Ivana otvori potrebu i klikni „Doniraj".
3. Kao Milica ostavi samo „Link za uplatu"; kao Ivana ponovo otvori „Doniraj" i klikni „Uplati online".
**Očekivani rezultat:** U koraku 2 dijalog ima samo blok „Donošenje u azil" — blokovi bez podataka se ne prikazuju. U koraku 3 dijalog ima samo „Online uplata" sa tekstom „Otvara se stranica azila za plaćanje karticom.", a „Uplati online" otvara link u novom tabu. U podnožju dijaloga su „Pošalji poruku azilu" i „Zatvori".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-SAPA-034 — Kartica „Donacije": volonter samo čita, odgajivačnica je nema
**Zahtevi:** FR-72 (ekran S29) · **Prioritet:** P2 (važno) · **Nalog:** jelena.nikolic@mojljubimac.test (volonter azila), nikola.djordjevic@mojljubimac.test
**Preduslovi:** Milica je upisala podatke za donacije.
**Koraci:**
1. Kao Jelena (volonter) otvori `/organizacija/profil`.
2. Kao Nikola otvori `/organizacija/profil`.
**Očekivani rezultat:** Jelena vidi „Donacije" sa „Broj računa", „Link za uplatu", „Adresa za donošenje" i „Radno vreme za donošenje" samo za čitanje, bez polja za unos i dugmeta za čuvanje. Nikola (odgajivačnica) uopšte nema karticu „Donacije".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-SAPA-035 — Inbox, brojači nepročitanih i bedž „Poruke"
**Zahtevi:** FR-68, NFR-11, EP-80, EP-81, Design §5.1 (ekran S36) · **Prioritet:** P1 (kritično) · **Nalog:** marko.jovanovic@mojljubimac.test, ivana.petrovic@mojljubimac.test, jelena.nikolic@mojljubimac.test
**Preduslovi:** Marko ima 2 aktivna oglasa.
**Koraci:**
1. Ivana šalje 2 poruke o prvom Markovom oglasu, a Jelena 1 poruku o drugom.
2. Kao Marko osveži bilo koju stranicu i pogledaj ikonicu „Poruke" (bočni meni na računaru, gornja traka na telefonu).
3. Otvori `/poruke` i pogledaj redove.
4. Otvori Ivanin razgovor, pa osveži stranicu.
**Očekivani rezultat:** Bedž na ikonici „Poruke" pokazuje **broj razgovora** sa nepročitanim porukama (ovde 2, ne 3); čitač ekrana čita „Poruke, 2 nepročitanih". Razgovori su poređani po poslednjoj poruci (najnoviji prvi). Svaki red ima ime, vreme (npr. „14:32", „Juče" ili „16. 10."), „Tvoj oglas: {naslov}", poslednju poruku i broj nepročitanih; ime je podebljano dok ima nepročitanih. Posle otvaranja razgovora njegov broj nestaje, a bedž pokazuje 1. Kad nema nepročitanih, bedža nema. Na Ivaninoj strani njena poslednja poruka počinje sa „Ti: …".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-SAPA-036 — Poruka: prazna i najduža dozvoljena
**Zahtevi:** FR-68 (ekran S36) · **Prioritet:** P2 (važno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Otvoren razgovor sa Markom.
**Koraci:**
1. Klikni dugme za slanje sa praznim poljem, pa sa samo razmacima.
2. Nalepi tekst od 2000 znakova i pošalji.
3. Nalepi tekst od 2001 znaka.
**Očekivani rezultat:** Prazna poruka (i samo razmaci) daje „Napiši poruku pre slanja." i ništa se ne šalje. Ispod polja piše „Samo tekst · N / 2000". Poruka od 2000 znakova se šalje i prikazuje cela. Više od 2000 znakova ne može da se pošalje.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-SAPA-037 — Previše poruka za kratko vreme
**Zahtevi:** FR-68, API §11 (30 poruka na sat), odluka vlasnice za Step 28c (ekran S36) · **Prioritet:** P3 (sitno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Otvoren razgovor sa Markom. (Brže ide ako programer lokalno pripremi brojač; inače pošalji poruke ručno.)
**Koraci:**
1. U istom satu pošalji 31 poruku.
**Očekivani rezultat:** Prvih 30 poruka se šalje. Trideset prva se ne šalje, a ispod polja piše „Poslao/la si mnogo poruka za kratko vreme. Pokušaj ponovo za {n} min.". Tekst ostaje u polju.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-SAPA-038 — Poruka samom sebi nije moguća
**Zahtevi:** FR-62, FR-68, BR-61, E-33 (ekrani S33, S36) · **Prioritet:** P1 (kritično) · **Nalog:** marko.jovanovic@mojljubimac.test
**Preduslovi:** Marko ima aktivan oglas o kome su mu pisala 2 korisnika.
**Koraci:**
1. Otvori svoj oglas (S33).
2. Klikni „{N} razgovora o oglasu".
**Očekivani rezultat:** Umesto „Pošalji poruku" stoji kartica „Ovo je tvoj oglas" sa „2 razgovora o oglasu", „Izmeni oglas", „Produži 30 dana" i „Označi kao rešeno". Nigde ne postoji način da pošalje poruku samom sebi. Link otvara `/poruke`.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-SAPA-039 — Razgovor posle rešavanja ili isteka oglasa
**Zahtevi:** FR-68, BR-61, E-33 (ekrani S36, S33) · **Prioritet:** P2 (važno) · **Nalog:** ivana.petrovic@mojljubimac.test + marko.jovanovic@mojljubimac.test, jelena.nikolic@mojljubimac.test
**Preduslovi:** Ivana i Marko imaju razgovor o Markovom oglasu. Jelena o njemu još nije pisala.
**Koraci:**
1. Marko označi oglas kao rešen.
2. Ivana otvori razgovor i pošalje poruku. Marko osveži i odgovori.
3. Jelena pokuša da otvori oglas i započne nov razgovor.
**Očekivani rezultat:** U zaglavlju razgovora uz naslov oglasa piše „· oglas više nije aktivan", ali Ivana i Marko i dalje mogu da se dopisuju. Jelena ne može da započne nov razgovor (oglas joj nije dostupan i nema dugmeta „Pošalji poruku").
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-SAPA-040 — Kartica „Poruke" u podešavanjima obaveštenja
**Zahtevi:** FR-69, EP-28 tip `message` (ekran S12) · **Prioritet:** P1 (kritično) · **Nalog:** marko.jovanovic@mojljubimac.test + ivana.petrovic@mojljubimac.test
**Preduslovi:** Marko nikad nije menjao obaveštenja o porukama.
**Koraci:**
1. Kao Marko otvori `/podesavanja/podsetnici` i pronađi „Šapa pomoći" → „Poruke".
2. Isključi „Mejl" i klikni „Sačuvaj podešavanja". Ivana šalje Marku poruku. Pogledaj Mailpit.
3. Isključi i „Push" i sačuvaj.
4. Vrati „Mejl" i „Push" i sačuvaj. Ivana šalje novu poruku.
**Očekivani rezultat:** Kartica kaže „Kad ti neko piše povodom oglasa. Stižu odmah." i ima prekidače „Mejl" i „Push", oba uključena na početku; nema „koliko ranije", vremena slanja ni WhatsApp/Viber. Ako push u pregledaču nije uključen, piše „Push stiže tek kad uključiš obaveštenja u kartici „Kanali“ iznad.". Javlja se „Podešavanja su sačuvana.". Sa isključenim mejlom mejl ne stiže, ali poruka je u `/poruke`. Sa oba isključena piše „Nove poruke ćeš videti samo u aplikaciji, u Porukama.". Posle vraćanja mejl ponovo stiže.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-SAPA-041 — Push obaveštenje o novoj poruci
**Zahtevi:** FR-69, Design §9.1 `new_message` (push) (ekrani S12, S36) · **Prioritet:** P3 (sitno) · **Nalog:** marko.jovanovic@mojljubimac.test + ivana.petrovic@mojljubimac.test
**Preduslovi:** Marko je u S12 uključio push u ovom pregledaču. Lokalno se push ne šalje — programer čita log servera (ili se scenario izvršava na produkciji, fajl 14).
**Koraci:**
1. Ivana šalje Marku poruku „Može sutra u 17h?".
2. Programer u logu pronalazi push za Marka (ili na produkciji klikni obaveštenje na uređaju).
**Očekivani rezultat:** Push ima naslov = ime pošiljaoca, tekst „{naslov oglasa}: Može sutra u 17h?" i akciju „Odgovori", a vodi na `/poruke/{id}`. Poruke se nikad ne šalju na WhatsApp ni Viber.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-SAPA-042 — Prijava i blokiranje sa javnog profila
**Zahtevi:** FR-70, BR-59, EP-84, EP-85 (ekran S37) · **Prioritet:** P1 (kritično) · **Nalog:** jelena.nikolic@mojljubimac.test
**Preduslovi:** Marko ima aktivne oglase. Jelena nema razgovor sa Markom.
**Koraci:**
1. Otvori Markov profil, u meniju „⋯" izaberi „Prijavi korisnika", razlog „Spam ili reklama" i pošalji.
2. U istom meniju izaberi „Blokiraj" i potvrdi sa „Da, blokiraj".
3. Otvori `/sapa-pomoci` i potraži Markove oglase.
4. Na Markovom profilu klikni „Odblokiraj".
**Očekivani rezultat:** Dijalog prikazuje „Korisnik: {ime}" i potvrdu „Prijava je poslata". Posle blokiranja profil pokazuje traku „Blokirao/la si ovog korisnika. Ne može da ti šalje poruke, a ti ne vidiš oglase te osobe." sa „Odblokiraj", a sekcija oglasa je sakrivena. Markovih oglasa nema na listi. Posle odblokiranja se javlja „Korisnik {ime} je odblokiran." i oglasi se vraćaju. Prijava se vidi kod operatera (fajl 09, TS-ADM-019).
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-SAPA-043 — Blokirani korisnik ne može da započne nov razgovor
**Zahtevi:** FR-70, BR-59, E-34 (ekrani S33, S36) · **Prioritet:** P1 (kritično) · **Nalog:** ivana.petrovic@mojljubimac.test + marko.jovanovic@mojljubimac.test
**Preduslovi:** Ivana je blokirala Marka. Ivana ima aktivan oglas o kome joj Marko još nije pisao.
**Koraci:**
1. Kao Marko otvori `/sapa-pomoci` i potraži Ivanin oglas.
2. Otvori ga, klikni „Pošalji poruku" i pošalji.
3. Kao Ivana osveži `/poruke` i pogledaj Mailpit.
**Očekivani rezultat:** Marko i dalje vidi Ivanine oglase (blokada sakriva oglase samo onome ko je blokirao). Slanje se odbija porukom „Ovoj osobi trenutno ne možeš da pišeš.". Ivana nema nov razgovor i ne dobija mejl.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-SAPA-044 — Poruke azilu o potrebi
**Zahtevi:** FR-66, FR-68, FR-67, Design §12 S33 (ekrani S33, S36) · **Prioritet:** P2 (važno) · **Nalog:** ivana.petrovic@mojljubimac.test + milica.stojanovic@mojljubimac.test
**Preduslovi:** Milica ima aktivnu potrebu.
**Koraci:**
1. Kao Ivana otvori potrebu i otvori meni „⋯".
2. Klikni „Pošalji poruku azilu" i pošalji poruku.
3. Kao Milica osveži stranicu i pogledaj ikonicu „Poruke" i `/poruke`.
4. Kao Ivana otvori razgovor i klikni ime azila u zaglavlju.
**Očekivani rezultat:** U meniju je samo „Prijavi oglas" — nema „Blokiraj korisnika" za potrebe azila. Milica vidi bedž na „Poruke" u okviru organizacije i razgovor sa oznakom „Tvoj oglas: …". Kod Ivane razgovor prikazuje naziv azila (kvadratni avatar), a klik vodi na javnu stranicu azila `/o/{slug}`, ne na profil korisnika.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-SAPA-045 — Isključen (suspendovan) korisnik: šta vidi
**Zahtevi:** FR-71, BR-60, E-35 (ekrani S32, S33, S34, S35, S36) · **Prioritet:** P1 (kritično) · **Nalog:** marko.jovanovic@mojljubimac.test (posle „Isključi korisnika" u TS-SAPA-010)
**Preduslovi:** Ana je isključila Marka iz Šape pomoći.
**Koraci:**
1. Otvori `/sapa-pomoci`, tuđi oglas, `/sapa-pomoci/nova`, `/sapa-pomoci/moje` i `/poruke`.
2. Na S35 pokušaj da izmeniš, produžiš i obrišeš svoj oglas.
3. Otvori `/ljubimci`, karton i `/podsetnici`.
**Očekivani rezultat:** S32: kartica „Tvoj nalog je isključen iz Šape pomoći zbog prijava drugih korisnika. Oglase i dalje vidiš, ali ne možeš da objavljuješ oglase ni da šalješ poruke. Ako misliš da je greška, piši nam na podrska@mojljubimac.rs." i nema dugmadi „Moji oglasi"/„Novi oglas". Tuđi oglas: „Poruke nisu dostupne". S34: „Ne možeš da objavljuješ oglase". S35: traka „Tvoj nalog je isključen iz Šape pomoći. Tvoji oglasi su skriveni za druge, a nove ne možeš da objavljuješ. Možeš da ih obrišeš."; izmena i produženje su sakriveni, brisanje radi. S36: „Tvoj nalog je isključen iz Šape pomoći. Stare poruke možeš da čitaš, ali ne možeš da šalješ nove." i umesto polja „Slanje poruka je isključeno dok si isključen/a iz Šape pomoći.". Kartoni i podsetnici rade normalno.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-SAPA-046 — Oglasi isključenog korisnika nestaju za sve i vraćaju se
**Zahtevi:** FR-61, FR-71, BR-60 (ekrani S32, S33, S37, S26) · **Prioritet:** P1 (kritično) · **Nalog:** bez prijave, ivana.petrovic@mojljubimac.test, ana.markovic@mojljubimac.test
**Preduslovi:** Pre isključenja zapiši linkove 2 Markova aktivna oglasa i njegovog profila. Marko je isključen.
**Koraci:**
1. Bez prijave i kao Ivana potraži Markove oglase na listi i otvori zapisane linkove.
2. Kao Ana klikni „Vrati pristup" za Marka.
3. Ponovi korak 1.
**Očekivani rezultat:** Dok je isključen: Markovih oglasa nema na listi, linkovi oglasa daju „Oglas nije dostupan", a profil „Profil nije dostupan". Posle vraćanja pristupa oglasi koji su bili aktivni su ponovo vidljivi (sa starim datumima isteka, ako nisu u međuvremenu istekli) i profil radi.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-SAPA-047 — Ime za prikaz (display name)
**Zahtevi:** FR-67, BR-61, API §5.9 pravilo imena, OQ-17 (f), odluka vlasnice za Step 28b (ekrani S32, S33, S36, S37) · **Prioritet:** P2 (važno) · **Nalog:** marko.jovanovic@mojljubimac.test, ivana.petrovic@mojljubimac.test, novi nalog bez imena u profilu
**Preduslovi:** Programer lokalno Marku u bazi upisuje nadimak „Marko iz Beograda". Nov nalog nema ime i prezime u profilu i objavio je jedan oglas.
**Koraci:**
1. Kao Ivana pogledaj Markov oglas na listi, na detalju (kartica autora), u razgovoru, u inboksu i na profilu. Pogledaj i mejl o novoj poruci od Marka.
2. Programer briše nadimak; ponovi korak 1.
3. Pogledaj oglas novog naloga bez imena.
**Očekivani rezultat:** Sa nadimkom se svuda prikazuje „Marko iz Beograda" (ime u mejlu: „pošiljalac: Marko iz Beograda"). Bez nadimka se prikazuje ime i prezime iz profila. Za nalog bez imena piše „Korisnik". Mejl adresa i telefon se ne prikazuju nigde. U profilu (S18) nema polja za nadimak — to je očekivano (OQ-17).
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-SAPA-048 — Autor potrebe je azil: link na javnu stranicu
**Zahtevi:** FR-67, Design §12 S37 (ekrani S33, S23) · **Prioritet:** P3 (sitno) · **Nalog:** bez prijave
**Preduslovi:** Postoji aktivna potreba Miličinog azila.
**Koraci:**
1. Otvori potrebu i pogledaj karticu autora.
2. Klikni „Javna stranica azila".
**Očekivani rezultat:** Kartica pokazuje „Objavio azil", naziv azila sa kvadratnim avatarom, grad i „Aktivnih oglasa: N". Umesto „Pogledaj profil" stoji „Javna stranica azila", koja otvara `/o/{slug}`. Azil nema stranicu `/korisnik/…`.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-SAPA-049 — Tuđi oglasi i razgovori se ne vide
**Zahtevi:** FR-64, FR-68, BR-61 (ekrani S35, S36) · **Prioritet:** P1 (kritično) · **Nalog:** ivana.petrovic@mojljubimac.test, jelena.nikolic@mojljubimac.test
**Preduslovi:** Ivana i Marko imaju razgovor. Zapiši adresu tog razgovora (`/poruke/{id}`).
**Koraci:**
1. Kao Jelena otvori zapisanu adresu razgovora.
2. Kao Jelena otvori `/sapa-pomoci/moje`.
**Očekivani rezultat:** Jelena ne vidi Ivanin i Markov razgovor (stanje „nije dostupno" ili povratak na njene poruke, bez ijedne tuđe poruke). Na S35 vidi samo svoje oglase.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-SAPA-050 — Šapa pomoći na engleskom
**Zahtevi:** FR-35, NFR-05, odluke vlasnice za Steps 28b i 28c (ekrani S32 … S37) · **Prioritet:** P2 (važno) · **Nalog:** ivana.petrovic@mojljubimac.test (jezik „English")
**Preduslovi:** Ivana menja jezik na „English" u profilu.
**Koraci:**
1. Prođi kroz listu, oglas, formular, moje oglase, poruke i profil korisnika.
2. Otvori dijalog za prijavu, blokiraj i odblokiraj korisnika.
3. Pošalji poruku Marku; Marko (srpski) proverava svoj mejl, a Ivana mejl na odgovor.
**Očekivani rezultat:** Sav tekst je na engleskom (osim teksta koji su ljudi upisali). Razlozi prijave su „Spam or advertising", „Scam", „Inappropriate content", „Animal welfare", „Other". Poruke posle blokiranja: „{ime} is blocked." i „{ime} is unblocked.". Mejl stiže na jeziku **primaoca**: Marku na srpskom („Nova poruka: …"), Ivani na engleskom („New message: …").
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-SAPA-051 — Šapa pomoći na telefonu (375 px)
**Zahtevi:** NFR-03, Design §5.1, §12 S36 (ekrani S32 … S37) · **Prioritet:** P1 (kritično) · **Nalog:** marko.jovanovic@mojljubimac.test
**Preduslovi:** Pregledač u prikazu za mobilni, širina 375 px.
**Koraci:**
1. U donjoj navigaciji izaberi „Šapa" i prođi kroz filtere i listu.
2. Otvori oglas, galeriju i dijalog za poruku.
3. Otvori `/poruke`, jedan razgovor i dugme za povratak.
4. Otvori formular „Novi oglas" i dodaj fotografije.
**Očekivani rezultat:** Nigde nema vodoravnog skrolovanja stranice (čipovi vrsta mogu da se pomeraju unutar svog reda). Kartice oglasa su u jednoj koloni. U porukama se vidi jedan panel: prvo lista, pa razgovor sa dugmetom „Nazad na razgovore". Ikonica „Poruke" sa bedžom je u gornjoj traci. Dugmad i polja su dovoljno velika za dodir.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-SAPA-052 — Objava oglasa i poruka samo tastaturom
**Zahtevi:** NFR-04, Design §10 (ekrani S34, S33, S36) · **Prioritet:** P2 (važno) · **Nalog:** jelena.nikolic@mojljubimac.test
**Preduslovi:** —
**Koraci:**
1. Bez miša popuni i objavi oglas „Poklanjam" (izbor vrste, kategorije, grada, fotografija).
2. Na tuđem oglasu tastaturom menjaj fotografije u galeriji i pošalji poruku.
3. U razgovoru otvori meni „⋯" i zatvori ga tasterom Esc.
**Očekivani rezultat:** Svaki element je dostupan tasterom Tab, fokus je uvek vidljiv. Sličice u galeriji su dugmad (čitač ekrana čita „Prikaži fotografiju N" i koja je izabrana). Dijalozi zadržavaju fokus i vraćaju ga na dugme posle zatvaranja. Dugme za slanje poruke ima naziv „Pošalji poruku".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____
