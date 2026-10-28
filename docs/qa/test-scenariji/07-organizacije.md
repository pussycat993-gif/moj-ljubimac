# 07 — Organizacije: azili i odgajivačnice (oblast ORG)

**Status:** ✅ spremno za test (Steps 24, 25 i 26 gotovi). Odobravanje azila u admin delu čeka Step 28, a plaćanje odgajivačkog plana čeka Step 31. Do tada te korake radi programer u bazi (vidi „Pre početka").
**Ekrani:** S15 Registracija, S20 Životinje i tim (`/organizacija`), S29 Javni profil (`/organizacija/profil`), S21 Zahtevi i upiti (`/organizacija/zahtevi`), S22 Legla (`/organizacija/legla`), S23 Javna stranica (`/o/[slug]`), S14 Prihvati poziv / karton (`/poziv/[token]`)
**Zahtevi:** FR-42 … FR-51, FR-59, FR-60, BR-32 … BR-39, BR-46, BR-47, BR-51 … BR-53, E-17 … E-21, UC-08, UC-09
**Okruženje:** lokalno http://localhost:3000 · Mailpit http://127.0.0.1:54324 · lozinka `MojLjubimac123!`

**Pre početka (redosled je važan):**
1. Prvo izvrši scenarije za azil koji **čeka odobrenje** (TS-ORG-001 … TS-ORG-004) sa nalogom `milica.stojanovic@mojljubimac.test`.
2. Zatim zamoli programera da u bazi odobri Miličin azil. Admin ekran za to stiže tek sa Step 28.
3. Za odgajivačnicu `nikola.djordjevic@mojljubimac.test` prvo izvrši TS-ORG-005 (bez plana). Onda zamoli programera da mu aktivira odgajivački plan, jer plaćanje stiže tek sa Step 31.
4. Volonter u scenarijima je `jelena.nikolic@mojljubimac.test`, kojeg Milica poziva u tim (TS-ORG-015, TS-ORG-016).
5. Mejlove koje aplikacija šalje (poziv u tim, zahtevi, karton) proveravaj u Mailpit-u. Ako mejla nema, a ostalo radi, upiši to u napomenu i javi programeru.

---

### TS-ORG-001 — Registracija azila
**Zahtevi:** FR-33, FR-42, BR-32 (ekran S15) · **Prioritet:** P1 (kritično) · **Nalog:** novi nalog (qa.azil@mojljubimac.test)
**Preduslovi:** Niko nije prijavljen.
**Koraci:**
1. Otvori `/registracija` i izaberi „Azil".
2. Pokušaj da pošalješ formular bez „Naziv organizacije" i „Grad".
3. Popuni naziv „Azil QA", grad „Novi Sad", PIB ostavi prazan, upiši mejl i lozinku, i pošalji.
4. U Mailpit-u potvrdi mejl i prijavi se.
**Očekivani rezultat:** Za azil se pojavljuju polja „Naziv organizacije*" i „Grad*" (izbor sa liste gradova) i opciono „PIB", kao i napomena „Azil odobravamo ručno, obično u roku od 2 dana.". Bez obaveznih polja se prikazuju greške ispod polja. Posle slanja se vidi stanje „Proveri mejl". Posle potvrde i prijave otvara se `/organizacija` sa trakom da azil čeka odobrenje (kao TS-ORG-002).
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-ORG-002 — Azil koji čeka odobrenje vidi sve samo za čitanje
**Zahtevi:** FR-42, BR-32, EP-53 (ekran S20) · **Prioritet:** P1 (kritično) · **Nalog:** milica.stojanovic@mojljubimac.test
**Preduslovi:** Miličin azil još nije odobren.
**Koraci:**
1. Prijavi se i otvori `/organizacija`.
2. Pogledaj kartice „Životinje" i „Tim".
**Očekivani rezultat:** Na vrhu stoji oznaka „Čeka odobrenje" i tekst „Tvoj azil čeka odobrenje. Obično odobravamo u roku od 2 dana — do tada sve možeš samo da pregledaš.". Nema dugmadi „Novi prijem", „Pozovi člana", „Promeni status" ni „Obriši životinju".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-ORG-003 — Azil na čekanju ne može da menja profil, zahteve ni tim
**Zahtevi:** FR-42, EP-72, EP-56 `organisation_pending_approval` (ekrani S29, S21) · **Prioritet:** P2 (važno) · **Nalog:** milica.stojanovic@mojljubimac.test
**Preduslovi:** Isto kao TS-ORG-002.
**Koraci:**
1. Otvori `/organizacija/profil` i pokušaj da promeniš opis i sačuvaš.
2. Otvori `/organizacija/zahtevi`.
**Očekivani rezultat:** Profil se ne može sačuvati: polja i dugme za čuvanje su sakriveni, ili se prikazuje greška da azil čeka odobrenje. Ništa se ne menja. Na S21 nema dugmadi „Prihvati" ni „Odbij".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-ORG-004 — Javna stranica azila na čekanju nije dostupna
**Zahtevi:** FR-46, EP-62 (ekran S23) · **Prioritet:** P2 (važno) · **Nalog:** bez prijave
**Preduslovi:** Znaš adresu (slug) Miličinog azila (npr. iz linka „Pogledaj javnu stranicu" na S29).
**Koraci:**
1. U privatnom prozoru otvori `/o/{slug}`.
**Očekivani rezultat:** Stranica se ne prikazuje. Vidi se poruka da stranica nije pronađena (stanje greške), bez ijednog podatka o azilu.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-ORG-005 — Odgajivačnica bez aktivnog plana: samo pregled
**Zahtevi:** FR-42, BR-11, E-21, EP-53 (ekrani S20, S22, S21, S23) · **Prioritet:** P1 (kritično) · **Nalog:** nikola.djordjevic@mojljubimac.test
**Preduslovi:** Nikola nema aktivan odgajivački plan.
**Koraci:**
1. Otvori `/organizacija`, `/organizacija/legla` i `/organizacija/zahtevi`.
2. Otvori javnu stranicu odgajivačnice `/o/{slug}` u privatnom prozoru.
**Očekivani rezultat:** Na stranicama organizacije stoji traka „Odgajivački plan nije aktivan — sve možeš samo da pregledaš.". Nema „Novo leglo", izmene statusa i cene ni „Prihvati" / „Odbij". Postojeći podaci se vide. Javna stranica se ne prikazuje (nije pronađena).
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-ORG-006 — Novi prijem životinje u azil
**Zahtevi:** FR-44, FR-45, EP-55 (ekran S20) · **Prioritet:** P1 (kritično) · **Nalog:** milica.stojanovic@mojljubimac.test
**Preduslovi:** Azil je odobren (programer).
**Koraci:**
1. Na `/organizacija` klikni „Novi prijem".
2. Upiši ime „Bobi", vrstu „Pas", pol „Mužjak", današnji datum prijema i način dolaska „Pronađen", i mesto pronalaska „Liman 3, kod parka".
3. Klikni „Sačuvaj prijem".
**Očekivani rezultat:** Dijalog ima podnaslov „Upiši osnovno sada — karton dopunjavaš kasnije.". Posle čuvanja Bobi se pojavlja u listi sa statusom „Prijem", a broj na čipu „Prijem" raste za 1.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-ORG-007 — Validacija novog prijema
**Zahtevi:** FR-45, EP-55 (ekran S20) · **Prioritet:** P2 (važno) · **Nalog:** milica.stojanovic@mojljubimac.test
**Preduslovi:** Azil je odobren.
**Koraci:**
1. Otvori „Novi prijem" i klikni „Sačuvaj prijem" bez ijednog podatka.
2. Izaberi vrstu „Ostalo" i ostavi prazno polje za vrstu.
3. Pokušaj da izabereš datum prijema u budućnosti.
**Očekivani rezultat:** Ispod obaveznih polja (ime, datum prijema, način dolaska, vrsta) stoje greške i ništa se ne čuva. Za „Ostalo" se traži naziv vrste. Datumi u budućnosti ne mogu da se izaberu.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-ORG-008 — Promena statusa životinje
**Zahtevi:** FR-45, BR-35, EP-55 (ekran S20) · **Prioritet:** P1 (kritično) · **Nalog:** milica.stojanovic@mojljubimac.test
**Preduslovi:** Bobi je u statusu „Prijem".
**Koraci:**
1. U meniju reda za Bobija izaberi „Promeni status" → „Na brizi".
2. Zatim izaberi „Za udomljavanje".
3. Proveri čipove statusa.
4. Promeni status jedne druge životinje u „Uginuo".
**Očekivani rezultat:** Status se odmah menja u redu, a brojevi na čipovima se ažuriraju. Čipovi „Uginuo" i „Vraćen vlasniku" se ne vide dok nijedna životinja nema taj status. Posle koraka 4 se pojavljuje čip „Uginuo (1)".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-ORG-009 — Filter po statusu
**Zahtevi:** FR-45, EP-54 (ekran S20) · **Prioritet:** P2 (važno) · **Nalog:** milica.stojanovic@mojljubimac.test
**Preduslovi:** Azil ima životinje u bar 3 različita statusa.
**Koraci:**
1. Klikni čip „Za udomljavanje", pa „Na brizi", pa „Sve".
**Očekivani rezultat:** Svaki put se vide samo životinje izabranog statusa, a broj na čipu se slaže sa brojem redova. „Sve" vraća celu listu.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-ORG-010 — Pretraga životinja bez obzira na kvačice
**Zahtevi:** FR-59, EP-54 (ekran S20) · **Prioritet:** P2 (važno) · **Nalog:** milica.stojanovic@mojljubimac.test
**Preduslovi:** Postoji životinja sa imenom koje ima kvačicu, npr. „Čupko" (dodaj je novim prijemom).
**Koraci:**
1. U polje „Pretraži životinje…" upiši `cupko`.
2. Upiši `ČUP`.
3. Upiši `xyz`.
4. Klikni „Obriši pretragu".
**Očekivani rezultat:** Za korake 1 i 2 se nalazi „Čupko". Za korak 3 se prikazuje prazno stanje „Proveri kako je ime napisano ili obriši pretragu." sa dugmetom „Obriši pretragu". Korak 4 vraća celu listu.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-ORG-011 — Prazno stanje azila bez životinja
**Zahtevi:** FR-44 (ekran S20) · **Prioritet:** P3 (sitno) · **Nalog:** qa.azil@mojljubimac.test (odobren, bez životinja)
**Preduslovi:** Azil je odobren i nema nijednu životinju.
**Koraci:**
1. Otvori `/organizacija`.
**Očekivani rezultat:** Prikazuje se „Još nema životinja" i „Upiši prvi prijem i vodi karton od prvog dana." sa dugmetom „Novi prijem".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-ORG-012 — Pun karton za životinju organizacije
**Zahtevi:** FR-44, BR-51 (ekran S03) · **Prioritet:** P2 (važno) · **Nalog:** milica.stojanovic@mojljubimac.test
**Preduslovi:** Bobi postoji.
**Koraci:**
1. U meniju reda klikni „Otvori karton".
2. Dodaj vakcinu sa datumom sledeće doze, merenje težine i pregled.
**Očekivani rezultat:** Otvara se pun karton (vakcine, terapije, pregledi, težina) i svi unosi se čuvaju. Za životinje organizacije se ne prave automatski podsetnici (BR-51). Bilo koji podsetnik koji bi se pojavio za Bobija prijavi kao grešku.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-ORG-013 — Brisanje životinje (samo admin)
**Zahtevi:** FR-43, BR-34 (ekran S20) · **Prioritet:** P2 (važno) · **Nalog:** milica.stojanovic@mojljubimac.test
**Preduslovi:** Postoji probna životinja koju smeš da obrišeš.
**Koraci:**
1. U meniju reda izaberi „Obriši životinju".
2. U dijalogu klikni „Odustani", pa ponovi i potvrdi sa „Da, obriši".
**Očekivani rezultat:** „Odustani" ne menja ništa. Posle potvrde životinja nestaje iz liste i brojevi na čipovima se smanjuju.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-ORG-014 — Admin poziva člana tima
**Zahtevi:** FR-43, EP-56, Design §9.1 `team_invitation` (ekran S20) · **Prioritet:** P1 (kritično) · **Nalog:** milica.stojanovic@mojljubimac.test
**Preduslovi:** Azil je odobren.
**Koraci:**
1. Otvori karticu „Tim" i klikni „Pozovi člana".
2. Klikni „Pošalji poziv" bez mejla, pa upiši `jelena@`.
3. Upiši `jelena.nikolic@mojljubimac.test`, izaberi ulogu „Volonter" i pošalji.
4. Otvori Mailpit.
**Očekivani rezultat:** Dijalog „Pozovi člana tima" kaže „Poslaćemo poziv na mejl. Tim može imati najviše 20 članova." i opisuje uloge: „Admin — Sve, uključujući odluke o zahtevima i tim." i „Volonter — Upisuje zdravlje i negu; ne briše životinje i ne odlučuje.". Za neispravan mejl se prikazuje greška ispod polja. Posle slanja se u timu vidi red „jelena.nikolic@mojljubimac.test · Čeka odgovor · važi do {datum za 7 dana}". Mejl ima naslov „Poziv u tim: {naziv organizacije}" i dugme „Pogledaj poziv".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-ORG-015 — Prihvatanje poziva u tim; nalog ostaje vlasnički
**Zahtevi:** FR-43, BR-53, EP-39, EP-40 (ekran S14) · **Prioritet:** P1 (kritično) · **Nalog:** jelena.nikolic@mojljubimac.test
**Preduslovi:** Jelena ima poziv iz TS-ORG-014 i svog ljubimca.
**Koraci:**
1. Otvori link iz mejla i prijavi se kao Jelena.
2. Pročitaj šta uloga može i ne može, pa klikni „Pridruži se timu".
3. Klikni „Idi u organizaciju".
4. Otvori `/ljubimci`.
**Očekivani rezultat:** Naslov je „Poziv u tim: {organizacija}", sa gradom, imenom osobe koja poziva, ulogom „Volonter" i brojačem tima (npr. „2 / 20 članova"). Piše i „Tvoj nalog ostaje kakav je — i dalje vodiš i svoje ljubimce.". Posle prihvatanja Jelena ulazi u organizaciju, a u njenom meniju postoji stavka „Organizacija". Na `/ljubimci` i dalje vidi svog ljubimca.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-ORG-016 — Prava volontera
**Zahtevi:** FR-43, FR-60, BR-34, EP-57, EP-72 (ekrani S20, S21, S29) · **Prioritet:** P1 (kritično) · **Nalog:** jelena.nikolic@mojljubimac.test (volonter)
**Preduslovi:** Jelena je volonter u Miličinom azilu. Postoji bar jedan zahtev za udomljavanje.
**Koraci:**
1. Na `/organizacija` dodaj novi prijem i promeni status jedne životinje.
2. U meniju reda potraži „Obriši životinju".
3. Otvori karticu „Tim".
4. Otvori `/organizacija/zahtevi`.
5. Otvori `/organizacija/profil`.
**Očekivani rezultat:** Prijem i status volonter može da menja. „Obriši životinju" ne postoji. U timu nema „Pozovi člana", „Postavi za admina", „Ukloni iz tima" ni poslatih poziva. Na S21 zahtevi se vide samo za čitanje, bez „Prihvati" i „Odbij". Na S29 stoji traka koja se završava sa „…menjaju samo admini — javi im se ako nešto treba ispraviti.", a polja su samo za čitanje.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-ORG-017 — Opoziv poziva u tim
**Zahtevi:** FR-43, EP-56 (ekrani S20, S14) · **Prioritet:** P2 (važno) · **Nalog:** milica.stojanovic@mojljubimac.test
**Preduslovi:** Postoji poslat poziv (npr. na `qa.tim01@mojljubimac.test`) koji niko nije prihvatio.
**Koraci:**
1. U meniju reda poziva izaberi „Opozovi poziv".
2. Otvori link tog poziva iz Mailpit-a.
**Očekivani rezultat:** Red nestaje iz tima. Link prikazuje istekao poziv sa tekstom „Link više ne važi. Zamoli pošiljaoca da ti pošalje novi poziv.".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-ORG-018 — Tim ima najviše 20 članova (računaju se i poslati pozivi)
**Zahtevi:** FR-43, BR-34, EP-56 `team_full` (ekran S20) · **Prioritet:** P2 (važno) · **Nalog:** milica.stojanovic@mojljubimac.test
**Preduslovi:** Tim ima N članova. Pripremi 20 − N izmišljenih mejl adresa (`qa.tim01@…`, `qa.tim02@…`); nalozi za njih ne moraju da postoje.
**Koraci:**
1. Šalji pozive dok zbir članova i poslatih poziva ne dostigne 20.
2. Pošalji još jedan poziv.
3. Opozovi jedan poziv i pokušaj ponovo.
**Očekivani rezultat:** Na 20 sledeći poziv se ne šalje i u dijalogu se prikazuje poruka da je tim popunjen. Posle opoziva novi poziv prolazi.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-ORG-019 — Postavi za admina i ukloni iz tima
**Zahtevi:** FR-43, EP-56 (ekran S20) · **Prioritet:** P2 (važno) · **Nalog:** milica.stojanovic@mojljubimac.test + jelena.nikolic@mojljubimac.test
**Preduslovi:** Jelena je volonter.
**Koraci:**
1. Kao Milica kod Jelene izaberi „Postavi za admina".
2. Kao Jelena osveži `/organizacija` i proveri da li vidi „Pozovi člana" i „Prihvati" na S21.
3. Kao Milica vrati Jelenu u volontera (ako meni to nudi), pa izaberi „Ukloni iz tima".
4. Kao Jelena osveži `/organizacija`.
**Očekivani rezultat:** Posle koraka 1 Jelena ima oznaku „Admin" i prava admina. Posle uklanjanja Jelena više nema pristup organizaciji (nema stavke „Organizacija" i `/organizacija` je ne pušta), a njeni ranije uneti podaci ostaju u kartonima životinja.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-ORG-020 — Poslednji admin ne može da ostane bez admina
**Zahtevi:** BR-34, BR-46, EP-56 `last_admin` (ekran S20) · **Prioritet:** P2 (važno) · **Nalog:** milica.stojanovic@mojljubimac.test
**Preduslovi:** Milica je jedini admin.
**Koraci:**
1. Pokušaj da sebi promeniš ulogu u „Volonter".
2. Pokušaj da sebe ukloniš iz tima.
**Očekivani rezultat:** Obe akcije su odbijene, a kod Miličinog reda se prikazuje greška da organizacija mora da ima bar jednog admina. Uloga se ne menja.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-ORG-021 — Admin menja javni profil
**Zahtevi:** FR-60, EP-72 (ekrani S29, S23) · **Prioritet:** P1 (kritično) · **Nalog:** milica.stojanovic@mojljubimac.test
**Preduslovi:** Azil je odobren.
**Koraci:**
1. Otvori `/organizacija/profil`.
2. Promeni opis, telefon (`021 400 500`), mejl i sajt (`https://drugasansa.rs`) i klikni „Sačuvaj profil".
3. Klikni „Pogledaj javnu stranicu".
4. Promeni opis, pa klikni „Poništi izmene".
**Očekivani rezultat:** Stranica „Javni profil" kaže „Ovo vide posetioci na javnoj stranici i uz svaku životinju.". Posle čuvanja se javlja „Sačuvano. Javna stranica prikazuje izmene za najviše 5 minuta.". Na javnoj stranici se vide novi podaci (najkasnije posle 5 minuta). „Poništi izmene" vraća poslednje sačuvane vrednosti.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-ORG-022 — Validacija javnog profila
**Zahtevi:** FR-60, EP-72 (ekran S29) · **Prioritet:** P2 (važno) · **Nalog:** milica.stojanovic@mojljubimac.test
**Preduslovi:** —
**Koraci:**
1. U „Sajt" upiši `drugasansa.rs` i sačuvaj.
2. U „Mejl" upiši `azil@` i sačuvaj.
3. U „Telefon" upiši `abc` i sačuvaj.
4. U „Opis" nalepi tekst duži od 1000 znakova.
5. Obriši sajt i sačuvaj.
**Očekivani rezultat:** Greške ispod polja su „Adresa sajta počinje sa https://", „Upiši ispravnu mejl adresu." i „Upiši ispravan broj telefona, npr. 021 123 456.". Opis ne prima više od 1000 znakova (ili se prikazuje greška). Bez sajta se profil čuva, a na javnoj stranici nema dugmeta „Sajt".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-ORG-023 — Logo organizacije
**Zahtevi:** FR-60, EP-13 `organisation_logo` (ekrani S29, S23) · **Prioritet:** P2 (važno) · **Nalog:** milica.stojanovic@mojljubimac.test
**Preduslovi:** Pripremi kvadratnu PNG sliku (< 1 MB), PDF fajl i sliku veću od 10 MB.
**Koraci:**
1. Pročitaj uputstvo kod „Logo".
2. Pokušaj da dodaš PDF, pa veliku sliku.
3. Dodaj ispravnu PNG sliku i sačuvaj profil.
4. Otvori javnu stranicu.
**Očekivani rezultat:** Uputstvo glasi „PNG ili JPG, najviše 10 MB. Najbolje kvadratna slika.". PDF i slika veća od 10 MB su odbijeni sa porukom. Ispravan logo se prikazuje na S29 i u zaglavlju javne stranice.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-ORG-024 — Javna stranica azila za neprijavljenog posetioca
**Zahtevi:** FR-46, BR-37, EP-62 (ekran S23) · **Prioritet:** P1 (kritično) · **Nalog:** bez prijave
**Preduslovi:** Azil je odobren i ima bar 2 životinje u statusu „Za udomljavanje" i jednu „Na brizi".
**Koraci:**
1. U privatnom prozoru otvori `/o/{slug}`.
2. Pogledaj kartice životinja.
3. Klikni „Pošalji zahtev" na jednoj životinji.
**Očekivani rezultat:** Vidi se zaglavlje azila (naziv, grad, opis, kontakt) i sekcija „Traže dom" sa **samo** životinjama u statusu „Za udomljavanje". Na kartici su fotografija, ime, vrsta, pol, okvirna starost, opis i oznake o sterilizaciji i vakcinaciji (npr. „Nije sterilisana", „Nije vakcinisan"). Nema vakcina, pregleda, priloga ni težine. Klik na „Pošalji zahtev" traži prijavu i nudi „Prijavi se" i „Napravi nalog".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-ORG-025 — Slanje zahteva za udomljavanje
**Zahtevi:** FR-47, BR-36, EP-63 (ekran S23) · **Prioritet:** P1 (kritično) · **Nalog:** marko.jovanovic@mojljubimac.test
**Preduslovi:** Isto kao TS-ORG-024.
**Koraci:**
1. Prijavi se kao Marko i na javnoj stranici klikni „Pošalji zahtev".
2. Obriši ime, telefon i mejl i klikni „Pošalji".
3. Popuni ime, telefon `+381 63 765 4321`, mejl i poruku, i pošalji.
4. Kao Milica otvori Mailpit i `/organizacija/zahtevi`.
**Očekivani rezultat:** Dijalog „Zahtev za udomljavanje" ima polja „Ime i prezime *", „Telefon *", „Mejl *" (mejl je unapred popunjen) i „Poruka". Prazna polja daju greške „Upiši ime i prezime.", „Upiši broj telefona." i „Upiši ispravnu mejl adresu.". Posle slanja se prikazuje „Zahtev je poslat" sa dugmetom „U redu". Admini azila dobijaju mejl, a na S21 se pojavljuje zahtev sa statusom „Novi".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-ORG-026 — Ograničenje broja zahteva (5 na sat)
**Zahtevi:** EP-63 `rate_limited` (ekran S23) · **Prioritet:** P2 (važno) · **Nalog:** marko.jovanovic@mojljubimac.test
**Preduslovi:** Marko u poslednjih sat vremena nije slao zahteve. Azil ima dovoljno životinja „Za udomljavanje".
**Koraci:**
1. Pošalji 5 zahteva (mogu za različite životinje).
2. Pošalji šesti.
**Očekivani rezultat:** Šesti zahtev se ne šalje i prikazuje se „Previše zahteva za kratko vreme. Pokušaj ponovo za {n} min.".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-ORG-027 — Životinja više nije dostupna dok je dijalog otvoren
**Zahtevi:** EP-63 `not_found` (ekran S23) · **Prioritet:** P3 (sitno) · **Nalog:** marko.jovanovic@mojljubimac.test + milica.stojanovic@mojljubimac.test
**Preduslovi:** —
**Koraci:**
1. Kao Marko otvori dijalog zahteva za jednu životinju i popuni ga, ali ne šalji.
2. Kao Milica promeni status te životinje u „Na brizi".
3. Kao Marko pošalji zahtev.
**Očekivani rezultat:** Prikazuje se „Ova životinja više nije dostupna." i zahtev se ne pravi.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-ORG-028 — Lista zahteva i filteri
**Zahtevi:** FR-47, EP-57 (ekran S21) · **Prioritet:** P2 (važno) · **Nalog:** milica.stojanovic@mojljubimac.test
**Preduslovi:** Postoje zahtevi u statusima Novi, Prihvaćen i Odbijen.
**Koraci:**
1. Otvori `/organizacija/zahtevi`.
2. Prebacuj filtere „Novi", „Prihvaćeni", „Odbijeni" i „Svi".
**Očekivani rezultat:** Svaki zahtev pokazuje ime, telefon, mejl, poruku i životinju (npr. „Mačka · Ženka · oko 2 godine"), kao i oznaku statusa. Filteri prikazuju samo odgovarajuće stavke. Prazan filter pokazuje „Nema stavki u ovom filteru.". Organizacija bez ijednog zahteva vidi „Još nema zahteva" i „Kad neko zatraži udomljavanje sa tvoje javne stranice, zahtev stiže ovde.".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-ORG-029 — Prihvatanje zahteva
**Zahtevi:** FR-47, BR-36, EP-58, Design §9.1 `adoption_request_accepted` (ekrani S21, S23) · **Prioritet:** P1 (kritično) · **Nalog:** milica.stojanovic@mojljubimac.test
**Preduslovi:** Postoji novi zahtev od Marka (TS-ORG-025).
**Koraci:**
1. Klikni „Prihvati" na Markovom zahtevu.
2. Otvori `/organizacija` i javnu stranicu azila.
3. Otvori Mailpit (Markov mejl).
**Očekivani rezultat:** Prikazuje se obaveštenje „{ljubimac} — status: Rezervisan. Poslali smo mejl: Marko Jovanović." Zahtev dobija oznaku „Prihvaćen" i dugme „Pošalji karton". Životinja je „Rezervisan" i nestaje sa javne stranice. Marko dobija mejl „Zahtev prihvaćen: {ljubimac}" sa telefonom i mejlom azila.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-ORG-030 — Odbijanje zahteva
**Zahtevi:** FR-47, E-18, EP-58, Design §9.1 `adoption_request_rejected` (ekran S21) · **Prioritet:** P1 (kritično) · **Nalog:** milica.stojanovic@mojljubimac.test
**Preduslovi:** Postoji novi zahtev.
**Koraci:**
1. Klikni „Odbij", pročitaj dijalog i klikni „Otkaži".
2. Ponovo klikni „Odbij" i potvrdi sa „Da, odbij".
3. Otvori Mailpit za podnosioca.
**Očekivani rezultat:** Dijalog objašnjava da će podnosilac dobiti mejl „…da zahtev nije prihvaćen (ljubimac: {ljubimac}).". „Otkaži" ne menja ništa. Posle potvrde zahtev je „Odbijen", a status životinje se ne menja. Mejl ima naslov „Odgovor na zahtev: {ljubimac}" i dugme „Pogledaj životinje".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-ORG-031 — Slanje kartona novom vlasniku
**Zahtevi:** FR-50, BR-38, EP-59, Design §9.1 `record_transfer` (ekran S21) · **Prioritet:** P1 (kritično) · **Nalog:** milica.stojanovic@mojljubimac.test
**Preduslovi:** Postoji prihvaćen zahtev. Životinja ima vakcinu, pregled sa prilogom i fotografiju.
**Koraci:**
1. Klikni „Pošalji karton".
2. Obriši mejl i upiši `ivana@`, pa klikni „Pošalji poziv".
3. Upiši `ivana.petrovic@mojljubimac.test` i pošalji.
4. Otvori Mailpit i `/organizacija`.
**Očekivani rezultat:** Dijalog „Pošalji karton — {ljubimac}" ima napomenu da se životinja označava kao udomljena, polje „Mejl novog vlasnika *" (unapred popunjeno mejlom iz zahteva) i tekst „Poziv važi 30 dana (do {datum}). Ako ga ne prihvati, možeš da ga pošalješ ponovo.". Neispravan mejl daje „Upiši ispravnu mejl adresu.". Posle slanja red pokazuje „Karton poslat {datum} na ivana.petrovic@mojljubimac.test · važi do {datum}.", a životinja ima status „Udomljen". Mejl ima naslov „Stiže ti karton: {ljubimac}" i dugme „Prihvati karton".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-ORG-032 — Prihvatanje kartona (Premium primalac)
**Zahtevi:** FR-50, UC-08, EP-60 (ekrani S14, S03, S21) · **Prioritet:** P1 (kritično) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Karton je poslat Ivani (TS-ORG-031).
**Koraci:**
1. Iz mejla otvori link (prijavi se kao Ivana).
2. Pročitaj ekran i klikni „Prihvati karton".
3. Otvori novog ljubimca u `/ljubimci` i pogledaj vakcine, preglede i priloge.
4. Kao Milica otvori `/organizacija/zahtevi`.
**Očekivani rezultat:** Ekran „Prenos kartona" prikazuje karticu životinje, naziv organizacije i rečenicu „{organizacija} zadržava kopiju kartona samo za čitanje.". Posle prihvatanja piše „Ceo karton je prebačen. Podesi podsetnike za sledeću vakcinu.". Ljubimac je u Ivaninoj listi sa svim vakcinama, pregledima, prilozima (mogu da se otvore) i fotografijom, a za sledeću vakcinu postoji podsetnik. Kod Milice piše „Karton je prihvaćen {datum}.".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-ORG-033 — Organizaciji ostaje kopija samo za čitanje
**Zahtevi:** FR-50, BR-38, EP-60 (ekrani S20, S03) · **Prioritet:** P1 (kritično) · **Nalog:** milica.stojanovic@mojljubimac.test
**Preduslovi:** Karton je prihvaćen (TS-ORG-032).
**Koraci:**
1. Na `/organizacija` otvori karton predate životinje.
2. Pokušaj da dodaš vakcinu ili izmeniš podatke.
3. Kao Ivana dodaj novo merenje svom novom ljubimcu, pa kao Milica osveži karton.
**Očekivani rezultat:** Na vrhu stoji traka „Karton je predat novom vlasniku. Ovo je kopija samo za čitanje.". Sva dugmad za dodavanje, izmenu i brisanje su skrivena. Ivanino novo merenje se **ne** pojavljuje u kopiji organizacije.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-ORG-034 — Free primalac sa zauzetim mestom
**Zahtevi:** FR-51, BR-39, E-20, EP-60 `premium_required` (ekran S14) · **Prioritet:** P1 (kritično) · **Nalog:** marko.jovanovic@mojljubimac.test
**Preduslovi:** Marko (Free) već ima 1 aktivnog ljubimca. Organizacija mu je poslala karton.
**Koraci:**
1. Otvori link kartona kao Marko i klikni „Prihvati karton".
2. Proveri `/ljubimci`.
**Očekivani rezultat:** Prikazuje se „Na Free planu imaš jednog aktivnog ljubimca, a to mesto već zauzima {ime Markovog ljubimca}." sa karticom „Dostupno u Premiumu" i tekstom „Uz Premium prihvataš ovaj karton i dodaješ ljubimaca koliko želiš. Prvih 7 dana je besplatno.". Karton nije prihvaćen i Marko i dalje ima jednog ljubimca. Link ostaje važeći.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-ORG-035 — Odbijanje kartona i ponovno slanje
**Zahtevi:** FR-50, EP-60, EP-59 (ekrani S14, S21) · **Prioritet:** P2 (važno) · **Nalog:** marko.jovanovic@mojljubimac.test + milica.stojanovic@mojljubimac.test
**Preduslovi:** Isto kao TS-ORG-034.
**Koraci:**
1. Kao Marko na ekranu kartona klikni „Odbij".
2. Kao Milica osveži `/organizacija/zahtevi`.
3. Klikni „Pošalji ponovo" i pošalji na drugi mejl.
**Očekivani rezultat:** Marko vidi „Prenos kartona je odbijen". Kod Milice piše „Karton je odbijen — možeš da ga pošalješ ponovo.". Ponovno slanje pravi novi poziv sa novim rokom od 30 dana.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-ORG-036 — Iskorišćen link kartona i pogrešna vrsta naloga
**Zahtevi:** BR-33, EP-60 `invitation_used`, `forbidden_role` (ekran S14) · **Prioritet:** P2 (važno) · **Nalog:** ivana.petrovic@mojljubimac.test, nikola.djordjevic@mojljubimac.test
**Preduslovi:** Postoji već prihvaćen link (TS-ORG-032) i jedan nov, neprihvaćen link kartona.
**Koraci:**
1. Kao Ivana ponovo otvori već prihvaćen link.
2. Kao Nikola (odgajivačnica) otvori nov link i klikni „Prihvati karton".
**Očekivani rezultat:** Prvi slučaj prikazuje „Ovaj link je već iskorišćen". U drugom slučaju piše „Karton može da primi samo nalog vlasnika ljubimca." i ništa se ne prenosi.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-ORG-037 — Istekao poziv za karton
**Zahtevi:** FR-50, BR-38, E-19 (ekrani S21, S14) · **Prioritet:** P2 (važno) · **Nalog:** milica.stojanovic@mojljubimac.test
**Preduslovi:** Programer je u bazi pomerio rok jednog poziva za karton u prošlost (noćni posao koji to radi stiže sa Step 30).
**Koraci:**
1. Otvori `/organizacija/zahtevi`.
2. Otvori link tog kartona.
3. Klikni „Pošalji ponovo".
**Očekivani rezultat:** Red pokazuje „Poziv za karton je istekao {datum} — nije prihvaćen." (crvenim tekstom) i dugme „Pošalji ponovo". Link prikazuje istekao poziv („Link više ne važi. Zamoli pošiljaoca da ti pošalje novi poziv."). Ponovno slanje pravi novi poziv koji važi 30 dana.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-ORG-038 — Novo leglo
**Zahtevi:** FR-48, EP-61 (ekran S22) · **Prioritet:** P1 (kritično) · **Nalog:** nikola.djordjevic@mojljubimac.test
**Preduslovi:** Odgajivački plan je aktivan. Odgajivačnica ima bar jednu ženku (aktivna za uzgoj).
**Koraci:**
1. Otvori `/organizacija/legla` i klikni „Novo leglo".
2. Klikni „Sačuvaj leglo" bez podataka.
3. Upiši broj mladunaca 0, pa 21.
4. Izaberi majku, za oca upiši ime „Rex (spoljni pastuv)", datum okota pre 2 nedelje i broj 4, i sačuvaj.
**Očekivani rezultat:** Dijalog kaže „Napravićemo karton za svako mladunče, povezan sa leglom.". Greške su „Izaberi majku.", „Izaberi datum okota." i „Upiši broj od 1 do 20.". Datum okota u budućnosti ne može da se izabere. Posle čuvanja se pojavljuje kartica legla (majka, otac, datum okota, „4 mladunčeta"), a u njoj 4 mladunčeta („Mladunče 1" … „Mladunče 4") sa statusom „Dostupno".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-ORG-039 — Cene i statusi mladunaca
**Zahtevi:** FR-49, EP-61 (ekrani S22, S23) · **Prioritet:** P1 (kritično) · **Nalog:** nikola.djordjevic@mojljubimac.test
**Preduslovi:** Postoji leglo iz TS-ORG-038.
**Koraci:**
1. Za mladunče 1 upiši „Cena (RSD)" 120000 i sačuvaj.
2. Mladunčetu 2 ostavi praznu cenu.
3. Mladunčetu 3 postavi status „Rezervisano", a mladunčetu 4 „Prodato".
4. U privatnom prozoru otvori javnu stranicu `/o/{slug}`.
**Očekivani rezultat:** Mladunče bez cene pokazuje „Cena nije upisana". Na javnoj stranici, u sekciji „Dostupni štenci", vide se samo mladunci 1 i 2: kod prvog cena „120.000 RSD", kod drugog nema cene. Rezervisano i prodato mladunče se ne prikazuju. Negativna cena ne može da se sačuva.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-ORG-040 — Upit odgajivačnici i odluka
**Zahtevi:** FR-49, BR-36, EP-63, EP-58, Design §9.1 `breeder_inquiry_*` (ekrani S23, S21) · **Prioritet:** P1 (kritično) · **Nalog:** marko.jovanovic@mojljubimac.test + nikola.djordjevic@mojljubimac.test
**Preduslovi:** Postoje 2 dostupna mladunčeta.
**Koraci:**
1. Kao Marko na javnoj stranici klikni „Pošalji upit" i pošalji upit za mladunče 1.
2. Kao Marko pošalji upit i za mladunče 2.
3. Kao Nikola na `/organizacija/zahtevi` prihvati prvi upit, a drugi odbij.
4. Proveri Markov mejl u Mailpit-u i javnu stranicu.
**Očekivani rezultat:** Posle slanja piše „Upit je poslat". Na S21 (naslov „Upiti kupaca") Nikola vidi oba upita. Prihvaćeno mladunče postaje „Rezervisano" i nestaje sa javne stranice. Marko dobija „Upit prihvaćen: {ljubimac}" sa kontaktom odgajivačnice i „Odgovor na upit: {ljubimac}" sa dugmetom „Pogledaj stranicu".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-ORG-041 — Prazna javna stranica i nepostojeća adresa
**Zahtevi:** FR-46, FR-49, EP-62 (ekran S23) · **Prioritet:** P3 (sitno) · **Nalog:** bez prijave
**Preduslovi:** Odobren azil nema nijednu životinju „Za udomljavanje".
**Koraci:**
1. Otvori `/o/{slug}` tog azila.
2. Otvori `/o/ne-postoji-xyz`.
**Očekivani rezultat:** Za azil se prikazuje „Trenutno nema životinja za udomljavanje" i „Svi naši štićenici su našli dom ili su još na oporavku. Svrati ponovo uskoro." (za odgajivačnicu „Trenutno nema dostupnih štenaca"). Nepostojeća adresa prikazuje stanje „nije pronađeno", bez tehničke greške.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-ORG-042 — Organizacija ne vidi tuđe životinje
**Zahtevi:** FR-34, EP-53, EP-54 (ekrani S20, S03) · **Prioritet:** P1 (kritično) · **Nalog:** nikola.djordjevic@mojljubimac.test
**Preduslovi:** Zapiši adresu kartona jedne Miličine životinje (`/ljubimci/{id}`) i jednog Ivaninog ljubimca.
**Koraci:**
1. Kao Nikola otvori obe adrese.
2. Na `/organizacija` pretraži ime Miličine životinje.
**Očekivani rezultat:** Ni jedan karton se ne otvara (prikazuje se „nije pronađeno"). Pretraga ne nalazi Miličinu životinju.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-ORG-043 — Organizacija na engleskom
**Zahtevi:** FR-35, NFR-05 (ekrani S20, S21, S23, S14) · **Prioritet:** P2 (važno) · **Nalog:** milica.stojanovic@mojljubimac.test
**Preduslovi:** —
**Koraci:**
1. Prebaci jezik na English.
2. Otvori `/organizacija` (oba taba), `/organizacija/zahtevi`, `/organizacija/profil`, javnu stranicu i link poziva u tim.
**Očekivani rezultat:** Svi tekstovi su na engleskom, uključujući statuse životinja (npr. „Deceased", „Returned to owner"), red poziva („{email} · Pending · valid until {datum}") i poziv u tim („Team invitation: {organizacija}"). Nazivi organizacija i životinja ostaju kako su upisani. Cene i datumi su u engleskom formatu.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-ORG-044 — Prikaz na telefonu (375 px)
**Zahtevi:** NFR-03 (ekrani S20, S21, S22, S23) · **Prioritet:** P2 (važno) · **Nalog:** milica.stojanovic@mojljubimac.test, nikola.djordjevic@mojljubimac.test, bez prijave
**Preduslovi:** Prikaz za telefon, širina 375 px.
**Koraci:**
1. Otvori listu životinja, dijalog „Novi prijem", listu zahteva, legla i javnu stranicu.
**Očekivani rezultat:** Na telefonu se životinje prikazuju kao kartice, ne kao tabela. Čipovi filtera mogu da se skroluju ili prelamaju, a dijalozi staju na ekran. Nema vodoravnog skrolovanja cele stranice i dugmad su dovoljno velika za prst.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-ORG-045 — Novi prijem i zahtev samo tastaturom
**Zahtevi:** NFR-04, Design §10 (ekrani S20, S23) · **Prioritet:** P3 (sitno) · **Nalog:** milica.stojanovic@mojljubimac.test, marko.jovanovic@mojljubimac.test
**Preduslovi:** —
**Koraci:**
1. Bez miša otvori „Novi prijem", popuni i sačuvaj.
2. Na javnoj stranici bez miša otvori „Pošalji zahtev", popuni i pošalji.
**Očekivani rezultat:** Fokus se jasno vidi. Svi izbori (vrsta, pol, način dolaska) mogu da se promene strelicama ili tasterom razmak. Fokus ostaje u dijalogu, a greške se čitaju uz polje. Oba formulara mogu da se pošalju bez miša.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____
