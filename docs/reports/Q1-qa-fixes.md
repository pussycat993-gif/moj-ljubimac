# Q1 — Ispravke iz QA (Jovana, 6. 11. 2026.)

> Korak van plana (nije korak iz `docs/product/06-build-plan.md`). Sve ispravke je odobrila vlasnica. Datum: 9. 11. 2026.

Svaka QA napomena je mapirana na izmenu u kodu i na test koji je čuva. Markup prati Design System (`docs/product/04-design-system.md`): koriste se postojeći `components/ui` elementi i tokeni (`border-destructive` preko `aria-invalid`, `text-muted-foreground`, `border-primary`, `ring-ring/50`), bez novih boja. Sav novi tekst je u `lib/i18n/sr.ts` i `lib/i18n/en.ts`.

## Pregled

| # | QA napomena | Izmena | Testovi |
|---|---|---|---|
| 1 | Posle više pokušaja prijave/registracije pojavljuje se opšta greška (ili engleska poruka servera) | `rate_limited` (Supabase Auth `over_request_rate_limit` / 429) dobija svoju poruku na S16, S15, S28, slanju linka za novu lozinku i ponovnom slanju linka za potvrdu | `tests/auth/sign-in-form.test.tsx`, `tests/auth/new-password-form.test.tsx`, `tests/registration/register-form.test.tsx` |
| 2 | Nema prikaza lozinke | Novi deljeni `components/app/password-input.tsx` (ikonica oka u polju, `aria-pressed`, `aria-label`) na S15, S16, S28 | `tests/components/password-input.test.tsx` + testovi ekrana iznad |
| 3 | Biranje datuma rođenja daleko u prošlosti traje dugo; okvirna godina je slobodan broj | S02: kalendar ima padajuće menije za mesec i godinu (1990 → tekuća godina, bez budućih datuma); okvirna godina je `Select` godina (tekuća → 1990) | `tests/pets/pet-form.test.tsx` („S02 — QA Q1 fixes“) |
| 4 | Polje „Koja vrsta?“ za „Ostalo“ je daleko od izbora vrste, a poruka greške se javlja odmah | Polje je odmah ispod kontrole „Vrsta“, vizuelno grupisano (`border-l-2 border-primary pl-3`), dobija fokus kad se izabere „Ostalo“; „Upiši koja je vrsta.“ tek posle pokušaja čuvanja ili kad prazno polje izgubi fokus | `tests/pets/pet-form.test.tsx` |
| 5 | Posle neuspelog čuvanja korisnik ne vidi koje polje nije dobro | Deljeni pomoćnik `lib/forms/focus-first-invalid.ts` (`useFocusFirstInvalid`): prvo polje sa `aria-invalid="true"` se skroluje u vidno polje i dobija fokus. Uključeno u S02, S04, S27, S05, S11, S15, S34 (i za greške polja koje vrati server, 422) | `tests/forms/focus-first-invalid.test.tsx` + po jedan test u svakom formularu |
| 6 | „drugo“ ili „Ostalo“? | Aplikacija ostaje na „Ostalo“. D2 je već komitovan, pa je `docs/product/02-prd.md` FR-01 promenjen na „Ostalo“ (v1.9, red u change log-u) | — (dokumentacija) |
| — | Pitanje: odakle limit prijave? | Novi odeljak „Odgovori na pitanja iz QA (6.11.2026.)“ u `docs/qa/README.md` | — |

## 1. Poruka za previše pokušaja (rate limit)

- `lib/server/result.ts` je već mapirao Supabase `over_request_rate_limit`, `over_email_send_rate_limit` i status 429 na `rate_limited`; ekrani su to prikazivali kao opštu grešku.
- **S16 Prijava** (`app/(auth)/prijava/sign-in-form.tsx`): nova greška `rate_limited` → „Previše pokušaja prijave. Sačekaj nekoliko minuta i pokušaj ponovo.“ / „Too many sign-in attempts. Wait a few minutes and try again.“ (`signIn.rateLimited`). Ista poruka za ponovno slanje linka za potvrdu i za prikaz „Nova lozinka“ (slanje linka).
- **Slanje linka za novu lozinku** (`lib/actions/auth.ts` → `requestPasswordReset`): do sada je svaka greška ćutke vraćala uspeh. Sada 429 vraća `rate_limited` (limit je po IP adresi, pa ne otkriva da li nalog postoji); ostale greške i dalje vraćaju uspeh (bez otkrivanja naloga).
- **S15 Registracija** (`app/(auth)/registracija/register-client.tsx`): „Previše pokušaja. Sačekaj nekoliko minuta i pokušaj ponovo.“ / „Too many attempts. Wait a few minutes and try again.“ (`register.rateLimited`) za registraciju, Google i ponovno slanje linka (na ekranu „Proveri mejl“ greška se sada prikazuje, ranije se ništa nije videlo).
- **S28 Nova lozinka**: `newPassword.rateLimited` (isti tekst kao registracija).
- Engleska poruka servera (`error.message`) se nigde ne prikazuje — testovi to proveravaju (`not.toHaveTextContent(...)`).

## 2. Prikaz lozinke

- `components/app/password-input.tsx`: `Input` + dugme sa ikonicom `Eye` / `EyeOff` (lucide) u desnom delu polja, 44 px širine, `type="button"`, `aria-pressed`, `aria-controls`, `aria-label` „Prikaži lozinku“ / „Sakrij lozinku“ (en „Show password“ / „Hide password“). Tekst dolazi kroz `labels` prop (podrazumevano srpski, kao kod ostalih kompozita), a ekrani prosleđuju `common.showPassword` / `common.hidePassword`.
- Korišćen na S16 (lozinka), S15 (lozinka) i S28 (nova i ponovljena lozinka — svako polje ima svoje dugme).

## 3. Izbor godine na S02

- Kalendar za datum rođenja: `captionLayout="dropdown"`, `startMonth` januar 1990, `endMonth` tekući mesec, `disabled={{ after: danas }}`; imena meseci iz `petForm.calendarMonths`, oznake menija „Mesec“ / „Godina“ (`petForm.calendarMonth`, `petForm.calendarYear`).
- Okvirna godina: `Select` sa godinama od tekuće do 1990, placeholder „Izaberi godinu“ / „Choose a year“. Pošto se godina bira iz liste, poruka „Upiši godinu sa četiri cifre…“ ostaje samo za 422 sa servera.

## 4. „Ostalo“ i „Koja vrsta?“

- Polje je sada unutar istog bloka kao „Vrsta *“, odmah ispod padajućeg menija, sa levom linijom `border-primary` koja ga vezuje za izbor.
- Kad se izabere „Ostalo“, `Select` umesto svog dugmeta fokusira „Koja vrsta?“ (`onCloseAutoFocus`).
- Promena vrste briše eventualnu staru grešku; poruka „Upiši koja je vrsta.“ se javlja tek na pokušaj čuvanja ili kad prazno polje izgubi fokus.

## 5. Fokus na prvo neispravno polje

- `lib/forms/focus-first-invalid.ts`: `focusFirstInvalid(root)` nalazi prvo `[aria-invalid="true"]` u formularu (redosled u DOM-u), poziva `scrollIntoView({ block: "center" })` i fokusira ga; za grupu koja nije fokusabilna (npr. radio grupa „Pol“) fokusira njen aktivni element. `useFocusFirstInvalid(ref)` to radi posle React rendera novih grešaka.
- Svako polje već ima `aria-invalid`, crveni okvir (`aria-invalid:border-destructive` iz `components/ui`) i svoju poruku; pomoćnik samo vodi korisnika do prve.
- Uključeno u: S02 ljubimac, S04 vakcina, S27 terapija, S05 pregled, S11 podsetnik, S15 registracija, S34 oglas — i za greške pri slanju i za 422 greške polja sa servera.

## 6. „Ostalo“ u dokumentaciji

- `docs/product/02-prd.md` v1.9: FR-01 sada kaže „Ostalo“ (other) sa slobodnim tekstom; red 1.9 u change log-u. Zahtev se ne menja.

## Izmenjeni testovi (postojeći)

- `tests/auth/sign-in-form.test.tsx`: test „other failures (e.g. 429) show the generic error“ je zamenjen testom za novu poruku (429 → poruka o previše pokušaja), a generička greška se sada proverava sa 500. Test „reset … always shows success“ sada koristi grešku 500 (429 namerno prikazuje poruku). Izuzetak 3 iz pravila (vlasnica je odobrila novo ponašanje).
- `tests/pets/pet-form.test.tsx`: okvirna godina se bira iz liste umesto kucanja.

## Provera

| Komanda | Rezultat |
|---|---|
| `npm run typecheck` | ✅ |
| `npm run lint` | ✅ |
| `npm test` | ✅ 151 fajl, 1797 testova |
| `npm run build` | ✅ |
| `npm run e2e` | ✅ 6 passed (2 workera). Kao u ranijim koracima nema `.env.local`: Supabase promenljive iz `npx supabase status`, uz `NEXT_PUBLIC_SITE_URL=http://localhost:3000` i lokalni `ACTION_TOKEN_SECRET`. Prvi pokušaj bez ovih promenljivih je pao na 6/6 (okruženje, ne kod). |

## Napomene za kasnije

- Oznake dana u kalendaru (čitač ekrana) i dalje dolaze na engleskom iz react-day-picker-a (npr. „Wednesday, June 10th, 2015“) — postojeće stanje, nije deo ovog kruga.
- `docs/qa/02-slucajevi-koriscenja.md` i scenariji za AUTH mogu dobiti scenario za poruku o previše pokušaja (QA).
