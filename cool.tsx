import { useEffect, useRef } from 'react';

const CARD = '.mc-news-card,.mode-card,.staff-row,.product-card,.mc-feature,.mc-step,.vote-card,.server-card,.leaderboard>*,.feature-mini-grid>article,.callout';

/* Light "cool" layer: soft cursor glow, card spotlight, logo tilt, banner parallax. All transform-only, paused for reduced motion / touch. */
export default function Cool() {
  const aura = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return; ticking = true;
      requestAnimationFrame(() => { ticking = false; document.querySelector<HTMLElement>('.site-banner')?.style.setProperty('--py', `${Math.min(window.scrollY, 600) * 0.2}px`); });
    };
    window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
    const hover = window.matchMedia('(hover: hover)').matches; const el = aura.current;
    let tx = innerWidth / 2, ty = innerHeight / 3, x = tx, y = ty, raf = 0;
    const loop = () => { x += (tx - x) * 0.14; y += (ty - y) * 0.14; if (el) el.style.transform = `translate3d(${x - 210}px,${y - 210}px,0)`; raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.6 ? requestAnimationFrame(loop) : 0; };
    const move = (e: PointerEvent) => {
      tx = e.clientX; ty = e.clientY; if (el) el.style.opacity = '1'; if (!raf) raf = requestAnimationFrame(loop);
      const card = (e.target as HTMLElement | null)?.closest<HTMLElement>(CARD);
      if (card) { const r = card.getBoundingClientRect(); card.style.setProperty('--mx', `${e.clientX - r.left}px`); card.style.setProperty('--my', `${e.clientY - r.top}px`); }
      const banner = document.querySelector<HTMLElement>('.site-banner'); const logo = document.querySelector<HTMLElement>('.hb-logo-wrap');
      if (banner && logo) { const b = banner.getBoundingClientRect(); if (e.clientY < b.bottom) { logo.style.setProperty('--ry', `${(e.clientX / innerWidth - 0.5) * 14}deg`); logo.style.setProperty('--rx', `${-((e.clientY - b.top) / b.height - 0.5) * 10}deg`); } }
    };
    const leave = () => { if (el) el.style.opacity = '0'; const logo = document.querySelector<HTMLElement>('.hb-logo-wrap'); logo?.style.setProperty('--rx', '0deg'); logo?.style.setProperty('--ry', '0deg'); };
    if (hover) { window.addEventListener('pointermove', move, { passive: true }); document.documentElement.addEventListener('pointerleave', leave); }
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('pointermove', move); document.documentElement.removeEventListener('pointerleave', leave); cancelAnimationFrame(raf); };
  }, []);
  return <div ref={aura} className="cool-aura" aria-hidden="true" />;
}
