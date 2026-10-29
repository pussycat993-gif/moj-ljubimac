# 11 — WhatsApp kanal za podsetnike (oblast WA)

**Status:** ✅ spremno za test lokalno (Step 29 gotov). Pravo slanje na WhatsApp čeka Meta nalog (poslovni nalog i odobreni šabloni poruka) — do tada se poruke ne šalju, nego se upisuju u log servera.
**Ekrani:** S12 Podešavanja podsetnika (`/podesavanja/podsetnici`, kartica „Kanali" → WhatsApp, polje WhatsApp po vrsti podsetnika, kartica „WhatsApp poruke"), S10 Podsetnici
**Zahtevi:** FR-23, FR-24, FR-29, BR-14, BR-14a, BR-14b, BR-24, E-09, E-27, EP-28, EP-30, EP-31, EP-33, API §9.1, UC-04, UC-QA-07
**Okruženje:** lokalno http://localhost:3000 · Mailpit http://127.0.0.1:54324 · lozinka `MojLjubimac123!`

**Pre početka — kako radi „lažni" WhatsApp lokalno:**
- Lokalno (i svuda gde WhatsApp pristupni podaci nisu podešeni) aplikacija **ne šalje** poruku. Umesto toga u log servera upisuje red koji počinje sa `[whatsapp:fake]`, sa nazivom šablona, brojem telefona i sadržajem — za potvrdu broja tu je i **kod od 6 cifara**.
- Log vidi programer (terminal u kome radi `npm run dev`). Kad scenario kaže „uzmi kod iz loga", zamoli programera: „Pročitaj mi poslednji `[whatsapp:fake]` red za broj {broj}".
- Kod važi **10 minuta**.
- „Urađeno" iz WhatsApp poruke lokalno ne može da se pritisne na telefonu. Programer ga **simulira**: šalje serveru (adresa `/api/webhooks/whatsapp`) istu poruku koju bi poslao Meta kad korisnik pritisne dugme, potpisanu tajnim ključem aplikacije. Ti posle toga proveravaš rezultat u aplikaciji. Vidi TS-WA-006.
- Scenario TS-REM-022 (fajl 03, „Premium: WhatsApp „Uskoro dostupno“") više ne važi: posle Step 29 Premium korisnik vidi pravo povezivanje broja. Vidi TS-WA-009.

---

### TS-WA-001 — Free korisnik ne može da poveže WhatsApp
**Zahtevi:** FR-23, BR-14, E-09, EP-30 (ekran S12) · **Prioritet:** P1 (kritično) · **Nalog:** marko.jovanovic@mojljubimac.test
**Preduslovi:** —
**Koraci:**
1. Otvori `/podesavanja/podsetnici`.
**Očekivani rezultat:** WhatsApp deo u kartici „Kanali" je zamućen iza „Dostupno u Premiumu" sa tekstom „Poveži broj telefona i primaj važne podsetnike i na WhatsApp-u, pored mejla i push obaveštenja.". U svakoj vrsti podsetnika polje WhatsApp je isključeno, sa oznakom Premium (čitač ekrana čita „Dostupno u Premiumu"). Nema brojača poruka.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-WA-002 — Povezivanje broja kodom iz loga
**Zahtevi:** FR-23, EP-30, odluka vlasnice za Step 29 (ekran S12) · **Prioritet:** P1 (kritično) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Ivana ima Premium i nema povezan broj.
**Koraci:**
1. U „Broj telefona za WhatsApp" upiši `+381 64 123 4567` i klikni „Pošalji kod".
2. Zamoli programera da ti pročita kod iz `[whatsapp:fake]` reda u logu, upiši ga u „Kod iz poruke" i klikni „Potvrdi".
**Očekivani rezultat:** Ispod polja piše „Poslaćemo ti kod na WhatsApp da potvrdimo da je broj tvoj.". Posle slanja piše „Poslali smo kod na +381 64 123 4567." i postoje „Pošalji kod ponovo" i „Promeni broj". U logu postoji red `[whatsapp:fake]` sa šablonom za potvrdni kod, Ivaninim brojem i kodom. Posle potvrde se prikazuje „Povezano: +381 64 123 4567" sa dugmetom „Prekini vezu", a WhatsApp polja u vrstama podsetnika postaju dostupna.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-WA-003 — Pogrešan, kratak ili istekao kod i previše pokušaja
**Zahtevi:** EP-30 `verification_code_invalid`, `rate_limited`, odluka vlasnice za Step 29 (ekran S12) · **Prioritet:** P2 (važno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Kod je poslat, broj još nije potvrđen (ako jeste, prvo „Prekini vezu").
**Koraci:**
1. Upiši `123` i potvrdi.
2. Upiši pogrešan kod od 6 cifara.
3. Sačekaj 11 minuta i upiši tačan (stari) kod.
4. Klikni „Pošalji kod" (ili „Pošalji kod ponovo") 6 puta u sat vremena.
**Očekivani rezultat:** Korak 1 daje „Kod ima 6 cifara. Proveri poruku na WhatsApp-u.". Koraci 2 i 3 daju „Kod nije tačan ili je istekao.". Šesto slanje u satu daje „Previše pokušaja. Pokušaj ponovo za {n} min.". Broj ostaje nepovezan.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-WA-004 — Broj na koji WhatsApp ne može da stigne
**Zahtevi:** EP-30 `undeliverable`, odluka vlasnice za Step 29 (ekran S12) · **Prioritet:** P3 (sitno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Programer zna kako da lažni WhatsApp vrati „nedostupan broj" (ili test na produkciji, kad Meta nalog bude podešen, sa pravim brojem bez WhatsApp-a).
**Koraci:**
1. Upiši taj broj i klikni „Pošalji kod".
**Očekivani rezultat:** Ispod polja piše „Na ovaj broj ne možemo da pošaljemo WhatsApp poruku.". Ako programer ne može da izazove ovo stanje lokalno, označi Blokiran i upiši razlog.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-WA-005 — WhatsApp kao kanal, brojač i granica od 30
**Zahtevi:** FR-23, BR-14a, EP-31, EP-33 (ekran S12) · **Prioritet:** P1 (kritično) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Broj je povezan. Programer može da lokalno upiše 29 isporučenih WhatsApp poruka u ovom mesecu.
**Koraci:**
1. Za „Vakcine" štikliraj i Mejl i WhatsApp i klikni „Sačuvaj podešavanja".
2. Pogledaj karticu „WhatsApp poruke".
3. Sa brojačem na 29 neka programer pokrene dva podsetnika (npr. dva ručna podsetnika kojima je stiglo vreme).
4. Pogledaj Mailpit i zamoli programera da pogleda log.
**Očekivani rezultat:** Javlja se „Podešavanja su sačuvana.". Brojač pokazuje „{n} / 30 poruka ovog meseca" i „Kad potrošiš svih 30, do kraja meseca podsetnici stižu mejlom i push-om. Brojač se vraća na nulu {1. sledećeg meseca}.". Trideseta poruka ide na WhatsApp (red `[whatsapp:fake]` u logu), a sledeći podsetnik stiže samo mejlom (i push-om). Mejl stiže za oba podsetnika, jer je i on izabran.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-WA-006 — „Urađeno" iz WhatsApp poruke (simulirani webhook)
**Zahtevi:** FR-24, EP-32, API §9.1 (WhatsApp webhook), odluka vlasnice za Step 29 · **Prioritet:** P1 (kritično) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Podsetnik je „poslat" na WhatsApp (red `[whatsapp:fake]` u logu).
**Koraci:**
1. Zamoli programera: „Simuliraj pritisak na „Urađeno" za poslednju WhatsApp poruku podsetnika {naslov}". (Programer serveru šalje potpisan zahtev kakav šalje Meta i u logu čita odgovor koji bi korisnik dobio.)
2. Otvori `/podsetnici` i tab „Urađeno".
3. Zamoli programera da isti pritisak simulira posle više od 24 sata (pomeranjem vremena) ili sa neispravnim potpisom.
**Očekivani rezultat:** Odgovor korisniku glasi „Označeno kao urađeno. {ljubimac}: {naslov} — označeno u {vreme}.", a podsetnik je u aplikaciji „Urađeno" sa vremenom i Ivaninim imenom. Posle 24 sata odgovor koristi tekst isteklog linka („Link važi 24 sata i samo jednom. Otvori aplikaciju i označi podsetnik tamo."). Zahtev sa neispravnim potpisom server odbija i ništa se ne menja (programer potvrđuje).
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
1. Neka programer pokrene podsetnik deljenog ljubimca.
2. Pogledaj Mailpit i zamoli programera da pogleda log.
**Očekivani rezultat:** Ivani podsetnik stiže i na WhatsApp (red `[whatsapp:fake]` sa njenim brojem), a Jeleni samo mejlom i push-om — u logu nema WhatsApp reda za Jelenu.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-WA-009 — Viber isključen i nema više „Uskoro dostupno" za WhatsApp
**Zahtevi:** FR-23, BR-14b, E-27, CR-13 (ekran S12) · **Prioritet:** P2 (važno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Viber je isključen u admin delu (fajl 09, TS-ADM-009).
**Koraci:**
1. Otvori `/podesavanja/podsetnici` i pogledaj karticu „Kanali" i kanale u svakoj vrsti podsetnika.
**Očekivani rezultat:** Viber ne može da se izabere ni u jednoj vrsti (BR-14b). Po dokumentima (S12) se Viber, dok je isključen, ne prikazuje uopšte; ako ga vidiš sa oznakom „Uskoro dostupno" i bez mogućnosti izbora, to je prihvatljivo, ali upiši u napomenu da Ivana potvrdi. WhatsApp **više nema** oznaku „Uskoro dostupno" — umesto nje je polje za broj telefona i dugme „Pošalji kod", a WhatsApp polja po vrstama nisu zaključana oznakom „Uskoro dostupno".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-WA-010 — Neispravan broj telefona
**Zahtevi:** EP-30 (ekran S12) · **Prioritet:** P2 (važno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Broj nije povezan.
**Koraci:**
1. Klikni „Pošalji kod" sa praznim poljem.
2. Upiši `064` i klikni „Pošalji kod".
3. Upiši `abc123` i klikni „Pošalji kod".
4. Upiši `064 123 4567` (bez +381) i klikni „Pošalji kod".
**Očekivani rezultat:** Za korake 1–3 ispod polja piše „Upiši broj mobilnog telefona, npr. +381 64 123 4567." i kod se ne šalje (nema `[whatsapp:fake]` reda). Za korak 4 aplikacija broj prikazuje u obliku „+381 64 123 4567" i šalje kod (ili traži ispravan oblik istom porukom — zapiši šta se desilo).
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-WA-011 — WhatsApp polje bez povezanog broja
**Zahtevi:** FR-23, EP-28 `whatsapp_not_connected` (ekran S12) · **Prioritet:** P2 (važno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Ivana ima Premium, broj nije povezan.
**Koraci:**
1. U vrsti „Vakcine" pokušaj da štikliraš WhatsApp.
2. Poveži broj (TS-WA-002) i ponovo otvori stranicu.
**Očekivani rezultat:** Bez povezanog broja WhatsApp polje je isključeno i uz njega piše „Broj nije povezan". Posle povezivanja polje može da se štiklira i sačuva.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-WA-012 — „Promeni broj" i „Pošalji kod ponovo"
**Zahtevi:** EP-30 (ekran S12) · **Prioritet:** P3 (sitno) · **Nalog:** ivana.petrovic@mojljubimac.test
**Preduslovi:** Kod je poslat na `+381 64 123 4567`, broj još nije potvrđen.
**Koraci:**
1. Klikni „Pošalji kod ponovo" i zamoli programera za novi kod iz loga.
2. Potvrdi **stari** kod, pa novi.
3. Prekini vezu, upiši broj, pošalji kod, pa klikni „Promeni broj" i upiši `+381 65 765 4321`.
**Očekivani rezultat:** Ponovo poslat kod se vidi u novom `[whatsapp:fake]` redu. Potvrda radi sa kodom koji je u tom trenutku važeći (zapiši da li stari kod i dalje prolazi — kod važi 10 minuta). „Promeni broj" vraća polje za broj, a novi kod stiže za novi broj; posle potvrde piše „Povezano: +381 65 765 4321".
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____

### TS-WA-013 — WhatsApp na engleskom
**Zahtevi:** FR-35, NFR-05, API §9.4, odluka vlasnice za Step 29 (ekran S12) · **Prioritet:** P2 (važno) · **Nalog:** ivana.petrovic@mojljubimac.test (jezik „English")
**Preduslovi:** Ivana menja jezik na „English". Broj nije povezan.
**Koraci:**
1. Pošalji kod, pa upiši pogrešan kod.
2. Neka programer u logu proveri jezik šablona poruke za kod.
3. Pošalji kod 6 puta u sat vremena.
**Očekivani rezultat:** Ceo WhatsApp deo je na engleskom. Greške glase „The code is wrong or has expired." i „Too many attempts. Try again in {n} min.". Šablon u logu je na engleskom (jezik prati jezik iz profila). Posle vraćanja na srpski poruke su ponovo na srpskom.
**Rezultat:** ☐ Prošao ☐ Pao ☐ Blokiran — Napomena: ____
