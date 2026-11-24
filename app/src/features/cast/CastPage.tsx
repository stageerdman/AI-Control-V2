/* The Cast — routes #cast · #cast/teams · #cast/agent/:id|new|new-orchestrator · #cast/teams/:id|new
   · #cast/agent/tinker[/:sid] (design a new agent with Tinker).
   One mounted page for all of them so the zooms animate in place (camera push / FLIP) between
   the list and the detail, like the prototype's renderCast(). */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useQuery } from '../../api';
import type { Route } from '../../shell/router';
import { ErrorState, Loading } from '../../ui';
import { castApi, KEYS } from './api';
import { HeroZoom } from './HeroZoom';
import { Lineup } from './Lineup';
import { RecentlyDeleted } from './RecentlyDeleted';
import { RollCall } from './RollCall';
import { SquadZoom } from './SquadZoom';
import { useCast } from './store';
import { TinkerZoom } from './TinkerZoom';
import './cast.css';

type Tab = 'agents' | 'teams';
type Zoom = {
  kind: 'agent' | 'team' | 'tinker';
  /** For 'tinker': the saved chat ('' until the first message). */
  id: string;
  session: number;
  animate: boolean;
  closing: boolean;
  created?: string;
};

const tabOf = (r: Route): Tab =>
  r.name === 'cast.team' || (r.name === 'cast' && r.tab === 'teams') ? 'teams' : 'agents';
const zoomOf = (r: Route) =>
  r.name === 'cast.agent'
    ? { kind: 'agent' as const, id: r.id }
    : r.name === 'cast.team'
      ? { kind: 'team' as const, id: r.id }
      : r.name === 'cast.tinker'
        ? { kind: 'tinker' as const, id: r.sid ?? '' }
        : null;

let sessions = 0;
/** The search survives tab switches (the prototype's CAST.q). */
let lastQ = '';

/** Registered for 'cast', 'cast.agent', 'cast.tinker' and 'cast.team'. */
export function CastPage({
  route,
}: {
  route: Extract<Route, { name: 'cast' | 'cast.agent' | 'cast.tinker' | 'cast.team' }>;
}) {
  const { agents, roles, teams, loading, error, retry } = useCast();
  const draftsQ = useQuery(KEYS.tinker, castApi.tinker.list);
  const drafts = draftsQ.data?.sessions;
  /* agents propose drafts from their projects at any time: read them fresh each time the Cast opens */
  // biome-ignore lint/correctness/useExhaustiveDependencies: once per visit
  useEffect(() => void draftsQ.refetch(), []);
  const tab = tabOf(route);
  const [z, setZ] = useState<Zoom | null>(() => {
    const w = zoomOf(route);
    return w ? { ...w, session: ++sessions, animate: false, closing: false } : null;
  });
  const [q, setQ] = useState(lastQ);
  const prefill = useRef<{ name?: string } | null>(null);
  const prevTab = useRef(tab);
  const world = useRef<HTMLDivElement>(null);

  /* the scene is the shell's <section class="scene">: give it the prototype's id (cast.css keys off it) */
  useLayoutEffect(() => {
    const scene = world.current?.closest('.scene');
    if (!scene) return;
    scene.id = 'scene-cast';
    return () => {
      scene.removeAttribute('id');
      scene.classList.remove('zoomed');
    };
  }, []);

  /* route → zoom transitions (open / close animated, swap in place, a new record keeps its session) */
  // biome-ignore lint/correctness/useExhaustiveDependencies: driven by the route only
  useEffect(() => {
    const want = zoomOf(route);
    const tabChanged = prevTab.current !== tab;
    prevTab.current = tab;
    setZ((cur) => {
      if (tabChanged) {
        if (world.current) world.current.parentElement?.scrollTo?.({ top: 0 });
        return want ? { ...want, session: ++sessions, animate: false, closing: false } : null;
      }
      if (!cur && want) return { ...want, session: ++sessions, animate: true, closing: false };
      if (cur && !want) return cur.closing ? cur : { ...cur, closing: true, animate: true };
      if (cur && want) {
        if (cur.closing) return { ...want, session: ++sessions, animate: false, closing: false };
        if (want.id === cur.id) return cur;
        if (cur.kind === 'tinker' && want.kind === 'tinker' && !cur.id) return { ...cur, id: want.id }; // the chat got its id
        if (cur.created === want.id) return { ...cur, id: want.id };
        if (cur.kind === 'agent' && want.kind === 'agent' && !/^new/.test(want.id) && !/^new/.test(cur.id))
          return { ...cur, id: want.id }; // ‹ › step: same stage, the bot slides
        return { ...want, session: ++sessions, animate: false, closing: false };
      }
      return cur;
    });
  }, [route]);

  const closed = (session: number) =>
    setZ((cur) => (cur && cur.session === session && cur.closing ? null : cur));
  const created = (session: number, id: string) =>
    setZ((cur) => (cur && cur.session === session ? { ...cur, created: id } : cur));

  const ready = agents && roles && teams;
  return (
    <>
      <div className="cast-world" ref={world}>
        <div className="scene-head cast-head">
          <h1>The Cast</h1>
          <div className="lib-tabs" role="tablist" aria-label="Cast">
            <a role="tab" href="#cast" aria-selected={tab === 'agents'}>
              Agents
            </a>
            <a role="tab" href="#cast/teams" aria-selected={tab === 'teams'}>
              Teams
            </a>
          </div>
          <div className="spacer" />
          {tab === 'agents' ? (
            <label className="cast-search">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2.4" />
                <path d="M16.5 16.5 L21 21" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
              </svg>
              <input
                type="search"
                id="castSearch"
                placeholder="Search name or role"
                aria-label="Search the cast by name or role"
                autoComplete="off"
                value={q}
                onChange={(e) => {
                  lastQ = e.target.value;
                  setQ(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape' && q) {
                    e.preventDefault();
                    lastQ = '';
                    setQ('');
                  }
                }}
              />
            </label>
          ) : (
            <a className="btn btn-sm cast-new-team" href="#cast/teams/new">
              + New team
            </a>
          )}
        </div>
        <div id="castBody">
          {error && !ready ? (
            <div className="cast-state">
              <ErrorState error={error} onRetry={() => void retry()} />
            </div>
          ) : loading || !ready ? (
            <div className="cast-state">
              <Loading />
            </div>
          ) : tab === 'agents' ? (
            <>
              <Lineup
                agents={agents}
                drafts={drafts ?? []}
                q={q}
                hidden={!!z && !z.closing}
                onRecruit={(name) => {
                  prefill.current = { name };
                  location.hash = '#cast/agent/new';
                }}
              />
              <RecentlyDeleted hidden={!!z && !z.closing} />
            </>
          ) : (
            <RollCall teams={teams} agents={agents} hidden={!!z && !z.closing} />
          )}
        </div>
      </div>
      {ready && z?.kind === 'agent' && (
        <HeroZoom
          key={z.session}
          id={z.id}
          animate={z.animate}
          closing={z.closing}
          onClosed={() => closed(z.session)}
          onCreated={(id) => created(z.session, id)}
          prefill={consume(prefill)}
          agents={agents}
          roles={roles}
          teams={teams}
        />
      )}
      {ready && z?.kind === 'tinker' && (
        <TinkerZoom
          key={z.session}
          sid={z.id || null}
          animate={z.animate}
          closing={z.closing}
          onClosed={() => closed(z.session)}
          agents={agents}
          roles={roles}
          teams={teams}
        />
      )}
      {ready && z?.kind === 'team' && (
        <SquadZoom
          key={z.session}
          id={z.id}
          animate={z.animate}
          closing={z.closing}
          onClosed={() => closed(z.session)}
          onCreated={(id) => created(z.session, id)}
          agents={agents}
          teams={teams}
        />
      )}
    </>
  );
}

/** read-once (the voice / search "Recruit “x”" prefill) */
function consume<T>(ref: { current: T | null }): T | null {
  const v = ref.current;
  if (v) setTimeout(() => (ref.current = null), 0);
  return v;
}
