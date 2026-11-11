---
name: run-maaltijden
description: Run, start, smoke-test, screenshot or drive the Maaltijden-app (Express server + web UI) locally with a throwaway database; call its API (planner, boodschappen, voorraad) and check a change in the browser.
---

# Maaltijden-app draaien en besturen

Express-server (`server/index.js`) met een web-UI uit `public/` en een SQLite-database. De driver
`.claude/skills/run-maaltijden/driver.mjs` start de server met een **lege, tijdelijke database**
(nooit `data/maaltijden.db`), externe diensten uit, en praat er via HTTP mee. Paden hieronder zijn
relatief aan de repo-root. Getest op Windows 11 met Git Bash en Node 24.

## Voorbereiden

```bash
npm ci --no-audit --no-fund
```

## Run (agent-pad)

Snelle check van een echte flow: start → recept plannen → boodschappenlijst → voorraad toevoegen →
lijst ziet de voorraad (`in_stock_g`) → planning weer weg → stop. Eindigt met `SMOKE OK`, exit 0.

```bash
node .claude/skills/run-maaltijden/driver.mjs smoke
```

Blijven draaien voor de browser of losse API-verzoeken (tijdelijke data, Ctrl-C of de taak stoppen ruimt op):

```bash
node .claude/skills/run-maaltijden/driver.mjs serve 3091
```

Start dit als achtergrondtaak. Open daarna `http://127.0.0.1:3091/#/voorraad` in de browser van de app
(`preview_start` met `url`) en maak een screenshot. Schermen: `#/vandaag`, `#/boodschappen`, `#/voorraad`.

Losse verzoeken naar een draaiende server:

```bash
export MAALTIJDEN_URL=http://127.0.0.1:3091
node .claude/skills/run-maaltijden/driver.mjs call POST api/stock '{"ingredient_id":1,"grams":500,"best_before":"2026-11-14"}'
node .claude/skills/run-maaltijden/driver.mjs call GET /api/stock
```

Belangrijke routes: `/health`, `/api/recipes`, `/api/plan` (POST `{date, meal, recipe_id, servings}`),
`/api/shopping?week=JJJJ-MM-DD`, `/api/stock` (POST `{ingredient_id, grams, best_before}`).

## Run (mens)

`npm start` → http://localhost:3000. Gebruikt de echte `data/maaltijden.db`; voor tests de driver gebruiken.

## Test

```bash
npm test
```

Op Windows falen er 4 van 144 al op de hoofdtak (`boodschappen-dagen`, `verpakkingen`, Jumbo-sessie,
updater-back-up). Dat ligt niet aan jouw wijziging; let alleen op nieuwe fouten.

## Gotchas

- **Lege database is niet leeg:** bij de eerste start komen er 50 recepten én een voorbeeldweek in de
  planner. De boodschappenlijst heeft dus meteen ~46 artikelen.
- **Eerste bezoek toont de kennismaking met het maatje** (pop-up). Sluit hem met het kruisje rechtsboven
  voordat je verder klikt.
- **De UI ververst niet vanzelf na een API-wijziging.** Na `call POST api/stock` blijft `#/voorraad`
  "Nog niets in de voorraad" tonen tot je de pagina herlaadt.
- **Git Bash verandert `/api/...` in een Windows-pad** (`C:/Program Files/Git/api/...`) als argument
  van een Windows-programma. De driver vangt dat op; `api/stock` zonder slash werkt ook.
- **Windows houdt de database vast tot het proces weg is.** Daarom wacht de driver op het afsluiten
  voordat hij de tijdelijke map weggooit (anders `EPERM` bij het opruimen).
- `npm ci` meldt dat het install-script van `sharp` is overgeslagen; de app start en de smoke slaagt toch.
- Werk vanaf `origin` (een worktree): de lokale checkout loopt achter en mist o.a. de voorraad.

## Troubleshooting

- `EPERM, Permission denied: ...\maaltijden-run-XXXX` → oude driver zonder wachten; oude mappen weg met
  `rm -rf "$TEMP"/maaltijden-run-*`.
- `Failed to parse URL from http://127.0.0.1:3091C:/Program Files/Git/api/...` → zie Git Bash-gotcha.
