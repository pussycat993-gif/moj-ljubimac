# 14 — Smoke test na produkciji posle deploy-a (oblast PROD)

**Status:** ⏳ Čeka prvi deploy i adresu sajta. Izvršava se posle **svakog** deploy-a na produkciju, za oko sat vremena.
**Adresa sajta:** `https://moj-ljubimac.<poddomen>.workers.dev` — **tačnu adresu dopisuje Ivana:** ______________________
**Zahtevi:** FR-01, FR-08, FR-23, FR-33, FR-34, FR-35, FR-46, FR-57, FR-61, FR-62, NFR-03, NFR-05, PRD §12 kriterijum 4, OQ-15, API §4.1
**Okruženje:** produkcija (pravi sajt, pravi mejlovi). **Nema Mailpit-a i nema test naloga iz seed-a** — svi nalozi se prave registracijom.

**Šta je na produkciji očekivano (NIJE greška dok se ne podesi):**

| Šta ne radi | Zašto | Kad proradi |
|---|---|---|
| Mejlovi stižu samo članovima Supabase tima | Mejlove za potvrdu i reset lozinke za sada šalje Supabase, koji šalje samo adresama iz svog tima | Kad Ivana podesi Resend |
| Podsetnici, pozivi, poruke i ostali mejlovi aplikacije ne stižu | Ove mejlove šalje Resend, koji još nije podešen | Kad Ivana podesi Resend |
| Otpremanje fotografija i priloga ne radi | Skladište fajlova (R2) nije podešeno | Kad Ivana podesi R2 |
| WhatsApp se ne šalje | Nema Meta naloga | Kad se podesi Meta nalog |
| Plaćanje: „Plaćanje uskoro dostupno" | Paddle nije podešen (Step 31) | Posle Step 31 |
| Privremen tekst na `/privatnost` i `/uslovi` | Pravni tekst još nije dostavljen (OQ-15) | Kad vlasnica dostavi tekst |

Kad nešto iz tabele „ne radi", proveri samo da aplikacija **ne puca**: prikazuje razumljivu poruku, ništa se ne gubi i ostalo radi. Ako vidiš tehničku grešku ili prazan ekran — to jeste greška.

**Nalozi za produkciju (napravi ih jednom i koristi ih u svakom ciklusu):**

| Oznaka | Kakav nalog | Mejl | Ko šta radi |
|---|---|---|---|
| **PROD-V1** | Vlasnik (Free) | Tvoj glavni mejl | Ivana ga dodaje u Supabase tim pre registracije (inače mejl za potvrdu ne stiže) |
| **PROD-V2** | Drugi vlasnik (Free) | Drugi tvoj mejl | Ivana ga dodaje u Supabase tim; služi za poruke i „tuđe podatke" |
| **PROD-AZ** | Azil | Treći mejl (može i Ivanin) | Posle registracije operater ga odobrava u `/admin` |
| **PROD-OP** | Operater | PROD-V1 ili poseban nalog | Ulogu operatera daje **Ivana** (u bazi); na produkciji je niko ne dobija sam |

- Zapiši lozinke u menadžer lozinki, ne u ovaj fajl.
- Ne pravi lažne oglase sa pravim ličnim podacima. U naslov test oglasa stavi „TEST — ne javljaj se", a posle ciklusa ih obriši ili označi kao rešene.
- Za scenarije na telefonu treba: Android telefon sa Chrome-om i iPhone sa Safarijem (iOS 16.4 ili noviji).

---

### TS-PROD-001 — Sajt radi preko HTTPS-a
**Zahtevi:** API §4.1, TC §8 · **Prioritet:** P1 (kritično) · **Nalog:** bez prijave
**Preduslovi:** Adresa sajta je dopisana gore.
**Koraci:**
1. Otvori adresu sajta sa `https://`.
2. Otvori istu adresu sa `http://` umesto `https://`.
3. Klikni ikonicu katanca pored adrese.
**Očekivani rezultat:** Sajt se otvara bez upozorenja pregledača. Adresa sa `http://` prelazi na `https://`. Pregledač kaže da je veza bezbedna i da je sertifikat važeći.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PROD-002 — Početna strana vodi na prijavu
**Zahtevi:** FR-34, API §4.1 (ekran S16) · **Prioritet:** P1 (kritično) · **Nalog:** bez prijave
**Preduslovi:** Privatni prozor.
**Koraci:**
1. Otvori samo adresu sajta (početnu stranu `/`).
**Očekivani rezultat:** Otvara se `/prijava` sa naslovom „Zdravo ponovo", dugmadima „Prijavi se", „Nastavi sa Google-om" i linkovima „Zaboravljena lozinka?" i „Napravi nalog". Nema praznog ekrana ni podrazumevane stranice hostinga.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PROD-003 — Zaštićene stranice bez prijave
**Zahtevi:** FR-34, API §4.1 · **Prioritet:** P1 (kritično) · **Nalog:** bez prijave
**Preduslovi:** Privatni prozor.
**Koraci:**
1. Ručno otvori `/ljubimci`, `/podsetnici`, `/profil`, `/poruke`, `/sapa-pomoci/nova`, `/organizacija` i `/admin`.
**Očekivani rezultat:** Svaka adresa vodi na `/prijava` (za `/admin` na `/prijava?next=/admin`) i ni na trenutak se ne vide lični podaci.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PROD-004 — Registracija novim nalogom i potvrda mejla
**Zahtevi:** FR-33, BR-29 (ekrani S15, S01) · **Prioritet:** P1 (kritično) · **Nalog:** novi nalog PROD-V1 (mejl je u Supabase timu)
**Preduslovi:** Ivana je potvrdila da je tvoj mejl dodat u Supabase tim.
**Koraci:**
1. Otvori `/registracija`, izaberi „Vlasnik", upiši mejl i lozinku, štikliraj uslove i klikni „Napravi nalog".
2. Otvori svoje pravo poštansko sanduče (pogledaj i Spam / Promocije).
3. Klikni link za potvrdu.
**Očekivani rezultat:** Prikazuje se „Proveri mejl" (kao TS-AUTH-001). Mejl za potvrdu stiže za nekoliko minuta. Link vodi na sajt (na produkcionu adresu, **ne** na localhost) i otvara `/ljubimci` sa praznim stanjem „Dodaj svog prvog ljubimca". Zapiši za koliko minuta je mejl stigao.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PROD-005 — Mejl za potvrdu ne stiže osobi van Supabase tima
**Zahtevi:** FR-33 (ekran S15) · **Prioritet:** P2 (važno) · **Nalog:** novi nalog sa mejlom koji **nije** u Supabase timu
**Preduslovi:** Resend još nije podešen.
**Koraci:**
1. Registruj nalog sa tim mejlom.
2. Sačekaj 15 minuta i pogledaj sanduče (i Spam).
3. Pokušaj prijavu.
**Očekivani rezultat:** Registracija prikazuje „Proveri mejl" bez greške. Mejl ne stiže — to je **očekivano** dok se ne podesi Resend; upiši „očekivano — Resend" u napomenu. Prijava prikazuje stanje nepotvrđenog mejla (kao TS-AUTH-008), bez tehničke greške. Javi Ivani adresu da je obriše ili potvrdi.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PROD-006 — Prijava i odjava
**Zahtevi:** FR-34, EP-42 (ekrani S16, S18) · **Prioritet:** P1 (kritično) · **Nalog:** PROD-V1
**Preduslovi:** Nalog je potvrđen.
**Koraci:**
1. Prijavi se mejlom i lozinkom.
2. Na `/profil` klikni „Odjavi se", pa „Nazad" u pregledaču i osveži.
3. Pokušaj prijavu pogrešnom lozinkom.
**Očekivani rezultat:** Prijava otvara `/ljubimci`. Posle odjave otvara se `/prijava`, a „Nazad" i osvežavanje ne prikazuju podatke. Pogrešna lozinka daje poruku o neuspeloj prijavi (kao TS-AUTH-014), bez otkrivanja da li nalog postoji.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PROD-007 — Dodavanje ljubimca i vakcine
**Zahtevi:** FR-01, FR-05, FR-20 (ekrani S01, S02, S03, S04, S10) · **Prioritet:** P1 (kritično) · **Nalog:** PROD-V1
**Preduslovi:** Nalog nema ljubimaca.
**Koraci:**
1. Dodaj ljubimca „TEST Luna" (Mačka, Ženka) bez fotografije.
2. Dodaj vakcinu sa datumom sledeće doze za mesec dana.
3. Otvori `/podsetnici` → „Uskoro".
4. Pokušaj da dodaš drugog aktivnog ljubimca.
**Očekivani rezultat:** Ljubimac se čuva („TEST Luna je sada među tvojim ljubimcima.") i otvara se karton. Vakcina se vidi na kartonu, a podsetnik za nju u „Uskoro". Drugi ljubimac otvara ponudu „Dostupno u Premiumu" (Free limit 1).
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PROD-008 — Otpremanje fotografije i priloga (očekivano ne radi bez R2)
**Zahtevi:** FR-01, FR-08, EP-13 (ekrani S02, S05, S34) · **Prioritet:** P2 (važno) · **Nalog:** PROD-V1
**Preduslovi:** R2 nije podešen. Pripremi `slika.jpg` i `nalaz.pdf`.
**Koraci:**
1. U izmeni ljubimca dodaj fotografiju i sačuvaj.
2. U novom pregledu dodaj `nalaz.pdf` i sačuvaj.
3. U „Novi oglas" dodaj fotografiju.
**Očekivani rezultat:** Dok R2 nije podešen, otpremanje **ne uspeva** — to je očekivano (upiši „očekivano — R2"). Proveri samo da aplikacija prikazuje razumljivu poruku o neuspelom otpremanju, da ostali podaci (ljubimac, pregled, oglas bez slike) mogu da se sačuvaju i da nema tehničke greške ni praznog ekrana. Kad Ivana javi da je R2 podešen, ponovi scenario — tada fotografija i prilog moraju da se vide.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PROD-009 — Podsetnik mejlom (očekivano ne stiže bez Resend-a)
**Zahtevi:** FR-21, FR-23, NFR-01 (ekrani S11, S10) · **Prioritet:** P2 (važno) · **Nalog:** PROD-V1
**Preduslovi:** Kanal Mejl je uključen za „Moji podsetnici".
**Koraci:**
1. Napravi ručni podsetnik „TEST podsetnik" za 10 minuta od sada.
2. Posle 15 minuta pogledaj sanduče i `/podsetnici`.
**Očekivani rezultat:** Podsetnik se pojavljuje u listi u zadato vreme. Mejl **ne stiže** dok Resend nije podešen — to je očekivano (upiši „očekivano — Resend"). Kad Ivana javi da je Resend podešen, ponovi: mejl mora da stigne najkasnije 5 minuta posle zadatog vremena, a dugme „Urađeno" iz mejla mora da radi.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PROD-010 — Push na Android telefonu (Chrome)
**Zahtevi:** FR-23, EP-29 (ekran S12) · **Prioritet:** P1 (kritično) · **Nalog:** PROD-V1
**Preduslovi:** Android telefon sa Chrome-om.
**Koraci:**
1. Na telefonu se prijavi i otvori `/podesavanja/podsetnici`.
2. U „Kanali" klikni „Uključi obaveštenja u ovom pregledaču" i dozvoli.
3. Napravi ručni podsetnik za 5 minuta, zaključaj telefon i sačekaj.
4. Kad stigne obaveštenje, pritisni „Urađeno".
**Očekivani rezultat:** Status je „Uključeno". Obaveštenje stiže i kad je Chrome zatvoren, sa naslovom „Za mene: TEST podsetnik" (ili „{ljubimac}: …") i akcijom „Urađeno". Posle pritiska podsetnik je u aplikaciji „Urađeno". Zapiši za koliko minuta posle zadatog vremena je stiglo.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PROD-011 — Push na iPhone-u („Dodaj na početni ekran")
**Zahtevi:** FR-23, RISK-09 (ekran S12) · **Prioritet:** P1 (kritično) · **Nalog:** PROD-V1
**Preduslovi:** iPhone sa iOS 16.4 ili novijim, Safari.
**Koraci:**
1. U Safariju otvori `/podesavanja/podsetnici` i pročitaj karticu „Koristiš iPhone?".
2. „Podeli" → „Dodaj na početni ekran", pa otvori aplikaciju sa ikonice na početnom ekranu.
3. Prijavi se (ako traži), uključi obaveštenja i dozvoli.
4. Napravi ručni podsetnik za 5 minuta, izađi iz aplikacije i sačekaj.
**Očekivani rezultat:** U Safariju se prikazuje „Koristiš iPhone?" / „Push obaveštenja rade tek kad dodaš aplikaciju." sa koracima. Sa početnog ekrana aplikacija se otvara kao zasebna aplikacija (bez trake Safarija), kartica se više ne prikazuje, a obaveštenje stiže na zaključan ekran.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PROD-012 — Prikaz na pravom telefonu
**Zahtevi:** NFR-03, Design §5.1 · **Prioritet:** P1 (kritično) · **Nalog:** PROD-V1
**Preduslovi:** Android i iPhone telefon.
**Koraci:**
1. Na oba telefona prođi kroz: `/prijava`, `/ljubimci`, karton, `/podsetnici`, `/sapa-pomoci`, `/poruke`, `/profil`.
2. Okreni telefon vodoravno na jednom ekranu.
**Očekivani rezultat:** Nigde nema vodoravnog skrolovanja stranice. Navigacija je dole (Ljubimci, Podsetnici, Šapa, Partneri, Profil). Tekst je čitljiv bez uvećavanja, dugmad su dovoljno velika za prst, tastatura ne prekriva polje u koje se piše.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PROD-013 — Brzina učitavanja
**Zahtevi:** NFR-03 (upotrebljivost na telefonu) · **Prioritet:** P2 (važno) · **Nalog:** bez prijave i PROD-V1
**Preduslovi:** Računar sa Chrome-om; telefon na mobilnom internetu (ne Wi-Fi).
**Koraci:**
1. Na računaru otvori `/prijava` u privatnom prozoru sa otvorenim alatima pregledača (F12 → Network) i zapiši vreme učitavanja („Load").
2. Isto za `/sapa-pomoci` bez prijave i `/ljubimci` posle prijave.
3. Na telefonu otvori iste stranice i oceni koliko traju.
**Očekivani rezultat:** Dokumenti ne zadaju tačan broj sekundi, pa upiši izmerena vremena u napomenu. Stranica treba da prikaže sadržaj (ili sive blokove učitavanja) brzo i bez praznog belog ekrana. Ako neka stranica na telefonu treba više od oko 5 sekundi, prijavi kao P2 sa izmerenim vremenom.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PROD-014 — Jezik srpski / engleski
**Zahtevi:** FR-35, NFR-05 (ekrani S15, S18) · **Prioritet:** P1 (kritično) · **Nalog:** PROD-V1
**Preduslovi:** —
**Koraci:**
1. Na `/profil` promeni jezik na „English" i prođi kroz meni.
2. Odjavi se i prijavi ponovo.
3. Vrati na „Srpski (latinica)".
**Očekivani rezultat:** Sav tekst je odmah na engleskom, bez ijedne srpske reči (osim upisanih podataka). Izbor se pamti posle ponovne prijave. Posle vraćanja sve je na srpskom, sa ispravnim slovima č, ć, š, ž, đ.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PROD-015 — Stranice /privatnost i /uslovi (privremeni tekst)
**Zahtevi:** PRD §12 kriterijum 4, OQ-15 (ekrani S30, S31) · **Prioritet:** P2 (važno) · **Nalog:** bez prijave
**Preduslovi:** Privatni prozor.
**Koraci:**
1. Otvori `/privatnost` i `/uslovi` na srpskom i na engleskom.
2. Klikni linkove „Politika privatnosti" i „Uslovi korišćenja" u podnožju javnih stranica i linkove sa registracije.
**Očekivani rezultat:** Obe stranice se otvaraju bez prijave, sa poglavljima kao u TS-AUTH-026. Tekst je za sada „Tekst dostavlja vlasnik (OQ-15)." — to je očekivano dok vlasnica ne dostavi pravni tekst. Svi linkovi vode na prave stranice.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PROD-016 — Šapa pomoći: javna lista bez prijave
**Zahtevi:** FR-61, FR-62, E-32 (ekrani S32, S33) · **Prioritet:** P1 (kritično) · **Nalog:** bez prijave
**Preduslovi:** Postoji bar jedan aktivan oglas (napravi ga u TS-PROD-017 ako ga nema, pa se vrati).
**Koraci:**
1. U privatnom prozoru otvori `/sapa-pomoci`.
2. Probaj filtere i otvori oglas.
3. Klikni „Prijavi se da pošalješ poruku".
**Očekivani rezultat:** Lista se prikazuje bez prijave, sa karticom „Oglase možeš da pregledaš i bez naloga. …". Filteri rade. Oglas se otvara, a dugme za poruku vodi na prijavu i posle prijave vraća na oglas. Kad nema oglasa, prikazuje se „Još nema oglasa".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PROD-017 — Šapa pomoći: oglas i poruka između dva naloga
**Zahtevi:** FR-63, FR-68, NFR-11, UC-11 (ekrani S34, S33, S36) · **Prioritet:** P1 (kritično) · **Nalog:** PROD-V1 + PROD-V2
**Preduslovi:** Oba naloga su potvrđena.
**Koraci:**
1. Kao PROD-V1 objavi oglas „TEST — ne javljaj se" vrste „Poklanjam", **bez fotografije**.
2. Kao PROD-V2 (drugi pregledač) pronađi ga filterima, otvori i pošalji poruku.
3. Kao PROD-V1 osveži stranicu, otvori `/poruke` i odgovori.
4. Kao PROD-V1 označi oglas kao rešen.
**Očekivani rezultat:** Oglas se objavljuje („Oglas je objavljen i aktivan je do …"). Poruka se kod PROD-V1 vidi posle osvežavanja, sa bedžom na „Poruke". Odgovor se vidi kod PROD-V2 posle osvežavanja. Mejl o novoj poruci ne stiže dok Resend nije podešen (očekivano). Rešen oglas nestaje sa liste.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PROD-018 — Operater i odobravanje azila
**Zahtevi:** FR-42, FR-57, odluka vlasnice za Step 28 (ekrani S26, S20) · **Prioritet:** P1 (kritično) · **Nalog:** PROD-OP, PROD-AZ, PROD-V2
**Preduslovi:** Ivana je dala ulogu operatera nalogu PROD-OP. PROD-AZ je registrovan kao azil (mejl za potvrdu mora da stigne — mejl u Supabase timu).
**Koraci:**
1. Kao PROD-V2 otvori `/admin`.
2. Kao PROD-OP otvori `/admin` → „Azili na čekanju" i odobri PROD-AZ.
3. Kao PROD-AZ otvori `/organizacija`.
**Očekivani rezultat:** PROD-V2 se preusmerava na `/ljubimci`. PROD-OP vidi „Administracija" sa svih 5 kartica i azil na čekanju; posle „Odobri" azil nestaje sa liste. Kod PROD-AZ više nema trake „Čeka odobrenje". (Mejl „Azil je odobren" ne stiže dok Resend nije podešen — očekivano.)
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PROD-019 — Javna stranica organizacije
**Zahtevi:** FR-46, FR-60, BR-37 (ekrani S29, S23) · **Prioritet:** P2 (važno) · **Nalog:** PROD-AZ, bez prijave
**Preduslovi:** PROD-AZ je odobren (TS-PROD-018).
**Koraci:**
1. Kao PROD-AZ na `/organizacija/profil` upiši opis i telefon i sačuvaj. Dodaj jednu životinju u statusu „Za udomljavanje" (bez fotografije).
2. U privatnom prozoru otvori `/o/{slug}`.
3. Klikni „Pošalji zahtev".
**Očekivani rezultat:** Javna stranica se otvara bez prijave, sa nazivom, gradom, opisom i kontaktom azila i životinjom u sekciji „Traže dom" — bez zdravstvenih podataka. „Pošalji zahtev" traži prijavu. Za azil bez životinja „Za udomljavanje" prikazuje se „Trenutno nema životinja za udomljavanje".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PROD-020 — Nepostojeća adresa (404)
**Zahtevi:** API §4.1, Design §8 (stanja grešaka) · **Prioritet:** P2 (važno) · **Nalog:** bez prijave i PROD-V1
**Preduslovi:** —
**Koraci:**
1. Otvori `/ne-postoji-xyz`, `/ljubimci/00000000-0000-0000-0000-000000000000` (prijavljen), `/o/ne-postoji-xyz`, `/t/abc` i `/sapa-pomoci/00000000-0000-0000-0000-000000000000`.
**Očekivani rezultat:** Svaka adresa prikazuje stranicu „nije pronađeno" (ili odgovarajuće prazno stanje: „Ovaj trenutak više nije javan", „Oglas nije dostupan") u izgledu aplikacije, sa putem nazad. Nigde se ne vidi tehnička greška, kod programa ni prazan beli ekran.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PROD-021 — Tuđi podaci se ne vide
**Zahtevi:** FR-34, BR-61, API §4.1 · **Prioritet:** P1 (kritično) · **Nalog:** PROD-V1 + PROD-V2
**Preduslovi:** PROD-V1 ima ljubimca (TS-PROD-007) i razgovor sa PROD-V2. Zapiši adresu kartona (`/ljubimci/{id}`).
**Koraci:**
1. Kao PROD-V2 otvori zapisanu adresu kartona.
2. Kao PROD-V2 otvori profil PROD-V1 u Šapi pomoći (`/korisnik/{id}`).
**Očekivani rezultat:** PROD-V2 ne vidi karton PROD-V1 (stanje „nije pronađeno" ili povratak na svoje ljubimce). Na javnom profilu nema mejla ni telefona.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PROD-022 — Premium na produkciji: „Plaćanje uskoro dostupno"
**Zahtevi:** FR-37, CR-22 (ekran S17) · **Prioritet:** P2 (važno) · **Nalog:** PROD-V1
**Preduslovi:** Paddle još nije podešen na produkciji.
**Koraci:**
1. Otvori `/premium` i pokušaj kupovinu.
**Očekivani rezultat:** Stranica izgleda kao u TS-PREM-001 („Plaćanje uskoro dostupno"), bez tehničke greške. Posle Step 31 i podešavanja Paddle-a ovaj scenario se zamenjuje scenarijima iz fajla 13 (sa pravim cenama u evrima).
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____
