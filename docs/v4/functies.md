# Maaltijden 4.0 – uitwerking van de nieuwe functies

De app staat nu op v3.13.0. Deze grote vernieuwing wordt daarom **versie 4.0**.
Alles wat er al is (planner, recepten, boodschappen, Home Assistant, Claude, Android-app) blijft werken.
Het dagboek wordt het nieuwe hart van de app: het scherm **Vandaag**, met je maatje erbij.

---

## 1. Nog gebruiksvriendelijker

**Doel:** eten loggen in maximaal 3 tikken, zonder uitleg nodig.

- **Nieuw startscherm ‘Vandaag’** (in plaats van de planner). Bovenaan het maatje, daaronder één kaart met
  de calorieën van vandaag (ring) en eiwit / koolhydraten / vet, en daaronder de maaltijden van vandaag.
- **Eén grote knop ‘+ Eten loggen’** onderaan het scherm, op elk scherm. Die opent een paneel met drie keuzes:
  1. 📷 **Foto maken** (AI herkent je eten)
  2. 🔎 **Zoeken** (recepten, ingrediënten, producten, barcode)
  3. ⚡ **Snel**: wat je vaak eet en wat er voor vandaag gepland staat, met één tik
- **Rustigere navigatie**: onderaan nog maar 5 tabbladen: *Vandaag · Planner · ➕ · Recepten · Meer*.
  Boodschappen, Ingrediënten en Instellingen zitten onder *Meer* (op de computer blijft alles in de bovenbalk).
- **De app raadt de maaltijd**: om 8 uur staat *Ontbijt* al gekozen, om 18 uur *Diner*.
- **Ongedaan maken in plaats van vragen**: na verwijderen verschijnt *‘Ongedaan maken’* in plaats van een ‘Weet je het zeker?’-venster.
- **Kennismaking (eerste keer)**: in 3 stappen – maatje een naam geven, je doel kiezen, herinneringen aanzetten.
- **Grotere knoppen**, rustiger kleuren, één lettertype (Nunito), duidelijke lege toestanden met het maatje.

## 2. Schattig dierenmaatje

**Doel:** een getekend, geanimeerd hondje dat het loggen leuk maakt (zoals de wasbeer in BitePal).

- **Het hondje** is een rond, getekend puppy (crème met lichtbruine flaporen), getekend als SVG.
  Daardoor is het haarscherp op elk scherm, klein van formaat en werkt het ook offline.
- **Animaties** (CSS, zuinig voor de batterij en uit te zetten bij ‘Minder beweging’ op je telefoon):
  - *Rust*: ademt, knippert met de ogen, kwispelt rustig, oor flapt af en toe
  - *Blij*: springt, kwispelt hard, hartjes erboven
  - *Trots*: borst vooruit, sterretjes
  - *Bezorgd*: kopje scheef, oortjes omlaag (nooit boos of verdrietig)
  - *Slaperig*: ’s avonds laat of als je de hele dag niets gelogd hebt, met ‘zzz’
  - *Hongerig*: likt zijn snoet, bij een herinnering
- **Aaien**: tik op het hondje en het reageert (hartje, blafje in tekst).
- **Naam**: je kiest zelf een naam (voorstel: *Koekje*). Per persoon in het huishouden een eigen maatje.
- **Hartjes van vandaag**: 5 hartjes boven het hondje, gevuld op basis van hoe gezond je vandaag eet (zie 3).
- **Reeks**: 🔥 aantal dagen achter elkaar gelogd, zichtbaar bij het maatje.

## 3. Aanmoediging door je maatje

**Doel:** na elke maaltijd een korte, leuke en eerlijke reactie die helpt gezonder te eten, zonder te betuttelen.

- **Gezondheidsscore per maaltijd (0–100)**, berekend uit de voedingswaarden:
  - pluspunten: eiwit, vezels, groente en fruit, kcal passend bij de maaltijd (bijv. diner ± 30% van je dagdoel)
  - minpunten: veel suiker, verzadigd vet, zout, of veel meer kcal dan bij de maaltijd past
  - de score wordt omgezet in een **stemming** van het hondje: *super* (≥ 75), *goed* (55–74), *oké* (35–54), *let op* (< 35)
- **Melding in een tekstballonnetje** zodra je iets logt, bijvoorbeeld:
  - super: *“Wauw, wat een kleurrijk bord! Mijn staart kwispelt ervan 🐾”*
  - goed: *“Lekker bezig! Nog een handje groente erbij en het is perfect.”*
  - oké: *“Prima! Misschien vanavond wat extra groente?”*
  - let op: *“Mmm, dat was smullen! Morgen samen weer een gezonde dag? 💛”*
- **Slimme context**: de eerste log van de dag, je reeks, je doel bijna gehaald, net over je doel, veel eiwit, weinig groente vandaag.
- **Variatie**: per stemming tientallen zinnen, nooit twee keer achter elkaar dezelfde.
- **Optioneel met Claude** (instelling *‘Persoonlijke berichten met AI’*): Claude schrijft een korte, persoonlijke zin op basis van wat je at.
  Zonder API-sleutel of offline gebruikt de app de ingebouwde zinnen.
- **Hartjes van de dag** = gemiddelde score van de dag (5 hartjes = alles super).

## 4. Herinneringen op je telefoon

**Doel:** nooit meer vergeten te loggen – maar alleen een herinnering als het nodig is.

- **Per maaltijd een tijd** (standaard: ontbijt 9:00, lunch 13:00, diner 19:00, aan/uit per maaltijd) en een avondoverzicht (21:00, optioneel).
- **Alleen als je nog niets gelogd hebt** voor die maaltijd. Al gelogd? Dan geen melding.
- **Het maatje stuurt de melding**: *“Woef! Koekje heeft honger… wat heb jij als lunch gegeten? 🍽️”*
- **Tik op de melding** → de app opent direct *‘Eten loggen’* met de juiste maaltijd gekozen.
- **Drie manieren**, zodat het altijd werkt:
  1. **Android-app** – meldingen van de app zelf (ook als de app dicht is)
  2. **Webapp op het beginscherm** (iPhone en Android) – pushmeldingen via de browser
  3. **Home Assistant** – via de Companion-app op je telefoon (je hebt de koppeling al)
- **Stille uren**: geen meldingen tussen 22:00 en 7:00.

## 5. Verbeterde interface: ingrediënten aanpassen in de app

**Doel:** precies loggen wat je echt at, ook als het net anders was dan het recept.

- Bij het loggen van een **recept** én na een **AI-foto** zie je de **ingrediëntenlijst**:
  - per ingrediënt de hoeveelheid aanpassen met **– / +** of door te typen (gram, stuks)
  - ingrediënt **weglaten** (vegen of ✕) of **toevoegen** (zoeken in je ingrediënten)
  - calorieën en macro’s rekenen **direct mee** bovenaan, en het hondje reageert live
- **Achteraf aanpassen**: tik op een gelogde maaltijd → *Ingrediënten aanpassen*.
- **Opslaan als eigen versie**: *‘Bewaar als mijn versie van dit recept’* (bijv. ‘Kip kerrie – minder rijst’).
- Ook in de **recepteditor** zelf is de ingrediëntenlijst nu vingervriendelijk (grote velden, stappers).

## 6. Foto → AI berekent de calorieën

**Doel:** geen idee wat erin zit? Maak een foto en klaar.

- **Foto maken of kiezen** uit je galerij (in de app, de webapp en op de computer).
- **Claude bekijkt de foto** (het model dat je al gebruikt) en geeft terug:
  - naam van het gerecht (bijv. *‘Pasta pesto met kip en tomaatjes’*)
  - de ingrediënten met geschatte hoeveelheden in gram
  - de voedingswaarden en hoe zeker Claude is (*hoog / gemiddeld / laag*)
- Ingrediënten worden **gekoppeld aan je eigen ingrediëntenlijst** (met jouw voedingswaarden). Onbekende ingrediënten krijgen een schatting.
- Je ziet het resultaat direct in de **ingrediëntenlijst van functie 5** en past aan wat niet klopt (*“het was meer pasta”*).
- **Loggen** → het hondje reageert op hoe gezond het bord was.
- De **foto komt bij de maaltijd in je dagboek** (klein plaatje).
- Geen Claude ingesteld? Dan legt de app uit hoe je dat aanzet, en kun je via *Zoeken* loggen.

---

## Technisch in het kort

| Onderdeel | Aanpak |
|---|---|
| Maatje | SVG-hondje met CSS-animaties (`public/js/buddy.js`), stemmingen als CSS-klassen |
| Score en berichten | `server/buddy.js`: score uit voedingswaarden, zinnen per stemming, optioneel Claude |
| Ingrediënten per log | nieuwe kolom `items` (JSON) in `food_log`; voedingswaarden opnieuw berekend bij elke wijziging |
| Foto-analyse | `POST /api/ai/photo` – Claude vision met gestructureerde uitvoer, koppeling aan `ingredients` |
| Herinneringen | instellingen per persoon; server plant en verstuurt (Web Push, Home Assistant), Android-app via lokale meldingen |
| Vormgeving | nieuwe huisstijl in `style.css` (tokens), Nunito-lettertype in de app zelf (werkt offline) |
