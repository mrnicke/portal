# Portal deployment

## Development

1. Install dependencies
   ```bash
   cd frontend
   npm install
   ```
2. Start the dev server (accessible on port 5173)
   ```bash
   npm run dev -- --host 0.0.0.0 --port 5173
   ```

## Production build

1. From `docker/portal`, build and start the containers:
   ```bash
   docker compose up -d --build
   ```
2. The frontend is served on port `8088` by Nginx (`http://<host>:8088`).
3. The status API runs via `portal-api` on port `3005` (host network) and reuses the Docker socket volume for container stats.
