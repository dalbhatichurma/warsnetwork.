import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const migration = readFileSync(join(root, 'database', 'migrations', '001_account_linking.sql'), 'utf8');
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000;
const LINK_CODE_TTL = 5 * 60 * 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const USERNAME_PATTERN = /^[A-Za-z0-9_ ]{1,32}$/;

const hash = value => createHash('sha256').update(String(value)).digest('hex');
const json = (res, status, value, headers = {}) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...corsHeaders(), ...headers });
  res.end(JSON.stringify(value));
  return true;
};
function parseCookie(req, name) {
  return (req.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith(`${name}=`))?.slice(name.length + 1) || '';
}
function corsHeaders() {
  const origin = process.env.FRONTEND_ORIGIN || '';
  return origin ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-WN-Plugin-Token', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Vary': 'Origin' } : {};
}
function cookie(name, value, maxAge, production, sameSite = (process.env.FRONTEND_ORIGIN ? 'None' : 'Lax')) {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=${maxAge}${production ? '; Secure' : ''}`;
}
async function readJson(req, limit = 16_000) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > limit) throw new Error('Request body too large.');
  }
  return JSON.parse(raw || '{}');
}
function validOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  const allowed = process.env.FRONTEND_ORIGIN || '';
  try { return allowed ? origin === allowed : new URL(origin).host === req.headers.host; } catch { return false; }
}
function compareSecret(candidate, expected) {
  if (typeof candidate !== 'string' || typeof expected !== 'string' || !expected) return false;
  const a = Buffer.from(candidate); const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
function sessionUser(db, req) {
  const token = parseCookie(req, 'wn_player');
  if (!token) return null;
  const now = Date.now();
  db.prepare('DELETE FROM player_sessions WHERE expires_at < ?').run(now);
  const row = db.prepare(`SELECT u.discord_id, u.discord_username, u.display_name, u.avatar_url
    FROM player_sessions s JOIN users u ON u.discord_id=s.discord_id
    WHERE s.token_hash=? AND s.expires_at>?`).get(hash(token), now);
  return row || null;
}
function publicProfile(db, edition, uuid) {
  return db.prepare(`SELECT m.edition, m.minecraft_uuid AS uuid, m.username, m.current_rank AS rank,
    m.kills, m.deaths, m.playtime_minutes AS playtimeMinutes, m.first_seen_at AS firstSeen,
    m.last_seen_at AS lastSeen, m.balance, m.coins
    FROM minecraft_accounts m JOIN account_links l ON l.edition=m.edition AND l.minecraft_uuid=m.minecraft_uuid
    WHERE l.unlinked_at IS NULL AND m.edition=? AND m.minecraft_uuid=?`).get(edition, uuid) || null;
}

export function createAccountSystem({ databasePath, production = false, isOwner = () => false } = {}) {
  const resolvedDatabasePath = databasePath || join(root, 'data', 'accounts.sqlite');
  const databaseDirectory = dirname(resolvedDatabasePath);
  if (!existsSync(databaseDirectory)) mkdirSync(databaseDirectory, { recursive: true });
  const db = new DatabaseSync(resolvedDatabasePath);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at INTEGER NOT NULL);');
  const hasMigration = db.prepare('SELECT 1 FROM schema_migrations WHERE version=?').get('001_account_linking');
  if (!hasMigration) {
    db.exec('BEGIN IMMEDIATE');
    try { db.exec(migration); db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES(?, ?)').run('001_account_linking', Date.now()); db.exec('COMMIT'); }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  }

  const oauthStates = new Map();
  const generationLimits = new Map();
  const failedCodes = new Map();
  const oauthConfigured = () => Boolean(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET && process.env.DISCORD_REDIRECT_URI);
  const frontendUrl = path => `${(process.env.FRONTEND_ORIGIN || '').replace(/\/$/, '')}${path}` || path;
  const pluginAuthorized = req => compareSecret((req.headers.authorization || '').replace(/^Bearer\s+/i, '') || req.headers['x-wn-plugin-token'], process.env.WN_PLUGIN_API_TOKEN);
  const routeError = (res, status, error) => json(res, status, { error });

  async function handle(req, res, url) {
    if (!url.pathname.startsWith('/api/v1/')) return false;
    if (req.method === 'OPTIONS') { res.writeHead(204, corsHeaders()); res.end(); return true; }
    const path = url.pathname;
    const now = Date.now();

    if (path === '/api/v1/internal/health' && req.method === 'GET') return json(res, 200, { available: true, database: 'ready' });

    if (path === '/api/v1/auth/discord' && req.method === 'GET') {
      if (!oauthConfigured()) {
        res.writeHead(302, { Location: frontendUrl('/account?link_error=discord-not-configured'), 'Cache-Control': 'no-store' });
        res.end(); return true;
      }
      const state = randomBytes(32).toString('base64url');
      oauthStates.set(state, now + 5 * 60_000);
      const authorize = new URL('https://discord.com/oauth2/authorize');
      authorize.searchParams.set('client_id', process.env.DISCORD_CLIENT_ID);
      authorize.searchParams.set('redirect_uri', process.env.DISCORD_REDIRECT_URI);
      authorize.searchParams.set('response_type', 'code');
      authorize.searchParams.set('scope', 'identify email');
      authorize.searchParams.set('state', state);
      res.writeHead(302, { Location: authorize.toString(), 'Cache-Control': 'no-store', 'Set-Cookie': cookie('wn_oauth_state', state, 300, production) });
      res.end(); return true;
    }

    if (path === '/api/v1/auth/discord/callback' && req.method === 'GET') {
      const state = url.searchParams.get('state') || '';
      const stateExpiry = oauthStates.get(state) || 0;
      oauthStates.delete(state);
      const clearStateCookie = cookie('wn_oauth_state', '', 0, production);
      const fail = message => { res.writeHead(302, { Location: frontendUrl(`/account?link_error=${encodeURIComponent(message)}`), 'Set-Cookie': clearStateCookie, 'Cache-Control': 'no-store' }); res.end(); return true; };
      if (!oauthConfigured()) return fail('discord-not-configured');
      if (!state || !stateExpiry || stateExpiry < now || parseCookie(req, 'wn_oauth_state') !== state) return fail('oauth-state-expired');
      if (url.searchParams.has('error')) return fail('discord-sign-in-cancelled');
      const code = url.searchParams.get('code');
      if (!code) return fail('discord-code-missing');
      try {
        const tokenResponse = await fetch('https://discord.com/api/v10/oauth2/token', {
          method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ client_id: process.env.DISCORD_CLIENT_ID, client_secret: process.env.DISCORD_CLIENT_SECRET, grant_type: 'authorization_code', code, redirect_uri: process.env.DISCORD_REDIRECT_URI }),
          signal: AbortSignal.timeout(8000),
        });
        if (!tokenResponse.ok) return fail('discord-token-exchange-failed');
        const tokenData = await tokenResponse.json();
        if (typeof tokenData.access_token !== 'string') return fail('discord-token-invalid');
        const userResponse = await fetch('https://discord.com/api/v10/users/@me', { headers: { Authorization: `Bearer ${tokenData.access_token}` }, signal: AbortSignal.timeout(8000) });
        if (!userResponse.ok) return fail('discord-profile-fetch-failed');
        const user = await userResponse.json();
        if (!/^\d{16,22}$/.test(user.id || '') || typeof user.username !== 'string') return fail('discord-profile-invalid');
        const displayName = String(user.global_name || user.username).slice(0, 80);
        const avatarUrl = user.avatar && /^[a-f0-9]+$/i.test(user.avatar) ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128` : null;
        db.prepare(`INSERT INTO users(discord_id, discord_username, display_name, avatar_url, created_at, updated_at, last_login_at)
          VALUES(?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(discord_id) DO UPDATE SET discord_username=excluded.discord_username, display_name=excluded.display_name, avatar_url=excluded.avatar_url, updated_at=excluded.updated_at, last_login_at=excluded.last_login_at`).run(user.id, user.username.slice(0, 80), displayName, avatarUrl, now, now, now);
        db.prepare('UPDATE users SET email=? WHERE discord_id=?').run(user.verified && typeof user.email === 'string' ? user.email.toLowerCase().slice(0, 254) : null, user.id);
        const sessionToken = randomBytes(32).toString('base64url');
        db.prepare('INSERT INTO player_sessions(token_hash, discord_id, created_at, expires_at) VALUES(?, ?, ?, ?)').run(hash(sessionToken), user.id, now, now + SESSION_TTL);
        res.writeHead(302, { Location: frontendUrl('/account'), 'Set-Cookie': [clearStateCookie, cookie('wn_player', sessionToken, SESSION_TTL / 1000, production)], 'Cache-Control': 'no-store' });
        res.end(); return true;
      } catch { return fail('discord-sign-in-failed'); }
    }

    if (path === '/api/v1/auth/session' && req.method === 'GET') {
      const user = sessionUser(db, req);
      return json(res, 200, { authenticated: Boolean(user), discord: user ? { id: user.discord_id, username: user.discord_username, displayName: user.display_name, avatarUrl: user.avatar_url } : null });
    }
    if (path === '/api/v1/auth/logout' && req.method === 'POST') {
      if (!validOrigin(req)) return routeError(res, 403, 'Request origin was rejected.');
      const token = parseCookie(req, 'wn_player'); if (token) db.prepare('DELETE FROM player_sessions WHERE token_hash=?').run(hash(token));
      return json(res, 200, { authenticated: false }, { 'Set-Cookie': cookie('wn_player', '', 0, production) });
    }

    if (path === '/api/v1/link/codes' && req.method === 'POST') {
      if (!validOrigin(req)) return routeError(res, 403, 'Request origin was rejected.');
      const user = sessionUser(db, req); if (!user) return routeError(res, 401, 'Sign in with Discord to link your Minecraft account.');
      const last = generationLimits.get(user.discord_id) || 0;
      if (last > now) return routeError(res, 429, 'Please wait a few seconds before generating another code.');
      generationLimits.set(user.discord_id, now + 10_000);
      const alreadyLinked = db.prepare('SELECT 1 FROM account_links WHERE discord_id=? AND unlinked_at IS NULL').get(user.discord_id);
      if (alreadyLinked) return routeError(res, 409, 'A Minecraft account is already linked. Unlink it in game first.');
      const code = randomBytes(5).toString('hex').toUpperCase();
      db.prepare('DELETE FROM link_verifications WHERE discord_id=? AND consumed_at IS NULL').run(user.discord_id);
      db.prepare('INSERT INTO link_verifications(code_hash, discord_id, created_at, expires_at) VALUES(?, ?, ?, ?)').run(hash(code), user.discord_id, now, now + LINK_CODE_TTL);
      return json(res, 201, { code, expiresAt: now + LINK_CODE_TTL, expiresInSeconds: LINK_CODE_TTL / 1000 });
    }

    if (path === '/api/v1/link/status' && req.method === 'GET') {
      const user = sessionUser(db, req); if (!user) return routeError(res, 401, 'Sign in with Discord to view your linked profile.');
      const profile = db.prepare(`SELECT m.edition, m.minecraft_uuid AS uuid, m.username, m.current_rank AS rank,
        m.kills, m.deaths, m.playtime_minutes AS playtimeMinutes, m.first_seen_at AS firstSeen, m.last_seen_at AS lastSeen
        FROM account_links l JOIN minecraft_accounts m ON m.edition=l.edition AND m.minecraft_uuid=l.minecraft_uuid
        WHERE l.discord_id=? AND l.unlinked_at IS NULL`).get(user.discord_id) || null;
      return json(res, 200, { authenticated: true, discord: { id: user.discord_id, username: user.discord_username, displayName: user.display_name, avatarUrl: user.avatar_url }, linked: Boolean(profile), profile });
    }

    if (path === '/api/v1/player/me' && req.method === 'GET') {
      const user = sessionUser(db, req); if (!user) return routeError(res, 401, 'Sign in with Discord first.');
      const profile = db.prepare(`SELECT m.edition, m.minecraft_uuid AS uuid, m.username, m.current_rank AS rank,
        m.kills, m.deaths, m.playtime_minutes AS playtimeMinutes, m.first_seen_at AS firstSeen, m.last_seen_at AS lastSeen,
        m.balance, m.coins FROM account_links l JOIN minecraft_accounts m ON m.edition=l.edition AND m.minecraft_uuid=l.minecraft_uuid
        WHERE l.discord_id=? AND l.unlinked_at IS NULL`).get(user.discord_id) || null;
      return json(res, 200, { discord: { id: user.discord_id, username: user.discord_username, displayName: user.display_name, avatarUrl: user.avatar_url }, linked: Boolean(profile), profile });
    }

    if (path.startsWith('/api/v1/player/') && req.method === 'GET') {
      const requestedName = decodeURIComponent(path.slice('/api/v1/player/'.length));
      if (!USERNAME_PATTERN.test(requestedName) || requestedName.length > 32) return routeError(res, 400, 'Invalid player name.');
      const profile = db.prepare(`SELECT m.edition, m.minecraft_uuid AS uuid, m.username, m.current_rank AS rank,
        m.kills, m.deaths, m.playtime_minutes AS playtimeMinutes, m.first_seen_at AS firstSeen, m.last_seen_at AS lastSeen
        FROM minecraft_accounts m JOIN account_links l ON l.edition=m.edition AND l.minecraft_uuid=m.minecraft_uuid
        WHERE l.unlinked_at IS NULL AND m.normalized_username=? COLLATE NOCASE`).get(requestedName.toLowerCase()) || null;
      if (!profile) return routeError(res, 404, 'Linked player profile not found.');
      return json(res, 200, { profile });
    }

    if (path === '/api/v1/internal/link/verify' && req.method === 'POST') {
      if (!pluginAuthorized(req)) return routeError(res, 401, 'Plugin authentication failed.');
      let input; try { input = await readJson(req); } catch { return routeError(res, 400, 'Invalid verification request.'); }
      const edition = input.edition === 'BEDROCK' ? 'BEDROCK' : input.edition === 'JAVA' ? 'JAVA' : '';
      const uuid = typeof input.uuid === 'string' ? input.uuid.toLowerCase() : '';
      const username = typeof input.username === 'string' ? input.username.trim() : '';
      const code = typeof input.code === 'string' ? input.code.trim().toUpperCase() : '';
      if (!edition || !UUID_PATTERN.test(uuid) || !USERNAME_PATTERN.test(username) || !/^[A-F0-9]{10}$/.test(code)) return routeError(res, 400, 'Invalid player identity or code.');
      const ip = req.socket.remoteAddress || 'unknown'; const failed = failedCodes.get(ip) || { count: 0, until: 0 };
      if (failed.until < now) { failed.count = 0; failed.until = now + 60_000; }
      if (failed.count >= 12) return routeError(res, 429, 'Too many code attempts. Wait one minute before trying again.');
      try {
        db.exec('BEGIN IMMEDIATE');
        const verification = db.prepare('SELECT code_hash, discord_id, expires_at, consumed_at FROM link_verifications WHERE code_hash=?').get(hash(code));
        if (!verification || verification.consumed_at || verification.expires_at < now) {
          if (verification) db.prepare('UPDATE link_verifications SET attempts=attempts+1 WHERE code_hash=?').run(verification.code_hash);
          db.exec('ROLLBACK'); failed.count += 1; failedCodes.set(ip, failed);
          return routeError(res, verification?.expires_at < now ? 410 : 404, verification?.expires_at < now ? 'That link code has expired. Generate a new code on the website.' : 'That link code is invalid or has already been used.');
        }
        const existingDiscord = db.prepare('SELECT 1 FROM account_links WHERE discord_id=? AND unlinked_at IS NULL').get(verification.discord_id);
        const existingPlayer = db.prepare('SELECT 1 FROM account_links WHERE edition=? AND minecraft_uuid=? AND unlinked_at IS NULL').get(edition, uuid);
        if (existingDiscord || existingPlayer) { db.exec('ROLLBACK'); return routeError(res, 409, 'This Discord or Minecraft account is already linked.'); }
        db.prepare(`INSERT INTO minecraft_accounts(edition, minecraft_uuid, username, normalized_username, first_seen_at, last_seen_at, updated_at)
          VALUES(?, ?, ?, ?, ?, ?, ?) ON CONFLICT(edition, minecraft_uuid) DO UPDATE SET username=excluded.username, normalized_username=excluded.normalized_username, last_seen_at=excluded.last_seen_at, updated_at=excluded.updated_at`).run(edition, uuid, username, username.toLowerCase(), now, now, now);
        db.prepare('INSERT INTO account_links(discord_id, edition, minecraft_uuid, linked_at) VALUES(?, ?, ?, ?)').run(verification.discord_id, edition, uuid, now);
        db.prepare('UPDATE link_verifications SET consumed_at=? WHERE code_hash=? AND consumed_at IS NULL').run(now, verification.code_hash);
        db.exec('COMMIT'); failedCodes.delete(ip);
        return json(res, 200, { linked: true, username, edition, profilePath: `/player/${encodeURIComponent(username)}` });
      } catch (error) {
        try { db.exec('ROLLBACK'); } catch { /* transaction already closed */ }
        if (String(error?.code || '').startsWith('SQLITE_CONSTRAINT')) return routeError(res, 409, 'This Discord or Minecraft account is already linked.');
        return routeError(res, 500, 'The account could not be linked. Please try again shortly.');
      }
    }

    if (path === '/api/v1/internal/link/status' && req.method === 'GET') {
      if (!pluginAuthorized(req)) return routeError(res, 401, 'Plugin authentication failed.');
      const edition = url.searchParams.get('edition') || ''; const uuid = (url.searchParams.get('uuid') || '').toLowerCase();
      if (!['JAVA', 'BEDROCK'].includes(edition) || !UUID_PATTERN.test(uuid)) return routeError(res, 400, 'Invalid player identity.');
      const link = db.prepare(`SELECT u.display_name FROM account_links l JOIN users u ON u.discord_id=l.discord_id
        WHERE l.edition=? AND l.minecraft_uuid=? AND l.unlinked_at IS NULL`).get(edition, uuid);
      return json(res, 200, { linked: Boolean(link) });
    }

    if (path === '/api/v1/internal/link/unlink' && req.method === 'POST') {
      if (!pluginAuthorized(req)) return routeError(res, 401, 'Plugin authentication failed.');
      let input; try { input = await readJson(req); } catch { return routeError(res, 400, 'Invalid unlink request.'); }
      const edition = ['JAVA', 'BEDROCK'].includes(input.edition) ? input.edition : '';
      const uuid = typeof input.uuid === 'string' ? input.uuid.toLowerCase() : '';
      if (!edition || !UUID_PATTERN.test(uuid)) return routeError(res, 400, 'Invalid player identity.');
      const result = db.prepare('UPDATE account_links SET unlinked_at=? WHERE edition=? AND minecraft_uuid=? AND unlinked_at IS NULL').run(now, edition, uuid);
      if (!result.changes) return routeError(res, 404, 'This Minecraft account is not linked.');
      return json(res, 200, { unlinked: true });
    }

    if (path === '/api/v1/internal/player/sync' && req.method === 'POST') {
      if (!pluginAuthorized(req)) return routeError(res, 401, 'Plugin authentication failed.');
      let input; try { input = await readJson(req, 1_000_000); } catch { return routeError(res, 400, 'Invalid player sync payload.'); }
      if (!Array.isArray(input.players) || input.players.length > 500) return routeError(res, 400, 'Sync must contain at most 500 player records.');
      const upsert = db.prepare(`INSERT INTO minecraft_accounts(edition, minecraft_uuid, username, normalized_username, current_rank, kills, deaths, playtime_minutes, balance, coins, first_seen_at, last_seen_at, updated_at)
        VALUES(@edition,@uuid,@username,@normalizedUsername,@rank,@kills,@deaths,@playtimeMinutes,@balance,@coins,@now,@now,@now)
        ON CONFLICT(edition,minecraft_uuid) DO UPDATE SET username=excluded.username,normalized_username=excluded.normalized_username,current_rank=excluded.current_rank,kills=excluded.kills,deaths=excluded.deaths,playtime_minutes=excluded.playtime_minutes,balance=excluded.balance,coins=COALESCE(excluded.coins,minecraft_accounts.coins),last_seen_at=excluded.last_seen_at,updated_at=excluded.updated_at`);
      let synced = 0;
      try {
        db.exec('BEGIN IMMEDIATE');
        for (const player of input.players) {
          if (!player || !['JAVA', 'BEDROCK'].includes(player.edition) || typeof player.uuid !== 'string' || !UUID_PATTERN.test(player.uuid) || typeof player.username !== 'string' || !USERNAME_PATTERN.test(player.username) || !Number.isSafeInteger(player.kills) || player.kills < 0 || !Number.isSafeInteger(player.deaths) || player.deaths < 0 || !Number.isSafeInteger(player.playtimeMinutes) || player.playtimeMinutes < 0) continue;
          const numeric = value => Number.isFinite(value) && value >= 0 && value <= 1_000_000_000_000 ? value : null;
          upsert.run({ edition: player.edition, uuid: player.uuid.toLowerCase(), username: player.username.slice(0, 32), normalizedUsername: player.username.toLowerCase().slice(0, 32), rank: typeof player.rank === 'string' ? player.rank.slice(0, 48) : 'Member', kills: player.kills, deaths: player.deaths, playtimeMinutes: player.playtimeMinutes, balance: numeric(player.balance), coins: numeric(player.coins), now });
          synced++;
        }
        db.exec('COMMIT');
      } catch { try { db.exec('ROLLBACK'); } catch { /* closed transaction */ } return routeError(res, 500, 'Player statistics could not be saved.'); }
      return json(res, 200, { synced });
    }

    return json(res, 404, { error: 'Account API route not found.' });
  }

  return { handle, close: () => db.close() };
}
