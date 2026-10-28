# Slučajevi korišćenja — Moj Ljubimac

> Izvor: PRD v1.7 §7 (UC-01 … UC-13), §6 (FR), §8 (BR), §9 (E-xx). Slučajevi su prevedeni i prilagođeni za testiranje. Na kraju su **dodatni QA slučajevi (UC-QA-xx)** — nisu u PRD-u, nego su sklopljeni od postojećih FR-ova da bi svaka oblast scenarija imala svoj tok. Nijedan ne uvodi novu funkciju.

## Oblasti test scenarija

| Oznaka | Oblast | Šta pokriva |
|---|---|---|
| **AUTH** | Nalog i pristup | Registracija, prijava, zaboravljena lozinka, profil, jezik, pravne strane |
| **PET** | Ljubimci i karton | Ljubimci, karton, težina, vakcine, terapije i doze, pregledi, prilozi, uspomene, PDF |
| **REM** | Podsetnici | Lista podsetnika, ručni podsetnici, podešavanja, kanali, „Urađeno" iz poruke |
| **CARE** | Nega i trenuci | Dnevnik ishrane i stolice, obroci, trenuci, javni link |
| **HH** | Domaćinstvo | Pozivi, članovi, deljeni ljubimci, prava člana |
| **PREM** | Premium i podaci | Premium stranica, pretplata, izvoz podataka, brisanje naloga |
| **ORG** | Organizacije | Azil/odgajivačnica, životinje, tim, javni profil, zahtevi i upiti, predaja kartona, legla, javne stranice |
| **PART** | Partneri | Imenik partnera, profil partnera, brze akcije, predlog veterinara |
| **ADM** | Admin | Operater: azili na čekanju, partneri, statistika, kanali, moderacija |
| **SAPA** | Šapa pomoći | Oglasi, poruke, donacije, prijave, blokiranje |
| **WA** | WhatsApp | Povezivanje broja, slanje podsetnika, „Urađeno" iz poruke, mesečni limit |
| **JOB** | Noćni poslovi | Istek Premium-a, brisanje naloga posle 30 dana, nasleđivanje, backup, arhiva izvoza |

Oznaka statusa: ✅ spremno za test · ⏳ Čeka Step NN (scenariji postoje, izvršavaju se kad korak bude gotov).

**Pregled**

| UC | Naziv | Oblasti | Status |
|---|---|---|---|
| UC-01 | Unos vakcine i podsetnik | PET, REM | ✅ (WhatsApp deo ⏳ 29, istek Premium-a ⏳ 30) |
| UC-02 | Premeštanje u Uspomene i vraćanje | PET | ✅ |
| UC-03 | Deljenje trenutka | CARE | ✅ |
| UC-04 | Podešavanje isporuke podsetnika | REM | ✅ (WhatsApp ⏳ 29) |
| UC-05 | Poziv člana domaćinstva | HH | ✅ (E-14 ⏳ 30) |
| UC-06 | Početak, otkazivanje i istek Premium-a | PREM, JOB | ⏳ 31 (kupovina), ⏳ 30 (istek); delimično ✅ |
| UC-07 | Brisanje naloga | PREM, JOB | ✅ zahtev i otkazivanje · ⏳ 30a arhiva, ⏳ 30 trajno brisanje |
| UC-08 | Udomljavanje iz azila sa predajom kartona | ORG | ✅ (odobrenje azila ⏳ 28) |
| UC-09 | Leglo i prodaja kod odgajivača | ORG | ✅ |
| UC-10 | Kontakt sa partnerom | PART, ADM | ✅ (unos partnera i statistika ⏳ 28) |
| UC-11 | Poklanjanje stvari | SAPA | ⏳ 28b, 28c |
| UC-12 | Donacija za potrebu azila | SAPA, ORG | ⏳ 28b, 28c |
| UC-13 | Moderacija prijave | SAPA, ADM | ⏳ 28c |
| UC-QA-01 | Registracija, potvrda mejla, prijava i jezik | AUTH | ✅ |
| UC-QA-02 | Terapija i beleženje doza | PET, REM | ✅ |
| UC-QA-03 | Pregled kod veterinara sa prilozima i PDF | PET | ✅ |
| UC-QA-04 | Dnevnik nege i podsetnici za obroke | CARE, REM | ✅ |
| UC-QA-05 | Tim organizacije i prava volontera | ORG | ✅ |
| UC-QA-06 | Operater: odobravanje azila i partneri | ADM | ⏳ 28 |
| UC-QA-07 | Povezivanje WhatsApp-a | WA | ⏳ 29 |
| UC-QA-08 | Noćni poslovi i backup | JOB | ⏳ 30, 30a |

---

## UC-01 — Unos vakcine i podsetnik (CAP-01)

- **Akter:** P1 Vlasnik ljubimca
- **Preduslovi:** vlasnik je prijavljen; ljubimac postoji i aktivan je.
- **Glavni tok:**
  1. Vlasnik otvara karton ljubimca (S03) → tab Vakcine → „Dodaj vakcinu" (S04).
  2. Unosi naziv/tip vakcine\*, datum davanja\* i datum sledeće doze (helper: „Napravićemo podsetnik.") i čuva (FR-05).
  3. Aplikacija automatski pravi podsetnik za vakcinu (FR-20, BR-12); vakcina dobija oznaku sledeće doze („Sledeća {datum} · za {n} dana").
  4. Podsetnik se šalje izabranim kanalima u podešena vremena unapred — podrazumevano 7 dana pre i na dan u 09:00, mejl + push (FR-22, FR-23, BR-48).
  5. Vlasnik označava podsetnik kao urađen — u aplikaciji (S10) ili dugmetom „Urađeno" iz mejla/push-a (FR-24); prikazuje se kao urađen sa vremenom i osobom.
- **Alternativni tokovi i izuzeci:**
  - **E-01** — vakcina se izmeni ili obriše → povezani podsetnik se menja ili uklanja.
  - **E-05** — podsetnik nije označen → ponovo se šalje jednom posle 30 minuta, zatim se prikazuje kao „Propušteno".
  - **E-06** — Premium je istekao, a podsetnik je bio podešen za WhatsApp/Viber → stiže mejlom i push-om (⏳ Step 29/30).
  - Dugme „Urađeno" iz mejla važi 24 sata i samo jednom; posle toga stranica „Link je istekao".
  - Član domaćinstva vidi vakcinu, ali je ne može dodati ni menjati (FR-28).
- **Postuslov:** vakcina je sačuvana; podsetnik je isporučen i označen kao urađen.
- **Povezano:** FR-05, FR-20, FR-22, FR-23, FR-24, FR-25 · BR-12, BR-13, BR-15, BR-48 · ekrani S03, S04, S10, S12
- **Pokriveno scenarijima:** TS-PET, TS-REM (WhatsApp deo: TS-WA; istek Premium-a: TS-JOB)

## UC-02 — Premeštanje ljubimca u Uspomene i vraćanje (CAP-01)

- **Akter:** P1 Vlasnik ljubimca
- **Preduslovi:** postoji aktivan ljubimac.
- **Glavni tok:**
  1. Vlasnik u kartonu (S03) bira meni → „Premesti u Uspomene".
  2. Unosi datum\*, razlog (uginuo / udomljen / izgubljen) i napomenu, i potvrđuje (FR-11).
  3. Svi podsetnici tog ljubimca prestaju (BR-17); ljubimac se više ne računa u Free limit aktivnih ljubimaca (BR-03) i pojavljuje se u Uspomenama (S06).
  4. Kasnije (npr. izgubljeni ljubimac je pronađen) vlasnik u S06 bira „Vrati među aktivne" (FR-12).
  5. Ljubimac je ponovo aktivan sa celom istorijom, podsetnici se ponovo uključuju; poruka „{ime} je ponovo među aktivnim ljubimcima."
- **Alternativni tokovi i izuzeci:**
  - **E-02** — Free korisnik dodaje treću uspomenu → blokirano, Premium ponuda (brojač „2 / 2 uspomene").
  - **E-03** — Free korisnik vraća ljubimca dok je aktivno mesto zauzeto → blokirano, Premium ponuda.
  - Ljubimac u Uspomenama u kartonu nema opciju „Premesti u Uspomene".
  - Trajno brisanje (FR-13) — jedna potvrda „Da, obriši" briše ljubimca i sve unose, priloge, trenutke i podsetnike.
- **Postuslov:** ljubimac je ponovo aktivan sa kompletnom istorijom.
- **Povezano:** FR-11, FR-12, FR-13 · BR-01, BR-03, BR-17 · NFR-07 · ekrani S03, S06, S01
- **Pokriveno scenarijima:** TS-PET

## UC-03 — Deljenje trenutka (CAP-02)

- **Akter:** P1 Vlasnik ljubimca; Posetilac
- **Preduslovi:** postoji trenutak (S08).
- **Glavni tok:**
  1. Vlasnik u Trenucima (S08) bira „Podeli kao sliku" — slika sadrži ime ljubimca, datum i logo „Moj Ljubimac" (FR-18) — ili uključuje „Javni link" i kopira ga (FR-19).
  2. Posetilac otvara link `/t/…` (S09) bez prijave i vidi samo trenutak: fotografije, tekst, ime ljubimca i datum — nikada zdravstvene podatke.
  3. Na javnoj stranici je poziv „Napravi nalog za svog ljubimca".
- **Alternativni tokovi i izuzeci:**
  - **E-07** — link je isključen ili je trenutak obrisan → stranica prikazuje „Ovaj trenutak više nije javan".
  - **E-08** — Free korisnik dodaje šesti trenutak za istog ljubimca ili trenutak sa 6+ fotografija → blokirano (Premium ponuda za limit trenutaka; za fotografije poruka).
  - **E-25** — Free korisnik pokušava da isključi logo → prekidač je onemogućen uz Premium oznaku; Premium korisnik može da isključi logo.
  - Tekst trenutka je najviše 280 znakova (BR-52).
- **Postuslov:** trenutak je vidljiv svima koji imaju link, dok ga vlasnik ne isključi.
- **Povezano:** FR-17, FR-18, FR-19 · BR-06, BR-45, BR-52 · ekrani S08, S09
- **Pokriveno scenarijima:** TS-CARE

## UC-04 — Podešavanje isporuke podsetnika (CAP-03)

- **Akter:** P1 Vlasnik ljubimca
- **Preduslovi:** vlasnik je prijavljen.
- **Glavni tok:**
  1. Vlasnik otvara Podešavanja podsetnika (S12).
  2. Za svaki tip (Vakcine, Terapije/doze, Kontrole, Obroci, Rođendani, Moji podsetnici) bira jedno ili više vremena unapred, vreme slanja i kanale (FR-22, FR-23); doze i obroci imaju natpis „Stižu tačno u zadato vreme".
  3. Uključuje push u kartici „Kanali" (pregledač traži dozvolu) i čuva — „Podešavanja su sačuvana."
  4. Pravi ručni podsetnik u S11: naslov\*, za koga (ljubimac ili „Samo za mene"), datum i vreme\*, ponavljanje (nema / dnevno / nedeljno / mesečno / godišnje) (FR-21).
  5. Podsetnici stižu prema podešavanjima; podsetnik sa ponavljanjem „mesečno" posle isteka zakazuje sledeći za mesec dana.
- **Alternativni tokovi i izuzeci:**
  - **E-09** — Free korisnik pokušava WhatsApp/Viber → prikazano kao samo za Premium (PremiumLock, „Dostupno u Premiumu").
  - **E-27** — Viber je isključen od strane operatera → Viber se ne nudi kao kanal.
  - **E-05** — podsetnik nije označen → ponovo jednom posle 30 min, pa „Propušteno".
  - Prazno vreme slanja → „Upiši vreme slanja."; datum ručnog podsetnika u prošlosti → „Izaberi datum i vreme u budućnosti."
  - Pregledač ne podržava push → „Ovaj pregledač ne podržava push obaveštenja."; na iPhone-u bez sajta na početnom ekranu prikazuje se savet „Dodaj na početni ekran".
  - Premium korisnik pre Step 29 vidi WhatsApp kao „Uskoro dostupno".
  - Izmena ili brisanje ručnog podsetnika menja buduće pojave, istorija ostaje (FR-21).
- **Postuslov:** podešavanja su sačuvana i primenjuju se na naredne podsetnike.
- **Povezano:** FR-21, FR-22, FR-23, FR-24 · BR-13, BR-14, BR-14b, BR-15, BR-18, BR-48 · ekrani S10, S11, S12
- **Pokriveno scenarijima:** TS-REM (WhatsApp: TS-WA)

## UC-05 — Poziv člana domaćinstva (CAP-04)

- **Akter:** P1 Vlasnik (Premium); P2 Član domaćinstva
- **Preduslovi:** vlasnik ima Premium.
- **Glavni tok:**
  1. Vlasnik u Domaćinstvu (S13) poziva člana mejlom ili pravi link koji sam šalje (FR-26); ako domaćinstvo još ne postoji, unosi „Naziv domaćinstva".
  2. Pozvani otvara poziv (S14), prijavljuje se ili pravi nalog, i pridružuje se.
  3. Vlasnik bira koje ljubimce deli (FR-27).
  4. Član uključuje svoje podsetnike za deljene ljubimce (FR-29) — samo mejl i push — i beleži svakodnevnu negu (FR-28).
- **Alternativni tokovi i izuzeci:**
  - **E-10** — Free vlasnik pokušava da pozove → blokirano, Premium ponuda.
  - **E-11** — domaćinstvo ima 6 članova (uključujući vlasnika) → poziv sedmog blokiran sa porukom; pri prihvatanju: „Domaćinstvo je popunjeno (najviše 6 članova)."
  - **E-12** — član pokušava da izmeni ili obriše tuđi unos → akcija nije dostupna.
  - **E-13** — vlasniku istekne Premium → članovi zadržavaju samo pregled (baner „Vlasniku domaćinstva je istekao Premium…").
  - **E-14** — vlasnik obriše nalog → vlasništvo prelazi na člana koji se prvi pridružio; ako on nema Premium, domaćinstvo je samo za čitanje (⏳ Step 30).
  - Poziv važi 7 dana (BR-47); istekao poziv: „Pozivi u domaćinstvo važe 7 dana. Zamoli osobu koja te je pozvala za novi."
  - Već član: „Već si član ovog domaćinstva."; iskorišćen poziv: „Ovaj poziv je već iskorišćen."
  - Vlasnik može da opozove poslati poziv („Poziv je opozvan.").
  - Član koji izađe ili bude uklonjen gubi pristup, a njegovi unosi ostaju (FR-30).
- **Postuslov:** član ima pristup izabranim ljubimcima sa pravima člana.
- **Povezano:** FR-26 … FR-32 · BR-19 … BR-28, BR-47, BR-52 · ekrani S13, S14, S03, S07, S08, S10
- **Pokriveno scenarijima:** TS-HH (E-14: TS-JOB)

## UC-06 — Početak, otkazivanje i istek Premium-a (CAP-05)

> ⏳ Kupovina, probni period i obnova čekaju **Step 31** (plaćanje); obaveštenja o isteku i prelazak na Free čekaju **Step 30**. Sada se može testirati: Premium stranica u stanju „Plaćanje uskoro dostupno", status pretplate u profilu i „Otkaži obnovu" na seed Premium nalogu.

- **Akter:** P1 Vlasnik ljubimca
- **Preduslovi:** prijavljen, mejl potvrđen.
- **Glavni tok:**
  1. Vlasnik pokreće Premium sa 7 dana besplatne probe (FR-37) na stranici Premium (S17), mesečno ili godišnje.
  2. Pretplata se automatski obnavlja.
  3. Vlasnik otkazuje obnovu u profilu (S18, „Otkaži obnovu") — Premium traje do kraja plaćenog perioda (FR-38).
  4. Stižu obaveštenja o isteku 30, 7 i 1 dan pre kraja (FR-25); preostali dani se uvek vide u profilu.
  5. Po isteku važe pravila prelaska na Free (FR-39): sve ostaje vidljivo, novo preko limita je blokirano.
- **Alternativni tokovi i izuzeci:**
  - **E-15** — korisnik koji je već imao probu → nema probe, naplata odmah (dugme „Pretplati se"; tekst „Probni period je već iskorišćen na ovom nalogu…").
  - **E-06** — WhatsApp/Viber podsetnici posle isteka stižu mejlom i push-om.
  - Korisnik koji se nikad nije pretplatio u S18 vidi „Free plan" i dugme „Pogledaj Premium".
  - Nalog azila ili odgajivačnice koji otvori `/premium` biva preusmeren na `/organizacija`.
  - Plaćanje nije uključeno → S17 prikazuje „Plaćanje uskoro dostupno", cene su sakrivene („Cena će biti objavljena uskoro.").
- **Postuslov:** korisnik je na Free planu, a svi podaci su vidljivi.
- **Povezano:** FR-25, FR-36 … FR-39 · BR-07 … BR-10, BR-16 · ekrani S17, S18
- **Pokriveno scenarijima:** TS-PREM, TS-JOB

## UC-07 — Brisanje naloga (CAP-05)

- **Akter:** bilo koji korisnik
- **Preduslovi:** prijavljen.
- **Glavni tok:**
  1. Korisnik u „Moji podaci" (S19) bira „Preuzmi sve moje podatke" (FR-41); kad je arhiva spremna stiže mejl „Tvoji podaci su spremni" (⏳ arhiva — Step 30a).
  2. Korisnik bira „Obriši nalog" i potvrđuje (FR-40); nalog se isključuje i stiže mejl „Nalog će biti obrisan {datum}".
  3. Posle 30 dana nalog se trajno briše sa svim podacima (⏳ Step 30).
- **Alternativni tokovi i izuzeci:**
  - **E-16** — korisnik se prijavi u roku od 30 dana i klikne „Otkaži brisanje" → nalog je vraćen nepromenjen.
  - **E-14** — korisnik je vlasnik domaćinstva → u S19 piše ko nasleđuje: „Domaćinstvo ostaje: deljeni ljubimci prelaze na člana koji se prvi pridružio — {ime}."
  - Priprema arhive nije uspela → „Priprema arhive nije uspela. Pokušaj ponovo."
  - Dok je brisanje zakazano, kartica za izvoz je sakrivena.
- **Postuslov:** nalog i lični podaci su uklonjeni.
- **Povezano:** FR-31, FR-40, FR-41 · BR-27, BR-31, BR-46 · NFR-06 · ekran S19
- **Pokriveno scenarijima:** TS-PREM, TS-JOB

## UC-08 — Udomljavanje iz azila sa predajom kartona (CAP-06)

> ⏳ Odobrenje azila iz admin dela čeka **Step 28**. Do tada Ivana ručno odobrava test azil; ostatak toka je spreman.

- **Akter:** P3 Azil (Admin); budući udomitelj (vlasnik)
- **Preduslovi:** azil je odobren od strane operatera (FR-42).
- **Glavni tok:**
  1. Azil beleži prijem životinje u S20: datum\*, način dolaska\* (pronađena / predao vlasnik / oduzeta / drugo), mesto pronalaska, napomena (FR-45).
  2. Azil postavlja status „Za udomljavanje" i životinja se pojavljuje na javnoj stranici azila `/o/…` (S23) sa javnim poljima — bez detaljnog kartona (FR-46).
  3. Udomitelj (prijavljen) šalje zahtev: ime\*, telefon\*, mejl\* i poruka (FR-47).
  4. Admin azila u S21 prihvata zahtev → životinja postaje „Rezervisan", udomitelj dobija mejl „Zahtev prihvaćen: {ljubimac}".
  5. Azil označava „Udomljen" i šalje karton mejlom („Pošalji karton") (FR-50).
  6. Udomitelj otvara link (S14), prihvata i dobija ceo karton sa prilozima; azil zadržava kopiju samo za čitanje.
- **Alternativni tokovi i izuzeci:**
  - **E-17** — posetilac bez naloga pokušava zahtev → mora prvo da napravi nalog / prijavi se.
  - **E-18** — zahtev odbijen → udomitelj dobija mejl „Odgovor na zahtev: {ljubimac}".
  - **E-19** — poziv za karton nije prihvaćen u roku od 30 dana → ističe; azil može ponovo da pošalje.
  - **E-20** — primalac je na Free planu sa zauzetim mestom → blokirano, Premium ponuda.
  - Azil koji čeka odobrenje vidi baner i sve samo za čitanje.
  - Karton može da primi samo nalog vlasnika: „Karton može da primi samo nalog vlasnika ljubimca."
  - Odbijen karton: „Karton je odbijen — možeš da ga pošalješ ponovo."
  - Volonter vidi zahteve samo za čitanje (ne odlučuje — BR-34).
- **Postuslov:** udomitelj je vlasnik kartona; azil čuva kopiju samo za čitanje („Karton je predat novom vlasniku. Ovo je kopija samo za čitanje.").
- **Povezano:** FR-42, FR-45 … FR-47, FR-50, FR-51 · BR-32 … BR-39 · ekrani S20, S21, S23, S14
- **Pokriveno scenarijima:** TS-ORG (odobrenje azila: TS-ADM)

## UC-09 — Leglo i prodaja kod odgajivača (CAP-06)

- **Akter:** P4 Odgajivač
- **Preduslovi:** aktivan odgajivački plan.
- **Glavni tok:**
  1. Odgajivač u Leglima (S22) beleži leglo: majka\*, otac (ime), datum okota\*, broj mladunaca (1–20) (FR-48); svako mladunče dobija svoj karton.
  2. Upisuje cenu po mladunčetu; dostupni mladunci se prikazuju javno sa cenom (S23) (FR-49).
  3. Kupac (prijavljen) šalje upit: ime\*, telefon\*, mejl\*, poruka; odgajivač u S21 prihvata → mladunče „Rezervisano", kupac dobija mejl.
  4. Po završenoj prodaji mladunče postaje „Prodato" i odgajivač šalje karton (FR-50).
- **Alternativni tokovi i izuzeci:**
  - **E-18** — upit odbijen → kupac dobija mejl „Odgovor na upit: {ljubimac}".
  - **E-19** — karton nije prihvaćen u 30 dana → ističe, može ponovo.
  - **E-20** — kupac na Free planu sa zauzetim mestom → Premium ponuda.
  - **E-21** — odgajivački plan nije aktivan → funkcije nisu dostupne; baner „Odgajivački plan nije aktivan — sve možeš samo da pregledaš."
  - Broj mladunaca van 1–20 → „Upiši broj od 1 do 20."; bez cene → „Cena nije upisana".
- **Postuslov:** kupac je vlasnik kartona mladunčeta.
- **Povezano:** FR-42, FR-48 … FR-51 · BR-11, BR-36 … BR-39 · ekrani S22, S21, S23, S14
- **Pokriveno scenarijima:** TS-ORG

## UC-10 — Kontakt sa partnerom (CAP-07)

> ⏳ Unos i izmena partnera i statistika klikova u admin delu čekaju **Step 28**. Prikaz partnera, brze akcije i predlog veterinara su spremni (sa partnerima iz test podataka).

- **Akter:** P1 Vlasnik; Operater
- **Preduslovi:** operater je uneo aktivnog partnera (FR-57).
- **Glavni tok:**
  1. Vlasnik otvara Partnere (S24) ili dobija predlog veterinara u kartonu ljubimca koji nema „moj veterinar" (S03) (FR-52, FR-56).
  2. Vlasnik bira brzu akciju: Pozovi, Poruka (preko kanala koji je partner izabrao), Mejl ili Sajt (FR-55).
  3. Klik se broji po partneru i akciji (FR-58) i vidi se u admin delu.
- **Alternativni tokovi i izuzeci:**
  - **E-22** — korisnik ne dozvoli lokaciju → partneri po udaljenosti od grada iz profila; bez grada i lokacije: „Dodaj grad u profil" sa dugmetom „Otvori profil".
  - **E-23** — partneru je prošao datum „plaćeno do" → automatski se sakriva.
  - **E-24** — partner nema mejl, sajt ili kanal za poruke → ta brza akcija se ne prikazuje.
  - Istaknuti partneri su prvi (najviše 3 po tipu u gradu), zatim ostali po udaljenosti (BR-41).
  - Pet shopovi, grooming saloni i pet hoteli se ne predlažu u kartonu — samo u Partnerima (BR-43).
- **Postuslov:** vlasnik je kontaktirao partnera; operater vidi klik.
- **Povezano:** FR-52 … FR-58 · BR-40 … BR-44 · ekrani S24, S25, S03, S26
- **Pokriveno scenarijima:** TS-PART (admin deo: TS-ADM)

## UC-11 — Poklanjanje stvari (CAP-08)

> ⏳ Čeka **Step 28b** (oglasi) i **Step 28c** (poruke, obaveštenja).

- **Akter:** P6 Član zajednice (autor); P6 Član zajednice (zainteresovani)
- **Preduslovi:** obojica su prijavljeni; autor nije isključen iz Šape pomoći.
- **Glavni tok:**
  1. Autor objavljuje oglas „Poklanjam" sa fotografijama (S34) (FR-63); oglas je aktivan 30 dana.
  2. Zainteresovani pronalazi oglas filterima (S32) (FR-61) i otvara ga (S33) (FR-62).
  3. Zainteresovani šalje poruku („Pošalji poruku") (FR-68); autor dobija mejl i push (FR-69).
  4. Dogovaraju predaju u razgovoru (S36).
  5. Autor označava oglas kao rešen — „Poklonjeno" (FR-64).
- **Alternativni tokovi i izuzeci:**
  - **E-28** — Free autor već ima 3 aktivna oglasa → blokirano, Premium ponuda.
  - **E-30** — više od 5 fotografija → blokirano sa porukom.
  - **E-31** — oglas istekne pre rešavanja → postaje „Istekao", nestaje sa liste, autor dobija mejl; može ga produžiti iz „Moji oglasi".
  - **E-32** — zainteresovani nije prijavljen → traži se prijava/registracija, pa povratak na oglas.
  - **E-34** — autor je blokirao zainteresovanog → slanje odbijeno: „Ovoj osobi trenutno ne možeš da pišeš."
  - **E-33** — korisnik ne može da piše na svoj oglas ni da započne razgovor na neaktivnom oglasu.
  - Ponovni klik na „Pošalji poruku" otvara postojeći razgovor (BR-61).
  - Poruka: samo tekst, do 2.000 znakova, prazna se ne šalje.
- **Postuslov:** oglas je rešen i nije na javnoj listi; razgovor ostaje dostupan obojici.
- **Povezano:** FR-61 … FR-65, FR-67 … FR-69 · BR-54 … BR-57, BR-59 … BR-61 · NFR-11 · ekrani S32 … S37, S12
- **Pokriveno scenarijima:** TS-SAPA

## UC-12 — Donacija za potrebu azila (CAP-08)

> ⏳ Čeka **Step 28b** (oglasi, podaci za donacije) i **Step 28c** (poruke).

- **Akter:** P3 Azil (Admin ili Volonter); P6 Član zajednice
- **Preduslovi:** azil je odobren (FR-42); Admin azila je uneo podatke za donacije (FR-72, S29 „Donacije").
- **Glavni tok:**
  1. Član azila objavljuje oglas „Potreba", npr. kategorija „Lekovi i nega" za mačke (FR-63).
  2. Član zajednice otvara oglas i klikne „Doniraj" (FR-66).
  3. Vidi broj računa, link za uplatu, adresu i vreme za donošenje — i donira van aplikacije.
  4. Po želji šalje poruku azilu da dogovori donošenje (FR-68).
  5. Azil označava potrebu kao rešenu — „Donirano" (FR-64).
- **Alternativni tokovi i izuzeci:**
  - **E-29** — korisnik koji nije član odobrenog azila ne vidi vrstu „Potreba"; kategorija „Lekovi i nega" za druge vrste oglasa je blokirana.
  - **E-32** — donator nije prijavljen → traži se prijava, pa povratak na oglas.
  - Azil bez podataka za donacije → „Doniraj" prikazuje poruku da azil još nije dodao podatke, uz „Pošalji poruku".
  - Link za uplatu koji nije ispravan `https://` URL → čuvanje blokirano (FR-72).
  - Volonter podatke za donacije samo vidi.
  - Novac nikad ne prolazi kroz aplikaciju (BR-58).
- **Postuslov:** novac nije prošao kroz aplikaciju; potreba je rešena.
- **Povezano:** FR-42, FR-63, FR-64, FR-66, FR-68, FR-72 · BR-54, BR-55, BR-58 · ekrani S29, S33, S34, S35, S36
- **Pokriveno scenarijima:** TS-SAPA, TS-ORG

## UC-13 — Moderacija prijave (CAP-08)

> ⏳ Čeka **Step 28c**.

- **Akter:** P6 Član zajednice (prijavljuje); Operater
- **Preduslovi:** oglas ili korisnik je prijavljen (FR-70).
- **Glavni tok:**
  1. Korisnik bira „Prijavi" sa razlogom „Prevara" (FR-70) i vidi potvrdu.
  2. Operater otvara „Moderacija" u adminu (S26) i pregleda prijavu (FR-71) — otvorene prijave su poređane od najstarije.
  3. Operater sakriva oglas i isključuje autora iz Šape pomoći (uz opcioni „Razlog za korisnika").
  4. Autor dobija mejl („Oglas je sakriven…" / „Nalog je isključen iz Šape pomoći"); prijava je označena kao obrađena.
- **Alternativni tokovi i izuzeci:**
  - Operater odbacuje prijavu → označena kao odbačena, ništa drugo se ne menja.
  - Operater kasnije vraća oglas ili pristup korisniku → sve se vraća u prethodno stanje.
  - **E-35** — isključeni korisnik pokušava da objavi, produži ili pošalje poruku → odbijeno sa porukom; njegovi oglasi ostaju sakriveni; stare poruke može da čita.
  - Ponovna prijava istog oglasa/korisnika dok je prethodna otvorena → „Već si prijavio/la ovaj oglas." / „Već si prijavio/la ovog korisnika."
  - Razlog „Drugo" traži napomenu (do 500 znakova).
- **Postuslov:** prijavljeni sadržaj više nije vidljiv; prijava je zatvorena sa zabeleženom akcijom.
- **Povezano:** FR-70, FR-71 · BR-59, BR-60 · ekrani S33, S36, S37, S26
- **Pokriveno scenarijima:** TS-SAPA, TS-ADM

---

## Dodatni QA slučajevi (izvedeni iz FR-ova)

## UC-QA-01 — Registracija, potvrda mejla, prijava i jezik (CAP-05)

- **Akter:** novi korisnik; registrovani korisnik
- **Preduslovi:** korisnik nema nalog (za registraciju) / ima nalog (za prijavu).
- **Glavni tok:**
  1. Korisnik otvara Registraciju (S15), bira tip naloga (Vlasnik / Azil / Odgajivačnica) i jezik SR/EN (FR-33, FR-35).
  2. Unosi mejl i lozinku (najmanje 8 znakova) ili bira „Nastavi sa Google-om"; za Azil/Odgajivačnicu još naziv organizacije\*, grad\* i opciono PIB. Registracija je vezana za Uslove korišćenja (S31).
  3. Vidi stanje „Proveri mejl"; otvara mejl za potvrdu (lokalno u Mailpit-u) i potvrđuje adresu — bez potvrde aplikacija se ne može koristiti.
  4. Prijavljuje se (S16) i dolazi do svojih podataka; posle odjave podaci se više ne vide (FR-34).
  5. Menja ime, grad i jezik u profilu (S18); ceo interfejs prelazi na izabrani jezik.
- **Alternativni tokovi i izuzeci:**
  - Zaboravljena lozinka → mejl sa linkom → Nova lozinka (S28): lozinke se ne poklapaju; link istekao ili već iskorišćen; uspeh → „Prijavi se".
  - Azil posle registracije: napomena „Azil odobravamo ručno, obično u roku od 2 dana." i stanje čekanja odobrenja.
  - Pogrešna lozinka / nepostojeći nalog → poruka o grešci na S16.
  - Javne strane Politika privatnosti (S30) i Uslovi korišćenja (S31) dostupne su bez prijave iz podnožja.
- **Postuslov:** korisnik ima potvrđen nalog izabranog tipa i radi na izabranom jeziku.
- **Povezano:** FR-33, FR-34, FR-35 · BR-29, BR-30 · NFR-05 · ekrani S15, S16, S28, S18, S30, S31
- **Pokriveno scenarijima:** TS-AUTH

## UC-QA-02 — Terapija i beleženje doza (CAP-01, CAP-03)

- **Akter:** P1 Vlasnik; P2 Član domaćinstva
- **Preduslovi:** aktivan ljubimac.
- **Glavni tok:**
  1. Vlasnik u kartonu bira „Dodaj terapiju" (S27): tip\* (lek / dehelmintizacija / zaštita od buva i krpelja / drugo), naziv\*, doza, učestalost (na X sati ili dana), početak\*, kraj ili trajanje, napomena (FR-06).
  2. Aplikacija pravi podsetnike za svaku dozu do kraja terapije; prva doza je na dan početka u 08:00 (ili sledeći pun sat ako je prošlo) (BR-49).
  3. Kad dođe vreme doze, vlasnik ili član klikne „Doza data" — beleži se doza sa vremenom i osobom.
- **Alternativni tokovi i izuzeci:**
  - Član domaćinstva može da označi „Doza data", ali ne i da menja terapiju (FR-28).
  - Izmena/brisanje terapije kroz meni reda („Izmeni" / „Obriši" → „Obrisati unos?").
  - Doze stižu tačno u zadato vreme, bez vremena unapred (BR-13).
- **Postuslov:** terapija i dnevnik doza su sačuvani.
- **Povezano:** FR-06, FR-20, FR-24, FR-28 · BR-12, BR-13, BR-49 · ekrani S03, S27, S10
- **Pokriveno scenarijima:** TS-PET, TS-REM

## UC-QA-03 — Pregled kod veterinara sa prilozima i PDF izvoz (CAP-01)

- **Akter:** P1 Vlasnik
- **Preduslovi:** aktivan ljubimac.
- **Glavni tok:**
  1. Vlasnik dodaje pregled (S05): datum\*, ambulanta/veterinar, razlog\*, nalaz, preporuke, cena, datum kontrole, prilozi (FR-07, FR-08).
  2. Dodaje slike ili PDF ≤ 10 MB; datum kontrole pravi podsetnik.
  3. Beleži težinu (kg ili g po ljubimcu) i vidi istoriju kao trend (FR-03, FR-04); promena jedinice preračunava sve unose (BR-50).
  4. Premium vlasnik izvozi ceo karton kao PDF („Izvezi PDF") — fajl `{ime}-karton.pdf` (FR-10).
- **Alternativni tokovi i izuzeci:**
  - **E-04** — 11. prilog na Free → Premium ponuda; fajl > 10 MB ili pogrešnog tipa → poruka.
  - **E-25** — Free korisnik pokušava PDF izvoz → Premium ponuda.
  - Prilog koji se ne može otvoriti → „Fajl nije dostupan."; neuspelo otpremanje → „{fajl} nije sačuvan. Pokušaj ponovo."
  - Pretraga ljubimaca po imenu ne razlikuje velika/mala slova ni kvačice (FR-59).
- **Postuslov:** pregled i prilozi su sačuvani; PDF sadrži ceo karton.
- **Povezano:** FR-03, FR-04, FR-07, FR-08, FR-10, FR-59 · BR-01, BR-05, BR-50 · ekrani S03, S05, S01
- **Pokriveno scenarijima:** TS-PET

## UC-QA-04 — Dnevnik nege i podsetnici za obroke (CAP-02)

- **Akter:** P1 Vlasnik; P2 Član domaćinstva
- **Preduslovi:** aktivan ljubimac.
- **Glavni tok:**
  1. U Dnevniku (S07), tab Ishrana: datum i vreme\*, vrsta\* (suva / vlažna / poslastica / domaća / drugo), naziv/brend, količina u gramima, napomena (FR-14).
  2. Tab Stolica: datum i vreme\*, konzistencija\* (normalna / meka / dijareja / tvrda), krv ili sluz (da/ne), napomena (FR-16).
  3. U kartici „Podsetnici za obroke" postavlja vremena (npr. 08:00 i 18:00) i dane (FR-15).
- **Alternativni tokovi i izuzeci:**
  - Vreme u budućnosti → „Vreme ne može biti u budućnosti."
  - Nema limita ni na Free ni na Premium (BR-04).
  - Raspored obroka može da se ukloni (sačuvaj bez vremena).
- **Postuslov:** unosi su sačuvani; podsetnici za obroke stižu tačno u zadato vreme.
- **Povezano:** FR-14, FR-15, FR-16, FR-28 · BR-04, BR-13 · ekran S07
- **Pokriveno scenarijima:** TS-CARE, TS-REM

## UC-QA-05 — Tim organizacije i prava volontera (CAP-06)

- **Akter:** Admin organizacije; Volonter
- **Preduslovi:** organizacija je aktivna (azil odobren / odgajivački plan aktivan).
- **Glavni tok:**
  1. Admin u S20 → tab Tim poziva osobu mejlom sa ulogom Admin ili Volonter (FR-43); poziv važi 7 dana.
  2. Pozvani otvara poziv (S14) — vidi naziv organizacije, ulogu i napomenu da zadržava svoj nalog i ljubimce (BR-53) — i bira „Pridruži se timu".
  3. Volonter dodaje i menja zdravstvene unose i negu životinja.
  4. Admin menja javni profil (S29): opis, telefon, mejl, sajt (`https://`), logo (FR-60).
- **Alternativni tokovi i izuzeci:**
  - Tim ima najviše 20 ljudi (uključujući poslate pozive).
  - Volonter ne može da briše životinje, odlučuje o zahtevima/upitima, upravlja timom ni menja javni profil (baner „…menjaju samo admini…").
  - Poslednji admin ne može sebi da oduzme ulogu admina.
  - Organizacija ne može imati lične ljubimce (BR-33).
- **Postuslov:** tim radi sa ispravnim pravima.
- **Povezano:** FR-43, FR-44, FR-60 · BR-34, BR-46, BR-47, BR-53 · ekrani S20, S14, S29
- **Pokriveno scenarijima:** TS-ORG

## UC-QA-06 — Operater: odobravanje azila i partneri (CAP-06, CAP-07)

> ⏳ Čeka **Step 28** (Moderacija — Step 28c).

- **Akter:** Operater
- **Preduslovi:** prijavljen nalog sa ulogom operatera (`ana.markovic`).
- **Glavni tok:**
  1. Operater otvara `/admin` (S26) → „Azili na čekanju" i odobrava ili odbija azil (FR-57); azil dobija mejl „Azil je odobren: …" ili „Azil nije odobren: …".
  2. U tabu Partneri dodaje/menja partnera (sva polja iz FR-54, istaknut, plaćeno do, koordinate).
  3. U tabu Statistika vidi klikove po partneru i akciji (FR-58).
  4. U tabu Kanali uključuje/isključuje Viber (BR-14b).
- **Alternativni tokovi i izuzeci:**
  - Neprijavljen korisnik na `/admin` → prijava; prijavljen bez uloge operatera → preusmeren na `/ljubimci`.
  - Adresa partnera nije pronađena → „Adresa nije pronađena. Upiši koordinate ručno i sačuvaj ponovo."
  - Četvrti istaknuti partner iste vrste u gradu → „Već postoje 3 istaknuta partnera ove vrste u ovom gradu."
  - Prošao datum „plaćeno do" → partner se automatski sakriva.
- **Postuslov:** azil je aktiviran ili obavešten; imenik partnera je ažuran.
- **Povezano:** FR-42, FR-57, FR-58, FR-71 · BR-14b, BR-40, BR-41 · ekran S26
- **Pokriveno scenarijima:** TS-ADM

## UC-QA-07 — Povezivanje WhatsApp-a (CAP-03)

> ⏳ Čeka **Step 29**. Lokalno se WhatsApp poruke ne šalju — kod se vidi samo u logu.

- **Akter:** P1 Vlasnik (Premium)
- **Preduslovi:** Premium nalog.
- **Glavni tok:**
  1. U S12 → „Kanali" unosi broj telefona i bira „Pošalji kod".
  2. Unosi primljeni kod → stanje „Povezano".
  3. Uključuje WhatsApp za željene tipove podsetnika; brojač pokazuje „N / 30 poruka ovog meseca".
  4. Podsetnik stiže na WhatsApp; odgovor „Urađeno" označava ga kao urađen („Označeno kao urađeno. …").
  5. Po želji „Prekini vezu".
- **Alternativni tokovi i izuzeci:**
  - Pogrešan ili istekao kod → „Kod nije tačan ili je istekao."
  - Previše pokušaja → „Previše pokušaja. Pokušaj ponovo za {n} min."
  - Broj na koji se ne može poslati → „Na ovaj broj ne možemo da pošaljemo WhatsApp poruku."
  - Posle 30 poruka u mesecu podsetnici idu mejlom i push-om (BR-14a).
  - Free korisnik vidi WhatsApp zaključan (E-09).
- **Postuslov:** broj je povezan i podsetnici stižu na WhatsApp.
- **Povezano:** FR-23, FR-24, FR-25 · BR-14, BR-14a, BR-16 · ekran S12
- **Pokriveno scenarijima:** TS-WA

## UC-QA-08 — Noćni poslovi i backup (CAP-03, CAP-04, CAP-05, CAP-06)

> ⏳ Čeka **Step 30** i **Step 30a**. Ovo su pozadinski poslovi (noću, oko 03:00 po srpskom vremenu); testiraju se uz Ivaninu pomoć (podešavanje datuma u test podacima).

- **Akter:** sistem
- **Preduslovi:** postoje nalozi u odgovarajućem stanju (Premium pred istek, zakazano brisanje, vlasnik domaćinstva, poslednji admin organizacije).
- **Glavni tok:**
  1. Obaveštenja o isteku Premium-a 30, 7 i 1 dan pre kraja, svako samo jednom (FR-25).
  2. Po isteku Premium-a: prelazak na Free, domaćinstvo samo za čitanje, WhatsApp → mejl i push (FR-39, FR-32, BR-16).
  3. Nalozi kojima je prošlo 30 dana od zahteva za brisanje se trajno brišu (FR-40, NFR-06).
  4. Domaćinstvo obrisanog vlasnika prelazi na člana koji se prvi pridružio (FR-31); organizacija bez admina dobija novog admina ili se briše (BR-46).
  5. Arhiva izvoza podataka se pravi i stiže mejl „Tvoji podaci su spremni" sa linkom (FR-41); baza se svake noći čuva kao backup.
- **Alternativni tokovi i izuzeci:**
  - Novi naslednik bez Premium-a → domaćinstvo samo za čitanje (BR-27).
  - Arhiva veća od dozvoljenog → priprema ne uspeva, korisnik vidi grešku i može ponovo.
- **Postuslov:** stanja naloga, pretplata i domaćinstava su usklađena sa pravilima.
- **Povezano:** FR-25, FR-31, FR-32, FR-39, FR-40, FR-41 · BR-09, BR-16, BR-27, BR-28, BR-31, BR-46 · NFR-06 · ekrani S18, S19, S13
- **Pokriveno scenarijima:** TS-JOB
