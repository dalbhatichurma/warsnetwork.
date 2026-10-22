export type Status = { online: boolean; players: number; maxPlayers: number; version: string; checkedAt?: string; shared?: boolean };

const cache = new Map<string, { at: number; value: Status }>();
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

async function getJson(url: string): Promise<any> {
  const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error('bad response');
  return r.json();
}

/** Own API first (when it is running), then free public status APIs, so the status works even on a static host. */
export async function fetchStatus(host: string, ownApiUrl: string, shared = false): Promise<Status> {
  const key = `${host}|${ownApiUrl}`; const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 20000) return hit.value;
  const done = (value: Status) => { cache.set(key, { at: Date.now(), value }); return value; };
  try {
    const d = await getJson(ownApiUrl);
    if (typeof d.online === 'boolean' && d.version !== 'STATUS UNAVAILABLE') {
      return done({ online: d.online, players: num(d.players), maxPlayers: num(d.maxPlayers), version: String(d.version ?? 'UNKNOWN'), checkedAt: d.checkedAt, shared: Boolean(d.shared) });
    }
  } catch { /* API not available here, use public checkers */ }
  try {
    const d = await getJson(`https://api.mcstatus.io/v2/status/java/${encodeURIComponent(host)}`);
    if (typeof d.online === 'boolean') {
      return done({ online: d.online, players: num(d.players?.online), maxPlayers: num(d.players?.max), version: String(d.version?.name_clean ?? 'ONLINE'), checkedAt: new Date().toISOString(), shared });
    }
  } catch { /* try the next one */ }
  const d = await getJson(`https://api.mcsrvstat.us/3/${encodeURIComponent(host)}`);
  if (typeof d.online !== 'boolean') throw new Error('status unavailable');
  return done({ online: d.online, players: num(d.players?.online), maxPlayers: num(d.players?.max), version: String(d.version ?? 'ONLINE'), checkedAt: new Date().toISOString(), shared });
}
