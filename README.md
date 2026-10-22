# WarNetwork

A responsive React + TypeScript + Vite website for WarNetwork. It uses the supplied voxel battle banner and logo, a Lifesteal and Practice realm selector, Minecraft inventory kit previews, rank and coin products, and a Discord ticket link.

## Run locally

1. Install Node.js 20.19+ or 22.12+.
2. Copy `.env.example` to `.env.local` and set only values you have verified.
3. Run `npm install`.
4. Run `npm run dev` and open the local URL Vite prints.
5. Run `npm run build` for the production bundle.

The development command starts both the Vite website and the order API. Keep the command running while using checkout; the payment QR appears only after `/api/health` confirms that the order desk can receive submissions. For production, run the built site and `server.mjs` behind the same HTTPS domain, or configure the host's reverse proxy to forward `/api/*` to the Node server. A static-only host cannot accept or store orders.

## Configuration and integrations

- `VITE_SERVER_ADDRESS`: `play.warnetwork.fun`.
- Live server status is read from the Node API at `/api/server-status`. The backend performs a real Minecraft Java status handshake against `VITE_SERVER_ADDRESS` every 20 seconds (with a 20-second server-side cache), returning online/offline state, current players, max players, and Minecraft version. The homepage and server cards consume this live result; they do not display fabricated player counts. `VITE_SERVER_STATUS_URL` is retained only for compatibility with older deployments.
- The Discord invite, UPI QR, UPI ID, rank prices, coin packs, rank perks, and kit preview order come from the owner-provided details. Rank purchases are described as seasonal and non-refundable.
- Checkout sends the Minecraft username, Discord name, transaction reference, products, total, and receipt screenshot to the Node server as a pending order. Staff must match the exact amount and UTR/reference in the payment account before choosing “Payment verified”; the order is marked payment verified. Staff grants the item directly to the Minecraft username and marks it delivered. No buyer code or ticket is required. Never approve from a screenshot alone.
- Personal UPI QR payments do not provide this website with a trusted automatic payment confirmation. The Discord alert is only a pending-order notification; it is not proof of payment.
- Staff panel: staff sign in at `/staff-login` (password from `WARNETWORK_STAFF_PASSWORD`) and are sent to `/staff-panel`, where they add and edit announcements, rules and the staff team (including skins). Content is stored on the Node server in `data/content.json` and `data/skins/`, so `node server.mjs` must be running and `data/` must persist. See [docs/STAFF_PANEL.md](docs/STAFF_PANEL.md).
- Optional `DISCORD_STAFF_WEBHOOK_URL` sends order alerts from the server. Set it in `.env.local` for local use or in the hosting service’s private environment settings for deployment. Never prefix it with `VITE_`, commit it, or put the webhook URL in frontend code.
- User-submitted payment methods beyond the QR have not been individually configured. Ask staff before paying through another method.
- `public/images/` contains the supplied WarNetwork logo, payment QR, Lifesteal banner, six rank kit previews, and five server gallery screenshots.
- The Admin preview also includes local-only wiki and leaderboard editors. Staff role labels are placeholders until actual names and contact details are added.

## Discord and Minecraft account linking

The Discord-linked player profile is backed by SQLite (`data/accounts.sqlite`) and a Paper plugin that proves a player's identity from the server-side UUID. Configure `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_REDIRECT_URI`, and `WN_PLUGIN_API_TOKEN` privately on the Node server, then configure the same API token and HTTPS website URL in the Paper plugin. The player signs into Discord at `/account` or `/linkaccount`, generates a five-minute one-time code, and enters `/linkaccount <code>` in game. The page polls link status while the code is active, so it switches to the verified profile as soon as your Paper plugin confirms the UUID. `/linkaccount status` checks the link; `/unlinkaccount` followed by `/unlinkaccount confirm` disconnects it. The profile shows Minecraft name, skin, rank, kills, deaths, and playtime.

See [docs/account-linking.md](docs/account-linking.md) for Discord OAuth setup, Paper installation, plugin configuration, commands, optional Floodgate/LuckPerms/Vault support, and troubleshooting. The compiled plugin is `apps/plugin/target/WarNetworkAccountLink-1.0.0.jar`.

## Before launch

This is a small server implementation for a single instance, not a production commerce platform. Before scaling up, move the JSON order file to a durable database, add backups and auditing, and use a supported payment gateway with signed callbacks if automatic payment verification is required. Keep all credentials server-side. Never let browser redirects or screenshots prove payment. Add staff names and contact information, configure server policies and commands, and connect the real server before launch.

For deployment, build with `npm run build` and publish the generated `dist/` directory behind a host configured to serve `index.html` for the client-side routes. Provide the public environment variables at build time. Keep privileged integrations in a separately deployed backend.

## Manual UPI order review

A buyer selects the item, scans a per-order UPI QR that encodes the exact INR total, confirms that exact amount in their UPI app, enters their Minecraft username and Discord contact, then submits the UPI transaction reference and a PNG/JPG/WebP proof image (2 MB max). The order and proof are saved by the Node server in `data/orders.json` and are visible in the password-protected staff order desk. If a private Discord webhook is configured, the server posts a pending-review alert. Staff independently checks the payment app/bank statement, then marks the payment verified, grants the item directly in game, and marks the order fulfilled. The buyer receives no code and does not need to open a ticket. The buyer account refreshes the order status periodically.

This is a small single-server JSON-file implementation for the supplied Node server. For deployment, make sure the host provides persistent private disk storage and backups for `data/orders.json`; use a database and protected object storage for a larger/multi-instance site. The payment screenshot is supporting evidence only; UPI is still manually verified.

## UI / checkout fixes in this revision

- Added a more game-network-style navigation with emoji markers, floating server/community status cards, stronger card shadows, and mobile polish inspired by the supplied reference image without copying its artwork.
- Fixed the checkout QR flow so the order-specific UPI QR is generated from the live cart total and is **not hidden behind the `/api/health` check**. The order desk status is shown separately, so a healthy QR is still visible while the site explains whether the order API is ready.
- Added an **OPEN UPI APP** action, exact-total badge, scan instructions, and a clearer order-service status strip.
- Improved the `/linkaccount` page with a clearer 3-step flow, stronger one-time-code presentation, emoji/status cues, and more explicit `/linkaccount CODE` instructions.
- The existing secure server-side UUID verification, five-minute code expiry, Discord OAuth session, and `/unlinkaccount confirm` flow are retained.
- The example environment file is sanitized. Put real credentials only in `.env.local` / hosting secrets and rotate any credentials that were previously exposed in a shared copy of this project.

### Important deployment requirement

For `/linkaccount`, Discord OAuth, and store orders to work, the built frontend and `server.mjs` must be reachable through the **same public HTTPS origin** (or a reverse proxy must forward `/api/*` to the Node server). A static-only Netlify deployment cannot run the SQLite account API or JSON order API by itself. The Discord OAuth callback must point to:

`https://YOUR_DOMAIN/api/v1/auth/discord/callback`
