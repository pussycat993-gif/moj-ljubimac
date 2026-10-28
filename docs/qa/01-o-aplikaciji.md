# O aplikaciji — Moj Ljubimac

> Opis proizvoda za testera. Izvori: Product Brief v1.7 (§2–§9), PRD v1.7 (§6, §8, §10), Design System v1.6 (§5, §9, §11, §12). Stanje izgradnje: 26. 10. 2026.

## 1. Problem i rešenje

**Problem.** Vlasnici ljubimaca u Srbiji nemaju jedno pouzdano mesto za zdravstvenu istoriju ljubimca i redovno propuštaju vremenski osetljivu negu:

- papirna veterinarska knjižica se gubi, oštećuje ili ostane kod kuće kad zatreba (kod novog veterinara, groomera, na granici);
- podsetnici zavise od tuđeg pamćenja (poziv iz ambulante, kalendar u telefonu, „zapamtićemo"), pa se revakcinacije i doze lekova zaboravljaju;
- više ukućana brine o ljubimcu, ali svako zna samo deo;
- azili i odgajivači imaju isti problem sa desetinama životinja (papir, tabele);
- lokalni veterinari i pet shopovi nemaju direktan kanal do vlasnika u trenutku potrebe.

**Rešenje.** Moj Ljubimac je veb aplikacija (bez instalacije iz prodavnice aplikacija) koja:

- čuva kompletan karton ljubimca na jednom mestu i izvozi ga kao PDF za veterinara;
- sama pravi podsetnike iz unetih podataka i šalje ih tamo gde korisnik gleda — mejl, push, WhatsApp (Viber je napravljen, ali isključen dok ga operater ne uključi — BR-14b);
- deli karton sa domaćinstvom;
- daje azilima i odgajivačima alat za mnogo životinja, udomljavanja, legla i predaju kartona;
- povezuje vlasnike sa lokalnim partnerima i, kroz „Šapu pomoći", sa zajednicom.

Aplikacija **ne daje medicinske savete** i **nije softver za veterinarske ambulante** — ona beleži i podseća.

Glavna metrika uspeha: **aktivno podsećani ljubimci** — ljubimci kojima je u poslednjih 30 dana uspešno isporučen bar jedan podsetnik.

## 2. Korisnici (persone)

| ID | Persona | Opis | Šta želi |
|---|---|---|---|
| P1 | **Vlasnik ljubimca** (glavni korisnik) | Živi u Srbiji, ima psa i/ili mačku, ima svog veterinara, svakodnevno koristi Viber/WhatsApp | Karton uvek pri ruci, podsetnici na vreme, deljenje nege sa ukućanima |
| P2 | **Član domaćinstva** | Partner, roditelj, dete, cimer | Vidi isti karton, beleži šta je uradio, dobija podsetnike |
| P3 | **Azil** (besplatno) | Organizacija sa mnogo životinja i volonterima | Zdravlje svake životinje, proces od prijema do udomljavanja |
| P4 | **Odgajivač** (plaćeni plan) | Profesionalni ili hobi odgajivač pasa/mačaka | Legla, zdravlje mladunaca, predaja kartona kupcu |
| P5 | **Partner** | Veterinarska ambulanta, pet shop, grooming salon, pet hotel | Vidljivost kod vlasnika u blizini; pozivi, poruke, posete sajtu. Partner **nema nalog** — unosi ga operater |
| P6 | **Član zajednice** (Šapa pomoći) | Bilo koji prijavljen korisnik | Pokloni, prodaj, traži stvari za ljubimce, pomozi azilu, dogovori se bez deljenja broja telefona |
| — | **Posetilac** | Neko ko nije prijavljen | Javni trenutak, javna stranica azila/odgajivačnice, pregled oglasa |
| — | **Operater** | Osoba koja vodi proizvod | Odobrava azile, unosi partnere, moderiše Šapu pomoći |

Aplikacija **nije** za: ambulante koje traže softver za pacijente/termine/fakture, ljude koji traže dijagnozu ili savet o lečenju, prodavnice koje traže kasu ili internet prodaju.

## 3. Osam sposobnosti (CAP-01 … CAP-08)

| CAP | Naziv | Ukratko | Zahtevi | Status |
|---|---|---|---|---|
| CAP-01 | **Zdravstveni karton** | Profil ljubimca, težina (kg ili g), vakcine, terapije i doze, pregledi sa prilozima (slike/PDF ≤ 10 MB), rođendan, uspomene i vraćanje, trajno brisanje, pretraga, PDF izvoz (Premium) | FR-01 … FR-13, FR-59 | ✅ Spremno |
| CAP-02 | **Dnevnik nege i trenuci** | Obroci i stolica (neograničeno), podsetnici za obroke, trenuci sa do 5 fotografija i tekstom do 280 znakova, deljenje kao slika (sa logom) ili javni link | FR-14 … FR-19 | ✅ Spremno |
| CAP-03 | **Podsetnici i kanali** | Automatski i ručni podsetnici, vreme unapred i vreme slanja po tipu, kanali po tipu, „Urađeno" iz poruke ili aplikacije, ponovno slanje posle 30 min, obaveštenja o isteku Premium-a | FR-20 … FR-25 | ✅ Mejl i push · ⏳ WhatsApp (Step 29) · ⏳ obaveštenja o isteku (Step 30) |
| CAP-04 | **Domaćinstvo** | Premium vlasnik poziva do 6 članova (uključujući sebe), bira koje ljubimce deli; članovi beleže svakodnevnu negu | FR-26 … FR-32 | ✅ Spremno · ⏳ nasleđivanje posle brisanja naloga (Step 30) |
| CAP-05 | **Nalozi, pretplata i podaci** | Registracija (mejl+lozinka ili Google) i izbor tipa naloga, prijava, jezik, Free limiti, Premium sa 7 dana probe, otkazivanje, preuzimanje svih podataka, brisanje naloga uz 30 dana za predomišljanje | FR-33 … FR-41 | ✅ Bez plaćanja · ⏳ plaćanje (Step 31) · ⏳ arhiva i trajno brisanje (Step 30, 30a) |
| CAP-06 | **Organizacije** | Azili (besplatno, uz odobrenje operatera) i odgajivačnice (plaćeni plan): neograničen broj životinja, tim do 20 ljudi, prijem i statusi, javna stranica, zahtevi i upiti, legla, predaja kartona | FR-42 … FR-51, FR-60 | ✅ Spremno · ⏳ odobrenje azila iz admina (Step 28) |
| CAP-07 | **Lokalni partneri** | Veterinari, pet shopovi, grooming saloni, pet hoteli u blizini; istaknuti prvi; brze akcije Pozovi / Poruka / Mejl / Sajt; predlog veterinara kad ljubimac nema svog; admin deo za operatera | FR-52 … FR-58 | ✅ Imenik i predlog · ⏳ admin i statistika (Step 28) |
| CAP-08 | **Šapa pomoći** | Oglasi (Potreba azila, Poklanjam, Prodajem, Tražim), 30 dana trajanja, poruke 1:1, „Doniraj" (prikaz podataka za donaciju, bez novca kroz aplikaciju), prijava i blokiranje, moderacija | FR-61 … FR-72 | ⏳ Čeka Step 28a–28c |

## 4. Free, Premium i organizacije

| Stavka | Vlasnik — Free | Vlasnik — Premium | Azil | Odgajivačnica | Izvor |
|---|---|---|---|---|---|
| Cena | Besplatno | Mesečno ili godišnje, 7 dana besplatne probe jednom po korisniku (cene još nisu određene — OQ-03) | Besplatno, uz odobrenje operatera | Poseban plaćeni odgajivački plan, bez probnog perioda | BR-07, BR-11, BR-32, BR-51 |
| Aktivni ljubimci / životinje | **1** | Neograničeno | Neograničeno (nema ličnih ljubimaca) | Neograničeno (nema ličnih ljubimaca) | BR-01, BR-02, BR-33 |
| Uspomene | **2** | Neograničeno | — | — | BR-01 |
| Prilozi po ljubimcu | **10** (slika ili PDF, ≤ 10 MB) | Neograničeno (≤ 10 MB po fajlu) | Pun karton | Pun karton | BR-01, BR-05 |
| Trenuci po ljubimcu | **5** (≤ 5 fotografija po trenutku) | Neograničeno (≤ 5 fotografija) | — | — | BR-01, BR-06 |
| Dnevnik obroka i stolice | Neograničeno | Neograničeno | — | — | BR-04 |
| PDF izvoz kartona | ✗ (Premium ponuda) | ✓ | — | — | FR-10 |
| Logo na podeljenoj slici | Uvek uključen | Može da se isključi | — | — | FR-18 |
| Domaćinstvo | ✗ (Premium ponuda) | ✓, najviše 6 članova uključujući vlasnika | — | — | BR-19, BR-20, BR-51 |
| Kanali podsetnika | Mejl, push | Mejl, push, WhatsApp (Viber kad ga operater uključi); najviše 30 WhatsApp/Viber poruka mesečno, posle toga mejl i push | — (organizacijske životinje nemaju automatske podsetnike u v1) | — | BR-14, BR-14a, BR-14b, BR-51 |
| Tim | — | — | Do 20 ljudi, Admin ili Volonter | Do 20 ljudi, Admin ili Volonter (funkcije samo uz aktivan plan) | BR-34, E-21 |
| Javna stranica `/o/…` | — | — | ✓ životinje „Za udomljavanje" | ✓ dostupni mladunci + cena | BR-37 |
| Aktivni oglasi Šape pomoći ⏳ | **3** | Neograničeno | Neograničeno; samo azil sme da objavi „Potreba" | 3 (dok se ne odluči OQ-16) | BR-54, BR-55 |

**Kad Premium istekne** (FR-39, BR-10): ništa se ne briše, sve postojeće ostaje vidljivo, ali dodavanje preko Free limita je blokirano uz Premium ponudu; članovi domaćinstva zadržavaju samo pregled (BR-28); WhatsApp podsetnici prelaze na mejl i push (BR-16).

**Član domaćinstva** koristi Free pravila — vlasnikov Premium se ne prenosi na njega (BR-24).

**Premium ponuda (PremiumLock):** isti obrazac za svaki Free limit — zamućen sadržaj, ikonica katanca, tekst „Dostupno u Premiumu", jedna rečenica šta se otključava i dugme „Probaj 7 dana besplatno". Dok plaćanje nije uključeno (Step 31), stranica Premium (S17) prikazuje stanje „Plaćanje uskoro dostupno".

## 5. Kanali obaveštenja

| Kanal | Ko ga dobija | Šta se šalje | Napomene | Status |
|---|---|---|---|---|
| **Mejl** | Svi | Podsetnici (sa dugmetom „Urađeno" koje važi 24 sata i jednom), pozivi u domaćinstvo i tim, predaja kartona, odgovori na zahteve/upite, odobrenje azila, izvoz podataka, zakazano brisanje naloga, istek Premium-a, nove poruke i oglasi (Šapa pomoći) | Lokalno: mejlovi za potvrdu naloga i reset lozinke vide se u Mailpit-u | ✅ |
| **Push** (veb obaveštenje u pregledaču) | Svi koji ga uključe u S12 | Podsetnici (akcija „Urađeno"), nove poruke | Na iPhone-u radi samo kad se sajt doda na početni ekran; lokalno se ne šalje (samo log) | ✅ |
| **WhatsApp** | Samo Premium, uz povezan i potvrđen broj | Podsetnici i potvrdni kod | Najviše 30 poruka mesečno; posle toga mejl i push. Dok Step 29 nije gotov, Premium korisnik vidi „Uskoro dostupno" | ⏳ Step 29 |
| **Viber** | Samo Premium | Podsetnici | Napravljen, ali sakriven dok ga operater ne uključi (BR-14b) — ne treba da se vidi | — |

**Podrazumevana podešavanja (BR-48):** vakcine 7 dana pre i na dan u 09:00; kontrole 1 dan pre i na dan u 09:00; rođendani i ručni podsetnici na dan u 09:00; doze i obroci tačno u zadato vreme; kanali mejl + push. Svi datumi i vremena su po srpskom vremenu (Europe/Belgrade, NFR-02).

**Član domaćinstva** ne dobija podsetnike za deljene ljubimce dok ih sam ne uključi, i to samo mejlom i push-om (FR-29).

## 6. Jezici

- Interfejs postoji na **srpskom (latinica)** — podrazumevano — i **engleskom** (FR-35, NFR-05). Jezik se bira na registraciji (S15) i u profilu (S18).
- Pri promeni jezika **sav** tekst aplikacije mora biti na izabranom jeziku — nijedna reč ne sme ostati na drugom jeziku.
- Mejlovi stižu na jeziku primaoca (podešavanje iz profila).
- Ton je neformalan („ti"), kratak i topao. Imena ljubimaca se **nikad ne menjaju po padežima**: „Luna — vakcina ističe za 7 dana", a ne „Luni ističe vakcina".
- Formati: datum `19. 10. 2026.` (engleski: `19 Oct 2026`), vreme `08:00`, novac `2.990 RSD`, težina `4,2 kg` / `850 g`.

## 7. Ekrani S01–S37

Oznake okvira: **A** = aplikacija vlasnika · **O** = organizacija · **P** = javno (bez prijave) · **U** = prijava/registracija · **D** = admin.

| # | Ekran | Ruta | Okvir | Šta radi (jedna rečenica) | Status |
|---|---|---|---|---|---|
| S01 | Moji ljubimci | `/ljubimci` | A | Početna: pretraga ljubimaca, kartica „Danas" sa podsetnicima, kartice ljubimaca i dugme „Dodaj ljubimca" (na Free sa 1 aktivnim ljubimcem otvara Premium ponudu). | ✅ Spreman |
| S02 | Dodaj / izmeni ljubimca | `/ljubimci/novi` | A | Forma profila ljubimca (ime, vrsta, pol, datum rođenja, mikročip, pasoš, moj veterinar, jedinica težine…). | ✅ Spreman |
| S03 | Karton ljubimca | `/ljubimci/[id]` | A | Karton sa tabovima Pregled, Vakcine, Terapije, Pregledi, Težina, plus PDF izvoz, premeštanje u Uspomene, trajno brisanje i predlog veterinara kad nema svog. | ✅ Spreman |
| S04 | Nova vakcina | `/ljubimci/[id]/vakcine/nova` | A | Unos vakcine; datum sledeće doze pravi podsetnik. | ✅ Spreman |
| S05 | Novi pregled sa prilozima | `/ljubimci/[id]/pregledi/novi` | A | Unos pregleda kod veterinara sa prilozima (slike/PDF ≤ 10 MB, brojač na Free „7 / 10 priloga"). | ✅ Spreman |
| S06 | Uspomene | `/uspomene` | A | Ljubimci koji su uginuli, udomljeni ili izgubljeni, sa vraćanjem među aktivne i brojačem „2 / 2 uspomene" na Free. | ✅ Spreman |
| S07 | Dnevnik ishrane i stolice | `/ljubimci/[id]/dnevnik` | A | Tabovi Ishrana i Stolica sa brzim unosom i karticom „Podsetnici za obroke". | ✅ Spreman |
| S08 | Trenuci | `/ljubimci/[id]/trenuci` | A | Mreža trenutaka, novi trenutak, „Podeli kao sliku" i „Javni link" (brojač „3 / 5 trenutaka" na Free). | ✅ Spreman |
| S09 | Javni trenutak | `/t/[slug]` | P | Javna stranica jednog trenutka (fotografije, tekst, ime ljubimca) bez ikakvih zdravstvenih podataka. | ✅ Spreman |
| S10 | Podsetnici | `/podsetnici` | A | Tabovi Danas / Uskoro / Propušteno / Urađeno sa dugmetom „Urađeno" i „Novi podsetnik". | ✅ Spreman |
| S11 | Novi / izmeni podsetnik | `/podsetnici/novi` | A | Ručni podsetnik: naslov, za koga (ljubimac ili „Samo za mene"), datum i vreme, ponavljanje; izmena i brisanje. | ✅ Spreman |
| S12 | Podešavanja podsetnika | `/podesavanja/podsetnici` | A | Po tipu podsetnika: koliko unapred, vreme slanja, kanali; kartica „Kanali" (push, WhatsApp) i kartica „Poruke". | ✅ Spreman (mejl, push) · ⏳ WhatsApp — Step 29 · ⏳ kartica „Poruke" — Step 28c |
| S13 | Domaćinstvo | `/domacinstvo` | A | Članovi, poziv mejlom ili linkom, izbor deljenih ljubimaca, brojač „3 / 6 članova", uključivanje podsetnika za člana. | ✅ Spreman |
| S14 | Prihvati poziv / karton | `/poziv/[token]` | U | Prihvatanje poziva u domaćinstvo ili tim i prihvatanje predatog kartona (uz Premium ponudu ako je Free mesto zauzeto). | ✅ Spreman |
| S15 | Registracija | `/registracija` | U | Izbor tipa naloga (Vlasnik / Azil / Odgajivačnica), mejl i lozinka ili Google, jezik; posle slanja „Proveri mejl". | ✅ Spreman |
| S16 | Prijava | `/prijava` | U | Prijava mejlom i lozinkom ili Google-om i „Zaboravljena lozinka". | ✅ Spreman |
| S17 | Premium | `/premium` | A | Poređenje Free i Premium; dok plaćanje nije uključeno prikazuje „Plaćanje uskoro dostupno". | ✅ Spreman (bez plaćanja) · ⏳ kupovina — Step 31 |
| S18 | Profil i pretplata | `/profil` | A | Ime, grad, jezik, kartica pretplate (preostali dani, obnova, „Otkaži obnovu"). | ✅ Spreman |
| S19 | Moji podaci i brisanje naloga | `/profil/podaci` | A | „Preuzmi sve moje podatke" i „Obriši nalog" sa 30 dana za predomišljanje i „Otkaži brisanje". | ✅ Spreman · ⏳ arhiva za preuzimanje — Step 30a · ⏳ trajno brisanje — Step 30 |
| S20 | Životinje i tim organizacije | `/organizacija` | O | Tabovi Životinje (filter po statusu, prijem) i Tim (Admin/Volonter, „1 / 20"); baner kad azil čeka odobrenje. | ✅ Spreman |
| S21 | Zahtevi i upiti | `/organizacija/zahtevi` | O | Zahtevi za udomljavanje (azil) i upiti (odgajivačnica) sa Prihvati / Odbij i „Pošalji karton". | ✅ Spreman |
| S22 | Legla | `/organizacija/legla` | O | Legla odgajivačnice (majka, otac, datum, broj mladunaca) sa statusom i cenom svakog mladunčeta. | ✅ Spreman |
| S23 | Javna stranica azila / odgajivačnice | `/o/[slug]` | P | Javna stranica organizacije sa dostupnim životinjama i formom za zahtev/upit (traži prijavu). | ✅ Spreman |
| S24 | Partneri u blizini | `/partneri` | A | Filter po tipu, lokacija ili grad iz profila, istaknuti partneri prvi, brze akcije. | ✅ Spreman |
| S25 | Profil partnera | `/partneri/[id]` | A | Detalji partnera i četiri brze akcije kao velika dugmad. | ✅ Spreman |
| S26 | Admin | `/admin` | D | Operater: azili na čekanju, partneri, statistika klikova, kanal Viber, moderacija. | ⏳ Step 28 (Moderacija — Step 28c) |
| S27 | Nova terapija | `/ljubimci/[id]/terapije/nova` | A | Unos terapije (tip, naziv, doza, učestalost, početak, kraj) koja pravi podsetnike za svaku dozu. | ✅ Spreman |
| S28 | Nova lozinka | `/prijava/nova-lozinka` | U | Postavljanje nove lozinke iz mejla za reset (najmanje 8 znakova, link važi jednom). | ✅ Spreman |
| S29 | Javni profil organizacije | `/organizacija/profil` | O | Admin menja opis, telefon, mejl, sajt i logo; volonter samo gleda; kartica „Donacije" za azile. | ✅ Spreman · ⏳ kartica „Donacije" — Step 28b |
| S30 | Politika privatnosti | `/privatnost` | P | Javna stranica sa poglavljima; tekst je za sada privremen („Tekst dostavlja vlasnik (OQ-15)."). | ✅ Spreman (tekst čeka OQ-15) |
| S31 | Uslovi korišćenja | `/uslovi` | P | Javna stranica sa poglavljima i verzijom uslova; tekst je za sada privremen. | ✅ Spreman (tekst čeka OQ-15) |
| S32 | Šapa pomoći | `/sapa-pomoci` | A / P | Lista oglasa sa filterima (vrsta, kategorija, za koga, grad), najnoviji prvi, sa stranicama. | ⏳ Step 28b |
| S33 | Oglas | `/sapa-pomoci/[id]` | A / P | Detalji oglasa, „Pošalji poruku", „Doniraj" za potrebe azila, prijava i blokiranje. | ⏳ Step 28b / 28c |
| S34 | Novi / izmeni oglas | `/sapa-pomoci/nova`, `/sapa-pomoci/[id]/izmeni` | A / O | Forma oglasa: vrsta, naslov, opis, kategorija, za koga, grad, cena, do 5 fotografija. | ⏳ Step 28b |
| S35 | Moji oglasi | `/sapa-pomoci/moje` | A / O | Moji oglasi po tabovima Aktivni / Istekli / Rešeni, sa produžavanjem, rešavanjem i brisanjem. | ⏳ Step 28b |
| S36 | Poruke | `/poruke`, `/poruke/[id]` | A / O | Prijemno sanduče razgovora i razgovor 1:1 o oglasu, sa prijavom i blokiranjem. | ⏳ Step 28c |
| S37 | Profil korisnika | `/korisnik/[id]` | A / P | Javni profil autora oglasa (prikazno ime, grad, član od, aktivni oglasi) — bez mejla i telefona. | ⏳ Step 28b |

## 8. Opšta pravila prikaza koja važe svuda

- **Učitavanje:** sivi blokovi u obliku sadržaja (bez „vrtećih" indikatora, osim u pritisnutom dugmetu).
- **Prazno stanje:** ikonica, naslov, jedna rečenica i jedno dugme (npr. „Još nema vakcina" / „Dodaj prvu vakcinu i podsetićemo te na sledeću." / „Dodaj vakcinu").
- **Greška:** kartica „Nešto nije u redu. Pokušaj ponovo." sa dugmetom.
- **Samo za čitanje:** baner na vrhu i **sakrivene** (ne onemogućene) kontrole za izmenu.
- **Potvrde:** kratka poruka (toast) dole u sredini, oko 4 sekunde; brisanje uvek traži potvrdu „Da, obriši".
- **Greške u formi:** ispod polja, crvenim tekstom, pri napuštanju polja i pri slanju.
- **Telefon:** sve mora da radi od 360 px širine, bez horizontalnog skrolovanja; na telefonu je navigacija dole (Ljubimci, Podsetnici, Šapa, Partneri, Profil), na računaru levo.
- **Pristupačnost (WCAG 2.1 AA):** vidljiv fokus na svakom elementu, glavni tokovi rade samo tastaturom, svako polje ima naziv, dugmad samo sa ikonicom imaju opis, status nikad samo bojom, dodirne površine ≥ 44 px.
