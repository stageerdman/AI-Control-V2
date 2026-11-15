/* Cast → Agents: the character-select lineup on the dark stage. Studio crew row(s) first
   ("Studio crew · Required"), then everyone else in balanced rows, characters facing inward,
   then Tinker's open drafts, then the recruit ghost. Hover / keyboard focus = spotlight cone, the bot turns front + hops,
   the rest of the lineup dims. Arrows move between slots (roving tabindex). */
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Agent, CreatorSession } from '../../api/types';
import { Hero, type HeroHandle } from '../../characters';
import { go } from '../../shell/router';
import { announce, hop } from './fx';
import { castOrder, inwardFacing, isCrew, lineupCols, lineupRows, roleText, shortName } from './model';

/** A cast member, one of Tinker's drafts, or the recruit ghost. */
type Item = { id: string; agent: Agent | null; draft?: CreatorSession };

export function Lineup({
  agents,
  drafts = [],
  q,
  onRecruit,
  hidden,
}: {
  agents: Agent[];
  /** Design chats with Tinker still open — each waits as a draft slot before the ghost. */
  drafts?: CreatorSession[];
  q: string;
  onRecruit: (name: string) => void;
  /** The zoom is open: keep the lineup (for the camera move) but out of the tab order. */
  hidden?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState(0);
  const [hot, setHot] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setCols(lineupCols(el.clientWidth || 1000));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const order = useMemo(() => castOrder(agents), [agents]);
  const query = q.trim().toLowerCase();
  const hit = (a: Agent) => !query || `${a.name} ${roleText(a)}`.toLowerCase().includes(query);
  const n = order.filter(hit).length;
  const none = !!query && n === 0;

  const rows = useMemo(() => {
    const crew: Item[] = order.filter(isCrew).map((a) => ({ id: a.id, agent: a }));
    const rest: Item[] = order.filter((a) => !isCrew(a)).map((a) => ({ id: a.id, agent: a }));
    for (const d of drafts) rest.push({ id: `tinker:${d.id}`, agent: null, draft: d });
    rest.push({ id: 'new', agent: null });
    return lineupRows(crew, rest, cols || 6);
  }, [order, drafts, cols]);
  const creator = agents.find((a) => a.kind === 'creator');
  const tName = creator ? shortName(creator) : 'Tinker';
  const nCrew = rows.filter((r) => r.crew).length;

  /* visible slots in DOM order — roving focus + arrow keys */
  const visible = rows.flatMap((r, ri) =>
    r.items
      .filter((it) => (it.agent ? hit(it.agent) : !none))
      .map((it) => ({ id: it.id, row: ri, col: r.items.indexOf(it) })),
  );
  const tabId = visible.find((v) => v.id === focusId)?.id ?? visible[0]?.id;

  /* announce search results (debounced, like the prototype) */
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(
      () =>
        announce(
          !query ? 'Showing the whole cast' : n ? `${n} agent${n === 1 ? '' : 's'} match` : 'No agents match',
        ),
      350,
    );
    return () => clearTimeout(t);
  }, [query, n]);

  const onKey = (e: React.KeyboardEvent) => {
    const i = visible.findIndex((v) => v.id === (document.activeElement as HTMLElement)?.dataset?.id);
    if (i < 0) return;
    const cur = visible[i] as (typeof visible)[number];
    let j: number | null = null;
    if (e.key === 'ArrowRight') j = Math.min(visible.length - 1, i + 1);
    else if (e.key === 'ArrowLeft') j = Math.max(0, i - 1);
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = visible.length - 1;
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const r = cur.row + (e.key === 'ArrowDown' ? 1 : -1);
      const inRow = visible.filter((v) => v.row === r);
      if (inRow.length) {
        const t = inRow.reduce((b, v) => (Math.abs(v.col - cur.col) < Math.abs(b.col - cur.col) ? v : b));
        j = visible.indexOf(t);
      } else j = i;
    } else return;
    e.preventDefault();
    e.stopPropagation();
    const to = visible[j] as (typeof visible)[number];
    setFocusId(to.id);
    ref.current?.querySelector<HTMLElement>(`.slot[data-id="${CSS.escape(to.id)}"]`)?.focus();
  };

  return (
    <div className="lineup-wrap" inert={hidden || undefined}>
      {/* biome-ignore lint/a11y/useSemanticElements: the prototype's lineup — rows are presentational */}
      <div
        ref={ref}
        className={`lineup${hot ? ' has-hot' : ''}`}
        role="list"
        aria-label="Agents"
        onKeyDown={onKey}
      >
        {cols > 0 &&
          rows.map((row, ri) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional
              key={ri}
              className={`lineup-row${row.crew ? ' crew-row' : ''}${row.crew && ri === nCrew - 1 ? ' crew-last' : ''}`}
              role="presentation"
            >
              <span className="lineup-floor" aria-hidden="true" />
              {ri === 0 && nCrew > 0 && (
                <span className="crew-label" aria-hidden="true">
                  Studio crew <em>Required</em>
                </span>
              )}
              {row.items.map((it, i) => {
                const away = it.agent ? !hit(it.agent) : none;
                return (
                  <Slot
                    key={it.id}
                    agent={it.agent}
                    draft={it.draft}
                    tinker={tName}
                    face={inwardFacing(i, row.items.length)}
                    row={ri}
                    col={i}
                    away={away}
                    hot={hot === it.id}
                    tab={tabId === it.id}
                    setHot={(on) => setHot((h) => (on ? it.id : h === it.id ? null : h))}
                    onFocusSlot={() => setFocusId(it.id)}
                  />
                );
              })}
            </div>
          ))}
      </div>
      <p className="lineup-none" hidden={!none}>
        {none && (
          <>
            No one by that name.{' '}
            <button type="button" className="recruit-q" onClick={() => onRecruit(q.trim().slice(0, 22))}>
              Recruit “{q.trim().slice(0, 22)}”
            </button>
          </>
        )}
      </p>
    </div>
  );
}

const Slot = memo(function Slot({
  agent,
  draft,
  tinker,
  face,
  row,
  col,
  away,
  hot,
  tab,
  setHot,
  onFocusSlot,
}: {
  agent: Agent | null;
  draft?: CreatorSession | undefined;
  tinker: string;
  face: { facing: 'front' | 'three-quarter'; dir: 'left' | 'right' };
  row: number;
  col: number;
  away: boolean;
  hot: boolean;
  tab: boolean;
  setHot: (on: boolean) => void;
  onFocusSlot: () => void;
}) {
  const h = useRef<HeroHandle>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const ghost = !agent;
  useEffect(() => {
    if (hot && !ghost) hop(h.current?.el);
  }, [hot, ghost]);
  const crew = agent ? isCrew(agent) : false;
  const id = agent?.id ?? (draft ? `tinker:${draft.id}` : 'new');
  const dName = draft?.draft?.name?.trim() || 'New agent';
  const rt = agent ? roleText(agent) : draft ? `Draft · ${tinker}` : '+ Recruit';
  return (
    // biome-ignore lint/a11y/useSemanticElements: the prototype's list markup
    <div
      className={`slot-li${crew ? ' crew-li' : ''}${ghost ? ' ghost-li' : ''}${away ? ' away' : ''}`}
      role="listitem"
      inert={away || undefined}
    >
      <button
        ref={btn}
        type="button"
        className={`slot${ghost ? ' slot-ghost' : ''}${draft ? ' slot-draft' : ''}${hot ? ' hot' : ''}`}
        data-id={id}
        data-row={row}
        data-col={col}
        data-facing={face.facing}
        data-dir={face.dir}
        tabIndex={tab ? 0 : -1}
        aria-label={
          agent
            ? `${agent.name}, ${rt}${crew ? ', studio crew, required' : ''}. Open details`
            : draft
              ? `${dName}, draft with ${tinker}. Resume`
              : 'Create a new agent'
        }
        onMouseEnter={() => setHot(true)}
        onMouseLeave={() => {
          if (document.activeElement !== btn.current || !btn.current?.matches(':focus-visible'))
            setHot(false);
        }}
        onFocus={() => {
          onFocusSlot();
          if (btn.current?.matches(':focus-visible')) setHot(true);
        }}
        onBlur={() => setHot(false)}
        onClick={() =>
          go(draft ? { name: 'cast.tinker', sid: draft.id } : { name: 'cast.agent', id: agent?.id ?? 'new' })
        }
      >
        <span className="slot-cone" aria-hidden="true" />
        <span className="slot-fig">
          <span className="slot-pool" aria-hidden="true" />
          {agent ? (
            <Hero ref={h} agent={agent} size="md" facing={hot ? 'front' : face.facing} dir={face.dir} />
          ) : draft?.draft?.look ? (
            <Hero agent={{ name: dName, look: draft.draft.look }} size="md" facing="front" />
          ) : (
            <Hero ghost agent={{ hue: 'sun' }} size="md" facing="front" />
          )}
        </span>
        <span className="slot-name">{agent ? agent.name : dName}</span>
        <span className={`slot-role${agent && !crew && !agent.roleId ? ' none' : ''}`}>{rt}</span>
      </button>
    </div>
  );
});
