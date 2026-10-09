# 🍲 Maaltijden

Weekplanner, receptenboek en calorieëndagboek voor op je eigen server. Plan je maaltijden en krijg vanzelf een
boodschappenlijst met prijzen en voedingswaarden. Er zijn 50 Nederlandse recepten om mee te beginnen. Werkt op computer, telefoon en als Android-app.
Geen account, geen abonnement, geen advertenties.

## Laatste wijziging (v3.2)

- Calorieën per maaltijd in de planner, naast de prijs
- Wat je in het dagboek zet, staat ook in de planner
- 🍴 *Uit eten* met één tik bij het plannen
- Maaltijden van losse ingrediënten tonen hun prijs
- Vlees of vis toevoegen kan alleen nog bij het diner (niet bij ontbijt en lunch)

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
Meteen bijwerken: in Portainer de stack openen en **Update the stack** met *Re-pull image* aan, of `docker compose pull && docker compose up -d`.

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
