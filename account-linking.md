# WarNetwork Discord and Minecraft account linking

The website profile and the Paper plugin share one private API. The plugin supplies the Minecraft identity (UUID, name, and Java/Bedrock edition); the site never accepts a player name as proof of ownership. A link code expires after five minutes and is stored only as a hash.

## 1. Configure the website API

Run the website and API together with `npm run dev` for local development. The account API uses Node's built-in SQLite support, so use Node.js 22.5 or newer (Node 24 LTS is recommended). Production must run `server.mjs` behind the same HTTPS domain as the website and preserve the `data/` directory between deployments. Static-only hosting cannot run the linking API.

Copy `.env.example` to `.env.local` (or configure the same values in your hosting provider's private environment settings). Set:

```dotenv
DISCORD_CLIENT_ID=your_application_client_id
DISCORD_CLIENT_SECRET=your_application_client_secret
DISCORD_REDIRECT_URI=https://YOUR_WEBSITE_DOMAIN/api/v1/auth/discord/callback
WN_PLUGIN_API_TOKEN=the_same_random_secret_used_by_the_paper_plugin
```

In the [Discord Developer Portal](https://discord.com/developers/applications), create or select the WarNetwork application. Under **OAuth2**, add the exact redirect URL above. Use its Client ID and Client Secret for the first two settings. Sign-in requests only the `identify` permission; do not put the Client Secret in a `VITE_` variable or browser code.

Generate a private plugin token on Windows PowerShell with:

```powershell
[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
```

Put the generated value in the private `WN_PLUGIN_API_TOKEN` setting. Do not commit `.env.local` or share the token in Discord/chat. Keep the website's `data/accounts.sqlite` on persistent private storage and back it up while the API is stopped.

## 2. Install the plugin on Paper

1. Build the plugin from `apps/plugin` with `mvn clean package` (Java 21 toolchain; Paper 1.21.x).
2. Copy `apps/plugin/target/WarNetworkAccountLink-1.0.0.jar` into the Minecraft server's `plugins/` folder.
3. Start Paper once, then stop it. Edit `plugins/WarNetworkAccountLink/config.yml`:

```yaml
api:
  base-url: "https://YOUR_WEBSITE_DOMAIN"
  plugin-token: "PASTE_THE_SAME_PRIVATE_TOKEN_HERE"
website-url: "https://YOUR_WEBSITE_DOMAIN"
```

4. Start Paper again. Check the console for `Account-link commands ready` and confirm there are no API-token or endpoint errors. Do not paste the token into public logs or tickets.

The server must be able to make outbound HTTPS requests to the website API. If the Minecraft server runs behind a proxy, configure secure player forwarding on the proxy and backend so the server receives the real player UUID. Do not use offline-mode UUIDs as a substitute for correctly configured forwarding.

## 3. Player flow and commands

1. Open `https://YOUR_WEBSITE_DOMAIN/account` and choose **Continue with Discord**.
2. Choose **Generate link code**. The one-time code appears for five minutes.
3. Join `play.warnetwork.fun` and run `/linkaccount CODE` (replace `CODE` with the displayed code). The Paper plugin sends the live player's UUID, username, edition, and code to the private API.
4. The website profile updates once the server accepts the link. `/linkaccount status` checks the link in game.
5. To disconnect, run `/unlinkaccount`, then `/unlinkaccount confirm` within 60 seconds. Unlinking preserves the player's historical stats.

The account page shows the linked edition, Minecraft username, rank, kills, deaths, and playtime. Public player pages omit Discord identity, balance, and coins. Skin images are looked up from the verified UUID. Stats refresh from online players every five minutes by default; playtime is the Minecraft lifetime statistic. Rank reads LuckPerms' primary group when LuckPerms is present. Balance reads Vault when Vault and an economy provider are present; coins remain unavailable unless you integrate your network's coins plugin.

Floodgate support is optional. Install/configure Floodgate on the server to let the plugin detect Bedrock identities. Without Floodgate, Java accounts still work normally.

## Troubleshooting

- **Discord sign-in returns to the account page:** check the Client ID, Client Secret, HTTPS callback URL, and the exact redirect configured in Discord.
- **Plugin reports account service unavailable:** verify the website domain uses HTTPS and is reachable outbound from the Minecraft host.
- **Plugin reports authentication failed:** the `WN_PLUGIN_API_TOKEN` and `api.plugin-token` values must match exactly.
- **Code expired or invalid:** generate a new code and enter it in game before its five-minute expiry; codes are single-use.
- **Profile has no rank/stats yet:** wait for the next sync interval and ensure the player joins after the plugin is enabled. Optional LuckPerms/Vault integrations require those plugins to be installed.
- **Local development:** `http://localhost:5174` uses the Vite proxy to the Node API on port 3001. In plugin config only, `http://localhost` is allowed if `api.allow-insecure-http-for-local-testing` is set to `true`; never use that option for production.


## 4. If your website and Node API are hosted separately

The browser must not receive the website's `index.html` when it requests `/api/v1/*`. The updated frontend supports a separate API origin through `VITE_API_BASE_URL`.

On the frontend host, set:

```dotenv
VITE_API_BASE_URL=https://YOUR_API_DOMAIN
```

On the Node API host, set:

```dotenv
FRONTEND_ORIGIN=https://YOUR_WEBSITE_DOMAIN
```

Keep `DISCORD_REDIRECT_URI` pointed at the API callback:

```text
https://YOUR_API_DOMAIN/api/v1/auth/discord/callback
```

The API now sends CORS credentials and uses a cross-site secure session cookie when `FRONTEND_ORIGIN` is configured. Do not use `*` for the CORS origin.

If you use one domain with a reverse proxy, you do not need `VITE_API_BASE_URL`; simply forward `/api/*` to `server.mjs`.
