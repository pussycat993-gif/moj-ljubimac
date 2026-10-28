# Test scenariji — Nalog, prijava i profil (AUTH)

**Oblast:** registracija, potvrda mejla, prijava i odjava, zaboravljena lozinka, profil (ime, grad, jezik), pravne stranice, nalog koji čeka brisanje.
**Ekrani:** S15 `/registracija`, S16 `/prijava`, S28 `/prijava/nova-lozinka`, S18 `/profil`, S19 `/profil/podaci`, S30 `/privatnost`, S31 `/uslovi`.
**Zahtevi:** FR-33, FR-34, FR-35, FR-40, BR-29, BR-30, BR-31, BR-32, NFR-03, NFR-04, NFR-05; API EP-41, EP-42, EP-43, EP-51.
**Status izgradnje:** Step 11 i Step 12 (i Step 23 za brisanje naloga) su gotovi — sve u ovom fajlu je spremno za test.

**Okruženje (lokalno):** aplikacija http://localhost:3000 · mejlovi u Mailpit-u http://127.0.0.1:54324 · lozinka za sve test naloge: `MojLjubimac123!`
**Test nalozi:** ivana.petrovic@mojljubimac.test (vlasnik, Premium, Novi Sad) · marko.jovanovic@mojljubimac.test (vlasnik, Free, Beograd) · milica.stojanovic@mojljubimac.test (azil, čeka odobrenje, Bečej) · nikola.djordjevic@mojljubimac.test (odgajivačnica, Beograd).
**Novi nalozi:** za registraciju koristi adrese tipa `qa+<datum>-<broj>@mojljubimac.test` — svaka adresa može da se registruje samo jednom. Na produkciji test nalozi iz seed-a ne postoje: tamo se nalozi prave registracijom, a mejlovi stižu u pravo sanduče.

**Napomena o Google prijavi:** lokalno je Google prijava isključena (podešava se samo na produkciji, u Supabase kontrolnoj tabli). Scenarije TS-AUTH-011 i TS-AUTH-012 lokalno označi „Blokiran" i izvrši ih na produkciji.

---

## Registracija

### TS-AUTH-001 — Registracija vlasnika mejlom i lozinkom
**Zahtevi:** FR-33, BR-29, BR-30 (ekran S15) · **Prioritet:** P1 (kritično) · **Nalog:** novi nalog
**Preduslovi:** Nisi prijavljen/a. Adresa koju koristiš nije ranije registrovana.
**Koraci:**
1. Otvori http://localhost:3000/registracija.
2. Proveri da je pod „Vrsta naloga" ponuđeno: „Vlasnik", „Azil", „Odgajivačnica", svaka sa jednom rečenicom opisa.
3. Izaberi „Vlasnik".
4. Upiši novu mejl adresu i lozinku od najmanje 8 znakova.
5. Štikliraj „Prihvatam uslove korišćenja i politiku privatnosti."
6. Klikni „Napravi nalog".
**Očekivani rezultat:** Prikazuje se stanje „Proveri mejl": „Poslali smo link za potvrdu na <tvoja adresa>", „Klikni na link da aktiviraš nalog. Dok ga ne potvrdiš, aplikacija čeka.", dugmad „Pošalji link ponovo" i „Promeni mejl adresu" i napomena „Ne vidiš mejl? Pogledaj i folder Spam ili Promocije." U Mailpit-u je stigao mejl sa linkom za potvrdu na tu adresu. Za vlasnika se NE prikazuje rečenica o odobrenju azila.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-AUTH-002 — Validacija forme za registraciju
**Zahtevi:** FR-33, EP-41 (ekran S15) · **Prioritet:** P2 (važno) · **Nalog:** novi nalog
**Preduslovi:** Nisi prijavljen/a, otvoren je `/registracija`.
**Koraci:**
1. Ostavi sva polja prazna i klikni „Napravi nalog".
2. Upiši mejl `ivana@` i izađi iz polja (Tab).
3. Upiši lozinku `1234567` (7 znakova) i izađi iz polja.
4. Ispravi mejl i lozinku (8+ znakova), ali NE štikliraj uslove, pa klikni „Napravi nalog".
**Očekivani rezultat:** Greške se prikazuju crvenim tekstom ispod polja (na izlasku iz polja i na slanje): „Upiši ispravnu mejl adresu, npr. ivana@gmail.com.", „Lozinka mora imati najmanje 8 znakova.", „Potrebno je da prihvatiš uslove." Nalog se ne pravi, mejl ne stiže u Mailpit. Ispod lozinke stalno stoji pomoć „Najmanje 8 znakova."
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-AUTH-003 — Registracija sa mejlom koji već ima nalog
**Zahtevi:** FR-33, EP-41 `fields.email = taken` (ekran S15) · **Prioritet:** P2 (važno) · **Nalog:** postojeći marko.jovanovic@mojljubimac.test
**Preduslovi:** Nisi prijavljen/a.
**Koraci:**
1. Na `/registracija` izaberi „Vlasnik", upiši `marko.jovanovic@mojljubimac.test` i ispravnu lozinku, prihvati uslove.
2. Klikni „Napravi nalog".
**Očekivani rezultat:** Prikazuje se greška „Ovaj mejl već ima nalog. Prijavi se ili resetuj lozinku." Ne prelazi se na „Proveri mejl". Postojeći nalog nije promenjen (Marko se i dalje prijavljuje svojom lozinkom).
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-AUTH-004 — Registracija azila
**Zahtevi:** FR-33, FR-42, BR-32 (ekran S15, zatim S20) · **Prioritet:** P1 (kritično) · **Nalog:** novi nalog
**Preduslovi:** Nisi prijavljen/a.
**Koraci:**
1. Na `/registracija` izaberi „Azil".
2. Proveri da se pojavila kartica „Podaci o organizaciji" i napomena „Azil odobravamo ručno, obično u roku od 2 dana."
3. Upiši „Naziv organizacije *" (npr. Udruženje „QA šapa"), izaberi „Grad *" iz liste (npr. Bečej), PIB ostavi prazan.
4. Upiši novi mejl, lozinku, prihvati uslove i klikni „Napravi nalog".
5. Otvori mejl u Mailpit-u i klikni link za potvrdu.
**Očekivani rezultat:** Posle slanja: „Proveri mejl" sa dodatnom rečenicom „Kad potvrdiš mejl, tvoj azil ide na odobrenje — obično u roku od 2 dana." Posle klika na link otvara se `/organizacija` sa obaveštenjem da azil čeka odobrenje; sve je samo za pregled (dodavanje životinja i pozivanje tima nisu dostupni). Polje „Grad" je padajuća lista, ne slobodan tekst.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-AUTH-005 — Registracija odgajivačnice
**Zahtevi:** FR-33, FR-42, BR-11 (ekran S15) · **Prioritet:** P2 (važno) · **Nalog:** novi nalog
**Preduslovi:** Nisi prijavljen/a.
**Koraci:**
1. Na `/registracija` izaberi „Odgajivačnica".
2. Popuni naziv organizacije, grad, opciono PIB od 9 cifara, mejl, lozinku, prihvati uslove, klikni „Napravi nalog".
3. Potvrdi mejl iz Mailpit-a.
**Očekivani rezultat:** Pre slanja se vidi napomena „Odgajivačnica koristi poseban plaćeni plan — izabraćeš ga posle potvrde mejla." Posle potvrde mejla otvara se `/organizacija` (odgajivačnica nije na čekanju odobrenja). Bez aktivnog odgajivačkog plana vidi se obaveštenje „Odgajivački plan nije aktivan — sve možeš samo da pregledaš."
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-AUTH-006 — Validacija podataka o organizaciji
**Zahtevi:** FR-33, EP-41 (`org_name`, `city_id`, `tax_id`) (ekran S15) · **Prioritet:** P2 (važno) · **Nalog:** novi nalog
**Preduslovi:** Otvoren `/registracija`, izabrano „Azil".
**Koraci:**
1. Ostavi „Naziv organizacije *" i „Grad *" prazne, popuni mejl, lozinku, uslove i klikni „Napravi nalog".
2. Upiši PIB `12345` (manje od 9 cifara) i pokušaj ponovo.
3. Prebaci vrstu naloga na „Vlasnik".
**Očekivani rezultat:** Greške: „Upiši naziv organizacije.", „Izaberi grad." Pogrešan PIB je odbijen sa greškom ispod polja PIB (pomoć ispod polja: „Nije obavezno. Upiši ako je organizacija registrovana."). Kad se izabere „Vlasnik", kartica „Podaci o organizaciji" nestaje i registracija vlasnika ne traži ta polja.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

---

## Potvrda mejla

### TS-AUTH-007 — Potvrda mejla i prvi ulazak u aplikaciju
**Zahtevi:** FR-33, BR-29, EP-41, EP-42 (ekran S15 → S01) · **Prioritet:** P1 (kritično) · **Nalog:** nalog iz TS-AUTH-001
**Preduslovi:** Završen TS-AUTH-001, mejl za potvrdu je u Mailpit-u.
**Koraci:**
1. Otvori Mailpit, pronađi mejl za potvrdu poslat na novu adresu.
2. Klikni link za potvrdu.
**Očekivani rezultat:** Otvara se `/ljubimci` (Moji ljubimci) sa praznim stanjem „Dodaj svog prvog ljubimca" / „Napravi karton i podsetićemo te na vakcine, terapije i rođendane." Korisnik je prijavljen; u dnu bočnog menija (računar) vidi se novi nalog.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-AUTH-008 — Prijava sa nepotvrđenim mejlom i „Pošalji link ponovo"
**Zahtevi:** FR-33, BR-29, EP-42 `email_not_verified` (ekran S16) · **Prioritet:** P1 (kritično) · **Nalog:** novi nalog (registrovan, mejl NIJE potvrđen)
**Preduslovi:** Registruj novi nalog (kao u TS-AUTH-001) i ne klikći link u mejlu.
**Koraci:**
1. Otvori `/prijava`, upiši mejl i lozinku nepotvrđenog naloga, klikni „Prijavi se".
2. Proveri poruku i klikni ponuđenu opciju za ponovno slanje linka.
3. Otvori Mailpit.
**Očekivani rezultat:** Prijava ne uspeva; prikazuje se greška da mejl nije potvrđen, sa opcijom da se link pošalje ponovo (ne prikazuje se „Pogrešan mejl ili lozinka."). Posle klika u Mailpit-u stiže novi mejl za potvrdu. Klik na novi link potvrđuje nalog i otvara `/ljubimci`.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-AUTH-009 — „Pošalji link ponovo" na ekranu „Proveri mejl"
**Zahtevi:** FR-33, EP-41 resend (ekran S15) · **Prioritet:** P2 (važno) · **Nalog:** novi nalog
**Preduslovi:** Upravo si se registrovao/la i vidiš „Proveri mejl".
**Koraci:**
1. Klikni „Pošalji link ponovo".
2. Proveri Mailpit.
3. Klikni „Pošalji link ponovo" još više puta zaredom (5+ puta brzo).
4. Klikni „Promeni mejl adresu".
**Očekivani rezultat:** Posle prvog klika stiže još jedan mejl za potvrdu. Kod mnogo brzih klikova aplikacija ne puca — eventualno prikazuje poruku da se pokuša kasnije (ograničenje slanja). „Promeni mejl adresu" vraća na formu za registraciju.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-AUTH-010 — Nepotvrđen nalog ne može da koristi aplikaciju
**Zahtevi:** FR-33 („the product cannot be used until it is"), BR-29 · **Prioritet:** P1 (kritično) · **Nalog:** novi nalog (mejl nije potvrđen)
**Preduslovi:** Registrovan nalog bez potvrde mejla.
**Koraci:**
1. U istom pregledaču, bez klika na link, ručno otvori http://localhost:3000/ljubimci.
2. Otvori i `/podsetnici` i `/profil`.
**Očekivani rezultat:** Nijedna stranica aplikacije ne prikazuje podatke; korisnik se vraća na `/prijava`. Tek posle potvrde mejla stranice se otvaraju.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-AUTH-011 — Registracija preko Google-a (izbor vrste naloga)
**Zahtevi:** FR-33, BR-29, EP-41 completion, EP-42 (ekran S15) · **Prioritet:** P1 (kritično) · **Nalog:** novi Google nalog (samo produkcija)
**Preduslovi:** ⚠ Lokalno Google nije uključen — izvrši na produkciji. Imaš Google nalog koji nikad nije korišćen u Moj Ljubimac.
**Koraci:**
1. Na `/registracija` klikni „Nastavi sa Google-om" i izaberi Google nalog.
2. Kad se vratiš u aplikaciju, proveri da se traži izbor vrste naloga (Vlasnik / Azil / Odgajivačnica).
3. Izaberi „Vlasnik" i završi.
**Očekivani rezultat:** Bez izbora vrste naloga ne može da se nastavi. Posle izbora otvara se `/ljubimci`. Mejl potvrda nije potrebna (Google je već potvrdio adresu). Za „Azil"/„Odgajivačnica" traže se naziv organizacije i grad.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

---

## Prijava i odjava

### TS-AUTH-012 — Prijava preko Google-a postojećim nalogom
**Zahtevi:** FR-34, EP-42 (ekran S16) · **Prioritet:** P2 (važno) · **Nalog:** Google nalog iz TS-AUTH-011 (samo produkcija)
**Preduslovi:** ⚠ Samo produkcija. Nalog iz TS-AUTH-011 postoji, odjavljen/a si.
**Koraci:**
1. Na `/prijava` klikni „Nastavi sa Google-om" i izaberi isti Google nalog.
**Očekivani rezultat:** Ulaziš direktno na `/ljubimci`, bez ponovnog pitanja za vrstu naloga. Vide se tvoji podaci.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-AUTH-013 — Uspešna prijava mejlom i lozinkom
**Zahtevi:** FR-34, EP-42 (ekran S16) · **Prioritet:** P1 (kritično) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Odjavljen/a si.
**Koraci:**
1. Otvori `/prijava`. Proveri naslov „Zdravo ponovo" i tekst „Prijavi se da vidiš kartone i podsetnike svojih ljubimaca."
2. Upiši mejl i lozinku `MojLjubimac123!`, klikni „Prijavi se".
**Očekivani rezultat:** Otvara se `/ljubimci` sa Ivaninim ljubimcima. U bočnom meniju (računar) / u gornjoj traci (telefon) vidi se Ivana Petrović. Na stranici prijave postoje i „Nastavi sa Google-om", „Zaboravljena lozinka?" i „Napravi nalog".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-AUTH-014 — Pogrešna lozinka i nepostojeći mejl
**Zahtevi:** FR-34, EP-42 `unauthenticated` (ekran S16) · **Prioritet:** P1 (kritično) · **Nalog:** marko.jovanovic@mojljubimac.test
**Preduslovi:** Odjavljen/a si.
**Koraci:**
1. Upiši Markov mejl i pogrešnu lozinku `Pogresna123!`, klikni „Prijavi se".
2. Upiši mejl koji ne postoji (npr. `nema.nikoga@mojljubimac.test`) i bilo koju lozinku.
3. Upiši mejl `marko@` (neispravan oblik) i izađi iz polja.
**Očekivani rezultat:** U koracima 1 i 2 prikazuje se ISTA poruka: „Pogrešan mejl ili lozinka." i „Proveri podatke ili resetuj lozinku. Ako koristiš Google nalog, prijavi se dugmetom ispod." (aplikacija ne otkriva da li nalog postoji). U koraku 3 ispod polja: „Upiši ispravnu mejl adresu." Korisnik ostaje na `/prijava`.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-AUTH-015 — Zaštita stranica bez prijave
**Zahtevi:** FR-34, API §4.1 · **Prioritet:** P1 (kritično) · **Nalog:** bez prijave
**Preduslovi:** Odjavljen/a si (ili koristi privatni prozor pregledača).
**Koraci:**
1. Redom ručno otvori: `/ljubimci`, `/ljubimci/novi`, `/uspomene`, `/podsetnici`, `/podesavanja/podsetnici`, `/domacinstvo`, `/premium`, `/profil`, `/profil/podaci`, `/partneri`, `/organizacija`.
**Očekivani rezultat:** Svaka adresa vodi na `/prijava`. Ni na trenutak se ne vide tuđi ili lični podaci.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-AUTH-016 — Javne stranice rade bez prijave
**Zahtevi:** API §4.1, Design §5.3 (S15, S16, S30, S31, S09) · **Prioritet:** P2 (važno) · **Nalog:** bez prijave
**Preduslovi:** Privatni prozor pregledača.
**Koraci:**
1. Otvori `/registracija`, `/prijava`, `/privatnost`, `/uslovi`.
2. Otvori javni link nekog trenutka `/t/<slug>` (dobij ga od testera koji je uključio javni link, vidi TS-CARE-021).
**Očekivani rezultat:** Sve se otvara bez preusmeravanja na prijavu.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-AUTH-017 — Odjava
**Zahtevi:** FR-34 („When they sign out, Then no data is visible"), EP-42 (ekran S18 / meni) · **Prioritet:** P1 (kritično) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Prijavljen/a si, otvoren je karton nekog ljubimca.
**Koraci:**
1. Otvori `/profil` i klikni „Odjavi se".
2. Klikni dugme „Nazad" u pregledaču.
3. Osveži stranicu.
**Očekivani rezultat:** Posle odjave otvara se `/prijava`. „Nazad" i osvežavanje ne prikazuju karton — vodi na `/prijava`.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

---

## Zaboravljena lozinka

### TS-AUTH-018 — Zahtev za novu lozinku
**Zahtevi:** FR-34, EP-42 reset (ekran S16) · **Prioritet:** P1 (kritično) · **Nalog:** marko.jovanovic@mojljubimac.test
**Preduslovi:** Odjavljen/a si.
**Koraci:**
1. Na `/prijava` klikni „Zaboravljena lozinka?".
2. Upiši Markov mejl i pošalji zahtev.
3. Ponovi za mejl koji ne postoji (`nema.nikoga@mojljubimac.test`).
4. Proveri Mailpit.
**Očekivani rezultat:** U oba slučaja aplikacija prikazuje istu potvrdu da je link poslat (ne otkriva da li nalog postoji). U Mailpit-u stiže mejl sa linkom samo za Markov mejl.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-AUTH-019 — Postavljanje nove lozinke iz mejla
**Zahtevi:** FR-34 („set a new password once"), EP-42 (ekran S28) · **Prioritet:** P1 (kritično) · **Nalog:** marko.jovanovic@mojljubimac.test
**Preduslovi:** Završen TS-AUTH-018. ⚠ Posle testa vrati Marku lozinku `MojLjubimac123!` (ponovi ovaj scenario) da drugi testovi rade.
**Koraci:**
1. U Mailpit-u otvori mejl i klikni link.
2. Proveri da se otvara `/prijava/nova-lozinka` sa naslovom „Nova lozinka" i tekstom „Postavljaš lozinku za nalog" + mejl.
3. Upiši novu lozinku dva puta (npr. `NovaLozinka2026!`), klikni „Sačuvaj novu lozinku".
4. Klikni „Prijavi se" i prijavi se novom lozinkom.
5. Odjavi se i pokušaj prijavu STAROM lozinkom.
**Očekivani rezultat:** Posle čuvanja: „Lozinka je promenjena" / „Od sada se prijavljuješ novom lozinkom. Stari link više ne važi." Prijava novom lozinkom radi; starom dobija „Pogrešan mejl ili lozinka."
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-AUTH-020 — Validacija nove lozinke
**Zahtevi:** FR-34 (ekran S28) · **Prioritet:** P2 (važno) · **Nalog:** marko.jovanovic@mojljubimac.test
**Preduslovi:** Otvoren važeći link za novu lozinku (TS-AUTH-018, korak 1 iz TS-AUTH-019).
**Koraci:**
1. Upiši lozinku od 7 znakova i istu u „Ponovi lozinku", klikni „Sačuvaj novu lozinku".
2. Upiši `lunaimaks2026` i `lunaimaks2025`, klikni sačuvaj.
3. Upiši ispravnu lozinku, polje „Ponovi lozinku" ostavi prazno.
**Očekivani rezultat:** 1: „Lozinka mora imati najmanje 8 znakova." 2: „Lozinke se ne poklapaju. Upiši istu lozinku dva puta." 3: „Ponovi novu lozinku." Lozinka se ne menja ni u jednom slučaju.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-AUTH-021 — Iskorišćen ili istekao link za novu lozinku
**Zahtevi:** FR-34, EP-42 `invalid_action_token` (ekran S28) · **Prioritet:** P1 (kritično) · **Nalog:** marko.jovanovic@mojljubimac.test
**Preduslovi:** Završen TS-AUTH-019 (link je već jednom iskorišćen).
**Koraci:**
1. U Mailpit-u ponovo klikni ISTI link iz TS-AUTH-019.
2. Klikni „Pošalji novi link".
**Očekivani rezultat:** Prikazuje se „Link je istekao" / „Ovaj link za novu lozinku je već iskorišćen ili je istekao. Zatraži novi — stiže za minut na tvoj mejl." sa dugmadima „Pošalji novi link" i „Prijavi se". „Pošalji novi link" vodi na zahtev za novu lozinku. Isto stanje se vidi i ako se `/prijava/nova-lozinka` otvori direktno bez linka.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

---

## Profil i jezik

### TS-AUTH-022 — Izmena imena i grada u profilu
**Zahtevi:** FR-35, EP-43 (ekran S18) · **Prioritet:** P2 (važno) · **Nalog:** marko.jovanovic@mojljubimac.test
**Preduslovi:** Prijavljen/a kao Marko.
**Koraci:**
1. Otvori `/profil`. U kartici „Lični podaci" proveri polja „Ime i prezime", „Grad", „Mejl adresa", „Jezik".
2. Promeni ime u „Marko Jovanović QA", grad izaberi iz liste (npr. Novi Sad), klikni „Sačuvaj".
3. Osveži stranicu.
4. Pokušaj da izmeniš polje „Mejl adresa".
**Očekivani rezultat:** Izmene ostaju posle osvežavanja; novo ime se vidi i u meniju (korisnik u dnu menija). „Grad" je padajuća lista gradova (nema slobodnog unosa). Mejl adresa se ne menja ovde. ⚠ Na kraju vrati ime i grad (Beograd).
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-AUTH-023 — Prebacivanje jezika u profilu i pamćenje izbora
**Zahtevi:** FR-35, NFR-05, EP-43 `locale` (ekran S18) · **Prioritet:** P1 (kritično) · **Nalog:** marko.jovanovic@mojljubimac.test
**Preduslovi:** Prijavljen/a kao Marko, jezik srpski.
**Koraci:**
1. Na `/profil` u polju „Jezik" izaberi „English" i sačuvaj.
2. Prođi kroz meni: Ljubimci, Podsetnici, Profil.
3. Odjavi se i ponovo prijavi.
4. Prijavi se istim nalogom u drugom pregledaču (ili privatnom prozoru).
5. Vrati jezik na „Srpski (latinica)".
**Očekivani rezultat:** Ceo interfejs odmah prelazi na engleski (meni „Pets", „Reminders", „Profile"; dugmad, poruke, prazna stanja). Nigde ne ostaje srpski tekst (osim imena koja je korisnik upisao). Izbor se pamti posle odjave i na drugom pregledaču. Posle vraćanja sve je ponovo na srpskom.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-AUTH-024 — Registracija na engleskom
**Zahtevi:** FR-35, EP-41 `locale` (ekran S15) · **Prioritet:** P2 (važno) · **Nalog:** novi nalog
**Preduslovi:** Nisi prijavljen/a.
**Koraci:**
1. Na `/registracija` u izboru „Jezik" prebaci SR → EN.
2. Proveri tekstove forme, pa namerno izazovi greške (prazna polja).
3. Registruj se, potvrdi mejl, uđi u aplikaciju.
**Očekivani rezultat:** Forma na engleskom: „Create an account", „Account type", „Owner / Shelter / Breeder", „Continue with Google", „Create account"; greške „Enter a valid email address, e.g. ivana@gmail.com.", „Password must be at least 8 characters.", „Please accept the terms."; posle slanja „Check your email". Posle potvrde aplikacija je na engleskom (nalog je sačuvan sa EN jezikom).
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-AUTH-025 — Formati datuma i brojeva po jeziku
**Zahtevi:** FR-35, Design §9 (formati) · **Prioritet:** P3 (sitno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Ivana ima ljubimca sa bar jednim merenjem težine i vakcinom.
**Koraci:**
1. Na srpskom otvori karton ljubimca i pogledaj datume i težinu.
2. Prebaci jezik na English i pogledaj isto.
**Očekivani rezultat:** Srpski: datum „19. 10. 2026.", vreme „08:00", težina „4,2 kg". Engleski: datum „19 Oct 2026", vreme „08:00", težina „4.2 kg". ⚠ Vrati jezik na srpski.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

---

## Pravne stranice

### TS-AUTH-026 — Stranice /privatnost i /uslovi
**Zahtevi:** PRD §12 kriterijum 4 (ekrani S30, S31) · **Prioritet:** P2 (važno) · **Nalog:** bez prijave
**Preduslovi:** Privatni prozor.
**Koraci:**
1. Otvori `/privatnost`.
2. Klikni svaku stavku u kartici „Sadržaj".
3. Otvori `/uslovi`.
4. U podnožju stranica klikni „Politika privatnosti" i „Uslovi korišćenja".
**Očekivani rezultat:** `/privatnost`: naslov „Politika privatnosti", uvod „Kako Moj Ljubimac čuva tvoje podatke i podatke tvojih ljubimaca. Poslednja izmena: …", sekcije „Ko smo", „Koje podatke prikupljamo", „Zašto ih prikupljamo", „Koliko ih čuvamo", „Tvoja prava", „Kontakt". `/uslovi`: „Uslovi korišćenja", red „Verzija {broj}", sekcije „Opšte", „Nalog", „Premium i plaćanje", „Sadržaj korisnika", „Odgovornost", „Izmene uslova", „Kontakt". Svaka sekcija za sada ima tekst „Tekst dostavlja vlasnik (OQ-15)." (pravi tekst još nije dostavljen — to NIJE greška). Linkovi iz „Sadržaj" skroluju do sekcije.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-AUTH-027 — Linkovi na uslove iz registracije
**Zahtevi:** Build Plan Step 12 (vlasnička odluka), FR-33 (ekran S15) · **Prioritet:** P3 (sitno) · **Nalog:** bez prijave
**Preduslovi:** Otvoren `/registracija`.
**Koraci:**
1. U tekstu „Prihvatam uslove korišćenja i politiku privatnosti." klikni „uslove korišćenja".
2. Vrati se i klikni „politiku privatnosti".
3. Prebaci na EN i ponovi.
**Očekivani rezultat:** Otvaraju se `/uslovi` odnosno `/privatnost`. Na EN tekst „I accept the terms of use and privacy policy." sa istim linkovima; pravne stranice prate izabrani jezik.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

---

## Posebna stanja naloga

### TS-AUTH-028 — Prijava sa nalogom koji čeka brisanje i otkazivanje brisanja
**Zahtevi:** FR-40, BR-31, E-16, EP-42, EP-51 (ekran S19) · **Prioritet:** P1 (kritično) · **Nalog:** novi nalog
**Preduslovi:** Napravi i potvrdi novi vlasnički nalog (TS-AUTH-001/007), dodaj mu jednog ljubimca. Na `/profil/podaci` klikni „Obriši nalog", u dijalogu „Obrisati nalog?" štikliraj „Razumem da se posle 30 dana podaci ne mogu vratiti." i klikni „Da, obriši".
**Koraci:**
1. Odjavi se, pa se ponovo prijavi istim nalogom.
2. Proveri gde si završio/la i šta piše.
3. Pokušaj ručno da otvoriš `/ljubimci` i `/podsetnici`.
4. Klikni „Otkaži brisanje".
5. Otvori `/ljubimci`.
**Očekivani rezultat:** Posle prijave otvara se `/profil/podaci` u stanju „Brisanje na čekanju" sa brojačem „Preostalo N od 30 dana" i dugmetom „Otkaži brisanje" („Ako otkažeš, nalog se vraća tačno onakav kakav je bio."). Druge stranice ne rade dok je brisanje na čekanju (ne prikazuju podatke). Posle „Otkaži brisanje" nalog radi normalno i ljubimac je tu, nepromenjen. U Mailpit-u su stigli mejlovi „Nalog će biti obrisan {datum}" (posle zahteva) i potvrda otkazivanja.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-AUTH-029 — Odjava je dozvoljena dok nalog čeka brisanje
**Zahtevi:** API §4.1 (izuzetak za odjavu), EP-42 · **Prioritet:** P3 (sitno) · **Nalog:** novi nalog sa zahtevom za brisanje (kao u TS-AUTH-028, pre otkazivanja)
**Preduslovi:** Nalog u stanju „Brisanje na čekanju", prijavljen/a si.
**Koraci:**
1. Odjavi se (preko menija/profila).
**Očekivani rezultat:** Odjava uspeva, otvara se `/prijava`, nema poruke o grešci.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-AUTH-030 — Prijava azila koji čeka odobrenje
**Zahtevi:** FR-42, BR-32, EP-42 (ekran S16 → S20) · **Prioritet:** P2 (važno) · **Nalog:** milica.stojanovic@mojljubimac.test
**Preduslovi:** Azil „Milica" još nije odobren od strane operatera.
**Koraci:**
1. Prijavi se kao Milica.
2. Pokušaj ručno da otvoriš `/ljubimci/novi`.
**Očekivani rezultat:** Posle prijave otvara se `/organizacija` (ne `/ljubimci`) sa obaveštenjem da azil čeka odobrenje; sve je samo za pregled, dugmad za dodavanje i izmene nisu prikazana. Organizacija nema lične ljubimce — dodavanje ličnog ljubimca nije ponuđeno.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

---

## Telefon i pristupačnost

### TS-AUTH-031 — Registracija i prijava na telefonu (375 px)
**Zahtevi:** NFR-03 (ekrani S15, S16, S28, S18) · **Prioritet:** P2 (važno) · **Nalog:** novi nalog + marko.jovanovic@mojljubimac.test
**Preduslovi:** Pravi telefon ili alat za programere u pregledaču sa širinom 375 px.
**Koraci:**
1. Otvori `/registracija`, izaberi „Azil" (najduža forma) i prođi kroz celu formu.
2. Otvori `/prijava` i prijavi se kao Marko.
3. Otvori `/profil`.
**Očekivani rezultat:** Nema horizontalnog skrolovanja; tekst nigde ne izlazi iz kartice; dugmad su dovoljno velika za prst (oko 44 px visine); padajuća lista gradova se normalno otvara. Na profilu je donja navigacija (Ljubimci, Podsetnici, Šapa, Partneri, Profil) i ne prekriva dugme „Sačuvaj"/„Odjavi se".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-AUTH-032 — Prijava i registracija samo tastaturom
**Zahtevi:** NFR-04, Design §10 (ekrani S15, S16) · **Prioritet:** P2 (važno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Računar, bez miša.
**Koraci:**
1. Na `/prijava` pomoću Tab dođi do polja, upiši podatke, Enter.
2. Odjavi se. Na `/registracija` Tab-om prođi kroz vrste naloga (strelicama menjaj izbor), polja, štiklu i dugme.
**Očekivani rezultat:** Svaki element dobija vidljiv okvir fokusa (smeđi prsten). Redosled je logičan (odozgo nadole). Vrsta naloga se bira strelicama, štikla Space-om. Prijava radi Enter-om. Poruke o grešci su povezane sa poljem (čitač ekrana ih pročita uz polje).
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____
