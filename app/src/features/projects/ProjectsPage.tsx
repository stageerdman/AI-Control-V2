/* Projects home (#projects) — the prototype's renderProjects(): head with "+ New project" (and the
   Reports button), search (press /), then shelves: In setup (drafts) · On set today · The back lot. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { type Agent, type Draft, type Project, studio, type Team, useQuery } from '../../api';
import { Hero } from '../../characters/Hero';
import { go } from '../../shell/router';
import { Button, EmptyState, ErrorState, Loading, Pill, Progress } from '../../ui';
import { DraftCard } from '../setup/DraftCard';
import { DRAFTS_KEY } from '../setup/drafts';
import { studioReports } from './api';
import { LogoTile } from './LogoTile';
import {
  backLotTag,
  castOf,
  editedAgo,
  ghBadge,
  nickOf,
  progressLine,
  type Shelves,
  shelfCount,
  shelves,
} from './model';
import './projects.css';

const newProject = () => go({ name: 'new', draftId: null });
let lastQuery = ''; // the prototype keeps the search across visits

export function ProjectsPage() {
  const projects = useQuery('projects', studio.projects.list);
  const drafts = useQuery(DRAFTS_KEY, studio.drafts.list);
  const agents = useQuery('agents', studio.agents.list);
  const teams = useQuery('teams', studio.teams.list);
  const [q, setQ] = useState(lastQuery);
  const search = useRef<HTMLInputElement>(null);
  lastQuery = q;

  /* status + progress move on their own (server lifecycle) and there's no studio-wide stream:
     fresh on every visit, then a quiet refresh while the page is on screen */
  const refresh = projects.refetch;
  useEffect(() => {
    void refresh();
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, 10000);
    return () => clearInterval(t);
  }, [refresh]);

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

  const s = useMemo(
    () => shelves(projects.data ?? [], drafts.data ?? [], q),
    [projects.data, drafts.data, q],
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
        <ReportsButton />
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
        <div className="result-count" aria-live="polite">
          {!loading && !err ? shelfCount(s) : ''}
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
        <ShelvesView s={s} q={q} agents={agents.data ?? []} teams={teams.data ?? []} />
      )}
    </>
  );
}

function ShelvesView({ s, q, agents, teams }: { s: Shelves; q: string; agents: Agent[]; teams: Team[] }) {
  const orchestrators = agents.filter((a) => a.kind === 'orchestrator');
  if (!s.onSet.length && !s.backLot.length && !s.drafts.length)
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
  return (
    <div>
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
      <section className="shelf active-shelf" aria-labelledby="shelf-active">
        <div className="shelf-head">
          <h2 id="shelf-active">On set today</h2>
          <span className="cnt">{s.onSet.length} active</span>
        </div>
        <div className="shelf-hr" />
        <div className="shelf-grid">
          {s.onSet.map((p) => (
            <ActiveCard key={p.id} p={p} agents={agents} teams={teams} />
          ))}
          {!s.onSet.length && (
            <p className="hint" style={{ color: 'rgba(255,246,233,.6)' }}>
              {q.trim() ? 'Nothing on set matches.' : 'Nothing on set right now.'}
            </p>
          )}
        </div>
      </section>
      <section className="shelf db-shelf" aria-labelledby="shelf-db">
        <div className="shelf-head">
          <h2 id="shelf-db">The back lot</h2>
          <span className="cnt">{s.backLot.length} saved</span>
        </div>
        <div className="shelf-hr" />
        <div className="shelf-grid">
          {s.backLot.map((p) => (
            <BackLotCard key={p.id} p={p} />
          ))}
          {!s.backLot.length && (
            <p className="hint" style={{ color: 'rgba(255,246,233,.6)' }}>
              {q.trim() ? 'Nothing in the back lot matches.' : 'The back lot is empty.'}
            </p>
          )}
        </div>
      </section>
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
        <LogoTile tile={p.tile} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
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
      <LogoTile tile={p.tile} small />
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

/** "Reports" — the studio-wide Reports space; a coral dot while something is unread. */
function ReportsButton() {
  const r = useQuery('reports:studio', studioReports);
  const unread = r.data?.unread ?? 0;
  return (
    <a
      href="#reports"
      className="btn btn-ghost on-dark reports-btn"
      aria-label={unread ? `Reports — ${unread} unread` : 'Reports'}
    >
      📄 Reports
      {unread > 0 && <span className="unread-dot" aria-hidden="true" />}
    </a>
  );
}
