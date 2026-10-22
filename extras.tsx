import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/* ---------- Splash text ---------- */
const SPLASHES = ['Also try Lifesteal!', 'Steal hearts, not trust!', 'play.warnetwork.fun', 'Join the Discord!', 'Practice makes perfect!'];

const KNOWN = /^\/(servers|store|wiki|media|leaderboards|staff|rules|vote|linkaccount|checkout|staff-login|staff-panel|admin|faq|updates|info|terms|privacy|support|account|player\/.+)?$/;

export default function Extras() {
  const [brand, setBrand] = useState<Element | null>(null);
  const [path, setPath] = useState(location.pathname);
  const splash = useRef(SPLASHES[Math.floor(Math.random() * SPLASHES.length)]);
  const reduced = useRef(window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // find the logo button (it renders after the loader) and track the route
  useEffect(() => {
    const t = window.setInterval(() => {
      setBrand(document.querySelector('.navbar .brand'));
      setPath(location.pathname.replace(/\/$/, '') || '/');
    }, 300);
    return () => window.clearInterval(t);
  }, []);

  // click sounds + XP orbs + block-break particles
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      const interactive = el.closest('button, a, summary');
      if (reduced.current) return;
      const colors = ['#79553a', '#5fa832', '#7d7d7d'];
      for (let i = 0; i < 8; i++) spawn(e.clientX, e.clientY, 'wn-chip', colors[i % 3], i);
      if (!interactive) { for (let i = 0; i < 3; i++) spawn(e.clientX, e.clientY, 'wn-orb', '', i); }
    };
    window.addEventListener('click', onClick);
    return () => window.removeEventListener('click', onClick);
  }, []);

  const leave = () => { history.pushState({}, '', '/'); window.dispatchEvent(new PopStateEvent('popstate')); };
  const lost = !KNOWN.test(path);

  return <>
    {brand && createPortal(<span className="wn-splash" aria-hidden="true">{splash.current}</span>, brand)}
    {lost && <div className="wn-404"><h1>404</h1><h2>YOU FELL INTO <span>THE VOID</span></h2><p>This page doesn't exist. Nothing here but darkness.</p><button className="wn-btn" onClick={leave}>⛏ RETURN TO SPAWN</button></div>}
  </>;
}

function spawn(x: number, y: number, cls: string, color: string, i: number) {
  const n = document.createElement('i');
  n.className = cls; n.style.left = `${x}px`; n.style.top = `${y}px`;
  if (color) n.style.background = color;
  n.style.setProperty('--dx', `${(Math.random() - 0.5) * 120}px`);
  n.style.setProperty('--dy', `${-40 - Math.random() * 60 - i * 3}px`);
  document.body.appendChild(n); window.setTimeout(() => n.remove(), 900);
}
