# Gebruikersacceptatietest (UAT): Maaltijden-app v1 → v3

**Datum:** 8 oktober 2026
**Getest:** v1.0 (eerste versie), v2.0, v2.2 (barcode scannen; Jumbo-koppeling verwijderd), v2.3 (prijzen uit Open Prices), v2.6 (dagboek) en **v3.0**
**Uitslag v3.0:** 33 van de 33 scenario's geslaagd ✅ (zie [§8](#8-v3-recensies-opnieuw-bekeken-en-9-nieuwe-scenarios))

## 1. Aanpak

1. **Verwachtingen verzamelen.** We hebben recensies en vergelijkingen van maaltijdplanners en receptenapps gelezen
   (Mealime, Paprika, Plan to Eat, Mealie, Tandoor en de AH/Allerhande-app). Daaruit kwamen de verwachtingen in §2.
2. **Scenario's opstellen.** Per verwachting staat er een concrete gebruikerstaak in §3, zoals ‘verplaats op je telefoon een maaltijd naar morgen’.
3. **v1 beoordelen.** Elk scenario is handmatig nagelopen tegen de functies van v1. Wat ontbrak of niet werkte staat in §4. UAT-20 is in v1 niet gemeten.
4. **v2 bouwen en opnieuw testen.** De scenario's zijn als geautomatiseerde browsertest uitgevoerd in Chromium,
   op desktop (1366×900) en telefoon (390×844). Het script staat in [`test/uat/uat.mjs`](../test/uat/uat.mjs).
   Tijdens de eerste v2-ronde vielen 3 scenario's uit. Die zijn opgelost en daarna is alles opnieuw getest (§5).

**Beperking van de test:** vanuit de testomgeving waren Open Food Facts, Open Prices en de Claude-API niet bereikbaar.
- Open Food Facts is getest tegen een nagebootste server met hetzelfde antwoordformaat als de echte API
  ([`test/uat/off-mock.mjs`](../test/uat/off-mock.mjs)). De automatische tests in `test/openfoodfacts.test.js` werken op dezelfde manier.
- Claude-functies zijn alleen getest op de vorm van het verzoek en op de foutafhandeling zonder sleutel.
- Na installatie op je eigen server is het verstandig om één keer handmatig de 🥫- en ✨-knoppen te proberen.

## 2. Wat gebruikers verwachten (uit recensies)

| # | Verwachting | Waar het vandaan komt |
|---|---|---|
| V1 | Geen abonnement, betaalmuur of advertenties | Veruit de meest gehoorde klacht in app-recensies van 2026; gebruikers vragen om eenmalig betalen |
| V2 | Snel een week plannen, ook met vrije tekst (‘uit eten’) | Gebruikers willen plannen ‘zoals in een agenda’, zonder gedoe met ingrediënten |
| V3 | Automatisch een boodschappenlijst, per afdeling | Een van de meest geprezen functies (Mealime, Tandoor) |
| V4 | Vóór het boodschappen doen wegstrepen wat je al in huis hebt | Mealie-recensie: een controlemoment waarop je bestaande voorraad uitvinkt |
| V5 | Samen plannen en boodschappen doen, met wijzigingen direct zichtbaar | Recensies prijzen ‘realtime sync met je partner’; Plan to Eat wordt gekozen om te delen met het gezin |
| V6 | Eigen recepten toevoegen vanaf websites of video | Mealime krijgt kritiek omdat je geen eigen recepten kunt toevoegen; importeren wordt gezien als tijdbesparing |
| V7 | Porties schalen | Bij Mealie noemen gebruikers het ontbreken hiervan een reden om bij Paprika te blijven |
| V8 | Voedingswaarden per portie, uit een betrouwbare bron | Tandoor wordt geprezen om automatisch berekende voedingswaarden |
| V9 | Koken met wat je nog hebt / minder verspillen | Allerhande ‘Scan & Kook’, ‘Reverse Recipes’ in Yummy; herinneringen tegen voedselverspilling |
| V10 | Op budget en dieetwensen filteren | Allerhande: menu's ‘binnen een budget’ en ‘met dieetwensen’; vraag naar meer vegetarische opties |
| V11 | Recepten offline beschikbaar | Genoemd als pluspunt bij Paprika, Yummy en Recipes Books |
| V12 | Eigen foto's en een back-up van je recepten | Recepten-apps benadrukken eigen foto's en back-ups |
| V13 | Goed bruikbaar op telefoon én tablet | Klachten over onoverzichtelijke schermen en slechte iPad-ondersteuning |
| V14 | Niet overweldigend | Paprika wordt ‘krachtig maar soms overweldigend’ genoemd |

## 3. Scenario's en uitslag

| ID | Scenario | Verw. | v1 | v2 |
|---|---|---|---|---|
| UAT-01 | Week plannen op desktop door recepten te slepen | V2 | ✅ | ✅ |
| UAT-02 | Op de telefoon een maaltijd naar een andere dag verplaatsen | V2, V13 | ❌ slepen werkt niet op een touchscreen en er was geen alternatief | ✅ via ⋯-menu |
| UAT-03 | ‘Uit eten’ plannen en later aanpassen | V2 | ⚠️ toevoegen kon, aanpassen niet | ✅ |
| UAT-04 | Porties schalen van 4 naar 6 personen | V7 | ✅ | ✅ 1.200 g → 1.800 g |
| UAT-05 | Voedingswaarden per persoon met zichtbare bron | V8 | ⚠️ alleen NEVO-schattingen, geen bron per ingrediënt | ✅ Open Food Facts + bron per ingrediënt |
| UAT-06 | Ingrediënt koppelen aan Open Food Facts (zoeken, mediaan) | V8 | ❌ | ✅ |
| UAT-07 | Product opzoeken of scannen met de barcode | V8 | ❌ | ✅ (scannen met camera in Chrome/Android) |
| UAT-08 | Automatische boodschappenlijst per afdeling met kosten | V3 | ✅ | ✅ |
| UAT-09 | ‘Heb ik al in huis’ uitsluiten | V4 | ❌ alleen afvinken als gekocht | ✅ 🏠-knop, totaalbedrag daalt |
| UAT-10 | Afvinken op telefoon is zichtbaar op het andere apparaat | V5 | ❌ alleen na handmatig verversen | ✅ binnen ~5 s |
| UAT-11 | Restjes inplannen zonder dubbele boodschappen | V9 | ❌ | ✅ ♻️ restjes, telt mee voor voeding maar niet voor kosten |
| UAT-12 | ‘Wat kan ik maken?’ met wat je in huis hebt | V9 | ⚠️ zoeken op één ingrediënt | ✅ meerdere ingrediënten, % in huis + wat mist |
| UAT-13 | Snelfilters: vegetarisch, snel, goedkoop | V10 | ⚠️ alleen sorteren op prijs | ✅ |
| UAT-14 | Eigen foto bij een recept | V12 | ⚠️ alleen via een URL | ✅ uploaden, automatisch verkleind |
| UAT-15 | Back-up downloaden en terugzetten | V12 | ❌ | ✅ (zonder API-sleutel) |
| UAT-16 | Recepten offline bekijken | V11 | ❌ alleen de app-schil werkte offline | ✅ laatst bekeken gegevens + melding ‘offline’ |
| UAT-17 | Kookmodus met stappen en timer | — | ✅ | ✅ |
| UAT-18 | Geen account, advertenties of betaalmuur | V1 | ✅ | ✅ |
| UAT-19 | Duidelijke uitleg als Claude niet is ingesteld | V14 | ✅ | ✅ |
| UAT-20 | Alle hoofdpagina's op telefoon zonder horizontaal scrollen | V13 | – niet gemeten | ✅ (na herstel, zie §5) |
| UAT-21 | Ingrediënt aan een recept toevoegen door de barcode te scannen *(v2.2)* | V6, V8 | ❌ | ✅ gekoppeld aan bestaand ingrediënt, met voedingswaarden uit Open Food Facts |
| UAT-22 | Prijzen uit een officiële, open bron *(v2.3)* | V10 | ❌ alleen schattingen | ✅ Open Prices: mediaan van Nederlandse winkelprijzen, bron zichtbaar per ingrediënt en recept |
| UAT-23 | Calorieën bijhouden op de telefoon: zoeken, hoeveelheid, geplande maaltijd afvinken *(v2.6)* | — | ❌ | ✅ hoeveelheid × voedingswaarde klopt met het dagtotaal |
| UAT-24 | Gewicht loggen met trendgrafiek; dagboek en gewicht in de agenda *(v2.6)* | — | ❌ | ✅ komma-invoer, grafiek, ICS-feed met dagtotaal en gewicht |

**v1:** 6 geslaagd, 5 gedeeltelijk, 10 niet, 1 niet gemeten. **v2.3:** 22 van 22 geslaagd. **v2.6:** 24 van 24 geslaagd.

UAT-21 en UAT-22 zijn getest tegen een nagebootste Open Food Facts- en Open Prices-server (zelfde antwoordformaat als de echte API, afgeleid uit de broncode van Open Prices). De camera is in de testbrowser vervangen door het intypen van de barcode.

**Jumbo-koppeling verwijderd (v2.2).** v2.1 had een scenario ‘boodschappenlijst naar de Jumbo-app’ (via jumbo-wrapper), en prijzen konden bij Jumbo worden opgehaald.
Beide gebruikten de niet-openbare API van de Jumbo-app. Die was niet te verifiëren, en jumbo-wrapper bleek verouderd en had een fout in het mandje.
De functies zijn daarom verwijderd. Sinds v2.3 komen prijzen uit Open Prices, de open prijsdatabase van Open Food Facts met een officiële API.

## 4. Bevindingen in v1 en wat er in v2 is veranderd

| Bevinding v1 | Ernst | Oplossing in v2 |
|---|---|---|
| Voedingswaarden zijn vaste NEVO-gemiddelden; voor nieuwe ingrediënten alleen een schatting van Claude | Hoog | **Open Food Facts-koppeling.** Per ingrediënt de mediaan van vergelijkbare Nederlandse producten, of één gekozen of gescand product. De bron en Nutri-Score zijn zichtbaar. Nieuwe ingrediënten worden automatisch aangevuld. |
| Op de telefoon kun je niets verplaatsen | Hoog | ⋯-menu per maaltijd: verplaatsen (dag/moment), personen, titel en notitie |
| Geen ‘heb ik al’ op de boodschappenlijst | Hoog | 🏠-knop, sectie ‘Al in huis’ en de optie ‘altijd in huis’ (gaat dan naar de voorraadkast) |
| Huisgenoten zien elkaars wijzigingen niet | Middel | Planner en boodschappenlijst verversen vanzelf, maar niet terwijl je typt of een venster open hebt |
| Geen manier om restjes te plannen | Middel | ♻️ Restjes inplannen met ‘kook N porties extra’. De restjes tellen niet mee voor de boodschappen. |
| Zoeken op wat je in huis hebt is beperkt | Middel | ‘🧺 Wat kan ik maken?’ met meerdere ingrediënten, gesorteerd op hoeveel je al hebt. Claude kan ook een recept bedenken op basis van een foto van je koelkast. |
| Geen back-up | Middel | Back-up downloaden en terugzetten via Instellingen |
| Niet offline te gebruiken | Middel | Service worker bewaart de laatst bekeken recepten, planning en boodschappenlijst |
| Foto alleen via een URL | Laag | Foto uploaden; wordt verkleind tot max. 1600 px |
| Geen snelfilters voor dieet en budget | Laag | Snelfilters 🌱 vegetarisch, ⚡ ≤ 30 min, 💶 ≤ € 2,50 p.p. |
| Een recept dat via de receptpagina op de lijst wordt gezet, staat los en zonder kopje in de planner | Laag | Krijgt nu het kopje ‘extra’ |

## 5. Uitgevallen scenario's in de eerste v2-ronde

| Scenario | Wat er misging | Oorzaak | Opgelost |
|---|---|---|---|
| UAT-10 live-sync | De eerste wijziging van een huisgenoot kwam niet door | De beginstand werd pas na 6 s vastgelegd, dus een vroege wijziging viel weg | Beginstand direct bij het openen vastleggen |
| UAT-12 wat kan ik maken | ‘rijst’ telde niet als zilvervliesrijst | Er werd maar aan één ingrediënt uit de database gekoppeld | Ook zoeken op woorden in de ingrediëntnaam |
| UAT-20 mobiel | Boodschappenpagina 400 px breed (scrollen) | De knop ‘Toon voorraadkast’ brak niet af naar de volgende regel | Tekst mag nu afbreken |
| UAT-14 foto | Gemeld als fout, maar de foto werkte | Timingfout in het testscript zelf | Script wacht nu tot de pagina klaar is |

## 6. Open punten en aanbevelingen

- **Open Food Facts met echte gegevens controleren.** Bij de eerste start worden alle ingrediënten met Open Food Facts vergeleken
  (op de achtergrond, ~6,5 s per ingrediënt, dus ±12 minuten).
  Als een waarde sterk afwijkt van de huidige (meer dan 2× zo hoog of laag), wordt hij **niet** automatisch overgenomen. Hij komt dan bij
  *Ingrediënten → Overgeslagen*, waar je hem met één klik toch kunt gebruiken. Dit voorkomt bijvoorbeeld dat ‘ui’ de waarden van gebakken uitjes krijgt.
- **Open Prices met echte gegevens controleren.** Hoeveel Nederlandse prijzen erin staan, kon vanuit de testomgeving niet worden bekeken. Ingrediënten zonder prijzen houden hun schatting.
- **Recepten importeren uit video's** (TikTok/Instagram/YouTube) werkt alleen als de beschrijving tekst bevat. Volledige video-ondersteuning is niet gebouwd.
- **Inloggen per huisgenoot** is er niet. De app gaat uit van één huishouden met één gedeeld (optioneel) wachtwoord.

## 7. Bronnen

- [Best Meal Planner app (2026) – Welling](https://www.welling.ai/articles/best-mealplanning-app-2026)
- [MealPrepPro – recensieoverzicht](https://mwm.ai/apps/mealpreppro-planner-recipes/1249805978) · [ReciMe – recensies](https://marlvel.ai/apps/recime-recipes-meal-planner/reviews) · [Meal Planner & Grocery List – recensies](https://justuseapp.com/en/app/1619509620/meal-planner-grocery-list/reviews)
- [Mealime vs Paprika – FoodiePrep](https://www.foodieprep.ai/blog/mealime-vs-paprika) (door een concurrent geschreven) · [Healthline – best meal planning apps](https://healthline.com/nutrition/best-meal-planning-apps) · [Fortune – best meal planning apps](https://dc.fortune.com/article/best-meal-planning-apps)
- [Tandoor vs Mealie vs KitchenOwl – Cooklang](https://cooklang.org/blog/42-tandoor-vs-mealie-vs-kitchenowl/) · [Mealie review – Cooklang](https://cooklang.org/blog/40-mealie-review/) · [Mealie – AlternativeTo](https://alternativeto.net/software/mealie/about) · [Without Mealie I would starve – Galaxus](https://www.galaxus.at/en/page/digitalization-in-the-kitchen-without-mealie-i-would-starve-43165)
- [AH – boodschappenlijstje maken](https://ah.nl/inspiratie/besparen/boodschappenlijstje-maken) · [Allerhande weekmenu's](https://ah.nl/allerhande/wat-eten-we-vandaag/weekmenu)
- App-store-overzichten: [Yummy](https://apps.appfollow.io/ios/yummy/1122448943?country=it), [All My Recipes](https://apps.appfollow.io/ios/all-my-recipes/314740811?country=hk)
- Open Food Facts: [API-documentatie](https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/), [gebruiksvoorwaarden API](https://support.openfoodfacts.org/help/en-gb/12-api-data-reuse/94-are-there-conditions-to-use-the-api), [Search API v2](https://wiki.openfoodfacts.org/Search_API_V2)

Veel recensiebronnen zijn overzichtssites of door concurrenten geschreven. Zie de verwachtingen daarom als richting, niet als exacte cijfers.

## 8. v3: recensies opnieuw bekeken en 9 nieuwe scenario's

Voor v3 zijn alle functies op een rij gezet en opnieuw naast recensies gelegd. Dit keer ook van **calorie-apps**, omdat de app sinds v2.6 een dagboek heeft.
Daarnaast is gekeken naar wat er bij het eigen gebruik in de Android-app misging.

### 8.1 Wat recensies zeggen (tweede ronde)

| # | Klacht of wens in recensies | Hoe Maaltijden het doet |
|---|---|---|
| V15 | **Betaalmuur en abonnementen.** De meest gegeven reden voor 1-ster-recensies bij calorie-apps; ook bij Samsung Food. Paprika wordt juist geprezen om de eenmalige prijs. | Geen account, abonnement of advertenties; alles draait op je eigen server (UAT-18) |
| V16 | **Logging kost te veel tikken.** Het dagboek bijhouden moet snel; gebruikers haken af als elk item zoeken vereist. | Nieuw: **‘Recent gebruikt’**, met één tik opnieuw toevoegen. Daarnaast ‘kopieer gisteren’ en geplande maaltijden afvinken (UAT-23, UAT-33). |
| V17 | **Fouten in de voedingsdatabase.** Door gebruikers ingevoerde producten met verkeerde waarden. | Bron per ingrediënt zichtbaar (NEVO, Open Food Facts, Jumbo-productinformatie). Sterk afwijkende waarden worden niet automatisch overgenomen (UAT-05, UAT-06). |
| V18 | **Schuldgevoel en druk.** Rode cijfers en streaks worden als demotiverend ervaren. | Geen streaks of meldingen. Het dagdoel is een richtlijn en het gewicht toont een trend (gemiddelde van 7 dagen) in plaats van dagschommelingen (UAT-24). |
| V19 | **Onoverzichtelijk en bugs op de telefoon.** Knoppen te klein, inhoud achter balken, vensters die blijven hangen. | Getest met nagebootste systeembalken en vingergrootte (UAT-25, UAT-26). |
| V20 | **Niet flexibel genoeg.** Je moet een recept maken voor elke variatie of voor een snel ‘broodje’. | Vlees of vis los kiezen bij een gerecht, een gerecht als bijgerecht, en maaltijden van losse ingrediënten (UAT-27 t/m UAT-29). |
| V21 | **Verspilling door verpakkingen.** Het recept vraagt 150 g, de winkel verkoopt 400 g. | Regels per ingrediënt: hele verpakking, afronden op hele stuks, of een minimum (UAT-30) |

### 8.2 Bevindingen bij eigen gebruik (Android-app)

| Bevinding | Oplossing in v3 |
|---|---|
| In de Android-app viel de kop onder de statusbalk en de onderste knoppen achter de navigatiebalk (edge-to-edge) | Ruimte voor de systeembalken op elke pagina, in elk venster en bij meldingen |
| Het was niet duidelijk dat je vlees bij een maaltijd kunt kiezen | Een duidelijke knop **🥩 + Vlees of vis** op elk gerecht zonder vlees, en een keuzelijst bij het inplannen |
| Kleine knoppen op het touchscreen | Minimaal 44 px per knop, invoervelden van 16 px (geen inzoomen), daglijst om snel naar een dag te springen |
| Een geopend venster bleef staan bij de terugknop | Vensters sluiten bij het wisselen van pagina |

### 8.3 Nieuwe scenario's en uitslag

| ID | Scenario | Verw. | v2.6 | v3 |
|---|---|---|---|---|
| UAT-25 | Telefoon/app: niets verdwijnt achter de status- of navigatiebalk | V19 | ❌ kop onder statusbalk in de app | ✅ 5 pagina's met nagebootste balken (32/24 px); vensters sluiten bij navigeren |
| UAT-26 | Touchscreen: knoppen groot genoeg om met een vinger te raken | V19 | – niet gemeten | ✅ alle gemeten knoppen ≥ 44 px (richtlijn Apple 44 pt, Google 48 dp) |
| UAT-27 | Vlees of vis bij een gerecht zonder vlees, zonder nieuw recept | V20 | ❌ | ✅ op het kaartje en op de boodschappenlijst |
| UAT-28 | Maaltijd van losse ingrediënten (zonder recept) | V20 | ⚠️ alleen vrije tekst, zonder boodschappen | ✅ croissant en banaan als ontbijt op de planner |
| UAT-29 | Een gerecht als vlees bij een ander gerecht | V20 | ❌ | ✅ |
| UAT-30 | Minder restjes: hele verpakking, hele stuks en een minimum | V21 | ❌ | ✅ |
| UAT-31 | Recepten verwijderen (ook meerdere) en standaardrecepten terugzetten | V14 | ❌ | ✅ |
| UAT-32 | Niet-herkend ingrediënt koppelen of aanmaken vanuit het recept | V8 | ❌ | ✅ en de naam wordt onthouden |
| UAT-33 | Snel loggen: recent gebruikt met één tik, bake-off uit de Jumbo-lijst | V16 | ⚠️ alleen zoeken | ✅ |

UAT-01 t/m UAT-24 zijn in dezelfde ronde opnieuw uitgevoerd en blijven geslaagd. **v3.0: 33 van 33 geslaagd.**

### 8.4 Uitgevallen scenario's in de eerste v3-ronde

| Scenario | Wat er misging | Oorzaak | Opgelost |
|---|---|---|---|
| UAT-22 Open Prices | Nog geen Open Prices-prijs bij ‘wortel’ | Met 223 ingrediënten duurt het ophalen langer dan de test wachtte | Het script wacht tot de prijzen binnen zijn |
| UAT-25 systeembalken | Het menu onderaan was niet aan te tikken | Het testscript tikte op het menu terwijl een venster openstond. Dat is zo bedoeld, want de achtergrond van het venster dekt het menu af. | Het script gebruikt nu de terugknop, net als op de telefoon |
| UAT-26 touchscreen | Geslaagd met een ondergrens van 32 px, maar knoppen waren 32–42 px | De eerste ondergrens was te ruim | Ondergrens naar 44 px (richtlijn Apple; Google adviseert 48 dp). Knoppen, tags, sterren, menu's en de daglijst vergroot. |
| UAT-27, 28, 31 | Klik op een knop liep vast | Een venster van een eerder mislukt scenario stond nog open, en knoppen werden ook buiten het venster gezocht | Zoeken binnen het venster; na een fout worden vensters gesloten |

### 8.5 Open punten

- **Jumbo bake-off:** de voedingswaarden en allergenen komen uit het Jumbo-productinformatieblad (8 mei 2023).
  Gewicht per stuk en prijs zijn geschat, omdat de Jumbo-website vanuit de testomgeving niet bereikbaar was. Pas ze zo nodig aan bij *Ingrediënten*.
- **Standaardfoto's van ingrediënten:** 201 van de 223 ingrediënten hebben een foto met een vrije licentie (in twee zoekrondes). Voor de rest (o.a. halfvolle melk, azijn, broccoli en een paar bake-offbroodjes)
  is geen passende vrije foto gevonden. Je kunt zelf een foto uploaden of een webwinkel-link gebruiken.
- **Calorie-apps** hebben grote, gecontroleerde productdatabases. Maaltijden gebruikt Open Food Facts (open, door gebruikers ingevoerd) en NEVO-schattingen.
  Controleer daarom bij producten die je vaak eet de waarden op de verpakking.

### 8.6 Bronnen v3

- Calorie-apps: [1-ster-recensies van calorie-apps (2026) – Unstar](https://unstar.app/blog/calorie-tracking-apps-ranked-1-star-reviews-2026) ·
  [Calorie- en voedingsapps in klantfeedback – Kimola](https://kimola.com/blog/understanding-calorie-tracking-and-nutrition-apps-through-customer-feedback-analysis) ·
  [YAZIO-feedbackrapport – Kimola](https://kimola.com/reports/unveil-insights-with-yazio-calorie-counter-diet-feedback-report-app-store-us-147620) ·
  [50.000 recensies van calorie-apps – Nutrola](https://nutrola.app/en/blog/we-analyzed-50000-calorie-tracker-reviews-what-users-actually-complain-about-2026) (door een concurrent geschreven; niet volledig te openen)
- Maaltijdplanners: [Samsung Food – AppFollow](https://apps.appfollow.io/ios/samsung-food-meal-planning/1133637674?country=ee) ·
  [Paprika 3 – AppFollow](https://apps.appfollow.io/ios/paprika-recipe-manager-3/1303222868?country=us) ·
  [MealPrepPro – AppFollow](https://apps.appfollow.io/ios/mealpreppro-planner-recipes/1249805978?country=ca) ·
  [Mealime – recensies](https://justuseapp.com/en/app/1079999103/mealime-meal-plans-recipes/reviews) ·
  [Meal Planner & Grocery List – recensies](https://justuseapp.com/en/app/6443649573/meal-planner-grocery-list/reviews) ·
  [Plan to Eat – productrecensies](https://plantoeat.com/blog/category/product-reviews) ·
  [Meal planning apps in 2026 – FoodiePrep](https://www.foodieprep.ai/blog/meal-planning-apps-in-2026-which-tools-actually-simplify-your-kitchen) (door een concurrent geschreven) ·
  [Crouton – RecLeague](https://recleague.com/entity/88720-crouton) ·
  [Beste recepten-apps voor iPhone en iPad – iCulture](https://www.iculture.nl/gids/beste-recepten-apps-iphone-ipad/)

Ook hier geldt: veel bronnen zijn overzichtssites of door concurrenten geschreven. Zie ze als richting.

## Bijlage: schermafbeeldingen

| | |
|---|---|
| ![Planner](uat/01-planner.png) Planner met restjes (♻️) en vrije tekst | ![Open Food Facts](uat/06-off-zoeken.png) Voedingswaarden zoeken in Open Food Facts |
| ![Verplaatsen op telefoon](uat/02-verplaatsen-mobiel.png) Verplaatsen op de telefoon | ![Boodschappen mobiel](uat/10-boodschappen-mobiel.png) Boodschappenlijst met 🏠 ‘heb ik al’ |
| ![Wat kan ik maken](uat/12-wat-kan-ik-maken.png) ‘Wat kan ik maken?’ | ![Offline](uat/16-offline.png) Offline met melding |
| ![Barcode in recept](uat/21-barcode-recept.png) Ingrediënt scannen in de recepteditor | ![Open Prices](uat/22-open-prices.png) Winkelprijzen uit Open Prices |
| ![Dagboek](uat/23-dagboek.png) Calorieëndagboek op de telefoon | ![Gewicht](uat/24-gewicht.png) Gewichtslog met trendlijn |
| ![Vlees erbij](uat/27-vlees-erbij.png) *(v3)* Vlees kiezen bij een gerecht | ![Losse ingrediënten](uat/28-losse-ingredienten.png) *(v3)* Maaltijd van losse ingrediënten |
| ![Systeembalken](uat/25-systeembalken.png) *(v3)* App met systeembalken | ![Recent gebruikt](uat/33-recent.png) *(v3)* Recent gebruikt, één tik |

*De voedingswaarden en barcodes op de schermafbeeldingen komen van de nagebootste Open Food Facts-server, niet van echte producten.*
