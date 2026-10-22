import { createServer } from 'node:http';
import { createReadStream, existsSync, readFileSync, writeFileSync, mkdirSync, renameSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolveSrv } from 'node:dns/promises';
import net from 'node:net';

const root = fileURLToPath(new URL('.', import.meta.url));
const envPath = join(root, '.env.local');
const ordersPath = join(root, 'data', 'orders.json');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^(["'])(.*)\1$/, '$2');
  }
}

let accountSystem = { handle: async () => false };
try {
  const { createAccountSystem } = await import('./account-system.mjs');
  accountSystem = createAccountSystem({ databasePath: join(root, 'data', 'accounts.sqlite'), production: process.env.NODE_ENV === 'production', isOwner: req => authenticated(req) });
} catch (error) { console.warn('Player accounts & orders are disabled (needs Node 22.5+ and the database folder):', error.message); }
const statusCaches = new Map();
const STATUS_HOST = () => process.env.VITE_SERVER_ADDRESS || 'play.warnetwork.fun';
// Each game mode can have its own address (host or host:port) so its player count is exact.
const MODE_HOSTS = { lifesteal: () => process.env.VITE_LIFESTEAL_ADDRESS || '', practice: () => process.env.VITE_PRACTICE_ADDRESS || '' };
const hostForMode = mode => (mode && MODE_HOSTS[mode]?.()) || STATUS_HOST();
function refreshLiveStatus(host = STATUS_HOST()) {
  let cache = statusCaches.get(host);
  if (!cache) { cache = { expiresAt: 0, result: null, pending: null }; statusCaches.set(host, cache); }
  if (!cache.pending) cache.pending = queryMinecraftServer(host)
    .catch(() => ({ online: false, players: 0, maxPlayers: 0, version: 'STATUS UNAVAILABLE', checkedAt: new Date().toISOString() }))
    .then(result => { cache.result = result; cache.expiresAt = Date.now() + 5_000; cache.pending = null; return result; });
  return cache.pending;
}
void refreshLiveStatus();
setInterval(() => { for (const host of statusCaches.keys()) void refreshLiveStatus(host); }, 5_000).unref();

function minecraftVarInt(value) {
  const bytes = [];
  do { let part = value & 0x7f; value >>>= 7; if (value !== 0) part |= 0x80; bytes.push(part); } while (value !== 0);
  return Buffer.from(bytes);
}
function minecraftString(value) { const encoded = Buffer.from(value, 'utf8'); return Buffer.concat([minecraftVarInt(encoded.length), encoded]); }
function readVarInt(buffer, offset = 0) {
  let result = 0; let position = offset;
  for (let index = 0; index < 5; index++) { if (position >= buffer.length) return null; const part = buffer[position++]; result |= (part & 0x7f) << (7 * index); if ((part & 0x80) === 0) return { value: result, next: position }; }
  throw new Error('Invalid Minecraft status packet.');
}
async function queryMinecraftServer(hostname) {
  let port = 25565; const explicit = /^(.+):(\d{1,5})$/.exec(hostname);
  if (explicit) { hostname = explicit[1]; port = Number(explicit[2]); }
  let host = hostname;
  if (!explicit) try {
    const records = await Promise.race([
      resolveSrv(`_minecraft._tcp.${hostname}`),
      new Promise(resolveRecords => setTimeout(() => resolveRecords([]), 700)),
    ]);
    const record = records.sort((a, b) => a.priority - b.priority)[0];
    if (record) { host = record.name.replace(/\.$/, ''); port = record.port; }
  }
  catch { /* Direct host:25565 fallback is the Minecraft default. */ }
  return new Promise((resolveStatus, rejectStatus) => {
    const socket = net.createConnection({ host, port }); let incoming = Buffer.alloc(0); let receivedRequest = false; let settled = false;
    const finish = (error, result) => { if (settled) return; settled = true; clearTimeout(timeout); socket.destroy(); error ? rejectStatus(error) : resolveStatus(result); };
    const timeout = setTimeout(() => finish(new Error('Minecraft status timed out.')), 2500);
    socket.setTimeout(2500, () => finish(new Error('Minecraft status timed out.')));
    socket.on('error', error => finish(error));
    socket.on('connect', () => {
      const protocol = minecraftVarInt(767); const address = minecraftString(hostname); const portBytes = Buffer.alloc(2); portBytes.writeUInt16BE(port);
      const handshake = Buffer.concat([minecraftVarInt(0), protocol, address, portBytes, minecraftVarInt(1)]);
      const handshakeFrame = Buffer.concat([minecraftVarInt(handshake.length), handshake]);
      socket.write(Buffer.concat([handshakeFrame, Buffer.from([1, 0])])); receivedRequest = true;
    });
    socket.on('data', chunk => {
      incoming = Buffer.concat([incoming, chunk]); if (!receivedRequest) return;
      try {
        const frame = readVarInt(incoming); if (!frame || incoming.length < frame.next + frame.value) return;
        const packet = incoming.subarray(frame.next, frame.next + frame.value); const packetId = readVarInt(packet);
        if (!packetId || packetId.value !== 0) return finish(new Error('Unexpected Minecraft status packet.'));
        const payloadLength = readVarInt(packet, packetId.next); if (!payloadLength || packet.length < payloadLength.next + payloadLength.value) return;
        const payload = JSON.parse(packet.subarray(payloadLength.next, payloadLength.next + payloadLength.value).toString('utf8'));
        if (!Number.isFinite(payload.players?.online) || !Number.isFinite(payload.players?.max) || typeof payload.version?.name !== 'string') return finish(new Error('Minecraft status response was incomplete.'));
        finish(null, { online: true, players: payload.players.online, maxPlayers: payload.players.max, version: payload.version.name, checkedAt: new Date().toISOString() });
      } catch (error) { finish(error); }
    });
    socket.on('end', () => { if (!settled) finish(new Error('Minecraft server closed the status connection.')); });
  });
}

const sessions = new Map();
const attempts = new Map();
const alertAttempts = new Map();
const orderCatalog = new Map([[1, ['Custom Rank', 1499]], [2, ['King Rank', 999]], [3, ['Divine Rank', 799]], [4, ['Celestial Rank', 499]], [5, ['Cosmic Rank', 299]], [6, ['Nebula Rank', 99]], [7, ['600 Coins', 49]], [8, ['1,200 Coins', 99]], [9, ['3,600 Coins', 299]], [10, ['6,000 Coins', 499]], [11, ['12,500 Coins', 999]], [12, ['25,000 Coins', 1999]], [13, ['Testing Rank', 1]]]);
const maxAge = 8 * 60 * 60 * 1000;
const production = process.env.NODE_ENV === 'production';
const apiOnly = Boolean(process.env.API_PORT);
const port = Number(process.env.API_PORT || process.env.SERVER_PORT || process.env.PORT || 4173);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8', '.woff2': 'font/woff2' };

function corsHeaders() {
  const origin = process.env.FRONTEND_ORIGIN || '';
  return origin ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-WN-Plugin-Token', 'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS', 'Vary': 'Origin' } : {};
}
function send(res, status, data, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...corsHeaders(), ...headers });
  res.end(JSON.stringify(data));
}
function readOrders() { try { return JSON.parse(readFileSync(ordersPath, 'utf8')); } catch { return []; } }
function saveOrders(orders) { const folder = join(root, 'data'); if (!existsSync(folder)) mkdirSync(folder, { recursive: true }); writeFileSync(ordersPath, JSON.stringify(orders, null, 2)); }
function body(req) {
  return new Promise((resolveBody, reject) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; if (raw.length > 3_500_000) reject(new Error('Body too large')); });
    req.on('end', () => { try { resolveBody(JSON.parse(raw || '{}')); } catch { reject(new Error('Invalid JSON')); } });
    req.on('error', reject);
  });
}
function cookie(req, name) {
  return (req.headers.cookie || '').split(';').map(item => item.trim()).find(item => item.startsWith(`${name}=`))?.slice(name.length + 1) || '';
}
function safePasswordMatch(candidate, expected) {
  const a = Buffer.from(String(candidate)); const b = Buffer.from(String(expected));
  return a.length === b.length && timingSafeEqual(a, b);
}

// ---------- Staff panel content (announcements, rules, staff team) ----------
const contentPath = join(root, 'data', 'content.json');
const skinsDir = join(root, 'data', 'skins');
const CONTENT_SECTIONS = ['announcements', 'rules', 'staff'];
const ANNOUNCEMENT_TAGS = ['NEWS', 'EVENT', 'UPDATE', 'STORE', 'MAINTENANCE'];
function readContent() { try { const data = JSON.parse(readFileSync(contentPath, 'utf8')); return data && typeof data === 'object' ? data : {}; } catch { return {}; } }
function writeJsonAtomic(file, data) { mkdirSync(dirname(file), { recursive: true }); const tmp = `${file}.${process.pid}.tmp`; writeFileSync(tmp, JSON.stringify(data, null, 2)); renameSync(tmp, file); }
const text = (value, max) => typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max) : '';
function cleanAnnouncements(items) {
  if (!Array.isArray(items) || items.length > 100) return null;
  const seen = new Set(); const out = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') return null;
    const title = text(item.title, 100); const body = text(item.body, 1200);
    if (!title || !body) return null;
    const date = new Date(item.date); if (Number.isNaN(date.getTime())) return null;
    let id = text(item.id, 40).replace(/[^A-Za-z0-9_-]/g, ''); if (!id || seen.has(id)) id = randomBytes(6).toString('hex'); seen.add(id);
    const link = text(item.link, 300); if (link && !/^https?:\/\/[^\s]+$/i.test(link)) return null;
    out.push({ id, title, body, tag: ANNOUNCEMENT_TAGS.includes(item.tag) ? item.tag : 'NEWS', date: date.toISOString(), pinned: item.pinned === true, link });
  }
  return out;
}
function cleanRules(items) {
  if (!Array.isArray(items) || items.length > 40) return null;
  const out = [];
  for (const group of items) {
    if (!group || typeof group !== 'object' || !Array.isArray(group.lines) || group.lines.length > 60) return null;
    const title = text(group.title, 60); if (!title) return null;
    out.push({ title, lines: group.lines.map(line => text(line, 500)).filter(Boolean) });
  }
  return out;
}
function cleanStaff(items) {
  if (!Array.isArray(items) || items.length > 100) return null;
  const out = [];
  for (const member of items) {
    if (!member || typeof member !== 'object') return null;
    const ign = text(member.ign, 32); const role = text(member.role, 40); const discord = text(member.discord, 48);
    if (!/^[A-Za-z0-9_. -]{1,32}$/.test(ign) || !role) return null;
    const skin = text(member.skin, 16); if (skin && !/^[A-Za-z0-9_]{1,16}$/.test(skin)) return null;
    const skinUrl = text(member.skinUrl, 60); if (skinUrl && !/^\/api\/skins\/[a-f0-9]{24}\.png$/.test(skinUrl)) return null;
    out.push({ ign, role, discord, skin, skinUrl });
  }
  return out;
}
const CONTENT_CLEANERS = { announcements: cleanAnnouncements, rules: cleanRules, staff: cleanStaff };
function pruneSkins(staff) {
  try {
    const used = new Set(staff.map(member => member.skinUrl).filter(Boolean));
    for (const file of readdirSync(skinsDir)) {
      const path = join(skinsDir, file);
      if (!used.has(`/api/skins/${file}`) && Date.now() - statSync(path).mtimeMs > 15 * 60_000) unlinkSync(path);
    }
  } catch { /* nothing to prune yet */ }
}

// ---------- Staff sign-in: signed cookie sessions (survive restarts, no database needed) ----------
const authPath = join(root, 'data', 'auth.json');
const auditPath = join(root, 'data', 'audit.json');
function readAuth() { try { const data = JSON.parse(readFileSync(authPath, 'utf8')); return data && data.salt && data.hash ? data : null; } catch { return null; } }
function passwordConfigured() { return Boolean(readAuth() || process.env.WARNETWORK_STAFF_PASSWORD); }
function passwordOk(candidate) {
  if (typeof candidate !== 'string' || !candidate || candidate.length > 200) return false;
  const stored = readAuth();
  if (stored) return safePasswordMatch(scryptSync(candidate, Buffer.from(stored.salt, 'hex'), 64).toString('hex'), stored.hash);
  const expected = process.env.WARNETWORK_STAFF_PASSWORD;
  return Boolean(expected) && safePasswordMatch(candidate, expected);
}
const sessionSecret = () => createHash('sha256').update(`wn-session:${readAuth()?.hash || process.env.WARNETWORK_STAFF_PASSWORD || ''}`).digest();
function makeToken(name, expiresAt) {
  const payload = Buffer.from(JSON.stringify({ n: name, e: expiresAt })).toString('base64url');
  return `${payload}.${createHmac('sha256', sessionSecret()).update(payload).digest('base64url')}`;
}
function authenticated(req) {
  if (!passwordConfigured()) return null;
  const [payload, signature] = cookie(req, 'wn_staff').split('.');
  if (!payload || !signature) return null;
  if (!safePasswordMatch(signature, createHmac('sha256', sessionSecret()).update(payload).digest('base64url'))) return null;
  try { const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); return data.e > Date.now() ? { name: String(data.n || 'Staff') } : null; } catch { return null; }
}
const sessionCookie = (token, seconds) => `wn_staff=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${seconds}${production ? '; Secure' : ''}`;
const clientIp = req => (process.env.TRUST_PROXY === '1' && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || 'unknown';
function audit(name, action, detail = '') {
  try {
    let list = []; try { list = JSON.parse(readFileSync(auditPath, 'utf8')); } catch { list = []; }
    list.unshift({ at: new Date().toISOString(), name, action, detail: String(detail).slice(0, 200) });
    writeJsonAtomic(auditPath, list.slice(0, 300));
  } catch { /* the log is best effort */ }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/api/')) {
    if (req.method === 'OPTIONS') { res.writeHead(204, corsHeaders()); res.end(); return; }
    if (url.pathname.startsWith('/api/v1/')) { if (await accountSystem.handle(req, res, url)) return; }
    if (req.method === 'GET' && url.pathname === '/api/server-status') {
      // Answer instantly from the background-refreshed cache; only wait on the very first request for a host.
      const mode = url.searchParams.get('mode'); const host = hostForMode(mode); const cache = statusCaches.get(host);
      if (!cache?.result) await refreshLiveStatus(host);
      else if (cache.expiresAt < Date.now()) void refreshLiveStatus(host);
      return send(res, 200, { ...statusCaches.get(host).result, shared: Boolean(mode) && host === STATUS_HOST() });
    }
    if (req.method === 'GET' && url.pathname === '/api/health') return send(res, 200, { available: true, staffLogin: passwordConfigured() });
    if (req.method === 'GET' && url.pathname === '/api/content') {
      const data = readContent();
      return send(res, 200, { announcements: data.announcements ?? null, rules: data.rules ?? null, staff: data.staff ?? null, updatedAt: data.updatedAt || {} });
    }
    const skinFile = url.pathname.match(/^\/api\/skins\/([a-f0-9]{24})\.png$/);
    if (skinFile && req.method === 'GET') {
      const file = join(skinsDir, `${skinFile[1]}.png`);
      if (!existsSync(file)) return send(res, 404, { error: 'Skin not found.' });
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff', ...corsHeaders() });
      return createReadStream(file).pipe(res);
    }
    const contentPut = url.pathname.match(/^\/api\/staff\/content\/(announcements|rules|staff)$/);
    if (contentPut && req.method === 'PUT') {
      if (!authenticated(req)) return send(res, 401, { error: 'Staff sign-in required.' });
      let input; try { input = await body(req); } catch { return send(res, 400, { error: 'Invalid request.' }); }
      const section = contentPut[1]; const items = CONTENT_CLEANERS[section](input.items);
      if (!items) return send(res, 400, { error: 'Some of the details are missing or not allowed. Check every field and try again.' });
      const data = readContent(); data.updatedAt = data.updatedAt || {};
      if ((data.updatedAt[section] || null) !== (input.base || null)) return send(res, 409, { error: 'Another staff member changed this just now. The latest version was loaded, so please try again.', items: data[section] ?? null, updatedAt: data.updatedAt[section] || null });
      const before = Array.isArray(data[section]) ? data[section].length : null;
      data[section] = items; data.updatedAt[section] = new Date().toISOString();
      try { writeJsonAtomic(contentPath, data); } catch (error) { console.error('Content storage failed:', error); return send(res, 503, { error: 'The server could not save this. Check that the data folder is writable.' }); }
      if (section === 'staff') pruneSkins(items);
      audit(authenticated(req)?.name || 'Staff', `edited ${section}`, before === null ? `${items.length} items` : `${before} → ${items.length} items`);
      return send(res, 200, { items, updatedAt: data.updatedAt[section] });
    }
    if (req.method === 'POST' && url.pathname === '/api/staff/skin') {
      if (!authenticated(req)) return send(res, 401, { error: 'Staff sign-in required.' });
      let input; try { input = await body(req); } catch { return send(res, 400, { error: 'Image is too large or invalid.' }); }
      const match = typeof input.image === 'string' ? input.image.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/) : null;
      const bytes = match ? Buffer.from(match[1], 'base64') : null;
      if (!bytes || bytes.length < 60 || bytes.length > 300_000 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') return send(res, 400, { error: 'Upload a PNG skin image under 300 KB.' });
      if (bytes.readUInt32BE(16) > 1024 || bytes.readUInt32BE(20) > 1024) return send(res, 400, { error: 'That image is too large. Use one up to 1024 pixels.' });
      const name = randomBytes(12).toString('hex');
      try { mkdirSync(skinsDir, { recursive: true }); writeFileSync(join(skinsDir, `${name}.png`), bytes); } catch { return send(res, 503, { error: 'The server could not store the skin.' }); }
      return send(res, 201, { url: `/api/skins/${name}.png` });
    }
    if (req.method === 'POST' && url.pathname === '/api/orders') {
      let input;
      try { input = await body(req); } catch { return send(res, 400, { error: 'Order or image is too large or invalid.' }); }
      const screenshot = typeof input.screenshot === 'string' ? input.screenshot : '';
      if (!/^(data:image\/(?:png|jpeg|webp);base64,)[A-Za-z0-9+/=]+$/.test(screenshot) || screenshot.length > 2_800_000) return send(res, 400, { error: 'Add a PNG, JPG, or WebP transaction screenshot under 2 MB.' });
      if (typeof input.username !== 'string' || !/^[A-Za-z0-9_]{3,24}$/.test(input.username.trim()) || typeof input.discord !== 'string' || !input.discord.trim() || typeof input.paymentRef !== 'string' || input.paymentRef.trim().length < 4 || !Array.isArray(input.productIds) || !input.productIds.length || input.productIds.length > 20 || !input.productIds.every(id => Number.isInteger(id) && orderCatalog.has(id))) return send(res, 400, { error: 'Check your Minecraft name, transaction reference, and order details.' });
      const productIds = input.productIds;
      const total = productIds.reduce((sum, id) => sum + orderCatalog.get(id)[1], 0);
      if (!Number.isFinite(input.total) || input.total !== total) return send(res, 409, { error: `The order total changed. Refresh checkout and pay the exact displayed amount: ₹${total.toLocaleString('en-IN')}.` });
      const id = `WN-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString('hex').toUpperCase()}`;
      const viewToken = randomBytes(24).toString('hex');
      const counts = new Map(); for (const productId of productIds) counts.set(productId, (counts.get(productId) || 0) + 1);
      const items = [...counts].map(([productId, quantity]) => `${orderCatalog.get(productId)[0]} × ${quantity}`).join(', ');
      const order = { id, viewToken, username: input.username.trim(), discord: input.discord.trim().slice(0, 48), paymentRef: input.paymentRef.trim().slice(0, 64), productIds, items, total, screenshot, createdAt: new Date().toISOString(), status: 'pending' };
      const orders = readOrders(); orders.unshift(order);
      try { saveOrders(orders); } catch (error) { console.error('Order storage failed:', error); return send(res, 503, { error: 'Order storage is unavailable. Please contact staff on Discord before trying again.' }); }
      return send(res, 201, { id, viewToken, status: order.status, createdAt: order.createdAt });
    }
    if (req.method === 'GET' && url.pathname === '/api/staff/orders') {
      if (!authenticated(req)) return send(res, 401, { error: 'Staff sign-in required.' });
      return send(res, 200, { orders: readOrders() });
    }
    const staffOrderMatch = url.pathname.match(/^\/api\/staff\/orders\/([^/]+)\/(verify|fulfill)$/);
    if (staffOrderMatch && req.method === 'POST') {
      if (!authenticated(req)) return send(res, 401, { error: 'Staff sign-in required.' });
      const orders = readOrders(); const order = orders.find(item => item.id === staffOrderMatch[1]);
      if (!order) return send(res, 404, { error: 'Order not found.' });
      if (staffOrderMatch[2] === 'verify' && order.status === 'pending') order.status = 'verified';
      else if (staffOrderMatch[2] === 'fulfill' && order.status === 'verified') order.status = 'fulfilled';
      else return send(res, 409, { error: 'This order is not in the right state for that action.' });
      saveOrders(orders); return send(res, 200, { order });
    }
    const customerOrderMatch = url.pathname.match(/^\/api\/orders\/([^/]+)$/);
    if (customerOrderMatch && req.method === 'GET') {
      const order = readOrders().find(item => item.id === customerOrderMatch[1]);
      const token = url.searchParams.get('key') || '';
      if (!order || !safePasswordMatch(token, order.viewToken)) return send(res, 404, { error: 'Order not found.' });
      const { screenshot, viewToken, code, ...publicOrder } = order;
      return send(res, 200, { order: publicOrder });
    }
    if (req.method === 'POST' && url.pathname === '/api/order-alert') {
      const ip = req.socket.remoteAddress || 'unknown';
      const now = Date.now(); const recent = alertAttempts.get(ip) || [];
      const active = recent.filter(time => now - time < 60_000);
      if (active.length >= 8) return send(res, 429, { error: 'Please wait before submitting another order.' });
      active.push(now); alertAttempts.set(ip, active);
      let order;
      try { order = await body(req); } catch { return send(res, 400, { error: 'Invalid order alert.' }); }
      const webhookUrl = process.env.DISCORD_STAFF_WEBHOOK_URL;
      if (!webhookUrl) return send(res, 202, { sent: false, configured: false });
      let webhook;
      try { webhook = new URL(webhookUrl); } catch { return send(res, 503, { error: 'Discord webhook is not configured correctly.' }); }
      if (webhook.protocol !== 'https:' || !/^(?:discord\.com|discordapp\.com)$/.test(webhook.hostname) || !webhook.pathname.startsWith('/api/webhooks/')) return send(res, 503, { error: 'Discord webhook is not configured correctly.' });
      if (!order || typeof order.id !== 'string' || typeof order.username !== 'string' || typeof order.discord !== 'string' || typeof order.paymentRef !== 'string' || typeof order.items !== 'string' || !Number.isFinite(order.total)) return send(res, 400, { error: 'Invalid order alert.' });
      const clean = value => String(value).slice(0, 400).replace(/[\r\n]/g, ' ');
      try {
        const response = await fetch(webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: '**WarNetwork · UPI payment needs manual review**', allowed_mentions: { parse: [] }, embeds: [{ title: `Pending order ${clean(order.id)}`, color: 15158332, fields: [{ name: 'Minecraft player', value: clean(order.username), inline: true }, { name: 'Discord', value: clean(order.discord), inline: true }, { name: 'Items', value: clean(order.items) }, { name: 'Exact amount', value: `₹${order.total}`, inline: true }, { name: 'UPI reference (unverified)', value: clean(order.paymentRef), inline: true }, { name: 'Proof screenshot', value: order.proofReceived ? 'Submitted · open the staff orders page to review it' : 'Not submitted' }], footer: { text: 'Verify the payment in your account, then grant the item in game.' } }] }) });
        if (!response.ok) return send(res, 502, { error: 'Discord did not accept the staff alert.' });
        return send(res, 202, { sent: true, configured: true });
      } catch { return send(res, 502, { error: 'Discord staff alert could not be sent.' }); }
    }
    if (req.method === 'GET' && url.pathname === '/api/staff/session') { const who = authenticated(req); return send(res, 200, { authenticated: Boolean(who), name: who?.name || null, configured: passwordConfigured() }); }
    if (req.method === 'POST' && url.pathname === '/api/staff/login') {
      const ip = clientIp(req);
      const attempt = attempts.get(ip) || { count: 0, resetAt: Date.now() + 60_000 };
      if (attempt.resetAt < Date.now()) { attempt.count = 0; attempt.resetAt = Date.now() + 60_000; }
      if (attempt.count >= 5) return send(res, 429, { error: 'Too many attempts. Wait one minute and try again.' });
      attempt.count += 1; attempts.set(ip, attempt);
      let input;
      try { input = await body(req); } catch { return send(res, 400, { error: 'Invalid request.' }); }
      if (!passwordConfigured()) return send(res, 503, { error: 'Staff login is not set up yet. The owner must set WARNETWORK_STAFF_PASSWORD on the server.' });
      const name = text(input.name, 24);
      if (!/^[A-Za-z0-9_. -]{2,24}$/.test(name)) return send(res, 400, { error: 'Enter your name (2–24 letters or numbers) so changes can be credited to you.' });
      if (!passwordOk(input.password)) return send(res, 401, { error: 'Password is incorrect.' });
      attempts.delete(ip);
      const age = input.remember === true ? 30 * 24 * 60 * 60 * 1000 : maxAge;
      audit(name, 'signed in');
      return send(res, 200, { authenticated: true, name }, { 'Set-Cookie': sessionCookie(makeToken(name, Date.now() + age), Math.floor(age / 1000)) });
    }
    if (req.method === 'POST' && url.pathname === '/api/staff/logout') return send(res, 200, { authenticated: false }, { 'Set-Cookie': sessionCookie('', 0) });
    if (req.method === 'GET' && url.pathname === '/api/staff/audit') {
      if (!authenticated(req)) return send(res, 401, { error: 'Staff sign-in required.' });
      try { return send(res, 200, { entries: JSON.parse(readFileSync(auditPath, 'utf8')) }); } catch { return send(res, 200, { entries: [] }); }
    }
    if (req.method === 'POST' && url.pathname === '/api/staff/password') {
      const who = authenticated(req); if (!who) return send(res, 401, { error: 'Staff sign-in required.' });
      const ip = clientIp(req); const attempt = attempts.get(`pw:${ip}`) || { count: 0, resetAt: Date.now() + 60_000 };
      if (attempt.resetAt < Date.now()) { attempt.count = 0; attempt.resetAt = Date.now() + 60_000; }
      if (attempt.count >= 5) return send(res, 429, { error: 'Too many attempts. Wait one minute and try again.' });
      attempt.count += 1; attempts.set(`pw:${ip}`, attempt);
      let input; try { input = await body(req); } catch { return send(res, 400, { error: 'Invalid request.' }); }
      if (!passwordOk(input.current)) return send(res, 401, { error: 'Your current password is not correct.' });
      if (typeof input.next !== 'string' || input.next.length < 10 || input.next.length > 100) return send(res, 400, { error: 'The new password must be 10 to 100 characters.' });
      const salt = randomBytes(16);
      try { writeJsonAtomic(authPath, { salt: salt.toString('hex'), hash: scryptSync(input.next, salt, 64).toString('hex'), changedAt: new Date().toISOString() }); } catch { return send(res, 503, { error: 'The server could not save the new password.' }); }
      attempts.delete(`pw:${ip}`); audit(who.name, 'changed the staff password');
      return send(res, 200, { changed: true }, { 'Set-Cookie': sessionCookie(makeToken(who.name, Date.now() + maxAge), Math.floor(maxAge / 1000)) });
    }
    return send(res, 404, { error: 'API route not found.' });
  }
  if (apiOnly) { res.writeHead(404); return res.end('Not found'); }
  const dist = resolve(root, 'dist');
  let target = resolve(dist, `.${decodeURIComponent(url.pathname)}`);
  if (!target.startsWith(dist + sep) && target !== join(dist, 'index.html')) target = join(dist, 'index.html');
  if (!existsSync(target) || extname(target) === '') target = join(dist, 'index.html');
  if (!existsSync(target)) { res.writeHead(503); return res.end('Build the website first with npm run build.'); }
  res.writeHead(200, { 'Content-Type': mime[extname(target)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
  createReadStream(target).pipe(res);
});

server.listen(port, '0.0.0.0', () => console.log(`WarNetwork ${apiOnly ? 'staff API' : 'site'} listening on port ${port}`));
