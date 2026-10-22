import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { createAccountSystem } from '../account-system.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');

function call(system, method, pathname, { body, cookie = '', token = '', origin = 'http://localhost:5174' } = {}) {
  const request = Readable.from(body === undefined ? [] : [JSON.stringify(body)]);
  request.method = method;
  request.url = pathname;
  request.headers = { host: 'localhost:5174', origin, cookie, ...(token ? { authorization: `Bearer ${token}` } : {}) };
  request.socket = { remoteAddress: '127.0.0.1' };
  const response = {
    status: 0,
    headers: {},
    writeHead(status, headers = {}) { this.status = status; this.headers = headers; },
    end(content = '') { this.content = String(content); },
  };
  return system.handle(request, response, new URL(pathname, 'http://localhost:5174')).then(handled => ({ handled, ...response, json: response.content ? JSON.parse(response.content) : null }));
}

test('Discord session code links, syncs, exposes a safe profile, and unlinks through the plugin API', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'warnetwork-link-test-'));
  const databasePath = join(directory, 'accounts.sqlite');
  const previousToken = process.env.WN_PLUGIN_API_TOKEN;
  const pluginToken = randomBytes(32).toString('hex');
  const sessionToken = randomBytes(32).toString('base64url');
  process.env.WN_PLUGIN_API_TOKEN = pluginToken;
  const system = createAccountSystem({ databasePath });
  const admin = new DatabaseSync(databasePath);
  const now = Date.now();
  const uuid = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
  try {
    admin.prepare(`INSERT INTO users(discord_id,discord_username,display_name,avatar_url,created_at,updated_at,last_login_at)
      VALUES(?,?,?,?,?,?,?)`).run('123456789012345678', 'link_tester', 'Link Tester', null, now, now, now);
    admin.prepare('INSERT INTO player_sessions(token_hash,discord_id,created_at,expires_at) VALUES(?,?,?,?)')
      .run(digest(sessionToken), '123456789012345678', now, now + 60_000);
    const cookie = `wn_player=${sessionToken}`;

    const generated = await call(system, 'POST', '/api/v1/link/codes', { body: {}, cookie });
    assert.equal(generated.handled, true);
    assert.equal(generated.status, 201);
    assert.match(generated.json.code, /^[A-F0-9]{10}$/);
    assert.equal(generated.json.expiresInSeconds, 300);
    const stored = admin.prepare('SELECT code_hash FROM link_verifications').get();
    assert.equal(stored.code_hash, digest(generated.json.code));
    assert.notEqual(stored.code_hash, generated.json.code);

    const verified = await call(system, 'POST', '/api/v1/internal/link/verify', {
      token: pluginToken, body: { code: generated.json.code, uuid, username: 'LinkTester', edition: 'JAVA' },
    });
    assert.equal(verified.status, 200);
    assert.equal(verified.json.linked, true);
    assert.equal(verified.json.profilePath, '/player/LinkTester');

    const replay = await call(system, 'POST', '/api/v1/internal/link/verify', {
      token: pluginToken, body: { code: generated.json.code, uuid, username: 'LinkTester', edition: 'JAVA' },
    });
    assert.equal(replay.status, 404);

    const sync = await call(system, 'POST', '/api/v1/internal/player/sync', {
      token: pluginToken,
      body: { players: [{ edition: 'JAVA', uuid, username: 'LinkTester', rank: 'King', kills: 42, deaths: 7, playtimeMinutes: 900, balance: 1200, coins: null }] },
    });
    assert.equal(sync.status, 200);
    assert.equal(sync.json.synced, 1);

    const status = await call(system, 'GET', '/api/v1/link/status', { cookie });
    assert.equal(status.handled, true);
    assert.equal(status.status, 200);
    assert.equal(status.json.linked, true);
    assert.equal(status.json.profile.username, 'LinkTester');
    assert.equal(status.json.profile.rank, 'King');

    const publicProfile = await call(system, 'GET', '/api/v1/player/LinkTester');
    assert.equal(publicProfile.status, 200);
    assert.equal(publicProfile.json.profile.kills, 42);
    assert.equal('balance' in publicProfile.json.profile, false);
    assert.equal('discord_id' in publicProfile.json.profile, false);

    const denied = await call(system, 'POST', '/api/v1/internal/link/unlink', {
      token: 'wrong-secret', body: { edition: 'JAVA', uuid },
    });
    assert.equal(denied.status, 401);

    const unlinked = await call(system, 'POST', '/api/v1/internal/link/unlink', {
      token: pluginToken, body: { edition: 'JAVA', uuid },
    });
    assert.equal(unlinked.status, 200);
    const afterUnlink = await call(system, 'GET', '/api/v1/link/status', { cookie });
    assert.equal(afterUnlink.json.linked, false);
  } finally {
    admin.close();
    system.close();
    if (previousToken === undefined) delete process.env.WN_PLUGIN_API_TOKEN;
    else process.env.WN_PLUGIN_API_TOKEN = previousToken;
    rmSync(directory, { recursive: true, force: true });
  }
});
