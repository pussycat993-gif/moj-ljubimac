# 06 — Premium, pretplata i moji podaci (oblast PREM)

**Status:** ✅ spremno za test (Step 23 gotov). Plaćanje još ne postoji (Step 31 čeka izbor provajdera), pa stranica Premium namerno prikazuje „Plaćanje uskoro dostupno".
**Ekrani:** S17 Premium (`/premium`), S18 Profil i pretplata (`/profil`), S19 Moji podaci (`/profil/podaci`)
**Zahtevi:** FR-25, FR-36 … FR-41, BR-01, BR-02, BR-07 … BR-10, BR-31, E-15, E-16, UC-06, UC-07
**Okruženje:** lokalno http://localhost:3000 · Mailpit http://127.0.0.1:54324 · lozinka `MojLjubimac123!`

**Pre početka:**
- `ivana.petrovic@mojljubimac.test` ima aktivan mesečni Premium. `marko.jovanovic@mojljubimac.test` je Free i nikad nije bio pretplaćen.
- Brisanje naloga testiraj **samo na novom nalogu** (npr. `qa.brisanje@mojljubimac.test`), nikad na test nalozima iz seed-a.
- Istekli Premium (TS-PREM-011, TS-PREM-012) priprema programer u bazi, jer noćni posao još ne postoji (Step 30).
- Gotova arhiva podataka (link „Preuzmi ZIP") stiže tek sa Step 30a. Ovde se proverava samo zahtev i stanje „priprema". Ostatak je u fajlu 12 (TS-JOB-008, TS-JOB-009).

---

### TS-PREM-001 — Premium stranica u stanju „Plaćanje uskoro dostupno"
**Zahtevi:** FR-37, EP-44, EP-45, CR-22 (ekran S17) · **Prioritet:** P1 (kritično) · **Nalog:** marko.jovanovic@mojljubimac.test
**Preduslovi:** Marko je prijavljen (Free).
**Koraci:**
1. Otvori `/premium`.
2. Pogledaj gornju karticu, kartice planova i dugme za pretplatu.
3. Pokušaj da klikneš dugme za pretplatu.
**Očekivani rezultat:** Naslov je „Premium za sve tvoje ljubimce". Kartica „Plaćanje uskoro dostupno" kaže „Još podešavamo plaćanje karticom. Do tada koristiš Free plan bez ograničenja vremena — javićemo ti mejlom kad Premium bude spreman.". Izbor „Mesečno / Godišnje" i cene su sakriveni, a na Premium kartici piše „Cena će biti objavljena uskoro.". Dugme glasi „Plaćanje uskoro dostupno", isključeno je i ništa se ne dešava na klik. Nema napomene o plaćanju karticom (Monri).
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PREM-002 — Tabela poređenja Free i Premium
**Zahtevi:** FR-36, BR-01, BR-02 (ekran S17) · **Prioritet:** P2 (važno) · **Nalog:** marko.jovanovic@mojljubimac.test
**Preduslovi:** —
**Koraci:**
1. Na `/premium` pročitaj tabelu „Šta dobijaš".
**Očekivani rezultat:** Postoje redovi: „Aktivni ljubimci" (Free 1, Premium neograničeno), „Prilozi po ljubimcu" (10 / neograničeno), „Trenuci po ljubimcu" (5 / neograničeno), „Dnevnik ishrane i stolice" (oba uključena), „Izvoz kartona u PDF", „Domaćinstvo (do 6 članova)", „Podsetnici mejlom i push-om" (oba), „Podsetnici na WhatsApp" (Premium: „30 poruka mesečno") i „Logo na podeljenim slikama" (Premium: „Možeš da ga ukloniš"). Vrednosti nisu samo ikonice; uz ikonicu stoji tekst „Uključeno" ili „Nije uključeno" (bar za čitač ekrana).
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PREM-003 — Oznaka „Tvoj plan" na pravoj kartici
**Zahtevi:** FR-36 (ekran S17) · **Prioritet:** P2 (važno) · **Nalog:** marko.jovanovic@mojljubimac.test, ivana.petrovic@mojljubimac.test
**Preduslovi:** —
**Koraci:**
1. Kao Marko otvori `/premium`.
2. Kao Ivana otvori `/premium`.
**Očekivani rezultat:** Marko vidi oznaku „Tvoj plan" samo na Free kartici, a Ivana samo na Premium kartici. Oznaka se nikad ne vidi na obe kartice.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PREM-004 — Iskorišćen probni period
**Zahtevi:** BR-07, E-15 (ekran S17) · **Prioritet:** P3 (sitno) · **Nalog:** nalog sa iskorišćenim probnim periodom (programer označava u bazi; može i ivana.petrovic@mojljubimac.test ako je tako u seed-u)
**Preduslovi:** Nalog je već koristio 7 dana besplatno.
**Koraci:**
1. Otvori `/premium`.
**Očekivani rezultat:** Ne nudi se „Probaj 7 dana besplatno". Prikazuje se „Probni period je već iskorišćen na ovom nalogu. Otkazuješ bilo kad u profilu.". Dugme za plaćanje je i dalje isključeno („Plaćanje uskoro dostupno").
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PREM-005 — Ponude „Dostupno u Premiumu" vode na /premium
**Zahtevi:** FR-36, Design §8 PremiumLock (ekrani S01, S03, S13, S17) · **Prioritet:** P2 (važno) · **Nalog:** marko.jovanovic@mojljubimac.test
**Preduslovi:** Marko ima 1 aktivnog ljubimca.
**Koraci:**
1. Na `/ljubimci` klikni „Dodaj ljubimca" i u kartici „Dostupno u Premiumu" klikni „Probaj 7 dana besplatno".
2. Ponovi sa „Izvezi PDF" u kartonu i na `/domacinstvo`.
**Očekivani rezultat:** Svaki put se otvara `/premium`, a stranica prikazuje stanje iz TS-PREM-001. Nijedan poziv ne vodi na praznu stranicu ili grešku.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PREM-006 — Nalog organizacije ne vidi /premium
**Zahtevi:** BR-30, odluka vlasnice za Step 23 (ekran S17) · **Prioritet:** P2 (važno) · **Nalog:** nikola.djordjevic@mojljubimac.test, milica.stojanovic@mojljubimac.test
**Preduslovi:** —
**Koraci:**
1. Kao Nikola (odgajivačnica) upiši adresu `/premium`.
2. Ponovi kao Milica (azil).
**Očekivani rezultat:** U oba slučaja aplikacija preusmerava na `/organizacija`. Premium za vlasnike se ne nudi organizacijama.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PREM-007 — Profil: aktivan Premium
**Zahtevi:** FR-25, BR-09, EP-47 (ekran S18) · **Prioritet:** P1 (kritično) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Ivana ima aktivan mesečni Premium.
**Koraci:**
1. Otvori `/profil` i pogledaj karticu „Pretplata".
**Očekivani rezultat:** Vidi se „Mesečni plan" i broj preostalih dana („Još {n} dana Premiuma") sa trakom napretka i odnosom „{n} / {dana u periodu}". Vidi se datum obnove i „Automatska obnova" uključena. Cena se prikazuje samo ako postoji u podacima; dok cene ne postoje (OQ-03), ne sme da piše „0 RSD" ili „null". Kartica (npr. „Visa •••• 4821") se prikazuje samo ako je poznata.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PREM-008 — Otkazivanje automatske obnove
**Zahtevi:** FR-38, BR-08, EP-48 (ekran S18) · **Prioritet:** P1 (kritično) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Isto kao TS-PREM-007.
**Koraci:**
1. Klikni „Otkaži obnovu".
2. U dijalogu „Otkazati automatsku obnovu?" klikni „Ne, zadrži Premium".
3. Ponovo klikni „Otkaži obnovu" i potvrdi sa „Da, otkaži obnovu".
4. Proveri da li Premium funkcije i dalje rade (npr. „Izvezi PDF" u kartonu).
**Očekivani rezultat:** Korak 2 ne menja ništa. Posle koraka 3 se javlja „Obnova otkazana", a automatska obnova je opisana kao „Isključena — nećemo te ponovo naplatiti". Broj preostalih dana ostaje isti i Premium radi do kraja perioda. Pojavljuje se dugme „Uključi obnovu".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PREM-009 — Ponovno uključivanje obnove
**Zahtevi:** FR-38, EP-48 (ekran S18) · **Prioritet:** P2 (važno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Obnova je otkazana (TS-PREM-008).
**Koraci:**
1. Klikni „Uključi obnovu".
2. Osveži stranicu.
**Očekivani rezultat:** Kartica se vraća u stanje iz TS-PREM-007 i „Automatska obnova" je ponovo uključena. Stanje ostaje i posle osvežavanja.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PREM-010 — Profil: nikad pretplaćen (Free)
**Zahtevi:** FR-36, odluka vlasnice za Step 23 (ekran S18) · **Prioritet:** P1 (kritično) · **Nalog:** marko.jovanovic@mojljubimac.test
**Preduslovi:** Marko nikad nije imao Premium.
**Koraci:**
1. Otvori `/profil`.
2. Klikni „Pogledaj Premium".
**Očekivani rezultat:** Kartica pretplate ima naslov „Free plan" i oznaku „Free". Nema broja dana, datuma obnove, „Otkaži obnovu" ni podataka o kartici. „Pogledaj Premium" vodi na `/premium`.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PREM-011 — Profil: istekao Premium i prekoračeni limiti
**Zahtevi:** FR-39, BR-10, EP-43 (ekran S18) · **Prioritet:** P1 (kritično) · **Nalog:** nalog koji ima 2+ aktivna ljubimca, 11+ priloga na jednom ljubimcu i domaćinstvo (npr. ivana.petrovic@mojljubimac.test)
**Preduslovi:** Programer je u bazi označio pretplatu kao isteklu.
**Koraci:**
1. Otvori `/profil`.
2. Klikni „Obnovi Premium".
**Očekivani rezultat:** Kartica je u stanju „Isteklo". Ispod je pregled prekoračenja: „Aktivni ljubimci" sa vrednošću „{koristiš} od {dozvoljeno}" (npr. „2 od 1") i tekstom „Svi ljubimci ostaju vidljivi; novog ljubimca ne možeš da dodaš.", „Prilozi — {ljubimac}" sa „Svi prilozi ostaju; novi su blokirani.", domaćinstvo sa „Članovi vide deljene ljubimce samo za čitanje." i „WhatsApp podsetnici" sa „Stižu mejlom i push-om.". „Obnovi Premium" vodi na `/premium`.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PREM-012 — Posle isteka sve ostaje vidljivo, a novi unosi preko limita su blokirani
**Zahtevi:** FR-39, BR-10, E-26, E-04, E-08 (ekrani S01, S05, S08) · **Prioritet:** P1 (kritično) · **Nalog:** isti kao TS-PREM-011
**Preduslovi:** Isto kao TS-PREM-011.
**Koraci:**
1. Na `/ljubimci` proveri da li se vide svi ljubimci.
2. Klikni „Dodaj ljubimca".
3. Otvori ljubimca sa 10+ priloga i pokušaj da dodaš novi prilog na pregledu.
4. Kod ljubimca sa 5+ trenutaka pokušaj da dodaš novi trenutak.
5. Dodaj obrok u dnevnik.
**Očekivani rezultat:** Svi ljubimci, prilozi i trenuci su vidljivi i mogu da se otvore. Koraci 2–4 otvaraju „Dostupno u Premiumu" i ništa novo se ne čuva. Obrok (korak 5) se čuva, jer je dnevnik neograničen.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PREM-013 — Nalog organizacije nema karticu pretplate vlasnika
**Zahtevi:** BR-30, odluka vlasnice za Step 23 (ekran S18) · **Prioritet:** P3 (sitno) · **Nalog:** milica.stojanovic@mojljubimac.test
**Preduslovi:** —
**Koraci:**
1. Otvori `/profil` (ako postoji link u meniju organizacije).
**Očekivani rezultat:** Lični podaci i jezik se vide i mogu da se menjaju, ali kartica Premium pretplate se ne prikazuje.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PREM-014 — Zahtev za arhivu podataka
**Zahtevi:** FR-41, EP-50 (ekran S19) · **Prioritet:** P1 (kritično) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Ivana nema arhivu u pripremi.
**Koraci:**
1. Iz `/profil` klikni „Moji podaci i brisanje naloga".
2. U kartici „Preuzmi sve moje podatke" pročitaj opis i klikni „Pripremi arhivu".
3. Osveži stranicu.
**Očekivani rezultat:** Stranica „Moji podaci" ima podnaslov „Tvoji podaci su tvoji — preuzmi ih ili obriši nalog kad god želiš.". Opis kaže „Jedna ZIP arhiva sa svim ličnim podacima i kartonima, uključujući priloge i fotografije.". Posle klika kartica prelazi u „Pripremamo arhivu…" sa oznakom „Arhiva se priprema" i tekstom „Može da potraje nekoliko minuta. Poslaćemo ti mejl na ivana.petrovic@mojljubimac.test kad bude spremna — ne moraš da čekaš na ovoj stranici.". Nema lažne trake napretka. Stanje ostaje i posle osvežavanja.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PREM-015 — Druga arhiva dok je prva u pripremi
**Zahtevi:** FR-41, EP-50 `export_in_progress` (ekran S19) · **Prioritet:** P2 (važno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Arhiva je u pripremi (TS-PREM-014).
**Koraci:**
1. Pokušaj da ponovo zatražiš arhivu (dugme, ili ista stranica u drugoj kartici pregledača otvorena pre zahteva).
**Očekivani rezultat:** Ne pravi se drugi zahtev. Dugme „Pripremi arhivu" se ne nudi dok traje priprema. Ako je klik poslat sa stare kartice, prikazuje se stanje pripreme ili poruka da se arhiva već priprema, bez tehničke greške.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PREM-016 — Sadržaj arhive prikazan pre zahteva
**Zahtevi:** FR-41, EP-50 summary (ekran S19) · **Prioritet:** P3 (sitno) · **Nalog:** ivana.petrovic@mojljubimac.test, jelena.nikolic@mojljubimac.test
**Preduslovi:** Jelena je član Ivaninog domaćinstva.
**Koraci:**
1. Kao Ivana pogledaj spisak šta ulazi u arhivu.
2. Kao Jelena uradi isto.
**Očekivani rezultat:** Ivana vidi „Kartoni: {imena svojih ljubimaca}", „Vakcine, terapije i pregledi" i „Podsetnici i dnevnik nege". Jelena vidi samo svoje ljubimce. Ivanini deljeni ljubimci se **ne** nalaze u Jeleninom spisku.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PREM-017 — Neuspela priprema arhive
**Zahtevi:** FR-41, EP-50 `failed` (ekran S19) · **Prioritet:** P3 (sitno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Programer je u bazi označio poslednju arhivu kao neuspelu.
**Koraci:**
1. Otvori `/profil/podaci`.
2. Klikni „Pripremi arhivu".
**Očekivani rezultat:** Kartica je u osnovnom stanju sa porukom „Priprema arhive nije uspela. Pokušaj ponovo.". Novi zahtev može da se pošalje i kartica prelazi u „Pripremamo arhivu…".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PREM-018 — Dijalog za brisanje naloga i obavezna potvrda
**Zahtevi:** FR-40, BR-31, EP-51 (ekran S19) · **Prioritet:** P1 (kritično) · **Nalog:** novi nalog (qa.brisanje@mojljubimac.test)
**Preduslovi:** Novi nalog ima jednog ljubimca.
**Koraci:**
1. Na `/profil/podaci` pročitaj karticu „Obriši nalog" i klikni dugme.
2. U dijalogu „Obrisati nalog?" probaj da klikneš „Da, obriši" bez štikliranja potvrde.
3. Klikni „Odustani".
**Očekivani rezultat:** Kartica kaže „Nalog se odmah deaktivira, a trajno ga brišemo posle 30 dana. Do tada možeš da se prijaviš i otkažeš brisanje.". Dijalog ima savet „Savet: pre brisanja preuzmi arhivu svojih podataka." i polje za potvrdu „Razumem da se posle 30 dana podaci ne mogu vratiti.". Dok polje nije štiklirano, „Da, obriši" ne radi. „Odustani" zatvara dijalog i ništa se ne menja.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PREM-019 — Dijalog brisanja za Premium vlasnika domaćinstva (bez potvrde)
**Zahtevi:** FR-31, BR-27, EP-50 heir (ekran S19) · **Prioritet:** P2 (važno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Ivana ima domaćinstvo sa bar jednim članom. **Ne potvrđuj brisanje.**
**Koraci:**
1. Klikni „Obriši nalog" i pročitaj dijalog.
2. Klikni „Odustani".
**Očekivani rezultat:** U dijalogu piše „Premium pretplata se neće obnoviti." i „Domaćinstvo ostaje: deljeni ljubimci prelaze na člana koji se prvi pridružio — {ime člana}.", gde je to ime člana koji se najranije pridružio. Za vlasnika bez članova ta rečenica ne postoji.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PREM-020 — Zakazivanje brisanja naloga
**Zahtevi:** FR-40, EP-51, Design §9.1 `account_deletion_scheduled` (ekran S19) · **Prioritet:** P1 (kritično) · **Nalog:** novi nalog (qa.brisanje@mojljubimac.test)
**Preduslovi:** Isto kao TS-PREM-018.
**Koraci:**
1. Otvori dijalog, štikliraj potvrdu i klikni „Da, obriši".
2. Pogledaj stranicu.
3. Otvori Mailpit.
**Očekivani rezultat:** Stranica prelazi u stanje „Brisanje na čekanju" sa datumom brisanja (za 30 dana) i dugmetom „Otkaži brisanje", uz tekst „Ako otkažeš, nalog se vraća tačno onakav kakav je bio.". Kartica za arhivu se ne prikazuje. Mejl ima naslov „Nalog će biti obrisan {datum}" i telo „Primili smo zahtev za brisanje naloga. Nalog je isključen, a {datum} brišemo ga trajno sa svim podacima. …". Dugme „Otkaži brisanje" vodi na `/profil/podaci`.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PREM-021 — Ponašanje naloga dok brisanje čeka
**Zahtevi:** FR-40, EP-42, EP-43 `account_pending_deletion` (ekrani S16, S19, S01) · **Prioritet:** P1 (kritično) · **Nalog:** novi nalog sa zakazanim brisanjem (TS-PREM-020)
**Preduslovi:** Brisanje je zakazano.
**Koraci:**
1. Odjavi se i prijavi ponovo.
2. Ručno otvori `/ljubimci` i pokušaj da dodaš ljubimca ili izmeniš postojećeg.
3. U `/profil` pokušaj da promeniš ime.
**Očekivani rezultat:** Posle prijave aplikacija vodi direktno na `/profil/podaci` u stanju „Brisanje na čekanju". Izmene u koracima 2 i 3 se ne čuvaju i prikazuje se poruka greške (ili preusmerenje na `/profil/podaci`). Odjava radi.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PREM-022 — Otkazivanje brisanja vraća nalog nepromenjen
**Zahtevi:** FR-40, E-16, EP-51 (ekran S19) · **Prioritet:** P1 (kritično) · **Nalog:** novi nalog sa zakazanim brisanjem
**Preduslovi:** Brisanje je zakazano. Zapiši ime ljubimca i broj unosa pre otkazivanja.
**Koraci:**
1. Na `/profil/podaci` klikni „Otkaži brisanje".
2. Otvori `/ljubimci` i karton ljubimca.
3. Izmeni nešto sitno (npr. napomenu) i sačuvaj.
**Očekivani rezultat:** Stranica se vraća u osnovno stanje (kartica za arhivu i „Obriši nalog"). Svi ljubimci i unosi su na mestu i izmene ponovo mogu da se čuvaju. U Mailpit-u stiže potvrda otkazivanja.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PREM-023 — Jedan nalog ne vidi tuđe podatke na S19
**Zahtevi:** FR-34, FR-41 (ekran S19) · **Prioritet:** P2 (važno) · **Nalog:** marko.jovanovic@mojljubimac.test
**Preduslovi:** Ivana ima arhivu u pripremi (TS-PREM-014).
**Koraci:**
1. Kao Marko otvori `/profil/podaci`.
**Očekivani rezultat:** Marko vidi samo svoje stanje (bez Ivanine arhive), svoje ljubimce u spisku i svoju mejl adresu.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PREM-024 — Premium, profil i moji podaci na engleskom
**Zahtevi:** FR-35, NFR-05 (ekrani S17, S18, S19) · **Prioritet:** P2 (važno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** —
**Koraci:**
1. U `/profil` promeni „Jezik" na „English" i sačuvaj.
2. Otvori `/premium`, `/profil` i `/profil/podaci`, kao i dijalog „Delete account".
3. Vrati jezik na „Srpski (latinica)".
**Očekivani rezultat:** Jezik se menja odmah, bez ponovnog učitavanja. Svi tekstovi su na engleskom (npr. „Payments coming soon", „Delete account", „The trial has already been used…" ako je primenljivo), a datumi su u formatu „19 Oct 2026". Posle vraćanja je sve ponovo na srpskom.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PREM-025 — Prikaz na telefonu (375 px)
**Zahtevi:** NFR-03 (ekrani S17, S18, S19) · **Prioritet:** P2 (važno) · **Nalog:** marko.jovanovic@mojljubimac.test
**Preduslovi:** Prikaz za telefon, širina 375 px.
**Koraci:**
1. Otvori `/premium`, `/profil` i `/profil/podaci`, i otvori dijalog brisanja.
**Očekivani rezultat:** Nema vodoravnog skrolovanja. Kartice planova su jedna ispod druge, a tabela poređenja je čitljiva (kolone se ne preklapaju). Dijalog brisanja stane na ekran i dugmad su dovoljno velika.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-PREM-026 — Otkazivanje obnove i brisanje samo tastaturom
**Zahtevi:** NFR-04, Design §10 (ekrani S18, S19) · **Prioritet:** P3 (sitno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** —
**Koraci:**
1. Tasterom Tab dođi do „Otkaži obnovu", otvori dijalog Enter-om i zatvori ga tasterom Esc.
2. Na `/profil/podaci` otvori „Obriši nalog", razmakom štikliraj potvrdu, pa Tab-om dođi do „Odustani" i pritisni Enter.
**Očekivani rezultat:** Fokus se vidi na svakom elementu i ostaje unutar dijaloga dok je otvoren. Posle zatvaranja se vraća na dugme koje je otvorilo dijalog. Ništa se ne briše i obnova se ne menja.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____
