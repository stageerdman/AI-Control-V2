/* Hash router — the prototype's routes, typed. parseRoute/formatRoute are pure (tested);
   useRoute() re-renders on hashchange; go() navigates.
     #projects · #cast · #cast/teams · #cast/agent/:id · #cast/teams/:id · #access · #blueprint
     #cast/agent/tinker[/:sid]   (design a new agent with Tinker; :sid once the chat exists)
     #new[/:draftId] · #office/:projectId[/board|how[/:wayId|goal-:goalId]|health|features|feature/:id|reports|report/:id]
     #gallery[/:section]   (dev: every pose / look / emblem)
   Anything unknown lands on #projects. */
import { useMemo, useSyncExternalStore } from 'react';

export const OFFICE_SUBS = [
  'room',
  'board',
  'how',
  'health',
  'features',
  'feature',
  'reports',
  'report',
] as const;
export type OfficeSub = (typeof OFFICE_SUBS)[number];

export type Route =
  | { name: 'projects' }
  | { name: 'cast'; tab: 'agents' | 'teams' }
  | { name: 'cast.agent'; id: string }
  /** Design a new agent with Tinker; sid = the saved chat (null until the first message). */
  | { name: 'cast.tinker'; sid: string | null }
  | { name: 'cast.team'; id: string }
  | { name: 'access' }
  | { name: 'blueprint' }
  | { name: 'new'; draftId: string | null }
  /** sub 'room' = the office itself; 'feature' / 'report' carry an id. */
  | { name: 'office'; projectId: string; sub: OfficeSub; id?: string }
  | { name: 'gallery'; section: string };
export type RouteName = Route['name'];

/** The four studio stages in the top nav. */
export const STAGES = [
  { id: 'projects', label: 'Projects' },
  { id: 'cast', label: 'Cast' },
  { id: 'access', label: 'Access' },
  { id: 'blueprint', label: 'Blueprint' },
] as const;
export type Stage = (typeof STAGES)[number]['id'];

const dec = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(dec);
  const [head, a, b] = parts;
  switch (head) {
    case 'cast':
      if (a === 'agent' && b === 'tinker') return { name: 'cast.tinker', sid: parts[3] ?? null };
      if (a === 'agent' && b) return { name: 'cast.agent', id: b };
      if (a === 'teams' && b) return { name: 'cast.team', id: b };
      return { name: 'cast', tab: a === 'teams' ? 'teams' : 'agents' };
    case 'access':
      return { name: 'access' };
    case 'blueprint':
      return { name: 'blueprint' };
    case 'new':
      return { name: 'new', draftId: a ?? null };
    case 'office': {
      if (!a) return { name: 'projects' };
      if (!b) return { name: 'office', projectId: a, sub: 'room' };
      if ((b === 'feature' || b === 'report' || b === 'how') && parts[3])
        return { name: 'office', projectId: a, sub: b, id: parts[3] };
      if (b === 'board' || b === 'how' || b === 'health' || b === 'features' || b === 'reports')
        return { name: 'office', projectId: a, sub: b };
      return { name: 'office', projectId: a, sub: 'room' };
    }
    case 'gallery':
      return { name: 'gallery', section: a ?? '' };
    default:
      return { name: 'projects' };
  }
}

const enc = encodeURIComponent;
export function formatRoute(r: Route): string {
  switch (r.name) {
    case 'projects':
    case 'access':
    case 'blueprint':
      return `#${r.name}`;
    case 'cast':
      return r.tab === 'teams' ? '#cast/teams' : '#cast';
    case 'cast.agent':
      return `#cast/agent/${enc(r.id)}`;
    case 'cast.tinker':
      return r.sid ? `#cast/agent/tinker/${enc(r.sid)}` : '#cast/agent/tinker';
    case 'cast.team':
      return `#cast/teams/${enc(r.id)}`;
    case 'new':
      return r.draftId ? `#new/${enc(r.draftId)}` : '#new';
    case 'office': {
      const base = `#office/${enc(r.projectId)}`;
      if (r.sub === 'room') return base;
      if (r.sub === 'feature' || r.sub === 'report')
        return r.id ? `${base}/${r.sub}/${enc(r.id)}` : `${base}/${r.sub}s`;
      if (r.sub === 'how' && r.id) return `${base}/how/${enc(r.id)}`;
      return `${base}/${r.sub}`;
    }
    case 'gallery':
      return r.section ? `#gallery/${enc(r.section)}` : '#gallery';
  }
}

/** Which nav stage is lit for a route (null outside the studio layer). */
export function stageOf(r: Route): Stage | null {
  if (r.name === 'projects' || r.name === 'new') return 'projects';
  if (r.name === 'cast' || r.name === 'cast.agent' || r.name === 'cast.tinker' || r.name === 'cast.team')
    return 'cast';
  if (r.name === 'access' || r.name === 'blueprint') return r.name;
  return null;
}

/** Navigate. Re-navigating to the current hash re-fires hashchange (the prototype's go()). */
export function go(to: Route | string): void {
  const h = typeof to === 'string' ? `#${to.replace(/^#/, '')}` : formatRoute(to);
  if (location.hash === h) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = h;
}

const subscribe = (fn: () => void) => {
  window.addEventListener('hashchange', fn);
  return () => window.removeEventListener('hashchange', fn);
};
const snapshot = () => location.hash;

/** The current route; re-renders on navigation. */
export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, snapshot, () => '');
  return useMemo(() => parseRoute(hash), [hash]);
}
