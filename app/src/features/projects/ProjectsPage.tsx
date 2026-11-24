/* Projects home (#projects): head with "+ New project", search (press /), then shelves:
   My Workplace (pinned) · Today (the user gave work today) · In setup · All other projects · Not adopted. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { type Agent, type Draft, type Project, studio, type Team, useQuery } from '../../api';
import { Hero } from '../../characters/Hero';
import { go } from '../../shell/router';
import { Button, EmptyState, ErrorState, Loading, Pill, Progress } from '../../ui';
import { sandboxFolders } from '../setup/api';
import { DraftCard } from '../setup/DraftCard';
import { DRAFTS_KEY } from '../setup/drafts';
import { LogoTile } from './LogoTile';
import {
  backLotTag,
  castOf,
  editedAgo,
  ghBadge,
  homeShelves,
  nickOf,
  pinned,
  progressLine,
  type Shelves,
  unadopted,
} from './model';
import { NotAdoptedShelf } from './NotAdoptedShelf';
import { PinButton } from './PinButton';
import { usePins } from './usePins';
import './projects.css';

const newProject = () => go({ name: 'new', draftId: null });
let lastQuery = ''; // the prototype keeps the search across visits

export function ProjectsPage() {
  const projects = useQuery('projects', studio.projects.list);
  const drafts = useQuery(DRAFTS_KEY, studio.drafts.list);
  const agents = useQuery('agents', studio.agents.list);
  const teams = useQuery('teams', studio.teams.list);
  const folders = useQuery('sandbox:folders', sandboxFolders);
  const [q, setQ] = useState(lastQuery);
  const search = useRef<HTMLInputElement>(null);
  lastQuery = q;

  /* status + progress move on their own (server lifecycle) and there's no studio-wide stream:
     fresh on every visit, then a quiet refresh while the page is on screen */
  const refresh = projects.refetch;
  const refreshFolders = folders.refetch;
  useEffect(() => {
    void refresh();
    void refreshFolders(); // a folder adopted elsewhere (or added to ~/dev) since the last visit
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, 10000);
    return () => clearInterval(t);
  }, [refresh, refreshFolders]);

  /* "/" jumps to the search (not while typing somewhere) */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key !== '/' || /input|textarea|select/i.test(t.tagName) || t.isContentEditable) return;
      if (document.querySelector('.scrim')) return;
      e.preventDefault();
      search.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* a fresh `now` on every refresh, so at midnight Today empties into All other */
  const s = useMemo(
    () => homeShelves(projects.data ?? [], drafts.data ?? [], q, Date.now()),
    [projects.data, drafts.data, q],
  );
  const pins = usePins();
  const anyPins = (projects.data ?? []).some(pinned);
  const loose = useMemo(
    () => unadopted(folders.data ?? [], drafts.data ?? [], q),
    [folders.data, drafts.data, q],
  );
  const err = projects.error ?? drafts.error ?? agents.error ?? teams.error;
  const loading = projects.loading || drafts.loading || agents.loading || teams.loading;

  return (
    <>
      <div className="scene-head">
        <div>
          <div className="kicker">The Studio Lot</div>
          <h1>Every production, at a glance</h1>
        </div>
        <div className="spacer" />
        <Button variant="hero" onClick={newProject}>
          ＋ New project
        </Button>
      </div>
      <div className="row" style={{ marginBottom: 18, gap: 16 }}>
        <div className="search-wrap">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
            <line
              x1="16.5"
              y1="16.5"
              x2="21"
              y2="21"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          <input
            ref={search}
            type="search"
            placeholder="Search projects…  (press /)"
            aria-label="Search projects"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setQ('');
            }}
          />
        </div>
      </div>
      {err ? (
        <ErrorState
          error={err}
          title="Couldn’t load the studio lot"
          onRetry={() => {
            for (const x of [projects, drafts, agents, teams]) if (x.error) void x.refetch();
          }}
        />
      ) : loading ? (
        <Loading label="Opening the studio lot…" />
      ) : (
        <ShelvesView
          s={s}
          q={q}
          anyPins={anyPins}
          onPin={pins.toggle}
          moved={pins.moved}
          agents={agents.data ?? []}
          teams={teams.data ?? []}
          looseCount={loose.length + (folders.error ? 1 : 0)}
          loose={
            /* never blocks the page: still loading = no shelf yet */
            <NotAdoptedShelf
              folders={loose}
              error={folders.error}
              onRetry={() => void folders.refetch()}
              forceOpen={!hasWork(s) || !!q.trim()}
              orchestratorId={agents.data?.find((a) => a.kind === 'orchestrator')?.id ?? null}
            />
          }
        />
      )}
      <div className="sr-only" role="status" aria-live="polite">
        {pins.said}
      </div>
    </>
  );
}

const hasWork = (s: Shelves) => !!(s.workplace.length || s.today.length || s.rest.length || s.drafts.length);

function ShelvesView({
  s,
  q,
  anyPins,
  onPin,
  moved,
  agents,
  teams,
  loose,
  looseCount,
}: {
  s: Shelves;
  q: string;
  anyPins: boolean;
  onPin: (id: string) => void;
  /** The project that just changed shelf (and a tick that bumps on every move). */
  moved: { id: string; n: number } | null;
  agents: Agent[];
  teams: Team[];
  loose: React.ReactNode;
  looseCount: number;
}) {
  const orchestrators = agents.filter((a) => a.kind === 'orchestrator');
  if (!hasWork(s) && looseCount > 0)
    return (
      <div>
        <p className="hint" style={{ color: 'rgba(255,246,233,.75)' }}>
          {q.trim() ? 'No production by that name.' : 'Pick a folder to adopt, or start something new.'}
        </p>
        {loose}
      </div>
    );
  if (!hasWork(s))
    return (
      <EmptyState
        title={q.trim() ? 'No production by that name' : 'No productions yet'}
        action={
          <Button variant="hero" onClick={newProject}>
            ＋ New project
          </Button>
        }
      >
        {q.trim() ? 'Start a new one?' : 'Start one, or adopt a folder you already have.'}
      </EmptyState>
    );
  const slot = (p: Project, card: React.ReactNode) => (
    <div key={p.id} className={`pcard-slot${p.id === moved?.id ? ' arrived' : ''}`}>
      {card}
      <PinButton
        name={p.name}
        pinned={pinned(p)}
        onToggle={() => onPin(p.id)}
        focusTick={p.id === moved?.id ? moved.n : undefined}
      />
    </div>
  );
  const full = (p: Project) => slot(p, <ActiveCard p={p} agents={agents} teams={teams} />);
  return (
    <div>
      {s.workplace.length > 0 ? (
        <section className="shelf active-shelf" aria-labelledby="shelf-workplace">
          <div className="shelf-head">
            <h2 id="shelf-workplace">My Workplace</h2>
            <span className="cnt">{s.workplace.length}</span>
          </div>
          <div className="shelf-hr" />
          <div className="shelf-grid">{s.workplace.map(full)}</div>
        </section>
      ) : (
        !anyPins &&
        !q.trim() && (
          <p className="hint pin-hint">📌 Pin the projects you keep coming back to. They’ll stay up here.</p>
        )
      )}
      {s.today.length > 0 && (
        <section className="shelf today-shelf" aria-labelledby="shelf-today">
          <div className="shelf-head">
            <h2 id="shelf-today">Today</h2>
            <span className="cnt">{s.today.length}</span>
          </div>
          <div className="shelf-hr" />
          <div className="shelf-grid">{s.today.map(full)}</div>
        </section>
      )}
      {s.drafts.length > 0 && (
        <section className="shelf draft-shelf" aria-labelledby="shelf-drafts">
          <div className="shelf-head">
            <h2 id="shelf-drafts">In setup</h2>
            <span className="cnt">
              {s.drafts.length} draft{s.drafts.length > 1 ? 's' : ''}
            </span>
          </div>
          <div className="shelf-hr" />
          <div className="shelf-grid">
            {s.drafts.map((d: Draft) => (
              <DraftCard key={d.id} draft={d} orchestrators={orchestrators} />
            ))}
          </div>
        </section>
      )}
      {s.rest.length > 0 && (
        <section className="shelf db-shelf" aria-labelledby="shelf-rest">
          <div className="shelf-head">
            <h2 id="shelf-rest">All other projects</h2>
            <span className="cnt">{s.rest.length}</span>
          </div>
          <div className="shelf-hr" />
          <div className="shelf-grid">{s.rest.map((p) => slot(p, <BackLotCard p={p} />))}</div>
        </section>
      )}
      {loose}
    </div>
  );
}

const openOffice = (p: Project) => go({ name: 'office', projectId: p.id, sub: 'room' });

function ActiveCard({ p, agents, teams }: { p: Project; agents: Agent[]; teams: Team[] }) {
  const cast = castOf(p, teams);
  const shown = cast
    .map((id) => agents.find((a) => a.id === id))
    .filter((a): a is Agent => !!a)
    .slice(0, 4);
  const orch = agents.find((a) => a.id === p.orchestratorId);
  return (
    <button
      type="button"
      className={`pcard${p.status === 'live' ? ' live' : ''}${p.status === 'needs' ? ' needs' : ''}`}
      onClick={() => openOffice(p)}
    >
      <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
        <LogoTile tile={p.tile} imageUrl={p.imageUrl} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row pcard-top" style={{ justifyContent: 'space-between', gap: 8 }}>
            <h3>{p.name}</h3>
            {p.status === 'live' ? (
              <Pill tone="live" dot>
                Live
              </Pill>
            ) : p.status === 'needs' ? (
              <Pill tone="needs">❗ Needs input</Pill>
            ) : (
              <Pill tone="idle">Idle</Pill>
            )}
          </div>
          <div className="hint">
            {orch ? nickOf(orch) : 'No orchestrator'} · {cast.length} agent{cast.length === 1 ? '' : 's'}
          </div>
        </div>
      </div>
      <div className="mini-cast" aria-hidden="true">
        {shown.map((a, i) => (
          <Hero
            key={a.id}
            agent={a}
            size="xs"
            pose={p.status === 'needs' && i === 0 ? 'needs-input' : 'idle'}
            facing="three-quarter"
            dir={i < shown.length / 2 ? 'right' : 'left'}
          />
        ))}
        {cast.length > shown.length && <span className="plus-chip">+{cast.length - shown.length}</span>}
      </div>
      <Progress value={p.progress} small label={`${p.name} progress`} />
      <div className="hint" style={{ marginTop: 5, fontWeight: 800 }}>
        {progressLine(p)}
      </div>
      {p.note && <div className="note">{p.note}</div>}
      {p.github.connected && (
        <div className="micro-row">
          <span className="micro-badge">{ghBadge(p.github)}</span>
        </div>
      )}
    </button>
  );
}

function BackLotCard({ p }: { p: Project }) {
  const tag = backLotTag(p);
  return (
    <button type="button" className="pcard-db" onClick={() => openOffice(p)}>
      <LogoTile tile={p.tile} imageUrl={p.imageUrl} small />
      <div style={{ flex: 1, minWidth: 0 }}>
        <h3>{p.name}</h3>
        <div className="sub">
          {editedAgo(p.updatedAt)}
          {p.github.connected && !p.github.private ? ' · Public' : ''}
        </div>
      </div>
      <Pill tone={tag.tone}>{tag.label}</Pill>
    </button>
  );
}
