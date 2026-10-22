import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { products } from './App';
import { fetchStatus } from './status';

const API = String(import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const head = (n: string) => `https://mc-heads.net/avatar/${encodeURIComponent(n)}/48`;

function slot(sel: string, where: 'before' | 'after', id: string): HTMLElement | null {
  const ref = document.querySelector(sel); if (!ref) return null;
  let el = document.getElementById(id);
  if (!el) { el = document.createElement('div'); el.id = id; ref[where === 'before' ? 'before' : 'after'](el); }
  return el;
}

export default function Pages() {
  const [path, setPath] = useState(location.pathname.replace(/\/$/, '') || '/');
  const [fade, setFade] = useState(false);
  const [st, setSt] = useState<{ online: boolean; players: number; maxPlayers: number } | null>(null);
  const [, tick] = useState(0);

  useEffect(() => {
    const t = window.setInterval(() => {
      const p = location.pathname.replace(/\/$/, '') || '/';
      setPath(old => { if (old !== p) { setFade(true); window.setTimeout(() => setFade(false), 550); } return p; });
      tick(n => n + 1); // re-check DOM slots
    }, 150);
    return () => window.clearInterval(t);
  }, []);
  useEffect(() => {
    const load = () => fetchStatus(String(import.meta.env.VITE_SERVER_ADDRESS || 'play.warnetwork.fun'), `${API}/api/server-status`).then(setSt).catch(() => undefined);
    load(); const t = window.setInterval(load, 20000); return () => window.clearInterval(t);
  }, []);

  const heartSlot = path === '/' ? slot('.hero-status-rail', 'after', 'wn-hearts-slot') : null;
  const podiumSlot = path === '/leaderboards' ? slot('.leaderboard', 'before', 'wn-podium-slot') : null;
  const tableSlot = path === '/store' ? slot('.rank-product-grid', 'after', 'wn-compare-slot') : null;
  const top = podiumSlot ? [...document.querySelectorAll('.leader-row')].slice(0, 3).map(r => ({ name: r.querySelector('strong')?.textContent || '', score: r.querySelector('.score')?.textContent || '' })) : [];
  const ranks = products.filter(p => p.type === 'Ranks' && p.perks && p.price > 1).sort((a, b) => a.price - b.price);
  const perks = [...new Set(ranks.flatMap(r => r.perks || []))];
  const hearts = st?.online && st.maxPlayers ? Math.round((st.players / st.maxPlayers) * 10) : 0;

  return <>
    {heartSlot && createPortal(<div className="wn-hearts" title="Players online">
      <div>{Array.from({ length: 10 }, (_, i) => <i key={i} className={i < hearts ? 'full' : ''}>❤</i>)}</div>
      <small>{st?.online ? `${st.players}/${st.maxPlayers} PLAYERS ONLINE` : 'SERVER OFFLINE'}</small></div>, heartSlot)}
    {podiumSlot && top.length === 3 && createPortal(<div className="wn-podium">
      {[1, 0, 2].map(i => <div key={i} className={`step s${i + 1}`}><img src={head(top[i].name)} alt="" /><b>{top[i].name}</b><small>{top[i].score}</small><div className="block">{i + 1}</div></div>)}
    </div>, podiumSlot)}
    {tableSlot && ranks.length > 0 && createPortal(<div className="wn-compare"><h2>COMPARE <span>RANKS</span></h2><div className="wn-compare-scroll"><table>
      <thead><tr><th>PERK</th>{ranks.map(r => <th key={r.id}>{r.icon} {r.name.replace(' Rank', '')}<small>₹{r.price}</small></th>)}</tr></thead>
      <tbody>{perks.map(p => <tr key={p}><td>{p}</td>{ranks.map(r => <td key={r.id}>{r.perks?.includes(p) ? '✔' : '—'}</td>)}</tr>)}</tbody></table></div></div>, tableSlot)}
    {fade && <div className="wn-trans"><i /><span>LOADING TERRAIN...</span></div>}
  </>;
}
