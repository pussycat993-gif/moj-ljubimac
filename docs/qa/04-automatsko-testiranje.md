# Automatsko testiranje — uputstvo za podešavanje i rad

Ovo uputstvo vodi od praznog Windows računara do pokretanja svih automatskih testova projekta Moj Ljubimac i pisanja novih. Pisano je za Windows 10/11. Na macOS-u su koraci isti, samo se programi instaliraju iz njihovih `.dmg` paketa, a komande kucaju u Terminal.

## 1. Šta je automatsko testiranje u ovom projektu

Projekat ima četiri vrste automatskih provera. Sve se pokreću jednom komandom.

| Vrsta | Alat | Gde su testovi | Komanda | Šta proverava |
|---|---|---|---|---|
| Provera tipova | TypeScript | ceo kod | `npm run typecheck` | da se kod „slaže" (pogrešno ime polja, pogrešan tip) |
| Lint | ESLint | ceo kod | `npm run lint` | pravila pisanja koda, sumnjive konstrukcije |
| Unit i komponentni testovi | Vitest + Testing Library | `tests/` | `npm test` | pojedinačne funkcije, server akcije, ekrani renderovani bez browsera |
| Testovi baze | pgTAP (Supabase) | `supabase/tests/` | `npx supabase test db` | tabele, pravila pristupa (ko šta sme da vidi i menja), Free limiti, okidači |
| End-to-end (E2E) | Playwright | `e2e/` | `npm run e2e` | pravi browser klikće kroz aplikaciju kao korisnik |
| Build | Next.js | — | `npm run build` | da se aplikacija uspešno sklapa za produkciju |

Za QA su najvažniji **E2E testovi (Playwright)**. To su automatizovani test scenariji: browser se sam otvara, popunjava forme i proverava šta piše na ekranu. Ručne scenarije iz `test-scenariji/` vremenom prevodimo u Playwright testove.

Iste provere se automatski pokreću i na GitHub-u (GitHub Actions) pri svakom slanju koda. Rezultat se vidi na kartici **Actions** u repozitorijumu.

## 2. Programi koje treba instalirati

Instaliraj ovim redom. Posle svake instalacije zatvori i ponovo otvori terminal.

| Program | Zašto | Odakle | Provera da radi |
|---|---|---|---|
| **Git** | preuzimanje koda sa GitHub-a | https://git-scm.com/download/win (podrazumevane opcije su u redu) | `git --version` |
| **Node.js 22 LTS** | pokreće aplikaciju i testove | https://nodejs.org (verzija „LTS") | `node --version` → v22.x ili novije |
| **Docker Desktop** | pokreće lokalnu bazu (Supabase) | https://www.docker.com/products/docker-desktop | `docker --version`; Docker Desktop mora da bude upaljen (ikonica kita u traci) |
| **Visual Studio Code** | uređivač, pokretanje testova klikom | https://code.visualstudio.com | otvara se |
| **GitHub nalog** | pristup repozitorijumu i prijava grešaka | https://github.com | Ivana te poziva u repozitorijum |

**Docker Desktop napomene (Windows):**
- Pri instalaciji ostavi uključeno „Use WSL 2". Ako zatraži restart ili instalaciju WSL-a, pristani.
- Docker mora da radi **pre** komande `npx supabase start`. Ako vidiš grešku da Docker nije dostupan, upali Docker Desktop i sačekaj da piše „Engine running".
- Treba mu bar 8 GB RAM-a na računaru. Ako je računar spor, u Docker Desktop → Settings → Resources smanji broj CPU-a na pola.

## 3. VS Code ekstenzije

U VS Code-u otvori Extensions (Ctrl+Shift+X) i instaliraj:

| Ekstenzija | Zašto |
|---|---|
| **Playwright Test for VSCode** (Microsoft) | pokretanje E2E testova klikom, gledanje browsera dok test radi, snimanje novih testova |
| **Vitest** (vitest.explorer) | pokretanje unit testova klikom |
| **ESLint** (Microsoft) | podvlači greške u kodu |
| **GitHub Pull Requests** (GitHub) | Issues i Pull Request-ovi direktno iz VS Code-a |
| **Docker** (Microsoft) | pregled kontejnera lokalne baze |
| **Serbian Language Pack** (opciono) | VS Code na srpskom |

## 4. Preuzimanje projekta (jednom)

1. Prihvati poziv u repozitorijum koji ti je stigao mejlom (GitHub).
2. Otvori **PowerShell** i preuzmi kod:
   ```powershell
   cd $HOME
   git clone https://github.com/pussycat993-gif/moj-ljubimac.git
   cd moj-ljubimac
   ```
   Prvi put će Git otvoriti prozor za prijavu na GitHub — prijavi se.
3. Instaliraj zavisnosti:
   ```powershell
   npm ci
   ```
4. Instaliraj browser za Playwright (jednom):
   ```powershell
   npx playwright install chromium
   ```
5. Otvori projekat u VS Code-u: `code .`

## 5. Pokretanje lokalne baze i aplikacije

1. Upali Docker Desktop.
2. Pokreni lokalni Supabase (prvi put traje nekoliko minuta jer se preuzimaju slike):
   ```powershell
   npx supabase start
   ```
   Na kraju ispiše adrese i ključeve. Zapamti dva: **Project URL** (`http://127.0.0.1:54321`) i ključ **Publishable** (ili „anon key") i **Secret** (ili „service_role key").
3. Napravi fajl sa podešavanjima:
   ```powershell
   Copy-Item .env.example .env.local
   code .env.local
   ```
   Popuni samo ove redove (ostale ostavi prazne — tada se mejl samo ispisuje u konzolu, a push i WhatsApp se preskaču):
   ```
   NEXT_PUBLIC_SITE_URL=http://localhost:3000
   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<Publishable ključ iz koraka 2>
   SUPABASE_SERVICE_ROLE_KEY=<Secret ključ iz koraka 2>
   DISPATCH_SECRET=lokalni-dispatch-tajna
   ACTION_TOKEN_SECRET=lokalna-tajna-za-linkove-najmanje-32-znaka
   EMAIL_FROM=Moj Ljubimac <noreply@mojljubimac.test>
   ```
4. Napuni bazu test podacima (briše sve lokalne podatke i vraća početno stanje sa test nalozima):
   ```powershell
   npx supabase db reset
   ```
5. Pokreni aplikaciju:
   ```powershell
   npm run dev
   ```
   Otvori http://localhost:3000/prijava i prijavi se test nalogom (lozinka za sve: `MojLjubimac123!`), na primer `ivana.petrovic@mojljubimac.test`. Spisak svih naloga je u [README.md](README.md).

**Korisne lokalne adrese:**

| Adresa | Šta je |
|---|---|
| http://localhost:3000 | aplikacija |
| http://127.0.0.1:54323 | Supabase Studio — pregled tabela u bazi |
| http://127.0.0.1:54324 | Mailpit — ovde stižu mejlovi za potvrdu naloga i reset lozinke |

**Gašenje:** u terminalu gde radi `npm run dev` pritisni Ctrl+C; bazu ugasi sa `npx supabase stop` (podaci ostaju).

**Ako `npx supabase start` javi da su portovi zauzeti:** na računaru radi neki drugi lokalni Supabase projekat. Ugasi ga sa `npx supabase stop --project-id <ime>` (ime piše u poruci o grešci).

## 6. Pokretanje automatskih testova

Sve komande se kucaju u folderu projekta (`cd $HOME\moj-ljubimac`). Lokalni Supabase mora da radi za testove baze i E2E.

```powershell
npm run typecheck        # tipovi
npm run lint             # pravila koda
npm test                 # unit i komponentni testovi (Vitest)
npx supabase test db     # testovi baze (pgTAP)
npm run e2e              # end-to-end (Playwright) — sam pokreće aplikaciju ako ne radi
npm run build            # produkcijski build
```

Kad sve prođe, svaka komanda završi bez crvenih poruka. Ako nešto padne, poruka kaže koji fajl i koji test.

**Samo jedan test fajl:**
```powershell
npx vitest run tests/pets            # samo testovi u folderu tests/pets
npx playwright test e2e/add-pet.spec.ts
```

### Playwright u VS Code-u (preporučeno za QA)

1. Levo klikni ikonicu epruvete (**Testing**).
2. Pod „Playwright" vidiš sve E2E testove iz `e2e/`.
3. Klikni ▶ pored testa da ga pokreneš.
4. Uključi **Show browser** da gledaš browser dok test radi.
5. Kad test padne, klikni na grešku — VS Code pokaže red i snimak ekrana.

### Playwright UI i izveštaji

```powershell
npx playwright test --ui          # prozor sa svim testovima, korak-po-korak reprodukcija
npx playwright test --headed      # browser vidljiv
npx playwright show-report        # HTML izveštaj poslednjeg pokretanja
npx playwright show-trace <putanja-do-trace.zip>   # „vremeplov" kroz pali test
```

Kada test padne, u folderu `test-results/` ostaju snimak ekrana i trace — priloži ih uz prijavu greške.

## 7. Pisanje novih E2E testova

### Snimanje testa klikanjem (codegen)

1. Pokreni aplikaciju (`npm run dev`) i bazu.
2. U drugom terminalu:
   ```powershell
   npx playwright codegen http://localhost:3000/prijava
   ```
3. Otvara se browser: klikći kroz scenario kao korisnik. Desni prozor sam piše kod testa.
4. Kopiraj kod u novi fajl u `e2e/`, na primer `e2e/ts-pet-005-free-limit.spec.ts`.
5. Dodaj proveru očekivanog rezultata (`expect`) i pokreni test.

Isto se radi i iz VS Code-a: Testing → Playwright → **Record new**.

### Pravila za nove testove

- **Ime fajla** počinje ID-jem scenarija: `e2e/ts-<oblast>-<broj>-<opis>.spec.ts` (npr. `ts-auth-004-pogresna-lozinka.spec.ts`). Tako se zna koji ručni scenario je automatizovan; u fajlu scenarija pored ID-ja dopiši „🤖 automatizovano".
- **Elemente biraj po ulozi i tekstu**, ne po CSS klasama:
  ```ts
  await page.getByRole("button", { name: "Sačuvaj" }).click();
  await expect(page.getByText("Pogrešan mejl ili lozinka.")).toBeVisible();
  ```
- **Test mora biti nezavisan:** ne oslanja se na to šta je drugi test napravio. Ako treba poseban nalog, napravi ga u testu (registracija sa jedinstvenim mejlom, npr. `qa+${Date.now()}@mojljubimac.test`).
- **Ne menjaj seed i ne briši test naloge** iz baze; ako ti je baza „zaprljana", vrati je sa `npx supabase db reset`.
- Primeri postojećih testova: `e2e/registration.spec.ts`, `e2e/add-pet.spec.ts`, `e2e/mark-done.spec.ts`, `e2e/household-invitation.spec.ts`, `e2e/shelter-intake-to-adoption.spec.ts`, `e2e/vaccination-reminder.spec.ts`.

### Kako se nov test šalje na GitHub

Nikad direktno na `main` (svaki push na `main` pokreće objavljivanje na produkciju). Radi na svojoj grani:

```powershell
git switch main
git pull
git switch -c qa/ts-pet-005-free-limit
# ... napiši test, pokreni ga da prođe ...
git add e2e/ts-pet-005-free-limit.spec.ts
git commit -m "QA: e2e TS-PET-005 Free limit 1 aktivan ljubimac"
git push -u origin qa/ts-pet-005-free-limit
```

Zatim na GitHub-u otvori **Pull Request** ka `main` i dodeli Ivanu kao reviewer-a. GitHub Actions automatski pokrene sve provere na tvojoj grani (bez objavljivanja).

## 8. Česti problemi

| Problem | Rešenje |
|---|---|
| `docker: command not found` ili „Cannot connect to the Docker daemon" | upali Docker Desktop i sačekaj „Engine running" |
| `npx supabase start` — port zauzet | `npx supabase stop --project-id <ime>` za drugi projekat, pa ponovo start |
| E2E testovi vise na `page.goto` | računar je preopterećen; pokreni sa jednim browserom: `npx playwright test --workers=1` |
| Prijava ne radi lokalno | proveri `.env.local` (URL i ključevi iz `npx supabase start`), pa restartuj `npm run dev` |
| Mejl za potvrdu ne stiže | otvori Mailpit http://127.0.0.1:54324 |
| Mejl podsetnika ne stiže | lokalno se podsetnici ne šalju sami i bez `RESEND_API_KEY` mejl se samo ispiše u terminal gde radi `npm run dev`; ručno slanje: `curl.exe -X POST http://localhost:3000/api/internal/dispatch -H "X-Dispatch-Secret: lokalni-dispatch-tajna"` |
| `npm ci` greške posle `git pull` | obriši `node_modules` i ponovi `npm ci` |
| Baza „čudna" posle testiranja | `npx supabase db reset` (vraća početne test podatke) |
| PowerShell ne prepoznaje komandu | proveri da si u folderu projekta i da tekst nije uputstvo nego komanda — u PowerShell se lepe samo redovi iz sivih blokova |

## 9. Gde se prijavljuju greške

Sve greške — i iz ručnog i iz automatskog testiranja — prijavljuju se kao **GitHub Issue** u repozitorijumu:

**https://github.com/pussycat993-gif/moj-ljubimac/issues → New issue → „Prijava greške"**

- Forma je već pripremljena (polja: scenario ID, koraci, očekivano, dobijeno, okruženje, prioritet). Šablon i objašnjenje prioriteta su u [03-sablon-prijave-greske.md](03-sablon-prijave-greske.md).
- Ivana dobija obaveštenje mejlom za svaki novi Issue.
- Za pali automatski test priloži: ime test fajla, poruku greške iz terminala i `trace.zip` / snimak ekrana iz `test-results/`.
- Pitanja koja nisu greške (nejasan zahtev, predlog) otvori kao Issue sa formom **„Pitanje ili predlog"**.
- Hitno (P1 — aplikacija ne radi, gubitak podataka, neko vidi tuđe podatke): otvori Issue i javi Ivani i porukom.
