import { useEffect, useSyncExternalStore } from 'react';

export type RuleGroup = { title: string; lines: string[] };
export type StaffProfile = { ign: string; role: string; discord: string; skin?: string; skinUrl?: string };
export type Announcement = { id: string; title: string; body: string; tag: string; date: string; pinned?: boolean; link?: string };
export type Section = 'announcements' | 'rules' | 'staff';

export const API_BASE = String(import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
export const apiPath = (path: string) => `${API_BASE}${path}`;

export const DEFAULT_RULES: RuleGroup[] = [
  { title: 'General', lines: ['Respect every player. Harassment and targeted abuse are not welcome.', 'Play fairly and respect the spirit of each game mode.', 'Do not exploit bugs; report them to staff.'] },
  { title: 'PvP', lines: ['Use only allowed clients and modifications.', 'Do not abuse combat glitches or unintended mechanics.'] },
  { title: 'Chat', lines: ['Keep chat welcoming and appropriate for all ages.', 'Do not spam, impersonate staff, or share private information.'] },
  { title: 'Trading', lines: ['Confirm trades before accepting. Report suspicious activity.'] },
  { title: 'Staff & Punishments', lines: ['Follow reasonable staff instructions. Appeals process is not yet configured.'] },
];

export const DEFAULT_STAFF: StaffProfile[] = [
  { ign: 'ABHI_OP', role: 'Owner', discord: 'abhi_opx' },
  { ign: 'AxelBhai', role: 'Manager', discord: 'axeliscooking' },
  { ign: 'SixtyTwoo62', role: 'Manager', discord: 'vastavikly' },
  { ign: 'TanayOP', role: 'Staff Manager · Admin', discord: 'tanay1' },
  { ign: 'UrMathsTeachers', role: 'Developer', discord: 'mathteacher.dev' },
  { ign: 'FireBoy_69', role: 'Admin', discord: 'whityop' },
  { ign: 'CrashJeans40458', role: 'Helper', discord: 'heavenly_swan_28769' },
  { ign: 'K4iserStrafes', role: 'Helper', discord: 'k4iser_dead.ly' },
  { ign: 'NoLimitQuack', role: 'Helper', discord: 'muichiro.exe' },
  { ign: 'ZETRONIX_YT', role: 'Helper', discord: 'zetronix_yt0_93444' },
  { ign: 'SheCalledMeBro', role: 'Helper', discord: 'godnotfound1' },
  { ign: 'NotRetroz_', role: 'Helper', discord: 'sasuke0.frr' },
];

type Raw = { announcements: Announcement[] | null; rules: RuleGroup[] | null; staff: StaffProfile[] | null; updatedAt: Partial<Record<Section, string>> };
export type SiteContent = { announcements: Announcement[]; rules: RuleGroup[]; staff: StaffProfile[]; updatedAt: Partial<Record<Section, string>>; synced: boolean };

const CACHE_KEY = 'wn-content-v1';
const build = (raw: Raw | null, synced: boolean): SiteContent => ({
  announcements: raw?.announcements ?? [],
  rules: raw?.rules ?? DEFAULT_RULES,
  staff: raw?.staff ?? DEFAULT_STAFF,
  updatedAt: raw?.updatedAt ?? {},
  synced,
});

let raw: Raw | null = null;
try { raw = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null') as Raw | null; } catch { raw = null; }
let state: SiteContent = build(raw, false);
const listeners = new Set<() => void>();
const emit = (synced: boolean) => { state = build(raw, synced); try { if (raw) localStorage.setItem(CACHE_KEY, JSON.stringify(raw)); } catch { /* storage may be blocked */ } listeners.forEach(listener => listener()); };

/** Loads the latest shared content from the server. Returns false if the server could not be reached. */
export async function refreshContent(): Promise<boolean> {
  try {
    const response = await fetch(apiPath('/api/content'), { cache: 'no-store' });
    if (!response.ok || !(response.headers.get('content-type') || '').includes('json')) return false;
    raw = await response.json() as Raw; emit(true); return true;
  } catch { return false; }
}

/** Called by the staff panel after the server accepted a change. */
export function applySection(section: Section, items: unknown[], updatedAt: string | null) {
  raw = { announcements: null, rules: null, staff: null, updatedAt: {}, ...(raw || {}) };
  (raw as unknown as Record<string, unknown>)[section] = items;
  raw.updatedAt = { ...raw.updatedAt, ...(updatedAt ? { [section]: updatedAt } : {}) };
  emit(true);
}

let users = 0; let timer = 0;
export function useSiteContent(): SiteContent {
  useEffect(() => {
    users += 1;
    if (users === 1) { void refreshContent(); timer = window.setInterval(() => void refreshContent(), 60_000); }
    return () => { users -= 1; if (users === 0) window.clearInterval(timer); };
  }, []);
  return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => state);
}
