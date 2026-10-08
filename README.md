# 🍲 Maaltijden – planner & receptenboek

Een webapplicatie voor op je eigen server: een overzichtelijke weekplanner en een receptenboek met
Nederlandse recepten, voedingswaarden per persoon, prijzen per maaltijd bij de Jumbo en een Claude AI-integratie.

## Functies

**Weekplanner**
- Weekoverzicht met ontbijt, lunch en diner (momenten zelf in te stellen)
- Recepten slepen vanuit de zijbalk naar een dag; maaltijden verslepen tussen dagen (Ctrl/Alt + slepen = kopiëren)
- Aantal personen per maaltijd aanpassen (− / +)
- Per dag: kcal per persoon en kosten; per week: totale kosten (met budget) en gemiddelde kcal
- Vrije invoer (‘Uit eten’, ‘Restjes’), week kopiëren, week leegmaken, afdrukken
- ✨ **Weekmenu met Claude**: kiest uit je receptenboek op basis van wensen, kooktijd, budget en huishouden

**Receptenboek**
- 16 klassieke Nederlandse startrecepten (stamppotten, hutspot, snert, hachee, pannenkoeken, nasi…)
- Zoeken op naam, tag of ingrediënt; filteren op categorie, bereidingstijd en favorieten; sorteren op prijs, kcal, tijd, waardering
- Favorieten (★) en waardering (1–5 sterren)
- **Porties schalen**: − / + of snelknoppen 1–10 personen; hoeveelheden en kosten schalen mee
- **Voedingswaarden per persoon** (en totaal): energie, eiwit, koolhydraten, suikers, vet, verzadigd vet, vezels, zout, met % referentie-inname en macroverdeling
- **Prijs per persoon en totaal** op basis van Jumbo-prijzen (naar verhouding van de verpakking)
- **Kookmodus**: grote letters, stap voor stap, scherm blijft aan, automatische timers uit de tekst
- ✨ **Vraag Claude** over een recept (vervangers, bewaren, vegetarisch maken…)
- Dupliceren, bewerken, afdrukken

**Recepten toevoegen met Claude** ✨
- Via **link** naar een receptensite (leest schema.org-receptgegevens, werkt met de meeste sites)
- Via **geplakte tekst** (elke taal; Amerikaanse maten worden omgerekend)
- Via **foto of PDF** (bv. een foto van een kookboekpagina)
- **Laat Claude bedenken**: ‘iets met kip en prei’, ‘vegetarische stamppot onder €2 p.p.’
- Claude koppelt ingrediënten aan de database en schat voedingswaarden en prijs voor onbekende ingrediënten. Je kijkt het concept na voordat het wordt opgeslagen.

**Boodschappenlijst**
- Automatisch uit de weekplanning, gegroepeerd per supermarktafdeling
- Hoeveelheden opgeteld en omgerekend naar aantal Jumbo-verpakkingen + geschatte kosten
- Voorraadkast-artikelen (zout, olie, kruiden) standaard verborgen
- Afvinken, extra artikelen toevoegen, kopiëren (voor WhatsApp/notities) en afdrukken
- Link per artikel naar het product bij Jumbo

**Ingrediënten & prijzen**
- ~100 veelgebruikte ingrediënten met voedingswaarden per 100 g (afgerond, op basis van NEVO-gemiddelden), stuksgewicht en verpakking
- Koppelen aan een Jumbo-product en prijzen verversen (los of allemaal tegelijk)
- Handmatig prijzen en voedingswaarden aanpassen, of laten schatten door Claude

Verder: werkt op telefoon (onderbalk-navigatie, installeerbaar als app), licht/donker thema, optioneel wachtwoord.

## Installeren

### Met Docker (aanbevolen)

```bash
git clone <deze repo> maaltijden && cd maaltijden
cp .env.example .env        # vul ANTHROPIC_API_KEY in (of later via Instellingen)
docker compose up -d --build
```

Open daarna `http://<server-ip>:3000`. De database staat in `./data/maaltijden.db` – maak daar back-ups van.

### Zonder Docker

Vereist Node.js 22.13 of nieuwer (gebruikt de ingebouwde SQLite van Node, geen extra database nodig).

```bash
npm install
cp .env.example .env
ANTHROPIC_API_KEY=sk-ant-... npm start
```

Ontwikkelen met automatisch herstarten: `npm run dev`. Tests: `npm test`.

### Bereikbaar vanaf internet?

Zet dan `APP_PASSWORD` in `.env` (de browser vraagt om in te loggen) en zet de app achter een reverse proxy
met HTTPS (bijv. Caddy, Nginx Proxy Manager of Traefik). Met HTTPS kun je de app ook op je telefoon
‘Op beginscherm zetten’.

## Claude instellen

1. Maak een API-sleutel aan op [console.anthropic.com](https://console.anthropic.com/).
2. Zet hem in `.env` als `ANTHROPIC_API_KEY`, of vul hem in bij **Instellingen** in de app.
3. Vul bij Instellingen ook je huishouden en voorkeuren in (aantal personen, allergieën, ‘2x per week vegetarisch’…). Claude gebruikt dit bij weekmenu’s en nieuwe recepten.

Standaard wordt het model `claude-opus-5-5` gebruikt; met `CLAUDE_MODEL` kun je een ander model kiezen.
Claude wordt alleen aangeroepen als je zelf op een ✨-knop drukt.

## Over de Jumbo-prijzen

Jumbo heeft geen officiële openbare API. De app gebruikt de (onofficiële) API die de Jumbo-app gebruikt.
Die kan zonder aankondiging veranderen of tijdelijk niet werken. Daarom:

- Alle startingrediënten hebben een **geschatte prijs**, zodat prijzen altijd werken.
- Via **Ingrediënten → 🟡** koppel je een ingrediënt aan een echt Jumbo-product; daarna kun je de prijzen met één knop verversen.
- Je kunt prijzen altijd **handmatig** aanpassen.
- Werkt de API niet meer, dan kun je een andere basis-URL instellen met `JUMBO_API_BASE`.

De prijs per maaltijd wordt naar verhouding berekend (300 g van een zak van 1 kg = 30% van de prijs).
De boodschappenlijst rekent met hele verpakkingen.

## Hoe het werkt

| Onderdeel | Techniek |
|---|---|
| Server | Node.js + Express (`server/`) |
| Database | SQLite via `node:sqlite` (`data/maaltijden.db`) |
| Frontend | Vanilla JavaScript-modules, geen build-stap (`public/`) |
| AI | Anthropic SDK, structured outputs voor recepten en weekmenu’s, streaming voor vragen |

Belangrijkste bestanden:

- `server/calc.js` – eenheden → grammen, voedingswaarden, prijzen, boodschappenlijst
- `server/repo.js` – database-toegang en het automatisch koppelen van ingrediënten
- `server/claude.js` – alle Claude-functies
- `server/jumbo.js` – Jumbo-prijzen
- `server/seed.js` – startingrediënten en -recepten

Voedingswaarden zijn benaderingen; gebruik ze als indicatie, niet als medisch advies.
Deze app is niet verbonden aan Jumbo of Anthropic.
