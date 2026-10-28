# Šablon prijave greške — GitHub Issue

> Svaka greška pronađena tokom testiranja prijavljuje se kao **jedan GitHub Issue po grešci**. Ako u jednom scenariju nađeš dve različite greške, otvori dva Issue-a.

## 1. Šablon (kopiraj u novi Issue)

**Naslov:** `[TS-OBLAST-NNN] Kratak opis šta ne radi — gde`

Primeri dobrog naslova:
- `[TS-PET-007] Free korisnik može da doda 11. prilog — S05 Novi pregled`
- `[TS-HH-004] Član domaćinstva vidi dugme „Dodaj vakcinu" — S03 Karton`
- `[TS-AUTH-012] Posle prebacivanja na EN ostaje srpski tekst „Proveri mejl" — S15`

Telo Issue-a:

```markdown
## Okruženje
- [ ] Lokalno (http://localhost:3000)
- [ ] Produkcija (adresa: ___)
- Datum i vreme testa: __. __. 2026. u __:__
- Verzija / poslednji commit (ako je poznat): ___

## Nalog
- Mejl naloga: ___ (npr. marko.jovanovic@mojljubimac.test)
- Tip i stanje: Vlasnik Free / Vlasnik Premium / Član domaćinstva / Azil Admin / Azil Volonter / Odgajivačnica Admin / Odgajivačnica Volonter / Operater / Posetilac (nije prijavljen)
- Jezik interfejsa: SR / EN

## Scenario
- ID scenarija: TS-___-___
- Zahtevi: FR-__, BR-__, E-__ (iz zaglavlja scenarija)
- Ekran: S__ — ruta `/...`

## Koraci za ponavljanje
1. ...
2. ...
3. ...

## Očekivano
Šta je trebalo da se desi (prepiši iz scenarija; tačan tekst poruke u navodnicima „…").

## Dobijeno
Šta se zaista desilo (tačan tekst poruke, ako postoji, u navodnicima „…").

## Snimak ekrana / video
(prevuci sliku ovde)

## Pregledač i uređaj
- Pregledač i verzija: Chrome ___ / Firefox ___ / Safari ___ / Edge ___
- Uređaj: računar / telefon (model) / prikaz za mobilni u alatima pregledača
- Širina ekrana: ___ px (npr. 375 px, 1280 px)
- Operativni sistem: ___

## Učestalost
- [ ] Uvek  - [ ] Ponekad (__ od __ pokušaja)  - [ ] Jednom, ne mogu da ponovim

## Prioritet
P1 / P2 / P3 (vidi definicije u 03-sablon-prijave-greske.md)

## Dodatno (opciono)
Greške iz konzole pregledača (F12 → Console), privremeno zaobilazno rešenje, povezani Issue-i.
```

## 2. Prioriteti

| Prioritet | Značenje | Kada | Primeri iz ove aplikacije |
|---|---|---|---|
| **P1 — kritično** | Mora da se ispravi pre bilo čega drugog; blokira testiranje ili javno pokretanje | Glavni tok ne radi i nema zaobilaznog puta; gubitak ili oštećenje podataka; korisnik vidi ili menja tuđe podatke; Free limit može da se zaobiđe tako da se dobije plaćena funkcija; aplikacija pada ili prikazuje praznu stranu | Registracija ili prijava ne radi; čuvanje vakcine briše postojeće vakcine; Marko otvara karton Ivaninog ljubimca preko adrese `/ljubimci/[id]`; javni link trenutka prikazuje zdravstvene podatke; član domaćinstva može da obriše ljubimca; volonter može da prihvati zahtev za udomljavanje; podsetnik se ne pravi posle unosa vakcine sa datumom sledeće doze |
| **P2 — važno** | Funkcija ne radi kako je opisano, ali postoji zaobilazni put ili je pogođen manji deo korisnika | Pogrešna poruka o grešci ili je nema; pogrešan brojač ili pogrešno ponašanje na granici limita; validacija ne radi kako treba; preveden ekran ima ceo blok na pogrešnom jeziku; ekran se ne može koristiti samo tastaturom; na 375 px se sadržaj seče ili ima horizontalni skrol | Free korisnik pri 2. ljubimcu dobija opštu grešku umesto Premium ponude; brojač „7 / 10 priloga" ne raste posle dodavanja; mejl „Urađeno" radi i posle 24 sata; dugme „Dodaj ljubimca" nije dostupno tasterom Tab; na telefonu se tabela životinja ne vidi cela |
| **P3 — sitno** | Kozmetika i sitnice koje ne utiču na rad | Slovna greška, pogrešan padež ili kvačica, nedosledan izraz, poravnanje, razmak, boja koja odstupa od dizajna, pogrešan format datuma ili broja | „Vakcina sacuvana" bez kvačice; ime ljubimca promenjeno po padežu („Luni"); datum prikazan kao `2026-10-19` umesto `19. 10. 2026.`; ikonica nije poravnata sa tekstom |

Ako nisi sigurna između dva prioriteta, izaberi viši i napiši zašto — Ivana će ga promeniti ako treba.

## 3. Labele

| Labela | Obavezna | Kada |
|---|---|---|
| `bug` | **Da** | Svaka prijava greške |
| `P1` / `P2` / `P3` | **Da** — tačno jedna | Prema tabeli prioriteta |
| `oblast:AUTH`, `oblast:PET`, `oblast:REM`, `oblast:CARE`, `oblast:HH`, `oblast:PREM`, `oblast:ORG`, `oblast:PART`, `oblast:ADM`, `oblast:SAPA`, `oblast:WA`, `oblast:JOB` | Ako labela postoji u repozitorijumu | Oblast scenarija, radi lakšeg filtriranja |
| `pitanje` | Ako postoji | Nisi sigurna da li je greška ili namerno ponašanje — dokumentacija i aplikacija se razlikuju ili je dokumentacija nejasna |

## 4. Kako napraviti dobar snimak ekrana

1. **Ceo kontekst, ne samo isečak.** Neka se vide adresa u pregledaču (ruta), naslov ekrana i deo sa greškom.
2. **Obeleži grešku.** Zaokruži ili strelicom pokaži mesto (Windows: Win + Shift + S pa olovka; macOS: Cmd + Shift + 4, pa uređivanje u Preview-u).
3. **Snimi „pre" i „posle"** kada greška nastaje posle akcije (npr. brojač pre i posle dodavanja priloga).
4. **Za tok sa više koraka snimi kratak video** (Windows: Win + Alt + R / Xbox Game Bar; macOS: Cmd + Shift + 5) i priloži ga — GitHub prima `.mp4` i `.mov`.
5. **Za prikaz na telefonu** u alatima pregledača (F12 → ikonica telefona) postavi širinu **375 px** i neka se na snimku vidi izabrana širina.
6. **Ako postoji crvena greška u konzoli** (F12 → Console), snimi i nju ili kopiraj tekst u Issue.
7. **Za mejlove** napravi snimak poruke iz Mailpit-a (http://127.0.0.1:54324) — sa naslovom, telom i dugmadima.
8. **Bez ličnih podataka.** Na produkciji zamagli prave mejl adrese, telefone i imena koji nisu test podaci.

## 5. Šta NE prijavljivati (poznata ograničenja)

Sledeće je poznato i namerno u trenutnom stanju (26. 10. 2026.). Ne otvaraj Issue za ovo — osim ako se ponašanje razlikuje od opisanog ovde.

| Ograničenje | Šta ćeš videti | Kada se menja |
|---|---|---|
| **Plaćanje nije uključeno** | Na Premium stranici (S17) „Plaćanje uskoro dostupno", cene sakrivene („Cena će biti objavljena uskoro."), dugme onemogućeno. Premium se ne može kupiti; Premium imaju samo seed nalozi | Step 31 (čeka izbor provajdera plaćanja i cene) |
| **Cene su privremene** | Cene Premium-a i odgajivačkog plana nisu konačne | OQ-03 |
| **WhatsApp se ne šalje** | Premium korisnik u S12 vidi WhatsApp kao „Uskoro dostupno"; lokalno se WhatsApp poruke nikad ne šalju (samo log) | Step 29 |
| **Push se lokalno ne šalje** | Lokalno se push obaveštenja ne isporučuju — samo zapis u logu | Na produkciji |
| **Push na iPhone-u** | Push radi samo ako je sajt dodat na početni ekran (prikazuje se savet „Dodaj na početni ekran") | Ograničenje iPhone-a, ne menja se |
| **Viber ne postoji kao opcija** | Viber se nigde ne nudi | Kad ga operater uključi (BR-14b) |
| **Mejlovi lokalno** | Mejlovi za potvrdu naloga i reset lozinke stižu u Mailpit, ne u pravo sanduče. Ako se mejl aplikacije (podsetnik, poziv) ne pojavi u Mailpit-u, pitaj Ivanu — bez lokalnog ključa za slanje aplikacija mejl samo upisuje u log | — |
| **Pravne strane bez teksta** | S30 i S31 imaju privremeni tekst „Tekst dostavlja vlasnik (OQ-15)." | OQ-15 |
| **Admin deo ne postoji** | `/admin` (S26) još nije napravljen; odobrenje azila radi Ivana ručno | Step 28 |
| **Šapa pomoći ne postoji** | Rute `/sapa-pomoci`, `/poruke`, `/korisnik/…` još ne rade; nema kartice „Donacije" u S29 ni kartice „Poruke" u S12 | Step 28a–28c |
| **Noćni poslovi ne rade** | Premium ne ističe sam, ne stižu obaveštenja 30/7/1 dan, nalog zakazan za brisanje se posle 30 dana ne briše, domaćinstvo se ne nasleđuje automatski | Step 30 |
| **Arhiva izvoza podataka** | „Preuzmi sve moje podatke" može da ostane u stanju pripreme bez mejla sa linkom | Step 30a |
| **Organizacijske životinje bez automatskih podsetnika** | Životinje azila/odgajivačnice ne dobijaju automatske podsetnike | Namerno u v1 (BR-51) |
| **Samo jedno domaćinstvo u prikazu** | Korisnik koji je član više domaćinstava vidi samo podrazumevano | Kasnije (dogovoreno) |
| **Šapa pomoći — poruke nisu u realnom vremenu** | Nove poruke i brojači se vide tek posle osvežavanja stranice | Namerno (NFR-11) — važi i posle Step 28c |
| **Kartice ljubimaca na S01 bez težine** | Na početnoj nema „Težina" ni „Karton ažuriran" | Namerno (odluka vlasnice) |

Ako nešto od ovoga ipak deluje pogrešno (npr. vidi se Viber, ili S17 nudi kupovinu), **prijavi** — to znači da se aplikacija ne ponaša kako je dogovoreno.
