import { useEffect, useState } from 'react';
import { FAQ, UPDATES, TERMS, TERMS_UPDATED } from './content';
import { useSiteContent } from './siteContent';

type Tab = 'rules' | 'news' | 'faq' | 'updates' | 'terms';
const MAP: Record<string, Tab> = { rules: 'rules', news: 'news', faq: 'faq', updates: 'updates', terms: 'terms', privacy: 'terms', support: 'faq' };
const cur = () => location.pathname.replace(/\/$/, '') || '/';
const tabFromUrl = (): Tab => {
  const q = new URLSearchParams(location.search).get('tab') || cur().slice(1);
  return MAP[q] || 'rules';
};

export default function Info() {
  const [path, setPath] = useState(cur());
  const [tab, setTab] = useState<Tab>(tabFromUrl());
  const [openRule, setOpenRule] = useState('');
  const [read, setRead] = useState<string[]>([]);
  const [openFaq, setOpenFaq] = useState(-1);
  const [q, setQ] = useState('');
  const [toast, setToast] = useState('');
  const { rules, announcements } = useSiteContent();

  useEffect(() => {
    const t = window.setInterval(() => {
      const p = cur();
      if (['/rules', '/faq', '/updates', '/terms', '/privacy', '/support'].includes(p)) { // old links land on the hub
        const tb = MAP[p.slice(1)]; history.replaceState({}, '', `/info?tab=${tb}`); window.dispatchEvent(new PopStateEvent('popstate'));
        setTab(tb); return;
      }
      setPath(p);
    }, 150);
    return () => window.clearInterval(t);
  }, []);

  if (path !== '/info') return null;
  const pick = (t: Tab) => { setTab(t); history.replaceState({}, '', `/info?tab=${t}`); };
  const unlock = (g: string) => {
    setOpenRule(openRule === g ? '' : g);
    if (!read.includes(g)) {
      const next = [...read, g]; setRead(next);
      setToast(next.length === rules.length ? 'All rules read!' : `Read the rules: ${g}`);
      window.setTimeout(() => setToast(''), 3200);
    }
  };
  const faq = FAQ.filter(([a, b]) => (a + b).toLowerCase().includes(q.toLowerCase()));
  const counts: Record<Tab, number> = { rules: rules.length, news: announcements.length, faq: FAQ.length, updates: UPDATES.length, terms: TERMS.length };
  const tabs: [Tab, string, string][] = [['rules', '📜', 'RULES'], ['news', '📢', 'NEWS'], ['faq', '❓', 'FAQ'], ['updates', '📰', 'UPDATES'], ['terms', '📃', 'TERMS']];
  const pct = rules.length ? (read.length / rules.length) * 100 : 0;

  return <div className="wn-info">
    <header><p className="eyebrow">WARNETWORK · INFO CENTER</p><h1>KNOW THE <span>REALM</span></h1></header>
    <div className="wn-tabs" role="tablist">
      {tabs.map(([k, icon, label]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => pick(k)}>
        <span className="ic">{icon}</span><b>{label}</b><small>{counts[k]}</small></button>)}
    </div>
    <div className="wn-tab-body" key={tab}>
      {tab === 'rules' && <>
        <div className="wn-xp"><span>ADVANCEMENTS {read.length}/{rules.length}</span><div><i style={{ width: `${pct}%` }} /></div></div>
        {rules.length === 0 && <p className="wn-empty">Rules will appear here once they are set up. Ask staff on Discord.</p>}
        <div className="wn-adv-grid">{rules.map(g => <article key={g.title} className={`wn-adv ${read.includes(g.title) ? 'done' : ''} ${openRule === g.title ? 'open' : ''}`}>
          <button onClick={() => unlock(g.title)}><span className="badge">{read.includes(g.title) ? '🏆' : '🔒'}</span><b>{g.title}</b><em>{openRule === g.title ? '▲' : '▼'}</em></button>
          {openRule === g.title && <ol>{g.lines.map(l => <li key={l}>{l}</li>)}</ol>}</article>)}</div></>}
      {tab === 'news' && <>{announcements.length === 0 && <p className="wn-empty">No announcements right now. Check back soon or join the Discord.</p>}
        <div className="wn-timeline">{[...announcements].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || +new Date(b.date) - +new Date(a.date)).map(a => <article key={a.id} className="wn-log"><i /><small>{a.pinned ? '📌 ' : ''}{a.tag} · {new Date(a.date).toLocaleDateString()}</small><h3>{a.title}</h3><p style={{ whiteSpace: 'pre-wrap' }}>{a.body}</p>{a.link && <a className="wn-btn" href={a.link} target="_blank" rel="noreferrer">OPEN LINK</a>}</article>)}</div></>}
      {tab === 'faq' && <>
        <label className="wn-search"><span>🔎</span><input value={q} onChange={e => { setQ(e.target.value); setOpenFaq(-1); }} placeholder="Search questions" /></label>
        {faq.length === 0 && <p className="wn-empty">No answers found. Ask in Discord.</p>}
        {faq.map(([a, b], i) => <div key={a} className={`wn-acc ${openFaq === i ? 'open' : ''}`}><button onClick={() => setOpenFaq(openFaq === i ? -1 : i)}>{a}<span>{openFaq === i ? '▲' : '▼'}</span></button>{openFaq === i && <p>{b}</p>}</div>)}</>}
      {tab === 'terms' && <><p className="wn-empty">Terms for the WarNetwork website and server. Last updated {TERMS_UPDATED}.</p>
        {TERMS.map((s, n) => <article key={s.title} className="wn-log"><small>SECTION {n + 1}</small><h3>{s.title}</h3><ul>{s.lines.map(l => <li key={l}>{l}</li>)}</ul></article>)}</>}
      {tab === 'updates' && <div className="wn-timeline">{UPDATES.map(u => <article key={u.date + u.title} className="wn-log"><i /><small>{u.date}</small><h3>{u.title}</h3><ul>{u.lines.map(l => <li key={l}>{l}</li>)}</ul></article>)}</div>}
    </div>
    {toast && <div className="wn-adv-toast"><i>🏆</i><div><small>Advancement Made!</small><b>{toast}</b></div></div>}
  </div>;
}
