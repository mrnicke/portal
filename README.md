# Homelab Portal
Dashboard + admin för att styra innehållet på förstasidan. Består av två containrar: React-frontend + Node/Express-API (host network, läser Docker-socket för status).

## Installation (från GitHub)
1) Klona och gå till repo:
   ```bash
   git clone <repo-url>
   cd portal
   ```
2) Skapa `.env` (utgår från `.env.example`) och sätt en egen admin-nyckel:
   ```bash
   cp .env.example .env
   echo "ADMIN_KEY=din-hemliga-nyckel" >> .env
   # valfritt: VITE_API_BASE=http://<host>:3005
   ```
3) Starta allt:
   ```bash
   docker compose up -d --build
   ```
   - Frontend: `http://<host>:8088`
   - API (host network): `http://<host>:3005`

### Volymer och data
- `portal-api/data/content.json` (mountad som volym) innehåller sparat innehåll. Byts inte ut vid rebuild. Ignoreras i git.
- API behöver Docker-socket (`/var/run/docker.sock`) och valfria mounts till `/mnt/data` och `/mnt/backupshare` för diskstatus.

## Admin / innehåll
- Adminpanelen finns nederst på sidan. Ange din `ADMIN_KEY` i fältet “Admin-nyckel”.
- Dra-och-släpp för att ordna sektioner, quick actions, servicegrupper och tjänster. Klicka “Spara innehåll” för att skriva till API:t (PUT `/content` med `x-admin-key`).
- Nya värden sparas i `content.json` och laddas automatiskt vid start.

## Utveckling
1) Frontend:
   ```bash
   cd frontend
   npm install
   npm run dev -- --host 0.0.0.0 --port 5173
   ```
2) API (om du vill köra lokalt):
   ```bash
   cd portal-api
   npm install
   ADMIN_KEY=devkey node index.js
   ```

## Deploy / drift
- Standardkommando: `docker compose up -d --build`
- Byt admin-nyckel i `.env` vid behov och starta om stacken.
- Pusha inte hemliga `.env`-filer till GitHub.
