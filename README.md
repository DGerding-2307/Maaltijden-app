# 🍲 Maaltijden – planner & receptenboek

Een webapplicatie voor op je eigen server: een overzichtelijke weekplanner en een receptenboek met
Nederlandse recepten, voedingswaarden per persoon (uit Open Food Facts), geschatte prijzen per maaltijd en een Claude AI-integratie.

## Nieuw in v2.2

- 📷 **Ingrediënten scannen:** in de recepteditor voeg je een ingrediënt toe door de barcode van het product te scannen.
  Naam, verpakking en voedingswaarden komen uit Open Food Facts. Bekende producten worden aan het bestaande ingrediënt gekoppeld.
  Werkt met de camera op Android (Chrome), iPhone (Safari) en desktop. Je kunt de cijfers ook intypen.
- 🗑️ **Jumbo-koppeling verwijderd:** prijzen ophalen bij Jumbo en de lijst naar de Jumbo-app zetten werkten via een onofficiële, onbetrouwbare API en zijn eruit gehaald.
  Prijzen zijn nu altijd een schatting of zelf ingevuld (zie [Over de prijzen](#over-de-prijzen)).

## Nieuw in v2

Versie 2 is gebaseerd op een gebruikersacceptatietest langs wat gebruikers in recensies van andere maaltijdplanners
en receptenapps verwachten. Zie het [UAT-rapport](docs/UAT-rapport.md).

- 🥫 **Open Food Facts** als bron voor voedingswaarden: zoeken, barcode scannen, mediaan van vergelijkbare producten, Nutri-Score, automatisch aanvullen
- 🏠 **‘Heb ik al in huis’** op de boodschappenlijst, en ‘altijd in huis’ voor voorraadkast-artikelen
- 👨‍👩‍👧 **Live bijwerken:** planner en boodschappenlijst verversen vanzelf als een huisgenoot iets wijzigt
- ♻️ **Restjes inplannen** zonder dubbele boodschappen
- 📱 **Verplaatsen en bewerken op de telefoon** via het ⋯-menu per maaltijd
- 🧺 **Wat kan ik maken?** met de ingrediënten die je in huis hebt, en ✨ een recept op basis van een foto van je koelkast
- 🌱⚡💶 **Snelfilters:** vegetarisch, snel, goedkoop
- 📷 **Eigen foto's** uploaden bij recepten
- 💾 **Back-up** downloaden en terugzetten
- 📴 **Offline** de laatst bekeken recepten, planning en boodschappenlijst inzien

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
- **Prijs per persoon en totaal** op basis van geschatte supermarktprijzen (naar verhouding van de verpakking)
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
- Hoeveelheden opgeteld en omgerekend naar aantal verpakkingen + geschatte kosten
- Voorraadkast-artikelen (zout, olie, kruiden) standaard verborgen
- Afvinken, extra artikelen toevoegen, kopiëren (voor WhatsApp/notities) en afdrukken

**Ingrediënten & prijzen**
- ~100 veelgebruikte ingrediënten met stuksgewicht, verpakking en voedingswaarden per 100 g
- Voedingswaarden uit **Open Food Facts**: per ingrediënt de mediaan van vergelijkbare Nederlandse producten, of één product dat je kiest of met de camera scant. Nutri-Score en de bron zijn per ingrediënt zichtbaar.
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

De gebruikersacceptatietest opnieuw draaien (vereist Playwright: `npm i -D playwright`):

```bash
node test/uat/off-mock.mjs &                                   # nagebootste Open Food Facts
DB_FILE=/tmp/uat.db OFF_BASE=http://localhost:3999 OFF_MIN_GAP_MS=100 PORT=3123 npm start &
node test/uat/uat.mjs docs/uat                                 # 21 scenario's, schermafbeeldingen in docs/uat
```

Back-up: via **Instellingen → Back-up downloaden** (alle gegevens, zonder API-sleutel), of kopieer de map `data/`
(database + geüploade foto's).

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

## Over Open Food Facts

[Open Food Facts](https://nl.openfoodfacts.org) is een open database van voedingsmiddelen (licentie ODbL, © Open Food Facts-bijdragers).

- Bij de **eerste start** vergelijkt de app alle ingrediënten op de achtergrond met Open Food Facts. Open Food Facts staat maximaal 10 zoekopdrachten per minuut toe, dus dit duurt ongeveer 12 minuten.
- Per ingrediënt wordt de **mediaan** genomen van producten waarvan de naam het ingrediënt als los woord bevat. ‘ui’ telt dus bij ‘rode ui’, maar niet bij ‘uienringen’.
- Wijkt een waarde sterk af van de huidige (meer dan 2× zo hoog of laag), dan wordt hij niet automatisch overgenomen. Je ziet hem bij **Ingrediënten → Overgeslagen** en kunt hem daar met één klik toch gebruiken.
- **Nieuwe ingrediënten** (bijvoorbeeld uit een geïmporteerd recept) krijgen eerst een schatting van Claude en worden daarna automatisch aangevuld met Open Food Facts. Dit kun je uitzetten bij Instellingen.
- Per ingrediënt kun je via 🥫 zelf zoeken, een barcode invoeren of met de camera scannen (Android, iPhone en desktop; de camera vereist HTTPS).
- Resultaten worden 30 dagen bewaard, zodat dezelfde vraag niet opnieuw naar Open Food Facts gaat.
- Waar nog geen gegevens uit Open Food Facts zijn, staan NEVO-gemiddelden (RIVM).

## Over de prijzen

Alle ingrediënten hebben een **geschatte supermarktprijs** per verpakking (Jumbo-niveau, 2026).
Weet je de actuele prijs, pas hem dan aan via **Ingrediënten → ✏️**; de bron staat dan op ‘handmatig’.

De prijs per maaltijd wordt naar verhouding berekend (300 g van een zak van 1 kg = 30% van de prijs).
De boodschappenlijst rekent met hele verpakkingen.

> Eerdere versies haalden prijzen op via de onofficiële API van de Jumbo-app en konden de lijst naar de Jumbo-app zetten.
> Omdat die API niet openbaar is en niet betrouwbaar werkt, is dat in v2.2 verwijderd. Eerder opgehaalde prijzen blijven bewaard.

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
- `server/scan.js` + `public/js/scanner.js` – barcode scannen (BarcodeDetector of ZXing) en koppelen aan ingrediënten
- `server/openfoodfacts.js` + `server/offqueue.js` – Open Food Facts (zoeken, barcode, mediaan, cache, achtergrondwachtrij)
- `server/seed.js` – startingrediënten en -recepten

Voedingswaarden zijn benaderingen; gebruik ze als indicatie, niet als medisch advies.
Deze app is niet verbonden aan Jumbo, Open Food Facts of Anthropic.
