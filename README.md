# Moj Ljubimac

Web aplikacija za zdravstveni karton ljubimca, podsetnike i deljenje sa ukućanima. Sva dokumentacija je u `docs/product/` (01–06): product brief, PRD, tehnička ograničenja, dizajn sistem, API ugovor i plan gradnje. Evidencija statusa gradnje je `docs/product/06-build-plan.md` §3.

## npm skripte

| Skripta | Šta radi |
|---|---|
| `npm run dev` | Next.js dev server |
| `npm run build` | produkcijski build (`next build`) |
| `npm run start` | pokreće produkcijski build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint nad celim repozitorijumom |
| `npm test` | Vitest (jedno pokretanje) |
| `npm run e2e` | Playwright (`e2e/`) |
