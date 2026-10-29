# 12 — Noćni poslovi, nasledstvo, arhiva podataka i backup (oblast JOB)

**Status:** ✅ spremno za test lokalno (Step 30 i Step 30a gotovi). Ovi poslovi rade sami u pozadini, pa ih tester ne može da pokrene iz aplikacije — **svaki scenario traži pomoć programera** (vidi tabelu ispod).
**Ekrani:** S18 Profil i pretplata, S19 Moji podaci (`/profil/podaci`), S13 Domaćinstvo, S20 Organizacija, S12, S21, S14 (posledice poslova) · mejlovi u Mailpit-u
**Zahtevi:** FR-25, FR-31, FR-32, FR-39, FR-40, FR-41, BR-09, BR-16, BR-27, BR-28, BR-31, BR-38, BR-46, BR-47, E-06, E-14, NFR-06, NFR-07, NFR-08, UC-06, UC-07, UC-QA-08
**Okruženje:** lokalno http://localhost:3000 · Mailpit http://127.0.0.1:54324 · lozinka `MojLjubimac123!`

**Kada poslovi rade (po beogradskom vremenu):**

| Posao | Kada | Šta radi |
|---|---|---|
| Pretplate (billing) | svake noći u **03:00** | istek Premium-a, obaveštenja 30 / 7 / 1 dan pre kraja, domaćinstvo samo za čitanje |
| Čišćenje (retention) | svake noći u **03:30** | trajno brisanje naloga posle 30 dana, nasledstvo domaćinstva i organizacije, istek poziva, kartona i arhiva, brisanje fajlova iz skladišta |
| Arhive podataka (exports) | na svakih **5 minuta** | pravi ZIP arhivu koju je korisnik zatražio i šalje mejl „Tvoji podaci su spremni" |
| Backup baze | jednom noću (GitHub Actions) | kopija produkcione baze u skladište, brišu se kopije starije od 14 dana |

**Šta tester traži od programera (lokalno):**
- **„Pomeri datum u bazi"** — npr. kraj Premium perioda, datum brisanja naloga, rok poziva ili arhive. Uvek reci: koji nalog (mejl), koje polje (npr. „kraj Premium perioda", „datum trajnog brisanja") i na koji datum.
- **„Pokreni posao ručno"** — reci koji: pretplate (03:00), čišćenje (03:30) ili arhive. Programer ga pokreće tako da se ponaša kao da je 03:00 / 03:30 (posao inače radi samo u tom satu).
- **„Pročitaj mi rezultat posla"** — programer vidi šta je posao uradio (npr. koliko naloga je obrisano, koliko mejlova poslato, koliko fajlova obrisano).
- **„Proveri u bazi / skladištu"** — da li neki red ili fajl još postoji.
- Lokalno **nema podešenog skladišta fajlova (R2)**, pa čišćenje **preskače** brisanje fajlova: fajlovi ostaju upisani „za brisanje", a rezultat kaže da je obrisano 0 fajlova. To je očekivano (TS-JOB-013). Pre TS-JOB-008 pitaj programera kako je lokalno podešeno skladište za arhive.
- Testove koji brišu naloge radi samo na **novim** nalozima, nikad na nalozima iz seed-a. Posle scenarija sa Ivaninim Premium-om zamoli programera da joj vrati aktivan Premium.

---

### TS-JOB-001 — Obaveštenja o isteku Premium-a (30, 7 i 1 dan)
**Zahtevi:** FR-25, BR-09, EP-49, Design §9.1 `premium_expiry_*` · **Prioritet:** P1 (kritično) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** **Traži od programera:** „Ivani postavi kraj Premium perioda na tačno 30 dana od danas i pokreni posao pretplata." Posle provere isto za 7 dana, pa za 1 dan.
**Koraci:**
1. Posle svakog pokretanja pogledaj Mailpit.
2. Ponovi korak za 7 dana sa isključenom automatskom obnovom („Otkaži obnovu" na `/profil`).
3. Na `/profil` pogledaj broj preostalih dana.
**Očekivani rezultat:** Stižu mejlovi „Premium ističe za 30 dana", „Premium ističe za 7 dana" i „Premium ističe sutra", sa telom „Tvoj Premium traje do {datum}." i dugmetom „Pogledaj pretplatu". Sa uključenom obnovom piše „Obnavlja se automatski — ne moraš ništa da radiš.", a sa isključenom „Posle toga prelaziš na Free: ništa se ne briše, ali dodatni ljubimci i domaćinstvo postaju samo za čitanje.". Profil pokazuje tačan broj preostalih dana.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-JOB-002 — Obaveštenje se ne ponavlja
**Zahtevi:** FR-25, odluka vlasnice za Step 30 · **Prioritet:** P2 (važno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Mejl za 7 dana je već stigao (TS-JOB-001).
**Koraci:**
1. **Traži od programera:** „Pokreni posao pretplata još dva puta, bez promene datuma."
2. Pogledaj Mailpit.
**Očekivani rezultat:** Ne stiže nijedan dodatni mejl za isti prag. (Sledeći mejl stiže tek na 1 dan pre kraja.)
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-JOB-003 — Istek Premium-a: Free pravila, domaćinstvo samo za čitanje i WhatsApp prelazi na mejl
**Zahtevi:** FR-25, FR-32, FR-39, BR-16, BR-28, E-06, EP-49 (ekrani S18, S13, S12) · **Prioritet:** P1 (kritično) · **Nalog:** ivana.petrovic@mojljubimac.test + jelena.nikolic@mojljubimac.test
**Preduslovi:** Ivana ima otkazanu obnovu, domaćinstvo sa Jelenom i podsetnik podešen **samo** na WhatsApp. **Traži od programera:** „Ivani postavi kraj Premium perioda na juče i pokreni posao pretplata."
**Koraci:**
1. Kao Ivana otvori `/profil` i `/domacinstvo`. Kao Jelena otvori `/domacinstvo`.
2. **Traži od programera:** „Pokreni Ivanin podsetnik koji je bio na WhatsApp-u i pogledaj log."
3. Pogledaj Mailpit.
**Očekivani rezultat:** Pretplata je „Isteklo" sa pregledom prekoračenja (kao TS-PREM-011). Domaćinstvo **samo od sebe** postaje samo za čitanje (trake kao TS-HH-025 i TS-HH-026). Podsetnik stiže mejlom (i push-om), a u logu nema `[whatsapp:fake]` reda za njega.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-JOB-004 — Brisanje naloga posle 30 dana
**Zahtevi:** FR-40, NFR-06, BR-31, EP-52 · **Prioritet:** P1 (kritično) · **Nalog:** novi nalog sa zakazanim brisanjem (fajl 06, TS-PREM-020), sa bar jednim ljubimcem, prilogom, trenutkom i oglasom u Šapi pomoći
**Preduslovi:** **Traži od programera:** „Za nalog {mejl} pomeri datum trajnog brisanja na juče i pokreni posao čišćenje."
**Koraci:**
1. Pokušaj prijavu tim nalogom.
2. **Traži od programera:** „Proveri da li u bazi postoje profil, ljubimci, unosi, trenuci, oglasi, poruke i arhive tog naloga, i da li su fajlovi upisani za brisanje."
3. Kao drugi korisnik otvori stari link oglasa tog naloga.
**Očekivani rezultat:** Prijava ne uspeva (kao za nepostojeći nalog). U bazi nema nijednog reda tog naloga. Fajlovi su upisani za brisanje (lokalno se ne brišu, TS-JOB-013). Stari link oglasa prikazuje „Oglas nije dostupan".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-JOB-005 — Nasledstvo domaćinstva
**Zahtevi:** FR-31, BR-27, E-14, EP-52 (ekrani S13, S01) · **Prioritet:** P1 (kritično) · **Nalog:** novi Premium vlasnik sa domaćinstvom + 2 člana (prvi pridružen je Free)
**Preduslovi:** Vlasnik je zakazao brisanje. **Traži od programera:** „Novom nalogu {mejl} daj Premium (seed) pre poziva članova; posle zakazanog brisanja pomeri datum brisanja na juče i pokreni posao čišćenje."
**Koraci:**
1. Kao član koji se prvi pridružio otvori `/ljubimci` i `/domacinstvo`.
2. Kao drugi član otvori `/domacinstvo`.
**Očekivani rezultat:** Prvi član je novi vlasnik i deljeni ljubimci su na njegovoj listi sa celom istorijom. Lični (nedeljeni) ljubimci bivšeg vlasnika su obrisani. Pošto novi vlasnik nema Premium, domaćinstvo je samo za čitanje za sve. Drugi član ostaje član.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-JOB-006 — Nasledstvo organizacije
**Zahtevi:** BR-46, EP-52, odluka vlasnice za Step 30 (ekran S20) · **Prioritet:** P2 (važno) · **Nalog:** novi azil sa jednim adminom i dva volontera; drugi azil sa samo jednim adminom
**Preduslovi:** Jedini admin svakog azila je zakazao brisanje svog naloga. **Traži od programera:** „Odobri oba azila; posle zakazanog brisanja pomeri datume brisanja admina na juče i pokreni posao čišćenje."
**Koraci:**
1. Kao volonter prvog azila koji se **najranije** pridružio otvori `/organizacija`.
2. Kao drugi volonter otvori `/organizacija`.
3. **Traži od programera:** „Proveri da li drugi azil (bez članova) i njegove životinje još postoje."
**Očekivani rezultat:** Volonter koji se najranije pridružio postaje admin i vidi admin opcije (tim, javni profil, brisanje životinja). Drugi volonter ostaje volonter. Organizacija bez ijednog člana se briše zajedno sa životinjama u istom pokretanju u kome se briše nalog njenog poslednjeg člana (isti rok od 30 dana).
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-JOB-007 — Noćni istek poziva i kartona
**Zahtevi:** BR-38, BR-47, EP-52 (ekrani S14, S21, S13) · **Prioritet:** P2 (važno) · **Nalog:** ivana.petrovic@mojljubimac.test, milica.stojanovic@mojljubimac.test
**Preduslovi:** Postoje poziv u domaćinstvo, poziv u tim i poslat karton. **Traži od programera:** „Pozivima pomeri datum slanja na pre 8 dana, a kartonu na pre 31 dan, i pokreni posao čišćenje."
**Koraci:**
1. Otvori sva tri linka i pogledaj „Poslati pozivi" (S13) i S21.
**Očekivani rezultat:** Sva tri linka prikazuju istekao poziv. Na S21 piše „Poziv za karton je istekao {datum} — nije prihvaćen." sa dugmetom „Pošalji ponovo".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-JOB-008 — Arhiva podataka je spremna
**Zahtevi:** FR-41, EP-50, Design §9.1 `data_export_ready`, odluka vlasnice za Step 30a (ekran S19) · **Prioritet:** P1 (kritično) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Ivana je zatražila arhivu (TS-PREM-014). **Traži od programera:** „Potvrdi da lokalno skladište za arhive radi; ako ne želimo da čekamo 5 minuta, pokreni posao arhive."
**Koraci:**
1. Sačekaj do 5 minuta (ili neka programer pokrene posao).
2. Otvori Mailpit i klikni „Preuzmi podatke".
3. Na `/profil/podaci` klikni „Preuzmi ZIP" i otvori arhivu.
**Očekivani rezultat:** Mejl „Tvoji podaci su spremni" kaže „Arhiva sa svim tvojim podacima i kartonima je spremna ({veličina}, npr. „12,4 MB"). Link važi do {datum}.". Dugme vodi na `/profil/podaci`. Kartica je „Arhiva spremna", sa imenom fajla (npr. `moj-ljubimac-ivana-petrovic-{datum}.zip`) i „{veličina} · link važi do {datum za 7 dana}". ZIP sadrži `data.json` (profil, pretplate, ljubimci i svi unosi kartona, dnevnik, trenuci, podsetnici i podešavanja, domaćinstvo, oglasi, razgovori sa porukama, prijave i blokade) i fasciklu `files/` sa prilozima i fotografijama.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-JOB-009 — Istek arhive posle 7 dana
**Zahtevi:** FR-41, EP-52 (ekran S19) · **Prioritet:** P3 (sitno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Arhiva je spremna (TS-JOB-008). **Traži od programera:** „Pomeri rok arhive na juče i pokreni posao čišćenje."
**Koraci:**
1. Otvori `/profil/podaci`.
2. Probaj stari link za preuzimanje.
**Očekivani rezultat:** Kartica je ponovo u osnovnom stanju sa dugmetom „Pripremi arhivu". Stari link više ne radi.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-JOB-010 — Odgajivački plan ne dobija mejl o isteku Premium-a
**Zahtevi:** FR-25, odluka vlasnice za Step 30 (CR-24) · **Prioritet:** P3 (sitno) · **Nalog:** nikola.djordjevic@mojljubimac.test
**Preduslovi:** Nikola ima aktivan odgajivački plan. **Traži od programera:** „Nikolinom odgajivačkom planu postavi kraj na tačno 7 dana od danas i pokreni posao pretplata."
**Koraci:**
1. Pogledaj Mailpit za Nikolu.
**Očekivani rezultat:** Ne stiže mejl „Premium ističe za 7 dana" (taj mejl je samo za Premium vlasnike; obaveštenje za odgajivački plan je zapisano kao otvorena stavka CR-24). Ako mejl stigne, označi Pao.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-JOB-011 — Nalog unutar 30 dana se ne briše
**Zahtevi:** FR-40, E-16, EP-52 (ekrani S16, S19) · **Prioritet:** P1 (kritično) · **Nalog:** novi nalog sa zakazanim brisanjem (TS-PREM-020)
**Preduslovi:** Brisanje je zakazano pre manje od 30 dana (ne pomera se datum). **Traži od programera:** „Pokreni posao čišćenje bez promene datuma."
**Koraci:**
1. Prijavi se tim nalogom.
2. Otkaži brisanje (kao TS-PREM-022).
**Očekivani rezultat:** Prijava radi i prikazuje stanje naloga koji čeka brisanje. Posle otkazivanja svi podaci su tu, nepromenjeni.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-JOB-012 — Uspomene se nikad ne brišu noćnim poslom
**Zahtevi:** NFR-07 (ekran S06) · **Prioritet:** P3 (sitno) · **Nalog:** marko.jovanovic@mojljubimac.test
**Preduslovi:** Marko ima bar jednu uspomenu (fajl 02, TS-PET-026). **Traži od programera:** „Pokreni posao čišćenje i posao pretplata."
**Koraci:**
1. Otvori `/uspomene`.
**Očekivani rezultat:** Sve uspomene su i dalje tu, sa celim kartonom.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-JOB-013 — Bez podešenog skladišta (R2) brisanje fajlova se preskače
**Zahtevi:** EP-52, NFR-06, odluka vlasnice za Step 30 · **Prioritet:** P3 (sitno) · **Nalog:** —
**Preduslovi:** Lokalno (ili na produkciji dok R2 nije podešen). Postoje fajlovi upisani za brisanje (npr. posle TS-JOB-004).
**Koraci:**
1. **Traži od programera:** „Pokreni posao čišćenje i pročitaj mi rezultat: koliko je fajlova obrisano i da li su fajlovi i dalje upisani za brisanje."
**Očekivani rezultat:** Posao se završava bez greške. Rezultat kaže da je obrisano 0 fajlova, a fajlovi ostaju upisani za brisanje (biće obrisani kad se R2 podesi). Ostali delovi posla (brisanje redova u bazi, istekli pozivi) rade normalno.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-JOB-014 — Noćni poslovi su zaštićeni
**Zahtevi:** EP-49, EP-52, odluka vlasnice za Step 30 · **Prioritet:** P2 (važno) · **Nalog:** —
**Preduslovi:** —
**Koraci:**
1. U pregledaču otvori `/api/internal/billing-nightly`, `/api/internal/retention-nightly` i `/api/internal/exports`.
2. **Traži od programera:** „Pozovi ove adrese bez tajnog ključa i sa pogrešnim ključem i reci mi odgovor."
**Očekivani rezultat:** Niko ne može da pokrene posao spolja: u pregledaču se ne prikazuje nikakav podatak niti se posao pokreće. Programer potvrđuje da je odgovor bez ključa ili sa pogrešnim ključem odbijanje (kod 401) i da posao nije uradio ništa (nema novih mejlova ni promena u bazi).
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-JOB-015 — Backup baze
**Zahtevi:** ADR-13, TC §8, odluka vlasnice za Step 30a · **Prioritet:** P2 (važno) · **Nalog:** —
**Preduslovi:** **Traži od programera / Ivane:** lokalno — „Pokreni backup skriptu nad lokalnom bazom i pokaži mi da je napravljen fajl"; produkcija — Ivana ručno pokreće GitHub Actions posao „nightly backup" (prvo pravo pokretanje je njen zadatak pre Step 32).
**Koraci:**
1. Uz programera pogledaj rezultat lokalnog pokretanja.
2. Uz Ivanu u GitHub-u otvori **Actions → nightly backup** i poslednje pokretanje.
3. Zamoli Ivanu da pokaže fajl u skladištu za backup.
**Očekivani rezultat:** Lokalno se pravi fajl kopije baze bez greške. Na GitHub-u poslednje pokretanje je zeleno (uspešno). U skladištu postoji fajl `db/moj-ljubimac-{datum i vreme}.dump`, a nema kopija starijih od 14 dana. Ako produkcijsko pokretanje još nije urađeno, označi Blokiran i upiši „čeka Ivanu".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-JOB-016 — Neuspela arhiva
**Zahtevi:** FR-41, EP-50, odluka vlasnice za Step 30a (ekran S19) · **Prioritet:** P3 (sitno) · **Nalog:** novi nalog
**Preduslovi:** Nov nalog je zatražio arhivu. **Traži od programera:** „Izazovi grešku pri pravljenju arhive (npr. nedostupno skladište ili arhiva veća od 90 MB) i pokreni posao arhive."
**Koraci:**
1. Otvori `/profil/podaci`.
2. Zatraži arhivu ponovo.
**Očekivani rezultat:** Kartica prikazuje stanje neuspele pripreme (kao TS-PREM-017), bez tehničke greške. Ne stiže mejl „Tvoji podaci su spremni". Nov zahtev može da se pošalje.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-JOB-017 — Arhiva ne sadrži tuđe privatne podatke
**Zahtevi:** FR-41, BR-61, odluka vlasnice za Step 30a · **Prioritet:** P2 (važno) · **Nalog:** marko.jovanovic@mojljubimac.test
**Preduslovi:** Marko ima oglas, razgovor sa Ivanom, jednu prijavu i jednu blokadu. Arhiva je spremna (kao TS-JOB-008).
**Koraci:**
1. Otvori `data.json` iz Markove arhive i potraži Ivaninu mejl adresu, telefon i njene ljubimce.
**Očekivani rezultat:** Arhiva sadrži Markove oglase, razgovore u kojima učestvuje (sa porukama obe strane), njegove prijave i blokade. Ivanina mejl adresa, telefon i njeni ljubimci se **ne** nalaze u arhivi.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____
