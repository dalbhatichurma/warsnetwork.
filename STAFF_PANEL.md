# Staff panel

- Login: `/staff-login` (also reached from the footer). A correct password sends staff to `/staff-panel`; the old `/admin` address redirects there.
- Password: set `WARNETWORK_STAFF_PASSWORD` in `.env.local` or in the host's environment variables. Never put it in the source code.
- What staff can do: post, edit, pin and delete announcements (home page news + Info > News), edit rule categories and rules, and add/edit/reorder staff with role, Discord and skin (Minecraft name, or an uploaded skin file).
- Storage: `data/content.json` and `data/skins/`. Keep the `data/` folder on persistent disk and back it up.
- Needs the Node server: start with `npm start` (`node server.mjs`), which serves the built `dist/` and the API. A static-only host cannot save changes; the site then shows the built-in defaults.
- If two staff edit the same section at once, the second save is refused and the latest version is loaded.

## Running without `npm run dev` (production)

`npm run dev` is only for editing the code on your own computer. On the real host:

1. On your computer run `npm install` and `npm run build` once. This creates the `dist/` folder.
2. Upload to the host: `dist/`, `index.js`, `server.mjs`, `account-system.mjs`, `package.json` and your private settings (`.env.local`, or set the same variables in the host panel). `node_modules` is NOT needed on the host, the server only uses Node's built-in modules (Node 22.12 or newer).
3. Set the host's start file to `index.js` (or the command `node index.js`). It serves the website and the staff API together.
4. Set `WARNETWORK_STAFF_PASSWORD`. If the host sits behind a proxy, also set `TRUST_PROXY=1` so the login rate limit works per visitor.

## Staff login details

- Staff enter their own name plus the shared password. The name appears in the Activity tab. "Stay signed in" keeps a device signed in for 30 days; otherwise it is 8 hours.
- Sessions survive server restarts. Changing the password signs everyone else out.
- The Security tab changes the shared password (stored hashed in `data/auth.json`). Delete that file to go back to the password in the server settings.
- After 5 wrong attempts a visitor must wait a minute.
