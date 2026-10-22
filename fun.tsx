import { useEffect, useState } from 'react';
import { products } from './App';

const DISCORD = 'https://discord.gg/cCjPr6AFC';
const CARD = '.product-grid > *';

export default function Fun() {
  const [chest, setChest] = useState<string | null>(null);
  const [buy, setBuy] = useState<number | null>(null);

  useEffect(() => {
    const onBuy = (e: Event) => { setChest(null); setBuy((e as CustomEvent<number>).detail); };
    window.addEventListener('wn-buy', onBuy);
    const io = new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) { (en.target as HTMLElement).dataset.rv = '1'; io.unobserve(en.target); const t = en.target as HTMLElement; window.setTimeout(() => { t.style.transitionDelay = ''; }, 1500); } }), { threshold: 0.08 });
    const t = window.setInterval(() => {
      if (location.pathname === '/checkout' || location.pathname === '/cart') { history.replaceState({}, '', '/store'); window.dispatchEvent(new PopStateEvent('popstate')); }
      document.querySelectorAll<HTMLElement>('.mc-wrap, .product-card, .staff-card, .rank-ladder > *, .server-card, .section-heading, .media-heading, .mode-card, .mc-feature, .mc-step, .mc-news-card, .feature-mini-grid > article, .trailer-card, .leaderboard > *, .vote-card, .callout, .server-gallery > *, .page-hero h1').forEach(el => {
        if (!el.dataset.rv) { el.dataset.rv = '0'; el.style.transitionDelay = `${Math.min(Array.from(el.parentElement?.children || []).indexOf(el), 6) * 90}ms`; io.observe(el); }
      });
    }, 400);
    return () => { window.clearInterval(t); io.disconnect(); window.removeEventListener('wn-buy', onBuy); };
  }, []);

  // 3D tilt on rank cards + click to open the chest
  useEffect(() => {
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const move = (e: MouseEvent) => {
      if (still) return;
      const card = (e.target as HTMLElement).closest?.(CARD) as HTMLElement | null;
      if (!card) return;
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      card.style.transform = `perspective(800px) rotateX(${(-y * 10).toFixed(1)}deg) rotateY(${(x * 12).toFixed(1)}deg) translateY(-4px)`;
      card.classList.add('wn-tilt');
    };
    const leave = (e: MouseEvent) => {
      const card = (e.target as HTMLElement).closest?.(CARD) as HTMLElement | null;
      if (card && !card.contains(e.relatedTarget as Node)) { card.style.transform = ''; card.classList.remove('wn-tilt'); }
    };
    const click = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      const sum = el.closest?.('.kit-details summary, .rank-details summary');
      const card = el.closest?.('.product-card, ' + CARD);
      if (!card || (!sum && el.closest('button, a, input'))) return;
      const name = card.querySelector('h2, h3')?.textContent?.trim();
      const p = products.find(x => x.name === name && x.type === 'Ranks' && x.perks?.length);
      if (sum && p) e.preventDefault(); // keep the plain dropdown from opening; the chest shows everything
      if (p) setChest(p.name);
    };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { setChest(null); setBuy(null); } };
    document.addEventListener('mousemove', move); document.addEventListener('mouseout', leave);
    document.addEventListener('click', click); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseout', leave); document.removeEventListener('click', click); document.removeEventListener('keydown', key); };
  }, []);

  const order = buy !== null ? products.find(p => p.id === buy) : null;
  const rank = chest ? products.find(p => p.name === chest) : null;
  const loot = rank ? [...(rank.perks || []), ...(rank.additional || [])] : [];

  return <>
    {rank && <div className="wn-chest-bg" onClick={() => setChest(null)}><div className="wn-chest-box wn-kit" onClick={e => e.stopPropagation()}>
      <h2>{rank.icon} {rank.name.toUpperCase()}</h2>
      <div className="wn-chest"><b className="glow" /><i className="lid" /><i className="base" /></div>
      {rank.kit && <img className="wn-kit-img" src={`/images/${rank.kit}`} alt={`${rank.name} kit preview`} />}
      <h3 className="wn-loot-title" style={{ animationDelay: '1.5s' }}>PERKS</h3>
      <ul>{loot.map((l, i) => <li key={l} style={{ animationDelay: `${1.7 + i * 0.1}s` }}>{l}</li>)}</ul>
      <div className="wn-row"><button className="wn-btn" onClick={() => setBuy(rank.id)}>GET THIS RANK</button><button className="wn-btn grey" onClick={() => setChest(null)}>CLOSE</button></div></div></div>}
    {order && <div className="wn-chest-bg" onClick={() => setBuy(null)}><div className="wn-chest-box wn-ticket" onClick={e => e.stopPropagation()}>
      <h2>{order.icon} GET {order.name.toUpperCase()}</h2>
      <p className="wn-price">₹{order.price.toLocaleString('en-IN')}</p>
      <ol>
        <li style={{ animationDelay: '.15s' }}><i>1</i><div><b>Join our Discord</b><span>Open the server and say hello.</span></div></li>
        <li style={{ animationDelay: '.45s' }}><i>2</i><div><b>Create a Store Support ticket</b><span>Tell staff you want {order.name} and your Minecraft username.</span></div></li>
        <li style={{ animationDelay: '.75s' }}><i>3</i><div><b>Get your rank</b><span>Staff will guide you and grant it in game.</span></div></li>
      </ol>
      <a className="wn-btn pulse" href={DISCORD} target="_blank" rel="noreferrer">JOIN OUR DISCORD</a>
      <button className="wn-link" onClick={() => setBuy(null)}>Maybe later</button></div></div>}
  </>;
}
