import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

const RARITY: Record<string, string> = { MYTHIC: '#ff55ff', LEGENDARY: '#ffaa00', EPIC: '#aa55ff', RARE: '#55ffff', UNCOMMON: '#55ff55', COMMON: '#ffffff' };
const head = (name: string) => `https://mc-heads.net/avatar/${encodeURIComponent(name.trim())}/32`;

function decorate() {
  // enchantment glint on top-tier rank cards
  document.querySelectorAll<HTMLElement>('.product-grid > *').forEach(card => {
    if (/LEGENDARY|MYTHIC/.test(card.textContent || '')) card.classList.add('wn-glint');
  });
  // skin heads on leaderboards and staff names
  const addHead = (host: Element | null, name: string) => {
    if (!host || !name) return;
    let img = host.parentElement?.querySelector<HTMLImageElement>(':scope > img.wn-head');
    if (!img) { img = document.createElement('img'); img.className = 'wn-head'; img.alt = ''; img.loading = 'lazy'; host.parentElement?.insertBefore(img, host); }
    if (img.dataset.n !== name) { img.dataset.n = name; img.src = head(name); }
  };
  document.querySelectorAll('.leader-row strong').forEach(el => addHead(el, el.textContent || ''));
  document.querySelectorAll('.staff-card').forEach(card => {
    const el = card.querySelector('h3, h4, strong'); addHead(el, (el?.textContent || '').split(/\s/)[0]);
  });
}

const phase = (h: number) => h < 5 || h >= 21 ? 'night' : h < 8 ? 'dawn' : h < 17 ? 'day' : 'dusk';

export default function Enhance() {
  const [tip, setTip] = useState<{ x: number; y: number; name: string; rarity: string; perks: string[] } | null>(null);
  const [toast, setToast] = useState('');
  const [hero, setHero] = useState<Element | null>(null);
  const [now] = useState(new Date().getHours());

  useEffect(() => {
    let raf = 0;
    const run = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { decorate(); setHero(document.querySelector('.hero-art')); }); };
    const mo = new MutationObserver(run); mo.observe(document.body, { childList: true, subtree: true }); run();
    return () => { mo.disconnect(); cancelAnimationFrame(raf); };
  }, []);

  // tooltips on rank / kit cards
  useEffect(() => {
    const over = (e: MouseEvent) => {
      const card = (e.target as HTMLElement).closest?.('.product-grid > *') as HTMLElement | null;
      if (!card) return setTip(null);
      const text = card.textContent || '';
      const rarity = (text.match(/MYTHIC|LEGENDARY|EPIC|UNCOMMON|RARE|COMMON/) || ['COMMON'])[0];
      const name = card.querySelector('h2, h3')?.textContent || 'Item';
      const perks = [...new Set(text.match(/\/[a-z]+/g) || [])].slice(0, 6);
      setTip({ x: e.clientX, y: e.clientY, name, rarity, perks });
    };
    const out = (e: MouseEvent) => { if (!(e.relatedTarget as HTMLElement | null)?.closest?.('.product-grid > *')) setTip(null); };
    document.addEventListener('mousemove', over); document.addEventListener('mouseout', out);
    return () => { document.removeEventListener('mousemove', over); document.removeEventListener('mouseout', out); };
  }, []);

  // rules as advancements
  useEffect(() => {
    const click = (e: MouseEvent) => {
      const sum = (e.target as HTMLElement).closest?.('.rules-list summary');
      if (!sum) return;
      const d = sum.parentElement!;
      if (!d.classList.contains('wn-adv-done')) {
        d.classList.add('wn-adv-done'); setToast(`Advancement Made! Read the rules — ${sum.textContent}`);
        window.setTimeout(() => setToast(''), 3500);
      }
    };
    document.addEventListener('click', click); return () => document.removeEventListener('click', click);
  }, []);

  return <>
    {hero && createPortal(<div className={`wn-sky wn-${phase(now)}`} aria-hidden="true"><i className="wn-orbit" /><b className="wn-cl a" /><b className="wn-cl b" /><b className="wn-cl c" /></div>, hero)}
    {tip && <div className="wn-tip" style={{ left: Math.min(tip.x + 16, window.innerWidth - 280), top: tip.y + 16 }}>
      <b style={{ color: RARITY[tip.rarity] }}>{tip.name}</b><em style={{ color: RARITY[tip.rarity] }}>{tip.rarity}</em>
      {tip.perks.map((p: string) => <span key={p}>{p}</span>)}
    </div>}
    {toast && <div className="wn-adv-toast"><i>🏆</i><div><small>Advancement Made!</small><b>{toast.replace('Advancement Made! ', '')}</b></div></div>}
  </>;
}
