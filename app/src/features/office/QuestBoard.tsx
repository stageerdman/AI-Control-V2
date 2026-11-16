/* The Quest Board's two sections (design-quest-board.md in updates/2026-11-16 MAIN AND SIDE QUESTS):
     Main Quests  one big card (ribbon · progress · the trail of steps) + the other features in progress, folded
     Side Quests  pinned cards, one per side-quest goal; older finished ones fold into one strip
   Every row and card keeps the task card's anatomy (TaskCard.tsx): mark · title · who · why it stopped. */
import { useState } from 'react';
import { type Goal, invalidate, isApiError, studio } from '../../api';
import { Hero } from '../../characters';
import type { OfficeSub } from '../../shell/router';
import { Button, toast } from '../../ui';
import { type Feature, keys } from './api';
import { type MainQuest, questBoard, type SideQuest } from './quests';
import { taskCard } from './state';
import { Mark, People, Problem, TaskCard } from './TaskCard';
import './quests.css';

type Props = {
  pid: string;
  dir: string;
  goals: Goal[];
  features: Feature[];
  go: (sub: OfficeSub, id?: string) => void;
  nameOf: (id: string) => string;
  /** For tests: what "this hour" is. */
  now?: Date;
};

export function QuestBoard({ pid, dir, goals, features, go, nameOf, now }: Props) {
  const b = questBoard(goals, features, now);
  return (
    <>
      <section aria-labelledby="qbMain" className="qb-sec">
        <h3 id="qbMain">Main Quests</h3>
        <MainCard pid={pid} dir={dir} q={b.main} go={go} nameOf={nameOf} />
        {b.others.length > 0 && (
          <ul className="qb-others">
            {b.others.map((f) => (
              <li key={f.id}>
                <button type="button" onClick={() => go('feature', f.id)}>
                  <Glyph id="main" />
                  <span className="qb-on">{f.name}</span>
                  <span className="ob-track" aria-hidden="true">
                    <i style={{ width: `${f.pct ?? 0}%` }} />
                  </span>
                  <span className="ob-pct">{f.pct ?? 0}%</span>
                  <span className="ob-chev" aria-hidden="true">
                    ›
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {b.tagged && (
        <section aria-labelledby="qbSide" className="qb-sec">
          <div className="qb-sh">
            <h3 id="qbSide">Side Quests</h3>
            {b.count && <span className="qb-count">{b.count}</span>}
          </div>
          <GoalActions pid={pid} goals={b.stuckSide} label="Side quest stopped partway." />
          {!b.side.length && !b.doneEarlier.length ? (
            <p className="ob-empty">No side quests. All quiet.</p>
          ) : (
            <>
              {b.side.length > 0 && <SideGrid quests={b.side} nameOf={nameOf} />}
              <DoneStrip quests={b.doneEarlier} nameOf={nameOf} />
            </>
          )}
        </section>
      )}
    </>
  );
}

/* ------------------------------------------------------------ main quest */
function MainCard({
  pid,
  dir,
  q,
  go,
  nameOf,
}: {
  pid: string;
  dir: string;
  q: MainQuest | null;
  go: Props['go'];
  nameOf: Props['nameOf'];
}) {
  if (!q)
    return (
      <div className="qb-main empty">
        <div className="qb-top" aria-hidden="true">
          <div className="qb-rh">
            <div className="qb-ribbon" />
          </div>
        </div>
        <p className="ob-empty">No main quest yet. Tell {dir} what to build.</p>
      </div>
    );
  const lastDone = q.steps.reduce((n, s, i) => (s.item.status === 'done' ? i : n), -1);
  const label = `Main quest: ${q.name}, ${q.pct}%, ${q.done} of ${q.total} step${q.total === 1 ? '' : 's'}`;
  return (
    <div className="qb-main">
      <div className="qb-top">
        <h4 className="qb-rh">
          {q.featureId ? (
            <button
              type="button"
              className="qb-ribbon"
              title={q.name}
              aria-label={label}
              onClick={() => go('feature', q.featureId ?? undefined)}
            >
              <span>{q.name}</span>
            </button>
          ) : (
            <span className="qb-ribbon" title={q.name}>
              <span aria-hidden="true">{q.name}</span>
              <span className="sr-only">{label}</span>
            </span>
          )}
        </h4>
        {q.featureId && (
          <button type="button" className="qb-ships" onClick={() => go('feature', q.featureId ?? undefined)}>
            {q.ships ? 'Ships when done ›' : 'Part of this quest ›'}
          </button>
        )}
      </div>
      <div className="qb-prog" aria-hidden="true">
        <b>
          {q.pct}
          <small>%</small>
        </b>
        <span>
          {q.done} of {q.total} step{q.total === 1 ? '' : 's'}
        </span>
        <span className="ob-track">
          <i style={{ width: `${q.pct}%` }} />
        </span>
      </div>
      {q.steps.length ? (
        <ul className="ob-tasks qb-trail">
          {q.steps.map((s, i) => {
            const stuck = q.stuckGoalOf[s.id];
            return (
              <TaskCard
                key={s.id}
                item={s.item}
                nameOf={nameOf}
                className={i < lastDone ? 'qb-lit' : undefined}
                actions={
                  stuck ? <GoalActions pid={pid} goals={[{ id: stuck } as Goal]} label={null} /> : undefined
                }
              />
            );
          })}
        </ul>
      ) : (
        <p className="ob-empty">No steps yet. {dir} writes them here as the plan takes shape.</p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ side quests */
const PIN: Record<string, string> = {
  todo: 'var(--sun-deep)',
  active: 'var(--sun-deep)',
  done: 'var(--teal)',
  failed: 'var(--coral)',
  stopped: 'rgba(91,82,128,.4)',
};

function SideGrid({ quests, nameOf }: { quests: SideQuest[]; nameOf: Props['nameOf'] }) {
  return (
    <ul className="qb-grid">
      {quests.map((q, i) => (
        <SideCard key={q.goal.id} q={q} i={i} nameOf={nameOf} />
      ))}
    </ul>
  );
}

function SideCard({ q, i, nameOf }: { q: SideQuest; i: number; nameOf: Props['nameOf'] }) {
  const v = q.item
    ? taskCard(q.item, nameOf)
    : ({ mark: 'todo', people: [], status: null, tone: null, problem: null, sr: 'To do:' } as const);
  return (
    // biome-ignore lint/a11y/noNoninteractiveTabindex: each card is one focus stop (design §5, keyboard)
    <li className={`qb-side m-${v.mark} t${i % 4}`} tabIndex={0}>
      <Pin color={PIN[v.mark]} />
      <div className="qb-st">
        <span className="qb-title">
          <span className="sr-only">Side quest. {v.sr} </span>
          {q.goal.text}
        </span>
        <Mark mark={v.mark} />
      </div>
      <div className="qb-who">
        {v.problem ? (
          <Problem problem={v.problem} failed={v.mark === 'failed'} />
        ) : v.mark === 'todo' ? (
          <span className="qb-wait">Waiting</span>
        ) : (
          <People v={v} />
        )}
      </div>
    </li>
  );
}

/** "✓ 4 more side quests done · (faces) Pete, Ava, Scarlett +1 · Show ▾" — unfolds into the same cards. */
function DoneStrip({ quests, nameOf }: { quests: SideQuest[]; nameOf: Props['nameOf'] }) {
  const [open, setOpen] = useState(false);
  if (!quests.length) return null;
  const seen = new Map<string, { id: string; name: string; look?: unknown }>();
  for (const q of quests) {
    const p = q.item ? taskCard(q.item, nameOf).people[0] : undefined;
    if (p && !seen.has(p.id)) seen.set(p.id, p);
  }
  const people = [...seen.values()];
  const names =
    people
      .slice(0, 3)
      .map((p) => p.name)
      .join(', ') + (people.length > 3 ? ` +${people.length - 3}` : '');
  const n = quests.length;
  return (
    <>
      <div className="qb-done">
        <span className="qb-tick" aria-hidden="true">
          ✓
        </span>
        <span>
          {n} more side quest{n === 1 ? '' : 's'} done
        </span>
        {people.length > 0 && (
          <span className="qb-dpeople">
            <span className="ob-faces" aria-hidden="true">
              {people.slice(0, 3).map((p) => (
                <span className="ob-face" key={p.id}>
                  {p.look ? (
                    <Hero agent={{ name: p.name, look: p.look as never }} size={22} />
                  ) : (
                    <Hero ghost size={22} />
                  )}
                </span>
              ))}
            </span>
            <span className="qb-dn">by {names}</span>
          </span>
        )}
        <button type="button" className="ob-more" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? 'Hide ▴' : 'Show ▾'}
        </button>
      </div>
      {open && <SideGrid quests={quests} nameOf={nameOf} />}
    </>
  );
}

/* ------------------------------------------------------------ parts */
/** Work that stopped partway: carry on where it was, or drop it off the board. */
export function GoalActions({
  pid,
  goals,
  label,
}: {
  pid: string;
  goals: Pick<Goal, 'id'>[];
  label: string | null;
}) {
  const [busy, setBusy] = useState(false);
  if (!goals.length) return null;
  const all = async (fn: (goalId: string) => Promise<unknown>, what: string) => {
    setBusy(true);
    try {
      for (const g of goals) await fn(g.id);
    } catch (e) {
      toast(`Couldn’t ${what} — ${isApiError(e) ? e.message : 'try again'}`);
    } finally {
      void invalidate(keys.work(pid));
      setBusy(false);
    }
  };
  const bar = (
    <>
      <Button
        small
        variant="hero"
        disabled={busy}
        onClick={() => void all((id) => studio.projects.resumeGoal(pid, id), 'continue')}
      >
        Continue
      </Button>
      <Button
        small
        disabled={busy}
        onClick={() => void all((id) => studio.projects.cancelGoal(pid, id), 'drop it')}
      >
        Drop
      </Button>
    </>
  );
  if (label === null) return bar;
  return (
    <div className="ob-stopped">
      <span>{label}</span>
      {bar}
    </div>
  );
}

const Pin = ({ color }: { color: string }) => (
  <svg className="qb-pin" viewBox="0 0 20 22" aria-hidden="true" style={{ ['--pin' as string]: color }}>
    <ellipse cx="11" cy="19" rx="6" ry="2" fill="#241a44" opacity=".16" />
    <circle cx="10" cy="9" r="7.5" fill="var(--pin)" />
    <circle cx="7.4" cy="6.4" r="2.2" fill="#fff6e9" opacity=".85" />
  </svg>
);

/** The quest glyphs (parts/quest-glyphs.svg); only #main is used — the server has no side-quest kind yet. */
export const Glyph = ({ id, size = 16 }: { id: 'main'; size?: number }) => (
  <svg className={`qb-g qb-g-${id}`} viewBox="0 0 16 16" width={size} height={size} aria-hidden="true">
    <path d="M3.5 2v12.5" stroke="#241a44" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M4.4 2.6h9l-2.4 3 2.4 3h-9z" fill="#ff9b3d" />
  </svg>
);
