import { useEffect, useRef } from 'react';

/* Soft floating dust for the banner: slow drift, gentle twinkle, pauses when off-screen or tab hidden. */
export default function BannerParticles() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current; const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    type P = { x: number; y: number; r: number; vy: number; vx: number; a: number; ph: number; sp: number };
    let w = 0, h = 0, raf = 0, last = 0, onscreen = true, ps: P[] = [];
    const make = (init: boolean): P => ({ x: Math.random() * w, y: init ? Math.random() * h : h + 8, r: 0.7 + Math.random() * 1.7, vy: -(5 + Math.random() * 12), vx: (Math.random() - 0.5) * 5, a: 0.3 + Math.random() * 0.5, ph: Math.random() * 6.28, sp: 0.5 + Math.random() * 1.1 });
    const resize = () => { const r = canvas.getBoundingClientRect(); w = r.width; h = r.height; canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ps = Array.from({ length: Math.round(Math.min(64, (w * h) / 9500)) }, () => make(true)); };
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      if (!onscreen || document.hidden) { last = t; return; }
      const dt = Math.min(0.05, (t - last) / 1000 || 0.016); last = t;
      ctx.clearRect(0, 0, w, h);
      for (const p of ps) {
        p.y += p.vy * dt; p.x += (p.vx + Math.sin((t / 1000) * p.sp + p.ph) * 4) * dt;
        if (p.y < -8 || p.x < -8 || p.x > w + 8) Object.assign(p, make(false));
        const twinkle = 0.6 + 0.4 * Math.sin((t / 1000) * p.sp * 1.7 + p.ph);
        const edge = Math.min(1, Math.max(0, p.y / (h * 0.22)), Math.max(0, (h - p.y) / (h * 0.12)));
        const a = p.a * twinkle * edge;
        ctx.fillStyle = `rgba(255,255,255,${a * 0.16})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 3.2, 0, 6.2832); ctx.fill();
        ctx.fillStyle = `rgba(255,255,255,${a})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.2832); ctx.fill();
      }
    };
    resize(); raf = requestAnimationFrame(tick);
    const io = new IntersectionObserver(([e]) => { onscreen = e.isIntersecting; }); io.observe(canvas);
    window.addEventListener('resize', resize);
    return () => { cancelAnimationFrame(raf); io.disconnect(); window.removeEventListener('resize', resize); };
  }, []);
  return <canvas ref={ref} className="bp-canvas" aria-hidden="true" />;
}
