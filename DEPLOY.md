# Fixing "ORDER DESK OFFLINE" and server status

Netlify only hosts the static website. Orders, staff login and the live server status come from `server.mjs`, a Node program that must run somewhere else.

## Option A (simplest): host everything on one Node service
1. Create a web service on Render, Railway or a VPS with Node 22.12 or newer.
2. Build command: `npm install && npm run build`. Start command: `npm start`.
3. Set environment variables: `NODE_ENV=production`, `WARNETWORK_STAFF_PASSWORD`, `VITE_SERVER_ADDRESS=play.warnetwork.fun`, plus the Discord and plugin values from `.env.example`.
4. Add a persistent disk or volume mounted at the project's `data/` folder. Orders and accounts are stored there and are lost on redeploy without it.
5. Point your domain at this service instead of Netlify.

## Option B: keep Netlify, add an API host
1. Deploy the same project as in Option A on the API host.
2. In `public/_redirects`, remove the `#` from the `/api/*` line and put in your API URL.
3. Redeploy Netlify. The site now calls `/api` on its own address and Netlify forwards it, so no CORS or cookie settings are needed.

## Check it works
Open `https://YOUR-SITE/api/health`. It must show `{"available":true}`. Then `https://YOUR-SITE/api/server-status` shows online, players and version once the API host can reach `play.warnetwork.fun`.
