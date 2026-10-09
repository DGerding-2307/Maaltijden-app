# 🍲 Maaltijden – planner & receptenboek

Een webapplicatie voor op je eigen server: een overzichtelijke weekplanner en een receptenboek met
Nederlandse recepten, voedingswaarden per persoon (uit Open Food Facts), prijzen per maaltijd (uit Open Prices) en een Claude AI-integratie.

## Nieuw in v3.1

- 🍴 **Uit eten** met één tik bij het plannen van een maaltijd.
- 💶 Maaltijden van **losse ingrediënten** tonen nu hun prijs in de planner (en tellen mee in de dag- en weekkosten en het kcal-gemiddelde).
- 🥪 Bij de **lunch** staat geen knop meer om vlees of vis toe te voegen (bij ontbijt en diner wel).

## Nieuw in v3

Versie 3 is gebouwd na een tweede ronde recensies (dit keer ook van calorie-apps) en een nieuwe gebruikersacceptatietest:
**33 van de 33 scenario's geslaagd**. Zie het [UAT-rapport](docs/UAT-rapport.md#8-v3-recensies-opnieuw-bekeken-en-9-nieuwe-scenarios).

**Flexibeler plannen**
- 🥩 **Vlees of vis bij een gerecht** zonder er een nieuw recept voor te maken: tik op **🥩 + Vlees of vis** op een maaltijd
  (of kies het meteen bij het inplannen). Gehaktbal, slavink, schnitzel, kipfilet, zalm… Het telt mee voor de boodschappen, de kcal en de kosten.
- 🍽️ **Een gerecht als vlees of bijgerecht** bij een ander gerecht, bijvoorbeeld hachee bij de stamppot.
  Vink in de recepteditor ‘🥩 Kan als vlees bij een ander gerecht’ aan.
- 🥕 **Maaltijd van losse ingrediënten**, zonder recept: een broodje met kaas, een croissant en een banaan.
- ⚖️ **Minder restjes**: per ingrediënt in een recept *hele verpakking gebruiken*, *afronden op hele stuks* of een *minimum*
  (bijv. altijd minstens 1 ui, ook als je voor 1 persoon kookt). Het kan ook als standaard per ingrediënt.

**Makkelijker op de telefoon en in de app**
- 📱 Niets valt meer weg achter de statusbalk of de navigatiebalk van je telefoon, ook niet in vensters en meldingen.
- 👆 **Touchscreen-vriendelijk**: alle knoppen minstens 44 px (de richtlijn van Apple en Google), invoervelden zonder inzoomen,
  kerncijfers compact naast elkaar, en een daglijst om in de planner direct naar een dag te springen (de planner opent bij vandaag).
- ⚡ **Recent gebruikt** in het dagboek: met één tik opnieuw toevoegen wat je vaak eet.
- 🔙 Vensters sluiten bij de terugknop of als je naar een andere pagina gaat.
- 📲 **Vernieuwde Android-app (3.0)**: geef een tweede adres op (bijv. thuis via wifi en onderweg via internet); de app kiest zelf het adres dat werkt.

**Meer ingrediënten en foto's**
- 🥐 **88 Jumbo bake-offbroodjes en -snacks** als standaardingrediënten, met voedingswaarden en allergenen uit het
  [Jumbo-productinformatieblad](https://www.jumbo.com/dam/service/allergenen/Consumenteninfoblad%20productinformatie%20bakeoff%20broodjes%2008-05-2023.pdf).
  Gewicht per stuk en prijs zijn geschat.
- 🖼️ **Standaardfoto's bij 201 ingrediënten** (vrije licenties via Wikimedia Commons en Openverse, met bronvermelding). Een eigen foto blijft altijd staan.

Bestaande installaties krijgen alles automatisch bij de update. Wat je zelf hebt verwijderd of aangepast, blijft zoals het is.

## Nieuw in v2.7

- 📷 **Foto's bij alle 50 standaardrecepten** (vrije licenties via Wikimedia Commons en Openverse, met bronvermelding) en
  **foto's bij ingrediënten**: zichtbaar in de ingrediëntenlijst, bij recepten, op de boodschappenlijst en in het dagboek.
- 🛒 **Ingrediënt uit een webwinkel**: plak de link naar een product en Claude vult naam, voedingswaarden, verpakking, prijs en foto in.
- 🔗 **Niet-herkende ingrediënten koppelen of aanmaken** vanuit de recepteditor en de receptpagina; de naam wordt onthouden voor de volgende keer.
- ☑️ **Meerdere recepten tegelijk verwijderen**, en verwijderde standaardrecepten terugzetten bij Instellingen.
- Eenheid **stuks** in een keuzelijst; "2 stuks", "3 tenen" op de receptpagina.
- 💶 **Kies het Claude-model** (Opus, Sonnet of Haiku) bij Instellingen, met de geschatte kosten per actie.
- 🔌 **Verbinding testen** voor Claude bij Instellingen, met duidelijke foutmeldingen (sleutel, tegoed, verbinding).

## Nieuw in v2.6

- 🔥 **Calorieëndagboek** per persoon: zoek een recept (per portie) of ingrediënt (per gram), scan een barcode of vul zelf kcal in.
  Dagdoel op basis van lengte, leeftijd, gewicht, activiteit en doel (afvallen, behouden, aankomen), met eiwit, koolhydraten, vet en vezels.
- ✓ **Gekoppeld aan de planner**: vink een geplande maaltijd af als ‘gegeten’ en hij staat in je dagboek. Per dag zie je in de planner je kcal en gewicht.
- ⚖️ **Gewichtslog** met trendlijn (gemiddelde van 7 dagen), verandering per week, afstand tot je doelgewicht en BMI.
- 📆 **Agenda-abonnement** (Google, Apple, Outlook): geplande maaltijden, per dag je calorieën en je gewichtsmetingen in je eigen agenda.
  De link staat bij Instellingen → Agenda-koppeling.

## Nieuw in v2.5

- 📱 **Mobiele app voor Android** (download de APK) en **iPhone** (via Safari → Zet op beginscherm), met eigen icoon.
  Zie [Mobiele app](#mobiele-app).
- 🔑 Inlogpagina bij `APP_PASSWORD` (in plaats van het browser-inlogvenster), zodat inloggen ook in de app werkt.

## Nieuw in v2.4

- 🔄 **Automatische updates:** nieuwe versies worden automatisch gebouwd en 's nachts op je server geïnstalleerd,
  zonder dat je bestanden hoeft aan te passen. Vóór elke update wordt een back-up van je gegevens gemaakt.
  Zie [Automatische updates](#automatische-updates).
- 📖 **50 recepten:** 34 nieuwe recepten, waaronder butter chicken met een pot Patak's en pandanrijst, bami goreng,
  lasagne, chili con carne, kipsaté, gado-gado, soepen, salades, lunch, ontbijt en een appelcrumble.
  Bestaande installaties krijgen de nieuwe recepten automatisch bij de update. Wat je zelf hebt verwijderd of aangepast, blijft zoals het is.

## Nieuw in v2.3

- 🏷️ **Echte winkelprijzen uit Open Prices:** de open prijsdatabase van Open Food Facts, met een officiële API.
  Per ingrediënt de mediaan van recente prijzen in Nederlandse winkels. Je ziet per ingrediënt welke prijzen gevonden zijn,
  en per recept hoeveel prijzen uit Open Prices komen. Zie [Over de prijzen](#over-de-prijzen).

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
- 🥩 Vlees of vis, of een ander gerecht, bij een maaltijd kiezen (niet bij de lunch); maaltijden van losse ingrediënten, met prijs
- 🍴 Uit eten met één tik
- ♻️ Restjes inplannen zonder dubbele boodschappen
- Op de telefoon: ⋯-menu per maaltijd (verplaatsen, personen, vlees erbij), daglijst om naar een dag te springen
- ✨ **Weekmenu met Claude**: kiest uit je receptenboek op basis van wensen, kooktijd, budget en huishouden

**Receptenboek**
- 50 startrecepten: Hollandse klassiekers (stamppotten, hutspot, snert, hachee, pannenkoeken), Indisch (nasi, bami, saté, gado-gado),
  pasta's, curry's (o.a. butter chicken met Patak's en pandanrijst), soepen, salades, ontbijt, lunch en een toetje
- Zoeken op naam, tag of ingrediënt; filteren op categorie, bereidingstijd en favorieten; sorteren op prijs, kcal, tijd, waardering
- Favorieten (★) en waardering (1–5 sterren)
- **Porties schalen**: − / + of snelknoppen 1–10 personen; hoeveelheden en kosten schalen mee
- **Regels tegen restjes** per ingrediënt: hele verpakking, afronden op hele stuks of een minimum
- Foto's bij alle standaardrecepten; eigen foto uploaden; recepten (ook meerdere tegelijk) verwijderen en standaardrecepten terugzetten
- Niet-herkende ingrediënten koppelen of aanmaken; de naam wordt onthouden
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
- 223 standaardingrediënten met stuksgewicht, verpakking en voedingswaarden per 100 g, waarvan 88 Jumbo bake-offbroodjes en -snacks (met allergenen)
- Foto's bij de ingrediënten (201 standaardfoto's, of je eigen foto); ingrediënt aanmaken vanuit een webwinkel-link (Claude leest de productpagina)
- Voedingswaarden uit **Open Food Facts**: per ingrediënt de mediaan van vergelijkbare Nederlandse producten, of één product dat je kiest of met de camera scant. Nutri-Score en de bron zijn per ingrediënt zichtbaar.
- Handmatig prijzen en voedingswaarden aanpassen, of laten schatten door Claude

**Dagboek en gewicht**
- Meerdere personen per huishouden, elk met een eigen dagdoel (Mifflin-St Jeor × activiteit, ± doel; of een eigen kcal-doel)
- Per maaltijdmoment (ontbijt, lunch, diner, tussendoor) toevoegen via zoeken, ‘recent gebruikt’ (één tik), barcode of snelle invoer; porties en grammen achteraf aan te passen
- ‘Kopieer gisteren’, geplande maaltijden in één keer afvinken, weekgrafiek met je doel
- Gewicht invoeren (ook met komma), grafiek met metingen en trendlijn, tabelweergave
- Agenda-abonnement (ICS) met maaltijden, dagtotalen en gewicht; geheime link, opnieuw aan te maken

**Claude** ✨ (optioneel, met je eigen API-sleutel)
- Kies het model (Opus, Sonnet of Haiku) met de geschatte kosten per actie; verbinding testen bij Instellingen

Verder: werkt op telefoon en tablet (onderbalk-navigatie, grote tikdoelen, Android-app of installeerbaar als web-app), licht/donker thema, optioneel wachtwoord,
back-up, offline inzien, live bijwerken tussen huisgenoten, agenda-abonnement. Geen account, advertenties of abonnement.

## Mobiele app

### Android

1. Open op je telefoon **[de nieuwste Android-app](https://github.com/DGerding-2307/Maaltijden-app/releases/tag/android-latest)** en download `Maaltijden.apk`.
2. Open het bestand. Sta zo nodig *Installeren van onbekende apps* toe voor je browser.
3. Vul bij de eerste start het adres van je server in, bijvoorbeeld `192.168.1.20:3000` (thuis) of je eigen domein (onderweg, met https).

De app toont je eigen Maaltijden-server. Nieuwe functies komen dus automatisch mee met de server-update; je hoeft de app zelden bij te werken.
Een nieuwe APK installeer je gewoon over de oude heen. Je kunt de camera gebruiken voor het scannen van barcodes en voor foto's.
Een andere server kies je bij **Instellingen → App → Andere server kiezen**.
Vanaf app-versie 3.0 kun je een **tweede adres** opgeven, bijvoorbeeld `192.168.1.20:3000` voor thuis en je eigen domein voor onderweg.
De app probeert eerst het eerste adres en gebruikt anders het tweede.

De APK wordt automatisch gebouwd door de GitHub-workflow *Android-app* (`mobile/`, gemaakt met [Capacitor](https://capacitorjs.com)).
Hij is ondertekend met een vaste ontwikkelaarssleutel, zodat updates over elkaar heen passen. Voor publicatie in de Play Store is een eigen sleutel nodig.

### iPhone en iPad

Open je server in **Safari**, tik op **Deel → Zet op beginscherm**. Maaltijden staat dan als app op je beginscherm (met eigen icoon,
zonder adresbalk) en is altijd de nieuwste versie. Een losse iOS-app (App Store) vereist een Mac met Xcode en een Apple-ontwikkelaarsaccount;
het Capacitor-project in `mobile/` is daarvoor de basis (`npx cap add ios`).

### Met wachtwoord

Staat `APP_PASSWORD` aan, dan krijg je in de app en in de browser een inlogpagina. Je blijft een jaar ingelogd op dat apparaat.

## Demo in de browser

`npm run demo:build` maakt in `dist-demo/` een versie die volledig in de browser draait. Hij gebruikt dezelfde frontend en datalaag,
met SQLite via [sql.js](https://sql.js.org) en opslag in de browser. Handig om de app te proberen zonder server.
Claude, Open Food Facts, Open Prices, de camera en back-up downloaden werken in de demo niet; daarvoor is de echte server nodig.

## Installeren

### Met Docker (aanbevolen, met automatische updates)

Je hebt alleen `docker-compose.yml` en een `.env` nodig; de broncode hoeft niet op je server.

```bash
mkdir maaltijden && cd maaltijden
curl -O https://raw.githubusercontent.com/DGerding-2307/Maaltijden-app/ccr-9030d78f-1ocilx/docker-compose.yml
curl -o .env https://raw.githubusercontent.com/DGerding-2307/Maaltijden-app/ccr-9030d78f-1ocilx/.env.example
# vul in .env eventueel ANTHROPIC_API_KEY in (kan ook later via Instellingen)
docker compose up -d
```

Open daarna `http://<server-ip>:3000`. Je gegevens staan in `./data`.

### Automatische updates

- Bij elke wijziging in de code bouwt GitHub automatisch een nieuw Docker-image (`ghcr.io/dgerding-2307/maaltijden-app:latest`),
  voor gewone servers en NAS-systemen (amd64) én voor de Raspberry Pi (arm64). Eerst draaien alle tests; faalt er een, dan komt er geen nieuwe versie.
- De **updater** in `docker-compose.yml` ([nicholas-fedor/watchtower](https://github.com/nicholas-fedor/watchtower), het onderhouden vervolg op Watchtower)
  kijkt elke nacht om 04:00 of er een nieuwe versie is. Zo ja: downloaden, de app herstarten, oude image opruimen. Alleen de Maaltijden-app wordt bijgewerkt.
- Bij het starten van een nieuwe versie:
  1. wordt eerst een **back-up** van de database gemaakt in `data/backups/` (de laatste 5 blijven bewaard);
  2. wordt de database automatisch bijgewerkt (nieuwe kolommen, nieuwe standaardrecepten en -ingrediënten);
  3. krijgt wie de app open heeft een melding "Er is een nieuwe versie geïnstalleerd" met een knop om te vernieuwen.
- Je ziet de geïnstalleerde versie bij **Instellingen → Versie en updates**.
- Liever direct updaten? `docker compose pull && docker compose up -d`.
- Terug naar een vorige versie: zet in `docker-compose.yml` een vaste versie, bijv. `image: ghcr.io/dgerding-2307/maaltijden-app:sha-1234567`,
  en zet zo nodig de back-up uit `data/backups/` terug als `data/maaltijden.db`.

> **Eenmalig:** het eerste image verschijnt nadat de GitHub-workflow voor het eerst heeft gedraaid. Controleer daarna op GitHub bij
> *Packages → maaltijden-app → Package settings* dat de zichtbaarheid **Public** is; anders kan je server het image niet downloaden
> (of log op de server één keer in met `docker login ghcr.io`).

**Al geïnstalleerd met `build: .` (versie 2.3 of ouder)?** Vervang één keer je `docker-compose.yml` door de nieuwe versie en
draai `docker compose up -d`. Je `data/`-map blijft gewoon in gebruik. Daarna gaan updates vanzelf.

Zelf bouwen uit de broncode kan nog steeds: `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build`.

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
node test/uat/off-mock.mjs &                                   # nagebootste Open Food Facts en Open Prices
DB_FILE=/tmp/uat.db OFF_BASE=http://localhost:3999 OPEN_PRICES_BASE=http://localhost:3999 OFF_MIN_GAP_MS=100 OPEN_PRICES_MIN_GAP_MS=50 PORT=3123 npm start &
node test/uat/uat.mjs docs/uat                                 # 22 scenario's, schermafbeeldingen in docs/uat
```

Back-up: via **Instellingen → Back-up downloaden** (alle gegevens, zonder API-sleutel), of kopieer de map `data/`
(database + geüploade foto's).

### Bereikbaar vanaf internet?

Zet dan `APP_PASSWORD` in `.env` (je krijgt een inlogpagina; werkt ook in de mobiele app) en zet de app achter een reverse proxy
met HTTPS (bijv. Caddy, Nginx Proxy Manager of Traefik). Met HTTPS kun je de app ook op je telefoon
‘Op beginscherm zetten’.

## Claude instellen

1. Maak een API-sleutel aan op [platform.claude.com](https://platform.claude.com/) (API keys → Create key).
   Een Claude-abonnement (Pro/Max) geeft geen API-toegang; het API-gebruik wordt apart afgerekend.
   Met **Claude Max of Team** krijg je wel maandelijks API-tegoed: koppel het op claude.ai via Instellingen → Billing → *API credits*,
   en maak de sleutel aan in díe gekoppelde organisatie.
2. Zet hem in `.env` als `ANTHROPIC_API_KEY`, of vul hem in bij **Instellingen** in de app.
3. Klik bij Instellingen op **Verbinding testen**. Je ziet direct of het werkt, of wat er mis is (sleutel, tegoed, internetverbinding).
4. Vul bij Instellingen ook je huishouden en voorkeuren in (aantal personen, allergieën, ‘2x per week vegetarisch’…). Claude gebruikt dit bij weekmenu’s en nieuwe recepten.

Bij **Instellingen → Claude AI** kies je het model, met de geschatte kosten per actie:

| Model | Prijs (per miljoen tokens in / uit) | ≈ per recept of weekmenu | |
|---|---|---|---|
| Claude Opus 5.5 (standaard) | $4 / $20 | $0,08 | beste kwaliteit |
| Claude Sonnet 5.5 | $2 / $10 | $0,04 | bijna even goed, half zo duur |
| Claude Haiku 5.5 | $0,10 / $0,50 | $0,002 | veruit het goedkoopst; vaker foutjes bij lastige teksten |

Met de omgevingsvariabele `CLAUDE_MODEL` zet je het model vast (de keuze in de app is dan uitgeschakeld).
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

Prijzen komen uit **[Open Prices](https://prices.openfoodfacts.org)**, de open prijsdatabase van Open Food Facts.
Het heeft een officiële, openbare API; lezen kan zonder account. Licentie: ODbL, © Open Prices-bijdragers.

- Per ingrediënt worden **recente prijzen (laatste 2 jaar) uit Nederlandse winkels** opgezocht, op drie manieren:
  1. via de **barcode**, als het ingrediënt gescand of aan een Open Food Facts-product gekoppeld is;
  2. via de **Open Food Facts-categorie** (bijvoorbeeld `en:carrots`), voor losse groente en fruit en voor verpakte producten in die categorie.
     De ~85 standaardingrediënten hebben al een categorie; je kunt hem aanpassen via ✏️;
  3. via **vergelijkbare producten** uit Open Food Facts, voor ingrediënten zonder categorie.
- Alle prijzen worden omgerekend naar een prijs per kg. De **mediaan** bepaalt de prijs van de verpakking.
  Bij een aanbieding telt de normale prijs, zodat een actie de prijs niet vertekent.
- Bij de **eerste start** haalt de app op de achtergrond prijzen op voor alle ingrediënten met een geschatte prijs.
  Nieuwe en gescande ingrediënten volgen automatisch; dat kun je uitzetten bij Instellingen.
- Via **Ingrediënten → 🏷️** zie je per ingrediënt alle gevonden prijzen (datum, winkel, prijs, prijs per kg).
- Een **zelf ingevulde prijs** wordt nooit automatisch overschreven.
  Een prijs die op basis van maar één of twee metingen sterk afwijkt, wordt eerst ter controle voorgelegd.
- **Geen prijs gevonden?** Dan blijft de geschatte prijs staan (Jumbo-niveau, 2026).
  Open Prices groeit doordat mensen prijzen toevoegen, bijvoorbeeld met een foto van hun kassabon op prices.openfoodfacts.org.

De prijs per maaltijd wordt naar verhouding berekend (300 g van een zak van 1 kg = 30% van de prijs).
De boodschappenlijst rekent met hele verpakkingen.

> Eerdere versies haalden prijzen op via de onofficiële API van de Jumbo-app. Dat is in v2.2 verwijderd; zie de geschiedenis in het UAT-rapport.

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
- `server/openprices.js` + `server/pricequeue.js` – prijzen uit Open Prices
- `server/jobqueue.js` – gedeelde achtergrondwachtrij
- `server/seed.js` – startingrediënten en -recepten

Voedingswaarden zijn benaderingen; gebruik ze als indicatie, niet als medisch advies.
Deze app is niet verbonden aan Jumbo, Open Food Facts of Anthropic.
