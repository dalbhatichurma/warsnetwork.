import { useEffect, useRef, useState } from 'react';
import './staffpanel.css';
import { apiPath, applySection, refreshContent, useSiteContent } from './siteContent';
import type { Announcement, RuleGroup, Section, StaffProfile } from './siteContent';

const TAGS = ['NEWS', 'EVENT', 'UPDATE', 'STORE', 'MAINTENANCE'];
const ROLES = ['Owner', 'Manager', 'Staff Manager · Admin', 'Developer', 'Admin', 'Moderator', 'Helper'];
const CUSTOM = '__custom';
const skinSrc = (person: Pick<StaffProfile, 'ign' | 'skin' | 'skinUrl'>) => person.skinUrl ? apiPath(person.skinUrl) : `https://mc-heads.net/body/${encodeURIComponent(person.skin || person.ign || 'Steve')}/100`;
const replaceRoute = (path: string) => { history.replaceState({}, '', path); window.dispatchEvent(new PopStateEvent('popstate')); };

const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('That file is not a readable image.')); img.src = src; });

/** A 64x64 (or 64x32) Minecraft skin file becomes a front-facing body picture; any other picture is just shrunk to fit. */
async function skinToPng(file: File): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);
    const w = img.naturalWidth, h = img.naturalHeight;
    const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Your browser cannot process images.');
    if (w === 64 && (h === 64 || h === 32)) {
      const S = 8; canvas.width = 16 * S; canvas.height = 32 * S; ctx.imageSmoothingEnabled = false;
      const modern = h === 64;
      const part = (sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, flip = false) => {
        if (flip) { ctx.save(); ctx.translate((dx + sw) * S, 0); ctx.scale(-1, 1); ctx.drawImage(img, sx, sy, sw, sh, 0, dy * S, sw * S, sh * S); ctx.restore(); }
        else ctx.drawImage(img, sx, sy, sw, sh, dx * S, dy * S, sw * S, sh * S);
      };
      part(4, 20, 4, 12, 4, 20); part(44, 20, 4, 12, 0, 8); part(20, 20, 8, 12, 4, 8); part(8, 8, 8, 8, 4, 0);
      if (modern) { part(20, 52, 4, 12, 8, 20); part(36, 52, 4, 12, 12, 8); part(4, 36, 4, 12, 4, 20); part(4, 52, 4, 12, 8, 20); part(44, 36, 4, 12, 0, 8); part(52, 52, 4, 12, 12, 8); part(20, 36, 8, 12, 4, 8); }
      else { part(4, 20, 4, 12, 8, 20, true); part(44, 20, 4, 12, 12, 8, true); }
      part(40, 8, 8, 8, 4, 0);
    } else {
      const scale = Math.min(1, 240 / w, 360 / h);
      canvas.width = Math.max(1, Math.round(w * scale)); canvas.height = Math.max(1, Math.round(h * scale));
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    }
    return canvas.toDataURL('image/png');
  } finally { URL.revokeObjectURL(objectUrl); }
}

type Tab = Section | 'activity' | 'security';
type Draft = { index: number | null; ign: string; role: string; customRole: string; discord: string; skin: string; skinUrl: string; pending: string };
const emptyDraft: Draft = { index: null, ign: '', role: 'Helper', customRole: '', discord: '', skin: '', skinUrl: '', pending: '' };

export default function StaffPanel({ go }: { go: (path: string) => void }) {
  const content = useSiteContent();
  const [auth, setAuth] = useState<'checking' | 'ok'>('checking');
  const [loadFailed, setLoadFailed] = useState(false);
  const [tab, setTab] = useState<Tab>('announcements');
  const [who, setWho] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const toastTimer = useRef(0);
  const say = (message: string) => { setToast(message); window.clearTimeout(toastTimer.current); toastTimer.current = window.setTimeout(() => setToast(''), 3200); };

  useEffect(() => {
    let live = true;
    fetch(apiPath('/api/staff/session'), { credentials: 'include' }).then(r => r.json() as Promise<{ authenticated?: boolean; name?: string }>).then(async result => {
      if (!live) return;
      if (!result.authenticated) { replaceRoute('/staff-login'); return; }
      setWho(result.name || ''); setAuth('ok'); if (!(await refreshContent()) && live) setLoadFailed(true);
    }).catch(() => { if (live) { setAuth('ok'); setLoadFailed(true); } });
    return () => { live = false; };
  }, []);

  /** Saves a whole section. The server rejects it if someone else changed the section since this browser loaded it. */
  const save = async (section: Section, items: unknown[], okMessage: string): Promise<boolean> => {
    setBusy(true);
    try {
      const response = await fetch(apiPath(`/api/staff/content/${section}`), { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items, base: content.updatedAt[section] || null }) });
      const result = await response.json() as { items?: unknown[] | null; updatedAt?: string | null; error?: string };
      if (response.status === 401) { replaceRoute('/staff-login'); return false; }
      if (response.status === 409) { if (result.items) applySection(section, result.items, result.updatedAt ?? null); else await refreshContent(); say((result.error || 'Someone else changed this.').toUpperCase()); return false; }
      if (!response.ok || !result.items) { say((result.error || 'COULD NOT SAVE').toUpperCase()); return false; }
      applySection(section, result.items, result.updatedAt ?? null); say(okMessage); return true;
    } catch { say('STAFF SERVER UNAVAILABLE · NOTHING WAS SAVED'); return false; }
    finally { setBusy(false); }
  };

  const logout = async () => { try { await fetch(apiPath('/api/staff/logout'), { method: 'POST', credentials: 'include' }); } finally { replaceRoute('/staff-login'); } };

  if (auth === 'checking') return <div className="sp-loading"><p className="eyebrow">SECURE STAFF AREA</p><h2>CHECKING SESSION…</h2></div>;

  const tabs: [Tab, string, string, number | null][] = [['announcements', '📢', 'ANNOUNCEMENTS', content.announcements.length], ['rules', '📜', 'RULES', content.rules.length], ['staff', '🛡️', 'STAFF TEAM', content.staff.length], ['activity', '🕒', 'ACTIVITY', null], ['security', '🔐', 'SECURITY', null]];

  return <div className="sp">
    <header className="sp-head">
      <div><p className="eyebrow">WARNETWORK · CREW ONLY</p><h1>STAFF <span>PANEL</span></h1><p>{who ? <>Signed in as <b>{who}</b>. </> : null}Changes are saved to the server and appear on the website for every player straight away.</p></div>
      <div className="sp-head-actions"><button className="sp-btn" onClick={() => go('/')}>VIEW WEBSITE</button><button className="sp-btn sp-danger" onClick={() => void logout()}>LOG OUT</button></div>
    </header>
    {loadFailed && <div className="sp-warn">The panel could not reach the staff server, so the lists below may be out of date. Saving is disabled until it reconnects. Make sure the site is started with <code>npm start</code> (node server.mjs).<button className="sp-btn" onClick={() => { setLoadFailed(false); void refreshContent().then(ok => setLoadFailed(!ok)); }}>RETRY</button></div>}
    <nav className="sp-tabs" role="tablist">{tabs.map(([key, icon, label, count]) => <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? 'on' : ''} onClick={() => setTab(key)}><span>{icon}</span><b>{label}</b>{count !== null && <small>{count}</small>}</button>)}</nav>
    <div className={loadFailed ? 'sp-body sp-disabled' : 'sp-body'}>
      {tab === 'announcements' && <Announcements items={content.announcements} busy={busy} save={items => save('announcements', items, 'ANNOUNCEMENT SAVED')} />}
      {tab === 'rules' && <Rules items={content.rules} busy={busy} save={items => save('rules', items, 'RULES SAVED')} />}
      {tab === 'activity' && <Activity />}
      {tab === 'security' && <Security say={say} onChanged={() => say('PASSWORD CHANGED · OTHER DEVICES MUST SIGN IN AGAIN')} />}
      {tab === 'staff' && <Staff items={content.staff} busy={busy} save={items => save('staff', items, 'STAFF TEAM SAVED')} say={say} />}
    </div>
    {toast && <div className="sp-toast">{toast}</div>}
  </div>;
}

/* ---------------- Announcements ---------------- */
function Announcements({ items, busy, save }: { items: Announcement[]; busy: boolean; save: (items: Announcement[]) => Promise<boolean> }) {
  const blank = { id: '', title: '', body: '', tag: 'NEWS', pinned: false, link: '' };
  const [form, setForm] = useState(blank);
  const [open, setOpen] = useState(false);
  const sorted = [...items].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || +new Date(b.date) - +new Date(a.date));
  const submit = async () => {
    const title = form.title.trim(), body = form.body.trim(), link = form.link.trim();
    if (!title || !body) return;
    const next: Announcement = { id: form.id || `a${Date.now().toString(36)}`, title, body, tag: form.tag, pinned: form.pinned, link, date: form.id ? items.find(i => i.id === form.id)?.date || new Date().toISOString() : new Date().toISOString() };
    if (await save(form.id ? items.map(i => i.id === form.id ? next : i) : [next, ...items])) { setForm(blank); setOpen(false); }
  };
  return <section className="sp-card">
    <div className="sp-card-head"><div><h2>ANNOUNCEMENTS</h2><p>Shown in “Latest News” on the home page and on the Info → News tab. Pinned posts stay on top.</p></div>{!open && <button className="sp-btn sp-primary" onClick={() => { setForm(blank); setOpen(true); }}>+ NEW ANNOUNCEMENT</button>}</div>
    {open && <div className="sp-form">
      <label>TITLE<input value={form.title} maxLength={100} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Lifesteal Season 4 starts Friday" /></label>
      <label>TAG<select value={form.tag} onChange={e => setForm({ ...form, tag: e.target.value })}>{TAGS.map(t => <option key={t}>{t}</option>)}</select></label>
      <label className="wide">MESSAGE<textarea rows={5} maxLength={1200} value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} placeholder="Write the announcement for your players…" /></label>
      <label className="wide">LINK (OPTIONAL)<input value={form.link} maxLength={300} onChange={e => setForm({ ...form, link: e.target.value })} placeholder="https://… (clicking the news card opens it)" /></label>
      <label className="sp-check wide"><input type="checkbox" checked={form.pinned} onChange={e => setForm({ ...form, pinned: e.target.checked })} /> 📌 PIN THIS ANNOUNCEMENT TO THE TOP</label>
      <div className="sp-actions"><button className="sp-btn sp-primary" disabled={busy || !form.title.trim() || !form.body.trim()} onClick={() => void submit()}>{form.id ? 'SAVE CHANGES' : 'PUBLISH'}</button><button className="sp-btn" onClick={() => { setOpen(false); setForm(blank); }}>CANCEL</button></div>
    </div>}
    {sorted.length === 0 && !open && <p className="sp-empty">No announcements yet. Click “New announcement” to post the first one.</p>}
    <ul className="sp-list">{sorted.map(a => <li key={a.id}>
      <div className="sp-row-main"><span className="sp-chip">{a.pinned ? '📌 ' : ''}{a.tag}</span><b>{a.title}</b><small>{new Date(a.date).toLocaleString()}</small><p>{a.body}</p></div>
      <div className="sp-row-actions"><button className="sp-btn" onClick={() => { setForm({ id: a.id, title: a.title, body: a.body, tag: a.tag, pinned: !!a.pinned, link: a.link || '' }); setOpen(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>EDIT</button><button className="sp-btn sp-danger" disabled={busy} onClick={() => { if (window.confirm(`Delete “${a.title}”?`)) void save(items.filter(i => i.id !== a.id)); }}>DELETE</button></div>
    </li>)}</ul>
  </section>;
}

/* ---------------- Rules ---------------- */
const move = <T,>(list: T[], from: number, to: number): T[] => { if (to < 0 || to >= list.length) return list; const next = [...list]; const [item] = next.splice(from, 1); next.splice(to, 0, item); return next; };

function Rules({ items, busy, save }: { items: RuleGroup[]; busy: boolean; save: (items: RuleGroup[]) => Promise<boolean> }) {
  const [newGroup, setNewGroup] = useState('');
  const [newLine, setNewLine] = useState<Record<number, string>>({});
  const [edit, setEdit] = useState<{ g: number; i: number | null; text: string } | null>(null);
  const setGroup = (g: number, group: RuleGroup) => items.map((x, n) => n === g ? group : x);
  return <section className="sp-card">
    <div className="sp-card-head"><div><h2>RULES</h2><p>Each category is an advancement card on the Info → Rules page.</p></div></div>
    <div className="sp-inline"><input value={newGroup} maxLength={60} onChange={e => setNewGroup(e.target.value)} placeholder="New category name, e.g. Lifesteal" /><button className="sp-btn sp-primary" disabled={busy || !newGroup.trim()} onClick={() => void save([...items, { title: newGroup.trim(), lines: [] }]).then(ok => { if (ok) setNewGroup(''); })}>+ ADD CATEGORY</button></div>
    {items.length === 0 && <p className="sp-empty">There are no rules yet. Add a category to begin.</p>}
    {items.map((group, g) => <div className="sp-group" key={g}>
      <div className="sp-group-head">
        {edit && edit.g === g && edit.i === null
          ? <><input value={edit.text} maxLength={60} onChange={e => setEdit({ ...edit, text: e.target.value })} /><button className="sp-btn sp-primary" disabled={busy || !edit.text.trim()} onClick={() => void save(setGroup(g, { ...group, title: edit.text.trim() })).then(ok => { if (ok) setEdit(null); })}>SAVE</button><button className="sp-btn" onClick={() => setEdit(null)}>CANCEL</button></>
          : <><h3>{group.title}</h3><span className="sp-row-actions"><button className="sp-btn" disabled={busy || g === 0} onClick={() => void save(move(items, g, g - 1))}>↑</button><button className="sp-btn" disabled={busy || g === items.length - 1} onClick={() => void save(move(items, g, g + 1))}>↓</button><button className="sp-btn" onClick={() => setEdit({ g, i: null, text: group.title })}>RENAME</button><button className="sp-btn sp-danger" disabled={busy} onClick={() => { if (window.confirm(`Delete the whole “${group.title}” category and its ${group.lines.length} rules?`)) void save(items.filter((_, n) => n !== g)); }}>DELETE</button></span></>}
      </div>
      <ol className="sp-rules">{group.lines.map((line, i) => <li key={i}>
        {edit && edit.g === g && edit.i === i
          ? <div className="sp-inline"><textarea rows={2} maxLength={500} value={edit.text} onChange={e => setEdit({ ...edit, text: e.target.value })} /><button className="sp-btn sp-primary" disabled={busy || !edit.text.trim()} onClick={() => void save(setGroup(g, { ...group, lines: group.lines.map((l, n) => n === i ? edit.text.trim() : l) })).then(ok => { if (ok) setEdit(null); })}>SAVE</button><button className="sp-btn" onClick={() => setEdit(null)}>CANCEL</button></div>
          : <><span>{line}</span><span className="sp-row-actions"><button className="sp-btn" disabled={busy || i === 0} onClick={() => void save(setGroup(g, { ...group, lines: move(group.lines, i, i - 1) }))}>↑</button><button className="sp-btn" disabled={busy || i === group.lines.length - 1} onClick={() => void save(setGroup(g, { ...group, lines: move(group.lines, i, i + 1) }))}>↓</button><button className="sp-btn" onClick={() => setEdit({ g, i, text: line })}>EDIT</button><button className="sp-btn sp-danger" disabled={busy} onClick={() => void save(setGroup(g, { ...group, lines: group.lines.filter((_, n) => n !== i) }))}>REMOVE</button></span></>}
      </li>)}</ol>
      <div className="sp-inline"><input value={newLine[g] || ''} maxLength={500} onChange={e => setNewLine({ ...newLine, [g]: e.target.value })} placeholder={`Add a rule to ${group.title}…`} /><button className="sp-btn sp-primary" disabled={busy || !(newLine[g] || '').trim()} onClick={() => void save(setGroup(g, { ...group, lines: [...group.lines, (newLine[g] || '').trim()] })).then(ok => { if (ok) setNewLine({ ...newLine, [g]: '' }); })}>+ ADD RULE</button></div>
    </div>)}
  </section>;
}

/* ---------------- Staff team ---------------- */
function Staff({ items, busy, save, say }: { items: StaffProfile[]; busy: boolean; save: (items: StaffProfile[]) => Promise<boolean>; say: (message: string) => void }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [working, setWorking] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const open = (person?: StaffProfile, index?: number) => {
    if (!person) { setDraft({ ...emptyDraft }); return; }
    const preset = ROLES.includes(person.role);
    setDraft({ index: index ?? null, ign: person.ign, role: preset ? person.role : CUSTOM, customRole: preset ? '' : person.role, discord: person.discord, skin: person.skin || '', skinUrl: person.skinUrl || '', pending: '' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const pick = async (file: File | undefined) => {
    if (!file || !draft) return;
    if (file.size > 3_000_000) { say('PICK AN IMAGE UNDER 3 MB'); return; }
    try { const png = await skinToPng(file); setDraft(d => d && { ...d, pending: png }); } catch (error) { say((error instanceof Error ? error.message : 'IMAGE FAILED').toUpperCase()); }
    if (fileRef.current) fileRef.current.value = '';
  };
  const submit = async () => {
    if (!draft) return;
    const ign = draft.ign.trim(); const role = (draft.role === CUSTOM ? draft.customRole : draft.role).trim();
    if (!/^[A-Za-z0-9_. -]{1,32}$/.test(ign)) { say('MINECRAFT NAME: LETTERS, NUMBERS AND _ ONLY'); return; }
    if (!role) { say('PICK OR TYPE A ROLE'); return; }
    if (draft.skin.trim() && !/^[A-Za-z0-9_]{1,16}$/.test(draft.skin.trim())) { say('SKIN NAME MUST BE A VALID MINECRAFT NAME'); return; }
    setWorking(true);
    try {
      let skinUrl = draft.skinUrl;
      if (draft.pending) {
        const response = await fetch(apiPath('/api/staff/skin'), { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: draft.pending }) });
        const result = await response.json() as { url?: string; error?: string };
        if (!response.ok || !result.url) { say((result.error || 'SKIN UPLOAD FAILED').toUpperCase()); return; }
        skinUrl = result.url;
      }
      const member: StaffProfile = { ign, role, discord: draft.discord.trim(), skin: draft.skin.trim(), skinUrl };
      const next = draft.index === null ? [...items, member] : items.map((p, n) => n === draft.index ? member : p);
      if (await save(next)) setDraft(null);
    } catch { say('STAFF SERVER UNAVAILABLE · NOTHING WAS SAVED'); }
    finally { setWorking(false); }
  };
  const previewSrc = draft ? draft.pending || skinSrc({ ign: draft.ign, skin: draft.skin, skinUrl: draft.skinUrl }) : '';
  return <section className="sp-card">
    <div className="sp-card-head"><div><h2>STAFF TEAM</h2><p>Names, roles, Discord and skins shown on the public Staff page. Members are grouped by role automatically.</p></div>{!draft && <button className="sp-btn sp-primary" onClick={() => open()}>+ ADD STAFF MEMBER</button>}</div>
    {draft && <div className="sp-form sp-staff-form">
      <div className="sp-skin-preview"><img src={previewSrc} alt="" /><small>{draft.pending ? 'NEW UPLOAD (SAVED WHEN YOU PRESS SAVE)' : draft.skinUrl ? 'CUSTOM SKIN' : 'MINECRAFT SKIN'}</small></div>
      <div className="sp-fields">
        <label>MINECRAFT NAME<input value={draft.ign} maxLength={32} onChange={e => setDraft({ ...draft, ign: e.target.value })} placeholder="Their in-game name" /></label>
        <label>ROLE<select value={draft.role} onChange={e => setDraft({ ...draft, role: e.target.value })}>{ROLES.map(r => <option key={r}>{r}</option>)}<option value={CUSTOM}>Other (type below)…</option></select></label>
        {draft.role === CUSTOM && <label>CUSTOM ROLE<input value={draft.customRole} maxLength={40} onChange={e => setDraft({ ...draft, customRole: e.target.value })} placeholder="e.g. Builder" /></label>}
        <label>DISCORD USERNAME<input value={draft.discord} maxLength={48} onChange={e => setDraft({ ...draft, discord: e.target.value })} placeholder="Copied when players click the card" /></label>
        <label>SKIN FROM A MINECRAFT NAME (OPTIONAL)<input value={draft.skin} maxLength={16} disabled={!!draft.skinUrl || !!draft.pending} onChange={e => setDraft({ ...draft, skin: e.target.value })} placeholder={`Leave empty to use ${draft.ign || 'their name'}`} /></label>
        <div className="sp-upload"><span>OR UPLOAD YOUR OWN SKIN</span>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={e => void pick(e.target.files?.[0])} />
          <small>Best: your 64×64 skin file (.png), which is turned into a full-body picture. Any other picture is shown as it is.</small>
          {(draft.skinUrl || draft.pending) && <button type="button" className="sp-btn" onClick={() => setDraft({ ...draft, skinUrl: '', pending: '' })}>REMOVE CUSTOM SKIN</button>}</div>
      </div>
      <div className="sp-actions wide"><button className="sp-btn sp-primary" disabled={busy || working} onClick={() => void submit()}>{working ? 'SAVING…' : draft.index === null ? 'ADD TO TEAM' : 'SAVE CHANGES'}</button><button className="sp-btn" onClick={() => setDraft(null)}>CANCEL</button></div>
    </div>}
    {items.length === 0 && !draft && <p className="sp-empty">No staff yet. Add the first member.</p>}
    <ul className="sp-list sp-staff-list">{items.map((p, i) => <li key={`${p.ign}-${i}`}>
      <img src={skinSrc(p)} alt="" loading="lazy" />
      <div className="sp-row-main"><b>{p.ign}</b><span className="sp-chip">{p.role}</span><small>{p.discord ? `Discord: ${p.discord}` : 'No Discord set'}</small></div>
      <div className="sp-row-actions"><button className="sp-btn" disabled={busy || i === 0} onClick={() => void save(move(items, i, i - 1))}>↑</button><button className="sp-btn" disabled={busy || i === items.length - 1} onClick={() => void save(move(items, i, i + 1))}>↓</button><button className="sp-btn" onClick={() => open(p, i)}>EDIT</button><button className="sp-btn sp-danger" disabled={busy} onClick={() => { if (window.confirm(`Remove ${p.ign} from the staff page?`)) void save(items.filter((_, n) => n !== i)); }}>REMOVE</button></div>
    </li>)}</ul>
  </section>;
}

/* ---------------- Activity log ---------------- */
function Activity() {
  const [entries, setEntries] = useState<{ at: string; name: string; action: string; detail: string }[] | null>(null);
  const [failed, setFailed] = useState(false);
  const load = () => { setFailed(false); fetch(apiPath('/api/staff/audit'), { credentials: 'include' }).then(r => r.json() as Promise<{ entries?: { at: string; name: string; action: string; detail: string }[] }>).then(d => setEntries(d.entries || [])).catch(() => setFailed(true)); };
  useEffect(load, []);
  return <section className="sp-card">
    <div className="sp-card-head"><div><h2>ACTIVITY</h2><p>Who signed in and what they changed. The latest 300 actions are kept.</p></div><button className="sp-btn" onClick={load}>REFRESH</button></div>
    {failed && <p className="sp-empty">Could not load the activity log.</p>}
    {entries && entries.length === 0 && <p className="sp-empty">Nothing has happened yet.</p>}
    <ul className="sp-list">{(entries || []).map((e, i) => <li key={i}><div className="sp-row-main"><b>{e.name} · {e.action}</b><small>{new Date(e.at).toLocaleString()}{e.detail ? ` · ${e.detail}` : ''}</small></div></li>)}</ul>
  </section>;
}

/* ---------------- Security ---------------- */
function Security({ say, onChanged }: { say: (message: string) => void; onChanged: () => void }) {
  const [current, setCurrent] = useState(''); const [next, setNext] = useState(''); const [again, setAgain] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (next.length < 10) { say('USE AT LEAST 10 CHARACTERS'); return; }
    if (next !== again) { say('THE TWO NEW PASSWORDS DO NOT MATCH'); return; }
    setBusy(true);
    try {
      const response = await fetch(apiPath('/api/staff/password'), { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ current, next }) });
      const result = await response.json() as { changed?: boolean; error?: string };
      if (!response.ok || !result.changed) { say((result.error || 'COULD NOT CHANGE PASSWORD').toUpperCase()); return; }
      setCurrent(''); setNext(''); setAgain(''); onChanged();
    } catch { say('STAFF SERVER UNAVAILABLE'); } finally { setBusy(false); }
  };
  return <section className="sp-card">
    <div className="sp-card-head"><div><h2>SECURITY</h2><p>Change the shared staff password. Everyone else is signed out and must use the new one. The new password is stored scrambled (hashed) on the server and replaces the one in the server settings. If you ever lock yourself out, delete <code>data/auth.json</code> on the server and the settings password works again.</p></div></div>
    <div className="sp-form">
      <label className="wide">CURRENT PASSWORD<input type="password" autoComplete="current-password" value={current} onChange={e => setCurrent(e.target.value)} /></label>
      <label>NEW PASSWORD (10+ CHARACTERS)<input type="password" autoComplete="new-password" value={next} onChange={e => setNext(e.target.value)} /></label>
      <label>REPEAT NEW PASSWORD<input type="password" autoComplete="new-password" value={again} onChange={e => setAgain(e.target.value)} /></label>
      <div className="sp-actions wide"><button className="sp-btn sp-primary" disabled={busy || !current || !next} onClick={() => void submit()}>{busy ? 'SAVING…' : 'CHANGE PASSWORD'}</button></div>
    </div>
  </section>;
}

/* ---------------- Staff login ---------------- */
export function StaffLogin({ go }: { go: (path: string) => void }) {
  const [name, setName] = useState(() => { try { return localStorage.getItem('wn-staff-name') || ''; } catch { return ''; } });
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [server, setServer] = useState<'checking' | 'online' | 'offline' | 'unconfigured'>('checking');
  const check = () => {
    setServer('checking');
    fetch(apiPath('/api/staff/session'), { credentials: 'include', cache: 'no-store' }).then(r => r.json() as Promise<{ authenticated?: boolean; configured?: boolean }>).then(result => {
      if (result.authenticated) { replaceRoute('/staff-panel'); return; }
      setServer(result.configured === false ? 'unconfigured' : 'online');
    }).catch(() => setServer('offline'));
  };
  useEffect(check, []);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const response = await fetch(apiPath('/api/staff/login'), { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim(), password, remember }) });
      const result = await response.json() as { authenticated?: boolean; error?: string };
      if (!response.ok || !result.authenticated) { setError(result.error || 'Staff sign-in failed.'); return; }
      try { localStorage.setItem('wn-staff-name', name.trim()); } catch { /* storage may be blocked */ }
      setPassword(''); go('/staff-panel');
    } catch { setServer('offline'); setError('Could not reach the staff server.'); }
    finally { setBusy(false); }
  };
  return <section className="staff-login-page"><div className="staff-login-card sp-login">
    <img src="/images/warnetwork-logo.png" alt="" onError={e => { e.currentTarget.style.display = 'none'; }} />
    <p className="eyebrow">RESTRICTED · CREW ONLY</p>
    <h1>STAFF <span>GATE</span></h1>
    <p>Sign in to open the staff panel: post announcements, edit the rules and update the staff team.</p>
    <div className={`sp-server sp-server-${server}`} role="status">
      {server === 'checking' && '🟡 CHECKING STAFF SERVER…'}
      {server === 'online' && '🟢 STAFF SERVER ONLINE'}
      {server === 'unconfigured' && '🟠 NO STAFF PASSWORD SET ON THE SERVER'}
      {server === 'offline' && <>🔴 STAFF SERVER NOT REACHABLE<small>The site must be started with <code>node index.js</code> (or <code>npm start</code>) so it can check passwords and save changes. <code>npm run dev</code> is not needed.</small><button type="button" className="sp-btn" onClick={check}>TRY AGAIN</button></>}
    </div>
    <form onSubmit={submit}>
      <label className="form-label">YOUR NAME<input value={name} onChange={e => setName(e.target.value)} autoComplete="username" maxLength={24} placeholder="Shown in the activity log" required /></label>
      <label className="form-label">STAFF PASSWORD<span className="sp-pw"><input type={show ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required autoFocus={!!name} /><button type="button" className="sp-btn" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? 'HIDE' : 'SHOW'}</button></span></label>
      <label className="sp-remember"><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} /> Stay signed in on this device for 30 days</label>
      {error && <div className="staff-login-error" role="alert">{error}</div>}
      <button className="button button-primary" type="submit" disabled={busy || server === 'offline'}>{busy ? 'CHECKING…' : 'ENTER STAFF PANEL'}</button>
    </form>
    <small>The password is checked by the server and never stored in this page. Only use “stay signed in” on your own device.</small>
  </div></section>;
}
