# 🍲 Maaltijden

Weekplanner, receptenboek en calorieëndagboek voor op je eigen server. Plan je maaltijden en krijg vanzelf een
boodschappenlijst met prijzen en voedingswaarden. Er zijn 50 Nederlandse recepten om mee te beginnen. Werkt op computer, telefoon en als Android-app.
Geen account, geen abonnement, geen advertenties.

## Laatste wijziging (v3.11.0)

- Home Assistant: een foto bij alles – elke maaltijd van vandaag, morgen en de week en elk boodschappen-artikel, met voorbeeldkaarten met foto's.
  De foto's komen via Home Assistant zelf (https), zodat ze ook via Nabu Casa te zien zijn
- 🏡 **Home Assistant**: koppel bij **Instellingen → Home Assistant** met het adres en een toegangstoken. De app stuurt alles als sensoren:
  vandaag, morgen, de week met kosten en budget, de boodschappen per afdeling, en per persoon de calorieën van vandaag en het gewicht.
  In de instellingen staan voorbeeld-YAML voor kaarten (en een automatisering) om zelf aan te passen. De app past je dashboards niet aan
- 🏠 **Boodschappen: afgevinkte in huis zetten** – na het boodschappen doen met één knop alles wat je hebt afgevinkt naar ‘Al in huis’; de lijst is weer leeg
- Opgelost: vensters sloten soms vanzelf. Naast een formulier tikken, ‘Ga’/Enter op het toetsenbord en het terug-gebaar sluiten
  een venster met ingevulde gegevens niet meer zonder te vragen
- 🛒 **Claude zoekt ingrediënten op bij Jumbo**: laat Claude een recept bedenken (of importeer er een) en onbekende ingrediënten worden
  op jumbo.com opgezocht en toegevoegd, met echte prijs, voedingswaarden, foto en productlink. Bij een ingrediënt kan het ook los: *🛒 Zoek bij Jumbo*
- 📝 **Gerechten plannen die nog geen recept zijn**: typ de naam bij het plannen en kies *‘…’ plannen*. Tik later op de maaltijd
  om er een recept van te maken (zelf of met Claude) of een bestaand recept te kiezen; het nieuwe recept wordt meteen gekoppeld
- ⬇️ **Direct updaten** vanuit de app en de website (Instellingen → Versie en updates), met een melding als er een nieuwe versie is.
  Eenmalig de stack bijwerken, zie [Updates](#updates)
- Calorieën per maaltijd in de planner, naast de prijs
- Wat je in het dagboek zet, staat ook in de planner
- 🍴 *Uit eten* met één tik bij het plannen
- Maaltijden van losse ingrediënten tonen hun prijs
- Vlees of vis toevoegen kan alleen nog bij het diner (niet bij ontbijt en lunch)
- Opgelost: bij losse ingrediënten met de regel ‘hele verpakking’ rekende de planner per persoon een hele verpakking (veel te veel kcal en een te hoge prijs)
- Gewichtsgrafiek: ligt je doelgewicht ver van je metingen, dan staat er een pijl met het doel aan de rand (de legenda toonde ‘Doel’ zonder lijn)
- Gewichtsgrafiek: een lijn door je metingen; de trend (gemiddelde van 7 dagen) is een stippellijn ernaast

## Installeren

### Unraid met Portainer

1. Open een terminal op Unraid en maak de map voor je gegevens:
   ```bash
   mkdir -p /mnt/user/appdata/maaltijden && chown 99:100 /mnt/user/appdata/maaltijden
   ```
2. Ga in Portainer naar **Stacks → Add stack**, noem hem `maaltijden` en plak dit:
   ```yaml
   services:
     maaltijden:
       image: ghcr.io/dgerding-2307/maaltijden-app:latest
       container_name: maaltijden
       restart: unless-stopped
       user: "99:100"
       ports:
         - "3000:3000"
       environment:
         UPDATER_URL: http://updater:8080
         UPDATER_TOKEN: ${UPDATE_TOKEN:-maaltijden-update}
       volumes:
         - /mnt/user/appdata/maaltijden:/app/data
       labels:
         - com.centurylinklabs.watchtower.enable=true

     updater:
       image: ghcr.io/nicholas-fedor/watchtower:1.22.3
       container_name: maaltijden-updater
       restart: unless-stopped
       volumes:
         - /var/run/docker.sock:/var/run/docker.sock
       environment:
         WATCHTOWER_LABEL_ENABLE: "true"
         WATCHTOWER_CLEANUP: "true"
         WATCHTOWER_SCHEDULE: "0 0 4 * * *"
         TZ: Europe/Amsterdam
         WATCHTOWER_HTTP_API_ENDPOINTS: update
         WATCHTOWER_HTTP_API_TOKEN: ${UPDATE_TOKEN:-maaltijden-update}
         WATCHTOWER_HTTP_API_PERIODIC_POLLS: "true"
   ```
3. Klik op **Deploy the stack** en open `http://<ip-van-je-server>:3000`.

### Andere server met Docker

```bash
mkdir maaltijden && cd maaltijden
curl -O https://raw.githubusercontent.com/DGerding-2307/Maaltijden-app/ccr-9030d78f-1ocilx/docker-compose.yml
curl -o .env https://raw.githubusercontent.com/DGerding-2307/Maaltijden-app/ccr-9030d78f-1ocilx/.env.example
docker compose up -d
```

Open daarna `http://<ip-van-je-server>:3000`. Je gegevens staan in `./data`.

### Updates

Gaan vanzelf: elke nacht om 04:00 wordt de nieuwste versie geïnstalleerd, met eerst een back-up van je gegevens.
Meteen bijwerken: in de app of op de website bij **Instellingen → Versie en updates → Nu updaten**. Staat er een nieuwe versie klaar,
dan zie je ook een melding met *Nu updaten*.

Al geïnstalleerd met een oudere stack? Neem de stack hierboven één keer over (Stacks → maaltijden → Editor → *Update the stack*).
Wil je een eigen geheime code voor de updater, zet dan bij *Environment variables* `UPDATE_TOKEN` op een zelfgekozen waarde.

### Android-app

Download `Maaltijden.apk` op je telefoon via [de nieuwste release](https://github.com/DGerding-2307/Maaltijden-app/releases/tag/android-latest),
open het bestand en vul het adres van je server in (bijv. `192.168.1.20:3000`).

### Optioneel

- **Claude (AI):** vul je API-sleutel in bij **Instellingen → Claude AI** in de app. Een sleutel maak je op [console.anthropic.com](https://console.anthropic.com).
- **Wachtwoord:** zet onder `maaltijden:` in de stack (of in `.env`) een wachtwoord. Doe dit zeker als de app vanaf internet bereikbaar is.
  ```yaml
       environment:
         APP_PASSWORD: kies-een-wachtwoord
  ```

Meer uitleg over alle functies staat in de [handleiding](docs/handleiding.md).
